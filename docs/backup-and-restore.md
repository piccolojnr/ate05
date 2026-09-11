# ATE05 backup and restore

ATE05 keeps its authoritative SQLite database in the platform-specific Tauri application configuration directory as `ate05.db`. It does not store the production database in the repository. Backups are stored in the platform-specific application data directory under `backups/`.

## Backup mechanism

Backups use SQLite `VACUUM INTO` through the native SQLx connection. This creates a consistent SQLite snapshot while the POS is running and accounts for SQLite journaling correctly; the application never copies the live `.db` file directly. After creation, ATE05 opens the snapshot, runs `PRAGMA integrity_check`, verifies the migration metadata, and checks the required V1 tables before reporting success.

## Automatic backups and retention

On native application startup, ATE05 attempts at most one automatic backup per UTC day. A valid backup for the current day is reused. Automatic backups are retained up to the most recent 14 files. Manual and pre-restore backups are not removed by automatic retention. Automatic backup failure is logged as a warning and does not prevent the POS from opening when the primary database is healthy.

## Manual backup

Settings → Data & Backup → Back Up Now creates and validates a manual SQLite snapshot. The UI shows the local database health and the most recent automatic/manual backup. Browser preview clearly reports that it does not create production SQLite files.

Export Backup now uses the native file dialog to write a validated snapshot to a user-selected `.sqlite` destination. The renderer cannot write arbitrary files or copy the live database. The current local backup operation remains useful for same-machine recovery; production operations should additionally keep exported backups on removable or otherwise separate storage.

## Restore procedure

1. Open Settings → Data & Backup.
2. Choose one of the validated backups.
3. Select Restore selected backup.
4. Read the warning and select Confirm restore.
5. A pre-restore safety snapshot is created first.
6. The selected file is validated and copied to a temporary database.
7. The temporary database runs the normal forward migration set and is validated again.
8. The active database connection is closed, the validated database is installed, and the native connection is reopened.
9. Application state is reloaded. Restart ATE05 if the operating system or a future migration requires it.

Restore accepts only a backup filename returned by the native backup list; renderer code cannot submit arbitrary filesystem paths. The safety backup is classified `pre_restore` and is not part of daily automatic retention.

## Schema compatibility and corruption

Backups record the SQL migration version. A backup from a newer application version is rejected with a compatibility error. Older backups are staged and passed through the checked-in forward migrations before installation. Corrupt, incomplete, missing-table, or failed-integrity backups are rejected and never installed.

If the primary database becomes unusable, start ATE05, open Settings, and restore the newest validated backup. If the application cannot open far enough to reach Settings, preserve the application-data directory and contact support before deleting or replacing files; the pre-restore and daily backup files are recovery points.

## Browser/native behavior

Native Tauri mode performs real SQLite snapshots, health checks, and restore operations. Browser preview uses simulated local storage for workflow development and never claims to create or restore a production SQLite file.

## Deferred

Cloud/remote backups, encryption overhaul, automatic remote export, multi-device replication, per-domain exports, and a native file picker for external backup export remain intentionally deferred.
