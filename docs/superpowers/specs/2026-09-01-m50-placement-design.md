# M50 — Placement: snapping and tidy

**Status:** designed 2026-09-02. Backlog #25's two remaining pieces (spawn
placement landed in M6 as `cascadeCentre`); the scope decision's §4 row
"Placement: snapping and tidy".

## What this milestone is for

An infinite canvas's characteristic failure is entropy: twenty panels placed
by twenty individual decisions become a sprawl. The fix is not a capability
but a small amount of arithmetic at the right moments — while a panel is
being dragged, and on request over a selection.

## Decisions

1. **Snapping is a pure function over `applyDrag`'s output.** `applyDrag`
   is already the single place a drag resolves to a rect and it is pure;
   `snapRect(rect, others, threshold)` takes its result, the OTHER panels'
   rects, and a world-unit threshold, and returns the snapped rect plus the
   guides it snapped to (`{ axis, at }`). Edges snap to edges and centres to
   centres; the smallest candidate delta within the threshold wins per axis;
   nothing snaps to itself.
2. **The threshold is SCREEN pixels over `scale`.** `SNAP_PX = 8`, divided
   by `viewport.scale` at the call site — the same `1/k` relationship
   `applyDrag` embodies and `verify:viewport` 27 pins. A world-unit
   threshold is huge zoomed out and invisible zoomed in.
3. **A resize snaps its moving edges and never fights the floor.** For a
   resize only the growing edges are candidates, and the snapped size is
   clamped to `MIN_PANEL_W`/`MIN_PANEL_H` after snapping — a snap that
   produced a rect the validator rejects would produce a canvas that cannot
   be saved.
4. **Guides are drawn in `.world`**, as the link layer is: world-space
   lines at the snapped coordinate, spanning the union of the two rects
   involved, present only while a drag is snapping. A guide layer outside
   the world would have to re-derive the transform every frame.
5. **A group drag snaps as ONE rect** — the group's bounding rect — and the
   delta is applied to every member, so the members never shear.
6. **Tidy compacts without reordering.** `tidyPanels(panels, gap)` keeps
   each panel's reading order (row-major by its current centre, rows formed
   by vertical overlap) and packs rows left-to-right, top-to-bottom, from
   the selection's bounding origin, with `TIDY_GAP = 24`. Sizes never
   change — so no rect can fall under the floor — and a panel that was to
   the left of another stays to its left. One `commitHistory` for the whole
   arrangement: one undoable step, never twenty. Available on the selection
   when there are two or more, else on everything, from the palette.
7. **Snapping is a setting**, `placement.snap` (boolean, on), because a
   user aligning by eye against a snap is fighting the app.

## Verification

- `verify:viewport` `snap.1`: an edge within the threshold snaps and a
  guide names it; `snap.2`: nothing snaps beyond the threshold, and never to
  itself; `snap.3`: a resize snaps its moving edge and stays above the
  floor; `snap.4`: centres snap; `tidy.1`: compacts without reordering,
  keeps every size, and is idempotent; `tidy.2`: never produces a rect
  below the floor and starts at the selection's origin.
- `verify:layout` `placement.1`: the setting.
- `verify:palette` `placement.1`: the Tidy row on a selection of two and on
  everything, disabled with a reason on one panel.
- `verify:panels` `snap.1`: a real drag ending near another panel's edge
  lands ON it and a guide was drawn mid-drag; `tidy.1`: the palette's Tidy
  arranges the selection in one undoable step.
