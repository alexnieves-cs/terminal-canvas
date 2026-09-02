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
const { mkdtempSync, writeFileSync, renameSync, rmSync, mkdirSync, statSync, readFileSync, lstatSync, chmodSync, symlinkSync, readdirSync, existsSync } = require("node:fs")
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

  console.log('')
  const failed = results.filter((r) => !r.pass)
  console.log(`${results.length - failed.length}/${results.length} passed`)
  rmSync(DIR, { recursive: true, force: true })
  process.exit(failed.length === 0 ? 0 : 1)
})()
