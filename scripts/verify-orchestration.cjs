// verify:orchestration (M268) — pure Orchestration snapshot + activity ring.
const { buildSync } = require('esbuild')
const { existsSync, mkdirSync, readFileSync } = require('node:fs')
const { join } = require('node:path')
const { ok, results } = require('./lib/checks.cjs').createChecks()
const root = join(__dirname, '..')
const outDir = join(root, 'out/verify')
mkdirSync(outDir, { recursive: true })

function load(entry, name) {
  const path = join(root, entry)
  if (!existsSync(path)) return {}
  const outfile = join(outDir, name)
  buildSync({
    entryPoints: [path],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    alias: { '@shared': join(root, 'src/shared'), '@renderer': join(root, 'src/renderer') }
  })
  return require(outfile)
}

const M = load('src/renderer/orchestration/orchestration-model.ts', 'orchestration-model.cjs')
const A = load('src/renderer/orchestration/orchestration-activity.ts', 'orchestration-activity.cjs')

const build = typeof M.buildOrchestrationSnapshot === 'function' ? M.buildOrchestrationSnapshot : () => null

const empty = build({
  panels: [],
  workItems: [],
  machine: { cpuPercent: 0, memoryBytes: 0 },
  hour: 20,
  displayName: 'Alex'
})
ok('orch.model.1 empty canvas: greeting names the person, counts are zero, graph has synthetic hub only',
  empty?.greeting?.includes('Alex') === true &&
  empty?.greeting?.includes('evening') === true &&
  empty?.counts?.activeAgents === 0 &&
  empty?.counts?.tasksInProgress === 0 &&
  empty?.graph?.nodes?.length === 1 &&
  empty?.graph?.nodes[0]?.id === '__hub__' &&
  empty?.task === null)

const snap = build({
  panels: [
    { id: 'c1', kind: 'chat', title: 'Supervisor', agentic: true, agentState: 'busy', supervisor: true },
    { id: 'c2', kind: 'chat', title: 'Coder', agentic: true, agentState: 'wants-you' },
    { id: 't1', kind: 'terminal', title: 'build', agentic: true, agentState: 'busy', currentCommand: 'npm run build' },
    { id: 't2', kind: 'terminal', title: 'shell', agentic: false, agentState: 'busy' },
    { id: 'w1', kind: 'watcher', title: 'tests', agentic: false, watcherStatus: 'running' },
    { id: 'f1', kind: 'workflow', title: 'Pipeline', agentic: false, templateId: 'tpl', poolLive: true }
  ],
  workItems: [
    { id: 'i1', title: 'Implement payment API', state: 'working', panelId: 'c2' },
    { id: 'i2', title: 'Done already', state: 'done' }
  ],
  machine: { cpuPercent: 24, memoryBytes: 1024 * 1024 * 512 },
  hour: 9,
  displayName: 'Alex'
})
ok('orch.model.2 counts active agents (busy/starting/wants-you agentic), waiting, watchers, workflows, tasks',
  snap?.counts?.activeAgents === 3 &&
  snap?.counts?.waiting === 1 &&
  snap?.counts?.watchersRunning === 1 &&
  snap?.counts?.workflowsLive === 1 &&
  snap?.counts?.tasksInProgress === 1,
  JSON.stringify(snap?.counts))
ok('orch.model.3 graph hubs on supervisor and edges to satellites; busy shell is not agentic so not a false agent count above',
  snap?.graph?.nodes?.some((n) => n.id === 'c1' && n.hub === true) === true &&
  snap?.graph?.edges?.length >= 1 &&
  snap?.graph?.nodes?.some((n) => n.id === 'c2') === true)
ok('orch.model.4 focused task is working item with stepIndex; terminal snippet carries live command',
  snap?.task?.id === 'i1' && snap?.task?.stepIndex === 1 &&
  snap?.terminalSnippet?.command === 'npm run build' &&
  snap?.terminalSnippet?.panelId === 't1')
ok('orch.model.5 roster includes chats terminals watchers workflows — not an other-kind file alone',
  snap?.roster?.length === 6 &&
  snap?.roster?.every((r) => ['chat', 'terminal', 'watcher', 'workflow'].includes(r.kind)),
  JSON.stringify(snap?.roster?.map((r) => r.kind)))

// Activity ring
if (typeof A.clearOrchActivity === 'function') A.clearOrchActivity()
ok('orch.activity.1 empty after clear',
  typeof A.listOrchActivity === 'function' && A.listOrchActivity().length === 0)
const cap = typeof A.ORCH_ACTIVITY_CAP === 'number' ? A.ORCH_ACTIVITY_CAP : 50
for (let i = 0; i < cap + 5; i += 1) {
  A.pushOrchActivity({ at: i, kind: 'agent', panelId: 'c1', title: 'Supervisor', detail: `n${i}`, tone: 'idle' })
}
const listed = A.listOrchActivity()
ok('orch.activity.2 ring truncates to ORCH_ACTIVITY_CAP, newest first',
  listed.length === cap && listed[0]?.detail === `n${cap + 4}` && listed[cap - 1]?.detail === `n${5}`,
  JSON.stringify({ len: listed.length, first: listed[0]?.detail, last: listed[cap - 1]?.detail, cap }))
ok('orch.activity.3 filter by panel id',
  A.listOrchActivity('missing').length === 0 && A.listOrchActivity('c1').length === cap)
const trans = typeof A.agentTransitionActivity === 'function'
  ? A.agentTransitionActivity('c2', 'Coder', 'wants-you', 'busy', 100)
  : null
ok('orch.activity.4 agentTransitionActivity names the transition and needs-you tone',
  trans?.detail === 'busy → wants-you' && trans?.tone === 'needs-you' && trans?.panelId === 'c2')
// useSyncExternalStore compares getSnapshot by identity. A slice()/filter that
// rebuilds every read made OrchestrationView infinite-loop and blank the window.
const snapA = A.orchActivityEvents()
const snapB = A.orchActivityEvents()
const listedA = A.listOrchActivity()
ok('orch.activity.5 unfiltered getSnapshot is identity-stable until the next push',
  snapA === snapB && listedA === snapA && Array.isArray(snapA),
  JSON.stringify({ sameEvents: snapA === snapB, sameList: listedA === snapA }))
A.pushOrchActivity({ at: 999, kind: 'agent', panelId: 'c9', title: 'X', detail: 'pushed', tone: 'idle' })
ok('orch.activity.6 a push replaces the snapshot identity',
  A.orchActivityEvents() !== snapA && A.orchActivityEvents()[0]?.detail === 'pushed')

// Settings schema pins the centerView enum
const schema = readFileSync(join(root, 'src/shared/settings-schema.ts'), 'utf8')
ok('orch.settings.1 shell.centerView enum is canvas | orchestration with default canvas',
  /id:\s*'shell\.centerView'/.test(schema) &&
  /values:\s*\['canvas',\s*'orchestration'\]/.test(schema) &&
  /default:\s*'canvas'/.test(schema.split("id: 'shell.centerView'")[1] ?? ''))

const linked = build({
  panels: [
    { id: 'c1', kind: 'chat', title: 'Supervisor', agentic: true, agentState: 'busy', supervisor: true },
    { id: 'c2', kind: 'chat', title: 'Coder', agentic: true, agentState: 'idle', linksTo: ['t1'] },
    { id: 't1', kind: 'terminal', title: 'build', agentic: true, agentState: 'busy' },
    { id: 'doc', kind: 'file', title: 'readme', agentic: false, path: '/tmp/repo/README.md' }
  ],
  workItems: [
    { id: 'i1', title: 'A', state: 'todo' },
    { id: 'i2', title: 'B', state: 'working' },
    { id: 'i3', title: 'C', state: 'review' },
    { id: 'i4', title: 'D', state: 'done' }
  ],
  machine: { cpuPercent: 1, memoryBytes: 1 },
  hour: 15
})
ok('orch.model.6 authored canvas links become dashed graph edges; files stay off the roster',
  linked?.graph?.edges?.some((e) => e.from === 'c2' && e.to === 't1' && e.authored === true) === true &&
  linked?.files?.length === 1 && linked?.files[0]?.path === '/tmp/repo/README.md' &&
  linked?.roster?.every((r) => r.kind !== 'file'),
  JSON.stringify({ edges: linked?.graph?.edges, files: linked?.files, roster: linked?.roster?.map((r) => r.kind) }))
ok('orch.pipeline.1 four board stages with counts from the work items, never a fifth invented word',
  linked?.pipeline?.length === 4 &&
  linked?.pipeline?.every((s) => typeof s.state === 'string' && typeof s.count === 'number') &&
  linked?.pipeline?.map((s) => s.count).join(',') === '1,1,1,1',
  JSON.stringify(linked?.pipeline))

const filter = typeof M.filterRoster === 'function' ? M.filterRoster : () => []
const roster = snap.roster
ok('orch.filter.1 running keeps busy/wants-you/watching/pool; needs-you is only that tone; query matches title',
  filter(roster, 'running', '').every((r) => ['busy', 'starting', 'wants-you', 'watching', 'pool'].includes(r.state)) &&
  filter(roster, 'needs-you', '').every((r) => r.state === 'wants-you') &&
  filter(roster, 'all', 'Coder').every((r) => r.title === 'Coder') &&
  filter(roster, 'all', 'zzzz-nope').length === 0,
  JSON.stringify({ running: filter(roster, 'running', '').map((r) => r.state), need: filter(roster, 'needs-you', '').map((r) => r.id) }))

const actFilter = typeof M.filterActivity === 'function' ? M.filterActivity : () => []
const events = [
  { panelId: 'c1', at: 1 },
  { panelId: 'c2', at: 1 },
  { panelId: 'gone', at: 1 }
]
ok('orch.filter.2 live scope keeps live panels and recent events; historical keeps all; selection still filters',
  actFilter(events, { selectedId: null, scope: 'live', livePanelIds: ['c1'], now: 1000, liveMs: 50 }).length === 1 &&
  actFilter(events, { selectedId: null, scope: 'all', livePanelIds: ['c1'], now: 1000, liveMs: 50 }).length === 3 &&
  actFilter(events, { selectedId: 'c2', scope: 'all', livePanelIds: [], now: 1000 }).length === 1,
  JSON.stringify({
    live: actFilter(events, { selectedId: null, scope: 'live', livePanelIds: ['c1'], now: 1000, liveMs: 50 }),
    all: actFilter(events, { selectedId: null, scope: 'all', livePanelIds: ['c1'], now: 1000, liveMs: 50 }).length
  }))

const faces = typeof M.isoCubeFaces === 'function' ? M.isoCubeFaces(100, 80, 40) : null
const pts = (s) => (s || '').trim().split(/\s+/).length
ok('orch.cube.1 isometric cube has three faces of four points; hub node is larger than a satellite',
  faces !== null && pts(faces.top) === 4 && pts(faces.left) === 4 && pts(faces.right) === 4 &&
  snap?.graph?.nodes?.find((n) => n.hub)?.size > snap?.graph?.nodes?.find((n) => !n.hub)?.size,
  JSON.stringify({ faces, hub: snap?.graph?.nodes?.find((n) => n.hub)?.size, sat: snap?.graph?.nodes?.find((n) => !n.hub)?.size }))

const workFilter = typeof M.filterWorkItems === 'function' ? M.filterWorkItems : () => []
ok('orch.pipeline.2 stage filter returns only that board state; null passes all through',
  workFilter([{ id: 'a', title: 't', state: 'todo' }, { id: 'b', title: 'u', state: 'done' }], 'todo').length === 1 &&
  workFilter([{ id: 'a', title: 't', state: 'todo' }], null).length === 1)

const nameless = build({
  panels: [],
  workItems: [],
  machine: { cpuPercent: 0, memoryBytes: 0 },
  hour: 20
})
ok('orch.greeting.1 an absent displayName is “Good evening.” never “Good evening, there.”',
  nameless?.greeting?.startsWith('Good evening.') === true && !/there/i.test(nameless?.greeting ?? ''),
  JSON.stringify(nameless?.greeting))
ok('orch.greeting.2 placeholder names are omitted the same way',
  M.orchGreetingName?.('') === '' && M.orchGreetingName?.('there') === '' && M.orchGreetingName?.('Alex') === 'Alex')

const cmdsNone = typeof M.orchCommands === 'function' ? M.orchCommands({ selectedId: null, canInterrupt: false, canMarkDone: false, canFocusRelated: false, canOpenFiles: false }) : null
const cmdsAll = typeof M.orchCommands === 'function' ? M.orchCommands({ selectedId: 'c1', canInterrupt: true, canMarkDone: true, canFocusRelated: true, canOpenFiles: true }) : null
ok('orch.commands.1 only enabled verbs appear — no decorative disabled buttons',
  Array.isArray(cmdsNone) && cmdsNone.length === 0 &&
    cmdsAll?.map((c) => c.id).join(',') === 'interrupt,jump,mark-done,focus-related,open-files',
  JSON.stringify({ none: cmdsNone, all: cmdsAll }))

const hubEmpty = empty?.graph?.nodes[0]
ok('orch.hub.1 a canvas with no supervisor chat labels the synthetic hub “No supervisor yet”, never Orchestrator',
  hubEmpty?.id === '__hub__' && hubEmpty?.synthetic === true && hubEmpty?.title === 'No supervisor yet' &&
    hubEmpty?.title !== 'Orchestrator',
  JSON.stringify(hubEmpty))

const step = typeof M.orchRosterStep === 'function' ? M.orchRosterStep : () => null
ok('orch.keys.1 roster step walks ids, clamps at the ends, and stays null on an empty list',
  step([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 'a', 1) === 'b' &&
    step([{ id: 'a' }, { id: 'b' }], 'b', 1) === 'b' &&
    step([{ id: 'a' }, { id: 'b' }], null, 1) === 'a' &&
    step([], 'a', 1) === null)

const keys = typeof M.orchKeysShouldHandle === 'function' ? M.orchKeysShouldHandle : () => true
const fake = (hits) => ({ closest: (sel) => (hits.includes(sel) ? {} : null) })
ok('orch.keys.2 HUD keys stand down for xterm and contenteditable, and only handle a target inside .orch',
  keys(fake(['.orch'])) === true &&
    keys(fake(['.xterm', '.orch'])) === false &&
    keys(fake(['[contenteditable="true"]'])) === false &&
    keys(null) === false)

const fires = new Map([['c1:c2', 1000]])
ok('orch.edge.1 travelling current is only live inside ORCH_EDGE_FIRE_MS of a recorded transition, not because endpoints are busy',
  typeof M.orchEdgeIsFiring === 'function' &&
    M.orchEdgeIsFiring('c1', 'c2', fires, 1000) === true &&
    M.orchEdgeIsFiring('c1', 'c2', fires, 1000 + M.ORCH_EDGE_FIRE_MS) === false &&
    M.orchEdgeIsFiring('c1', 'c2', new Map(), 1000) === false &&
    M.orchEdgesFiredByPanel([{ from: 'c1', to: 'c2' }, { from: 'x', to: 'y' }], 'c2').join() === 'c1:c2')

const blockerWait = typeof M.orchBlocker === 'function' ? M.orchBlocker({ waiting: 1, waitingTitle: 'Coder', reviewable: 0, running: 2, queued: 3 }) : null
const blockerNone = typeof M.orchBlocker === 'function' ? M.orchBlocker({ waiting: 0, reviewable: 0, running: 0, queued: 0 }) : 'x'
ok('orch.blocker.1 one factual line, waiting outranks running, and zero counts invent nothing',
  blockerWait?.kind === 'waiting-on-you' && /Coder/.test(blockerWait?.line ?? '') && blockerNone === null,
  JSON.stringify({ blockerWait, blockerNone }))

const frame = typeof M.orchTaskFrame === 'function' ? M.orchTaskFrame({
  graph: { nodes: [
    { id: '__hub__', title: 'No supervisor yet', kind: 'chat', hub: true, synthetic: true, x: 0, y: 0, state: 'idle', size: 56 },
    { id: 'c2', title: 'Coder', kind: 'chat', hub: false, x: 1, y: 1, state: 'busy', size: 38 },
    { id: 't1', title: 'build', kind: 'terminal', hub: false, x: 2, y: 2, state: 'idle', size: 38 }
  ], edges: [{ from: '__hub__', to: 'c2' }, { from: 'c2', to: 't1' }] },
  roster: [
    { id: 'c2', title: 'Coder', kind: 'chat', state: 'busy', tone: 'working', agentic: true },
    { id: 't1', title: 'build', kind: 'terminal', state: 'idle', tone: 'idle', agentic: true }
  ],
  files: [{ id: 'f1', title: 'readme', path: '/tmp/repo/README.md' }],
  memberIds: ['c2', 'f1']
}) : null
ok('orch.frame.1 a board-task frame keeps only named members — synthetic hub and unrelated agents drop',
  frame?.framed === true &&
    frame?.roster?.map((r) => r.id).join() === 'c2' &&
    frame?.files?.[0]?.path === '/tmp/repo/README.md' &&
    frame?.graph?.nodes?.every((n) => n.id === 'c2' || n.id === 'f1') === true &&
    frame?.graph?.nodes?.some((n) => n.id === '__hub__') === false,
  JSON.stringify(frame && { nodes: frame.graph.nodes.map((n) => n.id), roster: frame.roster.map((r) => r.id), files: frame.files }))

const lensRun = typeof M.orchMetricLens === 'function' ? M.orchMetricLens('agents', null) : null
const lensOff = typeof M.orchMetricLens === 'function' ? M.orchMetricLens('agents', 'agents') : null
ok('orch.metric.1 metric cards are one shared lens; a second click clears',
  lensRun?.metric === 'agents' && lensRun?.rosterFilter === 'running' && lensRun?.mode === 'dev' &&
    lensOff?.metric === null && lensOff?.rosterFilter === 'all',
  JSON.stringify({ lensRun, lensOff }))

const multiJump = typeof M.orchCommands === 'function'
  ? M.orchCommands({ selectedIds: ['c1', 'c2'], canInterrupt: true, canJump: true, canMarkDone: false, canFocusRelated: false, canOpenFiles: false })
  : null
const multiNoInterrupt = typeof M.orchCommands === 'function'
  ? M.orchCommands({ selectedIds: ['c1', 'c2'], canInterrupt: false, canJump: true, canMarkDone: false, canFocusRelated: false, canOpenFiles: false })
  : null
ok('orch.commands.2 multi-select Interrupt only when every selected row can run it; Jump when the caller says every row can',
  multiJump?.map((c) => c.id).join() === 'interrupt,jump' &&
    multiNoInterrupt?.map((c) => c.id).join() === 'jump',
  JSON.stringify({ multiJump, multiNoInterrupt }))

const machineNone = typeof M.orchMachineReadout === 'function'
  ? M.orchMachineReadout({ sampledAt: null, now: 10_000, cpuPercent: 0, memoryBytes: 0, panelCount: 0 })
  : null
const machineStale = typeof M.orchMachineReadout === 'function'
  ? M.orchMachineReadout({ sampledAt: 1000, now: 20_000, cpuPercent: 12, memoryBytes: 1024 * 1024 * 100, panelCount: 2, staleMs: 8000 })
  : null
ok('orch.machine.1 missing samples say “no sample yet”, never a confident 0%; a stale sample keeps its last reading and names its age',
  machineNone?.kind === 'none' && machineNone?.cpu === 'no sample yet' &&
    machineStale?.kind === 'stale' && /12/.test(machineStale?.cpu ?? '') && machineStale?.age !== null,
  JSON.stringify({ machineNone, machineStale }))

ok('orch.coverage.1 Live vs Historical names the window; Logs refuse a live terminal; Files name real paths',
  typeof M.orchActivityCoverage === 'function' && /last 2 minutes/.test(M.orchActivityCoverage('live')) &&
    /durable/.test(M.orchActivityCoverage('all')) &&
    /not a live terminal/.test(M.orchLogsCoverage()) &&
    /real path/.test(M.orchFilesCoverage()))

const viewSrc = readFileSync(join(root, 'src/renderer/orchestration/OrchestrationView.tsx'), 'utf8')
ok('orch.gate.1 every HUD chat and scrollback tail reader in OrchestrationView passes through outward()',
  /lastAssistantText\(/.test(viewSrc) && /scrollback\.tail\(/.test(viewSrc) &&
    /outward\(raw/.test(viewSrc) && /outward\(got\.join/.test(viewSrc) &&
    !/lastAssistantText\([^)]+\)(?![\s\S]{0,200}outward)/.test(viewSrc.replace(/\s+/g, ' ')))

const empties = readFileSync(join(root, 'src/shared/empty-states.ts'), 'utf8')
ok('orch.empty.1 orch empty states live in empty-states.ts with named next steps and no fake Connect',
  /id: 'orch-roster'/.test(empties) && /id: 'orch-task'/.test(empties) &&
    /Show Canvas/.test(empties) && !/id: 'orch-[^']+'[^}]*Connect/.test(empties))

const failed = results.filter((x) => !x.pass)
console.log(`verify:orchestration ${results.length - failed.length}/${results.length}`)
if (failed.length) {
  for (const f of failed) console.log(`  FAIL ${f.id}${f.detail ? ` — ${f.detail}` : ''}`)
  process.exit(1)
}
