/* Verifies panel session lifetime.
   Run with: npm run verify:registry

   Plain node: the registry never touches window or document, so its logic is
   testable with fakes. The check that matters most is 5 — demotion must not
   kill a PTY. That failure is silent in a running app: the panel comes back
   on screen looking like a fresh terminal and the agent's work is gone. */
const { buildSync } = require('esbuild')
const { join } = require('node:path')
const { mkdirSync } = require('node:fs')

const OUT = join(__dirname, '..', 'out', 'verify', 'registry.cjs')
mkdirSync(join(__dirname, '..', 'out', 'verify'), { recursive: true })
buildSync({
  entryPoints: [join(__dirname, 'registry-entry.cjs')],
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs'
})
const { createRegistry } = require(OUT)

const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`)
}

/** Records every bridge call so assertions can be made about what was NOT called. */
function fakeBridge() {
  const calls = { create: [], write: [], resize: [], kill: [], dataListeners: 0 }
  let onData = null
  let onExit = null
  return {
    calls,
    emitData: (chunk) => onData && onData(chunk),
    emitExit: (info) => onExit && onExit(info),
    pty: {
      async create(spec) {
        calls.create.push(spec)
        return { panelId: spec.panelId, pid: 4000 + calls.create.length, command: spec.command, cwd: spec.cwd }
      },
      async write(req) { calls.write.push(req) },
      async resize(req) { calls.resize.push(req) },
      async kill(id) { calls.kill.push(id) },
      onData(listener) { calls.dataListeners++; onData = listener; return () => { onData = null } },
      onExit(listener) { onExit = listener; return () => { onExit = null } }
    }
  }
}

function fakeFactory() {
  const made = new Map()
  return {
    made,
    create(id) {
      const state = {
        id, attached: false, disposed: false, written: [], cols: 80, rows: 24,
        focused: false, inputListener: null
      }
      made.set(id, state)
      return {
        host: { id },
        attach() { state.attached = true },
        detach() { state.attached = false },
        write(data) { state.written.push(data) },
        size() { return { cols: state.cols, rows: state.rows } },
        tail() { return state.written.slice(-3) },
        focus() { state.focused = true },
        onInput(listener) { state.inputListener = listener },
        dispose() { state.disposed = true }
      }
    }
  }
}

const SPEC = { panelId: 'p1', cwd: '/tmp', command: 'zsh', args: [] }
const setup = () => {
  const bridge = fakeBridge()
  const factory = fakeFactory()
  let clock = 1000
  const registry = createRegistry({ bridge, factory, now: () => (clock += 10) })
  return { bridge, factory, registry }
}
const tick = () => new Promise((r) => setImmediate(r))

;(async () => {
  // 1. One data subscription for the whole canvas, not one per panel.
  {
    const { bridge, registry } = setup()
    registry.ensure('p1', SPEC)
    registry.ensure('p2', { ...SPEC, panelId: 'p2' })
    registry.ensure('p3', { ...SPEC, panelId: 'p3' })
    ok(1, bridge.calls.dataListeners === 1, `listeners=${bridge.calls.dataListeners}`)
  }

  // 2. Creating a session does NOT spawn a PTY. Spawning happens on first
  //    live-ification, when a fitted terminal can supply real cols/rows.
  {
    const { bridge, registry } = setup()
    registry.ensure('p1', SPEC)
    await tick()
    ok(2, bridge.calls.create.length === 0, `create calls=${bridge.calls.create.length}`)
  }

  // 3. Going live attaches, then spawns with the fitted size — read from each
  //    session's own terminal, never invented. Both fakes are set to sizes
  //    that are distinct from each other AND from the common 80x24 default,
  //    so a spawn() that hardcoded a default (or shared one session's size
  //    across both) could not pass this by accident.
  {
    const { bridge, factory, registry } = setup()
    registry.ensure('p1', SPEC)
    registry.ensure('p2', { ...SPEC, panelId: 'p2' })
    Object.assign(factory.made.get('p1'), { cols: 137, rows: 41 })
    Object.assign(factory.made.get('p2'), { cols: 62, rows: 19 })
    registry.applyTiers({ p1: 'live', p2: 'live' })
    registry.attachSlot('p1') // the view calls this once the host is mounted
    registry.attachSlot('p2')
    await tick()
    const spawnedP1 = bridge.calls.create.find((c) => c.panelId === 'p1')
    const spawnedP2 = bridge.calls.create.find((c) => c.panelId === 'p2')
    ok(3, factory.made.get('p1').attached && spawnedP1 && spawnedP1.cols === 137 && spawnedP1.rows === 41,
      JSON.stringify(spawnedP1))
    ok('3b', spawnedP2 && spawnedP2.cols === 62 && spawnedP2.rows === 19,
      JSON.stringify(spawnedP2))

    // The keystroke path: onInput must be wired so typing reaches the PTY
    // with the right panel id and bytes. A registry that never wired
    // onInput would still show a live, spawned, correctly-sized panel that
    // silently accepts no input.
    factory.made.get('p1').inputListener('x')
    ok('3c', bridge.calls.write.some((w) => w.panelId === 'p1' && w.data === 'x'),
      JSON.stringify(bridge.calls.write))
  }

  // 4. Chunks route to the right session and nowhere else.
  {
    const { bridge, factory, registry } = setup()
    registry.ensure('p1', SPEC)
    registry.ensure('p2', { ...SPEC, panelId: 'p2' })
    registry.applyTiers({ p1: 'live', p2: 'live' })
    registry.attachSlot('p1')
    registry.attachSlot('p2')
    await tick()
    bridge.emitData({ panelId: 'p1', data: 'hello' })
    ok(4, factory.made.get('p1').written.includes('hello') &&
          !factory.made.get('p2').written.includes('hello'),
      JSON.stringify(factory.made.get('p2').written))
  }

  // 5. THE CHECK. Demotion detaches but never kills. A zoom gesture must not
  //    destroy a running agent.
  {
    const { bridge, factory, registry } = setup()
    registry.ensure('p1', SPEC)
    registry.applyTiers({ p1: 'live' })
    registry.attachSlot('p1')
    await tick()
    registry.applyTiers({ p1: 'card' })
    registry.detachSlot('p1')
    await tick()
    const state = factory.made.get('p1')
    ok(5, bridge.calls.kill.length === 0 && !state.attached && !state.disposed,
      `kills=${bridge.calls.kill.length} attached=${state.attached} disposed=${state.disposed}`)
  }

  // 6. Output keeps arriving for a demoted panel and lands in its buffer.
  {
    const { bridge, factory, registry } = setup()
    registry.ensure('p1', SPEC)
    registry.applyTiers({ p1: 'live' })
    registry.attachSlot('p1')
    await tick()
    registry.applyTiers({ p1: 'card' })
    registry.detachSlot('p1')
    bridge.emitData({ panelId: 'p1', data: 'while-carded' })
    ok(6, factory.made.get('p1').written.includes('while-carded'),
      JSON.stringify(factory.made.get('p1').written))
  }

  // 7. Re-promotion re-attaches, resizes to the current fitted size (the
  //    grid may have changed while carded), and does NOT spawn a second PTY.
  {
    const { bridge, factory, registry } = setup()
    registry.ensure('p1', SPEC)
    registry.applyTiers({ p1: 'live' })
    registry.attachSlot('p1')
    await tick()
    registry.applyTiers({ p1: 'card' })
    registry.detachSlot('p1')
    Object.assign(factory.made.get('p1'), { cols: 100, rows: 30 })
    registry.applyTiers({ p1: 'live' })
    registry.attachSlot('p1')
    await tick()
    const resized = bridge.calls.resize[0]
    ok(7, bridge.calls.create.length === 1 && factory.made.get('p1').attached &&
          resized && resized.panelId === 'p1' && resized.cols === 100 && resized.rows === 30,
      `create calls=${bridge.calls.create.length} resize=${JSON.stringify(resized)}`)
  }

  // 8. Exit updates status and leaves the session in place to be read.
  {
    const { bridge, registry } = setup()
    registry.ensure('p1', SPEC)
    registry.applyTiers({ p1: 'live' })
    registry.attachSlot('p1')
    await tick()
    bridge.emitExit({ panelId: 'p1', exitCode: 3 })
    const session = registry.get('p1')
    ok(8, session.status.kind === 'exited' && session.status.code === 3,
      JSON.stringify(session.status))
  }

  // 9. A spawn failure becomes an error status, not an unhandled rejection.
  {
    const bridge = fakeBridge()
    bridge.pty.create = async () => { throw new Error('command not found: nope') }
    const factory = fakeFactory()
    const registry = createRegistry({ bridge, factory })
    registry.ensure('p1', { ...SPEC, command: 'nope' })
    registry.applyTiers({ p1: 'live' })
    registry.attachSlot('p1')
    await tick()
    const status = registry.get('p1').status
    ok(9, status.kind === 'error' && status.message.includes('nope'), JSON.stringify(status))
  }

  // 10. Focus records a timestamp, which is what eviction orders by, and —
  //     for a live-tier panel — calls handle.focus() so the keyboard
  //     actually lands in the terminal, not just in the bookkeeping.
  {
    const { factory, registry } = setup()
    registry.ensure('p1', SPEC)
    registry.ensure('p2', { ...SPEC, panelId: 'p2' })
    registry.applyTiers({ p1: 'live' })
    registry.focus('p1')
    registry.focus('p2')
    const stamps = registry.lastFocusedAt()
    ok(10, stamps.p2 > stamps.p1 && factory.made.get('p1').focused,
      JSON.stringify({ stamps, focused: factory.made.get('p1').focused }))
  }

  // 11. Subscribers are notified on status change, and version() advances so
  //     useSyncExternalStore has a stable scalar to compare.
  {
    const { bridge, registry } = setup()
    let notifications = 0
    registry.subscribe(() => notifications++)
    registry.ensure('p1', SPEC)
    const before = registry.version()
    registry.applyTiers({ p1: 'live' })
    registry.attachSlot('p1')
    await tick()
    ok(11, notifications > 0 && registry.version() > before,
      `notifications=${notifications} version ${before} -> ${registry.version()}`)
  }

  // 12. disposeAll is the ONLY path that kills.
  {
    const { bridge, factory, registry } = setup()
    registry.ensure('p1', SPEC)
    registry.applyTiers({ p1: 'live' })
    registry.attachSlot('p1')
    await tick()
    registry.disposeAll()
    ok(12, bridge.calls.kill.length === 1 && factory.made.get('p1').disposed,
      `kills=${JSON.stringify(bridge.calls.kill)}`)
  }

  console.log('\n' + '='.repeat(60))
  const failed = results.filter((r) => !r.pass)
  console.log(`${results.length - failed.length}/${results.length} passed`)
  if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
  process.exit(failed.length ? 1 : 0)
})()
