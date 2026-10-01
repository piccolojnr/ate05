# Google Drive backup

ATE05 stores cloud backups in the app-managed `ATE05 Backups` folder. Current format-v3 backups are separate `.ate05backup` files and are **not encrypted by ATE05**. Their SQLite contents can be read by anyone who obtains a copy, including someone with access to the Google account or downloaded file. Protect that account and its files accordingly.

Connect the same Google account on another computer to discover and restore format-v3 backups. Existing format-v2 backups remain in Drive and continue to appear in the backup list, but are encrypted and require the original recovery key available on the computer that created them. Recovery-envelope files, if present from an earlier build, are excluded from normal backup listing and do not unlock format-v3 backups.

## OAuth and scope

The native desktop app uses the installed-application authorization-code flow with a loopback callback, the system browser, a random state value, and PKCE S256. It requests exactly:

`https://www.googleapis.com/auth/drive.file`

The `drive.file` scope lets ATE05 create and manage files it creates, including its managed folder, without general access to unrelated Drive files. Folder and backup identity use Drive IDs and app properties, not filename alone.

Access and refresh tokens are serialized in the operating system credential store. On startup, ATE05 loads saved credentials and refreshes an expired access token when possible. A temporary Drive or network check failure leaves saved authorization intact. A missing credential, credential-store error, or invalid/revoked refresh token is reported separately so Settings can explain whether reconnecting is needed.

The desktop OAuth client ID and client secret are read at Rust compile time using `option_env!`, not at application runtime. Supply them to the native build process; setting environment variables on an installed application does not change its compiled configuration. The desktop client secret is embedded in the executable and can be extracted, so it is not a confidentiality boundary. Never commit it or include it separately in logs, manifests, or test fixtures.

## Cloud backup and restore

Manual cloud backup creates and verifies a local format-v3 artifact, then uploads it using a resumable upload. A stable backup ID in Drive app properties allows the provider to reconcile retries rather than create duplicate files. A local backup remains available if upload is offline or fails; its cloud state is surfaced as pending or needs attention.

Cloud restore downloads the selected artifact to a temporary file and passes it through the normal verification, staging, safety-backup, migration, and database replacement pipeline. A format-v3 backup requires the connected Google account but no ATE05 recovery password or key. Format-v2 restore still needs the original recovery key stored locally. Download and restore failures do not replace the live database, and temporary files are cleaned up.

The ordinary backup list excludes recovery-envelope objects left by earlier builds. Remote files are not automatically deleted by local retention or when a local file disappears.

## Developer configuration

1. Enable the Google Drive API in a Google Cloud project.
2. Configure the OAuth consent screen and add test users if the app is in testing mode.
3. Create an OAuth client with application type **Desktop app**.
4. Provide `ATE05_GOOGLE_CLIENT_ID` and `ATE05_GOOGLE_CLIENT_SECRET` to the native development/build process.

The loopback redirect uses a dynamically allocated local port. ATE05 currently requires both credential fields for authorization-code exchange and refresh. Google's installed-app documentation lists `client_secret` as optional and explains that installed applications cannot keep it confidential. Use a **Desktop app** client, not a confidential Web application client. PKCE S256, state validation, the system browser, and OS credential storage remain unchanged. See [Google's installed-app OAuth guidance](https://developers.google.com/identity/protocols/oauth2/native-app).

## Official release configuration

In the GitHub repository, open **Settings → Secrets and variables → Actions**:

1. Under **Variables**, create repository variable `ATE05_GOOGLE_CLIENT_ID`.
2. Under **Secrets**, create repository secret `ATE05_GOOGLE_CLIENT_SECRET`.

If `ATE05_GOOGLE_CLIENT_ID` already exists as a repository secret, the workflow reuses it when the variable is absent; do not create a duplicate. The client secret is always read from repository Secrets, never Variables.

Use the two fields from the same Google **Desktop app** OAuth client. Do not store access or refresh tokens in GitHub. Confirm the Drive API is enabled and the consent screen audience/publishing status is appropriate for production. While the consent screen is in testing, only allowed test users can authorize; this is not a production acceptance substitute.

The release workflow checks only presence and fails before any build job if either setting is empty or whitespace. Values are scoped to the validation step and Tauri build step, not normal PR/CI. They are not written to configuration files or diagnostic manifests. The compiled desktop executable necessarily contains the client configuration.

To check repository configuration without creating a tag, rebuilding RC.4, or publishing anything, run **Release desktop apps → Run workflow** on `main`, enable **Check OAuth configuration without building or publishing**, and leave the existing-release-tag field blank. A successful result proves presence only, not that the client type, credentials, consent screen, or real OAuth flow are valid. Keep Actions debug logging disabled when using production credentials.
