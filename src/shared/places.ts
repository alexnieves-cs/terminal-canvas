/**
 * M100. PLACES — a teammate's authority over the filesystem, as arithmetic
 * over REAL paths.
 *
 * A path is inside a place iff its real, normalised form is the place's real
 * form or lies under it. Three traversal cases are the whole point and each
 * is a check (`verify:teammates places.1–.3`): `..` walking out of a typed
 * prefix that looked right; a symlink inside a place pointing out (the real
 * path decides — M87's broker learned the same lesson with `%2e%2e` on the
 * normalised URL); and a relative path, which is REFUSED outright rather
 * than resolved against any root, because every root this app could pick
 * (cwd, home, the place) is a guess the user did not make.
 *
 * A path that does not exist is outside (nothing to grant), and no places is
 * NO filesystem, never everything (`places.4`).
 *
 * `realpath` is injected so the whole rule runs under plain node.
 */
import { posix } from 'node:path'

export type Realpath = (p: string) => string

/** Absolute, `..` collapsed, no trailing slash (the root stays `/`). */
export function normalisePath(p: string): string | null {
  if (!p.startsWith('/')) return null
  const n = posix.normalize(p)
  return n.length > 1 ? n.replace(/\/+$/, '') : n
}

function realOf(p: string, realpath: Realpath): string | null {
  const norm = normalisePath(p)
  if (norm === null) return null
  try {
    const real = normalisePath(realpath(norm))
    return real
  } catch {
    return null
  }
}

export function insidePlace(candidate: string, places: readonly string[], realpath: Realpath): boolean {
  if (places.length === 0) return false
  const real = realOf(candidate, realpath)
  if (real === null) return false
  for (const place of places) {
    const p = realOf(place, realpath)
    if (p === null) continue
    if (real === p || real.startsWith(p === '/' ? '/' : p + '/')) return true
  }
  return false
}

/** The one refusal, with the fix: the folder to add is the candidate's own directory. */
export function placeRefusal(name: string, candidate: string): string {
  const norm = normalisePath(candidate) ?? candidate
  const shown = norm === '' ? '(no folder)' : norm
  return `${shown} is outside every place of ${name} — add ${shown === '(no folder)' ? 'a folder' : shown} to this teammate's places in the Teammates pane`
}
