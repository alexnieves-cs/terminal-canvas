import { readsToAllow } from '@shared/read-batch'
import { getChat } from './chat-store'

/**
 * M533 (G3). The batch for ⌘⌥Y and its palette row, read from the chat store
 * at the moment of the press: each chat's own snapshot holds the request's
 * full input and the folder it runs in, which the rail's approval rows do not
 * carry. The rule itself is shared/read-batch.ts.
 */
export function pendingReadBatch(ids: readonly string[]): Array<{ panelId: string; requestId: string }> {
  return readsToAllow([...new Set(ids)].map((id) => {
    const snap = getChat(id).snapshot
    return { id, cwd: snap?.cwd, backend: snap?.backend, pending: snap?.pending ?? [] }
  }))
}
