param(
  [switch]$RequireSigning,
  [string]$ReleaseDir = 'apps/pos/src-tauri/target/release'
)

$ErrorActionPreference = 'Stop'
$exe = Join-Path $releaseDir 'ate05-pos.exe'
$pdb = @(Get-ChildItem -LiteralPath $releaseDir -Filter '*.pdb' | Where-Object { $_.BaseName -in @('ate05-pos', 'ate05_pos') })
$nsis = @(Get-ChildItem -LiteralPath (Join-Path $releaseDir 'bundle/nsis') -Filter '*setup.exe')
$msi = @(Get-ChildItem -LiteralPath (Join-Path $releaseDir 'bundle/msi') -Filter '*.msi')
if (-not (Test-Path -LiteralPath $exe) -or $pdb.Count -ne 1 -or $nsis.Count -ne 1 -or $msi.Count -ne 1) {
  throw 'Expected the Windows executable, application PDB, NSIS installer, and MSI installer.'
}

$sourceCommit = & git rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw 'Cannot determine the application source commit.' }
$identity = @(
  "commit=$sourceCommit"
  "ref=$(if ($env:ATE05_RELEASE_TAG) { $env:ATE05_RELEASE_TAG } else { $env:GITHUB_REF_NAME })"
  "run=$env:GITHUB_RUN_ID"
  "pdb_file=$($pdb[0].Name)"
  "pdb_sha256=$((Get-FileHash -LiteralPath $pdb[0].FullName -Algorithm SHA256).Hash.ToLowerInvariant())"
  "rustc=$(& rustc --version)"
  "nsis_installer=$($nsis[0].Name)"
  "nsis_sha256=$((Get-FileHash -LiteralPath $nsis[0].FullName -Algorithm SHA256).Hash.ToLowerInvariant())"
  "msi_installer=$($msi[0].Name)"
  "msi_sha256=$((Get-FileHash -LiteralPath $msi[0].FullName -Algorithm SHA256).Hash.ToLowerInvariant())"
)

if ($RequireSigning) {
  if ($env:GITHUB_ACTIONS -ne 'true') { throw 'Signed verification trusts a public certificate and must run on a disposable GitHub Actions runner.' }
  # Trust only the public certificate from the existing signing step, on this
  # disposable CI runner. Never export or log its private key or PFX material.
  $certificates = @(Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Subject -eq 'CN=RiTech' -and $_.HasPrivateKey })
  if ($certificates.Count -ne 1) { throw 'Expected the RiTech certificate imported by the signing step.' }
  $publicCertificate = [Security.Cryptography.X509Certificates.X509Certificate2]::new(
    $certificates[0].Export([Security.Cryptography.X509Certificates.X509ContentType]::Cert)
  )
  # CurrentUser Root installation can display a confirmation dialog, which is
  # invisible in CI. The elevated disposable runner's machine store is noninteractive.
  Write-Host 'Trusting the public RiTech certificate on the disposable CI runner.'
  $store = [Security.Cryptography.X509Certificates.X509Store]::new('Root', 'LocalMachine')
  try {
    $store.Open([Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
    $store.Add($publicCertificate)
  } finally { $store.Close() }
  Write-Host 'Public certificate trust initialized; verifying signed artifacts.'

}

function Confirm-Signature([string]$name, [string]$path) {
  if ($RequireSigning) {
    $signature = Get-AuthenticodeSignature -LiteralPath $path
    if ($signature.Status -ne 'Valid' -or $signature.SignatureType -ne 'Authenticode' -or
        $signature.SignerCertificate.Thumbprint -ne $publicCertificate.Thumbprint -or
        $null -eq $signature.TimeStamperCertificate) {
      throw "The $name artifact lacks a valid timestamped RiTech Authenticode signature."
    }
    "$($name)_signature=Valid"
    "$($name)_signer=$($signature.SignerCertificate.Subject)"
    "$($name)_timestamp_signer=$($signature.TimeStamperCertificate.Subject)"
    Write-Host "$($name): valid timestamped RiTech Authenticode signature."
  }
}

$identity += @(Confirm-Signature 'nsis' $nsis[0].FullName)
$identity += @(Confirm-Signature 'msi' $msi[0].FullName)

function Get-ExePdbIdentity([string]$path) {
  $bytes = [IO.File]::ReadAllBytes($path)
  $pe = [BitConverter]::ToInt32($bytes, 60)
  $optional = $pe + 24
  $sections = $optional + [BitConverter]::ToUInt16($bytes, $pe + 20)
  $directories = if ([BitConverter]::ToUInt16($bytes, $optional) -eq 0x20b) { 112 } else { 96 }
  $rva = [BitConverter]::ToUInt32($bytes, $optional + $directories + 48)
  $size = [BitConverter]::ToUInt32($bytes, $optional + $directories + 52)
  for ($index = 0; $index -lt [BitConverter]::ToUInt16($bytes, $pe + 6); $index++) {
    $section = $sections + 40 * $index
    $start = [BitConverter]::ToUInt32($bytes, $section + 12)
    $length = [Math]::Max([BitConverter]::ToUInt32($bytes, $section + 8), [BitConverter]::ToUInt32($bytes, $section + 16))
    if ($rva -lt $start -or $rva -ge $start + $length) { continue }
    $directory = $rva - $start + [BitConverter]::ToUInt32($bytes, $section + 20)
    for ($entry = $directory; $entry -lt $directory + $size; $entry += 28) {
      if ([BitConverter]::ToUInt32($bytes, $entry + 12) -ne 2) { continue }
      $record = [BitConverter]::ToUInt32($bytes, $entry + 24)
      if ([Text.Encoding]::ASCII.GetString($bytes, $record, 4) -ne 'RSDS') { continue }
      return "$([Guid]::new([byte[]]$bytes[($record + 4)..($record + 19)])):$([BitConverter]::ToUInt32($bytes, $record + 20))"
    }
  }
  throw 'Executable has no CodeView PDB identity.'
}

function Get-PdbIdentity([string]$path) {
  $bytes = [IO.File]::ReadAllBytes($path)
  if (-not [Text.Encoding]::ASCII.GetString($bytes, 0, 32).StartsWith('Microsoft C/C++ MSF 7.00')) {
    throw 'Expected an MSF 7.0 Windows application PDB.'
  }
  $blockSize = [BitConverter]::ToUInt32($bytes, 32)
  $directorySize = [BitConverter]::ToUInt32($bytes, 44)
  $blockMap = [BitConverter]::ToUInt32($bytes, 52) * $blockSize
  $directory = New-Object byte[] $directorySize
  for ($index = 0; $index -lt [Math]::Ceiling($directorySize / $blockSize); $index++) {
    $block = [BitConverter]::ToUInt32($bytes, $blockMap + 4 * $index)
    [Array]::Copy($bytes, $block * $blockSize, $directory, $index * $blockSize, [Math]::Min($blockSize, $directorySize - $index * $blockSize))
  }
  $streams = [BitConverter]::ToUInt32($directory, 0)
  $streamZeroSize = [BitConverter]::ToUInt32($directory, 4)
  $streamZeroBlocks = if ($streamZeroSize -eq [uint32]::MaxValue) { 0 } else { [Math]::Ceiling($streamZeroSize / $blockSize) }
  $info = [BitConverter]::ToUInt32($directory, 4 + 4 * $streams + 4 * $streamZeroBlocks) * $blockSize
  return "$([Guid]::new([byte[]]$bytes[($info + 12)..($info + 27)])):$([BitConverter]::ToUInt32($bytes, $info + 8))"
}

$pdbIdentity = Get-PdbIdentity $pdb[0].FullName
if ((Get-ExePdbIdentity $exe) -ne $pdbIdentity) { throw 'Build executable and PDB identities do not match.' }
$identity += "pdb_guid_age=$pdbIdentity"

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
if ($installedExe.Count -ne 1 -or (Get-ExePdbIdentity $installedExe[0].FullName) -ne $pdbIdentity) {
  throw 'NSIS executable and PDB identities do not match.'
}
$identity += @(Confirm-Signature 'exe' $installedExe[0].FullName)

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

# Tauri patches and signs a distinct executable for each installer type. Keep
# those exact installed bytes instead of its restored, unbundled build output.
$msiExtract = Join-Path $env:RUNNER_TEMP 'ate05-msi-inspect'
$msiProcess = Start-Process msiexec.exe -ArgumentList @('/a', "`"$($msi[0].FullName)`"", '/qn', "TARGETDIR=`"$msiExtract`"") -WindowStyle Hidden -PassThru -Wait
if ($msiProcess.ExitCode -ne 0) { throw 'Could not extract MSI for executable inspection.' }
$msiExe = @(Get-ChildItem -LiteralPath $msiExtract -Recurse -File -Filter 'ate05-pos.exe')
if ($msiExe.Count -ne 1 -or (Get-ExePdbIdentity $msiExe[0].FullName) -ne $pdbIdentity) {
  throw 'MSI executable and PDB identities do not match.'
}
$identity += @(Confirm-Signature 'msi_exe' $msiExe[0].FullName)
$symbolDir = Join-Path $releaseDir 'crash-analysis'
New-Item -ItemType Directory -Path (Join-Path $symbolDir 'msi') -Force | Out-Null
Copy-Item -LiteralPath $installedExe[0].FullName -Destination (Join-Path $symbolDir 'ate05-pos.exe')
Copy-Item -LiteralPath $msiExe[0].FullName -Destination (Join-Path $symbolDir 'msi/ate05-pos.exe')
Copy-Item -LiteralPath $pdb[0].FullName -Destination $symbolDir
$identity += "exe_sha256=$((Get-FileHash -LiteralPath $installedExe[0].FullName).Hash.ToLowerInvariant())"
$identity += "msi_exe_sha256=$((Get-FileHash -LiteralPath $msiExe[0].FullName).Hash.ToLowerInvariant())"

$identity += 'installer_debug_files=none'
$identity += 'nsis_exe_pdb_identity=match'
$identity += 'msi_exe_pdb_identity=match'
$identity | Set-Content -LiteralPath (Join-Path $symbolDir 'windows-build-identity.txt') -Encoding utf8
Write-Output 'Installer debug-file inspection passed; both installed executable/PDB identities match.'
