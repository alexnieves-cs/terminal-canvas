/**
 * Presence: ONE Y.Doc per workspace, each with its own Awareness, connected to
 * the team's Hocuspocus server. The doc carries no shared content yet — only
 * awareness rides it — but it is a real Y.Doc on purpose, so shared canvas
 * state can land on the same connection later without a second transport.
 *
 * Main owns this, not the renderer, for the reason main owns every PTY: the
 * connection must outlive a reload, identity and the bearer token live here
 * (a token never crosses the bridge — account.ts), and agent status is main's
 * own fact (the agent:event fan-out in bootstrap/agent-runtime.ts feeds
 * `agentEvent`). The renderer reports only what it alone knows — the cursor,
 * the viewport, the selection — and paints what comes back.
 *
 * Two rates, deliberately:
 *   - the HEARTBEAT: every PRESENCE_HEARTBEAT_MS the whole payload is
 *     re-published, even unchanged, and every roster re-emitted, so idle and
 *     offline (judged on the receiver's clock, shared/presence.ts) advance
 *     without anyone moving;
 *   - a CHANGE: a renderer report or an agent-status change publishes at
 *     once. The renderer already throttles its reports to PRESENCE_RENDER_HZ,
 *     so a cursor is live rather than 30 seconds stale.
 *
 * No electron and no Hocuspocus import: `connect` is injected, so
 * verify:presence drives the whole hub under plain node with two in-process
 * Awareness instances wired back to back.
 */
import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import type { AgentSessionEvent } from '../../shared/agent-session'
import { redactSecrets } from '../../shared/redact'
import {
  OBSERVING_MODE, TEAM_DOC_MAP, TEAM_SNAPSHOT_MS, parseTeamSnapshot, snapshotKey,
  type TeamObserved, type TeamObserveRequest, type TeamSnapshot
} from '../../shared/team'
import {
  PRESENCE_FIELD, PRESENCE_HEARTBEAT_MS, colorOf, createPresenceTracker, foldAgentStatus, initialsOf, parsePresence,
  type LocalPresence, type PanelAgentState, type PresenceAgent, type PresencePayload, type PresenceRoster, type PresenceTracker, type RemotePeer, PRESENCE_AGENTS_MAX
} from '../../shared/presence'

export type PresenceConfigRead = { kind: 'ok'; url: string } | { kind: 'missing'; reason: string }

export type PresenceIdentity =
  | { kind: 'ok'; userId: string; displayName: string; token: () => Promise<string> }
  | { kind: 'refused'; reason: string }

export type ConnectionState = PresenceRoster['connection']

export interface PresenceConnection { destroy(): void }

export interface PresenceHubDeps {
  config: () => PresenceConfigRead
  identity: () => Promise<PresenceIdentity>
  /**
   * Every open workspace and its panels — the layout store's list, read at each
   * reconcile. M349: `titles` names a panel for the roster when it runs an agent
   * (scrubbed here before it is published).
   */
  workspaces: () => Array<{ id: string; panelIds: string[]; titles?: Record<string, string> }>
  connect: (req: {
    url: string
    name: string
    document: Y.Doc
    awareness: Awareness
    token: () => Promise<string>
    onStatus: (s: ConnectionState) => void
    /** M348. The provider's count of local doc changes the server has not acknowledged. */
    onUnsynced?: (n: number) => void
  }) => PresenceConnection
  emit: (roster: PresenceRoster) => void
  /**
   * This machine's canvas for one workspace, for an observer: panels with
   * their geometry and `canvas:model` words, and the edges. RAW — the hub
   * scrubs every title with redactSecrets before it leaves (the outward
   * gate sits where the text leaves, not where it is gathered). Null when no
   * window answered. Absent: this machine never publishes a snapshot.
   */
  snapshot?: (workspaceId: string) => Promise<{ panels: TeamSnapshot['panels']; edges: TeamSnapshot['edges'] } | null>
  /** Observer mode's push: the observed member's awareness and snapshot. */
  emitObserved?: (observed: TeamObserved) => void
  /**
   * The document name for a workspace. One place: a SHARED workspace names its
   * Supabase share id (`tc:workspace:<uuid>`), which is what lets two people's
   * per-machine workspaces meet in one doc; an unshared one keeps its local
   * id. Re-read on every reconcile — a workspace just shared moves rooms.
   */
  docName?: (workspaceId: string) => string
  /**
   * The shared canvas (canvas-sync.ts): handed each room's doc BEFORE it
   * connects, so persisted state is in the doc when the server's sync step
   * compares. Returns the unbind, called when the room closes.
   */
  bindCanvas?: (workspaceId: string, doc: Y.Doc) => () => void
  now?: () => number
  setInterval?: (f: () => void, ms: number) => unknown
  clearInterval?: (h: unknown) => void
}

export interface PresenceHub {
  start(): Promise<void>
  stop(): void
  /** A renderer report; publishes at once. */
  local(report: LocalPresence): void
  /** One agent:event from the manager's fan-out. */
  agentEvent(event: AgentSessionEvent): void
  /** Every workspace's roster as of now, for a renderer that just loaded. */
  rosters(): PresenceRoster[]
  /** Re-read the workspace list: connect new ones, drop removed ones. */
  reconcile(): void
  /**
   * Observer mode: attach read-only to one member's workspace. Reuses our own
   * room when we already share that workspace; otherwise joins its doc as an
   * OBSERVER peer (mode 'observing', no cursor, no selection) — visible to
   * the people there, writing nothing to the doc. Null detaches.
   */
  observe(req: TeamObserveRequest | null): void
  /**
   * The most recently active room's facts, for the Team view's server rows
   * (team-reporter.ts). Null when presence is off or no room is open.
   */
  summary(): { workspaceId: string; currentTask: string; agentStatus: PresencePayload['agentStatus']; statusLine: string; lastActivity: number } | null
}

interface Room {
  id: string
  /** The doc name it connected under — a change (a share) reopens the room. */
  name: string
  unbind: () => void
  doc: Y.Doc
  awareness: Awareness
  connection: PresenceConnection
  tracker: PresenceTracker
  state: ConnectionState
  /** M348. Changes waiting for the server (the provider's count). */
  unsynced: number
  local: Omit<LocalPresence, 'workspaceId'>
  lastActivity: number
  panelIds: Set<string>
  /** M349. Panel titles, for naming this room's agents on the roster. */
  titles: Record<string, string>
  /** The last agent fold published, so an unrelated event does not republish. */
  agentKey: string
  /** The last snapshot this machine published into the doc (sans time), so an unchanged canvas is not re-sent. */
  snapshotKey: string
  snapshotBusy: boolean
}

/** A read-only room joined only to observe; never in `rooms`, so reconcile leaves it alone. */
interface ObserverRoom {
  req: TeamObserveRequest
  doc: Y.Doc
  awareness: Awareness
  tracker: PresenceTracker
  state: ConnectionState
  /** Our own room, reused — then nothing here is ours to destroy. */
  shared: Room | null
  connection: PresenceConnection
  off: () => void
}

const EMPTY_LOCAL: Omit<LocalPresence, 'workspaceId'> = { currentPanelId: null, cursor: null, viewport: null, selection: [], textCursor: null, mode: 'canvas', currentTask: '' }

export function createPresenceHub(deps: PresenceHubDeps): PresenceHub {
  const now = deps.now ?? Date.now
  const every = deps.setInterval ?? ((f, ms) => { const h = setInterval(f, ms); h.unref?.(); return h })
  const cancel = deps.clearInterval ?? ((h) => clearInterval(h as ReturnType<typeof setInterval>))
  const docName = deps.docName ?? ((id: string) => `tc:workspace:${id}`)

  const rooms = new Map<string, Room>()
  /** Per panel, from agent:event. Kept across reconciles: an agent outlives a workspace list re-read. */
  const agentStates = new Map<string, PanelAgentState>()
  /** Pending permission requests per panel — needs-you until each is answered or dropped. */
  const pending = new Map<string, Set<string>>()
  let identity: Extract<PresenceIdentity, { kind: 'ok' }> | null = null
  let url: string | null = null
  let offReason: string | null = null
  let beat: unknown = null
  let snapBeat: unknown = null
  let stopped = false
  let observer: ObserverRoom | null = null

  const foldFor = (room: Room): ReturnType<typeof foldAgentStatus> =>
    foldAgentStatus([...room.panelIds].map((id) => agentStates.get(id)).filter((s): s is PanelAgentState => s !== undefined))

  /**
   * M349. The room's agents as roster citizens: every panel here with an agent
   * state, in canvas order, cut at PRESENCE_AGENTS_MAX. The name is the panel's
   * title — the person's own words — so it goes through the outward gate's
   * scrubber before it leaves, like the task title below.
   */
  const agentsFor = (room: Room): PresenceAgent[] =>
    [...room.panelIds].filter((id) => agentStates.has(id)).slice(0, PRESENCE_AGENTS_MAX).map((id) => ({
      id, name: redactSecrets(room.titles[id] || 'agent').text.slice(0, 60), status: agentStates.get(id) as PresenceAgent['status']
    }))
  const agentKeyOf = (room: Room, fold: ReturnType<typeof foldAgentStatus>): string =>
    `${fold.agentStatus}|${fold.statusLine}|${agentsFor(room).map((a) => `${a.id}:${a.status}:${a.name}`).join(',')}`

  const payloadOf = (room: Room): PresencePayload | null => {
    if (identity === null) return null
    const { currentTask, textCursor, ...local } = room.local
    return {
      userId: identity.userId,
      displayName: identity.displayName,
      initials: initialsOf(identity.displayName),
      color: colorOf(identity.userId),
      ...local,
      textCursor: textCursor ?? null,
      ...foldFor(room),
      // A task title is the person's own words and leaves the machine here:
      // the outward gate's scrubber, before it is published.
      currentTask: redactSecrets(currentTask ?? '').text.slice(0, 140),
      observing: observer?.shared === room ? observer.req.userId : null,
      lastActivity: room.lastActivity,
      agents: agentsFor(room)
    }
  }

  // ── observer mode ────────────────────────────────────────────────────────

  /** The observed person's freshest live peer in the observer's room. */
  const targetPeer = (o: ObserverRoom): RemotePeer | null => {
    const mine = o.tracker.peers(now()).filter((p) => p.presence.userId === o.req.userId && p.presence.mode !== OBSERVING_MODE)
    mine.sort((a, b) => Number(b.live) - Number(a.live) || a.idleForMs - b.idleForMs)
    return mine[0] ?? null
  }

  const emitObserved = (o: ObserverRoom): void => {
    if (observer !== o || deps.emitObserved === undefined) return
    const raw = o.doc.getMap(TEAM_DOC_MAP).get(snapshotKey(o.req.userId))
    const snap = parseTeamSnapshot(raw)
    deps.emitObserved({
      workspaceId: o.req.workspaceId, userId: o.req.userId, connection: o.state,
      peer: targetPeer(o),
      // A snapshot that names another person or workspace is not this one's.
      snapshot: snap !== undefined && snap.userId === o.req.userId && snap.workspaceId === o.req.workspaceId ? snap : null
    })
  }

  const observerPayload = (req: TeamObserveRequest): PresencePayload | null => identity === null ? null : ({
    userId: identity.userId, displayName: identity.displayName, initials: initialsOf(identity.displayName), color: colorOf(identity.userId),
    currentPanelId: null, cursor: null, viewport: null, selection: [], textCursor: null, mode: OBSERVING_MODE,
    agentStatus: 'none', statusLine: 'observing (read-only)', currentTask: '', observing: req.userId, lastActivity: now(),
    // An observer runs nothing in the room it watches.
    agents: []
  })

  const detach = (): void => {
    const o = observer
    if (o === null) return
    observer = null
    o.off()
    if (o.shared !== null) { publish(o.shared); return }
    o.connection.destroy()
    o.awareness.destroy()
    o.doc.destroy()
    o.tracker.clear()
  }

  const attach = (req: TeamObserveRequest): void => {
    detach()
    if (url === null || identity === null) {
      deps.emitObserved?.({ ...req, connection: 'off', ...(offReason === null ? {} : { reason: offReason }), peer: null, snapshot: null })
      return
    }
    const shared = rooms.get(req.workspaceId) ?? null
    const doc = shared?.doc ?? new Y.Doc()
    const awareness = shared?.awareness ?? new Awareness(doc)
    const tracker = shared?.tracker ?? createPresenceTracker()
    const o: ObserverRoom = { req, doc, awareness, tracker, state: shared?.state ?? 'connecting', shared, connection: { destroy() {} }, off: () => {} }
    observer = o
    const map = doc.getMap(TEAM_DOC_MAP)
    const onMap = (e: Y.YMapEvent<unknown>): void => { if (e.keysChanged.has(snapshotKey(req.userId))) emitObserved(o) }
    map.observe(onMap)
    if (shared !== null) {
      // Our own room already tracks its peers; we only listen, and say in our
      // own payload whom we observe so their machine starts publishing.
      const onUpdate = (): void => { o.state = shared.state; emitObserved(o) }
      awareness.on('update', onUpdate)
      o.off = () => { map.unobserve(onMap); awareness.off('update', onUpdate) }
      publish(shared)
      emitObserved(o)
      return
    }
    const onUpdate = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }): void => {
      if (observer !== o) return
      for (const clientId of [...added, ...updated]) {
        if (clientId === doc.clientID) continue
        const presence = parsePresence((awareness.getStates().get(clientId) as Record<string, unknown> | undefined)?.[PRESENCE_FIELD])
        if (presence !== undefined) tracker.seen(clientId, presence, now())
      }
      for (const clientId of removed) if (clientId !== doc.clientID) tracker.left(clientId)
      emitObserved(o)
    }
    awareness.on('update', onUpdate)
    o.off = () => { map.unobserve(onMap); awareness.off('update', onUpdate) }
    const identityNow = identity
    o.connection = deps.connect({
      url, name: docName(req.workspaceId), document: doc, awareness, token: identityNow.token,
      onStatus: (st) => {
        if (observer !== o) return
        o.state = st
        if (st === 'connected') { const p = observerPayload(req); if (p !== null) awareness.setLocalStateField(PRESENCE_FIELD, p) }
        emitObserved(o)
      }
    })
    const p = observerPayload(req)
    if (p !== null) awareness.setLocalStateField(PRESENCE_FIELD, p)
    emitObserved(o)
  }

  /**
   * Publish this machine's canvas into a room's doc while — and only while —
   * a live peer there is observing US. Titles pass redactSecrets here, where
   * they leave; no cwd, cost or terminal text is ever included. When the last
   * observer leaves, our key is deleted: a canvas is not left in a shared
   * doc for someone who is no longer looking.
   */
  const publishSnapshots = async (): Promise<void> => {
    if (identity === null || deps.snapshot === undefined) return
    const me = identity.userId
    for (const room of rooms.values()) {
      const watched = room.tracker.peers(now()).some((p) => p.live && p.presence.observing === me)
      const map = room.doc.getMap(TEAM_DOC_MAP)
      if (!watched) {
        if (room.snapshotKey !== '') { room.snapshotKey = ''; map.delete(snapshotKey(me)) }
        continue
      }
      if (room.snapshotBusy) continue
      room.snapshotBusy = true
      try {
        const raw = await deps.snapshot(room.id)
        if (raw === null || rooms.get(room.id) !== room) continue
        let redacted = 0
        const panels = raw.panels.slice(0, 400).map((p) => {
          const { text, count } = redactSecrets(p.title)
          redacted += count
          return { ...p, title: text.slice(0, 120) }
        })
        const body = { userId: me, workspaceId: room.id, panels, edges: raw.edges.slice(0, 1000), redacted }
        const key = JSON.stringify(body)
        if (key === room.snapshotKey) continue
        room.snapshotKey = key
        map.set(snapshotKey(me), JSON.stringify({ ...body, at: now() }))
      } finally {
        room.snapshotBusy = false
      }
    }
  }

  const publish = (room: Room): void => {
    const payload = payloadOf(room)
    if (payload === null) return
    room.agentKey = agentKeyOf(room, foldFor(room))
    room.awareness.setLocalStateField(PRESENCE_FIELD, payload)
  }

  // M348. While OUR room is not connected, nothing about anyone else can be
  // known: every peer is reported not live (away — the strip dims them, the
  // cursor layer stops painting them) rather than frozen as they last were,
  // which read as a teammate present in real time through a dead connection.
  const rosterOf = (room: Room): PresenceRoster => {
    const peers = room.tracker.peers(now())
    return {
      workspaceId: room.id, connection: room.state,
      peers: room.state === 'connected' ? peers : peers.map((p) => ({ ...p, live: false })),
      ...(room.unsynced > 0 ? { unsynced: room.unsynced } : {})
    }
  }

  const emitRoom = (room: Room): void => { deps.emit(rosterOf(room)) }

  const open = (id: string, panelIds: string[]): void => {
    if (url === null || identity === null) return
    const doc = new Y.Doc()
    const awareness = new Awareness(doc)
    const tracker = createPresenceTracker()
    const room: Room = {
      id, name: docName(id), unbind: () => {}, doc, awareness, tracker, state: 'connecting', unsynced: 0, local: { ...EMPTY_LOCAL }, lastActivity: now(),
      panelIds: new Set(panelIds), titles: deps.workspaces().find((w) => w.id === id)?.titles ?? {}, agentKey: '', snapshotKey: '', snapshotBusy: false,
      connection: { destroy() {} }
    }
    rooms.set(id, room)
    // 'update', not 'change': y-protocols renews an unchanged state every 15s
    // and reports it only as an update — that renewal is what keeps a quiet
    // peer's heartbeat fresh here.
    awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
      if (rooms.get(id) !== room) return
      let touched = false
      for (const clientId of [...added, ...updated]) {
        if (clientId === doc.clientID) continue
        const presence = parsePresence((awareness.getStates().get(clientId) as Record<string, unknown> | undefined)?.[PRESENCE_FIELD])
        if (presence === undefined) continue
        tracker.seen(clientId, presence, now())
        touched = true
      }
      for (const clientId of removed) {
        if (clientId === doc.clientID) continue
        tracker.left(clientId)
        touched = true
      }
      if (touched) emitRoom(room)
      // Someone just started observing us: the first snapshot now, not up
      // to TEAM_SNAPSHOT_MS later. Only while none is published yet — this
      // handler runs at cursor rate, and the timer carries every later one.
      if (touched && room.snapshotKey === '' && identity !== null && room.tracker.peers(now()).some((p) => p.live && p.presence.observing === identity?.userId)) {
        void publishSnapshots().catch(() => {})
      }
    })
    room.unbind = deps.bindCanvas?.(id, doc) ?? (() => {})
    const identityNow = identity
    room.connection = deps.connect({
      url, name: room.name, document: doc, awareness, token: identityNow.token,
      onStatus: (s) => {
        if (rooms.get(id) !== room) return
        room.state = s
        // Our own state again on every (re)connect: a server that restarted
        // holds nothing for us until we publish.
        if (s === 'connected') publish(room)
        emitRoom(room)
      },
      onUnsynced: (n) => {
        if (rooms.get(id) !== room || room.unsynced === n) return
        room.unsynced = n
        emitRoom(room)
      }
    })
    publish(room)
    emitRoom(room)
  }

  const close = (room: Room): void => {
    // An observer riding this room goes with it; the view is told it ended.
    if (observer?.shared === room) {
      const req = observer.req
      detach()
      deps.emitObserved?.({ ...req, connection: 'disconnected', peer: null, snapshot: null })
    }
    rooms.delete(room.id)
    room.unbind()
    room.connection.destroy()
    room.awareness.destroy()
    room.doc.destroy()
    room.tracker.clear()
  }

  const reconcile = (): void => {
    if (stopped) return
    const list = deps.workspaces()
    const ids = new Set(list.map((w) => w.id))
    for (const room of [...rooms.values()]) if (!ids.has(room.id)) close(room)
    for (const w of list) {
      let room = rooms.get(w.id)
      // Shared (or unshared) since it opened: a different doc name is a
      // different room, and the old one's doc is not this one's.
      if (room !== undefined && room.name !== docName(w.id)) { close(room); room = undefined }
      if (room === undefined) { open(w.id, w.panelIds); continue }
      room.panelIds = new Set(w.panelIds)
      room.titles = w.titles ?? {}
    }
  }

  const heartbeat = (): void => {
    reconcile()
    for (const room of rooms.values()) { publish(room); emitRoom(room) }
  }

  const offRosters = (): PresenceRoster[] =>
    deps.workspaces().map((w) => ({ workspaceId: w.id, connection: 'off' as const, ...(offReason === null ? {} : { reason: offReason }), peers: [] }))

  const setAgent = (panelId: string, next: PanelAgentState | undefined): void => {
    if (next === undefined) agentStates.delete(panelId)
    else agentStates.set(panelId, next)
    for (const room of rooms.values()) {
      if (!room.panelIds.has(panelId)) continue
      const fold = foldFor(room)
      if (agentKeyOf(room, fold) !== room.agentKey) publish(room)
    }
  }

  return {
    async start() {
      stopped = false
      const cfg = deps.config()
      if (cfg.kind === 'missing') { offReason = cfg.reason; for (const r of offRosters()) deps.emit(r); return }
      const who = await deps.identity()
      if (stopped) return
      if (who.kind === 'refused') { offReason = who.reason; for (const r of offRosters()) deps.emit(r); return }
      url = cfg.url
      identity = who
      offReason = null
      reconcile()
      beat = every(heartbeat, PRESENCE_HEARTBEAT_MS)
      snapBeat = every(() => { void publishSnapshots().catch(() => {}) }, TEAM_SNAPSHOT_MS)
    },

    stop() {
      stopped = true
      if (beat !== null) { cancel(beat); beat = null }
      if (snapBeat !== null) { cancel(snapBeat); snapBeat = null }
      detach()
      for (const room of [...rooms.values()]) close(room)
    },

    local(report) {
      let room = rooms.get(report.workspaceId)
      // A workspace created since the last beat: pick it up now rather than
      // up to 30 seconds late.
      if (room === undefined) { reconcile(); room = rooms.get(report.workspaceId) }
      if (room === undefined) return
      const { workspaceId: _w, ...next } = report
      if (JSON.stringify(next) === JSON.stringify(room.local)) return
      room.local = next
      room.lastActivity = now()
      publish(room)
    },

    agentEvent(event) {
      const id = event.id
      switch (event.type) {
        case 'permission-request': {
          const set = pending.get(id) ?? new Set<string>()
          set.add(event.requestId)
          pending.set(id, set)
          setAgent(id, 'needs-you')
          return
        }
        case 'permission-answered':
        case 'permission-dropped':
        case 'permission-auto-allowed': {
          const set = pending.get(id)
          set?.delete(event.requestId)
          if (set !== undefined && set.size === 0) pending.delete(id)
          if (agentStates.get(id) === 'needs-you' && !pending.has(id)) setAgent(id, 'working')
          return
        }
        case 'status': {
          if (event.status === 'disposed') { pending.delete(id); setAgent(id, undefined); return }
          if (pending.has(id)) return
          const next: PanelAgentState =
            event.status === 'streaming' || event.status === 'starting' ? 'working'
              : event.status === 'exited' ? (event.exitCode === 0 || event.exitCode === undefined || event.exitCode === null ? 'idle' : 'error')
                : 'idle'
          setAgent(id, next)
          return
        }
        default:
          return
      }
    },

    rosters() {
      if (rooms.size === 0) return offRosters()
      return [...rooms.values()].map(rosterOf)
    },

    reconcile,

    observe(req) {
      if (req === null) { detach(); return }
      if (observer !== null && observer.req.userId === req.userId && observer.req.workspaceId === req.workspaceId) { emitObserved(observer); return }
      attach(req)
    },

    summary() {
      let best: Room | null = null
      for (const room of rooms.values()) if (best === null || room.lastActivity > best.lastActivity) best = room
      if (best === null) return null
      const p = payloadOf(best)
      if (p === null) return null
      return { workspaceId: best.id, currentTask: p.currentTask, agentStatus: p.agentStatus, statusLine: p.statusLine, lastActivity: best.lastActivity }
    }
  }
}

/**
 * `TC_PRESENCE_URL`: the Hocuspocus server. wss, or plain ws to this machine
 * only — a presence payload names what a person is looking at, and it does
 * not cross a network in the clear. Same shape as readAccountConfig.
 */
export function readPresenceConfig(...envs: Array<Record<string, string | undefined>>): PresenceConfigRead {
  let raw: string | undefined
  for (const env of envs) { const v = env['TC_PRESENCE_URL']; if (v !== undefined && v.trim() !== '') { raw = v.trim(); break } }
  if (raw === undefined) return { kind: 'missing', reason: 'presence is not configured — set TC_PRESENCE_URL to the Hocuspocus server' }
  let parsed: URL
  try { parsed = new URL(raw) } catch { return { kind: 'missing', reason: 'TC_PRESENCE_URL is not a URL' } }
  const local = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost'
  if (parsed.protocol !== 'wss:' && !(parsed.protocol === 'ws:' && local)) {
    return { kind: 'missing', reason: 'TC_PRESENCE_URL must be wss (or ws to 127.0.0.1 for a local server)' }
  }
  return { kind: 'ok', url: raw }
}
