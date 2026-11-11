// M246. Per-item draft review: the generic interface (draft-review.ts) that a
// deck's staged proposal rides. The sheet adapter and its on-disk session went
// with Sheets in M684; its checks (draft.sheet.*, draft.door.1–3, draft.disk.*,
// draft.undo.1, draft.restart.1, draft.export.1, draft.record.1) went with it.
const { buildSync } = require('esbuild')
const { existsSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync } = require('node:fs')
const { join } = require('node:path')
const { ok, results } = require('./lib/checks.cjs').createChecks()
const root = join(__dirname, '..')
let S = {}
mkdirSync(join(root, 'out/verify'), { recursive: true })
if (existsSync(join(root, 'src/shared/draft-review.ts'))) {
  buildSync({
    entryPoints: [join(__dirname, 'draft-entry.cjs')], outfile: join(root, 'out/verify/draft.cjs'),
    bundle: true, platform: 'node', format: 'cjs', logLevel: 'error',
    // plan.ts and portable.ts reach '@shared' through their imports.
    alias: { '@shared': join(root, 'src/shared'), '@renderer': join(root, 'src/renderer') }
  })
  S = require('../out/verify/draft.cjs')
}
const safe = (fn) => { try { return fn() } catch (e) { return { threw: String(e) } } }

// ── the generic interface, on items that are NOT cells ───────────────────
// Slides stand in for task 6: if these pass on slide ids, nothing here is sheet-shaped.
const before = new Map([['slide-1', 'Intro'], ['slide-2', 'Plan'], ['slide-3', 'Risks']])
const after = new Map([['slide-1', 'Intro'], ['slide-2', 'The plan'], ['slide-4', 'Ask']])
const diff = safe(() => S.diffItems(before, after, ''))
ok('draft.generic.1 diffItems is structural by id: changed, added and removed items, never unchanged ones',
  Array.isArray(diff) && diff.length === 3 && diff.some((i) => i.id === 'slide-2' && i.old === 'Plan' && i.new === 'The plan') &&
    diff.some((i) => i.id === 'slide-4' && i.old === '' && i.new === 'Ask') && diff.some((i) => i.id === 'slide-3' && i.new === ''), JSON.stringify(diff))
const d1 = safe(() => S.stage(undefined, { id: 'slide-2', old: 'Plan', new: 'v1' }, 'h1', 'ch1', 1))
const d2 = safe(() => S.stage(d1, { id: 'slide-2', old: 'IGNORED', new: 'v2' }, 'h1', 'ch1', 2))
const d3 = safe(() => S.stage(d2, { id: 'slide-2', old: 'IGNORED', new: 'Plan' }, 'h1', 'ch1', 3))
ok('draft.generic.2 re-staging replaces NEW and keeps the original OLD; returning to old removes the item and an empty draft is no draft',
  d2?.items?.length === 1 && d2.items[0].old === 'Plan' && d2.items[0].new === 'v2' && d2.by === 'ch1' && d3 === undefined, JSON.stringify({ d2, d3 }))
const three = { baseHash: 'h', at: 1, items: [{ id: 'a', old: '1', new: '2' }, { id: 'b', old: '1', new: '3' }, { id: 'c', old: '1', new: '4' }] }
const k = safe(() => S.keep(three, ['a', 'c']))
const dd = safe(() => S.discard(three, 'all'))
ok('draft.generic.3 keep returns only the chosen items to apply and leaves the rest pending; discard all leaves no draft',
  k?.apply?.map((i) => i.id).join() === 'a,c' && k?.remaining?.items?.map((i) => i.id).join() === 'b' && dd?.remaining === undefined && dd?.dropped?.length === 3)
ok('draft.generic.4 four states, never collapsed: none, pending, conflict, applied',
  safe(() => S.draftState(undefined, 'h', undefined)) === 'none' && safe(() => S.draftState(three, 'h', undefined)) === 'pending' &&
    safe(() => S.draftState(three, 'other', undefined)) === 'conflict' && safe(() => S.draftState(undefined, 'h', { at: 1, kept: 2, discarded: 1 })) === 'applied')
const rb = safe(() => S.rebase(three, 'h2', (id) => id === 'b' ? 'changed' : '1'))
ok('draft.generic.5 rebase keeps items whose current value is still their old, and names the dropped ones',
  rb?.draft?.baseHash === 'h2' && rb?.draft?.items?.map((i) => i.id).join() === 'a,c' && rb?.dropped?.map((i) => i.id).join() === 'b')
ok('draft.generic.6 the content hash is stable and sensitive to one byte', safe(() => S.contentHash('a,b\n')) === safe(() => S.contentHash('a,b\n')) && safe(() => S.contentHash('a,b\n')) !== safe(() => S.contentHash('a,c\n')))

// The M246 critic's finding 1: a workflow an AGENT runs must carry that agent into its
// action nodes, or a person-only verb in a template runs with no person.
// A source scan, because the run path is React: the node loop and the verb both pass it on.
{
  const canvas = require('node:fs').readFileSync(join(root, 'src/renderer/canvas/Canvas.tsx'), 'utf8')
  // The palette actions are a directory since the domain split — the executor's
  // `workflow-run` arm is in `palette-actions/executor.ts`. Read the module set.
  const paDir = join(root, 'src/renderer/canvas/palette-actions')
  const actions = require('node:fs').readdirSync(paDir).filter((f) => f.endsWith('.ts'))
    .map((f) => require('node:fs').readFileSync(join(paDir, f), 'utf8')).join('\n')
  ok('draft.door.4 an agent-started workflow run carries the caller into every action node (no hard-coded undefined caller)',
    /runNodeRef\.current\?\.\(node, caller,/.test(canvas) && !/runNodeRef\.current\?\.\(node, undefined,/.test(canvas) &&
      /case 'workflow-run': return self\.runWorkflowNow\(a\.template!, caller\)/.test(actions) &&
      // M500. runWorkflow left Canvas.tsx with the workflow verbs; Canvas still calls them.
      /= useWorkflowVerbs\(\{/.test(canvas) &&
      /instantiateTemplateRef\.current\(template, \{\}, caller\)/.test(require('node:fs').readFileSync(join(root, 'src/renderer/canvas/useWorkflowVerbs.ts'), 'utf8')))
}

const failures = results.filter((r) => !r.pass)
console.log(`\n${results.length - failures.length}/${results.length} checks passed`)
process.exitCode = failures.length ? 1 : 0
