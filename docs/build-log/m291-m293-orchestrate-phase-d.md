# M291–M293 — Orchestrate Phase D (production 3D)

The state of this run lives here, not in any session's memory. Spec:
[docs/orchestrate-reference-plan.md](../orchestrate-reference-plan.md) (Phase D row of
"Ordered delivery plan"); run prompt:
[2026-09-19-orchestrate-phase-d-run-prompt.md](../superpowers/specs/2026-09-19-orchestrate-phase-d-run-prompt.md).
Earlier ledgers: [Phase A](m283-m284-orchestrate-phase-a.md), [Phase B](m285-m287-orchestrate-phase-b.md),
[Phase C](m288-m290-orchestrate-phase-c.md).

- Branch `m291-orchestrate-phase-d`, worktree `../tc-orch-phase-d`, **off main `8f6ac94f`** — the
  run prompt said to branch off `m288-orchestrate-phase-c` unless the user had merged C first;
  they had (main's tip IS Phase C's merge, and the C branch and worktree are gone), so this
  branch is off main, as the prompt says to do and say in that case.
- Numbering: `M291`/`M292`/`M293` were free on 2026-09-20 — no hit in `docs/build-log`, none in
  `git log --all`, no branch or worktree carrying the number.
- **The user's uncommitted `Canvas.tsx` / `shell/useShellChrome.ts` edits on main are NOT on
  this branch**, by the run prompt's rule: the worktree is off committed main.
- The spec, the run prompt and `docs/design/` are UNTRACKED in main's tree (the user's), so they
  are not on this branch; the links above resolve in main's checkout.
- Serial, one writer. Subagents read-only, plus the critic.

## Goal

The Orchestrate scene becomes the reference's layered illuminated platforms — one per task
island, stations, checkpoints and artifacts visually distinct kinds standing on them, placement
stable under live updates, hit targets correct where platforms overlap; a semantic zoom from task
summary to stations to evidence, a minimap, a breadcrumb, Fit all / Fit selected / Back; adaptive
quality driven by measured 1/6/25/100-session fixtures; and full List/keyboard parity with
reduced-motion and WebGL-unavailable paths that keep every essential action.

## Exit criterion (stop here)

From the plan: *legible across fixture sizes; correct hit targets; reduced motion and WebGL
fallback work; no Canvas regression.* Shown in the real app, with what was seen recorded below
and the fixture numbers in Measurements; then `npm run verify`, `verify:visual` and the
re-measured `verify:panels:orchestrate` watchdog with every red reported; `npm run shot` and a
fresh-context critic on every changed scene. No goldens written, no merge, no push.

## M291 — Layered platforms and stable grouping

- [x] Layered illuminated platforms replace the card-over-ring island
      (`orchestration-platforms.ts`, pure; `OrchestrationCubes.tsx` `PlatformMesh`): a base plate
      and a raised inner plate in `--deck-surface` with `--iris` edges; the WORKSPACE plate (what
      no island owns; grouping, never a supervisor) wears `--deck-violet` edges — the one place
      violet appears, a family, not a state. Every platform has the same two layers and the same
      thickness; selection lifts a fixed 6 px. The plate's label is three lines of screen-aligned
      SVG text: the goal, the placement (repository · branch · own worktree, or shared directory,
      said), and the state WORD with the counts — so the material's glow only echoes words.
- [x] Three kinds, three shapes, three words: a station is a cube (its plate says its state), a
      checkpoint (a watcher) a hexagonal puck (`check · passed`), an artifact (a file panel) a
      thin standing tablet (`file`). `data-orch-object` carries the kind for every check.
- [x] Stable placement: the workspace plate holds cell 0 for good; the i-th island in Phase C's
      persisted order takes cell i of a fixed 3-wide grid; sizes are fixed (past the cap the
      plate seats the most urgent and says `+N more · none need you`); only the FOCUSED plate
      expands. A first cut put the workspace last and every new island moved it — measured in the
      real app (`orch-3d.app.2`) and fixed.
- [x] Labels and controls are HTML/SVG outside the projection (the plate, the breadcrumb, the
      camera buttons, the minimap); the meshes are opaque; the camera moves only on Fit / Back /
      a minimap click / a platform double-click, and once when a platform count change lands a
      plate off-stage. The layers are said to be decorative before hit accuracy in
      `OrchestrationCubes.tsx` and the module header.
- [x] Hit order IS paint order (`orchHitOrder`): resting plates far→near, their objects, then an
      expanded plate and its objects; the overlay maps it verbatim. `orch-3d.4` (plain node) and
      `orch-3d.app.1` (the real DOM through `elementFromPoint`, at rest, zoomed out and zoomed in,
      only targets on stage) check it.
- Checks: `verify:orchestration orch-3d.*`; `verify:panels:orchestrate orch-3d.app.*`.

## M292 — Semantic zoom, minimap, adaptive quality

- [x] Semantic zoom (`orchZoomLevel`, by the plate's ON-SCREEN width: `summary` < 132 px,
      `stations` < 236 px, else `evidence`; an explicitly focused plate is always evidence):
      summary draws the plate with state and counts and NO idle station; a waiting station is
      drawn at every level (`orchObjectVisible`); stations adds the cubes; evidence adds the
      checkpoints and artifacts. Past the cap the plate says `+N more · none need you` — a
      waiting station is seated on top of the cap, never counted behind it.
- [x] Minimap (every plate as a rectangle, the viewport over them, click to centre), breadcrumb
      (All work › island › object · kind), Fit all / Fit selected / Back (a 20-deep camera
      history pushed by deliberate moves only — never by a drag or a wheel); the default camera is
      the fixed 56° stage tilt, straight on; no orbit.
- [x] Fixtures measured (Measurements below), pinned `full` and adaptive on the same build.
- [x] Adaptive quality (`orchQualityStep`, hysteresis 24 ms down / 12 ms up on the mean of the
      last painted frames): `lean` drops the composer (the bloom degrades, never stalls) and the
      ground pools, `flat` also the shadows; one geometry per (shape, size class) shared across
      every mesh and never disposed; `ORCH_LABEL_BUDGET` = 48 plates, selected and waiting first,
      then hovered, live, nearest; demand rendering kept (the fixture forces a repaint per frame
      to measure at all); expansion on focus.
- [x] `orch-zoom.3` pins `three`/`@react-three/fiber` to exactly `OrchestrationCubes.tsx` and
      `orchestration-bloom.tsx` AND, when a build exists, refuses any `index-*.js` containing
      `WebGLRenderer`. Read from a real build 2026-09-20 (`npm run build`):
      `OrchestrationCubes-*.js` 2,344.23 kB (three, fiber, postprocessing), the first chunk
      `index-*.js` 6,175.79 kB with 0 `WebGLRenderer` hits (88 in the island chunk).
- Checks: `verify:orchestration orch-zoom.*`; `verify:panels:orchestrate orch-zoom.app.*`.

## M293 — Parity and fallback

- [x] The List's rows are every scene object (stations, checkpoints, artifacts) with kind,
      state and island, sortable by each column (none → ascending → descending → scene order,
      ties stable), the same selection and the same verbs; an artifact gets an inspector arm
      (`file · path · in <island>`, Open on canvas). The island column stays in the List whole.
- [x] Arrow keys in the scene step to the nearest object in that direction across platforms
      (`orchSpatialStep`), focus following; Enter selects-and-inspects (hands the keyboard to Open
      on canvas after the render, and never toggles a selection off); double-click on a plate or
      its hit-rect focuses the island and fits the camera to it; Open on canvas stays the labelled
      button.
- [x] WebGL is PROBED with a scratch context before the island mounts and a runtime loss is
      caught by a boundary; either way the scene paints flat SVG plates and objects (the words
      and shapes intact), says so (`data-orch-webgl-notice`), mounts no canvas, and every action
      stands — tested by replacing `HTMLCanvasElement.prototype.getContext` to return null for
      every webgl kind before the page opens (`orch-parity.app.3`). Reduced motion: the plate lift
      snaps, no running animation in the scene, the beacon and every action stand.
- [x] Narrow (980 px) and dark checked in the real window (`orch-parity.app.4`); the large graph
      is the 100-session fixture above.
- Checks: `verify:orchestration orch-parity.*`; `verify:panels:orchestrate orch-parity.app.*`.

## Measurements

Read by `verify:panels:orchestrate orch-zoom.app.2` on 2026-09-20 (MEASURE lines; load average
20–26 on this machine at the time, three other sessions running). Fixtures: N agent terminals
(`spec.agent`) spread over ⌈N/10⌉ directories (one island each), a fifth marked working and a
tenth waiting through `agent:state`, on the real built renderer. Frame time is the mean and
p95 of 89 `requestAnimationFrame` intervals while a wheel zoom is dispatched EVERY frame (so
every frame is a real repaint — demand mode would otherwise paint nothing); memory is the
renderer's JS heap (`performance.memory`) and the renderer and GPU processes' working sets
(`app.getAppMetrics`). "Pinned full" is the tier locked to the composer, shadows and pools —
the scene as it was BEFORE the quality work; "adaptive" lets the measured frame decide.
**These are validation targets, not capacity claims.**

| fixture | tier | mean ms | p95 ms | JS heap MB | renderer WS MB | GPU WS MB | platforms | objects drawn | name plates |
|---|---|---|---|---|---|---|---|---|---|
| 1 session | pinned full | 8.3 | 9.2 | 69 | 347 | 168 | 2 | 1 | 0 |
| 1 session | adaptive | 8.3 | 9.8 | 69 | 363 | 168 | 2 | 1 | 0 |
| 6 sessions | pinned full | 8.3 | 9.2 | 69 | 391 | 171 | 2 | 6 | 1 |
| 6 sessions | adaptive | 8.3 | 9.1 | 69 | 392 | 171 | 2 | 6 | 1 |
| 25 sessions | pinned full | 8.3 | 9.0 | 69 | 450 | 184 | 4 | 25 | 3 |
| 25 sessions | adaptive | 8.3 | 8.5 | 69 | 456 | 187 | 4 | 25 | 3 |
| 100 sessions | pinned full | 14.1 | 17.0 | 69 | 558 | 213 | 11 | 82 | 10 |
| 100 sessions | adaptive | 10.6 | 16.7 | 69 | 626 | 198 | 11 | 82 | 10 |

The same fixtures on the FIRST Phase D build (before the legibility pass that hides a
resting station's name plate below an 80 px pitch; load 20–26 then, 3 here), for the record:
1 session 8.3 / 8.5 ms, 6 sessions 8.3 / 8.8, 25 sessions 9.5 / 16.7, 100 sessions **16.8 /
25.1 ms pinned full and 12.6 / 25.0 adaptive**, with 48 name plates drawn at 100 sessions and
the renderer working set 585–605 MB.

What the numbers say, including the ones not liked: the 100-session scene is at 14.1 ms mean
pinned full (16.8 before the plate rule), under the 24 ms step-down line, so the ADAPTIVE tier
never left `full` on this machine — the measured gain (10.6 ms) comes from the shared geometry
and the name-plate rule, not from the tier stepping down; the tiers are exercised by
`orchQualityStep` in plain node and by pinning, not by this fixture on this GPU. The renderer
working set grows ~250 MB from 1 to 100 sessions (and reads HIGHER adaptive than pinned at 100,
626 against 558 MB — the order the two were taken in, the adaptive read second on a warmer
process; not a cost of the tier), and the JS heap reads a constant 69 MB because
`performance.memory` is coarse in Chromium. p95 at 100 sessions is 17 ms — one 60 Hz frame,
with the first build's 25 ms p95 above it. The "objects drawn" at 100 is 82, not 100: the fixture's
tenth-session rule puts all ten waiting stations on ONE island (every i ≡ 3 mod 10 shares a
directory), and that plate seats all ten on top of the cap; the other nine plates seat eight
and say `+2 more · none need you` — eighteen counted, none hidden without a number, which is
the honest-count rule working, not a loss. The first-chunk numbers are under M292 above.

## Departures from the plan / prompt

- Branched off `main` (Phase C was merged), said above.
- `orch.depth.4` widened from `orchProjectNode(` to `orchProject(Node|World)(`: the platform
  scene projects through a new UNIFORM camera (`orchProjectWorld`) because the ring's per-row
  parallax would warp a plate's rectangle; both wear the one tilt.
- `orch-islands.app.1`'s folded read now expects NO floating card in the scene (the platform's
  plate is the island card) and the toggle alone; the List keeps the whole column.
- With the dependency lens on, the scene draws quiet dashed MEMBERSHIP spokes from each station
  to its plate's anchor (marked `data-orch-edge="grouping"`), so `orch-dep.app.1`'s "grouping,
  not a supervisor" reading holds without a synthetic hub; at rest a station standing on its
  plate needs no line.
- Like Phase C, the view, the meshes, the styles and the plain-node suite for all three
  milestones landed in the m291 commit (the wiring is one file); the m292 commit carries the
  Electron part (every Phase D block, the fixtures and the re-measured watchdog) and the
  load-bearing entries; the m293 commit the ledger's closing notes and the README rows.

## Exit demo (what was seen driving the real app)

Driven 2026-09-20 through the real built renderer and the panels harness (real store, real
reload, real git, the real R3F island and composer, `agent:state` transitions main would send).
`verify:panels:orchestrate` green at **30/30**, captured with `TC_DEMO_SHOTS` (`m291-1…4`,
`m292-1…3`, `m292-fixture-1/6/25/100`, `m292-fixture-100-focused`, `m293-1…5`, beside Phase
A–C's thirty). A hidden window's `capturePage` can lag the DOM a step; where a capture and a
check disagree the check's DOM read is the fact (the focused-100 capture showed one row of
cubes where the DOM counted ten stations; the capture now waits 500 ms).

1. **Legible across fixture sizes (exit criterion).** 1, 6, 25 and 100 sessions seeded over
   1, 1, 3 and 10 directories: 2, 2, 4 and 11 platforms (the workspace plate first), every
   waiting station drawn at every size (1/1, 3/3, 10/10 by `data-tone="needs-you"`), nine of
   the ten 100-session plates saying `+2 more · none need you` and the tenth seating all ten
   waiting stations on top of the cap; the frame numbers in Measurements. A double-click on a
   capped plate expanded it (`data-orch-platform-expanded`), seated all ten with no `+more`
   chip, and fitted the camera to it; the breadcrumb read `All work › 10 sessions`.
2. **Correct hit targets (exit criterion).** With two agent terminals, a watcher and a file in
   one repository and a plain terminal at home: two platforms, five objects; at rest, zoomed out
   six notches and zoomed in twelve, `document.elementFromPoint` at the centre of every on-stage
   hit-target answered that target's own platform or object (7/7, 3+/3+, 1+/1+ — a zoom carries
   some targets off the clipped stage, where the pane under them answers, so only on-stage
   targets are asked). The watcher read `data-orch-object="checkpoint"` with the plate word
   `check · idle`, the file `artifact` / `file`, the terminals `station`.
3. **Stable placement.** A chat minted in a NEW directory while the page was open landed on a
   new platform in cell `2,0`; the workspace kept `0,0` and the first island `1,0`; the
   persisted order appended (`orch-3d.app.2`). The camera moved once — the new plate was off
   the fitted stage — and the minimap's viewport said so.
4. **Semantic zoom, minimap, Fit / Back.** On the 6-session fixture zoomed out fourteen notches:
   both plates at `summary`, the counts line `Session · no task yet · … · 6 stations · 1 needs
   you`, ONE object drawn (the waiting station, `fx3`); zoomed in: `stations` then `evidence`
   with all six. Fit all put every hit-rect inside the stage; Fit selected shrank the minimap's
   viewport (130 → 90 units); Back restored it exactly (130); the breadcrumb read `All work ›
   Workspace › /bin/sh · station`.
5. **List parity and the keyboard.** The List held exactly the scene's five objects
   (`qA/qB/qH:station`, `qW:checkpoint`, `qF:artifact`) with kind (`checkpoint · watcher`,
   `artifact · file`), state and island; Name sorted ascending, descending, then back to scene
   order; Kind likewise; selecting the artifact row showed the artifact inspector
   (`notes.txt · artifact · Open on canvas`) and the scene's tablet lit `orch__cube--on`; Enter on
   a row selected it and the inspector followed, still on this page. In the scene, from the
   checkpoint, ArrowRight selected the station to its right and focus followed; Right/Down/Left
   walked four distinct objects across two platforms; Enter put the keyboard on Open on canvas.
6. **WebGL denied for real (exit criterion).** `HTMLCanvasElement.prototype.getContext`
   replaced to return null for every webgl kind before the page opened: the scene read
   `data-orch-webgl="unavailable"`, mounted no canvas, painted two flat plates and five flat
   objects with their plate words (`check · idle`, `file`, `idle`), showed the notice *3D is
   unavailable here (no WebGL context) — the scene is flat, and every action is the same*;
   clicking a station selected it, the inspector offered Open on canvas, and it jumped to the
   panel on the Canvas.
7. **Reduced motion (exit criterion).** Under the emulated media, `document.getAnimations()`
   found nothing running inside the scene, the waiting station's beacon still drew, Fit all and
   List were there, and the inspector's Open on canvas answered.
8. **Narrow and dark.** At 980×700 in the dark theme, the lens toggle, Fit all, the Dock's
   attention door, Open on canvas, the workbench tabs and the minimap all had a visible box inside
   the viewport.
9. **No Canvas regression (exit criterion).** The closing gate ran every Canvas suite; its reds
   are the same nine Phase A–C list (Gate below); `orch-page.*` (Phase A's boundary checks in
   `verify:panels:shell`) stayed green.

## Critic (fresh context)

Given the plan's art-direction paragraph and the spatial contract, and asked specifically about
legibility at small sizes and whether any state reads by colour alone.

**Round 0 (my own look at the first captures, before any critic):** the station name plates
overlapped at the fitted zoom (37 px pitch under ~92 px plates), every live station's card
covered the plates and the labels, the label's second line ran past its backing, and the corner
tools sat over the workspace plate; the 100-session demo showed ten amber cards stacked. Fixed
before the critic: names only when the pitch allows (or selected / hovered / waiting), cards for
the selected, hovered and waiting only with waiting cards capped at three, lines cut to their
backing, tools bottom-right, `N working` on the plate.

**Round 1 REJECTED all three** (its sentences): *orchestration* — "the selected-station card
(x≈557–700, y≈327–408) sits directly over the task island's label plate and hides its first two
lines … and the station name plates below the island pile on top of one another: plan.md is
covered by watcher · sh, which is in turn under the selected claude — api plate"; *-dark* —
"identical layout faults"; *-working* — "REJECT (mild): all three platform labels are fully
legible here and the working state has words … but the same plan.md / watcher · sh plates
overlap, clipping plan.md to plan — the 'only when there is room' rule is not being honoured for
artifact/checkpoint plates." Also: every third line ellipsised before a `needs you` could appear;
`Session · no task yet · no task yet` repeats; the two working stations are told apart by glow
with the words on the plate line and the roster (passes the rule, "the closest thing to a
colour-only cue"); islands occupy the middle ~35% of the scene's height; light-mode plates are
grey with little cyan edge; the selected cube's lift is barely visible in light mode.

**Round 2 ACCEPTED `orchestration-working`** — "no card, all three label plates fully legible
… the two lit cyan cubes are backed by the words `2 working` on the plate and `working` in the
pool and inspector, no transparent overlaps, and the differences from the golden … all read as
deliberate" — and **REJECTED the light and dark pair** on one cause: "the selected-station card
(≈555–700 × 325–410) still sits on top of the middle island's label plate … and the `claude —
api · idle` name plate (≈635–740 × 462–490) is drawn over a station cube (≈690, 470)". Its
notes: the third line's truncation is legible and loses no state word; Fit all is conservative;
light-mode cubes are low-contrast slate; no colour-only state found.

**Round 3 ACCEPTED `orchestration-working`** ("no card is open, all three label plates are fully
readable … the two working stations are lit AND named as working in the plate's third line and
the roster") and **REJECTED the pair** once more, on the card alone: "still hangs over the middle
island's label plate … the goal line's first word(s) and the repository token are under the card's
bottom edge"; "no name plate over any cube (that rejection IS gone)". Its notes: the middle
island's lines 2 and 3 truncate (the leading counts survive); the two working stations render at
two brightnesses for one word; a cube on the base plate below the inner plate's edge with a
stray marker under it; pucks and tablets are small at this zoom but distinguishable by shape.

The cause, measured: at the fitted camera the stage's 420 units leave ~130 above a platform and
an expanded card is 172 plus a 22 stem, so the rows above AND below were both dropped by the
stage filter and the clamp fallback landed on the label. Fixed after round 3: a BESIDE row at the
cube's own height, so the x sweep can put the card in the field past the platform.

My own look at the round-3 fix's capture: the beside row moved the card 40 px left and it still
crossed two labels — the three plates' labels form ONE band across the stage at one height, and
every position of a 172-unit card crosses it. Fixed: a card that cannot clear the band expanded
collapses to its rest height (94), which fits above the band; the detail is the inspector's.
And the cause under all three rounds, found on the next capture: the placer chose the row above
the label but the card RENDERED at its cube's own row — `CubeCallout` took an x offset and a
side, never a y — so every fix to the rows was invisible. The placed row now travels as a lift
and the stem stretches to it.

Fixed after round 2: the card gets a candidate row ABOVE the island's label (the row above the
cube always crosses the label's band, and sliding off the platform cost the placer more than
covering it); the label weighs 12; and below the name pitch (96 px) NO station gets a plate — the
selected/hovered station's CARD carries its name, a waiting one past the card cap keeps its
beacon, queue row and the plate's `N need you`; names for all arrive with Fit selected.

Fixed after round 1: the island label is a card-weight obstacle for the placer (8, was 1.5);
the room rule covers checkpoints and artifacts too; the counts line leads with `N need you`,
then `N working`; a session island says `Session · no task yet` once. Kept as notes (below,
Found / deferred): the one-row composition's empty band, the light theme's edge contrast and
lift.

### Critic, round 4 (on the final build), the critic's sentences, verbatim

- **orchestration** — "ACCEPT: the selected station's card (~615–760 x 330–385) now sits
  entirely above the Watchdog label plate (~625–850 x 390–430) with roughly 5px of clear air, so
  the goal and repository lines are fully readable and the previous rejection is resolved; label
  plates, the breadcrumb, Fit all / Fit selected / Back and the minimap are all crisp and
  screen-aligned, and the Workspace plate's dashed border plus 'grouping only — not a supervisor'
  gives the grouping distinction a shape and words, not just a colour."
- **orchestration-dark** — "ACCEPT: same geometry as light, the card clears the label band,
  blue-black material with cyan plate edges and the violet Workspace plate read as the reference
  direction, all text on the label plates is legible against the dark glass, and nothing
  overlaps transparently."
- **orchestration-working** — "ACCEPT: no selection, so no card; the two working stations glow
  pale cyan AND the island's third line says 'Task · working · 2 working · 7 stations', the
  roster says 'working' beside two rows, and the breadcrumb collapses correctly to 'All work'
  with Fit selected disabled; versus the golden's ring the loss of per-station name plates and
  the top-right task card is the stated design, not a regression."

Critic's notes, kept (Found / deferred): the card's stem crosses the label's text as a 1 px
line; a 7-station island's three columns touch at this camera and one cube protrudes below the
base plate's front edge; the third line loses its tail (the leading counts survive); the
selected cube has no visible lift at this zoom (the card and the inspector carry it); the
working fixture's header says 1 working beside two working rows and its activity list names a
`needs you` the roster does not show (fixture timing, outside the scene); the idle scenes'
`Task · working` beside idle agents is the golden's own, pre-existing; the lower third of the
scene is empty at Fit all.

### Goldens — NOT written

Per the run prompt: no golden was written, `UPDATE_GOLDENS=1` never ran (it would also
re-baseline `starter`). The three accepted fresh captures, for the user to copy after looking —
never `starter`. **Phases A–C left the same three goldens owed; this phase changes the same
three scenes and no other** (the platform scene replaces the ring in all of them):

- `out/visual/orchestration.fresh.png` → `verify/visual/goldens/orchestration.png`
- `out/visual/orchestration-dark.fresh.png` → `verify/visual/goldens/orchestration-dark.png`
- `out/visual/orchestration-working.fresh.png` → `verify/visual/goldens/orchestration-working.png`

## Gate

`npm run verify` on `f8d0c190` (2026-09-20 02:41–02:52, `/tmp/tc-electron-lock` taken, no stray
Electron, load 20 falling to 3 during the run): **53/55 suites in 657.9 s**. Every red is
pre-existing and attributed by id — the same nine Phase A, B and C list, none new:

- `verify:panels:agents` — `detail.1` (`docs/build-log/m275-swarm-presets.md:107`).
- `verify:panels:product` — `workflow.edit.1`, `workflow.edit.2`, `workflow.lib.1`,
  `workflow.wire.1`, `workflow.inspect.1`, `workflow.save.1`, `workflow.panel.1e`, `reach.1`
  (`docs/build-log/m277-libraries.md:78`).

New reds: **none.** Every new check passed inside the gate: `orch-3d.1–.6`, `orch-zoom.3`
(verify:orchestration 88/88); `orch-3d.app.1–.2`, `orch-zoom.app.1–.2`, `orch-parity.app.1–.4`
beside Phase A–C's twenty-two (verify:panels:orchestrate 30/30, 102.8 s in the gate);
`verify:meta` 50/50 (the README rows, `ledger.1`, the `// measured` pin); `verify:styles` 76/76
(the sort glyph and the breadcrumb separator moved to CSS pseudo-elements for `icons.1`).
Headroom in the gate: core 77%, shell 81%, kinds 83%, agents 78%, product 72%, orchestrate 75%.

The commits after the gate (the legibility pass: name plates below an 80 px pitch, cards for
the selected/hovered/waiting only with the waiting cards capped at three, the plate's lines
cut to their backing, the tools bottom-right, `N working` on the plate) are covered by
`verify:orchestration` 88/88, `verify:styles` 76/76, `verify:meta` 50/50, and
`verify:panels:orchestrate` 30/30 rerun on the final build (116.0 s with demo captures on),
plus `npm run shot` and `verify:visual` — not by a second full gate (a CSS/view-only delta,
the same reading Phase C took).

**Watchdog** (`verify:panels:orchestrate`): 116000 → **145000**, from green runs of 103.5 s,
106.4 s and 109.2 s at load 20–26, 102.8 s in the gate and 116.0–116.9 s with demo captures at
load 3 (four such runs on the closing builds); 1.25× the slowest. `agents` untouched at 116000 (91.0 s in the gate).

**`verify:visual`** (hand-run): 62/66 on the final build — `orchestration` 14.9%,
`orchestration-dark` 13.5%, `orchestration-working` 15.4% moved ON PURPOSE (the ring of cubes
is the platform scene now: three plates with labels, the corner tools and the minimap, the
name-plate rule); `starter` is the pre-existing red (`m279-ui-evolution.md:176`) and its golden
is left alone. The first cold run after the build tripped the 221 s watchdog (Phase A's trap;
the warm rerun is the reading), and one cold run on the earlier build read `starter` as "the
arrangement is not on screen", the flake the M279 ledger names.

## Found / deferred

Out of scope for Phase D by the run prompt, logged here if the run is tempted: the durable
timeline and restart reconciliation (Phase E), reusable arrangements and saved views beyond what
exists (E), CI/PR/deploy adapters (F), dependency editing, the Start task dialog.

Deferred, found while building (not Phase D):
- Artifacts are FILE PANELS placed on the platform whose directory owns their path. The plan's
  other artifacts — the review bundle, a preview, a report — have no per-island object yet; the
  Changes tab is the review bundle's door. A per-island "N changed files" artifact needs a read
  per island (the workbench reads the selection only) and is Phase E/F work.
- The ring model (`buildOrchestrationSnapshot`'s hub and `ORCH_RING_CAP`) still exists for its
  checks and the pipeline mode; the dev-mode scene no longer draws it. Removing it is a cleanup
  with ~30 checks to retire.
- Focusing the WORKSPACE plate sets the focus id to `__workspace__`, which no island has, so the
  inspector falls back to the primary task while the breadcrumb says Workspace. Harmless, and a
  loose session on it selects normally; a workspace inspector arm would close it.
- The adaptive tier never stepped down on this machine (16.8 ms mean at 100 sessions, under the
  24 ms line); the step is exercised in plain node and by pinning. A slower GPU is where it earns
  its keep, unmeasured here.
- `performance.memory` reads a constant 58 MB heap across fixtures — Chromium's coarse quantum;
  the working sets are the honest memory read.
- The 100-session fixture spreads sessions over ten directories; a single island of 100 stations
  is seated by the cap (8 + waiting) and expands on focus, but its expanded grid (10×10 at 46 px
  pitch) exceeds the stage at k = 1 and needs Fit selected — the plate does not scroll.
- The critic's composition notes: with one row of platforms Fit all is width-bound, so the
  plates sit in the middle third of the scene's height with an empty band above; the light
  theme's plate edges (`--iris` at 0.8 over `--deck-surface`) read faint and the selection lift
  is barely visible there — the reference's "blue-black material, cyan edges" is the dark theme's,
  and the light theme keeps its tokens by the product rule. A light-theme edge token is a
  restyle question, not this phase's.
- The critic's round-4 notes: the card's stem crosses the label text (route it behind the plate
  or end it at the plate's edge); a 7-station island's columns touch at Fit all and one cube
  protrudes below the plate's front edge (the grid's third row sits past the inner plate at this
  pitch); the selected cube's 6 px lift is invisible at the fitted zoom.
- Left/Right arrows in the LIST do nothing (the List keeps its row order for Up/Down); Tab reaches
  the sort buttons.
