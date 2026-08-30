import type { DirResult, FsEntryKind } from '@shared/fs-tree'

/**
 * What the file tree column renders, as plain data.
 *
 * Pure by construction — no React, no DOM, no bridge reference — for the same
 * reason rail-rows.ts is: it puts the two pieces of this milestone most able to
 * be subtly wrong (the flattening and the signature) in the cheapest verify
 * tier the repo has, and it means the tree's row logic can be asserted without
 * mounting anything.
 */

export type FileRowState = 'collapsed' | 'expanded' | 'loading' | 'note'

export interface FileRow {
  /** Absolute. The key React renders on and the value a click acts on. */
  path: string
  name: string
  depth: number
  kind: FsEntryKind
  state: FileRowState
  /** Present only for `note`: the arm's own sentence. */
  note?: string
}

/** Kept in one place so the four arms' wording cannot drift between renders. */
function noteFor(result: DirResult): string | undefined {
  switch (result.kind) {
    case 'unreadable': return `cannot read this directory — ${result.detail}`
    case 'not-a-directory': return 'not a directory'
    case 'gone': return 'this directory is gone'
    case 'ok': return undefined
  }
}

/**
 * Flatten the expanded set into rows, depth-first.
 *
 * The ROOT is not a row — it is the column's heading. A loading or note row is
 * a CHILD row at its parent's depth + 1 carrying the parent's own path, so an
 * unreadable directory reads as that directory speaking rather than as a
 * sibling of the thing it describes.
 *
 * Recursion is over the EXPANDED SET, never over the filesystem: nothing here
 * can walk a directory the user did not open, which is what makes a symlink
 * cycle unreachable without the user clicking through it one level at a time.
 *
 * Collapsing therefore removes descendants transitively for free — an
 * unexpanded directory is simply never recursed into, so there is no
 * one-level-collapse bug to write. That is the argument for a derived
 * flattening over a mutated row array.
 */
export function buildFileRows(
  root: string,
  dirs: ReadonlyMap<string, DirResult>,
  expanded: ReadonlySet<string>
): FileRow[] {
  const out: FileRow[] = []

  const walk = (dir: string, depth: number): void => {
    const result = dirs.get(dir)
    if (result === undefined) {
      // Expanded, not yet answered. Only reachable below the root; the root's
      // own pending state is the column's heading's business, not a row's.
      if (depth > 0) {
        out.push({ path: dir, name: '', depth, kind: 'dir', state: 'loading' })
      }
      return
    }
    if (result.kind !== 'ok') {
      out.push({ path: dir, name: '', depth, kind: 'dir', state: 'note', note: noteFor(result) })
      return
    }
    for (const entry of result.entries) {
      // The model never re-sorts. main already sorted, and two sorts is two
      // places to disagree about one order.
      const path = `${dir}/${entry.name}`
      const isOpen = entry.kind === 'dir' && expanded.has(path)
      out.push({
        // KEY ORDER is load-bearing: treeSignature serialises these rows and
        // JSON.stringify preserves insertion order, so reshuffling this
        // literal for tidiness changes every signature at once.
        path,
        name: entry.name,
        depth,
        kind: entry.kind,
        state: isOpen ? 'expanded' : 'collapsed'
      })
      if (isOpen) walk(path, depth + 1)
    }
    if (result.truncated > 0) {
      out.push({
        path: `${dir}#truncated`,
        name: '',
        depth: depth + 1,
        kind: 'other',
        state: 'note',
        note: `+${result.truncated} more`
      })
    }
  }

  walk(root, 0)
  return out
}

/**
 * The whole reason this module is not just a `.map()` in Canvas.tsx.
 *
 * Canvas re-renders on every mousemove over the canvas (setCursor) and on
 * every frame of a drag (setPanelRect), so the rows array is rebuilt at 60Hz
 * for changes no row displays. Canvas freezes it on this signature; when the
 * signature is equal it returns the PREVIOUS array and memo'd FileTree
 * re-renders nothing.
 *
 * JSON.stringify, NEVER a join. railSignature records this for a user TITLE:
 * with an ordinary separator a label containing it could forge a field
 * boundary, make two different lists produce one string, and freeze the region
 * on stale rows. A FILENAME is a wider door — the user does not have to type
 * it, an agent writes it, into a directory this app does not own, and the tree
 * lists whatever is there. verify:rail 76.
 */
export function treeSignature(rows: readonly FileRow[]): string {
  return JSON.stringify(rows)
}

/**
 * The path as the user would type it standing in `root`.
 *
 * A path NOT under the root answers ABSOLUTE, and that is not defensive: it is
 * the state a panel that cd'd away between the read and the click produces,
 * and an absolute answer is the correct one there. See Canvas's insertPath for
 * the other half of the same rule — a path relative to a directory the target
 * shell is not in resolves to nothing, silently.
 */
export function relativePath(root: string, path: string): string {
  if (path === root) return '.'
  const prefix = root.endsWith('/') ? root : `${root}/`
  return path.startsWith(prefix) ? path.slice(prefix.length) : path
}

/**
 * POSIX single-quoting, applied only when it is needed.
 *
 * Quoting everything would be simpler and is wrong: it is noise on every
 * ordinary path, and this text lands in a prompt a human is reading. The
 * unquoted set is deliberately narrow — anything outside it, including a
 * space, a glob character or a newline (all legal in a macOS filename), is
 * quoted. A single quote cannot appear inside single quotes at all, so it
 * closes, escapes and reopens: the standard '\'' dance.
 */
const SAFE = /^[A-Za-z0-9_@%+=:,./-]+$/

export function shellQuote(path: string): string {
  if (SAFE.test(path)) return path
  return `'${path.split("'").join("'\\''")}'`
}
