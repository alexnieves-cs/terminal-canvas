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
check(HINTS, 'fr.hints.1 a gesture hint appears only after its attempt and alone; a seen one never returns; the attempt rule maps each input', (m) => {
  const rest = m.contextualHint(new Set(), null)
  const zoom = m.contextualHint(new Set(), 'zoom')
  const seen = m.contextualHint(new Set(['zoom']), 'zoom')
  const tmux = m.contextualHint(new Set(), 'tmux')
  const a = [m.attemptOf({ type: 'mousedown', button: 0 }), m.attemptOf({ type: 'wheel', deltaMode: 1 }), m.attemptOf({ type: 'wheel', deltaMode: 0 }),
    m.attemptOf({ type: 'wheel', deltaMode: 1, ctrlKey: true }), m.attemptOf({ type: 'dblclick' }), m.attemptOf({ type: 'keydown', key: 'a' }), m.attemptOf({ type: 'keydown', key: 'k', metaKey: true })]
  return { pass: rest.length === 0 && zoom.length === 1 && zoom[0].id === 'zoom' && seen.length === 0 && tmux.length === 0 &&
    JSON.stringify(a) === JSON.stringify(['pan', 'zoom', null, null, 'new-panel', 'palette', null]), detail: { a, zoom } }
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

console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`)
if (results.some((r) => !r.pass)) process.exitCode = 1
