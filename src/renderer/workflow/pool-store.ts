/**
 * M138. The pool blocks' per-address store — subscribed by (template, block),
 * cached snapshot, never on `registry.version()` (the module-level store
 * shape every store since M12 takes). Fed by ONE `pool:event` subscription
 * Canvas installs; a refusal the renderer itself learns at Run (main's
 * `poolStart` answered `refused`) lands here through the same reducer, so
 * the tab has one source.
 */
import { useSyncExternalStore } from 'react'
import type { PoolCallerEvent } from '@shared/ipc-contract'
import { EMPTY_POOL, reducePool, type PoolBlockState } from './pool-model'

const states = new Map<string, PoolBlockState>()
const listeners = new Map<string, Set<() => void>>()

const addressOf = (templateId: string, key: string): string => `${templateId} ${key}`

export function applyPoolEvent(event: PoolCallerEvent): void {
  const address = addressOf(event.templateId, event.key)
  const next = reducePool(states.get(address) ?? EMPTY_POOL, event.event)
  states.set(address, next)
  for (const cb of listeners.get(address) ?? []) cb()
}

export function getPool(templateId: string, key: string): PoolBlockState {
  return states.get(addressOf(templateId, key)) ?? EMPTY_POOL
}

function subscribePool(address: string, cb: () => void): () => void {
  let set = listeners.get(address)
  if (set === undefined) { set = new Set(); listeners.set(address, set) }
  set.add(cb)
  return () => { set?.delete(cb) }
}

export function usePool(templateId: string, key: string): PoolBlockState {
  const address = addressOf(templateId, key)
  return useSyncExternalStore((cb) => subscribePool(address, cb), () => states.get(address) ?? EMPTY_POOL, () => states.get(address) ?? EMPTY_POOL)
}

/** Every live pool for a template — what decides whether Stop can act. */
export function livePoolKeys(templateId: string, keys: readonly string[]): string[] {
  return keys.filter((k) => (states.get(addressOf(templateId, k)) ?? EMPTY_POOL).live)
}

/**
 * The live keys as ONE string snapshot (stable while nothing changes, so
 * useSyncExternalStore does not re-render on every event), subscribed to
 * every block's address at once — a hook per block would be a hook in a
 * loop over a list that changes with the template.
 */
export function usePoolsLive(templateId: string, keys: readonly string[]): string[] {
  const keyList = keys.join('\u0000')
  const snapshot = (): string => livePoolKeys(templateId, keyList === '' ? [] : keyList.split('\u0000')).join('\u0000')
  const live = useSyncExternalStore(
    (cb) => {
      const offs = (keyList === '' ? [] : keyList.split('\u0000')).map((k) => subscribePool(addressOf(templateId, k), cb))
      return () => { for (const off of offs) off() }
    },
    snapshot,
    snapshot
  )
  return live === '' ? [] : live.split('\u0000')
}

/** For a check or a relaunch: nothing survives a reload, and the store says so by being empty. */
export function clearPools(): void {
  states.clear()
}
