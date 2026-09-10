/**
 * M248 — a deck to PDF, one 16:9 page per slide.
 *
 * The core runs against injected functions — the read, the image read, the
 * render, the dialog, the write — so `verify:deck deck.pdf.core.*` drives
 * every arm in plain node, the M58 exporter's trade. `createPdfRenderer` is the
 * one piece that needs Electron, and it takes BrowserWindow as an argument so
 * this module never imports `electron` (it is bundled into a plain-node
 * suite); `verify:canvas deck.pdf.1` runs it for real and counts the pages.
 *
 * Every slide's text goes through `outward()` before it is laid out: a PDF is a
 * door out, and the gate is the one scrubber (no new `redactSecrets` caller,
 * `verify:verbs gate.2`). Speaker notes never reach the page.
 */
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { markdownHtml, splitDeck, type ImageAnswer } from '../shared/deck'
import { outward } from '../shared/outward'
import type { FileResult } from '../shared/file-panel'
import type { ImageResult } from '../shared/starter'
import type { DeckPdfExportRequest, DeckPdfExportResult } from '../shared/export'

export interface DeckPdfDeps {
  readText: (path: string) => Promise<FileResult>
  readImage: (path: string) => ImageResult
  /** The generated page to PDF bytes. */
  render: (html: string) => Promise<Buffer>
  /** The save dialog: a path, or null when the person cancelled. */
  askPath: (suggested: string) => Promise<string | null>
  write?: (path: string, data: Buffer) => void
}

const atomicWrite = (path: string, data: Buffer): void => {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, data, { mode: 0o600 })
  renameSync(tmp, path)
}

/** 1280x720 CSS px is 13.33 x 7.5 in — 16:9 at a slide's usual size. */
export const SLIDE_W = 1280, SLIDE_H = 720

/**
 * The page. No script (the window also runs with JavaScript off), a CSP that
 * admits only inline style and data: images, the system face — no remote font.
 */
export function deckPdfHtml(text: string, dir: string, readImage: (path: string) => ImageResult, label: string): { html: string; pages: number; redacted: number } {
  const resolve = (src: string): ImageAnswer => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(src)) return { kind: 'missing' }
    const answer = readImage(isAbsolute(src) ? src : join(dir, src))
    return answer.kind === 'data' ? { kind: 'data', url: answer.dataUrl } : { kind: 'missing' }
  }
  let redacted = 0
  const sections = splitDeck(text).slides.map((slide) => {
    const gated = outward(slide.body, label)
    redacted += gated.redacted
    return `<section class="slide">${markdownHtml(gated.text, resolve)}</section>`
  })
  const html = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<style>
@page { size: ${SLIDE_W}px ${SLIDE_H}px; margin: 0 }
html, body { margin: 0; padding: 0; background: #fff }
.slide { width: ${SLIDE_W}px; height: ${SLIDE_H}px; box-sizing: border-box; padding: 64px 88px; overflow: hidden;
  break-after: page; page-break-after: always; font: 28px/1.4 -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif; color: #1a1d24 }
.slide:last-child { break-after: auto; page-break-after: auto }
h1 { font-size: 60px; margin: 0 0 24px } h2 { font-size: 46px; margin: 0 0 20px } h3 { font-size: 36px; margin: 0 0 16px }
pre { font: 20px/1.4 Menlo, monospace; background: #f2f3f6; padding: 16px; border-radius: 8px; white-space: pre-wrap }
img { max-width: 100%; max-height: 480px; display: block; margin: 0 auto }
table { border-collapse: collapse } th, td { border: 1px solid #c9ced8; padding: 6px 12px }
.img-missing { color: #6b7280; font-style: italic }
</style></head><body>
${sections.join('\n')}
</body></html>`
  return { html, pages: sections.length, redacted }
}

export function createDeckPdf(deps: DeckPdfDeps): (req: DeckPdfExportRequest) => Promise<DeckPdfExportResult> {
  const write = deps.write ?? atomicWrite
  const failed = (error: unknown): DeckPdfExportResult => ({ kind: 'failed', reason: error instanceof Error ? error.message : String(error) })
  return async (req) => {
    const path = req?.path
    if (typeof path !== 'string' || !isAbsolute(path)) return { kind: 'failed', reason: 'a deck is exported from its file — the path must be absolute' }
    let read: FileResult
    try { read = await deps.readText(path) } catch (error) { return failed(error) }
    if (read.kind !== 'text') return { kind: 'failed', reason: read.kind === 'missing' ? `${basename(path)} is not there any more` : `${basename(path)} could not be read as text (${read.kind})` }
    if (read.truncatedLines > 0) return { kind: 'failed', reason: `${basename(path)} is too long to export whole` }
    const built = deckPdfHtml(read.content, dirname(path), deps.readImage, `deck ${basename(path)}`)
    const out = await deps.askPath(basename(path).replace(/\.(md|markdown)$/i, '') + '.pdf')
    if (out === null) return { kind: 'cancelled' }
    let bytes: Buffer
    try { bytes = await deps.render(built.html) } catch (error) { return failed(error) }
    try { write(out, bytes) } catch (error) { return failed(error) }
    return { kind: 'written', path: out, pages: built.pages, redacted: built.redacted }
  }
}

/** The minimal constructor surface this needs — Electron's BrowserWindow satisfies it. */
export interface PdfWindowCtor {
  new (options: Record<string, unknown>): {
    loadFile(path: string): Promise<void>
    webContents: { printToPDF(options: Record<string, unknown>): Promise<Buffer> }
    destroy(): void
  }
}

/**
 * A hidden, sandboxed, script-less, preload-less window prints the page. The
 * page goes through a temp FILE rather than a `data:` URL: images are inlined
 * as base64, and a data URL past Chromium's navigation cap (about 2 MB) fails
 * to load with no page at all — a deck with three screenshots would export
 * nothing. `preferCSSPageSize` makes the page's own 16:9 `@page` the size.
 */
export function createPdfRenderer(Window: PdfWindowCtor, tmpDir: string): (html: string) => Promise<Buffer> {
  return async (html) => {
    const file = join(tmpDir, `tc-deck-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.html`)
    writeFileSync(file, html, { mode: 0o600 })
    const win = new Window({
      show: false, width: SLIDE_W, height: SLIDE_H,
      webPreferences: { javascript: false, sandbox: true, contextIsolation: true, nodeIntegration: false, offscreen: true, webSecurity: true }
    })
    try {
      await win.loadFile(file)
      return await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, margins: { marginType: 'none' } })
    } finally {
      win.destroy()
      rmSync(file, { force: true })
    }
  }
}
