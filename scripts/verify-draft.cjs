// M246. Per-item draft review: the generic interface (draft-review.ts), the
// sheet adapter (sheet-draft.ts) and the session's draft life against real
// files through main's real read/write. See the M246 spec for the rules.
const { buildSync } = require('esbuild')
const { existsSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync } = require('node:fs')
const { join } = require('node:path')
const { ok, results } = require('./lib/checks.cjs').createChecks()
const root = join(__dirname, '..')
let S = {}
mkdirSync(join(root, 'out/verify'), { recursive: true })
if (existsSync(join(root, 'src/shared/sheet-draft.ts'))) {
  buildSync({
    entryPoints: [join(__dirname, 'draft-entry.cjs')], outfile: join(root, 'out/verify/draft.cjs'),
    bundle: true, platform: 'node', format: 'cjs', logLevel: 'error',
    // Needed for the same reason as verify:sheet's (measured there): main/file-read.ts
    // and main/file-write.ts import '@shared/file-panel'.
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

// ── the sheet adapter ────────────────────────────────────────────────────
const g = [['a', 'b'], ['1', '2']]
ok('draft.sheet.1 applying draft items sets exactly those cells, by A1 id', (() => {
  const next = S.applyDraftItems?.(g, [{ id: 'B2', old: '2', new: '20' }, { id: 'C1', old: '', new: 'new' }])
  return next?.[1]?.[1] === '20' && next?.[0]?.[2] === 'new' && next?.[0]?.[0] === 'a' && g[1][1] === '2'
})())
ok('draft.sheet.2 the header count is contextual: nothing for no changes, then "1 change", "3 changes"',
  safe(() => S.sheetDraftSummary(undefined)) === '' && safe(() => S.sheetDraftSummary({ ...three, items: three.items.slice(0, 1) })) === '1 change' && safe(() => S.sheetDraftSummary(three)) === '3 changes')
ok('draft.door.1 an agent-door sheet-edit stages; a person\'s (no caller) writes',
  safe(() => S.sheetEditRoute({ panelId: 'ch1' })) === 'draft' && safe(() => S.sheetEditRoute(undefined)) === 'write' && safe(() => S.sheetEditRoute({})) === 'write')
ok('draft.door.2 keep through the agent door is refused by name; discard through it is allowed; a person may do both',
  /person/.test(String(safe(() => S.sheetReviewRefusal('keep', { panelId: 'ch1' })))) && safe(() => S.sheetReviewRefusal('discard', { panelId: 'ch1' })) === null && safe(() => S.sheetReviewRefusal('keep', undefined)) === null)
ok('draft.door.3 a teammate may PROPOSE (sheet-edit is not refused) but not keep',
  safe(() => S.plan.agentDoorRefusal({ verb: 'sheet-edit', args: { panel: 'f1' } }, { panels: [] }, { teammateId: 't1', panelId: 'ch1' })) === null)

// The M246 critic's finding 1: a workflow an AGENT runs must carry that agent into its
// action nodes, or `sheet-review f1 keep all` in a template is a keep with no person.
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
      /case 'workflow-run': return self\.runWorkflowNow\(a\.template!, caller\)/.test(actions) && /instantiateTemplateRef\.current\(template, \{\}, caller\)/.test(canvas))
}

// ── the view record ──────────────────────────────────────────────────────
const goodDraft = { baseHash: 'x:1', by: 'ch1', at: 5, items: [{ id: 'B2', old: '2', new: '20' }] }
// A malformed draft costs the DRAFT (named in `dropped`), never the view — the per-entry rule.
ok('draft.record.1 a draft and an outcome round-trip through the view parser; a malformed draft is dropped by name and the view survives; ids must be cells',
  safe(() => S.parseSheetView({ draft: goodDraft, draftOutcome: { at: 1, kept: 1, discarded: 0 } }).view.draft.items[0].new) === '20' &&
    (() => { const p = safe(() => S.parseSheetView({ widths: [90], draft: { ...goodDraft, items: [{ id: 'not a cell', old: '', new: '' }] } })); return p?.kind === 'view' && !('draft' in p.view) && p.view.widths?.[0] === 90 && p.dropped?.includes('draft') })() &&
    safe(() => S.parseSheetView({ draft: { ...goodDraft, items: 'x' } }).dropped?.[0]) === 'draft' &&
    !('draft' in (safe(() => S.parseSheetView({ widths: [90] }).view) ?? { draft: 1 })))

;(async () => {
  const dir = mkdtempSync(join(root, 'out/verify/draft files ')), path = join(dir, 'data.csv')
  try {
    const original = 'a,b,c\r\n1,2,3\r\n4,5,6\r\n'
    writeFileSync(path, original)
    let view = {}
    const io = { name: 'data.csv', read: async () => S.readFile(path, 'base64'), write: async (b64, mtime) => S.writeFile(path, b64, mtime, 'base64'), changed: (v) => { view = v } }
    const session = S.createSheetSession?.({}, io, 'csv')
    await session?.refresh()
    const proposed = await session?.propose?.([{ r: 1, c: 1, value: '20' }, { r: 2, c: 2, value: '60' }, { r: 0, c: 0, value: 'A' }], 'ch1')
    ok('draft.disk.1 an agent\'s proposal writes NOTHING: the file is byte-identical and the draft is in the view',
      proposed === true && Buffer.from(readFileSync(path)).equals(Buffer.from(original)) && view?.draft?.items?.length === 3 && view.draft.by === 'ch1', JSON.stringify(view))
    const keptPartial = await session?.keepDraft?.(['B2', 'C3'])
    const afterKeep = readFileSync(path, 'utf8')
    ok('draft.disk.2 a partial keep writes ONLY the kept cells (compared cell by cell) and leaves the rest pending',
      keptPartial === true && afterKeep === 'a,b,c\r\n1,20,3\r\n4,5,60\r\n' && view?.draft?.items?.map((i) => i.id).join() === 'A1', JSON.stringify({ afterKeep, view }))
    const beforeDiscard = readFileSync(path)
    const discarded = await session?.discardDraft?.('all')
    ok('draft.disk.3 discard leaves the file BYTE-identical (Buffer against Buffer) and records the outcome as applied',
      discarded === true && Buffer.from(readFileSync(path)).equals(beforeDiscard) && view?.draft === undefined &&
        view?.draftOutcome?.kept === 2 && view?.draftOutcome?.discarded === 1 && safe(() => S.draftState(view.draft, 'any', view.draftOutcome)) === 'applied', JSON.stringify(view))

    // A change underneath a pending draft.
    await session?.propose?.([{ r: 1, c: 0, value: '100' }, { r: 2, c: 0, value: '400' }], 'ch1')
    writeFileSync(path, 'a,b,c\r\n1,20,3\r\nCHANGED,5,60\r\n')
    await session?.reload?.()
    const underneath = readFileSync(path, 'utf8')
    const refusedKeep = await session?.keepDraft?.('all')
    const err = session?.snapshot().error ?? ''
    ok('draft.disk.4 a conflict when the file changed underneath is reported BY NAME — the file and the cells — and keep writes nothing',
      refusedKeep === false && readFileSync(path, 'utf8') === underneath && /data\.csv changed on disk/.test(err) && /A3/.test(err) && !/A2/.test(err.replace(/draft/g, '')), err)
    const rebased = await session?.rebaseDraft?.()
    ok('draft.disk.5 rebase keeps the items whose cell still reads their old value and names the dropped ones',
      rebased === true && view?.draft?.items?.map((i) => i.id).join() === 'A2' && /A3/.test(session?.snapshot().error ?? session?.snapshot().note ?? ''), JSON.stringify({ view, s: session?.snapshot().note }))
    const keptAfterRebase = await session?.keepDraft?.('all')
    ok('draft.disk.6 after a rebase the surviving item keeps normally', keptAfterRebase === true && readFileSync(path, 'utf8') === 'a,b,c\r\n100,20,3\r\nCHANGED,5,60\r\n')

    // The M246 critic's finding 2: undo/redo move the file under a pending draft.
    const upath = join(dir, 'undo.csv')
    writeFileSync(upath, 'a,b\n1,2\n')
    let uview = {}
    const uio = { name: 'undo.csv', read: async () => S.readFile(upath, 'base64'), write: async (b64, m) => S.writeFile(upath, b64, m, 'base64'), changed: (v) => { uview = v } }
    const us = S.createSheetSession?.({}, uio, 'csv')
    await us?.refresh()
    await us?.propose([{ r: 0, c: 0, value: 'A' }], 'ch1')
    await us?.setCells([{ r: 1, c: 1, value: '20' }])   // a person's unrelated edit — the draft follows it
    await us?.undo()                                   // back to the bytes the draft was proposed on
    const hashNow = S.contentHash(Buffer.from(readFileSync(upath)).toString('base64'))
    const noFalseConflict = S.draftState(uview.draft, hashNow, uview.draftOutcome) === 'pending' && uview.draft?.items?.[0]?.id === 'A1'
    await us?.setCells([{ r: 0, c: 0, value: 'mine' }]) // the person overwrites the drafted cell — dropped
    const droppedByEdit = uview.draft === undefined
    await us?.undo()                                   // undoing that edit brings the proposal back
    ok('draft.undo.1 undo neither turns a pending draft into a false conflict nor loses an item the undone write had dropped',
      noFalseConflict && droppedByEdit && uview.draft?.items?.[0]?.id === 'A1' && uview.draft.items[0].new === 'A' &&
        S.draftState(uview.draft, S.contentHash(Buffer.from(readFileSync(upath)).toString('base64')), undefined) === 'pending', JSON.stringify(uview))

    // A draft survives a restart: a NEW session seeded from the persisted view reads it back.
    await session?.propose?.([{ r: 0, c: 1, value: 'B!' }], 'ch2')
    const persisted = JSON.parse(JSON.stringify(view))
    const again = S.createSheetSession?.(persisted, io, 'csv')
    await again?.refresh()
    ok('draft.restart.1 a pending draft persisted in the view is pending again after a restart, file untouched',
      again?.snapshot().view?.draft?.items?.[0]?.id === 'B1' && safe(() => S.draftState(again.snapshot().view.draft, S.contentHash(again.snapshot().disk.base64), undefined)) === 'pending')

    // The export gate.
    const filePanel = { id: 'f1', kind: 'file', x: 0, y: 0, w: 400, h: 300, z: 1, source: { path, sheet: persisted } }
    const portable = safe(() => S.buildPortable({ workspaceName: 's', panels: [filePanel], templates: [], app: '5.0.0', now: 1 }))
    ok('draft.export.1 a draft never leaves: the export carries sheet: {} and no proposed value', JSON.stringify(portable?.workspace?.panels?.[0]?.source?.sheet) === '{}' && !JSON.stringify(portable).includes('B!'))
  } finally { rmSync(dir, { recursive: true, force: true }) }
  const failures = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failures.length}/${results.length} checks passed`)
  process.exitCode = failures.length ? 1 : 0
})().catch((error) => { console.error(error); process.exitCode = 1 })
