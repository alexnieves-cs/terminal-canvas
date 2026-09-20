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

## Goldens owed

`verify:visual`'s `orchestration`, `orchestration-dark` and `orchestration-working` scenes
change on purpose; no golden is written on this branch (`UPDATE_GOLDENS=1` only after looking,
and the user decides). The captures to look at are listed under Gate.

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
