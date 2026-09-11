# Native runtime validation — Phase 10E.1

Validation date: 11 Sep 2026

Phase 10E.1 was a follow-up native GUI sign-off attempt. The required full
interactive workflow was not completed, so this document intentionally does
not claim native GUI sign-off.

## Environment

- OS: Linux desktop, WebKitGTK 2.52.6
- Rust: 1.98.1
- Cargo: 1.98.1
- Node: 24.19.0
- pnpm: 12.3.4
- Native launch: `pnpm --filter @ate05/pos tauri dev`
- Isolated sign-off profile: `/tmp/ate05-native-signoff`
- Disposable native build target: `/tmp/ate05-native-target`
- Temporary dev URL: `http://127.0.0.1:1421`; the environment reported port
  1420 as occupied without a reachable listener

The isolated profile prevented the validation run from touching any existing
ATE05 user database. No production or normal development database was used.

## Native paths

The application identifier is `com.ate05.pos`. On Linux, Tauri resolves the
database to the platform config directory and backups to the platform data
directory:

```text
$XDG_CONFIG_HOME/com.ate05.pos/ate05.db
$XDG_DATA_HOME/com.ate05.pos/backups/
```

When XDG variables are not overridden, those locations resolve to the user's
normal configuration/data directories. Packaged builds use the same identifier
and platform directory strategy.

## Results

### Native launch and startup health

The real Tauri process launched successfully during Phase 10E. Vite started,
Rust compiled, and `target/debug/ate05-pos` opened a native 1200×800 window. No
blank screen or startup panic was observed. The native profile created the
SQLite database, WAL support files, and a validated automatic startup backup.

The database reported migration version 4, `PRAGMA integrity_check` returned
`ok`, and `PRAGMA foreign_key_check` returned no rows. The fresh profile showed
the lock/owner PIN setup screen consistently on launch and relaunch.

### Phase 10E.1 GUI sign-off

Desktop automation reached the fresh first-run setup state, but the automation
window expired before the owner PIN form could be completed. Consequently the
following required native GUI scenarios remain unverified:

- owner PIN setup, sign-in, manual lock, and user switching
- menu item creation/use in POS
- table creation, occupancy, duplicate-order protection, and turnover
- order persistence and kitchen ticket failure/retry across restart
- payment, receipt creation, receipt print failure/retry across restart
- explicit order completion and table release
- inventory receive/issue and attributed movement history
- GUI manual backup and disposable restore
- native Settings permission checks

Application, database, Rust-native, and browser-preview tests remain useful
automated evidence, but they are not a substitute for this native GUI run.

### Backup and recovery

Native startup backup creation and database health were observed in the prior
isolated validation run. Manual backup, restore, and retention correctness are
covered by native Rust tests using real temporary SQLite files, but the GUI
backup/restore workflow was not completed in Phase 10E.1.

### Printing

Physical printer validation not performed. Native TCP formatter and error
behavior are covered by Rust tests with a configured five-second transport
timeout. A local TCP sink was not used in this run.

## Bugs discovered and fixed

No reproducible product bug was discovered during native launch/startup checks,
and no production behavior was changed. The validation environment reported
port 1420 as occupied without a reachable listener; a temporary 1421 dev URL
was used. A stale Cargo target lock was avoided with the disposable target
directory.

## Remaining validation and release blockers

- Complete the interactive native owner setup and login.
- Exercise the full dine-in, kitchen failure/retry, payment/receipt, inventory,
  turnover, restart, and GUI backup/restore workflows.
- Validate with a real network ESC/POS printer before restaurant deployment.
- Verify packaged installers and signing on each target operating system.
- Provide an operational off-device backup/export process.

Browser preview remains a separate development adapter and was not treated as
native evidence.
