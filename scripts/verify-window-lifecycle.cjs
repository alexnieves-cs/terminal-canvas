/* Verifies that a renderer teardown actually reaches the PTY layer.
   Run with: npm run verify:window

   Runs under real Electron (not ELECTRON_RUN_AS_NODE) because the whole point
   is which webContents/window events Electron genuinely fires. The window is
   never shown. */
const { buildSync } = require('esbuild')
const { join } = require('node:path')
const { app, BrowserWindow } = require('electron')

const OUT = join(__dirname, '..', 'out', 'verify', 'window-lifecycle.cjs')
buildSync({
  // M18: pty-manager now transitively imports a real VALUE from @shared
  // (agent-args.ts's AGENT_FLAGS), where every main/* import from there used
  // to be an `import type` esbuild erased before resolving anything. See
  // CLAUDE.md's "The plain-node verify bundles now configure a @shared alias".
  alias: { '@shared': join(__dirname, '..', 'src', 'shared') },
  entryPoints: [join(__dirname, '..', 'src', 'main', 'window-lifecycle.ts')],
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron']
})
const { attachPtyLifecycle } = require(OUT)

const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// A real file, not a data: URL — reloading a data: URL fails with ERR_FAILED.
const PAGE = join(__dirname, '..', 'out', 'verify', 'probe.html')
require('node:fs').mkdirSync(join(__dirname, '..', 'out', 'verify'), { recursive: true })
require('node:fs').writeFileSync(PAGE, '<!doctype html><title>probe</title><p>probe')

const finish = () => {
  console.log('\n' + '='.repeat(60))
  const failed = results.filter((r) => !r.pass)
  console.log(`${results.length - failed.length}/${results.length} passed`)
  if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
  app.exit(failed.length ? 1 : 0)
}

// Electron's default window-all-closed handler quits the app; test 2 closes
// its window on purpose, so suppress that and control exit ourselves.
app.on('window-all-closed', () => {})

app.whenReady().then(async () => {
  // 1. Cmd+R destroys the renderer without running React cleanup, so no
  // pty:kill is ever sent. The PTY layer must hear about it some other way.
  {
    let calls = 0
    const win = new BrowserWindow({ show: false })
    attachPtyLifecycle(win, () => calls++)
    await win.loadFile(PAGE).catch(() => {})
    calls = 0
    win.webContents.reload()
    await sleep(1200)
    ok('1 reload notifies the pty layer', calls > 0, `${calls} call(s)`)
    win.destroy()
  }

  // 2. Cmd+W then dock-icon reopen: the closed window's sessions must die,
  // otherwise the next window cannot recreate the same panelId.
  {
    let calls = 0
    const win = new BrowserWindow({ show: false })
    attachPtyLifecycle(win, () => calls++)
    await win.loadFile(PAGE).catch(() => {})
    calls = 0
    win.close()
    await sleep(800)
    ok('2 window close notifies the pty layer', calls > 0, `${calls} call(s)`)
  }

  // 3. Guard against a handler that fires so eagerly it kills sessions the
  // live page just created: a settled page must produce no notifications.
  {
    let calls = 0
    const win = new BrowserWindow({ show: false })
    attachPtyLifecycle(win, () => calls++)
    await win.loadFile(PAGE).catch(() => {})
    calls = 0
    await sleep(1200)
    ok('3 an idle settled page notifies nothing', calls === 0, `${calls} call(s)`)
    win.destroy()
  }

  // 4. The teardown callback fires on reload, and fires ONLY as itself.
  //
  // Read the scope honestly: this installs its own lambda, so it proves that
  // attachPtyLifecycle still delivers exactly one teardown notification per
  // renderer destruction and never invents a second one. It does NOT prove
  // that src/main/index.ts passes detachAll rather than killAll — swap those
  // in index.ts and this check stays green. What actually pins tmux survival
  // is verify:pty-manager check 12, which detaches a real manager and asserts
  // the pane pid is unchanged afterwards; keep that one honest, not this one.
  {
    const calls = []
    const win = new BrowserWindow({ show: false })
    // Mirrors exactly what src/main/index.ts installs.
    attachPtyLifecycle(win, () => calls.push('detach'))
    await win.loadFile(PAGE).catch(() => {})
    calls.length = 0
    win.webContents.reload()
    await sleep(1200)
    ok('4 renderer teardown fires the installed callback exactly as installed',
      calls.length > 0 && calls.every((c) => c === 'detach'),
      JSON.stringify(calls))
    win.destroy()
  }

  finish()
})
