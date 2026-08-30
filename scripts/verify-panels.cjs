/* Verifies terminals on the canvas in a real renderer.
   Run with: npm run build && npm run verify:panels

   Check 4 is the reason this file exists: culling must not kill a PTY. That
   failure is silent in a running app — the panel returns looking like a fresh
   terminal — so it has to be caught mechanically. pty:list makes it possible. */
const { buildSync } = require('esbuild')
const { join } = require('node:path')
const { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync, realpathSync } = require('node:fs')
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
  whichFromEnv,
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
  presetFromCapture,
  mergePrompts,
  readProjectPrompts,
  resolveCwd,
  IPC_EVENTS,
  createReviewEngine,
  createGitRunner,
  createBaselineCapture,
  createReviewCommitter
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
const { verifySocket } = require('./verify-socket.cjs')
const PANELS_SOCKET = verifySocket('terminal-canvas-verify-panels')
console.log(`[verify:panels] tmux socket: ${PANELS_SOCKET}`)

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

/**
 * Clicks a point on the canvas background that no panel covers, so the
 * background handler clears the selection instead of selecting something.
 *
 * A fixed corner is not safe and the reason is the whole helper: a cascaded
 * spawn (check 51) or a restored layout can put a panel anywhere, and a click
 * that lands on one SELECTS it — the exact opposite of what a check about the
 * empty state needs, and it would fail as "the summary did not render" with
 * nothing pointing at the coordinates.
 */
const clickEmptyCanvas = (wc) => wc.executeJavaScript(`(() => {
  const host = document.querySelector('.canvas')
  const box = host.getBoundingClientRect()
  const rects = [...document.querySelectorAll('.panel')].map((p) => p.getBoundingClientRect())
  for (let y = box.top + 20; y < box.bottom - 20; y += 40) {
    for (let x = box.left + 20; x < box.right - 20; x += 40) {
      if (!rects.some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)) {
        host.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y }))
        // The mouseup is not decoration, and it was missing until M14. A
        // background mousedown now ARMS a document-level gesture (the marquee)
        // rather than merely being a click, so an unpaired one leaves a
        // mousemove listener on the document that outlives this helper and
        // rewrites the selection on the next real pointer movement — hundreds
        // of checks later, in whichever check happens to drag next, which
        // would then fail for a reason pointing nowhere near itself.
        host.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y }))
        return { x, y }
      }
    }
  }
  return null
})()`)

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

// Raised from 60s at M8c. Check 91 adds a full renderer RELOAD plus the
// reattach round trip that follows it (restore, promote, spawn, has-session
// probe), and check 92 adds a spawn, a bell and a restart on top — together
// comfortably more than the headroom the old bound had left. A watchdog that
// fires on a healthy run reports a hang that is not there, and the run's real
// failures never print at all.
const WATCHDOG_MS = 120000

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
  // Captured, not discarded: git is resolved by ABSOLUTE path from this
  // env, the same single resolution main/index.ts performs at whenReady.
  const loginEnv = await resolveShellEnv()
  const gitPath = whichFromEnv('git', loginEnv)

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
  // The last two arguments (captureBaseline/dropBaseline) close over
  // baselineCapture, built further below alongside reviewEngine — the exact
  // same forward-closure this constructor already relies on for layoutStore
  // one line up. Neither is ever CALLED until a real pty:create runs, which
  // is long after the whole setup function below has finished executing, so
  // there is no temporal-dead-zone hazard in reading a later `const` here.
  // Without these two, checks 99-101 would query a review engine that never
  // received a baseline for any panel — every result reads never-started,
  // on an engine that is otherwise wired correctly, which looks exactly like
  // a broken engine and points nowhere near the real cause.
  const ptyManager = new PtyManager(
    () => win.webContents,
    () => backend,
    () => Number(layoutStore.getSetting('agent.idleAfterMs')),
    () => layoutStore.getSetting('agent.bell') === true,
    (panelId, cwd) => baselineCapture.capture(panelId, cwd),
    // BOTH halves, exactly as main/index.ts's own dropBaseline does them:
    // poison any in-flight capture AND drop the persisted record. Dropping
    // only the first is a harness that keeps answering review:panel for a
    // panel it has just killed — which is the precise state check 110's
    // fault injection has to be able to see, and with the store half missing
    // that injection stayed GREEN (observed, not argued: swapping the node
    // to review:panel left 110 passing until this line grew its second
    // half). A harness that mirrors production loosely proves the app works
    // for a configuration nobody ships.
    (panelId) => {
      baselineCapture.drop(panelId)
      layoutStore.dropBaseline(panelId)
    }
  )

  /**
   * Every panel id main was ever ASKED to kill, in order — the one fact
   * checks 111 and 111b need and the one no renderer can read back.
   *
   * A kill aimed at an id that names no session is swallowed at every layer
   * below this line: the direct backend's destroy() is a no-op, tmux's cli()
   * eats a non-zero exit, dropBaseline for an unknown id drops nothing. So
   * "a review node was routed through registry.dispose" has NO observable
   * consequence in the DOM, in pty:list, or in any pid — confirmed by
   * injection, with both guards removed and both checks still green. The
   * only place the mistake is visible is at the door itself, which is here.
   *
   * An own property shadowing the prototype method, installed BEFORE
   * registerIpcHandlers, so the pty:kill handler and killAll() alike route
   * through it.
   *
   * OBLIGATION ON EVERY READER: both checks that read this assert a NEGATIVE
   * (this id is not among the kills), which a probe that has stopped
   * recording satisfies perfectly and permanently. Each therefore closes a
   * REAL terminal panel inside its own window and asserts that id IS present.
   * A future third reader inherits the same obligation; a negative-only
   * assertion here is a check that cannot fail once the shadow is lost.
   */
  const killedPanelIds = []
  {
    const realKill = ptyManager.kill.bind(ptyManager)
    ptyManager.kill = (panelId) => {
      killedPanelIds.push(panelId)
      realKill(panelId)
    }
  }

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
  // A SET, not a single directory, since M12's check 117 needs a second
  // fixture — the point of the fence is unchanged and is stated at length
  // below: every cwd outside it answers [], so a panel still carrying
  // `cwd: '~'` cannot make this suite read the running developer's own
  // ~/.claude/commands. Widening it by one fixture directory weakens
  // nothing; replacing it with a truthiness test would remove the fence.
  //
  // BOTH spellings of PROJECT_DIR, for the identical reason REVIEW_FENCES
  // carries two prefixes (see its own comment further down): macOS tmpdir()
  // is /var/folders/... while tmux's own `pane_current_path` answers the
  // resolved /private/var/folders/... — M12's live cwd is read straight from
  // tmux, unresolved-vs-resolved, so a panel that has never moved at all
  // already fails a single-spelling fence the instant reloadPrompts prefers
  // the live answer. Without both, check 43 — which predates M12 and asserts
  // nothing about live cwd — goes red for a reason that has nothing to do
  // with its own fixture, the moment ANY panel's live tick lands.
  const PROMPT_DIRS = new Set([PROJECT_DIR, realpathSync(PROJECT_DIR)])
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
  /* The real runner, FENCED to this suite's own fixture directories.

     captureBaseline fires on EVERY pty:create, and most fixture panels here
     are pointed at `~`. A developer whose home directory is itself a git
     checkout — dotfiles-in-$HOME is a common setup, and it is the case this
     machine has — would therefore have the suite run `git stash create`
     against their entire home repository, once per spawn: minutes of real
     work in a repository the repo does not own, which is the same rule as
     "the verify suites must never touch the production socket" and the same
     fence readProjectPrompts already carries for check 43. It also took this
     suite past its own 120s watchdog, which is how it was found.

     Everything outside the fence answers exactly as git does for a directory
     that is not a repository (ok:false, notFound:false), so the fenced
     panels read `not-a-repo` — which is what they are for. It costs no
     coverage: 99-101 are the only checks that look at a review result, and
     both their fixtures live under this prefix. */
  // TWO prefixes, not one, and this is the whole subtlety: on macOS tmpdir()
  // is /var/folders/... while `rev-parse --show-toplevel` answers with the
  // resolved /private/var/folders/... — so the capture's FIRST call (keyed on
  // the panel's cwd) and its SECOND (keyed on the resolved root) arrive under
  // different spellings of the same directory. A single-prefix fence blocks
  // the second, `stash create` reads as a failure, no baseline is stored, and
  // 99/101 report never-started for a repository that is right there.
  const REVIEW_FENCES = [
    join(tmpdir(), 'tc panels '),
    join(realpathSync(tmpdir()), 'tc panels ')
  ]
  const realGitRunner = createGitRunner({ gitPath: () => gitPath, env: () => loginEnv })
  // `opts` is forwarded, not dropped: createReviewCommitter's four scratch-
  // index calls pass { env: { GIT_INDEX_FILE: ... } } as a second argument,
  // and a fence that swallowed it would silently commit against the real
  // repository index instead of the scratch one — the exact thing this
  // milestone's whole design exists to avoid, passing every check for a
  // reason that has nothing to do with the scratch-index mechanism under
  // test. reviewEngine's own calls never pass opts, so this widening changes
  // nothing for checks 99-101.
  const fencedGitRunner = async (args, opts) => {
    const i = args.indexOf('-C')
    const target = i >= 0 ? args[i + 1] : ''
    if (typeof target !== 'string' || !REVIEW_FENCES.some((f) => target.startsWith(f))) {
      return { stdout: '', ok: false, notFound: false }
    }
    return realGitRunner(args, opts)
  }

  // Real engine over a real git runner, mirroring main/index.ts's own
  // construction exactly (createReviewEngine + createGitRunner, baselineOf
  // and peersInRepo closing over THIS run's layoutStore) — a stub here would
  // leave review:panel proven no further than the preload, the reasoning
  // every other real export in this harness already follows.
  const reviewEngine = createReviewEngine({
    run: fencedGitRunner,
    baselineOf: (panelId) => layoutStore.baseline(panelId),
    peersInRepo: (root, except) => layoutStore.baselinePeers(root, except),
    // Mirrors main/index.ts's identical forward-closure over baselineCapture,
    // declared below. Without this, checks 100's homePanel (a genuinely
    // spawned panel whose cwd is not a repository) reads never-started
    // forever instead of not-a-repo, because baselineOf alone cannot tell
    // the two apart — see review-engine.ts's own doc comment on this dep.
    notARepo: (panelId) => baselineCapture.isNotARepo(panelId)
  })
  // main/index.ts's own baselineCapture, built the identical way: the guard
  // that fires captureBaseline exactly once per panel id (pty-manager.ts's
  // capturedBaselineIds) is a SEPARATE, in-memory guard one layer up, so this
  // object's own once-only check (deps.baselineOf(panelId) !== undefined)
  // is not redundant with it — it is what makes a captureBaseline call safe
  // to fire unconditionally in the first place.
  const baselineCapture = createBaselineCapture({
    baselineOf: (panelId) => layoutStore.baseline(panelId),
    setBaseline: (panelId, baseline) => layoutStore.setBaseline(panelId, baseline),
    resolveRepo: (cwd) => reviewEngine.resolveRepo(cwd),
    captureBaseline: (root) => reviewEngine.captureBaseline(root)
  })
  // Real committer, mirroring main/index.ts's own construction: the same
  // fenced runner reviewEngine uses (so a commit attempt against anything
  // outside this suite's own fixture directories fails the way a directory
  // that is not a repository fails, rather than reaching a real repo this
  // suite does not own), and a scratch index directory of its own, outside
  // every fixture repository — a scratch file inside one would show up as an
  // untracked file in the very review about to be committed. Task 8's checks
  // 113-115 are the only place review:commit is driven at all; a stub here
  // would leave the whole write verb proven no further than the preload.
  const commitIndexDir = mkdtempSync(join(tmpdir(), 'tc panels git-index '))
  let commitIndexSeq = 0
  const reviewCommit = createReviewCommitter({
    run: fencedGitRunner,
    tempIndexPath: () => join(commitIndexDir, `idx-${Date.now()}-${commitIndexSeq++}`),
    // Best effort, the same as main/index.ts's: a stray scratch index file is
    // a leftover in a directory nothing else reads, and throwing here would
    // turn a successful commit into a rejected invoke.
    removeTempIndex: (p) => { try { rmSync(p, { force: true }) } catch { /* ignore */ } }
  })
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
    // Real, mirroring main/index.ts's palette.savePanel: mints through
    // presetFromCapture, the same shared function check 90 exists to prove is
    // the only implementation. A stub here would leave check 90 exercising
    // nothing past the preload.
    savePanel: (captured) => {
      layoutStore.addPreset(presetFromCapture(layoutStore.presets(), captured))
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
    // A SET, not a single directory, since M12's check 117 needs a second
    // fixture — the point of the fence is unchanged and is stated at length
    // above: every cwd outside it answers [], so a panel still carrying
    // `cwd: '~'` cannot make this suite read the running developer's own
    // ~/.claude/commands. Widening it by one fixture directory weakens
    // nothing; replacing it with a truthiness test would remove the fence.
    listPrompts: (cwd) =>
      mergePrompts(
        layoutStore.prompts(),
        PROMPT_DIRS.has(cwd) ? readProjectPrompts(resolveCwd(cwd)) : []
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
  }, reviewEngine, reviewCommit)

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

  // A crashed or watchdog-killed run leaves sessions behind on PANELS_SOCKET:
  // the watchdog exits without ever reaching the tmuxBackend.shutdown() in the
  // finally below. Panel ids are minted deterministically (n1, n2, …), so the
  // NEXT run's `new-session -A` then attaches panel n27 to the previous run's
  // n27 — pty:list reports a pid this run never started, and check 91's
  // same-pid-across-a-reload assertion silently reads a corpse. Killing the
  // server first costs nothing (nothing on this socket is ours yet: check 26
  // creates the first one, much later) and makes the suite idempotent after a
  // crash instead of failing in a way that only reproduces on the second run.
  {
    const tmuxForCleanup = findTmux()
    if (tmuxForCleanup) {
      try {
        execFileSync(tmuxForCleanup, ['-L', PANELS_SOCKET, 'kill-server'], { stdio: 'ignore' })
      } catch {
        // No server on this socket is the normal case and exits non-zero.
      }
    }
  }

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
      // M12: a SYNTHETIC live update for the panel about to be captured, the
      // same route check 90 uses for the inspector's save-panel path — not a
      // real tmux session (`backend` is still DIRECT here, so pollLive's own
      // list() answers null and nothing would arrive on its own). Without
      // this, onCapture's `getLiveSession(...) ?? panel.spec.cwd` fallback
      // (Canvas.tsx, the MENU-driven capture path preset:save reaches through
      // main's Presets menu, distinct from preset:save-panel's inspector
      // path) is indistinguishable from a reverted `panel.spec.cwd` alone:
      // nothing forces the live branch to be the one actually exercised.
      // Check 90 does not cover this — it drives preset:save-panel via the
      // inspector's own action, never PRESET_CAPTURE — so this was the
      // surface a whole-branch review found genuinely uncovered.
      const CAPTURE_LIVE_DIR = mkdtempSync(join(tmpdir(), 'tc panels capture-live '))
      win.webContents.send(IPC_EVENTS.SESSION_LIVE,
        { panelId: targetId, cwd: CAPTURE_LIVE_DIR, currentCommand: 'bash' })
      const focused = await waitUntil(
        async () => {
          const c = await requestFromRenderer(wc, IPC_EVENTS.PRESET_CAPTURE, null)
          return c !== null && c.cwd === CAPTURE_LIVE_DIR ? c : false
        }, 3000)
      await wc.executeJavaScript(`
        document.querySelector('.canvas')
          .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, buttons: 1 }))
        true
      `)
      const unfocused = await requestFromRenderer(wc, IPC_EVENTS.PRESET_CAPTURE, null)
      ok('30 PRESET_CAPTURE returns the focused panel\'s LIVE cwd, not merely its spawn one, and null with nothing focused',
        focused !== false && focused !== null && focused.cwd === CAPTURE_LIVE_DIR &&
          Array.isArray(focused.args) && typeof focused.w === 'number' &&
          unfocused === null,
        `focused=${JSON.stringify(focused)} live=${CAPTURE_LIVE_DIR} unfocused=${JSON.stringify(unfocused)}`)
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

      // 49d. POPPING A DRILL-IN RETURNS THE SELECTION TO THE DOOR IT CAME IN
      //      THROUGH. Until this, leaving a scope re-seeded from
      //      bestMatchIndex — and a pop leaves an EMPTY query behind (runRow
      //      cleared it on the way in), so every score ties at 0 and that
      //      degenerates to firstRunnable: the top of the Panels section. The
      //      user walked through a door and came back out somewhere else,
      //      with Enter now pointed at a command they never chose. The
      //      existing follow-the-selection-by-id arm cannot cover this: the
      //      row selected INSIDE the scope is hiddenAtRest, so it is not in
      //      the resting list to be followed back to.
      //
      //      Clauses 1-3 are the anti-tautology half and are not optional.
      //      If ArrowRight silently failed to enter the scope, the query would
      //      still read 'manage settings' and the door would still be the
      //      selected row — so a check asserting only clause 5 passes green
      //      against a completely broken drill-in.
      //
      //      'manage settings' is unambiguous by construction: fuzzyMatch
      //      drops spaces, so this is the single subsequence 'managesettings',
      //      which no other door and no settings label can match.
      {
        await openPalette()
        const result = await wc.executeJavaScript(`(async () => { try {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
          const selectedText = () => {
            const row = document.querySelector('.palette__row--selected')
            return row ? row.textContent : null
          }
          const input = document.querySelector('.palette__input')
          setter.call(input, 'manage settings')
          input.dispatchEvent(new Event('input', { bubbles: true }))
          await new Promise((r) => setTimeout(r, 120))
          // (1) The precondition: the door is what the query selected.
          const selectedBefore = selectedText()
          const typed = document.querySelector('.palette__input')
          typed.setSelectionRange(typed.value.length, typed.value.length)
          typed.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
          await new Promise((r) => setTimeout(r, 150))
          // (2) We really are inside the settings scope.
          const chip = (document.querySelector('.palette__scope') || {}).textContent || null
          // Entering clears the query, so the caret is already at 0 — the one
          // position ArrowLeft is allowed to pop from.
          const input2 = document.querySelector('.palette__input')
          input2.setSelectionRange(0, 0)
          input2.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
          await new Promise((r) => setTimeout(r, 150))
          return {
            selectedBefore,
            chip,
            // (3) The pop happened and the overlay survived it.
            stillOpen: document.querySelector('.palette') !== null,
            chipGone: document.querySelector('.palette__scope') === null,
            // (4) There IS a selected row: index -1 renders none at all, and
            //     "no selection" would satisfy any assertion phrased as a
            //     negative about where the selection is NOT.
            hasSelection: document.querySelector('.palette__row--selected') !== null,
            // (5) And it is the door.
            selectedAfter: selectedText()
          }
        } catch (e) { return { error: String(e && e.message || e) } } })()`)
        ok('49d popping a drill-in returns the selection to the door it was entered through',
          result && !result.error &&
            typeof result.selectedBefore === 'string' &&
            result.selectedBefore.includes('Manage settings') &&
            result.chip === 'Settings' &&
            result.stillOpen === true &&
            result.chipGone === true &&
            result.hasSelection === true &&
            typeof result.selectedAfter === 'string' &&
            result.selectedAfter.includes('Manage settings'),
          JSON.stringify(result))
        await closePalette()
      }

      // 49e. THE SAME LANDING WHEN NO DOOR WAS EVER TRAVERSED. M8a's top-bar
      //      gear opens the palette straight into the settings scope
      //      (openPalette('settings')), so there is no entered row to
      //      remember — and this is the ONLY check that separates the shipped
      //      design, which DERIVES the door from `entersScope`, from the
      //      obvious alternative of stashing the entered row's id in a ref.
      //      That alternative satisfies 49d and cannot satisfy this at all.
      //
      //      Deliberately not folded into check 78, whose subject is "the
      //      button opens IN the scope" and which must keep failing for its
      //      own reason.
      {
        await closePalette()
        const result = await wc.executeJavaScript(`(async () => { try {
          document.querySelector('.shell__settings')
            .dispatchEvent(new MouseEvent('click', { bubbles: true }))
          await new Promise((r) => setTimeout(r, 200))
          const chip = (document.querySelector('.palette__scope') || {}).textContent || null
          const input = document.querySelector('.palette__input')
          if (!input) return { error: 'palette did not open' }
          input.setSelectionRange(0, 0)
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
          await new Promise((r) => setTimeout(r, 150))
          const row = document.querySelector('.palette__row--selected')
          return {
            chip,
            chipGone: document.querySelector('.palette__scope') === null,
            stillOpen: document.querySelector('.palette') !== null,
            selectedAfter: row ? row.textContent : null
          }
        } catch (e) { return { error: String(e && e.message || e) } } })()`)
        ok('49e popping a scope the gear opened lands on that scope’s door too',
          result && !result.error &&
            result.chip === 'Settings' &&
            result.chipGone === true &&
            result.stillOpen === true &&
            typeof result.selectedAfter === 'string' &&
            result.selectedAfter.includes('Manage settings'),
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

    // 72. Hovering a palette row moves the SELECTION, and the two things that
    //     must not move it.
    //
    //     Until this landed, .palette__row had no :hover rule anywhere and no
    //     pointer handler but onMouseDown — so the mouse could not tell the
    //     user which row Enter was pointed at until the click had already run
    //     something. Hover now drives the same `index` the arrow keys drive,
    //     which is why there is no second highlight class to assert on: the
    //     probe is .palette__row--selected, exactly as it is for the keyboard.
    //
    //     This has to live in verify:panels rather than verify:palette: the
    //     plain-node suite has no DOM and cannot dispatch a mouse event at all.
    //
    //     72c is the one that separates the shipped implementation from the
    //     obvious one. Blink re-dispatches a mousemove at the UNCHANGED cursor
    //     position after a scroll, to refresh :hover — so without the
    //     coordinate check in Palette.tsx's lastPointerRef, an ArrowDown that
    //     scrolls the list "hovers" whichever row slid under a stationary
    //     cursor and drags the selection straight back, making the arrow keys
    //     useless whenever the pointer happens to rest over the list. That is
    //     a real scroll, which no synthetic WheelEvent can produce here (the
    //     limit check 47 already records) — so this check reproduces the
    //     SIGNAL instead: a second mousemove at coordinates identical to the
    //     previous one, on a different row, must change nothing.
    {
      await wc.executeJavaScript(`
        if (document.querySelector('.palette') === null) {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
        }
      `)
      await waitUntil(() => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 2000)
      const hover = await wc.executeJavaScript(`(async () => {
        const input = document.querySelector('.palette__input')
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        // "preset" is chosen because it reliably yields BOTH kinds of row with
        // no fixture setup: "Manage presets…" is always runnable, and the
        // rename/delete rows for the three built-ins are always disabled
        // (REASON_BUILT_IN_RENAME). Neither depends on panels or workspaces,
        // which check 71 has just left at zero.
        setter.call(input, 'preset')
        input.dispatchEvent(new Event('input', { bubbles: true }))
        await new Promise((r) => setTimeout(r, 120))

        const all = () => [...document.querySelectorAll('.palette__row')]
        const selectedText = () => {
          const el = document.querySelector('.palette__row--selected')
          return el ? el.textContent : null
        }
        const isDisabled = (el) => el.className.includes('palette__row--disabled')
        const move = (el, x, y) =>
          el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y }))
        const settleFrame = () => new Promise((r) => setTimeout(r, 60))

        const rows = all()
        const before = selectedText()
        // A runnable row that is NOT already selected, or the hover would have
        // nothing to prove.
        const target = rows.find((r) => !isDisabled(r) && r.textContent !== before)
        const disabled = rows.find((r) => isDisabled(r))
        // A SECOND runnable row, distinct from target, for the 72c probe.
        const other = rows.find((r) => !isDisabled(r) && r !== target && r.textContent !== before)
        if (!target || !disabled || !other) {
          return { error: 'fixture: rows=' + rows.length +
            ' target=' + !!target + ' disabled=' + !!disabled + ' other=' + !!other }
        }
        const targetText = target.textContent
        const disabledText = disabled.textContent

        // 72: a real move over a runnable row selects it.
        move(target, 100, 100)
        await settleFrame()
        const afterHover = selectedText()

        // 72b: a real move over a DISABLED row leaves the selection alone —
        // the same rule stepRunnable states for the arrow keys.
        move(disabled, 100, 200)
        await settleFrame()
        const afterDisabled = selectedText()

        // 72c: an IDENTICAL-coordinate move on a different row is the
        // post-scroll synthetic, and must change nothing. (The disabled move
        // above is what left lastPointerRef at 100,200 — the handler records
        // the position before it bails on disabledReason.)
        move(other, 100, 200)
        await settleFrame()
        const afterSynthetic = selectedText()

        return { before, targetText, disabledText, afterHover, afterDisabled, afterSynthetic }
      })()`)
      await wc.executeJavaScript(`
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
      `)
      await settle()
      ok('72 hovering a runnable palette row selects it',
        hover.error === undefined && hover.afterHover === hover.targetText &&
          hover.afterHover !== hover.before,
        JSON.stringify(hover))
      ok('72b hovering a DISABLED palette row leaves the selection where it was',
        hover.error === undefined && hover.afterDisabled === hover.targetText &&
          hover.afterDisabled !== hover.disabledText,
        JSON.stringify(hover))
      ok("72c a mousemove at the previous move's exact coordinates is the " +
         'post-scroll synthetic and moves nothing',
        hover.error === undefined && hover.afterSynthetic === hover.targetText,
        JSON.stringify(hover))
    }

    // 73. THE FRAME INSETS THE CANVAS, and the canvas survives being inset.
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
      ok('73 the shell frame insets the canvas and leaves a panel promoted',
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
      // closing note, because this is a top-to-bottom suite and 74 onward will
      // be appended directly below: the zero-panel world 71 describes ends
      // here. Check 73 spawns one panel via Cmd+N at the camera's centre and
      // lets it go live, so anything appended after this inherits a
      // one-workspace world holding ONE panel with a live PTY — not an empty
      // one. A later check that counts panels, counts sessions, or presses
      // Cmd+Z expecting nothing to undo must account for it.
    }

    // 74. THE PALETTE'S THIRD EXIT STILL WORKS FROM THE SHELL.
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
      ok('74 a mousedown on the shell dismisses the open palette',
        opened === true && dismissed === true,
        `opened=${opened} dismissed=${dismissed}`)
    }

    // 75. COLLAPSE IS REAL LAYOUT, IT PERSISTS TO MAIN'S STORE, AND IT DEMOTES
    //     NOTHING.
    //     Read back through settings:list rather than off the shell's own class,
    //     for the same reason check 53 does: a toggle that only flips a local
    //     boolean looks identical on screen and is gone on the next launch.
    //
    //     The `stillLive` clause is the spec's own conjunction, which until now
    //     shipped as two checks that never met: check 73 asserts `.xterm` but
    //     collapses nothing, and this check collapsed but never looked at
    //     promotion, so success criterion 3 ("no panel that was live before the
    //     collapse is demoted by it") was asserted nowhere.
    //
    //     BE HONEST ABOUT ITS POWER TODAY: the clause is close to tautological.
    //     Nothing in the renderer observes the canvas host's SIZE — the tiering
    //     effect depends on [rects, viewport, focusedId, version, dormantIds]
    //     and reads getBoundingClientRect() only when one of those changes, and
    //     the single ResizeObserver in the renderer belongs to EdgeIndicators
    //     and re-renders the pip layer alone. So a collapse does not re-run
    //     assignTiers at all and nothing could demote here. The clause exists
    //     for the future in which that stops being true: the moment anything
    //     makes a width change re-tier (a ResizeObserver on the host, a window
    //     size in Canvas state), a collapse becomes able to demote the panel
    //     the user was looking at into a card with nothing in any log, and this
    //     is the check that would go red. It is cheap insurance on a real
    //     criterion, not a proof of one.
    {
      const before = await wc.executeJavaScript(
        `document.querySelector('.canvas').getBoundingClientRect().width`)
      const liveBefore = await wc.executeJavaScript(
        `document.querySelectorAll('.panel .xterm').length`)
      await wc.executeJavaScript(`
        document.querySelector('.shell__rail-toggle').dispatchEvent(
          new MouseEvent('click', { bubbles: true }))
      `)
      // Longer than the 150ms this used to wait: DEMOTE_DELAY_MS is 250, so a
      // demotion triggered by the collapse would be APPLIED after the old
      // wait, not before it, and the .xterm probe would read the pre-demotion
      // DOM and pass against exactly the future regression it is here for.
      await sleep(500)
      const after = await wc.executeJavaScript(
        `document.querySelector('.canvas').getBoundingClientRect().width`)
      const liveAfter = await wc.executeJavaScript(
        `document.querySelectorAll('.panel .xterm').length`)
      const stored = await wc.executeJavaScript(
        `window.canvas.settings.list().then((rows) =>
           rows.find((r) => r.id === 'shell.railOpen').value)`)
      ok('75 collapsing the rail widens the canvas, reaches main\'s store, and demotes nothing',
        after > before + 100 && stored === false &&
          liveBefore > 0 && liveAfter >= liveBefore,
        `before=${before} after=${after} stored=${stored} ` +
          `live ${liveBefore} -> ${liveAfter}`)
    }

    // 75b. AUTO-REPEAT IS ONE GESTURE. A held Cmd+\ toggles once, not fifteen
    //      times — the Cmd+K defect, which for a toggle means the rail's final
    //      state depends on whether the user released on an odd or even repeat.
    //      Like checks 7b and 33b this supplies repeat:true by hand, so it proves
    //      the guard READS the flag and says nothing about who sets it.
    {
      // Named for what it ANSWERS. It was `open()` and returned whether the
      // rail is COLLAPSED, so the detail string below read backwards: a
      // passing run printed start=true for a rail that was shut.
      const collapsed = () => wc.executeJavaScript(
        `document.querySelector('.shell').classList.contains('shell--rail-collapsed')`)
      const start = await collapsed()
      await wc.executeJavaScript(`
        for (let i = 0; i < 5; i++) {
          window.dispatchEvent(new KeyboardEvent('keydown', {
            key: '\\\\', code: 'Backslash', metaKey: true, repeat: true, bubbles: true }))
        }
      `)
      await sleep(200)
      const afterRepeats = await collapsed()
      await wc.executeJavaScript(`
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: '\\\\', code: 'Backslash', metaKey: true, repeat: false, bubbles: true }))
      `)
      await sleep(200)
      const afterReal = await collapsed()
      ok('75b a held Cmd+\\ toggles the rail once, not once per repeat',
        afterRepeats === start && afterReal !== start,
        `collapsed: start=${start} afterRepeats=${afterRepeats} afterReal=${afterReal}`)
    }

    // 75c. A SHELL CONTROL NEVER TAKES THE KEYBOARD.
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
    //      (2) There is no top-level `clickPanel(id)` helper in this file. The
    //      real-OS-click idiom is copied in locally below, and NOT because the
    //      original is out of reach: `clickPanelBody` (~line 761) is declared in
    //      the same enclosing try block and is perfectly in scope here. The copy
    //      is deliberate, and what it buys is narrowness — this check needs a
    //      click at the centre of an arbitrary SELECTOR (it clicks a shell
    //      button, which is not a panel body at all), and widening
    //      `clickPanelBody` to serve that would put a second caller with
    //      different needs on a helper a dozen earlier checks depend on. The
    //      duplication is four lines of sendInputEvent; the alternative is a
    //      shared helper that goes wrong for checks nobody was editing.
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
        if (!box) throw new Error(`75c: no element matched ${selector}`)
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
      ok('75c a shell control takes neither focusedId nor DOM focus',
        before.inside === true && after.inside === true &&
          before.id === id && after.id === id &&
          before.focusedLive === true && after.focusedLive === true,
        `panel=${id} before=${JSON.stringify(before)} after=${JSON.stringify(after)}`)
      // What 75/75b/75c LEAVE BEHIND, in the spirit of 73's own closing note:
      // the one-panel, one-workspace world is unchanged, but the rail is now
      // COLLAPSED and `shell.railOpen` is false in main's store (75 collapsed
      // it, 75b's one real chord reopened it, 75c's button click collapsed it
      // again). The inspector is untouched and still open. Anything appended
      // below that measures the canvas's width — or clicks at a screen point
      // captured before this block — must account for the narrower rail.
    }

    // 76. THE SPAWN BUTTON SPAWNS EXACTLY ONE PANEL, THROUGH MAIN.
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
      ok('76 the New panel button spawns exactly one panel',
        after === before + 1, `${before} -> ${after}`)
    }

    // 77. THE ZOOM CLUSTER MOVES THE CAMERA THROUGH NAMED VERBS.
    //     Reads __m4aScale rather than a CSS transform so it is the same number
    //     viewport.ts computes. Fit is asserted separately from the steppers
    //     because they are different verbs and a wiring that pointed both at
    //     resetViewport would still change the scale.
    //
    //     The Fit half is THREE clauses, and it takes all three. The obvious
    //     one — `fitted > 0` — is satisfied by any non-zero scale at all, so
    //     it passes against a Fit button wired to resetViewport, wired to
    //     zoomBy, and, worst, wired to NOTHING (the scale simply stays where
    //     the steppers left it). Each clause below kills one of those.
    //
    //     (a) |fitted - backOut| > 0.001 kills "wired to nothing", and NOTHING
    //         ELSE. It is emphatically NOT sufficient on its own, and the
    //         numbers are worth writing down because they are close enough to
    //         look like coverage: TopBar's ZOOM_STEP is 1.2 and this fixture's
    //         real fit is ~1.194, so a Fit button carrying a copy-pasted
    //         zoom-in handler (onZoomBy(ZOOM_STEP) — the easiest real mistake
    //         on this bar) lands 1.2 against the correct 1.194. |1.2 - 1| =
    //         0.2 and |1.194 - 1| = 0.194: both clear this bound just as
    //         easily, and clause (a) cannot tell them apart.
    //
    //     (b) |fitTwice - fitted| < 0.001 is what separates a FIT from a
    //         STEPPER, and it is the clause that actually kills the zoomBy
    //         mis-wiring. fitAll is idempotent — fitting an unchanged world
    //         twice lands the same scale — while zoomBy COMPOUNDS: 1.2 then
    //         1.44. Clicking Fit a second time and demanding the scale did not
    //         move is therefore a property of "this is a fit", and it needs
    //         zero knowledge of what fitTo computes internally.
    //
    //         That is deliberately chosen over recomputing fitTo's expected
    //         scale from __m4aViewport() and asserting equality. Recomputing
    //         means restating fitTo's padding and clamp arithmetic here — a
    //         second copy of math verify:viewport already pins purely, and one
    //         that goes silently wrong the first time the real one changes.
    //         The harness must never grow that copy.
    //
    //     (c) |fitted - 1| > 0.001 kills resetViewport DELIBERATELY rather
    //         than by coincidence. INITIAL.scale is 1, and clause (a) only
    //         happened to exclude a reset because backOut is also 1 in this
    //         run's world — a coincidence of the fixture, not a property.
    //
    //         CLAUSE (c) IS FIXTURE-DEPENDENT and must not be "fixed" by
    //         loosening its tolerance. It assumes this world's panels do not
    //         happen to fit at exactly scale 1.0. A later task that changes
    //         the world — panel count, sizes, positions, or the canvas's own
    //         size, which the collapsed rail already affects — can make the
    //         true fit land on 1.0, and this clause then goes red for a reason
    //         that has nothing whatever to do with the Fit button. The right
    //         response to that failure is to change the FIXTURE (or to state
    //         the new expected scale), never to widen the bound: widening it
    //         hands resetViewport back its free pass.
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
      // The second Fit, for clause (b). Nothing about the world changes
      // between the two clicks, so a real fitAll must land on exactly the
      // scale it just landed on — and a stepper cannot.
      await wc.executeJavaScript(`
        document.querySelector('.shell__fit').dispatchEvent(
          new MouseEvent('click', { bubbles: true }))
      `)
      await sleep(200)
      const fitTwice = await wc.executeJavaScript(`window.__m4aScale()`)
      ok('77 the zoom cluster steps in, steps out, and fits',
        zoomedIn > start + 0.01 && Math.abs(backOut - start) < 0.001 &&
          Math.abs(fitted - backOut) > 0.001 &&
          Math.abs(fitTwice - fitted) < 0.001 &&
          Math.abs(fitted - 1) > 0.001,
        `start=${start} in=${zoomedIn} out=${backOut} fit=${fitted} fitTwice=${fitTwice}`)
    }

    // 78. SEARCH AND SETTINGS OPEN THE PALETTE, AND SETTINGS ARRIVES IN ITS SCOPE.
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
      // Read the chip here too, not only after the gear. See the note on the
      // ok() below for what this second read is the only thing that can catch.
      const searchChip = await wc.executeJavaScript(`(() => {
        const chip = document.querySelector('.palette__scope')
        return chip ? chip.textContent.trim() : null
      })()`)
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
      // The chip is now ASSERTED at BOTH clicks, not collected into the detail
      // string and left out of the condition.
      //
      // `inScope.chip === 'Settings'` is the gear's half. `sawASetting` alone
      // does not pin it: a gear that opened the palette with the query
      // pre-filled — a plausible alternative implementation — would surface a
      // setting row with no scope at all, and the scope is what makes the
      // button honest, because a scope survives the user clearing the query
      // while a pre-filled search does not.
      //
      // `searchChip === null` is Search's half, and it is the ONLY clause that
      // can fail against a Search button mis-wired to openSettingsScope. Note
      // what the gear-side read cannot do here: it is taken after the GEAR was
      // clicked, so it reads 'Settings' whether or not Search is also
      // scope-opening. The two reads are at two different moments on purpose.
      ok('78 search opens the palette unscoped and settings opens it in the settings scope',
        searchOpened === true && searchChip === null &&
          inScope.sawASetting === true && inScope.chip === 'Settings',
        `search=${searchOpened} searchChip=${searchChip} scope=${JSON.stringify(inScope)}`)
      // What 76/77/78 LEAVE BEHIND, in the spirit of 73's and 75c's closing
      // notes. The world now holds TWO live panels, not one: check 76's spawn
      // is real and is never undone. The camera is wherever `Fit` put it (a
      // fitTo over both panels), NOT at INITIAL — anything appended below that
      // reuses a screen coordinate captured earlier in this file is measuring
      // against a camera that has moved. Check 77 clicks Fit TWICE, and the
      // second click is asserted to leave the camera's scale exactly where the
      // first put it (clause (b)), so "wherever Fit put it" is one place, not
      // two — that idempotence is checked, not assumed. The rail is still collapsed and the
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

    // 79. A PALETTE TOGGLE OF THE RAIL REACHES THE SCREEN, not only the store.
    //
    //     `shell.railOpen` is an ordinary boolean SettingDef, so main's
    //     settings:list AUTO-GENERATES a runnable palette row for it — nobody
    //     wrote that row, and nobody wired it to the shell. Running it writes
    //     through settings:set and reloads settingRows, which is everything
    //     check 53 asks of a setting and is NOT enough here: useShellChrome
    //     holds the rail's visibility in its own React state, and a read effect
    //     that never re-runs leaves the frame exactly where it was. The failure
    //     is total and silent — the setting persists, the rail does not move,
    //     and the row's own title (which renders which way the toggle currently
    //     sits) then reads "Off" beside a visibly open rail. Main and the
    //     renderer disagree, which is the two-authorities drift "One map, and a
    //     typed view over it" exists to prevent.
    //
    //     This is the palette -> SCREEN direction, and nothing else covers it.
    //     Check 53 is palette -> store and check 75 is button -> store; both
    //     stay green against this defect, because neither ever looks at the
    //     frame after a PALETTE-driven write. So the assertion that
    //     discriminates is `moved` — the canvas host actually got narrower —
    //     and `storedAfter` sits beside it as the non-vacuity guard: without
    //     it, a run where the row was never found or never ran would report the
    //     same "the rail did not move" as the real regression.
    //
    //     Watched failing against the empty-dep-array read effect before the
    //     fix: stored=true (main took the write) with the canvas width
    //     unchanged and shell--rail-collapsed still on the root.
    //
    //     World state inherited from 78: two live panels, camera wherever Fit
    //     put it, RAIL COLLAPSED (shell.railOpen === false in main's store),
    //     inspector open, palette closed. So the toggle below opens the rail,
    //     and the canvas gets NARROWER — the opposite direction from 75's.
    {
      const openPalette = async () => {
        await wc.executeJavaScript(`
          if (document.querySelector('.palette') === null) {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
          }
        `)
        return waitUntil(
          () => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 2000)
      }
      const canvasWidth = () => wc.executeJavaScript(
        `document.querySelector('.canvas').getBoundingClientRect().width`)
      const railStored = () => wc.executeJavaScript(
        `window.canvas.settings.list().then((rows) =>
           rows.find((r) => r.id === 'shell.railOpen').value)`)

      const storedBefore = await railStored()
      const before = await canvasWidth()
      await openPalette()
      // By a keyword-ish query against the row's own label, the way check 52
      // reaches a setting: the row is hiddenAtRest, so it is only in the list
      // at all because something was typed.
      const picked = await wc.executeJavaScript(`(async () => {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value').set
        const input = document.querySelector('.palette__input')
        setter.call(input, 'side rail')
        input.dispatchEvent(new Event('input', { bubbles: true }))
        await new Promise((r) => setTimeout(r, 100))
        const row = [...document.querySelectorAll('.palette__row')]
          .find((r) => r.textContent.includes('Show the side rail'))
        if (!row) return 'not found'
        row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        return 'ok'
      })()`)
      if (picked !== 'ok') throw new Error(`79: the rail setting row was ${picked}`)
      // runRow closes the overlay BEFORE running the command, so this is an
      // assertion rather than a wait for something optional — a left-open
      // palette would swallow check 80's chord.
      await waitUntil(() => wc.executeJavaScript(
        `document.querySelector('.palette') === null`), 2000)

      const storedAfter = await waitUntil(async () =>
        (await railStored()) === true ? true : false, 3000)
      const moved = await waitUntil(async () =>
        (await canvasWidth()) < before - 100 ? true : false, 3000)
      const after = await canvasWidth()
      const collapsed = await wc.executeJavaScript(
        `document.querySelector('.shell').classList.contains('shell--rail-collapsed')`)
      ok('79 a palette toggle of the rail moves the rail, not only the store',
        storedBefore === false && storedAfter === true &&
          moved === true && collapsed === false,
        `storedBefore=${storedBefore} storedAfter=${storedAfter} ` +
          `width ${before} -> ${after} collapsed=${collapsed}`)
      // What 79 LEAVES BEHIND, in the spirit of 73's, 75c's and 78's closing
      // notes: the world's two live panels and the camera are untouched, the
      // palette is closed, and the RAIL IS NOW OPEN — `shell.railOpen` is true
      // in main's store and the canvas is back to its narrower, three-column
      // width. The inspector is still open and still untouched. Anything
      // appended below that measures the canvas must account for the rail
      // having reopened.
    }

    // 80. THE INSPECTOR CHORD, AS macOS ACTUALLY DELIVERS IT.
    //
    //     One check, three regressions, and none of them is reachable from any
    //     other check in this file.
    //
    //     (a) `event.code`, not `event.key`. Check 75b dispatches
    //         { key: '\\', code: 'Backslash' } — BOTH matching — so reverting
    //         useShellChrome's `event.code === 'Backslash'` to an `event.key`
    //         test passes it unchanged. With Shift held macOS reports
    //         key '|' and code 'Backslash', which is what this check sends, so
    //         a key-based test sees no chord at all and the inspector never
    //         moves.
    //     (b) The Shift BRANCH. Nothing else in the suite has ever sent
    //         shiftKey with this chord, so `toggleRail()` written into both
    //         branches — the easiest real mistake in that if/else — was
    //         invisible to all of the checks before this one.
    //     (c) The `shell--inspector-collapsed` class. The rail's class is
    //         asserted by 75b; the inspector's was asserted nowhere, so a
    //         class name typed wrong in Canvas.tsx's template literal would
    //         render an inspector that never collapses with nothing red.
    //
    //     The rail clause is what makes (b) fail rather than merely look odd:
    //     both-branches-rail flips shell--rail-collapsed and leaves
    //     shell--inspector-collapsed alone, which is exactly the pair this
    //     check forbids.
    {
      const classes = () => wc.executeJavaScript(`(() => {
        const shell = document.querySelector('.shell')
        return {
          rail: shell.classList.contains('shell--rail-collapsed'),
          inspector: shell.classList.contains('shell--inspector-collapsed')
        }
      })()`)
      const before = await classes()
      await wc.executeJavaScript(`
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: '|', code: 'Backslash', metaKey: true, shiftKey: true,
          repeat: false, bubbles: true }))
      `)
      await sleep(250)
      const after = await classes()
      ok('80 the inspector chord toggles the inspector and leaves the rail alone',
        after.inspector !== before.inspector && after.rail === before.rail,
        `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`)
      // What 80 LEAVES BEHIND: the inspector is now COLLAPSED (it was open on
      // entry, from 79's note) and `shell.inspectorOpen` is false in main's
      // store; the rail stays open, the two panels and the camera are
      // untouched, and the palette is closed.
    }

    /* ---- M8b: the panel outline rail ---- */

    // World state inherited from 80: the RAIL IS OPEN (79 reopened it), the
    // inspector is collapsed, two live panels, palette closed. The rail being
    // open is a precondition for everything below — a collapsed rail hides the
    // list — so it is asserted rather than assumed.

    // 81. A ROW PER PANEL, WITH THE HONEST LABEL AND A REAL PID.
    //     The pid half is what makes this more than a count: a row rendering
    //     the panel id, or a hardcoded stand-in, would satisfy "there are N
    //     rows" while telling the user nothing main actually resolved. And a
    //     label of '' — the shape a dropped honest chain produces — is checked
    //     explicitly, because an empty row is indistinguishable from a styling
    //     bug at a glance.
    {
      const railOpen = await wc.executeJavaScript(
        `!document.querySelector('.shell').classList.contains('shell--rail-collapsed')`)
      // Scoped to .rail-list--panels: M8d's Workspaces section (Task 3) rows
      // share the bare .rail-row class for its layout rules, and an unscoped
      // query here would pick up the workspace list's row too.
      const rows = await wc.executeJavaScript(`
        [...document.querySelectorAll('.rail-list--panels .rail-row')].map((r) => ({
          id: r.getAttribute('data-rail-row'),
          label: r.querySelector('.rail-row__label').textContent,
          tail: r.querySelector('.rail-row__tail').textContent
        }))`)
      const panelIdsNow = await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
      const sameSet = rows.length === panelIdsNow.length &&
        panelIdsNow.every((id) => rows.some((r) => r.id === id))
      const labelled = rows.every((r) => typeof r.label === 'string' && r.label.length > 0)
      const pidTail = rows.every((r) => /^pid \d+$/.test(r.tail))
      ok('81 the rail renders one labelled row per panel, with a real pid',
        railOpen === true && sameSet && labelled && pidTail,
        `railOpen=${railOpen} rows=${JSON.stringify(rows)} panels=${JSON.stringify(panelIdsNow)}`)
    }

    // 82. ONE TITLE SOURCE, NOT TWO. A rename typed into the palette has to
    //     reach the rail row, because the rail reads Panel.title through the
    //     same honest chain the header does. The failure this catches is a rail
    //     that snapshotted its labels once and froze — a LIVE hazard here and
    //     nowhere else, since railRows is deliberately frozen on a signature:
    //     get that signature's fields wrong and the rows never rebuild, with
    //     nothing throwing and the panel's own header still correct beside a
    //     stale row.
    //
    //     Spawns its own panel with Cmd+N rather than renaming one of 81's,
    //     because the rename row targets `capturedId` — focusedId as it was
    //     when the palette opened. Spawning does not focus (check 40's note),
    //     so the panel is clicked first, the same step check 45 takes and for
    //     the same reason. Check 86 closes this panel again through the rail's
    //     own close control.
    let renamedId = null
    {
      const idsBefore = new Set(await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`))
      await zoomTo(wc, 'n')
      const idsAfter = await waitUntil(async () => {
        const now = await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
        return now.length > idsBefore.size ? now : false
      }, 4000)
      renamedId = idsAfter ? idsAfter.find((id) => !idsBefore.has(id)) : null
      if (!renamedId) throw new Error('82: Cmd+N produced no new panel')

      // Spawning does not focus (check 40's note): the palette captures
      // focusedId at OPEN time, so without this click the rename row would be
      // aimed at whatever panel was focused before, not the one just spawned.
      await waitUntil(async () => {
        await wc.executeJavaScript(`(() => {
          const slot = document.querySelector('[data-panel-id=${JSON.stringify(renamedId)}] .panel__slot')
          if (slot) slot.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        })()`)
        return wc.executeJavaScript(`window.__m4aGrid() !== null`)
      }, 5000, 200)

      await wc.executeJavaScript(
        `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))`)
      await waitUntil(() => wc.executeJavaScript(
        `document.querySelector('.palette__input') !== null`), 2000)
      const ran = await wc.executeJavaScript(`(async () => {
        const nativeSet = (input, v) => {
          const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value').set
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
        nativeSet(field, 'outline probe')
        await new Promise((r) => setTimeout(r, 50))
        field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        return 'ok'
      })()`)
      const rowLabel = () => wc.executeJavaScript(`(() => {
        const row = document.querySelector('.rail-row[data-rail-row=${JSON.stringify(renamedId)}]')
        return row ? row.querySelector('.rail-row__label').textContent : null
      })()`)
      const landed = ran === 'ok' &&
        Boolean(await waitUntil(async () => (await rowLabel()) === 'outline probe', 3000))
      ok('82 a rename typed into the palette reaches the rail row',
        landed, `ran=${ran} id=${renamedId} label=${await rowLabel()}`)
      // What 82 LEAVES BEHIND: a THIRD panel, titled "outline probe", focused
      // and selected; the palette is closed. Check 86 closes it again.
    }

    // 83. A REAL BELL MOVES ONE ROW'S DOT, AND THE OTHERS STAY REAL.
    //     What this proves: a real bell, through a real PTY, moves the
    //     TARGET row's dot to 'wants-you'; the other rows' dots do not move
    //     with it; and AT LEAST ONE of those other dots is carrying a real
    //     per-panel agent state (e.g. 'starting') rather than every one
    //     reading a degenerate stand-in — not merely holding still at some
    //     arbitrary placeholder. Check 54
    //     already proves a bell reaches the PANEL; this is the half only the
    //     rail can be wrong about, because every row here is fed from one
    //     `rows` array.
    //
    //     What this does NOT prove: that each row subscribes to agent state
    //     INDIVIDUALLY, the property `RailPanelRowImpl`'s own doc comment
    //     claims. That was the plan going in, and fault injection found it
    //     false — see the report for the fix that produced this comment.
    //     Rerouting `RailPanelRow` to take `state` as a prop and having
    //     `SideRail` derive it from one list-level `useAttentionIds()` read
    //     paints IDENTICAL attributes to the correct per-row subscription in
    //     every case this check can observe: both are reactive, so both
    //     recompute correctly on the relevant change, and a DOM snapshot
    //     cannot tell "one subscription drives N re-renders" apart from "N
    //     subscriptions drive one re-render each" when the painted values
    //     agree. The only thing that COULD tell them apart is a render
    //     counter inside `RailPanelRowImpl` — a side effect during render,
    //     the exact impurity `Canvas.tsx`'s own `commitHistory` comment warns
    //     against, added to production code whose only consumer would be a
    //     check. That trade was declined; the gap is recorded in CLAUDE.md
    //     instead, the same way this file already names what check 32 and
    //     the auto-repeat checks (7b/33b) do not prove.
    //
    //     The non-vacuity clause below (`othersAreReal`) catches exactly one
    //     shape of that undiscriminated fault, not every one: an
    //     attention-set-only derivation, which only knows "is this panel
    //     waiting" and so collapses every non-waiting row to a single
    //     placeholder value. It does NOT catch a list-level subscription that
    //     reads the full per-id state map and passes the real value down —
    //     that hypothetical still paints 'starting' on the other rows and
    //     would pass this check too. Do not read a green 83 as proof of
    //     subscription shape in general.
    //
    //     The attribute, not the class: a class is a styling decision a
    //     restyle may rename, the same split check 54 draws for the panel.
    //
    //     Deviation from the brief's literal source: the brief's draft rings
    //     the bell on `renamedId`, check 82's Cmd+N spawn. Cmd+N's default
    //     here is BOOT_DEFAULT_PRESET, `/bin/cat -v` (checks 44 and 70b's own
    //     comment both document this) — cat only ECHOES the literal bytes
    //     `printf '\007'\n` it is handed, so no actual 0x07 ever reaches its
    //     output and the check could never pass, on correct rail code or
    //     broken. Confirmed empirically: run against the brief's literal
    //     source first and it failed with `after=false` even though
    //     `RailPanelRow` subscribes correctly. So this spawns a REAL shell
    //     through PRESET_SPAWN instead — the exact substitution checks 54-63
    //     and 70b already make for the identical reason — and rings the bell
    //     there, while still reading every row's dot (cat panels, `renamedId`
    //     included) to prove the others never moved.
    {
      const BELL_LINE = "printf '\\007'\n"
      // Scoped to .rail-list--panels for the same reason check 81 is: the
      // Workspaces section's row shares the bare .rail-row class and has no
      // .rail-row__dot, so an unscoped query throws on that row's null lookup.
      const dots = () => wc.executeJavaScript(`
        Object.fromEntries([...document.querySelectorAll('.rail-list--panels .rail-row')].map((r) => [
          r.getAttribute('data-rail-row'),
          r.querySelector('.rail-row__dot').getAttribute('data-agent-state')
        ]))`)
      const idsBefore83 = new Set(await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`))
      win.webContents.send(IPC_EVENTS.PRESET_SPAWN, { cwd: '/tmp', command: '/bin/sh', args: [] })
      const idsAfter83 = await waitUntil(async () => {
        const now = await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
        return now.length > idsBefore83.size ? now : false
      }, 4000)
      const target = idsAfter83 ? idsAfter83.find((id) => !idsBefore83.has(id)) : null
      if (!target) throw new Error('83: PRESET_SPAWN produced no new panel')
      const hasPty = await waitUntil(async () => (await sessionMap(wc)).has(target), 8000)
      if (!hasPty) throw new Error(`83: panel ${target} never got a PTY`)
      const before = await dots()
      ptyManager.write(target, BELL_LINE)
      const rang = await waitUntil(async () => {
        const now = await dots()
        return now[target] === 'wants-you' ? now : false
      }, 6000)
      const others = rang
        ? Object.keys(rang).filter((id) => id !== target)
            .every((id) => rang[id] === before[id])
        : false
      // Non-vacuity: at least one non-target row must carry a REAL agent
      // state (i.e. something other than 'none') rather than a degenerate
      // placeholder every row could share regardless of what is actually
      // happening. This is the same shape verify:pty-manager check 18 already
      // uses — its first clause must keep naming 'busy' because "no
      // wants-you" is satisfied just as well by bytes that never arrived.
      const othersAreReal = rang
        ? Object.keys(rang).filter((id) => id !== target).some((id) => rang[id] !== 'none')
        : false
      ok('83 a real bell changes that panel\'s row dot, no other, and the others stay real',
        rang !== false && others === true && othersAreReal === true,
        `target=${target} before=${JSON.stringify(before)} after=${JSON.stringify(rang)} ` +
          `others=${others} othersAreReal=${othersAreReal}`)
      // What 83 LEAVES BEHIND: an extra sh panel in wants-you, in main's
      // store and on its row, alongside renamedId (still 'starting', untouched
      // by this check). Nothing below acknowledges either; check 86 closes
      // renamedId through the rail's own close control, which is unaffected
      // by this check's own leftover panel.
    }

    // 84-85. THE DORMANCY PAIR, on a fixture seeded for it.
    //     Check 39's NEVER_WOKEN_ID does not survive M7's workspace churn —
    //     check 71 deletes the last workspace and installs a fresh one — so a
    //     dormant panel has to be seeded again here. The mechanism is the one
    //     check 39's own seeding uses, and its comment explains each step:
    //     append to the on-disk layout, re-load the store (layout:load answers
    //     from the in-memory snapshot, not a fresh disk read), and reload the
    //     renderer. A panel with no live session restores dormant under EITHER
    //     backend, so this needs nothing tmux set up.
    //
    //     Parked at world (60000, 60000): far outside anything any check above
    //     frames or clicks, and distinct from check 39's (50000, 50000) so a
    //     stale fixture cannot be mistaken for this one.
    const RAIL_DORMANT_ID = 'rail-dormant'
    {
      flushLayoutStore()
      const onDisk = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8'))
      const ws = onDisk.workspaces.find((w) => w.id === onDisk.activeWorkspaceId) || onDisk.workspaces[0]
      const maxZ = ws.panels.reduce((m, p) => Math.max(m, p.z), 0)
      ws.panels.push({
        id: RAIL_DORMANT_ID,
        x: 60000, y: 60000, w: 720, h: 460, z: maxZ + 1,
        cwd: '~', args: ['-l']
      })
      writeFileSync(LAYOUT_PATH, JSON.stringify(onDisk, null, 2), 'utf8')
      layoutStore.load()
      const reloaded = new Promise((resolve) => wc.once('did-finish-load', resolve))
      wc.reload()
      await reloaded
      await waitUntil(async () => {
        const sessions = await wc.executeJavaScript(
          `window.__m4aSessions ? window.__m4aSessions() : []`)
        return sessions.some((s) => s.id === RAIL_DORMANT_ID) || false
      }, 4000)
    }

    // 84. CLICKING A ROW FRAMES ITS PANEL AND DOES NOT START IT.
    //     Rule 1 of the spec, and the one failure a screenshot cannot show: on
    //     a restored twelve-panel canvas, a row that wakes on click is twelve
    //     agent CLIs launched by browsing a list. Both clauses are required,
    //     and for two different reasons — neither is a restatement of the
    //     other.
    //
    //     The CAMERA clause rejects a row wired to nothing at all (no
    //     onClick, or a dead handler): the no-spawn clause alone passes
    //     against that implementation, because a panel nobody touched is
    //     indeed still dormant.
    //
    //     The DORMANCY clause is the one that matters, because it is the only
    //     clause that would catch a row wired to CENTRE AND WAKE — the
    //     genuinely dangerous shape, since the camera moves exactly as this
    //     check expects and the row looks completely correct on screen while
    //     quietly launching a process.
    //
    //     A row wired to `onSelectPanel` as this codebase actually defines it
    //     (Canvas.tsx: selectAndRaise + clear dormant id + registry.wake, and
    //     no centreOn anywhere in it) fails BOTH clauses at once — it never
    //     frames, so the camera clause fails on its own, independent of the
    //     wake. Don't read that combination as proof either clause is
    //     load-bearing alone; it is a coincidence of what onSelectPanel
    //     happens to do today, not a property either half of this check
    //     relies on. The centre-and-wake shape above is the one the dormancy
    //     clause exists for.
    {
      const rowState = () => wc.executeJavaScript(`(() => {
        const row = document.querySelector('.rail-row[data-rail-row=${JSON.stringify(RAIL_DORMANT_ID)}]')
        return row ? {
          tail: row.querySelector('.rail-row__tail').textContent,
          hasStart: row.querySelector('.rail-row__start') !== null
        } : null
      })()`)
      const seeded = await waitUntil(async () => {
        const s = await rowState()
        return s && s.tail === 'dormant' ? s : false
      }, 4000)
      const before = await wc.executeJavaScript(`window.__m4aViewport()`)
      await wc.executeJavaScript(`
        document.querySelector('.rail-row[data-rail-row=${JSON.stringify(RAIL_DORMANT_ID)}] .rail-row__main')
          .dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
      await sleep(400)
      const after = await wc.executeJavaScript(`window.__m4aViewport()`)
      const sessions = await wc.executeJavaScript(`window.__m4aSessions()`)
      const still = sessions.find((s) => s.id === RAIL_DORMANT_ID)
      ok('84 a rail row frames its panel and leaves a dormant one dormant',
        seeded !== false && seeded.hasStart === true &&
          (after.x !== before.x || after.y !== before.y) &&
          still !== undefined && still.dormant === true && still.spawned === false,
        `seeded=${JSON.stringify(seeded)} camera ${JSON.stringify(before)} -> ` +
          `${JSON.stringify(after)} session=${JSON.stringify(still)}`)
    }

    // 85. THE START CONTROL IS THE ONLY THING THAT WAKES.
    //     The other half of 84, and it has to be asserted or "never wakes"
    //     would be satisfied just as well by a rail that CANNOT wake — a
    //     dormant panel reachable from the rail but unstartable from it, with
    //     the arrow rendered and inert.
    {
      await wc.executeJavaScript(`
        document.querySelector('.rail-row[data-rail-row=${JSON.stringify(RAIL_DORMANT_ID)}] .rail-row__start')
          .dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
      const woke = await waitUntil(async () => {
        const sessions = await wc.executeJavaScript(`window.__m4aSessions()`)
        const s = sessions.find((x) => x.id === RAIL_DORMANT_ID)
        return s && s.dormant === false ? s : false
      }, 6000)
      const tail = await wc.executeJavaScript(`(() => {
        const row = document.querySelector('.rail-row[data-rail-row=${JSON.stringify(RAIL_DORMANT_ID)}]')
        return row ? row.querySelector('.rail-row__tail').textContent : null
      })()`)
      ok('85 the start control wakes the panel the row click would not',
        woke !== false && tail !== 'dormant',
        `session=${JSON.stringify(woke)} tail=${tail}`)
    }

    // 86. THE ROW'S CLOSE CONTROL CLOSES THE PANEL.
    //     Asserted through THREE reads, because each alone passes against a
    //     different wrong implementation: the row going is satisfied by a rail
    //     that filtered its own list locally, the .panel going is satisfied by
    //     a close that left the session running, and the session going is what
    //     proves the control reached onClosePanel — the one call site that
    //     disposes. Together they pin that the rail added no fourth way to
    //     remove a panel.
    //
    //     Note on this fixture: the reload in the 84/85 seeding block restores
    //     renamedId from disk along with everything else, so it is still
    //     present here — but under the DIRECT backend it comes back dormant,
    //     with no session. If the three-clause read is ever seen failing only
    //     on `session`, check which backend the run took before assuming a
    //     regression: `!state.session` is trivially true for a panel that
    //     never respawned, and the clause that carries the weight there is the
    //     row and the `.panel` both going.
    {
      const target = renamedId
      await wc.executeJavaScript(`
        document.querySelector('.rail-row[data-rail-row=${JSON.stringify(target)}] .rail-row__close')
          .dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
      const gone = await waitUntil(async () => {
        const state = await wc.executeJavaScript(`(() => ({
          row: document.querySelector('.rail-row[data-rail-row=${JSON.stringify(target)}]') !== null,
          panel: document.querySelector('.panel[data-panel-id=${JSON.stringify(target)}]') !== null,
          session: window.__m4aSessions().some((s) => s.id === ${JSON.stringify(target)})
        }))()`)
        return (!state.row && !state.panel && !state.session) ? state : false
      }, 6000)
      ok('86 the row\'s close control closes the panel, its DOM and its session',
        gone !== false, `target=${target} state=${JSON.stringify(gone)}`)
    }

    // 87. THE READ HALF, AND THE CRITERION IT CLOSES.
    //     The inspector must show what MAIN RESOLVED, not what the spec asked
    //     for. For a login-shell panel spec.command is ABSENT — only main can
    //     name the user's shell — so a pane that read the spec would render the
    //     stand-in 'login shell' for every default panel and look entirely
    //     plausible doing it. Asserting `command` is an absolute path is what
    //     separates the two; asserting merely that it is non-empty does not.
    //
    //     The SECOND clause is the pane's stated reason to exist: the spec link
    //     is shown SEPARATELY, so "why does this say login shell" is answerable.
    //     A merged single-command implementation passes the first clause alone.
    {
      const sessions = await settledSessionMap(wc)
      const targetId = [...sessions.keys()][0]
      await wc.executeJavaScript(`
        document.querySelector('.rail-row[data-rail-row="' + ${JSON.stringify(targetId)} + '"] .rail-row__main')
          .dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
      await settle()
      const read = await wc.executeJavaScript(`(() => {
        const f = (k) => document.querySelector('[data-inspector-field="' + k + '"] .inspector__value')
        const g = (k) => { const el = f(k); return el ? el.textContent : null }
        return { command: g('command'), spec: g('spec-command'), cwd: g('cwd'), pid: g('pid') }
      })()`)
      ok('87 the inspector shows the RESOLVED command and the spec link separately',
        read.command !== null && read.command.startsWith('/') &&
          read.spec !== null && read.spec !== read.command &&
          read.pid === String(sessions.get(targetId)),
        JSON.stringify(read) + ` expected pid ${sessions.get(targetId)}`)
    }

    // 88. The empty state. Nothing selected is not "nothing to show": it is the
    //     canvas's own summary, and it is the state the app launches in and
    //     returns to on every background click.
    //
    //     The running count is read back out of pty:list rather than restated,
    //     because a hardcoded number here would go stale the first time a fixture
    //     panel is added — the same staleness CLAUDE.md records for verify:panels
    //     48's ORDER array.
    {
      const clicked = await clickEmptyCanvas(wc)
      await settle()
      const summary = await wc.executeJavaScript(`(() => {
        const root = document.querySelector('[data-inspector-summary]')
        if (!root) return null
        const g = (k) => { const el = root.querySelector('[data-summary="' + k + '"]'); return el ? el.textContent : null }
        return { panels: g('panels'), running: g('running'), waiting: g('waiting'),
                 fields: document.querySelectorAll('[data-inspector-field]').length }
      })()`)
      const panelCount = await wc.executeJavaScript(`window.__m4aSessions().length`)
      // CONTROLLER RULING (pre-flight CONFLICT-2): derived, never hardcoded to '0'.
      // Checks 54/57/63 ring and acknowledge real bells earlier in this same run,
      // so whether the attention set is empty here depends on their cleanup, which
      // nothing guarantees. A hardcoded 0 fails as "0 !== 1" and points nowhere.
      const waitingNow = await wc.executeJavaScript(
        `String(document.querySelectorAll('.panel[data-agent-state="wants-you"]').length)`)
      ok('88 with nothing selected the inspector summarises the canvas instead',
        clicked !== null && summary !== null &&
          summary.panels === String(panelCount) &&
          summary.waiting === waitingNow &&
          summary.fields === 0,
        `clicked=${JSON.stringify(clicked)} summary=${JSON.stringify(summary)} panels=${panelCount} waiting=${waitingNow}`)
    }

    // 89. ONE TITLE SOURCE, THREE VIEWS.
    //     The inspector's rename must reach the palette's InputMode — the shell
    //     owns no modality — and the name it commits must appear in the panel's
    //     own header, its rail row AND the inspector's heading. Asserting only
    //     the inspector would pass against a pane holding a private copy of the
    //     title, which is the drift the honest chain exists to prevent, and it
    //     would show up as two names for one panel sitting side by side on
    //     screen.
    {
      const sessions = await settledSessionMap(wc)
      const targetId = [...sessions.keys()][0]
      await wc.executeJavaScript(`
        document.querySelector('.rail-row[data-rail-row="' + ${JSON.stringify(targetId)} + '"] .rail-row__main')
          .dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
      await settle()
      await wc.executeJavaScript(`
        document.querySelector('[data-inspector-action="rename"]')
          .dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
      await settle()
      const opened = await wc.executeJavaScript(
        `document.querySelectorAll('.palette').length === 1 &&
         document.activeElement === document.querySelector('.palette__input')`)
      await wc.executeJavaScript(`(() => {
        const input = document.querySelector('.palette__input')
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setter.call(input, 'inspector rename')
        input.dispatchEvent(new Event('input', { bubbles: true }))
        return true
      })()`)
      await pressPlain(wc, 'Enter')
      await settle()
      const names = await wc.executeJavaScript(`(() => {
        const id = ${JSON.stringify(targetId)}
        const header = document.querySelector('.panel[data-panel-id="' + id + '"] .panel__title')
        const rail = document.querySelector('.rail-row[data-rail-row="' + id + '"] .rail-row__label')
        const heading = document.querySelector('[data-inspector-heading]')
        return {
          header: header ? header.textContent : null,
          rail: rail ? rail.textContent : null,
          heading: heading ? heading.textContent : null
        }
      })()`)
      ok('89 an inspector rename opens the palette and reaches all three views',
        opened === true && names.header === 'inspector rename' &&
          names.rail === 'inspector rename' && names.heading === 'inspector rename',
        `opened=${opened} ${JSON.stringify(names)}`)
    }

    // 90. SAVES THE SELECTED PANEL, NOT THE FOCUSED ONE.
    //     Driven with the two ids DELIBERATELY DIFFERENT, which is the entire
    //     check: taken with them equal it passes against the defect this channel
    //     exists to remove — main's own preset:capture path, which answers off
    //     focusedIdRef and would have saved the wrong panel every time the user
    //     reached the inspector by clicking a rail row (the one gesture that
    //     selects without focusing).
    //
    //     Every panel still alive at this point in the run shares one cwd
    //     ('/tmp' — check 73's Cmd+N spawn, off the boot default template, is
    //     the sole survivor of check 71's full workspace wipe). A same-cwd pair
    //     cannot discriminate the SELECTED preset's subtitle from the FOCUSED
    //     one's, so this check spawns a second panel at a DISTINCT, spaced cwd
    //     — a feature and not an accident, per CLAUDE.md's tmux exitDir note —
    //     rather than adding a third panel to the SEED_PANELS fixture every
    //     earlier count-based check would then have to account for.
    //
    //     Both ids are read out of PRODUCTION MARKUP rather than through a test
    //     hook, because neither hook answers this: __m4aSelection() returns the
    //     focused terminal's TEXT selection (not an id, despite the name) and
    //     __m4aSessions() reports {id, dormant, spawned} and no cwd. Widening
    //     either one for this check would be adding a hook to observe something
    //     the DOM already states — .panel--selected IS the selection, and DOM
    //     focus living inside a panel IS that panel being focused.
    //
    //     The preset's subtitle carries its full cwd (presetRows builds it as
    //     `command — cwd`), and the cwd is read off the inspector's own field
    //     BEFORE saving. That field is already pinned by check 87, so it is a
    //     legitimate source here rather than a second derivation.
    //
    //     M12: the subtitle this check now asserts against is a SYNTHETIC
    //     live cwd, sent directly at this point in the run rather than a
    //     real one — `backend` is still the DIRECT one the M6c fixture block
    //     installed here, so no real SESSION_LIVE would ever arrive and the
    //     saved cwd would equal the spawn cwd by pure fallback, which proves
    //     nothing about which one savePanelAsPreset actually reaches for.
    //     Forcing a live answer to exist turns "the saved cwd happens to
    //     equal the spawn cwd" into an assertion that FAILS if the consumer
    //     is ever reverted to `panel.spec.cwd` alone.
    {
      const SAVE_PRESET_DIR = mkdtempSync(join(tmpdir(), 'tc panels save-preset '))
      const idsBefore90 = new Set(await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`))
      win.webContents.send(IPC_EVENTS.PRESET_SPAWN, { cwd: SAVE_PRESET_DIR, command: '/bin/cat', args: [] })
      const idsAfter90 = await waitUntil(async () => {
        const now = await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
        return now.length > idsBefore90.size ? now : false
      }, 4000)
      const newId = idsAfter90 ? idsAfter90.find((id) => !idsBefore90.has(id)) : null
      if (!newId) throw new Error('90: PRESET_SPAWN produced no new panel')
      const hasPty90 = await waitUntil(async () => (await sessionMap(wc)).has(newId), 8000)
      if (!hasPty90) throw new Error(`90: panel ${newId} never got a PTY`)

      const ids = await waitUntil(async () => {
        const live = await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].filter((p) => p.querySelector('.xterm')).map((p) => p.dataset.panelId)`)
        return live.includes(newId) ? live : false
      }, 8000)
      if (!ids || ids.length < 2) throw new Error(`90: fewer than two live panels — ${JSON.stringify(ids)}`)
      const focusId = ids.find((id) => id !== newId)
      const selectId = newId

      const before = await wc.executeJavaScript(`window.canvas.preset.list()`)
      // Focus one panel by clicking into its terminal, the way a user does.
      // Dispatched on .xterm-screen, never on .panel__slot: xterm binds its
      // listeners on .xterm, one level BELOW the slot, and capture-toward-target
      // traversal never visits a target's own descendants — the mistake CLAUDE.md
      // records as costing two fix rounds during M4a.
      await wc.executeJavaScript(`
        document.querySelector('.panel[data-panel-id="' + ${JSON.stringify(focusId)} + '"] .xterm-screen')
          .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`)
      await settle()
      // Select the DIFFERENT, distinct-cwd one from the rail — selects and
      // raises, never focuses.
      await wc.executeJavaScript(`
        document.querySelector('.rail-row[data-rail-row="' + ${JSON.stringify(selectId)} + '"] .rail-row__main')
          .dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
      await settle()
      // M12: a SYNTHETIC live update, sent the identical way this check
      // already sends PRESET_SPAWN by hand — not a real tmux session. At
      // this point in the run `backend` is still the DIRECT one the M6c
      // fixture block installed (never reset to tmux until check 91), so
      // pollLive's own list() answers null and no real SESSION_LIVE would
      // ever arrive for this panel; without this send, LIVE_PRESET_DIR and
      // observed.cwd below would be indistinguishable — savePanelAsPreset's
      // `getLiveSession(...) ?? spec.cwd` and a reverted `spec.cwd` alone
      // would save the identical string, and the assertion at the bottom
      // would pass against either. Sending it directly is what turns "the
      // saved cwd happens to equal the spawn cwd" into an actual claim
      // about which one savePanelAsPreset reaches for.
      const LIVE_PRESET_DIR = mkdtempSync(join(tmpdir(), 'tc panels save-preset live '))
      win.webContents.send(IPC_EVENTS.SESSION_LIVE,
        { panelId: selectId, cwd: LIVE_PRESET_DIR, currentCommand: 'bash' })
      await waitUntil(async () => {
        const v = await wc.executeJavaScript(
          `(() => { const el = document.querySelector('[data-inspector-field="live-cwd"] .inspector__value'); return el ? el.textContent : null })()`)
        return v === LIVE_PRESET_DIR
      }, 5000)
      const observed = await wc.executeJavaScript(`(() => {
        const focusedEl = document.activeElement
        const focusedPanel = focusedEl && focusedEl.closest ? focusedEl.closest('.panel') : null
        const selectedPanel = document.querySelector('.panel--selected')
        const cwdEl = document.querySelector('[data-inspector-field="cwd"] .inspector__value')
        return {
          focused: focusedPanel ? focusedPanel.dataset.panelId : null,
          selected: selectedPanel ? selectedPanel.dataset.panelId : null,
          cwd: cwdEl ? cwdEl.textContent : null
        }
      })()`)
      await wc.executeJavaScript(`
        document.querySelector('[data-inspector-action="save-preset"]')
          .dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
      await settle()
      const after = await wc.executeJavaScript(`window.canvas.preset.list()`)
      const added = after.filter((p) => !before.some((b) => b.id === p.id))
      // The cwd clause reads LIVE_PRESET_DIR now, not observed.cwd (the
      // SPAWN field) — M12's savePanelAsPreset saves where the SELECTED
      // panel IS, falling back to where it was spawned only absent a live
      // answer, and this check now forces a live answer to exist so the
      // fallback is not what is being measured. LIVE_PRESET_DIR !==
      // observed.cwd is asserted explicitly so a future reader can see the
      // two are deliberately different values, not a typo.
      ok('90 the inspector saves the SELECTED panel, with focus deliberately elsewhere',
        observed.focused === focusId && observed.selected === selectId &&
          observed.focused !== observed.selected &&
          added.length === 1 && observed.cwd !== null &&
          LIVE_PRESET_DIR !== observed.cwd &&
          added[0].subtitle.endsWith(LIVE_PRESET_DIR),
        `${JSON.stringify(observed)} live=${LIVE_PRESET_DIR} added=${JSON.stringify(added)}`)
    }

    // ---------------------------------------------------------------------
    // M8c's restart block (91-94). Check 91 RELOADS the renderer, so
    // everything below it reasons about the RESTORED canvas rather than the
    // one checks 87-90 built — the same "runs last on purpose" caution check
    // 26 carries further up this file. 92 and 93 therefore spawn or find
    // their own targets rather than inheriting an id from above.
    // ---------------------------------------------------------------------

    // 91. THE REATTACHED BADGE — M6a's outstanding success criterion, met.
    //     CLAUDE.md records PanelStatus.running.reattached as a live field
    //     with ZERO readers, and the spec's "a reattached panel visibly says
    //     so" criterion as deliberately unmet. Task 2 shipped the reader; this
    //     is the check that observes it end to end, through a real reload of a
    //     real tmux-backed session.
    //
    //     It runs its OWN reload rather than borrowing check 26's, for the
    //     reason check 39's comment gives about the same temptation: coupling
    //     to another check's setup makes this one fail for reasons that have
    //     nothing to do with the badge. It also has to put the manager BACK on
    //     the tmux backend — the M6c fixture block (checks 54-57) deliberately
    //     swapped it to the direct one, and DirectBackend.hasSession() answers
    //     false unconditionally by design, so reattachment is not merely
    //     unlikely there but unreachable.
    //
    //     Skipped LOUDLY without tmux, never silently: the direct backend has
    //     no reattachment to display at all, so a green here on a tmux-free
    //     machine would be a lie about coverage.
    //
    //     The badge and the pid are both needed, and neither implies the
    //     other. The badge alone is satisfied by a pane that hardcodes it; the
    //     SAME PANE PID either side of the reload is what says the session
    //     genuinely outlived its client rather than being silently respawned —
    //     the identical discriminator check 64 relies on for a workspace
    //     switch. The badge is read together with WHICH panel is selected,
    //     because the inspector renders one panel at a time and a count of 1
    //     taken alone could belong to a stale selection.
    {
      const TMUX_91 = findTmux()
      if (!TMUX_91 || !tmuxBackend) {
        ok('91 the reattached badge (SKIPPED — no tmux binary found)', true,
          'install tmux to cover this')
      } else {
        // Back onto the real tmux backend. Every session spawned since the
        // M6c fixture block is a plain node-pty process and stays one; those
        // die with the reload below and their panels simply restore dormant,
        // which is exactly what check 93 then needs.
        backend = tmuxBackend
        const idsBefore91 = new Set(await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`))
        // A REAL shell through PRESET_SPAWN, the same substitution checks
        // 54-63 and 83 make: Cmd+N's default here is `/bin/cat -v`, which is
        // not a session worth reattaching to and rings no bell for 92 either.
        win.webContents.send(IPC_EVENTS.PRESET_SPAWN, { cwd: '/tmp', command: '/bin/sh', args: [] })
        const idsAfter91 = await waitUntil(async () => {
          const now = await wc.executeJavaScript(
            `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
          return now.length > idsBefore91.size ? now : false
        }, 4000)
        const targetId = idsAfter91 ? idsAfter91.find((id) => !idsBefore91.has(id)) : null
        if (!targetId) throw new Error('91: PRESET_SPAWN produced no new panel')
        // tmux's OWN answer, not pty:create resolving: the assertion below is
        // about what survives on the socket, so that is what has to be waited
        // on here too.
        const before = await waitUntil(async () => {
          const m = await sessionMap(wc)
          return m.has(targetId) ? m : false
        }, 10000)
        if (!before) throw new Error(`91: panel ${targetId} never reached pty:list`)

        // The panel has to be ON DISK before the reload, or the restored
        // canvas has no panel to reattach and this fails as "no badge" with
        // nothing pointing at the 500ms save debounce.
        flushLayoutStore()
        const reloaded = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload()
        await reloaded
        // Restored, promoted, and spawned again — the reattach itself. The
        // xterm is the signal that attachSlot ran, which is what calls
        // pty:create and therefore what asks main the has-session question.
        // The rail row FIRST, and it is not merely a way to open the inspector
        // on this panel — it is what brings the panel back into the cull
        // region. A restored panel is only promoted (and therefore only
        // reattached) once it is somewhere the camera can see, and this one
        // lands off screen: PRESET_SPAWN cascades away from the panel check 90
        // left centred, far enough that the restored camera does not cover it.
        // Waiting for the reattach BEFORE framing it waits forever, and reads
        // as a broken reattach rather than as a carded panel — which is what
        // an earlier draft of this check did.
        //
        // Clicking it is also the honest user story: reload the app, click the
        // panel in the rail, and the inspector says the session survived.
        // goToPanel centres and selects without WAKING, so a genuinely dormant
        // panel would stay dormant here — this one is reattachable, not
        // dormant, which is exactly the distinction CLAUDE.md's "Dormancy is
        // about spawning, not attaching" draws.
        const rowClicked = await waitUntil(async () => await wc.executeJavaScript(`(() => {
          const row = document.querySelector('.rail-row[data-rail-row="' + ${JSON.stringify(targetId)} + '"] .rail-row__main')
          if (!row) return false
          row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
          return true
        })()`), 15000)
        // The REATTACH ITSELF: the panel promoted and spawning again, which is
        // the only thing that asks main the has-session question the badge
        // reports. Guarded on the hook EXISTING — it is installed by a Canvas
        // effect, so for the first moments after did-finish-load a bare call
        // throws, which in this suite aborts the whole run rather than failing
        // one check.
        const spawnedAgain = await waitUntil(async () => await wc.executeJavaScript(
          `((window.__m4aSessions ? window.__m4aSessions() : []).find(
             (s) => s.id === ${JSON.stringify(targetId)}) || {}).spawned === true`),
          20000)
        await settle()
        // The SELECTED panel is read alongside the badge, never the badge
        // alone. The inspector renders whichever panel is selected, so a
        // count of 1 taken by itself would be satisfied by a stale selection
        // left over from check 90 — the badge would be real and would be
        // about a different panel entirely.
        const shown = await wc.executeJavaScript(`(() => {
          const sel = document.querySelector('.panel--selected')
          return {
            selected: sel ? sel.dataset.panelId : null,
            badge: document.querySelectorAll('[data-inspector-badge="reattached"]').length
          }
        })()`)
        const after = await sessionMap(wc)
        ok('91 a panel whose session survived a reload says so in the inspector',
          rowClicked === true && spawnedAgain === true &&
            shown.selected === targetId && shown.badge === 1 &&
            after.get(targetId) !== undefined && after.get(targetId) === before.get(targetId),
          `target=${targetId} row=${rowClicked} spawned=${spawnedAgain} ` +
            `shown=${JSON.stringify(shown)} pid ${before.get(targetId)} -> ${after.get(targetId)}`)
      }
    }

    // 92. RESTART: A DIFFERENT PROCESS, AND NO INHERITED QUESTION.
    //     Both halves in one read, because each alone passes against a real
    //     bug. The pid alone is satisfied by a restart that leaves the old
    //     amber border in place — a fresh agent wearing a dead one's question,
    //     which is exactly what clearAgentState is there to prevent, since
    //     agent state survives a panel's closure BY DESIGN. The cleared state
    //     alone is satisfied by a "restart" that only calls clearAgentState
    //     and never touches the process at all.
    //
    //     The third clause is the respawn: an .xterm back under the panel.
    //     Restart mints a NEW handle at the same id, so React tears the old
    //     host out and mounts the new one — and nothing in the verb itself
    //     re-renders except bumpVersion(). Without that bump the panel shows
    //     literally nothing, with no error anywhere; the pid clause cannot
    //     see it, because the pid changes whether or not anyone rendered.
    //
    //     Spawns its OWN /bin/sh through PRESET_SPAWN rather than reusing a
    //     panel the run already has, for the reason check 83's comment
    //     records at length: the boot default here is `/bin/cat -v`, which
    //     echoes the literal bytes `printf '\007'\n` and never emits a 0x07,
    //     so the bell could never ring and the check could never pass —
    //     against correct code or broken. The bell mechanism itself is check
    //     54's, unchanged; inventing a second one would let a bell that never
    //     reaches main make this check green for a reason that has nothing to
    //     do with restart.
    //
    //     Runs on whichever backend check 91 left installed — the TMUX one on
    //     any machine that has tmux, which is the configuration that matters
    //     most here: `new-session -A` attaches rather than creates, so a
    //     restart that respawned before the kill landed would come back with
    //     the same pane pid and this check's own pid clause is what would say
    //     so. On a tmux-free machine 91 skips, the direct backend stays, and
    //     this still covers the dispose-then-ensure sequence — just not the
    //     ordering hazard that only tmux has.
    {
      const BELL_LINE_92 = "printf '\\007'\n"
      const idsBefore92 = new Set(await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`))
      win.webContents.send(IPC_EVENTS.PRESET_SPAWN, { cwd: '/tmp', command: '/bin/sh', args: [] })
      const idsAfter92 = await waitUntil(async () => {
        const now = await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
        return now.length > idsBefore92.size ? now : false
      }, 4000)
      const targetId = idsAfter92 ? idsAfter92.find((id) => !idsBefore92.has(id)) : null
      if (!targetId) throw new Error('92: PRESET_SPAWN produced no new panel')
      // LIVE, and asserted rather than assumed: LIVE_BUDGET caps live panels
      // at eight while this canvas is larger, so "the newest session" is not
      // by itself "a panel with an .xterm under it" — and a restart driven
      // against a carded panel would prove nothing about the respawn.
      const live92 = await waitUntil(async () => await wc.executeJavaScript(
        `document.querySelectorAll('.panel[data-panel-id="' + ${JSON.stringify(targetId)} + '"] .xterm').length === 1`),
        10000)
      const hasPty92 = await waitUntil(async () => (await sessionMap(wc)).has(targetId), 10000)
      // The rail row selects and raises WITHOUT focusing or acknowledging
      // (rule 1), so the inspector points at this panel while the wants-you
      // rung below survives — a click into the terminal would acknowledge it.
      await wc.executeJavaScript(`(() => {
        const row = document.querySelector('.rail-row[data-rail-row="' + ${JSON.stringify(targetId)} + '"] .rail-row__main')
        if (row) row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        return row !== null
      })()`)
      await settle()
      ptyManager.write(targetId, BELL_LINE_92)
      const waiting = await waitUntil(async () => await wc.executeJavaScript(
        `(() => {
          const p = document.querySelector('.panel[data-panel-id="' + ${JSON.stringify(targetId)} + '"]')
          return p !== null && p.getAttribute('data-agent-state') === 'wants-you'
        })()`), 8000)
      const pidBefore = (await sessionMap(wc)).get(targetId)
      // Guarded rather than a bare dispatch: an ABSENT control must fail this
      // check, not throw. A throw in this single-script suite aborts the run,
      // and checks 93 and 94 below would never execute at all.
      const clicked = await wc.executeJavaScript(`(() => {
        const el = document.querySelector('[data-inspector-action="restart"]')
        if (!el) return false
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        return true
      })()`)
      // READ IMMEDIATELY, with nothing awaited in between — this is the clause
      // that makes clearAgentState observable at all, and it was added after a
      // fault injection showed the settled read below is NOT discriminating:
      // delete clearAgentState(id) and the settled state is still 'busy',
      // because main's `create` sends `starting` directly at spawn and
      // re-seeds the entry a moment later. The end states are identical; only
      // the WINDOW differs, and the window is the whole point — a panel
      // restarted out of wants-you must not keep its amber border while the
      // new process is coming up.
      //
      // The margin is wide rather than tight. clearAgentState notifies the
      // store inside the click handler, so React has flushed before this next
      // IPC round trip arrives. Without it the state can only change once the
      // kill has resolved, ensure has run, a render has mounted a slot,
      // attachSlot has issued pty:create and main has answered with
      // `starting` — four more round trips, one of them a tmux spawn.
      const immediate = await wc.executeJavaScript(`(() => {
        const p = document.querySelector('.panel[data-panel-id="' + ${JSON.stringify(targetId)} + '"]')
        return p === null ? 'MISSING' : p.getAttribute('data-agent-state')
      })()`)
      const respawned = await waitUntil(async () => {
        const pid = (await sessionMap(wc)).get(targetId)
        return pid !== undefined && pid !== pidBefore ? pid : false
      }, 15000)
      await settle()
      const state = await wc.executeJavaScript(`(() => {
        const p = document.querySelector('.panel[data-panel-id="' + ${JSON.stringify(targetId)} + '"]')
        return p === null ? 'MISSING' : p.getAttribute('data-agent-state')
      })()`)
      const relive = await wc.executeJavaScript(
        `document.querySelectorAll('.panel[data-panel-id="' + ${JSON.stringify(targetId)} + '"] .xterm').length`)
      ok('92 restart replaces the process and does not inherit the old wants-you',
        live92 === true && hasPty92 === true && waiting === true && clicked === true &&
          respawned !== false && respawned !== pidBefore &&
          immediate !== 'wants-you' && state !== 'wants-you' && relive === 1,
        `target=${targetId} live=${live92} waiting=${waiting} clicked=${clicked} ` +
          `pid ${pidBefore} -> ${respawned} immediate=${immediate} state=${state} xterm=${relive}`)
    }

    // 93. DISABLED, NOT ABSENT, ON A PANEL THAT NEVER STARTED. A restart
    //     control that vanished would read as a feature that is missing — the
    //     rule verify:palette 31 states — and one that RAN would end a process
    //     that does not exist and then re-ensure a session the user never
    //     asked to start, waking a panel from a verb whose name says the
    //     opposite.
    //
    //     The target is FOUND at run time, never named. The obvious fixture is
    //     the dormant panel check 84 seeds — but check 85 immediately clicks
    //     its start control and asserts it wakes, so by the time this runs it
    //     is spawned and `restartable` is legitimately true; the check would
    //     fail against a fixture that no longer describes it and read as a
    //     broken disabled-gate. Asserting the panel was FOUND is half the
    //     check: without it, a null id flows into the selector and the failure
    //     says nothing at all.
    {
      const dormantId = await wc.executeJavaScript(
        `(window.__m4aSessions().find((s) => s.dormant === true || s.spawned === false) || {}).id || null`)
      const selected = await wc.executeJavaScript(`(() => {
        const row = document.querySelector('.rail-row[data-rail-row="' + ${JSON.stringify(dormantId)} + '"] .rail-row__main')
        if (!row) return false
        row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        return true
      })()`)
      await settle()
      const control = await wc.executeJavaScript(`(() => {
        const el = document.querySelector('[data-inspector-action="restart"]')
        return el ? { present: true, disabled: el.disabled } : { present: false }
      })()`)
      ok('93 restart is present and disabled for a panel that never started',
        dormantId !== null && selected === true &&
          control.present === true && control.disabled === true,
        `dormantId=${dormantId} selected=${selected} control=${JSON.stringify(control)}`)
    }

    // 94. THE TWO COUNTS THIS MILESTONE MOVES, RE-DERIVED RATHER THAN TRUSTED.
    //     CLAUDE.md records that the dispose call-site count went stale once
    //     already — it said two while the reset handler had made it three —
    //     so M8c pins both numbers in a check instead of in prose alone.
    //     Reading the SOURCE is the point, not a shortcut: no runtime
    //     behaviour can observe how many callers a function has, and the
    //     invariant ("pty.kill has exactly two callers, both inside
    //     session-registry.ts") is a fact about the source text.
    //
    //     When a later milestone legitimately adds a dispose call site this
    //     goes red, and the number is then updated DELIBERATELY with the
    //     reason in the commit message. That is the whole mechanism.
    {
      const registrySrc = readFileSync(
        join(__dirname, '..', 'src', 'renderer', 'session', 'session-registry.ts'), 'utf8')
      const canvasSrc = readFileSync(
        join(__dirname, '..', 'src', 'renderer', 'canvas', 'Canvas.tsx'), 'utf8')
      const kills = (registrySrc.match(/bridge\.pty\.kill\(/g) ?? []).length
      const disposes = (canvasSrc.match(/registry\.dispose\(/g) ?? []).length
      ok('94 pty.kill still has exactly two callers, and Canvas has five dispose sites',
        kills === 2 && disposes === 5, `kills=${kills} disposes=${disposes}`)
    }

    // ---------------------------------------------------------------------
    // M8d — the rail's Workspaces and Attention sections.
    // ---------------------------------------------------------------------

    // Local helpers: panBy and agentStateOf are block-scoped to the M6c/M6d
    // block far above and are not reachable here.
    const railPan = (dx, dy) => wc.executeJavaScript(`
      document.querySelector('.canvas').dispatchEvent(new WheelEvent('wheel', {
        bubbles: true, cancelable: true, clientX: 700, clientY: 450,
        deltaX: ${dx}, deltaY: ${dy}, deltaMode: 0
      }))
      true
    `)
    const railAgentState = (id) => wc.executeJavaScript(
      `(() => { const el = document.querySelector('[data-panel-id=${JSON.stringify(id)}]')
                return el ? el.getAttribute('data-agent-state') : null })()`)
    const clickRail = (selector) => wc.executeJavaScript(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)})
      if (!el) return false
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      return true
    })()`)
    const activeWorkspaceId = () => wc.executeJavaScript(
      `window.canvas.workspace.list().then((r) => (r.find((w) => w.active) || {}).id)`)

    // 95. SWITCHING FROM THE RAIL IS THE SAME SWITCH, WITH THE SAME PIDS.
    //     Check 64 makes this claim for the palette's switcher and explains
    //     why the pid is the only observable that can make it: every other
    //     read — panel counts, the layout, the file on disk — stays green
    //     against an implementation that quietly disposes and respawns on
    //     switch, because a respawned agent is indistinguishable from a
    //     reattached one in anything that only counts. The rail is a SECOND
    //     door onto the same action, so it inherits the same obligation, and
    //     the spec's "the shell adds no second switching path" is precisely
    //     the claim this check tests.
    //
    //     The workspace ids are captured, never hardcoded: nextWorkspaceId()
    //     mints w<max+1> over whatever already exists and this suite has
    //     created and deleted several by now, so a literal here would be a
    //     guess.
    //
    //     What a wrong guess COSTS differs from check 64's, and the two
    //     comments differ for that reason rather than by accident. 64 switches
    //     programmatically and asserts only on pids, so a wrong id there is
    //     genuinely SILENT: activate() returns null, nothing changes, and the
    //     pid comparison passes vacuously. This switch goes through a real DOM
    //     click, which gives it something to fail on — clickRail matches no
    //     row and returns false, and the clicked === true clause below goes
    //     red. Capture the id either way; here it is what keeps the check
    //     RUNNABLE, there it is what keeps it from lying.
    const homeWorkspaceId = await activeWorkspaceId()
    {
      const before = await settledSessionMap(wc)
      await wc.executeJavaScript(`window.__m7aWorkspace().createAndSwitch('rail-away')`)
      await settle()
      const clicked = await clickRail(
        `.rail-row[data-rail-workspace=${JSON.stringify(homeWorkspaceId)}] .rail-row__main`)
      await settle()
      const landedOn = await activeWorkspaceId()
      const after = await settledSessionMap(wc)
      const { ok: preserved, changed } = pidsPreserved(before, after)
      ok('95 clicking a rail workspace row switches, keeping every pid',
        clicked === true && landedOn === homeWorkspaceId &&
          before.size > 0 && preserved,
        `clicked=${clicked} landed=${landedOn} before=${before.size} changed=[${changed.join(', ')}]`)
    }

    // 95b. The ACTIVE workspace's row is present and DISABLED, never absent.
    //      The rule verify:palette 60 already pins for the palette's own
    //      switch row, and it is the same argument check 31 makes there: a
    //      row that disappears is indistinguishable from a feature that is
    //      missing, and here it would also make the rail's list silently
    //      disagree with its own count of how many workspaces exist.
    {
      const state = await wc.executeJavaScript(`(() => {
        const row = document.querySelector(
          '.rail-row[data-rail-workspace=${JSON.stringify(homeWorkspaceId)}]')
        if (!row) return null
        const main = row.querySelector('.rail-row__main')
        return {
          present: true,
          disabled: main.disabled === true,
          canRename: row.querySelector('.rail-row__rename') !== null,
          canDelete: row.querySelector('.rail-row__close') !== null,
          tail: row.querySelector('.rail-row__tail').textContent
        }
      })()`)
      ok('95b the active workspace row is disabled, not absent, and still admin-able',
        state !== null && state.disabled === true &&
          state.canRename === true && state.canDelete === true &&
          /\d+ panel/.test(state.tail),
        JSON.stringify(state))
    }

    // 95c. THE RENAME CONTROL IS A DOOR, AND IT OPENS FOR THE RIGHT WORKSPACE.
    //      95b proves the ✎ and × ELEMENTS exist; nothing until now proved
    //      either of them does anything. A missing {...shellControl(...)}
    //      spread on one of those buttons leaves every other check in this
    //      milestone green — the element is still rendered, still titled,
    //      still counted by 95b — while the spec's central claim, that the row
    //      is a second door onto an action that already exists rather than a
    //      second implementation of it, goes unproven for that door.
    //
    //      The VALUE clause is what makes this more than "something happened".
    //      Asserting only that the palette opened in text mode passes against
    //      a row that hands over a hardcoded id, or the ACTIVE workspace's id
    //      instead of its own — both of which open a perfectly real rename
    //      prompt aimed at the wrong workspace, and the user's next Enter
    //      renames a canvas they were not looking at. So the target here is
    //      deliberately a NON-active row (rail-away, created by check 95),
    //      read out of workspace.list() rather than named literally: with the
    //      active row as the target, the id-swap this clause exists to catch
    //      would be indistinguishable from correct.
    //
    //      It stops at the door and does not drive the rename home:
    //      beginRenameWorkspace's submit path is the palette's own, already
    //      covered there, and re-proving it here would only add a rename this
    //      suite's later checks would have to know about.
    //
    //      + and × stay unchecked, deliberately: create is reachable only
    //      through the same input mode this check already opens, and delete
    //      would leave a destroyed workspace behind for checks 96-98b, which
    //      spawn panels and ring bells against the fixture as it stands.
    {
      const target = await wc.executeJavaScript(
        `window.canvas.workspace.list().then((rows) => {
           const w = rows.find((r) => !r.active)
           return w ? { id: w.id, name: w.name } : null
         })`)
      const clicked = target !== null && await clickRail(
        `.rail-row[data-rail-workspace=${JSON.stringify(target && target.id)}] .rail-row__rename`)
      // Polled, not slept. Every other palette-opening check in this file waits
      // on the input existing rather than on a flat settle(), and the reason is
      // that a fixed sleep is only ever correct on the machine it was tuned on
      // — a slower one turns this into an intermittent red against a codebase
      // that is fine, which costs someone a debugging session pointed at
      // nothing. The false branch is asserted below, not thrown on, so a door
      // that genuinely never opens still reports as 95c failing.
      await waitUntil(
        () => wc.executeJavaScript(`document.querySelector('.palette__input') !== null`), 2000)
      // Guarded reads throughout. An uncaught exception here ends the run and
      // every check below it — 96, 97, 98, 98b — is never reached, so their
      // absence would read as a suite that shrank rather than one that broke.
      const mode = await wc.executeJavaScript(`(() => {
        const input = document.querySelector('.palette__input')
        return {
          open: document.querySelector('.palette') !== null,
          value: input ? input.value : null,
          // Absent while inputMode is set — the palette is a text prompt here,
          // not a command list.
          list: document.querySelector('.palette__list') !== null
        }
      })()`)
      ok('95c the rail rename control opens the palette in text mode for THAT workspace',
        clicked === true && mode.open === true && mode.list === false &&
          target !== null && mode.value === target.name,
        `target=${JSON.stringify(target)} clicked=${clicked} mode=${JSON.stringify(mode)}`)

      // Leave the app as 96-98b expect to find it: no overlay, no input mode.
      //
      // Wrapped in an IIFE, like the ~twenty other `const input` bodies in this
      // file and unlike the one block that suffixes its names instead
      // (chrome18/opts18). Either fix works; the IIFE is the majority form and
      // needs no name discipline from the next author. A top-level `const` in
      // an executeJavaScript string is a lexical binding that PERSISTS in the
      // frame's global scope, so the second unwrapped block to pick the same
      // name throws a SyntaxError — which aborts the run and takes every check
      // below it with it, the failure mode this file's own header warns about.
      await wc.executeJavaScript(`(() => {
        const input = document.querySelector('.palette__input')
        if (input) input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        return true
      })()`)
      await waitUntil(
        () => wc.executeJavaScript(`document.querySelector('.palette') === null`), 2000)
    }

    // 96. A HIDDEN WORKSPACE WITH A WAITING PANEL SAYS SO ON ITS RAIL ROW.
    //     70b's fixture reached from the new surface, and the strongest form
    //     of M6d's premise: an agent you cannot see because its whole CANVAS
    //     is hidden, not merely because it is off screen. It is also the one
    //     check that proves the two sections divide the question the way the
    //     spec says they do — Attention cannot name this panel (it is not on
    //     this canvas, and a row that navigates nowhere is worse than none),
    //     so the workspace row's count is the ONLY place the fact surfaces.
    {
      const BELL_LINE = "printf '\\007'\n"
      const waitroomId = await wc.executeJavaScript(
        `window.__m7aWorkspace().createAndSwitch('rail-waitroom')`)
      await settle()
      // A real shell, not Cmd+N's default `cat -v`: cat only ECHOES what it is
      // handed, so the escaped text never becomes a 0x07 byte and the check
      // could not pass against correct code. Same substitution 54-63, 70b and
      // 83 all make.
      const idsBefore = await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
      win.webContents.send(IPC_EVENTS.PRESET_SPAWN, { cwd: '/tmp', command: '/bin/sh', args: [] })
      const panelId = await waitUntil(async () => {
        const now = await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
        return now.find((id) => !idsBefore.includes(id)) || false
      }, 4000)
      if (!panelId) throw new Error('96: PRESET_SPAWN produced no new panel')
      const spawned = await waitUntil(
        async () => (await settledSessionMap(wc)).has(panelId), 8000)
      if (!spawned) throw new Error(`96: panel ${panelId} never got a PTY`)
      ptyManager.write(panelId, BELL_LINE)
      const rang = await waitUntil(
        async () => (await railAgentState(panelId)) === 'wants-you', 6000)
      if (rang !== true) throw new Error('96: the panel never reached wants-you')

      await wc.executeJavaScript(
        `window.__m7aWorkspace().switchTo(${JSON.stringify(homeWorkspaceId)})`)
      await settle()
      const tail = await wc.executeJavaScript(`(() => {
        const row = document.querySelector(
          '.rail-row[data-rail-workspace=${JSON.stringify(waitroomId)}]')
        return row ? row.querySelector('.rail-row__tail').textContent : null
      })()`)
      ok('96 a hidden workspace with a waiting panel says so on its rail row',
        tail !== null && tail.includes('1 waiting'), `tail=${JSON.stringify(tail)}`)
    }

    // 97. A WAITING PANEL APPEARS IN THE QUEUE, AND CLICKING IT NAVIGATES
    //     WITHOUT ACKNOWLEDGING.
    //     Three facts in one read, and each alone passes against a different
    //     wrong rail. The ROW existing is satisfied by a section that lists
    //     every panel rather than the queue. The CAMERA moving is satisfied by
    //     a row wired to onSelectPanel — which would also wake a dormant panel
    //     and is the exact shape check 84 exists to reject. And the amber
    //     surviving is the one that pins the spec's rule that the shell never
    //     acknowledges: focus is the renderer's single acknowledgement
    //     trigger and main is the sole author of the state, so a row that
    //     cleared it locally would make the renderer a second author of a
    //     fact main owns.
    //
    //     The COLOUR is read, not the state, for check 62's reason: the
    //     failure this guards is purely visual. Main can hold wants-you
    //     perfectly while .panel--selected paints over it in blue, and a check
    //     asking only "is the state still wants-you" passes against exactly
    //     that regression.
    let attentionPanelId = null
    {
      const BELL_LINE = "printf '\\007'\n"
      const idsBefore = await wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
      win.webContents.send(IPC_EVENTS.PRESET_SPAWN, { cwd: '/tmp', command: '/bin/sh', args: [] })
      attentionPanelId = await waitUntil(async () => {
        const now = await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
        return now.find((id) => !idsBefore.includes(id)) || false
      }, 4000)
      if (!attentionPanelId) throw new Error('97: PRESET_SPAWN produced no new panel')
      const spawned = await waitUntil(
        async () => (await settledSessionMap(wc)).has(attentionPanelId), 8000)
      if (!spawned) throw new Error(`97: panel ${attentionPanelId} never got a PTY`)
      ptyManager.write(attentionPanelId, BELL_LINE)
      const rang = await waitUntil(
        async () => (await railAgentState(attentionPanelId)) === 'wants-you', 6000)
      if (rang !== true) throw new Error('97: the panel never reached wants-you')

      // Built once rather than quoted inline at each use. Threading a
      // selector through two template layers is how a check ends up matching
      // nothing and reporting a pass; 98 builds its own for the same reason,
      // since this one is block-scoped to check 97.
      const attentionRowSel =
        `.rail-attention[data-rail-attention=${JSON.stringify(attentionPanelId)}]`
      const rowAppeared = await waitUntil(() => wc.executeJavaScript(
        `document.querySelector(${JSON.stringify(attentionRowSel)}) !== null`), 4000)

      // Pan the panel away first, so "the click framed it" is a claim the
      // camera can actually falsify. Clicking a row for a panel already
      // centred moves nothing and would pass against a row wired to nothing.
      await railPan(-1800, -1200)
      await settle()
      const before97 = await wc.executeJavaScript(`window.__m4aViewport()`)
      const clicked = await clickRail(`${attentionRowSel} .rail-row__main`)
      await settle()
      const after97 = await wc.executeJavaScript(`window.__m4aViewport()`)
      const colour = await wc.executeJavaScript(`(() => {
        const el = document.querySelector('[data-panel-id=${JSON.stringify(attentionPanelId)}]')
        if (!el) return null
        const amber = getComputedStyle(document.documentElement).getPropertyValue('--amber').trim()
        const probe = document.createElement('div')
        probe.style.color = amber
        document.body.appendChild(probe)
        const want = getComputedStyle(probe).color
        probe.remove()
        return { border: getComputedStyle(el).borderTopColor, want }
      })()`)
      ok('97 the attention row navigates to its panel and leaves it amber',
        rowAppeared === true && clicked === true &&
          (after97.x !== before97.x || after97.y !== before97.y) &&
          after97.scale === before97.scale &&
          colour !== null && colour.border === colour.want,
        `row=${rowAppeared} clicked=${clicked} ` +
          `${JSON.stringify(before97)} -> ${JSON.stringify(after97)} ${JSON.stringify(colour)}`)
    }

    // 98. FOCUS IS STILL WHAT ACKNOWLEDGES, AND THE ROW LEAVES WITH THE STATE.
    //     The other half of 97, and the half that proves the section is a VIEW
    //     over the attention set rather than a list with a life of its own: a
    //     row that survived the state clearing would navigate to a panel with
    //     nothing to say, and the queue would only ever grow.
    //
    //     Clicking the PANEL (now on screen, because 97 framed it) is the
    //     gesture — not a rail control, which by design takes neither DOM
    //     focus nor focusedId and therefore acknowledges nothing.
    {
      const point = await wc.executeJavaScript(`(() => {
        const el = document.querySelector(
          '[data-panel-id=${JSON.stringify(attentionPanelId)}] .panel__slot')
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
      })()`)
      // NOT a throw, unlike 96/97's fixture guards. At the RED step 97's
      // click does nothing, so the panel is still off screen and may be a
      // card with no .panel__slot at all — and a throw here would end the run
      // and take 98b's RED with it. A missing slot is a real failure of this
      // check, so it is reported as one.
      if (!point) {
        ok('98 focusing the panel clears the state and its attention row',
          false, 'no .panel__slot to click — the panel was never framed')
      } else {
      wc.sendInputEvent({ type: 'mouseDown', x: point.x, y: point.y, button: 'left', clickCount: 1 })
      wc.sendInputEvent({ type: 'mouseUp', x: point.x, y: point.y, button: 'left', clickCount: 1 })
      // One selector string, built once. Nesting JSON.stringify inside a
      // template inside executeJavaScript is exactly the kind of quoting that
      // silently matches nothing and reports a pass.
      const rowSel = JSON.stringify(
        `.rail-attention[data-rail-attention=${JSON.stringify(attentionPanelId)}]`)
      const panelSel = JSON.stringify(`[data-panel-id=${JSON.stringify(attentionPanelId)}]`)
      const gone = await waitUntil(async () => {
        const state = await wc.executeJavaScript(`(() => {
          const panel = document.querySelector(${panelSel})
          return {
            agent: panel ? panel.getAttribute('data-agent-state') : null,
            row: document.querySelector(${rowSel}) !== null
          }
        })()`)
        return (state.agent !== 'wants-you' && state.row === false) ? state : false
      }, 6000)
      ok('98 focusing the panel clears the state and its attention row',
        gone !== false, `state=${JSON.stringify(gone)}`)
      }
    }

    // The empty state, read once now that 98 has emptied the queue. It is the
    // state this section is in nearly all the time, which is exactly why it is
    // the one most likely to have been left rendering nothing at all — and a
    // section header with a void under it reads as a broken list rather than
    // as "nobody needs you".
    {
      const empty = await wc.executeJavaScript(`(() => {
        const el = document.querySelector('.rail-list--attention .rail-empty')
        return el ? el.textContent : null
      })()`)
      ok('98b an empty attention queue says so rather than rendering nothing',
        typeof empty === 'string' && empty.trim().length > 0, `empty=${JSON.stringify(empty)}`)
    }

    // 99-101 share one fixture repository and one block. This is the only
    // place in the milestone where a real panel, in a real renderer, is
    // driven against a real git repository — everything in verify:review is
    // argued against a fake runner, and everything else in this suite never
    // touches git at all.
    //
    // Skipped LOUDLY on a machine with no git, never silently, and never by
    // hard-failing: without this guard the execFileSync below throws into
    // this suite's outer try, is recorded as an `infrastructure` failure and
    // takes `npm run verify` red for a reason that has nothing to do with the
    // code under test. The same guard verify:review already carries for its
    // own real-git block, and the rule CLAUDE.md states for the tmux block.
    let GIT_OK = true
    try { execFileSync('git', ['--version'], { stdio: 'ignore' }) } catch { GIT_OK = false }
    if (!GIT_OK) {
      // 116-117 do not touch git at all, but they are nested inside this
      // block purely to reuse its spawnAt/sessionMap helpers — so a machine
      // with no git binary skips them too, and this message says so rather
      // than leaving them unexplained.
      console.log('SKIP  99-101, 113-115 and 116-117 — no git binary found (loudly, not silently)')
    } else {
      const repo = mkdtempSync(join(tmpdir(), 'tc panels review '))
      // A directory that is definitely NOT a repository, for check 100.
      // Deliberately its own mkdtemp rather than "any panel that is not
      // first": the other fixture panels are `~`, and a developer who keeps
      // dotfiles in a git checkout at $HOME — a common setup — would get a
      // red 100 with a misleading message about a genuine repository.
      const notRepo = mkdtempSync(join(tmpdir(), 'tc panels notrepo '))
      const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' })
      git('init', '-q', '.')
      git('config', 'user.email', 'v@example.com')
      git('config', 'user.name', 'v')
      writeFileSync(join(repo, 'seed.txt'), 'seed\n')
      git('add', '-A')
      git('commit', '-qm', 'init')

      /* Spawns through the SAME PRESET_SPAWN event check 27 uses, and returns
         the id that appeared. /bin/sh rather than the default: this block
         writes real shell commands, and Cmd+N's default here is
         `/bin/cat -v`, which ECHOES bytes rather than interpreting them — the
         substitution checks 54-63 and 83 already make for the same reason. */
      const spawnAt = async (cwd) => {
        const before = new Set(await wc.executeJavaScript(
          `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`))
        wc.send(IPC_EVENTS.PRESET_SPAWN, { cwd, command: '/bin/sh', args: [], w: 400, h: 300 })
        const ids = await waitUntil(async () => {
          const now = await wc.executeJavaScript(
            `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
          return now.length > before.size ? now : false
        }, 3000)
        return ids ? ids.find((id) => !before.has(id)) : undefined
      }

      /* A real sendInputEvent click, not a dispatched MouseEvent: check 75c
         records why a synthetic one proves nothing about focus, and selection
         here has to be the real thing for the inspector to follow it. */
      const selectPanel = async (id, opts = {}) => {
        const box = await wc.executeJavaScript(
          `(() => { const p = document.querySelector('[data-panel-id=' + ${JSON.stringify(JSON.stringify(id))} + ']');
                    if (!p) return null;
                    const r = p.getBoundingClientRect();
                    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 24) } })()`)
        if (!box) return false
        wc.sendInputEvent({ type: 'mouseDown', x: box.x, y: box.y, button: 'left', clickCount: 1 })
        wc.sendInputEvent({ type: 'mouseUp', x: box.x, y: box.y, button: 'left', clickCount: 1 })
        // Skippable for 100b alone: settle() is long enough for the review
        // invoke to resolve, which CLOSES the very window that check is about.
        if (opts.settle !== false) await settle()
        return true
      }

      const first = await spawnAt(repo)
      // The write must not overtake the spawn: a panel's PTY does not exist
      // until it goes live and the registry's lazy spawn actually creates it
      // (see "Lazy spawn" in CLAUDE.md), so a write issued right after
      // PRESET_SPAWN can land before there is a session, do nothing, and
      // leave the repository clean — a failure that looks like a broken
      // engine rather than a racing fixture. sessionMap is the same wait
      // check 83 uses for the identical reason.
      if (first) await waitUntil(async () => (await sessionMap(wc)).has(first), 8000)
      // Through the REAL PTY, not from node. A file main wrote itself would
      // prove the engine works and say nothing about whether the PANEL'S cwd
      // is what got reviewed, which is the one thing this check exists for.
      if (first) ptyManager.write(first, "printf 'x' > agent.txt\n")
      await settle()
      const selected = first ? await selectPanel(first) : false

      const summary = await waitUntil(async () => {
        const text = await wc.executeJavaScript(
          `(document.querySelector('[data-review-summary]') || {}).textContent || null`)
        return text && text.includes('file') ? text : false
      }, 5000)
      const files = await wc.executeJavaScript(
        `[...document.querySelectorAll('[data-review-file]')].map((e) => e.getAttribute('data-review-file'))`)
      ok('99 the inspector names the file the panel\'s own agent wrote',
        selected && typeof summary === 'string' && summary.includes('1 file') &&
          files.includes('agent.txt'),
        `summary=${summary} files=${JSON.stringify(files)}`)

      // 100. A panel whose cwd is NOT a repository renders no section at all
      //      — asserted as the element being ABSENT, not as empty text,
      //      because an empty-but-present section is a visible blank gap in
      //      a 260px pane. Weak on its own: it passes vacuously before the
      //      section exists, so it is evidence only once 99 has been watched
      //      red.
      const homePanel = await spawnAt(notRepo)
      // 100b. I1: the OUTGOING panel's file list must not render under the
      //       INCOMING panel's heading. Until this fix the effect cleared
      //       `review` only when the selection went to NULL, so selecting B
      //       kept A's model — a real file list, with real counts, under B's
      //       name — for an IPC round trip plus up to four git subprocesses,
      //       which is plainly visible on a real repository. The `live` flag
      //       prevents the stale WRITE; nothing prevented the stale RENDER.
      //
      //       Detected POSITIVELY, as a single consistent DOM read pairing
      //       "which panel is selected" with "is a review summary on screen":
      //       the two commit together, so seeing the incoming panel selected
      //       WITH a summary still present is the defect itself, not a race.
      //       Asserting only "the summary is absent" cannot work — it is
      //       satisfied before React has even processed the click — and the
      //       click deliberately skips settle(), which is long enough for the
      //       invoke to resolve and therefore closes the window entirely
      //       (confirmed: the first draft of this check passed against the
      //       unfixed renderer for exactly that reason).
      // Settled FIRST, on its own, so its final answer (no section at all) is
      // already on screen: a spawn selects the new panel, and a capture is
      // fire-and-forget, so a panel read too early reports its own transient
      // `never-started` — which the detection loop below would pick up as a
      // stale summary that has nothing to do with panel A.
      if (homePanel) await selectPanel(homePanel)
      await waitUntil(async () =>
        await wc.executeJavaScript(`document.querySelector('[data-review-summary]') !== null`)
          ? false : true, 5000)
      // Back to panel A, whose summary is a real file list, and then to B
      // again WITHOUT settling — the window this check is about.
      await selectPanel(first)
      await waitUntil(async () => {
        const t = await wc.executeJavaScript(
          `(document.querySelector('[data-review-summary]') || {}).textContent || null`)
        return t && t.includes('file') ? true : false
      }, 5000)
      /* Selected through the RAIL row, not by clicking the panel: cascaded
         spawns overlap, and selecting panel A raises it, so a coordinate
         click aimed at B's header lands on A instead — which is how the
         first draft of this check went green while the selection never
         moved at all (last={id:A, summary:A's}). The rail row is a real
         production gesture (goToPanel -> selectAndRaise), immune to z-order,
         and it does not settle. */
      const selectFromRail = (id) => wc.executeJavaScript(`(() => {
        const row = document.querySelector('.rail-list--panels .rail-row[data-rail-row=' +
          ${JSON.stringify(JSON.stringify(id))} + '] .rail-row__main')
        if (!row) return false
        row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        return true })()`)
      const clickedB = homePanel ? await selectFromRail(homePanel) : false
      let lastSeen = null
      const staleSeen = await (async () => {
        const deadline = Date.now() + 4000
        while (Date.now() < deadline) {
          const r = await wc.executeJavaScript(`(() => {
            const sel = document.querySelector('.panel--selected');
            const s = document.querySelector('[data-review-summary]');
            return { id: sel ? sel.getAttribute('data-panel-id') : null,
                     summary: s ? s.textContent : null } })()`)
          // Only once the click has actually landed is the read meaningful:
          // until then `.panel--selected` is still the OUTGOING panel and a
          // present summary is correct rather than stale.
          lastSeen = r
          if (r.id === homePanel) return r.summary
        }
        return null
      })()
      ok('100b selecting a panel does not render the previous panel\'s files',
        homePanel !== null && clickedB === true && staleSeen === null,
        `staleSeen=${JSON.stringify(staleSeen)} clickedB=${clickedB} last=${JSON.stringify(lastSeen)}`)
      // waitUntil, not one immediate read: Canvas's review query is async
      // (an IPC round trip plus a real git process), and the previous
      // selection's model is still the frozen prop until that resolves — a
      // bare read right after the click can catch the OUTGOING panel's
      // section still on screen and fail for a reason that has nothing to
      // do with whether this panel's own answer is correctly hidden.
      //
      // Named `absent`, true once the element is gone: an earlier draft
      // named this `present` while polling for its OPPOSITE (absence), which
      // is a naming defect worth heeding even though the check passed either
      // way — a later reader "simplifying" this to a bare, unwaited read
      // would silently invert what the identifier already claimed to hold,
      // and an inverted end-to-end check is one that passes against the very
      // regression it exists to catch.
      const absent = await waitUntil(async () =>
        await wc.executeJavaScript(`document.querySelector('[data-review-summary]') !== null`)
          ? false // still present: keep polling
          : true, // absent: the state this check wants
        5000)
      ok('100 no section for a panel outside a repository', homePanel !== null && absent === true)

      // 101. Two panels in ONE repository report shared rather than a
      //      confident wrong attribution — the only place the mixed-checkout
      //      rule is proven against a real store, a real engine and real git
      //      rather than a fake.
      const second = await spawnAt(repo)
      // Two races stacked here, not one. sessionMap alone (first's fix,
      // above) only proves the PTY exists — captureBaseline is ITSELF
      // fire-and-forget on top of that (a spawn must never be delayed by a
      // git process), so a query issued right after the session appears can
      // still land before the baseline write and read back never-started,
      // which looks like a broken shared-repo detector and is actually a
      // fixture racing its own spawn. Poll review:panel directly rather than
      // sessionMap a second time: the baseline is the fact this block
      // actually needs settled, and sessionMap cannot see it.
      if (second) {
        await waitUntil(async () => (await sessionMap(wc)).has(second), 8000)
        await waitUntil(async () => {
          const kind = await wc.executeJavaScript(
            `window.canvas.review.panel(${JSON.stringify(second)}).then((r) => r.kind)`)
          return kind !== 'never-started' ? kind : false
        }, 8000)
        await selectPanel(second)
      }
      const note = await waitUntil(async () => {
        const text = await wc.executeJavaScript(
          `(document.querySelector('[data-review-note]') || {}).textContent || null`)
        return text ? text : false
      }, 5000)
      ok('101 two panels in one repo are reported as unattributable',
        typeof note === 'string' && note.includes("can't be attributed"), `note=${note}`)


      /* A review node is seeded through DISK + RELOAD rather than through a
         gesture, and deliberately: the creation gesture is Task 9's subject,
         and a node that can only exist because a button worked would make
         these three checks fail for that button's reasons. The route is the
         one checks 39 and 84 already use for a dormant panel — append to the
         saved canvas, reload, read what came back. It needs a REAL baseline
         sha, so it asks main for the subject panel's own. */
      const seedReviewNode = async (subjectId, nodeId) => {
        const baseline = await wc.executeJavaScript(
          `window.canvas.review.baseline(${JSON.stringify(subjectId)})`)
        if (!baseline) return null
        const saved = layoutStore.initial()
        const panels = saved.panels.concat([{
          id: nodeId, x: 60000, y: 0, w: 640, h: 520, z: 99, kind: 'review',
          subject: { subjectId, repoRoot: baseline.root, baselineSha: baseline.sha, label: 'claude' }
        }])
        // The camera is set for legibility if anyone ever watches this run,
        // and for nothing else: a review node is never CULLED, because
        // culling is tiering and Canvas.tsx keeps nodes out of the array
        // assignTiers is given, so React renders it wherever it sits. Check
        // 104's own output says so — it reads the node at screen x 60360,
        // some 60,000px off screen, and still finds it in the DOM.
        layoutStore.save({ panels, camera: { x: -60000 + 200, y: 100, scale: 1 },
          selectedId: null, focusedId: null })
        layoutStore.flushSync()
        const reloaded = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload()
        await reloaded
        // waitUntil on the DOM rather than a guessed sleep: boot awaits two
        // IPC round trips (layout:load, then pty:list) before the first
        // render, and the node's own review:at query resolves after that.
        const appeared = await waitUntil(async () => wc.executeJavaScript(
          `document.querySelector('.review-node[data-panel-id="${nodeId}"]') !== null`), 10000)
        return appeared === true ? nodeId : null
      }
      const xtermCount = () => wc.executeJavaScript(
        `document.querySelectorAll('.xterm').length`)
      const beforeXterms = await xtermCount()
      const node = first ? await seedReviewNode(first, 'r90') : null

      // 102. The node renders REAL content — the file its subject's agent
      //      actually wrote, read through review:at with no panel id
      //      involved — and there is no terminal machinery underneath it.
      //      Both halves in one read: a node that rendered a file list AND
      //      an empty xterm host would satisfy either half alone, and the
      //      empty host is precisely what a copy-pasted TerminalPanel gives.
      {
        // The summary starts at "reading…" and becomes "1 file changed" one
        // IPC round trip later, so the file rows are what this waits on —
        // reading immediately would fail against a correct implementation.
        await waitUntil(async () => wc.executeJavaScript(
          `document.querySelectorAll('.review-node[data-panel-id="r90"] [data-review-node-file]').length > 0`),
        8000)
        const body = await wc.executeJavaScript(`(() => {
          const n = document.querySelector('.review-node[data-panel-id="r90"]')
          if (!n) return null
          return {
            summary: (n.querySelector('[data-review-node-summary]') || {}).textContent || '',
            files: [...n.querySelectorAll('[data-review-node-file]')]
              .map((e) => e.getAttribute('data-review-node-file')),
            slots: n.querySelectorAll('.panel__slot').length,
            xterms: n.querySelectorAll('.xterm').length
          } })()`)
        ok('102 a review node renders its subject\'s files and no terminal',
          node !== null && body !== null && body.files.includes('agent.txt') &&
            body.summary.includes('file') && body.slots === 0 && body.xterms === 0,
          JSON.stringify(body))
      }

      // 103. THE ONE TO KNOW BY NUMBER — success criterion 4's teeth. The
      //      node holds no PanelSession and consumes no WebGL context, and
      //      both are asserted against the registry and the DOM rather than
      //      argued from the code. The xterm count is compared to the count
      //      BEFORE the node existed, because "the node has no xterm" (102)
      //      is satisfied by an implementation that quietly promoted some
      //      OTHER panel to pay for it.
      {
        // __m4aSessions, not sessionMap: the claim is about the RENDERER's
        // registry — "no PanelSession was minted for this id" — and main's
        // pty:list would answer `false` for a node that had a session and
        // simply had not spawned yet.
        const sessions = await wc.executeJavaScript(
          `(window.__m4aSessions ? window.__m4aSessions() : []).map((s) => s.id)`)
        const afterXterms = await xtermCount()
        ok('103 a review node has no session and costs no WebGL context',
          node !== null && sessions.includes('r90') === false && afterXterms <= beforeXterms,
          `xterms ${beforeXterms} -> ${afterXterms} sessions=${JSON.stringify(sessions)}`)
      }

      // 104. It is a child of .world, which is what makes semantic zoom free
      //      rather than a feature: it pans and zooms with the panel it
      //      reviews. Asserted as a real camera move changing its screen
      //      position, not merely as a CSS ancestor — a node re-parented to
      //      the screen-space chrome layer would still match a selector and
      //      would sit still while the canvas moved under it.
      {
        // Its own pan helper: the panBy in the M6c/M6d blocks above is a
        // block-local of theirs and is not in scope here.
        const panReview = (dx, dy) => wc.executeJavaScript(`
          document.querySelector('.canvas').dispatchEvent(new WheelEvent('wheel', {
            bubbles: true, cancelable: true, clientX: 700, clientY: 450,
            deltaX: ${dx}, deltaY: ${dy}, deltaMode: 0
          }))
          true
        `)
        const boxOf = () => wc.executeJavaScript(`(() => {
          const n = document.querySelector('.review-node[data-panel-id="r90"]')
          return n ? n.getBoundingClientRect().left : null })()`)
        const inWorld = await wc.executeJavaScript(
          `document.querySelector('.world .review-node[data-panel-id="r90"]') !== null`)
        const before = await boxOf()
        await panReview(120, 0)
        await settle()
        const after = await boxOf()
        ok('104 the node lives in .world and moves with the camera',
          inWorld === true && before !== null && after !== null && Math.abs(after - before) > 50,
          `${before} -> ${after}`)
      }

      // 105. A wheel over a FOCUSED review node's body is left uncancelled
      //      (the browser scrolls the diff) and moves no camera, while the
      //      same wheel over the canvas background still pans — the two
      //      halves check 47 already pins for the palette, on a second
      //      surface. Cancellation, not scrollTop: a synthetic WheelEvent is
      //      untrusted and Chromium performs no default action for one, so a
      //      scrollTop assertion would fail the correct implementation. The
      //      camera clause is what makes it more than a tautology.
      {
        const focused = await wc.executeJavaScript(`(() => {
          const body = document.querySelector('.review-node[data-panel-id="r90"] .review-node__body')
          if (!body) return null
          body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
          return true })()`)
        await settle()
        const before = await wc.executeJavaScript(`window.__m4aViewport()`)
        const cancelled = await wc.executeJavaScript(`(() => {
          const body = document.querySelector('.review-node[data-panel-id="r90"] .review-node__body')
          const e = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true })
          return body.dispatchEvent(e) === false })()`)
        await settle()
        const after = await wc.executeJavaScript(`window.__m4aViewport()`)
        ok('105 a wheel over a focused review node is the node\'s, not the camera\'s',
          focused === true && cancelled === false && after.x === before.x && after.y === before.y,
          `cancelled=${cancelled} ${JSON.stringify(before)} -> ${JSON.stringify(after)}`)
      }

      // Local to this block: neither exists anywhere else in this file. A
      // review node reuses the `.panel` class (ReviewNode.tsx's own comment
      // explains why), so this counts both kinds the same way spawnAt does.
      const panelIds = () => wc.executeJavaScript(
        `[...document.querySelectorAll('.panel')].map((p) => p.getAttribute('data-panel-id'))`)
      const clickShell = (selector) => wc.executeJavaScript(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)})
        if (!el) return false
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        return true })()`)

      // 106. The inspector's button makes a real node beside a real panel,
      //      through main's real baseline. Three clauses, and the id prefix
      //      is one of them: `r` is what tells a reader of layout.json (and
      //      of a tmux session list) which panels can possibly own a
      //      session.
      {
        const beforeIds = await panelIds()
        await selectPanel(first)
        await waitUntil(async () => wc.executeJavaScript(
          `document.querySelector('[data-inspector-action="review"]') !== null`), 5000)
        await clickShell('[data-inspector-action="review"]')
        const node = await waitUntil(async () => {
          const ids = await panelIds()
          const fresh = ids.filter((id) => !beforeIds.includes(id))
          return fresh.length === 1 ? fresh[0] : false
        }, 8000)
        const heading = await wc.executeJavaScript(`(() => {
          const n = document.querySelector('.review-node[data-panel-id=' +
            ${JSON.stringify(JSON.stringify(node))} + ']')
          return n ? n.querySelector('.panel__title').textContent : null })()`)
        const sessions = await sessionMap(wc)
        ok('106 the inspector opens a review node for the selected panel',
          typeof node === 'string' && node.startsWith('r') &&
            typeof heading === 'string' && heading.includes('review') &&
            sessions.has(node) === false,
          `node=${node} heading=${heading}`)
      }

      // 107. THE ID CHECK, RETARGETED after fix round 1. `n6` and `r6`
      //      cannot collide — they are different strings, and only
      //      SAME-PREFIX ids collide as tmux session names — so comparing
      //      bare numbers across prefixes (the original form of this check)
      //      flagged n34/r34 coexisting as though it were a defect, and it
      //      passed identically under either regex besides: the reload below
      //      seeds the counter from an n-max nowhere near the seeded r-node's
      //      own number, so neither regex ever had a reason to disagree.
      //
      //      The REAL hazard is review node versus review node. A persisted
      //      `r<N>` is invisible to a NARROW seeding regex, so a later
      //      review gesture can mint that exact id a SECOND time — a literal
      //      duplicate panel id, which parseLayout drops silently on the
      //      next load and which React keys collide on today. This seeds a
      //      review node whose number is exactly the NEXT one a narrow
      //      reseed would compute (today's n-max plus one), reloads so the
      //      reseed actually runs, then opens a review on that SAME subject
      //      through the real gesture — the first id-minting action after
      //      the reload — and asserts the minted id collides with nothing
      //      the canvas already holds, across every workspace.
      // Session survival across wc.reload() is a TMUX property — the
      // direct backend kills the process outright on reload, so the subject
      // would never reattach, `minted` would stay null, and a tmux-free
      // machine would see a RED that has nothing to do with the id-collision
      // defect this check exists to prove. Skipped LOUDLY, never silently,
      // the same shape and wording as check 91 — and gating BEFORE the
      // spawn/seed/reload, not merely around the assertion, so a skip leaves
      // no half-built fixture (an extra subject panel, a seeded collide-id
      // node on disk) for anything appended after this block to trip over.
      const TMUX_107 = findTmux()
      if (!TMUX_107 || !tmuxBackend) {
        ok('107 a review node cannot mint an id a persisted node already owns (SKIPPED — no tmux binary found)',
          true, 'install tmux to cover this')
      } else {
        backend = tmuxBackend
        const subjectPanel = first ? await spawnAt(repo) : null
        if (subjectPanel) {
          await waitUntil(async () => (await sessionMap(wc)).has(subjectPanel), 8000)
        }
        const idsForSeed = subjectPanel
          ? await wc.executeJavaScript(
              `window.canvas.workspace.list().then((ws) => ws.flatMap((w) => w.panelIds))`)
          : []
        const maxN = idsForSeed.reduce((max, id) => {
          const m = /^n(\d+)$/.exec(id)
          return m ? Math.max(max, Number(m[1])) : max
        }, 0)
        // Exactly the id a NARROW regex's reseed would hand out next: it
        // never sees this r-node at all, so it recomputes the same
        // n-max-plus-one it would have without this node existing.
        const collideId = `r${maxN + 1}`
        const seedBaseline = subjectPanel
          ? await wc.executeJavaScript(
              `window.canvas.review.baseline(${JSON.stringify(subjectPanel)})`)
          : null
        let minted = null
        let idsAfterReload = null
        if (seedBaseline) {
          const saved = layoutStore.initial()
          const seededPanels = saved.panels.concat([{
            id: collideId, x: 60000, y: 0, w: 640, h: 520, z: 99, kind: 'review',
            subject: {
              subjectId: subjectPanel, repoRoot: seedBaseline.root,
              baselineSha: seedBaseline.sha, label: 'claude'
            }
          }])
          // Camera near the ORIGIN, deliberately unlike seedReviewNode's own
          // far-off one above: this check has to click the SUBJECT panel
          // after the reload through a real sendInputEvent, which needs real
          // screen coordinates — not a panel 60,000 world units from
          // wherever the camera happens to sit.
          layoutStore.save({ panels: seededPanels, camera: { x: 0, y: 0, scale: 1 },
            selectedId: null, focusedId: null })
          layoutStore.flushSync()
          const reloaded = new Promise((resolve) => wc.once('did-finish-load', resolve))
          wc.reload()
          await reloaded
          await waitUntil(async () => wc.executeJavaScript(
            `document.querySelector('.review-node[data-panel-id="${collideId}"]') !== null`),
          10000)
          idsAfterReload = await wc.executeJavaScript(
            `window.canvas.workspace.list().then((ws) => ws.flatMap((w) => w.panelIds))`)
          // The subject's own session reattaching (tmux) is what keeps its
          // baseline alive in main, exactly the mechanism check 91 already
          // proves for the inspector's reattached badge.
          const reattached = await waitUntil(
            async () => (await sessionMap(wc)).has(subjectPanel), 8000)
          if (reattached) {
            await selectPanel(subjectPanel)
            await waitUntil(async () => wc.executeJavaScript(
              `document.querySelector('[data-inspector-action="review"]') !== null`), 5000)
            await clickShell('[data-inspector-action="review"]')
            await settle()
            minted = await waitUntil(async () => {
              const ids = await wc.executeJavaScript(
                `window.canvas.workspace.list().then((ws) => ws.flatMap((w) => w.panelIds))`)
              const fresh = ids.filter((id) => !idsAfterReload.includes(id))
              return fresh.length === 1 ? fresh[0] : false
            }, 8000)
          }
        }
        const finalIds = await wc.executeJavaScript(
          `window.canvas.workspace.list().then((ws) => ws.flatMap((w) => w.panelIds))`)
        ok('107 a review node cannot mint an id a persisted node already owns',
          subjectPanel !== null && seedBaseline !== null && typeof minted === 'string' &&
            minted !== collideId && new Set(finalIds).size === finalIds.length,
          `collideId=${collideId} minted=${minted} ids=${JSON.stringify(finalIds)}`)
      }

      // 108. The node is in the rail, and its row NAVIGATES — the rule
      //      M8b's rows already obey. The camera clause is what rejects a
      //      row wired to nothing; the session clause is what rejects a row
      //      that reached onSelectPanel, whose wake path has no meaning here
      //      and whose real cost is that it is the app's spawn gesture.
      {
        const panBy108 = (dx, dy) => wc.executeJavaScript(`
          document.querySelector('.canvas').dispatchEvent(new WheelEvent('wheel', {
            bubbles: true, cancelable: true, clientX: 700, clientY: 450,
            deltaX: ${dx}, deltaY: ${dy}, deltaMode: 0
          }))
          true
        `)
        const clickRail108 = (id) => wc.executeJavaScript(`(() => {
          const el = document.querySelector('[data-rail-row=${JSON.stringify(id)}] .rail-row__main')
          if (!el) return false
          el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
          return true
        })()`)
        await panBy108(900, 600)
        await settle()
        const before = await wc.executeJavaScript(`window.__m4aViewport()`)
        const clicked = node !== null ? await clickRail108('r90') : false
        await settle()
        const after = await wc.executeJavaScript(`window.__m4aViewport()`)
        const sessions = await sessionMap(wc)
        ok('108 the rail lists a review node and its row frames it',
          node !== null && clicked === true && (after.x !== before.x || after.y !== before.y) &&
            sessions.has('r90') === false)
      }

      // 109. Success criterion 4's last clause: a review node survives a
      //      relaunch. Driven through a REAL reload rather than a parse
      //      check — Task 2 already pins the on-disk format, and what this
      //      adds is that the restored node still ANSWERS. Its subject's
      //      session is gone on the direct backend and merely detached under
      //      tmux, and the node must not care either way: it asks review:at
      //      with the baseline it carries, so the only thing that has to
      //      have survived the reload is the node's own `subject` record.
      {
        const reloaded = new Promise((resolve) => wc.once('did-finish-load', resolve))
        wc.reload()
        await reloaded
        const back = await waitUntil(async () => wc.executeJavaScript(
          `document.querySelector('.review-node[data-panel-id="r90"]') !== null`), 10000)
        // waitUntil on the FILE ROWS, not on the node: boot awaits two IPC
        // round trips before its first render and the node's own query
        // resolves after that, so the summary reads "reading…" for a moment
        // on a perfectly healthy restore. An immediate read would fail
        // against correct code.
        const files = await waitUntil(async () => {
          const f = await wc.executeJavaScript(
            `[...document.querySelectorAll('.review-node[data-panel-id="r90"] [data-review-node-file]')]
               .map((e) => e.getAttribute('data-review-node-file'))`)
          return f.length > 0 ? f : false
        }, 10000)
        ok('109 a review node survives a reload and still reports its files',
          back === true && Array.isArray(files) && files.includes('agent.txt'),
          `back=${back} files=${JSON.stringify(files)}`)
      }

      // 110. SUCCESS CRITERION 5, and the check the node's whole design
      //      exists for. Closing the subject panel drops its baseline in
      //      main (PtyManager.kill -> dropBaseline, on every close) — so a
      //      node that had asked review:panel(subjectId) would go blank
      //      exactly here, at the moment a review of finished work is most
      //      useful. This node keeps answering because it carries the
      //      baseline itself and asks review:at.
      //
      //      It cannot be watched failing against correct code, and was
      //      proven by FAULT INJECTION instead: swapping ReviewNode's query
      //      to window.canvas.review.panel(subject.subjectId) turns this
      //      RED while check 102 — the same node, rendering the same files,
      //      with its subject still alive — stays GREEN. That contrast is
      //      the whole point of this check: 102 proves the node renders,
      //      and only 110 proves it OUTLIVES.
      {
        // The rail's close control, not the panel's own ×: a terminal panel
        // running a process ARMS on the first × click and needs a second
        // one, so a single dispatched mousedown there would leave the panel
        // open and this check would pass for the wrong reason (a subject
        // that was never closed cannot demonstrate outliving anything).
        // The rail row closes outright — check 86's own gesture.
        const closed = await wc.executeJavaScript(`(() => {
          const el = document.querySelector('.rail-row[data-rail-row=' +
            ${JSON.stringify(JSON.stringify(first))} + '] .rail-row__close')
          if (!el) return false
          el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
          return true })()`)
        const subjectGone = await waitUntil(async () => wc.executeJavaScript(
          `document.querySelector('.panel[data-panel-id=' +
             ${JSON.stringify(JSON.stringify(first))} + ']') === null`), 8000)
        const stillThere = await waitUntil(async () => {
          const f = await wc.executeJavaScript(
            `[...document.querySelectorAll('.review-node[data-panel-id="r90"] [data-review-node-file]')]
               .map((e) => e.getAttribute('data-review-node-file'))`)
          return f.includes('agent.txt') ? f : false
        }, 8000)
        // Re-QUERIED, not merely still painted. The clause above is
        // satisfied by a DOM left over from before the close, which is
        // exactly what a broken node would show for as long as nobody asked
        // it anything; the refresh control sends a fresh review:at through
        // main, and only an answer to THAT proves the node can still read
        // its repository with its subject gone.
        const requeried = await wc.executeJavaScript(`(() => {
          const n = document.querySelector('.review-node[data-panel-id="r90"] .review-node__refresh')
          if (!n) return false
          n.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
          return true })()`)
        // A SUSTAINED hold, never a waitUntil, and this is the one thing
        // about check 110 that had to be learned the hard way. The node does
        // not clear `result` while a refresh is in flight (it would flicker
        // the file list on every re-read), so there is no DOM state meaning
        // "re-querying" — which makes a waitUntil here satisfied INSTANTLY
        // by the rows that were already painted, long before the new answer
        // lands. The first draft was exactly that, and it passed against the
        // fault-injected node roughly half the time: whether the check saw
        // the defect depended on which of two promises won a race. Holding
        // the condition for two seconds instead is what makes a
        // never-started answer arriving mid-window turn this red rather than
        // slipping in behind a green assertion.
        const after = await (async () => {
          const deadline = Date.now() + 2000
          let last = null
          while (Date.now() < deadline) {
            last = await wc.executeJavaScript(
              `[...document.querySelectorAll('.review-node[data-panel-id="r90"] [data-review-node-file]')]
                 .map((e) => e.getAttribute('data-review-node-file'))`)
            if (!last.includes('agent.txt')) return false
            await sleep(100)
          }
          return last
        })()
        ok('110 a review node outlives the panel it reviews',
          closed === true && subjectGone === true && stillThere !== false &&
            requeried === true && after !== false,
          `closed=${closed} gone=${subjectGone} still=${JSON.stringify(stillThere)} after=${JSON.stringify(after)}`)
      }

      // 111. Closing the NODE kills nothing. onClosePanel branches on the
      //      kind before it disposes, and this is the only check that can
      //      see the branch: dispose(id) sends pty.kill even for an id this
      //      renderer holds no session for, so routing a node through it
      //      would send a tmux kill-session named after a panel that never
      //      had one — and drop the baseline of whatever panel later
      //      recycles that id.
      {
        const before = await sessionMap(wc)
        const killsBefore = killedPanelIds.length
        const closed = await wc.executeJavaScript(`(() => {
          const el = document.querySelector('.review-node[data-panel-id="r90"] .panel__close')
          if (!el) return false
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
          return true })()`)
        const gone = await waitUntil(async () => wc.executeJavaScript(
          `document.querySelector('.review-node[data-panel-id="r90"]') === null`), 6000)
        // THE NON-VACUITY HALF, and it is not optional. Everything this check
        // asserts about `kills` is a NEGATIVE, against a recording mechanism
        // nothing else proves is still recording: lose the shadow — the
        // harness rewired, registerIpcHandlers binding the prototype method,
        // PtyManager.kill refactored behind another entry point — and
        // `killedPanelIds` is empty forever, both this check and 111b stay
        // green, and the only coverage the three dispose guards have
        // disappears with no signal at all. That is the shape CLAUDE.md
        // already names for verify:pty-manager 18: "no wants-you" is
        // satisfied just as well by bytes that never reached main.
        //
        // So a REAL terminal panel is closed inside the SAME window, through
        // the rail (which closes outright, no arming step), and the slice
        // must contain it. In-window rather than leaning on check 110's
        // close one screenful up: a cumulative read would prove the probe was
        // alive earlier in the run, and "earlier" is exactly the assumption a
        // liveness clause must not make. homePanel is check 100's
        // outside-a-repository panel and nothing after this point uses it.
        const closedReal = await wc.executeJavaScript(`(() => {
          const el = document.querySelector('.rail-row[data-rail-row=' +
            ${JSON.stringify(JSON.stringify(homePanel))} + '] .rail-row__close')
          if (!el) return false
          el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
          return true })()`)
        await waitUntil(async () => wc.executeJavaScript(
          `document.querySelector('.panel[data-panel-id=' +
             ${JSON.stringify(JSON.stringify(homePanel))} + ']') === null`), 6000)
        await settle()
        const after = await sessionMap(wc)
        // Compared against `before` MINUS the panel this check deliberately
        // closed: the liveness close is a real one and really does end a
        // session, so the pid comparison has to be told about it or it would
        // report the check's own fixture as a regression.
        const expected = new Map([...before].filter(([id]) => id !== homePanel))
        const preserved = pidsPreserved(expected, after)
        // THE CLAUSE THAT DISCRIMINATES. The pid and DOM clauses are worth
        // having and cannot fail on their own: a stray kill for an id that
        // names no session changes no pid and removes no row, so an unguarded
        // close is invisible from the renderer. `kills` is read at main's own
        // door, where it is the only place the mistake exists at all.
        const kills = killedPanelIds.slice(killsBefore)
        ok('111 closing a review node ends no session',
          closed === true && gone === true && preserved.ok &&
            closedReal === true && kills.includes(homePanel) === true &&
            kills.includes('r90') === false,
          `sessions ${before.size} -> ${after.size} changed=${JSON.stringify(preserved.changed)} kills=${JSON.stringify(kills)}`)
      }

      // 111b. The UNDO path, which Task 9's creation gesture made reachable:
      //       applyHistory's dispose loop removes whatever the undone state
      //       no longer contains, and until this milestone's guard it made
      //       no exception for a kind that owns no session. Cmd+N then
      //       Cmd+Z is one gesture away from being how most nodes are
      //       closed, so the loop needs the same branch onClosePanel has.
      //
      //       Its `kills` clause is the one that discriminates, for the
      //       reason check 111 states above: with the guard removed, every
      //       renderer-visible fact here is unchanged — the node still
      //       leaves the DOM (applyHistory removes it either way) and every
      //       pid is still preserved (a kill aimed at an id naming no
      //       session is swallowed at every layer). Confirmed by injection:
      //       both guards deleted, both checks green, until the kill probe
      //       existed. The DOM and pid clauses stay because each rejects a
      //       different wrong undo — one that disposes the SUBJECT, one that
      //       leaves the node on screen.
      //
      //       It carries its OWN non-vacuity clause rather than borrowing
      //       111's, for the reason 111's own comment gives: a positive
      //       recorded in an earlier window proves the probe was alive
      //       EARLIER, which is precisely the assumption a liveness clause
      //       must not make. Its subject panel is spawned by this check and
      //       used by nothing after it, so closing it here — after the undo
      //       has been read — is a real kill inside this check's own window
      //       and costs no other fixture.
      {
        const subject = await spawnAt(repo)
        // The baseline, not merely the session: captureBaseline is
        // fire-and-forget on top of the spawn (a spawn must never wait on a
        // git process), so the inspector's review button is present-but-
        // useless for a moment after the panel appears, and openReview
        // returns early on a null baseline — a node that never gets minted,
        // read here as a check that fails for a racing fixture rather than
        // for a defect. Check 101 above states the same two-stacked-races
        // problem in full.
        if (subject) {
          await waitUntil(async () => (await sessionMap(wc)).has(subject), 8000)
          await waitUntil(async () => wc.executeJavaScript(
            `window.canvas.review.baseline(${JSON.stringify(subject)}).then((b) => b !== null)`), 8000)
          await selectPanel(subject)
        }
        const beforeIds = await panelIds()
        await waitUntil(async () => wc.executeJavaScript(
          `document.querySelector('[data-inspector-action="review"]') !== null`), 5000)
        await clickShell('[data-inspector-action="review"]')
        const node = await waitUntil(async () => {
          const ids = await panelIds()
          const fresh = ids.filter((id) => !beforeIds.includes(id))
          return fresh.length === 1 ? fresh[0] : false
        }, 8000)
        // Captured with the node ON SCREEN, so `after` is compared against
        // the state the undo actually acted on rather than against a
        // snapshot from before the subject panel even spawned.
        const before = await sessionMap(wc)
        const killsBefore = killedPanelIds.length
        // __m4bUndo(), not a 'z' keydown: Cmd+Z is a main-process menu
        // accelerator and this harness has no menu — check 67's comment
        // states it in full.
        await wc.executeJavaScript(`window.__m4bUndo()`)
        const gone = typeof node === 'string'
          ? await waitUntil(async () => wc.executeJavaScript(
              `document.querySelector('[data-panel-id=' +
                 ${JSON.stringify(JSON.stringify(node))} + ']') === null`), 6000)
          : false
        await settle()
        const afterUndo = await sessionMap(wc)
        const preserved = pidsPreserved(before, afterUndo)
        // The liveness close, AFTER the undo has been read back — so the
        // negative above is about the undo alone and this is about the
        // probe.
        const closedReal = typeof subject === 'string'
          ? await wc.executeJavaScript(`(() => {
              const el = document.querySelector('.rail-row[data-rail-row=' +
                ${JSON.stringify(JSON.stringify(subject))} + '] .rail-row__close')
              if (!el) return false
              el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
              return true })()`)
          : false
        await waitUntil(async () => wc.executeJavaScript(
          `document.querySelector('.panel[data-panel-id=' +
             ${JSON.stringify(JSON.stringify(subject))} + ']') === null`), 6000)
        await settle()
        const after = await sessionMap(wc)
        const kills = killedPanelIds.slice(killsBefore)
        ok('111b undoing a review node ends no session',
          typeof node === 'string' && gone === true && preserved.ok &&
            closedReal === true && kills.includes(subject) === true &&
            kills.includes(node) === false,
          `node=${node} sessions ${before.size} -> ${after.size} changed=${JSON.stringify(preserved.changed)} kills=${JSON.stringify(kills)}`)
      }

      // 112. A selected review NODE renders no Changes section at all, and
      //      therefore no review button. The effect that feeds the section
      //      fired review:panel(selectedId) for WHATEVER was selected, and
      //      main holds no baseline for a node's own id — so the engine
      //      answered `never-started`, buildReviewFields returned
      //      `hidden: false`, and the pane rendered the note "this panel has
      //      no session yet" under a heading for a panel that will never have
      //      a session, above an "Open review" button whose handler refuses a
      //      review node as a subject and returns immediately. A control that
      //      can never do anything is worse than an absent one: it is a
      //      promise the app cannot keep, and the note beside it is a
      //      confidently wrong sentence about what the selected thing IS.
      //
      //      THE NON-VACUITY CLAUSE IS THE WHOLE REASON THIS CAN FAIL
      //      HONESTLY. Both assertions are negatives, and the inspector's
      //      EMPTY state — exactly what a selection that never landed
      //      produces — satisfies both of them completely. So the read also
      //      demands the node's own `reviews` field, which only
      //      buildInspectorModel's review arm emits, in the SAME read.
      //
      //      It is selected through the RAIL ROW rather than by clicking the
      //      node, because goToPanel centres before it selects: this block
      //      has panned the camera several times by now, and where
      //      cascadeCentre put the node relative to it is not something this
      //      check should have to know. Check 108 already pins that the row
      //      frames and selects.
      {
        const subject = await spawnAt(repo)
        if (subject) {
          await waitUntil(async () => (await sessionMap(wc)).has(subject), 8000)
          // The baseline, not merely the session — check 111b's comment
          // states the two-stacked-races problem in full: openReview returns
          // early on a null baseline, so a racing fixture would mint no node
          // and this check would fail for the fixture rather than the defect.
          await waitUntil(async () => wc.executeJavaScript(
            `window.canvas.review.baseline(${JSON.stringify(subject)}).then((b) => b !== null)`), 8000)
          await selectPanel(subject)
        }
        const beforeIds = await panelIds()
        const armed = await waitUntil(async () => wc.executeJavaScript(
          `document.querySelector('[data-inspector-action="review"]') !== null`), 5000)
        if (armed) await clickShell('[data-inspector-action="review"]')
        const nodeId = armed
          ? await waitUntil(async () => {
              const ids = await panelIds()
              const fresh = ids.filter((id) => !beforeIds.includes(id))
              return fresh.length === 1 ? fresh[0] : false
            }, 8000)
          : false
        // Guarded rather than built bare: an absent row would make this a
        // TypeError, which ends the whole script and takes every later
        // check's result with it.
        const selected = typeof nodeId === 'string'
          ? await wc.executeJavaScript(`(() => {
              const el = document.querySelector('.rail-row[data-rail-row=' +
                ${JSON.stringify(JSON.stringify(nodeId))} + '] .rail-row__main')
              if (!el) return false
              el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
              return true })()`)
          : false
        await settle()
        const pane = await wc.executeJavaScript(`(() => ({
          reviews: document.querySelector('[data-inspector-field="reviews"]') !== null,
          reviewButton: document.querySelector('[data-inspector-action="review"]') !== null,
          note: document.querySelector('[data-review-note]') !== null
        }))()`)
        ok('112 a selected review node gets no Changes section and no dead review button',
          typeof nodeId === 'string' && selected === true && pane !== null &&
            pane.reviews === true && pane.reviewButton === false && pane.note === false,
          `node=${nodeId} selected=${selected} pane=${JSON.stringify(pane)}`)
      }

      // 113-115. THE WRITE VERB, END TO END: a real repository, a real agent
      //          writing through a real PTY, a real node, and a real commit
      //          read back out of `git log`. Everything in verify:review is
      //          argued against a fake runner or against a repository no
      //          renderer ever saw; nothing above this line can tell whether
      //          the control, the input and the baseline advance are wired to
      //          each other at all.
      //
      //          Its own repository, deliberately. By check 112 the `repo`
      //          fixture's subject panel has been closed (110) and its node
      //          closed and undone (111/111b), so reusing it would make these
      //          checks depend on the exact end state of five earlier ones.
      const crepo = mkdtempSync(join(tmpdir(), 'tc panels commit '))
      const cgit = (...args) => execFileSync('git', ['-C', crepo, ...args], { encoding: 'utf8' })
      cgit('init', '-q', '.')
      cgit('config', 'user.email', 'v@example.com')
      cgit('config', 'user.name', 'v')
      writeFileSync(join(crepo, 'seed.txt'), 'seed\n')
      cgit('add', '-A')
      cgit('commit', '-qm', 'init')
      const headCount = () => cgit('rev-list', '--count', 'HEAD').trim()

      const subject = await spawnAt(crepo)
      // The same two stacked races checks 99 and 101 guard, for the same two
      // reasons: a panel's PTY does not exist until lazy spawn creates it, and
      // captureBaseline is fire-and-forget ON TOP of that — so sessionMap
      // alone cannot see a baseline that has not landed yet.
      if (subject) await waitUntil(async () => (await sessionMap(wc)).has(subject), 8000)
      if (subject) ptyManager.write(subject, "printf 'agent\\n' > work.txt\n")
      if (subject) {
        await waitUntil(async () => {
          const kind = await wc.executeJavaScript(
            `window.canvas.review.panel(${JSON.stringify(subject)}).then((r) => r.kind)`)
          return kind === 'changes' ? kind : false
        }, 10000)
      }
      // 'rcommit' rather than the brief's literal 'r91': by this point in the
      // run, check 106's own real "Open review" gesture has already minted a
      // node id of exactly 'r91' through nextIdRef against the checks 99-112
      // fixture repository, and that node is never closed. seedReviewNode
      // APPENDS to the saved panel array rather than replacing, so a second
      // entry sharing that id is a genuine duplicate-id collision — the one
      // parseLayout's own comment calls "the one failure with no visible
      // symptom" — and React silently renders the FIRST 'r91' (subject: the
      // OTHER repository) under the second one's DOM position, which is why
      // this looked like a false 'shared' verdict rather than a missing
      // element. 'rcommit' does not match nextIdRef's own `^[nr](\d+)$`
      // reseed regex, so no future mint in this run can ever collide with it.
      const cnode = subject ? await seedReviewNode(subject, 'rcommit') : null
      // seedReviewNode parks every node 60,000 world units off screen — check
      // 104's own comment records that the camera it writes into layout.json
      // never actually takes effect on the reload that follows, because the
      // restore.camera preference defaults off, so the node comes back at
      // DEFAULT_CAMERA rather than at the position seedReviewNode requested.
      // Every earlier check that touches a seeded node's OWN controls reaches
      // them by framing it first, through the same rail-row click check 108
      // drives (goToPanel -> centreOn) — never by trusting the node to
      // already be on screen. This suite's own typeCommit does a REAL
      // sendInputEvent click at the button's real screen coordinates, so
      // without this the button sits 60,000px off the window and the click
      // lands on nothing.
      const clickRailRow = (id) => wc.executeJavaScript(`(() => {
        const el = document.querySelector('[data-rail-row=${JSON.stringify(id)}] .rail-row__main')
        if (!el) return false
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        return true
      })()`)
      if (cnode) { await clickRailRow('rcommit'); await settle() }

      /* Drives the node's OWN control and OWN input, never window.canvas.
         review.commit from executeJavaScript: the disabled gate, the Enter
         handler and the baseline advance are the three things this milestone
         added, and an invoke driven by hand exercises none of them.

         The click is a real sendInputEvent for check 75c's reason. The typing
         is the native value setter plus an `input` event, which is what React
         listens for — assigning .value alone updates the DOM and leaves
         React's state untouched, so the commit would go out with an empty
         message and the check would fail for a reason that has nothing to do
         with the code under test. */
      const typeCommit = async (nodeId, message, finishKey) => {
        const box = await wc.executeJavaScript(`(() => {
          const b = document.querySelector('.review-node[data-panel-id="${nodeId}"] [data-review-node-commit]')
          if (!b || b.disabled) return null
          const r = b.getBoundingClientRect()
          return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } })()`)
        if (!box) return false
        wc.sendInputEvent({ type: 'mouseDown', x: box.x, y: box.y, button: 'left', clickCount: 1 })
        wc.sendInputEvent({ type: 'mouseUp', x: box.x, y: box.y, button: 'left', clickCount: 1 })
        const opened = await waitUntil(async () => wc.executeJavaScript(
          `document.querySelector('.review-node[data-panel-id="${nodeId}"] [data-review-node-commit-input]') !== null`),
        3000)
        if (opened !== true) return false
        return wc.executeJavaScript(`(() => {
          const el = document.querySelector('.review-node[data-panel-id="${nodeId}"] [data-review-node-commit-input]')
          if (!el) return false
          const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
          set.call(el, ${JSON.stringify(message)})
          el.dispatchEvent(new Event('input', { bubbles: true }))
          el.dispatchEvent(new KeyboardEvent('keydown',
            { key: ${JSON.stringify(finishKey)}, bubbles: true }))
          return true })()`)
      }

      // 113. THE HEADLINE. Three clauses in one read, and each alone passes
      //      against a different real bug: HEAD advancing is satisfied by a
      //      commit containing the wrong paths; the committed path being
      //      right is satisfied by a node that never advanced its baseline
      //      and will re-commit the same content on the next press; and the
      //      node reading `clean` is satisfied by a node that lost its result
      //      entirely and renders nothing.
      {
        const before = headCount()
        const typed = cnode ? await typeCommit('rcommit', 'agent work', 'Enter') : false
        // Waits on the node's own summary rather than sleeping: a pre-commit
        // hook is legitimately slow, and a fixed sleep here is a flake on a
        // loaded machine rather than a bound on anything.
        const clean = typed === true
          ? await waitUntil(async () => {
              const text = await wc.executeJavaScript(
                `((document.querySelector('.review-node[data-panel-id="rcommit"] [data-review-node-summary]') || {}).textContent) || ''`)
              return /no changes|clean/i.test(text) ? text : false
            }, 15000)
          : false
        const after = headCount()
        const committed = Number(after) > Number(before)
          ? cgit('show', '--stat', '--name-only', '--format=', 'HEAD')
          : ''
        // A FOURTH clause, and the only one about what the commit does NOT
        // contain: `seed.txt` is sitting in this repository untouched, and a
        // commit built from an unseeded scratch index would carry it as a
        // deletion — the outcome buildReadTreeArgs' own comment calls the
        // worst this milestone can produce. The three clauses above are all
        // satisfied by exactly that commit.
        ok('113 a review node\'s files become a real commit, and the node then reads clean',
          typed === true && Number(after) === Number(before) + 1 &&
            committed.includes('work.txt') && !committed.includes('seed.txt') &&
            typeof clean === 'string',
          `before=${before} after=${after} committed=${JSON.stringify(committed)} clean=${clean}`)
      }

      // 114. Escape cancels, and NOTHING is committed — read back out of
      //      `git log` rather than off the overlay, the rule check 50 already
      //      states for the palette's confirm: a cancel that cancels
      //      unconditionally is invisible, and so is one that does not. It
      //      needs new work to have something to cancel, since 113 left the
      //      node clean.
      {
        if (subject) ptyManager.write(subject, "printf 'more\\n' > second.txt\n")
        await settle()
        const armed = await waitUntil(async () => wc.executeJavaScript(
          `(() => { const b = document.querySelector('.review-node[data-panel-id="rcommit"] [data-review-node-commit]')
                    return b !== null && !b.disabled })()`), 15000)
        const before = headCount()
        const typed = armed === true ? await typeCommit('rcommit', 'should not land', 'Escape') : false
        await settle()
        const gone = await wc.executeJavaScript(
          `document.querySelector('.review-node[data-panel-id="rcommit"] [data-review-node-commit-input]') === null`)
        ok('114 Escape closes the message and commits nothing',
          typed === true && gone === true && headCount() === before,
          `armed=${armed} before=${before} after=${headCount()}`)
      }

      // 115. The BLOCKED arm, reached honestly rather than by a fixture flag:
      //      a second panel spawned into the same repository makes the node
      //      read `shared`. Present AND disabled asserted in ONE condition,
      //      because asserting only `disabled` passes against a control that
      //      is missing entirely — which is the very failure verify:palette
      //      31's rule is about — and asserting only presence passes against
      //      one that would happily commit another agent's work.
      {
        const peer = await spawnAt(crepo)
        if (peer) {
          await waitUntil(async () => (await sessionMap(wc)).has(peer), 8000)
          await waitUntil(async () => {
            const kind = await wc.executeJavaScript(
              `window.canvas.review.panel(${JSON.stringify(peer)}).then((r) => r.kind)`)
            return kind !== 'never-started' ? kind : false
          }, 10000)
        }
        // The node re-reads on its own only when its subject goes idle, which
        // may already have happened — so the refresh control is what makes
        // this deterministic rather than a race against an agent's timing.
        await wc.executeJavaScript(`(() => {
          const b = document.querySelector('.review-node[data-panel-id="rcommit"] .review-node__refresh')
          if (b) b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
          return true })()`)
        const state = await waitUntil(async () => {
          const s = await wc.executeJavaScript(`(() => {
            const n = document.querySelector('.review-node[data-panel-id="rcommit"]')
            if (!n) return null
            const b = n.querySelector('[data-review-node-commit]')
            return {
              note: (n.querySelector('[data-review-node-note]') || {}).textContent || '',
              present: b !== null,
              disabled: b !== null && b.disabled === true
            } })()`)
          return s && /share|attribut/i.test(s.note) ? s : false
        }, 15000)
        ok('115 a shared checkout leaves the commit control present and disabled',
          state !== false && state.present === true && state.disabled === true,
          JSON.stringify(state))
      }

      // 116-117. M12: THE TWO CONSUMERS, END TO END. A live cwd does not
      //          exist on the direct backend at all — pollLive's own comment
      //          says so, backend.list() answers null there — so both checks
      //          need tmux and are gated the same way check 91/107 are:
      //          findTmux() plus the tmuxBackend this run may or may not have
      //          built, a loud SKIP naming both checks rather than a silent
      //          one, and the gate BEFORE anything is spawned or seeded so a
      //          skip leaves no half-built fixture behind for whatever the
      //          next task appends.
      const TMUX_116 = findTmux()
      if (!TMUX_116 || !tmuxBackend) {
        ok('116-117 the panel\'s live cwd, and prompts read from it (SKIPPED — no tmux binary found)',
          true, 'install tmux to cover this')
      } else {
        backend = tmuxBackend
        // No top-level `clickPanel(id)` helper exists in this file — the same
        // fact check 75c's comment records about `clickPanelBody`. Narrowed
        // locally to a real click on a panel's body: onFocusPanel is what a
        // body click reaches (TerminalPanel.tsx), and it both SELECTS (which
        // the inspector's fields follow) and FOCUSES (which is what the
        // palette captures on open, rule 2 of "who owns the keyboard") in one
        // gesture — exactly what both checks below need.
        const clickPanel = (id) => clickPanelBody(`[data-panel-id="${id}"] .panel__slot`)

        // 116. THE DISPLAY HALF, in a real renderer. verify:rail 61 proves the
        //      model carries both rows; nothing between that builder and a
        //      painted pane is covered by it — the hook could be reading the
        //      wrong id, the subscription could be missing, the store could be
        //      empty. This is success criterion 1, and the SPAWN clause is half
        //      of it: a merged implementation shows the new directory and looks
        //      completely correct, which is the whole reason the pane keeps
        //      both.
        {
          const home = tmpdir()
          const id = await spawnAt(home)
          if (!id) throw new Error('116: spawnAt produced no panel')
          // The PTY must exist before the write, or `cd` lands on nothing and
          // the panel stays where it started — check 99's trap, and it looks
          // exactly like a broken feature.
          await waitUntil(async () => (await sessionMap(wc)).has(id), 8000)
          const moved = mkdtempSync(join(tmpdir(), 'tc panels cd '))
          // Quoted, not concatenated bare: every fixture directory in this
          // suite has a deliberate space in it (the tmux exitDir quoting note
          // in CLAUDE.md is the same class of bug), and an unquoted `cd` here
          // splits into extra shell words, errors, and leaves the panel
          // exactly where it started — a failure indistinguishable from a
          // broken feature that cost real time to tell apart from one.
          ptyManager.write(id, "cd '" + moved + "'\n")
          await clickPanel(id)
          // The poll is a 2s tick, so this WAITS rather than sleeping: a fixed
          // sleep here is a flake, not a bound.
          const read = await waitUntil(async () => {
            const r = await wc.executeJavaScript(`(() => {
              const f = (k) => {
                const el = document.querySelector('[data-inspector-field="' + k + '"] .inspector__value')
                return el ? el.textContent : null
              }
              return { live: f('live-cwd'), spawn: f('cwd'), running: f('live-command') }
            })()`)
            return r.live && r.live.includes('tc panels cd') ? r : false
          }, 15000)
          ok('116 the inspector shows where the panel IS, with where it started still beside it',
            read !== false && read.spawn !== null && read.spawn !== read.live &&
              read.running !== null && read.running.length > 0,
            JSON.stringify(read))
          rmSync(moved, { recursive: true, force: true })
        }

        // 117. THE CONSUMER HALF, end to end and through a real `cd`. A panel is
        //      spawned in one directory, cd's into a second that has its own
        //      .claude/commands, and the palette must list THAT project's
        //      prompts. It is the only check that proves the consumer is WIRED
        //      rather than merely present — verify:rail 61-63 stop at the model,
        //      and nothing between there and prompt:list is covered by them. The
        //      failure it catches is a row that never appears, indistinguishable
        //      from "this project has no commands", which is the same silent
        //      shape check 43 exists for.
        {
          const moved = mkdtempSync(join(tmpdir(), 'tc panels moved '))
          mkdirSync(join(moved, '.claude', 'commands'), { recursive: true })
          writeFileSync(join(moved, '.claude', 'commands', 'moved-prompt.md'), 'from the new cwd\n')
          // Both spellings, for PROMPT_DIRS' own reason above: this check's
          // whole point is a live cwd read straight from tmux, which is the
          // resolved /private/... form — the raw form is added too only so
          // the fence stays consistent with itself, not because this check
          // relies on it.
          PROMPT_DIRS.add(moved)
          PROMPT_DIRS.add(realpathSync(moved))

          const id = await spawnAt(tmpdir())
          if (!id) throw new Error('117: spawnAt produced no panel')
          await waitUntil(async () => (await sessionMap(wc)).has(id), 8000)
          // Quoted for the reason check 116's identical write is.
          ptyManager.write(id, "cd '" + moved + "'\n")
          // Focus it, so the palette CAPTURES this panel — a prompt row is aimed
          // at the captured id, and opening the palette deliberately leaves
          // focusedId alone (rule 2 of "who owns the keyboard").
          await clickPanel(id)
          // Wait for the live cwd to land BEFORE opening the palette: prompts
          // are read once per open, so an early open reads the spawn directory
          // and the check fails for a timing reason rather than a wiring one.
          await waitUntil(async () => {
            const cwd = await wc.executeJavaScript(
              `(() => { const el = document.querySelector('[data-inspector-field="live-cwd"] .inspector__value'); return el ? el.textContent : null })()`)
            return cwd !== null && cwd.includes('tc panels moved')
          }, 15000)
          await zoomTo(wc, 'k')
          const listed = await waitUntil(async () => {
            const rows = await wc.executeJavaScript(
              `[...document.querySelectorAll('.palette__row')].map((r) => r.textContent)`)
            return rows.some((t) => t.includes('moved-prompt')) ? rows : false
          }, 5000)
          ok('117 project prompts are read from where the panel IS, not where it started',
            listed !== false, JSON.stringify(listed))
          // On .palette__input, the file's own convention (lines 2528, 2583,
          // 2670, 3391, 3438, 3518) — React binds Escape's handler on the
          // overlay's root container, a DESCENDANT of document, so a
          // document-targeted dispatch never reaches it and this cleanup was
          // inert. Harmless while nothing follows but rmSync, and a real trap
          // for whoever appends a check after this one into a run with the
          // palette still open.
          await wc.executeJavaScript(`
            document.querySelector('.palette__input')
              ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
            true
          `)
          rmSync(moved, { recursive: true, force: true })
        }
      }

      // Best-effort, like the two below it and for the same reason: a throw
      // here is caught by the outer try, reports as an `infrastructure`
      // failure, and takes the other two cleanups with it on the way out.
      try { rmSync(crepo, { recursive: true, force: true }) } catch { /* best effort */ }

      // Fixture repositories are not free — a git repo per run accumulated in
      // $TMPDIR for the life of the machine. Best-effort: a failure to clean
      // up must never turn a green suite red.
      try { rmSync(repo, { recursive: true, force: true }) } catch { /* best effort */ }
      try { rmSync(notRepo, { recursive: true, force: true }) } catch { /* best effort */ }
    }

    // ---------------------------------------------------------------------
    // 118-120. M14: THE RUBBER-BAND MARQUEE, in a real renderer.
    //
    //          Every drag here is a REAL wc.sendInputEvent mouseDown/
    //          mouseMove/mouseUp sequence, never a dispatched MouseEvent. A
    //          dispatched event is untrusted and Blink runs no default action
    //          for one — the limit checks 47 and 75c each record from their
    //          own side — and check 120's whole subject is a default action:
    //          where DOM focus ends up after a press on the background.
    {
      // The fixture is built rather than inherited: a camera left wherever
      // check 117 stopped would make 118's count depend on which panels
      // happened to be in view. Cmd+1 (fit all) is deliberately NOT the way
      // to build it — check 84's rail-dormant panel is parked at world
      // 60000,60000, so a fit clamps to MIN_SCALE and STILL cannot frame the
      // spread: every panel near the origin ends up off screen and the first
      // draft of this block measured `expected 0`, which reads as a broken
      // marquee and is a broken fixture.
      //
      // So: reset the camera to INITIAL, spawn three panels (they cascade, so
      // they are near the view centre and near each other), then step the
      // zoom out twice — still above LIVE_MIN_SCALE, and wide enough that
      // several panels and some genuine background share the canvas.
      await zoomTo(wc, '0')
      for (let i = 0; i < 3; i++) {
        await zoomTo(wc, 'n')
        await sleep(200)
      }
      await zoomTo(wc, '-')
      await zoomTo(wc, '-')
      await sleep(400)

      // Reads MID-DRAG, between the last move and the mouseup. The marquee
      // element is removed on mouseup, so "is a marquee on screen" asked
      // AFTERWARDS is answered `no` by every implementation including a
      // correct one — check 119's claim would be vacuous and 118 would have
      // no positive evidence that anything was ever drawn.
      const marqueeState = () => wc.executeJavaScript(`(() => ({
        marquees: document.querySelectorAll('.canvas-marquee').length,
        selected: document.querySelectorAll('.panel--selected').length
      }))()`)

      const dragFromTo = async (from, to) => {
        wc.sendInputEvent({ type: 'mouseDown', x: from.x, y: from.y, button: 'left', clickCount: 1 })
        // Four moves rather than one jump: the gesture's listeners live on
        // `document` precisely because the cursor leaves the element it
        // started in, and a single synthetic hop would exercise neither the
        // tracking nor the listener lifetime a real drag produces.
        for (let i = 1; i <= 4; i++) {
          wc.sendInputEvent({
            type: 'mouseMove',
            x: Math.round(from.x + ((to.x - from.x) * i) / 4),
            y: Math.round(from.y + ((to.y - from.y) * i) / 4),
            // `leftButtonDown` is what makes MouseEvent.buttons read 1 in the
            // renderer, which is what a REAL drag looks like — Chromium
            // derives `buttons` from the modifier bitfield, not from the
            // `button` field, the same spelling trap the auto-repeat note
            // records for `isAutoRepeat`. The gesture ends itself on a move
            // with no button held (a press whose mouseup never arrived), so
            // without this every drag here would end on its first move.
            button: 'left',
            modifiers: ['leftButtonDown']
          })
        }
        await sleep(200)
        const during = await marqueeState()
        wc.sendInputEvent({ type: 'mouseUp', x: to.x, y: to.y, button: 'left', clickCount: 1 })
        await sleep(200)
        return during
      }

      // 118. A marquee selects SEVERAL panels in one gesture. Asserted as a
      //      COUNT, because a marquee that kept only the last panel it
      //      touched still leaves one selected and looks almost right on
      //      screen — and so does one that selected nothing but left the
      //      previous selection standing.
      //
      //      The expected count is DERIVED from the panels' own screen rects
      //      under marqueeSelection's strict-inequality rule, never written
      //      here as a literal: a literal would be true of exactly one
      //      fixture and would go stale the first time anything above this
      //      block spawns or closes a panel.
      const plan = await wc.executeJavaScript(`(() => {
        const host = document.querySelector('.canvas')
        if (!host) return null
        const b = host.getBoundingClientRect()
        // A start point the marquee is ALLOWED to begin at. The background
        // handler is not "empty space" — a carded panel's click falls through
        // to it — so the start has to be a point with no .panel under it at
        // all, which is what hitTest returning null means in the DOM.
        let from = null
        for (let dy = 6; dy < b.height - 6 && !from; dy += 8) {
          for (let dx = 6; dx < b.width - 6; dx += 8) {
            const x = Math.round(b.left + dx), y = Math.round(b.top + dy)
            const el = document.elementFromPoint(x, y)
            if (el && host.contains(el) && !el.closest('.panel') && !el.closest('.canvas-hud')) {
              from = { x, y }
              break
            }
          }
        }
        if (!from) return null
        const to = { x: Math.round(b.right - 4), y: Math.round(b.bottom - 4) }
        const l = Math.min(from.x, to.x), t = Math.min(from.y, to.y)
        const r = Math.max(from.x, to.x), bo = Math.max(from.y, to.y)
        // Screen space answers the same question world space does here: the
        // world transform is a uniform positive scale plus a translation, so
        // it preserves intersection exactly.
        const expected = [...document.querySelectorAll('.panel')].filter((el) => {
          const p = el.getBoundingClientRect()
          return p.left < r && p.right > l && p.top < bo && p.bottom > t
        }).length
        return { from, to, expected }
      })()`)
      if (!plan) throw new Error('118: found no background point on the canvas to start a marquee at')

      const during118 = await dragFromTo(plan.from, plan.to)
      const after118 = await marqueeState()
      ok('118 a marquee selects every panel it sweeps, in one gesture',
        plan.expected >= 2 && during118.marquees === 1 &&
          after118.selected === plan.expected && after118.marquees === 0,
        `expected ${plan.expected} panels, selected ${after118.selected}; ` +
          `marquees during=${during118.marquees} after=${after118.marquees}`)

      // 119. A drag starting ON A CARDED PANEL selects that panel and draws
      //      NO marquee. This is the rule most likely to catch a real
      //      regression: the background onMouseDown is not "empty space" — a
      //      carded panel has no chrome handler of its own, so its click
      //      falls through here and is resolved by hitTest. A marquee started
      //      on ANY background mousedown would rubber-band instead of
      //      selecting, every time a user clicked a card — and cards are most
      //      of the canvas once LIVE_BUDGET is spent.
      // Two more zoom steps take the scale below LIVE_MIN_SCALE (0.5), which
      // makes EVERY panel a card — the tier this check is about, and the one
      // most of a real canvas is in once LIVE_BUDGET is spent.
      await zoomTo(wc, '-')
      await zoomTo(wc, '-')
      await sleep(400)
      const card = await wc.executeJavaScript(`(() => {
        const host = document.querySelector('.canvas')
        if (!host) return null
        const b = host.getBoundingClientRect()
        for (const el of document.querySelectorAll('.panel')) {
          // A CARD specifically, not any panel: a live panel's slot would
          // hand the mousedown to xterm and prove nothing about this branch.
          if (!el.querySelector('.panel__card')) continue
          const r = el.getBoundingClientRect()
          const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2)
          if (x < b.left + 2 || x > b.right - 2 || y < b.top + 2 || y > b.bottom - 2) continue
          // The centre must really resolve to this panel — an overlapping
          // neighbour on top would make the check assert about the wrong one.
          const hit = document.elementFromPoint(x, y)
          if (!hit || hit.closest('.panel') !== el) continue
          return { id: el.dataset.panelId, x, y }
        }
        return null
      })()`)
      if (!card) throw new Error('119: no carded panel was reachable on screen')

      const during119 = await dragFromTo({ x: card.x, y: card.y }, { x: card.x + 220, y: card.y + 160 })
      const after119 = await wc.executeJavaScript(`(() => ({
        marquees: document.querySelectorAll('.canvas-marquee').length,
        selected: [...document.querySelectorAll('.panel--selected')].map((el) => el.dataset.panelId)
      }))()`)
      ok('119 a drag from a carded panel selects it and starts no marquee',
        during119.marquees === 0 && after119.selected.length === 1 &&
          after119.selected[0] === card.id,
        `marquees during=${during119.marquees}, selected ${JSON.stringify(after119.selected)} ` +
          `(card ${card.id})`)

      // 120. A marquee still RELEASES FOCUS — the job the background handler
      //      already had before the marquee joined it. assignTiers pins the
      //      focused panel live UNCONDITIONALLY, so a gesture that forgot
      //      this holds a WebGL context and a LIVE_BUDGET slot for the rest
      //      of the run, however far the user pans away, and keeps routing
      //      Cmd+C to a panel whose textarea the browser blurred long ago.
      //
      //      Two reads, because neither alone is the whole claim.
      //      activeElement is the DOM half and is a browser DEFAULT ACTION,
      //      which is why the drag above it has to be real input. __m4aGrid()
      //      is the app half: it answers non-null only for a focusedId naming
      //      a LIVE session, so it is the one observable that moves when
      //      setFocusedId(null) is deleted — DOM focus leaves the textarea on
      //      any background mousedown whether or not React was told.
      await zoomTo(wc, '0')
      await waitUntil(async () => (await liveCount(wc)) > 0, 4000)
      const focusedBefore = await clickPanelBody('.panel__slot')
      const insideBefore = await wc.executeJavaScript(
        `!!(document.activeElement && document.activeElement.closest('.panel'))`)
      const plan120 = await wc.executeJavaScript(`(() => {
        const host = document.querySelector('.canvas')
        const b = host.getBoundingClientRect()
        for (let dy = 6; dy < b.height - 6; dy += 8) {
          for (let dx = 6; dx < b.width - 6; dx += 8) {
            const x = Math.round(b.left + dx), y = Math.round(b.top + dy)
            const el = document.elementFromPoint(x, y)
            if (el && host.contains(el) && !el.closest('.panel') && !el.closest('.canvas-hud')) {
              return { from: { x, y }, to: { x: Math.min(x + 200, Math.round(b.right - 4)),
                                             y: Math.min(y + 140, Math.round(b.bottom - 4)) } }
            }
          }
        }
        return null
      })()`)
      if (!plan120) throw new Error('120: found no background point to marquee from')
      await dragFromTo(plan120.from, plan120.to)
      const released = await wc.executeJavaScript(`(() => ({
        inPanel: !!(document.activeElement && document.activeElement.closest('.panel')),
        grid: typeof window.__m4aGrid === 'function' ? window.__m4aGrid() : 'missing'
      }))()`)
      ok('120 a marquee releases focus, the job the background click already had',
        insideBefore === true && released.inPanel === false && released.grid === null,
        `focused before=${insideBefore} (${focusedBefore.active}), after inPanel=${released.inPanel} ` +
          `grid=${JSON.stringify(released.grid)}`)
    }

    // ---------------------------------------------------------------------
    // 121-122 — M14. Filing a selection into another workspace.
    //
    //     The move is a RECORD edit and nothing else: main rewrites which
    //     workspace owns the panel, and this renderer drops it from its local
    //     panels array. Every session on both sides is untouched — a moved
    //     panel becomes a hidden workspace's panel with a running tmux
    //     session, which is exactly the state a workspace SWITCH already
    //     produces ("demote, not dispose"). Nothing cheaper than a real
    //     renderer holding a real PanelSession can see the difference, which
    //     is check 64's argument reaching a third door.
    //
    //     Its own fixture — a fresh workspace, one fresh panel, a fresh
    //     target — rather than whatever the blocks above left behind: by this
    //     point the canvas has been reset, reloaded, marqueed and panned
    //     several times, and a check that moved "whichever panel happens to
    //     be here" could not name the pid it is asserting about.
    // ---------------------------------------------------------------------
    {
      // Guarded rather than called bare. A missing hook rejects
      // executeJavaScript, which THROWS, which ends the whole run here and
      // takes 122's RED down with it — the trap CLAUDE.md records for
      // test-first checks in these single-script suites.
      const hasMoveHook = await wc.executeJavaScript(
        `typeof window.__m7aWorkspace === 'function' &&
         typeof window.__m7aWorkspace().movePanels === 'function'`)

      if (!hasMoveHook) {
        ok('121 a moved panel keeps its pid', false, 'no __m7aWorkspace().movePanels hook')
        ok('122 Cmd+Z right after a move changes nothing', false,
          'no __m7aWorkspace().movePanels hook')
      } else {
        // createAndSwitch, not create: the panel about to be spawned has to
        // live in the workspace this check is moving FROM, and the id is
        // captured rather than guessed for the reason check 64 records —
        // nextWorkspaceId() mints over whatever already exists, and a wrong
        // literal fails silently because an unknown id changes nothing.
        const homeId = await wc.executeJavaScript(
          `window.__m7aWorkspace().createAndSwitch('movers')`)
        await settle()
        // The camera has been zoomed and panned repeatedly above; a spawn
        // outside the cull region is never promoted and therefore never
        // spawns a PTY at all, which would leave this check asserting pid
        // identity about a panel that has no pid.
        await zoomTo(wc, '0')
        await settle()
        await zoomTo(wc, 'n')
        const movedId = await waitUntil(async () => {
          const ids = await wc.executeJavaScript(
            `Array.from(document.querySelectorAll('.panel[data-panel-id]')).map((e) => e.dataset.panelId)`)
          return ids.length === 1 ? ids[0] : null
        }, 6000)
        if (!movedId) throw new Error('121: the fresh workspace never rendered exactly one panel')
        // MAIN's own pty:list, not the DOM: a panel is on screen well before
        // its session exists, and a move issued in that window would be
        // asserting pid identity against `undefined` on both sides — which
        // passes, vacuously, against an implementation that kills everything.
        const spawned = await waitUntil(async () => (await sessionMap(wc)).has(movedId), 15000)
        if (!spawned) throw new Error(`121: ${movedId} never reached pty:list`)

        // create, NOT createAndSwitch: the target must stay hidden, because
        // "the session survived while its panel was filed somewhere the user
        // is not looking" is the whole claim.
        const targetId = await wc.executeJavaScript(`window.canvas.workspace.create('filed')`)
        const before = await settledSessionMap(wc)

        await wc.executeJavaScript(
          `window.__m7aWorkspace().movePanels(${JSON.stringify([movedId])}, ` +
          `{ workspaceId: ${JSON.stringify(targetId)} })`)
        await settle()

        const gone = await wc.executeJavaScript(
          `document.querySelectorAll('.panel[data-panel-id=${JSON.stringify(movedId)}]').length === 0`)
        const after = await sessionMap(wc)

        // 121. THE CHECK THIS TASK EXISTS FOR: the moved panel's pid is
        //      UNCHANGED. Every other observable in this milestone stays
        //      correct against a move that quietly disposed and respawned —
        //      the panel leaves this canvas either way, main's record is
        //      right either way, the rail is right either way — and only the
        //      pid separates them.
        //
        //      Three clauses, and the first two are not redundant with the
        //      third. `gone` is the non-vacuity guard: a move that did
        //      NOTHING AT ALL preserves every pid perfectly, so without it
        //      this check is green against a stub. `listed` is the other
        //      direction: a dispose with no respawn leaves the id absent
        //      from pty:list, and `after.get(id) === before.get(id)` reads
        //      undefined === undefined as agreement if before was empty too
        //      — which the spawned wait above already rules out, but the
        //      clause states it rather than relying on a wait staying put.
        const listed = after.has(movedId)
        ok('121 a moved panel keeps the SAME pid, and is still running',
          gone === true && listed &&
            before.get(movedId) !== undefined &&
            after.get(movedId) === before.get(movedId),
          `home=${homeId} target=${targetId} ${movedId}: ` +
            `${before.get(movedId)} -> ${after.get(movedId) ?? 'MISSING'} gone=${gone}`)

        // 122. Cmd+Z immediately after a move is INERT. history is ONE stack
        //      over ONE Panel[], and applyHistory disposes any panel the
        //      undone state no longer contains — which reaches pty.kill. An
        //      undo here would either resurrect a panel main's record no
        //      longer lists in this workspace, or kill a session that now
        //      belongs to another workspace. Doing nothing is the honest
        //      failure; doing something kills another workspace's agents.
        //
        //      Driven through __m4bUndo() rather than a synthetic 'z'
        //      keydown, for the reason check 67 records at length: Cmd+Z is
        //      a main-process menu accelerator and this harness has no menu,
        //      so a keydown would assert a no-op against a path that could
        //      never have run.
        const panelsBeforeUndo = await wc.executeJavaScript(
          `document.querySelectorAll('.panel[data-panel-id]').length`)
        await wc.executeJavaScript(`window.__m4bUndo()`)
        await settle()
        const panelsAfterUndo = await wc.executeJavaScript(
          `document.querySelectorAll('.panel[data-panel-id]').length`)
        const afterUndo = await sessionMap(wc)
        const { ok: undoPreserved, changed: undoChanged } = pidsPreserved(after, afterUndo)
        ok('122 Cmd+Z right after a move changes nothing, and kills nothing',
          panelsBeforeUndo === panelsAfterUndo && undoPreserved,
          `panels ${panelsBeforeUndo} -> ${panelsAfterUndo} changed=[${undoChanged.join(', ')}]`)
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
