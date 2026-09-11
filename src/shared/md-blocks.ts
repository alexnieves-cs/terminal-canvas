/**
 * M250. A note as BLOCKS WITH SOURCE SPANS — the rich editor's whole model.
 *
 * Why not an editor library (ProseMirror, TipTap, Milkdown): each parses
 * Markdown into its own schema and serializes the schema back, and that round
 * trip is where it normalizes — `*` bullets become `-`, `_x_` becomes `*x*`,
 * lines re-wrap, characters re-escape, reference links inline, HTML the schema
 * has no node for is dropped. A note is a file git, other editors and agents
 * also read, so a save that rewrites lines nobody touched is a diff that looks
 * like the person's. See the M250 spec.
 *
 * Instead the blocks TILE the file: every byte, blank runs included, belongs
 * to exactly one block, and a block's `source` is its exact bytes. So
 * `serializeBlocks(parseBlocks(t)) === t` for every input, by construction
 * (`verify:notes notes.roundtrip.1–2`). An edit replaces ONE block's bytes and
 * nothing else (`notes.roundtrip.3`).
 *
 * Two refusals keep "never silently rewritten" true:
 *  - `raw` blocks — everything the editor does not model — carry a NAME and are
 *    never re-serialized; they are edited, if at all, as their own source.
 *  - `editBlock` re-parses the WHOLE document after the splice and refuses the
 *    edit unless every other block is unchanged and the edited block reads back
 *    as the same kind with the same content. That catches every way an edit
 *    could change a construct it cannot represent (a paragraph starting `# `,
 *    a blank line splitting a block, inline HTML, a list item growing a nested
 *    list) without a list of special cases that would drift from the parser.
 *
 * Pure, plain-node. Line terminators are only `\n` and `\r\n`; a lone `\r` is
 * an ordinary character (it round-trips; it is just not a line break here).
 */

export type RawName =
  | 'HTML block' | 'footnote' | 'reference link definition' | 'setext heading' | 'block quote'
  | 'front matter' | 'nested list' | 'multi-line list item' | 'indented code' | 'thematic break'
  | 'unclosed code fence'

export interface ListItemModel { text: string; checked?: boolean }
export interface HeadingModel { level: number; text: string }
export interface ParagraphModel { text: string }
export interface ListModel { items: ListItemModel[] }
export interface TableModel { header: string[]; rows: string[][] }
export interface ImageModel { alt: string; src: string; title?: string }
export interface CodeModel { lang: string; body: string }

interface Span { start: number; end: number; source: string }
interface ListLine { indent: string; marker: string; gap: string; box?: string; text: string; eol: string; source: string }
export type MdBlock = Span & (
  | { kind: 'heading'; model: HeadingModel }
  | { kind: 'paragraph'; model: ParagraphModel }
  | { kind: 'list'; model: ListModel; ordered: boolean; lines: ListLine[] }
  | { kind: 'table'; model: TableModel; delimiter: string; rowSources: string[] }
  | { kind: 'image'; model: ImageModel }
  | { kind: 'code'; model: CodeModel; open: string; close: string }
  | { kind: 'blank' }
  | { kind: 'raw'; name: RawName }
)
export type BlockModel = HeadingModel | ParagraphModel | ListModel | TableModel | ImageModel | CodeModel
export type BlockEdit = { kind: 'edited'; text: string } | { kind: 'refused'; reason: string }

interface Line { start: number; end: number; content: string; eol: string }

function splitLines(text: string): Line[] {
  const out: Line[] = []
  let at = 0
  while (at < text.length) {
    const nl = text.indexOf('\n', at)
    const end = nl === -1 ? text.length : nl + 1
    const raw = text.slice(at, end)
    const eol = raw.endsWith('\r\n') ? '\r\n' : raw.endsWith('\n') ? '\n' : ''
    out.push({ start: at, end, content: raw.slice(0, raw.length - eol.length), eol })
    at = end
  }
  return out
}

const BLANK = /^[ \t]*$/
const FENCE = /^( {0,3})(`{3,}|~{3,})(.*)$/
const THEMATIC = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/
const ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/
const HTML_START = /^ {0,3}<(?:[A-Za-z][A-Za-z0-9-]*(?:[\s/>]|$)|\/[A-Za-z]|!--|![A-Z]|\?)/
const QUOTE = /^ {0,3}>/
const FOOTNOTE_DEF = /^ {0,3}\[\^[^\]]+\]:/
const REF_DEF = /^ {0,3}\[[^\]]+\]:/
const INDENTED = /^(?: {4}|\t)/
const ITEM = /^( {0,3})([-*+]|\d{1,9}[.)])(?:([ \t]+)(.*))?$/
const SETEXT = /^ {0,3}(?:=+|-+)[ \t]*$/
const DELIM = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/
const IMAGE = /^ {0,3}!\[([^\]]*)\]\((?:<([^>\n]*)>|([^\s()<>]+))(?:[ \t]+"([^"]*)")?\)[ \t]*$/
const TASK = /^\[([ xX])\][ \t](.*)$/

/** Split a table row into cells: outer pipes dropped, `\|` is part of a cell, cells trimmed. */
function cells(row: string): string[] {
  let s = row.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1)
  const out: string[] = []
  let cur = ''
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') { cur += '|'; i++; continue }
    if (s[i] === '|') { out.push(cur.trim()); cur = ''; continue }
    cur += s[i]
  }
  out.push(cur.trim())
  return out
}

/** Whether a line starts a block that ends a paragraph without a blank line between. */
function interrupts(content: string): boolean {
  if (FENCE.test(content) || ATX.test(content) || THEMATIC.test(content) || QUOTE.test(content) || HTML_START.test(content)) return true
  const item = ITEM.exec(content)
  // CommonMark: only a non-empty bullet, or an ordered item numbered 1, interrupts a paragraph.
  return item !== null && item[4] !== undefined && item[4].trim() !== '' && (/^[-*+]$/.test(item[2]) || /^1[.)]$/.test(item[2]))
}

function listLine(l: Line): ListLine | null {
  const m = ITEM.exec(l.content)
  if (!m) return null
  const rest = m[4] ?? ''
  const task = TASK.exec(rest)
  return { indent: m[1], marker: m[2], gap: m[3] ?? '', ...(task ? { box: task[1], text: task[2] } : { text: rest }), eol: l.eol, source: l.content + l.eol }
}
const markerFamily = (marker: string): string => /^\d/.test(marker) ? `ol${marker.slice(-1)}` : marker

export function parseBlocks(text: string): MdBlock[] {
  const lines = splitLines(text)
  const out: MdBlock[] = []
  const span = (from: number, to: number): Span => {
    const start = lines[from].start, end = lines[to - 1].end
    return { start, end, source: text.slice(start, end) }
  }
  const raw = (from: number, to: number, name: RawName): number => { out.push({ ...span(from, to), kind: 'raw', name }); return to }
  // Consume a definition's line and its indented continuation lines.
  const definition = (i: number, name: RawName): number => {
    let j = i + 1
    while (j < lines.length && !BLANK.test(lines[j].content) && /^[ \t]+\S/.test(lines[j].content) && !FOOTNOTE_DEF.test(lines[j].content) && !REF_DEF.test(lines[j].content)) j++
    return raw(i, j, name)
  }
  const untilBlank = (i: number): number => { let j = i + 1; while (j < lines.length && !BLANK.test(lines[j].content)) j++; return j }

  let i = 0
  while (i < lines.length) {
    const c = lines[i].content
    // Front matter: only at the very top, and only when it closes.
    if (i === 0 && c === '---') {
      let j = 1
      while (j < lines.length && lines[j].content !== '---' && lines[j].content !== '...') j++
      if (j < lines.length) { i = raw(0, j + 1, 'front matter'); continue }
    }
    if (BLANK.test(c)) {
      let j = i + 1
      while (j < lines.length && BLANK.test(lines[j].content)) j++
      out.push({ ...span(i, j), kind: 'blank' }); i = j; continue
    }
    const fence = FENCE.exec(c)
    if (fence && !(fence[2][0] === '`' && fence[3].includes('`'))) {
      const ch = fence[2][0], len = fence[2].length
      let j = i + 1
      while (j < lines.length) {
        const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(lines[j].content)
        if (close && close[1][0] === ch && close[1].length >= len) break
        j++
      }
      if (j >= lines.length) { i = raw(i, lines.length, 'unclosed code fence'); continue }
      const body = lines.slice(i + 1, j).map((l) => l.content + '\n').join('')
      out.push({ ...span(i, j + 1), kind: 'code', model: { lang: fence[3].trim(), body }, open: c, close: lines[j].content })
      i = j + 1; continue
    }
    if (THEMATIC.test(c)) { i = raw(i, i + 1, 'thematic break'); continue }
    const atx = ATX.exec(c)
    if (atx) { out.push({ ...span(i, i + 1), kind: 'heading', model: { level: atx[1].length, text: (atx[2] ?? '').trim() } }); i++; continue }
    if (HTML_START.test(c)) { i = raw(i, untilBlank(i), 'HTML block'); continue }
    if (QUOTE.test(c)) { i = raw(i, untilBlank(i), 'block quote'); continue }
    if (FOOTNOTE_DEF.test(c)) { i = definition(i, 'footnote'); continue }
    if (REF_DEF.test(c)) { i = definition(i, 'reference link definition'); continue }
    if (INDENTED.test(c)) {
      let j = i + 1
      while (j < lines.length && INDENTED.test(lines[j].content) && !BLANK.test(lines[j].content)) j++
      i = raw(i, j, 'indented code'); continue
    }
    // A table: a header row with a pipe, then a delimiter row with the SAME number of cells.
    if (c.includes('|') && i + 1 < lines.length && DELIM.test(lines[i + 1].content) && lines[i + 1].content.includes('|') &&
        cells(c).length === cells(lines[i + 1].content).length) {
      let j = i + 2
      while (j < lines.length && !BLANK.test(lines[j].content) && lines[j].content.includes('|') && !interrupts(lines[j].content)) j++
      const rows = lines.slice(i + 2, j)
      out.push({ ...span(i, j), kind: 'table', model: { header: cells(c), rows: rows.map((r) => cells(r.content)) }, delimiter: lines[i + 1].content, rowSources: rows.map((r) => r.content + r.eol) })
      i = j; continue
    }
    const first = listLine(lines[i])
    if (first) {
      const family = markerFamily(first.marker)
      const items: ListLine[] = [first]
      let j = i + 1
      let complex: RawName | null = null
      while (j < lines.length) {
        const l = lines[j]
        if (BLANK.test(l.content)) break
        const item = listLine(l)
        if (item && item.indent === first.indent && markerFamily(item.marker) === family && !THEMATIC.test(l.content)) { items.push(item); j++; continue }
        if (item || /^[ \t]+\S/.test(l.content)) { complex = complex ?? 'nested list'; j++; continue }
        if (interrupts(l.content)) break
        // A lazy continuation: the previous item's text runs onto this line.
        complex = complex ?? 'multi-line list item'; j++
      }
      if (complex) { i = raw(i, j, complex); continue }
      out.push({ ...span(i, j), kind: 'list', ordered: /^\d/.test(first.marker), lines: items, model: { items: items.map((it) => ({ text: it.text, ...(it.box === undefined ? {} : { checked: it.box !== ' ' }) })) } })
      i = j; continue
    }
    // A paragraph, unless a setext underline turns it into a heading.
    let j = i + 1
    let setext = false
    while (j < lines.length) {
      const l = lines[j].content
      if (BLANK.test(l)) break
      if (SETEXT.test(l)) { setext = true; j++; break }
      if (interrupts(l)) break
      j++
    }
    if (setext) { i = raw(i, j, 'setext heading'); continue }
    const image = j === i + 1 ? IMAGE.exec(c) : null
    if (image) {
      out.push({ ...span(i, j), kind: 'image', model: { alt: image[1], src: image[2] ?? image[3], ...(image[4] === undefined ? {} : { title: image[4] }) } })
      i = j; continue
    }
    out.push({ ...span(i, j), kind: 'paragraph', model: { text: lines.slice(i, j).map((l) => l.content).join('\n') } })
    i = j
  }
  return out
}

export function serializeBlocks(blocks: readonly MdBlock[]): string {
  return blocks.map((b) => b.source).join('')
}

/** Inline constructs a rich edit cannot carry, checked on the TEXT the model holds. */
function inlineRefusal(text: string): string | undefined {
  if (/<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^>]*)?\/?>|<!--/.test(text)) return "can't edit inline HTML in rich mode"
  if (/\[\^[^\]]+\]/.test(text)) return "can't edit a footnote reference in rich mode"
  if (/\]\[[^\]]*\]/.test(text)) return "can't edit a reference-style link in rich mode"
  if (/(?: {2,}|\\)\n/.test(text)) return "can't edit a hard line break in rich mode"
  return undefined
}

/**
 * Why this block opens as SOURCE in the rich editor, or undefined when it is
 * editable as rich. A raw block's reason is its name; an editable kind whose
 * content holds something its model cannot carry answers the construct.
 */
export function blockRefusal(block: MdBlock): string | undefined {
  switch (block.kind) {
    case 'raw': return `${block.name} — edit as source`
    case 'blank': return 'a blank line has nothing to edit'
    case 'heading': case 'paragraph': return inlineRefusal(block.model.text)
    case 'list': return block.model.items.map((it) => inlineRefusal(it.text)).find((r) => r !== undefined)
    case 'table': return [...block.model.header, ...block.model.rows.flat()].map(inlineRefusal).find((r) => r !== undefined)
    default: return undefined
  }
}

const eolOf = (source: string, text: string): { inner: string; last: string } => {
  const inner = source.includes('\r\n') ? '\r\n' : source.includes('\n') ? '\n' : text.includes('\r\n') ? '\r\n' : '\n'
  return { inner, last: source.endsWith('\n') ? inner : '' }
}

export function mdImageDestination(src: string): string {
  return /[\s()<>]/.test(src) ? `<${src}>` : src
}

function render(block: MdBlock, model: BlockModel, inner: string, last: string): string {
  const join = (rows: string[]): string => rows.join(inner) + last
  switch (block.kind) {
    case 'heading': { const m = model as HeadingModel; return `${'#'.repeat(Math.min(6, Math.max(1, Math.round(m.level))))} ${m.text.trim()}` + last }
    case 'paragraph': return join((model as ParagraphModel).text.split('\n'))
    case 'image': { const m = model as ImageModel; return `![${m.alt}](${mdImageDestination(m.src)}${m.title === undefined ? '' : ` "${m.title}"`})` + last }
    case 'code': {
      const m = model as CodeModel
      const body = m.body === '' || m.body.endsWith('\n') ? m.body : m.body + '\n'
      // The fence line is kept verbatim unless the language changed.
      const fence = /^( {0,3})(`{3,}|~{3,})/.exec(block.open)!
      const open = m.lang === block.model.lang ? block.open : `${fence[1]}${fence[2]}${m.lang}`
      return open + inner + body.replace(/\n/g, inner) + block.close + last
    }
    case 'list': {
      const m = model as ListModel
      const rows = m.items.map((item, k) => {
        const old = block.lines[k], was = block.model.items[k]
        // An untouched item writes its ORIGINAL line: `-   x`, `[X]` and a
        // `3)` numbering stay what they were.
        if (old && was && was.text === item.text && was.checked === item.checked) return old.source.slice(0, old.source.length - old.eol.length)
        const base = old ?? block.lines[block.lines.length - 1]
        let marker = base.marker
        if (!old && /^\d/.test(base.marker)) {
          const prev = parseInt(/^\d+/.exec(block.lines[block.lines.length - 1].marker)![0], 10)
          marker = `${prev + (k - block.lines.length + 1)}${base.marker.slice(-1)}`
        }
        const box = item.checked === undefined ? '' : `[${item.checked ? 'x' : ' '}] `
        return `${base.indent}${marker}${old?.gap || ' '}${box}${item.text}`
      })
      return join(rows)
    }
    case 'table': {
      const m = model as TableModel
      const cell = (t: string): string => t.trim().replace(/\|/g, '\\|')
      const row = (cs: string[]): string => `| ${cs.map(cell).join(' | ')} |`
      const sameWidth = m.header.length === block.model.header.length
      // A new width keeps every existing column's delimiter cell — its
      // alignment (`:--`, `--:`) is a fact the model does not carry, so a
      // regenerated `---` would rewrite it silently — and adds `---` only for
      // the columns that are new.
      const oldDelims = cells(block.delimiter)
      const delimiter = sameWidth ? block.delimiter : `| ${m.header.map((_, k) => oldDelims[k] ?? '---').join(' | ')} |`
      const header = sameWidth && m.header.every((h, k) => h.trim() === block.model.header[k]) ? null : row(m.header)
      const firstLine = block.source.slice(0, block.source.search(/\r?\n|$/))
      const rows = m.rows.map((r, k) => {
        const was = block.model.rows[k]
        return was && sameWidth && r.length === was.length && r.every((c, x) => c.trim() === was[x]) ? block.rowSources[k].replace(/\r?\n$/, '') : row(r)
      })
      return join([header ?? firstLine, delimiter, ...rows])
    }
    default: return block.source
  }
}

/**
 * The source a model WOULD write for this block, without splicing or checking —
 * what the rich editor reopens a refused edit with, so a refusal never loses
 * what was typed (a person's own bytes in the source box are written exactly).
 */
export function renderBlock(block: MdBlock, model: BlockModel, text: string): string {
  const { inner, last } = eolOf(block.source, text)
  return render(block, normalize(block.kind, model), inner, last)
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

/** Normalize what a caller hands in to what the parser would read back. */
function normalize(kind: MdBlock['kind'], model: BlockModel): BlockModel {
  if (kind === 'heading') { const m = model as HeadingModel; return { level: Math.min(6, Math.max(1, Math.round(m.level))), text: m.text.trim() } }
  if (kind === 'table') { const m = model as TableModel; return { header: m.header.map((c) => c.trim()), rows: m.rows.map((r) => r.map((c) => c.trim())) } }
  if (kind === 'list') return { items: (model as ListModel).items.map((it) => ({ text: it.text, ...(it.checked === undefined ? {} : { checked: it.checked }) })) }
  if (kind === 'code') { const m = model as CodeModel; return { lang: m.lang.trim(), body: m.body === '' || m.body.endsWith('\n') ? m.body : m.body + '\n' } }
  if (kind === 'image') { const m = model as ImageModel; return { alt: m.alt, src: m.src, ...(m.title === undefined ? {} : { title: m.title }) } }
  return { text: (model as ParagraphModel).text }
}

/**
 * Replace one block's bytes with its re-serialized model — or refuse, and
 * change nothing. The refusal is decided by READING BACK: the whole document
 * is parsed again, and every other block must be byte-identical and the edited
 * one the same kind holding the same content.
 */
export function editBlock(text: string, index: number, model: BlockModel): BlockEdit {
  const blocks = parseBlocks(text)
  const block = blocks[index]
  if (block === undefined) return { kind: 'refused', reason: 'that block is no longer in this note — it changed; look again' }
  const before = blockRefusal(block)
  if (before !== undefined) return { kind: 'refused', reason: before }
  const { inner, last } = eolOf(block.source, text)
  const wanted = normalize(block.kind, model)
  const source = render(block, wanted, inner, last)
  const next = text.slice(0, block.start) + source + text.slice(block.end)
  const again = parseBlocks(next)
  if (again.length !== blocks.length) return { kind: 'refused', reason: again.length > blocks.length ? 'a blank line or a new block would split this one — use Source' : 'this edit would merge into the next block — use Source' }
  const edited = again[index]
  if (edited.kind !== block.kind) return { kind: 'refused', reason: `this edit would turn the ${block.kind} into ${edited.kind === 'raw' ? `a ${edited.name}` : `a ${edited.kind}`} — use Source` }
  if (!again.every((b, k) => k === index || (b.kind === blocks[k].kind && b.source === blocks[k].source))) return { kind: 'refused', reason: 'this edit would change the blocks around it — use Source' }
  const after = blockRefusal(edited)
  if (after !== undefined) return { kind: 'refused', reason: after }
  if (!('model' in edited) || !same(edited.model, wanted)) return { kind: 'refused', reason: "this text can't be represented in rich mode exactly as typed — use Source" }
  return { kind: 'edited', text: next }
}

/** Replace one block's bytes with exactly what a person typed as its source. */
export function replaceBlockSource(text: string, index: number, source: string): BlockEdit {
  const block = parseBlocks(text)[index]
  if (block === undefined) return { kind: 'refused', reason: 'that block is no longer in this note — it changed; look again' }
  const { inner, last } = eolOf(block.source, text)
  // A typed box without a final newline would glue the next block onto it.
  const bytes = last !== '' && !source.endsWith('\n') ? source + inner : source
  return { kind: 'edited', text: text.slice(0, block.start) + bytes + text.slice(block.end) }
}

/** A new block after `index` (or at the top for -1), separated by blank lines on both sides. */
export function insertBlockAfter(text: string, index: number, source: string): BlockEdit {
  const blocks = parseBlocks(text)
  if (index < -1 || index >= blocks.length) return { kind: 'refused', reason: 'that block is no longer in this note — it changed; look again' }
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const at = index === -1 ? 0 : blocks[index].end
  const body = source.replace(/(\r?\n)+$/, '').replace(/\r?\n/g, eol)
  let head = text.slice(0, at), tail = text.slice(at)
  if (head !== '' && !head.endsWith('\n')) head += eol
  const lead = head === '' || blocks[index]?.kind === 'blank' ? '' : eol
  const nextBlank = blocks[index + 1]?.kind === 'blank'
  const trail = tail === '' || nextBlank ? '' : eol
  return { kind: 'edited', text: head + lead + body + eol + trail + tail }
}

/** Remove one block and the blank run after it (or before it, at the end), so no double gap is left. */
export function removeBlock(text: string, index: number): BlockEdit {
  const blocks = parseBlocks(text)
  const block = blocks[index]
  if (block === undefined || block.kind === 'blank') return { kind: 'refused', reason: 'that block is no longer in this note — it changed; look again' }
  let start = block.start, end = block.end
  if (blocks[index + 1]?.kind === 'blank') end = blocks[index + 1].end
  else if (blocks[index - 1]?.kind === 'blank') start = blocks[index - 1].start
  return { kind: 'edited', text: text.slice(0, start) + text.slice(end) }
}
