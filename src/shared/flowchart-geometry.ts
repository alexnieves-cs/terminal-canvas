/**
 * M388. THE FLOWCHART'S GEOMETRY — outlines, ports, connector routes,
 * arrowheads and hit tests, as pure arithmetic over boxes.
 *
 * Pure: no DOM, no node, no dependency. The canvas (ShapeLayer) and the SVG
 * export (flowchart-svg.ts) call the SAME functions here, so a chart exported
 * as SVG is the chart on the canvas rather than a second drawing of it that
 * drifts. Plain-node checked in `verify:flowchart` (flowchart.geometry.*).
 *
 * Everything is in WORLD units except `shapeOutline`/`shapeDetail`, which are
 * in the shape's LOCAL box (0,0)-(w,h) so a shape's path does not change when
 * the shape moves — only its transform does, and a drag re-renders nothing
 * but a translate.
 *
 * `Box` is structural and local on purpose: `WorldRect` lives in the renderer,
 * and shared/ never imports the renderer (flowchart.ts's graph-view note).
 */
import type { Ends, Port, Route, ShapeForm } from './flowchart'

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface Point {
  x: number
  y: number
}

// ── Numbers in a path ───────────────────────────────────────────────────────

/**
 * Two decimals, never an exponent for the magnitudes a canvas reaches. A
 * path string is compared byte for byte by React's reconciliation and by the
 * SVG export's determinism check, so a float's 17-digit tail must never reach
 * it: 0.1 + 0.2 would repaint a shape that did not move.
 */
const n2 = (v: number): string => String(Math.round(v * 100) / 100)

/** The cubic that best fits a quarter circle. Arcs (`A`) are not used anywhere here: a cubic's control points lie inside the box, so "every number in `d` is inside the box" is a check a regex can make (flowchart.geometry.1). */
const CIRCLE_K = 0.5522847498

/** A tiny path writer that drops a zero-length `L` — a stadium whose straight side has shrunk to nothing would otherwise carry a degenerate segment that some renderers draw as a dot on a round cap. */
function pathWriter(): {
  M: (x: number, y: number) => void
  L: (x: number, y: number) => void
  C: (ax: number, ay: number, bx: number, by: number, x: number, y: number) => void
  Z: () => string
} {
  const parts: string[] = []
  let cx = ''
  let cy = ''
  return {
    M(x, y) {
      cx = n2(x)
      cy = n2(y)
      parts.push(`M ${cx} ${cy}`)
    },
    L(x, y) {
      const sx = n2(x)
      const sy = n2(y)
      if (sx === cx && sy === cy) return
      parts.push(`L ${sx} ${sy}`)
      cx = sx
      cy = sy
    },
    C(ax, ay, bx, by, x, y) {
      cx = n2(x)
      cy = n2(y)
      parts.push(`C ${n2(ax)} ${n2(ay)}, ${n2(bx)} ${n2(by)}, ${cx} ${cy}`)
    },
    Z: () => `${parts.join(' ')} Z`
  }
}

function roundedRect(x: number, y: number, w: number, h: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2))
  const k = r * CIRCLE_K
  const x1 = x + w
  const y1 = y + h
  const p = pathWriter()
  p.M(x + r, y)
  p.L(x1 - r, y)
  if (r > 0) p.C(x1 - r + k, y, x1, y + r - k, x1, y + r)
  p.L(x1, y1 - r)
  if (r > 0) p.C(x1, y1 - r + k, x1 - r + k, y1, x1 - r, y1)
  p.L(x + r, y1)
  if (r > 0) p.C(x + r - k, y1, x, y1 - r + k, x, y1 - r)
  p.L(x, y + r)
  if (r > 0) p.C(x, y + r - k, x + r - k, y, x + r, y)
  return p.Z()
}

// ── Per-form constants, each used by the outline AND the ports ─────────────
// One function per quantity, so the port on a slanted side can never be
// computed from a different skew than the side it sits on.

/** The io parallelogram's horizontal skew. Capped by both axes: by height so a tall io does not lean like a tower, by width so a narrow one keeps a top edge. */
export function ioSkew(w: number, h: number): number {
  return Math.max(0, Math.min(h * 0.35, w * 0.18))
}

/** The document form's wave amplitude, above and below its baseline. */
export function waveAmplitude(h: number): number {
  return Math.max(0, h * 0.08)
}

const processRadius = (h: number): number => Math.min(6, h / 4)

/**
 * The outline, as an SVG path `d` in the shape's LOCAL box. Every form
 * touches the midpoint of each side of its box except where `portPoint`
 * says otherwise (io's slanted sides, the document's wave, a junction in a
 * non-square box) — and those exceptions are computed from the same helpers.
 */
export function shapeOutline(form: ShapeForm, w: number, h: number): string {
  w = Math.max(0, w)
  h = Math.max(0, h)
  switch (form) {
    case 'process':
      return roundedRect(0, 0, w, h, processRadius(h))
    case 'subprocess':
      // A tighter radius than process: the two inner bars sit 10 from the
      // sides, and a 6 radius makes them read as detached from the corners.
      return roundedRect(0, 0, w, h, Math.min(4, h / 4))
    case 'terminator':
      return roundedRect(0, 0, w, h, Math.min(w, h) / 2)
    case 'junction': {
      const m = Math.min(w, h)
      return roundedRect((w - m) / 2, (h - m) / 2, m, m, m / 2)
    }
    case 'decision': {
      const p = pathWriter()
      p.M(w / 2, 0)
      p.L(w, h / 2)
      p.L(w / 2, h)
      p.L(0, h / 2)
      return p.Z()
    }
    case 'io': {
      const s = ioSkew(w, h)
      const p = pathWriter()
      p.M(s, 0)
      p.L(w, 0)
      p.L(w - s, h)
      p.L(0, h)
      return p.Z()
    }
    case 'document':
      return documentPath(w, h)
    case 'text':
      // A text shape is a label with no box (shapeFormSentence). An empty
      // outline rather than an invisible rect, so nothing is stroked even
      // when a person gives it a stroke colour.
      return ''
  }
}

/**
 * The document: a rect whose bottom edge is one smooth S — lower on the
 * left, higher on the right, as the drawn symbol has it. Built from three
 * cubics that END at the wave's extremes, with horizontal tangents there, so
 * every control point lies inside the box: a single-cubic S needs control
 * points ~3.5 amplitudes out, which would put numbers outside the box that
 * a bounds check cannot tell from a path that really leaves it.
 *
 * The middle cubic is point-symmetric about (w/2, h - a), so the S crosses
 * its baseline exactly at the bottom port. The 0.334 / 0.363 fractions are
 * the classic cubic fit of a quarter sine; they only shape the curve.
 */
function documentPath(w: number, h: number): string {
  const a = waveAmplitude(h)
  const yb = h - a
  const q = w / 4
  const r = Math.min(processRadius(h), w / 2, yb / 2)
  const k = r * CIRCLE_K
  const d = 0.3634 * (w / 2)
  const p = pathWriter()
  p.M(r, 0)
  p.L(w - r, 0)
  if (r > 0) p.C(w - r + k, 0, w, r - k, w, r)
  p.L(w, yb)
  p.C(w - 0.334 * q, yb - 0.525 * a, w - 0.637 * q, yb - a, w - q, yb - a)
  p.C(w - q - d, yb - a, q + d, h, q, h)
  p.C(q - 0.363 * q, h, 0.334 * q, yb + 0.525 * a, 0, yb)
  p.L(0, r)
  if (r > 0) p.C(0, r - k, r - k, 0, r, 0)
  return p.Z()
}

/** Strokes drawn in the outline's colour on top of it: the subprocess's two inner bars. Local box, like the outline. */
export function shapeDetail(form: ShapeForm, w: number, h: number): string {
  if (form !== 'subprocess') return ''
  // 10 from each side at mint size; a shape resized narrower than 40 keeps
  // its bars inside rather than crossing over.
  const inset = Math.min(10, Math.max(0, w) / 4)
  return `M ${n2(inset)} 0 L ${n2(inset)} ${n2(h)} M ${n2(w - inset)} 0 L ${n2(w - inset)} ${n2(h)}`
}

// ── Ports ──────────────────────────────────────────────────────────────────

const NORMAL: Readonly<Record<Port, Point>> = {
  n: { x: 0, y: -1 },
  e: { x: 1, y: 0 },
  s: { x: 0, y: 1 },
  w: { x: -1, y: 0 }
}

/** The unit vector pointing OUT of the box through that side. */
export function portNormal(port: Port): Point {
  return { ...NORMAL[port] }
}

/**
 * Where a connector attaches, in WORLD units: ON the outline at that side's
 * midpoint. On the outline rather than on the box, because an arrow that
 * stops at an io's bounding box floats in the air beside its slanted side,
 * and one that stops at a non-square junction's box stops short of the dot.
 * `form: null` is a live panel — a plain rectangle.
 */
export function portPoint(form: ShapeForm | null, box: Box, port: Port): Point {
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  let rx = box.w / 2
  let ry = box.h / 2
  let down = box.h / 2
  if (form === 'io') rx = box.w / 2 - ioSkew(box.w, box.h) / 2
  else if (form === 'junction') rx = ry = down = Math.min(box.w, box.h) / 2
  else if (form === 'document') down = box.h / 2 - waveAmplitude(box.h)
  switch (port) {
    case 'n': return { x: cx, y: cy - ry }
    case 's': return { x: cx, y: cy + down }
    case 'e': return { x: cx + rx, y: cy }
    case 'w': return { x: cx - rx, y: cy }
  }
}

export interface PortEnd {
  box: Box
  form: ShapeForm | null
  /** A port the person fixed; absent = chosen from the geometry. */
  port?: Port
}

/**
 * Which sides a connector leaves and enters by. A fixed port is kept as the
 * person set it; an auto port faces the other end.
 *
 * The axis is chosen by the GAP between facing edges, not by centre deltas:
 * a wide shape just below a narrow one has a larger horizontal centre delta
 * than vertical one, and centre deltas would send the line out of its side
 * and round the corner, when the obvious line is straight down. Centres
 * decide only when the boxes overlap on both axes (there is no gap to
 * compare). Ties go vertical — flowcharts flow down — and are settled here,
 * in code, so a chart laid out on a perfect diagonal does not flip between
 * renders.
 */
export function pickPorts(from: PortEnd, to: PortEnd): { from: Port; to: Port } {
  const a = from.box
  const b = to.box
  const gapX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w))
  const gapY = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h))
  const dcx = b.x + b.w / 2 - (a.x + a.w / 2)
  const dcy = b.y + b.h / 2 - (a.y + a.h / 2)
  const vertical = gapX <= 0 && gapY <= 0 ? Math.abs(dcy) >= Math.abs(dcx) : gapY >= gapX
  const auto: { from: Port; to: Port } = vertical
    ? dcy >= 0 ? { from: 's', to: 'n' } : { from: 'n', to: 's' }
    : dcx >= 0 ? { from: 'e', to: 'w' } : { from: 'w', to: 'e' }
  return { from: from.port ?? auto.from, to: to.port ?? auto.to }
}

/** The port nearest a point — which side a connector dropped onto a shape attaches to. Ties resolve in PORTS order (n, e, s, w). */
export function nearestPort(form: ShapeForm | null, box: Box, p: Point): Port {
  let best: Port = 'n'
  let bestD = Infinity
  for (const port of ['n', 'e', 's', 'w'] as const) {
    const q = portPoint(form, box, port)
    const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2
    if (d < bestD) {
      bestD = d
      best = port
    }
  }
  return best
}

// ── Hit testing ────────────────────────────────────────────────────────────

/**
 * A true hit on the outline's interior (inclusive of the outline). A click
 * in a diamond's empty corner, or beside a stadium's round end, falls
 * through to whatever is beneath — a bounding-box test would make the
 * corners of every decision on a dense chart steal clicks from the lines
 * that pass there.
 */
export function pointInShape(form: ShapeForm | null, box: Box, p: Point): boolean {
  const lx = p.x - box.x
  const ly = p.y - box.y
  const { w, h } = box
  if (lx < 0 || ly < 0 || lx > w || ly > h) return false
  switch (form) {
    case 'decision': {
      if (w <= 0 || h <= 0) return false
      return Math.abs(lx - w / 2) / (w / 2) + Math.abs(ly - h / 2) / (h / 2) <= 1
    }
    case 'terminator': {
      const r = Math.min(w, h) / 2
      const qx = Math.min(Math.max(lx, r), w - r)
      const qy = Math.min(Math.max(ly, r), h - r)
      return (lx - qx) ** 2 + (ly - qy) ** 2 <= r * r
    }
    case 'junction': {
      const r = Math.min(w, h) / 2
      return (lx - w / 2) ** 2 + (ly - h / 2) ** 2 <= r * r
    }
    case 'io': {
      if (h <= 0) return false
      const s = ioSkew(w, h)
      const t = ly / h
      return lx >= s * (1 - t) && lx <= w - s * t
    }
    default:
      return true
  }
}

/** The box around boxes. Empty in, a zero box at the origin out — never Infinity, which would poison a viewBox. */
export function bounds(boxes: readonly Box[]): Box {
  if (boxes.length === 0) return { x: 0, y: 0, w: 0, h: 0 }
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const b of boxes) {
    x0 = Math.min(x0, b.x)
    y0 = Math.min(y0, b.y)
    x1 = Math.max(x1, b.x + b.w)
    y1 = Math.max(y1, b.y + b.h)
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

// ── Connector routing ──────────────────────────────────────────────────────

/** How far a connector leaves its port perpendicular before it may turn. Without it a line turns ON the outline and the arrowhead lies along the side. */
export const ROUTE_STUB = 16
/** How far a route keeps from the other shapes when it can. */
export const ROUTE_MARGIN = 12
/** What a bend costs, in world units of length: a route takes a 24-unit detour to save a corner, never more. */
export const ROUTE_BEND = 24
/** Corner radius of an orthogonal route (halved on a short segment). */
export const ROUTE_CORNER = 8
/** The default arrowhead length. */
export const ARROW_SIZE = 10

/**
 * The curve's constants. They MIRROR renderer/canvas/link-geometry.ts's
 * CURVE_RATIO / CURVE_MIN / CURVE_MAX by value — shared/ cannot import the
 * renderer — so a curved connector reads exactly like a panel link beside it.
 * flowchart.geometry.14 pins the relation.
 */
const CURVE_RATIO = 0.4
const CURVE_MIN = 24
const CURVE_MAX = 160

/** Extra cost per unit of length inside a shape's margin but outside the shape: a squeeze is allowed when the detour is long. */
const MARGIN_WEIGHT = 3
/** Extra cost per unit of length through a shape itself: always avoided when any other way exists, never forbidden — a route must exist even when a shape sits on top of the port. */
const BODY_WEIGHT = 400

export interface RouteEnd {
  box: Box
  form: ShapeForm | null
  port: Port
}

export interface RouteInput {
  from: RouteEnd
  to: RouteEnd
  route: Route
  /** The OTHER shapes; the caller leaves out the two endpoints' own boxes (they are handled here, with the stub exempt). */
  obstacles: readonly Box[]
  /**
   * Which ends carry an arrowhead. Only `d` changes: it is shortened under
   * each head by 0.6 × arrowSize so the stroke does not poke through the
   * tip. `points`, `labelAt` and the angles stay the TRUE geometry, so
   * `arrowHead(points[last], endAngle)` lands exactly on the port. Absent =
   * no shortening (as `'none'`); callers with a Connector pass `c.ends ?? 'end'`.
   */
  ends?: Ends
  arrowSize?: number
}

export interface ConnectorPath {
  /** The stroke to draw (already shortened under arrowheads, see RouteInput.ends). */
  d: string
  /** straight: [p0, p1]; orthogonal: the polyline, ports included; curved: [p0, c1, c2, p1]. */
  points: Point[]
  /** Half-way along the path by LENGTH — where the label pill sits. */
  labelAt: Point
  /** The direction the line travels arriving INTO the source (radians, atan2, y down) — an arrowhead at the start points this way. */
  startAngle: number
  /** The direction the line travels arriving INTO the target. */
  endAngle: number
}

const angleOf = (from: Point, to: Point): number => Math.atan2(to.y - from.y, to.x - from.x)
const dist = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y)
const inward = (port: Port): number => Math.atan2(-NORMAL[port].y, -NORMAL[port].x)

/**
 * A connector's route between two ports. The same function draws the canvas
 * and writes the SVG export.
 *
 * Cost: one orthogonal route is a small A* over a grid built only from the
 * obstacles near the two ends (or, past LAZY_AT of them, only those the
 * route turns out to need), so a drag that re-routes one shape's
 * connectors never touches the rest of the chart (flowchart.geometry.21
 * measures it on 200 shapes; .22 pins that no route crosses one).
 */
export function routeConnector(input: RouteInput): ConnectorPath {
  const { from, to } = input
  const p0 = portPoint(from.form, from.box, from.port)
  const p1 = portPoint(to.form, to.box, to.port)
  const size = input.arrowSize ?? ARROW_SIZE
  const ends = input.ends ?? 'none'
  const trimStart = ends === 'start' || ends === 'both'
  const trimEnd = ends === 'end' || ends === 'both'

  if (input.route === 'curved') {
    const offset = Math.min(CURVE_MAX, Math.max(CURVE_MIN, dist(p0, p1) * CURVE_RATIO))
    const n0 = NORMAL[from.port]
    const n1 = NORMAL[to.port]
    const c1 = { x: p0.x + n0.x * offset, y: p0.y + n0.y * offset }
    const c2 = { x: p1.x + n1.x * offset, y: p1.y + n1.y * offset }
    const points = [p0, c1, c2, p1]
    const drawn = trimPoints(points, 'curved', trimStart, trimEnd, size)
    return {
      d: connectorD(drawn, 'curved'),
      points,
      labelAt: cubicHalfway(p0, c1, c2, p1),
      // The tangent at each end is the control arm, which is the port
      // normal — so a curved connector's head always enters square to the side.
      startAngle: angleOf(c1, p0),
      endAngle: angleOf(c2, p1)
    }
  }

  const points = input.route === 'straight' ? [p0, p1] : orthogonalPoints(input, p0, p1)
  const drawn = trimPoints(points, input.route, trimStart, trimEnd, size)
  const n = points.length
  // A zero-length end segment has no direction of its own; the port does.
  const startSeg = n >= 2 && dist(points[0], points[1]) > 0
  const endSeg = n >= 2 && dist(points[n - 2], points[n - 1]) > 0
  return {
    d: connectorD(drawn, input.route),
    points,
    labelAt: polylineHalfway(points),
    startAngle: startSeg ? angleOf(points[1], points[0]) : inward(from.port),
    endAngle: endSeg ? angleOf(points[n - 2], points[n - 1]) : inward(to.port)
  }
}

/**
 * The path `d` for a route's points. Exported so a caller that trims or edits
 * points itself draws them the same way.
 * straight 'M L'; orthogonal a polyline whose corners are rounded with a
 * radius of min(ROUTE_CORNER, half of each adjacent segment) — half, so two
 * corners on one short segment never overlap; curved 'M C' in
 * link-geometry's own format.
 */
export function connectorD(points: readonly Point[], route: Route): string {
  if (points.length === 0) return ''
  const p = points
  const head = `M ${n2(p[0].x)} ${n2(p[0].y)}`
  if (route === 'curved' && p.length === 4) {
    return `${head} C ${n2(p[1].x)} ${n2(p[1].y)}, ${n2(p[2].x)} ${n2(p[2].y)}, ${n2(p[3].x)} ${n2(p[3].y)}`
  }
  if (route !== 'orthogonal' || p.length < 3) {
    return `${head} L ${n2(p[p.length - 1].x)} ${n2(p[p.length - 1].y)}`
  }
  const parts = [head]
  for (let i = 1; i < p.length - 1; i++) {
    const a = p[i - 1]
    const b = p[i]
    const c = p[i + 1]
    const l1 = dist(a, b)
    const l2 = dist(b, c)
    const r = Math.min(ROUTE_CORNER, l1 / 2, l2 / 2)
    if (r < 0.01) {
      parts.push(`L ${n2(b.x)} ${n2(b.y)}`)
      continue
    }
    // A quadratic with its control ON the corner: indistinguishable from a
    // circular arc at 8 units, and it needs no sweep flag to get wrong.
    const ux = (b.x - a.x) / l1
    const uy = (b.y - a.y) / l1
    const vx = (c.x - b.x) / l2
    const vy = (c.y - b.y) / l2
    parts.push(`L ${n2(b.x - ux * r)} ${n2(b.y - uy * r)}`)
    parts.push(`Q ${n2(b.x)} ${n2(b.y)} ${n2(b.x + vx * r)} ${n2(b.y + vy * r)}`)
  }
  const last = p[p.length - 1]
  parts.push(`L ${n2(last.x)} ${n2(last.y)}`)
  return parts.join(' ')
}

/**
 * The points with an end pulled back under its arrowhead by 0.6 × size, so
 * a stroke's round cap cannot poke out through the head's tip. Along the
 * end segment only, and never past it: the head covers the corner anyway,
 * and pulling back round a corner would bend the line inside the head.
 * A copy — the caller's points are the true geometry and stay so.
 */
export function trimForArrow(points: readonly Point[], route: Route, which: 'start' | 'end', size = ARROW_SIZE): Point[] {
  return trimPoints(points, route, which === 'start', which === 'end', size)
}

function trimPoints(points: readonly Point[], route: Route, start: boolean, end: boolean, size: number): Point[] {
  const out = points.map((p) => ({ ...p }))
  const n = out.length
  if (n < 2) return out
  const want = size * 0.6
  const pull = (tipIdx: number, towardIdx: number, limit: number): void => {
    const tip = out[tipIdx]
    const toward = out[towardIdx]
    const len = dist(tip, toward)
    const t = Math.min(want, Math.max(0, limit))
    if (len === 0 || t <= 0) return
    out[tipIdx] = { x: tip.x + ((toward.x - tip.x) / len) * t, y: tip.y + ((toward.y - tip.y) / len) * t }
  }
  if (route === 'curved' && n === 4) {
    // Along the control arm, which is the tangent: the curve still meets
    // the head square. The arm is at least CURVE_MIN (24) long.
    if (start) pull(0, 1, dist(out[0], out[1]) - 1)
    if (end) pull(3, 2, dist(out[3], out[2]) - 1)
    return out
  }
  // When both ends trim one straight segment, each may take at most half,
  // so a very short connector keeps a visible stroke between its heads.
  const share = start && end && n === 2 ? 0.5 : 1
  if (start) pull(0, 1, dist(points[0], points[1]) * share - 0.5)
  if (end) pull(n - 1, n - 2, dist(points[n - 1], points[n - 2]) * share - 0.5)
  return out
}

function polylineHalfway(points: readonly Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 }
  let total = 0
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1], points[i])
  let left = total / 2
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const l = dist(a, b)
    if (left <= l && l > 0) return { x: a.x + ((b.x - a.x) * left) / l, y: a.y + ((b.y - a.y) * left) / l }
    left -= l
  }
  return { ...points[points.length - 1] }
}

/**
 * Half-way by LENGTH, not t = 0.5. link-geometry's closed form
 * (P0 + 3C1 + 3C2 + P3) / 8 is the t = 0.5 point, which sits off-centre on an
 * asymmetric cubic (a curve that leaves 'e' and enters 'n') — a label there
 * reads as belonging to one end. 32 chords is well under a unit of error at
 * canvas sizes and costs nothing beside the orthogonal router.
 */
function cubicHalfway(p0: Point, c1: Point, c2: Point, p1: Point): Point {
  const at = (t: number): Point => {
    const u = 1 - t
    const a = u * u * u
    const b = 3 * u * u * t
    const c = 3 * u * t * t
    const d = t * t * t
    return { x: a * p0.x + b * c1.x + c * c2.x + d * p1.x, y: a * p0.y + b * c1.y + c * c2.y + d * p1.y }
  }
  const N = 32
  const samples: Point[] = []
  for (let i = 0; i <= N; i++) samples.push(at(i / N))
  return polylineHalfway(samples)
}

// ── The orthogonal router ──────────────────────────────────────────────────

interface Rect {
  l: number
  t: number
  r: number
  b: number
  /** Extra cost per unit of length strictly inside. */
  w: number
  /**
   * Whether its sides become grid lines. A margin's sides do (they are where
   * a route runs); a body's do not — it sits inside its margin and is
   * classified by edge midpoints, and giving it lines too would double the
   * grid to offer routes that touch the shape.
   */
  line: boolean
}

// Direction codes: 0 +x, 1 -x, 2 +y, 3 -y. `d ^ 1` is the reverse.
const DX = [1, -1, 0, 0]
const DY = [0, 0, 1, -1]
const DIR_OF: Readonly<Record<Port, number>> = { e: 0, w: 1, s: 2, n: 3 }

/**
 * Scratch buffers, grown on demand and reused across calls. Not state: every
 * slot a route reads was written by that route (the `stamp` generation says
 * which), so the output depends on the input alone — but a drag re-routing
 * forty connectors a frame allocates nothing.
 */
let cap = 0
let gBuf = new Float64Array(0)
let stampBuf = new Int32Array(0)
let parentBuf = new Int32Array(0)
let gen = 0
let heapF = new Float64Array(1024)
let heapG = new Float64Array(1024)
let heapS = new Int32Array(1024)
let hWBuf = new Float64Array(0)
let vWBuf = new Float64Array(0)

function ensureStates(states: number, edges: number): void {
  if (states > cap) {
    cap = Math.max(states, cap * 2)
    gBuf = new Float64Array(cap)
    stampBuf = new Int32Array(cap)
    parentBuf = new Int32Array(cap)
    gen = 0
  }
  if (edges > hWBuf.length) {
    const size = Math.max(edges, hWBuf.length * 2)
    hWBuf = new Float64Array(size)
    vWBuf = new Float64Array(size)
  }
  gen++
  if (gen > 0x3fffffff) {
    stampBuf.fill(0)
    gen = 1
  }
}

const inflate = (b: Box, m: number, w: number): Rect => ({ l: b.x - m, t: b.y - m, r: b.x + b.w + m, b: b.y + b.h + m, w, line: true })
const bodyOf = (b: Box, w: number, line = false): Rect => ({ l: b.x, t: b.y, r: b.x + b.w, b: b.y + b.h, w, line })

/** Sorted, exact-deduplicated. Exact, not within an epsilon: snapping a stub end onto a neighbour 0.004 away would leave the stub a hair off axis. */
function uniqueSorted(values: number[]): number[] {
  values.sort((a, b) => a - b)
  const out: number[] = []
  for (const v of values) if (out.length === 0 || out[out.length - 1] !== v) out.push(v)
  return out
}

/**
 * Candidate lines on one axis: the stub ends, every margin edge, and the
 * midpoint of each gap wider than 8 — the midpoints are what let a route
 * run down the MIDDLE of a corridor between two shapes instead of hugging
 * one of them. Past 64 base lines the midpoints are dropped: that many is a
 * long connector across a dense, unaligned chart, where the grid's cost is
 * quadratic and centring is a luxury.
 */
function axisLines(base: number[]): number[] {
  const u = uniqueSorted(base)
  if (u.length > 64) return u
  const out: number[] = []
  for (let i = 0; i < u.length; i++) {
    out.push(u[i])
    if (i + 1 < u.length && u[i + 1] - u[i] > 8) out.push((u[i] + u[i + 1]) / 2)
  }
  return out
}

/** First index whose value is > v (values ascending). */
function upper(values: ArrayLike<number>, n: number, v: number): number {
  let lo = 0
  let hi = n
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (values[mid] > v) hi = mid
    else lo = mid + 1
  }
  return lo
}
/** First index whose value is >= v. */
function lower(values: ArrayLike<number>, n: number, v: number): number {
  let lo = 0
  let hi = n
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (values[mid] >= v) hi = mid
    else lo = mid + 1
  }
  return lo
}

/**
 * The least number of bends an obstacle-free route needs from a point moving
 * in `d` to the target, arriving moving in `a` — the final turn into the
 * stub counted. In the target's frame, `a` rotated onto +x. This makes the
 * A* heuristic bend-aware and CONSISTENT (it is exact in free space), which
 * is what keeps a route across an empty stretch of canvas from exploring the
 * whole rectangle of equally short staircases.
 */
function minBends(px: number, py: number, fdx: number, fdy: number): number {
  if (fdx === 1) return px <= 0 ? (py === 0 ? 0 : 2) : 4
  if (fdx === -1) return py === 0 ? 4 : 2
  return fdy * py <= 0 && px <= 0 ? 1 : 3
}

interface GridRoute {
  /** Grid points from the source stub end to the target stub end, inclusive. */
  pts: Point[]
}

function searchGrid(s0: Point, s1: Point, startDir: number, arriveDir: number, rects: readonly Rect[]): GridRoute | null {
  const xb: number[] = [s0.x, s1.x]
  const yb: number[] = [s0.y, s1.y]
  for (const r of rects) {
    if (!r.line) continue
    xb.push(r.l, r.r)
    yb.push(r.t, r.b)
  }
  const xs = axisLines(xb)
  const ys = axisLines(yb)
  const nx = xs.length
  const ny = ys.length
  const N = nx * ny
  const FINAL = N * 4
  const hEdges = (nx - 1) * ny
  const vEdges = nx * (ny - 1)
  ensureStates(FINAL + 1, Math.max(hEdges, vEdges, 1))
  const hW = hWBuf
  const vW = vWBuf
  hW.fill(0, 0, hEdges)
  vW.fill(0, 0, vEdges)

  // Edge midpoints, so a rect whose sides are NOT grid lines (a body inside
  // its margin) still classifies every edge it covers.
  const mx = new Float64Array(Math.max(nx - 1, 0))
  const my = new Float64Array(Math.max(ny - 1, 0))
  for (let i = 0; i + 1 < nx; i++) mx[i] = (xs[i] + xs[i + 1]) / 2
  for (let j = 0; j + 1 < ny; j++) my[j] = (ys[j] + ys[j + 1]) / 2

  // Rasterise each rect onto the edges strictly inside it. An edge ALONG a
  // margin line is outside (the route may run there); max, not sum, so two
  // overlapping margins do not make a gap between them look like a body.
  for (const r of rects) {
    const j0 = upper(ys, ny, r.t)
    const j1 = lower(ys, ny, r.b)
    const i0 = upper(mx, nx - 1, r.l)
    const i1 = lower(mx, nx - 1, r.r)
    for (let j = j0; j < j1; j++) {
      const row = j * (nx - 1)
      for (let i = i0; i < i1; i++) if (hW[row + i] < r.w) hW[row + i] = r.w
    }
    const ci0 = upper(xs, nx, r.l)
    const ci1 = lower(xs, nx, r.r)
    const rj0 = upper(my, ny - 1, r.t)
    const rj1 = lower(my, ny - 1, r.b)
    for (let j = rj0; j < rj1; j++) {
      const row = j * nx
      for (let i = ci0; i < ci1; i++) if (vW[row + i] < r.w) vW[row + i] = r.w
    }
  }

  const si = lower(xs, nx, s0.x)
  const sj = lower(ys, ny, s0.y)
  const ti = lower(xs, nx, s1.x)
  const tj = lower(ys, ny, s1.y)
  const goal = tj * nx + ti
  const tx = s1.x
  const ty = s1.y
  // The arrival frame for the bend estimate: `ua` is the arrival direction,
  // `pa` its perpendicular.
  const uax = DX[arriveDir]
  const uay = DY[arriveDir]
  const pax = -uay
  const pay = uax
  const h = (i: number, j: number, d: number): number => {
    const vx = xs[i] - tx
    const vy = ys[j] - ty
    const px = vx * uax + vy * uay
    const py = vx * pax + vy * pay
    const fdx = DX[d] * uax + DY[d] * uay
    const fdy = DX[d] * pax + DY[d] * pay
    return Math.abs(vx) + Math.abs(vy) + ROUTE_BEND * minBends(px, py, fdx, fdy)
  }

  const g = gBuf
  const stamp = stampBuf
  const parent = parentBuf
  const G = gen
  const getG = (s: number): number => (stamp[s] === G ? g[s] : Infinity)
  let size = 0
  const push = (f: number, gv: number, s: number): void => {
    if (size === heapF.length) {
      const grow = (a: Float64Array<ArrayBuffer>): Float64Array<ArrayBuffer> => { const b = new Float64Array(a.length * 2); b.set(a); return b }
      heapF = grow(heapF)
      heapG = grow(heapG)
      const s2 = new Int32Array(heapS.length * 2)
      s2.set(heapS)
      heapS = s2
    }
    let k = size++
    // Sift up. Ties on f go to the DEEPER state (larger g): on a plateau of
    // equally short routes that walks one of them to the goal instead of
    // widening every one of them in step.
    while (k > 0) {
      const p = (k - 1) >> 1
      if (heapF[p] < f || (heapF[p] === f && heapG[p] >= gv)) break
      heapF[k] = heapF[p]
      heapG[k] = heapG[p]
      heapS[k] = heapS[p]
      k = p
    }
    heapF[k] = f
    heapG[k] = gv
    heapS[k] = s
  }
  const popInto = (): number => {
    const top = heapS[0]
    const lastF = heapF[--size]
    const lastG = heapG[size]
    const lastS = heapS[size]
    let k = 0
    for (;;) {
      const l = 2 * k + 1
      if (l >= size) break
      const r = l + 1
      let c = l
      if (r < size && (heapF[r] < heapF[l] || (heapF[r] === heapF[l] && heapG[r] > heapG[l]))) c = r
      if (lastF < heapF[c] || (lastF === heapF[c] && lastG >= heapG[c])) break
      heapF[k] = heapF[c]
      heapG[k] = heapG[c]
      heapS[k] = heapS[c]
      k = c
    }
    heapF[k] = lastF
    heapG[k] = lastG
    heapS[k] = lastS
    return top
  }

  const start = ((sj * nx + si) << 2) | startDir
  stamp[start] = G
  g[start] = 0
  parent[start] = -1
  push(h(si, sj, startDir), 0, start)
  let found = false
  while (size > 0) {
    const gv = heapG[0]
    const s = popInto()
    if (s === FINAL) {
      found = true
      break
    }
    if (gv > getG(s)) continue
    const node = s >> 2
    const d = s & 3
    const i = node % nx
    const j = (node - i) / nx
    if (node === goal && d !== (arriveDir ^ 1)) {
      // The last turn is into the stub. Arriving head-on in the stub's
      // reverse would be a spike back along itself; that state has no edge
      // here and the search goes round instead.
      const fg = gv + (d === arriveDir ? 0 : ROUTE_BEND)
      if (fg < getG(FINAL)) {
        stamp[FINAL] = G
        g[FINAL] = fg
        parent[FINAL] = s
        push(fg, fg, FINAL)
      }
    }
    for (let nd = 0; nd < 4; nd++) {
      if (nd === (d ^ 1)) continue
      const ni = i + DX[nd]
      const nj = j + DY[nd]
      if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue
      let len: number
      let w: number
      if (nd < 2) {
        const e = j * (nx - 1) + Math.min(i, ni)
        len = Math.abs(xs[ni] - xs[i])
        w = hW[e]
      } else {
        const e = Math.min(j, nj) * nx + i
        len = Math.abs(ys[nj] - ys[j])
        w = vW[e]
      }
      const ng = gv + len * (1 + w) + (nd === d ? 0 : ROUTE_BEND)
      const ns = ((nj * nx + ni) << 2) | nd
      if (ng < getG(ns)) {
        stamp[ns] = G
        g[ns] = ng
        parent[ns] = s
        push(ng + h(ni, nj, nd), ng, ns)
      }
    }
  }
  if (!found) return null
  const pts: Point[] = []
  for (let s = parent[FINAL]; s !== -1; s = parent[s]) {
    const node = s >> 2
    const i = node % nx
    pts.push({ x: xs[i], y: ys[(node - i) / nx] })
  }
  pts.reverse()
  return { pts }
}

/** Drop repeats and the middle of any three points on one axis-aligned line. */
function simplify(points: readonly Point[]): Point[] {
  const out: Point[] = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (last && last.x === p.x && last.y === p.y) continue
    out.push(p)
    while (out.length >= 3) {
      const a = out[out.length - 3]
      const b = out[out.length - 2]
      const c = out[out.length - 1]
      if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) out.splice(out.length - 2, 1)
      else break
    }
  }
  return out
}

/** Σ weight × length strictly inside, for one axis-aligned segment. */
function segmentPenalty(a: Point, b: Point, rects: readonly Rect[]): number {
  let sum = 0
  for (const r of rects) {
    if (a.y === b.y) {
      if (a.y <= r.t || a.y >= r.b) continue
      const lo = Math.max(Math.min(a.x, b.x), r.l)
      const hi = Math.min(Math.max(a.x, b.x), r.r)
      if (hi > lo) sum += (hi - lo) * r.w
    } else {
      if (a.x <= r.l || a.x >= r.r) continue
      const lo = Math.max(Math.min(a.y, b.y), r.t)
      const hi = Math.min(Math.max(a.y, b.y), r.b)
      if (hi > lo) sum += (hi - lo) * r.w
    }
  }
  return sum
}

/**
 * Slide every Z's middle segment to the middle of the free space it can
 * move in. The grid search finds A shortest route with fewest bends, but on
 * a Z every jog position between the two ends costs the same, and which one
 * it returns is an accident of the grid — the route would jog hard against
 * one shape and move when an unrelated shape nearby changed the grid.
 * Centred between whatever bounds it (the shapes' margins, or the stubs),
 * and only when that costs nothing.
 */
function centreJogs(pts: Point[], s0: Point, s1: Point, rects: readonly Rect[]): void {
  const n = pts.length
  for (let k = 1; k + 2 <= n - 1; k++) {
    const a = pts[k - 1]
    const b = pts[k]
    const c = pts[k + 1]
    const e = pts[k + 2]
    // `u` is the axis the jog slides along (the prev/next segments' axis).
    const slidesX = b.x === c.x
    const get = (p: Point): number => (slidesX ? p.x : p.y)
    const across = (p: Point): number => (slidesX ? p.y : p.x)
    if (slidesX ? a.y !== b.y || c.y !== e.y : a.x !== b.x || c.x !== e.x) continue
    const dir = Math.sign(get(b) - get(a))
    if (dir === 0 || dir !== Math.sign(get(e) - get(c))) continue
    // Hard limits: strictly between the neighbouring bends, and never inside a stub.
    const lo = k - 1 === 0 ? get(s0) : get(a)
    const hi = k + 2 === n - 1 ? get(s1) : get(e)
    if ((hi - lo) * dir <= 0) continue
    // Soft bounds: the nearest rect on each side that the sliding jog would meet.
    const spanLo = Math.min(across(b), across(c))
    const spanHi = Math.max(across(b), across(c))
    const at = get(b)
    let before = -Infinity
    let after = Infinity
    let blocked = false
    for (const r of rects) {
      const rl = slidesX ? r.t : r.l
      const rh = slidesX ? r.b : r.r
      const ul = slidesX ? r.l : r.t
      const uh = slidesX ? r.r : r.b
      if (rh <= spanLo || rl >= spanHi) continue
      if (uh <= at) before = Math.max(before, uh)
      else if (ul >= at) after = Math.min(after, ul)
      else blocked = true
    }
    if (blocked) continue
    const lo2 = dir > 0 ? lo : hi
    const hi2 = dir > 0 ? hi : lo
    const from = Number.isFinite(before) ? before : lo2
    const to = Number.isFinite(after) ? after : hi2
    let target = (from + to) / 2
    target = Math.min(Math.max(target, lo2), hi2)
    if (target === at || target === lo2 || target === hi2) continue
    const nb = slidesX ? { x: target, y: b.y } : { x: b.x, y: target }
    const nc = slidesX ? { x: target, y: c.y } : { x: c.x, y: target }
    const was = segmentPenalty(a, b, rects) + segmentPenalty(b, c, rects) + segmentPenalty(c, e, rects)
    const now = segmentPenalty(a, nb, rects) + segmentPenalty(nb, nc, rects) + segmentPenalty(nc, e, rects)
    if (now <= was + 1e-9) {
      pts[k] = nb
      pts[k + 1] = nc
    }
  }
}

interface Region {
  l: number
  t: number
  r: number
  b: number
}
const dot = (p: Point): Box => ({ x: p.x, y: p.y, w: 0, h: 0 })
const grow = (bx: Box, m: number): Region => ({ l: bx.x - m, t: bx.y - m, r: bx.x + bx.w + m, b: bx.y + bx.h + m })
const meets = (r: Region, g: Region): boolean => !(r.r < g.l || r.l > g.r || r.b < g.t || r.t > g.b)
/** Whether an axis-aligned segment enters a rect's open interior. */
const crosses = (p: Point, q: Point, r: Region): boolean =>
  p.y === q.y
    ? p.y > r.t && p.y < r.b && Math.max(p.x, q.x) > r.l && Math.min(p.x, q.x) < r.r
    : p.x > r.l && p.x < r.r && Math.max(p.y, q.y) > r.t && Math.min(p.y, q.y) < r.b
/** Past this many obstacles between the ends, obstacles join the grid lazily (see orthogonalPoints). */
const LAZY_AT = 40

function orthogonalPoints(input: RouteInput, p0: Point, p1: Point): Point[] {
  const { from, to } = input
  const a = from.box
  const b = to.box
  // Stub ends are measured from the BOX side, not the port: an io's port is
  // inset on its slanted side and a document's sits on the wave, and a stub
  // measured from those would end inside the shape's own margin.
  const stubEnd = (end: RouteEnd, p: Point): Point => {
    const x = end.box
    switch (end.port) {
      case 'e': return { x: x.x + x.w + ROUTE_STUB, y: p.y }
      case 'w': return { x: x.x - ROUTE_STUB, y: p.y }
      case 's': return { x: p.x, y: x.y + x.h + ROUTE_STUB }
      case 'n': return { x: p.x, y: x.y - ROUTE_STUB }
    }
  }
  const s0 = stubEnd(from, p0)
  const s1 = stubEnd(to, p1)

  // Facing ports closer than two stubs: both stubs end at the middle of the
  // gap, so the route is a straight line or a Z jogging exactly midway —
  // two full stubs would cross and the line would double back on itself.
  let endMargin = ROUTE_MARGIN
  const facing = (fromPort: Port, toPort: Port, horizontal: boolean, gap: number, sideA: number, sideB: number, ahead: boolean): void => {
    if (from.port !== fromPort || to.port !== toPort || !ahead || gap >= 2 * ROUTE_STUB) return
    const m = gap >= 0 ? (sideA + sideB) / 2 : horizontal ? (p0.x + p1.x) / 2 : (p0.y + p1.y) / 2
    if (horizontal) s0.x = s1.x = m
    else s0.y = s1.y = m
    endMargin = Math.max(0, Math.min(ROUTE_MARGIN, gap / 2 - 2))
  }
  facing('e', 'w', true, b.x - (a.x + a.w), a.x + a.w, b.x, p1.x > p0.x)
  facing('w', 'e', true, a.x - (b.x + b.w), a.x, b.x + b.w, p1.x < p0.x)
  facing('s', 'n', false, b.y - (a.y + a.h), a.y + a.h, b.y, p1.y > p0.y)
  facing('n', 's', false, a.y - (b.y + b.h), a.y, b.y + b.h, p1.y < p0.y)

  // With no room for a margin the endpoints' own sides are the lines a
  // route can run along.
  const ends: Rect[] = [bodyOf(a, BODY_WEIGHT, endMargin === 0), bodyOf(b, BODY_WEIGHT, endMargin === 0)]
  if (endMargin > 0) ends.push(inflate(a, endMargin, MARGIN_WEIGHT), inflate(b, endMargin, MARGIN_WEIGHT))

  // Only the obstacles near the two ends take part: the bounding box of both
  // ends, grown by two margins and a band. If the route found leaves that
  // region, the region grows to cover it and the search runs again — so an
  // obstacle the route passes is never one it did not consider.
  const band = 2 * ROUTE_MARGIN + 32
  const startDir = DIR_OF[from.port]
  const arriveDir = DIR_OF[to.port] ^ 1
  const margins = input.obstacles.map((o) => inflate(o, ROUTE_MARGIN, MARGIN_WEIGHT))
  const withObstacles = (take: (k: number) => boolean): Rect[] => {
    const out = ends.slice()
    for (let k = 0; k < margins.length; k++) if (take(k)) out.push(margins[k], bodyOf(input.obstacles[k], BODY_WEIGHT))
    return out
  }
  let best: Point[] | null = null
  let rects: Rect[] = ends

  const regional = (): void => {
    let region = grow(bounds([a, b, dot(s0), dot(s1)]), band)
    for (let attempt = 0; attempt < 4; attempt++) {
      const g = region
      rects = withObstacles((k) => meets(margins[k], g))
      const found = searchGrid(s0, s1, startDir, arriveDir, rects)
      if (!found) return
      best = found.pts
      const pb = bounds(best.map(dot))
      if (pb.x >= region.l && pb.y >= region.t && pb.x + pb.w <= region.r && pb.y + pb.h <= region.b) return
      region = { l: Math.min(region.l, pb.x - band), t: Math.min(region.t, pb.y - band), r: Math.max(region.r, pb.x + pb.w + band), b: Math.max(region.b, pb.y + pb.h + band) }
    }
  }

  /**
   * A long connector across a dense chart would put every shape between its
   * ends into the grid — two hundred unaligned shapes are ~400 lines an axis,
   * and a straight run then steps through every one of them (measured: ~14 ms
   * for the worst of 260 random long hops, against ~0.05 ms typical). So past
   * LAZY_AT obstacles the set starts from what is near either end and on the
   * two L-shaped probes between them, and grows only by what a route
   * actually CROSSED (with its neighbours, to pre-empt the next bump). A route
   * clean against every obstacle and cheapest against the ones it saw is
   * cheapest against all of them, so this changes the cost, not the answer —
   * up to the grid lines the unseen shapes would have added. If it has not
   * converged in 12 rounds the full regional search runs instead.
   */
  const lazy = (): boolean => {
    const taken = new Uint8Array(margins.length)
    const nearA = grow(bounds([a, dot(s0)]), band)
    const nearB = grow(bounds([b, dot(s1)]), band)
    const cA = { x: s1.x, y: s0.y }
    const cB = { x: s0.x, y: s1.y }
    const probes: [Point, Point][] = [[s0, cA], [cA, s1], [s0, cB], [cB, s1]]
    for (let k = 0; k < margins.length; k++) {
      const m = margins[k]
      if (meets(m, nearA) || meets(m, nearB) || probes.some(([p, q]) => crosses(p, q, m))) taken[k] = 1
    }
    for (let attempt = 0; attempt < 12; attempt++) {
      rects = withObstacles((k) => taken[k] === 1)
      const found = searchGrid(s0, s1, startDir, arriveDir, rects)
      if (!found) return false
      const pts = found.pts
      const hit: number[] = []
      for (let k = 0; k < margins.length; k++) {
        if (taken[k] === 1) continue
        for (let i = 1; i < pts.length; i++) {
          if (crosses(pts[i - 1], pts[i], margins[k])) {
            hit.push(k)
            break
          }
        }
      }
      if (hit.length === 0) {
        best = pts
        return true
      }
      for (const v of hit) {
        taken[v] = 1
        const around = grow({ x: margins[v].l, y: margins[v].t, w: margins[v].r - margins[v].l, h: margins[v].b - margins[v].t }, band)
        for (let k = 0; k < margins.length; k++) if (taken[k] === 0 && meets(margins[k], around)) taken[k] = 1
      }
    }
    return false
  }

  const crowd = margins.reduce((n, m) => n + (meets(m, grow(bounds([a, b, dot(s0), dot(s1)]), band)) ? 1 : 0), 0)
  const wentLazy = crowd > LAZY_AT && lazy()
  if (!wentLazy) regional()
  // Centring slides a jog into space the search may never have looked at
  // when it went lazy, so it is judged against every obstacle — the unseen
  // shape beside the corridor is exactly the one a slid jog would cut.
  if (wentLazy) rects = withObstacles(() => true)
  // No grid route is not reachable in practice (every obstacle is soft), but
  // a connector must never vanish: fall back to an L through the stubs.
  const grid = best ?? [s0, { x: s1.x, y: s0.y }, s1]
  const pts = simplify([p0, ...grid, p1])
  centreJogs(pts, s0, s1, rects)
  const out = simplify(pts)
  // Both ports are always in the list, even when they coincide.
  return out.length >= 2 ? out : [p0, p1]
}

// ── Arrowheads ─────────────────────────────────────────────────────────────

/**
 * A filled triangle whose TIP is exactly `tip`, pointing along `angle`:
 * `size` long, 0.45 × size to each side. Drawn with the route's
 * `endAngle`/`startAngle` at `points[last]`/`points[0]`.
 */
export function arrowHead(tip: Point, angle: number, size = ARROW_SIZE): string {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const bx = tip.x - c * size
  const by = tip.y - s * size
  const hw = size * 0.45
  return `M ${n2(tip.x)} ${n2(tip.y)} L ${n2(bx - s * hw)} ${n2(by + c * hw)} L ${n2(bx + s * hw)} ${n2(by - c * hw)} Z`
}
