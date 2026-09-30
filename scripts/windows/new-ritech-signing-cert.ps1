Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$outputDirectory = Join-Path $repoRoot '.local-signing'
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null

# Refuse to continue unless Git explicitly confirms that this output location is
# ignored. This check occurs before the certificate or key is created.
$ignoreResult = git -C $repoRoot check-ignore -q (Join-Path $outputDirectory 'ritech-codesign.pfx')
if ($LASTEXITCODE -ne 0) {
    throw 'Signing output is not ignored by Git. Fix .gitignore before generating any signing material.'
}

$pfxPath = Join-Path $outputDirectory 'ritech-codesign.pfx'
$cerPath = Join-Path $outputDirectory 'ritech-codesign.cer'
if ((Test-Path $pfxPath) -or (Test-Path $cerPath)) {
    throw "Signing output already exists in $outputDirectory. Move it to protected storage before creating a new certificate."
}

$password = Read-Host 'Enter a strong unique PFX export password (it will not be saved)' -AsSecureString
if ($password.Length -lt 16) {
    throw 'Use a password of at least 16 characters.'
}

$certificate = New-SelfSignedCertificate `
    -Type CodeSigningCert `
    -Subject 'CN=RiTech' `
    -FriendlyName 'RiTech Internal Code Signing' `
    -CertStoreLocation 'Cert:\CurrentUser\My' `
    -KeyAlgorithm RSA `
    -KeyLength 3072 `
    -HashAlgorithm SHA256 `
    -KeyExportPolicy Exportable `
    -NotAfter (Get-Date).AddYears(3)

Export-PfxCertificate -Cert $certificate -FilePath $pfxPath -Password $password | Out-Null
Export-Certificate -Cert $certificate -FilePath $cerPath | Out-Null

Write-Host "Created internal code-signing certificate. Subject: $($certificate.Subject)"
Write-Host "Thumbprint: $($certificate.Thumbprint)"
Write-Host "PUBLIC certificate: $cerPath"
Write-Host "PRIVATE PFX: $pfxPath (protect it and its password; never deploy it to restaurant PCs)"
