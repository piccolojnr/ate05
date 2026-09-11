# Release blockers

Current items that must be closed before production restaurant deployment:

- **Physical network ESC/POS validation — open.** A real compatible kitchen and
  receipt printer must be tested for initial, addition, cancellation, receipt,
  retry, reprint, timeout, and disconnected-network behavior.
- **Off-device backup export — open.** Local backup/recovery is implemented;
  external file export or an operational process for copying backups off the
  terminal is still required.
- **Native GUI workflow sign-off — open.** Phase 10E and the Phase 10E.1
  follow-up launched the real Linux Tauri runtime and verified paths/startup
  health, but the complete native authentication, sales, turnover,
  payment/receipt, inventory, backup/restore, and restart scenarios remain to
  be completed interactively.
- **Production installers and signing — open.** Windows, Linux, and macOS
  packaging/signing must be produced and tested through CI before distribution.

These are intentionally tracked as release blockers and are not represented as
completed by browser-preview or database-only tests.
