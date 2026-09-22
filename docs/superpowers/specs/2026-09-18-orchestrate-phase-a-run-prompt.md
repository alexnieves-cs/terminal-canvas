# Orchestrate Phase A — run prompt

Paste everything below the line into a fresh session (with `/goal` if you want it to run
unattended up to the stop point). It executes **Phase A only** of
[docs/orchestrate-reference-plan.md](../../orchestrate-reference-plan.md).

---

You are executing **Phase A — Useful vertical slice** of `docs/orchestrate-reference-plan.md`.
Read that plan whole first; it is the product spec and it outranks your preferences. Then read
`CLAUDE.md` and run `npm run lb -- orchestration` and `npm run lb -- Canvas` before touching
either.

## Numbering and state

- Milestones: **M283** (page boundary) and **M284** (real task island + actions). Before
  starting, grep `docs/` and `git log` for `M283`/`M284`; if either is taken by another
  session, use the next free pair and say so in the ledger.
- The state lives in **`docs/build-log/m283-m284-orchestrate-phase-a.md`**, not in your memory.
  Create it first with: goal, the exit criterion below, a checklist per milestone, and a
  "Found / deferred" section. Update it at every commit.
- Link that ledger from the build-log row in `CLAUDE.md` in the same commit that creates it
  (`verify:meta ledger.1` goes red otherwise).

## Execution method

- **Serial, one worktree, no parallel implementer agents.** Phase A is a vertical slice
  through shared files (`Canvas.tsx`, `shell/useShellChrome.ts`, `orchestration/`); parallel
  writers would collide. Subagents are allowed for read-only exploration and for the
  fresh-context critic.
- Create the worktree/branch `m283-orchestrate-phase-a` off current `main`.
- **The uncommitted edits to `Canvas.tsx` and `shell/useShellChrome.ts` on main predate this
  plan and belong to the user.** Do not commit, revert or stash them. If Phase A needs to
  change those files, stop and ask how to handle the overlap before editing.
- Commits: `feat(m283): …`, `fix(m284): …`; comments explain *why*; new verify checks take
  scoped ids (`orch-page.1`), never the next integer.
- Between steps run `npm run affected`. Take `/tmp/tc-electron-lock` and `pgrep` for stray
  Electron before any Electron-tier suite.

## M283 — Canvas / Orchestrate page boundary

Reuse `centerView: 'canvas' | 'orchestration'`. Deliver:
1. An explicit Canvas / Orchestrate navigation choice.
2. Canvas host stays **mounted** while covered, its controls out of keyboard focus (`inert`
   or equivalent). Hidden Canvas must not capture typing, and `Cmd+V/C/Z` must not reach a
   hidden terminal.
3. Returning restores layout, viewport, drafts, sessions, pane prefs. **No xterm refit /
   SIGWINCH on toggle** — measure terminal cols/rows before and after.
4. Orchestrate camera/layout prefs independent of Canvas's.

Checks (add to the relevant suite): Canvas → Orchestrate → Canvas keeps pan/zoom, an unsaved
file draft and terminal dimensions; typing while Orchestrate is shown reaches no PTY.

## M284 — One real task island

On the existing graph projection (`orchestration/OrchestrationView.tsx` and its model):
1. One task island built from a **real** work item / session, not sample data. Label goal,
   repository, worktree/branch.
2. Selection syncs the scene and an inspector: identity, state, next action.
3. A pending permission request appears in a **Needs attention** row and is answered through
   the existing identity (`main/approvals.ts`, `agentSession.answer`). Answered elsewhere →
   gone here, cannot be answered twice.
4. Output: a read-only mirror of the selected session's output. No PTY resize, no second
   file watch.
5. Review: the existing review/diff for the selected subject, through the existing executors.
6. **Open on canvas**: a separate labelled action that switches page and focuses the existing
   object.
7. List view equivalent to the scene, reachable by keyboard.

Out of scope for Phase A (log in the ledger's deferred section if you're tempted): resizable
workbench tabs, Checks, brief editing, review-identity hardening, multiple islands,
dependency lens, Start task dialog, minimap, semantic zoom.

## Exit criterion (stop here)

From the plan: *delegate or open one task, inspect live work, answer a real pending request,
review changes and return to an unchanged Canvas.* Show it by driving the real app (`npm run
shot` or the run skill) and recording what you saw in the ledger.

Before you stop:
1. `npm run verify`. Report every red. Reproduce reds that were already there (the M282 set,
   `agents attention.1`, etc.) on `main` and list them separately. Never rebaseline to hide
   them.
2. `npm run shot`, then have a **fresh-context critic** review each changed scene. Write the
   critic's sentence per scene in the ledger. **Do not run `UPDATE_GOLDENS=1`**. Leave that
   for the user.
3. Do **not** merge to main and do not push. Stop and report: what landed, commits, the
   verify result, the critic notes, the deferred list, and anything that went against the plan.
