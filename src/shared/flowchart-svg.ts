/**
 * M388. A FLOWCHART AS A STANDALONE SVG — text, built from the model.
 *
 * Built from the shape records and connectors, never from a screenshot of
 * the canvas: the canvas PNG is the ONE binary export (CLAUDE.md, D6), and an
 * SVG carrying an embedded raster would be a second, ungated one. So this
 * file writes vector paths and text only — no <image>, no data: URL, no
 * href of any kind, no <script>, no <foreignObject> — and main passes the
 * result through `outward()` like any other text leaving the app
 * (flowchart.svg.3 pins the absences).
 *
 * The routes come from `routeConnector`, the function the canvas draws with,
 * so an exported chart is the chart on screen.
 *
 * Colours arrive as LITERAL strings: `var(--…)` does not resolve in a file
 * opened outside the app, so the renderer resolves the theme's custom
 * properties before calling. Every label is user- or agent-authored and is
 * escaped (flowchart.svg.2).
 *
 * Deterministic: the same model writes byte-identical text.
 */
import type { Connector, ShapeFill, ShapeForm, ShapeInk, ShapeRecord, ShapeStroke } from './flowchart'
import {
  ARROW_SIZE,
  arrowHead,
  bounds,
  ioSkew,
  pathFromPoints,
  pickPorts,
  routeConnector,
  shapeDetail,
  shapeOutline,
  waveAmplitude,
  type Box,
  type ConnectorPath,
  type Point
} from './flowchart-geometry'

export interface FlowchartSvgModel {
  shapes: { id: string; box: Box; shape: ShapeRecord }[]
  connectors: {
    fromBox: Box
    fromForm: ShapeForm | null
    toBox: Box
    toForm: ShapeForm | null
    connector: Connector
    /**
     * The route, ALREADY computed (the canvas's own) — drawn as given, no
     * search. Main builds from these: it never routes (`pathFromPoints`).
     */
    points?: Point[]
    /** Without `points`: the other shapes this connector routes around — the same list the canvas passes. */
    obstacles?: Box[]
  }[]
  /** Live objects a connector touches (a terminal, a file, a note), drawn as a plain labelled rect. */
  panels?: { box: Box; title: string }[]
}

export interface FlowchartSvgColours {
  fill: Record<ShapeFill, string>
  stroke: Record<ShapeStroke, string>
  ink: Record<ShapeInk, string>
  background: string
  /** A connector's colour when it names none. */
  line: string
}

const FONT = '-apple-system, "SF Pro Text", system-ui, sans-serif'
const FONT_SIZE = 14
const LINE_HEIGHT = FONT_SIZE * 1.3
const LABEL_FONT = 12
const LABEL_LINE = LABEL_FONT * 1.3
/** Average advance of the system face per character, as a fraction of the size. An estimate — there is no text measurement without a DOM — used only to wrap and to size pills. */
const ADVANCE = 0.56
const STROKE_WIDTH = 1.5
const JUNCTION_LABEL_W = 160

const n2 = (v: number): string => String(Math.round(v * 100) / 100)

/**
 * Text as XML character data or an attribute value. The five entities, and
 * the characters XML 1.0 forbids outright removed: a NUL or a lone surrogate
 * in an agent-written label would not be an injection, it would make the
 * whole file refuse to open — and a chart that will not open is the export
 * failing silently.
 */
export function escapeXml(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** The width a label may use inside each form, so a line wraps before it crosses the outline. */
function innerWidth(form: ShapeForm, w: number, h: number): number {
  switch (form) {
    case 'decision': return w * 0.62
    case 'io': return w - 2 * ioSkew(w, h) - 12
    case 'terminator': return w - Math.min(w, h) * 0.5 - 8
    // A junction's label cannot fit inside a 28-unit dot; it sits off its
    // upper-right (see flowchartSvg) with a label's ordinary width.
    case 'junction': return JUNCTION_LABEL_W
    case 'text': return w
    default: return w - 16
  }
}

/** Greedy word wrap by estimated width. A word longer than a line is broken, never allowed to run out of the shape. */
function wrap(text: string, maxWidth: number, fontSize: number): string[] {
  const perLine = Math.max(1, Math.floor(maxWidth / (fontSize * ADVANCE)))
  const out: string[] = []
  for (const raw of text.split('\n')) {
    const words = raw.split(/\s+/).filter((w) => w !== '')
    if (words.length === 0) {
      out.push('')
      continue
    }
    let line = ''
    for (let word of words) {
      while (word.length > perLine) {
        if (line !== '') {
          out.push(line)
          line = ''
        }
        out.push(word.slice(0, perLine))
        word = word.slice(perLine)
      }
      if (line === '') line = word
      else if (line.length + 1 + word.length <= perLine) line += ` ${word}`
      else {
        out.push(line)
        line = word
      }
    }
    if (line !== '') out.push(line)
  }
  return out
}

/** One <text> with a <tspan> per line, centred on (cx, cy). Absolute y per line, so an empty line keeps its space without an empty tspan. */
function textBlock(lines: string[], cx: number, cy: number, fontSize: number, lineHeight: number, fill: string, anchor: 'middle' | 'start' = 'middle'): string {
  if (lines.every((l) => l === '')) return ''
  // 0.35em from the centre line to the baseline: dominant-baseline is not
  // honoured by every viewer this file may be opened in.
  const first = cy - ((lines.length - 1) * lineHeight) / 2 + fontSize * 0.35
  const spans = lines
    .map((l, i) => (l === '' ? '' : `<tspan x="${n2(cx)}" y="${n2(first + i * lineHeight)}">${escapeXml(l)}</tspan>`))
    .join('')
  return `<text text-anchor="${anchor}" font-size="${fontSize}" fill="${escapeXml(fill)}">${spans}</text>`
}

const DEFAULT_FILL = (form: ShapeForm): ShapeFill => (form === 'text' ? 'none' : 'plain')
const DEFAULT_STROKE = (form: ShapeForm): ShapeStroke => (form === 'text' ? 'none' : 'line')

export function flowchartSvg(model: FlowchartSvgModel, colours: FlowchartSvgColours, opts: { margin?: number; title?: string } = {}): string {
  const margin = opts.margin ?? 32

  // Routes first: their points, control points and label pills are part of
  // what the viewBox must hold (a curve's arm or a U-route leaves the boxes).
  const routed = model.connectors.map((c) => {
    const ports = pickPorts(
      { box: c.fromBox, form: c.fromForm, port: c.connector.from },
      { box: c.toBox, form: c.toForm, port: c.connector.toPort }
    )
    const ends = c.connector.ends ?? 'end'
    const path: ConnectorPath = c.points !== undefined
      ? pathFromPoints(c.points, c.connector.route ?? 'orthogonal', ends, ports, ARROW_SIZE)
      : routeConnector({
        from: { box: c.fromBox, form: c.fromForm, port: ports.from },
        to: { box: c.toBox, form: c.toForm, port: ports.to },
        route: c.connector.route ?? 'orthogonal',
        obstacles: c.obstacles ?? [],
        ends,
        arrowSize: ARROW_SIZE
      })
    const labelLines = c.connector.label ? wrap(c.connector.label, 220, LABEL_FONT) : []
    const longest = labelLines.reduce((m, l) => Math.max(m, l.length), 0)
    const pillW = longest * LABEL_FONT * ADVANCE + 12
    const pillH = labelLines.length * LABEL_LINE + 6
    const pill: Box | null = labelLines.length
      ? { x: path.labelAt.x - pillW / 2, y: path.labelAt.y - pillH / 2, w: pillW, h: pillH }
      : null
    return { c, path, ends, labelLines, pill }
  })

  const everything: Box[] = [
    ...model.shapes.map((s) => s.box),
    // A junction's label is drawn off its box's upper-right (below), and must not be cropped.
    ...model.shapes
      .filter((s) => s.shape.form === 'junction' && s.shape.text.trim() !== '')
      .map((s) => {
        const h = wrap(s.shape.text, JUNCTION_LABEL_W, FONT_SIZE).length * LINE_HEIGHT + 4
        return { x: s.box.x + s.box.w, y: s.box.y - h, w: JUNCTION_LABEL_W + 4, h }
      }),
    ...(model.panels ?? []).map((p) => p.box),
    ...model.connectors.flatMap((c) => [c.fromBox, c.toBox]),
    ...routed.flatMap((r) => [
      ...r.path.points.map((p) => ({ x: p.x - ARROW_SIZE, y: p.y - ARROW_SIZE, w: 2 * ARROW_SIZE, h: 2 * ARROW_SIZE })),
      ...(r.pill ? [r.pill] : [])
    ])
  ]
  const b = bounds(everything)
  const vx = b.x - margin
  const vy = b.y - margin
  const vw = b.w + 2 * margin
  const vh = b.h + 2 * margin

  const out: string[] = []
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n2(vx)} ${n2(vy)} ${n2(vw)} ${n2(vh)}" width="${n2(vw)}" height="${n2(vh)}" font-family="${escapeXml(FONT)}">`
  )
  if (opts.title) out.push(`<title>${escapeXml(opts.title)}</title>`)
  out.push(`<rect x="${n2(vx)}" y="${n2(vy)}" width="${n2(vw)}" height="${n2(vh)}" fill="${escapeXml(colours.background)}"/>`)

  // Live panels: a plain labelled rect. The export shows THAT a line goes to
  // a terminal, never what the terminal holds — its scrollback is not in the
  // model, so it cannot leak through a diagram.
  for (const p of model.panels ?? []) {
    const { x, y, w, h } = p.box
    const perLine = Math.max(1, Math.floor((w - 24) / (FONT_SIZE * ADVANCE)))
    const title = p.title.length > perLine ? `${p.title.slice(0, Math.max(0, perLine - 1))}…` : p.title
    out.push(
      `<g transform="translate(${n2(x)} ${n2(y)})">` +
        `<rect width="${n2(w)}" height="${n2(h)}" rx="10" fill="${escapeXml(colours.fill.plain)}" stroke="${escapeXml(colours.stroke.line)}" stroke-width="${STROKE_WIDTH}"/>` +
        textBlock([title], w / 2, h / 2, FONT_SIZE, LINE_HEIGHT, colours.ink.muted) +
        `</g>`
    )
  }

  for (const s of model.shapes) {
    const { form, text } = s.shape
    const { x, y, w, h } = s.box
    const fill = colours.fill[s.shape.fill ?? DEFAULT_FILL(form)]
    const stroke = colours.stroke[s.shape.stroke ?? DEFAULT_STROKE(form)]
    const ink = colours.ink[s.shape.ink ?? 'fg']
    const parts: string[] = [`<g transform="translate(${n2(x)} ${n2(y)})">`]
    const outline = shapeOutline(form, w, h)
    if (outline !== '') {
      parts.push(`<path d="${outline}" fill="${escapeXml(fill)}" stroke="${escapeXml(stroke)}" stroke-width="${STROKE_WIDTH}" stroke-linejoin="round"/>`)
    }
    const detail = shapeDetail(form, w, h)
    if (detail !== '') parts.push(`<path d="${detail}" fill="none" stroke="${escapeXml(stroke)}" stroke-width="${STROKE_WIDTH}"/>`)
    const lines = wrap(text, innerWidth(form, w, h), FONT_SIZE)
    if (form === 'junction') {
      // Lines meet IN the dot, from any side; the upper-right corner is the
      // one place neither the n nor the e connector passes through.
      parts.push(textBlock(lines, w + 4, -4 - (lines.length * LINE_HEIGHT) / 2 + LINE_HEIGHT / 2, FONT_SIZE, LINE_HEIGHT, ink, 'start'))
    } else {
      // A document's label centres above its wave, where the body is.
      const cy = form === 'document' ? (h - waveAmplitude(h)) / 2 : h / 2
      parts.push(textBlock(lines, w / 2, cy, FONT_SIZE, LINE_HEIGHT, ink))
    }
    parts.push('</g>')
    out.push(parts.join(''))
  }

  // Connectors ABOVE the shapes: the arrowhead is the only thing that
  // carries direction, so it is the one thing that must never be under a fill.
  for (const r of routed) {
    const colour = escapeXml(r.c.connector.stroke ? colours.stroke[r.c.connector.stroke] : colours.line)
    const dash = r.c.connector.dashed ? ' stroke-dasharray="6 5"' : ''
    const parts = [`<g>`, `<path d="${r.path.d}" fill="none" stroke="${colour}" stroke-width="${STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round"${dash}/>`]
    const pts = r.path.points
    if (r.ends === 'end' || r.ends === 'both') parts.push(`<path d="${arrowHead(pts[pts.length - 1], r.path.endAngle, ARROW_SIZE)}" fill="${colour}"/>`)
    if (r.ends === 'start' || r.ends === 'both') parts.push(`<path d="${arrowHead(pts[0], r.path.startAngle, ARROW_SIZE)}" fill="${colour}"/>`)
    parts.push('</g>')
    out.push(parts.join(''))
  }

  // Labels last, over every line: a label a crossing connector struck
  // through would be unreadable, and the pill is the background colour so
  // it reads as a gap in its own line.
  for (const r of routed) {
    if (!r.pill) continue
    const p = r.pill
    out.push(
      `<g>` +
        `<rect x="${n2(p.x)}" y="${n2(p.y)}" width="${n2(p.w)}" height="${n2(p.h)}" rx="${n2(Math.min(9, p.h / 2))}" fill="${escapeXml(colours.background)}"/>` +
        textBlock(r.labelLines, r.path.labelAt.x, r.path.labelAt.y, LABEL_FONT, LABEL_LINE, colours.ink.fg) +
        `</g>`
    )
  }

  out.push('</svg>')
  return `${out.join('\n')}\n`
}
