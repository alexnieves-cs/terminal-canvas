/**
 * M79. A RUN: one execution of a subgraph, recorded — which panels, which
 * edges, when each started and ended, each outcome, what it cost. Kept in
 * the layout beside groups and bookmarks, per workspace, with the record
 * rules every record obeys: absent is every pre-M79 file, a malformed run
 * is dropped by name, an entry naming a panel the workspace no longer has
 * is dropped and the run kept, a run with no surviving panel is dropped.
 */

export interface RunEntry {
  panelId: string
  startedAt: number
  endedAt?: number
  /** In the automation list's own vocabulary: `exit 0`, `a turn`, `skipped — …`, `handed off …`. */
  outcome?: string
}

export interface PersistedRun {
  id: string
  name: string
  panelIds: string[]
  edges: Array<{ from: string; to: string }>
  startedAt: number
  /** Absent while the run is open. */
  endedAt?: number
  entries: RunEntry[]
  /** Priced at sealing; absent when any panel's model was unpriced. */
  costUsd?: number
}

/** The newest kept; a workspace that ran a thousand times is a history, not a layout. */
export const RUNS_MAX = 50
