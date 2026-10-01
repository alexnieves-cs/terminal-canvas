/* The world-event contract (shared/world-events.ts), the renderer store that
   folds it (renderer/world/agent-world-store.ts) and the SIMULATE_AGENTS
   script (main/world-sim.ts).
   Run with: npm run verify:world

   Plain node. The simulator runs on a fake clock, so a whole loop of every
   agent's script costs no wall time. The store is driven through
   ingestAgentEvents and connectAgentWorld exactly as main.tsx drives it; its
   React hooks are useSyncExternalStore over the same reads, so they are not
   rendered here.

   What this cannot see: the IPC hop itself (main's readyContents send and the
   preload's subscribe) — `SIMULATE_AGENTS=true npm run dev` is where that was
   watched by hand. */
'use strict'
const { buildSync } = require('esbuild')
const { mkdirSync } = require('node:fs')
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
      "  store: require('./src/renderer/world/agent-world-store.ts')",
      "}"
    ].join('\n'),
    resolveDir: root, loader: 'js'
  },
  outfile: join(root, 'out/verify/world.cjs'),
  bundle: true, platform: 'node', format: 'cjs', logLevel: 'error', external: ['react'],
  alias: { '@shared': join(root, 'src/shared') }
})
const { contract: C, sim: S, store: W } = require('../out/verify/world.cjs')

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

  sim.stop()
  const count = out.length
  advance(longest * 2)
  ok('world.sim.7 stop() clears every timer — nothing is emitted after it', out.length === count && timers.length === 0,
    `after=${out.length - count} pending=${timers.length}`)
}

const failures = results.filter((r) => !r.pass)
console.log(`\n${results.length - failures.length}/${results.length} checks passed`)
process.exitCode = failures.length ? 1 : 0
