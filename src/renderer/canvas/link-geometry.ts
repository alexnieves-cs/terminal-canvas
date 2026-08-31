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
  fromSide: LinkSide
  toSide: LinkSide
  /**
   * The rendered path. Built HERE rather than in the component, so the whole
   * shape of a link is decided in the module verify:viewport can drive under
   * plain node — the same split that put the anchors here rather than in
   * LinkLayer in M13.
   */
  d: string
  /**
   * The cubic's control points, carried so a consumer can find the CURVE's own
   * midpoint without measuring a laid-out path element.
   *
   * The label and (from M24's task 6) the remove badge both sit at t = 0.5,
   * where a cubic reduces to (P0 + 3C1 + 3C2 + P3) / 8 — a closed form needing
   * no DOM. The alternative, getPointAtLength, makes the position depend on a
   * laid-out element and so cannot be computed on the first render at all.
   *
   * Flattened to four numbers rather than two points because LinkSegment is
   * serialised into React keys and read by checks; a nested object here buys
   * nothing and reads worse at every call site.
   */
  c1x: number
  c1y: number
  c2x: number
  c2y: number
}

const centreOfRect = (r: WorldRect): { x: number; y: number } => ({
  x: r.x + r.w / 2,
  y: r.y + r.h / 2
})

/**
 * Which border an anchor sits on. Reported rather than computed separately:
 * linkAnchors already decides this when it takes Math.min(tx, ty), and a
 * second derivation elsewhere would drift from it the first time one of them
 * was wrong.
 */
export type LinkSide = 'n' | 'e' | 's' | 'w'

export interface LinkAnchors {
  x1: number
  y1: number
  x2: number
  y2: number
  /** The side of `from` the ray leaves through. */
  fromSide: LinkSide
  /** The side of `to` the ray enters through. */
  toSide: LinkSide
}

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
  to: WorldRect,
  /**
   * RESERVED and unused. M24's design decision 2 chose derived anchors, which
   * is what kept shared/layout-schema.ts out of that milestone entirely. This
   * parameter exists so the deferred half — an edge that REMEMBERS which side
   * it left from — can be taken later without rewriting this module. Nothing
   * passes it today; if you are adding the first caller, that is the milestone
   * that also grows PanelLink and both parsers.
   */
  _sides?: undefined
): LinkAnchors | null {
  const a = centreOfRect(from)
  const b = centreOfRect(to)
  const dx = b.x - a.x
  const dy = b.y - a.y
  if (dx === 0 && dy === 0) return null

  // Infinity for a zero component is correct and deliberate rather than a
  // guard against division by zero: an axis the ray does not travel along can
  // never be the binding crossing, and Math.min then picks the other one.
  const exit = (
    r: WorldRect,
    ox: number,
    oy: number
  ): { x: number; y: number; side: LinkSide } => {
    const tx = ox === 0 ? Infinity : r.w / 2 / Math.abs(ox)
    const ty = oy === 0 ? Infinity : r.h / 2 / Math.abs(oy)
    const t = Math.min(tx, ty)
    // The side falls out of WHICH crossing bound. tx binding means the ray
    // left through a vertical border (east or west) and the sign of ox says
    // which; ty binding means a horizontal one. The <= rather than < settles
    // the exact-45-degree tie toward the vertical border deterministically —
    // either answer is defensible there, and picking one in code rather than
    // leaving it to float comparison is what keeps linkPath reproducible.
    const side: LinkSide = tx <= ty ? (ox > 0 ? 'e' : 'w') : oy > 0 ? 's' : 'n'
    return { x: ox * t, y: oy * t, side }
  }
  const out = exit(from, dx, dy)
  const back = exit(to, -dx, -dy)
  return {
    x1: a.x + out.x,
    y1: a.y + out.y,
    x2: b.x + back.x,
    y2: b.y + back.y,
    fromSide: out.side,
    toSide: back.side
  }
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
      const controls = linkControls(anchors)
      out.push({
        key: `${from.id} ${link.to}`,
        from: from.id,
        to: link.to,
        // Absent stays absent, the rule `title` and `command` already obey:
        // `label: undefined` is a different fact from the key being missing,
        // and it is the one that survives a structured clone.
        ...(link.label === undefined ? {} : { label: link.label }),
        ...anchors,
        d: linkPath(anchors),
        c1x: controls.c1.x,
        c1y: controls.c1.y,
        c2x: controls.c2.x,
        c2y: controls.c2.y
      })
    }
  }
  return out
}

/**
 * How far a control point is pushed out of its border, as a fraction of the
 * distance between the two anchors, clamped at both ends.
 *
 * The clamps are not defensive. Unclamped, a link between two adjacent panels
 * gets an offset of a few units and reads as a straight line with a kink,
 * while a link across a panned canvas gets an offset of thousands and loops
 * off screen before coming back. The clamp is what makes the curve read the
 * same way at every distance, which is the whole of "clean" here.
 *
 * All three are TUNING values with no automated coverage of how they LOOK.
 * verify:viewport 94 and 95 pin the relation (perpendicular, clamped, pure)
 * and say nothing about whether the result is attractive. There is no visual
 * regression test in this repo and that is a stated position; these were
 * checked by hand once and are recorded as such in CLAUDE.md.
 */
export const CURVE_RATIO = 0.4
export const CURVE_MIN = 24
export const CURVE_MAX = 160

const OUTWARD: Record<LinkSide, { x: number; y: number }> = {
  n: { x: 0, y: -1 },
  s: { x: 0, y: 1 },
  e: { x: 1, y: 0 },
  w: { x: -1, y: 0 }
}

/**
 * The two cubic control points, pushed PERPENDICULAR out of the border each
 * anchor sits on.
 *
 * Perpendicular to the SIDE, never along the segment. Those two are identical
 * for a horizontal pair and diverge everywhere else, so the shorthand looks
 * correct on the fixture a first check reaches for and produces a curve that
 * kinks at the border for every other pair. verify:viewport 94 uses a VERTICAL
 * fixture precisely because it is one the shorthand gets wrong.
 *
 * Exported separately from linkPath so the relation is checkable without
 * parsing an SVG path string back apart — a check that had to parse `d` would
 * be testing a regex rather than the geometry.
 */
export function linkControls(a: LinkAnchors): {
  c1: { x: number; y: number }
  c2: { x: number; y: number }
} {
  const dx = a.x2 - a.x1
  const dy = a.y2 - a.y1
  const distance = Math.hypot(dx, dy)
  const offset = Math.min(CURVE_MAX, Math.max(CURVE_MIN, distance * CURVE_RATIO))
  const o1 = OUTWARD[a.fromSide]
  const o2 = OUTWARD[a.toSide]
  return {
    c1: { x: a.x1 + o1.x * offset, y: a.y1 + o1.y * offset },
    c2: { x: a.x2 + o2.x * offset, y: a.y2 + o2.y * offset }
  }
}

/**
 * The SVG `d` for one link. Pure: the same anchors always produce a
 * byte-identical string, because anything consulting a clock or a random seed
 * here would make every link on the canvas twitch on every repaint.
 */
export function linkPath(a: LinkAnchors): string {
  const { c1, c2 } = linkControls(a)
  return `M ${a.x1} ${a.y1} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${a.x2} ${a.y2}`
}
