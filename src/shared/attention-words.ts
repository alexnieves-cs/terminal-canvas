/**
 * The ONE vocabulary for "a person is wanted" (daily loop 4.1).
 *
 * The attention queue Cmd+J cycles is terminals (a bell, an idle agent's
 * wants-you) AND chats (a pending permission) in one list. Before this module
 * each surface named it for itself: the pill said "N chats need you" over a
 * queue of terminals, the dock said "N waiting", the OS notification said
 * "wants you (N panels waiting)" and Orchestrate said "waiting on you". Four
 * words for one fact reads as four different facts. The state word is
 * `needs you` (panel-state.ts, run-outcome.ts); the noun is `panel`, because
 * that is the only noun true of every member of the queue.
 *
 * Shared, not renderer-only, because main's notification body is one of the
 * sentences — plain data, no DOM, so verify:pill runs it in plain node.
 */

/** The state word. Amber, and amber means this and nothing else. */
export const NEEDS_YOU = 'needs you'

// A count that is not a positive finite integer is NONE: callers print nothing
// rather than "0 panels need you" (the rest layer's zero-value rule).
const positive = (n: number): number => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0)

/** `1 panel needs you` / `3 panels need you`; '' for none. */
export function needsYouCount(n: number): string {
  const c = positive(n)
  if (c === 0) return ''
  return c === 1 ? `1 panel ${NEEDS_YOU}` : `${c} panels need you`
}

/** `<label> needs you` — one named panel. */
export function needsYouNamed(label: string): string {
  return `${label} ${NEEDS_YOU}`
}

/**
 * True when `text` is a queue-count sentence — the current spelling and the
 * two retired ones, so a caller still holding an old string is still caught
 * by the toast rule rather than toasting a restatement of the pill.
 */
export function isNeedsYouCount(text: string): boolean {
  return /^\d+ (panels?|chats?|agents?) needs? you\b/i.test(text.trim())
}
