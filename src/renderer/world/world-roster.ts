import { useMemo, useSyncExternalStore } from 'react'
import { getAgent, getAgentIds, replayAt, subscribeAgentWorld } from './agent-world-store'
import { getWorldContext, subscribeWorldContext } from './world-context-store'
import { inRoom } from './world-facts'
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
 * M448. Idle and errored agents stay. `isLiveStatus` is still who is at work
 * (the structure, the live card); the roster is wider, so a failed agent can
 * slump at its desk and an idle one keeps its place. The board's pseudo-agent
 * (`world:`) is not an agent and never takes a desk. A status flip that does
 * not change membership leaves the string, and the render, put.
 *
 * M428: and an agent main HOLDS at a cap keeps its desk (`inRoom`). The feed
 * calls it idle — its turn ended and main serves it nothing more — but it is
 * waiting on a person, which is what the room is for; without this its hold
 * would be the one blocker the room could never show. The hold is the
 * canvas's fact (the context store), so the roster listens to both stores;
 * the string still changes only when membership or a name does.
 */
const SEP_FIELD = '\u0000'
const SEP_ROW = '\u0001'

function rosterKey(): string {
  const past = replayAt() !== null
  const facts = getWorldContext().facts
  return getAgentIds()
    .filter((id) => {
      if (id.startsWith('world:')) return false
      const record = getAgent(id)
      return record !== undefined && (inRoom(record.status, facts[id]?.held !== undefined, past) || !isLiveStatus(record.status))
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

/** Either store moving can move the roster: the feed (who is at work) and the context (who is held). */
function subscribeRoster(listener: () => void): () => void {
  const offWorld = subscribeAgentWorld(listener)
  const offContext = subscribeWorldContext(listener)
  return () => { offWorld(); offContext() }
}

export function useRoster(): readonly RosterEntry[] {
  const key = useSyncExternalStore(subscribeRoster, rosterKey, rosterKey)
  return useMemo(
    () => (key === '' ? [] : key.split(SEP_ROW).map((row) => {
      const [agentId = '', name = ''] = row.split(SEP_FIELD)
      return { agentId, name }
    })),
    [key]
  )
}
