/**
 * M621. How long ago something happened, in ONE place and at two densities.
 * Before it, eight surfaces each wrote their own: the same minute read
 * "4m ago", "4 min ago" and "4m" depending on where it was shown, and "just
 * now" meant anything from under 1 to under 60 seconds.
 *
 * - `agoShort` is the rest-layer form for a feed row or a badge: `12s`, `4m`,
 *   `2h`, `3d`. No "ago" — the row's own layout says it is an age.
 * - `agoWords` is the sentence form: `just now`, `12s ago`, `4 min ago`,
 *   `2 h ago`, `3 d ago`.
 *
 * Both take the elapsed milliseconds (clamped at 0), so a caller with `at`
 * and `now` passes `now - at` and a caller with a replay offset passes that.
 */
const S = 1000
const M = 60 * S
const H = 60 * M

/** Under this, a sentence says "just now" rather than a count of seconds. */
export const AGO_JUST_NOW_MS = 10 * S
/** Hours stay hours up to two days, so "yesterday evening" never reads as "1 d". */
const DAYS_FROM_MS = 48 * H

export function agoShort(ms: number, opts: { justNowUnderMs?: number } = {}): string {
  const t = Math.max(0, ms)
  if (opts.justNowUnderMs !== undefined && t < opts.justNowUnderMs) return 'just now'
  // Floored, as M279's feed rows always were: a row never claims an age it has not reached.
  if (t < M) return `${Math.floor(t / S)}s`
  if (t < H) return `${Math.floor(t / M)}m`
  if (t < DAYS_FROM_MS) return `${Math.floor(t / H)}h`
  return `${Math.floor(t / (24 * H))}d`
}

export function agoWords(ms: number): string {
  const t = Math.max(0, ms)
  if (t < AGO_JUST_NOW_MS) return 'just now'
  if (t < M) return `${Math.floor(t / S)}s ago`
  // Rounded, as the sentences always were; 59.5 minutes is still "59 min", never "60 min".
  if (t < H) return `${Math.min(59, Math.round(t / M))} min ago`
  if (t < DAYS_FROM_MS) return `${Math.round(t / H)} h ago`
  return `${Math.round(t / (24 * H))} d ago`
}
