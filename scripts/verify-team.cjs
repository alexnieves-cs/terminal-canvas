/* The Team view: tiles merged from awareness + the org's rows, health, the
   observer mode's read-only attach and its scrubbed canvas snapshot, follow
   mode's camera, and the reporter that writes the rows.
   Run with: npm run verify:team

   Plain node. Two REAL presence hubs over REAL yjs Docs and y-protocols
   Awareness, wired back to back in-process by the injected `connect` — a
   relay that carries awareness AND doc updates, as a Hocuspocus server does,
   minus the socket. Time and both hub timers are injected.

   What this cannot see: a live Hocuspocus server or Supabase project (RLS on
   the new migration is not exercised here), the renderer's pane (a DOM fact
   for an Electron suite; none pins it yet), and the F / Escape keybind. */
'use strict'
const { buildSync } = require('esbuild')
const { mkdirSync } = require('node:fs')
const { join } = require('node:path')
const { ok, results } = require('./lib/checks.cjs').createChecks()

const root = join(__dirname, '..')
mkdirSync(join(root, 'out/verify'), { recursive: true })
buildSync({
  stdin: {
    contents: "module.exports = { ...require('./src/main/presence/presence-hub.ts'), ...require('./src/main/presence/team-reporter.ts'), ...require('./src/shared/team.ts'), ...require('./src/shared/presence.ts'), awareness: require('y-protocols/awareness'), Y: require('yjs') }",
    resolveDir: root, loader: 'js'
  },
  outfile: join(root, 'out/verify/team.cjs'),
  bundle: true, platform: 'node', format: 'cjs', logLevel: 'error', external: ['electron', 'node-pty'],
  alias: { '@shared': join(root, 'src/shared') }
})
const T = require('../out/verify/team.cjs')
const { encodeAwarenessUpdate, applyAwarenessUpdate } = T.awareness
const Y = T.Y

const TOKEN = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789'

/** Awareness and doc relay: every doc joined to a name hears every other's updates. */
function createRelay() {
  const rooms = new Map()
  const connects = [], destroyed = [], docs = []
  const connect = ({ name, document, awareness, onStatus }) => {
    docs.push({ name, document })
    const members = rooms.get(name) ?? new Set()
    rooms.set(name, members)
    for (const other of members) {
      applyAwarenessUpdate(awareness, encodeAwarenessUpdate(other.awareness, [...other.awareness.getStates().keys()]), 'relay')
      Y.applyUpdate(document, Y.encodeStateAsUpdate(other.document), 'relay')
      Y.applyUpdate(other.document, Y.encodeStateAsUpdate(document), 'relay')
    }
    const me = { document, awareness }
    const onAw = ({ added, updated, removed }, origin) => {
      if (origin === 'relay') return
      const update = encodeAwarenessUpdate(awareness, [...added, ...updated, ...removed])
      for (const other of members) if (other !== me) applyAwarenessUpdate(other.awareness, update, 'relay')
    }
    const onDoc = (update, origin) => {
      if (origin === 'relay') return
      for (const other of members) if (other !== me) Y.applyUpdate(other.document, update, 'relay')
    }
    awareness.on('update', onAw)
    document.on('update', onDoc)
    members.add(me)
    connects.push(name)
    queueMicrotask(() => onStatus('connected'))
    return {
      destroy() {
        destroyed.push(name)
        awareness.off('update', onAw)
        document.off('update', onDoc)
        members.delete(me)
        const update = encodeAwarenessUpdate(awareness, [awareness.clientID], new Map([[awareness.clientID, null]]))
        for (const other of members) applyAwarenessUpdate(other.awareness, update, 'relay')
      }
    }
  }
  return { connect, connects, destroyed, docs }
}

function hub(relay, opts) {
  const emitted = [], observed = []
  const timers = new Map()
  const snapshotCalls = []
  const h = T.createPresenceHub({
    config: () => ({ kind: 'ok', url: 'wss://presence.example' }),
    identity: async () => ({ kind: 'ok', userId: opts.userId, displayName: opts.name, token: async () => 'T' }),
    workspaces: () => opts.workspaces,
    connect: relay.connect,
    emit: (r) => emitted.push(r),
    emitObserved: (o) => observed.push(o),
    ...(opts.snapshot === undefined ? {} : { snapshot: async (id) => { snapshotCalls.push(id); return opts.snapshot(id) } }),
    now: () => opts.clock.t,
    setInterval: (f, ms) => { timers.set(ms, f); return ms },
    clearInterval: (ms) => { timers.delete(ms) }
  })
  return { h, emitted, observed, snapshotCalls, fire: (ms) => timers.get(ms)?.(), lastObserved: () => observed[observed.length - 1] }
}

const tick = () => new Promise((r) => setTimeout(r, 0))
const settle = async () => { for (let i = 0; i < 6; i++) await tick() }

;(async () => {
  // ── tiles ────────────────────────────────────────────────────────────────
  {
    const now = Date.parse('2026-09-24T12:00:00Z')
    const peer = (userId, name, extra = {}) => ({
      clientId: 7, live: true, status: 'active', idleForMs: 10_000,
      presence: { userId, displayName: name, initials: T.initialsOf(name), color: T.colorOf(userId), currentPanelId: null, cursor: null, viewport: null, selection: [], mode: 'canvas', agentStatus: 'working', statusLine: '1 agent working', currentTask: 'Fix the login flow', observing: null, lastActivity: 0, ...extra }
    })
    const tiles = T.buildTeamTiles({
      me: 'me',
      members: [{ userId: 'me', login: 'me', role: 'owner' }, { userId: 'u-live', login: 'livia', role: 'member' }, { userId: 'u-row', login: 'rowan', role: 'admin' }, { userId: 'u-gone', login: 'gale', role: 'member' }],
      presence: [
        { userId: 'u-live', status: 'online', updatedAt: '2026-09-24T11:00:00Z', workspaceId: 'ws-old', currentTask: 'stale task', agentStatus: 'idle' },
        { userId: 'u-row', status: 'online', updatedAt: '2026-09-24T11:58:00Z', workspaceId: 'ws-r', currentTask: 'Write the release notes', agentStatus: 'needs-you' },
        { userId: 'u-gone', status: 'offline', updatedAt: '2026-09-24T09:00:00Z', workspaceId: 'ws-g', currentTask: '', agentStatus: 'none' }
      ],
      activity: [{ userId: 'u-gone', kind: 'task', summary: 'on Ship 5.1', at: '2026-09-24T09:00:00Z' }],
      rosters: [{ workspaceId: 'ws-live', connection: 'connected', peers: [peer('u-live', 'livia'), { ...peer('u-obs', 'otto', { mode: 'observing' }) }] }],
      now
    })
    const by = Object.fromEntries(tiles.map((t) => [t.userId, t]))
    ok('team.tiles.1 one tile per member but me; an observer peer is never a tile',
      tiles.length === 3 && by.me === undefined && by['u-obs'] === undefined, JSON.stringify(tiles.map((t) => t.userId)))
    ok('team.tiles.2 a live awareness peer outranks its row: task, agent status, workspace and age come from awareness',
      by['u-live'].currentTask === 'Fix the login flow' && by['u-live'].agentStatus === 'working' && by['u-live'].workspaceId === 'ws-live' && by['u-live'].activeAgoMs === 10_000 && by['u-live'].live === true,
      JSON.stringify(by['u-live']))
    ok('team.tiles.3 a row-only member takes the row: its workspace is the one observer mode attaches to',
      by['u-row'].workspaceId === 'ws-r' && by['u-row'].currentTask === 'Write the release notes' && by['u-row'].activeAgoMs === 120_000 && by['u-row'].live === false,
      JSON.stringify(by['u-row']))
    ok('team.tiles.4 order: the one who needs someone first, offline last; an offline member keeps their last activity line',
      tiles[0].userId === 'u-row' && tiles[2].userId === 'u-gone' && by['u-gone'].health === 'offline' && by['u-gone'].lastActivity === 'on Ship 5.1',
      JSON.stringify(tiles.map((t) => [t.userId, t.health])))
    const alone = T.buildTeamTiles({ me: null, members: [], presence: [], activity: [], rosters: [{ workspaceId: 'w', connection: 'connected', peers: [peer('u-live', 'livia')] }], now })
    ok('team.tiles.5 with no org rows (signed out, no account server) live peers still make tiles',
      alone.length === 1 && alone[0].workspaceId === 'w')
  }

  // ── health ───────────────────────────────────────────────────────────────
  {
    const h = (o) => T.healthOf({ agentStatus: 'idle', activeAgoMs: 0, live: true, rowStatus: 'online', ...o })
    ok('team.health.1 an agent fact outranks the person: error is failing, needs-you is waiting — even while away',
      h({ agentStatus: 'error' }) === 'failing' && h({ agentStatus: 'needs-you', activeAgoMs: 10 * 60_000 }) === 'waiting')
    ok('team.health.2 away at the presence idle threshold; offline when not live and past the offline threshold or marked offline',
      h({ activeAgoMs: T.PRESENCE_IDLE_MS }) === 'away' && h({ activeAgoMs: T.PRESENCE_IDLE_MS - 1 }) === 'healthy' &&
      h({ live: false, activeAgoMs: T.PRESENCE_OFFLINE_MS }) === 'offline' && h({ live: false, rowStatus: 'offline' }) === 'offline' &&
      h({ live: false, rowStatus: 'away', activeAgoMs: 60_000 }) === 'away')
  }

  // ── snapshot parse ───────────────────────────────────────────────────────
  {
    const good = { userId: 'u', workspaceId: 'w', at: 5, redacted: 1, panels: [{ id: 'a', kind: 'terminal', title: 'x'.repeat(500), state: 'working', x: 0, y: 0, w: 100, h: 80 }, { id: 'b', kind: 'note', title: '', state: '', x: 200, y: 0, w: 50, h: 50 }, { id: 'bad', x: 'no' }, { id: 'huge', x: 0, y: 0, w: 1e9, h: 10 }], edges: [{ from: 'a', to: 'b' }, { from: 'a', to: 'ghost' }] }
    const s = T.parseTeamSnapshot(JSON.stringify(good))
    ok('team.snapshot.1 a remote snapshot is parsed and bounded: malformed and oversized panels dropped, titles capped, edges only between known panels',
      s !== undefined && s.panels.length === 2 && s.panels[0].title.length === 120 && s.edges.length === 1 && s.redacted === 1, JSON.stringify(s && { n: s.panels.length, e: s.edges }))
    ok('team.snapshot.2 no identity, not JSON, or a multi-megabyte string is no snapshot',
      T.parseTeamSnapshot({ panels: [] }) === undefined && T.parseTeamSnapshot('{nope') === undefined && T.parseTeamSnapshot('"' + 'x'.repeat(2_100_000) + '"') === undefined)
  }

  // ── follow ───────────────────────────────────────────────────────────────
  {
    const box = { w: 800, h: 600 }
    const v = T.followViewport({ cursor: { x: 1000, y: -200 }, viewport: { x: 5, y: 5, scale: 0.3 } }, box, 0.5)
    // screen = world·scale + (x, y): the cursor must land at the box centre.
    ok('team.follow.1 following puts the peer\'s cursor at the centre of our box, at our own scale',
      v !== null && v.scale === 0.5 && 1000 * v.scale + v.x === 400 && -200 * v.scale + v.y === 300, JSON.stringify(v))
    const w = T.followViewport({ cursor: null, viewport: { x: 5, y: 7, scale: 0.3 } }, box, 0.5)
    ok('team.follow.2 with the cursor off their canvas, follow holds on their viewport; with neither, it holds ours (null)',
      w !== null && w.x === 5 && w.y === 7 && w.scale === 0.3 && T.followViewport({ cursor: null, viewport: null }, box, 1) === null)
  }

  // ── observer mode, over a relay ──────────────────────────────────────────
  {
    const clock = { t: 1_000_000 }
    const relay = createRelay()
    const a = hub(relay, {
      userId: 'user-a', name: 'Ada Lovelace', clock,
      workspaces: [{ id: 'wa', panelIds: ['p1', 'p2'] }],
      snapshot: async () => ({
        panels: [
          { id: 'p1', kind: 'terminal', title: `deploy with ${TOKEN}`, state: 'working', x: 0, y: 0, w: 400, h: 300 },
          { id: 'p2', kind: 'note', title: 'Plan', state: '', x: 500, y: 0, w: 200, h: 200 }
        ],
        edges: [{ from: 'p1', to: 'p2' }]
      })
    })
    const b = hub(relay, { userId: 'user-b', name: 'Bob', clock, workspaces: [{ id: 'wb', panelIds: [] }] })
    await a.h.start(); await b.h.start(); await settle()
    a.h.local({ workspaceId: 'wa', currentPanelId: 'p1', cursor: { x: 42, y: 24 }, viewport: { x: 0, y: 0, scale: 1 }, selection: ['p1'], mode: 'canvas', currentTask: `rotate ${TOKEN}` })
    await settle()
    const connectsBefore = relay.connects.length

    // Every doc update B's own side originates, to prove B writes nothing.
    b.h.observe({ workspaceId: 'wa', userId: 'user-a' })
    await settle()
    ok('team.observe.1 observing a workspace we have no room for joins ITS doc, once',
      relay.connects.length === connectsBefore + 1 && relay.connects[relay.connects.length - 1] === 'tc:workspace:wa')
    const seen = b.lastObserved()
    ok('team.observe.2 the observer sees the member live: cursor, selection, focused panel — and their task scrubbed of a token',
      seen?.peer?.presence.userId === 'user-a' && seen.peer.presence.cursor?.x === 42 && seen.peer.presence.selection[0] === 'p1' &&
      !seen.peer.presence.currentTask.includes(TOKEN) && seen.peer.presence.currentTask.includes('[redacted'),
      JSON.stringify(seen?.peer?.presence.currentTask))
    const aSees = a.emitted.filter((r) => r.workspaceId === 'wa').pop()?.peers.find((p) => p.presence.userId === 'user-b')
    ok('team.observe.3 the observed person SEES the observer — mode observing, naming whom — so a watch is never silent',
      aSees?.presence.mode === 'observing' && aSees.presence.observing === 'user-a' && aSees.presence.cursor === null)

    // The observer's arrival published the first snapshot at once (not at the beat).
    await settle()
    const snap = b.lastObserved()?.snapshot
    ok('team.snapshot.3 A publishes its canvas when observed: geometry and words through, the token scrubbed at the gate and counted',
      snap !== null && snap !== undefined && snap.panels.length === 2 && snap.panels[0].title === 'deploy with [redacted github token]' && snap.redacted === 1 && snap.edges.length === 1,
      JSON.stringify(snap))
    // A's own doc for wa is the FIRST one connected under that name.
    const aDoc = relay.docs.find((d) => d.name === 'tc:workspace:wa').document
    const writes = []
    const onWrite = (_u, origin) => { if (origin !== 'relay') writes.push(1) }
    aDoc.on('update', onWrite)
    const calls = a.snapshotCalls.length
    clock.t += 60_000
    await a.fire(T.TEAM_SNAPSHOT_MS); await settle()
    ok('team.snapshot.4 on the beat A asks its window again, but an unchanged canvas writes nothing to the doc',
      a.snapshotCalls.length === calls + 1 && writes.length === 0 && b.lastObserved()?.snapshot?.at === snap.at)

    // Detach: A drops its snapshot key on the next beat, B's observer leaves A's roster.
    b.h.observe(null); await settle()
    await a.fire(T.TEAM_SNAPSHOT_MS); await settle()
    const aAfter = a.emitted.filter((r) => r.workspaceId === 'wa').pop()?.peers.find((p) => p.presence.userId === 'user-b')
    ok('team.observe.4 detaching destroys the observer connection and A sees the observer leave',
      relay.destroyed.includes('tc:workspace:wa') && (aAfter === undefined || aAfter.live === false))
    aDoc.off('update', onWrite)
    ok('team.snapshot.6 once nobody observes, A deletes its snapshot key — no canvas is left in a shared doc',
      !aDoc.getMap(T.TEAM_DOC_MAP).has(T.snapshotKey('user-a')))
    const calls2 = a.snapshotCalls.length
    await a.fire(T.TEAM_SNAPSHOT_MS); await settle()
    ok('team.snapshot.5 with nobody observing, A never asks its window for a snapshot', a.snapshotCalls.length === calls2)
  }

  // ── read-only, measured on the doc ───────────────────────────────────────
  {
    const clock = { t: 5_000_000 }
    const relay = createRelay()
    let snapDocKeys = null
    const a = hub(relay, { userId: 'user-a', name: 'Ada', clock, workspaces: [{ id: 'wa', panelIds: [] }], snapshot: async () => ({ panels: [], edges: [] }) })
    // Wrap connect for B so its observer doc is visible to the check.
    const origin = []
    const bRelay = { ...relay, connect: (req) => {
      req.document.on('update', (_u, o) => { if (o !== 'relay') origin.push('b') })
      snapDocKeys = () => [...req.document.getMap(T.TEAM_DOC_MAP).keys()]
      return relay.connect(req)
    } }
    const b = hub(bRelay, { userId: 'user-b', name: 'Bob', clock, workspaces: [] })
    await a.h.start(); await b.h.start(); await settle()
    b.h.observe({ workspaceId: 'wa', userId: 'user-a' }); await settle(); await settle()
    ok('team.readonly.2 the observer originates no doc update; the only key in the team map is the observed person\'s own',
      origin.length === 0 && snapDocKeys !== null && JSON.stringify(snapDocKeys()) === JSON.stringify([T.snapshotKey('user-a')]),
      JSON.stringify({ origin, keys: snapDocKeys?.() }))
    b.h.stop(); a.h.stop()
  }

  // ── shared room: no second connection ───────────────────────────────────
  {
    const clock = { t: 9_000_000 }
    const relay = createRelay()
    const a = hub(relay, { userId: 'user-a', name: 'Ada', clock, workspaces: [{ id: 'w1', panelIds: [] }], snapshot: async () => ({ panels: [], edges: [] }) })
    const b = hub(relay, { userId: 'user-b', name: 'Bob', clock, workspaces: [{ id: 'w1', panelIds: [] }] })
    await a.h.start(); await b.h.start(); await settle()
    const before = relay.connects.length
    b.h.observe({ workspaceId: 'w1', userId: 'user-a' }); await settle()
    const bAsSeen = a.emitted.filter((r) => r.workspaceId === 'w1').pop()?.peers.find((p) => p.presence.userId === 'user-b')
    ok('team.observe.5 observing a workspace we already share reuses our room: no second connection, our payload names whom we observe',
      relay.connects.length === before && bAsSeen?.presence.observing === 'user-a' && bAsSeen.presence.mode !== 'observing' && b.lastObserved()?.peer?.presence.userId === 'user-a')
    b.h.observe(null); await settle()
    const bAfter = a.emitted.filter((r) => r.workspaceId === 'w1').pop()?.peers.find((p) => p.presence.userId === 'user-b')
    ok('team.observe.6 detaching from a shared room keeps the room and clears `observing`', bAfter?.presence.observing === null && !relay.destroyed.includes('tc:workspace:w1'))
  }

  // ── the reporter ─────────────────────────────────────────────────────────
  {
    const clock = { t: 100_000_000 }
    let summary = { workspaceId: 'w1', currentTask: 'Fix login', agentStatus: 'idle', statusLine: '1 agent idle', lastActivity: clock.t }
    const posts = []
    let fail = false
    const r = T.createTeamReporter({
      summary: () => summary,
      report: async (x) => { posts.push(x); return fail ? { ok: false } : { ok: true } },
      now: () => clock.t, setInterval: () => 1, clearInterval: () => {}
    })
    await r.tick()
    ok('team.report.1 the first pass writes the row, with no activity line', posts.length === 1 && posts[0].status === 'online' && posts[0].workspaceId === 'w1' && posts[0].activity === undefined)
    clock.t += 30_000; await r.tick()
    ok('team.report.2 nothing changed: nothing written', posts.length === 1)
    summary = { ...summary, agentStatus: 'working', statusLine: '1 agent working' }
    clock.t += 30_000; await r.tick()
    ok('team.report.3 an agent change writes the row and one activity line in the fold\'s words', posts.length === 2 && posts[1].activity?.kind === 'agent' && posts[1].activity.summary === '1 agent working')
    summary = { ...summary, agentStatus: 'needs-you', statusLine: '1 needs you' }
    clock.t += 10_000; await r.tick()
    ok('team.report.4 a second change inside a minute updates the row but writes no second line', posts.length === 3 && posts[2].activity === undefined)
    clock.t += 60_000; await r.tick()
    ok('team.report.5 after the gap, the change still owed its line gets it', posts.length === 4 && posts[3].activity?.summary === '1 needs you')
    fail = true
    summary = { ...summary, currentTask: 'Ship it' }
    clock.t += 61_000; await r.tick()
    fail = false
    clock.t += 1_000; await r.tick()
    ok('team.report.6 a failed write is retried with its activity line, not lost', posts.length === 6 && posts[5].activity?.summary === 'on Ship it')
    clock.t += T.PRESENCE_IDLE_MS; await r.tick()
    ok('team.report.7 idle past the presence threshold writes away', posts[posts.length - 1].status === 'away')
    await r.stop()
    ok('team.report.8 stopping writes offline', posts[posts.length - 1].status === 'offline')
  }

  console.log('\n' + '='.repeat(60))
  const failed = results.filter((x) => !x.pass)
  console.log(`${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
  process.exit(failed.length ? 1 : 0)
})().catch((error) => {
  console.log(`verify-team threw before it could report: ${(error && error.stack) || error}`)
  process.exit(1)
})
