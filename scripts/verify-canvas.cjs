/* Verifies the canvas in a real renderer.
   Run with: npm run build && npm run verify:canvas

   Runs under real Electron because the assertions are about things a unit test
   structurally cannot reach: real input events, the computed CSS transform,
   and whether Chromium page-zoomed instead of the canvas. The window is never
   shown. */
const { join } = require('node:path')
const { app, BrowserWindow } = require('electron')

const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** The 6 numbers of a CSS matrix(): [a, b, c, d, e, f] = scale/skew/translate. */
const parseMatrix = (value) => {
  const m = /matrix\(([^)]+)\)/.exec(value || '')
  if (!m) return null
  const parts = m[1].split(',').map((n) => parseFloat(n.trim()))
  return { scale: parts[0], x: parts[4], y: parts[5] }
}

const readTransform = (wc) =>
  wc.executeJavaScript(
    `getComputedStyle(document.querySelector('.world')).transform`
  ).then(parseMatrix)

app.on('window-all-closed', () => {})

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '..', 'out', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  await win.loadFile(join(__dirname, '..', 'out', 'renderer', 'index.html')).catch(() => {})
  await sleep(800)

  const wc = win.webContents
  const before = await readTransform(wc)
  ok('1 the world layer renders with a transform', before !== null, JSON.stringify(before))

  // A two-finger scroll: no modifiers. Must translate, must not scale.
  wc.sendInputEvent({ type: 'mouseWheel', x: 600, y: 400, deltaX: 0, deltaY: -120, canScroll: true })
  await sleep(400)
  const panned = await readTransform(wc)
  ok('2 a bare wheel pans without scaling',
    panned && panned.scale === before.scale && panned.y !== before.y,
    `scale ${before?.scale} -> ${panned?.scale}, y ${before?.y} -> ${panned?.y}`)

  // A pinch: ctrl held. Must scale the canvas, and must NOT page-zoom.
  //
  // deltaY is POSITIVE here on purpose. sendInputEvent inverts the sign:
  // sending +120 makes the renderer's WheelEvent report deltaY -120, which the
  // exponential zoom turns into a zoom IN. Verified empirically against this
  // Electron build — sending -120 zooms out and would fail the assertion below.
  wc.sendInputEvent({
    type: 'mouseWheel', x: 600, y: 400, deltaX: 0, deltaY: 120,
    modifiers: ['control'], canScroll: true
  })
  await sleep(400)
  const zoomed = await readTransform(wc)
  ok('3 a ctrl wheel zooms the canvas',
    zoomed && zoomed.scale > panned.scale,
    `scale ${panned?.scale} -> ${zoomed?.scale}`)

  // webContents exposes the page zoom directly in main; no need to reach for
  // renderer-side webFrame through executeJavaScript, which contextIsolation
  // would block anyway.
  const pageZoom = wc.getZoomLevel()
  ok('4 Chromium page zoom is untouched by the pinch', pageZoom === 0, `zoomLevel ${pageZoom}`)

  console.log('\n' + '='.repeat(60))
  const failed = results.filter((r) => !r.pass)
  console.log(`${results.length - failed.length}/${results.length} passed`)
  if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
  app.exit(failed.length ? 1 : 0)
})
