/**
 * Main's side of the pty relay (server/relay): one WebSocket per relay panel,
 * the stream offset it has received, and the control picture — pushed to the
 * renderer as views and bytes.
 *
 * Main holds the socket, not the renderer, for presence's reasons
 * (presence/presence-hub.ts): the bearer token never crosses the bridge
 * (account.ts), the renderer's CSP is `default-src 'self'` and would refuse
 * the connect anyway, and a reload must not drop control — the socket, the
 * offset and the role outlive the page, and a reloaded renderer asks for the
 * view and replays from the relay's ring.
 *
 * Reconnect: an unexpected close reconnects with backoff and re-attaches with
 * `since` = the offset received, so inside the server's 60s grace control is
 * still ours and only the missed bytes arrive (no terminal reset). A close the
 * server meant — refused (4403), session gone (4404) — does not retry.
 *
 * Input is gated HERE too (canType), not only in the renderer: a keystroke
 * racing a revoke dies in main rather than on the wire. The server's per-frame
 * check is still the rule; both of these are courtesy.
 *
 * No electron import: `WebSocket`, the identity and the clock are injected, so
 * verify:relay drives this against a real relay under plain node.
 */
import {
  RELAY_BEARER_PREFIX, RELAY_SUBPROTOCOL, canType, parseRelayServerMessage, roleOf,
  type RelayClientMessage, type RelayControlState, type RelayRole, type RelayServerMessage, type RelaySessionMeta
} from '../../shared/relay-protocol'
import type { RelayConnection, RelayData, RelayView } from '../../shared/ipc-contract'

export type RelayConfigRead = { kind: 'ok'; url: string } | { kind: 'missing'; reason: string }

export type RelayIdentity =
  | { kind: 'ok'; userId: string; token: () => Promise<string> }
  | { kind: 'refused'; reason: string }

export type { RelayConnection, RelayView, RelayData }

/** The WHATWG WebSocket surface this uses — Node's and Electron's global, or a test double. */
export interface SocketLike {
  binaryType: string
  readonly readyState: number
  readonly protocol: string
  send(data: string | Uint8Array): void
  close(code?: number, reason?: string): void
  addEventListener(type: 'open' | 'close' | 'message' | 'error', l: (ev: { data?: unknown; code?: number; reason?: string }) => void): void
}
export type SocketCtor = new (url: string, protocols: string[]) => SocketLike

export interface RelayClientDeps {
  config: () => RelayConfigRead
  identity: () => Promise<RelayIdentity>
  WebSocket: SocketCtor
  emitView: (view: RelayView) => void
  emitData: (data: RelayData) => void
  pingMs?: number
  /** A ping not answered in this long means the socket is dead. */
  pongDeadlineMs?: number
  backoffMs?: readonly number[]
}

export interface RelayClient {
  spawn(panelId: string, req: { program: string; cols: number; rows: number; shareId?: string }): Promise<{ kind: 'ok'; sessionId: string } | { kind: 'refused'; reason: string }>
  attach(panelId: string, sessionId: string): Promise<{ kind: 'ok' } | { kind: 'refused'; reason: string }>
  detach(panelId: string): void
  input(panelId: string, data: Uint8Array | string): boolean
  resize(panelId: string, cols: number, rows: number): void
  control(panelId: string, action: 'request' | 'release' | 'revoke' | 'grant' | 'deny', userId?: string): void
  kill(panelId: string): void
  list(): Promise<{ kind: 'ok'; sessions: RelaySessionMeta[] } | { kind: 'refused'; reason: string }>
  view(panelId: string): RelayView | null
  /** A reloaded renderer asks for the whole screen again: a reset and the ring, from the relay. */
  replay(panelId: string): void
  dispose(): void
}

const OPEN = 1
/** Server closes that are answers, not accidents: never retried. */
const FINAL_CLOSES = new Set([4400, 4403, 4404])

interface Attachment {
  panelId: string
  sessionId: string | null
  ws: SocketLike | null
  userId: string | null
  offset: number
  hasStream: boolean
  role: RelayRole | null
  control: RelayControlState | null
  canRequest: boolean
  program: string | null
  exited: boolean
  connection: RelayConnection
  reason: string | null
  wanted: boolean
  attempt: number
  retry: ReturnType<typeof setTimeout> | null
  ping: ReturnType<typeof setInterval> | null
  pongDue: ReturnType<typeof setTimeout> | null
  /** Resolves the spawn/attach that opened this socket, once. */
  settle: ((r: { kind: 'ok'; sessionId: string } | { kind: 'refused'; reason: string }) => void) | null
  /** The first message after connect: spawn, or attach with since. */
  opening: () => RelayClientMessage
}

export function createRelayClient(deps: RelayClientDeps): RelayClient {
  const pingMs = deps.pingMs ?? 20_000
  const pongDeadline = deps.pongDeadlineMs ?? 10_000
  const backoff = deps.backoffMs ?? [500, 1000, 2000, 4000, 8000]
  const panels = new Map<string, Attachment>()

  const viewOf = (a: Attachment): RelayView => ({
    panelId: a.panelId, sessionId: a.sessionId, connection: a.connection, userId: a.userId,
    role: a.control !== null && a.userId !== null ? roleOf(a.control, a.userId) : a.role,
    control: a.control,
    canType: a.connection === 'open' && !a.exited && a.control !== null && a.userId !== null && canType(a.control, a.userId),
    canRequest: a.canRequest, program: a.program, exited: a.exited, reason: a.reason
  })
  const push = (a: Attachment): void => { if (panels.get(a.panelId) === a) deps.emitView(viewOf(a)) }

  const sendJson = (a: Attachment, m: RelayClientMessage): void => {
    if (a.ws !== null && a.ws.readyState === OPEN) a.ws.send(JSON.stringify(m))
  }

  const stopTimers = (a: Attachment): void => {
    if (a.ping !== null) clearInterval(a.ping)
    if (a.pongDue !== null) clearTimeout(a.pongDue)
    a.ping = null; a.pongDue = null
  }

  const finish = (a: Attachment, reason: string | null): void => {
    a.wanted = false
    if (a.retry !== null) clearTimeout(a.retry)
    a.retry = null
    stopTimers(a)
    a.connection = 'closed'
    if (reason !== null) a.reason = reason
    a.settle?.({ kind: 'refused', reason: reason ?? 'closed' })
    a.settle = null
    const ws = a.ws
    a.ws = null
    if (ws !== null && ws.readyState <= OPEN) ws.close(1000, 'detached')
    push(a)
  }

  const onServer = (a: Attachment, m: RelayServerMessage): void => {
    switch (m.t) {
      case 'hello':
        a.userId = m.userId
        sendJson(a, a.opening())
        return
      case 'attached':
        a.sessionId = m.session.sessionId
        a.program = m.session.program
        a.role = m.role
        a.canRequest = m.canRequest
        a.exited = m.session.exited
        a.connection = 'open'
        a.reason = null
        a.attempt = 0
        // A reset (or the first attach) clears the terminal; the replay bytes follow in their own frame.
        if (m.reset || !a.hasStream) deps.emitData({ panelId: a.panelId, data: new Uint8Array(0), reset: true })
        a.hasStream = true
        a.offset = m.offset
        a.settle?.({ kind: 'ok', sessionId: m.session.sessionId })
        a.settle = null
        return push(a)
      case 'control':
        a.control = m.state
        return push(a)
      case 'resync':
        a.offset = m.offset
        deps.emitData({ panelId: a.panelId, data: new Uint8Array(0), reset: true })
        return
      case 'exit':
        a.exited = true
        return push(a)
      case 'error':
        a.reason = m.reason
        // Refused before it ever attached (spawn/attach said no): that is the answer.
        if (a.settle !== null) return finish(a, m.reason)
        return push(a)
      case 'pong':
        if (a.pongDue !== null) clearTimeout(a.pongDue)
        a.pongDue = null
        return
      case 'sessions':
        return
    }
  }

  const connect = async (a: Attachment): Promise<void> => {
    const cfg = deps.config()
    if (cfg.kind !== 'ok') return finish(a, cfg.reason)
    const id = await deps.identity()
    if (id.kind !== 'ok') return finish(a, id.reason)
    let token: string
    try { token = await id.token() } catch (e) { return finish(a, (e as Error).message) }
    if (!a.wanted) return
    a.userId = id.userId
    a.connection = a.hasStream ? 'reconnecting' : 'connecting'
    push(a)
    let ws: SocketLike
    try { ws = new deps.WebSocket(cfg.url, [RELAY_SUBPROTOCOL, RELAY_BEARER_PREFIX + token]) } catch (e) {
      return finish(a, `the relay address is not usable: ${(e as Error).message}`)
    }
    ws.binaryType = 'arraybuffer'
    a.ws = ws
    ws.addEventListener('open', () => {
      if (a.ws !== ws) return
      a.ping = setInterval(() => {
        if (a.pongDue !== null) return
        sendJson(a, { t: 'ping' })
        a.pongDue = setTimeout(() => { if (a.ws === ws) ws.close(4408, 'no pong') }, pongDeadline)
      }, pingMs)
    })
    ws.addEventListener('message', (ev) => {
      if (a.ws !== ws) return
      const d = ev.data
      if (typeof d === 'string') {
        const m = parseRelayServerMessage(d)
        if (m !== undefined) onServer(a, m)
        return
      }
      const bytes = d instanceof ArrayBuffer ? new Uint8Array(d) : ArrayBuffer.isView(d) ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength) : null
      if (bytes === null || bytes.length === 0) return
      a.offset += bytes.length
      deps.emitData({ panelId: a.panelId, data: bytes, reset: false })
    })
    ws.addEventListener('error', () => {})
    ws.addEventListener('close', (ev) => {
      if (a.ws !== ws) return
      a.ws = null
      stopTimers(a)
      const code = ev.code ?? 1006
      if (!a.wanted) return
      if (FINAL_CLOSES.has(code)) return finish(a, ev.reason !== undefined && ev.reason !== '' ? ev.reason : a.reason ?? 'the relay closed the session')
      // Never attached and never will: a spawn that could not connect is a refusal, not a retry loop.
      if (a.sessionId === null) return finish(a, a.reason ?? 'the relay could not be reached')
      a.connection = 'reconnecting'
      push(a)
      const wait = backoff[Math.min(a.attempt, backoff.length - 1)]!
      a.attempt++
      a.retry = setTimeout(() => { a.retry = null; void connect(a) }, wait)
    })
  }

  const open = (panelId: string, opening: (a: Attachment) => RelayClientMessage, sessionId: string | null) => {
    const prev = panels.get(panelId)
    if (prev !== undefined) { sendJson(prev, { t: 'detach' }); finish(prev, null) }
    const a: Attachment = {
      panelId, sessionId, ws: null, userId: null, offset: 0, hasStream: false, role: null, control: null, canRequest: false,
      program: null, exited: false, connection: 'connecting', reason: null, wanted: true, attempt: 0, retry: null, ping: null,
      pongDue: null, settle: null, opening: () => opening(a)
    }
    panels.set(panelId, a)
    const done = new Promise<{ kind: 'ok'; sessionId: string } | { kind: 'refused'; reason: string }>((r) => { a.settle = r })
    void connect(a)
    return done
  }

  const gated = (panelId: string): Attachment | undefined => {
    const a = panels.get(panelId)
    return a !== undefined && viewOf(a).canType ? a : undefined
  }

  return {
    spawn: (panelId, req) => open(panelId, (a) => a.sessionId === null
      ? { t: 'spawn', program: req.program, cols: req.cols, rows: req.rows, ...(req.shareId === undefined ? {} : { shareId: req.shareId }) }
      // A spawn that reconnects re-attaches to what it made, never spawns twice.
      : { t: 'attach', sessionId: a.sessionId, since: a.offset }, null),
    attach: async (panelId, sessionId) => {
      const r = await open(panelId, (a) => ({ t: 'attach', sessionId, ...(a.hasStream ? { since: a.offset } : {}) }), sessionId)
      return r.kind === 'ok' ? { kind: 'ok' } : r
    },
    detach(panelId) {
      const a = panels.get(panelId)
      if (a === undefined) return
      sendJson(a, { t: 'detach' })
      finish(a, null)
      panels.delete(panelId)
    },
    input(panelId, data) {
      const a = gated(panelId)
      if (a === undefined || a.ws === null) return false
      a.ws.send(typeof data === 'string' ? new TextEncoder().encode(data) : data)
      return true
    },
    resize(panelId, cols, rows) {
      const a = gated(panelId)
      if (a !== undefined) sendJson(a, { t: 'resize', cols, rows })
    },
    control(panelId, action, userId) {
      const a = panels.get(panelId)
      if (a === undefined) return
      if (action === 'grant' || action === 'deny') { if (userId !== undefined) sendJson(a, { t: action, userId }) } else sendJson(a, { t: action })
    },
    kill(panelId) { const a = panels.get(panelId); if (a !== undefined) sendJson(a, { t: 'kill' }) },
    async list() {
      const cfg = deps.config()
      if (cfg.kind !== 'ok') return { kind: 'refused', reason: cfg.reason }
      const id = await deps.identity()
      if (id.kind !== 'ok') return id
      let token: string
      try { token = await id.token() } catch (e) { return { kind: 'refused', reason: (e as Error).message } }
      return await new Promise((resolve) => {
        let ws: SocketLike
        try { ws = new deps.WebSocket(cfg.url, [RELAY_SUBPROTOCOL, RELAY_BEARER_PREFIX + token]) } catch (e) {
          return resolve({ kind: 'refused', reason: (e as Error).message })
        }
        const timer = setTimeout(() => { ws.close(); resolve({ kind: 'refused', reason: 'the relay did not answer' }) }, 10_000)
        ws.addEventListener('message', (ev) => {
          const m = typeof ev.data === 'string' ? parseRelayServerMessage(ev.data) : undefined
          if (m?.t === 'hello') ws.send(JSON.stringify({ t: 'list' }))
          if (m?.t === 'sessions') { clearTimeout(timer); ws.close(1000); resolve({ kind: 'ok', sessions: m.sessions }) }
        })
        ws.addEventListener('close', () => { clearTimeout(timer); resolve({ kind: 'refused', reason: 'the relay refused the connection' }) })
        ws.addEventListener('error', () => {})
      })
    },
    view: (panelId) => { const a = panels.get(panelId); return a === undefined ? null : viewOf(a) },
    replay(panelId) {
      const a = panels.get(panelId)
      if (a === undefined || a.sessionId === null || a.ws === null || a.ws.readyState !== OPEN) return
      // Re-attach from nothing: the relay answers with reset + the whole ring.
      a.hasStream = false
      sendJson(a, { t: 'attach', sessionId: a.sessionId })
    },
    dispose() {
      // An explicit detach first: a quit is not a network drop, so the relay
      // hands a guest's control back now instead of holding it for the grace.
      for (const a of panels.values()) { sendJson(a, { t: 'detach' }); finish(a, null) }
      panels.clear()
    }
  }
}

/** TC_RELAY_URL, with presence's rule: wss, or ws only to this machine. */
export function readRelayConfig(...envs: Array<Record<string, string | undefined>>): RelayConfigRead {
  let raw: string | undefined
  for (const env of envs) { const v = env['TC_RELAY_URL']; if (v !== undefined && v.trim() !== '') { raw = v.trim(); break } }
  if (raw === undefined) return { kind: 'missing', reason: 'the relay is not configured — set TC_RELAY_URL to wss://<host>/relay' }
  let parsed: URL
  try { parsed = new URL(raw) } catch { return { kind: 'missing', reason: 'TC_RELAY_URL is not a URL' } }
  const local = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost'
  if (parsed.protocol !== 'wss:' && !(parsed.protocol === 'ws:' && local)) {
    return { kind: 'missing', reason: 'TC_RELAY_URL must be wss (or ws to 127.0.0.1 for a local relay)' }
  }
  return { kind: 'ok', url: raw }
}
