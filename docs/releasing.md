# Desktop releases

ATE05 desktop installers are built by GitHub Actions from version tags.

## Create a release

Update the application version in `package.json`, `apps/pos/package.json`,
`apps/pos/src-tauri/tauri.conf.json`, and `apps/pos/src-tauri/Cargo.toml`, commit
the change, then create and push a matching tag. These four files are kept in
sync for the current release process:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The `Release desktop apps` workflow builds four targets in parallel:

- Linux x64: AppImage, Debian, and RPM bundles
- Windows x64: NSIS and MSI bundles
- macOS Intel: DMG/app bundle
- macOS Apple Silicon: DMG/app bundle

The workflow creates a draft GitHub Release and uploads the generated bundles to it. Review the assets and publish the draft when they are ready for testers. Manual workflow dispatch is available for build testing; manual runs upload workflow artifacts without creating a release.

The release page includes operator-oriented first-launch instructions. The OS
installer only installs ATE05; restaurant initialization happens in the
cross-platform first-run wizard.

## Windows MSI prerelease versions

WiX requires a numeric MSI version and cannot derive one from a SemVer suffix
such as `-rc.1`. Keep the aligned application versions as `0.2.1-rc.1`, and set
`bundle.windows.wix.version` in `apps/pos/src-tauri/tauri.conf.json` to `0.2.1.1`.
This overrides only the MSI package metadata; the application and release asset
names retain the SemVer version. NSIS, Linux, and macOS use their existing paths.

When preparing another release, update this numeric override as well: for example,
`0.2.1-rc.2` uses `0.2.1.2`. For a stable release, remove the override so Tauri
derives it from the stable application version. Major/minor components must be
at most 255, and patch/build components at most 65535. Windows Installer compares
the first three components for upgrade ordering, so test the RC-to-stable install
transition rather than relying on SemVer prerelease ordering for MSI.

A rerun of a failed tag workflow still builds that tag's original commit. To
include a packaging fix, prepare and push the next RC version/tag from the fixed
commit; do not move an already-published prerelease tag.

## Signing status

The initial macOS builds are unsigned and may require the tester to approve the app in macOS security settings. Windows signing is also not configured yet. Apple Developer and Windows code-signing credentials can be added later as GitHub Actions secrets without changing the release matrix.
