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

## M445 · L-D Sessions

Branch `rd/l-d-sessions`, cut from `redesign/main`. Screen 07. D3. The page is a peer of the canvas: it reads the same words and the same queue, and the actions it cannot perform are callbacks.

### Plan

The pure half is `sessions-model.ts`: the header, the task groups, the bulk bar, the card verbs, the reply box, the sparkline path. Checks in `scripts/verify-rd-l-d.cjs` call that module through esbuild, the same shape as `verify-rd-f2`. The view is new files under `src/renderer/sessions/`, mounted from F3's `SessionsHost`. CSS stays inside the `rd:L-D` markers. The shot is `rd-sessions` on `TC_FIXTURE=rd-steward`.

PLAN CHECK:

1. Product code is new under `src/renderer/sessions/`, including the host F3 left. No store is edited. Holds.
2. The reply box's delivery is paste and Send is a button. Enter does not submit. A shell-prompt card has Open on canvas and Snooze 10m, and no field. Holds.
3. `metrics.1` is amended by R-016, not by an edit to `scripts/verify-styles.cjs`. Holds.

### What the page does

- Header is `sessionsTitle`. A zero live count and a zero dormant count are dropped, so an empty canvas is "Sessions" and a dormant-only canvas does not say "0 live". Spend is `headerSpend` in its own span. It is a dollar amount with no "today". The title bar is untouched.
- Group is Task. All states filters on the row's own word. "+ New session" is the one primary. Orchestrate stays the header link F3 added (`data-sessions-orchestrate`). ⌘⇧S is not bound again: `shortcuts.ts` has the chord and `useShellChrome` toggles the page.
- Cards are `useAttentionQueue(useAttentionCensus())`, in that order, with `item.sentence`. Approval is Allow / Diff / Deny. A shell prompt is Open on canvas / Snooze 10m. A failure is Restart / Read log. Snooze is local (ten minutes) and hides that card. This file does not call `buildQueue`.
- The table groups by the work item's single `panelId`. A panel named by two tasks is unassigned, in one trailing group. Columns are Session, Agent, Folder, Branch, State (`data-tone`), Activity, Run, Cost, Last line. The sparkline is an inline SVG. Its stroke is `STATE_PALETTE`, because a presentation attribute does not resolve `var()`. Recharts stays on the two shell charts. Last line and paths are mono. The state pill is `--tone`. Cost is `.sessions-cost`. There is no `data-machine-cost`.
- The bulk bar is "N selected" plus Pause, Restart, Move to task…, End. Pause is off when every selected row is asleep, exited, done or none. End calls `endAsk` and then `confirmEnd`. If Canvas has not passed `confirmEnd`, End does not end. No `window.confirm`, no `pty.kill`.
- Detail tails `scrollback.tail` and `pty.onData`. "Send to this session…" is disabled, with its reason, for a shell and for an agent this page cannot paste into. A chat with no `onSend` uses `agentSession.send`. A terminal paste waits for R-017. Facts (Started, Survives "reload and quit (tmux)", Tokens, Changes) render only when the reader has them. Show on canvas calls `onShowOnCanvas`.

### What this page cannot know yet

`session-registry.ts` is a factory Canvas owns. There is no module-level reader, and this lane does not bump `registry.version()`. The live reader therefore reports every session as not dormant, `survives` and `startedAt` and `changes` as unknown, and a terminal's `canPaste` as false until `onSend` is passed. The header drops the dormant clause because the count is zero, which is what the rest rule says to do with the data in hand. R-017 asks Canvas to pass the registry facts and the verbs. R-018 asks the steward loader to stamp folder, engine and branch; until then the shot hands the cast through `tc-sessions-feed`. A malformed feed is ignored.

The census `taskId` is null (CommandPill). Grouping uses work items. One member per task, plus a loose group, is what `layout.load` can say today.

F3's `.sessions-host__bar` is a single row. The L-D span sets `justify-content` and `flex-wrap` on the same class, later in the file, so the spend and the primary fit. Recorded here because the override is outside F3's markers on purpose: L-D may not edit that span.

Sample names and dollar amounts live in `scripts/fixtures/rd-steward/workspace.json` and in the shot's feed. They are not product copy.

### Shot

`rd-sessions` requires `TC_FIXTURE=rd-steward`, loads that layout, sends `agent:state` `wants-you` for three cast panels (the queue then says shell-prompt, because those panels are terminals and the inbox has no approval), dispatches `tc-sessions-feed` built from the fixture, selects `claude-ledger`, `vitest-ledger` and `codex-plaid`, and opens `claude-ledger`. The feed sets `canPaste` on agent rows so the open detail shows the send box. The live page does not. Giving the scene a `run` makes `verify:meta` `visual.1` list `rd-sessions` as a missing golden. That red is expected until the lead writes the golden. This lane does not set `UPDATE_GOLDENS` and does not write under `verify/visual/goldens/`.

### Checks

Linux, Node v22, `npm ci --ignore-scripts` (no Electron binary, no `pty.node`). The first `verify:rd-l-d` threw `MODULE_NOT_FOUND` for esbuild because `node_modules` was absent. That is recorded at the top of the suite. After install the suite is the checks below.

| Check | Result |
|---|---|
| `npx tsc -p tsconfig.node.json --noEmit` and `tsconfig.web.json` | pass |
| `npm run verify:rd-l-d` | 18/18 pass |
| `npm run affected` | not yet this section |
| Plain-node wave | not yet this section |
| Electron tier, `shot`, `verify:visual` | not yet this section |

### Deviations

- Sentences are `panelState`'s words, via the queue and the reader. The mockup's prose is not a second vocabulary.
- Attention cards on the steward shot are shell prompts. Approval and failure cards render when the queue says so. This fixture's census cannot say so: a terminal in `wants-you` is a shell prompt, and failure needs an exited status or `failed` on the census, which CommandPill does not set from `agent:state` alone.
- The Changes panel (`engine: review`) is not a session row. The feed skips it.
- The fixture's moment is not "7 live · 2 dormant". No row is asleep, so the dormant clause drops. Inventing two dormant rows would be a second cast.
