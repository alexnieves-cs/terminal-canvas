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
      import { restoreLines, splashShouldLeave, ghostLayout } from '../src/renderer/canvas/splash'
      import { skipRemaining, publishBootProgress } from '../src/main/bootstrap/boot-progress'
      import { readyLabel, agentRows, installCommand, sessionsPersistence, FIRST_TASK_HANDOFF, ONBOARDING_FOOTER, AGENTS_STEP_TITLE } from '../src/shared/onboarding'
      import { classifyBinaryProbe, versionWords, probeWithin, BINARY_PROBE_TIMEOUT_MS } from '../src/shared/env-report'
      import { discoverBinary } from '../src/main/env-report'
      import { presetsFromEnabledAgents } from '../src/main/presets'
      import { blankCanvasTitle, repoChipLabel, GHOST_TARGET, BLANK_CANVAS_PURPOSE } from '../src/shared/empty-states'
      import { EMPTY_CANVAS_GESTURES } from '../src/renderer/canvas/hints'
      import { STARTER_LAYOUTS, starterLayoutAction } from '../src/shared/lineups'
      import { blankTaskVerb } from '../src/renderer/palette/start-work'
      export {
        restoreLines, splashShouldLeave, ghostLayout, skipRemaining, publishBootProgress,
        readyLabel, agentRows, installCommand, sessionsPersistence, FIRST_TASK_HANDOFF, ONBOARDING_FOOTER, AGENTS_STEP_TITLE,
        classifyBinaryProbe, versionWords, probeWithin, BINARY_PROBE_TIMEOUT_MS, discoverBinary, presetsFromEnabledAgents,
        blankCanvasTitle, repoChipLabel, GHOST_TARGET, BLANK_CANVAS_PURPOSE, EMPTY_CANVAS_GESTURES, STARTER_LAYOUTS, starterLayoutAction, blankTaskVerb
      }
      export const keep = { readyLabel, agentRows, installCommand, sessionsPersistence, FIRST_TASK_HANDOFF, ONBOARDING_FOOTER, AGENTS_STEP_TITLE, classifyBinaryProbe, versionWords, probeWithin, BINARY_PROBE_TIMEOUT_MS, discoverBinary, presetsFromEnabledAgents, blankCanvasTitle, repoChipLabel, GHOST_TARGET, BLANK_CANVAS_PURPOSE, EMPTY_CANVAS_GESTURES, STARTER_LAYOUTS, starterLayoutAction, blankTaskVerb }
    `,
    resolveDir: __dirname,
    sourcefile: 'rd-l-a-entry.ts',
    loader: 'ts'
  },
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
  alias: {
    '@shared': join(ROOT, 'src/shared'),
    '@renderer': join(ROOT, 'src/renderer')
  }
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

/* M440. Watched red: a one-off esbuild of `import { readyLabel }` reported
   "No matching export in onboarding.ts" and exited 1. A bare `export { missing }`
   in this entry was dropped without that error, so `keep` names the binding. */
{
  const found = M.agentRows([
    { id: 'claude', path: '/opt/homebrew/bin/claude', version: '2.1.19' },
    { id: 'codex', path: '/opt/homebrew/bin/codex', version: '0.98.0' },
    { id: 'gemini', path: null, timedOut: false }
  ], ['claude', 'codex'])
  const silent = M.agentRows([{ id: 'gemini', path: null, timedOut: true }], ['gemini'])
  const gemini = found.rows.find((row) => row.id === 'gemini')
  const codex = found.rows.find((row) => row.id === 'codex')
  ok('rd-onboard.rows.1 a found agent shows its path and version; a missing one is not installed; a timeout is not called missing; plain shell stays on and does not count',
    found.rows.map((row) => row.id).join(',') === 'claude,codex,gemini' &&
      codex.phase === 'found' && codex.status === 'found' && codex.path === '/opt/homebrew/bin/codex' && codex.version === '0.98.0' &&
      gemini.phase === 'missing' && gemini.status === 'not installed' && gemini.path === undefined &&
      silent.rows.find((row) => row.id === 'gemini').status === 'discovery did not answer' &&
      found.shell.locked === true && found.shell.enabled === true && found.shell.id === 'shell' &&
      M.AGENTS_STEP_TITLE === 'Which agents live on your canvas?',
    JSON.stringify(found.rows.map((row) => row.status)))
}

{
  ok('rd-onboard.ready.1 the ready count never reads 0; none says turn one on, and a missing agent that is toggled still does not count',
    M.readyLabel(0) === 'Turn one on to continue' && M.readyLabel(1) === '1 agent ready' && M.readyLabel(2) === '2 agents ready' &&
      !String(M.readyLabel(0)).includes('0') &&
      M.agentRows([{ id: 'gemini', path: null, timedOut: false }], ['gemini']).ready === 0 &&
      M.agentRows([{ id: 'claude', path: '/bin/claude', version: '2.1.19' }], ['claude']).canContinue === true &&
      M.ONBOARDING_FOOTER === 'You can change all of this later in Settings. Nothing runs until you start it.',
    M.readyLabel(0))
}

{
  const onboardingUi = readFileSync(join(ROOT, 'src', 'renderer', 'onboarding', 'Onboarding.tsx'), 'utf8')
  const envMain = readFileSync(join(ROOT, 'src', 'main', 'env-report.ts'), 'utf8')
  ok('rd-onboard.copy.1 the install command is a string the button copies; the onboarding tree and discoverBinary do not spawn',
    M.installCommand('gemini') === 'npm install -g @google/gemini-cli' && M.installCommand('shell') === null &&
      /data-copy-install/.test(onboardingUi) && !/child_process|\bspawn\s*\(|\bexec(?:File|Sync)?\s*\(|pty:create/.test(onboardingUi) &&
      !/child_process/.test(envMain),
    M.installCommand('gemini'))
}

{
  const both = M.presetsFromEnabledAgents([{ id: 'claude', label: 'Claude Code' }, { id: 'codex', label: 'Codex CLI' }])
  const gemini = M.presetsFromEnabledAgents([{ id: 'gemini', label: 'Gemini CLI', command: 'gemini' }])
  const none = M.presetsFromEnabledAgents([])
  ok('rd-onboard.preset.1 the first enabled agent is the ⌘N preset; none leaves the login shell; gemini carries no agent kind',
    both.defaultId === 'claude' && both.presets[0].agent === 'claude-code' && both.presets[1].agent === 'codex' &&
      gemini.defaultId === 'gemini' && gemini.presets[0].agent === undefined && gemini.presets[0].command === 'gemini' &&
      none.defaultId === 'shell' && none.presets.length === 0,
    JSON.stringify({ both: both.defaultId, gemini: gemini.presets[0], none: none.defaultId }))
}

{
  const unknown = M.sessionsPersistence(undefined)
  const held = M.sessionsPersistence({ path: '/opt/homebrew/bin/tmux' })
  const absent = M.sessionsPersistence({ path: null })
  ok('rd-onboard.handoff.1 step 4 names the start-work sheet and does not spawn; an unanswered tmux probe does not claim it is installed',
    M.FIRST_TASK_HANDOFF.sheet === 'start-work' && M.FIRST_TASK_HANDOFF.spawns === false &&
      unknown.known === false && unknown.persist === false && !/installed/.test(unknown.sentence) &&
      held.persist === true && /survive quit/.test(held.sentence) &&
      absent.persist === false && /until tmux is installed/.test(absent.sentence),
    JSON.stringify({ unknown, held, absent, handoff: M.FIRST_TASK_HANDOFF }))
}

{
  const layouts = M.STARTER_LAYOUTS.map((row) => row.id).join(',')
  const idle = M.starterLayoutAction('pair-tests', false)
  const clicked = M.starterLayoutAction('pair-tests', true)
  ok('rd-empty.layouts.1 three starter layouts stay inert until clicked, and they are not the lineup ids',
    layouts === 'pair-tests,two-agent,solo-shell' &&
      M.STARTER_LAYOUTS.every((row) => typeof row.sentence === 'string' && row.sentence.length > 12) &&
      idle.places === false && clicked.places === true &&
      M.starterLayoutAction('nope', true).places === false,
    JSON.stringify({ layouts, idle, clicked }))
}

{
  const hints = M.EMPTY_CANVAS_GESTURES.map((row) => row.text).join('|')
  ok('rd-empty.hints.1 the empty canvas says space-drag to pan and command-scroll to zoom, and the ghost target names a double-click',
    hints === 'Space + drag to pan|⌘ + scroll to zoom' && M.GHOST_TARGET === 'Double-click to place a terminal',
    hints)
}

{
  const named = M.blankCanvasTitle('steward')
  const unnamed = M.blankCanvasTitle('  ')
  const emptyVerb = M.blankTaskVerb('')
  const readyVerb = M.blankTaskVerb('Explain the deploy')
  ok('rd-empty.title.1 the title names the workspace when there is one, the purpose is one sentence, and an empty task cannot start',
    named === 'A blank canvas for steward' && unnamed === 'A blank canvas' &&
      M.BLANK_CANVAS_PURPOSE === 'Describe a task and an agent will take it from here — or start something smaller.' &&
      M.repoChipLabel('') === 'no repository chosen' && M.repoChipLabel('steward') === 'steward' &&
      emptyVerb.enabled === false && emptyVerb.label === 'Start task' && emptyVerb.reason === 'Describe the task first' &&
      readyVerb.enabled === true && readyVerb.reason === undefined,
    JSON.stringify({ named, unnamed, emptyVerb, readyVerb }))
}

{
  const emptySrc = readFileSync(join(ROOT, 'src', 'renderer', 'shell', 'EmptyState.tsx'), 'utf8')
  const states = readFileSync(join(ROOT, 'src', 'shared', 'empty-states.ts'), 'utf8')
  ok('rd-empty.verb.1 the minimap sentence is Nothing placed yet and the blank canvas reads it by name; quick spawns are buttons, not a pty',
    /id: 'minimap', sentence: 'Nothing placed yet'/.test(states) && emptySrc.includes("emptyState('minimap')") &&
      /Claude Code/.test(emptySrc) && /Import a layout/.test(emptySrc) &&
      !/child_process|pty:create|\bspawn\s*\(/.test(emptySrc),
    'minimap sentence rendered from emptyState')
}

{
  const manual = { fired: false, id: 1, fn: () => {}, set(fn) { this.fn = fn; return this.id }, clear() { this.fn = () => {} }, fire() { this.fired = true; this.fn() } }
  const raced = M.probeWithin(new Promise(() => {}), M.BINARY_PROBE_TIMEOUT_MS, manual)
  manual.fire()
  const answered = M.probeWithin(Promise.resolve('/bin/codex'), 5000, { set() { return 1 }, clear() {} })
  Promise.all([raced, answered]).then(async ([slow, path]) => {
    const found = await M.discoverBinary('codex', () => '/opt/homebrew/bin/codex', () => '0.98.0', 5000, { set() { return 1 }, clear() {} })
    const hungTimer = { fn: () => {}, set(fn) { this.fn = fn; return 1 }, clear() {}, fire() { this.fn() } }
    const pending = M.discoverBinary('gemini', () => new Promise(() => {}), () => null, 5000, hungTimer)
    hungTimer.fire()
    const hung = await pending
    ok('rd-onboard.probe.1 a timeout is unknown, a null path is missing, and discoverBinary reports the path it was given without spawning',
      M.classifyBinaryProbe({ path: null, timedOut: true }) === 'unknown' &&
        M.classifyBinaryProbe({ path: null }) === 'missing' &&
        M.classifyBinaryProbe({ path: '/opt/homebrew/bin/codex' }) === 'found' &&
        M.versionWords(null) === 'version unknown' && M.versionWords('0.98.0') === '0.98.0' &&
        M.BINARY_PROBE_TIMEOUT_MS === 5000 &&
        slow.timedOut === true && path === '/bin/codex' &&
        found.path === '/opt/homebrew/bin/codex' && found.version === '0.98.0' && found.timedOut === false &&
        hung.timedOut === true && hung.path === null,
      JSON.stringify({ slow, found, hung }))
    const passed = results.filter((r) => r.pass).length
    console.log('\n' + passed + '/' + results.length + ' passed')
    if (results.some((r) => !r.pass)) process.exitCode = 1
  }).catch((error) => {
    console.log('FAIL  rd-onboard.probe.1 threw — ' + (error && error.stack ? error.stack : error))
    process.exitCode = 1
  })
}
