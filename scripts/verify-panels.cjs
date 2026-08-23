/* Verifies terminals on the canvas in a real renderer.
   Run with: npm run build && npm run verify:panels

   Check 2 is the reason this file exists: culling must not kill a PTY. That
   failure is silent in a running app — the panel returns looking like a fresh
   terminal — so it has to be caught mechanically. pty:list makes it possible. */
const { buildSync } = require('esbuild')
const { join } = require('node:path')
const { app, BrowserWindow } = require('electron')

// This script is its own Electron entry point (not out/main/index.js), so
// nothing has registered ipcMain handlers for the pty:* channels the built
// renderer calls. Bundle and wire up the same pieces main/index.ts wires up
// at real startup, mirroring the pattern verify-ipc-surface.cjs and
// verify-window-lifecycle.cjs already use for this exact problem.
const ENTRY_OUT = join(__dirname, '..', 'out', 'verify', 'panels-entry.cjs')
buildSync({
  entryPoints: [join(__dirname, 'panels-entry.cjs')],
  outfile: ENTRY_OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['node-pty', 'electron']
})
const { registerIpcHandlers, PtyManager } = require(ENTRY_OUT)

const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const liveCount = (wc) =>
  wc.executeJavaScript(`document.querySelectorAll('.panel__slot .xterm').length`)
const cardCount = (wc) =>
  wc.executeJavaScript(`document.querySelectorAll('.panel__card').length`)
const sessionCount = (wc) =>
  wc.executeJavaScript(`window.canvas.pty.list().then((s) => s.length)`)
const zoomTo = (wc, key) =>
  wc.executeJavaScript(
    `window.dispatchEvent(new KeyboardEvent('keydown', { key: '${key}', metaKey: true })), true`
  )

app.on('window-all-closed', () => {})

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1400,
    height: 900,
    webPreferences: {
      preload: join(__dirname, '..', 'out', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  // Same wiring main/index.ts does at real startup: a PtyManager that reaches
  // this window's webContents, registered against the pty:* channels the
  // renderer's window.canvas.pty bridge calls.
  const ptyManager = new PtyManager(() => win.webContents)
  registerIpcHandlers(ptyManager)

  await win.loadFile(join(__dirname, '..', 'out', 'renderer', 'index.html')).catch(() => {})
  const wc = win.webContents
  await sleep(3000) // shells must actually spawn

  const live = await liveCount(wc)
  const sessions = await sessionCount(wc)
  ok('1 on-screen panels are live terminals with off-screen panels carded',
    live > 0 && (await cardCount(wc)) > 0, `live=${live} cards=${await cardCount(wc)}`)

  ok('2 live panels never exceed the context budget', live <= 8, `live=${live}`)

  // Cmd+1 fits every panel on screen, which drops scale far below
  // LIVE_MIN_SCALE and must demote everything unfocused.
  await zoomTo(wc, '1')
  await sleep(1200) // longer than DEMOTE_DELAY_MS
  const liveAfterZoomOut = await liveCount(wc)
  const sessionsAfterZoomOut = await sessionCount(wc)

  ok('3 zooming out demotes panels to cards',
    liveAfterZoomOut < live, `live ${live} -> ${liveAfterZoomOut}`)

  ok('4 demotion does not kill a single PTY',
    sessionsAfterZoomOut === sessions && sessions > 0,
    `sessions ${sessions} -> ${sessionsAfterZoomOut}`)

  // Cmd+0 back to 100%: the same sessions must come back, not new ones.
  await zoomTo(wc, '0')
  await sleep(1200)
  ok('5 promotion reuses the existing sessions rather than spawning new ones',
    (await sessionCount(wc)) === sessions && (await liveCount(wc)) > 0,
    `sessions=${await sessionCount(wc)} live=${await liveCount(wc)}`)

  // The interaction gate. At 100% a body click focuses xterm's textarea; at
  // 70% the same click must not, because xterm would resolve it to the wrong
  // cell. Read activeElement rather than guessing from the click coordinates.
  const clickPanelBody = async () => {
    const box = await wc.executeJavaScript(
      `(() => { const s = document.querySelector('.panel__slot');
                if (!s) return null;
                const r = s.getBoundingClientRect();
                return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } })()`
    )
    if (!box) return null
    wc.sendInputEvent({ type: 'mouseDown', x: box.x, y: box.y, button: 'left', clickCount: 1 })
    wc.sendInputEvent({ type: 'mouseUp', x: box.x, y: box.y, button: 'left', clickCount: 1 })
    await sleep(400)
    return wc.executeJavaScript(
      `(document.activeElement && document.activeElement.className) || ''`
    )
  }

  const activeAt100 = await clickPanelBody()
  // Two Cmd+- steps from 1.0 land at ~0.69, below INTERACT_MIN_SCALE.
  await zoomTo(wc, '-')
  await zoomTo(wc, '-')
  await sleep(600)
  const activeAtZoomedOut = await clickPanelBody()

  ok('6 body clicks reach xterm at 1:1 but are gated when zoomed out',
    String(activeAt100).includes('xterm-helper-textarea') &&
      !String(activeAtZoomedOut).includes('xterm-helper-textarea'),
    `at 100%: "${activeAt100}" / zoomed out: "${activeAtZoomedOut}"`)

  console.log('\n' + '='.repeat(60))
  const failed = results.filter((r) => !r.pass)
  console.log(`${results.length - failed.length}/${results.length} passed`)
  if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
  ptyManager.killAll() // the seed panels' shells would otherwise outlive this process
  await sleep(300) // let node-pty's native teardown land before app.exit() tears down the process
  app.exit(failed.length ? 1 : 0)
})
