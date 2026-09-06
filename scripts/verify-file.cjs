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
const { mkdtempSync, writeFileSync, renameSync, rmSync, mkdirSync, statSync, readFileSync, lstatSync, chmodSync, symlinkSync, readdirSync, existsSync, appendFileSync } = require("node:fs")
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
  // The atomic write is RE-DRIVEN until it is observed, rather than performed
  // once — and that is a fixture fix, not a weakening of the assertion. On
  // macOS fs.watch arms ASYNCHRONOUSLY (FSEvents), so `watch()` returns before
  // the watcher is actually receiving anything, and a rename issued on the very
  // next synchronous line can land in that window and be missed entirely.
  // MEASURED on unmodified main before M27 touched this file: 5 failures in 20
  // runs, i.e. a 25% flake on the repo's one green-or-not signal, with nothing
  // wrong in FileWatchers at all.
  //
  // A fixed sleep is what this repo refuses everywhere else (a sleep against an
  // async signal is a flake, not a bound), so the gesture itself is repeated:
  // each iteration is a REAL temp-file-plus-rename, so what is asserted is
  // unchanged. It still fails against the naive fs.watch(path) implementation
  // this check exists to reject — that watch dies with the first rename's
  // inode and fires for no later one either, so re-driving cannot rescue it.
  const atomic7 = () => {
    writeFileSync(p('watched.tmp'), 'after\n')
    renameSync(p('watched.tmp'), p('watched.txt'))
  }
  atomic7()
  let c7 = await nextChange(calls7, 400)
  for (let i = 0; c7 === null && i < 8; i += 1) {
    atomic7()
    c7 = await nextChange(calls7, 400)
  }
  ok(7, c7 !== null && c7.kind === 'text' && c7.content === 'after\n',
    `7 — an ATOMIC write (temp + rename) still fires: ${c7 === null ? 'no event' : c7.content.trim()}`)

  // 8 — the dedupe. A write that does not change the content produces NO
  // event. The window spans several debounce periods deliberately, for the
  // reason verify:pty-manager 23's window does: a sample too short sees the
  // same thing under either implementation and stays green against the defect.
  //
  // KNOWN LIMIT, found while fixing checks 7 and 9 and deliberately NOT fixed
  // here: this is a NEGATIVE assertion, so the arming race those two fix makes
  // it pass for the WRONG reason rather than fail — a watcher that never armed
  // reports no events just as convincingly as a correct dedupe. Closing it
  // means proving the watcher is live with a probe write first and asserting a
  // DELTA rather than `calls8.length === 0`, which is a larger edit to a check
  // whose subject M27 does not touch. Check 10 carries the same caveat.
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
  // Re-driven for check 7's reason, and it is the SAME arming race: fs.watch
  // returns before FSEvents is delivering, so an rmSync on the next line can
  // land unobserved. Each iteration re-creates and re-deletes, so the gesture
  // asserted is unchanged — and a watcher that never fires for a deletion
  // still fails, because no repetition rescues one that is not listening.
  writeFileSync(p('doomed.txt'), 'here\n')
  watchers.watch('f3', p('doomed.txt'), (r) => calls9.push(r))
  rmSync(p('doomed.txt'))
  let c9 = await nextChange(calls9, 400)
  for (let i = 0; c9 === null && i < 8; i += 1) {
    writeFileSync(p('doomed.txt'), 'here\n')
    rmSync(p('doomed.txt'))
    c9 = await nextChange(calls9, 400)
  }
  ok(9, c9 !== null && c9.kind === 'missing',
    `9 — deleting the file pushes missing: ${c9 === null ? 'no event' : c9.kind}`)

  // 10 — closeAll() really disarms. Asserted by WRITING after the close and
  // observing nothing, never by reading an internal count alone: a count that
  // went to zero while the FSWatcher stayed alive is exactly the leak this
  // guards, and it is what a Cmd+R reload would do once per file panel,
  // forever, in a main process the reload does not restart.
  // Same known limit check 8 records: a NEGATIVE assertion that the fs.watch
  // arming race satisfies for the wrong reason. Not fixed here.
  const calls10 = []
  writeFileSync(p('after-close.txt'), 'v1\n')
  watchers.watch('f4', p('after-close.txt'), (r) => calls10.push(r))
  watchers.closeAll()
  writeFileSync(p('after-close.txt'), 'v2\n')
  const c10 = await nextChange(calls10, 1500)
  ok(10, c10 === null && watchers.count() === 0,
    `10 — closeAll disarms: events=${calls10.length} count=${watchers.count()}`)

  // ── M22: the write verb ────────────────────────────────────────────────

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

  // 15 — no temp file left behind, on the SUCCESS path and on the REFUSAL
  // path. What this proves: neither path leaves a stray
  // `.foo.txt.tc-abc123.tmp` in the directory — a litter file with this
  // app's fingerprints on it, in a repository the user is working in —
  // asserted by reading the directory rather than by trusting the code.
  //
  // What it does NOT prove: that the `finally { rmSync(tmp, ...) }` block
  // itself is exercised. `renameSync` consumes the temp file on the success
  // path, and the stale refusal returns before `tmp` is even constructed —
  // so neither path this check drives ever depends on that cleanup running.
  // The block is reachable only from a throw BETWEEN `writeFileSync` and
  // `renameSync`, and there is no honest way to force that on macOS: a
  // read-only directory fails the temp CREATION itself (so there is no temp
  // to leak), a directory target is refused before the temp is ever
  // constructed, and EXDEV is unreachable because the temp is deliberately
  // created in the target's own directory. Forcing it needs a filesystem
  // fault injector this repo does not have, so the block stays uncovered by
  // design rather than by oversight. Confirmed by injection: commenting out
  // the `finally` block left this check green — 19/19, unchanged.
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
  // realpathSync, renameSync(tmp, real) renames onto the LINK's own path
  // rather than the target's: the user's symlink is silently replaced by a
  // regular file, and target.txt is never touched at all. For that
  // regression both clauses fail TOGETHER — the target's content clause
  // alone is the discriminator, since the write never reaches target.txt
  // either way. Confirmed by injection (real = path instead of
  // realpathSync(path)): both the content read and isSymbolicLink() failed
  // in the same run. The isSymbolicLink() clause is defence-in-depth for a
  // narrower case it alone would catch — an implementation that resolves the
  // path correctly for the WRITE but still renames over the original
  // (unresolved) path, which would leave the content clause green while
  // silently destroying the link. Not the primary discriminator here, but
  // not redundant either.
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


  // ── M27. createFile: the note's creation verb. ─────────────────────────
  //
  // These five join this suite rather than getting one of their own for
  // file-read.ts's own reason: file-create.ts imports node:fs and node:path
  // and neither electron nor node-pty, and node:fs is not what moves a
  // module out of this tier.

  // 19 — the ordinary case, and the returned mtimeMs is asserted against a
  // FRESH statSync rather than trusted. That number BECOMES the panel's first
  // compare-and-swap token, so a create that reported an invented timestamp
  // would make the note's very first save refuse itself — which reads as
  // "saving is broken" and points nowhere near the return value that caused
  // it. Check 11 states the identical rule for writeFile.
  {
    const res = F.createFile(DIR, 'notes/standup.md', '# standup\n\n')
    const disk = readFileSync(join(DIR, 'notes', 'standup.md'), 'utf8')
    const fresh = statSync(join(DIR, 'notes', 'standup.md')).mtimeMs
    ok(19, res.kind === 'created'
        && res.path === join(DIR, 'notes', 'standup.md')
        && res.mtimeMs === fresh
        && disk === '# standup\n\n',
      `19 — createFile writes the seed and reports the real mtime, creating the parent: kind=${res.kind} disk=${JSON.stringify(disk)}`)
  }

  // 20 — THE CHECK THIS VERB EXISTS FOR, and it is check 12's rule reaching a
  // second write path: an EXISTING file is refused AND ITS BYTES ARE
  // UNCHANGED. Asserting only the refusal passes against an implementation
  // that refused the caller and clobbered the file anyway, which is exactly
  // the silent destruction `wx` is chosen to prevent — an existsSync check
  // followed by a write is a TOCTOU, and in this app the racing writer is an
  // autonomous agent working in the same directory, so that race is the
  // ordinary case rather than an exotic one.
  {
    writeFileSync(p('taken.md'), 'the agent wrote this\n')
    const res = F.createFile(DIR, 'taken.md', '# taken\n\n')
    ok(20, res.kind === 'exists'
        && res.path === p('taken.md')
        && readFileSync(p('taken.md'), 'utf8') === 'the agent wrote this\n',
      `20 — an existing file is refused and its bytes are untouched: kind=${res.kind} disk=${JSON.stringify(readFileSync(p('taken.md'), 'utf8'))}`)
  }

  // 21 — a name resolving OUTSIDE the root is refused and nothing is written.
  // Not a security boundary — the user has a shell one panel over — but a
  // `../` typo silently dropping a note outside the project is a note the
  // user will never find again. The no-write clause is asserted the way 20's
  // is, because a refusal reported to the caller while the file lands anyway
  // is not a refusal.
  {
    const res = F.createFile(join(DIR, 'notes'), '../../escaped.md', '# escaped\n\n')
    let landed = true
    try { statSync(join(DIR, '..', 'escaped.md')) } catch { landed = false }
    ok(21, res.kind === 'refused' && res.detail.length > 0 && landed === false,
      `21 — a name escaping the root is refused and nothing is written: kind=${res.kind} landed=${landed}`)
  }

  // 22 — a name with no extension gets `.md`, and one that already has an
  // extension is left ALONE. Both halves in one read: an implementation that
  // appended unconditionally produces `todo.txt.md`, which is a different
  // file from the one the user asked for and reads as the app not listening.
  {
    const a = F.createFile(DIR, 'bare', '# bare\n\n')
    const b = F.createFile(DIR, 'kept.txt', 'x\n')
    ok(22, a.kind === 'created' && a.path === p('bare.md')
        && b.kind === 'created' && b.path === p('kept.txt'),
      `22 — .md is appended only when there is no extension: bare=${a.path} kept=${b.path}`)
  }

  // 23 — an empty or whitespace-only name is refused rather than creating a
  // dotfile named `.md` in the root, which is what appending an extension to
  // an empty string produces and which no user could ever find.
  {
    const before = readdirSync(DIR).length
    const a = F.createFile(DIR, '', '# x\n')
    const b = F.createFile(DIR, '   ', '# x\n')
    ok(23, a.kind === 'refused' && b.kind === 'refused' && readdirSync(DIR).length === before,
      `23 — an empty name is refused and nothing is written: empty=${a.kind} blank=${b.kind}`)
  }

  // M39 — the scrollback log against real disk, in this suite's spaced
  // fixture directory. Scoped ids. An append stream, not layout-store's
  // temp-and-rename: rewriting the whole file every 16ms is the exact cost
  // the batcher exists to avoid.
  {
    const mk = typeof F.createScrollbackLog === 'function' ? F.createScrollbackLog : null
    const dir = join(DIR, 'scrollback dir')
    // A 4000-byte tail window, so scrollback.5's read genuinely starts inside
    // the em-dash run rather than reading the whole file from byte 0.
    const log = mk ? mk({ dir, maxBytes: 4096, tailWindowBytes: 4000 }) : null
    const settle = () => log ? log.idle('p1') : Promise.resolve()

    // scrollback.1. Append then tail: the last N NON-EMPTY, ANSI-stripped lines,
    //      newest last, and a tail of a panel that never wrote is [] rather
    //      than a throw or a null.
    if (log) {
      await log.append('p1', 'first line\r\n\x1b[32msecond\x1b[0m line\r\n\r\n')
      await log.append('p1', 'third line\r\n')
      await settle()
    }
    const tail1 = log ? await log.tail('p1', 2) : null
    const none = log ? await log.tail('never', 5) : null
    ok('scrollback.1 append then tail yields the last N non-empty stripped lines; an unknown panel yields []',
      tail1 !== null && JSON.stringify(tail1) === JSON.stringify(['second line', 'third line']) &&
        Array.isArray(none) && none.length === 0,
      JSON.stringify({ tail1, none }))

    // scrollback.2. Two appends issued WITHOUT awaiting land in order. The
    //      per-panel queue is the whole reason the write is async-safe.
    if (log) {
      void log.append('p2', 'A\n')
      void log.append('p2', 'B\n')
      void log.append('p2', 'C\n')
      await log.idle('p2')
    }
    const tail2 = log ? await log.tail('p2', 3) : null
    ok('scrollback.2 interleaved appends to one panel land in order',
      tail2 !== null && JSON.stringify(tail2) === JSON.stringify(['A', 'B', 'C']), JSON.stringify(tail2))

    // scrollback.3. The ring: a file pushed well past the cap is trimmed back
    //      to the cap at a line boundary whenever it passes 1.25x it, so it
    //      never exceeds 1.25x the cap and the NEWEST bytes survive — a
    //      head-preserving trim would keep exactly the lines nobody wants.
    //      1.25x, not 1x: the file legitimately grows between trims, and a
    //      bound of "the cap at every instant" would demand a rewrite per
    //      append, which is the cost the whole append-stream design refuses.
    if (log) {
      for (let i = 0; i < 400; i++) await log.append('p3', `line ${String(i).padStart(4, '0')} padding padding\n`)
      await log.idle('p3')
    }
    const size3 = log ? await log.size('p3') : -1
    const tail3 = log ? await log.tail('p3', 1) : null
    const head3 = log ? readFileSync(join(dir, 'p3.log'), 'utf8').split('\n')[0] : ''
    ok('scrollback.3 a file past the cap is trimmed to the cap at a line boundary, newest bytes kept',
      size3 > 0 && size3 <= 4096 * 1.25 && size3 < 400 * 32 && tail3 !== null && tail3[0] === 'line 0399 padding padding' &&
        /^line \d{4} padding padding$/.test(head3),
      JSON.stringify({ size3, tail3, head3 }))

    // scrollback.4. drop removes one panel's file and nothing else; clearAll
    //      removes every file in the directory and totalBytes reads 0 after.
    if (log) { await log.drop('p1') }
    const afterDrop = log ? { p1: existsSync(join(dir, 'p1.log')), p2: existsSync(join(dir, 'p2.log')) } : null
    if (log) { await log.clearAll() }
    const total = log ? await log.totalBytes() : -1
    ok('scrollback.4 drop removes one file; clearAll removes them all and totalBytes reads 0',
      afterDrop !== null && afterDrop.p1 === false && afterDrop.p2 === true && total === 0 &&
        !existsSync(join(dir, 'p2.log')) && !existsSync(join(dir, 'p3.log')),
      JSON.stringify({ afterDrop, total }))

    // scrollback.5. A tail read at a byte offset that lands INSIDE a multibyte
    //      character, with a newline later in the window: the partial first
    //      line is dropped at that newline, so the torn character never
    //      reaches the decoder. (The window is 9000 bytes of em-dashes plus
    //      "last line"; start = size − 4000 lands mid-dash, and the newline
    //      at byte 9000 is inside the window, so this is the NEWLINE-FOUND
    //      branch. The no-newline fallback is scrollback.6.)
    if (log) {
      await log.append('p5', '—'.repeat(3000) + '\nlast line\n')
      await log.idle('p5')
    }
    const tail5 = log ? await log.tail('p5', 1) : null
    ok('scrollback.5 a tail whose read window starts mid-character carries no replacement character',
      tail5 !== null && tail5[0] === 'last line' && !JSON.stringify(tail5).includes('\\ufffd'),
      JSON.stringify(tail5))

    // scrollback.6. The fallback the M39 verifier found untested: a window
    //      with NO newline in it at all — one enormous unbroken line, the
    //      shape a TUI's repaint stream takes — starting mid-character. The
    //      decoder must skip the orphaned continuation bytes (here exactly
    //      one: byte 5000 of the dash run is 5000 mod 3 = 2, the third byte
    //      of a dash) and hand back the remaining 3999 bytes as 1333 whole
    //      dashes, no U+FFFD. Without the strip the line begins with a
    //      replacement character the agent never printed.
    if (log) {
      await log.append('p6', 'head\n' + '—'.repeat(3000))
      await log.idle('p6')
    }
    const tail6 = log ? await log.tail('p6', 3) : null
    ok('scrollback.6 a window with no newline that starts mid-character drops the orphaned bytes and no more',
      tail6 !== null && tail6.length === 1 && tail6[0] === '—'.repeat(1333) &&
        !JSON.stringify(tail6).includes('\\ufffd'),
      JSON.stringify({ n: tail6 && tail6.length, len: tail6 && tail6[0] && tail6[0].length, head: tail6 && tail6[0] && tail6[0].slice(0, 3) }))
  }

  // M42 — search across every panel, over the durable log. Scoped ids. A
  // fresh log dir at the default cap so the seed lines are not trimmed.
  {
    const mk = typeof F.createScrollbackLog === 'function' ? F.createScrollbackLog : null
    const sdir = join(DIR, 'scrollback search dir')
    const slog = mk ? mk({ dir: sdir }) : null
    const hasSearch = slog && typeof slog.search === 'function'
    if (slog) {
      await slog.append('pA', 'alpha line\r\nfind-ME first\r\nbeta line\r\n\x1b[32mother FIND-me second\x1b[0m\r\n')
      await slog.append('pB', 'gamma\r\nFIND-Me on pB\r\n')
      await slog.append('pC', 'this also has find-me but pC is not searched\r\n')
      await slog.idle('pA'); await slog.idle('pB'); await slog.idle('pC')
    }

    // search.1. Case-insensitive substring across the LISTED panels only,
    //      newest-first WITHIN a panel, each hit an ANSI-stripped line with
    //      its panel id and its line index. pC has a match but is not in the
    //      id list, so it is never returned.
    const r1 = hasSearch ? await slog.search(['pA', 'pB'], 'find-me', { maxHits: 50, maxPerPanel: 5 }) : null
    const aHits = r1 ? r1.filter((h) => h.panelId === 'pA') : []
    const okShape = r1 !== null && r1.every((h) => typeof h.panelId === 'string' && typeof h.line === 'string' && typeof h.lineIndex === 'number')
    ok('search.1 case-insensitive substring over listed panels only, newest-first within a panel, stripped lines with ids',
      hasSearch === true && okShape &&
        r1.some((h) => h.panelId === 'pB' && /FIND-Me on pB/.test(h.line)) &&
        !r1.some((h) => h.panelId === 'pC') &&
        aHits.length === 2 && /other FIND-me second/.test(aHits[0].line) && /find-ME first/.test(aHits[1].line) &&
        aHits[0].lineIndex > aHits[1].lineIndex &&
        !aHits.some((h) => h.line.includes('\u001b')),
      JSON.stringify(r1))

    // search.2. Both caps: at most maxPerPanel from one panel (newest), and
    //      at most maxHits in total across panels.
    if (slog) {
      for (let i = 0; i < 8; i++) await slog.append('pD', `dup line number ${i}\r\n`)
      await slog.idle('pD')
    }
    const perPanel = hasSearch ? await slog.search(['pD'], 'dup', { maxHits: 50, maxPerPanel: 3 }) : null
    const total = hasSearch ? await slog.search(['pA', 'pB', 'pD'], 'line', { maxHits: 2, maxPerPanel: 5 }) : null
    ok('search.2 the per-panel cap and the total cap are both honoured, newest kept',
      hasSearch === true && Array.isArray(perPanel) && perPanel.length === 3 &&
        /number 7/.test(perPanel[0].line) && /number 5/.test(perPanel[2].line) &&
        Array.isArray(total) && total.length === 2,
      JSON.stringify({ perPanel, total }))

    // search.3. An empty or whitespace-only query answers [] without opening
    //      a file; a real query with no match answers [] too. Three distinct
    //      cases collapsed onto the same empty answer would still be [], so
    //      the value is the assertion.
    const empty = hasSearch ? await slog.search(['pA'], '', { maxHits: 50, maxPerPanel: 5 }) : null
    const blank = hasSearch ? await slog.search(['pA'], '   ', { maxHits: 50, maxPerPanel: 5 }) : null
    const miss = hasSearch ? await slog.search(['pA'], 'zzz-no-such-token', { maxHits: 50, maxPerPanel: 5 }) : null
    const unknown = hasSearch ? await slog.search(['never-existed'], 'find-me', { maxHits: 50, maxPerPanel: 5 }) : null
    ok('search.3 an empty, whitespace, no-match or unknown-panel query answers []',
      hasSearch === true && Array.isArray(empty) && empty.length === 0 &&
        Array.isArray(blank) && blank.length === 0 && Array.isArray(miss) && miss.length === 0 &&
        Array.isArray(unknown) && unknown.length === 0,
      JSON.stringify({ empty, blank, miss, unknown }))
  }

  console.log('')
  // M52 — ledger.1. The run ledger: an APPEND stream beside layout.json —
  //      one JSON line per command end, its own writer (never
  //      layout-store's temp-and-rename, which is wrong for a growing log),
  //      capped by line count with the oldest trimmed, newest first on read,
  //      and a malformed line costs that line, never the file. It records no
  //      output bytes, only metadata, which is what keeps it outside #31's
  //      disclosure surface.
  {
    const can = typeof F.createRunLedger === 'function'
    const dir = mkdtempSync(join(tmpdir(), 'tc file ledger '))
    const file = join(dir, 'runs.jsonl')
    const ledger = can ? F.createRunLedger({ file, maxLines: 5 }) : null
    const row = (i, panelId = 'p1') => ({ panelId, command: `cmd ${i}`, cwd: '/tmp', startedAt: 1000 + i, endedAt: 2000 + i, exitCode: i % 2 })
    if (ledger) for (let i = 1; i <= 7; i += 1) await ledger.append(row(i))
    if (ledger) await ledger.append(row(8, 'p2'))
    if (ledger) appendFileSync(file, '{not json\n')
    const p1 = ledger ? await ledger.list('p1', 10) : null
    const p2 = ledger ? await ledger.list('p2', 10) : null
    const lines = existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean) : []
    ok('ledger.1 the run ledger appends one line per row, lists a panel newest first, trims the oldest past the cap, and skips a malformed line',
      can && p1 !== null && p1.length > 0 && p1[0].command === 'cmd 7' && p1.every((r) => r.panelId === 'p1') &&
        p2 !== null && p2.length === 1 && p2[0].command === 'cmd 8' && p2[0].exitCode === 0 &&
        lines.length <= 6 && !lines.some((l) => l.includes('cmd 1')),
      JSON.stringify({ p1: p1 && p1.map((r) => r.command), p2: p2 && p2.map((r) => r.command), lines: lines.length }))
    rmSync(dir, { recursive: true, force: true })
  }

  // M58 — export. Both doors run here against a scratch log and a FAKE save
// dialog, because the arms — cancelled writes nothing, off reads nothing,
// the written text is stripped AND scrubbed — are what a user cannot see go
// wrong: a file that quietly differs from the screen, or a token in it.
{
  const can = typeof F.createExporters === 'function' && typeof F.createScrollbackLog === 'function'
  const dir = mkdtempSync(join(tmpdir(), 'tc file export '))
  const log = can ? F.createScrollbackLog({ dir: join(dir, 'log'), maxBytes: 1024 * 1024 }) : null
  const writes = []
  const mk = (path, opts = {}) => (can ? F.createExporters({
    log,
    persistOn: () => opts.persistOn !== false,
    askPath: async () => path,
    capture: async () => Buffer.from(opts.png ?? 'PNGBYTES'),
    write: (p, data) => { writes.push(p); writeFileSync(p, data) }
  }) : null)
  if (log) {
    await log.append('pX', 'hello \u001b[31mred\u001b[0m world\n')
    await log.append('pX', 'token sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij\n')
    await log.append('pX', 'last line\n')
    await log.idle('pX')
  }
  const out1 = join(dir, 'pX.txt')
  const r1 = log ? await mk(out1).panelText({ panelId: 'pX' }) : null
  const text1 = existsSync(out1) ? readFileSync(out1, 'utf8') : ''
  ok('export.1 a panel\'s text export is the whole log, ANSI stripped and secrets scrubbed, with lines and the redaction count reported',
    can && r1.kind === 'written' && r1.path === out1 && r1.lines === 3 && r1.redacted === 1 &&
      text1.includes('hello red world') && !text1.includes('\u001b[') && !text1.includes('sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ') && text1.includes('last line'),
    can ? JSON.stringify({ r1, text1 }) : 'createExporters is not exported')
  const before = writes.length
  const r2 = log ? await mk(null).panelText({ panelId: 'pX' }) : null
  ok('export.2 a cancelled save dialog writes nothing and says cancelled', can && r2.kind === 'cancelled' && writes.length === before, JSON.stringify(r2))
  const r3 = log ? await mk(join(dir, 'none.txt')).panelText({ panelId: 'pNone' }) : null
  const r3b = log ? await mk(join(dir, 'off.txt'), { persistOn: false }).panelText({ panelId: 'pX' }) : null
  ok('export.3 no log is `empty`; scrollback off is `off` and reads nothing, never the xterm buffer',
    can && r3.kind === 'empty' && r3b.kind === 'off' && !existsSync(join(dir, 'none.txt')) && !existsSync(join(dir, 'off.txt')),
    JSON.stringify({ r3, r3b }))
  const out4 = join(dir, 'canvas.png')
  const r4 = log ? await mk(out4, { png: 'FRAMEBYTES' }).canvasPng() : null
  const png = existsSync(out4) ? readFileSync(out4, 'utf8') : ''
  const r4b = log ? await mk(null).canvasPng() : null
  ok('export.4 the PNG export writes exactly the captured bytes, and a cancel writes nothing',
    can && r4.kind === 'written' && r4.path === out4 && png === 'FRAMEBYTES' && r4b.kind === 'cancelled',
    JSON.stringify({ r4, png, r4b }))
  // export.5 (M112). THE SECOND SOURCE. The live buffer, serialized by the
  // renderer and handed over on the request, is what lets a panel export
  // with persistence OFF — before M112 that answered `off` for text the
  // user was looking at. Arm order: the log when persistence is on (durable,
  // longer than the buffer); the buffer when the log is empty or persistence
  // is off; `empty` when both are absent; `off` only when persistence is off
  // AND no buffer came. Every source is stripped and passes the outward gate:
  // the token planted in the BUFFER must be gone from the file.
  //
  // (Named .5, not the spec's .4 — this file's export.4 is already the PNG
  // check above; verify:meta 22 fails the build on two computed checks
  // sharing an id in one suite.)
  {
    const buf = 'from the buffer\r\n\x1b[32mgreen\x1b[0m sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij\r\n'
    const o1 = join(dir, 'buf-off.txt')
    const a = log ? await mk(o1, { persistOn: false }).panelText({ panelId: 'pX', buffer: buf }) : null
    const t1 = existsSync(o1) ? readFileSync(o1, 'utf8') : ''
    const o2 = join(dir, 'log-on.txt')
    const b = log ? await mk(o2).panelText({ panelId: 'pX', buffer: buf }) : null
    const t2 = existsSync(o2) ? readFileSync(o2, 'utf8') : ''
    const o3 = join(dir, 'buf-nolog.txt')
    const c = log ? await mk(o3).panelText({ panelId: 'pNone', buffer: buf }) : null
    const d = log ? await mk(join(dir, 'x.txt'), { persistOn: false }).panelText({ panelId: 'pX' }) : null
    const e = log ? await mk(join(dir, 'y.txt')).panelText({ panelId: 'pNone', buffer: '' }) : null
    ok('export.5 persistence off + a buffer writes the buffer (source buffer, scrubbed, no escapes); persistence on prefers the log (source log); an empty log falls back to the buffer; off with no buffer is `off`; nothing from either is `empty`',
      // "no escapes" means no raw ANSI bytes survive (the ESC-`[` pair) — a
      // literal bracket check would fail on every redaction, since the
      // placeholder itself is written as `[redacted api key]`.
      can && a && a.kind === 'written' && a.source === 'buffer' && a.redacted === 1 && t1.includes('from the buffer') && t1.includes('green') && !t1.includes('\x1b[') && !t1.includes('sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ') &&
        b && b.kind === 'written' && b.source === 'log' && t2.includes('hello red world') && !t2.includes('from the buffer') &&
        c && c.kind === 'written' && c.source === 'buffer' &&
        d && d.kind === 'off' && e && e.kind === 'empty',
      JSON.stringify({ a, b, c, d, e, t1: t1.slice(0, 60) }))
  }
  // export.6 (M112). Two arms, one check — this is the id that BOTH prior
  // wrong fixes each passed one arm of and failed the other:
  //
  //   Arm A: a secret that arrives at main ALREADY reunited (exactly what
  //   the renderer's `SessionHandle.serialize()` now guarantees, since it
  //   joins a wrap using xterm's own `isWrapped` at the SOURCE — see
  //   session-factory.ts — so main never receives a secret split by a
  //   wrap in the first place) is still redacted WHOLE by the ordinary
  //   pipeline. Wrap repair is no longer main's job at all; this is a
  //   regression guard on the job main keeps — stripAnsi + outward — once
  //   round 1 and round 2's now-removed wrap-fixing code is gone.
  //
  //   Arm B: ordinary multi-line text survives byte-for-byte. This is the
  //   fixture that defeated round 1's blanket regex (a `\r\n` closed
  //   whenever it sat between two "token-alphabet" characters — the
  //   DEFAULT shape of file listings, paths, JSON, prose) — unpadded on
  //   purpose, since round 1's own fixture padding the boundary with a
  //   space is what hid the regression. main no longer touches `\r\n` at
  //   all (see main/export.ts: no wrap-fixing code remains there after
  //   review round 2 moved the fix upstream), so this is now nearly a
  //   tautology by construction — it stays as the test that would catch
  //   anyone reintroducing text-based wrap detection in main later.
  {
    const wrapped = 'before: sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij end of line here'
    const o = join(dir, 'wrapped.txt')
    const w = log ? await mk(o, { persistOn: false }).panelText({ panelId: 'pWrap', buffer: wrapped }) : null
    const tw = existsSync(o) ? readFileSync(o, 'utf8') : ''

    const plain = 'line one\r\nline two\r\nsome-path/to/file.txt\r\nnext output line\r\n'
    const o2 = join(dir, 'plain.txt')
    const p = log ? await mk(o2, { persistOn: false }).panelText({ panelId: 'pPlain', buffer: plain }) : null
    const tp = existsSync(o2) ? readFileSync(o2, 'utf8') : ''

    ok('export.6 Arm A: a secret that arrives already reunited (the shape the renderer now guarantees) is still redacted WHOLE by main\'s ordinary pipeline, with surrounding text untouched. Arm B: ordinary multi-line text whose boundaries abut on word characters (unpadded) keeps EVERY line break and its line count, byte for byte',
      can && w && w.kind === 'written' && w.source === 'buffer' && w.redacted === 1 &&
        tw.includes('before:') && tw.includes('end of line here') &&
        !tw.includes('sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ') && !tw.includes('abcdefghijklmnopqrstuvwxyz') &&
        tw.includes('[redacted api key]') &&
        p && p.kind === 'written' && p.redacted === 0 && p.lines === 4 &&
        tp === plain,
      JSON.stringify({ w, tw, p, tp, plain }))
  }
  rmSync(dir, { recursive: true, force: true })
}

// M83 — memory.1. THE PROJECT MEMORY STORE. Every write passes the M39
//      scrubber (a token in a note must not sit in a file agents read back);
//      an unusable kind and empty text are refused BY NAME rather than
//      coerced; a repository with no file reads EMPTY, never an error; a
//      malformed line is skipped and COUNTED; the cap drops the OLDEST.
{
  const memDir = join(DIR, 'memory')
  const store = F.createMemoryStore({ dir: memDir })
  const root = '/repo/one'
  const empty = store.list(root, 10)
  const added = store.add({ root, kind: 'decided', text: 'we use tmux for durability', panelId: 'n1', at: 1000 })
  const secret = store.add({ root, kind: 'note', text: 'the token is ghp_0123456789012345678901234567890123456789', at: 1001 })
  const badKind = store.add({ root, kind: 'pondered', text: 'x', at: 1002 })
  const badText = store.add({ root, kind: 'note', text: '   ', at: 1003 })
  const listed = store.list(root, 10)
  const otherRoot = store.list('/repo/two', 10)
  // A malformed line is skipped and counted.
  require('node:fs').appendFileSync(store.fileOf(root), 'not json\n')
  const afterJunk = store.list(root, 10)
  // The cap drops the oldest.
  for (let i = 0; i < F.MEMORY_MAX + 5; i += 1) store.add({ root: '/repo/cap', kind: 'note', text: `n${i}`, at: 2000 + i })
  const capped = store.list('/repo/cap', F.MEMORY_MAX + 10)
  ok('memory.1 the store: an empty repository reads empty; a write is scrubbed; an unusable kind and empty text are refused by name; a malformed line is skipped and counted; the cap drops the oldest',
    empty.entries.length === 0 && empty.skipped === 0 &&
      added.ok === true && secret.ok === true &&
      badKind.ok === false && /kind/.test(badKind.reason) && badText.ok === false && /text/.test(badText.reason) &&
      listed.entries.length === 2 && listed.entries[0].at === 1001 &&
      !listed.entries.some((e) => /ghp_0123/.test(e.text)) && listed.entries.some((e) => /redacted|removed/i.test(e.text)) &&
      otherRoot.entries.length === 0 &&
      afterJunk.entries.length === 2 && afterJunk.skipped === 1 &&
      capped.entries.length === F.MEMORY_MAX && capped.entries[capped.entries.length - 1].text !== 'n0',
    JSON.stringify({ empty, added, secret, badKind, badText, listed: listed.entries, afterJunk: { n: afterJunk.entries.length, skipped: afterJunk.skipped }, capped: capped.entries.length }))
}

// M83 — memory.2. THE THREE PROPERTIES A GREEN memory.1 DOES NOT HAVE, each
//      found by the milestone's verifier and each a SILENT failure.
//      (a) The file name is injective: `/a/b` and `/a-b` flatten to the same
//          slug, and two repositories sharing one memory read each other's
//          decisions back into their agents' context with no symptom.
//      (b) The ring trim keeps the newest RAW LINES: re-serialising the
//          parsed entries deletes every line the parser skipped, so "a line
//          could not be read" silently becomes "there was never a line".
//      (c) A non-positive limit answers EMPTY rather than [] pretending to
//          be a repository nobody has written about — it is clamped here and
//          refused by name at the control door.
{
  const memDir2 = join(DIR, 'memory2')
  const store2 = F.createMemoryStore({ dir: memDir2 })
  const injective = store2.fileOf('/a/b') !== store2.fileOf('/a-b')
  const long1 = `/very/long/${'x'.repeat(140)}/repo-one`
  const long2 = `/very/long/${'x'.repeat(140)}/repo-two`
  const injectiveLong = store2.fileOf(long1) !== store2.fileOf(long2)
  const stable = store2.fileOf('/a/b') === store2.fileOf('/a/b/')
  // (b) A malformed line written BEFORE the trim must survive it.
  const capRoot = '/repo/trim'
  for (let i = 0; i < F.MEMORY_MAX + 5; i += 1) store2.add({ root: capRoot, kind: 'note', text: `t${i}`, at: 100 + i })
  // The junk goes in among the NEWEST lines, so the trim that follows it has
  // to carry it: a junk line older than the cap is dropped legitimately, and
  // a check that put it there would pass against a re-serialising trim.
  require('node:fs').appendFileSync(store2.fileOf(capRoot), 'not json at all\n')
  store2.add({ root: capRoot, kind: 'note', text: 'after the junk', at: 9999 })
  const afterTrim = store2.list(capRoot, F.MEMORY_MAX + 10)
  const rawAfterTrim = require('node:fs').readFileSync(store2.fileOf(capRoot), 'utf8')
  const noTmpLeft = !require('node:fs').existsSync(`${store2.fileOf(capRoot)}.tmp`)
  // (c) A non-positive limit.
  const zero = store2.list(capRoot, 0)
  const negative = store2.list(capRoot, -3)
  ok('memory.2 two repositories never share a file (including past the name cap), the ring trim keeps raw lines so a skipped line survives and is still counted, no temp file is left behind, and a non-positive limit answers empty',
    injective === true && injectiveLong === true && stable === true &&
      afterTrim.entries.length + afterTrim.skipped === F.MEMORY_MAX && afterTrim.skipped === 1 && /not json at all/.test(rawAfterTrim) &&
      noTmpLeft === true && zero.entries.length === 0 && negative.entries.length === 0,
    JSON.stringify({ injective, injectiveLong, stable, kept: afterTrim.entries.length, skipped: afterTrim.skipped, junkSurvived: /not json at all/.test(rawAfterTrim), noTmpLeft, zero: zero.entries.length, negative: negative.entries.length }))
}

// M84 — watch.1. THE WATCHER'S RUNNER, over a FAKE spawn and a fake clock.
//      Five properties, each of which fails silently in production:
//      (a) The four triggers each have ONE phrase, from one table.
//      (b) ONE RUN AT A TIME with a COALESCED pending: five saves during a
//          run mean one more run, not five. A queueing watcher falls further
//          behind the harder its user works, which is why people turn
//          watchers off rather than report them.
//      (c) The exit arms speak the state vocabulary: 0 is a pass, N is a
//          fail, and a SIGNAL is a fail — a signal read as a pass is a green
//          watcher over a killed process.
//      (d) The tail is capped and is the LAST bytes, not the first: the
//          interesting end of a failing command's output is its end.
//      (e) Every finished run appends a ledger row and the row carries NO
//          output — the ledger is metadata, and this is the one place a
//          watcher could put a secret into a durable file nobody expects.
{
  const words = typeof F.triggerWord === 'function' ? {
    path: F.triggerWord({ kind: 'path', path: '/repo/src' }),
    git: F.triggerWord({ kind: 'git-ref', root: '/repo' }),
    timer: F.triggerWord({ kind: 'timer', everyMs: 600000 }),
    panel: F.triggerWord({ kind: 'panel', sourceId: 'n3', on: 'exit-ok' })
  } : null
  const rows = []
  const states = []
  const spawns = []
  let live = null
  const fakeSpawn = (spec) => {
    const proc = {
      spec,
      stdout: [],
      exited: false,
      kill(signal) { proc.killed = signal; proc.exit(null, signal) },
      // The runner's process seam: it hands us the callbacks and we drive them.
      onData: null,
      onExit: null,
      exit(code, signal) { proc.exited = true; proc.onExit && proc.onExit(code, signal ?? null) }
    }
    live = proc
    return proc
  }
  const runner = typeof F.createWatchRunner === 'function' ? F.createWatchRunner({
    spawn: (spec, handlers) => { spawns.push(spec); const p = fakeSpawn(spec); p.onData = handlers.onData; p.onExit = handlers.onExit; return p },
    now: (() => { let t = 1000; return () => (t += 10) })(),
    ledger: { append: (row) => rows.push(row) },
    onState: (id, state) => states.push({ id, ...state })
  }) : null
  let coalesced = null
  let tail = null
  let signalWord = null
  if (runner) {
    runner.add({ id: 'w1', cwd: '/repo', command: 'npm', args: ['test'], trigger: { kind: 'path', path: '/repo/src' } })
    runner.fire('w1')
    const during = live
    // (b) three more triggers WHILE the first run is in flight.
    runner.fire('w1'); runner.fire('w1'); runner.fire('w1')
    const spawnsDuring = spawns.length
    during.exit(0, null)
    // The pending run starts exactly once.
    coalesced = { spawnsDuring, after: spawns.length, pendingSeen: states.some((s) => s.pending === true) }
    // (d) a long output on the pending run, then a non-zero exit.
    const big = 'x'.repeat(F.WATCH_TAIL_BYTES + 500)
    live.onData(`${big}THE END`)
    live.exit(2, null)
    tail = runner.stateOf('w1')
    // (c) a signal is a failure.
    runner.fire('w1')
    live.kill('SIGKILL')
    signalWord = runner.stateOf('w1')
  }
  ok('watch.1 the trigger words come from one table; a trigger during a run coalesces into ONE pending run; exit 0 passes, exit N and a signal fail; the tail is capped and keeps the END; every run appends a ledger row with no output in it',
    words !== null && runner !== null &&
      /src/.test(words.path) && /branch/.test(words.git) && /10m|10 m/.test(words.timer) && /n3/.test(words.panel) &&
      coalesced.spawnsDuring === 1 && coalesced.after === 2 && coalesced.pendingSeen === true &&
      tail && tail.status === 'exited' && tail.exitCode === 2 &&
      tail.tail.length <= F.WATCH_TAIL_BYTES && /THE END$/.test(tail.tail) &&
      signalWord && signalWord.status === 'exited' && signalWord.signal === 'SIGKILL' &&
      rows.length === 3 && rows.every((r) => r.panelId === 'w1' && typeof r.exitCode !== 'undefined' && !('output' in r) && !('tail' in r)) &&
      rows[0].command === 'npm test',
    JSON.stringify({ words, coalesced, tail: tail && { status: tail.status, exitCode: tail.exitCode, len: tail.tail.length, end: tail.tail.slice(-8) }, signalWord, rows }))
}

// M84 — watch.2. WHAT A GREEN watch.1 DOES NOT PROVE, each found by the
//      milestone's verifier and each silent in production:
//      (a) `stop` publishes the cleared pending flag — clearing it without a
//          publish leaves a body still saying another run is queued.
//      (b) `stop` ESCALATES: SIGTERM, then SIGKILL after the grace. A command
//          that ignores SIGTERM (a shell wrapping a test runner is the
//          ordinary case) otherwise leaves the node on `working` forever with
//          a Stop control that does nothing.
//      (c) `remove` records the run it kills. The run really happened, and a
//          ledger with no row for it disagrees with `stop`, which records one.
//      (d) `disposeAll` — the quit arm — kills every run in flight. Without
//          it a quit mid-run orphans an `npm test` with no window and no row.
{
  const rows2 = []
  const states2 = []
  const signals = []
  const timers = []
  let proc2 = null
  const runner2 = typeof F.createWatchRunner === 'function' ? F.createWatchRunner({
    spawn: (spec, handlers) => {
      // A process that IGNORES SIGTERM, which is the case the escalation is for.
      proc2 = { spec, handlers, kill: (sig) => { signals.push(sig); if (sig === 'SIGKILL') handlers.onExit(null, 'SIGKILL') } }
      return proc2
    },
    now: (() => { let t = 5000; return () => (t += 10) })(),
    setTimer: (fn, ms) => { const entry = { fn, ms, cancelled: false }; timers.push(entry); return { cancel: () => { entry.cancelled = true } } },
    ledger: { append: (row) => rows2.push(row) },
    onState: (id, state) => states2.push({ id, ...state })
  }) : null
  let stopped = null
  let escalated = null
  let removedRow = null
  let disposedSignals = null
  if (runner2) {
    runner2.add({ id: 'w2', cwd: '/repo', command: 'npm', args: ['test'], trigger: { kind: 'timer', everyMs: 60000 } })
    runner2.fire('w2')
    runner2.fire('w2') // a pending run
    const beforeStop = states2.length
    runner2.stop('w2')
    // (a) the cleared pending flag was PUBLISHED.
    stopped = { published: states2.slice(beforeStop).some((s) => s.pending === false), signals: [...signals] }
    // (b) the grace timer fires SIGKILL.
    const pendingKill = timers.find((t) => !t.cancelled)
    if (pendingKill) pendingKill.fn()
    escalated = { signals: [...signals], grace: pendingKill ? pendingKill.ms : null }
    // (c) a run in flight, then removed.
    runner2.add({ id: 'w3', cwd: '/repo', command: 'make', args: [], trigger: { kind: 'timer', everyMs: 60000 } })
    runner2.fire('w3')
    const before3 = rows2.length
    runner2.remove('w3')
    removedRow = { added: rows2.length - before3, last: rows2[rows2.length - 1] }
    // (d) the quit arm.
    runner2.add({ id: 'w4', cwd: '/repo', command: 'make', args: [], trigger: { kind: 'timer', everyMs: 60000 } })
    runner2.fire('w4')
    const sigBefore = signals.length
    runner2.disposeAll()
    disposedSignals = { killed: signals.length > sigBefore, ids: runner2.ids() }
  }
  ok('watch.2 stop publishes the cleared pending flag and escalates SIGTERM to SIGKILL after the grace; remove records the run it kills; disposeAll kills every run in flight and forgets every watcher',
    runner2 !== null &&
      stopped.published === true && stopped.signals[0] === 'SIGTERM' &&
      escalated.signals.includes('SIGKILL') && escalated.grace === F.WATCH_KILL_GRACE_MS &&
      removedRow.added === 1 && removedRow.last.panelId === 'w3' && removedRow.last.exitCode === null &&
      disposedSignals.killed === true && disposedSignals.ids.length === 0,
    JSON.stringify({ stopped, escalated, removedRow, disposedSignals }))
}

// M85 — vault.1. THE LINK SYNTAX AND THE INDEX, pure.
//      (a) `[[name]]` and `[[name|text]]` are links; `[a]`, `[[ ]]` and a
//          bare `[[name` are TEXT. A parser that took the loose reading turns
//          a markdown reference link into a note nobody wrote.
//      (b) A name resolves against a BASENAME without its extension, case
//          insensitively, and a name with a path against the path relative to
//          the root — two spellings of the same note, one answer.
//      (c) Backlinks: every note pointing AT a note, with the line, including
//          TWO links from one note, and never a note against itself.
//      (d) An unresolved link is a link, not text: the index says it resolves
//          to nothing, which is what lets the note offer to create it.
{
  const V = F
  const links = typeof V.parseWikiLinks === 'function' ? {
    plain: V.parseWikiLinks('see [[design]] and [[plans/next|the next one]]'),
    notLinks: V.parseWikiLinks('a [ref] and [[unclosed and [[]] and [[   ]] and `[[in code]]` and\n```\n[[fenced]]\n```\n'),
    twice: V.parseWikiLinks('[[a]] then [[a]] again')
  } : null
  const files = [
    { path: 'design.md', body: '# The design\nsee [[api notes]] and [[plans/next]]\n' },
    { path: 'api notes.md', body: '# API notes\nback to [[design]] and again [[Design]]\n' },
    { path: 'plans/next.md', body: '# Next\nnothing here yet, but [[missing note]]\n' },
    { path: 'self.md', body: '# Self\nI point at [[self]]\n' }
  ]
  const index = typeof V.buildVaultIndex === 'function' ? V.buildVaultIndex(files) : null
  const back = (p) => (index ? (index.backlinks[p] ?? []) : [])
  ok('vault.1 [[name]] and [[name|text]] are links while a reference link and an unclosed one are text; a name resolves by basename case-insensitively and by relative path; backlinks list both links from one note, never a note against itself, and an unresolved name resolves to nothing rather than silently reading as text',
    links !== null && index !== null &&
      links.plain.length === 2 && links.plain[0].name === 'design' && links.plain[1].name === 'plans/next' && links.plain[1].text === 'the next one' &&
      links.notLinks.length === 0 && links.twice.length === 2 &&
      index.byName['design'] === 'design.md' && index.byName['api notes'] === 'api notes.md' && index.byName['plans/next'] === 'plans/next.md' &&
      V.resolveWikiName('Design', index) === 'design.md' && V.resolveWikiName('missing note', index) === null &&
      back('design.md').length === 2 && back('design.md').every((b) => b.path === 'api notes.md') &&
      back('api notes.md').length === 1 && back('api notes.md')[0].path === 'design.md' && back('api notes.md')[0].line === 2 &&
      back('self.md').length === 0,
    JSON.stringify({ links, byName: index && index.byName, backlinks: index && index.backlinks }))
}

// M85 — vault.2. THE READ, against a real fixture tree whose directory has a
//      SPACE in it (this repo's rule). Every `.md` under the root, recursive,
//      its title the first heading or its basename; a non-markdown file is
//      not a note; the caps are REPORTED rather than silently dropping notes;
//      a root that is not there answers EMPTY with its own reason rather than
//      throwing.
{
  const vaultDir = join(DIR, 'my vault')
  require('node:fs').mkdirSync(join(vaultDir, 'meetings'), { recursive: true })
  writeFileSync(join(vaultDir, 'design.md'), '# The design\nbody\n')
  writeFileSync(join(vaultDir, 'untitled.md'), 'no heading here\n')
  writeFileSync(join(vaultDir, 'notes.txt'), 'not a note\n')
  writeFileSync(join(vaultDir, 'meetings', '2026-09-04.md'), '# Standup\n[[design]]\n')
  const read = typeof F.readVault === 'function' ? F.readVault(vaultDir) : null
  const capped = typeof F.readVault === 'function' ? F.readVault(vaultDir, { maxFiles: 2 }) : null
  const missing = typeof F.readVault === 'function' ? F.readVault(join(DIR, 'no such vault')) : null
  const byPath = (r, p) => (r ? r.notes.find((n) => n.path === p) : undefined)
  ok('vault.2 the read walks the tree for .md only, titles each note by its first heading or its basename, reports what the cap dropped rather than dropping it silently, and answers empty with a reason for a root that is not there',
    read !== null &&
      read.notes.length === 3 && read.skipped === 0 &&
      byPath(read, 'design.md').title === 'The design' &&
      byPath(read, 'untitled.md').title === 'untitled' &&
      byPath(read, 'meetings/2026-09-04.md').title === 'Standup' &&
      !read.notes.some((n) => n.path.endsWith('.txt')) &&
      capped.notes.length === 2 && capped.skipped === 1 &&
      missing.notes.length === 0 && typeof missing.reason === 'string' && /vault/i.test(missing.reason),
    JSON.stringify({ n: read && read.notes.map((x) => [x.path, x.title]), skipped: read && read.skipped, capped: capped && { n: capped.notes.length, skipped: capped.skipped }, missing }))
}

// M100 — memory.3. TWO MEMORIES, TWO AXES. A teammate's memory is its own file
// under memory/teammates, through the SAME store (a second instance over a
// second dir), BESIDE the repository's — neither sees the other's rows, and
// the teammate's root is its slug, never a path.
{
  const { mkdtempSync, rmSync, readdirSync, existsSync } = require('node:fs')
  const { tmpdir } = require('node:os')
  const dir = mkdtempSync(join(tmpdir(), 'tc memory two '))
  try {
    const repo = F.createMemoryStore({ dir })
    const mates = F.createMemoryStore({ dir: join(dir, 'teammates') })
    repo.add({ root: '/r', kind: 'decided', text: 'sessions live in tmux' })
    mates.add({ root: 'ada', kind: 'note', text: 'ada prefers short answers' })
    const r = repo.list('/r', 10), m = mates.list('ada', 10), cross = repo.list('ada', 10)
    const files = readdirSync(dir).filter((f) => f.endsWith('.jsonl'))
    const mateFiles = existsSync(join(dir, 'teammates')) ? readdirSync(join(dir, 'teammates')) : []
    ok('memory.3 a teammate store over memory/teammates writes its own file, the repository store never lists it, and each answers only its own rows',
      r.entries.length === 1 && m.entries.length === 1 && cross.entries.length === 0 && files.length === 1 && mateFiles.length === 1 && /ada/.test(mateFiles[0]),
      JSON.stringify({ r: r.entries.length, m: m.entries.length, cross: cross.entries.length, files, mateFiles }))
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

// M101 — routine.1. THE RUNNER over injected timers: arm fires on the
// interval, a save re-arms without a double tick, pause disarms, runNow
// fires whatever the schedule says and stamps the run, and a routine whose
// due tick fell while the app was closed is marked MISSED at arm with the
// time — and NOT fired.
{
  const has = typeof F.createRoutineRunner === 'function'
  const timers = new Map(); let seq = 0; let now = 1_000_000
  const fired = [], saved = []
  const runner = has ? F.createRoutineRunner({
    now: () => now,
    setInterval: (fn, ms) => { const h = ++seq; timers.set(h, { fn, ms }); return h },
    clearInterval: (h) => { timers.delete(h) },
    fire: (r) => fired.push(r.id),
    save: (r) => saved.push(r)
  }) : null
  const r1 = { id: 'r1', name: 'a', teammateId: 't', everyMs: 60000, prompt: 'p', paused: false }
  const stale = { id: 'r2', name: 'b', teammateId: 't', everyMs: 60000, prompt: 'p', paused: false, lastRun: { at: now - 5 * 60000, outcome: 'started' } }
  const paused = { id: 'r3', name: 'c', teammateId: 't', everyMs: 60000, prompt: 'p', paused: true }
  const missed = runner ? runner.arm([r1, stale, paused], { startup: true }) : []
  const armedCount = timers.size
  const tick = () => { for (const t of [...timers.values()]) t.fn() }
  now += 60000; tick()
  const firedAfterTick = fired.slice()
  const rearmed = runner ? runner.arm([r1, { ...stale, missed: { at: stale.lastRun.at + 60000 } }, paused]) : []
  const armedAfterRearm = timers.size
  const ran = runner ? runner.runNow('r3') : null
  const ranUnknown = runner ? runner.runNow('zz') : null
  const stampedR1 = saved.filter((s) => s.id === 'r1' && s.lastRun && s.lastRun.outcome === 'started').length
  ok('routine.1 arming fires each unpaused routine on its interval (a paused one is known but not armed); a stale routine is marked missed with the DUE time and fires only on its interval; a re-arm keeps one timer per routine and re-marks nothing already marked; runNow fires a paused routine by hand and stamps the run; an unknown id answers false',
    has && armedCount === 2 && missed.join() === 'r2' && saved.some((s) => s.id === 'r2' && s.missed && s.missed.at === stale.lastRun.at + 60000) &&
      firedAfterTick.length === 2 && firedAfterTick.includes('r1') && firedAfterTick.includes('r2') &&
      rearmed.length === 0 && armedAfterRearm === 2 && ran === true && fired.includes('r3') && ranUnknown === false && stampedR1 === 1 &&
      // The fire's stamp clears the missed mark: the LAST r2 saved carries none.
      saved.filter((s) => s.id === 'r2').slice(-1)[0].missed === undefined,
    JSON.stringify({ has, armedCount, missed, firedAfterTick, rearmed, armedAfterRearm, ran, ranUnknown, stampedR1, saved: saved.map((s) => [s.id, s.missed, s.lastRun && s.lastRun.outcome]) }))
  if (runner) runner.disposeAll()
}

// M101 — routine.2. A SAVE KEEPS THE PHASE. Re-arming with an unchanged schedule
// keeps the routine's timer (a frequent routine's saves must not restart a
// slower one forever — the verifier's finding); a changed interval re-arms;
// the missed mark is computed only at STARTUP, so a resume after a long
// pause is never "the app was closed".
{
  const has = typeof F.createRoutineRunner === 'function'
  const timers = new Map(); let seq = 0; let now = 5_000_000
  const fired = [], saved = []
  const runner = has ? F.createRoutineRunner({
    now: () => now,
    setInterval: (fn, ms) => { const h = ++seq; timers.set(h, { fn, ms }); return h },
    clearInterval: (h) => { timers.delete(h) },
    fire: (r) => fired.push(r.id),
    save: (r) => saved.push(r)
  }) : null
  const a = { id: 'a', name: 'a', teammateId: 't', everyMs: 60000, prompt: 'p', paused: false }
  const b = { id: 'b', name: 'b', teammateId: 't', everyMs: 300000, prompt: 'p', paused: false }
  if (runner) runner.arm([a, b], { startup: true })
  const handlesBefore = [...timers.keys()].join(',')
  if (runner) runner.arm([{ ...a, name: 'a renamed' }, b]) // a save with the same schedule
  const handlesAfter = [...timers.keys()].join(',')
  if (runner) runner.arm([{ ...a, everyMs: 120000 }, b]) // a changed interval
  const handlesChanged = [...timers.keys()].join(',')
  const stale = { id: 's', name: 's', teammateId: 't', everyMs: 60000, prompt: 'p', paused: false, lastRun: { at: now - 3600000, outcome: 'started' } }
  const notStartup = runner ? runner.arm([a, b, stale]) : ['x']
  const stale2 = { ...stale, id: 's2' }
  const atStartup = runner ? runner.arm([a, b, stale, stale2], { startup: true }) : []
  ok('routine.2 an unchanged schedule keeps its timer across a save; a changed interval re-arms; the missed mark is computed only at startup — a later arm marks nothing',
    has && handlesBefore === handlesAfter && handlesChanged !== handlesAfter && notStartup.length === 0 && atStartup.join() === 's2' && saved.some((s) => s.id === 's2' && s.missed) && !saved.some((s) => s.id === 's' && s.missed),
    JSON.stringify({ handlesBefore, handlesAfter, handlesChanged, notStartup, atStartup }))
  if (runner) runner.disposeAll()
}

// M103 — browser.1. READING THE PANE IS LEAVING THE APP. The read is driven
//      over injected `getUrl`/`evaluate` so no webview is in earshot: a
//      `file:`, a `data:` and an `about:` page are each refused BY NAME before
//      anything is evaluated (the scheme check is main's, on the READ path —
//      a navigation gate alone leaves `about:blank` and a page's own
//      `data:` redirect readable); an `https:` page is read, capped at the
//      byte ceiling, and passed through the outward gate — a token planted
//      in the page's text is gone and the note says the content is a remote
//      page's at that host. A guest that answers with something other than a
//      string is refused, never coerced to `[object Object]`.
{
  const token = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let evaluated = 0
  const drive = async (url, body) => typeof F.readBrowserPage === 'function'
    ? F.readBrowserPage({ getUrl: () => url, evaluate: async () => { evaluated += 1; return body } })
    : { kind: 'missing' }
  const file = await drive('file:///etc/passwd', 'root:x:0:0')
  const data = await drive('data:text/html,hi', 'hi')
  const blank = await drive('about:blank', '')
  const chrome = await drive('chrome://gpu', 'gpu')
  const refusedBeforeEvaluating = evaluated === 0
  const cap = typeof F.BROWSER_READ_MAX_BYTES === 'number' ? F.BROWSER_READ_MAX_BYTES : 0
  const page = await drive('https://example.com/docs?q=1', `Welcome to the docs\nGITHUB_TOKEN=${token}\n` + 'x'.repeat(cap + 100))
  const notText = await drive('https://example.com/', { not: 'text' })
  ok('browser.1 file:, data:, about: and chrome: pages are refused by name before anything is evaluated; an https: page is read, capped at BROWSER_READ_MAX_BYTES, scrubbed (a planted token is gone, the note names a remote page at its host), and a non-string answer is refused',
    file.kind === 'refused' && /file:/.test(file.reason) &&
      data.kind === 'refused' && /data:/.test(data.reason) &&
      blank.kind === 'refused' && /about:/.test(blank.reason) &&
      chrome.kind === 'refused' && /chrome:/.test(chrome.reason) &&
      refusedBeforeEvaluating && cap > 0 &&
      page.kind === 'read' && page.url === 'https://example.com/docs?q=1' && page.text.includes('Welcome to the docs') &&
      !page.text.includes(token) && /redacted/.test(page.note) && /remote page/.test(page.note) && /example\.com/.test(page.note) &&
      Buffer.byteLength(page.text, 'utf8') <= cap + 64 && page.truncated === true &&
      notText.kind === 'refused' && /text/.test(notText.reason),
    JSON.stringify({ file, data, blank, chrome, evaluated, cap, page: page && { kind: page.kind, url: page.url, note: page.note, bytes: page.text && Buffer.byteLength(page.text, 'utf8'), truncated: page.truncated }, notText }))
}

// M107 — env.1. DISCOVERY THAT EXPLAINS ITSELF. The report says which shells
// were asked and which folders were checked, and tells "the shell didn't
// answer" (a timeout, a prompting rc file) apart from "not installed" —
// three states, never two. This is the repository's own three-state rule,
// which the surface it already shipped was breaking.
{
  const has = typeof F.buildEnvReport === 'function' && typeof F.probeOutcome === 'function'
  const base = { env: { PATH: '/usr/bin:/opt/homebrew/bin' }, which: () => null, backend: { kind: 'direct', reason: 'no tmux', tmuxPath: null }, layoutPath: '/l', backupWritten: false, now: 1, control: null }
  const found = has ? F.buildEnvReport({ ...base, shell: { path: '/bin/zsh', ok: true }, which: (n) => `/opt/homebrew/bin/${n}`, probe: { shells: ['/bin/zsh'], timedOut: false } }) : null
  const notFound = has ? F.buildEnvReport({ ...base, shell: { path: '/bin/zsh', ok: true }, probe: { shells: ['/bin/zsh'], timedOut: false } }) : null
  const noAnswer = has ? F.buildEnvReport({ ...base, shell: { path: '/bin/zsh', ok: false, reason: 'the login shell timed out after 8s' }, probe: { shells: ['/bin/zsh'], timedOut: true } }) : null
  const arms = has ? [F.probeOutcome(found), F.probeOutcome(notFound), F.probeOutcome(noAnswer)] : []
  ok('env.1 the report carries the shells asked and the folders checked; a CLI on the PATH is found; one absent from a shell that answered is not-found; a shell that timed out is no-answer with the ~/.zprofile fix in its sentence — never not-found',
    has && found.probe.shells.join() === '/bin/zsh' && found.probe.folders.join() === '/usr/bin,/opt/homebrew/bin' &&
      arms[0].kind === 'found' && arms[1].kind === 'not-found' && arms[2].kind === 'no-answer' && /didn.t answer|did not answer/.test(arms[2].sentence) && /zprofile/.test(arms[2].sentence) && /install/.test(arms[1].sentence),
    JSON.stringify({ probe: found && found.probe, arms }))
}

// telemetry.2 (M112). THE PLAN AND THE SCRUB. Three arms for the plan — no
// DSN, a malformed one (its own arm: a typo must not read as "off"), and
// on with the dumps flag — and a beforeSend that is an ALLOWLIST built
// field by field: a fixture event stuffed with breadcrumbs, a request, a
// user, a token in the message and the home path in a frame must come out
// with none of those KEYS and neither string. Asserted on keys, because a
// spread that carried everything satisfies any value-phrased check.
{
  const can = typeof F.telemetryPlan === 'function' && typeof F.scrubEvent === 'function'
  const read = (m) => (id) => m[id]
  const p1 = can ? F.telemetryPlan(read({ 'telemetry.sentryDsn': '', 'telemetry.nativeCrashes': false })) : null
  const p2 = can ? F.telemetryPlan(read({ 'telemetry.sentryDsn': 'not a dsn', 'telemetry.nativeCrashes': true })) : null
  const p3 = can ? F.telemetryPlan(read({ 'telemetry.sentryDsn': 'https://abc123@o1.ingest.sentry.io/42', 'telemetry.nativeCrashes': true })) : null
  const token = 'sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij'
  const ev = {
    event_id: 'e1', timestamp: 1, level: 'error', release: 'tc@2.3.0', environment: 'production',
    breadcrumbs: [{ message: 'echo ' + token }], request: { url: 'file:///x' }, user: { ip_address: '1.2.3.4' },
    extra: { cwd: '/Users/alex/secret' }, tags: { t: '1' },
    contexts: { os: { name: 'macOS', version: '15' }, app: { app_name: 'Terminal Canvas', app_version: '2.3.0' }, device: { name: 'alexs-mac' } },
    exception: { values: [{ type: 'Error', value: 'failed with ' + token, stacktrace: { frames: [
      { function: 'f', lineno: 1, colno: 2, filename: '/Users/alex/Library/Application Support/Terminal Canvas/x.js', vars: { t: token } },
      { function: 'g', lineno: 3, colno: 4, filename: '/Users/alex/proj/y.js' }
    ] } }] }
  }
  const out = can ? F.scrubEvent(ev, { userData: '/Users/alex/Library/Application Support/Terminal Canvas', home: '/Users/alex' }) : null
  const keys = out ? Object.keys(out).sort() : []
  const frames = out?.exception?.values?.[0]?.stacktrace?.frames ?? []
  const s = JSON.stringify(out ?? {})
  ok('telemetry.2 the plan has three arms (no-dsn, malformed-dsn, on with nativeCrashes); scrubEvent keeps only the allowlisted keys, replaces the userData and home paths, drops frame vars and contexts.device, and the token is gone from the value',
    can && p1 && p1.on === false && p1.reason === 'no-dsn' && p2 && p2.on === false && p2.reason === 'malformed-dsn' &&
      p3 && p3.on === true && p3.dsn === 'https://abc123@o1.ingest.sentry.io/42' && p3.nativeCrashes === true &&
      out && !keys.includes('breadcrumbs') && !keys.includes('request') && !keys.includes('user') && !keys.includes('extra') && !keys.includes('tags') &&
      out.contexts && !('device' in out.contexts) && out.contexts.os && out.contexts.app &&
      frames.length === 2 && frames[0].filename === '<userData>/x.js' && frames[1].filename === '<home>/proj/y.js' && !('vars' in frames[0]) &&
      !s.includes('sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ') && !s.includes('/Users/alex'),
    can ? JSON.stringify({ p1, p2, p3, keys, frames, valueHead: out?.exception?.values?.[0]?.value?.slice(0, 40) }) : 'telemetry not exported')
}

  // M114 — lane.1. THE LANE. A dispatch finds the item's repository under
  // the teammate's places (a place itself, then its immediate children, by
  // the origin url normalised to owner/repo), asks the Places gate on that
  // ROOT before any worktree is minted, and passes the worktree manager's
  // own refusal through verbatim. Every arm is a NAMED refusal; nothing here
  // reaches git — the runner is a fake.
  try {
    const origins = { '/home/u/work/api': 'git@github.com:Acme/Canvas.git', '/home/u/work/site': 'https://github.com/acme/site' }
    const originOf = (d) => origins[d] ?? null
    const subdirs = (d) => (d === '/home/u/work' ? ['/home/u/work/api', '/home/u/work/site', '/home/u/work/notes'] : [])
    const found = F.findRepoUnderPlaces('acme/canvas', ['/home/u/work'], { originOf, subdirs })
    const direct = F.findRepoUnderPlaces('acme/site', ['/home/u/work/site'], { originOf, subdirs })
    const none = F.findRepoUnderPlaces('acme/other', ['/home/u/work'], { originOf, subdirs })
    const key = F.repoOfKey('acme/canvas#12'), badKey = F.repoOfKey('PROJ-12')
    const ada = { id: 't1', name: 'ada', brief: '', places: ['/home/u/work'], services: [], skills: [], memory: 'ada', chats: [], messaging: false, scheduling: false }
    const bo = { id: 't2', name: 'bo', brief: '', places: ['/elsewhere'], services: [], skills: [], memory: 'bo', chats: [], messaging: false, scheduling: false }
    const mates = { t1: ada, t2: bo }
    const gate = { check: (id, path) => (mates[id] && mates[id].places.some((pl) => path.startsWith(pl)) ? { ok: true } : { ok: false, reason: `${id} may not touch ${path}` }) }
    const calls = []
    const worktrees = { ensureForPanel: async (panelId, cwd) => { calls.push([panelId, cwd]); return cwd === '/home/u/work/site' ? { kind: 'refused', reason: 'fatal: a branch named tc/x already exists' } : { kind: 'active', branch: 'tc/n9-1', path: '/app/worktrees/api/tc-n9-1', root: cwd } } }
    const records = [{ id: 'wt1', root: '/home/u/work/api', path: '/app/worktrees/api/tc-n9-1', branch: 'tc/n9-1', createdAt: 1, panelId: 'n9' }]
    const lane = F.createBoardLane({ gate, worktrees, teammate: (id) => mates[id], originOf, subdirs, recordFor: (panelId, root) => records.find((r) => r.panelId === panelId && r.root === root) })
    const good = await lane.lane({ itemId: 'wi1', chatPanelId: 'n9', teammateId: 't1', repo: 'acme/canvas' })
    const noPlace = await lane.lane({ itemId: 'wi1', chatPanelId: 'n9', teammateId: 't2', repo: 'acme/canvas' })
    const noRepo = await lane.lane({ itemId: 'wi1', chatPanelId: 'n9', teammateId: 't1', repo: 'acme/other' })
    const gitRefused = await lane.lane({ itemId: 'wi2', chatPanelId: 'n10', teammateId: 't1', root: '/home/u/work/site' })
    const gateRefused = await lane.lane({ itemId: 'wi2', chatPanelId: 'n10', teammateId: 't2', root: '/home/u/work/api' })
    const unknownMate = await lane.lane({ itemId: 'wi2', chatPanelId: 'n10', teammateId: 't9', root: '/home/u/work/api' })
    const typedNoRoot = await lane.lane({ itemId: 'wi3', chatPanelId: 'n11', teammateId: 't1' })
    ok('lane.1 the repository is found under a place or its immediate children by origin (case-insensitive, ssh or https, .git or not); the key yields owner/repo and a Jira key none; the lane arm carries the worktree id, path, branch and root after the gate passed on the ROOT; no place, no repository, a refused gate, git\'s own refusal, an unknown teammate and a typed item with no chosen place are each refused by name and mint nothing',
      found === '/home/u/work/api' && direct === '/home/u/work/site' && none === null && key === 'acme/canvas' && badKey === null &&
        good.kind === 'lane' && good.worktreeId === 'wt1' && good.path === '/app/worktrees/api/tc-n9-1' && good.branch === 'tc/n9-1' && good.root === '/home/u/work/api' &&
        noPlace.kind === 'refused' && /bo/.test(noPlace.reason) && /acme\/canvas/.test(noPlace.reason) && /Teammates pane/.test(noPlace.reason) &&
        noRepo.kind === 'refused' && /acme\/other/.test(noRepo.reason) &&
        gitRefused.kind === 'refused' && /already exists/.test(gitRefused.reason) &&
        gateRefused.kind === 'refused' && /may not touch/.test(gateRefused.reason) &&
        unknownMate.kind === 'refused' && /t9/.test(unknownMate.reason) &&
        typedNoRoot.kind === 'refused' && /which place/i.test(typedNoRoot.reason) &&
        calls.length === 2,
      JSON.stringify({ found, direct, none, key, badKey, good, noPlace, noRepo, gitRefused, gateRefused, unknownMate, typedNoRoot, calls }))
  } catch (e) { ok('lane.1 (threw)', false, String(e)) }

const failed = results.filter((r) => !r.pass)
  console.log(`${results.length - failed.length}/${results.length} passed`)
  rmSync(DIR, { recursive: true, force: true })
  process.exit(failed.length === 0 ? 0 : 1)
})()
