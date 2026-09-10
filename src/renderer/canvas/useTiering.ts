import { useEffect, useRef, type RefObject } from 'react'
import { assignTiers, LIVE_BUDGET, type Tier } from './lod'
import { DEMOTE_DELAY_MS } from './canvas-constants'
import type { Registry } from '@renderer/session/session-registry'
import type { Panel } from '@renderer/panels/panels'
import type { Viewport, WorldRect } from './viewport'

export interface TieringDiagnostics {
  liveCount: number
  heldCount: number
  budget: number
}

export interface TieringDeps {
  registry: Registry
  hostRef: RefObject<HTMLDivElement | null>
  terminalRects: WorldRect[]
  viewport: Viewport
  focusedId: string | null
  version: number
  dormantIds: ReadonlySet<string>
  collapsedPanelIds: ReadonlySet<string>
  panels: readonly Panel[]
  flying: boolean
}

/**
 * Applies the pure LOD assignment to the registry and holds a demotion back
 * briefly to avoid WebGL-context churn at a viewport edge.
 *
 * This hook replaces Canvas's contiguous tiering hook run at its former
 * position. In particular, registry.ensure remains above it during render;
 * this effect only attaches/cards sessions and never disposes one.
 */
export function useTiering(deps: TieringDeps): RefObject<TieringDiagnostics> {
  const {
    registry, hostRef, terminalRects, viewport, focusedId, version, dormantIds,
    collapsedPanelIds, panels, flying
  } = deps

  // Demotions held back for DEMOTE_DELAY_MS, keyed by panel id, valued by the
  // epoch ms at which the hold started. Refs, not state: the hold is bookkeeping
  // for a timer, and putting it in state would make every hold trigger the very
  // re-render that used to restart the timer.
  const heldSinceRef = useRef(new Map<string, number>())
  const demoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The most recent unheld assignment, read by the timer when it fires. A held
  // demotion is released against the LATEST tiering, not the one that was
  // current when the hold started — so a panel that came back into view during
  // the delay stays live instead of being demoted by a stale decision.
  const tiersRef = useRef<Record<string, Tier>>({})
  // Backlog #75: live count, held count and the budget, lifted out of the
  // effect's closure so the diagnostics overlay can read them. A plain ref,
  // updated once at the end of the effect below — no new render, no new
  // dependency, and nothing that could bump registry.version().
  const tieringDiagnosticsRef = useRef<TieringDiagnostics>({ liveCount: 0, heldCount: 0, budget: LIVE_BUDGET })

  // The timer belongs to the component, not to this effect's dependency list:
  // arming it inside an effect whose cleanup clears it meant any change to
  // [rects, viewport, focusedId, version] restarted the 250ms clock. `viewport`
  // changes on every wheel event, so a continuous trackpad pan plus its
  // momentum restarted it indefinitely and nothing ever demoted.
  useEffect(() => () => {
    if (demoteTimerRef.current !== null) clearTimeout(demoteTimerRef.current)
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    // M56. Not while a flight is in the air: every frame is a tiering
    // input, and a 300ms flight across the canvas would create and destroy a
    // dozen WebGL contexts for panels the user never stopped at. `flying` is
    // state, so this effect re-runs the moment the flight settles.
    if (flying) return
    const bounds = host.getBoundingClientRect()
    const tiers = assignTiers({
      // terminalRects, not rects: a review node has no tier at all, and this
      // is the one line that makes that structural. See terminalPanels above.
      rects: terminalRects,
      viewport,
      size: { width: bounds.width, height: bounds.height },
      focusedId,
      // M92. Pins, counted inside the budget by the tier function itself.
      pinnedIds: new Set(panels.filter((p) => p.pinned === true).map((p) => p.rect.id)),
      lastFocusedAt: registry.lastFocusedAt(),
      dormantIds,
      cardIds: collapsedPanelIds
    })
    tiersRef.current = tiers

    // Promotion is immediate so a panel is live by the time you look at it.
    // Demotion waits, so panning along an edge does not destroy and recreate a
    // WebGL context every frame. Held-back demotions keep their current tier.
    const held = heldSinceRef.current
    const now = Date.now()
    const applied: Record<string, Tier> = {}
    const holding: string[] = []
    let liveCount = 0
    for (const [id, tier] of Object.entries(tiers)) {
      const current = registry.get(id)?.tier ?? 'card'
      if (tier === 'card' && current === 'live') {
        if (!held.has(id)) held.set(id, now)
        holding.push(id)
        applied[id] = 'live'
      } else {
        held.delete(id)
        applied[id] = tier
        if (tier === 'live') liveCount += 1
      }
    }
    // Drop stale holds for panels that no longer exist, so the map cannot grow
    // without bound across a run.
    for (const id of [...held.keys()]) if (tiers[id] === undefined) held.delete(id)

    // INVARIANT: the tier map applied here never contains more than LIVE_BUDGET
    // live panels — hold-backs included. assignTiers already caps its own
    // promotions, but a hold-back is a live panel it did not count, so without
    // this every panel visited during a pan would stay live for the whole
    // gesture and blow through the WebGL context budget. Oldest holds go first:
    // they are the ones that have already had most of the anti-flicker grace
    // period the hold exists to provide.
    holding.sort((a, b) => (held.get(a) ?? 0) - (held.get(b) ?? 0))
    const allowedHolds = Math.max(0, LIVE_BUDGET - liveCount)
    for (const id of holding.slice(0, Math.max(0, holding.length - allowedHolds))) {
      applied[id] = 'card'
      held.delete(id)
    }

    registry.applyTiers(applied)
    tieringDiagnosticsRef.current = { liveCount, heldCount: held.size, budget: LIVE_BUDGET }

    // Arm the release timer only when one is not already running. Re-arming on
    // every render is what made the delay unreachable during a gesture.
    if (held.size === 0 || demoteTimerRef.current !== null) return
    demoteTimerRef.current = setTimeout(() => {
      demoteTimerRef.current = null
      // Release every hold at once against the latest tiering. A hold armed
      // late in the window gets slightly less than the full delay, which is
      // fine: the point is to bound the destroy/recreate RATE of WebGL
      // contexts, not to give each panel an exact grace period.
      heldSinceRef.current.clear()
      registry.applyTiers(tiersRef.current)
    }, DEMOTE_DELAY_MS)
  }, [terminalRects, viewport, focusedId, version, dormantIds, collapsedPanelIds, flying])

  return tieringDiagnosticsRef
}
