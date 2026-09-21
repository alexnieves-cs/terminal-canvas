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

- [ ] On launch and reconnect, reconcile against real sessions BEFORE displaying Running.
- [ ] A stored session that no longer exists reads ended/unknown with when it was last seen.
- [ ] Stopped, interrupted, disconnected, crashed, unknown stay distinguishable from each other
      and from completed. Silence is **No recent events**.
- [ ] A permission answered elsewhere or auto-resolved while the app was closed cannot be
      answered twice; identity re-checked at the moment of the answer, not at render.
- [ ] Phase B's review identity and Phase C's subject gate hold across a relaunch: a review
      marked fresh is RE-DERIVED, not trusted from disk.
- [ ] Phase C's deferred item: the dependency lens reads the in-memory `automationResult` map,
      so after a relaunch a handoff that fired reads unknown/pending. The durable record owns it.
- [ ] Demonstrated by ACTUALLY killing things — kill a session's process, quit mid-run,
      relaunch — not by simulating the flags.
- [ ] Fresh-context critic on this milestone specifically.

## M302 — Reusable arrangements and saved views

- [ ] A successful arrangement saves as a template: brief, roles, dependencies, validation
      commands, persisted compatibly with the existing schema.
- [ ] Rerun mints a NEW execution id and names its base revision; a command with an external
      effect is named as such before it runs.
- [ ] Old artifacts keep their provenance: a rerun never re-attributes an earlier run's
      changes, checks or artifacts to itself. Demonstrated in the Artifacts tab.
- [ ] Saved views record filters, camera and layout ONLY. Opening one starts nothing.
- [ ] Closes Phase A's deferred "Orchestrate prefs are in memory" for the prefs a view owns.

## Gate

- [ ] `npm run affected` between steps.
- [ ] `npm run verify`, new reds listed separately from the pre-existing set and reproduced on
      the base branch before being called pre-existing.
- [ ] `verify:panels:orchestrate` watchdog re-measured with a `// measured` comment.
- [ ] `npm run shot` + a fresh-context critic per changed scene, a sentence each.
- [ ] Goldens NOT written, no merge, no push. Which scenes THIS phase changed, listed.

## Found / deferred

Out of scope for Phase E by the run prompt, logged here if the run is tempted: CI/PR/deploy
adapters and structured check adapters (Phase F), per-command output capture (handed to F
above), artifact content snapshots, durable checkpoints, cross-provider continuation, rollback.

*(Filled as the run finds things.)*
