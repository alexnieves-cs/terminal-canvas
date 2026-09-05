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
  /** M92. Panels the user pinned live; promoted first, counted inside the budget. */
  pinnedIds?: ReadonlySet<string>
  rects: WorldRect[]
  viewport: Viewport
  size: Size
  focusedId: string | null
  budget?: number
  /** Epoch ms per panel id. Missing means never focused. */
  lastFocusedAt: Record<string, number>
  /**
   * Panels restored from disk that have not been clicked yet. A dormant panel
   * is NEVER promoted — see the precedence note in assignTiers.
   */
  dormantIds?: ReadonlySet<string>
  /** A collapsed group asks to card its members without ending their session. */
  cardIds?: ReadonlySet<string>
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
  const dormant = input.dormantIds ?? new Set<string>()
  const forcedCards = input.cardIds ?? new Set<string>()
  const pinned = input.pinnedIds ?? new Set<string>()

  const tiers: Record<string, Tier> = {}
  for (const rect of rects) tiers[rect.id] = 'card'

  // M92. PINS FIRST, in array order, off-screen included: a pin is "keep this
  // one live wherever I am". Counted INSIDE the budget so the arithmetic that
  // refuses the ninth pin at the verb and the one that would card it here are
  // the same count. A dormant or force-carded pin yields — neither can be live.
  let slots = budget
  for (const rect of rects) {
    if (slots <= 0) break
    if (!pinned.has(rect.id) || dormant.has(rect.id) || forcedCards.has(rect.id)) continue
    tiers[rect.id] = 'live'
    slots -= 1
  }

  const eligible = rects.filter(
    (rect) =>
      rect.id !== focusedId &&
      tiers[rect.id] !== 'live' &&
      !dormant.has(rect.id) &&
      !forcedCards.has(rect.id) &&
      viewport.scale >= LIVE_MIN_SCALE &&
      intersectsViewport(rect, viewport, size)
  )

  // Most-recently-focused first, so eviction takes the stalest panel. Ties
  // (never focused) keep declaration order, which is stable across renders.
  eligible.sort((a, b) => (lastFocusedAt[b.id] ?? 0) - (lastFocusedAt[a.id] ?? 0))

  // The focused panel is live unconditionally — off screen, below the
  // scale threshold, budget full, any of it. It therefore consumes a slot and
  // can evict a panel that is fully visible. That is correct and surprising:
  // keystrokes must never land in a card.
  //
  // Dormancy OUTRANKS focus, and the ordering is the whole point. Restoring
  // focus onto a panel that came back from disk would otherwise pin it live at
  // boot, spawn its PTY, and contradict "dormant until clicked" on the very
  // first frame. Restored focus therefore comes back as a highlight and a
  // Cmd+C routing target only.
  // M92 keeps that unconditional: pins may fill the budget (the verb refuses
  // at PIN_MAX, one below it, so they normally cannot), and if they have, the
  // focused panel EVICTS the last-promoted pin rather than becoming a card.
  if (focusedId && tiers[focusedId] === 'card' && !dormant.has(focusedId) && !forcedCards.has(focusedId)) {
    if (slots <= 0) {
      const evict = [...rects].reverse().find((r) => tiers[r.id] === 'live' && pinned.has(r.id))
      if (evict) { tiers[evict.id] = 'card'; slots += 1 }
    }
    if (slots > 0) {
      tiers[focusedId] = 'live'
      slots -= 1
    }
  }

  for (const rect of eligible) {
    if (slots <= 0) break
    tiers[rect.id] = 'live'
    slots -= 1
  }

  return tiers
}

/**
 * M92. One below the budget, so the focused panel always has a slot without
 * evicting a pin; the eviction in assignTiers is the belt under this brace.
 */
export const PIN_MAX = LIVE_BUDGET - 1

/** M92. How many TERMINAL panels are pinned — the only kind the tier function sees. */
export function pinCount(panels: readonly { kind: string; pinned?: true | boolean }[]): number {
  return panels.filter((p) => p.kind === 'terminal' && p.pinned === true).length
}

/**
 * M92. Why a pin cannot apply, in ONE sentence every door shows — the palette
 * row, the pane's button and the verb itself read this, so they cannot
 * disagree. Undefined means the pin applies.
 */
export function pinRefusal(kind: string, pinned: boolean, count: number): string | undefined {
  if (pinned) return 'already pinned — Unpin panel is the row'
  if (kind !== 'terminal') return `only a terminal panel tiers — a ${kind} panel is never carded, so a pin means nothing`
  if (count >= PIN_MAX) return `${count} panels are already pinned (the live budget is ${LIVE_BUDGET}, one kept for the focused panel) — unpin one first`
  return undefined
}
