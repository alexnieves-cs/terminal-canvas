import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { WebSocketServer, type WebSocket } from 'ws'
import type { Hub } from './hub'

/**
 * Lane Q (M590, M592). The host's HTTP face: the page's files, its one
 * WebSocket, and the gate in front of both.
 *
 * THE GATE IS THE WHOLE SECURITY STORY. Behind the socket is main, and main
 * spawns shells: anyone who reaches `pty:create` has a shell on the host. So:
 *   - a host bound beyond loopback REFUSES TO START without `TC_HOST_TOKEN`
 *     (`startHost` throws; nothing listens);
 *   - every route but `/healthz` and the sign-in page needs the cookie the
 *     token buys, compared in constant time;
 *   - the socket also checks `Origin` against `Host`, because a cookie is
 *     sent by the browser on a cross-site WebSocket too (SameSite does not
 *     cover a page on another site opening one to here — CSWSH);
 *   - failed sign-ins back off per address and for the host as a whole;
 *   - nothing a request carries can throw the process down;
 *   - with no token, the Host header must name loopback (DNS rebinding).
 */

export interface HostOptions {
  hub: Hub
  /** The built page (out/host-web). */
  webRoot: string
  port: number
  /** Bind address. Loopback unless the deployment says otherwise. */
  bind: string
  /** Required off loopback. Empty means "no sign-in", which only loopback allows. */
  token: string
  appVersion: string
}

export interface RunningHost {
  server: Server
  port: number
  close(): Promise<void>
}

const COOKIE = 'tc_host'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.glb': 'model/gltf-binary',
  '.wasm': 'application/wasm',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json'
}

export function isLoopback(bind: string): boolean {
  return bind === '127.0.0.1' || bind === '::1' || bind === 'localhost'
}

/** A token shorter than this is refused at start: the back-off slows a guesser, it does not stop one. */
export const MIN_TOKEN = 16
/** A cookie is good for this long after sign-in, then the person signs in again. */
export const COOKIE_MAX_AGE_S = 30 * 24 * 3600

function mac(token: string, issued: string): string {
  return createHmac('sha256', `tc-host:${token}`).update(issued).digest('hex')
}

/**
 * What the cookie holds: when it was issued and an HMAC of that under the
 * token. Never the token itself, and not a fixed value either, so a stolen
 * cookie dies of age (review finding 7) as well as on a token change.
 */
export function issueCookie(token: string, now = Date.now()): string {
  const issued = String(Math.floor(now / 1000))
  return `${issued}.${mac(token, issued)}`
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** Never throws: a malformed cookie header is no cookie (an unauthenticated `%` used to kill the process). */
function cookies(req: IncomingMessage): Map<string, string> {
  const out = new Map<string, string>()
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i <= 0) continue
    let value: string
    try { value = decodeURIComponent(part.slice(i + 1).trim()) } catch { continue }
    out.set(part.slice(0, i).trim(), value)
  }
  return out
}

export function signedIn(req: IncomingMessage, token: string, now = Date.now()): boolean {
  if (token === '') return true
  const got = cookies(req).get(COOKIE)
  if (got === undefined) return false
  const dot = got.indexOf('.')
  if (dot <= 0) return false
  const issued = got.slice(0, dot)
  const age = now / 1000 - Number(issued)
  if (!/^\d{1,12}$/.test(issued) || !(age >= -60 && age <= COOKIE_MAX_AGE_S)) return false
  return same(got.slice(dot + 1), mac(token, issued))
}

/**
 * No-token mode is "this machine only", and binding to loopback is not
 * enough for that: a page on evil.example that rebinds its name to
 * 127.0.0.1 reaches the port with `Host: evil.example` and a matching
 * Origin (review finding 2, DNS rebinding). So without a token the Host
 * header itself must name loopback.
 */
export function loopbackHost(req: IncomingMessage): boolean {
  const host = (req.headers.host ?? '').toLowerCase()
  return /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host)
}

/**
 * The WebSocket's own check: the page that opens it must be served from this
 * host. A missing Origin is a non-browser client, which still needs the
 * cookie, so it is let through to that check rather than refused here.
 */
export function originAllowed(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  if (origin === undefined) return true
  let host: string
  try { host = new URL(origin).host } catch { return false }
  const forwarded = typeof req.headers['x-forwarded-host'] === 'string' ? req.headers['x-forwarded-host'].split(',')[0]!.trim() : null
  return host === req.headers.host || (forwarded !== null && host === forwarded)
}

function secure(req: IncomingMessage): boolean {
  const proto = req.headers['x-forwarded-proto']
  return (typeof proto === 'string' && proto.split(',')[0]!.trim() === 'https') || (req.socket as { encrypted?: boolean }).encrypted === true
}

const SIGN_IN = (failed: boolean): string => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Terminal Canvas · sign in</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #12131a; color: #e6e8ee; font: 15px/1.5 -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; }
  form { width: min(360px, calc(100vw - 32px)); display: grid; gap: 12px; }
  h1 { font-size: 18px; font-weight: 600; margin: 0 0 4px; }
  p { margin: 0; color: #8a919e; }
  input { padding: 10px 12px; border-radius: 8px; border: 1px solid #2c2f3a; background: #1a1c24; color: inherit; font: inherit; }
  button { padding: 10px 12px; border-radius: 8px; border: 0; background: #e6e8ee; color: #12131a; font: inherit; font-weight: 600; cursor: pointer; }
  .bad { color: #f08a8a; }
</style></head>
<body><form method="post" action="/__tc/sign-in">
  <h1>Terminal Canvas</h1>
  <p>This host runs shells. Enter its access token to open it.</p>
  ${failed ? '<p class="bad">That token did not match.</p>' : ''}
  <input name="token" type="password" autocomplete="current-password" autofocus aria-label="Access token" placeholder="Access token">
  <button type="submit">Open</button>
</form></body></html>`

export function startHost(options: HostOptions): Promise<RunningHost> {
  const { hub, token, bind } = options
  if (!isLoopback(bind) && token === '') {
    return Promise.reject(new Error(
      `refusing to listen on ${bind} without TC_HOST_TOKEN: anyone who reaches this port gets a shell on this machine. ` +
      'Set TC_HOST_TOKEN to a long random string, or bind to 127.0.0.1.'
    ))
  }
  if (token !== '' && token.length < MIN_TOKEN) {
    return Promise.reject(new Error(`TC_HOST_TOKEN is ${token.length} characters; use at least ${MIN_TOKEN} (openssl rand -hex 24)`))
  }
  const root = resolve(options.webRoot)
  /**
   * The back-off. An attempt is COUNTED when it arrives, before its body is
   * read, so a burst of parallel guesses cannot all pass one stale check
   * (review finding 4). Per address, and also for the whole host: behind a
   * proxy every address is the proxy's, and a guesser rotating addresses
   * must still hit a ceiling.
   */
  const failures = new Map<string, { count: number; until: number }>()
  const recent: number[] = []
  const GLOBAL_PER_MINUTE = 30

  const headers = (res: ServerResponse, type: string, cache: boolean): void => {
    res.setHeader('Content-Type', type)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('Cache-Control', cache ? 'public, max-age=31536000, immutable' : 'no-store')
  }

  const hostInfo = (): string => `window.__TC_HOST__ = ${JSON.stringify({ home: homedir(), platform: process.platform, version: options.appVersion })};\n`

  const tooMany = (res: ServerResponse, waitMs: number): void => {
    res.statusCode = 429
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil(waitMs / 1000))))
    res.end('too many tries; wait a moment')
  }

  const signIn = (req: IncomingMessage, res: ServerResponse): void => {
    const address = req.socket.remoteAddress ?? '?'
    const now = Date.now()
    while (recent.length > 0 && recent[0]! < now - 60_000) recent.shift()
    if (recent.length >= GLOBAL_PER_MINUTE) { tooMany(res, recent[0]! + 60_000 - now); return }
    const f = failures.get(address)
    if (f !== undefined && f.until > now) { tooMany(res, f.until - now); return }
    // Counted now, as a failure until the body proves otherwise.
    recent.push(now)
    const count = (f?.count ?? 0) + 1
    // 1s, 2s, 4s … capped at a minute: slow for a guesser, invisible for a typo.
    failures.set(address, { count, until: now + Math.min(60_000, 1000 * 2 ** (count - 1)) })
    if (failures.size > 10_000) {
      for (const [key, entry] of failures) if (entry.until < now - 3_600_000) failures.delete(key)
    }
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk: string) => { body += chunk; if (body.length > 4096) req.destroy() })
    req.on('end', () => {
      const given = new URLSearchParams(body).get('token') ?? ''
      const digest = (t: string): string => createHash('sha256').update(t).digest('hex')
      if (token !== '' && same(digest(given), digest(token))) {
        failures.delete(address)
        res.statusCode = 303
        res.setHeader('Set-Cookie', `${COOKIE}=${issueCookie(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE_S}${secure(req) ? '; Secure' : ''}`)
        res.setHeader('Location', '/')
        res.end()
        return
      }
      res.statusCode = 401
      headers(res, 'text/html; charset=utf-8', false)
      res.end(SIGN_IN(true))
    })
  }

  const serveFile = (req: IncomingMessage, res: ServerResponse, pathname: string): void => {
    const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1))
    if (rel.includes('\0')) { res.statusCode = 400; res.end(); return }
    const file = normalize(join(root, rel))
    if (file !== root && !file.startsWith(root + sep)) { res.statusCode = 400; res.end(); return }
    if (!existsSync(file) || !statSync(file).isFile()) { res.statusCode = 404; res.end('not found'); return }
    const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream'
    // Vite's hashed assets never change under one name; the page itself always revalidates.
    headers(res, type, rel.startsWith('assets/'))
    if (req.method === 'HEAD') { res.end(); return }
    res.end(readFileSync(file))
  }

  /** Whether a request may go further than /healthz: a valid cookie, and in no-token mode a loopback Host. */
  const admitted = (req: IncomingMessage): boolean => signedIn(req, token) && (token !== '' || loopbackHost(req))

  const handle = (req: IncomingMessage, res: ServerResponse): void => {
    const url = new URL(req.url ?? '/', 'http://host')
    if (url.pathname === '/healthz') { headers(res, 'text/plain; charset=utf-8', false); res.end('ok'); return }
    if (token === '' && !loopbackHost(req)) { res.statusCode = 403; res.end('this host answers only to 127.0.0.1'); return }
    if (url.pathname === '/__tc/sign-in' && req.method === 'POST') { signIn(req, res); return }
    if (!admitted(req)) {
      res.statusCode = 401
      if (url.pathname === '/' || url.pathname === '/index.html') {
        headers(res, 'text/html; charset=utf-8', false)
        res.end(SIGN_IN(false))
      } else {
        res.end('sign in first')
      }
      return
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; res.end(); return }
    if (url.pathname === '/host-info.js') { headers(res, 'text/javascript; charset=utf-8', false); res.end(hostInfo()); return }
    serveFile(req, res, url.pathname)
  }

  // Nothing a request carries may throw out of a listener: an uncaught throw
  // there ends the process, which made a bad escape an unauthenticated kill
  // switch (review finding 1). Every route answers 400 instead.
  const server = createServer((req, res) => {
    try {
      handle(req, res)
    } catch {
      if (!res.headersSent) res.statusCode = 400
      res.end()
    }
  })

  // A frame is a PTY chunk or a door's answer; 64 MB covers a pasted image's base64 with room, and refuses a flood.
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 * 1024 })
  server.on('upgrade', (req, socket, head) => {
    let allowed = false
    try {
      const url = new URL(req.url ?? '/', 'http://host')
      allowed = url.pathname === '/__tc/ws' && admitted(req) && originAllowed(req)
    } catch { allowed = false }
    if (!allowed) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
      const link = hub.attach({ send: (text) => ws.send(text), close: (code, reason) => ws.close(code, reason) })
      ws.on('message', (data) => {
        try { link.message(data.toString()) } catch (error) { console.warn('[host] a frame failed', error) }
      })
      ws.on('close', () => link.close())
      ws.on('error', () => link.close())
    })
  })

  return new Promise((resolveStart, reject) => {
    server.once('error', reject)
    server.listen(options.port, bind, () => {
      server.off('error', reject)
      const address = server.address()
      const port = typeof address === 'object' && address !== null ? address.port : options.port
      resolveStart({
        server,
        port,
        close: () => new Promise((done) => {
          for (const client of wss.clients) client.terminate()
          wss.close()
          server.close(() => done())
        })
      })
    })
  })
}
