/* Run with: node scripts/verify-demo.cjs
   Lane N (M565–M569): the browser demo (docs/streams/bold.md). Plain node:
   the fake bridge is bundled with esbuild and driven in fake time, so no
   browser, Electron or network is touched. The browser half (does the page
   mount) is scripts/demo-smoke.cjs, run by pages.yml; demo.pages.* pins that.
   Every check reports even when its module fails to load. */
const { buildSync } = require('esbuild')
const { readFileSync, existsSync } = require('node:fs')
const { join, resolve } = require('node:path')
const ROOT = resolve(__dirname, '..')
const { ok, results } = require('./lib/checks.cjs').createChecks()

const ALIAS = { '@shared': join(ROOT, 'src/shared'), '@renderer': join(ROOT, 'src/renderer') }
function load(entry, name) {
  try {
    const outfile = join(ROOT, 'out/verify', `demo-${name}.cjs`)
    buildSync({ entryPoints: [join(ROOT, entry)], outfile, bundle: true, platform: 'node', format: 'cjs', alias: ALIAS, logLevel: 'silent' })
    return { mod: require(outfile) }
  } catch (error) {
    return { error: error.message.split('\n')[0] }
  }
}
const check = (id, loaded, test) => {
  if (loaded.mod === undefined) { ok(id, false, loaded.error); return }
  try {
    const r = test(loaded.mod)
    ok(id, r.pass, JSON.stringify(r.detail).slice(0, 400))
  } catch (error) { ok(id, false, error.message) }
}
const read = (rel) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), 'utf8') : '')

const layout = load('src/web/demo-layout.ts', 'layout')
const bridgeMod = load('src/web/fake-bridge.ts', 'bridge')
const doors = load('src/web/stub-door.ts', 'doors')
const script = load('src/web/demo-script.ts', 'script')
const stewardWorld = load('scripts/fixtures/rd-steward/world-sim.ts', 'steward-world')
const cast = JSON.parse(read('scripts/fixtures/rd-steward/workspace.json') || '{"tasks":[]}')
const loader = require('./fixtures/rd-steward/load.cjs')

/* Fake time: a heap of timers the check advances by hand. */
function fakeClock() {
  let now = 0
  let nextId = 1
  const timers = new Map()
  return {
    timers: {
      now: () => now,
      setTimeout: (fn, ms) => { const id = nextId++; timers.set(id, { at: now + ms, fn }); return id },
      clearTimeout: (id) => { timers.delete(id) },
      random: () => 0.5
    },
    advance(ms) {
      const end = now + ms
      for (;;) {
        let next = null
        for (const [id, t] of timers) if (t.at <= end && (next === null || t.at < next[1].at)) next = [id, t]
        if (next === null) break
        timers.delete(next[0])
        now = next[1].at
        next[1].fn()
      }
      now = end
    }
  }
}

function demo(extra = {}) {
  const notices = []
  const clock = fakeClock()
  const made = bridgeMod.mod.createDemoBridge({ cast, notice: (d) => notices.push(d), appVersion: '9.9.9', timers: clock.timers, ...extra })
  return { ...made, notices, clock }
}

// M565 — demo.layout.1. The web port of the fixture loader is the loader:
//        load.cjs feeds `TC_FIXTURE=rd-steward npm run dev`, and a demo that
//        drifted from it would show a canvas the app never does.
check('demo.layout.1 the demo canvas is byte-for-byte the layout TC_FIXTURE=rd-steward writes for the same cast', layout, (L) => {
  const web = JSON.stringify(L.stewardLayout(cast, '/Users/you/steward'))
  const app = JSON.stringify(loader.stewardLayout(cast, '/Users/you/steward'))
  return { pass: web === app && web.length > 100, detail: { webLength: web.length, appLength: app.length } }
})

// demo.layout.2. Read back through parseLayout (main's own parser), every
//        cast panel and task survives, so the parser did not drop the cast.
check('demo.layout.2 the canvas layout.load answers keeps every cast panel and task through parseLayout', layout, (L) => {
  const { canvas } = L.demoCanvas(cast, '/Users/you/steward')
  const castPanels = cast.tasks.flatMap((t) => t.panels.map((p) => p.id))
  const ids = canvas.panels.map((p) => p.id)
  return {
    pass: castPanels.length > 0 && castPanels.every((id) => ids.includes(id)) && (canvas.workItems ?? []).length === cast.tasks.length,
    detail: { panels: ids.length, cast: castPanels.length, workItems: (canvas.workItems ?? []).length }
  }
})

// demo.bridge.1. The doors boot() awaits agree with each other: every panel
//        on the canvas has a live session (so it restores reattachable, not
//        dormant) and the one workspace lists the same ids.
;(async () => {
  if (bridgeMod.mod === undefined) {
    ok('demo.bridge.1 layout.load, pty.list and workspace.list name the same panels', false, bridgeMod.error)
  } else {
    try {
      const { bridge } = demo()
      const canvas = await bridge.layout.load()
      const live = (await bridge.pty.list()).map((s) => s.panelId).sort()
      const rows = await bridge.workspace.list()
      const ids = canvas.panels.map((p) => p.id).sort()
      const pass = ids.length > 0 && JSON.stringify(ids) === JSON.stringify(live) && rows.length === 1 && JSON.stringify([...rows[0].panelIds].sort()) === JSON.stringify(ids)
      ok('demo.bridge.1 layout.load, pty.list and workspace.list name the same panels', pass, JSON.stringify({ ids: ids.length, live: live.length, rows: rows.length }))
    } catch (error) { ok('demo.bridge.1 layout.load, pty.list and workspace.list name the same panels', false, error.message) }
  }

  // demo.bridge.2. The scalars boot reads directly: telemetry OFF (a true
  //        here would import Sentry and try to send from a public page),
  //        a version, and no namespace proxy where a value belongs.
  if (bridgeMod.mod !== undefined) {
    const { bridge } = demo()
    const pass = bridge.telemetry.enabled === false && bridge.appVersion === '9.9.9' && bridge.platform === 'darwin' && bridge.boot === undefined && typeof bridge.home === 'string'
    ok('demo.bridge.2 telemetry is off, and the scalar fields are values rather than stubs', pass, JSON.stringify({ telemetry: bridge.telemetry, appVersion: bridge.appVersion, boot: bridge.boot }))
  } else ok('demo.bridge.2 telemetry is off, and the scalar fields are values rather than stubs', false, bridgeMod.error)

  // M566 — demo.world.1. The scripts open on the cast's own frame: the
  //        same tally the World room shot asks of the fixture
  //        (stewardWorldTally), so the first thing a visitor sees is the mockup.
  if (bridgeMod.mod !== undefined && stewardWorld.mod !== undefined && script.mod !== undefined) {
    const { bridge, clock, stop } = demo()
    const events = []
    bridge.world.onEvents((batch) => events.push(...batch))
    clock.advance(2000)
    const latest = new Map()
    for (const e of events) if (e.type === 'status') latest.set(e.agentId, e)
    const opening = stewardWorld.mod.stewardWorldTally([...latest.values()])
    const expected = stewardWorld.mod.stewardWorldTally(stewardWorld.mod.stewardWorldEvents(cast.tasks))
    stop()
    ok('demo.world.1 the scripted agents open on the cast frame the World room shot uses', JSON.stringify(opening) === JSON.stringify(expected) && expected.working > 0, JSON.stringify({ opening, expected }))
  } else ok('demo.world.1 the scripted agents open on the cast frame the World room shot uses', false, bridgeMod.error ?? stewardWorld.error ?? script.error)

  // demo.world.2. "Scripted agents work, wait and finish": over one loop
  //        every Claude and Codex agent is working, waiting for you, and idle
  //        at some point, and the panel's state word follows its status.
  if (bridgeMod.mod !== undefined) {
    const { bridge, clock, stop } = demo()
    const seen = new Map()
    const states = new Map()
    bridge.world.onEvents((batch) => {
      for (const e of batch) if (e.type === 'status') { const s = seen.get(e.agentId) ?? new Set(); s.add(e.payload); seen.set(e.agentId, s) }
    })
    bridge.agent.onState((u) => { const s = states.get(u.panelId) ?? new Set(); s.add(u.state); states.set(u.panelId, s) })
    clock.advance(90000)
    stop()
    const agents = cast.tasks.flatMap((t) => t.panels).filter((p) => p.agent === true && (p.engine === 'claude' || p.engine === 'codex') && p.world !== 'error')
    const missing = agents.filter((p) => {
      const s = seen.get(p.id) ?? new Set()
      const st = states.get(p.id) ?? new Set()
      return !(s.has('working') && s.has('waiting_approval') && s.has('idle') && st.has('busy') && st.has('wants-you') && st.has('idle'))
    }).map((p) => p.id)
    ok('demo.world.2 every agent works, waits for you and finishes within a loop, and its panel state follows', agents.length > 0 && missing.length === 0, JSON.stringify({ agents: agents.length, missing }))
  } else ok('demo.world.2 every agent works, waits for you and finishes within a loop, and its panel state follows', false, bridgeMod.error)

  // M567 — demo.recording.1. A terminal attached late still gets its
  //        history (the backlog), opener first, then its agent's own lines,
  //        and never another panel's.
  if (bridgeMod.mod !== undefined) {
    const { bridge, clock, stop } = demo()
    bridge.world.onEvents(() => {})
    clock.advance(30000)
    const chunks = []
    bridge.pty.onData((c) => chunks.push(c))
    await bridge.pty.create({ panelId: 'claude-ledger', cwd: '/', args: [], cols: 80, rows: 24 })
    await new Promise((r) => setTimeout(r, 0))
    clock.advance(5000)
    stop()
    const mine = chunks.filter((c) => c.panelId === 'claude-ledger').map((c) => c.data).join('')
    const others = chunks.filter((c) => c.panelId !== 'claude-ledger').length
    const pass = mine.indexOf('Claude Code') >= 0 && mine.indexOf('Claude Code') < mine.indexOf('●') && others === 0
    ok('demo.recording.1 a terminal attached late replays its opener and its own agent lines, and no other panel\'s', pass, JSON.stringify({ length: mine.length, others, head: mine.slice(0, 60) }))
  } else ok('demo.recording.1 a terminal attached late replays its opener and its own agent lines, and no other panel\'s', false, bridgeMod.error)

  // demo.doors.1. Doors that would spawn or write say "in the app"; the
  //        renderer's own background writes (autosave, acknowledge) stay
  //        silent; a read never notices; a subscription is an unsubscribe.
  if (bridgeMod.mod !== undefined) {
    const { bridge, notices } = demo()
    const spawn = await bridge.preset.spawnById('claude')
    await bridge.agentSession.create({})
    await bridge.review.commit({})
    await bridge.github.publish({})
    await bridge.pty.write({ panelId: 'claude-ledger', data: 'ls' })
    await bridge.layout.save({})
    await bridge.agent.acknowledge('claude-ledger')
    const usage = await bridge.ledger.usage(0)
    const root = await bridge.git.root('/x')
    const off = bridge.routine.onFire(() => {})
    const confirmed = await bridge.dialog.confirm({})
    const pass = spawn === undefined && Array.isArray(usage) && usage.length === 0 && root === null && typeof off === 'function' && confirmed === false &&
      JSON.stringify(notices) === JSON.stringify(['preset.spawnById', 'agentSession.create', 'review.commit', 'github.publish', 'pty.write', 'dialog.confirm'])
    ok('demo.doors.1 spawn and write doors say "in the app", background writes and reads stay silent, a confirm declines', pass, JSON.stringify({ notices, usage, root, confirmed }))
  } else ok('demo.doors.1 spawn and write doors say "in the app", background writes and reads stay silent, a confirm declines', false, bridgeMod.error)

  // demo.doors.2. The verb test is a camelCase boundary, not a prefix:
  //        `use` writes and `usage` reads, `set` and `setDefault` write and
  //        `settings` does not, `share` writes and `shares` reads.
  check('demo.doors.2 the write-verb test stops at the camelCase boundary', doors, (D) => {
    const writes = ['use', 'set', 'setDefault', 'share', 'spawnById', 'openPr', 'exportHandoff', 'commit']
    const reads = ['usage', 'settings', 'shares', 'status', 'list', 'recentUsed', 'transcript', 'opener']
    const wrong = [...writes.filter((n) => !D.WRITE_VERB.test(n)), ...reads.filter((n) => D.WRITE_VERB.test(n))]
    return { pass: wrong.length === 0, detail: { wrong } }
  })

  // demo.doors.3. Every method the contract declares under the doors that
  //        start work is classed a write, read off ipc-contract.ts's
  //        CanvasBridge text, so a new spawn door added there is not served
  //        as a silent read in the demo.
  check('demo.doors.3 every method on the spawning namespaces of CanvasBridge that starts work is a write', doors, (D) => {
    const src = read('src/shared/ipc-contract.ts')
    const body = src.slice(src.indexOf('export interface CanvasBridge {'))
    const methodsOf = (ns) => {
      const start = body.indexOf(`\n  ${ns}: {`)
      if (start < 0) return []
      const end = body.indexOf('\n  }', start)
      return [...body.slice(start, end).matchAll(/\n {4}([a-zA-Z]+)\??\(/g)].map((m) => m[1])
    }
    const spawning = { preset: ['spawnById'], agentSession: ['create', 'send', 'answer', 'interrupt', 'terminate'], tonight: ['start'], routine: ['run'], watcher: ['create', 'run'], spawn: ['sheet'] }
    const declared = Object.fromEntries(Object.keys(spawning).map((ns) => [ns, methodsOf(ns)]))
    const missing = Object.entries(spawning).flatMap(([ns, names]) => names.filter((n) => !declared[ns].includes(n)).map((n) => `${ns}.${n} undeclared`))
    const silent = Object.entries(spawning).flatMap(([ns, names]) => names.filter((n) => !D.WRITE_VERB.test(n) && n !== 'sheet').map((n) => `${ns}.${n}`))
    return { pass: missing.length === 0 && silent.length === 0, detail: { missing, silent } }
  })

  // demo.entry.1. ORDER IS THE CONTRACT (src/web/main.ts): the bridge is
  //        installed before the renderer's main.tsx, which reads it at module scope.
  {
    const entry = read('src/web/main.ts')
    const bridgeAt = entry.indexOf("import './install-bridge'")
    const rendererAt = entry.indexOf("import '../renderer/main'")
    ok('demo.entry.1 the demo entry installs the bridge before the renderer evaluates', bridgeAt >= 0 && rendererAt > bridgeAt, JSON.stringify({ bridgeAt, rendererAt }))
  }

  // M568 — demo.pages.1. The workflow builds and smoke-tests on every PR,
  //        deploys only from a push to main, and the deploy job alone holds
  //        the Pages write permission.
  {
    const wf = read('.github/workflows/pages.yml')
    const deploy = wf.slice(wf.indexOf('\n  deploy:'))
    const build = wf.slice(wf.indexOf('\n  build:'), wf.indexOf('\n  deploy:'))
    const pass = wf !== '' && /pull_request:/.test(wf) && /branches: \[main\]/.test(wf) && /npm run build:web/.test(build) && /node scripts\/demo-smoke\.cjs/.test(build) &&
      /refs\/heads\/main/.test(deploy) && /actions\/deploy-pages@/.test(deploy) && /pages: write/.test(deploy) && !/pages: write/.test(build) && /^permissions:\n {2}contents: read/m.test(wf)
    ok('demo.pages.1 pages.yml builds and smoke-tests every PR and deploys only from main, with Pages write on the deploy job alone', pass)
  }

  // demo.pages.2. The scripts the workflow names exist.
  {
    const pkg = JSON.parse(read('package.json'))
    const pass = /vite\.web\.config\.ts/.test(pkg.scripts['build:web'] ?? '') && existsSync(join(ROOT, 'vite.web.config.ts')) && existsSync(join(ROOT, 'scripts/demo-smoke.cjs'))
    ok('demo.pages.2 build:web, its config and the smoke script exist', pass)
  }

  // M569 — demo.readme.1. The README links the published demo.
  ok('demo.readme.1 the README links the live demo', read('README.md').includes('https://alexnieves-cs.github.io/terminal-canvas/'))

  console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`)
  if (results.some((r) => !r.pass)) process.exitCode = 1
})()
