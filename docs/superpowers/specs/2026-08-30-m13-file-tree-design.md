# M13: The file tree — a codebase browser rooted on the selected panel

**Status:** designed, not yet implemented.
**Predecessor:** `2026-08-29-m12-live-cwd-design.md`, and by DEPENDENCY as
well as by number — M12's `session:live` is what answers this milestone's one
open question, and M12's own spec named `#3` in its list of "four entries that
already assume this works". This is the first of those four to collect.
**Backlog entries:** #3 (file tree / codebase browser — the whole of this
spec). It touches #31's standing rule (secrets in agent output) only to
establish that it does not apply; see "What is deliberately out".

## Goal

Give the canvas a way to see the shape of the project an agent is working in,
and a way to hand that agent a path without typing it.

The unit of this app is "a thing an agent can work in", and every one of those
things is rooted in a directory the user cannot currently see. The gesture this
milestone is actually for is small and constant: *there is a file over there,
and I want to name it in this prompt.* Today that means alt-tabbing to a real
editor, copying a path, and coming back.

## Why it is cheap now and was not before

Backlog #3 was captured with an unanswered question at the bottom of it:

> **Open question:** which directory? Each panel is a shell that can `cd`
> anywhere. Either a workspace-level root, or track each session's cwd
> (obtainable from the PTY's pid).

M12 shipped the second half of that sentence. `session:live` polls tmux for
`#{pane_current_path}` and `live-session-store.ts` caches it per panel id, and
`CLAUDE.md` already ruled on how a *consumer* may use it:

> A consumer is asking a different question: project-prompt reading and preset
> capture each need A directory, neither makes a claim about it, and the spawn
> cwd is exactly what they used before this milestone — so the fallback is
> never worse than not shipping.

A file tree is exactly that shape of consumer. It needs a directory; it makes
no claim about one. So the open question resolves to an existing store and a
fallback that is already written down, with no new state on disk and no picker.

The other constraint #3 records has also already been paid for:

> the sidebar lives *outside* the transformed `.world` layer... its width
> changes the canvas viewport size, which feeds `viewport.ts`'s math and every
> panel's culling decision.

M8a made the shell a CSS grid of real columns and left a note saying why that
was safe: nothing in the renderer measures the *window*. `useViewport`,
`Canvas` and `EdgeIndicators` all measure the `.canvas` host at event time, and
the pip layer carries its own `ResizeObserver` precisely so `Canvas` need hold
no size at all. A fourth column therefore costs no coordinate change anywhere.
What it does not escape is the stale-tier effect M8a documented; see "Two
stated limits".

## Scope

In:

- **A fourth grid column**, left of the rail, collapsible on the same rules the
  rail and inspector already obey, with `files.treeOpen` as an ordinary boolean
  `SettingDef` and `Cmd+B` as its chord.
- **`src/shared/fs-tree.ts`** — the wire types: `FsEntry`, and `DirResult` as a
  discriminated union of named answers.
- **`src/main/fs-tree.ts`** — `readDir`, one directory per call. Plain-node
  tier, like `prompts.ts`.
- **One new invoke, `fs:list`.** `verify:ipc` 31 -> 32, and a README diagram
  line, because `verify:meta` 14 fails on any channel missing from it.
- **`src/renderer/shell/file-tree-model.ts`** — pure: flatten an expanded set
  into rows, `treeSignature`, `relativePath`, `shellQuote`.
- **`src/renderer/shell/FileTree.tsx`** — presentational, `memo`'d.
- **`files.showHidden`**, a second boolean `SettingDef`, default off.
- **A new plain-node suite, `verify:files`**, covering both pure modules, and
  its own link in `package.json`'s `verify` chain — placed with the other
  plain-node suites, ahead of `build`, because that is the tier it belongs to.

Out, and each for its own reason — see "What is deliberately out".

## The root, and the two panels that are not the same panel

The tree's root is the **selected** panel's directory:

```
live-session-store.get(selectedId)?.cwd   ??   panel.spec.cwd
```

That is the consumer rule quoted above, unchanged. A selected **review node**
has no cwd at all — it is not a terminal panel and owns no session — so it
roots at `subject.repoRoot`, which is a directory the node already names and
persists. No selection at all renders the column's own empty state, never a
void under a heading; that is the rule `SideRail`'s three sections already
obey.

The paste, however, goes to the **focused** panel, because that is what
`registry.get(focusedId).handle.paste` means and what `Cmd+C`/`Cmd+V` already
act on.

Selection and focus are deliberately different things in this app — a rail-row
click selects without focusing — so they can differ, and when they do a
*relative* path is silently wrong: correct in the directory the tree is showing
and unresolvable in the shell it lands in. The rule is therefore:

- **relative** to the tree's root when the root panel IS the focused panel,
- **absolute** otherwise.

The inserted text is then always correct. The cost is that it is occasionally
long, which is visible; the alternative's cost is a path that does not resolve,
which is not.

## Components

### `shared/fs-tree.ts`

```ts
export type FsEntryKind = 'dir' | 'file' | 'symlink' | 'other'
export interface FsEntry { name: string; kind: FsEntryKind }

export type DirResult =
  | { kind: 'ok'; entries: FsEntry[]; truncated: number }
  | { kind: 'unreadable'; detail: string }
  | { kind: 'not-a-directory' }
  | { kind: 'gone' }
```

**Named arms, never null.** This is `repo-unreadable`'s lesson applied before
the fact rather than after it. M9a folded "git declined to open this
repository" into "this is not a repository" and the Changes section rendered
*nothing* for the whole of that milestone — the hardest failure to report,
because nothing looks wrong. A permission-denied directory, a path that is a
file, a path that vanished under a running panel, and a genuinely empty
directory are four different situations with four different fixes, and a
reader that collapses them renders one silence for all of them.

`truncated` is a count and not a flag, for `REVIEW_FILE_CAP`'s reason: the
remainder is reported (`+N more`) rather than the list silently ending.

### `main/fs-tree.ts`

`readDir(path, { showHidden })`, one `readdirSync(..., { withFileTypes: true })`
and nothing recursive. Plain-node tier: it imports `node:fs` and nothing else,
and it is `electron` and `node-pty` that move a module out of that tier, not
the filesystem — `prompts.ts` is the precedent and says so in its own header.

- **Sorted directories-first, then by name, case-insensitively.** `readdir`'s
  order is filesystem-dependent, and a list that reshuffles between launches is
  a list you cannot learn — the argument `readProjectPrompts` already makes for
  its own `sort()`.
- **Capped.** The directory is whatever the user pointed a panel at, so the
  entry count is an attacker-shaped input in the ordinary case of "I opened a
  panel in a repo I just cloned".
- **A symlink is its own kind and is never followed.** Resolving one would mean
  a `stat` per entry and a cycle to defend against; reporting it costs neither.
- **One level, always.** Depth comes from the user expanding, never from the
  lister recursing — the same rule `readProjectPrompts` states for
  `.claude/commands`.
- **`~` expansion stays main's job.** The `fs:list` handler calls the existing
  `resolveCwd` before it reads. The renderer has no `process.env` and must not
  grow a second expander.

### `renderer/shell/file-tree-model.ts`

Pure, no DOM, no React, no `electron`. Joins the plain-node tier alongside
`rail-rows.ts`, `rail-sections.ts`, `inspector-fields.ts` and
`review-node-model.ts` — and lives in `shell/` beside them rather than in a new
directory, because it is a shell-region model and that is where the other four
already are.

```ts
export interface FileRow {
  path: string          // absolute
  name: string
  depth: number
  kind: FsEntryKind
  state: 'collapsed' | 'expanded' | 'loading' | 'note'
  note?: string         // the arm's own sentence, for 'note'
}
```

A `loading` or `note` row is a CHILD row, rendered at its parent directory's
depth + 1 and carrying that parent's own path — it stands where the children
would have stood, so an unreadable directory reads as "this directory says
something" rather than as a sibling of the thing it describes. Its `kind` is
`'dir'` for the same reason. The root itself is not a row; it is the column's
heading.

```ts

buildFileRows(root, dirs: Map<string, DirResult>, expanded: Set<string>): FileRow[]
treeSignature(rows: FileRow[]): string
relativePath(root: string, path: string): string
shellQuote(path: string): string
```

Three properties carry the module:

- **A directory expanded but not yet answered renders a `loading` row**, not
  nothing. An in-flight query is a first-class state here for the reason it is
  one in the review pane: a section that renders nothing while it waits reads
  as broken on every selection change.
- **A directory whose answer is a failure arm renders a `note` row** carrying
  that arm's own sentence. See the union above.
- **Collapsing removes descendants transitively.** Expand `a/`, expand `a/b/`,
  collapse `a/` — a one-level implementation orphans rows at depth 2 under a
  parent that is no longer there, and they render as top-level entries with
  suspicious indentation.

`shellQuote` is small and has three cases that must be asserted separately: a
plain path is **not** quoted (or every insert is noisy), a path containing a
space is, and a path containing a single quote is escaped `'\''`. A check that
only tries the space case passes against a quoter that quotes everything.

### `renderer/shell/FileTree.tsx`

`memo`'d, presentational, every array frozen upstream on `treeSignature`.

It renders **unconditionally**, exactly as `SideRail` and `Inspector` do:
collapsing is a CSS width change to a 22px strip holding the toggle and nothing
else, never an unmounted region, because that toggle is the only way back for a
user who does not know the chord. That is also why the rows must be frozen
rather than memo'd on `treeOpen` — they stay mounted and reconciled while
nobody can see them, so there is no closed state to key on. The rail learned
this first and `rail-rows.ts`'s own comment records it.

## Two hazards this milestone turns on

### Every row mounts `shellControl`, and here that is not a convention

`shell-control.ts` exists so a shell control never takes DOM focus:
`preventDefault()` on mousedown stops the browser moving focus to the button at
all, so focus never leaves xterm's hidden textarea. Its own doc comment gives
the general reason — `focusedId` pins a panel live and is what `Cmd+C`/`Cmd+V`
act on.

For every other control in the shell, losing focus is merely bad. **Here it is
fatal to the feature itself**: the click's whole job is to paste into the
focused panel, so a row that took focus would destroy its own target in the act
of using it. The symptom is "clicking a file does nothing", with no error
anywhere and nothing on screen changed.

### The signature is `JSON.stringify`, and a filename is worse than a title

`railSignature` is taken over the rendered rows with `JSON.stringify` rather
than a concatenation, and `CLAUDE.md` records why: a label is **user text**, so
with an ordinary separator a title containing it could forge a field boundary,
make two different lists produce one string, and freeze the rail on stale rows.

A **filename** is strictly more reachable than a title. The user does not have
to type it — an agent writes it, into a directory this app does not own, and
the tree lists whatever is there. Same mechanism, same fix, a wider door.

The freeze itself is required for the ordinary reason: `Canvas` re-renders on
every mousemove over the canvas (`setCursor`) and on every frame of a drag
(`setPanelRect`), so an unfrozen array defeats `FileTree`'s memo outright and
the symptom is invisible on a small tree.

## Refresh is a pull, and there is no watcher

The tree re-reads on three signals: the root changing, a directory being
expanded, and an explicit refresh control in the column's header. Nothing else.

This is M9b's standing ruling on review nodes, unchanged and for the same
reason: a watcher over a repository this app does not own fires on every build
artifact, every editor save and every `git` command run in a terminal
elsewhere, and each firing costs a `readdir` per expanded directory. The signal
worth reacting to is a human looking, not a byte changing.

## Honest degradation

- **No tmux, or a panel whose first live tick has not landed** — the root falls
  back to `panel.spec.cwd`, which is where the panel started and is exactly
  what every consumer used before M12. Never worse than not shipping.
- **No selection** — the column renders its own empty state.
- **A directory that vanishes under an expanded node** — the next read answers
  `gone` and the row says so, rather than the children silently persisting.
- **A selected review node** — roots at `subject.repoRoot`.

## Two stated limits, recorded rather than fixed

**Collapsing the column does not re-tier.** Nothing in the renderer observes
the canvas host's size — the tiering effect depends on
`[rects, viewport, focusedId, version, dormantIds]` and reads
`getBoundingClientRect()` only when one of those changes — so a width change
leaves tiers stale until the next pan, zoom, focus change or panel edit. This
is **pre-existing**: a window resize has always done exactly this, and M8a's
own comment leaves the fix to a later milestone. M13 adds a fourth button to it
and no new failure.

**The tree is a snapshot, not a view.** Between refreshes it is as stale as the
last read. That is fine for a navigator and would not be for anything that
writes, which is one more reason writing is out.

## What is deliberately out

- **File contents never cross the process boundary.** `fs:list` returns names
  and kinds; there is no `fs:read`. This is what makes backlog #31 — "any
  feature that moves terminal bytes out of the panel is a disclosure surface,
  because agents print secrets" — **not apply to this milestone at all**, and
  it is the main thing the click-inserts-a-path answer bought. A preview pane
  is a separate milestone that owes #31 an answer first.
- **No writes.** No rename, delete, create or move. Read-only.
- **No git-status decoration.** Colouring rows by modified/untracked would put
  a `git` subprocess on every expand, and it is the review engine's territory
  rather than the tree's.
- **No fuzzy file search.** That is backlog #16, which is gated on #30.
- **No watcher.** See above.

## Verification

**`verify:files` (new, plain node)** — both pure modules, needing a
`scripts/files-entry.cjs` esbuild entry that carries the `@shared` alias
pre-emptively, on the standing rule that needing no alias *yet* is exactly the
state `verify-viewport.cjs` was in until the day it broke.

Main, against a real **spaced** temp directory throughout — the `pane-died`
quoting bug's standing lesson, that a fixture with no space in its path cannot
see a whole class of defect:

1. Entries sorted directories-first then by name, case-insensitively.
2. Dotfiles excluded when `showHidden` is false **and included when it is
   true** — both directions, because "excluded" alone passes against a reader
   that returns nothing at all.
3. `unreadable` is its own arm, not an empty `ok`. Skipped **loudly** when the
   process can read a mode-000 directory anyway (running as root), the rule
   `verify:review` 61-63 already obeys for a missing git binary.
4. `not-a-directory` and `gone` are two arms, not one — "that is a file" and
   "it moved" have two different fixes.
5. The cap reports its remainder rather than truncating silently; the fixture
   is deliberately over the cap so the two lists cannot coincide.
6. A symlink to a directory is reported as `symlink` and is not descended.

Renderer:

7. Nothing expanded yields the root's own children at depth 0.
8. Expanding splices children beneath their parent at depth+1 **without
   disturbing a later sibling** — order preservation, which a set-shaped
   implementation loses.
9. Collapsing removes descendants **transitively** (expand `a/`, expand
   `a/b/`, collapse `a/`).
10. An unanswered directory renders a `loading` row; a failed one renders a
    `note`.
11. **The one worth knowing by number:** `treeSignature` moves on an expand,
    and **a filename containing the separator cannot forge a field boundary**.
    See the hazard above for why a filename is a wider door than a title.
12. `relativePath` strips the root; a path not under the root falls back to
    absolute, which is the state a panel that `cd`'d away produces.
13. `shellQuote`, three clauses, separately.

**`verify:panels` (real Electron)**, five additions:

14. The **exact** four-column inset identity —
    `canvasWidth === windowWidth - treeW - railW - inspectorW`, ±1 for
    fractional device pixels. It has to be the identity: check 73 records that
    every looser bound survives the one CSS failure that matters, because an
    element pushed out of view still reports its width.
15. **The one that matters.** A file row clicked with a **real
    `sendInputEvent`**, asserting in ONE read that focus did not move *and*
    that the path reached the focused panel's PTY. A dispatched `MouseEvent`
    cannot test this: it is `isTrusted: false` and Blink runs no default action
    for one, so it moves no focus whether or not `preventDefault` was called —
    it passes identically against the regression it exists to catch. That is
    check 75c's recorded limit, inherited. Asserting only "focus unmoved"
    passes against a row wired to nothing at all.
16. Re-rooting on a selection change, asserted **positively** in one consistent
    DOM read pairing "which panel is selected" with "which root is shown" —
    check 100b's rule, because "the old rows are absent" is satisfied before
    React has processed the click.
17. `files.treeOpen` findable in the palette by a keyword it does not display,
    and running it **moves the frame** — check 79's palette-to-SCREEN
    direction, the only one a store-side check misses.
18. `Cmd+B` toggles, and a `repeat: true` stream does not re-toggle. Like 7b,
    33b and 75b this supplies `repeat: true` by hand, so it proves the guard
    READS the flag and says nothing about who sets it.

**Contract and hygiene:** `verify:ipc` 31 -> 32; `verify:meta` 14 obliges the
README diagram line; `verify:styles` 1-8 apply unchanged to every new rule —
tokens only, no colour literals, no fractional opacity, no off-scale spacing.

**What none of this can see**, stated so a green run is not read as more than
it is: no check renders anything, so the suite can say the column insets
correctly and nothing about whether the tree is legible. There is no visual
regression test in this repo, and that is a position rather than an omission.

## Success criteria

1. Selecting a panel roots the tree at the directory that panel is **actually**
   in, not the one it was spawned in, whenever tmux can answer.
2. Clicking a file inserts a path that **resolves** in the panel it lands in —
   relative when that is correct, absolute when it is not.
3. Clicking a file does not move DOM focus and does not change `focusedId`.
4. A directory the app cannot read says so, and does not look like an empty
   one.
5. Dragging a panel does not rebuild the tree's rows.
6. `Cmd+B` and the palette row and the toggle button all agree about whether
   the column is open, on the first paint and after every one of them.

## Risks

- **The column is a fourth thing competing for horizontal space.** At 220px
  plus a 240px rail plus a 260px inspector, a 1280px window leaves 560px of
  canvas. All three collapse, and the tree defaults to **closed** for that
  reason — the user opens it when they want it.
- **A very large directory.** The cap answers the read; what it does not answer
  is a user expanding forty directories and holding forty results in the
  renderer. Left alone deliberately: the map is keyed by path and the rows are
  strings, and a bound on it would be a guess.
- **The relative/absolute rule is the one judgment call here**, made against no
  existing precedent in this repo. It is stated in one place
  (`file-tree-model.ts`), asserted purely by check 12 and end to end by check
  15's fixture; if it turns out to be the wrong call, that is the one line to
  change.
