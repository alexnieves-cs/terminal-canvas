/**
 * M79. A RUN: one execution of a subgraph, recorded — which panels, which
 * edges, when each started and ended, each outcome, what it cost. Kept in
 * the layout beside groups and bookmarks, per workspace, with the record
 * rules every record obeys: absent is every pre-M79 file, a malformed run
 * is dropped by name, an entry naming a panel the workspace no longer has
 * is dropped and the run kept, a run with no surviving panel is dropped.
 */

import type { TemplateNode, TemplateEdge } from './templates'

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
  /**
   * M133. The template whose instantiation minted this run's panels, when
   * one did — the ONE mark the workflow panel's Runs tab filters on.
   *
   * ABSENT is every pre-M133 run and every run of panels the user wired by
   * hand, and it stays absent: a run with no mark is not guessed into a
   * template's list, because the alternative is a Runs tab that confidently
   * attributes somebody else's work to this workflow.
   */
  templateId?: string
  /**
   * M184. The template AS IT WAS when this run started — the snapshot every
   * outcome on the diagram is drawn from, so a later edit of the template can
   * never rewrite what a finished run says. ABSENT on every pre-M184 run and
   * on every run of panels nobody instantiated.
   */
  definition?: { templateId: string; revision: number; nodes: TemplateNode[]; edges: TemplateEdge[] }
  /** M184. Node key → the panel id the instantiation minted for it. Absent with `definition`. */
  mapping?: Record<string, string>
}

/** The newest kept; a workspace that ran a thousand times is a history, not a layout. */
export const RUNS_MAX = 50
