/**
 * M383. Which conversation the Replay sheet is showing, and which one beside
 * it — the share dialog's store shape (`share-dialog-store.ts`): a door
 * (the palette row, the Activity tab's button) opens it, the sheet reads it.
 * A view, never an action on the canvas: nothing here spawns, sends or writes.
 */
export interface ReplayRequest { panelId: string; compareWith?: string }

let request: ReplayRequest | null = null
const listeners = new Set<(r: ReplayRequest | null) => void>()
const emit = (): void => { for (const l of listeners) l(request) }

export function openReplay(panelId: string): void { request = { panelId }; emit() }
export function compareReplay(other: string | null): void {
  if (request === null) return
  request = other === null ? { panelId: request.panelId } : { panelId: request.panelId, compareWith: other }
  emit()
}
export function closeReplay(): void { request = null; emit() }
export function replayRequest(): ReplayRequest | null { return request }
export function onReplay(listener: (r: ReplayRequest | null) => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
