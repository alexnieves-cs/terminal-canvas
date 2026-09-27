# M380 — cache return and context burn-down on the Work tab

**Verdict: shipped.** Arc 2 asked to "surface spend, cache ROI, and context-window
burn-down on the canvas". M350 put spend and context on the meter. Two figures were
still missing:
- **What caching returned.** The Work tab listed the four token classes and a total, so
  a person could not tell that a million cache reads had saved $1.80 at list price, or
  that a session writing to the cache and never reusing it had cost more.
- **How much of the window is left.** Context read "124k tokens — no context cap",
  which says nothing about how close the conversation is to its model's limit.

Now the Cost section says "caching saved $1.75 — $1.80 not paid as fresh input, less
$0.05 more for writing it", or that caching cost more than it saved. The Caps section
has a Window line, "76k of 200k left — 62% used", using the window the CLI itself reports.

## What landed

- **`cacheReturnOf(totals, model)`** (`shared/pricing.ts`, re-exported from main). A
  read is fresh input not paid (input − read rate). A write is paid above input (write −
  input rate). The net may be negative.
- **`cacheReturnWords(usage)`** (`inspector-fields.ts`): summed per model like the cost.
  It is absent when a model is unpriced or nothing touched the cache, and rendered under
  the cost.
- **The window, from the CLI**:
  - `conversationWindow(modelUsage)` (`shared/transcript.ts`) reads each model's
    `contextWindow` off a result and takes the one of the model that held the
    conversation (the most input read);
  - the result event carries it;
  - `NodeMeter.window` is main's session figure, set from the latest result that
    reported one.
- **`windowWords`** and **`CapsField.window`**: the Caps section's Window line, absent
  until both figures are measured.

## Decisions, and why

- **The window is the vendor's figure, never a table of ours.** A recorded result
  carries `"contextWindow":200000` per model (`scripts/fixtures/agent-session/turn.jsonl`).
  A table of windows would go stale the way the price table's first transcription did
  (M17's note), and a guessed 200k beside a 1M-window model is the confident wrong
  answer. Without a report, the line is absent.
- **The model that held the conversation, not the largest window.** A result can report
  a subagent's smaller model beside the main one. The conversation fills the window of
  the model that read the most.
- **The return can be a cost.** A session that writes to the cache and never reuses it
  paid more than fresh input. The sentence says so rather than clamping to $0.00.
- **List price, like the cost it sits under.** It is labelled by its place, under "list
  price". A subscriber is charged nothing per token (`pricing.ts`'s note).

## Checks

- `verify:usage cache.return.1`: a million reads and a hundred thousand writes on
  Sonnet 5 return $1.75 net; a million writes alone is a $0.50 net cost; a dated id
  prices as its alias; an unknown model has no figure. 30/30.
- `verify:agent-session`:
  - `window.1`: a recorded result's `contextWindow` (200000) is read; of two models the
    one that read the most decides; none reported is none.
  - `window.meter.1`: a result reporting it puts it on the manager's meter beside the
    context.

  186/186.
- `verify:rail burn.1`:
  - "76k of 200k left — 62% used" under Window, and nothing without a reported window;
  - the saving and the cost sentences;
  - absent for an unpriced model or an untouched cache.

  258/258.

**Visual.** Four scenes show a chat's Work tab, and each gains the cache-return
sentence under its cost: `inspector-caps`, `queue-hold`, `plan-approval` and
`team-ask`. `inspector-caps` also sends the meter with the window the CLI reports
(200000), so its Caps section shows the burn-down. Its intent says so.

The first capture wrapped the Window line as "…59% / used", and the value repeated its
label's word ("…of the 200k window left"). It now reads "82k of 200k left — 59% used"
under `Window`, on one line.

- **The critic, on each scene's Work tab before and after: Matches intent.** "Right adds
  the muted two-line sentence 'caching saved $0.06 — $0.07 not paid as fresh input, less
  $0.01 more for writing it' directly under '$0.06 list price,' and CAPS gains the third
  line 'Window 82k of 200k left — 59% used' under Context. Figures check out internally
  (82k+118k=200k, 118/200=59%), no clipping/overlap, everything below scrolled down
  cleanly … No overlapping text, no truncated numbers, no unintended copy or layout
  changes found in any of the four."
- **The figures, checked by hand at Haiku's rates:**
  - 79,671 reads at ($1.00 − $0.10) per million is $0.072 ("$0.07 not paid");
  - 40,101 writes at ($1.25 − $1.00) per million is $0.010 ("$0.01 more");
  - the net is $0.06, beside a $0.06 list price.

`UPDATE_GOLDENS=1 npm run verify:visual` wrote exactly these four (and M383's new
`replay.png`). Every other scene stayed inside both budgets, and `starter` is red on
purpose.

## Gate

At this commit: `npm run typecheck` is clean and the plain suites this milestone reaches
are green (see Checks). The full `npm run verify` ran once for the chain M381–M384 and
M380 on the tree holding all five; its result is in M384's ledger.

## Owed

- **The window on a relaunch.** `carriedMeter` restores spend and context from the
  transcript. The window returns with the next result. Carrying it needs the meta line
  to hold it.
- **A 1-hour cache write** bills at 2× input, not 1.25×. That undercount is already
  named in `pricing.ts`, and it understates the premium for a session on the 1-hour TTL.

Next: M379 (the team asks' palette rows).
