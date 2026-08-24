import { useSyncExternalStore } from 'react'
import type { Registry } from './session-registry'

/**
 * Subscribes React to registry STATUS changes only. Terminal output never
 * comes through here — it is written straight into xterm, because routing
 * 16ms-batched PTY output through setState would re-render the canvas at 60Hz
 * for content React does not draw.
 *
 * The snapshot is a version integer rather than the session map: React needs a
 * value it can compare by identity, and the sessions are mutable by design.
 */
export function useRegistryVersion(registry: Registry): number {
  return useSyncExternalStore(
    (listener) => registry.subscribe(listener),
    () => registry.version(),
    () => registry.version()
  )
}
