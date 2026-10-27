/* Run with: node scripts/verify-host.cjs
   Lane Q (M590–M594): the hosted version (docs/hosted.md). Plain node: the
   wire, the hub, the gate and the Electron stand-in are bundled with esbuild
   and driven here, with a real HTTP server and WebSocket on loopback and no
   browser, Electron, PTY or network beyond it. Booting the real main on the
   stand-in needs node-pty built for plain Node, which the Mac runner's
   Electron-ABI tree does not have; host.yml does that on Linux, with a
   browser (host.ci.* pins it). Every check reports even when its module
   fails to load. */
'use strict'
const { buildSync } = require('esbuild')
const { readFileSync, existsSync, mkdtempSync, statSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const ROOT = resolve(__dirname, '..')
const { ok, results } = require('./lib/checks.cjs').createChecks()

// The stand-in's data folder, before it loads (runtime.ts reads it at module scope).
process.env.TC_HOST_DATA = mkdtempSync(join(tmpdir(), 'tc-verify-host-'))
delete process.env.TC_HOST_SECRET

const ALIAS = { '@shared': join(ROOT, 'src/shared') }
function load(entry, name) {
  try {
    const outfile = join(ROOT, 'out/verify', `host-${name}.cjs`)
    buildSync({ entryPoints: [join(ROOT, entry)], outfile, bundle: true, platform: 'node', format: 'cjs', alias: ALIAS, logLevel: 'silent', loader: { '.css': 'empty' } })
    return { mod: require(outfile) }
  } catch (error) {
    return { error: error.message.split('\n')[0] }
  }
}
const read = (rel) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), 'utf8') : '')
const check = async (id, loaded, test) => {
  if (loaded.mod === undefined) { ok(id, false, loaded.error); return }
  try {
    const r = await test(loaded.mod)
    ok(id, r.pass, JSON.stringify(r.detail ?? '').slice(0, 400))
  } catch (error) { ok(id, false, error.message) }
}
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms))

const wire = load('src/host/wire.ts', 'wire')
const hubMod = load('src/host/hub.ts', 'hub')
const serverMod = load('src/host/server.ts', 'server')
const shim = load('src/host/electron-shim.ts', 'shim')
const keys = load('src/host-web/keys.ts', 'keys')
const tabKeys = load('src/shared/hosted-keys.ts', 'tab-keys')

/** A socket the hub can hold, recording what it was sent. */
function fakeSocket() {
  const sent = []
  let closed = null
  return { sent, frames: () => sent.map((t) => JSON.parse(t)), closedWith: () => closed, send: (t) => sent.push(t), close: (code) => { closed = code ?? 1000 } }
}

;(async () => {
  // ── wire (M590) ──
  await check('host.wire.1 a structured-clone value survives the wire: undefined in arrays, bytes, Date, Map, Set, Error', wire, (w) => {
    const value = { list: [1, undefined, 'x'], bytes: new Uint8Array([0, 1, 254, 255]), buf: Buffer.from('héllo'), when: new Date(5), map: new Map([['a', { b: 1 }]]), set: new Set([1, 2]), err: new TypeError('nope'), gone: undefined }
    const back = w.unpack(JSON.parse(JSON.stringify(w.pack(value))))
    const pass = back.list.length === 3 && back.list[1] === undefined && back.bytes instanceof Uint8Array && Array.from(back.bytes).join() === '0,1,254,255' &&
      Buffer.from(back.buf).toString() === 'héllo' && back.when instanceof Date && back.when.getTime() === 5 && back.map.get('a').b === 1 &&
      back.set.has(2) && back.err instanceof Error && back.err.name === 'TypeError' && back.err.message === 'nope' && !('gone' in back)
    return { pass, detail: Object.keys(back) }
  })
  await check('host.wire.2 plain JSON passes through untouched, and the base64 agrees with Buffer at every length', wire, (w) => {
    const plain = { panelId: 'p1', data: 'echo hi\r\n', n: 3, nested: [{ a: null, b: true }] }
    const same = JSON.stringify(w.pack(plain)) === JSON.stringify(plain)
    const bad = []
    for (let n = 0; n < 40; n++) {
      const bytes = Buffer.from(Array.from({ length: n }, (_, i) => (i * 37 + n) & 255))
      if (w.bytesToBase64(bytes) !== bytes.toString('base64')) bad.push(`enc ${n}`)
      if (Buffer.from(w.base64ToBytes(bytes.toString('base64'))).compare(bytes) !== 0) bad.push(`dec ${n}`)
    }
    return { pass: same && bad.length === 0, detail: { same, bad } }
  })
  await check('host.wire.3 a malformed frame decodes to null, never a throw', wire, (w) => {
    const all = ['', 'not json', '42', 'null', '{"x":1}', '[]'].map((t) => w.decodeFrame(t))
    return { pass: all.every((f) => f === null), detail: all }
  })

  await check('host.wire.4 a hostile frame is no frame: wrong tag payloads, deep nesting, and __proto__ cannot reach a handler', wire, (w) => {
    const bad = ['{"t":"invoke","id":1,"channel":"x","args":[{"$tc":"map","v":1}]}', '{"t":"invoke","id":1,"channel":"x","args":[{"$tc":"bytes"}]}',
      `{"t":"invoke","id":1,"channel":"x","args":[${'['.repeat(5000)}${']'.repeat(5000)}]}`, '{"t":"invoke","id":1,"channel":"x"}'].map((t) => w.decodeFrame(t))
    const proto = w.decodeFrame('{"t":"invoke","id":1,"channel":"x","args":[{"__proto__":{"admin":true},"a":1}]}')
    const arg = proto && proto.args[0]
    const pass = bad.every((f) => f === null) && arg && arg.a === 1 && arg.admin === undefined && Object.getPrototypeOf(arg) === Object.prototype
    return { pass, detail: { bad, admin: arg && arg.admin } }
  })
  {
    const main = read('src/host/host-main.ts')
    const rt = read('src/host/runtime.ts')
    const scrub = main.indexOf('scrubSecretsFromEnv()')
    const boot = main.indexOf("await import('../main/index')")
    const pass = scrub > 0 && boot > scrub && /delete process\.env\['TC_HOST_TOKEN'\]/.test(rt) && /delete process\.env\['TC_HOST_SECRET'\]/.test(rt) &&
      !/process\.env\['TC_HOST_(TOKEN|SECRET)'\]/.test(read('src/host/electron-shim.ts') + main)
    ok('host.env.1 the token and the credential secret leave process.env before main loads, so no shell or agent inherits them', pass)
  }

  // ── hub (M590) ──
  await check('host.hub.1 an invoke reaches its handler; a throw rejects with Electron\'s own wording', { mod: hubMod.mod && wire.mod ? { ...hubMod.mod, ...wire.mod } : undefined, error: hubMod.error || wire.error }, async (m) => {
    const hub = m.createHub()
    hub.handle('sum', (_e, a, b) => a + b)
    hub.handle('boom', () => { throw new Error('bad input') })
    const s = fakeSocket()
    const link = hub.attach(s)
    link.message(m.encodeFrame({ t: 'ready' }))
    link.message(m.encodeFrame({ t: 'invoke', id: 1, channel: 'sum', args: [2, 3] }))
    link.message(m.encodeFrame({ t: 'invoke', id: 2, channel: 'boom', args: [] }))
    link.message(m.encodeFrame({ t: 'invoke', id: 3, channel: 'nobody', args: [] }))
    await tick(5)
    const results = s.frames().filter((f) => f.t === 'result')
    const r1 = results.find((f) => f.id === 1)
    const r2 = results.find((f) => f.id === 2)
    const r3 = results.find((f) => f.id === 3)
    let doubled = false
    try { hub.handle('sum', () => 0) } catch { doubled = true }
    const pass = r1?.ok === true && r1.value === 5 && r2?.ok === false && r2.message === "Error invoking remote method 'boom': Error: bad input" &&
      r3?.ok === false && /No handler registered for 'nobody'/.test(r3.message) && doubled
    return { pass, detail: { r1, r2, r3, doubled } }
  })
  await check('host.hub.2 events wait for ready; a late page still gets the boot progress the splash waits on', { mod: hubMod.mod && wire.mod ? { ...hubMod.mod, ...wire.mod } : undefined, error: hubMod.error || wire.error }, async (m) => {
    const hub = m.createHub()
    hub.broadcast('boot:progress', [{ step: 'probe' }])
    hub.broadcast('pty:data', [{ panelId: 'x', data: 'early' }])
    const s = fakeSocket()
    const link = hub.attach(s)
    hub.broadcast('pty:data', [{ panelId: 'x', data: 'before ready' }])
    const beforeReady = s.frames().filter((f) => f.t === 'event').length
    link.message(m.encodeFrame({ t: 'ready' }))
    hub.broadcast('pty:data', [{ panelId: 'x', data: 'after' }])
    const events = s.frames().filter((f) => f.t === 'event')
    const pass = beforeReady === 0 && events.length === 2 && events[0].channel === 'boot:progress' && events[1].args[0].data === 'after'
    return { pass, detail: events.map((e) => e.channel) }
  })
  await check('host.hub.3 a newer tab takes over: the old one is told, then main sees a navigation and a load, in that order', { mod: hubMod.mod && wire.mod ? { ...hubMod.mod, ...wire.mod } : undefined, error: hubMod.error || wire.error }, async (m) => {
    const hub = m.createHub()
    const seen = []
    hub.setHooks({ onPageReady: () => seen.push('ready'), onPageGone: () => seen.push('gone'), onMenu: () => {} })
    const a = fakeSocket()
    const la = hub.attach(a)
    la.message(m.encodeFrame({ t: 'ready' }))
    const b = fakeSocket()
    const lb = hub.attach(b)
    lb.message(m.encodeFrame({ t: 'ready' }))
    // The old socket's message after takeover is ignored, and its close changes nothing.
    hub.handle('poke', () => { seen.push('poked'); return 1 })
    la.message(m.encodeFrame({ t: 'invoke', id: 9, channel: 'poke', args: [] }))
    la.close()
    await tick(5)
    const pass = a.frames().some((f) => f.t === 'replaced') && a.closedWith() === 4000 && seen.join(',') === 'ready,gone,ready' && hub.live()
    return { pass, detail: { seen, closed: a.closedWith() } }
  })
  await check('host.hub.4 a question with no page answers its fallback; a dropped page answers its pending ones', { mod: hubMod.mod && wire.mod ? { ...hubMod.mod, ...wire.mod } : undefined, error: hubMod.error || wire.error }, async (m) => {
    const hub = m.createHub()
    const none = await hub.ask('message', {}, { response: 1 })
    const s = fakeSocket()
    const link = hub.attach(s)
    link.message(m.encodeFrame({ t: 'ready' }))
    const answered = hub.ask('message', { message: 'sure?' }, { response: 1 })
    const ask = s.frames().find((f) => f.t === 'ask')
    link.message(m.encodeFrame({ t: 'answer', id: ask.id, value: { response: 0 } }))
    const got = await answered
    const pending = hub.ask('message', {}, { response: 1 })
    link.close()
    const dropped = await pending
    const pass = none.response === 1 && got.response === 0 && dropped.response === 1 && ask.payload.message === 'sure?'
    return { pass, detail: { none, got, dropped } }
  })
  await check('host.hub.5 event.sender reaches only the page that asked, and is destroyed once that page is replaced', { mod: hubMod.mod && wire.mod ? { ...hubMod.mod, ...wire.mod } : undefined, error: hubMod.error || wire.error }, async (m) => {
    const hub = m.createHub()
    let sender = null
    hub.handle('watch', (event) => { sender = event.sender; return null })
    const a = fakeSocket()
    const la = hub.attach(a)
    la.message(m.encodeFrame({ t: 'ready' }))
    la.message(m.encodeFrame({ t: 'invoke', id: 1, channel: 'watch', args: [] }))
    await tick(5)
    sender.send('file:changed', { n: 1 })
    const toA = a.frames().filter((f) => f.t === 'event').length
    const b = fakeSocket()
    hub.attach(b).message(m.encodeFrame({ t: 'ready' }))
    sender.send('file:changed', { n: 2 })
    const pass = toA === 1 && sender.isDestroyed() && b.frames().filter((f) => f.t === 'event' && f.channel === 'file:changed').length === 0
    return { pass, detail: { toA, destroyed: sender.isDestroyed() } }
  })

  // ── the gate (M592) ──
  const gate = { mod: serverMod.mod && hubMod.mod && wire.mod ? { ...serverMod.mod, ...hubMod.mod, ...wire.mod } : undefined, error: serverMod.error || hubMod.error || wire.error }
  await check('host.gate.1 a host off loopback without a token refuses to start', gate, async (m) => {
    let message = ''
    try { await m.startHost({ hub: m.createHub(), webRoot: ROOT, port: 0, bind: '0.0.0.0', token: '', appVersion: 't' }) } catch (error) { message = error.message }
    return { pass: /refusing to listen on 0\.0\.0\.0 without TC_HOST_TOKEN/.test(message), detail: message }
  })

  let host = null
  const TOKEN = 'verify-token-0123456789'
  const webRoot = mkdtempSync(join(tmpdir(), 'tc-verify-web-'))
  require('node:fs').writeFileSync(join(webRoot, 'index.html'), '<!doctype html><title>page</title>')
  const hub = hubMod.mod ? hubMod.mod.createHub() : null
  if (gate.mod) {
    try {
      hub.handle('echo', (_e, x) => ({ x, at: new Date(7) }))
      host = await gate.mod.startHost({ hub, webRoot, port: 0, bind: '127.0.0.1', token: TOKEN, appVersion: '9.9.9' })
    } catch (error) { gate.error = error.message; gate.mod = undefined }
  }
  const base = host ? `http://127.0.0.1:${host.port}` : ''
  const cookie = gate.mod ? `tc_host=${gate.mod.issueCookie(TOKEN)}` : ''

  await check('host.gate.2 before signing in only /healthz and the sign-in page answer', gate, async () => {
    const health = await fetch(`${base}/healthz`)
    const page = await fetch(`${base}/`)
    const info = await fetch(`${base}/host-info.js`)
    const html = await page.text()
    const pass = health.status === 200 && page.status === 401 && html.includes('action="/__tc/sign-in"') && !html.includes('<title>page</title>') && info.status === 401
    return { pass, detail: [health.status, page.status, info.status] }
  })
  await check('host.gate.3 the right token buys an HttpOnly, SameSite=Strict cookie that is not the token; a wrong one backs off', gate, async () => {
    const wrong = await fetch(`${base}/__tc/sign-in`, { method: 'POST', body: 'token=nope', headers: { 'content-type': 'application/x-www-form-urlencoded' }, redirect: 'manual' })
    const again = await fetch(`${base}/__tc/sign-in`, { method: 'POST', body: `token=${TOKEN}`, headers: { 'content-type': 'application/x-www-form-urlencoded' }, redirect: 'manual' })
    await tick(1100)
    const right = await fetch(`${base}/__tc/sign-in`, { method: 'POST', body: `token=${TOKEN}`, headers: { 'content-type': 'application/x-www-form-urlencoded' }, redirect: 'manual' })
    const set = right.headers.get('set-cookie') ?? ''
    const pass = wrong.status === 401 && again.status === 429 && right.status === 303 && /HttpOnly/.test(set) && /SameSite=Strict/.test(set) && !set.includes(TOKEN) && /^tc_host=\d+\.[0-9a-f]{64};/.test(set)
    return { pass, detail: { wrong: wrong.status, again: again.status, right: right.status, set } }
  })
  await check('host.gate.4 signed in, the page and /host-info.js answer; a path outside the page\'s folder does not', gate, async () => {
    const page = await fetch(`${base}/`, { headers: { cookie } })
    const info = await fetch(`${base}/host-info.js`, { headers: { cookie } })
    const text = await info.text()
    const escape = await fetch(`${base}/..%2f..%2fpackage.json`, { headers: { cookie } })
    const pass = page.status === 200 && (await page.text()).includes('<title>page</title>') && /window\.__TC_HOST__ = \{"home":/.test(text) && text.includes('"version":"9.9.9"') &&
      (escape.status === 400 || escape.status === 404) && page.headers.get('x-frame-options') === 'DENY'
    return { pass, detail: { page: page.status, escape: escape.status } }
  })
  await check('host.gate.5 the socket refuses no cookie and a foreign Origin, and carries an invoke when both are right', gate, async (m) => {
    const WebSocket = require('ws')
    const url = `ws://127.0.0.1:${host.port}/__tc/ws`
    const outcome = (headers) => new Promise((done) => {
      const ws = new WebSocket(url, { headers })
      ws.on('open', () => { ws.close(); done('open') })
      ws.on('unexpected-response', (_req, res) => done(res.statusCode))
      ws.on('error', () => done('error'))
    })
    const noCookie = await outcome({ origin: `http://127.0.0.1:${host.port}` })
    const foreign = await outcome({ cookie, origin: 'https://evil.example' })
    const answer = await new Promise((done) => {
      const ws = new WebSocket(url, { headers: { cookie, origin: `http://127.0.0.1:${host.port}` } })
      ws.on('open', () => {
        ws.send(m.encodeFrame({ t: 'ready' }))
        ws.send(m.encodeFrame({ t: 'invoke', id: 1, channel: 'echo', args: [new Uint8Array([9])] }))
      })
      ws.on('message', (data) => {
        const f = m.decodeFrame(String(data))
        if (f?.t === 'result') { ws.close(); done(f) }
      })
      ws.on('error', (e) => done({ error: e.message }))
      setTimeout(() => done({ error: 'timeout' }), 4000)
    })
    const pass = noCookie === 403 && foreign === 403 && answer.ok === true && answer.value.x instanceof Uint8Array && answer.value.at instanceof Date
    return { pass, detail: { noCookie, foreign, answer: answer.ok ?? answer.error } }
  })
  await check('host.gate.6 nothing a request carries throws the host down: a bad cookie escape, a bad path escape, a "//" target', gate, async () => {
    const net = require('node:net')
    const raw = (text) => new Promise((done) => {
      const sock = net.connect(host.port, '127.0.0.1', () => sock.write(text))
      let got = ''
      sock.on('data', (d) => { got += d })
      sock.on('close', () => done(got.split('\r\n')[0]))
      sock.on('error', () => done('error'))
      setTimeout(() => { sock.destroy(); done(got.split('\r\n')[0] || 'timeout') }, 2000)
    })
    const badCookie = await raw('GET / HTTP/1.1\r\nHost: x\r\nCookie: tc_host=%\r\nConnection: close\r\n\r\n')
    const badUpgrade = await raw('GET /__tc/ws HTTP/1.1\r\nHost: x\r\nCookie: tc_host=%E0%A4%A\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n')
    const slashes = await raw('GET // HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n')
    const badPath = await raw(`GET /%E0%A4%A HTTP/1.1\r\nHost: x\r\nCookie: ${cookie}\r\nConnection: close\r\n\r\n`)
    const alive = (await fetch(`${base}/healthz`)).status === 200
    return { pass: alive && /401/.test(badCookie) && /403/.test(badUpgrade) && /40\d/.test(slashes) && /400/.test(badPath), detail: { badCookie, badUpgrade, slashes, badPath, alive } }
  })
  await check('host.gate.7 a cookie is an issue time and an HMAC: a forged, an expired or another token\'s cookie is refused', gate, async (m) => {
    const req = (c) => ({ headers: { cookie: `tc_host=${c}` } })
    const now = Date.now()
    const good = m.signedIn(req(m.issueCookie(TOKEN, now)), TOKEN, now)
    const old = m.signedIn(req(m.issueCookie(TOKEN, now - (m.COOKIE_MAX_AGE_S + 60) * 1000)), TOKEN, now)
    const other = m.signedIn(req(m.issueCookie('another-token-0123456789', now)), TOKEN, now)
    const forged = m.signedIn(req(`${Math.floor(now / 1000)}.${'0'.repeat(64)}`), TOKEN, now)
    const fixed = m.signedIn(req(require('node:crypto').createHash('sha256').update(`tc-host:${TOKEN}`).digest('hex')), TOKEN, now)
    let short = ''
    try { await m.startHost({ hub: m.createHub(), webRoot: ROOT, port: 0, bind: '127.0.0.1', token: 'short', appVersion: 't' }) } catch (error) { short = error.message }
    return { pass: good && !old && !other && !forged && !fixed && /at least 16/.test(short), detail: { good, old, other, forged, fixed, short } }
  })
  await check('host.gate.8 a burst of parallel guesses is counted as it arrives: one passes the back-off, the rest are 429', gate, async () => {
    await tick(1100)
    const tries = await Promise.all(Array.from({ length: 6 }, () => fetch(`${base}/__tc/sign-in`, { method: 'POST', body: 'token=guess-guess-guess', headers: { 'content-type': 'application/x-www-form-urlencoded' }, redirect: 'manual' }).then((r) => r.status)))
    const passed = tries.filter((s) => s === 401).length
    return { pass: passed <= 1 && tries.filter((s) => s === 429).length >= 5, detail: tries }
  })
  if (host) await host.close()

  await check('host.gate.9 with no token, only a loopback Host is answered (a DNS-rebound name is refused, page and socket)', gate, async (m) => {
    const open = await m.startHost({ hub: m.createHub(), webRoot, port: 0, bind: '127.0.0.1', token: '', appVersion: 't' })
    const net = require('node:net')
    const raw = (text) => new Promise((done) => {
      const sock = net.connect(open.port, '127.0.0.1', () => sock.write(text))
      let got = ''
      sock.on('data', (d) => { got += d })
      sock.on('close', () => done(got.split('\r\n')[0]))
      sock.on('error', () => done('error'))
      setTimeout(() => { sock.destroy(); done(got.split('\r\n')[0] || 'timeout') }, 2000)
    })
    const local = await raw(`GET / HTTP/1.1\r\nHost: 127.0.0.1:${open.port}\r\nConnection: close\r\n\r\n`)
    const rebound = await raw(`GET / HTTP/1.1\r\nHost: evil.example:${open.port}\r\nConnection: close\r\n\r\n`)
    const socket = await raw(`GET /__tc/ws HTTP/1.1\r\nHost: evil.example:${open.port}\r\nOrigin: http://evil.example:${open.port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`)
    await open.close()
    return { pass: /200/.test(local) && /403/.test(rebound) && /403/.test(socket), detail: { local, rebound, socket } }
  })

  // ── the Electron stand-in (M590) ──
  await check('host.shim.1 every value main imports from electron is something the stand-in exports', shim, (s) => {
    const files = require('node:child_process').execFileSync('git', ['ls-files', 'src/main'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter((f) => /\.ts$/.test(f))
    const names = new Set()
    for (const f of files) {
      const text = read(f)
      for (const m of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*'electron'/g)) {
        for (const part of m[1].split(',')) {
          const name = part.trim()
          if (name === '' || name.startsWith('type ')) continue
          names.add(name.split(/\s+as\s+/)[0].trim())
        }
      }
      // `import type { … }` is erased; only value imports need the stand-in.
    }
    const typeOnly = new Set(['IpcMainInvokeEvent', 'IpcMainEvent', 'WebContents', 'MenuItemConstructorOptions', 'Event', 'MessageBoxOptions', 'OpenDialogOptions', 'SaveDialogOptions'])
    const missing = [...names].filter((n) => !typeOnly.has(n) && s[n] === undefined)
    return { pass: names.size > 10 && missing.length === 0, detail: { names: names.size, missing } }
  })
  await check('host.shim.2 safeStorage seals on the host, refuses a tampered blob, and keeps its key file 0600', shim, (s) => {
    const sealed = s.safeStorage.encryptString('sk-secret')
    const back = s.safeStorage.decryptString(sealed)
    const tampered = Buffer.from(sealed)
    tampered[tampered.length - 1] ^= 1
    let refused = false
    try { s.safeStorage.decryptString(tampered) } catch { refused = true }
    const mode = statSync(join(process.env.TC_HOST_DATA, 'host-key')).mode & 0o777
    return { pass: back === 'sk-secret' && !sealed.includes(Buffer.from('sk-secret')) && refused && mode === 0o600, detail: { mode: mode.toString(8), refused } }
  })
  await check('host.shim.3 the menu\'s accelerators reach the page, and a matched one runs its item (a checkbox flips first)', { mod: shim.mod && wire.mod ? { shim: shim.mod, wire: wire.mod } : undefined, error: shim.error || wire.error }, async ({ shim: s, wire: w }) => {
    const clicks = []
    const menu = s.Menu.buildFromTemplate([
      { label: 'App', submenu: [{ label: 'Toggle', type: 'checkbox', checked: false, accelerator: 'CmdOrCtrl+Shift+T', click: (item) => clicks.push(['toggle', item.checked]) }] },
      { label: 'File', submenu: [{ label: 'New task', accelerator: 'CmdOrCtrl+N', click: () => clicks.push(['new']) }, { role: 'quit' }] }
    ])
    const sock = fakeSocket()
    const hubOf = s.__hubForVerify
    if (hubOf === undefined) return { pass: false, detail: 'the stand-in does not expose its hub to the suite' }
    const link = hubOf.attach(sock)
    link.message(w.encodeFrame({ t: 'ready' }))
    s.Menu.setApplicationMenu(menu)
    const items = sock.frames().filter((f) => f.t === 'menu').pop()?.items ?? []
    const toggle = items.find((i) => i.label === 'Toggle')
    link.message(w.encodeFrame({ t: 'menu', id: toggle?.id ?? '?' }))
    link.message(w.encodeFrame({ t: 'menu', id: items.find((i) => i.label === 'New task')?.id ?? '?' }))
    link.close()
    const pass = items.length === 2 && clicks.length === 2 && clicks[0][1] === true && clicks[1][0] === 'new'
    return { pass, detail: { items, clicks } }
  })
  await check('host.shim.4 shell.openExternal refuses anything but http(s) and mailto', shim, async (s) => {
    let refused = false
    try { await s.shell.openExternal('file:///etc/passwd') } catch { refused = true }
    await s.shell.openExternal('https://example.com')
    return { pass: refused, detail: { refused } }
  })

  // ── the tab's keys (M591) ──
  await check('host.keys.1 Electron accelerators parse for a Mac and for elsewhere, and keys match by physical code', keys, (k) => {
    const mac = k.parseAccelerator('CmdOrCtrl+Shift+N', true)
    const pc = k.parseAccelerator('CmdOrCtrl+Shift+N', false)
    const plus = k.parseAccelerator('CmdOrCtrl+Plus', true)
    const comma = k.parseAccelerator('Cmd+,', true)
    const pass = mac.cmd && !mac.ctrl && mac.shift && mac.key === 'n' && pc.ctrl && !pc.cmd && plus.key === '=' && comma.key === ',' &&
      k.keyOf({ code: 'KeyN', key: 'Ñ' }) === 'n' && k.keyOf({ code: 'Digit1', key: '!' }) === '1' && k.keyOf({ code: 'Comma', key: '≤' }) === ',' &&
      k.parseAccelerator('', true) === null
    return { pass, detail: { mac, pc, plus, comma } }
  })

  // M610. A browser keeps ⌘N/⌘T/⌘W, and off a Mac there is no ⌘.
  await check('host.keys.2 the chords a browser keeps are reached with ⌥, and the Keyboard page prints that', tabKeys, (k) => {
    const f = (o) => ({ meta: false, ctrl: false, alt: false, shift: false, ...o })
    const altN = k.appChordOf(f({ alt: true, key: 'n' }), true, false)
    const altShiftT = k.appChordOf(f({ alt: true, shift: true, key: 't' }), true, true)
    const altK = k.appChordOf(f({ alt: true, key: 'k' }), true, false)
    const pass = altN !== null && altN.meta && !altN.alt && altShiftT !== null && altShiftT.meta && altShiftT.shift && altK === null &&
      k.tabChord('⌘N', true) === '⌥N' && k.tabChord('⌘⇧T', true) === '⌥⇧T' && k.tabChord('⌘⌥N', true) === '⌥⌘N' && k.tabChord('⌘K', true) === '⌘K' &&
      k.browserKeeps('⌘W') && !k.browserKeeps('⌘⌥N')
    return { pass, detail: { altN, altShiftT, altK } }
  })
  await check('host.keys.3 off a Mac Ctrl stands for ⌘, Ctrl+Shift in a terminal or field, and V and plain Ctrl in a field are left alone', tabKeys, (k) => {
    const f = (o) => ({ meta: false, ctrl: false, alt: false, shift: false, ...o })
    const out = k.appChordOf(f({ ctrl: true, key: 'k' }), false, false)
    const sigint = k.appChordOf(f({ ctrl: true, key: 'c' }), false, true)
    const term = k.appChordOf(f({ ctrl: true, shift: true, key: 'k' }), false, true)
    const paste = k.appChordOf(f({ ctrl: true, key: 'v' }), false, false)
    const kept = k.appChordOf(f({ ctrl: true, key: 'n' }), false, false)
    const macCtrl = k.appChordOf(f({ ctrl: true, key: 'k' }), true, false)
    const pass = out !== null && out.meta && !out.ctrl && sigint === null && term !== null && term.meta && !term.shift && !term.ctrl &&
      paste === null && kept === null && macCtrl === null &&
      k.tabChord('⌘⇧K', false) === 'Ctrl+Shift+K' && k.tabChord('⌘N', false) === 'Alt+N' &&
      k.hostedWords('while on, any program on this Mac') === 'while on, any program on the host'
    return { pass, detail: { out, sigint, term, paste, kept, macCtrl, pc: k.tabChord('⌘⇧K', false) } }
  })
  await check('host.keys.4 the tab sends a translated key on to the page, and tells the renderer it is a tab', { mod: {} }, () => {
    const chrome = read('src/host-web/host-chrome.ts')
    const install = read('src/host-web/install.ts')
    const pre = read('src/preload/index.ts')
    const pass = chrome.includes('appChordOf(') && chrome.includes('!event.isTrusted') && chrome.includes('dispatchEvent(new KeyboardEvent') &&
      install.includes("'--tc-hosted=1'") && pre.includes("hosted: process.argv.includes('--tc-hosted=1')")
    return { pass }
  })

  // ── the shape of the build, the page and the deploy ──
  {
    const pre = read('src/preload/index.ts')
    const cfg = read('vite.host.config.ts')
    const bare = [...pre.matchAll(/from '([^'.@][^']*|@[^'/]+\/[^']+)'/g)].map((m) => m[1]).filter((n) => !n.startsWith('@shared'))
    const aliased = bare.filter((n) => cfg.includes(n === 'electron' ? 'find: /^electron$/' : n === 'os' ? 'find: /^os$/' : `'${n}'`))
    const reads = [...new Set([...pre.matchAll(/process\.(\w+)/g)].map((m) => m[1]))]
    const pass = bare.length >= 3 && aliased.length === bare.length && reads.every((r) => cfg.includes(`'process.${r}'`))
    ok('host.preload.1 the tab runs the app\'s own preload: every package it imports and every process read it makes is pointed at the tab\'s answer', pass, JSON.stringify({ bare, aliased, reads }))
  }
  {
    const b = read('scripts/build-host.cjs')
    const pkg = JSON.parse(read('package.json'))
    const pass = /electron: resolve\(ROOT, 'src\/host\/electron-shim\.ts'\)/.test(b) && /external: \['node-pty'\]/.test(b) &&
      /build-host\.cjs/.test(pkg.scripts['build:host'] ?? '') && /src\/host\/host-main\.ts/.test(b)
    ok('host.build.1 build:host aliases electron to the stand-in, keeps only node-pty outside the bundle, and enters at host-main', pass)
  }
  {
    const main = read('src/host/host-main.ts')
    const start = main.indexOf('await startHost(')
    const boot = main.indexOf("await import('../main/index')")
    ok('host.boot.1 the gate listens before main loads, so a host that refuses to start has started nothing', start > 0 && boot > start && !/^import .*'\.\.\/main\/index'/m.test(main))
  }
  {
    const wf = read('.github/workflows/host.yml')
    const smoke = wf.slice(wf.indexOf('\n  smoke:'), wf.indexOf('\n  image:'))
    const image = wf.slice(wf.indexOf('\n  image:'))
    const pass = /pull_request:/.test(wf) && /npm run build:host/.test(smoke) && /node scripts\/host-smoke\.cjs/.test(smoke) && /node-gyp rebuild --directory node_modules\/node-pty/.test(smoke) &&
      /docker build -f deploy\/host\/Dockerfile/.test(image) && /HOST_URL/.test(image) && /node scripts\/host-smoke\.cjs/.test(image) && /^permissions:\n {2}contents: read/m.test(wf)
    ok('host.ci.1 host.yml boots the host and the image on every PR and drives each through a browser', pass)
  }
  {
    const d = read('deploy/host/Dockerfile')
    const pass = /^USER tc$/m.test(d) && /VOLUME \["\/home\/tc"\]/.test(d) && /HEALTHCHECK .*\/healthz/.test(d) && !/ENV[^\n]*TC_HOST_TOKEN/.test(d) && !/ARG TC_HOST_TOKEN/.test(d) &&
      /--ignore-scripts/.test(d) && /CMD \["node", "\/app\/out\/host\/host\.cjs"\]/.test(d)
    ok('host.docker.1 the image runs as a user, keeps one volume, checks its health, and never carries a token', pass)
  }
  {
    const doc = read('docs/hosted.md')
    ok('host.docs.1 docs/hosted.md says how to deploy, what the token guards, and what the hosted version cannot do',
      /TC_HOST_TOKEN/.test(doc) && /## Deploy/.test(doc) && /## Security/.test(doc) && /## What the hosted version cannot do/.test(doc))
  }

  console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`)
  if (results.some((r) => !r.pass)) process.exitCode = 1
  // The ws server and timers above are closed; nothing should hold the loop, but a stray one must not hang the runner.
  setTimeout(() => process.exit(process.exitCode ?? 0), 200).unref()
})()
