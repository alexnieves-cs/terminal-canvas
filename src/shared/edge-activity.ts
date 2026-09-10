/**
 * M230. EDGE ACTIVITY — what an edge on the canvas is doing, as a pure
 * function of signals that already exist on the wire.
 *
 * An edge animates ONLY when something crosses it. At rest it is a quiet line
 * with no motion. That was decided against a continuously-tinted "health"
 * grammar for two reasons worth keeping written down: ambient motion on every
 * edge contradicts this app's rest rule (at rest a surface states its name,
 * its kind and one meaningful state, and nothing else), and a continuous
 * animation has no honest `prefers-reduced-motion` degradation — you can only
 * switch it off, which deletes the information with the motion.
 *
 * NOTHING HERE SUBSCRIBES TO ANYTHING. Every input is a fact some other part
 * of the renderer already holds:
 *
 *   armed       the panel ids in a live run's component (`useRuns`, and
 *               `run-model.ts`'s `componentOf`)
 *   fired       `useHandoff` already records `{ kind: 'fired', … }`
 *   arrived     a join arrival, from the same recorder
 *   waitingFor  `joinAdvance` already answers which sources a join is owed
 *   blocked     the panel ids whose state word is `needs you`
 *               (`panel-state.ts`)
 *
 * That is the whole reason this milestone is cheap: the six states are a
 * PROJECTION of state the app already computes, not a new source of truth.
 *
 * KEYED `from:to`, the automation key every surface in this app already
 * shares — the rule maps, the selection and the handoff results are all keyed
 * that way, and a second convention here would be a second thing to keep in
 * step.
 */

/** How long a fire takes to cross its edge. One travel, then the edge falls back. */
export const EDGE_FIRE_MS = 900

/** How long a target's arrival flash lasts. Shorter: it is a report, not a journey. */
export const EDGE_ARRIVE_MS = 400

/**
 * The six states.
 *
 * `firing` carries `t`, the position along the edge in [0, 1), so the layer
 * can place the packet with the SAME analytic Bézier the label already uses
 * (`(P0 + 3C1 + 3C2 + P3) / 8` at t = 0.5, `bez()` at any other t) — no
 * `getPointAtLength`, no laid-out DOM, and no clock in the component.
 *
 * `waiting` carries `waitingFor`, because "this join is waiting" and "this
 * join is waiting for `b`" are different answers and only the second tells a
 * person what to do about it.
 */
export type EdgeActivity =
  | { kind: 'rest' }
  | { kind: 'armed' }
  | { kind: 'firing'; t: number }
  | { kind: 'arrived' }
  | { kind: 'waiting'; waitingFor: readonly string[] }
  | { kind: 'blocked' }

export interface EdgeActivityInput {
  /** Every enabled handoff edge on the canvas. An edge not in here gets no entry. */
  edges: readonly { from: string; to: string }[]
  /** Panel ids inside a LIVE run's component. */
  armed: ReadonlySet<string>
  /** Edge key -> when the source fired across it. */
  fired: ReadonlyMap<string, number>
  /** Edge key -> when a join arrival landed on it. */
  arrived: ReadonlyMap<string, number>
  /** TARGET panel id -> the source ids that join is still owed. */
  waitingFor: ReadonlyMap<string, readonly string[]>
  /** Panel ids whose state word is `needs you`. */
  blocked: ReadonlySet<string>
  now: number
}

export function edgeKey(from: string, to: string): string {
  return `${from}:${to}`
}

/**
 * A timestamp is usable only if it is a finite number at or before `now`.
 *
 * The absent / malformed / unknown rule, at the only place in this module
 * where a value arrives from outside: an ABSENT entry is every ordinary edge
 * and means nothing at all; a PRESENT but malformed one (a NaN from a clock
 * that failed, a future timestamp from a machine whose time moved) is dropped
 * and costs THAT EDGE, never the collection. Five edges must not go quiet
 * because a sixth carries a bad number.
 */
function ageOf(at: number | undefined, now: number): number | null {
  if (at === undefined) return null
  if (!Number.isFinite(at)) return null
  const age = now - at
  return age >= 0 ? age : null
}

/**
 * The six states, in precedence order. The order is the design, so it is
 * stated rather than implied:
 *
 *  1. `blocked` — the TARGET is asking a person a question. Nothing is
 *     crossing this edge, and a packet travelling into a panel that is
 *     waiting on a human would be a lie about what the app is doing. This
 *     outranks a live fire deliberately.
 *  2. `firing` — the thing that is happening right now.
 *  3. `arrived` — the thing that just happened.
 *  4. `waiting` — this edge has delivered and the join has not run yet.
 *  5. `armed` — a run is live through here, but nothing is in flight.
 *  6. `rest` — no signal. The common case, and a real answer rather than an
 *     absence: a caller must be able to tell "this edge is quiet" from "I
 *     have no entry for this edge", which is why every declared edge is in
 *     the returned map.
 */
export function edgeActivity(input: EdgeActivityInput): Map<string, EdgeActivity> {
  const out = new Map<string, EdgeActivity>()
  for (const edge of input.edges) {
    const key = edgeKey(edge.from, edge.to)

    if (input.blocked.has(edge.to)) { out.set(key, { kind: 'blocked' }); continue }

    const firing = ageOf(input.fired.get(key), input.now)
    if (firing !== null && firing < EDGE_FIRE_MS) {
      out.set(key, { kind: 'firing', t: firing / EDGE_FIRE_MS })
      continue
    }

    const landed = ageOf(input.arrived.get(key), input.now)
    if (landed !== null && landed < EDGE_ARRIVE_MS) { out.set(key, { kind: 'arrived' }); continue }

    // A join this edge has already delivered into, which has not run yet.
    // The edges that have NOT arrived stay at rest: they are not holding
    // anything, and breathing them would say the opposite of what is true.
    const owed = input.waitingFor.get(edge.to)
    if (owed !== undefined && owed.length > 0 && landed !== null && !owed.includes(edge.from)) {
      out.set(key, { kind: 'waiting', waitingFor: owed })
      continue
    }

    // Both endpoints, not either: an edge is armed when the RUN runs through
    // it. One endpoint inside a live component and one outside is an edge the
    // run does not use, and lifting it would claim a path that is not there.
    if (input.armed.has(edge.from) && input.armed.has(edge.to)) { out.set(key, { kind: 'armed' }); continue }

    out.set(key, { kind: 'rest' })
  }
  return out
}

/**
 * Does ANY edge need a frame?
 *
 * The layer runs ONE shared `requestAnimationFrame` for every edge, and no
 * rAF at all while this is false. `armed` and `blocked` are static states —
 * a lifted line and an amber line do not move — so a canvas with a live run
 * and nothing in flight costs exactly nothing per frame, which is the common
 * case on a working canvas and the whole point of the budget.
 */
export function edgesAnimate(activity: ReadonlyMap<string, EdgeActivity>): boolean {
  for (const a of activity.values()) if (a.kind === 'firing' || a.kind === 'waiting') return true
  return false
}
