// verify:pill (M249) — the bottom command pill's pure half, in plain node.
// The Electron half (focus, send, jump, rects, paste) is verify:panels:product
// pill.*. Built through esbuild like verify:checklist; a missing module leaves
// P empty so every check reads RED rather than the suite throwing (a throw
// would abort every later check — verify-suites.md's first rule).
const { buildSync } = require('esbuild')
const { existsSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')
const { ok, results } = require('./lib/checks.cjs').createChecks()
const root = join(__dirname, '..')
const entry = join(root, 'src/renderer/canvas/command-pill.ts')
let P = {}
if (existsSync(entry)) {
  mkdirSync(join(root, 'out/verify'), { recursive: true })
  buildSync({ entryPoints: [entry], outfile: join(root, 'out/verify/command-pill.cjs'), bundle: true, platform: 'node', format: 'cjs', alias: { '@shared': join(root, 'src/shared'), '@renderer': join(root, 'src/renderer') } })
  P = require('../out/verify/command-pill.cjs')
}
const rest = (facts) => (typeof P.pillRestState === 'function' ? P.pillRestState(facts) : undefined)

// One check per priority. Each fixture carries every LOWER-priority fact too,
// so a rule that checked them in the wrong order would pick the wrong one.
const a = rest({ attention: 2, running: 3, selected: 4 })
ok('pill.rest.1 attention outranks running and selection, and is plural-correct', a?.kind === 'attention' && a.text === '2 panels need you' && rest({ attention: 1, running: 0, selected: 0 })?.text === '1 panel needs you')
const taskBeat = rest({ attention: 0, running: 3, selected: 4, taskTitle: 'Ship the API' })
ok('pill.rest.task.1 with the lens on, the task title outranks running and selection; attention still wins',
  taskBeat?.kind === 'task' && taskBeat.text === 'Ship the API' &&
  rest({ attention: 1, running: 3, selected: 4, taskTitle: 'Ship the API' })?.kind === 'attention')
ok('pill.rest.task.2 blank or whitespace task title is no sentence — never invent, never zero',
  rest({ attention: 0, running: 0, selected: 0, taskTitle: '  ' })?.kind === 'empty' &&
  rest({ attention: 0, running: 1, selected: 0, taskTitle: '' })?.kind === 'running')
const r = rest({ attention: 0, running: 3, selected: 4 })
ok('pill.rest.2 with nothing waiting, running sessions outrank the selection', r?.kind === 'running' && r.text === '3 sessions running' && rest({ attention: 0, running: 1, selected: 0 })?.text === '1 session running')
const s = rest({ attention: 0, running: 0, selected: 2 })
ok('pill.rest.3 with nothing waiting or running, the selection is the state', s?.kind === 'selected' && s.text === '2 selected')
const e = rest({ attention: 0, running: 0, selected: 0 })
ok('pill.rest.4 nothing to say is an empty pill — a glyph alone, no text', e?.kind === 'empty' && e.text === '')
// M265. When the pill already says the queue, do not also toast the same fact.
ok('pill.attention.gate.1 suppress in-app queue-count restatement when rest is already attention',
  typeof P.shouldAnnounceAttentionQueue === 'function' && P.shouldAnnounceAttentionQueue('attention') === false &&
  P.shouldAnnounceAttentionQueue('running') === true && P.shouldAnnounceAttentionQueue('task') === true &&
  typeof P.isAttentionQueueRestatement === 'function' && P.isAttentionQueueRestatement('2 chats need you') === true &&
  P.isAttentionQueueRestatement('1 agent needs you') === true && P.isAttentionQueueRestatement('fitted 3 panels') === false)
// Every combination of 0..2 for the three facts: no text ever starts with 0,
// and a negative or non-finite count is treated as none, never printed.
const texts = []
for (const attention of [0, 1, 2]) for (const running of [0, 1, 2]) for (const selected of [0, 1, 2]) texts.push(rest({ attention, running, selected })?.text)
const odd = [rest({ attention: -1, running: Number.NaN, selected: 0 }), rest({ attention: 0, running: Infinity, selected: -3 })]
ok('pill.rest.zero.1 no rest state is ever a zero-value statement, and a bad count is none rather than printed', texts.length === 27 && texts.every((t) => typeof t === 'string' && !/^0\b/.test(t) && !/NaN|Infinity|-/.test(t)) && odd.every((x) => x?.kind === 'empty'), JSON.stringify({ texts, odd }))

// The orchestrator target: a supervisor first, then an orchestrator, in
// canvas order; a chat with neither mark is never the target, and neither is
// a non-chat.
const orch = (panels) => (typeof P.orchestratorTarget === 'function' ? P.orchestratorTarget(panels) : 'missing')
ok('pill.orch.1 the supervisor chat is the target, then an orchestrator chat, else none',
  orch([{ id: 'c1', kind: 'chat' }, { id: 'c2', kind: 'chat', orchestrator: true }, { id: 'c3', kind: 'chat', supervisor: true }]) === 'c3' &&
  orch([{ id: 'c1', kind: 'chat' }, { id: 'c2', kind: 'chat', orchestrator: true }]) === 'c2' &&
  orch([{ id: 'c1', kind: 'chat' }, { id: 't1', kind: 'terminal', supervisor: true }]) === null &&
  orch([]) === null)

// Running agents: a conversation that is starting or streaming, and a
// terminal started as an agent whose state is busy. A busy SHELL is a
// process, not an agent — counting it would say "3 agents running" over a
// canvas of builds.
const run = typeof P.runningAgents === 'function' ? P.runningAgents([
  { id: 'c1', kind: 'chat', chatStatus: 'streaming' },
  { id: 'c2', kind: 'chat', chatStatus: 'ready' },
  { id: 'c3', kind: 'chat', chatStatus: 'starting' },
  { id: 't1', kind: 'terminal', agent: true, agentState: 'busy' },
  { id: 't2', kind: 'terminal', agent: false, agentState: 'busy' },
  { id: 't3', kind: 'terminal', agent: true, agentState: 'idle' },
  { id: 'f1', kind: 'file' }
]) : undefined
ok('pill.running.1 running agents are starting/streaming chats and busy AGENT terminals — never a busy shell, an idle agent or a ready chat', JSON.stringify(run) === JSON.stringify(['c1', 'c3', 't1']), JSON.stringify(run))
ok('pill.rest.silhouette.1 rest copy never says N agents for the queue or running face',
  !/agents? need/.test(rest({ attention: 2, running: 0, selected: 0 })?.text ?? '') &&
  !/agents? running/.test(rest({ attention: 0, running: 2, selected: 0 })?.text ?? '') &&
  /panels need you/.test(rest({ attention: 2, running: 0, selected: 0 })?.text ?? '') &&
  /sessions running/.test(rest({ attention: 0, running: 2, selected: 0 })?.text ?? ''))

// Daily loop 4.1 — one vocabulary: the queue holds terminals AND chats, so the
// sentence never says `chats`; the old spellings still count as restatements.
ok('attention-words.1 the rest sentence never names chats over a mixed queue, and all three spellings are restatements',
  !/chat/.test(rest({ attention: 3, running: 0, selected: 0 })?.text ?? 'chat') &&
  typeof P.isAttentionQueueRestatement === 'function' &&
  ['3 panels need you', '1 panel needs you', '2 chats need you', '1 agent needs you'].every((t) => P.isAttentionQueueRestatement(t)) &&
  P.isAttentionQueueRestatement('the review chat needs you') === false)
// Daily loop 4.3 — the Cmd+J lesson shows once, only beside the attention
// sentence, and retires only after it was shown and the queue emptied.
ok('pill.hint.1 the jump hint shows untaught at attention only, and retires only after being shown',
  typeof P.showJumpHint === 'function' && typeof P.retiresJumpHint === 'function' &&
  P.showJumpHint(false, 'attention') === true && P.showJumpHint(true, 'attention') === false &&
  P.showJumpHint(false, 'running') === false &&
  P.retiresJumpHint(true, 'empty') === true && P.retiresJumpHint(true, 'attention') === false &&
  P.retiresJumpHint(false, 'empty') === false)

const failed = results.filter((x) => !x.pass)
console.log(`[verify:pill] ${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length === 0 ? 0 : 1)
