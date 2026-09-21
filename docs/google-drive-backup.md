# Google Drive backup (Phase 2)

ATE05 stores cloud backups as opaque, encrypted `.ate05backup` files. The
Google Drive provider never opens, decrypts, or inspects the payload. It only
uploads, lists, downloads, and deletes Drive files.

## OAuth and scope

The native desktop app uses the installed-application OAuth authorization-code
flow with a loopback callback, the system browser, a random state value, and
PKCE S256. The distributed application uses a Google OAuth **desktop client
ID**. A desktop client ID is an identifier. Google’s current token endpoint
also requires the desktop credential’s `client_secret` field for this exchange;
ATE05 accepts it only through build configuration and does not treat it as a
trustworthy secret.

ATE05 requests exactly:

`https://www.googleapis.com/auth/drive.file`

This narrow non-sensitive scope permits ATE05 to create and manage files it
creates, including the visible `ATE05 Backups` folder. It does not grant
general access to unrelated Drive files. The backup folder and its files are
identified by Drive IDs and app properties; names are not the sole identity.

## Credential storage

Access and refresh tokens are serialized only into the OS credential store
through the existing Rust keyring integration. They are not stored in SQLite,
normal settings, localStorage, source, or logs. Disconnecting revokes the
refresh token where possible and removes local authorization state; it does
not delete remote backups.

The Google credential is separate from the ATE05 recovery key. Google never
receives the recovery key, and the recovery key is never sent to a Drive API.

## Cloud flow

Manual cloud backup first creates and verifies the same local encrypted backup
used by local backup, then uploads that file with a resumable upload. The
provider records a stable backup ID in Drive app properties and reconciles by
that ID before creating a new file. A local backup remains successful when a
cloud upload is offline or otherwise fails; it is marked pending and can be
retried later.

Cloud restore downloads to a temporary file and passes that file to the
existing encrypted verification, staging, safety-backup, and atomic database
replacement pipeline. Download, decryption, validation, or restore failure
does not touch the live database. Temporary download files are removed on
success and failure.

## Owner recovery

On a replacement computer, the owner installs ATE05, connects the same Google
account, selects a Drive backup, and supplies the separately retained ATE05
recovery key. The lost computer's keyring is not required. Losing both the
computer and the recovery key makes encrypted backups unrecoverable.

## Developer configuration

1. Create or select a Google Cloud project.
2. Enable the Google Drive API.
3. Configure the OAuth consent screen and add the product name and support
   details required by Google.
4. Create an OAuth client with application type **Desktop app**.
5. Provide the client ID to the native build as `ATE05_GOOGLE_CLIENT_ID` and
   the desktop credential value as `ATE05_GOOGLE_CLIENT_SECRET`.
6. During development, add permitted test users if the consent screen is in
   testing mode. Publishing and Google verification requirements depend on
   the final distribution and requested scopes.

The loopback redirect uses a dynamically allocated local port, so a fixed
production callback URL is not configured in the application. Google currently
requires `client_secret` at its token endpoint for this exchange. For a
desktop application that value is not a trustworthy secret: it must be
provided at build/runtime configuration time and must not be treated as the
security boundary. PKCE, state validation, and secure token storage remain
mandatory. Never commit the value or place it in test fixtures.

## Limitations and Phase 2 boundary

Cloud retention is intentionally conservative in this first provider slice:
remote files are never automatically deleted by local retention or because a
local file disappeared. A later retention job can delete only after explicit
remote reconciliation and confirmation that another valid backup exists.
Retry state is persisted in the OS credential store and surfaced as pending
or needs-attention; a future background lifecycle worker can drain pending
uploads without changing the provider boundary.

No Google Drive scheduling service, Drive-specific retry daemon, OAuth server,
or Google-specific encryption has been added. The next phase can treat an
already-created `.ate05backup` file as an opaque binary object.
