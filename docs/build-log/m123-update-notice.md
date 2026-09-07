# M123 — The update notice: build log

Track B of Act III, a worktree subagent off `m122-product` at 37b4d66. Spec §2 (and §2.1 as
design only) of `docs/superpowers/specs/2026-09-06-m122-m125-product-design.md`; Task 2 of
the plan. Two commits: `check(m123): update.1 — red`, then `feat(m123): …`. The Electron
suites were NOT run here (the main session runs them; `verify:ipc` at 112 is unrun on this
branch), and this log is Track B's own — M124/M125's log is the main session's.

## What auto-swap is not

`electron-updater` refuses to install an unsigned update on macOS, and Act 0 counted three
`Apple Development` identities and zero `Developer ID Application`. So the milestone is a
NOTICE: one GET of the releases feed, three states, a url the user opens by hand, and nothing
downloaded or installed by the app. What a signed 3.1 would do — `autoDownload: false`, the
verb becoming `Install and relaunch`, the relaunch riding M36's tmux durability so every
panel survives the process — is written in the spec's §2.1 and nowhere in code.

## The module

`src/main/update-check.ts` is pure over an injected fetcher (`{ fetch, repo }`) and imports
no `https`; the real fetcher (`https.get`, a 10 s deadline for the whole call, the required
`User-Agent: terminal-canvas`, no redirect following) is written inline in `main/index.ts`'s
handler object, which no suite bundles. The feed is `/repos/<owner>/<repo>/releases` — the
LIST, not `/latest`, so a prerelease is skipped by name and the newest release is chosen by
`compareVersions` (numeric per segment; `3.10.0 > 3.9.1`), never by the feed's row order. A
draft is skipped too. `repoOf` reads `package.json`'s `repository` in both npm shapes. Every
failure is `could-not-check` with its reason in the credential rows' words: `GitHub answered
403 — the unauthenticated rate limit may be spent; try again later`, the fetcher's own
`ENOTFOUND` sentence, `the releases feed could not be read` for a body that is not a JSON
list, and `this build names no GitHub repository in its package.json`.

## The surfaces

`update:check` is the 112th channel (contract first, then both diagrams; `EXPECTED_CHANNELS`
112; both harnesses pass `{ check: async () => could-not-check 'no network in the harness' }`
after the board object; `INERT_UPDATE` in `ipc.ts` refuses by name). The renderer keeps the
last answer in `renderer/session/update-store.ts` — a module-level store in the shape of
`last-line-store.ts`, with a fourth state beside the result's three: `null`, not checked, the
rest state for an app whose launch check is off by default. `updateSentence` is the one
place the words live; three doors read it:

- **`Check for updates…`** — a canvas-group palette row, present always and never disabled
  (offline, the third state IS the answer), subtitle the last answer. It runs
  `PaletteActions.checkForUpdates`, on `EXCLUDED_ACTIONS` as `a network call the user makes
  by hand — never a plan`. The answer lands on the palette's feedback line in the shape
  `beginSetCredential`'s refusal already uses (an input mode with `feedback: true`); on
  `newer` the label is `<v> is out — Open release` and Enter runs `links.open` on the url
  (request shape `{ panelId: '', target }`, the same the board pane uses for a PR link).
- **The launcher's second footer line** (`data-launcher-update`), rendered ONLY on `newer`,
  with an `Open release` control — a launcher that said "up to date" on every fresh install
  is a line nobody reads.
- **`env.update`** in the Environment rows, with four sentences: `not checked`, `up to date —
  3.0.0`, `3.1.0 is out` (the url in the subtitle), `could not check — <reason>`.

The launch-time ask is `Canvas.tsx`'s startup effect, reading `update.checkOnLaunch` the way
`agent.glow` is read (its own `settings.list`, never `settingRows`) and gated on the store, so
a reload asks nothing twice. The setting is boolean, off, under `UPDATES_CATEGORY`, and NOT
`planWritable` — `verify:meta update.1` pins it; the plan's `planWritable` list is unchanged.

## The checks

`verify:file update.1` (the module's every arm over a fake fetcher, and every url the fetcher
saw asserted to be the list), `verify:meta update.1` (the setting as text with comments
stripped FIRST — the entry's own comment says "never planWritable" and the check's first
version failed on the sentence explaining it; no `https` in the module; no real fetcher in any
script — `https.get(`, an `https` import, or a templated `api.github.com/repos/${…}` url; a
recorded fixture body carrying the literal host is not flagged), and `verify:palette update.1`
(the row and the four sentences), added beyond the plan's two because the rows are pure and
the check cost one block.

## Deviations from the plan

- `file-entry.cjs`'s `require('../src/main/update-check.ts')` went in the feat commit, not the
  red one: esbuild fails the whole bundle on an unresolvable require, which aborts every check
  in the suite — the red is `F.checkForUpdate is not a function` instead, which is the right
  reason.
- `verify:palette update.1` is an addition.
- The README row and this log are Track B's; `milestones.1` requires the pair, so a row alone
  would have failed `verify:meta`.

## Unrun here, by the rules

`verify:panels`, `verify:ipc` (now expecting 112), `shot`, `npm run verify`. Run by the main
session after the merge. The manual-only item — a real GET of the real feed, and `Open
release` landing in a browser — is beside the M123 entry in `docs/load-bearing.md`.
