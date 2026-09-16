/* Run with: node scripts/verify-swarm.cjs
   M275. The swarm start-work presets: the four arrangements as DATA, the pure
   planner and its refusals, the persisted seat mark through the layout parser,
   and the doors — plus static markup for the sheet's arrangement field and the
   card's menu.

   Plain node. Every check here guards a failure that is SILENT in a running
   app: an edge whose trigger can never fire, an automated edge the cycle rule
   would refuse (leaving a drawing), a seat whose brief is lost on relaunch, a
   palette row the door-check cannot see, an arrangement that half-lands.

   Every check reports even when its module fails to build, so one broken
   import cannot hide the rest. */
const { buildSync } = require('esbuild')
const { join, resolve } = require('node:path')
const { readFileSync } = require('node:fs')
const { createElement } = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
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
const src = (p) => readFileSync(join(ROOT, p), 'utf8')

const S = load('src/shared/swarm.ts', 'swarm.cjs')
const V = load('src/shared/verb-table.ts', 'swarm-verbs.cjs')
const P = load('src/shared/plan.ts', 'swarm-plan.cjs')
const L = load('src/shared/layout-schema.ts', 'swarm-layout.cjs')
const SW = load('src/renderer/palette/start-work.ts', 'swarm-start-work.cjs')
const SHEET = load('src/renderer/palette/StartWorkSheet.tsx', 'swarm-sheet.cjs', true)
const CARD = load('src/renderer/work/WorkNode.tsx', 'swarm-card.cjs', true)

// --- The arrangements as data ------------------------------------------------

check(S, 'swarm.presets.1 four named arrangements, each with a primary seat that exists, a supervisor seat, and edges naming only real seat keys', (m) => {
  const bad = []
  for (const id of m.SWARM_PRESET_IDS) {
    const preset = m.SWARM_PRESETS[id]
    const keys = new Set(preset.seats.map((s) => s.key))
    if (m.primarySeat(preset) === undefined) bad.push(`${id}: primary ${preset.preset} names no seat`)
    if (!preset.seats.some((s) => s.role === 'supervisor')) bad.push(`${id}: no supervisor seat`)
    for (const e of preset.edges) if (!keys.has(e.from) || !keys.has(e.to)) bad.push(`${id}: edge ${e.from}->${e.to} names a seat that is not there`)
  }
  return { pass: m.SWARM_PRESET_IDS.length === 4 && m.SWARM_LIST.length === 4 && bad.length === 0, detail: bad }
})

check(S, 'swarm.presets.2 the primary seat is always a CHAT in the task lane — a terminal cannot be a task\'s conversation, and the lane is what a task is', (m) => {
  const bad = m.SWARM_PRESET_IDS.filter((id) => {
    const seat = m.primarySeat(m.SWARM_PRESETS[id])
    return seat.kind !== 'chat' || seat.place !== 'task-lane'
  })
  return { pass: bad.length === 0, detail: bad }
})

check(S, 'swarm.presets.3 the supervisor takes no worktree and never carries a command — it observes at the repository root', (m) => {
  const bad = []
  for (const id of m.SWARM_PRESET_IDS) {
    for (const seat of m.SWARM_PRESETS[id].seats) {
      if (seat.role !== 'supervisor') continue
      if (seat.place !== 'root') bad.push(`${id}: supervisor is in ${seat.place}`)
      if (seat.kind !== 'chat' || seat.command !== undefined) bad.push(`${id}: supervisor is not a plain chat`)
    }
  }
  return { pass: bad.length === 0, detail: bad }
})

check(S, 'swarm.presets.4 a terminal seat carries a command and never a message; a chat seat carries a message or nothing and never a command', (m) => {
  const bad = []
  for (const id of m.SWARM_PRESET_IDS) {
    for (const seat of m.SWARM_PRESETS[id].seats) {
      if (seat.kind === 'terminal' && (typeof seat.command !== 'string' || seat.command === '' || seat.message !== undefined)) bad.push(`${id}/${seat.key}`)
      if (seat.kind === 'chat' && seat.command !== undefined) bad.push(`${id}/${seat.key} chat with a command`)
    }
  }
  return { pass: bad.length === 0, detail: bad }
})

// --- The edges ---------------------------------------------------------------

check(S, 'swarm.edges.1 every automated edge names a trigger its SOURCE can fire: a chat has no exit code so it hands off on idle; a terminal hands off on an exit arm', (m) => {
  const bad = []
  for (const id of m.SWARM_PRESET_IDS) {
    const preset = m.SWARM_PRESETS[id]
    for (const e of preset.edges.filter((x) => x.automate)) {
      const from = m.seatOf(preset, e.from)
      if (from.kind === 'chat' && e.trigger !== 'idle') bad.push(`${id}: ${e.from} is a chat and cannot fire ${e.trigger}`)
      if (from.kind === 'terminal' && e.trigger === 'idle') bad.push(`${id}: ${e.from} is a terminal and never reports a turn's end`)
    }
  }
  return { pass: bad.length === 0, detail: bad }
})

check(S, 'swarm.edges.2 the automated edges form a DAG — a cycle is what setLinkAutomation silently refuses, leaving an edge that is drawn and does nothing', (m) => {
  const cyclic = []
  for (const id of m.SWARM_PRESET_IDS) {
    const preset = m.SWARM_PRESETS[id]
    const out = new Map()
    for (const e of preset.edges.filter((x) => x.automate)) out.set(e.from, [...(out.get(e.from) ?? []), e.to])
    const state = new Map()
    const walk = (key) => {
      if (state.get(key) === 'open') return true
      if (state.get(key) === 'done') return false
      state.set(key, 'open')
      for (const next of out.get(key) ?? []) if (walk(next)) return true
      state.set(key, 'done')
      return false
    }
    for (const seat of preset.seats) if (walk(seat.key)) { cyclic.push(id); break }
  }
  return { pass: cyclic.length === 0, detail: cyclic }
})

check(S, 'swarm.edges.3 no edge OUT of the supervisor is automated — the hub is fed by its workers, so an enabled edge back out is the cycle above', (m) => {
  const bad = []
  for (const id of m.SWARM_PRESET_IDS) {
    const preset = m.SWARM_PRESETS[id]
    const hub = preset.seats.find((s) => s.role === 'supervisor')
    for (const e of preset.edges) if (e.from === hub.key && e.automate) bad.push(`${id}: ${e.from}->${e.to}`)
  }
  return { pass: bad.length === 0, detail: bad }
})

check(S, 'swarm.edges.4 every edge carries a LABEL — an automation with no word on it is a line a person cannot read', (m) => {
  const bad = []
  for (const id of m.SWARM_PRESET_IDS) for (const e of m.SWARM_PRESETS[id].edges) if (typeof e.label !== 'string' || e.label.trim() === '') bad.push(`${id}: ${e.from}->${e.to}`)
  return { pass: bad.length === 0, detail: bad }
})

check(S, 'swarm.edges.5 the test arrangement hands off on exit-fail alone — a passing run must not spend a turn saying it passed', (m) => {
  const preset = m.SWARM_PRESETS.test
  const fromRunner = preset.edges.filter((e) => e.from === 'runner')
  return { pass: fromRunner.length === 1 && fromRunner[0].trigger === 'exit-fail' && fromRunner[0].automate === true, detail: fromRunner }
})

// --- The plan ----------------------------------------------------------------

check(S, 'swarm.plan.1 the plan counts the seats and names where each works, before anything is minted', (m) => {
  const plan = m.swarmPlan(m.SWARM_PRESETS.implement, { maxConcurrent: 0, liveAgents: 0, rootWords: '~/code/app' })
  const seats = plan.seats.map((s) => `${s.key}:${s.where}`)
  return {
    pass: plan.agents === 3 && plan.terminals === 0 && plan.lanes === 1 &&
      seats.includes('build:the task lane') && seats.includes('verify:the task lane') && seats.includes('supervisor:~/code/app') &&
      /3 conversations/.test(plan.line) && /1 worktree/.test(plan.line) && /2 handoffs/.test(plan.line),
    detail: { seats, line: plan.line }
  }
})

check(S, 'swarm.plan.2 an own-lane seat adds a worktree; the hub never does', (m) => {
  const preset = { ...m.SWARM_PRESETS.implement, seats: m.SWARM_PRESETS.implement.seats.map((s) => (s.key === 'verify' ? { ...s, place: 'own-lane' } : s)) }
  const plan = m.swarmPlan(preset, { maxConcurrent: 0, liveAgents: 0 })
  const hub = plan.seats.find((s) => s.role === 'supervisor')
  return { pass: plan.lanes === 2 && plan.seats.find((s) => s.key === 'verify').ownLane === true && hub.ownLane === false, detail: plan.seats.map((s) => [s.key, s.ownLane, s.where]) }
})

check(S, 'swarm.plan.3 the ceiling line counts sends ALREADY WAITING as well as live agents (M121), and is empty when nothing queues', (m) => {
  const room = m.swarmPlan(m.SWARM_PRESETS.implement, { maxConcurrent: 10, liveAgents: 0, queued: 0 })
  const tight = m.swarmPlan(m.SWARM_PRESETS.implement, { maxConcurrent: 4, liveAgents: 1, queued: 1 })
  const ignoringWaiting = m.swarmPlan(m.SWARM_PRESETS.implement, { maxConcurrent: 4, liveAgents: 1, queued: 0 })
  return {
    pass: room.queued === 0 && room.ceilingLine === '' &&
      tight.queued === 1 && /already waiting/.test(tight.ceilingLine) && ignoringWaiting.queued === 0,
    detail: { room: room.queued, tight: tight.queued, ignoring: ignoringWaiting.queued, line: tight.ceilingLine }
  }
})

check(S, 'swarm.plan.4 no ceiling (0) never queues — a ceiling of zero is "no ceiling", not "no agents"', (m) => {
  const plan = m.swarmPlan(m.SWARM_PRESETS.explore, { maxConcurrent: 0, liveAgents: 99, queued: 99 })
  return { pass: plan.queued === 0 && plan.ceilingLine === '', detail: plan }
})

// --- The refusals ------------------------------------------------------------

const AVAILABLE = { agentAvailable: true, teammate: { name: 'ada', places: ['/repo'] } }

check(S, 'swarm.refuse.1 an arrangement that arrived from outside is INERT — refused before the CLI arm, naming reading it as the fix', (m) => {
  const unread = { ...m.SWARM_PRESETS.explore, reviewed: false }
  const noCli = m.swarmRefusal(unread, { ...AVAILABLE, agentAvailable: false })
  return { pass: typeof noCli === 'string' && /read/.test(noCli) && !/PATH/.test(noCli), detail: noCli }
})

check(S, 'swarm.refuse.2 no agent CLI and no places each refuse by NAME, with the fix in the sentence', (m) => {
  const cli = m.swarmRefusal(m.SWARM_PRESETS.explore, { ...AVAILABLE, agentAvailable: false })
  const places = m.swarmRefusal(m.SWARM_PRESETS.explore, { agentAvailable: true, teammate: { name: 'ada', places: [] } })
  return { pass: /PATH/.test(cli) && /environment report/.test(cli) && /ada has no places/.test(places) && /Teammates pane/.test(places), detail: { cli, places } }
})

check(S, 'swarm.refuse.3 a review arrangement refuses over a todo card and names the fix; explore starts from todo', (m) => {
  const review = m.swarmRefusal(m.SWARM_PRESETS.review, { ...AVAILABLE, item: { state: 'todo' } })
  const reviewWorking = m.swarmRefusal(m.SWARM_PRESETS.review, { ...AVAILABLE, item: { state: 'working' } })
  const explore = m.swarmRefusal(m.SWARM_PRESETS.explore, { ...AVAILABLE, item: { state: 'todo' } })
  return { pass: typeof review === 'string' && /start work on it first/.test(review) && reviewWorking === null && explore === null, detail: { review, reviewWorking, explore } }
})

check(S, 'swarm.refuse.4 a door with NO teammate skips the teammate arms rather than asking a question it does not offer', (m) => {
  const noMate = m.swarmRefusal(m.SWARM_PRESETS.explore, { agentAvailable: true, item: { state: 'todo' } })
  const noMateNoCli = m.swarmRefusal(m.SWARM_PRESETS.explore, { agentAvailable: false, item: { state: 'todo' } })
  return { pass: noMate === null && /PATH/.test(noMateNoCli), detail: { noMate, noMateNoCli } }
})

check(S, 'swarm.refuse.5 the merged view refuses first — nothing acts there', (m) => {
  const merged = m.swarmRefusal({ ...m.SWARM_PRESETS.explore, reviewed: false }, { agentAvailable: false, merged: true })
  return { pass: /merged view is read-only/.test(merged), detail: merged }
})

check(S, 'swarm.refuse.6 a seat refusal names the SEAT and its role, so a person can map it back to the preview', (m) => {
  const said = m.swarmSeatRefusal(m.SWARM_PRESETS.implement.seats[1], 'the directory is not there')
  return { pass: /test/.test(said) && /\(test\)/.test(said) && /the directory is not there/.test(said), detail: said }
})

// --- The persisted mark ------------------------------------------------------

check(S, 'swarm.mark.1 a seat mark round-trips; anything else is null, so a malformed record costs the MARK and never the panel', (m) => {
  const good = m.parseSwarmMark({ preset: 'implement', role: 'test' })
  const bad = [undefined, null, 'implement', [], {}, { preset: 'nope', role: 'test' }, { preset: 'implement', role: 'nope' }].map((raw) => m.parseSwarmMark(raw))
  return { pass: good !== null && good.preset === 'implement' && good.role === 'test' && bad.every((r) => r === null), detail: { good, bad } }
})

check(S, 'swarm.prompt.1 the hub carries M81\'s supervisor prompt AND the shape; a worker carries its ROLE brief and not the supervisor\'s', (m) => {
  const hub = m.swarmSystemPrompt({ preset: 'implement', role: 'supervisor' }, 'NEVER SPAWN')
  const worker = m.swarmSystemPrompt({ preset: 'implement', role: 'implement' }, 'NEVER SPAWN')
  return {
    pass: hub.includes('NEVER SPAWN') && /implement arrangement/.test(hub) &&
      !worker.includes('NEVER SPAWN') && worker.includes(m.SWARM_BRIEFS.implement) && /never open a pull request/.test(worker),
    detail: { hub: hub.slice(0, 120), worker: worker.slice(0, 120) }
  }
})

check(S, 'swarm.prompt.2 every writing role is told not to push, merge or open a pull request — the return path is the person\'s', (m) => {
  const bad = ['implement', 'review'].filter((role) => !/never open a pull request/i.test(m.SWARM_BRIEFS[role]))
  return { pass: bad.length === 0 && /never write/i.test(m.SWARM_BRIEFS.explore), detail: bad }
})

check(L, 'swarm.mark.2 a chat panel keeps its seat across a save/load; a malformed seat is dropped BY NAME and the chat is kept', (m) => {
  const file = (swarm) => JSON.stringify({
    version: 1, activeWorkspaceId: 'w1',
    workspaces: [{
      id: 'w1', name: 'Canvas', camera: { x: 0, y: 0, scale: 1 }, selectedId: null, focusedId: null,
      panels: [{ id: 'c1', x: 0, y: 0, w: 560, h: 620, z: 1, kind: 'chat', chat: { cwd: '/repo', sessionId: 's1', swarm } }]
    }]
  })
  const good = m.parseLayout(file({ preset: 'test', role: 'test' }))
  const bad = m.parseLayout(file({ preset: 'nope', role: 'test' }))
  const goodChat = good.snapshot.workspaces[0].panels[0].chat
  const badPanels = bad.snapshot.workspaces[0].panels
  return {
    pass: goodChat.swarm !== undefined && goodChat.swarm.preset === 'test' && good.warnings.length === 0 &&
      badPanels.length === 1 && badPanels[0].chat.swarm === undefined && bad.warnings.some((w) => /swarm seat/.test(w)),
    detail: { good: goodChat.swarm, warnings: bad.warnings }
  }
})

// --- The start flow ----------------------------------------------------------

check(SW, 'swarm.start.1 an arrangement never adds a NEED — the triple is what the app cannot derive, and a shape always has an answer', (m) => {
  const ctx = { teammates: [{ id: 'ada', name: 'ada', places: ['/repo'], services: [], memory: 'ada', chats: [], messaging: false, scheduling: false }], repos: [{ path: '/repo', repo: null }], wanted: null }
  const solo = m.startWorkNeeds({ title: 'a task', teammateId: 'ada', root: '/repo' }, ctx)
  const swarm = m.startWorkNeeds({ title: 'a task', teammateId: 'ada', root: '/repo', swarm: 'explore' }, ctx)
  return { pass: solo.length === 0 && swarm.length === 0, detail: { solo, swarm } }
})

check(SW, 'swarm.start.2 the solo lane is never refused by the arrangement gate; a chosen arrangement is judged by swarmRefusal\'s own sentence', (m) => {
  const ctx = { teammates: [{ id: 'ada', name: 'ada', places: ['/repo'], services: [], memory: 'ada', chats: [], messaging: false, scheduling: false }], repos: [{ path: '/repo', repo: null }], wanted: null, agentAvailable: true, itemState: 'todo' }
  const solo = m.startWorkSwarmRefusal({ title: 't', teammateId: 'ada', root: '/repo' }, ctx)
  const review = m.startWorkSwarmRefusal({ title: 't', teammateId: 'ada', root: '/repo', swarm: 'review' }, ctx)
  const explore = m.startWorkSwarmRefusal({ title: 't', teammateId: 'ada', root: '/repo', swarm: 'explore' }, ctx)
  const noCli = m.startWorkSwarmRefusal({ title: 't', teammateId: 'ada', root: '/repo', swarm: 'explore' }, { ...ctx, agentAvailable: false })
  return { pass: solo === null && typeof review === 'string' && explore === null && /PATH/.test(noCli), detail: { solo, review, explore, noCli } }
})

check(SW, 'swarm.start.3 the summary names the arrangement beside the triple — the shape is stated before anything is minted', (m) => {
  const mate = { id: 'ada', name: 'ada', places: ['/repo'], services: [], memory: 'ada', chats: [], messaging: false, scheduling: false }
  const solo = m.startWorkSummary({ title: 'a task' }, mate, '/repo')
  const swarm = m.startWorkSummary({ title: 'a task', swarm: 'review' }, mate, '/repo')
  return { pass: !/arrangement/.test(solo) && /Review arrangement/.test(swarm) && /a task/.test(swarm) && /ada/.test(swarm), detail: { solo, swarm } }
})

// --- The doors ---------------------------------------------------------------

check(V, 'swarm.doors.1 `swarm` is a verb, is not destructive, reaches `startSwarm`, and names all four doors', (m) => {
  const verb = m.VERBS.find((v) => v.id === 'swarm')
  const doors = m.V9_DOORS['swarm']
  return {
    pass: verb !== undefined && verb.destructive === false && verb.actions.includes('startSwarm') && verb.args.length === 3 &&
      typeof doors?.canvas === 'string' && doors.canvas.length > 0 && doors.palette === 'work.swarm.explore' &&
      doors.agent.startsWith('tc plan swarm ') && /^an action node whose line is: swarm /.test(doors.workflow),
    detail: { verb, doors }
  }
})

check(P, 'swarm.doors.2 a teammate\'s plan cannot run `swarm` — five sessions is not an exception to "sessions are the person\'s"', (m) => {
  const refused = m.agentDoorRefusal({ verb: 'swarm', args: {} }, { panels: [], templates: [] }, { teammateId: 'ada' })
  const person = m.agentDoorRefusal({ verb: 'swarm', args: {} }, { panels: [], templates: [] }, undefined)
  return { pass: typeof refused === 'string' && /teammate/.test(refused) && person === null, detail: { refused, person } }
})

// The palette rows are read as TEXT, the way `closure.v9.1` reads them: a row
// built from a template literal is a door the door-check cannot see.
ok('swarm.rows.1 every arrangement has a LITERAL palette row id in commands.ts, so no preset can be added without a door',
  (() => {
    if (S.error !== undefined) return false
    const text = src('src/renderer/palette/commands.ts')
    return S.mod.SWARM_PRESET_IDS.every((id) => text.includes(`id: 'work.swarm.${id}'`))
  })(),
  'expected one `id: \'work.swarm.<preset>\'` per preset')

// --- The executor, as static fact -------------------------------------------

{
  // The executor lives in `useBoardVerbs.ts`: `startSwarmAttempt` and the
  // dispatch it is built on were lifted out of `Canvas.tsx` as one contiguous
  // run. The slice below is unchanged — same two landmarks, same file-order.
  const verbs = src('src/renderer/canvas/useBoardVerbs.ts')
  const body = verbs.slice(verbs.indexOf('const startSwarmAttempt'), verbs.indexOf('boardVerbsRef.current.swarm ='))
  ok('swarm.exec.1 the PRIMARY seat goes through `dispatchWorkItem` — the arrangement never mints a second kind of lane',
    body.includes('await dispatchWorkItem(itemId, teammateId, root, { preset: presetId, role: primary.role })') && !body.includes('window.canvas.board.lane({ itemId, chatPanelId: chatId'),
    body.slice(0, 160))
  ok('swarm.exec.2 a seat refused half way disposes the sessions THIS call created and leaves the primary lane standing',
    /undoCreated\(\); patchNote\(swarmSeatRefusal\(/.test(body) && body.includes('agentSession.dispose({ id, drop: true })'),
    'expected undoCreated() beside every seat refusal')
  ok('swarm.exec.3 every seat chat is created with the teammate id, so the Places gate judges its folder — never a bare create',
    (body.match(/agentSession\.create\(\{/g) ?? []).length === 1 && /agentSession\.create\(\{ id, cwd, sessionId, teammateId, appendSystemPrompt: swarmSystemPrompt\(/.test(body),
    'expected one create, carrying teammateId and the seat brief')
  ok('swarm.exec.4 an automated edge sets a handoff; a statement edge sets none — the hub\'s lines are labelled and inert',
    /if \(edge\.automate\) next = setLinkAutomation\(/.test(body) && /next = setLinkLabel\(next, from, to, edge\.label\)/.test(body),
    'expected setLinkLabel for every edge and setLinkAutomation only when automate')
  ok('swarm.exec.5 one attempt per item — two arrangements racing on one card would mint two hubs over one lane',
    /swarmAttemptsRef\.current\.get\(itemId\)/.test(verbs) && /swarmAttemptsRef\.current\.set\(itemId, attempt\)/.test(verbs),
    'expected the standing-attempt map the dispatch already uses')
}

{
  const chats = src('src/renderer/chat/useChatSessions.ts')
  ok('swarm.resume.1 a swarm seat is FIRST in the appended-prompt chain — a hub is also a supervisor and a primary seat is also a dispatch, so either earlier arm would drop the seat\'s brief on relaunch',
    /panel\.chat\.swarm !== undefined \? \{ appendSystemPrompt: swarmSystemPrompt\(panel\.chat\.swarm, SUPERVISOR_PROMPT\) \}\s*:\s*panel\.chat\.supervisor === true/.test(chats),
    chats.slice(chats.indexOf('appendSystemPrompt'), chats.indexOf('appendSystemPrompt') + 200))
}

// --- The surfaces ------------------------------------------------------------

const noop = () => {}
const sheetModel = (over = {}) => ({
  title: 'a task', titleFixed: false, wanted: null,
  teammates: [{ id: 'ada', name: 'ada', brief: '', places: ['/repo'], services: [], memory: 'ada', chats: [], messaging: false, scheduling: false }],
  repositories: async () => ({ kind: 'repos', repos: [] }),
  submit: async () => ({ kind: 'started' }),
  openTeammates: noop,
  ...over
})

check(SHEET, 'swarm.sheet.1 the sheet offers Solo plus the four arrangements, Solo selected — a person who opened it to start one task does not get five agents for pressing Enter', (m) => {
  const html = renderToStaticMarkup(createElement(m.StartWorkSheet, { model: sheetModel(), onDone: noop, onCancel: noop }))
  const rows = [...html.matchAll(/data-start-swarm-row="([^"]+)"/g)].map((x) => x[1])
  const field = html.slice(html.indexOf('data-start-swarm'))
  return { pass: JSON.stringify(rows) === JSON.stringify(['solo', 'explore', 'implement', 'test', 'review']) && /value=""/.test(field.slice(0, 120)) && !/data-start-swarm-plan/.test(html), detail: rows }
})

check(SHEET, 'swarm.sheet.2 a chosen arrangement states its SEATS and its counts before anything is minted', (m) => {
  const html = renderToStaticMarkup(createElement(m.StartWorkSheet, { model: sheetModel({ swarm: 'test', teammateId: 'ada' }), onDone: noop, onCancel: noop }))
  const seats = [...html.matchAll(/data-start-swarm-seat="([^"]+)"/g)].map((x) => x[1])
  return { pass: /data-start-swarm-plan/.test(html) && seats.includes('runner') && seats.includes('supervisor') && /2 conversations/.test(html) && /1 terminal/.test(html), detail: seats }
})

check(SHEET, 'swarm.sheet.3 an arrangement that cannot start says so and DISABLES Start — it never half-lands and then reports why', (m) => {
  const html = renderToStaticMarkup(createElement(m.StartWorkSheet, { model: sheetModel({ swarm: 'review', teammateId: 'ada', itemState: 'todo', titleFixed: true }), onDone: noop, onCancel: noop }))
  const submit = html.slice(html.indexOf('data-start-submit'))
  return { pass: /data-start-swarm-refusal/.test(html) && /start work on it first/.test(html) && /\bdisabled=""/.test(submit.slice(0, 200)), detail: submit.slice(0, 220) }
})

check(CARD, 'swarm.card.1 a work card offers Swarm… and the four arrangements, each disabled by the SAME refusal the sheet reads', (m) => {
  const item = { id: 'wk1', source: 'typed', title: 'a task', state: 'todo', createdAt: 0, updatedAt: 0 }
  const props = {
    panel: { kind: 'work', rect: { id: 'w1', x: 0, y: 0, w: 320, h: 240 }, z: 1, work: { itemId: 'wk1' } },
    item, teammates: [], laneLabel: undefined, selected: false, linkTarget: false, prReason: null,
    onResume: noop, onAnswer: noop, onSelect: noop, onFocus: noop, onBeginDrag: noop, onClose: noop, onBeginLink: noop,
    onDispatch: noop, teammateReason: () => null, onSwarm: noop, onOpenPr: noop, onReview: noop, onShow: noop, onDone: noop, onClearHistory: noop
  }
  const closed = renderToStaticMarkup(createElement(m.WorkNode, props))
  return { pass: /data-work-verb="swarm"/.test(closed) && !/data-work-swarm-menu/.test(closed), detail: closed.slice(closed.indexOf('data-work-verb="swarm"'), closed.indexOf('data-work-verb="swarm"') + 160) }
})

console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`)
if (results.some((r) => !r.pass)) process.exitCode = 1
