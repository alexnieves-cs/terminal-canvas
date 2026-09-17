/**
 * M279. `12s` / `4m` / `2h` — the age of an event, for a feed row. One
 * function for the inspector's activity tab and the orchestration page, so
 * the same event never reads two ages on two surfaces.
 */
export function formatAgo(at: number, now: number = Date.now()): string {
  const s = Math.max(0, Math.floor((now - at) / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h`
}
