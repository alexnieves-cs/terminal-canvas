/**
 * M389. MERMAID FLOWCHART TEXT, IN AND OUT — the flowchart's text door.
 *
 * `parseMermaid` reads a Mermaid flowchart into the graph view of
 * flowchart.ts; `serializeMermaid` writes one back; `looksLikeMermaid` is the
 * paste handler's cheap sniff; `mermaidImportSentence` is the one line a
 * person reads after an import.
 *
 * THE INPUT IS UNTRUSTED. It may have come from an agent, or from a page an
 * agent read. So the parser NEVER evaluates: `click A callback` is a counted
 * drop, not a handler; `style`, `classDef` and friends are dropped by name;
 * an HTML tag in a label is stripped, never kept. Everything left out is
 * COUNTED in `dropped` (lines the importer did not use) or `approximated`
 * (things it kept but drew as something else), because an import that silently
 * lost half a diagram reads exactly like an import that worked
 * (docs/load-bearing.md, the "silent" rule).
 *
 * BOUNDED AND LINEAR. Statements are cut by a one-pass scanner and read by a
 * hand-written left-to-right reader — no giant backtracking regex, no retry
 * from the next character when a shape fails to close. A failed statement is
 * dropped whole, so a hostile line costs one pass over itself. The caps
 * (characters, statements, nodes, edges) are exported so the check file and
 * any caller quote the same numbers.
 *
 * Pure: no DOM, no node, no dependencies (there is no mermaid package here and
 * there must not be one — that parser evaluates).
 */

import { CONNECTOR_LABEL_MAX, SHAPE_SIZE, normaliseShapeText } from './flowchart'
import type { Ends, FlowDirection, FlowEdge, FlowGraph, FlowGroup, FlowNode, ShapeForm } from './flowchart'

// ── Bounds ──────────────────────────────────────────────────────────────────

export const MERMAID_MAX_CHARS = 200_000
export const MERMAID_MAX_NODES = 500
export const MERMAID_MAX_EDGES = 1500
/** One statement. Longer than this is not a hand-drawn line; it is dropped, never read. */
export const MERMAID_MAX_STATEMENT = 10_000
/** A node id longer than this is not an id. */
const MAX_ID = 200
/** Drops plus approximations. A cap so a hostile file cannot make a list of a hundred thousand entries. */
const MAX_NOTES = 10_000
const DROP_TEXT_MAX = 120
/** `#quot;` is 4, `#x1F600;` is 6; longer than this is not an entity, and the bound keeps the lookahead O(1). */
const ENTITY_MAX = 10
/** How far into a paste the sniff looks. */
const SNIFF_CHARS = 20_000

export interface MermaidDrop {
  /** 1-based. */
  line: number
  /** The statement, trimmed and capped at 120 characters. */
  text: string
  reason: string
}

export type MermaidParse =
  | { kind: 'ok'; graph: FlowGraph; dropped: MermaidDrop[]; approximated: MermaidDrop[]; title?: string }
  | { kind: 'refused'; reason: string }

/** Thrown inside the parse when a bound is crossed, caught once at the top: a refusal has no partial result. */
class Refusal extends Error {}

// ── Characters ──────────────────────────────────────────────────────────────

const isDigit = (c: number): boolean => c >= 48 && c <= 57
const isAlpha = (c: number): boolean => (c >= 65 && c <= 90) || (c >= 97 && c <= 122)
const isAlnum = (c: number): boolean => isAlpha(c) || isDigit(c)

/** What `String.prototype.trim` calls whitespace, so a trimmed statement and a scanned one agree. */
function isSpaceCode(c: number): boolean {
  return c === 32 || (c >= 9 && c <= 13) || c === 0xa0 || c === 0x1680 || (c >= 0x2000 && c <= 0x200a) ||
    c === 0x2028 || c === 0x2029 || c === 0x202f || c === 0x205f || c === 0x3000 || c === 0xfeff
}

function skipWs(s: string, i: number): number {
  while (i < s.length && isSpaceCode(s.charCodeAt(i))) i++
  return i
}

function skipRun(s: string, i: number, ch: string): number {
  while (s[i] === ch) i++
  return i
}

/**
 * The end of a node id starting at `i`. Mermaid's own rule: letters, digits,
 * `_`, `.`, anything non-ASCII, and a `-` only when it is not the start of an
 * arrow (`A-->B` is A then an arrow, `a-b` is one id). A `.` is an id
 * character, but a `-` before it is not (`A-.->B`).
 */
function readIdEnd(s: string, i: number): number {
  let j = i
  while (j < s.length) {
    const c = s.charCodeAt(j)
    if (isAlnum(c) || c === 95 || c === 46 || (c > 127 && !isSpaceCode(c))) { j++; continue }
    if (c === 45) {
      const n = s.charCodeAt(j + 1)
      if (n === 62 || n === 45 || n === 46) break
      j++
      continue
    }
    break
  }
  return j
}

/** Whether the character at `i` continues an id — `--o` is a circle head only when nothing id-like follows it. */
function isIdCharAt(s: string, i: number): boolean {
  if (i >= s.length) return false
  const c = s.charCodeAt(i)
  return isAlnum(c) || c === 95 || (c > 127 && !isSpaceCode(c))
}

function capText(text: string): string {
  return text.slice(0, DROP_TEXT_MAX)
}

// ── Entities and labels ─────────────────────────────────────────────────────

/**
 * The `;` that ends an entity starting at the `#` at `i`, or -1. ONE predicate
 * for three readers — the statement splitter (a `;` that ends `#quot;` must not
 * split), the label decoder, and the serializer's `#` escape — because the
 * three disagreeing is how a round trip silently turns `#35;` into `#`.
 */
function entityEnd(s: string, i: number): number {
  let j = i + 1
  const limit = Math.min(s.length, i + 1 + ENTITY_MAX)
  while (j < limit && isAlnum(s.charCodeAt(j))) j++
  return j > i + 1 && s.charCodeAt(j) === 59 ? j : -1
}

const NAMED_ENTITIES: ReadonlyMap<string, string> = new Map([
  ['quot', '"'], ['amp', '&'], ['lt', '<'], ['gt', '>'], ['apos', "'"], ['nbsp', '\u00a0'], ['semi', ';']
])

function decodeEntity(name: string): string | undefined {
  const named = NAMED_ENTITIES.get(name)
  if (named !== undefined) return named
  let code = NaN
  if (/^[0-9]+$/.test(name)) code = parseInt(name, 10)
  else if (/^[xX][0-9a-fA-F]+$/.test(name)) code = parseInt(name.slice(1), 16)
  // Control characters, surrogates and line separators are not text a label should be able to smuggle in.
  if (!(code >= 32 && code <= 0x10ffff) || (code >= 0x7f && code <= 0x9f) || (code >= 0xd800 && code <= 0xdfff) || code === 0x2028 || code === 0x2029) return undefined
  return String.fromCodePoint(code)
}

/** An HTML tag at `i` (`<br/>`, `<b>`, `</span>`), or null. The lookahead is bounded: `<a<a<a…` must stay linear. */
function matchTag(t: string, i: number): { end: number; br: boolean } | null {
  const c = t.charCodeAt(i + 1)
  if (!(isAlpha(c) || c === 47 || c === 33)) return null
  const limit = Math.min(t.length, i + 200)
  for (let k = i + 1; k < limit; k++) {
    const ch = t.charCodeAt(k)
    if (ch === 60) return null
    if (ch === 62) {
      let inner = t.slice(i + 1, k).trim()
      if (inner.endsWith('/')) inner = inner.slice(0, -1).trim()
      return { end: k + 1, br: inner.toLowerCase() === 'br' }
    }
  }
  return null
}

interface Decoded { text: string; stripped: boolean }

/**
 * A label as the canvas stores it. Order matters: tags FIRST, entities second —
 * `#lt;b#gt;` must come out as the literal text `<b>`, not be stripped as a tag
 * a decode created. `quoted` means the caller already took the quotes off and
 * the inside is verbatim (a quoted label keeps its own spaces; an unquoted one
 * is trimmed).
 */
function decodeLabel(raw: string, quoted: boolean): Decoded {
  let t = quoted ? raw : raw.trim()
  // A markdown string is a quoted label whose inside is wrapped in backticks.
  if (quoted && t.length >= 2 && t.charCodeAt(0) === 96 && t.charCodeAt(t.length - 1) === 96) t = t.slice(1, -1)
  let stripped = false
  let withBreaks = ''
  for (let i = 0; i < t.length; i++) {
    if (t.charCodeAt(i) === 60) {
      const tag = matchTag(t, i)
      if (tag) {
        if (tag.br) withBreaks += '\n'
        else stripped = true
        i = tag.end - 1
        continue
      }
    }
    withBreaks += t[i]
  }
  let out = ''
  for (let i = 0; i < withBreaks.length; i++) {
    if (withBreaks.charCodeAt(i) === 35) {
      const end = entityEnd(withBreaks, i)
      if (end >= 0) {
        const decoded = decodeEntity(withBreaks.slice(i + 1, end))
        if (decoded !== undefined) { out += decoded; i = end; continue }
      }
    }
    out += withBreaks[i]
  }
  return { text: normaliseShapeText(out), stripped }
}

/** A connector's label: decoded, then held to what parseConnectors holds it to (trimmed, capped). */
function decodeEdgeLabel(raw: string, quoted: boolean): { label?: string; stripped: boolean } {
  const d = decodeLabel(raw, quoted)
  const label = d.text.trim().slice(0, CONNECTOR_LABEL_MAX)
  return label === '' ? { stripped: d.stripped } : { label, stripped: d.stripped }
}

// ── The header ──────────────────────────────────────────────────────────────

const DIRECTIONS: ReadonlyMap<string, FlowDirection> = new Map([['TD', 'TB'], ['TB', 'TB'], ['BT', 'BT'], ['LR', 'LR'], ['RL', 'RL']])

/** Diagram types a person might paste by mistake — named in the refusal so it says WHAT it was given. */
const OTHER_DIAGRAMS: ReadonlySet<string> = new Set([
  'sequencediagram', 'classdiagram', 'statediagram', 'erdiagram', 'journey', 'gantt', 'pie', 'quadrantchart',
  'requirementdiagram', 'gitgraph', 'mindmap', 'timeline', 'sankey', 'xychart', 'block', 'packet', 'kanban',
  'architecture', 'c4context', 'c4container', 'c4component', 'c4dynamic', 'c4deployment', 'zenuml', 'radar', 'treemap'
])

type Header =
  | { ok: true; direction: FlowDirection; /** index of the header's own line */ at: number; /** what follows the direction on that line */ rest: string; title?: string }
  | { ok: false; reason: string }

function skipBlank(lines: string[], from: number): number {
  let i = from
  while (i < lines.length) {
    const t = lines[i].trim()
    if (t !== '' && !t.startsWith('%%')) break
    i++
  }
  return i
}

/** `title: X`, `title: "X"` or `title: 'X'` in a front-matter line, else undefined. */
function frontMatterTitle(line: string): string | undefined {
  if (!line.startsWith('title')) return undefined
  let i = skipWs(line, 5)
  if (line[i] !== ':') return undefined
  i = skipWs(line, i + 1)
  let value = line.slice(i).trim()
  if (value.length >= 2 && value[0] === '"' && value[value.length - 1] === '"') value = value.slice(1, -1).replace(/\\(["\\])/g, '$1')
  else if (value.length >= 2 && value[0] === "'" && value[value.length - 1] === "'") value = value.slice(1, -1).replace(/''/g, "'")
  value = value.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200)
  return value === '' ? undefined : value
}

/**
 * Blank lines, `%%` comments and one YAML front-matter block may precede the
 * header. ONE function for `parseMermaid` and `looksLikeMermaid`, so the sniff
 * can never say yes to something the parser then refuses at the header.
 */
function scanHeader(lines: string[]): Header {
  let i = skipBlank(lines, 0)
  let title: string | undefined
  if (i < lines.length && lines[i].trim() === '---') {
    let j = i + 1
    while (j < lines.length && lines[j].trim() !== '---') {
      const t = frontMatterTitle(lines[j])
      if (t !== undefined) title = t
      j++
    }
    if (j >= lines.length) return { ok: false, reason: 'the front matter (---) is never closed' }
    i = skipBlank(lines, j + 1)
  }
  if (i >= lines.length) return { ok: false, reason: 'this is empty, not a flowchart' }
  const line = lines[i].trim()
  let wordEnd = 0
  while (wordEnd < line.length && isAlpha(line.charCodeAt(wordEnd))) wordEnd++
  const word = line.slice(0, wordEnd)
  const after = line.charCodeAt(wordEnd)
  const boundary = Number.isNaN(after) || isSpaceCode(after) || after === 59
  if ((word === 'flowchart' || word === 'graph') && boundary) {
    let p = skipWs(line, wordEnd)
    let direction: FlowDirection = 'TB'
    let dEnd = p
    while (dEnd < line.length && isAlpha(line.charCodeAt(dEnd))) dEnd++
    const named = DIRECTIONS.get(line.slice(p, dEnd).toUpperCase())
    const dAfter = line.charCodeAt(dEnd)
    if (named !== undefined && (Number.isNaN(dAfter) || isSpaceCode(dAfter) || dAfter === 59)) { direction = named; p = dEnd }
    const head: Header = { ok: true, direction, at: i, rest: line.slice(p) }
    if (title !== undefined) head.title = title
    return head
  }
  // Name what it is. An identifier-looking first word that is a known diagram type is a sentence a person understands.
  let idEnd = 0
  while (idEnd < line.length && (isAlnum(line.charCodeAt(idEnd)) || line[idEnd] === '-')) idEnd++
  const first = line.slice(0, idEnd)
  if (first !== '' && OTHER_DIAGRAMS.has(first.toLowerCase().replace(/-(beta|v2)$/, ''))) return { ok: false, reason: `this is a ${first}, not a flowchart` }
  return { ok: false, reason: `this is not a flowchart — it starts with "${line.slice(0, 40)}${line.length > 40 ? '…' : ''}" instead of flowchart or graph` }
}

/** Cheap sniff for a paste handler: does the first meaningful line open a flowchart? */
export function looksLikeMermaid(text: string): boolean {
  if (typeof text !== 'string') return false
  return scanHeader(text.slice(0, SNIFF_CHARS).replace(/\r\n?/g, '\n').split('\n')).ok
}

// ── Statements ──────────────────────────────────────────────────────────────

interface Stmt { line: number; text: string }

/**
 * One line into statements: cut at `;` and at `%%` — but never inside a quoted
 * label, and never at the `;` that ends an entity (`#quot;`). Quote state
 * resets each line; an unbalanced quote costs its own line, not the rest of the
 * text. One pass.
 */
function splitLine(s: string, line: number, out: Stmt[]): void {
  let start = 0
  let inQuote = false
  const push = (end: number): void => {
    const text = s.slice(start, end).trim()
    if (text !== '') out.push({ line, text })
  }
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c === 34) { inQuote = !inQuote; continue }
    if (inQuote) continue
    if (c === 37 && s.charCodeAt(i + 1) === 37) { push(i); return }
    if (c === 35) {
      const end = entityEnd(s, i)
      if (end >= 0) i = end
      continue
    }
    if (c === 59) { push(i); start = i + 1 }
  }
  push(s.length)
}

// ── Reading one statement ───────────────────────────────────────────────────

interface Shape { form: ShapeForm; text: string; /** approximations this declaration carries, recorded only if it is the one that takes effect */ notes: string[] }
interface PlanNode { id: string; shape?: Shape; cls: boolean }
interface Arrow { ends: Ends; dashed: boolean; thick: boolean; heads: boolean; invisible: boolean; label?: string; stripped: boolean }
interface Plan { groups: PlanNode[][]; arrows: Arrow[] }

const NOTE_TAGS = 'HTML tags in a label were removed'
const NOTE_CYLINDER = 'a cylinder (database) is drawn as a document'
const NOTE_TRAPEZOID = 'a trapezoid is drawn as a process'
const NOTE_HEXAGON = 'a hexagon is drawn as a process'
const NOTE_ASYMMETRIC = 'an asymmetric shape is drawn as a process'
const NOTE_DOUBLE_CIRCLE = 'a double circle is drawn as a start / end'
const NOTE_THICK = 'thick lines are drawn at normal weight'
const NOTE_HEADS = 'circle and cross arrowheads are drawn as plain arrowheads'
const NOTE_NESTED = 'a nested subgraph is flattened — its shapes belong to the innermost group only'
const NOTE_UNCLOSED = 'a subgraph was never closed with end — closed at the end of the text'
const NOTE_TWICE = 'declared twice with a different shape or text — the first is kept'

interface Found { raw: string; quoted: boolean; closer: string; next: number }

function findCloser(s: string, from: number, closers: readonly string[]): { idx: number; closer: string } | null {
  for (let i = from; i < s.length; i++) {
    const c = s.charCodeAt(i)
    for (const closer of closers) if (c === closer.charCodeAt(0) && s.startsWith(closer, i)) return { idx: i, closer }
  }
  return null
}

/**
 * The text between an opener (already consumed, `p` is just past it) and its
 * closer. A quoted text may contain the closer characters — `A["a]b"]` — so
 * the quote is tried first; when a quote is not the whole text it falls back to
 * "up to the first closer" and keeps the quotes as literal text. Never a retry
 * from the next character: one look at the quote, one scan for the closer.
 */
function readShapeText(s: string, p: number, closers: readonly string[]): Found | null {
  const q = skipWs(s, p)
  if (s.charCodeAt(q) === 34) {
    const qe = s.indexOf('"', q + 1)
    if (qe >= 0) {
      const after = skipWs(s, qe + 1)
      for (const closer of closers) if (s.startsWith(closer, after)) return { raw: s.slice(q + 1, qe), quoted: true, closer, next: after + closer.length }
    }
  }
  const hit = findCloser(s, p, closers)
  if (!hit) return null
  return { raw: s.slice(p, hit.idx), quoted: false, closer: hit.closer, next: hit.idx + hit.closer.length }
}

interface Pick { form: ShapeForm; note?: string }

function shapeOf(decoded: Decoded, pick: Pick): Shape {
  const notes: string[] = []
  if (pick.note) notes.push(pick.note)
  if (decoded.stripped) notes.push(NOTE_TAGS)
  return { form: pick.form, text: decoded.text, notes }
}

/** `[ ( {` shapes. `j` is at the opener. */
function readBracketShape(s: string, j: number): { shape: Shape; next: number } | null {
  const c = s[j]
  const n1 = s[j + 1]
  const n2 = s[j + 2]
  let open = 1
  let closers: readonly string[]
  let pick: (closer: string, text: string) => Pick
  if (c === '[') {
    if (n1 === '[') { open = 2; closers = [']]']; pick = () => ({ form: 'subprocess' }) }
    else if (n1 === '(') { open = 2; closers = [')]']; pick = () => ({ form: 'document', note: NOTE_CYLINDER }) }
    else if (n1 === '/' || n1 === '\\') {
      // The parallelogram slants the way it opens and closes; opening one way and closing the other is a trapezoid.
      open = 2
      const slant = n1
      closers = slant === '/' ? ['/]', '\\]'] : ['\\]', '/]']
      pick = (closer) => (closer[0] === slant ? { form: 'io' } : { form: 'process', note: NOTE_TRAPEZOID })
    } else { closers = [']']; pick = () => ({ form: 'process' }) }
  } else if (c === '(') {
    if (n1 === '(' && n2 === '(') { open = 3; closers = [')))']; pick = () => ({ form: 'terminator', note: NOTE_DOUBLE_CIRCLE }) }
    // A circle with no text is the flowchart's junction — a point where lines meet.
    else if (n1 === '(') { open = 2; closers = ['))']; pick = (_closer, text) => ({ form: text === '' ? 'junction' : 'terminator' }) }
    else if (n1 === '[') { open = 2; closers = ['])']; pick = () => ({ form: 'terminator' }) }
    else { closers = [')']; pick = () => ({ form: 'terminator' }) }
  } else {
    if (n1 === '{') { open = 2; closers = ['}}']; pick = () => ({ form: 'process', note: NOTE_HEXAGON }) }
    else { closers = ['}']; pick = () => ({ form: 'decision' }) }
  }
  const found = readShapeText(s, j + open, closers)
  if (!found) return null
  const decoded = decodeLabel(found.raw, found.quoted)
  return { shape: shapeOf(decoded, pick(found.closer, decoded.text)), next: found.next }
}

interface V11Shape { form: ShapeForm; note?: string; circle?: true }

/** Mermaid v11 `@{ shape: … }` names. An unknown name is a process with a note that names it, never a refusal. */
const V11_SHAPES: ReadonlyMap<string, V11Shape> = new Map<string, V11Shape>([
  ...['rect', 'rectangle', 'proc', 'process', 'rounded', 'event'].map((n): [string, V11Shape] => [n, { form: 'process' }]),
  ...['stadium', 'terminal', 'pill'].map((n): [string, V11Shape] => [n, { form: 'terminator' }]),
  ...['circle', 'circ'].map((n): [string, V11Shape] => [n, { form: 'terminator', circle: true }]),
  ...['sm-circ', 'small-circle', 'start', 'stop', 'junction', 'f-circ', 'filled-circle'].map((n): [string, V11Shape] => [n, { form: 'junction' }]),
  ...['diam', 'decision', 'diamond', 'question'].map((n): [string, V11Shape] => [n, { form: 'decision' }]),
  ...['lean-r', 'lean-right', 'in-out', 'lean-l', 'lean-left', 'out-in'].map((n): [string, V11Shape] => [n, { form: 'io' }]),
  ...['subproc', 'subprocess', 'subroutine', 'fr-rect', 'framed-rectangle'].map((n): [string, V11Shape] => [n, { form: 'subprocess' }]),
  ...['doc', 'document', 'docs', 'documents', 'st-doc'].map((n): [string, V11Shape] => [n, { form: 'document' }]),
  ...['cyl', 'database', 'db'].map((n): [string, V11Shape] => [n, { form: 'document', note: NOTE_CYLINDER }]),
  ['text', { form: 'text' }],
  ...['hex', 'hexagon', 'prepare'].map((n): [string, V11Shape] => [n, { form: 'process', note: NOTE_HEXAGON }])
])

/**
 * `@{ shape: rect, label: "x" }` — `p` is at the `{`. Keys in any order, values
 * quoted or bare, unknown keys ignored. A block with neither `shape` nor
 * `label` is an edge-property block (`e1@{ animate: true }`), not a node, so
 * it is not read as one.
 */
function readShapeBlock(s: string, p: number, id: string): { shape: Shape; next: number } | null {
  let i = p + 1
  let name: string | undefined
  let label: Decoded | undefined
  for (;;) {
    i = skipWs(s, i)
    const c = s[i]
    if (c === undefined) return null
    if (c === '}') { i++; break }
    if (c === ',') { i++; continue }
    const keyStart = i
    while (i < s.length && (isAlnum(s.charCodeAt(i)) || s[i] === '_')) i++
    if (i === keyStart) return null
    const key = s.slice(keyStart, i).toLowerCase()
    i = skipWs(s, i)
    if (s[i] !== ':') return null
    i = skipWs(s, i + 1)
    let value: string
    let quoted = false
    const qc = s[i]
    if (qc === '"' || qc === "'") {
      const e = s.indexOf(qc, i + 1)
      if (e < 0) return null
      value = s.slice(i + 1, e)
      quoted = true
      i = e + 1
    } else {
      const vs = i
      while (i < s.length && s[i] !== ',' && s[i] !== '}') i++
      value = s.slice(vs, i).trim()
    }
    if (key === 'shape') name = value.trim().toLowerCase()
    else if (key === 'label') label = decodeLabel(value, quoted)
  }
  if (name === undefined && label === undefined) return null
  const shapeName = name ?? 'rect'
  const known = V11_SHAPES.get(shapeName)
  const notes: string[] = []
  let form: ShapeForm = known ? known.form : 'process'
  if (known?.note) notes.push(known.note)
  if (!known) notes.push(`the shape "${shapeName.replace(/[^\w.-]/g, '').slice(0, 40) || '?'}" is drawn as a process`)
  // A circle with an explicitly empty label is a junction; with no label at all it wears its id like any bare node.
  if (known?.circle && label !== undefined && label.text === '') form = 'junction'
  const text = label !== undefined ? label.text : form === 'junction' ? '' : normaliseShapeText(id)
  if (label?.stripped) notes.push(NOTE_TAGS)
  return { shape: { form, text, notes }, next: i }
}

function readNode(s: string, from: number): { node: PlanNode; next: number } | null {
  const start = skipWs(s, from)
  const end = readIdEnd(s, start)
  if (end === start || end - start > MAX_ID) return null
  const id = s.slice(start, end)
  let shape: Shape | undefined
  let i = end
  if (s[i] === '@' && s[i + 1] === '{') {
    const r = readShapeBlock(s, i + 1, id)
    if (!r) return null
    shape = r.shape
    i = r.next
  } else {
    const j = skipWs(s, i)
    if (s[j] === '[' || s[j] === '(' || s[j] === '{') {
      const r = readBracketShape(s, j)
      if (!r) return null
      shape = r.shape
      i = r.next
    } else if (s[i] === '>') {
      // Asymmetric `A>text]`. Only glued to the id: a `>` after a space is never a shape.
      const found = readShapeText(s, i + 1, [']'])
      if (!found) return null
      shape = shapeOf(decodeLabel(found.raw, found.quoted), { form: 'process', note: NOTE_ASYMMETRIC })
      i = found.next
    }
  }
  let cls = false
  if (s.startsWith(':::', i)) {
    const e = readIdEnd(s, i + 3)
    if (e === i + 3) return null
    cls = true
    i = e
  }
  return { node: { id, shape, cls }, next: i }
}

/** `A & B & C` — one side of an edge. */
function readGroup(s: string, from: number): { nodes: PlanNode[]; next: number } | null {
  const nodes: PlanNode[] = []
  let i = from
  for (;;) {
    const n = readNode(s, i)
    if (!n) return null
    nodes.push(n.node)
    i = skipWs(s, n.next)
    if (s[i] !== '&') return { nodes, next: i }
    i++
  }
}

type Side = 'none' | 'arrow' | 'head'
interface Term { next: number; right: Side }

/** A `-` or `=` run that ends a label-form arrow: `-->`, `--x`, `---`, `==>`. `s[j]` is the run's first character. */
function runTerm(s: string, j: number, ch: string): Term | null {
  const e = skipRun(s, j, ch)
  const k = e - j
  const nx = s[e]
  if (k >= 2 && nx === '>') return { next: e + 1, right: 'arrow' }
  if (k >= 2 && (nx === 'o' || nx === 'x') && !isIdCharAt(s, e + 1)) return { next: e + 1, right: 'head' }
  if (k >= 3) return { next: e, right: 'none' }
  return null
}

/** The end of a dotted label-form arrow: `.->` or `.-`. */
function dotTerm(s: string, j: number): Term | null {
  const e = skipRun(s, j, '.')
  if (s[e] !== '-') return null
  if (s[e + 1] === '>') return { next: e + 2, right: 'arrow' }
  return { next: e + 1, right: 'none' }
}

interface Labelled { raw: string; quoted: boolean; term: Term }

/**
 * The text of a label-form arrow (`-- text -->`, `-. text .->`, `== text ==>`)
 * and the terminator that ends it. `lead` is the terminator's first character.
 * Runs are skipped whole on a miss, so every character is looked at once.
 */
function scanLabelText(s: string, from: number, lead: string, term: (j: number) => Term | null): Labelled | null {
  const q = skipWs(s, from)
  if (s[q] === '"') {
    const qe = s.indexOf('"', q + 1)
    if (qe >= 0) {
      const after = skipWs(s, qe + 1)
      const t = s[after] === lead ? term(after) : null
      if (t) return { raw: s.slice(q + 1, qe), quoted: true, term: t }
    }
  }
  let j = from
  while (j < s.length) {
    if (s[j] === lead) {
      const t = term(j)
      if (t) return { raw: s.slice(from, j), quoted: false, term: t }
      j = skipRun(s, j, lead)
    } else j++
  }
  return null
}

/** `|text|` after an operator. */
function readPipeLabel(s: string, p: number): { raw: string; quoted: boolean; next: number } | null {
  const q = skipWs(s, p + 1)
  if (s[q] === '"') {
    const qe = s.indexOf('"', q + 1)
    if (qe >= 0) {
      const after = skipWs(s, qe + 1)
      if (s[after] === '|') return { raw: s.slice(q + 1, qe), quoted: true, next: after + 1 }
    }
  }
  const e = s.indexOf('|', p + 1)
  if (e < 0) return null
  return { raw: s.slice(p + 1, e), quoted: false, next: e + 1 }
}

function readArrow(s: string, from: number): { arrow: Arrow; next: number } | null {
  let i = skipWs(s, from)
  // v11 edge id `e1@-->`: stripped, never kept. The `@` must be followed by an operator, or it is not an edge id.
  const idEnd = readIdEnd(s, i)
  if (idEnd > i && s[idEnd] === '@') {
    const n = s[idEnd + 1]
    if (n === '-' || n === '=' || n === '<' || n === '~') i = idEnd + 1
  }
  let left: Side = 'none'
  const c0 = s[i]
  if (c0 === '<') { left = 'arrow'; i++ }
  else if ((c0 === 'o' || c0 === 'x') && (s[i + 1] === '-' || s[i + 1] === '=')) { left = 'head'; i++ }

  let right: Side = 'none'
  let dashed = false
  let thick = false
  let invisible = false
  let labelled: Labelled | undefined
  const c = s[i]
  if (c === '~') {
    const e = skipRun(s, i, '~')
    if (e - i < 3) return null
    invisible = true
    i = e
  } else if (c === '-' && s[i + 1] === '.') {
    // Dotted: `-.->`, `-.-`, `-..->`, or the label form `-. text .->`.
    dashed = true
    let j = skipRun(s, i + 1, '.')
    if (s[j] === '-') {
      j++
      if (s[j] === '>') { right = 'arrow'; j++ }
      i = j
    } else {
      labelled = scanLabelText(s, j, '.', (k) => dotTerm(s, k)) ?? undefined
      if (!labelled) return null
      right = labelled.term.right
      i = labelled.term.next
    }
  } else if (c === '-' || c === '=') {
    const e = skipRun(s, i, c)
    if (e - i < 2) return null
    thick = c === '='
    const nx = s[e]
    if (nx === '>') { right = 'arrow'; i = e + 1 }
    else if ((nx === 'o' || nx === 'x') && !isIdCharAt(s, e + 1)) { right = 'head'; i = e + 1 }
    else if (e - i >= 3) i = e
    else {
      labelled = scanLabelText(s, e, c, (k) => runTerm(s, k, c)) ?? undefined
      if (!labelled) return null
      right = labelled.term.right
      i = labelled.term.next
    }
  } else return null

  let raw: { raw: string; quoted: boolean } | undefined = labelled
  if (!raw) {
    const p = skipWs(s, i)
    if (s[p] === '|') {
      const r = readPipeLabel(s, p)
      if (!r) return null
      raw = r
      i = r.next
    }
  }
  const decoded = raw ? decodeEdgeLabel(raw.raw, raw.quoted) : { stripped: false, label: undefined }
  const ends: Ends = left !== 'none' && right !== 'none' ? 'both' : right !== 'none' ? 'end' : left !== 'none' ? 'start' : 'none'
  const arrow: Arrow = { ends, dashed, thick, heads: left === 'head' || right === 'head', invisible, stripped: decoded.stripped }
  if (decoded.label !== undefined) arrow.label = decoded.label
  return { arrow, next: i }
}

/** A whole node-and-edge statement, or null (the caller drops it as "not understood"). Nothing is applied until the whole statement parsed. */
function parseStatement(s: string): Plan | null {
  const groups: PlanNode[][] = []
  const arrows: Arrow[] = []
  let i = 0
  for (;;) {
    const g = readGroup(s, i)
    if (!g) return null
    groups.push(g.nodes)
    i = skipWs(s, g.next)
    if (i >= s.length) return { groups, arrows }
    const a = readArrow(s, i)
    if (!a) return null
    arrows.push(a.arrow)
    i = a.next
  }
}

// ── Statement kinds that are never structure ────────────────────────────────

interface Directive { canon: string; reason: string }

const ACTION_REASON = (canon: string): string => `${canon} would run or open something — interactions are never imported`
const STYLE_REASON = (canon: string): string => `${canon} is styling — styling is not imported`
const DIRECTIVES: ReadonlyMap<string, Directive> = new Map<string, Directive>([
  ['click', { canon: 'click', reason: ACTION_REASON('click') }],
  ['callback', { canon: 'callback', reason: ACTION_REASON('callback') }],
  ['call', { canon: 'call', reason: ACTION_REASON('call') }],
  ['href', { canon: 'href', reason: ACTION_REASON('href') }],
  ['style', { canon: 'style', reason: STYLE_REASON('style') }],
  ['classdef', { canon: 'classDef', reason: STYLE_REASON('classDef') }],
  ['class', { canon: 'class', reason: STYLE_REASON('class') }],
  ['linkstyle', { canon: 'linkStyle', reason: STYLE_REASON('linkStyle') }],
  ['acctitle', { canon: 'accTitle', reason: 'accessibility text is not imported' }],
  ['accdescr', { canon: 'accDescr', reason: 'accessibility text is not imported' }]
])

const REASON_NOT_UNDERSTOOD = 'not understood'
const REASON_TOO_LONG = `statement is longer than ${MERMAID_MAX_STATEMENT.toLocaleString('en-US')} characters`
const REASON_CLASS = 'class styling is not imported'
const REASON_DIRECTION = 'direction inside a subgraph is not imported'
const REASON_SUBGRAPH_EDGE = 'edges to a subgraph are not imported'
const REASON_INVISIBLE = 'invisible links are not imported'
const REASON_ACC_BLOCK = 'inside an accDescr block — accessibility text is not imported'
const REASON_STRAY_END = 'end with no subgraph open'
const REASON_EMPTY_SUBGRAPH = REASON_NOT_UNDERSTOOD

function readWord(t: string): string {
  let e = 0
  while (e < t.length && isAlpha(t.charCodeAt(e))) e++
  return t.slice(0, e)
}

// ── Subgraphs ───────────────────────────────────────────────────────────────

/** `subgraph id [title]`, `subgraph id["title"]`, `subgraph "title"`, `subgraph some title`. */
function parseSubgraphHeader(rest: string): { id?: string; label: string; stripped: boolean } | null {
  const r = rest.trim()
  if (r === '') return null
  if (r[0] === '"') {
    const q = r.indexOf('"', 1)
    if (q > 0 && r.slice(q + 1).trim() === '') {
      const d = decodeLabel(r.slice(1, q), true)
      return { label: d.text, stripped: d.stripped }
    }
  }
  const end = readIdEnd(r, 0)
  if (end > 0 && end <= MAX_ID) {
    const id = r.slice(0, end)
    const after = skipWs(r, end)
    if (after >= r.length) return { id, label: normaliseShapeText(id), stripped: false }
    if (r[after] === '[' && r.endsWith(']')) {
      let inner = r.slice(after + 1, -1)
      const t = inner.trim()
      let quoted = false
      if (t.length >= 2 && t[0] === '"' && t[t.length - 1] === '"') { inner = t.slice(1, -1); quoted = true }
      const d = decodeLabel(inner, quoted)
      return { id, label: d.text, stripped: d.stripped }
    }
  }
  // Words with spaces: the whole text is the title, and there is no id to refer to.
  const d = decodeLabel(r, false)
  return { label: d.text, stripped: d.stripped }
}

interface GroupAcc { id: string; label: string; nodes: string[] }
interface Open { group: GroupAcc; line: number; text: string }
interface NodeAcc { id: string; form: ShapeForm; text: string; shaped: boolean }

class Importer {
  private readonly nodes = new Map<string, NodeAcc>()
  private readonly edges: FlowEdge[] = []
  private readonly groups: GroupAcc[] = []
  private readonly groupById = new Map<string, GroupAcc>()
  private readonly stack: Open[] = []
  /** The group that first claimed a node from inside a subgraph. First claim wins, and the innermost group claims. */
  private readonly owner = new Map<string, GroupAcc>()
  /** Ids declared by `subgraph id …` anywhere in the text — an edge to one is an edge to a group, which is not imported. */
  private readonly subgraphIds = new Set<string>()
  readonly dropped: MermaidDrop[] = []
  readonly approximated: MermaidDrop[] = []
  private accBlock = false
  private minted = 0

  constructor(private readonly stmts: Stmt[]) {
    for (const st of stmts) {
      const w = readWord(st.text)
      if (w.toLowerCase() === 'subgraph' && isSpaceCode(st.text.charCodeAt(w.length))) {
        const h = parseSubgraphHeader(st.text.slice(w.length))
        if (h?.id !== undefined) this.subgraphIds.add(h.id)
      }
    }
  }

  run(direction: FlowDirection): FlowGraph {
    for (const st of this.stmts) this.handle(st)
    // An unclosed subgraph closes at the end of the text, and says so.
    while (this.stack.length > 0) {
      const open = this.stack.pop() as Open
      this.approximate({ line: open.line, text: open.text }, NOTE_UNCLOSED)
    }
    const nodes: FlowNode[] = []
    for (const a of this.nodes.values()) nodes.push({ id: a.id, form: a.form, text: a.text, w: SHAPE_SIZE[a.form].w, h: SHAPE_SIZE[a.form].h })
    const groups: FlowGroup[] = this.groups.map((g) => ({ id: g.id, label: g.label, nodes: g.nodes }))
    return { direction, nodes, edges: this.edges, groups }
  }

  private note(list: MermaidDrop[], st: Stmt, reason: string): void {
    list.push({ line: st.line, text: capText(st.text), reason })
    if (this.dropped.length + this.approximated.length > MAX_NOTES) throw new Refusal('so many lines could not be understood that this is not a flowchart the importer can read')
  }
  private drop(st: Stmt, reason: string): void { this.note(this.dropped, st, reason) }
  private approximate(st: Stmt, reason: string): void { this.note(this.approximated, st, reason) }

  private handle(st: Stmt): void {
    const t = st.text
    if (t.length > MERMAID_MAX_STATEMENT) { this.drop(st, REASON_TOO_LONG); return }
    if (this.accBlock) {
      if (t.includes('}')) this.accBlock = false
      this.drop(st, REASON_ACC_BLOCK)
      return
    }
    const word = readWord(t)
    const lower = word.toLowerCase()
    const after = t.charCodeAt(word.length)
    // A keyword is a WHOLE word: `style1` is a node, `style A fill:#f00` is styling.
    const boundary = word !== '' && (Number.isNaN(after) || isSpaceCode(after) || (after === 58 && (lower === 'acctitle' || lower === 'accdescr')))
    if (boundary) {
      if (lower === 'subgraph') { this.openSubgraph(st, t.slice(word.length)); return }
      if (lower === 'end' && t.length === 3) { this.closeSubgraph(st); return }
      if (lower === 'direction') { this.drop(st, REASON_DIRECTION); return }
      const directive = DIRECTIVES.get(lower)
      if (directive) {
        // `accDescr { … }` runs over several lines; every line of it is a counted drop.
        if (directive.canon === 'accDescr' && t.includes('{') && !t.includes('}')) this.accBlock = true
        this.drop(st, directive.reason)
        return
      }
    }
    const plan = parseStatement(t)
    if (!plan) { this.drop(st, REASON_NOT_UNDERSTOOD); return }
    this.apply(plan, st)
  }

  private openSubgraph(st: Stmt, rest: string): void {
    const h = parseSubgraphHeader(rest)
    if (!h) { this.drop(st, REASON_EMPTY_SUBGRAPH); return }
    let group = h.id !== undefined ? this.groupById.get(h.id) : undefined
    if (!group) {
      let id = h.id
      if (id === undefined) {
        // `subgraph "title"` has no id. Mint one no explicit id can collide with.
        do id = `sg${++this.minted}`
        while (this.subgraphIds.has(id))
      }
      group = { id, label: h.label, nodes: [] }
      this.groups.push(group)
      if (h.id !== undefined) this.groupById.set(h.id, group)
    }
    if (this.stack.length > 0) this.approximate(st, NOTE_NESTED)
    if (h.stripped) this.approximate(st, NOTE_TAGS)
    this.stack.push({ group, line: st.line, text: st.text })
  }

  private closeSubgraph(st: Stmt): void {
    if (this.stack.length === 0) this.drop(st, REASON_STRAY_END)
    else this.stack.pop()
  }

  private register(n: PlanNode, st: Stmt): void {
    if (n.cls) this.drop(st, REASON_CLASS)
    let acc = this.nodes.get(n.id)
    if (!acc) {
      if (this.nodes.size >= MERMAID_MAX_NODES) throw new Refusal(`more than ${MERMAID_MAX_NODES} shapes — too big to import as one diagram`)
      acc = { id: n.id, form: 'process', text: normaliseShapeText(n.id), shaped: false }
      this.nodes.set(n.id, acc)
    }
    if (n.shape) {
      if (!acc.shaped) {
        // The FIRST declaration with a shape wins; a bare reference before it never counted.
        acc.form = n.shape.form
        acc.text = n.shape.text
        acc.shaped = true
        for (const note of n.shape.notes) this.approximate(st, note)
      } else if (acc.form !== n.shape.form || acc.text !== n.shape.text) this.approximate(st, NOTE_TWICE)
    }
    // Mentioned inside a subgraph: the innermost open one claims it, first claim wins.
    const open = this.stack[this.stack.length - 1]
    if (open && !this.owner.has(n.id)) {
      open.group.nodes.push(n.id)
      this.owner.set(n.id, open.group)
    }
  }

  private apply(plan: Plan, st: Stmt): void {
    const isGroupRef = (n: PlanNode): boolean => n.shape === undefined && this.subgraphIds.has(n.id)
    for (const g of plan.groups) for (const n of g) if (!isGroupRef(n)) this.register(n, st)
    let toSubgraph = false
    for (let a = 0; a < plan.arrows.length; a++) {
      const arrow = plan.arrows[a]
      if (arrow.invisible) { this.drop(st, REASON_INVISIBLE); continue }
      const froms = plan.groups[a].filter((n) => !isGroupRef(n))
      const tos = plan.groups[a + 1].filter((n) => !isGroupRef(n))
      if (froms.length < plan.groups[a].length || tos.length < plan.groups[a + 1].length) toSubgraph = true
      const count = froms.length * tos.length
      if (count === 0) continue
      // Checked BEFORE the cross product is built: `A & B & … --> C & D & …` in one line must not allocate its way past the cap.
      if (this.edges.length + count > MERMAID_MAX_EDGES) throw new Refusal(`more than ${MERMAID_MAX_EDGES} connectors — too big to import as one diagram`)
      for (const f of froms) {
        for (const t of tos) {
          const edge: FlowEdge = { from: f.id, to: t.id }
          if (arrow.label !== undefined) edge.label = arrow.label
          edge.ends = arrow.ends
          if (arrow.dashed) edge.dashed = true
          this.edges.push(edge)
        }
      }
      if (arrow.thick) this.approximate(st, NOTE_THICK)
      if (arrow.heads) this.approximate(st, NOTE_HEADS)
      if (arrow.stripped) this.approximate(st, NOTE_TAGS)
    }
    if (toSubgraph) this.drop(st, REASON_SUBGRAPH_EDGE)
  }
}

/** Mermaid flowchart text into the graph view. Never throws; a bound crossed or a non-flowchart is `refused`. */
export function parseMermaid(text: string): MermaidParse {
  if (typeof text !== 'string') return { kind: 'refused', reason: 'there is no text to read' }
  if (text.length > MERMAID_MAX_CHARS) return { kind: 'refused', reason: `this is ${text.length.toLocaleString('en-US')} characters — the importer reads at most ${MERMAID_MAX_CHARS.toLocaleString('en-US')}` }
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const head = scanHeader(lines)
  if (!head.ok) return { kind: 'refused', reason: head.reason }
  const stmts: Stmt[] = []
  splitLine(head.rest, head.at + 1, stmts)
  for (let i = head.at + 1; i < lines.length; i++) splitLine(lines[i], i + 1, stmts)
  try {
    const importer = new Importer(stmts)
    const graph = importer.run(head.direction)
    const result: MermaidParse = { kind: 'ok', graph, dropped: importer.dropped, approximated: importer.approximated }
    if (head.title !== undefined) result.title = head.title
    return result
  } catch (error) {
    if (error instanceof Refusal) return { kind: 'refused', reason: error.message }
    throw error
  }
}

// ── The sentence ────────────────────────────────────────────────────────────

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`

/** What a dropped line was, in a word a person recognises — the keyword when it has one. */
function dropKind(d: MermaidDrop): string {
  const directive = DIRECTIVES.get(readWord(d.text).toLowerCase())
  if (directive && d.reason === directive.reason) return directive.canon
  if (d.reason === REASON_CLASS) return 'class'
  if (d.reason === REASON_DIRECTION) return 'direction'
  if (d.reason === REASON_SUBGRAPH_EDGE) return 'subgraph link'
  if (d.reason === REASON_INVISIBLE) return 'invisible link'
  if (d.reason === REASON_TOO_LONG) return 'too long'
  if (d.reason === REASON_STRAY_END) return 'stray end'
  if (d.reason === REASON_ACC_BLOCK) return 'accDescr'
  return 'not understood'
}

/** Which noun an approximation belongs to. Reasons are this module's own constants, so the mapping is exact. */
function approximationNoun(reason: string): 'connector' | 'subgraph' | 'shape' {
  if (reason === NOTE_THICK || reason === NOTE_HEADS) return 'connector'
  if (reason === NOTE_NESTED || reason === NOTE_UNCLOSED) return 'subgraph'
  return 'shape'
}

/**
 * One line a person reads after an import: "12 shapes · 14 connectors · 2 lines
 * left out (click, style) · 1 shape approximated". A part with a zero count is
 * omitted (the repo's never-a-bare-zero rule).
 */
export function mermaidImportSentence(parse: MermaidParse & { kind: 'ok' }): string {
  const parts: string[] = []
  const { graph, dropped, approximated } = parse
  if (graph.nodes.length > 0) parts.push(plural(graph.nodes.length, 'shape'))
  if (graph.edges.length > 0) parts.push(plural(graph.edges.length, 'connector'))
  if (dropped.length > 0) {
    const kinds: string[] = []
    for (const d of dropped) { const k = dropKind(d); if (!kinds.includes(k)) kinds.push(k) }
    const shown = kinds.length > 4 ? `${kinds.slice(0, 4).join(', ')}, …` : kinds.join(', ')
    parts.push(`${plural(dropped.length, 'line')} left out (${shown})`)
  }
  const counts = { shape: 0, connector: 0, subgraph: 0 }
  for (const a of approximated) counts[approximationNoun(a.reason)]++
  if (counts.shape > 0) parts.push(`${plural(counts.shape, 'shape')} approximated`)
  if (counts.connector > 0) parts.push(`${plural(counts.connector, 'connector')} approximated`)
  if (counts.subgraph > 0) parts.push(`${plural(counts.subgraph, 'subgraph')} approximated`)
  return parts.length > 0 ? parts.join(' · ') : 'an empty flowchart'
}

// ── Serializing ─────────────────────────────────────────────────────────────

/** Words Mermaid (or this parser) reads at the start of a statement. An id that is one would be read as the statement. Compared lower-case: Mermaid's keywords are case-insensitive. */
const KEYWORDS: ReadonlySet<string> = new Set([
  'end', 'subgraph', 'graph', 'flowchart', 'click', 'style', 'class', 'classdef', 'linkstyle', 'direction', 'default',
  'call', 'href', 'callback', 'acctitle', 'accdescr'
])

function isSafeId(id: string): boolean {
  return id.length <= MAX_ID && /^[A-Za-z][A-Za-z0-9_]*$/.test(id) && !KEYWORDS.has(id.toLowerCase())
}

/**
 * Keep each safe id, mint `<prefix>1`, `<prefix>2`… (skipping any taken) for the
 * rest, in order. One result per input POSITION: a repeated id is a second
 * thing and is minted, so nothing is ever written under one name twice.
 * Deterministic.
 */
function assignIds(wanted: readonly string[], prefix: string, taken: ReadonlySet<string>): string[] {
  const used = new Set(taken)
  const out: (string | undefined)[] = wanted.map((id) => {
    if (!isSafeId(id) || used.has(id)) return undefined
    used.add(id)
    return id
  })
  let k = 0
  return out.map((kept) => {
    if (kept !== undefined) return kept
    let name: string
    do name = `${prefix}${++k}`
    while (used.has(name))
    used.add(name)
    return name
  })
}

/**
 * The ids a graph is written with: an id that is already a safe Mermaid id is
 * kept; the rest become `n1`, `n2`… in node order. Exported so a caller can
 * map a re-imported graph back to the one it wrote.
 */
export function mermaidIds(graph: FlowGraph): Map<string, string> {
  const unique: string[] = []
  const seen = new Set<string>()
  for (const n of graph.nodes) if (!seen.has(n.id)) { seen.add(n.id); unique.push(n.id) }
  const written = assignIds(unique, 'n', new Set())
  return new Map(unique.map((id, i) => [id, written[i]]))
}

/**
 * A label into text that survives being read back: `"` and newline and `<` `>`
 * become entities and `<br/>` (never a raw tag), and a `#` is escaped only where
 * the reader would take it for an entity's start.
 */
function encodeLabel(text: string): string {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') out += '#quot;'
    else if (c === '\n') out += '<br/>'
    else if (c === '\r') { if (text[i + 1] === '\n') i++; out += '<br/>' }
    else if (c === '<') out += '#lt;'
    else if (c === '>') out += '#gt;'
    else if (c === '#') out += entityEnd(text, i) >= 0 ? '#35;' : '#'
    else out += c
  }
  // A quoted label wrapped in backticks is a markdown string on the way back in; keep the first one a character reference.
  if (text.length >= 2 && text[0] === '`' && text[text.length - 1] === '`') out = `#96;${out.slice(1)}`
  return out
}

function declaration(id: string, n: FlowNode): string {
  const t = encodeLabel(n.text)
  switch (n.form) {
    case 'process': return `${id}["${t}"]`
    case 'terminator': return `${id}(["${t}"])`
    case 'decision': return `${id}{"${t}"}`
    case 'io': return `${id}[/"${t}"/]`
    case 'subprocess': return `${id}[["${t}"]]`
    case 'document': return `${id}@{ shape: doc, label: "${t}" }`
    // An unlabelled circle is the junction; a junction that has text keeps it in the v11 form.
    case 'junction': return n.text === '' ? `${id}(( ))` : `${id}@{ shape: junction, label: "${t}" }`
    case 'text': return `${id}@{ shape: text, label: "${t}" }`
  }
}

function operator(ends: Ends, dashed: boolean): string {
  if (ends === 'none') return dashed ? '-.-' : '---'
  if (ends === 'both') return dashed ? '<-.->' : '<-->'
  return dashed ? '-.->' : '-->'
}

/**
 * The graph as Mermaid text. Every node is declared exactly once — inside its
 * group when it has one — and every edge is a plain statement after them, so
 * membership is decided by where a node is DECLARED and an edge can never
 * change it. `parseMermaid(serializeMermaid(g))` is the same graph (with an
 * `ends: 'start'` connector written as the reversed arrow, since Mermaid has no
 * single reversed head).
 */
export function serializeMermaid(graph: FlowGraph, opts?: { title?: string }): string {
  const ids = mermaidIds(graph)
  const lines: string[] = []
  const title = (opts?.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)
  if (title !== '') lines.push('---', `title: "${title.replace(/([\\"])/g, '\\$1')}"`, '---')
  const direction: FlowDirection = graph.direction === 'BT' || graph.direction === 'LR' || graph.direction === 'RL' ? graph.direction : 'TB'
  lines.push(`flowchart ${direction}`)

  const byId = new Map<string, FlowNode>()
  for (const n of graph.nodes) if (!byId.has(n.id)) byId.set(n.id, n)
  const groups = (graph.groups ?? []).filter((g) => g && typeof g.id === 'string')
  const owner = new Map<string, number>()
  groups.forEach((g, gi) => { for (const id of g.nodes) if (byId.has(id) && !owner.has(id)) owner.set(id, gi) })
  const gid = assignIds(groups.map((g) => g.id), 'g', new Set(ids.values()))

  const declared = new Set<string>()
  const emittedGroups = new Set<number>()
  const declare = (id: string, indent: string): void => {
    const n = byId.get(id) as FlowNode
    declared.add(id)
    lines.push(`${indent}${declaration(ids.get(id) as string, n)}`)
  }
  const emitGroup = (gi: number): void => {
    emittedGroups.add(gi)
    const g = groups[gi]
    lines.push(`  subgraph ${gid[gi]} ["${encodeLabel(typeof g.label === 'string' ? g.label : '')}"]`)
    for (const id of g.nodes) if (owner.get(id) === gi && !declared.has(id)) declare(id, '    ')
    lines.push('  end')
  }
  // In node order, a group standing where its first member does: node order survives as far as groups allow.
  for (const n of graph.nodes) {
    if (declared.has(n.id)) continue
    const gi = owner.get(n.id)
    if (gi === undefined) declare(n.id, '  ')
    else if (!emittedGroups.has(gi)) emitGroup(gi)
  }
  groups.forEach((_g, gi) => { if (!emittedGroups.has(gi)) emitGroup(gi) })

  for (const e of graph.edges) {
    const a = ids.get(e.from)
    const b = ids.get(e.to)
    if (a === undefined || b === undefined) continue
    let ends: Ends = e.ends ?? 'end'
    let from = a
    let to = b
    if (ends === 'start') { from = b; to = a; ends = 'end' }
    const label = typeof e.label === 'string' && e.label.trim() !== '' ? `|"${encodeLabel(e.label)}"|` : ''
    lines.push(`  ${from} ${operator(ends, e.dashed === true)}${label} ${to}`)
  }
  return lines.join('\n')
}
