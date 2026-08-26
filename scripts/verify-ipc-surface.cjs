/* Verifies that the IPC contract and the registered handlers agree.
   Run with: npm run verify:ipc

   src/shared/ipc-contract.ts claims to be the single source of truth. The
   compiler enforces that for preload (CanvasBridge), but nothing enforces it
   for main: a channel can be added to IPC and never handled, and the only
   symptom is a renderer promise that rejects at runtime. */
const { buildSync } = require('esbuild')
const { join } = require('node:path')
const { app, ipcMain } = require('electron')

const OUT = join(__dirname, '..', 'out', 'verify', 'ipc-surface.cjs')
buildSync({
  entryPoints: [join(__dirname, 'ipc-surface-entry.cjs')],
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['node-pty', 'electron']
})
const { IPC, registerIpcHandlers } = require(OUT)

const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`)
}

/**
 * ipcMain has no public "is this channel handled" query, but handle() throws
 * on a second registration for the same channel. That throw IS the assertion.
 */
function isHandled(channel) {
  try {
    ipcMain.handle(channel, () => {})
    ipcMain.removeHandler(channel)
    return false
  } catch {
    return true
  }
}

app.on('window-all-closed', () => {})

app.whenReady().then(() => {
  const stub = {
    create: async () => ({}),
    write: () => true,
    resize: () => {},
    kill: () => {},
    list: () => [],
    killAll: () => {}
  }
  // Minimal LayoutStore shape — this suite only needs the handlers to
  // register, not real persistence behaviour (that's verify:layout's job).
  const layoutStoreStub = {
    load: () => {},
    initial: () => ({ panels: [], camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null }),
    save: () => {},
    settings: () => ({ layout: true, camera: true, focus: true }),
    setSetting: () => {},
    reset: () => {},
    flushSync: () => {},
    renamePreset: () => false,
    deletePreset: () => false,
    setDefaultPreset: () => {},
    prompts: () => [],
    addPrompt: () => {},
    deletePrompt: () => false
  }
  const presetsStub = {
    list: () => [],
    rename: () => false,
    remove: () => false,
    setDefault: () => {},
    spawn: () => {},
    requestReset: () => {},
    listPrompts: () => [],
    savePrompt: () => {},
    removePrompt: () => false
  }
  registerIpcHandlers(
    stub,
    layoutStoreStub,
    () => ({ kind: 'direct', reason: 'verify: direct', hasSession: () => false }),
    presetsStub
  )

  const channels = Object.values(IPC)
  const missing = channels.filter((c) => !isHandled(c))
  ok(
    `1 every contract channel has a main-process handler (${channels.length} channels)`,
    missing.length === 0,
    missing.length ? `unhandled: ${missing.join(', ')}` : channels.join(', ')
  )

  console.log('\n' + '='.repeat(60))
  const failed = results.filter((r) => !r.pass)
  console.log(`${results.length - failed.length}/${results.length} passed`)
  if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
  app.exit(failed.length ? 1 : 0)
})
