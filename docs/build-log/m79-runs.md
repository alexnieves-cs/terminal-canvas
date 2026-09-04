# M79 — Runs

**Branch:** `m79-runs`. **Spec:** `docs/superpowers/specs/2026-09-03-m79-runs-design.md`.
**Plan:** `docs/superpowers/plans/2026-09-03-m79-runs.md`. **Status:** finished 2026-09-04.

**Thesis sentence:** the graph ran; here is what happened, by name, with what it cost — and
here is how to run it again.

## What landed

- `shared/runs.ts` (`PersistedRun`, `RunEntry`, `RUNS_MAX`); `parseRuns` in the layout schema
  with the record rules; `CanvasState.runs`; the store's load and save copies; every
  `CanvasState` literal carries `runs` (the empty initial, the workspace verbs' outgoing).
  `verify:layout run.1` (188/188).
- `renderer/canvas/run-model.ts`: `componentOf`, `rootsOf`, `sinksOf`, `beginRun`,
  `recordRunEvent`, `runIsComplete`, `finishRun`, `runCost`, `runName`. `verify:viewport
  run.1–.2` (129/129). `rail-sections.ts` `buildRunRows` with the outcome word and the two
  named refusals of `Run again`. `verify:rail run.1` (157/157).
- `useRuns.ts` (the recorder) fed by `useHandoff`'s new `onRunEvent` at the sites where the
  automation sentences are set; Canvas owns `runs` state saved with the layout; `Run again`
  restarts the terminal roots in order and records its sentence on the row.
- Surfaces: the Workspaces pane's `Runs` section (name, facts in mono, the outcome word, `Run
  again`); the derived read-only run frames; the Work tab's `run: <name> · <outcome>` line
  (or `not part of a run`).
- `verify:panels run.1`; a `runs` shot scene; README row; CLAUDE.md note and counts;
  verify-suites counts; three `docs/load-bearing.md` entries; this log.

## Red first

- Every plain-node check red at module scope (the modules absent; a throwing layout check
  guarded so it reads red rather than aborting the suite; the cost check's model id corrected
  to the price table's key).
- `verify:panels run.1` red SIX times, each a real finding rather than a harness quibble:
  the join's target was a shell that ran the pasted transcript (a `sh -c 'echo ready; read x;
  exit 0'` reads one line and ends, so the sink ENDS and the run seals); a lone shell's exit
  opened a run (the recorder now needs an enabled OUTGOING edge, and asks that before walking
  the component); the store read went through `mergedWorkspaces()` rather than the door a
  fresh renderer uses; the pane and the dock were left where the previous block put them; the
  previous renderer's debounced auto-save landed AFTER this block's save and reverted it (the
  block waits); and — the real defect — **the recorder sealed inside a `setRuns` updater**, so
  its component was released too late: run 1 stayed open in the ref for ever, every later fire
  landed on it, and no second run was ever recorded. It now decides synchronously against
  `runsRef` and writes its refs beside that decision.
- The restart suppression I added for the verifier's finding 5 was removed after the harness
  showed it swallowing the panel's next REAL exit: M6c's rule already means a deliberate
  restart emits no `exited` at all, so no spurious run can open.

## Decisions taken while building, and why

- **The component is captured at the run's start** and the join recomputes per arrival: a
  record of one execution and live control flow are different things.
- **Frames are derived, never groups**: a persisted group is draggable, collapsible and
  outlives the run.
- **The recorder observes**: every event is emitted beside the sentence the list shows.
- **Cost by the summary's rule**: absent when any panel is unpriced.
- **A chat root is skipped by name** on `Run again`: a chat is re-run by sending it a message.

## What this milestone does not do, stated

- A run has no name of the user's choosing yet; `<roots> → … · HH:MM` is the honest default.
- A run's cost is the panels' usage at sealing, not the delta since the run began.

## The visual loop

**Before any critic**, the first `runs` scene showed the run row's name collapsed to nothing
(the name shared a flex row with its facts) and the Work tab's run line sitting inside the
Changes section above `no runs yet`.

**The critic** (briefs + the PNG, fresh context). Accepted: the Work tab showed an answer and
an empty state at once (`Run` is its own section now; the ledger's is `Commands`); the two
surfaces described one run with different facts (ONE `facts` string built in `buildRunRows`,
rendered verbatim in the rail and the pane); the name was a truncated concatenation of member
titles (`run N`, which the frame's caps label can carry); `done`/`failed`/`running` minted a
fourth vocabulary (the state words: `working`, `idle`, `exited N`, from `agentWord`/`panelState`
— `verify:rail state.2` caught the literals the moment they were typed); the run frame was a
blue fill (a dashed hairline, no tint); the row wrapped mid-verb (the facts truncate, the word
and the verb do not); the pane's run line had no verb (it has `Run again`). Declined, recorded:
the frame's label pinned to the viewport when its corner is off screen (M26's group frame
does not do that either); dashing an edge until its condition is true (M78's ruling); the
`CHANGES` contradiction and the `COST` sentence (M9/M46's, and both are true of the fixture).

**The verifier** (spec + diff, fresh context): "delivered with gaps". Accepted and fixed: an
open run was orphaned as `working` for ever after a relaunch (`sealAbandoned` on load and on
a workspace switch); a workspace switch wrote the outgoing history into the incoming
workspace (`setRuns` and `forgetOpenRuns` are workspace-verb deps now); `runIsComplete` had
one arm of two, so a cycle or a timed-out target never sealed (both arms); a `skipped` closed
a join's sink while another source was still running (a skip closes an entry only when no
source is owed); the cost billed every earlier run again (`runCostSince` against the run's own
usage baseline); the rail's rows churned at render frequency (memoised, with a one-second tick
only while a run is open); side effects lived inside a state updater (see Red first). Declined
with reasons: `Run again`'s "in order" is the run's own panel order and the spec now says so;
a run whose panels moved to another workspace keeps its record and loses them at the next
parse (the record rules' own behaviour); the `queued` event kind (a queued chat send is
recorded as a delivery whose sentence begins `queued —`, which is what the row shows).

## Verification

Run alone, after the tmux verify server was killed: `npm run verify` green end to end —
`verify:layout` 188/188, `verify:viewport` 130/130, `verify:rail` 157/157, `verify:panels`
284/284. The `runs` scene re-shot four times and read.
