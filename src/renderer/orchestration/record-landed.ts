import type { EventRow } from '@shared/run-ledger'

/**
 * Decision queue. A durable row LANDED — so a reader that shows a task's
 * history (the queue's answered decisions) re-reads at once instead of on its
 * next poll, and an answered request shows up as answered in the same beat it
 * leaves the queue.
 *
 * Its own module, not a member of `orch-record.ts`: that module is the ONE
 * write door and `verify:orchestration orch-timeline.6` pins its importers to
 * the writers. A reader importing it to listen would sit in that list looking
 * exactly like a new writer. `orch-record` announces only after main accepted
 * the write (its rule 3), so a listener never hears of a row that is not there.
 */
type Listener = (row: Omit<EventRow, 'kind'>) => void
const listeners = new Set<Listener>()

export function announceRecordLanded(row: Omit<EventRow, 'kind'>): void {
  for (const l of listeners) l(row)
}

export function onRecordLanded(listener: Listener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
