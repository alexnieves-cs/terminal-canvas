/* The screenshot harness. Not a verify suite, deliberately: it asserts
   nothing, it paints the real built renderer to PNGs so a person — or a
   fresh-context critic that never sees the code — can look at them.

   It exists because verify:styles says outright that it never renders
   anything, and the M36–M60 run built an entire visual language and never
   once looked at the result (M61's spec). Every scene below drives the
   renderer through the route a user takes — a chord, a click on a real
   control — never by reaching into React state, so what is painted is what
   a user would see after the same gestures.

   Run with: npm run build && npm run shot       (SHOT_DIR overrides out/shots)

   Output: <SHOT_DIR>/<scene>.png for every scene, plus manifest.json — the
   scene list with each scene's stated INTENT, which is what the critic is
   handed alongside the images. Add a scene by appending to SCENES; an intent
   is one sentence saying what the picture is supposed to show.

   Fenced like every Electron harness here: a throwaway userData, its own
   layout file, its own scrollback and projects directories, the direct
   backend (reattach is not a visual property), and never the production
   tmux sockets. It spawns real shells. */
const { join } = require('node:path')
const { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, realpathSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { execFileSync } = require('node:child_process')
const { buildSync } = require('esbuild')
const { app, BrowserWindow } = require('electron')

const OUT = process.env.SHOT_DIR || join(__dirname, '..', 'out', 'shots')
mkdirSync(OUT, { recursive: true })

// The subagent watcher resolves its projects root ONCE, at PtyManager
// construction, from this variable — set before the bundle is even required
// (verify-pty-manager.cjs's fence, same reason). A spaced path, this repo's rule.
process.env.TC_CLAUDE_PROJECTS = mkdtempSync(join(tmpdir(), 'tc shot projects '))

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
const {
  registerIpcHandlers, PtyManager, createDirectBackend, resolveShellEnv, whichFromEnv,
  createLayoutStore, credentialStore, FileWatchers, ToolboxCache, createScrollbackLog,
  createReviewEngine, createGitRunner, createBaselineCapture
} = require(ENTRY_OUT)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Never touch the real store: this harness spawns real shells.
app.setPath('userData', mkdtempSync(join(tmpdir(), 'tc-shot-')))
app.on('window-all-closed', () => {})

// ---------------------------------------------------------------------------
// Fixtures: a git repository with one modified file (a real review node), a
// project directory with a toolbox, a note, a scrollback log for a panel that
// is never started (the dormant card's tail, and something for search to hit).
// ---------------------------------------------------------------------------
const FIX = realpathSync(mkdtempSync(join(tmpdir(), 'tc shot fixtures ')))
const REPO = join(FIX, 'repo')
const NOTE = join(FIX, 'notes', 'plan.md')
mkdirSync(join(REPO, 'src'), { recursive: true })
mkdirSync(join(REPO, '.claude', 'commands'), { recursive: true })
mkdirSync(join(FIX, 'notes'), { recursive: true })
writeFileSync(join(REPO, 'src', 'server.ts'), 'export const port = 8080\nexport function start(): void {\n  console.log("listening")\n}\n')
writeFileSync(join(REPO, 'README.md'), '# fixture\n\nA repository the screenshot harness owns.\n')
writeFileSync(join(REPO, '.claude', 'settings.json'), JSON.stringify({ permissions: { allow: ['Bash(npm run *)', 'Read', 'Edit'], deny: ['Bash(rm -rf *)'] } }, null, 2))
writeFileSync(join(REPO, '.claude', 'commands', 'review.md'), 'Review the diff for correctness and name every silent failure.\n')
writeFileSync(join(REPO, '.claude', 'commands', 'deploy.md'), 'Run the deploy checklist and stop at the first red step.\n')
writeFileSync(NOTE, '# Plan\n\nSplit the flush gate out of onExit; the timer is the second door.\n\n- [ ] write the check first\n- [ ] watch it fail\n')

let scrollbackDir = join(mkdtempSync(join(tmpdir(), 'tc shot scrollback ')), 'scrollback')
mkdirSync(scrollbackDir, { recursive: true })
writeFileSync(join(scrollbackDir, 'dormant.log'), [
  '$ npm test',
  '> fixture@1.0.0 test',
  '> node scripts/verify.cjs',
  'PASS  1 the parser accepts an absent key',
  'PASS  2 the parser drops a malformed key with a warning',
  'FAIL  3 the writer is atomic — ENOENT: no such file or directory, rename',
  '2/3 passed',
  'FAILED: 3 the writer is atomic',
  ''
].join('\r\n'))

const layoutPath = join(mkdtempSync(join(tmpdir(), 'tc shot layout ')), 'layout.json')

const term = (id, x, y, w, h, z, extra = {}) => ({ id, x, y, w, h, z, cwd: REPO, command: '/bin/sh', args: ['-c', 'echo "$ claude"; echo "Reading src/server.ts"; echo "Editing src/server.ts"; sleep 600'], ...extra })

// ---------------------------------------------------------------------------
// The scenes. Each `run` is handed the window and a small kit and ends with
// a capture; `intent` is written for a critic who cannot read this file.
// ---------------------------------------------------------------------------
const SCENES = [
  { name: 'launcher', intent: 'The empty canvas a fresh install sees: the launcher of real verbs, nothing else on the canvas.',
    run: async (k) => { await k.theme('light'); await k.shot('launcher') } },
  { name: 'kinds', intent: 'One of every panel kind side by side on the light theme: a live terminal, a dormant card with a recorded tail, a review node listing a changed file, a file panel, a note, a toolbox, and a Jira panel with no credential. Each should read as the same family of frame.',
    run: async (k) => { await k.loadMain(); await k.shot('kinds') } },
  { name: 'kinds-dark', intent: 'The same panel kinds on the dark theme; the terminal well and every surface should follow the theme with the same hierarchy.',
    run: async (k) => { await k.theme('dark'); await k.shot('kinds-dark'); await k.theme('light') } },
  { name: 'subagents', intent: 'Two live terminals share one repository, so the app cannot attribute subagents; the notice beside them should read as a deliberate card, not a rendering error.',
    run: async (k) => { await k.goTo('claude — api (2)'); await k.shot('subagents') } },
  { name: 'palette', intent: 'The command palette at rest (Cmd+K) over the canvas: sections, rows, disabled rows with their reasons, and the footer.',
    run: async (k) => { await k.press('k', { metaKey: true }); await sleep(600); await k.shot('palette') } },
  { name: 'palette-query', intent: 'The palette filtered by the word "group": matching rows with highlighted matches, and any disabled row naming why.',
    run: async (k) => { await k.type('group'); await sleep(400); await k.shot('palette-query'); await k.closePalette() } },
  { name: 'palette-dark', intent: 'The palette at rest on the dark theme.',
    run: async (k) => { await k.theme('dark'); await k.press('k', { metaKey: true }); await sleep(600); await k.shot('palette-dark'); await k.closePalette(); await k.theme('light') } },
  { name: 'search', intent: 'Search across every panel (Cmd+F) for "FAIL": hits from the durable log, each naming its panel, with the matching line.',
    run: async (k) => { await k.press('f', { metaKey: true, code: 'KeyF' }); await sleep(500); await k.type('FAIL'); await sleep(900); await k.shot('search') } },
  { name: 'search-empty', intent: 'The same search with a term nothing said: an empty state that names the term and says there were no matches, not a blank list.',
    run: async (k) => { await k.type('zzqx'); await sleep(900); await k.shot('search-empty'); await k.closePalette() } },
  { name: 'inspector-detail', intent: 'The context pane open on the live terminal, Detail tab: identity pinned at the top, fields below, an action bar pinned at the bottom.',
    run: async (k) => { await k.selectRail('live'); await k.context(true); await k.tab('detail'); await k.shot('inspector-detail') } },
  { name: 'inspector-work', intent: 'The context pane, Work tab: what the panel has changed, run and cost — every section either answers, says nothing to show, or says it is still asking.',
    run: async (k) => { await k.tab('work'); await sleep(600); await k.shot('inspector-work') } },
  { name: 'inspector-tools', intent: 'The context pane, Tools tab: what this panel\'s agent can do — permissions and commands from its toolbox.',
    run: async (k) => { await k.tab('tools'); await sleep(600); await k.shot('inspector-tools'); await k.context(false) } },
  { name: 'navigator-panels', intent: 'The dock\'s Panels pane: one row per panel with its state, the selected row marked.',
    run: async (k) => { await k.dock('panels'); await k.shot('navigator-panels') } },
  { name: 'navigator-workspaces', intent: 'The dock\'s Workspaces pane: the two canvases, the active one marked.',
    run: async (k) => { await k.dock('workspaces'); await k.shot('navigator-workspaces') } },
  { name: 'navigator-files', intent: 'The dock\'s Files pane: a file tree rooted on the selected panel\'s directory.',
    run: async (k) => { await k.dock('files'); await sleep(500); await k.shot('navigator-files'); await k.dock('panels') } },
  { name: 'attention', intent: 'A panel rang its bell: the dock badge counts one, and the popover lists the waiting panel with a way to jump to it.',
    run: async (k) => { await k.focus('live'); await k.ring(); await k.click('[data-dock="attention"]'); await sleep(400); await k.shot('attention'); await k.press('Escape'); await sleep(200) } },
  { name: 'group', intent: 'A named, coloured group frame around two panels, with its label, member count, and its card and remove controls in the header.',
    run: async (k) => { await k.goTo('the workers'); await k.wake('groupA'); await k.shot('group') } },
  { name: 'group-collapsed', intent: 'The same group carded: its live member is now a card inside a dashed frame, and nothing was closed.',
    run: async (k) => { await k.click('.canvas-group__toggle'); await sleep(500); await k.shot('group-collapsed'); await k.click('.canvas-group__toggle'); await sleep(300) } },
  { name: 'merged', intent: 'The merged view: every workspace\'s panels at once in labelled lanes, read-only, with the door to leave it visible.',
    run: async (k) => { await k.goTo('the kinds'); await k.click('.shell__merge'); await sleep(900); await k.zoom(0.25); await k.shot('merged'); await k.click('.shell__merge'); await sleep(500); await k.zoom(1) } },
  { name: 'zoomed-out', intent: 'The canvas pulled back to about a fifth of its size: cards become summaries whose title and state are still legible; the shell chrome does not shrink.',
    run: async (k) => { await k.goTo('the kinds'); await k.zoom(0.22); await k.shot('zoomed-out') } },
  { name: 'zoomed-out-dark', intent: 'The zoomed-out canvas on the dark theme.',
    run: async (k) => { await k.theme('dark'); await k.shot('zoomed-out-dark'); await k.theme('light'); await k.zoom(1) } },
  { name: 'compact', intent: 'The shell at its compact breakpoint (1000px wide): the navigator and context become drawers, the canvas keeps the width.', size: [1000, 760],
    run: async (k) => { await k.context(true); await sleep(400); await k.shot('compact'); await k.context(false) } },
  { name: 'wide', intent: 'The shell at its wide breakpoint (1800px): navigator and context pane both resident, canvas between them.', size: [1800, 1000],
    run: async (k) => { await k.context(true); await sleep(400); await k.shot('wide') } }
]

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1440,
    height: 900,
    webPreferences: {
      preload: join(__dirname, '..', 'out', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  })
  const wc = win.webContents
  const loginEnv = await resolveShellEnv()

  // A real repository with one modified file, so the review node has a row.
  const gitPath = whichFromEnv('git', loginEnv)
  const git = (args) => execFileSync(gitPath, ['-C', REPO, ...args], { encoding: 'utf8', env: { ...loginEnv, GIT_AUTHOR_NAME: 'shot', GIT_AUTHOR_EMAIL: 'shot@example.invalid', GIT_COMMITTER_NAME: 'shot', GIT_COMMITTER_EMAIL: 'shot@example.invalid' } })
  git(['init', '-q'])
  git(['add', '.'])
  git(['commit', '-q', '-m', 'fixture'])
  const baselineSha = git(['rev-parse', 'HEAD']).trim()
  writeFileSync(join(REPO, 'src', 'server.ts'), 'export const port = 8081\nexport function start(): void {\n  console.log("listening on", port)\n}\n')
  writeFileSync(join(REPO, 'src', 'health.ts'), 'export const ok = (): boolean => true\n')

  // The layout: one workspace with every kind, a group, a bookmark; a second
  // workspace with two panels, for the merged view and the workspaces pane.
  // WRITTEN, not loaded, until the launcher scene has run: the store below
  // is created over this path while the file does not exist yet, so the
  // first load is the empty canvas a fresh install sees.
  const writeFixtureLayout = () => writeFileSync(layoutPath, JSON.stringify({
    version: 1,
    activeWorkspaceId: 'w1',
    workspaces: [{
      id: 'w1', name: 'api', camera: { x: 0, y: 0, scale: 1 }, selectedId: 'live', focusedId: null,
      panels: [
        term('live', 30, 30, 380, 250, 1, { title: 'claude — api' }),
        { id: 'dormant', x: 660, y: 30, w: 440, h: 250, z: 2, cwd: REPO, command: '/bin/sh', args: ['-c', 'sleep 600'], title: 'tests' },
        { id: 'review', kind: 'review', x: 30, y: 310, w: 350, h: 230, z: 3, subject: { subjectId: 'live', repoRoot: REPO, baselineSha, label: 'claude — api' } },
        { id: 'file', kind: 'file', x: 410, y: 310, w: 360, h: 230, z: 4, source: { path: join(REPO, 'src', 'server.ts') } },
        { id: 'note', kind: 'file', x: 800, y: 310, w: 300, h: 230, z: 5, source: { path: NOTE, prose: true } },
        { id: 'toolbox', kind: 'toolbox', x: 30, y: 570, w: 380, h: 210, z: 6, source: { cwd: REPO } },
        { id: 'jira', kind: 'jira', x: 440, y: 570, w: 380, h: 210, z: 7 },
        term('twin', 1400, 1000, 480, 300, 8, { title: 'claude — api (2)', args: ['-c', 'echo "$ claude"; echo "Waiting for input"; read x; printf "\\a? Allow Edit on src/server.ts (y/n)\\n"; sleep 600'] }),
        term('groupA', 60, 1440, 420, 260, 9, { title: 'worker a', cwd: FIX }),
        term('groupB', 520, 1440, 420, 260, 10, { title: 'worker b', cwd: FIX })
      ],
      groups: [{ id: 'g1', label: 'workers', colour: 'violet', panelIds: ['groupA', 'groupB'] }],
      bookmarks: [{ id: 'b1', name: 'the workers', camera: { x: 0, y: -1380, scale: 1 } }, { id: 'b2', name: 'the kinds', camera: { x: 0, y: 0, scale: 1 } }]
    }, {
      id: 'w2', name: 'docs', camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null,
      panels: [
        { id: 'docsA', x: 40, y: 40, w: 480, h: 300, z: 1, cwd: FIX, command: '/bin/sh', args: ['-c', 'sleep 600'], title: 'docs writer' },
        { id: 'docsB', x: 560, y: 40, w: 480, h: 300, z: 2, cwd: FIX, command: '/bin/sh', args: ['-c', 'sleep 600'], title: 'docs reviewer' }
      ],
      groups: [], bookmarks: []
    }],
    presets: [], defaultPresetId: 'shell', prompts: [],
    preferences: { 'appearance.theme': 'light', 'scrollback.persist': true, 'agent.bell': true, 'placement.snap': false },
    baselines: { live: { root: REPO, sha: baselineSha } }
  }), 'utf8')

  const layoutStore = createLayoutStore({ filePath: layoutPath })
  layoutStore.load()
  const scrollbackLog = createScrollbackLog({ dir: scrollbackDir })
  const backend = () => createDirectBackend('shot: direct')
  const gitRunner = createGitRunner({ gitPath: () => gitPath, env: () => loginEnv })
  const reviewEngine = createReviewEngine({
    run: gitRunner,
    baselineOf: (panelId) => layoutStore.baseline(panelId),
    peersInRepo: (root, except) => layoutStore.baselinePeers(root, except),
    notARepo: (panelId) => baselineCapture.isNotARepo(panelId)
  })
  const baselineCapture = createBaselineCapture({
    baselineOf: (panelId) => layoutStore.baseline(panelId),
    setBaseline: (panelId, baseline) => layoutStore.setBaseline(panelId, baseline),
    resolveRepo: (cwd) => reviewEngine.resolveRepo(cwd),
    captureBaseline: (root) => reviewEngine.captureBaseline(root)
  })
  const ptyManager = new PtyManager(
    () => wc, backend,
    () => Number(layoutStore.getSetting('agent.idleAfterMs')),
    () => layoutStore.getSetting('agent.bell') === true,
    (panelId, cwd) => baselineCapture.capture(panelId, cwd),
    (panelId) => { baselineCapture.drop(panelId); layoutStore.dropBaseline(panelId) },
    (panelId) => layoutStore.session(panelId),
    (panelId, sessionId) => layoutStore.setSession(panelId, sessionId),
    (panelId) => layoutStore.dropSession(panelId),
    undefined, undefined, undefined, undefined,
    {
      append: (panelId, data) => scrollbackLog.append(panelId, data),
      drop: (panelId) => scrollbackLog.drop(panelId),
      enabled: () => layoutStore.getSetting('scrollback.persist') === true
    }
  )
  registerIpcHandlers(
    ptyManager, layoutStore,
    () => { const b = backend(); return { kind: b.kind, reason: b.reason } },
    {
      list: () => [{ id: 'shell', name: 'Login shell', available: true, builtIn: true, isDefault: true, subtitle: '~' }, { id: 'claude', name: 'Claude', available: true, builtIn: true, isDefault: false, subtitle: '~' }],
      rename: () => false, remove: () => false, setDefault: () => {},
      spawn: () => {}, savePanel: () => {}, requestReset: () => {}, listPrompts: () => [], savePrompt: () => {}, removePrompt: () => false
    },
    () => {},
    reviewEngine,
    async () => ({ kind: 'refused', reason: 'the screenshot harness does not commit' }),
    credentialStore, new FileWatchers(), () => win,
    new ToolboxCache(),
    join(mkdtempSync(join(tmpdir(), 'tc-shot-diagnostics-')), 'diagnostics'),
    { list: () => [], remove: async () => ({ kind: 'refused', reason: 'no worktrees here' }), reveal: () => true },
    {
      tail: (panelId, lines) => scrollbackLog.tail(panelId, lines),
      clear: () => scrollbackLog.clearAll(),
      search: (panelIds, query) => scrollbackLog.search(panelIds, query, { maxHits: 50, maxPerPanel: 5 })
    },
    () => ({
      probedAt: Date.now(), shell: { path: '/bin/zsh', ok: true }, pathEntries: ['/usr/bin', '/bin'],
      clis: [{ name: 'claude', path: '/usr/local/bin/claude' }, { name: 'codex', path: null }, { name: 'git', path: gitPath }],
      tmux: { kind: 'direct', reason: 'shot: direct', path: null }, layout: { path: layoutPath, backupWritten: false }, envKeys: ['HOME', 'PATH']
    }),
    { open: () => ({ kind: 'opened' }) },
    () => [],
    undefined,
    undefined
  )
  wc.on('did-finish-load', () => { ptyManager.resendStates() })
  wc.on('console-message', (_e, level, message) => { if (level >= 2) console.log('[renderer]', String(message).slice(0, 200)) })

  // ---------------------------------------------------------------------
  // The kit every scene drives the renderer through.
  // ---------------------------------------------------------------------
  const js = (code) => wc.executeJavaScript(code)
  const kit = {
    shot: async (name) => {
      await sleep(250)
      const img = await wc.capturePage()
      const path = join(OUT, `${name}.png`)
      writeFileSync(path, img.toPNG())
      console.log(`wrote ${path}`)
    },
    press: (key, mods = {}) => js(`window.dispatchEvent(new KeyboardEvent('keydown', ${JSON.stringify({ key, bubbles: true, cancelable: true, ...mods })})), true`),
    // React's controlled input ignores a plain value assignment: the native
    // setter plus a dispatched 'input' is what reaches its state.
    type: (text) => js(`(() => { const i = document.querySelector('.palette__input'); if (!i) return false
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ${JSON.stringify(text)}); i.dispatchEvent(new Event('input', { bubbles: true })); return true })()`),
    click: (sel) => js(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b) return false; b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); return true })()`),
    theme: async (name) => { await js(`window.canvas.settings.set('appearance.theme', ${JSON.stringify(name)})`); await sleep(700) },
    // The first real layout: the launcher scene runs on an EMPTY store, so
    // the fixture layout is written to disk first and loaded here, once.
    loadMain: async () => {
      writeFixtureLayout()
      layoutStore.load()
      const first = new Promise((resolve) => wc.once('did-finish-load', resolve))
      wc.reload(); await first
      await sleep(1200)
      // Wake the live panel and the twin by clicking their cards at the
      // centre: a mousedown with no coordinates hit-tests world (0,0) and
      // misses (verify:panels' own lesson).
      for (const id of ['live', 'twin']) {
        await js(`(() => { const card = document.querySelector('.panel[data-panel-id="${id}"] .panel__card'); if (!card) return false
          const r = card.getBoundingClientRect(); card.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); return true })()`)
        await sleep(400)
      }
      await sleep(2500)
      await js(`window.__m56ReducedMotion(true)`)
    },
    // The user's own route to a place: the palette's Go-to and bookmark
    // rows. Reduced motion is forced on (the harness override verify:panels
    // uses), so a flight is one frame and the capture is not mid-tween.
    goTo: async (text) => {
      await kit.press('k', { metaKey: true }); await sleep(400)
      await kit.type(text); await sleep(300)
      await js(`(() => { const i = document.querySelector('.palette__input'); if (i) i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true })()`)
      await sleep(700)
    },
    // Escape is two-stage inside a scope (pop, then close): press until gone.
    closePalette: async () => {
      for (let i = 0; i < 3; i++) {
        const open = await js(`document.querySelector('.palette') !== null`)
        if (!open) break
        await js(`(() => { const i = document.querySelector('.palette__input'); if (i) i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true })()`)
        await sleep(250)
      }
    },
    // Wake a dormant panel by clicking its card at the centre (a mousedown
    // with no coordinates hit-tests world (0,0) and misses).
    wake: async (id) => {
      await js(`(() => { const card = document.querySelector('.panel[data-panel-id="${id}"] .panel__card'); if (!card) return false
        const r = card.getBoundingClientRect(); card.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); return true })()`)
      await sleep(2000)
    },
    // Focus a live panel by clicking into its terminal.
    focus: async (id) => {
      await js(`(() => { const s = document.querySelector('.panel[data-panel-id="${id}"] .panel__slot'); if (!s) return false
        const r = s.getBoundingClientRect(); s.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); return true })()`)
      await sleep(300)
    },
    zoom: async (target) => {
      // A pinch is a wheel with ctrlKey (canvas-input.ts); step until the
      // scale lands within a few percent of the target.
      for (let i = 0; i < 80; i++) {
        const scale = await js(`window.__m4aScale()`)
        if (Math.abs(scale - target) / target < 0.04) break
        const deltaY = scale > target ? 60 : -60
        await js(`(() => { const host = document.querySelector('.canvas'); const r = host.getBoundingClientRect()
          host.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: ${deltaY}, deltaMode: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); return true })()`)
        await sleep(40)
      }
      await sleep(600)
    },
    selectRail: async (id) => { await kit.click(`.rail-row[data-rail-row="${id}"] .rail-row__main`); await sleep(300) },
    context: async (open) => {
      const isOpen = await js(`(document.querySelector('.shell__inspector')?.getBoundingClientRect().width ?? 0) > 0`)
      if (isOpen !== open) { await kit.click('.shell__inspector-toggle'); await sleep(400) }
    },
    tab: async (id) => { await kit.click(`[data-context-tab="${id}"]`); await sleep(400) },
    dock: async (id) => {
      const on = await js(`document.querySelector('[data-dock="${id}"]')?.getAttribute('aria-pressed') === 'true'`)
      if (!on) { await kit.click(`[data-dock="${id}"]`); await sleep(400) }
    },
    // One bell from the dormant panel's twin: the agent-state detector
    // counts it and the dock badge follows.
    ring: async () => { ptyManager.write('twin', String.fromCharCode(13)); await sleep(1500) },
    resize: async (w, h) => { win.setSize(w, h); await sleep(900) }
  }

  await win.loadFile(join(__dirname, '..', 'out', 'renderer', 'index.html')).catch(() => {})
  await sleep(1500)

  const manifest = []
  for (const scene of SCENES) {
    if (scene.size) await kit.resize(scene.size[0], scene.size[1])
    try {
      await scene.run(kit)
      manifest.push({ file: `${scene.name}.png`, intent: scene.intent })
    } catch (error) {
      console.log(`scene ${scene.name} failed: ${error && error.message || error}`)
      manifest.push({ file: `${scene.name}.png`, intent: scene.intent, failed: String(error && error.message || error) })
    }
  }
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log(`wrote ${join(OUT, 'manifest.json')} (${manifest.length} scenes)`)

  ptyManager.killAll()
  for (const p of [FIX, scrollbackDir]) { try { if (existsSync(p)) rmSync(p, { recursive: true, force: true }) } catch { /* best effort */ } }
  app.quit()
})
