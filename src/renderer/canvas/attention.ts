/**
 * Which panel Cmd+J visits next.
 *
 * Pure and separate from agent-state-store.ts on purpose: the store's job is
 * to know WHO is waiting, and this is the rule for WHERE THE CURSOR GOES —
 * the half with wrapping, a stale cursor and a one-element queue in it, i.e.
 * the half that can be subtly wrong in a way that reads to a user as a flaky
 * key rather than as an off-by-one.
 *
 * No DOM, no React: it belongs in the plain-node verify tier beside
 * viewport.ts and lod.ts.
 */

/** Forward through the queue, or backward (Shift+Cmd+J). */
export type JumpDirection = 1 | -1

/**
 * `queue` is in ENTRY order — longest-waiting first — so stepping forward is
 * "deal with the oldest thing next".
 *
 * `current` is the last panel the jump key visited, which may no longer be in
 * the queue: visiting a panel is exactly what leads to it being acknowledged.
 * A stale cursor restarts from the end the direction implies rather than
 * returning null, because a second press that does nothing is indistinguishable
 * from a broken keybinding.
 */
export function nextAttentionId(
  queue: readonly string[],
  current: string | null,
  direction: JumpDirection
): string | null {
  if (queue.length === 0) return null
  const at = current === null ? -1 : queue.indexOf(current)
  if (at === -1) return direction === 1 ? queue[0] : queue[queue.length - 1]
  return queue[(at + direction + queue.length) % queue.length]
}
