import { screenToWorld, type Viewport, type WorldRect } from './viewport'

/**
 * M44 — keyboard traversal geometry. Pure, no DOM, no React; bundled beside
 * viewport.ts into the plain-node verify:viewport target.
 *
 * These answer PRESENTATION questions (which panel is "to the right", what
 * order to list panels in) and live in their OWN module rather than as a
 * return value of assignTiers, on purpose: the file that rations WebGL
 * contexts must not start answering navigation questions (backlog #63's
 * constraint). They read the same rects assignTiers reads and nothing more.
 */

export type Direction = 'left' | 'right' | 'up' | 'down'

interface Centre {
  x: number
  y: number
}

function centreOf(r: WorldRect): Centre {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
}

/**
 * The nearest panel in `dir` from the one named `fromId`, or null when there
 * is none (the caller leaves the selection where it is). Candidates are the
 * panels whose centre lies in the HALF-PLANE ahead of `from`'s centre along
 * the axis; each is scored `along + 2*perp` — distance along the axis plus
 * twice the perpendicular offset — so a panel dead ahead beats a nearer one
 * far to the side. Screen coordinates: y grows downward, so 'down' is +y.
 */
export function nearestInDirection(rects: WorldRect[], fromId: string, dir: Direction): string | null {
  const from = rects.find((r) => r.id === fromId)
  if (from === undefined) return null
  const c = centreOf(from)
  let bestId: string | null = null
  let bestScore = Infinity
  for (const r of rects) {
    if (r.id === fromId) continue
    const rc = centreOf(r)
    const dx = rc.x - c.x
    const dy = rc.y - c.y
    let along: number
    let perp: number
    if (dir === 'right') { if (dx <= 0) continue; along = dx; perp = Math.abs(dy) }
    else if (dir === 'left') { if (dx >= 0) continue; along = -dx; perp = Math.abs(dy) }
    else if (dir === 'down') { if (dy <= 0) continue; along = dy; perp = Math.abs(dx) }
    else { if (dy >= 0) continue; along = -dy; perp = Math.abs(dx) }
    const score = along + 2 * perp
    if (score < bestScore) {
      bestScore = score
      bestId = r.id
    }
  }
  return bestId
}

/**
 * The order the palette's panel list should show, and the order Tab-less
 * navigation reads: panels currently ON SCREEN first (nearest the camera's
 * centre first), then the rest by recency of focus (most recent first).
 * Stable for ties, so a fixed set keeps a fixed order frame to frame.
 *
 * A SEPARATE function over the same inputs assignTiers reads — never a fourth
 * return value bolted onto it (see the module comment).
 */
export function orderPanels(
  rects: WorldRect[],
  viewport: Viewport,
  size: { w: number; h: number },
  lastFocusedAt: Record<string, number>
): string[] {
  const topLeft = screenToWorld({ x: 0, y: 0 }, viewport)
  const bottomRight = screenToWorld({ x: size.w, y: size.h }, viewport)
  const cameraCentre = screenToWorld({ x: size.w / 2, y: size.h / 2 }, viewport)
  const onScreen: { id: string; d: number }[] = []
  const offScreen: { id: string; at: number; i: number }[] = []
  rects.forEach((r, i) => {
    const visible = r.x < bottomRight.x && r.x + r.w > topLeft.x && r.y < bottomRight.y && r.y + r.h > topLeft.y
    if (visible) {
      const c = centreOf(r)
      const d = (c.x - cameraCentre.x) ** 2 + (c.y - cameraCentre.y) ** 2
      onScreen.push({ id: r.id, d })
    } else {
      offScreen.push({ id: r.id, at: lastFocusedAt[r.id] ?? 0, i })
    }
  })
  // A stable sort: equal keys keep input order (Array.prototype.sort is stable
  // in every engine this app runs on, but the explicit tiebreak makes it not
  // depend on that).
  onScreen.sort((a, b) => a.d - b.d)
  offScreen.sort((a, b) => (b.at - a.at) || (a.i - b.i))
  return [...onScreen.map((x) => x.id), ...offScreen.map((x) => x.id)]
}
