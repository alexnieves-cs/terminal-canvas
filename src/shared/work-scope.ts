/**
 * M196 (D04). WHICH REPOSITORY, and whether the work is happening in a lane
 * of it. Pure: it resolves nothing on disk, spawns nothing and grants nothing.
 *
 * Three facts that this app had been merging two at a time, and the whole
 * policy is that they stay apart:
 *
 * - The WORKING DIRECTORY — where a process actually runs. `M194`'s
 *   `inspectionDirectory` answers it and is untouched by this module: a lane's
 *   files ARE the lane's files, and the Files tree was right before D04.
 * - The LANE — a linked worktree the work happens IN. It has an identity and
 *   it is not a repository. `git rev-parse --show-toplevel` inside one answers
 *   the LANE (measured, from the lane and from a subdirectory of it), which is
 *   why every door that asks only that question has been treating a lane as a
 *   repository of its own.
 * - The REPOSITORY — the canonical identity every lane of it shares.
 *
 * The failure this closes is quiet by construction: a door that keys anything
 * by the lane still answers a plausible, non-empty result, and nothing on
 * screen says the other doors are looking somewhere else. That is M83's own
 * reason for putting the memory root in ONE place, reached one level up
 * through a lane it did not consider.
 */

/**
 * A linked worktree the work is happening in. `branch` and `worktreeId` are
 * present only for a lane the APP minted — its record is the only source of
 * them, and git's `--git-common-dir` can name a parent without naming either.
 */
export interface LaneIdentity {
  /** The lane's own root. The directory a process there actually runs under. */
  path: string
  branch?: string
  worktreeId?: string
}

/**
 * THREE arms, never two. `no-repository` is the ordinary, quiet answer for
 * most panels and must stay quiet; `unavailable` is git DECLINING — missing,
 * refusing an unowned checkout, a cwd that vanished — and it has a different
 * fix. `main/index.ts`'s `memoryRoot` used to collapse them into "use the
 * path", which spends the three arms `resolveRepo` was built with and writes
 * a transient git failure's memories to a stray file, silently.
 */
export type WorkScope =
  | { kind: 'repository'; cwd: string; repository: string; lane?: LaneIdentity }
  | { kind: 'no-repository'; cwd: string }
  | { kind: 'unavailable'; cwd: string; reason: string }

/** What a lane record has to carry to be recognised. The layout record's shape, narrowed. */
export interface LaneRecord {
  id?: string
  path: string
  root: string
  branch?: string
}

/**
 * Absolute, `.` and `..` collapsed, no trailing slash (the root stays `/`);
 * `null` for anything relative, empty or `~`-prefixed.
 *
 * Hand-written, and it must stay that way: `@shared/places.ts` has this
 * function and imports `node:path` to get it, which the RENDERER cannot
 * bundle. `display-path.ts` is the precedent. A relative path is REFUSED
 * rather than resolved, for `places.ts`'s reason — every root this app could
 * resolve it against is a guess the user did not make.
 */
export function normaliseScopePath(path: string): string | null {
  if (!path.startsWith('/')) return null
  const out: string[] = []
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') { out.pop(); continue }
    out.push(segment)
  }
  return out.length === 0 ? '/' : `/${out.join('/')}`
}

/**
 * True when `path` IS `parent` or lies under it, on SEGMENT boundaries.
 *
 * The boundary is the point: a bare `startsWith` answers true for `/w/apiary`
 * against `/w/api`, which would translate a cwd to a NEIGHBOURING project's
 * repository — a wrong answer shaped exactly like a right one. `preview.ts`
 * delegates to this rather than keeping the twin it was written with: a second
 * containment rule would differ from this one precisely in the arm nobody
 * tests.
 */
export function insideDirectory(parent: string, path: string): boolean {
  const a = normaliseScopePath(parent)
  const b = normaliseScopePath(path)
  if (a === null || b === null) return false
  if (a === b) return true
  return b.startsWith(a === '/' ? '/' : `${a}/`)
}

/**
 * The lane `cwd` is in, from the app's own records.
 *
 * The LONGEST match wins. Records nest in principle (a lane whose root is
 * itself under another lane's path), and the shortest match would name a
 * grandparent repository for work happening in a child — the same class of
 * wrong-but-plausible answer the segment rule closes.
 *
 * Matching used to be exact path equality at all three of main's wiring sites
 * (`w.path === path`), so a cwd one directory INSIDE a lane translated
 * nowhere and was judged as its own repository, while the renderer answered
 * the same question with a segment prefix. Two authors of one fact.
 */
export function laneOfPath(cwd: string, records: readonly LaneRecord[]): LaneRecord | undefined {
  let best: LaneRecord | undefined
  for (const record of records) {
    if (!insideDirectory(record.path, cwd)) continue
    const current = normaliseScopePath(record.path)
    const chosen = best === undefined ? null : normaliseScopePath(best.path)
    if (current === null) continue
    if (chosen === null || current.length > chosen.length) best = record
  }
  return best
}
