import { useSyncExternalStore } from 'react'

/**
 * M388. Which shape's label is open for typing — at most one, module-level.
 *
 * A store rather than Canvas state for the reason agent-links-store.ts gives:
 * Canvas is the whole shell, and a label opening must re-render the ONE shape
 * that edits, not the 9k-line component and every node under it. The writers
 * are the shape itself (double-click), the keyboard (Enter on a selected
 * shape; Tab's next step opens the new shape's label) and the verbs that mint
 * a shape a person is about to name.
 */
let editing: string | null = null
const listeners = new Set<() => void>()

export function setEditingShape(id: string | null): void {
  if (editing === id) return
  editing = id
  for (const fn of listeners) fn()
}

export function editingShape(): string | null {
  return editing
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export function useEditingShape(): string | null {
  return useSyncExternalStore(subscribe, editingShape)
}
