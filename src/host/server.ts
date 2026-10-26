import { createHash, timingSafeEqual } from 'node:crypto'
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
 *   - failed sign-ins back off per address.
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

/** What the cookie holds: a digest of the token, so the token itself is never stored in the browser. */
export function cookieValue(token: string): string {
  return createHash('sha256').update(`tc-host:${token}`).digest('hex')
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

function cookies(req: IncomingMessage): Map<string, string> {
  const out = new Map<string, string>()
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out.set(part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1).trim()))
  }
  return out
}

export function signedIn(req: IncomingMessage, token: string): boolean {
  if (token === '') return true
  const got = cookies(req).get(COOKIE)
  return got !== undefined && same(got, cookieValue(token))
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
  const root = resolve(options.webRoot)
  const failures = new Map<string, { count: number; until: number }>()

  const headers = (res: ServerResponse, type: string, cache: boolean): void => {
    res.setHeader('Content-Type', type)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('Cache-Control', cache ? 'public, max-age=31536000, immutable' : 'no-store')
  }

  const hostInfo = (): string => `window.__TC_HOST__ = ${JSON.stringify({ home: homedir(), platform: process.platform, version: options.appVersion })};\n`

  const signIn = (req: IncomingMessage, res: ServerResponse): void => {
    const address = req.socket.remoteAddress ?? '?'
    const now = Date.now()
    const f = failures.get(address)
    if (f !== undefined && f.until > now) {
      res.statusCode = 429
      res.setHeader('Retry-After', String(Math.ceil((f.until - now) / 1000)))
      res.end('too many tries; wait a moment')
      return
    }
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk: string) => { body += chunk; if (body.length > 4096) req.destroy() })
    req.on('end', () => {
      const given = new URLSearchParams(body).get('token') ?? ''
      if (token !== '' && same(cookieValue(given), cookieValue(token))) {
        failures.delete(address)
        res.statusCode = 303
        res.setHeader('Set-Cookie', `${COOKIE}=${cookieValue(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${secure(req) ? '; Secure' : ''}`)
        res.setHeader('Location', '/')
        res.end()
        return
      }
      const count = (f?.count ?? 0) + 1
      // 1s, 2s, 4s … capped at a minute: slow for a guesser, invisible for a typo.
      failures.set(address, { count, until: now + Math.min(60_000, 1000 * 2 ** (count - 1)) })
      res.statusCode = 401
      headers(res, 'text/html; charset=utf-8', false)
      res.end(SIGN_IN(true))
    })
  }

  const serveFile = (req: IncomingMessage, res: ServerResponse, pathname: string): void => {
    const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1))
    const file = normalize(join(root, rel))
    if (file !== root && !file.startsWith(root + sep)) { res.statusCode = 400; res.end(); return }
    if (!existsSync(file) || !statSync(file).isFile()) { res.statusCode = 404; res.end('not found'); return }
    const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream'
    // Vite's hashed assets never change under one name; the page itself always revalidates.
    headers(res, type, rel.startsWith('assets/'))
    if (req.method === 'HEAD') { res.end(); return }
    res.end(readFileSync(file))
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://host')
    if (url.pathname === '/healthz') { headers(res, 'text/plain; charset=utf-8', false); res.end('ok'); return }
    if (url.pathname === '/__tc/sign-in' && req.method === 'POST') { signIn(req, res); return }
    if (!signedIn(req, token)) {
      if (url.pathname === '/' || url.pathname === '/index.html') {
        res.statusCode = 401
        headers(res, 'text/html; charset=utf-8', false)
        res.end(SIGN_IN(false))
      } else {
        res.statusCode = 401
        res.end('sign in first')
      }
      return
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; res.end(); return }
    if (url.pathname === '/host-info.js') { headers(res, 'text/javascript; charset=utf-8', false); res.end(hostInfo()); return }
    serveFile(req, res, url.pathname)
  })

  // A frame is a PTY chunk or a door's answer; 64 MB covers a pasted image's base64 with room, and refuses a flood.
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 * 1024 })
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://host')
    if (url.pathname !== '/__tc/ws' || !signedIn(req, token) || !originAllowed(req)) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
      const link = hub.attach({ send: (text) => ws.send(text), close: (code, reason) => ws.close(code, reason) })
      ws.on('message', (data) => link.message(data.toString()))
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
