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
const { ok, results } = require('./lib/checks.cjs').createChecks()
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

// M205 (D09). THE FIRST START as a pure decision. Guarded per export, like
// `check` above, so a missing `firstWorkPlan` fails each case by name rather
// than throwing past the tally.
const intent = (id, test) => {
  try {
    if (typeof model?.firstWorkPlan !== 'function' || typeof model?.firstWorkRepoAnswer !== 'function') {
      ok(id, false, loadError ?? 'firstWorkPlan / firstWorkRepoAnswer export is absent')
      return
    }
    const result = test()
    ok(id, result.pass, JSON.stringify(result.detail))
  } catch (error) { ok(id, false, error.message) }
}
const claudeReady = { preferred: 'claude' }
const mate = (id, places) => ({ id, name: id, places })
const plan = (req, teammates = [], readiness = claudeReady) => model.firstWorkPlan(req, { teammates, readiness })

intent('onboarding.intent.1 an empty sentence, an empty folder and a relative path are each refused by their own field and name', () => {
  const noWords = plan({ intention: '   ', folder: '/code/app' })
  const noFolder = plan({ intention: 'fix the login test', folder: ' ' })
  const relative = plan({ intention: 'fix the login test', folder: '~/code/app' })
  return { pass: noWords.kind === 'refused' && noWords.field === 'intention' &&
    noFolder.kind === 'refused' && noFolder.field === 'folder' &&
    relative.kind === 'refused' && relative.field === 'folder' && /full path/.test(relative.reason) &&
    noFolder.reason !== relative.reason, detail: { noWords, noFolder, relative } }
})
intent('onboarding.intent.2 no engine is refused by name, Codex-only resolves to a Codex conversation in the folder (sentence and folder still refused first), and Claude starts', () => {
  const none = plan({ intention: 'x', folder: '/code/app' }, [], {})
  const codex = plan({ intention: 'x', folder: '/code/app' }, [], { preferred: 'codex' })
  const codexNoWords = plan({ intention: ' ', folder: '/code/app' }, [], { preferred: 'codex' })
  const codexRelative = plan({ intention: 'x', folder: 'app' }, [], { preferred: 'codex' })
  const claude = plan({ intention: 'x', folder: '/code/app' })
  // M205 critic: an UNANSWERED lane engine is not a missing one — telling a
  // person to install what they have is the wrong fix. With Codex found and
  // Claude unanswered, and with nothing answered at all.
  const unanswered = plan({ intention: 'x', folder: '/code/app' }, [], { preferred: 'codex', rows: [{ backend: 'claude', discovery: 'unknown' }, { backend: 'codex', discovery: 'installed' }] })
  const silent = plan({ intention: 'x', folder: '/code/app' }, [], { rows: [{ backend: 'claude', discovery: 'unknown' }, { backend: 'codex', discovery: 'unknown' }] })
  return { pass: none.kind === 'refused' && none.field === 'engine' && /Check again/.test(none.reason) &&
    codex.kind === 'chat' && codex.engine === 'codex' && codex.folder === '/code/app' && /Codex/.test(codex.summary) && /no task branch/.test(codex.summary) &&
    codexNoWords.kind === 'refused' && codexNoWords.field === 'intention' && codexRelative.kind === 'refused' && codexRelative.field === 'folder' &&
    claude.kind === 'start' &&
    unanswered.kind === 'refused' && /not answered/.test(unanswered.reason) && !/install/i.test(unanswered.reason) &&
    silent.kind === 'refused' && /not answered/.test(silent.reason), detail: { none, codex, codexNoWords, codexRelative, claude, unanswered, silent } }
})
intent('onboarding.intent.3 a teammate is reused only when a place CONTAINS the folder by path segment; otherwise one is minted with exactly that folder and nothing wider', () => {
  const inside = plan({ intention: 'x', folder: '/code/app/' }, [mate('tA', ['/code/'])])
  const exact = plan({ intention: 'x', folder: '/code/app' }, [mate('tB', ['/code/app'])])
  const sibling = plan({ intention: 'x', folder: '/code/app2' }, [mate('tC', ['/code/app'])])
  const none = plan({ intention: 'x', folder: '/code/app' }, [mate('tD', [])])
  return { pass: inside.kind === 'start' && inside.teammate.reuse === 'tA' && inside.folder === '/code/app' &&
    exact.kind === 'start' && exact.teammate.reuse === 'tB' &&
    sibling.kind === 'start' && sibling.teammate.reuse === undefined && JSON.stringify(sibling.teammate.mint?.places) === JSON.stringify(['/code/app2']) &&
    none.kind === 'start' && none.teammate.reuse === undefined && JSON.stringify(none.teammate.mint?.places) === JSON.stringify(['/code/app']) &&
    typeof none.teammate.mint?.name === 'string' && /app/.test(none.teammate.mint.name), detail: { inside, exact, sibling, none } }
})
intent('onboarding.intent.4 the task title is the first line, capped; the full sentence rides as the description; the summary states the grant before anything is minted', () => {
  const long = 'Make the login test stop flaking on CI and explain what was wrong with it so I can review the change'
  const one = plan({ intention: long, folder: '/code/app' })
  const two = plan({ intention: 'Fix login\nIt fails on CI about once in five runs', folder: '/code/app' }, [mate('tB', ['/code/app'])])
  const short = plan({ intention: 'fix it', folder: '/code/app' })
  return { pass: one.kind === 'start' && one.title.length <= 80 && one.title.endsWith('…') && one.description === long &&
    two.kind === 'start' && two.title === 'Fix login' && /once in five/.test(two.description ?? '') && !(two.description ?? '').includes('Fix login') &&
    short.kind === 'start' && short.title === 'fix it' && !Object.hasOwn(short, 'description') &&
    /may work only in/.test(one.summary) && /app/.test(one.summary) && /branch/.test(one.summary) &&
    !/may work only in/.test(two.summary) && /tB/.test(two.summary), detail: { one, two, short } }
})
intent('onboarding.intent.5 the repository answer keeps three arms — a repository, git missing, and not a repository — with a different fix each', () => {
  const repo = model.firstWorkRepoAnswer({ kind: 'status', root: '/code/app', repository: '/code/app', branch: 'main', upstream: null }, '/code/app')
  const noGit = model.firstWorkRepoAnswer({ kind: 'git-missing' }, '/code/app')
  const plain = model.firstWorkRepoAnswer({ kind: 'unreadable', detail: 'fatal: not a git repository' }, '/code/notes')
  // M205 critic: a SUBFOLDER answers git too and would be refused after the
  // mint; a missing path is not a plain folder. macOS's /private prefix is
  // the same folder, not a subfolder.
  const status = (root) => ({ kind: 'status', root, repository: root, branch: 'main', upstream: null })
  const sub = model.firstWorkRepoAnswer(status('/private/var/code/app'), '/var/code/app/src')
  const same = model.firstWorkRepoAnswer(status('/private/var/code/app'), '/var/code/app/')
  const sibling = model.firstWorkRepoAnswer(status('/code/app'), '/code/app2')
  const missing = model.firstWorkRepoAnswer({ kind: 'unreadable', detail: "fatal: cannot change to '/code/typo': No such file or directory" }, '/code/typo')
  return { pass: repo.kind === 'repository' && noGit.kind === 'refused' && /git/.test(noGit.reason) &&
    plain.kind === 'not-a-repository' && /not a git repository/.test(plain.reason) && /notes/.test(plain.reason) &&
    noGit.reason !== plain.reason &&
    sub.kind === 'refused' && /inside the repository/.test(sub.reason) && same.kind === 'repository' && sibling.kind === 'repository' &&
    missing.kind === 'refused' && /does not exist/.test(missing.reason), detail: { repo, noGit, plain, sub, same, sibling, missing } }
})

// M403 (the M400 critic) — onboarding.intent.6. A symlinked folder is
// granted and started as the directory git works in; a link INTO a repository
// is the subfolder refusal, judged on the realpath (the string test alone
// never fired live: main's status echoes the root it was given); home and
// the filesystem root are never a new teammate's place.
intent('onboarding.intent.6 a symlink to a repository answers with its realpath as the canonical folder, a symlink into one is refused as a subfolder, home and / are refused by name, and a plain folder answers as before', () => {
  const st = (root, extra = {}) => ({ kind: 'status', root, repository: root, branch: 'main', upstream: null, ...extra })
  const link = model.firstWorkRepoAnswer(st('/Users/me/link', { real: '/Volumes/code/app' }), '/Users/me/link', '/Volumes/code/app')
  const into = model.firstWorkRepoAnswer(st('/Users/me/src', { real: '/Volumes/code/app/src' }), '/Users/me/src', '/Volumes/code/app')
  const home = model.firstWorkRepoAnswer(st('/Users/me', { real: '/Users/me', home: true }), '/Users/me', '/Users/me')
  const root = model.firstWorkRepoAnswer(st('/', { real: '/' }), '/', '/')
  const plain = model.firstWorkRepoAnswer(st('/code/app', { real: '/code/app' }), '/code/app', '/code/app')
  const tmp = model.firstWorkRepoAnswer(st('/tmp/app', { real: '/private/tmp/app' }), '/tmp/app', '/private/tmp/app')
  const old = model.firstWorkRepoAnswer(st('/code/app'), '/code/app')
  return { pass: link.kind === 'repository' && link.canonical === '/Volumes/code/app' &&
    into.kind === 'refused' && /inside the repository/.test(into.reason) &&
    home.kind === 'refused' && /home folder/.test(home.reason) &&
    root.kind === 'refused' && /filesystem root/.test(root.reason) &&
    plain.kind === 'repository' && plain.canonical === undefined &&
    tmp.kind === 'repository' && tmp.canonical === undefined && old.kind === 'repository' && old.canonical === undefined,
  detail: { link, into, home, root, plain, tmp, old } }
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
  const render = (cliPaths) => renderToStaticMarkup(createElement(Launcher, {
    presets: [], report: report(cliPaths),
    onCheckAgain: noop, onSpawnPreset: noop, onOpenSheet: noop, onOpenFile: noop,
    onNewNote: noop, noteReason: 'choose a panel', onNewChat: noop,
    chatReason: cliPaths.claude ? null : 'claude is missing', onNewCodexChat: noop, codexReason: cliPaths.codex ? null : 'codex is missing',
    onStartWork: async () => ({ kind: 'started' }), onAsk: noop, onChatHere: noop, onOpenStarter: noop, starterReason: null
  }))
  const disabled = (tag) => /\bdisabled(?:=|\s|>)/.test(tag ?? '')
  const buttonTag = (source, attr) => source.match(new RegExp(`<button\\b[^>]*\\b${attr}(?:="[^"]*")?[^>]*>`))?.[0]
  const html = render({ codex: '/fixture/bin/codex' })
  // M205 (D09). Rewritten: the primary is Start work, not Start a
  // conversation. With Codex alone it is PRESENT and disabled by name (a
  // teammate carries no backend, so a lane runs Claude), the one alternative
  // is live, and every legacy door is still in the DOM — inside the CLOSED
  // disclosure, never removed.
  const start = buttonTag(html, 'data-onboarding-start')
  const ask = buttonTag(html, 'data-onboarding-ask')
  const more = html.match(/<details\b[^>]*\bdata-launcher-more[^>]*>[\s\S]*<\/details>/)?.[0] ?? ''
  const moreOpen = /<details\b[^>]*\bopen\b/.test(more)
  const legacy = ['data-launcher-sheet', 'data-launcher-open-file', 'data-launcher-new-chat', 'data-launcher-new-codex', 'data-launcher-starter', 'data-launcher-new-note'].map((a) => [a, buttonTag(more, a) !== undefined])
  // 2.1: Codex-only is no longer a wall — Start work waits on the sentence
  // like any other start, never on an engine, and the agent step says the
  // start becomes a conversation in the folder.
  ok('onboarding.markup.1 with Codex alone Start work waits only on the sentence (no engine wall), the agent step names the in-folder conversation, Ask is live, and every legacy door is inside the closed disclosure',
    Boolean(start && disabled(start) && /Describe the task first/.test(start) && !/not found/.test(start) && /conversation in the folder/.test(html) && ask && !disabled(ask) && !moreOpen &&
      legacy.every(([, found]) => found) && disabled(buttonTag(more, 'data-launcher-new-chat')) && !disabled(buttonTag(more, 'data-launcher-new-codex'))),
    JSON.stringify({ start: start ?? null, ask: ask ?? null, moreOpen, legacy }))
  ok('onboarding.markup.2 first-launch readiness explicitly separates installed from sign-in',
    /installed/i.test(html) && /sign[ -]?in|authenticat/i.test(html) &&
      /data-launcher-check-again/.test(html),
    'static readiness copy and Check again; no click/send claim')
  // M205. Readiness ONLY AS NEEDED: with Claude found, one row and no Check
  // again (Codex's missing row lives in Environment…); with nothing found,
  // every row and Check again. And no process mechanics in onboarding copy.
  const claudeOnly = render({ claude: '/fixture/bin/claude' })
  const nothing = render({})
  const both = render({ claude: '/fixture/bin/claude', codex: '/fixture/bin/codex' })
  const engines = (source) => [...source.matchAll(/data-onboarding-engine="([^"]+)"/g)].map((m) => m[1]).join(',')
  ok('onboarding.markup.3 readiness appears only as needed — one row with an engine found, every row and Check again with none — and no copy says process-per-turn',
    engines(claudeOnly) === 'claude' && !/data-launcher-check-again/.test(claudeOnly) &&
      engines(nothing) === 'claude,codex' && /data-launcher-check-again/.test(nothing) &&
      ![claudeOnly, nothing, both, html].some((source) => /process per turn|one process/i.test(source)),
    JSON.stringify({ claudeOnly: engines(claudeOnly), nothing: engines(nothing) }))
  // M205. At rest the primary names the FIRST missing thing (the sentence),
  // is disabled until it is answered, and the starter reads as optional.
  // M395: in the dead-end rule's words, "Describe the task first" — not step
  // 1's question again — and said on the disabled control itself.
  const summary = claudeOnly.match(/<p\b[^>]*\bdata-onboarding-summary="([^"]+)"[^>]*>([\s\S]*?)<\/p>/)
  const startTag = claudeOnly.match(/<button\b[^>]*data-onboarding-start[\s\S]*?<\/button>/)?.[0] ?? ''
  ok('onboarding.markup.4 at rest the primary is disabled and says the sentence is the one missing thing (the summary names the same field); the starter line reads as optional',
    Boolean(summary && summary[1] === 'intention' && /Describe the task first/.test(summary[2]) && /Describe the task first/.test(startTag) &&
      disabled(buttonTag(claudeOnly, 'data-onboarding-start')) && !disabled(buttonTag(claudeOnly, 'data-onboarding-ask')) &&
      /optional/.test(claudeOnly.match(/<button\b[^>]*\bdata-launcher-starter[^>]*>[\s\S]*?<\/button>/)?.[0] ?? '')),
    JSON.stringify({ summary: summary ? summary.slice(1) : null }))
} catch (error) {
  ok('onboarding.markup.1 with Codex alone Start work waits only on the sentence (no engine wall), the agent step names the in-folder conversation, Ask is live, and every legacy door is inside the closed disclosure', false, error.message)
  ok('onboarding.markup.2 first-launch readiness explicitly separates installed from sign-in', false, error.message)
  ok('onboarding.markup.3 readiness appears only as needed — one row with an engine found, every row and Check again with none — and no copy says process-per-turn', false, error.message)
  ok('onboarding.markup.4 at rest the primary is disabled and says the sentence is the one missing thing (the summary names the same field); the starter line reads as optional', false, error.message)
}

console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`)
if (results.some((r) => !r.pass)) process.exitCode = 1
