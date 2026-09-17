# M279 — the UI evolution: navy material, live status, illumination, an Activity tab

The plan and audit are [docs/ui-evolution-plan.md](../ui-evolution-plan.md). This ledger is
the run's state: what landed per step, the token re-valuations with their reasons, the
gate, and the critic's sentence for every golden that changed.

## Steps

| # | Step | Commit | Verified by |
|---|---|---|---|
| 1 | Tokens: navy dark ramp, cyan-tinted lit edge, blue/cyan aura, `--violet`, `--glow-iris` / `--glow-tone` recipes, `--tone-glow` ramp | `1882767a` | `verify:styles` 75/75, `chart-series` 16/16, `panels:agents theme.1` |
| 2 | Styled primitives (Pill, StatusDot, SegmentedControl, Tabs) + `.seg` / `.pill` / `.tabs` / `.live-status` CSS | `bcc4c141` | `verify:styles`, `panels:shell` 99/99 |
| 3 | Top bar: segmented center toggle, live status cluster, field ring on search; dock active tile glow; inspector tabs on the primitive | `bcc4c141` | same |
| 4 | Resizable navigator (`shell.navWidth`, 300–480) | `bcc4c141` | `verify:layout` 268/268, `verify:palette` 149/149 |
| 5 | Nodes: selection on `--glow-iris`, state edge on `--tone-glow`, workflow agent family violet | `33c8a806` | `verify:styles` |
| 6 | Chat phase word (`chatPhase` / `chatPhaseWord`) beside the state pill | `33c8a806` | `verify:rail` 223/223 |
| 7 | Inspector Activity tab; feed producer lifted to `canvas/useActivityFeed.ts`; canvas-wide feed with nothing selected | `33c8a806` | `verify:layout shell.1`, `verify:orchestration` 53/53 |
| 8 | xterm dark theme aligned with the new `--well` (part of step 1) | `1882767a` | `panels:agents theme.1` |
| 9 | Windowed file tree above 200 rows | (this step) | `verify:styles`, typecheck |
| 10 | Motion: glow transitions on the state edge, feed row arrival (`activity-row-in`) | steps 1, 7 | `verify:styles motion.2` |
| 11 | Goldens + this ledger | (below) | `verify:visual` |

## Token re-valuations (dark block), with the finding each answers

Every value derived against `verify:styles` check 11's ratios by the script the plan
names; light-block values are unchanged except for the new `--violet` pair.

| Token | Was | Now | Why |
|---|---|---|---|
| `--s-0` … `--s-5` | `#070910 … #2c3344` | `#080c16 … #2b3850` | the ground read as black, a hue nobody names; every step moves a few degrees toward blue at the same span |
| `--well` | `#0c0f16` | `#0a0e19` | follows the ramp; `themes.ts` and `panels:agents theme.1` move with it |
| `--fg` … `--fg-4` | `#e9ecf4 … #7a8396` | `#e8edf7 … #7684a0` | the same lightness, the ground's blue in the ink so text sits in the material |
| `--line`, `--line-strong` | `#262c39`, `#3b4356` | `#243047`, `#394764` | a boundary as part of the material, not a grey ruled over it |
| `--blue` | `#7aa2f7` | `#6ea8ff` | electric blue for work, nearest the identity cyan without becoming it |
| `--green` | `#9ece6a` | `#7fdba0` | mint rather than lime beside a navy ground |
| `--amber`, `--red` | `#e0af68`, `#f7768e` | `#e5b467`, `#ff7b8e` | one step of chroma to hold 3:1 on the new `--s-4` |
| `--iris` | `#67e8f9` | `#5fe3ff` | the interface light, a touch more saturated on the bluer ground |
| `--violet` (new) | — | `#b39dff` / light `#6a4fc4` | the family accent: workflow blocks, pools, orchestration structure |
| `--edge-light` | white `.11` | cyan-white `.13` | the top light on every surface says what colour the room's light is |
| `--aura-1`, `--aura-2` | indigo `.22`, teal `.12` | electric blue `.20`, cyan `.11` | the two illumination hues the brief names, at M109's alphas |
| `--glass-0..3`, `--bubble` | grey-black | navy | follow the ramp at the same alphas |

New structural recipes on `:root`: `--glow-iris` (a 1px ring + 18px spill of the interface
light) and `--glow-tone` (the state edge's spill), the tone block widening the latter to
22px/5px for `working` and `needs-you` through `--tone-glow`.

## Backend state: what is used, what is missing

Used, unchanged: `agent:state` (`starting busy idle wants-you exited`), the chat
snapshot's `status` and `pending`, the live message's blocks, `onAgentTransition`,
`onChatTurnEnd`. Derived in the renderer: the chat phase (`thinking` / a tool and its file)
from the last live block. Missing in main, documented and not invented: a per-agent phase
channel, a `blocked` agent state, a `completed` tone distinct from `exited` (`exited 0`
still paints red — backlog).

## Gate

Plain tier (`npm run verify`, wave 1): **41/42** — the one red is `verify:verbs gate.2`
(redactSecrets' caller count), which M277's ledger already records as pre-existing and
which touches no file this milestone changed (`git diff 1d925fbe --stat` names none of the
gate's callers). The runner stops after a red wave, so the Electron tier was run by hand,
serially, in the same order the runner takes; its numbers are in the table at the end of
this section.

`verify:visual` after `UPDATE_GOLDENS=1`: **63/64** — every changed scene written against
the sentences below, and `starter` unpainted in that run ("the arrangement is not on
screen", a harness timing the M262 ledger also met; its golden is untouched).

## Goldens

Every scene re-captured after step 9 and LOOKED AT (the out/shots set the plan's method
names, compared side by side with the pre-M279 set), then `UPDATE_GOLDENS=1` wrote the ones
that moved past a budget. The chrome changed in EVERY scene — the segmented Canvas /
Orchestrate control on a recessed track, the field-shaped Search with its rim, the dock's
lit active tile, the inspector's fourth tab — so every light scene moves by its bar and dock
alone; the dark scenes move by the ramp as well. One sentence per scene, what was seen:

| Scene | What changed, seen |
|---|---|
| launcher | the empty canvas with the new bar: the segmented control reads as one track with `Canvas` lit; the launcher itself and its filled `Start work` are untouched |
| kinds | every kind's header, body and pill as before; the bar shows `1 working` beside the search field and the dock's Canvas tile carries a faint cyan ring |
| kinds-dark | the ground reads navy rather than black; the panels' glass is a clear step above it; the working terminal's left edge spills a wider blue glow; the lit top edge on every surface is faintly cyan; the sixteen ANSI colours in the well are unchanged |
| trail, skills, integrations, github, across, vault, watcher, browser, teammate, routine, board, chat-copilot, memory, supervisor, templates, runs, composer, tool-objects, verbs, auto, subagents, lineup, header, flip, spawn-sheet, start-work, search, search-empty, navigator-panels, navigator-workspaces, navigator-files, attention, overview, group, group-collapsed, merged, ink, file-missing, starter | the bar and dock only: the segmented control, the search field's hairline rim, the live count(s) at the right, the Activity tab where the inspector is open; the scene's own subject is unchanged |
| chat | the chat's pill still reads `asleep` (no phase word — the phase appears only while a turn is in flight); `2 working` in the bar |
| graph, edge-firing, edge-waiting | the edge strokes, packet and heads take the re-valued blue and cyan; the selected edge's iris ring; the bar's counts |
| approval | `2 working` and `1 needs you` as two pills, the second amber and pressable; the inspector's tab strip now Detail / Work / Tools / Activity with Work lit from below the line |
| palette, palette-query | the palette over the new bar; rows unchanged |
| palette-dark | the palette on the navy ground: its raised surface a clear step above the chrome, the selected row's iris bar, the hairlines carrying the ground's blue |
| inspector-detail, inspector-work, inspector-tools | the four-tab strip with the lit tab's gradient under its label; the pane's fields unchanged |
| inspector-activity | NEW — the Activity tab on the live terminal: one row per transition (`became starting`, `starting → busy`, `busy → idle`) with the dot in the tone, the panel's name, an age and the detail line, newest first |
| zoomed-out | the far tiers on the new blue and mint tone fills; the bar's counts |
| zoomed-out-dark | the wall of blocks on the navy ground reads as lights: the working edge's wider spill and the needs-you amber ring both legible at 22%; the minimap's camera rectangle in the re-valued cyan |
| compact | at 1000px the two pills are a dot and a count each (the word hides below 1600px) and no longer reach the breadcrumb; the drawer over the canvas |
| workflow, workflow-edit | the agent-family blocks wear violet (`Orchestrator · leads`, `Chat`), the worker pool the working blue; edges and the graph paper unchanged |
| wide | the labelled dock at 156px with the lit Canvas tile; the inspector with nothing selected lists the canvas-wide Activity feed under the summary figures, each row a real transition from the fixture's spawns, scrolling with the figures rather than clipping them |
| reduced-motion | as `kinds` at rest — the state edge's glow transition and the feed row's rise are the only motions this milestone added, and both are dropped here |
| orchestration | the page on the light ground: violet structure lines and cube edges, the KPI slivers on the re-valued accents |
| orchestration-dark | the page on the navy deck ground with the central light; this golden was MISSING before M279 (recorded in the M277 ledger) and is written for the first time |
