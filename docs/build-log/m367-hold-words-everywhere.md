# M367 — a hold's words wherever a needs-you is said

**Verdict: shipped.** Owed by M357. M355 made an agent held at its cap a needs-you, and the
queue says it as a hold. Every other surface words a needs-you through M199's blocker
vocabulary, which knew two kinds, an approval and a keyboard. So a held chat read as a
question:
- the Inspector's next action said "the agent is waiting — open it and answer";
- its blocker line and the resume card's "open blocker" said "this session needs you at
  its keyboard — open it to answer";
- a lane's review node said "waiting for you at its keyboard — answer it in the
  conversation".

A held agent asked nothing, and an answer typed into it is refused. The vocabulary now has
a third kind, `cap`, in the hold's own words, and its fix is the queue's Allow or the Work
tab.

## What landed

- **`RunLiveFact.hold`** and a `cap` blocker in **`projectSession`**
  (`shared/run-outcome.ts`): "the agent is held at its $2.00 spend cap ($2.10 reported)
  — allow it more from Needs you, or stop it". A question the held agent asked is still
  the approval, first. A hold with no attention (an exit cleared it, M355) projects the
  agent's status as before. The blocker type gains `'cap'` in both places that declare
  it (`run-outcome.ts`, `review-readiness.ts`).
- **`Canvas.tsx`** carries `snapshot.meter.held` into each chat's live fact, so the
  Inspector's band, the resume card, the task card and the review node all read the
  same projection.
- **The Inspector's next action** (`shell/inspector-context.ts`): "allow it more from
  Needs you, or raise its cap on the Work tab".
- **A lane's review node** (`review/ReviewNode.tsx`): "the lane's agent is held at its
  cap — allow it more from Needs you, or stop it, then review".

## Decisions, and why

- **One projection, not per-surface words.** M199's rule is that the card, the diagram
  and the review section name the SAME blocker. The hold rides the fact every one of
  them projects from, rather than each surface learning to read the meter.
- **Orchestrate's count line is unchanged.** It says how many agents are waiting on you,
  which is still true of a hold. Its kind is `waiting-on-you`, with no keyboard claim.

## Checks

- `verify:viewport run.hold.1`:
  - a held agent projects a `cap` blocker in the hold's words and never the keyboard
    sentence;
  - a question it asked is still the approval;
  - with no attention, a hold projects its status.

  164/164.
- `verify:rail hold.inspector.1`: the Inspector's next action and blocker line for a held
  agent. 256/256.

`queue-hold` (M357's scene) shows both surfaces:
- the Inspector's band reads "allow it more from Needs you, or raise its cap on the Work
  tab", with the amber blocker line "the agent is held at its $2.00 spend cap ($2.10
  reported) — allow it more from Needs you, or stop it";
- the resume card's open blocker reads the same.

The scene's intent was rewritten to say so, since M357 had disclosed the keyboard wording
as the known gap this milestone closes. The golden was deleted and written again, to force
the write whatever the budgets said.

## Goldens

`queue-hold` changed on purpose: its Inspector band and resume card now say the hold.

- **Round 1: DEFECT.** The two changed regions were right ("The keyboard/'waiting'/
  'answer' wording is fully gone from both — confirmed correct per intent"). But "the
  extra 2 lines pushed [the Caps section's `Context cap` row] into/past the panel's
  scroll or clip boundary". The Work tab is a scroll pane, so the row was scrolled below
  the fold, not lost, but the golden showed half of the Caps section. The scene now
  scrolls the Work tab to its end before the shot, as `inspector-caps` does, and throws
  unless the Context cap field is the element painted at its centre.
  - It also listed the reflow's shifts: the left column down about 19px, the Inspector
    down about 27px, and more of a task-list row showing below the fixed popover. All of
    them are explained by the longer text.

- **Round 2: Matches intent.** "Pure hold language throughout — no 'needs you at its
  keyboard' wording anywhere … nothing is truncated — the last visible element is the
  '…' overflow button with normal padding below the CAPS block, and the scrollbar thumb
  sits at the very bottom of its track … The previous round's cut-off-Context-cap defect
  is resolved." On the two amber sentences, the band's "allow it more from Needs you, or
  stop it" and the Caps section's "raise agents.nodeCapUsd in Settings": they "differ in
  wording but not in substance — one is the immediate needs-you action, the other the
  permanent-cap-raise instruction — not a contradiction."

## Gate

`npm run typecheck` is clean. The full `npm run verify` ran in 775.9s: 59/61 suites.
`verify:panels:agents` held its baseline, `template.1` and `detail.1`.
`verify:panels:product` hit its watchdog at a load average of about 17. Rerun alone
(the flake rule), it finished inside its watchdog, with the known load flake
`onboarding.start.1` red besides the baseline. Run once more at a load under 9, it was
112/120, every red the baseline (`starter.1` and the seven `workflow.*`).

`verify:viewport` 164/164 and `verify:rail` 256/256.

## Owed

- **The chat's own header still shows `idle`** beside a hold (M352's owed rest-layer
  chip, "held — $2.10 of $2.00"). M357's critic saw it too.

Next: M358 (plan before execution: a plan is read and approved, never granted).
