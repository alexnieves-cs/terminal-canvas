/**
 * Presence: who else is on a workspace, where they are looking, and what their
 * agents are doing — carried as Yjs AWARENESS on one Y.Doc per workspace,
 * synced through the team's Hocuspocus server (main/presence/presence-hub.ts).
 *
 * Imports nothing, like account.ts, so main, the renderer and the plain-node
 * verify tier read one declaration. Everything a REMOTE peer sends is parsed
 * by `parsePresence` before anything reads it: awareness is written by other
 * machines, so it is untrusted input, exactly like an imported canvas.
 */

/** The awareness payload, as every peer publishes it under the `presence` field. */
export interface PresencePayload {
  userId: string
  displayName: string
  initials: string
  /** `#rrggbb`, derived from userId so a person keeps one colour on every machine. */
  color: string
  currentPanelId: string | null
  /** World coordinates, so a peer at another zoom lands on the same spot. */
  cursor: { x: number; y: number } | null
  viewport: { x: number; y: number; scale: number } | null
  selection: string[]
  /**
   * Where the person's caret is in a SHARED FILE's text (canvas-doc.ts
   * canvas:files), or null. Awareness only, never the doc: a caret is
   * ephemeral, and a doc keeps every write forever. `anchor`/`head` are Yjs
   * relative positions (Y.encodeRelativePosition, base64) so they stay on the
   * same character while other people type in front of them.
   */
  textCursor: TextCursor | null
  mode: string
  agentStatus: AgentPresenceStatus
  statusLine: string
  /**
   * The task the person is on (the focused panel's task, else the one in
   * progress), as the Team view's tile shows it. A person's own words, so
   * main scrubs it with `redactSecrets` before it is published; '' for none.
   */
  currentTask: string
  /**
   * The userId this peer is observing (the Team view's observer mode), or
   * null. It is what tells the OBSERVED person's machine to publish its
   * canvas snapshot — only while someone is actually watching, and only the
   * watched person's — and what shows them that they are watched.
   */
  observing: string | null
  /** The publisher's own clock, ms. NEVER compared against a receiver's clock — see `PresenceTracker`. */
  lastActivity: number
}

export type AgentPresenceStatus = 'none' | 'idle' | 'working' | 'needs-you' | 'error'

export interface TextCursor { file: string; anchor: string; head: string }

const B64 = /^[A-Za-z0-9+/]{1,256}={0,2}$/
const FILE_KEY = /^[A-Za-z0-9_-]{1,160}$/
/** A caret from either direction — a renderer report or a peer — or null. */
export function parseTextCursor(raw: unknown): TextCursor | null {
  const r = raw as Record<string, unknown> | null
  if (r === null || typeof r !== 'object') return null
  const file = r['file'], anchor = r['anchor'], head = r['head']
  if (typeof file !== 'string' || !FILE_KEY.test(file)) return null
  if (typeof anchor !== 'string' || !B64.test(anchor) || typeof head !== 'string' || !B64.test(head)) return null
  return { file, anchor, head }
}

/** What the renderer reports; main owns identity and agent status and adds them. */
export interface LocalPresence {
  workspaceId: string
  currentPanelId: string | null
  cursor: { x: number; y: number } | null
  viewport: { x: number; y: number; scale: number } | null
  selection: string[]
  /** See PresencePayload.textCursor. Optional so an older renderer's report still parses. */
  textCursor?: TextCursor | null
  mode: string
  /** See PresencePayload.currentTask. Optional so an older renderer's report still parses. */
  currentTask?: string
}

export type PeerStatus = 'active' | 'idle'

export interface RemotePeer {
  /** The Yjs client id: one person on two machines is two peers, and both are shown. */
  clientId: number
  presence: PresencePayload
  status: PeerStatus
  /** How long since this peer's `lastActivity` last changed, on OUR clock, as of the roster. */
  idleForMs: number
  /** False once the peer left the awareness set; the row stays until OFFLINE_MS since its last heartbeat. */
  live: boolean
}

/** `presence:remote`: one workspace's peers, sent whenever the set or a peer changes. */
export interface PresenceRoster {
  workspaceId: string
  connection: 'off' | 'connecting' | 'connected' | 'disconnected'
  /** Why presence is off, by name (not configured, not signed in); absent when on. */
  reason?: string
  peers: RemotePeer[]
}

/** The full payload is re-published on this beat even when nothing changed — the heartbeat. */
export const PRESENCE_HEARTBEAT_MS = 30_000
/** No change to a peer's `lastActivity` for this long, measured on OUR clock: idle. */
export const PRESENCE_IDLE_MS = 5 * 60_000
/** No heartbeat from a peer for this long: offline, and dropped from the roster. */
export const PRESENCE_OFFLINE_MS = 15 * 60_000
/** Remote cursors and selections are painted at most this often, and local ones sent at most this often. */
export const PRESENCE_RENDER_HZ = 15

/** The awareness field the payload lives under; other fields on a peer's state are ignored. */
export const PRESENCE_FIELD = 'presence'

export function initialsOf(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s_-]/gu, '').split(/[\s_-]+/).filter((w) => w !== '')
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase()
  return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase()
}

/**
 * One stable colour per userId: an FNV-1a hash to a hue, at a fixed
 * saturation and lightness chosen to read on both themes. HSL→hex here rather
 * than an `hsl()` string because the renderer paints it on a 2D canvas AND
 * compares it, and one spelling is easier to pin.
 */
export function colorOf(userId: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < userId.length; i++) { h ^= userId.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  const hue = h % 360
  const s = 0.62, l = 0.56
  const k = (n: number): number => (n + hue / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number): number => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
  const hex = (v: number): string => Math.round(v * 255).toString(16).padStart(2, '0')
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`
}

const AGENT_STATUSES: readonly AgentPresenceStatus[] = ['none', 'idle', 'working', 'needs-you', 'error']
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' ? v.slice(0, max) : undefined)

/**
 * A remote peer's payload, or undefined. Bounded as well as typed: a peer
 * could send a 10MB status line or a selection of a million ids, and the
 * renderer would pay for it every frame.
 */
export function parsePresence(raw: unknown): PresencePayload | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const r = raw as Record<string, unknown>
  const userId = str(r['userId'], 128)
  const displayName = str(r['displayName'], 80)
  if (userId === undefined || userId === '' || displayName === undefined) return undefined
  const color = typeof r['color'] === 'string' && /^#[0-9a-f]{6}$/i.test(r['color']) ? r['color'] : colorOf(userId)
  const point = (v: unknown): { x: number; y: number } | null => {
    const p = v as Record<string, unknown> | null
    return p !== null && typeof p === 'object' && finite(p['x']) && finite(p['y']) ? { x: p['x'], y: p['y'] } : null
  }
  const vp = r['viewport'] as Record<string, unknown> | null
  const viewport = vp !== null && typeof vp === 'object' && finite(vp['x']) && finite(vp['y']) && finite(vp['scale']) && vp['scale'] > 0
    ? { x: vp['x'], y: vp['y'], scale: vp['scale'] } : null
  const selection = Array.isArray(r['selection'])
    ? r['selection'].filter((s): s is string => typeof s === 'string').slice(0, 200).map((s) => s.slice(0, 128)) : []
  const agentStatus = AGENT_STATUSES.includes(r['agentStatus'] as AgentPresenceStatus) ? r['agentStatus'] as AgentPresenceStatus : 'none'
  return {
    userId,
    displayName,
    initials: (str(r['initials'], 3) ?? '') || initialsOf(displayName),
    color,
    currentPanelId: str(r['currentPanelId'], 128) ?? null,
    cursor: point(r['cursor']),
    viewport,
    selection,
    textCursor: parseTextCursor(r['textCursor']),
    mode: str(r['mode'], 32) ?? '',
    agentStatus,
    statusLine: str(r['statusLine'], 140) ?? '',
    currentTask: str(r['currentTask'], 140) ?? '',
    observing: str(r['observing'], 128) ?? null,
    lastActivity: finite(r['lastActivity']) ? r['lastActivity'] : 0
  }
}

/**
 * Idle and offline, heartbeat-driven and on the RECEIVER's clock only. A
 * peer's `lastActivity` is its own clock, and two Macs can disagree by
 * minutes; so the tracker records WHEN WE SAW that value change, and when we
 * last heard anything at all (the heartbeat), and never subtracts a remote
 * timestamp from a local one.
 */
export interface PresenceTracker {
  /** A peer's state arrived (an update or the 30s heartbeat). */
  seen(clientId: number, presence: PresencePayload, now: number): void
  /** The peer left the awareness set (disconnect, or y-protocols' own 30s timeout). */
  left(clientId: number): void
  /** The roster as of `now`, with peers past OFFLINE_MS dropped. */
  peers(now: number): RemotePeer[]
  clear(): void
}

export function createPresenceTracker(): PresenceTracker {
  const rows = new Map<number, { presence: PresencePayload; heardAt: number; activeAt: number; live: boolean }>()
  return {
    seen(clientId, presence, now) {
      const prev = rows.get(clientId)
      const activeAt = prev === undefined || prev.presence.lastActivity !== presence.lastActivity ? now : prev.activeAt
      rows.set(clientId, { presence, heardAt: now, activeAt, live: true })
    },
    left(clientId) {
      const row = rows.get(clientId)
      if (row !== undefined) row.live = false
    },
    peers(now) {
      const out: RemotePeer[] = []
      for (const [clientId, row] of rows) {
        if (now - row.heardAt >= PRESENCE_OFFLINE_MS) { rows.delete(clientId); continue }
        out.push({ clientId, presence: row.presence, live: row.live, idleForMs: Math.max(0, now - row.activeAt), status: now - row.activeAt >= PRESENCE_IDLE_MS ? 'idle' : 'active' })
      }
      return out.sort((a, b) => a.presence.displayName.localeCompare(b.presence.displayName) || a.clientId - b.clientId)
    },
    clear() { rows.clear() }
  }
}

/** One panel's agent, as the fold below counts it. */
export type PanelAgentState = 'idle' | 'working' | 'needs-you' | 'error'

/** A workspace's agents to one status and one line: needs-you outranks working outranks error outranks idle. */
export function foldAgentStatus(states: readonly PanelAgentState[]): { agentStatus: AgentPresenceStatus; statusLine: string } {
  if (states.length === 0) return { agentStatus: 'none', statusLine: '' }
  const n = (s: PanelAgentState): number => states.filter((x) => x === s).length
  const needs = n('needs-you'), working = n('working'), error = n('error')
  const agentStatus: AgentPresenceStatus = needs > 0 ? 'needs-you' : working > 0 ? 'working' : error > 0 ? 'error' : 'idle'
  const plural = (k: number, one: string): string => `${k} ${one}${k === 1 ? '' : 's'}`
  const parts = [
    ...(working > 0 ? [`${plural(working, 'agent')} working`] : []),
    ...(needs > 0 ? [`${needs} need${needs === 1 ? 's' : ''} you`] : []),
    ...(error > 0 ? [`${error} stopped`] : [])
  ]
  return { agentStatus, statusLine: parts.length > 0 ? parts.join(' · ') : `${plural(states.length, 'agent')} idle` }
}
