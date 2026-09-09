# M201 — Local review readiness as a fact (D07, first half)

## Problem

The board's `review` state is produced by exactly one line in the whole application —
`Canvas.tsx:4427-4429`, on a pull request opening — and `BoardPane`'s own empty-column sentence
says so: *"set when a lane opens its pull request"*. There is no word at all for the state a
task is in for most of its life: **the agent stopped, the lane holds changes, and nobody has
looked at them yet.**

The card's `Review` verb (`WorkNode.tsx:174`) already exists and is **navigation only**. It mints
an across-worktrees review panel over the lane's repository (`Canvas.tsx:6656-6663` →
`openReviewAcross`) and writes nothing back: it cannot move state, cannot record that a person
looked, and its result is never read by the board. The local review engine
(`review-engine.ts`, `review-commit.ts`, `review-discard.ts`) and the PR path are disjoint —
the only wire between them is `laneStatus` feeding `prRefusal`'s `ahead === 0` arm.

So a person deciding *what to do with a result* has to open the chat, read to the bottom, guess
whether the agent finished or merely stopped, open a review panel by hand, and remember on their
own whether they had already read that diff.

D06 made execution honest and stopped deliberately short: `turn complete`, `exit 0` and
`run ended` are all neutral **on purpose**, and every ended detail ends *"the task disposition is
unchanged"*. Nothing yet turns those honest execution facts into an answer to *"is this
reviewable, and did I already review it?"* That is this milestone.

## What this milestone is NOT

It does not change the meaning of the `review` work-item state. `review` keeps meaning
*a pull request exists*, `USER_SET_STATES` keeps excluding it, and `emptyColumnWord`'s sentence
is untouched. Local review readiness is a **separate fact with a separate name**, exactly as D04
kept working directory, lane and repository apart rather than widening one to cover three.

It builds no surface. The verb, the task-linked review view, `Request changes`, the card's
contextual action and the missing-lane recovery are M202.

## Intended experience (what M202 will render from this)

- A card whose lane holds changes and whose conversation has stopped says **`ready to review`**,
  and its one action is `Review`.
- A card already reviewed at the current diff says **`reviewed`**; if the agent has changed the
  lane since, it says **`changed since you reviewed`** — never silently the same word.
- A card whose conversation is running says `working`, whose conversation is blocked says
  `needs you`, and neither is called reviewable.
- A lane with no changes says **`no changes`** — an honest empty, not a green completion.
- A lane whose worktree is gone says so and offers to locate it; it never silently reviews a
  different directory.

## The state table

Two axes, kept apart, because they answer different questions and a single word would lose one.

**`ReviewHandoffState`** — *what is true of this task right now*, in priority order:

| State | Cause | Action offered |
|---|---|---|
| `no-lane` | the item has no `panelId`/`worktreeId` | `start` |
| `lane-missing` | the worktree record is gone, or the section says it is no longer a worktree | `locate` |
| `unreadable` | git missing, or the repository could not be read | `locate` |
| `blocked` | the linked conversation has a live blocker | `answer` |
| `working` | the linked conversation is running or queued | `resume` |
| `empty` | the lane's diff is clean | `resume` |
| `shared` | two or more panels have run in this repository | `review` |
| `ready` | the lane holds changes and nothing is in flight | `review` |

**Amended after the critic round.** The first cut folded `shared` into `changes`, so a repository
where several panels have run read as `ready to review · N files` and let a review be recorded over
work this task cannot claim. `shared` means, by `review.ts`'s own definition, that no per-panel diff
is attributable; it is the fourth claim D07 step 3 asks to keep distinguishable, beside observed,
reported and unavailable, and folding it in was the exact failure this module's header forbids one
paragraph earlier. It is now its own state, with its own sentence, still reviewable — a person can
read a shared diff, and is told what they are reading.

**There is no `locate` action.** The first cut had one, whose sentences told the person to locate
the lane — an affordance no surface offers. Naming a door that does not exist is worse than naming
a smaller one that does, so a lost lane routes to `start`.

Execution outranks the diff: an agent still writing means the diff under it is a moving target.
`no-lane` outranks everything because there is nothing else to say.

**`ReviewStanding`** — *what I already did about it*, carried **beside** the state, never folded
into it:

| Standing | Cause |
|---|---|
| `none` | no review has been recorded |
| `current` | a recorded review's signature equals the lane's signature now |
| `stale` | a review was recorded and the signature has changed since |

Keeping them apart is the point. A task can be `working` **and** `stale` at once — the agent went
back to work after you reviewed — and one word cannot say both. This is D06's five-axis rule
applied one level out.

## Evidence and its attribution

The review view has to show what actually happened, and this application has exactly two sources
with **different epistemic standing**. They are never merged.

- **`observed`** — a `RunRow` in this app's own run ledger (`shared/run-ledger.ts`) whose `cwd`
  is inside the lane. Main spawned that process and read its `exitCode` off the PTY itself.
  This app watched it exit.
- **`reported`** — a shell tool call in the linked conversation's transcript: a `tool_use` block
  whose input carries a string `command`, paired by `toolUseId` with its `tool_result`'s
  `isError`. The app watched the agent *request* the command; the outcome is the agent's CLI's
  claim. This app did not run it and cannot verify it.
- **unavailable** — neither exists, said in a sentence, never as an empty list or a zero. **And
  the sentence says WHICH kind of nothing it is.** "Nothing ran", "the lane's conversation is
  closed so its commands were never looked for", and "this canvas could not read its own record"
  are three different facts, and the first cut said the first one in all three cases — an overclaim
  in the module whose whole job is to stop overclaiming. A closed lane is the common case, not a
  corner.

**No command is classified as a "test" or a "check" by pattern, and this is deliberate.** A
regex deciding that `npm test` is a check while `make ci` is not would put a confident
pass/fail badge on a guess — the exact failure D06 spent two milestones removing from run
supervision. The evidence section reports commands and who witnessed their exit; a reviewer
reads the commands. Failures sort first, because a non-zero exit is the fact a reviewer wants,
and the list is capped with its overflow counted rather than pre-sliced (M130's rule).

An unpaired `tool_use` — the agent asked and no result was recorded — is `unknown`, never
`passed`.

## The recorded review

A review that leaves no trace cannot go stale, so one fact is persisted and only one:

```ts
reviewed?: { at: number; signature: string; files: number }
```

on `PersistedWorkItem`, absent until a person reviews, carried by `carryWorkItem` field by field
and dropped by name when malformed. **No diff is copied into layout** — the guide's rule — and
no path list either: the signature is a 8-character FNV-1a digest over the sorted
`path:added:removed:flags` rows the review already computed, so detecting drift costs nothing
beyond the review that was already run.

**Recorded bound, stated rather than hidden:** a change that leaves every path and both counts
identical — one line edited and another reverted in the same file — produces the same signature
and is NOT detected as stale. The signature is a cheap fingerprint of the diff's shape, not a
hash of its content, and the alternative (hashing every hunk) would mean reading every file's
full diff on every card render. This bound goes in the build log and in the module header.

## Architecture

One new pure module, `src/shared/review-readiness.ts` — no DOM, no React, no electron, so it
runs in the plain-node tier and is driven by `verify:review` under the scoped ids `readiness.*`.
It is a **projection**: it invents no fact and asks for nothing. Its inputs are all things
another module already owns —

- the `PersistedWorkItem` (the lane ids and the recorded review),
- the lane's `ReviewSection | undefined` from `reviewAcross`, which is the fork diff and
  therefore survives the lane's chat being closed (M86's rule — main drops a panel's baseline on
  kill, and a review of finished work is exactly what this is for),
- the linked conversation's `RunNodeSupervision | undefined` from M199's `projectSession`,
- `RunRow[]` from the run ledger and `TranscriptTurn[]` from the chat store.

Containment is `insideDirectory` from `shared/work-scope.ts`, reused and not re-written: whether
a command's `cwd` is in the lane is the same question about the same kind of string that M196
already answered on segment boundaries, and a second copy would differ in the arm nobody tests.

No IPC channel is added. No panel kind is added. `ReviewSubject` gains an optional
`workItemId?: string` (the `across?: true` precedent — write-only-when-present, absent through
every copy site) so M202's view can name the task it belongs to; nothing reads it this milestone.

## Verify

Red-first, watched failing before the module exists, in `verify:review` under `readiness.*`:

1. `readiness.1` — the seven states, each from its own input, in priority order: execution
   outranks the diff, and `no-lane` outranks execution.
2. `readiness.2` — standing is computed independently of state: a `working` item with a stale
   signature reports `working` AND `stale`; a `ready` item with a matching signature reports
   `ready` AND `current`.
3. `readiness.3` — the signature is stable under row order, changes with a count, changes with a
   path, and the recorded bound holds (identical paths and counts ⇒ identical signature) —
   asserted as the KNOWN limit, so a later attempt to "fix" it fails the check that documents it.
4. `readiness.4` — attribution: an observed row and a reported tool call with the same command
   are two entries with different attribution and are never merged; an unpaired tool_use is
   `unknown`; a ledger row whose cwd is outside the lane is excluded; a row with a null exit
   code is `unknown`, never `passed`.
5. `readiness.5` — the empty arm names why there is no evidence rather than returning `[]`.
6. `work.readiness.1` (in `verify:layout`) — `reviewed` is absent on every pre-M201 file,
   survives `carryWorkItem`, is dropped by name when malformed, and costs the FIELD and not the
   entry (the anchor precedent).

## Acceptance

1. Local review readiness has a name of its own and the `review` state's meaning is unchanged;
   `USER_SET_STATES` and `emptyColumnWord` are untouched.
2. State and standing are separately reportable and a task can be `working` and `stale` at once.
3. Observed and agent-reported evidence are distinguishable in the data, and nothing is
   classified as a check by pattern.
4. Nothing is persisted but the recorded review's timestamp, signature and file count.
5. `npm run verify` is green with every suite printing its tally.
