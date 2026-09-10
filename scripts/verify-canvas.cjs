/* Verifies the canvas in a real renderer.
   Run with: npm run build && npm run verify:canvas

   Runs under real Electron because the assertions are about things a unit test
   structurally cannot reach: real input events, the computed CSS transform,
   and whether Chromium page-zoomed instead of the canvas. The window is never
   shown. */
const { join } = require('node:path')
const { loadRenderer } = require('./load-renderer.cjs')
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
  external: ['node-pty', 'electron'],
  // The same two aliases electron.vite.config.ts, every plain-node verify
  // bundle, and (since M16) verify-panels.cjs's own copy of this exact
  // panels-entry.cjs build already carry. This bundle got away without them
  // for the identical reason verify-panels.cjs did until M16: every
  // cross-boundary import main/* made from @shared was an `import type`,
  // erased before bundling, so nothing was ever actually resolved.
  // main/file-read.ts now imports real VALUES from @shared/file-panel
  // (FILE_MAX_BYTES and its siblings), and this build fails outright without
  // the alias — buildSync throws HERE, at module scope, before any window or
  // even this harness's own setup code exists, so there is nothing to "wait"
  // on; the failure still reads as a hang rather than a red suite, but that
  // is Electron's own handling of an uncaught main-process exception, not a
  // harness waiting on anything. See CLAUDE.md's entry on verify-panels.cjs's
  // own version of this fix for the full story.
  alias: {
    '@shared': join(__dirname, '..', 'src', 'shared'),
    '@renderer': join(__dirname, '..', 'src', 'renderer')
  }
})
const { registerIpcHandlers, PtyManager, createDirectBackend, resolveShellEnv, createLayoutStore } =
  require(ENTRY_OUT)

const { ok, results } = require('./lib/checks.cjs').createChecks()
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

const SCRIPT_NAME = 'verify-canvas.cjs'

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
  const ptyManager = new PtyManager(() => win.webContents, () => createDirectBackend('verify: direct'))
  const layoutStore = createLayoutStore({
    filePath: join(mkdtempSync(join(tmpdir(), 'tc-canvas-')), 'layout.json')
  })
  // ipcMain.handle's return value crosses IPC via structured clone, so this
  // must be a plain { kind, reason } object, not the SessionBackend itself —
  // that carries a spawn() function, which structured clone cannot carry.
  // No check in this suite drives a preset mutation from IPC, so a stub that
  // is never called is enough — what matters here is that registration still
  // succeeds with every argument in place. ALL of them are passed, including
  // rebuildMenu and reviewEngine, for the reason verify-ipc-surface.cjs was
  // already patched: neither closure runs here today, but a handler that
  // reaches into one at REGISTRATION time would throw on undefined, and a
  // short-arity call is a trap for whoever adds one.
  registerIpcHandlers(
    ptyManager,
    layoutStore,
    () => {
      const b = createDirectBackend('verify: direct')
      return { kind: b.kind, reason: b.reason }
    },
    {
      list: () => [],
      rename: () => false,
      remove: () => false,
      setDefault: () => {},
      spawn: () => {},
      requestReset: () => {},
      listPrompts: () => [],
      savePrompt: () => {},
      removePrompt: () => false
    },
    () => {},
    {
      resolveRepo: async () => null,
      captureBaseline: async () => null,
      review: async () => ({ kind: 'not-a-repo' })
    },
    { read: () => ({ kind: 'no-cwd' }), size: () => 0, clear: () => {} },
    join(tmpdir(), 'tc-verify-canvas-diagnostics')
  )

  await loadRenderer(win)
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

  // M248 — deck.pdf.1. The REAL renderer main uses: a hidden, sandboxed,
  // script-less BrowserWindow prints a 4-slide deck (front matter, a fenced
  // `---`, an image that is not there). Four slides must be four PAGES —
  // counted as `/Type /Page` objects, never `/Pages` (the tree node) — which
  // is the observable a wrong @page size or a stray break-after on the last
  // slide changes (a fifth blank page) and verify:deck's fake render cannot.
  {
    const { mkdtempSync: mk, writeFileSync: wf, readFileSync: rf, rmSync: rm } = require('node:fs')
    const PDF_OUT = join(__dirname, '..', 'out', 'verify', 'deck-pdf.cjs')
    buildSync({ entryPoints: [join(__dirname, '..', 'src', 'main', 'deck-pdf.ts')], outfile: PDF_OUT, bundle: true, platform: 'node', format: 'cjs', external: ['electron'] })
    const { createDeckPdf, createPdfRenderer } = require(PDF_OUT)
    const dir = mk(join(tmpdir(), 'tc deck '))
    const deck = '---\nmarp: true\n---\n# One\n\n```md\n---\n```\n\n---\n## Two\n\n![gone](gone.png)\n\n---\n## Three\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n---\n## Four\n<!-- notes not on the page -->\n'
    wf(join(dir, 'talk.md'), deck)
    const out = join(dir, 'talk.pdf')
    let result
    try {
      result = await createDeckPdf({
        readText: async (p) => ({ kind: 'text', content: rf(p, 'utf8'), bytes: deck.length, lines: 1, truncatedLines: 0, mtimeMs: 1 }),
        readImage: () => ({ kind: 'missing' }),
        render: createPdfRenderer(BrowserWindow, dir),
        askPath: async () => out
      })({ path: join(dir, 'talk.md') })
    } catch (error) { result = { kind: 'threw', reason: String(error) } }
    let pages = -1, head = ''
    try { const bytes = rf(out); head = bytes.subarray(0, 5).toString('latin1'); pages = (bytes.toString('latin1').match(/\/Type\s*\/Page(?!s)\b/g) || []).length } catch {}
    ok('deck.pdf.1 a 4-slide deck prints to a 4-page PDF through the real hidden, sandboxed, script-less window',
      result?.kind === 'written' && result.pages === 4 && head === '%PDF-' && pages === 4, JSON.stringify({ result, pages, head }))
    rm(dir, { recursive: true, force: true })
  }

  console.log('\n' + '='.repeat(60))
  const failed = results.filter((r) => !r.pass)
  console.log(`${results.length - failed.length}/${results.length} passed`)
  if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
  app.exit(failed.length ? 1 : 0)
}).catch((error) => {
  // A THROW IN A REAL-ELECTRON HARNESS HANGS WITHOUT THIS. `app.whenReady()
  // .then(async () => ...)` with no catch turns any throw into an unhandled
  // rejection: nothing calls app.exit, the hidden window stays open, and the
  // suite reads as a suite that is still running. CLAUDE.md names that shape
  // directly — "the trap manifests as a HANG, not a red suite" — and a chain
  // of ~40 suites that stops dead with no message is the most expensive
  // failure this harness can produce, because it does not even say which
  // suite stopped. Print the error, name the script, exit non-zero.
  console.log(`\n${SCRIPT_NAME} threw before it could report: ${(error && error.stack) || error}`)
  app.exit(1)
})
