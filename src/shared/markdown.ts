/**
 * M167. A SMALL markdown parser over a CLOSED grammar, for the chat's turns.
 *
 * Why not a library: the renderer's CSP is `default-src 'self'`, the brief
 * forbids a new styling dependency, and the assistant's prose needs six
 * things — headings, paragraphs, lists, fenced code, inline code/bold/italic,
 * links as text — not CommonMark. Everything outside the grammar is a
 * paragraph, which is the honest fallback for a transcript: a table renders
 * as its source inside a code block (said here, checked in `md.1`), an image
 * reference as its alt text, raw HTML as text.
 *
 * Pure and plain-node (`verify:rail md.1`). The output is a TREE the node
 * maps to React elements — never a string the node would `innerHTML`.
 */
export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'bold'; children: Inline[] }
  | { kind: 'italic'; children: Inline[] }
  | { kind: 'link'; text: string; href: string }

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; children: Inline[] }
  | { kind: 'paragraph'; children: Inline[] }
  | { kind: 'list'; ordered: boolean; items: Inline[][] }
  | { kind: 'code'; lang: string; text: string }
  /** M248, `{ slides: true }` only. A line that is nothing but an image. */
  | { kind: 'image'; alt: string; src: string }
  /** M248, `{ slides: true }` only. A pipe table with its delimiter row. */
  | { kind: 'table'; header: Inline[][]; align: ('left' | 'center' | 'right' | null)[]; rows: Inline[][][] }

/**
 * M248. The slide grammar is an OPTION, never the default: the chat's grammar
 * (md.1) renders a table as its source and an image as its alt text, and a
 * transcript is not a page. Only the deck asks for `slides`.
 */
export interface MarkdownOptions { slides?: boolean }

const FENCE = /^```\s*([\w+-]*)\s*$/
const HEADING = /^(#{1,3})\s+(.*?)\s*#*\s*$/
const UL = /^\s*[-*]\s+(.*)$/
const OL = /^\s*\d+[.)]\s+(.*)$/
const TABLE = /^\s*\|.*\|\s*$/
// `![alt](src)`, `![alt](<a path with spaces>)`, an optional "title" ignored.
const IMAGE_LINE = /^\s*!\[([^\]]*)\]\((?:<([^>]+)>|([^)\s]+))(?:\s+"[^"]*")?\s*\)\s*$/
const DELIMITER = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/
const cells = (row: string): string[] => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())

export function parseMarkdown(text: string, options: MarkdownOptions = {}): Block[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const out: Block[] = []
  let i = 0
  const flushParagraph = (buf: string[]): void => {
    const joined = buf.join('\n').trim()
    if (joined !== '') out.push({ kind: 'paragraph', children: parseInline(joined) })
  }
  let para: string[] = []
  while (i < lines.length) {
    const line = lines[i]
    if (options.slides) {
      const image = IMAGE_LINE.exec(line)
      if (image) {
        flushParagraph(para); para = []
        out.push({ kind: 'image', alt: image[1], src: image[2] ?? image[3] })
        i += 1
        continue
      }
      if (TABLE.test(line) && i + 1 < lines.length && DELIMITER.test(lines[i + 1]) && lines[i + 1].includes('-')) {
        flushParagraph(para); para = []
        const header = cells(line).map((c) => parseInline(c))
        const align = cells(lines[i + 1]).map((c) => c.startsWith(':') && c.endsWith(':') ? 'center' as const : c.endsWith(':') ? 'right' as const : c.startsWith(':') ? 'left' as const : null)
        const rows: Inline[][][] = []
        i += 2
        while (i < lines.length && TABLE.test(lines[i])) { rows.push(cells(lines[i]).map((c) => parseInline(c))); i += 1 }
        out.push({ kind: 'table', header, align, rows })
        continue
      }
    }
    const fence = FENCE.exec(line)
    if (fence) {
      flushParagraph(para); para = []
      const lang = fence[1]
      const body: string[] = []
      i += 1
      while (i < lines.length && !/^```\s*$/.test(lines[i])) { body.push(lines[i]); i += 1 }
      i += 1 // the closing fence, or past the end (an unclosed fence is still code)
      out.push({ kind: 'code', lang, text: body.join('\n') })
      continue
    }
    const heading = HEADING.exec(line)
    if (heading) {
      flushParagraph(para); para = []
      out.push({ kind: 'heading', level: heading[1].length as 1 | 2 | 3, children: parseInline(heading[2].trim()) })
      i += 1
      continue
    }
    if (UL.test(line) || OL.test(line)) {
      flushParagraph(para); para = []
      const ordered = OL.test(line)
      const items: Inline[][] = []
      while (i < lines.length) {
        const m = ordered ? OL.exec(lines[i]) : UL.exec(lines[i])
        if (!m) break
        items.push(parseInline(m[1].trim()))
        i += 1
      }
      out.push({ kind: 'list', ordered, items })
      continue
    }
    if (TABLE.test(line)) {
      // A table is outside the grammar: its source, as code, rather than a
      // paragraph of pipes.
      flushParagraph(para); para = []
      const body: string[] = []
      while (i < lines.length && TABLE.test(lines[i])) { body.push(lines[i]); i += 1 }
      out.push({ kind: 'code', lang: '', text: body.join('\n') })
      continue
    }
    if (line.trim() === '') {
      flushParagraph(para); para = []
      i += 1
      continue
    }
    para.push(line)
    i += 1
  }
  flushParagraph(para)
  return out
}

/**
 * Inline runs. A CODE SPAN is found first and nothing inside it is markup:
 * the emphasis and link candidates are searched only in the text BEFORE the
 * earliest code span (the Act II critic measured `2 * 3 = \`6 * 1\`` eating
 * the span). A link's URL may hold one level of balanced parentheses
 * (`Foo_(bar)`); `***x***` is a bound (an italic star, a bold, a star).
 */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  let rest = text
  const pushText = (t: string): void => { if (t !== '') out.push({ kind: 'text', text: t }) }
  while (rest.length > 0) {
    const code = /`([^`]+)`/.exec(rest)
    const before = code ? rest.slice(0, code.index) : rest
    const image = /!\[([^\]]*)\]\([^)]*\)/.exec(before)
    const link = /\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/.exec(before)
    const bold = /\*\*([^*]+)\*\*/.exec(before)
    const italic = /(^|[^*])\*([^*\n]+)\*(?!\*)/.exec(before)
    const candidates = [
      image ? { at: image.index, len: image[0].length, node: { kind: 'text', text: image[1] } as Inline } : null,
      link && (!image || link.index !== image.index + 1) ? { at: link.index, len: link[0].length, node: { kind: 'link', text: link[1], href: link[2] } as Inline } : null,
      bold ? { at: bold.index, len: bold[0].length, node: { kind: 'bold', children: parseInline(bold[1]) } as Inline } : null,
      italic ? { at: italic.index + italic[1].length, len: italic[0].length - italic[1].length, node: { kind: 'italic', children: parseInline(italic[2]) } as Inline } : null
    ].filter((c): c is { at: number; len: number; node: Inline } => c !== null)
    if (candidates.length === 0) {
      if (!code) { pushText(rest); break }
      pushText(before)
      out.push({ kind: 'code', text: code[1] })
      rest = rest.slice(code.index + code[0].length)
      continue
    }
    candidates.sort((a, b) => a.at - b.at)
    const first = candidates[0]
    pushText(rest.slice(0, first.at))
    out.push(first.node)
    rest = rest.slice(first.at + first.len)
  }
  return out
}

/**
 * The tree's text for a plain-node check: blocks joined by a blank line, list
 * items by a newline, a fence's text as it is. It is NOT the DOM's textContent
 * (which joins with nothing); a check on the DOM reads `includes`, never
 * equality against this.
 */
export function plainText(blocks: Block[]): string {
  const inl = (runs: Inline[]): string => runs.map((r) => r.kind === 'text' || r.kind === 'code' ? r.text : r.kind === 'link' ? r.text : inl(r.children)).join('')
  return blocks.map((b) => b.kind === 'code' ? b.text : b.kind === 'list' ? b.items.map(inl).join('\n') : b.kind === 'image' ? b.alt
    : b.kind === 'table' ? [b.header, ...b.rows].map((row) => row.map(inl).join('\t')).join('\n') : inl(b.children)).join('\n\n')
}
