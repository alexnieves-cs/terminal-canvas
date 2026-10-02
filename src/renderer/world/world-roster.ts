import { useMemo, useSyncExternalStore } from 'react'
import { getAgent, getAgentIds, subscribeAgentWorld } from './agent-world-store'
import { isLiveStatus, type RosterEntry } from './world-scene'

/**
 * The scene's roster: every agent id and the name it currently goes by, as ONE
 * string snapshot.
 *
 * The store notifies on every event, and a view that re-rendered per event
 * would rebuild the whole scene tree several times a second. A string compares
 * by value, so `useSyncExternalStore` re-renders only when an agent appears or
 * is renamed — which is exactly when the plan can change. (`useAgentIds` is
 * the roster alone; the plan also needs names, because a conductor is found by
 * name, and a name may first arrive on a later event than the first.)
 *
 * LIVE agents only (`isLiveStatus`): the room is for work happening now, so an
 * agent that goes idle or errors leaves the roster — and the plan re-flows
 * without it — and comes back, in its first-seen place, when it is live again.
 * A status flip between two live statuses changes nothing here, so the string,
 * and with it the render, stays put.
 */
const SEP_FIELD = '\u0000'
const SEP_ROW = '\u0001'

function rosterKey(): string {
  return getAgentIds()
    .filter((id) => {
      const record = getAgent(id)
      return record !== undefined && isLiveStatus(record.status)
    })
    .map((id) => `${id}${SEP_FIELD}${getAgent(id)?.name ?? id}`)
    .join(SEP_ROW)
}

/**
 * The live agents waiting on a person (M422), oldest wait first — the
 * decision table's sign and amber read this. A string snapshot for the
 * roster's reason: a re-render only when someone starts or stops waiting.
 */
function waitingKey(): string {
  return getAgentIds()
    .map((id) => getAgent(id))
    .filter((r): r is NonNullable<typeof r> => r !== undefined && r.status === 'waiting_approval')
    .sort((a, b) => waitSince(a) - waitSince(b))
    .map((r) => r.agentId)
    .join(SEP_ROW)
}

/** When an agent's current wait began: its last status event, which is the one that said so. */
function waitSince(record: NonNullable<ReturnType<typeof getAgent>>): number {
  for (let i = record.events.length - 1; i >= 0; i--) {
    const e = record.events[i]!
    if (e.type === 'status') return e.ts
  }
  return record.lastTs
}

export function useWaiting(): readonly string[] {
  const key = useSyncExternalStore(subscribeAgentWorld, waitingKey, waitingKey)
  return useMemo(() => (key === '' ? [] : key.split(SEP_ROW)), [key])
}

export function useRoster(): readonly RosterEntry[] {
  const key = useSyncExternalStore(subscribeAgentWorld, rosterKey, rosterKey)
  return useMemo(
    () => (key === '' ? [] : key.split(SEP_ROW).map((row) => {
      const [agentId = '', name = ''] = row.split(SEP_FIELD)
      return { agentId, name }
    })),
    [key]
  )
}
