/* Run with: npm run build && npm run verify:reliability
   M653. THE REAL APP, KILLED AND TIMED.

   Two things no other suite here can check, because every other Electron
   suite is its own entry point (scripts/lib/real-app.cjs says why that
   matters), and both are what a person running agents overnight is trusting:

   recover.*  THE APP IS KILLED AND OPENED AGAIN. SIGKILL — no before-quit,
              no flush, no record; what a crash, a force quit and a power cut
              share. The next launch must put the same canvas back, find the
              same processes still running on tmux, and say so in one
              sentence. Then the renderer alone is crashed, and must come back
              by itself. Then a CLEAN quit must not be called a crash.

   perf.*     THREE NUMBERS THAT USED TO BE PRINTED AND NEVER ASSERTED, as
              budgets: how long a cold start takes, how long a frame takes
              with fifty terminals on the canvas, and what the app costs while
              nobody touches it.

   THE BUDGETS ARE FOR THE HOSTED macOS RUNNER, WHERE THE GATE RUNS, and each
   is the runner's own measured number with headroom — not a target for a
   developer's Mac, which is faster and passes with room. The headroom is
   deliberately wide (the table below gives each measurement): a budget is
   here to catch the change that makes a start take three times as long or a
   frame drop to a slideshow, the regressions nobody would see in a diff. It
   is not a benchmark, and a 15% drift will not and should not turn it red —
   a shared runner's own noise is larger than that. Every number is printed
   as a MEASURE line on every run, pass or fail, so drift is still visible in
   the log, and docs/reliability.md says how to re-pin one.

   TC_PERF_BUDGET_SCALE multiplies every budget, for a machine that is not
   the runner (a container painting in software). Unset is 1, and CI never
   sets it.

   Plain node driving a child Electron; it carries ELECTRON_RUN_AS_NODE in its
   package.json command only so verify-all.cjs files it in the serial Electron
   tier, after the build it reads. */
'use strict'
const { existsSync, readFileSync } = require('node:fs')
const { join } = require('node:path')
const { ok, results } = require('./lib/checks.cjs').createChecks()
const { verifySocket } = require('./verify-socket.cjs')
const R = require('./lib/real-app.cjs')

/* ---- the budgets -------------------------------------------------------
   `measured` is the hosted runner's own figure when the budget was pinned
   (docs/reliability.md keeps the runs); `budget` is what fails the gate. */
const BUDGETS = {
  // Spawn to a mounted canvas. Best of the launches this suite makes: every
  // launch shares a regression, only some share a noisy neighbour.
  coldStartMs: { measured: null, budget: 15000 },
  // p95 frame interval over 120 driven frames, fifty terminals on the canvas.
  panP95Ms: { measured: null, budget: 250 },
  zoomP95Ms: { measured: null, budget: 250 },
  // Average load of the whole process tree over IDLE_WINDOW_S of nobody
  // touching it, fifty idle shells open, as a percentage of one core.
  idleCpuPct: { measured: null, budget: 60 }
}
const SCALE = (() => { const n = Number(process.env.TC_PERF_BUDGET_SCALE); return Number.isFinite(n) && n > 0 ? n : 1 })()
const budget = (key) => BUDGETS[key].budget * SCALE

const RECOVER_PANELS = 6
const PERF_PANELS = 50
const IDLE_SETTLE_S = 8
const IDLE_WINDOW_S = 20

const SOCKET_A = verifySocket('tc-verify-reliability-a')
const SOCKET_B = verifySocket('tc-verify-reliability-b')
const measure = (row) => console.log(`MEASURE ${JSON.stringify(row)}`)

const live = []
const scratch = []
let finished = false
async function finish(code) {
  if (finished) return
  finished = true
  for (const app of live) { try { await app.kill() } catch { /* gone */ } }
  for (const [userData, socket] of scratch) R.cleanup(userData, socket)
  const failed = results.filter((r) => !r.pass)
  console.log(`\n${'='.repeat(60)}`)
  console.log(`${results.length - failed.length}/${results.length} passed`)
  process.exit(code ?? (failed.length === 0 ? 0 : 1))
}
/* The runner's backstop is SIGKILL at ten minutes, which would orphan a real
   app and a tmux server. This one fires first and cleans up. */
const watchdog = setTimeout(() => { ok('watchdog the suite finished inside its eight minutes', false, 'timed out — the last MEASURE line above says how far it got'); void finish(1) }, 8 * 60 * 1000)
watchdog.unref()
process.on('SIGINT', () => void finish(1))
process.on('SIGTERM', () => void finish(1))

const launch = async (userData, socket) => {
  const app = R.launchApp({ userData, socket })
  live.push(app)
  await app.ready()
  return app
}
const coldStarts = []
const noteStart = (label, app) => {
  const row = { label, canvasMs: Date.now() - app.startedAt, mainReadyMs: app.stampOf(/\[startup\] packaged=/) }
  // `ready()` returns after the door answers too; the canvas itself is timed
  // inside it only loosely, so the honest figure is main's own line plus the
  // renderer's — taken here as the wall clock at return, an upper bound.
  coldStarts.push(row)
  measure({ what: 'cold start', ...row })
}
const sessionsOf = async (app) => ((await app.control({ verb: 'list' })).sessions || []).map((s) => ({ id: s.panelId, pid: s.pid })).sort((a, b) => a.id.localeCompare(b.id))
const terminalIds = (app) => app.js(`[...document.querySelectorAll('.panel[data-panel-kind="terminal"]')].map((e) => e.getAttribute('data-panel-id')).sort()`)
const notice = (app) => app.js(`[...document.querySelectorAll('[data-reopen-notice] [data-reopen-group]')].map((e) => ({ group: e.getAttribute('data-reopen-group'), text: (e.querySelector('.reopen-notice__text') || e).textContent }))`)
const savedRects = (userData) => {
  try {
    const layout = JSON.parse(readFileSync(join(userData, 'layout.json'), 'utf8'))
    const ws = layout.workspaces.find((w) => w.id === layout.activeWorkspaceId) || layout.workspaces[0]
    return ws.panels.filter((p) => p.kind === 'terminal').map((p) => `${p.id}@${p.x},${p.y},${p.w}x${p.h}`).sort()
  } catch { return null }
}

;(async () => {
  if (!existsSync(join(R.ROOT, 'out', 'main', 'index.js')) || !existsSync(join(R.ROOT, 'out', 'renderer', 'index.html'))) {
    ok('build.1 the built app is present (out/main and out/renderer) — run npm run build first', false, 'no build found')
    return finish()
  }

  // =====================================================================
  // recover.* — killed, and opened again.
  // =====================================================================
  const udA = R.scratchUserData('a')
  scratch.push([udA, SOCKET_A])
  R.killTmux(SOCKET_A)
  let tmux = false
  try {
    let app = await launch(udA, SOCKET_A)
    noteStart('first launch, empty profile', app)
    tmux = /backend=tmux/.test(app.out())
    const ids = (await R.openPanels(app, RECOVER_PANELS)).sort()
    // Two of them mid-output when the process dies, the way an agent is.
    await R.chatter(app, ids[0])
    await R.chatter(app, ids[1])
    const before = await sessionsOf(app)
    // The coalesced layout save and the run marker both have to have landed:
    // a kill inside that window is M55's orphan case (a session with no saved
    // panel), which asks a person a question in a dialog — a different story
    // from the one checked here, and one that would hold this suite forever.
    const landed = await R.waitUntil(() => {
      const rects = savedRects(udA)
      let marker = null
      try { marker = JSON.parse(readFileSync(join(udA, 'running.json'), 'utf8')) } catch { /* not yet */ }
      return rects !== null && rects.length === RECOVER_PANELS && marker !== null && marker.running.length === RECOVER_PANELS
    }, 20000, 150)
    const rectsBefore = savedRects(udA)
    ok('recover.0 the fixture is real: six terminals each with a running process, the layout saved, and the run marker naming all six',
      before.length === RECOVER_PANELS && landed === true,
      JSON.stringify({ sessions: before.length, landed, rects: rectsBefore?.length, backend: tmux ? 'tmux' : 'direct' }))

    await app.kill()
    const survivors = R.tmuxSessions(SOCKET_A).sort()
    ok(`recover.1 SIGKILL leaves no quit record and the marker in place${tmux ? ', and every tmux session outlives the app' : ' (direct backend: the processes die with the app, by design)'}`,
      !existsSync(join(udA, 'last-exit.json')) && existsSync(join(udA, 'running.json')) && (!tmux || JSON.stringify(survivors) === JSON.stringify(ids)),
      JSON.stringify({ lastExit: existsSync(join(udA, 'last-exit.json')), marker: existsSync(join(udA, 'running.json')), survivors }))

    app = await launch(udA, SOCKET_A)
    noteStart('relaunch after a kill, six panels', app)
    await R.waitUntil(async () => (await terminalIds(app)).length === RECOVER_PANELS, 15000)
    const idsAfter = await terminalIds(app)
    const rectsAfter = savedRects(udA)
    ok('recover.2 the same canvas comes back: the same six panels, each where it was',
      JSON.stringify(idsAfter) === JSON.stringify(ids) && JSON.stringify(rectsAfter) === JSON.stringify(rectsBefore),
      JSON.stringify({ idsAfter, rectsBefore, rectsAfter }))

    const after = await sessionsOf(app)
    ok(tmux
      ? 'recover.3 every session is found again — the same panels, the SAME process ids, so nothing was restarted'
      : 'recover.3 (direct backend) no session is claimed to have survived',
      tmux ? JSON.stringify(after) === JSON.stringify(before) : after.length === 0,
      JSON.stringify({ before, after }))

    const said = await R.waitUntil(async () => { const n = await notice(app); return n.some((l) => l.group === 'crash') ? n : false }, 15000) || await notice(app)
    const crashLines = said.filter((l) => l.group === 'crash')
    ok(`recover.4 the reopened app says what happened in one sentence: it closed unexpectedly, the canvas is back${tmux ? ', and the six terminals reconnected' : ''} — and it does not call it a quit`,
      crashLines.length === 1 && /closed unexpectedly/.test(crashLines[0].text) && /your canvas is back/.test(crashLines[0].text) &&
        (tmux ? /6 terminals reconnected, still running/.test(crashLines[0].text) && said.every((l) => l.group !== 'ended') : said.some((l) => l.group === 'stopped')) &&
        !said.some((l) => /you quit|was closed/.test(l.text)),
      JSON.stringify(said))

    // ---- the renderer alone -------------------------------------------
    // Page.crash never answers: the process that would answer is the one it
    // kills. The evidence is what main does next.
    void app.page.send('Page.crash').catch(() => {})
    const logFile = join(udA, 'crash-log.jsonl')
    const recorded = await R.waitUntil(() => existsSync(logFile) && readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).find((r) => r.kind === 'renderer-gone'), 20000, 100)
    let back = false
    let backIds = []
    let backSessions = []
    try {
      // The old page's socket is dead; the reloaded page is a new target.
      await R.sleep(500)
      await app.attach(30000)
      back = await R.waitUntil(async () => (await terminalIds(app)).length === RECOVER_PANELS, 30000, 150) === true
      backIds = await terminalIds(app)
      backSessions = await sessionsOf(app)
    } catch (error) { backIds = [String(error.message || error)] }
    ok(`recover.5 a crashed renderer is recorded (scrubbed, in crash-log.jsonl) and its window loads again by itself with the same six panels${tmux ? ' and the same running processes' : ''}; main never exited`,
      !!recorded && recorded.phase === 'running' && typeof recorded.redactions === 'number' && back && JSON.stringify(backIds) === JSON.stringify(ids) &&
        (!tmux || JSON.stringify(backSessions) === JSON.stringify(before)) && app.exit() === null,
      JSON.stringify({ recorded, back, backIds, backSessions: backSessions.length, exit: app.exit() }))

    // ---- a clean quit is not a crash ------------------------------------
    const quitCleanly = await app.quit()
    const afterQuit = { lastExit: existsSync(join(udA, 'last-exit.json')), marker: existsSync(join(udA, 'running.json')) }
    app = await launch(udA, SOCKET_A)
    noteStart('relaunch after a clean quit, six panels', app)
    await R.waitUntil(async () => (await terminalIds(app)).length === RECOVER_PANELS, 15000)
    // The quit's own notice (the terminals stopped) is what proves the notice
    // had its chance to speak; waiting for it is what makes "no crash line"
    // an observation rather than a race.
    const quitSaid = await R.waitUntil(async () => { const n = await notice(app); return n.length > 0 ? n : false }, 15000) || []
    ok('recover.6 a clean quit writes its record and clears the marker, and the next launch reports the quit — never a crash',
      quitCleanly === true && afterQuit.lastExit && !afterQuit.marker && quitSaid.length > 0 && quitSaid.every((l) => l.group !== 'crash') && !quitSaid.some((l) => /unexpectedly/.test(l.text)),
      JSON.stringify({ quitCleanly, afterQuit, quitSaid }))
    await app.quit()
  } catch (error) {
    ok('recover.x the recovery run completed', false, `${String(error && error.stack || error)}\n--- app output ---\n${live.length > 0 ? live[live.length - 1].out().slice(-3000) : ''}`)
  }
  R.cleanup(udA, SOCKET_A)

  // =====================================================================
  // perf.* — the budgets.
  // =====================================================================
  const udB = R.scratchUserData('b')
  scratch.push([udB, SOCKET_B])
  R.killTmux(SOCKET_B)
  try {
    const app = await launch(udB, SOCKET_B)
    noteStart('second empty profile', app)
    const best = Math.min(...coldStarts.map((c) => c.canvasMs))
    ok(`perf.cold.1 a cold start reaches a mounted canvas and an answering control door within ${budget('coldStartMs')} ms (best of ${coldStarts.length} launches)`,
      best <= budget('coldStartMs'), JSON.stringify({ bestMs: best, launches: coldStarts, budgetMs: budget('coldStartMs') }))

    const t0 = Date.now()
    const ids = await R.openPanels(app, PERF_PANELS)
    const sessions = await sessionsOf(app)
    measure({ what: 'fifty panels opened and started', ms: Date.now() - t0, cost: R.sampleCost(app) })
    ok('perf.frame.0 the fixture is real: fifty terminals on the canvas, each with a running process',
      ids.length === PERF_PANELS && sessions.length === PERF_PANELS, JSON.stringify({ panels: ids.length, sessions: sessions.length }))

    await R.sleep(1500)
    const pan = await R.wheelFrames(app, { frames: 120, pinch: false })
    const zoom = await R.wheelFrames(app, { frames: 120, pinch: true })
    const panStats = pan === null ? null : R.frameStats(pan)
    const zoomStats = zoom === null ? null : R.frameStats(zoom)
    measure({ what: 'fifty panels · pan (wheel every frame)', ...panStats })
    measure({ what: 'fifty panels · pinch-zoom (ctrl-wheel every frame)', ...zoomStats })
    ok(`perf.frame.1 with fifty terminals on the canvas, panning paints 120 frames with p95 within ${budget('panP95Ms')} ms`,
      panStats !== null && panStats.frames === 120 && panStats.p95Ms <= budget('panP95Ms'), JSON.stringify({ ...panStats, budgetMs: budget('panP95Ms'), note: pan === null ? 'frames stopped coming — the window is not being painted' : undefined }))
    ok(`perf.frame.2 with fifty terminals on the canvas, pinch-zooming paints 120 frames with p95 within ${budget('zoomP95Ms')} ms`,
      zoomStats !== null && zoomStats.frames === 120 && zoomStats.p95Ms <= budget('zoomP95Ms'), JSON.stringify({ ...zoomStats, budgetMs: budget('zoomP95Ms'), note: zoom === null ? 'frames stopped coming — the window is not being painted' : undefined }))

    // Idle: nothing typed, nothing moving, fifty prompts waiting.
    await R.sleep(IDLE_SETTLE_S * 1000)
    const a = R.sampleCost(app)
    await R.sleep(IDLE_WINDOW_S * 1000)
    const b = R.sampleCost(app)
    const pct = Math.round(((b.cpuSeconds - a.cpuSeconds) / ((b.at - a.at) / 1000)) * 1000) / 10
    measure({ what: 'idle, fifty panels', idleCpuPctOfOneCore: pct, windowS: IDLE_WINDOW_S, cost: b })
    ok(`perf.idle.1 left alone with fifty idle terminals, the whole process tree averages within ${budget('idleCpuPct')}% of one core over ${IDLE_WINDOW_S} s`,
      pct <= budget('idleCpuPct') && b.processes > 0, JSON.stringify({ pct, budgetPct: budget('idleCpuPct'), from: a, to: b }))
    await app.quit()
  } catch (error) {
    ok('perf.x the performance run completed', false, `${String(error && error.stack || error)}\n--- app output ---\n${live.length > 0 ? live[live.length - 1].out().slice(-3000) : ''}`)
  }
  return finish()
})()
