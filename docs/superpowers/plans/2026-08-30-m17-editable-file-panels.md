# M17 — The Editable File Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make M16's read-only file panel editable, with a save that is refused rather than destructive when the file changed on disk underneath the draft.

**Architecture:** A new main-side `writeFile` verb does a compare-and-swap on `mtimeMs` (the token M16's reader already stamps after the read) and writes atomically via temp-and-rename; one new `file:write` invoke carries it; `FileNode.tsx` gains an edit mode whose draft lives in component state, never in `file-store.ts`, which stays a pure cache of main's answer.

**Tech Stack:** TypeScript, Electron 43, React 18, `node:fs`. No new runtime dependency — `dependencies` stays at its single entry (`node-pty`).

**Spec:** `docs/superpowers/specs/2026-08-30-m17-editable-file-panels-design.md`

## Global Constraints

- **`npm run verify` must be green before any task is called done.** It is this repo's whole verification story — no unit runner, no linter, no per-test filter. Run it as `npm run verify > /tmp/out.txt 2>&1; echo "EXIT=$?"` — piping to `tail` reports *tail's* exit status and silently hides a red chain.
- **Never introduce a second runtime dependency.** `dependencies` is `{"node-pty": "1.1.0"}` and stays that way.
- **Every failure is an arm, never a throw.** `readFile`'s header states this: a throw crosses IPC as a rejected invoke and lands in the component's `.catch` as a stringified `Error` — the right arm reached by the wrong road, losing the errno.
- **Fixture directories must contain a SPACE.** This repo's most expensive silent bug (the `pane-died` redirect) shipped through eight reviews because every fixture used a space-free path. `verify:file` already uses `mkdtempSync(join(tmpdir(), 'tc file '))`; keep it.
- **Commit style:** conventional, scoped `feat(m17):` / `fix(m17):` / `docs(m17):`, ending with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- **Comments explain WHY.** A non-obvious line without a reason attached will be "fixed" by someone later. Match the density of the surrounding files.
- **A check that THROWS aborts the run**, and every check written after it never executes — so its RED is not evidence. When writing checks test-first, note which checks a throw prevented from running and confirm their RED separately. Prefer guarding a call that may not exist over making it bare.

---

### Task 1: The write verb — `writeFile` with its CAS, and the arms that refuse

**Files:**
- Create: `src/main/file-write.ts`
- Modify: `scripts/file-entry.cjs`
- Test: `scripts/verify-file.cjs` (append checks 11–14)

**Interfaces:**
- Consumes: `FILE_MAX_BYTES` from `@shared/file-panel` (already exported).
- Produces:
  - `export type FileWriteResult = { kind: 'written'; mtimeMs: number; bytes: number } | { kind: 'stale'; detail: string } | { kind: 'failed'; detail: string }`
  - `export function writeFile(path: string, content: string, baseMtimeMs: number | null): FileWriteResult`

  Task 2 puts this type on the IPC contract; Task 3 calls it from the handler; Task 5 renders its arms.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-file.cjs`, immediately before the `console.log('')` summary block at the end of the IIFE:

```js
  // ── M17: the write verb ────────────────────────────────────────────────
  const { statSync, chmodSync, symlinkSync, readFileSync, readdirSync } = require('node:fs')

  // 11 — the ordinary case. The returned mtimeMs is asserted against a fresh
  // stat because that value BECOMES the next save's CAS token: a write that
  // reported a stale or invented timestamp would make the very next save
  // refuse itself, which reads as "saving is broken" and points nowhere near
  // the return value that caused it.
  writeFileSync(p('edit.txt'), 'before\n')
  const base11 = F.readFile(p('edit.txt')).mtimeMs
  const w11 = F.writeFile(p('edit.txt'), 'after\n', base11)
  const disk11 = readFileSync(p('edit.txt'), 'utf8')
  ok(11, w11.kind === 'written' && disk11 === 'after\n' && w11.bytes === 6
      && w11.mtimeMs === statSync(p('edit.txt')).mtimeMs,
    `11 — a write with a current token lands: kind=${w11.kind} disk=${JSON.stringify(disk11)}`)

  // 12 — THE CHECK THIS MILESTONE EXISTS FOR. A stale token is refused AND
  // NOTHING IS WRITTEN. The second clause is the whole check: asserting only
  // the refusal passes against an implementation that refused the caller and
  // wrote the file anyway, which is the exact silent destruction the CAS is
  // for. verify:credentials 6 states the identical rule for the credential
  // store's refusal.
  writeFileSync(p('cas.txt'), 'v1\n')
  const stale12 = F.readFile(p('cas.txt')).mtimeMs
  // A real second write by "the agent". The sleep is what makes the mtime
  // actually move: HFS+/APFS report mtime in ms and two writes in the same
  // millisecond would collide, making this check pass for the wrong reason.
  await new Promise((r) => setTimeout(r, 20))
  writeFileSync(p('cas.txt'), 'agent wrote this\n')
  const w12 = F.writeFile(p('cas.txt'), 'my edit\n', stale12)
  const disk12 = readFileSync(p('cas.txt'), 'utf8')
  ok(12, w12.kind === 'stale' && disk12 === 'agent wrote this\n',
    `12 — a stale token refuses and writes NOTHING: kind=${w12.kind} disk=${JSON.stringify(disk12)}`)

  // 13 — deleted underneath the draft. Its own detail, and still `stale`
  // rather than a silent re-creation: a file panel is opened on a file that
  // exists, so recreating one the user (or an agent) deliberately removed is
  // resurrecting content nobody asked for.
  writeFileSync(p('gone.txt'), 'here\n')
  const base13 = F.readFile(p('gone.txt')).mtimeMs
  rmSync(p('gone.txt'))
  const w13 = F.writeFile(p('gone.txt'), 'back?\n', base13)
  ok(13, w13.kind === 'stale' && typeof w13.detail === 'string' && w13.detail.length > 0
      && F.readFile(p('gone.txt')).kind === 'missing',
    `13 — a deleted file refuses as stale and is not recreated: kind=${w13.kind}`)

  // 14 — the byte cap on the way OUT. The read refuses a file over the cap,
  // so the write must too, or a panel can grow a file past the limit it can
  // then never display again. The file on disk is asserted unchanged, which
  // is check 12's clause applied to the other refusal.
  writeFileSync(p('cap.txt'), 'small\n')
  const base14 = F.readFile(p('cap.txt')).mtimeMs
  const w14 = F.writeFile(p('cap.txt'), 'x'.repeat(F.FILE_MAX_BYTES + 1), base14)
  ok(14, w14.kind === 'failed' && readFileSync(p('cap.txt'), 'utf8') === 'small\n',
    `14 — over the byte cap fails and writes nothing: kind=${w14.kind}`)
```

Then add the module to the bundle entry, `scripts/file-entry.cjs`:

```js
module.exports = {
  ...require('../src/shared/file-panel'),
  ...require('../src/main/file-read.ts'),
  ...require('../src/main/file-watch.ts'),
  /* M17: the write verb, in this same plain-node tier for file-read.ts's own
     reason — node:fs is not what moves a module out of it. */
  ...require('../src/main/file-write.ts')
}
```

- [ ] **Step 2: Run the checks to verify they fail**

Run: `npm run verify:file`

Expected: the esbuild `buildSync` at the top of `verify-file.cjs` FAILS to resolve `../src/main/file-write.ts`, so the suite dies at module scope before any check runs. That is the honest RED for "the module does not exist yet" — note that checks 11–14 have therefore *not* been observed failing individually, and confirm their RED in Step 4 by watching them pass only after the implementation lands.

- [ ] **Step 3: Write the implementation**

Create `src/main/file-write.ts`:

```ts
import { chmodSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { basename, dirname, join } from 'node:path'
import { FILE_MAX_BYTES } from '@shared/file-panel'

/**
 * What a save did, and why it did not.
 *
 * Three arms, split POSITIONALLY rather than by parsing an error message —
 * review-commit.ts's `refused`/`failed` distinction applied to a second verb.
 * `stale` means the disk moved underneath you and the fix is to look at what
 * changed; `failed` means this write did not run and the fix is your
 * filesystem. Collapsing them tells a user with a read-only file to go and
 * look at somebody else's changes.
 */
export type FileWriteResult =
  | { kind: 'written'; mtimeMs: number; bytes: number }
  | { kind: 'stale'; detail: string }
  | { kind: 'failed'; detail: string }

/**
 * Write one file, and refuse rather than destroy.
 *
 * `baseMtimeMs` is the `mtimeMs` of the FileResult the caller's content was
 * derived from — the value file-read.ts stamps AFTER its read completes,
 * precisely so it describes the content actually in hand rather than whatever
 * was on disk when the read started. If the file's current mtime differs, the
 * write is REFUSED and nothing is written.
 *
 * `null` means overwrite regardless, and it is reachable only from an explicit
 * control the user presses after seeing a `stale`. It is a PARAMETER rather
 * than a second exported function so there is exactly one write path and the
 * CAS cannot be bypassed by reaching for the other one.
 *
 * NEVER throws — readFile's rule, for readFile's reason.
 */
export function writeFile(path: string, content: string, baseMtimeMs: number | null): FileWriteResult {
  // Refused on the way OUT as well as the way in. Without this a panel could
  // grow a file past the cap it can then never display again.
  const bytes = Buffer.byteLength(content, 'utf8')
  if (bytes > FILE_MAX_BYTES) {
    return { kind: 'failed', detail: `this is larger than the ${FILE_MAX_BYTES} byte limit` }
  }

  // Resolve BEFORE anything else. If the panel's path is a symlink, the
  // temp-and-rename below would replace the LINK with a regular file: the
  // user's symlink silently gone, the real file untouched, and the agent
  // still reading the old target. Resolving writes the target and leaves the
  // link intact.
  let real: string
  let mode: number
  let currentMtimeMs: number
  try {
    real = realpathSync(path)
    const stat = statSync(real)
    if (!stat.isFile()) return { kind: 'failed', detail: 'not a regular file' }
    mode = stat.mode
    currentMtimeMs = stat.mtimeMs
  } catch (error: unknown) {
    // ENOENT here is the file deleted underneath the draft, which is a
    // CONFLICT rather than a filesystem problem: the content in hand
    // describes a file that no longer exists. Recreating it would resurrect
    // something somebody deliberately removed.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { kind: 'stale', detail: 'this file no longer exists on disk' }
    }
    return { kind: 'failed', detail: String(error) }
  }

  // The compare-and-swap. `null` is the deliberate overwrite.
  if (baseMtimeMs !== null && currentMtimeMs !== baseMtimeMs) {
    return { kind: 'stale', detail: 'this file changed on disk since it was opened here' }
  }

  // Temp-and-rename, never writeFileSync in place: the whole premise of this
  // feature is that an agent is reading this same file, and an in-place write
  // is observably torn — a reader landing mid-write sees a truncated file and
  // acts on it. The temp lives in the SAME directory, because a rename across
  // filesystems is not atomic and falls back to a copy.
  const tmp = join(dirname(real), `.${basename(real)}.tc-${randomBytes(6).toString('hex')}.tmp`)
  try {
    writeFileSync(tmp, content, 'utf8')
    // A fresh temp file is created at the process umask (typically 0644), so
    // without this every save silently strips the executable bit off a script
    // and resets any deliberate permissions — a loss discovered days later by
    // something that failed to run.
    chmodSync(tmp, mode)
    renameSync(tmp, real)
  } catch (error: unknown) {
    return { kind: 'failed', detail: String(error) }
  } finally {
    // On every path including a successful rename (where the temp no longer
    // exists and this is a no-op). A leftover temp file in a directory the
    // user is working in is litter this app has no business leaving.
    rmSync(tmp, { force: true })
  }

  let mtimeMs = 0
  try {
    mtimeMs = statSync(real).mtimeMs
  } catch {
    // Vanished between the rename and here. The write really happened, so
    // report it; only the token for the NEXT save is lost, and that save will
    // refuse as stale rather than destroy anything.
  }
  return { kind: 'written', mtimeMs, bytes }
}
```

- [ ] **Step 4: Run the checks to verify they pass**

Run: `npm run verify:file`
Expected: `14/14 passed` (11 before this task — the last check number was 10 plus sub-check `7.0` — now 15 total with the four new ones; report whatever the summary line actually prints rather than trusting this number).

- [ ] **Step 5: Commit**

```bash
git add src/main/file-write.ts scripts/file-entry.cjs scripts/verify-file.cjs
git commit -m "feat(m17): a write verb that refuses rather than destroys"
```

---

### Task 2: The remaining write checks — temp litter, mode, symlink, force

**Files:**
- Test: `scripts/verify-file.cjs` (append checks 15–18)

**Interfaces:**
- Consumes: `writeFile` and `FileWriteResult` from Task 1.
- Produces: nothing new — this task is entirely verification of Task 1's stated mechanics.

Split from Task 1 deliberately: a reviewer could accept the CAS and reject the atomic-write mechanics, and these four checks are what make the spec's "each mechanic prevents a named failure" claims falsifiable rather than prose.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-file.cjs` after check 14:

```js
  // 15 — no temp file left behind, on the SUCCESS path and on the REFUSAL
  // path. The refusal is the one most likely to leak, because it returns
  // early — and a stray `.foo.txt.tc-abc123.tmp` sitting in a repository the
  // user is working in is litter with this app's fingerprints on it. Asserted
  // by reading the directory rather than by trusting the finally block.
  mkdirSync(p('litter'), { recursive: true })
  const litter = (name) => join(DIR, 'litter', name)
  writeFileSync(litter('t.txt'), 'v1\n')
  const base15 = F.readFile(litter('t.txt')).mtimeMs
  F.writeFile(litter('t.txt'), 'v2\n', base15)
  const afterOk = readdirSync(p('litter'))
  F.writeFile(litter('t.txt'), 'v3\n', base15 - 1000)  // deliberately stale
  const afterStale = readdirSync(p('litter'))
  ok(15, afterOk.length === 1 && afterOk[0] === 't.txt'
      && afterStale.length === 1 && afterStale[0] === 't.txt',
    `15 — no temp file survives either path: success=${JSON.stringify(afterOk)} refusal=${JSON.stringify(afterStale)}`)

  // 16 — the mode is preserved. A fresh temp file is created at the umask, so
  // an implementation that forgot the chmod silently strips the executable
  // bit off every script it saves — a loss discovered days later by something
  // that failed to run, with nothing pointing at the editor that caused it.
  writeFileSync(p('script.sh'), '#!/bin/sh\necho hi\n')
  chmodSync(p('script.sh'), 0o755)
  const base16 = F.readFile(p('script.sh')).mtimeMs
  F.writeFile(p('script.sh'), '#!/bin/sh\necho bye\n', base16)
  const mode16 = statSync(p('script.sh')).mode & 0o777
  ok(16, mode16 === 0o755, `16 — the file mode survives a save: mode=${mode16.toString(8)}`)

  // 17 — a symlink's TARGET is written and the link is still a link. Without
  // realpathSync the rename replaces the link with a regular file: the user's
  // symlink silently gone, the real file untouched, and an agent reading the
  // old target forever. Both clauses are needed — asserting only the target's
  // content passes against an implementation that also clobbered the link.
  writeFileSync(p('target.txt'), 'original\n')
  symlinkSync(p('target.txt'), p('link.txt'))
  const base17 = F.readFile(p('link.txt')).mtimeMs
  const w17 = F.writeFile(p('link.txt'), 'through the link\n', base17)
  ok(17, w17.kind === 'written'
      && readFileSync(p('target.txt'), 'utf8') === 'through the link\n'
      && lstatSync(p('link.txt')).isSymbolicLink(),
    `17 — a save through a symlink writes the target and keeps the link: kind=${w17.kind}`)

  // 18 — the OVER-CORRECTION guard for check 12, and it is not a formality: a
  // CAS that refuses unconditionally satisfies 12 perfectly and makes the
  // feature unusable, which is a milestone that never works rather than one
  // that works and is unsafe. null is the deliberate overwrite the user
  // reaches only after being shown the conflict.
  writeFileSync(p('force.txt'), 'theirs\n')
  const w18 = F.writeFile(p('force.txt'), 'mine\n', null)
  ok(18, w18.kind === 'written' && readFileSync(p('force.txt'), 'utf8') === 'mine\n',
    `18 — a null token overwrites deliberately: kind=${w18.kind}`)
```

Add `lstatSync` to the destructure introduced in Task 1's check block, so it reads:

```js
  const { statSync, lstatSync, chmodSync, symlinkSync, readFileSync, readdirSync } = require('node:fs')
```

- [ ] **Step 2: Run the checks to verify they fail**

Run: `npm run verify:file`

Expected: FAIL on 15, 16 and 17 if Task 1's `finally`, `chmodSync` and `realpathSync` were each omitted. Since Task 1 shipped all three, these are CHARACTERISATION checks in `verify:pty-manager` 20's own sense — they pass on first write and earn their place by fault injection, not by ever having failed on their own. **Verify each by injection**: comment out the `finally` block and watch 15 alone go red; comment out `chmodSync` and watch 16 alone go red; replace `realpathSync(path)` with `path` and watch 17 alone go red. Restore all three. Record in the commit message that this was done.

- [ ] **Step 3: No implementation needed**

Task 1 already implements all four behaviours. If any check is red for a reason other than injection, that is a real defect in Task 1 — fix it there.

- [ ] **Step 4: Run the checks to verify they pass**

Run: `npm run verify:file`
Expected: `18` checks reported as passing in the summary line, zero FAIL.

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-file.cjs
git commit -m "test(m17): pin the write verb's atomicity, mode and symlink handling"
```

---

### Task 3: The `file:write` channel — contract, handler, preload, and three counts

**Files:**
- Modify: `src/shared/ipc-contract.ts` (add `FILE_WRITE` to `IPC`, `FileWriteRequest`, and the bridge's `file.write`)
- Modify: `src/main/ipc.ts:261` (add the handler after `FILE_CLOSE`)
- Modify: `src/preload/index.ts:133` (add `write` to the file block)
- Modify: `README.md:184` (the IPC diagram's fenced block)
- Modify: `CLAUDE.md` (the `verify:ipc` row's channel count)

**Interfaces:**
- Consumes: `writeFile` / `FileWriteResult` from Task 1.
- Produces:
  - `IPC.FILE_WRITE = 'file:write'`
  - `export interface FileWriteRequest { panelId: PanelId; path: string; content: string; baseMtimeMs: number | null }`
  - Bridge: `file.write(req: FileWriteRequest): Promise<FileWriteResult>`

  Task 5 calls `window.canvas.file.write(...)`.

- [ ] **Step 1: Run verify:ipc to see the current count**

Run: `npm run build && npm run verify:ipc`
Expected: PASS at **38** channels. Record the number — the next step moves it and three separate places must move with it.

- [ ] **Step 2: Add the channel to the contract**

In `src/shared/ipc-contract.ts`, add to the `IPC` object immediately after `FILE_CLOSE`:

```ts
  /** Disarm the watch. Called from the component's unmount. */
  FILE_CLOSE: 'file:close',
  /**
   * Write a file the renderer has been editing, and refuse rather than
   * destroy.
   *
   * `baseMtimeMs` is the mtime of the FileResult the draft was seeded from,
   * and a mismatch against disk is REFUSED — the answer to #14's own open
   * question about who wins when the agent and the user edit at once. `null`
   * means overwrite regardless, reachable only from a control the user
   * presses after being shown the conflict.
   *
   * A fourth file channel rather than a flag on FILE_READ: reading and
   * writing have different failure sets, and folding them into one channel
   * would make FileResult carry write outcomes it has no business knowing
   * about.
   */
  FILE_WRITE: 'file:write'
```

Add the request type beside `FileReadRequest` (around line 326):

```ts
export interface FileWriteRequest {
  panelId: PanelId
  path: string
  content: string
  /**
   * The mtime the draft was seeded from, or null to overwrite deliberately.
   * Null is NOT a default — it is a user gesture, and the only caller that
   * passes it is the Overwrite control shown after a `stale`.
   */
  baseMtimeMs: number | null
}
```

And in the bridge's `file` block, after `close`:

```ts
    /** Disarm. */
    close(panelId: PanelId): Promise<void>
    /**
     * Save. Resolves to a three-armed result: `written`, `stale` (the disk
     * moved underneath the draft — refused, nothing written), or `failed`
     * (the write did not run). Never rejects.
     */
    write(req: FileWriteRequest): Promise<FileWriteResult>
```

Import `FileWriteResult` alongside the existing `FileResult` import in that file.

- [ ] **Step 3: Add the handler and the preload member**

In `src/main/ipc.ts`, after the `FILE_CLOSE` handler:

```ts
  ipcMain.handle(IPC.FILE_WRITE, (_event, req: FileWriteRequest) =>
    // No sender capture, unlike FILE_READ: this is a plain request/response
    // with nothing to push afterwards. Our own write lands back through the
    // watcher like any other change, which is what makes the panel update
    // itself with no second code path.
    writeFile(req.path, req.content, req.baseMtimeMs))
```

Import `writeFile` from `./file-write` and `FileWriteRequest` from the contract.

In `src/preload/index.ts`, after `close`:

```ts
    write: (req: FileWriteRequest) => ipcRenderer.invoke(IPC.FILE_WRITE, req),
```

Import the `FileWriteRequest` type alongside `FileReadRequest`.

- [ ] **Step 4: Move all three counts in the same edit**

`README.md`, the IPC diagram's fenced block — change the file line to:

```
                       file:open / file:read / file:close / file:write
```

`CLAUDE.md`, the `verify:ipc` table row — change **38 channels after M16** to **39 channels after M17**, and add a sentence naming the new invoke and what it does not do, in the style of the row's existing prose:

> That is up from **38 channels after M16**, and M17's one new invoke is `file:write`: the renderer hands main the bytes and the mtime its draft was seeded from, and main refuses the write outright if the disk has moved since — so the conflict is answered on the side that owns the filesystem, and the renderer never has to decide whether its own copy is still current.

- [ ] **Step 5: Verify the channel and the diagram together**

Run: `npm run build && npm run verify:ipc && npm run verify:meta && npm run typecheck`
Expected: `verify:ipc` PASS at **39**; `verify:meta` 21/21 (check 14 reads the README diagram's own fenced block against the real contract — a stale diagram fails here and nowhere else); typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/shared/ipc-contract.ts src/main/ipc.ts src/preload/index.ts README.md CLAUDE.md
git commit -m "feat(m17): file:write, and the three counts that move with it"
```

---

### Task 4: The editability gate in the pure model

**Files:**
- Modify: `src/renderer/file/file-node-model.ts`
- Test: `scripts/verify-rail.cjs` (append checks 81–82, renumbering if the branch has moved on)

**Interfaces:**
- Consumes: `FileResult` from `@shared/file-panel`.
- Produces: `FileNodeModel` gains `editable: boolean` and `editableNote?: string`. Task 5 reads both.

The decision lives in the pure model rather than as a condition inside JSX, so it is testable in the cheapest tier this repo has.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-rail.cjs`, before the summary block. **Read the file's last check number first** and continue from it rather than trusting these numbers — the branch may have moved.

```js
// 81 — the editability gate, BOTH directions in one read. An `editable` that
// is always false satisfies the truncated half perfectly and deletes the
// milestone, so the untruncated clause is what makes this a check rather than
// a restatement. Truncated text is read-only because saving a truncated
// buffer back would delete every line past FILE_MAX_LINES with a
// successful-looking result — "half a file is a different file" in its most
// destructive available form.
const editable = R.buildFileNodeModel({
  source: { path: '/tmp/a/notes.md' },
  title: undefined,
  result: { kind: 'text', content: 'one\ntwo\n', bytes: 8, lines: 2, truncatedLines: 0, mtimeMs: 1 }
})
const truncated = R.buildFileNodeModel({
  source: { path: '/tmp/a/huge.log' },
  title: undefined,
  result: { kind: 'text', content: 'one\n', bytes: 999, lines: 40000, truncatedLines: 30000, mtimeMs: 1 }
})
ok(81, editable.editable === true && truncated.editable === false
    && typeof truncated.editableNote === 'string' && truncated.editableNote.length > 0,
  `81 — untruncated text is editable, truncated text is not and says why: ` +
  `editable=${editable.editable} truncated=${truncated.editable}`)

// 82 — every NON-text arm is uneditable, and each says why in its OWN
// sentence. Four arms collapsed onto one note tells a user reading "binary"
// that reopening the file will help; this is check 78's non-vacuity rule
// applied to the gate rather than to the note.
const arms = [
  { kind: 'missing' },
  { kind: 'too-large', bytes: 9e6, cap: 2097152 },
  { kind: 'binary', bytes: 42 },
  { kind: 'unreadable', detail: 'EACCES' }
].map((result) => R.buildFileNodeModel({ source: { path: '/tmp/a/x' }, title: undefined, result }))
const notes82 = arms.map((m) => m.editableNote)
ok(82, arms.every((m) => m.editable === false)
    && notes82.every((n) => typeof n === 'string' && n.length > 0)
    && new Set(notes82).size === notes82.length,
  `82 — no non-text arm is editable and each says why distinctly: ` +
  `editable=${JSON.stringify(arms.map((m) => m.editable))}`)
```

- [ ] **Step 2: Run the checks to verify they fail**

Run: `npm run verify:rail`
Expected: FAIL on 81 and 82 with `editable=undefined` — the field does not exist yet. Both fail rather than throwing, because reading an absent property yields `undefined` rather than raising, so neither aborts the run.

- [ ] **Step 3: Write the implementation**

In `src/renderer/file/file-node-model.ts`, add to the `FileNodeModel` interface:

```ts
  /**
   * Whether this file may be edited in the panel.
   *
   * A property of the RESULT, not of the panel: only `text` with nothing
   * dropped by the render cap qualifies. A truncated buffer saved back would
   * delete every line past FILE_MAX_LINES, which is prompts.ts's "half a file
   * is a different file" rule in its most destructive available form — the
   * panel shows 10,000 lines of a 40,000-line file, the user fixes a typo on
   * line 3, and 30,000 lines are gone with a successful-looking result.
   */
  editable: boolean
  /**
   * Why not, when not. Present for every uneditable arm and absent when
   * `editable` is true — the pencil is rendered PRESENT AND DISABLED with
   * this as its reason rather than hidden, which is verify:palette 31's
   * standing rule: a control that disappears is indistinguishable from a
   * feature that was never built, and this is exactly the case where a user
   * will go looking for it.
   */
  editableNote?: string
```

Extend `shell` and each arm's return. `shell` gains the uneditable default so no arm can forget it:

```ts
  const shell = { heading, directory: dir, lines: [] as FileLine[], editable: false }
```

The in-flight case (`input.result === undefined`) becomes:

```ts
  if (input.result === undefined) {
    return { ...shell, summary: 'reading…', editableNote: 'This file is still being read.' }
  }
```

The `text` arm decides:

```ts
    case 'text': {
      const lines = /* unchanged */
      return {
        ...shell,
        summary: /* unchanged */,
        lines,
        ...(r.truncatedLines > 0
          ? {
              truncatedNote: `${r.truncatedLines} more lines not shown`,
              editableNote: `This file is longer than the ${FILE_MAX_LINES.toLocaleString()} line viewing limit, so editing it here would drop the rest.`
            }
          : { editable: true }),
      }
    }
```

Import `FILE_MAX_LINES` as a value from `@shared/file-panel` (the existing import is type-only; widen it).

The four non-text arms each gain their own `editableNote`:

```ts
    case 'missing':
      return { ...shell, summary: 'not found', note: 'This file no longer exists. It will reappear here if it is recreated.', editableNote: 'There is no file here to edit.' }
    case 'too-large':
      return { ...shell, summary: humanBytes(r.bytes), note: `This file is larger than the ${humanBytes(r.cap)} viewing limit.`, editableNote: 'This file is too large to open here, so it cannot be edited here either.' }
    case 'binary':
      return { ...shell, summary: humanBytes(r.bytes), note: 'This looks like a binary file, so there is nothing to show as text.', editableNote: 'A binary file cannot be edited as text.' }
    case 'unreadable':
      return { ...shell, summary: 'unreadable', note: `This file could not be read: ${r.detail}`, editableNote: 'This file could not be read, so it cannot be edited.' }
```

- [ ] **Step 4: Run the checks to verify they pass**

Run: `npm run verify:rail && npm run typecheck:web`
Expected: both new checks PASS, every pre-existing rail check still PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/file/file-node-model.ts scripts/verify-rail.cjs
git commit -m "feat(m17): the editability gate, decided in the pure model"
```

---

### Task 5: Edit mode in `FileNode.tsx`

**Files:**
- Modify: `src/renderer/file/FileNode.tsx`
- Modify: `src/renderer/styles.css`
- Modify: `src/renderer/navgrid/useNavGrid.ts:94`

**Interfaces:**
- Consumes: `model.editable` / `model.editableNote` (Task 4), `window.canvas.file.write` (Task 3), `FileWriteResult` (Task 1).
- Produces: the DOM contract the Task 6 checks read — `[data-file-node-editor]` on the textarea, `[data-file-node-edit]` on the pencil, `[data-file-node-conflict]` on the banner, `[data-file-node-save]` on the save control.

- [ ] **Step 1: Add the draft state and the pencil**

In `FileNodeImpl`, beside the existing `refreshToken` state:

```tsx
  // The draft lives HERE, never in file-store.ts. That store's own header
  // says it is "a cache of main's answer, never a second author of it", and a
  // draft is by definition not main's answer. Watcher pushes keep landing in
  // the store while a draft is open — the store stays a faithful cache — and
  // it is this component that decides not to reseed from them.
  const [draft, setDraft] = useState<string | null>(null)
  // The CAS token: the mtime of the result the draft was seeded from. NOT
  // updated by arriving pushes, which is the entire point — a token that
  // followed the disk would make every save succeed and every conflict
  // silent.
  const [baseMtimeMs, setBaseMtimeMs] = useState<number | null>(null)
  const [conflict, setConflict] = useState<null | 'disk-changed' | 'refused'>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const editing = draft !== null
  const dirty = editing && result?.kind === 'text' && draft !== seedRef.current
```

Track the seed in a ref so `dirty` is a comparison against what was seeded rather than against the live store value:

```tsx
  const seedRef = useRef<string>('')
```

The pencil control in the chrome, beside the refresh button:

```tsx
        <button
          type="button"
          className="file-node__edit"
          data-file-node-edit
          disabled={!model.editable || editing}
          // Present and DISABLED rather than hidden. verify:palette 31's rule:
          // a control that disappears is indistinguishable from a feature that
          // was never built, and a user who wants to edit a 40,000-line log is
          // precisely the person who will go looking for this button.
          title={model.editable ? 'Edit this file' : model.editableNote}
          onMouseDown={(event) => {
            // shellControl's rule, which every control in this app obeys:
            // preventDefault keeps DOM focus off the button, stopPropagation
            // stops the header starting a drag from a click inside it.
            event.stopPropagation()
            event.preventDefault()
            if (!model.editable || result?.kind !== 'text') return
            seedRef.current = result.content
            setDraft(result.content)
            setBaseMtimeMs(result.mtimeMs)
            setConflict(null)
            setSaveError(null)
          }}
        >
          ✎
        </button>
```

- [ ] **Step 2: Add the reseed-or-banner effect**

```tsx
  // An arriving change while a draft is open. NOT DIRTY reseeds: nothing is
  // lost, and a panel that went stale the moment you opened it to edit would
  // be a worse version of the read view you just left. DIRTY does not: the
  // draft is left exactly as typed and the banner says so, at the moment it
  // happens rather than at the moment the user tries to save.
  useEffect(() => {
    if (draft === null || result?.kind !== 'text') return
    if (result.mtimeMs === baseMtimeMs) return
    if (draft !== seedRef.current) {
      setConflict('disk-changed')
      return
    }
    seedRef.current = result.content
    setDraft(result.content)
    setBaseMtimeMs(result.mtimeMs)
  }, [result, draft, baseMtimeMs])
```

- [ ] **Step 3: Add save, discard and the conflict banner**

```tsx
  const save = (force: boolean): void => {
    if (draft === null) return
    setSaveError(null)
    void window.canvas.file
      .write({ panelId: id, path, content: draft, baseMtimeMs: force ? null : baseMtimeMs })
      .then((res) => {
        if (res.kind === 'written') {
          // Leave edit mode on success. The watcher's own push will bring the
          // saved content back through the store a moment later, so there is
          // nothing to reseed by hand — one code path for "what does this file
          // say", the same reason the refresh control re-runs the read effect
          // rather than being a second read.
          setDraft(null)
          setConflict(null)
          return
        }
        if (res.kind === 'stale') { setConflict('refused'); return }
        setSaveError(res.detail)
      })
      // MANDATORY, the rule the read effect already states: an unhandled
      // rejection leaves a draft that looks saved and is not.
      .catch((error: unknown) => setSaveError(String(error)))
  }
```

The body, when `editing`, renders the textarea instead of the `<pre>`:

```tsx
        {editing ? (
          <>
            {conflict !== null && (
              <div className="file-node__conflict" data-file-node-conflict>
                <span>
                  {conflict === 'refused'
                    ? 'This file changed on disk, so the save was refused.'
                    : 'This file changed on disk.'}
                </span>
                <button type="button" onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); setDraft(null); setConflict(null) }}>
                  Reload (discard mine)
                </button>
                {conflict === 'refused' && (
                  <button type="button" onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); save(true) }}>
                    Overwrite theirs
                  </button>
                )}
              </div>
            )}
            {saveError !== null && <p className="file-node__note">{saveError}</p>}
            <textarea
              className="file-node__editor"
              data-file-node-editor
              autoFocus
              spellCheck={false}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                // Every key, not only the two handled here — useViewport's and
                // usePalette's listeners are on `window`, above this in the
                // bubble path, so without this a Cmd+N typed into a draft
                // spawns a panel behind the file.
                event.stopPropagation()
                if (event.metaKey && event.key === 's') { event.preventDefault(); save(false) }
                if (event.key === 'Escape') { event.preventDefault(); setDraft(null); setConflict(null) }
              }}
            />
            <button type="button" className="file-node__save" data-file-node-save
              onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); save(false) }}>
              Save
            </button>
          </>
        ) : model.note !== undefined ? (
          /* ...the existing note branch, unchanged... */
        ) : (
          /* ...the existing <pre> branch, unchanged... */
        )}
```

- [ ] **Step 4: Stand the nav grid down over an open draft**

In `src/renderer/navgrid/useNavGrid.ts:94`, widen the target test:

```ts
        // A second text surface inheriting the guard the review node's commit
        // form already needed. This listener is CAPTURE-phase on window and
        // has already run by the time the field's own bubble-phase
        // stopPropagation could help — so without this, Cmd+G typed into a
        // draft reveals the grid, the open branch's `default:` arm swallows
        // every further keystroke, and releasing Cmd switches workspace and
        // unmounts the panel with the draft unsaved. The test is the event's
        // TARGET, never document.activeElement: xterm's own helper is a
        // <textarea>, so an activeElement test would disable Cmd+G over every
        // ordinary terminal panel.
        if (target?.closest?.('.review-node__commit-form, .file-node__editor')) return
```

- [ ] **Step 5: Add the styles**

In `src/renderer/styles.css`, beside the existing `.file-node__*` rules. **Tokens only** — `verify:styles` 1 fails on any hardcoded colour outside a theme block, 4–6 fail on literal type/radius/spacing values:

```css
.file-node__editor {
  width: 100%;
  flex: 1;
  resize: none;
  border: none;
  background: var(--s-1);
  color: var(--fg);
  font-family: var(--font-mono);
  font-size: var(--t-2);
  line-height: var(--lh-body);
  padding: var(--sp-2);
}
.file-node__conflict {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  padding: var(--sp-2);
  background: var(--amber-dim);
  color: var(--fg);
  font-size: var(--t-1);
}
```

Read the actual token names out of `styles.css` before writing this — the names above are indicative, and `verify:styles` 2 fails on any `var(--token)` that is not declared.

- [ ] **Step 6: Verify the styles and the types**

Run: `npm run verify:styles && npm run typecheck:web`
Expected: `verify:styles` 11/11, typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/file/FileNode.tsx src/renderer/styles.css src/renderer/navgrid/useNavGrid.ts
git commit -m "feat(m17): edit mode, the dirty guard, and the conflict banner"
```

---

### Task 6: End-to-end — typing, saving, and a write that lands under a dirty draft

**Files:**
- Modify: `scripts/verify-panels.cjs` (append checks 158–159, renumbering from whatever the file's last number actually is)

**Interfaces:**
- Consumes: everything from Tasks 1–5, through a real renderer.
- Produces: nothing — this is the milestone's only proof that the pieces are wired to each other rather than merely correct in isolation.

- [ ] **Step 1: Write the failing checks**

Append to `scripts/verify-panels.cjs`, following the M16 file-panel block (around line 9290) so the fixture conventions are in view. Use a fixture directory with a SPACE, as that block already does.

```js
    // 158 — type and save, read back OFF DISK. Reading the panel back would
    // only prove the textarea holds what was typed into it; the bytes are the
    // claim. The value is set through the NATIVE setter plus an `input` event
    // because assigning .value alone leaves React's state untouched and the
    // save would go out with the seeded content — the trap check 113 already
    // records for the review node's commit message.
    {
      const FIXTURE = join(M17_DIR, 'edit me.txt')
      writeFileSync(FIXTURE, 'before\n')
      await wc.executeJavaScript(`window.__m13Open(${JSON.stringify(FIXTURE)})`)
      await waitUntil(() => wc.executeJavaScript(
        `!!document.querySelector('[data-panel-kind="file"] [data-file-node-edit]')`))
      await wc.executeJavaScript(`
        document.querySelector('[data-panel-kind="file"] [data-file-node-edit]')
          .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      `)
      await waitUntil(() => wc.executeJavaScript(
        `!!document.querySelector('[data-file-node-editor]')`))
      await wc.executeJavaScript(`
        (() => {
          const ta = document.querySelector('[data-file-node-editor]')
          const setter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype, 'value').set
          setter.call(ta, 'after my edit\\n')
          ta.dispatchEvent(new Event('input', { bubbles: true }))
          ta.dispatchEvent(new KeyboardEvent('keydown',
            { key: 's', metaKey: true, bubbles: true }))
        })()
      `)
      await waitUntil(async () => readFileSync(FIXTURE, 'utf8') === 'after my edit\n', 4000)
      const disk158 = readFileSync(FIXTURE, 'utf8')
      ok(158, disk158 === 'after my edit\n',
        `158 — typing and Cmd+S write the bytes to disk: ${JSON.stringify(disk158)}`)
    }

    // 159 — an external write while the draft is DIRTY. Both clauses are
    // required and neither implies the other: the draft surviving alone is
    // satisfied by a panel that never received the push at all, and the
    // banner alone is satisfied by a panel that raised it and clobbered the
    // draft anyway. The wait is on the banner rather than a fixed sleep,
    // since WATCH_DEBOUNCE_MS is a bound and not a duration.
    {
      const FIXTURE = join(M17_DIR, 'raced.txt')
      writeFileSync(FIXTURE, 'v1\n')
      await wc.executeJavaScript(`window.__m13Open(${JSON.stringify(FIXTURE)})`)
      await waitUntil(() => wc.executeJavaScript(
        `!!document.querySelector('[data-panel-kind="file"] [data-file-node-edit]')`))
      // Enter edit mode on the NEWEST file panel, since 158 left one open.
      await wc.executeJavaScript(`
        (() => {
          const nodes = [...document.querySelectorAll('[data-panel-kind="file"]')]
          nodes[nodes.length - 1].querySelector('[data-file-node-edit]')
            .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        })()
      `)
      await waitUntil(() => wc.executeJavaScript(
        `!!document.querySelector('[data-file-node-editor]')`))
      await wc.executeJavaScript(`
        (() => {
          const ta = document.querySelector('[data-file-node-editor]')
          const setter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype, 'value').set
          setter.call(ta, 'my unsaved work\\n')
          ta.dispatchEvent(new Event('input', { bubbles: true }))
        })()
      `)
      // "The agent" writes.
      writeFileSync(FIXTURE, 'the agent wrote this\n')
      await waitUntil(() => wc.executeJavaScript(
        `!!document.querySelector('[data-file-node-conflict]')`), 5000)
      const state159 = await wc.executeJavaScript(`
        ({
          draft: document.querySelector('[data-file-node-editor]')?.value ?? null,
          banner: !!document.querySelector('[data-file-node-conflict]')
        })
      `)
      ok(159, state159.draft === 'my unsaved work\n' && state159.banner === true,
        `159 — a write under a dirty draft raises the banner and does not clobber it: ` +
        `draft=${JSON.stringify(state159.draft)} banner=${state159.banner}`)
    }
```

Declare `M17_DIR` beside the M16 block's own fixture directory, using the same spaced-`mkdtempSync` convention, and remove it in the same teardown that removes M16's.

- [ ] **Step 2: Run the checks to verify they fail**

Run: `npm run build && npm run verify:panels > /tmp/p.txt 2>&1; echo "EXIT=$?"; grep -n "^FAIL" /tmp/p.txt`

Expected against a tree WITHOUT Task 5: check 158's first `waitUntil` times out because `[data-file-node-edit]` does not exist. **If that timeout throws rather than returning false, it aborts the run and check 159 never executes** — so confirm 159's RED separately once 158 is green, by temporarily reverting the dirty branch of the reseed effect (Task 5, Step 2) and watching 159 alone go red.

- [ ] **Step 3: No implementation needed**

Tasks 1–5 are the implementation. A red here is a wiring defect in one of them; fix it there rather than loosening the check.

- [ ] **Step 4: Run the full chain**

Run: `npm run verify > /tmp/verify.txt 2>&1; echo "EXIT=$?"; grep -c "^FAIL" /tmp/verify.txt; tail -3 /tmp/verify.txt`
Expected: `EXIT=0`, zero FAIL lines, and the panels summary at 159/159 (or whatever the file's own numbering produces — report the printed line, do not assume).

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-panels.cjs
git commit -m "test(m17): the editable file panel, end to end through a real renderer"
```

---

### Task 7: Record what M17 decided, and what it did not

**Files:**
- Modify: `CLAUDE.md` (the verify table rows for `verify:file`, `verify:rail`, `verify:panels`; a new Load-bearing details entry)
- Modify: `docs/ideas-backlog.md` (#14's status paragraph)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. This is the entry that stops the next reader "simplifying" the CAS away.

CLAUDE.md is an engineering decisions log, and every entry records a load-bearing invariant plus the *silent* failure that follows from undoing it. The three facts here that have no runtime symptom when broken are exactly the ones that need writing down.

- [ ] **Step 1: Add the Load-bearing details entry**

Add after the M16 file-watch entry ("The watch is on the DIRECTORY…"):

```markdown
**A save is a compare-and-swap, and the refusal writes NOTHING
(`main/file-write.ts`).** M16 built the file panel read-only specifically so
it would not have to answer #14's own open question — who wins when the agent
and the user edit the same file at once. M17 answers it: a write carries the
`mtimeMs` its draft was seeded from, and main refuses outright if the disk has
moved since. The token costs nothing to obtain, because `file-read.ts` already
stamps `mtimeMs` AFTER its read completes, deliberately, so it describes the
content actually in hand rather than whatever was on disk when the read
started.

**The no-write half of the refusal is the whole thing**, and it is what
`verify:file` 12 asserts alongside the arm: an implementation that refused the
caller and wrote the file anyway satisfies every assertion phrased about the
RESULT, and destroys an agent's work silently. `verify:credentials` 6 states
the identical rule for the credential store's plaintext refusal, and for the
identical reason — a refusal that is not observed at the filesystem is not a
refusal.

**`verify:file` 18 is the over-correction guard and is not a formality.** A
CAS written backwards refuses every save there is, which is a feature that
never works rather than one that works and is unsafe — and it would pass check
12 perfectly. This is the shape `verify:review` 37b already states for the
baseline sweep.

**Three mechanics of the write are each defended by their own check, because
each fails silently.** The temp-and-rename is what stops an agent reading a
torn file mid-save (and it is the exact code path `FileWatchers` was built to
survive, so every save now exercises it); `realpathSync` is what stops the
rename replacing a SYMLINK with a regular file, leaving the user's link gone
and the real target untouched; and the mode copy is what stops every save
stripping the executable bit off a script, a loss discovered days later by
something that failed to run. All three are CHARACTERISATION checks in
`verify:pty-manager` 20's sense — they passed on first write and earn their
place by fault injection (`verify:file` 15, 16, 17), not by ever having failed
on their own.

**A truncated file is READ-ONLY, and the pencil says so rather than vanishing
(`file-node-model.ts`'s `editable`).** `FileResult.content` is capped at
`FILE_MAX_LINES` while `lines` reports the file's real count, so an edited
truncated buffer saved back deletes everything past line 10,000 — "half a file
is a different file" in its most destructive available form, and it would
report success. The gate lives in the pure model rather than as a condition
inside JSX so it is checkable in the cheapest tier (`verify:rail` 81, which
asserts BOTH directions: an `editable` that is always false satisfies the
truncated half and deletes the milestone). The control is present and DISABLED
with its reason, `verify:palette` 31's rule — a user who wants to edit a
40,000-line log is precisely the person who will go looking for that button.

**The draft lives in the component; `file-store.ts` stays a cache
(`FileNode.tsx`).** That store's own header says it is "a cache of main's
answer, never a second author of it", and a draft is by definition not main's
answer. Watcher pushes keep landing in the store while a draft is open, and
the COMPONENT decides not to reseed from them when dirty. The asymmetry is
deliberate and is the one place this design lets content change under the
cursor: an untouched draft reseeds (nothing is lost, and a panel that went
stale the moment you opened it to edit is a worse read view), while a dirty one
does not and raises a banner instead. `verify:panels` 159 asserts BOTH clauses
in one read, because the draft surviving alone is satisfied by a panel that
never received the push.

**`.file-node__editor` joins `.review-node__commit-form` in `useNavGrid`'s
target test.** A second text surface inheriting an already-diagnosed failure:
that listener is CAPTURE-phase on `window` and has already run by the time the
field's own bubble-phase `stopPropagation` could help, so unguarded, `Cmd+G`
typed into a draft reveals the grid, the open branch's `default:` arm swallows
every further keystroke, and releasing `Cmd` switches workspace and unmounts
the panel with the draft unsaved. The test is the event's TARGET and never
`document.activeElement`, because xterm's own helper is a `<textarea>` and an
activeElement test would disable `Cmd+G` over every ordinary terminal panel.

**What M17 did NOT solve, kept honest.** The CAS window is not zero — `statSync`
and the `rename` are two syscalls and a write landing between them is not
caught; closing that needs file locking, which is not portable, against a
window of microseconds. Nothing merges: the choice is reload-and-lose-mine or
overwrite-theirs, because a three-way merge needs a common ancestor this design
does not keep. Encoding is UTF-8 always, inherited from M16's reader — a file
in another encoding already displays as mojibake, and what M17 adds is that
saving makes that corruption permanent. And **both edit-mode exits restore
focus, which no automated check can observe**: DOM focus after an unmount is a
browser default action an untrusted event never performs, the same limit this
file already records for `ReviewNode`'s `closeDraft`.
```

- [ ] **Step 2: Update the three verify table rows**

- `verify:file`: raise the count and describe checks 11–18, naming 12 as the one worth knowing by number (the refusal writing nothing) and 18 as its over-correction guard.
- `verify:rail`: raise the count and describe 81–82, naming 81's both-directions clause.
- `verify:panels`: raise the count and describe 158–159, naming 159's two required clauses.

Copy the existing rows' style: what the check asserts, and what silent failure it rejects.

- [ ] **Step 3: Update the backlog**

In `docs/ideas-backlog.md` #14, replace the "Tier 1 landed in M16" paragraph's last two sentences with:

```markdown
The "who wins when both edit" question in the last bullet was **answered in
M17**, which made the panel editable: a save carries the mtime its draft was
seeded from, and main refuses the write outright if the disk has moved since —
"reload unless the panel is dirty, then warn" as this entry proposed, plus an
explicit overwrite the user reaches only after being shown the conflict. Tiers
2–4 remain open and unstarted; nothing about M16's or M17's design commits to
how any of them would work.
```

- [ ] **Step 4: Verify the docs**

Run: `npm run verify:meta`
Expected: 21/21. Check 14 reads the README's IPC diagram against the real contract; Task 3 already moved it, and this step confirms nothing in the prose edits disturbed a required heading.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/ideas-backlog.md
git commit -m "docs(m17): record the CAS, the editability gate, and what stayed unsolved"
```

---

## Self-Review

**Spec coverage** — every section maps to a task:

| Spec section | Task |
|---|---|
| §1 the write verb, all six mechanics | 1 (implementation + CAS/cap checks), 2 (atomicity/mode/symlink/force checks) |
| §2 one new invoke, three counts | 3 |
| §3 the mode, the draft's home, the gate, the banners, the keys | 4 (gate in the model), 5 (mode, draft, banners, keys, nav grid) |
| §4 verification, all three tiers | 1, 2 (`verify:file`), 4 (`verify:rail`), 6 (`verify:panels`) |
| §5 known limitations | 7 |

**Type consistency** — `FileWriteResult`'s three arms and `writeFile`'s
signature are defined in Task 1 and used verbatim in Tasks 3 and 5;
`FileWriteRequest`'s four fields are defined in Task 3 and constructed in Task
5's `save`; `editable`/`editableNote` are defined in Task 4 and read in Task 5.
`baseMtimeMs` carries the same name and the same `number | null` type at every
layer.

**Numbering** — every check number in this plan is written against the counts
observed on this branch's baseline (`verify:file` last number 10, `verify:rail`
80, `verify:panels` 157). Each task says to read the file's actual last number
first rather than trusting these.
