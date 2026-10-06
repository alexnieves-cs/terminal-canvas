/**
 * The Steward world's opening frame (M437). Fixture only.
 *
 * The same `AgentEvent` stream `world-sim.ts` and the real feed speak, so a
 * World scene can be stood up on the mockup cast without a second store.
 * Nothing here timers, spawns, or imports three. `stewardWorldEvents` is the
 * pure translation of the workspace's `world` field; the JSON is the cast.
 *
 * Counts the World room shot asks for: 3 waiting, 1 failed, 4 working.
 * Sample names (Steward, SW-412) stay in this directory.
 */

import type { AgentEvent, AgentStatus } from '@shared/world-events'

export interface StewardPanelRef {
  id: string
  name?: string
  agent?: boolean
  world?: AgentStatus
  line?: string
}

export interface StewardTaskRef {
  panels: readonly StewardPanelRef[]
}

/**
 * One status per agent, then its line as a message. `seq` is per agent and
 * starts at 1: the store drops anything at or below the last seq it holds,
 * so a feed that started at 0 would be silent on the second load.
 */
export function stewardWorldEvents(tasks: readonly StewardTaskRef[], now = 0): AgentEvent[] {
  const events: AgentEvent[] = []
  for (const task of tasks) {
    for (const panel of task.panels) {
      if (panel.agent !== true || panel.world === undefined) continue
      const name = panel.name
      events.push({
        agentId: panel.id,
        seq: 1,
        ts: now,
        type: 'status',
        payload: panel.world,
        ...(name === undefined ? {} : { name })
      })
      if (panel.line !== undefined && panel.line !== '') {
        events.push({
          agentId: panel.id,
          seq: 2,
          ts: now,
          type: 'message',
          payload: { text: panel.line },
          ...(name === undefined ? {} : { name })
        })
      }
    }
  }
  return events
}

/** waiting = `waiting_approval`, failed = `error`, working = `working`. */
export function stewardWorldTally(events: readonly AgentEvent[]): { waiting: number; failed: number; working: number } {
  let waiting = 0
  let failed = 0
  let working = 0
  for (const event of events) {
    if (event.type !== 'status') continue
    if (event.payload === 'waiting_approval') waiting += 1
    else if (event.payload === 'error') failed += 1
    else if (event.payload === 'working') working += 1
  }
  return { waiting, failed, working }
}
