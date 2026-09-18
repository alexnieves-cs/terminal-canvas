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
ok('orch.depth.4 every cube wears the one stage tilt, and the view projects through orchProjectNode',
  /-ORCH_STAGE_TILT_DEG \* Math\.PI\) \/ 180/.test(cubesSrc) && /orchProjectNode\(/.test(viewSrc) && !/far \? -38/.test(viewSrc))

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
ok('orch.gate.3 OrchestrationView scrubs a pending request\'s argument and every diff line through outward(), and reads review only through window.canvas.review.*',
  /outward\(p\.argument/.test(viewSrc) && /outward\(line\.text/.test(viewSrc) &&
    /canvas\.review\.panel\(/.test(viewSrc) && /canvas\.review\.diff\(/.test(viewSrc) &&
    !/review\.(commit|discard)\(/.test(viewSrc))

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

const failed = results.filter((x) => !x.pass)
console.log(`verify:orchestration ${results.length - failed.length}/${results.length}`)
if (failed.length) {
  for (const f of failed) console.log(`  FAIL ${f.id}${f.detail ? ` — ${f.detail}` : ''}`)
  process.exit(1)
}
