/* The UX pass after 6.0 (notes/ux-proposals.md): first-run doors that were
   wired to nothing, one name per thing, and the loop after an agent runs.
   Plain node. Pure modules are bundled; the wiring that lives in Canvas.tsx
   is read as text, because a callback that was never passed renders a
   button that does nothing and no other suite would notice. Ids are scoped
   (`ux.<area>.<n>`). */
'use strict'
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { buildSync } = require('esbuild')
const { ok, results } = require('./lib/checks.cjs').createChecks()

const ROOT = join(__dirname, '..')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const OUT = join(ROOT, 'out', 'verify', 'ux.cjs')
buildSync({
  stdin: {
    contents: `
      import { probesFromReport, foundAgentIds, agentRows } from '../src/shared/onboarding'
      import { STARTER_LAYOUTS, LINEUP_IDS } from '../src/shared/lineups'
      export { probesFromReport, foundAgentIds, agentRows, STARTER_LAYOUTS, LINEUP_IDS }
    `,
    resolveDir: __dirname,
    sourcefile: 'ux-entry.ts',
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
const canvas = read('src/renderer/canvas/Canvas.tsx')

// ── First run ────────────────────────────────────────────────────────────

{
  const report = (over) => ({
    probedAt: 0, shell: { path: '/bin/zsh', ok: true }, pathEntries: [],
    clis: [{ name: 'claude', path: '/opt/homebrew/bin/claude' }, { name: 'codex', path: null }, { name: 'git', path: '/usr/bin/git' }],
    tmux: { kind: 'tmux', reason: '', path: '/opt/homebrew/bin/tmux' }, layout: { path: '', backupWritten: false }, envKeys: [], control: null,
    ...over
  })
  const answered = M.probesFromReport(report({}))
  const silent = M.probesFromReport(report({ shell: { path: '/bin/zsh', ok: false } }))
  const none = M.probesFromReport(null)
  const view = M.agentRows(answered, M.foundAgentIds(answered))
  ok('ux.onboard.1 the agents step reads the env report: a found CLI starts on and lets Continue through; a shell that did not answer is unknown, never missing',
    answered.find((p) => p.id === 'claude').path === '/opt/homebrew/bin/claude' &&
      answered.find((p) => p.id === 'codex').path === null && answered.find((p) => p.id === 'codex').timedOut === undefined &&
      !answered.some((p) => p.id === 'gemini') &&
      view.canContinue === true && view.rows.find((r) => r.id === 'claude').enabled === true &&
      silent.every((p) => p.timedOut === true) && none.length === 0 &&
      M.foundAgentIds(silent).length === 0,
    JSON.stringify({ answered, silent, ready: view.ready }))
}

{
  const ui = read('src/renderer/onboarding/Onboarding.tsx')
  const mount = canvas.slice(canvas.indexOf('<Onboarding\n'), canvas.indexOf('/>', canvas.indexOf('<Onboarding\n')))
  ok('ux.onboard.2 the card is mounted with probes, an enabled list, Skip and the custom door, and its last step hands back answers',
    /probes=\{onboardingProbes\}/.test(mount) && /enabled=\{foundAgentIds\(onboardingProbes\)\}/.test(mount) &&
      /onSkip=\{finishOnboarding\}/.test(mount) && /onCustom=\{/.test(mount) && /completeOnboarding\(answers\)/.test(mount) &&
      /data-onboard-skip/.test(ui) && /onHandoff\?\.\(FIRST_TASK_HANDOFF, \{ workspaceName:/.test(ui),
    mount.slice(0, 200))
}

{
  const complete = canvas.slice(canvas.indexOf('const completeOnboarding'), canvas.indexOf('const onboardingProbes'))
  ok('ux.onboard.3 finishing saves the answers: the workspace is renamed, the first agent turned on becomes the default, and the new-task sheet opens',
    /workspace\.rename\(active\.id, answers\.workspaceName\)/.test(complete) &&
      /preset\.setDefault\(first\)/.test(complete) && /p\.builtIn/.test(complete) &&
      /beginStartWork\(\)/.test(complete),
    complete.length + ' chars')
}

{
  const at = canvas.indexOf('<BlankCanvas')
  const blank = canvas.slice(canvas.lastIndexOf('{onboardingDone', at), canvas.indexOf('/>', canvas.indexOf('onLayout', at)))
  ok('ux.empty.1 the blank card shows only once the launcher is put away, and every button on it is wired',
    /launcherPutAway && \(/.test(blank) && /onStart=\{/.test(blank) && /onQuick=\{/.test(blank) && /onLayout=\{/.test(blank) &&
      /beginStartWork\(\{ title:/.test(blank) && /importCanvas\(\)/.test(blank) && /lineupWhatId\(layout\.lineup\)/.test(blank),
    blank.slice(0, 160))
}

{
  ok('ux.empty.2 every starter layout is a lineup the panel sheet places, or a single shell',
    M.STARTER_LAYOUTS.length > 0 && M.STARTER_LAYOUTS.every((row) => row.lineup === null || M.LINEUP_IDS.includes(row.lineup)) &&
      /initialWhat\?: string/.test(read('src/renderer/palette/SpawnSheet.tsx')) &&
      /model\.initialWhat \?\?/.test(read('src/renderer/palette/SpawnSheet.tsx')),
    JSON.stringify(M.STARTER_LAYOUTS.map((row) => [row.id, row.lineup])))
}

// ── Small lies the UI told ───────────────────────────────────────────────

{
  const approval = read('src/renderer/shell/ApprovalDetail.tsx')
  const shortcuts = read('src/shared/shortcuts.ts')
  ok('ux.words.1 the inline Allow advertises only the chord that is bound, and double-click is named for what it does',
    !/<kbd>Y<\/kbd>/.test(approval) && /Allow <kbd>⌘Y<\/kbd>/.test(approval) &&
      /id: 'spawn-at-cursor', chord: 'double-click'[^}]*label: 'Place a flowchart step'/.test(shortcuts) &&
      /flowchart\.addShape\('process'/.test(canvas.slice(canvas.indexOf('const onCanvasDoubleClick'))),
    'inline approval and registry')
}

{
  const open = read('src/renderer/settings/open.ts')
  const view = read('src/renderer/settings/SettingsView.tsx')
  ok('ux.settings.1 Settings opens on General then the last page, and Escape closes it unless a recording took the key',
    /let pane: SettingsPaneId = 'general'/.test(open) && /if \(next !== undefined\) pane = next/.test(open) &&
      /event\.key !== 'Escape' \|\| event\.defaultPrevented/.test(view) && /onClose\(\)/.test(view),
    'open.ts and SettingsView')
}

const passed = results.filter((r) => r.pass).length
console.log('\n' + passed + '/' + results.length + ' passed')
if (results.some((r) => !r.pass)) process.exitCode = 1
