# M86 — Git, deeply

**Branch:** `m86-git`. **Spec:** `docs/superpowers/specs/2026-09-04-m86-git-design.md`.
**Plan:** `docs/superpowers/plans/2026-09-04-m86-git.md`. **Status:** finished 2026-09-04.

**Thesis sentence:** what this canvas knows about a repository's branches — where each
worktree stands against the remote, and what every agent's worktree changed — read from git
alone, with no network ever touched.

## What landed

- `git-args.ts`: `buildBranchArgs`, `buildUpstreamArgs`, `buildAheadBehindArgs` and
  `parseAheadBehind` (TAB-separated, exactly two integers), `buildWorktreeListArgs` and
  `parseWorktreeList` (a detached tree is `branch: null`), `buildMergeBaseArgs`. NO FETCH,
  asserted as text. `verify:review git.1`.
- `review-engine.ts`: `status(root)` — three states in one answer — and `reviewAcross(root)`:
  the main tree first, one section per worktree record (the new optional `worktreesOf` dep),
  each worktree's diff since its FORK. `verify:review git.2` against a bare remote, a clone
  with a tracking branch, commits on both sides and two real worktrees.
- `git:status` and `review:across` in the contract and both diagrams; `verify:ipc` at 90.
- The review subject's `across: true` flag, absent by default, dropped by name when
  malformed while the node is kept. `verify:layout across.1`.
- The surfaces: the context pane's branch line (`main · ahead 1 · behind 1 · against the
  last fetch`, or `· no upstream`, or nothing when git could not say) and the identity line's
  repository suffix; the palette's worktree rows carrying the same phrase; the cross-worktree
  node's sections with commit and discard blocked by name; `Review every worktree…` in the
  palette, disabled by name. `verify:panels across.1`. An `across` shot scene.

## Red first

- `verify:review git.1/.2`: red with every builder absent and both engine arms undefined.
- `verify:layout across.1`: written beside the parser rather than before it — recorded
  here rather than claimed.
- `verify:panels across.1`: red first on the harness's engine lacking `worktreesOf` (one
  section), which is the same dep main wires — fixed in the harness, not the app.

## Decisions taken while building, and why

- **The fork, not the baseline.** See the load-bearing entry.
- **No fetch, said out loud.** The number is as fresh as the last fetch; the phrase says so.
- **Blocked by name.** A commit across worktrees is N commits pretending to be one.
- **The branch picture is the palette's worktree rows**, not a new pane: M37's list already
  exists and is the one place every worktree is named.

## The visual loop

See the triage below.

## Verification

`npm run verify` run alone; counts in the final section.

## Triage: the critic

**Accepted and fixed.** The context pane was not in the scene (`across-context` is now a
second capture, with the identity line reading `claude — api (2) · repo`). The repository
path was the loudest line in the well (dropped; the title and the identity line name it).
Commit was removed rather than disabled (it stays, disabled, with the reason as its title).
The three headings had three shapes (every section is label then branch, the main tree
called `main tree` so its two slots do not read as one doubled word). The count column
changed format per section (one shape, with the `shared` arm's totals summed from its files
rather than withheld).

**Declined, with a reason.** *The status strip's `… of repo review`.* The strip's shape is
title then kind word on every node; the doubled reading is this label's own last word.

## Triage: the verifier

Verdict: delivered with gaps — and the first one was the milestone's headline. **Accepted
and fixed:**

- **From an agent's own worktree the node saw one tree.** `reviewAcross` resolves the common
  root through `--git-common-dir`; `verify:review git.2` now asks from inside a worktree and
  `verify:panels across.1` seeds its subject in one.
- **The identity line named the worktree's leaf.** `git:status` carries `repository`; the
  pane names that.
- **The main tree's section came back `shared`** whenever any panel had a baseline in the
  root. A tree diff has no peers; `reviewAt` takes `null` for a tree.
- **No common history was reported as "could not be read"**, and a removed worktree the same.
  Records are checked against `worktree list` (as git spells the path — a `/var` record
  against a `/private/var` list called every worktree removed, in the harness), and each
  arm has its own sentence. `git.2` has an orphan branch and a removed worktree.
- **The palette row was enabled for a file, a memory node or a never-started panel.** It
  keeps the ordinary row's gate first.
- **The worktree list was withheld until every status answered, and two reloads could land
  out of order.** Rows land at once and enrich after, behind an epoch.
- **The branch line vanished and returned on every idle.** Cleared on a root change only.
- **`parseWorktreeList` was dead code.** It validates records now.

**Declined, with reasons.** *A merged branch reading `no changes`:* true by construction and
honest — the work is in the main tree; the spec says so now. *A per-repository worktree
count on the palette row:* the palette holds no target root; the global count with the
review gate ahead of it is the honest approximation. *Per-file hunks in the across node:*
a section is a picture, and the worktree's own review has the hunks. *The leftover ordinary
body under the across body:* renders nothing today; noted.

## Verification

`npm run verify` run alone; `verify:review` 97/97, `verify:layout` 194/194, `verify:panels`
295/295, `verify:ipc` 90 channels, and the chain's own exit code 0 after the verify tmux
server was killed. The `across` and `across-context` scenes re-shot after both triages and read.
