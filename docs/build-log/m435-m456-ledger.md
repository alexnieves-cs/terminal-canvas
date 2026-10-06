# M435–M456 ledger — redesign, 5.0 to 6.0

Run book: [docs/redesign/RUN.md](../redesign/RUN.md).
Spec: [docs/redesign/CONCEPT.md](../redesign/CONCEPT.md).
Decisions: [docs/redesign/DECISIONS.md](../redesign/DECISIONS.md) (D1–D8, the guide's defaults, locked).
**This ledger is the state.** Phase 0 does not implement a screen.

## Decisions

D1–D8 are recorded in DECISIONS.md and not re-argued here. D8 (version 6.0.0) waits for Phase 5. `package.json` is still 5.0.0. D1's product-rules sentence waits for F1, in the same commit as the pixels.

## Phase 0 (M435)

The run kit, the contracts, the ownership map, the CSS / shot / verify seams, and the Claude Code kit. No foundation module, no token re-value, no screen.

### Baseline

Taken on Linux (this agent), not on the macOS CI machine. `npm ci --ignore-scripts` (no native node-pty rebuild, no Electron binary in this environment). Node v22.14.0.

| Check | Result |
|---|---|
| `npx tsc -p tsconfig.node.json --noEmit` and `tsconfig.web.json` | pass |
| `npm run verify:styles` | 97/97 pass |
| `npm run verify:meta` | 52/53. Only `panels-split.2` fails: tag `pre-v7-run` is not in this clone and not on `origin`. Pre-existing. |
| Plain-node wave (`verify-all` concurrent, 67 suites) | 64/67. Failures below. The 16 `verify:rd-*` stubs are in the 64. |
| `npm run verify:tmux` | fails to load `pty.node`. `npm ci --ignore-scripts` never rebuilt node-pty. Environment, not this diff. |
| `npm run verify:first-run` | 28/29. `revamp.create.1` fails because `CanvasHud` renders `data-screen-control` on `.canvas-hud`, and the check wants `/^<div class="canvas-hud">/`. `CanvasHud.tsx` is not in this diff. Pre-existing. |
| `npm run build`, Electron tier, `shot`, `verify:visual`, `verify:packaged` | not run. No Electron binary here. |

Re-run after merging `origin/main` at `7556aeec` (M431–M434): typecheck pass, `verify:styles` 97/97, plain wave 64/67 with the same three failures (`panels-split.2`, missing `pty.node`, `revamp.create.1`). `rd-own.1` still passes with `WorldCardBody.tsx` and `WorldMinimap.tsx` added to the lanes that already own those waves.

Electron-tier suites (`verify:pty`, `verify:pty-manager`, `verify:window`, `verify:ipc`, `verify:canvas`, `verify:xterm`, `verify:panels:*`, `npm run shot`, `verify:visual`, `verify:packaged`) need macOS, the Electron binary and tmux. A red in that tier on a later Mac baseline is pre-existing if it reproduces on `pre-redesign` without these files.

### Deviations from GUIDE.pdf (the code won)

- Integration branch. The guide cuts `redesign/main` from tag `pre-redesign` and lands Phase 0 there. This phase landed as one pull request onto `main`, which is what the owner asked for. Tag `rd-p0` on the merge, then cut `redesign/main` if later lanes should stay off releasable main. `scripts/redesign/lane.sh` still takes an explicit base (`rd-p0`).
- `StateTone` is declared in `src/shared/redesign-contracts.ts`, not re-exported from `panels/panel-state.ts`. `shared/` does not import `renderer/`.
- Shot filter. `SHOT_ONLY` already existed. `TC_SHOT_ONLY` is accepted as the same filter, and wins if both are set.
- Planned `rd-*` scenes are not painted. `visual.1` counts a redesign scene only after it grows a `run` key, so Phase 0 does not add a golden. The guide's "shot.cjs concatenates" is the spread of scenes that have `run`.
- Mockups were extracted from GUIDE.pdf (1600×1000 JPEG, re-encoded to PNG). The original 1440×900 PNGs were not in the workspace. The critic judges reading, not pixels.
- When Phase 0 was written, `WorldFlat.tsx`, `WorldCardBody.tsx` and `WorldMinimap.tsx` were absent. Main then landed them (M431 flat room, M434 room minimap) and this branch merged that in. W6 owns the existing `WorldFlat.tsx` and extends it. `WorldCardBody.tsx` is the shared plain-DOM card half (W0, W2, W4 own it in their waves; W6 reads it and files a request to change it). `world-minimap.ts` plus `WorldMinimap.tsx` are the room's plan map (W3). They are not the canvas `MinimapOverlay`. The canvas camera wedge stays a request if it needs that overlay.
- `src/main/bootstrap/*` is not given to L-A as a directory. The composition root stays the lead's. L-A gets a new `boot-progress.ts`. `boot:progress` is a comment in `ipc-contract.ts`, not a channel.
- Undo after Approve (W5) is not decided. D1–D8 do not pick it. W5 files a request before coding it.
- Notification hook. `osascript` runs when it exists. On Linux the hook is a no-op so a missing binary does not fail the session.
- `verify:meta` check 7 used to forbid every tracked file under `.claude/`. The kit has to be committed for Claude Code, so the check now allowlists `agents/`, `commands/`, `hooks/` and one `settings.json` with no home path. `.gitignore` ignores the rest of `.claude/`.

### Merge table

| Wave | Into | Tag | Notes |
|---|---|---|---|
| P0 | main (this PR) | `rd-p0` after merge | kit only |

## M438 · F3 shell frame

Branch `cursor/f3-frame-13d9`, cut from `rd-p0`. Merges last, after F1 then F2, and rebases onto F2 before that merge. `package.json` stays 5.0.0 (D8).

### What landed

- Top nav is Canvas | Sessions | Review (D2). Orchestrate stays inside `.shell__center-toggle` so the panels harness can still `dispatchEvent` on `[data-seg="orchestration"]`, and the F3 stylesheet clips it out of the tab. The doors a person uses are the View menu row (title "Show Orchestrate"), the Sessions header link, and the existing palette row. People stays conditional.
- `src/shared/shortcuts.ts` is the one list: every CONCEPT.md "Key interactions" chord plus today's chords, with `SHORTCUT_HANDLERS` beside the Phase 0 `ShortcutDef` (the contract has no handler field and was not edited). ⌘⌥T is `tidy-alias` (`aliasOf: 'tidy'`). The menu's seven accelerators come from `electronAccelerator`, byte-for-byte the strings they already showed, including Tidy's ⌘⌥T.
- Focus lock is ⌘⇧L. `canvasChordStandsDown` is true for every canvas chord except that one while a panel is locked. `useKeyboardNav` and `useShellChrome` return before `preventDefault` when `yieldsToTerminal` is true, so their chords reach the terminal. The lock mark is `.panel[data-focus-lock]::after` in the F3 CSS span, stamped from `useKeyboardNav`. Canvas's `shouldIgnoreKeys` and the palette's ⌘K handler are other lanes' files — R-002 and R-003.
- Title bar (D3): centred segments, session count that is silent at zero (`sessionCountLabel(7) === '7 sessions'`), search label "Find or run anything" with the old sentence kept as the title, no dollar amount. Sessions badge uses `waiting` until `ATTENTION_QUEUE_WIRED` flips.
- The pill's new line is `attentionPillLine`. `pillRestState` still says "N panels need you", so `verify:pill` stays on that sentence. "+ New" calls `beginStartWork`. The queue import is a stub in `command-pill.ts` (`ATTENTION_QUEUE_WIRED = false`) until the rebase onto F2 swaps it for the real hook. The composite rest renders only when the queue is non-empty, so the existing `[data-pill-rest]` button stays the one the panels suite presses.
- `SessionsHost` and `ReviewHost` are empty. TopBar portals them into `.shell` so Sessions is not a blank fade. R-006 asks Canvas to mount them.

### Checks

Watched red first: `verify:rd-f3` was 1/12 (only `rd-f3.0`) before `shortcuts.ts` and the hosts existed.

| Check | Result |
|---|---|
| `npm run verify:rd-f3` | 12/12 |
| `npx tsc -p tsconfig.node.json --noEmit` | pass |
| `npx tsc -p tsconfig.web.json --noEmit` | fail, one error: `Canvas.tsx:4074` `from` is `'canvas' \| 'orchestration'` and `CenterView` now includes sessions and review. Not this lane's file. R-001. |
| `npm run verify:styles` | 97/97 |
| `npm run verify:pill` | 13/13 |
| `npm run verify:world` | 249/249 |
| `npm run verify:layout` | 286/286 |
| `npm run verify:verbs` | 30/30 |
| `npm run verify:orchestration` | 145/145 |
| `npm run verify:toast` | 10/10 |
| `npm run verify:account` | 61/61 |
| `npm run verify:meta` | 51/53. `panels-split.2` is the pre-existing missing `pre-v7-run` tag. `visual.1` is this lane: `rd-f3-titlebar` and `rd-f3-pill` have `run` and no golden. Goldens are the lead's after a person has looked. `UPDATE_GOLDENS` was not set. |

Not run (no Electron binary, `npm ci --ignore-scripts`, no `pty.node`): `verify:panels` (including the `.shell__center-toggle` / `.shell__merge` / View menu checks, and `dock.dup.1` which will see the clipped Orchestrate segment — R-007), `verify:canvas`, `verify:xterm`, `verify:window`, `npm run shot`, `verify:visual`, `verify:packaged`, `verify:tmux`. Known pre-existing and not re-counted as this lane: `verify:first-run` `revamp.create.1`, `verify:canvas-sync` and `verify:relay` WebSocket errors.

### Deviations

- Orchestrate remains a clipped segment inside the control. Removing the node would break the harness clicks. `dock.dup.1` wants that segment painted (`elementFromPoint`); R-007.
- Sessions and Review do not persist. The settings enum is still `canvas | orchestration` (L-E). R-004.
- ⌘0 / ⌘1 in `useViewport` were not retargeted. The registry names the concept chords. R-005. The menu still shows ⌘⌥T, not ⌘⇧T.
- The pill line says "agents"; `pillRestState` still says "panels". Two sentences on purpose, so the redesign line and the existing checks do not share a wording.
- Session count is observed from terminal and chat panels on a 1s tick unless `sessionCount` is passed. R-006.
- Extra avatars are the other signed-in accounts' initials. The mockup's AN/MK are teammates; presence is not on this bar.
- Live status, the world toggle and the View menu stay. The mockup crop does not show them. D6 keeps World as a lens, not a tab.
- No `TC_FIXTURE`. R-008. Shot scenes call `loadMain()` only.
- Hosts are portaled from TopBar, not mounted by Canvas. R-006.
