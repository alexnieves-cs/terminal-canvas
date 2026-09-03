# M70 — Ship 1.1.0

**Branch:** `m70-ship`. **Spec:** `docs/superpowers/specs/2026-09-03-m70-ship-design.md`.
**Plan:** `docs/superpowers/plans/2026-09-03-m70-ship.md`. **Status:** finished 2026-09-03.

## What landed

- `package.json` and the README's status line say `1.1.0`; `verify:meta version.1` pins both.
- README gained **What it looks like** — three of the harness's twenty-five scenes described in
  words (`kinds`, `overview`, `palette-query`). The PNGs stay untracked: `npm run shot`
  regenerates them from the tree in about a minute, and a tracked image is a picture of a tree
  that no longer exists the moment the next milestone merges.
- CLAUDE.md's "What this is" names 1.1 (M70) and the second run in one paragraph.
- `docs/load-bearing.md` gained M69's two rules (the minimap moves the camera only through
  `goToViewport`; the frame's far tiers hide a body, never unmount it) and one manual-only
  bullet: every pixel is manual — M61's harness renders and asserts nothing, and no item on
  the list was struck by it. The list was re-read entire; nothing on it became automated in
  this run.
- Backlog #33 (the minimap) joined the Gone table.
- `graphify`: the full run refused (no LLM key in this environment, 194 documents needing
  semantic extraction); `graphify update .` ran — the code graph is current, the document
  layer is as of the last keyed run. Recorded rather than faked.

## The numbers

- `npm run verify`: exit 0, every suite green, run alone (the tmux verify server killed first).
- `npm run package`: exit 0; `Terminal Canvas-1.1.0-arm64.dmg`, 126584827 bytes (1.0.0's was 121,038,063).
- `npm run verify:packaged`: 12/12 — the bundle, the packaged flag, the login-shell PATH
  recovered, the scratch socket and throwaway user-data dir used, a backend chosen, `tc open`
  answered `{"ok":true,"preset":"shell"}` through the packaged launcher, a PTY spawned, a
  second instance refused, the incumbent and its PTY survived.

## What this run did not do

- Publish, push or tag: the prompt forbids it; the release directory holds the artefacts.
- Strike a manual-only item: the harness sees pixels; a person still has to read them.
