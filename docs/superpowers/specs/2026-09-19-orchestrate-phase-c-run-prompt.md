# Orchestrate Phase C — run prompt

Paste everything below the line into a fresh session. With `/goal`, point the goal at this file
and keep only the stop condition inline (the condition has a 4,000-character limit). It executes
**Phase C only** of [docs/orchestrate-reference-plan.md](../../orchestrate-reference-plan.md).
Phase A (M283–M284) and Phase B (M285–M287) are merged to local main; B's merge is `69885a72`.

---

You are executing **Phase C — Parallel work** of `docs/orchestrate-reference-plan.md`.
Read the plan whole, then both prior ledgers —
`docs/build-log/m283-m284-orchestrate-phase-a.md` and
`docs/build-log/m285-m287-orchestrate-phase-b.md`, including their **Found / deferred**
sections, which name several things this phase inherits. Then `CLAUDE.md`. Run
`npm run lb -- worktree`, `npm run lb -- handoff` and `npm run lb -- agent-session` before
touching those modules.

## Numbering and state

- Milestones **M288** (many islands, honest subjects), **M289** (typed dependency lens),
  **M290** (capability-aware controls and run limits). Grep `docs/build-log` and `git log` for
  collisions and take the next free triple if any exist.
- Ledger: **`docs/build-log/m288-m290-orchestrate-phase-c.md`**. Create it first with the goal,
  the exit criterion, a checklist per milestone and a "Found / deferred" section. Link it from
  CLAUDE.md's build-log row after the Phase B entry, in the same commit.

## Execution method

- **Serial, one worktree** (`m288-orchestrate-phase-c` off current `main`). M289's lens draws
  on M288's island model, and M290's controls act on both. Subagents stay read-only, plus the
  critic.
- If you do want a second writer, the only clean seam is **M290's runtime half** (capability
  reporting and limits in `main/agent-session.ts` and the usage store) against **M288/M289's
  renderer half**. Split only if you first write the shared type in one commit on the base
  branch and name the owned file list per track in the ledger. Otherwise stay serial.
- The user's uncommitted `Canvas.tsx` / `shell/useShellChrome.ts` edits on main are theirs;
  branching off committed main correctly leaves them behind.
- Scoped check ids (`orch-islands.1`, `orch-dep.1`, `orch-limits.1`). Commits `feat(m288): …`.
- `npm run affected` between steps. `pgrep` for stray Electron and take
  `/tmp/tc-electron-lock` before any Electron-tier suite; it may be a stale empty file, and
  nothing reads its contents.
- Carried traps: bind focus listeners on `document`; a hidden harness window needs
  `wc.focus()`; a hidden window's `capturePage` can lag the DOM by a step, so where a capture
  and a check disagree the check's DOM read is the fact; a new `WATCHDOG_MS` comment starts
  `// measured`; rerun a cold `verify:visual` warm before calling it red; write goldens by
  copying accepted captures one at a time, never `UPDATE_GOLDENS=1`.
- **`panels-harness.cjs` composes its own engines.** Every optional dependency you add to
  `stores.ts` must be mirrored there or the Electron tier silently proves a different app.

## M288 — Many islands, honest review subjects

1. Group by repository and worktree derived from **real paths and remotes**. No new
   first-class project record. A task may span execution contexts; shared working directories
   are visible as such.
2. Every island carries an honest count and an execution context label (branch, own worktree
   or shared directory).
3. **Each island has its own review subject.** Two isolated write tasks must never show each
   other's diff, and selection changing fast or events arriving out of order must not put one
   task's diff under another task's controls. Bind every workbench read to the selection
   identity it was requested for and drop late answers whose identity no longer matches.
4. **Shared-directory ambiguity is shown, not guessed.** When more than one session writes the
   same directory, say so instead of attributing every change to the selected agent.
5. Placement is stable: a new island must not re-arrange the existing ones, and a returning
   user should recognise where work is.

Checks: concurrent tasks in separate worktrees have distinct subjects; a rapid selection
switch cannot mismatch diff and controls; a shared directory is labelled ambiguous.

## M289 — Typed dependency lens

1. Render the existing typed relations (`shared/handoff.ts` and the canvas handoff/run
   modules) as directed connections with a readable trigger. Ordinary membership stays
   visually quieter than a real dependency.
2. A dependency focus dims unrelated work and shows prerequisites, dependents, blockers and
   the exact handoff condition. A blocked downstream task names its reason.
3. **The lens is read-only in this phase.** Dependency *editing* is deferred; say so in the UI
   rather than half-building it. Moving anything visually changes presentation only and
   **never dispatches a command**.
4. No synthetic centre that implies a supervisor exists. Workspace grouping, where shown, is
   labelled as grouping.

Checks: a dependency failure blocks downstream with a named reason; a visual layout change
dispatches nothing and is undoable.

## M290 — Capability-aware controls and run limits

1. Interrupt, retry, reassign and stop appear **only where the runtime actually supports
   them**, and each says exactly what it affects. Keep the plan's wording honest: Interrupt
   stops the current generation and promises no rollback, no process termination and no
   resumable checkpoint. Retry previews a new execution from known context and never assumes a
   failed command is safe to repeat.
2. Show concurrency, spend and time limits, each labelled **enforced** or **advisory**, with
   its coverage. Start from the existing global limits and the usage store. Unknown spend
   reads Unknown. Do not imply a universal cap across providers that don't report one.
3. Prompt routing always names its target; the composer must not send keystrokes to a hidden
   terminal.
4. Small bounded carry-over from Phase B, do it here: bring **commit and discard** across into
   the workbench through the same executor with the M285 `expect` re-check, or record in the
   ledger why you didn't.

Checks: an unsupported control is absent rather than failing; a limit says which kind it is;
a stopped session, an interrupted run and unknown spend stay distinguishable.

## Also do

Phase B's ledger names a headroom move that this phase's new checks will push over: the
Orchestrate checks share one 168 s watchdog and are now the slowest Electron part after
`product`. **Split the Orchestrate checks into their own part** before adding M288–M290's
checks to it, and re-pin the watchdog with a `// measured` comment.

Out of scope (log as deferred if tempted): dependency editing, the Start task dialog and
presets, layered 3D platforms, minimap, semantic zoom, list/keyboard parity beyond what exists,
Artifacts and Timeline tabs, PR/CI/deploy adapters.

## Exit criterion (stop here)

From the plan: *two isolated write tasks and a dependent check can be followed without mixing
diffs; shared-directory ambiguity is visible.* Demonstrate it in the real app, with a real
second worktree, and record what you saw in the ledger — including the rapid-selection and
out-of-order cases.

Before you stop:
1. `npm run verify`. List new reds separately from the known pre-existing set named in the
   Phase A and B ledgers; reproduce anything new on `main` before calling it pre-existing.
2. `npm run shot`, then a **fresh-context critic** on each changed scene, with a sentence per
   scene in the ledger. Have the critic also review M288's subject binding, since a mismatched
   diff under the wrong controls is exactly the failure that's hard to self-review.
3. **Don't write goldens, don't merge, don't push.** List the accepted captures for the user
   to copy. Report what landed, the commits, the verify result, the critic notes, the deferred
   list and any departure from the plan.
