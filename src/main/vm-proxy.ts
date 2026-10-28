import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { Duplex } from 'node:stream'
import { vmEgressAllowed, type VmEgressEntry } from '../shared/vm-lane'

/**
 * M554 (lane J). THE ALLOWLIST AT THE DOOR — the one way out of a
 * sandboxed lane's VM. Every lane's `HTTPS_PROXY` points here, with the
 * lane's id and its own secret as the proxy credentials; the image's entry
 * script drops every packet that is not to this address before the agent
 * runs, so a process that ignores the proxy variables has no route at all.
 *
 * HTTPS only, as CONNECT: the proxy never sees inside the tunnel and never
 * needs to — the decision is the host name the lane asked for. A plain-HTTP
 * request is refused outright (nothing travels in the clear), and so is a
 * CONNECT with no credentials or the wrong secret: a proxy bound where a VM
 * can reach it may be reachable by something else too.
 *
 * EVERY CONNECT IS LOGGED, allowed or refused, before it is answered — the
 * egress log is how a person sees in the morning what a lane with prompts
 * off reached for. The log holds names, ports and the verdict; never a
 * credential, never a byte of the tunnel.
 *
 * `decideConnect` is pure; `createVmProxy` is the server, with the upstream
 * dial injected so `verify:vm vm.proxy.*` drives it on loopback with a fake
 * upstream and never touches the network.
 */

export interface VmProxyLanes {
  allowOf(laneId: string): readonly string[]
  tokenOf(laneId: string): string | undefined
}

export type ConnectDecision =
  | { kind: 'allow'; laneId: string; host: string; port: number }
  | { kind: 'refuse'; status: 403 | 407 | 400; laneId: string | null; host: string; port: number; why: string }

/** Constant-time-ish compare: the secret's length is not a secret, its letters are. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

export function decideConnect(target: string, proxyAuthorization: string | undefined, lanes: VmProxyLanes): ConnectDecision {
  const m = /^\[?([^\]\s]+?)\]?:(\d{1,5})$/.exec(target)
  const host = m?.[1] ?? target
  const port = m === null ? 0 : Number(m[2])
  if (m === null) return { kind: 'refuse', status: 400, laneId: null, host, port, why: 'not host:port' }
  const auth = /^Basic\s+([A-Za-z0-9+/=]+)$/i.exec(proxyAuthorization ?? '')
  if (auth === null) return { kind: 'refuse', status: 407, laneId: null, host, port, why: 'no lane credentials' }
  const decoded = Buffer.from(auth[1], 'base64').toString('utf8')
  const colon = decoded.indexOf(':')
  const laneId = colon < 0 ? decoded : decoded.slice(0, colon)
  const secret = colon < 0 ? '' : decoded.slice(colon + 1)
  const expected = lanes.tokenOf(laneId)
  if (expected === undefined || !same(secret, expected)) return { kind: 'refuse', status: 407, laneId: null, host, port, why: 'unknown lane or wrong secret' }
  if (!vmEgressAllowed(host, port, lanes.allowOf(laneId))) return { kind: 'refuse', status: 403, laneId, host, port, why: port === 443 ? 'not on the allowlist' : 'HTTPS (443) only' }
  return { kind: 'allow', laneId, host, port }
}

export interface VmProxyDeps {
  lanes: VmProxyLanes
  /** Dial the real host. Injected: the suite dials a loopback fake. */
  dial(host: string, port: number): Duplex
  /** Every CONNECT, allowed or refused, as it is decided. */
  log(entry: VmEgressEntry): void
  now(): number
}

export interface VmProxy {
  /** Resolves with the bound port. */
  listen(host: string, port?: number): Promise<number>
  close(): Promise<void>
  server: Server
}

export function createVmProxy(deps: VmProxyDeps): VmProxy {
  const server = createServer((req, res) => {
    // A plain request through the proxy: HTTP in the clear. Never forwarded.
    res.writeHead(403, { 'content-type': 'text/plain' })
    res.end('a sandboxed lane reaches the network over HTTPS only\n')
    void req
  })
  const sockets = new Set<Duplex>()
  server.on('connect', (req: IncomingMessage, client: Duplex, head: Buffer) => {
    sockets.add(client)
    client.on('close', () => sockets.delete(client))
    client.on('error', () => { /* the VM went away mid-tunnel */ })
    const d = decideConnect(req.url ?? '', req.headers['proxy-authorization'], deps.lanes)
    try {
      deps.log({ at: deps.now(), laneId: d.laneId ?? '?', host: d.host, port: d.port, allowed: d.kind === 'allow' })
    } catch { /* a log that fails never opens or closes a door */ }
    if (d.kind === 'refuse') {
      const reason = d.status === 407 ? 'Proxy Authentication Required' : d.status === 400 ? 'Bad Request' : 'Forbidden'
      client.end(`HTTP/1.1 ${d.status} ${reason}\r\n${d.status === 407 ? 'Proxy-Authenticate: Basic realm="tc-lane"\r\n' : ''}Content-Length: 0\r\nConnection: close\r\n\r\n`)
      return
    }
    let upstream: Duplex
    try {
      upstream = deps.dial(d.host, d.port)
    } catch {
      client.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n')
      return
    }
    sockets.add(upstream)
    upstream.on('close', () => sockets.delete(upstream))
    let connected = false
    upstream.once('connect', () => {
      connected = true
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head.length > 0) upstream.write(head)
      upstream.pipe(client)
      client.pipe(upstream)
    })
    upstream.on('error', () => {
      if (!connected) client.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n')
      else client.destroy()
    })
    client.on('close', () => upstream.destroy())
  })
  return {
    server,
    listen: (host, port = 0) => new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, host, () => {
        server.off('error', reject)
        const addr = server.address()
        resolve(typeof addr === 'object' && addr !== null ? addr.port : 0)
      })
    }),
    close: () => new Promise((resolve) => {
      for (const s of sockets) s.destroy()
      server.close(() => resolve())
    })
  }
}

/** The egress log's memory: the newest entries, bounded, so a chatty night costs a fixed amount. */
export const VM_EGRESS_KEEP = 2000

export function createEgressLog(append?: (line: string) => void): { add(e: VmEgressEntry): void; list(laneId?: string): VmEgressEntry[] } {
  const entries: VmEgressEntry[] = []
  return {
    add(e) {
      entries.push(e)
      if (entries.length > VM_EGRESS_KEEP) entries.splice(0, entries.length - VM_EGRESS_KEEP)
      try { append?.(JSON.stringify(e) + '\n') } catch { /* the memory copy still holds it */ }
    },
    list: (laneId) => entries.filter((e) => laneId === undefined || e.laneId === laneId).map((e) => ({ ...e }))
  }
}
