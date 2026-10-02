/* The world-event contract (shared/world-events.ts), the renderer store that
   folds it (renderer/world/agent-world-store.ts) and the SIMULATE_AGENTS
   script (main/world-sim.ts).
   Run with: npm run verify:world

   Plain node. The simulator runs on a fake clock, so a whole loop of every
   agent's script costs no wall time. The store is driven through
   ingestAgentEvents and connectAgentWorld exactly as main.tsx drives it; its
   React hooks are useSyncExternalStore over the same reads, so they are not
   rendered here.

   M413 adds the canvas<->world move (world-transition.ts, pure: one clock, the
   easing, the stagger, the dolly, the card tilt), the toggle store, who gets a
   robot (live statuses only), and the pins for the stage's mount discipline.

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
      "  trans: require('./src/renderer/world/world-transition.ts'),",
      "  toggle: require('./src/renderer/world/world-toggle.ts'),",
      "  presence: require('./src/shared/presence.ts'),",
      "  feed: require('./src/shared/world-feed.ts'),",
      "  perf: require('./src/renderer/world/world-perf.ts'),",
      "  wiring: require('./src/main/world-feed-link.ts'),",
      "  ipc: require('./src/shared/ipc-contract.ts'),",
      "  panelState: require('./src/renderer/panels/panel-state.ts')",
      "}"
    ].join('\n'),
    resolveDir: root, loader: 'js'
  },
  outfile: join(root, 'out/verify/world.cjs'),
  bundle: true, platform: 'node', format: 'cjs', logLevel: 'error', external: ['react', 'electron'],
  alias: { '@shared': join(root, 'src/shared'), '@renderer': join(root, 'src/renderer') }
})
const { contract: C, sim: S, store: W, scene: Z, trans: T, toggle: G, presence: P, feed: F, perf: PF, wiring: WW, ipc: IPCC, panelState: PS } = require('../out/verify/world.cjs')

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
  let connectionPush = null
  let statusAnswer = { state: 'live' }
  const bridge = {
    world: {
      onEvents: (l) => { subscribes++; pushed = l; return () => { pushed = null } },
      onConnection: (l) => { connectionPush = l; return () => { connectionPush = null } },
      status: async () => statusAnswer,
      retry: async () => ({ state: 'live' })
    }
  }
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
    const seen = { effects: new Set(), typing: new Set(), goals: new Set(), titled: false, hops: false, tool: new Set(), badges: new Set() }
    const fold = new Map()
    for (const e of out) {
      const rec = C.applyAgentEvent(fold.get(e.agentId) ?? C.emptyAgent(e.agentId), e)
      fold.set(e.agentId, rec)
      const fx = Z.effectOf(e)
      if (fx) seen.effects.add(fx)
      if (e.agentId === 'sim-coder') seen.typing.add(Z.isTyping(rec, e.ts))
      seen.goals.add(Z.goalOf(rec.status, false))
      if (Z.hopsOn(e)) seen.hops = true
      if (Z.cardTitle(rec) !== rec.name) seen.titled = true
      for (const l of Z.recentTools(rec)) seen.tool.add(l.state)
      seen.badges.add(Z.cardBadge(rec, e.ts).kind)
    }
    ok('world.scene.sim-fit.1 the scripted session sets off every behaviour the scene has: a tilt, a wave, a hit and a hop; typing and not typing; a walk to the table and back; a card titled by the agent\'s own words; a tool line running, done and failed; and the working, needs-you and stopped badges',
      ['tilt', 'wave', 'hit'].every((x) => seen.effects.has(x)) && seen.hops && seen.typing.has(true) && seen.typing.has(false) &&
        seen.goals.has('table') && seen.goals.has('home') && seen.titled &&
        ['running', 'done', 'failed'].every((k) => seen.tool.has(k)) && ['busy', 'wants-you', 'stopped'].every((k) => seen.badges.has(k)),
      JSON.stringify({ effects: [...seen.effects], typing: [...seen.typing], goals: [...seen.goals], hops: seen.hops, titled: seen.titled, tool: [...seen.tool], badges: [...seen.badges] }))
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

  // M415. The hologram card: a title in the agent's own words, a badge, its last few calls.
  const named = (events) => ({ name: 'Coder', events })
  ok('world.card.title.1 the card\'s title is the agent\'s latest thought or message (there is no task field), skipping tools, statuses and blank text, and its name before it has said anything',
    Z.cardTitle(named([])) === 'Coder' && Z.cardTitle(named([E('status', 'working'), E('tool_call', tool('started'))])) === 'Coder' &&
      Z.cardTitle(named([E('thought', { text: 'Reading the config' }), E('tool_call', tool('started'))])) === 'Reading the config' &&
      Z.cardTitle(named([E('thought', { text: 'a' }), E('message', { text: 'Shipped the fix' })])) === 'Shipped the fix' &&
      Z.cardTitle(named([E('message', { text: 'kept' }), E('thought', { text: '   ' })])) === 'kept')
  const calls = [
    E('tool_call', { tool: 'Read', summary: 'Read src/a.ts', status: 'started', callId: 'a' }, { seq: 1 }),
    E('tool_result', { tool: 'Read', summary: 'Read src/a.ts', status: 'done', callId: 'a' }, { seq: 2 }),
    E('tool_call', { tool: 'Bash', summary: 'npm test', status: 'started', callId: 'b' }, { seq: 3 }),
    E('tool_result', { tool: 'Bash', summary: 'npm test', status: 'failed', callId: 'b' }, { seq: 4 }),
    E('tool_call', { tool: 'Grep', summary: 'Grep TODO', status: 'started', callId: 'c' }, { seq: 5 }),
    E('thought', { text: 'hm' }, { seq: 6 }),
    E('tool_call', { tool: 'Glob', summary: 'Glob', status: 'started' }, { seq: 7 }),
    E('tool_result', { tool: 'Glob', summary: 'Glob', status: 'done' }, { seq: 8 }),
    E('tool_call', { tool: 'Edit', summary: 'Edit src/b.ts', status: 'started', callId: 'e' }, { seq: 9 })
  ]
  const tl = Z.recentTools({ events: calls })
  ok('world.card.tools.1 the card lists the LAST four calls oldest first, one line per call — a result folds into its call (by id, or the latest open call without one), and the tool\'s own name is not repeated in its text',
    tl.length === 4 && tl.map((l) => l.tool).join() === 'Bash,Grep,Glob,Edit' && tl.map((l) => l.state).join() === 'failed,running,done,running' &&
      tl[0].text === 'npm test' && tl[3].text === 'src/b.ts' && tl[2].text === '' && new Set(tl.map((l) => l.key)).size === 4 &&
      Z.recentTools({ events: calls.slice(0, 2) }).map((l) => `${l.tool}:${l.state}:${l.text}`).join() === 'Read:done:src/a.ts' &&
      Z.recentTools({ events: [] }).length === 0, JSON.stringify(tl))
  const badgeOf = (status, events, lastTs, now) => Z.cardBadge({ status, events, lastTs }, now)
  const openCall = E('tool_call', tool('started', { callId: 'q' }), { ts: 1000 })
  const AW = PS.agentWord
  ok('world.card.badge.1 the badge says WORKING (the app\'s word) for a working or thinking agent heard from inside QUIET_MS, QUIET once it has been silent longer with no call open — a long tool run is not silence — and the app\'s own idle and needs-you words',
    badgeOf('working', [], 1000, 1000 + Z.QUIET_MS).kind === 'busy' && badgeOf('working', [], 1000, 1000 + Z.QUIET_MS).word === AW('busy').word &&
      badgeOf('thinking', [], 1000, 2000).kind === 'busy' &&
      badgeOf('working', [], 1000, 1001 + Z.QUIET_MS).kind === 'quiet' && badgeOf('thinking', [], 1000, 1001 + Z.QUIET_MS).word === 'quiet' &&
      badgeOf('working', [openCall], 1000, 1001 + Z.QUIET_MS).kind === 'busy' &&
      badgeOf('working', [openCall], 1000, 1001 + Z.TYPING_STALE_MS).kind === 'quiet' &&
      badgeOf('idle', [], 0, 1e9).kind === 'idle' && badgeOf('idle', [], 0, 1e9).word === AW('idle').word &&
      badgeOf('waiting_approval', [], 0, 1e9).kind === 'wants-you' && badgeOf('waiting_approval', [], 0, 1e9).word === AW('wants-you').word &&
      badgeOf('error', [], 0, 0).kind === 'stopped' && badgeOf('error', [], 0, 0).word === Z.statusWord('error'))
  ok('world.robot.hop.1 a robot hops when a tool call STARTS — not on its result, a thought or a status',
    Z.hopsOn(E('tool_call', tool('started'))) && !Z.hopsOn(E('tool_result', tool('done'))) && !Z.hopsOn(E('tool_result', tool('failed'))) &&
      !Z.hopsOn(E('thought', { text: 't' })) && !Z.hopsOn(E('status', 'working')))
  ok('world.robot.lean.1 a robot leans toward what it is busy with: into the desk while typing (the most), into the step while walking, toward the table while it waits there, back while it thinks, upright otherwise',
    Z.leanOf('working', true, false) > Z.leanOf('working', false, true) && Z.leanOf('working', false, true) > Z.leanOf('waiting_approval', false, false) &&
      Z.leanOf('waiting_approval', false, false) > 0 && Z.leanOf('thinking', false, false) < 0 && Z.leanOf('working', false, false) === 0 &&
      Z.leanOf('idle', false, false) === 0 && Math.abs(Z.leanOf('working', true, false)) < 0.3)

  ok('world.scene.word.1 the card says the app\'s own word where the app has one — working, idle, needs you — read from panel-state, and its own thinking and error for the two it has not',
    Z.statusWord('working') === 'working' && Z.statusWord('idle') === 'idle' && Z.statusWord('waiting_approval') === 'needs you' &&
      Z.statusWord('thinking') === 'thinking' && Z.statusWord('error') === 'error',
    ['working', 'idle', 'waiting_approval', 'thinking', 'error'].map(Z.statusWord).join())

  const tints = ['sim-coder', 'sim-researcher', 'sim-tester', 'sim-idle'].map(Z.agentTint)
  ok('world.scene.tint.1 a robot is the colour the 2D canvas paints that id (colorOf), as a hex the model can take, and the simulated four are four different colours',
    tints.every((t, i) => t === P.colorOf(['sim-coder', 'sim-researcher', 'sim-tester', 'sim-idle'][i]) && /^#[0-9a-f]{6}$/.test(t)) && new Set(tints).size === 4,
    tints.join())
}

// ── who gets a robot, and the move between canvas and world (M413) ───────────
{
  const statuses = ['working', 'thinking', 'idle', 'waiting_approval', 'error']
  ok('world.live.1 only working, thinking and waiting_approval get a robot — idle and error stay on the 2D canvas',
    statuses.filter(Z.isLiveStatus).join() === 'working,thinking,waiting_approval', statuses.filter(Z.isLiveStatus).join())
  const roster = readFileSync(join(root, 'src/renderer/world/world-roster.ts'), 'utf8')
  ok('world.live.2 the scene roster is filtered through isLiveStatus, so a dormant or finished agent has no desk and the plan re-flows without it',
    /isLiveStatus\(record\.status\)/.test(roster) && /\.filter\(/.test(roster))

  const near = (a, b) => Math.abs(a - b) < 1e-9
  ok('world.trans.1 easeInOutCubic is 0 at 0, 1 at 1, 1/2 at 1/2, never leaves 0…1, and only rises',
    T.easeInOutCubic(0) === 0 && T.easeInOutCubic(1) === 1 && near(T.easeInOutCubic(0.5), 0.5) && T.easeInOutCubic(-3) === 0 && T.easeInOutCubic(9) === 1 &&
      Array.from({ length: 100 }, (_, i) => T.easeInOutCubic((i + 1) / 100) >= T.easeInOutCubic(i / 100)).every(Boolean))

  const t = T.createWorldTransition(0)
  ok('world.trans.2 the move takes WORLD_TRANSITION_MS, is linear in raw time, settles exactly on its target, and a repeat setTarget changes nothing',
    T.WORLD_TRANSITION_MS === 1000 && (t.setTarget(1, 100), t.setTarget(1, 700), true) &&
      near(t.sample(600).raw, 0.5) && !t.sample(600).settled && t.sample(1100).settled && t.sample(1100).raw === 1 && t.sample(5000).eased === 1,
    JSON.stringify([t.sample(600), t.sample(1100)]))
  const r = T.createWorldTransition(0)
  r.setTarget(1, 0)
  r.setTarget(0, 400)
  ok('world.trans.3 a toggle mid-move reverses from where it is, at the same speed — no jump, and it takes only as long as the way back (0.4 of the move)',
    near(r.sample(400).raw, 0.4) && near(r.sample(600).raw, 0.2) && r.sample(800).settled && r.sample(800).raw === 0 && r.sample(800).target === 0,
    JSON.stringify([r.sample(400), r.sample(600), r.sample(800)]))
  const snap = T.createWorldTransition(0, 0)
  snap.setTarget(1, 5)
  ok('world.trans.4 a zero duration snaps (prefers-reduced-motion) and starting on the world is settled on it',
    snap.sample(5).settled && snap.sample(5).raw === 1 && T.createWorldTransition(1).sample(0).settled && T.createWorldTransition(1).sample(0).raw === 1)

  const delays = T.popDelays([6.2, 5.6, 5.9, 5.6])
  ok('world.trans.5 the nearest robot pops first (delay 0), the farthest last (the full stagger), in order of distance — even on a ring where every desk is within 10% of the same radius',
    delays[1] === 0 && delays[3] === 0 && near(delays[0], T.POP_STAGGER) && delays[2] > 0 && delays[2] < delays[0] &&
      T.popDelays([4]).join() === '0' && T.popDelays([3, 3, 3]).join() === '0,0,0' && T.popDelays([]).length === 0, delays.join())
  ok('world.trans.6 a robot is gone at raw 0 and whole at raw 1 whatever its delay, and played backwards the farthest leaves first',
    [0, T.POP_STAGGER / 2, T.POP_STAGGER].every((d) => T.popOf(0, d) === 0 && T.popOf(1, d) === 1) &&
      T.popOf(0.7, 0) > T.popOf(0.7, T.POP_STAGGER) && T.popOf(0.4, T.POP_STAGGER) === 0)

  const rest = { x: 0, y: 8.5, z: 13 }
  const target = { x: 0, y: 0.9, z: 0.4 }
  const far = T.dollyAt(rest, target, 0)
  const end = T.dollyAt(rest, target, 1)
  ok('world.trans.7 the camera opens HIGH and WIDE of its resting pose on the same bearing, and ends exactly on it',
    far.y > rest.y && far.z > rest.z && near(far.x, rest.x) && end.x === 0 && end.y === rest.y && end.z === rest.z &&
      near(far.z - target.z, (rest.z - target.z) * T.DOLLY.out) && near(far.y - target.y, (rest.y - target.y) * T.DOLLY.up))
  ok('world.trans.8 the 2D canvas fades to nothing and settles back SLIGHTLY (never below 0.9), and the card lies back at the start of its robot\'s pop and faces the camera at the end',
    T.hostLook(0).opacity === 1 && T.hostLook(0).scale === 1 && T.hostLook(1).opacity === 0 && T.hostLook(1).scale === T.HOST_SCALE_MIN && T.HOST_SCALE_MIN > 0.9 &&
      T.cardStand(0) === 0 && T.cardStand(0.45) === 0 && T.cardStand(1) === 1 && T.cardTiltDeg(0) === T.CARD_TILT_DEG && T.cardTiltDeg(1) === 0)

  // The toggle store, with no window: the bit, its idempotence, and that the setter is a pure flip.
  let notified = 0
  const unsub = (() => { const l = () => { notified++ }; return typeof G.subscribeForTest === 'function' ? G.subscribeForTest(l) : () => {} })()
  G.setWorldOn(false)
  G.toggleWorld()
  const afterOn = G.isWorldOn()
  G.setWorldOn(true)
  G.toggleWorld()
  ok('world.toggle.1 the toggle bit flips, setting it to what it already is changes nothing, and it starts off outside a #/world window',
    afterOn === true && G.isWorldOn() === false && G.WORLD_HASH === '#/world')
  unsub()
  void notified
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
  const stage = read('WorldStage.tsx')
  const canvasSrc = readFileSync(join(root, 'src/renderer/canvas/Canvas.tsx'), 'utf8')
  ok('world.door.2 WorldView is reached only through a pure-annotated lazy() in WorldStage, and Canvas mounts the stage only under import.meta.env.DEV — a static import, or a missing annotation, ships three.js (or a view nobody can reach) in production with no error',
    /\/\* @__PURE__ \*\/ lazy\(async \(\) => \(\{ default: \(await loadWorldView\(\)\)\.WorldView \}\)\)/.test(stage) &&
      /import\('\.\/WorldView'\)/.test(stage) && !/from '\.\/WorldView'/.test(stage) &&
      outside.every((l) => /\/world\/World(Office|Robot|Card|View)\.tsx:\d+:/.test(l) && /from '\.\/World(Office|Robot|Card)'/.test(l)) &&
      /import\.meta\.env\.DEV \? <WorldStage on=\{worldOn\} hostRef=\{hostRef\} \/> : null/.test(canvasSrc))

  const scenery = SCENE.concat('WorldStage.tsx', 'world-toggle.ts', 'world-transition.ts', 'world-scene.ts', 'world-roster.ts', 'world-palette.ts', 'world-perf.ts')
  const leaks = scenery.filter((f) => /window\.canvas|WebSocket|ipcRenderer|\.onEvents\(/.test(read(f)))
  ok('world.door.3 the scene reads ONLY the event store — no bridge, no socket, no subscription of its own in any file under world/ but the store itself', leaks.length === 0, leaks.join())

  const robot = read('WorldRobot.tsx')
  const uses = [...robot.matchAll(/useGLTF(?:\.preload)?\(([^)]*)\)/g)].map((m) => m[1])
  ok('world.door.4 every useGLTF and preload turns BOTH decoders off — Draco\'s default path is a CDN the CSP refuses, Meshopt\'s default instantiates WebAssembly that script-src \'self\' refuses as an unhandled rejection at load',
    uses.length >= 1 && uses.every((u) => /\.\.\.PLAIN/.test(u)) && /const PLAIN = \[false, false\] as const/.test(robot) &&
      // drei's <Environment> fetches an HDR from a CDN by default, which the same CSP refuses.
      ![...files.flatMap((f) => [...read(f).matchAll(/import \{([^}]*)\} from '@react-three\/drei'/g)].map((m) => m[1]))].some((names) => /\bEnvironment\b/.test(names)),
    uses.join(' | '))

  ok('world.door.5 every Html card mounts in a card layer of our own (portal=) — without it drei re-targets the card when R3F connects events and React 19 empties the first card\'s root',
    /<Html [^>]*portal=\{/.test(read('WorldCard.tsx')) && /className="world-view__cards" ref=\{cards\}/.test(read('WorldView.tsx')))

  // M415. The robot is primitives now; its silent traps are the gloss and the shared kit.
  const robotCode = robot.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const bodyFn = robotCode.slice(robotCode.indexOf('function RobotBody('), robotCode.indexOf('function ErrorBug('))
  ok('world.door.6 the robots\' gloss is a RoomEnvironment built in code and prefiltered once per renderer, set on the robot materials and never as scene.environment (it would relight the office); the geometry is ONE shared kit, built outside the robot and never disposed by one, while each robot\'s own shell material is',
    /new RoomEnvironment\(\)/.test(robotCode) && /pmrem\.fromScene\(room/.test(robotCode) && /envs = new WeakMap<THREE\.WebGLRenderer/.test(robotCode) &&
      !files.some((f) => /\.environment\s*=/.test(read(f))) && /let kit: Kit \| null = null/.test(robotCode) &&
      !/new THREE\.\w*Geometry\(/.test(bodyFn) && /conform\(visor, /.test(robotCode) && !/\b(?:kit|k)\.\w+\.dispose\(\)/.test(robotCode) &&
      /useEffect\(\(\) => \(\) => shell\.dispose\(\), \[shell\]\)/.test(bodyFn) && /clearcoat: 1, clearcoatRoughness: 0\.15/.test(robotCode) &&
      /hopsOn\(event\)/.test(bodyFn) && /leanOf\(/.test(bodyFn) && !/AnimationMixer/.test(bodyFn))

  ok('world.door.7 the hash #/world turns the view on, and main\'s TC_WORLD=1 opens that same hash, under the dev server only',
    /export const WORLD_HASH = '#\/world'/.test(read('world-toggle.ts')) &&
      /process\.env\['TC_WORLD'\] === '1' \? `\$\{devServerUrl\}#\/world` : devServerUrl/.test(readFileSync(join(root, 'src/main/bootstrap/window.ts'), 'utf8')))

  const styles = readFileSync(join(root, 'src/renderer/styles.css'), 'utf8')
  ok('world.door.8 the classes the scene paints with exist in the stylesheet',
    ['shell__world', 'canvas--behind-world', 'world-view', 'world-view__cards', 'world-tag', 'world-pill', 'world-dot', 'world-card', 'world-card__title', 'world-card__badge', 'world-card__tools', 'world-route__note', 'shell__world-toggle'].every((c) => new RegExp(`\\.${c}\\b`).test(styles)))

  const topBar = readFileSync(join(root, 'src/renderer/shell/TopBar.tsx'), 'utf8')
  ok('world.door.9 the scene mounts ONLY while the view is on or leaving — the layer is rendered under `on || present` and nowhere else, present drops when the move back settles, and Canvas gates the toggle bit and the top bar\'s button on DEV (a hidden scene keeps a WebGL context drawing for nobody)',
    /if \(!on && !present\) return null/.test(stage) && /if \(s\.target === 0\) setPresent\(false\)/.test(stage) &&
      /const worldOn = useWorldOn\(\) && import\.meta\.env\.DEV/.test(canvasSrc) &&
      /worldView=\{import\.meta\.env\.DEV \? \{/.test(canvasSrc) && /worldView !== undefined && centerView === 'canvas'/.test(topBar))

  ok('world.door.10 the 2D canvas is hidden, never unmounted or collapsed — the host stays rendered, takes a class + inert + aria-hidden from the same bit, and the move writes only opacity/transform/will-change on it and removes each at rest (a layout change refits every xterm and SIGWINCHes each agent; a stray inline style outlives the class)',
    /canvas--behind-world/.test(canvasSrc) && /inert=\{canvasCovered\}/.test(canvasSrc) && /canvasCoveredRef\.current = canvasCovered/.test(canvasSrc) &&
      ['opacity', 'transform', 'will-change'].every((prop) => new RegExp(`host\\.style\\.removeProperty\\('${prop}'\\)`).test(stage)) &&
      !/host\.style\.(width|height|display|visibility|top|left|position)\b/.test(stage) &&
      /\.canvas--behind-world \{ opacity: 0; pointer-events: none; \}/.test(readFileSync(join(root, 'src/renderer/styles.css'), 'utf8')))

  const view = read('WorldView.tsx')
  // Comments explain these very traps by name, so the negative checks read CODE only.
  const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  ok('world.door.11 the orbit controls are off while the camera travels and the rig runs ahead of them (priority -2), and nothing in the scene disposes the renderer itself — R3F frees the context on unmount, and a second dispose kills the live context of a StrictMode remount',
    /c\.enabled = false/.test(view) && /c\.enabled = true/.test(view) && /\}, -2\)/.test(view) &&
      !files.some((f) => /\bgl\.(dispose|forceContextLoss)\(|\.forceContextLoss\(/.test(code(f))))

  ok('world.door.12 the stage, the scene and the 2D host share ONE transition object — the scene takes it as a prop, robots sample it in their frame loop, and no file keeps a progress of its own',
    /<WorldView transition=\{transition\} reduced=\{reduced\} \/>/.test(stage) && /transition\.sample\(/.test(robot) && /transition\.sample\(/.test(view) &&
      !files.some((f) => /\b(?:let|const)\s+progress\b|progress\s*\+=/.test(code(f))))

  // The model names are string literals in the scene; a re-download that renamed
  // a clip would leave a robot in its bind pose with nothing logged.
  // Each model is named by its exact path, as a literal: `npm run affected`
  // reads a literal as "this suite depends on that file", and a bare directory
  // would not count a changed .glb (a binary is not a text read).
  // Since M415 the robots are primitives; Character.glb / Character_Gun.glb are
  // still vendored but nothing loads them.
  const NEED = {
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
  const literals = ['Flying']
  const unnamed = literals.filter((n) => !robot.includes(`'${n}'`))
  ok('world.assets.1 every clip the robot code names by string (the error bee\'s) exists in the vendored model, and the code still names it', missing.length === 0 && unnamed.length === 0, JSON.stringify({ missing, unnamed }))
}

// ── the REAL feed (M414): the agent runtime's own events, folded into the contract ──
{
  const mk = () => {
    const out = []
    let now = 5000
    const feed = F.createWorldFeed({
      emit: (events) => out.push(...events),
      now: () => { now += 10; return now },
      label: (id, hint) => hint === undefined ? `chat-${id}` : `${hint}!`
    })
    return { out, feed }
  }
  const sess = (id, body) => ({ id, ...body })
  const words = (out, agent) => out.filter((e) => e.agentId === agent).map((e) => e.type === 'status' ? `status:${e.payload}` : e.type)

  {
    const { out, feed } = mk()
    feed.session(sess('a', { type: 'status', status: 'starting' }))
    feed.session(sess('a', { type: 'status', status: 'streaming' }))
    feed.session(sess('a', { type: 'block-start', index: 0, block: { type: 'thinking', text: '' } }))
    feed.session(sess('a', { type: 'turn', turn: { id: 'm1', role: 'assistant', at: 1, blocks: [{ type: 'thinking', text: 'Read the session file first.' }] } }))
    feed.session(sess('a', { type: 'block-start', index: 1, block: { type: 'tool_use', id: 't1', name: 'Edit', input: {} } }))
    feed.session(sess('a', { type: 'turn', turn: { id: 'm1', role: 'assistant', at: 1, blocks: [
      { type: 'thinking', text: 'Read the session file first.' },
      { type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: '/Users/me/code/app/src/auth/session.ts' } }] } }))
    feed.session(sess('a', { type: 'turn', turn: { id: 'u1', role: 'user', at: 2, blocks: [{ type: 'tool_result', toolUseId: 't1', content: 'ok', isError: false }] } }))
    feed.session(sess('a', { type: 'turn', turn: { id: 'm2', role: 'assistant', at: 3, blocks: [{ type: 'text', text: 'Normalised expiry to ms.' }] } }))
    feed.session(sess('a', { type: 'status', status: 'ready' }))
    ok('world.feed.1 a chat\'s session is told as the contract tells it: working, thinking, a thought, a tool call and its result, a message, then idle — and a turn re-sent with more blocks speaks only the NEW block (the thought is not said twice)',
      words(out, 'a').join() === 'status:working,status:thinking,thought,status:working,tool_call,tool_result,message,status:idle',
      words(out, 'a').join())
    const call = out.find((e) => e.type === 'tool_call'), res = out.find((e) => e.type === 'tool_result')
    ok('world.feed.2 a tool call is one readable line (…/auth/session.ts, not the arguments) and its result is paired by the call\'s own id, with the time that really elapsed',
      call.payload.summary === 'Edit …/auth/session.ts' && call.payload.callId === 't1' && res.payload.callId === 't1' && res.payload.status === 'done' && res.payload.durationMs > 0 && res.payload.summary === call.payload.summary,
      JSON.stringify([call.payload, res.payload]))
    ok('world.feed.3 everything the feed emits passes the store\'s own guard, and seq strictly increases per agent', out.every(C.isAgentEvent) && out.every((e, i) => i === 0 || e.seq === out[i - 1].seq + 1),
      out.map((e) => e.seq).join())
    ok('world.feed.4 a name is carried on every event (the label for the chat), so the card never reads as a bare id', out.every((e) => e.name === 'chat-a'))
  }

  {
    const { out, feed } = mk()
    feed.session(sess('p', { type: 'status', status: 'streaming' }))
    feed.session(sess('p', { type: 'permission-request', requestId: 'r1', toolName: 'Bash', input: { command: 'rm -rf x' } }))
    feed.session(sess('p', { type: 'status', status: 'streaming' }))
    feed.session(sess('p', { type: 'block-start', index: 0, block: { type: 'text', text: '' } }))
    const mid = words(out, 'p').join()
    feed.session(sess('p', { type: 'permission-answered', requestId: 'r1', allow: true }))
    ok('world.feed.5 a pending permission outranks everything: waiting_approval with a card line, and neither a streaming status nor a new block flips it back to working until it is ANSWERED',
      mid === 'status:working,status:waiting_approval,message' && words(out, 'p').join() === `${mid},status:working`,
      words(out, 'p').join())
    ok('world.feed.6 the approval says WHAT it waits for (the tool) and nothing of the command, which could carry anything',
      out.find((e) => e.type === 'message').payload.text === 'Needs your approval: Bash')
  }

  {
    const { out, feed } = mk()
    feed.session(sess('e', { type: 'status', status: 'streaming' }))
    feed.session(sess('e', { type: 'result', ok: false, subtype: 'error_during_execution', error: 'API Error: 529 overloaded', interrupted: false }))
    const failed = out.at(-1)
    feed.session(sess('e', { type: 'result', ok: false, subtype: 'interrupted', interrupted: true }))
    feed.session(sess('e', { type: 'status', status: 'exited', exitCode: 3 }))
    feed.session(sess('e', { type: 'status', status: 'disposed' }))
    feed.session(sess('e', { type: 'status', status: 'starting' }))
    ok('world.feed.7 a failed turn is an error (with its reason), an interrupt is not, a non-zero exit is an error, a clean one is idle, and a disposed agent goes idle — and seq keeps climbing past the dispose, or the store would drop its next life',
      failed.type === 'error' && failed.payload.message === 'API Error: 529 overloaded' &&
        words(out, 'e').join() === 'status:working,error,error,status:idle,status:working' &&
        out.every((x, i) => i === 0 || x.seq === out[i - 1].seq + 1),
      words(out, 'e').join())
  }

  {
    const { out, feed } = mk()
    const token = 'ghp_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'
    feed.session(sess('s', { type: 'turn', turn: { id: 'm', role: 'assistant', at: 1, blocks: [
      { type: 'tool_use', id: 'c1', name: 'Bash', input: { command: `curl -H "Authorization: token ${token}" https://api.github.com/user` } },
      { type: 'thinking', text: 'x'.repeat(262) + ' ' + token + ' tail' },
      { type: 'text', text: `The key is ${token}` }] } }))
    feed.session(sess('s', { type: 'turn', turn: { id: 'u', role: 'user', at: 2, blocks: [{ type: 'tool_result', toolUseId: 'c1', content: `401 bad credentials for ${token}\nsecond line`, isError: true }] } }))
    const all = JSON.stringify(out)
    ok('world.feed.8 a token never reaches a card: scrubbed in a summary, a thought, a message and a failure\'s detail — and BEFORE the clip, so one cut in half by the clip cannot slip the pattern',
      !/ghp_/.test(all) && /redacted github token/.test(all), all.slice(0, 400))
    const res = out.find((e) => e.type === 'tool_result')
    ok('world.feed.9 a failure says why (its first line, clipped); a success says nothing of its content',
      res.payload.status === 'failed' && res.payload.detail.startsWith('401 bad credentials') && !/second line/.test(res.payload.detail))
    const { out: o2, feed: f2 } = mk()
    f2.session(sess('q', { type: 'turn', turn: { id: 'm', role: 'assistant', at: 1, blocks: [{ type: 'tool_use', id: 'c', name: 'Read', input: { file_path: '/a/b' } }] } }))
    f2.session(sess('q', { type: 'turn', turn: { id: 'u', role: 'user', at: 2, blocks: [{ type: 'tool_result', toolUseId: 'c', content: 'SECRET FILE BODY', isError: false }, { type: 'text', text: 'a person typed this' }] } }))
    ok('world.feed.10 a user\'s own words and a successful result\'s body never ride the feed', !/SECRET|person typed/.test(JSON.stringify(o2)) && o2.at(-1).payload.detail === undefined)
    const summaries = [
      ['Bash', { command: 'npm test -- auth\nmore' }, 'npm test -- auth more'],
      ['Grep', { pattern: 'refreshToken\\(' }, 'Search "refreshToken\\("'],
      ['WebFetch', { url: 'https://datatracker.ietf.org/doc/rfc9700/?x=1' }, 'Fetch datatracker.ietf.org'],
      ['Glob', { pattern: 'src/**/*.ts' }, 'Find src/**/*.ts'],
      ['mcp__x__y', { anything: 1 }, 'mcp__x__y'],
      ['Edit', {}, 'Edit']
    ]
    ok('world.feed.11 each tool is one line a person reads; a tool this does not know is its bare name, never a guess at its input',
      summaries.every(([name, input, want]) => F.toolSummary(name, input) === want), summaries.map(([n, i]) => F.toolSummary(n, i)).join(' | '))
  }

  {
    const { out, feed } = mk()
    feed.terminal({ panelId: 'T', state: 'busy' }, undefined)
    feed.terminal({ panelId: 'T', state: 'busy' }, 'claude-code')
    feed.terminal({ panelId: 'T', state: 'busy' }, 'claude-code')
    feed.terminal({ panelId: 'T', state: 'wants-you' }, 'claude-code')
    feed.terminal({ panelId: 'T', state: 'starting' }, 'claude-code')
    ok('world.feed.12 a terminal agent speaks status only — a plain shell (no agent kind) is not an agent and says nothing, a repeat changes nothing, needs-you is waiting_approval, and a CLI still booting is not live yet',
      words(out, 'T').join() === 'status:working,status:waiting_approval,status:idle' && out.every((e) => e.name === 'claude-code!'), words(out, 'T').join())
    const before = out.length
    feed.resend()
    ok('world.feed.13 resend() says every known agent\'s status again with a NEW seq (a view that just loaded is not an empty room)',
      out.length === before + 1 && out.at(-1).payload === 'idle' && out.at(-1).seq === out[before - 1].seq + 1)
    const store = [] ; const f3 = F.createWorldFeed({ emit: (e) => store.push(...e), now: () => 1, label: (id) => id, seqStart: 1_000_000 })
    f3.terminal({ panelId: 'T', state: 'busy' }, 'codex')
    ok('world.feed.14 a rebuilt feed can start its counters above the one it replaces (seqStart), the thing that lets the store hear a retry', store[0].seq === 1_000_000)
  }

  // End to end through the REAL store and the REAL liveness rule: what the room shows.
  {
    const { out, feed } = mk()
    feed.session(sess('live1', { type: 'status', status: 'streaming' }))
    feed.session(sess('live2', { type: 'status', status: 'streaming' }))
    feed.session(sess('live2', { type: 'status', status: 'ready' }))
    W.ingestAgentEvents(out)
    const live = ['live1', 'live2'].filter((id) => Z.isLiveStatus(W.getAgent(id).status))
    ok('world.feed.15 through the real store, one agent working and one idle is one robot in the room', live.join() === 'live1')
  }
}

// ── the link: main's send, its failure, and the retry ─────────────────────────
{
  const sent = []
  let loaded = true
  let throwOnEvents = false
  const reloadListeners = []
  const wc = {
    send: (channel, payload) => { if (channel === IPCC.IPC_EVENTS.WORLD_EVENTS && throwOnEvents) throw new Error('webContents destroyed'); sent.push({ channel, payload }) },
    on: (event, l) => { reloadListeners.push(l) }
  }
  let sessions = [{ id: 'k', status: 'streaming' }]
  let terminals = 0
  const link = WW.createWorldFeedLink({
    ready: () => loaded ? wc : null,
    live: () => wc,
    cwdOf: (id) => id === 'k' ? '/Users/me/work/api/' : undefined,
    sessions: () => sessions
  }, () => { terminals++ })
  const events = () => sent.filter((s) => s.channel === IPCC.IPC_EVENTS.WORLD_EVENTS).flatMap((s) => s.payload)
  link.session({ id: 'k', type: 'status', status: 'streaming' })
  ok('world.link.1 an event reaches the renderer on WORLD_EVENTS under the chat\'s folder name', events().length === 1 && events()[0].name === 'api' && link.status().state === 'live', JSON.stringify(events()))
  loaded = false
  link.session({ id: 'k', type: 'status', status: 'ready' })
  loaded = true
  ok('world.link.2 a send while the page is still loading is dropped without failing the link (it is not an error; the resend on load is how a reload catches up)', events().length === 1 && link.status().state === 'live')
  reloadListeners[0]()
  ok('world.link.3 the page finishing a load re-announces every agent\'s status', events().length === 2 && events().at(-1).payload === 'idle')

  const last = Math.max(...events().map((e) => e.seq))
  W.ingestAgentEvents(events())
  throwOnEvents = true
  link.session({ id: 'k', type: 'status', status: 'streaming' })
  const lost = link.status()
  const pushed = sent.filter((s) => s.channel === IPCC.IPC_EVENTS.WORLD_CONNECTION)
  ok('world.link.4 a feed that throws becomes a LOST connection with its reason, pushed once to the renderer — and never throws back at the agent runtime that called it',
    lost.state === 'lost' && lost.reason === 'webContents destroyed' && pushed.length === 1 && pushed[0].payload.state === 'lost')
  throwOnEvents = false
  const n = events().length
  link.session({ id: 'k', type: 'status', status: 'ready' })
  ok('world.link.5 while lost, nothing more is translated (a half-updated tracker must not keep speaking)', events().length === n)

  sessions = [{ id: 'k', status: 'streaming' }]
  const answer = link.retry()
  const after = events().slice(n)
  W.ingestAgentEvents(after)
  ok('world.link.6 retry rebuilds the feed, answers live, pushes live, asks the runtime and the PTY manager to say their agents again — and the new seqs start ABOVE the old, so the store hears them (the room is not frozen under a live banner)',
    answer.state === 'live' && link.status().state === 'live' && sent.at(-1).channel !== undefined && terminals === 1 &&
      after.length >= 1 && after.every((e) => e.seq > last) && W.getAgent('k').status === 'working',
    JSON.stringify({ last, after: after.map((e) => e.seq), status: W.getAgent('k').status }))
}

// ── polish and performance (M414) ────────────────────────────────────────────
{
  ok('world.perf.1 the world opens only on a desktop-width window', PF.WORLD_MIN_WIDTH === 900 && PF.worldFits(900) && PF.worldFits(1440) && !PF.worldFits(899) && !PF.worldFits(390))
  ok('world.perf.2 the pixel ratio is clamped into [1, 1.75] whatever the display reports, and a garbage ratio is 1',
    PF.clampDpr(3) === 1.75 && PF.clampDpr(2) === 1.75 && PF.clampDpr(1.25) === 1.25 && PF.clampDpr(0.5) === 1 && PF.clampDpr(NaN) === 1 && PF.clampDpr(-2) === 1)
  {
    const g = PF.createDprGovernor(2)
    const steps = []
    const feed = (fps, n = 1) => { for (let i = 0; i < n; i++) { const r = g.observe(fps); if (r !== null) steps.push(r) } }
    feed(120, 10); feed(30, 2); feed(120)           // two low windows, then a good one: a hitch, not a trend
    ok('world.perf.3 the pixel ratio does not move for a hitch — only for a SUSTAINED low frame rate', steps.length === 0 && g.dpr === 1.75)
    feed(30, 3)
    ok('world.perf.4 three low windows in a row step it down one notch', steps.join() === '1.5' && g.dpr === 1.5)
    feed(30, 30)
    ok('world.perf.5 it only ever steps DOWN (a rule that also stepped up would oscillate) and stops at 1', steps.at(-1) === 1 && g.dpr === 1 && steps.every((x, i) => i === 0 || x < steps[i - 1]), steps.join())
    const g2 = PF.createDprGovernor(1.75); g2.observe(10); g2.observe(10); g2.gap(); const r = g2.observe(10)
    ok('world.perf.6 a stalled window (a hidden app) forgets the streak instead of counting as low', r === null && g2.dpr === 1.75)
  }
  {
    const near = (id, d) => ({ agentId: id, distance: d })
    const ids = Array.from({ length: 10 }, (_, i) => near(`a${i}`, 5 + i))
    const first = PF.cardTiers(ids, new Set())
    ok('world.perf.7 only the nearest CARD_BUDGET agents get a full card; the rest get a dot', PF.CARD_BUDGET === 6 && [...first].sort().join() === 'a0,a1,a2,a3,a4,a5', [...first].join())
    const again = PF.cardTiers(ids, first)
    const nudged = PF.cardTiers([...ids.slice(0, 5), near('a5', 10.5), near('a6', 10)], first, 6)
    ok('world.perf.8 an unchanged ranking returns the SAME set (no re-render), and a challenger barely nearer than an incumbent does not displace it',
      again === first && nudged === first || [...nudged].sort().join() === [...first].sort().join())
    const clearly = PF.cardTiers([...ids.slice(0, 5), near('a5', 12), near('a6', 4)], first, 6)
    ok('world.perf.9 a challenger CLEARLY nearer does take a card, and the displaced agent becomes a dot', clearly.has('a6') && !clearly.has('a5') && clearly.size === 6)
    ok('world.perf.10 fewer agents than the budget all get a card', PF.cardTiers(ids.slice(0, 3), new Set()).size === 3 && PF.cardTiers([], new Set()).size === 0)
  }

  // M415. The card's badge speaks the reference's colours — WORKING green,
  // QUIET red, IDLE grey — not the 2D canvas's tones (where green is IDLE):
  // asked for by name, and a departure from world.tone.1/.2 as M414 had them.
  const styles = readFileSync(join(root, 'src/renderer/styles.css'), 'utf8')
  const card = readFileSync(join(root, 'src/renderer/world/WorldCard.tsx'), 'utf8')
  ok('world.tone.2 the tag, its pill dot and its card badge take ONE hue from data-badge (cardBadge): busy is the world\'s green, quiet and stopped its red, needs-you amber, idle grey — and nothing in the world paints from data-tone any more',
    /data-badge=\{badge\.kind\}/.test(card) && !/data-tone/.test(card) &&
      /\.world-tag\[data-badge="busy"\] \{ --world-badge: var\(--world-go\); \}/.test(styles) &&
      /\.world-tag\[data-badge="quiet"\],\s*\.world-tag\[data-badge="stopped"\] \{ --world-badge: var\(--world-stop\); \}/.test(styles) &&
      /\.world-tag\[data-badge="wants-you"\] \{ --world-badge: var\(--world-wait\); \}/.test(styles) && /\.world-tag \{ --world-badge: var\(--world-rest\); \}/.test(styles) &&
      /\.world-dot \{[^}]*background: var\(--world-badge\)/.test(styles) && /\.world-card__badge \{[^}]*color: var\(--world-badge\)/.test(styles))
  ok('world.card.glass.1 the card is frosted glass: translucent white, a backdrop blur, rounded corners and a hairline; the pill is solid white with a drop shadow; both are DOM in the card layer, the card billboarded (no Html transform mode)',
    /\.world-card \{[^}]*background: var\(--world-holo\)[^}]*\}/.test(styles) && /\.world-card \{[^}]*backdrop-filter: blur\(/.test(styles) &&
      /\.world-card \{[^}]*border-radius: var\(--r-lg\)/.test(styles) && /\.world-card \{[^}]*border: 1px solid/.test(styles) &&
      /\.world-pill \{[^}]*box-shadow: var\(--world-holo-shade\)/.test(styles) && /--world-holo:\s+rgba\(255, 255, 255, \.\d+\)/.test(styles) &&
      !/<Html [^>]*\btransform\b/.test(card) && /className="world-card__title"/.test(card) && /className="world-card__badge"/.test(card) && /recentTools\(record\)/.test(card))

  const dir = join(root, 'src/renderer/world')
  const read = (f) => readFileSync(join(dir, f), 'utf8')
  const stage = read('WorldStage.tsx'), view = read('WorldView.tsx'), robot = read('WorldRobot.tsx'), store = read('agent-world-store.ts')
  ok('world.stage.1 the empty room says one thing: "No live agents. Start one from the canvas." (not a dev flag), whether nothing has ever run or everything is idle',
    /No live agents\. Start one from the canvas\./.test(stage) && /agents === 0 \|\| live === 0/.test(stage) && !/SIMULATE_AGENTS/.test(stage))
  ok('world.stage.2 a lost feed shows its reason and a Retry that goes through the store (no view holds the bridge), disabled while it runs',
    /connection\.state === 'lost'/.test(stage) && /retryAgentWorld\(\)/.test(stage) && /disabled=\{retrying\}/.test(stage) && /role="alert"/.test(stage) &&
      /export async function retryAgentWorld\(\)/.test(store) && /world\.retry\(\)/.test(store) && !/window\.canvas/.test(stage))
  ok('world.stage.3 below the desktop width the stage mounts NO scene (no lazy load, no WebGL context), says why, and offers the way back — live through a resize',
    /fits \? \(/.test(stage) && /worldFits\(window\.innerWidth\)/.test(stage) && /addEventListener\('resize'/.test(stage) && /The world view needs a wider window/.test(stage) &&
      /onClick=\{\(\) => setWorldOn\(false\)\}>Back to canvas/.test(stage) && /<WorldView /.test(stage.slice(stage.indexOf('fits ? ('), stage.indexOf(') : (', stage.indexOf('fits ? (')))))
  ok('world.stage.4 prefers-reduced-motion skips the choreography, live: the move is a 0ms snap, the stagger is dropped and a robot that turns live appears at once',
    /createWorldTransition\(on \? 1 : 0, reduced \? 0 : WORLD_TRANSITION_MS\)/.test(stage) && /matchMedia\('\(prefers-reduced-motion: reduce\)'\)/.test(stage) && /addEventListener\('change'/.test(stage) &&
      /reduced \? 0 : pops\[i\]!/.test(view) && /reducedRef\.current \? 1 : easeInOutCubic/.test(robot))
  ok('world.perf.11 the scene clamps its pixel ratio to [DPR_MIN, DPR_MAX], steps it down by the governor, and ranks cards by the camera four times a second — a far agent wears the pill alone (its dot carries the state) in the same Html element',
    /dpr=\{\[DPR_MIN, DPR_MAX\]\}/.test(view) && /<QualityGovernor \/>/.test(view) && /<CardBudget /.test(view) && /t - last\.current < 0\.25/.test(view) &&
      /compact=\{full !== null && !full\.has\(station\.agentId\)\}/.test(view) && /className="world-dot"/.test(card) && /compact \? null : \(/.test(card) && /const tools = compact \? \[\] : recentTools\(record\)/.test(card))
}

// ── wiring: every hook is a second reader, placed AFTER what it observes ─────
{
  const text = (f) => readFileSync(join(root, f), 'utf8')
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const rt = strip(text('src/main/bootstrap/agent-runtime.ts'))
  const sendAt = rt.indexOf('webContents.send(IPC_EVENTS.AGENT_EVENT, event)'), hookAt = rt.indexOf('state.worldFeed?.session(event)')
  const pty = strip(text('src/main/pty-manager.ts'))
  const ptySend = pty.indexOf('target.send(channel, payload)'), ptyHook = pty.indexOf('this.onAgentState(update, this.sessions.get(update.panelId)?.agent)')
  const idx = strip(text('src/main/index.ts'))
  ok('world.wire.1 the agent runtime hands each event to the feed AFTER the sends it already made — the runtime\'s order and timing are not changed, and the feed is a second reader',
    sendAt > 0 && hookAt > sendAt && /state\.presence\?\.agentEvent\(event\)/.test(rt.slice(0, sendAt)))
  ok('world.wire.2 the PTY manager hands each agent:state to its observer AFTER the send, inside a try/catch that swallows a throw — an agent state is never delayed or lost to the feed',
    ptySend > 0 && ptyHook > ptySend && /try \{ this\.onAgentState/.test(pty) && /catch \{/.test(pty.slice(ptyHook, ptyHook + 200)) &&
      /if \(target && !target\.isDestroyed\(\)\) target\.send\(channel, payload\)/.test(pty))
  ok('world.wire.3 main builds the feed through MainState (read at use), points the PTY observer at it, and registers the status and retry doors',
    /state\.worldFeed = createWorldFeedWiring\(state, \(\) => stores\.ptyManager\.resendStates\(\)\)/.test(idx) &&
      /stores\.ptyManager\.onAgentState = \(update, agent\) => state\.worldFeed\?\.terminal\(update, agent\)/.test(idx) &&
      /status: \(\) => state\.worldFeed\?\.status\(\)/.test(idx) && /ipcMain\.handle\(IPC\.WORLD_RETRY/.test(text('src/main/ipc.ts')) && /ipcMain\.handle\(IPC\.WORLD_STATUS/.test(text('src/main/ipc.ts')))
  ok('world.wire.4 SIMULATE_AGENTS still works beside the real feed — the simulator is untouched and still gated on its own flag in main\'s env',
    /SIMULATE_AGENTS !== 'true'/.test(text('src/main/bootstrap/world-sim-wiring.ts')) && /worldSim = startWorldSimWiring\(state\)/.test(idx))
  ok('world.wire.5 the channels are declared once and carried by the bridge: WORLD_CONNECTION as an event, WORLD_STATUS and WORLD_RETRY as invokes, and the project index lists them',
    IPCC.IPC_EVENTS.WORLD_CONNECTION === 'world:connection' && IPCC.IPC.WORLD_STATUS === 'world:status' && IPCC.IPC.WORLD_RETRY === 'world:retry' &&
      /world:events world:connection world:status world:retry/.test(text('CLAUDE.md')) && /IPC_EVENTS\.WORLD_CONNECTION/.test(text('src/preload/index.ts')) && /IPC\.WORLD_RETRY/.test(text('src/preload/index.ts')))
}

const failures = results.filter((r) => !r.pass)
console.log(`\n${results.length - failures.length}/${results.length} checks passed`)
process.exitCode = failures.length ? 1 : 0
