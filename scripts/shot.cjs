/* M19 visual check. Not a verify suite and deliberately not wired into the
   chain: it asserts nothing, it just paints the real built renderer and writes
   PNGs so a human (or a model) can look at them.

   It exists because verify:styles says outright that it never renders anything
   and can only tell you the stylesheet obeys its own rules. For a milestone
   whose entire subject is how the app LOOKS, that leaves the actual claim
   unchecked, and this repo has no visual regression test to fall back on.

   Run with: npm run build && node_modules/.../Electron scripts/shot.cjs */
const { join } = require('node:path')
const { mkdtempSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { buildSync } = require('esbuild')
const { app, BrowserWindow } = require('electron')

const OUT = process.env.SHOT_DIR || tmpdir()

const ENTRY_OUT = join(__dirname, '..', 'out', 'verify', 'shot-entry.cjs')
buildSync({
  entryPoints: [join(__dirname, 'panels-entry.cjs')],
  outfile: ENTRY_OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['node-pty', 'electron'],
  alias: {
    '@shared': join(__dirname, '..', 'src', 'shared'),
    '@renderer': join(__dirname, '..', 'src', 'renderer')
  }
})
const { registerIpcHandlers, PtyManager, createDirectBackend, resolveShellEnv, createLayoutStore } =
  require(ENTRY_OUT)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Never touch the real store: this harness spawns real shells.
app.setPath('userData', mkdtempSync(join(tmpdir(), 'tc-shot-')))
app.on('window-all-closed', () => {})

const press = (wc, key, mods = {}) => wc.executeJavaScript(
  `window.dispatchEvent(new KeyboardEvent('keydown', ${JSON.stringify({ key, bubbles: true, ...mods })})), true`
)

const shot = async (win, name) => {
  const img = await win.webContents.capturePage()
  const path = join(OUT, `${name}.png`)
  require('node:fs').writeFileSync(path, img.toPNG())
  console.log(`wrote ${path}`)
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1440,
    height: 900,
    webPreferences: {
      preload: join(__dirname, '..', 'out', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  await resolveShellEnv()
  const ptyManager = new PtyManager(() => win.webContents, () => createDirectBackend('shot: direct'))
  const layoutStore = createLayoutStore({
    filePath: join(mkdtempSync(join(tmpdir(), 'tc-shot-layout-')), 'layout.json')
  })
  registerIpcHandlers(
    ptyManager,
    layoutStore,
    () => { const b = createDirectBackend('shot: direct'); return { kind: b.kind, reason: b.reason } },
    {
      list: () => [], rename: () => false, remove: () => false, setDefault: () => {},
      spawn: () => {}, requestReset: () => {}, listPrompts: () => [],
      savePrompt: () => {}, removePrompt: () => false
    },
    () => {},
    {
      resolveRepo: async () => null,
      captureBaseline: async () => null,
      review: async () => ({ kind: 'not-a-repo' })
    }
  )

  await win.loadFile(join(__dirname, '..', 'out', 'renderer', 'index.html')).catch(() => {})
  await sleep(1500)

  // Two more panels so the canvas shows the cascade, a live well and a card.
  await press(win.webContents, 'n', { metaKey: true })
  await sleep(900)
  await press(win.webContents, 'n', { metaKey: true })
  await sleep(2500)
  await shot(win, 'canvas')

  // The palette: the surface that changed most (glass -> raised slab).
  await press(win.webContents, 'k', { metaKey: true })
  await sleep(700)
  await shot(win, 'palette')

  app.quit()
})
