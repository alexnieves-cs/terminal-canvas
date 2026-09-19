# M285–M287 — Orchestrate Phase B (evidence workbench)

The state of this run lives here, not in any session's memory. Spec:
[docs/orchestrate-reference-plan.md](../orchestrate-reference-plan.md) (Phase B row of
"Ordered delivery plan"); run prompt:
[2026-09-19-orchestrate-phase-b-run-prompt.md](../superpowers/specs/2026-09-19-orchestrate-phase-b-run-prompt.md).
Phase A's ledger is [m283-m284-orchestrate-phase-a.md](m283-m284-orchestrate-phase-a.md).

- Branch `m285-orchestrate-phase-b`, worktree `../tc-orch-phase-b`, off main `ceb6851e`.
- Numbering: `M285`/`M286`/`M287` were free on 2026-09-19 — no hit in `docs/build-log`, none in
  `git log --all`; `docs/design/orchestrate-preview.html` says "M285" as sample text only.
- **The user's uncommitted `Canvas.tsx` / `shell/useShellChrome.ts` edits on main are NOT on
  this branch**, by the run prompt's rule: the worktree is off committed main. Phase B DOES
  change `Canvas.tsx` (the Orchestrate mount gains props, the workspace save gains a field), so
  the merge into main will meet the user's edits in that file — expected, and theirs to resolve.
- The spec, the run prompt and `docs/design/` are UNTRACKED in main's tree (the user's), so they
  are not on this branch; the links above resolve in main's checkout.

## Goal

Orchestrate gains an evidence workbench: a review is bound to the CONTENT it reviewed, a check
is bound to the revision it tested, and a resizable Changes · Checks · Output workbench shows
both beside the task's brief — with every unavailable fact said rather than left blank.

## Exit criterion (stop here)

From the plan: *a same-size edit invalidates the prior review; a changed revision makes check
evidence stale; unavailable data is explicit.* Shown by driving the real app, with what was seen
recorded below; then `npm run verify`, every red reported, and a fresh-context critic on each
changed scene and on M285's snapshot policy. No goldens written, no merge, no push.

## M285 — Review content identity

- [ ] `ReviewIdentity` — base revision + content hash — defined in `shared/review-identity.ts`
      with the snapshot policy in its header (and below).
- [ ] Computed in MAIN (`review-engine.ts`); every `clean`/`changes`/`shared` answer carries it.
      The renderer stores and compares, never recomputes.
- [ ] Persisted `reviewed` gains `identity`, compatibly: old records parse, and one without an
      identity reads as freshness `unknown`, never `current`.
- [ ] Commit and discard re-read the subject's identity immediately before writing and refuse by
      name (`subject-moved`) when it moved.
- Checks: `verify:review review-id.1–.4`, `verify:layout work.review-id.1`.

### Snapshot policy (what the identity covers)

`ReviewIdentity = { base, content }`. `base` is the commit the review compares against (a
session's baseline sha, or a lane's fork point). `content` is the first 32 hex characters of a
SHA-256 over, in order:

1. `git diff --binary --full-index --no-ext-diff --no-color <base>` run in the subject tree —
   every tracked file's uncommitted change against `base`, INCLUDING binary files (as binary
   patches), mode changes, renames and deletions. The index is not consulted separately: the
   working tree is what a reviewer sees, so it is what is hashed.
2. For each untracked, non-ignored file (`git ls-files --others --exclude-standard`, the same
   list the review's file rows come from), its path and its `git hash-object` blob id, one per
   line, in git's order.

Ignored files (`.gitignore`, build output) are excluded on purpose: they are not in the review
either. Submodule pointer changes appear in the diff as gitlink lines and are covered as bytes.
If either git call fails, the identity is ABSENT and every reader says freshness is unknown —
never "fresh". A clean tree's identity is `{ base, hash('') }` with no extra git call.

## M286 — Revision-bound check evidence

- [ ] One evidence record per check (`shared/check-evidence.ts`): command, execution context,
      outcome (`passed | failed | running | not-run | unknown | stale`), timestamp, tested identity.
- [ ] Sourced from the run ledger and watcher outcomes; the ledger row now records the identity
      the subject had when the command ended. Agent prose is never parsed; a transcript claim is a
      `CheckClaim`, shown as a claim, never a result.
- [ ] `stale` when the subject's identity has moved past the one tested.
- [ ] Generic commands: exit outcome plus raw output; no structured adapters (Phase F).
- Checks: `verify:review check-fresh.1–.4`.

## M287 — Workbench and brief

- [ ] Resizable bottom workbench on Orchestrate: Changes · Checks · Output (no Artifacts/Timeline
      stubs). Bound to the selection; pinned, it names what it is pinned to. Height and tab saved
      PER WORKSPACE, which also persists Phase A's in-memory prefs.
- [ ] Changes: changed-file tree + readable diff at usable width + M285 freshness.
- [ ] Checks: M286 records; a failed check opens its command, context and output.
- [ ] Brief and acceptance criteria on a task: persisted compatibly, editable in the inspector,
      shown beside Changes. Editing launches nothing.
- [ ] Unavailable data explicit: non-Git folder, no baseline, no checks run, ledger unreadable.
- Checks: `verify:orchestration workbench.1–.N`, `verify:layout work.brief.1`,
  `verify:panels:agents orch-bench.1–.N`.

## Exit demo (what was seen driving the real app)

_(recorded at close)_

## Gate

_(recorded at close)_

## Found / deferred

Out of scope for Phase B by the run prompt, logged here if the run is tempted: the Start task
dialog, multiple islands, dependency lens, run limits, Artifacts/Timeline tabs, PR/CI adapters,
hunk application, 3D platform work.
