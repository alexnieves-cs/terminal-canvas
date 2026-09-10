import { readFileSync, statSync } from 'node:fs'
import { basename, dirname, extname, isAbsolute } from 'node:path'
import mammoth from 'mammoth'
import JSZip from 'jszip'
import { htmlToMarkdown } from '../shared/html-to-md'
import { lossSentence, type DocxLossReport, type DocxImportResult } from '../shared/imported-note'
import type { FileCreateResult } from '../shared/file-panel'
import type { PutAssetResult } from './asset-store'

/**
 * M250. A Word document becomes a NEW Markdown note beside it.
 *
 * Main's, for the reason every file door is main's: the renderer names a
 * path and never holds a file handle. The collaborators are INJECTED so
 * `verify:notes docx.*` drives the real conversion in plain node over the
 * committed fixture — only `index.ts` knows about `userData` and dialogs.
 *
 * Three promises, each checked:
 *  - The .docx is only ever READ (`docx.readonly.1`): one `readFileSync`, and
 *    no other fs call names its path.
 *  - Nothing is overwritten (`docx.create.1`): the note is written through
 *    `createFile`, whose `wx` flag refuses an existing name atomically; `exists`
 *    is its own arm naming the path.
 *  - What the conversion dropped is COUNTED FROM THE OOXML (`analyzeDocx`),
 *    never inferred from mammoth's output — mammoth's silence about a comment
 *    is exactly the loss being reported (`docx.loss.1`).
 */

/** Refused before a byte is read — a converter holds the whole package in memory. */
export const DOCX_MAX_BYTES = 20 * 1024 * 1024

export type { DocxImportResult }

/** What the package may inflate to, summed over its entries. */
export const DOCX_MAX_INFLATED_BYTES = 100 * 1024 * 1024
class InflatedTooLarge extends Error { constructor(readonly bytes: number) { super('inflated too large') } }

export interface DocxImportDeps {
  putAsset(bytes: Uint8Array): Promise<PutAssetResult>
  createFile(root: string, name: string, seed: string): FileCreateResult
  maxBytes?: number
  maxInflatedBytes?: number
}

const count = (xml: string | undefined, re: RegExp): number => xml === undefined ? 0 : (xml.match(re) ?? []).length

/** Top-level tables that a pipe table cannot say: a merged cell, or a table inside a table. */
function complexTables(xml: string): number {
  let depth = 0, from = 0, complex = 0
  const re = /<w:tbl[\s>]|<\/w:tbl>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    if (m[0] === '</w:tbl>') {
      depth -= 1
      if (depth === 0) {
        const table = xml.slice(from, m.index)
        if (/<w:gridSpan\b|<w:vMerge\b/.test(table) || /<w:tbl[\s>]/.test(table.slice(6))) complex += 1
      }
    } else {
      if (depth === 0) from = m.index
      depth += 1
    }
  }
  return complex
}

/** The loss report's counts, read straight from the package's XML parts. Throws for a file that is not a zip. */
export async function analyzeDocx(bytes: Uint8Array, maxInflated = DOCX_MAX_INFLATED_BYTES): Promise<DocxLossReport> {
  const zip = await JSZip.loadAsync(bytes)
  // The size cap above is on the COMPRESSED file. A package that inflates to
  // gigabytes is small on disk, and both this reader and mammoth inflate it
  // in MAIN — the process that owns every PTY. The central directory's
  // declared sizes are read before a byte is inflated.
  const inflated = Object.values(zip.files).reduce((sum, f) => sum + ((f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0), 0)
  if (inflated > maxInflated) throw new InflatedTooLarge(inflated)
  const text = async (name: string): Promise<string | undefined> => zip.file(name)?.async('string')
  const document = await text('word/document.xml')
  if (document === undefined) throw new Error('no word/document.xml')
  const notes = /<w:(?:footnote|endnote)\b(?![^>]*w:type="(?:separator|continuationSeparator|continuationNotice)")[^>]*>/g
  let headersFooters = 0
  for (const name of Object.keys(zip.files).filter((n) => /^word\/(?:header|footer)\d*\.xml$/.test(n))) {
    if (/<w:t[\s>]/.test((await text(name)) ?? '')) headersFooters += 1
  }
  return {
    comments: count(await text('word/comments.xml'), /<w:comment\b/g),
    // `\b` after the name: `<w:delText` and `<w:moveFromRangeStart` are not changes.
    trackedChanges: count(document, /<w:(?:ins|del|moveFrom|moveTo)\b/g),
    complexTables: complexTables(document),
    textBoxes: count(document, /<w:txbxContent\b/g),
    footnotes: count(await text('word/footnotes.xml'), notes) + count(await text('word/endnotes.xml'), notes),
    headersFooters,
    imagesNotKept: 0,
    messages: []
  }
}

export async function importDocx(req: { path?: unknown }, deps: DocxImportDeps): Promise<DocxImportResult> {
  const path = req?.path
  if (typeof path !== 'string' || !isAbsolute(path)) return { kind: 'refused', reason: 'a .docx import needs an absolute path' }
  const name = basename(path)
  if (extname(path).toLowerCase() !== '.docx') return { kind: 'refused', reason: `only a .docx file can be imported — ${name} is not one` }
  const cap = deps.maxBytes ?? DOCX_MAX_BYTES
  let size: number
  try {
    const st = statSync(path)
    if (!st.isFile()) return { kind: 'refused', reason: `no file at ${path}` }
    size = st.size
  } catch { return { kind: 'refused', reason: `no file at ${path}` } }
  if (size > cap) return { kind: 'refused', reason: `${name} is ${(size / 1048576).toFixed(1)} MB — over the ${(cap / 1048576).toFixed(cap < 1048576 ? 5 : 0)} MB this app imports` }
  let bytes: Buffer
  try { bytes = readFileSync(path) } catch (error) { return { kind: 'refused', reason: `${name} could not be read: ${error instanceof Error ? error.message : String(error)}` } }

  let report: DocxLossReport
  try { report = await analyzeDocx(bytes, deps.maxInflatedBytes) } catch (error) {
    if (error instanceof InflatedTooLarge) return { kind: 'refused', reason: `${name} expands to ${(error.bytes / 1048576).toFixed(1)} MB when unpacked — over what this app imports` }
    return { kind: 'refused', reason: `${name} is not a Word document this app can read` }
  }

  let images = 0
  let html: string
  try {
    const converted = await mammoth.convertToHtml({ buffer: bytes }, {
      convertImage: mammoth.images.imgElement(async (image) => {
        const put = await deps.putAsset(await image.read())
        if (put.kind === 'stored') { images += 1; return { src: put.path } }
        // Counted, never silently missing: the report names it.
        report.imagesNotKept += 1
        return { src: '' }
      })
    })
    html = converted.value
    report.messages = converted.messages.map((m) => m.message)
  } catch (error) {
    return { kind: 'refused', reason: `${name} could not be converted: ${error instanceof Error ? error.message : String(error)}` }
  }
  const markdown = htmlToMarkdown(html)

  // Beside the docx, then in notes/ beside it. Never a third guess and never a
  // numbered copy: a person looking for "Plan.md" should find it or be told
  // exactly which file is in the way.
  const root = dirname(path), stem = basename(path, extname(path))
  let last: FileCreateResult | undefined
  for (const target of [`${stem}.md`, `notes/${stem}.md`]) {
    last = deps.createFile(root, target, markdown)
    if (last.kind !== 'exists') break
  }
  if (last === undefined || last.kind === 'exists') return { kind: 'exists', path: last?.path ?? root }
  if (last.kind !== 'created') return { kind: 'refused', reason: `the note could not be written: ${last.detail}` }
  return { kind: 'imported', path: last.path, source: path, mtimeMs: last.mtimeMs, report, dropped: lossSentence(report), images }
}
