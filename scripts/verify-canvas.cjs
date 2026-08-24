/* Verifies the canvas in a real renderer.
   Run with: npm run build && npm run verify:canvas

   Runs under real Electron because the assertions are about things a unit test
   structurally cannot reach: real input events, the computed CSS transform,
   and whether Chromium page-zoomed instead of the canvas. The window is never
   shown. */
const { join } = require('node:path')
const { mkdtempSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { buildSync } = require('esbuild')
const { app, BrowserWindow } = require('electron')

// M4b: main.tsx now awaits window.canvas.layout.load() before React ever
// mounts, so a window with no ipcMain handler for it does not just fail one
// check — the renderer's boot() promise rejects, .world never renders, and
// EVERY check in this file (which all read the rendered DOM) fails for a
// reason that has nothing to do with wheel/zoom/drop-guard behaviour. This
// suite doesn't assert anything about panels or PTYs, so an unseeded store
// (first-run canvas) is enough — reusing panels-entry.cjs's bundle, the same
// wiring verify-panels.cjs and verify-window-lifecycle.cjs already use for
// this exact "nothing registers ipcMain handlers here" problem.
const ENTRY_OUT = join(__dirname, '..', 'out', 'verify', 'canvas-entry.cjs')
buildSync({
  entryPoints: [join(__dirname, 'panels-entry.cjs')],
  outfile: ENTRY_OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['node-pty', 'electron']
})
const { registerIpcHandlers, PtyManager, resolveShellEnv, createLayoutStore } = require(ENTRY_OUT)

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

// The .canvas host is not flush with the window: .app carries a top padding
// to clear the hiddenInset traffic lights, so sendInputEvent's window-space
// x/y is not the same point as the local canvas coordinates zoomAt actually
// anchors on. Read the host's real offset instead of assuming zero.
const readCanvasOffset = (wc) =>
  wc.executeJavaScript(
    `(() => { const r = document.querySelector('.canvas').getBoundingClientRect(); return { left: r.left, top: r.top } })()`
  )

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
  // Same wiring main/index.ts does at real startup, and the same reason
  // panels-entry.cjs's consumers need it: pty:create is what a first-run
  // panel triggers, and an uncached probe per concurrent create is not a
  // path the real app ever takes.
  await resolveShellEnv()
  const ptyManager = new PtyManager(() => win.webContents)
  const layoutStore = createLayoutStore({
    filePath: join(mkdtempSync(join(tmpdir(), 'tc-canvas-')), 'layout.json')
  })
  registerIpcHandlers(ptyManager, layoutStore)

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
    panned && panned.scale === before?.scale && panned.y !== before?.y,
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

  // The world point under the anchor must not move. This is the property
  // zoomAt exists to guarantee, and the one that silently walks the canvas
  // somewhere unexpected when it is wrong. Electron does not page-zoom on a
  // synthetic ctrl+wheel at all, so asserting getZoomLevel() === 0 here would
  // pass no matter what the renderer did.
  // (600, 400) is the sendInputEvent point in window coordinates; convert to
  // local canvas coordinates via the host's actual on-screen offset before
  // comparing against the CSS-transform matrices, which are already local.
  const offset = await readCanvasOffset(wc)
  const ANCHOR = { x: 600 - offset.left, y: 400 - offset.top }
  const worldBefore = {
    x: (ANCHOR.x - panned.x) / panned.scale,
    y: (ANCHOR.y - panned.y) / panned.scale
  }
  const worldAfter = {
    x: (ANCHOR.x - zoomed.x) / zoomed.scale,
    y: (ANCHOR.y - zoomed.y) / zoomed.scale
  }
  const drift = Math.max(Math.abs(worldAfter.x - worldBefore.x), Math.abs(worldAfter.y - worldBefore.y))
  ok('4 the world point under the zoom anchor does not move', drift < 0.5,
    `drift ${drift.toFixed(4)}px at world ${worldBefore.x.toFixed(1)},${worldBefore.y.toFixed(1)}`)

  // 5-6: the file-drop guard. An unhandled drop navigates the renderer to
  // file://..., and attachPtyLifecycle kills every PTY in the window when that
  // happens — so a stray drag from Finder would not "do nothing", it would take
  // down every running agent and reload the canvas empty. The browser only
  // treats a drop as a drop target at all if dragover was also cancelled, so
  // both halves are asserted; cancelling only `drop` leaves the navigation in
  // place. Reading `defaultPrevented` on a dispatched event is what makes this
  // falsifiable: remove either preventDefault and the matching check goes red.
  const dropGuard = await wc.executeJavaScript(`(() => {
    const fire = (type) => {
      const e = new DragEvent(type, { bubbles: true, cancelable: true })
      document.body.dispatchEvent(e)
      return e.defaultPrevented
    }
    return { dragover: fire('dragover'), drop: fire('drop') }
  })()`)
  ok('5 a dragover over the app is cancelled', dropGuard.dragover === true,
    `defaultPrevented=${dropGuard.dragover}`)
  ok('6 a file drop is cancelled before it can navigate the renderer', dropGuard.drop === true,
    `defaultPrevented=${dropGuard.drop}`)

  console.log('\n' + '='.repeat(60))
  const failed = results.filter((r) => !r.pass)
  console.log(`${results.length - failed.length}/${results.length} passed`)
  if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
  app.exit(failed.length ? 1 : 0)
})
