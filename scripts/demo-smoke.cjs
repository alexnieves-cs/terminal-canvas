/* Run with: npm run build:web && node scripts/demo-smoke.cjs
   Lane N (M568). The browser demo in a real browser, run by pages.yml before
   each deploy. Not a verify suite: it needs a browser and a built
   `out/web`, and `npm run verify` needs neither (bold.md: nothing in verify
   calls a browser). verify:demo pins that pages.yml runs it.

   What it proves is the one failure a build cannot see: a fake-bridge door
   that throws while the canvas boots leaves #root empty, with a green build
   and nothing in any log a deploy would read.

   The browser: `CHROMIUM_PATH` if set, else whatever `playwright` launches
   with no options (a dev machine with its browsers installed), else the
   runner's own Chrome through `playwright-core` (pages.yml installs it
   with --no-save, so package.json and the lock stay as they are). */
'use strict'
const { createServer } = require('node:http')
const { readFile } = require('node:fs/promises')
const { existsSync } = require('node:fs')
const { join, extname, resolve, normalize } = require('node:path')

const ROOT = resolve(__dirname, '..', 'out/web')
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.png': 'image/png', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm' }

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

;(async () => {
  if (!existsSync(join(ROOT, 'index.html'))) {
    console.error('out/web/index.html is missing: run `npm run build:web` first')
    process.exit(1)
  }
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '')
    const file = join(ROOT, path.endsWith('/') ? `${path}index.html` : path)
    try {
      const body = await readFile(file)
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
      res.end(body)
    } catch {
      res.writeHead(404)
      res.end()
    }
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const url = `http://127.0.0.1:${server.address().port}/`

  const { chromium } = loadPlaywright()
  const browser = await launch(chromium)
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  try {
    await page.goto(`${url}?tc-splash=off`)
    await page.waitForSelector('.xterm-screen', { timeout: 30000 })
    // Long enough for every script to leave the cast's opening frame.
    await page.waitForTimeout(12000)

    const terminals = await page.locator('.xterm-screen').count()
    ok('smoke.mount.1 the canvas mounts with terminals on it', terminals > 0, `${terminals} terminals`)
    // xterm draws to a canvas, so the text comes from the bridge's own record.
    const joined = await page.evaluate(() => ['claude-ledger', 'codex-ledger'].map((id) => window.tcDemo.transcript(id)).join('\n'))
    ok('smoke.recording.1 a terminal plays its recording', joined.includes('Claude Code') || joined.includes('OpenAI Codex'), joined.slice(0, 160).replace(/\s+/g, ' '))
    ok('smoke.world.1 the scripted agents reach a terminal past the opening frame', /[●⎿]/.test(joined))
    ok('smoke.strip.1 the demo strip names what this page is', (await page.locator('.tc-demo-strip').textContent() ?? '').includes('Live demo'))

    // Nothing the visitor did yet, so no door may have said "in the app":
    // a notice here means a door the canvas calls on its own is classed a write.
    const early = await page.locator('.tc-demo-notice.is-shown').count()
    ok('smoke.doors.0 no "in the app" notice before the visitor does anything', early === 0, early === 0 ? '' : await page.locator('.tc-demo-notice').textContent())

    // The surfaces a visitor reaches first, so smoke.errors.1 covers their
    // reads too: the find box (scrollback.search) and the Sessions tab
    // (scrollback.tail).
    await page.getByText('Find or run anything').first().click()
    await page.keyboard.type('ledger')
    await page.waitForTimeout(800)
    await page.keyboard.press('Escape')
    await page.getByText('Sessions', { exact: true }).first().click()
    await page.waitForTimeout(800)
    await page.getByText('Canvas', { exact: true }).first().click()
    await page.waitForTimeout(500)

    await page.locator('.xterm-screen').first().click()
    await page.keyboard.type('ls')
    await page.waitForTimeout(400)
    const notice = (await page.locator('.tc-demo-notice').textContent()) ?? ''
    ok('smoke.doors.1 typing into a terminal says it runs in the app', notice.includes('runs in the app'), notice)

    ok('smoke.errors.1 no uncaught error while the demo ran', errors.length === 0, errors.slice(0, 3).join(' | '))
    if (process.env.DEMO_SHOT) await page.screenshot({ path: process.env.DEMO_SHOT })
  } catch (error) {
    ok('smoke.run.1 the demo loads', false, error.message.split('\n')[0])
  } finally {
    await browser.close()
    server.close()
  }
  console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`)
  if (results.some((r) => !r.pass)) process.exitCode = 1
})()
