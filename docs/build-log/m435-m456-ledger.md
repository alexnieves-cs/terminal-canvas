# M435–M456 ledger — redesign, 5.0 to 6.0

Run book: [docs/redesign/RUN.md](../redesign/RUN.md).
Spec: [docs/redesign/CONCEPT.md](../redesign/CONCEPT.md).
Decisions: [docs/redesign/DECISIONS.md](../redesign/DECISIONS.md) (D1–D8, the guide's defaults, locked).
**This ledger is the state.** Phase 0 does not implement a screen.

## Decisions

D1–D8 are recorded in DECISIONS.md and not re-argued here. D8 (version 6.0.0) waits for Phase 5. `package.json` is still 5.0.0. D1's product-rules sentence is [R-001](../redesign/requests.md): F1 does not own `docs/product-rules.md`, so the sentence is filed rather than edited beside the pixels.

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
| P1 F1 | main | — | tokens and the one state colour. Merges before F2 and F3. |

## M436 · F1, tokens and the one state colour

Lane F1. Branch `cursor/f1-tokens-826a` (the cloud run's branch template; the brief's name is `rd/f1-tokens`). `src/shared/state-palette.ts` is the closed set for readers that cannot see a stylesheet. Both theme blocks declare the same `--state-*`, `--external`, `--guide` and `--canvas-grid` names. The `[data-tone]` block reads only `--state-*`. D1's ring is `--glow-iris`. D7 moves tones inside `panel-state.ts` and leaves the words where they were.

### Re-valuations, and why

Dark material follows CONCEPT.md except where check 11 would go red.

| Token | Was (dark) | Now | Why |
|---|---|---|---|
| `--s-0` | `#0b0d11` | `#0b0d12` | Concept canvas. |
| `--s-1` | `#161a21` | `#11141b` | Concept surface. |
| `--s-2` | `#111419` | `#08090d` | Concept ink, and it is the chrome. Darker than the canvas on purpose. |
| `--s-3` | `#1d222b` | `#161a23` | Concept raised surface. |
| `--s-4` | `#262c36` | `#1c2130` | Concept control / the hover ground check 11 measures. |
| `--s-5` | `#303743` | `#262c38` | Pressed only. Not a text ground. |
| `--fg` | `#e7e9ee` | `#e7eaf0` | Concept primary text. |
| `--fg-2` | `#b3b9c4` | `#a8b0be` | Not in the three-level concept. Check 11 still requires 4.5:1, so it sits between primary and muted. |
| `--fg-3` | `#959cab` | `#8c94a5` | Concept muted. Same hex as `--state-idle`. |
| `--fg-4` | `#7b8292` | `#677084` | Concept faint `#5B6375` is 2.66:1 on `--s-4`, under the 3:1 floor. `#677084` is the first cool-bias grey that clears it (about 3.2). |
| `--line` / `--line-strong` | `#252a33` / `#363d49` | `rgba(255,255,255,.07)` / `.12` | Concept hairlines. |
| `--blue`, `--iris` | `#7aa7e8` / `#5ec4d4` | `#5be1e6` | Working cyan. Accent and working are one colour (D1). |
| `--green` | `#6fcf8a` | `#5edc9a` | Finished OK. The M415 inversion ends: idle is no longer this green. |
| `--amber` | `#e8b44c` | `#f5b544` | Needs-you. The only tone that glows. |
| `--red` | `#ef7a7a` | `#ff6b6b` | Failed. |
| `--state-select` | (the 1px `--iris` ring) | `#a6f6ff` | D1. Higher luminance than working. |
| `--external` / `--guide` | (none) | `#a78bfa` / `#ff5fa2` | Not tones. Guides only while arranging. |
| `--canvas-grid` | (none) | `#1b202a` | 24px dots, painted on `.shell`. |
| `--deck-ground` / `--deck-surface` | `#0b0d11` / `#161a21` | `#0b0d12` / `#161a23` | The diorama follows the canvas. |
| glass / bubble / auras | old graphite RGB | the new ramp's RGB, same alphas | Aura alphas stay 0 (M328). `--on-iris` is `#08090d` so ink on `#5BE1E6` clears. |
| `--well` | `#0a0c10` | `#0a0c10` | Unchanged. It matches `terminal/themes.ts`. |

Light surfaces were not copied from the dark hexes. Those hexes fail check 11 on a light ground. Light accents were darkened in the same families until 3:1 holds on `--s-1` and `--s-4`, and white ink on the working cyan clears 4.5: working `#348184`, needs `#9f762c`, done `#3c8c62`, failed `#cd5656`, idle `#777b83`, external `#7d64c4`, guide `#c44778`, select `#668084`. The light dot is `#c3c9d4`. `--violet` stays the family accent in both themes; external purple is the new `--external` token, not a rename of violet. World `--world-*` tokens are untouched. W0 consumes `state-palette.ts` later, and `rd-tone.literal.1` exempts `src/renderer/world/`.

Radii: `--r-md` 6→8, `--r-lg` 8→12, new `--r-region` 20px. `--r-sm` stays 4. `--dur-flight` is 220ms and uses the existing `--ease` (`cubic-bezier(.2, .8, .2, 1)`), which is already the product's ease-out. No second easing token.

`starting` was in the muted colour overrides (rail word, far card, pill, minimap, palette, shape). It now paints `--state-working`, and `.status-dot` for working and starting runs `state-breath` (a scale, not a glow and not a fractional opacity). Asleep keeps the dashed left edge.

### Checks

Watched red before the tokens moved: `verify:rd-f1` was 1/7 (`rd-f1.0` only). Parity, bind, glow, select, literal and d7 failed on the old stylesheet. After the theme blocks moved, a stray `#5BE1E6` in `StatusDot.tsx` failed `rd-tone.literal.1` on that file and was removed.

| Check | Result |
|---|---|
| `npm run verify:rd-f1` | 7/7 |
| `npm run verify:styles` | 97/97, including check 11, `theme.1`, `ground.1`, `motion.2`, `revamp.snap.css.1` |
| `npm run typecheck` | pass (`tsconfig.node.json` and `tsconfig.web.json`) |
| Plain-node wave, 67 suites | 63/67 |
| `verify:rail` | 265/266. `state.2` passes. The only failure is `board.1`: a done work item is tone `done`, and the check still expects `idle`. [R-002](../redesign/requests.md). Words unchanged. |
| `verify:meta` | 52/53. `panels-split.2` (`pre-v7-run` absent). Pre-existing. |
| `verify:first-run` | 28/29. `revamp.create.1`. Pre-existing. |
| `verify:tmux` | fails to load `pty.node`. `npm ci --ignore-scripts` never rebuilt node-pty. Environment. |
| `verify:canvas-sync`, `verify:relay` | green on this Linux run. Listed as known CI WebSocket failures; they did not reproduce here. |
| `npm run build`, Electron tier, `shot`, `verify:visual`, `verify:packaged` | not run. Those scripts invoke `Electron.app/Contents/MacOS/Electron`. |

### Goldens that will change

Do not set `UPDATE_GOLDENS`. Radii, the dark material, the accents, the shell grid and the selection ring move pixels in every painted scene. Phase 4 regenerates them, each with a critic sentence. The 79:

account-menu, across, approval, attention, auto, board, browser, chat, chat-copilot, compact, composer, edge-firing, edge-waiting, file-missing, flip, flowchart, flowchart-dark, flowchart-far, github, graph, group, group-collapsed, header, ink, inspector-activity, inspector-caps, inspector-detail, inspector-tools, inspector-work, integrations, kinds, kinds-dark, launcher, lineup, memory, merged, navigator-files, navigator-panels, navigator-workspaces, orchestration, orchestration-dark, orchestration-watch, orchestration-working, overview, palette, palette-dark, palette-query, plan-approval, queue-hold, reduced-motion, relay, replay, routine, runs, search, search-empty, share-dialog, share-members, shared-canvas, shared-offline, skills, spawn-sheet, start-work, starter, subagents, supervisor, team-ask, teammate, templates, tool-objects, trail, vault, verbs, watcher, wide, workflow, workflow-edit, zoomed-out, zoomed-out-dark.

`rd-f1-tones` has a reference (`docs/redesign/mockups/04-main-workspace.png`) and an intent, and no `run`. `visual.1` does not demand a golden until a `run` exists. The critic's "reads-as" against 04 is a macOS `shot` plus a fresh-context pass. It is not invented here.

After the merge, `verify:rail` `board.1` still expected a done work item to be tone `idle`. The owner asked for that check to follow D7, so it now expects `done`. The word stays `done`. R-002 is closed by that edit.

### Deviations

- Product-rules sentence, high-contrast glass and the terminal cursor are requests R-001, R-003 and R-004. Those files are not F1's. R-002 is closed: `board.1` expects the done tone.
- `--fg-4` is not the concept's `#5B6375`. `--fg-2` exists because check 11 still measures it.
- `--violet` is not `--external`.
- `--well` and the world tokens did not move.
- The shot scene is not painted.

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

- The pill, the dock and the Sessions count do not import the hook yet. F2 does not own `CommandPill.tsx`, `Dock.tsx`, `Canvas.tsx` or the Sessions host, and the host does not exist. `rd-attn.one.1` fails if any of those files grows its own queue, and it fails if `SessionsHost.tsx` appears without importing `useAttentionQueue`. Wiring is R-005 (filed on the F2 branch as R-001; F1 already held R-001 on main).
- `live-session-store.ts` notifies per panel. The hook reads `getLiveSession` when an agent transition or an approval already re-renders it, and it will call `subscribeLiveSessions` when that export exists (R-006, filed as R-002). It does not call `useDecisionInbox`; that hook is built from the old queue.
- `distinctFromClusterPad` widens the two pad constants before comparing them. `tsc` rejects a comparison it can see is `24 !== 28`, and a later edit that made them equal would then compile while the territory and the silhouette collapsed.
