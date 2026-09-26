/**
 * The Team view: one tile per organization member, merged from three sources
 * that each know something the others do not —
 *
 *   - Yjs AWARENESS (shared/presence.ts): live, sub-second, but only for
 *     people on a workspace this machine has a room for;
 *   - the Supabase `presence` row: who is signed in anywhere in the org, and
 *     which workspace they were last on — the only source that can name a
 *     workspace to attach to for someone we share no room with;
 *   - `activity_log`: what they last did, for someone who is not here now.
 *
 * And the observer mode's snapshot: another member's canvas, read-only, as
 * their own machine answered `canvas:model` and published it on the shared
 * Y.Doc (main/presence/presence-hub.ts). It arrives from another machine, so
 * it is parsed and bounded here before anything reads it — the imported-
 * canvas rule: inert until a person looks, and never trusted for its shape.
 *
 * Imports only shared/presence, so main, the renderer and the plain-node
 * verify tier read one declaration.
 */
import {
  PRESENCE_IDLE_MS, PRESENCE_OFFLINE_MS, colorOf, initialsOf,
  type AgentPresenceStatus, type PresenceRoster, type RemotePeer
} from './presence'

export interface TeamOrg { id: string; name: string }

export interface TeamMemberRow { userId: string; login: string; role: string }

export type TeamPresenceStatus = 'online' | 'away' | 'offline'

export interface TeamPresenceRow {
  userId: string
  status: TeamPresenceStatus
  /** Server time, ISO. Compared against OUR clock — see `ageOf` for why that is tolerated here. */
  updatedAt: string
  workspaceId: string | null
  currentTask: string
  agentStatus: AgentPresenceStatus
}

export interface TeamActivityRow { userId: string; kind: string; summary: string; at: string }

/** `team:list`. Metadata only: no token crosses the bridge (account.ts's rule). */
export type TeamListResult =
  | { kind: 'ok'; me: string; org: TeamOrg; orgs: TeamOrg[]; members: TeamMemberRow[]; presence: TeamPresenceRow[]; activity: TeamActivityRow[] }
  | { kind: 'refused' | 'failed'; reason: string }

/**
 * One person's overall state, as the tile's colour. Distinct from the agent
 * dot on purpose: a person can be online with a stopped agent, or away with
 * one still working, and a tile that folded both into one colour would hide
 * which.
 */
export type TeamHealth = 'healthy' | 'waiting' | 'failing' | 'away' | 'offline'

export interface TeamTile {
  userId: string
  name: string
  initials: string
  color: string
  role: string | null
  currentTask: string
  /** ms since this person last did anything, on our clock; null when no source knows. */
  activeAgoMs: number | null
  agentStatus: AgentPresenceStatus
  health: TeamHealth
  /** Where observer mode attaches; null when no source names a workspace. */
  workspaceId: string | null
  /** True when a live awareness peer backs this tile (sub-second facts), false when only rows do. */
  live: boolean
  /** The last activity line, for a person who is not here now. */
  lastActivity: string
}

const TEAM_AGENT: readonly AgentPresenceStatus[] = ['none', 'idle', 'working', 'needs-you', 'error']
const TEAM_STATUS: readonly TeamPresenceStatus[] = ['online', 'away', 'offline']
const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' ? v.slice(0, max) : undefined)

/**
 * The server's rows, parsed and bounded. PostgREST answers with whatever the
 * columns hold; a row with no user id is dropped rather than shown as nobody.
 */
export function parseTeamRows(raw: { members: unknown; presence: unknown; activity: unknown }): Pick<Extract<TeamListResult, { kind: 'ok' }>, 'members' | 'presence' | 'activity'> {
  const arr = (v: unknown): Array<Record<string, unknown>> =>
    (Array.isArray(v) ? v : []).filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null).slice(0, 500)
  const members = arr(raw.members).flatMap((r) => {
    const userId = str(r['user_id'], 64)
    if (userId === undefined || userId === '') return []
    const users = r['users'] as Record<string, unknown> | null | undefined
    const login = str(users?.['github_login'], 80) ?? ''
    return [{ userId, login: login === '' ? userId.slice(0, 8) : login, role: str(r['role'], 16) ?? 'member' }]
  })
  const presence = arr(raw.presence).flatMap((r) => {
    const userId = str(r['user_id'], 64)
    if (userId === undefined || userId === '') return []
    return [{
      userId,
      status: TEAM_STATUS.includes(r['status'] as TeamPresenceStatus) ? r['status'] as TeamPresenceStatus : 'offline',
      updatedAt: str(r['updated_at'], 40) ?? '',
      workspaceId: str(r['workspace_id'], 128) ?? null,
      currentTask: str(r['current_task'], 140) ?? '',
      agentStatus: TEAM_AGENT.includes(r['agent_status'] as AgentPresenceStatus) ? r['agent_status'] as AgentPresenceStatus : 'none'
    }]
  })
  const activity = arr(raw.activity).flatMap((r) => {
    const userId = str(r['user_id'], 64)
    if (userId === undefined || userId === '') return []
    return [{ userId, kind: str(r['kind'], 16) ?? '', summary: str(r['summary'], 200) ?? '', at: str(r['created_at'], 40) ?? '' }]
  })
  return { members, presence, activity }
}

/**
 * A server timestamp's age on our clock. The presence module never does this
 * for awareness (two Macs disagree by minutes), but a Postgres `now()` is one
 * clock for everyone and an age of "4 min" vs "5 min" is all a tile says; a
 * negative age (our clock behind the server's) reads as just now.
 */
function ageOf(iso: string, now: number): number | null {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? Math.max(0, now - t) : null
}

export function healthOf(input: { agentStatus: AgentPresenceStatus; activeAgoMs: number | null; live: boolean; rowStatus: TeamPresenceStatus | null }): TeamHealth {
  const { agentStatus, activeAgoMs, live, rowStatus } = input
  const gone = !live && (rowStatus === null || rowStatus === 'offline' || activeAgoMs === null || activeAgoMs >= PRESENCE_OFFLINE_MS)
  if (gone) return 'offline'
  // An agent's facts outrank the person's: a stopped agent is the news even
  // when its owner stepped away.
  if (agentStatus === 'error') return 'failing'
  if (agentStatus === 'needs-you') return 'waiting'
  if (rowStatus === 'away' && !live) return 'away'
  if (activeAgoMs !== null && activeAgoMs >= PRESENCE_IDLE_MS) return 'away'
  return 'healthy'
}

/**
 * The tiles, one per member (everyone but `me`), in a stable order: the ones
 * who need someone first, then by name. With no rows at all (signed out, or
 * no account server) the live awareness peers still make tiles — presence
 * works without Supabase, and so should the view.
 */
export function buildTeamTiles(input: {
  me: string | null
  members: readonly TeamMemberRow[]
  presence: readonly TeamPresenceRow[]
  activity: readonly TeamActivityRow[]
  rosters: readonly PresenceRoster[]
  now: number
}): TeamTile[] {
  const { me, now } = input
  // The freshest live peer per user, and the room it was seen in — that room
  // IS a workspace we can attach to.
  const peers = new Map<string, { peer: RemotePeer; workspaceId: string }>()
  for (const r of input.rosters) {
    for (const p of r.peers) {
      if (p.presence.mode === 'observing') continue
      const cur = peers.get(p.presence.userId)
      if (cur === undefined || (p.live && !cur.peer.live) || (p.live === cur.peer.live && p.idleForMs < cur.peer.idleForMs)) {
        peers.set(p.presence.userId, { peer: p, workspaceId: r.workspaceId })
      }
    }
  }
  const rowOf = new Map(input.presence.map((p) => [p.userId, p]))
  const lastActivityOf = new Map<string, TeamActivityRow>()
  for (const a of input.activity) {
    const cur = lastActivityOf.get(a.userId)
    if (cur === undefined || a.at > cur.at) lastActivityOf.set(a.userId, a)
  }
  const ids = input.members.length > 0
    ? input.members.map((m) => m.userId)
    : [...peers.keys()]
  const memberOf = new Map(input.members.map((m) => [m.userId, m]))

  const tiles = ids.filter((id) => id !== me).map((userId): TeamTile => {
    const m = memberOf.get(userId)
    const live = peers.get(userId)
    const row = rowOf.get(userId)
    const act = lastActivityOf.get(userId)
    const name = live?.peer.presence.displayName ?? m?.login ?? userId.slice(0, 8)
    const ages = [
      live === undefined ? null : live.peer.idleForMs,
      row === undefined ? null : ageOf(row.updatedAt, now),
      act === undefined ? null : ageOf(act.at, now)
    ].filter((a): a is number => a !== null)
    const activeAgoMs = ages.length === 0 ? null : Math.min(...ages)
    const isLive = live?.peer.live === true
    const agentStatus = live?.peer.presence.agentStatus ?? row?.agentStatus ?? 'none'
    return {
      userId,
      name,
      initials: live?.peer.presence.initials ?? initialsOf(name),
      color: live?.peer.presence.color ?? colorOf(userId),
      role: m?.role ?? null,
      currentTask: (live?.peer.presence.currentTask || row?.currentTask) ?? '',
      activeAgoMs,
      agentStatus,
      health: healthOf({ agentStatus, activeAgoMs, live: isLive, rowStatus: row?.status ?? null }),
      workspaceId: live?.workspaceId ?? row?.workspaceId ?? null,
      live: isLive,
      lastActivity: act?.summary ?? ''
    }
  })
  const rank: Record<TeamHealth, number> = { failing: 0, waiting: 1, healthy: 2, away: 3, offline: 4 }
  return tiles.sort((a, b) => rank[a.health] - rank[b.health] || a.name.localeCompare(b.name))
}

/** `3 min ago`, `just now` — the tile's rest-layer age. */
export function formatActiveAgo(ms: number | null): string {
  if (ms === null) return ''
  if (ms < 60_000) return 'active now'
  const min = Math.floor(ms / 60_000)
  if (min < 60) return `active ${min} min ago`
  const h = Math.floor(min / 60)
  if (h < 48) return `active ${h} h ago`
  return `active ${Math.floor(h / 24)} d ago`
}

// ── observer mode ──────────────────────────────────────────────────────────

export interface TeamSnapshotPanel { id: string; kind: string; title: string; state: string; x: number; y: number; w: number; h: number }

/**
 * One member's canvas as their machine published it: the `canvas:model`
 * words (kind, title, state) with the layout's geometry. Titles are scrubbed
 * by `redactSecrets` on the PUBLISHING side before they leave (the outward
 * gate); `redacted` is how many placeholders that wrote, so the observer can
 * say so. No cwd, no cost, no terminal text — a tile says what someone is
 * working ON, not what is in their shell.
 */
export interface TeamSnapshot {
  userId: string
  workspaceId: string
  /** The publisher's clock; shown as-is, never compared to ours. */
  at: number
  panels: TeamSnapshotPanel[]
  edges: Array<{ from: string; to: string }>
  redacted: number
}

/** A snapshot is re-published at most this often while someone is observing, and only when it changed. */
export const TEAM_SNAPSHOT_MS = 5_000
/** The Y.Doc map snapshots live in, keyed by the publisher's userId. */
export const TEAM_DOC_MAP = 'team'
export const snapshotKey = (userId: string): string => `snapshot:${userId}`
/** The awareness `mode` an observer publishes: it is how the observed side knows to publish, and how it SEES it is watched. */
export const OBSERVING_MODE = 'observing'

const MAX_SNAPSHOT_PANELS = 400
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export function parseTeamSnapshot(raw: unknown): TeamSnapshot | undefined {
  let r: unknown = raw
  if (typeof raw === 'string') {
    // A 2MB string is refused before JSON.parse pays for it.
    if (raw.length > 2_000_000) return undefined
    try { r = JSON.parse(raw) } catch { return undefined }
  }
  if (typeof r !== 'object' || r === null) return undefined
  const o = r as Record<string, unknown>
  const userId = str(o['userId'], 128)
  const workspaceId = str(o['workspaceId'], 128)
  if (userId === undefined || workspaceId === undefined || !Array.isArray(o['panels'])) return undefined
  const panels: TeamSnapshotPanel[] = []
  for (const p of o['panels'].slice(0, MAX_SNAPSHOT_PANELS)) {
    const q = p as Record<string, unknown> | null
    if (q === null || typeof q !== 'object') continue
    const id = str(q['id'], 128)
    if (id === undefined || !finite(q['x']) || !finite(q['y']) || !finite(q['w']) || !finite(q['h'])) continue
    if (q['w'] <= 0 || q['h'] <= 0 || q['w'] > 20_000 || q['h'] > 20_000) continue
    panels.push({ id, kind: str(q['kind'], 32) ?? '', title: str(q['title'], 120) ?? '', state: str(q['state'], 32) ?? '', x: q['x'], y: q['y'], w: q['w'], h: q['h'] })
  }
  const ids = new Set(panels.map((p) => p.id))
  const edges = (Array.isArray(o['edges']) ? o['edges'] : []).slice(0, 1000).flatMap((e) => {
    const q = e as Record<string, unknown> | null
    const from = str(q?.['from'], 128), to = str(q?.['to'], 128)
    return from !== undefined && to !== undefined && ids.has(from) && ids.has(to) ? [{ from, to }] : []
  })
  return { userId, workspaceId, at: finite(o['at']) ? o['at'] : 0, panels, edges, redacted: finite(o['redacted']) ? Math.max(0, Math.floor(o['redacted'])) : 0 }
}

/** `team:observe`'s request; null stops observing. */
export interface TeamObserveRequest { workspaceId: string; userId: string }

/** `team:observed`: the one member being observed, pushed on every change. */
export interface TeamObserved {
  workspaceId: string
  userId: string
  connection: PresenceRoster['connection']
  reason?: string
  /** Their live awareness in that room; null until they are seen, or after they leave. */
  peer: RemotePeer | null
  snapshot: TeamSnapshot | null
}

// ── follow mode ────────────────────────────────────────────────────────────

export interface FollowViewport { x: number; y: number; scale: number }

/**
 * The observer's viewport while following: the peer's CURSOR centred in our
 * box at our own scale; with the cursor off their canvas, their VIEWPORT's
 * top-left at their scale, so we see what they see. Null when the peer has
 * published neither — follow holds the last viewport rather than jumping.
 * Viewport convention as canvas/viewport.ts: screen = world·scale + (x, y).
 */
export function followViewport(
  peer: { cursor: { x: number; y: number } | null; viewport: FollowViewport | null },
  box: { w: number; h: number },
  scale: number
): FollowViewport | null {
  if (peer.cursor !== null) return { x: box.w / 2 - peer.cursor.x * scale, y: box.h / 2 - peer.cursor.y * scale, scale }
  if (peer.viewport !== null) return { ...peer.viewport }
  return null
}
