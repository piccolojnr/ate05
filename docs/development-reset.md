# Resetting ATE05 development data

ATE05 intentionally has no reset-all-data button in the application. That
would be too dangerous for a restaurant installation.

For local development, run:

```bash
pnpm dev:reset
```

Close all ATE05 windows first. The script prints the exact directories it will
remove and requires the confirmation phrase `RESET ATE05 DEV DATA`. If the
phrase is not entered exactly, nothing is changed.

The script removes the development SQLite database, SQLite WAL sidecar files,
and the local backup directory. The next launch creates a fresh database and
shows first-run setup again. It does not uninstall ATE05.

Important: Tauri development and packaged builds use the same application
identifier by default. Unless you run development with separate XDG/profile
directories, this script targets the same local data that a packaged ATE05
build would use. Run it only on a development machine and make a backup first.

## Platform locations

The script follows the same platform application-data conventions as the
native client and honors development overrides:

- Linux: `$XDG_CONFIG_HOME/com.ate05.pos/ate05.db` or
  `~/.config/com.ate05.pos/ate05.db`; backups are under
  `$XDG_DATA_HOME/com.ate05.pos/backups/` or
  `~/.local/share/com.ate05.pos/backups/`.
- Windows: `%APPDATA%\\com.ate05.pos\\ate05.db`; backups are under
  `%LOCALAPPDATA%\\com.ate05.pos\\backups\\` (falling back to
  `%APPDATA%` if needed).
- macOS: `~/Library/Application Support/com.ate05.pos/ate05.db`; backups are
  under the same application-data directory.

This is a developer utility only. Never run it against a restaurant database
unless the data has been backed up and wiping that database is intentional.
