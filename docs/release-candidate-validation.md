# Release Candidate Validation — Phase 10G

Validation date: 11 Sep 2026

This document records evidence from the current Linux validation environment.
It separates automated/package checks from workflows that require an
interactive installed desktop, Windows, macOS, or physical printer.

## Linux package

- Existing artifacts were inspected from `apps/pos/src-tauri/target/release/bundle`.
- The Debian package metadata identifies `ate05-pos` version `0.1.0`, architecture
  `amd64`, publisher `RiTech`, and the expected GTK/WebKit dependencies.
- The package contains the native executable, desktop entry, and application
  icons.
- System installation was not performed: this environment requires an
  interactive `sudo` password and the validation runner cannot provide one.
- The package payload was extracted to `/tmp/ate05-rc-deb-root` for a non-system
  inspection. This is not equivalent to an installed-package test.

## Packaged startup

The previously built AppImage was launched in an isolated disposable profile
and reached native startup. The extracted Debian payload could not be launched
under the available headless display because GTK could not initialize; no
interactive wizard workflow was claimed from that attempt.

The isolated packaged profile used:

```text
/tmp/ate05-rc-deb-profile
```

Production data is not stored in the bundle. With the application identifier
`com.ate05.pos`, Linux native data uses platform application directories, with
the database under the config directory and backups under the data directory.

## Automated evidence

The Phase 10F implementation previously passed the repository checks and built
these Linux artifacts:

```text
ATE05 POS_0.1.0_amd64.AppImage
ATE05 POS_0.1.0_amd64.deb
ATE05 POS-0.1.0-1.x86_64.rpm
```

The packaged startup smoke check confirmed migration version 5, SQLite
integrity `ok`, and a fresh `setup_status` of `not_started` in an isolated
profile. Native Rust/database tests cover backup integrity and setup
transactions, but they do not replace a full GUI sign-off.

## Not completed in this environment

The following remain unverified and are intentionally not marked closed:

- system-installed Debian launch and complete first-run wizard
- AppImage complete onboarding, restart, and persistence workflow
- native GUI backup export through the file dialog
- restore-from-export through the native file dialog
- upgrade/reinstall data preservation
- Windows installer build/install/upgrade validation
- macOS validation (not a current V1 deployment target)
- real Ethernet ESC/POS kitchen and receipt printer validation
- cutter behavior on physical hardware

## Release readiness

The current evidence supports developer testing with the existing Linux build.
It does not support an internal restaurant pilot sign-off or production
deployment sign-off until the native GUI workflow, packaged installer, and
hardware checks are completed on the target environment.
