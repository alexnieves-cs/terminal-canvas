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
| 12 | The reference pass (`docs/design-reference.png` arrived after the gate): wide search field in the bar's middle, live status at its right, `Terminal Canvas` in the mark, aura alphas raised, kind tiles on activity rows (`panelKind` on the event), lit glyph tile on agent headers; the turn line crosses `outward()` | (this step) | `verify:styles`, `verify:verbs` 29/29, `verify:orchestration` 53/53, `verify:visual` |
| 13 | Polish, from LOOKING at the step-12 captures: the no-selection summary gets a tab's inset and its own scroller with the counts two-up (it was a bare `.inspector__body`, flush on the pane's edge, and the feed under it was clipped, not scrolled); the feed says `working → needs you`, the product's words through `agentWord`, not the wire's `busy → wants-you`; the workflow's map renders only above twelve blocks and its contents are themed (on a four-block flow it was an empty white box over the fourth block) | (this step) | `verify:orchestration` 53/53 (its pinned string moved on purpose), `verify:styles` 75/75, `verify:rail` 223/223, `verify:visual` |
| 14 | The diorama pass, on branch `m279-diorama` (a worktree — a second session was live on main, and its `567ea305` swept the first half of this step in unbuilt). The board is 860 wide and the stage tilts 56°, so the ring — still a circle, `orch.depth.3` — fills a stage twice as wide as it is tall; `NodePlate` (kind tile, name, the product's state word) replaces two bare text rows that ran into each other; a role never wears a tone's hue (terminals were `--green` = idle, watchers `--amber` = needs you; now `--iris` / `--deck-violet` / new `--deck-steel`); opaque depth-writing bodies lit by tone, platforms `data-lit` by tone; the R3F loop is `demand`, each cube invalidating only while it has motion left (it repainted at 60fps for a ring of idle agents); no second brand under the bar; callout placement counts every node. `SHOT_ONLY=a,b` narrows `npm run shot` | `e25477ea`, `36ef442d`, (this step) | `verify:orchestration` 53/53 (`orch.motion.1` caught the platform transition), `verify:styles` 75/75, plain tier the change reaches all green, `verify:visual` |

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

Plain tier (`npm run verify`, wave 1): **41/42** at step 11 — the one red was
`verify:verbs gate.2`, which this ledger first recorded as pre-existing. **That was
wrong.** The check's `unguarded` list named `useActivityFeed.ts`: the finished-turn row
read a chat's last answer for another reader (the inspector) without crossing
`outward()`. Step 12 routes the line through the gate and `verify:verbs` is **29/29**.
The lesson is the one CLAUDE.md gives — a red with a familiar id is not the familiar
red until its payload has been read. The runner stops after a red wave, so the Electron
tier was run by hand, serially, in the same order the runner takes; its numbers are in
the table at the end of this section.

`verify:visual` after `UPDATE_GOLDENS=1`: **63/64** — every changed scene written against
the sentences below, and `starter` unpainted in that run ("the arrangement is not on
screen", a harness timing the M262 ledger also met; its golden is untouched).

Electron tier, serial, after the goldens (commit `69a2897a`), against the M277 baseline
the electron-tier note records (`docs/build-log/m277-libraries.md:78`):

| Suite | Result | Reds, and whose they are |
|---|---|---|
| `verify:canvas` | 7/7 | — |
| `verify:xterm` | 11/11 | — |
| `verify:panels:core` | 83/83 | — |
| `verify:panels:kinds` | 50/50 | — |
| `verify:panels:agents` | 81/82 | `detail.1` — pre-existing (M275/M277 ledgers); `ctx.1` and `theme.1`, both re-pinned this milestone, are green |
| `verify:panels:shell` | 99/99 | run at step 2 (`bcc4c141`), the last commit that touched a shell selector; not repeated in the closing run |
| `verify:panels:product` | 109/117 | the M277 set exactly: `workflow.edit.1`, `workflow.edit.2`, `workflow.lib.1`, `workflow.wire.1`, `workflow.inspect.1`, `workflow.save.1`, `workflow.panel.1e`, `reach.1` |

Nothing this milestone changed moved a number in either direction except `ctx.1`, which
was red for one build between adding the fourth tab and re-pinning it.

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

### Goldens, step 12 (the reference pass)

Every scene re-captured after the pass and LOOKED AT against the reference and the
step-11 set. The bar changed in EVERY scene again — the mark now reads `Terminal Canvas`,
the search field fills the bar's middle, the live counts sit at the right before `View` —
so every scene moves by its bar; the rows below name what else moved.

| Scene | What changed, seen |
|---|---|
| every scene not named below | the bar only: `Terminal Canvas` after the mark, the field spanning from the breadcrumb to the counts with `⌘K` at its right edge, the counts beside `View`; the scene's subject is unchanged |
| kinds-dark, zoomed-out-dark | the room is lit: the blue wash at the top-right and the cyan at the bottom-right are visible on the navy ground where before they were faint; the chat panel's header carries a cyan glyph tile; the sixteen ANSI colours in the well are unchanged |
| palette-dark | the palette over the lit ground; the field behind it reads as the bar's centre; rows unchanged |
| chat | the chat's header glyph is a lit rounded tile in the interface light beside the name; the pill still reads `asleep`; `2` in the bar |
| inspector-activity | each row leads with a 22px kind tile — the terminal glyph on a tone-tinted square — in its own column, the title beside it (a first cut let the tile paint over the title; the grid's first track is `auto` now) |
| wide | the canvas-wide feed's rows carry kind tiles (terminal, then the chat glyph on the last row); `4 working · 1 needs you` as two labelled pills at the right of the field |
| compact | at 1000px the field shortens to `Search panel…` between the breadcrumb and the two count pills; nothing collides |
| approval | `2` and `1` as two pills at the right, the second amber; the field between the breadcrumb and them |

### Goldens, step 13 (polish)

Three goldens written, each looked at first; every other scene was kept byte for byte.
`header` went red once at 0.541% and green on the next run with no change between — its
diff was the pid's digits and a subagents note caught between two sentences, which is the
scene's own nondeterminism, not a change.

| Scene | What changed, seen |
|---|---|
| wide | the summary sits on the pane's inset under its headings; `panels`/`running` and `waiting`/`tokens` are two-up, `this week` is a sentence at sentence size, so the feed starts at mid-pane instead of below the fold; its rows read `working → idle`, `working → needs you` |
| workflow, workflow-edit | the empty white map is gone from the flow's bottom-right and the block it covered — `Collect · joins results / report` — is readable for the first time; both were under the pixel budget, so their goldens were deleted to force the write |

### Gate, step 13

`npm run verify`, whole: **52/54** suites. The two reds are the baseline's two suites —
`verify:panels:agents` 81/82 (`detail.1`) and `verify:panels:product`, whose eight are
the M277 set by id. Product first read 108/117, one MORE than the baseline: `browser.1`,
`"live":false` — the webview guest never came up. Its payload was read before it was
named: nothing in this step reaches the browser panel, and the suite re-run alone
(`TC_ONLY=browser.1`, every check still running) passed it. A load flake in the serial
tier, recorded here so the next 108 is recognised. `verify:visual` 63/64 (`starter`, as
at step 11).

### Goldens, step 14 (the diorama pass)

Three goldens written by copying the suite's own fresh captures over exactly these
files, each looked at first — never `UPDATE_GOLDENS=1` across the set, so no other scene
could be re-baselined in passing. Every other scene passed byte-budget unchanged (61/65
before the write; the fourth red is `starter`, below).

| Scene | What changed, seen |
|---|---|
| orchestration | the ring spans the stage instead of its middle third; eight cubes stand as dark lit solids — steel terminals, teal chats, one violet watcher — on discs flattened by the stage's tilt, the unselected ones dimmed yet outlined; every node has a plate (tile, mono name, `idle · terminal`) and no two touch; spokes read on the light ground; the selected back-row cube's card hangs over the `No supervisor yet` placeholder, hiding no neighbour; the header row holds only the two clock boxes, the second `TERMINAL CANVAS` gone |
| orchestration-dark | the same scene on the navy deck: the cubes separate from the ground by their lit faces rather than by being coloured glass (they were olive), the plates' tiles carry the role light, the state dots stay green because every fixture agent is idle — the one place green now appears |
| file-missing | **the golden was wrong, not the panel.** `orchestration-dark` never returned to the canvas, so this scene had been capturing the Orchestrate page — with the greeting and wall clock unmasked, so it also went red by time of day. The scene now closes the page and refuses to continue if it cannot; the golden shows what the intent always said: `server.ts was deleted or moved`, the panel's title and chrome kept, the reload in its header |

**Still red, not from this step:** `starter` — "the arrangement is not on screen". It
ran under the Orchestrate page too, so that was the suspected cause; with the page closed
it still does not paint, so its cause is something else and is NOT found. Recorded as
open rather than as a flake.

**Not seen:** the callout placer's real-hub branch (a supervisor present, the card sliding
beside it). No scene has a supervisor. The Electron tier was not run for this step.

