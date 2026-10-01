import { useSyncExternalStore } from 'react'

/**
 * Whether the 3D world view is showing: the one bit the "World view" toggle in
 * the top bar, `#/world` and `TC_WORLD=1 npm run dev` all write, and Canvas
 * (the 2D host's cover) and the stage (the scene's mount) both read — so the
 * canvas can never be hidden with no scene under it, or a scene mounted over a
 * canvas still taking keys.
 *
 * Plain state, not persisted: the world is a lens you look through, and an app
 * that reopened onto it would hide the canvas from someone who had not asked.
 * Pure of three.js and of the scene, so Canvas and TopBar may import it
 * statically — the scene is behind WorldStage's `lazy()`.
 *
 * The hash is an INPUT, not the state: main opens the dev window at `#/world`
 * (a hash, because the renderer's index.html loads `./main.tsx` relatively and
 * a served `/world` would 404 as a module), and a hashchange to it turns the
 * view on. Turning it off clears the hash without adding a history entry, so
 * the next `#/world` is a change again.
 */
export const WORLD_HASH = '#/world'

let on = typeof window !== 'undefined' && window.location.hash === WORLD_HASH
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

export function isWorldOn(): boolean {
  return on
}

export function setWorldOn(next: boolean): void {
  if (next === on) return
  on = next
  if (!next && typeof window !== 'undefined' && window.location.hash === WORLD_HASH) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
  }
  emit()
}

export function toggleWorld(): void {
  setWorldOn(!on)
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0 && typeof window !== 'undefined') window.addEventListener('hashchange', onHash)
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && typeof window !== 'undefined') window.removeEventListener('hashchange', onHash)
  }
}

function onHash(): void {
  if (window.location.hash === WORLD_HASH) setWorldOn(true)
}

export function useWorldOn(): boolean {
  return useSyncExternalStore(subscribe, isWorldOn, () => false)
}
