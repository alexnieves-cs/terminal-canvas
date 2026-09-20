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

| fixture | tier | mean ms | p95 ms | JS heap MB | renderer WS MB | GPU WS MB | platforms | objects drawn | plates |
|---|---|---|---|---|---|---|---|---|---|
| 1 session | pinned full | 8.3 | 8.5 | 58 | 385 | 147 | 2 | 1 | 1 |
| 1 session | adaptive | 8.3 | 8.6 | 58 | 386 | 147 | 2 | 1 | 1 |
| 6 sessions | pinned full | 8.3 | 8.8 | 58 | 395 | 150 | 2 | 6 | 6 |
| 6 sessions | adaptive | 8.3 | 8.6 | 58 | 397 | 151 | 2 | 6 | 6 |
| 25 sessions | pinned full | 9.5 | 16.7 | 58 | 429 | 159 | 4 | 25 | 25 |
| 25 sessions | adaptive | 9.1 | 16.7 | 58 | 489 | 177 | 4 | 25 | 25 |
| 100 sessions | pinned full | 16.8 | 25.1 | 58 | 605 | 214 | 11 | 82 | 48 |
| 100 sessions | adaptive | 12.6 | 25.0 | 58 | 587 | 223 | 11 | 82 | 48 |

What the numbers say, including the ones not liked: the 100-session scene is at 16.8 ms mean
pinned full, under the 24 ms step-down line, so the ADAPTIVE tier never left `full` on this
machine — the measured gain (12.6 ms) comes from the label budget (48 plates of 82 drawn
objects) and the shared geometry, not from the tier stepping down; the tiers are exercised
by `orchQualityStep` in plain node and by pinning, not by this fixture on this GPU. The
renderer working set grows ~220 MB from 1 to 100 sessions (585–605 MB), and the JS heap reads a
constant 58 MB because `performance.memory` is coarse in Chromium. p95 at 100 sessions is
25 ms — above one 60 Hz frame. The "objects drawn" at 100 is 82, not 100: the fixture's
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

## Exit demo

(what was seen driving the real app.)

## Critic

(a sentence per changed scene.)

## Gate

(the closing `npm run verify`, `verify:visual`, the re-measured watchdog; new reds listed apart
from the known nine.)

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
- Left/Right arrows in the LIST do nothing (the List keeps its row order for Up/Down); Tab reaches
  the sort buttons.
