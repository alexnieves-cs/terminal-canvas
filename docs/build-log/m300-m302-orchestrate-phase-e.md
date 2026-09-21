# M300–M302 — Orchestrate Phase E: recovery and reuse

Run prompt: [2026-09-20-orchestrate-phase-e-run-prompt.md](../superpowers/specs/2026-09-20-orchestrate-phase-e-run-prompt.md).
Plan: [orchestrate-reference-plan.md](../orchestrate-reference-plan.md), Phase E.
Branch `m300-orchestrate-phase-e`, worktree `.claude/worktrees/phase-e`, off `main` at `fbd523a9`
(Phase D merged at `2a1f0e56`; M294/M297/M298/M299 landed after it).

**This ledger is the state.** Nothing here is a claim about the app until its checklist line
says it was measured in the real app.

## The goal

Not lying after something goes wrong. A relaunch, a disconnect, a killed process, a rerun —
every failure mode in this phase is silent by nature: the app shows a confident **Running** for
a session that no longer exists, and nothing turns red. **Accuracy beats completeness at every
choice**; a fact the app cannot support is a sentence saying so, never an empty box.

## Exit criterion

From the plan: *disconnect and relaunch do not fabricate state; a rerun is a new execution;
old artifacts keep their provenance.* Plus this run's added condition: **Artifacts and Timeline
are tabs with something in them**, each subject-bound, each explicit about what it does not
have.

## Retention — as built

Written at the definition (`shared/run-ledger.ts`'s `EventRow` and `GapRow`, `main/run-ledger.ts`'s
`trim`) and here.

- **What is kept:** references only — what happened and where the evidence is. Command,
  execution context, tested revision, exit outcome, changed PATHS, permission decisions,
  handoffs. No output bytes and no artifact content, and the TYPE is the enforcement: `EventRow`
  has nowhere to put a body, the same trick `RunRow` uses. `orch-timeline.2` pins it.
- **What bounds it:** a ROW COUNT — `RUN_LEDGER_MAX_LINES`, 2000 — because the record rides the
  run ledger's existing count-tracked ring trim. Not bytes, because with no bodies a row is a
  few hundred bytes and a count is the honest bound.
- **What is dropped first:** the oldest lines, by the trim, which now keeps `max - 1` rows and
  spends the freed line on a gap marker.
- **What the drop costs the reader:** nothing silently. The gap row carries how many entries
  went and when; it passes every subject filter, because it is a fact about the FILE; a second
  trim merges into it rather than appending another, inheriting its count, so the markers
  cannot grow one per trim. `orch-timeline.4`.
- **What was NOT added, and why:** a per-event content identity. Phase B measured a
  `git diff --binary` per command end; a write of that shape per event is Phase F's question if
  it is ever wanted. Per-command output capture is handed to **Phase F by name** for the same
  reason — see Found / deferred.

## Why references only

Phase B measured that stamping a content identity costs a `git diff --binary` per command end
(`RunsDeps.identityOf`), invisible in the harness and unmeasured on a large repository with a
hot agent. A per-event write of that shape is not added here. The consequence is inherited and
named: a failed check's output is still the session's scrollback tail, and **per-command output
capture is handed to Phase F by name**, not silently dropped.

## M300 — Durable timeline

- [x] A durable event row rides the EXISTING ledger stream (`shared/run-ledger.ts`'s
      `LedgerRow` union), not a new store — inheriting the queue, the ring trim and the
      malformed-line rule, and costing `panels-harness.cjs` no new mirror.
- [x] The record links dispatch, tools, permission decisions, command outcomes, changed
      artifacts and handoffs, for a task and for a session.
- [x] Transient vs persisted is distinguished in the DATA and in the WORDS on screen.
- [x] Every entry carries source, timestamp and freshness.
- [x] A trim records what it dropped, so a gap reads as a gap and never as "nothing happened".
- [x] `WORKBENCH_TABS` goes three → five; `verify:orchestration workbench.1` re-pinned at five
      IN THE SAME COMMIT as the readers.
- [x] **Timeline** tab: read-only, subject-bound through `orch-subject-gate.ts`, live tail and
      durable record visibly different things.
- [x] **Artifacts** tab: a provenance list over references; an artifact whose content has moved
      on says so rather than showing a stale body.
- [x] Inherited Phase B item FIXED: the Checks tab reads watchers off the canvas's watcher
      panels only, so a watcher armed in main from a template with no panel is invisible.
- [x] Inherited Phase B item HANDED TO F by name: per-command output capture, with the reason.

### M300 as built

| Piece | Where | Check |
|---|---|---|
| `EventRow`, `GapRow`, their parsers, the timeline types | `shared/run-ledger.ts` | `orch-timeline.1`, `.2` |
| The gap-writing, gap-merging trim and the merged `timeline()` reader | `main/run-ledger.ts` | `orch-timeline.3`, `.4`, `.5` |
| `ledger:timeline` and `ledger:event`, appended LAST to `registerIpcHandlers` | `shared/ipc-contract.ts`, `preload/`, `main/ipc.ts`, `main/index.ts` | `verify:ipc`, `verify:meta` 14 |
| The renderer's ONE write door and its importer set | `renderer/orchestration/orch-record.ts` | `orch-timeline.6` |
| Artifacts and Timeline, their words and their read | `OrchWorkbench.tsx`, `shared/orchestrate-prefs.ts` | `workbench.1`, `workbench.1b` |
| Panel-less watchers reach Checks through the record | `OrchWorkbench.tsx` | `orch-timeline.7` |

The four write points, each the moment the renderer owns a fact main cannot see:
a **dispatch** that completed (`useBoardVerbs.ts` — every refusal returns first), a
**permission** answer main accepted (`palette-actions/presets.ts`), a **handoff** outcome at the
funnel that also feeds Phase C's in-memory map (`Canvas.tsx`), and a **review mark**
(`useBoardVerbs.ts`'s `patchWorkItem`, which fires only for `reviewed` — every other patch
records nothing, because a row per keystroke is a log and not a history).

Main already wrote the fifth without knowing it: `main/watch-runner.ts` has appended a ledger
row per watcher run since M52, with the watcher's id as its panel id. That is why Phase B's
inherited item closed as a READ rather than a new store.

## M301 — Restart reconciliation

- [x] On launch and reconnect, reconcile against real sessions BEFORE displaying Running.
- [x] A stored session that no longer exists reads ended/unknown with when it was last seen.
- [x] Stopped, interrupted, disconnected, crashed, unknown stay distinguishable from each other
      and from completed. Silence is **No recent events**.
- [x] A permission answered elsewhere or auto-resolved while the app was closed cannot be
      answered twice — READ, not built, and the reason is below.
- [x] Phase B's review identity and Phase C's subject gate hold across a relaunch: a review
      marked fresh is RE-DERIVED, not trusted from disk.
- [x] Phase C's deferred item: the dependency lens reads the in-memory `automationResult` map,
      so after a relaunch a handoff that fired reads unknown/pending. The durable record owns it.
- [x] Demonstrated by ACTUALLY killing things — `orch-reconcile.app.1/.2` kill every
      process the chat spawned through the runner's own exit path, then have the runtime
      forget the session, and read the WORDS off the DOM. **The honest limit:** this part's
      agent is the harness's fake runner, so the kill exercises the manager's real exit
      path and not an OS signal to a real CLI; and `dispose` stands in for what a relaunch
      does to the runtime's record, because main is not restarted inside a suite.
- [ ] Fresh-context critic on this milestone specifically.

### M301 as built, and the measurement that changed it

**The lie was quieter than the prompt's headline.** A panel restored from `layout.json`
whose agent is gone did not claim *Running* — `rosterState`'s fallback handed it **`idle`**,
the word a LIVE agent waiting for you wears. Nothing was red.

**The design changed THREE times, every time in the Electron part, and that is the
milestone's real story: none of these could go red in plain node.** The first
version read liveness off the session's `status`. Measured: a chat's PROCESS exits between
turns and `--resume` brings it back, so `status: 'exited'` is the ordinary state of an idle
chat — and every idle agent on the page started reading `no session`. `orch-task.2` caught
it. Liveness is therefore MEMBERSHIP (does the runtime hold a session record at all), which
is the fact a relaunch destroys; the status is still read, but for WORDS: a live session
whose process is down says *the conversation resumes on your next message*, and a gone one
says how its last process ended.

**Second: `dispose` does not leave the runtime's record absent from `list()`** in a way the
page can observe while the panel is still on the canvas, so dispose could not stand in for a
relaunch either.

**Third, and it moved the milestone's target: a restored CHAT auto-creates its runtime
session.** A conversation is therefore never "gone" — it resumes — so a chat's
reconciliation is only ever about whether a PROCESS is up. The state "this panel had a
session and has none now" is real on the object that has no `--resume`: an agentic
**TERMINAL**. Main has a PTY for it or it has none, and until M301 it read `idle` either
way. That is where the lie actually lived, and the page now reads the terminal's liveness
from `pty.list()` with the record's own sighting as the evidence it ever ran.

The Electron checks prove the two halves a person needs the page to get right: a killed
process must NOT read `no session` (the conversation resumes), and a restored agentic
terminal with no session MUST, with when the record last saw it.

| Piece | Where |
|---|---|
| The one place that decides what the app may say | `shared/session-standing.ts` |
| The reconciled arm, ABOVE the `agentState` fallthrough, and out of the active count | `orchestration-model.ts` |
| Main's two answers — `agentSession.list`, one `ledger.timeline` read | `OrchestrationView.tsx` |
| The lens seeded from the durable record | `Canvas.tsx` |

Both reads are **null, not empty**, while outstanding or after a failure: an unreconciled
page keeps pre-M301 behaviour rather than flashing a wall of `unknown`, and an unreconciled
CALLER (every pre-M301 fixture) is unchanged.

**The permission item is a READ, not a build, and the reason is the design's.**
`main/approvals.ts` keeps pending requests and grants IN MEMORY and says why a grant must
not survive a relaunch ("a grant that survived a relaunch would answer a question the user
was never shown"). After a relaunch there are no pending requests to answer twice, so the
double-answer risk does not exist across one; within a run it is M76's — main clears every
surface through its permission-answered event, which Phase A's `orch-task.4` already
measures. Nothing was added, and nothing should be.

**Review identity across a relaunch is re-derived, not trusted.** The workbench reads
`review.panel`/`review.across` live on every selection and compares the item's stored mark
against that read; the mark on disk is an input to the comparison, never the answer.

## M302 — Reusable arrangements and saved views

- [x] A successful arrangement saves as a template: brief, roles, dependencies, validation
      commands, persisted compatibly with the existing schema.
- [x] Rerun mints a NEW execution id and names its base revision; a command with an external
      effect is named as such before it runs.
- [x] Old artifacts keep their provenance: a rerun never re-attributes an earlier run's
      changes, checks or artifacts to itself. Demonstrated in the Artifacts tab.
- [x] Saved views record filters, camera and layout ONLY. Opening one starts nothing.
- [x] Closes Phase A's deferred "Orchestrate prefs are in memory" for the prefs a view owns.

## Gate

- [ ] `npm run affected` between steps.
- [ ] `npm run verify`, new reds listed separately from the pre-existing set and reproduced on
      the base branch before being called pre-existing.
- [ ] `verify:panels:orchestrate` watchdog re-measured with a `// measured` comment.
- [ ] `npm run shot` + a fresh-context critic per changed scene, a sentence each.
- [ ] Goldens NOT written, no merge, no push. Which scenes THIS phase changed, listed.

## The harness trap, in its positional form

The prompt's carried trap — *mirror any new `stores.ts` dependency into
`panels-harness.cjs`* — has a second shape, and this run walked into it: **`panels-harness.cjs`
and `shot.cjs` construct their OWN `registerIpcHandlers` calls.** `registerIpcHandlers` appends
new collaborators LAST with inert defaults, so `ledger:timeline` and `ledger:event` were
silently INERT in both harnesses. The inert read answers "no entries", the page believes the
record is empty, and the Electron tier proves a different app with nothing red — it cost a red
`orch-reconcile.app.2` to find, and `npm run shot` would have photographed every Artifacts and
Timeline tab as an unwired build.

Both are wired now, each with a comment at the argument saying why. Any future collaborator
appended to `registerIpcHandlers` has to be added in three places, not one.

## Found / deferred

Out of scope for Phase E by the run prompt, logged here if the run is tempted: CI/PR/deploy
adapters and structured check adapters (Phase F), per-command output capture (handed to F
above), artifact content snapshots, durable checkpoints, cross-provider continuation, rollback.

*(Filled as the run finds things.)*
