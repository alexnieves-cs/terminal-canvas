// M245. The sheet object: CSV parsing, formulas, the grid model, virtualization
// arithmetic, the file round-trip through main's real read/write, and xlsx.
// Plain node; esbuild bundles the TypeScript. See the M245 spec for the rules.
const { buildSync } = require('esbuild')
const { existsSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync } = require('node:fs')
const { join } = require('node:path')
const { ok, results } = require('./lib/checks.cjs').createChecks()
const root = join(__dirname, '..')
let S = {}
// Unconditional: the disk checks need the directory even while the module is absent, so the
// suite goes RED against a missing module rather than crashing before it can report.
mkdirSync(join(root, 'out/verify'), { recursive: true })
if (existsSync(join(root, 'src/shared/sheet.ts'))) {
  buildSync({
    entryPoints: [join(__dirname, 'sheet-entry.cjs')], outfile: join(root, 'out/verify/sheet.cjs'),
    bundle: true, platform: 'node', format: 'cjs', logLevel: 'error',
    // NEEDED — settled by deleting it and building (CLAUDE.md), 2026-09-10:
    // without it esbuild cannot resolve "@shared/file-panel" (from
    // main/file-read.ts and main/file-write.ts) or "@shared/chat-panel" (from
    // renderer/panels/panels.ts). xlsx itself needs no alias.
    alias: { '@shared': join(root, 'src/shared'), '@renderer': join(root, 'src/renderer') }
  })
  S = require('../out/verify/sheet.cjs')
}
const safe = (fn) => { try { return fn() } catch (e) { return { threw: String(e) } } }

// ── CSV ──────────────────────────────────────────────────────────────────
const csv = '﻿name,note\r\n"Smith, J","said ""hi"""\r\nmulti,"line one\r\nline two"\r\nragged\r\n'
const p = safe(() => S.parseCsv(csv))
ok('sheet.csv.1 quotes, doubled quotes and a comma inside quotes parse to one cell each',
  p?.rows?.[1]?.[0] === 'Smith, J' && p?.rows?.[1]?.[1] === 'said "hi"')
ok('sheet.csv.2 a newline inside quotes stays inside its cell', p?.rows?.[2]?.[1] === 'line one\r\nline two')
ok('sheet.csv.3 the BOM is stripped from the first cell and remembered', p?.bom === true && p?.rows?.[0]?.[0] === 'name')
ok('sheet.csv.4 ragged rows keep their own length', p?.rows?.[3]?.length === 1 && p?.rows?.length === 4)
ok('sheet.csv.5 serialize(parse(x)) is byte-identical: BOM, CRLF, quoting and the final newline',
  safe(() => S.serializeCsv(p)) === csv)
const lf = 'a,b\nc,d'
ok('sheet.csv.6 LF with no final newline round-trips as LF with no final newline', safe(() => S.serializeCsv(S.parseCsv(lf))) === lf)
ok('sheet.csv.7 an empty file is zero rows and serializes back to empty', safe(() => S.parseCsv('').rows.length) === 0 && safe(() => S.serializeCsv(S.parseCsv(''))) === '')
ok('sheet.csv.8 an unterminated quote is read to the end rather than dropped', safe(() => S.parseCsv('"open,x\ny').rows[0][0]) === 'open,x\ny')

// ── formulas ─────────────────────────────────────────────────────────────
const grid = [['1', '2', '=A1+B1'], ['3', '4', '=SUM(A1:B2)'], ['=AVERAGE(A1:B2)', '=C1*2^2', '=(A1+B1)*-C1'], ['=A5', '=1/0', '=HYPERLINK("x")'], ['=A4', '\'=text', '="a"&"b"']]
const v = (ref) => safe(() => S.evaluateSheet(grid).get(ref))
ok('sheet.formula.1 arithmetic precedence, power and unary minus', v('C1') === 3 && v('B3') === 12 && v('C3') === -9)
ok('sheet.formula.2 refs and ranges feed SUM and AVERAGE', v('C2') === 10 && v('A3') === 2.5)
ok('sheet.formula.3 a cycle is #CYCLE! on every member, not a stack overflow', v('A4') === '#CYCLE!' && v('A5') === '#CYCLE!')
ok('sheet.formula.4 division by zero is #DIV/0!', v('B4') === '#DIV/0!')
ok('sheet.formula.5 an unknown function is #NAME? and never executes', v('C4') === '#NAME?')
ok('sheet.formula.6 an apostrophe-escaped literal is text, displayed without the apostrophe', v('B5') === '=text')
ok('sheet.formula.7 string concatenation', v('C5') === 'ab')
ok('sheet.formula.8 a ref outside the grid reads as empty (0), a malformed one is #REF!/#VALUE!',
  safe(() => S.evaluateSheet([['=Z99+1']]).get('A1')) === 1 && typeof safe(() => S.evaluateSheet([['=1+']]).get('A1')) === 'string')
ok('sheet.formula.9 text stays text and numbers read as numbers', safe(() => S.evaluateSheet([['hello', '007']]).get('A1')) === 'hello' && safe(() => S.evaluateSheet([['hello', '007']]).get('B1')) === 7)

// ── model edits ──────────────────────────────────────────────────────────
const m = [['1', '=A2'], ['2', '=SUM(A1:A3)'], ['3', '=A3']]
const del = safe(() => S.deleteRows(m, 1, 1))
ok('sheet.model.1 deleting a row shifts refs below it and turns refs into it into #REF!',
  del?.[0]?.[1] === '=#REF!' && del?.[1]?.[1] === '=A2' && del?.length === 2, JSON.stringify(del))
ok('sheet.model.2 a range spanning the deleted row shrinks rather than breaking', safe(() => S.deleteRows(m, 1, 1))?.[0] && safe(() => S.shiftFormula('=SUM(A1:A3)', 'row', 1, -1)) === '=SUM(A1:A2)')
const ins = safe(() => S.insertCols(m, 0, 1))
ok('sheet.model.3 inserting a column shifts refs right and absolute refs too', ins?.[0]?.[0] === '' && ins?.[0]?.[2] === '=B2' && safe(() => S.shiftFormula('=$A$1', 'col', 0, 1)) === '=$B$1')
ok('sheet.model.4 a range copies as TSV and quotes cells containing tabs or newlines',
  safe(() => S.rangeToTsv([['a', 'b\tc'], ['d', 'e\nf']], { r0: 0, c0: 0, r1: 1, c1: 1 })) === 'a\t"b\tc"\nd\t"e\nf"')
const pasted = safe(() => S.pasteTsv([['x']], { r: 1, c: 1 }, 'p\tq\nr\ts'))
ok('sheet.model.5 pasting TSV at an anchor grows the grid and fills the block', pasted?.[1]?.[1] === 'p' && pasted?.[2]?.[2] === 's' && pasted?.[0]?.[0] === 'x')
ok('sheet.model.6 setCell never mutates its input', (() => { const g = [['a']]; const n = S.setCell?.(g, 0, 0, 'b'); return g[0][0] === 'a' && n?.[0]?.[0] === 'b' })())
ok('sheet.model.7 A1 addressing round-trips past Z', safe(() => S.colName(26)) === 'AA' && safe(() => S.parseRef('AB12').c) === 27 && safe(() => S.parseRef('AB12').r) === 11)

// ── virtualization ───────────────────────────────────────────────────────
const win = safe(() => S.visibleWindow({ rows: 100000, cols: 40, rowHeight: 24, widths: [], defaultWidth: 100, scrollTop: 24 * 50000, scrollLeft: 0, height: 600, width: 800, overscan: 4 }))
ok('sheet.grid.1 100k rows render a bounded window around the scroll position',
  win?.r1 - win?.r0 < 100 && win?.r0 <= 50000 && win?.r1 >= 50024 && win?.c1 - win?.c0 < 20, JSON.stringify(win))
const w2 = safe(() => S.visibleWindow({ rows: 10, cols: 5, rowHeight: 24, widths: [300, 300], defaultWidth: 100, scrollTop: 0, scrollLeft: 450, height: 600, width: 200, overscan: 0 }))
ok('sheet.grid.2 resized columns move the column window via prefix sums', w2?.c0 === 1 && w2?.c1 >= 2, JSON.stringify(w2))
ok('sheet.grid.3 an empty sheet is an empty window, never NaN', (() => { const w = S.visibleWindow?.({ rows: 0, cols: 0, rowHeight: 24, widths: [], defaultWidth: 100, scrollTop: 0, scrollLeft: 0, height: 600, width: 800, overscan: 4 }); return w && w.r1 < w.r0 && Number.isFinite(w.r0) })())

// ── view record ──────────────────────────────────────────────────────────
ok('sheet.record.1 absent, malformed and unknown fields keep the parser contract',
  safe(() => S.parseSheetView(undefined).kind) === 'absent' && safe(() => S.parseSheetView([]).kind) === 'malformed' &&
  safe(() => S.parseSheetView({ widths: ['x'] }).kind) === 'malformed' && safe(() => S.parseSheetView({ future: 1, widths: [80] }).kind) === 'view')
const layoutWarnings = []
const parsedSource = safe(() => S.layout.parseLayout?.({ version: 1, panels: [{ id: 'f1', kind: 'file', x: 0, y: 0, w: 400, h: 300, z: 1, source: { path: '/a.csv', sheet: 'bad' } }] }))
ok('sheet.record.2 the file panel constructor keeps a sheet view and never invents one', (() => {
  const a = S.panels?.makeFilePanel('f1', { x: 0, y: 0 }, 1, { path: '/a.csv', sheet: { widths: [90] } })
  const b = S.panels?.makeFilePanel('f2', { x: 0, y: 0 }, 1, { path: '/a.csv' })
  return a?.source?.sheet?.widths?.[0] === 90 && b && !('sheet' in b.source)
})())
void parsedSource; void layoutWarnings

;(async () => {
  // ── disk round-trip, through main's real read and write ──────────────
  const dir = mkdtempSync(join(root, 'out/verify/sheet files ')), path = join(dir, 'data.csv')
  try {
    const original = '﻿a,b\r\n1,"x, y"\r\n2,=A2*2\r\n'
    writeFileSync(path, original)
    const read = S.readFile?.(path, 'base64')
    ok('sheet.disk.1 a base64 read returns the bytes arm with no line cap', read?.kind === 'bytes' && Buffer.from(read.base64, 'base64').toString('utf8') === original)
    ok('sheet.disk.2 an absent encoding is the old text read, unchanged', S.readFile?.(path)?.kind === 'text')
    let changed
    const io = { name: 'data.csv', read: async () => S.readFile(path, 'base64'), write: async (b64, mtime) => S.writeFile(path, b64, mtime, 'base64'), changed: (view) => { changed = view } }
    const session = S.createSheetSession?.({}, io, 'csv')
    await session?.refresh()
    const edited = await session?.setCells([{ r: 1, c: 0, value: '5' }])
    const after = readFileSync(path, 'utf8')
    ok('sheet.disk.2b editing one cell changes only that cell’s bytes', edited === true && after === original.replace('1,"x, y"', '5,"x, y"'), JSON.stringify(after))
    const undone = await session?.undo()
    ok('sheet.disk.3 undo writes the previous cells back through the same guarded write', undone === true && readFileSync(path, 'utf8') === original)
    await session?.redo()
    writeFileSync(path, 'external\n')
    await session?.refresh()
    const refused = !(await session?.setCells([{ r: 0, c: 0, value: 'z' }]))
    ok('sheet.disk.4 an external change is reported by name and blocks editing; the disk is untouched',
      refused && readFileSync(path, 'utf8') === 'external\n' && /data\.csv changed on disk/.test(session?.snapshot().error ?? ''), session?.snapshot().error)
    const reloaded = await session?.reload()
    ok('sheet.disk.5 Reload adopts the disk, and editing resumes', reloaded === true && session?.snapshot().grid?.[0]?.[0] === 'external' && await session?.setCells([{ r: 0, c: 0, value: 'mine' }]) && readFileSync(path, 'utf8') === 'mine\n')
    ok('sheet.disk.6 the view published to the layout never carries cell content', changed === undefined || !JSON.stringify(changed).includes('mine'))

    // ── xlsx ──────────────────────────────────────────────────────────────
    const XLSX = require('xlsx')
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([['n', 'm'], [1, 2]])
    ws.C2 = { t: 'n', f: 'A2+B2', v: 3 }; ws['!ref'] = 'A1:C2'
    XLSX.utils.book_append_sheet(wb, ws, 'Data')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['other']]), 'Other')
    const bytes = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    const book = safe(() => S.readXlsx(new Uint8Array(bytes)))
    ok('sheet.xlsx.1 cells and formulas read into the same grid, formulas as =text', book?.grid?.[1]?.[2] === '=A2+B2' && book?.grid?.[1]?.[0] === '1')
    ok('sheet.xlsx.2 a second worksheet is named as a loss, never silently hidden', (book?.losses ?? []).some((l) => /1 other worksheet/.test(l)), JSON.stringify(book?.losses))
    const out = safe(() => S.writeXlsx(book, [['n', 'm'], ['7', '2', '=A2+B2']]))
    const back = safe(() => S.readXlsx(out))
    ok('sheet.xlsx.3 a write round-trips the edit and keeps the formula a formula', back?.grid?.[1]?.[0] === '7' && back?.grid?.[1]?.[2] === '=A2+B2')
    // SheetJS CE never parses charts or images, so the loss list reads the zip's own entry names.
    ok('sheet.xlsx.4 macros, charts and images are named with counts from the workbook’s zip entries', (() => {
      const b = safe(() => S.lossesOf({ SheetNames: ['A'], vbaraw: new Uint8Array(1) }, 'A'))
      const c = safe(() => S.lossesOf({ SheetNames: ['A'], keys: ['xl/charts/chart1.xml', 'xl/media/image1.png', 'xl/media/image2.png', 'xl/pivotTables/pivotTable1.xml'] }, 'A'))
      return Array.isArray(b) && b.some((l) => /macros/.test(l)) && Array.isArray(c) && c.includes('1 chart') && c.includes('2 images') && c.includes('1 pivot table')
    })(), JSON.stringify(safe(() => S.lossesOf({ SheetNames: ['A'], keys: ['xl/charts/chart1.xml'] }, 'A'))))
    ok('sheet.xlsx.6 a real SheetJS-read workbook exposes its zip entries, so the list is not silently empty',
      Array.isArray(book?.workbook?.keys) && book.workbook.keys.length > 0, JSON.stringify(book?.workbook?.keys?.slice?.(0, 4)))

    // The M245 critic's findings 1–3, as checks.
    const dwb = XLSX.utils.book_new()
    const dws = { A1: { t: 'n', v: 45292, z: 'yyyy-mm-dd' }, B1: { t: 's', v: '007' }, C1: { t: 's', v: '2024-01-01' }, '!ref': 'A1:C1' }
    XLSX.utils.book_append_sheet(dwb, dws, 'D')
    const dbook = safe(() => S.readXlsx(new Uint8Array(XLSX.write(dwb, { type: 'buffer', bookType: 'xlsx' }))))
    const dout = safe(() => S.writeXlsx(dbook, [['2024-01-02', "'007", "'2024-01-01"]]))
    const dback = safe(() => XLSX.read(dout, { type: 'array', cellNF: true }).Sheets.D)
    ok('sheet.xlsx.7 a date-formatted number reads as ISO text and writes back as a DATE (serial + date format), never as text',
      dbook?.grid?.[0]?.[0] === '2024-01-01' && dback?.A1?.t === 'n' && dback?.A1?.v === 45293 && XLSX.SSF.is_date(dback?.A1?.z ?? ''), JSON.stringify({ grid: dbook?.grid, A1: dback?.A1 }))
    ok('sheet.xlsx.8 text that looks like a number or a date stays TEXT through a round trip',
      dbook?.grid?.[0]?.[1] === "'007" && dbook?.grid?.[0]?.[2] === "'2024-01-01" && dback?.B1?.t === 's' && dback?.B1?.v === '007' && dback?.C1?.t === 's', JSON.stringify({ B1: dback?.B1, C1: dback?.C1 }))
    const xpath = join(dir, 'book.xlsx')
    writeFileSync(xpath, Buffer.from(bytes))
    const xio = { name: 'book.xlsx', read: async () => S.readFile(xpath, 'base64'), write: async (b64, mtime) => S.writeFile(xpath, b64, mtime, 'base64'), changed: () => {} }
    const xs = S.createSheetSession?.({}, xio, 'xlsx')
    await xs?.refresh(); xs?.acceptLosses()
    const xBefore = readFileSync(xpath)
    const xRefused = await xs?.update(S.insertRows(xs.snapshot().grid, 0, 1), true)
    ok('sheet.xlsx.9 a row/column insert or delete on an xlsx is refused BY NAME and writes nothing',
      xRefused === false && /cannot be inserted or deleted in an xlsx/.test(xs?.snapshot().error ?? '') && readFileSync(xpath).equals(xBefore), xs?.snapshot().error)
    const xEdited = await xs?.setCells([{ r: 1, c: 1, value: '9' }])
    const xEdited2 = await xs?.setCells([{ r: 1, c: 0, value: '8' }])
    const xNow = safe(() => S.readXlsx(new Uint8Array(readFileSync(xpath))))
    ok('sheet.xlsx.10 consecutive xlsx saves each key from the file just written (the book is re-read after every write)',
      xEdited === true && xEdited2 === true && xNow?.grid?.[1]?.[0] === '8' && xNow?.grid?.[1]?.[1] === '9' && xNow?.grid?.[1]?.[2] === '=A2+B2', JSON.stringify(xNow?.grid))

    const qpath = join(dir, 'queue.csv')
    writeFileSync(qpath, 'x\n')
    const qio = { name: 'queue.csv', read: async () => S.readFile(qpath, 'base64'), write: async (b64, mtime) => S.writeFile(qpath, b64, mtime, 'base64'), changed: () => {} }
    const qs = S.createSheetSession?.({}, qio, 'csv')
    await qs?.refresh()
    await qs?.setCells([{ r: 0, c: 0, value: 'y' }])
    await qs?.setCells([{ r: 0, c: 0, value: 'z' }])
    const [u1, u2] = await Promise.all([qs?.undo(), qs?.undo()])
    ok('sheet.disk.7 two undos fired without waiting (a fast double Cmd+Z) BOTH apply — queued, never silently dropped',
      u1 === true && u2 === true && readFileSync(qpath, 'utf8') === 'x\n', JSON.stringify({ u1, u2, file: readFileSync(qpath, 'utf8') }))
    ok('sheet.xlsx.5 garbage bytes are an error arm, not a throw', typeof safe(() => S.readXlsx(new Uint8Array([1, 2, 3])))?.error === 'string')

    // ── export gate ──────────────────────────────────────────────────────
    const filePanel = { id: 'f1', kind: 'file', x: 0, y: 0, w: 400, h: 300, z: 1, source: { path, sheet: { widths: [90], lossAccepted: ['1 chart'] } } }
    const portable = safe(() => S.buildPortable({ workspaceName: 's', panels: [filePanel], templates: [], app: '5.0.0', now: 1 }))
    const remapped = safe(() => S.remapPortable({ ...portable, workspace: { ...portable.workspace, panels: [filePanel] } }, (x) => x + 'n'))
    ok('sheet.export.1 export and hostile import keep that it is a sheet but strip consent and widths',
      JSON.stringify(portable?.workspace?.panels?.[0]?.source?.sheet) === '{}' && JSON.stringify(remapped?.workspace?.panels?.[0]?.source?.sheet) === '{}')
  } finally { rmSync(dir, { recursive: true, force: true }) }
  const failures = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failures.length}/${results.length} checks passed`)
  process.exitCode = failures.length ? 1 : 0
})().catch((error) => { console.error(error); process.exitCode = 1 })
