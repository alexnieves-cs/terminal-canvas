import { useSyncExternalStore } from 'react'

/**
 * M497 (R-052). The door from the HUD's Follow button to the 3D room's camera.
 *
 * Follow's behaviour is the room's (`world-camera.ts`'s `followAgent`, reached
 * through the camera panel's `follow`), and the HUD must not import the room:
 * the scene is lazy, and CanvasHud is in the entry chunk. So the room
 * REGISTERS its follow here while its chrome is mounted, and the HUD paints
 * the control only while one is registered. Absent a registration, nothing is
 * painted, which is how the 2D canvas stays exactly as it was.
 *
 * Plain state, not persisted: a follow belongs to a mounted camera. The room
 * re-registers when its pick changes, so the reason stays current.
 */
export interface Follow {
  run: () => void
  /** Why it cannot follow right now (nothing picked), or absent when it can. */
  disabledReason?: string
}

let current: Follow | null = null
const listeners = new Set<() => void>()

/** Register the room's follow; the returned function clears it if it is still this one. */
export function registerFollow(follow: Follow): () => void {
  current = follow
  for (const l of listeners) l()
  return () => {
    if (current !== follow) return
    current = null
    for (const l of listeners) l()
  }
}

export function getFollow(): Follow | null {
  return current
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** The registered follow, or null when no camera can follow. */
export function useFollow(): Follow | null {
  return useSyncExternalStore(subscribe, getFollow, getFollow)
}
