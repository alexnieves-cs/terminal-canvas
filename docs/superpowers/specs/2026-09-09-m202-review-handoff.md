# M202 — The review handoff surface (D07, second half)

## Problem

M201 made local review readiness a fact and nothing renders it. The card still shows a board
disposition and an execution line, with no answer to *"what should I do with this result?"*; its
`Review` verb still opens a bare across-worktrees diff with no task beside it, no evidence of what
was run, no way to record that a person looked, and no route back to the agent except finding the
chat by hand.

## Intended experience

**The card offers one action, chosen by the facts.** `Start work…` when there is no lane,
`Resume` while the agent is working or when the lane came back empty, `Answer` when a permission
question is pending, `Review` (or `Review again`) when there are settled changes. The board
disposition pill and the M200 execution line are unchanged and stay where they are — this is a
third line, not a re-labelling of either.

**Review is beside the task.** Opening it from a card mints the same across-worktrees review
panel M86 already built, with `subject.workItemId` set, and the node grows one section it does
not have otherwise:

- the handoff line — the word, and the sentence explaining what it means for reviewing;
- **what was run**, as two visibly different kinds of claim. A command this canvas ran carries its
  real exit code and reads *this canvas ran it and read its exit code*; a command from the
  conversation reads *the agent ran it and its CLI reported the result*, with no code, because
  there is none to show. Failures first; the overflow counted, never hidden;
- **any unresolved question** — M199's blocker, carried through unchanged so the card, the workflow
  diagram and this section name the same one. Stated here and deliberately not answerable here: a
  permission prompt is answered where the person can see what they are agreeing to;
- **the agent's own account** of what it did, labelled *"the agent's own account, not evidence"* and
  set apart from the evidence list, because painting a claim as a finding is the collapse this
  phase exists to prevent;
- `Mark reviewed`, and once marked, when it was and whether the lane has moved since.

**There is a direct route back to the agent.** `Continue the conversation` focuses the lane's
chat and **inserts** a message naming the reviewed files into its composer — inserted, never
sent, which is M80's rule for every template message and the only version that leaves the person
in charge of what their agent is told.

**Open PR is unchanged.** Its refusals are `prRefusal`'s, the broker still asks the teammate's
spend card, and nothing here pushes.

## Two decisions, recorded rather than assumed

**`Mark reviewed` is a control on the review node and NOT a verb with four doors.** Every other
user-facing verb in this app takes the four-door rule, and this one deliberately does not: an
agent line that asserts *a person reviewed this* is exactly the false claim D06 and M201 exist to
remove, and a workflow node that marked its own output reviewed would make the mark worthless.
It sits beside `Commit`, which is a review-node control with no palette row for the same family
of reason. This is a recorded omission with its reason, not an oversight.

**A lost lane routes to `Start work again…` rather than rebinding to a chosen directory, and there
is no `locate` action at all.** The
guide's step 6 asks for locate/rebind for missing or moved **files**, and that is already honest:
a rename is carried as `renamedFrom`, and a file whose diff cannot be read answers `unavailable`
rather than substituting another. A *lane* whose worktree record is gone is a different thing —
re-pointing a task at an arbitrary directory would need main to re-judge that root through the
Places gate and mint a record for it, which is a new grant-adjacent door, and the existing honest
recovery (start work again, which mints a lane through the gate that already exists) is one
click away. The first cut kept the word `Locate` in four sentences and shipped no such
affordance; that was a dangling promise, and the action is now the one that exists. If a real need
for rebinding appears, it gets its own milestone and its own gate checks.

## The one new verb

`review-task` — open the review for a work card — with all four doors:

| Door | |
|---|---|
| canvas | the card's `Review` verb |
| palette | `work.review` |
| agent | `tc plan review-task wk1` |
| workflow | an action node whose line is `review-task wk1` |

Non-destructive; it opens a panel and reads a diff. It is **not** added to
`TEAMMATE_REFUSED_VERBS`: opening a review panel neither starts a session nor changes a setting,
and a teammate that can point a person at what it changed is doing the right thing. It rewires
the card verb that exists rather than adding a second one beside it.

`closure.v9.1`'s fixture gains a `work` panel so the agent line names a card and not a picture.

## Architecture

No new panel kind, no new IPC channel and no new persisted record beyond M201's mark.

- `ReviewNode.tsx` reads `subject.workItemId` and, when present, renders the task section from
  M201's pure projection. Its inputs come from surfaces that already exist: the item from the
  canvas's own list, the lane's `ReviewSection` picked out of the `across` result the node
  **already fetched**, the supervision from `projectSession`, ledger rows from `ledger:list`
  and transcript turns from the chat store.
- `WorkNode.tsx` takes one new prop, the handoff, and renders its action. The four existing verbs
  keep their DOM aliases; the `review` verb's label and reason become the handoff's.
- `Canvas.tsx` builds the handoff per card in the same memo that already builds `liveRunFacts`.
- Marking reviewed writes through the existing work-item patch path, so it lands in layout with
  the record rules M201 gave it.

The lane section is picked by `insideDirectory` against the item's lane path — reused, not
re-written, for M196's reason.

## Verify

- `readiness.6` (`verify:review`) — picking the lane's section out of an across result: the
  longest matching record wins, a section for a different worktree is never the task's, and no
  section at all is `lane-missing` rather than the main tree's diff.
- `closure.v9.1`, `executor.1`, `closure.1` (`verify:verbs`) — the new verb's four doors, its
  executor arm and its `PaletteActions` member.
- `review.task.2` (`verify:panels:product`) — the real renderer: a card with a lane opens a
  review carrying the task id; the node paints the handoff word and both evidence attributions
  as separate rows; `Mark reviewed` writes the mark and the word becomes `reviewed`; a changed
  diff makes it `changed since you reviewed`; `Continue the conversation` INSERTS into the lane
  chat's composer and sends nothing.
- `work.action.1` (`verify:panels:product`) — the card's one action follows the facts across
  no-lane → working → ready → reviewed, and the disposition pill never changes with it.

## Acceptance

1. A person can decide what to do with a result before a PR exists, from the card, without
   opening the chat.
2. Observed and agent-reported evidence are visibly different claims on screen.
3. A recorded review goes stale when the lane moves, and says so.
4. The route back to the agent inserts and never sends.
5. No green state anywhere implies the task is done; the disposition stays the person's.
6. `npm run verify` green; `verify:visual` walked and every intended change carries a critic's
   sentence before any golden is written.
