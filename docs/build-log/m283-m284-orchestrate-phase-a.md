# M283–M284 — Orchestrate Phase A (useful vertical slice)

The state of this run lives here, not in any session's memory. Spec:
[docs/orchestrate-reference-plan.md](../orchestrate-reference-plan.md) (Phase A row of
"Ordered delivery plan"); run prompt:
[2026-09-18-orchestrate-phase-a-run-prompt.md](../superpowers/specs/2026-09-18-orchestrate-phase-a-run-prompt.md).

- Branch `m283-orchestrate-phase-a`, worktree `../tc-orch-phase-a`, off main `f37b2b91`.
- Numbering: `M283`/`M284` were free (no hit in `docs/` outside the run prompt, none in
  `git log --all`) on 2026-09-18.
- **The user's uncommitted `Canvas.tsx` / `shell/useShellChrome.ts` edits on main (the splash's
  `suppressOrchestrationOnBoot`) are NOT on this branch**, by the user's choice (asked
  2026-09-18): the worktree is off committed main, those edits stay untouched in main's tree.
  Merging this branch into main needs them committed or set aside first — that is the user's
  call, not this run's.
- The spec, the run prompt and `docs/design/` are UNTRACKED in main's tree (the user's), so they
  are not on this branch; the links above resolve in main's checkout. This run does not commit them.

## Goal

Orchestrate is a separate page reached by an explicit Canvas / Orchestrate choice. The Canvas
stays mounted and unchanged behind it, and one real task can be delegated or opened, inspected
live, have its pending permission request answered, have its changes reviewed, and be jumped
back to on the Canvas.

## Exit criterion (stop here)

From the plan: *delegate or open one task, inspect live work, answer a real pending request,
review changes and return to an unchanged Canvas.* Shown by driving the real app, with what
was seen recorded below; then `npm run verify`, every red reported.

## M283 — Canvas / Orchestrate page boundary

- [ ] Explicit Canvas / Orchestrate navigation choice (reuses `centerView`).
- [ ] Canvas host mounted while covered, controls out of keyboard focus (`inert`).
- [ ] Hidden Canvas captures no typing; `Cmd+V/C/Z` (menu IPC, not keydown) reach no hidden terminal.
- [ ] Returning restores layout, viewport, drafts, sessions, pane prefs; no xterm refit — cols/rows measured.
- [ ] Orchestrate camera/layout prefs independent of Canvas's (and survive the toggle).
- [ ] Checks: round trip keeps pan/zoom, unsaved file draft, terminal dims; typing on Orchestrate reaches no PTY.

## M284 — One real task island

- [ ] Task island from a real work item / session: goal, repository, worktree/branch labels.
- [ ] Selection syncs scene and an inspector: identity, state, next action.
- [ ] Needs attention row for a pending permission, answered through the existing identity;
      answered elsewhere → gone here, cannot be answered twice.
- [ ] Output: read-only mirror of the selected session (no PTY resize, no second watch).
- [ ] Review: existing review/diff for the selected subject, through the existing executors.
- [ ] Open on canvas: separate labelled action, switches page and focuses the existing object.
- [ ] List view equivalent to the scene, keyboard reachable.

## Exit demo (what was seen driving the real app)

_(pending)_

## Gate

_(pending — `npm run verify`, every red listed and attributed)_

## Found / deferred

Out of scope for Phase A by the run prompt, logged here if the run is tempted: resizable
workbench tabs, Checks, brief editing, review-identity hardening, multiple islands,
dependency lens, Start task dialog, minimap, semantic zoom.
