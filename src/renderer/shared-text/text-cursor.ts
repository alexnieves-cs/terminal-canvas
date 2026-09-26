/**
 * The local caret in a shared file, as awareness will carry it — the one fact
 * about shared text that presence reports (usePresenceReport). A module-level
 * store rather than React state for presence-store.ts's reason: a caret moves
 * on every keystroke, and Canvas must not re-render for it.
 *
 * Free of yjs on purpose: usePresenceReport is reached from Canvas.tsx, and
 * yjs belongs in the lazily-loaded shared-text chunk only (binding.ts). The
 * positions arrive here already encoded.
 */
import type { TextCursor } from '@shared/presence'

let current: TextCursor | null = null
const listeners = new Set<() => void>()

export function localTextCursor(): TextCursor | null { return current }

/** Set (or clear, with null) the caret; a clear for a file that no longer holds it is ignored. */
export function setLocalTextCursor(next: TextCursor | null, clearing?: string): void {
  if (next === null && clearing !== undefined && current?.file !== clearing) return
  if (next === current || (next !== null && current !== null && next.file === current.file && next.anchor === current.anchor && next.head === current.head)) return
  current = next
  for (const l of listeners) l()
}

export function onLocalTextCursor(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
