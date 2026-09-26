/**
 * The pty relay's wire protocol — one file, read by the relay server
 * (server/relay), main's client (main/relay/relay-client.ts) and, for its
 * types only, the renderer. Both ends parse with the functions here, so what
 * the server accepts and what the client sends cannot drift apart.
 *
 * Framing: a BINARY frame is terminal bytes — pty output server → client,
 * keystrokes client → server. A TEXT frame is one JSON control message. Bytes
 * never ride JSON (no base64 tax on the hot path), and control never rides
 * binary (no in-band escape to mis-parse).
 *
 * Roles are per SESSION and per PERSON (Supabase user id), never per socket:
 *   owner       spawned it; may grant, revoke, kill; always may take control back
 *   controller  the one person whose keystrokes and resizes reach the pty (0 or 1)
 *   viewer      everyone else attached; sees the stream, may REQUEST control
 * The owner is also the controller until they hand it off. Two sockets of one
 * person (two Macs) share that person's role.
 *
 * The token rides the WebSocket subprotocol list (`tc-relay.v1`, `bearer.<jwt>`)
 * rather than the URL: a query string lands in proxy access logs, and neither
 * Node's global WebSocket nor a browser can set an Authorization header.
 */

export const RELAY_SUBPROTOCOL = 'tc-relay.v1'
export const RELAY_BEARER_PREFIX = 'bearer.'

/** What a late joiner is replayed. A full-screen TUI redraws well inside this. */
export const RELAY_RING_BYTES = 1024 * 1024
/** Server ping cadence; a socket that has not ponged by the next ping is dead. Inside the 15–30s band. */
export const RELAY_HEARTBEAT_MS = 20_000
/** How long a dropped person keeps control (and their roster row) waiting for a reattach. */
export const RELAY_REATTACH_GRACE_MS = 60_000
/** A client over this many unsent bytes stops getting live output and is resynced from the ring once it drains. */
export const RELAY_BACKPRESSURE_HIGH = 1024 * 1024
export const RELAY_BACKPRESSURE_LOW = 64 * 1024
/** A client this far behind is cut: it is not reading at all. */
export const RELAY_BACKPRESSURE_CUT = 8 * 1024 * 1024

export type RelayRole = 'owner' | 'controller' | 'viewer'

export const RELAY_SESSION_ID = /^[A-Za-z0-9_-]{16,64}$/
const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const SHARE_ID = USER_ID
const PROGRAM = /^[a-z][a-z0-9-]{0,31}$/

export interface RelayPeer {
  userId: string
  /** Sockets this person has attached now; 0 while they are inside the reattach grace. */
  sockets: number
  /** Epoch ms the grace ends, when `sockets` is 0. */
  graceUntil?: number
}

export interface RelaySessionMeta {
  sessionId: string
  ownerId: string
  program: string
  shareId: string | null
  cols: number
  rows: number
  createdAt: number
  exited: boolean
}

/** The whole control picture, pushed on every change — a client never folds deltas. */
export interface RelayControlState {
  sessionId: string
  ownerId: string
  controllerId: string | null
  /** People asking for control, oldest first. */
  requests: string[]
  peers: RelayPeer[]
  cols: number
  rows: number
}

// ---- client → server --------------------------------------------------------

export type RelayClientMessage =
  | { t: 'list' }
  | { t: 'spawn'; program: string; cols: number; rows: number; shareId?: string }
  /**
   * `since` is the stream offset the client already holds (bytes received).
   * Inside the ring it gets only what it missed; outside it, a full replay
   * with `reset: true`.
   */
  | { t: 'attach'; sessionId: string; since?: number }
  | { t: 'detach' }
  | { t: 'resize'; cols: number; rows: number }
  | { t: 'request' }
  | { t: 'grant'; userId: string }
  | { t: 'deny'; userId: string }
  | { t: 'release' }
  | { t: 'revoke' }
  | { t: 'kill' }
  /**
   * The CLIENT's liveness probe. The server's ws pings are invisible to a
   * WHATWG WebSocket (main's), so a half-open TCP to a vanished VM would sit
   * "open" until the kernel gave up; an app-level ping with a deadline sees it.
   */
  | { t: 'ping' }

// ---- server → client --------------------------------------------------------

export type RelayServerMessage =
  | { t: 'hello'; userId: string }
  | { t: 'sessions'; sessions: RelaySessionMeta[] }
  /** Sent before the replay bytes. `offset` is the stream position the first following byte sits at. */
  | { t: 'attached'; session: RelaySessionMeta; role: RelayRole; offset: number; reset: boolean; canRequest: boolean }
  | { t: 'control'; state: RelayControlState }
  /**
   * Live output was dropped for this socket (it fell behind); the bytes that
   * follow are a full ring replay from `offset`, and the terminal must reset.
   */
  | { t: 'resync'; offset: number }
  | { t: 'exit'; code: number | null; signal: number | null }
  | { t: 'error'; reason: string }
  | { t: 'pong' }

export const clampDim = (v: unknown, lo: number, hi: number): number | undefined =>
  typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : undefined

/** The server's parser. Anything unrecognised is undefined, and the server answers it with an error, never a throw. */
export function parseRelayClientMessage(raw: string): RelayClientMessage | undefined {
  if (raw.length > 4096) return undefined
  let v: unknown
  try { v = JSON.parse(raw) } catch { return undefined }
  if (typeof v !== 'object' || v === null) return undefined
  const m = v as Record<string, unknown>
  switch (m['t']) {
    case 'list': case 'detach': case 'request': case 'release': case 'revoke': case 'kill': case 'ping':
      return { t: m['t'] }
    case 'spawn': {
      const cols = clampDim(m['cols'], 2, 1000), rows = clampDim(m['rows'], 1, 500)
      if (typeof m['program'] !== 'string' || !PROGRAM.test(m['program']) || cols === undefined || rows === undefined) return undefined
      if (m['shareId'] !== undefined && (typeof m['shareId'] !== 'string' || !SHARE_ID.test(m['shareId']))) return undefined
      return { t: 'spawn', program: m['program'], cols, rows, ...(typeof m['shareId'] === 'string' ? { shareId: m['shareId'] } : {}) }
    }
    case 'attach': {
      if (typeof m['sessionId'] !== 'string' || !RELAY_SESSION_ID.test(m['sessionId'])) return undefined
      const since = m['since']
      if (since !== undefined && (typeof since !== 'number' || !Number.isSafeInteger(since) || since < 0)) return undefined
      return { t: 'attach', sessionId: m['sessionId'], ...(typeof since === 'number' ? { since } : {}) }
    }
    case 'resize': {
      const cols = clampDim(m['cols'], 2, 1000), rows = clampDim(m['rows'], 1, 500)
      return cols === undefined || rows === undefined ? undefined : { t: 'resize', cols, rows }
    }
    case 'grant': case 'deny':
      return typeof m['userId'] === 'string' && USER_ID.test(m['userId']) ? { t: m['t'], userId: m['userId'] } : undefined
    default:
      return undefined
  }
}

const isStr = (v: unknown): v is string => typeof v === 'string'
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v)

function parseMeta(v: unknown): RelaySessionMeta | undefined {
  if (typeof v !== 'object' || v === null) return undefined
  const m = v as Record<string, unknown>
  if (!isStr(m['sessionId']) || !RELAY_SESSION_ID.test(m['sessionId']) || !isStr(m['ownerId']) || !isStr(m['program'])) return undefined
  if (!isInt(m['cols']) || !isInt(m['rows']) || !isInt(m['createdAt'])) return undefined
  return {
    sessionId: m['sessionId'], ownerId: m['ownerId'], program: m['program'].slice(0, 32),
    shareId: isStr(m['shareId']) ? m['shareId'] : null,
    cols: m['cols'], rows: m['rows'], createdAt: m['createdAt'], exited: m['exited'] === true
  }
}

function parseControl(v: unknown): RelayControlState | undefined {
  if (typeof v !== 'object' || v === null) return undefined
  const m = v as Record<string, unknown>
  if (!isStr(m['sessionId']) || !isStr(m['ownerId']) || !isInt(m['cols']) || !isInt(m['rows'])) return undefined
  const controllerId = isStr(m['controllerId']) ? m['controllerId'] : null
  const requests = Array.isArray(m['requests']) ? m['requests'].filter(isStr).slice(0, 64) : []
  const peers = Array.isArray(m['peers'])
    ? m['peers'].flatMap((p): RelayPeer[] => {
      if (typeof p !== 'object' || p === null) return []
      const q = p as Record<string, unknown>
      if (!isStr(q['userId']) || !isInt(q['sockets'])) return []
      return [{ userId: q['userId'], sockets: q['sockets'], ...(isInt(q['graceUntil']) ? { graceUntil: q['graceUntil'] } : {}) }]
    }).slice(0, 256)
    : []
  return { sessionId: m['sessionId'], ownerId: m['ownerId'], controllerId, requests, peers, cols: m['cols'], rows: m['rows'] }
}

/** The client's parser: the server is trusted less than main trusts itself, so every field is typed before use. */
export function parseRelayServerMessage(raw: string): RelayServerMessage | undefined {
  let v: unknown
  try { v = JSON.parse(raw) } catch { return undefined }
  if (typeof v !== 'object' || v === null) return undefined
  const m = v as Record<string, unknown>
  switch (m['t']) {
    case 'hello': return isStr(m['userId']) ? { t: 'hello', userId: m['userId'] } : undefined
    case 'sessions': {
      if (!Array.isArray(m['sessions'])) return undefined
      return { t: 'sessions', sessions: m['sessions'].map(parseMeta).filter((s): s is RelaySessionMeta => s !== undefined) }
    }
    case 'attached': {
      const session = parseMeta(m['session'])
      const role = m['role']
      if (session === undefined || (role !== 'owner' && role !== 'controller' && role !== 'viewer') || !isInt(m['offset'])) return undefined
      return { t: 'attached', session, role, offset: m['offset'], reset: m['reset'] === true, canRequest: m['canRequest'] === true }
    }
    case 'control': {
      const state = parseControl(m['state'])
      return state === undefined ? undefined : { t: 'control', state }
    }
    case 'resync': return isInt(m['offset']) ? { t: 'resync', offset: m['offset'] } : undefined
    case 'exit': return { t: 'exit', code: isInt(m['code']) ? m['code'] : null, signal: isInt(m['signal']) ? m['signal'] : null }
    case 'pong': return { t: 'pong' }
    case 'error': return { t: 'error', reason: isStr(m['reason']) ? m['reason'].slice(0, 200) : 'the relay refused' }
    default: return undefined
  }
}

/** This person's role, read off the control state: what the renderer gates input on. */
export function roleOf(state: RelayControlState, userId: string): RelayRole {
  if (state.controllerId === userId) return state.ownerId === userId ? 'owner' : 'controller'
  return state.ownerId === userId ? 'owner' : 'viewer'
}

/** Whether this person's keystrokes reach the pty now. The one gate, used on both ends. */
export const canType = (state: RelayControlState, userId: string): boolean => state.controllerId === userId
