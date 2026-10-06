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
| P1 F3 | main (PR 6) | — | shell frame, after F1 and F2. |
| P3a W0 | redesign/main | — | night studio, `5353e47f` |
| P3b W2 | redesign/main | `rd-w3b` | the room, `695a71da`. The mount marks stay. W1 and W3 are wired beside them. |
| P3b W1 | redesign/main | `rd-w3b` | the transition, after W2, `aa0b55a5`. The mount is `2a24f561`. R-041, R-042 and R-043 landed with it. |
| P3b W3 | redesign/main | `rd-w3b` | the overview, after W1, `613d72b9`. The camera apply is `252fc68c`. |

## M438 · F3 shell frame

Branch `cursor/f3-frame-13d9`, cut from `rd-p0`, then merged with `main` at `fba024f2` (F2). `package.json` stays 5.0.0 (D8).

### What landed

- Top nav is Canvas | Sessions | Review (D2). Orchestrate stays inside `.shell__center-toggle` so the panels harness can still `dispatchEvent` on `[data-seg="orchestration"]`, and the F3 stylesheet clips it out of the tab. The doors a person uses are the View menu row (title "Show Orchestrate"), the Sessions header link, and the existing palette row. People stays conditional.
- `src/shared/shortcuts.ts` is the one list: every CONCEPT.md "Key interactions" chord plus today's chords, with `SHORTCUT_HANDLERS` beside the Phase 0 `ShortcutDef` (the contract has no handler field and was not edited). ⌘⌥T is `tidy-alias` (`aliasOf: 'tidy'`). The menu's seven accelerators come from `electronAccelerator`, byte-for-byte the strings they already showed, including Tidy's ⌘⌥T.
- Focus lock is ⌘⇧L. `canvasChordStandsDown` is true for every canvas chord except that one while a panel is locked. `useKeyboardNav` and `useShellChrome` return before `preventDefault` when `yieldsToTerminal` is true, so their chords reach the terminal. The lock mark is `.panel[data-focus-lock]::after` in the F3 CSS span, stamped from `useKeyboardNav`. Canvas's `shouldIgnoreKeys` and the palette's ⌘K handler are other lanes' files — R-008 and R-009.
- Title bar (D3): centred segments, session count that is silent at zero (`sessionCountLabel(7) === '7 sessions'`), search label "Find or run anything" with the old sentence kept as the title, no dollar amount. The Sessions badge is F2's queue length.
- The pill's new line is `attentionPillLine`, fed by F2's `useAttentionQueue`. `pillRestState` still says "N panels need you", so `verify:pill` stays on that sentence. "+ New" calls `beginStartWork`. The pill publishes one census from the panel list; the dock badge, the Sessions badge and `SessionsHost` read that same list. The composite rest renders only when the queue is non-empty, so the existing `[data-pill-rest]` button stays the one the panels suite presses while nothing is waiting. `taskId` is null and `since` is 0: membership and the clock live on Canvas, which this lane does not own. The dock's aria-label still uses the snooze-aware count, because the queue does not know snooze, and team asks are not a queue kind (R-005 stays open for that remainder).
- `SessionsHost` and `ReviewHost` are empty. TopBar portals them into `.shell` so Sessions is not a blank fade. `SessionsHost` calls `useAttentionQueue` so it does not invent a second list. R-012 asks Canvas to mount the hosts.
- `openFocusTask`'s `from` in `Canvas.tsx` maps Sessions, Review and People back to the canvas, the same way `team` already did. Canvas is outside F3's ownership. The owner required the web typecheck to pass before merge, so this one assignment is the exception. R-007 is closed by it. Nothing else in that file moved.

### Checks

Watched red first: `verify:rd-f3` was 1/12 (only `rd-f3.0`) before `shortcuts.ts` and the hosts existed. Re-run on Linux after the merge onto `fba024f2` (Node v22, `npm ci --ignore-scripts`).

| Check | Result |
|---|---|
| `npm run verify:rd-f3` | 12/12 |
| `npm run verify:rd-f2` | 17/17, including `rd-attn.one.1` |
| `npx tsc -p tsconfig.node.json --noEmit` | pass |
| `npx tsc -p tsconfig.web.json --noEmit` | pass |
| `npm run verify:styles` | 97/97 |
| `npm run verify:pill` | 13/13 |
| `npm run verify:rail` | 266/266. The pill line's main button carries `aria-label` so `labels.1` stays green. |
| `npm run verify:meta` | 52/53. Only `panels-split.2` (tag `pre-v7-run` absent). `visual.1` is green: the F3 scenes have no paint key, so they are not counted as missing goldens. |
| Plain-node wave (67 suites) | 64/67. The three failures are the ones Phase 0 recorded: `verify:meta` `panels-split.2`, `verify:tmux` (`pty.node` never rebuilt), `verify:first-run` `revamp.create.1`. `verify:canvas-sync` and `verify:relay` passed here. `verify:flowchart` did not spike. |

Not run (no Electron binary, `npm ci --ignore-scripts`, no `pty.node`): `verify:panels` (including the `.shell__center-toggle` / `.shell__merge` / View menu checks, and `dock.dup.1` which will see the clipped Orchestrate segment — R-013), `verify:canvas`, `verify:xterm`, `verify:window`, `npm run shot`, `verify:visual`, `verify:packaged`, `verify:tmux`. Known pre-existing and not re-counted as this lane: `verify:meta` `panels-split.2`, `verify:first-run` `revamp.create.1`, `verify:canvas-sync` and `verify:relay` WebSocket errors, occasional `verify:flowchart` timing spikes. Shot scenes name 04 and have no `run`, so `visual.1` does not demand a golden. `UPDATE_GOLDENS` was not set.

### Deviations

- Orchestrate remains a clipped segment inside the control. Removing the node would break the harness clicks. `dock.dup.1` wants that segment painted (`elementFromPoint`); R-013.
- Sessions and Review do not persist. The settings enum is still `canvas | orchestration` (L-E). R-010.
- ⌘0 / ⌘1 in `useViewport` were not retargeted. The registry names the concept chords. R-011. The menu still shows ⌘⌥T, not ⌘⇧T.
- The pill line says "agents"; `pillRestState` still says "panels". Two sentences on purpose, so the redesign line and the existing checks do not share a wording.
- Session count is observed from terminal and chat panels on a 1s tick unless `sessionCount` is passed. R-012.
- Extra avatars are the other signed-in accounts' initials. The mockup's AN/MK are teammates; presence is not on this bar.
- Live status, the world toggle and the View menu stay. The mockup crop does not show them. D6 keeps World as a lens, not a tab.
- No `TC_FIXTURE`. R-014. Shot scenes are named and not painted.
- Hosts are portaled from TopBar, not mounted by Canvas. R-012.
- One line in `Canvas.tsx` (`openFocusTask`'s `from`) is outside ownership. The owner required it so web `tsc` passes. R-007.
- The queue census has no task id and no clock. Approvals still attach, because the hook maps them by panel id.


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

## Lead · foundations tag and the open requests

Tag `rd-foundations` is on `7af404f1` (the F3 merge). `ownership.json` now lists the seven foundation paths in `frozen`, and `frozen_after_foundations` is empty. `rd-own.1` follows that. The historical F1–F3 sections above stay as they were written.

R-011 stays open. L-C owns `useViewport` and its brief is the tier flights; the request says the retarget happens when that lane rebinds. `shortcuts.ts` was not edited.

The rest of the open list is closed on this branch: D1 in the material bullet, high-contrast dark glass, the two terminal cursors, the dock's spoken count (the queue, with snooze and team asks only when that queue is empty), `subscribeLiveSessions`, `shouldIgnoreKeys` and the palette's ⌘K yielding under the focus lock, the center-view enum, Sessions and Review mounted from Canvas, `dock.dup.1` measuring the View menu row, `TC_FIXTURE=rd-steward` shared by dev and shot, and the palette title `Show Orchestrate`. Canvas still passes `attentionCount` into `pillRestState` until L-C.

## L-B · M442–M443

Branch `rd/l-b-workspace` off `redesign/main`. Lane `RD_LANE=L-B`. R-008, R-012 and R-005 are done on this branch and are not reopened. Canvas still passes `attentionCount` into `pillRestState` until L-C (R-005). R-011 stays L-C's (`useViewport`).

### Plan

M442 paints the Work tier. M443 paints create-and-arrange. Pure modules land under `src/renderer/panels/` and the owned canvas modules. Checks live in `scripts/verify-rd-l-b.cjs`. CSS stays inside `/* ── rd:L-B ── */`.

PLAN CHECK:

- [x] No existing hook call in `Canvas.tsx` moves. `TierLayer` and the recovery slot are JSX, appended in the tree. New hooks (`connectedSpawn` state, the chord listener) sit immediately before `return`. `useJobRecovery` stays where it is. Cursor and the connected-spawn opener are module setters in `spawn-cursor.ts`, so `onDropEmpty` and `onSpawn` do not grow a hook.
- [x] Restyles of existing panel rules are overrides inside `rd:L-B`, listed below. The base chromeless rule and `panel-settle` keyframes are not edited.
- [x] `rd-l-b.well.1` is a pure check that the lane's hover rules do not set a box metric on `.panel__slot`, `.xterm`, `.pf__body` or `.pf__keep`, and that the chromeless `.pf__chrome` stays `position: absolute`. `rd-l-b.allow.1` proves ⌘Y calls `answerApproval` with `allowPendingTarget`, and that the palette Allow row's id is `approval.allow.${id}.${requestId}` and its `run` calls `answerApproval`.

CSS overrides inside `rd:L-B` (M442): task region (1px dashed, `--r-region`, padding `--sp-7` which is 24px, chip); panel radius `--r-lg` and a resting shadow on `.panel` only; `.pf__word` as a pill; needs-you edge via `--state-needs`; selection restates `--glow-iris`; header verbs stay opacity 0 until hover, focus or selection (already true at `.pf__chrome button`; restated, no well metric); review card radius (the frame's own `--lift`, not a second one); edge pip as an amber pill with `pointer-events: auto` on the button only; HUD readout opacity 1; minimap region outline at `--r-sm`. (M443, same span): a second `@keyframes panel-settle` that overshoots, marquee toolbar, connected-spawn menu, snap-guide colour already `--guide`. The toolbar and the menu use a hairline. `shadow.1` keeps `--lift` on the frame.

Slots. `TierLayer` is a zero-size absolute `data-tier-layer` inside `.world` for L-C. `data-recovery-slot` wraps the existing reopen stack for L-F and stays mounted when the stack is empty. Neither is a hook.

Deviations. A double-click on empty ground still mints a flowchart process step (`flowchart.app.1`). ⌘N lands at the cursor only when the mouse has moved over the canvas and the call is the one-argument path; otherwise the view centre and `place()` cascade stay. ⌘T is a new listener, not a retarget of `useViewport`. Header path, branch and duration are R-016 (`PanelFrame` / `TerminalPanel` are not owned). `statePill` is ready and is not written into `shown.word`. Making a task commits one panel history entry; the work item is a second store and does not undo with ⌘Z. Handoff animation already runs only on `data-edge-activity="firing"`; M442 pins that rather than rewriting the gesture.

Shot scenes `rd-workspace` and `rd-arrange` gain a `run`. `verify:meta` `visual.1` will ask for goldens. Those goldens are not written here.

### M442

Watched red: `verify:rd-l-b` exited 1 because esbuild could not resolve `header-rest.ts` and `session-facts.ts`. The comment at the top of `scripts/verify-rd-l-b.cjs` records that.

| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run verify:rd-l-b` | 9/9 pass (`rd-l-b.0`, `header.1`, `wait.1`, `allow.1`, `region.1`, `well.1`, `slot.1`, `handoff.1`, `inspector.1`) |

R-016 is open for the header path, branch and duration. The pill helper is `statePill` in `header-rest.ts`.

### M443

| Check | Result |
|---|---|
| `npm run verify:rd-l-b` | 14/14 pass. Added `menu.1`, `gap.1`, `marquee.1`, `cursor.1`, `settle.1`. |

`gapGrid: 24` is opt-in on the canvas's `smartSnap` call. Callers that omit it, including the flowchart, keep the previous candidates. A connected drop on a shape still calls `extend`. A panel drop opens the menu and the next `onSpawn` links with `trigger: 'exit'` in the same history entry. Ground double-click is unchanged.

The first plain wave went red on checks this lane had caused. `verify:styles` 5 and 6 rejected literal padding, margin, gap and a 2px radius in the lane span. `shadow.1` rejected `--lift` on `.review-node`, the marquee toolbar and the connected menu. `motion.2` rejected the new name `rd-panel-settle`. `verify:rail` `state.2` rejected the spelled word in `make-task.ts` and `Canvas.tsx`. Spacing now uses the scale. The overshoot is a second `@keyframes panel-settle` (the name `motion.2` already allows); the first definition stays the dip. `revamp.motion.1` still reads that first definition, so it does not see the overshoot that paints. R-017 asks F1 to read the last one. The work item's state is `WORK_ITEM_STATES[1]`. After that: `verify:rd-l-b` 14/14, `verify:styles` green including `shadow.1`, `motion.2` and `revamp.motion.1`, `verify:rail` 266/266.

### Gates

| Check | Result |
|---|---|
| `npm run typecheck` | pass (node and web) |
| `npm run verify:rd-l-b` | 14/14 |
| `npm run verify:styles` | green, including checks 5 and 6, `shadow.1`, `motion.2`, `revamp.motion.1` |
| `npm run verify:rail` | 266/266, including `state.2` |
| Plain-node wave (67 suites, no build, no Electron) | 64/67 in 31.3s. Failed: `verify:meta`, `verify:tmux`, `verify:first-run` |
| `npm run affected -- --list --base redesign/main` | 22 files on this branch. The plain suites in that list ran inside the wave. The Electron suites were not run. UNMAPPED: `docs/redesign/requests.md`. A `--list` with no `--base` compares with `fba024f2c8` and is not this branch's diff |

`verify:meta` fails two checks. `panels-split.2` is the known red: `git show pre-v7-run:scripts/verify-panels.cjs` fails because the tag is absent. `visual.1` reports `declared` 81, `goldens` 79, `missing` `rd-workspace` and `rd-arrange`. That red is expected once a scene's `run` sits on the same line as `{ name:`. The goldens were not written. `UPDATE_GOLDENS` was not set. Nothing under `verify/visual/goldens/` changed.

`verify:first-run` is 28/29. `revamp.create.1` still wants `/^<div class="canvas-hud">/`. The HUD renders `data-screen-control` on that element. Create still sits before the zoom cluster. The attribute was not removed.

`verify:tmux` fails loading `prebuilds/linux-x64/pty.node`. `npm ci --ignore-scripts` never rebuilt it. Not fixed.

`verify:flowchart` passed in 1.0s and did not spike. `verify:relay` passed in 2.9s. `verify:canvas-sync` passed in 14.9s. No WebSocket errors on this host.

Electron. `npm run verify:panels:core` through `scripts/redesign/with-electron-lock.sh` exits 127: `node_modules/electron/dist/Electron.app/Contents/MacOS/Electron` is not on this machine. `xvfb-run` is `/usr/bin/xvfb-run`, and `node_modules/electron/dist/electron` exists. Under xvfb that binary starts and then dies: `Cannot find module './prebuilds/linux-x64//pty.node'`. The same death stops `scripts/shot.cjs` (`TC_FIXTURE=rd-steward`, `TC_SHOT_ONLY=rd-workspace`). dbus logs `Failed to connect to the bus`. No PNG was written, no `out/shots/*.vs-reference.png`, no golden. `scripts/panels-entry.cjs` also warns `Duplicate key "credentialDir"`; that warning is not this lane's.

G2's mockup critic and rules review were not run. There is no composite to hand them. `npm run build` was not run, because shots cannot paint. `verify:panels`, `verify:canvas`, `verify:xterm`, `verify:window`, `verify:visual` and `verify:packaged` did not run.

## L-A · plan (M439–M441)

Branch `rd/l-a-launch`. No separate approval step: the plan is this section, checked against the kickoff boxes, then built in order. `splashMode` stays the APEX field (`splash.1`). The restore card is a second surface. `Launcher` markup stays so `onboarding.markup.*` keeps reading the same buttons.

PLAN CHECK:

- 01 is the only main-process change. `boot:progress` is a send, so the key is `IPC_EVENTS.BOOT_PROGRESS`, not an invoke. An invoke would need `ipcMain.handle` in `src/main/ipc.ts` and a new `EXPECTED_CHANNELS`, and both files are outside this lane. `FILE_CHANGED`'s comment is the precedent: verify:ipc walks `IPC` only. The sender is `publishBootProgress` in the new `boot-progress.ts`. `CLAUDE.md`'s diagram gains the name in the same commit. README's diagram is R-018.
- `src/renderer/onboarding/` is new. Its tree does not spawn, exec, or call a pty.
- MinimapOverlay and CanvasHud are not edited. The minimap sentence is `emptyState('minimap')`. L-B reads it (R-022).

| Milestone | Pure model first | Checks | UI | Shot |
|---|---|---|---|---|
| M439 | `restoreLines`, `splashShouldLeave`, `ghostLayout` in `splash.ts`; `skipRemaining` and `publishBootProgress` in `boot-progress.ts` | `rd-restore.lines.1`, `rd-restore.skip.1`, `rd-restore.leave.1`, `rd-restore.channel.1` | `RestoreSplash` in `StartupSplash.tsx`, CSS in `rd:L-A` | `rd-splash` run, frozen at 3 of 5 |
| M440 | agent rows, ready label, install copy, preset default, handoff in `onboarding.ts` / `env-report.ts` / `presets.ts` | `rd-onboard.rows.1`, `rd-onboard.ready.1`, `rd-onboard.copy.1`, `rd-onboard.preset.1`, `rd-onboard.handoff.1` | `src/renderer/onboarding/Onboarding.tsx` | `rd-onboarding` run, step 2 |
| M441 | blank title, repo chip, starter layouts, empty-canvas hints, start verb | `rd-empty.title.1`, `rd-empty.layouts.1`, `rd-empty.hints.1`, `rd-empty.verb.1` | `BlankCanvas` in `EmptyState.tsx` | `rd-empty` run |

Mounting the three screens from `Canvas.tsx` is R-021. The shot door is `window.__rdLA.mount`, registered by `StartupSplash` because Canvas already imports that module. A failed restore stops the spinner and calls `noteBootIssue`; the 09 surface is L-F (R-023). `resume-summary.ts` and `tmux-probe.ts` stay as they are: the splash does not invent a resume narrative, and the probe's backend choice is not the reattach loop.

## M439 · Launch and restore

Four lines, each pending until a fact arrives. Workspace is done only when both the name and the path are present; the path is the mono detail. Layout says the measured counts in words (`2 tasks, 9 objects`; zero is `no tasks, no objects`). Tmux in flight is the active line and says `N of M`; zero done is `none of N yet`; nothing to reattach is `none to reattach`. Agents stay pending when only a planned catalog is known (`claude, codex` is a list, not a result). A found list sets `found`. Option held marks the tmux line skipped; `skipRemaining` sets `asleep` on panes not yet reattached, leaves reattached panes awake, and returns `killed: []` with the same pids. A failed step settles that line, leaves the later lines pending, and stops the breath. `splashShouldLeave` is true the moment `settled` is true, including at 0ms. Reduced motion and a settled view do not breathe. Ghost frames are the rects' own bbox, padded, and an absent list is empty.

`RestoreSplash` is a second surface. `splashMode` is unchanged (`splash.1`–`splash.3` passed). The card leaves in the effect that sees settled. Option is `altKey`. A failure calls `noteRestoreFailure`, which is `noteBootIssue`. The APEX field component is the same component it was.

`boot:progress` is `IPC_EVENTS.BOOT_PROGRESS`. `publishBootProgress` sends it. It is not an invoke: `verify:ipc` walks `IPC` only, and a handler would have to live in `src/main/ipc.ts` with a new `EXPECTED_CHANNELS`, neither of which this lane owns. `CLAUDE.md` names the channel. README does not (R-018). Nothing in the composition root calls the publisher yet (R-019). The preload does not subscribe (R-020). Canvas does not mount the card (R-021).

The ghost fill is `color-mix` at 55%. A fractional `opacity` failed `verify:styles` check 3 and was removed. The breath reuses `state-breath` on `var(--dur-breath)`. Reduced motion sets `animation: none`.

### Checks

Linux, Node v22. Electron's Linux binary is present under `node_modules/electron/dist/electron` (ELF). The npm scripts still invoke `Electron.app/Contents/MacOS/Electron`, which is not on this machine. `pty.node` was not rebuilt (`npm ci --ignore-scripts`). Watched red first: `verify:rd-l-a` exited 1 because esbuild could not resolve `boot-progress.ts`.

| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run verify:rd-l-a` | 5/5 pass |
| `npm run verify:styles` | 97/97 pass |
| `npm run verify:viewport` | pass, including `splash.1`–`splash.3` |
| `npm run verify:onboarding` | 23/23 pass |
| `npm run verify:rd-f1` | 7/7 pass |
| `npm run affected -- --base redesign/main` | 53/55 plain suites passed in 31.4s, then stopped. Failed: `verify:meta` (`14` missing `boot:progress` in the README — R-018; `panels-split.2` tag `pre-v7-run` absent, known; `visual.1` missing golden `rd-splash`, expected until Phase 4) and `verify:first-run` (`revamp.create.1`, known, CanvasHud is L-B). Electron tier not reached. |
| `shot`, `verify:visual`, `verify:ipc`, `verify:canvas`, `verify:window` | not run. Each script's binary path is the macOS app bundle. `UPDATE_GOLDENS` was not set. |

### Deviations

- The channel is a send, not the invoke the kickoff's "main handler" sentence describes. Direction is main→renderer. An invoke would edit files outside the lane.
- `tmux-probe.ts` and `resume-summary.ts` are unchanged.
- The shot scene has `run`. `visual.1` lists `rd-splash` as missing a golden. That red stays until the lead writes it.

## M440 · Onboarding

Four steps on `ONBOARDING_RAIL`: Workspace, Agents, Sessions, First task. Step 2's title is `Which agents live on your canvas?`. A row is `found` only with a path. A null path that answered is `not installed` and offers the install string. A timeout is `discovery did not answer`, and `sessionsPersistence(undefined)` does not say tmux is installed. Plain shell is locked on and is not in the ready count. `readyLabel(0)` is `Turn one on to continue`. The footer is the mockup's sentence. `FIRST_TASK_HANDOFF` is `{ sheet: 'start-work', spawns: false }`. `presetsFromEnabledAgents` makes the first enabled id the ⌘N default and leaves `shell` when none are on. Gemini's preset has no `agent` field. `discoverBinary` takes `which` and `versionOf`; it does not import `child_process`.

`Onboarding.tsx` is the card. Copy calls `installCommand` and `clipboard.writeText`. The preview frames take their word and `data-tone` from `panelState`. Nothing in `src/renderer/onboarding/` spawns.

The shot fixture is the mockup's frozen probe (claude and codex found at the paths and versions drawn on `02-onboarding.png`, gemini missing), not a measurement of this machine.

### Checks

Watched red: esbuild of `import { readyLabel } from onboarding.ts` exited 1, `No matching export`. A bare `export { missing }` in the suite entry was tree-shaken without that error, so the entry also assigns `keep`.

| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run verify:rd-l-a` | 11/11 pass |
| `npm run verify:styles` | 97/97 pass |
| `npm run verify:onboarding` | 23/23 pass |
| `npm run verify:rail` | 266/266 pass (`state.2`, `hints.1`, `empty.2`) |
| `shot` / Electron | not run. The scripts still call `Electron.app/Contents/MacOS/Electron`. `rd-onboarding` now has `run`, so `visual.1` will also list that golden as missing. `UPDATE_GOLDENS` was not set. |

## M441 · Empty canvas

`BlankCanvas` in `EmptyState.tsx`. The title is `A blank canvas for <workspace>`, or `A blank canvas` when the name is empty. The purpose sentence is the mockup's. The task field's verb is `Start task`, disabled with `Describe the task first` until there is a sentence. The repo chip is the name, or `no repository chosen`. Quick spawns are buttons labelled Claude Code, Shell and Import a layout…; the chords come from `shortcutById` (`⌘N`, `⌘T`). They call back and do not spawn. `STARTER_LAYOUTS` is a separate list from `LINEUPS` (`lineup.1` still sees solo, pair, workbench, swarm). `starterLayoutAction` places nothing until `clicked` is true. `EMPTY_CANVAS_GESTURES` is separate from `HINTS` (`hints.1` ids are unchanged). The ghost line is `Double-click to place a terminal`. The minimap sentence is `emptyState('minimap')` — `Nothing placed yet` — rendered in `BlankCanvas`. L-B's overlay does not read it yet (R-022). Canvas's double-click still places a process step (R-024). `Launcher.tsx` was not edited, so `onboarding.markup.*` still reads the same buttons.

### Checks

Watched red: `verify:rd-l-a` exited 1 with `ReferenceError: blankCanvasTitle is not defined` before the functions existed.

| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run verify:rd-l-a` | 15/15 pass |
| `npm run verify:styles` | 97/97 pass |
| `npm run verify:rail` | 266/266 pass. `empty.2` sees the minimap id rendered. `hints.1` ids unchanged. |

## L-A · G2

Rebase onto `origin/redesign/main` at `6bffde9f` was a no-op: that commit is the branch point.

| Check | Result |
|---|---|
| `npm run typecheck` | pass, each milestone |
| `npm run verify:rd-l-a` | 15/15 |
| `npm run affected -- --base redesign/main` | at M439, 53/55 plain suites, then stopped. Failures were `verify:meta` and `verify:first-run` only. Electron tier not reached. |
| Full plain wave (67 suites, no build, no Electron) | 64/67 in 31.5s. `verify:canvas-sync`, `verify:relay` and `verify:flowchart` passed. |
| `npm run shot`, `verify:visual`, `verify:ipc`, `verify:canvas`, `verify:window`, the panels parts | not painted. |

Could not run on Linux:

- `package.json` points every Electron suite and `shot` at `node_modules/electron/dist/Electron.app/Contents/MacOS/Electron`. That path does not exist. `scripts/redesign/with-electron-lock.sh` running it exits `No such file or directory`.
- The Linux binary is present and answers `--version` (`v43.4.1`) under `xvfb-run`. Invoking `scripts/shot.cjs` with that binary dies in main: `Failed to load native module: pty.node` — `prebuilds/linux-x64/pty.node` is absent. The prebuilds on disk are darwin and win32. `verify:tmux` fails the same way in 0.2s.
- No `out/shots/*.vs-reference.png`. No critic pass. `UPDATE_GOLDENS` was not set. `visual.1` is red on purpose: missing goldens `rd-splash`, `rd-onboarding`, `rd-empty`.

Other reds, not fixed: `verify:meta` `panels-split.2` (`pre-v7-run` absent), `verify:first-run` `revamp.create.1`, `verify:meta` 14 (`boot:progress` absent from the README — R-018).

Requests open: R-018 README fence, R-019 composition root publishes progress, R-020 preload subscribes, R-021 Canvas mounts the three screens, R-022 minimap reads `emptyState('minimap')`, R-023 L-F's 09 surface shows the boot-issue sentence, R-024 empty-canvas double-click still places a process step.

## M446 · L-E Settings › Keyboard

Branch `rd/l-e-keyboard`. Screen 08. Decisions D4 and D5. `shortcuts.ts` stays frozen.

### Plan

PLAN CHECK, before any edit under `src/`:

- `shortcut-overrides.ts` is pure and is checked before the Settings UI. `shortcuts.ts` is not edited. The merge, the canvas-scope ⌘ rule, duplicate detection within a scope, and the `tidy-alias` chord (⌘⌥T) live in that module. `matchEffective` and `acceleratorFor` are the same merge: one for a key event, one for the menu string. With an empty override list, `acceleratorFor` is `electronAccelerator`, so tidy-alias stays `CmdOrCtrl+Alt+T`.
- Rendered rows come from `keyboardSections`, which walks `SHORTCUTS`. `rd-keys.settings.1` compares that walk to the registry (every id, registry labels, group order of the non-alias rows). `KeyboardPane.tsx` maps the function; it does not carry a second list of labels or group ids.
- R-010 is done on this branch (`shell.centerView` is `canvas | orchestration | sessions | review`). It is not in this change.

Then the page. `keyboard.overrides` is a list setting (tab-separated `id` + chord) because `SettingValue` has no record and `parsePreferences` already checks a list of strings. The Keyboard page hosts the registry. The other six nav pages are thin hosts over the schema rows in their categories, each with a purpose sentence. The "Open Settings" verb is `OPEN_SETTINGS_ROW` in `palette-actions/settings.ts`; the command list and the dock callback are other lanes (R-026). The menu rebuild on `settings:changed` already exists; the accelerator it paints still comes from the frozen registry (R-025).

Shot: `rd-settings-keys` records Step in, reference 08. A `run` makes `verify:meta` `visual.1` list a missing golden. That red is expected until Phase 4. `UPDATE_GOLDENS` is not set.

### What landed

`shortcut-overrides.ts` merges a list of `id<TAB>chord` over `SHORTCUTS`. Canvas scope without ⌘ is refused by the shortcut's name. A duplicate inside one scope is refused and names the other row; nothing is returned to store. `tidy-alias` stays ⌘⌥T until that id is overridden, and moving Tidy onto ⌘⌥T clashes with the alias. Putting a chord back to the registry value drops the override. `acceleratorFor([])` is `electronAccelerator`, so the seven historical menu strings stay byte-for-byte. `matchEffective([])` agrees with `matchShortcut`. The frozen parser only knows the registry's keys, so a letter it has never seen (P, for one) is refused rather than stored as a chord nothing can match.

`keyboard.overrides` is a list, default `[]`, not plan-writable. The Keyboard page maps `keyboardSections`. The other six pages host the schema rows for their categories and each says what it is for. List settings stay off those pages. The page mounts from a second root installed when `palette-actions/settings.ts` loads, because Canvas is not this lane's file. `OPEN_SETTINGS_ROW` calls `openSettingsPage`. The dock and the command list do not, yet (R-026). The menu still paints `electronAccelerator` (R-025).

The shot records Step in (`⌘↵`), not the mockup's combined "Step into / out of panel". Those are two registry rows, and `rd-keys.settings.1` forbids folding them by hand. Aliases fold onto their target: Tidy's note is "was ⌘⌥T · kept for one release".

Checks were 1/15 (only `rd-l-e.0`) before the modules existed. `shortcuts.ts` was not edited. R-010 was already done and was not repeated.

Boolean and enum controls on the other pages carry `aria-label` of the setting name plus the current value. `labels.1` reads a button whose only child is a function call as unlabelled, and the first affected run failed `verify:rail` on those two buttons. After the labels, that suite is 266/266.

### Checks (Linux, Node v22, `npm ci --ignore-scripts`)

Rebase onto `origin/redesign/main` (`6bffde9f`): already based there. No commits to replay.

| Step | Result |
|---|---|
| `npm run typecheck` | Pass. Node and web. The hand-run `npm run build` after the wave also typechecked and bundled (`electron-vite build`). |
| `npm run verify:rd-l-e` | 15/15. Watched red first at 1/15. |
| `npm run affected` | 56/58 plain suites, 31s, stopped after the plain tier. Base `fba024f2c8`, 45 files. Failures: `verify:meta` `panels-split.2` (tag `pre-v7-run` absent) and `visual.1` (`rd-settings-keys` has `run` and no golden — expected until Phase 4), and `verify:first-run` `revamp.create.1`. `verify:rail` `labels.1` is green. Electron suites it selected (`verify:pty-manager`, `verify:window`, `verify:ipc`, `verify:canvas`, `verify:xterm`, `verify:panels:*`) did not start. |
| `npm run verify` | 63/67 of the plain wave (67 plain, 13 Electron), 31s, stopped after wave 1. Same `panels-split.2`, `visual.1`, and `revamp.create.1`. `verify:tmux` throws `Cannot find module './prebuilds/linux-x64//pty.node'` (`npm ci --ignore-scripts` never rebuilt node-pty). `verify:review` `merge.1` returned `{kind:'failed', detail:''}` once in the 4-wide wave; alone it is 163/163. The lane does not touch `lane-merge.ts`. `verify:canvas-sync` and `verify:relay` passed. `verify:flowchart` passed in 0.9s. `verify:styles` passed. |
| Electron tier | Did not start. Wave 1 rejected the tree. |
| `npm run shot` | Under `xvfb-run` and `scripts/redesign/with-electron-lock.sh`, `TC_SHOT_ONLY=rd-settings-keys`: exit 127. `package.json` launches `node_modules/electron/dist/Electron.app/Contents/MacOS/Electron`, and that path is absent. The Linux ELF is `node_modules/electron/dist/electron`. Invoking that ELF directly, the app reached `shot-entry` and then threw the same missing `pty.node`. No PNG was written. The process stayed up until it was killed at 75s. |
| Critic | No `out/shots/rd-settings-keys.vs-reference.png`, so the mockup critic and the rules reviewer did not run. |
| Goldens | `UPDATE_GOLDENS` was not set. `visual.1` lists `rd-settings-keys` as the one missing golden (declared 80, goldens 79). |

Known reds left as they are: `panels-split.2`, `revamp.create.1`, missing `pty.node`. `verify:canvas-sync` and `verify:relay` were green on this run.

## M445 · L-D Sessions

Branch `rd/l-d-sessions`, cut from `redesign/main`. Screen 07. D3. The page is a peer of the canvas: it reads the same words and the same queue, and the actions it cannot perform are callbacks.

### Plan

The pure half is `sessions-model.ts`: the header, the task groups, the bulk bar, the card verbs, the reply box, the sparkline path. Checks in `scripts/verify-rd-l-d.cjs` call that module through esbuild, the same shape as `verify-rd-f2`. The view is new files under `src/renderer/sessions/`, mounted from F3's `SessionsHost`. CSS stays inside the `rd:L-D` markers. The shot is `rd-sessions` on `TC_FIXTURE=rd-steward`.

PLAN CHECK:

1. Product code is new under `src/renderer/sessions/`, including the host F3 left. No store is edited. Holds.
2. The reply box's delivery is paste and Send is a button. Enter does not submit. A shell-prompt card has Open on canvas and Snooze 10m, and no field. Holds.
3. `metrics.1` is amended by R-027, not by an edit to `scripts/verify-styles.cjs`. Holds.

### What the page does

- Header is `sessionsTitle`. A zero live count and a zero dormant count are dropped, so an empty canvas is "Sessions" and a dormant-only canvas does not say "0 live". Spend is `headerSpend` in its own span. It is a dollar amount with no "today". The title bar is untouched.
- Group is Task. All states filters on the row's own word. "+ New session" is the one primary. Orchestrate stays the header link F3 added (`data-sessions-orchestrate`). ⌘⇧S is not bound again: `shortcuts.ts` has the chord and `useShellChrome` toggles the page.
- Cards are `useAttentionQueue(useAttentionCensus())`, in that order, with `item.sentence`. Approval is Allow / Diff / Deny. A shell prompt is Open on canvas / Snooze 10m. A failure is Restart / Read log. Snooze is local (ten minutes) and hides that card. This file does not call `buildQueue`.
- The table groups by the work item's single `panelId`. A panel named by two tasks is unassigned, in one trailing group. Columns are Session, Agent, Folder, Branch, State (`data-tone`), Activity, Run, Cost, Last line. The sparkline is an inline SVG. Its stroke is `STATE_PALETTE`, because a presentation attribute does not resolve `var()`. Recharts stays on the two shell charts. Last line and paths are mono. The state pill is `--tone`. Cost is `.sessions-cost`. There is no `data-machine-cost`.
- The bulk bar is "N selected" plus Pause, Restart, Move to task…, End. Pause is off when every selected row is asleep, exited, done or none. End calls `endAsk` and then `confirmEnd`. If Canvas has not passed `confirmEnd`, End does not end. No `window.confirm`, no `pty.kill`.
- Detail tails `scrollback.tail` and `pty.onData`. "Send to this session…" is disabled, with its reason, for a shell and for an agent this page cannot paste into. A chat with no `onSend` uses `agentSession.send`. A terminal paste waits for R-028. Facts (Started, Survives "reload and quit (tmux)", Tokens, Changes) render only when the reader has them. Show on canvas calls `onShowOnCanvas`.

### What this page cannot know yet

`session-registry.ts` is a factory Canvas owns. There is no module-level reader, and this lane does not bump `registry.version()`. The live reader therefore reports every session as not dormant, `survives` and `startedAt` and `changes` as unknown, and a terminal's `canPaste` as false until `onSend` is passed. The header drops the dormant clause because the count is zero, which is what the rest rule says to do with the data in hand. R-028 asks Canvas to pass the registry facts and the verbs. R-029 asks the steward loader to stamp folder, engine and branch; until then the shot hands the cast through `tc-sessions-feed`. A malformed feed is ignored.

The census `taskId` is null (CommandPill). Grouping uses work items. One member per task, plus a loose group, is what `layout.load` can say today.

F3's `.sessions-host__bar` is a single row. The L-D span sets `justify-content` and `flex-wrap` on the same class, later in the file, so the spend and the primary fit. Recorded here because the override is outside F3's markers on purpose: L-D may not edit that span.

Sample names and dollar amounts live in `scripts/fixtures/rd-steward/workspace.json` and in the shot's feed. They are not product copy.

### Shot

`rd-sessions` requires `TC_FIXTURE=rd-steward`, loads that layout, sends `agent:state` `wants-you` for three cast panels (the queue then says shell-prompt, because those panels are terminals and the inbox has no approval), dispatches `tc-sessions-feed` built from the fixture, selects `claude-ledger`, `vitest-ledger` and `codex-plaid`, and opens `claude-ledger`. The feed sets `canPaste` on agent rows so the open detail shows the send box. The live page does not. Giving the scene a `run` makes `verify:meta` `visual.1` list `rd-sessions` as a missing golden. That red is expected until the lead writes the golden. This lane does not set `UPDATE_GOLDENS` and does not write under `verify/visual/goldens/`.

### Checks

Linux, Node v22. `npm ci --ignore-scripts` did not rebuild `pty.node` (no `prebuilds/linux-x64`). Requiring `electron` later downloaded the Linux binary (`v43.4.1`); the Mac path `npm run shot` uses (`Electron.app/Contents/MacOS/Electron`) is not on disk. The first `verify:rd-l-d` threw `MODULE_NOT_FOUND` for esbuild because `node_modules` was absent. That is recorded at the top of the suite.

Two reds from the first affected run were this lane and are fixed: `verify:styles` check 3 (a disabled control used `opacity: 0.45`; it now uses `--muted`), and `verify:verbs` `gate.2` (the detail reads `scrollback.tail` and scrubs it with `outward` before the line is shown on this page).

| Check | Result |
|---|---|
| `npx tsc -p tsconfig.node.json --noEmit` and `tsconfig.web.json` | pass |
| `npm run verify:rd-l-d` | 18/18 pass |
| `npm run verify:styles` | 97/97 pass |
| `npm run verify:verbs` | 30/30 pass |
| `npm run affected -- --base redesign/main` | 43/45, stopped after the plain tier. `verify:meta` (`panels-split.2`, and `visual.1` missing `rd-sessions`) and `verify:first-run` `revamp.create.1`. `docs/redesign/requests.md` is UNMAPPED. Build and the Electron suites were not started. |
| Plain-node wave (`npm run verify`, 67 suites) | 64/67, stopped after wave 1. Failures: `verify:meta` (`panels-split.2` — tag `pre-v7-run` is not in this clone; `visual.1` — `rd-sessions` has a `run` and no golden, declared 80 / goldens 79), `verify:tmux` (`pty.node` for `linux-x64` missing), `verify:first-run` `revamp.create.1`. `verify:canvas-sync` and `verify:relay` passed. `verify:flowchart` did not spike. |
| Electron tier, `npm run shot`, `verify:visual` | not run by the gate, because wave 1 was already red. A direct attempt, `xvfb-run -a scripts/redesign/with-electron-lock.sh ./node_modules/electron/dist/electron scripts/shot.cjs` with `TC_SHOT_ONLY=rd-sessions` and `TC_FIXTURE=rd-steward`, booted Electron and then threw `Cannot find module './prebuilds/linux-x64/pty.node'` from `shot-entry.cjs`. The process did not exit; the probe was stopped at 75s (exit 124). No PNG was written. `UPDATE_GOLDENS` was not set. |

### Deviations

- Sentences are `panelState`'s words, via the queue and the reader. The mockup's prose is not a second vocabulary.
- Attention cards on the steward shot are shell prompts. Approval and failure cards render when the queue says so. This fixture's census cannot say so: a terminal in `wants-you` is a shell prompt, and failure needs an exited status or `failed` on the census, which CommandPill does not set from `agent:state` alone.
- The Changes panel (`engine: review`) is not a session row. The feed skips it.
- The fixture's moment is not "7 live · 2 dormant". No row is asleep, so the dormant clause drops. Inventing two dormant rows would be a second cast.
- Disabled controls are `--muted`, not a fractional opacity. Check 3 allows 0 and 1 only.
- The detail's tail is scrubbed with `outward` at the read. The terminal's own buffer is unchanged.

## L-C · M444 Navigate (Plan tier and ⌘K)

Branch `rd/l-c-navigate` from tag `rd-wave2a` (`877c71c2`). `RD_LANE=L-C`.

### Plan

Presentation only. `NavigateTier` mounts beside `<TierLayer />` inside `.world`. It does not reorder Canvas hooks. The import of that component is the other Canvas edit. `cardIds` are stamped onto the existing `collapsedPanelIds` set from the child's `useLayoutEffect`, using `enterTier` on terminal ids, so `useTiering` (not owned) still passes that set and does not learn a new argument. Ids a collapsed group already held are not claimed, and are not removed on the way back to Work. Entering Plan or Map blurs, calls `releaseFocus` (`setFocusedId(null)`), and focuses the canvas host before the passive tier effect. `LIVE_BUDGET` and `LIVE_MIN_SCALE` stay 8 and 0.5. Dormancy still outranks focus. Flights to a tier are a new `flyToTier` (ease-out, 220ms, anchor at the cursor, else the selection, else the centre). `flyTo` stays ease-in-out for bookmarks, fit and reset. ⌘0 fits all, ⌘1/⌘2/⌘3 fly to Work/Plan/Map, ⌘⇧0 fits the task, ⌘⇧T tidies beside the ⌘⌥T alias. The palette keeps `.palette__section` and `SECTIONS`. Kind bands are extra `.palette__band` rows. A path stays in Panels so check 48 still sees one Panels header. The Files chip is how those rows are read. Shortcut chips stay the set `verify:palette` 48 pins (`canvas.fit` still wears ⌘0).

PLAN CHECK:

1. Canvas is touched only at the TierLayer slot, plus the `NavigateTier` import. `<TierLayer />` stays, so `rd-l-b.slot.1` still sees it and `data-tier-layer`. Hooks are not reordered. Holds.
2. `LIVE_BUDGET` (8), `LIVE_MIN_SCALE` (0.5) and dormancy precedence are unchanged. `rd-l-c.pid.1` keeps pids 145 and 148 across Work, Plan and Map, and cards both terminals at scale 0.6 where the live floor would otherwise promote them. Holds.
3. R-009 is already done (`focusLocked()` returns before ⌘K `preventDefault`). R-011 is this lane's chord retarget. R-015 is already done (`Show Orchestrate`). R-005's remainder cannot drop `attentionCount` without editing `CommandPill` (R-030). R-022 and the palette half of R-026 are in this change. Holds.

### What landed

`NavigateTier` (`src/renderer/palette/navigate-tier.tsx`) mounts on the line after `<TierLayer />`. The import is the other Canvas edit. Its `useLayoutEffect` stamps `enterTier().cardIds` for terminal ids onto `collapsedPanelIds`, the set `useTiering` already passes. Ids a collapsed group already held are not claimed, and stay when the tier leaves. Plan and Map blur, call `releaseFocus` (`setFocusedId(null)`), and focus the canvas host before the passive tier effect, then set `data-zoom-tier` on `.world`. A merged canvas skips the stamp and publishes Work. Plan cards show the name, a `data-tone` pill from `panelState`, and `planStatusSentence`. A card mousedown selects through `selectAndRaise`. Map draws a tone dot at each panel's centre. `LIVE_BUDGET` stays 8 and `LIVE_MIN_SCALE` stays 0.5. `lod.ts`, `useTiering.ts` and `zoom-tier.ts` are untouched.

`flyToTier` is the tier flight. It still runs through `interpolateViewport` and sets `flying`. Duration is `tierFlightMs`: 0 when reduced motion is set, otherwise 220ms, ease-out. The anchor is the cursor, else the selection's screen centre, else the view centre. `flyTo` stays ease-in-out.

`useViewport` matches `fit-all`, `tier-work`, `tier-plan`, `tier-map`, `fit-task`, `tidy` and `tidy-alias` with `matchShortcut` / `electronAccelerator`. `chordCode` fills an empty `code` from the key, so a harness event that only sets `key` still matches. The old `case '0'` and `case '1'` are gone. Reset zoom remains the palette row `canvas.fit`. The menu still shows tidy-alias (`CmdOrCtrl+Alt+T`); `menu.ts` is outside this lane.

The palette keeps `SECTIONS` and `.palette__section`. A kind chip (Everything; Tab cycles at the top level) filters with `filterByKind`. Band headers are extra `.palette__band` rows. Path rows stay in Panels, so check 48 still sees one Panels header; the Files chip is how those rows are read. Enter still flies to the row. ⌘Enter on a `panel.goto.` row also fits the task. The placeholder is "Find or run anything". `canvas.settings` ("Open Settings") calls `openSettingsPage`. `Manage settings…` stays the drill-in. No new shortcut chips.

The zoom HUD grows Work / Plan / Map (`requestTier`, `aria-pressed` from the shown tier). Fit all's title is the `fit-all` chord. The switch stays on an empty canvas. Fit stays gated by `empty !== true`.

An empty minimap renders `emptyState('minimap').sentence` ("Nothing placed yet") and no digit. A populated one reads `minimapHeader`: `MAP`, `MAP · 1 TASK`, or `MAP · N TASKS`.

Shots `rd-plan-palette` (zoom 0.34, palette open on "plaid") and `rd-map` (zoom 0.18) both require `TC_FIXTURE=rd-steward` and name `docs/redesign/mockups/06-navigate-palette.png`. `{ name:` sits on one line so `visual.1` sees `run`.

### Checks (Linux, Node v22, `npm ci --ignore-scripts`)

Rebase onto `origin/redesign/main` (`877c71c2`): this branch is that commit. No commits to replay.

Watched red first: `verify:rd-l-c` passed `rd-l-c.0` and then threw `TypeError: M.planStatusSentence is not a function`. The suite's header records that. A later chord expectation said `CmdOrCtrl+Shift+0`; `electronAccelerator` emits `Shift+CmdOrCtrl+0` and `Shift+CmdOrCtrl+T`. The check now expects those strings. 11/11 after that.

Two reds from the first neighbouring runs were this lane and are fixed. `verify:styles` check 6 rejected `gap: 2px` on `.canvas-hud__tiers`; the gap is `var(--sp-1)`. `verify:rail` `labels.1` rejected the kind chip because its only child is a function call; the chip carries `aria-label`. `useSyncExternalStore` in `CanvasHud` and `NavigateTier` takes `getShownTier` as the third argument. The first `verify:first-run` threw `Missing getServerSnapshot` (`renderToStaticMarkup`). After that argument, the suite is back to the known `revamp.create.1`.

| Check | Result |
|---|---|
| `npx tsc -p tsconfig.web.json --noEmit` | pass |
| `npm run verify:rd-l-c` | 11/11. Watched red first on `planStatusSentence`. |
| `npm run verify:palette` | 182/182, including check 48 and `zoom.fit.1` |
| `npm run verify:viewport` | 199/199 |
| `npm run verify:styles` | 97/97 |
| `npm run verify:verbs` | 30/30 |
| `npm run verify:rail` | 266/266 |
| `npm run verify:rd-l-b` | 14/14, including `rd-l-b.slot.1` |
| `npm run verify:first-run` | 28/29. `revamp.create.1` still wants `/^<div class="canvas-hud">/`. The HUD renders `data-screen-control`. Fit verbs stay off an empty canvas. Known, left as it is. |
| `npm run affected -- --base origin/redesign/main` | 44/46 plain suites, 31.0s, 17 files, stopped after the plain tier. Failures: `verify:meta` (check 14 missing `boot:progress` in the README — R-018; `panels-split.2` tag `pre-v7-run` absent; `visual.1`) and `verify:first-run` `revamp.create.1`. `docs/redesign/requests.md` is UNMAPPED. Electron suites it selected (`verify:window`, `verify:canvas`, `verify:xterm`, `verify:panels:*`) did not start. |
| `npm run verify` | 64/67 of the plain wave, 50.1s, stopped after wave 1. Same `verify:meta` and `verify:first-run`, plus `verify:tmux` (`Cannot find module './prebuilds/linux-x64//pty.node'`). `verify:canvas-sync` passed (14.5s). `verify:relay` passed (2.2s). `verify:flowchart` passed in 0.9s. Wave 2 (build) and wave 3 (Electron) did not start. `verify:panels` did not run. |

`visual.1` reports `declared` 88, `goldens` 79, `missing` `rd-splash`, `rd-onboarding`, `rd-empty`, `rd-workspace`, `rd-arrange`, `rd-plan-palette`, `rd-map`, `rd-sessions`. The two new names are this lane. `UPDATE_GOLDENS` was not set. Nothing under `verify/visual/goldens/` changed.

Shot. `npm run shot` launches `node_modules/electron/dist/Electron.app/Contents/MacOS/Electron`. That path is absent. The Linux ELF is `node_modules/electron/dist/electron` (present, executable). A direct attempt, `xvfb-run -a scripts/redesign/with-electron-lock.sh ./node_modules/electron/dist/electron scripts/shot.cjs` with `TC_SHOT_ONLY=rd-plan-palette` and `TC_FIXTURE=rd-steward`, booted Electron and then threw `Cannot find module './prebuilds/linux-x64//pty.node'` from `shot-entry.cjs`. Prebuilds on disk are `darwin-arm64`, `darwin-x64`, `win32-arm64`, `win32-x64`. The probe was stopped at about 80s. No PNG was written, and no `out/shots/*.vs-reference.png`. The mockup critic and the rules reviewer did not run. `UPDATE_GOLDENS` was not set.

Known reds left as they are: `verify:meta` check 14 (R-018), `panels-split.2`, `visual.1` (the missing `rd-*` goldens, including this lane's two scenes), `verify:first-run` `revamp.create.1`, `verify:tmux` (no linux `pty.node`). `verify:canvas-sync` and `verify:relay` were green on this run. `verify:flowchart` did not spike.

### Deviations

- Commands stay query-filtered. A command list that stays on screen while the query is "plaid" would fail the palette's filter checks. The Files chip, not a third `.palette__section`, is how path rows are read.
- `canvas.fit` still wears the ⌘0 chip. Check 48 pins `canvas.fit=⌘0` exactly. Fit all has the chord and no chip (R-032). Reset zoom remains that row (`zoom.fit.1`).
- `flyToTier` has its own duration and ease-out. Bookmarks, fit and reset still use `flyTo`. Both paths call `interpolateViewport` and set `flying`.
- The minimap header is positioned from the L-C span (`.minimap` overflow visible, header above the map). `minimap.ts` is L-B's and was not edited.
- Placeholder and footer copy changed. Palette goldens that paint the old "Type a command…" bar will differ. The lead rebaselines those. This lane writes none.
- R-009 and R-015 were already done on this base and were not repeated. `rd-l-c.lock.1` pins the ⌘K return before `preventDefault`.
- R-005's remainder is R-030. Canvas still passes `attentionCount`. `CommandPill.tsx` is outside the slot and outside this lane.
- The dock half of R-026 stays open. `openSettingsScope` still opens the palette settings scope, and that call sits outside the TierLayer slot.
- `chordCode` makes a key-only `0` Fit all and a key-only `1` Work. Electron suites that still reset with `zoomTo(wc, '0')` or fit with `zoomTo(wc, '1')` are R-031. They did not run on this machine. Pinch `zoomToScale` is unchanged.

## L-F · M447

Branch `rd/l-f-recovery` off tag `rd-wave2a` (`877c71c2`, redesign/main at the wave 2a merge). Lane `RD_LANE=L-F`. R-006 is already done: `subscribeLiveSessions` fires from `notify()` and `useAttentionQueue` subscribes. It is not reopened. R-023 is done in `5fe2abdf`: issue lines on `ReopenNotice` carry `data-boot-issue`, and `bootIssueSentence` is that sentence.

Merged `origin/redesign/main` at `ddf8363f` (L-C, PR #14). L-C keeps R-030, R-031 and R-032. This lane's requests moved up: publishing `session:host` is R-033, terminal frames are R-034, the offline mark is R-035, the pill sentence is R-036, and the README fence is R-037.


### Plan

The pure half is `src/shared/exit-explain.ts`. The reducer lives in that file because main samples it from the existing `list()` tick and the renderer paints it, and a second shared module is outside this lane's ownership. Checks in `scripts/verify-rd-l-f.cjs` bundle it with esbuild. The view is `RecoveryHost`, `recovery-store.ts` and `offline-mark.tsx` under `src/renderer/panels/`. It mounts from `JobRecoveryNotice`, which Canvas already renders inside `data-recovery-slot`. `Canvas.tsx` is not edited. CSS stays inside `/* ── rd:L-F ── */`. The shot is `rd-recovery`, reference `docs/redesign/mockups/09-error-disconnected.png`.

PLAN CHECK:

- [x] `exit-explain.ts` and the reducer come first, with checks. The suite was watched red before the module existed: esbuild reported it could not resolve `src/shared/exit-explain.ts` and the process status was 1. That sentence is at the top of `scripts/verify-rd-l-f.cjs`. `reduceHost` and `reduceRecovery` are in the module. `rd-l-f.exit.1`, `answer.1`, `host.1`, `host.2`, `crash.1` and `pause.1` call them.
- [x] No new polling loop. Host detection rides `createTmuxBackend().list()`, which `pollLive` already calls every `LIVE_TICK_MS`. `session-backend.ts` has no `setInterval` (`rd-l-f.mount.1`). The kill-server test uses `verifySocket('terminal-canvas-verify-l-f')` and holds `scripts/redesign/with-electron-lock.sh`. The socket is `terminal-canvas-verify-l-f`. It is not `terminal-canvas`, `terminal-canvas-app`, empty, or a path (`rd-l-f.socket.1`).
- [x] The offline marker for GitHub and Jira is `OfflineCachedMark` plus R-035. `GithubNode.tsx` and `JiraNode.tsx` are not edited.

### What the surface does

- Twenty seconds of unanswered `list-panes` pauses the panes the last answer named. One missed sample sets `silentSince` and stays live. Exit 0 is an answer, including an empty pane list. A timeout (`exitCode` null) is not. stderr matching `no server running`, `error connecting`, `lost server`, or `no such file or directory` is not. Any other non-zero is a complaint that was heard, so the host is not treated as gone.
- The banner is `hostBanner`: "Session host stopped responding. tmux server on this Mac didn't answer for 20s. N sessions are paused, not lost — their output is buffered." Retry is `Retrying in Ns`, from `retryAt = at + 8_000`. While already paused, a sample at or after `retryAt` resets the countdown. There is no renderer timer. Reconnect now and Details are the verbs. Reconnect sets phase `reattaching` and the next `list()` is the sample.
- A paused frame says "paused · output kept" and "nothing you type is lost or sent twice", with `data-keys-blocked`. `keystrokesBlocked` is true only for `paused`. A reattaching frame is three skeleton rows (`data-recovery-skeleton`, `aria-busy`), never an empty well.
- A survivor is the same `panelId` and the same pid. A missing pane, or a different pid, is `ended`, with the sample's exit code or null. Phase stays `paused` while any paused pane remains.
- A crash card says "This session ended unexpectedly", `explainExit` (137 is "killed, usually by memory pressure"), and "The pending edit was not applied". Primary is "Restart with last prompt". Then "Read log". Restart calls `restartKeepsPanel`, which returns the same id. Cmd+Enter (meta+Enter, skipped on an input or textarea) restarts the first crash card. The card does not call `paletteActions.restartPanel`; that wiring is R-034, because `TerminalPanel` is not owned. Checks 90 and 92 stay in `scripts/verify-panels-shell.cjs`.
- Offline copy is "offline · cached · last updated <time>". The toast fires only when a source flips offline, through `notify` in `toast.ts`. The sentence is "GitHub is offline" (or Jira). The detail is "The canvas, terminals and notes keep working. Cached data stays marked until the connection returns." Host loss is not a toast. `isAttentionQueueRestatement` matches needs-you counts, and `rd-l-f.offline.1` asserts the toast does not.
- `recoveryPillLine(2, 4)` is "2 sessions need recovery · 4 paused · Review". The 09 surface paints it as `data-recovery-pill`. The real command pill is R-036: `AttentionItem` is frozen and has no paused count, and a non-zero exit is `failed` before `recovery`.
- A failed restore shows through `ReopenNotice`. Issue lines carry `data-boot-issue`. `bootIssueSentence` is the first non-empty issue. RecoveryHost does not also read `bootIssues()`, so the reopen notice is not duplicated.

### Mount

`useJobRecovery` subscribes to the recovery store with `useSyncExternalStore` as its first call, so Canvas's hook order is unchanged. The model gains `surface`. `JobRecoveryNotice` renders `RecoveryHost` when the view is on, and the unfinished-work list only when jobs, runs or a sentence exist. `.recovery-host` is `position: fixed` so it is not a box inside the bottom-left stack. `.recovery-slot { display: contents; }` is L-B's rule and is not edited.

`session:host` is an event (`IPC_EVENTS.SESSION_HOST`). `verify:ipc` counts invokes, so `EXPECTED_CHANNELS` stays 206. The name is in the CLAUDE.md channel diagram (`rd-l-f.channel.1`). Direct backend `hostReport()` stays `initialHost()` and `reconnectHost` is a no-op. Publishing the event from `pollLive`, and subscribing in preload, is R-033.

### Shot

`rd-recovery` has a `run`, size 1440×900, reference mockup 09. It calls `window.__rdLF.mount` with a catalog: four paused panes, one reattaching skeleton, exit 137 ("ship the ledger") plus a second crash, GitHub last updated 7:22 PM, retry 8s. `catalogView` paints those states together. One reducer phase is `paused` or `reattaching`, not both. Giving the scene a `run` makes `verify:meta` `visual.1` list `rd-recovery` as a missing golden. That red is expected until the lead writes the golden. This lane does not set `UPDATE_GOLDENS` and does not write under `verify/visual/goldens/`.

### Checks

Linux, Node v22. `npm ci --ignore-scripts` did not rebuild `pty.node` (no `prebuilds/linux-x64`). The first `verify:rd-l-f`, before `node_modules` existed, threw `MODULE_NOT_FOUND` for esbuild. The second, before `exit-explain.ts` existed, threw because esbuild could not resolve that entry. Both are the watched red. SIGSTOP of the tmux client hung the probe (the client pid, not a server that still answers). It was continued and the leftover verify server was killed. The kill test does not stop the process.

`rd-l-f.kill.1` creates two panes on `terminal-canvas-verify-l-f`, records their pids, `kill-server` through the electron lock, and asserts `list-panes` is unanswered. Two virtual silence samples then pause those pids. A new session after `start-server` has a new pid, and both original pids are in `ended`. Same-pid survival is `rd-l-f.host.2`, because a real kill-server destroys every pane.

| Check | Result |
|---|---|
| `npx tsc -p tsconfig.node.json --noEmit` and `tsconfig.web.json` | pass (web, after dropping an unused `RecoveryView` import; the later CSS comment edit does not change TypeScript) |
| `npm run verify:rd-l-f` | 17/17 pass (`rd-l-f.0`, `exit.1`, `answer.1`, `host.1`, `host.2`, `crash.1`, `pause.1`, `pill.1`, `offline.1`, `catalog.1`, `boot.1`, `well.1`, `mount.1`, `channel.1`, `shot.1`, `socket.1`, `kill.1`) |
| `npm run verify:styles` | 97/97 pass |

G2, after the labels fix below. Local ref `redesign/main` is absent; the base is `origin/redesign/main` at `877c71c2`.

The first affected run failed `verify:rail` `labels.1`: the four recovery verbs have children `{view.reconnect}`, `{view.details}`, `{frame.restart}` and `{frame.log}`, and that check does not treat those expressions as visible text. Each button now has `aria-label` of the same string. `verify:rail` is 266/266 after that. The numbers below are the re-run.

| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run verify:rd-l-f` | 17/17 pass, including `kill.1` on socket `terminal-canvas-verify-l-f` |
| `npm run affected -- --base origin/redesign/main` | 52/55 plain suites, 31.2s, stopped after the plain tier. 14 files since `877c71c2`. `docs/redesign/requests.md` is UNMAPPED. Failures: `verify:meta`, `verify:tmux`, `verify:first-run`. Electron suites it selected (`verify:pty-manager`, `verify:window`, `verify:ipc`) did not start. |
| Plain-node wave (`npm run verify`, 67 suites) | 64/67, 31.3s, stopped after wave 1. Same three failures. `verify:canvas-sync` passed (14.8s). `verify:relay` passed (2.8s). `verify:flowchart` passed (1.0s) and did not spike. No WebSocket error on this host. |
| Electron tier, `npm run shot`, `verify:visual` | not reached by the gate, because wave 1 was already red. A direct attempt downloaded the Linux Electron binary (`v43.4.1`, `node_modules/electron/dist/electron`, ELF x86-64) via `node node_modules/electron/install.js`. `xvfb-run -a scripts/redesign/with-electron-lock.sh ./node_modules/electron/dist/electron scripts/shot.cjs` with `TC_SHOT_ONLY=rd-recovery` and `TC_FIXTURE=rd-steward` booted Electron and threw `Cannot find module './prebuilds/linux-x64//pty.node'` from `shot-entry.cjs`. `node-pty` prebuilds on disk are `darwin-arm64`, `darwin-x64`, `win32-arm64`, `win32-x64`. The Mac path `Electron.app/Contents/MacOS/Electron` is absent. The process did not exit; `timeout 90` stopped it (exit 124). No PNG under `out/shots/`. `UPDATE_GOLDENS` was not set. Mockup-critic and the rules reviewer were not run: there is no `out/shots/rd-recovery.vs-reference.png`. |

`verify:meta` failures, reported and not fixed: check 14 missing `session:host` and `boot:progress` (the second is R-018; the first is R-037, because the README fence is not owned); `panels-split.2` (`git show pre-v7-run:scripts/verify-panels.cjs` fails); `visual.1` missing goldens `rd-splash`, `rd-onboarding`, `rd-empty`, `rd-workspace`, `rd-arrange`, `rd-sessions`, `rd-settings-keys`, `rd-recovery` (declared 87 / goldens 79). `verify:tmux` throws on `pty.node` for `linux-x64`. `verify:first-run` `revamp.create.1` wants `/^<div class="canvas-hud">/` and `CanvasHud` renders `data-screen-control`. `CanvasHud.tsx` is not in this diff.

### Deviations

- The mockup shows paused panels, a crash card and a skeleton at once. The shot uses `catalogView`. Transitions stay in `reduceHost`.
- Paused and crash frames, and the pill sentence, render inside `RecoveryHost`. They are not yet on `.panel` or in `CommandPill`. R-034 and R-036.
- "paused · output kept" is overlay copy. It is not a `panelState` word. `state.1` pins that vocabulary in `scripts/verify-rail.cjs`, which this lane does not own.
- Tones are `needs-you`, `starting`, `exited` and `idle` through `[data-tone]`. No state hex, no new `@keyframes`, no `--lift` off `.panel`.
- The L-F CSS comment does not name `.panel__slot` or `.xterm`. `rd-l-f.well.1` walks from the lane span and a comment that named those classes matched the next `height:`.
- Restart in place keeps the id in the reducer. Calling `restartPanel` is R-034.
- `session:host` is declared and sent only when something calls `sendHostReport`. The live tick does not yet. R-033.
- The README architecture fence does not list `session:host`. Check 14 already misses `boot:progress` (R-018). R-037 asks for `session:host` only. The README is not edited.
- Recovery verbs carry `aria-label`. `labels.1` strips a child expression unless it looks like a name, a label or a title, so `{view.reconnect}` alone was an unlabelled button.

### Gates after merging L-C

`origin/redesign/main` at `ddf8363f` is in this branch (`25c471f9`). No rebase. The request list and this ledger keep both lanes. L-C's R-030, R-031 and R-032 are unchanged. This lane's five requests are R-033 through R-037. No code comment or check named the old ids.

| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run verify:rd-l-f` | 17/17 pass |
| `npm run affected -- --base origin/redesign/main` | 52/55 plain suites, 31.1s, stopped after the plain tier. 14 files. `docs/redesign/requests.md` is UNMAPPED. Failures: `verify:meta`, `verify:tmux`, `verify:first-run`. Electron suites it selected did not start. |
| Plain-node wave (`npm run verify`, 67 suites) | 64/67, 31.2s, stopped after wave 1. Same three failures. `verify:canvas-sync` passed (14.7s). `verify:relay` passed (2.7s). `verify:flowchart` passed (0.9s). |

`verify:meta` check 14 still misses `session:host` and `boot:progress`. `panels-split.2` is the absent `pre-v7-run` tag. `visual.1` is declared 89 / goldens 79. The check prints the first eight missing names; the full list is `rd-splash`, `rd-onboarding`, `rd-empty`, `rd-workspace`, `rd-arrange`, `rd-plan-palette`, `rd-map`, `rd-sessions`, `rd-settings-keys`, `rd-recovery`. `verify:tmux` is still the missing `linux-x64` `pty.node`. `verify:first-run` is still `revamp.create.1`. The shot was not repeated: `prebuilds/linux-x64/pty.node` is still absent, and `UPDATE_GOLDENS` was not set.

## Lead wiring (screens 01–09)

Branch `rd/lead-wiring` from `redesign/main` at `9bfc3034`. The open requests R-016 through R-037 are landed except R-024, which stays open: D1–D8 do not choose between placing a terminal on an empty canvas and changing the empty-canvas copy, and `onCanvasDoubleClick` still places a flowchart process step. R-022 and R-023 were already done. Frozen foundations were not edited. `UPDATE_GOLDENS` was not set. Nothing was written under `verify/visual/goldens/`.

Two measurements needed a second commit after the request they belong to. `revamp.motion.1` reads the later `panel-settle` as 0, −3px, 1px, 0; `translateY(0)` has no unit, so the px-only sample list saw two values (`f6a5b4d9`). `rd-attn.one.1` treats any `attention-queue` import in `CommandPill.tsx` as the pill building a queue, so `ATTENTION_VERB.recovery` is imported from the pill's pure module (`96c86df3`). `verify:ipc` was recomputed from `Object.values(IPC)`: the 206 tally had already omitted `world:status` and `world:retry`, and `dialog:confirm` makes 209 (`9275573d`).

### Gates

Linux, Node v22.14.0. `npm ci --ignore-scripts` first. The second plain wave is after the recovery-verb move. `npm run build` (typecheck plus electron-vite) passed in the Electron attempt below; it is not part of the plain-wave tally.

| Check | Result |
|---|---|
| `npm run typecheck` | pass (node and web) |
| `npm run verify:rd-l-a` | 15/15 |
| `npm run verify:rd-l-b` | 14/14 |
| `npm run verify:rd-l-c` | 11/11 |
| `npm run verify:rd-l-d` | 18/18 |
| `npm run verify:rd-l-e` | 15/15 |
| `npm run verify:rd-l-f` | 17/17 |
| `npm run verify:styles` | 97/97 |
| `npm run verify:rail` | 266/266 |
| `npm run verify:palette` | 182/182 |
| `npm run verify:viewport` | 199/199 |
| Plain-node wave (`npm run verify`, 67 suites) | 64/67, 31.3s, stopped after wave 1 |

The three plain failures are the known ones. `verify:meta` is 51/53: `panels-split.2` (tag `pre-v7-run` absent) and `visual.1` (declared 89 / goldens 79; the check prints the first eight missing names). Check 14 is green: `boot:progress` and `session:host` are in the README fence. `verify:first-run` is 28/29, `revamp.create.1`. `verify:tmux` throws on `pty.node` until it is rebuilt (below). `verify:canvas-sync` passed (14.6s). `verify:relay` passed (1.8s). `verify:flowchart` passed (1.1s). An earlier wave, before the recovery-verb move, also failed `verify:rd-f2` (`rd-attn.one.1`, the pill importing `attention-queue`) and once failed `verify:review` `merge.1` with `{kind:'failed', detail:''}` under the 8-wide run. Alone, `verify:review` is 163/163. `verify:rd-f2` is 19/19 after the verb moved.

### Electron

The Linux ELF is `node_modules/electron/dist/electron` (`v43.4.1`), from `node node_modules/electron/install.js`. The Mac path in the npm scripts is absent. `npm rebuild node-pty` wrote `build/Release/pty.node` and `verify:tmux` is then 35/35. `electron-rebuild -f -w node-pty` replaced that binary with the Electron ABI. Under `xvfb-run`, `TC_SHOT_ONLY=rd-splash` wrote `out/shots/rd-splash.png` and `rd-splash.vs-reference.png` and exited 0. DBus address errors are the host. `verify:ipc` is 1/1 at 209 channels. The rest of the Electron tier was not run. No golden was written.

## R-024 · Empty-canvas hint

Owner chose on Oct 6, 2026: keep M388. `onCanvasDoubleClick` still places a flowchart process step. The ghost hint is now `Double-click to place a flowchart step` (`GHOST_TARGET`). `rd-empty.hints.1` pins that sentence. L-A's brief and L-B's "spawns the default agent" line name the same step. `hints.ts` already refused to teach ⌘N after the double-click; the comment now points at the ghost. No shot scene hardcoded the old sentence. `rd-canvas` was not moved. Landed in `ea1a5fca`.

### Gates

Linux, Node v22.14.0. `npm ci --ignore-scripts`.

| Check | Result |
|---|---|
| `npm run typecheck` | pass (node and web) |
| `npm run verify:rd-l-a` | 15/15 |
| `npm run verify:rd-l-b` | 14/14 |
| `npm run verify:rd-l-c` | 11/11 |
| `npm run verify:rd-l-d` | 18/18 |
| `npm run verify:rd-l-e` | 15/15 |
| `npm run verify:rd-l-f` | 17/17 |
| `npm run verify:styles` | 97/97 |
| `npm run verify:rail` | 266/266 |

## M448 · W0 night studio

Branch `rd/w0-night` from `redesign/main` at `c432e511` (after R-024). Base the brief names is `rd-canvas` (`5cf60839`); the branch includes the hint merge and does not move that tag.

### Plan

Reverse M415/M416. The room is the night ink (`#0b0d12`, dark `--s-0`) in both app themes. Shells are one neutral. Identity hues are the chest light only, and none sits within ΔE 20 (CIE76) of the five dark state colours. State is drawn in the eyes, the antenna, the floor ring and (once R-039 lands) the desk screen, read from `state-palette.ts` through `stateHexForAgent`. Trims are a dim neutral so only state blooms. Amber, the needs token, is the only vertical beacon, and only while an agent is waiting. Idle and errored agents stay in the roster; an error slumps. Agents do not walk to the table. `isLiveStatus` is unchanged (still the at-work set). `goalOf` is unchanged; `WorldRobot` stops using it.

`STUDIO` is the same object as `NIGHT`, so WorldOffice, WorldPlatform, WorldProps and WorldStructure pick up the night ground without an edit this lane does not own. `tableTop`, `ink` and `zoneInk` stay, so `world.studio.4` and `world.critic.label.1` stay green. The bloom threshold stays calibrated to the pale floor `#eef0f3`: a threshold taken from the night ground drops the whiteboard under `world.bloom.ink.1`. `glowScale` returns 1 for a colour under luma 0.12, so the dim trim does not bloom; `#36e6ff` and `#7ff4ff` still boost (`world.bloom.threshold.1`). `world.bloom.preimage.1` keeps the round-trip and now only requires that ACES does not lift the ground (the night ground compresses by less than the pale 0.02).

### PLAN CHECK

- [x] Every state colour in world/* reads state-palette.ts; identity hues only on the chest light.
- [x] The F1 world exemption is a request for the lead (R-038), not an edit to `scripts/verify-rd-f1.cjs`.
- [x] No three import in a pure module. WorldStage was not edited; it still has its one `/* @__PURE__ */ lazy()` for WorldView, and the flat room's existing second lazy (M431).

Watched red before the palette existed: `verify:rd-w0` 1/4. `rd-world.parity.1` named `world-palette.ts:#a6f6ff`. `rd-world.identity.1` named `#ee2b4a` 19.8, `#ffc614` 19.8, `#11b9b2` 16.6. `rd-world.night.1` was the missing wiring. The esbuild of the suite did not throw: the parity walk short-circuited before the missing exports were read.

### CSS override

Inside `/* ── rd:W0 ── */`, badge rules that follow the earlier `.world-tag` / `.world-flat__tile` rules and win by source order:

- `busy` → `var(--state-working)` (was `--world-go`, green)
- `quiet` and `idle` → `var(--state-idle)` (quiet was `--world-stop`, red)
- `stopped` → `var(--state-failed)`
- `wants-you` → `var(--state-needs)`
- `done` → `var(--state-done)`

### Exports other lanes read

`NIGHT`, `SHELL`, `TRIM`, `stateHexForAgent`, `ROBOT_TINTS` (chest lights, still length 10), and `STUDIO` aliased to `NIGHT`.

### Requests

R-038 open: drop `src/renderer/world/` from `rd-tone.literal.1`'s exemption in `scripts/verify-rd-f1.cjs` (lead, after merge). R-039 open: WorldOffice desk screen reads `stateHexForAgent`, and `MeetingTable` unmounts. R-040 done in `6dd3cad6`: an unread worktree list is one module-level array, so the resume summary does not rebuild every render. W0 does not own `useTaskHandoffs.ts`. The lead landed it on this branch before the night shot, because opening the world during that loop threw React's nested-update limit and unmounted the tree.

### G2

Shot `rd-world-night` (Plan tier, `TC_FIXTURE=rd-steward`, swiftshader under xvfb, Linux Electron `node_modules/electron/dist/electron`). `UPDATE_GOLDENS` was not set. Nothing was written under `verify/visual/goldens/`. `visual.1` stays red: the scene has `run`, and its golden is missing until Phase 4.

World-guard: no blockers. `three` / fiber / drei / `postprocessing` stay on the existing doors. WorldStage still has one `/* @__PURE__ */ lazy()` for WorldView and the flat room's existing second lazy. `world-palette.ts` does not import three. No drei `<Environment>`. `useGLTF` still passes both decoders off. The built entry loads the WorldView chunk with `import()`, not a static three import. Reduced motion and context-loss fallback were already in WorldStage and were not edited.

### Critic · rd-world-night

Composite `out/shots/rd-world-night.vs-reference.png` (reference on top, capture below). Verdict: **does-not-read**.

1. Silhouette. The reference is five terraces stepping back. The capture is one dark slab with desks in a loose ring. W2 owns screen 11's layout. W0 does not build terraces. Recorded disagreement.
2. Material. The reference paints saturated candy bodies. The capture's shells are one warm neutral (`SHELL` `#6e6256`); identity is the chest light. The kickoff overrides the mockup's colored bodies. Recorded disagreement.
3. Glow. Eyes, floor rings and the waiting antenna carry the light. The reference's tall amber beacon columns are not in this shot.
4. Connectors. No handoff arcs between robots.
5. Labels. The reference puts a name card on every robot. The capture does not read those cards at this framing.
6. Composition. The capture is a closer orbit of one cluster. The reference is a wide establishing shot with a plan whiteboard behind the room. The whiteboard stays in the scene (WorldProps); it is not the subject of this frame.
7. Chrome. The capture shows the app top bar (World view pressed, Sessions, Review, Orchestrate). The reference's bottom pill and 2D minimap are absent. Those are shared chrome, not this lane's room.
8. STATE COLOUR. Last and smallest. Working reads cyan, needs-you amber, done green, failed red, idle slate, on the eyes and floor rings. The failed agent is in the room. Amber is the waiting beacon, not a second body colour.

Ignored, per the critic brief: sample copy (Steward, ledger-export) and the 1600×1000 mockup versus the 1440×865 shot.

### Gates (Linux, before merge)

| Step | Result |
|---|---|
| typecheck | pass (`tsc --noEmit` web and node) |
| `verify:rd-w0` | 4/4 (`rd-w0.0`, `parity.1`, `identity.1`, `night.1`) |
| `verify:world` | 251/251 |
| `verify:rd-f1` | 7/7 (exemption still in place; R-038 lands after merge) |
| `verify:styles` | 97/97 |
| `verify:rail` | 266/266 |
| lane suites | `rd-l-a` 15/15, `rd-l-b` 14/14, `rd-l-c` 11/11, `rd-l-d` 18/18, `rd-l-e` 15/15, `rd-l-f` 17/17 alone, `rd-w1`–`rd-w6` pass |
| plain wave | `npm run verify` 64/67 in 49.4s, stopped after wave 1. `verify:rd-l-f` `kill.1` failed in the concurrent wave (`killed: null`) and is 17/17 alone. `verify:canvas-sync` passed (15.1s). `verify:relay` passed (2.4s). `verify:flowchart` passed (1.0s). `verify:tmux` passed (0.1s; the node ABI of `pty.node` is present). |
| Electron tier | did not start; wave 1 stopped. The night shot ran separately under xvfb and swiftshader and wrote the composite. |

Known reds, not this diff: `verify:meta` 51/53 (`panels-split.2` tag `pre-v7-run` absent; `visual.1` declared 90 / goldens 79, missing redesign goldens including `rd-world-night`). `verify:first-run` 28/29 (`revamp.create.1`). `UPDATE_GOLDENS` was not set.

### Merge

Merged to `redesign/main` as `5353e47f` (`--no-ff`, parents `c432e511` and `ad62eed4`). `rd-canvas` was not moved. `rd/w0-night` was not deleted.

R-038 landed on `redesign/main` as `2f630a7f`: `rd-tone.literal.1` no longer skips `src/renderer/world/`. `verify:rd-f1` stayed 7/7. R-039 stays open.

The shot loop is recorded on R-040, after the tag, and the tag was not moved. The setter is `setResumeSummary` (`Canvas.tsx` resume effect), not `useSyncExternalStore`. The same `records ?? []` and the same effect are on `rd-canvas` (`5cf60839`). Opening the world is what turned the spin into #185.

## M450 · W2 the room

Branch `rd/w2-room` from `redesign/main` at `38644eed` (R-040's resume-loop note is on that commit). W1 and W3 are in parallel. This lane does not edit them. New requests are R-050 through R-053.

### Plan

Five terraces at the canvas regions. `terraceFloor` is `canvasToFloor` of the region centre, and the size is the box divided by `FLOOR_SCALE`. `panelFloor` is the same conversion for a panel: a desk when the roster has that agent, a console when it does not. `placeStations` moves the desk and the home onto that point; `stationPlan` and `goalOf` stay the ring, so `world.zone.1`–`4` stay green. The scene group subtracts the frame centre, so the frozen orbit, the lights and `TransitionRig` still look at the origin. Terrace math is `canvasToFloor` before that shift.

`terraceDragCanvas` is the canvas delta of two floor points. `moveRegion` is the commit, one plan, one undo. The world does not import it (`world.ctx.door.1`). The check calls both. The scene reads the live region and panel boxes once, at open. The drag itself is R-051.

State. Working and thinking breathe on the eyes, the halo, the floor ring and the desk screen, through `agentBreathes` (the trim's table). The word is not spelled again: `verify:rail` `state.2` fails a `'working'` literal outside `panel-state.ts`. Reduced motion holds the breath at 1. A waiting agent raises `NeedsBeacon`, a vertical column in `stateHexForAgent('waiting_approval')`, and no other status does. The failed pill is `failedLine` (the feed's own words). The ask chip is `askChip`, only while waiting. The visible card is the picked robot. The budget formula `const full = !compact || waiting || picked` stays, because `world.perf.11` and `world.quality.cards.1` read that line; the card branch is `picked` inside it.

Shared chrome. `WorldChrome` keeps its ask pill, legend, Fit room, request count and room map in the DOM (`world.chrome.1`, `world.request.2`, `world.map.2`). The W2 span clips them. The canvas host is opacity 1, `z-index: 3`, `visibility: hidden`, pointer events none. `.command-pill`, `.minimap` and `.canvas-hud` are `visibility: visible` and take the pointer. The aura inherits the host's visibility: naming `.canvas__aura` in that rule is a third layer to `verify:styles` `aura.1`. Those are the 2D components, revealed, not reimplemented. The title bar was already outside the canvas. The camera wedge is R-050. Follow on the tier switch is R-052. Empty mounts: `data-rd-mount="W1"` and `"W3"`, marked `rd:W1 mount` and `rd:W3 mount`. The canvas is opaque (`alpha: false`).

R-039. The desk screen emissive is `stateHexForAgent(status)`. `MeetingTable` returns an empty group (`drawTable` is false). The plate stays in the function so W0's suite, which this lane does not own, still sees it. `agentTint` is still read and does not paint the screen.

### PLAN CHECK

- [x] Two empty marked mount blocks for W1 and W3 in `WorldView.tsx` (`rd:W1 mount`, `rd:W3 mount`, `data-rd-mount`).
- [x] `rd-world.layout.1` and `rd-world.chrome.1` are in `scripts/verify-rd-w2.cjs`. `rd-w2.0` stays.
- [x] No literal state hex in the new world code. Screens, the beacon, the fail pill and the ask chip read `stateHexForAgent` or `var(--state-failed)` / `var(--state-needs)`. `rd-world.parity.1` is clean.

`rd-world.layout.1` fails closed: the suite's esbuild imports `terraceFloor`, and a missing export does not resolve. `rd-world.chrome.1` fails if the W2 span does not name `.command-pill`, `.minimap` and `.canvas-hud`.

### CSS override

Inside `/* ── rd:W2 ── */` only. Later than `.canvas--behind-world { opacity: 0 }`, so the host paints. The host is `visibility: hidden`; `.world` and `.edge-indicators` restate that. The aura is not named (it inherits). The room's own ask, legend, tools, requests, room map and replay column are clipped, not deleted. An ask chip shows at any distance: `.world-tag .world-chip[data-ask]` follows the tier rule that hides every chip except up close.

### Gates

Typecheck passed (web and node). `verify:rd-w2` 4/4 (`rd-w2.0`, `rd-world.layout.1`, `rd-world.chrome.1`, `rd-world.state.1`). `verify:world` 251/251, including `rd-world.parity.1` and `world.rich.3`. `verify:rail` 266/266 (`state.2` clean). `verify:styles` 97/97 (`aura.1` clean).

`npm run affected -- --base redesign/main` selected the suites this diff reaches and ran them. After the breath-table and aura-selector fixes, the plain wave of `npm run verify` is 65/67 and stops after wave 1. The two reds are the known ones: `verify:meta` `panels-split.2` (tag `pre-v7-run` absent) and `visual.1` (declared 91, goldens 79; `rd-world-room` is one missing golden, expected until Phase 4), and `verify:first-run` `revamp.create.1`. The build and the Electron tier were not entered. `UPDATE_GOLDENS` was not set.

Shot. `rd-world-room` exits 0 under xvfb and the Linux Electron binary (`--use-gl=angle --use-angle=swiftshader`) and writes `out/shots/rd-world-room.png` and `rd-world-room.vs-reference.png`. The PNG is the light shell (centre 227, 231, 238; dark pixels 0%). The DOM had five regions, eleven panels, a sized WebGL canvas, and the context was not lost. Readback of that canvas was `[0, 0, 0, 0]`. A CSS outline on the canvas was captured and the interior was not. That is R-053. The probe that measured it is not in the tree.

Critic, against `docs/redesign/mockups/11-world-main.png`, ignoring sample copy and 1440×865 versus 1600×1000. **does-not-read.** The capture is not the night room.

1. Silhouette. No terraces, robots, consoles or beacons. The frame is one light field.
2. Material and glow. Night ground `#0b0d12` is absent. The centre matches the shell ground.
3. Chrome. The shared pill and minimap cannot be read as screen 11's chrome over a dark room, because the room under them is the shell.

Rules review: no blocker. State colour is `stateHexForAgent` or `var(--state-*)`. CSS stays inside the W2 markers. Frozen files and `redesign-contracts.ts` are untouched. `.panel__*` names are unchanged. `world-structure.ts` and `world-set.ts` do not import `three`.

World guard: no source blocker. `WorldStage`'s lazy door is untouched. No `<Environment>`. `useGLTF` decoders are unchanged. The first built chunk does not construct a `WebGLRenderer` (WorldView stays its own lazy chunk). The shot not presenting the room is R-053, not a door change.

### Merge

Merged to `redesign/main` as `695a71da` (`--no-ff`). `rd/w2-room` was not deleted. The two mount comments (`rd:W1 mount`, `rd:W3 mount`) are in `WorldView.tsx`. R-039 was already marked done on the lane: the desk screen reads `stateHexForAgent` and `MeetingTable` returns an empty group.

Linux gates on the merge, before W1: typecheck pass; `verify:world` 251/251; `verify:rd-w2` 4/4; `verify:rd-w1` and `verify:rd-w3` still the seam stub (1/1); `npm run build` exit 0. Plain wave 65/67 in 31.2s, stopped after wave 1. Failures: `verify:meta` `panels-split.2` and `visual.1` (declared 91, goldens 79), `verify:first-run` `revamp.create.1`. `verify:review` `merge.1` passed. `verify:rd-l-f` `kill.1` passed. `verify:canvas-sync`, `verify:relay` and `verify:flowchart` passed. Electron tier did not start.

W1 rebases with `git fetch origin && git rebase origin/redesign/main` on `rd/w1-transition`. W3 does the same after W1.

### Critic · rd-world-room after the wave

Re-shot on this host with `--ignore-gpu-blocklist --enable-unsafe-swiftshader` on the electron command only. Capture centre `(227, 231, 238)`, dark pixels 0%. `out/shots/rd-world-room.png`, composite `out/shots/rd-world-room.vs-reference.png`.

VERDICT does-not-read

The last-golden half is a blank field labeled NO IMAGE. The capture beside it is a light flat page, and it does not read as the dark room above.

1. **Silhouette.** The reference is a night room: a receding grid floor, raised terraces, and standing robot figures. The capture, lower right, is an orthographic page of white rounded rectangles, a tall list column, and a left icon rail. No floor, no terraces, no figures.
2. **Material.** The reference is near-black ink with glossy white figures on dark slabs. The capture is a high-key white and pale-gray field, white cards, and a light list.
3. **Glow.** The reference has tall amber beams and colored floor rings under the figures. The capture has no beams and no rings. The only tint is a pale mint card at the upper left of the canvas.
4. **Connectors.** The reference has thin arcs between figures and small tiles on the terraces. The capture’s cards sit in two loose bands with no arcs between them.
5. **Labels.** The reference puts short floating pills over the figures and terraces. The capture puts names in a left-hand list and on the white cards, each card with a gray status line.
6. **Composition.** The reference is a high, wide view into the room, with the small map at the room’s lower right and the attention pill along the bottom. The capture is a 2D workbench: list on the left, cards to the right, map at the top right.
7. **Chrome.** The reference keeps a thin top bar, a Work / Plan / Map control, the bottom pill, and a camera wedge. The capture shows the full 2D shell: icon rail, panels column, search field, a 2D | World control with 2D active, and a zoom strip along the bottom.
8. **STATE COLOUR.** The reference uses cyan, amber (the only tall glow), green, and red on rings, eyes, and beams. The capture’s cards are white with gray status lines. Nothing reads as working cyan, needs-you amber, done green, or failed red.

No disagreement. R-053 stays open. The flags that presented a room on the previous host did not present one here.

Follow-up, same host, overview only. On `rd-w3b` the world opens and stays open: the lens has World pressed (`2D canvas=false`), `.world-view canvas` is 1092×809, visibility visible, parent opacity 1, and there is no `.world-route__note`. The renderer console is the `THREE.Clock` deprecation and nothing else. No React error #185, no maximum-update-depth loop, no error boundary, no failed lazy chunk. `drawImage` of that canvas reads `[0, 0, 0, 0]`. The world layer's background is `rgb(227, 231, 238)`, which is the PNG's centre. The same shot on `rd/w3-overview` (`10c1806a`), same electron flags, is the same field: centre `(227, 231, 238)`, dark pixels 0%. The furnished office that lane's critic saw does not reproduce on this xvfb host. The merge did not crash the room closed. No app code changed.

## M449 · W1 Canvas → World transition

Branch `rd/w1-transition` from `redesign/main` (rd-w0 plus the R-040 render-loop fix). Wave 3b. Merges after W2. `WorldView.tsx` is not edited.

### Plan

One milestone. `world-transition.ts` stays the one pure clock. Extend it; do not add a second timer.

- Full move: 1000ms, `easeInOutCubic`, one `WorldTransition` sampled by the stage and (once R-043 lands) the scene. `__rdW1.atMs` freezes that same sample for the shot. It is not a second clock.
- Plan tilt: `hostLook` gains `tilt` (`PLAN_TILT_DEG`), written as `rotateX` inside the host's existing `transform`. No layout write. Reduced motion: tilt 0, scale 1.
- Terrace rise: `terraceRise(eased)`, already 1 when reduced. W2 mounts it (R-043).
- Pop: `popDelays` is unchanged (nearest→farthest, `world.trans.5`). `popDelaysFromTarget` measures those distances from the camera target. W2 mounts it (R-043).
- Reduced motion: `REDUCED_TRANSITION_MS` (120) with `{ reduced: true }`. `linear`/`fade` cross-fade; `raw` and `eased` are already at the destination, so the dolly and the pop do not play. Duration 0 still snaps (`world.trans.4`).
- `plan-floor.ts` paints RGBA from region and panel rects through `world-space.ts`. No PNG. `handoffMisalignPx` is the 2px check at 1440×900. `landingViewport` is `cameraToViewport` of the orbit target; the stage calls it once the move back settles, after the inline transform is cleared.
- `WorldLens` is the 2D | World control at the canvas top left. ⌘⇧W is `shortcutById('world')`. The lens keeps `shell__world-toggle`. The TopBar button stays until R-042.
- Cancel chip: `CANCEL_CHIP` (`Entering World · Esc cancel`) plus a bar of `linear`. Esc still reverses through `setTarget` (same ramp). Filmstrip marks `FILMSTRIP_MS`.
- The canvas host stays mounted. `inert` while covered. The world chord is handled before `shouldIgnoreKeys`, so it still fires while the world is up, and a focus lock still keeps the key.

### PLAN CHECK

- [x] world-transition.ts remains the single pure clock; no second timer.
- [x] WorldView.tsx is not edited. Exports the lead or W2 must mount are listed below.
- [x] TopBar's button removal is a request (R-042).

### CSS

New rules only, inside `/* ── rd:W1 ── */`. No override of an earlier rule.

### Exports W2 or the lead must mount

| Export | Who calls it |
|---|---|
| `motionOf(sample, reduced)` | WorldView's rig: `dolly`, `popRaw`, `terrace` |
| `popDelaysFromTarget(points, target)` | WorldView, instead of distance to the origin |
| `setWorldCameraTarget` | WorldView, the orbit target each frame. Until then the target is the floor origin and `landingViewport` centres there |
| `paintPlanFloor(canvas, layout)` | The ground mesh. Pixels from the layout, never a screenshot |
| `terraceRise` | WorldStructure, via `motionOf().terrace` |
| `WorldLens` | Mounted by this lane in Canvas. Not W2's |

`WorldStage` still passes the same `transition` object into `WorldView`. Reduced samples already snap `eased` and `raw`, so the current scene does not dolly or pop during the cross-fade.

### Requests

R-041 open: `world.stage.4` still names the 0ms snap. W0 owns `verify-world.cjs`. R-042 open: remove the TopBar World view button (F3) and retarget `world.door.9`. R-043 open: mount the curves in the scene (W2).

### Gates

Linux, Node. `npm ci --no-audit --no-fund`, then `node node_modules/electron/install.js` (v43.4.1) and `npm rebuild node-pty` then `npx electron-rebuild -f -w node-pty`. Shots invoke `node_modules/electron/dist/electron` under `xvfb-run`. `package.json` still points at the macOS Electron.app. `UPDATE_GOLDENS` was not set. Nothing under `verify/visual/goldens/` changed.

| Gate | Result |
|---|---|
| typecheck | pass (`typecheck:node` and `typecheck:web`, and again inside `npm run build`) |
| `verify:rd-w1` | 15/15. Watched red: `REDUCED_TRANSITION_MS = 0` failed `rd-w1.reduced.1` and `.2` (13/15), then restored to 120. |
| `verify:world` | 250/251. The one failure is `world.stage.4`. R-041. `world.trans.1`–`.8`, `world.door.1`–`.12`, `world.stage.1`–`.3` passed. `rd-world.parity.1` passed. |
| `npm run affected -- --base redesign/main` | 40/45 before the lens label and the spacing tokens. Failed: `verify:rail` `labels.1` (the 2D segment), `verify:styles` check 6 (literal padding), plus the known `verify:meta`, `verify:first-run`, and `world.stage.4`. |
| plain wave (`npm run verify`) | 63/67 in 31.3s, stopped after wave 1, after the label and spacing fix. Failed: `verify:meta` (`panels-split.2`, `visual.1`), `verify:first-run` `revamp.create.1`, `verify:world` `world.stage.4`, `verify:review` `merge.1` (`{kind:'failed', detail:''}`). Alone, `verify:review` is 162/163 on the same `merge.1`. `verify:rail` and `verify:styles` passed (97/97). `verify:rd-l-f` passed, including `kill.1`. `verify:canvas-sync` passed (15.7s). `verify:relay` passed (2.5s). `verify:flowchart` passed (1.2s). `verify:tmux` passed. Wave 2 and the Electron tier of `verify` did not start. |
| `npm run build` | pass. `WorldView` is its own chunk. `world.door.2` passed, so the entry does not statically import three. |
| shots | `rd-world-transition` and `rd-world-transition-rm` wrote PNGs and composites. The reduced-motion scene attaches the debugger before `Emulation.setEmulatedMedia` (the first try died with "No target available"). Electron logs `WebGL2 blocklisted`. The room is not in the capture. R-044. |

### Critic

Both composites are `does-not-read`. Mockup 10 is the plan tipping into terraces with robots popping. The captures are a light field: WebGL is blocklisted on this host (R-044), and the terraces are not mounted (R-043). The harness did show the cancel chip before the shutter (`[data-world-cancel]` not hidden, canvas still mounted, reduced motion did not write `rotateX`).

`rd-world-transition` (frozen at 550ms), top divergences:

1. Silhouette. The mockup's mid-frame is a tilted plan with terraces rising through it. The capture has no plan and no terraces.
2. Composition. The chip and the filmstrip have nothing to sit over. The mockup puts them on the moving plan.
3. State colour. The mockup's robots carry working cyan and needs-you amber. The capture has no robots.

`rd-world-transition-rm` (mid-fade), the same three. The scene's own check is that the host transform has no `rotateX`, and that check passed.

### Review

Rules review: no blockers. The filmstrip's millisecond labels use the mono face; `face.1` still passes. Two world toggles remain until R-042.

World guard: no blockers. `plan-floor.ts`, `WorldLens.tsx`, `world-transition.ts` and `world-toggle.ts` import no three. `WorldStage` still has one `/* @__PURE__ */ lazy()` for `WorldView` and the existing flat-room lazy. No new `<Environment>`. Reduced motion is the 120ms cross-fade. `WorldFlat`, `WorldCardBody` and `WorldMinimap` are untouched.

### Merge

Merged to `redesign/main` as `aa0b55a5` (`--no-ff`) after W2. The mount is `2a24f561`. `rd/w1-transition` was not deleted. Conflicts were only the ledger and `requests.md`; both sides were kept. CSS auto-merged inside `rd:W1`.

The lead then mounted the curves in `WorldView`: `popDelaysFromTarget` from the camera target, `motionOf().dolly` into `dollyAt`, `motionOf().terrace` as the scale of the office and the terraces, `setWorldCameraTarget` from the orbit each frame, and `paintPlanFloor` on a ground under the terraces. `WorldLens` stays the canvas control. The top-bar World view button is gone (R-042). `world.stage.4` names the 120ms cross-fade (R-041). R-044 stays open until the swiftshader shot. W3 rebases with `git fetch origin && git rebase origin/redesign/main` on `rd/w3-overview`.

### Critic · after the mount

Same host, electron flags `--ignore-gpu-blocklist --enable-unsafe-swiftshader` only on that command. `rd-world-transition` centre `(16, 19, 26)`, 92% of samples under a sum of 90. `rd-world-transition-rm` centre `(193, 193, 194)`, mean about `(21, 24, 28)`. Neither capture is the tilted plan. Paths: `out/shots/rd-world-transition.png`, `out/shots/rd-world-transition-rm.png`, and the `.vs-reference.png` beside each.

`rd-world-transition`. VERDICT does-not-read

The lower-left golden slot is a blank field labeled NO IMAGE. The lower-right capture is a flat 2D canvas with a panels column and dashed boxes. It does not show a tilted plan, terraces, or robots.

1. **Silhouette** — Upper reference is a perspective floor of raised cards with small robot figures. Lower-right capture is orthogonal rectangles and a left column. No tilted floor, rising terraces, or robots anywhere in the lower half.
2. **Material** — Reference cards are dark glass with lit rims on a receding dot grid. Capture boxes are flat dashed outlines on a flat dark field, with one solid teal card in the left column.
3. **Glow** — Reference cards carry cyan, amber, and red blooms. Capture has a solid teal panel and a small cyan map mark at the upper right of its window. No bloom, no floor pool, no amber beacon.
4. **Connectors** — Thin lines and dots link the dashed boxes across the capture’s right canvas. The reference’s readable links are the white callout pills around the tilted cards, not that flat graph.
5. **Labels** — Reference labels sit on the floating cards, the top transition chips, and the bottom filmstrip. Capture labels sit in the left tree and inside the flat boxes. No filmstrip captions.
6. **Composition** — The reference fills its frame with the tilting plan. The capture splits into a panels column on the left and a flat diagram on the right, with the map at that window’s upper right.
7. **Chrome** — Both show the top nav and a 2D | World control. The reference also has a left icon rail, a cancel / entering-world chip, and a bottom filmstrip of the move. The capture adds the panels column, a zoom footer, and a minimap, and has no filmstrip and no cancel chip.
8. **STATE COLOUR** — Reference card rims read cyan, amber, red, and green. Capture boxes read slate, the left card and map mark read cyan/teal, and amber, green, and red state are not visible on the canvas. Amber is not the only glow in the reference art.

`rd-world-transition-rm`. VERDICT: does-not-read

1. Silhouette. Center of the capture: one dark trapezoid with a tight knot of tiny pills. The reference’s stage is two rows of large glass cards, each with a white robot. No robot bodies, card slabs, or terrace blocks are in the capture.
2. Material. That same stage is a flat near-black plane. The reference cards are frosted glass on a visible floor grid. The capture’s only solid panels are the left task column (teal header, dark rows) and a small dark card beside the pill cluster.
3. Glow. Reference card edges bloom cyan, amber, and green, with amber the loud pool. The capture plane has no bloom. The strongest color is the teal header fill on the left.
4. Connectors. Reference callouts have leader lines onto the cards. The capture’s pill cluster has no leaders and no arcs.
5. Labels. Reference labels sit as large floating notes over the room and as titles on the glass. Capture labels are the left-hand row list plus micro white pills on the plane. They do not read as room callouts.
6. Composition. The reference room fills the window, with a three-frame filmstrip along the bottom. The capture gives the left third to the task list; the plane occupies the right and is mostly empty dark, and the focal cluster is small. The lower capture is not a blank field. It is that list plus the empty tilted plane. No robots or terraces are visible there.
7. Chrome. The reference top bar has a center status chip, and the filmstrip sits on the moving plan. The capture top bar is the ordinary view switch, a 2D | World control with World filled, and search, plus a zoom control at the bottom right and a small map box at the top right. No center chip and no filmstrip.
8. STATE COLOUR. Reference rims use cyan, amber, and green, and amber is the glow. The capture does not show those as eyes, rings, screens, or beacons. A few specks in the cluster are not a state read, and the teal header competes with them. No red failed figure and no slate idle body.

No disagreement. R-044 stays open. The dark field is the dark theme the scene sets; it is not the night room.

## M451 · W3 overview, camera and time

Branch `rd/w3-overview` from `redesign/main` at `38644eed` (rd-w0 plus the R-040 render-loop fix). Lane W3. One milestone. `WorldView.tsx` and `MinimapOverlay.tsx` are not edited.

### Plan

Pure first, then the chrome that is already in the tree.

1. `world-camera.ts` is pure (no three, no React, no canvas import). Orbit, pan, zoom-to-cursor (scroll and a ctrlKey pinch share one factor), tier poses for ⌘1/2/3 from `TIER_PITCH` and a local `TIER_SCALE`, fit on the terrace bounds, follow. `world.ctx.door.1` lets only the publisher import `zoom-tier`, which is frozen, so the scale and the hysteresis band are copied as `TIER_SCALE` / `tierAt`. `rd-world.pose.1` fails if either drifts from `TIER_TARGET` / `tierFor`. `rd-world.fit.1` centres those bounds to within 2% of the viewport. A pose aimed at the origin does not, which is the "Fit room sits off-centre" regression. `rd-world.zoom.1` keeps the floor point under the cursor fixed.
2. `WorldCameraPanel.tsx` lists Orbit (drag), Pan (Shift-drag), Zoom to cursor (scroll / pinch with ctrlKey), Work · Plan · Map, Fit room, Follow picked, Back to 2D. Every chord is `shortcutById` from the registry. No chord glyph is written in the file. `useWorldCamera()` is exported from this file. The panel is mounted from `WorldTime` until W2's mount block takes it (R-062), so screen 14 is reachable without editing `WorldView.tsx`.
3. Replay stays on the arrival journal (`foldTo` is not retargeted). Ticks take a tone and paint `var(--state-*)` inside the W3 span. A past room runs `verbsForRoom`, and every verb is disabled with the reason `past room — go Live to act`. The sentence is on the scrubber. Card, ask and open buttons live in files this lane does not own; they already omit those verbs (`world.replay.6`). R-063 asks them to show the same reason.
4. The away card reads the journal. The offer is `Tour the changes · 40s`. `tourStep(true)` is `cut` and `tourStep(false)` is `fly`. The existing focus lines stay so `world.tour.1` still matches. The rig already snaps a glide when reduced motion is on.
5. `watchersOn` plus a plan-map chip use the peer's initials. The sample "MK" is not in the source. The on-robot pill remains `WorldCard`'s `world-pill__peers` (`world.peers.3`).
6. `world-minimap.ts` grows `cameraWedge` with no value import (`world.map.2`). `cameraFootprint` uses `cameraToViewport` and lives in `world-camera.ts`. The 2D `MinimapOverlay` is L-C's. R-060.
7. Shot `rd-world-overview`, reference 14. Map tier pressed, scrubber open, away card open. No `UPDATE_GOLDENS`.

### PLAN CHECK

- [x] `world-camera.ts` is pure, and `fit.1` / `zoom.1` are plain-node checks of that module, written before the panel.
- [x] `WorldView.tsx` and `MinimapOverlay.tsx` are not edited.
- [x] Replay disables verbs with the reason `past room — go Live to act`.

### W2 mount list

Already in the tree through `WorldChrome` → `WorldTime` / `WorldPeers` / `WorldMinimap`. Do not mount a second copy.

- `useWorldCamera`, `WorldCameraPanel` from `WorldCameraPanel.tsx` (mounted by `WorldTime` until R-062 moves that one line).
- `fitRoom`, `zoomToCursor`, `tierPose`, `orbitBy`, `panBy`, `followAgent`, `boundsOf`, `cameraFootprint`, `toPose`, `backTo2d`, `tierAt`, `TIER_SCALE` from `world-camera.ts`.
- `verbsForRoom`, `PAST_ROOM_REASON`, `tickTone`, `tourStep`, `tourOfferLabel` from `world-replay.ts`.
- `cameraWedge`, `watchersOn` from `world-minimap.ts`.

### CSS override

Inside `/* ── rd:W3 ── */` only. The scrubber moves to the bottom centre, the away card to the right, the camera panel to the lower left, and replay ticks follow `data-tone` through `--state-*`. Earlier `.world-time__mark[data-kind]` rules stay; the tone rules win by source order.

### Gates

PLAN CHECK stays true. `WorldView.tsx` and `MinimapOverlay.tsx` are untouched.

| Gate | Result |
|---|---|
| typecheck | web and node clean (`tsc --noEmit` both projects, and `npm run typecheck`) |
| `verify:rd-w3` | 11/11 |
| `verify:world` | 251/251. `world.ctx.door.1` stays green because the tier scale is a copy, pinned by `rd-world.pose.1` |
| `verify:styles` | 97/97. The past-room verbs use `--fg-3`, not a fractional opacity |
| `verify:rail` | 266/266 after the working tone moved to `TONES[4]` (`state.2`) and the tour button gained an `aria-label` (`labels.1`) |
| `npm run affected -- --base origin/redesign/main` | 43/45 plain suites, 31.0s, stopped after the plain tier. 13 files. `docs/redesign/requests.md` is UNMAPPED. Failures: `verify:meta` (`panels-split.2`, `visual.1`) and `verify:first-run` `revamp.create.1`. Electron suites it selected did not start |
| plain wave (`npm run verify`) | 64/67 in 48.0s, stopped after wave 1. Same two known failures, plus `verify:rd-l-f` `kill.1` (`killed: null`; 16/17 in the concurrent wave). `verify:review` `merge.1` passed (30.8s). `verify:canvas-sync` passed (14.4s). `verify:relay` passed (2.0s). `verify:flowchart` passed (0.9s). `verify:tmux` passed. Wave 2 and the Electron tier did not start |
| build | `npm run build` exit 0 (electron-vite 16s). The entry `index.html` loads has no `WebGLRenderer` |
| shot | `rd-world-overview` wrote `out/shots/rd-world-overview.png` and `.vs-reference.png`. Linux Electron needs `--ignore-gpu-blocklist --enable-unsafe-swiftshader` under xvfb or WebGL is blocklisted and the room never paints. No `UPDATE_GOLDENS`. The harness leak check treats the hostname as a substring; this host is named `cursor`, which is inside "Zoom to cursor" (R-065). The capture was taken with that throw skipped locally and the skip was not committed |

### Critic · rd-world-overview

Verdict: **close**.

The capture has the overview's chrome on the live room: camera panel lower left (Orbit, Pan, Zoom to cursor, Work/Plan/Map with Map pressed, Fit room, Follow picked, Back to 2D), "Replay · last hour" at the bottom with a Live button and state-coloured ticks, and "While you were away" on the right with the tour and Dismiss. Top nav is Canvas | Sessions | Review.

1. Silhouette. The room is the orbiting office, not the mockup's near top-down floor plan. Map is pressed in the panel. The rig has no `apply` (R-062), so the lens stays on the opening orbit.
2. Composition. No teammate initials sit on an agent. The steward fixture publishes no watching peer. "MK" is sample copy and is not in the source.
3. Chrome. The three overview surfaces sit where the mockup puts them. The floor is the furnished room rather than the mockup's diagram of rectangles, which is the same miss as the silhouette.

State colour: the scrubber ticks are green, amber, red and blue from `--state-*`. No second hex in the W3 span.

### Review

Rules review: no blocker. Face stays on `--font-ui` for the camera chords. Past-room verbs stay in the DOM, coloured with `--fg-3`, not `display: none` and not a fractional opacity. Tones come from the palette. CSS is inside the W3 markers. Scoped ids. D1–D8 are not re-decided.

World guard: `world-camera.ts` imports no three. No new three door. `WorldStage` still has its one `/* @__PURE__ */ lazy()` for the view (the flat room's lazy is the one already there). No drei `Environment`. Reduced motion cuts the tour (`tourStep`) and the rig's glide span is already 0. `verify:world` 251/251 and the build's entry chunk does not statically import three. `WorldMinimap` is the plan map; `MinimapOverlay` is untouched (R-060).

### Merge

Merged to `redesign/main` as `613d72b9` (`--no-ff`) after W1. `rd/w3-overview` was not deleted. Conflicts were only the ledger and `requests.md`; both sides were kept. CSS auto-merged inside `rd:W3`.

The lead then landed the mount in `252fc68c`. `CameraApi.apply` glides to the pose's target, distance and pitch and keeps the camera's azimuth. The floor target is shifted back onto the scene. `VIEW.minPolar` is 0.2 so Map's 78° is inside the orbit limits. `WorldCameraPanel` sits beside the `rd:W3 mount` mark and is no longer a child of `WorldTime`. The flat room's `apply` does nothing. The rig publishes `liveView` each frame: the 2D minimap draws that footprint while the world is up (R-050, R-060), and leaving restores that viewport when the move back settles (R-064). `setWorldOn(false)` does not clear it. The shot leak check matches whole tokens, and it leaves the camera row out of the page scan (R-065).

Left open: R-061 (`shortcuts.ts` is frozen), R-063 (past-room verbs on the card; `world.replay.6` still wants them omitted), R-051 (terrace drag through `moveRegion`), R-052 (Follow on `CanvasHud`). R-044 and R-053 stay open: the swiftshader flags were on the electron command and the room still did not present.

Linux gates after the mount: typecheck pass; `verify:world` 251/251; `verify:rd-w1` 15/15; `verify:rd-w2` 4/4; `verify:rd-w3` 11/11; `npm run build` exit 0 (`WorldView` is its own chunk). Plain wave 64/67 in 31.4s, stopped after wave 1. Failures: `verify:meta` `panels-split.2` and `visual.1` (declared 94, goldens 79), `verify:first-run` `revamp.create.1`, `verify:review` `merge.1` (`{kind:'failed', detail:''}`). Alone, `verify:review` is 163/163. `UPDATE_GOLDENS` was not set.

World guard on the mount: `apply` is inside `WorldView`, which is already a three door. `world-camera.ts` and `world-toggle.ts` import no three. `MinimapOverlay` imports `world-toggle` only. No `<Environment>`. Reduced motion is still the 120ms cross-fade. The entry chunk does not construct a `WebGLRenderer`.

### Critic · rd-world-overview

Shot under xvfb with `--ignore-gpu-blocklist --enable-unsafe-swiftshader` on the electron command only. Capture centre `(227, 231, 238)`, dark pixels 0%. `out/shots/rd-world-overview.png`, composite `out/shots/rd-world-overview.vs-reference.png`.

VERDICT does-not-read

1. **Silhouette** — The current capture’s main field (lower right) is a near-blank pale dotted rectangle with a few dark specks. The reference (upper window, center) is a near top-down floor of raised rectangular terraces with standing figures. No floor plan, terraces, or figures are in the lower half.
2. **Material** — The lower window is a light gray/white shell. The reference is a dark night studio: ink floor, dark glass platforms.
3. **Glow** — The reference floor has cyan rings and an amber bloom on agents, plus a cyan control on the lower-right card. The capture has no bloom, no floor pools, and no beacons. The pale mint wash on the top card of the left list is flat.
4. **Connectors** — The lower canvas has no traces between objects. The reference floor shows the terraces as a linked layout; nothing like that is in the lower half.
5. **Labels** — Reference labels sit on the terraces, on the figures, in the left camera list, on the bottom scrubber, and on the lower-right card. The capture’s only labels are the left-hand list; the pale field has none.
6. **Composition** — The reference fills the window with the room, a camera list on the left, a scrubber along the bottom, and a card at the lower right. The capture splits into a tall left list and an empty right field, so the focus is the list.
7. **Chrome** — The capture’s title bar, list column, and bottom zoom cluster are light. Missing from the lower half: the dark title bar, the 2D | World lens, the camera panel, the replay scrubber, and the away card. The lower-left golden slot is an empty placeholder, not a scene.
8. **STATE COLOUR** — The reference floor shows cyan, amber (the glow), and green on the rings and scrubber ticks. The capture’s specks are dark gray. No cyan working, amber needs-you glow, green done, red failed, or slate idle appears on the canvas.

No disagreement. The centre sample is the shell ground. R-053, same host as the room shot.
