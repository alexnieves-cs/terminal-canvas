# M196 plan — the scope policy

Spec: [2026-09-09-m196-scope-policy.md](../specs/2026-09-09-m196-scope-policy.md).
Red-first: every check below is watched failing against the exact regression it claims, without
aborting the checks under it (`docs/verify-suites.md`'s first rule).

## Task 1 — the pure module

`src/shared/work-scope.ts`: `WorkScope`, `LaneIdentity`, `normaliseScopePath`, `insideDirectory`,
`laneOfPath(cwd, records)`, `scopeRepository(scope)`, `scopeLine(scope)`.
`src/shared/preview.ts` delegates its two path helpers to it. Add the module to
`scripts/file-entry.cjs`.

**Checks** (`verify:file`): `scope.1` — segment containment (`/w/api` does not hold `/w/apiary`;
holds itself and a child; a relative or empty path is `null`), `laneOfPath` picking the LONGEST
matching record and answering undefined for a plain directory, and `scopeLine`'s three arms.

## Task 2 — the resolver in main

Export `commonRootOf` from the review engine. `src/main/work-scope.ts`:
`createScopeResolver({ resolveRepo, commonRootOf, worktrees })` → `resolve(cwd): Promise<WorkScope>`.

Order: empty cwd → `unavailable`; `resolveRepo` → `not-a-repo` → `no-repository`; `unreadable` →
`unavailable` with git's detail; `root` → lane from the record (segment rule) else from
`commonRootOf` when it differs from the toplevel; repository = the record's `root`, else the
common root, else the toplevel.

**Checks** (`verify:review`, over the fake `GitRunner` already there): `scope.resolve.1` — a plain
repository (no lane), an app lane (record wins, branch carried), a lane subdirectory, an EXTERNAL
worktree (no record, `--git-common-dir` names the parent), a non-git folder, git declining, and a
common dir that parses to null (submodule shape) falling back to the toplevel.

## Task 3 — memory scope

`memoryRoot` → `resolveScope`. Lane → repository. `unavailable` → a named refusal on `add` and a
named unresolved read on `list`. `memory.list` answers `scope?: { repository, lane? }`.

**Checks** (`verify:file` `memory.4`): the store keyed by the repository for a lane path, the same
file for the repository and the lane, and an unavailable resolution refusing rather than writing.

## Task 4 — `worktreeRootOf` on the segment rule

All three wiring sites in `main/index.ts` use one helper built on `laneOfPath`.

**Checks** (`verify:teammates` `places.4`): a cwd BELOW a lane translates to the record's root and
is allowed when that root is in the places; the same cwd is REFUSED for a teammate whose places do
not hold that root (the no-widening fence); a path below an unrelated directory of the same prefix
(`<lane>x/`) does not translate.

## Task 5 — the statements

- `MemoryNode`: label from the read's `root`; a lane line when `scope.lane` is present.
- `ChatNode` composer note: name the repository.
- `inspector-fields.ts` chat arm: `chat-repository` and `chat-lane` fields.
- `Canvas.tsx`'s `projectScopeReason`: the lane refusal replaced by the repository translation
  (main resolves it; the renderer states it).

**Checks**: `verify:rail` `scope.fields.1` (the two chat fields, absent when there is no lane);
`verify:panels:product` `scope.memory.1` (the node names the repository a lane resolved to).

## Task 6 — gates

`npm run verify`, then `verify:visual` and `verify:packaged`. Critic pass. Ledger row and build log.
