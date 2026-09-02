/**
 * M51. The pure scanner the terminal's link provider maps over a rendered
 * line. No DOM, no xterm — verify:viewport links.1 runs it under plain node.
 *
 * Two kinds. A URL is http(s)://… up to whitespace. A path is absolute, ~/,
 * ./, ../, or relative with at least one slash, of path characters, with an
 * optional :line or :line:col suffix that is PART of the link (an agent
 * prints `src/x.ts:118` and the line is the point). Trailing sentence
 * punctuation — `.`, `,`, `;`, `:`, `)`, `]` — is excluded from both: a URL
 * at the end of a sentence is not "…5173.", and a path in a parenthetical
 * is not "…ts:3)". Ranges are exact because xterm underlines exactly the
 * columns it is given.
 */
export interface FoundLink {
  kind: 'url' | 'path'
  text: string
  /** Character offsets into the line: [start, end). */
  start: number
  end: number
}

const URL_RE = /https?:\/\/[^\s]+/g
// A path: an optional leading ~ or . segment, then at least one slash
// somewhere, then path characters; an optional :line(:col).
const PATH_RE = /(?:~|\.{1,2})?\/?(?:[\w.@%+-]+\/)+[\w.@%+-]+(?::\d+(?::\d+)?)?|(?:~|\.{1,2})\/[\w.@%+-]+(?::\d+(?::\d+)?)?/g
const TRAIL = /[.,;:)\]]+$/

function trim(text: string): string {
  // Strip trailing punctuation, but never a digit-ending :line suffix's
  // digits — TRAIL matches only punctuation, so `x.ts:118.` → `x.ts:118`.
  return text.replace(TRAIL, '')
}

export function findLinks(line: string): FoundLink[] {
  const out: FoundLink[] = []
  const taken: Array<[number, number]> = []
  const overlaps = (s: number, e: number): boolean => taken.some(([a, b]) => s < b && a < e)
  for (const m of line.matchAll(URL_RE)) {
    const text = trim(m[0])
    if (text.length <= 'https://'.length) continue
    const start = m.index ?? 0
    out.push({ kind: 'url', text, start, end: start + text.length })
    taken.push([start, start + text.length])
  }
  for (const m of line.matchAll(PATH_RE)) {
    const raw = m[0]
    const start = m.index ?? 0
    const text = trim(raw)
    if (!text.includes('/')) continue
    // A bare "/" or a path that is only punctuation is not a link.
    if (text.replace(/[/~.]/g, '') === '') continue
    if (overlaps(start, start + text.length)) continue
    out.push({ kind: 'path', text, start, end: start + text.length })
    taken.push([start, start + text.length])
  }
  return out.sort((a, b) => a.start - b.start)
}
