# Native runtime validation — Phase 10E

Validation date: 11 Sep 2026

## Environment

- OS: Linux desktop, WebKitGTK 2.52.6
- Rust: 1.98.1
- Cargo: 1.98.1
- Node: 24.19.0
- pnpm: 12.3.4
- Native launch: `pnpm --filter @ate05/pos tauri dev`
- Validation profile: isolated XDG config/data directories under
  `/tmp/ate05-native-validation`

The isolated profile prevented the validation run from touching any existing
ATE05 user database.

## Native paths

The application identifier is `com.ate05.pos`. On Linux, Tauri resolves the
database to the platform config directory and backups to the platform data
directory:

```text
$XDG_CONFIG_HOME/com.ate05.pos/ate05.db
$XDG_DATA_HOME/com.ate05.pos/backups/
```

When XDG variables are not overridden, the platform resolves those locations to
the user's normal configuration/data directories. Packaged builds use the same
identifier and platform directory strategy; the isolated development run used
the disposable paths above.

## Scenarios performed

### Launch and database startup

The real Tauri process launched successfully. Vite started on `127.0.0.1:1420`,
Rust compiled, and `target/debug/ate05-pos` opened a native 1200×800 window. No
blank screen or startup panic was observed. The native profile created:

- `ate05.db`
- WAL shared-memory files
- an automatic backup under the native app-data backup directory

The isolated database reported migration version 4, `PRAGMA integrity_check`
returned `ok`, and `PRAGMA foreign_key_check` returned no rows.

The first-run lock screen rendered the owner PIN setup flow. A second launch
reached the same screen at the configured window size. Automated interaction
with the GUI timed out before completing the first-run form, so the full login
and post-login workflow is not marked complete here.

### Native data and backup validation

The native startup path created the expected app-config and app-data directories,
ran migrations, and created a validated automatic backup. The backup file was
present and the database remained healthy after startup. Manual backup, restore,
and retention were validated by the native Rust backup tests using real temporary
SQLite files, but were not driven through the GUI in this run.

### Operational workflows

The following were not fully completed interactively in the native window during
this validation run: staff login/user switching, order persistence across a GUI
restart, table turnover, payment/receipt flow, inventory mutations, printer
failure/retry, and Settings permissions. Their correctness remains covered by
the application/native/database automated tests and browser workflows, but that
is not a substitute for completing the native GUI scenarios.

### Printing

No physical ESC/POS printer was available. Physical printer validation not
performed. Native TCP formatting/error behavior is covered by Rust tests and the
configured 5-second transport timeout. A local TCP sink was not used in this
run.

## Bugs discovered and fixed

No reproducible native runtime bug was discovered during the launch and startup
validation. No production behavior was changed as a result of the manual GUI
attempt.

## Known limitations and next validation steps

- Complete an interactive native owner PIN setup and normal login.
- Exercise order/table/payment/receipt/inventory persistence through the native
  GUI, including a close and relaunch.
- Exercise failed KOT and receipt printing, then retry after relaunch.
- Perform GUI-driven manual backup and disposable restore verification.
- Validate with a real network ESC/POS printer before restaurant deployment.
- Verify packaged installers and signing on each target operating system.

Browser preview remains a separate development adapter and was not treated as
native evidence.
