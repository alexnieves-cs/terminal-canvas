# M66 — Every control says what it is

**Branch:** `m66-labels`. **Spec:** `docs/superpowers/specs/2026-09-02-m66-labels-design.md`.
**Plan:** `docs/superpowers/plans/2026-09-02-m66-labels.md`. **Status:** finished 2026-09-02.

The milestone with no feature in it. M61's critic had a category the dead-end audit never
had — *cannot identify* — and nine controls fell into it. This run walked each one and gave
it a name, a state, or both, then asked a fresh critic to try again.

## What landed

- **The top bar.** The merged view has its own glyph (three lanes) and, while on, the button
  itself reads `merged view · read-only`, pressed, with the title `back to <workspace>`. The
  first cut put the label BESIDE the glyph; the critic read it as loose text with no door
  out, so the label moved inside the control (`TopBar.tsx`).
- **The dock.** The active pane's tile carries a 2px iris bar in the left slot and, after the
  critic could not see the fill at a glance, a 1px iris ring on the tile — a line, not a
  shadow.
- **The canvas edge.** An attention pip carries a mono chip: the panel's name and `needs you`.
  The chip hangs on the side away from its edge (the verifier caught the first cut always
  extending left, which ran a left-edge chip off the canvas).
- **The merged view's lane headers** are screen-space chrome (`.lane-header`, positioned
  through `worldToScreen`), the active lane saying `this workspace`, clamped so a lane at
  the viewport's top still shows its name.
- **The rail.** `▶` became `start`, mono, iris, in a fixed slot on every terminal row so the
  state words form a column. While merged the control is present, dimmed and disabled with
  its reason in the title (`leave merged view to start`) — the critic's finding 2.
- **The context pane's action bar** is a grid: Restart on its own row, then Rename… and Save
  as preset, then Link to… and Close. The spec said three secondaries and Close on ONE row;
  at 260px that is four chips that truncate mid-word, which is the failure class this
  milestone exists to remove, so it is 2×2 (the verifier's finding 7, accepted by changing
  the layout rather than keeping the ellipsis). The first cut's grid rule lost to the pane's
  own flex column declared later in the sheet and the bar stayed a stack — the M61 shot
  showed it, the second look caught it.
- **The file panel's edit toggle** shows its state: `aria-pressed`, the `--on` fill, and the
  word `editing` beside the pencil while on.
- **Sessionless frames** show their kind's glyph in the chrome where a grey dot used to be —
  the critic's "a state dot on a kind that has no state". `KIND_GLYPH` moved to `icons.tsx`
  so the rail row and the frame draw from one map.
- **The compact breakpoint.** The HUD and hint strip sit above the drawers (`z-index: 950`,
  opaque); the drawers' last rows pad past the strip band, because the first shot had the
  strip covering the context drawer's Link to… and Close.
- **The palette.** Settings hints wrap instead of ellipsising; every setting description is
  in one voice (lower-case initial, no full stop, no second sentence — the verifier found
  eight with interior `. Capital`s and five with no verb; all rewritten). A visible title
  match earns a bonus over a hidden-searchText match in the same section.
- **The hint strip** says its rule as its last hint: `hints fade once you have used them`.
  The fit control reads `fit` beside its glyph, inline, at standard and wide.

## Decisions not visible in the diff

- **`Tidy everything` still leads a query for `group`.** The spec's example was wrong as
  written: section order is M5b's invariant and `Tidy everything` is in an earlier section
  than the group rows. The bonus is within-section, and `rank.1` pins exactly that. The
  comment on `VISIBLE_BONUS` now says what it does and does not do (a six-letter run
  contiguous in searchText still scores past a scattered title match).
- **"The list clips on a row boundary" was not built.** Wrapped hints make rows unequal in
  height, so a whole-number-of-rows max-height has no meaning; the list's edge clips
  wherever it falls. Recorded, not hidden. Left for a later pass with the palette's frame.
- **The dormant card keeps `click to start` as a sentence, not a button.** The critic asked
  for a real Start control in the card. The card IS the control — the whole surface wakes
  on click, and three panels checks pin that text as the card's affordance. A button inside
  it would be a second click target for the same act. Recorded as declined.
- **`labels.1`/`labels.2` never went red.** Every `<button` in the renderer already carried a
  name; the checks were written, watched green, and kept as the guard against the next
  unlabelled control. Recorded honestly rather than by breaking a label to see them fail.
- **`find.5` was restated.** M64's `scrollTop === 0` assumed the best match sits at the top;
  with the visible-match bonus the selected row may sit lower and `scrollIntoView` shows it.
  The check now asserts the list moved back from its old offset AND the selected row is
  inside the list's visible box — the fact the spec was after, not the number.
- **`start` is iris, not blue.** The critic read `start` and `working` as one hue. They are
  the two tokens (`--iris` teal, `--blue`); in the light theme they are close. No change —
  the brief's accent and the working tone are two decisions already made — but recorded
  as something the frame pass (M67) should look at with a colour picker.
- **Compact drawers keep no close control of their own.** The dock's pane button and the
  top bar's context toggle are the doors; a third would be a second copy of an existing verb.
- **Not this milestone, recorded for M67/M69:** the toolbox title as a path; the group
  header's `×` where `remove` should read; the launcher's hint strip colliding with the HUD
  at 1440 (hint strip needs a width rule, M67); the far view still rendering full chrome
  at 22% (M69's overview); resting shadows and the dot grid (M67); the theme and context
  toggles being icon-only with a hover title (M67's frame pass decides whether they get
  words); the rail truncating a title to fit `not started` (the state column's width is the
  right thing to give, M67).

## The critic

Eighteen findings and four "cannot identify". Accepted and fixed: 1 (merged button), 2
(start while merged), 5 (dock pressed state), 6's drawer half (padding past the strip; the
strip over the canvas is by design), 7's toggle half (`editing`), 13 (fit inline), and the
grey kind dot. Declined with reasons above: 9 (card button), 6's close control, 4 (colours).
Deferred with a milestone named: 3 (rail divider while merged — M68's context pass), 7's
Save-in-chrome, 10, 11 (left-aligned wrapped hints — nit), 12, 14, 15, 16, 17, 18.
What the critic said works and was left alone: the state word everywhere, the lane headers,
`card`/`expand`, the labelled action bar, disabled reasons, the search empty state, the sheet's
suggestion tags.

## The verifier

Twenty-five findings. Fixed: 4b (chip geometry), 5 (header clamp), 6 (the old hover rule
beating iris), 7 (ellipsis → 2×2 grid), 8 (`editing`), 10 (voice, with `voice.1` tightened
to reject an interior sentence), 12 (the false comment), 16 (`compact.1` now asserts the
drawer's `top`/`bottom` too). Accepted as recorded, not changed: 1 (title case → lower-case
now), 4a (the chip uses `panelName`, the palette's name, not `railLabel` — both derive from
the same title; the spec's wording was loose), 6's empty-slot class (the empty span shares
`.rail-row__start`; the two panels checks that select it also require `row.dormant`, so no
check changed meaning), 11 (see above), 15 (a button-count floor is worth adding when the
next milestone touches that check), 17 (`rank.1` at one query length — the pin is the rule,
not the threshold), 18 (`labels.3` does not assert `this workspace`; the shot does), 19 (the
spec's `group-keys.2` extension was superseded by `labels.1`, which walks every `<button`),
22 (see `find.5` above), 23–25 (scope, all serving spec items).

## Checks

`verify:rail labels.1/.2`, `verify:styles compact.1`, `verify:palette voice.1/rank.1`,
`verify:panels labels.3/.4`; `find.5` restated; `targets.1` unchanged and green against the
40×24 start slot. `npm run verify` green, run alone, before the merge.
