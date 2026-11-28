/* M701. Reads the local event log and prints the numbers it holds.

   Run with: npm run event-report [-- --log-dir <dir>] [--days 7] [--json]

   The log is written only when `telemetry.localEventLog` is on (Settings,
   Privacy & telemetry, Usage log). Nothing here reads anything else or sends
   anything anywhere: it is one directory of JSONL in, text or JSON out.

   The arithmetic is src/shared/event-log.ts summarizeEvents, bundled here
   with esbuild, so these are the numbers verify:event-log pinned. */
'use strict'
const { buildSync } = require('esbuild')
const { existsSync, readFileSync, readdirSync } = require('node:fs')
const { join } = require('node:path')
const { homedir, platform } = require('node:os')

function loadEventLog() {
  const out = join(__dirname, '..', 'out', 'scripts', 'event-log.cjs')
  buildSync({ entryPoints: [join(__dirname, '..', 'src', 'shared', 'event-log.ts')], outfile: out, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' })
  return require(out)
}

/* Where the app keeps userData: the packaged build's name first, then the dev build's. */
function userDataCandidates() {
  const home = homedir()
  const base = platform() === 'darwin' ? join(home, 'Library', 'Application Support')
    : platform() === 'win32' ? (process.env.APPDATA ?? join(home, 'AppData', 'Roaming'))
    : (process.env.XDG_CONFIG_HOME ?? join(home, '.config'))
  return [join(base, 'Terminal Canvas'), join(base, 'terminal-canvas')]
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/* The records from every day file in `dir` that falls on or after `sinceMs`'s day. */
function readLog(E, dir, sinceMs) {
  const records = []
  let skipped = 0
  let files = 0
  if (!existsSync(dir)) return { records, skipped, files }
  const pad = (n) => String(n).padStart(2, '0')
  const d = new Date(sinceMs)
  const since = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  for (const name of readdirSync(dir).sort()) {
    const m = /^(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(name)
    if (!m || m[1] < since) continue
    files++
    const parsed = E.parseEventLog(readFileSync(join(dir, name), 'utf8'))
    skipped += parsed.skipped
    for (const r of parsed.records) if (r.t >= sinceMs) records.push(r)
  }
  return { records, skipped, files }
}

function report(E, summary, meta) {
  const f = E.formatDuration
  const n = summary.needsYou
  const pct = (x) => (x === null ? 'n/a' : `${Math.round(x * 100)}%`)
  const lines = [
    `Event log: ${meta.files} day file(s) in ${meta.dir}`,
    `Covers ${summary.days} day(s), ${summary.sessions} session(s), app running ${f(summary.runningMs)}`,
    '',
    'Needs you',
    `  Asks: ${n.total} (answered ${n.answered.count}, panel ended first ${n.ended}, withdrawn ${n.dropped}, still waiting at close ${n.open})`,
    `  Time to answer: median ${f(n.answered.medianMs)}, p90 ${f(n.answered.p90Ms)}`,
    `  When you were in the app: median ${f(n.answeredWhileIn.medianMs)} over ${n.answeredWhileIn.count}`,
    `  When you were away: median ${f(n.answeredWhileAway.medianMs)} over ${n.answeredWhileAway.count}`,
    `  Share of waiting spent with the app out of focus: ${pct(n.awayShareOfWait)}`,
    `  Answered by a session grant, nobody waited: ${n.autoAllowed}`,
    '',
    'Focus',
    `  In the app ${f(summary.focusedMs)}, away ${f(summary.awayMs)}`,
    `  Switches to another app: ${summary.switches} (${summary.switchesPerFocusedHour === null ? 'n/a' : summary.switchesPerFocusedHour.toFixed(1)} per hour in the app)`,
    '',
    'Chats',
    `  Turn finished to your next message: median ${f(summary.nextInstruction.medianMs)}, p90 ${f(summary.nextInstruction.p90Ms)} over ${summary.nextInstruction.count}`,
    '',
    'Panels',
    `  At the last save: ${Object.entries(summary.panels.last).map(([k, v]) => `${k} ${v}`).join(', ') || 'none recorded'}`,
    `  Most at once: ${summary.panels.peakTotal}`
  ]
  if (summary.capped > 0) lines.push('', `Note: ${summary.capped} day(s) reached the size cap, so those days are incomplete.`)
  if (meta.skipped > 0) lines.push('', `Note: ${meta.skipped} line(s) were not in a format this version reads and were skipped.`)
  return lines.join('\n')
}

function main() {
  const E = loadEventLog()
  const days = Number(arg('--days', '7'))
  const sinceMs = Date.now() - (Number.isFinite(days) && days > 0 ? days : 7) * 86_400_000
  const explicit = arg('--log-dir', null)
  const dir = explicit ?? userDataCandidates().map((d) => join(d, 'event-log')).find((d) => existsSync(d)) ?? join(userDataCandidates()[0], 'event-log')
  const meta = { dir, ...readLog(E, dir, sinceMs) }
  if (meta.files === 0) {
    console.log(`No event log found in ${dir}.\nTurn on Settings > Privacy & telemetry > Keep a usage log on this Mac, use the app for a while, then run this again.`)
    process.exit(0)
  }
  const summary = E.summarizeEvents(meta.records)
  if (process.argv.includes('--json')) console.log(JSON.stringify({ dir, files: meta.files, skipped: meta.skipped, summary }, null, 2))
  else console.log(report(E, summary, meta))
}

if (require.main === module) main()
module.exports = { loadEventLog, readLog, report, userDataCandidates }
