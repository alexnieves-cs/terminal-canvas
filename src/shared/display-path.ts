/**
 * M164. THE PATH RULE's one helper (the brief, rule 3).
 *
 * A panel body shows the repository's basename and the path relative to it —
 * `repo/src/server.ts` — never `/private/var/folders/hl/…/T/tc shot fixtures
 * golden/repo/src/server.ts` at full width. The full path rides the element's
 * `title` (and the inspector's Detail tab), which is why `full` is always
 * returned beside `short`: a caller that shows one without the other has half
 * the rule.
 *
 * Arms, each pinned by `verify:rail path.1`:
 *   - under `root`: the root's basename + the path relative to it; the root
 *     itself is its basename. A trailing slash on the root is tolerated (git
 *     and the places gate both hand roots either way).
 *   - outside every root: the palette's `shortPath` — the last two segments
 *     behind `…/`, with its one-letter rule — so the app has ONE shortening,
 *     not two that differ where nobody tests.
 *   - no root and a `home` given: `~` for the home prefix (the sheet's WHERE
 *     field and the teammates' places live here).
 *   - never the empty string: an empty path reads as `—`, so a row with no
 *     path says so instead of collapsing to nothing.
 *
 * Pure and plain-node: no `path` module (the renderer has none), forward
 * slashes only (this app is macOS-only and every path it prints is POSIX).
 */
export interface DisplayPath {
  /** What the body prints at rest. */
  short: string
  /** The absolute path, for the `title` tooltip and the inspector. */
  full: string
}

const strip = (p: string): string => p.replace(/\/+$/, '')

/** The palette's shortening, duplicated in name only: `shortPath` lives in the renderer and this module is shared. */
function lastSegments(path: string, keep = 2): string {
  const trimmed = strip(path)
  const parts = trimmed.split('/').filter((s) => s !== '')
  if (parts.length <= keep) return trimmed
  let n = keep
  while (n > 1 && parts[parts.length - n].length < 2) n -= 1
  return `…/${parts.slice(-n).join('/')}`
}

export function displayPath(path: string, root?: string, home?: string): DisplayPath {
  const full = path
  if (path === '') return { short: '—', full }
  if (root !== undefined && root !== '') {
    const r = strip(root)
    const base = r.split('/').filter((s) => s !== '').pop() ?? r
    const p = strip(path)
    if (p === r) return { short: base, full }
    if (p.startsWith(r + '/')) return { short: `${base}/${p.slice(r.length + 1)}`, full }
  }
  if (home !== undefined && home !== '') {
    const h = strip(home)
    const p = strip(path)
    if (p === h) return { short: '~', full }
    if (p.startsWith(h + '/')) return { short: `~/${p.slice(h.length + 1)}`, full }
  }
  return { short: lastSegments(path), full }
}
