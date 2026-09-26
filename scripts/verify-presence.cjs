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
      JSON.stringify(keys) === JSON.stringify(['agentStatus', 'agents', 'color', 'currentPanelId', 'currentTask', 'cursor', 'displayName', 'initials', 'lastActivity', 'mode', 'observing', 'selection', 'statusLine', 'textCursor', 'userId', 'viewport']), JSON.stringify(keys))
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

  // ── M348: a shared workspace says when its sync is waiting ─────────────
  {
    const clock = { t: 5_000_000 }
    const relay = createRelay()
    let req = null
    const c = hub({ ...relay, connect: (r) => { req = r; return relay.connect(r) } }, { clock, userId: 'user-c', name: 'cy' })
    await c.h.start(); await tick()
    req.onUnsynced(3); await tick()
    const r3 = c.last()
    const before = c.emitted.length
    req.onUnsynced(3); await tick()
    const repeated = c.emitted.length - before
    req.onUnsynced(0); await tick()
    const r0 = c.last()
    ok('sync.roster.1 the provider\'s count of unacknowledged changes rides the roster, emitted when it CHANGES (not again for the same count), and absent at zero',
      r3?.unsynced === 3 && repeated === 0 && r0 !== undefined && !('unsynced' in r0), JSON.stringify({ r3: r3?.unsynced, repeated, r0 }))
    // Offline, nothing about anyone else can be known: a peer is not LIVE.
    const relay2 = createRelay()
    let reqD = null
    const clockD = { t: 6_000_000 }
    const d = hub({ ...relay2, connect: (r) => { reqD = r; return relay2.connect(r) } }, { clock: clockD, userId: 'user-d', name: 'di' })
    const e = hub(relay2, { clock: clockD, userId: 'user-e', name: 'ed' })
    await d.h.start(); await e.h.start(); await tick()
    const liveBefore = d.last()?.peers.find((p) => p.presence.userId === 'user-e')?.live
    reqD.onStatus('disconnected'); await tick()
    const offline = d.last()
    const liveOffline = offline?.peers.find((p) => p.presence.userId === 'user-e')?.live
    reqD.onStatus('connected'); await tick()
    const liveAgain = d.last()?.peers.find((p) => p.presence.userId === 'user-e')?.live
    ok('sync.roster.2 while our own room is disconnected every peer is reported NOT live (the strip dims them, the cursor layer stops painting them) — never frozen as live through a dead connection — and live again on reconnect',
      liveBefore === true && offline?.connection === 'disconnected' && liveOffline === false && liveAgain === true, JSON.stringify({ liveBefore, liveOffline, liveAgain }))
    // Each room's Awareness holds a live interval: a hub left running keeps the suite from exiting.
    d.h.stop(); e.h.stop()
    const L = P.syncLine
    const at = (connection, unsynced, reason) => ({ connection, ...(unsynced === undefined ? {} : { unsynced }), ...(reason === undefined ? {} : { reason }) })
    const table = [
      [L(at('connected'), true), null], [L(at('connected', 2), true), 'Syncing 2 changes…'],
      [L(at('connecting'), true), 'Reconnecting…'], [L(at('connecting', 1), true), 'Reconnecting — 1 change waiting'],
      [L(at('disconnected', 3), true), 'Offline — 3 changes waiting to sync'], [L(at('disconnected'), true), 'Offline — changes sync when the server is back'],
      [L(at('off', undefined, 'not signed in'), true), 'Not syncing — not signed in'],
      [L(at('disconnected', 3), false), null], [L(undefined, true), null]
    ]
    const wrong = table.filter(([got, want]) => got !== want)
    ok('sync.line.1 a SHARED workspace says what its sync is doing — offline with N waiting, reconnecting, catching up, off and why — and says nothing when connected and caught up, or when the workspace is not shared',
      wrong.length === 0, JSON.stringify(wrong))
    const { readFileSync } = require('node:fs')
    const canvas = readFileSync(join(root, 'src/renderer/canvas/Canvas.tsx'), 'utf8')
    const provider = readFileSync(join(root, 'src/main/presence/presence-provider.ts'), 'utf8')
    ok('sync.wire.1 the provider reports its unacknowledged count to the hub, and the canvas shows the chip under the roster, told whether the workspace is shared',
      /onUnsyncedChanges: \(\{ number \}\) => \{ onUnsynced\?\.\(number\) \}/.test(provider) &&
      /<SyncChip workspaceId=\{activeWorkspaceId\} shared=\{shared\.view !== null\} \/>/.test(canvas))
    c.h.stop()
  }

  // ── M349: a person's agents are roster citizens ─────────────────────────
  {
    const clock = { t: 7_000_000 }
    const relay = createRelay()
    const SECRET = 'ghp_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'
    const ws = [{ id: 'w1', panelIds: ['c1', 'c2', 't3'], titles: { c1: 'claude — tests', c2: `fix with ${SECRET}` } }]
    const f = hub(relay, { clock, userId: 'user-f', name: 'fay', workspaces: ws })
    const g = hub(relay, { clock, userId: 'user-g', name: 'gil' })
    await f.h.start(); await g.h.start(); await tick()
    f.h.agentEvent({ id: 'c1', type: 'status', status: 'streaming' })
    f.h.agentEvent({ id: 'c2', type: 'status', status: 'idle' })
    await tick()
    const seen = g.last()?.peers.find((p) => p.presence.userId === 'user-f')?.presence.agents ?? []
    ok('agents.payload.1 a person\'s agents ride their payload as WHOs — each panel with an agent, named by its title, with its own state — and a title leaves through the scrubber',
      seen.length === 2 && seen[0].id === 'c1' && seen[0].name === 'claude — tests' && seen[0].status === 'working' &&
      seen[1].status === 'idle' && !seen[1].name.includes(SECRET) && /\[redacted/.test(seen[1].name), JSON.stringify(seen))
    const before = g.emitted.length
    // The fold stays `working` (c1 still works) — only c2's own state moves.
    f.h.agentEvent({ id: 'c2', type: 'status', status: 'streaming' })
    await tick()
    const after = g.last()?.peers.find((p) => p.presence.userId === 'user-f')?.presence.agents ?? []
    ok('agents.payload.2 one agent\'s change is published even when the owner\'s folded status does not change (two agents working reads the same fold as one)',
      g.emitted.length > before && after.find((a) => a.id === 'c2')?.status === 'working', JSON.stringify(after))
    const parsed = P.parsePresence({ userId: 'u', displayName: 'U', agents: [
      ...Array.from({ length: 20 }, (_, i) => ({ id: `a${i}`, name: 'x'.repeat(200), status: 'working' })),
      { id: '', name: 'bad', status: 'working' }, { id: 'z', name: 'bad', status: 'none' }, 'not an object'] })
    ok('agents.parse.1 a received agent list is bounded: at most PRESENCE_AGENTS_MAX, names capped, a malformed or status-less entry dropped (never the whole payload)',
      parsed?.agents.length === P.PRESENCE_AGENTS_MAX && parsed.agents.every((a) => a.name.length <= 60) && P.parsePresence({ userId: 'u', displayName: 'U', agents: 'nope' })?.agents.length === 0,
      JSON.stringify({ n: parsed?.agents.length }))
    const { readFileSync: rf } = require('node:fs')
    const strip = rf(join(root, 'src/renderer/presence/RosterStrip.tsx'), 'utf8')
    ok('agents.strip.1 the roster strip draws each live peer\'s agents beside them, named with whose they are and what they are doing, and none for an away peer',
      /state !== 'away' && p\.presence\.agents\.map/.test(strip) && /data-roster-agent=\{a\.id\}/.test(strip) && /'s agent, \$\{agentWord\(AGENT_STATE\[a\.status\]\)\.word\}/.test(strip))
    f.h.stop(); g.h.stop()
  }

  const failures = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failures.length}/${results.length} checks passed`)
  process.exitCode = failures.length ? 1 : 0
})().catch((e) => { console.log(`verify-presence threw: ${e && e.stack}`); process.exitCode = 1 })
