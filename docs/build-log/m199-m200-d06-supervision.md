# M199–M200 — D06 honest supervision

The [D06 guide](../product-development-guide-2026-09-08.md#d06--make-agent-and-run-supervision-honest),
[M199 spec](../superpowers/specs/2026-09-09-m199-run-truth.md), and
[M200 spec](../superpowers/specs/2026-09-09-m200-supervision-surfaces.md) define this close.

`shared/run-outcome.ts` owns one pure table for run-node and linked-task execution. It keeps five
facts apart: execution phase, queue reason, live blocker, execution result, and the work item's
human disposition. A completed agent turn reads `turn complete`; a successful process reads
`exit 0`; the Runs rail reads `run ended`. All use a neutral tone, so none claims the task was
reviewed or done.

The live overlay is derived from the existing chat snapshot, attention set, and ordered approval
list. Structured approval wins over generic keyboard attention and carries the oldest request's
exact id, tool and argument. Workflow and task controls call the same `answerApproval` action as
chat and Attention. Queue detail distinguishes the current turn from the canvas concurrency
ceiling, and a backend with no live detail says so. No request id enters a run or task record.

`run.supervision.1` was watched red before the projection existed. `run.1` was then watched red on
the old `idle`/`exited N` aggregate wording. `run.surface.1` pins both consumers to the shared
projection and standing approval door. Targeted viewport, rail, typecheck, build and Electron
product checks cover the state table and start-recovery interaction; the act-close gates are
recorded in the ledger.

Critic: the new blocker box appears only for a selected run with a live blocker or queue, and the
task execution line appears only beside an existing linked session. Resting workflow and board
goldens therefore should not move. `verify:visual` confirmed that judgment at 60/60; no golden was
rewritten.

Final gates: `npm run verify` exit 0 with every suite tally; `verify:visual` 60/60;
`verify:packaged` 12/12.
