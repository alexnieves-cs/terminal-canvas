// M247. Agent → object links: the event → link mapping, the per-agent store
// and its forget sites, and the level-of-detail plan. Plain node. See the
// M247 spec for the rules.
const { buildSync } = require('esbuild')
const { existsSync, mkdirSync, readFileSync, readdirSync } = require('node:fs')
const { join } = require('node:path')
const { ok, results } = require('./lib/checks.cjs').createChecks()
const root = join(__dirname, '..')
let L = {}
mkdirSync(join(root, 'out/verify'), { recursive: true })
if (existsSync(join(root, 'src/shared/agent-links.ts')) && existsSync(join(root, 'src/renderer/canvas/agent-links-store.ts'))) {
  buildSync({
    entryPoints: [join(__dirname, 'agent-links-entry.cjs')], outfile: join(root, 'out/verify/agent-links.cjs'),
    bundle: true, platform: 'node', format: 'cjs', logLevel: 'error',
    alias: { '@shared': join(root, 'src/shared'), '@renderer': join(root, 'src/renderer') }
  })
  L = require('../out/verify/agent-links.cjs')
}
const safe = (fn) => { try { return fn() } catch (e) { return { threw: String(e) } } }
const touch = (path, toolName, at = 1) => ({ path, toolName, turnId: 't' + at, toolUseId: 'u' + at, at })

// ── the mapping ─────────────────────────────────────────────────────────
const objects = [
  { id: 'f1', path: '/repo/data.csv' },
  { id: 'f2', path: '/repo/notes/plan.md' },
  { id: 'f3', path: '/repo/sheet.csv', draftBy: 'ch1' },
  { id: 'f4', path: '/private/var/folders/x/repo/out.txt' }
]
const links = safe(() => L.agentLinks({ agent: 'ch1', cwd: '/repo', objects, touches: [
  touch('/repo/data.csv', 'Read', 1),
  touch('data.csv', 'Edit', 2),            // relative to the cwd, and a stronger fact
  touch('./notes/../notes/plan.md', 'Grep', 3),
  touch('/repo/sheet.csv', 'Read', 4),     // a draft beats a read
  touch('/var/folders/x/repo/out.txt', 'Write', 5), // the /private symlink, spelled the logical way
  touch('/repo/not-on-canvas.txt', 'Write', 6),
  touch('/repo/notes/plan.md', 'SomeFutureTool', 7)
] }))
const kindOf = (object) => Array.isArray(links) ? links.find((l) => l.object === object)?.kind : undefined
ok('agent-links.map.1 Write/Edit is wrote, Read/Grep/unknown is read, and a wrote outranks a read of the same file',
  kindOf('f1') === 'wrote' && kindOf('f2') === 'read', JSON.stringify(links))
ok('agent-links.map.2 a sheet whose pending draft names this agent is a draft link, outranking the read',
  kindOf('f3') === 'draft')
ok('agent-links.map.3 relative paths resolve against the cwd, and /var ↔ /private/var match', kindOf('f1') === 'wrote' && kindOf('f2') === 'read' && kindOf('f4') === 'wrote')
ok('agent-links.map.4 a path with no object on the canvas draws nothing, and there is ONE link per (agent, object)',
  Array.isArray(links) && links.length === 4 && new Set(links.map((l) => l.object)).size === 4 && links.every((l) => l.agent === 'ch1'))
ok('agent-links.map.5 a draft by ANOTHER agent is not this agent\'s draft', (() => {
  const other = L.agentLinks?.({ agent: 'ch2', cwd: '/repo', objects, touches: [touch('/repo/sheet.csv', 'Read')] })
  return Array.isArray(other) && other.length === 1 && other[0].kind === 'read'
})())
ok('agent-links.map.6 an agent that drafted a sheet without a transcript touch still links to it (the draft IS the touch)', (() => {
  const d = L.agentLinks?.({ agent: 'ch1', cwd: '/repo', objects, touches: [] })
  return Array.isArray(d) && d.length === 1 && d[0].object === 'f3' && d[0].kind === 'draft'
})())
ok('agent-links.map.7 the output is deterministic (same input, same order)', JSON.stringify(safe(() => L.agentLinks({ agent: 'ch1', cwd: '/repo', objects, touches: [touch('/repo/notes/plan.md', 'Read'), touch('/repo/data.csv', 'Read')] }))) ===
  JSON.stringify(safe(() => L.agentLinks({ agent: 'ch1', cwd: '/repo', objects, touches: [touch('/repo/data.csv', 'Read'), touch('/repo/notes/plan.md', 'Read')] }))))

// The M247 critic's finding 1: a chat's cwd can be the unexpanded `~`.
ok('agent-links.map.8 with an unexpanded ~ cwd, a relative or ~/ touch links by a UNIQUE suffix, and never guesses between two', (() => {
  const objs = [{ id: 'h1', path: '/Users/u/notes/plan.md' }, { id: 'h2', path: '/Users/u/a/dup.md' }, { id: 'h3', path: '/Users/u/b/dup.md' }]
  const l = L.agentLinks?.({ agent: 'c', cwd: '~', objects: objs, touches: [touch('notes/plan.md', 'Edit', 1), touch('~/notes/plan.md', 'Read', 2), touch('dup.md', 'Edit', 3)] })
  return Array.isArray(l) && l.length === 1 && l[0].object === 'h1' && l[0].kind === 'wrote'
})(), JSON.stringify(safe(() => L.agentLinks({ agent: 'c', cwd: '~', objects: [{ id: 'h1', path: '/Users/u/notes/plan.md' }], touches: [touch('notes/plan.md', 'Edit', 1)] }))))

// ── the store ───────────────────────────────────────────────────────────
const S = L.store ?? {}
let notifiedA = 0
let notifiedB = 0
const offA = safe(() => S.subscribeAgentLinks('chA', () => { notifiedA += 1 }))
const offB = safe(() => S.subscribeAgentLinks('chB', () => { notifiedB += 1 }))
const la = [{ agent: 'chA', object: 'f1', kind: 'read' }]
safe(() => S.publishAgentLinks('chA', la))
const snap1 = safe(() => S.agentLinksFor('chA'))
safe(() => S.publishAgentLinks('chA', [{ agent: 'chA', object: 'f1', kind: 'read' }]))
const snap2 = safe(() => S.agentLinksFor('chA'))
ok('agent-links.store.1 a subscriber is notified only for ITS agent, and an unchanged publish keeps the cached snapshot (no notify)',
  notifiedA === 1 && notifiedB === 0 && snap1 === snap2 && Array.isArray(snap1) && snap1.length === 1, JSON.stringify({ notifiedA, notifiedB }))
safe(() => S.publishAgentLinks('chB', [{ agent: 'chB', object: 'f1', kind: 'wrote' }, { agent: 'chB', object: 'f2', kind: 'read' }]))
safe(() => S.forgetAgentLinksFor('f1'))
ok('agent-links.store.2 closing an OBJECT drops every link to it, from every agent', safe(() => S.agentLinksFor('chA').length) === 0 && safe(() => S.agentLinksFor('chB').map((l) => l.object).join()) === 'f2')
safe(() => S.forgetAgentLinksFor('chB'))
ok('agent-links.store.3 closing an AGENT drops its links and its entry', safe(() => S.agentLinksFor('chB').length) === 0 && !safe(() => S.allAgentLinks()).some?.((l) => l.agent === 'chB'))
safe(() => S.publishAgentLinks('chA', la))
safe(() => S.forgetAllAgentLinks())
ok('agent-links.store.4 a reset forgets everything', Array.isArray(safe(() => S.allAgentLinks())) && safe(() => S.allAgentLinks()).length === 0)
if (typeof offA === 'function') offA()
if (typeof offB === 'function') offB()

// ── every panel-removing site forgets, the CLAUDE.md rule ────────────────
const callCount = (text, name) => (text.match(new RegExp(`\\b${name}\\(`, 'g')) ?? []).length - (text.match(new RegExp(`function ${name}\\(`, 'g')) ?? []).length
// DISCOVERED, not listed. The two files this named by hand became a file and a
// directory when the palette actions were split by domain, and a hand-kept list
// answers a move by going green on a file that no longer clears anything —
// which is the one failure this check exists to prevent. So: walk the canvas
// layer, take every file that clears agent state, and require each to forget
// links at least as often. A clearing site added anywhere is covered the day it
// is written, and one that MOVES is covered without anyone editing this line.
const walkTs = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walkTs(join(d, e.name)) : /\.tsx?$/.test(e.name) ? [join(d, e.name)] : [])
const sites = walkTs(join(root, 'src/renderer/canvas'))
  .map((p) => {
    const text = readFileSync(p, 'utf8')
    return { f: p.slice(root.length + 1), clears: callCount(text, 'clearAgentState'), forgets: callCount(text, 'forgetAgentLinksFor') }
  })
  .filter((s) => s.clears > 0)
ok('agent-links.forget.1 every file that clears agent state at a panel-removing site forgets agent links as often',
  sites.length > 0 && sites.every((s) => s.forgets >= s.clears), JSON.stringify(sites))
ok('agent-links.forget.2 the store never rides registry.version()', !/version\(\)/.test(existsSync(join(root, 'src/renderer/canvas/agent-links-store.ts')) ? readFileSync(join(root, 'src/renderer/canvas/agent-links-store.ts'), 'utf8').replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '') : 'version()'))

// ── level of detail ──────────────────────────────────────────────────────
const many = [
  { agent: 'a', object: 'f1', kind: 'read' }, { agent: 'a', object: 'f2', kind: 'read' },
  { agent: 'a', object: 'f3', kind: 'wrote' }, { agent: 'a', object: 'f4', kind: 'draft' }
]
const centres = { a: { x: 0, y: 0 }, f1: { x: 100, y: 0 }, f2: { x: 900, y: 0 }, f3: { x: 50, y: 50 }, f4: { x: 10, y: 10 } }
const at = (id) => centres[id]
const tail = safe(() => L.agentLinkPlan(many, 'tail', at))
const summary = safe(() => L.agentLinkPlan(many, 'summary', at))
const block = safe(() => L.agentLinkPlan(many, 'block', at))
ok('agent-links.lod.1 tail (the NEAREST tier) shows every link, each with its word',
  Array.isArray(tail) && tail.length === 4 && tail.every((l) => typeof l.label === 'string' && l.label.length > 0) && tail.find((l) => l.object === 'f4')?.label.includes('review'))
ok('agent-links.lod.2 summary bundles to one link per (agent, kind), toward the nearest object, with no words',
  Array.isArray(summary) && summary.length === 3 && summary.some((l) => l.kind === 'read' && l.object === 'f1' && l.count === 2) && summary.every((l) => l.label === undefined), JSON.stringify(summary))
ok('agent-links.lod.3 block (the FARTHEST tier) hides them', Array.isArray(block) && block.length === 0)
ok('agent-links.lod.4 a link whose endpoint is off the canvas (no centre) is dropped at every tier', safe(() => L.agentLinkPlan([{ agent: 'a', object: 'gone', kind: 'read' }], 'tail', at).length) === 0)

const failures = results.filter((r) => !r.pass)
console.log(`\n${results.length - failures.length}/${results.length} checks passed`)
process.exitCode = failures.length ? 1 : 0
