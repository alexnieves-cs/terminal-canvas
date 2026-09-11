/**
 * M245. RFC 4180, with the fidelity a round-trip needs.
 *
 * A sheet edits a file somebody else also reads — an agent, a script, git — so
 * an edit to ONE cell must change only that cell's bytes. That is why the
 * document remembers four things a plain parser throws away: the BOM, the
 * dominant line ending, whether the file ended in a newline, and which cells
 * the source quoted although nothing required it. Serializing without them
 * rewrites every line of a CRLF file as LF, and the diff an agent's reviewer
 * sees is the whole file for a one-cell change.
 *
 * Ragged rows keep their own length. Padding them to the widest row on read
 * would append commas to every short line on the first save — the same
 * "changed bytes nobody edited" failure.
 */
export interface CsvDoc {
  rows: string[][]
  bom: boolean
  eol: '\n' | '\r\n'
  finalEol: boolean
  /** `r,c` of cells quoted in the source without needing it. Stale after a structural edit, so the session drops it then. */
  quoted: ReadonlySet<string>
}

export function needsQuote(cell: string, delimiter: string): boolean {
  return cell.includes(delimiter) || /["\r\n]/.test(cell)
}

export function parseCsv(text: string, delimiter = ','): CsvDoc {
  let src = text
  let bom = false
  if (src.charCodeAt(0) === 0xfeff) { bom = true; src = src.slice(1) }
  const rows: string[][] = []
  const quoted = new Set<string>()
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let wasQuoted = false
  let crlf = 0
  let lf = 0
  let atRowStart = true
  const endField = (): void => {
    if (wasQuoted && !needsQuote(field, delimiter)) quoted.add(`${rows.length},${row.length}`)
    row.push(field)
    field = ''
    wasQuoted = false
  }
  const endRow = (): void => { endField(); rows.push(row); row = []; atRowStart = true }
  for (let i = 0; i < src.length;) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue }
        inQuotes = false; i += 1; continue
      }
      // A newline INSIDE quotes is cell content and is not counted toward the
      // file's line ending — a CRLF cell in an LF file must not flip the file.
      field += ch; i += 1; continue
    }
    atRowStart = false
    if (ch === '"' && field === '' && !wasQuoted) { inQuotes = true; wasQuoted = true; i += 1; continue }
    if (ch === delimiter) { endField(); i += 1; continue }
    if (ch === '\r' && src[i + 1] === '\n') { crlf += 1; endRow(); i += 2; continue }
    if (ch === '\n') { lf += 1; endRow(); i += 1; continue }
    field += ch; i += 1
  }
  // An unterminated quote is read to the end of the file rather than dropped:
  // the text is real content, and a parser that loses it loses it on the next
  // save too.
  const finalEol = src.length > 0 && atRowStart && !inQuotes
  if (!atRowStart || inQuotes) endRow()
  return { rows, bom, eol: crlf > 0 && crlf >= lf ? '\r\n' : '\n', finalEol, quoted }
}

export function serializeCsv(doc: CsvDoc, delimiter = ','): string {
  const lines = doc.rows.map((row, r) => row.map((cell, c) =>
    needsQuote(cell, delimiter) || doc.quoted.has(`${r},${c}`) ? `"${cell.replace(/"/g, '""')}"` : cell).join(delimiter))
  return (doc.bom ? '﻿' : '') + lines.join(doc.eol) + (doc.finalEol && doc.rows.length > 0 ? doc.eol : '')
}
