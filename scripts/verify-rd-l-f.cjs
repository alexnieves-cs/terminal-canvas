/* Lane L-F (M447). Plain node. Ids stay scoped.

   rd-l-f.0 stays: the seam (markers, contracts, ownership) is still the
   registration proof.

   Watched red before src/shared/exit-explain.ts existed: esbuild failed to
   resolve that entry, the suite threw, and the process status was 1. The
   comment at the load below is the restore. */
'use strict'
const { existsSync, readFileSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')
const { spawnSync } = require('node:child_process')
const { buildSync } = require('esbuild')
const { ok, results } = require('./lib/checks.cjs').createChecks()
const { verifySocket } = require('./verify-socket.cjs')

const ROOT = join(__dirname, '..')
const read = (rel) => {
  const p = join(ROOT, rel)
  return existsSync(p) ? readFileSync(p, 'utf8') : ''
}

const css = read('src/renderer/styles.css')
const contracts = read('src/shared/ipc-contract.ts')
const redesign = read('src/shared/redesign-contracts.ts')
const own = JSON.parse(read('docs/redesign/ownership.json') || '{}')
const claude = read('CLAUDE.md')
const open = '/* ── rd:L-F ── */'
const close = '/* ── /rd:L-F ── */'
ok('rd-l-f.0 seam present',
  css.includes(open) && css.indexOf(close) > css.indexOf(open) &&
  /export type StateTone/.test(redesign) &&
  Array.isArray(own.lanes['L-F']) && own.lanes['L-F'].some((g) => g.endsWith('verify-rd-l-f.cjs')),
  'styles.css markers, redesign-contracts StateTone, ownership entry')

const OUT = join(ROOT, 'out', 'verify')
mkdirSync(OUT, { recursive: true })
buildSync({
  entryPoints: [join(ROOT, 'src', 'shared', 'exit-explain.ts')],
  outfile: join(OUT, 'rd-l-f-exit.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent'
})
const M = require(join(OUT, 'rd-l-f-exit.cjs'))

ok('rd-l-f.exit.1 137 is memory pressure, and 130, 143, 127 and a generic code each say a different thing',
  M.explainExit(137) === 'killed, usually by memory pressure' &&
  M.explainExit(130) === 'stopped by an interrupt' &&
  M.explainExit(143) === 'stopped by a termination signal' &&
  M.explainExit(127) === 'the command was not found' &&
  M.explainExit(1) === 'ended with status 1' &&
  M.explainExit(null) === 'ended without a reported status' &&
  M.explainExit(undefined) === 'ended without a reported status',
  JSON.stringify([M.explainExit(137), M.explainExit(130), M.explainExit(143), M.explainExit(127), M.explainExit(1), M.explainExit(null)]))

ok('rd-l-f.answer.1 a zero exit is an answer, and a missing server or a timeout is not',
  M.listAnswered(0, '') === true &&
  M.listAnswered(1, 'error connecting to /tmp/tmux-1/terminal-canvas-verify-l-f (No such file or directory)') === false &&
  M.listAnswered(1, 'no server running on /tmp/tmux-1/terminal-canvas-verify-l-f') === false &&
  M.listAnswered(null, '') === false &&
  M.listAnswered(1, 'ambiguous option') === true,
  'format errors are not host loss')

const panes = [{ panelId: 'a', pid: 11 }, { panelId: 'b', pid: 22 }, { panelId: 'c', pid: 33 }, { panelId: 'd', pid: 44 }]
let host = M.initialHost()
host = M.reduceHost(host, { type: 'sample', at: 0, answered: true, panes })
const early = M.reduceHost(host, { type: 'sample', at: 1000, answered: false, panes: [] })
const silentAt = 1000 + M.HOST_SILENT_MS
host = M.reduceHost(early, { type: 'sample', at: silentAt, answered: false, panes: [] })
const banner = M.hostBanner(host.paused.length)
const retry = M.retryLabel(host.retryAt, silentAt)
ok('rd-l-f.host.1 twenty seconds of silence pauses the last live panes, and one missed sample does not',
  early.phase === 'live' && early.paused.length === 0 &&
  host.phase === 'paused' && host.paused.length === 4 &&
  host.paused.every((p, i) => p.panelId === panes[i].panelId && p.pid === panes[i].pid) &&
  banner === "Session host stopped responding. tmux server on this Mac didn't answer for 20s. 4 sessions are paused, not lost — their output is buffered." &&
  retry === 'Retrying in 8s' &&
  M.HOST_RETRY_MS === 8000 && M.HOST_SILENT_MS === 20000,
  JSON.stringify({ phase: host.phase, n: host.paused.length, banner, retry }))

const reattaching = M.reduceHost(host, { type: 'reconnect', at: M.HOST_SILENT_MS + 1 })
const back = M.reduceHost(reattaching, {
  type: 'sample',
  at: M.HOST_SILENT_MS + 2,
  answered: true,
  panes: [{ panelId: 'a', pid: 11 }, { panelId: 'c', pid: 99 }],
  exits: [{ panelId: 'b', code: 137 }, { panelId: 'd', code: null }]
})
ok('rd-l-f.host.2 a retry keeps the same pane pid and ends the panes tmux did not keep',
  reattaching.phase === 'reattaching' &&
  back.phase === 'paused' &&
  back.paused.some((p) => p.panelId === 'a' && p.pid === 11) &&
  back.paused.length === 1 &&
  back.ended.some((p) => p.panelId === 'b' && p.code === 137) &&
  back.ended.some((p) => p.panelId === 'c' && p.code === null) &&
  back.ended.some((p) => p.panelId === 'd') &&
  !back.ended.some((p) => p.panelId === 'a') &&
  M.explainExit(137) === 'killed, usually by memory pressure',
  JSON.stringify({ phase: back.phase, paused: back.paused, ended: back.ended }))

const crashed = M.reduceRecovery(M.initialRecovery(), { type: 'crashed', at: 5, panelId: 'steward', code: 137, prompt: 'ship the ledger' })
const view = M.viewOf(crashed, 5)
ok('rd-l-f.crash.1 an unexpected end keeps the panel id and says what the code means and what was kept',
  view.crashes.length === 1 &&
  view.crashes[0].panelId === 'steward' &&
  M.restartKeepsPanel(view.crashes[0].panelId) === 'steward' &&
  view.crashes[0].title === 'This session ended unexpectedly' &&
  view.crashes[0].explain === 'killed, usually by memory pressure' &&
  view.crashes[0].kept === 'The pending edit was not applied' &&
  view.crashes[0].restart === 'Restart with last prompt' &&
  view.crashes[0].log === 'Read log' &&
  view.crashes[0].prompt === 'ship the ledger' &&
  M.keystrokesBlocked('paused') === true &&
  M.keystrokesBlocked('crashed') === false &&
  M.keystrokesBlocked('live') === false,
  JSON.stringify(view.crashes[0]))

const pausedView = M.viewOf(M.recoveryFromHost(host), silentAt)
ok('rd-l-f.pause.1 a paused panel says output was kept and that typing waits',
  pausedView.paused.length === 4 &&
  pausedView.paused.every((p) => p.line === 'paused · output kept' && p.keys === 'nothing you type is lost or sent twice') &&
  pausedView.reconnect === 'Reconnect now' &&
  pausedView.details === 'Details' &&
  M.frameVariant(host, 'a', []) === 'paused' &&
  M.frameVariant(reattaching, 'a', []) === 'reattaching',
  JSON.stringify(pausedView.paused[0]))

ok('rd-l-f.pill.1 recovery and paused are one sentence ending in Review',
  M.recoveryPillLine(2, 4) === '2 sessions need recovery · 4 paused · Review' &&
  M.recoveryPillLine(1, 0) === '1 session needs recovery · Review' &&
  M.recoveryPillLine(0, 1) === '1 paused · Review' &&
  M.recoveryPillLine(0, 0) === '',
  M.recoveryPillLine(2, 4))

ok('rd-l-f.offline.1 cached data names the clock, and the toast says what keeps working',
  M.offlineLine('7:22 PM') === 'offline · cached · last updated 7:22 PM' &&
  M.offlineToast('GitHub').sentence === 'GitHub is offline' &&
  M.offlineToast('GitHub').detail === 'The canvas, terminals and notes keep working. Cached data stays marked until the connection returns.' &&
  M.offlineToast('GitHub').outcome === 'failed' &&
  /needs you|need you/.test(M.offlineToast('GitHub').sentence + M.offlineToast('GitHub').detail) === false,
  M.offlineToast('GitHub').detail)

const catalog = M.catalogView({
  paused: panes,
  reattaching: [{ panelId: 'ghost' }],
  crashes: [{ panelId: 'steward', code: 137, prompt: 'ship the ledger' }, { panelId: 'other', code: 1, prompt: null }],
  offline: [{ source: 'github', lastUpdated: '7:22 PM' }],
  bootIssue: 'The layout could not be read. A fresh canvas is open.',
  retryInMs: 8000
})
ok('rd-l-f.catalog.1 the shot can show a host loss, an exit 137, a skeleton and a cached clock together',
  catalog.banner === banner &&
  catalog.retry === 'Retrying in 8s' &&
  catalog.reattaching.length === 1 &&
  catalog.crashes[0].explain === 'killed, usually by memory pressure' &&
  catalog.offline[0].line === 'offline · cached · last updated 7:22 PM' &&
  catalog.pill === '2 sessions need recovery · 4 paused · Review' &&
  catalog.bootIssue === 'The layout could not be read. A fresh canvas is open.',
  catalog.pill)

ok('rd-l-f.boot.1 the first boot issue is the 09 sentence',
  M.bootIssueSentence(['The layout could not be read. A fresh canvas is open.', 'second']) === 'The layout could not be read. A fresh canvas is open.' &&
  M.bootIssueSentence([]) === null &&
  M.bootIssueSentence(['  ']) === null,
  M.bootIssueSentence(['The layout could not be read. A fresh canvas is open.']))

const span = css.slice(css.indexOf(open), css.indexOf(close))
const slotMetric = /\.(?:panel__slot|xterm|pf__body|pf__keep)[^{]*\{[^}]*(?:width|height|padding|margin)\s*:/.test(span)
ok('rd-l-f.well.1 the lane span does not set a box metric on the terminal well',
  span.includes('.recovery-host') && slotMetric === false &&
  !/#[0-9a-fA-F]{3,8}/.test(span),
  slotMetric ? 'well metric' : 'clean')

const hostUi = read('src/renderer/panels/RecoveryHost.tsx')
const reopen = read('src/renderer/shell/ReopenNotice.tsx')
const backend = read('src/main/session-backend.ts')
ok('rd-l-f.mount.1 the 09 surface reads the view, and a boot issue is marked on the reopen line',
  hostUi.includes('data-recovery-host') &&
  hostUi.includes('data-recovery-skeleton') &&
  hostUi.includes('data-recovery-restart') &&
  hostUi.includes('data-keys-blocked') &&
  hostUi.includes('view.banner') &&
  hostUi.includes('restartKeepsPanel') &&
  reopen.includes('data-boot-issue') &&
  /setInterval/.test(backend) === false &&
  backend.includes('listAnswered') &&
  backend.includes('reduceHost'),
  'source')

ok('rd-l-f.channel.1 session:host is an event in the contract and in CLAUDE.md',
  /SESSION_HOST:\s*'session:host'/.test(contracts) &&
  claude.includes('session:host') &&
  backend.includes('sendHostReport'),
  'channel')

const shot = read('scripts/shot-scenes/rd-l-f.cjs')
ok('rd-l-f.shot.1 rd-recovery has a run and names mockup 09',
  /name:\s*'rd-recovery'/.test(shot) &&
  shot.includes('09-error-disconnected.png') &&
  /run:\s*async/.test(shot) &&
  shot.includes('__rdLF'),
  'shot')

const socket = verifySocket('terminal-canvas-verify-l-f')
const killArgs = ['-L', socket, 'kill-server']
ok('rd-l-f.socket.1 kill-server is aimed at the L-F verify socket and not the default one',
  socket.includes('verify') &&
  socket !== 'terminal-canvas' &&
  socket !== 'terminal-canvas-app' &&
  !socket.includes('/') &&
  killArgs[0] === '-L' && killArgs[1] === socket && killArgs[2] === 'kill-server',
  socket)

const which = spawnSync('which', ['tmux'], { encoding: 'utf8' })
const tmux = which.status === 0 ? which.stdout.trim() : ''
if (tmux === '') {
  ok('rd-l-f.kill.1 a verify-socket kill pauses, then a retry ends the panes the server did not keep',
    false,
    'tmux is not installed, so the server was not killed')
} else {
  const run = (args) => spawnSync(tmux, ['-L', socket, ...args], { encoding: 'utf8', timeout: 8000 })
  const locked = (args) => spawnSync(join(ROOT, 'scripts', 'redesign', 'with-electron-lock.sh'), [tmux, '-L', socket, ...args], { encoding: 'utf8', timeout: 20000 })
  let detail = 'ok'
  let pass = false
  try {
    run(['kill-server'])
    const started = run(['start-server'])
    const madeA = run(['new-session', '-d', '-s', 'lf-a', 'sleep', '60'])
    const madeB = run(['new-session', '-d', '-s', 'lf-b', 'sleep', '60'])
    const listed = run(['list-panes', '-a', '-F', '#{session_name}\t#{pane_pid}'])
    const rows = listed.stdout.trim().split('\n').filter(Boolean).map((line) => {
      const [name, pid] = line.split('\t')
      return { panelId: name, pid: Number(pid) }
    })
    const liveA = rows.find((r) => r.panelId === 'lf-a')
    const liveB = rows.find((r) => r.panelId === 'lf-b')
    const killed = locked(['kill-server'])
    const after = run(['list-panes', '-a', '-F', '#{session_name}\t#{pane_pid}'])
    const answered = M.listAnswered(after.status === 0 ? 0 : (after.status ?? null), `${after.stderr || ''}\n${after.stdout || ''}`)
    // kill-server destroys every pane, so a restarted session has a new pid.
    // The same-pid arm is rd-l-f.host.2. Here both original pids have ended.
    const known = liveA !== undefined && liveB !== undefined ? [liveA, liveB] : []
    const pausedFirst = M.reduceHost(
      M.reduceHost(M.initialHost(), { type: 'sample', at: 0, answered: true, panes: known }),
      { type: 'sample', at: 1, answered: false, panes: [] }
    )
    const paused = M.reduceHost(pausedFirst, { type: 'sample', at: 1 + M.HOST_SILENT_MS, answered: false, panes: [] })
    run(['start-server'])
    const again = run(['new-session', '-d', '-s', 'lf-a', 'sleep', '60'])
    const listed2 = run(['list-panes', '-a', '-F', '#{session_name}\t#{pane_pid}'])
    const rows2 = listed2.status === 0
      ? listed2.stdout.trim().split('\n').filter(Boolean).map((line) => {
        const [name, pid] = line.split('\t')
        return { panelId: name, pid: Number(pid) }
      }).filter((r) => r.panelId === 'lf-a' || r.panelId === 'lf-b')
      : []
    const recovered = M.reduceHost(paused, { type: 'sample', at: 2 + M.HOST_SILENT_MS, answered: listed2.status === 0, panes: rows2 })
    pass = started.status === 0 && madeA.status === 0 && madeB.status === 0 &&
      liveA !== undefined && liveB !== undefined &&
      killed.status === 0 && answered === false &&
      paused.phase === 'paused' &&
      paused.paused.some((p) => p.panelId === 'lf-a' && p.pid === liveA.pid) &&
      paused.paused.some((p) => p.panelId === 'lf-b' && p.pid === liveB.pid) &&
      recovered.ended.some((p) => p.panelId === 'lf-a' && p.pid === liveA.pid) &&
      recovered.ended.some((p) => p.panelId === 'lf-b' && p.pid === liveB.pid) &&
      again.status === 0
    detail = JSON.stringify({
      socket, killed: killed.status, answered, paused: paused.phase,
      ended: recovered.ended, rows2, again: again.status
    })
  } finally {
    locked(['kill-server'])
  }
  ok('rd-l-f.kill.1 a verify-socket kill pauses, then a retry ends the panes the server did not keep',
    pass, detail)
}

const passed = results.filter((r) => r.pass).length
console.log('\n' + passed + '/' + results.length + ' passed')
if (results.some((r) => !r.pass)) process.exitCode = 1
