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
- `ink` scene in `scripts/shot.cjs` with its golden. The scene runs before `file-missing`
  and leaves its two strokes and its camera behind, so `file-missing`'s golden was
  rewritten in the same commit (its frame now carries the strokes' neighbourhood) — a scene
  change the update rule is MEANT to write, stated here because the verifier found it
  unstated.

## Not undoable, said

Like a label (M93), a stroke is outside history: Delete removes it for good, Cmd+Z does not
bring it back. The strip says so at the cap (`at the cap of 200 — the oldest goes next`).

## Declined by name

#15's note: highlights, arrows, a width palette and a colour, an eraser, the
"behind the panels" toggle — each a small slice over the same record.

## Green

layout 234/234, viewport 137/137, styles 39/39, product 59/59 (78.0 s).

## Reviews

- **Critic — FIX-FIRST, 1 Critical, 3 Major, 8 Minor.** The Critical: a panel-anchored
  stroke was painted OFFSET by its own start — `commitInk` measured points from the panel's
  top-left while the painter adds `annotationPoint` (rect + dx,dy), so dx,dy was added twice;
  `ink.3` checked presence and the follow delta, never the position, and the first ink golden
  was a picture of the defect. Fixed: points are relative to the anchor POINT for both kinds
  (the record's comment corrected), `ink.3` asserts the stroke's box starts within a hit
  half-width of the drag, and the golden was refreshed by deleting it (the update rule keeps a
  golden the budgets cannot see moving — a thin line — so a forced refresh is a deletion,
  recorded in `docs/verify-suites.md`). Majors: the drag threshold and the simplification
  tolerance are SCREEN quantities now (4 px and 0.75 px through the scale the stroke was drawn
  at — world units made a one-pixel jitter a stroke at a far zoom); Escape or the merged view
  mid-stroke CANCELS it (no commit, no label, no ghost preview); `INK_POINTS_MAX` 2000, the
  parser drops an over-cap record by name (`ink.1`) and the gesture ends a stroke at the cap.
  Minors landed: `sawButton` seeded from the press; the strip says the 200-annotation cap
  before it bites; far tiers scale ink like the label; the merged view's hit path takes no
  pointer; NaN points refused at commit; the scene throws on a missing panel; the interface
  comment and the spec say "a drag that moved"; the not-undoable sentence above.
- **Verifier — 22 SUPPORTED, 1 OVERCLAIMED, 2 UNSUPPORTED.** The stale "three points" comment
  corrected; the `file-missing` golden rewrite stated above; this section replaces the
  dangling sentence.

Watchdogs after the wave: product 98 s (77.9 s, 77.7 s); `verify:visual` 209 s (166.5 s,
166.2 s), 55 scenes.
