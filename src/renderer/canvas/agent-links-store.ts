import { useSyncExternalStore } from 'react'
import type { AgentLink } from '@shared/agent-links'

/**
 * M247. Which objects each agent touched, module-level and subscribed PER AGENT.
 *
 * Modelled on useEdgeActivity.ts and agent-state-store.ts — read their headers
 * first. It MUST NOT ride the registry's version counter: that counter carries
 * tier, status, focus and exit and nothing higher-frequency, and a busy agent
 * emits tool calls several times a second. Routing links through it would
 * re-render every panel on the canvas for one agent's Read.
 *
 * A snapshot is REPLACED only when its content changed, because
 * useSyncExternalStore compares by identity: rebuilding on every publish would
 * re-render every subscriber on every turn and never settle.
 *
 * Cleared at EVERY panel-removing call site (`forgetAgentLinksFor`, beside
 * each `clearAgentState`), for both directions: a closed AGENT loses its
 * links, and a closed OBJECT is dropped from every agent's links. Without it
 * the map grows for the life of the renderer and a recycled panel id inherits
 * a dead agent's edges. verify:agent-links `forget.1` counts the sites.
 */
const EMPTY: readonly AgentLink[] = []
const byAgent = new Map<string, readonly AgentLink[]>()
const listeners = new Map<string, Set<() => void>>()
const layerListeners = new Set<() => void>()
let layerVersion = 0
let flat: readonly AgentLink[] | null = null

const same = (a: readonly AgentLink[], b: readonly AgentLink[]): boolean =>
  a.length === b.length && a.every((l, i) => l.agent === b[i].agent && l.object === b[i].object && l.kind === b[i].kind)

function notify(agent: string): void {
  flat = null
  layerVersion += 1
  const set = listeners.get(agent)
  if (set) for (const fn of set) fn()
  for (const fn of layerListeners) fn()
}

/** The one writer: Canvas derives an agent's links and publishes them here. */
export function publishAgentLinks(agent: string, links: readonly AgentLink[]): void {
  const prev = byAgent.get(agent) ?? EMPTY
  if (same(prev, links)) return
  if (links.length === 0) byAgent.delete(agent)
  else byAgent.set(agent, [...links])
  notify(agent)
}

export function agentLinksFor(agent: string): readonly AgentLink[] {
  return byAgent.get(agent) ?? EMPTY
}

/** Every link, flattened; the same array until something changes. */
export function allAgentLinks(): readonly AgentLink[] {
  if (flat === null) flat = [...byAgent.values()].flat()
  return flat
}

export function subscribeAgentLinks(agent: string, fn: () => void): () => void {
  let set = listeners.get(agent)
  if (!set) { set = new Set(); listeners.set(agent, set) }
  set.add(fn)
  return () => {
    set.delete(fn)
    if (set.size === 0) listeners.delete(agent)
  }
}

/** A panel is gone for good — as an agent, and as an object any agent linked to. */
export function forgetAgentLinksFor(panelId: string): void {
  if (byAgent.has(panelId)) { byAgent.delete(panelId); notify(panelId) }
  for (const [agent, links] of [...byAgent]) {
    if (links.some((l) => l.object === panelId)) publishAgentLinks(agent, links.filter((l) => l.object !== panelId))
  }
}

/** A workspace switch or a reset replaces every panel; nothing survives it. */
export function forgetAllAgentLinks(): void {
  const agents = [...byAgent.keys()]
  byAgent.clear()
  flat = null
  if (agents.length === 0) return
  for (const agent of agents) notify(agent)
}

/** One agent's links; the snapshot object is cached, so identity is stable. */
export function useAgentLinks(agent: string): readonly AgentLink[] {
  return useSyncExternalStore((fn) => subscribeAgentLinks(agent, fn), () => agentLinksFor(agent), () => EMPTY)
}

/** A LAYER-wide subscription for the one component that draws every link. */
export function useAgentLinksLayer(): readonly AgentLink[] {
  return useSyncExternalStore(
    (fn) => { layerListeners.add(fn); return () => { layerListeners.delete(fn) } },
    allAgentLinks,
    () => EMPTY
  )
}

/** For checks: how many times the layer has been told something changed. */
export const agentLinksLayerVersion = (): number => layerVersion
