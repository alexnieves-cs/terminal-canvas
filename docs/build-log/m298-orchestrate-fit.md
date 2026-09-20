# M298 — Orchestrate fit: the composition fills the stage at every count and window size

The state of this pass lives here. Brief: the user's "Prompt 2: fit and composition"
(2026-09-20), pasted into the session, not a file in the tree. The previous ledger is
[M294](m294-orchestrate-scene.md), whose fill was measured for ONE case (three platforms, the
860×420 model stage, k = 1.00) and whose critic round (M297) named the composition — "roughly a
third of the workbench … wide empty margins" — as this pass's input.

- Branch `worktree-m298-orchestrate-fit`, worktree `.claude/worktrees/m298-orchestrate-fit`,
  off local main `f64efbe3` (M297's ledger commit). Main's uncommitted edits are another
  session's and are not on this branch.
- Numbering: the Phase E run prompt reserves M294–M296 and M297 is the critic reference, so
  `M298` was the next free number on 2026-09-20 (no hit in `docs/build-log`, none in branches).
- Scene and its camera only: `orchestration-platforms.ts`, `orchestration-depth.ts`,
  `GraphBoard` and `PlatformPlate` in `OrchestrationView.tsx`, the rail's CSS. No chrome, no
  workbench, no material — those are the chrome pass's.

## 1. Measured before anything changed

Two instruments, both kept: the plain-node table (`orch-fit.1` builds it on every run) and the
Electron part's `orch-fit.app.1`, which seeds 0 / 1 / 21 / 61 / 100 sessions (→ 1 / 2 / 4 / 8 /
11 platforms; the existing fixtures' `ceil(n / 10)` islands plus the workspace plate), sets the
window to three sizes, clicks Fit all and reads the DOM: the scene panel's box, the union of the
platform hit polygons, the union of the label plates, and whether any tool's box meets one.

**The scene panel is not the model stage.** `.orch__graph-wrap` measured, CSS px, at the
window sizes the check drives (the app's default `window.ts` 1200×800, a narrow 1100×720, a
wide 1900×1100):

| window | scene panel | aspect |
|---|---|---|
| default 1200×800 | 536×224 | 2.39 |
| narrow 1100×720 | 812×224 | 3.63 |
| wide 1900×1100 | 1128×649 | 1.74 |

The 224 is `.orch__graph-wrap`'s `min-height: 14rem` — at the default and narrow windows the
five bottom cards and the stat cards leave the scene its minimum. That is the dominant fact
about the composition and it is the chrome pass's, not the fit's (the frame around the scene,
not the scene). The fixed 860×420 stage (2.05) letterboxed inside all three (`xMidYMid meet`),
so M294's "91.4% of the stage" was 91.4% of a band of the panel.

**Before (main at f64efbe3), share of the PANEL at Fit all** (`plate` = the diamonds' union,
`comp` = diamonds and label plates; `first` = the camera on page open before any click):

| platforms | default plate H / comp H / comp W | narrow comp H / W | wide comp H / W | faults |
|---|---|---|---|---|
| 1 | 0.67 / 0.80 / 0.48 | 0.82 / 0.32 | 0.68 / 0.57 | **first paint not fitted**: 0.43 / 0.55 / 0.31, clipped (the lone plate sits lower-left at k = 1); tools covered a plate (default) |
| 2 | 0.66 / 0.91 / 0.47 | 0.81 / 0.31 | 0.77 / 0.55 | tools covered a plate (default) |
| 4 | 0.66 / 0.91 / 0.80 | 0.81 / 0.53 | 0.77 / 0.94 | tools covered 2 (default) |
| 8 | 0.74 / 0.98 / 0.90 | 0.98 / 0.59 | 0.84 / 1.05 | **label clipped** (default, wide); tools covered 2 (default) |
| 11 | 0.74 / 0.98 / 0.90 | 0.98 / 0.59 | 0.84 / 1.05 | as 8; tools covered 3 (wide) |

Model-stage only (plain node, no Electron fixture at these sizes): 3 platforms plate W 0.75; 7
and 11 clip the bottom label by 1 px (comp H 0.99); **25 platforms**: bands of six stack down, the
fleet is 42% as wide as the stage and 106% as tall, clipped; **100 platforms**: 29% wide, 179% tall
— the wheel's zoom floor (0.22) cannot fit it at all.

Suspects from the brief, each verified: one or two platforms — do NOT collapse to a strip (the
zig-zag's second cell is already the upper row), but two fill 47–55% of the width and there is
nothing to trade for it, the shape is two interlocking diamonds; the aspect ratio — real, above;
the first-mount camera — NOT Fit all for one platform (the M292 effect skipped `n <= 1`); Fit
selected lower vs upper row — the label room was on the label's side in both, symmetric, no
fault; minimap and corner tools — covered a plate or a label in every default-window fixture and
at 11 platforms wide, because a composition that fills the panel has no empty corner.

## 2. What changed

1. **The stage follows the panel** (`GraphBoard`): width stays 860 model units, height is what
   the scene's box makes it (`ResizeObserver` on `.orch__graph-scene`, whole units, floor 120);
   the ground SVG, the R3F island's viewBox, the overlay SVG, the callout placer's clamps and the
   pan's px→unit scale all read the one `stage`. No letterbox, so a fit against the stage is a fit
   against the panel. The persisted camera's meaning is unchanged (offsets from the stage centre).
2. **Labels are pixels, not model units** (`orchLabelMargins`, `orchFitCamera`'s `margins`).
   `orchPlatformBounds` is the diamonds only; the fit reserves 52 (plate + gap) above when any
   platform hangs a label above, below when any hangs below, the `+N more` chip's row on that
   side only when a plate has one, and sideways the label's half-width past the outermost
   plate's centre — solved, not iterated: `k·(w − 2·half) + 2·105 ≤ box`. The old 90-unit room
   scaled with k: 79 px for a 52 px label at one platform, 33 px at eight (the clip).
3. **Fit all has its own floor** (`ORCH_FIT_FLOOR = 0.06`) under the wheel's 0.22: everything,
   always; a hundred platforms land at the summary level semantic zoom already gives them. A
   wheel notch clamps back into the wheel's range.
4. **The lattice is a pyramid past the first band** (`ORCH_BAND_GROWTH = 2`, `orchBandOf`):
   band 0 is M294's six cells to the unit; band b has 6 + 2b cells and starts b pitches further
   left, so every band is centred under the first. Still a function of the index alone and
   append-only; a returning user with a seventh island finds it moved once, by this change.
   25 platforms: 1967 wide × 1540·cos tilt tall pre-tilt (was 1139 × 2071); 100: 3291 × 2945.
5. **First paint fits a lone platform too**: the M292 effect's `n <= 1` exclusion is gone (the
   camera-was-moved guard stays). And because the stage is read a render after the first fit, a
   camera the auto-fit set is fitted again when the measured stage arrives (`autoFitted`);
   a camera a person has moved (Fit, wheel, pan, minimap) is not.
6. **The tools are a rail, not a corner** (`--orch-rail-w: 8.5rem`): breadcrumb (stacked, one
   crumb per line), Fit all / Fit selected / Back, the minimap, in a column right of the scene,
   `.orch__graph-scene { inset: 0 var(--orch-rail-w) 0 0 }`. The rail's width is the fit's to
   lose at wide windows (11% of 1128 px) and nothing at the default and narrow ones, where the
   fit is height-bound. The `+N more` chip moved from beside the label (where it ran past the
   reserved width into the rail) to the label's far side, inside its width; the label plate is
   capped at `ORCH_PLATE_LABEL.w`. The islands float (`.orch__float--task`) keeps its place over
   the scene's top-right, left of the rail.

**After, share of the PANEL at Fit all**, the same Electron reads (the `wrap` in the check is
still the whole `.orch__graph-wrap`, rail included, so these are conservative by the rail's
width):

| platforms | default plate H / comp H / comp W | narrow comp H / W | wide comp H / W | clipped / covered |
|---|---|---|---|---|
| 1 (first paint = Fit all) | 0.80 / 0.91 / 0.57 | 0.82 / 0.30 | 0.80 / 0.70 | 0 / 0 |
| 2 | 0.68 / 0.90 / 0.48 | 0.81 / 0.22 | 0.92 / 0.72 | 0 / 0 |
| 4 | 0.58 / 0.80 / 0.70 | 0.81 / 0.36 | 0.68 / 0.83 | 0 / 0 |
| 8 | 0.57 / 0.84 / 0.66 | 0.71 / 0.30 | 0.74 / 0.82 | 0 / 0 |
| 11 | 0.57 / 0.89 / 0.66 | 0.80 / 0.30 | 0.78 / 0.82 | 0 / 0 |

Plain node, the same fit on the three measured panel shapes (`orch-fit.1`'s table, 400×224 /
676×224 / 992×649 — the panels less the rail): no clip at any of 1, 2, 3, 4, 7, 11, 25, 100; the
composition is bound on one axis (≥ 90% of the padded box's width or height) or at the zoom
ceiling in every cell; 25 platforms comp H 0.87 / comp W 0.94 at default, 100: 0.89 / 0.92.

**What stays honest rather than fixed.** The narrow window (812×224, aspect 3.6) is
height-bound at every count: the labels' 104 px are 46% of the panel's height, so eight
platforms' plates are 27% of it and the composition 30% of the width. Nothing in the fit can
trade that; the panel is 224 px tall because of the chrome around it. Two platforms fill about
half the width everywhere, for the same reason a pair of interlocking diamonds is taller than it
is wide.

## Checks

`verify:orchestration` 94/94: `orch-iso.2` now measures the fit the view makes (margins and
floor); new `orch-fit.1` (the count × panel table above, no clip, bound on one axis, plates ≥ 40%
of the height, margins are pixels, the floor is under the wheel's) and `orch-fit.2` (band 0 is
M294's to the unit, later bands widen by two and centre, index-only, 25 and 100 wider than tall;
the first-paint rule, the auto-fit refit and the rail inset pinned as text). `verify:styles`
76/76, `verify:meta` green (the watchdog comment must begin "measured" — `panels-split.1`).
`verify:panels:orchestrate`: new `orch-fit.app.1` (the Electron table above: nothing clips,
nothing covered, comp H ≥ 60% of the panel at every count and size, a lone platform fitted on the
first paint); watchdog re-pinned 145000 → 180000 (142.8 s and 142.2 s measured with captures on).

## Gate

- Plain node: `verify:orchestration` 94/94, `verify:styles` 76/76, `verify:meta` green,
  `npm run build` clean.
- Electron: `verify:panels:orchestrate` green whole (no FAIL line) at 142.2 s with
  `TC_DEMO_SHOTS`, on the build with the chip and label cap in; then, after the islands-float
  offset, `orch-fit.app.1`, `orch-zoom.app.1` and `orch-parity.app.4` (the narrow-window reach
  check the rail could have broken) green again at 119.7 s.
- Captures (the worktree's `out/m298/shots/`): `m298-fit-<platforms>-<size>.png` for 1/2/4/8/11
  × default/narrow/wide. The 11-platform default capture is the one to look at: every label
  inside, chips on the far side of their labels, the rail beside the composition.

## Goldens owed

`verify:visual`'s three Orchestrate scenes change on purpose (the stage's aspect, the rail); no
golden is written here. The person decides after looking, as M294's ledger already says.

## Long floor traces — not started, cost written

M294's deferred item: connectors between bands are short bridges; the reference draws long
floor traces. Not begun (the brief says ask first). The cost:

- A floor layer UNDER the meshes with the plates cut out: a new mesh in `OrchestrationCubes.tsx`
  (`PlatformMesh`'s sibling, one plane per scene with a stencil or an alpha mask from the
  platforms' projected diamonds), plus the trace paths computed in `orchestration-platforms.ts`
  beside `orchConnectors` (a lattice walk between plate centres, stepping along the isometric
  grid rather than the straight `orchSegmentBetween`).
- Demand frameloop (M279's `frameloop="demand"`): a lit trace that brightens toward the active
  station is motion, so it needs `invalidate()` per frame while lit and must go still under
  reduced motion — the same one-shot rule as the station chains (`orch-iso.3`).
- Quality tiers (M292): the mask costs a second pass; `lean` would draw traces flat (no bloom),
  `flat` (the SVG fallback) would need an SVG equivalent, or the traces stay the short bridges
  there — a rule to write down either way.
- Checks: `orch-iso.3`'s counts and "trimmed clear of both outlines" hold for the bridges; a
  floor trace crosses under plates by design, so it needs its own id (`orch-trace.*`) and the
  bloom door pins (`orch.bloom-door.1/.2`) must stay green — a second importer of
  `postprocessing` undoes the deferred chunk silently.

## Found / deferred

- The scene panel's 224 px at the default window (`min-height: 14rem` winning over `flex: 1`
  against the bottom cards) is the composition finding the critic made; the chrome pass owns it.
- The islands float still sits over the scene's top-right (now left of the rail); M297's critic
  named it. Chrome pass.
- The suite footer prints `FAIL undefined` for a failed check — `verify-orchestration.cjs`'s
  tail reads `f.id` where results carry `n`. Pre-existing, cosmetic; left alone.
- The Electron check's `wrap` is the whole graph-wrap including the rail; a stricter read would
  measure against `.orch__graph-scene`. The thresholds were set against the wider box, so they
  are conservative.
