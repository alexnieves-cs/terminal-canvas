# M37 — A git worktree per panel: implementation plan

Spec: `../specs/2026-09-01-m37-worktree-per-panel-design.md`. Ten tasks,
check-first: write the check, watch it fail for the right reason, implement,
watch it pass. Targeted suites per task; the full chain once at the end.

## Task 1 — The format: one flag, one record list (`verify:layout`)

Checks first, in `scripts/verify-layout.cjs` with scoped ids `worktree.1–.6`:
- `.1` `parsePreset`: absent `worktree` stays absent (`'worktree' in preset`
  is false); `true` survives; `false` is normalised to absent; `"yes"` is
  dropped with a warning naming the preset, and the preset survives.
- `.2` the same four cases through `parsePanel`.
- `.3` `parseWorktrees`: absent → `[]` with no warning; a non-array warns and
  yields `[]`; one malformed entry (missing `branch`) costs that entry only.
- `.4` round trip: a snapshot with a worktree preset, a worktree panel and
  one record survives `JSON.parse(JSON.stringify(...))` + `parseLayout`.
- `.5` the store: `addWorktree` then `worktreeForPanel(id)` finds it,
  `worktreeForPanel` with a different `root` does not, `dropWorktree(id)`
  removes it, and each write schedules a save (the store's existing write
  spy).
- `.6` `setPresetWorktree(id, true)` on a user preset persists the flag;
  on a built-in id it returns false and writes nothing.

Then: `WorktreeRecord` and `worktrees` in `layout-schema.ts` (+
`defaultSnapshot`, `parseLayout`), `worktree?: boolean` on `Preset`,
`PersistedPanel`, `PanelSpec`, `PresetTemplate`, `CapturedPanel`; the store
verbs in `layout-store.ts`.

## Task 2 — Every copy site (`verify:layout`, `verify:viewport`)

Checks first: `worktree.7` `templateOf` and `presetFromCapture` carry `true`
and keep absence absent; `worktree.8` `toPanels`/`fromPanels` in
`layout-adapt.ts` both directions; `worktree.9` `presetRows` carries the
flag to `PresetListRow.worktree`. Then the copy sites, each with the
absent-stays-absent guard, and `Canvas.tsx`'s `onSpawn` and its
`PRESET_CAPTURE` reply.

## Task 3 — The pure half (`verify:review`)

Checks first (`worktree.1–.3` in `scripts/verify-review.cjs`):
`worktreeBranch('n12', <fixed date>)` is `tc/n12-20260901-1432`;
`worktreePath(dir, root, branch)` is under `dir`, its leaf has no `/`, and two
roots with the same basename yield different parents; `buildWorktreeAddArgs`
and `buildWorktreeRemoveArgs` are the exact argv (no `--force`). Then
`main/worktree.ts` (pure) and the two builders in `git-args.ts`.

## Task 4 — The manager, against real git (`verify:review`)

Checks first (`worktree.4–.9`, inside the existing real-git block, skipping
loudly without git): `ensureForPanel('p1', repo)` creates a directory on a
new `tc/` branch at HEAD and records it; a second call for `p1` returns the
same record and creates nothing (`git worktree list` count unchanged);
`resolveRepo(path)` answers the worktree root and a baseline captured there
plus an edit there reports one file and the main checkout's own dirt is
absent; a panel whose cwd is not a repository gets the `refused` arm; a
dirty worktree's `remove` is `refused` with git's sentence and the directory
survives; a clean one's `remove` is `removed`, the directory is gone, and the
branch still exists. Then `main/worktree-manager.ts`.

## Task 5 — The spawn (`verify:pty-manager`)

Checks first (`worktree.1–.3`): with an injected `worktreeFor` answering
`active` for a temp directory, `create({ worktree: true })` reports that
directory as `cwd` and the result carries `worktree.kind === 'active'`; with
`refused`, `cwd` is the requested directory and the result carries the
reason; with no `worktree` on the spec, `worktreeFor` is never called. Then
the constructor dep, the `create()` branch, `PtyCreateResult.worktree`.

## Task 6 — The channels (`verify:ipc`, `verify:meta`)

`worktree:list`, `worktree:remove`, `worktree:reveal`, `preset:set-worktree`
in the contract; handlers in `ipc.ts`; preload; `EXPECTED_CHANNELS` 56;
both README and CLAUDE.md diagrams. Run `verify:ipc` and `verify:meta` red
then green.

## Task 7 — The inspector (`verify:rail`)

Checks first (`worktree.1–.3` in `scripts/verify-rail.cjs`): a running
session with an active worktree yields `worktree` and `worktree path`
fields; a refused one yields a single `worktree` field beginning
`refused —`; a panel that never asked yields neither; `inspectorSignature`
moves when the worktree outcome changes. Then `panel-session.ts`'s
`status.running.worktree`, the registry's copy in `ensure`, and
`inspector-fields.ts`.

## Task 8 — The palette (`verify:palette`)

Checks first: the presets scope has a `preset.worktree.<id>` toggle row per
preset, disabled with `REASON_BUILT_IN_WORKTREE` for a built-in, titled with
its current state; a `manage.worktrees` door whose subtitle counts records;
per record a destructive `worktree.remove.<id>` row (disabled with
`REASON_WORKTREE_ATTACHED` while a panel owns it) and a
`worktree.reveal.<id>` row. Then `commands.ts`, the `worktrees` context row
type, `usePaletteActions` (`setPresetWorktree`, `removeWorktree` through the
confirm path, `revealWorktree`), and the list fetched on palette open beside
credentials.

## Task 9 — The built-in preset, end to end (`verify:panels`)

Check first (`worktree.1`, gated on git): spawn the `claude-worktree`
built-in... — no: `claude` may be absent on the machine. Spawn through a
user preset seeded on disk with `worktree: true` and `command: /bin/sh`
against a temp repository; the inspector shows a `tc/` branch; closing the
panel leaves the directory and `worktree:list` reports it detached. Then
`BUILT_IN_PRESETS` gains `claude-worktree`.

## Task 10 — Close

- `npm run verify` green.
- `docs/load-bearing.md`: the worktree entries (the record outliving the
  panel, attachment computed not stored, the cwd split, no `--force`).
- `CLAUDE.md`: the module list and both diagrams; README "what it does"
  bullet; backlog #50 → gone table; build log; merge.
