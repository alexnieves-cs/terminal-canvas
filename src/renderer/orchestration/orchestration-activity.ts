/**
 * M268. Ring buffer of orchestration activity events. Fed from Canvas's
 * existing agent/pool/watcher subscriptions; plain-node testable.
 */

import { TONE_NEEDS_YOU, TONE_WORKING, agentWord, type Tone } from '@renderer/panels/panel-state'
import type { AgentState } from '@shared/types'
import type { Panel } from '@renderer/panels/panels'

export type OrchActivityKind = 'agent' | 'pool' | 'watcher' | 'task'

export interface OrchActivityEvent {
  id: string
  at: number
  kind: OrchActivityKind
  panelId?: string
  /** M279. The panel's kind when the producer knows it — the feed row's glyph tile. */
  panelKind?: Panel['kind']
  title: string
  detail: string
  tone: Tone
  /**
   * M318. The producer knows this needs a person although its tone does not
   * say so — a failed check is `exited`, like a clean exit. Absent is "read
   * the tone" (`classifyActivity`), so every older producer keeps its meaning.
   */
  intervene?: true
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
    ...(input.panelId !== undefined ? { panelId: input.panelId } : {}),
    ...(input.panelKind !== undefined ? { panelKind: input.panelKind } : {}),
    ...(input.intervene === true ? { intervene: true as const } : {})
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

const AGENT_STATES: readonly string[] = ['starting', 'busy', 'idle', 'wants-you', 'exited'] satisfies readonly AgentState[]
function stateWord(state: string): string {
  return AGENT_STATES.includes(state) ? agentWord(state as AgentState).word : state
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
  // The product's word, not the wire's id: `wants-you` is what the detector
  // emits and `needs you` is what every other surface calls it. A state this
  // build does not know passes through raw rather than being dropped.
  const detail = prev === undefined ? `became ${stateWord(state)}` : `${stateWord(prev)} → ${stateWord(state)}`
  return { at, kind: 'agent', panelId, title, detail, tone }
}

export function poolActivity(
  panelId: string,
  title: string,
  detail: string,
  live: boolean,
  at: number
): Omit<OrchActivityEvent, 'id'> {
  return {
    at,
    kind: 'pool',
    panelId,
    title,
    detail,
    tone: live ? TONE_WORKING : 'idle'
  }
}
