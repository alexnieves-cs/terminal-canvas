/* Presence: one Y.Doc per workspace, the awareness payload, the 30s
   heartbeat, idle/offline on the receiver's clock, and the agent-status fold.
   Run with: npm run verify:presence

   Plain node. Two REAL hubs over REAL yjs/y-protocols Awareness instances,
   wired back to back in-process by the injected `connect` — the relay a
   Hocuspocus server performs, minus the socket. Time and the heartbeat timer
   are injected, so fifteen minutes pass in a loop.

   What this cannot see: a live Hocuspocus server (its auth hook and relay),
   the provider's reconnect, and the renderer's 15Hz paint — the last is a
   DOM fact for an Electron suite, and none pins it yet. */
'use strict'
const { buildSync } = require('esbuild')
const { mkdirSync } = require('node:fs')
const { join } = require('node:path')
const { ok, results } = require('./lib/checks.cjs').createChecks()

const root = join(__dirname, '..')
mkdirSync(join(root, 'out/verify'), { recursive: true })
buildSync({
  stdin: {
    contents: "module.exports = { ...require('./src/main/presence/presence-hub.ts'), ...require('./src/shared/presence.ts'), awareness: require('y-protocols/awareness') }",
    resolveDir: root, loader: 'js'
  },
  outfile: join(root, 'out/verify/presence.cjs'),
  bundle: true, platform: 'node', format: 'cjs', logLevel: 'error', external: ['electron', 'node-pty'],
  alias: { '@shared': join(root, 'src/shared') }
})
const P = require('../out/verify/presence.cjs')
const { encodeAwarenessUpdate, applyAwarenessUpdate } = P.awareness

/** A relay: every awareness joined to a doc name hears every other's updates. */
function createRelay() {
  const rooms = new Map()
  const connect = ({ name, awareness, onStatus }) => {
    const members = rooms.get(name) ?? new Set()
    rooms.set(name, members)
    for (const other of members) {
      applyAwarenessUpdate(awareness, encodeAwarenessUpdate(other, [...other.getStates().keys()]), 'relay')
    }
    const onUpdate = ({ added, updated, removed }, origin) => {
      if (origin === 'relay') return
      const changed = [...added, ...updated, ...removed]
      const update = encodeAwarenessUpdate(awareness, changed)
      for (const other of members) if (other !== awareness) applyAwarenessUpdate(other, update, 'relay')
    }
    awareness.on('update', onUpdate)
    members.add(awareness)
    connects.push(name)
    queueMicrotask(() => onStatus('connected'))
    return {
      destroy() {
        destroyed.push(name)
        awareness.off('update', onUpdate)
        members.delete(awareness)
        // What the provider does on destroy: our state removed for everyone else.
        const update = encodeAwarenessUpdate(awareness, [awareness.clientID], new Map([[awareness.clientID, null]]))
        for (const other of members) applyAwarenessUpdate(other, update, 'relay')
      }
    }
  }
  const connects = [], destroyed = []
  return { connect, connects, destroyed }
}

function hub(relay, opts) {
  const emitted = []
  const clock = opts.clock
  let beat = null
  const workspaces = opts.workspaces ?? [{ id: 'w1', panelIds: ['p1', 'p2'] }]
  const h = P.createPresenceHub({
    config: () => opts.config ?? { kind: 'ok', url: 'wss://presence.example' },
    identity: async () => opts.identity ?? { kind: 'ok', userId: opts.userId, displayName: opts.name, token: async () => 'T' },
    workspaces: () => workspaces,
    connect: relay.connect,
    emit: (r) => emitted.push(r),
    now: () => clock.t,
    // The hub runs TWO timers since the Team view: the heartbeat and the
    // observer snapshot beat. Only the heartbeat is this suite's; each timer's
    // handle is its interval, so clearing one never clears the other.
    setInterval: (f, ms) => { if (ms === P.PRESENCE_HEARTBEAT_MS) beat = { f, ms }; return ms },
    clearInterval: (h) => { if (h === P.PRESENCE_HEARTBEAT_MS) beat = null }
  })
  return { h, emitted, workspaces, beat: () => beat, last: (ws = 'w1') => [...emitted].reverse().find((r) => r.workspaceId === ws) }
}

const tick = () => new Promise((r) => setImmediate(r))

;(async () => {
  {
    const clock = { t: 1_000_000 }
    const relay = createRelay()
    const a = hub(relay, { clock, userId: 'user-a', name: 'ada lovelace' })
    const b = hub(relay, { clock, userId: 'user-b', name: 'grace' })
    await a.h.start(); await b.h.start(); await tick()

    ok('presence.doc.1 one doc per open workspace, named for it', relay.connects.filter((n) => n === 'tc:workspace:w1').length === 2)
    ok('presence.heartbeat.1 the heartbeat is 30s', a.beat()?.ms === 30_000 && P.PRESENCE_HEARTBEAT_MS === 30_000)

    a.h.local({ workspaceId: 'w1', currentPanelId: 'p1', cursor: { x: 10, y: 20 }, viewport: { x: 0, y: 0, scale: 1 }, selection: ['p2'], mode: 'canvas' })
    await tick()
    const peerA = b.last()?.peers.find((p) => p.presence.userId === 'user-a')
    const keys = peerA === undefined ? [] : Object.keys(peerA.presence).sort()
    // currentTask and observing joined with the Team view (verify:team pins what they carry);
    // textCursor with shared text (verify:canvas-sync text.caret.1).
    ok('presence.payload.1 the payload carries exactly the named fields',
      JSON.stringify(keys) === JSON.stringify(['agentStatus', 'color', 'currentPanelId', 'currentTask', 'cursor', 'displayName', 'initials', 'lastActivity', 'mode', 'observing', 'selection', 'statusLine', 'textCursor', 'userId', 'viewport']), JSON.stringify(keys))
    ok('presence.payload.2 a local report reaches the peer at once, not at the next beat',
      peerA?.presence.cursor?.x === 10 && peerA.presence.selection[0] === 'p2' && peerA.presence.currentPanelId === 'p1')
    ok('presence.payload.3 initials and colour are derived, stable per userId',
      peerA?.presence.initials === 'AL' && peerA.presence.color === P.colorOf('user-a') && /^#[0-9a-f]{6}$/.test(peerA.presence.color))
    ok('presence.payload.4 a peer never sees itself in its own roster', b.last()?.peers.every((p) => p.presence.userId !== 'user-b'))

    // Agent status from agent:event.
    a.h.agentEvent({ id: 'p1', type: 'status', status: 'streaming' })
    await tick()
    let s = b.last()?.peers.find((p) => p.presence.userId === 'user-a')?.presence
    ok('presence.agent.1 a streaming agent publishes working, with a line', s?.agentStatus === 'working' && s.statusLine === '1 agent working', JSON.stringify(s && [s.agentStatus, s.statusLine]))
    a.h.agentEvent({ id: 'p1', type: 'permission-request', requestId: 'r1', toolName: 'Bash', input: {} })
    await tick()
    s = b.last()?.peers.find((p) => p.presence.userId === 'user-a')?.presence
    ok('presence.agent.2 a pending permission outranks working', s?.agentStatus === 'needs-you')
    a.h.agentEvent({ id: 'p1', type: 'permission-answered', requestId: 'r1', allow: true })
    a.h.agentEvent({ id: 'p9', type: 'status', status: 'streaming' })
    await tick()
    s = b.last()?.peers.find((p) => p.presence.userId === 'user-a')?.presence
    ok('presence.agent.3 answered goes back to working; an agent on ANOTHER workspace\'s panel is not counted',
      s?.agentStatus === 'working' && s.statusLine === '1 agent working')
    a.h.agentEvent({ id: 'p1', type: 'status', status: 'disposed' })
    await tick()
    s = b.last()?.peers.find((p) => p.presence.userId === 'user-a')?.presence
    ok('presence.agent.4 a disposed agent leaves the fold', s?.agentStatus === 'none' && s.statusLine === '')

    // Idle: heartbeats keep coming, lastActivity does not change.
    for (let i = 0; i < 9; i++) { clock.t += 30_000; a.beat().f(); b.beat().f() }
    await tick()
    ok('presence.idle.1 still active at 4.5 minutes without activity', b.last()?.peers.find((p) => p.presence.userId === 'user-a')?.status === 'active')
    for (let i = 0; i < 2; i++) { clock.t += 30_000; a.beat().f(); b.beat().f() }
    await tick()
    ok('presence.idle.2 idle at 5 minutes, while heartbeats still arrive', b.last()?.peers.find((p) => p.presence.userId === 'user-a')?.status === 'idle')
    a.h.local({ workspaceId: 'w1', currentPanelId: 'p1', cursor: { x: 11, y: 20 }, viewport: { x: 0, y: 0, scale: 1 }, selection: ['p2'], mode: 'canvas' })
    await tick()
    ok('presence.idle.3 activity makes the peer active again at once', b.last()?.peers.find((p) => p.presence.userId === 'user-a')?.status === 'active')

    // Offline: A stops beating (a sleeping Mac). y-protocols drops the live
    // state after its own 30s, but the roster row stays, marked away, until
    // 15 minutes since the last heartbeat.
    a.h.stop()
    await tick()
    const away = b.last()?.peers.find((p) => p.presence.userId === 'user-a')
    ok('presence.offline.1 a peer that left stays listed, not live', away !== undefined && away.live === false)
    clock.t += 14 * 60_000; b.beat().f()
    ok('presence.offline.2 still listed at 14 minutes', b.last()?.peers.some((p) => p.presence.userId === 'user-a'))
    clock.t += 60_000; b.beat().f()
    ok('presence.offline.3 dropped at 15 minutes without a heartbeat', !b.last()?.peers.some((p) => p.presence.userId === 'user-a'))
    ok('presence.stop.1 stop destroys the connection and the beat', relay.destroyed.includes('tc:workspace:w1') && a.beat() === null)
    b.h.stop()
  }

  {
    // Skew: a peer whose clock is an hour behind is not idle for it.
    const tr = P.createPresenceTracker()
    const base = { userId: 'u', displayName: 'u', initials: 'U', color: '#000000', currentPanelId: null, cursor: null, viewport: null, selection: [], mode: '', agentStatus: 'none', statusLine: '' }
    tr.seen(1, { ...base, lastActivity: 5 }, 10_000_000)
    ok('presence.skew.1 idle is judged on the receiver\'s clock, never against the sender\'s timestamp', tr.peers(10_000_000 + 60_000)[0]?.status === 'active')
  }

  {
    const clock = { t: 0 }
    const relay = createRelay()
    const x = hub(relay, { clock, userId: 'u', name: 'n', workspaces: [{ id: 'w1', panelIds: [] }, { id: 'w2', panelIds: [] }] })
    await x.h.start(); await tick()
    x.workspaces.splice(1, 1)
    x.workspaces.push({ id: 'w3', panelIds: [] })
    x.h.reconcile()
    ok('presence.doc.2 a removed workspace is disconnected; a new one connected',
      relay.destroyed.includes('tc:workspace:w2') && relay.connects.includes('tc:workspace:w3') && !relay.destroyed.includes('tc:workspace:w1'))
    x.workspaces.push({ id: 'w4', panelIds: [] })
    x.h.local({ workspaceId: 'w4', currentPanelId: null, cursor: null, viewport: null, selection: [], mode: 'canvas' })
    ok('presence.doc.3 a report for a workspace newer than the last beat connects it now', relay.connects.includes('tc:workspace:w4'))
    x.h.stop()
  }

  {
    const clock = { t: 0 }
    const relay = createRelay()
    const off = hub(relay, { clock, userId: 'u', name: 'n', config: { kind: 'missing', reason: 'presence is not configured' } })
    await off.h.start()
    ok('presence.off.1 no config: no connection, and the roster says why by name',
      relay.connects.length === 0 && off.last()?.connection === 'off' && off.last()?.reason === 'presence is not configured' && off.h.rosters()[0]?.reason === 'presence is not configured')
    const out = hub(relay, { clock, identity: { kind: 'refused', reason: 'not signed in' } })
    await out.h.start()
    ok('presence.off.2 not signed in: no connection, refused by name', relay.connects.length === 0 && out.last()?.reason === 'not signed in')
    ok('presence.config.1 wss accepted; ws only to this machine; absent is named',
      P.readPresenceConfig({ TC_PRESENCE_URL: 'wss://x.example' }).kind === 'ok' &&
      P.readPresenceConfig({ TC_PRESENCE_URL: 'ws://127.0.0.1:1234' }).kind === 'ok' &&
      P.readPresenceConfig({ TC_PRESENCE_URL: 'ws://x.example' }).kind === 'missing' &&
      /TC_PRESENCE_URL/.test(P.readPresenceConfig({}).reason))
  }

  {
    const hostile = P.parsePresence({
      userId: 'u', displayName: 'x'.repeat(10_000), statusLine: 's'.repeat(10_000), selection: Array.from({ length: 5000 }, (_, i) => `p${i}`),
      color: 'red; background: url(x)', cursor: { x: NaN, y: 1 }, viewport: { x: 0, y: 0, scale: -1 }, agentStatus: 'pwned'
    })
    ok('presence.parse.1 a remote payload is bounded and typed before anything reads it',
      hostile.displayName.length === 80 && hostile.statusLine.length === 140 && hostile.selection.length === 200 &&
      /^#[0-9a-f]{6}$/.test(hostile.color) && hostile.cursor === null && hostile.viewport === null && hostile.agentStatus === 'none')
    ok('presence.parse.2 no userId is no peer', P.parsePresence({ displayName: 'x' }) === undefined && P.parsePresence(null) === undefined)
  }

  const failures = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failures.length}/${results.length} checks passed`)
  process.exitCode = failures.length ? 1 : 0
})().catch((e) => { console.log(`verify-presence threw: ${e && e.stack}`); process.exitCode = 1 })
