# M316 — Task-level recovery

Restoring panels and recovering a job are different problems. Brief #20 answered the
first (which terminals reattached, which ended). This answers the second for the one engine
that runs many steps and kept all of its state in memory: M132's pool, whose pending queue
and live workers were locals of `startPool`. A crash, a quit or a closed window mid-list lost
which items ran, which finished and which were never touched, and the only way on was Run
again — which re-sends every item, finished ones included.

## What landed

| Piece | Where |
|---|---|
| The job record, its whole-or-nothing reader, transitions, reconcile, the account and the recovery plan (pure) | `src/shared/job-journal.ts` |
| The journal on disk — `userData/jobs.json`, write-through temp-and-rename, a saved `running` converted to `interrupted` at construction, settled jobs trimmed first | `src/main/job-store.ts` |
| The pool caller journals every transition, `resume(jobId, indices)`, `liveJobs()`, `replay(jobId)`; the engine passes each item's list index to `createWorker` | `src/main/pool-caller.ts`, `src/main/pool-runner.ts` |
| `job:list` / `job:recover` — reconcile against live pools, worker transcripts and git, then the choices | `src/main/job-recovery.ts`, `bootstrap/agent-runtime.ts` (`createJobDoors`), `ipc.ts` (appended last) |
| "Unfinished work" — the notice beside Reopened, stacked in one corner | `src/renderer/shell/JobRecoveryNotice.tsx`, `.reopen-stack` in `styles.css` |
| Handoff runs the relaunch cut off: told as a job, and `continueRun` restarts only the mid-step panels | `run-model.ts` (`interruptedRunAccount`, `ABANDONED_BY_RELAUNCH`), `useRuns.ts` |

## The rules, and the silent failure each prevents

- **The send is journalled BEFORE it is made.** After it, a crash between the two leaves
  "minted, never sent" for work that ran — and recovery would re-send it as safe. Before it,
  the worst case is a person asked about an item that needed no asking (`jobs.send-first.1`).
- **Nothing that finished runs again, by any choice.** `recoveryPlan` refuses the whole plan
  by name when a finished item is named, and `resume` re-checks below every plan
  (`jobs.no-repeat.1`, `jobs.continue.1`).
- **An item that was sent and did not finish needs a person.** `continue` never includes it;
  the plain `retry` covers only items that never reached a worker (a refused mint, a refused
  send, a crash mid-mint); a sent item is retried only when ticked by name (`jobs.retry.1`,
  `jobs.mint-crash.1`). A worker that EXITS without the `ready` ending its turn is journalled
  `exited`, not finished (`jobs.exit.1`).
- **Live facts before the file.** A job live in this process (the window closed and came back)
  is `reconnect`, which replays its rows into the renderer's pool store; a worker whose durable
  transcript recorded a result is upgraded to finished and written back — the `ready` that
  would have said so can be lost in the crash (`jobs.reconcile.1`).
- **Closing the window no longer costs the turns in flight.** A mint the renderer cannot answer
  used to end the pool AND interrupt every live worker. Now it DRAINS: the in-flight workers
  finish, their `ready` is journalled, and the job is live until the last one ends; the items
  not yet started are left for continue. A refused SEND still interrupts everything — that is
  the manager saying it cannot drive a worker, not the window (`jobs.window.1`; `pool.2d/2e`
  unchanged and green).
- **Dependencies are recorded, and honoured.** Each item carries `after` (a pool's items are
  independent — recorded as such), and a job whose block hands off into a collect is `joined`:
  a partial pass cannot join a collect that waits on every item, so it offers only abandon and
  says to run the workflow again (`jobs.joined.1`). A handoff run's edges are its dependencies:
  continuing it restarts only the mid-step panels and lets the edges start the rest
  (`jobs.run.1`).
- **A stop by hand is not nagged back.** It is a decision made in front of the person; a budget
  stop IS listed, because raising the ceiling is when continuing makes sense (`jobs.stop.1`).

## What the scenarios exercise

`npm run verify:jobs` (plain node, 17 checks) drives the real caller and the real file store:
a **crash** is the caller dropped mid-flight and a new store built from the same file; an
**application restart** is that store converting and the doors reconciling; **window closure**
is a mint answered `no window` with a worker in flight; **interrupted worker creation** is a
mint that never resolves before the crash.

## Not done / owed

- No golden: the notice renders only with a journal entry or an interrupted run, and no shot
  scene seeds one. A visible-surface critic pass is owed before a golden is written.
- Not driven in the real app with a real agent. The Electron tier and `verify:ipc`'s count
  (now 162) were not run in this change.
- `repoAtStart` is job-level: parallel workers share a cwd, so changed files cannot be
  attributed to one item honestly, and the account does not try.
