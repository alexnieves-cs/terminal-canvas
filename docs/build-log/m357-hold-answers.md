# M357 — a held agent is answered in the queue: Allow $N more, or Stop

**Verdict: shipped.** Arc 2.3, and the end of the per-node caps arc (M350–M357). M355 put a
held agent in the decision queue, and its row could only jump. The row now carries the
hold's two answers, beside Snooze:
- **`Allow $2.00 more`** grants the same allowance again, counted from what the agent
  has reached. It runs M352's `cap-agent` verb as a person, which is one undo and passes
  the same rules as every other door. Main re-reads the save (M351), releases the hold,
  and serves what the agent kept waiting first.
- **`Stop`** ends the agent's process (`agent:terminate`, M319). The conversation and
  main's hold stay, and the needs-you clears (M355's exit arm).

Leaving the row is an answer too: a held agent spends nothing, and Snooze puts it off.

## What landed

- **`allowMore(hold)`** (`shared/agent-session.ts`), pure. It returns the verb value and
  the button's words:
  - spend: the same allowance again, so $2.00 more at $2.10 is a `4.10usd` own cap;
  - context: a quarter of its cap in 5k steps (at least 10k), so a 150k cap at 160k is
    `200k`, "Allow 40k more".

  It returns null past the verb's own range, and then no Allow is offered.
- **The Dock's row** (`shell/Dock.tsx`): a `cap` item shows `data-inbox-allow-more` and
  `data-inbox-stop`, with the approval verbs' own classes. A title says what each does.
- **`Canvas.tsx`** wires Allow to `paletteActions.capAgent(id, value, 'person')`. A
  refusal is a toast in the verb's words. Stop is wired to
  `window.canvas.agentSession.terminate(id)`.
- **The `queue-hold` scene** (`scripts/shot.cjs`), a golden and a click-through. It
  pushes the hold main sends and the `wants-you` its tracker says, opens Needs you, and
  asserts that the row is a cap row in the hold's words with both answers. After the shot
  it CLICKS Allow and asserts that the agent's own cap on its record became $4.10: the
  Work tab's Spend cap field reads the record. That is the real verb, run as a person.
  Main's re-read of the save, which releases the hold, is M351's `cap.changed.1`. The
  shot harness's main has no caps dependency, and mirroring bootstrap's wiring there
  would test a copy. The first version of the scene asserted main's answer, and it failed
  for exactly that reason.

## Decisions, and why

- **"More" is counted from what the agent reached, not from the old cap.** At $2.10 of
  $2.00, a cap of $4.00 would leave $1.90, which is not what "Allow $2.00 more" says.
- **Allow sets the agent's OWN cap, even under the Settings cap.** The decision is about
  this agent. Raising the Settings cap from a queue row would raise every agent's cap,
  a decision the row does not show.
- **Stop is not a new verb.** It is M319's terminate, which the Orchestrate page already
  offers. A held agent has nothing in flight, so `interrupt` would do nothing, and
  `close` would remove the conversation from the canvas.
- **No new doors are owed.** Allow is `cap-agent`, which already has all four. Stop is an
  existing action given a second place.

- **The cap row's context is now one short line** (`Settings cap · agents.nodeCapUsd`,
  or `this agent's own cap`). M355's longer "where to raise it" was cut to an ellipsis
  in the popover, and the row's own Allow is where it is raised now. `inbox.cap.1`
  pins both lines.

## Checks

- `verify:agent-session allow.more.1`:
  - the spend and context allowances and their words, and the 10k floor;
  - `planCapChange` takes each value as a person, and the new cap releases the hold
    (`capCrossing` is null);
  - past the verb's range, nothing is offered.
- The `queue-hold` scene: the row's kind, its words and both answers before the shot,
  and the record's new own cap after the click.

`npm run verify:visual`: `queue-hold` is a new scene, and every other scene passed
against its golden. The first run failed the click-through by design (see What landed).

## Goldens

`queue-hold` is new. Two defects were found and fixed before any critic saw it:
- **The context line was cut to an ellipsis.** M355's "where to raise it" sentence did
  not fit one line. It is now whose cap it is, short (the Decisions above).
- **The answers were outdented and misaligned.** `Allow` and `Stop` sat flush left of the
  row's text, and `Snooze` sat higher and apart. The hold's verbs had borrowed the
  approval detail's group-verbs rule, top margin included. `.inbox__hold-verbs` now sits
  on the row's own indent, on one line with Snooze.

- **Round 1: Matches intent.** "the popover reads exactly as a hold, not a question …
  Task group: 'Stopped — claude — api (chat) is held at its $2.00 spend cap ($2.10
  reported).' with a 'Raise claude — api (chat)'s cap' button directly under it …
  'Allow $2.00 more', 'Stop', 'Snooze' are whole words, sit on one line, left-aligned at
  the same indent as the row's other button rows … 'Stop' is visibly red … No clipping,
  overlap, misalignment or illegibility." It saw both disclosed gaps. It noted one thing
  more: the chat's own header shows the green `idle` pill with `auto stuck`, not a held
  state. That is M352's owed rest-layer chip ("held — $2.10 of $2.00"), kept owed.

## Gate

`npm run typecheck` is clean. The full `npm run verify` ran in 720.2s: 59/61 suites, and
every red is the baseline.
- `verify:panels:agents`: `template.1` and `detail.1`.
- `verify:panels:product`: `starter.1` and the seven `workflow.*`.

The plain tier was green, including `verify:agent-session` (with `allow.more.1`) and
`verify:rail` 253/253.

## Owed

- **M367 (proposed): a hold's words wherever a needs-you is said.** M355 made a hold a
  needs-you. The queue says it as a hold, but two surfaces word every needs-you through
  M199's blocker vocabulary, which knows only an approval and a keyboard:
  - the Inspector's header ("this session needs you at its keyboard — open it to
    answer");
  - the resume card's "open blocker".

  So a held chat reads as a question there. The blocker needs a `cap` kind, in
  `holdWords`' words. This milestone's golden shows the gap, and its intent discloses it.

- **The row is checked in the shot scene, not in the gate.** The panels harness has no
  held agent. A `verify:panels:agents` check could push the same two events the scene
  does.
- **The composer does not show a hold at rest** (M352's owed item). A held chat's
  composer is refused only at a send. A state chip ("held — $2.10 of $2.00") beside the
  pill would say it at the rest layer. Proposed M358.

Next: M367 (a hold's words wherever a needs-you is said), then M358 (plan before execution).
