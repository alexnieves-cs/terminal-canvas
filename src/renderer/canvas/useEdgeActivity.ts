import { useSyncExternalStore } from 'react'
import { EDGE_ARRIVE_MS, EDGE_FIRE_MS, edgeActivity, edgeKey, edgesAnimate, type EdgeActivity } from '@shared/edge-activity'

/**
 * M231. What each edge is doing, module-level and subscribed PER EDGE.
 *
 * Modelled on agent-state-store.ts, for the same reason and with the same
 * discipline — read that file's header first; this one only records where the
 * two differ.
 *
 * IT MUST NOT RIDE `registry.version()`. That counter carries tier, status,
 * focus and exit and deliberately nothing higher-frequency, so that a chatty
 * agent cannot re-render the canvas at the PTY flush rate. Edge activity is
 * PRECISELY the high-frequency thing that rule exists to keep off it: a fire
 * lands on every handoff, and a canvas mid-run can carry several a second.
 * Routing it through the version counter would re-render every panel on the
 * canvas for a line that moved between two of them.
 *
 * THE STORE HOLDS THE STATE, NOT THE ANIMATION. A `firing` edge's packet
 * position `t` changes every frame, and pushing that through here would
 * notify a subscriber sixty times a second per edge — the exact fan-out this
 * module exists to avoid. So the store notifies only when an edge's KIND
 * changes (rest → firing → armed), and `LinkLayer` runs ONE shared
 * requestAnimationFrame that reads positions straight out of `activityNow()`.
 * Two clocks, two frequencies, one source of truth.
 */

/** The raw signals, each written by exactly one caller in useHandoff. */
const fired = new Map<string, number>()
const arrived = new Map<string, number>()
const waitingFor = new Map<string, readonly string[]>()

/**
 * The facts the store cannot observe for itself: which edges exist, which
 * panels a live run runs through, and which are asking a person a question.
 * Canvas pushes these in — it already holds all three — rather than this
 * module growing three subscriptions of its own.
 */
interface EdgeContext {
  edges: readonly { from: string; to: string }[]
  armed: ReadonlySet<string>
  blocked: ReadonlySet<string>
}
let context: EdgeContext = { edges: [], armed: new Set(), blocked: new Set() }

/**
 * The cached snapshot, per edge. `useSyncExternalStore` compares by identity,
 * so an entry's object is REPLACED only when its content actually changed —
 * rebuilding the map wholesale would re-render every edge on every recompute
 * and React would never settle.
 */
let snapshot = new Map<string, EdgeActivity>()
const listeners = new Map<string, Set<() => void>>()
const layerListeners = new Set<() => void>()

const REST: EdgeActivity = { kind: 'rest' }

/**
 * Same activity? `t` is deliberately NOT compared: it changes every frame on
 * a firing edge, and the store's whole contract is that it reports kind
 * changes while the layer's rAF owns the motion. Comparing it here would turn
 * every frame into a notification for every firing edge.
 */
function same(a: EdgeActivity | undefined, b: EdgeActivity): boolean {
  if (a === undefined) return false
  if (a.kind !== b.kind) return false
  if (a.kind === 'waiting' && b.kind === 'waiting') {
    return a.waitingFor.length === b.waitingFor.length && a.waitingFor.every((id, i) => id === b.waitingFor[i])
  }
  return true
}

let expiry: ReturnType<typeof setTimeout> | null = null
// See freezeEdgeClock, below, for what this is and why it exists. Declared
// here because recompute() reads the clock and is defined above it.
let frozenAt: number | null = null
const clock = (): number => frozenAt ?? Date.now()

/**
 * Recompute, notify only what moved, and arm ONE timer for the next moment a
 * state can lapse on its own.
 *
 * A fire and an arrival both END without anything happening — nothing calls
 * back to say "that fire is over". Without this timer an edge would sit at
 * `firing` until the next unrelated recompute, which on a quiet canvas is
 * never: the packet would freeze mid-edge and stay there. One timer for the
 * whole store, at the earliest lapse, rather than one per edge.
 */
function recompute(): void {
  const now = clock()
  const next = edgeActivity({ ...context, fired, arrived, waitingFor, now })
  const changed: string[] = []
  const merged = new Map<string, EdgeActivity>()
  for (const [key, value] of next) {
    const prev = snapshot.get(key)
    if (same(prev, value) && prev !== undefined) { merged.set(key, prev); continue }
    merged.set(key, value)
    changed.push(key)
  }
  // An edge that no longer exists loses its entry; a subscriber still mounted
  // for it reads `rest` rather than a stale `firing` frozen at the moment its
  // panel closed.
  for (const key of snapshot.keys()) if (!merged.has(key)) changed.push(key)
  snapshot = merged
  // The set of TARGETS currently taking an arrival, derived from the same
  // pass rather than tracked separately: one source of truth means the rim
  // flash can never outlive the edge state that caused it.
  const arriving = new Set<string>()
  for (const [key, value] of merged) if (value.kind === 'arrived') arriving.add(key.slice(key.indexOf(':') + 1))
  for (const id of new Set([...arriving, ...arrivingNow])) {
    if (arriving.has(id) === arrivingNow.has(id)) continue
    changed.push(`arriving:${id}`)
  }
  arrivingNow = arriving
  for (const key of changed) {
    const set = listeners.get(key)
    if (set) for (const listener of set) listener()
  }
  if (changed.length > 0) for (const listener of layerListeners) listener()

  if (expiry !== null) { clearTimeout(expiry); expiry = null }
  let soonest = Infinity
  for (const [key, at] of fired) if (next.has(key) && Number.isFinite(at)) soonest = Math.min(soonest, at + EDGE_FIRE_MS - now)
  for (const [key, at] of arrived) if (next.has(key) && Number.isFinite(at)) soonest = Math.min(soonest, at + EDGE_ARRIVE_MS - now)
  if (soonest !== Infinity && soonest > 0) {
    expiry = setTimeout(recompute, soonest + 16)
    // Never hold the process open for an animation (M131's lesson): an
    // unref'd timer is what stops a verify run hanging on a pending fire.
    if (typeof expiry === 'object' && expiry !== null && 'unref' in expiry) (expiry as { unref: () => void }).unref()
  }
}

/** Canvas, in one effect, from facts it already holds. */
export function setEdgeContext(next: EdgeContext): void {
  context = next
  recompute()
}

/** useHandoff, at the moment it fires across an edge. */
export function noteEdgeFired(from: string, to: string): void {
  fired.set(edgeKey(from, to), Date.now())
  recompute()
}

/**
 * When a handoff last crossed this edge, for a reader that draws its own
 * surface (the Orchestration HUD) and must not write here. Read-only: the
 * one-writer rule above is about `fired`'s WRITES.
 */
export function edgeFiredAt(from: string, to: string): number | undefined {
  return fired.get(edgeKey(from, to))
}

/** useHandoff, at the moment a join arrival lands on an edge. */
export function noteEdgeArrived(from: string, to: string): void {
  arrived.set(edgeKey(from, to), Date.now())
  recompute()
}

/**
 * useHandoff, when a join advances. An EMPTY list clears the entry rather
 * than storing one: "waiting for nobody" and "not waiting" are the same fact
 * said two ways, and keeping both would let an edge breathe forever after its
 * join ran.
 */
export function noteEdgeWaiting(targetId: string, sources: readonly string[]): void {
  if (sources.length === 0) waitingFor.delete(targetId)
  else waitingFor.set(targetId, sources)
  recompute()
}

/**
 * A panel is gone for good: closed, undone, or dropped by a reset. Called at
 * every panel-removing call site, like `clearAgentState` beside it. Without
 * it these maps grow for the life of the renderer, and — worse — a recycled
 * panel id inherits a dead edge's fire.
 */
export function forgetEdgesFor(panelId: string): void {
  for (const key of [...fired.keys()]) if (key.startsWith(`${panelId}:`) || key.endsWith(`:${panelId}`)) fired.delete(key)
  for (const key of [...arrived.keys()]) if (key.startsWith(`${panelId}:`) || key.endsWith(`:${panelId}`)) arrived.delete(key)
  waitingFor.delete(panelId)
  for (const [target, sources] of waitingFor) {
    if (sources.includes(panelId)) {
      const left = sources.filter((id) => id !== panelId)
      if (left.length === 0) waitingFor.delete(target)
      else waitingFor.set(target, left)
    }
  }
  recompute()
}

/** A workspace switch replaces every panel; nothing survives it. */
export function forgetAllEdges(): void {
  fired.clear()
  arrived.clear()
  waitingFor.clear()
  recompute()
}

/**
 * A FROZEN CLOCK, for the shot harness and nothing else.
 *
 * A packet's position is a function of elapsed time, so a golden scene of a
 * firing edge would place the dot wherever the capture happened to land —
 * tens of pixels apart between runs, far past the tile budget, and a
 * permanently flaky golden is worse than no golden at all. (M225 spent real
 * effort removing one such region from these images; adding one back on
 * purpose would be indefensible.)
 *
 * So a scene may freeze the clock at a chosen instant. What that fakes is
 * exactly one thing — WHEN it is — and everything the scene then shows is
 * the real path: the real reducer computes the real `t`, and the real `bez()`
 * places the real packet on the real curve. It is disclosed here, in the
 * ledger, and in the scene's own intent line, because a reader of the golden
 * cannot otherwise know the dot is not where a live capture would have put
 * it.
 *
 * While frozen, `edgesAnimateNow()` answers false: `t` cannot advance, so a
 * running rAF would re-render forever and change nothing.
 */
export function freezeEdgeClock(at: number | null): void {
  frozenAt = at
  recompute()
}


/**
 * The live map, for the layer's one rAF. Recomputed against the CURRENT clock
 * so a firing edge's `t` advances; the store's own cached snapshot is
 * untouched, because this read must not notify anyone.
 */
export function activityNow(): Map<string, EdgeActivity> {
  return edgeActivity({ ...context, fired, arrived, waitingFor, now: clock() })
}

/** Whether ANY edge needs a frame — the predicate that keeps the rAF off. */
export function edgesAnimateNow(): boolean {
  if (frozenAt !== null) return false
  return edgesAnimate(activityNow())
}

/**
 * M233. Is a join arrival landing on this panel right now?
 *
 * Keyed by the TARGET, not by an edge, and subscribed on its own listener
 * key so a panel re-renders for its own arrivals and nobody else's. The
 * frame reuses `.pf::before` — M109's state-edge glow — rather than growing a
 * second mechanism for "something reached me", which is what the brief asks
 * for and is also why the flash inherits the tone glow's clipping and its
 * pointer-events for free.
 */
export function useEdgeArriving(panelId: string): boolean {
  const key = `arriving:${panelId}`
  return useSyncExternalStore(
    (listener) => subscribeEdge(key, listener),
    () => arrivingNow.has(panelId),
    () => false
  )
}

/** Recomputed in `recompute`, so the flash starts and ENDS with the state. */
let arrivingNow: ReadonlySet<string> = new Set()

function subscribeEdge(key: string, listener: () => void): () => void {
  let set = listeners.get(key)
  if (!set) { set = new Set(); listeners.set(key, set) }
  set.add(listener)
  return () => {
    set.delete(listener)
    if (set.size === 0) listeners.delete(key)
  }
}

/** One edge's state. The snapshot object is cached, so identity is stable. */
export function useEdgeActivity(from: string, to: string): EdgeActivity {
  const key = edgeKey(from, to)
  return useSyncExternalStore(
    (listener) => subscribeEdge(key, listener),
    () => snapshot.get(key) ?? REST,
    () => REST
  )
}

/**
 * A LAYER-wide subscription, for the one component that has to know when
 * ANY edge changed kind — so it can start or stop its single rAF. A
 * per-edge subscription cannot answer a set-valued question without every
 * edge subscribing to every other edge, which is the fan-out this module
 * exists to avoid (agent-state-store makes the same split for the same
 * reason, between `useAgentState` and `useAttentionIds`).
 */
export function useEdgeActivityVersion(): number {
  return useSyncExternalStore(
    (listener) => { layerListeners.add(listener); return () => { layerListeners.delete(listener) } },
    () => version,
    () => 0
  )
}

let version = 0
const bump = (): void => { version += 1 }
layerListeners.add(bump)
