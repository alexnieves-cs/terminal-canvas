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
  loader: { '.css': 'text' },
  // M112 (review round 2). serialize.1/.2 now import the REAL
  // session-factory.ts (not a hand-built Terminal), which reaches
  // `@shared/link-scan` and `@shared/types` — the same alias
  // electron.vite.config.ts and every other plain-node/esbuild verify
  // bundle already carries (see verify-panels.cjs's own comment on this:
  // an unresolved alias fails buildSync itself, at module scope, before
  // this harness's window even exists — that reads as a HANG, not a red
  // suite, which is why this is called out here explicitly).
  alias: {
    '@shared': join(__dirname, '..', 'src', 'shared'),
    '@renderer': join(__dirname, '..', 'src', 'renderer')
  }
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

  // unicode.1. The width table is Unicode 11, in the terminal createTerminal
  //     actually builds. Under the built-in Unicode 6 table every emoji
  //     status glyph and post-6 box character an agent TUI draws is one
  //     column narrower than the shell believes, so the frame drifts one
  //     column per wide glyph and compounds down the pane — a defect that
  //     reads as the TUI's own fault (backlog #43). The cursor column after
  //     one grinning face is the discriminating clause: 2 under v11, 1 under
  //     v6. activeVersion alone would pass against an addon that was loaded
  //     and never activated.
  ok('unicode.1 createTerminal measures widths against Unicode 11 — a wide glyph is two cells',
    probe.unicode && probe.unicode.activeVersion === '11' && probe.unicode.cursorX === 2,
    JSON.stringify(probe.unicode))

  // serialize.1 (M112). The REAL SessionHandle.serialize() — built off
  // the buffer's own `isWrapped`, not `@xterm/addon-serialize` (tried and
  // dropped; see session-factory.ts's comment above `serialize()`) — must
  // answer the same rows before eviction, while detached, and after
  // re-attach. Eviction only drops the WebGL context and the host node;
  // the Terminal and its buffer survive, so the answer must not change.
  const s = probe.serialize || {}
  const has = (t) => typeof t === 'string' && t.includes('SER-ONE') && t.includes('SER-TWO')
  // M112 (review round 1, minor 7). "answers the same rows" was checking
  // only that both sentinels appear in each of the three strings SEPARATELY
  // — three independently-truthy checks, never compared to each other. A
  // detach that scrambled row order, dropped an unrelated row or otherwise
  // changed the text without losing either literal sentinel would still
  // have passed. Compare the three strings directly.
  ok('serialize.1 SessionHandle.serialize() answers the same rows attached, detached and re-attached',
    !s.error && has(s.attached) && has(s.detached) && has(s.reattached) &&
      s.attached === s.detached && s.detached === s.reattached,
    JSON.stringify({ error: s.error, equal: s.attached === s.detached && s.detached === s.reattached, lens: [s.attached?.length, s.detached?.length, s.reattached?.length] }))

  // serialize.2 (M112, review round 2, CRITICAL 1). The actual proof that
  // `isWrapped` does what CRITICAL 1's fix depends on: a single 400-
  // character run, written with NO `\r\n` of its own, forced to wrap
  // across several real rows by a narrow host. If `isWrapped` join were
  // wrong (the exact failure mode that made a wrap read as a hard
  // newline), the run would come back split by a `\r\n` and this would
  // fail — this is the one check in the suite that a regression back to
  // "wraps sometimes turn into real breaks" cannot pass.
  const sw = probe.serializeWrap || {}
  // M143 — card.rows.1. See the probe's comment: rows as rows, blanks kept, the same detached.
  {
    const c = probe.cardRows || {}
    const rows = Array.isArray(c.attached) ? c.attached : []
    const blankInside = rows.length >= 5 && rows.indexOf('') > 0 && rows.indexOf('') < rows.length - 1
    ok('card.rows.1 tail(n) answers the buffer rows as rows — the interior blank row of a box KEPT between its lines, only trailing blanks trimmed — and the same rows detached',
      !c.error && blankInside && rows[0] === '+----+' && rows[rows.length - 1] === '+----+' && rows.join('\n') === (Array.isArray(c.detached) ? c.detached.join('\n') : null),
      JSON.stringify(c))
  }

  ok('serialize.2 a single run long enough to wrap across several real terminal rows comes back as ONE unbroken line — isWrapped correctly joined every continuation',
    !sw.error && sw.containsWholeRun === true,
    JSON.stringify({ error: sw.error, containsWholeRun: sw.containsWholeRun, cols: sw.cols, len: sw.len }))

  console.log('\n' + '='.repeat(60))
  const failed = results.filter((r) => !r.pass)
  console.log(`${results.length - failed.length}/${results.length} passed`)
  if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
  app.exit(failed.length ? 1 : 0)
})
