# M183 — pure red evidence (`verify:layout` library.1–.2)

Written by the fresh-context check writer before `src/shared/template-library.ts` exists.
Plain node only; no Electron suite, no build.

## Command

```
node scripts/verify-layout.cjs
```

Exit code: **1**. Tally: **245/247 passed**. Every pre-existing check (the 245 the suite
printed before this milestone, M182's `edit.1–.6` and `store.edit.1` included) still PASSES.

## The two new ids, and why each fails

Both fail BY NAME with the detail `src/shared/template-library.ts does not exist`: the
entry (`scripts/layout-entry.cjs`) requires the module inside the M181/M182
`try { require } catch { return {} }` shape, so the bundle still builds, `L.LIBRARY` /
`L.defaultNodeOf` / `L.placementFor` / `L.LIBRARY_GAP` are absent, and each check's guard
records a failure rather than throwing (the verify-suites rule: a throw would abort the
run and the checks below it would never execute).

- `library.1 LIBRARY: one entry per kind in order (terminal, chat, pool, orchestrator, collect), distinct non-empty names, a sentence ending in . of ≤ 90 chars, an example of ≤ 60 chars; defaultNodeOf(kind) is accepted by addNode for every kind (cwd ~ on terminal/chat, width 2 on pool, dx/dy 0); an unknown kind throws a TypeError naming it` — FAIL, module missing.
- `library.2 placementFor: no nodes → {0,0}; nodes at (0,0), (100,20), (150,-10) → dx = 150 + BLOCK_W + LIBRARY_GAP (358), dy = -10, overlapping no block's rect; one node at (0,0) → {BLOCK_W + LIBRARY_GAP (208), 0}; LIBRARY_GAP is 40` — FAIL, module missing.

## What the checks assert (the agreed API)

`library.1`: `LIBRARY.map(kind)` equals `['terminal','chat','pool','orchestrator','collect']`
exactly (five, once each, in order); every `name` non-empty and no two equal; every
`sentence` ends in `.` and is ≤ 90 characters; every `example` non-empty and ≤ 60;
`addNode({ id:'t', name:'t', nodes:[], edges:[] }, defaultNodeOf(kind))` answers `ok` with
one node of that kind for all five; the default carries no `key`, `dx === 0`, `dy === 0`,
`cwd === '~'` on terminal and chat, `width === 2` on pool; `defaultNodeOf('widget')` throws
a `TypeError` whose message contains `widget`.

`library.2`: `LIBRARY_GAP === 40`; `placementFor` of a template with no nodes is `{0,0}`;
with nodes at (0,0), (100,20), (150,−10) it is `{ dx: 150 + BLOCK_W + 40 = 358, dy: -10 }`
and the rect `[dx, dx+BLOCK_W) × [dy, dy+BLOCK_H)` intersects none of the three blocks'
rects (asserted geometrically, not by the formula alone); with one node at (0,0) it is
`{ 208, 0 }`. `BLOCK_W` (168) and `BLOCK_H` (64) are read from the bundle's own
`workflow-diagram.ts` export, never restated.

## Green proof, then red again

To prove the checks are correct and not merely red, a throwaway stub of the agreed API was
written at `src/shared/template-library.ts`, the suite run (**247/247 passed**), and the
stub DELETED; the suite was re-run and printed the same two failures. No production module
is left in the tree.

## Assumptions recorded

1. **M182 was uncommitted.** This worktree was cut at `50cf9f6` (the Act I merge) and held
   neither `template-edit.ts`, the `edit.*` checks, nor the M183 spec and plan; those were
   uncommitted working files in the shared checkout. They were copied in as plain files
   (31 files: the M182 `src/`, `scripts/`, `docs/`, `CLAUDE.md`, `README.md` changes) so the
   new checks sit at the tail of M182's `verify-layout.cjs` and use its `addNode`. No git
   command touched the shared checkout. The parent should expect this worktree's diff to be
   M182's working state plus: the entry line in `scripts/layout-entry.cjs`, the two checks
   at the end of `scripts/verify-layout.cjs`, and this file.
2. `BLOCK_W`/`BLOCK_H` already reach `L` through `layout-entry.cjs`'s existing
   `require('../src/renderer/workflow/workflow-diagram')`; no new require was needed for them.
   The suite's esbuild call already aliases `@shared` and `@renderer`.
3. `addNode` validates only `cwd` (terminal/chat) and `width` (pool); a pool default with
   empty `list`/`prompt`, an orchestrator with an empty `prompt` and a collect with an
   empty `target` are accepted by it today. `library.1` asserts acceptance by `addNode` as
   agreed, not that those strings are non-empty.
4. `library.1`'s "sentence" rule is `endsWith('.')`, trimmed length > 1, `length <= 90` — a
   sentence that ends in `?` or `!` fails it; the agreed API says `.`.
5. The unknown-kind arm is driven with the string `'widget'` and requires
   `e instanceof TypeError` — a plain `Error` fails it.
