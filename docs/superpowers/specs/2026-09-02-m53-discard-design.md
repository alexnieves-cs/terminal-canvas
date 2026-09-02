# M53 — Discard, per file

**Status:** designed 2026-09-02. Backlog #51, reinstated by the scope
amendment (§7): "Per-file, refusing outright on the `shared` arm, with the
baseline's contents disclosed before the write; never undoable and never
pretending to be."

## What this milestone is for

The review layer can keep an agent's work (M9c's commit) but cannot throw
it away. The only path today is the agent's own terminal, or the user's
own git, both of which discard by DIFF rather than by the baseline the
review node shows — so what the user sees and what a discard would do are
computed from different roots. This milestone gives the node the other
verb, against the same baseline it renders, one file at a time.

It is the only operation in this app that destroys work, and the design is
mostly refusals.

## Shape

### One file at a time, from the row

Each file row in a review node gains a `Discard` control. Pressing it does
not write: it ARMS the row, which now shows exactly what will happen and
asks once. The armed row reads one of two sentences, derived from whether
the path exists in the baseline tree:

- **restore** — "Restore `path` to its state at spawn (`abc1234`)? Anything
  changed by hand since then goes with it. This cannot be undone."
- **delete** — "`path` did not exist at spawn. Delete it? This cannot be
  undone."

That distinction IS the disclosure #51 demands: the baseline is what the
file becomes, and for a file the baseline never held, "becomes" means gone.
The renderer cannot know which sentence applies from the review result
alone — `untracked` says git has never tracked the file, but a TRACKED file
added and committed by the agent since spawn is also absent at baseline —
so `review:discard-preview` is not added; instead the discarder reports
per path in its result, and the ARMED row asks with the honest generic
form when the result is not yet known. Concretely: the row arms with the
sentence chosen by `untracked` (the common case, right for both untracked
and never-existed files), and the RESULT names what happened
(`restored` / `removed`) so the node's outcome line never lies.

### Never undoable, and never pretending

No history entry is pushed. `Cmd+Z` after a discard undoes whatever canvas
gesture preceded it, exactly as after a commit — the undo stack moves
panels, and a discard moves files. The armed row's sentence says so.

### Refusals, in order, before any write

1. **`shared`** (two panels in one checkout): the node model blocks the
   control with the reason (`n panels share this checkout`), AND main
   refuses the request outright by asking its own peer count — the node's
   result may be stale, and a refusal that lives only in the renderer is a
   refusal a later UI forgets.
2. **Baseline lost** (the stash object is gone): refused before `ls-tree`.
3. **HEAD is irrelevant** — a discard restores from the baseline, not
   HEAD, so M9c's `head-moved` guard does not transfer and is not copied.

### What it writes, and what it does not

- **The worktree only.** `git restore --source=<baseline> --worktree --
  <paths…>` for paths that exist in the baseline, in ONE call; the
  repository's own index is never written, the inverse of the commit
  path's scratch-index rule and for the same reason (an agent may be
  mid-write against it). An added file whose index entry remains reads as
  "deleted" in the agent's `git status`, which is the truth.
- **Removal is the filesystem's, never `git rm`.** A path absent at
  baseline is removed through an injected `removeFile`, so no git call
  writes the index and the whole transaction stays drivable under plain
  node. The removal is of a FILE; a directory is refused per path.
- **Per-path failures are reported per path.** A restore that fails for
  one path (permissions, a path that vanished) does not un-restore the
  others — it cannot — so the result carries `restored`, `removed` and
  `failed: {path, detail}[]` together. A half-done discard that reported
  `failed` alone would have the user retry what already happened.

### Calls

Three git calls at most: `cat-file -e <baseline>` (exists), `ls-tree -r
--name-only -z <baseline> -- <paths…>` (which of them the baseline holds),
`restore --source=<baseline> --worktree -- <held…>` (one call). Then fs
removals for the rest. `ls-tree` with pathspecs is exact-match on paths,
so a path naming a directory at baseline lists its children, never itself
— a path that is a directory in the worktree is therefore refused per
path before `ls-tree` by the injected `isDirectory`.

### Types

```ts
interface ReviewDiscardRequest { root: string; baseline: string; paths: string[] }
type ReviewDiscardResult =
  | { kind: 'discarded'; restored: string[]; removed: string[]; failed: { path: string; detail: string }[] }
  | { kind: 'nothing-to-discard' }
  | { kind: 'refused'; detail: string }   // shared, baseline lost, git missing
  | { kind: 'failed'; detail: string }    // restore itself exited non-zero for every path
```

`review:discard` is an invoke, root-and-baseline addressed like
`review:commit`. The handler is appended last to `registerIpcHandlers`
with an inert default, like `ledgerList`.

### The node model

`ReviewNodeModel.discard: ReviewNodeDiscard` mirrors `commit`: `ready`
with the reviewed paths, `blocked` with a reason on `shared` /
`baseline-lost` / `git-missing`, `none` otherwise. The row control is
rendered disabled with the blocked reason as its title, never removed.

## What it must not break

- `verify:review` 51–67 (commit) untouched; the discarder is a NEW module
  (`main/review-discard.ts`) with its own argv builders in `git-args.ts`.
- `verify:rail`'s review-node checks: `commit` unchanged; `discard` added.
- `verify:panels` review checks select `data-review-node-file`; the
  discard control is a child with its own attribute.
- The IPC count: `verify:ipc` moves to 63, both diagrams gain the row.

## Verification

- `verify:review discard.1` argv: ls-tree is exact and NUL-terminated,
  restore is `--worktree` only and lists exactly the held paths in one
  call; `discard.2` a path absent at baseline is removed through the
  injected fs and never through git; `discard.3` shared refuses before any
  git call; `discard.4` a lost baseline refuses; `discard.5` one failing
  path is reported in `failed` beside the others' success; `discard.6` a
  directory path is refused per path and never removed.
- `verify:rail discard.1` the model blocks on shared with a counted reason
  and is ready on changes with every path (not the capped rows).
- `verify:panels discard.1`: against the harness's real repository, a
  file the panel modified is restored byte-for-byte and a file it added is
  gone; the node's outcome line names both; no history entry was pushed
  (`Cmd+Z` count unchanged). Fault-injected.
- `verify:ipc` expects 63.
