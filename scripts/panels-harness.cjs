/* Verifies terminals on the canvas in a real renderer.
   Run with: npm run build && npm run verify:panels

   Check 4 is the reason this file exists: culling must not kill a PTY. That
   failure is silent in a running app — the panel returns looking like a fresh
   terminal — so it has to be caught mechanically. pty:list makes it possible. */
const { buildSync } = require('esbuild')
const { join } = require('node:path')
const { loadRenderer } = require('./load-renderer.cjs')
const { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, existsSync, readFileSync, readdirSync, rmSync, realpathSync, renameSync, unlinkSync, statSync, openSync, readSync, closeSync } = require('node:fs')
const { execFileSync, spawn: spawnChild } = require('node:child_process')
const { tmpdir } = require('node:os')
const { app, BrowserWindow, ipcMain, webContents, clipboard } = require('electron')
// Per-job userData, for the reason ENTRY_OUT is suffixed: captures and assets
// land under app.getPath('userData'), and product's image-add check clears and
// COUNTS that directory, so two parts sharing it read each other's files. Only
// under a suffix — an unsuffixed run (serial, one checkout) keeps the directory
// it always used. Must precede 'ready', which is why it sits at module load.
if (require('./verify-socket.cjs').verifySocket('x') !== 'x') {
  app.setPath('userData', mkdtempSync(join(tmpdir(), 'tc-panels-userdata-')))
}

// This script is its own Electron entry point (not out/main/index.js), so
// nothing has registered ipcMain handlers for the pty:* channels the built
// renderer calls. Bundle and wire up the same pieces main/index.ts wires up
// at real startup, mirroring the pattern verify-ipc-surface.cjs and
// verify-window-lifecycle.cjs already use for this exact problem.
// Suffixed like the socket (scripts/verify-socket.cjs). Five parts share this
// harness, and two in flight at once under TC_VERIFY_ELECTRON_JOBS would race
// to write and read ONE bundle — a half-written file loads as a syntax error
// in whichever part lost. Unsuffixed, this is the path it always was.
const ENTRY_OUT = join(__dirname, '..', 'out', 'verify', require('./verify-socket.cjs').verifySocket('panels-entry') + '.cjs')
buildSync({
  entryPoints: [join(__dirname, 'panels-entry.cjs')],
  outfile: ENTRY_OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['node-pty', 'electron'],
  // The same two aliases electron.vite.config.ts and every plain-node verify
  // bundle already carry. This entry got away without them until M16 for the
  // reason verify-viewport.cjs did: every cross-boundary import main/* made
  // from @shared was an `import type`, which esbuild erases before bundling,
  // so nothing was ever actually resolved. main/file-read.ts imports real
  // VALUES from @shared/file-panel (FILE_MAX_BYTES and its siblings), and
  // this build fails outright without them — buildSync throws HERE, at
  // module scope, before any window, or even this harness's own setup code,
  // exists at all; there is nothing for the harness to "wait" on. The failure
  // still READS as a hang rather than a printed error, but that is Electron's
  // own handling of an uncaught main-process exception, not anything this
  // harness does.
  alias: {
    '@shared': join(__dirname, '..', 'src', 'shared'),
    '@renderer': join(__dirname, '..', 'src', 'renderer')
  }
})
const {
  registerIpcHandlers,
  trailFor,
  credentialStore,
  credentialDir,
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
  requestFromRendererWith,
  createPoolCaller,
  writeClipboardImage,
  pushDefaultPreset,
  allPresets,
  resolveAvailability,
  presetRows,
  templateOf,
  presetFromCapture,
  mergePrompts,
  readProjectPrompts,
  resolveCwd,
  expandTilde,
  createApprovalTracker,
  createMemoryStore,
  allTemplates,
  isBuiltInTemplate,
  resolveSpawnRequest,
  IPC_EVENTS,
  IPC,
  createReviewEngine,
  createGitRunner,
  createWorktreeManager,
  createBoardLane, repositoriesAnswer, createPlacesGate,
  createScrollbackLog,
  createRunLedger,
  createBaselineCapture,
  createReviewCommitter,
  createReviewDiscarder,
  createControlServer,
  createControlHandler,
  createExporters,
  FileWatchers,
  ToolboxCache,
  readFrom,
  FILE_MAX_LINES,
  AgentSessionManager, createAgentTranscriptLog, importClaudeTranscript, resolveAttachment,
  createWatchRunner,
  createBrowserHandlers, discoverPreview, descendantsOf, capturePreview, putAsset, runHttpNode, parsePortable, parseLayout, createPackHandlers, unreviewedPresetReason, publish, parsePublishRequest,
  readVault,
  readImage, prepareStarter, STARTER_OBJECTS,
  createLayoutSnapshots, restoreFromSnapshot,
  listGithubWorkItems,
  createBrokerAudit,
  parseShelf,
  skillWriteHandlers,
  credentialDir: harnessCredentialDir,
  windowUtilization,
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

const { ok, results } = require('./lib/checks.cjs').createChecks()
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

/**
 * M166. Zoom to a SCALE, not a chord: a pinch is a wheel with ctrlKey
 * (canvas-input.ts), stepped until the scale lands within 4% of the target —
 * the shot harness's own loop. Cmd+1 (zoom to fit) lands wherever the canvas's
 * extent puts it, which on the fixture is below SUMMARY_ENTER (0.26); a check
 * that wants the TAIL tier (below LIVE_MIN_SCALE 0.5, above 0.32) asks for 0.4.
 */
const zoomToScale = async (wc, target) => {
  for (let i = 0; i < 80; i++) {
    const scale = await wc.executeJavaScript('window.__m4aScale()')
    if (Math.abs(scale - target) / target < 0.04) break
    await wc.executeJavaScript(`(() => { const host = document.querySelector('.canvas'); const r = host.getBoundingClientRect()
      host.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: ${scale > target ? 60 : -60}, deltaMode: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); return true })()`)
    await new Promise((r) => setTimeout(r, 40))
  }
  await new Promise((r) => setTimeout(r, 400))
}

const zoomTo = (wc, key) =>
  wc.executeJavaScript(
    `window.dispatchEvent(new KeyboardEvent('keydown', { key: '${key}', metaKey: true })), true`
  )

/**
 * Cmd+G, the nav grid's reveal chord. `repeat` is supplied BY HAND by the
 * caller — like checks 7b/33b/75b this proves the guard READS the flag and
 * says nothing at all about who sets it.
 */
const pressChord = (wc, key, opts = {}) =>
  wc.executeJavaScript(
    `window.dispatchEvent(new KeyboardEvent('keydown', ${JSON.stringify({ key, metaKey: true, ...opts })})), true`
  )

/**
 * An arrow inside the nav grid: Cmd is still held through the whole gesture,
 * so the event is byte-identical to zoomTo's. It is a separate name rather
 * than a reuse because `zoomTo(wc, 'ArrowRight')` at a nav-grid call site
 * reads as a camera command, which is the one thing these presses must not be.
 */
const pressArrow = (wc, key) =>
  wc.executeJavaScript(
    `window.dispatchEvent(new KeyboardEvent('keydown', { key: '${key}', metaKey: true })), true`
  )

/**
 * Releasing Cmd. The commit test is `key === 'Meta'` and NOT `!metaKey`:
 * sendInputEvent echoes back exactly the modifiers array it is handed, so a
 * check written against the bitfield would be circular — it would prove only
 * that the harness repeats its own input. See the M11 spec.
 */
const releaseMeta = (wc) =>
  wc.executeJavaScript(
    `window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Meta' })), true`
  )

/**
 * The nav grid as the screen actually shows it. Answers `{ open: false }`
 * rather than throwing when `.navgrid` is absent, so a missing overlay is a
 * clean individual FAIL in every check that reads it — CLAUDE.md's rule that
 * a throw aborts the whole run and takes every later check's RED with it.
 */
const gridState = (wc) => wc.executeJavaScript(`(() => {
  const el = document.querySelector('.navgrid')
  if (!el) return { open: false }
  const cur = el.querySelector('.navgrid__cell--cursor')
  return { open: true, cursor: cur ? Number(cur.dataset.cellIndex) : -1,
           label: cur ? (cur.dataset.cellLabel || '') : '' }
})()`)

/** The id of whichever workspace main currently says is active. */
const activeWorkspaceId = (wc) => wc.executeJavaScript(
  `window.canvas.workspace.list().then((r) => (r.find((w) => w.active) || {}).id)`)

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
/*
 * TC_SETTLE_PROBE=<path prefix> — a MEASUREMENT mode, never a gate. settle()
 * still sleeps exactly 300ms (so no check can pass or fail differently
 * because of the probe); around that sleep it records the calling line, every
 * DOM mutation batch inside the window (split into inside-.xterm, which a
 * running shell produces forever, and everything else), and every ipcMain
 * handler that started or finished in it. The question the rows answer is
 * which of the hundreds of 300ms windows actually needed 300ms: a window
 * whose last non-xterm mutation and last IPC completion land at 20ms could
 * return then, one with activity at 280ms could not — and one BEFORE A
 * NEGATIVE assertion ("nothing spawned") may need the full window even when
 * nothing moved, which is why these rows decide nothing on their own.
 * Absent, settle is the plain sleep it always was.
 */
const SETTLE_PROBE = process.env.TC_SETTLE_PROBE || ''
const settleProbe = { wc: null, rows: [], ipc: [] }
const SETTLE_PROBE_INSTALL = `(() => {
  if (!window.__tcSettleProbe) {
    const p = { t0: performance.now(), marks: [] }
    new MutationObserver((list) => {
      let dom = 0, term = 0
      for (const m of list) {
        const el = m.target.nodeType === 1 ? m.target : m.target.parentElement
        if (el && el.closest && el.closest('.xterm')) term++; else dom++
      }
      if (p.marks.length < 4000) p.marks.push([Math.round(performance.now() - p.t0), dom, term])
    }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true })
    p.reset = () => { p.t0 = performance.now(); p.marks = [] }
    p.take = () => { const out = p.marks; p.marks = []; return out }
    window.__tcSettleProbe = p
  }
  window.__tcSettleProbe.reset()
  return true
})()`
const settle = !SETTLE_PROBE ? () => sleep(300) : async () => {
  // Line 0 is "Error", 1 is this arrow, 2 is whoever awaited settle().
  const site = (new Error().stack.split('\n')[2] || '').trim()
  const wc = settleProbe.wc
  if (!wc || wc.isDestroyed()) return sleep(300)
  const start = Date.now()
  let armed = false
  try { armed = await wc.executeJavaScript(SETTLE_PROBE_INSTALL) } catch { /* a reload in flight: record what we can */ }
  await sleep(300)
  let marks = null
  try { marks = await wc.executeJavaScript('window.__tcSettleProbe ? window.__tcSettleProbe.take() : null') } catch { /* same */ }
  const ipc = settleProbe.ipc.filter((e) => e[0] >= start).map(([t, ch, phase]) => [t - start, ch, phase])
  settleProbe.ipc = settleProbe.ipc.filter((e) => e[0] >= start - 5000)
  settleProbe.rows.push({ site, armed, marks, ipc })
}

/**
 * Clicks a panel's own `.panel__close`, by id, regardless of kind. A
 * terminal panel's close arms on a RUNNING session (TerminalPanel.tsx's
 * CONFIRM_CLOSE_MS) and needs a second click to confirm; a review node and
 * a file panel close outright on one. Dispatched as `mousedown`, matching
 * every close handler in this codebase (`onMouseDown`, never `onClick`).
 * Returns true if the panel left the DOM.
 */
const clickPanelClose = async (wc, id) => {
  const idJson = JSON.stringify(id)
  const stillThere = () => wc.executeJavaScript(
    `document.querySelector('[data-panel-id=' + ${JSON.stringify(idJson)} + ']') !== null`)
  const mousedown = () => wc.executeJavaScript(`(() => {
    const el = document.querySelector('[data-panel-id=' + ${JSON.stringify(idJson)} + '] .panel__close')
    if (!el) return false
    el.dispatchEvent(new MouseEvent('mousedown',
      { bubbles: true, cancelable: true, view: window, button: 0, buttons: 1, detail: 1 }))
    return true
  })()`)
  const first = await mousedown()
  await settle()
  if (await stillThere()) {
    // The first click armed a running terminal's close; the second confirms
    // it. A no-op mousedown on an id already gone is harmless.
    await mousedown()
    await settle()
  }
  return first
}

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

// M135. The watchdog is the PART's, passed into runPanelsSuite() — each part
// pins 1.25x its own measured green run beside its constant. The old file's
// 600 s constant, raised three times, is gone with the file; the history of
// those raises is in docs/build-log/m126-m133-act3-skills-and-workflows.md and
// the M130 load-bearing entry.

/**
 * M135. Boots the harness — the esbuild, the fixtures, the fake ipcMain, the
 * window, the seed PTY, the socket, the watchdog — and hands `body` a ctx
 * holding every value the un-split file held at its top level. Mutable harness
 * state a check assigns lives on `ctx.state` (getters/setters over the
 * closure variables), never destructured: a destructured `let` is a copy and
 * an assignment to it reaches nothing.
 */
function runPanelsSuite(name, WATCHDOG_MS, body) {
const startedAt = Date.now()
// TC_WATCHDOG_SCALE. The runner sets it when the Electron tier runs N-wide:
// contention stretches every part's wall clock, and a watchdog measured ALONE
// would read a busy machine as a hang. Absent is 1, silently (every run that
// existed before it). Present but not a number above zero is 1 with a note —
// malformed is dropped, never coerced.
const rawScale = process.env.TC_WATCHDOG_SCALE
const scaleGiven = rawScale !== undefined && String(rawScale).trim() !== ''
const parsedScale = Number(rawScale)
const SCALE = scaleGiven && Number.isFinite(parsedScale) && parsedScale > 0 ? parsedScale : 1
if (scaleGiven && SCALE !== parsedScale) console.log(`[verify:panels:${name}] ignoring TC_WATCHDOG_SCALE=${JSON.stringify(rawScale)} — not a number above zero`)
const BUDGET_MS = Math.round(WATCHDOG_MS * SCALE)
console.log(`[verify:panels:${name}] watchdog ${BUDGET_MS}ms${SCALE === 1 ? '' : ` (${WATCHDOG_MS}ms × TC_WATCHDOG_SCALE ${SCALE})`}`)
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1400,
    height: 900,
    webPreferences: {
      preload: join(__dirname, '..', 'out', 'preload', 'index.js'),
      // M56. A hidden window pauses requestAnimationFrame, and a camera
      // flight is driven by it: without this a flight never settles, the
      // tier gate stays shut, and every panel stays a card. Production
      // windows are visible; this is the harness's own condition.
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // M103. The browser pane is a <webview>; the harness window needs the
      // tag on exactly as production's does (main/index.ts).
      webviewTag: true
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
  // Task 10's session-pinning fence, the same shape as PROMPT_DIRS and the
  // git fence: a suite must never read or write state this repo does not
  // own, and on a developer's machine ~/.claude/projects holds their actual
  // work. Every session id THIS manager's own setPinnedSession hook has ever
  // minted lands here, and it is what lets the fenced resolveTranscript below
  // answer undefined for anything else — including a real session id sitting
  // in the running developer's own transcripts directory, which this
  // substitution never touches at all. Declared here, ahead of the
  // constructor call below, so its closures can capture it; used by checks
  // 130-132 near the end of this file.
  const knownUsageSessionIds = new Set()
  const usageFixtureDir = mkdtempSync(join(tmpdir(), 'tc panels usage '))
  const usageFixtureFile = join(usageFixtureDir, 'sess.jsonl')
  // M52. Declared ABOVE the manager: it is a value the manager's runs deps
  // hold, not a getter, and a const below it is a TDZ throw at construction
  // (watched: the whole suite hung before its first check).
  const runLedger = createRunLedger({ file: join(mkdtempSync(join(tmpdir(), 'tc panels ledger ')), 'runs.jsonl') })
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
      // One line per drop, with the caller: review.baseline() answering null
      // is silent in the renderer (openReview just returns), so a red 106 is
      // unexplainable without knowing what dropped the record and when.
      const caller = (new Error().stack || '').split('\n').slice(2, 5).map((l) => l.trim().replace(/^at /, '')).join(' < ')
      console.log(`[baseline] drop ${panelId} had=${layoutStore.baseline(panelId) !== undefined} via ${caller}`)
      baselineCapture.drop(panelId)
      layoutStore.dropBaseline(panelId)
    },
    // Task 10's three session-pinning hooks, wired to the SAME layoutStore
    // instance the two baseline hooks above already close over — not a
    // second store, the rule "One map, and a typed view over it" already
    // states for settings, applied here to a panel's persisted session id.
    (panelId) => layoutStore.session(panelId),
    (panelId, sessionId) => {
      layoutStore.setSession(panelId, sessionId)
      knownUsageSessionIds.add(sessionId)
    },
    (panelId) => layoutStore.dropSession(panelId),
    // Fenced: answers the one fixture transcript for a session id THIS
    // harness minted (via setPinnedSession immediately above), undefined for
    // every other session id. Never the real resolveTranscript, which globs
    // ~/.claude/projects — a directory this suite must not touch at all.
    (sessionId) => (knownUsageSessionIds.has(sessionId) ? usageFixtureFile : undefined),
    // The real delta-reader. Safe to reuse verbatim: it takes a path, not a
    // directory to search, and the only path it is ever called with here is
    // the fenced fixture file immediately above.
    readFrom,
    // The flush cap keeps its default; M37's worktree resolver closes over the
    // manager built below, the same forward closure main/index.ts uses.
    undefined,
    (panelId, cwd) => worktreeManager.ensureForPanel(panelId, cwd),
    // M39. The durable log's sink, always on here; the setting's gate is
    // main/index.ts's and verify:pty-manager's business.
    {
      append: (panelId, data) => { void scrollbackLog.append(panelId, data) },
      drop: (panelId) => { void scrollbackLog.drop(panelId) },
      enabled: () => true
    },
    // M43's attention sink keeps its inert default here.
    undefined,
    // M52. A real ledger in a scratch file and a scratch shell-integration
    // directory, so a login-shell panel spawned by a check emits the marks and
    // its commands become rows the context pane can list.
    {
      ledger: runLedger, integrationDir: join(mkdtempSync(join(tmpdir(), 'tc panels shell-integration ')), 'si'), now: () => Date.now(),
      // M286. Mirrors stores.ts: a ledger row is stamped with the panel's
      // subject identity as its end mark lands. reviewEngine is declared
      // below and read at call time, the harness's usual forward closure.
      identityOf: (panelId) => { const b = layoutStore.baseline(panelId); return b === undefined ? Promise.resolve(undefined) : reviewEngine.identityOf(b.root, b.sha) }
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
  // M93. The harness's own ring, uncoalesced so a check can take two snapshots in a second.
  const snapshotDir = join(mkdtempSync(join(tmpdir(), 'tc panels snaps ')), 'layout-snapshots')
  const layoutSnapshots = createLayoutSnapshots({ dir: snapshotDir, minMs: 0, max: 20 })
  const layoutStore = createLayoutStore({ filePath: LAYOUT_PATH, onWritten: (bytes) => { layoutSnapshots.record(bytes) } })
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
      // The FULL GitResult shape, `code` and `stderr` included. Returning a
      // partial one made `resolveRepo` reach `firstLine(result.stderr)` with
      // undefined and throw INSIDE `captureBaseline`'s floating promise — an
      // unhandled rejection that aborted that panel's baseline capture and
      // printed a warning no assertion reads. It only showed up when a check
      // spawned a panel outside the fences (M83's memory.3).
      return { stdout: '', ok: false, notFound: false, code: -1, stderr: 'refused by the review fence' }
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
    notARepo: (panelId) => baselineCapture.isNotARepo(panelId),
    // M86. The worktree records for a root, as main wires them — the
    // cross-worktree node's sections come from exactly this dep.
    worktreesOf: (root) => layoutStore.worktrees().filter((w) => w.root === root).map((w) => ({ path: w.path, branch: w.branch, panelId: w.panelId }))
  })
  // M37. Real git, real records, a scratch worktrees directory under $TMPDIR
  // (spaced, this repo's rule). Records go through the harness's own
  // layoutStore so worktree.1 can read them back over worktree:list.
  // M39. A scratch log directory, spaced like every fixture path here.
  const scrollbackLog = createScrollbackLog({ dir: join(mkdtempSync(join(tmpdir(), 'tc panels scrollback ')), 'scrollback') })
  // M58. Where the next export lands; the harness's own save dialog answer.
  let exportTarget = null
  const WORKTREES_DIR = join(mkdtempSync(join(tmpdir(), 'tc panels worktrees ')), 'worktrees')
  const worktreeManager = createWorktreeManager({
    run: realGitRunner,
    resolveRepo: (cwd) => reviewEngine.resolveRepo(cwd),
    worktreesDir: WORKTREES_DIR,
    records: {
      forPanel: (panelId, root) => layoutStore.worktreeForPanel(panelId, root),
      add: (record) => layoutStore.addWorktree(record),
      drop: (id) => layoutStore.dropWorktree(id),
      list: () => layoutStore.worktrees()
    }
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
    removeTempIndex: (p) => { try { rmSync(p, { force: true }) } catch { /* ignore */ } },
    // M285. Mirrors stores.ts: the re-check before a write is the engine's own read.
    identityOf: (root, base) => reviewEngine.identityOf(root, base)
  })
  // main/index.ts calls this at whenReady; without it the store would start
  // from defaultSnapshot() and the seeded presets above would never be read.
  layoutStore.load()
  // M50. Snapping OFF (AFTER load(), which replaces the snapshot from disk) for the harness: every drag check before M50 pins the
  // exact arithmetic of applyDrag (10 zooms mid-drag; 19 reads the saved
  // rect; 144b compares a group's two deltas), and a snap is a deliberate
  // departure from that arithmetic. The M50 block turns it on for its own
  // gesture and back off after — the setting exists so a user can align by
  // eye, and a check pinning arithmetic is a user aligning by eye.
  layoutStore.setPreference('placement.snap', false)
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
  const toolboxCache = new ToolboxCache()
  // M128. The plugin fixture the skill panel's own block uses, and the
  // RECORDED `claude plugin details` text it renders verbatim. Both are
  // gated on `pluginFixtureOn`, which stays false until skill.panel.1's
  // block turns it on: `listPlugins` has no cwd argument, so an
  // unconditionally-answering fake would add a plugin's skills to every
  // toolbox read this suite has already made (checks 162/163 among them) and
  // an unrelated check would move for a reason nobody wrote down. The
  // toolbox cache is keyed by cwd, and that block reads a FRESH temp
  // directory, so nothing is cached from before the flag flipped.
  const PLUGIN_ID = 'fixture-plugin@1.0.0'
  const PLUGIN_DIR = mkdtempSync(join(tmpdir(), 'tc plugin '))
  mkdirSync(join(PLUGIN_DIR, 'skills', 'plugged-skill'), { recursive: true })
  writeFileSync(join(PLUGIN_DIR, 'skills', 'plugged-skill', 'SKILL.md'),
    '---\nname: plugged-skill\ndescription: A skill this plugin ships.\n---\n\nBody of the plugged skill.\n')
  // As the CLI prints it: a human-formatted table with no --json. Rendered
  // verbatim and parsed nowhere, so the string a check compares against is
  // the string the panel must show, byte for byte — newlines included.
  const PLUGIN_DETAILS_TEXT = 'fixture-plugin@1.0.0\n  Skills (1)  plugged-skill\n  Always-on: ~688 tok\n  plugged-skill   on-invoke   ~120 tok\n'
  let pluginFixtureOn = false
  // M129 fix. Every path `skill:delete` handed to `trash`, in order. The
  // harness never trashes anything: what a check needs to see is that main
  // was asked to remove the skill's DIRECTORY, which a recorder answers and
  // a real `shell.trashItem` would answer only by moving a fixture.
  const skillTrashCalls = []
  // M130. The skill trail's fixture: a panel id and a real JSONL file on
  // disk. `null` until trail.lane.1 arms it, so every read before that block
  // gets the same named `unreadable` an unwired harness has always got.
  let trailFixture = null
  // M130 fix round. A cwd whose toolbox read main REFUSES, so the lane's
  // fourth outcome is reachable from a check: a refusal is not an inventory
  // and must never be rendered as `not installed here`, which is a claim
  // about the user's machine.
  let toolboxRefusedCwd = null
  const linkOpens = []
  let harnessEnvReport = {
    probedAt: Date.now(),
    shell: { path: '/bin/zsh', ok: true },
    pathEntries: ['/usr/bin', '/bin'],
    clis: [{ name: 'claude', path: null }, { name: 'codex', path: null }, { name: 'git', path: '/usr/bin/git' }],
    tmux: { kind: 'direct', reason: 'verify: direct', path: null },
    layout: { path: '(harness)', backupWritten: false },
    envKeys: ['HOME', 'PATH']
  }
  // Check 174 fakes the four JIRA_* ipcMain handlers for the duration of its
  // own block and MUST restore the real ones afterward — see that check's
  // own trailing comment. Restoring means re-installing the SAME closures
  // registerIpcHandlers bound here, not a re-derived approximation, so
  // ipcMain.handle is wrapped for exactly the one call below to capture
  // every channel -> listener pair it registers.
  const registeredHandlers = new Map()
  const realIpcMainHandle = ipcMain.handle.bind(ipcMain)
  // Under TC_SETTLE_PROBE every handler is timed (see settle()), and the TIMED
  // closure is what registeredHandlers keeps, so check 174's restore puts the
  // probe back along with the real handler.
  const probeTimed = (channel, listener) => !SETTLE_PROBE ? listener : async (...args) => {
    settleProbe.ipc.push([Date.now(), channel, 'start'])
    try { return await listener(...args) } finally { settleProbe.ipc.push([Date.now(), channel, 'end']) }
  }
  ipcMain.handle = (channel, listener) => { const l = probeTimed(channel, listener); registeredHandlers.set(channel, l); return realIpcMainHandle(channel, l) }
  // M73. A REAL AgentSessionManager over a FAKE process runner: each spawn
  // records its argv and replays scripts/fixtures/agent-session/turn.jsonl
  // (recorded from claude 2.1.259) on the first user line it is written, in
  // two chunks with a short gap so the renderer sees deltas arrive; kill
  // exits it. The transcript log lives in a scratch directory the harness
  // owns. Exactly main/index.ts's handlers, over these.
  const chatFixture = readFileSync(join(__dirname, 'fixtures', 'agent-session', 'turn.jsonl'), 'utf8').split('\n').filter((l) => l.trim() !== '')
  const chatSpawns = []
  const chatRunner = ({ command, args, cwd, env }) => {
    const dataCbs = []
    const exitCbs = []
    let exited = false
    const proc = {
      pid: 40000 + chatSpawns.length,
      stdin: [],
      killed: 0,
      write(line) {
        proc.stdin.push(line)
        let parsed = null
        try { parsed = JSON.parse(line) } catch { parsed = null }
        const cut = Math.floor(chatFixture.length / 2)
        const emit = (lines) => { for (const cb of dataCbs) cb(lines.join('\n') + '\n') }
        // M76. A user line whose text starts with `ask:` is answered with a
        // permission request instead of the recorded answer; the answer
        // then streams once the control response arrives — the real CLI's
        // own order.
        const text = parsed && parsed.type === 'user' && Array.isArray(parsed.message?.content) ? String(parsed.message.content.find((c) => c.type === 'text')?.text ?? '') : ''
        if (parsed && parsed.type === 'user' && text.startsWith('ask:')) {
          proc.asks = (proc.asks ?? 0) + 1
          const requestId = `req-${proc.pid}-${proc.asks}`
          setTimeout(() => { if (!exited) emit(chatFixture.slice(0, cut)) }, 40)
          setTimeout(() => { if (!exited) emit([JSON.stringify({ type: 'control_request', request_id: requestId, request: { subtype: 'can_use_tool', tool_name: 'Bash', input: { command: 'ls -la', description: 'list' }, tool_use_id: 'tu-' + requestId } })]) }, 80)
        } else if (parsed && parsed.type === 'control_response') {
          setTimeout(() => { if (!exited) emit(chatFixture.slice(cut)) }, 40)
        } else if (parsed && parsed.type === 'user') {
          setTimeout(() => { if (!exited) emit(chatFixture.slice(0, cut)) }, 40)
          setTimeout(() => { if (!exited) emit(chatFixture.slice(cut)) }, 160)
        }
      },
      onData(cb) { dataCbs.push(cb) },
      onExit(cb) { exitCbs.push(cb) },
      kill() {
        proc.killed += 1
        setTimeout(() => { if (exited) return; exited = true; for (const cb of exitCbs) cb({ code: null, signal: 'SIGTERM' }) }, 10)
      }
    }
    chatSpawns.push({ command, args, cwd, env, proc })
    return proc
  }
  const agentTranscripts = createAgentTranscriptLog({ dir: join(mkdtempSync(join(tmpdir(), 'tc panels chat ')), 'agent-transcripts') })
  let githubCredentialPresent = false
  // M89. The harness's own broker audit, appended to by checks and read by the pane.
  const brokerAuditForChecks = createBrokerAudit({ file: join(mkdtempSync(join(tmpdir(), 'tc panels audit ')), 'broker-audit.jsonl') })
  const memoryDir = mkdtempSync(join(tmpdir(), 'tc panels memory-store '))
  const memoryStore = createMemoryStore({ dir: memoryDir })
  const agentSessions = new AgentSessionManager({
    runner: chatRunner, command: '/fake/claude', env: { PATH: '/fake' },
    // M90. The second backend behind the same fake runner; a codex chat's
    // create needs nothing from it, and no check sends on one here.
    codex: { command: '/fake/codex' },
    // M82. The canvas's ceilings, read live from the same store main reads.
    limits: () => ({ maxConcurrent: Number(layoutStore.getSetting('agents.maxConcurrent')) || 0, budgetUsd: Number(layoutStore.getSetting('agents.budgetUsd')) || 0, budgetWindowPercent: Number(layoutStore.getSetting('agents.budgetWindowPercent')) || 0 }),
    newSessionId: () => `fake-${chatSpawns.length}`, interruptGraceMs: 200, coalesceMs: 16,
    // M74. The fenced answer to "has the CLI written this session": the
    // front-end fixture store, so an imported chat's first send resumes.
    transcriptExists: (id) => frontTranscripts.has(id)
  })
  // M76. The tracker main runs: a pending permission is `needs you` on the
  // terminal's own channel. An inert sink; the decision path is proven in
  // verify:agent-session.
  const approvalTracker = createApprovalTracker({
    sink: { notify() {}, badge() {}, beep() {}, windowFocused: () => true, notifyEnabled: () => false, soundEnabled: () => false },
    emitState: (panelId, state) => { if (!win.isDestroyed()) win.webContents.send(IPC_EVENTS.AGENT_STATE, { panelId, state }) },
    label: () => 'harness'
  })
  agentSessions.subscribe((event) => {
    approvalTracker.apply(event)
    if (event.type === 'turn') agentTranscripts.appendTurn(event.id, event.turn)
    if (event.type === 'result') { const snap = agentSessions.get(event.id); if (snap) agentTranscripts.appendMeta(event.id, { usage: snap.usage, costUsd: snap.costUsd, turns: snap.turns }) }
    if (!win.isDestroyed()) win.webContents.send(IPC_EVENTS.AGENT_EVENT, event)
  })
  // M84. The watcher runtime, wired the way main/index.ts wires it: the real
  // runner over a real child_process, the real FileWatchers for a path
  // trigger, and the real run ledger. A stub here would leave watch.1 proven
  // no further than the preload — the reasoning every real export in this
  // harness already follows.
  const watchFileWatchers = new FileWatchers()
  const watchDirWatchers = new Map()
  const watchTimers = new Map()
  const watchRunner = createWatchRunner({
    spawn: (spec, handlers) => {
      const child = require('node:child_process').spawn(spec.command, [...spec.args], { cwd: spec.cwd, shell: false })
      child.stdout?.on('data', (chunk) => handlers.onData(chunk.toString('utf8')))
      child.stderr?.on('data', (chunk) => handlers.onData(chunk.toString('utf8')))
      child.on('error', (error) => handlers.onData(`${error.message}\n`))
      child.on('exit', (code, signal) => handlers.onExit(code, signal))
      return { kill: (sig) => { try { child.kill(sig ?? 'SIGTERM') } catch { /* gone */ } } }
    },
    now: () => Date.now(),
    ledger: { append: (row) => runLedger.append(row) },
    onState: (id, state) => { if (!win.isDestroyed()) win.webContents.send(IPC_EVENTS.WATCHER_STATE, { id, ...state }) },
    // M286. Mirrors watch-handlers.ts: what the run tested, against the tree's HEAD.
    identityOf: (cwd) => reviewEngine.identityAtHead(cwd)
  })
  const watcherHandlers = {
    create: (req) => {
      let isDir = false
      try { isDir = statSync(expandTilde(req.cwd)).isDirectory() } catch { isDir = false }
      if (!isDir) return { ok: false, reason: `no such directory: ${req.cwd}` }
      watchFileWatchers.close(req.id)
      const dir0 = watchDirWatchers.get(req.id)
      if (dir0 !== undefined) { dir0.close(); watchDirWatchers.delete(req.id) }
      const timer = watchTimers.get(req.id)
      if (timer !== undefined) { clearInterval(timer); watchTimers.delete(req.id) }
      watchRunner.add({ id: req.id, cwd: expandTilde(req.cwd), command: req.command, args: req.args, trigger: req.trigger })
      // The same pause main honours: known, runnable by hand, nothing armed.
      if (req.armed === false) return { ok: true }
      if (req.trigger.kind === 'path' || req.trigger.kind === 'git-ref') {
        // The same file-vs-directory split main makes, and for its reason.
        const target = req.trigger.kind === 'path' ? expandTilde(req.trigger.path) : join(expandTilde(req.trigger.root), '.git', 'HEAD')
        let isDirTarget = false
        try { isDirTarget = statSync(target).isDirectory() } catch { isDirTarget = false }
        if (isDirTarget) {
          const w = require('node:fs').watch(target, { persistent: false, recursive: true }, () => watchRunner.fire(req.id))
          watchDirWatchers.set(req.id, w)
        } else {
          const first = watchFileWatchers.watch(req.id, target, () => watchRunner.fire(req.id))
          if (first.kind === 'missing' || first.kind === 'unreadable') return { ok: false, reason: `nothing to watch at ${target}` }
        }
      } else if (req.trigger.kind === 'timer') {
        const t = setInterval(() => watchRunner.fire(req.id), req.trigger.everyMs)
        t.unref?.()
        watchTimers.set(req.id, t)
      }
      return { ok: true }
    },
    run: (id) => watchRunner.fire(id),
    stop: (id) => watchRunner.stop(id),
    dispose: (id) => { watchFileWatchers.close(id); const d = watchDirWatchers.get(id); if (d !== undefined) { d.close(); watchDirWatchers.delete(id) } const t = watchTimers.get(id); if (t !== undefined) { clearInterval(t); watchTimers.delete(id) } watchRunner.remove(id) },
    list: () => watchRunner.ids().map((id) => ({ id, ...(watchRunner.stateOf(id) ?? { status: 'not-started', tail: '', pending: false }) }))
  }

  const harnessAttachmentsDir = mkdtempSync(join(tmpdir(), 'tc panels attachments '))
  // M181. The starter's files land here, never in the developer's real userData.
  const harnessStarterDir = join(mkdtempSync(join(tmpdir(), 'tc panels starter ')), 'starter')
  const poolCaller = createPoolCaller({
    agents: agentSessions,
    mint: (req) => requestFromRendererWith(win.webContents, IPC_EVENTS.POOL_MINT, req, { kind: 'refused', reason: 'the canvas did not answer in time' }, 20000),
    readList: (listPath) => {
      try {
        const items = readFileSync(expandTilde(listPath), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l !== '' && !l.startsWith('#'))
        return items.length === 0 ? { kind: 'error', why: `${listPath} holds no items` } : { kind: 'ok', items }
      } catch (error) { return { kind: 'error', why: String(error && error.message || error) } }
    },
    limits: () => ({ maxConcurrent: Number(layoutStore.getSetting('agents.maxConcurrent')) || 0, budgetUsd: Number(layoutStore.getSetting('agents.budgetUsd')) || 0, budgetWindowPercent: Number(layoutStore.getSetting('agents.budgetWindowPercent')) || 0 }),
    spend: () => agentSessions.list().reduce((sum, snap) => sum + (snap.costUsd ?? 0), 0),
    emit: (event) => { win.webContents.send(IPC_EVENTS.POOL_EVENT, event) }
  })
  const agentHandlers = {
    create: (spec) => {
      let isDir = false
      try { isDir = statSync(expandTilde(spec.cwd)).isDirectory() } catch { isDir = false }
      if (!isDir) return { kind: 'refused', reason: `no such directory: ${spec.cwd}` }
      const snapshot = agentSessions.create({ ...spec, cwd: expandTilde(spec.cwd) })
      // M77. The same capture the real handler fires (index.ts).
      baselineCapture.capture(spec.id, expandTilde(spec.cwd))
      return { kind: 'created', snapshot }
    },
    // M75. main/index.ts's resolve-then-send; a refusal names the attachment.
    send: (id, text, attachments = []) => {
      const images = []
      for (const a of attachments) { const r = resolveAttachment(a); if (r.kind === 'refused') return { refused: r.reason }; images.push({ mediaType: r.mediaType, base64: r.base64, name: r.name }) }
      const answer = agentSessions.send(id, text, images)
      // M82. Main's own mapping: the ceiling refuses by name with the fix.
      if (answer === 'refused-budget') {
        const windowPct = Number(layoutStore.getSetting('agents.budgetWindowPercent')) || 0
        const util = windowUtilization(agentSessions.rateLimit())
        if (windowPct > 0 && util !== undefined && util >= windowPct / 100) {
          return { refused: `over the ${windowPct}% usage-window budget for this canvas — raise agents.budgetWindowPercent in settings, or wait for a window to reset` }
        }
        const limit = Number(layoutStore.getSetting('agents.budgetUsd')) || 0
        return { refused: `over the $${limit.toFixed(2)} budget for this canvas — raise it in settings, or start a new canvas` }
      }
      return answer
    },
    clipboardImage: () => null,
    interrupt: (id) => agentSessions.interrupt(id),
    dispose: ({ id, drop }) => { agentSessions.dispose(id); if (drop) { agentTranscripts.drop(id); baselineCapture.drop(id); layoutStore.dropBaseline(id) } },
    answer: ({ id, requestId, answer }) => agentSessions.answerPermission(id, requestId, answer),
    list: () => agentSessions.list(),
    transcript: (id) => { const r = agentTranscripts.read(id); return { turns: r.turns, snapshot: agentSessions.get(id) ?? null, ...(r.meta === undefined ? {} : { meta: r.meta }) } },
    // M74. main/index.ts's importSession over the harness's FENCED transcript
    // store (frontTranscripts: session id -> a fixture file the check wrote),
    // never the real ~/.claude/projects.
    importSession: ({ fromPanelId, toPanelId }) => {
      const sessionId = layoutStore.session(fromPanelId)
      if (sessionId === undefined) return { kind: 'refused', reason: 'that terminal was not started as a claude session — start one from the Claude preset' }
      if (ptyManager.list().some((s) => s.panelId === fromPanelId)) return { kind: 'refused', reason: 'stop the terminal first — one front-end at a time' }
      const path = frontTranscripts.get(sessionId)
      if (path === undefined) return { kind: 'refused', reason: 'claude has not written a transcript for that session yet' }
      const imported = importClaudeTranscript(readFileSync(path, 'utf8'))
      agentTranscripts.drop(toPanelId)
      for (const turn of imported.turns) agentTranscripts.appendTurn(toPanelId, turn)
      agentTranscripts.appendMeta(toPanelId, imported.meta)
      return { kind: 'imported', sessionId, turns: imported.meta.turns }
    },
    // M97/M98. The same verbs main wires; grants are a harness-local map so the
    // inspector's field and the card's third verb have something to read.
    autoStart: (req) => agentSessions.startAuto(req.id, { mode: req.mode, task: req.task, limit: req.limit }),
    autoStop: (id) => agentSessions.stopAuto(id),
    grants: (id) => [...(harnessGrants.get(id) ?? [])],
    revokeGrants: (id) => { harnessGrants.delete(id) },
    // M138. The pool's production caller over THIS harness's real manager and
    // fake runner, wired the way main/index.ts wires it: the mint asked of the
    // renderer over the ephemeral reply, the list read from disk, the
    // ceilings from the store's settings, the spend from the sessions.
    // M145. The clipboard image as a file, under the harness's own directory
    // (never the real userData); the core check reads it through ctx.
    clipboardFile: () => writeClipboardImage({ dir: harnessAttachmentsDir, now: () => Date.now(), image: () => { const image = clipboard.readImage(); return image.isEmpty() ? null : image.toPNG() } }),
    poolStart: (req) => poolCaller.start(req),
    poolStop: (req) => poolCaller.stop(req.templateId, req.key)
  }
  const harnessGrants = new Map()
  const frontTranscripts = new Map()
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
      if (!found) return 'that preset no longer exists'
      // M253. Production's refusal, by production's function: an unread pack
      // preset spawns nothing and says why (main/index.ts onSpawnPreset).
      const unread = unreviewedPresetReason(found)
      if (unread !== null) return unread
      win.webContents.send(IPC_EVENTS.PRESET_SPAWN, templateOf(found))
      return null
    },
    // M253. "I've read this", through the real store, as main/index.ts does.
    markPresetReviewed: (id) => layoutStore.markPresetReviewed(id),
    // Real, mirroring main/index.ts's palette.savePanel: mints through
    // presetFromCapture, the same shared function check 90 exists to prove is
    // the only implementation. A stub here would leave check 90 exercising
    // nothing past the preload.
    savePanel: (captured) => {
      layoutStore.addPreset(presetFromCapture(layoutStore.presets(), captured))
    },
    requestReset: () => {},
    // M65. The sheet's path, real: a preset or a command becomes a template
    // sent back as PRESET_SPAWN, exactly as main/index.ts does it, and a
    // missing directory is refused with a reason.
    spawnWith: (req) => {
      // The SAME resolver main/index.ts runs (spawn-request.ts), over the
      // harness's own presets and a real directory test.
      const resolved = resolveSpawnRequest(req, allPresets(layoutStore.presets()), {
        expand: expandTilde,
        isDirectory: (p) => { try { return statSync(p).isDirectory() } catch { return false } }
      })
      if (resolved.kind === 'refused') return resolved
      win.webContents.send(IPC_EVENTS.PRESET_SPAWN, resolved.template)
      return { kind: 'spawned' }
    },
    recentDirectories: () => layoutStore.recentDirectories(),
    recentDirectoryUsed: () => layoutStore.recentDirectoryUsed(),
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
    // M141. The REAL store, the way main/index.ts saves: a check that saves a
    // prompt through the bridge needs it on the next load (prompt.builtin.1).
    savePrompt: (name, body) => { layoutStore.addPrompt({ id: `hp${Date.now()}`, name, body }) },
    removePrompt: () => false,
    // M80. The real store, through the same three verbs main wires.
    // M80. The preset's resolved template — main's own answer, never a spawn.
    presetTemplate: (id) => { const found = allPresets(layoutStore.presets()).find((p) => p.id === id); return found === undefined ? null : templateOf(found) },
    // M83. The project memory: a real store under the harness's own dir.
    // M88. The GitHub client over a RECORDED requester, with the credential's
    // presence a flag the check flips — the same injected shape main wires,
    // so the node is driven end to end with no network.
    // M89. The audit's read half, as main wires it.
    brokerAudit: (limit, service) => brokerAuditForChecks.list(limit, service),
    githubList: (panelId) => listGithubWorkItems({ panelId, broker: { call: async (q) => {
      if (!githubCredentialPresent) return { ok: false, code: 'not-connected', reason: 'not connected — add a github token in ⌘K › Credentials' }
      return { ok: true, status: 200, truncated: false, body: q.path.includes('/search/')
        ? JSON.stringify({ total_count: 1, items: [{ number: 77, title: 'Split the flush gate', body: 'Please review.', state: 'open', html_url: 'https://github.com/acme/canvas/pull/77', repository_url: 'https://api.github.com/repos/acme/canvas', pull_request: { url: 'x' }, user: { login: 'worker-a' } }] })
        : JSON.stringify([{ number: 12, title: 'Flaky watchdog', body: 'The watchdog fires under load.', state: 'open', html_url: 'https://github.com/acme/canvas/issues/12', repository: { full_name: 'acme/canvas' }, assignee: { login: 'octocat' } }]) }
    } } }),
    // M85. The vault's read: the REAL reader over the fixture folder, the
    // reasoning every real export in this harness follows.
    vaultRead: (root) => readVault(root),
    // M181. The real readers over the harness's own directory (the M85 rule).
    imageRead: (path) => readImage(path),
    starterPrepare: () => prepareStarter(harnessStarterDir),
    // M93. The same two fences main wires, over the harness's ring.
    snapshotList: () => layoutSnapshots.list(),
    // M142. The renderer asks at boot (the M135 rule: every handler it calls at boot, or the pane paints its failed arm).
    ledgerUsage: (since) => runLedger.usage(since),
    snapshotRestore: (at, afterId) => {
      let bytes
      try { bytes = readFileSync(join(snapshotDir, `${at}.json`), 'utf8') } catch { return { kind: 'refused', reason: 'that snapshot is gone' } }
      const result = restoreFromSnapshot(layoutStore.current(), bytes, Date.now(), (n) => `n${n}`, afterId)
      if (result.kind === 'refused') return result
      const added = result.layout.workspaces[result.layout.workspaces.length - 1]
      layoutStore.addWorkspaceRecord(added)
      return { kind: 'restored', workspaceId: added.id }
    },
    memoryList: (root, limit) => memoryStore.list(root, limit),
    memoryAdd: (req) => { const r = memoryStore.add(req); return r.ok ? { ok: true } : { ok: false, reason: r.reason } },
    listTemplates: () => allTemplates(layoutStore.templates()),
    // M127 fix. The shelf, whole, through the SAME parser main uses. It was
    // missing entirely: `palette.shelf()` threw, both invokes rejected, and
    // Canvas's un-caught `.then` chains left the pane empty with nothing on
    // screen saying so — in every boot of this harness.
    shelf: () => layoutStore.shelf(),
    saveShelf: (shelf) => layoutStore.saveShelf(parseShelf(shelf, [])),
    // M100/M101. The roster and routines over the harness's own store; the
    // folder dialog and the runner are main's and stay out of a harness.
    listTeammates: () => layoutStore.teammates(),
    saveTeammate: (t) => { layoutStore.saveTeammate(t); return t },
    removeTeammate: (id) => layoutStore.deleteTeammate(id),
    choosePlace: async () => null,
    listRoutines: () => layoutStore.routines(),
    saveRoutine: (r) => { layoutStore.saveRoutine(r); return { kind: 'saved', routine: r } },
    removeRoutine: (id) => layoutStore.deleteRoutine(id),
    runRoutine: () => false,
    saveTemplate: (template, expectedRevision) => {
      const id = template.id !== undefined && template.id !== '' && !isBuiltInTemplate(template.id) ? template.id : `tpl-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
      return layoutStore.saveTemplate({ ...template, id }, expectedRevision)
    },
    removeTemplate: (id) => (isBuiltInTemplate(id) ? false : layoutStore.deleteTemplate(id))
  }, () => {
    // This entry point is its own Electron process with no application menu
    // at all — createMenu()/rebuildMenu() belong to main/index.ts, which this
    // harness deliberately does not run (see the hand-wiring note above). The
    // no-op exists only to satisfy registerIpcHandlers' signature: settings:set
    // still has to reach a callable fifth argument or a real settings-palette
    // exercise here would throw "rebuildMenu is not a function" instead of
    // testing what it means to.
  }, reviewEngine, reviewCommit, credentialStore, new FileWatchers(), () => win,
  // A REAL cache, not a stub, and fenced onto the harness's own fixture home
  // by the TOOLBOX_HOME below rather than by homedir(): the toolbox reader is
  // the one thing in this milestone that would otherwise read the running
  // developer's real ~/.claude, which is the rule M9a's git fence and M15's
  // projects-root fence each cost a fix round to learn.
  // Wrapped, not replaced: every read still goes to the REAL cache except the
  // one cwd a check has armed a refusal for.
  { read: (input, resolvePlugins) => {
    // Compared on the REAL path: the request's cwd has already been through
    // resolveCwd, and a temp directory under /var is /private/var once
    // resolved — an equality on the raw string would arm nothing.
    let real = input.cwd
    try { real = realpathSync(input.cwd) } catch { /* a missing dir is not this fixture's subject */ }
    if (toolboxRefusedCwd !== null && real === toolboxRefusedCwd) throw new Error('the toolbox read is refused in this fixture')
    return toolboxCache.read(input, resolvePlugins)
  } },
  // Backlog #75's export directory, scoped to this suite's own temp home so
  // an export check never writes into the running developer's real userData.
  join(mkdtempSync(join(tmpdir(), 'tc-panels-diagnostics-')), 'diagnostics'),
  // M37. Real list/remove over the manager above; reveal is a no-op here
  // because a Finder window is not something a hidden-window suite can open.
  {
    list: () => layoutStore.worktrees(),
    remove: (id) => worktreeManager.remove(id),
    reveal: () => true
  },
  // M39. Real tail/clear over the log above.
  {
    tail: (panelId, lines) => scrollbackLog.tail(panelId, lines),
    clear: () => scrollbackLog.clearAll(),
    // M42. The same shape main/index.ts wires, so the SCROLLBACK_SEARCH handler
    // registerIpcHandlers installs has a real implementation to call.
    search: async (panelIds, query) => ({ hits: (await scrollbackLog.search(panelIds, query, { maxHits: 50, maxPerPanel: 5 })).map((h) => ({ ...h, kind: 'scrollback' })), capped: false, cap: 50, redacted: 0 })
  },
  // M48. The environment report, as a fixture the checks can swap: env.1
  // needs a FAILED probe, which no harness machine should produce for real.
  () => harnessEnvReport,
  // M51. link:open RECORDS rather than opens: a harness must never open the
  // developer's browser or editor. The renderer's half — the corrected
  // hover, the Cmd-only activation, the request's shape — is what the
  // checks are about.
  { open: (req) => { linkOpens.push(req); return { kind: 'opened' } } },
  // M52. The ledger's read half, over the scratch ledger the manager writes.
  (panelId, limit) => runLedger.list(panelId, limit),
  // M53. Exactly main/index.ts's wiring: the store's own peer count, a FILE
  // unlink, and stat for the directory refusal.
  createReviewDiscarder({
    run: fencedGitRunner,
    peersInRepo: (root, except) => layoutStore.baselinePeers(root, except),
    removeFile: (p) => unlinkSync(p),
    isDirectory: (p) => { try { return statSync(p).isDirectory() } catch { return false } },
    identityOf: (root, base) => reviewEngine.identityOf(root, base)
  }),
  // M58. Main's own exporters over this harness's "dialog": whatever path
  // exportTarget names, or a cancel when it is null.
  createExporters({
    log: scrollbackLog,
    persistOn: () => layoutStore.getSetting('scrollback.persist') === true,
    askPath: async () => exportTarget,
    capture: async () => (await win.webContents.capturePage()).toPNG()
  }), agentHandlers, watcherHandlers,
  // M103. The real read over the real guest, the same adapter main/index.ts wires.
  createBrowserHandlers({ guestOf: (id) => webContents.fromId(id) ?? null }),
  // M114. The REAL lane over the harness's own worktree manager and a real
  // Places gate, so dispatch.1 mints a real worktree in a fixture repository.
  { laneStatus: (req) => reviewEngine.laneStatus(req.path, req.root),
    // M115. The harness's PR door never pushes and never reaches GitHub: a fake success with a fixed number, so the record's `pr` and the `review` word can be asserted offline.
    openPr: async () => ({ kind: 'opened', number: 42, url: 'https://github.com/acme/canvas/pull/42' }), commentPr: async () => ({ kind: 'commented', url: 'https://github.com/acme/canvas/issues/1#issuecomment-1' }),
    ...createBoardLane({
    gate: createPlacesGate({ realpath: (p) => realpathSync(p), teammate: (id) => layoutStore.teammates().find((t) => t.id === id), worktreeRootOf: (p) => layoutStore.worktrees().find((w) => w.path === p)?.root }),
    worktrees: { ensureForPanel: (panelId, cwd) => worktreeManager.ensureForPanel(panelId, cwd) },
    teammate: (id) => layoutStore.teammates().find((t) => t.id === id),
    recordFor: (panelId, root) => layoutStore.worktreeForPanel(panelId, root),
    originOf: (dir) => { try { return execFileSync('git', ['-C', dir, 'remote', 'get-url', 'origin'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null } catch { return null } },
    subdirs: (dir) => { try { return readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.')).map((d) => join(dir, d.name)) } catch { return [] } }
  }),
    // M197. The REAL repository lister over the same readers, so start.door.1
    // and .2 walk fixture repositories on disk rather than a fake list.
    repositories: async (req) => repositoriesAnswer(
      layoutStore.teammates().find((t) => t.id === req.teammateId),
      {
        originOf: (dir) => { try { return execFileSync('git', ['-C', dir, 'remote', 'get-url', 'origin'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null } catch { return null } },
        subdirs: (dir) => { try { return readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.')).map((d) => join(dir, d.name)) } catch { return [] } },
        isRepoRoot: (dir) => { try { return existsSync(join(dir, '.git')) } catch { return false } }
      }
    ) },
  // M126/M128. The plugin list and the details text, both fixtures: no suite
  // spawns the real CLI. `unknown` while the flag is off is exactly what an
  // uninstalled `claude` produces, so every read before skill.panel.1 sees
  // the same answer it saw before this fixture existed.
  async () => (pluginFixtureOn
    ? { kind: 'ok', plugins: [{ id: PLUGIN_ID, installPath: PLUGIN_DIR, enabled: true }] }
    : { kind: 'unknown', why: 'plugin list is not wired' }),
  async (id) => (pluginFixtureOn && id === PLUGIN_ID
    ? { kind: 'ok', text: PLUGIN_DETAILS_TEXT }
    : { kind: 'unknown', why: `claude plugin details ${id} did not answer` }),
  // M129 fix. The REAL writers, so editor.2 drives the same create / rename
  // / delete path production does rather than three inert fakes that could
  // never have caught the three channels having NO renderer caller at all.
  //
  // Nothing here can reach the running developer's `~/.claude`: `home()` is
  // the suite's fenced `TC_TOOLBOX_HOME` (the same fence every toolbox read
  // in this file already runs behind — an unfenced home attributes the
  // developer's own skills to a fixture panel), and `trash` RECORDS rather
  // than trashes, so a delete is observable and moves nothing on disk.
  skillWriteHandlers({
    resolveCwd,
    home: () => process.env.TC_TOOLBOX_HOME,
    realpath: (x) => realpathSync(x),
    plugins: async () => (pluginFixtureOn ? [{ id: PLUGIN_ID, installPath: PLUGIN_DIR }] : []),
    trash: async (path) => { skillTrashCalls.push(path) }
  }),
  // M130. The REAL trailFor over the harness's own fixture transcript — the
  // same byte-offset tail main wires, with the projects lookup replaced by
  // this suite's file so nothing reads the developer's ~/.claude/projects.
  async (panelId) => (trailFixture !== null && trailFixture.panelIds.includes(panelId)
    ? trailFor({
      backend: 'claude',
      panelId,
      pinnedSession: () => 'trail-fixture-session',
      resolveTranscript: () => trailFixture.path,
      // transcript-reader.ts's readFrom shape: RAW bytes from `from` to EOF
      // plus the size now. Never decoded here — trailFor owns the decoder.
      readDelta: (path, from) => {
        let size
        try { size = statSync(path).size } catch { return undefined }
        const len = Math.max(0, size - from)
        const bytes = Buffer.alloc(len)
        if (len > 0) {
          const fd = openSync(path, 'r')
          try { readSync(fd, bytes, 0, len, from) } finally { closeSync(fd) }
        }
        return { bytes, size }
      }
    })
    : { kind: 'unreadable', why: 'the skill trail is not wired' }),
  // M123. No harness reaches the network: the third state, by name.
  { check: async () => ({ kind: 'could-not-check', reason: 'no network in the harness' }),
  },
  // M185. The REAL preview handlers — the same discoverer and the same
  // capture main/index.ts wires. Discovery's process seam is the real `lsof`
  // (the check drives it with no pid, so nothing is asked), and the capture
  // writes into the harness's own userData, so preview.1 reads a real PNG
  // off disk rather than trusting a fake.
  {
    discover: (req) => discoverPreview({
      // M186. The tree, from ONE `ps` snapshot: the socket is held by a
      // descendant of the panel's shell, never by the shell.
      descendants: async (roots) => {
        try {
          const out = await new Promise((resolve) => {
            const child = spawnChild('ps', ['-Ao', 'pid=,ppid='], { stdio: ['ignore', 'pipe', 'ignore'] })
            let text = ''
            child.stdout && child.stdout.on('data', (c) => { text += c.toString('utf8') })
            child.on('error', () => resolve(''))
            child.on('close', () => resolve(text))
          })
          const rows = String(out).split('\n').map((line) => line.trim().split(/\s+/).map(Number)).filter((f) => f.length === 2 && Number.isInteger(f[0]) && Number.isInteger(f[1])).map(([pid, ppid]) => ({ pid, ppid }))
          return descendantsOf(roots, rows)
        } catch { return roots }
      },
      pids: Array.isArray(req && req.pids) ? req.pids.filter((n) => Number.isInteger(n) && n > 0) : [],
      cwd: typeof (req && req.cwd) === 'string' && req.cwd.trim() !== '' ? req.cwd : app.getPath('home'),
      run: async (command, args) => new Promise((resolve) => {
        const child = spawnChild(command, [...args], { stdio: ['ignore', 'pipe', 'ignore'] })
        let stdout = ''
        const deadline = setTimeout(() => { try { child.kill() } catch {} finally { resolve({ code: 1, stdout: '' }) } }, 3000)
        child.stdout && child.stdout.on('data', (c) => { stdout += c.toString('utf8') })
        child.on('error', () => { clearTimeout(deadline); resolve({ code: 1, stdout: '' }) })
        child.on('close', (code) => { clearTimeout(deadline); resolve({ code: code === null ? 0 : code, stdout }) })
      }),
      readText: async (path) => { try { return readFileSync(path, 'utf8') } catch { return undefined } }
    }),
    capture: async (req) => {
      const guest = req && typeof req.webContentsId === 'number' ? webContents.fromId(req.webContentsId) : null
      if (guest === null || guest === undefined || guest.isDestroyed()) return { kind: 'refused', reason: 'no page is open in this pane — open one, then capture it' }
      if (guest.getType() !== 'webview') return { kind: 'refused', reason: 'that id is not a page in a browser panel' }
      const dir = join(app.getPath('userData'), 'captures')
      try { mkdirSync(dir, { recursive: true }) } catch {}
      return capturePreview({
        getUrl: () => guest.getURL(),
        capture: () => guest.capturePage(),
        write: async (path, data) => { writeFileSync(path, data) },
        dir,
        now: () => Date.now()
      })
    }
  },
  // M186. The REAL store, into the harness's own userData; the chooser
  // answers whatever a check planted, so no dialog opens in a suite.
  {
    put: (req) => putAsset({ dir: join(app.getPath('userData'), 'assets'), ...(req && typeof req.path === 'string' ? { path: req.path } : {}), ...(req && req.bytes !== undefined ? { bytes: req.bytes } : {}) }),
    choose: async () => state.assetChoice ?? null
  },
  // M188. The REAL runHttpNode over a FAKE fetcher: no suite reaches the
  // network (the rule that keeps `verify` fast and offline), and every refusal
  // arm — which is the part that matters — is the production one.
  {
    fetch: (req) => runHttpNode({ url: String((req && req.url) || ''), ...(req && typeof req.method === 'string' ? { method: req.method } : {}) }, {
      now: () => Date.now(),
      fetch: async () => { state.nodeFetches = (state.nodeFetches || 0) + 1; return { status: 200, body: 'a harness body' } }
    })
  },
  // M189. The REAL write and read, into a path the check plants (no dialog
  // opens in a suite — `state.portablePath` stands in for the chooser).
  {
    write: async (req) => {
      const path = (req && typeof req.path === 'string' && req.path) || state.portablePath
      if (!path) return { kind: 'cancelled' }
      const text = JSON.stringify((req && req.file) || null, null, 2) + '\n'
      writeFileSync(path, text, 'utf8')
      return { kind: 'written', path, bytes: Buffer.byteLength(text, 'utf8') }
    },
    read: async (req) => {
      const path = (req && typeof req.path === 'string' && req.path) || state.portablePath
      if (!path) return { kind: 'cancelled' }
      let text
      try { text = readFileSync(path, 'utf8') } catch (error) { return { kind: 'refused', reason: String(error && error.message) } }
      return { kind: 'read', path, parse: parsePortable(text) }
    }
  },
  // M250's `docx` slot, left to its INERT default: the parameters are
  // positional, and without this placeholder the tools stub below lands in
  // docx's place and every tool.* check reads "not wired here".
  undefined,
  // M252. Describe a tool, answered by a PLANTED result: no suite starts a
  // `claude` process. What the renderer does with the answer — save it
  // unreviewed, refuse its run by name, open its preview without a page —
  // is the production path the tool.* checks drive.
  {
    generate: async () => state.toolReply ?? { kind: 'refused', reason: 'no tool reply was planted by this check' }
  },
  // M253. The PRODUCTION pack factory, not a copy: only the choosers are the
  // harness's (`state.packPath` stands in for both dialogs), and the credential
  // store is the harness's real one — metadata only, exactly as in main.
  createPackHandlers({
    store: layoutStore,
    credentials: () => credentialStore.list(),
    which: () => null,
    afterPresetChange: () => {},
    app: 'harness',
    chooseOpen: async () => (state.packPath ? { kind: 'path', path: state.packPath } : { kind: 'cancelled' }),
    chooseSave: async () => (state.packPath ? { kind: 'path', path: state.packPath } : { kind: 'cancelled' }),
    // M255. The sample pack lands in a harness temp dir, never the real userData.
    sampleDir: require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'tc harness packs '))
  }),
  // M255. The PRODUCTION publisher: only the confirm (answers
  // `state.publishAnswer`, default CANCEL, and records every ask), the remote
  // and the broker (records every call, reaches no network) are the harness's.
  {
    publish: async (raw) => {
      const req = parsePublishRequest(raw)
      if (typeof req === 'string') return { kind: 'refused', reason: req }
      return publish({
        broker: { call: async (q) => { (state.publishCalls = state.publishCalls || []).push(q); return { ok: false, reason: 'the harness broker reaches no network' } } },
        remoteOf: async () => state.publishRemote || null,
        confirm: async (ask) => { (state.publishAsks = state.publishAsks || []).push(ask); return state.publishAnswer === true }
      }, req)
    }
  })
  ipcMain.handle = realIpcMainHandle

  // The same listener createWindow() installs, calling the same production
  // function — not a send written here. Check 32 is about WHEN main sends
  // versus when the renderer starts listening, so the harness has to reproduce
  // main's timing exactly; a send issued from the check body would arrive long
  // after the renderer had settled and could never fail.
  win.webContents.on('did-finish-load', () => {
    pushDefaultPreset(win.webContents, layoutStore)
    // M43. Mirror main/index.ts. In production detachAll() empties the session
    // map on a reload, so this is a no-op after a real Cmd+R (see the M43
    // overrule); here the harness does not wire window-lifecycle, so it is
    // harmless either way and kept only for fidelity with main.
    ptyManager.resendStates()
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
    console.error(`\nFAIL  watchdog — run did not finish within ${BUDGET_MS}ms`)
    // The backstop's own backstop. On 2026-09-14 agents' watchdog fired at 113s
    // and app.exit(1) did not end the process until 1074s — a teardown stuck
    // behind the part's still-pending body. A hard exit a few seconds later,
    // unref'd so it never holds a healthy exit open.
    setTimeout(() => process.exit(1), 5000).unref()
    try { ptyManager.killAll() } catch (error) { console.error('watchdog: killAll threw', error) }
    app.exit(1)
  }, BUDGET_MS)

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

  const state = {}
  Object.defineProperties(state, {
    backend: { get: () => backend, set: (v) => { backend = v } },
    tmuxBackend: { get: () => tmuxBackend, set: (v) => { tmuxBackend = v } },
    exportTarget: { get: () => exportTarget, set: (v) => { exportTarget = v } },
    pluginFixtureOn: { get: () => pluginFixtureOn, set: (v) => { pluginFixtureOn = v } },
    trailFixture: { get: () => trailFixture, set: (v) => { trailFixture = v } },
    toolboxRefusedCwd: { get: () => toolboxRefusedCwd, set: (v) => { toolboxRefusedCwd = v } },
    harnessEnvReport: { get: () => harnessEnvReport, set: (v) => { harnessEnvReport = v } },
    githubCredentialPresent: { get: () => githubCredentialPresent, set: (v) => { githubCredentialPresent = v } },
    renamedId: { get: () => renamedId, set: (v) => { renamedId = v } },
    attentionPanelId: { get: () => attentionPanelId, set: (v) => { attentionPanelId = v } },
    GIT_OK: { get: () => GIT_OK, set: (v) => { GIT_OK = v } },
  })
  let renamedId = null
  let attentionPanelId = null
  let GIT_OK = true
  try { execFileSync('git', ['--version'], { stdio: 'ignore' }) } catch { GIT_OK = false }
  try {
    // Not `loadFile(...).catch(() => {})`. A swallowed load turns up one step
    // later as `executeJavaScript` failing with "Script failed to execute" —
    // which is how a real ERR_FILE_NOT_FOUND flake in this very suite read as
    // 77/78 with an unexplained `infrastructure` line. scripts/load-renderer.cjs
    // carries the measurement and separates "no build" from "flaked".
    await loadRenderer(win)
    const wc = win.webContents
    settleProbe.wc = wc

    // Check 32's evidence, SAMPLED here and asserted at the end of the run
    // beside the other preset checks. It cannot be asserted where it is
    // numbered: check 29 deliberately pushes a PRESET_DEFAULT of its own, so
    // by then the boot value is gone. Nothing between here and the load above
    // sends PRESET_DEFAULT — the only push is main's own did-finish-load one,
    // which is the whole point.
    const bootDefault = await waitUntil(async () => await wc.executeJavaScript(
      `window.__m5aDefaultSpec ? (window.__m5aDefaultSpec() || null) : null`), 3000)

    // M135. Helpers the un-split file declared beside its checks and every part reads.
    const clickPanelAt = async (x, y) => {
      wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
      wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 })
      await sleep(150)
      const [reachedXterm, active] = await Promise.all([
        wc.executeJavaScript(
          `(() => { const el = document.elementFromPoint(${x}, ${y});
                    return !!(el && el.closest('.xterm')) })()`
        ),
        wc.executeJavaScript(`(document.activeElement && document.activeElement.className) || ''`)
      ])
      return { reachedXterm, active }
    }

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

    const panelCount = (w) => w.executeJavaScript(`document.querySelectorAll('.panel').length`)

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

    const dockTo = (name) => wc.executeJavaScript(`(() => { const b = document.querySelector('[data-dock="' + ${JSON.stringify(name)} + '"]'); if (!b) return false; b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true })()`)

    const nodeCount = (wc) =>
      wc.executeJavaScript(`document.querySelectorAll('[data-subagent-id]').length`)

    const nodeBox = (wc, id) => wc.executeJavaScript(`(() => {
      const n = document.querySelector('[data-subagent-id="' + ${JSON.stringify(id)} + '"]')
      if (!n) return null
      const r = n.getBoundingClientRect()
      return { x: r.left, y: r.top }
    })()`)

    const ctx = {
      createPoolCaller, requestFromRendererWith, harnessAttachmentsDir, harnessStarterDir, readImage, prepareStarter, STARTER_OBJECTS, AgentSessionManager, BOOT_DEFAULT_PRESET, BrowserWindow, CASCADE_STEP, DEFAULT_CAMERA, ECHO_PRESET, ENTRY_OUT, FILE_MAX_LINES, FileWatchers, IPC, IPC_EVENTS, LAYOUT_PATH, LIVE_AT_BOOT, NEVER_RENDERED_PANEL_ID, NEVER_RENDERED_WORKSPACE_ID, NEVER_WOKEN_ID, PANELS_SOCKET, PLUGIN_DETAILS_TEXT, PLUGIN_DIR, PLUGIN_ID, PROJECT_DIR, PROJECT_PROMPT_BODY, PROJECT_PROMPT_NAME, PROMPT_DIRS, PtyManager, RENAMABLE_PRESET, REVIEW_FENCES, SEEDED_PROMPT, SEED_PANELS, ToolboxCache, WORKTREES_DIR, activeWorkspaceId, agentHandlers, agentSessions, agentTranscripts, allPresets, allTemplates, app, appendFileSync, approvalTracker, attachPtyLifecycle, backgroundPoint, baselineCapture, bootDefault, brokerAuditForChecks, buildSync, buildTmuxConf, cardCount, cardTexts, chatFixture, chatRunner, chatSpawns, clickEmptyCanvas, clickPanelAt, clickPanelBody, clickPanelClose, clickRail, closeSync, commitIndexDir, commitIndexSeq, createAgentTranscriptLog, createApprovalTracker, createBaselineCapture, createBoardLane, createBrokerAudit, createBrowserHandlers, createControlHandler, createControlServer, createDirectBackend, createExporters, createGitRunner, createLayoutSnapshots, createLayoutStore, createMemoryStore, createPlacesGate, createReviewCommitter, createReviewDiscarder, createReviewEngine, createRunLedger, createScrollbackLog, createTmuxBackend, createWatchRunner, createWorktreeManager, credentialDir, credentialStore, dockTo, execFileSync, existsSync, expandTilde, fencedGitRunner, findTmux, flushLayoutStore, fromPanels, frontTranscripts, gitPath, gridState, harnessCredentialDir, harnessGrants, importClaudeTranscript, ipcMain, isBuiltInTemplate, join, killedPanelIds, knownUsageSessionIds, lastPanelCentreInWorld, layoutSnapshots, layoutStore, linkOpens, listGithubWorkItems, listSessions, liveCount, loginEnv, memoryDir, memoryStore, mergePrompts, mkdirSync, mkdtempSync, nodeBox, nodeCount, ok, openSync, panelCount, parseLayout, parseShelf, pidsPreserved, presetFromCapture, presetRows, pressArrow, pressChord, pressPlain, ptyManager, pushDefaultPreset, railAgentState, railPan, readFileSync, readFrom, readProjectPrompts, readSync, readVault, readdirSync, realGitRunner, realIpcMainHandle, realpathSync, registerIpcHandlers, registeredHandlers, releaseMeta, renameSync, requestFromRenderer, resolveAttachment, resolveAvailability, resolveCwd, resolveShellEnv, resolveSpawnRequest, restoreFromSnapshot, results, reviewCommit, reviewEngine, rmSync, runLedger, scrollbackLog, sessionMap, settle, settledSessionMap, skillTrashCalls, skillWriteHandlers, sleep, snapshotDir, statSync, templateOf, tmpdir, toolboxCache, trailFor, unlinkSync, usageFixtureDir, usageFixtureFile, verifySocket, viewCentreInWorld, waitUntil, watchDirWatchers, watchFileWatchers, watchRunner, watchTimers, watcherHandlers, wc, webContents, whichFromEnv, whichHere, win, worktreeManager, writeFileSync, zoomTo, zoomToScale,
      state,
    }
    await body(ctx)
  } catch (error) {
    // An infrastructure failure (e.g. a missing DOM target, a rejected
    // executeJavaScript) still has to report through the same PASS/FAIL
    // shape and still has to reach the summary below — printing nothing and
    // just crashing is exactly the silent hang this suite exists to avoid.
    console.error('\nFAIL  infrastructure error: ' + (error && error.stack ? error.stack : error))
    results.push({ n: 'infrastructure', pass: false, detail: String(error) })
  } finally {
    if (!watchdogFired) {
      // headroom.1 — THE DRIFT ALARM. Each part's WATCHDOG_MS is 1.25x a measured
      // run, so a fresh pin sits at 80% of its budget; the watchdog fires at
      // 100%, and a watchdog kill reads as a HANG with every result lost
      // (M135). Red at 90% is the window between: a part that has grown ~12%
      // since it was measured goes red HERE, by name and with its figures,
      // while it still has ~10% to spare. Found the hard way — kinds on a
      // pre-M237 branch had outgrown its 60s pin and failed only as a hang.
      // Graded against the scaled budget so TC_WATCHDOG_SCALE below 1 can
      // prove this check goes red; ABOVE 1 the clock is contention's, not the
      // part's, so it SKIPS loudly rather than grade the machine.
      const wallMs = Date.now() - startedAt
      if (SCALE <= 1) {
        ok('headroom.1 the part finished inside 90% of its watchdog — when this is red, re-measure and re-pin WATCHDOG_MS',
          wallMs <= 0.9 * BUDGET_MS, `${(wallMs / 1000).toFixed(1)}s of ${(BUDGET_MS / 1000).toFixed(0)}s (${Math.round((wallMs / BUDGET_MS) * 100)}%)`)
      } else {
        ok(`headroom.1 (SKIPPED — TC_WATCHDOG_SCALE ${SCALE}: a contended clock measures the machine, not the part)`, true,
          `${(wallMs / 1000).toFixed(1)}s against a ${(BUDGET_MS / 1000).toFixed(0)}s scaled watchdog`)
      }
      if (SETTLE_PROBE) {
        try {
          writeFileSync(`${SETTLE_PROBE}-${name}.json`, JSON.stringify(settleProbe.rows))
          console.log(`[verify:panels:${name}] settle probe: ${settleProbe.rows.length} windows -> ${SETTLE_PROBE}-${name}.json`)
        } catch (error) { console.error('settle probe: could not write', error) }
      }
      console.log('\n' + '='.repeat(60))
      const failed = results.filter((r) => !r.pass)
      console.log(`${results.length - failed.length}/${results.length} passed`)
      // M135. The part's own wall clock, printed with the tally so a watchdog
      // is pinned against the figure the suite MEASURED in the conditions it
      // ran in — the chain's, not a quiet run's (the M130 note's whole point).
      console.log(`[verify:panels:${name}] ${((Date.now() - startedAt) / 1000).toFixed(1)}s wall`)
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
}

module.exports = { runPanelsSuite }
