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

const { ok, results } = require('./lib/checks.cjs').createChecks()

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

// M150 — tags.1 / tags.2. TAGS on the vault's lineage. `#name` at a token
// start (start of text, whitespace, `(`), a word of letters, digits, `_`, `-`
// or `/`; NOT a heading (`# Title`), NOT a bare number (`#1` is an issue),
// NOT inside a code span or a fence (the wikilink parser's own exclusion —
// one for both syntaxes); trailing punctuation is not part of the tag.
// Positions exact, so the painter needs no second parse. The index carries
// the tag → notes map from the same pass as the links, case-folded, with
// the first line each note names it on.
{
  const V = F
  const has = typeof V.parseTags === 'function'
  const body = '# Not a tag\n#todo at a line start, then a #Review/Api one and (#paren) and #done. and #1 and `#code` and #café and [see](#section) and \\#escaped and a#frag and #_ and #a/ and [[note|alias #inlink]]\n```\n#fenced\n```\nend #last'
  const tags = has ? V.parseTags(body) : null
  const names = tags ? tags.map((t) => t.name) : null
  const spans = tags ? tags.map((t) => body.slice(t.start, t.end)) : null
  ok('tags.1 parseTags finds a tag at a line start, after a space, in parentheses, a nested one, a Unicode one and one at the very end, and skips a heading, a bare number, a code span, a fence, a markdown link target `](#x)`, an escaped `\\#`, a URL fragment, `#_`, a trailing `/` and a tag inside a wikilink alias; positions are exact and trailing punctuation is not part of the tag',
    has && names !== null && names.join(',') === 'todo,Review/Api,paren,done,café,last' && spans.join(',') === '#todo,#Review/Api,#paren,#done,#café,#last' && tags[5].end === body.length,
    JSON.stringify({ names, spans }))
  const files = [
    { path: 'a.md', body: '# A\n#todo and [[b]]\nlater #TODO again\n', title: 'A' },
    { path: 'b.md', body: '# B\nnothing tagged\n', title: 'B' },
    { path: 'c.md', body: '# C\n\n#todo #review\n', title: 'C' }
  ]
  const index = typeof V.buildVaultIndex === 'function' ? V.buildVaultIndex(files) : null
  const tagIndex = index && index.tags ? index.tags : null
  ok('tags.2 buildVaultIndex.tags maps a case-folded tag to the notes carrying it (path, title, first line), once per note; a note with no tags contributes nothing',
    tagIndex !== null && Array.isArray(tagIndex.todo) && tagIndex.todo.length === 2 && tagIndex.todo[0].path === 'a.md' && tagIndex.todo[0].line === 2 && tagIndex.todo[0].title === 'A' &&
      tagIndex.todo[1].path === 'c.md' && tagIndex.todo[1].line === 3 && Array.isArray(tagIndex.review) && tagIndex.review.length === 1 && Object.keys(tagIndex).length === 2,
    JSON.stringify({ tagIndex }))
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

// M196 (D04) — memory.4. WHICH REPOSITORY REMEMBERS THIS, driven through the
//      resolver into the REAL store so the answer is a filename on disk and
//      not a claim about one.
//      The audit left this open as an investigation rather than a proven
//      defect, and the investigation's answer is here: `--show-toplevel`
//      inside a worktree lane answers the LANE, so a dispatched teammate's
//      memories keyed a file under the app's own worktrees directory —
//      separate from the repository's, read by no door of it, and orphaned the
//      moment the lane was removed. The decision D04 records is that
//      repository memory is REPOSITORY-wide: a lane is a place work happens,
//      not a subject that remembers. ONE file is the whole assertion.
//      The second half is the arm that was being spent. `resolveRepo` has
//      three arms so that git DECLINING stays distinguishable, and the memory
//      door collapsed it into "use the path" — a transient failure wrote to a
//      slug nothing would read again and said nothing. It is now refused by
//      name, and a refused write must leave NO file behind.
{
  const { mkdtempSync, rmSync, readdirSync } = require('node:fs')
  const { tmpdir } = require('node:os')
  const has = typeof F.createMemoryScope === 'function' && typeof F.createScopeResolver === 'function'
  const NAME = 'memory.4 a worktree lane, a subdirectory of that lane and the repository itself all key ONE memory file — the repository\'s — and the read says which repository it reached and through which lane; a directory git does not own still keeps its own path as its subject; and git DECLINING refuses the write by name rather than keying a stray file, leaving nothing on disk'
  if (!has) ok(NAME, false, 'main/work-scope.ts does not export createMemoryScope / createScopeResolver')
  else {
    const dir = mkdtempSync(join(tmpdir(), 'tc memory scope '))
    try {
      const REPO = '/w/api'
      const LANE = '/u/worktrees/api-ab12/tc-p1'
      const records = [{ id: 'w1', path: LANE, root: REPO, branch: 'tc/p1' }]
      const tops = { [REPO]: REPO, [`${REPO}/src`]: REPO, [LANE]: LANE, [`${LANE}/src`]: LANE }
      const resolverFor = (over) => F.createScopeResolver({
        resolveRepo: async (cwd) => (over ? over(cwd) : (tops[cwd] === undefined ? { kind: 'not-a-repo' } : { kind: 'root', root: tops[cwd] })),
        commonRootOf: async (root) => root,
        worktrees: () => records
      })
      const scope = F.createMemoryScope(resolverFor())
      const store = F.createMemoryStore({ dir })
      const write = async (from, text) => {
        const r = await scope(from)
        return r.ok ? store.add({ root: r.root, kind: 'note', text }) : { ok: false, reason: r.reason }
      }
      const fromRepo = await write(REPO, 'from the repository')
      const fromLane = await write(LANE, 'from the lane')
      const fromLaneSub = await write(`${LANE}/src`, 'from inside the lane')
      const fromScratch = await write('/tmp/scratch', 'from a plain folder')
      // Every repository-side write must be readable from the repository, and
      // the lane must not have a file of its own.
      const readAtRepo = await scope(REPO)
      const readAtLane = await scope(LANE)
      // GUARDED. `readAtRepo.root` is undefined on the failure path and
      // `slugOf` would throw on it — and a check that THROWS aborts the suite,
      // so every check below this one would never run and this one's RED would
      // not be evidence (docs/verify-suites.md's first rule). The regression
      // that makes scope unresolved is HALF of what this check fences, so the
      // unguarded form was broken exactly where it matters most.
      const rows = readAtRepo.ok === true ? store.list(readAtRepo.root, 50) : { entries: [] }
      const files = readdirSync(dir).filter((f) => f.endsWith('.jsonl'))
      // git declining: refused, and NOTHING written.
      const declinedScope = F.createMemoryScope(resolverFor(async () => ({ kind: 'unreadable', detail: 'dubious ownership in repository' })))
      const refused = await (async () => { const r = await declinedScope(REPO); return r.ok ? { ok: true } : { ok: false, reason: r.reason } })()
      const filesAfter = readdirSync(dir).filter((f) => f.endsWith('.jsonl'))
      ok(NAME,
        fromRepo.ok === true && fromLane.ok === true && fromLaneSub.ok === true && fromScratch.ok === true &&
          readAtRepo.ok === true && readAtRepo.root === REPO && readAtRepo.scope !== undefined && readAtRepo.scope.lane === undefined &&
          readAtLane.ok === true && readAtLane.root === REPO &&
          readAtLane.scope !== undefined && readAtLane.scope.repository === REPO && readAtLane.scope.lane === LANE && readAtLane.scope.laneBranch === 'tc/p1' &&
          // THE assertion: three writes from three directories, one file.
          rows.entries.length === 3 &&
          rows.entries.some((e) => e.text === 'from the lane') && rows.entries.some((e) => e.text === 'from inside the lane') &&
          // The plain folder is its own subject, so exactly two files exist.
          files.length === 2 &&
          // The key is the RESOLVED root, which is the point: the lane and the
          // repository are asked about separately and land on one filename.
          readAtLane.ok === true && readAtRepo.ok === true &&
          store.fileOf(readAtLane.root) === store.fileOf(readAtRepo.root) &&
          store.fileOf(readAtRepo.root) !== store.fileOf('/tmp/scratch') &&
          refused.ok === false && /could not be resolved/.test(refused.reason) && /dubious ownership/.test(refused.reason) &&
          filesAfter.length === 2,
        JSON.stringify({ readAtRepo, readAtLane, entries: rows.entries.map((e) => e.text), files, refused, filesAfter, oneFile: readAtLane.ok === true && readAtRepo.ok === true && store.fileOf(readAtLane.root) === store.fileOf(readAtRepo.root) }))
    } finally { rmSync(dir, { recursive: true, force: true }) }
  }
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


  // M197 — lane.repos.1. EVERY repository under a teammate's places, for the
  // start flow's repository field. The SAME bounded one-level walk
  // `findRepoUnderPlaces` already makes (a place is typically ~/work holding
  // many clones, and a walk past one level turns a dispatch into a
  // filesystem crawl) — asked for all of them rather than the first match.
  // A repository with NO origin is kept with `repo: null`: it is still a
  // repository to work in, and dropping it would make a local-only checkout
  // invisible with nothing on screen to say why.
  try {
    const roots = new Set(['/home/u/work/api', '/home/u/work/site', '/home/u/work/local', '/home/u/other'])
    const origins = { '/home/u/work/api': 'git@github.com:Acme/Canvas.git', '/home/u/work/site': 'https://github.com/acme/site', '/home/u/other': 'https://github.com/acme/other' }
    const kids = {
      '/home/u/work': ['/home/u/work/api', '/home/u/work/site', '/home/u/work/local', '/home/u/work/notes'],
      '/home/u/other': ['/home/u/other/deep'],
      '/home/u/work/api': ['/home/u/work/api/src']
    }
    const deps = { originOf: (d) => origins[d] ?? null, subdirs: (d) => kids[d] ?? [], isRepoRoot: (d) => roots.has(d) }
    const listed = F.repositoriesUnderPlaces(['/home/u/work', '/home/u/other'], deps)
    // The same place twice, and a place nested inside another: one entry each, in first-seen order.
    const deduped = F.repositoriesUnderPlaces(['/home/u/work', '/home/u/work', '/home/u/work/api'], deps)
    // A place that is ITSELF a repository is listed, and its children are still walked (the existing walk's shape, unchanged).
    const direct = F.repositoriesUnderPlaces(['/home/u/other'], deps)
    const noPlaces = F.repositoriesUnderPlaces([], deps)
    // The cap. A place with more children than the ceiling is truncated, never refused.
    const many = Array.from({ length: F.REPO_LIST_MAX + 20 }, (_, i) => `/big/r${i}`)
    const bigDeps = { originOf: () => null, subdirs: (d) => (d === '/big' ? many : []), isRepoRoot: (d) => d.startsWith('/big/r') }
    const capped = F.repositoriesUnderPlaces(['/big'], bigDeps)
    ok('lane.repos.1 repositoriesUnderPlaces walks a place and its IMMEDIATE children only (a grandchild of a place is never listed), keeps place order, lists a place that is itself a repository, dedupes by path across repeated and nested places, keeps a repository with no origin as `repo: null` rather than dropping it, and truncates at REPO_LIST_MAX rather than refusing',
      listed.map((r) => r.path).join(',') === '/home/u/work/api,/home/u/work/site,/home/u/work/local,/home/u/other' &&
        listed[0].repo === 'acme/canvas' && listed[1].repo === 'acme/site' && listed[2].repo === null &&
        listed.every((r) => r.path !== '/home/u/work/api/src') && listed.every((r) => r.path !== '/home/u/other/deep') &&
        deduped.map((r) => r.path).join(',') === listed.slice(0, 3).map((r) => r.path).join(',') &&
        direct.map((r) => r.path).join(',') === '/home/u/other' &&
        noPlaces.length === 0 && capped.length === F.REPO_LIST_MAX,
      JSON.stringify({ listed, deduped: deduped.map((r) => r.path), direct: direct.map((r) => r.path), noPlaces, capped: capped.length, max: F.REPO_LIST_MAX }))
  } catch (e) { ok('lane.repos.1 (threw)', false, String(e)) }


  // M197 — lane.repos.2. THE DOOR'S THREE ARMS. `board:repositories` is
  // thin wiring in index.ts, which no suite bundles — so the arm decision
  // lives here, where it is driven (M196's own lesson, reached again). An
  // unknown teammate, a teammate with no places, and a real answer INCLUDING
  // an empty one are three renderings: the second's fix is a folder, the
  // third's is a clone, and collapsing them tells the user the wrong one.
  try {
    const deps = { originOf: () => null, subdirs: () => [], isRepoRoot: (d) => d === '/home/u/work/api' }
    const ada = { id: 't1', name: 'ada', brief: '', places: ['/home/u/work/api'], services: [], memory: 'ada', chats: [], messaging: false, scheduling: false }
    const bare = { ...ada, id: 't3', name: 'cy', places: ['/home/u/empty'] }
    const bo = { ...ada, id: 't2', name: 'bo', places: [] }
    const good = F.repositoriesAnswer(ada, deps)
    const empty = F.repositoriesAnswer(bare, deps)
    const noPlaces = F.repositoriesAnswer(bo, deps)
    const unknown = F.repositoriesAnswer(undefined, deps)
    ok('lane.repos.2 the board:repositories arm decision is three states — an unknown teammate refused by name, a teammate with NO PLACES named as a grant with the Teammates pane as its fix, and a real answer whose empty case is `repos: []` (the places hold no repository) rather than the no-places sentence',
      good.kind === 'repos' && good.repos.length === 1 && good.repos[0].path === '/home/u/work/api' && good.repos[0].repo === null &&
        empty.kind === 'repos' && empty.repos.length === 0 &&
        noPlaces.kind === 'no-places' && /bo/.test(noPlaces.reason) && /Teammates pane/.test(noPlaces.reason) &&
        unknown.kind === 'refused' && /teammate/i.test(unknown.reason),
      JSON.stringify({ good, empty, noPlaces, unknown }))
  } catch (e) { ok('lane.repos.2 (threw)', false, String(e)) }

  /* ---- M126: plugin-list, over a fake runner ---- */
  try {
    const RECORDED = JSON.stringify([
      { id: 'superpowers@claude-plugins-official', version: '6.3.0', scope: 'user',
        enabled: true, installPath: '/tmp/p/superpowers/6.3.0' },
      { id: 'atomic-agents@claude-plugins-official', version: 'b15c', scope: 'user',
        enabled: false, installPath: '/tmp/p/atomic/b15c' }
    ])
    const fake = (out, code) => () => Promise.resolve({ stdout: out, code })

    const okRes = await F.listPlugins(fake(RECORDED, 0))
    ok('plugins.1a the recorded JSON parses',
       okRes.kind === 'ok' && okRes.plugins.length === 1, JSON.stringify(okRes))
    ok('plugins.1b only ENABLED plugins are returned',
       okRes.kind === 'ok' && okRes.plugins[0].id.startsWith('superpowers'),
       'a disabled plugin is unavailable to every agent; listing it answers the pane with a lie')

    const bad = await F.listPlugins(fake('not json', 0))
    ok('plugins.1c unparseable output is UNKNOWN, never an empty list',
       bad.kind === 'unknown' && typeof bad.why === 'string', JSON.stringify(bad))

    const nonzero = await F.listPlugins(fake('', 127))
    ok('plugins.1d an absent CLI is UNKNOWN', nonzero.kind === 'unknown', JSON.stringify(nonzero))

    const slow = await F.listPlugins(() => new Promise(() => {}), 50)
    ok('plugins.1e a hung CLI times out to UNKNOWN rather than hanging the read',
       slow.kind === 'unknown' && /timed out/i.test(slow.why), JSON.stringify(slow))
  } catch (e) { ok('plugins.1 (threw)', false, String(e)) }

  /* ---- M130: the trail ---- */
  try {
    const FIXTURE = join(__dirname, 'fixtures', 'skill-trail', 'session.jsonl')
    const all = readFileSync(FIXTURE, 'utf8')
    const one = F.scanTrailChunk(all, '')
    ok('trail.1a only Skill tool_use records become entries',
       one.entries.length === 3, JSON.stringify(one.entries))
    ok('trail.1b order is the transcript order',
       one.entries[0].name === 'superpowers:brainstorming' && one.entries[1].name === 'claude-api' &&
       one.entries[2].name === 'multibyte-test',
       'what order they were used in is the whole point')
    ok('trail.1c args ride when present and are ABSENT when not',
       one.entries[1].args === 'model ids' && !('args' in one.entries[0]),
       'an absent optional field stays absent — a spread would write undefined')

    // The byte-offset resume: two appends must equal one read.
    const cut = Math.floor(all.length / 2)
    const first = F.scanTrailChunk(all.slice(0, cut), '')
    const second = F.scanTrailChunk(all.slice(cut), first.carry)
    ok('trail.1d a truncated final line is CARRIED, never parsed',
       first.entries.length + second.entries.length === one.entries.length,
       'the tail resumes at a byte offset; a half-written line is not a dropped record')

    // M137 — trail.stamp.1. A record with NO parseable timestamp still counts
    // (dropping a real skill call would lie about the session), and its `at`
    // is the PREVIOUS entry's — 0 when it is the first — so ordering holds
    // with nothing invented. Untested until now.
    const noStamp = [
      JSON.stringify({ type: 'assistant', timestamp: '2026-09-06T10:00:00.000Z', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'first' } }] } }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'stampless' } }] } }),
      JSON.stringify({ type: 'assistant', timestamp: 'not a date', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'bad-stamp' } }] } })
    ].join('\n') + '\n'
    const ns = F.scanTrailChunk(noStamp, '')
    const firstAt = Date.parse('2026-09-06T10:00:00.000Z')
    ok('trail.stamp.1 a record with no parseable timestamp keeps its place with the previous entry\'s `at`, never dropped and never given a fresh clock',
       ns.entries.length === 3 && ns.entries[0].at === firstAt && ns.entries[1].at === firstAt && ns.entries[2].at === firstAt &&
         ns.entries.map((e) => e.name).join(',') === 'first,stampless,bad-stamp',
       JSON.stringify(ns.entries))
    const nsFirst = F.scanTrailChunk(noStamp.split('\n').slice(1).join('\n'), '')
    ok('trail.stamp.2 a stampless FIRST record sits at 0',
       nsFirst.entries.length === 2 && nsFirst.entries[0].at === 0, JSON.stringify(nsFirst.entries))
    const many = []
    for (let i = 0; i < F.TRAIL_MAX + 7; i++) many.push({ at: i, name: `s${i}` })
    const capped = F.capTrail(many)
    ok('trail.1e capTrail keeps the newest TRAIL_MAX entries and counts the rest as `more`',
       capped.entries.length === F.TRAIL_MAX && capped.more === 7 &&
       capped.entries[0].name === 's7' && capped.entries[capped.entries.length - 1].name === `s${F.TRAIL_MAX + 6}`,
       JSON.stringify({ len: capped.entries.length, more: capped.more, first: capped.entries[0], last: capped.entries[capped.entries.length - 1] }))

    ok('trail.1f a codex panel refuses BY NAME, never an empty list',
       (await F.trailFor({ backend: 'codex' })).kind === 'unreadable',
       '"no skills used" and "we cannot see this session" are different sentences')
    ok('trail.1g an unresolvable transcript refuses by name',
       (await F.trailFor({ backend: 'claude', resolveTranscript: () => undefined })).kind === 'unreadable', '')

    // trail.1h: a file that SHRANK since the stored offset (truncated or
    // replaced) resets this panel's state and rebuilds from the smaller
    // file, rather than reading forever from a stale offset past its end.
    const SMALL = '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"s1","name":"Skill","input":{"skill":"only-one"}}]},"timestamp":"2026-09-06T13:00:00.000Z"}\n'
    const fullBuf = Buffer.from(all, 'utf8')
    const smallBuf = Buffer.from(SMALL, 'utf8')
    let shrunk = false
    const shrinkReadDelta = (_path, from) => {
      if (!shrunk) { shrunk = true; return { bytes: fullBuf, size: fullBuf.length } }
      if (from === 0) return { bytes: smallBuf, size: smallBuf.length }
      return { bytes: Buffer.alloc(0), size: smallBuf.length }
    }
    const shrinkDeps = { backend: 'claude', panelId: 'trail-shrink-h', pinnedSession: () => 's-h', resolveTranscript: () => 'p-h', readDelta: shrinkReadDelta }
    const beforeShrink = await F.trailFor(shrinkDeps)
    const afterShrink = await F.trailFor(shrinkDeps)
    ok('trail.1h a shrunk transcript resets offset/carry/decoder/entries and rebuilds from the smaller file',
       beforeShrink.kind === 'entries' && beforeShrink.entries.length === 3 &&
       afterShrink.kind === 'entries' && afterShrink.entries.length === 1 && afterShrink.entries[0].name === 'only-one',
       JSON.stringify({ beforeShrink, afterShrink }))

    // trail.1i: the same decode+scan path main uses, fed a multibyte
    // character split across two byte chunks (never a plain string split,
    // which the ASCII-only 1d fixture cannot distinguish from a byte split).
    const { StringDecoder } = require('node:string_decoder')
    const multibyteRecord = all.split('\n').filter(Boolean).pop()
    const recBuf = Buffer.from(multibyteRecord + '\n', 'utf8')
    // "résumé" starts with r(1 byte) + é(2 bytes: 0xC3 0xA9) — split inside the é.
    const splitAt = recBuf.indexOf(Buffer.from('résumé', 'utf8')) + 2
    const chunk1 = recBuf.subarray(0, splitAt)
    const chunk2 = recBuf.subarray(splitAt)
    const decoder = new StringDecoder('utf8')
    const scan1 = F.scanTrailBytes(decoder, chunk1, '')
    const scan2 = F.scanTrailBytes(decoder, chunk2, scan1.carry)
    ok('trail.1i a multibyte character split across two byte chunks reassembles through the shared decoder',
       scan1.entries.length === 0 && scan2.entries.length === 1 && scan2.entries[0].args === 'résumé — ✓',
       JSON.stringify({ scan1, scan2 }))

    // trail.1j: `more` ACCUMULATES across polls. The overflow is dropped in
    // two different places — `scanTrailChunk` bounds one chunk, `capTrail`
    // bounds the assembled list — and only a count carried on the panel's
    // own state survives both. Without it a 200-skill session paints 40
    // cards and says nothing, because the number that would have said so was
    // recomputed from a list that had already been trimmed.
    const rec = (i) => `{"type":"assistant","message":{"content":[{"type":"tool_use","id":"j${i}","name":"Skill","input":{"skill":"j${i}"}}]},"timestamp":"2026-09-06T13:00:0${i % 10}.000Z"}\n`
    let jText = ''
    for (let i = 0; i < 50; i++) jText += rec(i)
    let jBuf = Buffer.from(jText, 'utf8')
    const jDeps = {
      backend: 'claude',
      panelId: 'trail-more-j',
      pinnedSession: () => 's-j',
      resolveTranscript: () => 'p-j',
      readDelta: (_p, from) => ({ bytes: jBuf.subarray(from), size: jBuf.length })
    }
    const j1 = await F.trailFor(jDeps)
    jBuf = Buffer.from(jText + rec(50), 'utf8')
    const j2 = await F.trailFor(jDeps)
    const j3 = await F.trailFor(jDeps)
    ok('trail.1j `more` accumulates across polls — the chunk cap and the list cap are both counted, and a poll with no new bytes never resets it',
       j1.kind === 'entries' && j1.more === 10 &&
       j2.kind === 'entries' && j2.more === 11 &&
       j3.kind === 'entries' && j3.more === 11 &&
       j3.entries.length === F.TRAIL_MAX,
       JSON.stringify({ more: [j1.more, j2.more, j3.more], len: j3.entries && j3.entries.length }))
  } catch (e) { ok('trail.1 (threw)', false, String(e)) }

  /* ---- M130: a CHAT's trail, derived from turns already in memory ---- */
  //
  // The renderer half of the same idea, and pure over `TranscriptTurn[]` so
  // it is checked HERE rather than through a rendered panel: the terminal
  // side reads a file and the chat side reads the store, and the ONE
  // definition of "a skill invocation" has to give both sides the same
  // answer. It lives in shared/skill-trail.ts beside `scanTrailChunk` for
  // exactly that reason.
  try {
    const turn = (at, blocks) => ({ id: `m${at}`, role: 'assistant', blocks, at })
    const skill = (name, input) => ({ type: 'tool_use', id: `tu-${name}`, name, input })
    const mixed = [
      turn(10, [{ type: 'text', text: 'thinking about it' }, skill('Skill', { skill: 'brainstorming' })]),
      // A tool that is NOT Skill, a Skill whose input names no skill, and a
      // Skill whose `skill` is not a string: none of the three is an entry.
      turn(20, [skill('Bash', { command: 'ls' }), skill('Skill', {}), skill('Skill', { skill: 7 })]),
      turn(30, [skill('Skill', { skill: 'writing-plans', args: 'the M130 spec' })])
    ]
    const out = F.trailFromTurns(mixed)
    ok('trail.chat.1a only `Skill` tool_use blocks with a string skill become entries, in turn order',
       out.kind === 'entries' && out.entries.length === 2 &&
       out.entries[0].name === 'brainstorming' && out.entries[1].name === 'writing-plans' &&
       out.entries[0].at === 10 && out.entries[1].at === 30,
       JSON.stringify(out))
    ok('trail.chat.1b args ride when present and are ABSENT when not — never `args: undefined`, which survives a copy and reads as present',
       out.kind === 'entries' && !('args' in out.entries[0]) && out.entries[1].args === 'the M130 spec',
       JSON.stringify(out.kind === 'entries' ? out.entries : out))
    // The SAME cap the file side takes: a 200-skill conversation paints
    // TRAIL_MAX and says how many it did not paint.
    const many = []
    for (let i = 0; i < F.TRAIL_MAX + 7; i++) many.push(turn(i, [skill('Skill', { skill: `s${i}` })]))
    const capped = F.trailFromTurns(many)
    ok('trail.chat.1c a long conversation caps through capTrail — the NEWEST TRAIL_MAX, with the rest counted as `more`',
       capped.kind === 'entries' && capped.entries.length === F.TRAIL_MAX && capped.more === 7 &&
       capped.entries[0].name === 's7' && capped.entries[F.TRAIL_MAX - 1].name === `s${F.TRAIL_MAX + 6}`,
       JSON.stringify(capped.kind === 'entries' ? { n: capped.entries.length, more: capped.more, first: capped.entries[0].name } : capped))
    ok('trail.chat.1d a conversation that used no skills is `none`, never an empty `entries` — the two say different things',
       F.trailFromTurns([turn(1, [{ type: 'text', text: 'no tools at all' }])]).kind === 'none', '')
  } catch (e) { ok('trail.chat.1 (threw)', false, String(e)) }
  // M120 — sandbox.1. THE SANDBOX CWD is the app's own folder under
  // userData/sandbox/<id>: never a place, never the home fallback, made on
  // create and removed on DISPOSE (not on exit — a chat that exits and
  // resumes keeps its files). Pure over injected mkdir/rm.
  try {
    const made = [], removed = []
    const r1 = F.resolveSandboxCwd('/ud', 'c9', { mkdir: (p) => { made.push(p) }, rm: (p) => { removed.push(p) } })
    const r2 = F.resolveSandboxCwd('/ud', '../evil', { mkdir: (p) => { made.push(p) }, rm: () => {} })
    F.disposeSandbox('/ud', 'c9', { mkdir: () => {}, rm: (p) => { removed.push(p) } })
    F.disposeSandbox('/ud', 'c-never', { mkdir: () => {}, rm: (p) => { removed.push(p) } })
    ok('sandbox.1 resolveSandboxCwd makes userData/sandbox/<id> and answers it; an id that is not a plain segment is refused by name and makes nothing; disposeSandbox removes the folder by the same rule',
      r1.kind === 'cwd' && r1.path === '/ud/sandbox/c9' && made.length === 1 && made[0] === '/ud/sandbox/c9' && r2.kind === 'refused' && /id/.test(r2.reason) && removed.length === 2 && removed[0] === '/ud/sandbox/c9',
      JSON.stringify({ r1, r2, made, removed }))
  } catch (e) { ok('sandbox.1 (threw)', false, String(e)) }

  // M122 — psearch.1. FIND IN PANELS over TWO durable logs — the scrollback
  // log (M39) and the chat transcript log (M73) — through one pure function
  // over injected readers. A dormant panel's log answers like a live one;
  // every line leaves through redactSecrets and the count rides the result;
  // the cap is STATED, never silent. Case-insensitive, like M42's search.
  try {
    const dirS = join(DIR, 'psearch')
    mkdirSync(join(dirS, 'scrollback'), { recursive: true }); mkdirSync(join(dirS, 'transcripts'), { recursive: true })
    const slog = F.createScrollbackLog({ dir: join(dirS, 'scrollback'), maxBytes: 1024 * 1024 })
    await slog.append('n1', 'building…\nError: cannot read foo\ntoken ghp_abcdefghijklmnopqrstuvwxyz0123456789 leaked\n')
    await slog.flushAll?.()
    const tlog = F.createAgentTranscriptLog({ dir: join(dirS, 'transcripts') })
    tlog.appendTurn('c1', { id: 'u-1', role: 'user', blocks: [{ type: 'text', text: 'why does the watchdog fire?' }], at: 1 })
    tlog.appendTurn('c1', { id: 'a-1', role: 'assistant', blocks: [{ type: 'text', text: 'the flush gate is the cause\nsee onExit' }], at: 2 })
    tlog.appendTurn('c2', { id: 'a-2', role: 'assistant', blocks: [{ type: 'text', text: 'gate one\ngate two\ngate three\ngate four' }], at: 3 })
    tlog.appendTurn('c3', { id: 'a-3', role: 'assistant', blocks: [{ type: 'text', text: 'the last gate' }], at: 4 })
    const panels = [{ id: 'n1', kind: 'terminal', title: 'api' }, { id: 'c1', kind: 'chat', title: 'api (chat)' }, { id: 'c2', kind: 'chat', title: 'busy' }, { id: 'c3', kind: 'chat', title: 'last' }, { id: 'n9', kind: 'terminal', title: 'nothing' }]
    const deps = { scrollback: (ids, q, caps) => slog.search(ids, q, caps), transcript: (id) => tlog.read(id).turns }
    const caps = { maxHits: 50, maxPerPanel: 10 }
    const gate = await F.searchPanels('gate', panels, deps, caps)
    const foo = await F.searchPanels('FOO', panels, deps, caps)
    const secret = await F.searchPanels('ghp_', panels, deps, caps)
    const one = await F.searchPanels('e', panels, deps, { maxHits: 1, maxPerPanel: 10 })
    const none = await F.searchPanels('zzqx', panels, deps, caps)
    const perPanel = await F.searchPanels('gate', panels, deps, { maxHits: 50, maxPerPanel: 2 })
    ok('psearch.1 a chat that fills its per-panel cap stops only itself (the next chat still answers, uncapped); a transcript hit names its chat and turn with kind transcript; a scrollback hit names its line with kind scrollback (case-insensitive); a planted token never returns and is counted as redacted; maxHits 1 over both logs is capped and SAYS the cap; a panel with no file answers nothing and throws nothing; no match is an empty, uncapped result',
      gate.hits.filter((h) => h.panelId === 'c1').length === 1 && gate.hits[0].panelId === 'c1' && gate.hits[0].kind === 'transcript' && gate.hits[0].turnIndex === 1 && /flush gate/.test(gate.hits[0].line) && gate.capped === false && gate.redacted === 0 &&
        perPanel.hits.filter((h) => h.panelId === 'c2').length === 2 && perPanel.hits.some((h) => h.panelId === 'c3') && perPanel.capped === false &&
        foo.hits.length === 1 && foo.hits[0].panelId === 'n1' && foo.hits[0].kind === 'scrollback' && typeof foo.hits[0].lineIndex === 'number' &&
        secret.hits.length === 1 && /\[redacted github token\]/.test(secret.hits[0].line) && !/ghp_abc/.test(JSON.stringify(secret)) && secret.redacted === 1 &&
        one.hits.length === 1 && one.capped === true && one.cap === 1 &&
        none.hits.length === 0 && none.capped === false,
      JSON.stringify({ gate, foo, secret, one, none, perPanel }))
  } catch (e) { ok('psearch.1 (threw)', false, String(e)) }
  // M123 — update.1. THE UPDATE CHECK, pure over an injected fetcher. Three
  // states and never two: `current`, `newer` (with the release's url) and
  // `could-not-check` (with the reason) — a check that folded the last into
  // the first would tell an offline user they are up to date. The feed is
  // the releases LIST, not `/latest`, so a prerelease is skipped BY NAME
  // rather than trusted; a `v` prefix is optional; the compare is numeric
  // per segment (3.10.0 is newer than 3.9.1 — a string compare says the
  // opposite, silently). No suite ever holds a real fetcher: `verify:meta
  // update.1` greps for one.
  try {
    const feed = [
      { tag_name: 'v3.1.0-beta.1', prerelease: true, html_url: 'https://github.com/acme/canvas/releases/tag/v3.1.0-beta.1' },
      { tag_name: 'v3.1.0', prerelease: false, html_url: 'https://github.com/acme/canvas/releases/tag/v3.1.0', published_at: '2026-09-10T00:00:00Z' },
      { tag_name: 'v3.0.0', prerelease: false, html_url: 'https://github.com/acme/canvas/releases/tag/v3.0.0' }
    ]
    const urls = []
    const fetchOf = (status, body) => async (url) => { urls.push(url); return { status, body } }
    const deps = (status, body) => ({ fetch: fetchOf(status, body), repo: 'acme/canvas' })
    const newer = await F.checkForUpdate('3.0.0', deps(200, JSON.stringify(feed)))
    const same = await F.checkForUpdate('3.1.0', deps(200, JSON.stringify(feed)))
    const ahead = await F.checkForUpdate('3.2.0', deps(200, JSON.stringify(feed)))
    const bare = await F.checkForUpdate('3.0.0', deps(200, JSON.stringify([{ tag_name: '3.2.0', prerelease: false, html_url: 'https://github.com/acme/canvas/releases/tag/3.2.0' }])))
    const forbidden = await F.checkForUpdate('3.0.0', deps(403, '{"message":"rate limit"}'))
    const threw = await F.checkForUpdate('3.0.0', { fetch: async () => { throw new Error('getaddrinfo ENOTFOUND api.github.com') }, repo: 'acme/canvas' })
    const notJson = await F.checkForUpdate('3.0.0', deps(200, 'not json'))
    const notList = await F.checkForUpdate('3.0.0', deps(200, '{"tag_name":"v9.0.0"}'))
    const onlyPre = await F.checkForUpdate('3.0.0', deps(200, JSON.stringify([{ tag_name: 'v4.0.0-rc.1', prerelease: true, html_url: 'x' }])))
    const cmp = F.compareVersions('3.10.0', '3.9.1')
    const cmpEq = F.compareVersions('v3.0.0', '3.0.0')
    const repo = F.repoOf({ repository: { url: 'git+https://github.com/acme/canvas.git' } })
    const repoStr = F.repoOf({ repository: 'github:acme/canvas' })
    const noRepo = F.repoOf({})
    ok('update.1 the newest NON-prerelease wins (3.1.0 over a 3.1.0-beta.1 above it) with its url; equal is current; a bare tag parses; a 403 is could-not-check naming the status; a thrown fetch carries its message; a body that is not JSON or not a list is could-not-check in words; a feed of only prereleases is current; compareVersions is numeric per segment; repoOf reads repository.url',
      newer.kind === 'newer' && newer.version === '3.1.0' && newer.url === 'https://github.com/acme/canvas/releases/tag/v3.1.0' && newer.publishedAt === '2026-09-10T00:00:00Z' &&
        same.kind === 'current' && same.version === '3.1.0' &&
        ahead.kind === 'current' &&
        bare.kind === 'newer' && bare.version === '3.2.0' &&
        forbidden.kind === 'could-not-check' && /GitHub answered 403/.test(forbidden.reason) &&
        threw.kind === 'could-not-check' && /ENOTFOUND/.test(threw.reason) &&
        notJson.kind === 'could-not-check' && /the releases feed could not be read/.test(notJson.reason) &&
        notList.kind === 'could-not-check' && /the releases feed could not be read/.test(notList.reason) &&
        onlyPre.kind === 'could-not-check' && /no releases are published/.test(onlyPre.reason) &&
        cmp > 0 && cmpEq === 0 &&
        repo === 'acme/canvas' && repoStr === 'acme/canvas' && noRepo === null &&
        urls.every((u) => u === 'https://api.github.com/repos/acme/canvas/releases'),
      JSON.stringify({ newer, same, ahead, bare, forbidden, threw, notJson, notList, onlyPre, cmp, cmpEq, repo, repoStr, noRepo, url: urls[0] }))
  } catch (e) { ok('update.1 (threw)', false, String(e)) }

// M145 — clipboard.1–.3 (backlog #13's bytes case). An image on the
// clipboard pasted into a TERMINAL becomes a file main writes under the
// attachments directory, and its PATH is what the terminal receives (a PTY
// cannot take bytes; the agent CLIs read a path). The directory is pruned to
// the newest ATTACHMENTS_KEEP files — a cap, not an age, because a cap cannot
// grow without bound and needs no clock to be right. No image on the
// clipboard is the `empty` arm, never a zero-byte file.
;(async () => {
  const { mkdtempSync, readdirSync, readFileSync, existsSync } = require('node:fs')
  const { join } = require('node:path')
  const { tmpdir } = require('node:os')
  const has = typeof F.writeClipboardImage === 'function' && typeof F.ATTACHMENTS_KEEP === 'number'
  const dir = mkdtempSync(join(tmpdir(), 'tc file clipboard '))
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
  let now = 1000
  const write = (bytes) => F.writeClipboardImage({ dir, now: () => (now += 1), image: () => bytes })
  const first = has ? write(png) : null
  ok('clipboard.1 an image on the clipboard is written as a .png under the directory and the result names its path',
    has && first !== null && first.kind === 'ok' && /\.png$/.test(first.path) && first.path.startsWith(dir) && existsSync(first.path) && readFileSync(first.path).equals(png),
    JSON.stringify({ has, first }))
  const empty = has ? write(null) : null
  ok('clipboard.2 no image on the clipboard is the `empty` arm — no file is written',
    has && empty !== null && empty.kind === 'empty' && readdirSync(dir).length === 1,
    JSON.stringify({ empty, files: has ? readdirSync(dir).length : null }))
  if (has) for (let i = 0; i < F.ATTACHMENTS_KEEP + 5; i++) write(png)
  const files = has ? readdirSync(dir).filter((f) => f.endsWith('.png')) : []
  ok('clipboard.3 the directory is pruned to the newest ATTACHMENTS_KEEP files after each write, and the newest survives',
    has && files.length === F.ATTACHMENTS_KEEP && F.ATTACHMENTS_KEEP >= 10 && files.some((f) => f.includes(String(now))),
    JSON.stringify({ keep: has ? F.ATTACHMENTS_KEEP : null, files: files.length, now }))
})()

// M142 — ledger.usage.1 (backlog #19's history half). Usage HISTORY rides
// #46's run ledger, never a third store: at a panel's kill or exit main
// appends ONE usage row beside the command rows (per-model token totals, the
// turn count, when it ended — priced by the RENDERER with the summary's own
// rule, so main holds no price table). `list` (the inspector's Ledger
// section) still answers command rows only; `usage(since)` answers the
// usage rows at or after `since`, newest first. A malformed usage row costs
// that row.
await (async () => {
  const { mkdtempSync } = require('node:fs')
  const { join } = require('node:path')
  const { tmpdir } = require('node:os')
  const has = typeof F.createRunLedger === 'function'
  const file = join(mkdtempSync(join(tmpdir(), 'tc file ledger-usage ')), 'ledger.jsonl')
  const ledger = has ? F.createRunLedger({ file }) : null
  const totals = (input, output) => ({ input, output, cacheWrite: 0, cacheRead: 0 })
  if (ledger) {
    await ledger.append({ panelId: 'n1', command: 'ls', cwd: '/w', startedAt: 10, endedAt: 20, exitCode: 0 })
    await ledger.append({ kind: 'usage', panelId: 'n1', byModel: { 'claude-sonnet-5': totals(1000, 100) }, turns: 3, endedAt: 5000 })
    await ledger.append({ kind: 'usage', panelId: 'n2', byModel: { 'claude-sonnet-5': totals(500, 50) }, turns: 1, endedAt: 9000 })
    await ledger.append({ kind: 'usage', panelId: 'n3', byModel: { 'nobody-knows': totals(1, 1) }, turns: 1, endedAt: 12000 })
    const { appendFileSync } = require('node:fs')
    appendFileSync(file, '{"kind":"usage","panelId":"n4","byModel":"nope","turns":1,"endedAt":13000}\n')
  }
  const commands = ledger ? await ledger.list('n1', 10) : null
  const since8k = ledger && typeof ledger.usage === 'function' ? await ledger.usage(8000) : null
  const all = ledger && typeof ledger.usage === 'function' ? await ledger.usage(0) : null
  ok('ledger.usage.1 a usage row beside the command rows: list answers commands only, usage(since) answers the usage rows at or after since newest first, and a malformed usage row costs that row',
    has && ledger !== null && typeof ledger.usage === 'function' && Array.isArray(commands) && commands.length === 1 && commands[0].command === 'ls' &&
      Array.isArray(since8k) && since8k.map((r) => r.panelId).join(',') === 'n3,n2' && since8k[0].byModel['nobody-knows'].input === 1 &&
      Array.isArray(all) && all.length === 3 && all.every((r) => r.kind === 'usage' && typeof r.turns === 'number' && typeof r.endedAt === 'number'),
    JSON.stringify({ has, commands, since8k: since8k && since8k.map((r) => r.panelId), all: all && all.length }))
})()

// M181 — image.1. THE IMAGE READ: the media type is decided by MAGIC NUMBER
// and never by extension (a `.png` holding text is `not-an-image` — an
// extension is a claim, the first bytes are a fact), a file over the cap is
// `too-large` from stat WITHOUT its bytes ever reaching a data URL, a
// missing path is its own arm and never a throw, and a real PNG's data URL
// decodes back to the same bytes. Guarded so a missing module fails by name.
{
  const has = typeof F.readImage === 'function' && typeof F.IMAGE_MAX_BYTES === 'number'
  if (!has) ok('image.1 readImage: PNG/JPEG/GIF/WebP by magic number, a .png of text is not-an-image, over the cap is too-large from stat, missing never throws, a PNG data URL round-trips its bytes', false, 'src/main/image-read.ts does not exist')
  else {
    mkdirSync(p('image'), { recursive: true })
    const ip = (n) => join(p('image'), n)
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('IHDR-not-really-but-the-bytes-are-what-round-trip')])
    writeFileSync(ip('real.png'), png)
    writeFileSync(ip('photo.txt'), Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('jfif body')]))
    writeFileSync(ip('anim.bin'), Buffer.from('GIF89a' + 'x'.repeat(20)))
    const webp = Buffer.alloc(24); webp.write('RIFF', 0); webp.writeUInt32LE(16, 4); webp.write('WEBP', 8); webp.write('VP8 ', 12)
    writeFileSync(ip('pic.dat'), webp)
    writeFileSync(ip('lying.png'), 'this is text, not a picture\n')
    const bigPath = ip('big.png')
    // The over-cap file is a REAL PNG by magic number so `too-large` cannot
    // pass by being the not-an-image arm, and it is written from a stream
    // of one buffer so the fixture is cheap.
    writeFileSync(bigPath, Buffer.concat([png, Buffer.alloc(F.IMAGE_MAX_BYTES + 1 - png.length, 0x20)]))
    let threw = null; let missing = null
    try { missing = F.readImage(ip('nope.png')) } catch (e) { threw = String(e) }
    const real = F.readImage(ip('real.png'))
    const jpeg = F.readImage(ip('photo.txt'))
    const gif = F.readImage(ip('anim.bin'))
    const wp = F.readImage(ip('pic.dat'))
    const lying = F.readImage(ip('lying.png'))
    const big = F.readImage(bigPath)
    const prefix = 'data:image/png;base64,'
    const back = real && real.kind === 'data' && real.dataUrl.startsWith(prefix) ? Buffer.from(real.dataUrl.slice(prefix.length), 'base64') : null
    ok('image.1 readImage: PNG/JPEG/GIF/WebP by magic number, a .png of text is not-an-image, over the cap is too-large from stat, missing never throws, a PNG data URL round-trips its bytes',
      F.IMAGE_MAX_BYTES === 5 * 1024 * 1024 &&
        real.kind === 'data' && real.mediaType === 'image/png' && real.bytes === png.length && back !== null && back.equals(png) &&
        jpeg.kind === 'data' && jpeg.mediaType === 'image/jpeg' && jpeg.dataUrl.startsWith('data:image/jpeg;base64,') &&
        gif.kind === 'data' && gif.mediaType === 'image/gif' &&
        wp.kind === 'data' && wp.mediaType === 'image/webp' &&
        lying.kind === 'not-an-image' &&
        big.kind === 'too-large' && big.bytes === F.IMAGE_MAX_BYTES + 1 && big.cap === F.IMAGE_MAX_BYTES && !('dataUrl' in big) &&
        threw === null && missing !== null && missing.kind === 'missing',
      JSON.stringify({ real: real && { kind: real.kind, mediaType: real.mediaType, bytes: real.bytes, roundTrip: back && back.equals(png) }, jpeg: jpeg && jpeg.kind + '/' + jpeg.mediaType, gif: gif && gif.kind + '/' + gif.mediaType, webp: wp && wp.kind + '/' + wp.mediaType, lying: lying && lying.kind, big: big && { kind: big.kind, bytes: big.bytes, cap: big.cap, hasDataUrl: 'dataUrl' in big }, missing, threw }))
  }
}

// M181 — starter.prepare.1. THE STARTER'S TWO FILES, written ONCE: the first
// call creates the directory and both files and lists them; a second call
// writes nothing and answers the same paths; a `welcome.md` the person has
// since edited is NEVER overwritten (byte-identical after the call — a
// starter that re-wrote its note on every launch would erase the one file
// it invited the person to type in); the picture passes readImage as a PNG
// and the note is Markdown with a heading first. Guarded like image.1.
{
  const has = typeof F.prepareStarter === 'function'
  if (!has) ok('starter.prepare.1 prepareStarter writes welcome.md and welcome.png once (creating the directory), a second call writes nothing and answers the same paths, an edited welcome.md is never overwritten, the PNG reads as image/png and the note starts with a heading', false, 'src/main/starter-prepare.ts does not exist')
  else {
    const dir = join(p('starter fixture'), 'nested', 'starter')
    const first = F.prepareStarter(dir)
    const note1 = readFileSync(first.notePath)
    const second = F.prepareStarter(dir)
    const note2 = readFileSync(first.notePath)
    const own = '# my own note\n\nI typed this.\n'
    writeFileSync(first.notePath, own)
    const third = F.prepareStarter(dir)
    const noteAfter = readFileSync(first.notePath, 'utf8')
    const pngRead = typeof F.readImage === 'function' ? F.readImage(first.imagePath) : { kind: 'readImage missing' }
    const noteText = note1.toString('utf8')
    ok('starter.prepare.1 prepareStarter writes welcome.md and welcome.png once (creating the directory), a second call writes nothing and answers the same paths, an edited welcome.md is never overwritten, the PNG reads as image/png and the note starts with a heading',
      first.notePath === join(dir, 'welcome.md') && first.imagePath === join(dir, 'welcome.png') &&
        [...first.wrote].sort().join(',') === [first.imagePath, first.notePath].sort().join(',') &&
        existsSync(first.notePath) && existsSync(first.imagePath) &&
        second.wrote.length === 0 && second.notePath === first.notePath && second.imagePath === first.imagePath && note2.equals(note1) &&
        third.wrote.length === 0 && noteAfter === own &&
        pngRead.kind === 'data' && pngRead.mediaType === 'image/png' &&
        noteText.length > 0 && /^# /.test(noteText.split('\n')[0]),
      JSON.stringify({ first, second, third, noteFirstLine: noteText.split('\n')[0], noteAfterKept: noteAfter === own, png: pngRead && { kind: pngRead.kind, mediaType: pngRead.mediaType } }))
  }
}

// M185 — preview.1. THE PREVIEW'S DISCOVERY, and the claim that matters: it
//      EXECUTES NOTHING. The lister is a fake that records every command it is
//      asked to run, and the check asserts that set is exactly one `lsof` —
//      a discoverer that "helpfully" ran `npm run dev` to find a port would
//      start a server on a person's machine from a hover, and would look
//      identical in every other assertion here.
//      The pure half beside it: lsof's field form parsed (an `n` line with no
//      `p` before it belongs to no process asked about; the IPv4 and IPv6 rows
//      of one socket are one entry; the port is after the LAST colon, so
//      `[::1]:5173` is 5173), the four dev script names in their fixed order
//      with everything else ignored, and the THREE discovery states with a
//      different sentence each.
{
  const has = typeof F.parseListeningPorts === 'function' && typeof F.parseDevScripts === 'function' && typeof F.discoveryOf === 'function' && typeof F.discoverPreview === 'function'
  const NAME = 'preview.1 discovery expands the panel\'s pid to its process TREE and runs ONE lsof over it and nothing else (no dev script is ever executed), and a panel with no process answers not-asked rather than none; parseListeningPorts reads the field form, drops an n line with no pid, dedupes one socket\'s two rows and takes the port after the last colon; parseDevScripts returns the four names in order with the project name, undefined for unparseable text and an empty list for a file that names none; discoveryOf answers not-asked/none/one/many with a different sentence each; a missing package.json is not a failure'
  if (!has) ok(NAME, false, 'preview.ts / preview-discover.ts do not export parseListeningPorts, parseDevScripts, discoveryOf and discoverPreview')
  else {
    const ports = F.parseListeningPorts([
      'n*:9999',
      'p4242', 'n*:5173', 'n[::1]:5173', 'n127.0.0.1:5173',
      'p4243', 'nnot-an-address', 'n127.0.0.1:0', 'n127.0.0.1:70000', 'n127.0.0.1:8080',
      'pnope', 'n127.0.0.1:1234'
    ].join('\n'))
    const good = F.parseDevScripts(JSON.stringify({ name: 'shop', scripts: { test: 'vitest', preview: 'vite preview', dev: 'vite', build: 'tsc' } }))
    const bare = F.parseDevScripts(JSON.stringify({ scripts: { test: 'vitest' } }))
    const notJson = F.parseDevScripts('<html>')
    const notObject = F.parseDevScripts('[1,2]')
    const one = F.discoveryOf({ ports: [{ pid: 1, port: 5173 }], project: 'shop', scripts: [], where: '/w/shop' })
    const many = F.discoveryOf({ ports: [{ pid: 1, port: 5173 }, { pid: 2, port: 4000 }], where: '/w/shop' })
    const none = F.discoveryOf({ ports: [], scripts: [{ name: 'dev', command: 'vite' }], where: '/w/shop' })
    // M186 (M185's critic, 6). NOT ASKED is not "nothing answered": one is
    // fixed by selecting the running terminal, the other by starting a server.
    const notAsked = F.discoveryOf({ ports: [], asked: false, scripts: [{ name: 'dev', command: 'vite' }], where: '/w/shop' })
    const bareNone = F.discoveryOf({ ports: [], where: '/w/shop' })
    // The discoverer over fakes: one process tree, one package.json, one recorded command.
    const asked = []
    const run = async (command, args) => { asked.push([command, ...args].join(' ')); return { code: 0, stdout: 'p4242\nn127.0.0.1:5173\n' } }
    // M186 (M185's critic, 1). The panel's pid is a SHELL; the socket is held
    // by its descendant, so the discoverer expands the tree first and asks
    // lsof about the descendant — a run that asked about 4242 alone answered
    // `nothing is listening` for every real dev server.
    const found = await F.discoverPreview({ pids: [4242], descendants: async (roots) => [...roots, 9001], cwd: '/w/shop', run, readText: async (path) => (path === '/w/shop/package.json' ? JSON.stringify({ name: 'shop', scripts: { dev: 'vite' } }) : undefined) })
    const noPkg = await F.discoverPreview({ pids: [4242], cwd: '/w/none', run, readText: async () => undefined })
    // No pid at all: nothing to ask lsof about, so lsof is not asked either.
    const before = asked.length
    const noPids = await F.discoverPreview({ pids: [], cwd: '/w/shop', run, readText: async () => undefined })
    ok(NAME,
      ports.map((p) => `${p.pid}:${p.port}`).join(',') === '4242:5173,4243:8080' &&
        good !== undefined && good.name === 'shop' && good.scripts.map((s) => s.name).join(',') === 'dev,preview' && good.scripts[0].command === 'vite' &&
        bare !== undefined && bare.name === undefined && bare.scripts.length === 0 &&
        notJson === undefined && notObject === undefined &&
        one.kind === 'one' && /5173/.test(one.note) && /shop/.test(one.note) &&
        many.kind === 'many' && /2 processes/.test(many.note) && many.candidates.length === 2 && many.candidates[0].url === 'http://127.0.0.1:5173/' &&
        none.kind === 'none' && /dev would start it/.test(none.note) &&
        bareNone.kind === 'none' && /no dev script/.test(bareNone.note) &&
        found.kind === 'one' && found.project === 'shop' && found.candidates[0].url === 'http://127.0.0.1:5173/' && found.scripts.map((s) => s.name).join(',') === 'dev' &&
        noPkg.kind === 'one' && noPkg.project === undefined && noPkg.scripts.length === 0 &&
        notAsked.kind === 'not-asked' && /nothing to ask/.test(notAsked.note) && /select the terminal/.test(notAsked.note) &&
        noPids.kind === 'not-asked' && asked.length === before &&
        asked.every((c) => c.startsWith('lsof ')) && asked.length === 2 &&
        asked[0] === 'lsof -nP -iTCP -sTCP:LISTEN -F pn -a -p 4242,9001',
      JSON.stringify({ ports, good, bare, notJson, notObject, one, many, none, notAsked, bareNone, found, noPkg, noPids, asked }))
  }
}

// M185 — preview.capture.1. THE CAPTURE'S THREE REFUSALS AND ITS PROVENANCE.
//      The scheme is checked on the guest's LIVE url — the same rule as the
//      read path and for the same reason (a page redirects itself to `data:`
//      and a capture of the user's disk is a file this app made of something
//      it was never pointed at) — and NO file is written when it is refused,
//      which is the assertion that separates a refusal from a 0-byte PNG on
//      the canvas. An empty image is refused BY NAME rather than written,
//      because `capturePage` answers a zero-size image for a guest that has
//      not painted and a broken image kind is the wrong thing to show for a
//      page that was merely not ready. The result names the PAGE.
{
  const has = typeof F.capturePreview === 'function' && typeof F.captureFileName === 'function'
  const NAME = 'preview.capture.1 capturePreview refuses a data:/file:/about: page by name, an empty image by name and a write that throws by name, writing NOTHING in any of them; a real capture writes one PNG under the given directory, names the page and its host on the result, and its file name carries a sortable stamp and the host'
  if (!has) ok(NAME, false, 'preview-capture.ts does not export capturePreview / captureFileName')
  else {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])
    const make = (url, image) => {
      const wrote = []
      return {
        wrote,
        deps: {
          getUrl: () => url,
          capture: async () => image,
          write: async (path, data) => { wrote.push({ path, bytes: data.length }) },
          dir: '/w/captures/',
          now: () => Date.UTC(2026, 8, 8, 17, 40, 12)
        }
      }
    }
    const dataUrl = make('data:text/html,<b>hi</b>', { toPNG: () => png })
    const refusedData = await F.capturePreview(dataUrl.deps)
    const fileUrl = make('file:///etc/passwd', { toPNG: () => png })
    const refusedFile = await F.capturePreview(fileUrl.deps)
    const emptyOne = make('http://127.0.0.1:5173/app', { toPNG: () => png, isEmpty: () => true })
    const refusedEmpty = await F.capturePreview(emptyOne.deps)
    const zeroOne = make('http://127.0.0.1:5173/app', { toPNG: () => new Uint8Array(0) })
    const refusedZero = await F.capturePreview(zeroOne.deps)
    const threw = make('http://127.0.0.1:5173/app', null)
    threw.deps.capture = async () => { throw new Error('gone') }
    const refusedThrow = await F.capturePreview(threw.deps)
    // M186 (M185's critic, 4). A write that THROWS takes the refused arm: the
    // renderer awaits this with no catch, so a rejection was a Capture button
    // that said nothing at all.
    const badWrite = make('http://127.0.0.1:5173/app', { toPNG: () => png, isEmpty: () => false })
    badWrite.deps.write = async () => { throw new Error('no space left on device') }
    const refusedWrite = await F.capturePreview(badWrite.deps)
    const good = make('http://127.0.0.1:5173/app', { toPNG: () => png, isEmpty: () => false })
    const captured = await F.capturePreview(good.deps)
    const name = F.captureFileName('http://127.0.0.1:5173/app', Date.UTC(2026, 8, 8, 17, 40, 12))
    ok(NAME,
      refusedData.kind === 'refused' && /data:/.test(refusedData.reason) && dataUrl.wrote.length === 0 &&
        refusedFile.kind === 'refused' && /disk/.test(refusedFile.reason) && fileUrl.wrote.length === 0 &&
        refusedEmpty.kind === 'refused' && /no pixels/.test(refusedEmpty.reason) && emptyOne.wrote.length === 0 &&
        refusedZero.kind === 'refused' && zeroOne.wrote.length === 0 &&
        refusedThrow.kind === 'refused' && /gone/.test(refusedThrow.reason) && threw.wrote.length === 0 &&
        refusedWrite.kind === 'refused' && /could not be written/.test(refusedWrite.reason) && /no space left/.test(refusedWrite.reason) &&
        captured.kind === 'captured' && captured.url === 'http://127.0.0.1:5173/app' && captured.host === '127.0.0.1:5173' && captured.bytes === png.length &&
        good.wrote.length === 1 && good.wrote[0].path === `/w/captures/${name}` && good.wrote[0].bytes === png.length &&
        /^2026-09-08T17-40-12/.test(name) && /127\.0\.0\.1_5173/.test(name) && name.endsWith('.png'),
      JSON.stringify({ refusedData, refusedFile, refusedEmpty, refusedZero, refusedThrow, refusedWrite, captured, name, wrote: good.wrote }))
  }
}

// M195 (D03) — preview.bind.1. WHICH CHANGES BELONG TO WHICH PREVIEW.
//      The defect this closes is a callback that took no parameter
//      (`BrowserNode.tsx`, `onChanged(() => …)`): every loopback pane reloaded
//      on every open file panel's change, so two local projects reloaded one
//      another. The rule is pure so all of its arms are drivable, and the arms
//      are the point — a `skip` with no `why` is a preview that stopped
//      reloading for a reason nobody can name.
//      Containment is on SEGMENT boundaries: `/a/b` holds `/a/b/c` and itself
//      and does NOT hold `/a/bc`, which a `startsWith` would answer yes to and
//      would bind a preview to its neighbour on disk. A relative path is
//      refused on either side rather than resolved against a root nobody chose
//      (`shared/places.ts`'s rule, reached from the display side).
{
  const has = typeof F.normalisePreviewPath === 'function' && typeof F.pathInsidePreview === 'function' && typeof F.previewReloadDecision === 'function'
  const NAME = 'preview.bind.1 normalisePreviewPath collapses . and .. and trailing slashes and refuses a relative path; pathInsidePreview holds the root itself and anything under it, and refuses a sibling whose name merely starts with it; previewReloadDecision answers reload only for a bound pane, a loopback live url and a changed path inside the root, every refusal names a DIFFERENT why (unbound, not-local, no-path, unknown-source, outside), an input tripping three guards at once names the one that wins, and a live panel with no readable path is unknown-source rather than no-path'
  if (!has) ok(NAME, false, 'shared/preview.ts does not export normalisePreviewPath / pathInsidePreview / previewReloadDecision')
  else {
    const norm = {
      plain: F.normalisePreviewPath('/a/b'),
      trailing: F.normalisePreviewPath('/a/b///'),
      dots: F.normalisePreviewPath('/a/./b/c/../'),
      out: F.normalisePreviewPath('/a/b/../../..'),
      root: F.normalisePreviewPath('/'),
      relative: F.normalisePreviewPath('a/b'),
      tilde: F.normalisePreviewPath('~/work'),
      empty: F.normalisePreviewPath('')
    }
    const inside = {
      self: F.pathInsidePreview('/w/api', '/w/api'),
      under: F.pathInsidePreview('/w/api', '/w/api/src/index.ts'),
      trailingRoot: F.pathInsidePreview('/w/api/', '/w/api/src/index.ts'),
      sibling: F.pathInsidePreview('/w/api', '/w/apiary/src/index.ts'),
      above: F.pathInsidePreview('/w/api', '/w/index.ts'),
      escaped: F.pathInsidePreview('/w/api', '/w/api/../other/x.ts'),
      relativePath: F.pathInsidePreview('/w/api', 'src/index.ts'),
      relativeRoot: F.pathInsidePreview('w/api', '/w/api/src/index.ts')
    }
    const bound = { root: '/w/api' }
    const local = 'http://127.0.0.1:5173/app'
    const d = {
      // PRECEDENCE. Every other input below trips exactly one guard, so the
      // order of the guards is unpinned by them: reordering the rule (asking
      // about the path before the host, say) would pass. These two inputs trip
      // three guards at once, and the answer says which one wins.
      unboundFirst: F.previewReloadDecision({ binding: undefined, changedPath: undefined, liveUrl: 'https://example.com/' }),
      localBeforePath: F.previewReloadDecision({ binding: bound, changedPath: undefined, liveUrl: 'https://example.com/' }),
      // A LIVE panel with no path this canvas can read (a skill panel, whose
      // record carries {scope, name} and no path) is a different fact from a
      // panel that is gone.
      unknownSource: F.previewReloadDecision({ binding: bound, changedPath: undefined, liveUrl: local, changedPanelExists: true }),
      // A binding to the filesystem root holds every path — arithmetic, not a
      // policy; the bind door is what refuses it.
      wholeDisk: F.previewReloadDecision({ binding: { root: '/' }, changedPath: '/anywhere/at/all.ts', liveUrl: local }),
      reload: F.previewReloadDecision({ binding: bound, changedPath: '/w/api/src/a.ts', liveUrl: local }),
      reloadLocalhost: F.previewReloadDecision({ binding: bound, changedPath: '/w/api/src/a.ts', liveUrl: 'http://localhost:3000/' }),
      reloadV6: F.previewReloadDecision({ binding: bound, changedPath: '/w/api/src/a.ts', liveUrl: 'http://[::1]:3000/' }),
      unbound: F.previewReloadDecision({ binding: undefined, changedPath: '/w/api/src/a.ts', liveUrl: local }),
      outside: F.previewReloadDecision({ binding: bound, changedPath: '/w/site/src/a.ts', liveUrl: local }),
      sibling: F.previewReloadDecision({ binding: bound, changedPath: '/w/apiary/src/a.ts', liveUrl: local }),
      notLocal: F.previewReloadDecision({ binding: bound, changedPath: '/w/api/src/a.ts', liveUrl: 'https://docs.example.com/guide' }),
      noPath: F.previewReloadDecision({ binding: bound, changedPath: undefined, liveUrl: local }),
      noUrl: F.previewReloadDecision({ binding: bound, changedPath: '/w/api/src/a.ts', liveUrl: null })
    }
    const whys = [d.unbound, d.outside, d.notLocal, d.noPath, d.unknownSource].map((x) => x.why)
    ok(NAME,
      norm.plain === '/a/b' && norm.trailing === '/a/b' && norm.dots === '/a/b' && norm.out === '/' && norm.root === '/' &&
        norm.relative === null && norm.tilde === null && norm.empty === null &&
        inside.self === true && inside.under === true && inside.trailingRoot === true &&
        inside.sibling === false && inside.above === false && inside.escaped === false &&
        inside.relativePath === false && inside.relativeRoot === false &&
        d.reload.kind === 'reload' && d.reloadLocalhost.kind === 'reload' && d.reloadV6.kind === 'reload' &&
        d.unbound.kind === 'skip' && d.unbound.why === 'unbound' &&
        d.outside.kind === 'skip' && d.outside.why === 'outside' &&
        d.sibling.kind === 'skip' && d.sibling.why === 'outside' &&
        d.notLocal.kind === 'skip' && d.notLocal.why === 'not-local' &&
        d.noPath.kind === 'skip' && d.noPath.why === 'no-path' &&
        d.noUrl.kind === 'skip' && d.noUrl.why === 'not-local' &&
        d.unboundFirst.why === 'unbound' && d.localBeforePath.why === 'not-local' &&
        d.unknownSource.kind === 'skip' && d.unknownSource.why === 'unknown-source' &&
        d.wholeDisk.kind === 'reload' &&
        new Set(whys).size === 5,
      JSON.stringify({ norm, inside, d }))
  }
}

// M195 (D03) — preview.bind.2. THE THREE SENTENCES A SOURCE IS EXPLAINED WITH.
//      Three states, never two (this repo's rule): bound to a folder whose
//      panel is still open, bound to a folder whose panel has closed — the
//      binding is STILL VALID and the guide says to keep it — and not bound at
//      all, which must say what that MEANS rather than print a bare zero. A
//      collapsed pair here is a person looking at a preview that stopped
//      reloading with nothing on screen that says why.
{
  const has = typeof F.previewSourceLine === 'function'
  const NAME = 'preview.bind.2 previewSourceLine answers FOUR different sentences — bound with a live source, bound with a closed source, bound with no source panel at all, and not bound — each naming the folder when there is one, the root-only one carrying words rather than a bare path, the unbound one saying that NOTHING reloads the pane (never that it reloads for nothing, which is the behaviour this milestone removed), and every one in the pane\'s own register'
  if (!has) ok(NAME, false, 'shared/preview.ts does not export previewSourceLine')
  else {
    const live = F.previewSourceLine({ root: '/w/api', sourcePanelId: 'p1' }, 'the api terminal')
    const closed = F.previewSourceLine({ root: '/w/api', sourcePanelId: 'p1' }, undefined)
    const noSource = F.previewSourceLine({ root: '/w/api' }, undefined)
    const unbound = F.previewSourceLine(undefined, undefined)
    const lines = [live, closed, noSource, unbound]
    ok(NAME,
      lines.every((l) => typeof l === 'string' && l.length > 0) &&
        new Set(lines).size === 4 &&
        /the api terminal/.test(live) && /\/w\/api/.test(live) &&
        /closed/.test(closed) && /\/w\/api/.test(closed) &&
        // The root-only arm carries WORDS, not a bare path: it is what a
        // lineup's preview seat is born with, and a naked absolute path in a
        // field is the bare-value rendering this repo's rule forbids.
        /\/w\/api/.test(noSource) && !/closed/.test(noSource) && noSource.replace('/w/api', '').trim().length > 8 &&
        // The unbound sentence must say NOTHING RELOADS IT. Saying it "reloads
        // for nothing" describes the behaviour M195 removed and tells a person
        // that binding narrows reloading when in fact it turns it on.
        /not bound/.test(unbound) && /nothing reloads/.test(unbound) && !/reloads this pane for nothing/.test(unbound) &&
        // Register: the pane's own — no leading capital, no full stop. (The
        // first cut wrote `l === l.toLowerCase() || !/^[A-Z]/…`, whose `||`
        // made the whole clause unfalsifiable for any lowercase-initial line.)
        lines.every((l) => !/^[A-Z]/.test(l) && !l.endsWith('.')),
      JSON.stringify({ live, closed, noSource, unbound }))
  }
}

// M196 (D04) — scope.1. THE THREE FACTS THE POLICY KEEPS APART, as arithmetic.
//      `insideDirectory` is the containment every scope question is answered
//      with, and its failure is a WRONG ANSWER SHAPED LIKE A RIGHT ONE: a bare
//      startsWith holds `/w/apiary` inside `/w/api`, so a cwd would translate
//      to the neighbouring project's repository and every door downstream would
//      then agree, confidently, about the wrong repository.
//      `laneOfPath` picks the LONGEST record, because records nest and the
//      shortest match names a grandparent for work happening in a child.
{
  const has = typeof F.insideDirectory === 'function' && typeof F.laneOfPath === 'function' && typeof F.normaliseScopePath === 'function'
  const NAME = 'scope.1 the pure scope policy: containment on segment boundaries (a sibling sharing a prefix is OUTSIDE), a relative or empty path answering null rather than being resolved against a guess, laneOfPath taking the LONGEST matching record and nothing for a plain directory'
  if (!has) ok(NAME, false, 'shared/work-scope.ts does not export insideDirectory / laneOfPath / normaliseScopePath')
  else {
    const norm = {
      plain: F.normaliseScopePath('/a/b'),
      trailing: F.normaliseScopePath('/a/b/'),
      dots: F.normaliseScopePath('/a/c/../b'),
      root: F.normaliseScopePath('/'),
      relative: F.normaliseScopePath('a/b'),
      tilde: F.normaliseScopePath('~/a'),
      empty: F.normaliseScopePath('')
    }
    const inside = {
      self: F.insideDirectory('/w/api', '/w/api'),
      under: F.insideDirectory('/w/api', '/w/api/src/x.ts'),
      trailing: F.insideDirectory('/w/api/', '/w/api/src'),
      // The whole reason the rule is not startsWith.
      sibling: F.insideDirectory('/w/api', '/w/apiary/src'),
      above: F.insideDirectory('/w/api/src', '/w/api'),
      root: F.insideDirectory('/', '/w/api'),
      relative: F.insideDirectory('/w/api', 'src/x.ts')
    }
    const records = [
      { id: 'w1', path: '/u/worktrees/api-ab12/tc-p1', root: '/w/api', branch: 'tc/p1' },
      // Nested: a record whose PATH is under the first one's. The longest match
      // has to win or work in the child names the grandparent's repository.
      { id: 'w2', path: '/u/worktrees/api-ab12/tc-p1/inner', root: '/w/other', branch: 'tc/p2' },
      { id: 'w3', path: '/u/worktrees/api-ab12x', root: '/w/decoy' }
    ]
    const lane = {
      exact: F.laneOfPath('/u/worktrees/api-ab12/tc-p1', records),
      below: F.laneOfPath('/u/worktrees/api-ab12/tc-p1/src/server.ts', records),
      nested: F.laneOfPath('/u/worktrees/api-ab12/tc-p1/inner/src', records),
      // The decoy shares a prefix with the first record's path and must not match it.
      decoy: F.laneOfPath('/u/worktrees/api-ab12x/src', records),
      plain: F.laneOfPath('/w/api/src', records)
    }
    ok(NAME,
      norm.plain === '/a/b' && norm.trailing === '/a/b' && norm.dots === '/a/b' && norm.root === '/' &&
        norm.relative === null && norm.tilde === null && norm.empty === null &&
        inside.self === true && inside.under === true && inside.trailing === true && inside.root === true &&
        inside.sibling === false && inside.above === false && inside.relative === false &&
        lane.exact !== undefined && lane.exact.id === 'w1' &&
        lane.below !== undefined && lane.below.id === 'w1' &&
        lane.nested !== undefined && lane.nested.id === 'w2' &&
        lane.decoy !== undefined && lane.decoy.id === 'w3' &&
        lane.plain === undefined &&
      JSON.stringify({ norm, inside, lane: { exact: lane.exact && lane.exact.id, below: lane.below && lane.below.id, nested: lane.nested && lane.nested.id, decoy: lane.decoy && lane.decoy.id, plain: lane.plain } }))
  }
}

// M186 — asset.1. THE CONTENT-ADDRESSED STORE, over a real fixture directory.
//      The id is a digest of the BYTES, so the same picture taken in twice is
//      ONE file and the second write is skipped — which is what makes an id a
//      fact an export can carry rather than a fact about this filesystem. The
//      extension comes from the MAGIC NUMBER and never from the name the file
//      arrived under (a `.png` holding a JPEG is the ordinary downloaded
//      picture, and a store that believed the name would hand the renderer a
//      data URL with the wrong type in it). Both caps are REPORTED: an asset
//      over the single cap is refused by name with its size and never written,
//      and a store over its cap is pruned oldest-first with the count on the
//      result. A file that is not an image, and a file that is not there, are
//      two different named refusals — never one.
{
  const has = typeof F.putAsset === 'function' && typeof F.isAssetId === 'function' && typeof F.assetFileName === 'function'
  const NAME = 'asset.1 putAsset content-addresses by sha-256 (the same bytes twice = one file, written once), takes its extension from the magic number and not the name, refuses a file over the single cap with its size and writes nothing, refuses a non-image by its first bytes, refuses a missing path, and prunes the OLDEST past the store cap with the count reported'
  if (!has) ok(NAME, false, 'assets.ts / asset-store.ts do not export putAsset, isAssetId and assetFileName')
  else {
    const dir = join(DIR, 'asset store')
    const src = join(DIR, 'asset sources')
    mkdirSync(src, { recursive: true })
    const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)])
    const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 9)])
    const TEXT = Buffer.from('this is not a picture, whatever it is called', 'utf8')
    // A JPEG under a .png name: the extension must follow the bytes.
    writeFileSync(join(src, 'one.png'), PNG)
    writeFileSync(join(src, 'copy-of-one.PNG'), PNG)
    writeFileSync(join(src, 'lying.png'), JPEG)
    writeFileSync(join(src, 'notes.png'), TEXT)
    const first = await F.putAsset({ dir, path: join(src, 'one.png') })
    const again = await F.putAsset({ dir, path: join(src, 'copy-of-one.PNG') })
    const lying = await F.putAsset({ dir, path: join(src, 'lying.png') })
    const notImage = await F.putAsset({ dir, path: join(src, 'notes.png') })
    const missing = await F.putAsset({ dir, path: join(src, 'no-such-file.png') })
    const tooBig = await F.putAsset({ dir, path: join(src, 'one.png'), maxBytes: 8 })
    const filesAfter = readdirSync(dir).sort()
    // Read BEFORE the prune below: the prune deletes these two, and asserting
    // existsSync afterwards would fail for the store working exactly as it
    // should (the check's own ordering, not the store's).
    const firstExisted = existsSync(first.path)
    // The prune: a store cap smaller than what is in it drops the OLDEST.
    const pruned = await F.putAsset({ dir, bytes: Buffer.concat([Buffer.from([0x47, 0x49, 0x46, 0x38]), Buffer.alloc(32, 3)]), storeMaxBytes: 90 })
    const filesPruned = readdirSync(dir).sort()
    ok(NAME,
      first.kind === 'stored' && F.isAssetId(first.id) && first.mediaType === 'image/png' &&
        first.path === join(dir, F.assetFileName(first.id, 'image/png')) && first.wrote === true && firstExisted &&
        again.kind === 'stored' && again.id === first.id && again.wrote === false &&
        lying.kind === 'stored' && lying.mediaType === 'image/jpeg' && lying.path.endsWith('.jpg') && lying.id !== first.id &&
        notImage.kind === 'refused' && /first bytes/.test(notImage.reason) &&
        missing.kind === 'refused' && /not there/.test(missing.reason) &&
        tooBig.kind === 'refused' && /over this app/.test(tooBig.reason) &&
        filesAfter.length === 2 &&
        pruned.kind === 'stored' && pruned.prunedCount >= 1 && filesPruned.includes(F.assetFileName(pruned.id, 'image/gif')) &&
        filesPruned.length < filesAfter.length + 1,
      JSON.stringify({ first, again, lying, notImage, missing, tooBig, filesAfter, firstExisted, pruned, filesPruned }))
  }
}

// M188 — node.http.1. THE FETCH NODE IS A GET AND ONLY A GET. Every other
//      method is refused BY NAME, and the refusal names the method the author
//      WROTE — a node silently rewritten to GET would run something other
//      than what it says on the diagram. The reason is structural: a write
//      belongs on the broker's approval path, where M102 asks the teammate's
//      own chat before a token is read, and a node that could POST without
//      passing it would be a way around the door this app already built. A
//      non-http(s) url is its own refusal. The body is capped INSIDE the
//      module and passes `outward`, so a token a server happens to return is
//      scrubbed and the note names the host and the count.
{
  const has = typeof F.runHttpNode === 'function' && typeof F.httpNodeRefusal === 'function'
  const NAME = 'node.http.1 runHttpNode refuses every method but GET by name (naming the method as written), a non-http(s) url and a url carrying a name and password, and fetches NOTHING when it refuses; a GET is capped, passed through the outward gate with a planted token scrubbed and the host and count in its note, and reports its duration'
  if (!has) ok(NAME, false, 'node-run.ts does not export runHttpNode / httpNodeRefusal')
  else {
    const asked = []
    const deps = (body) => ({ fetch: async (url) => { asked.push(url); return { status: 200, body } }, now: (() => { let t = 1000; return () => (t += 25) })() })
    const post = await F.runHttpNode({ url: 'https://example.com/', method: 'post' }, deps(''))
    const del = await F.runHttpNode({ url: 'https://example.com/', method: 'DELETE' }, deps(''))
    const fileUrl = await F.runHttpNode({ url: 'file:///etc/passwd' }, deps(''))
    const notUrl = await F.runHttpNode({ url: 'nonsense' }, deps(''))
    // M190's critic (5). A url carrying a name and password sends Basic auth
    // on the wire and shows only the HOST in the note — the credential would
    // be neither scrubbed nor visible anywhere.
    const withPassword = await F.runHttpNode({ url: 'https://user:secret@example.com/' }, deps(''))
    const askedBefore = asked.length
    const token = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    const okDeps = deps(`hello world GITHUB_TOKEN=${token}`)
    const fetched = await F.runHttpNode({ url: 'https://example.com/thing', method: 'GET' }, okDeps)
    const bigDeps = deps('x'.repeat(F.NODE_FETCH_MAX_BYTES + 500))
    const big = await F.runHttpNode({ url: 'https://example.com/big' }, bigDeps)
    const threw = { fetch: async () => { throw new Error('no route to host') }, now: () => 0 }
    const failed = await F.runHttpNode({ url: 'https://example.com/' }, threw)
    ok(NAME,
      post.kind === 'refused' && /POST is a write/.test(post.reason) && /approval door/.test(post.reason) &&
        del.kind === 'refused' && /DELETE is a write/.test(del.reason) &&
        fileUrl.kind === 'refused' && /file:/.test(fileUrl.reason) &&
        notUrl.kind === 'refused' && /not a URL/.test(notUrl.reason) &&
        withPassword.kind === 'refused' && /name and password/.test(withPassword.reason) &&
        askedBefore === 0 &&
        fetched.kind === 'ok' && fetched.status === 200 && fetched.text.includes('hello world') && !fetched.text.includes(token) &&
        /example\.com/.test(fetched.note) && /redacted/.test(fetched.note) && fetched.truncated === false && fetched.ms > 0 &&
        big.kind === 'ok' && big.truncated === true && big.text.length <= F.NODE_FETCH_MAX_BYTES &&
        failed.kind === 'refused' && /no route to host/.test(failed.reason),
      JSON.stringify({ post, del, fileUrl, notUrl, withPassword, askedBefore, fetched: { ...fetched, text: fetched.text && fetched.text.slice(0, 40) }, bigTruncated: big.truncated, failed }))
  }
}

// M189 — portable.1. THE PORTABLE FILE, and the parts it does not have.
//      The record is built FIELD BY FIELD, so a terminal's resolved
//      environment, a chat's session id and transcript, and a live pid have
//      nowhere to go — the check plants all three on the input and asserts
//      the file's text does not contain them. A planted token is scrubbed and
//      COUNTED. A panel kind that cannot travel is dropped with a reason that
//      says what would happen on the other machine. Pictures are omitted BY
//      DEFAULT with an entry that says a picture cannot be scrubbed by
//      machine — never "redacted". `parsePortable` answers three ways, and a
//      FUTURE version is its own arm naming both numbers. `remapPortable`
//      mints new ids for everything and moves each reference with its target.
{
  const has = typeof F.buildPortable === 'function' && typeof F.parsePortable === 'function' && typeof F.remapPortable === 'function'
  const NAME = 'portable.1 buildPortable builds field by field (no env, session id, transcript or pid can travel), scrubs and COUNTS secrets, drops a kind that cannot travel with a reason naming what would happen, and omits pictures by default saying a picture cannot be scrubbed by machine; parsePortable answers not-portable / unknown-version (naming both numbers) / file with warnings; remapPortable mints new ids and moves a workflow panel\'s templateId and a panel\'s binding with their target'
  if (!has) ok(NAME, false, 'portable.ts does not export buildPortable / parsePortable / remapPortable')
  else {
    const token = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    const panels = [
      { id: 'p1', x: 0, y: 0, w: 100, h: 100, z: 1, cwd: '/w/repo', command: '/bin/sh', args: ['-lc', `echo ${token}`], title: 'a terminal', env: { SECRET: token }, pid: 4242 },
      { id: 'p2', kind: 'chat', x: 0, y: 0, w: 100, h: 100, z: 2, chat: { cwd: '/w/repo', sessionId: 'SESSION-UUID-1234', backend: 'codex', transcript: 'every word we said' } },
      { id: 'p3', kind: 'note', x: 0, y: 0, w: 100, h: 100, z: 3, note: { form: 'sticky', text: `the key is ${token}`, tint: 'blue' } },
      { id: 'p4', kind: 'image', x: 0, y: 0, w: 100, h: 100, z: 4, image: { path: '/w/pic.png', asset: 'a'.repeat(64) } },
      { id: 'p5', kind: 'workflow', x: 0, y: 0, w: 100, h: 100, z: 5, workflow: { templateId: 't1' }, templateBinding: { templateId: 't1', key: 'n1' } },
      { id: 'p6', kind: 'watcher', x: 0, y: 0, w: 100, h: 100, z: 6, watch: { command: 'rm -rf /', trigger: 'timer' } },
      { id: 'p7', kind: 'review', x: 0, y: 0, w: 100, h: 100, z: 7, subject: { root: '/w/repo' } }
    ]
    const templates = [{ id: 't1', name: 'shape', nodes: [{ key: 'n1', kind: 'terminal', cwd: '/w/repo', dx: 0, dy: 0 }], edges: [] }]
    const file = F.buildPortable({ kind: 'canvas', workspaceName: 'work', panels, templates, app: '5.0.0', now: 1000 })
    const text = JSON.stringify(file)
    const withPixels = F.buildPortable({ kind: 'canvas', workspaceName: 'work', panels, templates, app: '5.0.0', now: 1000, images: [{ id: 'a'.repeat(64), mediaType: 'image/png', base64: 'AAAA' }], hasRoutines: true })
    const parsed = F.parsePortable(text)
    const notJson = F.parsePortable('<html>')
    const notOurs = F.parsePortable(JSON.stringify({ hello: 'world' }))
    const future = F.parsePortable(JSON.stringify({ version: 99, kind: 'canvas' }))
    let n = 0
    const remapped = parsed.kind === 'file' ? F.remapPortable(parsed.file, (prefix) => `${prefix}-new-${++n}`) : null
    const wf = remapped && remapped.workspace.panels.find((p) => p.kind === 'workflow')
    ok(NAME,
      // Nothing of this machine travelled.
      !text.includes('SESSION-UUID-1234') && !text.includes('every word we said') && !text.includes('4242') && !/"env"/.test(text) && !text.includes(token) &&
        file.redacted >= 2 &&
        // The shape did: five panels kept, two dropped BY KIND with reasons.
        file.workspace.panels.length === 5 && file.workspace.panels.map((p) => p.id).join(',') === 'p1,p2,p3,p4,p5' &&
        file.omitted.some((o) => /watcher/.test(o.what) && /arm itself/.test(o.why)) &&
        file.omitted.some((o) => /review/.test(o.what) && /repository/.test(o.why)) &&
        file.omitted.some((o) => /pixels of 1 picture/.test(o.what) && /cannot be scrubbed by machine/.test(o.why) && !/redact/.test(o.why)) &&
        file.omitted.some((o) => /credential/.test(o.what)) &&
        file.assets.length === 0 &&
        // With pixels asked for: they travel and the omission is gone; routines are named.
        withPixels.assets.length === 1 && !withPixels.omitted.some((o) => /pixels/.test(o.what)) && withPixels.omitted.some((o) => /routine/.test(o.what)) &&
        // Three parse answers.
        parsed.kind === 'file' && parsed.file.workspace.name === 'work' &&
        notJson.kind === 'not-portable' && /not JSON/.test(notJson.reason) &&
        notOurs.kind === 'not-portable' &&
        future.kind === 'unknown-version' && future.found === 99 && future.known === F.PORTABLE_VERSION && /99/.test(future.reason) &&
        // The remap: every id new, and each reference moved with its target.
        remapped !== null && remapped.workspace.panels.every((p) => p.id.startsWith('p-new-')) &&
        remapped.templates.every((t) => t.id.startsWith('t-new-')) &&
        wf && wf.workflow.templateId === remapped.templates[0].id && wf.templateBinding.templateId === remapped.templates[0].id,
      JSON.stringify({ redacted: file.redacted, kept: file.workspace.panels.map((p) => p.id), omitted: file.omitted, assets: file.assets.length, notJson, notOurs, future, remappedIds: remapped && remapped.workspace.panels.map((p) => p.id), wf }))
  }
}

// M251 — pack.*. A PACK IS A DISCIPLINE'S LIBRARY OBJECTS, READ BEFORE ADDED.
//      The manifest is what a person reads before agreeing, so its parser
//      holds the repo's three arms per key: ABSENT optional keys warn nothing
//      and stay absent (never `key: undefined`); PRESENT-but-malformed values
//      warn by name and are dropped, never coerced; an UNKNOWN content kind
//      costs that entry, never the list. An unknown credential SERVICE is the
//      exception on purpose: it is kept and answered `unknown-service` by
//      packRequirements, because dropping it would hide a requirement — a row
//      that disappears reads as a pack that needs nothing.
{
  const has = typeof F.buildPack === 'function' && typeof F.parsePack === 'function' && typeof F.packRequirements === 'function' && typeof F.remapPack === 'function'
  const need = (name) => { if (!has) ok(name, false, 'pack.ts does not export buildPack / parsePack / packRequirements / remapPack'); return has }
  const token = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const prompt = { id: 'q1', name: 'release note', body: 'Draft release notes for the tag.' }
  const template = { id: 't1', name: 'ship', nodes: [{ key: 'n1', kind: 'terminal', cwd: '/w/repo', dx: 0, dy: 0 }], edges: [] }
  const preset = { id: 'r1', name: 'gh watch', cwd: '/w/repo', command: 'gh', args: ['run', 'watch'] }

  if (need('pack.manifest.1 ABSENT optional manifest keys warn nothing and stay absent through build and parse — no description, credentials or tools key is written as undefined')) {
    const file = F.buildPack({ manifest: { name: 'devrel', version: '1.0.0' }, templates: [], prompts: [prompt], presets: [], app: '5.0.0', now: 1 })
    const parsed = F.parsePack(JSON.stringify(file))
    const m = parsed.kind === 'pack' ? parsed.pack.manifest : {}
    ok('pack.manifest.1 ABSENT optional manifest keys warn nothing and stay absent through build and parse — no description, credentials or tools key is written as undefined',
      parsed.kind === 'pack' && parsed.warnings.length === 0 &&
        !('description' in m) && !('credentials' in m) && !('tools' in m) &&
        !('description' in file.manifest) && !('credentials' in file.manifest) && !('tools' in file.manifest) &&
        m.name === 'devrel' && m.version === '1.0.0' && m.contents.length === 1 && m.contents[0].kind === 'prompt',
      JSON.stringify({ parsed }))
  }

  if (need('pack.manifest.2 PRESENT-but-malformed values warn BY NAME and are dropped, never coerced')) {
    const base = (manifest, extra = {}) => JSON.stringify({ version: 1, kind: 'pack', createdAt: 1, app: 'x', manifest, templates: [], prompts: [prompt], presets: [], omitted: [], redacted: 0, ...extra })
    const numVersion = F.parsePack(base({ name: 'devrel', version: 3, contents: [] }))
    const noName = F.parsePack(base({ version: '1.0.0', contents: [] }))
    const bad = F.parsePack(base({
      name: 'devrel', version: '1.0.0', description: 5, contents: {},
      credentials: [{ service: 'github', fields: [{ id: 'token' }, { id: 'pat', label: 'personal access token' }] }, 'github'],
      tools: [{ command: 'rm -rf /' }, { command: 'gh', why: 7 }, { command: 'pandoc', why: 'renders the notes' }]
    }))
    const m = bad.kind === 'pack' ? bad.pack.manifest : {}
    const w = bad.kind === 'pack' ? bad.warnings.join(' | ') : ''
    ok('pack.manifest.2 PRESENT-but-malformed values warn BY NAME and are dropped, never coerced: a numeric version is not-a-pack naming version (3 is never "3.0.0"), a missing name is not-a-pack naming name, a non-string description / non-list contents / label-less field / non-object credential / unsafe tool command / non-string why each cost only themselves',
      numVersion.kind === 'not-a-pack' && /version/.test(numVersion.reason) &&
        noName.kind === 'not-a-pack' && /name/.test(noName.reason) &&
        bad.kind === 'pack' && !('description' in m) && /description/.test(w) &&
        /contents/.test(w) &&
        m.credentials.length === 1 && m.credentials[0].fields.length === 1 && m.credentials[0].fields[0].id === 'pat' && /label/.test(w) &&
        /credential/.test(w) &&
        m.tools.map((t) => t.command).join(',') === 'gh,pandoc' && /rm -rf/.test(w) &&
        !('why' in m.tools[0]) && m.tools[1].why === 'renders the notes' && /why/.test(w),
      JSON.stringify({ numVersion, noName, bad }))
  }

  if (need('pack.manifest.3 an UNKNOWN content kind costs that entry by name; an unknown manifest key is named and ignored; a canvas file and a future version are refused by name; an unknown credential service is KEPT')) {
    const text = JSON.stringify({ version: 1, kind: 'pack', createdAt: 1, app: 'x', templates: [], presets: [], omitted: [], redacted: 0, prompts: [prompt],
      manifest: { name: 'devrel', version: '1.0.0', colour: 'teal', contents: [{ kind: 'routine', id: 'x1', name: 'nightly' }, { kind: 'prompt', id: 'q1', name: 'release note' }],
        credentials: [{ service: 'twitter', fields: [{ id: 'key', label: 'API key' }] }] } })
    const parsed = F.parsePack(text)
    const canvas = F.parsePack(JSON.stringify({ version: 1, kind: 'canvas', workspace: { name: 'w', panels: [] } }))
    const future = F.parsePack(JSON.stringify({ version: 99, kind: 'pack' }))
    const notJson = F.parsePack('<html>')
    const w = parsed.kind === 'pack' ? parsed.warnings.join(' | ') : ''
    ok('pack.manifest.3 an UNKNOWN content kind costs that entry by name; an unknown manifest key is named and ignored; a canvas file and a future version are refused by name; an unknown credential service is KEPT',
      parsed.kind === 'pack' && parsed.pack.manifest.contents.map((c) => c.id).join(',') === 'q1' && /routine/.test(w) &&
        /colour/.test(w) && !('colour' in parsed.pack.manifest) &&
        parsed.pack.manifest.credentials.length === 1 && parsed.pack.manifest.credentials[0].service === 'twitter' &&
        canvas.kind === 'not-a-pack' && /canvas/.test(canvas.reason) && /Import canvas/.test(canvas.reason) &&
        future.kind === 'unknown-version' && future.found === 99 && future.known === F.PACK_VERSION &&
        notJson.kind === 'not-a-pack' && /not JSON/.test(notJson.reason),
      JSON.stringify({ parsed, canvas, future, notJson }))
  }

  if (need('pack.manifest.4 the contents list is reconciled against the payload: a listed item with nothing behind it and a payload item the list does not name are both named, and the unlisted item is NOT added')) {
    const text = JSON.stringify({ version: 1, kind: 'pack', createdAt: 1, app: 'x', omitted: [], redacted: 0,
      manifest: { name: 'devrel', version: '1.0.0', contents: [{ kind: 'prompt', id: 'q1', name: 'release note' }, { kind: 'workflow', id: 'ghost', name: 'phantom' }] },
      prompts: [prompt], templates: [template], presets: [] })
    const parsed = F.parsePack(text)
    const w = parsed.kind === 'pack' ? parsed.warnings.join(' | ') : ''
    ok('pack.manifest.4 the contents list is reconciled against the payload: a listed item with nothing behind it and a payload item the list does not name are both named, and the unlisted item is NOT added',
      parsed.kind === 'pack' && /phantom/.test(w) && /ship/.test(w) &&
        parsed.pack.templates.length === 0 && parsed.pack.prompts.length === 1 &&
        parsed.pack.manifest.contents.map((c) => c.id).join(',') === 'q1',
      JSON.stringify({ parsed }))
  }

  if (need('pack.build.1 buildPack scrubs and COUNTS secrets in every payload, derives contents from the payload, names what never travels, and has no key a credential VALUE could occupy')) {
    const file = F.buildPack({
      manifest: { name: 'devrel', version: '1.0.0', description: 'release work', credentials: [{ service: 'github', fields: [{ id: 'token', label: 'personal access token', value: token }], token }], tools: [{ command: 'gh', why: 'opens releases' }] },
      templates: [{ ...template, nodes: [{ ...template.nodes[0], command: `echo ${token}` }] }],
      prompts: [{ ...prompt, body: `use ${token}` }],
      presets: [{ ...preset, args: ['auth', token], env: { GH_TOKEN: token } }],
      app: '5.0.0', now: 1, hasRoutines: true
    })
    const text = JSON.stringify(file)
    const cred = file.manifest.credentials[0]
    ok('pack.build.1 buildPack scrubs and COUNTS secrets in every payload, derives contents from the payload, names what never travels, and has no key a credential VALUE could occupy',
      !text.includes(token) && file.redacted >= 3 && file.kind === 'pack' && file.version === F.PACK_VERSION &&
        Object.keys(cred).sort().join(',') === 'fields,service' && Object.keys(cred.fields[0]).sort().join(',') === 'id,label' &&
        !('env' in file.presets[0]) &&
        file.manifest.contents.map((c) => `${c.kind}:${c.id}`).sort().join(',') === 'preset:r1,prompt:q1,workflow:t1' &&
        file.omitted.some((o) => /routine/.test(o.what)) && file.omitted.some((o) => /skill/.test(o.what)) && file.omitted.some((o) => /credential/.test(o.what)),
      JSON.stringify({ redacted: file.redacted, cred, contents: file.manifest.contents, omitted: file.omitted, preset: file.presets[0] }))
  }

  if (need('pack.requires.1 a missing credential is named PER FIELD; connected, rejected, not-connected and unknown-service are distinct rows; a tool is found, missing or unanswered')) {
    const manifest = { name: 'devrel', version: '1.0.0', contents: [],
      credentials: [
        { service: 'github', fields: [{ id: 'token', label: 'personal access token' }] },
        { service: 'jira', fields: [{ id: 'site', label: 'site URL' }, { id: 'email', label: 'Atlassian email' }, { id: 'token', label: 'API token' }] },
        { service: 'twitter', fields: [{ id: 'key', label: 'API key' }] }
      ],
      tools: [{ command: 'gh' }, { command: 'pandoc' }, { command: 'ffmpeg' }] }
    const none = F.packRequirements(manifest, [{ service: 'jira', label: 'me@x', addedAt: 'a', rejectedAt: 'b' }], { gh: true, pandoc: false })
    const connected = F.packRequirements(manifest, [{ service: 'github', label: 'ada', addedAt: 'a' }], {})
    const gh = none.credentials.find((r) => r.service === 'github')
    const jira = none.credentials.filter((r) => r.service === 'jira')
    const tw = none.credentials.find((r) => r.service === 'twitter')
    const tool = (c) => none.tools.find((t) => t.command === c)
    ok('pack.requires.1 a missing credential is named PER FIELD; connected, rejected, not-connected and unknown-service are distinct rows; a tool is found, missing or unanswered',
      none.credentials.length === 5 &&
        gh.state === 'not-connected' && /GitHub · personal access token/.test(gh.sentence) && /not connected/.test(gh.sentence) && /Credentials/.test(gh.sentence) &&
        jira.length === 3 && jira.every((r) => r.state === 'rejected') &&
        ['site URL', 'Atlassian email', 'API token'].every((label, i) => jira[i].sentence.includes(`Jira · ${label}`)) &&
        tw.state === 'unknown-service' && /twitter/.test(tw.sentence) && /API key/.test(tw.sentence) &&
        connected.credentials.find((r) => r.service === 'github').state === 'connected' && connected.credentials.find((r) => r.service === 'github').sentence === undefined &&
        tool('gh').state === 'found' && tool('pandoc').state === 'missing' && /pandoc/.test(tool('pandoc').sentence) &&
        tool('ffmpeg').state === 'unanswered',
      JSON.stringify({ none, connected }))
  }

  if (need('pack.remap.1 remapPack mints fresh ids for every object and marks every workflow AND preset reviewed: false; a prompt is inert text and carries no mark')) {
    const file = F.buildPack({ manifest: { name: 'devrel', version: '1.0.0' }, templates: [template], prompts: [prompt], presets: [preset], app: '5.0.0', now: 1 })
    let n = 0
    const out = F.remapPack(file, (prefix) => `${prefix}-new-${++n}`)
    ok('pack.remap.1 remapPack mints fresh ids for every object and marks every workflow AND preset reviewed: false; a prompt is inert text and carries no mark',
      out.templates[0].id.startsWith('t-new-') && out.prompts[0].id.startsWith('q-new-') && out.presets[0].id.startsWith('r-new-') &&
        out.templates[0].reviewed === false && out.presets[0].reviewed === false && !('reviewed' in out.prompts[0]),
      JSON.stringify(out))
  }
}

// M190 — feedback.1. THE DRAFT THIS APP NEVER SENDS. What travels is chosen
//      by TYPE — a version, a platform, engine WORDS and panel COUNTS — so
//      there is nowhere in the shape for a path, a command, a transcript or a
//      token, the same structural refusal the diagnostics bundle makes. What
//      the person typed is scrubbed and the count is IN the draft's own
//      sentence, so they can see what was taken out before they send
//      anything. A body too long for a link is cut WITH a line saying so.
{
  const has = typeof F.buildFeedback === 'function'
  const NAME = 'feedback.1 buildFeedback scrubs a planted token out of what the person typed and counts it, states that nothing has been sent, carries only the version, platform, engine words and panel counts (no path, command or transcript can reach it), points at the repository\'s issues/new, and cuts an over-long body WITH a line saying so'
  if (!has) ok(NAME, false, 'feedback.ts does not export buildFeedback')
  else {
    const token = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    const facts = {
      version: '5.0.0', platform: 'darwin arm64',
      engines: [{ name: 'claude', state: 'installed' }, { name: 'codex', state: 'missing' }],
      kinds: [{ kind: 'terminal', count: 2 }, { kind: 'note', count: 1 }, { kind: 'image', count: 0 }],
      says: `it broke when I ran the thing, my token is ${token}`
    }
    const draft = F.buildFeedback('acme/canvas', facts)
    const empty = F.buildFeedback('acme/canvas', { ...facts, says: '' })
    const huge = F.buildFeedback('acme/canvas', { ...facts, says: 'x'.repeat(20000) })
    ok(NAME,
      !draft.body.includes(token) && !draft.url.includes(token) && draft.redacted >= 1 &&
        /Nothing has been sent/.test(draft.body) &&
        draft.body.includes('5.0.0') && draft.body.includes('darwin arm64') &&
        draft.body.includes('claude: installed') && draft.body.includes('codex: missing') &&
        draft.body.includes('2 terminal') && draft.body.includes('1 note') && !draft.body.includes('0 image') &&
        draft.url.startsWith('https://github.com/acme/canvas/issues/new?title=') && draft.url.includes('&body=') &&
        draft.truncated === false && /^Feedback: it broke/.test(draft.title) &&
        empty.title === 'Feedback' && /Say what happened/.test(empty.body) &&
        huge.truncated === true && huge.url.length <= F.FEEDBACK_URL_MAX && /cut to fit in a link/.test(huge.body),
      JSON.stringify({ redacted: draft.redacted, truncated: draft.truncated, title: draft.title, urlHead: draft.url.slice(0, 60), urlLen: draft.url.length, hugeLen: huge.url.length, bodyHead: draft.body.slice(0, 120) }))
  }
}

const failed = results.filter((r) => !r.pass)
  console.log(`${results.length - failed.length}/${results.length} passed`)
  rmSync(DIR, { recursive: true, force: true })
  process.exit(failed.length === 0 ? 0 : 1)
})()
