import { linksOf, type Panel } from '@renderer/panels/panels'

/**
 * M78. THE JOIN, pure. A target with several enabled handoff edges pointing
 * at it starts ONCE, when every source has fired, with each source's output
 * in the order the panels array lists the sources — the order the edges
 * were drawn from, which is the order a person reading the canvas expects.
 * A target with one edge is a join of one and fires as M41 did.
 *
 * No DOM, no React, no registry: `useHandoff.ts` holds the arrivals in a ref
 * and asks this what they mean. `verify:viewport graph.2–.3`.
 */

/** The ids of every panel with an ENABLED handoff edge into `targetId`, in panel order. */
export function incomingHandoffs(panels: readonly Panel[], targetId: string): string[] {
  const out: string[] = []
  for (const p of panels) {
    for (const link of linksOf(p)) {
      if (link.to === targetId && link.automation?.kind === 'handoff' && link.automation.enabled) { out.push(p.rect.id); break }
    }
  }
  return out
}

export interface JoinState {
  ready: boolean
  /** The arrivals concatenated in EXPECTED order; empty until ready. */
  payload: string
  /** The expected sources that have not arrived, in expected order. */
  waitingFor: string[]
}

export function joinAdvance(expected: readonly string[], arrived: ReadonlyMap<string, string>): JoinState {
  const waitingFor = expected.filter((id) => !arrived.has(id))
  if (waitingFor.length > 0 || expected.length === 0) return { ready: false, payload: '', waitingFor }
  return { ready: true, payload: expected.map((id) => arrived.get(id) as string).join(''), waitingFor: [] }
}
