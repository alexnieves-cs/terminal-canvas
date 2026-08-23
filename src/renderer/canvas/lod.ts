import { screenToWorld, type Size, type Viewport, type WorldRect } from './viewport'

/**
 * Which panels get a real terminal and which get a cheap card.
 *
 * Pure on purpose, exactly like viewport.ts: tiering is the logic most likely
 * to be subtly wrong (budgets, eviction order, edge thrash) and least
 * pleasant to debug through a running WebGL canvas.
 */

export type Tier = 'live' | 'card'

/** Below this, terminal text is unreadable anyway and a card is honest. */
export const LIVE_MIN_SCALE = 0.5

/** Browsers drop WebGL contexts near 16. Sit well under the cliff. */
export const LIVE_BUDGET = 8

/**
 * Culling uses a viewport expanded by this margin, so a panel is promoted
 * before it is visible and demoted well after it leaves. Promotion and
 * demotion happening at the same boundary would destroy and recreate a WebGL
 * context every frame while panning along an edge.
 */
export const CULL_MARGIN_PX = 240

export interface TierInput {
  rects: WorldRect[]
  viewport: Viewport
  size: Size
  focusedId: string | null
  budget?: number
  /** Epoch ms per panel id. Missing means never focused. */
  lastFocusedAt: Record<string, number>
}

function intersectsViewport(rect: WorldRect, vp: Viewport, size: Size): boolean {
  // Compare in world space: convert the margin-expanded screen rect once,
  // rather than converting every panel to screen space.
  const topLeft = screenToWorld({ x: -CULL_MARGIN_PX, y: -CULL_MARGIN_PX }, vp)
  const bottomRight = screenToWorld(
    { x: size.width + CULL_MARGIN_PX, y: size.height + CULL_MARGIN_PX },
    vp
  )
  return (
    rect.x < bottomRight.x &&
    rect.x + rect.w > topLeft.x &&
    rect.y < bottomRight.y &&
    rect.y + rect.h > topLeft.y
  )
}

export function assignTiers(input: TierInput): Record<string, Tier> {
  const { rects, viewport, size, focusedId, lastFocusedAt } = input
  const budget = input.budget ?? LIVE_BUDGET

  const tiers: Record<string, Tier> = {}
  for (const rect of rects) tiers[rect.id] = 'card'

  const eligible = rects.filter(
    (rect) =>
      rect.id !== focusedId &&
      viewport.scale >= LIVE_MIN_SCALE &&
      intersectsViewport(rect, viewport, size)
  )

  // Most-recently-focused first, so eviction takes the stalest panel. Ties
  // (never focused) keep declaration order, which is stable across renders.
  eligible.sort((a, b) => (lastFocusedAt[b.id] ?? 0) - (lastFocusedAt[a.id] ?? 0))

  // The focused panel is pinned live unconditionally — off screen, below the
  // scale threshold, budget full, any of it. It therefore consumes a slot and
  // can evict a panel that is fully visible. That is correct and surprising:
  // keystrokes must never land in a card.
  let slots = budget
  if (focusedId && tiers[focusedId] !== undefined) {
    tiers[focusedId] = 'live'
    slots -= 1
  }

  for (const rect of eligible) {
    if (slots <= 0) break
    tiers[rect.id] = 'live'
    slots -= 1
  }

  return tiers
}
