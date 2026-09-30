/* Run with: node scripts/verify-first-run.cjs
   M262. The first-run sequence and the creation forms. Plain node: the pure
   model (`src/shared/first-run.ts`, the hints' attempt rule, the recent-time
   parser) and STATIC MARKUP of the launcher and both sheets. Markup proves
   what is on the surface and in what order — never that a click starts
   anything; the product suites own that. Every check reports even when its
   module fails to build, so one broken import cannot hide the rest. */
const { buildSync } = require('esbuild')
const { join, resolve } = require('node:path')
const ROOT = resolve(__dirname, '..')
const { ok, results } = require('./lib/checks.cjs').createChecks()
const alias = { '@shared': join(ROOT, 'src/shared'), '@renderer': join(ROOT, 'src/renderer') }

const load = (entry, out, jsx) => {
  try {
    buildSync({
      entryPoints: [join(ROOT, entry)], outfile: join(ROOT, 'out/verify', out), bundle: true, platform: 'node', format: 'cjs',
      ...(jsx ? { jsx: 'automatic', external: ['react', 'react/jsx-runtime', 'react-dom'] } : {}), alias,
      loader: { '.css': 'empty', '.svg': 'text' }
    })
    return { mod: require(join(ROOT, 'out/verify', out)) }
  } catch (error) { return { error: error.message } }
}
const check = (loaded, id, test) => {
  if (loaded.error !== undefined) { ok(id, false, loaded.error); return }
  try { const r = test(loaded.mod); ok(id, r.pass, JSON.stringify(r.detail)) } catch (error) { ok(id, false, error.message) }
}

const FR = load('src/shared/first-run.ts', 'first-run.cjs')
const HINTS = load('src/renderer/canvas/hints.ts', 'first-run-hints.cjs')
const SCHEMA = load('src/shared/layout-schema.ts', 'first-run-schema.cjs')

const NOW = Date.UTC(2026, 8, 11, 12)
check(FR, 'fr.pure.1 a recent folder row leads with the repository name, carries the short path, and says when only when a time is known', (m) => {
  const rows = m.recentFolderRows(['/Users/a/code/app', '/Users/a/code/site/'], { '/Users/a/code/app': NOW - 3 * 3600e3 }, NOW)
  return { pass: rows.length === 2 && rows[0].name === 'app' && rows[0].when === '3 h ago' && typeof rows[0].short === 'string' && rows[0].short !== '' &&
    rows[1].name === 'site' && !('when' in rows[1]), detail: rows }
})
check(FR, 'fr.pure.2 last-used words are coarse buckets — just now, minutes, hours, yesterday, days, weeks', (m) => {
  const w = [30e3, 5 * 60e3, 2 * 3600e3, 26 * 3600e3, 3 * 86400e3, 20 * 86400e3].map((d) => m.lastUsedWords(NOW - d, NOW))
  return { pass: JSON.stringify(w) === JSON.stringify(['just now', '5 min ago', '2 h ago', 'yesterday', '3 days ago', '3 wk ago']), detail: w }
})
check(FR, 'fr.pure.3 the examples are the three named sentences about the CHOSEN repository, and there are none before one is chosen', (m) => {
  const none = m.repositoryExamples('  ')
  const ex = m.repositoryExamples('/code/billing')
  return { pass: none.length === 0 && ex.map((e) => e.label).join('|') === 'Review recent changes|Fix a failing test|Explain this codebase' &&
    ex.every((e) => e.intention.includes('billing')), detail: ex }
})
check(FR, 'fr.pure.4 the agent step is asked only when Claude Code is missing or unanswered', (m) => {
  const installed = m.agentStepNeeded([{ backend: 'claude', discovery: 'installed' }, { backend: 'codex', discovery: 'missing' }])
  const missing = m.agentStepNeeded([{ backend: 'claude', discovery: 'missing' }, { backend: 'codex', discovery: 'installed' }])
  const unknown = m.agentStepNeeded([{ backend: 'claude', discovery: 'unknown' }])
  return { pass: installed === false && missing === true && unknown === true, detail: { installed, missing, unknown } }
})
check(FR, 'fr.pure.5 the defaults are said in words — Claude Code · Standard effort · Default model — a set knob replaces its default, and a knob with no flag is left out', (m) => {
  const plain = m.runtimeDefaultsLine('Claude Code', {})
  const set = m.runtimeDefaultsLine('Claude Code', { effort: 'high', model: 'opus', mode: 'plan' })
  const noFlag = m.runtimeDefaultsLine('Copilot', { hasEffort: false, hasMode: false })
  return { pass: plain === 'Claude Code · Standard effort · Default model' && set === 'Claude Code · High effort · opus · Plan mode' && noFlag === 'Copilot · Default model' &&
    m.engineDisplayName('claude') === 'Claude Code', detail: { plain, set, noFlag } }
})
check(FR, 'fr.pure.6 each creation kind is explained at selection — agent, terminal, supervisor and chat each a distinct sentence naming itself', (m) => {
  const k = m.KIND_EXPLANATIONS
  const four = ['agent', 'terminal', 'supervisor', 'chat']
  return { pass: four.every((id) => typeof k[id] === 'string' && k[id].toLowerCase().startsWith(id)) && new Set(four.map((id) => k[id])).size === 4, detail: k }
})
check(HINTS, 'fr.hints.1 a gesture hint appears only after its attempt and alone; a seen one never returns; the attempt rule maps each input (M388: a double-click places a shape, so it teaches nothing)', (m) => {
  const rest = m.contextualHint(new Set(), null)
  const zoom = m.contextualHint(new Set(), 'zoom')
  const seen = m.contextualHint(new Set(['zoom']), 'zoom')
  const tmux = m.contextualHint(new Set(), 'tmux')
  const a = [m.attemptOf({ type: 'mousedown', button: 0 }), m.attemptOf({ type: 'wheel', deltaMode: 1 }), m.attemptOf({ type: 'wheel', deltaMode: 0 }),
    m.attemptOf({ type: 'wheel', deltaMode: 1, ctrlKey: true }), m.attemptOf({ type: 'dblclick' }), m.attemptOf({ type: 'keydown', key: 'a' }), m.attemptOf({ type: 'keydown', key: 'k', metaKey: true })]
  return { pass: rest.length === 0 && zoom.length === 1 && zoom[0].id === 'zoom' && seen.length === 0 && tmux.length === 0 &&
    JSON.stringify(a) === JSON.stringify(['pan', 'zoom', null, null, null, 'palette', null]), detail: { a, zoom } }
})
check(SCHEMA, 'fr.recent.1 recentDirectoryUsed: absent warns nothing, a non-object warns and is dropped, a bad entry costs only itself', (m) => {
  const w1 = []; const absent = m.parseRecentDirectoryUsed(undefined, w1)
  const w2 = []; const arr = m.parseRecentDirectoryUsed(['/a'], w2)
  const w3 = []; const mixed = m.parseRecentDirectoryUsed({ '/a': 5, '/b': 'x', '': 3, '/c': -1 }, w3)
  return { pass: JSON.stringify(absent) === '{}' && w1.length === 0 && JSON.stringify(arr) === '{}' && w2.length === 1 &&
    JSON.stringify(mixed) === '{"/a":5}' && w3.length === 3, detail: { mixed, w3 } }
})

// ── markup ──────────────────────────────────────────────────────────────
const { createElement } = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const noop = () => {}
const tag = (html, attr) => html.match(new RegExp(`<button\\b[^>]*\\b${attr}(?:="[^"]*")?[^>]*>[\\s\\S]*?</button>`))?.[0]
const report = (paths) => ({ probedAt: 1, shell: { path: '/bin/zsh', ok: true }, pathEntries: [], clis: ['claude', 'codex', 'git'].map((name) => ({ name, path: paths[name] ?? null })) })

const LAUNCHER = load('src/renderer/canvas/Launcher.tsx', 'first-run-launcher.cjs', true)
const launcher = (m, paths, extra = {}) => renderToStaticMarkup(createElement(m.Launcher, {
  presets: [], report: report(paths), onCheckAgain: noop, onSpawnPreset: noop, onOpenSheet: noop, onOpenFile: noop, onNewNote: noop, noteReason: 'x',
  onNewChat: noop, chatReason: null, onNewCodexChat: noop, codexReason: null, onStartWork: async () => ({ kind: 'started' }), onAsk: noop,
  onCreateObject: noop, onBlankCanvas: noop, now: NOW, ...extra
}))
check(LAUNCHER, 'fr.launcher.1 a numbered sequence — intent, repository, start — with no agent question when Claude Code is installed, and the agent step between them when it is not', (m) => {
  const steps = (html) => [...html.matchAll(/data-launcher-step="([^"]+)"/g)].map((x) => x[1]).join(',')
  const ready = launcher(m, { claude: '/b/claude' })
  const missing = launcher(m, { codex: '/b/codex' })
  return { pass: steps(ready) === 'intent,folder,start' && steps(missing) === 'intent,folder,agent,start' &&
    /What are you working on\?/.test(ready) && /Pick or drop a repository/.test(ready), detail: { ready: steps(ready), missing: steps(missing) } }
})
check(LAUNCHER, 'fr.launcher.2 the composed next step is Start task · Ask a question · Create… — primary filled, no Ask without a folder, no creatable-kind pills', (m) => {
  const html = launcher(m, { claude: '/b/claude' })
  const start = tag(html, 'data-onboarding-start') ?? ''
  const ask = tag(html, 'data-onboarding-ask') ?? ''
  const create = tag(html, 'data-onboarding-create') ?? ''
  return { pass: /is-primary/.test(start) && />Start task</.test(start) && />Ask a question</.test(ask) && /Start a conversation without a repository/.test(ask) && />Create…</.test(create) &&
    /data-create-face="empty-strip"/.test(html) && !/data-create-object=/.test(html) && !/Ask without a folder/.test(html) &&
    !/>Start a general chat</.test(html), detail: { start, ask, create } }
})
// M395. A Start that cannot run for want of the sentence says WHY on itself
// (the dead-end rule), so at rest its line is the reason; with a sentence it
// is the outcome again — both arms through the one pure chooser.
check(LAUNCHER, 'fr.launcher.5 each of the three verbs says its OUTCOME — Start makes a task, Ask opens a conversation, Create adds an object — a Start waiting on the sentence says so instead, and the plan summary still names what Start will use', (m) => {
  const html = launcher(m, { claude: '/b/claude' })
  const start = html.match(/<button\b[^>]*data-onboarding-start[\s\S]*?<\/button>/)?.[0] ?? ''
  const create = html.match(/<button\b[^>]*data-onboarding-create[\s\S]*?<\/button>/)?.[0] ?? ''
  const outcome = typeof m.startVerbHint === 'function' ? [m.startVerbHint(undefined, false), m.startVerbHint(undefined, true), m.startVerbHint('folder', false)] : []
  return { pass: /data-launcher-verb-hint="start"[^>]*>Describe the task first</.test(start) &&
    /^An agent works on it/.test(outcome[0] ?? '') && /this folder/.test(outcome[1] ?? '') && /^An agent works on it/.test(outcome[2] ?? '') &&
    /data-launcher-verb-hint="create"[^>]*>Add an object/.test(create) &&
    /data-onboarding-summary=/.test(html), detail: { start: start.slice(0, 400), create, outcome } }
})
// M395 — revamp.launcher.1/.2. Step 3 is a CHOICE and says so, never step 1's
// question again; the empty canvas's Create… promises what its sheet offers.
check(LAUNCHER, 'revamp.launcher.1 step 3 is labelled "Choose how to start", no step repeats "what you want to work on", and a disabled Start task names its reason on the control', (m) => {
  const html = launcher(m, { claude: '/b/claude' })
  const step3 = html.match(/<li\b[^>]*data-launcher-step="start"[\s\S]*?<\/li>/)?.[0] ?? ''
  const start = html.match(/<button\b[^>]*data-onboarding-start[\s\S]*?<\/button>/)?.[0] ?? ''
  return { pass: /data-launcher-step-label="start"[^>]*>Choose how to start</.test(step3) && !/what you want to work on/i.test(html) &&
    /\bdisabled=""/.test(start) && /Describe the task first/.test(start), detail: { step3: step3.slice(0, 300), start: start.slice(0, 300) } }
})
check(LAUNCHER, 'revamp.launcher.2 the Create… line names exactly what the create sheet offers — an agent, a terminal, a conversation, a workflow — and never a note or a file the sheet cannot make', (m) => {
  const html = launcher(m, { claude: '/b/claude' })
  const create = html.match(/<button\b[^>]*data-onboarding-create[\s\S]*?<\/button>/)?.[0] ?? ''
  const hint = create.match(/data-launcher-verb-hint="create"[^>]*>([^<]*)</)?.[1] ?? ''
  return { pass: hint === m.CREATE_SHEET_OFFERS && ['agent', 'terminal', 'conversation', 'workflow'].every((w) => hint.includes(w)) && !/\bnote\b|\bfile\b/.test(hint), detail: { hint } }
})
check(LAUNCHER, 'fr.launcher.3 the tmux notice and the engine status sit BELOW the action — after the start step in document order', (m) => {
  const html = launcher(m, { claude: '/b/claude' }, { tmux: 'no tmux', onDismissTmux: noop })
  const at = (s) => html.indexOf(s)
  return { pass: at('data-launcher-tmux') > at('data-onboarding-start') && at('data-onboarding-engine') > at('data-onboarding-start') && at('data-launcher-tmux') !== -1,
    detail: { tmux: at('data-launcher-tmux'), engine: at('data-onboarding-engine'), start: at('data-onboarding-start') } }
})
check(LAUNCHER, 'fr.launcher.4 recent folders are a list of rows — name, short path, last used — and More ways to start carries Terminal, Workflow, File and Blank canvas', (m) => {
  const html = launcher(m, { claude: '/b/claude' }, { recents: ['/Users/a/code/app'], recentUsed: { '/Users/a/code/app': NOW - 60 * 60e3 } })
  const row = tag(html, 'data-launcher-recent') ?? ''
  const more = html.match(/<details\b[^>]*data-launcher-more[\s\S]*<\/details>/)?.[0] ?? ''
  return { pass: /<ul\b[^>]*data-launcher-recents/.test(html) && /launcher__recent-name">app</.test(row) && /1 h ago/.test(row) &&
    ['data-launcher-terminal', 'data-launcher-workflow', 'data-launcher-open-file', 'data-launcher-blank', 'data-launcher-sheet'].every((a) => more.includes(a)), detail: { row } }
})

const SPAWN = load('src/renderer/palette/SpawnSheet.tsx', 'first-run-spawn.cjs', true)
const sheetModel = (extra = {}) => ({
  presets: [{ id: 'claude', name: 'Claude', available: true, agent: 'claude-code' }, { id: 'shell', name: 'Shell', available: true }], defaultPresetId: 'claude',
  recents: [], panelDirs: [], submit: async () => ({ kind: 'spawned' }), claudeAvailable: true, codexAvailable: false, ...extra
})
check(SPAWN, 'fr.sheet.1 New panel speaks plainly — Folder, Agent, Runtime; the defaults said as Claude Code · Standard effort · Default model; the kind explained', (m) => {
  const html = renderToStaticMarkup(createElement(m.SpawnSheet, { model: sheetModel(), onDone: noop, onCancel: noop }))
  const labels = [...html.matchAll(/class="sheet__label[^"]*">([^<]+)</g)].map((x) => x[1])
  const defaults = html.match(/data-sheet-defaults[^>]*>([^<]+)</)?.[1]
  return { pass: ['Folder', 'Agent', 'Runtime'].every((l) => labels.includes(l)) && !labels.some((l) => /^(where|what|how)$/i.test(l)) &&
    defaults === 'Claude Code · Standard effort · Default model' && /data-sheet-kind="agent"/.test(html), detail: { labels, defaults } }
})
check(SPAWN, 'fr.sheet.2 environment variables are under a closed Advanced; the footer has Cancel and a filled Create panel beside the keys; the Task switch leads when offered', (m) => {
  const shell = renderToStaticMarkup(createElement(m.SpawnSheet, { model: sheetModel({ defaultPresetId: 'shell', startTask: noop }), onDone: noop, onCancel: noop }))
  const adv = shell.match(/<details\b[^>]*data-sheet-advanced[^>]*>[\s\S]*?<\/details>/)?.[0] ?? ''
  const tabs = [...shell.matchAll(/data-sheet-switch-to="([^"]+)"/g)].map((x) => x[1]).join(',')
  return { pass: adv.includes('data-sheet-env') && !/<details\b[^>]*\bopen\b/.test(adv) && />Cancel</.test(tag(shell, 'data-sheet-cancel') ?? '') &&
    /is-primary[^>]*>Create panel</.test(tag(shell, 'data-sheet-submit') ?? '') && tabs === 'task,panel' && /data-sheet-kind="terminal"/.test(shell), detail: { tabs, adv: adv.slice(0, 120) } }
})

const START = load('src/renderer/palette/StartWorkSheet.tsx', 'first-run-start.cjs', true)
check(START, 'fr.sheet.3 Start work has plain labels, its runtime said, and Cancel beside a filled Start task that is disabled — not hidden — until the triple is answered', (m) => {
  const model = { title: '', titleFixed: false, wanted: null, teammates: [], repositories: async () => ({ kind: 'repos', repos: [] }), submit: async () => ({ kind: 'started' }), openTeammates: noop, openPanel: noop }
  const html = renderToStaticMarkup(createElement(m.StartWorkSheet, { model, onDone: noop, onCancel: noop }))
  const submit = tag(html, 'data-start-submit') ?? ''
  return { pass: /class="sheet__label">Task</.test(html) && /class="sheet__label">Repository</.test(html) && /data-start-defaults[^>]*>Claude Code · Standard effort · Default model/.test(html) &&
    /is-primary/.test(submit) && /\bdisabled=""/.test(submit) && />Start task</.test(submit) && /data-start-cancel/.test(html) && /data-sheet-switch-to="panel"/.test(html), detail: { submit } }
})

// M323. A closed who line with Change, then a closed Options — and the issue
// route offered beside the task rather than ahead of it.
// M400 (B1) CHANGED THIS ON PURPOSE: M323 opened on Repository then Task with
// the sole placed teammate PICKED. The order is now the launcher's — Task,
// then Repository, then who — and a placed teammate is a preference the
// folder confirms, so with no folder yet the who line says the agent works in
// the folder you choose, and Automatic is the picker's selection.
check(START, 'startwork-first.dom.1 the sheet opens in the launcher\'s order — Task, then Repository, then a closed who line with Change (Automatic selected until a folder decides), Options closed and holding criteria, checks, deliverables and the arrangement, and "Start from an issue" offered as the alternate route', (m) => {
  const ada = { id: 'ada', name: 'ada', brief: '', places: ['/repo'], services: [], memory: 'ada', chats: [], messaging: false, scheduling: false }
  const model = { title: '', titleFixed: false, wanted: null, teammates: [ada], repositories: async () => ({ kind: 'repos', repos: [] }), submit: async () => ({ kind: 'started' }), openTeammates: noop, openPanel: noop, issues: async () => ({ kind: 'items', items: [] }) }
  const html = renderToStaticMarkup(createElement(m.StartWorkSheet, { model, onDone: noop, onCancel: noop }))
  const who = html.match(/<details\b[^>]*data-start-who[\s\S]*?<\/details>/)?.[0] ?? ''
  const opts = html.match(/<details\b[^>]*data-start-options[\s\S]*?<\/details>/)?.[0] ?? ''
  const openTag = (d) => /^<details\b[^>]*\bopen\b/.test(d)
  return {
    pass: html.indexOf('sheet__label">Task<') < html.indexOf('sheet__label">Repository<') && html.indexOf('sheet__label">Repository<') < html.indexOf('data-start-who') &&
      who !== '' && !openTag(who) && /data-start-who-summary[^>]*>Claude Code · works in the folder you choose/.test(who) && /Change/.test(who) && /<option value=""[^>]*selected=""[^>]*>Automatic/.test(who) &&
      opts !== '' && !openTag(opts) && ['data-start-criteria', 'data-start-checks', 'data-start-deliverables', 'data-start-swarm'].every((a) => opts.includes(a)) &&
      /data-start-issue-route="typed"[^>]*>Start from an issue instead/.test(html) && !/data-start-issue-search/.test(html),
    detail: { who: who.slice(0, 200), opts: opts.slice(0, 160) }
  }
})
// M400 CHANGED the second half ON PURPOSE: who used to open itself (on
// "Choose who does it") whenever no teammate could be preselected — the gate
// B1 removes. Several teammates and no history is now no question at all:
// the folder decides, so who stays a closed line.
check(START, 'startwork-first.dom.2 Options opens by itself when the start arrives holding a choice (an arrangement from a palette row), and who stays a closed line with several teammates and no history — the folder decides', (m) => {
  const mate = (id) => ({ id, name: id, brief: '', places: ['/r'], services: [], memory: id, chats: [], messaging: false, scheduling: false })
  const model = { title: 'x', titleFixed: false, wanted: null, teammates: [mate('ada'), mate('bo')], swarm: 'test', repositories: async () => ({ kind: 'repos', repos: [] }), submit: async () => ({ kind: 'started' }), openTeammates: noop }
  const html = renderToStaticMarkup(createElement(m.StartWorkSheet, { model, onDone: noop, onCancel: noop }))
  return { pass: !/<details\b[^>]*data-start-who[^>]*\bopen\b/.test(html) && /<details\b[^>]*data-start-options[^>]*\bopen\b/.test(html) && !/Choose who does it/.test(html), detail: html.slice(html.indexOf('data-start-who') - 80, html.indexOf('data-start-who') + 120) }
})

// M400 (B1) — start.form.1. THE REPRODUCTION, as markup: a fresh install (no
// teammate at all) opening "+ New task" showed Repository DISABLED over the
// red "no teammate yet". Now: the Repository field is never disabled, Choose…
// is offered, no refusal is on the sheet, the who line is closed, and Start
// waits only on what is missing — its own title says the task first.
check(START, 'start.form.1 with NO teammate the sheet asks what, then where (Repository enabled, Choose… offered), no "no teammate yet" refusal, who closed; Start is disabled only for a missing task', (m) => {
  const model = { title: '', titleFixed: false, wanted: null, teammates: [], repositories: async () => ({ kind: 'repos', repos: [] }), recents: ['/tmp/tc-b1-repo'], chooseFolder: async () => null, submit: async () => ({ kind: 'started' }), openTeammates: noop, openPanel: noop }
  const html = renderToStaticMarkup(createElement(m.StartWorkSheet, { model, onDone: noop, onCancel: noop }))
  const repo = html.match(/<select\b[^>]*\bdata-start-repo\b[^>]*>/)?.[0] ?? ''
  const submit = tag(html, 'data-start-submit') ?? ''
  return {
    pass: repo !== '' && !/\bdisabled=""/.test(repo) && /data-start-choose-folder[^>]*>Choose…</.test(html) &&
      !/no teammate yet/.test(html) && !/data-start-blocked/.test(html) && !/<details\b[^>]*data-start-who[^>]*\bopen\b/.test(html) &&
      html.indexOf('sheet__label">Task<') < html.indexOf('data-start-repo') && /\bdisabled=""/.test(submit) && /title="give the task a title/.test(submit) &&
      /class="sheet__title">New task</.test(html) && /aria-label="New task"/.test(html),
    detail: { repo, submit }
  }
})

// Starting the first task, #8: optional setup is grouped and phrased as a benefit, never the amber banner.
check(LAUNCHER, 'fr.setup.1 persistence is an OPTIONAL improvement — inside a closed "Improve your setup", named "Keep agents running between sessions", tmux only in its How, and no amber banner', (m) => {
  const html = launcher(m, { claude: '/b/claude' }, { tmux: 'no tmux', onDismissTmux: noop })
  const at = html.indexOf('data-launcher-improve')
  const group = at === -1 ? '' : html.slice(html.lastIndexOf('<details', at), html.indexOf('data-launcher-more', at))
  const how = group.match(/<details\b[^>]*data-launcher-tmux-details[\s\S]*?<\/details>/)?.[0] ?? ''
  const outsideHow = group.replace(how, '')
  const none = launcher(m, { claude: '/b/claude' })
  return { pass: !/\bopen\b[^>]*data-launcher-improve|data-launcher-improve[^>]*\bopen\b/.test(html) && />Improve your setup</.test(group) &&
    /Keep agents running between sessions/.test(group) && /tmux/.test(how) && !/tmux/.test(outsideHow.replace(/<[^>]*>/g, '')) &&
    /data-launcher-tmux-dismiss/.test(group) && !/launcher__banner"[^>]*data-launcher-tmux/.test(html) && !/data-launcher-improve/.test(none),
  detail: { group: group.slice(0, 300) } }
})

// Starting the first task, #9: the handoff hint follows the conversation's real state.
check(HINTS, 'fr.handoff.1 the first-task hint is worded from the live state — starting, working, answered, or "send your first message" only when nothing was sent — and says nothing once the session ended', (m) => {
  const h = m.firstTaskHint
  const got = [h(undefined, 0, true), h('starting', 0, true), h('streaming', 1, true), h('ready', 2, true), h('ready', 0, false), h('exited', 2, true)]
  return { pass: /starting/.test(got[0]) && got[0] === got[1] && /working/.test(got[2]) && /answered/.test(got[3]) && /Send your first message/.test(got[4]) &&
    got[5] === null && !/Send your first message/.test(h('ready', 0, true)), detail: got }
})
// M310. The first task is the FLAGSHIP walk: after the agent answers, the
// guide moves on to review, checks and the pull request, read off the task's
// real state — never stopping at "answered", and never skipping a step the
// state has not reached.
check(HINTS, 'fr.flagship.1 the first-task guide walks start → agent works → review → checks → pull request from the task\'s own facts, the one verb always opens the review, a lane with no changes keeps it at the agent, and a finished flow says so', (m) => {
  const g = (over) => m.flagshipGuide({ status: 'ready', turns: 2, sent: true, hasChanges: true, checksPassed: false, github: true, pr: false, ...over })
  const cur = (x) => x.steps.find((s) => s.state === 'current')?.step
  const starting = g({ status: 'starting', turns: 0 })
  const working = g({ status: 'streaming' })
  const noChanges = g({ hasChanges: false })
  const review = g({ standing: 'none' })
  const stale = g({ standing: 'stale' })
  const checks = g({ standing: 'current' })
  const pr = g({ standing: 'current', checksPassed: true })
  const done = g({ standing: 'current', checksPassed: true, pr: true })
  // M315. A typed (non-GitHub) task ends in ACCEPT, not at "ready" with the
  // work still on a side branch; it is done only once merged.
  const typedAccept = g({ standing: 'current', checksPassed: true, github: false })
  const typedDone = g({ standing: 'current', checksPassed: true, github: false, merged: true })
  return { pass: cur(starting) === 'start' && cur(working) === 'work' && working.action === undefined &&
    cur(noChanges) === 'work' && /no changes/.test(noChanges.sentence) &&
    cur(review) === 'review' && review.action === 'Review changes' && review.steps[0].state === 'done' &&
    /moved since you reviewed/.test(stale.sentence) &&
    cur(checks) === 'checks' && checks.action === 'Run checks' &&
    cur(pr) === 'pr' && pr.action === 'Open pull request' &&
    done.steps.every((s) => s.state === 'done') && /pull request open/.test(done.sentence) &&
    cur(typedAccept) === 'accept' && typedAccept.action === 'Accept…' && typedAccept.steps[4].label === 'Accept' &&
    typedDone.steps.every((s) => s.state === 'done') && /merged/.test(typedDone.sentence) &&
    g({ status: 'exited' }) === null, detail: { review, checks, pr, done: done.sentence } }
})
// The first start's continuity: the rail is the sequence a person lives
// through — starting, working, needs your input, ready to review — and a
// pending permission request outranks "working" (the session still streams
// while it waits on the PERSON, so the status alone would say "wait").
check(HINTS, 'fr.handoff.3 a waiting agent says "needs your input" over "working", in the sentence and on both rails; the task rail reads Starting › Working › Ready to review', (m) => {
  const needs = m.firstTaskHint('streaming', 1, true, true)
  const rail = m.firstTaskRail('streaming', 1, true, true)
  const calm = m.firstTaskRail('ready', 2, true)
  const g = (over) => m.flagshipGuide({ status: 'streaming', turns: 1, sent: true, hasChanges: true, checksPassed: false, github: true, pr: false, ...over })
  const waiting = g({ needsInput: true })
  const review = g({ status: 'ready', turns: 2, standing: 'none' })
  const cur = (x) => x.steps.find((s) => s.state === 'current')
  return { pass: /needs your input/.test(needs) && !/working/.test(needs) &&
    rail.find((s) => s.state === 'current')?.label === 'Needs your input' && calm.every((s) => s.state === 'done' || s.step === 'answered') &&
    waiting.needsInput === true && cur(waiting)?.label === 'Needs your input' && waiting.action === undefined &&
    review.steps.map((s) => s.label).slice(0, 3).join(' › ') === 'Starting › Working › Ready to review' && cur(review)?.step === 'review' &&
    m.firstTaskRail('exited', 1, true, true) === null && m.firstTaskHint('starting', 0, true, true) === 'Your agent is starting.',
  detail: { needs, rail, waiting: waiting.steps, review: review.steps } }
})
const VP = load('src/renderer/canvas/viewport.ts', 'first-run-viewport.cjs')
check(VP, 'fr.handoff.2 the first start frames the new task readably — never above 100% for a lone pair, and the conversation alone when the pair would fall below READABLE_SCALE', (m) => {
  const size = { width: 1400, height: 900 }
  const card = { x: 0, y: 0, w: 300, h: 200 }, chat = { x: 340, y: 0, w: 420, h: 520 }
  const small = m.fitReadable([card, chat], chat, size)
  const farCard = { x: -4000, y: -3000, w: 300, h: 200 }
  const spread = m.fitReadable([farCard, chat], chat, size)
  const chatOnly = m.fitTo([chat], size)
  return { pass: small.scale === 1 && spread.scale >= m.READABLE_SCALE && Math.min(1, chatOnly.scale) === spread.scale, detail: { small, spread } }
})

// M263. Occupied create face: one +, never a band of data-create-object pills.
const CREATE = load('src/renderer/canvas/NewObjectRow.tsx', 'first-run-create-face.cjs', true)
check(CREATE, 'create-face.1 occupied canvas shows a single Create + (data-create-open), never data-create-object pills', (m) => {
  const html = renderToStaticMarkup(createElement(m.NewObjectRow, { onOpenCreate: noop }))
  const open = tag(html, 'data-create-open') ?? ''
  return { pass: /data-create-face="plus"/.test(html) && /data-create-open/.test(open) && !/data-create-object=/.test(html) &&
    (html.match(/<button\b/g) ?? []).length === 1, detail: { html: html.slice(0, 280) } }
})
check(CREATE, 'create-face.2 create + stays when refused — disabled with a named reason, never removed', (m) => {
  const html = renderToStaticMarkup(createElement(m.NewObjectRow, { onOpenCreate: noop, disabledReason: 'leave merged view to create an object' }))
  const open = tag(html, 'data-create-open') ?? ''
  return { pass: /\bdisabled=""/.test(open) && /leave merged view/.test(open), detail: { open } }
})

// M395 — revamp.create.1. THE ONE CREATE DOOR LIVES IN THE HUD: on the HUD's
// own ground, before the zoom cluster, once; never mounted on the canvas's
// top-left corner (where it printed onto a framed panel and clipped under the
// top bar); and over an empty canvas the HUD offers no Fit verbs (nothing to
// frame) — the launcher owns that surface. Static markup plus the mount site.
const HUD = load('src/renderer/canvas/CanvasHud.tsx', 'first-run-hud.cjs', true)
check(HUD, 'revamp.create.1 the canvas\'s one Create door sits inside the HUD before the zoom cluster, the canvas mounts it nowhere else, and an empty canvas\'s HUD offers no Fit verbs', (m) => {
  const vp = { x: 0, y: 0, scale: 1 }
  const html = renderToStaticMarkup(createElement(m.CanvasHud, { viewport: vp, onZoomBy: noop, onFit: noop, fitTask: { run: noop }, create: { onOpen: noop } }))
  const empty = renderToStaticMarkup(createElement(m.CanvasHud, { viewport: vp, onZoomBy: noop, onFit: noop, fitTask: { run: noop }, empty: true }))
  const canvas = require('node:fs').readFileSync(join(ROOT, 'src/renderer/canvas/Canvas.tsx'), 'utf8')
  const once = (html.match(/data-create-open/g) ?? []).length === 1
  const first = html.indexOf('data-create-open') > -1 && html.indexOf('data-create-open') < html.indexOf('data-hud-zoom-out')
  return { pass: /^<div class="canvas-hud">/.test(html) && once && first && /data-hud-fit\b/.test(html) &&
    !/data-hud-fit/.test(empty) && /data-hud-zoom-in/.test(empty) && !/data-create-open/.test(empty) &&
    !/<NewObjectRow\b/.test(canvas) && /create=\{panels\.length > 0/.test(canvas),
    detail: { html: html.slice(0, 320), empty: empty.slice(0, 200) } }
})

console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`)
if (results.some((r) => !r.pass)) process.exitCode = 1
