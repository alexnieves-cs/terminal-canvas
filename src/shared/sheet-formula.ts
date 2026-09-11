/**
 * M245. The sheet's formula language: addressing, evaluation and reference shifting.
 *
 * STORED AS FORMULAS, NEVER VALUES. A cell whose text begins with `=` is a
 * formula and the file holds that text; this module computes what it shows.
 * A computed value written back would freeze the sheet the first time anybody
 * saved it — the next edit to an input would change nothing downstream.
 *
 * The grammar is deliberately closed: numbers, strings, refs, ranges,
 * `+ - * / ^ &`, parentheses, unary signs and SUM AVERAGE MIN MAX COUNT.
 * Anything else is `#NAME?` and does NOTHING. That is this object's CSV-
 * injection answer — `=HYPERLINK(…)` or `=cmd|…` in a file an agent wrote
 * cannot reach outside the grid, because no function here can.
 */

export type Grid = readonly (readonly string[])[]
export interface CellRef { r: number; c: number }
export interface CellRange { r0: number; c0: number; r1: number; c1: number }

/** A plain number, the way a person types one. `007` IS a number to a formula. */
export const NUMBER = /^\s*[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?\s*$/

export function colName(c: number): string {
  let s = ''
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}
export function colIndex(letters: string): number {
  let n = 0
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}
export function refName(r: number, c: number): string { return `${colName(c)}${r + 1}` }
export function parseRef(text: string): CellRef | null {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/.exec(text.trim())
  if (!m || Number(m[2]) < 1) return null
  return { r: Number(m[2]) - 1, c: colIndex(m[1]) }
}

// ── evaluation ───────────────────────────────────────────────────────────

interface Err { err: string }
type V = number | string | Err
const isErr = (v: unknown): v is Err => typeof v === 'object' && v !== null && 'err' in v
const CYCLE: Err = { err: '#CYCLE!' }

export function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toPrecision(12)))
}

/** A non-formula cell's value. The apostrophe marks "text even though it looks like a formula or number". */
function literal(text: string): V {
  if (text === '') return ''
  if (text.startsWith("'")) return text.slice(1)
  if (NUMBER.test(text)) return Number(text)
  return text
}

type Tok = { t: 'num'; v: number } | { t: 'str'; v: string } | { t: 'ref'; v: string } | { t: 'id'; v: string } | { t: 'op'; v: string } | { t: 'err'; v: string }

/** null for a character outside the grammar — which reads as `#NAME?`, the unknown-thing error. */
function tokenize(src: string): Tok[] | null {
  const out: Tok[] = []
  for (let i = 0; i < src.length;) {
    const ch = src[i]
    const rest = src.slice(i)
    if (/\s/.test(ch)) { i += 1; continue }
    if (/[0-9.]/.test(ch)) {
      const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(rest)
      if (!m) return null
      out.push({ t: 'num', v: Number(m[0]) }); i += m[0].length; continue
    }
    if (ch === '"') {
      let j = i + 1
      let s = ''
      for (;;) {
        if (j >= src.length) return null
        if (src[j] === '"') { if (src[j + 1] === '"') { s += '"'; j += 2; continue } break }
        s += src[j]; j += 1
      }
      out.push({ t: 'str', v: s }); i = j + 1; continue
    }
    if (rest.startsWith('#REF!')) { out.push({ t: 'err', v: '#REF!' }); i += 5; continue }
    // A ref is letters+digits NOT followed by `(` — so LOG10( is a function name, never a cell.
    const ref = /^\$?[A-Za-z]{1,3}\$?\d+(?![A-Za-z0-9_(])/.exec(rest)
    if (ref) { out.push({ t: 'ref', v: ref[0] }); i += ref[0].length; continue }
    const id = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(rest)
    if (id) { out.push({ t: 'id', v: id[0].toUpperCase() }); i += id[0].length; continue }
    if ('+-*/^&(),:'.includes(ch)) { out.push({ t: 'op', v: ch }); i += 1; continue }
    return null
  }
  return out
}

type Node =
  | { k: 'num'; v: number } | { k: 'str'; v: string } | { k: 'err'; v: string } | { k: 'name' }
  | { k: 'ref'; r: number; c: number } | { k: 'range'; r0: number; c0: number; r1: number; c1: number }
  | { k: 'un'; op: string; a: Node } | { k: 'bin'; op: string; a: Node; b: Node } | { k: 'call'; name: string; args: Node[] }

class ParseError extends Error {}

function parse(tokens: Tok[]): Node {
  let p = 0
  const peek = (): Tok | undefined => tokens[p]
  const isOp = (v: string): boolean => { const t = peek(); return t?.t === 'op' && t.v === v }
  const expect = (v: string): void => { if (!isOp(v)) throw new ParseError(v); p += 1 }
  const binary = (ops: string, next: () => Node): Node => {
    let a = next()
    while (peek()?.t === 'op' && ops.includes((peek() as { v: string }).v)) { const op = (tokens[p++] as { v: string }).v; a = { k: 'bin', op, a, b: next() } }
    return a
  }
  const concat = (): Node => binary('&', additive)
  const additive = (): Node => binary('+-', term)
  const term = (): Node => binary('*/', unary)
  const unary = (): Node => {
    if (isOp('-') || isOp('+')) { const op = (tokens[p++] as { v: string }).v; return { k: 'un', op, a: unary() } }
    return power()
  }
  const power = (): Node => {
    const a = primary()
    if (isOp('^')) { p += 1; return { k: 'bin', op: '^', a, b: unary() } }
    return a
  }
  const primary = (): Node => {
    const t = tokens[p++]
    if (!t) throw new ParseError('end')
    if (t.t === 'num') return { k: 'num', v: t.v }
    if (t.t === 'str') return { k: 'str', v: t.v }
    if (t.t === 'err') return { k: 'err', v: t.v }
    if (t.t === 'ref') {
      const a = parseRef(t.v)!
      if (isOp(':')) {
        p += 1
        const t2 = tokens[p++]
        if (t2?.t !== 'ref') throw new ParseError('range')
        const b = parseRef(t2.v)!
        return { k: 'range', r0: Math.min(a.r, b.r), c0: Math.min(a.c, b.c), r1: Math.max(a.r, b.r), c1: Math.max(a.c, b.c) }
      }
      return { k: 'ref', r: a.r, c: a.c }
    }
    if (t.t === 'id') {
      if (!isOp('(')) return { k: 'name' }
      p += 1
      const args: Node[] = []
      if (!isOp(')')) { for (;;) { args.push(concat()); if (isOp(',')) { p += 1; continue } break } }
      expect(')')
      return { k: 'call', name: t.v, args }
    }
    if (t.t === 'op' && t.v === '(') { const e = concat(); expect(')'); return e }
    throw new ParseError(t.v)
  }
  const root = concat()
  if (p !== tokens.length) throw new ParseError('trailing')
  return root
}

function compile(formula: string): Node | Err {
  const tokens = tokenize(formula.slice(1))
  if (tokens === null) return { err: '#NAME?' }
  if (tokens.length === 0) return { err: '#VALUE!' }
  try { return parse(tokens) } catch { return { err: '#VALUE!' } }
}

const AGGREGATES: Record<string, (nums: number[]) => V> = {
  SUM: (n) => n.reduce((a, b) => a + b, 0),
  AVERAGE: (n) => n.length === 0 ? { err: '#DIV/0!' } : n.reduce((a, b) => a + b, 0) / n.length,
  MIN: (n) => n.length === 0 ? 0 : Math.min(...n),
  MAX: (n) => n.length === 0 ? 0 : Math.max(...n),
  COUNT: (n) => n.length
}

export interface Evaluator {
  /** What a cell shows: a number, text, or an error string beginning with `#` (see `isError`). */
  value(r: number, c: number): number | string
  isError(r: number, c: number): boolean
}

/**
 * Lazy and memoised per grid, because a sheet renders a WINDOW: evaluating a
 * 50,000-row file eagerly on every keystroke to show forty rows is the cost
 * virtualization exists to avoid. A new grid means a new evaluator.
 */
export function createEvaluator(grid: Grid): Evaluator {
  const rows = grid.length
  const cols = grid.reduce((m, row) => Math.max(m, row.length), 0)
  const memo = new Map<number, V>()
  const visiting = new Set<number>()
  const compiled = new Map<string, Node | Err>()

  const cell = (r: number, c: number): V => {
    const raw = grid[r]?.[c] ?? ''
    if (!raw.startsWith('=')) return literal(raw)
    const key = r * 100_000 + c
    const hit = memo.get(key)
    if (hit !== undefined) return hit
    // Revisiting a cell still being evaluated is a cycle. Every member of it
    // resolves to #CYCLE! rather than recursing until the stack gives out.
    if (visiting.has(key)) return CYCLE
    visiting.add(key)
    let v: V
    try {
      let node = compiled.get(raw)
      if (node === undefined) { node = compile(raw); compiled.set(raw, node) }
      v = isErr(node) ? node : evalNode(node)
    } catch (e) {
      // A reference chain deep enough to exhaust the stack is not a cycle; say VALUE, not CYCLE.
      v = { err: e instanceof RangeError ? '#VALUE!' : '#VALUE!' }
    } finally { visiting.delete(key) }
    memo.set(key, v)
    return v
  }

  const num = (v: V): number | Err => {
    if (isErr(v)) return v
    if (typeof v === 'number') return v
    if (v === '') return 0
    return NUMBER.test(v) ? Number(v) : { err: '#VALUE!' }
  }
  const text = (v: V): string | Err => isErr(v) ? v : typeof v === 'number' ? formatNumber(v) : v

  const collect = (args: Node[]): number[] | Err => {
    const out: number[] = []
    for (const a of args) {
      if (a.k === 'ref' || a.k === 'range') {
        // Refs and ranges IGNORE text and blanks, as every spreadsheet does; a
        // range is clipped to the grid so `A1:XFD1048576` costs the grid, not a billion cells.
        const [r0, c0, r1, c1] = a.k === 'ref' ? [a.r, a.c, a.r, a.c] : [a.r0, a.c0, a.r1, a.c1]
        for (let r = r0; r <= Math.min(r1, rows - 1); r++) {
          for (let c = c0; c <= Math.min(c1, cols - 1); c++) {
            const v = cell(r, c)
            if (isErr(v)) return v
            if (typeof v === 'number') out.push(v)
          }
        }
        continue
      }
      const v = num(evalNode(a))
      if (isErr(v)) return v
      out.push(v)
    }
    return out
  }

  const evalNode = (n: Node): V => {
    switch (n.k) {
      case 'num': return n.v
      case 'str': return n.v
      case 'err': return { err: n.v }
      case 'name': return { err: '#NAME?' }
      case 'ref': return cell(n.r, n.c)
      case 'range': return { err: '#VALUE!' }
      case 'un': { const a = num(evalNode(n.a)); return isErr(a) ? a : n.op === '-' ? -a : a }
      case 'call': {
        const fn = AGGREGATES[n.name]
        if (!fn) return { err: '#NAME?' }
        const nums = collect(n.args)
        return isErr(nums) ? nums : fn(nums)
      }
      case 'bin': {
        if (n.op === '&') {
          const a = text(evalNode(n.a)); if (isErr(a)) return a
          const b = text(evalNode(n.b)); if (isErr(b)) return b
          return a + b
        }
        const a = num(evalNode(n.a)); if (isErr(a)) return a
        const b = num(evalNode(n.b)); if (isErr(b)) return b
        let v: number
        switch (n.op) {
          case '+': v = a + b; break
          case '-': v = a - b; break
          case '*': v = a * b; break
          case '/': if (b === 0) return { err: '#DIV/0!' }; v = a / b; break
          default: v = Math.pow(a, b)
        }
        return Number.isFinite(v) ? v : { err: '#VALUE!' }
      }
    }
  }

  return {
    value: (r, c) => { const v = cell(r, c); return isErr(v) ? v.err : v },
    isError: (r, c) => isErr(cell(r, c))
  }
}

/** Every non-empty cell's value, keyed `A1`. For checks and exports; the grid uses the lazy evaluator. */
export function evaluateSheet(grid: Grid): Map<string, number | string> {
  const ev = createEvaluator(grid)
  const out = new Map<string, number | string>()
  grid.forEach((row, r) => row.forEach((raw, c) => { if (raw !== '') out.set(refName(r, c), ev.value(r, c)) }))
  return out
}

/** What a cell displays at rest. A non-formula cell shows its own text, so `007` stays `007`. */
export function displayText(raw: string, ev: Evaluator, r: number, c: number): string {
  if (!raw.startsWith('=')) return raw.startsWith("'") ? raw.slice(1) : raw
  const v = ev.value(r, c)
  return typeof v === 'number' ? formatNumber(v) : v
}

// ── shifting references on structural edits ──────────────────────────────

const REF_IN_TEXT = /"(?:[^"]|"")*"|#REF!|(\$?)([A-Za-z]{1,3})(\$?)(\d+)(?::(\$?)([A-Za-z]{1,3})(\$?)(\d+))?(?![A-Za-z0-9_(])/g

/**
 * Rewrite the refs in one formula for rows/columns inserted (delta > 0) or
 * deleted (delta < 0) at index `at`. Absolute refs move too — `$` pins a ref
 * against COPYING, not against the grid changing under it.
 *
 * A single ref into a deleted block becomes `#REF!`. A range loses only the
 * part that was deleted; a range wholly inside the block becomes `#REF!`.
 */
export function shiftFormula(formula: string, axis: 'row' | 'col', at: number, delta: number): string {
  const end = at - delta - 1 // last deleted index, for delta < 0
  const move = (i: number): number | null => {
    if (delta > 0) return i >= at ? i + delta : i
    if (i >= at && i <= end) return null
    return i > end ? i + delta : i
  }
  return formula.replace(REF_IN_TEXT, (match: string, d1: string, l1: string, d2: string, n1: string, d3: string | undefined, l2: string | undefined, d4: string | undefined, n2: string | undefined, offset: number, whole: string) => {
    if (match.startsWith('"') || match === '#REF!' || l1 === undefined) return match
    if (offset > 0 && /[A-Za-z0-9_]/.test(whole[offset - 1])) return match
    const pick = (letters: string, digits: string): number => axis === 'row' ? Number(digits) - 1 : colIndex(letters)
    const build = (d: string, letters: string, dd: string, digits: string, i: number): string =>
      axis === 'row' ? `${d}${letters}${dd}${i + 1}` : `${d}${colName(i)}${dd}${digits}`
    if (l2 === undefined || n2 === undefined) {
      const i = move(pick(l1, n1))
      return i === null ? '#REF!' : build(d1, l1, d2, n1, i)
    }
    const a = pick(l1, n1)
    const b = pick(l2, n2)
    let a2 = move(a)
    let b2 = move(b)
    if (a2 === null && b2 === null) return '#REF!'
    if (a2 === null) a2 = at
    if (b2 === null) b2 = at - 1
    if (a2 > b2) return '#REF!'
    return `${build(d1, l1, d2, n1, a2)}:${build(d3 ?? '', l2, d4 ?? '', n2, b2)}`
  })
}

export { isErr as _isErrForChecks }
