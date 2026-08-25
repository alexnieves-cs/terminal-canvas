/* Unit-verifies the real PtyManager class under Electron's exact ABI.
   Run with: npm run verify:pty-manager

   Unlike verify-pty.cjs, which exercises node-pty directly, this bundles
   src/main/pty-manager.ts and drives the actual shipped class. Session
   lifecycle is where the subtle bugs live: an OS process exits milliseconds
   after we asked it to, and by then the panel may have been recreated. */
const { buildSync } = require('esbuild')
const { join } = require('node:path')
const os = require('node:os')
const { execFileSync } = require('node:child_process')
const { mkdtempSync, writeFileSync, existsSync, mkdirSync } = require('node:fs')
const { tmpdir } = require('node:os')

/** Absolute path or null. A GUI app has a bare PATH, so never rely on the name. */
function findTmux() {
  for (const p of ['/opt/homebrew/bin/tmux', '/usr/local/bin/tmux', '/usr/bin/tmux']) {
    if (existsSync(p)) return p
  }
  return null
}

const OUT = join(__dirname, '..', 'out', 'verify', 'pty-manager.cjs')
buildSync({
  entryPoints: [join(__dirname, '..', 'src', 'main', 'pty-manager.ts')],
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  // node-pty is a native module; electron is only a type import here.
  external: ['node-pty', 'electron']
})
const { PtyManager } = require(OUT)

/* This suite's own tmux socket, never the production one.
   Check 15 calls shutdown(), which is `tmux kill-server`. Run against
   TMUX_SOCKET — as this suite did until a whole-branch review — and
   `npm run verify` with the app open destroys every agent the user has
   running. The socket is a defaulted parameter on every argv builder in
   tmux-args.ts precisely so this can differ here without weakening the
   production default; verify-tmux.cjs check 9 still pins that default. */
const VERIFY_SOCKET = 'terminal-canvas-verify'

const OUT_BACKEND = join(__dirname, '..', 'out', 'verify', 'session-backend.cjs')
buildSync({
  entryPoints: [join(__dirname, '..', 'src', 'main', 'session-backend.ts')],
  outfile: OUT_BACKEND,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['node-pty', 'electron']
})
const { createDirectBackend, createTmuxBackend } = require(OUT_BACKEND)
const DIRECT = createDirectBackend('verify: direct by default')

const OUT_TMUX_ARGS = join(__dirname, '..', 'out', 'verify', 'tmux-args.cjs')
buildSync({
  entryPoints: [join(__dirname, '..', 'src', 'main', 'tmux-args.ts')],
  outfile: OUT_TMUX_ARGS,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['node-pty', 'electron']
})

const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Stands in for the real WebContents seam and records what main sent. */
function makeHarness(backend) {
  const events = []
  const manager = new PtyManager(
    () => ({ isDestroyed: () => false, send: (channel, payload) => events.push({ channel, payload }) }),
    () => backend ?? DIRECT
  )
  return { manager, events, exits: () => events.filter((e) => e.channel === 'pty:exit') }
}

const spec = (panelId, command = '/bin/sh', args = ['-c', 'sleep 30']) => ({
  panelId,
  cwd: os.homedir(),
  command,
  args,
  cols: 80,
  rows: 24
})

;(async () => {
  // 1. THE RACE: kill() deletes synchronously, but the OS process's onExit
  // lands milliseconds later. If the panel was recreated in that window, the
  // dead process's exit callback must not evict the live session.
  {
    const { manager } = makeHarness()
    await manager.create(spec('panel-a'))
    manager.kill('panel-a')
    const recreated = await manager.create(spec('panel-a'))
    await sleep(500) // let the first process's onExit land
    const live = manager.list()
    ok(
      '1 stale onExit does not evict a recreated session',
      live.length === 1 && live[0].panelId === 'panel-a' && live[0].pid === recreated.pid,
      `live=${JSON.stringify(live.map((s) => s.pid))} expected=[${recreated.pid}]`
    )
    manager.killAll()
  }

  // 2. A session evicted by a stale exit is unreachable: write/resize are
  // optional-chained no-ops, so the PTY is orphaned in silence.
  {
    const { manager } = makeHarness()
    await manager.create(spec('panel-b'))
    manager.kill('panel-b')
    await manager.create(spec('panel-b', '/bin/sh', ['-c', 'cat']))
    await sleep(500)
    const reachable = manager.write('panel-b', 'ping\n')
    ok('2 recreated session is still reachable by write', reachable === true, `write returned ${reachable}`)
    manager.killAll()
  }

  // 3. An intentional kill is not a process exit the panel should paint
  // "[process exited]" for. Only unrequested exits get reported.
  {
    const { manager, exits } = makeHarness()
    await manager.create(spec('panel-c'))
    manager.kill('panel-c')
    await sleep(500)
    ok('3 kill() emits no spurious pty:exit', exits().length === 0, `${exits().length} exit event(s)`)
  }

  // 4. Regression guard: a real, unrequested exit must still be reported
  // exactly once, and must still remove the session.
  {
    const { manager, exits } = makeHarness()
    await manager.create(spec('panel-d', '/bin/sh', ['-c', 'exit 7']))
    await sleep(600)
    const e = exits()
    ok(
      '4 unrequested exit reported exactly once with its code',
      e.length === 1 && e[0].payload.panelId === 'panel-d' && e[0].payload.exitCode === 7,
      JSON.stringify(e.map((x) => x.payload))
    )
    ok('4b exited session is removed from the map', manager.list().length === 0, `${manager.list().length} left`)
  }

  // 5. Regression guard: the last lines of output must be flushed before the
  // exit event, otherwise the error explaining the exit is dropped.
  {
    const { manager, events } = makeHarness()
    await manager.create(spec('panel-e', '/bin/sh', ['-c', 'echo LAST-LINE-42; exit 1']))
    await sleep(600)
    const dataIdx = events.findIndex((e) => e.channel === 'pty:data' && e.payload.data.includes('LAST-LINE-42'))
    const exitIdx = events.findIndex((e) => e.channel === 'pty:exit')
    ok('5 final output flushes before exit is announced', dataIdx !== -1 && exitIdx !== -1 && dataIdx < exitIdx,
      `data@${dataIdx} exit@${exitIdx}`)
  }

  // 6. Reload recovery: after killAll() the ids are free, so a fresh renderer
  // can create the same panelId instead of hitting "already has a live PTY".
  {
    const { manager } = makeHarness()
    await manager.create(spec('panel-f'))
    await manager.create(spec('panel-g'))
    manager.killAll()
    ok('6a killAll empties the session map', manager.list().length === 0, `${manager.list().length} left`)
    let recreateError = null
    try {
      await manager.create(spec('panel-f'))
    } catch (error) {
      recreateError = error
    }
    ok('6b same panelId can be recreated after killAll', recreateError === null, String(recreateError ?? 'no error'))
    manager.killAll()
  }

  // 9. DirectBackend must report null for both "what do you independently
  // know" questions. Those two nulls are what make it a RESTORATION of
  // pre-M4c behaviour rather than a second implementation of it: PtyManager
  // falls back to its own map and to node-pty's own exit code.
  {
    const b = createDirectBackend('test')
    ok('9 the direct backend knows nothing independently of the manager',
      b.list() === null && b.exitCodeFor('anything') === null && b.kind === 'direct',
      `list=${b.list()} exit=${b.exitCodeFor('anything')} kind=${b.kind}`)
  }

  // 10. With a backend that knows nothing, list() must still return the
  // manager's own live sessions — i.e. exactly what M3 did.
  {
    const h = makeHarness(DIRECT)
    await h.manager.create(spec('d1'))
    const listed = h.manager.list().map((r) => r.panelId)
    ok('10 list falls back to the manager map when the backend has no view',
      listed.length === 1 && listed[0] === 'd1', JSON.stringify(listed))
    h.manager.kill('d1')
  }

  // 11-15 need a real tmux. Skipping is reported, never silent: a suite that
  // quietly covers nothing is worse than one that says it covered nothing.
  const TMUX = findTmux()
  if (!TMUX) {
    ok('11-15 tmux backend (SKIPPED — no tmux binary found)', true, 'install tmux to cover these')
  } else {
    // The space is deliberate and load-bearing. Production's exitDir is
    // ~/Library/Application Support/terminal-canvas/tmux-exits, so a spaced
    // path is the only shape that ever ships — and the pane-died hook's
    // redirect target was unquoted for the whole milestone because every
    // fixture (this one included, as 'tc-verify-' under /var/folders) was
    // space-free. Check 14 below is what actually catches it: with an
    // unquoted redirect no exit file is written, exitCodeFor returns null,
    // and the client's own code 1 is reported instead of 7.
    const dir = mkdtempSync(join(tmpdir(), 'tc verify '))
    const exitDir = join(dir, 'exit codes')
    mkdirSync(exitDir, { recursive: true })
    const confPath = join(dir, 'tmux.conf')
    const T = require(OUT_TMUX_ARGS)
    writeFileSync(confPath, T.buildTmuxConf(exitDir, VERIFY_SOCKET))
    const tmuxBackend = createTmuxBackend({ tmuxPath: TMUX, exitDir, confPath, reason: 'verify', socket: VERIFY_SOCKET })
    const tmuxCli = (args) => {
      try { return execFileSync(TMUX, args, { encoding: 'utf8' }) } catch { return '' }
    }

    // h1 is deliberately hoisted out of check 11's block: check 12 must detach
    // THE MANAGER THAT OWNS THE SESSION. Calling detachAll() on a freshly made
    // harness would walk an empty map, do nothing, and pass for the wrong
    // reason — the session would survive because nothing ever touched it.
    let h1 = null

    // 11. A session created through the backend is visible to tmux itself on
    // the socket we asked for — and therefore invisible on both the user's
    // default socket and the app's production one.
    {
      h1 = makeHarness(tmuxBackend)
      await h1.manager.create(spec('t1'))
      await sleep(700)
      const listed = tmuxCli(['-L', VERIFY_SOCKET, 'list-sessions', '-F', '#{session_name}'])
      ok('11 a panel becomes a tmux session on the private socket',
        listed.includes('t1'), JSON.stringify(listed.trim()))
    }

    // 12. THE MILESTONE. Detach the client the way a renderer teardown does;
    // the session must survive, and a fresh create with the same panelId must
    // reattach rather than start a second process.
    //
    // Two assertions, catching two different bugs:
    //   - PID equality rules out a silent RESPAWN: a respawned command runs
    //     in a brand-new pane with a brand-new pid, so a fresh pid here would
    //     expose a naive re-implementation that just started a second process.
    //   - The client-count sequence (1 -> 0 -> 1) rules out detachAll() being
    //     a no-op. tmux allows MULTIPLE clients on one session at once, and
    //     attaching a second client never changes the pane's pid — so PID
    //     equality alone holds whether or not h1 ever actually detached. If a
    //     future edit dropped `session.proc.kill()` from detachAll(), h1's
    //     client would linger attached, h2's create would just add a SECOND
    //     client, and the pid-only version of this check would still print
    //     green while reload survival was silently broken. The 0 in the
    //     middle is the only thing that proves the local client actually
    //     died rather than lingering.
    //
    // h2 is a SEPARATE harness from h1 (an empty session map of its own) so a
    // successful reattach can only be explained by tmux itself, not by h1
    // still holding the panelId in its map.
    {
      const clientCount = () => {
        const out = tmuxCli(['-L', VERIFY_SOCKET, 'list-clients', '-t', 't1', '-F', '#{client_pid}'])
        return out.split('\n').filter((l) => l.trim()).length
      }
      const before = tmuxCli(['-L', VERIFY_SOCKET, 'list-panes', '-a', '-F', '#{session_name} #{pane_pid}'])
      const beforePid = (/t1 (\d+)/.exec(before) ?? [])[1]
      const clientsBefore = clientCount()
      h1.manager.detachAll()
      await sleep(500)
      const survived = tmuxCli(['-L', VERIFY_SOCKET, 'list-sessions', '-F', '#{session_name}'])
      const clientsAfterDetach = clientCount()
      const h2 = makeHarness(tmuxBackend)
      await h2.manager.create(spec('t1'))
      await sleep(700)
      const after = tmuxCli(['-L', VERIFY_SOCKET, 'list-panes', '-a', '-F', '#{session_name} #{pane_pid}'])
      const afterPid = (/t1 (\d+)/.exec(after) ?? [])[1]
      const clientsAfterReattach = clientCount()
      ok('12 detaching leaves the session alive, drops its client to zero, and create reattaches the SAME process',
        survived.includes('t1') && beforePid && beforePid === afterPid &&
          clientsBefore === 1 && clientsAfterDetach === 0 && clientsAfterReattach === 1,
        `pid ${beforePid} -> ${afterPid}, clients ${clientsBefore} -> ${clientsAfterDetach} -> ${clientsAfterReattach}`)
    }

    // 13. list() reports sessions the manager's own map has never heard of.
    // This is what makes boot reconciliation possible after a reload.
    {
      const fresh = makeHarness(tmuxBackend)
      const listed = fresh.manager.list().map((r) => r.panelId)
      ok('13 a manager with an empty map still sees the live tmux session',
        listed.includes('t1'), JSON.stringify(listed))
    }

    // 14. EXIT FIDELITY. The tmux client's own exit code is always 1, so a
    // naive port would report every exit as code 1. The pane-died hook's file
    // is what carries the truth.
    {
      const h = makeHarness(tmuxBackend)
      await h.manager.create(spec('t2', '/bin/sh', ['-c', 'exit 7']))
      await sleep(1500)
      const exits = h.exits()
      const code = exits.length ? exits[exits.length - 1].payload.exitCode : null
      ok('14 a command exiting 7 is reported as 7, not the client\'s 1',
        code === 7, `reported=${code} events=${exits.length}`)
    }

    // 14b. Number('') is 0, not NaN. A file that exists but is empty (a
    // truncated write; the hook's echo ran but the redirect had not yet
    // flushed) must fall back to null — never a fabricated 0, which via
    // `real ?? exitCode` would report a crashed process as a CLEAN exit, the
    // exact failure exitCodeFor exists to prevent. Written by hand rather
    // than through a real hook race, since the race itself is not
    // reproducible on demand.
    {
      writeFileSync(T.exitFilePath(exitDir, 'empty-exit-panel'), '')
      const code = tmuxBackend.exitCodeFor('empty-exit-panel')
      ok('14b an empty exit file yields null, never a fabricated 0',
        code === null, `exitCodeFor returned ${code}`)
    }

    // 14c. kill() must reach backend.destroy() even for a panelId this manager
    // has NO local session for. Under node-pty "no session" meant "no process"
    // and the early return was free; under tmux a panel can be reattachable —
    // its session survived a reload — while this manager never spawned a
    // client for it, because the panel was off-screen or held back by
    // LIVE_BUDGET and never went live. Closing it then left an agent running
    // with nothing able to reach, close, or type into it for the rest of the
    // run. Built here by starting a session through one manager and killing it
    // through a SECOND, empty one, which is exactly the post-reload shape.
    {
      const owner = makeHarness(tmuxBackend)
      await owner.manager.create(spec('t4'))
      await sleep(700)
      owner.manager.detachAll()
      await sleep(400)
      const stranger = makeHarness(tmuxBackend)
      const beforeKill = tmuxCli(['-L', VERIFY_SOCKET, 'list-sessions', '-F', '#{session_name}'])
      stranger.manager.kill('t4')
      await sleep(500)
      const afterKill = tmuxCli(['-L', VERIFY_SOCKET, 'list-sessions', '-F', '#{session_name}'])
      ok('14c killing a panel with no local session still ends its surviving tmux session',
        beforeKill.includes('t4') && !afterKill.includes('t4'),
        `before=${JSON.stringify(beforeKill.trim())} after=${JSON.stringify(afterKill.trim())}`)
    }

    // 14d. TARGET PREFIX MATCHING, the defect 14c made reachable. tmux
    // resolves a -t target that is not an exact session name by unique
    // PREFIX: with only `n10` alive, `kill-session -t n1` kills n10 and exits
    // 0 (reproduced on tmux 3.7c). Panel ids are n1..n12, so closing a
    // dormant, never-spawned n1 — which 14c above deliberately routes into
    // backend.destroy() even with no local session — silently destroyed the
    // agent running in n10. 14c's own t4/t1 pair cannot collide, so it can
    // never catch this; a DELIBERATELY colliding pair is the whole point of
    // this check. The `=` in buildKillSessionArgs is what makes it pass, and
    // a string assertion on that `=` (verify:tmux 19) is not a substitute for
    // watching n10 survive a real kill.
    {
      const owner = makeHarness(tmuxBackend)
      await owner.manager.create(spec('n10'))
      await sleep(700)
      const before = tmuxCli(['-L', VERIFY_SOCKET, 'list-sessions', '-F', '#{session_name}'])
      // A manager that has never heard of n1, exactly like the post-reload
      // shape 14c builds — kill() therefore goes straight to destroy(), and
      // there is no n1 session on the socket for it to find.
      const stranger = makeHarness(tmuxBackend)
      stranger.manager.kill('n1')
      await sleep(500)
      const after = tmuxCli(['-L', VERIFY_SOCKET, 'list-sessions', '-F', '#{session_name}'])
      ok('14d killing n1 while only n10 exists leaves n10 alive',
        before.includes('n10') && after.includes('n10'),
        `before=${JSON.stringify(before.trim())} after=${JSON.stringify(after.trim())}`)
      owner.manager.kill('n10')
      await sleep(300)
    }

    // 15. destroy() ends the session, and shutdown() takes the server with it.
    {
      const h = makeHarness(tmuxBackend)
      await h.manager.create(spec('t3'))
      await sleep(700)
      h.manager.kill('t3')
      await sleep(500)
      const afterKill = tmuxCli(['-L', VERIFY_SOCKET, 'list-sessions', '-F', '#{session_name}'])
      tmuxBackend.shutdown()
      await sleep(500)
      const afterShutdown = tmuxCli(['-L', VERIFY_SOCKET, 'list-sessions', '-F', '#{session_name}'])
      ok('15 closing a panel ends its session and shutdown ends the server',
        !afterKill.includes('t3') && afterShutdown.trim() === '',
        `afterKill=${JSON.stringify(afterKill.trim())} afterShutdown=${JSON.stringify(afterShutdown.trim())}`)
    }
  }

  console.log('\n' + '='.repeat(60))
  const failed = results.filter((r) => !r.pass)
  console.log(`${results.length - failed.length}/${results.length} passed`)
  if (failed.length) {
    console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
    process.exit(1)
  }
  process.exit(0)
})()
