# M695 to M698: the 7.0 launch work

7.0 is a signed public launch with a feedback loop. This log covers the parts that can be
built and checked without Apple's certificate: a signed build that installs its own update,
crash reports that read their address from the build, a local tally of what gets used, and the
docs. The Apple Developer account, the secrets, the first signed release and the launch are
Alex's, and are listed at the end.

## M695: a signed build installs its own update

- `src/main/self-update.ts` (pure, run under plain node by `verify:file`) decides whether this
  copy may install and runs the install. A copy may install only when it is packaged, runs from
  an app bundle that is not on a disk image or under App Translocation, passes
  `codesign --verify --strict`, and `codesign --display` shows a `Developer ID Application`
  leaf, a team identifier and the hardened runtime, with no ad hoc signature. Any other copy
  keeps the old behaviour: the notice opens the release page.
- It uses Electron's own `autoUpdater` (Squirrel.Mac). No electron-updater and no new package.
- Nothing downloads before the person says yes. The question says where the files come from,
  that the download is checked against this copy's signature, and that it applies at the next
  start. Only **Download and install** starts it. When the download is ready, a second question
  offers **Restart now**; keep working and it is installed at the next start.
- `update.offerInstall` (on, because it only offers) turns the install offer off; the notice
  then only links to the release. `update.checkOnLaunch` still turns off the check itself.
  Neither is plan-writable.
- One feed per release and per chip, `update-arm64.json` and `update-x64.json`, built by
  `build/update-feed.cjs` and attached to the release they describe. The app reads the feed of
  the exact tag the M123 check found. Squirrel installs whatever version a feed names, older
  ones included, so a feed is never moved or shared between releases.
- `build/builder-config.cjs` adds a zip target beside the DMG; Squirrel installs from the zip.
- `release.yml`: a signed leg checks that `CFBundleVersion` equals the version (electron-builder
  appends a build number when some CI variables are set, and Squirrel compares that number) and
  keeps the zip. The publish job adds the zips and feeds to the release and to `SHA256SUMS.txt`.
  An unsigned release has neither.
- New door `update:install`, a HUD and environment-row action, and the palette's
  **Install update**. The recorded decision in `update-check.ts` is revised, not removed: any
  copy that is not signed still only opens the page.
- Network: the check is the same GET to the GitHub releases API as before. An install adds a
  GET for that tag's feed and a GET for the zip it names, both from the release's GitHub
  download URLs. `docs/release-signing.md` lists them.

Checks: `verify:file` `selfupdate.1` to `selfupdate.4`, `verify:meta` `selfupdate.5`,
`verify:palette` `selfupdate.6`, `verify:package` check 9 and `feed.1` to `feed.5`.

Not run here: Squirrel.Mac and `codesign` need macOS, and the first real update needs two
signed releases (checklist step 6 in `docs/release-signing.md`).

## M696: crash reports read their address from the build

- `src/shared/crash-dsn.ts`: the project's address comes from `TC_CRASH_DSN` at electron-vite
  build time and is defined for main only. Unset means no address, so the toggle still sends
  nothing. A malformed value fails the build.
- `release.yml` passes the repository variable to the step that builds. It is empty until the
  owner sets it.
- The toggle's description names the host when a build has an address, and says nothing is sent
  when it has none.
- The Sentry init also sets a fixed `serverName` (the Node client would otherwise send the
  hostname), keeps no breadcrumbs, sends no client reports, turns logs and metrics off, does not
  include local variables, and drops transactions and logs. The `beforeSend` allowlist and path
  scrubbing are unchanged.
- A privacy note on Settings, Privacy & export, and a new guide page, `docs/guide/privacy.md`,
  published by `build-site`.

Checks: `verify:file` `telemetry.6` and `telemetry.7`, `verify:meta` `telemetry.8` and
`privacy.1`.

## M697: a local tally of what gets used

- `src/main/usage-counts.ts` (pure): a closed table maps the doors that mean a feature to a
  feature name, and a first-run funnel records the first day of a first terminal, agent,
  review, commit and overnight run. Parsing keeps only names on those lists.
- `src/main/usage-store.ts`: one file, `usage-counts.json` in the app's data folder, mode 0600,
  written atomically, coalesced, and flushed at quit. The setting is read at every record.
  With it off, nothing is read or written.
- `src/main/bootstrap/usage-wiring.ts`: the tap wraps `ipcMain.handle` before any handler is
  registered and counts by channel name only. It never sees a call's arguments, and a failed
  record never changes what a door answers.
- `usage.localCounts` on Privacy & export, off by default. Doors `tally:read` and
  `tally:clear`, appended last to `registerIpcHandlers`.
- Palette: **Copy my usage counts** puts the tally's text on the clipboard for the person to
  paste where they choose. **Clear my usage counts** asks first, then deletes the file. Nothing
  in this path makes a network request.
- It counts doors, not clicks: a door that a restore asks counts the same as one a person asks.

Checks: `verify:file` `tally.1` and `tally.3`, `verify:palette` `tally.2` (check 47 now
includes the new destructive row), `verify:meta` `tally.4`.

## M698: the signed dry run checklist and the docs

- `docs/release-signing.md`: "Checklist: once the secrets exist", from the dry run to the
  first update by hand. The Open Anyway steps stay. Its last step lists where they are and says
  to remove them only after a signed release has shipped. The crash-report address and the
  update requests have their own sections.
- `docs/milestones.md`: these rows and a new What's next.
- `CLAUDE.md` says 6.2 shipped and 7.0 is in progress. `CHANGELOG.md` has a 7.0.0 entry
  marked in progress. The version stays 6.2.0 until the release.

## Left for Alex

- The Apple Developer account and the signing secrets: `docs/release-signing.md` steps 1 to 5.
- The dry run, the first signed release and the first update by hand: checklist steps 2 to 6.
- Removing the Open Anyway steps, after a signed release has shipped: checklist step 7.
- The crash-report project and the `TC_CRASH_DSN` repository variable.
- The launch and feedback triage.

Not attempted: the sandboxed overnight default (`docs/streams/vm-lane/MAC-CHECK.md`). It needs
macOS 26 and Apple's container runtime.
