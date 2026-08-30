import { linksOf, type Panel } from '@renderer/panels/panels'
import type { WorldRect } from './viewport'

/**
 * The pure half of M13: where the line between two panels starts and ends.
 *
 * No DOM, no React, no native dependency — it joins the plain-node
 * verify:viewport bundle beside viewport.ts and lod.ts, the same placement
 * nav-grid.ts and rail-rows.ts earned. The gesture is the risky half of this
 * milestone and the arithmetic is not, and keeping them in separate files is
 * what lets the arithmetic be checked in seconds.
 *
 * `link`, never `edge`: EdgeIndicators.tsx and viewport.ts's edgeIndicator —
 * both in this directory — already mean the off-screen attention pip. Backlog
 * #24 calls these edges; the code does not, so that a grep for either concept
 * finds one of them.
 */

export interface LinkSegment {
  /**
   * React key. It carries BOTH ids AND their order: a -> b and b -> a are
   * different claims and addLink deliberately allows both, so a key built from
   * an unordered pair would collide and one of the two would silently stop
   * rendering. Space-joined, which is unambiguous for the same reason
   * railSignature uses JSON.stringify rather than a concatenation: an id
   * cannot contain a space (ID_PATTERN is [A-Za-z0-9_-]+), so no pair of
   * distinct links can forge one key. An earlier draft used a NUL for extra
   * safety it did not need, and the cost was real — it made this file report
   * as binary to `file`, and written into a check it terminated the enclosing
   * string literal.
   */
  key: string
  from: string
  to: string
  label?: string
  x1: number
  y1: number
  x2: number
  y2: number
}

const centreOfRect = (r: WorldRect): { x: number; y: number } => ({
  x: r.x + r.w / 2,
  y: r.y + r.h / 2
})

/**
 * Where the segment between two panels starts and ends: on each rect's
 * BORDER, along the centre-to-centre ray.
 *
 * Borders rather than centres, because a line drawn to a centre disappears
 * under the panel it points at — and the arrowhead is the only thing carrying
 * direction, so it is precisely the end that must not be hidden.
 *
 * It CLIPS THE RAY; it does not clamp the two axes independently. That
 * shorthand — clamp dx to the half-width, clamp dy to the half-height — is
 * edgeIndicator's documented mistake one file over, and it fails the same
 * silent way: every diagonal corners, so links leave and enter panels at the
 * same four points regardless of the true bearing, while still rendering and
 * still looking like a working feature. Taking the SMALLER of the two per-axis
 * parametric crossings and scaling the whole ray by that one `t` is what keeps
 * the exit point on the true bearing. verify:viewport 84, whose fixture is a
 * deliberately SHALLOW diagonal because a 45-degree one cannot tell the two
 * implementations apart.
 *
 * null for coincident centres: there is no direction to draw, and normalising
 * a zero-length vector is how a NaN reaches a transform and takes the whole
 * layer's paint with it — every link gone, not only this one, with nothing
 * thrown.
 */
export function linkAnchors(
  from: WorldRect,
  to: WorldRect
): { x1: number; y1: number; x2: number; y2: number } | null {
  const a = centreOfRect(from)
  const b = centreOfRect(to)
  const dx = b.x - a.x
  const dy = b.y - a.y
  if (dx === 0 && dy === 0) return null

  // Infinity for a zero component is correct and deliberate rather than a
  // guard against division by zero: an axis the ray does not travel along can
  // never be the binding crossing, and Math.min then picks the other one.
  const exit = (r: WorldRect, ox: number, oy: number): { x: number; y: number } => {
    const tx = ox === 0 ? Infinity : r.w / 2 / Math.abs(ox)
    const ty = oy === 0 ? Infinity : r.h / 2 / Math.abs(oy)
    const t = Math.min(tx, ty)
    return { x: ox * t, y: oy * t }
  }
  const out = exit(from, dx, dy)
  const back = exit(to, -dx, -dy)
  return { x1: a.x + out.x, y1: a.y + out.y, x2: b.x + back.x, y2: b.y + back.y }
}

/**
 * Every drawable link on this canvas, flattened out of the adjacency.
 *
 * A link whose target is not in `panels` is DROPPED. That is a second prune —
 * removePanel is the first — and the redundancy is deliberate, because this
 * one covers a state removePanel cannot see: PanelId is global across
 * workspaces, so a link naming a panel in a DIFFERENT workspace resolves to
 * nothing on this canvas, and a hand-edited layout.json reaches the same
 * place. It must render nothing rather than throw. verify:viewport 87.
 *
 * Nothing here asks a panel what KIND it is, and that is the property check 88
 * pins: `links` lives on PanelBase, so a review node is an ordinary endpoint.
 */
export function buildLinkSegments(panels: Panel[]): LinkSegment[] {
  const byId = new Map(panels.map((p) => [p.rect.id, p.rect]))
  const out: LinkSegment[] = []
  for (const panel of panels) {
    const from = panel.rect
    for (const link of linksOf(panel)) {
      const to = byId.get(link.to)
      if (!to) continue
      const anchors = linkAnchors(from, to)
      if (!anchors) continue
      out.push({
        key: `${from.id} ${link.to}`,
        from: from.id,
        to: link.to,
        // Absent stays absent, the rule `title` and `command` already obey:
        // `label: undefined` is a different fact from the key being missing,
        // and it is the one that survives a structured clone.
        ...(link.label === undefined ? {} : { label: link.label }),
        ...anchors
      })
    }
  }
  return out
}
