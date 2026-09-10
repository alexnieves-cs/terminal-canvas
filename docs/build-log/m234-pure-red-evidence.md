# M234 — red-first evidence: the SIGWINCH check

`chromeless.resize.1` was written before the chromeless terminal existed, and then watched
failing against a **deliberately naive implementation** of it. This is the one check in the run
whose hazard is invisible to every other instrument, so its red matters more than most.

## The hazard

There are two ways to make a terminal's content run to the edge:

- **Collapse the chrome's BOX at rest** (`display: none`, height 0, out of flow). The body then
  grows by the chrome's height on hover, xterm refits, and a **SIGWINCH goes into the running
  agent** — on every mouse-over. No exception, no visible error, and no other suite turns red.
- **Position the chrome absolutely over the body.** The body owns the full block size at all
  times; hovering changes opacity and nothing else; xterm never hears about it.

## The red

The naive version was built first, on purpose:

```css
.pf--kind-terminal .pf__chrome { display: none; }
.pf--kind-terminal:hover .pf__chrome { display: flex; }
```

```
FAIL chromeless.resize.1 …
  {"id":"n14","chromePos":"relative","chromeOut":false,
   "before":{"screenH":414,"bodyH":458},
   "during":{"screenH":414,"bodyH":422},
   "after" :{"screenH":414,"bodyH":458}}
```

**458 → 422 → 458.** The body loses 36px when the cursor arrives and regains it when the cursor
leaves. Every one of those is a refit. That is the resize storm, measured, from one mouse-over.

Three other checks went red beside it (`rest.1`, `frame.3`, `fit.1`) — the naive version also
breaks the chrome's counter-scale and the rest rule, which is worth noting: the hazard came with
company, and none of that company is the SIGWINCH.

## The green

```
PASS chromeless.resize.1 …
  {"chromePos":"absolute","chromeOut":true,
   "before":{"screenH":450,"bodyH":458},
   "during":{"screenH":450,"bodyH":458},
   "after" :{"screenH":450,"bodyH":458}}
```

## The check was vacuous twice before it measured anything

Worth recording, because it is the third time in this run:

1. **First cut asserted only the sizes.** It passed against the naive implementation, because it
   hovered a **selected** panel — whose chrome is shown at rest anyway, so the hover changed
   nothing. Fixed by deselecting first (`clickEmptyCanvas`).
2. **It also needed the MECHANISM arm.** Sizes alone can be satisfied by the wrong thing (a
   fixed-height chrome that happens not to move). The check now asserts *both* that the chrome
   is out of the flow and that a real hover resizes nothing — the first makes the hazard
   structurally impossible, the second proves the rule was actually reached on a live terminal
   rather than overridden by some other selector.
3. **And it threw before it ran**, because `clickEmptyCanvas` takes the `wc`. A check that
   throws aborts the suite and every check below it never executes — `docs/verify-suites.md`
   names this, and it happened anyway.

## What the milestone then cost

`rim.paint.1`, written in M228, went red the moment the chrome was lifted: the frame's specular
edge measured **0.79** where it had been **15.72**, because `.pf__chrome` is what draws that
edge and `.panel`'s own rim sits underneath the chrome's scrim. That check's comment said in
M228 that Act III was where it would matter. It collected.

The fix keeps the chrome's lit top edge and drops only the bezel — the bezel drew the seam where
a housing met a screen, and a chromeless terminal has no seam.

`well.paint.1` is **retired** by the same change, with its reason in the source: a terminal's
body now starts at the frame's own top edge, so there is no housing to sink below, and the
recess would be drawn under the scrim where nobody can see it.
