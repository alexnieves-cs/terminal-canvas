import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { DirResult, FsEntry, FsEntryKind } from '../shared/fs-tree'

/**
 * One directory, read once, never recursively.
 *
 * Plain-node tier, like prompts.ts: it imports node:fs and its own shared
 * types and nothing else, and it is `electron` and `node-pty` that move a
 * module out of that tier, not the filesystem.
 *
 * The cwd arrives ALREADY EXPANDED. Resolving `~` is main's job but not this
 * module's — the ipc.ts handler calls resolveCwd before it gets here, exactly
 * as readProjectPrompts' own header says of the same boundary.
 */

/**
 * A cap, not a preference. The directory is whatever the user pointed a panel
 * at, so the entry count is an attacker-shaped input in the ordinary case of
 * "I opened a panel in a repository I just cloned". node_modules is not
 * special-cased and does not need to be: nothing here recurses, so an
 * unexpanded directory costs nothing at all.
 */
export const MAX_DIR_ENTRIES = 500

function kindOf(entry: { isDirectory(): boolean; isFile(): boolean; isSymbolicLink(): boolean }): FsEntryKind {
  // Symlink FIRST. withFileTypes reports the link itself rather than its
  // target, so isDirectory() is false for a symlinked directory — but testing
  // isDirectory first would still be wrong the day that changes, and the order
  // is what makes "never followed" a property of this function rather than an
  // accident of the API.
  if (entry.isSymbolicLink()) return 'symlink'
  if (entry.isDirectory()) return 'dir'
  if (entry.isFile()) return 'file'
  // Sockets, FIFOs, devices. Named rather than dropped: a row the user can see
  // and cannot expand is honest; a silently missing entry is not.
  return 'other'
}

/** Directories first, then by name, case-insensitively. */
function compare(a: FsEntry, b: FsEntry): number {
  const aDir = a.kind === 'dir' ? 0 : 1
  const bDir = b.kind === 'dir' ? 0 : 1
  if (aDir !== bDir) return aDir - bDir
  const byLower = a.name.toLowerCase().localeCompare(b.name.toLowerCase())
  // The tiebreak matters on a case-sensitive filesystem holding both `A` and
  // `a`: without it their order is localeCompare's answer for two equal
  // strings, which is 0, and the sort is then unstable across runs — the
  // reshuffling readProjectPrompts' sort() exists to prevent.
  return byLower !== 0 ? byLower : a.name.localeCompare(b.name)
}

export function readDir(path: string, opts: { showHidden: boolean }): DirResult {
  let raw
  try {
    raw = readdirSync(path, { withFileTypes: true })
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    // Four arms, four fixes. See shared/fs-tree.ts for why this is not a null.
    if (code === 'ENOENT') return { kind: 'gone' }
    if (code === 'ENOTDIR') return { kind: 'not-a-directory' }
    return { kind: 'unreadable', detail: (err as Error).message }
  }

  const all: FsEntry[] = []
  for (const entry of raw) {
    // Hidden is a SettingDef rather than a hardcode — this repo's standing
    // rule for anything a user can toggle — and it defaults off because `.git`
    // at a repository root is pure noise in a navigator.
    if (!opts.showHidden && entry.name.startsWith('.')) continue
    all.push({ name: entry.name, kind: kindOf(entry) })
  }

  all.sort(compare)
  // Sorted BEFORE the cap, deliberately. Capping first would hand back
  // whatever readdir happened to answer first — a different 500 entries on
  // every filesystem, and no relation to what the user would look for.
  const entries = all.slice(0, MAX_DIR_ENTRIES)
  return { kind: 'ok', entries, truncated: all.length - entries.length }
}

/** Exported for the ipc handler; kept here so the join is not re-derived. */
export function childPath(dir: string, name: string): string {
  return join(dir, name)
}
