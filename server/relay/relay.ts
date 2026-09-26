/**
 * The pty relay: a registry of sessionId → { pty, clients, ring, controllerId },
 * served over one raw WebSocket endpoint (`/relay`), with control handed
 * between PEOPLE and every hand-off written to the audit log.
 *
 * Everything with a side effect outside this process is injected — the pty
 * factory, the token check, the share-role lookup, the audit sink, the clock
 * and the cadences — so verify:relay drives the real ws server over real
 * sockets with a fake pty and fake keys, in seconds, under plain node.
 *
 * ── Who may do what ────────────────────────────────────────────────────────
 *  spawn    a person on the relay's spawner list (maySpawn), of an ALLOWLISTED program by name (the client
 *           never sends a path, argv or env), within per-person and total caps.
 *           Binding the session to a share needs owner/editor on that share.
 *  attach   the owner; or, for a share-bound session, any member of the share
 *           (asked of Supabase AS the attaching person, RLS answers). A share
 *           viewer watches and may not even ask for control.
 *  type     the controller only. Checked per frame, here — the renderer's gate
 *           is courtesy, this one is the rule.
 *  resize   the controller only; everyone else renders at the controller's size.
 *  request  a viewer with canRequest. The owner asking is a revoke.
 *  grant    the owner or the current controller, only to someone who asked and
 *  deny     is attached now — control is never pushed onto a person.
 *  release  the controller: a guest's control returns to the owner; the owner
 *           releasing leaves nobody in control until someone is granted.
 *  revoke   the owner: control back to the owner, every request dropped.
 *  kill     the owner.
 *
 * ── Liveness ───────────────────────────────────────────────────────────────
 *  heartbeat  a ws ping every heartbeatMs; a socket that did not pong since the
 *             last one is terminated.
 *  grace      a person whose last socket DROPS (not an explicit detach) keeps
 *             control and their roster row for graceMs; a reattach inside it
 *             resumes from their stream offset with no reset. When it lapses,
 *             a guest controller's control returns to the owner (audited).
 *  token exp  verification is local (jwt.ts), so a signed-out token stays
 *             valid to its exp; a socket is closed at its token's exp (4401)
 *             and reconnects with a fresh one, inside the grace.
 *
 * ── Backpressure ───────────────────────────────────────────────────────────
 *  A slow client never slows the pty for the others. Over HIGH unsent bytes
 *  it stops getting live output; once it drains under LOW it gets the gap from
 *  the ring (or, if the gap was overwritten, a resync + full replay). Over CUT
 *  it is terminated. Only when EVERY attached client is lagging is the pty
 *  paused — then the ring would otherwise overwrite what all of them still
 *  need, and pausing is what makes the program itself wait.
 */
import { randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocketServer, type WebSocket, type RawData } from 'ws'
import {
  RELAY_BACKPRESSURE_CUT, RELAY_BACKPRESSURE_HIGH, RELAY_BACKPRESSURE_LOW, RELAY_BEARER_PREFIX,
  RELAY_HEARTBEAT_MS, RELAY_REATTACH_GRACE_MS, RELAY_RING_BYTES, RELAY_SUBPROTOCOL,
  parseRelayClientMessage,
  type RelayClientMessage, type RelayControlState, type RelayPeer, type RelayRole, type RelayServerMessage, type RelaySessionMeta
} from '../../src/shared/relay-protocol'
import { RingBuffer } from './ring-buffer'
import type { VerifyResult } from './jwt'

export interface PtyLike {
  onData(cb: (data: Buffer | string) => void): void
  onExit(cb: (e: { exitCode: number; signal?: number }) => void): void
  write(data: Buffer | string): void
  resize(cols: number, rows: number): void
  kill(signal?: string): void
  pause(): void
  resume(): void
}

/** One allowlisted program. The server's config file is the only place a path appears. */
export interface ProgramSpec { file: string; args: string[]; cwd?: string; env?: Record<string, string> }

export type ShareRole = 'owner' | 'editor' | 'viewer'

export interface AuditRow {
  ts: string
  sessionId: string
  event: 'spawn' | 'request' | 'grant' | 'deny' | 'release' | 'revoke' | 'lapse' | 'kill' | 'exit' | 'reap'
  actor: string | null
  from?: string | null
  to?: string | null
  detail?: string
}

export interface RelayDeps {
  verify: (token: string) => Promise<VerifyResult>
  /** The person's role in a share, asked with THEIR token; null when not a member or unreachable. */
  shareRole: (token: string, shareId: string) => Promise<ShareRole | null>
  programs: Record<string, ProgramSpec>
  /**
   * Who may START a session. A Supabase sign-in is open to any GitHub account,
   * and a spawned "shell" is a shell on this VM — so spawning is an explicit
   * list (TC_RELAY_SPAWNERS), and an empty list means nobody. Attaching stays
   * the share's question.
   */
  maySpawn: (userId: string) => boolean
  spawn: (spec: ProgramSpec, size: { cols: number; rows: number }) => PtyLike
  audit: (row: AuditRow) => void
  log?: (line: string) => void
  now?: () => number
  heartbeatMs?: number
  graceMs?: number
  ringBytes?: number
  /** A session no one has attached to for this long is killed. */
  orphanMs?: number
  maxSessionsPerUser?: number
  maxSessions?: number
  maxSocketsPerUser?: number
  backpressure?: { high: number; low: number; cut: number }
  /** How often lagging clients are checked for drain. */
  drainCheckMs?: number
}

interface Client {
  ws: WebSocket
  userId: string
  token: string
  alive: boolean
  session: Session | null
  /** Stream offset delivered up to. */
  offset: number
  lagging: boolean
  expiry: NodeJS.Timeout
}

interface Session {
  id: string
  ownerId: string
  program: string
  shareId: string | null
  pty: PtyLike
  ring: RingBuffer
  clients: Set<Client>
  controllerId: string | null
  requests: string[]
  /** Who may ask for control: decided at attach, from the share role. */
  canRequest: Map<string, boolean>
  grace: Map<string, { until: number; timer: NodeJS.Timeout }>
  cols: number
  rows: number
  createdAt: number
  exited: boolean
  paused: boolean
  lastAttended: number
}

const CLOSE = { bad: 4400, expired: 4401, refused: 4403, gone: 4404, dead: 4408 } as const

export interface Relay {
  server: Server
  listen(port: number, host: string): Promise<number>
  close(): Promise<void>
  /** For verify:relay and the health line: the registry as data. */
  snapshot(): Array<RelaySessionMeta & { controllerId: string | null; clients: number }>
}

export function createRelay(deps: RelayDeps): Relay {
  const now = deps.now ?? Date.now
  const heartbeatMs = deps.heartbeatMs ?? RELAY_HEARTBEAT_MS
  const graceMs = deps.graceMs ?? RELAY_REATTACH_GRACE_MS
  const ringBytes = deps.ringBytes ?? RELAY_RING_BYTES
  const orphanMs = deps.orphanMs ?? 12 * 60 * 60 * 1000
  const bp = deps.backpressure ?? { high: RELAY_BACKPRESSURE_HIGH, low: RELAY_BACKPRESSURE_LOW, cut: RELAY_BACKPRESSURE_CUT }
  const maxPerUser = deps.maxSessionsPerUser ?? 4
  const maxTotal = deps.maxSessions ?? 16
  const maxSockets = deps.maxSocketsPerUser ?? 16
  const log = deps.log ?? (() => {})

  const sessions = new Map<string, Session>()
  const sockets = new Set<Client>()

  const audit = (s: Session, event: AuditRow['event'], actor: string | null, extra: Omit<AuditRow, 'ts' | 'sessionId' | 'event' | 'actor'> = {}): void => {
    const row: AuditRow = { ts: new Date(now()).toISOString(), sessionId: s.id, event, actor, ...extra }
    try { deps.audit(row) } catch (e) { log(`audit write failed: ${(e as Error).message}`) }
  }

  const send = (c: Client, m: RelayServerMessage): void => {
    if (c.ws.readyState === c.ws.OPEN) c.ws.send(JSON.stringify(m))
  }
  const error = (c: Client, reason: string): void => send(c, { t: 'error', reason })

  const meta = (s: Session): RelaySessionMeta => ({
    sessionId: s.id, ownerId: s.ownerId, program: s.program, shareId: s.shareId, cols: s.cols, rows: s.rows, createdAt: s.createdAt, exited: s.exited
  })

  const peers = (s: Session): RelayPeer[] => {
    const count = new Map<string, number>()
    for (const c of s.clients) count.set(c.userId, (count.get(c.userId) ?? 0) + 1)
    const out: RelayPeer[] = [...count].map(([userId, n]) => ({ userId, sockets: n }))
    for (const [userId, g] of s.grace) if (!count.has(userId)) out.push({ userId, sockets: 0, graceUntil: g.until })
    return out
  }
  const control = (s: Session): RelayControlState => ({
    sessionId: s.id, ownerId: s.ownerId, controllerId: s.controllerId, requests: [...s.requests], peers: peers(s), cols: s.cols, rows: s.rows
  })
  const broadcast = (s: Session): void => {
    const m: RelayServerMessage = { t: 'control', state: control(s) }
    for (const c of s.clients) send(c, m)
  }
  const roleIn = (s: Session, userId: string): RelayRole =>
    s.ownerId === userId ? 'owner' : s.controllerId === userId ? 'controller' : 'viewer'
  const attachedNow = (s: Session, userId: string): boolean => [...s.clients].some((c) => c.userId === userId)

  const setController = (s: Session, to: string | null): void => {
    s.controllerId = to
    if (to !== null) s.requests = s.requests.filter((u) => u !== to)
  }

  // ── output, ring and backpressure ─────────────────────────────────────────

  const flowCheck = (s: Session): void => {
    const all = s.clients.size > 0 && [...s.clients].every((c) => c.lagging)
    if (all && !s.paused && !s.exited) { s.paused = true; s.pty.pause() }
    else if (!all && s.paused) { s.paused = false; if (!s.exited) s.pty.resume() }
  }

  /** Bring one client up to the ring's end: the gap if the ring still has it, else a resync. */
  const catchUp = (c: Client, s: Session): void => {
    const r = s.ring.read(c.offset)
    if (r.reset) send(c, { t: 'resync', offset: r.offset })
    if (r.bytes.length > 0) c.ws.send(r.bytes)
    c.offset = s.ring.end
  }

  const deliver = (c: Client, s: Session, chunk: Buffer): void => {
    if (c.ws.readyState !== c.ws.OPEN) return
    const queued = c.ws.bufferedAmount
    if (queued > bp.cut) { log(`cut ${c.userId} on ${s.id}: ${queued} bytes unsent`); c.ws.terminate(); return }
    if (c.lagging) return
    if (queued > bp.high) { c.lagging = true; flowCheck(s); return }
    c.ws.send(chunk)
    c.offset += chunk.length
  }

  const drainTick = setInterval(() => {
    for (const s of sessions.values()) {
      let changed = false
      for (const c of s.clients) {
        if (!c.lagging || c.ws.readyState !== c.ws.OPEN) continue
        if (c.ws.bufferedAmount > bp.cut) { c.ws.terminate(); continue }
        if (c.ws.bufferedAmount <= bp.low) { c.lagging = false; catchUp(c, s); changed = true }
      }
      if (changed || s.paused) flowCheck(s)
      if (!s.exited && s.clients.size === 0 && s.grace.size === 0 && now() - s.lastAttended > orphanMs) {
        audit(s, 'reap', null, { detail: 'no one attached' })
        s.pty.kill()
      }
    }
  }, deps.drainCheckMs ?? 250)

  // ── sessions ──────────────────────────────────────────────────────────────

  const endSession = (s: Session): void => {
    for (const g of s.grace.values()) clearTimeout(g.timer)
    s.grace.clear()
    for (const c of s.clients) { c.session = null; c.ws.close(CLOSE.gone, 'the session ended') }
    s.clients.clear()
    sessions.delete(s.id)
  }

  const spawn = async (c: Client, m: Extract<RelayClientMessage, { t: 'spawn' }>): Promise<void> => {
    if (!deps.maySpawn(c.userId)) return error(c, 'you are not allowed to start sessions on this relay')
    const spec = Object.prototype.hasOwnProperty.call(deps.programs, m.program) ? deps.programs[m.program] : undefined
    if (spec === undefined) return error(c, `"${m.program}" is not a program this relay runs`)
    const live = [...sessions.values()].filter((s) => !s.exited)
    if (live.length >= maxTotal) return error(c, 'the relay is full')
    if (live.filter((s) => s.ownerId === c.userId).length >= maxPerUser) return error(c, `you already have ${maxPerUser} sessions on this relay`)
    if (m.shareId !== undefined) {
      const role = await deps.shareRole(c.token, m.shareId)
      if (role !== 'owner' && role !== 'editor') return error(c, 'only an owner or editor of that workspace can start a session in it')
    }
    let pty: PtyLike
    try { pty = deps.spawn(spec, { cols: m.cols, rows: m.rows }) } catch (e) {
      return error(c, `the program did not start: ${(e as Error).message}`)
    }
    const s: Session = {
      id: randomBytes(18).toString('base64url'), ownerId: c.userId, program: m.program, shareId: m.shareId ?? null, pty,
      ring: new RingBuffer(ringBytes), clients: new Set(), controllerId: c.userId, requests: [],
      canRequest: new Map([[c.userId, true]]), grace: new Map(), cols: m.cols, rows: m.rows, createdAt: now(),
      exited: false, paused: false, lastAttended: now()
    }
    sessions.set(s.id, s)
    pty.onData((d) => {
      const chunk = typeof d === 'string' ? Buffer.from(d, 'utf8') : d
      s.ring.write(chunk)
      for (const cl of s.clients) deliver(cl, s, chunk)
    })
    pty.onExit(({ exitCode, signal }) => {
      s.exited = true
      audit(s, 'exit', null, { detail: `code ${exitCode}${signal ? ` signal ${signal}` : ''}` })
      for (const cl of s.clients) send(cl, { t: 'exit', code: exitCode, signal: signal ?? null })
      // Late reattaches inside the grace still see the last screen and the exit.
      setTimeout(() => endSession(s), graceMs).unref()
    })
    audit(s, 'spawn', c.userId, { to: c.userId, detail: m.program })
    attach(c, s, undefined, true)
  }

  const attach = (c: Client, s: Session, since: number | undefined, canRequest: boolean): void => {
    // Re-attaching to the session this socket is already on is a replay
    // request (a reloaded renderer), not a leave: leaving would hand a guest's
    // control back to the owner.
    if (c.session !== null && c.session !== s) leave(c, 'detach')
    c.session = s
    c.lagging = false
    s.clients.add(c)
    s.lastAttended = now()
    s.canRequest.set(c.userId, canRequest)
    const g = s.grace.get(c.userId)
    if (g !== undefined) { clearTimeout(g.timer); s.grace.delete(c.userId) }
    const r = s.ring.read(since)
    send(c, { t: 'attached', session: meta(s), role: roleIn(s, c.userId), offset: r.offset, reset: r.reset, canRequest })
    if (r.bytes.length > 0) c.ws.send(r.bytes)
    c.offset = s.ring.end
    if (s.exited) send(c, { t: 'exit', code: null, signal: null })
    flowCheck(s)
    broadcast(s)
  }

  /** A person lost their last socket (or detached): requests, grace, control. */
  const leave = (c: Client, how: 'detach' | 'drop'): void => {
    const s = c.session
    if (s === null) return
    c.session = null
    s.clients.delete(c)
    s.lastAttended = now()
    if (!attachedNow(s, c.userId)) {
      if (how === 'drop' && !s.exited) {
        const until = now() + graceMs
        const timer = setTimeout(() => lapse(s, c.userId, 'the reattach grace ran out'), graceMs)
        timer.unref()
        s.grace.set(c.userId, { until, timer })
      } else {
        lapse(s, c.userId, 'detached')
      }
    }
    flowCheck(s)
    broadcast(s)
  }

  const lapse = (s: Session, userId: string, why: string): void => {
    const g = s.grace.get(userId)
    if (g !== undefined) { clearTimeout(g.timer); s.grace.delete(userId) }
    if (attachedNow(s, userId)) return
    s.requests = s.requests.filter((u) => u !== userId)
    // The owner stays the controller of record while away: control is theirs to come back to.
    if (s.controllerId === userId && userId !== s.ownerId) {
      setController(s, s.ownerId)
      audit(s, 'lapse', null, { from: userId, to: s.ownerId, detail: why })
    }
    broadcast(s)
  }

  const onControl = (c: Client, s: Session, m: RelayClientMessage): void => {
    const u = c.userId
    const isOwner = u === s.ownerId
    const isController = s.controllerId === u
    switch (m.t) {
      case 'resize':
        if (!isController) return error(c, 'only the person in control can resize')
        if (m.cols === s.cols && m.rows === s.rows) return
        s.cols = m.cols; s.rows = m.rows
        if (!s.exited) s.pty.resize(m.cols, m.rows)
        return broadcast(s)
      case 'request':
        if (isController) return
        if (isOwner) { // the owner asking is taking it back
          const from = s.controllerId
          setController(s, u); s.requests = []
          audit(s, 'revoke', u, { from, to: u })
          return broadcast(s)
        }
        if (s.canRequest.get(u) !== true) return error(c, 'a viewer of this workspace cannot ask for control')
        if (!s.requests.includes(u)) { s.requests.push(u); audit(s, 'request', u, { from: s.controllerId, to: u }) }
        return broadcast(s)
      case 'grant': {
        if (!isOwner && !isController) return error(c, 'only the owner or the person in control can hand it over')
        if (!s.requests.includes(m.userId)) return error(c, 'that person has not asked for control')
        if (!attachedNow(s, m.userId)) return error(c, 'that person is not attached')
        const from = s.controllerId
        setController(s, m.userId)
        audit(s, 'grant', u, { from, to: m.userId })
        return broadcast(s)
      }
      case 'deny':
        if (!isOwner && !isController) return error(c, 'only the owner or the person in control can answer a request')
        if (!s.requests.includes(m.userId)) return
        s.requests = s.requests.filter((x) => x !== m.userId)
        audit(s, 'deny', u, { from: s.controllerId, to: m.userId })
        return broadcast(s)
      case 'release': {
        if (!isController) return error(c, 'you are not in control')
        const to = isOwner ? null : s.ownerId
        setController(s, to)
        audit(s, 'release', u, { from: u, to })
        return broadcast(s)
      }
      case 'revoke': {
        if (!isOwner) return error(c, 'only the owner can revoke control')
        const from = s.controllerId
        setController(s, u); s.requests = []
        audit(s, 'revoke', u, { from, to: u })
        return broadcast(s)
      }
      case 'kill':
        if (!isOwner) return error(c, 'only the owner can end the session')
        audit(s, 'kill', u)
        if (!s.exited) s.pty.kill()
        return
      case 'detach':
        return leave(c, 'detach')
      default:
        return error(c, 'already attached — detach first')
    }
  }

  const onMessage = async (c: Client, data: RawData, isBinary: boolean): Promise<void> => {
    const s = c.session
    if (isBinary) {
      // The rule, not the renderer's courtesy: only the controller's bytes reach the pty.
      if (s !== null && !s.exited && s.controllerId === c.userId) {
        s.pty.write(Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer))
      }
      return
    }
    const m = parseRelayClientMessage(data.toString())
    if (m === undefined) return error(c, 'the relay did not understand that message')
    if (m.t === 'ping') return send(c, { t: 'pong' })
    if (m.t === 'list') {
      return send(c, { t: 'sessions', sessions: [...sessions.values()].filter((x) => x.ownerId === c.userId).map(meta) })
    }
    if (m.t === 'spawn') {
      if (s !== null) return error(c, 'already attached — detach first')
      return spawn(c, m)
    }
    if (m.t === 'attach') {
      const target = sessions.get(m.sessionId)
      if (target === undefined) return error(c, 'no such session')
      let canRequest = true
      if (target.ownerId !== c.userId) {
        const role = target.shareId === null ? null : await deps.shareRole(c.token, target.shareId)
        if (role === null) return error(c, 'you are not a member of the workspace this session belongs to')
        canRequest = role !== 'viewer'
      }
      if (c.ws.readyState !== c.ws.OPEN) return
      return attach(c, target, m.since, canRequest)
    }
    if (s === null) return error(c, 'attach to a session first')
    onControl(c, s, m)
  }

  // ── the socket layer ──────────────────────────────────────────────────────

  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 256 * 1024,
    // Never echo the bearer entry back: the chosen protocol is in the response headers.
    handleProtocols: (protocols) => (protocols.has(RELAY_SUBPROTOCOL) ? RELAY_SUBPROTOCOL : false)
  })

  const tokenOf = (req: IncomingMessage): string | undefined => {
    const auth = req.headers['authorization']
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7).trim()
    const list = (req.headers['sec-websocket-protocol'] ?? '').split(',').map((p) => p.trim())
    if (!list.includes(RELAY_SUBPROTOCOL)) return undefined
    const bearer = list.find((p) => p.startsWith(RELAY_BEARER_PREFIX))
    return bearer?.slice(RELAY_BEARER_PREFIX.length)
  }

  const refuse = (socket: Duplex, status: number, reason: string): void => {
    const text = { 400: 'Bad Request', 401: 'Unauthorized', 404: 'Not Found', 429: 'Too Many Requests' }[status] ?? 'Error'
    socket.end(`HTTP/1.1 ${status} ${text}\r\nContent-Type: text/plain\r\nConnection: close\r\nContent-Length: ${Buffer.byteLength(reason)}\r\n\r\n${reason}`)
  }

  const server = createServer((req, res) => {
    // A health line for the reverse proxy and systemd, and nothing else over plain HTTP.
    if (req.url === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end(`ok ${sessions.size}\n`); return }
    res.writeHead(404); res.end()
  })

  server.on('upgrade', (req, socket, head) => {
    socket.on('error', () => {})
    if ((req.url ?? '').split('?')[0] !== '/relay') return refuse(socket, 404, 'not found')
    const token = tokenOf(req)
    if (token === undefined || token === '') return refuse(socket, 401, 'sign in first')
    void deps.verify(token).then((v) => {
      if (!v.ok) { log(`refused upgrade: ${v.reason}`); return refuse(socket, 401, v.reason) }
      if ([...sockets].filter((c) => c.userId === v.token.userId).length >= maxSockets) return refuse(socket, 429, 'too many connections')
      wss.handleUpgrade(req, socket, head, (ws) => {
        const ttl = Math.max(0, v.token.exp * 1000 - now())
        const c: Client = {
          ws, userId: v.token.userId, token: v.token.raw, alive: true, session: null, offset: 0, lagging: false,
          // Verification is local, so this is where a signed-out token stops working.
          expiry: setTimeout(() => ws.close(CLOSE.expired, 'the token expired'), Math.min(ttl, 2 ** 31 - 1))
        }
        sockets.add(c)
        ws.on('pong', () => { c.alive = true })
        ws.on('message', (data, isBinary) => {
          onMessage(c, data, isBinary).catch((e) => { log(`message failed: ${(e as Error).stack ?? e}`); error(c, 'the relay failed on that message') })
        })
        ws.on('close', () => {
          clearTimeout(c.expiry)
          sockets.delete(c)
          leave(c, 'drop')
        })
        ws.on('error', () => {})
        send(c, { t: 'hello', userId: c.userId })
      })
    })
  })

  const heartbeat = setInterval(() => {
    for (const c of sockets) {
      if (!c.alive) { c.ws.terminate(); continue }
      c.alive = false
      try { c.ws.ping() } catch { /* closing */ }
    }
  }, heartbeatMs)

  return {
    server,
    listen: (port, host) => new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, host, () => {
        const a = server.address()
        resolve(typeof a === 'object' && a !== null ? a.port : port)
      })
    }),
    async close() {
      clearInterval(heartbeat)
      clearInterval(drainTick)
      for (const s of sessions.values()) { if (!s.exited) s.pty.kill(); endSession(s) }
      for (const c of sockets) c.ws.terminate()
      wss.close()
      await new Promise<void>((r) => server.close(() => r()))
    },
    snapshot: () => [...sessions.values()].map((s) => ({ ...meta(s), controllerId: s.controllerId, clients: s.clients.size }))
  }
}
