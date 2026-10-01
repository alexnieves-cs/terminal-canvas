import { useMemo, useSyncExternalStore } from 'react'
import { getAgent, getAgentIds, subscribeAgentWorld } from './agent-world-store'
import { isLiveStatus, stationPlan, type RosterEntry, type StationPlan } from './world-scene'

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

export function useStationPlan(): { roster: readonly RosterEntry[]; plan: StationPlan } {
  const roster = useRoster()
  const plan = useMemo(() => stationPlan(roster), [roster])
  return { roster, plan }
}
