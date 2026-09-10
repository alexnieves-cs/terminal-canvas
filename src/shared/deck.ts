/**
 * M246. A deck is a Markdown FILE read as slides — a view of a file panel
 * (`FileSource.deck`), never a kind of its own, for the reason `prose` is not
 * one: a note is a file, and so is a deck.
 *
 * The syntax is the one a person already writes: a line that is exactly
 * `---` (outside a code fence) starts a new slide; the first heading is the
 * title; list items are bullets with their nesting; `![alt](path)` is a
 * picture; everything after a line starting `Note:` is the speaker notes.
 *
 * Anything a slide cannot hold — a table, a code block, raw HTML, a second
 * heading, a remote picture — is recorded in `unmapped` with its slide number
 * and NEVER dropped silently: an export that quietly differs from the file is
 * the failure the export report exists to prevent. Pure; plain node in
 * verify:deck.
 */

export interface DeckBullet { text: string; level: number; numbered: boolean }
export interface DeckImage { alt: string; src: string }
export interface DeckSlide {
  title?: string
  bullets: DeckBullet[]
  body: string[]
  images: DeckImage[]
  /** Absent, never '', when the slide has no Note: line. */
  notes?: string
}
export interface DeckUnmapped { slide: number; what: string }
export type DeckParse =
  | { kind: 'absent' }
  | { kind: 'malformed'; reason: string }
  | { kind: 'deck'; slides: DeckSlide[]; unmapped: DeckUnmapped[] }

/** `deck:export-pptx`'s answer. Four arms: each names a different next step. */
export type DeckExportResult =
  | { kind: 'written'; path: string; slides: number; notes: number; redacted: number; unmapped: { count: number; names: string[] } }
  | { kind: 'cancelled' }
  | { kind: 'empty' }
  | { kind: 'failed'; reason: string }

export interface DeckExportRequest { path: string }

/** `**b**`, `*i*`, `` `c` ``, `[t](u)` → their text. A slide shows words, not Markdown. */
export function plainInline(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(\*|_)(.+?)\1/g, '$2')
    .replace(/`([^`]+)`/g, '$1')
    .trim()
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/
const SEPARATOR = /^ {0,3}---\s*$/
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/
const LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/
const IMAGE = /^\s*!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)\s*$/
const NOTE = /^\s*notes?:\s?(.*)$/i
const TABLE = /^\s*\|/
const HTML = /^\s*<[A-Za-z!/]/

/** Split into slide line-groups on `---` outside fences; a fenced `---` is code. */
function splitSlides(lines: string[]): string[][] {
  const out: string[][] = [[]]
  let fence: { char: string; length: number } | undefined
  for (const line of lines) {
    const marker = FENCE.exec(line)
    if (marker) {
      if (!fence) fence = { char: marker[1][0], length: marker[1].length }
      else if (marker[1][0] === fence.char && marker[1].length >= fence.length && /^\s*$/.test(line.slice(marker[0].length))) fence = undefined
    } else if (!fence && SEPARATOR.test(line)) {
      out.push([])
      continue
    }
    out[out.length - 1].push(line)
  }
  return out
}

function slideOf(lines: string[], n: number, unmapped: DeckUnmapped[]): DeckSlide | null {
  const slide: DeckSlide = { bullets: [], body: [], images: [] }
  // Each unmappable construct is reported ONCE per slide per sort, however
  // many lines it spans — a ten-row table is one thing a person left out.
  const note = (what: string): void => { if (!unmapped.some((u) => u.slide === n && u.what === what)) unmapped.push({ slide: n, what }) }
  let paragraph: string[] = []
  const flush = (): void => {
    if (paragraph.length > 0) slide.body.push(plainInline(paragraph.join(' ')))
    paragraph = []
  }
  let fence: { char: string; length: number } | undefined
  let notes: string[] | undefined
  let content = false
  for (const line of lines) {
    if (notes !== undefined) { notes.push(line); continue }
    const marker = FENCE.exec(line)
    if (fence || marker) {
      if (!fence && marker) { flush(); fence = { char: marker[1][0], length: marker[1].length }; note('code block'); content = true }
      else if (fence && marker && marker[1][0] === fence.char && marker[1].length >= fence.length) fence = undefined
      continue
    }
    if (/^\s*$/.test(line)) { flush(); continue }
    content = true
    const noteLine = NOTE.exec(line)
    if (noteLine) { flush(); notes = [noteLine[1]]; continue }
    const heading = HEADING.exec(line)
    if (heading) {
      flush()
      if (slide.title === undefined) slide.title = plainInline(heading[2])
      else note('extra heading')
      continue
    }
    const image = IMAGE.exec(line)
    if (image) {
      flush()
      if (/^[a-z][a-z0-9+.-]*:/i.test(image[2])) note(`remote image ${image[2]}`)
      else slide.images.push({ alt: image[1], src: image[2] })
      continue
    }
    if (TABLE.test(line)) { flush(); note('table'); continue }
    if (HTML.test(line)) { flush(); note('HTML'); continue }
    const item = LIST.exec(line)
    if (item) {
      flush()
      // Two spaces or a tab per level — the common editors' indent. A tab is
      // counted as two so a mixed file still nests the way it looks.
      const indent = item[1].replace(/\t/g, '  ').length
      slide.bullets.push({ text: plainInline(item[3]), level: Math.min(Math.floor(indent / 2), 4), numbered: /\d/.test(item[2]) })
      continue
    }
    paragraph.push(line.trim())
  }
  flush()
  if (notes !== undefined) {
    const text = notes.join('\n').trim()
    if (text !== '') slide.notes = text
  }
  // A slide that only separates (the blank run between two `---`) is not a
  // slide a person wrote, so it is not counted; one with ONLY unmappable
  // content still is, so the report's slide numbers match the file.
  return content ? slide : null
}

export function parseDeck(value: unknown): DeckParse {
  if (value === undefined) return { kind: 'absent' }
  if (typeof value !== 'string' || value.includes('\0')) return { kind: 'malformed', reason: 'a deck must be Markdown text without NUL bytes' }
  const unmapped: DeckUnmapped[] = []
  const slides: DeckSlide[] = []
  for (const group of splitSlides(value.split(/\r?\n/))) {
    const slide = slideOf(group, slides.length + 1, unmapped)
    if (slide) slides.push(slide)
  }
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
