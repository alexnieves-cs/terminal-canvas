import { agoShort } from '@shared/time-ago'
/**
 * M279. `12s` / `4m` / `2h` — the age of an event, for a feed row. One
 * function for the inspector's activity tab and the orchestration page, so
 * the same event never reads two ages on two surfaces.
 */
export function formatAgo(at: number, now: number = Date.now()): string {
  return agoShort(now - at)
}
