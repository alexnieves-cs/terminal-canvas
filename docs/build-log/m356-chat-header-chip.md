# M356 — a resolved auto chip gives way before the chat header's controls

**Verdict: shipped.** Owed by M352. A chat's resolved auto chip ("auto · complete · stuck
— cap reached · dismiss") pushed every control after it past the panel's right edge:
`Auto…`, `Open terminal session`, expand and the close. `.panel` has `overflow: hidden`, so
they were painted nowhere, and a person could not see or press the chat's close. M352's
scene dismissed the chip before its shot and recorded the defect.

The fix has three parts:
- the chip shrinks first;
- a resolved chip reads what the run came to (`auto stuck`, `auto done`, `auto
  stopped`), which never clips, and its reason or mode gives first;
- the `Auto…` door is hidden while a chip shows.

The whole sentence stays on the chip's title.

## Cause

`.chat__auto` said `flex: 1 1 auto; min-width: 0` (M97), and M121 put `text-overflow` on
its label so the words would give. But the chip is also a `pf__word`, and
`.pf__chrome .pf__word { flex: 0 0 auto }` (specificity 0,2,0) beat `.chat__auto` (0,1,0).
Inside a panel header the chip never shrank, so the ellipsis never ran. Nothing was red:
the rule that lost is still in the stylesheet and reads as if it works.

## What landed

- **`.pf__chrome .chat__auto { flex: 0 1 auto; min-width: 0; }`** (`styles.css`), placed
  beside the rule it overrides, at the same specificity and later in the file, with a
  comment naming the cause. The dismiss is a `pf__verb`, so the same `flex: 0 0 auto`
  keeps it whole. `.chat__auto-head` never shrinks.
- **`autoChipParts(status)`** (`shared/auto.ts`): a resolved chip's head (`auto stuck`,
  `auto done`, `auto stopped`) and tail (`— cap reached`, `· harden`). A running chip is
  one part, its whole words. `ChatNode.tsx` renders the head and a clipping tail, and the
  title keeps `autoChipWords`.
- **The `Auto…` door is hidden while any chip shows** (`ChatNode.tsx`). Before, it was
  hidden only while a run ran.
- **In the header, the chip's dismiss is a word** (`.pf__chrome .chat__auto
  .chat__auto-dismiss`): no border, margin or padding box of its own inside the pill.
- **The `inspector-caps` scene keeps the chip** (`scripts/shot.cjs`). A held agent's
  header carries its stuck run, so the chip is in the golden now. The scene hit-tests
  every header control at its centre with `elementFromPoint`, and throws if one is past
  the frame or is not the element painted there. A `SHOT_PROBE` line prints each header
  item's width.

## Decisions, and why

- **Measured before deciding.** The `SHOT_PROBE` line measured the 560px chat's header:
  - the title was already at its 8ch floor (66px);
  - `Open terminal session` took 122px;
  - the chip's words had about 20px left, which painted "|a".

  So the shrink alone kept the controls in the frame, but left a chip that said nothing.
- **The head never clips; the reason gives first.** What the run came to is the chip's
  one essential fact. Why it stuck, and which mode ran, are on its title and on the
  Inspector.
- **The door hides beside a chip.** The chip already names the run in that slot, and the
  door's 32px is the room the head needed. Dismissing the chip brings the door back, and
  the palette's Auto rows are always there. No second menu or verb was added.
- **Other controls keep their size.** They are verbs, and a verb clipped to half a word
  is a verb nobody can read.
- **Hit-test, never measure a rect alone.** A rect past the edge is the symptom, but a
  control under another element is the same failure. `elementFromPoint` is what a click
  would reach.

## Checks

- `verify:verbs auto.parts.1`: a resolved chip's head and tail for done, stopped and
  stuck, and a running chip as one part with its whole words. `verify:verbs` 30/30.
- The `inspector-caps` scene's hit-test, above.

VISUAL

## Goldens

`inspector-caps` changed on purpose: its chat header now carries the resolved chip. One
fresh-context critic was handed the full-sequence picture, the previous golden and the
intent.

- **Round 1: Matches intent.** "the resolved chip now stays visible with every header
  control still fully painted inside the chat panel's frame, and no control is clipped
  or pushed past the border … The chip is legible and reads as a past-tense result
  (muted amber text, rounded pill, paired with its own 'dismiss') rather than as an
  actionable control … No overlap, no mid-glyph clipping anywhere in the header —
  verified at 4x zoom … the only region with a significant diff cluster is the chat
  header row itself."
  - Its contrast note called the chip text "roughly AA-for-large-text". Its own
    estimate of the colour, about #8a5a1e on near-white, works out to about 5.8:1, which
    passes AA at any size. It is the Caps sentence's amber, so the note is recorded, not
    acted on.

The first `UPDATE_GOLDENS=1` run KEPT the old `inspector-caps` golden, with the chip
dismissed. A header row's change is under both of `verify:visual`'s budgets, so the
golden was never rewritten, and a later run would have passed against a picture that is
no longer true. The golden was deleted and written again: the run's own rule, that an
under-budget change is forced by deleting the golden first. The same run wrote
`routine`, whose only change was the wall-clock time in "missed at 06:16 AM" (now "01:47
PM"). That is not this milestone's change, so it was restored from HEAD, and the clock
is owed below.

- **A defect the critic did not catch, found in the written golden.** At the golden's
  half resolution, the dismiss's right border was cut by the chip's rounded edge. In the
  full sequence the close reads `end?`, about 20px wider than SHOT_ONLY's `×`, so the
  chip had shrunk below its head plus its dismiss. `min-width: auto` could not floor it:
  a flex item with `overflow: hidden` has an automatic minimum of 0. So the dismiss
  inside the chip became a word with no box of its own (no border, 2px padding, no
  margin), which frees the width. Round 2 judges the rewritten golden.
- **Round 2: Matches intent.** "The chip is one pill: a single rounded outline contains
  both 'auto stuck' and 'dismiss' with no second border, no divider, and no clipped glyph
  or edge … 'end?' sits with visible margin before the panel's right border curve;
  nothing crosses or touches the frame edge." It also found that "'dismiss' still reads
  as pressable: it's rendered in a distinct muted-gray versus the amber status text,
  positioned at the trailing edge the way a dismiss affordance typically sits … the
  'auto stuck' outcome reads as primary and 'dismiss' as a secondary, lower-emphasis
  action within it."

## Gate

`npm run typecheck` is clean. The full `npm run verify` ran in 777.2s: 59/61 suites.
`verify:panels:agents` held its baseline reds (`template.1`, `detail.1`).
`verify:panels:product` hit its 230s watchdog, then did so again when rerun alone, cut
at a different check each time (after `board.1`, then after `preview.1`). The machine's
load average was 28–37 then, with macOS `mediaanalysisd` at 178% CPU, and no product
check reads the auto chip or its door. It was rerun once more at a load under 15: 177.7s
(77% of its watchdog), 112/120, and every red is the baseline (`starter.1` and the seven
`workflow.*`).

`verify:verbs` 30/30, including `auto.parts.1`. `verify:visual` (hand-run, with
`UPDATE_GOLDENS=1`) wrote `inspector-caps`, as above. Its one red is `starter`, which
stays red on purpose.

## Owed

- **M363 (proposed): the `routine` scene pins a wall-clock time.** Its row says "missed
  at <time>", taken from the real clock, so its golden fails whenever the hour differs
  by enough pixels. The time should be masked, or the fixture's due tick fixed.
- **No gate suite renders an auto chip.** The panels harness has no chat with a
  resolved run, so this is checked by the hand-run scene only. A `verify:panels:agents`
  check would need the harness to push `auto` events to a chat, the way the shot harness
  does.

Next: M357 (the hold's answers in the decision queue: "Allow $N more" and "Stop").
