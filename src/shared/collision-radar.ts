/**
 * M479. THE COLLISION RADAR — two lanes of one repository that touch the same
 * files, found while both still run rather than at the second merge.
 *
 * Two levels, and the difference is the point. An OVERLAP is two lanes whose
 * changes (committed and not, against where each left the main branch) name
 * the same file: worth knowing, often harmless. A CONFLICT is git's own
 * verdict: a trial merge of the two branches (`git merge-tree --write-tree`,
 * which writes objects and touches no checkout, index or ref) stops on those
 * files. Only committed work takes part in the trial; that is said, never
 * hidden, because an agent's uncommitted edits can still collide.
 *
 * Pure: types, the parse and the words. The scan is `main/collision-radar.ts`.
 */

/** Pairs grow with the square, and each overlapping pair is a git call: the bridge takes at most this many lanes. */
export const RADAR_LANES_MAX = 24

export interface RadarLane {
  /** The panel (or task) id the lane belongs to; the card a flag lands on. */
  id: string
  /** The lane's worktree path. */
  path: string
}

export interface RadarCollision {
  /** The two lanes, by id, in the order given. */
  a: string
  b: string
  /** Files both lanes changed. */
  files: string[]
  /** Files git's trial merge of the two branches stops on; empty when it merges clean; null when the trial could not run. */
  conflicts: string[] | null
}

export interface RadarReport {
  at: number
  collisions: RadarCollision[]
  /** Lanes the radar could not read, by id, with the reason. */
  unread: { id: string; reason: string }[]
}

/**
 * `git merge-tree --write-tree --name-only --no-messages -z A B`: the tree
 * OID, then (on exit 1) the conflicted paths, each NUL-terminated. Exit 0 is
 * clean, 1 is conflicts, anything else is an error — never read as clean.
 */
export function parseMergeTree(exitCode: number, stdout: string): { kind: 'clean' } | { kind: 'conflicts'; files: string[] } | { kind: 'error' } {
  if (exitCode === 0) return { kind: 'clean' }
  if (exitCode !== 1) return { kind: 'error' }
  const parts = stdout.split('\0').filter((p) => p !== '')
  // The first field is the (partial) tree's OID; a conflict with no named file is still a conflict.
  const files = [...new Set(parts.slice(1))].sort()
  return { kind: 'conflicts', files }
}

export interface RadarFlag {
  /** `conflict`: git's trial merge stops. `overlap`: the same files, merging clean (or the trial could not run). */
  kind: 'conflict' | 'overlap'
  /** The other lane, by id. */
  other: string
  text: string
}

/** A lane's side of each collision it is in: conflicts first, each naming the other lane. */
export function radarFlags(laneId: string, report: RadarReport, labelOf: (id: string) => string): RadarFlag[] {
  const out: RadarFlag[] = []
  const list = (fs: readonly string[]): string => `${fs.slice(0, 3).join(', ')}${fs.length > 3 ? ` and ${fs.length - 3} more` : ''}`
  for (const c of report.collisions) {
    if (c.a !== laneId && c.b !== laneId) continue
    const otherId = c.a === laneId ? c.b : c.a
    const other = labelOf(otherId)
    if (c.conflicts !== null && c.conflicts.length > 0) out.push({ kind: 'conflict', other: otherId, text: `conflicts with ${other} in ${list(c.conflicts)} — the two will not merge as they stand` })
    else out.push({ kind: 'overlap', other: otherId, text: `also changed by ${other}: ${list(c.files)}${c.conflicts === null ? ' (a trial merge could not run)' : ' — merges clean for now'}` })
  }
  return [...out.filter((f) => f.kind === 'conflict'), ...out.filter((f) => f.kind === 'overlap')]
}

/** The sentences alone. */
export function radarWords(laneId: string, report: RadarReport, labelOf: (id: string) => string): string[] {
  return radarFlags(laneId, report, labelOf).map((f) => f.text)
}
