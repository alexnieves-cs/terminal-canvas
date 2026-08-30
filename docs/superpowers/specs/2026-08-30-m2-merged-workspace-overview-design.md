# Backlog #2 — merged workspace overview decision

Backlog [#2](../../ideas-backlog.md). This document evaluates the remaining
M7 all-in-one view after M11 landed; it is a decision record, not a feature
specification.

## Decision

**Do not build a merged workspace view.** #2 remains open only for
rubber-band-select → *Move to new workspace*, which is blocked on #52
(multi-select). The deferred workspace-switching shortcut landed in M11 as the
Cmd+G held navigation grid.

## The two possible meanings, and why neither earns a feature

### Read-only overview

A read-only view could lay every workspace's panels out as cards, accept a
target, and exit into that workspace. It must not attach terminals: hidden
workspaces are demoted, not disposed, and a read-only overview cannot add a
third authority that promotes sessions. `assignTiers` remains the first
enforcement of `LIVE_BUDGET = 8`; `Canvas.tsx` remains the second re-check when
it applies the tier map for held-back demotions. No overview may promote,
dispose, or reach `registry.dispose`; `pty.kill` must keep its two callers in
`session-registry.ts`.

That is resource-safe, but it is a second navigation grid. M11 already gives a
stable, workspace-named overview, an explicit target, and release-to-jump. A
panel-card collage supplies no action the grid lacks, while losing the grid's
stable spatial memory whenever a workspace changes. It does not justify a new
surface.

### Live canvas

A live canvas would let users work across workspace boundaries. It is rejected
because it changes the feature from navigation into a new ownership model. A
single viewport would need a rule for N independently saved cameras:

- retain each saved camera and choose an arbitrary one on exit;
- synthesize a bounding camera, which is not a saved workspace camera; or
- translate every workspace into a new shared coordinate space.

Each choice makes the overview's camera either arbitrary or stateful in a way
M7 deliberately avoided by treating a switch as a second boot. More
importantly, the normal Canvas tier map only describes one workspace's visible
panels. Extending it across all workspaces while preserving the global budget
would require a deliberately new cross-workspace visibility and focus policy;
letting a merged layer promote independently would violate the two existing
budget guards. Globally unique panel ids make React keys safe, but they do not
solve camera ownership, focus, undo history, workspace persistence, or the
global live-session competition.

This is therefore a different feature, not the all-in-one overview #2 named.
It should be reconsidered only with an explicit cross-workspace editing model,
not smuggled in as navigation.

## Consequences

- No renderer, registry, layout, or IPC code changes are warranted.
- No test-first implementation tasks exist: the feature module is deliberately
  not created, so there are no checks to write and watch red. The existing
  `verify:panels` source-text check continues to protect the two `pty.kill`
  callers and `LIVE_BUDGET`'s two enforcement sites.
- This document cannot prove that a future cross-workspace editor is safe; it
  records the design boundary a future spec must re-evaluate.

