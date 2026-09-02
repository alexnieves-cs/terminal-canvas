# M60 — Ship

**Status:** finished 2026-09-02.
**Branch:** `m60-ship`. **Spec:** `docs/superpowers/specs/2026-09-02-m60-ship-design.md`.
**Plan:** `docs/superpowers/plans/2026-09-02-m60-ship.md`.

One line: `1.0.0`, an icon authored as code, both packaging gates run with their numbers
recorded, and the documents reconciled with the software.

## What landed

- `package.json` → `1.0.0`; the README status line says so and stops calling itself a beta;
  `verify:meta version.1` pins the two together.
- `build/make-icon.cjs` (a dependency-free PNG encoder drawing three terminal panels on a dark
  grid) → `build/icon.png`; `npm run icon` → `build/icon.icns` through `sips` and `iconutil`;
  `mac.icon` in the builder config; `verify:package icon.1` pins that the file exists. The
  PNG reproduces byte for byte from the script.
- README: a "What it does not do" section (no isolation between agents — a worktree is a
  checkout, not a sandbox; unsigned; macOS only; terminal contents not screen-readable;
  what export does not cover). Install no longer says "beta".
- CLAUDE.md's summary describes 1.0; suite counts reconciled; the manual-only list in
  `docs/load-bearing.md` re-read — nothing on it became covered, and three items were ADDED
  (native dialogs and the URL scheme, the launcher under a packaged app, the OS reduced-motion
  preference). The list is longer, honestly: the brief asked for shorter, and the suites
  that would shorten it drive native dialogs no suite here can drive.
- `verify:packaged`: since M48 a first run is the launcher on an empty canvas, so the gate's
  "a PTY spawned at launch" could never pass on a throwaway user-data dir. The harness now acts
  as a user through the packaged app's own `userData/bin/tc open` over its control socket
  (`tc.1`), which is also the first exercise of the launcher's `app.asar.unpacked` path — that
  item leaves the manual-only list.

## The gates, as printed

- `npm run package`: exit 0; `release/Terminal Canvas-1.0.0-arm64.dmg`, 121,038,063 bytes.
- `npm run verify:packaged`, first run: 9/11 — 9 and 11 red for the first-run reason above.
- `npm run verify:packaged`, after the harness drives `tc open`: 12/12 (`tc.1` answered `{"ok":true,"preset":"shell"}`; `[pty] spawned /bin/zsh pid=57323`; the incumbent survived the second launch).

## Not proven

- Signing and notarisation: none (no Developer ID), as the README says.
- A stranger's install on another Mac: manual-only, as it has always been.
