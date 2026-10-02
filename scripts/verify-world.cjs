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
const THREE_DOOR_RE = /from '(?:three|@react-three\/fiber|@react-three\/drei)(?:\/[^']*)?'/

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
      "  set: require('./src/renderer/world/world-set.ts'),",
      "  palette: require('./src/renderer/world/world-palette.ts'),",
      "  trans: require('./src/renderer/world/world-transition.ts'),",
      "  toggle: require('./src/renderer/world/world-toggle.ts'),",
      "  presence: require('./src/shared/presence.ts'),",
      "  feed: require('./src/shared/world-feed.ts'),",
      "  perf: require('./src/renderer/world/world-perf.ts'),",
      "  bloom: require('./src/renderer/world/world-bloom.ts'),",
      "  wiring: require('./src/main/world-feed-link.ts'),",
      "  ipc: require('./src/shared/ipc-contract.ts'),",
      "  panelState: require('./src/renderer/panels/panel-state.ts'),",
      "  activity: require('./src/renderer/world/world-activity.ts'),",
      "  ctx: require('./src/renderer/world/world-context-store.ts')",
      "}"
    ].join('\n'),
    resolveDir: root, loader: 'js'
  },
  outfile: join(root, 'out/verify/world.cjs'),
  bundle: true, platform: 'node', format: 'cjs', logLevel: 'error', external: ['react', 'electron'],
  alias: { '@shared': join(root, 'src/shared'), '@renderer': join(root, 'src/renderer') }
})
const { contract: C, sim: S, store: W, scene: Z, set: SET, palette: PAL, trans: T, toggle: G, presence: P, feed: F, perf: PF, bloom: BL, wiring: WW, ipc: IPCC, panelState: PS, activity: AC, ctx: CTX } = require('../out/verify/world.cjs')

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

  // world.scene.tint.1 (M412–M416: a robot is colorOf(id), the presence hash) is RETIRED by M417's
  // critic pass: ids that differ by a trailing digit hash to two or three hues (FNV-1a's last multiply
  // keeps the last character's pattern in the low bits that `% 360` reads), and colorOf paints owners
  // on the 2D canvas, never agents, so there was no second view to keep matching. world.critic.hue.* below.
  const demoIds = Array.from({ length: 9 }, (_, i) => `demo-${i}`)
  const hueOf = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (d < 0.2) return null; const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return h * 60 }
  const presenceHues = new Set(demoIds.map((id) => Math.round((hueOf(P.colorOf(id)) ?? 0) / 40)))
  const tints = demoIds.map((id) => Z.agentTint(id, demoIds))
  ok('world.critic.hue.1 the demo roster (demo-0…8, ids one digit apart) is nine DIFFERENT shells — where the presence hash it replaced gives it no more than three hue families — and each is a hex the model can take',
    new Set(tints).size === 9 && tints.every((t) => /^#[0-9a-f]{6}$/.test(t)) && presenceHues.size <= 3, `tints=${tints.join()} presenceFamilies=${presenceHues.size}`)
  const chroma = PAL.ROBOT_TINTS.map(hueOf).filter((h) => h !== null)
  const gap = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d) }
  const neighbours = PAL.ROBOT_TINTS.map((t, i) => [hueOf(t), hueOf(PAL.ROBOT_TINTS[(i + 1) % PAL.ROBOT_TINTS.length])]).filter(([a, b]) => a !== null && b !== null)
  const minPair = Math.min(...chroma.flatMap((a, i) => chroma.slice(i + 1).map((b) => gap(a, b))))
  ok('world.critic.hue.2 the shells are ten, with a white and a graphite among them; every two candy hues stand at least 18° apart and every two NEIGHBOURS in the order at least 60° apart, so consecutive arrivals never read as one colour',
    PAL.ROBOT_TINTS.length === 10 && PAL.ROBOT_TINTS.length - chroma.length === 2 && minPair >= 18 && neighbours.every(([a, b]) => gap(a, b) >= 60),
    `min=${minPair.toFixed(0)} neighbours=${neighbours.map(([a, b]) => gap(a, b).toFixed(0)).join()}`)
  const grown = [...demoIds, 'late-1', 'late-2']
  const withAsk = ['demo-0', 'world:you', 'demo-1']
  ok('world.critic.hue.3 a tint is the agent\'s place in the FIRST-SEEN order, so newcomers never recolour anyone already in the room; the board\'s pseudo-agent takes no place; the eleventh arrival starts the palette again; and an id the order does not know still gets a palette colour, the same one every time',
    demoIds.every((id) => Z.agentTint(id, grown) === Z.agentTint(id, demoIds)) && Z.agentTint('demo-1', withAsk) === Z.agentTint('demo-1', ['demo-0', 'demo-1']) &&
      PAL.ROBOT_TINTS.includes(Z.agentTint('stranger', [])) && Z.agentTint('stranger', []) === Z.agentTint('stranger', ['x']) && Z.agentTint('late-2', grown) === Z.agentTint('demo-0', grown))
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
  const SCENE = ['WorldBloom.tsx', 'WorldCard.tsx', 'WorldOffice.tsx', 'WorldPlatform.tsx', 'WorldProps.tsx', 'WorldRobot.tsx', 'WorldView.tsx', 'world-gloss.ts']
  ok('world.door.1 three, fiber and drei are imported by exactly the eight scene files (M416 added the platform, the props and the shared gloss; M420 the bloom composer) — never by the pure modules, the chrome, the roster hook, the palette, the store or the route (a ninth importer is how three.js reaches the first chunk)',
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

  const scenery = SCENE.concat('WorldStage.tsx', 'world-toggle.ts', 'world-transition.ts', 'world-scene.ts', 'world-roster.ts', 'world-palette.ts', 'world-perf.ts', 'world-activity.ts', 'world-context-store.ts')
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
  const glossCode = read('world-gloss.ts').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const bodyFn = robotCode.slice(robotCode.indexOf('function RobotBody('), robotCode.indexOf('function ErrorBug('))
  ok('world.door.6 the robots\' gloss is a RoomEnvironment built in code and prefiltered once per renderer, set on the robot materials and never as scene.environment (it would relight the office); the geometry is ONE shared kit, built outside the robot and never disposed by one, while each robot\'s own shell material is',
    /new RoomEnvironment\(\)/.test(glossCode) && /pmrem\.fromScene\(room/.test(glossCode) && /envs = new WeakMap<THREE\.WebGLRenderer/.test(glossCode) && /studioEnv\(gl\)/.test(robotCode) &&
      !files.some((f) => /\.environment\s*=/.test(read(f))) && /let kit: Kit \| null = null/.test(robotCode) &&
      !/new THREE\.\w*Geometry\(/.test(bodyFn) && /conform\(visor, /.test(robotCode) && !/\b(?:kit|k)\.\w+\.dispose\(\)/.test(robotCode) &&
      /useEffect\(\(\) => \(\) => shell\.dispose\(\), \[shell\]\)/.test(bodyFn) && /clearcoat: 1, clearcoatRoughness: 0\.15/.test(robotCode) &&
      /hopsOn\(event\)/.test(bodyFn) && /leanOf\(/.test(bodyFn) && !/AnimationMixer/.test(bodyFn))

  ok('world.door.7 the hash #/world turns the view on, and main\'s TC_WORLD=1 opens that same hash, under the dev server only',
    /export const WORLD_HASH = '#\/world'/.test(read('world-toggle.ts')) &&
      /process\.env\['TC_WORLD'\] === '1' \? `\$\{devServerUrl\}#\/world` : devServerUrl/.test(readFileSync(join(root, 'src/main/bootstrap/window.ts'), 'utf8')))

  const styles = readFileSync(join(root, 'src/renderer/styles.css'), 'utf8')
  ok('world.door.8 the classes the scene paints with exist in the stylesheet',
    ['shell__world', 'canvas--behind-world', 'world-view', 'world-view__cards', 'world-tag', 'world-pill', 'world-dot', 'world-card', 'world-card__title', 'world-card__badge', 'world-card__tools', 'world-route__note', 'shell__world-toggle', 'world-chrome', 'world-tools', 'world-ask', 'world-ask__field', 'world-legend', 'world-legend__dot'].every((c) => new RegExp(`\\.${c}\\b`).test(styles)))

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
    // M417: the budget is three (the critic pass — at six the wide shot was more card than room); the
    // hysteresis checks below still run at an explicit six, the shape they were written for.
    const three = PF.cardTiers(ids, new Set())
    ok('world.perf.7 only the nearest CARD_BUDGET (three since M417) agents get a full card; the rest get a dot', PF.CARD_BUDGET === 3 && [...three].sort().join() === 'a0,a1,a2', [...three].join())
    const first = PF.cardTiers(ids, new Set(), 6)
    const again = PF.cardTiers(ids, first, 6)
    const nudged = PF.cardTiers([...ids.slice(0, 5), near('a5', 10.5), near('a6', 10)], first, 6)
    ok('world.perf.8 an unchanged ranking returns the SAME set (no re-render), and a challenger barely nearer than an incumbent does not displace it',
      again === first && nudged === first || [...nudged].sort().join() === [...first].sort().join())
    const clearly = PF.cardTiers([...ids.slice(0, 5), near('a5', 12), near('a6', 4)], first, 6)
    ok('world.perf.9 a challenger CLEARLY nearer does take a card, and the displaced agent becomes a dot', clearly.has('a6') && !clearly.has('a5') && clearly.size === 6)
    ok('world.perf.10 fewer agents than the budget all get a card', PF.cardTiers(ids.slice(0, 2), new Set()).size === 2 && PF.cardTiers([], new Set()).size === 0)
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
      /compact=\{leftAt\.has\(station\.agentId\) \|\| \(full !== null && !full\.has\(station\.agentId\)\)\}/.test(view) && /className="world-dot"/.test(card) && /compact \? null : \(/.test(card) && /const tools = compact \? \[\] : recentTools\(record\)/.test(card))
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

// ── the studio (M416): the platform, the set dressing, the camera, the ask pill, the chrome ──
{
  const text = (f) => readFileSync(join(root, 'src/renderer/world', f), 'utf8')
  const code = (f) => text(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const rosterOf = (n) => Array.from({ length: n }, (_, i) => ({ agentId: `s${i}`, name: `Agent ${i}` }))

  // The platform is big enough for ANY roster: a desk, the robot standing behind it and a table seat all sit inside it with the margin to spare.
  const sizes = [0, 1, 2, 3, 4, 9, 14, 25]
  const fits = sizes.map((n) => {
    const plan = Z.stationPlan(rosterOf(n))
    const half = SET.slabHalf(plan.arcRadius)
    let worst = Infinity
    for (const st of plan.stations.values()) {
      for (const slot of [st.desk, st.home, st.seat]) if (slot) worst = Math.min(worst, half - Math.max(Math.abs(slot.x), Math.abs(slot.z)))
    }
    return { n, half, worst }
  })
  ok('world.set.slab.1 the platform holds every desk, the robot behind it and every table seat, with the margin to spare, for any roster — and it only grows with the ring (a ring wider than its slab walks robots off the edge)',
    fits.every((f) => f.worst >= SET.SLAB.margin - 1e-6) && fits.every((f, i) => i === 0 || f.half >= fits[i - 1].half), JSON.stringify(fits.map((f) => [f.n, +f.half.toFixed(2), +f.worst.toFixed(2)])))

  // The props live in the corners the ring never reaches, at every size.
  const propsClear = sizes.every((n) => {
    const plan = Z.stationPlan(rosterOf(n))
    const half = SET.slabHalf(plan.arcRadius)
    const spots = [SET.boardSpot(half), ...SET.stoolSpots(half)]
    const taken = [...plan.stations.values()].flatMap((st) => [st.desk, st.home].filter(Boolean))
    return spots.every((p) => Math.max(Math.abs(p.x), Math.abs(p.z)) <= half - 0.8 && taken.every((t) => Math.hypot(p.x - t.x, p.z - t.z) > 1.5))
  })
  ok('world.set.props.1 the whiteboard and the four stools stand on the platform and clear of every desk and robot for rosters of 0 to 25 — including the rosters that wrap most of the way round the table — and there are exactly four stools',
    propsClear && SET.stoolSpots(9).length === 4)

  // The trim: a closed rounded-rectangle outline, laid only on the slab's FLAT top, and bands built from it that index real vertices.
  const path = SET.roundedRectPath(5, 4, 1.1)
  const pathOk = path.length > 20 && path.every(([x, z]) => Math.abs(x) <= 5 + 1e-9 && Math.abs(z) <= 4 + 1e-9) &&
    path.every((p, i) => { const q = path[(i + 1) % path.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6 })
  const prof = SET.glowProfile(0.8, 0.2)
  const band = SET.bandBuffers(path, prof.offsets, prof.alphas, 0.01)
  const m = prof.offsets.length
  ok('world.set.trim.1 the trim outline is a closed rounded rectangle (no repeated point — a repeat has no tangent), and its glow band is a strip whose every index names a vertex, one alpha per vertex, alphas in [0,1]',
    pathOk && band.positions.length === path.length * m * 3 && band.alphas.length === path.length * m && band.index.length === path.length * (m - 1) * 6 &&
      Math.max(...band.index) === path.length * m - 1 && band.alphas.every((a) => a >= 0 && a <= 1) && SET.roundedRectPath(1, 1, 5).every(([x, z]) => Math.abs(x) <= 1 && Math.abs(z) <= 1) &&
      // a square whose radius is its half-extent still produces points that are all distinct
      SET.roundedRectPath(1, 1, 1).every((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 1e-6),
    `path ${path.length} band ${band.positions.length / 3}v`)
  ok('world.set.trim.2 the glow reaches further INWARD (the flat top) than outward (the lip), peaks at the line and fades to nothing at both ends — and the whole band stays on the flat part of a RoundedBox top, inset past its corner radius (a band over the curve hangs in the air)',
    prof.offsets[0] === -0.8 && prof.offsets.at(-1) === 0.2 && prof.alphas[0] === 0 && prof.alphas.at(-1) === 0 && prof.offsets.every((o, i) => i === 0 || o > prof.offsets[i - 1]) &&
      Math.max(...prof.alphas) === 1 && prof.alphas[prof.offsets.indexOf(0)] === 1 &&
      SET.TRIM.inset - SET.TRIM.glowOut >= SET.SLAB.radius - 1e-9 && SET.TRIM.inset - SET.TRIM.half >= SET.SLAB.radius && SET.SLAB.radius <= SET.SLAB.thickness / 2 &&
      SET.trimPath(5.8).every(([x, z]) => Math.abs(x) <= SET.slabHalf(5.8) - SET.TRIM.inset + 1e-9 && Math.abs(z) <= SET.slabHalf(5.8) - SET.TRIM.inset + 1e-9))

  // The cubes: seeded, so the same room is the same room; floating clear above the robots, their cards and the zone label.
  const fields = SET.CUBE_CLUSTERS.map((_, i) => SET.cubeField(i))
  const again = SET.CUBE_CLUSTERS.map((_, i) => SET.cubeField(i))
  const lowest = Math.min(...fields.flatMap((f, i) => f.map((c) => SET.clusterCenter(i, 9).y + c.y - c.drift - c.size)))
  ok('world.set.cubes.1 three clusters of cubes, the same every time, each cube a unit-axis spinner with a size in [0.16, 0.36], all floating above the zone label (2.55 + its height) so a drift never puts a cube through a robot or its name',
    fields.length === 3 && JSON.stringify(fields) === JSON.stringify(again) && fields.every((f, i) => f.length === SET.CUBE_CLUSTERS[i].count) &&
      fields.flat().every((c) => c.size >= 0.16 && c.size <= 0.36 && Math.abs(Math.hypot(...c.axis) - 1) < 1e-9 && c.spin > 0) && lowest >= 2.95, `lowest=${lowest.toFixed(2)}`)

  // The camera: a corner view looking down, never under the floor, never straight down, and the buttons only move it along its own line.
  const pose = SET.isoPose(5.8)
  const dist = Math.hypot(pose.x - SET.ORBIT_TARGET.x, pose.y - SET.ORBIT_TARGET.y, pose.z - SET.ORBIT_TARGET.z)
  const polar = Math.acos((pose.y - SET.ORBIT_TARGET.y) / dist)
  const lowestEye = sizes.map((n) => SET.ORBIT_TARGET.y + SET.viewDistance(Z.stationPlan(rosterOf(n)).arcRadius) * Math.cos(SET.VIEW.maxPolar))
  const near = SET.dollyBy(pose, SET.ORBIT_TARGET, 0.5, 4, 100)
  const clamped = [SET.dollyBy(pose, SET.ORBIT_TARGET, 0.0001, 4, 100), SET.dollyBy(pose, SET.ORBIT_TARGET, 1000, 4, 100)]
  const cross = (v) => Math.hypot(v.x - SET.ORBIT_TARGET.x, v.y - SET.ORBIT_TARGET.y, v.z - SET.ORBIT_TARGET.z)
  ok('world.set.cam.1 the opening camera is a corner view at the declared polar angle (inside the limits, well short of the horizon), its lowest orbit stays above the floor for every roster, a dolly step stays on the line to the target and inside [min, max], and a glide eases 0 to 1 monotonically',
    Math.abs(polar - SET.VIEW.polar) < 1e-9 && SET.VIEW.minPolar < SET.VIEW.polar && SET.VIEW.polar < SET.VIEW.maxPolar && SET.VIEW.maxPolar <= Math.PI / 2 - 0.15 &&
      Math.abs(Math.atan2(pose.x, pose.z) - SET.VIEW.azimuth) < 1e-9 && lowestEye.every((y) => y > 0.3) &&
      Math.abs(cross(near) - dist / 2) < 1e-9 && Math.abs(near.y / dist - 0.5 * pose.y / dist) < 1e9 && Math.abs(cross(clamped[0]) - 4) < 1e-9 && Math.abs(cross(clamped[1]) - 100) < 1e-9 &&
      SET.glide(0, 700) === 0 && SET.glide(700, 700) === 1 && SET.glide(900, 700) === 1 && SET.glide(5, 0) === 1 &&
      [0.1, 0.3, 0.5, 0.7, 0.9].every((u, i, a) => i === 0 || SET.glide(u * 700, 700) > SET.glide(a[i - 1] * 700, 700)) && SET.ZOOM_STEP > 0 && SET.ZOOM_STEP < 1,
    `polar=${polar.toFixed(3)} dist=${dist.toFixed(1)}`)

  // "Ask your team": a message from a pseudo-agent in the SAME store, never live, so it has no robot and never moves the roster.
  ok('world.ask.1 a request is trimmed, its whitespace runs one space, cut at ASK_MAX; nothing at all is no request',
    SET.askText('  fix   the\n\tbuild  ') === 'fix the build' && SET.askText('   \n ') === null && SET.askText('') === null && SET.askText('x'.repeat(SET.ASK_MAX + 50)).length === SET.ASK_MAX)
  const before = W.getAgentIds().length
  const okA = W.postTeamAsk('  Audit   the auth paths ', 5000)
  const okB = W.postTeamAsk('second request', 6000)
  const empty = W.postTeamAsk('   ', 7000)
  const rec = W.getAgent(SET.ASK_AGENT_ID)
  const ev0 = SET.askEvent('x', 3, 9)
  ok('world.ask.2 posting writes message events into the event store under ONE pseudo-agent with its own strictly rising seq — the contract accepts them, an empty request writes nothing and spends no seq, and the pseudo-agent is never live so it never gets a robot or a legend entry',
    okA === true && okB === true && empty === false && W.getAgentIds().length === before + 1 && rec !== undefined && rec.events.length === 2 &&
      rec.events[0].seq + 1 === rec.events[1].seq && rec.events.every((e) => e.type === 'message' && e.agentId === SET.ASK_AGENT_ID) && rec.name === SET.ASK_NAME &&
      rec.events[0].payload.text === 'Audit the auth paths' && C.isAgentEvent(ev0) && SET.askEvent('  ', 1, 1) === null &&
      Z.isLiveStatus(rec.status) === false && rec.status === 'idle')
  ok('world.ask.3 the whiteboard says the LATEST request with when it was posted, and before any it says what the board is for',
    SET.boardCard(rec).body === 'second request' && SET.boardCard(rec).stamp === 6000 && SET.boardCard(rec).title === 'Request' &&
      SET.boardCard(undefined).stamp === null && SET.boardCard(undefined).title === 'Board' && SET.boardCard({ events: [] }).stamp === null &&
      SET.boardCard({ events: [{ agentId: 'a', seq: 1, ts: 1, type: 'thought', payload: { text: 'hm' } }] }).stamp === null)

  // The legend: the live agents, in roster order, in the colour their robot wears.
  // M417: the dot is the robot's shell exactly (the palette is candy already; candyHex is gone with
  // the presence hash it corrected), read over the same first-seen order the robots read.
  const legendRoster = rosterOf(11)
  const legendOrder = ['early', ...legendRoster.map((a) => a.agentId)]
  const legend = SET.legendEntries(legendRoster, legendOrder)
  ok('world.legend.1 the legend names the first LEGEND_MAX live agents in roster order, each dot the colour its robot wears (agentTint over the store\'s first-seen order, not the live roster\'s), and says how many more there were',
    legend.shown.length === SET.LEGEND_MAX && legend.more === 3 && legend.shown[0].agentId === 's0' && legend.shown.every((e) => e.color === Z.agentTint(e.agentId, legendOrder)) &&
      legend.shown[0].color === PAL.ROBOT_TINTS[1] && SET.legendEntries([], []).shown.length === 0 && SET.legendEntries(rosterOf(3), legendOrder).more === 0 && SET.candyHex === undefined)

  // The chrome: DOM only, wired to the camera and the store, and honest about what the pill does.
  const chrome = code('WorldChrome.tsx'), chromeRaw = text('WorldChrome.tsx'), view = code('WorldView.tsx')
  ok('world.chrome.1 the overlay is plain DOM (no three, fiber or drei — it is not in the scene\'s importer set), reads the LIVE roster for its legend, posts through the store, says where the post goes beside the field, and every control has a name',
    !/from '(?:three|@react-three\/[^']*)/.test(chrome) && /useRoster\(\)/.test(chrome) && /legendEntries\(roster, order\)/.test(chrome) && /useAgentIds\(\)/.test(chrome) && /postTeamAsk\(draft\)/.test(chrome) &&
      /Posts to the board/.test(chrome) && /aria-label="Ask your team"/.test(chrome) && /aria-label="Zoom in"/.test(chrome) && /aria-label="Zoom out"/.test(chrome) &&
      /camera\.current\?\.fit\(\)/.test(chrome) && /camera\.current\?\.zoom\(1\)/.test(chrome) && /camera\.current\?\.zoom\(-1\)/.test(chrome) && />Fit room</.test(chrome) &&
      /role="status"/.test(chrome) && /event\.key !== 'Escape'/.test(chrome) && /event\.stopPropagation\(\)/.test(chrome) && !/window\.canvas/.test(chromeRaw))
  ok('world.chrome.2 the chrome sits over the card layer (later in the DOM), and the camera buttons reach the rig through ONE CameraApi ref the rig fills and clears',
    view.indexOf('className="world-view__cards"') > 0 && view.indexOf('<WorldChrome camera={camera} />') > view.indexOf('className="world-view__cards"') &&
      /api\.current = \{/.test(view) && /return \(\) => \{ api\.current = null \}/.test(view) && /api=\{camera\}/.test(view))
  const stageLook = code('WorldPlatform.tsx')
  ok('world.studio.1 the canvas is a lit studio: ACES tone mapping and NOT `flat`, percentage-closer shadows (three r186 removed PCFSoft — `true` and "soft" log a warning and fall back), a key light that casts into a shadow camera sized to the room, the studio ground as the background, the capped pixel ratio and no contact-shadow pass',
    /toneMapping: THREE\.ACESFilmicToneMapping/.test(view) && !/<Canvas[^>]*\bflat\b/.test(view) && /shadows="percentage"/.test(view) && !/shadows=\{true\}|shadows="soft"|<Canvas[^>]*\bshadows\s/.test(view) &&
      /<directionalLight\s[^>]*castShadow/.test(view.replace(/\s+/g, ' ')) && /cam\.updateProjectionMatrix\(\)/.test(view) && /<color attach="background" args=\{\[ground\]\} \/>/.test(view) && /new THREE\.Color\(STUDIO\.ground\)/.test(view) &&
      PAL.STUDIO.ground === '#eef0f3' && /dpr=\{\[DPR_MIN, DPR_MAX\]\}/.test(view) && !/ContactShadows/.test(view) && /info\.autoReset = false/.test(view) &&
      /maxPolarAngle=\{VIEW\.maxPolar\}/.test(view) && /minPolarAngle=\{VIEW\.minPolar\}/.test(view))
  ok('world.studio.2 the platform is a drei RoundedBox, and its trim is two unlit bands on its top: a bright core and a NORMALLY-blended halo (additive over a pale slab clips to white and the glow vanishes), neither tone-mapped, laid above the slab\'s top (y = 0, the floor)',
    /<RoundedBox args=\{\[half \* 2, SLAB\.thickness, half \* 2\]\}/.test(stageLook) && /castShadow receiveShadow/.test(stageLook) && !/AdditiveBlending/.test(stageLook) &&
      (stageLook.match(/toneMapped=\{false\}/g) ?? []).length >= 2 && /vertexColors transparent/.test(stageLook) && /depthWrite=\{false\}/.test(stageLook) && /position=\{\[0, -SLAB\.thickness \/ 2, 0\]\}/.test(stageLook) &&
      /y=\{0\.012\}/.test(stageLook))
  const robotSrc = code('WorldRobot.tsx'), officeSrc = code('WorldOffice.tsx'), propsSrc = code('WorldProps.tsx')
  ok('world.studio.3 everything that stands in the room casts a shadow — each robot body part, the desk parts, the table, the stools and the board — and the cubes do NOT (they float high and drift; a moving shadow cluster would cost an instanced shadow pass for nothing)',
    (robotSrc.match(/castShadow/g) ?? []).length === 6 && (officeSrc.match(/castShadow/g) ?? []).length >= 5 && (propsSrc.match(/castShadow/g) ?? []).length >= 4 &&
      !/<instancedMesh[^>]*castShadow/.test(propsSrc) && /frustumCulled=\{false\}/.test(propsSrc))
  ok('world.studio.4 the table is a black clearcoat plate with the robots\' RoomEnvironment on THIS material (never scene.environment), a cyan edge line in the same TrimLine as the platform, and the zone label floats over only the FIRST desk',
    /<meshPhysicalMaterial color=\{STUDIO\.tableTop\}[^>]*clearcoat=\{1\}[^>]*envMap=\{env\}/.test(officeSrc) && /studioEnv\(gl\)/.test(officeSrc) && /<TrimLine path=\{line\}/.test(officeSrc) &&
      /label=\{station\.agentId === first \? 'DESK 01' : null\}/.test(officeSrc) && !/\.environment\s*=/.test(officeSrc) && PAL.STUDIO.tableTop === '#07080b')
  const rigAt = view.indexOf('if (atRest && g && c)'), handBackAt = view.indexOf('if (c && !c.enabled)')
  ok('world.rig.1 a Fit-room or zoom glide runs BEFORE the rig\'s hand-back at rest and disables the controls while it writes the camera — the hand-back snaps the camera to the rest pose whenever the controls are off, so a glide that ran after it would be undone on its first frame — and a move to or from the canvas ends the glide',
    rigAt > 0 && handBackAt > rigAt && /if \(!atRest\) gliding\.current = null/.test(view) && /c\.enabled = false\n\s*const at = mix/.test(view) && /gliding\.current = null\n\s*c\.enabled = true\n\s*c\.update\(\)/.test(view) &&
      /fit: \(\) => begin\(isoPose\(arc\.current\), ORBIT_TARGET, FIT_MS\)/.test(view))
}

// ── the critic pass against the cortxos references (M417) ────────────────────
// What a fresh look at the wide shot (vs docs/reference/cortxos-1.png) and the
// close-up (vs cortxos-5.png) found, each as the rule that fixes it. The scored
// table is docs/build-log/m417-critic-pass.md.
{
  const text = (f) => readFileSync(join(root, f), 'utf8')
  const code = (f) => text(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const { execFileSync } = require('node:child_process')
  let tracked = null
  try { tracked = execFileSync('git', ['ls-files', 'docs/reference/'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean) } catch { tracked = null }
  const frames = [1, 2, 3, 4, 5].map((n) => `docs/reference/cortxos-${n}.png`)
  const logPath = 'docs/build-log/m417-critic-pass.md'
  const log = existsSync(join(root, logPath)) ? text(logPath) : ''
  ok('world.critic.reference.1 the five cortxos look references exist AND are tracked (a reference only on the author\'s disk is one a fresh-context critic cannot have), and the M417 log scores the wide shot against cortxos-1 and the close-up against cortxos-5',
    tracked !== null && frames.every((f) => existsSync(join(root, f)) && tracked.includes(f)) &&
      /cortxos-1\.png/.test(log) && /cortxos-5\.png/.test(log) && /^\| *Gap *\|/m.test(log) && (log.match(/^\| [^|\n]+\| *[0-5] *→ *[0-5] *\|/gm) ?? []).length >= 10,
    JSON.stringify({ tracked: tracked && tracked.length, log: log.length > 0 }))

  // Cards dominated the wide shot: fewer of them (world.perf.7), and drawn at their robot's scale.
  const scales = [0, 20, 60, 68.2, 90, 110, 400].map(PF.cardScale)
  ok('world.critic.card.1 a card is full size while its robot is near (≥ CARD_FULL_PX_PER_UNIT on screen), shrinks with it as the camera pulls back, never below CARD_MIN_SCALE, and a garbage reading is the smallest card, not a NaN',
    PF.CARD_FULL_PX_PER_UNIT === 110 && PF.CARD_MIN_SCALE === 0.72 && PF.cardScale(110) === 1 && PF.cardScale(400) === 1 && PF.cardScale(20) === 0.72 &&
      Math.abs(PF.cardScale(88) - 0.8) < 1e-9 && scales.every((k, i) => i === 0 || k >= scales[i - 1]) && PF.cardScale(NaN) === 0.72 && PF.cardScale(-1) === 0.72,
    scales.map((k) => k.toFixed(2)).join())
  const card = code('src/renderer/world/WorldCard.tsx'), styles = text('src/renderer/styles.css')
  ok('world.critic.card.2 WorldCard writes --world-scale from cardScale over the SAME pixels-per-unit as the reach, only when it moves by a hundredth, onto a frame that scales from the card\'s top-left — the card itself keeps its bottom hinge for the stand-up',
    /cardScale\(perUnit\)/.test(card) && /const px = Math\.round\(REACH_UNITS \* perUnit \+ REACH_GAP_PX\)/.test(card) && /setProperty\('--world-scale'/.test(card) && /k !== scaled\.current/.test(card) &&
      /className="world-card-frame">\s*<div ref=\{card\} className="world-card">/.test(card) &&
      /\.world-card-frame \{[^}]*left: var\(--world-reach\)[^}]*transform: scale\(var\(--world-scale\)\); transform-origin: 0 0;/.test(styles) &&
      /\.world-card \{[^}]*position: relative;[^}]*transform-origin: 50% 100%;/.test(styles) && !/\.world-card \{[^}]*left: var\(--world-reach\)/.test(styles))

  // A robot leaving the desks vanished between two frames.
  const T0 = T.leavePose(0), Tend = T.leavePose(T.LEAVE_MS), hop = T.leavePose(T.LEAVE_MS * 0.1)
  const curve = Array.from({ length: 41 }, (_, i) => T.leavePose((T.LEAVE_MS * i) / 40))
  ok('world.critic.leave.1 a leave is a small farewell hop (above the floor, full size) and then an accelerating sink through it as the figure shrinks — standing at 0, gone and past its own height below the floor at LEAVE_MS, never growing back on the way, and over at once under reduced motion; the card fades on a straighter, earlier line than the body so it never drops in the last frames',
    T0.scale === 1 && T0.sink === 0 && !T0.done && hop.scale === 1 && hop.sink < 0 && Tend.done && Tend.scale === 0 && T.LEAVE_SINK > 1.55 &&
      curve.every((p, i) => i === 0 || p.scale <= curve[i - 1].scale) && curve.slice(10).every((p, i, a) => i === 0 || p.sink >= a[i - 1].sink) &&
      T.leavePose(10, 0).done && T.leavePose(10, 0).scale === 0 && T.LEAVE_MS >= 600 && T.LEAVE_MS <= 1200 &&
      // The card fades on its own, earlier line — gone (pop 0.45 is cardStand's zero) by two thirds in, while the body still stands half-sunk.
      T0.card === 1 && curve.every((p, i) => i === 0 || p.card <= curve[i - 1].card) && T.leavePose(T.LEAVE_MS * 0.65).card <= 0.45 + 1e-9 &&
      T.leavePose(T.LEAVE_MS * 0.65).scale > 0.75 && T.leavePose(T.LEAVE_MS * 0.4).card < 0.9 && Tend.card === 0)
  const st = (id) => ({ agentId: id })
  const A = st('a'), B = st('b'), C2 = st('c')
  const none = new Map()
  const one = T.settleLeavers(none, [A, B, C2], [A, C2], 1000)
  const same = T.settleLeavers(one, [A, C2], [A, C2], 1200)
  const back = T.settleLeavers(one, [A, C2], [A, B, C2], 1300)
  const over = T.settleLeavers(one, [A, C2], [A, C2], 1000 + T.LEAVE_MS)
  ok('world.critic.leave.2 settleLeavers starts a leave for each agent that dropped out of the roster, keeps its last station and when it left, returns the SAME map when nothing moved (a render-time derive must settle), ends a leave when the agent is back or the leave is over, and holds nobody at a span of 0',
    one.size === 1 && one.get('b').station === B && one.get('b').at === 1000 && T.settleLeavers(none, [A], [A], 5) === none && same === one &&
      back.size === 0 && over.size === 0 && T.settleLeavers(none, [A, B], [A], 7, 0).size === 0 && T.settleLeavers(one, [A, C2], [C2], 1100).get('b').at === 1000 && T.settleLeavers(one, [A, C2], [C2], 1100).get('a').at === 1100)
  const view = code('src/renderer/world/WorldView.tsx'), robot = code('src/renderer/world/WorldRobot.tsx'), office = code('src/renderer/world/WorldOffice.tsx')
  ok('world.critic.leave.3 the leave is wired so it cannot remount and the room holds still: WorldView derives the leavers DURING render from the live roster (an effect would commit the unmount first), plans the room over the roster WITH the leavers so nothing re-flows until a leave is over, renders every robot and desk from ONE keyed array, ranks cards over the live alone, and the robot fades the card on the leave\'s card line while it shrinks and sinks `bob` (not `placer`, which carries the card), keeping the card it had',
    /if \(track\.roster !== roster\) \{\s*current = \{ roster, leaving: settleLeavers\(/.test(view) && /setTrack\(current\)/.test(view) && /stationPlan\(held\)/.test(view) && /heldRoster\(roster, leavers\)/.test(view) &&
      (view.match(/<WorldRobot /g) ?? []).length === 1 && /stations\.map\(\(station\) => \(\s*<WorldRobot /.test(view) && /<CardBudget stations=\{live\}/.test(view) && /leftAt=\{leftAt\.get\(station\.agentId\) \?\? null\}/.test(view) &&
      /pop\.current = shown \* \(leave\?\.card \?\? 1\)/.test(robot) && /const body = shown \* \(leave\?\.scale \?\? 1\)/.test(robot) && /bob\.current\.position\.y = -\(leave\?\.sink \?\? 0\)/.test(robot) && /if \(leftAt === null\) cardless\.current = compact/.test(robot) &&
      /compact=\{cardless\.current\}/.test(robot) && (office.match(/<Desk /g) ?? []).length === 1 && /leftAt=\{leftAt\.get\(station\.agentId\) \?\? null\}/.test(office) && /leavePose\(performance\.now\(\) - leaving\.current/.test(office))

  // The zone sign was the loudest thing in the wide shot.
  const props = code('src/renderer/world/WorldProps.tsx')
  const lum = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).reduce((a, b) => a + b, 0) / 3
  ok('world.critic.label.1 the zone sign is a quiet room label, as the reference\'s are: a semibold letter-spaced word in a mid grey (lighter than the room\'s ink), on a sprite well under the robot-width it had',
    /ctx\.font = `600 92px \$\{uiFont\(\)\}`/.test(props) && /ctx\.letterSpacing = '22px'/.test(props) && /ctx\.fillStyle = STUDIO\.zoneInk/.test(props) &&
      /<sprite position-y=\{y\} scale=\{\[1\.5, 0\.47, 1\]\}>/.test(props) && lum(PAL.STUDIO.zoneInk) > lum(PAL.STUDIO.ink) + 80 && lum(PAL.STUDIO.zoneInk) < 180)

  // The shell takes the palette's colour as it is: a saturation push turns the white and graphite robots into colours.
  ok('world.critic.shell.1 the robot\'s shell is its tint AS IS — no HSL push (which would make the white robot blue-grey and the graphite one mud) — and the robot, its desk screen and its legend dot all read the store\'s first-seen order',
    /color: new THREE\.Color\(tint\), roughness: 0\.34/.test(robot) && !/setHSL/.test(robot) && /agentTint\(agentId, getAgentIds\(\)\)/.test(robot) && /agentTint\(station\.agentId, getAgentIds\(\)\)/.test(office))
}

// ── M420: the bloom ──────────────────────────────────────────────────────────
{
  const dir = join(root, 'src/renderer/world')
  const text = (f) => readFileSync(join(dir, f), 'utf8')
  const code = (f) => text(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const { execFileSync } = require('node:child_process')
  const grep = (args) => { try { return execFileSync('grep', args, { encoding: 'utf8' }).trim().split('\n').filter(Boolean) } catch { return [] } }
  const bloom = code('WorldBloom.tsx'), view = code('WorldView.tsx'), platform = code('WorldPlatform.tsx'), robot = code('WorldRobot.tsx'), props = code('WorldProps.tsx')

  const importers = grep(['-rl', "from 'postprocessing'", join(root, 'src')]).map((x) => x.replace(join(root, 'src/'), '')).sort()
  ok('world.bloom.door.1 `postprocessing` has exactly two importers — the diorama\'s door and the world\'s composer — both reached only through a lazy() chain, and the wrapper `@react-three/postprocessing` is imported by nobody (its peer range already cost a fiber bump once)',
    importers.join() === ['renderer/orchestration/orchestration-bloom.tsx', 'renderer/world/WorldBloom.tsx'].join() &&
      grep(['-rn', "@react-three/postprocessing", join(root, 'src')]).filter((l) => /from '@react-three\/postprocessing'/.test(l)).length === 0,
    importers.join())
  const bloomImports = grep(['-rnE', "from '(\\./|(@renderer/)?world/)?(\\./)?WorldBloom'", join(root, 'src')])
  ok('world.bloom.door.2 WorldBloom is imported by WorldView alone — and WorldView is itself behind the stage\'s lazy() (world.door.2) — so the composer rides three.js\'s deferred chunk; the pure settings module imports neither three nor the library',
    bloomImports.length === 1 && /world\/WorldView\.tsx/.test(bloomImports[0]) &&
      !/from '(three|postprocessing|@react-three\/[^']+)/.test(code('world-bloom.ts')) &&
      // Outside the agent store's import graph: an HMR edit of anything in that graph re-instantiates the STORE (M416), so tuning the bloom would empty the roster.
      !/world-bloom/.test(text('agent-world-store.ts')) && !/world-bloom/.test(text('world-set.ts')) && !/world-bloom/.test(text('world-scene.ts')))

  ok('world.bloom.frame.1 the composer takes the frame at priority 1 and gives it back on unmount (that handover IS the bloom-off fallback), never from a requestAnimationFrame of its own; HalfFloat, or an 8-bit buffer clamps at 1.0 and a threshold selects nothing',
    /useFrame\(\(_, delta\) => composer\.render\(delta\), 1\)/.test(bloom) && !/requestAnimationFrame/.test(bloom) && /frameBufferType: THREE\.HalfFloatType/.test(bloom))
  const tm = bloom.indexOf('new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC })'), bl = bloom.indexOf('new BloomEffect(')
  ok('world.bloom.order.1 ACES comes BEFORE the bloom in the one pass (bloom reads the pass\'s HDR input whatever the order, and adds its glow over a picture that already has the studio\'s look — bloom first re-maps the glow to a white line), the edge filter is its own later pass, and the renderer\'s own tone mapping is untouched',
    tm > 0 && bl > tm && /new EffectPass\(camera, new FXAAEffect\(\)\)/.test(bloom) && !/toneMapping\s*=/.test(bloom) && !/NoToneMapping/.test(bloom))
  ok('world.bloom.resize.1 the composer resizes on a pixel-ratio change as well as a size change (the governor\'s setDpr moves the drawing buffer and NOT fiber\'s size, so a size-only effect leaves it stale and blurry), without touching the canvas style, and disposes itself and never the renderer',
    /composer\.setSize\(size\.width, size\.height, false\)/.test(bloom) && /\[composer, size\.width, size\.height, dpr\]/.test(bloom) &&
      /composer\.dispose\(\)/.test(bloom) && !/\bgl\.(dispose|forceContextLoss)\(/.test(bloom))
  ok('world.bloom.mount.1 the view mounts the composer only while bloom is on, paints the unlit ground as its ACES pre-image while it is, and the canvas still tone-maps with ACES (the fallback render is the M417 picture)',
    /const bloom = useBloomOn\(\)/.test(view) && /\{bloom && <WorldBloom \/>\}/.test(view) && /acesPreimage\(\[c\.r, c\.g, c\.b\]\)/.test(view) && /toneMapping: THREE\.ACESFilmicToneMapping/.test(view))
  ok('world.bloom.glow.1 every unlit thing the composer would otherwise grey takes its bloom treatment from the same pure module — the trim\'s core and halo (the halo\'s extra opacity only over the pale slab, never on the black table), the eyes, the whiteboard — and each one is the identity with bloom off',
    /glowScale\(hex, bloom\)/.test(platform) && /haloShare\(bloom\)/.test(platform) && /peak=\{TRIM\.glowPeak\} overPale \/>/.test(platform) && !/overPale/.test(code('WorldOffice.tsx')) && /glowScale\(EYE_COLOR, bloom\)/.test(robot) && /unlitScale\(bloom\)/.test(props) && /unlitInk\(hex, bloom\)/.test(props) &&
      BL.glowScale('#36e6ff', false) === 1 && BL.haloShare(false) === 1 && BL.unlitScale(false) === 1 && BL.unlitInk('#7b8494', false) === '#7b8494')

  // The pure half.
  const near = (a, b, tol) => a.every((v, i) => Math.abs(v - b[i]) <= tol)
  const ground = BL.hexLinear(PAL.STUDIO.ground)
  const roundTrip = BL.acesToneMap(BL.acesPreimage(ground))
  ok('world.bloom.preimage.1 the unlit ground painted as its ACES pre-image comes OUT as the ground (within a quarter of an 8-bit level) — painted raw it measured 239 -> ~226 with the composer on, which is half the frame visibly greyer',
    near(roundTrip, ground, 0.25 / 255) && BL.acesToneMap(ground)[0] < ground[0] - 0.02, roundTrip.join())
  // The whiteboard's colours: what the scaled material and ACES make of the ink is the colour asked for.
  const boardColours = ['#f2f4f7', '#ffffff', '#7b8494', '#8a93a3', PAL.STUDIO.ink, '#e3e7ed']
  const boardErr = boardColours.map((hex) => {
    const out = BL.acesToneMap(BL.hexLinear(BL.unlitInk(hex, true)).map((v) => v * BL.unlitScale(true)))
    const want = BL.hexLinear(hex).map((v) => Math.min(v, BL.unlitCeil()))
    return Math.max(...out.map((v, i) => Math.abs(BL.linearToSrgbByte(v) - BL.linearToSrgbByte(want[i]))))
  })
  ok('world.bloom.ink.1 every colour the whiteboard paints comes out of the scaled material and the composer\'s ACES as the colour asked for, within 3 levels (a flat lift crushed the words into the white: the critic read them as gone) — the sheet\'s white stays under the bloom threshold (it bloomed out at its first scale) and still reads 236 or more of 255 — and every colour is its own value with bloom off',
    boardErr.every((e) => e <= 3) && boardColours.every((hex) => BL.unlitInk(hex, false) === hex) && BL.unlitScale(true) < BL.bloomThreshold() && BL.unlitScale(true) * 1 > BL.bloomThreshold() - 0.25 && BL.linearToSrgbByte(BL.unlitCeil()) >= 236, boardErr.join() + ' ceil=' + BL.linearToSrgbByte(BL.unlitCeil()))
  const th = BL.bloomThreshold()
  const [gr, gg, gb] = BL.acesPreimage(ground)
  ok('world.bloom.threshold.1 the threshold sits above the ground\'s HDR luminance (a threshold under it blooms the whole frame to white: ground 239 -> 255) and every glow colour is scaled past it by the smoothing and the headroom — the cyan trim, the eyes',
    th > BL.linearLuma(gr, gg, gb) && ['#36e6ff', '#7ff4ff'].every((hex) => BL.hexLuma(hex, BL.glowScale(hex, true)) >= th + BL.BLOOM.smoothing + BL.BLOOM.glowOver - 1e-9) &&
      BL.hexLuma(PAL.STUDIO.slab) < th && BL.hexLuma(PAL.STUDIO.desk) < th, `threshold=${th.toFixed(3)}`)
  ok('world.bloom.state.1 bloom is on by default, flips live with no storage to hand (a private window, or node), and persists only a person\'s own choice — the governor\'s call is never stored',
    BL.isBloomOn() === true && (BL.setBloomOn(false, false), BL.isBloomOn() === false) && (BL.setBloomOn(true, false), BL.isBloomOn() === true) &&
      /try \{[\s\S]*?localStorage\.getItem[\s\S]*?\} catch/.test(text('world-bloom.ts')))
  const big = BL.bloomDprCap(3200, 2000, 2), mid = BL.bloomDprCap(1800, 1100, 2)
  ok('world.bloom.budget.1 the composer\'s pixel budget lowers the pixel ratio and does not drop the bloom: a typical retina window keeps the capped ratio it had, the 18 MP wide-retina one is brought under the budget, and the ratio is never below DPR_MIN or above what the display asks for — and the composer applies it on resize and puts the display\'s ratio back when it unmounts',
    mid === PF.clampDpr(2) && big < mid && big >= PF.DPR_MIN && Math.round(3200 * 2000 * big * big) <= BL.BLOOM.maxPixels + 1 &&
      BL.bloomDprCap(1000, 700, 1) === 1 && BL.bloomDprCap(4000, 2500, 1) === PF.DPR_MIN &&
      /setDpr\(bloomDprCap\(size\.width, size\.height, window\.devicePixelRatio\)\)/.test(bloom) && /setDpr\(clampDpr\(window\.devicePixelRatio\)\)/.test(bloom),
    `mid=${mid} big=${big.toFixed(3)}`)
}

// ── M421: what the work is, not only who is working ──────────────────────────
{
  const dir = join(root, 'src/renderer/world')
  const text2 = (f) => readFileSync(join(dir, f), 'utf8')
  // The feed's path: relative to the agent's folder, scrubbed, absent for a tool that names no file.
  const sent = []
  const feed = F.createWorldFeed({ emit: (e) => sent.push(...e), now: () => 5000, label: () => 'A', cwdOf: () => '/repo/app/' })
  feed.session({ id: 'p', type: 'turn', turn: { id: 't1', role: 'assistant', blocks: [
    { type: 'tool_use', id: 'u1', name: 'Edit', input: { file_path: '/repo/app/src/auth/session.ts' } },
    { type: 'tool_use', id: 'u2', name: 'Read', input: { file_path: '/elsewhere/ghp_' + 'a'.repeat(36) + '.txt' } },
    { type: 'tool_use', id: 'u3', name: 'Bash', input: { command: 'npm test' } }
  ] } })
  feed.session({ id: 'p', type: 'turn', turn: { id: 't2', role: 'user', blocks: [{ type: 'tool_result', toolUseId: 'u1', content: 'ok' }] } })
  const calls = sent.filter((e) => e.type === 'tool_call')
  const res = sent.find((e) => e.type === 'tool_result')
  ok('world.path.1 a file tool carries its path RELATIVE to the agent\'s folder, a path outside it stays whole, a token in a path is scrubbed before any tile sees it, a tool that names no file has no path — and the result carries its call\'s path',
    calls[0]?.payload.path === 'src/auth/session.ts' && typeof calls[1]?.payload.path === 'string' && calls[1].payload.path.startsWith('/elsewhere/') && !calls[1].payload.path.includes('a'.repeat(36)) &&
      calls[2] && !('path' in calls[2].payload) && res?.payload.path === 'src/auth/session.ts',
    JSON.stringify(calls.map((c) => c.payload.path)))
  ok('world.path.2 the link hands the feed the agent\'s folder at use', /cwdOf: \(id\) => host\.cwdOf\(id\)/.test(readFileSync(join(root, 'src/main/world-feed-link.ts'), 'utf8')))

  // The simulator: a conflict and a delegation exist to be seen.
  const simSent = []
  let clock = 0
  const timers = []
  S.startWorldSimulation({ emit: (e) => simSent.push(...e), now: () => clock, setTimeout: (fn, ms) => { timers.push({ at: clock + ms, fn }); return timers.length }, clearTimeout: () => {}, random: () => 0.5 })
  for (let i = 0; i < 400 && timers.length; i++) { timers.sort((a, b) => a.at - b.at); const t = timers.shift(); clock = t.at; t.fn() }
  const editors = new Set(simSent.filter((e) => e.type === 'tool_call' && e.payload.tool === 'Edit' && e.payload.path === 'src/auth/session.ts').map((e) => e.agentId))
  ok('world.sim.path.1 the simulator gives its file tools paths, has two agents edit the same file (the room\'s conflict line) and one delegate a sub-task',
    editors.size >= 2 && simSent.some((e) => e.type === 'tool_call' && e.payload.tool === 'Task'), [...editors].join())

  // The activity: what the hands are on.
  const A = AC.toolActivity
  ok('world.activity.1 a tool is a kind of work: Read reads, Grep/Glob search, Edit/Write edit, a test command tests (npm test, verify:world, vitest, pytest, go test), any other shell line runs, the web browses, Task delegates — and an unknown tool is work, never a guess at its input',
    A('Read', 'x') === 'read' && A('Grep', 'x') === 'search' && A('Glob', 'x') === 'search' && A('Edit', 'x') === 'edit' && A('Write', 'x') === 'edit' &&
      ['npm test -- auth', 'npm run verify:world', 'npx vitest run', 'pytest -q', 'go test ./...', 'npm run test:e2e -- login.spec.ts'].every((c) => A('Bash', c) === 'test') &&
      ['npm run db:migrate', 'ls -la', 'git status', './contest.sh'].every((c) => A('Bash', c) === 'shell') &&
      A('WebFetch', 'x') === 'web' && A('Task', 'x') === 'delegate' && A('mcp__linear__create', 'x') === 'shell')
  const at = (seq, type, payload, ts = 1000 + seq) => ({ agentId: 'a', seq, ts, type, payload })
  const rec = (status, events) => ({ status, events, lastTs: events.length ? events[events.length - 1].ts : 0 })
  const editing = [at(1, 'tool_call', { tool: 'Task', summary: 'Survey', status: 'started', callId: 'd' }), at(2, 'tool_call', { tool: 'Edit', summary: 'Edit x', status: 'started', callId: 'e' })]
  ok('world.activity.2 the activity\'s order: a waiting request and an error outrank any open call, thinking is thinking, the NEWEST non-delegation call says what the hands are on, then a delegation, then a message just sent, then quiet',
    AC.activityOf(rec('waiting_approval', editing), 1010) === 'wait' && AC.activityOf(rec('error', editing), 1010) === 'stuck' && AC.activityOf(rec('thinking', editing), 1010) === 'think' &&
      AC.activityOf(rec('working', editing), 1010) === 'edit' &&
      AC.activityOf(rec('working', [editing[0]]), 1010) === 'delegate' &&
      AC.activityOf(rec('working', [at(3, 'message', { text: 'done' })]), 1003 + 100) === 'talk' &&
      AC.activityOf(rec('working', [at(3, 'message', { text: 'done' })]), 1003 + Z.QUIET_MS + 1) === 'quiet' &&
      AC.activityOf(rec('idle', []), 0) === 'rest')
  const longTask = [at(1, 'tool_call', { tool: 'Task', summary: 'Survey', status: 'started', callId: 'd' }), at(2, 'tool_call', { tool: 'Read', summary: 'Read y', status: 'started', callId: 'r' })]
  const later = 1002 + Z.TYPING_STALE_MS + 5
  ok('world.activity.3 a delegation stays open until its result (a sub-agent\'s run outlives the typing cap), an ordinary call goes stale at the cap, and a result closes its own call by id',
    AC.openDelegations(rec('working', longTask), later).length === 1 && AC.openCalls(longTask, later).length === 1 &&
      AC.openCalls([...longTask, at(3, 'tool_result', { tool: 'Task', summary: 'Survey', status: 'done', callId: 'd' })], 1004).map((c) => c.key).join() === 'r')
  const verbs = Object.values(AC.ACTIVITY_VERB).filter(Boolean)
  ok('world.activity.4 the room\'s verbs are its own — none is a panel state word, so the rail\'s vocabulary has one home',
    verbs.every((w) => !['working', 'idle', 'needs you', 'starting', 'asleep', 'exited'].includes(w.toLowerCase())) && AC.ACTIVITY_VERB.wait === null)

  // The context store: by value, and the actions door.
  let n = 0
  const off = CTX.subscribeWorldContext(() => n++)
  const snap = { tasks: [{ id: 't', title: 'Auth', state: 'working', members: ['a'], steps: [] }], approvals: [], handoffs: [], peers: [] }
  CTX.publishWorldContext(snap)
  CTX.publishWorldContext(JSON.parse(JSON.stringify(snap)))
  const first = CTX.getWorldContext()
  CTX.publishWorldContext({ ...snap, approvals: [{ agentId: 'a', requestId: 'r', toolName: 'Bash', argument: 'rm -rf build' }] })
  off()
  ok('world.ctx.1 the context is replaced only when it says something different — Canvas publishes on its own renders, and a drag must not re-render the room',
    n === 2 && first === snap && CTX.getWorldContext().approvals.length === 1, `notified=${n}`)
  let said = null
  CTX.setWorldActions({ answer: () => {}, send: async (_a, t) => { said = t; return null }, open: () => {}, canSend: () => true })
  const door = CTX.worldActions()
  CTX.setWorldActions(null)
  ok('world.ctx.2 the room\'s buttons reach a door Canvas registered, and none when Canvas is gone', door !== null && CTX.worldActions() === null && (door.send('a', 'hi'), said === 'hi'))

  const worldFiles = readdirSync(dir).filter((f) => /\.tsx?$/.test(f))
  const canvasReach = worldFiles.filter((f) => f !== 'useWorldContextPublisher.ts' && /from '@renderer\/(?:(?:chat|canvas|shell|presence)\/|panels\/(?!panel-state'))/.test(text2(f)))
  const pubImporters = worldFiles.filter((f) => /useWorldContextPublisher'/.test(text2(f)))
  const canvasSrc = readFileSync(join(root, 'src/renderer/canvas/Canvas.tsx'), 'utf8')
  ok('world.ctx.door.1 only the publisher reaches into the canvas\'s own modules (chat, canvas, panels but the shared panel-state vocabulary, shell, presence) — the scene knows the two stores and nothing else — and only Canvas calls it',
    canvasReach.length === 0 && pubImporters.length === 0 && /useWorldContextPublisher\(\{/.test(canvasSrc) && !THREE_DOOR_RE.test(text2('useWorldContextPublisher.ts')) && !THREE_DOOR_RE.test(text2('world-context-store.ts')),
    canvasReach.concat(pubImporters).join())
  const pub = text2('useWorldContextPublisher.ts')
  ok('world.ctx.door.2 every verb the room has is an EXISTING door: answer is answerRequest, send is agentSession.send read through sendRefusalSentence, open is Canvas\'s attention jump after the room closes',
    /answerRequest\(agentId, getChat\(agentId\)\.snapshot/.test(pub) && /sendRefusalSentence\(await window\.canvas\.agentSession\.send\(agentId, text, \[\]\)\)/.test(pub) &&
      /closeWorld\(\)[\s\S]{0,120}jump\(agentId\)/.test(pub) && /jump: jumpAnywhere/.test(canvasSrc))
}

const failures = results.filter((r) => !r.pass)
console.log(`\n${results.length - failures.length}/${results.length} checks passed`)
process.exitCode = failures.length ? 1 : 0
