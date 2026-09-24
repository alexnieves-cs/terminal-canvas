import { useSyncExternalStore } from 'react'

/**
 * M324. WHO IS SHOWING A CONVERSATION'S COMPOSER. A chat has one composer
 * at a time: the canvas's panel stays mounted behind the focus view (M268),
 * and two mounted composers for one chat would each take the same insert,
 * each hold a draft, and each write it back — two authors of one text. The
 * focus view CLAIMS the chat while it is open; the canvas panel renders a
 * one-line note in its place until the claim is released.
 */

const claims = new Map<string, number>()
const listeners = new Set<() => void>()
let version = 0

function changed(): void {
  version += 1
  for (const cb of listeners) cb()
}

/** Returns its own release. Counted, so two claims need two releases. */
export function claimConversation(id: string): () => void {
  claims.set(id, (claims.get(id) ?? 0) + 1)
  changed()
  let released = false
  return () => {
    if (released) return
    released = true
    const n = (claims.get(id) ?? 1) - 1
    if (n <= 0) claims.delete(id)
    else claims.set(id, n)
    changed()
  }
}

export function conversationClaimed(id: string): boolean {
  return claims.has(id)
}

export function useConversationClaimed(id: string): boolean {
  useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb) } },
    () => version,
    () => version
  )
  return claims.has(id)
}
