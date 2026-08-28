# M9a — The Review Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Main can answer, for any panel, "what has changed in this panel's repository since this session started" — correctly, or refused honestly — and M8c's inspector shows it.

**Architecture:** A pure argv/parser module (`git-args.ts`) plus an orchestrator (`review-engine.ts`) whose git runner is an injected dependency, so both live in the plain-node verify tier alongside `tmux-args.ts`. A per-panel baseline commit — produced by `git stash create`, which snapshots dirty state without touching the worktree — is captured once at spawn and persisted in `layout.json`. One new invoke channel serves a pure `buildReviewFields` in the inspector. No new panel kind, no canvas work, no file watcher.

**Tech Stack:** TypeScript, Electron 43, `node:child_process.execFile` (async), esbuild for the verify bundles, plain-node assertion scripts.

**Spec:** `docs/superpowers/specs/2026-08-28-m9-review-layer-design.md`

## Global Constraints

- **Every git read uses `-z`.** Git's default output quotes and backslash-escapes whitespace-bearing and non-ASCII paths and encodes renames with braces. Copied verbatim from the spec: a check that asserts the right property against an input that never resembles production is how the `pane-died` quoting bug survived eight task reviews.
- **Every git call is async `execFile`, never `execFileSync`.** A synchronous call in main blocks every PTY flush, every IPC reply, and the whole UI.
- **`git-args.ts` imports nothing.** Not `electron`, not `node-pty`, not `node:child_process`. That is what keeps it in the plain-node tier.
- **`review-engine.ts` takes its runner as an injected dependency**, the way `main/presets.ts` takes `which` and `main/layout-store.ts` takes its paths.
- **The baseline is captured once per panel id and never recaptured.** `pty:create` runs again for every panel on a `Cmd+R` reload and reattaches to a live tmux session.
- **No heuristic attribution.** When the answer is unavailable the result says so; falling back to a plausible answer is worse than reporting nothing.
- **A check that THROWS aborts the run**, and every check after it never executes. Guard calls that may not exist yet; when watching a test-first RED, note which checks a throw prevented from running and confirm their RED separately.
- Commits use the repo convention: `feat(m9a): …` / `test(m9a): …`, with a body explaining *why*, ending in `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

## File Structure

**Create:**
- `src/shared/review.ts` — the wire types (`ReviewBaseline`, `ReviewFile`, `ReviewResult`). In `shared/` because the renderer receives `ReviewResult` over IPC and `layout-schema.ts` persists `ReviewBaseline`.
- `src/main/git-args.ts` — pure argv builders and output parsers.
- `src/main/review-engine.ts` — orchestration over an injected `GitRunner`.
- `src/main/git-runner.ts` — the one impure module: `execFile` wrapped as a `GitRunner`. Kept apart so `review-engine.ts` stays plain-node testable, exactly as `session-backend.ts` is kept out of `tmux-args.ts`'s reach.
- `scripts/review-entry.cjs` — esbuild entry for the new suite.
- `scripts/verify-review.cjs` — the suite.

**Modify:**
- `src/shared/layout-schema.ts` — `baselines` on `LayoutSnapshot`, `parseBaselines`.
- `src/main/layout-store.ts` — four baseline accessors.
- `src/main/pty-manager.ts` — capture at `create`, drop at `kill`.
- `src/shared/ipc-contract.ts` — `IPC.REVIEW_PANEL`, `CanvasBridge.review`.
- `src/preload/index.ts` — the bridge member.
- `src/main/ipc.ts` — the handler.
- `src/renderer/shell/inspector-fields.ts` — `buildReviewFields`, `reviewSignature`.
- `src/renderer/shell/Inspector.tsx` — the Changes section.
- `src/renderer/canvas/Canvas.tsx` — the query and its three triggers.
- `package.json` — `verify:review`, added to the `verify` chain.
- `scripts/verify-layout.cjs`, `scripts/verify-rail.cjs`, `scripts/verify-panels.cjs`, `scripts/verify-pty-manager.cjs` — new checks.
- `README.md`, `CLAUDE.md` — the milestone row and the verify table.

---

### Task 1: `git-args.ts` — argv and parsers, and the new suite

**Files:**
- Create: `src/main/git-args.ts`
- Create: `scripts/review-entry.cjs`
- Create: `scripts/verify-review.cjs`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: nothing.
- Produces: `NumstatEntry`, `buildRepoRootArgs`, `buildBaselineArgs`, `buildHeadArgs`, `buildObjectExistsArgs`, `buildNumstatArgs`, `buildUntrackedArgs`, `buildFileDiffArgs`, `parseRepoRoot`, `parseNulList`, `parseNumstat`.

- [ ] **Step 1: Write the esbuild entry**

`scripts/review-entry.cjs`:

```js
/* esbuild entry for the review suite. git-args.ts is pure — no child_process,
   no electron, no node-pty — which is what keeps this suite in the cheap
   plain-node tier. If this entry ever needs `external: ['node-pty']`,
   something impure has leaked in and belongs in git-runner.ts instead.

   It grows ONE spread per task, as each module comes into existence: Task 2
   adds review-engine, Task 4 adds git-runner. Naming a module before the task
   that creates it makes esbuild fail to resolve the whole bundle, so NO check
   runs and the suite cannot go green — which is exactly what happened to the
   first draft of this plan. */
module.exports = {
  ...require('../src/main/git-args')
}
```

- [ ] **Step 2: Write the failing suite**

`scripts/verify-review.cjs`:

```js
/* Verifies the pure review core: git argv construction and output parsing,
   then the engine's seven result arms against a fake runner, then a REAL git
   repository in a spaced temp directory.
   Run with: npm run verify:review

   Plain node, no Electron. Every check here guards a failure that is SILENT
   in a running app: a diff attributed to the wrong panel, a baseline
   recaptured on reload so an hour of work reads as "no changes", or a path
   with a space parsed into two files. */
const { buildSync } = require('esbuild')
const { join } = require('node:path')
const { mkdirSync } = require('node:fs')

const OUT = join(__dirname, '..', 'out', 'verify', 'review.cjs')
mkdirSync(join(__dirname, '..', 'out', 'verify'), { recursive: true })
buildSync({
  entryPoints: [join(__dirname, 'review-entry.cjs')],
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron', 'node-pty'],
  // review-engine.ts imports its types from @shared/review. Carried for the
  // reason verify-viewport.cjs learned the hard way: a type-only import is
  // erased by esbuild and hides the gap until the day a value import lands.
  alias: { '@shared': join(__dirname, '..', 'src', 'shared') }
})
const R = require(OUT)

const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`)
}

/* Async from check 1, even though checks 1-13 need nothing of it: every
   engine check from Task 2 onward is awaited, and retrofitting the wrapper
   later means re-indenting the whole file in a commit about something else.
   The same shape verify-pty-manager.cjs already uses. */
;(async () => {

// 1. Repo root argv. -C rather than a cwd option, so the runner needs no
//    per-call cwd and cannot drift from the path the args name.
ok('1 repo-root argv', JSON.stringify(R.buildRepoRootArgs('/a/b')) ===
  JSON.stringify(['-C', '/a/b', 'rev-parse', '--show-toplevel']))

// 2. Baseline argv. `stash create`, NOT `stash push`: create writes a commit
//    object and leaves both the worktree and the stash list untouched.
ok('2 baseline argv', JSON.stringify(R.buildBaselineArgs('/r')) ===
  JSON.stringify(['-C', '/r', 'stash', 'create']))

// 3. Object-existence argv. This is what separates baseline-lost from a
//    generic git failure; `cat-file -e` exits non-zero for a pruned object.
ok('3 object-exists argv', JSON.stringify(R.buildObjectExistsArgs('/r', 'abc')) ===
  JSON.stringify(['-C', '/r', 'cat-file', '-e', 'abc']))

// 4. Numstat argv carries -z. Without it a path with a space or a rename is
//    parsed wrong, and only for the users who have such paths.
{
  const a = R.buildNumstatArgs('/r', 'base')
  ok('4 numstat argv is -z', a.includes('--numstat') && a.includes('-z') &&
    a[a.length - 1] === 'base')
}

// 5. Untracked argv uses ls-files --others, never `add -N`. add -N mutates the
//    index, which an agent running in that repo may be using at that instant.
{
  const a = R.buildUntrackedArgs('/r')
  ok('5 untracked argv', a.includes('--others') && a.includes('--exclude-standard') &&
    a.includes('-z') && !a.includes('-N'))
}

// 6. Repo root strips the trailing newline git always emits.
ok('6 parseRepoRoot trims', R.parseRepoRoot('/Users/x/proj\n') === '/Users/x/proj')

// 7. Not a repository: git prints nothing on stdout. Null, never ''.
ok('7 parseRepoRoot empty is null', R.parseRepoRoot('') === null)

// 8. NUL list, with the trailing NUL git emits after the last entry, which a
//    naive split turns into a phantom empty path.
ok('8 parseNulList drops the trailing empty',
  JSON.stringify(R.parseNulList('a.txt\0b c.txt\0')) === JSON.stringify(['a.txt', 'b c.txt']))

// 9. An ordinary numstat record.
{
  const e = R.parseNumstat('3\t1\tsrc/a.ts\0')
  ok('9 numstat ordinary', e.length === 1 && e[0].path === 'src/a.ts' &&
    e[0].added === 3 && e[0].removed === 1 && e[0].binary === false)
}

// 10. A path containing a SPACE, which -z passes through verbatim. The whole
//     reason for -z, and the shape every fixture in this repo omitted until
//     the pane-died bug.
{
  const e = R.parseNumstat('1\t0\tdocs/my notes.md\0')
  ok('10 numstat spaced path', e.length === 1 && e[0].path === 'docs/my notes.md')
}

// 11. A binary file: git writes - and - rather than counts. Parsed as
//     binary:true with zero counts, never as NaN, which would poison the
//     summary line for the whole panel.
{
  const e = R.parseNumstat('-\t-\timg.png\0')
  ok('11 numstat binary', e.length === 1 && e[0].binary === true &&
    e[0].added === 0 && e[0].removed === 0)
}

// 12. A RENAME under -z is three fields: counts, an EMPTY path, then from and
//     to as their own NUL-terminated records. A parser that reads one path per
//     record consumes the next file's name as this one's and every entry after
//     it is shifted by one — silently, and only in a repo where something was
//     renamed.
{
  // join('\0'), never a single literal: '\010' in a JS string is an OCTAL
  // escape, not NUL-then-'10', so a hand-written fixture silently encodes
  // something other than what it appears to.
  const e = R.parseNumstat(['2\t2\t', 'old/a.ts', 'new/a.ts', '5\t0\tb.ts', ''].join('\0'))
  ok('12 numstat rename', e.length === 2 && e[0].path === 'new/a.ts' &&
    e[0].renamedFrom === 'old/a.ts' && e[1].path === 'b.ts')
}

// 13. Empty output is an empty list, not a crash. This is the CLEAN repo, the
//     commonest input this parser sees.
ok('13 numstat empty', R.parseNumstat('').length === 0)

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length === 0 ? 0 : 1)

})()
```

- [ ] **Step 3: Add the npm scripts**

In `package.json`, after `"verify:rail"`:

```json
    "verify:review": "node scripts/verify-review.cjs",
```

and insert `npm run verify:review && ` into the `verify` chain immediately after `npm run verify:rail && `.

- [ ] **Step 4: Run it and watch it fail**

Run: `npm run verify:review`
Expected: esbuild fails to resolve `../src/main/git-args` — the process exits non-zero before any check runs. **All thirteen checks are unreached, not red.** That is the expected RED for this step; do not record it as "13 failures".

- [ ] **Step 5: Write `src/main/git-args.ts`**

```ts
/**
 * Pure git argv construction and output parsing.
 *
 * Imports NOTHING — not electron, not node-pty, not node:child_process — which
 * is what keeps it in the plain-node verify tier, the same line tmux-args.ts
 * draws against session-backend.ts. The module that actually spawns git is
 * git-runner.ts, and it is deliberately out of this file's reach.
 *
 * Every read is -z. Git's default output QUOTES and backslash-escapes paths
 * containing whitespace or non-ASCII bytes, and encodes a rename as a single
 * brace-infixed field. A line/tab parser is therefore correct for exactly the
 * repositories a developer tests against and wrong for the ones users have.
 * This repo has already paid full price for that class of bug once: the
 * unquoted pane-died redirect made EVERY panel report exit code 1, silently,
 * because every fixture used a space-free path.
 */

export interface NumstatEntry {
  path: string
  added: number
  removed: number
  /** Git writes `-` for both counts on a binary file. Not zero, and not NaN. */
  binary: boolean
  /** Present only for a rename; `path` is the destination. */
  renamedFrom?: string
}

export function buildRepoRootArgs(cwd: string): string[] {
  return ['-C', cwd, 'rev-parse', '--show-toplevel']
}

/**
 * `stash create`, never `stash push`. Create writes a commit object
 * representing the current dirty state and prints its sha, WITHOUT modifying
 * the working tree and WITHOUT adding to the stash list — verified against a
 * scratch repo before this was designed. `push` would do both and would be a
 * catastrophic thing to run underneath a working agent.
 *
 * On a CLEAN tree it prints nothing; the caller falls back to HEAD.
 */
export function buildBaselineArgs(root: string): string[] {
  return ['-C', root, 'stash', 'create']
}

export function buildHeadArgs(root: string): string[] {
  return ['-C', root, 'rev-parse', 'HEAD']
}

/**
 * The baseline commit is UNREFERENCED, so `git gc --prune=now` in that
 * repository destroys it. This is how the engine tells that apart from a
 * generic git failure and reports `baseline-lost` rather than falling back to
 * HEAD — which would silently start blaming the agent for changes that were
 * already there when it started.
 */
export function buildObjectExistsArgs(root: string, sha: string): string[] {
  return ['-C', root, 'cat-file', '-e', sha]
}

export function buildNumstatArgs(root: string, baseline: string): string[] {
  return ['-C', root, 'diff', '--numstat', '-z', baseline]
}

/**
 * Untracked files never appear in `git diff`, and the tempting fix —
 * `git add -N` — MUTATES THE INDEX of a repository an agent may be mid-commit
 * in. `ls-files --others` reads and changes nothing.
 */
export function buildUntrackedArgs(root: string): string[] {
  return ['-C', root, 'ls-files', '-z', '--others', '--exclude-standard']
}

/** Declared here, first called in M9b — the review node renders hunks. */
export function buildFileDiffArgs(root: string, baseline: string, path: string): string[] {
  return ['-C', root, 'diff', baseline, '--', path]
}

export function parseRepoRoot(stdout: string): string | null {
  const trimmed = stdout.trim()
  return trimmed === '' ? null : trimmed
}

/** Git terminates the LAST entry with NUL too, so the split has a trailing ''. */
export function parseNulList(stdout: string): string[] {
  return stdout.split('\0').filter((s) => s !== '')
}

export function parseNumstat(stdout: string): NumstatEntry[] {
  const records = stdout.split('\0')
  const out: NumstatEntry[] = []
  for (let i = 0; i < records.length; i++) {
    const record = records[i]
    if (record === '') continue
    const tab = record.indexOf('\t')
    if (tab === -1) continue
    const second = record.indexOf('\t', tab + 1)
    if (second === -1) continue
    const addedRaw = record.slice(0, tab)
    const removedRaw = record.slice(tab + 1, second)
    const path = record.slice(second + 1)
    const binary = addedRaw === '-' && removedRaw === '-'
    const added = binary ? 0 : Number(addedRaw)
    const removed = binary ? 0 : Number(removedRaw)
    if (path === '') {
      // A RENAME. Under -z the path field is empty and the two names follow as
      // their own NUL-terminated records. Consuming both here is what stops
      // every subsequent entry being shifted by one.
      const from = records[i + 1]
      const to = records[i + 2]
      if (from === undefined || to === undefined) continue
      i += 2
      out.push({ path: to, added, removed, binary, renamedFrom: from })
      continue
    }
    out.push({ path, added, removed, binary })
  }
  return out
}
```

- [ ] **Step 6: Run the suite and watch it pass**

Run: `npm run verify:review`
Expected: `13/13 passed`, exit 0.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck:node`
Expected: no output, exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/main/git-args.ts scripts/review-entry.cjs scripts/verify-review.cjs package.json
git commit -m "feat(m9a): git argv and parsers, and the review suite

Pure argv builders and output parsers for the review engine, in the
plain-node tier for tmux-args.ts's reason: no electron, no node-pty, no
child_process. The module that spawns git lands in git-runner.ts, out of
this file's reach.

Every read is -z. Check 10 is a path with a space and check 12 is a rename,
the two shapes git's default output mangles and the two no fixture in this
repo has ever contained — the same gap that let the unquoted pane-died
redirect report exit code 1 for every panel through eight task reviews.
Check 12 is the one worth knowing by number: under -z a rename is three
records, so a parser reading one path per record consumes the NEXT file's
name and shifts every entry after it, silently, and only in a repo where
something was renamed.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `review.ts` wire types, and the engine's repo/baseline half

**Files:**
- Create: `src/shared/review.ts`
- Create: `src/main/review-engine.ts`
- Modify: `scripts/verify-review.cjs` (checks 14–20)

**Interfaces:**
- Consumes: Task 1's builders and parsers.
- Produces: `GitResult`, `GitRunner`, `ReviewBaseline`, `ReviewFile`, `ReviewResult`, `ReviewEngineDeps`, `ReviewEngine`, `createReviewEngine(deps)`, with `resolveRepo(cwd)` and `captureBaseline(root)`.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-review.cjs`, before the summary block:

```js
/* A fake runner. Keyed by the JOINED argv so a check states exactly which git
   invocation it is answering — a runner keyed on a substring would answer the
   wrong call the day two argvs share a word. */
const fakeRunner = (table) => async (args) => {
  const key = args.join(' ')
  const hit = table[key]
  if (hit === undefined) return { stdout: '', ok: false, notFound: false }
  return { stdout: hit.stdout ?? '', ok: hit.ok !== false, notFound: hit.notFound === true }
}

// 14. resolveRepo returns the root for a cwd inside a repository.
{
  const e = R.createReviewEngine({
    run: fakeRunner({ '-C /a/b rev-parse --show-toplevel': { stdout: '/a\n' } }),
    baselineOf: () => undefined,
    peersInRepo: () => 0
  })
  ok('14 resolveRepo finds the root', (await e.resolveRepo('/a/b')) === '/a')
}

// 15. Outside a repository git exits non-zero. Null, and NOT an exception:
//     a panel in ~ is the ordinary case, not an error, and a throw here would
//     take the pty:create it is called from down with it.
{
  const e = R.createReviewEngine({
    run: fakeRunner({ '-C /tmp rev-parse --show-toplevel': { stdout: '', ok: false } }),
    baselineOf: () => undefined,
    peersInRepo: () => 0
  })
  ok('15 resolveRepo outside a repo is null', (await e.resolveRepo('/tmp')) === null)
}

// 16. captureBaseline prefers the stash-create sha.
{
  const e = R.createReviewEngine({
    run: fakeRunner({ '-C /r stash create': { stdout: 'deadbee\n' } }),
    baselineOf: () => undefined,
    peersInRepo: () => 0
  })
  ok('16 captureBaseline uses stash create', (await e.captureBaseline('/r')) === 'deadbee')
}

// 17. On a CLEAN tree stash create prints nothing and the baseline is HEAD.
//     Without this fallback every panel spawned in a clean repo would have no
//     baseline at all and would report never-started forever.
{
  const e = R.createReviewEngine({
    run: fakeRunner({
      '-C /r stash create': { stdout: '\n' },
      '-C /r rev-parse HEAD': { stdout: 'headsha\n' }
    }),
    baselineOf: () => undefined,
    peersInRepo: () => 0
  })
  ok('17 captureBaseline falls back to HEAD', (await e.captureBaseline('/r')) === 'headsha')
}

// 18. An EMPTY repository has no HEAD either — git init and nothing committed.
//     Null rather than a thrown error or the literal string 'HEAD'.
{
  const e = R.createReviewEngine({
    run: fakeRunner({
      '-C /r stash create': { stdout: '' },
      '-C /r rev-parse HEAD': { stdout: '', ok: false }
    }),
    baselineOf: () => undefined,
    peersInRepo: () => 0
  })
  ok('18 captureBaseline in an empty repo is null', (await e.captureBaseline('/r')) === null)
}

// 19. No git binary at all: notFound propagates rather than reading as
//     "not a repository", which would silently hide the real cause.
{
  const e = R.createReviewEngine({
    run: async () => ({ stdout: '', ok: false, notFound: true }),
    baselineOf: () => undefined,
    peersInRepo: () => 0
  })
  ok('19 resolveRepo reports a missing git', (await e.resolveRepo('/a')) === null &&
    (await e.review('p1')).kind === 'git-missing')
}

// 20. resolveRepo does not cache across DIFFERENT cwds. A single-slot cache
//     would answer panel B with panel A's repository, which is the wrong-repo
//     attribution this whole milestone exists to avoid.
{
  const e = R.createReviewEngine({
    run: fakeRunner({
      '-C /a rev-parse --show-toplevel': { stdout: '/a\n' },
      '-C /b rev-parse --show-toplevel': { stdout: '/b\n' }
    }),
    baselineOf: () => undefined,
    peersInRepo: () => 0
  })
  ok('20 resolveRepo is per-cwd', (await e.resolveRepo('/a')) === '/a' &&
    (await e.resolveRepo('/b')) === '/b')
}
```


- [ ] **Step 2: Run and watch it fail**

Run: `npm run verify:review`
Expected: `TypeError: R.createReviewEngine is not a function` — the run **aborts at check 14** and checks 15–20 never execute. Confirm their RED separately after the module exists by temporarily returning a stub.

- [ ] **Step 3: Add `review-engine` to the esbuild entry**

`scripts/review-entry.cjs` re-exports only `git-args` after Task 1. Add the second spread, or every `R.createReviewEngine` below is undefined:

```js
module.exports = {
  ...require('../src/main/git-args'),
  ...require('../src/main/review-engine')
}
```

- [ ] **Step 4: Write `src/shared/review.ts`**

```ts
import type { PanelId } from './types'

/**
 * A panel's session-start snapshot: the repository it was spawned into, and a
 * commit object representing that repository's state at that moment.
 *
 * In shared/ rather than main/ because layout-schema.ts persists it and the
 * renderer receives ReviewResult over IPC.
 */
export interface ReviewBaseline {
  /** Absolute path to the repository root, as `rev-parse --show-toplevel` gave it. */
  root: string
  /** A stash-create commit, or HEAD when the tree was clean at spawn. */
  sha: string
}

export interface ReviewFile {
  path: string
  added: number
  removed: number
  binary: boolean
  /** True for a file git has never tracked; it has no counts to report. */
  untracked: boolean
  renamedFrom?: string
}

/**
 * Every arm is a designed state, not an error path. `not-a-repo` in
 * particular is the ordinary answer for a panel in the home directory, and
 * rendering an error for it would put a red field on most panels most of the
 * time.
 */
export type ReviewResult =
  | { kind: 'not-a-repo' }
  | { kind: 'never-started' }
  | { kind: 'git-missing' }
  | { kind: 'baseline-lost'; root: string }
  | { kind: 'clean'; root: string }
  | { kind: 'changes'; root: string; files: ReviewFile[]; added: number; removed: number }
  /**
   * Two or more panels that have RUN share this repository, so no per-panel
   * diff is attributable: each panel's diff-since-its-own-baseline contains
   * everything the others did afterwards. The files are still reported —
   * that is true at the repository level — and `panelCount` is what the pane
   * says instead of a name.
   */
  | { kind: 'shared'; root: string; panelCount: number; files: ReviewFile[] }

export type { PanelId }
```

- [ ] **Step 5: Write `src/main/review-engine.ts` (repo/baseline half)**

```ts
import {
  buildBaselineArgs,
  buildHeadArgs,
  buildRepoRootArgs,
  parseRepoRoot
} from './git-args'
import type { ReviewBaseline, ReviewResult } from '@shared/review'

export interface GitResult {
  stdout: string
  /** Exit status 0. */
  ok: boolean
  /** The git binary itself could not be spawned (ENOENT). */
  notFound: boolean
}

export type GitRunner = (args: string[]) => Promise<GitResult>

export interface ReviewEngineDeps {
  run: GitRunner
  /** The panel's stored baseline, or undefined if it has never spawned. */
  baselineOf: (panelId: string) => ReviewBaseline | undefined
  /** How many OTHER panels hold a baseline in this root. */
  peersInRepo: (root: string, exceptPanelId: string) => number
}

export interface ReviewEngine {
  resolveRepo(cwd: string): Promise<string | null>
  captureBaseline(root: string): Promise<string | null>
  review(panelId: string): Promise<ReviewResult>
}

export function createReviewEngine(deps: ReviewEngineDeps): ReviewEngine {
  /**
   * Sticky, and deliberately not reset: if git cannot be spawned once it will
   * not be spawnable a moment later, and re-attempting on every selection
   * change would spend a process launch per click to learn the same thing.
   */
  let gitMissing = false

  const run = async (args: string[]): Promise<GitResult> => {
    const result = await deps.run(args)
    if (result.notFound) gitMissing = true
    return result
  }

  /**
   * Trim, and treat empty as absent. Deliberately NOT parseRepoRoot, which
   * does the same thing: reusing a function named for repository paths to
   * read a sha would make the next reader wonder which of the two meanings
   * had drifted.
   */
  const trimmed = (stdout: string): string | null => {
    const t = stdout.trim()
    return t === '' ? null : t
  }

  const resolveRepo = async (cwd: string): Promise<string | null> => {
    const result = await run(buildRepoRootArgs(cwd))
    return result.ok ? parseRepoRoot(result.stdout) : null
  }

  const captureBaseline = async (root: string): Promise<string | null> => {
    const created = await run(buildBaselineArgs(root))
    const sha = created.ok ? trimmed(created.stdout) : null
    if (sha !== null) return sha
    // A clean tree prints nothing. HEAD is then the correct baseline — and an
    // empty repository has no HEAD either, which is null rather than a throw.
    const head = await run(buildHeadArgs(root))
    return head.ok ? trimmed(head.stdout) : null
  }

  const review = async (panelId: string): Promise<ReviewResult> => {
    if (gitMissing) return { kind: 'git-missing' }
    const baseline = deps.baselineOf(panelId)
    if (baseline === undefined) return { kind: 'never-started' }
    return { kind: 'clean', root: baseline.root }
  }

  return { resolveRepo, captureBaseline, review }
}
```

`review()` is deliberately a stub here — Task 3 is its own test cycle.

- [ ] **Step 6: Run the suite**

Run: `npm run verify:review`
Expected: `20/20 passed`, exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/shared/review.ts src/main/review-engine.ts scripts/verify-review.cjs
git commit -m "feat(m9a): the wire types and the engine's repo/baseline half

createReviewEngine takes its runner as an injected dependency, the move
presets.ts makes with which() and layout-store.ts makes with its paths: it
is the only reason the engine can be driven against a fake with no
repository, and against a real repository with no Electron.

Check 17 is the one that would otherwise be missing: stash create prints
NOTHING on a clean tree, so without the HEAD fallback every panel spawned
in a clean repo gets no baseline at all and reports never-started forever —
which looks exactly like the feature not being wired up. 18 is the empty
repo, where there is no HEAD either. 15 is null rather than a throw because
resolveRepo is called from pty:create and a panel in ~ is the ordinary case.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `review()` — the seven arms

**Files:**
- Modify: `src/main/review-engine.ts`
- Modify: `scripts/verify-review.cjs` (checks 21–29)

**Interfaces:**
- Consumes: Task 2's `ReviewEngineDeps`, Task 1's `buildNumstatArgs` / `buildUntrackedArgs` / `buildObjectExistsArgs` / `parseNumstat` / `parseNulList`.
- Produces: a complete `review(panelId)` returning every `ReviewResult` arm.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-review.cjs`:

```js
/* One builder for the arm checks, so each states only what it varies. */
const engineWith = (table, opts = {}) => R.createReviewEngine({
  run: fakeRunner(table),
  baselineOf: () => opts.baseline === null ? undefined : (opts.baseline ?? { root: '/r', sha: 'b1' }),
  peersInRepo: () => opts.peers ?? 0
})

const EXISTS = { '-C /r cat-file -e b1': { stdout: '' } }
const NO_UNTRACKED = { '-C /r ls-files -z --others --exclude-standard': { stdout: '' } }

// 21. A panel with no baseline has never spawned.
ok('21 never-started', (await engineWith({}, { baseline: null }).review('p1')).kind === 'never-started')

// 22. A valid baseline and an empty diff is CLEAN, and clean carries the root
//     so the pane can still say which repository it is talking about.
{
  const r = await engineWith({
    ...EXISTS, ...NO_UNTRACKED,
    '-C /r diff --numstat -z b1': { stdout: '' }
  }).review('p1')
  ok('22 clean', r.kind === 'clean' && r.root === '/r')
}

// 23. The real answer: files, and totals summed across them.
{
  const r = await engineWith({
    ...EXISTS, ...NO_UNTRACKED,
    '-C /r diff --numstat -z b1': { stdout: ['3\t1\ta.ts', '10\t0\tb.ts', ''].join('\0') }
  }).review('p1')
  ok('23 changes and totals', r.kind === 'changes' && r.files.length === 2 &&
    r.added === 13 && r.removed === 1)
}

// 24. Untracked files are REPORTED, with untracked:true and no counts. A
//     brand-new file is the single most common thing an agent produces, and a
//     diff-only implementation shows "no changes" for a panel that wrote ten
//     new modules.
{
  const r = await engineWith({
    ...EXISTS,
    '-C /r diff --numstat -z b1': { stdout: '' },
    '-C /r ls-files -z --others --exclude-standard': { stdout: 'new.ts\0' }
  }).review('p1')
  ok('24 untracked reported', r.kind === 'changes' && r.files.length === 1 &&
    r.files[0].untracked === true && r.files[0].path === 'new.ts')
}

// 25. Binary files carry binary:true and contribute nothing to the totals,
//     rather than NaN, which would render the whole summary as "NaN".
{
  const r = await engineWith({
    ...EXISTS, ...NO_UNTRACKED,
    '-C /r diff --numstat -z b1': { stdout: '-\t-\timg.png\0' }
  }).review('p1')
  ok('25 binary does not poison totals', r.kind === 'changes' &&
    r.files[0].binary === true && r.added === 0 && r.removed === 0)
}

// 26. A pruned baseline object is baseline-lost, NOT a fallback to HEAD.
//     Falling back would silently start attributing pre-existing changes to
//     this agent, which is a confident wrong answer.
{
  const r = await engineWith({
    '-C /r cat-file -e b1': { stdout: '', ok: false }
  }).review('p1')
  ok('26 baseline-lost', r.kind === 'baseline-lost' && r.root === '/r')
}

// 27. Two panels that have run in one repository: shared, with the count, and
//     the files still listed because repository-level truth is still truth.
{
  const r = await engineWith({
    ...EXISTS, ...NO_UNTRACKED,
    '-C /r diff --numstat -z b1': { stdout: '1\t0\ta.ts\0' }
  }, { peers: 3 }).review('p1')
  ok('27 shared names the count', r.kind === 'shared' && r.panelCount === 4 &&
    r.files.length === 1)
}

// 28. shared is checked BEFORE the diff is interpreted but AFTER the baseline
//     is validated: a lost baseline in a shared repo is still baseline-lost,
//     because "we cannot attribute" and "we have nothing to diff against" are
//     different sentences and the second one is the actionable one.
{
  const r = await engineWith({
    '-C /r cat-file -e b1': { stdout: '', ok: false }
  }, { peers: 2 }).review('p1')
  ok('28 lost outranks shared', r.kind === 'baseline-lost')
}

// 29. A panel whose baseline exists but whose repo is gone from disk — the
//     user deleted or moved the checkout. The diff call fails; that is
//     baseline-lost too, not a crash and not a silent empty list.
{
  const r = await engineWith({
    ...EXISTS, ...NO_UNTRACKED,
    '-C /r diff --numstat -z b1': { stdout: '', ok: false }
  }).review('p1')
  ok('29 a failed diff is not silent emptiness', r.kind === 'baseline-lost')
}
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm run verify:review`
Expected: checks 22–29 FAIL (all report `clean`), check 21 passes. No throw — the stub returns a valid object — so every check runs and each RED is real.

- [ ] **Step 3: Implement `review()`**

Replace the stub in `src/main/review-engine.ts`:

```ts
  const review = async (panelId: string): Promise<ReviewResult> => {
    if (gitMissing) return { kind: 'git-missing' }

    const baseline = deps.baselineOf(panelId)
    if (baseline === undefined) return { kind: 'never-started' }
    const { root, sha } = baseline

    // Validated FIRST, and before the shared check: "we cannot attribute
    // these changes" and "we have nothing to diff against" are different
    // sentences, and the second one is the one the user can act on.
    const exists = await run(buildObjectExistsArgs(root, sha))
    if (gitMissing) return { kind: 'git-missing' }
    if (!exists.ok) return { kind: 'baseline-lost', root }

    const numstat = await run(buildNumstatArgs(root, sha))
    // A failed diff is NOT an empty diff. The checkout may have been deleted
    // or moved out from under a still-running panel; reporting "no changes"
    // there is the confident wrong answer this milestone exists to avoid.
    if (!numstat.ok) return { kind: 'baseline-lost', root }

    const untracked = await run(buildUntrackedArgs(root))

    const files: ReviewFile[] = parseNumstat(numstat.stdout).map((e) => ({
      path: e.path,
      added: e.added,
      removed: e.removed,
      binary: e.binary,
      untracked: false,
      ...(e.renamedFrom !== undefined ? { renamedFrom: e.renamedFrom } : {})
    }))
    // A brand-new file is the commonest thing an agent produces and it never
    // appears in `git diff`. Enumerated rather than reached with `add -N`,
    // which would mutate an index the agent may be using right now.
    for (const path of untracked.ok ? parseNulList(untracked.stdout) : []) {
      files.push({ path, added: 0, removed: 0, binary: false, untracked: true })
    }

    const peers = deps.peersInRepo(root, panelId)
    if (peers > 0) return { kind: 'shared', root, panelCount: peers + 1, files }

    if (files.length === 0) return { kind: 'clean', root }

    return {
      kind: 'changes',
      root,
      files,
      added: files.reduce((n, f) => n + f.added, 0),
      removed: files.reduce((n, f) => n + f.removed, 0)
    }
  }
```

Add `ReviewFile` and the four new `git-args` imports to the import list at the top of the file.

- [ ] **Step 4: Run and watch it pass**

Run: `npm run verify:review`
Expected: `29/29 passed`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/main/review-engine.ts scripts/verify-review.cjs
git commit -m "feat(m9a): review()'s seven arms

Check 24 is the one that would have been missed by reasoning alone: an
untracked file never appears in git diff, and a brand-new file is the
commonest thing an agent produces — so a diff-only implementation reports
'no changes' for a panel that wrote ten new modules. Enumerated with
ls-files --others, never add -N, which mutates an index the agent may be
using at that instant.

29 is the other: a FAILED diff is not an empty diff. A checkout deleted or
moved out from under a running panel would otherwise read as clean, which is
the confident wrong answer the whole milestone exists to avoid. 28 pins the
order it implies — a lost baseline in a shared repo is still baseline-lost,
because 'cannot attribute' and 'nothing to diff against' are different
sentences and only the second is actionable.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `git-runner.ts`, and the real-git block

**Files:**
- Create: `src/main/git-runner.ts`
- Modify: `scripts/verify-review.cjs` (checks 30–34)

**Interfaces:**
- Consumes: Task 2's `GitRunner` / `GitResult`.
- Produces: `createGitRunner(): GitRunner`.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-review.cjs`:

```js
/* The real-git block. Pure parsers can be perfectly correct while the actual
   invocation is wrong, and this is the only thing in the repo that can see it.

   The temp directory contains a SPACE on purpose. Production baselines are
   taken in whatever directory a user keeps code in, and this repo has already
   shipped one total, silent failure from a space-free fixture. */
const { execFileSync } = require('node:child_process')
const { mkdtempSync, writeFileSync, appendFileSync } = require('node:fs')
const { tmpdir } = require('node:os')

let GIT = true
try { execFileSync('git', ['--version'], { stdio: 'ignore' }) } catch { GIT = false }

if (!GIT) {
  console.log('SKIP  30-34 — no git binary found (loudly, not silently)')
} else {
  const repo = mkdtempSync(join(tmpdir(), 'tc review '))
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' })
  git('init', '-q', '.')
  git('config', 'user.email', 'verify@example.com')
  git('config', 'user.name', 'verify')
  writeFileSync(join(repo, 'a.txt'), 'base\n')
  git('add', '-A')
  git('commit', '-qm', 'init')
  // Dirt that exists BEFORE the panel spawns. The agent must not be blamed
  // for it, and this is the only check that can prove it is not.
  appendFileSync(join(repo, 'a.txt'), 'pre-existing\n')

  const engine = (() => {
    let baseline
    const runner = R.createGitRunner()
    const e = R.createReviewEngine({
      run: runner,
      baselineOf: () => baseline,
      peersInRepo: () => 0
    })
    return { e, set: (b) => { baseline = b }, runner }
  })()

  // 30. resolveRepo against a real repository in a spaced path.
  const root = await engine.e.resolveRepo(repo)
  ok('30 real resolveRepo', typeof root === 'string' && root.endsWith(repo.split('/').pop()))

  // 31. stash create leaves the worktree and the stash list ALONE. If this
  //     ever fails, the app is stashing a working agent's edits out from
  //     under it, which is the worst thing in this milestone.
  const sha = await engine.e.captureBaseline(root)
  ok('31 baseline does not disturb the tree',
    typeof sha === 'string' && sha.length > 0 &&
    git('stash', 'list').trim() === '' &&
    require('node:fs').readFileSync(join(repo, 'a.txt'), 'utf8') === 'base\npre-existing\n')

  engine.set({ root, sha })

  // 32. The agent's edits, and ONLY the agent's edits. a.txt must report ONE
  //     added line, not two: the pre-existing dirty line was in the baseline.
  appendFileSync(join(repo, 'a.txt'), 'agent\n')
  writeFileSync(join(repo, 'new file.txt'), 'made by the agent\n')
  const r = await engine.e.review('p1')
  const a = r.files && r.files.find((f) => f.path === 'a.txt')
  ok('32 pre-existing dirt is excluded', r.kind === 'changes' && a && a.added === 1)

  // 33. The untracked file — with a SPACE in its name — is reported.
  ok('33 untracked spaced file reported',
    r.kind === 'changes' && r.files.some((f) => f.path === 'new file.txt' && f.untracked))

  // 34. A pruned baseline really does produce baseline-lost against real git,
  //     not merely against the fake. gc --prune=now is what a user's own
  //     maintenance run does.
  git('gc', '--prune=now', '-q')
  const lost = await engine.e.review('p1')
  ok('34 real gc produces baseline-lost', lost.kind === 'baseline-lost')
}
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm run verify:review`
Expected: a throw at check 30 — `R.createGitRunner is not a function` — which **aborts the run and takes 31–34 with it**. Confirm those four separately once the module exists.

- [ ] **Step 3: Add `git-runner` to the esbuild entry**

`scripts/review-entry.cjs` currently re-exports only `git-args` and `review-engine`, so `R.createGitRunner` would be undefined however correct the module is. Add the third spread:

```js
module.exports = {
  ...require('../src/main/git-args'),
  ...require('../src/main/review-engine'),
  // The impure one. It joins the bundle — rather than the suite requiring the
  // .ts directly, which plain node cannot load — and needs no `external`
  // entry: node:child_process is a builtin, which esbuild leaves alone under
  // platform:'node'. If this ever needs external:['node-pty'], something has
  // leaked that belongs elsewhere.
  ...require('../src/main/git-runner')
}
```

- [ ] **Step 4: Write `src/main/git-runner.ts`**

```ts
import { execFile } from 'node:child_process'
import type { GitResult, GitRunner } from './review-engine'

/**
 * The one impure half of the review engine, kept in its own module for the
 * reason session-backend.ts is kept out of tmux-args.ts's reach: everything
 * else in this feature then stays in the plain-node verify tier.
 *
 * ASYNC execFile, never execFileSync. TmuxBackend uses sync calls and is
 * right to — they are tiny and bounded. `git diff` on a large repository is
 * neither, and a synchronous call in main blocks every panel's 16ms PTY
 * flush, every IPC reply, and the entire UI.
 */
export function createGitRunner(): GitRunner {
  return (args: string[]) =>
    new Promise<GitResult>((resolve) => {
      execFile(
        'git',
        args,
        // A diff can legitimately be large. The default 1MB cap would reject
        // it as an error, which would read as baseline-lost — a wrong answer
        // produced by a buffer size.
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
        (error, stdout) => {
          const notFound =
            error !== null && (error as NodeJS.ErrnoException).code === 'ENOENT'
          resolve({ stdout: stdout ?? '', ok: error === null, notFound })
        }
      )
    })
}
```

- [ ] **Step 5: Run and watch it pass**

Run: `npm run verify:review`
Expected: `34/34 passed`, exit 0. On a machine with no git: `29/29 passed` plus one `SKIP` line.

- [ ] **Step 6: Commit**

```bash
git add src/main/git-runner.ts scripts/review-entry.cjs scripts/verify-review.cjs
git commit -m "feat(m9a): the real runner, and a real repository to prove it

Check 31 is the one to know by number: it asserts that taking a baseline
leaves the working tree byte-identical and the stash list EMPTY. Everything
else in this milestone is a wrong number on a screen; this one is the app
stashing a working agent's edits out from under it, and stash push instead
of stash create is a one-word slip.

32 is the claim the whole feature rests on, and no fake can make it: real
git, a real pre-existing dirty line, and a.txt reporting ONE added line
rather than two. The temp directory contains a space for the pane-died
reason, and the untracked fixture (33) has one in its filename.

execFile is async with a 64MB buffer: the default 1MB cap would turn a large
legitimate diff into an error, which the engine would report as
baseline-lost — a wrong answer produced by a buffer size.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Baselines in the layout schema and store

**Files:**
- Modify: `src/shared/layout-schema.ts`
- Modify: `src/main/layout-store.ts`
- Modify: `scripts/verify-layout.cjs` (checks 98–103)

**Interfaces:**
- Consumes: `ReviewBaseline` from `@shared/review`.
- Produces: `LayoutSnapshot.baselines`, `parseBaselines(raw, warnings)`, and on `LayoutStore`: `baseline(panelId)`, `setBaseline(panelId, b)`, `dropBaseline(panelId)`, `baselinePeers(root, exceptPanelId)`.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-layout.cjs`:

```js
// 98. A pre-M9a file has no `baselines` key at all. That warns NOTHING — it
//     is every file in existence — and resolves to an empty map. The
//     absent-versus-malformed line parsePresets already draws.
{
  const { snapshot, warnings } = L.parseLayout(JSON.stringify({ version: 1, workspaces: [] }))
  // Guarded on `!== undefined` rather than indexing straight into it: before
  // the field exists this line would THROW, aborting the run and taking
  // 99-103's RED with it, so the test-first step would prove nothing about
  // five of its six checks.
  ok(98, snapshot.baselines !== undefined &&
    Object.keys(snapshot.baselines).length === 0 &&
    !warnings.some((w) => w.includes('baseline')))
}

// 99. A present-but-malformed `baselines` WARNS rather than vanishing. A
//     silently dropped map is a user's whole review history disappearing with
//     nothing said.
{
  const { warnings } = L.parseLayout(JSON.stringify({ version: 1, baselines: [] }))
  ok(99, warnings.some((w) => w.includes('baseline')))
}

// 100. An entry missing `sha` is dropped INDIVIDUALLY; its neighbours survive.
{
  const { snapshot } = L.parseLayout(JSON.stringify({
    version: 1,
    baselines: { p1: { root: '/r', sha: 'a' }, p2: { root: '/r' } }
  }))
  ok(100, snapshot.baselines.p1 !== undefined && snapshot.baselines.p2 === undefined)
}

// 101. A baseline survives a write and a reopen.
{
  const path = tmp()
  const store = L.createLayoutStore({ filePath: path })
  store.load()
  store.setBaseline('p1', { root: '/r', sha: 'abc' })
  store.flushSync()
  const reopened = L.createLayoutStore({ filePath: path })
  reopened.load()
  const back = reopened.baseline('p1')
  ok(101, back !== undefined && back.sha === 'abc' && back.root === '/r')
}

// 102. baselinePeers counts OTHER panels in the same root and excludes the
//      asking panel. Counting itself would make every single-panel repo
//      report as shared, i.e. the feature would never once produce an
//      attributed answer.
{
  const store = L.createLayoutStore({ filePath: tmp() })
  store.load()
  store.setBaseline('p1', { root: '/r', sha: 'a' })
  store.setBaseline('p2', { root: '/r', sha: 'b' })
  store.setBaseline('p3', { root: '/other', sha: 'c' })
  ok(102, store.baselinePeers('/r', 'p1') === 1 && store.baselinePeers('/other', 'p3') === 0)
}

// 103. dropBaseline removes it. Without this the map grows for the life of
//      the install, and a recycled panel id inherits a dead panel's baseline
//      — which would attribute a fresh agent's first diff to a repository
//      state from weeks ago.
{
  const store = L.createLayoutStore({ filePath: tmp() })
  store.load()
  store.setBaseline('p1', { root: '/r', sha: 'a' })
  store.dropBaseline('p1')
  ok(103, store.baseline('p1') === undefined)
}
```

`tmp()` and `L.createLayoutStore({ filePath })` are this suite's existing helpers — `tmp()` is defined at `scripts/verify-layout.cjs:229` and every store check already opens exactly this way. A reopen is a second `createLayoutStore` at the same path followed by `load()`; there is no separate reopen helper.

- [ ] **Step 2: Run and watch it fail**

Run: `npm run verify:layout`
Expected: 98 and 99 FAIL (`snapshot.baselines` is `undefined`, so 98 throws on `Object.keys(undefined)` — **rewrite 98 defensively as `snapshot.baselines !== undefined && …` before running**, or the throw aborts 99–103).

- [ ] **Step 3: Add `parseBaselines` and the snapshot field**

In `src/shared/layout-schema.ts`:

```ts
import type { ReviewBaseline } from './review'

/**
 * Per-panel review baselines, keyed by PanelId.
 *
 * A SIBLING of `workspaces` rather than a member of one, because PanelId is
 * global rather than per-workspace — M7's rule, and for M7's reason: the id
 * doubles as a tmux session name, so one id means one panel across the whole
 * install.
 */
export function parseBaselines(
  raw: unknown,
  warnings: string[]
): Record<string, ReviewBaseline> {
  if (raw === undefined) return {}
  if (!isRecord(raw)) {
    // Present but wrong warns rather than vanishing: a silently dropped map
    // is every panel's review history gone with nothing said.
    warnings.push('baselines was not an object; ignoring it')
    return {}
  }
  const out: Record<string, ReviewBaseline> = {}
  for (const [id, value] of Object.entries(raw)) {
    if (!ID_PATTERN.test(id)) {
      warnings.push(`baseline for ${id} has an unusable panel id; dropped`)
      continue
    }
    if (!isRecord(value) || !isStr(value.root) || !isStr(value.sha)) {
      warnings.push(`baseline for ${id} was malformed; dropped`)
      continue
    }
    out[id] = { root: value.root, sha: value.sha }
  }
  return out
}
```

Add `baselines: Record<string, ReviewBaseline>` to `LayoutSnapshot` (with a doc comment repeating the sibling-of-workspaces reason), `baselines: {}` to `defaultSnapshot()`, and `baselines: parseBaselines(parsed.baselines, warnings)` to `parseLayout`'s returned snapshot.

- [ ] **Step 4: Add the four store accessors**

In `src/main/layout-store.ts`, add to the `LayoutStore` interface and its implementation:

```ts
  /** The panel's session-start snapshot, or undefined if it never spawned. */
  baseline(panelId: string): ReviewBaseline | undefined
  setBaseline(panelId: string, baseline: ReviewBaseline): void
  dropBaseline(panelId: string): void
  /**
   * How many OTHER panels hold a baseline in this root. Excluding the asker is
   * the whole point: counting itself would make every single-panel repository
   * report as `shared`, and the feature would never once produce an attributed
   * answer.
   */
  baselinePeers(root: string, exceptPanelId: string): number
```

```ts
    baseline(panelId) {
      return snapshot.baselines[panelId]
    },
    setBaseline(panelId, baseline) {
      snapshot.baselines[panelId] = baseline
      scheduleWrite()
    },
    dropBaseline(panelId) {
      if (snapshot.baselines[panelId] === undefined) return
      delete snapshot.baselines[panelId]
      scheduleWrite()
    },
    baselinePeers(root, exceptPanelId) {
      return Object.entries(snapshot.baselines)
        .filter(([id, b]) => id !== exceptPanelId && b.root === root).length
    },
```

Ensure `writeNow`'s serialised object includes `baselines`.

- [ ] **Step 5: Run and watch it pass**

Run: `npm run verify:layout`
Expected: `105/105 passed` (99 before this task plus six), exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/shared/layout-schema.ts src/main/layout-store.ts scripts/verify-layout.cjs
git commit -m "feat(m9a): baselines persist, keyed globally by panel id

A sibling of workspaces rather than a member of one, for M7's reason: PanelId
doubles as a tmux session name, so one id means one panel across the whole
install and a per-workspace map would let two workspaces disagree about what
one id's baseline is.

Check 102 is the one worth knowing by number. baselinePeers excludes the
ASKING panel, and counting itself would make every single-panel repository
report 'shared' — the feature would ship, look wired up, and never once
produce an attributed answer. 103's drop is what stops a recycled panel id
inheriting a dead panel's baseline and attributing a fresh agent's first
diff to a repository state from weeks ago.

98/99 draw parsePresets' absent-versus-malformed line: no key at all is
every file in existence and warns nothing; a present non-object warns rather
than vanishing.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Capture at spawn, and the guard that makes it correct

**Files:**
- Modify: `src/main/pty-manager.ts`
- Modify: `src/main/index.ts` (construct the engine, pass it in)
- Modify: `scripts/verify-pty-manager.cjs` (checks 21–22)

**Interfaces:**
- Consumes: `createReviewEngine`, `createGitRunner`, the store's baseline accessors.
- Produces: `PtyManager` capturing a baseline on first `create` for an id, and dropping it on `kill`.

- [ ] **Step 1: Write the failing checks**

Append to the tmux block in `scripts/verify-pty-manager.cjs`, after check 20 — and note check 20's standing obligation: **this block must still end in a definite `shutdown()`**, so move that call to the end of check 22.

```js
// 21. The baseline is captured ONCE. A second create() at the same id — which
//     is exactly what a Cmd+R reload does for every restored panel, and which
//     under tmux REATTACHES to a session that may have worked for an hour —
//     must not recapture. Recapturing reports "no changes" for an agent that
//     rewrote the repository: a wrong answer shaped exactly like a right one,
//     and the single failure this whole milestone turns on.
{
  const captures = []
  const { manager } = makeHarness(tmuxBackend, { onCaptureBaseline: (id) => captures.push(id) })
  await manager.create(spec('r2'))
  manager.detachAll()
  await manager.create(spec('r2'))
  ok(21, captures.length === 1, `captured ${captures.length}x`)
  manager.kill('r2')
}

// 22. kill drops the baseline, so the map does not grow for the life of the
//     install and a recycled id cannot inherit a dead panel's snapshot.
{
  const dropped = []
  const { manager } = makeHarness(tmuxBackend, { onDropBaseline: (id) => dropped.push(id) })
  await manager.create(spec('r3'))
  manager.kill('r3')
  ok(22, dropped.includes('r3'))
  manager.shutdown()  // check 20's obligation, inherited: this block ends in a
                      // definite kill-server, never in a session kill that
                      // leaves a stale server for the NEXT run to attach to.
}
```

`makeHarness(backend, options)` (`scripts/verify-pty-manager.cjs:109`), `spec(panelId)` and `tmuxBackend` are this suite's existing helpers. Thread the two new callbacks through `makeHarness`'s `options` rather than constructing a `PtyManager` inline — that helper's own comment says why: the constructor getters exist so behaviour can change under a running manager, and hand-rolled constructions are places to forget one.

Add to `makeHarness`'s `new PtyManager(...)` call, after the two existing getters:

```js
    (panelId) => { if (options.onCaptureBaseline) options.onCaptureBaseline(panelId) },
    (panelId) => { if (options.onDropBaseline) options.onDropBaseline(panelId) }
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm run verify:pty-manager`
Expected: 21 FAILS with `captured 0x`; 22 FAILS. Both run — neither throws.

- [ ] **Step 3: Widen `PtyManager`'s constructor**

Add two optional getters, defaulted so every existing construction site (the verify harnesses) keeps compiling unchanged — the pattern `getIdleAfterMs` already established:

```ts
    /**
     * Review-baseline hooks. Optional and defaulted for the same reason
     * getIdleAfterMs is: the verify harnesses construct this manager directly
     * and must keep compiling. In production they reach the layout store.
     */
    private readonly captureBaseline: (panelId: PanelId, cwd: string) => void = () => {},
    private readonly dropBaseline: (panelId: PanelId) => void = () => {}
```

- [ ] **Step 4: Call them**

In `create`, immediately after `const cwd = resolveCwd(spec.cwd)`:

```ts
    // Fire-and-forget: the baseline must never delay or fail a spawn. It is
    // taken BEFORE the process starts so the snapshot precedes the agent's
    // first byte, and the once-only guard lives on the other side of this
    // call — in the store — because THIS function runs again for every panel
    // on a Cmd+R reload, and under tmux that call reattaches to a session
    // that may have been working for an hour.
    this.captureBaseline(spec.panelId, cwd)
```

In `kill`, alongside the existing `backend.destroy` call:

```ts
    this.dropBaseline(panelId)
```

- [ ] **Step 5: Wire production in `src/main/index.ts`**

```ts
const reviewEngine = createReviewEngine({
  run: createGitRunner(),
  baselineOf: (panelId) => layoutStore.baseline(panelId),
  peersInRepo: (root, except) => layoutStore.baselinePeers(root, except)
})

// The once-only guard. Written here rather than inside PtyManager because the
// store is the thing that knows whether a baseline already exists, and a
// manager-held flag would be lost on the very reload this guard exists for.
const captureBaseline = (panelId: string, cwd: string): void => {
  if (layoutStore.baseline(panelId) !== undefined) return
  void (async () => {
    const root = await reviewEngine.resolveRepo(cwd)
    if (root === null) return
    if (layoutStore.baseline(panelId) !== undefined) return
    const sha = await reviewEngine.captureBaseline(root)
    if (sha === null) return
    layoutStore.setBaseline(panelId, { root, sha })
  })()
}
```

Pass `captureBaseline` and `(id) => layoutStore.dropBaseline(id)` as the manager's new arguments. The **second** existence check inside the async body is not redundant: two panels can spawn in the same tick and both pass the first one before either resolves.

- [ ] **Step 6: Run both suites**

Run: `npm run verify:pty-manager && npm run typecheck:node`
Expected: `27/27 passed` (25 before, plus two), exit 0; typecheck silent.

- [ ] **Step 7: Commit**

```bash
git add src/main/pty-manager.ts src/main/index.ts scripts/verify-pty-manager.cjs
git commit -m "feat(m9a): capture the baseline once, at spawn

Check 21 is the milestone. pty:create runs AGAIN for every restored panel on
a Cmd+R reload, and under tmux that call reattaches to a session that may
have worked for an hour — so a recapture there resets the baseline to 'now'
and the pane reports 'no changes' for an agent that rewrote the repository.
A wrong answer shaped exactly like a right one, which is this codebase's
defining failure mode, and 21 drives it with a real detachAll and a real
second create rather than arguing it.

The guard lives in index.ts against the STORE, not as a flag on PtyManager: a
manager-held flag is lost on precisely the reload it exists for. The second
existence check inside the async body is not redundant — two panels can
spawn in one tick and both pass the first.

Capture is fire-and-forget: a baseline must never delay or fail a spawn.
Check 22's shutdown() inherits check 20's obligation to leave this block
ending in a definite kill-server.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The `review:panel` channel

**Files:**
- Modify: `src/shared/ipc-contract.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/ipc.ts`
- Modify: `scripts/verify-ipc-surface.cjs` (the expected count, if it states one)

**Interfaces:**
- Consumes: the engine from Task 6, `ReviewResult` from Task 2.
- Produces: `IPC.REVIEW_PANEL`, `CanvasBridge.review.panel(panelId)`.

- [ ] **Step 1: Add the channel**

In `src/shared/ipc-contract.ts`, in the `IPC` object:

```ts
  /**
   * What has changed in this panel's repository since its session started.
   *
   * An invoke, and pull-only: no watcher and no push channel. The renderer
   * already holds every signal that says "now is a good moment to ask" —
   * selection changed, and M6c's agent-state transition to `idle`, which
   * means precisely "this agent stopped producing output". A push channel
   * would make main a second author of a timing decision the renderer
   * already makes correctly, the same call M6d and M7 both made and recorded.
   */
  REVIEW_PANEL: 'review:panel',
```

and in `CanvasBridge`:

```ts
  review: {
    panel(panelId: PanelId): Promise<ReviewResult>
  }
```

with `import type { ReviewResult } from './review'` at the top.

- [ ] **Step 2: Add the preload member**

In `src/preload/index.ts`, beside the existing groups:

```ts
  review: {
    panel: (panelId: PanelId) => ipcRenderer.invoke(IPC.REVIEW_PANEL, panelId)
  },
```

- [ ] **Step 3: Add the handler**

`registerIpcHandlers` gains a `reviewEngine: ReviewEngine` parameter — its own parameter rather than a `PaletteHandlers` member, the way `getBackendInfo` and `rebuildMenu` already are:

```ts
  ipcMain.handle(IPC.REVIEW_PANEL, (_event, panelId: PanelId) => reviewEngine.review(panelId))
```

Update both call sites: `src/main/index.ts`, and `scripts/panels-entry.cjs` — which must pass a real engine built over `createGitRunner()`, because `verify:panels` Task 9 drives this end to end.

- [ ] **Step 4: Run the surface check**

Run: `npm run build && npm run verify:ipc`
Expected: `1/1 passed`, covering **27** channels. If the script prints or asserts a count, update it from 26 to 27.

- [ ] **Step 5: Commit**

```bash
git add src/shared/ipc-contract.ts src/preload/index.ts src/main/ipc.ts src/main/index.ts scripts/panels-entry.cjs
git commit -m "feat(m9a): review:panel, the 27th channel

Pull, not push. The renderer already holds both signals that say when to ask
— the selection changing, and M6c's transition to idle, which means exactly
'this agent stopped producing output' — so a push channel would make main a
second author of a timing decision the renderer already makes correctly.
That is the call M6d made for the attention set and M7 made again for
workspace waiting counts, recorded at WORKSPACE_LIST's own doc comment.

reviewEngine is its own registerIpcHandlers parameter rather than a
PaletteHandlers member, the shape getBackendInfo and rebuildMenu already
have. panels-entry.cjs gets a real engine, not a stub: Task 9 drives this
channel through a real PTY in a real repository.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: `buildReviewFields`

**Files:**
- Modify: `src/renderer/shell/inspector-fields.ts`
- Modify: `scripts/verify-rail.cjs` (checks 37–44)

**Interfaces:**
- Consumes: `ReviewResult` from `@shared/review`.
- Produces: `ReviewFieldModel`, `REVIEW_FILE_CAP`, `buildReviewFields(result)`, `reviewSignature(model)`.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-rail.cjs`:

```js
// 37. not-a-repo renders NOTHING — hidden, not an error row. It is the
//     ordinary answer for a panel in the home directory, i.e. most panels,
//     and a red field on most panels most of the time trains the user to
//     ignore the section entirely.
ok(37, I.buildReviewFields({ kind: 'not-a-repo' }).hidden === true)

// 38. An absent result — the query has not answered yet — is also hidden, and
//     must not throw. Every selection change passes through this state.
ok(38, I.buildReviewFields(undefined).hidden === true)

// 39. The real answer names files and both totals, with the counts as the
//     numbers they are rather than pre-formatted text.
{
  const m = I.buildReviewFields({
    kind: 'changes', root: '/r', added: 12, removed: 3,
    files: [{ path: 'a.ts', added: 12, removed: 3, binary: false, untracked: false }]
  })
  ok(39, m.hidden === false && m.files.length === 1 &&
    m.summary.includes('1 file') && m.summary.includes('12') && m.summary.includes('3'))
}

// 40. Ten files, then a `+N more` tail. The pane is 260px wide and an
//     unbounded list turns the inspector into a scrolling surface it has
//     never been.
{
  const files = Array.from({ length: 14 }, (_, i) =>
    ({ path: `f${i}.ts`, added: 1, removed: 0, binary: false, untracked: false }))
  const m = I.buildReviewFields({ kind: 'changes', root: '/r', added: 14, removed: 0, files })
  ok(40, m.files.length === I.REVIEW_FILE_CAP && m.more === 4)
}

// 41. `shared` says the COUNT and says it cannot attribute. The files are
//     still listed — repository-level truth is still truth — so a check that
//     only asserted "files is empty" would pin the wrong design.
{
  const m = I.buildReviewFields({
    kind: 'shared', root: '/r', panelCount: 4,
    files: [{ path: 'a.ts', added: 1, removed: 0, binary: false, untracked: false }]
  })
  ok(41, m.files.length === 1 && m.note !== undefined && m.note.includes('4'))
}

// 42. baseline-lost and never-started are DIFFERENT notes. They are two
//     situations with two different fixes — "restart this panel" versus
//     "start it" — and collapsing them tells a user whose agent has been
//     running for an hour that it has not started.
{
  const lost = I.buildReviewFields({ kind: 'baseline-lost', root: '/r' })
  const never = I.buildReviewFields({ kind: 'never-started' })
  ok(42, lost.note !== undefined && never.note !== undefined && lost.note !== never.note)
}

// 43. `clean` is a VISIBLE "no changes", not hidden. Hiding it makes a panel
//     that has genuinely changed nothing indistinguishable from one the
//     feature is not working for.
{
  const m = I.buildReviewFields({ kind: 'clean', root: '/r' })
  ok(43, m.hidden === false && m.files.length === 0 && m.summary.toLowerCase().includes('no change'))
}

// 44. The signature moves on a change and is stable otherwise — the same 60Hz
//     defence inspectorSignature gives the pane's other half.
{
  const a = { kind: 'changes', root: '/r', added: 1, removed: 0,
    files: [{ path: 'a.ts', added: 1, removed: 0, binary: false, untracked: false }] }
  const b = { kind: 'changes', root: '/r', added: 2, removed: 0,
    files: [{ path: 'a.ts', added: 2, removed: 0, binary: false, untracked: false }] }
  ok(44, I.reviewSignature(I.buildReviewFields(a)) === I.reviewSignature(I.buildReviewFields(a)) &&
    I.reviewSignature(I.buildReviewFields(a)) !== I.reviewSignature(I.buildReviewFields(b)))
}
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm run verify:rail`
Expected: a throw at check 37 — `I.buildReviewFields is not a function` — which aborts 38–44. Confirm those separately after the export exists.

- [ ] **Step 3: Implement**

Append to `src/renderer/shell/inspector-fields.ts`:

```ts
import type { ReviewResult } from '@shared/review'

/** Ten, because the pane is 260px wide and this section is not a scroll host. */
export const REVIEW_FILE_CAP = 10

export interface ReviewFieldRow {
  path: string
  added: number
  removed: number
  binary: boolean
  untracked: boolean
}

export interface ReviewFieldModel {
  /** True when the section renders nothing at all. */
  hidden: boolean
  summary: string
  /** The honest arms' explanation. Absent when there is nothing to explain. */
  note?: string
  files: ReviewFieldRow[]
  /** Files beyond the cap. Zero when everything fits. */
  more: number
}

const HIDDEN: ReviewFieldModel = { hidden: true, summary: '', files: [], more: 0 }

/**
 * The Changes section, as plain data.
 *
 * `undefined` is an ordinary input, not an error: every selection change
 * passes through it while the invoke is in flight, and so does every panel
 * before the first query. `not-a-repo` is hidden for a sharper reason — it is
 * the answer for a panel in the home directory, i.e. most panels, and a
 * permanent error row on most panels teaches the user to stop reading the
 * section.
 *
 * `clean` is deliberately NOT hidden. A panel that genuinely changed nothing
 * and a panel the feature is broken for must not look the same.
 */
export function buildReviewFields(result: ReviewResult | undefined): ReviewFieldModel {
  if (result === undefined || result.kind === 'not-a-repo') return HIDDEN

  if (result.kind === 'never-started') {
    return { hidden: false, summary: 'not started', note: 'this panel has no session yet', files: [], more: 0 }
  }
  if (result.kind === 'git-missing') {
    return { hidden: false, summary: 'unavailable', note: 'no git binary was found', files: [], more: 0 }
  }
  if (result.kind === 'baseline-lost') {
    // A DIFFERENT note from never-started: two situations, two fixes. Telling
    // a user whose agent has run for an hour that it "has not started" sends
    // them to the wrong control.
    return {
      hidden: false,
      summary: 'unattributable',
      note: 'the session baseline is gone — restart the panel to start a new one',
      files: [],
      more: 0
    }
  }
  if (result.kind === 'clean') {
    return { hidden: false, summary: 'no changes', files: [], more: 0 }
  }

  const rows = result.files.slice(0, REVIEW_FILE_CAP).map((f) => ({
    path: f.path,
    added: f.added,
    removed: f.removed,
    binary: f.binary,
    untracked: f.untracked
  }))
  const more = Math.max(0, result.files.length - REVIEW_FILE_CAP)

  if (result.kind === 'shared') {
    return {
      hidden: false,
      summary: `${plural(result.files.length, 'file')} changed`,
      note: `${result.panelCount} panels share this repo — changes can't be attributed`,
      files: rows,
      more
    }
  }

  return {
    hidden: false,
    summary: `${plural(result.files.length, 'file')} changed · +${result.added} −${result.removed}`,
    files: rows,
    more
  }
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/**
 * The same 60Hz defence inspectorSignature gives the pane's other half, kept
 * as its OWN function rather than a second parameter on that one: the review
 * result arrives asynchronously and changes on a different clock from the
 * panel model, and widening the existing signature would mean revisiting
 * verify:rail 26/27, whose subject is a different fact.
 */
export function reviewSignature(model: ReviewFieldModel | null): string {
  return JSON.stringify(model)
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npm run verify:rail`
Expected: `47/47 passed` (39 before, plus eight), exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/shell/inspector-fields.ts scripts/verify-rail.cjs
git commit -m "feat(m9a): buildReviewFields, and what each honest arm says

Check 37 and check 43 are a pair and neither is obvious. not-a-repo renders
NOTHING, because it is the answer for every panel in the home directory and a
permanent error row on most panels teaches the user to stop reading the
section. clean renders 'no changes' VISIBLY, because a panel that genuinely
changed nothing and a panel the feature is broken for must not look the same.
Hiding both, or showing both, each gets one of them wrong.

42 pins baseline-lost and never-started as DIFFERENT notes: two situations
with two fixes, and collapsing them tells a user whose agent has run for an
hour that it has not started. 41 keeps shared's files listed — repository
truth is still truth — so the check cannot be satisfied by an implementation
that simply drops them.

reviewSignature is its own function rather than a parameter on
inspectorSignature: the result arrives on a different clock, and widening
the existing one would drag verify:rail 26/27 into a change about something
else.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: The section on screen, and the end-to-end proof

**Files:**
- Modify: `src/renderer/shell/Inspector.tsx`
- Modify: `src/renderer/canvas/Canvas.tsx`
- Modify: `scripts/verify-panels.cjs` (checks 99–101)
- Modify: `README.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: everything above.
- Produces: a rendered `Changes` section carrying `data-review-summary`, `data-review-note` and one `data-review-file` per row.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-panels.cjs`:

```js
// 99-101 share one fixture repository and one block.
{
  const repo = mkdtempSync(join(tmpdir(), 'tc panels review '))
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' })
  git('init', '-q', '.')
  git('config', 'user.email', 'v@example.com')
  git('config', 'user.name', 'v')
  writeFileSync(join(repo, 'seed.txt'), 'seed\n')
  git('add', '-A')
  git('commit', '-qm', 'init')

  /* Spawns through the SAME PRESET_SPAWN event check 27 uses, and returns the
     id that appeared. /bin/sh rather than the default: this block writes real
     shell commands, and Cmd+N's default here is `/bin/cat -v`, which ECHOES
     bytes rather than interpreting them — the substitution checks 54-63 and 83
     already make for the same reason. */
  const spawnInRepo = async () => {
    const before = new Set(await wc.executeJavaScript(
      `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`))
    wc.send(IPC_EVENTS.PRESET_SPAWN, { cwd: repo, command: '/bin/sh', args: [], w: 400, h: 300 })
    const ids = await waitUntil(async () => {
      const now = await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
      return now.length > before.size ? now : false
    }, 3000)
    return ids ? ids.find((id) => !before.has(id)) : undefined
  }

  /* A real sendInputEvent click, not a dispatched MouseEvent: check 75c
     records why a synthetic one proves nothing about focus, and selection
     here has to be the real thing for the inspector to follow it. */
  const selectPanel = async (id) => {
    const box = await wc.executeJavaScript(
      `(() => { const p = document.querySelector('[data-panel-id=' + ${JSON.stringify(JSON.stringify(id))} + ']');
                if (!p) return null;
                const r = p.getBoundingClientRect();
                return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 24) } })()`)
    if (!box) return false
    wc.sendInputEvent({ type: 'mouseDown', x: box.x, y: box.y, button: 'left', clickCount: 1 })
    wc.sendInputEvent({ type: 'mouseUp', x: box.x, y: box.y, button: 'left', clickCount: 1 })
    await settle()
    return true
  }

  const first = await spawnInRepo()
  // Through the REAL PTY, not from node. A file main wrote itself would prove
  // the engine works and say nothing about whether the PANEL'S cwd is what got
  // reviewed, which is the one thing this check exists for.
  if (first) ptyManager.write(first, "printf 'x' > agent.txt\n")
  await settle()
  const selected = first ? await selectPanel(first) : false

  const summary = await waitUntil(async () => {
    const text = await wc.executeJavaScript(
      `(document.querySelector('[data-review-summary]') || {}).textContent || null`)
    return text && text.includes('file') ? text : false
  }, 5000)
  const files = await wc.executeJavaScript(
    `[...document.querySelectorAll('[data-review-file]')].map((e) => e.getAttribute('data-review-file'))`)
  ok('99 the inspector names the file the panel's own agent wrote',
    selected && typeof summary === 'string' && summary.includes('1 file') &&
      files.includes('agent.txt'),
    `summary=${summary} files=${JSON.stringify(files)}`)

  // 100. A panel whose cwd is NOT a repository renders no section at all —
  //      asserted as the element being ABSENT, not as empty text, because an
  //      empty-but-present section is a visible blank gap in a 260px pane.
  //      Weak on its own: it passes vacuously before the section exists, so it
  //      is evidence only once 99 has been watched red.
  const homePanel = await wc.executeJavaScript(
    `(() => { const p = [...document.querySelectorAll('.panel')]
        .find((e) => e.getAttribute('data-panel-id') !== ${JSON.stringify(JSON.stringify(first))});
      return p ? p.getAttribute('data-panel-id') : null })()`)
  if (homePanel) await selectPanel(homePanel)
  const present = await wc.executeJavaScript(
    `document.querySelector('[data-review-summary]') !== null`)
  ok('100 no section for a panel outside a repository', homePanel !== null && present === false)

  // 101. Two panels in ONE repository report shared rather than a confident
  //      wrong attribution — the only place the mixed-checkout rule is proven
  //      against a real store, a real engine and real git rather than a fake.
  const second = await spawnInRepo()
  if (second) await selectPanel(second)
  const note = await waitUntil(async () => {
    const text = await wc.executeJavaScript(
      `(document.querySelector('[data-review-note]') || {}).textContent || null`)
    return text ? text : false
  }, 5000)
  ok('101 two panels in one repo are reported as unattributable',
    typeof note === 'string' && note.includes("can't be attributed"), `note=${note}`)
}
```

Every `querySelector` result above is guarded rather than indexed, and `ok` is reached even when a lookup returns null. That is not fussiness: a throw here aborts the run, and 100 and 101 would never execute — so their RED in the next step would not exist to be watched.

- [ ] **Step 2: Run and watch it fail**

Run: `npm run build && npm run verify:panels`
Expected: 99 and 101 FAIL (no `[data-review-summary]` in the DOM); 100 PASSES vacuously, which is exactly why it is not evidence on its own and why 99 must be red first.

- [ ] **Step 3: Render the section**

In `src/renderer/shell/Inspector.tsx`, below the existing fields:

```tsx
{review !== null && !review.hidden && (
  <section className="inspector__section">
    <h3 className="inspector__section-heading">Changes</h3>
    <p className="inspector__review-summary" data-review-summary>{review.summary}</p>
    {review.note !== undefined && (
      <p className="inspector__review-note" data-review-note>{review.note}</p>
    )}
    <ul className="inspector__review-files">
      {review.files.map((f) => (
        <li key={f.path} className="inspector__review-file" data-review-file={f.path}>
          <span className="inspector__review-path">{f.path}</span>
          <span className="inspector__review-counts">
            {f.untracked ? 'new' : f.binary ? 'bin' : `+${f.added} −${f.removed}`}
          </span>
        </li>
      ))}
    </ul>
    {review.more > 0 && <p className="inspector__review-more">+{review.more} more</p>}
  </section>
)}
```

Add the matching classes to `styles.css`, following the existing `.inspector__*` rules; the path cell needs `overflow: hidden; text-overflow: ellipsis; direction: rtl; text-align: left`, so a long path is truncated at its FRONT — the filename is the informative end.

- [ ] **Step 4: Query it from `Canvas.tsx`**

```tsx
const [review, setReview] = useState<ReviewFieldModel | null>(null)
const selectedAgentState = useAgentState(selectedId ?? '')

useEffect(() => {
  if (selectedId === null) { setReview(null); return }
  let live = true
  void bridge.review.panel(selectedId).then((result) => {
    // The guard is not defensiveness: an invoke issued for panel A can resolve
    // AFTER the user has selected panel B, and writing it then would show A's
    // changes under B's name — the wrong-panel attribution this milestone
    // exists to prevent, arriving through the renderer instead of through git.
    if (live) setReview(buildReviewFields(result))
  })
  return () => { live = false }
  // selectedAgentState is a dependency, not a stray: M6c's transition to
  // `idle` means exactly "this agent stopped producing output", which is the
  // moment its work is worth re-reading. That is why M9a needs no watcher.
}, [selectedId, selectedAgentState, bridge])
```

Memoize the Inspector's prop on `reviewSignature(review)`, beside the existing `inspectorSignature` memo.

- [ ] **Step 5: Run and watch it pass**

Run: `npm run build && npm run verify:panels`
Expected: `117/117 passed` (114 before, plus three), exit 0.

- [ ] **Step 6: Run the whole chain**

Run: `npm run verify`
Expected: every suite green, exit 0. Record the real totals from the output — do not copy the numbers in this plan, which are predictions.

- [ ] **Step 7: Update the docs**

`README.md`: add `| M9a | The review engine: what each agent changed, in the inspector | ✅ done |` to the milestone table.

`CLAUDE.md`: add a `verify:review` row to the verify table stating its real count and naming checks 21, 24, 31 and 32 by number; add `verify:review` to the plain-node justification paragraph, saying that `git-args.ts` imports nothing at all and `review-engine.ts` earns the tier by injecting its runner, with `git-runner.ts` deliberately out of reach; add a load-bearing entry titled **"The baseline is captured once, and `reattached` is why"**; and update the `verify:ipc` channel count from 26 to 27.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(m9a): the Changes section, and the end-to-end proof

Check 99 writes the file through the panel's own PTY rather than from node.
A file main wrote itself would prove the engine works and say nothing about
whether the PANEL'S cwd is what got reviewed, which is the one thing this
check exists for.

100 is deliberately recorded as weak: it passes vacuously before the section
exists, so it is only evidence once 99 has been watched red. 101 is the only
place the mixed-checkout rule is proven against a real store, a real engine
and real git rather than a fake runner.

Canvas's query carries a liveness guard, and it is not defensiveness: an
invoke issued for panel A can resolve after the user has selected panel B,
and writing it then shows A's changes under B's name — the wrong-panel
attribution this milestone exists to prevent, arriving through the renderer
rather than through git. Its agent-state dependency is the reason M9a needs
no watcher: M6c's transition to idle already means 'this agent stopped
producing output'.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
