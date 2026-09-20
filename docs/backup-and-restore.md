# ATE05 backup and restore

ATE05 stores its authoritative SQLite database as `ate05.db` in the platform-specific Tauri application configuration directory. Local backups live in the platform-specific application data directory under `backups/`.

## `.ate05backup` format

New backups are single opaque files named `ATE05-<unix-timestamp>-<backup-id>-<kind>.ate05backup`.

The file begins with a small readable outer header:

```text
ATE05BK\0
u32 little-endian header length
JSON header
encrypted payload records
```

The outer header contains only non-business cryptographic metadata: format version, `chacha20-poly1305` algorithm identifier, `argon2id` KDF identifier, random salt, random base nonce, timestamp, backup identifier, and app version. Business identifier, staff, transactions, and database metadata remain inside the encrypted payload.

The encrypted payload is a tar archive containing `manifest.json`, `database.sqlite`, and future optional files. It is encrypted in authenticated 1 MiB records with ChaCha20-Poly1305. Each record uses a derived nonce and authenticates the outer header plus its record number as associated data. Temporary files are used so the entire SQLite database is not loaded into memory.

The manifest records format/app/schema versions, business identifier, creation timestamp, backup identifier, database SHA-256, and encryption mode. The SHA-256 covers the plaintext `database.sqlite` entry inside the authenticated payload. AEAD authentication protects the encrypted container; the manifest checksum protects logical payload consistency after decryption.

## Key management and recovery

ATE05 derives the 256-bit encryption key with Argon2id using the owner recovery credential and the random per-backup salt. The recovery credential is never written to SQLite, the manifest, normal settings files, environment files, or the backup file.

On the current machine, ATE05 stores the credential in the OS credential store through the Rust `keyring` crate. The Data & backup screen has an intentional recovery-key setup action. The owner must save the displayed key separately:

> If this computer is lost, this recovery key is required to restore encrypted backups on another computer.

On a replacement installation, the recovery key can be supplied during verify/restore and optionally saved into that installation's OS credential store. Google Drive will only store opaque encrypted files and will not receive the key.

Phase 1.5 uses Argon2id's established default parameters and random salts. Encryption is not silently disabled if secure key storage or encryption fails.

## Creation

1. Create a SQLite-consistent snapshot with `VACUUM INTO`.
2. Validate SQLite integrity, foreign keys, migration metadata, and required tables.
3. Build the manifest and tar payload.
4. Encrypt/authenticate the payload into a temporary `.tmp` file.
5. Verify the completed artifact by decrypting and validating it.
6. Atomically move it to its final `.ate05backup` name.

Automatic and manual backups use the same encrypted format. Automatic failures are reported as backup failures and never fall back to plaintext.

## Verification and restore

Verification checks the outer signature/header, supported format and algorithms, recovery credential, AEAD authentication, safe archive entries, manifest, SHA-256 checksum, SQLite readability, schema compatibility, integrity, foreign keys, and required tables.

Restore decrypts and extracts into a temporary staging directory, validates everything, creates a pre-restore safety backup, applies forward migrations to a staged database, validates it again, then atomically swaps the active database with a rollback path. Failures before the final swap leave the current database untouched. Temporary staging resources are removed on success and failure.

Archive extraction accepts only regular `manifest.json` and `database.sqlite` entries and rejects duplicate, unexpected, absolute, or parent-traversing paths.

## Legacy compatibility

The previous directory-based format is still detected and can be verified/restored. It is marked `verified legacy plaintext` and is never silently deleted. New backups are always encrypted single-file artifacts. Existing legacy backups can be restored first and then re-backed-up into the new format using Back Up Now or Export Backup.

## Browser and cloud boundaries

Browser preview does not claim native filesystem or encrypted-backup capabilities. The local provider owns only artifact enumeration, deletion, and local paths; the backup engine owns snapshotting, encryption, verification, and restore. A future Google Drive provider can upload/download `.ate05backup` files as opaque binary objects without knowing their contents or recovery credential.

## Limitations

- Phase 1.5 has no Google OAuth, Drive API, cloud uploads, downloads, scheduling, or retry logic.
- Recovery depends on the owner preserving the recovery key outside the original machine.
- The OS credential-store backend must be available for automatic/manual backup creation on the installed machine.
- Encryption metadata in the outer header is intentionally readable; business data and the manifest are encrypted.
