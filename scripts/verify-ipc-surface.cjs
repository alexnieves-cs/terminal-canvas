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
    acknowledge: () => {},
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
  // Never invoked here — this suite only asserts every channel is REGISTERED,
  // never drives review:panel — but registerIpcHandlers' body reaches into it
  // to build the handler closure, so it has to be a real object rather than
  // undefined.
  const reviewEngineStub = {
    resolveRepo: async () => null,
    captureBaseline: async () => null,
    review: async () => ({ kind: 'not-a-repo' }),
    reviewAt: async () => ({ kind: 'not-a-repo' }),
    fileDiff: async () => ({ hunks: [] })
  }
  // Never invoked here either, for the identical reason reviewEngineStub is
  // not: this suite only asserts REGISTRATION, never drives review:commit.
  const reviewCommitStub = async () => ({ kind: 'nothing-to-commit' })
  // Never invoked here either — registration only. A real store would be
  // just as harmless, but a stub keeps this suite from touching a file at
  // all, the same posture every other stub above takes.
  const credentialStoreStub = {
    list: () => [],
    set: () => ({ ok: false, reason: 'stub' }),
    delete: () => false,
    read: () => undefined,
    setLabel: () => {}
  }
  registerIpcHandlers(
    stub,
    layoutStoreStub,
    () => ({ kind: 'direct', reason: 'verify: direct', hasSession: () => false }),
    presetsStub,
    () => {},
    reviewEngineStub,
    reviewCommitStub,
    credentialStoreStub
  )

  const channels = Object.values(IPC)
  const missing = channels.filter((c) => !isHandled(c))
  // M14 Task 5 takes the surface to 35: four credential:* channels, none of
  // which returns a secret.
  const EXPECTED_CHANNELS = 35
  ok(`1 every contract channel has a main-process handler (${channels.length} channels)`,
    missing.length === 0 && channels.length === EXPECTED_CHANNELS,
    missing.length ? `unhandled: ${missing.join(', ')}` : `count=${channels.length}`)

  console.log('\n' + '='.repeat(60))
  const failed = results.filter((r) => !r.pass)
  console.log(`${results.length - failed.length}/${results.length} passed`)
  if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
  app.exit(failed.length ? 1 : 0)
})
