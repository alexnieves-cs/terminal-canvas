/**
 * M607. The night film's second door. "Last night ▸" lived only on the
 * return briefing, so once that card was put away ("Got it") the film could
 * not be made at all. The palette row runs the same `useLastNight` the card
 * does, through this one seam: the hook registers its runner while it is
 * mounted, and the row asks for it at press time.
 */
let runner: (() => void) | null = null

export function setLastNightRunner(next: (() => void) | null): void {
  runner = next
}

/** False when nothing is mounted to make the film (the row says so). */
export function runLastNight(): boolean {
  if (runner === null) return false
  runner()
  return true
}
