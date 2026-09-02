/**
 * M41 — handoff edges. The one automation a link carries, as a union, and
 * the bounds a handoff states about itself. Shared because the persisted
 * format (`layout-schema.ts`), the renderer's panel model (`panels.ts`) and
 * the inspector's sentences all name the same three fields, and three copies
 * of a union drift in the arm nobody tests.
 */

/** When a handoff fires: the source's process ended, or its agent's turn finished. */
export type HandoffTrigger = 'exit' | 'idle'

export type LinkAutomation =
  | { kind: 'restart-on-exit'; enabled: boolean }
  | { kind: 'handoff'; enabled: boolean; trigger: HandoffTrigger }

/** The payload is the source's log tail, bounded twice; both bounds are named in the inspector row. */
export const HANDOFF_MAX_LINES = 200
export const HANDOFF_MAX_CHARS = 16 * 1024

/** A queued payload whose target has not started by then is dropped, and the row says so. */
export const HANDOFF_QUEUE_MS = 5 * 60 * 1000
