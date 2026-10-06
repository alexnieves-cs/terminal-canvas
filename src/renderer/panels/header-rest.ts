/**
 * M442. What a header may say about time.
 *
 * The state word stays the one word from panel-state.ts. A duration is how
 * long that word has been true ("working · 12m"), which D3 allows on a
 * header. A cost or a token count is a metric and stays in the inspector.
 * Pure: no DOM, no clock of its own — the caller owns "since".
 */

/** Compact age. Under a minute is seconds; an exact minute drops the remainder. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  if (total < 60) return `${total}s`
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  if (minutes < 60) return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`
}

/** The header pill. A null elapsed leaves the word alone — a duration that has not started is not "0s". */
export function statePill(word: string, elapsedMs: number | null): string {
  if (elapsedMs === null || !Number.isFinite(elapsedMs)) return word
  return `${word} · ${formatDuration(elapsedMs)}`
}

/** False when the text is a metric. A duration form is allowed. */
export function headerAllows(text: string): boolean {
  return !/\$|\btoken/i.test(text)
}

const firstSeen = new Map<string, number>()

/** How long this request has been on screen. The first call starts the clock. */
export function waitingSince(id: string, now: number): string {
  let since = firstSeen.get(id)
  if (since === undefined) {
    since = now
    firstSeen.set(id, now)
  }
  return formatDuration(Math.max(0, now - since))
}
