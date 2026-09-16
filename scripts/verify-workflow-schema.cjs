#!/usr/bin/env node
/**
 * verify:workflow-schema (Round 6) — the workflow graph's two NEW readers.
 *
 * Plain node. esbuild bundles the shared modules to CJS the way
 * verify:orchestration does; nothing here touches electron, the DOM or a file
 * on disk, so it belongs in the cheap concurrent tier.
 *
 * THE CHECK THAT MATTERS IS `wfs.agree.1`, and it is worth saying why the
 * others are the easy ones. Two readers now exist for one shape: the layout
 * file's hand-written `parseTemplates`, and the schema the portable file and
 * `template:save` read through. Two readers of one shape drift — that is the
 * whole reason this repo keeps single tables for the handoff triggers and the
 * door list. They drift in ONE direction that hurts: if the schema grows
 * stricter than the store, an import refuses a workflow that a relaunch would
 * happily have loaded, and the person is told their file is broken by an app
 * that can read it perfectly well. So the invariant is directional and stated
 * as such: EVERYTHING THE STORE KEEPS, THE SCHEMA ACCEPTS. The reverse is not
 * asserted and must not be — the schema is allowed to refuse things the store
 * tolerates, because the store is reading this app's own past writing and the
 * schema is reading somebody else's file.
 */
const { buildSync } = require('esbuild')
const { mkdirSync } = require('node:fs')
const { join } = require('node:path')
const { ok, results } = require('./lib/checks.cjs').createChecks()

const root = join(__dirname, '..')
const outDir = join(root, 'out/verify')
mkdirSync(outDir, { recursive: true })

function load (entry, name) {
  const outfile = join(outDir, name)
  buildSync({
    entryPoints: [join(root, entry)],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['electron'],
    alias: { '@shared': join(root, 'src/shared'), '@renderer': join(root, 'src/renderer') }
  })
  return require(outfile)
}

const S = load('src/shared/workflow-graph-schema.ts', 'workflow-graph-schema.cjs')
const L = load('src/shared/layout-schema.ts', 'workflow-layout-schema.cjs')
const P = load('src/shared/portable.ts', 'workflow-portable.cjs')
const T = load('src/shared/templates.ts', 'workflow-templates.cjs')

const accepts = (graph) => S.workflowGraphSchema.safeParse(graph).success
const node = (over) => ({ key: 'a', kind: 'terminal', cwd: '/tmp', dx: 0, dy: 0, ...over })
const graph = (over) => ({ id: 'g1', name: 'a workflow', nodes: [node({})], edges: [], ...over })

// ---------------------------------------------------------------------------
// wfs.agree.1 — the drift guard.
//
// The corpus is deliberately the AWKWARD records, not the tidy ones: the
// fields that are absent on old files, the counters that are never normalised
// in, every arm of the node union, and the built-ins, which are CODE and so
// are the one set of records that can never be fixed by a migration.
// ---------------------------------------------------------------------------
const corpus = [
  // Every arm of the node union, each at its own minimum.
  { id: 'a', name: 'terminal', nodes: [{ key: 'n', kind: 'terminal', cwd: '/tmp', dx: 0, dy: 0 }], edges: [] },
  { id: 'b', name: 'chat', nodes: [{ key: 'n', kind: 'chat', cwd: '/tmp', dx: 1, dy: 2, message: 'hi' }], edges: [] },
  { id: 'c', name: 'pool', nodes: [{ key: 'n', kind: 'pool', cwd: '/tmp', dx: 0, dy: 0, width: 1, list: '/tmp/l', prompt: '' }], edges: [] },
  { id: 'd', name: 'orchestrator', nodes: [{ key: 'n', kind: 'orchestrator', cwd: '/tmp', dx: 0, dy: 0, prompt: 'p' }], edges: [] },
  { id: 'e', name: 'collect', nodes: [{ key: 'n', kind: 'collect', cwd: '/tmp', dx: 0, dy: 0, target: 't' }], edges: [] },
  { id: 'f', name: 'action', nodes: [{ key: 'n', kind: 'action', cwd: '/tmp', dx: 0, dy: 0, line: 'note-add sticky' }], edges: [] },
  { id: 'g', name: 'http', nodes: [{ key: 'n', kind: 'http', cwd: '/tmp', dx: 0, dy: 0, url: 'https://x' }], edges: [] },
  // The fields that are ABSENT on a pre-M182/M190 record, in every combination
  // that matters: no counters at all, a zero revision, and the unreviewed mark.
  { id: 'h', name: 'no counters', nodes: [node({})], edges: [] },
  { id: 'i', name: 'zero revision', nodes: [node({})], edges: [], revision: 0, nextKey: 0 },
  { id: 'j', name: 'unreviewed', nodes: [node({})], edges: [], reviewed: false },
  // An edge, and a node carrying the optional geometry an authored panel has.
  { id: 'k', name: 'edged', nodes: [node({}), node({ key: 'b', w: 400, h: 300, title: 't', args: ['-lc', 'ls'], command: '/bin/sh' })], edges: [{ from: 'a', to: 'b', trigger: 'exit-ok' }] },
  // The defaults, which are NOT uniform and are the row that would break a
  // schema written from the TYPE rather than from the store's OUTPUT: a
  // workflow node with cwd, dx, dy and prompt all absent is kept and filled
  // in by parseWorkflowNode (cwd becomes '', the rest 0 and ''), while a
  // TERMINAL node with cwd absent is DROPPED by parseTemplates. The schema
  // requires all three because it reads what the store already wrote, not
  // what an author typed.
  { id: 'l', name: 'bare node', nodes: [{ key: 'n', kind: 'pool', width: 1, list: '/l' }], edges: [] },
  ...T.BUILT_IN_TEMPLATES
]

const disagreements = []
for (const entry of corpus) {
  const warnings = []
  const kept = L.parseTemplates([entry], warnings)
  for (const record of kept) {
    const read = S.workflowGraphSchema.safeParse(record)
    if (!read.success) disagreements.push({ id: record.id, problems: S.graphProblems(read.error) })
  }
}
ok('wfs.agree.1 every record the layout store keeps is a record the schema accepts — an import never refuses what a relaunch would load',
  corpus.length >= 13 && disagreements.length === 0, JSON.stringify(disagreements))

// The corpus has to actually SURVIVE parseTemplates, or the check above is
// vacuous: a corpus the store drops agrees with everything.
const survived = corpus.filter((e) => L.parseTemplates([e], []).length === 1).length
ok('wfs.agree.2 the agreement corpus is not vacuous — the store keeps every record in it',
  survived === corpus.length, JSON.stringify({ survived, of: corpus.length }))

// ---------------------------------------------------------------------------
// The cross-field rules — the two that a hand-written parser drops when an arm
// is added, which is the reason this boundary is a schema at all.
// ---------------------------------------------------------------------------
ok('wfs.keys.1 two nodes may not both claim one key — the second would shadow the first in every map keyed by it',
  !accepts(graph({ nodes: [node({}), node({})] })))

ok('wfs.edges.1 an edge naming a node that is not in the graph is refused, and the refusal names which end is wrong',
  !accepts(graph({ nodes: [node({})], edges: [{ from: 'a', to: 'ghost', trigger: 'idle' }] })) &&
  S.graphProblems(S.workflowGraphSchema.safeParse(graph({ nodes: [node({})], edges: [{ from: 'a', to: 'ghost', trigger: 'idle' }] })).error)
    .some((p) => p.includes('ghost') && p.includes('to')))

ok('wfs.edges.2 a trigger this app does not know is malformed, never defaulted — a rule that fires on a trigger nobody wrote is the surprise the handoff table exists to prevent',
  !accepts(graph({ nodes: [node({})], edges: [{ from: 'a', to: 'a', trigger: 'whenever' }] })) &&
  accepts(graph({ nodes: [node({})], edges: [{ from: 'a', to: 'a', trigger: 'always' }] })))

// ---------------------------------------------------------------------------
// The per-arm bounds. Each states the same bound its arm in parseWorkflowNode
// states — these are the rows that go red if the two drift apart.
// ---------------------------------------------------------------------------
ok('wfs.kind.1 a node kind this app does not know is refused BY NAME, never read as a terminal with no command',
  !accepts(graph({ nodes: [{ key: 'a', kind: 'webhook', cwd: '/tmp', dx: 0, dy: 0 }] })))

ok('wfs.pool.1 a pool width of 0, a fraction, or one over the ceiling is refused — a width of 0 is a file its author did not finish, not "one worker"',
  !accepts(graph({ nodes: [{ key: 'a', kind: 'pool', cwd: '/tmp', dx: 0, dy: 0, width: 0, list: '/l', prompt: '' }] })) &&
  !accepts(graph({ nodes: [{ key: 'a', kind: 'pool', cwd: '/tmp', dx: 0, dy: 0, width: 2.5, list: '/l', prompt: '' }] })) &&
  !accepts(graph({ nodes: [{ key: 'a', kind: 'pool', cwd: '/tmp', dx: 0, dy: 0, width: 999, list: '/l', prompt: '' }] })) &&
  accepts(graph({ nodes: [{ key: 'a', kind: 'pool', cwd: '/tmp', dx: 0, dy: 0, width: 1, list: '/l', prompt: '' }] })))

ok('wfs.blank.1 a blank verb line, url, target or prompt is refused — a node that would run nothing and report success',
  !accepts(graph({ nodes: [{ key: 'a', kind: 'action', cwd: '/tmp', dx: 0, dy: 0, line: '   ' }] })) &&
  !accepts(graph({ nodes: [{ key: 'a', kind: 'http', cwd: '/tmp', dx: 0, dy: 0, url: '' }] })) &&
  !accepts(graph({ nodes: [{ key: 'a', kind: 'collect', cwd: '/tmp', dx: 0, dy: 0, target: '' }] })) &&
  !accepts(graph({ nodes: [{ key: 'a', kind: 'orchestrator', cwd: '/tmp', dx: 0, dy: 0, prompt: '' }] })))

ok('wfs.empty.1 a graph with no node is refused — it is a record that instantiates nothing',
  !accepts(graph({ nodes: [] })) && !accepts(graph({ name: '   ' })))

ok('wfs.counter.1 a revision or nextKey that is not a whole number at or above zero is refused, and both stay ABSENT when absent — a written revision 0 would claim a save that never happened',
  !accepts(graph({ revision: -1 })) && !accepts(graph({ nextKey: 1.5 })) && !accepts(graph({ revision: 'x' })) &&
  Object.prototype.hasOwnProperty.call(S.workflowGraphSchema.parse(graph({})), 'revision') === false)

// ---------------------------------------------------------------------------
// The mark. The ONE field that costs the field rather than the record, and it
// fails safe in the direction the inertness rule needs.
// ---------------------------------------------------------------------------
ok('wfs.reviewed.1 an unreadable reviewed mark keeps the workflow and reads as NOT reviewed; absent and true both mean reviewed',
  S.workflowGraphSchema.parse(graph({ reviewed: 'yes' })).reviewed === false &&
  S.workflowGraphSchema.parse(graph({ reviewed: false })).reviewed === false &&
  S.workflowGraphSchema.parse(graph({ reviewed: true })).reviewed === undefined &&
  S.workflowGraphSchema.parse(graph({})).reviewed === undefined)

// ---------------------------------------------------------------------------
// Boundary 1 — the portable file. This is the arm that cast, where its sibling
// parsePack parsed.
// ---------------------------------------------------------------------------
const portable = (templates) => JSON.stringify({
  version: 1, kind: 'canvas', createdAt: 1, app: 'test',
  workspace: { name: 'w', panels: [] }, templates
})
const good = graph({ id: 'keep', name: 'keeps' })
const mixed = P.parsePortable(portable([good, { id: 'junk', name: 'junk', nodes: 'not a list', edges: [] }, 42]))

ok('wfs.portable.1 a canvas file carrying a workflow this app cannot read drops THAT workflow by name and keeps the rest — the file is not thrown away for one bad record',
  mixed.kind === 'file' && mixed.file.templates.length === 1 && mixed.file.templates[0].id === 'keep' &&
  mixed.warnings.filter((w) => w.startsWith('dropped workflow')).length === 2,
  JSON.stringify({ kept: mixed.kind === 'file' ? mixed.file.templates.map((t) => t.id) : null, warnings: mixed.warnings }))

ok('wfs.portable.2 the dropped workflow is named in the warning a person reads, with the reason — not a count',
  mixed.kind === 'file' && mixed.warnings.some((w) => w.includes('"junk"')),
  JSON.stringify(mixed.kind === 'file' ? mixed.warnings : []))

const noTemplates = P.parsePortable(portable(undefined))
const badTemplates = P.parsePortable(portable('nope'))
ok('wfs.portable.3 absent workflows are silent and malformed ones are named — the absent-vs-malformed rule every parser in layout-schema keeps',
  noTemplates.kind === 'file' && noTemplates.file.templates.length === 0 &&
  noTemplates.warnings.every((w) => !w.includes('workflow')) &&
  badTemplates.kind === 'file' && badTemplates.warnings.some((w) => w.includes('workflows were not a list')),
  JSON.stringify({ absent: noTemplates.warnings, malformed: badTemplates.warnings }))

ok('wfs.portable.4 two workflows in one file may not claim one id — the second would shadow the first in every list keyed by it',
  (() => {
    const dup = P.parsePortable(portable([good, { ...good, name: 'second' }]))
    return dup.kind === 'file' && dup.file.templates.length === 1 && dup.warnings.some((w) => w.includes('already claims its id'))
  })())

// ---------------------------------------------------------------------------
// Boundary 2 — template:save. The id is the store's to mint, and is the ONLY
// difference between the two schemas.
// ---------------------------------------------------------------------------
const incoming = (g) => S.incomingWorkflowGraphSchema.safeParse(g).success
const { id: _dropped, ...idless } = graph({})
ok('wfs.incoming.1 a save may arrive without an id, because a first save is the store minting one — and with everything else exactly as strict',
  incoming(idless) && incoming(graph({})) &&
  !incoming({ ...idless, nodes: [node({}), node({})] }) &&
  !incoming({ ...idless, edges: [{ from: 'a', to: 'ghost', trigger: 'idle' }] }) &&
  !accepts(idless))

ok('wfs.incoming.2 a save that is not an object at all is refused rather than thrown — the bridge answers, it does not crash',
  !incoming(null) && !incoming(undefined) && !incoming('a workflow') && !incoming([]))

const failed = results.filter((x) => !x.pass)
console.log(`verify:workflow-schema ${results.length - failed.length}/${results.length}`)
if (failed.length) {
  for (const f of failed) console.log(`  FAIL ${f.n}${f.detail ? ` — ${f.detail}` : ''}`)
  process.exit(1)
}
