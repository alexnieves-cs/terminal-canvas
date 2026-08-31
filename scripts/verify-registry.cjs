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
  format: 'cjs',
  // The verify bundles resolved no aliases until M4b, and got away with it
  // because every cross-boundary import was `import type` (erased by esbuild).
  // panel-interaction.ts now imports a real VALUE from @shared, so the alias
  // has to exist or the bundle fails with "Could not resolve".
  alias: { '@shared': join(__dirname, '..', 'src', 'shared') }
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
        return { panelId: spec.panelId, pid: 4000 + calls.create.length, command: spec.command, cwd: spec.cwd, reattached: false }
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
        getSelection() { return state.selection ?? '' },
        paste(data) { state.pasted = data },
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

    // ...and a promotion that changes NOTHING sends nothing. resize is a
    // SIGWINCH, which makes a full-screen agent TUI repaint; doing that on
    // every promotion is invisible in a screenshot and obvious in a running
    // agent. The spec's tier-transition table says "only if cols/rows changed".
    const resizesAfterFirst = bridge.calls.resize.length
    registry.applyTiers({ p1: 'card' })
    registry.detachSlot('p1')
    registry.applyTiers({ p1: 'live' })
    registry.attachSlot('p1') // same 100x30 grid as the resize above
    await tick()
    ok('7b', bridge.calls.resize.length === resizesAfterFirst,
      `resize calls ${resizesAfterFirst} -> ${bridge.calls.resize.length}: ` +
        JSON.stringify(bridge.calls.resize))
  }

  // 7c. The FIRST spawn also records the grid it sent, so an immediate
  //     card/live round trip at an unchanged size resizes nothing either.
  //     Without that, the very first promotion after spawn would SIGWINCH a
  //     process that was spawned at exactly those dimensions moments earlier.
  {
    const { bridge, registry } = setup()
    registry.ensure('p1', SPEC)
    registry.applyTiers({ p1: 'live' })
    registry.attachSlot('p1')
    await tick()
    registry.applyTiers({ p1: 'card' })
    registry.detachSlot('p1')
    registry.applyTiers({ p1: 'live' })
    registry.attachSlot('p1')
    await tick()
    ok('7c', bridge.calls.resize.length === 0, JSON.stringify(bridge.calls.resize))
  }

  // 7d. A spec with no command is forwarded with command undefined, NOT with a
  //     renderer-invented default. The renderer physically cannot see the login
  //     shell (electron-vite compiles process.env to {} there), so main resolves
  //     it; a default substituted here would be that bug moved, not fixed.
  {
    const { bridge, registry } = setup()
    const { command: _dropped, ...noCommand } = SPEC
    registry.ensure('p1', noCommand)
    registry.applyTiers({ p1: 'live' })
    registry.attachSlot('p1')
    await tick()
    const spawnedSpec = bridge.calls.create[0]
    ok('7d', spawnedSpec && spawnedSpec.command === undefined && 'cwd' in spawnedSpec,
      JSON.stringify(spawnedSpec))
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

  // 8b. Functional links observe the registry's settled exit, not the raw
  // bridge event. Seeing the status already be `exited` is the ordering that
  // lets #24 decide from the same fact the Inspector renders; a second raw
  // subscription could restart a target while the source still read running.
  {
    const { bridge, registry } = setup()
    registry.ensure('p1', SPEC)
    let observed = null
    const off = registry.onExit((info) => {
      observed = { info, status: registry.get(info.panelId)?.status.kind }
    })
    bridge.emitExit({ panelId: 'p1', exitCode: 7 })
    off()
    bridge.emitExit({ panelId: 'p1', exitCode: 8 })
    ok('8b functional exit observers run after status and unsubscribe cleanly',
      observed?.info.exitCode === 7 && observed.status === 'exited',
      JSON.stringify(observed))
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

  // 12. disposeAll kills every spawned session. Until M4a it was the only
  //     path in the renderer that killed anything; dispose(id) (13-15) is now
  //     the second and last.
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

  // ---------------------------------------------------------------------------
  // M4a: explicit close (13-15)
  // NOTE: this suite numbers 1-15 with lettered sub-checks (3b, 7c, ...), so
  // 20 assertions run today and 16 is the next free NUMBER. (13 was the next
  // free number when this block was written; it now holds the first of the
  // three checks below.)
  // ---------------------------------------------------------------------------

  // 13. dispose(id) kills that panel's PTY. This is the SECOND legitimate caller
  //     of pty.kill in the renderer; disposeAll was the first and, until M4a,
  //     the only one.
  //     The handle is asserted too: a dispose that killed the PTY but leaked
  //     the Terminal would leak a WebGL context per close, and the context
  //     budget is finite for the run (create-terminal sets webglDisabled once
  //     one is lost).
  {
    const bridge = fakeBridge()
    const factory = fakeFactory()
    const registry = createRegistry({ bridge, factory })
    registry.ensure('a', { panelId: 'a', cwd: '~', args: [] })
    registry.applyTiers({ a: 'live' })
    registry.attachSlot('a')
    registry.dispose('a')
    ok('13 dispose kills that panel\'s pty and disposes its terminal',
      bridge.calls.kill.length === 1 && bridge.calls.kill[0] === 'a' &&
        factory.made.get('a').disposed,
      `${JSON.stringify(bridge.calls.kill)} disposed=${factory.made.get('a').disposed}`)
  }

  // 14. dispose(id) touches nothing else. The panel next to the one you closed
  //     must not lose its agent — the same class of silent failure check 5
  //     exists for, arriving through the new code path.
  {
    const bridge = fakeBridge()
    const registry = createRegistry({ bridge, factory: fakeFactory() })
    for (const id of ['a', 'b', 'c']) {
      registry.ensure(id, { panelId: id, cwd: '~', args: [] })
    }
    registry.applyTiers({ a: 'live', b: 'live', c: 'live' })
    for (const id of ['a', 'b', 'c']) registry.attachSlot(id)
    registry.dispose('b')
    ok('14 dispose leaves every other session alone',
      bridge.calls.kill.length === 1 && bridge.calls.kill[0] === 'b' &&
        registry.get('a') !== undefined && registry.get('c') !== undefined &&
        registry.get('b') === undefined,
      `killed=${JSON.stringify(bridge.calls.kill)} a=${!!registry.get('a')} c=${!!registry.get('c')}`)
  }

  // 15. Demotion STILL never kills, now that a kill path other than disposeAll
  //     exists. This is check 5's invariant re-asserted against the new code:
  //     the danger was never that kill is called, it was that kill becomes
  //     reachable from a tier change.
  {
    const bridge = fakeBridge()
    const registry = createRegistry({ bridge, factory: fakeFactory() })
    for (const id of ['a', 'b']) {
      registry.ensure(id, { panelId: id, cwd: '~', args: [] })
    }
    registry.applyTiers({ a: 'live', b: 'live' })
    registry.attachSlot('a')
    registry.attachSlot('b')
    registry.dispose('a')
    registry.applyTiers({ b: 'card' })
    registry.detachSlot('b')
    ok('15 demotion never kills, even alongside an explicit close',
      bridge.calls.kill.length === 1 && bridge.calls.kill[0] === 'a' &&
        registry.get('b') !== undefined,
      `killed=${JSON.stringify(bridge.calls.kill)}`)
  }

  // ---------------------------------------------------------------------------
  // M4b: dormancy (16-17)
  // ---------------------------------------------------------------------------

  // 16. A dormant session does not spawn when its slot attaches. Belt and
  //     braces under the tiering rule: dormant panels should never reach
  //     'live' at all, but a registry that spawns on attach regardless would
  //     make the whole feature depend on lod.ts alone being right.
  {
    const { bridge, registry } = setup()
    registry.ensure('d1', SPEC, { dormant: true })
    registry.applyTiers({ d1: 'live' })
    registry.attachSlot('d1')
    ok('16 attaching a dormant session spawns no pty',
      bridge.calls.create.length === 0 && registry.get('d1').spawned === false,
      `created=${bridge.calls.create.length}`)
  }

  // 17. wake() clears dormancy and spawns exactly once, and a second wake is a
  //     no-op rather than a second process.
  {
    const { bridge, registry } = setup()
    registry.ensure('d1', SPEC, { dormant: true })
    registry.applyTiers({ d1: 'live' })
    registry.attachSlot('d1')
    registry.wake('d1')
    registry.wake('d1')
    ok('17 wake spawns once and is idempotent',
      bridge.calls.create.length === 1 && registry.get('d1').dormant === false,
      `created=${bridge.calls.create.length}`)
  }

  // 18. wake() while the panel is STILL CARDED — the branch a real click
  // actually takes, since the tiering effect has not re-run yet at the
  // moment onSelectPanel fires. Checks 16-17 only exercised the "already
  // live" branch (spawn immediately); this asserts wake() instead takes the
  // "clear the flag and wait for tiering" path — no spawn until applyTiers
  // promotes the panel and attachSlot actually runs.
  {
    const { bridge, registry } = setup()
    registry.ensure('d1', { ...SPEC, panelId: 'd1' }, { dormant: true })
    registry.wake('d1')
    const spawnedImmediately = bridge.calls.create.length !== 0
    const dormantAfterWake = registry.get('d1').dormant

    registry.applyTiers({ d1: 'live' })
    registry.attachSlot('d1')
    await tick()

    ok('18 waking a still-carded panel clears dormancy but spawns nothing until tiering promotes it',
      !spawnedImmediately && dormantAfterWake === false && bridge.calls.create.length === 1,
      `spawnedImmediately=${spawnedImmediately} dormantAfterWake=${dormantAfterWake} createdAfterPromote=${bridge.calls.create.length}`)
  }

  // ---------------------------------------------------------------------------
  // M4c: closing a panel that never spawned (19)
  // ---------------------------------------------------------------------------

  // 19. dispose() must ask main to kill even a session this renderer never
  // spawned. Under node-pty that call was pure waste and dispose() guarded it
  // on `spawned`; under tmux the session can be alive and REATTACHABLE — it
  // survived a reload but was off-screen or held back by LIVE_BUDGET, so it
  // never went live — and skipping the kill leaves an agent running with no
  // panel left able to reach it. Nothing else in the renderer can observe the
  // difference, which is why this needs its own check rather than falling out
  // of an existing one.
  {
    const { bridge, registry } = setup()
    registry.ensure('never', SPEC)
    const spawnedBefore = registry.get('never').spawned
    registry.dispose('never')
    ok('19 closing a never-spawned panel still asks main to kill its session',
      spawnedBefore === false && bridge.calls.kill.length === 1 && bridge.calls.kill[0] === 'never',
      `spawned=${spawnedBefore} kills=${JSON.stringify(bridge.calls.kill)}`)
  }

  // 20 — M6a. The registry received the resolved command and cwd from the very
  //     first M4 build and stored only the pid, so the header had nothing to
  //     render but the SPEC's command — which is absent for every login-shell
  //     panel. This is the check that fails if the widening is reverted.
  //
  //     The fake's create is overridden rather than used as-is on purpose: the
  //     default returns `command: spec.command`, so a registry that wrongly read
  //     the SPEC instead of the RESULT would pass against it. The resolved value
  //     here is deliberately DIFFERENT from the spec's, and the spec's command
  //     is absent, which is the real-world case.
  {
    const { bridge, factory, registry } = setup()
    bridge.pty.create = async () => ({
      panelId: 'p1',
      pid: 4242,
      command: '/opt/homebrew/bin/fish',
      cwd: '/Users/x/proj',
      reattached: true
    })
    const { command: _dropped, ...noCommand } = SPEC
    registry.ensure('p1', noCommand)
    registry.applyTiers({ p1: 'live' })
    registry.attachSlot('p1')
    await tick()
    const st = registry.get('p1').status
    ok('20 running status carries what main resolved, not what the spec asked for',
      st.kind === 'running' && st.pid === 4242 &&
      st.command === '/opt/homebrew/bin/fish' &&
      st.cwd === '/Users/x/proj' && st.reattached === true,
      JSON.stringify(st))
  }

  // 21. THE RESTART SEQUENCE. Restart is dispose-then-ensure at ONE id, and
  //     this is that sequence driven directly, without a renderer.
  //
  //     The clauses that carry weight are the ones about IDENTITY: the new
  //     session must be a DIFFERENT object with a DIFFERENT handle, because
  //     term.open() runs at most once ever and a reused Terminal is a panel
  //     that renders nothing with no error anywhere. And it must be NOT
  //     dormant — an ensure that inherited dormancy would leave a restarted
  //     panel refusing to spawn, which looks exactly like a restart that did
  //     nothing.
  {
    const { bridge, factory, registry } = setup()
    registry.ensure('p1', SPEC)
    registry.applyTiers({ p1: 'live' })
    registry.attachSlot('p1')
    await tick()
    const first = registry.get('p1')
    const firstHandle = first.handle

    await registry.dispose('p1')
    registry.ensure('p1', SPEC, { dormant: false })
    registry.applyTiers({ p1: 'live' })
    registry.attachSlot('p1')
    await tick()
    const second = registry.get('p1')

    ok('21 restart disposes and re-ensures at the same id, with a fresh handle and no dormancy',
      first !== second && second.id === 'p1' &&
        second.handle !== firstHandle &&
        second.dormant === false && second.spawned === true &&
        bridge.calls.kill.length === 1 && bridge.calls.kill[0] === 'p1' &&
        bridge.calls.create.length === 2 &&
        bridge.calls.create[0].panelId === 'p1' && bridge.calls.create[1].panelId === 'p1',
      `kills=${JSON.stringify(bridge.calls.kill)} creates=${bridge.calls.create.length}`)
  }

  // 22. THE ORDERING GUARANTEE restart depends on. dispose() must RESOLVE
  //     after the bridge's kill has resolved, or awaiting it buys nothing and
  //     the respawn can overtake the destroy — under tmux, `new-session -A`
  //     then reattaches to the very session the restart meant to replace and
  //     the whole verb becomes a silent no-op.
  //
  //     The fake kill is deliberately made SLOW and the create is recorded
  //     against a flag the kill flips. A check that only awaited dispose()
  //     and asserted "it resolved" passes against `dispose(id) { …; void
  //     bridge.pty.kill(id) }` returning undefined, because `await undefined`
  //     resolves immediately and truthfully.
  {
    const { bridge, registry } = setup()
    let killFinished = false
    bridge.pty.kill = async (id) => {
      bridge.calls.kill.push(id)
      await new Promise((r) => setTimeout(r, 20))
      killFinished = true
    }
    registry.ensure('p1', SPEC)
    registry.applyTiers({ p1: 'live' })
    registry.attachSlot('p1')
    await tick()
    await registry.dispose('p1')
    ok('22 dispose resolves only after main has confirmed the kill',
      killFinished === true, `killFinished=${killFinished}`)
  }

  // 23. The OLD handle is never written to again, and the NEW one IS. pty:data
  //     arrives on one subscription for the whole canvas, keyed by panel id,
  //     so a restart that left the disposed handle reachable would route the
  //     NEW process's output into a disposed terminal — a restarted panel that
  //     stays blank while its agent runs perfectly well, with nothing in any
  //     log.
  //
  //     Both halves are asserted, and the positive one is why oldState is
  //     captured BEFORE the second ensure: the fake factory keys `made` by
  //     panel id and overwrites the entry on a second create(id), so the two
  //     handles are only distinguishable if the first is held onto across the
  //     restart. This check used to close with `registry.get('p1').handle !==
  //     undefined`, which asserted nothing at all — ensure() cannot return a
  //     session without one.
  {
    const { bridge, factory, registry } = setup()
    registry.ensure('p1', SPEC)
    registry.applyTiers({ p1: 'live' })
    registry.attachSlot('p1')
    await tick()
    const oldState = factory.made.get('p1')
    const writtenBefore = oldState.written.length

    await registry.dispose('p1')
    registry.ensure('p1', SPEC, { dormant: false })
    registry.applyTiers({ p1: 'live' })
    registry.attachSlot('p1')
    await tick()
    const newState = factory.made.get('p1')
    bridge.emitData({ panelId: 'p1', data: 'after restart' })

    ok('23 output after a restart reaches the new handle, never the disposed one',
      oldState.disposed === true &&
        oldState.written.length === writtenBefore &&
        newState !== oldState &&
        newState.disposed === false &&
        newState.written.includes('after restart'),
      `old disposed=${oldState.disposed} old writes ${writtenBefore} -> ${oldState.written.length}, new writes=${JSON.stringify(newState.written)}`)
  }

  // 24. bumpVersion advances version() and does NOTHING else.
  //     The "nothing else" half is the whole reason it exists rather than
  //     reusing focus(), which also bumps: focus() moves the keyboard, and a
  //     restart that stole focus would violate the shell's rule 2 — silently,
  //     because the panel would look right and the next keystroke would land
  //     somewhere the user did not choose.
  {
    const { factory, registry } = setup()
    registry.ensure('p1', SPEC)
    registry.applyTiers({ p1: 'live' })
    registry.attachSlot('p1')
    await tick()
    const state = factory.made.get('p1')
    const focusedBefore = state.focused
    const stampBefore = registry.lastFocusedAt().p1
    let notified = 0
    const off = registry.subscribe(() => { notified += 1 })
    const before = registry.version()
    registry.bumpVersion()
    const after = registry.version()
    off()
    ok('24 bumpVersion advances version and notifies, without touching focus',
      after === before + 1 && notified === 1 &&
        state.focused === focusedBefore &&
        registry.lastFocusedAt().p1 === stampBefore,
      `version ${before} -> ${after}, notified=${notified}, focused ${focusedBefore} -> ${state.focused}`)
  }

  // 25. touch RAISES lastFocusedAt and re-renders, and moves no keyboard.
  //     Same "and nothing else" shape as 24, guarding the other half of the
  //     same trap. assignTiers fills its LIVE_BUDGET slots in lastFocusedAt
  //     order and ensure() mints a session at 0, so a restarted panel starts
  //     at the BACK of the eviction queue — on a canvas already at budget it
  //     is the first candidate denied a slot, and attachSlot is the only
  //     caller of spawn(). Without this stamp, restart kills and never
  //     respawns: the panel becomes a card and the Restart control greys out
  //     reading "has not started yet", denying the thing the user just did.
  //
  //     The clause that discriminates is `state.focused` staying false while
  //     the panel is LIVE: focus() would also raise the stamp and bump, and on
  //     a live session it calls handle.focus() — which is exactly what a shell
  //     control must never do (shell-control.ts). Assert it on a live session
  //     or the clause is vacuous, since focus() moves nothing on a card.
  {
    const { factory, registry } = setup()
    registry.ensure('p1', SPEC)
    registry.applyTiers({ p1: 'live' })
    registry.attachSlot('p1')
    await tick()
    const state = factory.made.get('p1')
    const focusedBefore = state.focused
    const stampBefore = registry.lastFocusedAt().p1
    let notified = 0
    const off = registry.subscribe(() => { notified += 1 })
    const before = registry.version()
    registry.touch('p1')
    const after = registry.version()
    off()
    ok('25 touch advances version and raises lastFocusedAt, without touching focus',
      after === before + 1 && notified === 1 &&
        registry.lastFocusedAt().p1 > stampBefore &&
        state.focused === focusedBefore && focusedBefore === false &&
        registry.get('p1').tier === 'live',
      `version ${before} -> ${after}, notified=${notified}, stamp ${stampBefore} -> ${registry.lastFocusedAt().p1}, focused=${state.focused}`)
  }

  // 26. Broadcast stays inside the existing pty:write choke point. It fans
  //     keyboard bytes only to selected, already-running sessions; it does
  //     not wake a dormant target, and a non-member sender remains ordinary.
  {
    const { bridge, factory, registry } = setup()
    registry.ensure('p1', SPEC)
    registry.ensure('p2', { ...SPEC, panelId: 'p2' })
    registry.ensure('p3', { ...SPEC, panelId: 'p3' }, { dormant: true })
    registry.applyTiers({ p1: 'live', p2: 'live', p3: 'live' })
    registry.attachSlot('p1')
    registry.attachSlot('p2')
    await tick()
    registry.setInputTargets(['p1', 'p2', 'p3'])
    factory.made.get('p1').inputListener('shared')
    factory.made.get('p2').inputListener('again')
    ok('26 broadcast fans input to live members only and never wakes a dormant target',
      bridge.calls.write.map((call) => `${call.panelId}:${call.data}`).join(',') ===
        'p1:shared,p2:shared,p1:again,p2:again' &&
        registry.get('p3').dormant === true && registry.get('p3').spawned === false,
      JSON.stringify(bridge.calls.write))
  }

  console.log('\n' + '='.repeat(60))
  const failed = results.filter((r) => !r.pass)
  console.log(`${results.length - failed.length}/${results.length} passed`)
  if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
  process.exit(failed.length ? 1 : 0)
})()
