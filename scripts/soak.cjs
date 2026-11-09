/* Run with: npm run build && npm run soak
   M654. THE SOAK: MANY PANELS, HOURS, AND WHAT GREW.

   A leak in this app does not show in a 90-minute gate. It shows at hour
   five, as a canvas that got slow overnight — which is when the product is
   supposed to be doing its best work. This runs the BUILT app (the real
   composition root, through scripts/lib/real-app.cjs) with a set of terminals
   that keep printing the way agents do, moves the camera between them the way
   a person checking in does, and samples from outside once a minute:

     memory     the whole process tree's resident size, and main's alone
     handles    main's open file descriptors
     processes  the tree's size (a helper that is never reaped is a leak too)
     sessions   what main lists, and what tmux lists — a PTY that died is a
                failure whatever the memory says
     heap, DOM  the renderer's own JS heap and node count
     disk       userData, and the scrollback logs inside it (capped per panel
                by design; the cap is checked)

   WHAT FAILS IT, AND WHY NOT MORE. Two kinds of rule:

   - INVARIANTS, checked on every run however short: the app is still up,
     every session is still alive at every sample, the scrollback stays under
     its cap, and a clean quit at the end leaves no session behind.
   - GROWTH, checked only on a run long enough to mean something
     (GROWTH_MIN_MINUTES): after a warm-up, memory, handles, processes, heap
     and DOM nodes must be FLAT. Flat is judged twice and both must say
     "grew" to fail — a least-squares slope per hour AND the difference
     between the medians of the first and last quarter of the post-warm-up
     samples — because either alone is fooled: a slope by one late spike, a
     difference by a slow sawtooth of GC.

   The warm-up is long on purpose. Every terminal's scrollback fills to its
   cap, xterm's buffers fill to theirs, V8 settles its heap: all of that is
   growth, none of it is a leak, and a soak that starts measuring at minute
   five reports all of it.

   THE THRESHOLDS ARE A FIRST PIN, NOT A MEASUREMENT. They were set before
   this had a full-length run on the hosted runner to be set from, loose
   enough that only a real leak crosses them (tens of megabytes an hour,
   sustained). docs/reliability.md says how to tighten them from the first
   few runs' own numbers; every run uploads its samples for exactly that.

   Knobs (environment): TC_SOAK_MINUTES (default 300), TC_SOAK_PANELS (20),
   TC_SOAK_SAMPLE_S (60), TC_SOAK_OUT (out/soak). */
'use strict'
const { existsSync, mkdirSync, writeFileSync, appendFileSync, readdirSync, statSync } = require('node:fs')
const { join } = require('node:path')
const R = require('./lib/real-app.cjs')

const num = (name, fallback, min) => { const n = Number(process.env[name]); return Number.isFinite(n) && n >= min ? n : fallback }
const MINUTES = num('TC_SOAK_MINUTES', 300, 1)
const PANELS = Math.round(num('TC_SOAK_PANELS', 20, 1))
const SAMPLE_S = num('TC_SOAK_SAMPLE_S', 60, 5)
const OUT = process.env.TC_SOAK_OUT || join(R.ROOT, 'out', 'soak')

/* Under this, a run is a SMOKE: it proves the harness and the invariants and
   reports growth without judging it. */
const GROWTH_MIN_MINUTES = 90
/* The warm-up: a fifth of the run, never under 30 minutes on a judged run. */
const warmupMinutes = () => (MINUTES < GROWTH_MIN_MINUTES ? Math.min(2, MINUTES / 4) : Math.max(30, MINUTES * 0.2))

/* The growth limits. `perHour` is the slope; `total` is the quarter-median
   difference over the whole post-warm-up window. BOTH must be exceeded. */
const LIMITS = {
  treeRssMb: { perHour: 40, total: 150, label: 'memory, whole process tree (MB)' },
  mainRssMb: { perHour: 15, total: 60, label: 'memory, main process (MB)' },
  openFiles: { perHour: 5, total: 20, label: 'open file descriptors, main' },
  processes: { perHour: 1, total: 3, label: 'processes in the tree' },
  heapMb: { perHour: 20, total: 80, label: 'renderer JS heap (MB)' },
  domNodes: { perHour: 1500, total: 6000, label: 'DOM nodes' }
}
/* scrollback.persist's own promise: "up to 2 MB per panel". A little slack
   for a write in flight. */
const SCROLLBACK_CAP_MB_PER_PANEL = 2.5

const SOCKET = require('./verify-socket.cjs').verifySocket('tc-soak')
const log = (line) => console.log(`[soak ${new Date().toISOString().slice(11, 19)}] ${line}`)

const dirBytes = (dir) => {
  let total = 0
  const walk = (d) => {
    let names
    try { names = readdirSync(d) } catch { return }
    for (const n of names) {
      const p = join(d, n)
      let st
      try { st = statSync(p) } catch { continue }
      if (st.isDirectory()) walk(p); else total += st.size
    }
  }
  walk(dir)
  return total
}
const scrollbackBytes = (userData) => {
  // Wherever the logs are kept under userData: found by name, not by a path
  // copied from main that would silently read 0 if it moved.
  let total = 0
  try { for (const n of readdirSync(userData)) if (/scrollback/i.test(n)) total += dirBytes(join(userData, n)) } catch { /* nothing yet */ }
  return total
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length === 0 ? NaN : s[Math.floor(s.length / 2)] }
/* Least squares, x in hours. */
const slopePerHour = (rows, key) => {
  const pts = rows.filter((r) => typeof r[key] === 'number' && Number.isFinite(r[key])).map((r) => [r.minute / 60, r[key]])
  if (pts.length < 3) return NaN
  const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length
  const my = pts.reduce((a, p) => a + p[1], 0) / pts.length
  const den = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0)
  return den === 0 ? NaN : pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / den
}
const quarterDelta = (rows, key) => {
  const v = rows.map((r) => r[key]).filter((x) => typeof x === 'number' && Number.isFinite(x))
  const q = Math.max(1, Math.floor(v.length / 4))
  return median(v.slice(v.length - q)) - median(v.slice(0, q))
}

/* One chart per series, hand-drawn SVG: nothing to install on the runner, and
   it renders in the job summary and in the artifact alike. */
function chart(rows, warmup) {
  const keys = Object.keys(LIMITS)
  const W = 720; const H = 120; const PAD = 44
  const maxMin = Math.max(1, rows[rows.length - 1].minute)
  const blocks = keys.map((key, i) => {
    const vals = rows.map((r) => r[key]).filter((v) => typeof v === 'number' && Number.isFinite(v))
    if (vals.length === 0) return ''
    const lo = Math.min(...vals); const hi = Math.max(...vals); const span = hi - lo || 1
    const x = (m) => PAD + (m / maxMin) * (W - PAD - 10)
    const y = (v) => 16 + (1 - (v - lo) / span) * (H - 34)
    const pts = rows.filter((r) => typeof r[key] === 'number').map((r) => `${x(r.minute).toFixed(1)},${y(r[key]).toFixed(1)}`).join(' ')
    const top = i * (H + 8)
    return `<g transform="translate(0,${top})"><rect x="${PAD}" y="16" width="${W - PAD - 10}" height="${H - 34}" fill="none" stroke="#8884" />` +
      `<rect x="${PAD}" y="16" width="${Math.max(0, x(warmup) - PAD).toFixed(1)}" height="${H - 34}" fill="#8882" />` +
      `<polyline points="${pts}" fill="none" stroke="#3b82f6" stroke-width="1.5" />` +
      `<text x="${PAD}" y="11" font-size="11" fill="#888">${LIMITS[key].label}</text>` +
      `<text x="${PAD - 4}" y="24" font-size="10" fill="#888" text-anchor="end">${Math.round(hi)}</text>` +
      `<text x="${PAD - 4}" y="${H - 18}" font-size="10" fill="#888" text-anchor="end">${Math.round(lo)}</text>` +
      `<text x="${W - 10}" y="${H - 4}" font-size="10" fill="#888" text-anchor="end">${Math.round(maxMin)} min</text></g>`
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${keys.length * (H + 8)}" font-family="ui-monospace,monospace">${blocks.join('')}</svg>\n`
}

;(async () => {
  if (!existsSync(join(R.ROOT, 'out', 'main', 'index.js'))) { console.error('no build found — run npm run build first'); process.exit(2) }
  mkdirSync(OUT, { recursive: true })
  const judged = MINUTES >= GROWTH_MIN_MINUTES
  const warmup = warmupMinutes()
  log(`${PANELS} panels for ${MINUTES} min, a sample every ${SAMPLE_S}s, warm-up ${Math.round(warmup)} min — ${judged ? 'growth is JUDGED' : `a SMOKE run (under ${GROWTH_MIN_MINUTES} min): invariants only, growth reported and not judged`}`)

  const userData = R.scratchUserData('soak')
  R.killTmux(SOCKET)
  const app = R.launchApp({ userData, socket: SOCKET })
  const failures = []
  const fail = (line) => { failures.push(line); log(`FAIL ${line}`) }
  let stopping = false
  const stop = async (code) => {
    if (stopping) return
    stopping = true
    try { await app.kill() } catch { /* gone */ }
    R.cleanup(userData, SOCKET)
    process.exit(code)
  }
  process.on('SIGINT', () => void stop(130))
  process.on('SIGTERM', () => void stop(143))

  const rows = []
  const csv = join(OUT, 'samples.csv')
  const COLS = ['minute', 'treeRssMb', 'mainRssMb', 'openFiles', 'processes', 'heapMb', 'domNodes', 'sessions', 'tmuxSessions', 'cpuPct', 'userDataMb', 'scrollbackMb']
  writeFileSync(csv, `${COLS.join(',')}\n`)

  try {
    await app.ready()
    const tmux = /backend=tmux/.test(app.out())
    const ids = await R.openPanels(app, PANELS)
    for (const id of ids) await R.chatter(app, id, 0.5)
    log(`fixture up: ${ids.length} terminals printing, backend ${tmux ? 'tmux' : 'direct'}`)

    const t0 = Date.now()
    const end = t0 + MINUTES * 60_000
    let prev = R.sampleCost(app)
    let visit = 0
    while (Date.now() < end) {
      // Between samples, a person checking in: go to the next panel (which
      // promotes it to live and demotes another — the attach/detach path),
      // and move the camera. Spread across the interval, not bunched.
      const until = Math.min(end, Date.now() + SAMPLE_S * 1000)
      while (Date.now() < until) {
        if (app.exit() !== null) break
        try {
          await app.control({ verb: 'plan', line: `focus ${ids[visit % ids.length]}` }, 10000)
          visit += 1
          await R.wheelFrames(app, { frames: 30, pinch: visit % 3 === 0, timeoutMs: 8000 })
        } catch { /* the sample below says whether the app is still there */ }
        await R.sleep(Math.max(1000, Math.min(15000, until - Date.now())))
      }
      if (app.exit() !== null) { fail(`the app exited ${JSON.stringify(app.exit())} at minute ${Math.round((Date.now() - t0) / 60000)}`); break }

      const cost = R.sampleCost(app)
      const listed = ((await app.control({ verb: 'list' }, 15000)).sessions || []).length
      let page = { heapMb: null, domNodes: null }
      try { page = await app.js(`({ heapMb: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null, domNodes: document.getElementsByTagName('*').length })`) } catch { /* reported as a blank */ }
      const row = {
        minute: Math.round(((cost.at - t0) / 60000) * 10) / 10,
        treeRssMb: cost.rssMb, mainRssMb: cost.mainRssMb, openFiles: cost.openFiles, processes: cost.processes,
        heapMb: page.heapMb, domNodes: page.domNodes,
        sessions: listed, tmuxSessions: tmux ? R.tmuxSessions(SOCKET).length : null,
        cpuPct: Math.round(((cost.cpuSeconds - prev.cpuSeconds) / ((cost.at - prev.at) / 1000)) * 1000) / 10,
        userDataMb: Math.round((dirBytes(userData) / 1048576) * 10) / 10,
        scrollbackMb: Math.round((scrollbackBytes(userData) / 1048576) * 10) / 10
      }
      prev = cost
      rows.push(row)
      appendFileSync(csv, `${COLS.map((c) => row[c] ?? '').join(',')}\n`)
      log(COLS.map((c) => `${c}=${row[c] ?? '-'}`).join(' '))

      if (row.sessions !== PANELS) fail(`minute ${row.minute}: main lists ${row.sessions} sessions, not ${PANELS} — a terminal's process died`)
      if (tmux && row.tmuxSessions !== PANELS) fail(`minute ${row.minute}: tmux has ${row.tmuxSessions} sessions, not ${PANELS}`)
      if (row.scrollbackMb > PANELS * SCROLLBACK_CAP_MB_PER_PANEL) fail(`minute ${row.minute}: scrollback on disk is ${row.scrollbackMb} MB, over the ${SCROLLBACK_CAP_MB_PER_PANEL} MB per panel cap`)
      // One dead session is one finding, not one per remaining minute.
      if (failures.length > 0 && rows.length > 1 && failures.length > 5) break
    }

    // ---- the end: a clean quit leaves nothing behind -----------------
    if (app.exit() === null) {
      const quit = await app.quit(30000)
      if (!quit) fail('the app did not quit within 30 s of being asked')
      else if (tmux) {
        const left = await R.waitUntil(() => R.tmuxSessions(SOCKET).length === 0, 15000, 250)
        if (!left) fail(`a clean quit left ${R.tmuxSessions(SOCKET).length} tmux session(s) running (session.keepOnQuit is off by default)`)
      }
    }

    // ---- growth ---------------------------------------------------------
    const post = rows.filter((r) => r.minute >= warmup)
    const table = []
    for (const [key, lim] of Object.entries(LIMITS)) {
      const slope = slopePerHour(post, key)
      const delta = quarterDelta(post, key)
      const grew = Number.isFinite(slope) && Number.isFinite(delta) && slope > lim.perHour && delta > lim.total
      table.push({ key, label: lim.label, first: post[0]?.[key], last: post[post.length - 1]?.[key], slope, delta, lim, grew })
      if (judged && grew) fail(`${lim.label} grew: ${slope.toFixed(1)}/hour (limit ${lim.perHour}) and ${delta.toFixed(1)} across the run (limit ${lim.total})`)
    }
    if (judged && post.length < 10) fail(`only ${post.length} samples after the warm-up — not enough to judge growth`)

    const fmt = (v) => (typeof v === 'number' && Number.isFinite(v) ? (Math.abs(v) >= 100 ? String(Math.round(v)) : v.toFixed(1)) : '—')
    const summary = [
      `# Soak: ${PANELS} panels, ${MINUTES} minutes`,
      '',
      failures.length === 0 ? '**Passed.**' : `**Failed** (${failures.length}):`,
      ...failures.map((f) => `- ${f}`),
      '',
      judged
        ? `Growth is judged on the ${post.length} samples after a ${Math.round(warmup)}-minute warm-up. A series fails only when BOTH its slope and its first-to-last-quarter difference are over the limit.`
        : `A smoke run (under ${GROWTH_MIN_MINUTES} minutes): the invariants were checked; growth below is reported, not judged.`,
      '',
      '| Series | After warm-up | At the end | Per hour | Limit | Across the run | Limit | |',
      '|---|---:|---:|---:|---:|---:|---:|---|',
      ...table.map((t) => `| ${t.label} | ${fmt(t.first)} | ${fmt(t.last)} | ${fmt(t.slope)} | ${t.lim.perHour} | ${fmt(t.delta)} | ${t.lim.total} | ${t.grew ? (judged ? 'GREW' : 'grew (not judged)') : 'flat'} |`),
      '',
      `Sessions alive at every sample: ${rows.every((r) => r.sessions === PANELS) ? 'yes' : 'NO'}. Peak scrollback on disk: ${fmt(Math.max(0, ...rows.map((r) => r.scrollbackMb)))} MB. Mean CPU: ${fmt(rows.reduce((a, r) => a + r.cpuPct, 0) / Math.max(1, rows.length))}% of one core.`,
      '',
      'Samples: `samples.csv`. Chart: `chart.svg` (the shaded band is the warm-up).',
      ''
    ].join('\n')
    writeFileSync(join(OUT, 'summary.md'), summary)
    if (rows.length > 1) writeFileSync(join(OUT, 'chart.svg'), chart(rows, warmup))
    console.log(`\n${summary}`)
    if (process.env.GITHUB_STEP_SUMMARY) { try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`) } catch { /* not on a runner */ } }
  } catch (error) {
    fail(`the soak itself broke: ${String(error && error.stack || error)}`)
    console.log(`--- app output (tail) ---\n${app.out().slice(-3000)}`)
  }
  await stop(failures.length === 0 ? 0 : 1)
})()
