# M69 — The overview

**Status:** design, 2026-09-02. **Branch:** `m69-overview`.
**Brief section built against:** The far view. Principles 1 (one state vocabulary — the
blocks are the tones), 4 (line not shadow), 6 (every control says what it is). Feature and
surface: shot at 22% and 100% with the minimap, looked at, critiqued.

## What this milestone is for

Below `SUMMARY_ENTER` a terminal card becomes `edge · title · state word`; below
`BLOCK_ENTER` it becomes a block in its tone. Every other kind stays a shrunken full frame
with 4px body text — M67's critic: "review/file/toolbox/Jira tiles are shrunken full frames
with unreadable body text, not `edge · title · state`". And the status board the brief
promises — the same blocks at thumbnail scale, visible while working at 100% — does not
exist: backlog #33, in.

## Design

### Summary and block tiers for every kind

- `PanelFrame` takes the current `CardDetail` from a context Canvas provides (one change,
  five kinds; no kind threads a prop). At `summary` the frame renders, in place of its
  children, the same `.panel__card-summary` a terminal renders: the title and, in the state
  slot, the kind's word (`review`, `file`, `note`, `toolbox`, `Jira`). At `block` it renders
  `.panel__card-block` with `data-tone="kind"` and the title. The chrome row stays (the state
  edge is the frame's border, so the edge survives every tier). A terminal keeps its own
  three tiers untouched.
- The frame's summary/block markup carries `data-card-summary` / `data-card-block` like the
  terminal's, so the far-view checks read one shape.

### The minimap

- `minimap.ts` (pure, in the viewport bundle): `minimapProjection({ rects, viewport, size,
  thumb })` fits every rect plus the viewport's world rect into a `thumb` box (uniform scale,
  centred, `PAD` inside) and returns `{ scale, ox, oy, blocks: [{ id, x, y, w, h }], view: {
  x, y, w, h } }`; `minimapToWorld(point, projection)` inverts it; `viewportCentredAt(world,
  viewport, size)` is the camera whose centre is that world point at the current scale. Empty
  rects → the viewport alone fills the thumb.
- `Minimap.tsx` in the top-right of the canvas, outside `.world`, 200×120, hairline frame on
  `--s-2`, `pointer-events: auto` (the one overlay besides the HUD's zoom cluster that takes
  the pointer). Each block is a `div` in its tone (`[data-tone]`, `--tone-dim` fill and a
  `--tone` hairline; sessionless kinds `kind`), read per panel through the rail rows' state
  input and the agent-state store, so a bell recolours one block. The viewport is a `--iris`
  hairline rectangle. `title="Overview — click or drag to move the camera"`, `role="img"`
  with an `aria-label` naming the counts.
- **Click** on the minimap flies the camera (`goToViewport`, so the trail records it) to the
  viewport centred at that world point. **Drag** previews the camera's rectangle under the pointer and moves on release
  (amended 2026-09-02: a live drag needs the camera's setter, which useViewport keeps
  private on purpose; the release goes through `goToViewport`, so the trail records one
  entry). **Wheel over it yields** (`shouldYieldWheel` rule
  beside the HUD's).
- **`canvas.minimap`** (boolean, default on, Shell category): off removes the element.

## What it must not break

- `.world` remains the only transformed layer; the minimap never transforms it.
- `verify:panels` 10 (drag recompute) and every `.panel__card-*` reader for terminals.
- The pips and lane headers keep their z-order; the minimap sits below the palette.

## Checks

- `verify:viewport minimap.1` — the projection fits every rect and the viewport into the
  thumb with `PAD` clear on all sides and one uniform scale; `minimap.2` — `minimapToWorld`
  inverts `worldToMinimap` to within 1e-6, and the empty case fills the thumb with the
  viewport; `minimap.3` — `viewportCentredAt` keeps the scale and puts the point at the
  centre.
- `verify:panels overview.1` — at 8% every sessionless kind's frame carries
  `[data-card-block]` with `data-tone="kind"` and the title; at 20% `[data-card-summary]` with
  the kind's word; `overview.2` — the minimap renders one block per panel with the panel's
  tone, a click flies the camera to the clicked world point (read through `__m4aViewport`),
  and `canvas.minimap` off removes it.

## Definition of done

Every item; checks red first; shot at 22% and 100% (the existing scenes plus an `overview`
scene with a bell ringing so one block is amber); looked at; critiqued; verified; merged;
branched `m70-ship`.
