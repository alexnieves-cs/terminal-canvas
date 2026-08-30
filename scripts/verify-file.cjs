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

  console.log('')
  const failed = results.filter((r) => !r.pass)
  console.log(`${results.length - failed.length}/${results.length} passed`)
  rmSync(DIR, { recursive: true, force: true })
  process.exit(failed.length === 0 ? 0 : 1)
})()
