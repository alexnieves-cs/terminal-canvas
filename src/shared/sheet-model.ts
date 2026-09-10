import { parseCsv, serializeCsv } from './csv'
import { shiftFormula, type CellRange, type Grid } from './sheet-formula'

/**
 * M245. Pure grid edits. Every function returns a NEW grid and never mutates
 * its input: the session keeps the previous grid for undo, and an edit that
 * mutated it in place would make undo restore the edited value.
 */

export interface CellEdit { r: number; c: number; value: string }

export function gridSize(grid: Grid): { rows: number; cols: number } {
  return { rows: grid.length, cols: grid.reduce((m, row) => Math.max(m, row.length), 0) }
}

/** Only the touched rows are copied; a row past a ragged row's end is padded, no other row is. */
export function setCells(grid: Grid, edits: readonly CellEdit[]): string[][] {
  const next = grid.map((row) => row as string[])
  const copied = new Set<number>()
  for (const { r, c, value } of edits) {
    while (next.length <= r) next.push([])
    if (!copied.has(r)) { next[r] = [...next[r]]; copied.add(r) }
    while (next[r].length <= c) next[r].push('')
    next[r][c] = value
  }
  return next
}

export function setCell(grid: Grid, r: number, c: number, value: string): string[][] {
  return setCells(grid, [{ r, c, value }])
}

const mapFormulas = (grid: Grid, fn: (f: string) => string): string[][] =>
  grid.map((row) => row.some((cell) => cell.startsWith('=')) ? row.map((cell) => cell.startsWith('=') ? fn(cell) : cell) : [...row])

export function insertRows(grid: Grid, at: number, n = 1): string[][] {
  const next = mapFormulas(grid, (f) => shiftFormula(f, 'row', at, n))
  next.splice(at, 0, ...Array.from({ length: n }, () => [] as string[]))
  return next
}

export function deleteRows(grid: Grid, at: number, n = 1): string[][] {
  const next = mapFormulas(grid, (f) => shiftFormula(f, 'row', at, -n))
  next.splice(at, n)
  return next
}

export function insertCols(grid: Grid, at: number, n = 1): string[][] {
  return mapFormulas(grid, (f) => shiftFormula(f, 'col', at, n)).map((row) => {
    // A ragged row that ends before the insertion point has no cell there to push right.
    if (row.length <= at) return row
    row.splice(at, 0, ...Array.from({ length: n }, () => ''))
    return row
  })
}

export function deleteCols(grid: Grid, at: number, n = 1): string[][] {
  return mapFormulas(grid, (f) => shiftFormula(f, 'col', at, -n)).map((row) => { row.splice(at, n); return row })
}

/** TSV is what every spreadsheet puts on the clipboard, so a range pastes into Excel or Sheets as cells. */
export function rangeToTsv(grid: Grid, range: CellRange): string {
  const rows: string[][] = []
  for (let r = range.r0; r <= range.r1; r++) {
    const row: string[] = []
    for (let c = range.c0; c <= range.c1; c++) row.push(grid[r]?.[c] ?? '')
    rows.push(row)
  }
  return serializeCsv({ rows, bom: false, eol: '\n', finalEol: false, quoted: new Set() }, '\t')
}

/** Paste a TSV block with its top-left at `anchor`, growing the grid as needed. */
export function pasteTsv(grid: Grid, anchor: { r: number; c: number }, text: string): string[][] {
  const block = parseCsv(text.replace(/\r?\n$/, ''), '\t').rows
  const edits: CellEdit[] = []
  block.forEach((row, dr) => row.forEach((value, dc) => edits.push({ r: anchor.r + dr, c: anchor.c + dc, value })))
  return setCells(grid, edits)
}

export function clearRange(grid: Grid, range: CellRange): string[][] {
  const edits: CellEdit[] = []
  for (let r = range.r0; r <= Math.min(range.r1, grid.length - 1); r++) {
    for (let c = range.c0; c <= Math.min(range.c1, (grid[r]?.length ?? 0) - 1); c++) if (grid[r][c] !== '') edits.push({ r, c, value: '' })
  }
  return edits.length === 0 ? grid.map((row) => [...row]) : setCells(grid, edits)
}
