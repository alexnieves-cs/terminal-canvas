/* M653. THE REAL APP, DRIVEN FROM OUTSIDE.

   Every other Electron suite here is its own entry point: it bundles the
   pieces main wires up and constructs them itself (scripts/panels-entry.cjs),
   which is what lets it reach into them — and is exactly why none of them can
   answer the three questions this file exists for:

     - how long does `out/main/index.js` take to put a canvas on screen,
     - what does the whole process tree cost while it sits there, and
     - what does a person find after that process is killed.

   Each is a fact about the app's OWN composition root and its own lifetime,
   and a harness that IS the entry point has neither. So this launches the
   built app the way `npm start` does, as a child process, and reaches it
   through the three doors it already has for an outside caller:

     stdout      main's `[startup]` lines (verify:packaged's precedent)
     the socket  userData/control.sock — `open`, `list` (M54)
     DevTools    --remote-debugging-port, for the renderer: the DOM a person
                 would see, and frames timed where they are painted

   and measures cost from OUTSIDE, with `ps` — the number Activity Monitor
   shows, including every helper process, with no probe compiled into the app
   to keep honest.

   Three distortions, the same three verify:packaged makes and for its reasons:
   a throwaway --user-data-dir, a scratch tmux socket, and TC_ALLOW_MULTI so a
   developer's own running copy does not turn the launch into "focus the other
   one and quit". Plain node, no dependencies: Node 22's global fetch and
   WebSocket are the whole DevTools client. */
'use strict'
const { spawn, execFileSync } = require('node:child_process')
const { connect } = require('node:net')
const { existsSync, mkdtempSync, rmSync, realpathSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { tmpdir } = require('node:os')

const ROOT = resolve(__dirname, '..', '..')

/* Under ELECTRON_RUN_AS_NODE the running binary IS Electron; under plain node
   the npm package's main export is the path to it. */
const electronBinary = () => (process.versions.electron ? process.execPath : require(join(ROOT, 'node_modules', 'electron')))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitUntil(fn, ms, every = 100) {
  const deadline = Date.now() + ms
  for (;;) {
    let v = false
    try { v = await fn() } catch { v = false }
    if (v) return v
    if (Date.now() >= deadline) return false
    await sleep(every)
  }
}

/* A SHORT userData path, and not for tidiness: control.sock lives in it, and
   a Unix socket path is capped near 104 bytes on darwin. macOS's own tmpdir
   is already ~50. realpath because main reports the resolved spelling
   (/private/var/…) and a check comparing the two must not fail on a symlink. */
const scratchUserData = (tag) => realpathSync(mkdtempSync(join(tmpdir(), `tcr-${tag}-`)))

/* One request, one reply, the server hangs up (control-server.ts). */
function control(userData, req, timeoutMs = 20000) {
  return new Promise((resolveReply) => {
    let buf = ''
    let done = false
    const finish = (r) => { if (!done) { done = true; resolveReply(r) } }
    const sock = connect(join(userData, 'control.sock'))
    const timer = setTimeout(() => { sock.destroy(); finish({ ok: false, error: 'control socket timed out' }) }, timeoutMs)
    sock.setEncoding('utf8')
    sock.on('connect', () => sock.write(`${JSON.stringify(req)}\n`))
    sock.on('data', (c) => { buf += c })
    sock.on('end', () => { clearTimeout(timer); try { finish(JSON.parse(buf)) } catch { finish({ ok: false, error: `unparseable reply: ${buf.slice(0, 200)}` }) } })
    sock.on('error', (e) => { clearTimeout(timer); finish({ ok: false, error: String(e.message || e) }) })
  })
}

/* The DevTools protocol, as much of it as is used: evaluate in the page, and
   crash it. One socket per target; a target that goes away rejects whatever
   was waiting on it rather than hanging the suite. */
async function attachPage(port, timeoutMs = 30000) {
  const target = await waitUntil(async () => {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    // The app's window, never a browser pane's guest (type `webview`).
    return list.find((t) => t.type === 'page' && typeof t.webSocketDebuggerUrl === 'string' && /index\.html/.test(t.url)) || false
  }, timeoutMs, 150)
  if (!target) throw new Error('no page target answered on the DevTools port')
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', () => rej(new Error('DevTools socket refused')), { once: true }) })
  let seq = 0
  const waiting = new Map()
  ws.addEventListener('message', (m) => {
    let msg
    try { msg = JSON.parse(String(m.data)) } catch { return }
    const w = waiting.get(msg.id)
    if (!w) return
    waiting.delete(msg.id)
    if (msg.error) w.reject(new Error(msg.error.message)); else w.resolve(msg.result)
  })
  ws.addEventListener('close', () => { for (const w of waiting.values()) w.reject(new Error('the page went away')); waiting.clear() })
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq
    waiting.set(id, { resolve: res, reject: rej })
    try { ws.send(JSON.stringify({ id, method, params })) } catch (e) { waiting.delete(id); rej(e) }
  })
  return {
    url: target.url,
    send,
    /* An expression, awaited in the page, returned by value. */
    async js(expression) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      if (r.exceptionDetails) throw new Error(`page threw: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`)
      return r.result.value
    },
    close() { try { ws.close() } catch { /* already closed */ } }
  }
}

/**
 * Launch the built app. Resolves once it is a process; `ready()` waits for
 * the things a caller actually needs.
 */
function launchApp(opts) {
  const { userData, socket } = opts
  const env = { ...process.env, TC_TMUX_SOCKET: socket, TC_ALLOW_MULTI: '1', ...(opts.env || {}) }
  // This suite may itself be running as node inside Electron's binary; the
  // child must be the app, not a second node.
  delete env.ELECTRON_RUN_AS_NODE
  // --enable-precise-memory-info: without it `performance.memory` is rounded
  // into coarse buckets, and a soak's heap series is a flat line that lies.
  const args = [ROOT, `--user-data-dir=${userData}`, '--remote-debugging-port=0', '--remote-allow-origins=*', '--enable-precise-memory-info']
  // A container has no user namespace for Chromium's sandbox. Never on darwin.
  if (process.platform === 'linux') args.push('--no-sandbox')
  const startedAt = Date.now()
  const child = spawn(electronBinary(), args, { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  const stamps = []
  const onData = (b) => {
    const text = b.toString()
    out += text
    for (const line of text.split('\n')) if (line.trim() !== '') stamps.push({ at: Date.now() - startedAt, line })
  }
  child.stdout.on('data', onData)
  child.stderr.on('data', onData)
  let exit = null
  child.on('exit', (code, signal) => { exit = { code, signal } })

  const app = {
    child,
    pid: child.pid,
    userData,
    socket,
    startedAt,
    out: () => out,
    exit: () => exit,
    /* ms from spawn to the first output line matching `re`, or null. */
    stampOf: (re) => { const s = stamps.find((x) => re.test(x.line)); return s ? s.at : null },
    control: (req, ms) => control(userData, req, ms),
    page: null,
    async waitForOutput(re, ms) { return waitUntil(() => re.test(out) || exit !== null, ms, 50).then(() => re.test(out)) },
    async port(ms = 60000) {
      const okOut = await app.waitForOutput(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//, ms)
      if (!okOut) throw new Error(`the app never announced a DevTools port${exit ? ` (exited ${JSON.stringify(exit)})` : ''}\n${out.slice(-1500)}`)
      return Number(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//.exec(out)[1])
    },
    /* (Re)attach to the window's page: after a launch, and after the renderer
       was replaced under us (a crash and its reload). */
    async attach(ms = 60000) {
      if (app.page) app.page.close()
      app.page = await attachPage(await app.port(ms), ms)
      return app.page
    },
    js: (expression) => app.page.js(expression),
    /* Main is up (its summary line), the door is listening, and the canvas
       host is in the DOM. */
    async ready(ms = 90000) {
      const booted = await app.waitForOutput(/\[startup\] packaged=/, ms)
      if (!booted) throw new Error(`the app never printed its startup line${exit ? ` (exited ${JSON.stringify(exit)})` : ''}\n${out.slice(-2000)}`)
      await app.attach(ms)
      const canvas = await waitUntil(() => app.js(`!!document.querySelector('.canvas')`), ms, 50)
      if (!canvas) throw new Error('the window never mounted a canvas')
      const door = await waitUntil(async () => existsSync(join(userData, 'control.sock')) && (await app.control({ verb: 'ping' }, 3000)).ok === true, ms, 150)
      if (!door) throw new Error('the control socket never answered a ping')
      return app
    },
    /* SIGKILL: no before-quit, no flush, no record. What a crash, a force
       quit and a power cut have in common. */
    async kill() {
      if (app.page) { app.page.close(); app.page = null }
      if (exit === null) { try { child.kill('SIGKILL') } catch { /* gone */ } }
      await waitUntil(() => exit !== null, 10000, 50)
    },
    /* Cmd+Q's path, asked for politely: before-quit runs. */
    async quit(ms = 20000) {
      if (app.page) { app.page.close(); app.page = null }
      if (exit === null) { try { child.kill('SIGTERM') } catch { /* gone */ } }
      const gone = await waitUntil(() => exit !== null, ms, 50)
      if (!gone) await app.kill()
      return gone
    }
  }
  return app
}

/* Every process under `pid`, and `pid` itself: main, the GPU and utility
   helpers and each renderer. NOT the shells in the panels on tmux — the tmux
   server daemonises away from the app, which is the point of it; `tmuxTree`
   counts those separately. */
function processTree(pid) {
  let rows
  try {
    rows = execFileSync('ps', ['-axo', 'pid=,ppid=,rss=,pcpu=,comm='], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
      .split('\n').map((l) => /^\s*(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s+(.*)$/.exec(l)).filter(Boolean)
      .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), rssKb: Number(m[3]), cpu: Number(m[4]), comm: m[5] }))
  } catch { return [] }
  const kids = new Map()
  for (const r of rows) { if (!kids.has(r.ppid)) kids.set(r.ppid, []); kids.get(r.ppid).push(r) }
  const self = rows.find((r) => r.pid === pid)
  if (!self) return []
  const tree = [self]
  for (let i = 0; i < tree.length; i++) for (const k of kids.get(tree[i].pid) || []) tree.push(k)
  return tree
}

/* Cumulative CPU seconds for the tree, from `ps -o time` (user+system). The
   difference of two readings over a wall-clock window is the average load —
   steadier than `pcpu`, which on darwin is a decaying average and on linux a
   lifetime one. */
function cpuSeconds(pids) {
  if (pids.length === 0) return 0
  let text = ''
  try { text = execFileSync('ps', ['-o', 'time=', '-p', pids.join(',')], { encoding: 'utf8' }) } catch (e) { text = String(e.stdout || '') }
  let total = 0
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (t === '') continue
    // darwin `M:SS.cc`, linux `[D-]HH:MM:SS`.
    const days = t.includes('-') ? Number(t.split('-')[0]) : 0
    const parts = (t.includes('-') ? t.split('-')[1] : t).split(':').map(Number)
    let secs = 0
    for (const p of parts) secs = secs * 60 + p
    total += days * 86400 + secs
  }
  return total
}

/* Open descriptors of one process. lsof prints a header line. */
function openFiles(pid) {
  try {
    if (process.platform === 'linux') return require('node:fs').readdirSync(`/proc/${pid}/fd`).length
    return Math.max(0, execFileSync('lsof', ['-n', '-P', '-p', String(pid)], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).split('\n').filter(Boolean).length - 1)
  } catch { return null }
}

const tmuxSessions = (socket) => {
  try { return execFileSync('tmux', ['-L', socket, 'list-sessions', '-F', '#{session_name}'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).split('\n').filter(Boolean) } catch { return [] }
}
const killTmux = (socket) => { try { execFileSync('tmux', ['-L', socket, 'kill-server'], { stdio: 'ignore', timeout: 5000 }) } catch { /* no server */ } }

/* N terminals, each with a RUNNING process. Opening is not enough, and the
   reason is the product's own rule: a panel placed outside the viewport is a
   card that says "not started" until the camera reaches it (lod.ts — only a
   panel in view at a readable scale is promoted to live, and only a live one
   spawns). So each is visited, by the same `focus` verb an agent's plan line
   would use, and counted only once main lists a session for it. Returns the
   panel ids in creation order. */
async function openPanels(app, n, perPanelMs = 15000) {
  const before = await app.js(`document.querySelectorAll('.panel[data-panel-kind="terminal"]').length`)
  for (let i = 0; i < n; i++) {
    const r = await app.control({ verb: 'open' })
    if (!r.ok) throw new Error(`open refused: ${r.error}`)
  }
  const mounted = await waitUntil(async () => (await app.js(`document.querySelectorAll('.panel[data-panel-kind="terminal"]').length`)) >= before + n, 30000, 100)
  if (!mounted) throw new Error(`only some of ${n} panels reached the canvas`)
  const ids = await app.js(`[...document.querySelectorAll('.panel[data-panel-kind="terminal"]')].map((e) => e.getAttribute('data-panel-id'))`)
  const listed = async () => new Set(((await app.control({ verb: 'list' })).sessions || []).map((s) => s.panelId))
  let have = await listed()
  for (const id of ids) {
    if (have.has(id)) continue
    const went = await app.control({ verb: 'plan', line: `focus ${id}` })
    if (!went.ok) throw new Error(`focus ${id} refused: ${went.error}`)
    const got = await waitUntil(async () => { have = await listed(); return have.has(id) }, perPanelMs, 80)
    if (!got) throw new Error(`panel ${id} never started a session after the camera reached it`)
  }
  return ids
}

/* A shell that keeps printing, the way an agent mid-turn does: a line every
   `everySec`, forever. Written through the renderer's own pty door, so the
   bytes take the path a keystroke takes. `tr` and `head` rather than a
   shell-specific builtin: the login shell differs by machine. */
const chatter = (app, id, everySec = 0.5) => app.js(`window.canvas.pty.write({ panelId: ${JSON.stringify(id)}, data: ${JSON.stringify(`while :; do date; head -c 96 /dev/urandom | od -An -tx1 | tr -d ' \\n'; echo; sleep ${everySec}; done\n`)} }).then(() => true)`)

/* Frame intervals while the camera is driven by a wheel event every frame —
   a pan, or (ctrl held, which is what a trackpad pinch IS) a zoom that sweeps
   out and back. Timed in the page by rAF, where a dropped frame is felt.
   Resolves null rather than hanging if frames stop coming (a window the OS
   has stopped painting), so the caller can say so. */
const wheelFrames = (app, { frames = 120, pinch = false, timeoutMs = 30000 } = {}) => app.js(`new Promise((resolve) => {
  const host = document.querySelector('.canvas'); const r = host.getBoundingClientRect()
  const dts = []; let last = performance.now(); let i = 0
  const bail = setTimeout(() => resolve(null), ${timeoutMs})
  const step = (now) => { dts.push(now - last); last = now; i += 1
    const sign = i % 40 < 20 ? 1 : -1
    host.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaMode: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
      ctrlKey: ${pinch ? 'true' : 'false'}, deltaX: ${pinch ? '0' : 'sign * 24'}, deltaY: ${pinch ? 'sign * 6' : 'sign * 12'} }))
    if (i <= ${frames}) requestAnimationFrame(step); else { clearTimeout(bail); resolve(dts.slice(1)) } }
  requestAnimationFrame(step) })`)

const frameStats = (dts) => {
  const sorted = [...dts].sort((a, b) => a - b)
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
  const round = (v) => Math.round(v * 10) / 10
  return { frames: dts.length, medianMs: round(at(0.5)), p95Ms: round(at(0.95)), maxMs: round(sorted[sorted.length - 1]) }
}

/* What the app costs right now, from outside: the whole tree's memory, how
   many processes that is, main's open descriptors, and the tree's cumulative
   CPU seconds (difference two readings for a load). */
function sampleCost(app) {
  const tree = processTree(app.pid)
  return {
    at: Date.now(),
    processes: tree.length,
    rssMb: Math.round(tree.reduce((a, t) => a + t.rssKb, 0) / 1024),
    mainRssMb: tree.length > 0 ? Math.round(tree[0].rssKb / 1024) : 0,
    openFiles: openFiles(app.pid),
    cpuSeconds: cpuSeconds(tree.map((t) => t.pid))
  }
}

const cleanup = (userData, socket) => { killTmux(socket); try { rmSync(userData, { recursive: true, force: true }) } catch { /* best effort */ } }

module.exports = { openPanels, chatter, wheelFrames, frameStats, sampleCost, ROOT, launchApp, scratchUserData, control, processTree, cpuSeconds, openFiles, tmuxSessions, killTmux, cleanup, waitUntil, sleep }
