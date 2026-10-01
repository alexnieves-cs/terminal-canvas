/**
 * The palette's matcher. Hand-written rather than a dependency: the renderer
 * runs under a strict CSP (default-src 'self'), and a matcher small enough to
 * test exhaustively is cheaper than a dependency decision.
 *
 * Pure — no DOM, no React — which is what puts it in the plain-node
 * verify:palette tier alongside palette-model.ts.
 */

export interface FuzzyMatch {
  score: number
  /** Indices into the ORIGINAL target, so the view can highlight them. */
  positions: number[]
}

/** What counts as the start of a word, for the boundary bonus. */
const BOUNDARY = /[\s\-_/.]/

const CONTIGUOUS_BONUS = 10
const BOUNDARY_BONUS = 8
/** Small, and capped, so "earlier" breaks ties without outweighing structure. */
const EARLINESS_MAX = 4

/**
 * Greedy leftmost subsequence match. Returns null when `query` is not a
 * subsequence of `target` at all — the palette needs "remove this row", not
 * "rank it last".
 *
 * Greedy, not optimal: for 'ab' against 'a-ab' it takes the first 'a' and
 * scores lower than the contiguous 'ab' later in the string. Optimal matching
 * is a dynamic program over both strings, and the difference only shows up in
 * ranking, never in whether a row appears. Not worth the cost until a real
 * query ranks visibly wrongly.
 */
export function fuzzyMatch(query: string, target: string): FuzzyMatch | null {
  if (query === '') return { score: 0, positions: [] }
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  const positions: number[] = []
  let ti = 0

  for (const ch of q) {
    // A space SEPARATES terms rather than being matched: "new pan" should find
    // "New panel", and every real separator in a target is already scored as a
    // word boundary below.
    if (ch === ' ') continue
    let found = -1
    while (ti < t.length) {
      const here = ti
      ti += 1
      if (t[here] === ch) {
        found = here
        break
      }
    }
    if (found === -1) return null
    positions.push(found)
  }

  // A query of nothing but spaces matched nothing and excluded nothing.
  if (positions.length === 0) return { score: 0, positions: [] }

  let score = 0
  for (let i = 0; i < positions.length; i += 1) {
    const p = positions[i]
    if (i > 0 && p === positions[i - 1] + 1) score += CONTIGUOUS_BONUS
    if (p === 0 || BOUNDARY.test(target[p - 1])) score += BOUNDARY_BONUS
  }
  score += Math.max(0, EARLINESS_MAX - positions[0])
  return { score, positions }
}

/**
 * M409 (C5). The words of a target, for the word-start tiers below: split on
 * whitespace and on the punctuation this app's titles use between words.
 */
const WORD_SPLIT = /[\s\-_/.:,;()[\]…·—'"|<>=+]+/

/**
 * M409 (C5). Does every term of `query`, IN ORDER, begin a word of `target`?
 * "add a" → "Add a sticky note" yes; → "Deck: keep or discard proposed
 * slides" no, though "adda" is a subsequence of it. fuzzyMatch skips spaces,
 * so "add a" WAS "adda" there, and 174 of 184 rows answered it.
 */
export function wordStarts(query: string, target: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t !== '')
  if (terms.length === 0) return false
  const words = target.toLowerCase().split(WORD_SPLIT).filter((w) => w !== '')
  let w = 0
  for (const term of terms) {
    while (w < words.length && !words[w].startsWith(term)) w += 1
    if (w === words.length) return false
    w += 1
  }
  return true
}

/**
 * M409 (C5). Is the query (spaces ignored, two letters or more) the start of
 * the target's initials — "np" for "New panel", "rew" for "Review every
 * worktree"? The most common way people type into a palette, and a tier of
 * its own so it is never mistaken for a weak scatter.
 */
export function initialsStart(query: string, target: string): boolean {
  const q = query.toLowerCase().replace(/\s+/g, '')
  if (q.length < 2) return false
  const initials = target.toLowerCase().split(WORD_SPLIT).filter((w) => w !== '').map((w) => w[0]).join('')
  return initials.startsWith(q)
}
