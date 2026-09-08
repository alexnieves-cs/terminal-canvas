# M184 implementation plan

Spec: `docs/superpowers/specs/2026-09-08-m184-save-run-stop.md`. Grep the load-bearing files
for `runs`, `useRuns`, `pool-runner`, `agent-session` (interrupt), `layout-schema` (parseRuns).

1. Pure, red first (delegated): `PersistedRun.definition?: { templateId, revision, nodes,
   edges }` and `mapping?: Record<string, string>` with the record rules (absent stays absent;
   malformed drops the FIELD, the run kept) in `parseRuns`; `shared/run-outcome.ts`:
   `blockOutcomes(run, definition)` → per node key the state word from the run's entries
   through the mapping (queued / working / finished / failed / wants-you). Checks
   `verify:layout run.def.1`, `verify:viewport run.outcome.1`.
2. Renderer: the workflow panel's Save (enabled while dirty; `stale` → the reason with
   Reload and Save a copy; a built-in's Save is Save a copy), Run over the DRAFT with the
   snapshot and mapping recorded by `useRuns.noteTemplate`'s successor, Stop (the pool's stop
   and every chat's interrupt for the selected run's panels), the Runs tab's run rows
   selectable and the diagram's blocks wearing the selected run's outcome tones.
3. Doors: `workflow.save` / `workflow.run` / `workflow.stop` rows; `workflow-save`,
   `workflow-run`, `workflow-stop` verbs; `V9_DOORS` rows; the M189 omission.
4. Product red first: `workflow.save.1` (dirty → Save writes revision + 1 and the panel
   reads clean; a bumped record → stale with the reason, Reload restores; Save a copy mints a
   new id), `workflow.runview.1` (Run from a dirty draft mints the draft's shape, the run's
   snapshot carries the revision and the mapping, and the blocks wear the outcome tones after
   the run; an edit after the run leaves the run's blocks unchanged). Scene `workflow-run`
   with its sentence before the golden.
5. Critic, verifier, ledger, `feat(m184)`; Act II build log; the three commands; merge.
