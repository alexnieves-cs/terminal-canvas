import type { PanelId } from './types'

/**
 * A panel's session-start snapshot: the repository it was spawned into, and a
 * commit object representing that repository's state at that moment.
 *
 * In shared/ rather than main/ because layout-schema.ts persists it and the
 * renderer receives ReviewResult over IPC.
 */
export interface ReviewBaseline {
  /** Absolute path to the repository root, as `rev-parse --show-toplevel` gave it. */
  root: string
  /** A stash-create commit, or HEAD when the tree was clean at spawn. */
  sha: string
}

export interface ReviewFile {
  path: string
  added: number
  removed: number
  binary: boolean
  /** True for a file git has never tracked; it has no counts to report. */
  untracked: boolean
  renamedFrom?: string
}

/**
 * Every arm is a designed state, not an error path. `not-a-repo` in
 * particular is the ordinary answer for a panel in the home directory, and
 * rendering an error for it would put a red field on most panels most of the
 * time.
 */
export type ReviewResult =
  | { kind: 'not-a-repo' }
  | { kind: 'never-started' }
  | { kind: 'git-missing' }
  | { kind: 'baseline-lost'; root: string }
  | { kind: 'clean'; root: string }
  | { kind: 'changes'; root: string; files: ReviewFile[]; added: number; removed: number }
  /**
   * Two or more panels that have RUN share this repository, so no per-panel
   * diff is attributable: each panel's diff-since-its-own-baseline contains
   * everything the others did afterwards. The files are still reported —
   * that is true at the repository level — and `panelCount` is what the pane
   * says instead of a name.
   */
  | { kind: 'shared'; root: string; panelCount: number; files: ReviewFile[] }

export type { PanelId }
