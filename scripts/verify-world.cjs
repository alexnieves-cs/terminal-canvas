/* The world-event contract (shared/world-events.ts), the renderer store that
   folds it (renderer/world/agent-world-store.ts) and the SIMULATE_AGENTS
   script (main/world-sim.ts).
   Run with: npm run verify:world

   Plain node. The simulator runs on a fake clock, so a whole loop of every
   agent's script costs no wall time. The store is driven through
   ingestAgentEvents and connectAgentWorld exactly as main.tsx drives it; its
   React hooks are useSyncExternalStore over the same reads, so they are not
   rendered here.

   M412 adds the 3D scene's decisions (renderer/world/world-scene.ts, pure) and
   pins its doors: three/fiber/drei stay in the lazily-loaded file set, and the
   pins for the traps that fail with no error (the glTF decoders the CSP
   refuses, drei Html's re-targeting, an additive bone pose that compounds).

   What this cannot see: the IPC hop itself (main's readyContents send and the
   preload's subscribe) — `SIMULATE_AGENTS=true npm run dev` is where that was
   watched by hand. */
'use strict'
const { buildSync } = require('esbuild')
const { mkdirSync, readFileSync, readdirSync, existsSync } = require('node:fs')
const { join } = require('node:path')
const { ok, results } = require('./lib/checks.cjs').createChecks()

const root = join(__dirname, '..')
mkdirSync(join(root, 'out/verify'), { recursive: true })
buildSync({
  stdin: {
    contents: [
      "module.exports = {",
      "  contract: require('./src/shared/world-events.ts'),",
      "  sim: require('./src/main/world-sim.ts'),",
      "  store: require('./src/renderer/world/agent-world-store.ts'),",
      "  scene: require('./src/renderer/world/world-scene.ts'),",
      "  presence: require('./src/shared/presence.ts')",
      "}"
    ].join('\n'),
    resolveDir: root, loader: 'js'
  },
  outfile: join(root, 'out/verify/world.cjs'),
  bundle: true, platform: 'node', format: 'cjs', logLevel: 'error', external: ['react'],
  alias: { '@shared': join(root, 'src/shared'), '@renderer': join(root, 'src/renderer') }
})
const { contract: C, sim: S, store: W, scene: Z, presence: P } = require('../out/verify/world.cjs')

const ev = (agentId, seq, type, payload, extra = {}) => ({ agentId, seq, ts: 1000 + seq, type, payload, ...extra })

// ── the reducer ─────────────────────────────────────────────────────────────
{
  let a = C.emptyAgent('a')
  for (let i = 0; i < C.AGENT_EVENT_RING + 7; i++) a = C.applyAgentEvent(a, ev('a', i, 'thought', { text: `t${i}` }))
  ok('world.ring.1 an agent keeps exactly its last AGENT_EVENT_RING events, oldest first',
    a.events.length === C.AGENT_EVENT_RING && a.events[0].seq === 7 && a.events.at(-1).seq === C.AGENT_EVENT_RING + 6,
    `len=${a.events.length} first=${a.events[0].seq} last=${a.events.at(-1).seq}`)

  const same = C.applyAgentEvent(a, ev('a', 3, 'status', 'error'))
  ok('world.seq.1 an event at or below the last seq is refused by IDENTITY — no status moves backwards',
    same === a && a.status === 'idle')

  let b = C.applyAgentEvent(C.emptyAgent('b'), ev('b', 0, 'status', 'waiting_approval', { name: 'Coder' }))
  b = C.applyAgentEvent(b, ev('b', 1, 'tool_result', { tool: 'Edit', summary: 'x', status: 'done' }))
  b = C.applyAgentEvent(b, ev('b', 2, 'thought', { text: 'y' }))
  ok('world.status.1 only status and error move the status — a late tool_result leaves waiting_approval alone',
    b.status === 'waiting_approval' && b.name === 'Coder', `status=${b.status} name=${b.name}`)
  b = C.applyAgentEvent(b, ev('b', 3, 'error', { message: 'boom' }))
  ok('world.status.2 an error event puts the agent in error', b.status === 'error')

  const valid = [ev('a', 0, 'status', 'working'), ev('a', 1, 'message', { text: 'hi' })]
  const invalid = [null, 'x', ev('', 0, 'status', 'working'), ev('a', NaN, 'thought', {}),
    ev('a', 0, 'status', 'sleeping'), ev('a', 0, 'status', { status: 'working' }), ev('a', 0, 'nope', {}), ev('a', 0, 'thought', null)]
  ok('world.guard.1 isAgentEvent takes the contract and refuses each malformed envelope',
    valid.every(C.isAgentEvent) && invalid.every((e) => !C.isAgentEvent(e)),
    `refused-valid=${valid.filter((e) => !C.isAgentEvent(e)).length} accepted-invalid=${invalid.filter(C.isAgentEvent).length}`)
}

// ── the store ───────────────────────────────────────────────────────────────
{
  let pushed = null
  let subscribes = 0
  const bridge = { world: { onEvents: (l) => { subscribes++; pushed = l; return () => { pushed = null } } } }
  W.connectAgentWorld(bridge)
  W.connectAgentWorld(bridge)
  ok('world.store.1 connectAgentWorld subscribes once however often it is called', subscribes === 1)

  let world = 0
  W.subscribeAgentWorld(() => world++)
  pushed([ev('x', 0, 'status', 'thinking', { name: 'X' }), ev('x', 1, 'thought', { text: 'a' }), { junk: true }, ev('y', 0, 'status', 'idle')])
  const ids1 = W.getAgentIds()
  ok('world.store.2 one batch is one world notify; both agents land and the junk row is dropped',
    world === 1 && ids1.join() === 'x,y' && W.getAgent('x').events.length === 2 && W.getAgent('x').status === 'thinking',
    `notifies=${world} ids=${ids1.join()}`)

  const before = W.getAgent('x')
  pushed([ev('x', 1, 'status', 'error')])
  ok('world.store.3 a replayed batch changes nothing and notifies nobody', world === 1 && W.getAgent('x') === before)

  pushed([ev('x', 2, 'status', 'working')])
  ok('world.store.4 the roster array is the same object until a NEW agent appears (a stable hook snapshot)',
    W.getAgentIds() === ids1 && W.getAgent('x') !== before && W.getAgent('x').status === 'working')
}

// ── the simulator ───────────────────────────────────────────────────────────
{
  // A fake clock: a sorted queue of timers, advanced by hand.
  let now = 0
  let timers = []
  let nextId = 1
  const out = []
  const sim = S.startWorldSimulation({
    emit: (events) => out.push(...events),
    now: () => now,
    setTimeout: (fn, ms) => { const id = nextId++; timers.push({ id, at: now + ms, fn }); return id },
    clearTimeout: (id) => { timers = timers.filter((t) => t.id !== id) },
    random: () => 0.5
  })
  const advance = (ms) => {
    const until = now + ms
    for (;;) {
      timers.sort((p, q) => p.at - q.at || p.id - q.id)
      if (!timers.length || timers[0].at > until) break
      const t = timers.shift()
      now = t.at
      t.fn()
    }
    now = until
  }
  // Two full loops of the longest script.
  const longest = Math.max(...S.SIM_AGENTS.map((a) => a.script.reduce((sum, s) => sum + s.after, 0)))
  advance(longest * 2 + 1)

  const ids = [...new Set(out.map((e) => e.agentId))]
  ok('world.sim.1 every scripted agent emits, and the cast is 3–4 agents',
    ids.length === S.SIM_AGENTS.length && ids.length >= 3 && ids.length <= 4, ids.join())

  ok('world.sim.2 everything emitted passes the store\'s own guard', out.every(C.isAgentEvent),
    `${out.filter((e) => !C.isAgentEvent(e)).length} of ${out.length} refused`)

  const monotonic = ids.every((id) => out.filter((e) => e.agentId === id).every((e, i, all) => i === 0 || e.seq > all[i - 1].seq))
  ok('world.sim.3 seq is strictly increasing per agent, across the loop boundary', monotonic)

  const calls = out.filter((e) => e.type === 'tool_call')
  const results2 = out.filter((e) => e.type === 'tool_result')
  const paired = results2.every((r) => calls.some((c) => c.payload.callId === r.payload.callId && c.ts + r.payload.durationMs === r.ts))
  const unique = new Set(calls.map((c) => c.payload.callId)).size === calls.length
  ok('world.sim.4 every tool_result answers an open tool_call by callId, durationMs is the time that really elapsed, and ids never repeat across loops',
    results2.length > 0 && paired && unique, `calls=${calls.length} results=${results2.length} unique=${unique}`)

  const types = new Set(out.map((e) => e.type))
  const statuses = new Set(out.filter((e) => e.type === 'status').map((e) => e.payload))
  ok('world.sim.5 the session exercises every event type and every status',
    ['status', 'thought', 'tool_call', 'tool_result', 'message', 'error'].every((t) => types.has(t)) &&
    ['working', 'thinking', 'idle', 'waiting_approval'].every((s) => statuses.has(s)) && out.some((e) => e.type === 'error'),
    `types=${[...types].join()} statuses=${[...statuses].join()}`)

  // Fold the whole stream: the idle agent must still be idle, the others must have moved.
  let world = new Map()
  for (const e of out) world.set(e.agentId, C.applyAgentEvent(world.get(e.agentId) ?? C.emptyAgent(e.agentId), e))
  const idle = world.get('sim-idle')
  ok('world.sim.6 the idle agent never leaves idle; every other agent visits a non-idle status',
    out.filter((e) => e.agentId === 'sim-idle' && e.type === 'status').every((e) => e.payload === 'idle') && idle.status === 'idle' &&
    ids.filter((id) => id !== 'sim-idle').every((id) => out.some((e) => e.agentId === id && e.type === 'status' && e.payload !== 'idle')))

  // ── the scene against the stream it was built for ────────────────────────
  // Fold the stream event by event and ask the scene's own rules what each
  // moment means. A behaviour no event in the script can set off is a behaviour
  // nobody has watched, so every one of them must be reachable from it.
  {
    const seen = { effects: new Set(), typing: new Set(), goals: new Set(), lines: new Set(), tool: new Set() }
    const fold = new Map()
    for (const e of out) {
      const rec = C.applyAgentEvent(fold.get(e.agentId) ?? C.emptyAgent(e.agentId), e)
      fold.set(e.agentId, rec)
      const fx = Z.effectOf(e)
      if (fx) seen.effects.add(fx)
      if (e.agentId === 'sim-coder') seen.typing.add(Z.isTyping(rec, e.ts))
      seen.goals.add(Z.goalOf(rec.status, false))
      const line = Z.cardLine(rec)
      seen.lines.add(line.kind)
      if (line.kind === 'tool') seen.tool.add(line.state)
    }
    ok('world.scene.sim-fit.1 the scripted session sets off every behaviour the scene has: a tilt, a wave and a hit; typing and not typing; a walk to the table and back; and every card line, a tool running, done and failed',
      ['tilt', 'wave', 'hit'].every((x) => seen.effects.has(x)) && seen.typing.has(true) && seen.typing.has(false) &&
        seen.goals.has('table') && seen.goals.has('home') &&
        ['thought', 'tool', 'message', 'error'].every((k) => seen.lines.has(k)) && ['running', 'done', 'failed'].every((k) => seen.tool.has(k)),
      JSON.stringify({ effects: [...seen.effects], typing: [...seen.typing], goals: [...seen.goals], lines: [...seen.lines], tool: [...seen.tool] }))
  }

  sim.stop()
  const count = out.length
  advance(longest * 2)
  ok('world.sim.7 stop() clears every timer — nothing is emitted after it', out.length === count && timers.length === 0,
    `after=${out.length - count} pending=${timers.length}`)
}

// ── the scene's decisions (world-scene.ts) ───────────────────────────────────
{
  const people = (...ids) => ids.map((id) => ({ agentId: id, name: id }))
  const angleOf = (p) => Math.atan2(p.x, -p.z)
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)

  // Desks: in roster order round the arc, never overlapping, at any head count.
  let desksOk = true
  let detail = ''
  for (let n = 1; n <= 12; n++) {
    const plan = Z.stationPlan(people(...Array.from({ length: n }, (_, i) => `w${i}`)))
    const desks = [...plan.stations.values()].map((st) => st.desk)
    const angles = desks.map(angleOf)
    const ordered = angles.every((a, i) => i === 0 || a > angles[i - 1])
    // 2.0: a desk is 1.7 wide, so closer than that is one desk through another.
    const apart = desks.every((d, i) => desks.every((o, j) => i === j || dist(d, o) >= 2.0))
    if (!ordered || !apart || desks.length !== n) { desksOk = false; detail = `n=${n} ordered=${ordered} apart=${apart}` }
  }
  ok('world.scene.desks.1 for 1–12 agents the desks run round the arc in roster order and never overlap — the arc widens past its cap rather than the desks crowd', desksOk, detail)

  const a = Z.stationPlan(people('a', 'b', 'c', 'd'))
  const b = Z.stationPlan(people('a', 'b', 'c', 'd'))
  ok('world.scene.desks.2 the same roster is always the same room (the loose arc is a function of the index, not of chance)',
    JSON.stringify([...a.stations]) === JSON.stringify([...b.stations]))

  // Seats: in front of the worker's own desk, on the standing ring, clear of the head.
  const seats = [...Z.stationPlan(people(...Array.from({ length: 9 }, (_, i) => `w${i}`))).stations.values()].map((st) => st.seat)
  ok('world.scene.seats.1 every worker\'s table spot is on the standing ring, in desk order, and never on the conductor\'s head spot',
    seats.every((p) => Math.abs(Math.hypot(p.x, p.z) - Z.TABLE.seatRadius) < 1e-9) &&
      seats.every((p, i) => i === 0 || angleOf(p) >= angleOf(seats[i - 1]) - 1e-9) &&
      seats.every((p) => Math.abs(angleOf(p)) >= Z.HEAD_CLEARANCE - 1e-9),
    JSON.stringify(seats.map((p) => +angleOf(p).toFixed(2))))

  // The conductor: found by name or id, owns no desk, stands at the head, takes no worker's slot.
  const withC = Z.stationPlan(people('a', 'sim-conductor', 'b'))
  const cs = withC.stations.get('sim-conductor')
  const without = Z.stationPlan(people('a', 'b'))
  ok('world.scene.conductor.1 a conductor is found by id or name, has no desk, stands at the head of the table facing the room, and leaves the workers\' desks exactly where they were',
    withC.conductorId === 'sim-conductor' && cs.conductor && cs.desk === undefined && cs.home === undefined &&
      Math.abs(cs.seat.x) < 1e-9 && Math.abs(cs.seat.z + Z.TABLE.seatRadius) < 1e-9 && cs.seat.facing === 0 &&
      JSON.stringify(withC.stations.get('a').desk) === JSON.stringify(without.stations.get('a').desk) &&
      JSON.stringify(withC.stations.get('b').desk) === JSON.stringify(without.stations.get('b').desk) &&
      withC.stations.get('b').index === 2)
  ok('world.scene.conductor.2 the word must stand alone — "Orchestrator", "conductor-1" and a display name count; "semiconductor", "Coder" and "reconductor" do not; only the first one leads',
    Z.isConductor({ agentId: 'x', name: 'Orchestrator' }) && Z.isConductor({ agentId: 'conductor-1', name: 'x' }) &&
      Z.isConductor({ agentId: 'x', name: 'The Conductor' }) &&
      !Z.isConductor({ agentId: 'semiconductor', name: 'semiconductor' }) && !Z.isConductor({ agentId: 'sim-coder', name: 'Coder' }) &&
      !Z.isConductor({ agentId: 'reconductor', name: 'reconductor' }) &&
      Z.stationPlan(people('conductor-a', 'conductor-b')).conductorId === 'conductor-a' &&
      Z.stationPlan(people('conductor-a', 'conductor-b')).stations.get('conductor-b').desk !== undefined)

  // Where an agent is, and what an event sets off.
  ok('world.scene.goal.1 a worker goes to the table only while it is waiting on a person, and the conductor lives there',
    Z.goalOf('waiting_approval', false) === 'table' && Z.goalOf('working', false) === 'home' && Z.goalOf('idle', false) === 'home' &&
      Z.goalOf('error', false) === 'home' && Z.goalOf('idle', true) === 'table' && Z.goalOf('working', true) === 'table')
  const E = (type, payload, extra = {}) => ({ agentId: 'z', seq: 1, ts: 1000, type, payload, ...extra })
  const tool = (status, extra = {}) => ({ tool: 'Bash', summary: 'npm test', status, ...extra })
  ok('world.scene.effect.1 a thought tilts, a message waves, an error or a FAILED tool flinches; a started or finished tool and a status change are states, not blips',
    Z.effectOf(E('thought', { text: 't' })) === 'tilt' && Z.effectOf(E('message', { text: 'm' })) === 'wave' &&
      Z.effectOf(E('error', { message: 'x' })) === 'hit' && Z.effectOf(E('tool_result', tool('failed'))) === 'hit' &&
      Z.effectOf(E('tool_result', tool('done'))) === null && Z.effectOf(E('tool_call', tool('started'))) === null &&
      Z.effectOf(E('status', 'working')) === null)

  const rec = (status, events) => ({ status, events })
  const open = E('tool_call', tool('started', { callId: 'c1' }), { seq: 1, ts: 1000 })
  const closed = E('tool_result', tool('done', { callId: 'c1' }), { seq: 2, ts: 1500 })
  const anonOpen = E('tool_call', tool('started'), { seq: 3, ts: 2000 })
  const anonClosed = E('tool_result', tool('done'), { seq: 4, ts: 2200 })
  ok('world.scene.typing.1 an agent types while a tool call is open and it is working — and stops when the call is answered (by id, or the latest open one without ids), when it is not working, or when the call has gone stale',
    Z.isTyping(rec('working', [open]), 2000) === true && Z.isTyping(rec('working', [open, closed]), 2000) === false &&
      Z.isTyping(rec('working', [anonOpen]), 2500) === true && Z.isTyping(rec('working', [anonOpen, anonClosed]), 2500) === false &&
      Z.isTyping(rec('waiting_approval', [open]), 2000) === false && Z.isTyping(rec('thinking', [open]), 2000) === false &&
      Z.isTyping(rec('working', [open]), 1000 + Z.TYPING_STALE_MS + 1) === false && Z.isTyping(rec('working', []), 2000) === false)

  const line = (events) => Z.cardLine({ events })
  ok('world.scene.card.1 the card shows the LATEST of thought, tool, message and error, skips status, and marks a tool running, done or failed',
    line([]).kind === 'none' && line([E('status', 'working')]).kind === 'none' &&
      line([E('tool_call', tool('started')), E('thought', { text: 'hmm' }), E('status', 'idle')]).kind === 'thought' &&
      line([E('thought', { text: 'hmm' }), E('tool_call', tool('started'))]).state === 'running' &&
      line([E('tool_call', tool('started')), E('tool_result', tool('done', { detail: '42 passed' }))]).state === 'done' &&
      line([E('tool_call', tool('started')), E('tool_result', tool('done', { detail: '42 passed' }))]).detail === '42 passed' &&
      line([E('tool_result', tool('failed'))]).state === 'failed' &&
      line([E('tool_call', tool('started', { detail: 'hidden while running' }))]).detail === undefined &&
      line([E('thought', { text: 'x' }), E('message', { text: 'done' })]).kind === 'message' &&
      line([E('message', { text: 'x' }), E('error', { message: 'boom' })]).text === 'boom')

  ok('world.scene.word.1 the card says the app\'s own word where the app has one — working, idle, needs you — read from panel-state, and its own thinking and error for the two it has not',
    Z.statusWord('working') === 'working' && Z.statusWord('idle') === 'idle' && Z.statusWord('waiting_approval') === 'needs you' &&
      Z.statusWord('thinking') === 'thinking' && Z.statusWord('error') === 'error',
    ['working', 'idle', 'waiting_approval', 'thinking', 'error'].map(Z.statusWord).join())

  const tints = ['sim-coder', 'sim-researcher', 'sim-tester', 'sim-idle'].map(Z.agentTint)
  ok('world.scene.tint.1 a robot is the colour the 2D canvas paints that id (colorOf), as a hex the model can take, and the simulated four are four different colours',
    tints.every((t, i) => t === P.colorOf(['sim-coder', 'sim-researcher', 'sim-tester', 'sim-idle'][i]) && /^#[0-9a-f]{6}$/.test(t)) && new Set(tints).size === 4,
    tints.join())
}

// ── the doors and the silent traps ───────────────────────────────────────────
{
  const dir = join(root, 'src/renderer/world')
  const read = (f) => readFileSync(join(dir, f), 'utf8')
  const files = readdirSync(dir).filter((f) => /\.tsx?$/.test(f))
  const THREE_DOOR = /from '(?:three|@react-three\/fiber|@react-three\/drei)(?:\/[^']*)?'/
  const importers = files.filter((f) => THREE_DOOR.test(read(f))).sort()
  const SCENE = ['WorldCard.tsx', 'WorldOffice.tsx', 'WorldRobot.tsx', 'WorldView.tsx']
  ok('world.door.1 three, fiber and drei are imported by exactly the four scene files — never by the pure modules, the roster hook, the palette, the store or the route (a fifth importer is how three.js reaches the first chunk)',
    importers.join() === SCENE.join(), importers.join())

  const { execFileSync } = require('node:child_process')
  const grep = (args) => { try { return execFileSync('grep', args, { encoding: 'utf8' }).trim().split('\n').filter(Boolean) } catch { return [] } }
  const outside = grep(['-rnE', "from '(\\./|(@renderer/)?world/)?(\\./)?World(View|Office|Robot|Card)'", join(root, 'src')])
    .filter((l) => !/import type \{/.test(l))
  const route = read('WorldRoute.tsx')
  const app = readFileSync(join(root, 'src/renderer/App.tsx'), 'utf8')
  ok('world.door.2 WorldView is reached only through a pure-annotated lazy() in WorldRoute, and App mounts the route only under import.meta.env.DEV — a static import, or a missing annotation, ships three.js (or a route nobody can reach) in production with no error',
    /\/\* @__PURE__ \*\/ lazy\(async \(\) => \(\{ default: \(await import\('\.\/WorldView'\)\)\.WorldView \}\)\)/.test(route) &&
      outside.every((l) => /\/world\/World(Office|Robot|Card|View)\.tsx:\d+:/.test(l) && /from '\.\/World(Office|Robot|Card)'/.test(l)) &&
      /import\.meta\.env\.DEV \? <WorldRoute \/> : null/.test(app) && !/from '\.\/WorldView'/.test(route))

  const scenery = SCENE.concat('WorldRoute.tsx', 'world-scene.ts', 'world-roster.ts', 'world-palette.ts')
  const leaks = scenery.filter((f) => /window\.canvas|WebSocket|ipcRenderer|\.onEvents\(/.test(read(f)))
  ok('world.door.3 the scene reads ONLY the event store — no bridge, no socket, no subscription of its own in any file under world/ but the store itself', leaks.length === 0, leaks.join())

  const robot = read('WorldRobot.tsx')
  const uses = [...robot.matchAll(/useGLTF(?:\.preload)?\(([^)]*)\)/g)].map((m) => m[1])
  ok('world.door.4 every useGLTF and preload turns BOTH decoders off — Draco\'s default path is a CDN the CSP refuses, Meshopt\'s default instantiates WebAssembly that script-src \'self\' refuses as an unhandled rejection at load',
    uses.length >= 4 && uses.every((u) => /\.\.\.PLAIN/.test(u)) && /const PLAIN = \[false, false\] as const/.test(robot) &&
      // drei's <Environment> fetches an HDR from a CDN by default, which the same CSP refuses.
      ![...files.flatMap((f) => [...read(f).matchAll(/import \{([^}]*)\} from '@react-three\/drei'/g)].map((m) => m[1]))].some((names) => /\bEnvironment\b/.test(names)),
    uses.join(' | '))

  ok('world.door.5 every Html card mounts in a card layer of our own (portal=) — without it drei re-targets the card when R3F connects events and React 19 empties the first card\'s root',
    /<Html [^>]*portal=\{/.test(read('WorldCard.tsx')) && /className="world-view__cards" ref=\{cards\}/.test(read('WorldView.tsx')))

  const i1 = robot.indexOf('quaternion.copy(rig.base[i]!)')
  const i2 = robot.indexOf('rig.mixer.update(dt)')
  const i3 = robot.indexOf('rig.base[i]!.copy(rig.overlay[i]!.quaternion)')
  ok('world.door.6 the bone overlay is undone before the mixer runs and re-captured after it, and bones are found by isBone — the mixer writes only CHANGED values, so a per-frame rotateX on a constant track compounds until the robot tumbles; "Head" is also a mesh',
    i1 > 0 && i1 < i2 && i2 < i3 && /isBone/.test(robot))

  ok('world.door.7 the route is the hash #/world and main\'s TC_WORLD=1 opens that same hash, under the dev server only',
    /const WORLD_HASH = '#\/world'/.test(route) &&
      /process\.env\['TC_WORLD'\] === '1' \? `\$\{devServerUrl\}#\/world` : devServerUrl/.test(readFileSync(join(root, 'src/main/bootstrap/window.ts'), 'utf8')))

  const styles = readFileSync(join(root, 'src/renderer/styles.css'), 'utf8')
  ok('world.door.8 the classes the scene paints with exist in the stylesheet',
    ['world-route', 'world-view', 'world-view__cards', 'world-card', 'world-card__line', 'world-route__close'].every((c) => new RegExp(`\\.${c}\\b`).test(styles)))

  // The model names are string literals in the scene; a re-download that renamed
  // a clip would leave a robot in its bind pose with nothing logged.
  // Each model is named by its exact path, as a literal: `npm run affected`
  // reads a literal as "this suite depends on that file", and a bare directory
  // would not count a changed .glb (a binary is not a text read).
  const NEED = {
    'src/renderer/public/models/quaternius-platformer/Character.glb': { clips: ['Idle', 'Walk', 'Wave', 'HitReact', 'Idle_Gun', 'Walk_Gun'], nodes: ['Head', 'Torso', 'UpperArm.L', 'UpperArm.R', 'LowerArm.L', 'LowerArm.R'], materials: ['Main', 'Main2', 'Main_Light'] },
    'src/renderer/public/models/quaternius-platformer/Character_Gun.glb': { clips: ['Idle', 'Walk', 'Wave', 'HitReact', 'Idle_Gun', 'Walk_Gun'], nodes: ['Head', 'Torso', 'UpperArm.L', 'UpperArm.R', 'LowerArm.L', 'LowerArm.R'], materials: ['Main', 'Main2', 'Main_Light'] },
    'src/renderer/public/models/quaternius-platformer/Bee.glb': { clips: ['Flying'], nodes: [], materials: [] }
  }
  const glb = (path) => {
    const buf = readFileSync(join(root, path))
    const jsonLen = buf.readUInt32LE(12)
    return JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'))
  }
  const missing = []
  for (const [file, want] of Object.entries(NEED)) {
    if (!existsSync(join(root, file))) { missing.push(`${file} (absent)`); continue }
    const j = glb(file)
    const have = { clips: j.animations.map((x) => x.name), nodes: j.nodes.map((x) => x.name), materials: j.materials.map((x) => x.name) }
    for (const kind of ['clips', 'nodes', 'materials']) for (const n of want[kind]) if (!have[kind].includes(n)) missing.push(`${file} ${kind} ${n}`)
  }
  const literals = ['Idle', 'Idle_Gun', 'Walk_Gun', 'HitReact', 'Wave', 'Flying', 'Main', 'Main2', 'Main_Light', 'Head', 'Torso', 'UpperArm.L', 'LowerArm.R']
  const unnamed = literals.filter((n) => !robot.includes(`'${n}'`))
  ok('world.assets.1 every clip, bone and material the robot code names by string exists in the vendored models, and the code still names them', missing.length === 0 && unnamed.length === 0, JSON.stringify({ missing, unnamed }))
}

const failures = results.filter((r) => !r.pass)
console.log(`\n${results.length - failures.length}/${results.length} checks passed`)
process.exitCode = failures.length ? 1 : 0
