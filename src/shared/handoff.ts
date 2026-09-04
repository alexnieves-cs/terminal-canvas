/**
 * M41 — handoff edges. The one automation a link carries, as a union, and
 * the bounds a handoff states about itself. Shared because the persisted
 * format (`layout-schema.ts`), the renderer's panel model (`panels.ts`) and
 * the inspector's sentences all name the same three fields, and three copies
 * of a union drift in the arm nobody tests.
 */

/**
 * When a handoff fires. M41's two: the source's process ended (`exit`), or
 * its agent's turn finished (`idle`). M78's three: `exit-ok` (exited 0),
 * `exit-fail` (any other exit — a signal is a failure), `always` (any exit
 * or a turn's end). Every pre-M78 file carries one of the first two.
 */
export type HandoffTrigger = 'exit' | 'idle' | 'exit-ok' | 'exit-fail' | 'always'

export const HANDOFF_TRIGGERS: readonly HandoffTrigger[] = ['exit', 'idle', 'exit-ok', 'exit-fail', 'always']

/** What happened at a source: its process exited with `code` (null for a signal), or its turn ended. */
export type HandoffEvent = { kind: 'exit'; code: number | null } | { kind: 'idle' }

/**
 * M78. THE ONE TABLE. Every edge asks this and nothing else decides whether
 * a handoff fires; a second copy of the table is exactly the drift the
 * shared union exists to prevent. `verify:viewport graph.1`.
 */
export function handoffFires(trigger: HandoffTrigger, event: HandoffEvent): boolean {
  switch (trigger) {
    case 'exit': return event.kind === 'exit'
    case 'idle': return event.kind === 'idle'
    case 'exit-ok': return event.kind === 'exit' && event.code === 0
    case 'exit-fail': return event.kind === 'exit' && event.code !== 0
    case 'always': return true
  }
}

export type LinkAutomation =
  | { kind: 'restart-on-exit'; enabled: boolean }
  | { kind: 'handoff'; enabled: boolean; trigger: HandoffTrigger }

/** The payload is the source's log tail, bounded twice; both bounds are named in the inspector row. */
export const HANDOFF_MAX_LINES = 200
export const HANDOFF_MAX_CHARS = 16 * 1024

/** A queued payload whose target has not started by then is dropped, and the row says so. */
export const HANDOFF_QUEUE_MS = 5 * 60 * 1000
