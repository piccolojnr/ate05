# Windows code signing for internal deployments

Windows currently warns because the Windows release is not Authenticode-signed. The `publisher: RiTech` value in Tauri configuration is package metadata; it does not prove who built the executable.

## What signing does (and does not do)

- **Application metadata publisher** is descriptive installer/package metadata and can be set by an application author.
- **Authenticode signing** cryptographically identifies the signer and detects changes to the signed file. Windows validates the certificate chain, validity period, and signature.
- **SmartScreen reputation** is a separate Microsoft service signal. An internal self-signed certificate trusted on controlled PCs does not create public SmartScreen reputation or suppress warnings on other PCs.
- **Defender and other malware scanning** remain active. Signing is not an antivirus exemption and this process adds no exclusions or security bypasses.

## Internal trust model

The signing private key is held by the release process using GitHub Actions encrypted repository secrets. The Windows runner imports the PFX temporarily, and Tauri's Windows signing configuration selects that certificate by thumbprint. Tauri v2's Windows signing applies Authenticode signatures to the application executable and generated Windows installer executables (NSIS setup and MSI) when configured. GitHub Release assets are therefore signed after signing is enabled.

Restaurant PCs receive only the public `.cer` certificate, never the PFX, private key, or password. The installer script pins the expected SHA-1 certificate thumbprint provided by the deployment operator and installs the exact certificate in LocalMachine Root and TrustedPublisher. Because this is a self-signed internal certificate, adding it as a root explicitly grants trust to that certificate; distribute its thumbprint through a separate trusted channel.

The workflow is currently **prepared but disabled**. It only imports a certificate and requests signing when the repository Actions variable `WINDOWS_CODE_SIGNING_ENABLED` is exactly `true`. Until that variable is enabled, Windows releases continue unsigned. Once enabled, missing secrets fail the Windows job. Linux and macOS jobs do not read these signing secrets.

## Certificate generation

Use Windows PowerShell on an organization-controlled machine:

```powershell
& .\scripts\windows\new-ritech-signing-cert.ps1
```

The script checks Git ignore rules before creating files, creates `.local-signing/` as needed, and interactively prompts for a unique PFX password (minimum 16 characters). The password is not written to a file or printed. Do not proceed if Git does not report the output as ignored. The certificate uses RSA 3072, SHA-256, Code Signing EKU, publisher subject `CN=RiTech`, and a three-year validity period. Three years limits exposure from a locally managed internal key while avoiding frequent rotation; shorter periods reduce exposure further but require more operational renewal and PC trust updates. A longer-lived certificate should not be chosen merely for convenience.

The certificate private key is created in the Windows current-user certificate store. Exported files are:

| Classification | Material                                       | Handling                                                                                                                                                                                                                                               |
| -------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **PRIVATE**    | Private key, `.pfx` / `.p12`, and PFX password | Never commit, email, put on client PCs, or leave on an ordinary workstation. Transfer through an approved secure channel to the protected release-secret process, then remove transient local copies and protect/backup the authoritative key offline. |
| **PUBLIC**     | `.cer` public certificate and thumbprint       | May be distributed to controlled PCs, but confirm its thumbprint with a separate trusted channel before installing.                                                                                                                                    |

All common certificate/private-key extensions and `.local-signing/` are ignored. Verify before generating or handling files:

```powershell
git check-ignore -v .local-signing/ritech-codesign.pfx .local-signing/ritech-codesign.cer
```

The script stops rather than creating artifacts if the PFX path is not ignored. It will not overwrite existing output. Certificate generation has not been run as part of this repository change: it requires you to choose and enter a password and control the resulting private key.

## GitHub Actions secrets and enablement

After securely generating the certificate and approving how its private material will be protected, add these **repository Actions secrets**:

- `WINDOWS_CERTIFICATE`: Base64 encoding of the PFX bytes (single-line Base64).
- `WINDOWS_CERTIFICATE_PASSWORD`: PFX export password.

For example, on a secured Windows machine, encode without printing the private key or password:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('.local-signing/ritech-codesign.pfx')) | Set-Clipboard
```

Paste the clipboard directly into the `WINDOWS_CERTIFICATE` secret form. Never paste it into a terminal, issue, source file, or workflow log. Add the password directly in the GitHub secret form, not in a shell command. Restrict repository access and workflow modification privileges: a workflow change executed with these secrets can use the signing identity. Enable signing only after both secrets are present by setting repository Actions variable `WINDOWS_CODE_SIGNING_ENABLED` to `true`. Do not set it before both secrets are ready. A signing-enabled Windows build fails if import/signing setup fails; no unsigned fallback is intended in that mode.

The workflow writes the thumbprint-specific Tauri v2 Windows settings to a temporary generated config and removes the temporary PFX from the runner. The thumbprint is certificate metadata, not a secret. The configuration uses SHA-256 and a timestamp service so signatures can remain verifiable after certificate expiry, subject to timestamp-service availability. If timestamping fails, the Windows build must fail; do not publish it as signed.

## Install the public certificate on a restaurant PC

Obtain the public `.cer` and its expected thumbprint through the approved deployment channel. Review both with the administrator and run elevated PowerShell:

```powershell
Get-AuthenticodeSignature .\path\to\ATE05-installer.exe | Format-List Status,StatusMessage,SignerCertificate
certutil -dump .\path\to\ritech-codesign.cer
& .\scripts\windows\install-ritech-signing-cert.ps1 `
  -CertificatePath .\path\to\ritech-codesign.cer `
  -ExpectedThumbprint 'REPLACE_WITH_VERIFIED_40_HEX_THUMBPRINT'
```

The script requires Administrator privileges, validates the public certificate file, exact `CN=RiTech` subject, Code Signing EKU, validity period and pinned thumbprint, and refuses a certificate containing a private key. It displays the subject and thumbprint before installation and verifies the entries afterward. Only the public certificate is installed.

## Verify released files

Run on Windows for each downloaded `.exe` installer and, after installation, the app executable (typically under `%LOCALAPPDATA%\Programs\ATE05 POS\`):

```powershell
$signature = Get-AuthenticodeSignature '.\ATE05 POS_0.2.0_x64-setup.exe'
$signature | Format-List Status, StatusMessage, Path
$signature.SignerCertificate | Format-List Subject, Thumbprint, NotBefore, NotAfter, HasPrivateKey
```

The expected result is `Status: Valid`, signer subject `CN=RiTech`, and the thumbprint published by the deployment operator. `HasPrivateKey` should be false for a certificate loaded from a public CER/signature. For a second Windows-native check:

```powershell
signtool.exe verify /pa /v '.\ATE05 POS_0.2.0_x64-setup.exe'
```

Repeat against the installed application executable. Do not infer signing from Tauri metadata, workflow success, or a certificate merely being present: verify the actual downloaded artifact. Signing has not yet been tested against an actual signed Windows release.

## Renewal, rotation, and incident response

Plan renewal well before the three-year expiry. Generate a new identity, review/pin its new thumbprint, update the protected PFX and password secrets, and deploy the new public certificate to controlled PCs. Keep overlap only as long as required by rollout; remove the old trust entry after all installations have migrated. The workflow derives its thumbprint from the currently imported PFX, so no release code redesign is needed.

If the private key or password is suspected compromised, stop signing immediately: disable `WINDOWS_CODE_SIGNING_ENABLED`, remove/rotate the secrets, revoke/remove the compromised certificate trust where possible, investigate published artifacts and runner/workflow access, and issue a new identity. Re-sign and redistribute verified releases. A self-signed internal identity has no public CA revocation service, so client trust removal and controlled redeployment are essential.

## Future public signing / Store migration

The signing setup is isolated to the Windows job and Tauri's Windows signing configuration. A publicly trusted certificate can replace the internal PFX by changing the protected signing material and, if needed, the signing backend/command; Linux and macOS remain unchanged. A public certificate can reduce unknown-publisher warnings but does not guarantee SmartScreen reputation. Microsoft Store packaging/signing and submission can be added later as a separate distribution stage; this workflow does not publish to the Store.
