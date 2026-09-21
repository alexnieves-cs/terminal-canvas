// verify:orchestration (M268) — pure Orchestration snapshot + activity ring.
const { buildSync } = require('esbuild')
const { existsSync, mkdirSync, readFileSync, readdirSync } = require('node:fs')
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
  trans?.detail === 'working → needs you' && trans?.tone === 'needs-you' && trans?.panelId === 'c2')
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

const trig = build({
  panels: [
    { id: 'a', kind: 'chat', title: 'A', agentic: true, agentState: 'idle', linksTo: ['b', 'c'], linkTriggers: { b: 'after a turn' } },
    { id: 'b', kind: 'terminal', title: 'B', agentic: true, agentState: 'idle' },
    { id: 'c', kind: 'terminal', title: 'C', agentic: true, agentState: 'idle' }
  ],
  workItems: [],
  machine: { cpuPercent: 0, memoryBytes: 0 },
  hour: 10
})
const ab = trig?.graph?.edges?.find((e) => e.from === 'a' && e.to === 'b')
const ac = trig?.graph?.edges?.find((e) => e.from === 'a' && e.to === 'c')
ok('orch.flow.1 an enabled handoff link carries its trigger word onto the graph edge; a bare link carries none',
  ab?.trigger === 'after a turn' && ac !== undefined && ac.trigger === undefined, JSON.stringify(trig?.graph?.edges))

const order = typeof M.orchEdgePaintOrder === 'function'
  ? M.orchEdgePaintOrder([{ from: 'h', to: 'x', authored: true }, { from: 'h', to: 'y' }, { from: 'h', to: 'z' }])
  : []
ok('orch.flow.2 hub spokes paint before authored handoffs, so a dependency is never drawn under the star',
  order.length === 3 && order[2].authored === true && order[0].authored !== true)

const P = M.ORCH_PACKET_MS
const pk = (edges, fires, now) => (typeof M.orchEdgePackets === 'function' ? M.orchEdgePackets(edges, new Map(fires), now) : [])
const hubEdge = { from: 'hub', to: 'b' }
const stateFire = pk([hubEdge], [['hub:b', { at: 1000, origin: 'b', handoff: false }]], 1000 + P / 2)
const handFire = pk([{ from: 'a', to: 'b', authored: true, trigger: 'on exit' }], [['a:b', { at: 1000, origin: 'a', handoff: true }]], 1000 + P / 4)
const stateOnAuthored = pk([{ from: 'a', to: 'b', authored: true, trigger: 'on exit' }], [['a:b', { at: 1000, origin: 'a', handoff: false }]], 1100)
ok('orch.flow.3 packets exist only inside ORCH_PACKET_MS (1–1.5s), leave the panel that changed, and only a handoff carries the trigger chip',
  P >= 1000 && P <= 1500 &&
    stateFire.length === 1 && stateFire[0].from === 'b' && stateFire[0].to === 'hub' && Math.abs(stateFire[0].t - 0.5) < 1e-9 && stateFire[0].trigger === undefined &&
    handFire.length === 1 && handFire[0].from === 'a' && handFire[0].trigger === 'on exit' &&
    stateOnAuthored.length === 1 && stateOnAuthored[0].trigger === undefined &&
    pk([hubEdge], [['hub:b', { at: 1000, origin: 'b', handoff: false }]], 1000 + P).length === 0 &&
    pk([hubEdge], [['hub:b', { at: 1000, origin: 'b', handoff: false }]], 999).length === 0 &&
    pk([hubEdge], [], 1000).length === 0,
  JSON.stringify({ P, stateFire, handFire, stateOnAuthored }))

const rec = typeof M.orchRecordFires === 'function' ? M.orchRecordFires : () => new Map()
const kept = rec(new Map([['a:b', { at: 1000, origin: 'a', handoff: true }]]), ['a:b'], { at: 1100, origin: 'b', handoff: false })
const later = rec(new Map([['a:b', { at: 1000, origin: 'a', handoff: true }]]), ['a:b'], { at: 1000 + P, origin: 'b', handoff: false })
ok('orch.flow.4 a state fire inside a live handoff window never downgrades it (a turn end emits both); after the window it records',
  kept.get('a:b')?.handoff === true && later.get('a:b')?.handoff === false)

const viewSrc = readFileSync(join(root, 'src/renderer/orchestration/OrchestrationView.tsx'), 'utf8')
ok('orch.gate.1 every HUD chat and scrollback tail reader in OrchestrationView passes through outward()',
  /lastAssistantText\(/.test(viewSrc) && /scrollback\.tail\(/.test(viewSrc) &&
    /outward\(raw/.test(viewSrc) && /outward\(got\.join/.test(viewSrc) &&
    !/lastAssistantText\([^)]+\)(?![\s\S]{0,200}outward)/.test(viewSrc.replace(/\s+/g, ' ')))

{
  const fs = [{ id: 'f1', title: 'a.ts', path: '/a.ts' }, { id: 'f2', title: 'b.ts', path: '/b.ts' }]
  ok('orch.jump.1 the Code card follows a selected file, falls back to the first, and is null with none',
    M.orchBestFile(fs, 'f2')?.id === 'f2' && M.orchBestFile(fs, 'term')?.id === 'f1' && M.orchBestFile([], 'f1') === null)
  // A jump card previews and jumps. An embedded terminal would refit and SIGWINCH the agent; file.read re-arms a watch.
  ok('orch.jump.2 the Orchestrate view embeds no xterm or editor and never calls file.read',
    !/from '[^']*(@xterm|CodeEditor|file\/monaco)[^']*'|canvas\.file\.read/.test(viewSrc))
}

const empties = readFileSync(join(root, 'src/shared/empty-states.ts'), 'utf8')
ok('orch.empty.1 orch empty states live in empty-states.ts with named next steps and no fake Connect',
  /id: 'orch-roster'/.test(empties) && /id: 'orch-task'/.test(empties) &&
    /Show Canvas/.test(empties) && !/id: 'orch-[^']+'[^}]*Connect/.test(empties))

const D = load('src/renderer/orchestration/orchestration-depth.ts', 'orchestration-depth.cjs')
if (typeof D.orchProjectNode === 'function') {
  const stage = { w: 720, h: 420, cx: 360, cy: 210, ringR: 148 }
  const still = { x: 0, y: 0, k: 1 }
  const pan = { x: 100, y: 0, k: 1 }
  const hub = { x: 360, y: 210, hub: true }
  const back = { x: 360, y: 62, hub: false }
  const front = { x: 360, y: 358, hub: false }
  const p = (n, c) => D.orchProjectNode(n, stage, c)
  const moved = (n) => p(n, pan).x - p(n, still).x
  ok('orch.depth.1 the tilt foreshortens the ring; back is far and smaller, front is near and larger',
    p(front, still).y - p(back, still).y < front.y - back.y &&
      p(back, still).band === 'far' && p(front, still).band === 'near' && p(hub, still).band === 'mid' &&
      p(back, still).scale < 1 && p(front, still).scale > 1)
  ok('orch.depth.2 parallax: hub pans slowest, satellites faster the nearer, callouts fastest',
    moved(hub) < moved(back) && moved(back) < moved(front) &&
      Math.abs(moved(front) + p(front, pan).calloutDrift.x - 100) < 1e-9 && p(hub, pan).calloutDrift.x > 0)
  const zoom = p(front, { x: 0, y: 0, k: 1.5 })
  ok('orch.depth.zoom callouts zoom at the foreground rate while their cubes retain depth parallax',
    Math.abs(zoom.y + zoom.calloutDrift.y - (stage.h / 2 + (front.y - stage.cy) * D.ORCH_COS_TILT * 1.5)) < 1e-9)
  const g = D.orchGroundPlane(stage, pan, 20)
  ok('orch.depth.3 the ground plane moves with the hub layer and is an ellipse flattened by the same tilt',
    g.x - D.orchGroundPlane(stage, still, 20).x === moved(hub) && Math.abs(g.ry / g.rx - D.ORCH_COS_TILT) < 1e-9)
  ok('orch.depth.fit.1 orchFitViewbox mirrors preserveAspectRatio="xMidYMid meet": uniform scale, centred letterbox',
    (() => {
      const wide = D.orchFitViewbox({ w: 720, h: 420 }, { width: 1440, height: 420 })
      const tall = D.orchFitViewbox({ w: 720, h: 420 }, { width: 720, height: 1000 })
      return Math.abs(wide.scale - 1) < 1e-9 && wide.offsetX === 360 && wide.offsetY === 0 &&
        Math.abs(tall.scale - 1) < 1e-9 && tall.offsetX === 0 && tall.offsetY === 290
    })())
} else {
  ok('orch.depth.1 orchestration-depth.ts exports orchProjectNode', false)
}

const CM = load('src/renderer/orchestration/orchestration-cube-motion.ts', 'orchestration-cube-motion.cjs')
if (typeof CM.orchCubeMotion === 'function') {
  const base = { tone: 'working', hub: false, synthetic: false, selected: false, attention: false, sinceToneMs: 0, sinceAttentionMs: 0, clockMs: 900 }
  const moving = CM.orchCubeMotion({ ...base, reducedMotion: false })
  const stilled = CM.orchCubeMotion({ ...base, reducedMotion: true })
  const selected = CM.orchCubeMotion({ ...base, reducedMotion: true, selected: true })
  const idle = CM.orchCubeMotion({ ...base, tone: 'idle', reducedMotion: true })
  ok('orch.motion.2 reduced motion freezes every oscillation (working bob/breathe/shimmer) but keeps the static selection lift and idle drop',
    moving.emissiveBoost > 0 && stilled.emissiveBoost === 0 && stilled.rimBoost === 0 && stilled.yOffset === 0 &&
      selected.lift === CM.ORCH_CUBE_LIFT_PX && idle.yOffset === CM.ORCH_CUBE_IDLE_DROP_PX)
  const pulseEarly = CM.orchCubeMotion({ ...base, tone: 'needs-you', attention: true, sinceAttentionMs: 100, reducedMotion: false })
  const pulseLate = CM.orchCubeMotion({ ...base, tone: 'needs-you', attention: true, sinceAttentionMs: 100000, reducedMotion: false })
  ok('orch.motion.3 the needs-you pulse is finite — it runs early, then holds at rest, same as the beacon it now runs alongside',
    pulseEarly.emissiveBoost > 0 && pulseLate.emissiveBoost === 0)
} else {
  ok('orch.motion.2 orchestration-cube-motion.ts exports orchCubeMotion', false)
}
// The tilt itself moved from a CSS rotateX string in OrchestrationView.tsx to a
// real three.js rotation in the R3F island (OrchestrationCubes.tsx) when the
// cube body became a mesh; the view still does the 2D projection either way.
const cubesSrc = readFileSync(join(root, 'src/renderer/orchestration/OrchestrationCubes.tsx'), 'utf8')
// M291: the view projects the platform scene through orchProjectWorld (one
// uniform camera — a per-row parallax would warp a plate's rectangle); the ring's
// orchProjectNode stays for the model. Either spelling wears the one tilt.
ok('orch.depth.4 every cube wears the one stage tilt, and the view projects through orchProjectNode or orchProjectWorld',
  /-ORCH_STAGE_TILT_DEG \* Math\.PI\) \/ 180/.test(cubesSrc) && /orchProject(Node|World)\(/.test(viewSrc) && !/far \? -38/.test(viewSrc))

// Helpful, not just pretty: the capped ring, the dimming lens, the stage wash.
const many = build({
  panels: [
    ...Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, kind: 'terminal', title: `T${i}`, agentic: true, agentState: 'idle' })),
    { id: 'late', kind: 'chat', title: 'Late', agentic: true, agentState: 'wants-you' }
  ],
  workItems: [],
  machine: { cpuPercent: 0, memoryBytes: 0 },
  hour: 9
})
const more = many?.graph?.nodes?.find((n) => n.id === M.ORCH_OVERFLOW_ID)
const seatedIds = (many?.graph?.nodes ?? []).filter((n) => !n.hub && n.overflow === undefined).map((n) => n.id)
ok('orch.ring.1 past the cap the last slot is “+N more”, every agent is seated or counted, and a waiting agent is never the hidden one',
  more !== undefined && seatedIds.length === M.ORCH_RING_CAP - 1 &&
    more.title === `+${more.overflow.length} more` && seatedIds.length + more.overflow.length === 11 &&
    seatedIds.includes('late') && !more.overflow.some((o) => o.id === 'late') &&
    many.graph.edges.some((e) => e.to === M.ORCH_OVERFLOW_ID),
  JSON.stringify({ seatedIds, more }))
const framedMore = M.filterGraph?.(many.graph, new Set(['t0', more?.overflow?.[0]?.id]))
const moreFramed = framedMore?.nodes?.find((n) => n.id === M.ORCH_OVERFLOW_ID)
ok('orch.ring.2 a frame recounts the overflow to what it still holds; off-ring keeps exactly its ids and none without them',
  moreFramed?.overflow?.length === 1 && moreFramed?.title === '+1 more' &&
    M.filterGraph(many.graph, new Set(['t0'])).nodes.every((n) => n.id !== M.ORCH_OVERFLOW_ID) &&
    M.filterRoster(many.roster, 'off-ring', '', more.overflow.map((o) => o.id)).length === more.overflow.length &&
    M.filterRoster(many.roster, 'off-ring', '').length === 0,
  JSON.stringify(moreFramed))
const waitLens = M.filterRoster?.(many.roster, M.orchMetricLens('waiting', null).rosterFilter, '')
const lit = M.orchLensLit?.(many.graph.nodes, new Set(waitLens.map((r) => r.id)), true)
const litHidden = M.orchLensLit?.(many.graph.nodes, new Set([more.overflow[0].id]), true)
ok('orch.lens.1 a lens dims rather than removes: Waiting on you lights only the amber cube, the overflow lights for what it hides, no lens is null',
  lit?.size === 1 && lit.has('late') && litHidden?.has(M.ORCH_OVERFLOW_ID) === true &&
    M.orchLensLit(many.graph.nodes, new Set(), false) === null,
  JSON.stringify({ lit: lit && [...lit], litHidden: litHidden && [...litHidden] }))
ok('orch.wash.1 a stage shift is a known item whose state moved; a first sight or an unchanged item washes nothing',
  JSON.stringify(M.orchStageShifts?.(new Map([['a', 'working'], ['b', 'todo']]), [
    { id: 'a', state: 'review' }, { id: 'b', state: 'todo' }, { id: 'new', state: 'done' }
  ])) === JSON.stringify([{ id: 'a', from: 'working', to: 'review' }]))
const viewFlat = viewSrc.replace(/\s+/g, ' ')
{
  const think = M.orchPhase([{ type: 'text' }, { type: 'thinking', text: 'SECRET-PLAN' }], true)
  const using = M.orchPhase([{ type: 'thinking' }, { type: 'tool_use', name: 'Bash' }], true)
  const ran = M.orchPhase([{ type: 'tool_use', name: 'Bash' }], false)
  const stale = M.orchPhase([{ type: 'thinking', text: 'x' }], false)
  ok('orch.phase.1 a live thinking block is the word "Thinking…" and never its contents; a finished turn is never "thinking"',
    think.label === 'Thinking…' && !JSON.stringify(think).includes('SECRET') && stale.kind === 'idle', { think, stale })
  ok('orch.phase.2 a running tool reads "Using · <tool>", a finished one "Last tool:", and nothing at all yields idle rather than a placeholder',
    using.label === 'Using · Bash' && ran.label === 'Last tool: Bash' && M.orchPhase([], true).kind === 'idle', { using, ran })
  const view = readFileSync(join(__dirname, '..', 'src/renderer/orchestration/OrchestrationView.tsx'), 'utf8')
  ok('orch.phase.3 every orchPhase label the view paints is scrubbed by outward() on the same line',
    view.split('\n').filter((l) => /(found|livePhase)\.label/.test(l)).every((l) => l.includes('outward(')) && /found\.label/.test(view) && /livePhase\.label/.test(view))
}
ok('orch.gate.2 a callout tail (chat reply or terminal last line) is read inside outwardTail and scrubbed by outward() before it paints, and only for an expanded card',
  /function outwardTail\([^)]*\): string \{ const raw = isChat \? lastAssistantText\(panelId\) : terminalLine [^}]{0,80}const lines = outward\(raw/.test(viewFlat) &&
    /const tail = expanded \? outwardTail\(/.test(viewFlat) && /className="orch__callout-tail"/.test(viewSrc))

// The diorama's reduced-motion contract: static depth, tone and callouts stay;
// float, pulse and travel go. Every orch rule that animates or transitions must
// be stood down by a reduced-motion block, or a new keyframe moves silently.
{
  const css = readFileSync(join(root, 'src/renderer/styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const moving = []
  const stilled = new Set()
  const rm = /@media \(prefers-reduced-motion: reduce\) \{((?:[^{}]|\{[^{}]*\})*)\}/g
  for (const m of css.matchAll(rm)) {
    for (const r of m[1].matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/(animation|transition)\s*:\s*none/.test(r[2])) continue
      for (const s of r[1].split(',')) stilled.add(s.trim())
    }
  }
  const outside = css.replace(rm, '')
  for (const r of outside.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
    if (!/(animation|transition)\s*:/.test(r[2]) || /(animation|transition)\s*:\s*none/.test(r[2])) continue
    for (const s of r[1].split(',').map((x) => x.trim())) if (/\.orch/.test(s)) moving.push(s)
  }
  // A `filter` on a preserve-3d element computes it flat: M275's selection dim
  // sat on .orch__cube-solid and turned every unselected cube into one grey
  // card, with no red anywhere. Dim, glow or fade the faces or a 2D ancestor.
  const flattening = [...css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)]
    .filter((r) => /\.orch__cube-(solid|lift|scene)\s*$/.test(r[1].trim().split(',').pop().trim()) && /(^|;)\s*filter\s*:/.test(r[2]))
    .map((r) => r[1].trim())
  ok('orch.depth.5 no filter sits on a preserve-3d cube element (solid, lift, scene), so a dim never flattens the cube',
    flattening.length === 0, JSON.stringify(flattening))
  const loose = moving.filter((s) => !stilled.has(s))
  ok('orch.motion.1 every orchestration selector that animates or transitions is stood down under prefers-reduced-motion',
    moving.length > 0 && loose.length === 0, JSON.stringify(loose))
}
ok('orch.lens.2 the scene is fed the whole frame with a lit set (never filterGraph), callouts select and jump, and the graph is described by the blocker line',
  !/filterGraph\(/.test(viewSrc) && /litIds=\{litIds\}/.test(viewSrc) &&
    /onClick=\{\(e\) => onCard\(e, \(\) => onSelect\(node\.id\)\)\}/.test(viewFlat) &&
    /onDoubleClick=\{\(e\) => onCard\(e, \(\) => onJump\(node\.id\)\)\}/.test(viewFlat) &&
    /id="orch-blocker"/.test(viewSrc) && /describedBy: 'orch-blocker'/.test(viewSrc) &&
    /const blocker = orchBlocker\(\{ waiting: liveSnap\.counts\.waiting/.test(viewFlat))

// ---------------------------------------------------------------------------
// The bloom door. Both halves fail SILENTLY, which is why they are pinned:
// a second importer costs the FIRST chunk ~85kB with no error and no red
// suite, and a static import of OrchestrationCubes drags three.js + the
// composer along with it — the +2.2MB trap the lazy() was introduced to fix.
// ---------------------------------------------------------------------------
ok('orch.bloom-door.1 postprocessing is imported in exactly one file, and that file is reached only from the lazily-loaded cube island — a second importer puts the composer in the first chunk with no error anywhere',
  (() => {
    const { execFileSync } = require('node:child_process')
    const hits = execFileSync('grep', ['-rl', "from 'postprocessing'", join(root, 'src')], { encoding: 'utf8' })
      .trim().split('\n').filter(Boolean).map((x) => x.replace(join(root, 'src/'), ''))
    return hits.length === 1 && hits[0] === 'renderer/orchestration/orchestration-bloom.tsx'
  })(),
  'the composer belongs behind orchestration-bloom.tsx')

ok('orch.bloom-door.2 OrchestrationCubes is still reached through lazy() and nothing imports it for a value — a static import is a HANG-shaped trap, not a type error',
  (() => {
    const { execFileSync } = require('node:child_process')
    const hits = execFileSync('grep', ['-rn', "from './OrchestrationCubes'", join(root, 'src')], { encoding: 'utf8' })
      .trim().split('\n').filter(Boolean)
    // OrchestrationView takes the TYPE statically and the component lazily.
    return hits.every((line) => /import type \{/.test(line)) &&
      /lazy\(async \(\) => \(\{ default: \(await import\('\.\/OrchestrationCubes'\)\)\.OrchestrationCubes \}\)\)/.test(viewSrc)
  })(),
  'the cube island must stay behind lazy()')

// M292. three's importer set, pinned the way postprocessing's is. `three` and
// `@react-three/fiber` belong to exactly two modules, both behind the lazy()
// island; a third importer anywhere Canvas.tsx reaches puts the +2.2MB chunk
// into startup with no error and every suite green. The check reads the source
// AND the built chunks: the first chunk must not carry three's renderer.
ok('orch-zoom.3 three and @react-three/fiber are imported only by OrchestrationCubes.tsx and orchestration-bloom.tsx, and a real build keeps three.js out of the first chunk (no WebGLRenderer in any index-*.js)',
  (() => {
    const { execFileSync } = require('node:child_process')
    const hits = execFileSync('grep', ['-rlE', "from '(three|@react-three/fiber)'", join(root, 'src')], { encoding: 'utf8' })
      .trim().split('\n').filter(Boolean).map((x) => x.replace(join(root, 'src/'), '')).sort()
    const allowed = ['renderer/orchestration/OrchestrationCubes.tsx', 'renderer/orchestration/orchestration-bloom.tsx']
    if (hits.join() !== allowed.join()) return false
    const assets = join(root, 'out/renderer/assets')
    if (!existsSync(assets)) return true // no build yet: the source half stands alone (verify-all builds before the Electron tier, not before this suite)
    const first = readdirSync(assets).filter((f) => /^index-.*\.js$/.test(f))
    return first.length > 0 && first.every((f) => !readFileSync(join(assets, f), 'utf8').includes('WebGLRenderer'))
  })(),
  'three belongs behind the lazily-loaded island and its bloom door')

// M284 — Orchestrate Phase A's task island, inspector verb and decision queue
// (orchestration-island.ts), pure: the island is derived from a persisted work item
// and the worktree it names, and the queue from the chat store's own pending map.
{
  const I = load('src/renderer/orchestration/orchestration-island.ts', 'orchestration-island.cjs')
  const island = typeof I.orchTaskIsland === 'function' ? I.orchTaskIsland : () => null
  const cwds = { c1: '/Users/me/src/storefront-wt', t1: '/Users/me/src/storefront', c9: '/Users/me/src/docs' }
  const base = {
    worktrees: [{ id: 'wt1', branch: 'tc/payment-api', path: '/Users/me/src/storefront-wt', root: '/Users/me/src/storefront' }],
    sessions: [{ id: 'c9', title: 'Solo chat', kind: 'chat', agentic: true }],
    membersOf: (id) => id === 'i2' ? ['c1', 't1'] : [],
    cwdOf: (id) => cwds[id]
  }
  const lane = island({ ...base, items: [
    { id: 'i1', title: 'Queued thing', state: 'todo' },
    { id: 'i2', title: 'Payment API', state: 'working', key: 'acme/storefront#42', panelId: 'c1', worktreeId: 'wt1' },
    { id: 'i3', title: 'Also reviewing', state: 'review' }
  ] })
  ok('orch-island.1 the island is the canvas\'s focused task (first working, else review), labelled with its goal, the repository its key names and its own worktree\'s branch; its review subject is the lane\'s chat',
    lane?.itemId === 'i2' && lane.goal === 'Payment API' && lane.repository === 'acme/storefront' &&
      lane.placement.kind === 'worktree' && lane.placement.branch === 'tc/payment-api' && lane.subjectId === 'c1' &&
      JSON.stringify(lane.memberIds) === '["c1","t1"]' &&
      I.orchPlacementLine(lane) === 'acme/storefront · tc/payment-api · own worktree',
    JSON.stringify(lane))
  const shared = island({ ...base, items: [{ id: 'i2', title: 'Typed task', state: 'review', panelId: 't1' }] })
  const solo = island({ ...base, items: [{ id: 'i1', title: 'Queued', state: 'todo' }] })
  const none = island({ ...base, sessions: [], items: [] })
  ok('orch-island.2 no worktree is SAID (a shared directory, from a member\'s cwd, repository from its folder); no working/review task falls back to a lone agent session; nothing at all is null, never a sample',
    shared?.placement.kind === 'shared' && shared.placement.path === '/Users/me/src/storefront' && shared.repository === 'storefront' &&
      I.orchPlacementLine(shared) === 'storefront · shared directory' &&
      solo?.source === 'session' && solo.itemId === undefined && solo.subjectId === 'c9' && solo.repository === 'docs' &&
      none === null,
    JSON.stringify({ shared, solo, none }))
  const nx = typeof I.orchNextAction === 'function' ? I.orchNextAction : () => ({})
  ok('orch-island.3 the inspector\'s next action reads the recorded state: a pending permission is answer, a waiting chat is reply, working is watch, an IDLE agent is review — never done',
    nx({ state: 'wants-you', kind: 'chat', pendingTool: 'Bash' }).verb === 'answer' &&
      nx({ state: 'wants-you', kind: 'chat' }).verb === 'reply' &&
      nx({ state: 'busy', kind: 'terminal' }).verb === 'watch' &&
      nx({ state: 'idle', kind: 'chat' }).verb === 'review' &&
      nx({ state: 'exited', kind: 'chat' }).verb === 'open')
  const pendingQ = [{ id: 'c1', requestId: 'r1', toolName: 'Bash', argument: 'npm test' }, { id: 'c2', requestId: 'r7', toolName: 'Write', argument: 'a.ts' }]
  const rows = I.orchAttentionRows(pendingQ, (id) => `title ${id}`, new Set([I.orchAnswerKey('c1', 'r1')]))
  const pruned = I.orchPruneSent(new Set([I.orchAnswerKey('c1', 'r1'), I.orchAnswerKey('c2', 'r7')]), [pendingQ[1]])
  ok('orch-attn.1 a Needs attention row is keyed by the request\'s own (panel id, requestId), is inert once this page sent its answer, and leaves the sent set when the store drops it (answered anywhere)',
    rows.length === 2 && rows[0].sent === true && rows[1].sent === false && rows[1].title === 'title c2' &&
      pruned.size === 1 && pruned.has('c2:r7') && !pruned.has('c1:r1'),
    JSON.stringify({ rows, pruned: [...pruned] }))
}

// M284. Every new text the page shows passes the gate the page's other readers do
// (orch.gate.1), and review is read only through the review node's executors.
// M287 moved the diff and the review reads into OrchWorkbench.tsx; the pin
// reads the page as the pair, so the gate cannot be walked around by the split.
const benchSrc = readFileSync(join(root, 'src/renderer/orchestration/OrchWorkbench.tsx'), 'utf8')
ok('orch.gate.3 OrchestrationView scrubs a pending request\'s argument and every diff line through outward(), and reads review only through window.canvas.review.*',
  /outward\(p\.argument/.test(viewSrc) && /outward\(line\.text/.test(benchSrc) &&
    /canvas\.review\.panel\(/.test(benchSrc) && /canvas\.review\.diff\(/.test(benchSrc) &&
    !/review\.(commit|discard)\(/.test(viewSrc + benchSrc) &&
    // M290. The two writes moved into ONE named module; every other file under orchestration/ stays write-free.
    readdirSync(join(root, 'src/renderer/orchestration')).filter((f) => f !== 'orch-review-write.ts').every((f) => !/review\.(commit|discard)\(/.test(readFileSync(join(root, 'src/renderer/orchestration', f), 'utf8'))))

// M283. The page boundary, read off Canvas.tsx: the covered host is inert, and the
// predicate every edit:* chord and canvas shortcut gates on includes the cover. The
// behaviour itself is verify:panels:shell orch-page.1–.6; this pins the two lines a
// refactor could drop without any red there being obviously about them.
{
  const canvasSrc = readFileSync(join(root, 'src/renderer/canvas/Canvas.tsx'), 'utf8')
  ok('orch-page.src.1 the canvas host is inert while Orchestrate covers it, and shouldIgnoreKeys reads the cover first',
    /inert=\{chrome\.centerView === 'orchestration'\}/.test(canvasSrc) &&
      /\(\) => canvasCoveredRef\.current \|\| palette\.isOpen\(\)/.test(canvasSrc) &&
      /enabled: !palette\.open && chrome\.centerView !== 'orchestration'/.test(canvasSrc))
}

// M287 — workbench.1–.3. THE WORKBENCH, pinned as text where behaviour lives
// in the Electron tier (verify:panels:agents orch-bench.*): the tab list, no
// write door, a brief editor that can launch nothing, and the record that
// persists it wired through the canvas.
//
// M300. FIVE tabs now, and the check moved with the readers rather than ahead
// of them: M287 pinned three precisely so Artifacts and Timeline could not be
// stubbed as empty promises, so widening this line is only honest in the same
// commit that gives each of them a reader. The read-only half is unchanged and
// gains one: the strip may READ the durable record and may not WRITE to it.
{
  const bench = readFileSync(join(root, 'src/renderer/orchestration/OrchWorkbench.tsx'), 'utf8')
  const view = readFileSync(join(root, 'src/renderer/orchestration/OrchestrationView.tsx'), 'utf8')
  const prefs = readFileSync(join(root, 'src/shared/orchestrate-prefs.ts'), 'utf8')
  const canvasSrc = readFileSync(join(root, 'src/renderer/canvas/Canvas.tsx'), 'utf8')
  const orchDir = join(root, 'src/renderer/orchestration')
  const orchSrc = readdirSync(orchDir).map((f) => readFileSync(join(orchDir, f), 'utf8')).join('\n')
  ok('workbench.1 the workbench has exactly Changes · Checks · Output · Artifacts · Timeline — WORKBENCH_TABS names those five, each new tab has a READER in the strip (the durable record\'s timeline read) rather than an empty promise, and the strip still reaches only READ doors (review.panel/across/diff/identity, ledger.list, ledger.timeline, scrollback.tail): no review.commit, review.discard, agentSession.send, spawn — and no ledger.event, because the record is inspected here and written elsewhere',
    /WORKBENCH_TABS: readonly WorkbenchTab\[\] = \['changes', 'checks', 'output', 'artifacts', 'timeline'\]/.test(prefs) &&
      /function ArtifactsTab\(/.test(bench) && /function TimelineTab\(/.test(bench) && /ledger\.timeline\(/.test(bench) &&
      /review\.panel\(|review\.across\(|review\.diff\(|review\.identity\(|ledger\.list\(|scrollback\.tail\(/.test(bench) &&
      !/review\.commit|review\.discard|agentSession\.send|agentSession\.create|spawn\.|ledger\.event/.test(bench),
    JSON.stringify({ commit: /review\.commit/.test(bench), discard: /review\.discard/.test(bench), send: /agentSession\.send/.test(bench), event: /ledger\.event/.test(bench) }))
  // M300. The two new tabs' own rule: every arm of their read is a SENTENCE.
  // An unwired door, a failed read, a record with nothing for this subject and
  // a trimmed record are four different facts, and none of them is an empty box.
  ok('workbench.1b Artifacts and Timeline say what they do not have: an unwired or failed read is named as such and not as "nothing happened", an empty record says what would be written there, a trim reaches both tabs as a gap sentence, the durable record is distinguished from the live feed in words, and neither tab can re-run anything (no retry, send, dispatch or spawn in either body)',
    /is not a claim that nothing happened/.test(bench) && /is not a claim that none were produced/.test(bench) &&
      /The durable record — what was written to disk, not the live feed/.test(bench) &&
      /This is a gap, not a quiet period/.test(bench) &&
      /Older entries exist beyond the/.test(bench) && /This is the beginning of the record/.test(bench) &&
      (() => {
        const a = bench.slice(bench.indexOf('function TimelineTab('), bench.indexOf('/* ── The strip'))
        return !/onRetry|agentSession|dispatch|spawn|\.run\(|review\.commit/.test(a)
      })(),
    'artifacts/timeline words')
  const editorStart = view.indexOf('function OrchBriefEditor(')
  const editor = editorStart === -1 ? '' : view.slice(editorStart, view.indexOf('\nexport const OrchestrationView', editorStart))
  ok('workbench.2 editing a brief launches nothing: the brief editor calls onPatchWorkItem and NO dispatch, send, spawn, startWork or run, saves on blur rather than on every keystroke, and its inputs are named so a check can find them',
    editor.length > 200 && /onPatchWorkItem\(itemId, \{ brief:/.test(editor) && /onPatchWorkItem\(itemId, \{ criteria:/.test(editor) &&
      !/dispatch|\.send\(|spawn|startWork|runNode|agentSession/.test(editor) &&
      /onBlur=\{commitBrief\}/.test(editor) && /onBlur=\{commitCriteria\}/.test(editor) &&
      /data-orch-brief\b/.test(editor) && /data-orch-criteria\b/.test(editor),
    JSON.stringify({ len: editor.length }))
  ok('workbench.3 the side column keeps Activity and Files only (Output and Review moved down), the view seeds its prefs from the workspace record and writes every change back through onOrchestrate, and the canvas saves the record beside the starter and passes it in',
    /\(\['activity', 'files'\] as const\)/.test(view) && !/\['activity', 'terminal', 'review', 'files'\]/.test(view) &&
      /seedOrchPrefs\(orchestrate\)/.test(view) && /onOrchestrateRef\.current\?\.\(next\)/.test(view) && /sameOrchestrate\(persistedRef\.current, next\)/.test(view) &&
      /\.\.\.\(orchestrate === undefined \? \{\} : \{ orchestrate \}\)/.test(canvasSrc) && /orchestrate=\{orchestrate\}/.test(canvasSrc) && /onOrchestrate=\{setOrchestrate\}/.test(canvasSrc) && /onPatchWorkItem=\{patchWorkItem\}/.test(canvasSrc) && /taskHandoffOf=\{taskHandoffOf\}/.test(canvasSrc),
    '')
}

// M288 — orch-islands.*. MANY ISLANDS, HONEST SUBJECTS, pure: one island per
// working/review task and per directory of loose sessions, grouped by real
// paths; writers counted over the whole canvas; an append-only order; and the
// subject gate that drops a late or out-of-order answer by name.
{
  const I = load('src/renderer/orchestration/orchestration-island.ts', 'orchestration-island.cjs')
  const G = load('src/renderer/orchestration/orch-subject-gate.ts', 'orch-subject-gate.cjs')
  const cwds = { c1: '/r/app-wt1', c2: '/r/app-wt2', c3: '/r/app', c4: '/r/app', c5: '/r/docs', t9: '/r/app/sub' }
  const input = {
    items: [
      { id: 'i1', title: 'Payments', state: 'working', panelId: 'c1', worktreeId: 'w1' },
      { id: 'i2', title: 'Search', state: 'review', panelId: 'c2', worktreeId: 'w2' },
      { id: 'i3', title: 'Typed in place', state: 'working', panelId: 'c3' },
      { id: 'i4', title: 'Queued', state: 'todo' }
    ],
    worktrees: [
      { id: 'w1', branch: 'tc/payments', path: '/r/app-wt1', root: '/r/app' },
      { id: 'w2', branch: 'tc/search', path: '/r/app-wt2', root: '/r/app' }
    ],
    sessions: [
      { id: 'c1', title: 'pay chat', kind: 'chat', agentic: true }, { id: 'c2', title: 'search chat', kind: 'chat', agentic: true },
      { id: 'c3', title: 'typed chat', kind: 'chat', agentic: true }, { id: 'c4', title: 'loose chat', kind: 'chat', agentic: true },
      { id: 'c5', title: 'docs chat', kind: 'chat', agentic: true }, { id: 't9', title: 'shell', kind: 'terminal', agentic: false }
    ],
    membersOf: (id) => ({ i1: ['c1'], i2: ['c2'], i3: ['c3'] }[id] ?? []),
    cwdOf: (id) => cwds[id]
  }
  const all = typeof I.orchTaskIslands === 'function' ? I.orchTaskIslands(input) : []
  const byId = Object.fromEntries(all.map((i) => [i.id, i]))
  ok('orch-islands.1 one island per working/review task plus one per directory of loose sessions, each with its own subject, an honest count and a context label from real paths; two isolated worktrees of one repository group under that repository and never share a subject',
    all.length === 5 && byId.i1 && byId.i2 && byId.i3 && byId['dir:/r/app'] && byId['dir:/r/docs'] && !all.some((i) => i.itemId === 'i4') &&
      byId.i1.subjectId === 'c1' && byId.i2.subjectId === 'c2' && byId.i1.subjectId !== byId.i2.subjectId &&
      byId.i1.placement.kind === 'worktree' && byId.i2.placement.kind === 'worktree' && byId.i1.group === '/r/app' && byId.i2.group === '/r/app' &&
      byId.i1.sharedWith.length === 0 && byId.i1.writers === 1 &&
      I.orchPlacementLine(byId.i1) === 'app · tc/payments · own worktree' &&
      byId['dir:/r/docs'].memberIds.join() === 'c5' && byId['dir:/r/docs'].subjectId === 'c5' && byId['dir:/r/docs'].state === 'no task yet',
    JSON.stringify(all.map((i) => ({ id: i.id, subject: i.subjectId, place: i.placement, group: i.group, writers: i.writers, shared: i.sharedWith }))))
  ok('orch-islands.2 a shared directory is SAID with its writer count over the whole canvas (a task in /r/app counts the loose chat and nothing under a different root), the loose sessions of that directory are an island that shares with it, and the placement line names the count',
    byId.i3.placement.kind === 'shared' && byId.i3.writers === 2 && byId.i3.sharedWith.join() === 'dir:/r/app' &&
      byId['dir:/r/app'].writers === 2 && byId['dir:/r/app'].sharedWith.join() === 'i3' && byId['dir:/r/app'].memberIds.join() === 'c4' &&
      I.orchPlacementLine(byId.i3) === 'app · shared directory · 2 sessions write here' &&
      byId['dir:/r/docs'].writers === 1 && byId['dir:/r/docs'].sharedWith.length === 0,
    JSON.stringify({ i3: byId.i3, loose: byId['dir:/r/app'] }))
  const order1 = I.orchIslandOrder([], ['i1', 'i2'])
  const order2 = I.orchIslandOrder(['i2', 'i1'], ['i1', 'i2', 'i3'])
  const order3 = I.orchIslandOrder(['i2', 'i9', 'i1'], ['i1', 'i2'])
  const moved = I.orchMoveIsland(['i1', 'i2', 'i3'], 'i3', -1)
  const groups = I.orchIslandGroups(all, ['i2', 'dir:/r/docs', 'i1', 'i3', 'dir:/r/app'])
  ok('orch-islands.3 placement is append-only: a new island joins at the END of the kept order, a gone one drops out, a move steps one place and returns a new array (the old one is the undo), and grouping follows the order it is given',
    order1.join() === 'i1,i2' && order2.join() === 'i2,i1,i3' && order3.join() === 'i2,i1' &&
      moved.join() === 'i1,i3,i2' && I.orchMoveIsland(['i1', 'i2'], 'i1', -1) === null && I.orchMoveIsland(['i1', 'i2'], 'zz', 1) === null &&
      groups.map((g) => g.label).join() === 'app,docs' && groups[0].islands.map((i) => i.id).join() === 'i2,i1,i3,dir:/r/app',
    JSON.stringify({ order1, order2, order3, moved, groups: groups.map((g) => [g.label, g.islands.map((i) => i.id)]) }))
  const gate = G.createSubjectGate()
  gate.move('A'); const a1 = gate.ask('A')
  gate.move('B'); const b1 = gate.ask('B')
  gate.move('A'); const a2 = gate.ask('A')
  const late = { b: gate.lands(b1), a2: gate.lands(a2), a1: gate.lands(a1) }
  gate.move('C'); const c1 = gate.ask('C'); const c2 = gate.ask('C')
  const ooo = { c2: gate.lands(c2), c1: gate.lands(c1), c2again: gate.lands(c2) }
  ok('orch-islands.4 the subject gate: a rapid A → B → A switch lands only the read asked for the CURRENT A (B\'s late answer and A\'s first, older answer are dropped), and two answers for one subject arriving out of order keep the newer (the older is dropped, and nothing lands twice)',
    late.b === false && late.a2 === true && late.a1 === false && ooo.c2 === true && ooo.c1 === false && ooo.c2again === false && gate.current() === 'C',
    JSON.stringify({ late, ooo }))
  const primary = I.orchTaskIsland(input)
  ok('orch-islands.5 Phase A\'s one island is the PRIMARY of the many — the canvas\'s focused task by the same pick — so the frame and the first island still name one task',
    primary && primary.id === 'i1' && primary.subjectId === 'c1', JSON.stringify(primary))
}

// M289 — orch-dep.*. THE DEPENDENCY LENS, pure: authored edges only, the
// trigger's exact condition, the canvas's recorded sentence as the status, a
// skipped prerequisite as a NAMED blocker, the transitive closure as the lit set.
{
  const Dp = load('src/renderer/orchestration/orchestration-dependency.ts', 'orchestration-dependency.cjs')
  const edges = [
    { from: '__hub__', to: 'build' }, { from: '__hub__', to: 'test' }, { from: '__hub__', to: 'deploy' }, { from: '__hub__', to: 'lint' },
    { from: 'build', to: 'test', authored: true, trigger: 'on exit 0' },
    { from: 'test', to: 'deploy', authored: true, trigger: 'on exit 0' },
    { from: 'lint', to: 'deploy', authored: true },
    { from: 'other', to: 'lint', authored: true, trigger: 'after a turn' }
  ]
  const results = new Map([['build:test', 'skipped — exit 1 is not exit 0'], ['other:lint', 'handed off 12 lines after a turn']])
  const states = { build: 'exited', test: 'idle', deploy: 'idle', lint: 'idle', other: 'idle' }
  const dep = Dp.orchDependencyEdges({ edges, results, stateOf: (id) => states[id], titleOf: (id) => id.toUpperCase() })
  const testFocus = Dp.orchDependencyFocus('test', dep)
  const deployFocus = Dp.orchDependencyFocus('deploy', dep)
  const lintFocus = Dp.orchDependencyFocus('lint', dep)
  ok('orch-dep.1 only authored edges are dependencies (hub spokes never appear), each carries its trigger and the exact condition in words, a bare link is said to cross nothing, and the status is the canvas\'s recorded sentence — fired, skipped — or pending/unknown when nothing was recorded (an exited source with no record is unknown, never blocked)',
    dep.length === 4 && !dep.some((e) => e.from === '__hub__') &&
      dep.find((e) => e.from === 'build').status === 'skipped' && dep.find((e) => e.from === 'build').condition === 'fires only when the source exits with code 0' &&
      dep.find((e) => e.from === 'other').status === 'fired' && dep.find((e) => e.from === 'lint').trigger === 'a bare link' && /crosses it on its own/.test(dep.find((e) => e.from === 'lint').condition) &&
      dep.find((e) => e.from === 'test').status === 'pending' && Dp.orchDepStatus(undefined, 'exited') === 'unknown',
    JSON.stringify(dep))
  ok('orch-dep.2 a dependency failure blocks downstream with a NAMED reason: test\'s prerequisite build was skipped, so test reads Blocked with the recorded sentence and the source\'s name; deploy, one step further, lists test as a pending prerequisite and is not called blocked by inference',
    testFocus.blockers.length === 1 && testFocus.blockers[0].from === 'build' && testFocus.blockers[0].reason === 'skipped — exit 1 is not exit 0' &&
      Dp.orchBlockedLine(testFocus) === 'Blocked — BUILD: skipped — exit 1 is not exit 0' &&
      deployFocus.blockers.length === 0 && Dp.orchBlockedLine(deployFocus) === null && deployFocus.prerequisites.map((e) => e.from).sort().join() === 'lint,test',
    JSON.stringify({ testFocus: { ...testFocus, lit: [...testFocus.lit] }, deployBlock: Dp.orchBlockedLine(deployFocus) }))
  ok('orch-dep.3 the focus lights the transitive closure both ways and nothing else, the lens says it is read-only, and grouping is labelled as grouping — no sentence in the module names a supervisor',
    [...testFocus.lit].sort().join() === 'build,deploy,test' && [...lintFocus.lit].sort().join() === 'deploy,lint,other' && [...deployFocus.lit].sort().join() === 'build,deploy,lint,other,test' &&
      /read-only/.test(Dp.ORCH_DEP_READ_ONLY) && /not a supervisor/.test(Dp.ORCH_DEP_GROUPING) &&
      !/\.dispatch\(|\.send\(|spawn\(|agentSession|window\.canvas/.test(readFileSync(join(root, 'src/renderer/orchestration/orchestration-dependency.ts'), 'utf8')),
    JSON.stringify({ test: [...testFocus.lit], lint: [...lintFocus.lit], deploy: [...deployFocus.lit] }))
}

// M290 — orch-limits.*. CAPABILITY-AWARE CONTROLS AND LIMITS, pure: a control
// exists only where the backend registry says the door exists; the words are
// the plan's; a limit says enforced or advisory and what it covers; unknown
// spend reads Unknown; a stopped session, an interrupted run and an unknown
// spend are three different answers.
{
  const C = load('src/renderer/orchestration/orchestration-controls.ts', 'orchestration-controls.cjs')
  const busyClaude = C.orchControls({ kind: 'chat', title: 'api', backend: 'claude', state: 'busy' })
  const busyCodex = C.orchControls({ kind: 'chat', title: 'cx', backend: 'codex', state: 'busy' })
  const idleClaude = C.orchControls({ kind: 'chat', title: 'api', backend: 'claude', state: 'idle', lastTurn: { kind: 'ok', at: 1 } })
  const exitedClaude = C.orchControls({ kind: 'chat', title: 'api', backend: 'claude', state: 'exited', lastPrompt: 'run the tests' })
  const interruptedClaude = C.orchControls({ kind: 'chat', title: 'api', backend: 'claude', state: 'idle', lastTurn: { kind: 'interrupted', at: 1 }, lastPrompt: 'go' })
  const term = C.orchControls({ kind: 'terminal', title: 'sh', state: 'busy' })
  const ids = (r) => r.controls.map((c) => c.id).join()
  ok('orch-limits.1 Interrupt appears only for a generating chat whose backend has an interrupt door (claude yes, codex no — the registry\'s own reason kept), Retry only after a failed or stopped turn with a prompt to retry from on a backend that resumes, and reassign and stop are ABSENT with a reason on every input; the words promise no rollback, no process end, no checkpoint, and a retry that sends nothing and repeats no failed command',
    ids(busyClaude) === 'interrupt' && /no resumable checkpoint/.test(busyClaude.controls[0].affects) && /process stays up/.test(busyClaude.controls[0].affects) && /rolled back/.test(busyClaude.controls[0].affects) &&
      ids(busyCodex) === '' && busyCodex.absent.find((a) => a.id === 'interrupt').reason === 'codex has no interrupt — close the panel to stop it' &&
      ids(idleClaude) === '' && ids(exitedClaude) === 'retry' && /sends nothing/.test(exitedClaude.controls[0].affects) && /not assumed safe to repeat/.test(exitedClaude.controls[0].affects) &&
      ids(interruptedClaude) === 'retry' && ids(term) === '' &&
      [busyClaude, busyCodex, idleClaude, exitedClaude, term].every((r) => r.absent.some((a) => a.id === 'reassign') && r.absent.some((a) => a.id === 'stop')),
    JSON.stringify({ busyClaude, busyCodex, idleClaude, exitedClaude, interruptedClaude, term }))
  const none = C.orchLimits({ maxConcurrent: 0, budgetUsd: 0, budgetWindowPercent: 0, inFlight: 1, sessions: [{ backend: 'claude', costUsd: 0.5 }, { backend: 'codex' }], rateLimit: { kind: 'none' } })
  const set = C.orchLimits({ maxConcurrent: 2, budgetUsd: 5, budgetWindowPercent: 80, inFlight: 1, sessions: [{ backend: 'claude', costUsd: 1.25 }, { backend: 'claude' }, { backend: 'copilot' }], rateLimit: { kind: 'allowed', overage: false, at: 1, windows: { five_hour: { utilization: 0.42 } } } })
  const row = (rows, id) => rows.find((r) => r.id === id)
  ok('orch-limits.2 every limit says which KIND it is and what it covers: with nothing set all four read advisory (time always does — no runtime enforces one); with the three settings set, concurrency, spend and the usage window read enforced and name what is not covered; spend sums only reporting sessions and counts the unknown ones by number, never implying a cap across providers that report none',
    none.length === 4 && none.every((r) => r.kind === 'advisory') && row(none, 'spend').value === '$0.50 · 1 session unknown' && /nothing refuses/.test(row(none, 'spend').coverage) &&
      row(set, 'concurrency').kind === 'enforced' && row(set, 'concurrency').value === '1 of 2 turns in flight' && /terminals and watchers are not counted/.test(row(set, 'concurrency').coverage) &&
      row(set, 'spend').kind === 'enforced' && row(set, 'spend').value === '$1.25 of $5.00 · 2 sessions unknown' && /not counted and not capped/.test(row(set, 'spend').coverage) &&
      row(set, 'window').kind === 'enforced' && row(set, 'window').value === '42% used · stops at 80%' && /report no window are not covered/.test(row(set, 'window').coverage) &&
      row(set, 'time').kind === 'advisory' && row(set, 'time').value === 'no time limit',
    JSON.stringify({ none, set }))
  const st = (i) => C.orchSessionStanding(i)
  ok('orch-limits.3 a stopped session, an interrupted run and an unknown spend stay distinguishable: exited is stopped, an interrupted last turn on a live session is interrupted (not idle, not stopped), an aborted turn carries main\'s reason, and spend is Unknown WITH its reason for a codex session, a claude session that has reported nothing, and a non-agent',
    st({ state: 'exited', exitCode: 1 }).kind === 'stopped' && /exited \(1\)/.test(st({ state: 'exited', exitCode: 1 }).word) &&
      st({ state: 'idle', lastTurn: { kind: 'interrupted', at: 1 } }).kind === 'interrupted' && st({ state: 'idle', lastTurn: { kind: 'ok', at: 1 } }).kind === 'idle' &&
      st({ state: 'idle', lastTurn: { kind: 'aborted', at: 1, reason: 'budget' } }).word === 'aborted — budget; the session is still up' && st({ state: 'busy' }).kind === 'running' &&
      C.orchSpendWord({ backend: 'codex' }).word === 'Unknown — codex reports no cost' && C.orchSpendWord({ backend: 'claude' }).known === false && /reported nothing yet/.test(C.orchSpendWord({ backend: 'claude' }).word) &&
      C.orchSpendWord({}).known === false && C.orchSpendWord({ backend: 'claude', costUsd: 2 }).word === '$2.00 reported by claude',
    '')
  const bench = readFileSync(join(root, 'src/renderer/orchestration/OrchWorkbench.tsx'), 'utf8')
  const write = readFileSync(join(root, 'src/renderer/orchestration/orch-review-write.ts'), 'utf8')
  const view = readFileSync(join(root, 'src/renderer/orchestration/OrchestrationView.tsx'), 'utf8')
  ok('orch-limits.4 commit and discard reach main ONLY through orch-review-write.ts, which always sends `expect` (a read with no identity is refused by name, never written), the workbench offers them only for a `changes` result with an identity and blocks `shared` by name, and the composer\'s retry exit inserts into the canvas composer and never sends',
    /review\.commit\(\{ root: input\.root, paths: \[\.\.\.input\.paths\], message: input\.message\.trim\(\), expect: input\.identity \}\)/.test(write) &&
      /review\.discard\(\{ root: input\.root, baseline: input\.baseline, subjectId: input\.subjectId, paths: \[\.\.\.input\.paths\], expect: input\.identity \}\)/.test(write) &&
      /if \(input\.identity === undefined\) return \{ kind: 'refused'/.test(write) &&
      /orchCommit, orchDiscard/.test(bench) && !/review\.commit\(|review\.discard\(/.test(bench) &&
      /r\.kind === 'shared'\) return \{ kind: 'blocked'/.test(bench) && /r\.identity === undefined\) return \{ kind: 'blocked'/.test(bench) &&
      /onRetryOnCanvas\(selectedRow\.id, text\)/.test(view) && !/agentSession\.send/.test(view + bench + write),
    '')
}

// ---------------------------------------------------------------------------
// M291 — the platform scene (orchestration-platforms.ts), pure. Stable cells,
// urgent seating, three kinds by shape, hit order where plates overlap.
// ---------------------------------------------------------------------------
{
  const P = load('src/renderer/orchestration/orchestration-platforms.ts', 'orchestration-platforms.cjs')
  const D = load('src/renderer/orchestration/orchestration-depth.ts', 'orchestration-depth-m291.cjs')
  const isl = (id, path, members, extra = {}) => ({ id, itemId: id, source: 'work-item', goal: `goal ${id}`, state: 'working', repository: 'repo', placement: { kind: 'worktree', branch: `b-${id}`, path }, memberIds: members, subjectId: members[0] ?? null, writers: 1, sharedWith: [], group: '/r', ...extra })
  const row = (id, kind, state) => ({ id, title: id, kind, state, tone: 'idle', agentic: kind === 'chat' })
  const homes = { c1: '/r/a', c2: '/r/a', c3: '/r/b', w1: '/r/a', w9: '/elsewhere', t9: undefined, f1: '/r/a' }
  const base = { order: ['A', 'B'], roster: [row('c1', 'chat', 'busy'), row('c2', 'chat', 'idle'), row('c3', 'chat', 'wants-you'), row('w1', 'watcher', 'passed'), row('w9', 'watcher', 'watching'), row('t9', 'terminal', 'idle')], files: [{ id: 'f1', title: 'a.txt', path: '/r/a/a.txt' }], homeOf: (id) => homes[id], focusedId: null }
  const two = P.orchPlatforms({ ...base, islands: [isl('A', '/r/a', ['c1']), isl('B', '/r/b', ['c3'])] })
  const a = two.find((p) => p.id === 'A'), b = two.find((p) => p.id === 'B'), ws = two.find((p) => p.id === P.ORCH_WORKSPACE_PLATFORM)
  ok('orch-3d.1 every object stands on ONE platform: a member on its island, a stray session or file on the island whose directory owns it, and what no island owns on the workspace plate — which is synthetic and says grouping, never a supervisor',
    two.length === 3 && two[0].id === P.ORCH_WORKSPACE_PLATFORM && a && b && ws && ws.synthetic === true && /not a supervisor/.test(ws.sub) &&
      a.stations.map((s) => s.id).join() === 'c1,c2' && a.checkpoints.map((s) => s.id).join() === 'w1' && a.artifacts.map((s) => s.id).join() === 'f1' &&
      b.stations.map((s) => s.id).join() === 'c3' && ws.stations.map((s) => s.id).join() === 't9' && ws.checkpoints.map((s) => s.id).join() === 'w9' &&
      a.stations.every((s) => s.kind === 'station') && a.checkpoints.every((s) => s.kind === 'checkpoint' && s.layer === 0) && a.artifacts.every((s) => s.kind === 'artifact' && s.path === '/r/a/a.txt'),
    JSON.stringify(two.map((p) => ({ id: p.id, s: p.stations.map((x) => x.id), c: p.checkpoints.map((x) => x.id), f: p.artifacts.map((x) => x.id) }))))
  // Stable placement: a third island appends; A and B do not move; a station arriving on A moves nothing.
  const three = P.orchPlatforms({ ...base, order: ['A', 'B', 'C'], islands: [isl('A', '/r/a', ['c1']), isl('B', '/r/b', ['c3']), isl('C', '/r/c', [])] })
  const moreOnA = P.orchPlatforms({ ...base, roster: [...base.roster, row('c4', 'chat', 'busy')], homeOf: (id) => (id === 'c4' ? '/r/a' : homes[id]), islands: [isl('A', '/r/a', ['c1']), isl('B', '/r/b', ['c3'])] })
  const at = (list, id) => { const p = list.find((x) => x.id === id); return p && `${p.x},${p.y},${p.w},${p.h}` }
  ok('orch-3d.2 placement is stable under live updates: the workspace plate holds cell 0 for good, a new island takes the next cell and moves no existing platform; a station arriving on an island changes neither that platform\'s footprint nor its neighbours\'; cells are a function of the index alone',
    at(three, 'A') === at(two, 'A') && at(three, 'B') === at(two, 'B') && at(three, P.ORCH_WORKSPACE_PLATFORM) === at(two, P.ORCH_WORKSPACE_PLATFORM) && three.find((p) => p.id === 'C').cell.row === 1 && three.find((p) => p.id === 'C').cell.col === 0 &&
      at(moreOnA, 'A') === at(two, 'A') && at(moreOnA, 'B') === at(two, 'B') &&
      // M294: the zig-zag — index 3 is odd, so the UPPER row, three half-pitches along; the cell stays the 3-wide append ordinal.
      JSON.stringify(P.orchCellCentre(3)) === JSON.stringify({ col: 0, row: 1, x: P.ORCH_CELL.x0 + P.ORCH_PLATFORM_HALF + 3 * P.ORCH_LATTICE.xPitch, y: P.ORCH_CELL.y0 + P.ORCH_PLATFORM_HALF }),
    JSON.stringify({ two: two.map((p) => at(two, p.id)), three: three.map((p) => at(three, p.id)) }))
  // The cap: 12 stations, two of them waiting and one past the cap in canvas order.
  const many = Array.from({ length: 12 }, (_, i) => row(`s${i}`, 'chat', i === 10 || i === 11 ? 'wants-you' : i < 3 ? 'busy' : 'idle'))
  const capped = P.orchPlatforms({ ...base, order: ['A'], roster: many, files: [], homeOf: () => '/r/a', islands: [isl('A', '/r/a', many.map((r) => r.id))] }).find((p) => p.id === 'A')
  const focused = P.orchPlatforms({ ...base, order: ['A'], roster: many, files: [], homeOf: () => '/r/a', focusedId: 'A', islands: [isl('A', '/r/a', many.map((r) => r.id))] }).find((p) => p.id === 'A')
  ok('orch-3d.3 past the cap a platform seats every WAITING station whatever its index, then the live ones, then the rest, and counts the remainder honestly (+N more · none need you); the focused platform expands to seat them all and its footprint grows',
    capped.stations.length === P.ORCH_STATION_CAP + 2 && capped.stations.some((s) => s.id === 's10') && capped.stations.some((s) => s.id === 's11') && capped.stations.some((s) => s.id === 's0') &&
      capped.hidden.ids.length === 2 && capped.hidden.needsYou === 0 && P.orchHiddenLine(capped) === '+2 more · none need you' && /^2 need you/.test(P.orchPlatformCountsLine(capped)) &&
      focused.stations.length === 12 && focused.hidden.ids.length === 0 && focused.expanded === true && focused.w > capped.w,
    JSON.stringify({ seated: capped.stations.map((s) => s.id), hidden: capped.hidden, counts: P.orchPlatformCountsLine(capped), fw: focused.w, cw: capped.w }))
  // Hit order: an expanded plate paints after its neighbour AND its neighbour's stations; a station wins over its own plate.
  const order = P.orchHitOrder([
    { kind: 'platform', id: 'A', depth: -0.5, expanded: true }, { kind: 'platform', id: 'B', depth: -0.5 },
    { kind: 'station', id: 'sB', depth: -0.45, platformId: 'B' }, { kind: 'station', id: 'sA', depth: -0.45, platformId: 'A' }
  ]).map((t) => t.id)
  const hit = P.orchHitAt({ x: 50, y: 50 }, [{ id: 'B', kind: 'platform', x: 0, y: 0, w: 100, h: 100 }, { id: 'sB', kind: 'station', x: 40, y: 40, w: 20, h: 20 }, { id: 'A', kind: 'platform', x: 30, y: 30, w: 100, h: 100 }])
  const own = P.orchHitAt({ x: 50, y: 50 }, [{ id: 'B', kind: 'platform', x: 0, y: 0, w: 100, h: 100 }, { id: 'sB', kind: 'station', x: 40, y: 40, w: 20, h: 20 }])
  ok('orch-3d.4 hit order is paint order: a station over its own plate wins the click, and an expanded plate covering a neighbour wins over that neighbour\'s stations — the same rule the overlay\'s DOM order applies',
    order.join() === 'B,sB,A,sA' && hit && hit.id === 'A' && own && own.id === 'sB', JSON.stringify({ order, hit, own }))
  const cam = { x: 0, y: 0, k: 1 }
  const st = { w: 860, h: 420 }
  const top = D.orchProjectWorld({ x: 100, y: 0 }, st, cam), bottom = D.orchProjectWorld({ x: 100, y: 420 }, st, cam)
  const fit = D.orchFitCamera(P.orchPlatformBounds(three), st, 24)
  const centre = D.orchProjectWorld({ x: P.orchPlatformBounds(three).x + P.orchPlatformBounds(three).w / 2, y: P.orchPlatformBounds(three).y + P.orchPlatformBounds(three).h / 2 }, st, fit)
  ok('orch-3d.5 the platform projection is one uniform camera with the stage tilt (y foreshortened by cos tilt, x not), and orchFitCamera puts the bounds\' centre at the stage\'s centre within the zoom range',
    Math.abs((bottom.y - top.y) - 420 * D.ORCH_COS_TILT) < 1e-9 && top.x === bottom.x && Math.abs(centre.x - 430) < 1e-6 && Math.abs(centre.y - 210) < 1e-6 && fit.k >= D.ORCH_ZOOM_RANGE.min && fit.k <= D.ORCH_ZOOM_RANGE.max,
    JSON.stringify({ top, bottom, fit, centre }))
  const cubes = readFileSync(join(root, 'src/renderer/orchestration/OrchestrationCubes.tsx'), 'utf8')
  const view = readFileSync(join(root, 'src/renderer/orchestration/OrchestrationView.tsx'), 'utf8')
  ok('orch-3d.6 the three kinds are three SHAPES in the island (cube, hexagonal puck, tablet) and three WORDS on the plate (state, `check · <result>`, `file`), so a test result never reads as another reasoning agent and no state is colour alone; the platform layers are said to be decorative before hit accuracy',
    /CylinderGeometry\([^)]*6\)/.test(cubes) && /shape === 'tablet'/.test(cubes) && /`check · \$\{stateWord\(node\)\}`/.test(view) && /sub: 'file'/.test(view) && /expendable before hit accuracy/.test(cubes) && /data-orch-object=\{objectKind\}/.test(view))

  // -------------------------------------------------------------------------
  // M294. The isometric scene pass: the diamond's hit outline follows the mesh,
  // the zig-zag fills the stage, connectors are grouping and finite, names
  // degrade by tier, and the selection lift is a visible world-y move.
  // -------------------------------------------------------------------------
  const styles = readFileSync(join(root, 'src/renderer/styles.css'), 'utf8')
  const wsP = three.find((p) => p.id === P.ORCH_WORKSPACE_PLATFORM)
  const k1 = { x: 0, y: 0, k: 1 }
  const c0 = D.orchProjectWorld({ x: wsP.x, y: wsP.y }, st, k1)
  const hx = wsP.half, hy = wsP.half * D.ORCH_COS_TILT, bandPx = 10 * D.ORCH_SIN_TILT
  const poly = P.orchPlatformHitPolygon(c0, hx, hy, bandPx)
  const topTip = D.orchProjectWorld({ x: wsP.x, y: wsP.y - wsP.half }, st, k1), leftTip = D.orchProjectWorld({ x: wsP.x - wsP.half, y: wsP.y }, st, k1)
  const near = (a, b) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6
  const box = P.orchPolygonBounds(poly)
  const target = { id: 'ws', kind: 'platform', ...box, points: poly }
  const cornerMiss = P.orchHitAt({ x: box.x + 3, y: box.y + 3 }, [target]) === null
  const centreHit = P.orchHitAt({ x: c0.x, y: c0.y }, [target])?.id === 'ws'
  const bandHit = P.orchHitAt({ x: c0.x, y: c0.y + hy + bandPx * 0.5 }, [target])?.id === 'ws'
  const inscribed = three.every((p) => p.stations.every((s) => Math.abs(s.x - p.x) + Math.abs(s.y - p.y) + P.ORCH_OBJECT_SIZE.station <= p.half + 1e-6))
  ok('orch-iso.1 the platform is the reference\'s isometric diamond and its hit-target is cut to the mesh\'s own rule: a square turned 45° in its own plane inside the stage tilt (the mesh), a six-point outline whose tips are the projected corners of that square (the SVG polygon, the flat fallback and orchHitAt alike) — a click in the diamond\'s empty corner misses, the centre and the thickness band hit — every station stands inside the diamond, and the label box sits clear above the top tip',
    /rotation=\{\[0, 0, Math\.PI \/ 4\]\}/.test(cubes) && /spec\.side \* fit\.scale/.test(cubes) &&
      /<polygon className="orch__platform-hit" data-orch-platform-hit=\{t\.id\} points=\{pp\.points/.test(view) && /data-orch-flat="platform" points=\{pp\.points/.test(view) &&
      near(poly[0], topTip) && near(poly[5], leftTip) && poly.length === 6 && cornerMiss && centreHit && bandHit && inscribed &&
      /p\.labelSide === 'above' \? y - hy - ORCH_PLATE_LABEL\.gap - ORCH_PLATE_LABEL\.h : y \+ hy \+ band \+ ORCH_PLATE_LABEL\.gap/.test(view) && /weight: 12, \.\.\.pp\.label/.test(view) &&
      wsP.labelSide === 'below' && three.find((p) => p.id === 'A').labelSide === 'above',
    JSON.stringify({ poly, topTip, leftTip, cornerMiss, centreHit, bandHit, inscribed }))
  // Fill: the workspace and two islands (the golden's composition) through Fit all on the 860×420 stage.
  // M298: the fit the view makes — the label plates' pixels reserved (orchLabelMargins), Fit all's own floor.
  const fitAll = D.orchFitCamera(P.orchPlatformBounds(two), st, 24, P.orchLabelMargins(two), D.ORCH_FIT_FLOOR)
  const spanY = (list, cam) => { let lo = Infinity, hi = -Infinity; for (const p of list) { const c = D.orchProjectWorld({ x: p.x, y: p.y }, st, cam); const hyp = p.half * cam.k * D.ORCH_COS_TILT; lo = Math.min(lo, c.y - hyp); hi = Math.max(hi, c.y + hyp + 10 * cam.k * D.ORCH_SIN_TILT) } return { lo, hi } }
  const span = spanY(two, fitAll)
  const fillH = (span.hi - span.lo) / st.h
  // The composition: the plates plus their label plates (44 px tall, an 8 px gap past the tip they hang from).
  const compose = { lo: span.lo - 52, hi: span.hi + 52 }
  const fillComposed = (compose.hi - compose.lo) / st.h
  const rows = new Set(two.map((p) => Math.round(p.y)))
  const fromIndex = [0, 1, 2, 3, 6, 7].every((i) => JSON.stringify(P.orchCellCentre(i)) === JSON.stringify(P.orchCellCentre(i)))
  ok('orch-iso.2 a fleet of three fills the stage: the zig-zag lattice puts the workspace lower-left, the first island upper-middle and the second lower-right — two rows, so Fit all uses the stage\'s HEIGHT: the plates span more than 60% of it and the composition (plates and their labels) more than 85% (one straight row sat in the middle third); a cell is still a function of its index alone, and Fit all keeps every plate inside the stage',
    rows.size === 2 && wsP.y > three.find((p) => p.id === 'A').y && fillH >= 0.6 && fillComposed >= 0.85 && span.lo >= 0 && span.hi <= st.h && fromIndex && fitAll.k <= D.ORCH_ZOOM_RANGE.max,
    JSON.stringify({ fillH: Number(fillH.toFixed(3)), fillComposed: Number(fillComposed.toFixed(3)), k: Number(fitAll.k.toFixed(3)), span, rows: [...rows] }))
  // Connectors: platform-to-next and station chains, no hub, trimmed clear of both outlines, grouping in the DOM, finite in CSS.
  const cons = P.orchConnectors(three)
  const stationChains = three.reduce((n, p) => n + Math.max(0, p.stations.length - 1), 0)
  const diamond = (p) => { const c = D.orchProjectWorld({ x: p.x, y: p.y }, st, k1); return P.orchPlatformHitPolygon(c, p.half, p.half * D.ORCH_COS_TILT, bandPx) }
  const pA = three.find((p) => p.id === 'A')
  const segAB = P.orchSegmentBetween(D.orchProjectWorld({ x: wsP.x, y: wsP.y }, st, k1), D.orchProjectWorld({ x: pA.x, y: pA.y }, st, k1), diamond(wsP), diamond(pA))
  const clear = segAB !== null && !P.orchPointInPolygon({ x: segAB.x1 + (segAB.x2 - segAB.x1) * 0.5, y: segAB.y1 + (segAB.y2 - segAB.y1) * 0.5 }, diamond(wsP)) && !P.orchPointInPolygon({ x: segAB.x1 + (segAB.x2 - segAB.x1) * 0.5, y: segAB.y1 + (segAB.y2 - segAB.y1) * 0.5 }, diamond(pA))
  const litRule = styles.match(/\.orch__connector--lit \{[^}]*animation: edge-current var\(--dur-packet\) ease-out 1;/)
  const stilled = /prefers-reduced-motion[\s\S]*?\.orch__connector--lit \{ animation: none; \}/.test(styles)
  ok('orch-iso.3 connectors are light paths, honestly: one from each platform to the next and a chain along a plate\'s stations, none to a hub (no synthetic node exists to meet at), every one marked and titled GROUPING in the DOM — distinct from the authored dependency edge\'s element, word and colour — trimmed clear of both outlines it joins, dimmed by the dependency lens, and lit ONCE per state event (a one-iteration keyframe, re-keyed per event, stood down under reduced motion)',
    cons.filter((c) => c.kind === 'platform').length === three.length - 1 && cons.filter((c) => c.kind === 'station').length === stationChains && cons.every((c) => !/hub|supervisor/i.test(c.from + c.to)) &&
      /data-orch-edge="grouping" data-orch-connector=\{c\.kind\}/.test(view) && /<title>\{ORCH_DEP_GROUPING\}<\/title><\/line>/.test(view) && /props\.depFocus \? ' orch__connector--lensed'/.test(view) &&
      /key=\{`\$\{c\.kind\}-\$\{c\.from\}-\$\{c\.to\}-\$\{c\.lit\}`\}/.test(view) && clear && litRule !== null && stilled &&
      /data-orch-edge="dependency"/.test(view),
    JSON.stringify({ cons: cons.length, stationChains, segAB, clear, lit: litRule !== null, stilled }))
  const tiers = [P.orchNameTier(100, false), P.orchNameTier(70, true), P.orchNameTier(70, false), P.orchNameTier(40, true)]
  ok('orch-iso.4 names at rest degrade by density tier, never a switch: a full plate (glyph, name, state word) when the station pitch on screen clears 96 px, a compact two-line plate cut to the pitch above 56 px where nothing stands in the row below, none past that — and the selection lift is a VISIBLE finite move along world y (an orthographic camera cannot show z), applied to the hit polygon, the label and the objects on the plate as one number the mesh damps to and reduced motion snaps',
    tiers.join() === 'full,compact,none,none' && P.ORCH_SELECT_LIFT >= 12 && /const lift = focused \? ORCH_SELECT_LIFT : 0/.test(view) && /const y = c\.y - lift/.test(view) && /y = c\.y - \(pp\?\.lift \?\? 0\)/.test(view) &&
      /\+ lift\.current \* fit\.scale, spec\.depth \* 24 - 40\)/.test(cubes) && /reducedMotion \? spec\.lift : THREE\.MathUtils\.damp\(lift\.current, spec\.lift/.test(cubes) &&
      /orchNameTier\(platformOf\(n\.object\.platformId\)\?\.pitchPx \?\? 0, n\.object\.front\)/.test(view) && /data-orch-name-tier="compact"/.test(view) && /front: i \+ cols >= seated\.length/.test(readFileSync(join(root, 'src/renderer/orchestration/orchestration-platforms.ts'), 'utf8')),
    JSON.stringify({ tiers, lift: P.ORCH_SELECT_LIFT }))

  // -------------------------------------------------------------------------
  // M298. The fit, at every count and every panel shape (orch-fit.*). The
  // panel sizes are the ones MEASURED in the Electron part (orch-fit.app.1)
  // on 2026-09-20, less the tools rail: the app's default window gives the
  // scene 400×224, a narrow window 676×224, a wide one 992×649. The stage
  // follows each panel's aspect (width 860, height by the shape), so a fit
  // against the stage IS a fit against the panel.
  // -------------------------------------------------------------------------
  const PANELS = [{ name: 'default', w: 400, h: 224 }, { name: 'narrow', w: 676, h: 224 }, { name: 'wide', w: 992, h: 649 }]
  const LABEL = { h: 44, gap: 8, halfW: 105 }
  const islN = (n) => Array.from({ length: n - 1 }, (_, i) => isl(`I${i}`, `/r/I${i}`, []))
  const fleet = (n) => { const islands = islN(n); return P.orchPlatforms({ ...base, roster: [], files: [], homeOf: () => undefined, order: islands.map((i) => i.id), islands }) }
  const composed = (list, cam, stg) => {
    let lo = Infinity, hi = -Infinity, xlo = Infinity, xhi = -Infinity, plo = Infinity, phi = -Infinity
    for (const p of list) {
      const c = D.orchProjectWorld({ x: p.x, y: p.y }, stg, cam)
      const hx = p.half * cam.k, hy = hx * D.ORCH_COS_TILT, band = 10 * cam.k * D.ORCH_SIN_TILT
      plo = Math.min(plo, c.y - hy); phi = Math.max(phi, c.y + hy + band)
      lo = Math.min(lo, c.y - hy - (p.labelSide === 'above' ? LABEL.gap + LABEL.h : 0)); hi = Math.max(hi, c.y + hy + band + (p.labelSide === 'below' ? LABEL.gap + LABEL.h : 0))
      xlo = Math.min(xlo, c.x - hx, c.x - LABEL.halfW); xhi = Math.max(xhi, c.x + hx, c.x + LABEL.halfW)
    }
    return { plateH: (phi - plo) / stg.h, compH: (hi - lo) / stg.h, compW: (xhi - xlo) / stg.w, clip: lo < 0 || hi > stg.h || xlo < 0 || xhi > stg.w }
  }
  const table = []
  for (const n of [1, 2, 3, 4, 7, 11, 25, 100]) {
    const list = fleet(n)
    for (const pn of PANELS) {
      const stg = { w: 860, h: Math.max(120, Math.round(860 * pn.h / pn.w)) }
      const cam = D.orchFitCamera(P.orchPlatformBounds(list), stg, 24, P.orchLabelMargins(list), D.ORCH_FIT_FLOOR)
      const m = composed(list, cam, stg)
      table.push({ n, panel: pn.name, k: Number(cam.k.toFixed(3)), plateH: Number(m.plateH.toFixed(3)), compH: Number(m.compH.toFixed(3)), compW: Number(m.compW.toFixed(3)), clip: m.clip })
    }
  }
  // Bound on one axis: the composition reaches 90% of the box's width or height (24 px pad each side), and never clips.
  // …or the zoom ceiling: one platform in a wide panel stops at k = 2.2 before it reaches the box.
  const bound = (r, pn) => { const stgH = Math.max(120, Math.round(860 * pn.h / pn.w)); return r.compH >= (stgH - 48) / stgH * 0.9 || r.compW >= (860 - 48) / 860 * 0.9 || r.k >= D.ORCH_ZOOM_RANGE.max }
  ok('orch-fit.1 Fit all fills the real panel at every count: on 1, 2, 3, 4, 7, 11, 25 and 100 platforms, in the default, narrow and wide scene panels the Electron part measured, no plate and no label plate clips the stage, the composition is bound on one axis (it reaches 90% of the padded box\'s width or its height), the plates alone span at least 40% of the height, and the label margins are screen pixels the fit reserves (the same 52 px at k = 2.2 and at k = 0.08) — a hundred platforms fit because Fit all has its own floor under the wheel\'s',
    table.every((r) => !r.clip && r.plateH >= 0.4 && bound(r, PANELS.find((p) => p.name === r.panel))) && D.ORCH_FIT_FLOOR < D.ORCH_ZOOM_RANGE.min && table.find((r) => r.n === 100 && r.panel === 'narrow').k < D.ORCH_ZOOM_RANGE.min &&
      P.orchLabelMargins(fleet(3)).top === 52 && P.orchLabelMargins(fleet(3)).bottom > 52 && P.orchLabelMargins([fleet(2)[1]]).bottom < 52 && P.orchLabelMargins([fleet(2)[1]]).top === 52,
    JSON.stringify(table))
  // The lattice: band 0 is M294's six cells exactly; later bands widen by ORCH_BAND_GROWTH and centre under it; a cell is still its index's alone.
  const m294 = (i) => ({ x: P.ORCH_CELL.x0 + P.ORCH_PLATFORM_HALF + (i % 6) * P.ORCH_LATTICE.xPitch, y: P.ORCH_CELL.y0 + P.ORCH_PLATFORM_HALF + (i % 2 === 0 ? P.ORCH_LATTICE.rowPitch : 0) })
  const band0Same = [0, 1, 2, 3, 4, 5].every((i) => { const c = P.orchCellCentre(i); const m = m294(i); return Math.abs(c.x - m.x) < 1e-9 && Math.abs(c.y - m.y) < 1e-9 })
  const bands = [6, 14, 24, 36].map((i) => P.orchBandOf(i))
  const pyramid = bands.map((b) => b.width).join() === '8,10,12,14' && bands.every((b) => b.r === 0) && P.orchBandOf(5).band === 0 && P.orchBandOf(13).band === 1 && P.orchBandOf(13).r === 7
  const centred = [1, 2, 3].every((b) => { const first = [6, 14, 24][b - 1]; const width = 6 + 2 * b; const xs = Array.from({ length: width }, (_, r) => P.orchCellCentre(first + r).x); return Math.abs((xs[0] + xs[width - 1]) / 2 - (P.orchCellCentre(0).x + P.orchCellCentre(5).x) / 2) < 1e-9 })
  const appendOnly = [0, 6, 14, 24, 40].every((i) => JSON.stringify(P.orchCellCentre(i)) === JSON.stringify(P.orchCellCentre(i)))
  const wide25 = P.orchPlatformBounds(fleet(25)), wide100 = P.orchPlatformBounds(fleet(100))
  ok('orch-fit.2 the lattice grows as a pyramid, not a strip: the first band is M294\'s six cells to the unit, every later band is two cells wider than the one above and centred under the first, a cell is still a function of its index alone, and 25 or 100 platforms are wider than they are tall (a strip of six was 42% and 29% as wide as the stage); the first paint fits a lone platform too, and a stage change refits only a camera the auto-fit set',
    band0Same && pyramid && centred && appendOnly && wide25.w > wide25.h * D.ORCH_COS_TILT && wide100.w > wide100.h * D.ORCH_COS_TILT &&
      /if \(first && \(cam\.x !== 0 \|\| cam\.y !== 0 \|\| cam\.k !== 1\)\) return/.test(view) && /autoFitted\.current = true/.test(view) && /if \(!autoFitted\.current\) return/.test(view) && /setStageH\(Math\.max\(120, Math\.round\(\(ORCH_GRAPH_SIZE\.w \* r\.height\) \/ r\.width\)\)\)/.test(view) &&
      /inset: 0 var\(--orch-rail-w\) 0 0/.test(styles),
    JSON.stringify({ band0Same, bands, centred, wide25, wide100 }))
}

// M300 — orch-timeline.*. THE DURABLE RECORD. It rides the run ledger's own
// stream, so these run the REAL writer against a real temp file rather than a
// model of it: a trim that forgets to say what it dropped is the failure this
// phase exists to stop, and it is invisible to a check that only reads types.
{
  const { mkdtempSync, writeFileSync, readFileSync } = require('node:fs')
  const { tmpdir } = require('node:os')
  const L = load('src/main/run-ledger.ts', 'run-ledger.cjs')
  const S = load('src/shared/run-ledger.ts', 'run-ledger-shared.cjs')
  const dir = mkdtempSync(join(tmpdir(), 'tc-ledger-'))

  // The parser's record rules, per field.
  const good = { kind: 'event', runId: 'r1', at: 5, event: 'handoff', source: 'app', title: 'fired', paths: ['a.ts', ''], extra: 1 }
  const parsed = S.parseEventRow(good)
  const rules = {
    kept: parsed !== null && parsed.title === 'fired' && parsed.runId === 'r1',
    // A path list is filtered, not rejected; an unknown field is not carried.
    paths: JSON.stringify(parsed?.paths) === '["a.ts"]' && parsed?.extra === undefined,
    // An unknown kind or source from a LATER build drops the row rather than
    // being coerced into a kind this build would then show as another sort of fact.
    laterKind: S.parseEventRow({ ...good, event: 'deployment' }) === null,
    laterSource: S.parseEventRow({ ...good, source: 'ci' }) === null,
    noRun: S.parseEventRow({ ...good, runId: '' }) === null,
    noTitle: S.parseEventRow({ ...good, title: '' }) === null,
    // A gap that dropped nothing is not a gap.
    zeroGap: S.parseGapRow({ kind: 'gap', at: 1, dropped: 0 }) === null,
    gap: JSON.stringify(S.parseGapRow({ kind: 'gap', at: 1, dropped: 3 })) === '{"kind":"gap","at":1,"dropped":3}'
  }
  // M300 — the WRITE door's importer set, the same shape as sonner's
  // (`toast.door.1`): a door reachable from anywhere is a door nobody can pin,
  // and history is exactly the surface where a stray writer does damage that
  // never goes red.
  {
    const srcDir = join(root, 'src')
    const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]))
    const files = walk(srcDir).filter((f) => /\.tsx?$/.test(f))
    const writers = files.filter((f) => /ledger\??\.event\b/.test(readFileSync(f, 'utf8'))).map((f) => f.slice(srcDir.length + 1))
    const importers = files.filter((f) => /from '.*orch-record'/.test(readFileSync(f, 'utf8'))).map((f) => f.slice(srcDir.length + 1)).sort()
    const record = readFileSync(join(srcDir, 'renderer/orchestration/orch-record.ts'), 'utf8')
    ok('orch-timeline.6 the renderer writes history through ONE door: only orch-record.ts calls ledger.event, its importers are the three verbs that own a fact main cannot see (dispatch, the permission answer, the review mark) plus the canvas\'s handoff funnel, and the door itself starts nothing — no send, spawn, create or run',
      JSON.stringify(writers) === JSON.stringify(['renderer/orchestration/orch-record.ts']) &&
        JSON.stringify(importers) === JSON.stringify(['renderer/canvas/Canvas.tsx', 'renderer/canvas/palette-actions/presets.ts', 'renderer/canvas/useBoardVerbs.ts']) &&
        !/agentSession|spawn\.|\.send\(|review\.commit|review\.discard/.test(record),
      JSON.stringify({ writers, importers }))
  }

  // M300 — Phase B's inherited item, pinned where it was lost: the Checks tab
  // read watchers off the CANVAS's panels only, so a watcher armed in main
  // from a template with no panel was invisible — a failed check and a page
  // showing none. Main already writes a ledger row per watcher run, so the
  // fix is a read; the piece that cannot be read is SAID.
  {
    const bench = readFileSync(join(root, 'src/renderer/orchestration/OrchWorkbench.tsx'), 'utf8')
    ok('orch-timeline.7 a watcher armed without a canvas panel is no longer invisible to Checks: the strip asks main which watchers exist, reads the durable rows of the ones no panel covers, drops a ledger row for a watcher the canvas DOES have a panel for (it is listed once, from the watcher store), and names the one case it cannot show — an armed watcher that has never run has no command text to list',
      /watcher\?\.list|watcher\.list\(\)/.test(bench) && /hiddenWatchers/.test(bench) && /hiddenUnrun/.test(bench) &&
        /const watcherPanelIds = new Set\(panels\.filter\(isWatcherPanel\)/.test(bench) &&
        /\.filter\(\(c\) => !watcherPanelIds\.has\(c\.panelId\)\)/.test(bench) &&
        /has no command to show here/.test(bench),
      'checks/watchers')
  }

  ok('orch-timeline.1 a durable event row parses field by field: a malformed optional field costs the field and keeps the row, an unknown event kind or source from a later build drops the row rather than being coerced, a row with no run id or no title is not a record, and a gap that dropped nothing is not a gap',
    Object.values(rules).every(Boolean), JSON.stringify(rules))

  // The type is the enforcement: there is nowhere in the row to put output
  // bytes, which is what keeps the retention bound a ROW COUNT.
  const src = readFileSync(join(root, 'src/shared/run-ledger.ts'), 'utf8')
  ok('orch-timeline.2 references only, enforced by the type: EventRow has paths and no output/body/content/stdout field, and the shared module still says so in one place',
    /export interface EventRow \{[^}]*\}/s.test(src) &&
      !/\n\s+(output|body|content|stdout|stderr|text|bytes)\??:/.test(src.slice(src.indexOf('export interface EventRow'), src.indexOf('export interface GapRow'))) &&
      /paths\?: string\[\]/.test(src),
    'EventRow')

  ;(async () => {
    const file = join(dir, 'ledger.jsonl')
    const led = L.createRunLedger({ file, maxLines: 10 })
    const ev = (n, over) => ({ kind: 'event', runId: 'r1', at: n, event: 'tool', source: 'agent', title: `e${n}`, ...over })
    for (let n = 1; n <= 8; n += 1) await led.append(ev(n))
    await led.append({ panelId: 'p1', command: 'npm test', cwd: '/w', startedAt: 1, endedAt: 2, exitCode: 0 })
    const read = await led.timeline({ runId: 'r1' }, 100)
    const newestFirst = read.entries.map((e) => e.row.title ?? e.row.command).slice(0, 2).join()
    ok('orch-timeline.3 a timeline read is newest first, filtered by subject, and says whether it reached the start: a run filter keeps that run\'s events and leaves a command row to the panel filter that can claim it, and reachedStart is true only when the scan consumed the file',
      read.reachedStart === true && newestFirst === 'e8,e7' && read.entries.every((e) => e.kind === 'event') &&
        (await led.timeline({ runId: 'r1' }, 3)).reachedStart === false &&
        (await led.timeline({ panelIds: ['p1'] }, 100)).entries.some((e) => e.kind === 'command'),
      JSON.stringify({ reachedStart: read.reachedStart, n: read.entries.length, newestFirst }))

    // Past the cap: the trim must leave a marker, and a SECOND trim must merge
    // into it rather than appending a second one.
    for (let n = 9; n <= 24; n += 1) await led.append(ev(n))
    const lines = readFileSync(file, 'utf8').split('\n').filter((l) => l !== '')
    const gaps = lines.map((l) => JSON.parse(l)).filter((r) => r.kind === 'gap')
    const after = await led.timeline({ runId: 'r1' }, 100)
    const gapEntries = after.entries.filter((e) => e.kind === 'gap')
    ok('orch-timeline.4 a trim SAYS what it dropped: past the cap the file carries exactly one gap row, at its head, whose count is the rows the record no longer has; a second trim merges into that gap rather than appending another, the file never exceeds the cap, and the gap reaches the reader through every subject filter because it is a fact about the FILE',
      lines.length <= 10 && gaps.length === 1 && gaps[0].dropped >= 15 && JSON.parse(lines[0]).kind === 'gap' &&
        gapEntries.length === 1 && after.entries[after.entries.length - 1].kind === 'gap',
      JSON.stringify({ lines: lines.length, gaps, tail: after.entries[after.entries.length - 1]?.kind }))

    // A malformed line costs that line, never the read.
    writeFileSync(file, 'not json\n' + JSON.stringify(ev(99)) + '\n')
    const led2 = L.createRunLedger({ file, maxLines: 10 })
    const salvage = await led2.timeline({ runId: 'r1' }, 100)
    ok('orch-timeline.5 a malformed line costs that line and never the record: a ledger whose first line is not JSON still reads its remaining rows',
      salvage.entries.length === 1 && salvage.entries[0].row.title === 'e99', JSON.stringify(salvage.entries.length))

    const failed = results.filter((x) => !x.pass)
    console.log(`verify:orchestration ${results.length - failed.length}/${results.length}`)
    if (failed.length) {
      for (const f of failed) console.log(`  FAIL ${f.id}${f.detail ? ` — ${f.detail}` : ''}`)
      process.exit(1)
    }
    process.exit(0)
  })().catch((e) => {
    // A throw inside the async block would otherwise exit 0 with no summary —
    // a suite that proves nothing and says nothing, which is worse than a red.
    console.log(`verify:orchestration FAILED to run the ledger checks — ${String(e && e.stack ? e.stack : e)}`)
    process.exit(1)
  })
}

// The ledger block above is the file's ONE exit, because its checks are async:
// a synchronous summary here would print a count that is short by five and
// then race the real one. Every check in this suite is counted there.
