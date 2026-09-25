# ATE05 backup and restore

ATE05 stores its authoritative SQLite database as `ate05.db` in the platform-specific Tauri application configuration directory. Local backup files live in the platform-specific application data directory under `backups/`.

## Current `.ate05backup` format

New backups use format version 3. They are single files named `ATE05-<unix-timestamp>-<backup-id>-<kind>.ate05backup`. The container has a readable header that identifies the version and `encryption: none`, followed by a tar payload containing `manifest.json` and `database.sqlite`. The manifest includes a SHA-256 checksum for the database. Restore also checks SQLite integrity, schema compatibility, foreign keys, and the expected tables before replacing the live database.

**Format-v3 backups are not encrypted by ATE05.** The database contents can be read by anyone who obtains the file. Protect exported files and the Google account that stores cloud backups accordingly. The checksum detects accidental or malicious changes; it does not provide confidentiality or authenticate who created the file.

Manual, automatic, and cloud backups created by the current application use format v3. Restoring one does not require an ATE05 recovery credential. Cloud restore requires connecting to the Google account that contains the backup.

## Older backup compatibility

Format-v2 files remain supported for backward compatibility. They use ChaCha20-Poly1305 authenticated encryption, with a random per-backup salt and nonce sequence; the database and manifest remain encrypted inside the file. Format-v2 restore requires the original recovery key saved in the OS credential store on this computer. A replacement computer without that original local key cannot restore these older encrypted files through the current account-only flow.

The earlier directory-based format-v1 is also recognized as legacy plaintext. It is verified and restored without being silently deleted. Newly created backups use format v3.

## Backup and restore behavior

Backup creation takes a SQLite-consistent snapshot, validates it, builds the manifest and archive, writes the artifact to a temporary file, verifies it, and then moves it into place. Restore verifies the artifact and stages the database before applying forward migrations. It creates a safety backup before swapping the live database and keeps a rollback path if the final replacement fails.

The same validation pipeline is used for local and downloaded cloud backups. Downloaded temporary files and staging resources are removed after success or failure. Browser preview reports native filesystem, credential-store, and Google Drive capabilities honestly; it does not simulate a successful cloud restore.

## Google Drive

ATE05 uses the Google Drive `drive.file` scope and manages its backups in the app-created `ATE05 Backups` folder. New cloud backups are format v3 and are not encrypted by ATE05. They can be restored after connecting the same Google account. Previously uploaded format-v2 files remain untouched and listed as backups, but still require their original recovery key for restoration.

OAuth credentials are persisted in the platform credential store. A temporary Drive or network failure does not erase saved credentials. See [Google Drive backup](google-drive-backup.md) for the provider details.
