/**
 * M248. A DECK is a Markdown file read as slides. Pure and plain-node
 * (`verify:deck`): the renderer, the session and main's PDF export all split
 * the file through this one function, so the three cannot disagree about
 * where slide 3 starts.
 *
 * The file is the deck. Nothing here re-serialises a slide nobody changed:
 * every slide carries its source span, and `rebuildDeck` stitches sources back
 * with the file's OWN separators, so a deck with no change is byte-identical
 * (`deck.split.4`, CRLF included).
 */
import { hashText, keep as keepItems, discard as discardItems, type Draft, type DraftItem } from './draft-review'
import { parseMarkdown, type Block, type Inline } from './markdown'

export interface DeckSlide {
  index: number
  /** Source span into the file: [start, end) is the slide, [end, sepEnd) its `---` line. */
  start: number
  end: number
  sepEnd: number
  source: string
  /** The source without HTML comments — what a slide renders. */
  body: string
  /** `<!-- notes … -->` comments, trimmed, in order. Kept in the source. */
  notes: string[]
  hash: string
}

export interface DeckDoc {
  /** The Marp-style `---` … `---` block, kept verbatim; never a slide. */
  frontMatter: { start: number; end: number } | null
  slides: DeckSlide[]
  eol: '\n' | '\r\n'
}

/** One side of a slide change. `index` is the slide's place in ITS deck; `after` (new side only) is the base slide it follows. */
export interface SlideSide { index: number; text: string; after?: number }
export type SlideItem = DraftItem<SlideSide | null>
export type SlideDraft = Draft<SlideSide | null>

export interface DeckView {
  /** The slide on show, zero-based. Absent is the first. */
  slide?: number
  /** An agent's or a workflow's proposal, reviewed per slide. Never exported. */
  draft?: SlideDraft
}

const SEPARATOR = /^---\r?\n?$/
const FENCE = /^ {0,3}(`{3,}|~{3,})/
// Front matter is only front matter when every line inside reads as YAML AND
// at least one is a lowercase `key:` (Marp's directives are): a deck that opens
// with `---` as a plain rule must not lose its first slide. A `#` line is a
// HEADING here, never a YAML comment, and `Agenda: today` is prose (the critic).
const YAMLISH = /^(?:\s*|[a-z_][\w.-]*\s*:(?:\s.*)?|\s+\S.*|\s*-\s.*)\r?\n?$/
const YAML_KEY = /^[a-z_][\w.-]*\s*:(?:\s|$)/

const linesOf = (text: string): string[] => text.match(/[^\n]*\n|[^\n]+$/g) ?? []

export function splitDeck(text: string): DeckDoc {
  const lines = linesOf(text)
  const eol: '\n' | '\r\n' = text.includes('\r\n') ? '\r\n' : '\n'
  let i = 0, offset = 0
  let frontMatter: DeckDoc['frontMatter'] = null
  if (lines.length > 1 && /^---\r?\n$/.test(lines[0])) {
    let end = 0, keyed = false
    for (let k = 1; k < lines.length; k++) {
      if (SEPARATOR.test(lines[k])) { end = k; break }
      if (!YAMLISH.test(lines[k])) break
      if (YAML_KEY.test(lines[k])) keyed = true
    }
    if (end > 0 && keyed) {
      for (let k = 0; k <= end; k++) offset += lines[k].length
      frontMatter = { start: 0, end: offset }
      i = end + 1
    }
  }
  const spans: { start: number; end: number; sepEnd: number }[] = []
  let start = offset
  let fence: { char: string; length: number } | undefined
  for (; i < lines.length; i++) {
    const line = lines[i], lineStart = offset
    offset += line.length
    const marker = FENCE.exec(line)
    // A backtick "fence" whose rest holds a backtick is inline code (CommonMark:
    // an info string may not contain one) — as a fence it swallowed the deck.
    if (marker && !(marker[1][0] === '`' && line.slice(marker[0].length).includes('`'))) {
      // A fence closes only on its own character at no less than its length,
      // with nothing after it: a ```` block holding a ``` block is ONE block.
      if (!fence) fence = { char: marker[1][0], length: marker[1].length }
      else if (marker[1][0] === fence.char && marker[1].length >= fence.length && /^\s*$/.test(line.slice(marker[0].length))) fence = undefined
      continue
    }
    if (!fence && SEPARATOR.test(line)) {
      spans.push({ start, end: lineStart, sepEnd: offset })
      start = offset
    }
  }
  spans.push({ start, end: text.length, sepEnd: text.length })
  const slides = spans.map((span, index): DeckSlide => {
    const source = text.slice(span.start, span.end)
    const notes = [...source.matchAll(/<!--\s*notes\b:?([\s\S]*?)-->/g)].map((m) => m[1].trim())
    return { index, ...span, source, body: source.replace(/<!--[\s\S]*?-->/g, ''), notes, hash: hashText(source) }
  })
  return { frontMatter, slides, eol }
}

/**
 * The file with its slides replaced by `sources`, in order. The front matter
 * and each slide's own separator line are reused by position; a slide that
 * becomes the last drops its separator, one that stops being last gains the
 * file's line ending and a `---`. Same sources in, same bytes out.
 */
export function rebuildDeck(text: string, sources: readonly string[]): string {
  const doc = splitDeck(text)
  const first = doc.slides[0]
  let out = text.slice(0, first.start)
  sources.forEach((source, i) => {
    if (i === sources.length - 1) { out += source; return }
    const own = i < doc.slides.length - 1 ? text.slice(doc.slides[i].end, doc.slides[i].sepEnd) : ''
    const sep = own !== '' && own.endsWith('\n') ? own : `---${doc.eol}`
    out += source + (source === '' || source.endsWith('\n') ? '' : doc.eol) + sep
  })
  return out
}

/** Longest common subsequence over slide hashes: the pairs of [old, new] indices that did not change. */
function anchors(a: readonly DeckSlide[], b: readonly DeckSlide[]): [number, number][] {
  const n = a.length, m = b.length
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    table[i][j] = a[i].hash === b[j].hash ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1])
  }
  const out: [number, number][] = []
  let i = 0, j = 0
  while (i < n && j < m) {
    if (a[i].hash === b[j].hash) { out.push([i, j]); i++; j++ }
    else if (table[i + 1][j] >= table[i][j + 1]) i++
    else j++
  }
  return out
}

/**
 * Per-slide changes, aligned by an LCS on each slide's hash — so inserting
 * slide 2 of 5 is ONE added item rather than four changed ones. Within a gap
 * between unchanged slides, old and new slides pair positionally as changes;
 * the surplus is added or removed. Ids are what a person types: the
 * PROPOSAL's slide number, or `r<n>` for a removed base slide.
 */
export function diffSlides(oldText: string, newText: string): SlideItem[] {
  const a = splitDeck(oldText).slides, b = splitDeck(newText).slides
  const out: SlideItem[] = []
  let pi = -1, pj = -1
  for (const [ai, bj] of [...anchors(a, b), [a.length, b.length] as [number, number]]) {
    const olds = a.slice(pi + 1, ai), news = b.slice(pj + 1, bj)
    const after = olds.length ? olds[olds.length - 1].index : pi
    news.forEach((slide, k) => {
      const nu: SlideSide = { index: slide.index, text: slide.source, after }
      if (k < olds.length) out.push({ id: String(slide.index + 1), old: { index: olds[k].index, text: olds[k].source }, new: nu })
      else out.push({ id: String(slide.index + 1), old: null, new: nu })
    })
    for (const slide of olds.slice(news.length)) out.push({ id: `r${slide.index + 1}`, old: { index: slide.index, text: slide.source }, new: null })
    pi = ai; pj = bj
  }
  return out
}

/** A draft of `proposal` against the disk, or null when the proposal changes nothing. */
export function slideDraft(diskText: string, proposal: string, by?: string, at: number = Date.now()): SlideDraft | null {
  const items = diffSlides(diskText, proposal)
  return items.length === 0 ? null : { baseHash: hashText(diskText), ...(by === undefined ? {} : { by }), at, items }
}

/** The items applied to `text` by position, without asking whether `text` is still the draft's base. */
function applyItems(text: string, items: readonly SlideItem[]): string {
  if (items.length === 0) return text
  const base = splitDeck(text).slides
  const replaced = new Map<number, string>(), removed = new Set<number>(), inserts = new Map<number, SlideSide[]>()
  for (const item of items) {
    if (item.old && item.new) replaced.set(item.old.index, item.new.text)
    else if (item.old) removed.add(item.old.index)
    else if (item.new) inserts.set(item.new.after ?? -1, [...(inserts.get(item.new.after ?? -1) ?? []), item.new])
  }
  const ordered = (at: number): string[] => (inserts.get(at) ?? []).sort((x, y) => x.index - y.index).map((s) => s.text)
  const out: string[] = [...ordered(-1)]
  for (const slide of base) {
    if (!removed.has(slide.index)) out.push(replaced.get(slide.index) ?? slide.source)
    out.push(...ordered(slide.index))
  }
  return rebuildDeck(text, out)
}

export type KeepResult =
  | { kind: 'applied'; text: string; remaining: SlideDraft | null }
  | { kind: 'conflict'; reason: string }
  | { kind: 'refused'; reason: string }

const slideWords = (ids: readonly string[]): string => `slide${ids.length === 1 ? '' : 's'} ${ids.join(', ')}`

/**
 * Splice ONLY the kept slides into the disk text. A disk that no longer hashes
 * to the draft's base is a conflict naming the slides — never a merge, which
 * would put an agent's slide somewhere the person never saw it proposed.
 * The remaining draft is recomputed against the new text, so its ids stay the
 * proposal's slide numbers and its base is the file as now written.
 */
export function applyKept(diskText: string, draft: SlideDraft | null | undefined, ids: readonly string[] | 'all'): KeepResult {
  if (!draft || draft.items.length === 0) return { kind: 'refused', reason: 'there is no proposed change to keep' }
  const unknown = ids === 'all' ? [] : ids.filter((id) => !draft.items.some((item) => item.id === id))
  if (unknown.length) return { kind: 'refused', reason: `no proposed change to ${slideWords(unknown)} — the proposal holds ${slideWords(draft.items.map((i) => i.id))}` }
  const named = ids === 'all' ? draft.items.map((i) => i.id) : [...ids]
  if (hashText(diskText) !== draft.baseHash) {
    return { kind: 'conflict', reason: `the file changed on disk since the proposal — ${slideWords(named)} cannot be kept against it; discard and ask again` }
  }
  const { apply } = keepItems(draft, ids)
  if (apply.length === 0) return { kind: 'applied', text: diskText, remaining: draft }
  const text = applyItems(diskText, apply)
  const remaining = slideDraft(text, applyItems(diskText, draft.items), draft.by, draft.at)
  // Carry each surviving item's ORIGINAL id: a removal is numbered by its base
  // slide, and a keep above it shifts that number — `r5` became `r6` and a
  // person's `discard r5` was refused as unknown (the critic).
  if (remaining) {
    const unused = draft.items.filter((item) => !apply.includes(item))
    remaining.items = remaining.items.map((item) => {
      const at = unused.findIndex((o) => (o.old?.text ?? null) === (item.old?.text ?? null) && (o.new?.text ?? null) === (item.new?.text ?? null))
      if (at < 0) return item
      const [was] = unused.splice(at, 1)
      return { ...item, id: was.id }
    })
  }
  return { kind: 'applied', text, remaining }
}

/** Drop the chosen items; nothing is written. */
export function discardSlides(draft: SlideDraft, ids: readonly string[] | 'all'): { kind: 'discarded'; remaining: SlideDraft | null } | { kind: 'refused'; reason: string } {
  const unknown = ids === 'all' ? [] : ids.filter((id) => !draft.items.some((item) => item.id === id))
  if (unknown.length) return { kind: 'refused', reason: `no proposed change to ${slideWords(unknown)}` }
  return { kind: 'discarded', remaining: discardItems(draft, ids).remaining }
}

/** What the deck would read with every proposed slide kept. */
export function proposalText(diskText: string, draft: SlideDraft | null | undefined): string {
  return draft ? applyItems(diskText, draft.items) : diskText
}

/** The header's fact the body does not carry. */
export function deckSummary(text: string, view: DeckView): string {
  const count = splitDeck(text).slides.length
  return `slide ${Math.min(view.slide ?? 0, count - 1) + 1} of ${count}`
}

/** The draft's count, said only above zero (the rest rule: never a zero-value statement). */
export function deckChanges(view: DeckView): string {
  const n = view.draft?.items.length ?? 0
  return n === 0 ? '' : `${n} slide change${n === 1 ? '' : 's'}`
}

const MAX_TEXT = 2 * 1024 * 1024
function parseSide(raw: unknown, isNew: boolean): SlideSide | null | undefined {
  if (raw === null) return null
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const r = raw as Record<string, unknown>
  if (!Number.isSafeInteger(r.index) || (r.index as number) < 0 || typeof r.text !== 'string' || r.text.length > MAX_TEXT || r.text.includes('\0')) return undefined
  if (isNew && r.after !== undefined && (!Number.isSafeInteger(r.after) || (r.after as number) < -1)) return undefined
  return { index: r.index as number, text: r.text, ...(isNew && r.after !== undefined ? { after: r.after as number } : {}) }
}

/** Absent, malformed and a view are three answers (the parser rule); an unknown key is ignored. */
export function parseDeckView(raw: unknown): { kind: 'absent' } | { kind: 'malformed'; reason: string } | { kind: 'view'; view: DeckView } {
  if (raw === undefined) return { kind: 'absent' }
  const bad = (reason: string): { kind: 'malformed'; reason: string } => ({ kind: 'malformed', reason })
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return bad('a deck view must be an object')
  const value = raw as Record<string, unknown>, view: DeckView = {}
  if (value.slide !== undefined) {
    if (!Number.isSafeInteger(value.slide) || (value.slide as number) < 0) return bad('slide must be a whole number from 0')
    view.slide = value.slide as number
  }
  if (value.draft !== undefined) {
    const d = value.draft as Record<string, unknown> | null
    if (!d || typeof d !== 'object' || typeof d.baseHash !== 'string' || !/^[0-9a-f]{1,64}$/.test(d.baseHash) || typeof d.at !== 'number' || !Number.isFinite(d.at) ||
      (d.by !== undefined && (typeof d.by !== 'string' || d.by === '')) || !Array.isArray(d.items) || d.items.length === 0 || d.items.length > 1000) return bad('draft must carry a base hash, a time and its items')
    const items: SlideItem[] = []
    for (const rawItem of d.items as unknown[]) {
      const it = rawItem as Record<string, unknown> | null
      if (!it || typeof it !== 'object' || typeof it.id !== 'string' || !/^r?\d{1,6}$/.test(it.id)) return bad('a draft item needs a slide id')
      const old = parseSide(it.old, false), nu = parseSide(it.new, true)
      if (old === undefined || nu === undefined || (old === null && nu === null)) return bad(`draft item ${it.id} is malformed`)
      items.push({ id: it.id, old, new: nu })
    }
    view.draft = { baseHash: d.baseHash, ...(d.by === undefined ? {} : { by: d.by as string }), at: d.at, items }
  }
  return { kind: 'view', view }
}

// ---- HTML, for the PDF page (main) ------------------------------------------

export type ImageAnswer = { kind: 'data'; url: string } | { kind: 'missing' }

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
export const isRemoteImage = (src: string): boolean => /^(?:https?:)?\/\//i.test(src)

function inlineHtml(runs: Inline[]): string {
  return runs.map((r) => r.kind === 'text' ? esc(r.text) : r.kind === 'code' ? `<code>${esc(r.text)}</code>`
    : r.kind === 'link' ? `<span class="link">${esc(r.text)}</span>` : r.kind === 'bold' ? `<strong>${inlineHtml(r.children)}</strong>` : `<em>${inlineHtml(r.children)}</em>`).join('')
}

function imageHtml(alt: string, src: string, resolve: (src: string) => ImageAnswer): string {
  // Never fetched: a remote picture in an exported file is a request to a
  // server the person did not choose, at the moment they export.
  if (isRemoteImage(src)) return `<p class="img-missing">remote image not loaded — ${esc(alt || src)}</p>`
  const answer = resolve(src)
  if (answer.kind === 'data' && /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]*$/.test(answer.url)) return `<img alt="${esc(alt)}" src="${answer.url}">`
  return `<p class="img-missing">image not found — ${esc(src)}</p>`
}

/**
 * A slide's body as HTML, from the SAME closed grammar the card renders with
 * `{ slides: true }`. Every text run is escaped; the only `src` this can emit
 * is a data URL the resolver produced.
 */
export function markdownHtml(text: string, resolve: (src: string) => ImageAnswer): string {
  const block = (b: Block): string => {
    switch (b.kind) {
      case 'heading': return `<h${b.level}>${inlineHtml(b.children)}</h${b.level}>`
      case 'list': return `<${b.ordered ? 'ol' : 'ul'}>${b.items.map((it) => `<li>${inlineHtml(it)}</li>`).join('')}</${b.ordered ? 'ol' : 'ul'}>`
      case 'code': return `<pre><code>${esc(b.text)}</code></pre>`
      case 'image': return imageHtml(b.alt, b.src, resolve)
      case 'table': {
        const cell = (tag: string, runs: Inline[], i: number): string => `<${tag}${b.align[i] ? ` style="text-align:${b.align[i]}"` : ''}>${inlineHtml(runs)}</${tag}>`
        return `<table><thead><tr>${b.header.map((c, i) => cell('th', c, i)).join('')}</tr></thead><tbody>${b.rows.map((row) => `<tr>${row.map((c, i) => cell('td', c, i)).join('')}</tr>`).join('')}</tbody></table>`
      }
      default: return `<p>${inlineHtml(b.children)}</p>`
    }
  }
  return parseMarkdown(text, { slides: true }).map(block).join('\n')
}

/** M248. A new deck: two slides, one speaker note — enough to show the grammar. */
export const DECK_SEED = '# Deck\n\nWhat this deck is about.\n\n---\n\n## Second slide\n\n- one point\n- another\n\n<!-- notes What to say on this slide. -->\n'
