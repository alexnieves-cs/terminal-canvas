/**
 * M251. A deck's slides as .pptx CONTENT — built on M248's deck, never beside
 * it. Slide boundaries, front matter and `<!-- notes … -->` come from
 * `splitDeck`; each slide's blocks from `parseMarkdown(…, { slides: true })`.
 * So the .pptx, the PDF and the DeckNode cannot disagree about where slide 3
 * starts or what it says to the room.
 *
 * Mapping: the first heading → the title; a list → bullets (numbering kept);
 * a paragraph → body text; an image line → a picture; the notes → speaker
 * notes. What a slide cannot hold — a table, a code block, a second heading,
 * a remote picture — is recorded with its slide in `unmapped` and NEVER
 * dropped silently: an export that quietly differs from the file is the
 * failure the export report exists to prevent. Every M248 slide is exported,
 * blank ones included, so "slide N" in the report is DeckNode's slide N.
 *
 * Pure; plain node in verify:deck-export.
 */
import { splitDeck } from './deck'
import { parseMarkdown, type Inline } from './markdown'

export interface PptxBullet { text: string; level: number; numbered: boolean }
export interface PptxImage { alt: string; src: string }
export interface PptxSlide {
  /** M248's zero-based slide index. */
  index: number
  title?: string
  bullets: PptxBullet[]
  body: string[]
  images: PptxImage[]
  /** Absent, never '', when the slide has no notes. */
  notes?: string
}
export interface DeckUnmapped { slide: number; what: string }
export type PptxDeck =
  | { kind: 'absent' }
  | { kind: 'malformed'; reason: string }
  | { kind: 'deck'; slides: PptxSlide[]; unmapped: DeckUnmapped[] }

/** `deck:export-pptx`'s answer. Four arms: each names a different next step. */
export type DeckExportResult =
  | { kind: 'written'; path: string; slides: number; notes: number; redacted: number; unmapped: { count: number; names: string[] } }
  | { kind: 'cancelled' }
  | { kind: 'empty' }
  | { kind: 'failed'; reason: string }

export interface DeckExportRequest { path: string }

/** A slide shows words, not Markdown: every inline mark flattened to its text. */
export function inlineText(inlines: readonly Inline[]): string {
  return inlines.map((i) => (i.kind === 'text' || i.kind === 'code' || i.kind === 'link' ? i.text : inlineText(i.children))).join('').replace(/\s+/g, ' ').trim()
}

export function slideHasContent(s: PptxSlide): boolean {
  return s.title !== undefined || s.bullets.length > 0 || s.body.length > 0 || s.images.length > 0 || s.notes !== undefined
}

export function pptxDeck(value: unknown): PptxDeck {
  if (value === undefined) return { kind: 'absent' }
  if (typeof value !== 'string' || value.includes('\0')) return { kind: 'malformed', reason: 'a deck must be Markdown text without NUL bytes' }
  const unmapped: DeckUnmapped[] = []
  const slides = splitDeck(value).slides.map((source): PptxSlide => {
    const n = source.index + 1
    // Each unmappable construct is reported ONCE per slide per sort, however
    // many lines it spans — a ten-row table is one thing a person left out.
    const note = (what: string): void => { if (!unmapped.some((u) => u.slide === n && u.what === what)) unmapped.push({ slide: n, what }) }
    const slide: PptxSlide = { index: source.index, bullets: [], body: [], images: [] }
    for (const block of parseMarkdown(source.body, { slides: true })) {
      switch (block.kind) {
        case 'heading':
          if (slide.title === undefined) slide.title = inlineText(block.children)
          else note('extra heading')
          break
        case 'paragraph': {
          const text = inlineText(block.children)
          if (text !== '') slide.body.push(text)
          break
        }
        case 'list':
          for (const item of block.items) slide.bullets.push({ text: inlineText(item), level: 0, numbered: block.ordered })
          break
        case 'image':
          if (/^[a-z][a-z0-9+.-]*:/i.test(block.src) || block.src.startsWith('//')) note(`remote image ${block.src}`)
          else slide.images.push({ alt: block.alt, src: block.src })
          break
        case 'code': note('code block'); break
        case 'table': note('table'); break
        // A block kind added to the grammar later is named, not lost.
        default: note(`a ${(block as { kind: string }).kind} block`)
      }
    }
    const notes = source.notes.filter((x) => x !== '').join('\n')
    if (notes !== '') slide.notes = notes
    return slide
  })
  return { kind: 'deck', slides, unmapped }
}

/** `table on slide 3` — the one spelling the report and the check read. */
export function unmappedName(u: DeckUnmapped): string {
  return `${u.what} on slide ${u.slide}`
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

/** The sentence a person reads after an export: count, scrub count, and what was left out BY NAME. */
export function deckExportSentence(result: DeckExportResult): string {
  switch (result.kind) {
    case 'cancelled': return 'Export cancelled — nothing was written.'
    case 'empty': return 'This deck has no slides yet — write a heading or a list, then export.'
    case 'failed': return `The deck could not be exported: ${result.reason}`
    case 'written': {
      const parts = [
        `Exported ${plural(result.slides, 'slide', 'slides')} to ${result.path}`,
        result.redacted > 0 ? `${plural(result.redacted, 'secret', 'secrets')} scrubbed` : 'nothing looked like a secret'
      ]
      if (result.unmapped.count > 0) parts.push(`${plural(result.unmapped.count, 'thing', 'things')} not exported: ${result.unmapped.names.join(', ')}`)
      return `${parts.join(' · ')}.`
    }
  }
}
