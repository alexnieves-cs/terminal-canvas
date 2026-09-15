/**
 * M268. Ring buffer of orchestration activity events. Fed from Canvas's
 * existing agent/pool/watcher subscriptions; plain-node testable.
 */

import { TONE_NEEDS_YOU, TONE_WORKING, type Tone } from '@renderer/panels/panel-state'

export type OrchActivityKind = 'agent' | 'pool' | 'watcher'

export interface OrchActivityEvent {
  id: string
  at: number
  kind: OrchActivityKind
  panelId?: string
  title: string
  detail: string
  tone: Tone
}

export const ORCH_ACTIVITY_CAP = 50

let seq = 0
let events: OrchActivityEvent[] = []
const listeners = new Set<() => void>()
let snapshot: OrchActivityEvent[] = []

function notify(): void {
  snapshot = events.slice()
  for (const listener of listeners) listener()
}

/** Test / reload: empty the buffer. */
export function clearOrchActivity(): void {
  events = []
  seq = 0
  notify()
}

export function pushOrchActivity(input: Omit<OrchActivityEvent, 'id'> & { id?: string }): OrchActivityEvent {
  const event: OrchActivityEvent = {
    id: input.id ?? `oa-${++seq}`,
    at: input.at,
    kind: input.kind,
    title: input.title,
    detail: input.detail,
    tone: input.tone,
    ...(input.panelId !== undefined ? { panelId: input.panelId } : {})
  }
  events = [event, ...events].slice(0, ORCH_ACTIVITY_CAP)
  notify()
  return event
}

export function orchActivityEvents(): readonly OrchActivityEvent[] {
  return snapshot
}

export function subscribeOrchActivity(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/**
 * Newest-first list, optionally filtered to one panel.
 *
 * Unfiltered returns the cached `snapshot` by identity — required for
 * `useSyncExternalStore` getSnapshot. A `.slice()` here looked like
 * defensive copying but made every read a new array, which React treats as
 * a changed store and re-renders forever (blank window when Orchestration
 * is the restored center view).
 */
export function listOrchActivity(selectedPanelId: string | null = null): readonly OrchActivityEvent[] {
  if (selectedPanelId === null) return snapshot
  return snapshot.filter((e) => e.panelId === selectedPanelId)
}

export function agentTransitionActivity(
  panelId: string,
  title: string,
  state: string,
  prev: string | undefined,
  at: number
): Omit<OrchActivityEvent, 'id'> {
  const tone: Tone = state === 'wants-you' ? TONE_NEEDS_YOU
    : state === 'busy' ? TONE_WORKING
      : state === 'starting' ? 'starting'
        : state === 'exited' ? 'exited'
          : 'idle'
  const detail = prev === undefined ? `became ${state}` : `${prev} → ${state}`
  return { at, kind: 'agent', panelId, title, detail, tone }
}
