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

## F2 · The shared model (M437)

Pure modules. No screen is wired. F1 and F3 were in flight, so this lane did not touch their files, `redesign-contracts.ts`, or `lod.ts`.

`attention-queue.ts` orders one item per panel: approval, question, shell-prompt, failed, recovery, then oldest `since`, then id. The sentence is the caller's `panelState` word. `next` / `prev` wrap the way `attention.ts` walks ⌘J. `useAttentionQueue` is the selector: agent-state transitions, `useApprovals` (the inbox's permission list), and a sample of `getLiveSession`. `task-regions.ts` builds a territory from membership, not from neighbours: union plus 24px, snapped outward onto the 24px grid, radius 20 as a constant (the contract bounds are a rect). A panel in two tasks is not assigned. Moving a region returns one rect plan. `CLUSTER_PAD` stays 28. `zoom-tier.ts` holds Work ≥ 0.70 and Plan ≥ 0.25 with ±0.03 hysteresis, in thousandths so 0.73 is not a float residue. Plan and Map hand every panel to `lod.ts` through `cardIds`. Entering either while a terminal is focused sets `releaseFocus`, the same fact ⌘Esc clears with `setFocusedId(null)`. At plan scale above `LIVE_MIN_SCALE`, a panel that is still focused and not in `cardIds` stays live. `world-space.ts` maps canvas to floor by dividing by 100 (y becomes z). Pitch is 18° / 34° / 78° down from the horizon, and distance is the value that makes the viewport's scale true at that pitch.

The steward fixture is the World room (mockups 11 and 14): three waiting, one failed, four working. Screen 07's Plaid failure is not this moment; Claude on Plaid needs you, and the failure is Codex on pricing. Claude on Infra is the second Infra member so the palette's "Infra · 2" and the working count are the same cast. Recovery is exercised by the queue checks; those mockups have no host-loss. Shot scenes name 04, 06 and 11 and have no `run`, so `visual.1` does not ask for a golden.

### Checks

Linux, Node v22, `npm ci --ignore-scripts` (no Electron binary, no `pty.node`). Watched red first: `verify:rd-f2` exited 1 because esbuild could not resolve the five modules. The comment at the top of `scripts/verify-rd-f2.cjs` records that.

| Check | Result |
|---|---|
| `npm run typecheck` | pass (`tsconfig.node.json` and `tsconfig.web.json`) |
| `npm run verify:rd-f2` | 17/17 pass |
| `npm run verify:styles` | 97/97 pass |
| Plain-node wave (67 suites, no build, no Electron) | 64/67. The three failures are the ones Phase 0 already recorded: `verify:meta` `panels-split.2` (tag `pre-v7-run` absent), `verify:tmux` (`pty.node` never rebuilt), `verify:first-run` `revamp.create.1` (`data-screen-control` on `.canvas-hud`). `verify:canvas-sync` and `verify:relay` passed here. |
| `npm run build`, Electron tier, `shot`, `verify:visual`, `verify:packaged` | not run. Needs the Electron binary and, for shot and visual, macOS. |

### Deviations

- The pill, the dock and the Sessions count do not import the hook yet. F2 does not own `CommandPill.tsx`, `Dock.tsx`, `Canvas.tsx` or the Sessions host, and the host does not exist. `rd-attn.one.1` fails if any of those files grows its own queue, and it fails if `SessionsHost.tsx` appears without importing `useAttentionQueue`. Wiring is R-001.
- `live-session-store.ts` notifies per panel. The hook reads `getLiveSession` when an agent transition or an approval already re-renders it, and it will call `subscribeLiveSessions` when that export exists (R-002). It does not call `useDecisionInbox`; that hook is built from the old queue.
- `distinctFromClusterPad` widens the two pad constants before comparing them. `tsc` rejects a comparison it can see is `24 !== 28`, and a later edit that made them equal would then compile while the territory and the silhouette collapsed.
