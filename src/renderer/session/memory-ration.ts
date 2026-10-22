import type { Tier } from '@renderer/canvas/lod'

/**
 * M508 (E5, backlog #64). Rationing terminal memory, not only WebGL contexts.
 *
 * LIVE_BUDGET rations contexts, and nothing rationed the buffers: every
 * session that ever attached keeps a Terminal with up to FULL_SCROLLBACK lines
 * for the renderer's whole lifetime, and since M4c sessions outlive days of
 * canvas use. This is the governor for that footprint, which no pid can see
 * (#18 measures processes; this is the renderer's own memory).
 *
 * TRIM, NEVER DISPOSE. A rationed session keeps its Terminal, its PTY, its
 * process and its last screen: xterm drops only the oldest scrollback rows
 * when `scrollback` shrinks, so the card's tail (#53's truthful last screen)
 * still reads the same lines. pty.kill keeps exactly its two callers and
 * nothing here can reach either. What is lost is old history in the renderer
 * only; main's scrollback log still holds it for search and the tail read.
 *
 * Pure so verify:registry can pin the decision without a terminal: the
 * registry owns applying it (session-registry.ts, rationMemory).
 */

/** What create-terminal.ts gives every terminal, and what a rationed one gets back. */
export const FULL_SCROLLBACK = 10_000
/** Enough to scroll back a screenful or two on return; a tenth of the full buffer. */
export const RATIONED_SCROLLBACK = 1_000
/** A session nobody has looked at for this long is rationed. */
export const RATION_AFTER_MS = 30 * 60 * 1000
/** How often the canvas asks the registry to ration. Low frequency: the threshold is half an hour. */
export const RATION_CHECK_MS = 60 * 1000

export interface RationInput {
  id: string
  tier: Tier
  /** The later of the last focus and the last time the session went on or off screen. */
  seenAt: number
  rationed: boolean
}

/**
 * Which sessions to trim now. A LIVE session is never trimmed — it is on
 * screen, and someone may be scrolling it — and one already rationed is not
 * trimmed twice. Restoring is not decided here: the registry restores on the
 * way back to live, at the moment it happens, not on the next tick.
 */
export function rationPlan(sessions: readonly RationInput[], now: number): string[] {
  return sessions
    .filter((s) => s.tier !== 'live' && !s.rationed && now - s.seenAt >= RATION_AFTER_MS)
    .map((s) => s.id)
}
