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
const { mkdtempSync, writeFileSync, renameSync, rmSync, mkdirSync, statSync, readFileSync } = require('node:fs')
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
  ok(1, r1.kind === 'text' && r1.content === 'one\ntwo\nthree\n' && r1.bytes === 14 && r1.lines === 3 && r1.truncatedLines === 0,
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
  ok('7b', first.kind === 'text' && first.content === 'before\n',
    `7b — watch() returns the first read, so there is no armed-but-blank window: kind=${first.kind}`)
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

  // ── M17: the write verb ────────────────────────────────────────────────

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

  console.log('')
  const failed = results.filter((r) => !r.pass)
  console.log(`${results.length - failed.length}/${results.length} passed`)
  rmSync(DIR, { recursive: true, force: true })
  process.exit(failed.length === 0 ? 0 : 1)
})()
