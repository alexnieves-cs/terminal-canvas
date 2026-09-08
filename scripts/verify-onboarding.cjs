/* Run with: node scripts/verify-onboarding.cjs
   M180. Discovery is not authentication. These checks use report fixtures only:
   neither a login shell, a vendor CLI nor an installer is invoked. Every check
   reports even before the module exists, so one missing export cannot hide red. */
const { buildSync } = require('esbuild')
const { join, resolve } = require('node:path')
const { existsSync } = require('node:fs')
const ROOT = resolve(__dirname, '..')
const ENTRY = join(ROOT, 'src/shared/onboarding.ts')
const OUT = join(ROOT, 'out/verify/onboarding.cjs')
const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ` — ${detail}` : ''}`)
}
let model
let metadata
let loadError
try {
  if (!existsSync(ENTRY)) throw new Error('src/shared/onboarding.ts does not exist')
  metadata = buildSync({
    entryPoints: [ENTRY], outfile: OUT, bundle: true, platform: 'node', format: 'cjs',
    metafile: true,
    alias: { '@shared': join(ROOT, 'src/shared'), '@renderer': join(ROOT, 'src/renderer') }
  }).metafile
  model = require(OUT)
} catch (error) { loadError = error.message }

// An absent implementation fails EACH independent case rather than throwing
// before the tally. A failure inside a case also cannot hide later cases.
const check = (id, test) => {
  try {
    if (typeof model?.onboardingReadiness !== 'function') {
      ok(id, false, loadError ?? 'onboardingReadiness export is absent')
      return
    }
    const result = test()
    ok(id, result.pass, JSON.stringify(result.detail))
  } catch (error) { ok(id, false, error.message) }
}
const report = (paths = {}, extra = {}) => ({
  probedAt: 1234, shell: { path: '/bin/zsh', ok: true },
  pathEntries: ['/fixture/bin'],
  clis: ['claude', 'codex', 'git'].map((name) => ({ name, path: paths[name] ?? null })),
  tmux: { kind: 'direct', path: null, reason: 'fixture' },
  layout: { path: '/fixture/layout.json', backupWritten: false },
  envKeys: [], control: null, ...extra
})
const read = (...args) => model.onboardingReadiness(...args)
const row = (answer, backend) => answer.rows.find((r) => r.backend === backend)

check('onboarding.1 unanswered report keeps both setup rows and selects no engine', () => {
  const answer = read(null)
  return { pass: answer.rows.map((r) => r.backend).join(',') === 'claude,codex' &&
    answer.rows.every((r) => r.discovery === 'unknown' && r.sentence.trim().length > 0) &&
    !Object.hasOwn(answer, 'preferred'), detail: answer }
})
check('onboarding.2 installed engine stays authentication unknown even with auth key names', () => {
  const answer = read(report({ claude: '/fixture/bin/claude' }, {
    envKeys: ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY']
  }))
  const found = row(answer, 'claude')
  return { pass: found.discovery === 'installed' && found.authentication === 'unknown' &&
    /sign[ -]?in|authenticat/i.test(found.sentence) && answer.preferred === 'claude', detail: answer }
})
check('onboarding.3 missing CLIs are named missing while git alone cannot start a conversation', () => {
  const answer = read(report({ git: '/fixture/bin/git' }))
  return { pass: answer.rows.length === 2 &&
    answer.rows.every((r) => r.discovery === 'missing' && r.sentence.trim().length > 0) &&
    !Object.hasOwn(answer, 'preferred'), detail: answer }
})
check('onboarding.4 timed out shell is unknown rather than advice to reinstall', () => {
  const answer = read(report({}, {
    probe: { shells: ['/bin/zsh'], folders: ['/fixture/bin'], timedOut: true }
  }))
  return { pass: answer.rows.every((r) => r.discovery === 'unknown' &&
    /answer|timed? out|check again/i.test(r.sentence)) && !Object.hasOwn(answer, 'preferred'), detail: answer }
})
check('onboarding.5 old report without probe still honors an unanswered shell', () => {
  const answer = read(report({}, { shell: { path: '/bin/zsh', ok: false, reason: 'no reply' } }))
  return { pass: answer.rows.every((r) => r.discovery === 'unknown') &&
    !Object.hasOwn(answer, 'preferred'), detail: answer }
})
check('onboarding.6 omitted CLI report row is unknown while explicit null means missing', () => {
  const answer = read(report({}, { clis: [{ name: 'claude', path: null }] }))
  return { pass: row(answer, 'claude').discovery === 'missing' &&
    row(answer, 'codex').discovery === 'unknown', detail: answer }
})
check('onboarding.7 installed preferred engine wins even when another is first', () => {
  const answer = read(report({ claude: '/fixture/bin/claude', codex: '/fixture/bin/codex' }), 'codex')
  return { pass: answer.preferred === 'codex' &&
    answer.rows.every((r) => r.authentication === 'unknown'), detail: answer }
})
check('onboarding.8 missing preferred engine falls back to installed engine', () => {
  const answer = read(report({ codex: '/fixture/bin/codex' }), 'claude')
  return { pass: answer.preferred === 'codex' && row(answer, 'claude').discovery === 'missing', detail: answer }
})
check('onboarding.9 unsupported preferred engine cannot become an available first-launch choice', () => {
  const answer = read(report({ claude: '/fixture/bin/claude' }), 'acp')
  const none = read(report(), 'copilot')
  return { pass: answer.preferred === 'claude' && !Object.hasOwn(none, 'preferred'), detail: { answer, none } }
})
check('onboarding.10 Check again result can replace missing discovery without mutating the reports', () => {
  const before = report()
  const after = report({ codex: '/fixture/bin/codex' }, { probedAt: 5678 })
  const untouched = JSON.stringify({ before, after })
  const first = read(before)
  const second = read(after)
  return { pass: row(first, 'codex').discovery === 'missing' &&
    row(second, 'codex').discovery === 'installed' && second.preferred === 'codex' &&
    JSON.stringify({ before, after }) === untouched, detail: { first, second } }
})
check('onboarding.11 setup is a plain HTTPS documentation link with no executable action', () => {
  const answer = read(report())
  const allowedHosts = new Set(['code.claude.com', 'docs.anthropic.com', 'platform.claude.com',
    'developers.openai.com', 'platform.openai.com', 'help.openai.com'])
  const declarative = (value) => typeof value !== 'function' &&
    (value === null || typeof value !== 'object' || Object.entries(value).every(([key, child]) =>
      !/^(command|args|script|installer|execute|run)$/i.test(key) && declarative(child)))
  return { pass: answer.rows.length === 2 && answer.rows.every((r) => {
    const url = new URL(r.setupUrl)
    return url.protocol === 'https:' && allowedHosts.has(url.hostname) &&
      url.username === '' && url.password === ''
  }) && declarative(answer), detail: answer }
})
check('onboarding.12 readiness bundle cannot import a process launcher or agent runtime', () => {
  const inputs = Object.keys(metadata.inputs)
  const imports = Object.values(metadata.outputs).flatMap((output) => output.imports)
  return { pass: inputs.length > 0 && inputs.every((path) =>
    resolve(ROOT, path).startsWith(join(ROOT, 'src/shared') + '/')) && imports.length === 0,
  detail: { inputs, imports } }
})

// Static markup proves available/disabled affordances, never that a click sends
// a turn. The real renderer owns start/send verification separately.
try {
  const launcherOut = join(ROOT, 'out/verify/onboarding-launcher.cjs')
  buildSync({
    entryPoints: [join(ROOT, 'src/renderer/canvas/Launcher.tsx')], outfile: launcherOut,
    bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic',
    external: ['react', 'react/jsx-runtime'],
    alias: { '@shared': join(ROOT, 'src/shared'), '@renderer': join(ROOT, 'src/renderer') }
  })
  const { createElement } = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const { Launcher } = require(launcherOut)
  const noop = () => {}
  const html = renderToStaticMarkup(createElement(Launcher, {
    presets: [], report: report({ codex: '/fixture/bin/codex' }),
    onCheckAgain: noop, onSpawnPreset: noop, onOpenSheet: noop, onOpenFile: noop,
    onNewNote: noop, noteReason: 'choose a panel', onNewChat: noop,
    chatReason: 'claude is missing', onNewCodexChat: noop, codexReason: null,
    onNewSandboxChat: noop, sandboxReason: 'claude is missing'
  }))
  const start = html.match(/<button\b[^>]*\bdata-onboarding-start(?:="[^"]*")?[^>]*>[\s\S]*?<\/button>/)?.[0]
  const oldClaude = html.match(/<button\b[^>]*\bdata-launcher-new-chat(?:="[^"]*")?[^>]*>/)?.[0]
  const oldCodex = html.match(/<button\b[^>]*\bdata-launcher-new-codex(?:="[^"]*")?[^>]*>/)?.[0]
  ok('onboarding.markup.1 available codex leads with Start a conversation and keeps old doors',
    Boolean(start && !/\bdisabled(?:=|\s|>)/.test(start) && /Start a conversation/.test(start) &&
      oldClaude && /\bdisabled(?:=|\s|>)/.test(oldClaude) && oldCodex &&
      !/\bdisabled(?:=|\s|>)/.test(oldCodex)),
    JSON.stringify({ start: start ?? null, oldClaude, oldCodex }))
  ok('onboarding.markup.2 first-launch readiness explicitly separates installed from sign-in',
    /installed/i.test(html) && /sign[ -]?in|authenticat/i.test(html) &&
      /data-launcher-check-again/.test(html),
    'static readiness copy and Check again; no click/send claim')
} catch (error) {
  ok('onboarding.markup.1 available codex leads with Start a conversation and keeps old doors', false, error.message)
  ok('onboarding.markup.2 first-launch readiness explicitly separates installed from sign-in', false, error.message)
}

console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`)
if (results.some((r) => !r.pass)) process.exitCode = 1
