/**
 * M251 — a deck's door out, as a .pptx.
 *
 * Runs here, in main, against injected functions (the save dialog, the file
 * reads, the write) so verify:deck drives every arm with a fake dialog and
 * the REAL pptxgenjs — the zip it writes is what the check opens. main
 * externalises dependencies, so the library loads from node_modules at run
 * time and never reaches the renderer.
 *
 * The gate: every string that enters the file is scrubbed FIELD BY FIELD
 * with `redactSecrets` and counted — title, each bullet, each paragraph,
 * each picture's alt text, the notes — the portable export's reason for not
 * going through `outward`, which answers one text and one note, where an
 * export is a structure whose count is part of its report. This file is on
 * gate.2's named caller list for that reason. Pictures are embedded as their
 * bytes and never called redacted (product-rules), and a picture is decided
 * by its MAGIC NUMBER through M181's `readImage`: a deck line pointing at
 * `~/.ssh/id_rsa` is not a picture, so its bytes never enter the file — it is
 * listed in the report instead.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join } from 'node:path'
import PptxGenJS from 'pptxgenjs'
import { redactSecrets } from '../shared/redact'
import { parseDeck, unmappedName, type DeckExportRequest, type DeckExportResult, type DeckSlide, type DeckUnmapped } from '../shared/deck'
import type { ImageResult } from '../shared/starter'
import { readImage as readImageFile } from './image-read'

export interface DeckExporterDeps {
  /** The save dialog: a path, or null when the person cancelled. */
  askPath: (suggested: string) => Promise<string | null>
  /** Injected so the plain-node tier can count writes; the default is atomic. */
  write?: (path: string, data: Buffer) => void
  readText?: (path: string) => string
  readImage?: (path: string) => ImageResult
}

export interface DeckExporter {
  exportDeck(req: DeckExportRequest): Promise<DeckExportResult>
}

const atomicWrite = (path: string, data: Buffer): void => {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, data, { mode: 0o600 })
  renameSync(tmp, path)
}

export const INERT_DECK_EXPORTER: DeckExporter = {
  exportDeck: async () => ({ kind: 'failed', reason: 'export is not wired' })
}

// 16:9 in inches, pptxgenjs's LAYOUT_WIDE.
const W = 13.333
const H = 7.5
const M = 0.5

export function createDeckExporter(deps: DeckExporterDeps): DeckExporter {
  const write = deps.write ?? atomicWrite
  const readText = deps.readText ?? ((p: string) => readFileSync(p, 'utf8'))
  const readImage = deps.readImage ?? readImageFile
  return {
    async exportDeck(req) {
      let text: string
      try {
        text = readText(req.path)
      } catch (error: unknown) {
        const code = (error as { code?: string }).code
        return { kind: 'failed', reason: code === 'ENOENT' ? `${req.path} no longer exists` : `${req.path}: ${error instanceof Error ? error.message : String(error)}` }
      }
      const parsed = parseDeck(text)
      if (parsed.kind !== 'deck') return { kind: 'failed', reason: parsed.kind === 'malformed' ? parsed.reason : `${req.path} is empty` }
      // No content, no dialog: asking where to save nothing is a question
      // with no good answer.
      if (parsed.slides.length === 0) return { kind: 'empty' }

      const tally = { n: 0 }
      const scrub = (s: string): string => {
        const { text: clean, count } = redactSecrets(s)
        tally.n += count
        return clean
      }
      const unmapped: DeckUnmapped[] = [...parsed.unmapped]
      const pptx = new PptxGenJS()
      pptx.layout = 'LAYOUT_WIDE'
      let notes = 0
      parsed.slides.forEach((slide, index) => {
        if (addSlide(pptx, slide, index + 1, { scrub, unmapped, readImage, base: dirname(req.path) })) notes += 1
      })
      // Report in slide order, with the exporter's own findings (a picture
      // that was not one) beside the parser's.
      unmapped.sort((a, b) => a.slide - b.slide)

      const suggested = `${basename(req.path).replace(/\.deck\.md$|\.md$|\.markdown$/i, '')}.pptx`
      const path = await deps.askPath(suggested)
      if (path === null) return { kind: 'cancelled' }
      try {
        const data = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer
        write(path, data)
      } catch (error: unknown) {
        return { kind: 'failed', reason: error instanceof Error ? error.message : String(error) }
      }
      return {
        kind: 'written', path, slides: parsed.slides.length, notes, redacted: tally.n,
        unmapped: { count: unmapped.length, names: unmapped.map(unmappedName) }
      }
    }
  }
}

interface SlideContext {
  scrub: (s: string) => string
  unmapped: DeckUnmapped[]
  readImage: (path: string) => ImageResult
  base: string
}

/** One slide. Returns whether it carried speaker notes. */
function addSlide(pptx: PptxGenJS, slide: DeckSlide, n: number, ctx: SlideContext): boolean {
  const s = pptx.addSlide()
  const pictures: { data: string; alt: string }[] = []
  for (const image of slide.images) {
    const path = isAbsolute(image.src) ? image.src : join(ctx.base, image.src)
    const read = ctx.readImage(path)
    if (read.kind === 'data') pictures.push({ data: read.dataUrl, alt: ctx.scrub(image.alt) })
    else ctx.unmapped.push({ slide: n, what: `${image.src} (${read.kind === 'missing' ? 'missing' : read.kind === 'too-large' ? 'too large' : 'not an image'})` })
  }

  let top = M
  if (slide.title !== undefined) {
    s.addText(ctx.scrub(slide.title), { x: M, y: M, w: W - 2 * M, h: 1, fontSize: 32, bold: true, valign: 'top' })
    top = M + 1.2
  }
  // Pictures share the slide with text on the right half; alone, they fill it.
  const hasText = slide.bullets.length > 0 || slide.body.length > 0
  const textW = pictures.length > 0 ? (W - 3 * M) / 2 : W - 2 * M
  if (hasText) {
    const runs: PptxGenJS.TextProps[] = [
      ...slide.body.map((p) => ({ text: ctx.scrub(p), options: { breakLine: true, paraSpaceAfter: 8 } })),
      ...slide.bullets.map((b) => ({
        text: ctx.scrub(b.text),
        options: { bullet: b.numbered ? { type: 'number' as const } : true, indentLevel: b.level, breakLine: true }
      }))
    ]
    s.addText(runs, { x: M, y: top, w: textW, h: H - top - M, fontSize: 18, valign: 'top' })
  }
  if (pictures.length > 0) {
    const x = hasText ? M + textW + M : M
    const w = hasText ? textW : W - 2 * M
    const h = (H - top - M) / pictures.length
    pictures.forEach((p, i) => {
      s.addImage({ data: p.data, x, y: top + i * h, w, h, altText: p.alt, sizing: { type: 'contain', w, h } })
    })
  }
  if (slide.notes !== undefined) {
    s.addNotes(ctx.scrub(slide.notes))
    return true
  }
  return false
}
