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
  requestFromRenderer,
  pushDefaultPreset,
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
  const ptyManager = new PtyManager(() => win.webContents, () => backend)

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
  writeFileSync(LAYOUT_PATH, JSON.stringify({
    version: 1,
    activeWorkspaceId: 'w1',
    workspaces: [{
      id: 'w1', name: 'Canvas', panels: [],
      camera: { ...DEFAULT_CAMERA }, selectedId: null, focusedId: null
    }],
    presets: [BOOT_DEFAULT_PRESET],
    defaultPresetId: BOOT_DEFAULT_PRESET.id
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
  registerIpcHandlers(ptyManager, layoutStore, () => ({ kind: backend.kind, reason: backend.reason }))

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
    // Run at the ~0.69 scale check 6 left behind on purpose — at scale 1 with
    // no translation, screen and world coordinates coincide and the conversion
    // this asserts would be untestable.
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
    //     Nothing else in the 165-check suite could catch its loss.
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
      const title = newId ? await wc.executeJavaScript(
        `document.querySelector('.panel[data-panel-id="${newId}"] .panel__title').textContent`) : null
      ok('31 a command-less preset stays command-less and reads as the login shell',
        spec !== null && spec.spec.command === undefined && title === 'login shell',
        `command=${spec && JSON.stringify(spec.spec.command)} title=${title}`)
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
