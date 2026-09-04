# M79 — Runs

**Status:** design, 2026-09-03. **Branch:** `m79-runs`. **Kind:** feature + surface.
**Briefs built against:** 1.x principles 3 (identity leads), 7 (three states), 9 (a row names
the fix); 2.0 principles 10 (three natures, one canvas), 12 (a record is a fact, in mono),
13 (the graph says what it does — and now what it did).
**Thesis sentence:** the graph ran; here is what happened, by name, with what it cost — and
here is how to run it again.

## What this milestone is for

M78 made the edges a plan the canvas executes. Nothing remembers an execution: the
automation list holds the last sentence per edge and nothing else, so "what ran last night,
in what order, and what did it cost" has no answer. M79 records one execution of a subgraph
as a **run**: a named, saved record — which panels, which edges, when each started and
ended, each outcome, its cost — kept in the layout beside groups and bookmarks with the
absent/malformed rules every record obeys. A run's panels wear a group frame with the run's
name; the Workspaces pane lists runs with their cost; the Work tab names the run a panel
belongs to; `Run again` restarts the roots in order through the existing restart path and
records a new run.

## Design

### The record (`shared/runs.ts`, `layout-schema.ts`; verify:layout)

- `PersistedRun`: `{ id, name, panelIds, edges: [{ from, to }], startedAt, endedAt?,
  entries: [{ panelId, startedAt, endedAt?, outcome? }], costUsd? }`. An outcome is a
  sentence in the vocabulary the automation list already speaks: `exit 0`, `exit 1`,
  `a turn`, `skipped — …`, `handed off …`. A run is per workspace, like a group. Absent on
  disk is every pre-M79 file; a malformed run is dropped by name; an entry naming a panel
  the workspace no longer has is dropped and the run kept; a run with no surviving panel is
  dropped. `RUNS_MAX` (50) newest kept.

### The pure model (`renderer/canvas/run-model.ts`; verify:viewport)

- `componentOf(panels, id)`: the connected subgraph over ENABLED handoff edges containing
  `id` — its panel ids in panel order and its edges. `rootsOf(panels, component)`: members
  with no incoming enabled edge, in panel order. `sinksOf` the mirror.
- The reducer: `beginRun(component, sourceId, at, name)` opens a run with an entry for the
  firing source; `recordRunEvent(run, event)` appends or updates an entry — a source fired
  (`started`/`ended` with its outcome), a target delivered (`started` for the target),
  a skipped edge (the target's outcome `skipped — …` when nothing else will reach it);
  `runIsComplete(run, component)`: every sink has an outcome, or every entry has ended and
  no edge is still owed. `finishRun(run, at, costUsd)` seals it. A run's cost is the sum of
  its panels' priced usage at the moment it is sealed (`costOf` over `byModel`), or absent
  when any panel's model is unpriced — the summary's own rule.
- `runName(existing)`: `run N`, a short honest default the frame's caps label can carry
  (amended after the critic: a concatenation of member titles cannot be a label). The members
  are the record's own.
- `sealAbandoned(runs, at)`: a run still open in a SAVED layout was abandoned by a relaunch —
  the recorder's component died with the renderer — and is sealed on load with the relaunch
  named on every open entry (amended after the verifier).
- `runIsComplete` has two arms: every sink has an outcome, OR every entry has ended and no
  edge is owed (a component with no sink; a target that timed out). A `skipped` closes a
  target's entry only when no other source can still reach it.
- `runCostSince(panelIds, usages, baseline)`: THIS run's cost — the panels' priced usage less
  what they had spent when it began (amended after the verifier: without the baseline a
  second run bills the first one's tokens again).

### The runtime (`useRuns.ts`, `useHandoff.ts`)

- `useHandoff` gains `onRunEvent(event)`: `fired` (source, trigger, outcome, at),
  `delivered` (target, sentence, at), `skipped` (source, target, sentence, at), `queued`.
  `useRuns` owns the `runs` state (from `initial.runs`, saved with the layout): a `fired`
  from a panel in no open run opens one for its component; every event lands on the open
  run whose component holds the panel; the run seals when complete. At most one open run
  per component; a `fired` on a sealed run's component opens a new run.
- `Run again`: the run's roots, in order, through `restartWithSpec` (a terminal root) — a
  chat root is skipped by name (`a chat is re-run by sending it a message`) — and a new run
  opens on the first fire as any run does.

### The surfaces

- **Workspaces pane**: a `Runs` section under the workspaces list — each run a row: the name
  on its own line, then ONE facts line (`3 panels · 2m 0s · $0.21`) and the outcome in the
  STATE VOCABULARY (`working` while open, `idle` when done, `exited N` when an entry failed —
  amended after the critic: a run mints no fourth set of words), and a `Run again` verb
  (disabled by name while the run is open, or when no root is a terminal). The pane's Work
  tab shows the same facts line verbatim, with the same verb.
- **The canvas**: a run's panels wear a group frame with the run's name as its caps label —
  a DERIVED frame (`run:<id>`), never a persisted group, read-only (no drag handle, no
  collapse), the newest run per component only, dropped when the run's panels are gone.
- **The Work tab**: its own `Run` section (the ledger's is now `Commands`, so an empty
  ledger's line never sits under a real answer — the critic's first finding): the run's name,
  the rail's facts line, and `Run again`; or `not part of a run`.

## What it must not break

- M78's join and conditions (the recorder observes; it never decides).
- `verify:groups` (a run frame is not a group; `pruneGroups` never sees it).
- Every pre-M79 layout loads with `runs: []` and no warning.

## The failure modes this guards against, each with its check

| Failure | Check |
|---|---|
| A malformed run dropping the workspace; a missing panel dropping the run; a pre-M79 file warning | `verify:layout run.1` |
| A component crossing a DISABLED edge; roots in the wrong order; a run sealed before its sink | `verify:viewport run.1` |
| A run's cost summed from an unpriced model as a number | `verify:viewport run.2` |
| The Runs rows' words drifting from the record (running/done/failed, the cost dash) | `verify:rail run.1` |
| A two-panel handoff not becoming a run with two entries, a cost and a frame; `Run again` not restarting the root and recording a second run | `verify:panels run.1` |

## Manual-only, added

- A real agent's usage priced into a run's cost (the harness's usage is seeded).
