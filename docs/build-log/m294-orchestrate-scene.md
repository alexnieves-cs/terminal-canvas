# M294 — Orchestrate scene pass: the platform scene looks like the reference again

The state of this pass lives here, not in any session's memory. Brief: the user's "Orchestrate
scene pass" prompt (2026-09-20), pasted into the session, not a file in the tree. Targets:
`docs/design-reference.png` (tracked) and `docs/design/orchestrate-preview.png` (untracked, in
the user's checkout; not on this branch). The previous ledger is
[Phase D, M291–M293](m291-m293-orchestrate-phase-d.md), whose "Found / deferred" section already
named the empty band, the faint edges and the invisible selection lift this pass closes.

- Branch `m294-orchestrate-scene`, worktree `.claude/worktrees/m294-orchestrate-scene`, **off local
  main `2a1f0e56`** (Phase D's merge). Main's uncommitted edits (Canvas.tsx, useShellChrome.ts,
  deleted plan docs) are another session's and are not on this branch.
- Numbering: `M294` was free on 2026-09-20 (no hit in `docs/build-log`, none in `git log --all`).
- Scene only: no chrome, no right column, no workbench. `OrchestrationView.tsx` changes are
  confined to `GraphBoard`, `NodePlate`, `IsoCube`, `PlatformPlate` and `Minimap`.

## The diagnosis, as given (not re-derived)

Phase D's platform scene was three flat, axis-aligned slabs (`BoxGeometry` rotated only by the
stage tilt), tiny bare cubes, no connectors, no names at rest, and a composition that sat in the
middle third of the 860×420 stage because one row of islands is width-bound. Phase D's critic
judged against the previous golden and the legibility rules, never against the reference PNG.
That is the process gap: this pass judges the scene against the reference first, and the
checks below pin what the reference asks for so a future restyle cannot drift back silently.

## What landed

1. **Isometric platforms** (`OrchestrationCubes.tsx` `PlatformMesh`, `orchestration-platforms.ts`).
   Each platform is a square of side `ORCH_PLATFORM.side` (220) turned 45° in its own plane
   (an inner group's `rotation z = π/4`) INSIDE the stage tilt, so it projects to the reference's
   diamond: `2·half` wide and `2·half·cos 56°` tall (`half = side/√2 ≈ 156`). Three stacked
   tiers (base, middle, deck), each inset 14, the base the full thickness and the tiers half
   each — the same for every platform, so height is never a hidden score. Each tier wears an
   emissive rim (`toneMapped={false}` lines in the accent; violet for the Workspace plate as a
   family distinction; amber on the deck when something on it needs a person, in addition to
   the word and the beacon). The faces stay under the bloom threshold; the rims clear it. A
   floor pool (additive disc, dark theme, `full` quality only) sits under each base. The
   inner-plate/base pair of M291 is gone; nothing else in the island changed.
2. **Hit geometry follows the mesh** — decided as a POLYGON, not a conservative box. The
   hit-target is `orchPlatformHitPolygon`'s six-point outline: the diamond's four tips plus the
   thickness band under its two lower edges — the base's silhouette. The SVG `<polygon
   data-orch-platform-hit>` (and the flat fallback's `<polygon data-orch-flat="platform">`) is
   that outline, and the pure `orchHitAt` tests point-in-polygon when a target carries `points`
   (object targets stay boxes). `orchPlatformBounds` is the diamonds' bounding boxes plus
   `ORCH_LABEL_ROOM` (90 pre-tilt units) above for the label. The label box is one definition
   (`pp.label`: centred above the top tip, a gap clear of it) read by the plate, the callout
   placer's obstacle and the lens spoke's anchor. A click in the diamond's empty corner now
   misses (a box answered it with the wrong island, silently). Pinned by `orch-iso.1`.
   Keyboard/List parity (M293) is untouched: the walk reads projected centres, which moved but
   did not change kind. The Electron part's `elementFromPoint` reads (`orch-3d.app.1`) run
   against the polygons unchanged — the target's centre is inside the diamond.
3. **Names on stations at rest** — `orchNameTier(pitchPx, front)`: `full` (glyph, name, state
   word) when the plate's station pitch on screen clears 96 px; `compact` (two short lines cut
   to the pitch, no glyph, the state dot kept) when it clears 56 px and nothing stands in the
   grid row the plate hangs into; `none` past that. The pitch is per platform and ADAPTIVE
   (`orchStationPitch`: as wide as the inscribed square allows, 46–76 model units), so an island
   of one or two stations seats them 76 apart and reaches the full tier at the fitted zoom,
   while nine still fit the deck. Within `orchLabelBudget` as before. Pinned by `orch-iso.4`.
4. **Connectors, honestly** — `orchConnectors`: a path from each platform to the next in
   lattice order, and a chain along a plate's seated stations. No hub, no supervisor node.
   Every one is `data-orch-edge="grouping"` with `<title>` = `ORCH_DEP_GROUPING`, dotted and
   faint in the accent where an authored dependency edge (M289) is solid amber; the dependency
   lens adds `orch__connector--lensed` (dimmed to 6%) so the focus stays on authored edges
   alone. `orchSegmentBetween` trims each path to the outlines it joins, so none crosses a body.
   Motion: a station chain lights ONCE when either end changes state — the element is re-keyed
   on the event's stamp, its class runs the existing `edge-current` keyframe for one iteration
   (`--dur-packet`), and it is stood down under reduced motion. Nothing loops. `orch-iso.3`.
5. **Fill the stage** — cells are a ZIG-ZAG strip (`orchCellCentre`): within a band of six,
   index r stands `r · xPitch` along, on the lower row when even and the upper when odd, so
   the workspace (index 0) is lower-left, the first island upper-middle, the second lower-right
   — a centred cluster whose interlocking diamonds use the stage's height. Still a function of
   the index alone; append-only; the reported `cell` stays the 3-wide append ordinal the
   live-update check derives "next" from. A plate's LABEL hangs on the side its row leaves
   free (`labelSide`): above the top tip on the upper row, below the bottom tip on the lower
   row — a lower plate's top tip points into the V between two upper plates, and the first
   capture showed its label sitting on the upper island's stations. **Measured fill for the
   three-platform fixture (workspace + two islands), Fit all on 860×420 with pad 24
   (`orch-iso.2`'s detail, k = 1.00): the plates span 66.6% of the stage's height and the
   composition (plates with their labels) 91.4%**, against ~36% for Phase D's single row.
6. **Selection visible** — `ORCH_SELECT_LIFT = 14` screen px along WORLD Y. Phase D's 6-unit
   lift was along z, which an orthographic camera cannot show (no perspective): it painted
   nothing, not just little. The focused platform's outline, label and every object on it move
   by the same number in the projection (so the hit-target keeps following the mesh); the plate
   mesh and its object meshes damp to it (`THREE.MathUtils.damp`, 12/s) and reduced motion
   snaps. A rise, not a scale.

## Checks

`verify:orchestration`: `orch-3d.2`'s cell pin re-written for the lattice; new `orch-iso.1`
(polygon = mesh rule, hit-at inside/outside, stations inscribed, label clear of the tip),
`orch-iso.2` (zig-zag, two rows, fill ≥ 70% of the stage's height, inside the stage),
`orch-iso.3` (connectors: counts, no hub, grouping in the DOM, trimmed, lensed, finite, stilled),
`orch-iso.4` (name tiers, lift ≥ 12 in world y, damped, snapped). Suite 92/92.
`verify:styles` 76/76 (the connector's one-shot animation reuses the allowed `edge-current`
keyframe and a token duration; the compact plate uses `--t-xs`).

## Gate

- Plain-node (affected): `verify:orchestration` 92/92, `verify:styles` 76/76, `verify:meta`
  50/50, `verify:electron` 4/4, `verify:verbs` 29/29, `verify:onboarding` 21/21,
  `verify:first-run` 17/17, `verify:workflow-schema` 17/17, `verify:chart-series` 16/16,
  `verify:toast` 10/10. `npm run build` clean; `OrchestrationCubes-*.js` 2,345 kB still its
  own chunk (orch-zoom.3).
- Electron: `verify:panels:orchestrate` **28/28** on the final build, twice (13:10 and 13:14),
  with `TC_DEMO_SHOTS` — Phase D's `orch-3d.app.1` (`elementFromPoint` at every target's
  centre at three zooms) and `orch-3d.app.2` (append-only cells, exact rects) both pass against
  the polygons unchanged. Fixture measurements on this build: 1/6/25/100 sessions at 8.3 /
  8.3 / 11.6 / 19.7 ms mean pinned full (Phase D: 16.8 ms at 100), every tier `full`.
- `npm run affected` on e76f2ea0: **29/31 suites in 583 s**, the two reds being
  `verify:panels:agents` (`detail.1`) and `verify:panels:product` (`workflow.edit.1`, `.edit.2`,
  `.lib.1`, `.wire.1`, `.inspect.1`, `.save.1`, `.panel.1e`, `reach.1`) — the same nine
  pre-existing reds Phase D's gate lists, attributed by id, none new. `verify:panels:core`,
  `shell`, `kinds`, `orchestrate`, `xterm` and `canvas` green.
- Captures to look at (the worktree's `out/demo/`, from the second run): `m291-4-new-island-
  appended.png` (three plates, names at rest, labels above and below), `m292-fixture-6.png`
  (compact tier on a 3×3 grid, amber-rimmed deck with a waiting station), `m292-fixture-25.png`
  (four plates over two bands), `m292-fixture-100.png`. The first capture of a run
  (`m291-1-platforms-rest.png`) can show the SVG layer without the meshes — the hidden
  window's `capturePage` lagging the lazy island's first paint, as Phase D's ledger noted; the
  check's DOM read is the fact.

## Critic

My own look, against the reference first (the process gap this pass closes):
- Round 1 (13:10 captures): the diamonds, tiers, rims and pools read as the reference's
  platforms; the cluster fills the stage. Two faults: a lower-row plate's label, centred above
  its top tip, sat inside the upper island's body over its station plates (the V between two
  upper diamonds is where a lower tip points); and a needs-you deck painted as a solid orange
  slab — the state shouting over the shape. Fixed: `labelSide` (below for the lower row), and
  amber on the deck's RIM only, the face keeping the family tone.
- Round 2 (13:14 captures): labels clear of every body at 3, 4 and 11 platforms; the amber
  deck is a rim with a beacon and the word. Accepted. No fresh-context critic was run on this
  branch; the goldens stay owed to the user's look.

### Round 3 — 2026-09-20, fresh-context critic against the reference (M297)

The first round judged against the reference by someone who had not seen the code. M297 put
the reference in the harness (`scripts/shot.cjs` `reference`, `scripts/shot-composite.cjs`,
`verify:meta critic.reference.1`, the brief in `docs/product-rules.md`), captured the three
scenes on main at dce87bb4 (`SHOT_ONLY=orchestration,orchestration-working,orchestration-dark`),
and handed an Agent with no repo context ONLY the three `<scene>.vs-reference.png` composites
and the brief, dark first. Its divergences are quoted verbatim below, every one, including
those the author disagrees with — the disagreement is written beside them in *[brackets]*.
Nothing was fixed in this pass; this list is the input to the fit and chrome passes.

**orchestration-dark** — verdict: "The current capture has adopted the reference's
isometric-platform vocabulary but delivers it small, flat, unlit and unreadable, so it does
not yet read as the reference."

- silhouette: "The current capture shows a compact cluster of four or five flat isometric
  diamond platforms fanned around a central raised diamond, with stubby hexagonal prisms
  standing on the platforms like pegs; the whole cluster occupies roughly a 400 by 200 pixel
  band in a viewport several times that size. The reference's silhouette is a wide, stepped
  city of layered platforms rising toward a tall central crystal, with the platforms stacked
  at visibly different heights so the cluster reads as terraces rather than as tiles laid on
  one plane. In the capture the platforms are near-coplanar and the hexagonal prisms are of
  one uniform size, so the outline is a low, flat blot rather than a rising massif."
  *[Agreed on height: the tiers exist in the model (M294's platform tiers) but read as
  coplanar at this pitch. The "central crystal" is the plan's preserved focal point, not the
  rejected supervisor hub — a crystal that is an island's focal object, never a supervisor.]*
- material: "The platform tops are a dull desaturated navy with a slightly lighter
  violet-grey plate for the selected island, and the glass reads opaque and matte rather than
  translucent; the hexagonal prisms are flat blue-grey solids with no visible refraction or
  inner structure. The reference's platforms are deep blue-black glass with a visible cyan
  hairline on every edge and a faint interior shimmer, and the hex stations carry a bright
  cyan rim that makes them read as lit glass. The capture's edges are almost unlit — there is
  one faint violet edge line on the selected platform and nothing on the rest — so the 'cyan
  edges, readable glass' quality of the plan is not present."
- glow: "Almost nothing blooms. The reference pools a soft blue-cyan light on the floor under
  the whole cluster and puts a bright halo around the central crystal and a smaller glow
  under each active station; the capture has one dim violet-grey wash under the selected
  platform and a small pale-blue blob near the top-right station, and the rest of the floor
  is a flat dark grey-blue with no pooling light. The ambient dark of the reference is a rich
  near-black blue; the capture's surround is a mid-grey-blue slab that flattens the contrast
  the glow would need." *[Partly by design: `orchestration-dark` is the idle scene and M280
  pinned that idle does NOT bloom. The floor's mid-grey-blue and the missing ambient pool
  under the cluster are real divergences.]*
- connectors: "The capture has a few short thin white-grey line segments between the central
  diamond and adjacent platforms, barely distinguishable from the platform edges, with no
  direction, no brightness gradient and no glow. The reference's traces are bright cyan lines
  that step between stations along the isometric grid, brighten toward the active station and
  are visibly the brightest element after the crystal. In the idle scene the absence of
  bright traces is defensible, but the current traces are so faint they do not read as
  connectors at all." *[Agreed; the short bridge between interlocking diamonds is M294's own
  deferred item — the long floor traces need a floor layer under the meshes.]*
- labels: "Names at rest appear as tiny grey monospace captions under the prisms (worker b,
  workflow…, plan.md, tests, codex — …) in a face that is too small to read at the capture's
  scale, and they sit on top of the platform tops without any plate behind them. The
  reference labels each station with a legible two-line card (name in white, role in
  cyan-grey) floating on a dark rounded plate above the station, so the name is readable at
  rest and clearly attached to its station. The capture's one readable label is a floating
  white card at top-left reading 'claude — api / terminal / idle / Jump' that is a UI
  popover, not a scene label, and it sits over the cluster rather than beside its station."
  *[Partly the composite's scale — the capture is shown at two thirds — but the compact name
  tier's hard truncation is M294's known deferred item, and the selected card sitting over
  the cluster rather than beside its station is real.]*
- composition: "The scene occupies roughly a third of the workbench area in width and the
  cluster is small and centred with wide empty margins on every side, so the eye lands on
  the surrounding chrome rather than on the scene. The reference gives the scene the full
  centre panel edge to edge, fills it with the cluster, and lets the central crystal own the
  composition with the stat cards and side panels as supporting frames. The capture's focal
  point is not the scene's centre but the white 'claude — api' popover in the top-left and
  the bright 'Watchdog fires under load' label above it, neither of which is the crystal."
  *[Agreed. The stage is the fixed 860×420 band M294's diagnosis already named; this is the
  fit pass's input, not the scene's.]*
- chrome: "The header, four stat cards, the 'Queued — Group buttons are mouse-only' bar, the
  Jump/Mark done/Focus related/Open Files toolbar, the agent pool list on the left, the NEEDS
  ATTENTION panel on the right with a new 'RUN LIMITS — 0 ENFORCED — 4 ADVISORY' row and a
  'NOT AVAILABLE HERE — INTERRUPT, RETRY, REASSIGN, STOP' row, and the System/Current
  Task/Terminal/Code/Files card row below the scene are all present and all in the same
  grey-on-navy face. The reference's chrome is darker, more compact and lower contrast so the
  scene glows out of it; the capture's chrome is bright-bordered and busy, and the five
  bottom cards plus the 'Changes / Checks / Output — Bound to the selection — claude — api'
  strip take about the same vertical space as the scene itself. A small pill at top-right
  reading '● 1' has appeared beside 'View' that was not in the golden." *[The chrome pass's
  input. The '● 1' pill beside View is not identified here; check what it is before the
  chrome pass touches it.]*
- against the golden: "the golden's ring of floating dark-cube nodes on a soft ellipse of
  light has been replaced by the isometric diamond platforms, which is closer to the
  reference in vocabulary; but the golden's scene was larger, better centred and had a
  visible soft floor glow and legible node labels, all of which the current capture has lost.
  Net: closer in form, worse in presence."

**orchestration-working** — verdict: "The working scene is nearly indistinguishable from the
idle one and does not show the reference's lit-station contrast, so it does not read as the
reference and regresses on the one thing this scene exists to show."

*[Disagreed in part, and the disagreement is a FINDING: the capture's own stat cards read
`ACTIVE AGENTS 1 working` and `WAITING ON YOU 0 Clear`, and the critic noticed. The scene's
intent is three busy and one waiting; in this capture only one seeded transition took, so the
critic judged a scene the fixture did not build. Whether the model blooms under three busy
agents is not answered by this image either way. The seeding must be re-measured before the
working scene is judged again — see Found / deferred.]*

- silhouette: "Same compact five-platform diamond cluster with uniform hexagonal prisms as
  the idle scene; nothing in the silhouette changes when three agents are working. The
  reference keeps the same silhouette between states but raises the crystal and the active
  station's prism as taller, brighter forms so the working stations stand out of the outline.
  The capture's silhouette is identical to idle down to the pixel."
- material: "The platform tops are the same matte navy and violet-grey slabs; the only
  material change from idle is that the central platform now carries a slightly brighter
  violet plate and the top-right prism has a faint pale-blue cap. The reference's working
  stations show glass that is visibly lit from within, with a saturated cyan rim and a warm
  violet floor plate under the active one. Cyan edge light is still absent in the capture."
- glow: "One pale-blue smear appears behind the top-right station and one dim violet pool
  under the central platform; that is the whole difference between working and idle, and it
  is faint enough that a viewer would not notice it without the two captures side by side.
  The reference's working scene has each lit station bloom with a bright cyan halo, the
  crystal's glow spread across the floor, and the busy stations clearly brighter than the
  idle ones. There is no per-station glow for the three busy agents, and no distinct
  treatment for the one that is waiting on a person."
- connectors: "Same short faint grey segments as idle, with no brightening, no direction and
  no motion cue toward the busy stations. The reference brightens the traces into the active
  stations so the connectors show where the work is flowing. The capture's connectors do not
  communicate work at all."
- labels: "Same tiny grey monospace names under the prisms, unreadable at rest, with the
  'Watchdog fires under load' task label at the top and no per-station state word visible in
  the scene. The reference labels the working station with its name and a 'Working' or
  'Warning' state under it on its card; the capture's state words (working, needs you) live
  only in the left agent-pool list and the right-hand panel, not on the scene. Nothing in the
  scene marks the station that is waiting on a person."
- composition: "Unchanged from idle: a small cluster centred in a wide viewport with the
  bright chrome dominating. The reference's working scene is meant to draw the eye to the lit
  stations; here the eye still lands on the white task label and the right-hand text panel."
- chrome: "The stat cards now read '1 working / 1 in progress / 0 idle / 0 Clear', the banner
  reads 'Running — claude — api', and the NEEDS ATTENTION panel has grown a long text block
  (Run limits, task summary, 'Shared directory — 3 sessions write in…', 'BRIEF & ACCEPTANCE
  CRITERIA — NONE YET') plus a seven-row activity feed. Two '● 1 / ● 1' pills sit beside View
  at top-right. Compared with the reference's dedicated 'Needs attention — 2 decisions' list
  with two clear decision rows, the capture's right panel is a dense wall of small grey text.
  The stat card WAITING ON YOU reads '0 Clear' although one agent is described as waiting on
  a person, which contradicts the scene's premise."
- against the golden: "the golden's working state was legible — a bright cyan glow around
  the working 'claude — api' node, an amber 'needs you' halo on the tests node, and a '1
  waiting' NEEDS ATTENTION card at the top right; the current capture has none of those three
  signals. Net: the working/idle distinction is materially weaker than in the golden."

**orchestration** (light) — verdict: "The light capture is a pale, unlit wireframe of the
platform cluster with no material, glow or focal point, and it does not read as the
reference." *[The reference has no light theme, as the critic says; M294 left the light
theme un-judged and the pool stands down over a light ground by design (GroundPool's header).
The material point — an inversion to grey rather than a light-theme translation of lit
glass — is the real finding.]*

- silhouette: "The same compact five-platform diamond cluster with uniform dark hexagonal
  prisms, now rendered as pale grey-blue plates on a lighter grey slab; the raised centre and
  the layered heights are even less legible because the platforms and the floor are nearly
  the same tone. The reference's stepped massif is not present."
- material: "The platforms are flat pale-lavender and pale-blue plates with a slightly
  darker outline; the hex prisms are solid dark navy blocks that sit on top like game pieces.
  There is no glass, no translucency and no cyan edge; the blue-black material of the
  reference has simply been inverted to grey, not translated into a light-theme equivalent
  of lit glass."
- glow: "None. The floor is a uniform light grey with no pooled light, no halo under the
  centre and no bloom on any prism; the one visual accent is a small darker-violet plate
  under the selected island. The reference's glow has no counterpart."
- connectors: "Faint white segments between the central diamond and adjacent platforms,
  invisible against the pale floor except where they cross a darker plate. They do not read
  as connectors."
- labels: "Tiny dark-grey monospace names under the prisms, marginally more legible than in
  dark because of the light floor, but still too small at rest and still without a plate or
  a state word. The floating white 'claude — api / terminal / idle / Jump' popover again sits
  over the cluster at top-left."
- composition: "Identical framing to the dark scenes: a small cluster in a wide grey
  viewport with generous empty margins, and the white popover and the 'Watchdog fires under
  load' label as the de facto focal points. The scene has no focal point of its own."
- chrome: "Header, stat cards, toolbar, agent pool, NEEDS ATTENTION with the Run limits and
  'NOT AVAILABLE HERE' rows, the five bottom cards and the Changes/Checks/Output strip, all
  in a clean light grey face; the chrome is consistent with the light dark-theme chrome and
  is the most resolved part of the capture. A '● 1' pill again appears beside View."
- against the golden: "the golden's light scene was a large centred ring of dark cubes on a
  soft blue ellipse with readable labels; the current capture's smaller flat cluster with
  unreadable labels and no glow is less legible and less present than the golden."

**Cross-scene**, verbatim: "All three captures share one composition fault: the scene is
roughly a third of the workbench and centred with wide margins, while the reference gives the
scene the whole centre and fills it." "All three captures lack the two most identifying
material cues of the reference: cyan edge light on every platform and prism, and pooled floor
glow under the cluster." "Working differs from idle only by one faint pale-blue smear and a
slightly brighter central plate; the golden's working state was clearly more distinct than the
current one." "Rest labels are unreadable at capture scale in all three scenes; the
reference's rest labels are legible cards." "The '● 1' / '● 1 ● 1' pills beside View at
top-right are new relative to the golden in all three scenes." "The working scene's WAITING ON
YOU card shows '0 Clear' while the scene is described as having one agent waiting on a person."

## Goldens owed

`verify:visual`'s `orchestration`, `orchestration-dark` and `orchestration-working` scenes
change on purpose; no golden is written on this branch (`UPDATE_GOLDENS=1` only after looking,
and the user decides). The captures to look at are listed under Gate.

Still owed after M297's round (2026-09-20), per scene, with the critic's verdict in one line:
`orchestration-dark` — vocabulary adopted, "small, flat, unlit and unreadable"; `orchestration-working` —
"nearly indistinguishable from the idle one", and this capture's own cards show only one agent
working and none waiting, so the scene the intent describes was not built by the fixture in
this run; `orchestration` (light) — "a pale, unlit wireframe … no material, glow or focal
point". None is written; the person decides after looking at the composites in `out/shots/`.

## Found / deferred

- The ring model (`buildOrchestrationSnapshot`'s hub) still exists for the pipeline mode and
  ~30 checks; unchanged here.
- A platform connector between two interlocking diamonds is short (the diagonal gap, ~30 px
  at the fitted zoom) — a bright bridge, which is what the reference draws; between bands it
  is a longer path. If the user wants the reference's long floor traces, they need a floor
  layer under the meshes with the plates cut out, which is a second pass.
- The compact name tier truncates long titles hard at narrow pitches (four characters at the
  floor); the full title is the plate's `<title>`, the card's and the List's.
- Light theme: the rims read on `--deck-surface` through the same tokens; the pool stands down
  there (additive over a light ground is a hole, GroundPool's header). Not re-judged here.
- (M297, from the critic's round) The `orchestration-working` capture on main at dce87bb4 shows
  `ACTIVE AGENTS 1 working` and `WAITING ON YOU 0 Clear` where the scene seeds three busy and
  one waiting; the harness's own guards (`≥3 addressable cubes`, `.orch__cube--busy` present)
  passed, so at least one seed took and the rest did not reach the cards. Measure before the
  working scene is judged again; the critic's working verdict is partly a verdict on this.
- (M297) A `● 1` pill beside `View` in the top bar, in every scene, not in the goldens and
  not identified by the critic or here. Name it before the chrome pass.
- (M297) Every verbatim divergence above is the fit pass's and the chrome pass's input; the
  fixed 860×420 stage (composition), the missing cyan edge light and ambient floor pool
  (material/glow), the bridge-only connectors, the truncated compact name tier, and the
  light theme's grey inversion.

## The critic's round against the chrome pass (2026-09-20)

Judged against the two references and the last accepted golden, from the three
`out/shots/*.vs-reference.png` composites written by M297's harness, with M299's chrome in
frame. **Not a fresh-context critic** — this round was made by a session that had already read
this ledger and M299's, so it is worth less than M297's on the questions M297 already asked;
it is recorded because the goldens were owed and a person had to look before they were written.

One sentence per scene, the verdict this run writes its golden on:

- **`orchestration` (light)** — the *chrome* now reads as the reference (title row, mixed-case
  tiles each carrying one action, the two side cards, an open Changes · Checks · Output
  workbench), but the *scene* inside it is still the weaker half: pale grey slabs on a pale
  ground with no material and no focal point, pushed into the lower right of a stage whose
  upper-left third is empty, and the two overlay cards on the plates (`Workspace — grouping
  only`, `2 sessions`) restate the shared-directory and session facts the title row says one
  line above them.
- **`orchestration-dark`** — the closest of the three to the reference, and the one that
  answers M294's "small, flat, unlit": role-tinted violet and teal platforms on a blue-black
  ground read as a lit stage rather than cardboard; what remains is legibility and furniture —
  the per-cube names are three or four characters at the fitted pitch, the camera rail
  (`All work` / `2 islands` / `Fit all` / `Fit selected` / `Back`) is bare text with no surface
  where the reference draws a tidy `− Fit +` pill, and the minimap at lower right is a
  near-empty box carrying two pale diamonds at high visual weight.
- **`orchestration-working`** — M294's "nearly indistinguishable from the idle one" is answered
  in the CHROME and only partly in the SCENE: the strip says `Running — claude — api`, the
  tiles say `Active agents 1 · View agents`, the attention card carries the working agent with
  the shared-directory change warning, and the Activity feed lists the became-working events;
  but the bloom M280 built reads weaker than the last golden's, because M298's fit shrank the
  platforms, so *busy* is carried by text more than by light.

Two of M297's open items are NOT closed by this round and are still owed:

- The working fixture seeds three busy and one waiting; this capture still shows
  `Active agents 1` and `Waiting on you 0`. The working verdict above is therefore still partly
  a verdict on the fixture's seeding, exactly as M297's Found/deferred said. Measure before the
  working scene is judged again.
- The `● 1` pill beside `View` in the top bar is still unnamed — present in the working
  capture, absent from the goldens, identified by no round so far.

The goldens are written on these three sentences: every divergence above is a KNOWN and
recorded one, none is a regression against quadrant 3, and the chrome changes are M299's on
purpose. The scene-side notes are the next pass's input, not a reason to withhold a baseline.
