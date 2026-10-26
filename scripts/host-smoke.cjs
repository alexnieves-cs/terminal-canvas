/* Run with: npm run build:host && node scripts/host-smoke.cjs
   Lane Q (M594). The hosted version in a real browser against a real host:
   out/host/host.cjs started as a child, signed in through its own form, and
   driven through the page's own `window.canvas` — which is the app's
   preload over the WebSocket, so a door that answers here answers through
   main's real handler. Run by host.yml (Linux, the runner's Chrome) and
   against the container image (`HOST_URL` set: the host is already up).

   Not a verify suite: it needs a browser, and `npm run verify` needs none.
   verify:host pins that host.yml runs it.

   The browser: `CHROMIUM_PATH` if set, else whatever `playwright` launches
   with no options, else the runner's own Chrome through `playwright-core`. */
'use strict'
const { spawn } = require('node:child_process')
const { mkdtempSync, existsSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')

const ROOT = resolve(__dirname, '..')
const TOKEN = process.env.HOST_TOKEN || 'smoke-token-0123456789abcdef'

function loadPlaywright() {
  for (const name of ['playwright', 'playwright-core']) {
    try { return require(name) } catch { /* next */ }
  }
  throw new Error('neither playwright nor playwright-core is installed')
}

async function launch(chromium) {
  if (process.env.CHROMIUM_PATH) return chromium.launch({ executablePath: process.env.CHROMIUM_PATH })
  try { return await chromium.launch() } catch { return chromium.launch({ channel: 'chrome' }) }
}

const results = []
const ok = (id, pass, detail) => {
  results.push({ id, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id}${detail ? `  ${detail}` : ''}`)
}

async function waitFor(url, ms) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try { if ((await fetch(url)).ok) return true } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 300))
  }
  return false
}

;(async () => {
  let child = null
  let base = process.env.HOST_URL
  const log = []
  if (!base) {
    if (!existsSync(join(ROOT, 'out/host/host.cjs')) || !existsSync(join(ROOT, 'out/host-web/index.html'))) {
      console.error('out/host is missing: run `npm run build:host` first')
      process.exit(1)
    }
    const port = 8300 + Math.floor(Math.random() * 500)
    child = spawn(process.execPath, [join(ROOT, 'out/host/host.cjs')], {
      cwd: ROOT,
      // Short data path: tmux and the control socket live under it, and a unix socket path caps at ~104 bytes.
      env: { ...process.env, PORT: String(port), TC_HOST_TOKEN: TOKEN, TC_HOST_BIND: '127.0.0.1', TC_HOST_DATA: mkdtempSync(join(tmpdir(), 'tch-')), TC_TMUX_SOCKET: `tc-smoke-${port}` },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    child.stdout.on('data', (d) => log.push(String(d)))
    child.stderr.on('data', (d) => log.push(String(d)))
    base = `http://127.0.0.1:${port}`
  }

  const { chromium } = loadPlaywright()
  let browser = null
  try {
    ok('smoke.host.1 the host answers /healthz', await waitFor(`${base}/healthz`, 30000))

    const gated = await fetch(`${base}/host-info.js`)
    ok('smoke.gate.1 nothing but the sign-in page is served before signing in', gated.status === 401, `status ${gated.status}`)

    browser = await launch(chromium)
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))

    await page.goto(`${base}/`)
    await page.fill('input[name="token"]', 'not-the-token')
    await page.click('button[type="submit"]')
    ok('smoke.gate.2 a wrong token is refused', (await page.content()).includes('did not match'))
    // The wrong try backs this address off for a second.
    await page.waitForTimeout(1200)
    await page.goto(`${base}/`)
    await page.fill('input[name="token"]', TOKEN)
    await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')])

    await page.waitForSelector('#root > *', { timeout: 60000 })
    ok('smoke.mount.1 the app mounts in the tab', await page.locator('#root > *').count() > 0)
    ok('smoke.bridge.1 window.canvas is the preload\'s bridge', await page.evaluate(() => typeof window.canvas?.pty?.create === 'function' && typeof window.canvas?.home === 'string'))

    // A real shell on the host, through main's own pty:create handler.
    const transcript = await page.evaluate(async () => {
      const id = `smoke-${Date.now()}`
      let out = ''
      const off = window.canvas.pty.onData((chunk) => { if (chunk.panelId === id) out += chunk.data })
      await window.canvas.pty.create({ panelId: id, cwd: window.canvas.home, command: '/bin/sh', args: [], cols: 80, rows: 24 })
      await new Promise((r) => setTimeout(r, 800))
      await window.canvas.pty.write({ panelId: id, data: 'echo tc-host-$((40+2))\r' })
      const end = Date.now() + 10000
      while (!out.includes('tc-host-42') && Date.now() < end) await new Promise((r) => setTimeout(r, 200))
      off()
      await window.canvas.pty.kill(id)
      return out
    })
    ok('smoke.pty.1 a terminal runs on the host and its output reaches the tab', transcript.includes('tc-host-42'), JSON.stringify(transcript.slice(-120)))

    const layout = await page.evaluate(async () => {
      const state = await window.canvas.layout.load()
      return state !== null && typeof state === 'object'
    })
    ok('smoke.layout.1 layout:load answers from the host\'s store', layout)

    // A second tab takes the session over; the first says so.
    const second = await context.newPage()
    await second.goto(`${base}/`)
    await second.waitForSelector('#root > *', { timeout: 60000 })
    await page.waitForSelector('.tc-host-dialog', { timeout: 10000 }).catch(() => null)
    const told = (await page.locator('.tc-host-dialog').textContent().catch(() => '')) ?? ''
    ok('smoke.tabs.1 a newer tab takes over and the older one says so', told.includes('another tab'), told.slice(0, 80))

    ok('smoke.errors.1 no uncaught error while the page ran', errors.length === 0, errors.slice(0, 3).join(' | '))
    if (process.env.HOST_SHOT) await second.screenshot({ path: process.env.HOST_SHOT })
  } catch (error) {
    ok('smoke.run.1 the hosted page loads', false, String(error.message || error).split('\n')[0])
  } finally {
    if (browser) await browser.close()
    if (child) {
      child.kill('SIGTERM')
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  if (results.some((r) => !r.pass) && log.length > 0) console.log(`\n--- host log ---\n${log.join('').slice(-4000)}`)
  console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`)
  if (results.some((r) => !r.pass)) process.exitCode = 1
})()
