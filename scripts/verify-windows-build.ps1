param([switch]$RequireSigning)

$ErrorActionPreference = 'Stop'
$releaseDir = 'apps/pos/src-tauri/target/release'
$exe = Join-Path $releaseDir 'ate05-pos.exe'
$pdb = @(Get-ChildItem -LiteralPath $releaseDir -Filter '*.pdb' | Where-Object { $_.BaseName -in @('ate05-pos', 'ate05_pos') })
$nsis = @(Get-ChildItem -LiteralPath (Join-Path $releaseDir 'bundle/nsis') -Filter '*setup.exe')
$msi = @(Get-ChildItem -LiteralPath (Join-Path $releaseDir 'bundle/msi') -Filter '*.msi')
if (-not (Test-Path -LiteralPath $exe) -or $pdb.Count -ne 1 -or $nsis.Count -ne 1 -or $msi.Count -ne 1) {
  throw 'Expected the Windows executable, application PDB, NSIS installer, and MSI installer.'
}

$identity = @(
  "commit=$env:GITHUB_SHA"
  "ref=$env:GITHUB_REF_NAME"
  "run=$env:GITHUB_RUN_ID"
  "exe_sha256=$((Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant())"
  "pdb_file=$($pdb[0].Name)"
  "pdb_sha256=$((Get-FileHash -LiteralPath $pdb[0].FullName -Algorithm SHA256).Hash.ToLowerInvariant())"
  "rustc=$(& rustc --version)"
  "nsis_installer=$($nsis[0].Name)"
  "nsis_sha256=$((Get-FileHash -LiteralPath $nsis[0].FullName -Algorithm SHA256).Hash.ToLowerInvariant())"
  "msi_installer=$($msi[0].Name)"
  "msi_sha256=$((Get-FileHash -LiteralPath $msi[0].FullName -Algorithm SHA256).Hash.ToLowerInvariant())"
)

if ($RequireSigning) {
  # Trust only the public certificate from the existing signing step, on this
  # disposable CI runner. Never export or log its private key or PFX material.
  $certificates = @(Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Subject -eq 'CN=RiTech' -and $_.HasPrivateKey })
  if ($certificates.Count -ne 1) { throw 'Expected the RiTech certificate imported by the signing step.' }
  $publicCertificate = [Security.Cryptography.X509Certificates.X509Certificate2]::new(
    $certificates[0].Export([Security.Cryptography.X509Certificates.X509ContentType]::Cert)
  )
  $store = [Security.Cryptography.X509Certificates.X509Store]::new('Root', 'CurrentUser')
  try {
    $store.Open([Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
    $store.Add($publicCertificate)
  } finally { $store.Close() }

  foreach ($artifact in @(
    @{ Name = 'exe'; Path = $exe },
    @{ Name = 'nsis'; Path = $nsis[0].FullName },
    @{ Name = 'msi'; Path = $msi[0].FullName }
  )) {
    $signature = Get-AuthenticodeSignature -LiteralPath $artifact.Path
    if ($signature.Status -ne 'Valid' -or $signature.SignatureType -ne 'Authenticode' -or
        $signature.SignerCertificate.Thumbprint -ne $publicCertificate.Thumbprint -or
        $null -eq $signature.TimeStamperCertificate) {
      throw "The $($artifact.Name) artifact lacks a valid timestamped RiTech Authenticode signature."
    }
    $identity += "$($artifact.Name)_signature=Valid"
    $identity += "$($artifact.Name)_signer=$($signature.SignerCertificate.Subject)"
    $identity += "$($artifact.Name)_timestamp_signer=$($signature.TimeStamperCertificate.Subject)"
    Write-Output "$($artifact.Name): valid timestamped RiTech Authenticode signature."
  }
}

$debugExtensions = @('.pdb', '.ilk', '.dmp', '.dbg', '.debug', '.map')
$extractDir = Join-Path $env:RUNNER_TEMP 'ate05-nsis-inspect'
New-Item -ItemType Directory -Path $extractDir -Force | Out-Null
& 7z.exe x -y "-o$extractDir" $nsis[0].FullName | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the NSIS installer contents.' }
$nsisFiles = @(Get-ChildItem -LiteralPath $extractDir -Recurse -File)
if (@($nsisFiles | Where-Object { $_.Extension -in $debugExtensions }).Count -gt 0) {
  throw 'NSIS installer unexpectedly contains debug files.'
}
$installedExe = @($nsisFiles | Where-Object { $_.Name -eq 'ate05-pos.exe' })
if ($installedExe.Count -ne 1 -or
    (Get-FileHash -LiteralPath $installedExe[0].FullName).Hash -ne (Get-FileHash -LiteralPath $exe).Hash) {
  throw 'NSIS executable does not match the executable retained with its PDB.'
}

$installer = New-Object -ComObject WindowsInstaller.Installer
$database = $installer.OpenDatabase($msi[0].FullName, 0)
$view = $database.OpenView('SELECT `FileName` FROM `File`')
try {
  $view.Execute()
  while ($record = $view.Fetch()) {
    $fileName = ($record.StringData(1) -split '\|')[-1]
    if ([IO.Path]::GetExtension($fileName) -in $debugExtensions) {
      throw 'MSI installer unexpectedly contains debug files.'
    }
  }
} finally { $view.Close() }

$identity += 'installer_debug_files=none'
$identity += 'nsis_exe_identity=match'
$identity | Set-Content -LiteralPath (Join-Path $releaseDir 'windows-build-identity.txt') -Encoding utf8
Write-Output 'Installer debug-file inspection passed; NSIS executable identity matches.'
