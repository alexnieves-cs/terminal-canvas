# Orchestrate Phase B — run prompt

Paste everything below the line into a fresh session (with `/goal` if you want it to run
unattended up to the stop point). It executes **Phase B only** of
[docs/orchestrate-reference-plan.md](../../orchestrate-reference-plan.md). Phase A (M283–M284)
is merged to local main at `ceb6851e`.

---

You are executing **Phase B — Evidence workbench** of `docs/orchestrate-reference-plan.md`.
Read the plan whole, then the Phase A ledger `docs/build-log/m283-m284-orchestrate-phase-a.md`
(what exists now, the traps it measured, its deferred list), then `CLAUDE.md`. Run
`npm run lb -- review`, `npm run lb -- work-items` and `npm run lb -- orchestration` before
touching those modules.

**Phase B is mostly runtime and data work, not a restyle** (plan line 175). Build it in this
order, because the UI depends on the identity underneath it.

## Numbering and state

- Milestones **M285** (content identity), **M286** (revision-bound checks), **M287**
  (workbench and brief). `docs/design/orchestrate-preview.html` contains "M285" only as sample
  text, which doesn't count. Grep `docs/build-log` and `git log` for real collisions and take
  the next free triple if needed.
- Ledger: **`docs/build-log/m285-m287-orchestrate-phase-b.md`**. Create it first with the goal,
  the exit criterion, a checklist per milestone and a "Found / deferred" section. Link it from
  CLAUDE.md's build-log row, after the M283–M284 entry, in the same commit.

## Execution method

- **Serial, one worktree** (`m285-orchestrate-phase-b` off current `main`). M286 and M287
  build on M285's types. Use subagents only for read-only exploration and the critic.
- **The user's uncommitted `Canvas.tsx` / `shell/useShellChrome.ts` edits on main are theirs.**
  Branching off committed main leaves them behind, which is correct. If Phase B has to change
  those files, record that in the ledger so the merge is expected.
- Scoped check ids (`review-id.1`, `check-fresh.1`, `workbench.1`). Commits `feat(m285): …`.
- `npm run affected` between steps. Take `/tmp/tc-electron-lock` and `pgrep` for stray
  Electron before any Electron-tier suite.
- Phase A's measured traps still apply: bind focus listeners on `document`; a hidden harness
  window needs `wc.focus()`; Radix focus scopes restore focus after layout effects; a new
  `WATCHDOG_MS` comment starts `// measured`; `verify:visual` can time out cold after a build,
  so rerun it warm before calling it red.

## M285 — Review content identity

The current `reviewed.signature` (`shared/work-items.ts`, bounds documented in
`shared/review-readiness.ts`) fingerprints the diff's **shape**, so a same-size edit keeps a
stale review looking fresh.

1. Define a content identity for a review subject: the base revision plus a hash of the actual
   diff bytes, covering uncommitted changes, binary files (by content hash) and untracked
   inputs under a **written snapshot policy**. The policy goes in the ledger and in a comment
   at the definition.
2. Compute it in main (`main/review-engine.ts`). The renderer receives it and never recomputes it.
3. **Keep the persisted format compatible.** Old `reviewed` records still parse (the parser
   tells an absent key apart from a malformed one). A record without the new identity reads as
   "freshness unknown", never as "fresh".
4. Re-check the subject's identity immediately before any review mutation (commit/discard) and
   refuse by name if it changed.

Checks: a same-size edit invalidates a prior acknowledgement; an old-format record is unknown,
not fresh; the mutation refuses on a moved subject.

## M286 — Revision-bound check evidence

1. One evidence record per check: command, execution context (cwd/worktree), outcome
   (`passed | failed | running | not-run | unknown | stale`), timestamp, and the M285 identity
   it tested. Source it from the existing command ledger and watcher outcomes. Do **not** parse
   agent prose. An agent-authored claim is labelled as a claim and is never a result.
2. The evidence becomes `stale` when the subject's identity moves past the one it tested.
3. Generic commands show their exit outcome plus raw logs. No structured adapters yet (Phase F).

Checks: a changed revision makes passing evidence stale; exit 0 does not produce "all tests
passed" wording; a missing source reads Unknown.

## M287 — Workbench and brief

1. A resizable bottom workbench on Orchestrate with **Changes · Checks · Output** tabs (Artifacts
   and Timeline come later; don't stub them as empty tabs). It is bound to the selection, and
   when pinned it names what it's pinned to. Save its size and tab per workspace, which also
   fixes Phase A's in-memory-only prefs.
2. **Changes**: a changed-file tree plus a readable diff at usable width, with the M285
   freshness shown. Commit/discard stay on the canvas review node unless they come across
   through the same executor with the M285 re-check.
3. **Checks**: M286 records. A failed check opens its command, context and output.
4. **Brief and acceptance criteria** on a task: persisted fields added to the work-item schema
   in a compatible way, editable in the inspector, and shown beside Changes. Editing a brief
   launches nothing.
5. Unavailable data is shown explicitly (non-Git folder, no review baseline, no checks run).

Out of scope (log it as deferred if you're tempted): the Start task dialog, multiple islands,
dependency lens, run limits, Artifacts/Timeline tabs, PR/CI adapters, hunk application, 3D
platform work.

## Exit criterion (stop here)

From the plan: *a same-size edit invalidates the prior review; a changed revision makes check
evidence stale; unavailable data is explicit.* Demonstrate each in the real app (`npm run shot`
or the run skill) and record what you saw in the ledger.

Before you stop:
1. `npm run verify`. Report every red. The 9 known pre-existing reds from the Phase A ledger
   go in a separate list. If there is any new red, reproduce it on `main` before calling it
   pre-existing.
2. `npm run shot`, then a **fresh-context critic** on each changed scene, with the critic's
   sentence per scene in the ledger. Also have the critic review M285's snapshot policy, since
   it is a boundary. **Don't write goldens.** List the accepted captures for the user to copy.
3. Don't merge and don't push. Report what landed, the commits, the verify result, the critic
   notes, the deferred list and any departure from the plan.
