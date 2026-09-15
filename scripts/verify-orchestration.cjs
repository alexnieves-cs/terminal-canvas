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

const failed = results.filter((x) => !x.pass)
console.log(`verify:orchestration ${results.length - failed.length}/${results.length}`)
if (failed.length) {
  for (const f of failed) console.log(`  FAIL ${f.id}${f.detail ? ` — ${f.detail}` : ''}`)
  process.exit(1)
}
