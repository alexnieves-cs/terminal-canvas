const { buildSync } = require('esbuild')
const { existsSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync } = require('node:fs')
const { join } = require('node:path')
const { ok, results } = require('./lib/checks.cjs').createChecks()
const root = join(__dirname, '..')
const entry = join(root, 'src/shared/checklist.ts')
let C = {}
if (existsSync(entry)) {
  mkdirSync(join(root, 'out/verify'), { recursive: true })
  buildSync({ entryPoints: [join(__dirname, 'checklist-entry.cjs')], outfile: join(root, 'out/verify/checklist.cjs'), bundle: true, platform: 'node', format: 'cjs', alias: { '@shared': join(root, 'src/shared'), '@renderer': join(root, 'src/renderer') } })
  C = require('../out/verify/checklist.cjs')
}
const doc = '# Work\r\n\r\n- [ ] first\r\n- [X] second\r\n- [?] keep this\r\nprose\r\n```md\r\n- [ ] code\r\n```\r\n'
const parsed = C.parseChecklist?.(doc)
ok('checklist.parse.1 absent, malformed and document inputs stay distinct', C.parseChecklist?.(undefined)?.kind === 'absent' && C.parseChecklist?.(42)?.kind === 'malformed' && parsed?.kind === 'document')
ok('checklist.parse.2 only real task lines outside fences are items; malformed and unknown lines survive', parsed?.items.length === 2 && parsed?.malformed.length === 1 && C.checklistText?.(parsed) === doc)
const toggled = C.editChecklist?.(doc, { type: 'toggle', line: 2 })
ok('checklist.edit.1 toggle changes only the checkbox and preserves CRLF and unknown text', toggled?.kind === 'edited' && toggled.content === doc.replace('- [ ] first', '- [x] first'))
const moved = C.editChecklist?.(doc, { type: 'move', line: 3, to: 2 })
ok('checklist.edit.2 reorder exchanges item positions without consuming prose', moved?.kind === 'edited' && moved.content === doc.replace('- [ ] first\r\n- [X] second', '- [X] second\r\n- [ ] first'))
const added = C.editChecklist?.(doc, { type: 'add', text: 'third' })
const deleted = added?.kind === 'edited' ? C.editChecklist?.(added.content, { type: 'delete', line: C.parseChecklist(added.content).items.at(-1).line }) : undefined
ok('checklist.edit.3 add/delete round trip preserves the original document', deleted?.content === doc)
ok('checklist.edit.4 invalid targets and multiline injected items are refused', C.editChecklist?.(doc, { type: 'delete', line: 5 })?.kind === 'refused' && C.editChecklist?.(doc, { type: 'add', text: 'a\n- [ ] b' })?.kind === 'refused')
ok('checklist.summary.1 an empty checklist has no zero state; checked items are counted', C.checklistSummary?.('') === '' && C.checklistSummary?.(doc) === '1 of 2')
;(async () => {
  const dir = mkdtempSync(join(root, 'out/verify/checklist files ')), path = join(dir, 'tasks.md')
  try {
    writeFileSync(path, doc)
    let saved
    const io = { read: async () => C.readFile(path), write: async (text, mtime) => C.writeFile(path, text, mtime), changed: (view) => { saved = view } }
    const session = C.createChecklistSession({ accepted: doc }, io)
    await session.refresh()
    const operations = [{ type: 'add', text: 'third' }, { type: 'toggle', line: 2 }, { type: 'move', line: 3, to: 2 }, { type: 'delete', line: 2 }]
    const roundTrips = []
    for (const operation of operations) {
      const before = readFileSync(path, 'utf8')
      const edited = await session.edit(operation), after = readFileSync(path, 'utf8')
      const undone = await session.undo(), restored = readFileSync(path, 'utf8')
      const redone = await session.redo()
      roundTrips.push(edited && before !== after && undone && restored === before && redone && readFileSync(path, 'utf8') === after && saved.accepted === after)
    }
    ok('checklist.disk.1 add, check, reorder and delete each undo/redo through real guarded file writes', roundTrips.every(Boolean), JSON.stringify(roundTrips))
    const external = '# Agent draft\n\n- [x] new work\n'
    writeFileSync(path, external)
    await session.refresh()
    const previous = session.snapshot().view.accepted
    const refused = !await session.undo()
    ok('checklist.review.1 external writes remain drafts; undo cannot overwrite them', refused && session.snapshot().view.accepted === previous && readFileSync(path, 'utf8') === external)
    const accepted = await session.accept()
    ok('checklist.review.2 accepting the reviewed draft adopts it and resets incompatible history', accepted && saved.accepted === external && session.snapshot().undo === 0 && session.snapshot().redo === 0)
    writeFileSync(path, external + '- [ ] one\n'); await session.refresh()
    writeFileSync(path, external + '- [ ] two\n')
    ok('checklist.review.3 a draft changed during review cannot be accepted unseen', !await session.accept() && session.snapshot().view.accepted === external)
    const imported = C.createChecklistSession({}, io)
    await imported.refresh()
    ok('checklist.import.1 imported references cannot write until reviewed', !await imported.edit({ type: 'add', text: 'unsafe' }) && readFileSync(path, 'utf8') === external + '- [ ] two\n')
    const run = { panelId: 'ch1', turn: 1, sentAt: 1, text: 'first' }
    const filePanel = { id: 'f1', kind: 'file', x: 0, y: 0, w: 400, h: 400, z: 1, source: { path, prose: true, checklist: { accepted: doc, runs: { 2: run } } } }
    const portable = C.buildPortable({ workspaceName: 'tasks', panels: [filePanel], templates: [], app: '5.0.0', now: 1 })
    const hostile = { ...portable, workspace: { ...portable.workspace, panels: [filePanel] } }
    const remapped = C.remapPortable(hostile, (prefix) => prefix + 'new')
    ok('checklist.import.2 export and hostile import retain the view but strip acceptance and execution links',
      JSON.stringify(portable.workspace.panels[0].source.checklist) === '{}' && JSON.stringify(remapped.workspace.panels[0].source.checklist) === '{}' && !JSON.stringify(portable).includes('Agent draft'))
    const view = filePanel.source.checklist
    ok('checklist.record.1 absent, malformed and unknown fields preserve the parser contract', C.parseChecklistView(undefined).kind === 'absent' && C.parseChecklistView(false).kind === 'malformed' && C.parseChecklistView({ accepted: 5 }).kind === 'malformed' && C.parseChecklistView({ future: 'ignored', ...view }).kind === 'view')
    const panel = C.panels.makeFilePanel('f1', { x: 0, y: 0 }, 1, filePanel.source)
    ok('checklist.record.2 the file-panel constructor retains checklist state without introducing it on ordinary files', JSON.stringify(panel.source.checklist) === JSON.stringify(view) && !('checklist' in C.panels.makeFilePanel('f2', { x: 0, y: 0 }, 1, { path }).source))
    const remappedRuns = C.remapChecklistRuns(doc, moved.content, { 2: run })
    ok('checklist.run.1 reorder carries the correct task run, while edited or ambiguous text drops its association', remappedRuns?.[3]?.panelId === 'ch1' && C.remapChecklistRuns(doc, doc.replace('first', 'changed'), { 2: run }) === undefined)
  } finally { rmSync(dir, { recursive: true, force: true }) }
  const failures = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failures.length}/${results.length} checks passed`)
  process.exitCode = failures.length ? 1 : 0
})().catch((error) => { console.error(error); process.exitCode = 1 })
