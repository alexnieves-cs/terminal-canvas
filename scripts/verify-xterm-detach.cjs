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

  ok('4 the re-attached host renders its buffer to the DOM',
    probe.domTextAfterReattach.includes('BEFORE-DETACH'),
    JSON.stringify(probe.domTextAfterReattach.slice(0, 80)))

  ok('5 a fresh WebGL addon loads on the same Terminal',
    probe.webglReloaded === true,
    String(probe.webglReloaded))

  console.log('\n' + '='.repeat(60))
  const failed = results.filter((r) => !r.pass)
  console.log(`${results.length - failed.length}/${results.length} passed`)
  if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
  app.exit(failed.length ? 1 : 0)
})
