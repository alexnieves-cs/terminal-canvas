import * as XLSX from 'xlsx'
import { NUMBER, type Grid } from './sheet-formula'

/**
 * M245 Phase B. xlsx through SheetJS, and an honest account of what it drops.
 *
 * SheetJS Community reads cells and formulas and writes them back; it does NOT
 * carry charts, images, pivot tables, table definitions, macros or most cell
 * formatting through a write. A save that silently lost a chart would be found
 * days later by the person who made it. So every loss is NAMED, with a count,
 * from the workbook's own zip entry list (`bookFiles`) — the one source that
 * sees parts SheetJS never parses — and the session refuses to write until
 * the person has seen and accepted that list.
 *
 * Only the first worksheet is edited; the others are kept by the write and
 * named as "not editable here", because a sheet the UI never shows is a sheet
 * the person does not know is there.
 */

export interface XlsxBook {
  workbook: XLSX.WorkBook
  sheet: string
  grid: string[][]
  losses: string[]
  /** The workbook's date system: serial 0 is 1904-01-01 rather than 1899-12-30. */
  date1904: boolean
}

/**
 * A DATE is a number with a date format in xlsx. Shown raw it is `45292`, and
 * a person who "fixes" it by typing `1/1/2024` has turned a date into text
 * that no formula can compare (the M245 critic's finding). So a date-formatted
 * number reads as ISO text, and ISO text writes back as a date serial with the
 * cell's own format kept. Excel's 1900 leap-day bug (serials below 61) is not
 * reproduced; no workbook a person edits today starts in February 1900.
 */
const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/
const EPOCH = Date.UTC(1899, 11, 30)
const DAY = 86_400_000
function isoFromSerial(serial: number, date1904: boolean): string {
  const d = new Date(EPOCH + Math.round((serial + (date1904 ? 1462 : 0)) * DAY))
  const pad = (n: number): string => String(n).padStart(2, '0')
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  if (Number.isInteger(serial)) return date
  const s = d.getUTCSeconds()
  return `${date}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}${s ? `:${pad(s)}` : ''}`
}
function serialFromIso(m: RegExpExecArray, date1904: boolean): number {
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0))
  return (ms - EPOCH) / DAY - (date1904 ? 1462 : 0)
}

/** Text that would otherwise read as a formula, a number, a date or an escaped literal carries the apostrophe. */
function textCell(v: string): string {
  return v.startsWith('=') || v.startsWith("'") || NUMBER.test(v) || ISO.test(v) ? `'${v}` : v
}

function cellText(cell: XLSX.CellObject | undefined, date1904: boolean): string {
  if (!cell) return ''
  if (cell.f) return `=${cell.f}`
  switch (cell.t) {
    case 'n':
      if (cell.v === undefined) return ''
      if (typeof cell.v === 'number' && cell.z !== undefined && XLSX.SSF.is_date(cell.z)) return isoFromSerial(cell.v, date1904)
      return String(cell.v)
    case 'b': return cell.v ? 'TRUE' : 'FALSE'
    case 's': return textCell(String(cell.v ?? ''))
    case 'd': return cell.w ?? (cell.v instanceof Date ? cell.v.toISOString() : String(cell.v ?? ''))
    case 'e': return cell.w ?? '#VALUE!'
    default: return ''
  }
}

function gridOf(ws: XLSX.WorkSheet, date1904: boolean): string[][] {
  const ref = ws['!ref']
  if (!ref) return []
  const range = XLSX.utils.decode_range(ref)
  const grid: string[][] = []
  for (let r = 0; r <= range.e.r; r++) {
    const row: string[] = []
    for (let c = 0; c <= range.e.c; c++) row.push(cellText(ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined, date1904))
    while (row.length > 0 && row[row.length - 1] === '') row.pop()
    grid.push(row)
  }
  while (grid.length > 0 && grid[grid.length - 1].length === 0) grid.pop()
  return grid
}

type LossSource = { SheetNames: string[]; keys?: string[]; vbaraw?: unknown }

export function lossesOf(wb: LossSource, _sheet: string): string[] {
  const keys = wb.keys ?? []
  const count = (re: RegExp): number => keys.filter((k) => re.test(k)).length
  const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`
  const out: string[] = []
  const charts = count(/(^|\/)xl\/charts\/chart\d*\.xml$/i)
  if (charts) out.push(plural(charts, 'chart'))
  const images = count(/(^|\/)xl\/media\//i)
  if (images) out.push(plural(images, 'image'))
  const pivots = count(/(^|\/)xl\/pivotTables\/[^/]+\.xml$/i)
  if (pivots) out.push(plural(pivots, 'pivot table'))
  const tables = count(/(^|\/)xl\/tables\/[^/]+\.xml$/i)
  if (tables) out.push(plural(tables, 'table definition'))
  if (wb.vbaraw !== undefined || keys.some((k) => /vbaProject\.bin$/i.test(k))) out.push('macros (VBA)')
  if (keys.some((k) => /(^|\/)xl\/styles\.xml$/i.test(k))) out.push('cell formatting (fonts, colours, borders)')
  const others = wb.SheetNames.length - 1
  if (others > 0) out.push(`${plural(others, 'other worksheet')} (kept, not editable here)`)
  return out
}

export function readXlsx(bytes: Uint8Array): XlsxBook | { error: string } {
  // An xlsx is a zip. Without this gate SheetJS happily parses arbitrary bytes
  // as CSV or HTML and returns a "workbook" of garbage the person could save.
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return { error: 'this is not an xlsx workbook' }
  let workbook: XLSX.WorkBook
  try {
    // cellNF: without it SheetJS leaves `z` (the number format) unset, so no date is
    // recognisable as one and every date reads as its raw serial (verify:sheet xlsx.7).
    workbook = XLSX.read(bytes, { type: 'array', cellFormula: true, cellNF: true, bookFiles: true, bookVBA: true })
  } catch (e) {
    return { error: `the workbook could not be read: ${String(e)}` }
  }
  const sheet = workbook.SheetNames[0]
  if (sheet === undefined) return { error: 'the workbook has no worksheets' }
  const date1904 = (workbook.Workbook as { WBProps?: { date1904?: boolean } } | undefined)?.WBProps?.date1904 === true
  return { workbook, sheet, grid: gridOf(workbook.Sheets[sheet], date1904), losses: lossesOf(workbook as unknown as LossSource, sheet), date1904 }
}

function cellOf(text: string, date1904: boolean): XLSX.CellObject | null {
  if (text === '') return null
  if (text.startsWith('=')) return { t: 'n', f: text.slice(1) }
  if (text.startsWith("'")) return { t: 's', v: text.slice(1) }
  const iso = ISO.exec(text)
  // A date keeps being a date: the serial, with the cell's own format carried below (or ISO's).
  if (iso) return { t: 'n', v: serialFromIso(iso, date1904), z: iso[4] === undefined ? 'yyyy-mm-dd' : 'yyyy-mm-dd hh:mm' }
  if (NUMBER.test(text)) return { t: 'n', v: Number(text) }
  if (text === 'TRUE' || text === 'FALSE') return { t: 'b', v: text === 'TRUE' }
  return { t: 's', v: text }
}

/**
 * The whole workbook, with the first sheet's cells replaced by `grid`.
 *
 * Per-cell comments, formats and links, and the sheet's merges and column
 * widths, are carried BY ADDRESS — correct only while no row or column has
 * moved. The session therefore refuses row/column insert and delete on an
 * xlsx (named), and re-reads the book from each write so the next write keys
 * from the file as it now is, never from the one first opened.
 */
export function writeXlsx(book: XlsxBook, grid: Grid): Uint8Array {
  const old = book.workbook.Sheets[book.sheet] ?? {}
  const ws: XLSX.WorkSheet = {}
  let maxR = -1
  let maxC = -1
  grid.forEach((row, r) => row.forEach((text, c) => {
    const cell = cellOf(text, book.date1904)
    if (!cell) return
    const addr = XLSX.utils.encode_cell({ r, c })
    // Carry what SheetJS CAN write for this address: a comment, a number format, a link.
    const prev = old[addr] as XLSX.CellObject | undefined
    if (prev?.c) cell.c = prev.c
    if (prev?.z) cell.z = prev.z
    if (prev?.l) cell.l = prev.l
    ws[addr] = cell
    maxR = Math.max(maxR, r)
    maxC = Math.max(maxC, c)
  }))
  ws['!ref'] = maxR < 0 ? 'A1' : XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } })
  for (const key of ['!merges', '!cols', '!rows', '!autofilter', '!margins', '!protect'] as const) {
    if (old[key] !== undefined) (ws as Record<string, unknown>)[key] = old[key]
  }
  // The raw zip parts (`bookFiles`) are for reading the loss list, never for
  // writing: handing them back risks SheetJS re-emitting stale parts.
  const { keys: _k, files: _f, vbaraw: _v, ...rest } = book.workbook as XLSX.WorkBook & { keys?: unknown; files?: unknown; vbaraw?: unknown }
  const workbook = { ...rest, Sheets: { ...book.workbook.Sheets, [book.sheet]: ws } } as XLSX.WorkBook
  return new Uint8Array(XLSX.write(workbook, { type: 'array', bookType: 'xlsx', compression: true }) as ArrayBuffer)
}
