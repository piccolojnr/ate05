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

## Signing status

The initial macOS builds are unsigned and may require the tester to approve the app in macOS security settings. Windows signing is also not configured yet. Apple Developer and Windows code-signing credentials can be added later as GitHub Actions secrets without changing the release matrix.
