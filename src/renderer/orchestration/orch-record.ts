/**
 * M300. THE RENDERER'S ONE DOOR INTO THE DURABLE RECORD.
 *
 * Main owns the file, the queue and the trim; the renderer owns facts main
 * cannot see — that a person answered a request here, that a handoff fired,
 * which files a task's review covered. So the renderer needs a write, and it
 * gets exactly one, in one module, for `sonner`'s reason: a door that can be
 * reached from anywhere is a door nobody can pin.
 *
 * FOUR RULES, each of which fails silently if broken:
 *
 * 1. **A row is a record of something that ALREADY happened.** Nothing here
 *    starts, retries or re-runs anything, and nothing here is called
 *    speculatively — a row written when an action was *offered* would put a
 *    dispatch in the history of a task nobody dispatched.
 * 2. **`source` is the caller's, and it is the truth about provenance.** An
 *    agent's claim is `agent`; a person's click is `person`; this app's own
 *    bookkeeping is `app`. The plan's rule that agent-authored claims are not
 *    structured results survives to disk only if this field is honest.
 * 3. **A write that did not land is reported, never assumed.** The door
 *    answers false and the caller may say so; it must not pretend the record
 *    is complete.
 * 4. **References only.** Paths, never contents. The type in
 *    `shared/run-ledger.ts` enforces it; this module does not smuggle a body
 *    into `detail`, which is one line of words.
 */

import type { EventRow, OrchEventKind, OrchEventSource } from '@shared/run-ledger'
import type { ReviewIdentity } from '@shared/review-identity'

/**
 * An EXECUTION's id: minted once per dispatch, never reused, and never
 * derived from the task — that is what makes M302's rerun a new execution
 * rather than a rewrite of the old one, and what keeps an earlier run's
 * artifacts attributed to the earlier run.
 */
export function mintRunId(now: number = Date.now()): string {
  return `run-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * The run id a subject's rows are filed under when no dispatch minted one —
 * every pre-M300 session, and every panel a person started by hand. It is
 * derived from the panel so its rows group together, and it is marked so a
 * reader can tell an inferred grouping from a real execution.
 */
export function adoptedRunId(panelId: string): string {
  return `adopted-${panelId}`
}

/**
 * M300. WHICH EXECUTION A TASK'S LATER ROWS BELONG TO, in memory.
 *
 * A dispatch mints a run id and the rows that follow it — a handoff, an
 * artifact — are filed under the same one. This map is the renderer's
 * shortcut to that id while the app runs; it is NOT the record. After a
 * relaunch it is empty, and a later row is filed under `adoptedRunId` —
 * marked "adopted" precisely so a reader can tell an inferred grouping from
 * an execution somebody actually dispatched. Recovering the real id would
 * mean reading the record back on every write, which is the per-event cost
 * this phase declined to pay.
 */
const runOfItem = new Map<string, string>()

export function beginRun(itemId: string, runId: string): void {
  runOfItem.set(itemId, runId)
}

/** The execution a task's rows belong to, or undefined when this process did not dispatch it. */
export function runOfTask(itemId: string): string | undefined {
  return runOfItem.get(itemId)
}

/**
 * M301 (the critic's finding 6). WHICH AUTOMATION OUTCOMES BELONG IN A
 * DURABLE RECORD: the SETTLED ones, and only those.
 *
 * `queued — …` and `waiting for …` are statements about a join set and a
 * queue that live in memory in `useHandoff`. A relaunch empties both, so a
 * row restored from disk would draw an edge labelled `· waiting` for a join
 * that will never complete — fabricated state, which is the one thing this
 * phase exists to prevent, arriving through the very mechanism built to
 * prevent it.
 *
 * A history records what HAPPENED. "It is waiting" is not something that
 * happened; it is something that was true for a while, and this record has no
 * way to say that it stopped being true. So a pending sentence is never
 * written, and — belt and braces, for rows an older build may already have
 * left on disk — never seeded back either.
 */
export function isSettledHandoff(sentence: string): boolean {
  return !sentence.startsWith('queued —') && !sentence.startsWith('waiting for')
}

export interface OrchEventInput {
  runId: string
  event: OrchEventKind
  source: OrchEventSource
  title: string
  detail?: string
  itemId?: string
  panelId?: string
  tested?: ReviewIdentity
  paths?: readonly string[]
  /** M301. The writer's own key for what this row is about — see EventRow.key. */
  key?: string
  at?: number
}

/**
 * Append one durable event. Returns false when the door is absent (an older
 * build, a harness that did not wire it) or the write was refused — the
 * caller is free to ignore that, but it is never told a row landed when it
 * did not.
 *
 * Deliberately NOT awaited by most callers: recording is beside the work, not
 * in front of it. A failed record must never fail the thing it recorded.
 */
export async function recordOrchEvent(input: OrchEventInput): Promise<boolean> {
  const door = window.canvas?.ledger?.event
  if (typeof door !== 'function') return false
  const row: Omit<EventRow, 'kind'> = {
    runId: input.runId,
    at: input.at ?? Date.now(),
    event: input.event,
    source: input.source,
    title: input.title,
    ...(input.detail === undefined || input.detail === '' ? {} : { detail: input.detail }),
    ...(input.itemId === undefined ? {} : { itemId: input.itemId }),
    ...(input.panelId === undefined ? {} : { panelId: input.panelId }),
    ...(input.tested === undefined ? {} : { tested: input.tested }),
    ...(input.paths === undefined || input.paths.length === 0 ? {} : { paths: [...input.paths] }),
    ...(input.key === undefined || input.key === '' ? {} : { key: input.key })
  }
  try {
    return await door(row)
  } catch {
    return false
  }
}
