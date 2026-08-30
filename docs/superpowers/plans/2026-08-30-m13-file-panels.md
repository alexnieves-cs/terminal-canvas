# M13: File Panels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put a local text file on the canvas as a third panel kind, read-only, watched, so it updates within about a second when an agent rewrites it.

**Architecture:** A `file` arm on the M9b `Panel` discriminated union. Main owns a `readFile` returning a union of honest states and a `FileWatchers` manager that watches the file's *directory* (surviving atomic saves) and pushes a change event. The renderer holds a per-panel-id store shaped exactly like `live-session-store.ts` and renders a `FileNode` component shaped exactly like `ReviewNode.tsx`.

**Tech Stack:** TypeScript, Electron 43.4.1, React 18 (no StrictMode), `node:fs` built-ins only — **no new npm dependency**. Verification is the repo's own `npm run verify` chain of hand-rolled `ok(...)` scripts; there is no unit-test runner and no linter.

**Spec:** `docs/superpowers/specs/2026-08-30-m13-file-panels-design.md`

## Global Constraints

- **No new runtime dependency.** `package.json` `dependencies` must stay `{"node-pty": "1.1.0"}`. Watching uses `node:fs`'s `watch`. `chokidar` is explicitly rejected.
- **Nothing in the renderer touches `fs`.** All file access is main-side, behind IPC.
- **`verify:ipc` goes 31 → 34, never 35.** Three new *invoke* channels (`file:open`, `file:read`, `file:close`). `file:changed` is an `IPC_EVENTS` member; that suite asserts over `Object.values(IPC)` only and does not count it.
- **Never write `kind === 'terminal'`** against a live `Panel`. Test positively for non-terminal kinds. (Branching on a *persisted record* in `layout-schema.ts` / `toPanels`, or on an already-built `InspectorModel.kind`, is exempt — those are not live `Panel`s.)
- **The new store must never bump `registry.version()`.**
- **Caps, copied verbatim:** `FILE_MAX_BYTES = 2 * 1024 * 1024`, `FILE_MAX_LINES = 10_000`, `BINARY_SCAN_BYTES = 8 * 1024`, `WATCH_DEBOUNCE_MS = 100`, `FILE_W = 640`, `FILE_H = 520`.
- **Every failure gets its own named arm with its own sentence.** Never a blank panel.
- **Commit style:** conventional, scoped `feat(m13):` / `fix(m13):` / `test(m13):`, ending with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- **Comments explain *why*.** Match the surrounding density. A non-obvious line with no reason attached will be "fixed" by someone later.
- **A check that THROWS aborts its whole suite**, so every check after it never runs and its RED is not evidence. Guard calls that may not exist yet (`if (row) row.run()`), and when watching a test fail, note which later checks the throw prevented from running.
- Run `npm run typecheck` before every commit; run the specific suite named in the task.

---

## File Structure

**Create:**
- `src/shared/file-panel.ts` — the `FileSource` / `FileResult` types and the caps. Shared because main produces them and the renderer renders them.
- `src/main/file-read.ts` — `readFile(path): FileResult`. Pure over the filesystem, plain-node testable.
- `src/main/file-watch.ts` — `FileWatchers`, a directory-watching, debouncing, content-hashing manager keyed by `PanelId`.
- `src/renderer/session/file-store.ts` — the per-panel-id renderer cache of main's answer.
- `src/renderer/file/file-node-model.ts` — pure view model over `FileResult`.
- `src/renderer/file/FileNode.tsx` — the component.
- `scripts/verify-file.cjs` + `scripts/file-entry.cjs` — the new plain-node suite.

**Modify:**
- `src/shared/layout-schema.ts` — `PersistedFilePanel`, `parseFileSource`, the `parsePanel` branch.
- `src/renderer/panels/panels.ts` — `FilePanel`, `isFilePanel`, `isTerminalPanel`, `makeFilePanel`, `FILE_W/H`.
- `src/renderer/panels/layout-adapt.ts` — arms in `toPanels` / `fromPanels`.
- `src/shared/ipc-contract.ts` — three `IPC` members, one `IPC_EVENTS` member, the `file` bridge group.
- `src/preload/index.ts` — the bridge implementation.
- `src/main/ipc.ts` — three handlers; `registerIpcHandlers` gains two appended parameters.
- `src/main/index.ts` — construct `FileWatchers`, wire the teardown seams.
- `src/renderer/canvas/Canvas.tsx` — the partition, the guards, the reseed regexes, the subscription, the doors, the render arm.
- `src/renderer/shell/rail-rows.ts`, `src/renderer/shell/inspector-fields.ts` — the `file` arms.
- `src/renderer/palette/commands.ts` — the `Open file…` row.
- `src/renderer/styles.css` — the file-node styles (tokens only; `verify:styles` forbids literal colours).
- `package.json` — the `verify:file` script and its place in the chain.
- `scripts/verify-layout.cjs`, `scripts/verify-viewport.cjs`, `scripts/verify-rail.cjs`, `scripts/verify-ipc-surface.cjs`, `scripts/verify-panels.cjs` — new checks.
- `README.md`, `CLAUDE.md` — the milestone row and the decision log.

---

### Task 1: The shared types and caps

**Files:**
- Create: `src/shared/file-panel.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `FileSource`, `FileResult`, `FileChangedEvent`, `FILE_MAX_BYTES`, `FILE_MAX_LINES`, `BINARY_SCAN_BYTES`. Every later task imports from here.

- [ ] **Step 1: Create the file**

```ts
/**
 * A local file shown on the canvas, and what main found when it read it.
 *
 * Shared because main produces a FileResult and the renderer renders one.
 * Deliberately NOT folded into shared/review.ts: the two share a shape (a
 * union of honest states) and nothing else, and merging them would make a
 * change to one able to break the other.
 */

/**
 * What a file panel points at.
 *
 * An ABSOLUTE path. `~` is expanded by main before this is ever built, the
 * same rule `resolveCwd` already applies to a panel's cwd: the renderer has no
 * `process.env` (electron-vite compiles it to a literal `{}`), so it cannot
 * know the home directory and must never try to guess one.
 *
 * A path and not an inode. A file that is renamed or moved reads as `missing`
 * rather than being followed — see the spec's known limitations. Following a
 * rename means tracking an inode, which is a much larger feature and one that
 * would sometimes follow the wrong file.
 */
export interface FileSource {
  path: string
}

/**
 * Every state a read can land in, each with its own arm.
 *
 * The shape ReviewResult established, for the reason it established it:
 * collapsing any two of these produces a panel that is blank for four
 * different reasons, and a blank panel is indistinguishable from a broken one.
 * `missing` in particular must NOT close the panel — a panel silently
 * vanishing from the canvas is the "a missing feature is indistinguishable
 * from a bug" failure this codebase designs against everywhere else.
 */
export type FileResult =
  | {
      kind: 'text'
      /** Already truncated to FILE_MAX_LINES. */
      content: string
      bytes: number
      /** Lines in the FILE, not in `content` — the two differ when truncated. */
      lines: number
      /**
       * Lines dropped by the render cap. Reported rather than silently
       * omitted: a list that just stops is a list that lies about being
       * complete, the rule parseDiffLines already follows.
       */
      truncatedLines: number
      mtimeMs: number
    }
  | { kind: 'missing' }
  | { kind: 'too-large'; bytes: number; cap: number }
  | { kind: 'binary'; bytes: number }
  | { kind: 'unreadable'; detail: string }

/**
 * Caps, not preferences, and the reason is prompts.ts's reason: the path is
 * whatever the user pointed a panel at, so both the size and the content are
 * attacker-shaped inputs in the ordinary case of "I opened a file in a repo I
 * just cloned".
 *
 * The two are separate numbers on purpose. FILE_MAX_BYTES is a READ cap and
 * refuses outright (prompts.ts's "skipped, never truncated" rule — half a file
 * is a different file). FILE_MAX_LINES is a RENDER cap and truncates while
 * reporting the remainder, because a 2MB single-line minified bundle is under
 * the byte cap and would still lock the renderer laying it out.
 */
export const FILE_MAX_BYTES = 2 * 1024 * 1024
export const FILE_MAX_LINES = 10_000

/**
 * How far in to look for a NUL before calling a file binary.
 *
 * Bounded rather than whole-file because the answer is almost always in the
 * first block, and scanning 2MB for a byte we will not find costs the read
 * twice. A text file whose only NUL is past this boundary reads as text —
 * a deliberate false negative, and the safe direction: rendering a mostly-text
 * file with one replacement character is better than refusing it.
 */
export const BINARY_SCAN_BYTES = 8 * 1024
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (nothing imports this yet; this proves the file compiles).

- [ ] **Step 3: Commit**

```bash
git add src/shared/file-panel.ts
git commit -m "feat(m13): the file panel's shared types and caps

Two separate caps on purpose. FILE_MAX_BYTES refuses outright, the
'skipped, never truncated' rule prompts.ts already states (half a file
is a different file). FILE_MAX_LINES truncates AND reports the
remainder, because a 2MB single-line minified bundle passes the byte
cap and would still lock the renderer laying it out.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `readFile` and its suite

**Files:**
- Create: `src/main/file-read.ts`
- Create: `scripts/file-entry.cjs`, `scripts/verify-file.cjs`
- Modify: `package.json` (add `verify:file`, insert into the `verify` chain after `verify:review`)

**Interfaces:**
- Consumes: `FileResult`, `FILE_MAX_BYTES`, `FILE_MAX_LINES`, `BINARY_SCAN_BYTES` from Task 1.
- Produces: `readFile(path: string): FileResult`.

> `file-read.ts` stays in the plain-node verify tier. It imports `node:fs`, and that does **not** move a module out of that tier — `main/prompts.ts` is the precedent. What moves a module out is importing `electron` or `node-pty`.

- [ ] **Step 1: Write the failing suite**

Create `scripts/file-entry.cjs`:

```js
/* esbuild entry for verify:file. Re-exports the two main-side modules the
   suite drives. Mirrors scripts/rail-entry.cjs. */
module.exports = {
  ...require('../src/main/file-read.ts'),
  ...require('../src/main/file-watch.ts')
}
```

> `file-watch.ts` does not exist until Task 3. **Create a placeholder now** so this bundle builds:
> `printf 'export {}\n' > src/main/file-watch.ts`

Create `scripts/verify-file.cjs`:

```js
/* Verifies main's file reading and watching.
   Run with: npm run verify:file

   Plain node, like verify:review and verify:rail: file-read.ts and
   file-watch.ts import node:fs but neither electron nor node-pty, and
   node:fs is not what moves a module out of this tier — main/prompts.ts
   is the standing precedent for exactly that.

   The temp directory has a SPACE in it, deliberately. This repo's most
   expensive silent bug (the pane-died redirect) shipped through eight
   reviews because every fixture used a space-free path. */
const { buildSync } = require('esbuild')
const { join } = require('node:path')
const { mkdtempSync, writeFileSync, renameSync, rmSync, mkdirSync } = require('node:fs')
const { tmpdir } = require('node:os')

const OUT = join(__dirname, '..', 'out', 'verify', 'file.cjs')
buildSync({
  entryPoints: [join(__dirname, 'file-entry.cjs')],
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['node:fs', 'node:path', 'node:crypto'],
  alias: {
    '@shared': join(__dirname, '..', 'src', 'shared'),
    '@renderer': join(__dirname, '..', 'src', 'renderer')
  }
})
const F = require(OUT)

const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`)
}

const DIR = mkdtempSync(join(tmpdir(), 'tc file '))
const p = (name) => join(DIR, name)

;(async () => {
  // 1 — the ordinary case.
  writeFileSync(p('a.txt'), 'one\ntwo\nthree\n')
  const r1 = F.readFile(p('a.txt'))
  ok(1, r1.kind === 'text' && r1.content === 'one\ntwo\nthree\n' && r1.bytes === 14 && r1.lines === 4 && r1.truncatedLines === 0,
    `1 — an ordinary file reads as text: kind=${r1.kind} bytes=${r1.bytes} lines=${r1.lines}`)

  // 2 — missing. Its own arm, never an empty string: "this file is gone" and
  // "this file is empty" are two different sentences.
  const r2 = F.readFile(p('nope.txt'))
  ok(2, r2.kind === 'missing', `2 — a path that does not exist reads as missing: kind=${r2.kind}`)

  // 3 — BOTH ends of the byte cap. A bound written with the wrong comparison
  // passes a one-sided check, which is why the at-the-cap half is here.
  writeFileSync(p('big.txt'), 'x'.repeat(F.FILE_MAX_BYTES + 1))
  writeFileSync(p('atcap.txt'), 'x'.repeat(F.FILE_MAX_BYTES))
  const r3a = F.readFile(p('big.txt'))
  const r3b = F.readFile(p('atcap.txt'))
  ok(3, r3a.kind === 'too-large' && r3a.cap === F.FILE_MAX_BYTES && r3b.kind === 'text',
    `3 — the byte cap refuses over and accepts at: over=${r3a.kind} at=${r3b.kind}`)

  // 4 — binary, and the boundary the scan actually draws. The second clause is
  // the one that matters: a NUL PAST the scan window must still read as text,
  // or the check says nothing about where the window is.
  writeFileSync(p('bin.dat'), Buffer.concat([Buffer.from('hi'), Buffer.from([0]), Buffer.from('there')]))
  writeFileSync(p('late.txt'), Buffer.concat([Buffer.alloc(F.BINARY_SCAN_BYTES, 0x61), Buffer.from([0])]))
  const r4a = F.readFile(p('bin.dat'))
  const r4b = F.readFile(p('late.txt'))
  ok(4, r4a.kind === 'binary' && r4b.kind === 'text',
    `4 — a NUL inside the scan window is binary, one past it is not: early=${r4a.kind} late=${r4b.kind}`)

  // 5 — a directory is unreadable WITH a detail, not missing. Two different
  // situations with two different fixes.
  mkdirSync(p('adir'))
  const r5 = F.readFile(p('adir'))
  ok(5, r5.kind === 'unreadable' && typeof r5.detail === 'string' && r5.detail.length > 0,
    `5 — a directory is unreadable and carries a detail: kind=${r5.kind} detail=${JSON.stringify(r5.detail)}`)

  // 6 — the render cap truncates AND reports. Asserted on truncatedLines as a
  // NUMBER, never on rendered text: a check that matched a "+N more" string
  // would be a copy check, and would go red for a rewording.
  writeFileSync(p('long.txt'), Array.from({ length: F.FILE_MAX_LINES + 25 }, (_, i) => `l${i}`).join('\n'))
  const r6 = F.readFile(p('long.txt'))
  ok(6, r6.kind === 'text'
      && r6.content.split('\n').length === F.FILE_MAX_LINES
      && r6.truncatedLines === 25
      && r6.lines === F.FILE_MAX_LINES + 25,
    `6 — the render cap truncates and reports the remainder: rendered=${r6.kind === 'text' ? r6.content.split('\n').length : '-'} truncated=${r6.truncatedLines} total=${r6.lines}`)

  console.log('')
  const failed = results.filter((r) => !r.pass)
  console.log(`${results.length - failed.length}/${results.length} passed`)
  rmSync(DIR, { recursive: true, force: true })
  process.exit(failed.length === 0 ? 0 : 1)
})()
```

Add to `package.json` `scripts`, after the `verify:review` line:

```json
"verify:file": "node scripts/verify-file.cjs",
```

and insert `&& npm run verify:file` into the `verify` chain immediately after `npm run verify:review`.

- [ ] **Step 2: Watch it fail**

Run: `npm run verify:file`
Expected: FAIL. The bundle builds (the placeholder `file-watch.ts` exists) but `F.readFile` is not a function, so **check 1 throws and the process ends there** — checks 2–6 never run. That is expected; their RED is established in Step 4 by watching them go green from a genuine absence rather than from an abort. Record that the throw prevented 2–6 from running.

- [ ] **Step 3: Implement**

Create `src/main/file-read.ts`:

```ts
import { readFileSync, statSync } from 'node:fs'
import {
  BINARY_SCAN_BYTES,
  FILE_MAX_BYTES,
  FILE_MAX_LINES,
  type FileResult
} from '@shared/file-panel'

/**
 * Read one file, and say honestly what happened.
 *
 * Synchronous, and that is a considered choice rather than laziness. Every
 * other filesystem read in main is synchronous (prompts.ts, layout-store.ts),
 * the reads are bounded by FILE_MAX_BYTES, and they are driven either by an
 * invoke the renderer is already awaiting or by a debounced watch event — not
 * by a tick. If a future change puts this on a hot path, the fix is an async
 * read, not a smaller cap.
 *
 * NEVER throws. Every failure is an arm. A throw here would cross the IPC
 * boundary as a rejected invoke, and the component's `.catch` would render
 * `unreadable` with a stringified Error — the right arm reached by the wrong
 * road, and one that loses the errno on the way.
 */
export function readFile(path: string): FileResult {
  let bytes: number
  try {
    const stat = statSync(path)
    // Checked BEFORE the read, not after: readFileSync on a directory throws
    // EISDIR on Linux and returns nonsense on some platforms, and this way the
    // arm is chosen by a fact rather than by an error message.
    if (!stat.isFile()) return { kind: 'unreadable', detail: 'not a regular file' }
    bytes = stat.size
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException).code
    // ENOENT is the ordinary case — a file an agent has not written yet, or
    // one it just deleted — and it has its own arm so the panel can say so
    // and stay open. Everything else is a genuine problem and carries its
    // own detail, because EACCES and ELOOP have different fixes.
    if (code === 'ENOENT') return { kind: 'missing' }
    return { kind: 'unreadable', detail: String(error) }
  }

  // Refused, never truncated. prompts.ts's rule: half a file is a different
  // file, and a viewer that silently shows the first 2MB of a 30MB log is
  // making a claim it cannot support.
  if (bytes > FILE_MAX_BYTES) return { kind: 'too-large', bytes, cap: FILE_MAX_BYTES }

  let buf: Buffer
  try {
    buf = readFileSync(path)
  } catch (error: unknown) {
    // A file can vanish between the stat and the read — the whole point of
    // this feature is that something else is writing it.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'missing' }
    return { kind: 'unreadable', detail: String(error) }
  }

  // Bounded scan. A NUL past the window reads as text: a deliberate false
  // negative, and the safe direction — one replacement character in a mostly
  // text file beats refusing to show it at all.
  const scanTo = Math.min(buf.length, BINARY_SCAN_BYTES)
  for (let i = 0; i < scanTo; i++) {
    if (buf[i] === 0) return { kind: 'binary', bytes }
  }

  const all = buf.toString('utf8')
  const allLines = all.split('\n')
  const lines = allLines.length
  const truncatedLines = Math.max(0, lines - FILE_MAX_LINES)
  // Truncate and REPORT. The remainder is a number on the result, not a
  // sentence spliced into the content: the renderer composes the text, the
  // same division Command.waiting and RailRow.waiting already keep.
  const content = truncatedLines === 0 ? all : allLines.slice(0, FILE_MAX_LINES).join('\n')

  let mtimeMs = 0
  try {
    mtimeMs = statSync(path).mtimeMs
  } catch {
    // Vanished between the read and here. The content in hand is still real,
    // so report it; only the timestamp is lost.
  }
  return { kind: 'text', content, bytes, lines, truncatedLines, mtimeMs }
}
```

- [ ] **Step 4: Watch it pass**

Run: `npm run verify:file`
Expected: `6/6 passed`. Confirm checks 2–6 now execute (they were unreachable in Step 2).

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/shared/file-panel.ts src/main/file-read.ts src/main/file-watch.ts scripts/file-entry.cjs scripts/verify-file.cjs package.json
git commit -m "feat(m13): readFile, and the suite that pins its five arms

Never throws — every failure is an arm. A throw would cross IPC as a
rejected invoke and the component's .catch would render 'unreadable'
with a stringified Error: the right arm reached by the wrong road,
losing the errno on the way.

Two checks are worth knowing by number. 3 asserts BOTH ends of the byte
cap, because a bound written with the wrong comparison passes a
one-sided check. 4's second clause is the whole of 4: a NUL PAST the
scan window must still read as text, or the check says nothing about
where the window is.

The temp directory carries a SPACE, the rule this repo learned from the
pane-died redirect bug shipping through eight reviews on space-free
fixtures.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `FileWatchers` — the directory watch

**Files:**
- Modify: `src/main/file-watch.ts` (replacing the Task 2 placeholder)
- Modify: `scripts/verify-file.cjs` (checks 7–10)

**Interfaces:**
- Consumes: `readFile` from Task 2, `FileResult` from Task 1.
- Produces: `WATCH_DEBOUNCE_MS`, `class FileWatchers { watch(panelId: string, path: string, onChange: (result: FileResult) => void): FileResult; close(panelId: string): void; closeAll(): void; count(): number }`.

> `watch()` **returns the first read** as well as arming. One call, one answer, no window in which the panel is armed but blank.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-file.cjs`, before the summary block:

```js
  // A tiny promise helper: resolve on the next change, or null after ms.
  const nextChange = (calls, ms) => new Promise((resolve) => {
    const started = calls.length
    const t = setInterval(() => {
      if (calls.length > started) { clearInterval(t); clearTimeout(k); resolve(calls[calls.length - 1]) }
    }, 20)
    const k = setTimeout(() => { clearInterval(t); resolve(null) }, ms)
  })

  const watchers = new F.FileWatchers()

  // 7 — THE CHECK THIS MILESTONE EXISTS FOR: the atomic-rename survival.
  // Agents and editors do not write in place; they write a temp file and
  // rename() it over the target, which replaces the inode. fs.watch bound to
  // the FILE path stays bound to the dead inode and never fires again — the
  // panel goes permanently stale showing pre-agent content, with no error,
  // looking exactly like a watcher that was never wired up. This fails against
  // that obvious implementation and is the only check in the repo that would.
  writeFileSync(p('watched.txt'), 'before\n')
  const calls7 = []
  const first = watchers.watch('f1', p('watched.txt'), (r) => calls7.push(r))
  ok(7.0, first.kind === 'text' && first.content === 'before\n',
    `7.0 — watch() returns the first read, so there is no armed-but-blank window: kind=${first.kind}`)
  writeFileSync(p('watched.tmp'), 'after\n')
  renameSync(p('watched.tmp'), p('watched.txt'))
  const c7 = await nextChange(calls7, 3000)
  ok(7, c7 !== null && c7.kind === 'text' && c7.content === 'after\n',
    `7 — an ATOMIC write (temp + rename) still fires: ${c7 === null ? 'no event' : c7.content.trim()}`)

  // 8 — the dedupe. A write that does not change the content produces NO
  // event. The window spans several debounce periods deliberately, for the
  // reason verify:pty-manager 23's window does: a sample too short sees the
  // same thing under either implementation and stays green against the defect.
  const calls8 = []
  watchers.close('f1')
  writeFileSync(p('dedupe.txt'), 'same\n')
  watchers.watch('f2', p('dedupe.txt'), (r) => calls8.push(r))
  writeFileSync(p('dedupe.txt'), 'same\n')
  writeFileSync(p('dedupe.txt'), 'same\n')
  const c8 = await nextChange(calls8, 1500)
  ok(8, c8 === null && calls8.length === 0,
    `8 — rewriting identical content pushes nothing: events=${calls8.length}`)

  // 9 — deletion is an EVENT, not silence, and it is `missing` rather than an
  // empty read. The panel has to be told, or it goes on showing content for a
  // file that is gone.
  const calls9 = []
  writeFileSync(p('doomed.txt'), 'here\n')
  watchers.watch('f3', p('doomed.txt'), (r) => calls9.push(r))
  rmSync(p('doomed.txt'))
  const c9 = await nextChange(calls9, 3000)
  ok(9, c9 !== null && c9.kind === 'missing',
    `9 — deleting the file pushes missing: ${c9 === null ? 'no event' : c9.kind}`)

  // 10 — closeAll() really disarms. Asserted by WRITING after the close and
  // observing nothing, never by reading an internal count alone: a count that
  // went to zero while the FSWatcher stayed alive is exactly the leak this
  // guards, and it is what a Cmd+R reload would do once per file panel,
  // forever, in a main process the reload does not restart.
  const calls10 = []
  writeFileSync(p('after-close.txt'), 'v1\n')
  watchers.watch('f4', p('after-close.txt'), (r) => calls10.push(r))
  watchers.closeAll()
  writeFileSync(p('after-close.txt'), 'v2\n')
  const c10 = await nextChange(calls10, 1500)
  ok(10, c10 === null && watchers.count() === 0,
    `10 — closeAll disarms: events=${calls10.length} count=${watchers.count()}`)
```

- [ ] **Step 2: Watch it fail**

Run: `npm run verify:file`
Expected: FAIL. `F.FileWatchers` is not a constructor, so **check 7.0 throws and 7–10 never run**. Record that; their RED arrives in Step 4.

- [ ] **Step 3: Implement**

Replace `src/main/file-watch.ts`:

```ts
import { watch, type FSWatcher } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, dirname } from 'node:path'
import type { FileResult } from '@shared/file-panel'
import { readFile } from './file-read'

/**
 * How long to wait after a filesystem event before re-reading.
 *
 * Not politeness. One logical save emits SEVERAL fs.watch events — macOS
 * delivers 'rename' then 'change' for a temp-and-rename — and an agent writing
 * a large file in chunks emits one per chunk. Without a debounce that is one
 * full read and one IPC message per chunk.
 *
 * 100ms is comfortably above a burst and comfortably under the spec's
 * one-second bar, so it costs nothing a user can perceive.
 */
export const WATCH_DEBOUNCE_MS = 100

interface Entry {
  watcher: FSWatcher
  path: string
  base: string
  timer: NodeJS.Timeout | undefined
  hash: string
  onChange: (result: FileResult) => void
}

/**
 * One watch per open file panel, keyed by panel id.
 *
 * THE WATCH IS ON dirname(path), FILTERED TO basename(path) — never on the
 * file path itself, and this is the single most important line in the
 * milestone.
 *
 * Agents and editors do not write files in place. They write a temporary file
 * and rename() it over the target, which replaces the inode. `fs.watch(path)`
 * stays bound to the OLD inode: it fires once for the initial truncate, or not
 * at all, and then never again. The panel goes permanently stale showing
 * content from before the agent's first write, with no error anywhere — which
 * looks exactly like a watcher that was never wired up, so a fix would be
 * aimed at the wrong place entirely.
 *
 * Watching the directory survives the rename, and delivers deletion and
 * re-creation for free, which the `missing` arm needs anyway.
 *
 * node:fs's own `watch`, not chokidar: `dependencies` is one entry
 * ({"node-pty": "1.1.0"}) and a second runtime dependency would buy nothing
 * this design needs.
 */
export class FileWatchers {
  private readonly entries = new Map<string, Entry>()

  /**
   * Arm a watch AND return the first read.
   *
   * One call rather than two, so there is no window in which main is watching
   * and the renderer has nothing to render. It also seeds `hash`, which is
   * what makes the very first change event a real change rather than a
   * duplicate of the content the panel is already showing.
   */
  watch(panelId: string, path: string, onChange: (result: FileResult) => void): FileResult {
    // Re-arming at the same id replaces rather than stacks: a component that
    // remounts (a workspace switch back, a React re-key) must not leave the
    // previous FSWatcher alive with a stale callback.
    this.close(panelId)

    const result = readFile(path)
    const base = basename(path)
    let watcher: FSWatcher
    try {
      watcher = watch(dirname(path), { persistent: false }, (_event, changed) => {
        // `changed` is null on some platforms/events. Treating null as "might
        // be ours" is the safe direction: a spurious re-read is deduped by the
        // hash below and costs one bounded read, while ignoring it could miss
        // the only notification this file ever gets.
        if (changed !== null && changed !== base) return
        this.schedule(panelId)
      })
    } catch (error: unknown) {
      // An unwatchable directory is not a reason to have no panel. The read
      // above already succeeded or already has its own arm; the panel simply
      // will not update on its own, and its refresh control still works.
      console.warn(`[file-watch] could not watch ${dirname(path)}:`, error)
      return result
    }
    // persistent: false — a watcher must never hold the app open, the same
    // reason PtyManager unref()s its two ticks.
    this.entries.set(panelId, {
      watcher,
      path,
      base,
      timer: undefined,
      hash: hashOf(result),
      onChange
    })
    return result
  }

  private schedule(panelId: string): void {
    const entry = this.entries.get(panelId)
    if (entry === undefined) return
    if (entry.timer !== undefined) clearTimeout(entry.timer)
    entry.timer = setTimeout(() => {
      entry.timer = undefined
      // Re-read the map: close() may have run inside the debounce window, and
      // pushing to a closed panel's callback is a message about a panel the
      // renderer no longer has.
      const current = this.entries.get(panelId)
      if (current === undefined) return
      const result = readFile(current.path)
      const hash = hashOf(result)
      // The dedupe, and it is the design rather than an optimisation — the
      // rule applyEvent already follows for agent state. Undeduped this is a
      // message per filesystem event describing a fact that did not change,
      // and its failure is INVISIBLE: no pixel is wrong, it shows up as heat.
      if (hash === current.hash) return
      current.hash = hash
      current.onChange(result)
    }, WATCH_DEBOUNCE_MS)
  }

  close(panelId: string): void {
    const entry = this.entries.get(panelId)
    if (entry === undefined) return
    if (entry.timer !== undefined) clearTimeout(entry.timer)
    entry.watcher.close()
    this.entries.delete(panelId)
  }

  /**
   * Every watch, gone.
   *
   * Called from renderer navigation and before-quit — the same two seams
   * window-lifecycle.ts already covers for PTYs. Without the first, every
   * Cmd+R leaks one FSWatcher per open file panel, forever, in a main process
   * the reload does not restart: the abandoned-handle bug window-lifecycle.ts
   * exists to fix, in a new resource.
   */
  closeAll(): void {
    for (const panelId of [...this.entries.keys()]) this.close(panelId)
  }

  /** For verification only — how many watches are armed. */
  count(): number {
    return this.entries.size
  }
}

/**
 * Hashed over the WHOLE result, not just the content, so a text file becoming
 * `missing` is a change (check 9) and so is a file crossing the byte cap. A
 * content-only hash would make both of those silent.
 */
function hashOf(result: FileResult): string {
  return createHash('sha1').update(JSON.stringify(result)).digest('hex')
}
```

- [ ] **Step 4: Watch it pass**

Run: `npm run verify:file`
Expected: `10/10 passed`. Confirm 7–10 now execute.

- [ ] **Step 5: Prove check 7 is not vacuous**

Temporarily change `watch(dirname(path), …)` to `watch(path, …)` and drop the `changed !== base` filter. Run `npm run verify:file`.
Expected: **check 7 goes RED** (`no event`) while 1–6 stay green. Revert the change and confirm `10/10` again. This is the fault injection that makes the check evidence rather than decoration — record the observed output in the commit message.

- [ ] **Step 6: Typecheck and commit**

```bash
npm run typecheck
git add src/main/file-watch.ts scripts/verify-file.cjs
git commit -m "feat(m13): FileWatchers — watch the DIRECTORY, not the file

The single most important line in the milestone. Agents write
temp-then-rename(), which replaces the inode; fs.watch bound to the FILE
path stays bound to the dead one and never fires again. The panel goes
permanently stale showing pre-agent content with no error anywhere,
which looks exactly like a watcher that was never wired up — so a fix
would be aimed at the wrong place. Watching dirname() filtered to the
basename survives it, and gives delete and re-create for free.

Check 7 is the only check in the repo that would ever notice. Fault
injected against watch(path): 7 goes RED reporting 'no event' while 1-6
stay green.

Check 8's window spans several debounce periods for verify:pty-manager
23's reason — a sample too short sees the same thing under either
implementation. Check 10 asserts by WRITING after the close, not by
reading a count: a count at zero with a live FSWatcher is precisely the
Cmd+R leak it guards.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The panel kind — model and disk format

**Files:**
- Modify: `src/renderer/panels/panels.ts`
- Modify: `src/shared/layout-schema.ts`
- Modify: `src/renderer/panels/layout-adapt.ts`
- Modify: `scripts/verify-viewport.cjs` (checks 79–80), `scripts/verify-layout.cjs` (checks 109–112)

**Interfaces:**
- Consumes: `FileSource` from Task 1.
- Produces: `FilePanel`, `isFilePanel(panel): panel is FilePanel`, `isTerminalPanel(panel): panel is TerminalPanel`, `makeFilePanel(id, centre, z, source, size?): FilePanel`, `FILE_W`, `FILE_H`, `PersistedFilePanel`.

- [ ] **Step 1: Write the failing checks**

In `scripts/verify-viewport.cjs`, append (adjust the `V.` namespace to match how the file already imports `panels.ts`):

```js
// 79 — makeFilePanel centres exactly, the contract makePanel has (check 48).
{
  const f = V.makeFilePanel('f1', { x: 100, y: 200 }, 3, { path: '/tmp/a.txt' })
  ok(79, f.kind === 'file'
      && f.rect.x === 100 - V.FILE_W / 2 && f.rect.y === 200 - V.FILE_H / 2
      && f.rect.w === V.FILE_W && f.rect.h === V.FILE_H && f.z === 3,
    `79 — makeFilePanel centres on the point it is given: x=${f.rect.x} y=${f.rect.y}`)
}
// 80 — the source is carried VERBATIM and the object is not the same reference.
// makeReviewPanel's own comment warns about the copy-paste that rewrites a
// payload field with the minted id; this is that rule inherited. The
// not-same-reference clause matters because the caller's object may be reused.
{
  const src = { path: '/tmp/b.txt' }
  const f = V.makeFilePanel('f2', { x: 0, y: 0 }, 1, src)
  ok(80, f.source.path === '/tmp/b.txt' && f.source !== src
      && !('panelId' in f.source) && Object.keys(f.source).length === 1,
    `80 — makeFilePanel carries source verbatim without rewriting it: ${JSON.stringify(f.source)}`)
}
// 80b — isTerminalPanel is the POSITIVE partition test, and its whole job is
// the two clauses that are not about terminals: a file panel and a review
// panel must BOTH answer false. A helper written as !isReviewPanel passes
// every terminal clause and lands a file panel in assignTiers with no spec.
{
  const t = V.makePanel('n1', { x: 0, y: 0 }, 1)
  const f = V.makeFilePanel('f3', { x: 0, y: 0 }, 1, { path: '/tmp/c' })
  const r = V.makeReviewPanel('r1', { x: 0, y: 0 }, 1,
    { subjectId: 'n1', repoRoot: '/r', baselineSha: 'abc', label: 'x' })
  // A pre-M9b panel: no `kind` key at all. It must still read as terminal.
  const legacy = { rect: { id: 'n9', x: 0, y: 0, w: 1, h: 1 }, z: 1, spec: { panelId: 'n9', cwd: '~', args: [] } }
  ok('80b', V.isTerminalPanel(t) === true && V.isTerminalPanel(f) === false
      && V.isTerminalPanel(r) === false && V.isTerminalPanel(legacy) === true
      && V.isFilePanel(f) === true && V.isFilePanel(t) === false,
    `80b — isTerminalPanel excludes BOTH non-terminal kinds and still admits a kind-less panel`)
}
```

In `scripts/verify-layout.cjs`, append:

```js
// 109 — a file panel round-trips with its whole source.
{
  const { layout, warnings } = L.parseLayout(JSON.stringify({
    version: 1,
    panels: [{ id: 'f1', kind: 'file', x: 1, y: 2, w: 640, h: 520, z: 3, source: { path: '/tmp/a b/c.txt' } }]
  }))
  const p = layout.panels[0]
  ok(109, layout.panels.length === 1 && p.kind === 'file' && p.source.path === '/tmp/a b/c.txt' && warnings.length === 0,
    `109 — a file panel parses with its whole source: ${JSON.stringify(p)}`)
}
// 110 — a malformed source drops that panel ALONE, with a warning. The
// individual-drop rule parseLayout obeys everywhere else; its neighbour
// surviving is the half that says "alone".
{
  const { layout, warnings } = L.parseLayout(JSON.stringify({
    version: 1,
    panels: [
      { id: 'f1', kind: 'file', x: 0, y: 0, w: 640, h: 520, z: 1, source: { path: 42 } },
      { id: 'n1', x: 0, y: 0, w: 720, h: 460, z: 2, cwd: '~', args: [] }
    ]
  }))
  ok(110, layout.panels.length === 1 && layout.panels[0].id === 'n1' && warnings.length === 1,
    `110 — a malformed source drops that panel alone: kept=${layout.panels.map((p) => p.id).join(',')} warnings=${warnings.length}`)
}
// 111 — the two rules that must NOT have moved. Absent kind is still terminal
// (every pre-M9b file), and a present unknown kind is still dropped. Adding an
// arm above the unknown-kind drop is exactly the edit that could break either.
{
  const { layout, warnings } = L.parseLayout(JSON.stringify({
    version: 1,
    panels: [
      { id: 'n1', x: 0, y: 0, w: 720, h: 460, z: 1, cwd: '~', args: [] },
      { id: 'w1', kind: 'whiteboard', x: 0, y: 0, w: 720, h: 460, z: 2 }
    ]
  }))
  ok(111, layout.panels.length === 1 && layout.panels[0].kind === undefined
      && warnings.some((w) => w.includes('whiteboard')),
    `111 — absent kind is still terminal and an unknown kind is still dropped`)
}
// 112 — the SAME union survives layout-adapt's round trip, the other door onto
// this format and the one a schema-only check cannot see. The fromPanels arm
// must write no cwd key AT ALL — `cwd: undefined` fails its own parse next
// launch, losing the panel on every relaunch, silently.
{
  const panels = A.toPanels([
    { id: 'f1', kind: 'file', x: 1, y: 2, w: 640, h: 520, z: 3, source: { path: '/tmp/x.txt' }, title: 'notes' }
  ])
  const back = A.fromPanels(panels)
  ok(112, panels[0].kind === 'file' && panels[0].source.path === '/tmp/x.txt'
      && back[0].kind === 'file' && back[0].source.path === '/tmp/x.txt'
      && back[0].title === 'notes' && !('cwd' in back[0]) && !('args' in back[0]),
    `112 — a file panel survives toPanels/fromPanels with no cwd key: ${JSON.stringify(back[0])}`)
}
```

- [ ] **Step 2: Watch them fail**

Run: `npm run verify:viewport` then `npm run verify:layout`
Expected: both FAIL. `V.makeFilePanel` is not a function, so viewport check 79 **throws** and 80/80b never run; layout 109 fails on the parse. Record which checks the throw prevented.

- [ ] **Step 3: Implement — `panels.ts`**

After the `ReviewPanel` interface and `Panel` union, add:

```ts
/**
 * A local file rendered on the canvas, watched by main.
 *
 * The SECOND sessionless kind, and its arrival is what forces isTerminalPanel
 * below to exist. Like a review node it has no spec, so it never reaches
 * assignTiers, never reaches registry.ensure, and can take neither a
 * LIVE_BUDGET slot nor a WebGL context — structurally, via Canvas.tsx's
 * partition, rather than by a guard anyone has to remember.
 */
export interface FilePanel extends PanelBase {
  kind: 'file'
  source: FileSource
}

export type Panel = TerminalPanel | ReviewPanel | FilePanel

export function isFilePanel(panel: Panel): panel is FilePanel {
  return panel.kind === 'file'
}

/**
 * The partition test, and the reason it is spelled as a negation of the known
 * non-terminal kinds rather than as `kind === 'terminal'`.
 *
 * Canvas.tsx spelled "is a terminal panel" as `!isReviewPanel(p)` until M13,
 * and that was correct with exactly one non-terminal kind. With two it is
 * wrong in the DANGEROUS direction: a file panel satisfies !isReviewPanel,
 * lands in terminalPanels, reaches assignTiers and registry.ensure with no
 * spec, and mints a PanelSession for a <pre> — burning a LIVE_BUDGET slot and
 * a WebGL context on a panel that has no process.
 *
 * Written this way rather than as a positive `kind === 'terminal'` test
 * because absence must keep meaning terminal: `kind` is absent in every
 * layout.json written before M9b and in every verify fixture written before
 * it. A fourth kind edits exactly this one line.
 */
export function isTerminalPanel(panel: Panel): panel is TerminalPanel {
  return !isReviewPanel(panel) && !isFilePanel(panel)
}

/**
 * A file panel is a READING surface: the review node's portrait box, for the
 * review node's reason, not the terminal's 720x460 landscape one.
 */
export const FILE_W = 640
export const FILE_H = 520

/**
 * Centred exactly on the point it is given, the contract makePanel has.
 *
 * `source` is copied field by field rather than carried by reference, so a
 * caller reusing its object cannot mutate a mounted panel's path underneath
 * it. It is emphatically NOT rewritten: do not copy makePanel's
 * `{ ...spec, panelId: id }` line here — a spec's panelId names the panel
 * itself, and there is no field here that names a panel at all.
 */
export function makeFilePanel(
  id: string,
  centre: Point,
  z: number,
  source: FileSource,
  size?: { w?: number; h?: number }
): FilePanel {
  const w = size?.w ?? FILE_W
  const h = size?.h ?? FILE_H
  return {
    kind: 'file',
    rect: { id, x: centre.x - w / 2, y: centre.y - h / 2, w, h },
    source: { path: source.path },
    z
  }
}
```

Add `import type { FileSource } from '@shared/file-panel'` at the top.

- [ ] **Step 4: Implement — `layout-schema.ts`**

Add after `PersistedReviewPanel`:

```ts
export interface PersistedFilePanel extends PersistedPanelBase {
  kind: 'file'
  /** An absolute path. See FileSource: main expands `~` before this is built. */
  source: FileSource
}

export type PersistedPanel = PersistedTerminalPanel | PersistedReviewPanel | PersistedFilePanel
```

Add the sub-parser beside `parseReviewSubject`:

```ts
function parseFileSource(raw: unknown, id: string, warnings: string[]): FileSource | null {
  if (!isRecord(raw)) {
    warnings.push(`dropped file panel ${id}: source was not an object`)
    return null
  }
  const { path } = raw
  // All-or-drop, like parseReviewSubject. There is no defaulting a path: a
  // panel pointed at a guessed file is worse than a panel that was not
  // restored, because it looks like it worked.
  if (!isStr(path) || path === '') {
    warnings.push(`dropped file panel ${id}: source path was unusable`)
    return null
  }
  return { path }
}
```

In `parsePanel`, insert **above** the unrecognised-kind drop (i.e. immediately after the `kind === 'review'` block):

```ts
  if (kind === 'file') {
    const source = parseFileSource((raw as Record<string, unknown>).source, id, warnings)
    if (source === null) return null
    return { ...base, kind: 'file', source }
  }
```

- [ ] **Step 5: Implement — `layout-adapt.ts`**

In `toPanels`, beside the review branch:

```ts
    if (p.kind === 'file') return { ...base, kind: 'file' as const, source: { path: p.source.path } }
```

In `fromPanels`, beside the review branch:

```ts
    // No cwd and no args keys AT ALL, for the reason the review branch above
    // states: an explicit `cwd: undefined` fails the terminal branch's cwd
    // check on the next launch, losing the panel on every relaunch, silently.
    if (isFilePanel(panel)) return { ...base, kind: 'file' as const, source: { path: panel.source.path } }
```

Add `isFilePanel` to the import from `./panels`.

- [ ] **Step 6: Watch them pass**

Run: `npm run verify:viewport` and `npm run verify:layout`
Expected: viewport `81/81` (78 + 3), layout `116/116` (112 + 4). Confirm all newly-added checks executed.

- [ ] **Step 7: Typecheck and commit**

```bash
npm run typecheck
git add src/renderer/panels/panels.ts src/shared/layout-schema.ts src/renderer/panels/layout-adapt.ts scripts/verify-viewport.cjs scripts/verify-layout.cjs
git commit -m "feat(m13): the file panel kind, in memory and on disk

isTerminalPanel is the load-bearing addition, not makeFilePanel.
Canvas spelled 'is terminal' as !isReviewPanel(p), correct with exactly
one non-terminal kind and wrong in the dangerous direction with two: a
file panel satisfies it, lands in terminalPanels, and mints a
PanelSession for a <pre>. Spelled as the negation of the known
non-terminal kinds rather than kind === 'terminal', because absence must
keep meaning terminal for every pre-M9b file. A fourth kind edits one
line.

verify:viewport 80b is the check that says so, and its clauses about
terminals are not the ones that matter: a helper written as
!isReviewPanel passes every one of those.

verify:layout 111 pins the two rules the new arm sits between and could
have broken — absent kind still terminal, present unknown kind still
dropped. 112 pins the layout-adapt round trip, the other door onto this
format, including that the file branch writes no cwd key at all.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The IPC surface

**Files:**
- Modify: `src/shared/ipc-contract.ts`, `src/preload/index.ts`, `src/main/ipc.ts`, `src/main/index.ts`
- Modify: `scripts/verify-panels.cjs`'s harness (`scripts/panels-entry.cjs`) — it hand-wires `registerIpcHandlers` and will not compile against the new signature otherwise

**Interfaces:**
- Consumes: `FileResult` (Task 1), `readFile` (Task 2), `FileWatchers` (Task 3).
- Produces: `IPC.FILE_OPEN` / `FILE_READ` / `FILE_CLOSE`, `IPC_EVENTS.FILE_CHANGED`, `FileReadRequest`, `FileChangedEvent`, and `window.canvas.file.{ open, read, close, onChanged }`.

- [ ] **Step 1: Write the failing check**

`scripts/verify-ipc-surface.cjs` needs no edit — it walks `Object.values(IPC)` automatically. Instead, pin the *count* so a future reader cannot silently mistake an event for an invoke. Find the assertion that reports the channel total and confirm it prints `34/34` after this task; if the script hardcodes a number, update it to 34 with this comment above it:

```js
// 34, not 35. file:changed is an IPC_EVENTS member — a main-to-renderer send,
// handled by nobody — and this suite asserts over Object.values(IPC), the
// invoke channels. M6d and M12 each reached this same off-by-one; CLAUDE.md
// records both.
```

- [ ] **Step 2: Watch it fail**

Run: `npm run verify:ipc`
Expected: still `1/1` reporting **31** channels (nothing added yet). The check becomes meaningful in Step 6.

- [ ] **Step 3: Implement — the contract**

In `src/shared/ipc-contract.ts`, add to `IPC` after `REVIEW_COMMIT`:

```ts
  ,
  /**
   * Ask main to show a native open dialog. Resolves to the chosen absolute
   * path, or null if the user cancelled.
   *
   * Main owns the dialog because main owns every other dialog in this app
   * (the reset confirm, and canvas:request-reset's whole reason for existing).
   * A renderer-side reconstruction would drift from the menu path silently.
   */
  FILE_OPEN: 'file:open',
  /**
   * Read a file AND arm the watch for that panel id.
   *
   * One channel rather than two, deliberately: it makes "the renderer is
   * showing this file" and "main is watching this file" one statement rather
   * than two that can disagree. The component reads on mount and closes on
   * unmount, so a workspace switch — which unmounts without disposing —
   * correctly stops watching a canvas nobody is looking at, and re-arms on the
   * way back.
   */
  FILE_READ: 'file:read',
  /** Disarm the watch. Called from the component's unmount. */
  FILE_CLOSE: 'file:close'
```

Add to `IPC_EVENTS` after `SESSION_LIVE`:

```ts
  ,
  /**
   * A watched file changed on disk. Main -> renderer, fire-and-forget.
   *
   * An IPC_EVENTS member and not an IPC one, which decides a number:
   * verify:ipc asserts over Object.values(IPC) and is unmoved by this, so the
   * count goes 31 -> 34 and not 35. M6d and M12 each hit this same boundary
   * and recorded it; this is the third.
   *
   * A push, where review:* is deliberately pull-only, and the difference is
   * what the signal MEANS rather than a change of posture. Review's signal is
   * "an agent finished a turn", which the renderer already observes as an idle
   * transition — main would be a second author of a timing decision. A file's
   * signal is "the bytes on disk changed", which ONLY main can see; there is
   * no renderer-side event that means it.
   *
   * Deduped in main against a hash of the whole result, for the reason
   * AGENT_STATE and SESSION_LIVE are deduped: undeduped this is a message per
   * filesystem event describing a fact that did not change, and its failure is
   * invisible — no pixel is wrong, it shows up as heat.
   *
   * Carries the whole FileResult rather than a bare notification. The
   * alternative — push {panelId} and have the renderer re-invoke file:read —
   * doubles the latency and reintroduces a race between the notification and
   * the read, for the sole benefit of a smaller message the byte cap already
   * bounds.
   */
  FILE_CHANGED: 'file:changed'
```

Add the request/event types near the other request types:

```ts
export interface FileReadRequest {
  panelId: PanelId
  path: string
}

export interface FileChangedEvent {
  panelId: PanelId
  result: FileResult
}
```

Add to `CanvasBridge`, after `review`:

```ts
  file: {
    /** A native open dialog. `null` when the user cancelled. */
    open(): Promise<string | null>
    /** Read and arm the watch. */
    read(req: FileReadRequest): Promise<FileResult>
    /** Disarm. */
    close(panelId: PanelId): Promise<void>
    /** Returns its own unsubscribe, like every other on* in this bridge. */
    onChanged(listener: (event: FileChangedEvent) => void): () => void
    /**
     * The absolute path of a dropped File.
     *
     * SYNCHRONOUS and not an invoke, because it is a pure main-world helper
     * rather than a main-process call. Electron 43 REMOVED File.path from the
     * renderer: reading `file.path` yields undefined, the mint is skipped, and
     * the drop looks like it did nothing at all — with no error, because
     * undefined is a perfectly ordinary value for a property that does not
     * exist.
     */
    pathForFile(file: File): string
  }
```

- [ ] **Step 4: Implement — preload**

In `src/preload/index.ts`, import `webUtils` from `electron` and add after the `review` group:

```ts
  file: {
    open: () => ipcRenderer.invoke(IPC.FILE_OPEN),
    read: (req: FileReadRequest) => ipcRenderer.invoke(IPC.FILE_READ, req),
    close: (panelId: PanelId) => ipcRenderer.invoke(IPC.FILE_CLOSE, panelId),
    onChanged: (listener) => subscribe<FileChangedEvent>(IPC_EVENTS.FILE_CHANGED, listener),
    pathForFile: (file: File) => webUtils.getPathForFile(file)
  },
```

- [ ] **Step 5: Implement — main**

In `src/main/ipc.ts`, append two parameters to `registerIpcHandlers` (last, so no positional call site shifts — the rule the signature's own comments state):

```ts
  /**
   * Appended last, like reviewEngine and reviewCommit before them, so no
   * existing positional call site shifts.
   */
  fileWatchers: FileWatchers,
  /**
   * Its own parameter rather than reaching for `palette.window`: the dialog
   * needs a parent window, and main/index.ts is the only thing that has one.
   */
  getWindow: () => BrowserWindow | null
```

and add the handlers:

```ts
  ipcMain.handle(IPC.FILE_OPEN, async () => {
    const win = getWindow()
    const result = win === null
      ? await dialog.showOpenDialog({ properties: ['openFile'] })
      : await dialog.showOpenDialog(win, { properties: ['openFile'] })
    // ?? null, never undefined: undefined does not survive the structured
    // clone as a distinguishable value, the rule this file already follows.
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  ipcMain.handle(IPC.FILE_READ, (event, req: FileReadRequest) => {
    // The watch's callback sends to the SAME webContents that asked. A reload
    // replaces those contents and closeAll() runs on navigation, so a stale
    // sender is never reached — but capturing it here rather than reaching for
    // a module-level window is what makes that true rather than incidental.
    const sender = event.sender
    return fileWatchers.watch(req.panelId, req.path, (result) => {
      if (sender.isDestroyed()) return
      sender.send(IPC_EVENTS.FILE_CHANGED, { panelId: req.panelId, result })
    })
  })

  ipcMain.handle(IPC.FILE_CLOSE, (_event, panelId: PanelId) => {
    fileWatchers.close(panelId)
  })
```

In `src/main/index.ts`: construct `const fileWatchers = new FileWatchers()` at module scope beside the other collaborators; pass `fileWatchers` and `() => win` as the two new trailing arguments to `registerIpcHandlers`; and wire **both** teardown seams:

```ts
// The two seams window-lifecycle.ts already covers for PTYs, and for the same
// reason. Without the navigation one, every Cmd+R leaks one FSWatcher per open
// file panel, forever, in a main process the reload does not restart.
attachPtyLifecycle(win, () => {
  ptyManager.detachAll()
  fileWatchers.closeAll()
})
```

and inside the existing `before-quit` handler's `try`, beside `killAll()`:

```ts
  fileWatchers.closeAll()
```

- [ ] **Step 6: Update the panels harness and verify**

`scripts/panels-entry.cjs` hand-wires `registerIpcHandlers`; add the two trailing arguments there (`new FileWatchers()` and `() => win`).

Run: `npm run typecheck && npm run verify:ipc`
Expected: `1/1`, reporting **34** channels.

- [ ] **Step 7: Commit**

```bash
git add src/shared/ipc-contract.ts src/preload/index.ts src/main/ipc.ts src/main/index.ts scripts/panels-entry.cjs scripts/verify-ipc-surface.cjs
git commit -m "feat(m13): three invokes, one event, and both teardown seams

verify:ipc goes 31 -> 34, not 35: file:changed is an IPC_EVENTS send
that suite does not count. M6d and M12 each reached this same off-by-one
and CLAUDE.md records both; this is the third.

A push where review:* is pull-only, and that is not a change of posture.
Review's signal is 'an agent finished a turn', which the renderer
already observes as an idle transition, so main would be a second author
of a timing decision. A file's signal is 'the bytes on disk changed',
which only main can see — there is no renderer-side event that means it.

file:read both reads and arms, so 'the renderer is showing this' and
'main is watching this' are one statement rather than two that can
disagree. The watch callback captures event.sender rather than reaching
for a module-level window, which is what makes 'a stale sender is never
reached' true rather than incidental.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The renderer store and the view model

**Files:**
- Create: `src/renderer/session/file-store.ts`, `src/renderer/file/file-node-model.ts`
- Modify: `scripts/verify-rail.cjs` (checks 72–76), `scripts/rail-entry.cjs` (re-export the new model)

**Interfaces:**
- Consumes: `FileResult` (Task 1), `FileSource` (Task 1).
- Produces: `applyFileResult(panelId, result)`, `clearFileResult(panelId)`, `getFileResult(panelId)`, `useFileResult(panelId)`; and `buildFileNodeModel({ source, title, result })` returning `FileNodeModel { heading, directory, summary, note?, lines: FileLine[], truncatedNote? }` where `FileLine = { n: number; text: string }`.

- [ ] **Step 1: Write the failing checks**

Add `...require('../src/renderer/file/file-node-model.ts')` to `scripts/rail-entry.cjs`'s exports, then append to `scripts/verify-rail.cjs`:

```js
const src = { path: '/Users/x/notes/todo.md' }
// 72 — the ordinary case: a heading that is the BASENAME, the directory as its
// own field, and the lines numbered from 1.
{
  const m = R.buildFileNodeModel({ source: src, title: undefined,
    result: { kind: 'text', content: 'a\nb', bytes: 3, lines: 2, truncatedLines: 0, mtimeMs: 0 } })
  ok(72, m.heading === 'todo.md' && m.directory === '/Users/x/notes'
      && m.lines.length === 2 && m.lines[0].n === 1 && m.lines[0].text === 'a'
      && m.truncatedNote === undefined,
    `72 — a text file renders numbered lines under its basename: ${m.heading} / ${m.directory}`)
}
// 73 — the user's own title outranks the basename, the honest chain's first
// link, for BOTH other kinds already and now for a third.
{
  const m = R.buildFileNodeModel({ source: src, title: 'the plan',
    result: { kind: 'text', content: 'a', bytes: 1, lines: 1, truncatedLines: 0, mtimeMs: 0 } })
  ok(73, m.heading === 'the plan', `73 — a titled file panel uses its own title: ${m.heading}`)
}
// 74 — THE CHECK THIS MODEL EXISTS FOR, and the one that separates it from
// 'just call buildReviewFields': every non-text arm renders a NOTE and a
// heading, never nothing. The inspector pane may hide itself when it has
// nothing to say; a panel the user deliberately opened and dragged must not,
// because a panel rendering nothing at all is indistinguishable from a broken
// one and the user has no way to ask why.
{
  const arms = [
    { kind: 'missing' },
    { kind: 'too-large', bytes: 9e9, cap: 2097152 },
    { kind: 'binary', bytes: 40 },
    { kind: 'unreadable', detail: 'EACCES' }
  ]
  const models = arms.map((result) => R.buildFileNodeModel({ source: src, title: undefined, result }))
  const allNoted = models.every((m) => typeof m.note === 'string' && m.note.length > 0
    && m.heading === 'todo.md' && m.lines.length === 0)
  // And they must be four DIFFERENT sentences: 'this file is gone' and 'this
  // file is binary' are two situations with two different fixes, and
  // collapsing them tells a user the wrong one.
  const distinct = new Set(models.map((m) => m.note)).size === 4
  ok(74, allNoted && distinct,
    `74 — every non-text arm renders a heading and its OWN note: noted=${allNoted} distinct=${distinct}`)
}
// 75 — truncation is reported, and it reports the NUMBER it was given rather
// than recomputing one from the rendered lines. A model that recomputed would
// always say 0, because the content it was handed is already truncated.
{
  const m = R.buildFileNodeModel({ source: src, title: undefined,
    result: { kind: 'text', content: 'a\nb', bytes: 99, lines: 27, truncatedLines: 25, mtimeMs: 0 } })
  ok(75, m.lines.length === 2 && typeof m.truncatedNote === 'string' && m.truncatedNote.includes('25'),
    `75 — the truncated remainder is reported: ${JSON.stringify(m.truncatedNote)}`)
}
// 76 — the rail and inspector arms. A file row is NEVER dormant (a start arrow
// on it is a promise nothing can keep), its tail says 'file', and the
// inspector refuses the process verbs.
{
  const panel = { kind: 'file', rect: { id: 'f1', x: 0, y: 0, w: 640, h: 520 }, z: 1, source: src }
  const rows = R.buildRailRows([panel], () => undefined, new Set(['f1']))
  const im = R.buildInspectorModel(panel, undefined)
  ok(76, rows[0].label === 'todo.md' && rows[0].tail === 'file' && rows[0].dormant === false
      && im.kind === 'file' && im.restartable === false,
    `76 — the rail and inspector arms: label=${rows[0].label} tail=${rows[0].tail} dormant=${rows[0].dormant} restartable=${im.restartable}`)
}
```

- [ ] **Step 2: Watch them fail**

Run: `npm run verify:rail`
Expected: FAIL — check 72 **throws** (`buildFileNodeModel` undefined) and 73–76 never run. Record that.

- [ ] **Step 3: Implement — `file-store.ts`**

```ts
import { useSyncExternalStore } from 'react'
import type { PanelId } from '@shared/types'
import type { FileResult } from '@shared/file-panel'

/**
 * What each open file panel's file currently says, as told by main.
 *
 * A FOURTH module-level store beside agent-state-store.ts and
 * live-session-store.ts, subscribed the same way: PER PANEL ID.
 *
 * It must never bump registry.version(). That counter deliberately moves only
 * on tier/status/focus/exit so a chatty agent cannot re-render the canvas at
 * 60Hz, and this is the most acute case yet — file content can change several
 * times a second while an agent writes, and riding that counter would
 * re-render every panel on the canvas on every byte some OTHER panel's file
 * gained. CLAUDE.md records this rule three times already; this is the fourth.
 *
 * A CACHE of main's answer, never a second author of it. Nothing here decides
 * what a file says; main reads and this holds what arrived.
 */

const results = new Map<PanelId, FileResult>()
const listeners = new Map<PanelId, Set<() => void>>()

function notify(panelId: PanelId): void {
  const set = listeners.get(panelId)
  if (!set) return
  for (const listener of set) listener()
}

/**
 * Called by the ONE canvas-wide file:changed subscription, and by the
 * component's own first read.
 *
 * No equality check here, unlike applyLiveSession: main already deduped
 * against a hash of the whole result, and re-hashing a 2MB string on the
 * renderer's main thread to save a re-render of one panel is the wrong trade —
 * the exact opposite of the trade that made the hash worth it in main, where
 * it saved an IPC message.
 */
export function applyFileResult(panelId: PanelId, result: FileResult): void {
  results.set(panelId, result)
  notify(panelId)
}

/**
 * A panel is gone for good: closed, undone, or dropped by a reset. Without
 * this the map grows for the life of the renderer and a recycled panel id
 * inherits a dead panel's file — the same reason clearAgentState and
 * clearLiveSession exist.
 */
export function clearFileResult(panelId: PanelId): void {
  if (!results.has(panelId)) return
  results.delete(panelId)
  notify(panelId)
}

export function getFileResult(panelId: PanelId): FileResult | undefined {
  return results.get(panelId)
}

function subscribe(panelId: PanelId, listener: () => void): () => void {
  let set = listeners.get(panelId)
  if (!set) {
    set = new Set()
    listeners.set(panelId, set)
  }
  set.add(listener)
  return () => {
    set.delete(listener)
    if (set.size === 0) listeners.delete(panelId)
  }
}

/**
 * The snapshot is the STORED object, never one built per call.
 * useSyncExternalStore compares snapshots by identity, so returning a fresh
 * object each time makes React see a new value every render and loop — the
 * trap attentionSnapshot and useLiveSession each exist for.
 */
export function useFileResult(panelId: PanelId): FileResult | undefined {
  return useSyncExternalStore(
    (listener) => subscribe(panelId, listener),
    () => results.get(panelId),
    () => results.get(panelId)
  )
}
```

- [ ] **Step 4: Implement — `file-node-model.ts`**

```ts
import type { FileResult, FileSource } from '@shared/file-panel'

/**
 * The file node's view model — pure, plain data, no DOM and no React.
 *
 * A second pure model beside review-node-model.ts, and it makes the same
 * divergence from the inspector pane that one does, for the same reason: a
 * pane is a strip in a 260px column that may hide itself when it has nothing
 * to say, while a NODE is a panel the user deliberately opened, placed and
 * dragged. A node that renders nothing at all is indistinguishable from a
 * broken one, and the user has no way to ask why. So every arm here renders a
 * heading and a sentence. verify:rail 74.
 */

export interface FileLine {
  /** 1-based, and the number of the line in the FILE. */
  n: number
  text: string
}

export interface FileNodeModel {
  /** The honest chain's first link, then the basename. */
  heading: string
  /** The containing directory, as its own field rather than spliced in. */
  directory: string
  /** A short factual line: size, line count. Always present. */
  summary: string
  /** Present only for the non-text arms — the sentence that says what happened. */
  note?: string
  lines: FileLine[]
  /** Present only when the render cap dropped something. */
  truncatedNote?: string
}

const KB = 1024
function humanBytes(bytes: number): string {
  if (bytes < KB) return `${bytes} B`
  if (bytes < KB * KB) return `${Math.round(bytes / KB)} KB`
  return `${(bytes / (KB * KB)).toFixed(1)} MB`
}

/**
 * Split without importing node:path. `basename`/`dirname` live in node:path,
 * which is a main-side module: importing it here would drag a Node builtin
 * into the renderer bundle for two string operations. Paths here are always
 * absolute and POSIX (this is a macOS app), so the split is exact.
 */
function splitPath(path: string): { dir: string; base: string } {
  const cut = path.lastIndexOf('/')
  if (cut < 0) return { dir: '', base: path }
  return { dir: cut === 0 ? '/' : path.slice(0, cut), base: path.slice(cut + 1) }
}

export function buildFileNodeModel(input: {
  source: FileSource
  title: string | undefined
  result: FileResult | undefined
}): FileNodeModel {
  const { dir, base } = splitPath(input.source.path)
  // The honest chain's first link, the one the user chose — the same rule the
  // panel header, railLabel and the inspector heading all obey.
  const heading = input.title ?? base
  const shell = { heading, directory: dir, lines: [] as FileLine[] }

  // Undefined is the in-flight state: the read is an IPC round trip, so this
  // is every panel for its first moment. It renders a sentence rather than
  // nothing, for the reason review-node-model.ts renders one — a node that
  // shows nothing while it waits reads as a broken panel.
  if (input.result === undefined) return { ...shell, summary: 'reading…' }

  const r = input.result
  switch (r.kind) {
    case 'text': {
      const lines = r.content === ''
        ? []
        : r.content.split('\n').map((text, i) => ({ n: i + 1, text }))
      return {
        ...shell,
        summary: `${humanBytes(r.bytes)} · ${r.lines} ${r.lines === 1 ? 'line' : 'lines'}`,
        lines,
        // The remainder comes from the RESULT's own number, never recomputed
        // from `lines` — the content in hand is already truncated, so a
        // recomputation would always say zero.
        ...(r.truncatedLines > 0
          ? { truncatedNote: `${r.truncatedLines} more lines not shown` }
          : {})
      }
    }
    // Four arms, four DIFFERENT sentences. 'this file is gone' and 'this file
    // is binary' are two situations with two different fixes, and collapsing
    // any two of them tells a user the wrong one.
    case 'missing':
      return { ...shell, summary: 'not found', note: 'This file no longer exists. It will reappear here if it is recreated.' }
    case 'too-large':
      return { ...shell, summary: humanBytes(r.bytes), note: `This file is larger than the ${humanBytes(r.cap)} viewing limit.` }
    case 'binary':
      return { ...shell, summary: humanBytes(r.bytes), note: 'This looks like a binary file, so there is nothing to show as text.' }
    case 'unreadable':
      return { ...shell, summary: 'unreadable', note: `This file could not be read: ${r.detail}` }
  }
}
```

- [ ] **Step 5: Implement the rail and inspector arms**

`src/renderer/shell/rail-rows.ts` — in `railLabel`, after the review branch:

```ts
  // A file panel names its FILE. Same split as the review branch above: the
  // basename, not the whole path, because a 260px row cannot hold one and the
  // directory is the inspector's job.
  if (isFilePanel(panel)) return panel.source.path.slice(panel.source.path.lastIndexOf('/') + 1)
```

In `railTail`, beside the review test:

```ts
  // Same reason the review test above is here, and BEFORE the dormant test:
  // 'not started', 'exited 0' and 'pid 4821' are all sentences about a process
  // this panel does not have, and `dormant` in particular would render a
  // start control that nothing can honour.
  if (kind === 'file') return 'file'
```

In `buildRailRows`, widen the dormancy line:

```ts
    const dormant = isTerminalPanel(panel) ? dormantIds.has(id) : false
```

`src/renderer/shell/inspector-fields.ts` — add a `file` arm above the terminal tail:

```ts
  if (isFilePanel(panel)) {
    const path = panel.source.path
    const cut = path.lastIndexOf('/')
    return {
      kind: 'file',
      id: panel.rect.id,
      heading: railLabel(panel, undefined),
      ...(panel.title !== undefined ? { title: panel.title } : {}),
      // FALSE rather than absent, the reason the review arm gives: an optional
      // flag lets a half-finished wiring compile with the control silently
      // always-enabled, and tsc says nothing about it.
      restartable: false,
      reattached: false,
      fields: [
        { key: 'file', label: 'file', value: cut < 0 ? path : path.slice(cut + 1) },
        // The directory is its OWN field rather than folded into the one
        // above, which is the pane's whole stated job: show the links, not a
        // merged answer. The rail row shows the basename and nothing else, so
        // this is the one surface where the full path is legible.
        { key: 'directory', label: 'in', value: cut <= 0 ? '/' : path.slice(0, cut) }
      ]
    }
  }
```

Add `'file'` handling wherever `InspectorModel.kind === 'review'` gates a control in `Inspector.tsx` — change those tests to `model.kind !== 'terminal'`, and keep the controls **visible and disabled with a reason**, never hidden (`verify:palette` 31's rule).

- [ ] **Step 6: Watch them pass**

Run: `npm run verify:rail`
Expected: `80/80` (75 + 5). Confirm 73–76 executed.

- [ ] **Step 7: Typecheck and commit**

```bash
npm run typecheck
git add src/renderer/session/file-store.ts src/renderer/file/file-node-model.ts src/renderer/shell/rail-rows.ts src/renderer/shell/inspector-fields.ts src/renderer/shell/Inspector.tsx scripts/rail-entry.cjs scripts/verify-rail.cjs
git commit -m "feat(m13): the file store and the node's view model

file-store.ts is the FOURTH per-panel-id module store, and the most
acute case of the rule the other three record: it must never bump
registry.version(), because file content can change several times a
second while an agent writes and riding that counter would re-render
every panel on every byte some other panel's file gained.

It deliberately does NOT re-check equality the way applyLiveSession
does. Main already deduped against a hash of the whole result, and
re-hashing a 2MB string on the renderer's main thread to save one
panel's re-render is the opposite of the trade that made the hash worth
it in main, where it saved an IPC message.

verify:rail 74 is the check the model exists for, and the only one that
separates it from calling buildReviewFields: every non-text arm renders
a heading and its OWN sentence. A pane may hide itself; a panel the user
opened and dragged must not, because rendering nothing is
indistinguishable from being broken. 75 pins that the remainder comes
from the result's number rather than being recomputed from content that
is already truncated — a recomputation always says zero.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: `FileNode.tsx` and the Canvas wiring

**Files:**
- Create: `src/renderer/file/FileNode.tsx`
- Modify: `src/renderer/canvas/Canvas.tsx`, `src/renderer/styles.css`

**Interfaces:**
- Consumes: everything from Tasks 1–6.
- Produces: the rendered panel; `openFilePanel(path, centre)` on Canvas; `PaletteActions.openFile`.

- [ ] **Step 1: Create `FileNode.tsx`**

Model it directly on `ReviewNode.tsx`. The non-negotiable parts:

```tsx
/**
 * A local file on the canvas.
 *
 * Reuses the `.panel` class and `data-panel-id` DELIBERATELY, exactly as
 * ReviewNode does: drag, resize, selection, the pointer corrector and
 * shouldYieldWheel's closest('.panel') all key off them, so a bespoke class
 * would mean reimplementing five behaviours that already work.
 */
export function FileNode({ panel, selected, onSelect, onFocus, onBeginDrag, onClose }: Props): JSX.Element {
  const id = panel.rect.id
  const path = panel.source.path
  const result = useFileResult(id)
  const model = useMemo(
    // Keyed on the four INPUTS, never on a serialised signature of the output.
    // Canvas hands a new `panel` object on every drag frame, but `source` and
    // `title` are carried by REFERENCE through setPanelRect's { ...p, rect },
    // and `result` is store state a drag does not touch — so React's identity
    // comparison already answers this. ReviewNode's own comment records what
    // the signature version cost: serialising 600 line objects per frame to
    // avoid one object allocation.
    () => buildFileNodeModel({ source: panel.source, title: panel.title, result }),
    [panel.source, panel.title, result]
  )

  // Read on mount, close on unmount. This is what makes 'the renderer is
  // showing this file' and 'main is watching it' one statement: a workspace
  // switch unmounts without disposing, so it correctly stops the watch for a
  // canvas nobody is looking at, and re-arms on the way back.
  useEffect(() => {
    let live = true
    void window.canvas.file
      .read({ panelId: id, path })
      .then((r) => { if (live) applyFileResult(id, r) })
      // MANDATORY. An unhandled rejection leaves a permanent 'reading…', which
      // this milestone's honest-degradation rule forbids: every failure must
      // land in a rendered arm with a sentence.
      .catch((error: unknown) => {
        if (live) applyFileResult(id, { kind: 'unreadable', detail: String(error) })
      })
    return () => {
      live = false
      void window.canvas.file.close(id)
    }
  }, [id, path])
  // ...
}
```

Structure, mirroring `ReviewNode`:
- `<div className="panel" data-panel-id={id} style={{ left, top, width, height, zIndex }} onMouseDown={…stopPropagation, onSelect, onFocus}>`
- `<header className="panel__chrome">` starting a `{ kind: 'move' }` drag; heading, directory, summary; a `⟳` refresh button and a `×` close button, each `stopPropagation()` **and** `preventDefault()` on mousedown (preventDefault keeps DOM focus off the button — `shellControl`'s rule). Close has **no** arming step, matching `ReviewNode` — a terminal's `×` arms because a mis-click there kills a process; there is nothing to kill here.
- The refresh button re-invokes `file.read` (which also re-arms), for a change made while the panel was in a hidden workspace.
- `<div className="file-node__body" data-scroll-host>` — the marker is the whole wheel contract. `shouldYieldWheel` rule 3 is attribute-driven precisely so a new scrolling kind needs **no branch in the predicate**.
- Inside: `model.note` if present; otherwise a `<pre>` with a line-number gutter over `model.lines`; then `model.truncatedNote` if present.
- `onKeyDown` calling `stopPropagation()` on **every** key — `useViewport`'s keydown listener is on `window`.
- Resize handles `['e', 's', 'se']`, as `ReviewNode` has.

- [ ] **Step 2: Wire Canvas — the mechanical edits**

Each of these is a site the seam map identified. Work through them in order:

1. **Import** `isFilePanel`, `isTerminalPanel`, `makeFilePanel`, `FILE_W/H`, `FileNode`, `applyFileResult`, `clearFileResult`.
2. **The partition** (~line 178): `panels.filter((p): p is TerminalPanelModel => isTerminalPanel(p))`.
3. **Both reseed regexes** (~lines 222 and 957): `/^[nr](\d+)$/` → `/^[nrf](\d+)$/`, at **boot and at `switchWorkspace`**. Update the comment at 956 to name three prefixes. *This is the milestone's sharpest trap: a regex blind to `f` recomputes a maximum a persisted `f7` had no part in, and the next open mints `f7` twice — React collides on the key and `parseLayout` drops one silently at the next load.*
4. **The four teardown guards** (~401 `applyHistory`, ~762 `resetCanvas`, ~1197 `onClosePanel`, ~2251 `deleteWorkspace`): change `isReviewPanel(panel)` to `!isTerminalPanel(panel)`, keeping each guard on the loop's **iteration** so `verify:panels` 94's five-`registry.dispose`-site count does not move. In `applyHistory` and `resetCanvas` also call `clearFileResult(id)` beside the existing `clearAgentState`/`clearLiveSession` calls. `onClosePanel`'s early-return branch must cover file panels too, and call `clearFileResult`.
5. **The "is this a terminal" lookups** (~684 restart, ~1084 `__m4bCapture`, ~1557 prompt cwd, ~2322 / ~2390 palette actions, ~2516 / ~2521 `panelRows.restartable`, ~1717 / ~1736 `openReview`'s subject checks): replace `isReviewPanel(x)` with `!isTerminalPanel(x)` — a file panel is not a valid restart target, preset source, prompt cwd, or review subject.
6. **`panelLabel`** (~88): add `if (isFilePanel(panel)) return \`file: ${panel.source.path} (${panel.rect.id})\``.
7. **The rename command** (~1972): add a third arm rebuilding `{ kind: p.kind, rect: p.rect, source: p.source, z: p.z, title: name }`.
8. **The subscription**, beside the `onLive` one (~661):
```tsx
  useEffect(() => window.canvas.file.onChanged((e) => {
    applyFileResult(e.panelId, e.result)
  }), [])
```
9. **The render arm** (~2769): `if (isFilePanel(panel)) return <FileNode … onSelect={selectAndRaise} … />` — `selectAndRaise`, **not** `onSelectPanel`, matching the review arm: `onSelectPanel` clears the dormant id and calls `registry.wake`, both meaningless for a processless panel.
10. **`openFilePanel(path, centre)`**, modelled on `openReview`:
```tsx
  const openFilePanel = useCallback((path: string, centre: Point) => {
    setPanels((existing) => {
      // `f`, off the SAME counter as `n` and `r`. PanelId doubles as a tmux
      // session name and the global-uniqueness rule turns on nothing else
      // being able to mint a colliding one.
      const id = `f${nextIdRef.current++}`
      const next = [...existing, makeFilePanel(id, cascadeCentre(centre, existing), nextZ(existing), { path })]
      commitHistory(next)
      setSelectedId(id)
      return next
    })
  }, [commitHistory])
```
11. **The palette door**: an `openFile` member on `PaletteActions` that invokes `file.open()` and calls `openFilePanel(path, worldCentre())` on a non-null reply; a row in `commands.ts` in the panel section, `hiddenAtRest: false`, titled `Open file…`.
12. **The drop door**, on the `.canvas` host:
```tsx
  // preventDefault on dragover is REQUIRED, not defensive: without it the
  // browser's default action for a dropped file is to NAVIGATE to it, which
  // destroys the app's own page.
  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault() }, [])
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file === undefined) return
    // Electron 43 REMOVED File.path from the renderer. Reading file.path
    // yields undefined, the mint is skipped, and the drop looks like it did
    // nothing at all — with no error, because undefined is an ordinary value
    // for a property that does not exist.
    const path = window.canvas.file.pathForFile(file)
    if (!path) return
    const host = e.currentTarget.getBoundingClientRect()
    // The DROP's world point, so the panel lands under the cursor at every
    // zoom rather than where the cursor was at 1:1.
    openFilePanel(path, screenToWorld({ x: e.clientX - host.left, y: e.clientY - host.top }, viewportRef.current))
  }, [openFilePanel])
```

- [ ] **Step 3: Styles**

Add `.file-node__body`, `.file-node__gutter`, `.file-node__line`, `.file-node__note` to `styles.css`. **Tokens only** — `verify:styles` check 1 forbids any literal colour outside a theme block, check 4 forbids literal font sizes, and check 6 forbids literal spacing in `padding`/`margin`/`gap`. Lines do **not** wrap (`white-space: pre`); the body is `overflow: auto` so long lines scroll inside it and the page never scrolls sideways.

- [ ] **Step 4: Build and verify the whole chain**

Run: `npm run typecheck && npm run verify`
Expected: every suite green, including `verify:styles` and the untouched `verify:panels` (144/144 — the end-to-end file checks arrive in Task 8).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/file/FileNode.tsx src/renderer/canvas/Canvas.tsx src/renderer/styles.css src/renderer/palette/commands.ts
git commit -m "feat(m13): FileNode, and the twelve Canvas seams a third kind touches

Two of the twelve carry real risk and neither is visible in a
screenshot. The reseed regexes go ^[nr] -> ^[nrf] at BOTH sites, boot
and switchWorkspace: a regex blind to the new prefix recomputes a
maximum a persisted f7 had no part in, and the next open mints f7 twice
— React collides on the key and parseLayout drops one silently at the
next load. And the four teardown guards move from isReviewPanel to
!isTerminalPanel, staying on the loop's ITERATION so verify:panels 94's
deliberate five-dispose-site count does not move.

The body carries data-scroll-host rather than the predicate carrying a
kind branch: shouldYieldWheel rule 3 is attribute-driven precisely so a
new scrolling kind opts in by rendering a marker.

dragover's preventDefault is required, not defensive — without it the
browser navigates to the dropped file and destroys the app's own page.
The path comes from webUtils.getPathForFile because Electron 43 removed
File.path; reading it yields undefined and the drop silently does
nothing.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: End-to-end checks in `verify:panels`

**Files:**
- Modify: `scripts/verify-panels.cjs` (checks 125–128)

**Interfaces:**
- Consumes: the whole feature.
- Produces: nothing — this task's deliverable is evidence.

- [ ] **Step 1: Write the failing checks**

Append an M13 block. The harness already has `openPalette`, `waitUntil`, `settle` and the `kills` recorder shadow (established for checks 111/111b) — reuse them.

```js
// ---- M13: file panels -------------------------------------------------
// A fixture file in a SPACED temp directory, the rule this repo learned from
// the pane-died redirect bug shipping through eight reviews on space-free
// fixtures.
const FILE_DIR = mkdtempSync(join(tmpdir(), 'tc filepanel '))
const FIXTURE = join(FILE_DIR, 'notes.md')
writeFileSync(FIXTURE, 'first line\nsecond line\n')

// 125 — the panel renders the file's REAL content, minted through the real
// openFilePanel path. Asserted on the content rather than on the panel
// existing: a panel that mounted and rendered nothing satisfies 'a panel
// exists' completely.
const xtermsBefore = await wc.executeJavaScript(`document.querySelectorAll('.xterm').length`)
await wc.executeJavaScript(`window.__m13Open(${JSON.stringify(FIXTURE)})`)
const rendered = await waitUntil(async () => {
  const t = await wc.executeJavaScript(
    `(() => { const b = document.querySelector('[data-panel-kind="file"] [data-scroll-host]'); return b ? b.textContent : null })()`)
  return t && t.includes('second line') ? t : null
}, 5000)
ok(125, rendered !== null, `125 — a file panel renders the file's real content: ${JSON.stringify(String(rendered).slice(0, 40))}`)

// 126 — THE LIVENESS CHECK, and it is driven by an ATOMIC write, because that
// is what an agent actually does and it is the case a file-path watch fails.
// WAITED on, never slept on: a fixed sleep against a watcher is a flake and
// not a bound.
writeFileSync(join(FILE_DIR, 'notes.tmp'), 'rewritten by an agent\n')
renameSync(join(FILE_DIR, 'notes.tmp'), FIXTURE)
const updated = await waitUntil(async () => {
  const t = await wc.executeJavaScript(
    `(() => { const b = document.querySelector('[data-panel-kind="file"] [data-scroll-host]'); return b ? b.textContent : null })()`)
  return t && t.includes('rewritten by an agent') ? t : null
}, 5000)
ok(126, updated !== null, `126 — an ATOMIC external write reaches the panel: ${updated === null ? 'never arrived' : 'arrived'}`)

// 127 — it costs no session and no WebGL context, and BOTH clauses are
// required. The second is what rejects an implementation that quietly demoted
// some other panel to pay for this one — 'the file panel has no xterm' is
// satisfied perfectly by that.
const fileId = await wc.executeJavaScript(
  `document.querySelector('[data-panel-kind="file"]').getAttribute('data-panel-id')`)
const hasSession = await wc.executeJavaScript(`Boolean(window.__m4aSessions()[${JSON.stringify(fileId)}])`)
const xtermsAfter = await wc.executeJavaScript(`document.querySelectorAll('.xterm').length`)
ok(127, hasSession === false && xtermsAfter === xtermsBefore,
  `127 — a file panel holds no PanelSession and costs no WebGL context: session=${hasSession} xterms ${xtermsBefore}->${xtermsAfter}`)

// 128 — closing it sends NO pty.kill for its id. A negative against a
// recording mechanism is vacuous if the recorder is dead, so this ALSO closes
// a real terminal panel in the same window and asserts THAT id IS recorded.
// A kill aimed at an id naming no session is swallowed at every layer below
// the IPC door, so without the recorder every renderer-visible fact would be
// identical with the guards removed — the trap checks 111/111b already found.
kills.length = 0
await clickPanelClose(fileId)
const termId = await wc.executeJavaScript(
  `document.querySelector('.panel:not([data-panel-kind])').getAttribute('data-panel-id')`)
await clickPanelClose(termId)
await settle()
ok(128, !kills.includes(fileId) && kills.includes(termId),
  `128 — closing a file panel sends no pty.kill, while a terminal's close still does: kills=${JSON.stringify(kills)}`)

rmSync(FILE_DIR, { recursive: true, force: true })
```

> `FileNode` must render `data-panel-kind="file"` for these selectors, and `Canvas` must expose `window.__m13Open = (path) => openFilePanel(path, worldCentre())` alongside the existing `__m4a*` hooks. Add both — the hook set is deliberately narrow and named for what it answers, and this one answers "mint a file panel at a known path" with no native dialog in the way.

- [ ] **Step 2: Watch them fail**

Run: `npm run build && npm run verify:panels`
Expected: FAIL at 125 (the hook does not exist yet). Note that 126–128 do not run.

- [ ] **Step 3: Add the two hooks**

`window.__m13Open` in `Canvas.tsx` beside the other `__m4a*` hooks; `data-panel-kind="file"` on `FileNode`'s root.

- [ ] **Step 4: Watch them pass**

Run: `npm run build && npm run verify:panels`
Expected: `148/148` (144 + 4).

- [ ] **Step 5: Fault-inject check 128**

Temporarily remove the `!isTerminalPanel` guard from `onClosePanel`'s early return. Run `verify:panels`.
Expected: **128 goes RED**, naming the stray kill. Revert and re-run. Record the observed output in the commit message — a negative check that has never been watched failing is decoration.

- [ ] **Step 6: Commit**

```bash
git add scripts/verify-panels.cjs src/renderer/canvas/Canvas.tsx src/renderer/file/FileNode.tsx
git commit -m "test(m13): the four end-to-end checks that say this landed

126 drives an ATOMIC write, not a plain one, because that is what an
agent actually does and it is the case a file-path watch fails. Waited
on rather than slept on: a fixed sleep against a watcher is a flake, not
a bound.

127's second clause is the one that discriminates. 'The file panel has
no xterm' is satisfied perfectly by an implementation that quietly
demoted some other panel to pay for it, so the check compares the xterm
count against the count from BEFORE the panel existed.

128 asserts a NEGATIVE against a recording mechanism, which is vacuous
if the recorder is dead — so it also closes a real terminal panel in the
same window and asserts that id IS recorded. A kill aimed at an id
naming no session is swallowed at every layer below the IPC door, which
is why every renderer-visible fact stays identical with the guard
removed. Fault injected: removing onClosePanel's guard turns 128 RED
naming the stray kill.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Documentation

**Files:**
- Modify: `README.md` (milestone table), `CLAUDE.md` (verify table + Load-bearing details), `docs/ideas-backlog.md` (#14 status)

- [ ] **Step 1: `README.md`** — add `| M13 | File panels: a local file on the canvas, watched | ✅ done |` after M12.

- [ ] **Step 2: `CLAUDE.md`, the verify table** — add a `verify:file` row (10 checks; name 7 and 8 by number and say what each would catch); update `verify:layout` 112 → 116, `verify:viewport` 78 → 81, `verify:rail` 75 → 80, `verify:panels` 144 → 148, and `verify:ipc` 31 → 34 **with the sentence that this counts invokes and `file:changed` is not one**.

- [ ] **Step 3: `CLAUDE.md`, Load-bearing details** — add entries for: the directory watch and the atomic-rename trap; `isTerminalPanel` and why the partition went positive; the third `f` prefix and both reseed sites; `file-store.ts` as the fourth store that must not bump `registry.version()`; the `FileWatchers` teardown seams; and `webUtils.getPathForFile`. Add `renderer/file/` to the Architecture layer diagram and the three new channels to the IPC diagram.

- [ ] **Step 4: `docs/ideas-backlog.md`** — mark #14 tier 1 as landed in M13, leaving tiers 2–4 open, and note that the "who wins when both edit" question is **deferred, not answered** — it returns with the editor.

- [ ] **Step 5: Final full verify and commit**

```bash
npm run verify
git add README.md CLAUDE.md docs/ideas-backlog.md
git commit -m "docs(m13): record the file panel and its two traps

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:** every spec section maps to a task — shared types → 1; read arms and caps → 2; the watch, debounce, dedupe, teardown → 3; disk format, model, ids → 4; IPC and the 34 count → 5; store, view model, rail, inspector → 6; component, Canvas seams, both doors, styles → 7; end-to-end → 8; docs → 9. All eight success criteria are asserted: 1 by check 125, 2 by the Task 7 drop wiring (manual — see Limitations), 3 by checks 7 and 126, 4 by checks 9 and 74, 5 by check 127, 6 by check 128, 7 by check 10, 8 by checks 109–112.

**Verified check-number arithmetic:** viewport 78→81, layout 112→116, rail 75→80, panels 144→148, ipc 31→34, file 0→10.

**Known verification gap, stated rather than discovered:** the **Finder drop** is not covered by any automated check. A real Finder drag cannot be synthesised — `dataTransfer.files` on a dispatched event carries no OS-backed `File`, so `webUtils.getPathForFile` has nothing to resolve. Task 7's drop wiring must be verified **by hand once**, and must not be read as checked until somebody has. This is the same shape of gap `CLAUDE.md` already records for `verify:panels` 32 and the auto-repeat checks.
