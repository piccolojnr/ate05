[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string] $CertificatePath,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^(?i)[0-9a-f]{40}$')]
    [string] $ExpectedThumbprint
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $CertificatePath -PathType Leaf)) {
    throw "Public certificate file not found: $CertificatePath"
}

$certificate = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($CertificatePath)
$actualThumbprint = $certificate.Thumbprint -replace '\s', ''
$expected = $ExpectedThumbprint -replace '\s', ''
Write-Host "Certificate subject: $($certificate.Subject)"
Write-Host "Certificate thumbprint: $actualThumbprint"

if ($certificate.HasPrivateKey) {
    throw 'Refusing installation: the supplied certificate file contains a private key. Supply only the public CER certificate.'
}
if ($certificate.Subject -ne 'CN=RiTech') {
    throw "Unexpected certificate subject '$($certificate.Subject)'; expected 'CN=RiTech'."
}
if ($actualThumbprint -ne $expected) {
    throw 'Certificate thumbprint does not match ExpectedThumbprint; no trust store was changed.'
}
if ((Get-Date) -lt $certificate.NotBefore -or (Get-Date) -gt $certificate.NotAfter) {
    throw 'Certificate is not currently valid.'
}
if (-not ($certificate.Extensions | Where-Object {
        $_ -is [System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension] -and
        ($_.EnhancedKeyUsages | Where-Object { $_.Value -eq '1.3.6.1.5.5.7.3.3' })
    })) {
    throw 'Certificate does not contain the Code Signing EKU.'
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this script from an elevated Administrator PowerShell session to install in LocalMachine stores.'
}

# A self-signed internal leaf needs its exact identity trusted as a root and
# publisher. The thumbprint check above prevents silently trusting a substitute.
$rootStore = [System.Security.Cryptography.X509Certificates.X509Store]::new('Root', 'LocalMachine')
$publisherStore = [System.Security.Cryptography.X509Certificates.X509Store]::new('TrustedPublisher', 'LocalMachine')
try {
    $rootStore.Open('ReadWrite')
    $publisherStore.Open('ReadWrite')
    if (-not ($rootStore.Certificates | Where-Object Thumbprint -eq $actualThumbprint)) {
        $rootStore.Add($certificate)
    }
    if (-not ($publisherStore.Certificates | Where-Object Thumbprint -eq $actualThumbprint)) {
        $publisherStore.Add($certificate)
    }
}
finally {
    $rootStore.Close()
    $publisherStore.Close()
}

Write-Host 'Installed certificate in LocalMachine\Root and LocalMachine\TrustedPublisher.'
foreach ($storeName in @('Root', 'TrustedPublisher')) {
    $store = [System.Security.Cryptography.X509Certificates.X509Store]::new($storeName, 'LocalMachine')
    try {
        $store.Open('ReadOnly')
        $installed = $store.Certificates | Where-Object Thumbprint -eq $actualThumbprint
        if (-not $installed) { throw "Certificate missing after installation in LocalMachine\$storeName." }
        Write-Host "Verified LocalMachine\$storeName`: $($installed[0].Subject) [$($installed[0].Thumbprint)]"
    }
    finally { $store.Close() }
}
