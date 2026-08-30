/**
 * What one directory read answers, on the wire.
 *
 * A DISCRIMINATED UNION and never a null, and that is the whole design
 * decision in this file. M9a folded "git declined to open this repository"
 * into "this is not a repository" and the Changes section rendered NOTHING for
 * a whole milestone — the hardest failure to report, because nothing looks
 * wrong. A permission-denied directory, a path that is a file, a path that
 * vanished under a running panel, and a genuinely empty directory are four
 * situations with four different fixes, and a reader that collapses them
 * renders one silence for all four.
 *
 * Imports nothing at all, like settings-schema.ts, so both main and the
 * renderer can name these without either owning them.
 */

export type FsEntryKind = 'dir' | 'file' | 'symlink' | 'other'

export interface FsEntry {
  name: string
  kind: FsEntryKind
}

export type DirResult =
  /** `truncated` is a COUNT, not a flag: the remainder is reported ("+N more")
   *  rather than the list silently ending, the rule REVIEW_FILE_CAP already
   *  states for the review pane's file list. */
  | { kind: 'ok'; entries: FsEntry[]; truncated: number }
  /** The directory exists and the process may not read it. `detail` carries
   *  the OS's own reason, for the reason `repo-unreadable` carries git's: four
   *  causes have four fixes and only the OS knows which happened. */
  | { kind: 'unreadable'; detail: string }
  /** The path resolved to a file, not a directory. */
  | { kind: 'not-a-directory' }
  /** The path is not there at all — the ordinary state after an agent moves
   *  or deletes a directory the tree still has expanded. */
  | { kind: 'gone' }
