# M209–M210 — D11 retained outcomes and return to work

## Decision

Historical work is a workspace record, not a surviving canvas object. The existing run parser
continues to remove dangling live panel references; D11 adds a separate, bounded retained-outcome
record at the moment a task lane is closed. It contains the task's immutable display identity,
the observed execution result, the latest run reference when one exists, and an explicit next
action derived from the work-item state. It never contains a transcript, process handle, or an
instruction to execute.

## M209 — retain outcome meaning

- `retainedOutcomes` is optional on disk: absent old files warn nothing; malformed entries drop
  independently; unknown outcome words are retained as `unknown`, not guessed as success.
- A record is captured when a dispatched task's lane conversation is closed. It records the
  work item id/title, close time, the run id/result if a recorded run names that lane, and a
  reference whose availability is computed at read time. The panel id is provenance only, never
  a render dependency.
- At most 200 newest outcomes are retained. Explicit history cleanup is a dedicated canvas
  action that removes a task's retained outcomes; workspace deletion and canvas reset remove the
  workspace's history with the workspace, while ordinary panel cleanup does not.
- Existing `runs` keep their current pruning semantics. A missing log/panel is represented as an
  unavailable reference in the retained record rather than opening or spawning anything.

## M210 — return deliberately

- A work card shows the retained outcome in detail and at far scale, including whether the former
  conversation is unavailable. The next action is derived from recorded task state, not a model
  summary.
- `Resume` remains a camera/focus move while the lane exists. Once closed, the retained card
  exposes **Start work again…** through the existing dispatch path; it is explicit, carries the
  existing teammate/place refusals, and never sends text or restores a process automatically.
- History cleanup is explicit and named. It removes retained records only, not the work item,
  run ledger, lane, repository, or worktree.

## Boundaries

No transcript copying, no new background session, no new main-to-renderer history API, no altered
PTY ownership, and no model-generated summary. Existing layout save/load is the durable store;
the record is carried through its snapshot/restore paths like work items and runs.

## Acceptance

After closing all task panels and restarting, the work card still says what task ran, what the
recorded execution result was, what source is no longer available, and the next explicit action.
Removing history is deliberate; merely tidying views cannot remove it.
