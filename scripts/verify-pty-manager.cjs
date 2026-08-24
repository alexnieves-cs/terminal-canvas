/* Unit-verifies the real PtyManager class under Electron's exact ABI.
   Run with: npm run verify:pty-manager

   Unlike verify-pty.cjs, which exercises node-pty directly, this bundles
   src/main/pty-manager.ts and drives the actual shipped class. Session
   lifecycle is where the subtle bugs live: an OS process exits milliseconds
   after we asked it to, and by then the panel may have been recreated. */
const { buildSync } = require('esbuild')
const { join } = require('node:path')
const os = require('node:os')

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

const OUT_BACKEND = join(__dirname, '..', 'out', 'verify', 'session-backend.cjs')
buildSync({
  entryPoints: [join(__dirname, '..', 'src', 'main', 'session-backend.ts')],
  outfile: OUT_BACKEND,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['node-pty', 'electron']
})
const { createDirectBackend } = require(OUT_BACKEND)
const DIRECT = createDirectBackend('verify: direct by default')

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

  console.log('\n' + '='.repeat(60))
  const failed = results.filter((r) => !r.pass)
  console.log(`${results.length - failed.length}/${results.length} passed`)
  if (failed.length) {
    console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
    process.exit(1)
  }
  process.exit(0)
})()
