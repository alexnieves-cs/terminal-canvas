# M288–M290 — Orchestrate Phase C (parallel work)

The state of this run lives here, not in any session's memory. Spec:
[docs/orchestrate-reference-plan.md](../orchestrate-reference-plan.md) (Phase C row of
"Ordered delivery plan"); run prompt:
[2026-09-19-orchestrate-phase-c-run-prompt.md](../superpowers/specs/2026-09-19-orchestrate-phase-c-run-prompt.md).
Phase A's ledger is [m283-m284-orchestrate-phase-a.md](m283-m284-orchestrate-phase-a.md), Phase B's
[m285-m287-orchestrate-phase-b.md](m285-m287-orchestrate-phase-b.md).

- Branch `m288-orchestrate-phase-c`, worktree `../tc-orch-phase-c`, off main `69885a72` (Phase B's merge).
- Numbering: `M288`/`M289`/`M290` were free on 2026-09-19 — no hit in `docs/build-log`, none in
  `git log --all`, no branch or worktree carrying the number.
- **The user's uncommitted `Canvas.tsx` / `shell/useShellChrome.ts` edits on main are NOT on
  this branch**, by the run prompt's rule: the worktree is off committed main. This phase changes
  `Canvas.tsx` again (props to the Orchestrate mount), so the merge meets those edits — theirs to resolve.
- The spec, the run prompt and `docs/design/` are UNTRACKED in main's tree (the user's), so they
  are not on this branch; the links above resolve in main's checkout.
- Serial, one writer. Subagents read-only, plus the critic.

## Goal

Orchestrate shows parallel work honestly: one island per task or execution context, grouped by
the repository and worktree real paths and remotes derive; each island with its own review
subject that no other island's diff can be shown under; shared directories said, not guessed;
the typed handoff relations rendered as a read-only dependency lens with named blockers; and
controls and run limits that appear only where the runtime supports them and say what they cover.

## Exit criterion (stop here)

From the plan: *two isolated write tasks and a dependent check can be followed without mixing
diffs; shared-directory ambiguity is visible.* Shown by driving the real app with a real second
worktree, with what was seen recorded below — including the rapid-selection and out-of-order
cases; then `npm run verify` with every red reported, a fresh-context critic on each changed
scene and on M288's subject binding. No goldens written, no merge, no push.

## M288 — Many islands, honest review subjects

- [ ] Islands grouped by repository and worktree from real paths (worktree records' root and
      path, a member's cwd), never a project record. A task may span contexts; a shared directory
      is said as such, with the count of sessions writing it.
- [ ] Every island carries an honest count and an execution context label (branch · own
      worktree, or shared directory · N sessions write here).
- [ ] Each island has its own review subject; every workbench read is bound to the selection
      identity it was requested for, out-of-order and late answers dropped by name.
- [ ] Shared-directory ambiguity shown, not guessed.
- [ ] Placement stable: a new island appends, existing ones keep their place; the order is
      persisted per workspace.
- Checks: `verify:orchestration orch-islands.*`; `verify:panels:orchestrate orch-islands.app.*`.

## M289 — Typed dependency lens

- [ ] Typed handoff relations drawn as directed connections with a readable trigger; membership
      spokes quieter.
- [ ] Dependency focus dims unrelated work; prerequisites, dependents, blockers and the exact
      handoff condition listed; a blocked downstream task names its reason.
- [ ] Read-only, said in the UI; a visual move changes presentation only, never dispatches, and
      is undoable.
- [ ] No synthetic centre implying a supervisor; grouping labelled as grouping.
- Checks: `verify:orchestration orch-dep.*`; `verify:panels:orchestrate orch-dep.app.*`.

## M290 — Capability-aware controls and run limits

- [ ] Interrupt / retry / reassign / stop only where supported, each saying what it affects, in
      the plan's words.
- [ ] Concurrency, spend and time limits each labelled enforced or advisory with coverage;
      unknown spend reads Unknown; no universal cap implied.
- [ ] Prompt routing names its target; the composer sends nothing to a hidden terminal.
- [ ] Commit and discard brought into the workbench through the same executors with the M285
      `expect` re-check — or the reason recorded here.
- Checks: `verify:orchestration orch-limits.*`; `verify:panels:orchestrate orch-limits.app.*`.

## Also do

- [ ] The Orchestrate Electron checks (Phase A's `orch-task.*`, Phase B's `orch-bench.*`) move
      into their own part, `verify:panels:orchestrate`, with a `// measured` watchdog; the
      `agents` part's watchdog re-measured after the move.

## Exit demo (what was seen driving the real app)

_(to be written)_

## Gate

_(to be written)_

## Found / deferred

Out of scope for Phase C by the run prompt, logged here if the run is tempted: dependency
editing, the Start task dialog and presets, layered 3D platforms, minimap, semantic zoom,
list/keyboard parity beyond what exists, Artifacts and Timeline tabs, PR/CI/deploy adapters.

Inherited from Phase A/B's deferred lists and still open here: Orchestrate text fields cannot take
a menu paste; prefs other than the persisted record are in memory; the palette over Orchestrate
returns to Canvas; Checks reads watchers off the canvas's panels only; the ledger keeps no output
bytes; the identity's uncovered inputs are named on the type; the harness composes its own engines.
