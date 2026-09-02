# M37 — A git worktree per panel

**Status:** designed 2026-09-01. Required for 1.0 by the scope amendment
(`2026-09-01-v1-scope-decision.md` §7, feature 1).
**Backlog entry:** #50.

## What this milestone is for

The canvas's premise is many agents at once, and nothing in it coordinates
two of them editing one checkout. Two `claude` panels spawned from one preset
share a working tree by construction, and the review engine's `shared` arm
already exists because that configuration is common enough to need an honest
answer. Both agents rewrite the same files, `git status` in either one shows
the other's work, and a commit from a review node puts a stranger's edits
under this node's message unless the engine refuses. The backlog calls this
the largest correctness gap in the product thesis, and it is: every other
entry makes the app better at something; this one stops it being wrong at the
thing it is for.

The fix is the one git already ships. A preset can declare that it spawns in
a **fresh worktree** of its repository on a **new branch**, so four agents on
one repository are four working trees and four branches, merged deliberately.

## Decisions

### 1. One optional flag, carried absent-stays-absent through four layers

`Preset.worktree?: boolean`, `PresetTemplate.worktree`, `PanelSpec.worktree`,
`PersistedPanel.worktree`, `CapturedPanel.worktree`. Absent means no, and
only `true` is ever written. Every copy site (`templateOf`,
`presetFromCapture`, `Canvas.tsx`'s `onSpawn`, `parsePanel`, `parsePreset`,
`layout-adapt`) rebuilds the object field by field with the same
`...(x.worktree !== undefined ? { worktree: x.worktree } : {})` guard the
absent-`command` rule already demands — a spread would write
`worktree: undefined`, which survives IPC and reads as present. On disk a
present `false` is accepted and normalised to absent; anything else is
dropped with a warning and the preset or panel survives without it.

The panel's `spec.cwd` stays the REPOSITORY cwd the preset asked for, never
the worktree path. The worktree path is what main actually spawned in and
arrives as `PtyCreateResult.cwd`, which is the split the inspector already
draws between `asked for` and `cwd`. This is what makes "save this panel as a
preset" produce a preset that spawns a new worktree next time rather than one
that spawns inside this panel's worktree.

### 2. Main creates the worktree, before the spawn, under `userData`

In `PtyManager.create()`, when `spec.worktree` is set:

1. Look up a record for this panel id (§3). If one exists and its directory
   is present, spawn there — this is every `Cmd+R` reload and every restart-
   in-place, both of which run `create()` again at the same id.
2. Otherwise resolve the repository root of `spec.cwd` (the engine's own
   `resolveRepo`). Not a repository, or git unreadable: **refuse**, spawn in
   the requested cwd as an ordinary panel, and carry the refusal on the
   result so the inspector says so. A worktree the user asked for and did not
   get must never be silent.
3. `git -C <root> worktree add -b <branch> <path> HEAD`, awaited through the
   injected `GitRunner` (it has the timeout and the absolute-path rule). A
   failure — an unborn HEAD, a branch that already exists — is the same
   refusal arm carrying git's own sentence.
4. Record it (§3), and spawn with `cwd = path`.

The worktree lives under `userData/worktrees/<basename(root)>-<hash(root)>/<branch>`,
outside the repository. Inside the repository it would show as an untracked
directory in the main checkout's own `git status` and in every review of a
panel spawned there — the review engine's `ls-files --others` would list the
sibling agent's entire worktree as this agent's new files.

The branch is `tc/<panelId>-<yyyymmdd-HHMM>`. The stamp is what keeps a
recycled panel id from colliding with a branch a previous panel left behind;
the panel id is what makes the branch legible in `git branch` beside the
canvas. Naming and path derivation are pure functions in `main/worktree.ts`
so `verify:review` pins them under plain node.

**The review engine needs no change.** `resolveRepo(worktreePath)` answers
the worktree's own root (`rev-parse --show-toplevel` does), `captureBaseline`
runs `stash create` in the worktree, and `baselinePeers` counts panels by
root — so two panels in two worktrees of one repository are two attributable
answers, and two panels in ONE worktree are still `shared`. That is the
reason the worktree is the panel's spawn cwd rather than a fact the engine
is taught about separately. The baseline is captured against the worktree's
`HEAD` on a clean tree, which is the branch point: a review of a worktree
panel reports exactly the agent's work on its branch.

### 3. Records outlive the panel, and attachment is computed, never stored

`LayoutSnapshot.worktrees: WorktreeRecord[]`, a sibling of `baselines` and
`sessions` (PanelId is global, so this is not per workspace):
`{ id, root, path, branch, createdAt, panelId }`. Absent on every file
written before this milestone and read as `[]`; a malformed entry costs that
entry.

A record is **never dropped when its panel closes**, and never dropped by
undo. Whether a record is attached is derived at read time — its `panelId`
is in some workspace's panel list — rather than cleared on close, for two
reasons. Restart-in-place is dispose-then-ensure at the same id, so a
`kill()`-time detach would hand the restarted panel a brand-new worktree and
lose the branch it was on. And undoing a close restores the same panel id,
which must land back in its own worktree. Closing a panel therefore leaves a
worktree on disk with a branch on it, listed in the palette as detached,
which is exactly what "merged deliberately" needs: the work is where git can
see it until the user decides.

A recycled id in the SAME repository reuses the detached record (the
inspector shows the branch, which is how the user learns it); a recycled id
in a different repository — a different `root` — creates a new one. The
check is `root` equality, so a panel whose cwd is a different repository can
never be spawned into a stranger's branch.

### 4. Removal is a verb the user runs, and it refuses a dirty tree

`worktree:remove` runs `git -C <root> worktree remove <path>` with NO
`--force`, exactly as `review:commit` runs no `--no-verify`: a tool that
quietly discarded an agent's uncommitted work would be worth less than one
that refused. Git's refusal is reported verbatim as a `refused` arm, distinct
from `failed` (git could not run at all) — two situations, two fixes. The
branch is NOT deleted: deleting an unmerged branch is the one irreversible
act in this feature and it is the user's, in git, once they have merged. The
record is dropped on success.

`worktree:reveal` opens the directory in Finder (`shell.showItemInFolder`),
because a path in a 260px pane is a path the user cannot otherwise get at.

`worktree:list` returns every record with its computed `attached` flag and
the panel title when attached.

### 5. Discoverability without a preset editor

Presets are captured from panels; there is no form. Three doors:

- A built-in preset **"Claude in a fresh worktree"** (`claude-worktree`),
  beside the existing built-ins, available whenever `claude` is. Built-ins
  are code and never on disk, so this needs no migration.
- A palette row per user preset in the Manage presets scope, **"Spawn
  `<name>` in a fresh worktree: on/off"**, backed by a `preset:set-worktree`
  invoke — a toggle rather than a compound gesture because this changes what
  the preset IS, not how one panel starts. Disabled with a named reason for a
  built-in.
- A **"Manage worktrees…"** door with one row per record: remove
  (destructive, confirm-gated, named reason when attached — a worktree with
  a running panel in it is not removable from here) and reveal.

### 6. The inspector says which branch, and says when it could not

A terminal panel's fields gain `worktree` (the branch) and `worktree path`
when its session carries an active worktree, and a single `worktree` row
reading `refused — <reason>` when the panel asked and was refused. Three
states — not requested, active, refused — and no row at all for the first,
by the Cost section's rule.

## What it must not break

- **`pty.kill` keeps exactly two callers and `registry.dispose` five sites.**
  Nothing here touches a lifecycle path; the worktree manager is called from
  `create()` and from the remove invoke only.
- **The absent-`command` rule's discipline** at every copy site the flag
  passes through; `verify:panels` 172's shape covers the new field.
- **Undo never destroys work on disk.** `Cmd+N` then `Cmd+Z` disposes the
  session and leaves the worktree, detached and listed.
- **The baseline is captured once per session** — unchanged; the worktree
  path is simply the cwd it is captured in.
- **`verify:ipc`'s count** moves 52 → 56 (`worktree:list`, `worktree:remove`,
  `worktree:reveal`, `preset:set-worktree`); both channel diagrams gain them.

## Verification

- `verify:review` — pure: `worktreeBranch`/`worktreePath` (stamp format, a
  path with no `/` in the leaf, hash stability); real git: `worktree add`
  through the runner in a spaced temp repository creates the directory on a
  new branch at HEAD, `resolveRepo(path)` answers the worktree root, a
  baseline captured there reports only the worktree's own edits, `remove`
  refuses a dirty worktree and leaves it, and removes a clean one and keeps
  the branch.
- `verify:layout` — `worktree` on a preset and a panel: absent, `true`,
  `false` normalised, malformed dropped, round trip; `worktrees` absent →
  `[]`, one malformed entry costs one entry; the store's add/find/drop.
- `verify:pty-manager` — `create()` with `worktree: true` in a temp
  repository spawns with the worktree path as cwd; a second `create()` at
  the same id reuses it; a non-repository cwd yields the refused arm and
  spawns in place.
- `verify:palette` — the three doors' rows and their disabled reasons.
- `verify:rail` — the inspector's three worktree states.
- `verify:panels` — end to end: a worktree preset spawns a panel whose
  inspector names a `tc/` branch, closing the panel leaves the directory,
  and `worktree:list` reports it detached.
- `verify:ipc` 56; `verify:meta` 14 against both diagrams.
