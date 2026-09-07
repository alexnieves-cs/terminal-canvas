# M155 — ink on the annotation layer: build log

`main`, 2026-09-07, after M150. Spec: `docs/superpowers/specs/2026-09-07-v7-act5-ink-design.md`;
plan: `docs/superpowers/plans/2026-09-07-v7-act5-ink.md`. Backlog #15's first slice past M93's
labels: freehand INK.

## Red

`check(m155)` (`4c2f5b3`): `verify:layout ink.1` (the record's parse arms), `verify:viewport
ink.2` (`simplifyStroke`), `verify:panels product ink.3` (the gesture end to end). The
product check's first run THREW (`layoutStore.load()` is not a method — the file is read
directly, as `annot.1` reads it) and aborted the part at 23 checks; a thrown check is every
check below it never running, and it was fixed before the red was watched.

## Built

- `shared/annotations.ts`: `ink?: { points, width }` on the record — absent on every M93
  label, points RELATIVE to the anchor point (a panel-anchored stroke follows its panel
  through `annotationPoint` unchanged), malformed drops that annotation by name; `INK_WIDTH`
  3, a WORLD width that thins as the camera pulls back (#15's own recommendation, chosen).
- `viewport.ts`: `simplifyStroke`, Ramer–Douglas–Peucker over the chord, iterative (a long
  stroke is the input that would blow a recursive stack).
- `useCanvasPointer.ts`: with the DRAW tool on, a drag on the annotate sheet collects
  `screenToWorld` of every move (never a delta of deltas), previews live, and commits a drag
  that MOVED — the end at least four world pixels from the start. Two lessons the check
  taught, both recorded in the code: moves COALESCE (a fast flick, a synthetic drag) into two
  points, so "three or more points" was the wrong rule and turned a real dash into a label;
  and a synthetic move can report `buttons` 0 while the press is down, so the marquee's
  "no button held → end" arm here waits for a move that had the button.
- `Canvas.tsx`: the tool (`label` / `draw`) as a view state on the strip, pressed as data;
  `commitInk` anchors by the FIRST point (the label's own rule), stores relative points,
  selects the stroke so Delete is one keystroke away. `AnnotationLayer.tsx`: an SVG path in
  the label's colour with a wider transparent HIT path beneath (a 3 px line is not a
  target), the draft dimmer BY TOKEN (styles check 3 forbids a fractional opacity).
- `ink` scene in `scripts/shot.cjs` with its golden.

## Declined by name

#15's note: highlights, arrows, a width palette and a colour, an eraser, the
"behind the panels" toggle — each a small slice over the same record.

## Green

layout 234/234, viewport 137/137, styles 39/39, product 59/59 (78.0 s). The critic and verifier
over the diff, spec and checks are recorded below.
