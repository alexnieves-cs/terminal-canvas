# v7 Act V.1 — M155, ink on the annotation layer: design

Written 2026-09-07. Backlog #15 asks for ink, highlights, arrows and sticky notes on the
canvas; M27 answered the sticky note with a NOTE (a file panel), and M93 built the annotation
LAYER — text labels, world- or panel-anchored, persisted on the workspace record, an SVG
sibling of the link layer, an explicit annotate mode that lays a transparent sheet over the
world. What #15 still names, in its own order of value, is INK: freehand strokes that live in
world space, follow a panel when anchored to it, and survive a relaunch. That is this
milestone. Highlights and arrows are the same record with a different painter and are
declined by name into #15's note, so the next slice is small.

## The record

`Annotation` gains an optional `ink?: { points: Array<[number, number]>; width: number }`:
absent is every M93 label (the absent-vs-malformed rule — a pre-M155 file warns nothing); a
present-but-malformed `ink` (a non-array, a point that is not two finite numbers, a width
that is not a positive number) drops THAT annotation with a warning, never the list. Points
are RELATIVE to the anchor point (world coordinates for a world anchor, the panel's
top-left for a panel anchor), so a panel-anchored stroke moves with its panel through
`annotationPoint` unchanged, and `pruneAnnotations` drops it with the panel exactly as it
drops a label. `text` stays required on the record and is `''` for ink (one shape, one
parser); the Delete key, selection and the count under `ANNOTATIONS_MAX` are M93's.

Width is a WORLD width (a plain stroke width, never `vector-effect: non-scaling-stroke`): ink
is a physical property of the world that thins as the camera pulls back — #15's own
recommendation, stated as the choice it is. One width (3 world px) in this milestone; a
palette of widths is #15's next slice.

## The gesture

Annotate mode (M93's `annotating` sheet) gains a DRAW tool beside the label tool: in
annotate mode a pointer DRAG on the sheet draws (mousedown, ≥ 3 moved points, mouseup
commits — a click without movement is M93's label placement, unchanged), the stroke
previewed live as a polyline on the annotation layer and committed as one annotation with
one history entry. Points are `screenToWorld` of each move (the drift rule: never a delta of
deltas) and simplified by a pure `simplifyStroke(points, tolerance)` (Ramer–Douglas–Peucker,
tolerance 0.75 world px) so a slow hand does not store a thousand points. The anchor is
`resolveAnchor` of the FIRST point — a stroke that starts on a panel belongs to it, one that
starts on the ground is the world's — the same rule a label uses. Escape cancels a stroke in
progress; the tool is chosen from the annotate bar (`draw` / `label`), remembered for the
session, never persisted.

Input arbitration is #15's "explicit mode", already M93's answer: nothing changes outside
annotate mode, and inside it the sheet already owns every drag.

## Painting

`AnnotationLayer.tsx` paints an ink annotation as an SVG `<path>` (M-L segments, round caps
and joins, the label's own colour token — no new colour) inside the same `<g>` the labels
use, selected the way a label is (a click on the stroke's hit path, 12 world px wide, marks
it; Delete removes it). The far tiers paint ink as they paint labels.

## Checks (red first)

- `verify:layout ink.1`: `parseAnnotations` keeps a label with no `ink`, keeps a valid ink
  annotation with its points and width, drops one with a malformed `ink` naming it and keeps
  its neighbours, and keeps absence absent through a re-serialise.
- `verify:viewport ink.2`: `simplifyStroke` — a straight line of many points collapses to
  its two ends; a corner is kept; a tolerance of 0 keeps every point; fewer than three
  points pass through untouched.
- `verify:panels kinds ink.3` (real Electron, where M93's annotation checks live): enter
  annotate mode, choose draw, drag across the ground — one path appears with the expected
  point count within simplification; drag starting on a panel — the stroke is
  panel-anchored and MOVES with the panel; Delete removes the selected stroke; the layout
  file carries `ink` and a reload paints it again.
- `verify:visual`: an `ink` scene (a stroke on the ground and one on a panel, the annotate
  bar showing the draw tool), golden committed after looking.
