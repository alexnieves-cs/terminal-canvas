# M631: an Intel DMG beside the Apple silicon one, and a Homebrew cask

Tier 0 of the 2026-11-02 plan ("do that for me", 2026-11-09). Stream B's files.

- `electron-builder.config.cjs` reads `TC_MAC_ARCH` (unset is arm64, as before);
  `build/builder-config.cjs` refuses an arch it does not know and exports
  `MAC_DIR`, the one table of electron-builder's per-arch bundle directories.
  `verify:packaged` loads the entry point's config and finds the bundle through
  that table, so the Intel leg launches the Intel app.
- `release.yml`: `build` is a matrix (arm64 on `macos-latest`, x64 on
  `macos-15-intel`), each leg gated by `verify:packaged` on its own chip and a
  `lipo` check that the binary is the chip its name says. `publish` runs once,
  after both, and is the only job that creates the release. Assets:
  `Terminal-Canvas-<version>-<arch>.dmg`, a versionless copy of each, and one
  `SHA256SUMS.txt`.
- `Casks/terminal-canvas.rb`: the repository is its own tap. `version :latest`
  over the versionless names, so no per-release edit.
- `verify:package` `arch.1`–`arch.4`, `cask.1`–`cask.2`.

The cask works from the first release this workflow publishes (the one after
6.1.0): earlier releases have no versionless assets and no Intel DMG.

Not done, and why: auto-update (plan item 0.3). `electron-updater` refuses an
unsigned build on macOS, so it cannot be proved until the Apple secrets exist
(docs/release-signing.md). The update check stays a notice until then.
