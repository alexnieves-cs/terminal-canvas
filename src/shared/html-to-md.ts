/**
 * M250. mammoth's HTML → Markdown, for the .docx import.
 *
 * Why not mammoth's own Markdown writer: it is deprecated upstream. Why not a
 * DOM: this runs in MAIN, which has none, and mammoth's output is a SMALL,
 * WELL-FORMED vocabulary — p, h1–h6, ul/ol/li, table/tr/td/th, a, strong, em,
 * img, br, sup/sub/s — that a tag scanner reads exactly. Anything outside it
 * contributes its children's text and nothing else (never raw HTML: a note is
 * edited as Markdown, and HTML would be a raw block the rich editor refuses).
 *
 * Every text character that Markdown would read as markup is escaped, so the
 * note says what the document said; `verify:notes html.1`.
 */

interface El { tag: string; attrs: Record<string, string>; children: Node[] }
type Node = El | string

const VOID = new Set(['br', 'img', 'hr'])

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos|nbsp|#39);/g, (_m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' } as Record<string, string>)[e] ?? ''
  })
}

function parse(html: string): El {
  const rootEl: El = { tag: '#root', attrs: {}, children: [] }
  const stack: El[] = [rootEl]
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|<!--[\s\S]*?-->|([^<]+)|</g
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const top = stack[stack.length - 1]
    if (m[5] !== undefined) { top.children.push(decode(m[5])); continue }
    if (m[2] === undefined) { if (m[0] === '<') top.children.push('<'); continue }
    const tag = m[2].toLowerCase()
    if (m[1] === '/') {
      // Close the nearest matching element; a stray close is ignored.
      const at = stack.map((e) => e.tag).lastIndexOf(tag)
      if (at > 0) stack.length = at
      continue
    }
    const attrs: Record<string, string> = {}
    for (const a of m[3].matchAll(/([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attrs[a[1].toLowerCase()] = decode(a[2] ?? a[3] ?? a[4] ?? '')
    const el: El = { tag, attrs, children: [] }
    top.children.push(el)
    if (!VOID.has(tag) && m[4] !== '/') stack.push(el)
  }
  return rootEl
}

/** Markup characters in running text. `|` only in a table cell (the caller's). */
// `~` (strikethrough) and an `&` that starts an entity (`&copy;` would render ©) are markup too.
const escapeText = (text: string): string => text.replace(/\s+/g, ' ').replace(/[\\`*_[\]<>~]|&(?=#?[A-Za-z0-9]+;)/g, (c) => `\\${c}`)

/** Emphasis whose edge is a space does not render — `**a **b` is literal stars. Move the spaces outside. */
const wrap = (mark: string, t: string): string => {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(t)!
  return m[2] === '' ? t : `${m[1]}${mark}${m[2]}${mark}${m[3]}`
}

/** A destination with a space or a parenthesis takes the angle-bracket form, which CommonMark reads verbatim. */
export function mdDestination(src: string): string {
  return /[\s()<>]/.test(src) ? `<${src.replace(/[<>]/g, (c) => encodeURIComponent(c))}>` : src
}

function inline(nodes: Node[]): string {
  return nodes.map((n) => {
    if (typeof n === 'string') return escapeText(n)
    const inner = (): string => inline(n.children)
    switch (n.tag) {
      case 'strong': case 'b': return wrap('**', inner())
      case 'em': case 'i': return wrap('*', inner())
      case 's': case 'del': case 'strike': return wrap('~~', inner())
      case 'a': return n.attrs.href ? `[${inner()}](${mdDestination(n.attrs.href)})` : inner()
      // A hard line break, as the backslash form (trailing spaces are invisible and editors strip them).
      case 'br': return '\\\n'
      case 'img': return n.attrs.src ? `![${escapeText(n.attrs.alt ?? '')}](${mdDestination(n.attrs.src)})` : ''
      default: return inner()
    }
  }).join('')
}

/** A paragraph's opening that Markdown would read as a heading, a bullet or an ordered item. */
// Applied to EVERY line of a block — a line after a hard break (`\` + newline)
// starts a line too, and `a\<br>---` would otherwise be a setext heading.
const escapeLine = (text: string): string =>
  text.replace(/^(#{1,6}(?=\s|$)|[-+](?=\s)|[=-]+[ \t]*$)/, (m) => `\\${m}`).replace(/^(\d{1,9})([.)])(?=\s)/, '$1\\$2')
const escapeStart = (text: string): string => text.split('\\\n').map(escapeLine).join('\\\n')

function listItem(li: El, marker: string): string {
  const nested = li.children.filter((c): c is El => typeof c !== 'string' && (c.tag === 'ul' || c.tag === 'ol'))
  const own = li.children.filter((c) => !(typeof c !== 'string' && (c.tag === 'ul' || c.tag === 'ol')))
  // A <p> inside an <li> is the item's own text, joined as one line.
  const text = own.map((c) => typeof c !== 'string' && c.tag === 'p' ? inline(c.children) : inline([c])).join(' ').replace(/ +/g, ' ').trim()
  const pad = ' '.repeat(marker.length)
  const sub = nested.map((l) => list(l).split('\n').map((line) => pad + line).join('\n'))
  return [marker + escapeStart(text), ...sub].join('\n')
}

function list(el: El): string {
  const items = el.children.filter((c): c is El => typeof c !== 'string' && c.tag === 'li')
  return items.map((li, i) => listItem(li, el.tag === 'ol' ? `${i + 1}. ` : '- ')).join('\n')
}

function table(el: El): string {
  const rows: El[] = []
  const walk = (e: El): void => { for (const c of e.children) if (typeof c !== 'string') { if (c.tag === 'tr') rows.push(c); else if (c.tag !== 'table') walk(c) } }
  walk(el)
  const grid = rows.map((tr) => tr.children.filter((c): c is El => typeof c !== 'string' && (c.tag === 'td' || c.tag === 'th')).flatMap((cell) => {
    const text = cell.children.map((c) => typeof c !== 'string' && c.tag === 'p' ? inline(c.children) : inline([c])).join(' ').replace(/\\\n/g, ' ').replace(/ +/g, ' ').trim().replace(/\|/g, '\\|')
    // A pipe table cannot say "merged": the merged cell's text stays in its
    // first column and the columns it spanned are EMPTY cells. The loss report
    // names the table; this keeps every other cell in its own column.
    const span = Math.max(1, Math.min(64, parseInt(cell.attrs.colspan ?? '1', 10) || 1))
    return [text, ...Array.from({ length: span - 1 }, () => '')]
  }))
  if (grid.length === 0) return ''
  const width = Math.max(...grid.map((r) => r.length))
  const line = (cells: string[]): string => `| ${[...cells, ...Array.from({ length: width - cells.length }, () => '')].join(' | ')} |`
  return [line(grid[0]), `| ${Array.from({ length: width }, () => '---').join(' | ')} |`, ...grid.slice(1).map(line)].join('\n')
}

function blocks(nodes: Node[]): string[] {
  const out: string[] = []
  let run: Node[] = []
  const flush = (): void => { const t = inline(run).trim(); if (t) out.push(escapeStart(t)); run = [] }
  for (const n of nodes) {
    if (typeof n === 'string' || !['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'table', 'div', 'blockquote', 'hr'].includes(n.tag)) { run.push(n); continue }
    flush()
    // A trailing `#` run would be read as the heading's closing sequence and stripped.
    if (/^h[1-6]$/.test(n.tag)) { const t = inline(n.children).replace(/\\\n/g, ' ').trim().replace(/(\s)(#+)$/, '$1\\$2'); if (t) out.push(`${'#'.repeat(Number(n.tag[1]))} ${t}`) }
    else if (n.tag === 'p') { const t = inline(n.children).trim(); if (t) out.push(escapeStart(t)) }
    else if (n.tag === 'ul' || n.tag === 'ol') { const t = list(n); if (t) out.push(t) }
    else if (n.tag === 'table') { const t = table(n); if (t) out.push(t) }
    else if (n.tag === 'hr') out.push('---')
    else out.push(...blocks(n.children))
  }
  flush()
  return out
}

export function htmlToMarkdown(html: string): string {
  const out = blocks(parse(html).children)
  return out.length ? `${out.join('\n\n')}\n` : ''
}
