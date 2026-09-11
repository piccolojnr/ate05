# Installing ATE05 POS

ATE05 POS is an offline-first desktop restaurant point of sale. The supported
release artifacts are produced by the GitHub Actions release workflow for
Linux, Windows, and macOS.

## Requirements

- A supported 64-bit desktop operating system.
- Write access to the application's platform data directory.
- A local network connection only when using a network ESC/POS printer.

The application does not require internet access to sell, take payment, or use
the local SQLite database.

## Download and install

Download the artifact for the operating system and CPU shown on the GitHub
Release page. Linux releases include AppImage, Debian, and RPM bundles when
the runner can produce them. Windows uses the NSIS/MSI bundles and macOS uses
DMG/app bundles.

Install the application using the normal operating-system flow. The installer
contains application files only; it does not ask for restaurant name, PIN,
tables, menu, or printer settings.

## First launch

On a fresh installation, ATE05 opens the first-run wizard. Enter the restaurant
and owner details, choose an editable starter menu or Start empty, choose an
initial table count, review, and finish. Set a private 4–6 digit owner PIN.
Printers may be skipped and configured later in Settings.

After setup, ATE05 opens the normal staff lock screen. Use the owner PIN to
sign in. See [first-run-setup.md](first-run-setup.md) for the setup state and
resume behavior.

## Backups and upgrades

Use Settings → Data & backup for local backups and Export Backup to write a
validated SQLite snapshot to a USB drive or other external location. Do not
treat uninstalling/reinstalling as a backup strategy.

Installing a newer version over an existing installation must preserve the
platform application-data directory. Database migrations update the existing
SQLite file; do not replace it with a bundled database.

## Data locations

The application identifier is `com.ate05.pos`. Platform-specific Tauri app
configuration/data directories hold the database and backups. Development
validation may override these locations with XDG variables; packaged builds do
not use `/tmp`.

## Troubleshooting

- If the first-run wizard appears on an existing installation, stop and make a
  backup before continuing.
- If a printer cannot be reached, finish setup and configure/retry it later;
  saved kitchen tickets and receipts remain recoverable.
- If the database health check requires recovery, use a validated backup from
  Settings and follow the restore confirmation flow.
- Keep at least one validated backup outside the computer used for sales.

## Signing status

Unsigned artifacts may require operating-system approval. Production code
signing and notarization are not considered complete until credentials-backed
artifacts are built and installed on the target platforms.
