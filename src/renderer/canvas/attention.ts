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

/**
 * Filters `queue` down to ids present in `known`, preserving order.
 *
 * The attention queue and the live panel list are updated by two different
 * actors on two different schedules: the renderer disposes a closed panel's
 * session and clears its agent state synchronously, but `pty:kill` is still
 * in flight to main when it does — and if main emits one more `agent:state`
 * for that panel before the kill lands (its idle tick, a last bell), the
 * store re-inserts an id for a panel that no longer exists. Under M6c's
 * `session.killed` guard, main never sends the matching `exited`, so nothing
 * ever clears that entry again: it is a permanent phantom at whatever
 * position it landed in the queue.
 *
 * A caller that seats the cursor on a phantom id before checking whether a
 * panel exists for it is worse than not filtering at all — the cursor
 * "advances" onto an id it can never leave, so every later press re-picks
 * the same unreachable entry and the key is dead for the rest of the
 * renderer's life, not just for one press. Filtering the queue before it
 * ever reaches `nextAttentionId` removes the phantom from the cycle
 * entirely, so a queue with one stale entry among real ones still cycles
 * cleanly through the real ones instead of going silent every time the
 * cursor would land on the ghost.
 */
export function reachableQueue(queue: readonly string[], known: ReadonlySet<string>): string[] {
  return queue.filter((id) => known.has(id))
}
