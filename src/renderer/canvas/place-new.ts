import { cascadeCentre, occupiedRect, type Panel } from '@renderer/panels/panels'
import { groupRect, type CanvasGroup } from '@renderer/groups/groups'
import { placeNew } from './placement'
import type { PlacementRoom } from './safe-area'

/** M402. What Canvas.tsx's `placer()` hands a door: the rule, over the updater's `current`. */
export type PlaceFn = <T extends Panel>(current: readonly Panel[], made: T, how?: { anchored?: boolean; memberOf?: string }) => T

/**
 * M402 (B4). A made panel, moved to where the one placement rule puts it.
 *
 * The door mints its panel CENTRED on the point it asks for (the view's
 * centre, a point beside the parent) exactly as before, and hands it here
 * inside its `setPanels` updater with that updater's own `current` — the
 * cascade's batching rule: two spawns batched into one tick each see the
 * previous one's array. `room` (the chrome and the view, both DOM reads) and
 * `groups` are read ONCE outside the updater, by the caller.
 *
 * The object's own OCCUPIED rect is what must clear everything, so a new
 * terminal's rim name does not land on the panel above it either.
 *
 * `memberOf`: the group the new object joins, whose frame is not an obstacle.
 * `anchored`: the point is beside a parent (placement.ts's `placeNew`).
 * `regions`: other areas that are taken — Canvas.tsx passes the dashed TASK
 * regions (task-clusters.ts) for an object that joins no task, the same
 * reason as a group's frame: the live canvas measured two ⌘N terminals landing
 * inside a task's region, over its review.
 */
export function placePanel<T extends Panel>(
  made: T,
  current: readonly Panel[],
  room: PlacementRoom | null,
  groups: readonly CanvasGroup[],
  opts: { anchored?: boolean; memberOf?: string; regions?: readonly { x: number; y: number; w: number; h: number }[] } = {}
): T {
  const occupied = occupiedRect(made)
  const rim = made.rect.y - occupied.y
  const want = { x: occupied.x + occupied.w / 2, y: occupied.y + occupied.h / 2 }
  const obstacles = [
    ...current.map(occupiedRect),
    ...groups.flatMap((g) => {
      if (g.id === opts.memberOf) return []
      const frame = groupRect(g, current)
      return frame === null ? [] : [frame]
    }),
    ...(opts.regions ?? [])
  ]
  const spot = placeNew({
    size: { w: occupied.w, h: occupied.h },
    centre: want,
    ...(opts.anchored === true ? { anchored: true } : {}),
    obstacles,
    ...(room === null ? {} : { chrome: room.chrome }),
    ...(room?.within === undefined ? {} : { within: room.within })
  })
  if (spot !== null) {
    return { ...made, rect: { ...made.rect, x: spot.x - occupied.w / 2, y: spot.y - occupied.h / 2 + rim } }
  }
  // Nothing free within reach: the cascade, the rule of last resort — it
  // still never lands two objects byte-identically.
  const at = cascadeCentre({ x: made.rect.x + made.rect.w / 2, y: made.rect.y + made.rect.h / 2 }, [...current])
  return { ...made, rect: { ...made.rect, x: at.x - made.rect.w / 2, y: at.y - made.rect.h / 2 } }
}
