/* Phase 0 seam for lane L-A. The lane replaces the body. This check only
   proves the seam is present, so the suite is registered before any feature
   code. Ids stay scoped: keep rd-l-a.0 green when you add the real checks. */
'use strict'
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { ok, results } = require('./lib/checks.cjs').createChecks()

const ROOT = join(__dirname, '..')
const css = readFileSync(join(ROOT, 'src', 'renderer', 'styles.css'), 'utf8')
const contracts = readFileSync(join(ROOT, 'src', 'shared', 'redesign-contracts.ts'), 'utf8')
const own = JSON.parse(readFileSync(join(ROOT, 'docs', 'redesign', 'ownership.json'), 'utf8'))
const open = '/* ── rd:L-A ── */'
const close = '/* ── /rd:L-A ── */'
ok('rd-l-a.0 seam present',
  css.includes(open) && css.indexOf(close) > css.indexOf(open) &&
  /export type StateTone/.test(contracts) &&
  Array.isArray(own.lanes['L-A']) && own.lanes['L-A'].some((g) => g.endsWith('verify-rd-l-a.cjs')),
  'styles.css markers, redesign-contracts StateTone, ownership entry')

/* M439. Watched red before restoreLines existed: esbuild failed to export it
   and the suite exited 1. The four checks below are the restore contract. */
const { buildSync } = require('esbuild')
const OUT = join(ROOT, 'out', 'verify', 'rd-l-a.cjs')
buildSync({
  stdin: {
    contents: `
      export { restoreLines, splashShouldLeave, ghostLayout } from '../src/renderer/canvas/splash'
      export { skipRemaining, publishBootProgress } from '../src/main/bootstrap/boot-progress'
    `,
    resolveDir: __dirname,
    sourcefile: 'rd-l-a-entry.ts',
    loader: 'ts'
  },
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent'
})
const M = require(OUT)

{
  const none = M.restoreLines({})
  const frozen = M.restoreLines({
    workspace: { name: 'steward', path: '~/code/steward' },
    layout: { tasks: 2, objects: 9 },
    tmux: { done: 3, total: 5 },
    agentsPlanned: ['claude', 'codex']
  })
  const byId = (view, id) => view.lines.find((line) => line.id === id)
  const tmux = byId(frozen, 'tmux')
  const agents = byId(frozen, 'agents')
  const layout = byId(frozen, 'layout')
  const unmeasured = M.restoreLines({ tmux: { done: 3, total: 5 } })
  ok('rd-restore.lines.1 four lines stay pending until measured; a partial reattach says 3 of 5 and does not invent an agent result',
    none.lines.map((line) => line.id).join(',') === 'workspace,layout,tmux,agents' &&
      none.lines.every((line) => line.phase === 'pending' && line.detail === undefined) &&
      none.settled === false && none.breathing === false &&
      byId(frozen, 'workspace').phase === 'done' && byId(frozen, 'workspace').detail === '~/code/steward' &&
      layout.phase === 'done' && layout.detail === '2 tasks, 9 objects' &&
      tmux.phase === 'active' && tmux.detail === '3 of 5' && frozen.breathing === true &&
      agents.phase === 'pending' && agents.detail === 'claude, codex' && agents.found === undefined &&
      unmeasured.lines.filter((line) => line.id !== 'tmux').every((line) => line.phase === 'pending') &&
      M.restoreLines({ layout: { tasks: 0, objects: 0 } }).lines.find((line) => line.id === 'layout').detail === 'no tasks, no objects',
    JSON.stringify(frozen.lines))
}

{
  const panes = [{ panelId: 'a', pid: 11, reattached: true }, { panelId: 'b', pid: 22, reattached: false }]
  const held = M.skipRemaining(panes, true)
  const idle = M.skipRemaining(panes, false)
  ok('rd-restore.skip.1 holding Option marks the panes not yet reattached asleep and never kills one; every pid survives',
    held.killed.length === 0 && idle.killed.length === 0 &&
      held.panes.map((pane) => pane.pid).join(',') === '11,22' &&
      held.panes.find((pane) => pane.panelId === 'a').asleep === false &&
      held.panes.find((pane) => pane.panelId === 'b').asleep === true &&
      idle.panes.every((pane) => pane.asleep === false) &&
      M.restoreLines({ workspace: { name: 's', path: '/s' }, layout: { tasks: 1, objects: 1 }, tmux: { done: 3, total: 5 }, optionHeld: true, agentsFound: ['claude'] }).lines.find((line) => line.id === 'tmux').phase === 'skipped',
    JSON.stringify(held))
}

{
  const failed = M.restoreLines({ failed: { step: 'layout', sentence: 'the layout file could not be read' }, reducedMotion: true })
  const ghosts = M.ghostLayout([{ x: 10, y: 20, w: 100, h: 40 }])
  ok('rd-restore.leave.1 a failed step settles with no spinner; reduced motion does not breathe; the splash leaves as soon as it is settled; ghost frames are the rects given',
    failed.failed === true && failed.settled === true && failed.breathing === false &&
      failed.lines.find((line) => line.id === 'layout').phase === 'failed' &&
      failed.lines.find((line) => line.id === 'tmux').phase === 'pending' &&
      M.splashShouldLeave({ settled: true, shownForMs: 0 }) === true &&
      M.splashShouldLeave({ settled: false, shownForMs: 60000 }) === false &&
      ghosts.length === 1 && ghosts[0].w === 100 && M.ghostLayout(undefined).length === 0,
    JSON.stringify({ failed: failed.lines.map((line) => line.phase), ghosts }))
}

{
  const contract = readFileSync(join(ROOT, 'src', 'shared', 'ipc-contract.ts'), 'utf8')
  const claude = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8')
  const events = contract.split('export const IPC_EVENTS')[1] || ''
  const invokes = contract.split('export const IPC_EVENTS')[0]
  const sent = []
  M.publishBootProgress((channel, payload) => { sent.push([channel, payload.step]) }, { step: 'tmux', tmux: { done: 3, total: 5 } })
  ok('rd-restore.channel.1 boot:progress is a send on IPC_EVENTS, named in CLAUDE.md, and not an invoke',
    /BOOT_PROGRESS: 'boot:progress'/.test(events) && claude.includes('boot:progress') &&
      !/BOOT_PROGRESS: 'boot:progress'/.test(invokes) && sent[0] && sent[0][0] === 'boot:progress' && sent[0][1] === 'tmux',
    JSON.stringify(sent))
}

const passed = results.filter((r) => r.pass).length
console.log('\n' + passed + '/' + results.length + ' passed')
if (results.some((r) => !r.pass)) process.exitCode = 1
