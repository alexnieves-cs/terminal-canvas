/* Lane L-D (M445). Sessions triage. Plain node. Ids stay scoped.
   rd-l-d.0 stays: the seam is still the registration proof.

   The first run on this machine threw MODULE_NOT_FOUND for esbuild,
   because node_modules was not installed yet. That is the environment,
   not the model. The checks below call sessions-model.ts. */
'use strict'
const { existsSync, mkdirSync, readFileSync } = require('node:fs')
const { join } = require('node:path')
const { buildSync } = require('esbuild')
const { ok, results } = require('./lib/checks.cjs').createChecks()

const ROOT = join(__dirname, '..')
const read = (rel) => {
  const p = join(ROOT, rel)
  return existsSync(p) ? readFileSync(p, 'utf8') : null
}

const css = read('src/renderer/styles.css') || ''
const contracts = read('src/shared/redesign-contracts.ts') || ''
const own = JSON.parse(read('docs/redesign/ownership.json'))
const open = '/* ── rd:L-D ── */'
const close = '/* ── /rd:L-D ── */'
const spanStart = css.indexOf(open)
const spanEnd = css.indexOf(close)
const span = spanStart >= 0 && spanEnd > spanStart ? css.slice(spanStart, spanEnd + close.length) : ''

ok('rd-l-d.0 seam present',
  css.includes(open) && spanEnd > spanStart &&
  /export type StateTone/.test(contracts) &&
  Array.isArray(own.lanes['L-D']) && own.lanes['L-D'].some((g) => g.endsWith('verify-rd-l-d.cjs')),
  'styles.css markers, redesign-contracts StateTone, ownership entry')

const OUT = join(ROOT, 'out', 'verify', 'rd-l-d.cjs')
mkdirSync(join(ROOT, 'out', 'verify'), { recursive: true })
buildSync({
  stdin: {
    contents: `
      export {
        sessionsTitle, headerSpend, groupRows, groupHeading, sortFacts, filterFacts,
        bulkBar, bulkEligible, cardActions, cardTone, replyBox, enterSubmits,
        sparkline, formatUsd, formatRun, survivesFact, endAsk, factsFromSources,
        parseFeed, engineLabel, folderName, SESSIONS_FEED_EVENT, SNOOZE_MS, appendTail
      } from '../src/renderer/sessions/sessions-model'
      export { STATE_PALETTE, TONE_TO_TOKEN } from '../src/shared/state-palette'
    `,
    resolveDir: __dirname,
    sourcefile: 'rd-l-d-entry.ts',
    loader: 'ts'
  },
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  alias: {
    '@shared': join(ROOT, 'src', 'shared'),
    '@renderer': join(ROOT, 'src', 'renderer')
  },
  logLevel: 'silent'
})
const M = require(OUT)

const fact = (over) => ({
  id: 'a',
  name: 'Claude — ledger-export',
  agent: 'claude',
  folder: 'ledger-export',
  branch: 'feature/csv-export',
  word: 'idle',
  tone: 'idle',
  activity: [],
  startedAt: null,
  now: 1_700_000_000_000,
  costUsd: null,
  lastLine: '',
  taskId: null,
  taskTitle: null,
  taskTicket: null,
  shell: false,
  survives: null,
  tokens: null,
  changes: null,
  canPaste: true,
  kind: 'terminal',
  ...over
})

{
  const live = [fact({ id: '1', tone: 'idle' }), fact({ id: '2', tone: 'working' }), fact({ id: '3', tone: 'needs-you' })]
  const mixed = [...live, fact({ id: '4', tone: 'asleep' }), fact({ id: '5', tone: 'asleep' })]
  const onlyAsleep = [fact({ id: '4', tone: 'asleep' }), fact({ id: '5', tone: 'asleep' })]
  const none = []
  const one = [fact({ id: '1', tone: 'idle' })]
  const titles = [M.sessionsTitle(live), M.sessionsTitle(mixed), M.sessionsTitle(onlyAsleep), M.sessionsTitle(none), M.sessionsTitle(one)]
  ok('rd-sessions.header.1 a zero dormant count is dropped, a zero live count is dropped, and a positive count is kept',
    titles[0] === 'Sessions · 3 live' && !/dormant/.test(titles[0]) &&
    titles[1] === 'Sessions · 3 live · 2 dormant' &&
    titles[2] === 'Sessions · 2 dormant' && !/0 live/.test(titles[2]) &&
    titles[3] === 'Sessions' &&
    titles[4] === 'Sessions · 1 live' &&
    !titles.some((t) => /0 dormant|0 live/.test(t)),
    JSON.stringify(titles))
}

{
  const rows = [
    fact({ id: 'c', taskId: 'plaid', taskTitle: 'Plaid webhook retry', taskTicket: 'SW-398' }),
    fact({ id: 'a', taskId: 'ledger', taskTitle: 'Ledger CSV export', taskTicket: 'SW-412' }),
    fact({ id: 'b', taskId: 'ledger', taskTitle: 'Ledger CSV export', taskTicket: 'SW-412' }),
    fact({ id: 'z' }),
    fact({ id: 'y' })
  ]
  const groups = M.groupRows(rows)
  const loose = groups[groups.length - 1]
  ok('rd-sessions.group.1 rows group by task in first-seen order, and a session with no task stays in one trailing group',
    groups.length === 3 &&
    groups[0].id === 'plaid' && groups[0].rows.map((r) => r.id).join(',') === 'c' &&
    groups[1].id === 'ledger' && groups[1].rows.map((r) => r.id).join(',') === 'a,b' &&
    M.groupHeading(groups[1]) === 'Ledger CSV export · SW-412' &&
    loose.id === '' && loose.title === null && loose.rows.map((r) => r.id).join(',') === 'z,y' &&
    M.groupHeading(loose) === null,
    JSON.stringify(groups.map((g) => [g.id, g.rows.map((r) => r.id)])))
}

{
  const none = M.bulkBar(0)
  const one = M.bulkBar(1)
  const many = M.bulkBar(3)
  const ask = M.endAsk(2)
  ok('rd-sessions.bulk.1 no selection is silence, a selection names the four verbs, and End confirms',
    none === null &&
    one !== null && one.label === '1 selected' && one.endConfirms === true &&
    many !== null && many.label === '3 selected' &&
    many.verbs.join('|') === 'Pause|Restart|Move to task…|End' &&
    ask.verb === 'End' && /Cancel/.test(ask.detail) && !/0 selected/.test(one.label + many.label),
    JSON.stringify({ one, many, ask }))
}

{
  const asleep = M.bulkEligible([fact({ tone: 'asleep' })])
  const going = M.bulkEligible([fact({ tone: 'working' }), fact({ tone: 'asleep' })])
  const empty = M.bulkEligible([])
  ok('rd-sessions.bulk.2 an asleep selection cannot pause, a going session can, and End stays available whenever something is selected',
    asleep.pause === false && asleep.end === true && asleep.restart === true &&
    going.pause === true && going.end === true &&
    empty.pause === false && empty.end === false,
    JSON.stringify({ asleep, going, empty }))
}

{
  const kinds = ['approval', 'question', 'shell-prompt', 'failed', 'recovery']
  const cards = Object.fromEntries(kinds.map((k) => [k, M.cardActions(k)]))
  const shell = cards['shell-prompt']
  const approval = cards.approval
  const failed = cards.failed
  ok('rd-sessions.card.1 approval, shell prompt and failure carry their verbs, and no card has an answer field',
    approval.answerField === false && approval.actions.map((a) => a.label).join('|') === 'Allow|Diff|Deny' &&
    shell.answerField === false && shell.actions.map((a) => a.label).join('|') === 'Open on canvas|Snooze 10m' &&
    failed.answerField === false && failed.actions.map((a) => a.label).join('|') === 'Restart|Read log' &&
    kinds.every((k) => cards[k].answerField === false) &&
    M.cardTone('shell-prompt') === 'needs-you' && M.cardTone('failed') === 'exited',
    JSON.stringify(cards))
}

{
  const shell = M.replyBox(true, true)
  const held = M.replyBox(false, false)
  const open = M.replyBox(false, true)
  ok('rd-sessions.reply.1 a shell cannot send, paste is the delivery, and Enter does not submit',
    shell.enabled === false && typeof shell.reason === 'string' && shell.reason.length > 0 &&
    held.enabled === false && held.reason !== null &&
    open.enabled === true && open.reason === null &&
    shell.delivery === 'paste' && open.delivery === 'paste' &&
    shell.explicitSend === true && open.explicitSend === true &&
    M.enterSubmits() === false,
    JSON.stringify({ shell, held, open }))
}

{
  const stroke = M.STATE_PALETTE.dark[M.TONE_TO_TOKEN.working]
  const line = M.sparkline([1, 3, 2], 'working', 'dark')
  const empty = M.sparkline([4], 'working', 'dark')
  const model = read('src/renderer/sessions/sessions-model.ts') || ''
  const spark = read('src/renderer/sessions/Sparkline.tsx') || ''
  const hexes = new Set(Object.values(M.STATE_PALETTE.dark).concat(Object.values(M.STATE_PALETTE.light)).map((h) => h.toLowerCase()))
  const body = (model + '\n' + spark).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  const leaked = [...body.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0].toLowerCase()).filter((h) => hexes.has(h))
  ok('rd-sessions.spark.1 the sparkline stroke is the palette token for the tone, one sample draws nothing, and the source holds no state hex',
    line.stroke === stroke && line.d.startsWith('M') && line.d.includes('L') &&
    empty.d === '' && empty.stroke === stroke &&
    leaked.length === 0,
    JSON.stringify({ stroke, d: line.d, leaked }))
}

{
  const sum = M.headerSpend([fact({ costUsd: 1.5 }), fact({ costUsd: null }), fact({ costUsd: 0 }), fact({ costUsd: 2 })])
  const none = M.headerSpend([fact({ costUsd: null }), fact({ costUsd: 0 })])
  ok('rd-sessions.cost.1 a positive spend is dollars in the header, and zero is silence',
    sum === '$3.50' && none === null && M.formatUsd(1) === '$1.00' &&
    M.formatRun(1_700_000_000_000 - 60_000, 1_700_000_000_000) === '1m' &&
    M.formatRun(null, 1_700_000_000_000) === '',
    JSON.stringify({ sum, none }))
}

{
  ok('rd-sessions.survive.1 the tmux fact is said only when the session survives',
    M.survivesFact(true) === 'reload and quit (tmux)' &&
    M.survivesFact(false) === null &&
    M.survivesFact(null) === null,
    'survive')
}

{
  const panels = [
    { id: 'claude', kind: 'terminal', title: 'Claude — ledger-export', cwd: '/work/ledger-export', engine: 'claude-code', shell: false },
    { id: 'shell', kind: 'terminal', title: 'shell — infra', cwd: '/work/infra', shell: true },
    { id: 'note', kind: 'terminal', title: 'twice', cwd: '/work/x', shell: true }
  ]
  const tasks = [
    { id: 'ledger', title: 'Ledger CSV export', ticket: 'SW-412', panelId: 'claude' },
    { id: 'other', title: 'Other', ticket: null, panelId: 'note' },
    { id: 'also', title: 'Also', ticket: null, panelId: 'note' }
  ]
  const read = {
    word: () => ({ word: 'idle', tone: 'idle' }),
    lastLine: (id) => (id === 'claude' ? 'Writing tests' : ''),
    costUsd: () => null,
    startedAt: () => null,
    survives: () => null,
    tokens: () => null,
    changes: () => null,
    branch: (id) => (id === 'claude' ? 'feature/csv-export' : ''),
    activity: () => []
  }
  const facts = M.factsFromSources(panels, tasks, 10, read)
  const claude = facts.find((f) => f.id === 'claude')
  const shell = facts.find((f) => f.id === 'shell')
  const twice = facts.find((f) => f.id === 'note')
  ok('rd-sessions.source.1 a terminal and a shell become rows, a panel named by two tasks is not assigned, and a non-session kind is refused by the caller',
    facts.length === 3 &&
    claude.agent === 'claude' && claude.folder === 'ledger-export' && claude.taskId === 'ledger' &&
    claude.branch === 'feature/csv-export' && claude.lastLine === 'Writing tests' && claude.shell === false &&
    shell.agent === 'shell' && shell.shell === true && shell.taskId === null &&
    twice.taskId === null &&
    M.engineLabel('claude-code', false) === 'claude' && M.engineLabel(undefined, true) === 'shell' &&
    M.folderName('/work/ledger-export/') === 'ledger-export',
    JSON.stringify(facts.map((f) => [f.id, f.agent, f.taskId])))
}

{
  const good = M.parseFeed([{ id: 'a', name: 'A', tone: 'idle', word: 'idle', shell: false }])
  const badTone = M.parseFeed([{ id: 'a', name: 'A', tone: 'nope', word: 'idle', shell: false }])
  const notArray = M.parseFeed({ id: 'a' })
  ok('rd-sessions.feed.1 a feed of facts is accepted, and a bad tone or a non-array is refused',
    Array.isArray(good) && good.length === 1 && good[0].id === 'a' && good[0].canPaste === false &&
    badTone === null && notArray === null &&
    M.SESSIONS_FEED_EVENT === 'tc-sessions-feed' && M.SNOOZE_MS === 600000 &&
    M.appendTail(['hi'], ' there\nnext', 80).join('|') === 'hi there|next',
    JSON.stringify({ good, badTone, notArray }))
}

{
  const styles = read('scripts/verify-styles.cjs') || ''
  const sessionsDir = join(ROOT, 'src', 'renderer', 'sessions')
  const { readdirSync } = require('node:fs')
  const files = readdirSync(sessionsDir).filter((n) => /\.tsx?$/.test(n))
  const machine = files.filter((n) => /data-machine-cost/.test(read(join('src', 'renderer', 'sessions', n)) || ''))
  ok('rd-sessions.metrics.1 sessions may show a cost column and must not host the inspector CPU readout; metrics.1 stays in verify-styles',
    /ok\('metrics\.1'/.test(styles) &&
    machine.length === 0 &&
    /\.sessions-cost\b/.test(span) &&
    !/data-machine-cost/.test(span) &&
    !/\.panel__machine-cost/.test(span),
    JSON.stringify({ machine, hasCostRule: /\.sessions-cost\b/.test(span) }))
}

{
  const detail = read('src/renderer/sessions/SessionDetail.tsx') || ''
  const stripped = detail.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  ok('rd-sessions.paste.1 the reply box sends from a button, Enter does not submit, and the file does not write to a pty',
    /type="button"/.test(detail) && />Send</.test(detail) &&
    /preventDefault/.test(stripped) && /Enter/.test(stripped) &&
    !/pty\.write/.test(stripped) && !/\.write\(/.test(stripped) &&
    /delivery: 'paste'|replyBox\(/.test(stripped),
    'SessionDetail')
}

{
  const cards = read('src/renderer/sessions/AttentionCards.tsx') || ''
  const stripped = cards.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  ok('rd-sessions.shellcard.1 an attention card has no answer field',
    !/<input\b/.test(stripped) && !/<textarea\b/.test(stripped) &&
    /cardActions\(/.test(stripped),
    'AttentionCards')
}

{
  const shortcuts = read('src/shared/shortcuts.ts') || ''
  const chrome = read('src/renderer/shell/useShellChrome.ts') || ''
  const host = read('src/renderer/sessions/SessionsHost.tsx') || ''
  ok('rd-sessions.chord.1 ⌘⇧S is the registry chord and the shell toggles Sessions; the host does not bind a second one',
    /id: 'sessions', chord: '⌘⇧S'/.test(shortcuts) &&
    /event\.code === 'KeyS'/.test(chrome) && /'sessions'/.test(chrome) &&
    !/addEventListener\('keydown'/.test(host),
    'chord')
}

{
  const host = read('src/renderer/sessions/SessionsHost.tsx') || ''
  const stripped = host.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  ok('rd-sessions.end.1 End asks through the caller that holds main\'s dialog, and this page does not invent one',
    /endAsk\(/.test(stripped) && /confirmEnd/.test(stripped) &&
    !/window\.confirm/.test(stripped) && !/pty\.kill/.test(stripped),
    'end')
}

{
  const sorted = M.sortFacts([
    fact({ id: 'b', name: 'b', costUsd: 2 }),
    fact({ id: 'a', name: 'a', costUsd: null }),
    fact({ id: 'c', name: 'c', costUsd: 1 })
  ], 'cost', -1)
  const kept = M.sortFacts([fact({ id: 'b' }), fact({ id: 'a' })], null, 1).map((f) => f.id).join(',')
  ok('rd-sessions.sort.1 a cost sort puts an unpriced session last, and no key keeps the given order',
    sorted.map((f) => f.id).join(',') === 'b,c,a' && kept === 'b,a',
    JSON.stringify(sorted.map((f) => f.id)))
}

const passed = results.filter((r) => r.pass).length
console.log('\n' + passed + '/' + results.length + ' passed')
if (results.some((r) => !r.pass)) process.exitCode = 1
