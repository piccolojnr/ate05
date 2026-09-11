# Release blockers

Current items that must be closed before production restaurant deployment:

- **Physical network ESC/POS validation — open.** A real compatible kitchen and
  receipt printer must be tested for initial, addition, cancellation, receipt,
  retry, reprint, timeout, and disconnected-network behavior.
- **Off-device backup export — open for native verification.** Native export
  implementation and file-dialog capability are present, but an actual
  packaged/native export to removable or external storage has not yet been
  verified.
- **Native GUI workflow sign-off — open.** Phase 10E and the Phase 10E.1
  follow-up launched the real Linux Tauri runtime and verified paths/startup
  health, but the complete native authentication, sales, turnover,
  payment/receipt, inventory, backup/restore, and restart scenarios remain to
  be completed interactively.
- **Production installers and signing — open.** Windows, Linux, and macOS
  packaging/signing must be produced and tested through CI before distribution.

## Phase 10G review — 11 Sep 2026

- Linux AppImage startup and Linux bundle metadata were rechecked in an
  isolated profile. The generated Debian payload was inspected, but a true
  system `.deb` install and full GUI onboarding could not be performed because
  this validation environment requires an interactive `sudo` password and its
  headless display could not initialize GTK.
- Windows installer build/install/upgrade validation was not available on this
  Linux host.
- No physical Ethernet ESC/POS printer was available.

These results do not close any of the blockers above. The current build is
appropriate for developer testing; pilot and production status still require
the target-platform and hardware validation listed here.

These are intentionally tracked as release blockers and are not represented as
completed by browser-preview or database-only tests.
