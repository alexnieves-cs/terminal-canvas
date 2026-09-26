# M359 — the decision queue says a plan as a plan

**Verdict: shipped.** Arc 2, plan-before-execution, second half. M358 made a plan readable
and approvable where it is answered. The queue still said what the tool was, not what was
waiting:
- the row read "wants to use ExitPlanMode — plan";
- its summary read `ExitPlanMode · …` with a `Review` verb;
- its task was "Stopped — builder needs your permission to use ExitPlanMode", with
  "Answer ExitPlanMode request" as the next step.

A person who never typed that tool name was asked to allow it. Now:
- **the row** says the agent "has a plan to approve — Add rate limiting" (the plan's first
  line);
- **its summary** is `plan · Add rate limiting`, with a `Read plan` verb;
- **its task** is "Stopped — builder has a plan waiting for your approval", its next step
  is "Read builder's plan", and its after line says what Approve and Keep planning do;
- **its affects line** says the agent starts nothing until its plan is approved.

M358's golden showed the same tool words in three more places, so this milestone covers
them too:
- the Inspector's band: "Allow or deny ExitPlanMode", then "Waiting on you: ExitPlanMode ·
  …", and a "Review ExitPlanMode request" button;
- the task card's and the resume card's open blocker: "ExitPlanMode asks to use Add rate
  limiting to the API", which is M199's projection.

## What landed

- `shell/decision-inbox.ts`: a plan's blocker.
- `shell/task-queue.ts`: a plan's `why`, `next`, `after` and affects line, ahead of the
  general permission branch.
- `shell/Dock.tsx`: a plan's collapsed summary and its `Read plan` verb.
- `shared/run-outcome.ts`: a plan request's projected detail, "a plan waits for your
  approval — Add rate limiting". Its blocker is still `approval`, because the answer
  path is the permission's.
- `shell/inspector-context.ts`: the next action, "read the plan, then approve it or keep
  planning".
- `shell/Inspector.tsx`: "Waiting on you: plan · …" and a "Read the plan" button.

## Decisions, and why

- **Words only.** The kind, the key, the answer path, the grouping and the history are
  M358's, which is the permission path unchanged. A plan is a permission with its own
  sentence.
- **The first line is the plan's name.** Plans lead with a heading. `toolArgument` (M358)
  strips the heading marks, so the row names the plan the way the agent titled it.

## Checks

- `verify:rail plan.queue.1`: the blocker, the task's why, the next step's label, the
  after line and the affects line for a plan request.
- `verify:rail plan.inspector.1`: the Inspector's next action for a plan.
- `verify:viewport run.plan.1`: the projection keeps the approval blocker, in a plan's
  words and never with the tool's name.

`plan-approval` (M358's scene) was rewritten. Its Inspector reads "read the plan, then
approve it or keep planning", "a plan waits for your approval — Add rate limiting to the
API", "Waiting on you: plan · …" and a `Read the plan` foot button. The resume card's open
blocker says a plan waits for your approval. The queue's own row and task group are
scrolled above the detail in that shot, so `verify:rail plan.queue.1` pins their words,
and the scene's intent says so rather than claiming them. "ExitPlanMode" survives only
as the detail's literal `Wants` fact.

## Goldens

- **Round 1: Matches intent.** "Inspector top: 'read the plan, then approve it or keep
  planning' / (amber) 'a plan waits for your approval — Add rate limiting to the API' /
  'Waiting on you: plan · Add rate limiti…' … Foot button: 'Read the plan'. Resume card
  open blocker: … 'a plan waits for your approval — Add rate limiting to the API'.
  'ExitPlanMode' survives only as a literal fact in the popover's 'Wants ExitPlanMode'
  row … Chat panel (centre) and popover detail … are pixel-identical to OLD." The
  differences it listed are all explained by the text change:
  - the Inspector column's reflow;
  - the resume card re-wrapping;
  - more of the task's greyed helper text showing;
  - a canvas card sliver ending "…API". That card is the task's own card, and it reads
    the same projection, which now carries the plan's words.

## Gate

`npm run typecheck` is clean. The full `npm run verify` ran in 723.9s: 59/61 suites, and
every red is the baseline.
- `verify:panels:agents`: `template.1` and `detail.1`.
- `verify:panels:product`: `starter.1` and the seven `workflow.*`.

The plain tier was green, including `verify:rail` and `verify:viewport` (`run.plan.1`).

## Owed

Nothing new.

Next: cross-agent review (Arc 2): the review seat's verdict recorded beside the person's
readiness, keyed to the diff, advisory only.
