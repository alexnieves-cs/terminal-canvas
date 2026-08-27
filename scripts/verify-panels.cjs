/* Verifies terminals on the canvas in a real renderer.
   Run with: npm run build && npm run verify:panels

   Check 4 is the reason this file exists: culling must not kill a PTY. That
   failure is silent in a running app — the panel returns looking like a fresh
   terminal — so it has to be caught mechanically. pty:list makes it possible. */
const { buildSync } = require('esbuild')
const { join } = require('node:path')
const { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } = require('node:fs')
const { execFileSync } = require('node:child_process')
const { tmpdir } = require('node:os')
const { app, BrowserWindow } = require('electron')

// This script is its own Electron entry point (not out/main/index.js), so
// nothing has registered ipcMain handlers for the pty:* channels the built
// renderer calls. Bundle and wire up the same pieces main/index.ts wires up
// at real startup, mirroring the pattern verify-ipc-surface.cjs and
// verify-window-lifecycle.cjs already use for this exact problem.
const ENTRY_OUT = join(__dirname, '..', 'out', 'verify', 'panels-entry.cjs')
buildSync({
  entryPoints: [join(__dirname, 'panels-entry.cjs')],
  outfile: ENTRY_OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['node-pty', 'electron']
})
const {
  registerIpcHandlers,
  PtyManager,
  createDirectBackend,
  createTmuxBackend,
  buildTmuxConf,
  attachPtyLifecycle,
  resolveShellEnv,
  createLayoutStore,
  fromPanels,
  SEED_PANELS,
  DEFAULT_CAMERA,
  CASCADE_STEP,
  requestFromRenderer,
  pushDefaultPreset,
  allPresets,
  resolveAvailability,
  presetRows,
  templateOf,
  mergePrompts,
  readProjectPrompts,
  resolveCwd,
  IPC_EVENTS
} = require(ENTRY_OUT)

/** Panels seeded with a live session before the window loads, so check 24 has
 * both cases to assert against each other: s01 (below) genuinely comes back
 * through pty:list, everything else in SEED_PANELS does not. */
const LIVE_AT_BOOT = ['s01']

/* Check 26's own tmux socket, never the production one and never the user's
   default. It ends the run with kill-server; pointed anywhere else that would
   destroy real agents. verify:pty-manager owns 'terminal-canvas-verify', and
   the two suites must not share a server — this one reloads a renderer while
   that one is killing sessions out from under whatever it finds. */
const PANELS_SOCKET = 'terminal-canvas-verify-panels'

/** Absolute path or null. A GUI app has a bare PATH, so never rely on the name. */
function findTmux() {
  for (const p of ['/opt/homebrew/bin/tmux', '/usr/local/bin/tmux', '/usr/bin/tmux']) {
    if (existsSync(p)) return p
  }
  return null
}

const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Polls `fn` until it returns a truthy value or `timeoutMs` elapses, then
 * returns whatever the last call produced (truthy or not). Lets a check wait
 * on the actual condition it cares about instead of a guessed clock delay —
 * the delay only has to be a safe UPPER bound, not a measured value.
 */
const waitUntil = async (fn, timeoutMs, intervalMs = 50) => {
  const start = Date.now()
  let value = await fn()
  while (!value && Date.now() - start < timeoutMs) {
    await sleep(intervalMs)
    value = await fn()
  }
  return value
}

const liveCount = (wc) =>
  wc.executeJavaScript(`document.querySelectorAll('.panel__slot .xterm').length`)
const cardCount = (wc) =>
  wc.executeJavaScript(`document.querySelectorAll('.panel__card').length`)
// pty:list's full records, not just a count — check 4/5 need pid identity,
// not a number that a kill-and-respawn could still satisfy.
const listSessions = (wc) => wc.executeJavaScript(`window.canvas.pty.list()`)
const sessionMap = async (wc) => new Map((await listSessions(wc)).map((s) => [s.panelId, s.pid]))
/**
 * Waits until pty:list has the SAME length on two consecutive reads before
 * returning it. Snapshotting after the first live terminal appears is not
 * enough: seed panels spawn concurrently, so `sessionsBefore` could hold one
 * of four sessions and a later kill of the other three would pass check 4
 * silently — the exact failure this suite's central check exists to catch.
 */
const settledSessionMap = async (wc, timeoutMs = 10000, intervalMs = 200) => {
  const start = Date.now()
  let previous = -1
  let map = await sessionMap(wc)
  while (Date.now() - start < timeoutMs) {
    if (map.size > 0 && map.size === previous) return map
    previous = map.size
    await sleep(intervalMs)
    map = await sessionMap(wc)
  }
  return map
}

const zoomTo = (wc, key) =>
  wc.executeJavaScript(
    `window.dispatchEvent(new KeyboardEvent('keydown', { key: '${key}', metaKey: true })), true`
  )

/**
 * An unmodified keydown — Enter/Escape at the workspace confirm gate (checks
 * 69-70), which must NOT carry metaKey the way every other synthetic key
 * this suite dispatches does. zoomTo's name and shape are both wrong for
 * that: it always sets metaKey, and a `true` value there would be a lie
 * about what a real Enter/Escape press looks like.
 *
 * Dispatched on `document.activeElement`, never on `window`: React's own
 * `onKeyDown` here is bound to the palette's `<input>` element, and an event
 * only reaches a listener bound to a DESCENDANT of its dispatch target during
 * the CAPTURE phase, which a plain `dispatchEvent` never runs — bubbling only
 * ever climbs from the target toward the root, so a window-targeted dispatch
 * reaches window's own listeners and nothing an input owns (the same shape
 * of mistake CLAUDE.md's ".panel__slot never reaches xterm's listeners"
 * documents for mouse events). Rule 1 of "who owns the keyboard" guarantees
 * the palette's own input holds focus the instant it opens, which is what
 * makes `document.activeElement` the right target rather than a guess.
 */
const pressPlain = (wc, key) =>
  wc.executeJavaScript(`(() => {
    const target = document.activeElement || document.body
    target.dispatchEvent(new KeyboardEvent('keydown', { key: '${key}', bubbles: true }))
    return true
  })()`)

/**
 * M7's workspace-switch checks (64-67) call this after every
 * __m7aWorkspace() action. switchWorkspace's own work is a fire-and-forget
 * chain of TWO local IPC round trips (workspace:activate, then a second
 * pty:list for dormancy) before Canvas commits setPanels/setHistory/
 * nextIdRef — and __m7aWorkspace's switchTo/createAndSwitch return void
 * (matching the production paletteActions.switchWorkspace shape), so
 * executeJavaScript resolves before any of that has necessarily landed.
 * A fixed wait rather than a condition on a specific DOM/session shape,
 * because the four call sites want different things settled (an empty
 * workspace's panel count, a spawn's minted id, history's inertness) and no
 * single predicate covers all of them; 300ms is the same margin already used
 * for other post-action settling throughout this file (e.g. the M6d block
 * above), comfortably above two local IPC round trips to an idle process.
 */
const settle = () => sleep(300)

/**
 * True only if every panelId present in `before` is still present in `after`
 * with the IDENTICAL pid — i.e. that session was never killed, even briefly.
 * `after` may have MORE entries than `before` (new panels scrolling into
 * view legitimately spawn their own first session); it must never have
 * fewer, and never a changed pid for an id both maps share.
 */
const pidsPreserved = (before, after) => {
  const changed = []
  for (const [panelId, pid] of before) {
    const now = after.get(panelId)
    if (now !== pid) changed.push(`${panelId}: ${pid} -> ${now ?? 'MISSING'}`)
  }
  return { ok: changed.length === 0, changed }
}

app.on('window-all-closed', () => {})

const WATCHDOG_MS = 60000

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1400,
    height: 900,
    webPreferences: {
      preload: join(__dirname, '..', 'out', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // main/index.ts resolves and caches the login-shell env before the window
  // (and therefore before any pty:create) exists. Skipping this here let
  // every seed panel's concurrent pty:create race the same uncached probe —
  // each forked its OWN login zsh (visible as N "[shell-env] resolved" log
  // lines instead of one), a path the real app never takes, and it ate into
  // the fixed settle budget below for no reason.
  await resolveShellEnv()

  // Same wiring main/index.ts does at real startup: a PtyManager that reaches
  // this window's webContents, registered against the pty:* channels the
  // renderer's window.canvas.pty bridge calls.
  // Mutable rather than a fresh backend per call: check 26 swaps the whole
  // manager onto a real tmux backend at the very end of the run, which is the
  // only way a renderer reload can be asked to prove session SURVIVAL — under
  // the direct backend a detached process is simply a dead one.
  let backend = createDirectBackend('verify: direct')
  // The last two arguments are the SAME getters main/index.ts passes, closing
  // over the layoutStore built below — not the constructor's defaults. Two
  // reasons, and neither is cosmetic. (1) Checks 54-57 need a panel to reach
  // 'idle' inside a bounded wait, and the default threshold is 1500ms: a
  // suite that waits that long per transition is slow, and a suite that
  // instead waits a guessed fixed time is flaky on a loaded machine. The
  // layout file seeded below sets agent.idleAfterMs to the schema's MINIMUM
  // (250), so the wait is short and the number under test is still one the
  // store validated rather than one this harness invented. (2) Taking the
  // defaults would leave this harness the one PtyManager construction site
  // that reads no setting at all — so a regression that broke the getters
  // (a frozen boot value, a missing store read) would be invisible here,
  // which is exactly the seam this file exists to watch.
  const ptyManager = new PtyManager(
    () => win.webContents,
    () => backend,
    () => Number(layoutStore.getSetting('agent.idleAfterMs')),
    () => layoutStore.getSetting('agent.bell') === true
  )

  // A real store, not a stub: the built renderer now calls and awaits
  // window.canvas.layout.load() before React mounts, so an unhandled channel
  // here would leave every check failing against a blank canvas with a
  // symptom that looks nothing like its cause. Pointed at a tmpdir, never
  // app.getPath('userData'), so the result never depends on whatever canvas
  // the developer running this happens to have saved for real.
  // Named rather than buried inline: check 19 reads this same path back off
  // disk to prove a renderer change actually landed there, and flushLayoutStore
  // (below) forces the store's 500ms-debounced write onto the SAME instance
  // rather than a second one built from a different path.
  const LAYOUT_PATH = join(mkdtempSync(join(tmpdir(), 'tc-panels-')), 'layout.json')
  // Check 32's fixture, written to disk BEFORE the store reads it: a user
  // preset that is emphatically not the login shell, named as the default.
  // The distinction matters — makePanel's fallback is byte-identical to the
  // built-in shell preset, so a default of `shell` proves nothing about
  // whether the push arrived at all. /bin/cat -v for the same reason
  // CLAUDE_TEMPLATE uses cat: it blocks on stdin and outlives the run, so a
  // panel spawned from it does not vanish out of pty:list mid-suite. `-v` is
  // NOT `-u`: check 29 pushes its own default with `-u`, and identical
  // fixtures would let check 32 pass on check 29's push.
  const BOOT_DEFAULT_PRESET = {
    id: 'u9', name: 'Verify boot default', cwd: '/tmp', command: '/bin/cat', args: ['-v']
  }
  // Check 38's fixture. The name is what the check's query targets, and it is
  // deliberately unlike every other preset's: 'rename harness' is a
  // subsequence of "Rename preset harness preset" and of no other row's text,
  // so the row the check clicks is the one it means rather than whichever
  // built-in the fuzzy matcher happened to rank first.
  const RENAMABLE_PRESET = { id: 'u1', name: 'harness preset', cwd: '~', args: [] }
  // Check 40's fixture, and the only reason that check can exist at all.
  // `printf '\033[?2004h'` turns BRACKETED-PASTE MODE (DEC private mode 2004)
  // on, so xterm wraps a paste in \e[200~ ... \e[201~; `cat -v` echoes what
  // arrives with control characters made visible, so those markers land in the
  // terminal buffer as the literal text "^[[200~". Against any ordinary shell
  // paste() and write() put byte-identical data on the PTY and nothing can
  // tell them apart — this program is the discriminator.
  // Check 43's fixture, and check 40's cwd. A project prompt is a FILE under
  // a panel's cwd, so the panel has to be pointed somewhere this suite owns:
  // '~' would make the check depend on whatever .claude/commands happens to
  // be in the running user's home directory, and a spaced path is deliberate
  // — every cwd this app expands eventually reaches a shell (the same class
  // of bug the tmux exitDir's quoting note in CLAUDE.md records).
  const PROJECT_DIR = mkdtempSync(join(tmpdir(), 'tc panels project '))
  mkdirSync(join(PROJECT_DIR, '.claude', 'commands'), { recursive: true })
  // The name comes from the FILENAME (readProjectPrompts strips the .md), so
  // this string is what check 43's query and row assertion both target.
  const PROJECT_PROMPT_NAME = 'harness-project-prompt'
  const PROJECT_PROMPT_BODY = 'zzprojectbody first line\nzzprojectbody second line'
  writeFileSync(
    join(PROJECT_DIR, '.claude', 'commands', PROJECT_PROMPT_NAME + '.md'),
    PROJECT_PROMPT_BODY, 'utf8'
  )
  const ECHO_PRESET = {
    id: 'u2', name: 'echo -v', cwd: PROJECT_DIR,
    command: '/bin/sh', args: ['-c', "printf '\\033[?2004h'; cat -v"]
  }
  // Check 40's prompt. Two lines, because multi-line is the entire point: a
  // raw write of this body is two submissions, a bracketed paste is one.
  const SEEDED_PROMPT = { id: 'p1', name: 'two liner', body: 'first line\nsecond line' }
  // Check 39's fixture. reset() (check 23) always collapses the canvas to
  // firstRunPanels() — one panel — so nothing seeded into the BOOT layout can
  // survive to the end of the run; check 39 needs a still-dormant,
  // never-spawned panel at the very end of the suite, after reset, after
  // every check that runs between them. It is injected via its OWN reload
  // (below, right after check 26 — see the comment there for why that reload
  // is not check 26's tmux-only one), parked far outside every coordinate
  // any later check clicks — including check 30's background click at
  // screen (0,0), which happens to land on world (-120,-120) and is what
  // silently re-wakes the reset panel (p1), a naive seed would rely on
  // instead.
  const NEVER_WOKEN_ID = 'never-woken'
  // Check 68's fixture: a SECOND workspace, seeded on disk before the window
  // ever loads, holding a panel this renderer process has never rendered and
  // therefore never registered a session for. w1 is where the app boots, so
  // registry.ensure only ever runs against w1's panels until something
  // switches away from it — which is exactly the gap the mass-spawn bug lived
  // in: a workspace's own panels/session state, reached for the FIRST time by
  // a switch rather than by boot(). focusedId is set to this panel on
  // purpose: assignTiers pins a focused panel live UNCONDITIONALLY, so if
  // dormantIds is ever wrong on the very first render after the switch (the
  // exact bug this check exists to catch), this panel is promoted and spawns
  // regardless of the camera or the cull region — the check does not have to
  // depend on framing to force the failure into view. A static id ('w9') that
  // no runtime-created workspace can collide with: nextWorkspaceId derives
  // from the maximum existing `w<n>`, so seeding w9 here makes any later
  // createWorkspace() call in this run mint w10 onward, never colliding with
  // the id this check depends on.
  const NEVER_RENDERED_WORKSPACE_ID = 'w9'
  const NEVER_RENDERED_PANEL_ID = 'w9p1'
  writeFileSync(LAYOUT_PATH, JSON.stringify({
    version: 1,
    activeWorkspaceId: 'w1',
    workspaces: [{
      id: 'w1', name: 'Canvas', panels: [],
      camera: { ...DEFAULT_CAMERA }, selectedId: null, focusedId: null
    }, {
      id: NEVER_RENDERED_WORKSPACE_ID, name: 'never rendered',
      panels: [{
        id: NEVER_RENDERED_PANEL_ID, x: 5000, y: 5000, w: 400, h: 300, z: 1,
        cwd: '/tmp', command: '/bin/cat', args: []
      }],
      camera: { ...DEFAULT_CAMERA },
      selectedId: NEVER_RENDERED_PANEL_ID, focusedId: NEVER_RENDERED_PANEL_ID
    }],
    // Check 38 needs a preset the palette is allowed to RENAME, which rules
    // out every built-in — and BOOT_DEFAULT_PRESET is check 32's fixture, so
    // renaming that one would leave 32 asserting against a name this check
    // changed. A second user preset, never the default, keeps the two apart.
    presets: [BOOT_DEFAULT_PRESET, RENAMABLE_PRESET, ECHO_PRESET],
    defaultPresetId: BOOT_DEFAULT_PRESET.id,
    prompts: [SEEDED_PROMPT],
    // Checks 54-57's clock. The schema's MINIMUM, deliberately: it is the
    // shortest value the store will accept, so the idle transitions those
    // checks wait on land within a few hundred milliseconds instead of the
    // 1500ms default. Written as a preference rather than passed to the
    // manager as a literal so the getters above are exercised as production
    // exercises them — which is also this seed's one hazard, recorded rather
    // than claimed away: a value the schema would REJECT is dropped by
    // parsePreferences with a console.warn and resolves to the 1500ms
    // default, and nothing in this suite reads warnings, so checks 54-57
    // would then quietly wait on a six-times-slower clock and fail on their
    // timeouts with nothing pointing at this line. If this number is ever
    // changed, check it against the schema's minimum by hand.
    preferences: { 'agent.idleAfterMs': 250 }
  }), 'utf8')
  const layoutStore = createLayoutStore({ filePath: LAYOUT_PATH })
  // main/index.ts calls this at whenReady; without it the store would start
  // from defaultSnapshot() and the seeded presets above would never be read.
  layoutStore.load()
  const flushLayoutStore = () => layoutStore.flushSync()

  // Seed the store with the twelve-panel fixture BEFORE the window loads.
  // Without this, layout:load returns no panels, Canvas boots the one-panel
  // first-run canvas (firstRunPanels()), and every check that needs several
  // off-screen panels against LIVE_BUDGET (1, 3, 15) hard-fails with "need
  // two live panels" — SEED_PANELS was always fixture data; persistence just
  // makes that explicit instead of implicit. save()+flushSync() go through
  // the real store API (the same path a real quit takes) rather than hand-
  // writing layout.json, so this seed can never silently drift out of sync
  // with what parseLayout actually accepts.
  layoutStore.save({
    panels: fromPanels(SEED_PANELS),
    camera: { ...DEFAULT_CAMERA },
    selectedId: null,
    focusedId: null
  })
  layoutStore.flushSync()

  // ipcMain.handle's return value crosses IPC via structured clone, so this
  // must be a plain { kind, reason } object, not the SessionBackend itself —
  // that carries a spawn() function, which structured clone cannot carry.
  // list and rename are REAL, against the same store and the same presetRows
  // builder main/index.ts uses: check 38 asserts a rename made in the palette
  // survives a round trip through the store, and a stubbed pair would let it
  // pass against the harness rather than against the app. The rest stay stubs
  // — nothing here drives them, and the contract requirement is only that
  // registerIpcHandlers registers every preset/reset channel.
  //
  // `which` resolves absolute paths and nothing else: this process has no
  // resolved login env, so a PATH lookup is meaningless here — but check 40a
  // CLICKS a spawn row, and buildCommands disables an unavailable one, so
  // ECHO_PRESET's /bin/sh has to come back available or that row can never
  // run. Answering only for a path that exists on disk keeps the answer
  // honest rather than blanket-true.
  const whichHere = (command) => (command.startsWith('/') && existsSync(command) ? command : null)
  registerIpcHandlers(ptyManager, layoutStore, () => ({ kind: backend.kind, reason: backend.reason }), {
    list: () => presetRows(
      resolveAvailability(allPresets(layoutStore.presets()), whichHere),
      layoutStore.defaultPresetId()
    ),
    // No afterPresetChange(): this entry point builds no menu, and re-pushing
    // PRESET_DEFAULT here would hand check 32's assertion a second push it
    // never asked for.
    rename: (id, name) => layoutStore.renamePreset(id, name),
    remove: () => false,
    setDefault: () => {},
    // Real, and the same two lines main/index.ts's onSpawnPreset is: check 40a
    // is the only end-to-end exercise of preset:spawn-by-id anywhere in the
    // suite, and it is the invoke reaching a resolve-and-push that it covers.
    // A stub here would leave the palette's spawn proven only as far as the
    // preload.
    spawn: (id) => {
      const found = allPresets(layoutStore.presets()).find((p) => p.id === id)
      if (found) win.webContents.send(IPC_EVENTS.PRESET_SPAWN, templateOf(found))
    },
    requestReset: () => {},
    // main/index.ts's listPrompts, project half included — check 43 is the
    // only end-to-end exercise of readProjectPrompts anywhere, and a stub
    // with `[]` for that half (which this was until the M5b fix wave) leaves
    // the whole .claude/commands path proven no further than verify:layout's
    // pure unit checks.
    //
    // The project read is FENCED to this suite's own fixture directory, and
    // that fence is not a weakening: check 43's panel is the only one pointed
    // at PROJECT_DIR, so nothing it asserts changes — while without the fence
    // every panel still carrying `cwd: '~'` (s01, RENAMABLE_PRESET, the seed
    // panels) would make this suite read the running developer's
    // ~/.claude/commands, i.e. depend on state the repo does not own. That is
    // the same class as the production-socket rule in CLAUDE.md ("The verify
    // suites must never touch the production socket"), and it fails in both
    // directions: a home file whose name contains a string another check
    // asserts on, or a home directory large enough to push prompt:list past
    // the sleeps the palette checks wait on. The wrong-cwd regression is
    // still caught, because the fence is on the cwd the RENDERER sent: a
    // palette that listed some other panel's directory gets `[]` here and
    // check 43's row never appears.
    listPrompts: (cwd) =>
      mergePrompts(
        layoutStore.prompts(),
        cwd === PROJECT_DIR ? readProjectPrompts(resolveCwd(cwd)) : []
      ),
    savePrompt: () => {},
    removePrompt: () => false
  }, () => {
    // This entry point is its own Electron process with no application menu
    // at all — createMenu()/rebuildMenu() belong to main/index.ts, which this
    // harness deliberately does not run (see the hand-wiring note above). The
    // no-op exists only to satisfy registerIpcHandlers' signature: settings:set
    // still has to reach a callable fifth argument or a real settings-palette
    // exercise here would throw "rebuildMenu is not a function" instead of
    // testing what it means to.
  })

  // The same listener createWindow() installs, calling the same production
  // function — not a send written here. Check 32 is about WHEN main sends
  // versus when the renderer starts listening, so the harness has to reproduce
  // main's timing exactly; a send issued from the check body would arrive long
  // after the renderer had settled and could never fail.
  win.webContents.on('did-finish-load', () => {
    pushDefaultPreset(win.webContents, layoutStore)
  })

  // Check 24 needs boot reconciliation exercised end to end, not stubbed: a
  // real PTY for s01 exists BEFORE the window ever loads, so when the
  // renderer boots and calls window.canvas.pty.list() it genuinely finds
  // s01 already running and the other eleven seed panels genuinely absent —
  // the same asymmetry a real relaunch after a Cmd+R would produce.
  //
  // EXPECTED STDERR, not a bug: this run prints
  //   Error occurred in handler for 'pty:create': Error: panel s01 already has
  //   a live PTY
  // once, right after the window loads. The seeded session below is never
  // torn down, so when the renderer promotes s01 it asks main to create a PTY
  // that already exists. Production never reaches that state — a real reload
  // runs detachAll() first, which empties the manager's map while the tmux
  // session survives, so the renderer's create reattaches instead of
  // colliding. The rejection is handled (the panel goes on using the live
  // session), so the line is noise from a fixture shortcut, not a defect.
  await ptyManager.create({ panelId: 's01', cwd: '~' })

  // A hung infrastructure call (e.g. a renderer crash mid-executeJavaScript)
  // must fail the run, not hang it forever — which is exactly what happened
  // in this file's own RED run, when a rejected pty:list left the async body
  // stuck with no path to app.exit(). This is the backstop for that class of
  // failure, not a substitute for fixing the specific cause when it recurs.
  // Assigned by check 26 and torn down in the finally below, so a failure
  // anywhere in between still ends with kill-server on the private socket.
  let tmuxBackend = null

  let watchdogFired = false
  const watchdog = setTimeout(() => {
    watchdogFired = true
    console.error(`\nFAIL  watchdog — run did not finish within ${WATCHDOG_MS}ms`)
    ptyManager.killAll()
    app.exit(1)
  }, WATCHDOG_MS)

  try {
    await win.loadFile(join(__dirname, '..', 'out', 'renderer', 'index.html')).catch(() => {})
    const wc = win.webContents

    // Check 32's evidence, SAMPLED here and asserted at the end of the run
    // beside the other preset checks. It cannot be asserted where it is
    // numbered: check 29 deliberately pushes a PRESET_DEFAULT of its own, so
    // by then the boot value is gone. Nothing between here and the load above
    // sends PRESET_DEFAULT — the only push is main's own did-finish-load one,
    // which is the whole point.
    const bootDefault = await waitUntil(async () => await wc.executeJavaScript(
      `window.__m5aDefaultSpec ? (window.__m5aDefaultSpec() || null) : null`), 3000)

    // ---------------------------------------------------------------------
    // 18. THE HEADLINE PROMISE of M4b's dormancy work: relaunch a restored
    // canvas, pan across all of it, zero NEW processes spawn beyond what
    // boot reconciliation already reattached. Numbered 18 (after every other
    // check in this file) but it has to RUN here, before the wake-everything
    // step immediately below — checks 1-17 predate dormancy and need every
    // fixture panel already awake (see the comment on that step), so this is
    // the only place in the file where the fixture is still genuinely
    // dormant. Execution order and numbering diverge here on purpose; do not
    // "tidy" this block down next to its number, that would silently delete
    // the only real-renderer coverage of dormancy itself.
    //
    // As of M4c, s01 already has a live tmux session (seeded via
    // ptyManager.create() before the window loaded, above), so boot
    // reconciliation reattaches it — LIVE_AT_BOOT.length live sessions and a
    // live terminal at boot, not zero. "Waking one panel" below now targets
    // s02, a genuinely still-dormant on-screen panel, so this check keeps
    // proving what it always proved: nothing spawns beyond what the user (or
    // an existing session) actually asked for.
    // ---------------------------------------------------------------------
    {
      // registry.ensure() runs synchronously during the initial render (a
      // useMemo), so a session with dormant:false exists immediately — but
      // ATTACHING it (mounting the xterm host, the DOM this reads) happens in
      // TerminalPanel's mount effect, which React runs after the first paint.
      // Reading the DOM before that effect has run is a race with the boot
      // reattach itself, not a check of it — wait for it to settle instead of
      // assuming a synchronous read.
      await waitUntil(async () => (await liveCount(wc)) >= LIVE_AT_BOOT.length, 3000)
      const liveAtBoot = await liveCount(wc)
      const sessionsAtBoot = await listSessions(wc)

      const hasClickToStart = await wc.executeJavaScript(
        `Array.from(document.querySelectorAll('.panel__card-idle'))
          .some((el) => el.textContent === 'click to start')`
      )

      // 24. Boot reconcile: the two restore states asserted AGAINST EACH
      // OTHER, because it is their distinction that is new. A panel with a
      // live session (s01, seeded via ptyManager.create() before the window
      // ever loaded, above) must come back attached; one without must come
      // back dormant. Checking only the first half would pass for an
      // implementation that reattaches everything and re-spawns the whole
      // canvas on launch — exactly the behaviour M4b's dormancy work exists
      // to prevent. Must run HERE, at genuine boot state, before the "wake
      // one" step below clears s02's dormancy and the "wake every panel"
      // step further down clears the rest — either would erase the very
      // distinction this check exists to catch.
      {
        const state = await wc.executeJavaScript(`(() => {
          const sessions = window.__m4aSessions ? window.__m4aSessions() : []
          return JSON.stringify(sessions)
        })()`)
        const sessions = JSON.parse(state)
        const withLive = sessions.filter((s) => LIVE_AT_BOOT.includes(s.id))
        const without = sessions.filter((s) => !LIVE_AT_BOOT.includes(s.id))
        ok('24 a panel with a live session restores non-dormant while one without stays dormant',
          withLive.length > 0 && withLive.every((s) => s.dormant === false) &&
            without.length > 0 && without.every((s) => s.dormant === true),
          `live=${JSON.stringify(withLive)} rest=${without.length} dormant=${without.filter((s) => s.dormant).length}`)
      }

      // Wake exactly one still-dormant panel (its title bar — the real
      // affordance), while the camera is still at its boot position so the
      // clicked panel (s02, at world (800,0) — on screen under
      // DEFAULT_CAMERA same as s01) is actually eligible to promote. Waking
      // only clears dormancy; assignTiers still has to find the panel on
      // screen before it promotes and attachSlot spawns it, exactly like a
      // real click would require the panel to be visible. s01 is
      // deliberately NOT the target here — it is already live at boot (see
      // above), so clicking it would be a dormancy no-op and prove nothing.
      await wc.executeJavaScript(`
        const chrome18 = document.querySelector('[data-panel-id="s02"] .panel__chrome')
        const r18 = chrome18.getBoundingClientRect()
        const opts18 = {
          bubbles: true, button: 0, buttons: 1,
          clientX: r18.left + r18.width / 2, clientY: r18.top + r18.height / 2
        }
        chrome18.dispatchEvent(new MouseEvent('mousedown', opts18))
        document.dispatchEvent(new MouseEvent('mouseup', { ...opts18, buttons: 0 }))
        true
      `)
      const bootCount = sessionsAtBoot.length
      const sessionsAfterWakeOne = await waitUntil(async () => {
        const list = await listSessions(wc)
        return list.length > bootCount ? list : false
      }, 4000)

      // Now pan the camera across the whole fixture — SEED_PANELS spans
      // roughly x: -900..3300, y: -640..1740 — the same background wheel-pan
      // check 12 already uses below, just larger and in both directions. The
      // ten still-dormant panels drift through the viewport during this; if
      // the dormancy guard in assignTiers regressed, THIS is what would
      // catch it — a process count that grows past the two live so far
      // (s01 reattached at boot, s02 woken above).
      // The final dispatch's deltas are chosen so the four sum to zero on
      // each axis: panBy is unclamped (only scale clamps), so the net
      // translation is zero and the camera ends back where checks 1-6 below
      // expect it — this check must not leave the viewport somewhere those
      // checks never anticipated.
      await wc.executeJavaScript(`
        const canvasEl18 = document.querySelector('.canvas')
        const wheelOpts18 = (dx, dy) => ({
          bubbles: true, cancelable: true, clientX: 700, clientY: 450,
          deltaX: dx, deltaY: dy, deltaMode: 0
        })
        canvasEl18.dispatchEvent(new WheelEvent('wheel', wheelOpts18(-3000, -2000)))
        canvasEl18.dispatchEvent(new WheelEvent('wheel', wheelOpts18(4500, 3200)))
        canvasEl18.dispatchEvent(new WheelEvent('wheel', wheelOpts18(-1800, 1400)))
        canvasEl18.dispatchEvent(new WheelEvent('wheel', wheelOpts18(300, -2600)))
        true
      `)
      await sleep(400)
      const sessionsAfterPan = await listSessions(wc)

      ok('18 a restored boot reattaches exactly the panels with live sessions, waking one more dormant panel spawns exactly one, and panning past the rest spawns nothing more',
        liveAtBoot === LIVE_AT_BOOT.length && sessionsAtBoot.length === LIVE_AT_BOOT.length &&
          hasClickToStart === true &&
          Array.isArray(sessionsAfterWakeOne) && sessionsAfterWakeOne.length === LIVE_AT_BOOT.length + 1 &&
          sessionsAfterPan.length === LIVE_AT_BOOT.length + 1,
        `liveAtBoot=${liveAtBoot} sessionsAtBoot=${sessionsAtBoot.length} clickToStart=${hasClickToStart} ` +
          `sessionsAfterWakeOne=${JSON.stringify(sessionsAfterWakeOne)} sessionsAfterPan=${sessionsAfterPan.length}`)
    }

    // SEED_PANELS is loaded through the layout store exactly like a real
    // restored canvas, so as of M4b every one of these twelve boots dormant
    // (see lod.ts/session-registry.ts) — none of them would ever promote no
    // matter how long this waited. This suite predates dormancy and uses
    // SEED_PANELS purely as tiering/promotion/budget fixture data (checks
    // 1-6), not as a dormancy test — lod.ts and verify:registry already cover
    // dormancy itself. Click every title bar once, the same affordance a
    // real user has, to wake them all before any tiering assertion runs.
    await wc.executeJavaScript(`
      Array.from(document.querySelectorAll('.panel__chrome')).forEach((chrome) => {
        const r = chrome.getBoundingClientRect()
        const opts = {
          bubbles: true, button: 0, buttons: 1,
          clientX: r.left + r.width / 2, clientY: r.top + r.height / 2
        }
        chrome.dispatchEvent(new MouseEvent('mousedown', opts))
        document.dispatchEvent(new MouseEvent('mouseup', { ...opts, buttons: 0 }))
      })
      true
    `)

    // Shells must actually spawn; wait for the first live terminal rather
    // than guessing how long that takes.
    await waitUntil(async () => (await liveCount(wc)) > 0, 6000)

    const live = await liveCount(wc)
    const cards = await cardCount(wc)
    const sessionsBefore = await settledSessionMap(wc)
    ok('1 on-screen panels are live terminals with off-screen panels carded',
      live > 0 && cards > 0, `live=${live} cards=${cards}`)

    ok('2 live panels never exceed the context budget', live <= 8, `live=${live}`)

    // Cmd+1 fits every panel on screen, which drops scale far below
    // LIVE_MIN_SCALE and must demote everything unfocused. Wait on the
    // actual demotion instead of a flat sleep; DEMOTE_DELAY_MS (250ms) is
    // the timer's own delay, so give real headroom above it for the effect
    // and the IPC round-trip that follows.
    await zoomTo(wc, '1')
    const liveAfterZoomOut = await waitUntil(
      async () => {
        const n = await liveCount(wc)
        return n < live ? n : false
      },
      3000
    )
    const cardsAfterZoomOut = await cardCount(wc)
    const sessionsAfterZoomOut = await sessionMap(wc)

    ok('3 zooming out demotes panels to cards',
      liveAfterZoomOut !== false && liveAfterZoomOut < live && cardsAfterZoomOut > cards,
      `live ${live} -> ${liveAfterZoomOut}, cards ${cards} -> ${cardsAfterZoomOut}`)

    {
      const { ok: preserved, changed } = pidsPreserved(sessionsBefore, sessionsAfterZoomOut)
      ok('4 demotion does not kill a single PTY',
        preserved && sessionsBefore.size > 0,
        preserved
          ? `${sessionsBefore.size} session(s) unchanged: ${[...sessionsAfterZoomOut]
              .map(([id, pid]) => `${id}=${pid}`).join(', ')}`
          : `pid mismatch: ${changed.join('; ')}`)
    }

    // Cmd+0 back to 100%: the same sessions must come back, not new ones.
    await zoomTo(wc, '0')
    await waitUntil(async () => (await liveCount(wc)) > 0, 3000)
    const sessionsAfterZoomIn = await sessionMap(wc)
    const { ok: preservedAfterZoomIn, changed: changedAfterZoomIn } =
      pidsPreserved(sessionsBefore, sessionsAfterZoomIn)
    ok('5 promotion reuses the existing sessions rather than spawning new ones',
      preservedAfterZoomIn && (await liveCount(wc)) > 0,
      preservedAfterZoomIn
        ? `${sessionsBefore.size} original session(s) all reused, ${sessionsAfterZoomIn.size} total live=${await liveCount(wc)}`
        : `pid mismatch: ${changedAfterZoomIn.join('; ')}`)

    // 6. A body click focuses the panel and reaches xterm at any zoom.
    //    This replaces M3's gate check: correction means there is no longer a
    //    band inside which mouse input is allowed and outside which it is
    //    suppressed. The focus half is unchanged and still load-bearing —
    //    typing must have somewhere to go after a click.
    {
      const probe = async () => {
        const slot = `document.querySelector('.panel__slot')`
        return wc.executeJavaScript(`(async () => {
          const slot = ${slot}
          if (!slot) return { error: 'no live panel' }
          const r = slot.getBoundingClientRect()
          const opts = {
            bubbles: true, cancelable: true, composed: true, view: window,
            clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
            button: 0, buttons: 1, detail: 1
          }
          slot.dispatchEvent(new MouseEvent('mousedown', opts))
          await new Promise((res) => setTimeout(res, 150))
          return {
            active: document.activeElement && document.activeElement.className,
            blocked: document.querySelectorAll('.panel__slot--blocked').length
          }
        })()`)
      }

      await zoomTo(wc, '0')
      const atOne = await probe()
      await zoomTo(wc, '1')
      const zoomedOut = await probe()
      await zoomTo(wc, '0')

      const focused = (r) => r && String(r.active || '').includes('xterm-helper-textarea')
      ok('6 a body click focuses the panel at any zoom, with no gate left',
        focused(atOne) && focused(zoomedOut) &&
          atOne.blocked === 0 && zoomedOut.blocked === 0,
        `1:1 active=${atOne && atOne.active} zoomed active=${zoomedOut && zoomedOut.active} ` +
        `blocked=${atOne && atOne.blocked}/${zoomedOut && zoomedOut.blocked}`)
    }

    // Used by check 8 below to focus a panel via a real OS-level click
    // (rather than a dispatched DOM event) before typing into it.
    const clickPanelBody = async (selector) => {
      const box = await wc.executeJavaScript(
        `(() => { const s = document.querySelector(${JSON.stringify(selector)});
                  if (!s) return null;
                  const r = s.getBoundingClientRect();
                  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } })()`
      )
      if (!box) throw new Error(`clickPanelBody: no element matched ${selector}`)
      wc.sendInputEvent({ type: 'mouseDown', x: box.x, y: box.y, button: 'left', clickCount: 1 })
      wc.sendInputEvent({ type: 'mouseUp', x: box.x, y: box.y, button: 'left', clickCount: 1 })
      await sleep(150) // xterm's own focus() and React's state update are synchronous-ish but not instant
      const [reachedXterm, active] = await Promise.all([
        wc.executeJavaScript(
          `(() => { const el = document.elementFromPoint(${box.x}, ${box.y});
                    return !!(el && el.closest('.xterm')) })()`
        ),
        wc.executeJavaScript(`(document.activeElement && document.activeElement.className) || ''`)
      ])
      return { reachedXterm, active }
    }

    // 7. Cmd+N. An explicit spec scope item ("a panel whose rect is centred on
    // the current viewport in world coordinates") with no coverage anywhere
    // else: without this check the shortcut could do nothing at all, or place
    // panels in screen coordinates, and every other suite would still pass.
    // Check 6 ends by resetting the camera, so this runs at INITIAL — scale 1
    // but translated {x:120,y:120}, which is what keeps the world/screen
    // conversion under test rather than degenerate.
    //
    // A DEPENDENCY this check acquired when spawns started cascading (check 51
    // below): "centred on the view" now holds only while nothing is ALREADY
    // centred there. In this window (1400x900) at INITIAL the view centre in
    // world is (580, 330), and the nearest SEED_PANELS centre is s01's
    // (360, 230) — 220 world px away, some 440x CASCADE_EPSILON. Edit
    // SEED_PANELS or DEFAULT_CAMERA so that a fixture panel lands on that
    // point and this check fails by exactly one CASCADE_STEP, which reads as a
    // centring regression and is not one.
    const panelCount = (w) => w.executeJavaScript(`document.querySelectorAll('.panel').length`)
    // Both expectations are read back out of the live DOM — the canvas host's
    // own bounds and the world layer's own transform — rather than duplicating
    // INITIAL/PANEL_W constants out of the source, which would make this pass
    // whenever the test and the code shared a wrong assumption.
    const viewCentreInWorld = (w) => w.executeJavaScript(`(() => {
      const host = document.querySelector('.canvas')
      const world = document.querySelector('.world')
      const b = host.getBoundingClientRect()
      const m = new DOMMatrixReadOnly(getComputedStyle(world).transform)
      return { x: (b.width / 2 - m.e) / m.a, y: (b.height / 2 - m.f) / m.a }
    })()`)
    const lastPanelCentreInWorld = (w) => w.executeJavaScript(`(() => {
      const all = document.querySelectorAll('.panel')
      const el = all[all.length - 1]
      if (!el) return null
      return { x: parseFloat(el.style.left) + parseFloat(el.style.width) / 2,
               y: parseFloat(el.style.top) + parseFloat(el.style.height) / 2 }
    })()`)

    const panelsBeforeSpawn = await panelCount(wc)
    const expectedCentre = await viewCentreInWorld(wc)
    await zoomTo(wc, 'n')
    const panelsAfterSpawn = await waitUntil(
      async () => {
        const n = await panelCount(wc)
        return n > panelsBeforeSpawn ? n : false
      },
      3000
    )
    const spawnedCentre = await lastPanelCentreInWorld(wc)
    // 1px: both sides come from the same getBoundingClientRect and the same
    // computed transform, so the only slack is float rounding in the matrix
    // string and sub-pixel layout. Anything larger is the centring math being
    // wrong, not measurement noise.
    const CENTRE_TOLERANCE_PX = 1
    const centred =
      spawnedCentre &&
      Math.abs(spawnedCentre.x - expectedCentre.x) <= CENTRE_TOLERANCE_PX &&
      Math.abs(spawnedCentre.y - expectedCentre.y) <= CENTRE_TOLERANCE_PX
    ok('7 Cmd+N adds a panel centred on the view in world coordinates',
      panelsAfterSpawn === panelsBeforeSpawn + 1 && centred,
      `panels ${panelsBeforeSpawn} -> ${panelsAfterSpawn}, ` +
        `centre ${JSON.stringify(spawnedCentre)} expected ${JSON.stringify(expectedCentre)}`)

    // 7b. HOLDING Cmd+N spawns exactly one panel, not one per OS key-repeat.
    //     A held key is one gesture but many keydowns: the OS emits the real
    //     press and then an auto-repeat stream at ~15/sec, and every one of
    //     them reaches useViewport's switch. Unguarded, `case 'n'` turns each
    //     repeat into a panel AND a PTY — two seconds of a held chord is
    //     thirty agents and a canvas past LIVE_BUDGET.
    //
    //     This is the ONLY check in the suite that sets `repeat` at all. Every
    //     other Cmd+N driver goes through zoomTo, whose KeyboardEvent leaves
    //     `repeat` at its false default — which is exactly why the guard could
    //     be added without touching checks 7, 17, 22, 26 or 29, and equally
    //     why none of them would have caught its absence.
    //
    //     It deliberately does NOT then spawn a real panel to prove the
    //     shortcut still works. Panel count is load-bearing state for later
    //     checks, and 17/22/26/29 all drive a plain Cmd+N successfully
    //     downstream — a guard that swallowed real presses too would take
    //     every one of them down with it.
    //
    //     What this canNOT prove: that Chromium SETS `repeat` on macOS for a
    //     Cmd-modified key. The flag is supplied by hand here, so this asserts
    //     the guard READS it. The real-app half is a manual hold test.
    await wc.executeJavaScript(`
      for (let i = 0; i < 5; i++) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', metaKey: true, repeat: true, bubbles: true }))
      }
      true
    `)
    await sleep(300)
    const panelsAfterHeld = await panelCount(wc)
    ok('7b holding Cmd+N spawns nothing further — auto-repeat is one gesture',
      panelsAfterHeld === panelsAfterSpawn,
      `${panelsAfterSpawn} -> ${panelsAfterHeld} after 5 repeat keydowns`)

    // 8. Typing reaches the focused panel's PTY. The whole input path through
    // the real SessionHandle (term.onData -> registry -> pty:write -> shell ->
    // pty:data -> term.write) is otherwise unexercised: wire onInput to the
    // wrong session, or not at all, and every panel becomes a read-only
    // terminal while every other check still passes.
    const MARKER = 'qzxv'
    const backgroundPoint = (w) => w.executeJavaScript(`(() => {
      const host = document.querySelector('.canvas')
      const b = host.getBoundingClientRect()
      for (let dy = 4; dy < b.height; dy += 20) {
        for (let dx = 4; dx < b.width; dx += 20) {
          const x = Math.round(b.left + dx), y = Math.round(b.top + dy)
          const el = document.elementFromPoint(x, y)
          if (el && host.contains(el) && !el.closest('.panel') && !el.closest('.canvas-hud')) {
            return { x, y }
          }
        }
      }
      return null
    })()`)
    const cardTexts = (w) =>
      w.executeJavaScript(
        `Array.from(document.querySelectorAll('.panel__card')).map((el) => el.textContent || '')`
      )

    await zoomTo(wc, '0') // back inside the interaction band so the click reaches xterm
    await waitUntil(async () => (await liveCount(wc)) > 0, 3000)
    const focused = await clickPanelBody('.panel__slot')
    for (const ch of MARKER) {
      // A real key event through Chromium's input pipeline, not a synthetic
      // KeyboardEvent: xterm reads typed text off its hidden textarea's input
      // event, which only a real one produces.
      wc.sendInputEvent({ type: 'keyDown', keyCode: ch })
      wc.sendInputEvent({ type: 'char', keyCode: ch })
      wc.sendInputEvent({ type: 'keyUp', keyCode: ch })
    }

    // The observation. A live panel renders through WebGL, so its text is in a
    // canvas and unreadable from the DOM; the card tier renders the SAME
    // terminal's buffer as text via handle.tail(). So: release focus (a
    // background click, which is also the only way an unconditionally-pinned
    // focused panel can ever demote), zoom out below LIVE_MIN_SCALE, and read
    // the echo back out of the card.
    const bg = await backgroundPoint(wc)
    if (!bg) throw new Error('typing check: found no background point on the canvas')
    wc.sendInputEvent({ type: 'mouseDown', x: bg.x, y: bg.y, button: 'left', clickCount: 1 })
    wc.sendInputEvent({ type: 'mouseUp', x: bg.x, y: bg.y, button: 'left', clickCount: 1 })
    await zoomTo(wc, '1')
    const echoed = await waitUntil(
      async () => (await cardTexts(wc)).find((text) => text.includes(MARKER)) ?? false,
      6000
    )
    ok('8 keystrokes reach the focused panel\'s PTY and echo back into its buffer',
      echoed !== false,
      echoed !== false
        ? `card shows ${JSON.stringify(echoed.slice(-60))}`
        : `no card contained ${MARKER} (focused activeElement was "${focused.active}")`)

    // ---------------------------------------------------------------------
    // 9. Pointer correction. Proves the corrector (Task 3's
    //    installPointerCorrection / xterm-pointer.ts) puts a click on the
    //    right cell at a zoom far from 1:1 — the exact case the deleted
    //    interaction gate used to avoid entirely by suppressing the click.
    //    This check was made green BEFORE the gate was removed (Task 4),
    //    deliberately: if this check had come after deletion, a broken
    //    corrector would have produced a wrong cell instead of a visible
    //    failure. Now that the gate is gone, this check runs with nothing
    //    masking it, and is the one proof that removal did not just hide a
    //    broken corrector.
    //
    //    The assertion is about xterm's own hit-testing: at scale 0.5 an
    //    UNCORRECTED click reports a column at twice the true offset, so a
    //    double-click lands on the wrong word (or past end-of-line, selecting
    //    nothing). Writing three well-separated words and double-clicking the
    //    middle one turns "the column is off by a factor of k" into a string
    //    comparison.
    // ---------------------------------------------------------------------
    {
      await zoomTo(wc, '0') // back to 100% before setting up

      const selection = await wc.executeJavaScript(`(async () => {
        const slot = document.querySelector('.panel__slot')
        if (!slot) return { error: 'no live panel' }

        // Focus this panel FIRST. assignTiers pins the focused panel live
        // unconditionally, which is what keeps it from being demoted to a
        // card when the zoom drops below LIVE_MIN_SCALE below — without this
        // there is no .panel__slot left to click by the time we need one.
        slot.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        await new Promise((r) => setTimeout(r, 150))

        // Known content at known columns. Written through the session handle
        // rather than the PTY so no shell prompt or echo can shift it.
        window.__m4aWrite('\\r\\nalpha beta gamma\\r\\n')
        await new Promise((r) => setTimeout(r, 300))

        // Zoom to 50% via the canvas's own path, so the real transform is
        // what the corrector sees.
        window.dispatchEvent(new KeyboardEvent('keydown', { key: '-', metaKey: true }))
        window.dispatchEvent(new KeyboardEvent('keydown', { key: '-', metaKey: true }))
        window.dispatchEvent(new KeyboardEvent('keydown', { key: '-', metaKey: true }))
        window.dispatchEvent(new KeyboardEvent('keydown', { key: '-', metaKey: true }))
        await new Promise((r) => setTimeout(r, 300))

        const scale = window.__m4aScale()
        const screen = window.__m4aCellToScreen('beta')
        if (!screen) return { error: 'could not locate the word', scale }

        const opts = {
          bubbles: true, cancelable: true, composed: true, view: window,
          clientX: screen.x, clientY: screen.y, button: 0, buttons: 1
        }
        const target = document.elementFromPoint(screen.x, screen.y) || slot
        target.dispatchEvent(new MouseEvent('mousedown', { ...opts, detail: 1 }))
        target.dispatchEvent(new MouseEvent('mouseup', { ...opts, detail: 1, buttons: 0 }))
        target.dispatchEvent(new MouseEvent('mousedown', { ...opts, detail: 2 }))
        target.dispatchEvent(new MouseEvent('mouseup', { ...opts, detail: 2, buttons: 0 }))
        await new Promise((r) => setTimeout(r, 200))

        return { scale, text: window.__m4aSelection() }
      })()`)

      ok('9 a double-click selects the right word at 50% zoom',
        selection && selection.text === 'beta',
        `scale=${selection && selection.scale} selection=${JSON.stringify(
          selection && (selection.text ?? selection.error)
        )}`)

      await zoomTo(wc, '0')
    }

    // ---------------------------------------------------------------------
    // 10. Dragging a panel by its chrome moves it by the WORLD delta, not the
    //     screen delta, INCLUDING across a zoom that happens mid-gesture.
    //
    //     Run at a zoom other than 1 on purpose: at 1:1 a screen delta and a
    //     world delta are identical and a screen-delta implementation passes.
    //
    //     The zoom between the second and third move is what discriminates the
    //     accumulate-deltas implementation applyDrag's docstring warns about —
    //     the one that adds (p_i - p_i-1) / scale each frame. Its early
    //     increments were divided by the OLD scale, so once the transform
    //     changes its total no longer matches the origin-derived answer. It is
    //     also the only integration-level coverage of the spec's claim that a
    //     mid-drag zoom is correct by construction, so do not remove the zoom
    //     as incidental.
    //
    //     The expectation is re-derived here from the viewport read back at
    //     each end ((p - t) / s, applied to the two POINTS, never to their
    //     difference) rather than borrowed from screenToWorld, so the check
    //     does not assert production math against itself.
    //
    //     Known limit: a variant that advances BOTH originRect and originWorld
    //     every frame telescopes to exactly the same total — w(p_n) - w(p_0) —
    //     and no black-box assertion on the final rect can separate it from
    //     recompute-from-origin. It differs only in accumulated rounding.
    // ---------------------------------------------------------------------
    {
      await zoomTo(wc, '0')
      // Cmd+- four times lands near 0.48, and the mid-drag Cmd+- below takes
      // it lower still; neither number is hardcoded, because the assertion is
      // expressed against the viewports that are read back.
      for (let i = 0; i < 4; i++) await zoomTo(wc, '-')
      await sleep(200)

      const result = await wc.executeJavaScript(`(async () => {
        const chrome = document.querySelector('.panel__chrome')
        if (!chrome) return { error: 'no panel' }
        const panel = chrome.closest('.panel')
        // Copied field by field: a DOMRect's properties are non-enumerable
        // getters and would cross executeJavaScript as an empty object.
        const hostRect = document.querySelector('.canvas').getBoundingClientRect()
        const host = { left: hostRect.left, top: hostRect.top }
        const before = { x: parseFloat(panel.style.left), y: parseFloat(panel.style.top) }
        const r = chrome.getBoundingClientRect()
        const start = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
        const SCREEN_DX = 120, SCREEN_DY = 60

        const opts = (x, y, buttons) => ({
          bubbles: true, cancelable: true, composed: true, view: window,
          clientX: x, clientY: y, button: 0, buttons, detail: 1
        })
        const vpDown = window.__m4aViewport()
        chrome.dispatchEvent(new MouseEvent('mousedown', opts(start.x, start.y, 1)))
        // Several intermediate moves: a recompute-from-origin implementation
        // and an accumulate-deltas one differ only across multiple frames.
        for (let i = 1; i <= 4; i++) {
          document.dispatchEvent(new MouseEvent('mousemove',
            opts(start.x + (SCREEN_DX * i) / 4, start.y + (SCREEN_DY * i) / 4, 1)))
          await new Promise((res) => setTimeout(res, 20))
          // Zoom out once, mid-gesture, with the button still down.
          if (i === 2) {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: '-', metaKey: true }))
            await new Promise((res) => setTimeout(res, 120))
          }
        }
        document.dispatchEvent(new MouseEvent('mouseup',
          opts(start.x + SCREEN_DX, start.y + SCREEN_DY, 0)))
        await new Promise((res) => setTimeout(res, 150))

        const after = { x: parseFloat(panel.style.left), y: parseFloat(panel.style.top) }
        return {
          before, after, host, start, SCREEN_DX, SCREEN_DY,
          vpDown, vpUp: window.__m4aViewport()
        }
      })()`)

      // (p - t) / s on each endpoint under ITS OWN viewport, then subtract.
      const toWorld = (p, vp, host) => ({
        x: (p.x - host.left - vp.x) / vp.scale,
        y: (p.y - host.top - vp.y) / vp.scale
      })
      let expectedX = null, expectedY = null, gotX = null, gotY = null, zoomed = false
      if (result && !result.error) {
        const from = toWorld(result.start, result.vpDown, result.host)
        const to = toWorld(
          { x: result.start.x + result.SCREEN_DX, y: result.start.y + result.SCREEN_DY },
          result.vpUp, result.host)
        expectedX = to.x - from.x
        expectedY = to.y - from.y
        gotX = result.after.x - result.before.x
        gotY = result.after.y - result.before.y
        zoomed = result.vpDown.scale !== result.vpUp.scale
      }
      ok('10 a chrome drag moves the panel by the world delta, across a mid-drag zoom',
        result && !result.error && zoomed &&
          Math.abs(gotX - expectedX) < 1 && Math.abs(gotY - expectedY) < 1,
        `scale ${result && result.vpDown && result.vpDown.scale} -> ` +
        `${result && result.vpUp && result.vpUp.scale} ` +
        `moved ${gotX},${gotY} expected ${expectedX},${expectedY}`)

      await zoomTo(wc, '0')
    }

    // ---------------------------------------------------------------------
    // 11. A resize commits exactly once, on release. The grid must be
    //     UNCHANGED during the drag and changed after it — one SIGWINCH per
    //     gesture, not one per frame. A full-screen agent TUI repaints on
    //     every SIGWINCH, so this is about the process, not about the pixels.
    // ---------------------------------------------------------------------
    {
      await zoomTo(wc, '0')
      const result = await wc.executeJavaScript(`(async () => {
        // Pick a panel that IS live rather than whichever one happens to be
        // first: check 10 leaves its target displaced by a couple of hundred
        // world units, and inheriting that displacement would make this check
        // fail as 'panel is not live' the day the drag distance changes.
        const panel = [...document.querySelectorAll('.panel')]
          .find((p) => p.querySelector('.panel__slot') && p.querySelector('.panel__resize--se'))
        if (!panel) return { error: 'no live panel with a resize handle' }
        const handle = panel.querySelector('.panel__resize--se')
        const slot = panel.querySelector('.panel__slot')
        slot.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        await new Promise((res) => setTimeout(res, 150))

        const gridBefore = window.__m4aGrid()
        const r = handle.getBoundingClientRect()
        const start = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
        const opts = (x, y, buttons) => ({
          bubbles: true, cancelable: true, composed: true, view: window,
          clientX: x, clientY: y, button: 0, buttons, detail: 1
        })

        handle.dispatchEvent(new MouseEvent('mousedown', opts(start.x, start.y, 1)))
        for (let i = 1; i <= 4; i++) {
          document.dispatchEvent(new MouseEvent('mousemove',
            opts(start.x + 60 * i, start.y + 40 * i, 1)))
          await new Promise((res) => setTimeout(res, 40))
        }
        const gridDuring = window.__m4aGrid()
        document.dispatchEvent(new MouseEvent('mouseup', opts(start.x + 240, start.y + 160, 0)))
        await new Promise((res) => setTimeout(res, 400))
        const gridAfter = window.__m4aGrid()
        return { gridBefore, gridDuring, gridAfter }
      })()`)

      const same = (a, b) => a && b && a.cols === b.cols && a.rows === b.rows
      ok('11 a resize commits once, on release',
        result && !result.error &&
          same(result.gridBefore, result.gridDuring) &&
          !same(result.gridBefore, result.gridAfter),
        `before=${JSON.stringify(result && result.gridBefore)} ` +
        `during=${JSON.stringify(result && result.gridDuring)} ` +
        `after=${JSON.stringify(result && result.gridAfter)}`)
    }

    // ---------------------------------------------------------------------
    // 12. Wheel ownership. A wheel over the FOCUSED panel scrolls that
    //     terminal and must not move the camera; a wheel anywhere else
    //     (background OR an unfocused panel) pans and must not scroll that
    //     panel's scrollback. Without this, both handlers run on one
    //     gesture: useViewport's listener is on the canvas host and xterm's
    //     bubbles up into it — and a bubble-phase guard narrowed to "only the
    //     focused panel yields" still double-handles every OTHER panel
    //     (camera pans while its scrollback silently moves too), which is
    //     why the guard has to run in capture and stopPropagation before
    //     xterm's own target-phase handler ever sees the event.
    // ---------------------------------------------------------------------
    {
      await zoomTo(wc, '0')
      const result = await wc.executeJavaScript(`(async () => {
        const read = () => getComputedStyle(document.querySelector('.world')).transform
        const panels = [...document.querySelectorAll('.panel')].filter((p) => p.querySelector('.panel__slot'))
        if (panels.length < 2) return { error: 'need two live panels' }
        const [panelA, panelB] = panels
        const slotA = panelA.querySelector('.panel__slot')
        const slotB = panelB.querySelector('.panel__slot')
        const idB = panelB.getAttribute('data-panel-id')

        // Give panel B enough scrollback that a wheel over it would actually
        // move its viewport if xterm's handler ran — otherwise "scrollY
        // unchanged" would pass trivially on a panel with nothing to scroll.
        // __m4aWrite feeds xterm's parser directly (as pty:data would), so
        // this is 200 real buffer lines, not a shell command — no PTY round
        // trip needed to build scrollback deep enough to matter.
        slotB.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        await new Promise((res) => setTimeout(res, 150))
        const lines = Array.from({ length: 200 }, (_, i) => 'line-' + i).join('\\r\\n') + '\\r\\n'
        window.__m4aWrite(lines)
        await new Promise((res) => setTimeout(res, 300))

        // Now focus panel A for the focused/background halves of the check.
        slotA.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        await new Promise((res) => setTimeout(res, 150))

        const rA = slotA.getBoundingClientRect()
        const before = read()
        slotA.dispatchEvent(new WheelEvent('wheel', {
          bubbles: true, cancelable: true,
          clientX: rA.left + rA.width / 2, clientY: rA.top + rA.height / 2,
          deltaY: 120, deltaMode: 0
        }))
        await new Promise((res) => setTimeout(res, 200))
        const overFocused = read()

        // Now the background, which must pan.
        const canvas = document.querySelector('.canvas')
        canvas.dispatchEvent(new WheelEvent('wheel', {
          bubbles: true, cancelable: true,
          clientX: 5, clientY: 5, deltaY: 120, deltaMode: 0
        }))
        await new Promise((res) => setTimeout(res, 200))
        const overBackground = read()

        // Now an UNFOCUSED panel (B): must pan the camera AND must not move
        // that panel's own scrollback.
        //
        // xterm's own wheel listener is bound to '.xterm' (a descendant of
        // .panel__slot, which only wraps the host div). Dispatching on the
        // slot itself would make slot the event's target, and a descendant's
        // listener is never on the propagation path for its own ancestor's
        // target — so "scrollY unchanged" would pass vacuously whether or
        // not the guard actually stops it. Dispatching on '.xterm-screen'
        // (a real descendant of '.xterm') puts xterm's listener on the path,
        // the same way a real cursor position over the rendered terminal
        // would.
        const scrollBefore = window.__m4aScrollY(idB)
        const screenB = slotB.querySelector('.xterm-screen')
        if (!screenB) return { error: 'no .xterm-screen on unfocused panel' }
        const rB = screenB.getBoundingClientRect()
        // Negative deltaY (scroll UP): panel B is scrolled to the bottom of
        // 200 lines of scrollback, so a scroll-down gesture would be a no-op
        // there regardless of who owns the wheel. Scrolling up is the only
        // direction that actually moves viewportY, which is what makes
        // "unchanged" a meaningful assertion rather than a vacuous one.
        screenB.dispatchEvent(new WheelEvent('wheel', {
          bubbles: true, cancelable: true,
          clientX: rB.left + rB.width / 2, clientY: rB.top + rB.height / 2,
          deltaY: -120, deltaMode: 0
        }))
        await new Promise((res) => setTimeout(res, 200))
        const overUnfocused = read()
        const scrollAfter = window.__m4aScrollY(idB)

        // Cmd+wheel over the FOCUSED panel. canvas-input.ts reads metaKey as a
        // zoom intent exactly as it reads a trackpad pinch's synthetic ctrlKey,
        // and the spec makes a zoom gesture always the camera's — otherwise a
        // mouse user who had clicked into a panel could not zoom the canvas
        // while the cursor was over it, and Cmd, the modifier every other
        // canvas shortcut requires, would be ignored in the one place it is
        // the canvas's own claim. Dispatched LAST, after every measurement
        // above: it changes the scale, and the pan assertions above compare
        // transforms taken at a fixed one.
        const beforeMeta = read()
        slotA.dispatchEvent(new WheelEvent('wheel', {
          bubbles: true, cancelable: true, metaKey: true,
          clientX: rA.left + rA.width / 2, clientY: rA.top + rA.height / 2,
          deltaY: 120, deltaMode: 0
        }))
        await new Promise((res) => setTimeout(res, 200))
        const afterMeta = read()

        return {
          before, overFocused, overBackground, overUnfocused,
          scrollBefore, scrollAfter, beforeMeta, afterMeta
        }
      })()`)

      ok('12 a wheel over the focused terminal does not move the camera; Cmd+wheel there still zooms; every other wheel pans and does not scroll an unfocused terminal',
        result && !result.error &&
          result.overFocused === result.before &&
          result.overBackground !== result.before &&
          result.overUnfocused !== result.overBackground &&
          typeof result.scrollBefore === 'number' && result.scrollBefore > 0 &&
          result.scrollBefore === result.scrollAfter &&
          result.afterMeta !== result.beforeMeta,
        `before=${result && result.before} focused=${result && result.overFocused} ` +
        `background=${result && result.overBackground} unfocused=${result && result.overUnfocused} ` +
        `scrollBefore=${result && result.scrollBefore} scrollAfter=${result && result.scrollAfter} ` +
        `metaKey over focused: ${result && result.beforeMeta} -> ${result && result.afterMeta}`)
    }

    // ---------------------------------------------------------------------
    // 13. An idle or exited panel closes on the first click. 14. A running
    // panel needs two. 15. Closing one panel does not disturb any other,
    // including a demoted one — check 4's invariant re-asserted against the
    // new dispose(id) path.
    //
    // The setup below is what makes 15 a real NEGATIVE check rather than a
    // restatement of 13/14. dispose(id) is the second caller of pty.kill in
    // the renderer, and the failure it could introduce is killing a session
    // whose React component is not currently mounted as a live slot — exactly
    // the state a carded panel is in. So one panel is focused (assignTiers
    // pins the focused panel live unconditionally, which keeps a running panel
    // available for 14) and the camera is then zoomed out to fit, which drops
    // every other panel below LIVE_MIN_SCALE and cards it WITHOUT disposing
    // its session. Only then is the pid snapshot taken. Without this, every
    // spawned session is live when the closes happen and nothing in the block
    // requires a carded one to survive.
    // ---------------------------------------------------------------------
    {
      await zoomTo(wc, '0')
      await waitUntil(async () => (await liveCount(wc)) > 0, 6000)
      await wc.executeJavaScript(`(() => {
        const slot = document.querySelector('.panel__slot')
        if (!slot) return false
        slot.dispatchEvent(new MouseEvent('mousedown',
          { bubbles: true, cancelable: true, view: window, button: 0, buttons: 1, detail: 1 }))
        return true
      })()`)
      await sleep(200)
      // The ids that are LIVE right now. The demotion assertion below is
      // anchored to this set rather than to "some carded session survived":
      // panels the camera has never visited are carded from the start, and at
      // any given moment one of them has usually spawned at some point, so an
      // unanchored version passes by accident whether or not this block ever
      // demotes anything. Requiring a survivor that was live HERE and is a
      // card THERE is what ties the assertion to the zoom-out below.
      const liveBefore = await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')]` +
        `.filter((p) => p.querySelector('.panel__slot'))` +
        `.map((p) => p.getAttribute('data-panel-id'))`
      )
      await zoomTo(wc, '1')
      // Wait on the demotion itself, not a clock: DEMOTE_DELAY_MS holds every
      // demotion back by 250ms, so a fixed sleep here would either be a guess
      // or would snapshot the pre-demotion state.
      await waitUntil(
        async () => (await cardCount(wc)) > 0 && (await liveCount(wc)) <= 1,
        6000
      )
      const before = await settledSessionMap(wc)

      const result = await wc.executeJavaScript(`(async () => {
        const panels = [...document.querySelectorAll('.panel')]
        // A panel that never spawned: its card says "not started".
        const idle = panels.find((p) => p.querySelector('.panel__card-idle'))
        // A panel with a running pty: its badge shows a pid.
        const running = panels.find((p) => /pid /.test(p.textContent || ''))
        if (!idle || !running) return { error: 'need one idle and one running panel' }

        const idleId = idle.getAttribute('data-panel-id')
        const runningId = running.getAttribute('data-panel-id')
        const click = (el) => el.dispatchEvent(new MouseEvent('mousedown',
          { bubbles: true, cancelable: true, view: window, button: 0, buttons: 1, detail: 1 }))

        const countBefore = document.querySelectorAll('.panel').length
        click(idle.querySelector('.panel__close'))
        await new Promise((r) => setTimeout(r, 200))
        const afterIdleClose = document.querySelectorAll('.panel').length

        // Re-queried before each click rather than captured once: React keys
        // are stable so today the node survives the idle panel's removal and
        // the re-render, but a click dispatched into a detached node would
        // fail this check for a reason that has nothing to do with arming.
        click(running.querySelector('.panel__close'))
        await new Promise((r) => setTimeout(r, 200))
        const armedText = (running.querySelector('.panel__close').textContent || '').trim()
        const afterFirstClick = document.querySelectorAll('.panel').length
        click(running.querySelector('.panel__close'))
        await new Promise((r) => setTimeout(r, 300))
        const afterSecondClick = document.querySelectorAll('.panel').length

        return {
          idleId, runningId, countBefore, afterIdleClose,
          armedText, afterFirstClick, afterSecondClick
        }
      })()`)

      ok('13 an idle panel closes on the first click',
        result && !result.error && result.afterIdleClose === result.countBefore - 1,
        `${result && result.countBefore} -> ${result && result.afterIdleClose}`)

      ok('14 a running panel arms first and closes on the second click',
        result && !result.error &&
          result.afterFirstClick === result.afterIdleClose &&
          /kill/i.test(result.armedText || '') &&
          result.afterSecondClick === result.afterIdleClose - 1,
        `armed="${result && result.armedText}" ` +
        `${result && result.afterFirstClick} -> ${result && result.afterSecondClick}`)

      const runningId = result && !result.error ? result.runningId : null
      // pty.kill is async IPC, so the close may not have reached pty:list yet.
      // NOT settledSessionMap: that waits for two equal-size reads and would
      // happily settle on the PRE-kill state. Waiting on the specific id fails
      // in the safe direction anyway — an unlanded kill leaves runningId in
      // `after` and turns this check red, so it can never hide a regression.
      if (runningId) await waitUntil(async () => !(await sessionMap(wc)).has(runningId), 2000)
      const after = await sessionMap(wc)
      const survivors = new Map([...before].filter(([id]) => id !== runningId))
      const { ok: preserved, changed } = pidsPreserved(survivors, after)
      // The ids currently rendering a card. Intersected with `liveBefore` and
      // with `survivors` (which comes from pty:list) this can only name a panel
      // that was a live terminal before the zoom-out, is a card now, and still
      // holds its original pid after a sibling was closed — the negative check
      // the spec asks for. A never-started panel cards too, but has no session
      // to lose, and `survivors` excludes it.
      const cardedIds = await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')]` +
        `.filter((p) => p.querySelector('.panel__card'))` +
        `.map((p) => p.getAttribute('data-panel-id'))`
      )
      const cardedSurvivor = cardedIds.find(
        (id) => liveBefore.includes(id) && survivors.has(id) && after.has(id)
      )
      // The result/size guards matter: without them an in-page `{ error }`
      // leaves runningId null, `survivors` holds everything, nothing was
      // killed — and this check reports PASS having tested nothing.
      ok('15 closing one panel kills only that panel\'s pty, demoted siblings included',
        result && !result.error && survivors.size > 0 &&
          preserved && !after.has(runningId) && cardedSurvivor !== undefined,
        preserved
          ? `${survivors.size} session(s) unchanged (carded survivor: ${cardedSurvivor ?? 'NONE'}), ` +
            `${runningId} gone`
          : `pid mismatch: ${changed.join('; ')}`)
    }

    // ---------------------------------------------------------------------
    // 16. Selecting a panel raises it above its neighbours, and does so via
    //     zIndex rather than by reordering the DOM. The DOM-order half is the
    //     real assertion: React reconciles a reordered keyed list by MOVING
    //     nodes, which would incidentally detach a live terminal's host.
    // ---------------------------------------------------------------------
    {
      await zoomTo(wc, '0')
      const result = await wc.executeJavaScript(`(async () => {
        const ids = () => [...document.querySelectorAll('.panel')]
          .map((p) => p.getAttribute('data-panel-id'))
        const panels = [...document.querySelectorAll('.panel')]
        if (panels.length < 2) return { error: 'need two panels' }
        const zOf = (p) => parseInt(getComputedStyle(p).zIndex || '0', 10)
        // Pick the panel with the LOWEST z, so raising it is observable.
        const target = panels.reduce((lo, p) => (zOf(p) < zOf(lo) ? p : lo), panels[0])
        const id = target.getAttribute('data-panel-id')
        const domBefore = ids().join(',')
        const zBefore = zOf(target)
        const maxBefore = Math.max(...panels.map(zOf))

        target.querySelector('.panel__chrome').dispatchEvent(new MouseEvent('mousedown',
          { bubbles: true, cancelable: true, view: window, button: 0, buttons: 1, detail: 1 }))
        document.dispatchEvent(new MouseEvent('mouseup',
          { bubbles: true, cancelable: true, view: window, button: 0, buttons: 0 }))
        await new Promise((r) => setTimeout(r, 200))

        const raised = document.querySelector('[data-panel-id="' + id + '"]')
        return {
          id, zBefore, maxBefore, zAfter: zOf(raised),
          domBefore, domAfter: ids().join(',')
        }
      })()`)

      ok('16 selecting raises by z-index without reordering the DOM',
        result && !result.error &&
          result.zAfter > result.maxBefore &&
          result.domBefore === result.domAfter,
        `z ${result && result.zBefore} -> ${result && result.zAfter} ` +
        `(max was ${result && result.maxBefore}); dom stable=${
          result && result.domBefore === result.domAfter}`)
    }

    // ---------------------------------------------------------------------
    // 17. Ids stay unique once panels can be REMOVED. A length-derived id
    //     (`n${panels.length + 1}`) was sound while the array only grew;
    //     removePanel breaks it, and every consequence is silent —
    //     registry.ensure returns the EXISTING session for a repeated id, so
    //     the second panel renders the first one's handle.host (which can only
    //     live in one slot), React logs a duplicate-key warning, and
    //     setPanelRect/removePanel then act on both entries at once. Checks
    //     13/14 have already closed two panels by this point, which is exactly
    //     the state that makes the length counter run back over ids it has
    //     already handed out. Three spawns, because with a length counter the
    //     first one lands in the gap the closes opened and only the ones after
    //     it collide.
    // ---------------------------------------------------------------------
    {
      await zoomTo(wc, '0')
      const countBefore = await wc.executeJavaScript(
        `document.querySelectorAll('.panel').length`
      )
      for (let i = 0; i < 3; i++) {
        await zoomTo(wc, 'n')
        await sleep(250)
      }
      const ids = await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`
      )
      const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i)
      ok('17 spawning after a close never reuses a panel id',
        ids.length === countBefore + 3 && duplicates.length === 0,
        `${countBefore} -> ${ids.length} panels, duplicates=[${duplicates.join(', ')}]`)
    }

    // ---------------------------------------------------------------------
    // 19. A change made in the renderer reaches layout.json. Without this the
    //     whole milestone can look correct in a single session and persist
    //     nothing to disk — every check above exercises panels.ts state, none
    //     of them ever open the file main actually wrote.
    //
    //     Modelled on check 10's drag (chrome mousedown, a couple of moves,
    //     mouseup), but at a fixed zoom rather than across one, since the
    //     point here is the write path, not applyDrag's mid-gesture math. The
    //     panel to drag and its rect are both read from the live DOM right
    //     before the drag, not assumed, because by this point in the file
    //     checks 1-17 have moved, zoomed, closed, and spawned panels — there
    //     is no absolute coordinate left that is still safe to hardcode.
    // ---------------------------------------------------------------------
    {
      await zoomTo(wc, '0')
      const dragged = await wc.executeJavaScript(`(async () => {
        const chrome = document.querySelector('.panel__chrome')
        if (!chrome) return { error: 'no panel' }
        const panel = chrome.closest('.panel')
        const id = panel.getAttribute('data-panel-id')
        const before = { x: parseFloat(panel.style.left), y: parseFloat(panel.style.top) }
        const r = chrome.getBoundingClientRect()
        const start = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
        const DX = 137, DY = 42

        const opts = (x, y, buttons) => ({
          bubbles: true, cancelable: true, composed: true, view: window,
          clientX: x, clientY: y, button: 0, buttons, detail: 1
        })
        const scale = window.__m4aViewport().scale
        chrome.dispatchEvent(new MouseEvent('mousedown', opts(start.x, start.y, 1)))
        document.dispatchEvent(new MouseEvent('mousemove', opts(start.x + DX, start.y + DY, 1)))
        await new Promise((res) => setTimeout(res, 20))
        document.dispatchEvent(new MouseEvent('mouseup', opts(start.x + DX, start.y + DY, 0)))
        await new Promise((res) => setTimeout(res, 150))

        const after = { x: parseFloat(panel.style.left), y: parseFloat(panel.style.top) }
        return { id, before, after, scale, DX, DY }
      })()`)

      let moved = null
      let expectedX = null
      let expectedY = null
      if (dragged && !dragged.error) {
        // No translation term needed: at a fixed scale the viewport's
        // translation cancels out of a SCREEN DELTA the same way it cancels
        // in applyDrag itself (see check 10) — only the scale divides it.
        expectedX = dragged.before.x + dragged.DX / dragged.scale
        expectedY = dragged.before.y + dragged.DY / dragged.scale

        // The store writes on a 500ms debounce; flushSync is what before-quit
        // calls. Polled rather than a single flush immediately after the drag
        // because the renderer's save() effect and the IPC call it makes are
        // both async relative to the executeJavaScript that already resolved
        // above — flushing before that IPC lands would read a stale file once
        // and never retry.
        moved = await waitUntil(async () => {
          flushLayoutStore()
          if (!existsSync(LAYOUT_PATH)) return null
          const saved = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8'))
          const panel = saved.workspaces[0].panels.find((p) => p.id === dragged.id)
          return panel ?? null
        }, 5000)
      }

      ok('19 a panel dragged in the renderer is written to layout.json',
        dragged && !dragged.error && moved !== null &&
          Math.abs(moved.x - expectedX) < 1 && Math.abs(moved.y - expectedY) < 1,
        dragged && !dragged.error
          ? `id=${dragged.id} expected=(${expectedX && expectedX.toFixed(1)},${expectedY && expectedY.toFixed(1)}) saved=${JSON.stringify(moved)}`
          : JSON.stringify(dragged))
    }

    // ---------------------------------------------------------------------
    // 20. ONE undo per gesture, not one per frame. A drag emits ~60 setPanels
    //     calls; if each pushed history, undoing a single drag would take
    //     sixty Cmd+Z presses and the feature would be unusable without ever
    //     failing a check. Modelled on check 19's drag (chrome mousedown, a
    //     move, mouseup) — the panel and its rect are both read from the live
    //     DOM right before the drag, since by this point checks 1-19 have
    //     already moved, zoomed, closed, and spawned panels.
    // ---------------------------------------------------------------------
    {
      await zoomTo(wc, '0')
      const dragged = await wc.executeJavaScript(`(async () => {
        const chrome = document.querySelector('.panel__chrome')
        if (!chrome) return { error: 'no panel' }
        const panel = chrome.closest('.panel')
        const id = panel.getAttribute('data-panel-id')
        const before = { x: parseFloat(panel.style.left), y: parseFloat(panel.style.top) }
        const r = chrome.getBoundingClientRect()
        const start = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
        const DX = 200, DY = 120

        const opts = (x, y, buttons) => ({
          bubbles: true, cancelable: true, composed: true, view: window,
          clientX: x, clientY: y, button: 0, buttons, detail: 1
        })
        chrome.dispatchEvent(new MouseEvent('mousedown', opts(start.x, start.y, 1)))
        document.dispatchEvent(new MouseEvent('mousemove', opts(start.x + DX, start.y + DY, 1)))
        await new Promise((res) => setTimeout(res, 20))
        document.dispatchEvent(new MouseEvent('mouseup', opts(start.x + DX, start.y + DY, 0)))
        await new Promise((res) => setTimeout(res, 150))

        const after = { x: parseFloat(panel.style.left), y: parseFloat(panel.style.top) }
        return { id, before, after }
      })()`)

      await wc.executeJavaScript(`window.__m4bUndo()`)
      await sleep(150)
      const undone = dragged && !dragged.error
        ? await wc.executeJavaScript(`(() => {
            const panel = document.querySelector('[data-panel-id="${dragged.id}"]')
            return panel && { x: parseFloat(panel.style.left), y: parseFloat(panel.style.top) }
          })()`)
        : null

      ok('20 one drag is one undo',
        dragged && !dragged.error && undone &&
          dragged.after.x !== dragged.before.x &&
          Math.abs(undone.x - dragged.before.x) < 1 &&
          Math.abs(undone.y - dragged.before.y) < 1,
        `before=${JSON.stringify(dragged && dragged.before)} ` +
        `after=${JSON.stringify(dragged && dragged.after)} undone=${JSON.stringify(undone)}`)
    }

    // ---------------------------------------------------------------------
    // 21. Undoing a close brings the panel back DORMANT. Its PTY was killed
    //     on the click that closed it and there is nothing to revive, so the
    //     honest restoration is the geometry plus a card that asks before
    //     starting again. Modelled on checks 13-14's close (a mousedown on
    //     .panel__close), but on an IDLE panel specifically — a running panel
    //     needs an arm-then-confirm second click before it closes at all,
    //     which is a different gesture this check is not about.
    // ---------------------------------------------------------------------
    {
      const countBefore = await panelCount(wc)
      const closed = await wc.executeJavaScript(`(() => {
        const panels = [...document.querySelectorAll('.panel')]
        const idle = panels.find((p) => p.querySelector('.panel__card-idle'))
        if (!idle) return { error: 'no idle panel to close' }
        const id = idle.getAttribute('data-panel-id')
        idle.querySelector('.panel__close').dispatchEvent(new MouseEvent('mousedown',
          { bubbles: true, cancelable: true, view: window, button: 0, buttons: 1, detail: 1 }))
        return { id }
      })()`)
      await sleep(200)
      const countClosed = await panelCount(wc)

      await wc.executeJavaScript(`window.__m4bUndo()`)
      const restored = closed && !closed.error
        ? await waitUntil(
            () => wc.executeJavaScript(
              `(() => { const p = document.querySelector('[data-panel-id="${closed.id}"] .panel__card-idle'); return p && p.textContent })()`
            ), 2000)
        : null
      const countRestored = await panelCount(wc)

      ok('21 undoing a close restores the panel dormant',
        closed && !closed.error &&
          countClosed === countBefore - 1 &&
          countRestored === countBefore &&
          restored === 'click to start',
        `id=${closed && closed.id} ${countBefore} -> ${countClosed} -> ${countRestored} card="${restored}"`)
    }

    // ---------------------------------------------------------------------
    // 22. Undo of a spawn kills the PTY it created. applyHistory used to only
    //     touch React state (setPanels/setDormantIds/setSelectedId/
    //     setFocusedId) and never called registry.dispose — Cmd+N followed by
    //     Cmd+Z removed the panel from the DOM while its real child process
    //     kept running with no panel left to click a close button on, and the
    //     next action clears `future` so redo cannot resurrect it either.
    //     Modelled on check 7's Cmd+N spawn and check 20's undo, but read
    //     through pty:list (sessionMap) rather than the DOM: a leaked PTY is
    //     by construction invisible in the DOM, which is the whole bug.
    // ---------------------------------------------------------------------
    {
      // By this point in the suite, checks 1-21 have already spawned enough
      // panels that LIVE_BUDGET (8) is at or near capacity, and assignTiers
      // breaks ties among equally-never-focused eligible panels by
      // declaration order — a brand-new panel is always LAST in that order,
      // so it can lose the budget race to panels already on screen and never
      // go live at all, which would make this check about promotion timing
      // instead of about the leak. Reset zoom, then pan somewhere far outside
      // every existing panel's coordinates (SEED_PANELS/drags/prior spawns
      // all stay within roughly -1000..5000 on both axes) so the new panel is
      // the ONLY eligible one when it spawns and wins the budget trivially.
      await zoomTo(wc, '0')
      await wc.executeJavaScript(`
        document.querySelector('.canvas').dispatchEvent(new WheelEvent('wheel', {
          bubbles: true, cancelable: true, clientX: 700, clientY: 450,
          deltaX: -200000, deltaY: -200000, deltaMode: 0
        }))
        true
      `)
      const idsBefore = new Set(
        await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`
        )
      )
      const sessionsBeforeSpawn = await sessionMap(wc)
      await zoomTo(wc, 'n')
      const idsAfter = await waitUntil(async () => {
        const ids = await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`
        )
        return ids.length > idsBefore.size ? ids : false
      }, 3000)
      const newId = idsAfter ? idsAfter.find((id) => !idsBefore.has(id)) : undefined

      // Cmd+N's panel is centred on the current view, so it is on-screen and
      // therefore live — but the PTY spawns once tiering promotes and attaches
      // it, not synchronously with the keypress, so wait for it to actually
      // reach pty:list before asserting anything about undo.
      const sessionsAfterSpawn = newId
        ? await waitUntil(async () => {
            const map = await sessionMap(wc)
            return map.has(newId) ? map : false
          }, 3000)
        : null
      const newPid = sessionsAfterSpawn ? sessionsAfterSpawn.get(newId) : undefined

      await wc.executeJavaScript(`window.__m4bUndo()`)
      // waitUntil returns whatever the poll function last produced, which on
      // a timeout is the boolean `false` it returns while still waiting — not
      // a Map — so the wait itself only yields a boolean and the final map is
      // read separately for reporting/size comparison.
      const undoRemovedInTime = newId
        ? Boolean(
            await waitUntil(async () => !(await sessionMap(wc)).has(newId), 3000)
          )
        : false
      const sessionsAfterUndo = await sessionMap(wc)

      ok('22 undo of a spawn kills the leaked pty',
        newId !== undefined &&
          sessionsAfterSpawn !== null && typeof newPid === 'number' &&
          undoRemovedInTime &&
          sessionsAfterUndo.size === sessionsBeforeSpawn.size,
        `newId=${newId} pid=${newPid} sessionsBeforeSpawn=${sessionsBeforeSpawn.size} ` +
        `afterSpawn=${sessionsAfterSpawn && sessionsAfterSpawn.size} afterUndo=${sessionsAfterUndo.size}`)
    }

    // ---------------------------------------------------------------------
    // 23. Reset must never leave a blank canvas. layoutStore.reset() only
    //     clears the STORED camera; before this check existed, nothing
    //     exercised the renderer's reset handler at all (the confirmation
    //     dialog cannot be driven headlessly), so a whole-branch review is
    //     what caught it, not a suite. Pan far from the origin first — the
    //     failure mode is exactly a distant camera left behind while
    //     firstRunPanels() places its one panel at world (0,0) — then reset
    //     and assert the camera actually came back, alongside the other two
    //     properties a reset promises: exactly one panel, and every PTY that
    //     existed before the reset is gone.
    //
    //     "No orphaned PTYs" is checked as "none of the PRE-reset session ids
    //     survive", not as "pty:list is empty" — firstRunPanels()'s one panel
    //     is deliberately NOT dormant (see panels-persistence's "Panels that
    //     came from disk start dormant; first-run panels do not"), so once
    //     the camera reset above lands it on screen, it legitimately spawns
    //     its own fresh shell, same as a real first launch. Asserting zero
    //     sessions would fail on that correct behaviour, not catch a bug.
    // ---------------------------------------------------------------------
    {
      await zoomTo(wc, '0')
      await wc.executeJavaScript(`
        document.querySelector('.canvas').dispatchEvent(new WheelEvent('wheel', {
          bubbles: true, cancelable: true, clientX: 700, clientY: 450,
          deltaX: 5000, deltaY: 3000, deltaMode: 0
        }))
        true
      `)
      const vpBefore = await wc.executeJavaScript(`window.__m4aViewport()`)
      const sessionsBeforeReset = await sessionMap(wc)

      await wc.executeJavaScript(`window.__m4bReset()`)
      await sleep(300) // pty.kill/pty.create are async IPC; let pty:list catch up

      const countAfter = await panelCount(wc)
      const vpAfter = await wc.executeJavaScript(`window.__m4aViewport()`)
      const sessionsAfter = await sessionMap(wc)
      const survivors = [...sessionsBeforeReset.keys()].filter((id) => sessionsAfter.has(id))

      ok('23 reset returns exactly one panel, the camera to INITIAL, and kills every pre-reset PTY',
        countAfter === 1 &&
          vpAfter.x === DEFAULT_CAMERA.x && vpAfter.y === DEFAULT_CAMERA.y &&
          vpAfter.scale === DEFAULT_CAMERA.scale &&
          survivors.length === 0,
        `vpBefore=${JSON.stringify(vpBefore)} vpAfter=${JSON.stringify(vpAfter)} ` +
        `panels=${countAfter} preResetSessions=${sessionsBeforeReset.size} survivors=${survivors.length}`)
    }

    // ---------------------------------------------------------------------
    // 25. session:backend, invoked END TO END through the real bridge.
    //     verify:ipc only asserts that a handler is REGISTERED for every
    //     contract channel; it never calls one. That gap is how a structured
    //     clone failure reached runtime during M4c — the handler returned the
    //     SessionBackend itself, whose spawn() function electron cannot clone,
    //     so the channel threw for every caller while verify:ipc stayed green.
    //     Asserting the SHAPE that comes back is what closes it: a value that
    //     survived the clone and carries the two fields the HUD reads.
    // ---------------------------------------------------------------------
    {
      const info = await wc.executeJavaScript(`window.canvas.session.info()`)
      ok('25 session:backend returns a cloneable { kind, reason } over the real bridge',
        !!info && (info.kind === 'tmux' || info.kind === 'direct') &&
          typeof info.reason === 'string' && info.reason.length > 0,
        JSON.stringify(info))
    }

    // ---------------------------------------------------------------------
    // 26. THE MILESTONE'S HEADLINE PROMISE, end to end: a real renderer
    //     teardown must DETACH the tmux client and leave the session running,
    //     so the next page lands back in the same process.
    //
    //     Nothing else anywhere in the verify suites could catch its loss.
    //     verify:pty-manager 12 calls detachAll() directly on a manager with
    //     no renderer anywhere, so a renderer-side teardown listener never
    //     fires; verify:window 4 installs its own lambda for the same reason.
    //     The defect this check exists for lived exactly in that gap: a
    //     `window.addEventListener('beforeunload', () => registry.disposeAll())`
    //     in Canvas.tsx sent pty:kill for every panel — i.e. `tmux
    //     kill-session` — and it WON the race, arriving before
    //     did-start-navigation's detachAll() ever ran. Every unit-level check
    //     stayed green while Cmd+R destroyed the user's agents.
    //
    //     Runs LAST on purpose: it reloads the page, which destroys the DOM
    //     and every session id the checks above were reasoning about.
    // ---------------------------------------------------------------------
    {
      const TMUX = findTmux()
      if (!TMUX) {
        // Reported, never silent: a suite that quietly covers nothing is
        // worse than one that says so.
        ok('26 tmux reload survival (SKIPPED — no tmux binary found)', true,
          'install tmux to cover this')
      } else {
        // The space in the directory name is deliberate, matching
        // verify:pty-manager: production's exitDir lives under
        // ~/Library/Application Support/..., and a space-free fixture is what
        // hid the unquoted-redirect defect for a whole milestone.
        const tmuxDir = mkdtempSync(join(tmpdir(), 'tc panels tmux '))
        const exitDir = join(tmuxDir, 'exit codes')
        mkdirSync(exitDir, { recursive: true })
        const confPath = join(tmuxDir, 'tmux.conf')
        writeFileSync(confPath, buildTmuxConf(exitDir, PANELS_SOCKET))
        tmuxBackend = createTmuxBackend({
          tmuxPath: TMUX, exitDir, confPath, reason: 'verify: tmux', socket: PANELS_SOCKET
        })
        const tmuxCli = (args) => {
          try { return execFileSync(TMUX, args, { encoding: 'utf8' }) } catch { return '' }
        }
        /** session_name -> pane pid, straight from tmux rather than from the app. */
        const socketPanes = () => {
          const out = tmuxCli(['-L', PANELS_SOCKET, 'list-panes', '-a', '-F', '#{session_name} #{pane_pid}'])
          return new Map(out.split('\n').filter((l) => l.trim()).map((l) => {
            const [name, pid] = l.trim().split(' ')
            return [name, Number(pid)]
          }))
        }

        // Everything spawned before this point used the direct backend; from
        // here the manager is the real tmux one, so the panel created below
        // becomes an actual tmux session on PANELS_SOCKET.
        backend = tmuxBackend
        // Installed HERE rather than next to the window: attachPtyLifecycle
        // fires on the FIRST navigation too, and the s01 fixture session is
        // created before win.loadFile() — wiring it up front would detach
        // that fixture during the initial load and take checks 18/24 with it.
        attachPtyLifecycle(win, () => ptyManager.detachAll())

        const idsBefore = new Set(await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`))
        await zoomTo(wc, 'n')
        const idsAfter = await waitUntil(async () => {
          const ids = await wc.executeJavaScript(
            `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
          return ids.length > idsBefore.size ? ids : false
        }, 4000)
        const newId = idsAfter ? idsAfter.find((id) => !idsBefore.has(id)) : undefined

        // Wait for tmux ITSELF to report the session — pty:create resolving
        // only means the client was spawned, and the assertion below is about
        // what is on the socket, so that is what has to be observed here too.
        const panesBefore = newId
          ? await waitUntil(async () => {
              const panes = socketPanes()
              return panes.has(newId) ? panes : false
            }, 8000)
          : null
        const pidBefore = panesBefore ? panesBefore.get(newId) : undefined

        // The real thing: a renderer teardown that skips React cleanup,
        // exactly like Cmd+R.
        const reloaded = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload()
        await reloaded
        // beforeunload's pty:kill would already have landed by now (it is
        // sent before the navigation even starts), but give the kill-session
        // it turns into time to be observable rather than racing the read.
        await sleep(1500)

        const panesAfter = socketPanes()
        const pidAfter = newId ? panesAfter.get(newId) : undefined

        ok('26 a renderer reload detaches the client and leaves the tmux session running the SAME process',
          newId !== undefined && panesBefore !== null && typeof pidBefore === 'number' &&
            pidAfter === pidBefore,
          `newId=${newId} pid ${pidBefore} -> ${pidAfter ?? 'MISSING'} ` +
          `sessions=${JSON.stringify([...panesAfter.keys()])}`)
      }
    }

    // ---------------------------------------------------------------------
    // Check 39's fixture: a still-dormant, never-spawned panel that survives
    // to the very end of the suite.
    //
    // reset() (check 23) always collapses the canvas to firstRunPanels() —
    // one fresh, non-dormant panel — so nothing seeded into the BOOT layout
    // can be that fixture; it has to be seeded AFTER reset, into whatever a
    // later reload restores from. "Dormancy is about spawning, not
    // attaching" (CLAUDE.md): a panel with no live session restores dormant
    // regardless of backend, so this reload deliberately does NOT live inside
    // check 26's `if (!TMUX)` branch — that branch, and its reload, exist
    // for what check 26 itself asserts (a tmux session outliving its
    // client), and skip together on a machine with no tmux binary. Giving
    // check 39 its own reload here, unconditionally, is what keeps it
    // passing on a machine where check 26 SKIPPED — this suite's earlier
    // draft nested this in check 26's tmux branch and check 39 hard-failed
    // wherever check 26 did, for a reason that has nothing to do with the
    // command palette.
    // ---------------------------------------------------------------------
    {
      // flushLayoutStore() lands the renderer's current on-screen state on
      // disk first, so appending below — rather than replacing wholesale via
      // layoutStore.save() — cannot drop whatever panels are actually live.
      flushLayoutStore()
      const onDisk = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8'))
      const ws = onDisk.workspaces.find((w) => w.id === onDisk.activeWorkspaceId) || onDisk.workspaces[0]
      const maxZ = ws.panels.reduce((m, p) => Math.max(m, p.z), 0)
      ws.panels.push({
        id: NEVER_WOKEN_ID,
        // Far outside anything any later check's camera ever frames or
        // clicks, including check 30's unqualified background mousedown.
        // 720x460 matches PANEL_W/PANEL_H — hardcoded rather than imported,
        // since the exact box size is irrelevant here (nothing reads it)
        // and importing it would be one more coupling for no benefit.
        x: 50000, y: 50000, w: 720, h: 460, z: maxZ + 1,
        cwd: '~', args: ['-l']
      })
      writeFileSync(LAYOUT_PATH, JSON.stringify(onDisk, null, 2), 'utf8')
      // layout:load answers from layoutStore's in-memory snapshot, not a
      // fresh disk read (see main/ipc.ts) — without re-loading here, the
      // reload below would restore the file as it was before this push.
      layoutStore.load()

      // No live PTY exists (or ever will) for NEVER_WOKEN_ID under EITHER
      // backend, so boot reconciliation after this reload restores it
      // dormant regardless of whether check 26 ran the tmux branch above or
      // skipped it — this reload needs nothing check 26 set up.
      const reloaded = new Promise((resolve) => wc.once('did-finish-load', resolve))
      wc.reload()
      await reloaded
      // Boot reconciliation (pty:list, then registry.ensure for every
      // restored panel) runs after first paint, not synchronously with
      // did-finish-load; wait on the fixture actually showing up rather than
      // a guessed sleep.
      await waitUntil(async () => {
        const sessions = await wc.executeJavaScript(`window.__m4aSessions ? window.__m4aSessions() : []`)
        return sessions.some((s) => s.id === NEVER_WOKEN_ID) || false
      }, 4000)
    }

    /* ---- M5a presets ---- */

    // /bin/cat, not /bin/echo: check 26 swaps the manager onto the real tmux
    // backend WHEN TMUX IS PRESENT, and skips (leaving the direct backend in
    // place) when it is not — so checks 27-31 may run against either. Under
    // EITHER backend a process that exits immediately leaves pty:list before
    // check 28 can watch undo dispose it. cat with no args blocks on stdin
    // and stays alive for the whole suite.
    const CLAUDE_TEMPLATE = { cwd: '/tmp', command: '/bin/cat', args: [], w: 400, h: 300 }

    {
      const idsBefore = new Set(await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`))
      const vp = await wc.executeJavaScript(`window.__m4aViewport()`)
      wc.send(IPC_EVENTS.PRESET_SPAWN, CLAUDE_TEMPLATE)
      const ids = await waitUntil(async () => {
        const now = await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
        return now.length > idsBefore.size ? now : false
      }, 3000)
      const newId = ids ? ids.find((id) => !idsBefore.has(id)) : undefined
      const spec = newId ? await wc.executeJavaScript(`window.__m5aSpecOf(${JSON.stringify(newId)})`) : null
      ok('27 PRESET_SPAWN makes a panel with the preset cwd, command and box',
        spec !== null && spec.spec.cwd === '/tmp' && spec.spec.command === '/bin/cat' &&
          spec.spec.panelId === newId && spec.rect.w === 400 && spec.rect.h === 300,
        `spec=${JSON.stringify(spec)} vp=${JSON.stringify(vp)}`)
      // Under the real tmux backend (checks 27-31 run after check 26 has
      // swapped it in), pty:create resolving is not the same moment the new
      // session shows up in `tmux list-sessions` — there is a beat between
      // the client attaching and the socket reflecting it. Check 28 takes its
      // OWN "before" snapshot via sessionMap next, and without waiting here
      // first, that snapshot can race ahead of this session's registration
      // and miss it, then "discover" it only after check 28's own spawn/undo
      // has already run — inflating its "after" count for a reason that has
      // nothing to do with undo/dispose. Settling here, not loosening check
      // 28's assertion, is the fix: it targets the actual race.
      if (newId) await waitUntil(async () => (await sessionMap(wc)).has(newId), 3000)
    }

    {
      const idsBefore = new Set(await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`))
      const sessionsBefore = await sessionMap(wc)
      wc.send(IPC_EVENTS.PRESET_SPAWN, CLAUDE_TEMPLATE)
      const ids = await waitUntil(async () => {
        const now = await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
        return now.length > idsBefore.size ? now : false
      }, 3000)
      const newId = ids ? ids.find((id) => !idsBefore.has(id)) : undefined
      const spawned = newId
        ? await waitUntil(async () => (await sessionMap(wc)).has(newId), 3000)
        : false
      await wc.executeJavaScript(`window.__m4bUndo()`)
      const gone = newId
        ? Boolean(await waitUntil(async () => !(await sessionMap(wc)).has(newId), 3000))
        : false
      const after = await sessionMap(wc)
      ok('28 undo of a preset spawn removes the panel AND disposes its session',
        newId !== undefined && spawned && gone && after.size === sessionsBefore.size,
        `newId=${newId} before=${sessionsBefore.size} after=${after.size}`)
    }

    {
      wc.send(IPC_EVENTS.PRESET_DEFAULT, { cwd: '/tmp', command: '/bin/cat', args: ['-u'] })
      // Give the listener a turn before the keypress: the send is asynchronous and
      // Cmd+N reads a ref, not a promise.
      await waitUntil(async () => await wc.executeJavaScript(
        `Boolean(window.__m5aDefaultSpec && window.__m5aDefaultSpec().command === '/bin/cat')`), 3000)
      const idsBefore = new Set(await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`))
      await zoomTo(wc, 'n')
      const ids = await waitUntil(async () => {
        const now = await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
        return now.length > idsBefore.size ? now : false
      }, 3000)
      const newId = ids ? ids.find((id) => !idsBefore.has(id)) : undefined
      const spec = newId ? await wc.executeJavaScript(`window.__m5aSpecOf(${JSON.stringify(newId)})`) : null
      ok('29 PRESET_DEFAULT changes what Cmd+N spawns',
        spec !== null && spec.spec.command === '/bin/cat' &&
          spec.spec.args[0] === '-u',
        `spec=${spec && JSON.stringify(spec.spec)}`)
    }

    {
      // Focus a panel by clicking its body, then capture; then clear focus with a
      // background click and capture again. Focus release on a background click is
      // the behaviour check 8 already depends on.
      // A LIVE panel: .panel__slot exists only while tiering has the panel live —
      // a carded one renders PanelCard instead and has no slot to click. The slot's
      // own handler stopPropagation()s and calls onFocus, which is exactly the path
      // a real click takes; the canvas background handler would clear focus instead.
      const targetId = await wc.executeJavaScript(
        `document.querySelector('.panel__slot').closest('.panel').getAttribute('data-panel-id')`)
      await wc.executeJavaScript(`
        document.querySelector('.panel[data-panel-id="${targetId}"] .panel__slot')
          .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, buttons: 1 }))
        true
      `)
      const focused = await requestFromRenderer(wc, IPC_EVENTS.PRESET_CAPTURE, null)
      await wc.executeJavaScript(`
        document.querySelector('.canvas')
          .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, buttons: 1 }))
        true
      `)
      const unfocused = await requestFromRenderer(wc, IPC_EVENTS.PRESET_CAPTURE, null)
      ok('30 PRESET_CAPTURE returns the focused panel spec, and null with nothing focused',
        focused !== null && typeof focused.cwd === 'string' &&
          Array.isArray(focused.args) && typeof focused.w === 'number' &&
          unfocused === null,
        `focused=${JSON.stringify(focused)} unfocused=${JSON.stringify(unfocused)}`)
    }

    {
      const idsBefore = new Set(await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`))
      // No command at all — the login-shell case, and the one most likely to be
      // broken by a well-meaning default somewhere up the chain.
      wc.send(IPC_EVENTS.PRESET_SPAWN, { cwd: '~', args: ['-l'] })
      const ids = await waitUntil(async () => {
        const now = await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
        return now.length > idsBefore.size ? now : false
      }, 3000)
      const newId = ids ? ids.find((id) => !idsBefore.has(id)) : undefined
      const spec = newId ? await wc.executeJavaScript(`window.__m5aSpecOf(${JSON.stringify(newId)})`) : null
      // Since M6a (Task 5) the header reads status.command once main's real
      // spawn resolves, not just spec.command — so reading the title right
      // after the panel appears in the DOM (no wait for the backend) is a
      // race, not a fact. Mirror check 44's own fix for the identical race:
      // wait on sessionMap(wc) — MAIN's own pty:list — for backend
      // confirmation, then poll the title until it settles on the resolved
      // path. That keeps this a single deterministic assertion instead of
      // one that accepts two different textual outcomes and so can no
      // longer discriminate a broken resolved-path branch from a lucky race.
      const spawnedOnBackend = newId
        ? await waitUntil(async () => (await sessionMap(wc)).has(newId), 3000)
        : false
      const title = newId
        ? await waitUntil(async () => {
            const text = await wc.executeJavaScript(
              `document.querySelector('.panel[data-panel-id="${newId}"] .panel__title')?.textContent ?? ''`)
            return text.startsWith('/') ? text : false
          }, 3000)
        : false
      // The spec assertion is the load-bearing half, unchanged from before
      // M6a: a command-less PRESET_SPAWN must never get a command INJECTED
      // into the spec by a well-meaning default somewhere up the chain.
      //
      // This check needs the spawned panel actually promoted to LIVE and
      // spawning within the 3s window, and that is safe today only by
      // accident: checks 26 and 39 are reloads, a reload restores every
      // panel DORMANT ("Dormancy is about spawning, not attaching"), and
      // `lod.ts` excludes dormant panels from `eligible` — so they consume
      // no LIVE_BUDGET and leave this panel room to promote. A full budget
      // of eight in-viewport non-dormant panels ahead of it would leave it a
      // card forever and this would time out rather than fail. Checks 44 and
      // 45 spawn the same way via Cmd+N and carry the identical dependency.
      ok('31 a command-less preset stays command-less and reads as the login shell',
        spec !== null && spec.spec.command === undefined &&
          spawnedOnBackend && typeof title === 'string' && title.startsWith('/'),
        `command=${spec && JSON.stringify(spec.spec.command)} spawnedOnBackend=${spawnedOnBackend} title=${title}`)
    }

    {
      // 32. The default preset reaches the renderer AT REAL STARTUP, with the
      // harness sending nothing. Every other preset check drives the channel by
      // hand, which is exactly how the whole feature stayed inert while this
      // suite was green: main pushed at did-finish-load, Canvas.tsx subscribed
      // two awaited IPC round trips later, and the event landed with no
      // listener. Nothing complained, because makePanel's fallback is the same
      // login shell the default usually names — only a NON-shell default, like
      // this fixture's, can tell the two apart.
      ok('32 the configured default preset reaches the renderer at boot, unprompted',
        bootDefault !== null && bootDefault.command === BOOT_DEFAULT_PRESET.command &&
          bootDefault.cwd === BOOT_DEFAULT_PRESET.cwd && bootDefault.args[0] === '-v',
        `bootDefault=${JSON.stringify(bootDefault)}`)
    }

    // Checks 33-36 need a FOCUSED panel: 33's Cmd+K captures focusedId, 35's
    // __m4aCellToScreen reads the focused panel's buffer, and 36 asserts focus
    // comes back to a terminal. Check 30 deliberately ends on a background
    // click, which releases focus, and 31-32 focus nothing — so focus one here,
    // with the same .panel__slot mousedown check 30 uses (the slot's own
    // handler stopPropagation()s and calls onFocus; the canvas background
    // handler would clear focus instead). A LIVE panel, because only a live
    // panel has a .panel__slot and an xterm textarea to hand the keyboard back
    // to in check 36.
    {
      const targetId = await wc.executeJavaScript(
        `document.querySelector('.panel__slot').closest('.panel').getAttribute('data-panel-id')`)
      await wc.executeJavaScript(`
        document.querySelector('.panel[data-panel-id="${targetId}"] .panel__slot')
          .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, buttons: 1 }))
        true
      `)
      // Assert the precondition rather than assume it: checks 33-36 that ran
      // against an unfocused canvas would pass for the wrong reason.
      const focusedNow = await waitUntil(
        () => requestFromRenderer(wc, IPC_EVENTS.PRESET_CAPTURE, null), 2000)
      if (focusedNow === null) throw new Error('checks 33-36 precondition: no panel is focused')
    }

    // 33. Cmd+K opens the palette and takes DOM focus OFF the terminal.
    //     This is the whole milestone in one assertion: xterm reads its own
    //     hidden textarea and nothing else, so moving DOM focus to the input is
    //     what stops bare keys reaching the PTY — no global key swallowing
    //     required. Bound as a RENDERER keydown, not a menu accelerator, for the
    //     same reason Cmd+N is: a main-process accelerator would never receive
    //     a dispatched KeyboardEvent, so this check could not exist.
    {
      await wc.executeJavaScript(`
        document.querySelector('.panel__slot .xterm-helper-textarea')?.focus();
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
      `)
      const read = () => wc.executeJavaScript(`(() => {
        const el = document.activeElement
        return {
          open: document.querySelector('.palette') !== null,
          onInput: el !== null && el.classList.contains('palette__input'),
          onTerminal: el !== null && el.classList.contains('xterm-helper-textarea')
        }
      })()`)
      // waitUntil stops on any TRUTHY value and an object is always truthy, so
      // polling for the snapshot itself would return on the first read and
      // assert against a canvas that has not re-rendered yet. Wait on the
      // condition, then read the snapshot once.
      await waitUntil(async () => (await read()).open, 2000)
      const state = await read()
      ok('33 Cmd+K opens the palette and moves DOM focus off xterm',
        state.open && state.onInput && !state.onTerminal, JSON.stringify(state))

      // 33b. The same auto-repeat gap as 7b, one file over and with a louder
      //      symptom. Cmd+K TOGGLES, so an unguarded held chord flips the
      //      overlay open/closed at the repeat rate — a visible flicker, and
      //      worse, every re-open re-runs setCapturedId(focusedIdRef.current),
      //      so which panel the palette's rows act on ends up depending on
      //      whether the user released on an odd or an even repeat.
      //
      //      Asserted from the OPEN state on purpose: an even number of
      //      unguarded toggles would land back on "open" and read as a pass,
      //      so this sends five — odd — and a broken build closes the palette.
      //      Check 36 already proves a plain Cmd+K still closes it, and
      //      leaving it open here is what check 34 expects to run against.
      await wc.executeJavaScript(`
        for (let i = 0; i < 5; i++) {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, repeat: true, bubbles: true }))
        }
        true
      `)
      await sleep(300)
      const stillOpen = await wc.executeJavaScript(`document.querySelector('.palette') !== null`)
      ok('33b holding Cmd+K does not re-toggle the palette', stillOpen, `open=${stillOpen}`)
    }

    // 34. Canvas shortcuts stand down while it is open. Cmd+N typed while
    //     filtering must not ALSO spawn a panel — useViewport's window keydown
    //     listener sees every key regardless of what has DOM focus, so the
    //     palette has to tell it to stand down.
    {
      const before = await wc.executeJavaScript(`document.querySelectorAll('.panel').length`)
      await wc.executeJavaScript(`
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', metaKey: true, bubbles: true }))
      `)
      await sleep(300)
      const after = await wc.executeJavaScript(`document.querySelectorAll('.panel').length`)
      ok('34 Cmd+N does not spawn while the palette is open', before === after, `${before} -> ${after}`)
    }

    // 35. Cmd+V while the palette is open fills the INPUT, not the PTY. main's
    //     menu accelerator sends edit:paste unconditionally, and Canvas routes it
    //     into the focused session — so without a guard the text lands in a
    //     running agent, invisibly, while the user watches an empty text field.
    {
      const MARK = 'M5BPASTEMARK'
      wc.send('edit:paste', MARK)
      const read = () => wc.executeJavaScript(`(() => {
        const input = document.querySelector('.palette__input')
        return { inInput: input !== null && input.value.includes('${MARK}'),
                 inTerminal: window.__m4aCellToScreen('${MARK}') !== null }
      })()`)
      // The negative half is the one that needs the wait, and it is the one an
      // always-truthy poll would silently give away: read immediately and
      // 'inTerminal' is false because no PTY could have echoed yet, guard or no
      // guard. Wait for EITHER destination, then settle before the read that
      // the assertion actually uses, so a slow echo cannot hide behind a poll
      // that already returned.
      await waitUntil(async () => { const s = await read(); return s.inInput || s.inTerminal }, 2000)
      await sleep(500)
      const seen = await read()
      ok('35 a menu paste with the palette open reaches the input, not the PTY',
        seen.inInput && !seen.inTerminal, JSON.stringify(seen))
    }

    // 36. Escape closes and gives the keyboard BACK. Without this the user
    //     presses Escape, types, sees nothing happen, and concludes they
    //     mis-clicked. SessionHandle.focus() exists for exactly this.
    {
      // Read the pre-Escape state and assert it too. Without it this check
      // passes for the wrong reason when the palette never opened at all:
      // check 33 leaves DOM focus on the xterm textarea, so "closed and on a
      // terminal" is exactly what NO palette also looks like. `?.` so a
      // missing input fails this check instead of aborting the whole run.
      const before = await wc.executeJavaScript(`(() => {
        const el = document.activeElement
        return {
          open: document.querySelector('.palette') !== null,
          onInput: el !== null && el.classList.contains('palette__input')
        }
      })()`)
      await wc.executeJavaScript(`
        document.querySelector('.palette__input')
          ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        true
      `)
      const read = () => wc.executeJavaScript(`(() => {
        const el = document.activeElement
        return {
          closed: document.querySelector('.palette') === null,
          onTerminal: el !== null && el.classList.contains('xterm-helper-textarea')
        }
      })()`)
      // Wait on onTerminal, not on the snapshot and not on `closed`: `closed`
      // is also what a palette that never opened looks like, so it cannot be
      // the thing this poll waits for.
      await waitUntil(async () => (await read()).onTerminal, 2000)
      const state = await read()
      ok('36 Escape closes the palette and restores the terminal',
        before.open && before.onInput && state.closed && state.onTerminal,
        `${JSON.stringify(before)} -> ${JSON.stringify(state)}`)
    }

    // 37. Cmd+Z stands down too. Rule 3 is "canvas shortcuts stand down", and
    //     Cmd+Z is a menu accelerator on exactly the same footing as Cmd+V
    //     (main/menu.ts sends edit:undo unconditionally). With the palette open
    //     and a name half-typed, an unguarded edit:undo does not undo the
    //     TYPING: it runs applyHistory, which REMOVES a panel and disposes its
    //     session, behind the overlay, with nothing on screen to explain it —
    //     strictly worse than the paste check 35 covers.
    {
      const ids = () => wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
      // Put a known entry on the history stack rather than depending on
      // whatever the preceding checks happened to leave there: a check whose
      // undo had nothing to undo would pass without testing anything.
      const before = new Set(await ids())
      await wc.executeJavaScript(
        `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', metaKey: true, bubbles: true }))`)
      const spawned = await waitUntil(async () => {
        const now = await ids()
        return now.length > before.size ? now : false
      }, 3000)
      const newId = spawned ? spawned.find((id) => !before.has(id)) : undefined

      await wc.executeJavaScript(
        `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))`)
      await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette') !== null`), 2000)

      wc.send('edit:undo')
      await sleep(400) // nothing to wait FOR: the assertion is that nothing happens
      const survived = newId !== undefined && (await ids()).includes(newId)

      // The other half, and the reason this check cannot pass vacuously: with
      // the palette CLOSED the very same event must still undo the spawn. If
      // it does not, the guard above is not standing down, it is broken.
      await wc.executeJavaScript(`
        document.querySelector('.palette__input')
          ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        true
      `)
      await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette') === null`), 2000)
      wc.send('edit:undo')
      const undone = newId !== undefined &&
        Boolean(await waitUntil(async () => !(await ids()).includes(newId), 3000))

      ok('37 Cmd+Z does not undo behind an open palette, and still undoes once it is closed',
        survived && undone, `newId=${newId} survived=${survived} undoneAfterClose=${undone}`)
    }

    // 38. A rename made in the palette reaches the store and comes back in the
    //     next preset:list. This is the debt M5a deferred here by name: it
    //     shipped presets that could be created and picked but not renamed,
    //     because the rename needed a text field and the text field needed the
    //     focus rules that did not exist yet.
    {
      await wc.executeJavaScript(`
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
      `)
      await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette') !== null`), 2000)
      // Filter to the rename row for the user preset the layout file seeded,
      // run it, then type the new name and press Enter. React's controlled
      // <input> ignores a plain input.value = x — the native setter plus a
      // dispatched 'input' is what makes the change reach React's state, so
      // do not simplify it into an assignment.
      const renamed = await wc.executeJavaScript(`(async () => {
        const nativeSet = (input, v) => {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
          setter.call(input, v)
          input.dispatchEvent(new Event('input', { bubbles: true }))
        }
        nativeSet(document.querySelector('.palette__input'), 'rename harness')
        await new Promise((r) => setTimeout(r, 50))
        const row = [...document.querySelectorAll('.palette__row')]
          .find((r) => r.textContent.includes('Rename preset harness preset'))
        if (!row) return 'no rename row for the seeded user preset'
        if (row.className.includes('palette__row--disabled')) return 'rename row was disabled'
        row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        await new Promise((r) => setTimeout(r, 50))
        // Still an input, and now in rename mode: the row's action must have
        // reopened the palette into inputMode rather than leaving it shut.
        const input2 = document.querySelector('.palette__input')
        if (!input2) return 'palette closed instead of entering rename mode'
        if (document.querySelector('.palette__list')) return 'still in command mode'
        nativeSet(input2, 'renamed by palette')
        input2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        await new Promise((r) => setTimeout(r, 200))
        const rows = await window.canvas.preset.list()
        return rows.some((r) => r.name === 'renamed by palette')
      })()`)
      ok('38 a rename in the palette reaches the store', renamed === true, String(renamed))

      // The input mode must not outlive the rename. Palette.tsx closes BEFORE
      // calling submit, so nothing in the submit path is still on screen to
      // clear it — an uncleared mode greets the next Cmd+K with a stale text
      // field and no list. The same applies to a rename abandoned with
      // Escape, which is why both are asserted here rather than only the
      // completed one.
      await wc.executeJavaScript(`
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
      `)
      await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette') !== null`), 2000)
      const freshAfterSubmit = await wc.executeJavaScript(
        `document.querySelector('.palette__list') !== null &&
         (document.querySelector('.palette__input') || {}).value === ''`)

      // Now enter rename mode again and abandon it with Escape.
      const freshAfterCancel = await wc.executeJavaScript(`(async () => {
        const input = document.querySelector('.palette__input')
        // Guarded rather than assumed: a setter .call'd on null throws
        // "Illegal invocation", which reports as an infrastructure crash and
        // buries whichever earlier assertion actually went wrong.
        if (!input) return 'palette was not open'
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        // 'rename renamed', not 'rename harness': the preset just got a new
        // name, and the query has to be a subsequence of the row it means.
        setter.call(input, 'rename renamed')
        input.dispatchEvent(new Event('input', { bubbles: true }))
        await new Promise((r) => setTimeout(r, 50))
        const row = [...document.querySelectorAll('.palette__row')]
          .find((r) => r.textContent.includes('Rename preset renamed by palette'))
        if (!row) return 'no rename row after the rename'
        row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        await new Promise((r) => setTimeout(r, 50))
        document.querySelector('.palette__input')
          .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        await new Promise((r) => setTimeout(r, 50))
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
        await new Promise((r) => setTimeout(r, 100))
        return document.querySelector('.palette__list') !== null &&
          document.querySelector('.palette__input').value === ''
      })()`)
      ok('38b the palette reopens in command mode after a completed and a cancelled rename',
        freshAfterSubmit === true && freshAfterCancel === true,
        `afterSubmit=${freshAfterSubmit} afterCancel=${freshAfterCancel}`)
    }

    // 39. "Go to <panel>" frames a dormant panel and does NOT start its
    //     process. Waking hangs off SELECT, not focus (onSelectPanel clears
    //     dormantIds and calls registry.wake), so the obvious implementation
    //     — reuse onSelectPanel — would spawn an agent as a side effect of
    //     NAVIGATING. On a restored twelve-panel canvas that is twelve CLIs
    //     launched from a keyboard jump, which is the failure M4b's dormancy
    //     rule exists to prevent. The card still says "click to start", and
    //     it still means it.
    //
    //     Requires a dormant, never-spawned panel to still exist at this
    //     point in the run. Every SEED_PANELS id got woken by the "wake every
    //     panel" step before check 1, and reset (check 23) collapses the
    //     canvas to one fresh, non-dormant panel — so nothing seeded into the
    //     BOOT layout can be the fixture here. NEVER_WOKEN_ID is seeded
    //     instead by its own reload right after check 26 (see the comment
    //     there — deliberately NOT check 26's tmux-only reload, so this
    //     fixture exists whether or not tmux is installed), parked at world
    //     (50000, 50000) — far outside every click any later check makes,
    //     including check 30's unqualified background mousedown, which is
    //     what silently re-wakes the reset panel (p1) and is the reason p1
    //     itself is not this fixture. A null dormantId here means one of
    //     those assumptions broke, and the check fails loudly rather than
    //     silently skipping — a check that passes because it found nothing
    //     to test is worse than one that fails.
    {
      const dormantId = (await wc.executeJavaScript(`
        (window.__m4aSessions().find((s) => s.dormant && !s.spawned) || {}).id || null
      `))
      if (dormantId === null) {
        ok('39 go-to frames a dormant panel without spawning it', false,
          'no dormant, unspawned panel survived to this check — fixture assumption broke')
      } else {
        const before = await wc.executeJavaScript(`window.__m4aViewport()`)
        // Cmd+K TOGGLES (usePalette.ts) — 38b leaves the palette OPEN in
        // command mode, so a blind Cmd+K here would CLOSE it instead of
        // opening it, and everything below would silently act on a null
        // input. Only dispatch it when the palette is not already open, then
        // wait on the actual DOM state (as check 33 does) instead of a fixed
        // sleep that raced this exact toggle once already.
        await wc.executeJavaScript(`
          if (document.querySelector('.palette') === null) {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
          }
        `)
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 2000)
        await wc.executeJavaScript(`(async () => {
          const input = document.querySelector('.palette__input')
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
          setter.call(input, 'go to ${dormantId}')
          input.dispatchEvent(new Event('input', { bubbles: true }))
          await new Promise((r) => setTimeout(r, 50))
          // By TEXT, not by position: the prompt list now includes whatever
          // .claude/commands the focused panel's cwd holds, so "the first
          // row" is no longer a fact this suite controls. A row picked by
          // what it says can only ever run the command the check means.
          const row = [...document.querySelectorAll('.palette__row')]
            .find((r) => r.textContent.includes('Go to') && r.textContent.includes('${dormantId}'))
          if (row) row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        })()`)
        await sleep(400)
        const after = await wc.executeJavaScript(`window.__m4aViewport()`)
        const stillDormant = await wc.executeJavaScript(`
          (window.__m4aSessions().find((s) => s.id === '${dormantId}') || {}).spawned === false
        `)
        // WHERE the camera went, not merely that it moved: a centreOn that
        // framed the wrong panel — or the right one at the wrong scale —
        // also changes x and y, and "the viewport is not where it was" is
        // true of any pan at all. The expectation is viewport.ts's centreOn
        // recomputed here from the panel's own rect and the host's size:
        // the rect's centre lands in the middle of the canvas at the
        // UNCHANGED scale (framing must never re-zoom — verify:viewport
        // 49-50). Recomputed rather than imported because this suite loads
        // the built renderer and has no module to import from.
        const expected = await wc.executeJavaScript(`(() => {
          const rect = window.__m5aSpecOf('${dormantId}').rect
          const host = document.querySelector('.canvas').getBoundingClientRect()
          const vp = window.__m4aViewport()
          return {
            x: host.width / 2 - (rect.x + rect.w / 2) * vp.scale,
            y: host.height / 2 - (rect.y + rect.h / 2) * vp.scale
          }
        })()`)
        // Sub-pixel: the arithmetic is float, and getBoundingClientRect can
        // hand back a fractional width. A wrong-panel framing is off by
        // whole world units, so nothing this tolerance admits is a defect
        // this check could otherwise catch.
        const framed = Math.abs(after.x - expected.x) < 1 && Math.abs(after.y - expected.y) < 1
        ok('39 go-to frames a dormant panel without spawning it',
          framed && after.scale === before.scale && stillDormant === true,
          `${JSON.stringify(before)} -> ${JSON.stringify(after)} expected=${JSON.stringify(expected)} spawned=${!stillDormant}`)
      }
    }

    // 40a/40. Prompts in the palette, and the one thing about them that can
    //     fail silently.
    //
    //     40a spawns a panel by picking a preset row, which is the only
    //     end-to-end exercise of preset:spawn-by-id in this suite: the invoke
    //     has to reach the harness's onSpawnPreset stand-in, the id has to
    //     resolve to ECHO_PRESET and not to some other row the fuzzy matcher
    //     ranked first, and the template has to arrive at makePanel. It is
    //     asserted on the SPEC of the new panel, not on "a panel appeared" —
    //     the wrong preset also makes a panel appear.
    //
    //     40 is the milestone's headline requirement. session-factory.ts
    //     records the failure from Cmd+V: a raw write of a multi-line prompt
    //     into an agent TUI is one submission per newline, i.e. several
    //     partial prompts instead of one. paste() goes through xterm, which
    //     brackets it when the app has enabled mode 2004, so the block
    //     arrives as ONE input — and every prompt is multi-line, so every use
    //     of this feature depends on it.
    //
    //     The discriminator is the bracketed-paste markers. ECHO_PRESET's
    //     program enables 2004 and echoes with `cat -v`, so a paste() puts
    //     "^[[200~" in the buffer and a write() puts the bare body there.
    //     Nothing weaker can tell the two apart, because against an ordinary
    //     shell both put identical bytes on the PTY — which is why this check
    //     must never be relaxed into "the prompt text arrived".
    {
      const idsBefore = await wc.executeJavaScript(
        `window.__m4aSessions().map((s) => s.id)`
      )
      // Cmd+K TOGGLES, and check 39 above ran a row (which closes the
      // palette) — but assert the DOM state rather than trusting that, the
      // same way 39 does after 38b left the palette open.
      await wc.executeJavaScript(`
        if (document.querySelector('.palette') === null) {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
        }
      `)
      await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 2000)
      const clicked = await wc.executeJavaScript(`(async () => {
        const input = document.querySelector('.palette__input')
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setter.call(input, 'new panel from echo')
        input.dispatchEvent(new Event('input', { bubbles: true }))
        await new Promise((r) => setTimeout(r, 80))
        const row = [...document.querySelectorAll('.palette__row')]
          // M6p retitled spawn rows to the preset name alone — the words
          // "New panel from" are the section header now, and live on in the
          // row's searchText so the query above still finds it.
          .find((r) => r.textContent.includes('echo -v'))
        if (!row) return false
        row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        return true
      })()`)
      const echoId = clicked
        ? await waitUntil(async () => {
            const ids = await wc.executeJavaScript(`window.__m4aSessions().map((s) => s.id)`)
            return ids.find((id) => !idsBefore.includes(id)) || null
          }, 3000)
        : null
      const echoSpec = echoId
        ? await wc.executeJavaScript(`window.__m5aSpecOf(${JSON.stringify(echoId)})`)
        : null
      ok('40a a palette preset pick spawns that preset through preset:spawn-by-id',
        echoSpec !== null && echoSpec.spec.command === '/bin/sh' &&
          echoSpec.spec.args[0] === '-c' && echoSpec.spec.args[1].includes('2004h'),
        `${echoId} ${JSON.stringify(echoSpec && echoSpec.spec)}`)

      if (!echoId) {
        ok('40 a prompt insert arrives as a bracketed paste, not a raw write', false,
          'no panel spawned, so there was nothing to paste into')
      } else {
        // Focus it: the palette captures focusedId at OPEN time (focus is
        // released on a background click, so reading it live would be a
        // different id), and insertPrompt targets that captured panel.
        // Spawning does not focus, so this click is what makes the echo panel
        // the target — and __m4aGrid()/__m4aCellToScreen() both read the
        // focused session, so they are reading this panel from here on.
        const focused = await waitUntil(async () => {
          // Retried, not dispatched once: the panel is spawned by a setPanels
          // in another check's tick and its slot only exists once tiering has
          // promoted it, so the first click can land before there is anything
          // to click.
          await wc.executeJavaScript(`(() => {
            const slot = document.querySelector('[data-panel-id=${JSON.stringify(echoId)}] .panel__slot')
            if (slot) slot.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
          })()`)
          return wc.executeJavaScript(`window.__m4aGrid() !== null`)
        }, 5000, 200)
        // The PTY has to have run the printf before the paste, or mode 2004 is
        // still off and xterm sends the body unbracketed — a false FAIL that
        // would look exactly like a write().
        await waitUntil(async () => await wc.executeJavaScript(
          `(window.__m4aSessions().find((s) => s.id === ${JSON.stringify(echoId)}) || {}).spawned === true`
        ), 5000)
        await sleep(600)

        await wc.executeJavaScript(`
          if (document.querySelector('.palette') === null) {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
          }
        `)
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 2000)
        // Run the row with ENTER, not a click. A mousedown on a palette row
        // bubbles to .canvas's background handler, which releases focusedId —
        // the insert still targets the right panel (the palette captured it at
        // open), but __m4aCellToScreen reads the FOCUSED session and would
        // have nothing to read. The keyboard is the palette's primary path
        // anyway. The selected row's text is asserted before Enter, so this
        // cannot pass by running some other row.
        const insertRow = await wc.executeJavaScript(`(async () => {
          const input = document.querySelector('.palette__input')
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
          setter.call(input, 'insert prompt two liner')
          input.dispatchEvent(new Event('input', { bubbles: true }))
          await new Promise((r) => setTimeout(r, 120))
          const selected = document.querySelector('.palette__row--selected')
          // M6p: the title is the prompt's name alone under a PROMPTS header.
          if (!selected || !selected.textContent.includes('two liner')) {
            return selected ? selected.textContent : 'no row'
          }
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
          return true
        })()`)
        const bracketed = insertRow === true
          ? await waitUntil(
              () => wc.executeJavaScript(`window.__m4aCellToScreen('200~') !== null`),
              3000
            )
          : false
        ok('40 a prompt insert arrives as a bracketed paste, not a raw write',
          bracketed === true,
          `focused=${focused} row=${insertRow} body=${JSON.stringify(
            await wc.executeJavaScript(`window.__m4aCellToScreen('first line') !== null`)
          )}`)
      }
    }


    // 41. A MOUSE-picked palette row leaves the focused panel focused.
    //
    //     Palette mounts inside .canvas, and .canvas's onMouseDown is the
    //     background handler. Without a stopPropagation on the palette root,
    //     every mousedown in the overlay — a row pick, or a click into the
    //     input to place a caret — reaches it, and it does three things: it
    //     releases focusedId, it hit-tests the click's WORLD point and selects
    //     whatever panel lies under the overlay, and through onSelectPanel it
    //     WAKES that panel if it is dormant. A palette click that spawns a
    //     process is the exact failure M4b's dormancy rule exists to prevent.
    //
    //     Focus is the probe because it is the half that breaks the feature
    //     shipped one check up: with focusedId null, the NEXT Cmd+K captures
    //     nothing and buildCommands disables every "Insert prompt" row with
    //     REASON_NO_FOCUS. __m4aGrid() resolves through focusedIdRef, so a
    //     non-null answer is "the app still believes a live panel is focused"
    //     — which is precisely what check 40 has to route around by driving
    //     its row with Enter instead of a click.
    //
    //     The row picked is "Reset zoom": it must be a real, runnable,
    //     mouse-clicked row (the whole point), and that one touches only the
    //     camera, so nothing about the assertion depends on what it did.
    {
      const focusedBefore = await wc.executeJavaScript(`window.__m4aGrid() !== null`)
      await wc.executeJavaScript(`
        if (document.querySelector('.palette') === null) {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
        }
      `)
      await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 2000)
      const picked = await wc.executeJavaScript(`(async () => {
        const input = document.querySelector('.palette__input')
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setter.call(input, 'reset zoom')
        input.dispatchEvent(new Event('input', { bubbles: true }))
        await new Promise((r) => setTimeout(r, 120))
        const row = [...document.querySelectorAll('.palette__row')]
          .find((r) => r.textContent.includes('Reset zoom'))
        if (!row) return false
        // A REAL mousedown, bubbling exactly as a user's does — the propagation
        // is the subject of this check, so nothing here may short-circuit it.
        row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        return true
      })()`)
      await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette') === null`), 2000)
      const focusedAfter = await wc.executeJavaScript(`window.__m4aGrid() !== null`)
      ok('41 a mouse-picked palette row does not release the focused panel',
        focusedBefore === true && picked === true && focusedAfter === true,
        `before=${focusedBefore} picked=${picked} after=${focusedAfter}`)
    }

    // 42. A click OUTSIDE the palette closes it — and still does its ordinary
    //     job of focusing the panel it landed on.
    //
    //     The spec's focus rule 4 names three ways out of the palette:
    //     Escape, Enter-after-run, and a click outside. The third was the one
    //     with no code behind it, and its absence is reachable in ONE click:
    //     .palette is a 680px box at top: 12%, not a full-viewport scrim, so a
    //     click anywhere else lands on a panel (or the background) and the
    //     overlay stays up with its input BLURRED — xterm's textarea now has
    //     DOM focus, so bare keys go to the agent while the palette sits there
    //     looking ready to take a query. That is verbatim the failure rule 1
    //     exists to prevent, and Escape cannot even undo it: the key reaches
    //     the PTY, not the palette's onKeyDown.
    //
    //     Panel clicks never reach .canvas's background onMouseDown (every
    //     panel handler stopPropagations), so the close cannot live there —
    //     it has to be a CAPTURE-phase handler that sees the click before the
    //     panel does. Clicking a panel is therefore the discriminating
    //     gesture: a fix written only into the background handler passes a
    //     background-click check and fails this one.
    //
    //     Focus is the second half of the assertion and the reason the target
    //     must be a panel other than the captured one: closePalette() calls
    //     restoreFocus(capturedId), which would take the keyboard straight
    //     back to the PREVIOUSLY focused panel and leave the user typing into
    //     a panel they just clicked away from.
    {
      const capturedId = await wc.executeJavaScript(`(() => {
        const el = document.activeElement && document.activeElement.closest('.panel')
        return el ? el.getAttribute('data-panel-id') : null
      })()`)
      const targetId = await wc.executeJavaScript(`(() => {
        const panel = [...document.querySelectorAll('.panel__slot')]
          .map((slot) => slot.closest('.panel'))
          .find((p) => p && p.getAttribute('data-panel-id') !== ${JSON.stringify(capturedId)})
        return panel ? panel.getAttribute('data-panel-id') : null
      })()`)
      if (capturedId === null || targetId === null) {
        ok('42 a click outside the palette closes it and focuses what it hit', false,
          `fixture assumption broke: captured=${capturedId} target=${targetId} ` +
          '(needs a focused panel and a SECOND live panel to click)')
      } else {
        await wc.executeJavaScript(`
          if (document.querySelector('.palette') === null) {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
          }
        `)
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 2000)
        // A real, bubbling mousedown on the terminal slot — the propagation
        // path is the subject of the check, so nothing here may short-circuit
        // it, and it is the same gesture check 40 uses to focus a panel.
        await wc.executeJavaScript(`(() => {
          const slot = document.querySelector('[data-panel-id=${JSON.stringify(targetId)}] .panel__slot')
          slot.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        })()`)
        const closed = await waitUntil(
          () => wc.executeJavaScript(`document.querySelector('.palette') === null`), 2000)
        await sleep(200)
        const focusedAfter = await wc.executeJavaScript(`(() => {
          const el = document.activeElement && document.activeElement.closest('.panel')
          return el ? el.getAttribute('data-panel-id') : null
        })()`)
        ok('42 a click outside the palette closes it and focuses what it hit',
          closed === true && focusedAfter === targetId,
          `captured=${capturedId} target=${targetId} closed=${closed} focused=${focusedAfter}`)
      }
    }

    // 43. The PROJECT half of the prompt list, end to end.
    //
    //     Everything about .claude/commands was proven only as far as
    //     verify:layout 53-57's pure unit checks: the harness's listPrompts
    //     used to answer mergePrompts(saved, []) — a literal empty project
    //     half — so main/index.ts's `readProjectPrompts(resolveCwd(cwd))` was
    //     never called by any check anywhere. A regression there (the cwd of
    //     the wrong panel, a `.claude/commands` path assembled wrongly, a
    //     swapped source label) removes ROWS, and a shorter list looks
    //     exactly like "this project has no commands". Nothing throws and
    //     nothing logs. What this check does NOT cover is resolveCwd's `~`
    //     expansion: PROJECT_DIR is absolute, so resolveCwd is the identity
    //     here — the expansion is verify:pty-manager's ground, and claiming
    //     it here would be a comment the check cannot honour.
    //
    //     The fixture is a real file in a real directory (PROJECT_DIR, with a
    //     space in its path on purpose) that this suite wrote before the
    //     window loaded, and the panel it belongs to is the ECHO panel check
    //     40 spawned — the only panel pointed at that directory. Which makes
    //     the assertion three things at once: the row exists (so the read
    //     happened, under the CAPTURED panel's cwd and not some other
    //     panel's), it is labelled `project` (the source survived the merge),
    //     and its BODY reaches the terminal (so the `proj:` id the palette
    //     holds still resolves to the file's text).
    {
      const echoId = await wc.executeJavaScript(`(() => {
        const dir = ${JSON.stringify(PROJECT_DIR)}
        const found = window.__m4aSessions()
          .map((s) => s.id)
          .find((id) => (window.__m5aSpecOf(id) || { spec: {} }).spec.cwd === dir)
        return found || null
      })()`)
      if (echoId === null) {
        ok('43 a project prompt is listed and inserted from the panel\'s own cwd', false,
          'no panel is running in PROJECT_DIR — check 40a\'s spawn is this check\'s fixture')
      } else {
        // Focus it: the palette captures focusedId at OPEN time and lists the
        // CAPTURED panel's cwd, so this click is what makes PROJECT_DIR the
        // directory read. Retried for the same reason check 40's is.
        const focused = await waitUntil(async () => {
          await wc.executeJavaScript(`(() => {
            const slot = document.querySelector('[data-panel-id=${JSON.stringify(echoId)}] .panel__slot')
            if (slot) slot.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
          })()`)
          return wc.executeJavaScript(`(() => {
            const el = document.activeElement && document.activeElement.closest('.panel')
            return el !== null && el.getAttribute('data-panel-id') === ${JSON.stringify(echoId)}
          })()`)
        }, 5000, 200)
        await wc.executeJavaScript(`
          if (document.querySelector('.palette') === null) {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
          }
        `)
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 2000)
        // ENTER, not a click, for the same reason check 40 uses it: a mouse
        // pick is fine (check 42 is what proves that now), but the assertion
        // below reads the FOCUSED session through __m4aCellToScreen and the
        // keyboard path leaves focus exactly where it was.
        const insertRow = await wc.executeJavaScript(`(async () => {
          const input = document.querySelector('.palette__input')
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
          setter.call(input, 'insert ${PROJECT_PROMPT_NAME}')
          input.dispatchEvent(new Event('input', { bubbles: true }))
          await new Promise((r) => setTimeout(r, 120))
          const selected = document.querySelector('.palette__row--selected')
          if (!selected) return 'no row'
          const text = selected.textContent
          // Both halves asserted before Enter: the NAME (so this is the
          // project file and not the saved prompt check 40 seeded) and the
          // SOURCE label (a swapped label is the silent half of this defect —
          // the row still runs, it just tells the user the wrong story about
          // where the text they are about to paste came from).
          if (!text.includes('${PROJECT_PROMPT_NAME}') ||
              !text.includes('project — .claude/commands')) return text
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
          return true
        })()`)
        const arrived = insertRow === true
          ? await waitUntil(
              () => wc.executeJavaScript(`window.__m4aCellToScreen('zzprojectbody') !== null`),
              3000
            )
          : false
        ok('43 a project prompt is listed and inserted from the panel\'s own cwd',
          arrived === true,
          `focused=${focused} row=${insertRow} arrived=${arrived}`)
      }
    }

    // 44 — M6a. A panel whose SPEC has no command is the default case —
    //     every Cmd+N panel and the built-in login-shell preset — and its
    //     header printed the literal string "login shell" for the whole
    //     life of the app. Main has known the real answer since M4. By this
    //     point in the suite the canvas has been reset (23), reloaded (26,
    //     39) and had panels spawned-and-undone (37), so the first `.panel`
    //     in DOM order is not a known quantity — this check spawns and
    //     identifies its OWN panel rather than trusting a bare first match.
    {
      // Check 29 pointed Cmd+N's default at a fixture command ('/bin/cat
      // -u'), but check 39's renderer reload re-fires did-finish-load, which
      // re-pushes BOOT_DEFAULT_PRESET ('/bin/cat -v') over it — so by the
      // time this check runs, the default in effect is BOOT_DEFAULT_PRESET,
      // not check 29's. Left alone, this check would spawn a panel whose
      // spec ALREADY names a command, and the header would read that command
      // via the existing `spec.command ?? 'login shell'` fallback even
      // before the chain changes — passing for a reason that has nothing to
      // do with what this check tests. Re-point the default at a
      // command-less template, the same shape check 31 uses, so this panel
      // exercises the actual case the header stand-in exists for: an absent
      // spec.command.
      wc.send(IPC_EVENTS.PRESET_DEFAULT, { cwd: '/tmp', args: [] })
      await waitUntil(async () => await wc.executeJavaScript(
        `Boolean(window.__m5aDefaultSpec && window.__m5aDefaultSpec().command === undefined)`), 3000)

      const idsBefore = new Set(await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`))
      // Check 37 already establishes this exact idiom for capturing a
      // Cmd+N panel's id: dispatch the synthetic keydown on window, then
      // diff the id list against the snapshot taken before it.
      await wc.executeJavaScript(
        `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', metaKey: true, bubbles: true }))`)
      const ids = await waitUntil(async () => {
        const now = await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
        return now.length > idsBefore.size ? now : false
      }, 3000)
      const newId = ids ? ids.find((id) => !idsBefore.has(id)) : undefined
      // A command-less panel spawns only once it goes LIVE ("Lazy spawn"),
      // and even then the header's honest answer is not available until
      // pty:create resolves. sessionMap reads MAIN's own pty:list, so
      // waiting on it is waiting for the actual spawn to have completed on
      // the backend, not a guessed clock delay.
      const spawnedOnBackend = newId
        ? await waitUntil(async () => (await sessionMap(wc)).has(newId), 3000)
        : false
      // The header re-renders off registry.version(), which bumps on the
      // status transition to 'running' — a beat after the backend spawn
      // above, not the same tick. Poll the label itself rather than reading
      // it once right after the backend confirms.
      const label = newId
        ? await waitUntil(async () => {
            const text = await wc.executeJavaScript(
              `document.querySelector('.panel[data-panel-id="${newId}"] .panel__title')?.textContent ?? ''`)
            return text.startsWith('/') ? text : false
          }, 3000)
        : false
      const rawLabel = newId
        ? await wc.executeJavaScript(
            `document.querySelector('.panel[data-panel-id="${newId}"] .panel__title')?.textContent ?? ''`)
        : null
      ok('44 the header names what main resolved, not the stand-in',
        newId !== undefined && spawnedOnBackend && label !== false && label !== 'login shell' &&
          typeof label === 'string' && label.startsWith('/'),
        `newId=${newId} spawnedOnBackend=${spawnedOnBackend} label=${label} rawLabel=${rawLabel}`)

      // Restore what was ACTUALLY in effect before this check's repoint —
      // BOOT_DEFAULT_PRESET ('/bin/cat -v'), the value check 39's reload left
      // behind, not check 29's ('/bin/cat -u'), which that reload already
      // overwrote. This check is not the last one in the file by accident of
      // when it was written — Task 7 appends checks 45-46 right after it,
      // driving the command palette, which plausibly exercises Cmd+N and the
      // default-preset template. Leaving the command-less repoint above in
      // place for the rest of the run would be exactly the silent
      // shared-state leak check 39's design note already warns against
      // (there, isolating a reload from check 26's; here, isolating this
      // check's own repoint from whatever comes after it).
      wc.send(IPC_EVENTS.PRESET_DEFAULT,
        { cwd: BOOT_DEFAULT_PRESET.cwd, command: BOOT_DEFAULT_PRESET.command, args: BOOT_DEFAULT_PRESET.args })
      await waitUntil(async () => await wc.executeJavaScript(
        `Boolean(window.__m5aDefaultSpec && window.__m5aDefaultSpec().command === '${BOOT_DEFAULT_PRESET.command}')`), 3000)
    }

    // 45-46 — M6a. A rename is a COMMITTED gesture, so it pushes exactly one
    //     history entry — the same rule a drag obeys, for the same reason: an
    //     entry per keystroke would make one rename take a dozen Cmd+Z presses
    //     to unwind while every final-state assertion still passed.
    //
    //     By this point in the suite the canvas has been reset (23), reloaded
    //     (26, 39) and had panels spawned-and-undone (37), so the first
    //     `.panel` in DOM order is not a known quantity — check 44's idiom is
    //     reused here: spawn a panel with Cmd+N, diff the id snapshot to find
    //     it, and assert on that id specifically rather than trusting a bare
    //     first match.
    //
    //     Note the nativeSet dance below, copied from check 38 and
    //     load-bearing for the same reason: React's controlled <input>
    //     IGNORES a plain input.value = x. Only the prototype's native setter
    //     plus a dispatched 'input' event reaches React's state, so a check
    //     written the obvious way types into a field the component never
    //     learns about, submits an empty string, and fails for a reason that
    //     has nothing to do with renaming.
    {
      const idsBefore45 = new Set(await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`))
      await wc.executeJavaScript(
        `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', metaKey: true, bubbles: true }))`)
      const ids45 = await waitUntil(async () => {
        const now = await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
        return now.length > idsBefore45.size ? now : false
      }, 3000)
      const panelId = ids45 ? ids45.find((id) => !idsBefore45.has(id)) : undefined

      // Spawning does not focus (check 40's note): the palette captures
      // focusedId at OPEN time, so without this click the rename row would be
      // aimed at whatever panel was focused before, not the one just spawned.
      if (panelId) {
        await waitUntil(async () => {
          await wc.executeJavaScript(`(() => {
            const slot = document.querySelector('[data-panel-id=${JSON.stringify(panelId)}] .panel__slot')
            if (slot) slot.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
          })()`)
          return wc.executeJavaScript(`window.__m4aGrid() !== null`)
        }, 5000, 200)
      }

      const titleOf = () => panelId
        ? wc.executeJavaScript(
            `document.querySelector('.panel[data-panel-id=${JSON.stringify(panelId)}] .panel__title')?.textContent ?? ''`)
        : Promise.resolve('')
      const panelExists = () => panelId
        ? wc.executeJavaScript(
            `document.querySelector('.panel[data-panel-id=${JSON.stringify(panelId)}]') !== null`)
        : Promise.resolve(false)

      // Captured BEFORE the rename runs, so check 46 has something real to
      // undo back TO. Without this, `titleOf()` returning '' after undo is
      // ambiguous between "the rename reverted" and "the panel is gone" —
      // and an undo that popped check 45's own Cmd+N spawn (e.g. because the
      // rename pushed zero history entries) would produce exactly that ''
      // and read as success.
      //
      // Waited, not read once: the grid being ready (above) only means the
      // terminal is attached, not that pty:create has resolved and bumped
      // registry.version() into 'running' — the same lag check 44 waits out
      // with `label.startsWith('/')`. Capturing too early would freeze in
      // '' or the stand-in, and the real command could still settle in
      // behind the rename before the undo assertion runs, making a correct
      // implementation look like it reverted to the wrong value.
      const preRenameTitle = await waitUntil(async () => {
        const text = await titleOf()
        return text.startsWith('/') ? text : false
      }, 3000) || await titleOf()

      await wc.executeJavaScript(
        `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))`)
      await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette') !== null`), 2000)

      const ran = panelId ? await wc.executeJavaScript(`(async () => {
        const nativeSet = (input, v) => {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
          setter.call(input, v)
          input.dispatchEvent(new Event('input', { bubbles: true }))
        }
        nativeSet(document.querySelector('.palette__input'), 'rename panel')
        await new Promise((r) => setTimeout(r, 50))
        const row = [...document.querySelectorAll('.palette__row')]
          .find((r) => r.textContent.includes('Rename panel'))
        if (!row) return 'no rename-panel row'
        row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        await new Promise((r) => setTimeout(r, 100))
        const field = document.querySelector('.palette__input')
        if (!field) return 'no input after entering rename mode'
        nativeSet(field, 'auth refactor')
        await new Promise((r) => setTimeout(r, 50))
        field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        return 'ok'
      })()`) : 'no panel spawned'

      const landed = ran === 'ok' &&
        Boolean(await waitUntil(async () => (await titleOf()) === 'auth refactor', 3000))
      ok('45 a rename from the palette reaches the panel header', landed, `panelId=${panelId} ran=${ran}`)

      wc.send('edit:undo')
      // Asserts the panel is STILL THERE, not merely that its header no
      // longer reads 'auth refactor' — `titleOf()` returns '' for a missing
      // element too, so a zero-history-entry rename that let this Cmd+Z pop
      // check 45's own Cmd+N spawn instead would satisfy a `!== 'auth
      // refactor'` check while asserting the opposite of what it claims. The
      // real assertion is that the header reverted to what it said before
      // the rename ran.
      const revertedTitle = await waitUntil(async () => {
        const text = await titleOf()
        return text === preRenameTitle ? text : false
      }, 3000)
      const stillExists = await panelExists()
      const undone = stillExists && revertedTitle !== false
      ok('46 one Cmd+Z undoes the whole rename', landed && undone,
        `preRenameTitle=${preRenameTitle} stillExists=${stillExists} revertedTitle=${revertedTitle}`)
    }

    // ---------------------------------------------------------------------
    // 47. The palette owns every wheel over itself. .palette mounts INSIDE
    //     .canvas, so useViewport's capture-phase listener sees the event
    //     first; before shouldYieldWheel learned about .palette it called
    //     preventDefault() there, which both panned the camera and killed the
    //     native scrolling of .palette__list (max-height: 46vh, overflow-y:
    //     auto) — the list could only ever be moved by the arrow keys.
    //
    //     WHY THE ASSERTION IS CANCELLATION AND NOT scrollTop: a synthetic
    //     WheelEvent is untrusted, and Chromium performs no default action
    //     for an untrusted event — so .palette__list would NOT scroll here
    //     even against a fully correct implementation, and a scrollTop check
    //     would fail the fix it is meant to prove. dispatchEvent() returns
    //     false iff something called preventDefault(), so "not cancelled" is
    //     precisely "the browser will scroll this", and it is exactly the bit
    //     this change flips. The background control below is what keeps that
    //     from being vacuous: it must still come back cancelled, and must
    //     still move the camera, or a listener that had simply stopped
    //     working would pass the palette halves for the wrong reason.
    // ---------------------------------------------------------------------
    {
      await zoomTo(wc, '0')
      if (await wc.executeJavaScript(`document.querySelector('.palette') === null`)) {
        await wc.executeJavaScript(
          `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))`)
      }
      await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 2000)

      const result = await wc.executeJavaScript(`(async () => {
        const read = () => getComputedStyle(document.querySelector('.world')).transform
        // Dispatched on a ROW, not on .palette: a row is where a real cursor
        // over the list actually is, and it is a descendant of the scroll
        // container whose default action is the thing being protected. The
        // same lesson check 12 records about .panel__slot vs .xterm-screen.
        const row = document.querySelector('.palette__row')
        if (!row) return { error: 'no .palette__row' }
        if (!document.querySelector('.world')) return { error: 'no .world' }
        const r = row.getBoundingClientRect()
        const wheel = (extra) => new WheelEvent('wheel', Object.assign({
          bubbles: true, cancelable: true,
          clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
          deltaY: 120, deltaMode: 0
        }, extra))

        const before = read()
        const plainOverPalette = row.dispatchEvent(wheel({}))
        await new Promise((res) => setTimeout(res, 200))

        // The pinch spelling. Over the palette this must be yielded TOO —
        // rule 1 outranks rule 2 in shouldYieldWheel, because while the
        // palette is open every other canvas gesture stands down. Safe to
        // dispatch before the transform is re-read only because a yielded
        // zoom changes no scale; if it were claimed, this is the wheel that
        // would show up in transformAfter.
        const pinchOverPalette = row.dispatchEvent(wheel({ ctrlKey: true }))
        await new Promise((res) => setTimeout(res, 200))
        const transformAfterPalette = read()

        // Control: the same wheel on the background is still the camera's.
        const canvas = document.querySelector('.canvas')
        const overBackground = canvas.dispatchEvent(new WheelEvent('wheel', {
          bubbles: true, cancelable: true, clientX: 5, clientY: 5, deltaY: 120, deltaMode: 0
        }))
        await new Promise((res) => setTimeout(res, 200))
        const transformAfterBackground = read()

        document.querySelector('.palette__input')
          ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        return {
          before, plainOverPalette, pinchOverPalette,
          transformAfterPalette, overBackground, transformAfterBackground
        }
      })()`)

      ok('47 a wheel over the open palette is left uncancelled and does not move the camera, pinch included, while the background still pans',
        result && !result.error &&
          result.plainOverPalette === true &&
          result.pinchOverPalette === true &&
          result.transformAfterPalette === result.before &&
          result.overBackground === false &&
          result.transformAfterBackground !== result.before,
        `error=${result && result.error} plain=${result && result.plainOverPalette} ` +
        `pinch=${result && result.pinchOverPalette} background=${result && result.overBackground} ` +
        `transform: ${result && result.before} -> palette ${result && result.transformAfterPalette} ` +
        `-> background ${result && result.transformAfterBackground}`)
      await zoomTo(wc, '0')
    }

    // 48-50. M6p — the palette's structure, end to end. The pure suite proves
    //     the model; these three prove the model reached the screen, which is
    //     the half that has silently failed before in this codebase (check 32
    //     exists because a correct default-preset feature sat inert behind a
    //     subscription that never fired).
    //
    //     Every one of them opens the palette defensively rather than sending
    //     a blind Cmd+K: the chord TOGGLES, and earlier checks do not all
    //     leave it closed — check 39 already had to learn this the hard way.
    {
      const openPalette = async () => {
        await wc.executeJavaScript(`
          if (document.querySelector('.palette') === null) {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
          }
        `)
        return waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 2000)
      }
      // An IIFE, not a bare `const`. executeJavaScript evaluates each call as
      // a top-level SCRIPT, so a top-level `const` lands in the page's global
      // lexical scope and survives the call — calling this helper twice then
      // throws "Identifier 'i' has already been declared" before the script
      // runs at all, which surfaces as an opaque "Script failed to execute"
      // that aborts the whole suite rather than failing one check.
      const escape = () => wc.executeJavaScript(`(() => {
        const input = document.querySelector('.palette__input')
        if (input) input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      })()`)
      const closePalette = async () => {
        await escape()
        await sleep(80)
        // Escape is now TWO-STAGE: inside a scope it pops the scope and the
        // palette stays open. One press is therefore not a guaranteed close,
        // and a helper that assumed it was would leave every later check
        // acting on an overlay it thought was gone.
        await escape()
        return sleep(80)
      }

      // 48. Section headers exist in the DOM, appear ONCE each, and are in
      //     SECTIONS order. The old per-row group chip rendered on every row
      //     and was the thing that made a twenty-row list unreadable; a
      //     regression that brought it back — or that emitted a header per row
      //     — looks almost identical in a screenshot and is obvious here.
      {
        await openPalette()
        const headers = await wc.executeJavaScript(`
          [...document.querySelectorAll('.palette__section')].map((h) => h.textContent.trim())
        `)
        // Restates palette-model.ts's SECTIONS (by label) and MUST move with
        // it — this is the same defect class CLAUDE.md records verify:palette
        // check 30 being rewritten to fix: a restated list goes stale the
        // moment a section is added, and the check then fails for a reason
        // that has nothing to do with the section-ordering property it
        // exists to prove. This exact staleness is what happened here: M7
        // added 'workspace' to SECTIONS (between 'prompt' and 'canvas') and
        // an unconditional 'New workspace…' row (group: 'workspace', no
        // hiddenAtRest) that renders its header even with zero workspaces —
        // ORDER did not move with it, and 'Settings' had already been
        // missing since M6b for the same reason, silently harmless only
        // because every settings row is hiddenAtRest and nothing unconditional
        // renders that header at rest. Kept as a restated array rather than
        // importing SECTIONS itself: this suite (unlike verify-palette.cjs)
        // loads the built renderer rather than bundling palette-model.ts, so
        // reaching the real SECTIONS value here would mean adding plumbing
        // this task was told not to add.
        const ORDER = ['Panels', 'New panel', 'Prompts', 'Workspaces', 'Canvas', 'Settings', 'Manage']
        const unique = headers.length === new Set(headers).size
        const ordered = headers.join(',') ===
          ORDER.filter((label) => headers.includes(label)).join(',')
        ok('48 section headers render once each, in SECTIONS order',
          headers.length >= 3 && unique && ordered, headers.join(','))
        await closePalette()
      }

      // 49. The drill-in, and its exit. Two halves, and the SECOND is the one
      //     worth writing: Escape inside a scope must pop back to the top
      //     level and leave the palette OPEN. If it closed instead, the
      //     drill-in would be a trap the user escapes only by reopening —
      //     and every assertion about narrowing would still pass.
      {
        await openPalette()
        const result = await wc.executeJavaScript(`(async () => { try {
          const input = document.querySelector('.palette__input')
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
          setter.call(input, 'manage presets')
          input.dispatchEvent(new Event('input', { bubbles: true }))
          await new Promise((r) => setTimeout(r, 80))
          const door = [...document.querySelectorAll('.palette__row')]
            .find((r) => r.textContent.includes('Manage presets'))
          if (!door) return { error: 'no Manage presets row' }
          door.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
          await new Promise((r) => setTimeout(r, 120))
          const rowsInside = [...document.querySelectorAll('.palette__row')].map((r) => r.textContent)
          const scoped = {
            chip: (document.querySelector('.palette__scope') || {}).textContent || null,
            // Every row inside the presets scope is a preset row. "Go to" is
            // the cheapest proof the filter is real: the panel switcher is
            // always populated at this point in the run.
            leaked: rowsInside.filter((t) => t.includes('Go to')).length,
            // The administration rows the resting list hides are exactly what
            // the user drilled in FOR.
            hasDelete: rowsInside.some((t) => t.includes('Delete preset')),
            count: rowsInside.length
          }
          const input2 = document.querySelector('.palette__input')
          input2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
          await new Promise((r) => setTimeout(r, 120))
          return {
            scoped,
            stillOpen: document.querySelector('.palette') !== null,
            chipGone: document.querySelector('.palette__scope') === null,
            backAtTop: [...document.querySelectorAll('.palette__row')]
              .some((r) => r.textContent.includes('Go to'))
          }
        } catch (e) { return { error: String(e && e.message || e) } } })()`)
        ok('49 a drill-in narrows to its own rows and Escape pops back without closing',
          result && !result.error &&
            result.scoped.leaked === 0 &&
            result.scoped.hasDelete === true &&
            result.scoped.count > 0 &&
            result.stillOpen === true &&
            result.chipGone === true &&
            result.backAtTop === true,
          JSON.stringify(result))
        await closePalette()
      }

      // 49b. The horizontal spelling of the same two moves: ArrowRight opens
      //      the door under the selection, ArrowLeft comes back. It asserts
      //      the same three facts about the SCOPE that 49 does rather than
      //      merely "a chip appeared", so an ArrowRight that opened the wrong
      //      drill-in still fails. Dispatched on .palette__input, never on
      //      window: this handler is the input's own onKeyDown and a window
      //      dispatch never reaches it (the same trap check 70 records).
      {
        await openPalette()
        const result = await wc.executeJavaScript(`(async () => { try {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
          const input = document.querySelector('.palette__input')
          setter.call(input, 'manage presets')
          input.dispatchEvent(new Event('input', { bubbles: true }))
          await new Promise((r) => setTimeout(r, 80))
          // Caret at the end — where typing leaves it — which is the only
          // position ArrowRight is allowed to act from.
          const typed = document.querySelector('.palette__input')
          typed.setSelectionRange(typed.value.length, typed.value.length)
          typed.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
          await new Promise((r) => setTimeout(r, 120))
          const inside = [...document.querySelectorAll('.palette__row')].map((r) => r.textContent)
          const scoped = {
            chip: (document.querySelector('.palette__scope') || {}).textContent || null,
            leaked: inside.filter((t) => t.includes('Go to')).length,
            hasDelete: inside.some((t) => t.includes('Delete preset')),
            count: inside.length
          }
          // Entering a door clears the query, so the caret is at 0 already —
          // which is exactly where ArrowLeft is allowed to pop from.
          const input2 = document.querySelector('.palette__input')
          input2.setSelectionRange(0, 0)
          input2.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
          await new Promise((r) => setTimeout(r, 120))
          return {
            scoped,
            stillOpen: document.querySelector('.palette') !== null,
            chipGone: document.querySelector('.palette__scope') === null,
            backAtTop: [...document.querySelectorAll('.palette__row')]
              .some((r) => r.textContent.includes('Go to'))
          }
        } catch (e) { return { error: String(e && e.message || e) } } })()`)
        ok('49b ArrowRight enters a drill-in and ArrowLeft pops back without closing',
          result && !result.error &&
            result.scoped.chip === 'Presets' &&
            result.scoped.leaked === 0 &&
            result.scoped.hasDelete === true &&
            result.scoped.count > 0 &&
            result.stillOpen === true &&
            result.chipGone === true &&
            result.backAtTop === true,
          JSON.stringify(result))
        await closePalette()
      }

      // 49c. The caret gate, both halves — and this is the half that
      //      separates the shipped behaviour from the naive unconditional
      //      one. .palette__input is the only text field in this app the
      //      user cannot tab out of, so arrows that ALWAYS navigate make a
      //      typed query uneditable: there is no other way to move the
      //      caret back into it. 49b passes against that implementation.
      //      So: caret at 0 with text present must NOT enter a scope, and
      //      caret at the end with text present must NOT pop one.
      {
        await openPalette()
        const result = await wc.executeJavaScript(`(async () => { try {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
          const type = async (text) => {
            const el = document.querySelector('.palette__input')
            setter.call(el, text)
            el.dispatchEvent(new Event('input', { bubbles: true }))
            await new Promise((r) => setTimeout(r, 80))
          }
          const press = async (key, caret) => {
            const el = document.querySelector('.palette__input')
            el.setSelectionRange(caret, caret)
            el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
            await new Promise((r) => setTimeout(r, 120))
          }
          // Half one: the door is selected, but the caret is mid-query.
          await type('manage presets')
          await press('ArrowRight', 0)
          const enteredFromCaretZero = document.querySelector('.palette__scope') !== null
          // Now actually enter, from the end, and type inside the scope.
          await press('ArrowRight', 'manage presets'.length)
          const inScope = document.querySelector('.palette__scope') !== null
          await type('del')
          // Half two: caret at the end of a non-empty query must not pop.
          await press('ArrowLeft', 'del'.length)
          const poppedFromCaretEnd = document.querySelector('.palette__scope') === null
          // And the gate is a gate, not a disablement: from caret 0 it pops.
          await press('ArrowLeft', 0)
          return {
            enteredFromCaretZero,
            inScope,
            poppedFromCaretEnd,
            poppedFromCaretZero: document.querySelector('.palette__scope') === null,
            stillOpen: document.querySelector('.palette') !== null
          }
        } catch (e) { return { error: String(e && e.message || e) } } })()`)
        ok('49c the drill-in arrows are caret-gated in both directions',
          result && !result.error &&
            result.enteredFromCaretZero === false &&
            result.inScope === true &&
            result.poppedFromCaretEnd === false &&
            result.poppedFromCaretZero === true &&
            result.stillOpen === true,
          JSON.stringify(result))
        await closePalette()
      }

      // 50. A delete is gated, and Escape CANCELS it. The assertion that
      //     matters is the last one: a confirm step that confirms
      //     unconditionally is invisible — the dialog appears, the user says
      //     no, and the preset is gone anyway. So this reads the store back
      //     through preset.list() rather than trusting the overlay's state.
      //
      //     Targets the seeded user preset (renamed by check 38), because the
      //     built-ins refuse deletion with a reason and would make a disabled
      //     row look like a working confirm gate.
      {
        await openPalette()
        const result = await wc.executeJavaScript(`(async () => { try {
          const before = (await window.canvas.preset.list()).map((p) => p.name)
          const victim = before.find((n) => n.includes('renamed by palette') || n.includes('harness'))
          if (!victim) return { error: 'no user preset to try deleting: ' + before.join('|') }
          const input = document.querySelector('.palette__input')
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
          setter.call(input, 'delete preset ' + victim)
          input.dispatchEvent(new Event('input', { bubbles: true }))
          await new Promise((r) => setTimeout(r, 100))
          const row = [...document.querySelectorAll('.palette__row')]
            .find((r) => r.textContent.includes('Delete preset ' + victim))
          if (!row) return { error: 'no delete row for ' + victim }
          const wasRed = row.className.includes('palette__row--destructive')
          row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
          await new Promise((r) => setTimeout(r, 150))
          // Confirm mode: the palette is still up, the list is gone, and the
          // question names what is about to be destroyed.
          const confirming = document.querySelector('.palette__confirm') !== null &&
            document.querySelector('.palette__list') === null
          const named = confirming &&
            document.querySelector('.palette__confirm').textContent.includes(victim)
          const input2 = document.querySelector('.palette__input')
          if (input2) input2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
          await new Promise((r) => setTimeout(r, 250))
          const after = (await window.canvas.preset.list()).map((p) => p.name)
          return { wasRed, confirming, named, survived: after.includes(victim), victim }
        } catch (e) { return { error: String(e && e.message || e) } } })()`)
        ok('50 a destructive row is marked, gated by a confirm, and Escape leaves the preset alone',
          result && !result.error &&
            result.wasRed === true &&
            result.confirming === true &&
            result.named === true &&
            result.survived === true,
          JSON.stringify(result))
        await closePalette()
      }
    }

    // 51. A SECOND Cmd+N at the same camera lands one CASCADE_STEP down and
    //     right of the first instead of on top of it. Every path that makes a
    //     panel funnels through Canvas.tsx's onSpawn, which used to hand the
    //     view centre straight to makePanel — so N presses without moving the
    //     camera produced N byte-identical rects. The canvas then LOOKS like
    //     it holds one panel: the buried ones are unreachable (their close
    //     buttons are underneath) while each still holds a WebGL context and a
    //     LIVE_BUDGET slot, and the panel count in the HUD is the only
    //     evidence they exist.
    //
    //     Why this check has to be here and not only in verify:viewport:
    //     cascadeCentre can be perfect and green under plain node while
    //     onSpawn never calls it. Every other Cmd+N driver in this suite (7b,
    //     17, 22, 26, 29) asserts count, ids or spec — none of them would
    //     notice.
    //
    //     Why EXACTLY one step and not merely "somewhere else": a cascade that
    //     jitters by a random amount also un-stacks the panels, but it is
    //     unpredictable to the user and nothing could assert it. The lattice
    //     is what makes the gap-filling behaviour (close one, spawn again,
    //     land back in that hole) possible at all.
    //
    //     And why the live assertion: this is the ONLY place the suite proves
    //     a cascaded panel is still inside the cull region and therefore still
    //     promoted, rather than merely arguing it. A panel walked off screen
    //     is never attached, never spawns a PTY, and Cmd+N appears to do
    //     nothing whatsoever — a quieter failure than the stacking it
    //     replaced. It is also what protects check 22's stated assumption
    //     ("Cmd+N's panel is centred on the current view, so it is on-screen
    //     and therefore live") from a future CASCADE_MAX_STEPS increase.
    {
      // Reset, then pan far outside every panel this run has created, for the
      // same reason check 22 does it: the cascade is decided against the LIVE
      // panel array, so starting over empty world space makes the first press
      // land dead centre deterministically instead of depending on which
      // lattice slots fifty checks of spawning and dragging have filled.
      await zoomTo(wc, '0')
      await wc.executeJavaScript(`
        document.querySelector('.canvas').dispatchEvent(new WheelEvent('wheel', {
          bubbles: true, cancelable: true, clientX: 700, clientY: 450,
          deltaX: -300000, deltaY: -300000, deltaMode: 0
        }))
        true
      `)

      const panelIds = () => wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`
      )
      // Read by data-panel-id, never "the last .panel in the DOM": array order
      // and paint order are deliberately different things here (see Panel.z),
      // so the newest panel is not necessarily the last element.
      const centreOf = (id) => wc.executeJavaScript(`(() => {
        const el = document.querySelector('.panel[data-panel-id=${JSON.stringify(id)}]')
        if (!el) return null
        return { x: parseFloat(el.style.left) + parseFloat(el.style.width) / 2,
                 y: parseFloat(el.style.top) + parseFloat(el.style.height) / 2 }
      })()`)
      const spawnOne = async () => {
        const before = new Set(await panelIds())
        await zoomTo(wc, 'n')
        const after = await waitUntil(async () => {
          const ids = await panelIds()
          return ids.length > before.size ? ids : false
        }, 3000)
        return after ? after.find((id) => !before.has(id)) : undefined
      }

      // The expectation comes out of the live DOM — the host's own bounds and
      // the world layer's own transform — rather than from INITIAL/PANEL_W,
      // for the reason check 7's comment gives.
      const expectedCentre = await viewCentreInWorld(wc)
      const firstId = await spawnOne()
      const secondId = await spawnOne()
      const first = firstId ? await centreOf(firstId) : null
      const second = secondId ? await centreOf(secondId) : null
      const live = secondId
        ? Boolean(
            await waitUntil(
              () => wc.executeJavaScript(
                `!!document.querySelector('.panel[data-panel-id="${secondId}"] .xterm')`
              ),
              3000
            )
          )
        : false

      const TOL = 1 // same 1px float-rounding slack check 7 allows
      const firstCentred = first &&
        Math.abs(first.x - expectedCentre.x) <= TOL &&
        Math.abs(first.y - expectedCentre.y) <= TOL
      const stepped = first && second &&
        Math.abs(second.x - first.x - CASCADE_STEP) <= TOL &&
        Math.abs(second.y - first.y - CASCADE_STEP) <= TOL
      ok('51 a second Cmd+N at one camera cascades one step instead of stacking, and still goes live',
        Boolean(firstCentred && stepped && live),
        `first=${JSON.stringify(first)} second=${JSON.stringify(second)} ` +
          `viewCentre=${JSON.stringify(expectedCentre)} step=${CASCADE_STEP} live=${live}`)
    }

    // 52-53 — M6b. The end-to-end proof that a palette toggle reaches main's store
    //     and comes back changed. 53 is the half that matters: a toggle that
    //     updates the row but never reaches the store looks identical on screen
    //     until the next relaunch, when the setting is silently back.
    {
      const openPalette = async () => {
        await wc.executeJavaScript(
          `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))`)
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette') !== null`), 2000)
      }
      const closePalette = async () => {
        await wc.executeJavaScript(`
          document.querySelector('.palette__input')
            ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
          true
        `)
        await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette') === null`), 2000)
      }

      await openPalette()
      // Type a KEYWORD, not the label — this is check 35's property proven through
      // the real palette rather than against buildCommands in isolation.
      const found = await wc.executeJavaScript(`(async () => {
        const nativeSet = (input, v) => {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
          setter.call(input, v)
          input.dispatchEvent(new Event('input', { bubbles: true }))
        }
        nativeSet(document.querySelector('.palette__input'), 'viewport')
        await new Promise((r) => setTimeout(r, 100))
        const row = [...document.querySelectorAll('.palette__row')]
          .find((r) => r.textContent.includes('Restore camera position'))
        if (!row) return 'not found'
        row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        return 'ok'
      })()`)
      ok('52 a setting is reachable in the palette by a keyword it does not display',
        found === 'ok', String(found))

      const stored = await waitUntil(async () => {
        const v = await wc.executeJavaScript(
          `window.canvas.settings.list().then((s) => s.find((x) => x.id === 'restore.camera').value)`)
        return v === false ? 'off' : false
      }, 3000)
      ok('53 the toggle reached main\'s store, not just the row', stored === 'off')

      await closePalette()
    }

    // ---------------------------------------------------------------------
    // 54-57 — M6c. Agent state, end to end in a real renderer.
    //
    //     Everything under the renderer is already proven in a cheaper tier:
    //     scanForBell and the state machine under plain node, the manager's
    //     wiring under Electron-as-node. What none of those tiers can see is
    //     the SEAM — whether a state main derived reaches the pixels at all,
    //     whether it reaches a CARD, and whether main is the one that clears
    //     it. Every layer can be individually correct and the feature still
    //     be invisible, which is the shape of failure this suite exists for.
    //
    //     The fixture is a panel of this block's own, running a plain
    //     /bin/sh, rather than one of the seed panels. These checks need a
    //     PTY that will EMIT chosen bytes on demand — a real BEL, and a real
    //     OSC window title — and by this point in the run Cmd+N's default is
    //     check 29's `cat`, which only echoes what it is given and can never
    //     produce a control byte of its own. Bytes are put on the PTY with
    //     ptyManager.write, i.e. through the same call pty:write's handler
    //     makes, so the detector sees them exactly as it sees a user typing.
    // ---------------------------------------------------------------------
    {
      // The shell reads these as command lines, so what reaches the detector
      // is printf's OUTPUT — one real BEL byte, and one real OSC title ending
      // in the BEL that is its terminator. The echoed input contains no
      // control bytes at all, which is what keeps the two stimuli distinct.
      const BELL_LINE = "printf '\\007'\n"
      const TITLE_LINE = "printf '\\033]0;a title\\007'\n"

      const panelIds = () => wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`
      )
      // Read by data-panel-id, never "the last .panel": array order and paint
      // order are deliberately different here (Panel.z), the same rule check
      // 51 states.
      const agentStateOf = (id) => wc.executeJavaScript(
        `(() => { const el = document.querySelector('[data-panel-id=${JSON.stringify(id)}]')
                  return el ? el.getAttribute('data-agent-state') : null })()`
      )
      const cardClassOf = (id) => wc.executeJavaScript(
        `(() => { const el = document.querySelector('[data-panel-id=${JSON.stringify(id)}] .panel__card')
                  return el ? el.className : null })()`
      )
      const isLive = (id) => wc.executeJavaScript(
        `!!document.querySelector('[data-panel-id=${JSON.stringify(id)}] .panel__slot .xterm')`
      )
      // A wheel on the canvas host, the same gesture check 51 pans with. Two
      // opposite calls restore the camera exactly, which is what lets check 56
      // demote a panel and check 57 bring the SAME one back into reach of a
      // real click.
      const panBy = (dx, dy) => wc.executeJavaScript(`
        document.querySelector('.canvas').dispatchEvent(new WheelEvent('wheel', {
          bubbles: true, cancelable: true, clientX: 700, clientY: 450,
          deltaX: ${dx}, deltaY: ${dy}, deltaMode: 0
        }))
        true
      `)
      const clickBackground = async () => {
        const point = await backgroundPoint(wc)
        if (!point) throw new Error('54-57: found no background point on the canvas')
        wc.sendInputEvent({ type: 'mouseDown', x: point.x, y: point.y, button: 'left', clickCount: 1 })
        wc.sendInputEvent({ type: 'mouseUp', x: point.x, y: point.y, button: 'left', clickCount: 1 })
        await sleep(150)
      }

      // Pin this block's fixture to the DIRECT backend. Check 26 swapped the
      // manager onto a real tmux one, and a tmux CLIENT NEVER SEES AN OSC
      // WINDOW TITLE: tmux parses its pane's output stream itself and consumes
      // `ESC ] 0 ; <title> BEL` to set the pane title, forwarding the bell it
      // is made of to no one. Check 55's stimulus therefore never reached
      // main's detector at all while this block ran under tmux — measured, not
      // assumed: with the scanner deliberately broken to count the OSC
      // terminator as a bell, verify:agent-state went red and check 55 stayed
      // GREEN, which is exactly the shape of a check that reads as coverage
      // and proves nothing.
      //
      // Swapping back also makes 54-57 backend-INDEPENDENT: they otherwise ran
      // against a different byte stream on a machine with tmux than on one
      // without, so the four of them would mean two different things depending
      // on who ran the suite.
      //
      // Safe at teardown regardless of whether further blocks run after this
      // one (M7's checks 64-67 now do): DirectBackend.destroy is a no-op,
      // PtyManager.kill still kills each local handle directly (which for the
      // earlier panels is a tmux CLIENT) independent of which backend is
      // currently bound, and the SESSIONS those clients leave behind on
      // PANELS_SOCKET are ended unconditionally by the tmuxBackend.shutdown()
      // in the finally below, which holds its own reference rather than
      // reading this variable.
      backend = createDirectBackend('verify: direct (m6c fixture)')

      // Release focus BEFORE panning. shouldYieldWheel gives a wheel over the
      // FOCUSED panel to that terminal, so a pan attempted while some earlier
      // check's panel still holds focus scrolls a terminal and moves no
      // camera — the panel would then never leave the cull region and check 56
      // would fail for a reason that has nothing to do with agent state.
      await clickBackground()
      // Into empty world space, for the same reason check 51 does it: the
      // spawn cascade is decided against the live panel array, so an empty
      // neighbourhood makes this panel land where it asked and keeps it clear
      // of check 51's two, whose rects would otherwise sit under the clicks
      // below.
      await panBy(2000, 2000)

      const idsBefore = new Set(await panelIds())
      // The same event a menu pick sends. Spawning through PRESET_SPAWN rather
      // than Cmd+N is what lets this block choose the command: Cmd+N would use
      // whatever default the run last pushed.
      win.webContents.send(IPC_EVENTS.PRESET_SPAWN, { cwd: '/tmp', command: '/bin/sh', args: [] })
      const idsAfter = await waitUntil(async () => {
        const now = await panelIds()
        return now.length > idsBefore.size ? now : false
      }, 4000)
      const shellId = idsAfter ? idsAfter.find((id) => !idsBefore.has(id)) : null
      if (!shellId) throw new Error('54-57: PRESET_SPAWN produced no new panel')
      // Lazy spawn: the PTY exists only once the panel has gone live and been
      // laid out, so nothing may be written until pty:list admits it.
      const spawned = await waitUntil(async () => (await sessionMap(wc)).has(shellId), 8000)
      if (!spawned) throw new Error(`54-57: panel ${shellId} never got a PTY`)

      // A record of what main actually SENT, taken off the real bridge. Check
      // 57 is the one that needs it (see there); installing it here means it
      // is already listening before the first stimulus, so nothing has to be
      // inferred from a state read after the fact.
      await wc.executeJavaScript(`(() => {
        if (!window.__m6cAgentLog) {
          window.__m6cAgentLog = []
          window.canvas.agent.onState((u) => window.__m6cAgentLog.push(u))
        }
        return true
      })()`)
      const agentLog = () => wc.executeJavaScript(`window.__m6cAgentLog || []`)

      // 54. A real bell, through a real PTY, reaches the panel's DOM.
      //     The attribute is read rather than the class list on purpose: the
      //     class is a styling decision and a restyle may rename it, while
      //     data-agent-state is the panel's stated answer to "what is this
      //     agent doing". The silent failure this catches is the whole chain
      //     being inert — the detector deriving a state that no send, no
      //     store fan-out, or no render ever turns into anything a user could
      //     see, with every unit tier still green.
      {
        ptyManager.write(shellId, BELL_LINE)
        const rang = await waitUntil(
          async () => (await agentStateOf(shellId)) === 'wants-you', 6000)
        ok('54 a real bell reaches the panel in a real renderer',
          rang === true, `${shellId} -> ${await agentStateOf(shellId)}`)
      }

      // 55. THE TRAP, in a real renderer. `ESC ] 0 ; <title> BEL` sets the
      //     window title and ends in a BEL that is a STRING TERMINATOR, not a
      //     bell; Claude Code emits exactly that, so a scanner that counts it
      //     flashes the border on every title change for a reason no user
      //     could diagnose. This is the third and last tier the trap is
      //     checked at — the pure function, the manager's wiring, and now the
      //     pixels — and a regression at any one of them is silent at the
      //     other two.
      //
      //     The wait is on a POSITIVE transition, never a bare sleep: the
      //     panel is first brought to 'idle', and the title's arrival is then
      //     observed as idle -> busy. Without that, "no wants-you appeared"
      //     would be satisfied just as well by bytes that never reached main
      //     at all, which is a check that proves nothing while looking
      //     stronger than the one above it.
      {
        // Acknowledge first, so this starts from a state that is not already
        // the one being asserted against.
        const click = await clickPanelBody(`[data-panel-id="${shellId}"] .panel__slot`)
        const idled = await waitUntil(
          async () => (await agentStateOf(shellId)) === 'idle', 6000)
        const mark = (await agentLog()).length
        ptyManager.write(shellId, TITLE_LINE)
        const busied = await waitUntil(
          async () => (await agentStateOf(shellId)) === 'busy', 6000)
        // The title has landed by now (the transition above is what says so);
        // this bounded settle is for a LATE wants-you — a scanner that only
        // mis-handles the OSC body once it straddles a flush boundary.
        await sleep(800)
        const since = (await agentLog()).slice(mark)
        const rangAnyway = since.some((u) => u.panelId === shellId && u.state === 'wants-you')
        const finalState = await agentStateOf(shellId)
        ok('55 a window title moves nothing in a real renderer',
          idled === true && busied === true && !rangAnyway && finalState !== 'wants-you',
          `active=${click.active} idled=${idled} busied=${busied} ` +
            `updates=${JSON.stringify(since)} final=${finalState}`)
      }

      // 56. THE CARD — the tier this feature exists for. LIVE_BUDGET caps
      //     live panels at eight, so on the twelve-panel canvas M6c is aimed
      //     at, most of what wants you is a card. A check written only
      //     against a live panel would pass an implementation that renders
      //     nothing on cards at all, and the feature would be missing exactly
      //     where it is needed and present exactly where it is not.
      //
      //     Both surfaces are asserted: the panel root still states the
      //     panel's answer, and the card itself carries it. Reading only the
      //     root would pass a PanelCard that ignores its agentState prop.
      {
        ptyManager.write(shellId, BELL_LINE)
        const rang = await waitUntil(
          async () => (await agentStateOf(shellId)) === 'wants-you', 6000)
        // assignTiers pins the FOCUSED panel live unconditionally, so a panel
        // still holding focus cannot be demoted by any amount of panning. The
        // background click releases it and — unlike a click on the panel —
        // acknowledges nothing, so wants-you survives the release.
        await clickBackground()
        await panBy(3000, 0)
        const carded = await waitUntil(async () => (await cardClassOf(shellId)) !== null, 6000)
        const cardClass = await cardClassOf(shellId)
        const rootState = await agentStateOf(shellId)
        ok('56 the wants-you state reaches a demoted panel\'s card, not just a live panel',
          rang === true && carded === true &&
            String(cardClass).includes('panel__card--agent-wants-you') &&
            rootState === 'wants-you',
          `card=${JSON.stringify(cardClass)} root=${rootState} live=${await isLive(shellId)}`)
      }

      // 57. Focus acknowledges — and MAIN is what answers. The renderer never
      //     writes the cleared state itself: it asks over agent:acknowledge,
      //     main runs the machine, and the answer comes back on agent:state.
      //
      //     A check that only re-read the DOM after the click would pass
      //     against a renderer that cleared its own store and left main still
      //     believing this panel wants you — precisely the disagreement the
      //     acknowledge channel exists to prevent, and precisely what M6d
      //     would then fire a notification into. So the assertion is on the
      //     MESSAGE: a recorded agent:state update for this panel, sent after
      //     the click, naming a state that is not wants-you. Only main sends
      //     on that channel, so a locally-cleared renderer produces no such
      //     entry however convincing its DOM looks.
      //
      //     What this does NOT prove: that the renderer *only* takes main's
      //     answer. An implementation that cleared locally AND asked main
      //     would satisfy both halves. Distinguishing those two would need
      //     main to be made to not answer, which is a fault injection this
      //     harness has no seam for — the honest limit, recorded rather than
      //     papered over.
      {
        await panBy(-3000, 0)
        const back = await waitUntil(() => isLive(shellId), 6000)
        const before = await agentStateOf(shellId)
        const mark = (await agentLog()).length
        const click = await clickPanelBody(`[data-panel-id="${shellId}"] .panel__slot`)
        const answered = await waitUntil(async () => {
          const since = (await agentLog()).slice(mark)
          return since.some((u) => u.panelId === shellId && u.state !== 'wants-you')
        }, 6000)
        const cleared = await waitUntil(
          async () => (await agentStateOf(shellId)) !== 'wants-you', 3000)
        ok('57 focus acknowledges, and main is the one that answers',
          back === true && before === 'wants-you' && answered === true && cleared === true,
          `before=${before} active=${click.active} answered=${answered} ` +
            `after=${await agentStateOf(shellId)}`)
      }

      // Where a pip for `id` is actually painted, in canvas-local pixels,
      // read out of the DOM rather than off a data- attribute: an attribute
      // would let a pip rendered in the wrong place — or inside .world, where
      // it pans away with the panel — report the right number.
      const pipAt = (id) => wc.executeJavaScript(`(() => {
        const el = document.querySelector('.edge-indicator[data-panel-id=${JSON.stringify(id)}]')
        if (!el) return null
        const host = document.querySelector('.canvas').getBoundingClientRect()
        const r = el.getBoundingClientRect()
        return { x: r.left + r.width / 2 - host.left, y: r.top + r.height / 2 - host.top }
      })()`)

      // 58. A wants-you panel that is OFF SCREEN gets a pip, at the position
      //     viewport.ts's own arithmetic says. Recomputed here rather than
      //     imported, the way check 39 recomputes centreOn: this suite loads
      //     the built renderer and has no module to import from.
      //
      //     Asserting WHERE and not merely THAT is the whole value of this
      //     check. "A pip exists" is satisfied by a pip pinned to a corner for
      //     every direction, which is exactly what an independent per-axis
      //     clamp produces (verify:viewport 62 pins the same property in the
      //     pure tier) — and a canvas where every arrow points the same way
      //     tells the user nothing while looking entirely functional.
      {
        // Ring the bell first, while the panel is still on screen and its PTY
        // is known live, THEN pan away. The other order races: a panel panned
        // out of the cull region can be demoted before the write lands.
        ptyManager.write(shellId, BELL_LINE)
        const rang = await waitUntil(
          async () => (await agentStateOf(shellId)) === 'wants-you', 6000)
        if (rang !== true) throw new Error('58: the panel never reached wants-you')

        await clickBackground()
        await panBy(-1800, -1200)
        await sleep(400)

        const expected = await wc.executeJavaScript(`(() => {
          const rect = window.__m5aSpecOf(${JSON.stringify(shellId)}).rect
          const host = document.querySelector('.canvas').getBoundingClientRect()
          const vp = window.__m4aViewport()
          const size = { width: host.width, height: host.height }
          const M = 24
          const tl = { x: rect.x * vp.scale + vp.x, y: rect.y * vp.scale + vp.y }
          const br = { x: (rect.x + rect.w) * vp.scale + vp.x, y: (rect.y + rect.h) * vp.scale + vp.y }
          if (br.x > 0 && tl.x < size.width && br.y > 0 && tl.y < size.height) return null
          const cx = size.width / 2, cy = size.height / 2
          const dx = (tl.x + br.x) / 2 - cx, dy = (tl.y + br.y) / 2 - cy
          const t = Math.min(
            dx === 0 ? Infinity : Math.max(0, cx - M) / Math.abs(dx),
            dy === 0 ? Infinity : Math.max(0, cy - M) / Math.abs(dy))
          return { x: cx + dx * t, y: cy + dy * t }
        })()`)
        if (expected === null) throw new Error('58: the panel is still on screen after the pan')
        const at = await pipAt(shellId)
        // Sub-pixel: getBoundingClientRect returns fractional boxes. A pip in
        // the wrong place is off by hundreds of pixels, so nothing this
        // tolerance admits is a defect this check could otherwise catch.
        const placed = at !== null &&
          Math.abs(at.x - expected.x) < 2 && Math.abs(at.y - expected.y) < 2
        ok('58 an off-screen wants-you panel gets a pip where edgeIndicator says',
          placed, `${JSON.stringify(at)} expected=${JSON.stringify(expected)}`)
      }

      // 59. Panning the panel back into view removes its pip, WITHOUT the
      //     state changing. The panel still wants you — nothing acknowledged
      //     it — so this is the visibility half of the rule on its own, and
      //     the pip layer must be recomputing against the live camera rather
      //     than latching a set of arrows when the bell rang.
      {
        await panBy(1800, 1200)
        const gone = await waitUntil(async () => (await pipAt(shellId)) === null, 3000)
        ok('59 a pip disappears when its panel comes back into view, state unchanged',
          gone === true && (await agentStateOf(shellId)) === 'wants-you',
          `pip=${JSON.stringify(await pipAt(shellId))} state=${await agentStateOf(shellId)}`)
      }

      // 60. THE SETTING DOES SOMETHING, driven the way a user drives it.
      //     Toggled through the real palette — found by a KEYWORD it does not
      //     display, then run — because that is the production path: main's
      //     settings:list maps over SETTINGS, so the row is generated and the
      //     thing that can actually be wrong is the RENDERER never reading the
      //     value. A setting that lists, toggles, persists and changes nothing
      //     on screen is the quietest failure this surface has, and it is
      //     invisible to verify:palette, whose settings checks build rows from
      //     hand-written fixtures and never import SETTINGS at all.
      //
      //     This block is also the only place the new def's keywords are
      //     exercised: check 52 proves that property for a different setting,
      //     and a keyword list that never matched anything would leave the
      //     switch reachable only by someone who already knew its label.
      {
        await clickBackground()
        await panBy(-1800, -1200)
        await sleep(300)
        const shown = await waitUntil(async () => (await pipAt(shellId)) !== null, 3000)

        // openPalette/closePalette from the 48-53 block above are out of
        // scope here (that block's `{ ... }` already closed), so this is a
        // local pair rather than a second drift-prone spelling reaching
        // across a closed scope — the bodies are copied verbatim from there.
        const openPalette = async () => {
          await wc.executeJavaScript(`
            if (document.querySelector('.palette') === null) {
              window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
            }
          `)
          return waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 2000)
        }
        const closePalette = async () => {
          await wc.executeJavaScript(`(() => {
            const input = document.querySelector('.palette__input')
            if (input) input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
          })()`)
          await sleep(80)
          await wc.executeJavaScript(`(() => {
            const input = document.querySelector('.palette__input')
            if (input) input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
          })()`)
          return sleep(80)
        }
        // closePalette is defined for symmetry with openPalette but never
        // called here: runRow closes the palette BEFORE running a command
        // (see the comment on toggleEdgeIndicators' waitUntil below), so
        // toggling the setting already leaves nothing open to close.

        const toggleEdgeIndicators = async () => {
          await openPalette()
          const picked = await wc.executeJavaScript(`(async () => {
            const setter = Object.getOwnPropertyDescriptor(
              window.HTMLInputElement.prototype, 'value').set
            const input = document.querySelector('.palette__input')
            setter.call(input, 'off-screen')
            input.dispatchEvent(new Event('input', { bubbles: true }))
            await new Promise((r) => setTimeout(r, 100))
            const row = [...document.querySelectorAll('.palette__row')]
              .find((r) => r.textContent.includes('off-screen panels'))
            if (!row) return 'not found'
            row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
            return 'ok'
          })()`)
          if (picked !== 'ok') throw new Error(`60: the setting row was ${picked}`)
          // Running a row closes the palette (runRow closes BEFORE running),
          // but assert it rather than assuming — a left-open overlay would
          // swallow the next check's keys.
          await waitUntil(() => wc.executeJavaScript(
            `document.querySelector('.palette') === null`), 2000)
        }

        await toggleEdgeIndicators()
        const hidden = await waitUntil(async () => (await pipAt(shellId)) === null, 4000)
        const storedOff = await wc.executeJavaScript(
          `window.canvas.settings.list().then((s) =>
             s.find((x) => x.id === 'agent.edgeIndicators').value)`)
        await toggleEdgeIndicators()
        const back = await waitUntil(async () => (await pipAt(shellId)) !== null, 4000)

        ok('60 the edge-indicator setting is findable by keyword and actually hides the pips',
          shown === true && hidden === true && storedOff === false && back === true,
          `shown=${shown} hidden=${hidden} stored=${storedOff} back=${back}`)
        await panBy(1800, 1200)
        await sleep(300)
      }

      const jump = (shift) => wc.executeJavaScript(`
        window.dispatchEvent(new KeyboardEvent('keydown',
          { key: 'j', metaKey: true, shiftKey: ${shift ? 'true' : 'false'}, bubbles: true }))
        true
      `)

      // 61. Cmd+J frames the waiting panel — and frames THAT panel, asserted
      //     as WHERE the camera landed, recomputed from centreOn's own
      //     arithmetic exactly as check 39 does. "The viewport moved" is true
      //     of any pan at all, and a jump key that framed the wrong panel
      //     would satisfy it.
      //
      //     It must also NOT spawn: the jump routes through selectAndRaise,
      //     the half of onSelectPanel factored out precisely so navigation
      //     cannot wake a panel. A wants-you panel has a live PTY and so is
      //     never dormant, but reusing the safe verb is what keeps a future
      //     widening of wants-you from turning a keyboard tour into spawns.
      {
        await clickBackground()
        await panBy(-1800, -1200)
        await sleep(300)
        const spawnedBefore = await wc.executeJavaScript(
          `(window.__m4aSessions().find((s) => s.id === ${JSON.stringify(shellId)}) || {}).spawned`)
        const before = await wc.executeJavaScript(`window.__m4aViewport()`)
        await jump(false)
        await sleep(400)
        const after = await wc.executeJavaScript(`window.__m4aViewport()`)
        const expected = await wc.executeJavaScript(`(() => {
          const rect = window.__m5aSpecOf(${JSON.stringify(shellId)}).rect
          const host = document.querySelector('.canvas').getBoundingClientRect()
          const vp = window.__m4aViewport()
          return {
            x: host.width / 2 - (rect.x + rect.w / 2) * vp.scale,
            y: host.height / 2 - (rect.y + rect.h / 2) * vp.scale
          }
        })()`)
        const spawnedAfter = await wc.executeJavaScript(
          `(window.__m4aSessions().find((s) => s.id === ${JSON.stringify(shellId)}) || {}).spawned`)
        const framed = Math.abs(after.x - expected.x) < 1 && Math.abs(after.y - expected.y) < 1
        ok('61 Cmd+J frames the waiting panel, at the same scale, spawning nothing new',
          framed && after.scale === before.scale && spawnedAfter === spawnedBefore,
          `${JSON.stringify(before)} -> ${JSON.stringify(after)} expected=${JSON.stringify(expected)}`)
      }

      // 62. Landing on the panel does NOT acknowledge it, and the amber
      //     survives the selection ring. Two facts, and both are the decision
      //     this milestone made explicitly: the jump does not focus, so main
      //     never hears an acknowledge, so the state stays wants-you; and the
      //     CSS was inverted so .panel--selected no longer paints over it.
      //
      //     The COLOUR is what this reads, not the state — check 61 already
      //     covers the state — because the silent failure here is purely
      //     visual: the user lands on the panel the key promised and sees
      //     nothing telling them why they are there, while the panel is still
      //     in the queue and the next press may jump straight back to it.
      {
        const selected = await wc.executeJavaScript(
          `!!document.querySelector('[data-panel-id=${JSON.stringify(shellId)}].panel--selected')`)
        const state = await agentStateOf(shellId)
        const colour = await wc.executeJavaScript(`(() => {
          const el = document.querySelector('[data-panel-id=${JSON.stringify(shellId)}]')
          if (!el) return null
          const amber = getComputedStyle(document.documentElement).getPropertyValue('--amber').trim()
          const probe = document.createElement('div')
          probe.style.color = amber
          document.body.appendChild(probe)
          const want = getComputedStyle(probe).color
          probe.remove()
          return { border: getComputedStyle(el).borderTopColor, want }
        })()`)
        ok('62 the jump does not acknowledge, and wants-you outranks the selection ring',
          selected === true && state === 'wants-you' &&
          colour !== null && colour.border === colour.want,
          `selected=${selected} state=${state} ${JSON.stringify(colour)}`)
      }

      // 63. Focus is still what acknowledges — the rule this milestone left
      //     alone — and the pip goes with it. Clicking the panel (now on
      //     screen, because check 61 framed it) sends agent:acknowledge, main
      //     clears the state, the store drops it from the queue, and the pip
      //     layer has nothing left to draw even after panning away again.
      {
        const point = await wc.executeJavaScript(`(() => {
          const el = document.querySelector('[data-panel-id=${JSON.stringify(shellId)}] .panel__slot')
          if (!el) return null
          const r = el.getBoundingClientRect()
          return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
        })()`)
        if (!point) throw new Error('63: the framed panel has no slot to click')
        wc.sendInputEvent({ type: 'mouseDown', x: point.x, y: point.y, button: 'left', clickCount: 1 })
        wc.sendInputEvent({ type: 'mouseUp', x: point.x, y: point.y, button: 'left', clickCount: 1 })
        const cleared = await waitUntil(
          async () => (await agentStateOf(shellId)) !== 'wants-you', 4000)
        await panBy(-1800, -1200)
        await sleep(400)
        ok('63 focus acknowledges, and the pip leaves with the state',
          cleared === true && (await pipAt(shellId)) === null,
          `state=${await agentStateOf(shellId)} pip=${JSON.stringify(await pipAt(shellId))}`)
      }
    }

    // ---------------------------------------------------------------------
    // 64-67 — M7. Workspace switching, end to end in a real renderer.
    //
    //     Everything else in this milestone is provable in plain node: the
    //     store's transaction, the IPC surface, the palette rows. The one
    //     property that actually matters — the SAME PROCESS is there when you
    //     come back — is unprovable anywhere cheaper, because it requires a
    //     real registry holding a real PanelSession across a real switch.
    //     __m7aWorkspace() is this suite's route into switchWorkspace, the
    //     same reason every other __m4a*/__m5a*/__m6* hook exists.
    // ---------------------------------------------------------------------
    {
      // 64. THE PID CHECK. Switch away from the boot workspace (w1, holding
      //     the SEED_PANELS fixture) and back, and every session that
      //     survived must be the SAME PROCESS — not merely the same count.
      //     Every other check in this milestone stays green against an
      //     implementation that disposes on switch: the panels come back,
      //     the layout is right, the file is right, and the agents are dead.
      //     Same argument verify:pty-manager 12 makes for asserting the
      //     reattached pid rather than merely that a session exists.
      //
      //     Reads main's OWN answer (pty:list, via settledSessionMap/
      //     pidsPreserved — the exact helpers checks 4/5 and the M6a block
      //     already use) rather than __m4aSessions(), which the registry hook
      //     exposes with no pid field at all (id/dormant/spawned only) — main
      //     is the authority on pids, and asking it is strictly better than
      //     widening a hook that is deliberately kept narrow.
      const before = await settledSessionMap(wc)
      // Captured, never hardcoded: nextWorkspaceId() mints w<max+1> over
      // whatever ids already exist, so a literal 'w2' here would be a guess
      // this suite has no business making — and a WRONG guess fails
      // silently, since activate() on an unknown id returns null and simply
      // changes nothing (Task 2's own contract), so a check built on one
      // would report a switch that never happened as a passing one.
      const schoolId = await wc.executeJavaScript(`window.__m7aWorkspace().createAndSwitch('school')`)
      await settle()
      await wc.executeJavaScript(`window.__m7aWorkspace().switchTo('w1')`)
      await settle()
      const after = await settledSessionMap(wc)
      const { ok: preserved, changed } = pidsPreserved(before, after)
      ok('64 a switch away and back keeps the SAME pid for every session',
        before.size > 0 && preserved,
        `before=${before.size} sessions changed=[${changed.join(', ')}]`)

      // 65. A hidden workspace's panel is out of the DOM while its session is
      //     still in the registry. This is "demote, not dispose" stated as
      //     two facts that must BOTH hold — the DOM half alone passes against
      //     a dispose, and the registry half alone passes against a switch
      //     that never rendered. Switches to `schoolId`, the id check 64
      //     actually captured back from createAndSwitch — not a literal
      //     'w2' — because that is the one workspace this run guarantees is
      //     both real and still empty.
      await wc.executeJavaScript(`window.__m7aWorkspace().switchTo(${JSON.stringify(schoolId)})`)
      await settle()
      const hidden = await wc.executeJavaScript(`
        ({
          panelsInDom: document.querySelectorAll('.panel').length,
          sessionsInRegistry: window.__m4aSessions().length
        })
      `)
      ok('65 a hidden workspace keeps its sessions and loses its DOM',
        hidden.panelsInDom === 0 && hidden.sessionsInRegistry > 0,
        JSON.stringify(hidden))

      // 66. Cmd+N in the second (still empty, still active) workspace does
      //     not mint an id any OTHER workspace is using. PanelId doubles as
      //     the tmux session name, so a collision is two panels naming one
      //     session — the second to go live attaches to the first one's
      //     process, and neither panel shows anything wrong.
      //
      //     otherIds excludes the ACTIVE workspace deliberately:
      //     allPanelIds() spans EVERY workspace by design (Task 2), so
      //     intersecting the panel this very Cmd+N is about to mint against
      //     the unfiltered set would report a collision with itself the
      //     instant it renders.
      const workspaceRows = await wc.executeJavaScript(`window.canvas.workspace.list()`)
      const otherIds = workspaceRows
        .filter((w) => !w.active)
        .flatMap((w) => w.panelIds)
      zoomTo(wc, 'n')
      await settle()
      // `.panel[data-panel-id]`, not the bare attribute selector: a panel's
      // OWN root and its slot/card children can each carry the attribute
      // (TerminalPanel places it on more than one element), so the bare
      // selector double-counts every panel — visible in an earlier run's
      // `minted=p1,p1,n6,n6,...` output. The panel ROOT is the one place the
      // id is authoritative.
      const minted = await wc.executeJavaScript(`
        Array.from(document.querySelectorAll('.panel[data-panel-id]')).map((e) => e.dataset.panelId)
      `)
      const collision = minted.filter((id) => otherIds.includes(id))
      ok('66 a spawn in another workspace mints no colliding id',
        collision.length === 0, `minted=${minted.join()} otherIds=${otherIds.join()} collision=${collision.join()}`)

      // 67. Cmd+Z immediately after a switch is INERT. history is one stack
      //     over one Panel[], and applyHistory calls registry.dispose for any
      //     panel the undone state no longer contains — so an uncleared stack
      //     would apply the OTHER workspace's array here and kill this
      //     workspace's agents. Doing nothing is the honest failure; doing
      //     something is the dangerous one.
      //
      //     Driven through window.__m4bUndo(), NOT a raw 'z' keydown: Cmd+Z is
      //     a main-process MENU ACCELERATOR (src/main/menu.ts), not a
      //     renderer keybinding the way Cmd+N is (see CLAUDE.md's "Cmd+N
      //     stays a renderer keybinding, not a menu accelerator") — and this
      //     harness is its own Electron entry point with no application menu
      //     (the same reason scripts/panels-entry.cjs passes registerIpcHandlers
      //     a no-op rebuildMenu). A synthetic keydown for 'z' therefore
      //     reaches no listener at all: useViewport's keydown switch has no
      //     'z' case, so zoomTo(wc, 'z') would silently assert a no-op against
      //     a harness that could never have exercised the real path either
      //     way. __m4bUndo() is the hook every other undo-driven check in this
      //     file already uses for exactly this reason (checks 22, 38, 45/46,
      //     50) — it drives the SAME setHistory(h => { undoHistory; applyHistory })
      //     call Cmd+Z's real 'edit:undo' handler runs.
      await wc.executeJavaScript(`window.__m7aWorkspace().switchTo('w1')`)
      await settle()
      const beforeUndo = await wc.executeJavaScript(`
        ({ panels: document.querySelectorAll('.panel').length,
           sessions: window.__m4aSessions().length })
      `)
      await wc.executeJavaScript(`window.__m4bUndo()`)
      await settle()
      const afterUndo = await wc.executeJavaScript(`
        ({ panels: document.querySelectorAll('.panel').length,
           sessions: window.__m4aSessions().length })
      `)
      ok('67 Cmd+Z right after a switch changes nothing',
        beforeUndo.panels === afterUndo.panels && beforeUndo.sessions === afterUndo.sessions,
        `${JSON.stringify(beforeUndo)} -> ${JSON.stringify(afterUndo)}`)

      // 68. THE MASS-SPAWN CHECK. Checks 64-67 all switch between workspaces
      //     this renderer has ALREADY rendered at least once — w1 at boot,
      //     'school'/w2 by creating it live — so registry.ensure already has
      //     (or trivially gets, for an empty workspace) a settled session for
      //     every panel involved, and dormantIds being briefly wrong on the
      //     wrong render is invisible against that fixture. w9/w9p1 close
      //     that gap: seeded on DISK before the window ever loaded (see the
      //     LAYOUT_PATH fixture above), never rendered by this process before
      //     this moment, and its own persisted focusedId names w9p1 —
      //     assignTiers pins a focused panel live UNCONDITIONALLY, so if
      //     dormantIds is wrong on the very first render after the switch
      //     (committing `next` before `pty.list()` resolves, the exact bug
      //     this check exists to catch), this fixture forces it into a spawn
      //     rather than merely hoping a camera/cull coincidence produces one.
      await wc.executeJavaScript(`window.__m7aWorkspace().switchTo('${NEVER_RENDERED_WORKSPACE_ID}')`)
      await settle()
      // Waits for the FAILURE condition (a live session appearing) rather
      // than reading absence immediately: the spawn path is a few IPC round
      // trips deep (fit-before-spawn, then pty:create), so an instant read
      // could pass for a reason that has nothing to do with correctness — the
      // spawn simply had not landed yet. Other checks in this suite wait
      // 3-8s for a GENUINE spawn to land, so 3s of silence here is well past
      // that budget before the negative is trusted.
      const spawned = await waitUntil(
        async () => (await sessionMap(wc)).has(NEVER_RENDERED_PANEL_ID), 3000)
      const sessions68 = await wc.executeJavaScript(`window.__m4aSessions()`)
      const registered = sessions68.find((s) => s.id === NEVER_RENDERED_PANEL_ID)
      ok('68 a workspace switched to for the first time spawns nothing, even focused',
        spawned !== true && registered !== undefined &&
          registered.dormant === true && registered.spawned === false,
        `spawned=${spawned} registered=${JSON.stringify(registered)}`)
      // This block leaves NEVER_RENDERED_WORKSPACE_ID active when it ends —
      // there is no switch back to whatever was active before. Checks 69+
      // run against whatever workspace this one left active, not against a
      // known starting point.
    }

    // 69-70 — Task 6. Create/rename/delete from the palette, and the fourth
    //     registry.dispose call site. __m7aWorkspace().deleteWorkspace(id)
    //     drives the SAME gated action a real "Delete workspace…" row does
    //     (paletteActions.deleteWorkspace) rather than a bypass, which is
    //     what lets these two checks tell a real confirm gate apart from a
    //     delete function that runs unconditionally.
    {
      // 69. Deleting a workspace disposes its panels' sessions. Not detach —
      //     the record is going, so a surviving session is one no UI can
      //     ever reach or stop: backlog #61 (recover an orphan session) does
      //     not exist, so it would burn tokens invisibly until quit
      //     kill-servers the socket.
      //
      //     The plan's own check for this omitted the confirm step
      //     entirely — it called deleteWorkspace(id) and expected the
      //     session gone after a plain settle(), which only holds if the
      //     confirm gate does nothing, i.e. against a BROKEN implementation.
      //     Against the real gated action nothing is disposed until the
      //     question is answered, so this check answers it with a real
      //     Enter on the reopened palette's own input before reading
      //     anything back — the same reason check 50 clicks a real row
      //     rather than calling a store method directly.
      await wc.executeJavaScript(`window.__m7aWorkspace().createAndSwitch('doomed')`)
      await settle()
      await zoomTo(wc, 'n') // one panel in 'doomed', which goes live and spawns
      await settle()
      const before = await wc.executeJavaScript(`window.__m4aSessions().length`)
      const doomed = await wc.executeJavaScript(`
        window.canvas.workspace.list().then((r) => (r.find((w) => w.name === 'doomed') || {}).id)
      `)
      await wc.executeJavaScript(`window.__m7aWorkspace().deleteWorkspace(${JSON.stringify(doomed)})`)
      await settle()
      await pressPlain(wc, 'Enter') // answers the confirm; see this block's own comment
      await settle()
      const after = await wc.executeJavaScript(`window.__m4aSessions().length`)
      const rows69 = await wc.executeJavaScript(`window.canvas.workspace.list()`)
      ok('69 deleting a workspace disposes its sessions and its record',
        after < before && !rows69.some((w) => w.name === 'doomed'),
        `sessions ${before} -> ${after} rows=${rows69.length}`)

      // 70. The confirm is a real gate: Escape leaves the workspace
      //     UNDELETED, read back out of workspace.list() rather than off the
      //     overlay. A confirm step that confirms unconditionally is
      //     invisible — the same reason check 50 reads preset.list()
      //     instead of the DOM.
      //
      //     The plan's own check dispatched Escape on `window`, which never
      //     reaches Palette.tsx's onKeyDown at all — that handler is bound
      //     to the palette's own `<input>`, and a window-targeted dispatch
      //     only reaches window's own listeners, never a descendant's
      //     (bubbling runs from the EVENT'S TARGET upward, and window has no
      //     ancestors to bubble past its own target in the first place —
      //     see CLAUDE.md's ".panel__slot never reaches xterm's listeners"
      //     for the same shape of mistake). pressPlain instead dispatches on
      //     `document.activeElement`, which the confirm input holds because
      //     opening the palette always focuses it (rule 1 in Canvas.tsx's
      //     "who owns the keyboard").
      const keepId = await wc.executeJavaScript(`window.canvas.workspace.create('keepme')`)
      await settle()
      await wc.executeJavaScript(`window.__m7aWorkspace().deleteWorkspace(${JSON.stringify(keepId)})`)
      await settle()
      await pressPlain(wc, 'Escape')
      await settle()
      const rows70 = await wc.executeJavaScript(`window.canvas.workspace.list()`)
      ok('70 Escape at the confirm leaves the workspace undeleted',
        rows70.some((w) => w.id === keepId), `rows=${rows70.map((w) => w.name).join()}`)
    }

    // 70b — Task 7. M6d's premise applied to the strongest case of "an agent
    //     you cannot see": a wants-you panel whose whole CANVAS is hidden,
    //     not merely off screen. The count on its workspace row is read off
    //     a real rendered palette row, through main's real store — the same
    //     end-to-end shape checks 54-63 already used for the pip layer.
    //
    //     A fresh workspace, never hardcoded: createAndSwitch mints its own
    //     id the way checks 64-68 insist on, and this check reads it back
    //     rather than guessing a literal.
    {
      const BELL_LINE = "printf '\\007'\n"
      await wc.executeJavaScript(
        `window.__m7aWorkspace().createAndSwitch('waitroom')`)
      await settle()
      // A real shell, not Cmd+N's default `cat`: cat only ECHOES what it is
      // given, so writing BELL_LINE's literal backslash-escaped text to one
      // produces no actual 0x07 byte at all — the same reason checks 54-63
      // spawn through PRESET_SPAWN with an explicit /bin/sh rather than
      // using zoomTo(wc, 'n'). PRESET_SPAWN lands in whichever workspace is
      // currently active, which 'waitroom' now is.
      const idsBefore70b = await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
      win.webContents.send(IPC_EVENTS.PRESET_SPAWN, { cwd: '/tmp', command: '/bin/sh', args: [] })
      const panelId = await waitUntil(async () => {
        const now = await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
        return now.find((id) => !idsBefore70b.includes(id)) || false
      }, 4000)
      if (!panelId) throw new Error('70b: PRESET_SPAWN produced no new panel')
      // Lazy spawn: the PTY exists only once the panel has gone live and been
      // laid out, so nothing may be written to it until pty:list admits it.
      const spawned = await waitUntil(
        async () => (await settledSessionMap(wc)).has(panelId), 8000)
      if (!spawned) throw new Error(`70b: panel ${panelId} never got a PTY`)

      // Ring a real bell while the panel is still on screen and known live,
      // THEN leave — the same ordering check 58 uses and for the same
      // reason: switching away first would demote/unmount the panel before
      // the write could land.
      ptyManager.write(panelId, BELL_LINE)
      const rang = await waitUntil(async () => wc.executeJavaScript(`
        document.querySelector('.panel[data-panel-id=${JSON.stringify(panelId)}]')
          ?.dataset.agentState
      `).then((s) => s === 'wants-you'), 6000)
      if (rang !== true) throw new Error('70b: the panel never reached wants-you')

      // Leave — 'waitroom' is now hidden, its panel gone from the DOM, its
      // session and its agent state both still alive underneath.
      await wc.executeJavaScript(`window.__m7aWorkspace().switchTo('w1')`)
      await settle()

      await zoomTo(wc, 'k') // open the palette
      await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette') !== null`), 2000)
      const titles70b = await wc.executeJavaScript(`
        Array.from(document.querySelectorAll('.palette__row')).map((e) => e.textContent)
      `)
      ok('70b a hidden workspace with a waiting panel says so on its row',
        titles70b.some((t) => t.includes('waiting')), titles70b.join(' | '))

      await pressPlain(wc, 'Escape')
      await settle()
    }

    // 71 — fix round 1, finding #1/#2. Deleting the workspace you are IN when
    //     it is the ONLY one left must not resurrect its disposed panels in
    //     the fresh replacement main installs. Checks 69/70 only ever
    //     exercise the "a neighbour already exists" branch of deleteWorkspace
    //     — this drives the other one, which is unreachable unless every
    //     OTHER workspace is gone first. There is no way to get there without
    //     actually deleting them: this suite has accumulated several by this
    //     point (the boot workspace, 'never rendered', 'school', 'keepme'),
    //     and none of that is special setup — it is what "exactly one
    //     workspace" actually requires, deleted through the same real gate
    //     69/70 already proved correct so this check is free to trust it.
    {
      const soleId = await wc.executeJavaScript(`window.__m7aWorkspace().createAndSwitch('sole')`)
      await settle()
      await zoomTo(wc, 'n') // one panel in 'sole', which goes live and spawns
      await settle()
      const solePanelId = await wc.executeJavaScript(`
        window.canvas.workspace.list().then((r) =>
          (r.find((w) => w.id === ${JSON.stringify(soleId)}) || { panelIds: [] }).panelIds[0])
      `)

      // Delete every OTHER workspace. None of them is active, so each is a
      // plain dispose+remove with no switch involved — the loop's own
      // correctness rests entirely on 69/70, not on anything new here.
      const others = (await wc.executeJavaScript(`window.canvas.workspace.list()`))
        .filter((w) => w.id !== soleId)
      for (const w of others) {
        await wc.executeJavaScript(`window.__m7aWorkspace().deleteWorkspace(${JSON.stringify(w.id)})`)
        await settle()
        await pressPlain(wc, 'Enter')
        await settle()
      }
      const onlyOneLeft = await wc.executeJavaScript(`window.canvas.workspace.list()`)
      const before71 = await wc.executeJavaScript(`window.__m4aSessions().length`)

      // Now delete the LAST remaining workspace — the branch under test.
      await wc.executeJavaScript(`window.__m7aWorkspace().deleteWorkspace(${JSON.stringify(soleId)})`)
      await settle()
      await pressPlain(wc, 'Enter')
      await settle()
      const after71 = await wc.executeJavaScript(`window.__m4aSessions().length`)
      const rowsFinal = await wc.executeJavaScript(`window.canvas.workspace.list()`)
      const freshActive = rowsFinal.find((w) => w.active)
      ok('71 deleting the only remaining workspace disposes its sessions ' +
         'and does not resurrect them in the fresh replacement',
        onlyOneLeft.length === 1 && onlyOneLeft[0].id === soleId &&
          after71 < before71 &&
          rowsFinal.length === 1 && !rowsFinal.some((w) => w.id === soleId) &&
          freshActive !== undefined && !freshActive.panelIds.includes(solePanelId),
        `onlyOneLeft=${onlyOneLeft.length} sessions ${before71}->${after71} ` +
        `rowsFinal=${JSON.stringify(rowsFinal)} solePanelId=${solePanelId}`)
      // This must remain the LAST workspace check in the suite: it deletes
      // every fixture workspace, including the sole survivor, so anything
      // appended after it inherits a one-workspace, zero-panel world with
      // none of the earlier fixtures (w1, w2/'school', w9/w9p1) still around.
    }

    // 72. THE FRAME INSETS THE CANVAS, and the canvas survives being inset.
    //
    //     Two assertions, and the second is the one worth having. That the
    //     canvas got narrower is nearly tautological once a grid exists. That a
    //     panel is STILL PROMOTED afterwards is not: a narrower canvas host is a
    //     smaller cull region, assignTiers legitimately demotes on it, and a
    //     frame that quietly demoted the panel the user was looking at would
    //     render as a card with no error anywhere. The .xterm probe is the same
    //     "is it still live" proof check 51 makes for the spawn cascade.
    //
    //     The Cmd+N is not decoration: check 71 above deletes every fixture
    //     workspace and leaves a one-workspace, ZERO-panel world behind (its
    //     own closing comment says so), so this check has to mint the panel
    //     whose promotion it is about to assert. Spawning it here also makes
    //     the promotion claim stronger than inheriting a survivor would: the
    //     panel is created at the camera's centre on the ALREADY-inset canvas.
    {
      await zoomTo(wc, 'n')
      await settle()
      const geom = await wc.executeJavaScript(`(() => {
        const shell = document.querySelector('.shell')
        const canvas = document.querySelector('.canvas')
        const rail = document.querySelector('.shell__rail')
        const inspector = document.querySelector('.shell__inspector')
        if (!shell || !canvas || !rail || !inspector) return null
        const c = canvas.getBoundingClientRect()
        return {
          canvasWidth: c.width,
          windowWidth: window.innerWidth,
          railWidth: rail.getBoundingClientRect().width,
          inspectorWidth: inspector.getBoundingClientRect().width,
          canvasLeft: c.left
        }
      })()`)
      const live = await wc.executeJavaScript(
        `document.querySelectorAll('.panel .xterm').length`)
      ok('72 the shell frame insets the canvas and leaves a panel promoted',
        geom !== null && geom.railWidth > 40 && geom.inspectorWidth > 40 &&
          geom.canvasWidth < geom.windowWidth - 80 &&
          geom.canvasLeft >= geom.railWidth - 1 &&
          // The EXACT inset, and it is the clause that does the discriminating.
          // Every bound above it is loose enough to survive the one CSS failure
          // the frame's own comment names: drop `min-width: 0` from the canvas
          // cell and the grid item refuses to shrink, so the canvas overflows
          // and shoves the inspector off screen — yet getBoundingClientRect()
          // reports width for an element pushed out of view exactly as it does
          // for a visible one, so railWidth is still 240, inspectorWidth is
          // still 260, canvasLeft is still 240, and an overflowing canvasWidth
          // is still comfortably under windowWidth - 80. All five loose clauses
          // pass under that regression. Only the identity — the three columns
          // summing to the window — fails, because an overflowing middle cell is
          // precisely a canvas WIDER than the space the other two leave it.
          // ±1 for fractional device pixels, not for slack in the claim.
          Math.abs(geom.canvasWidth -
            (geom.windowWidth - geom.railWidth - geom.inspectorWidth)) <= 1 &&
          live > 0,
        JSON.stringify(geom) + ` live=${live}`)
      // The state this check LEAVES BEHIND, in the same spirit as 71's own
      // closing note, because this is a top-to-bottom suite and 73 onward will
      // be appended directly below: the zero-panel world 71 describes ends
      // here. Check 72 spawns one panel via Cmd+N at the camera's centre and
      // lets it go live, so anything appended after this inherits a
      // one-workspace world holding ONE panel with a live PTY — not an empty
      // one. A later check that counts panels, counts sessions, or presses
      // Cmd+Z expecting nothing to undo must account for it.
    }

    // 73. THE PALETTE'S THIRD EXIT STILL WORKS FROM THE SHELL.
    //
    //     Task 2 made the shell a SIBLING of .canvas, and the outside-click
    //     dismissal is a capture listener on .canvas — so without this it never
    //     runs for a shell click and the overlay stays up with DOM focus on a
    //     button. That is the fourth, un-audited exit "Three ways out of the
    //     palette" exists to remove, and Escape cannot undo it because the key no
    //     longer reaches the palette's own onKeyDown.
    //
    //     Check 42 already pins the canvas case and must stay green: this is an
    //     ADDITIONAL door, not a replacement one.
    {
      await wc.executeJavaScript(`
        if (document.querySelector('.palette') === null) {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
        }
      `)
      const opened = await waitUntil(
        () => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 2000)
      const dismissed = await wc.executeJavaScript(`(async () => {
        const rail = document.querySelector('.shell__rail')
        rail.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 20, clientY: 300 }))
        await new Promise((r) => setTimeout(r, 120))
        return document.querySelector('.palette') === null
      })()`)
      ok('73 a mousedown on the shell dismisses the open palette',
        opened === true && dismissed === true,
        `opened=${opened} dismissed=${dismissed}`)
    }

    // 74. COLLAPSE IS REAL LAYOUT, AND IT PERSISTS TO MAIN'S STORE.
    //     Read back through settings:list rather than off the shell's own class,
    //     for the same reason check 53 does: a toggle that only flips a local
    //     boolean looks identical on screen and is gone on the next launch.
    {
      const before = await wc.executeJavaScript(
        `document.querySelector('.canvas').getBoundingClientRect().width`)
      await wc.executeJavaScript(`
        document.querySelector('.shell__rail-toggle').dispatchEvent(
          new MouseEvent('click', { bubbles: true }))
      `)
      await sleep(150)
      const after = await wc.executeJavaScript(
        `document.querySelector('.canvas').getBoundingClientRect().width`)
      const stored = await wc.executeJavaScript(
        `window.canvas.settings.list().then((rows) =>
           rows.find((r) => r.id === 'shell.railOpen').value)`)
      ok('74 collapsing the rail widens the canvas and reaches main\'s store',
        after > before + 100 && stored === false,
        `before=${before} after=${after} stored=${stored}`)
    }

    // 74b. AUTO-REPEAT IS ONE GESTURE. A held Cmd+\ toggles once, not fifteen
    //      times — the Cmd+K defect, which for a toggle means the rail's final
    //      state depends on whether the user released on an odd or even repeat.
    //      Like checks 7b and 33b this supplies repeat:true by hand, so it proves
    //      the guard READS the flag and says nothing about who sets it.
    {
      const open = () => wc.executeJavaScript(
        `document.querySelector('.shell').classList.contains('shell--rail-collapsed')`)
      const start = await open()
      await wc.executeJavaScript(`
        for (let i = 0; i < 5; i++) {
          window.dispatchEvent(new KeyboardEvent('keydown', {
            key: '\\\\', code: 'Backslash', metaKey: true, repeat: true, bubbles: true }))
        }
      `)
      await sleep(200)
      const afterRepeats = await open()
      await wc.executeJavaScript(`
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: '\\\\', code: 'Backslash', metaKey: true, repeat: false, bubbles: true }))
      `)
      await sleep(200)
      const afterReal = await open()
      ok('74b a held Cmd+\\ toggles the rail once, not once per repeat',
        afterRepeats === start && afterReal !== start,
        `start=${start} afterRepeats=${afterRepeats} afterReal=${afterReal}`)
    }

    // 74c. A SHELL CONTROL NEVER TAKES THE KEYBOARD.
    //      The quietest failure this surface has: click a button, and the next
    //      keystroke goes nowhere because DOM focus is on the button rather than
    //      xterm's hidden textarea. focusedId ALSO has to survive — assignTiers
    //      pins the focused panel live, and it is the Cmd+C target.
    //
    //      Two deliberate departures from the brief's draft of this check, both
    //      forced by what the renderer actually exposes.
    //
    //      (1) There is NO route from this suite to `focusedId` itself.
    //      `__m4aSelection()` — the draft's read — returns xterm's SELECTED TEXT
    //      (a string), so `.focusedId` on it is `undefined` at both ends and the
    //      draft's equality would have compared undefined to a panel id, failing
    //      for a reason that has nothing to do with shell controls.
    //      PRESET_CAPTURE is no substitute either: it answers with the focused
    //      panel's SPEC (cwd/args/w/h), never its id — check 30 pins exactly
    //      that shape. So the two halves are probed the way the suite already
    //      probes them, with no new renderer hook minted for one check:
    //        - the exact IDENTITY, from `document.activeElement.closest('.panel')`,
    //          which is where a stolen keyboard shows up and is the same read
    //          check 6 uses for "a body click focuses the panel";
    //        - `focusedId` NOT BEING RELEASED, from `__m4aGrid() !== null`,
    //          which resolves through focusedIdRef — check 41's own probe, and
    //          its comment explains why a non-null answer means "the app still
    //          believes a live panel is focused".
    //      What that pair cannot distinguish, stated rather than implied: a
    //      control that swapped focusedId to a DIFFERENT live panel while DOM
    //      focus stayed put would satisfy both. No such swap is reachable from a
    //      button that never calls onSelectPanel, and closing the gap would mean
    //      a new __m8a* hook for a fact nothing else needs.
    //
    //      (2) There is no top-level `clickPanel(id)` helper in this file; the
    //      real-OS-click idiom is copied in locally below, the way checks 60 and
    //      73 define their own local helpers rather than reaching across scopes.
    //      A DISPATCHED mousedown would not serve: it sets focusedId, but the
    //      browser moves no DOM focus for a synthetic event, so `insideBefore`
    //      would be false and the check would prove nothing about the half it
    //      exists for.
    {
      // The real-click focus idiom, copied from clickPanelBody (~line 761) and
      // narrowed to what this check needs: sendInputEvent, not a dispatched
      // MouseEvent, because only a real OS-level click moves DOM focus into
      // xterm's hidden textarea — which is exactly what a shell control must
      // not steal.
      const realClick = async (selector) => {
        const box = await wc.executeJavaScript(
          `(() => { const s = document.querySelector(${JSON.stringify(selector)});
                    if (!s) return null;
                    const r = s.getBoundingClientRect();
                    return { x: Math.round(r.left + r.width / 2),
                             y: Math.round(r.top + r.height / 2) } })()`)
        if (!box) throw new Error(`74c: no element matched ${selector}`)
        wc.sendInputEvent({ type: 'mouseDown', x: box.x, y: box.y, button: 'left', clickCount: 1 })
        wc.sendInputEvent({ type: 'mouseUp', x: box.x, y: box.y, button: 'left', clickCount: 1 })
        await sleep(150)
      }
      const id = await wc.executeJavaScript(
        `document.querySelector('.panel__slot').closest('.panel').getAttribute('data-panel-id')`)
      await realClick(`.panel[data-panel-id="${id}"] .panel__slot`)
      // Both halves in one read, so they describe the same instant.
      const probe = () => wc.executeJavaScript(`(() => {
        const host = document.activeElement && document.activeElement.closest('.panel')
        return {
          inside: host !== null && host !== undefined,
          id: host ? host.getAttribute('data-panel-id') : null,
          focusedLive: window.__m4aGrid() !== null
        }
      })()`)
      const before = await probe()
      // A REAL click on the toggle, not the draft's dispatched pair. This is
      // what makes the check capable of failing at all: a synthetic MouseEvent
      // is untrusted, and Chromium runs no default action for one — so it
      // never moves DOM focus to the button whether or not onMouseDown calls
      // preventDefault(), and a dispatched-event version of this check passes
      // identically against the very regression it exists to catch. Confirmed
      // by deleting the preventDefault and watching this go red.
      await realClick('.shell__rail-toggle')
      const after = await probe()
      ok('74c a shell control takes neither focusedId nor DOM focus',
        before.inside === true && after.inside === true &&
          before.id === id && after.id === id &&
          before.focusedLive === true && after.focusedLive === true,
        `panel=${id} before=${JSON.stringify(before)} after=${JSON.stringify(after)}`)
      // What 74/74b/74c LEAVE BEHIND, in the spirit of 72's own closing note:
      // the one-panel, one-workspace world is unchanged, but the rail is now
      // COLLAPSED and `shell.railOpen` is false in main's store (74 collapsed
      // it, 74b's one real chord reopened it, 74c's button click collapsed it
      // again). The inspector is untouched and still open. Anything appended
      // below that measures the canvas's width — or clicks at a screen point
      // captured before this block — must account for the narrower rail.
    }

    // 75. THE SPAWN BUTTON SPAWNS EXACTLY ONE PANEL, THROUGH MAIN.
    //     Exactly one is half the check: a button that also let its click reach
    //     the canvas background would spawn once and select something else, and a
    //     double-fire looks identical to a slow machine.
    {
      const before = await wc.executeJavaScript(`window.__m4aSessions().length`)
      await wc.executeJavaScript(`
        document.querySelector('.shell__spawn').dispatchEvent(
          new MouseEvent('click', { bubbles: true }))
      `)
      await sleep(400)
      const after = await wc.executeJavaScript(`window.__m4aSessions().length`)
      ok('75 the New panel button spawns exactly one panel',
        after === before + 1, `${before} -> ${after}`)
    }

    // 76. THE ZOOM CLUSTER MOVES THE CAMERA THROUGH NAMED VERBS.
    //     Reads __m4aScale rather than a CSS transform so it is the same number
    //     viewport.ts computes. Fit is asserted separately from the steppers
    //     because they are different verbs and a wiring that pointed both at
    //     resetViewport would still change the scale.
    //
    //     The Fit clause is an inequality against backOut, NOT `fitted > 0`,
    //     and the difference is the whole discrimination. `fitted > 0` is
    //     satisfied by any non-zero scale: it passes against a Fit button
    //     wired to resetViewport (scale 1), wired to zoomBy, and — worst —
    //     wired to NOTHING AT ALL, since the scale then simply stays where the
    //     steppers left it. Those are exactly the wirings the paragraph above
    //     claims to separate, so the weaker form asserted nothing about Fit.
    //     Requiring the scale to have MOVED off backOut is what pins that the
    //     button ran and did something the steppers did not.
    //
    //     Why not recompute fitTo's expected scale from __m4aViewport() and
    //     assert equality: that means restating fitTo's padding and clamp
    //     arithmetic here, i.e. a second copy of math verify:viewport already
    //     pins purely, and a copy that drifts silently the first time the real
    //     one changes. The inequality needs no copy and fails against all
    //     three mis-wirings above.
    {
      const start = await wc.executeJavaScript(`window.__m4aScale()`)
      await wc.executeJavaScript(`
        document.querySelector('.shell__zoom-in').dispatchEvent(
          new MouseEvent('click', { bubbles: true }))
      `)
      await sleep(120)
      const zoomedIn = await wc.executeJavaScript(`window.__m4aScale()`)
      await wc.executeJavaScript(`
        document.querySelector('.shell__zoom-out').dispatchEvent(
          new MouseEvent('click', { bubbles: true }))
      `)
      await sleep(120)
      const backOut = await wc.executeJavaScript(`window.__m4aScale()`)
      await wc.executeJavaScript(`
        document.querySelector('.shell__fit').dispatchEvent(
          new MouseEvent('click', { bubbles: true }))
      `)
      await sleep(200)
      const fitted = await wc.executeJavaScript(`window.__m4aScale()`)
      ok('76 the zoom cluster steps in, steps out, and fits',
        zoomedIn > start + 0.01 && Math.abs(backOut - start) < 0.001 &&
          Math.abs(fitted - backOut) > 0.001,
        `start=${start} in=${zoomedIn} out=${backOut} fit=${fitted}`)
    }

    // 77. SEARCH AND SETTINGS OPEN THE PALETTE, AND SETTINGS ARRIVES IN ITS SCOPE.
    //     The scope is the half that matters: an M6b setting is hiddenAtRest, so a
    //     settings button that merely opened the palette would land the user on a
    //     list with no settings visible at all — a feature that reads as missing.
    {
      await wc.executeJavaScript(`(() => {
        const input = document.querySelector('.palette__input')
        if (input) input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      })()`)
      await sleep(120)
      await wc.executeJavaScript(`
        document.querySelector('.shell__search').dispatchEvent(
          new MouseEvent('click', { bubbles: true }))
      `)
      const searchOpened = await waitUntil(
        () => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 2000)
      await wc.executeJavaScript(`(() => {
        const input = document.querySelector('.palette__input')
        if (input) input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      })()`)
      await sleep(120)
      await wc.executeJavaScript(`
        document.querySelector('.shell__settings').dispatchEvent(
          new MouseEvent('click', { bubbles: true }))
      `)
      await waitUntil(
        () => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 2000)
      await sleep(150)
      const inScope = await wc.executeJavaScript(`(() => {
        const chip = document.querySelector('.palette__scope')
        const rows = [...document.querySelectorAll('.palette__row')]
        return {
          chip: chip ? chip.textContent.trim() : null,
          sawASetting: rows.some((r) => r.textContent.includes('Idle after'))
        }
      })()`)
      ok('77 search opens the palette and settings opens it in the settings scope',
        searchOpened === true && inScope.sawASetting === true,
        `search=${searchOpened} scope=${JSON.stringify(inScope)}`)
      // What 75/76/77 LEAVE BEHIND, in the spirit of 72's and 74c's closing
      // notes. The world now holds TWO live panels, not one: check 75's spawn
      // is real and is never undone. The camera is wherever `Fit` put it (a
      // fitTo over both panels), NOT at INITIAL — anything appended below that
      // reuses a screen coordinate captured earlier in this file is measuring
      // against a camera that has moved. The rail is still collapsed and the
      // inspector still open, both untouched here. The palette is closed: the
      // two Escapes below pop the settings scope and then close the overlay,
      // because Escape inside a drill-in deliberately pops rather than closes
      // (Palette.tsx's two-stage rule), so ONE Escape would leave the overlay
      // up and swallow the next check's keyboard.
      for (let i = 0; i < 2; i++) {
        await wc.executeJavaScript(`(() => {
          const input = document.querySelector('.palette__input')
          if (input) input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        })()`)
        await sleep(120)
      }
    }

  } catch (error) {
    // An infrastructure failure (e.g. a missing DOM target, a rejected
    // executeJavaScript) still has to report through the same PASS/FAIL
    // shape and still has to reach the summary below — printing nothing and
    // just crashing is exactly the silent hang this suite exists to avoid.
    console.error('\nFAIL  infrastructure error: ' + (error && error.stack ? error.stack : error))
    results.push({ n: 'infrastructure', pass: false, detail: String(error) })
  } finally {
    if (!watchdogFired) {
      console.log('\n' + '='.repeat(60))
      const failed = results.filter((r) => !r.pass)
      console.log(`${results.length - failed.length}/${results.length} passed`)
      if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
      try {
        ptyManager.killAll() // the seed panels' shells would otherwise outlive this process
        // kill-server on PANELS_SOCKET only. Check 26's surviving session is
        // the whole point of that check, so nothing before this teardown may
        // end it — and nothing after this run may keep it.
        if (tmuxBackend) tmuxBackend.shutdown()
      } catch (error) {
        console.error('FAIL  teardown: killAll threw', error)
        results.push({ n: 'teardown', pass: false, detail: String(error) })
      }
      // Disarmed only once teardown is past everything that can throw. Clearing
      // it first meant a throwing killAll() left the run hung with no exit code
      // and the watchdog already disabled — the exact failure class this file's
      // watchdog exists to prevent.
      clearTimeout(watchdog)
      await sleep(300) // let node-pty's native teardown land before app.exit() tears down the process
      app.exit(results.some((r) => !r.pass) ? 1 : 0)
    } else {
      clearTimeout(watchdog)
    }
  }
})
