/* Run with: node scripts/verify-borrow.cjs
   Lane G (M530–M539): the ideas a scan of similar apps found missing here
   (docs/streams/borrow.md). Plain node: each module is bundled with esbuild
   and driven with fixtures, so no Electron, shell, CLI or network is touched.
   Every check reports even when its module fails to load, so one missing
   export cannot hide the rest. */
const { buildSync } = require('esbuild')
const { join, resolve } = require('node:path')
const ROOT = resolve(__dirname, '..')
const { ok, results } = require('./lib/checks.cjs').createChecks()

const ALIAS = { '@shared': join(ROOT, 'src/shared'), '@renderer': join(ROOT, 'src/renderer') }
function load(entry, name) {
  try {
    const outfile = join(ROOT, 'out/verify', `borrow-${name}.cjs`)
    buildSync({ entryPoints: [join(ROOT, entry)], outfile, bundle: true, platform: 'node', format: 'cjs', alias: ALIAS, logLevel: 'silent' })
    return { mod: require(outfile) }
  } catch (error) {
    return { error: error.message.split('\n')[0] }
  }
}
const check = (id, loaded, test) => {
  if (loaded.mod === undefined) { ok(id, false, loaded.error); return }
  try {
    const r = test(loaded.mod)
    ok(id, r.pass, JSON.stringify(r.detail).slice(0, 400))
  } catch (error) { ok(id, false, error.message) }
}

const presets = load('src/main/presets.ts', 'presets')
const env = load('src/main/env-report.ts', 'env')
const onboarding = load('src/shared/onboarding.ts', 'onboarding')
const rows = load('src/renderer/palette/commands/environment-rows.ts', 'env-rows')

const AGENTS = { gemini: 'gemini', opencode: 'opencode', 'cursor-agent': 'cursor-agent', amp: 'amp', kimi: 'kimi' }

const report = (found, extra = {}) => env.mod.buildEnvReport({
  env: { PATH: '/fixture/bin' },
  shell: { path: '/bin/zsh', ok: true },
  which: (name) => (found.includes(name) ? `/fixture/bin/${name}` : null),
  backend: { kind: 'direct', reason: 'fixture', tmuxPath: null },
  layoutPath: '/fixture/layout.json',
  backupWritten: false,
  now: 1,
  control: null,
  probe: { shells: ['/bin/zsh'], timedOut: false },
  ...extra
})

// G1 — borrow.agents.1. Each new agent is a built-in preset running its own
//      CLI, with no `agent` kind: AgentKind drives cost and transcript
//      parsing that none of these CLIs has been measured for, and a wrong
//      kind would parse their output as Claude's.
check('borrow.agents.1 Gemini CLI, OpenCode, Cursor Agent, Amp and Kimi are built-in presets that run their CLI and claim no agent kind', presets, (L) => {
  const all = L.allPresets([])
  const found = Object.entries(AGENTS).map(([id, command]) => all.find((p) => p.id === id && p.command === command))
  return { pass: found.every((p) => p !== undefined && p.agent === undefined && p.args.length === 0 && p.cwd === '~'), detail: found }
})

// borrow.agents.2. Built-ins stay ahead of user presets and the shell stays
//      the fallback default, so adding rows moved nothing a person relies on.
check('borrow.agents.2 the login shell is still the first built-in and ids stay unique', presets, (L) => {
  const ids = L.BUILT_IN_PRESETS.map((p) => p.id)
  return { pass: ids[0] === 'shell' && new Set(ids).size === ids.length && L.resolveDefault([], 'nope').id === 'shell', detail: ids }
})

// borrow.agents.3. The report probes the optional agents, but a missing one
//      is never told to install: probeOutcome stays `found` on a machine with
//      claude, codex and git and none of the five.
check('borrow.agents.3 the environment report lists the agent CLIs, and a missing optional agent never turns the outcome into not-found', env, (E) => {
  const base = report(['claude', 'codex', 'git'])
  const names = base.clis.map((c) => c.name)
  const outcome = E.probeOutcome(base)
  const missingRequired = E.probeOutcome(report(['claude', 'git', 'gemini']))
  return {
    pass: Object.keys(AGENTS).every((n) => names.includes(n)) && outcome.kind === 'found' && !/gemini|opencode|kimi|amp|cursor/.test(outcome.sentence) &&
      missingRequired.kind === 'not-found' && /codex/.test(missingRequired.sentence) && !/opencode/.test(missingRequired.sentence),
    detail: { names, outcome, missingRequired }
  }
})

// borrow.agents.4. Onboarding has offered Gemini since M180 with no probe,
//      so the row always read as "discovery did not answer". Now it answers
//      installed or missing like the other two.
check('borrow.agents.4 onboarding\'s Gemini row reads the report: installed when gemini is on PATH, missing when not', onboarding, (O) => {
  if (env.mod === undefined) return { pass: false, detail: env.error }
  const withIt = O.probesFromReport(report(['claude', 'gemini'])).find((p) => p.id === 'gemini')
  const without = O.probesFromReport(report(['claude'])).find((p) => p.id === 'gemini')
  return { pass: withIt !== undefined && withIt.path === '/fixture/bin/gemini' && without !== undefined && without.path === null && without.timedOut !== true, detail: { withIt, without } }
})

// borrow.agents.5. The palette's Environment door counts required CLIs
//      apart from optional agents: "3 of 8 CLIs found" would read as five
//      faults on a machine set up exactly as it needs to be.
check('borrow.agents.5 the Environment door counts required CLIs apart and names the extra agents found', rows, (R) => {
  if (env.mod === undefined) return { pass: false, detail: env.error }
  const plain = R.environmentCount(report(['claude', 'codex', 'git']))
  const more = R.environmentCount(report(['claude', 'codex', 'git', 'gemini', 'amp']))
  const row = R.buildEnvironmentRows(report(['claude', 'codex', 'git'])).find((r) => r.id === 'env.cli.kimi')
  return { pass: plain === '3 of 3 CLIs found' && more === '3 of 3 CLIs found · 2 more agents' && row !== undefined && /optional/.test(row.subtitle), detail: { plain, more, row: row && row.subtitle } }
})

console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`)
if (results.some((r) => !r.pass)) process.exitCode = 1
