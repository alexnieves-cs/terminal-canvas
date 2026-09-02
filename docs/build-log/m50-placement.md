# M50 — Placement: snapping and tidy

**Status:** finished 2026-09-02.
**Branch:** `m50-placement`. **Spec:** `docs/superpowers/specs/2026-09-01-m50-placement-design.md`
(written this session). **Plan:** `docs/superpowers/plans/2026-09-01-m50-placement.md`.

One line: edges and centres snap while dragging, at a screen-pixel threshold over the scale,
with guides in the world; Tidy compacts the selection without reordering, as one undo.

## What landed

- `canvas/placement.ts` (pure, in the viewport bundle): `snapRect` over `applyDrag`'s output —
  smallest delta per axis within `SNAP_PX / scale`, never to itself, a resize only on its growing
  edges and never under the floor; `tidyPanels` — rows by overlap, packed from the origin,
  sizes untouched, idempotent.
- `usePanelDrag` hands the gesture to `onDrag`; Canvas snaps each frame and draws `SnapGuides`
  inside `.world`, cleared on commit; a group snaps as one bounding rect.
- `placement.snap` (boolean, on); the palette's `Tidy` row through `tidyPanels` — the
  selection when two or more are selected, everything otherwise, one `commitHistory`.
- Checks: `verify:viewport snap.1–4, tidy.1–2` (watched red against the missing module),
  `verify:layout placement.1`, `verify:palette placement.1`, `verify:panels snap.1` (a REAL drag
  lands on the edge, a guide seen mid-drag) and `tidy.1` (one undo).

## Snags

- Two viewport fixtures were wrong the first time: one aligned on the y axis by accident (a
  legitimate snap the check called a false positive), the other's edge and centre were the same
  delta apart so the edge won. Both fixtures now isolate the clause they claim.
