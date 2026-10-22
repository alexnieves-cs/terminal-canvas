import { useEffect, useMemo, useState } from 'react'
import { RADAR_LANES_MAX, type RadarLane, type RadarReport } from '@shared/collision-radar'
import type { PersistedWorkItem } from '@shared/work-items'

/**
 * M479. THE COLLISION RADAR, read for the board: every task with a lane, by
 * its item id, so a collision lands on BOTH tasks' cards.
 *
 * On the handoffs' trigger and never a timer, for the reason
 * `useTaskHandoffs` gives: a lane's changes only move when an agent's turn
 * ends or a person refreshes, and `version` changes on exactly those. Nothing
 * is asked until two lanes share a repository, because one lane cannot
 * collide with anything. A failed read keeps the last answer rather than
 * clearing it: a vanished warning reads as "resolved".
 */
export function useCollisionRadar(
  workItems: readonly PersistedWorkItem[],
  laneOf: (itemId: string) => { path: string; root: string } | undefined,
  version: object
): RadarReport | null {
  const lanes = useMemo(() => {
    const out: (RadarLane & { root: string })[] = []
    for (const item of workItems) {
      if (item.merged !== undefined) continue
      const lane = laneOf(item.id)
      if (lane !== undefined && lane.path !== '') out.push({ id: item.id, path: lane.path, root: lane.root })
    }
    return out.slice(0, RADAR_LANES_MAX)
  }, [workItems, laneOf, version]) // eslint-disable-line react-hooks/exhaustive-deps
  const key = lanes.map((l) => `${l.id}\0${l.path}`).join('\n')
  const siblings = lanes.some((l, i) => lanes.some((m, j) => j !== i && m.root === l.root))
  const [report, setReport] = useState<RadarReport | null>(null)
  useEffect(() => {
    if (!siblings) { setReport(null); return }
    const door = window.canvas?.lane?.radar
    if (typeof door !== 'function') return
    let live = true
    void door(lanes.map(({ id, path }) => ({ id, path }))).then((r) => { if (live) setReport(r) }).catch(() => { /* keep the last answer */ })
    return () => { live = false }
  }, [key, siblings, version]) // eslint-disable-line react-hooks/exhaustive-deps
  return report
}
