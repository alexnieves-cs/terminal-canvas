/* Verifies the assumption the whole M3 eviction design rests on: that an xterm
   Terminal keeps accepting writes while its host div is out of the document,
   and renders correctly once the host is put back.
   Run with: npm run verify:xterm

   If this fails, do not proceed with Task 3 — the spec's eviction model needs
   rethinking, not a workaround. */
const { buildSync } = require('esbuild')
const { join } = require('node:path')
const { writeFileSync, mkdirSync } = require('node:fs')
const { app, BrowserWindow } = require('electron')

const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const OUT_DIR = join(__dirname, '..', 'out', 'verify')
mkdirSync(OUT_DIR, { recursive: true })

buildSync({
  entryPoints: [join(__dirname, 'xterm-detach-entry.js')],
  outfile: join(OUT_DIR, 'xterm-detach.js'),
  bundle: true,
  platform: 'browser',
  format: 'iife',
  loader: { '.css': 'text' }
})

// No CSP here on purpose: this is a probe page, not the app.
writeFileSync(
  join(OUT_DIR, 'xterm-detach.html'),
  '<!doctype html><html><body><script src="xterm-detach.js"></script></body></html>'
)

app.on('window-all-closed', () => {})

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1200, height: 800 })
  await win.loadFile(join(OUT_DIR, 'xterm-detach.html')).catch(() => {})
  await sleep(2000)

  const probe = await win.webContents.executeJavaScript('window.__probe')

  ok('1 writing to a detached terminal does not throw',
    probe.detachedWriteThrew === false,
    String(probe.detachedWriteThrew))

  ok('2 output written while detached reaches the buffer',
    probe.bufferWhileDetached.includes('WHILE-DETACHED'),
    JSON.stringify(probe.bufferWhileDetached))

  ok('3 scrollback from before eviction survives re-attachment',
    probe.bufferAfterReattach.includes('BEFORE-DETACH') &&
      probe.bufferAfterReattach.includes('WHILE-DETACHED'),
    JSON.stringify(probe.bufferAfterReattach))

  // The WebGL Terminal's own DOM text is not usable evidence either way:
  // `.xterm-rows` is empty even while attached and healthy under WebGL (see
  // probe.domTextWhileAttached, reported below), so it can't distinguish a
  // real repaint failure from "this surface was never populated." And a
  // WebGL canvas readback would need `preserveDrawingBuffer`, which the
  // addon does not expose, so it would be blank-or-flaky rather than
  // trustworthy. The control Terminal (identical lifecycle, no WebglAddon)
  // uses xterm's DOM renderer, which does paint `.xterm-rows`, so it is the
  // surface that can actually prove or disprove repaint-after-reattach.
  const controlBaseline = probe.control && probe.control.domTextWhileAttached
  const controlAfter = probe.control && probe.control.domTextAfterReattach
  const controlDetail =
    `control attached baseline: ${JSON.stringify(controlBaseline)} / ` +
    `control after reattach: ${JSON.stringify(controlAfter)} / ` +
    `webgl canvas while attached: ${JSON.stringify(probe.canvasesWhileAttached)} / ` +
    `webgl canvas after reattach: ${JSON.stringify(probe.canvasesAfterReattach)}`

  ok('4 a DOM-rendered control terminal repaints its buffer to the DOM after reattach',
    // Guard against a vacuous pass: an empty/undefined baseline means DOM
    // text isn't a valid signal even without WebGL, so the control itself
    // is inconclusive — that must fail this check, not pass it.
    !!controlBaseline && controlBaseline.includes('BEFORE-DETACH') &&
      !!controlAfter && controlAfter.includes('BEFORE-DETACH') && controlAfter.includes('WHILE-DETACHED'),
    controlDetail)

  ok('5 a fresh WebGL addon loads on the same Terminal',
    probe.webglReloaded === true,
    String(probe.webglReloaded))

  // Honest, narrow claim only: a WebGL canvas of the expected (non-zero,
  // host-matching) size exists after reattach. This does NOT prove the
  // canvas paints correct pixels — the addon sets canvas width/height from
  // host layout at loadAddon() time regardless of whether anything is ever
  // drawn into it, so this cannot substitute for check 4's repaint proof.
  ok('6 a WebGL canvas of the expected size exists on the terminal after reattach',
    probe.canvasesAfterReattach.count >= 1 &&
      probe.canvasesAfterReattach.width > 0 &&
      probe.canvasesAfterReattach.height > 0,
    `while attached: ${JSON.stringify(probe.canvasesWhileAttached)} / after reattach: ${JSON.stringify(probe.canvasesAfterReattach)}`)

  console.log('\n' + '='.repeat(60))
  const failed = results.filter((r) => !r.pass)
  console.log(`${results.length - failed.length}/${results.length} passed`)
  if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
  app.exit(failed.length ? 1 : 0)
})
