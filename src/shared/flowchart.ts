/**
 * M388. THE FLOWCHART SHAPE'S PURE RULES — the record a `shape` panel carries,
 * and the connector record any panel may carry.
 *
 * A shape is a Panel of kind `shape` (docs/build-log/m388-m396-ledger.md, D1):
 * it takes the canvas's own selection, drag, groups, snapping, undo and
 * persistence, and renders in one light layer rather than through PanelFrame.
 * A connector is its OWN record on the SOURCE object (D2) — never a PanelLink,
 * because a link means something (task membership, handoff, dependency lines)
 * and an arrow in a diagram must not.
 *
 * Pure: no DOM, no node. Plain-node checked in `verify:flowchart`.
 */

export type ShapeForm = 'process' | 'decision' | 'terminator' | 'io' | 'document' | 'subprocess' | 'junction' | 'text'

export const SHAPE_FORMS: readonly ShapeForm[] = ['process', 'decision', 'terminator', 'io', 'document', 'subprocess', 'junction', 'text']

/**
 * The palette, from tokens that already exist (D7). FILLS are the four sticky
 * tints — M187's restrained washes, made for authored objects — plus the glass
 * and nothing. The STATE hues (green/amber/red, and the accent as "running")
 * are deliberately NOT fills: in this app colour means state, and M393 paints a
 * shape's live state on its outline. A diagram coloured amber would read as
 * "needs you" from across the canvas.
 */
export type ShapeFill = 'plain' | 'none' | 'yellow' | 'blue' | 'green' | 'pink'
export type ShapeStroke = 'line' | 'ink' | 'iris' | 'violet' | 'none'
export type ShapeInk = 'fg' | 'muted'

export const SHAPE_FILLS: readonly ShapeFill[] = ['plain', 'none', 'yellow', 'blue', 'green', 'pink']
export const SHAPE_STROKES: readonly ShapeStroke[] = ['line', 'ink', 'iris', 'violet', 'none']
export const SHAPE_INKS: readonly ShapeInk[] = ['fg', 'muted']

/** The record. `fill`/`stroke`/`ink` absent mean the form's default — every shape ever minted until a person restyles it. */
export interface ShapeRecord {
  form: ShapeForm
  /** The label, multi-line. Empty is allowed: an unlabelled junction is the common case. */
  text: string
  fill?: ShapeFill
  stroke?: ShapeStroke
  ink?: ShapeInk
  /**
   * M394. The plan step this shape became when a person started work from its
   * chart — the work item and the step. A shape bound to a step shows the
   * step's state (the living flowchart). Absent on every shape until then.
   * Never travels (a portable file, a copy): the item is this machine's.
   */
  step?: { item: string; step: string }
}

/** A label is a label; a paragraph is a sticky or a file. */
export const SHAPE_MAX_CHARS = 500

/** World units. The size a shape is minted at, per form — a diagram's rhythm starts here. */
export const SHAPE_SIZE: Readonly<Record<ShapeForm, { w: number; h: number }>> = {
  process: { w: 160, h: 72 },
  decision: { w: 168, h: 104 },
  terminator: { w: 160, h: 60 },
  io: { w: 176, h: 72 },
  document: { w: 160, h: 84 },
  subprocess: { w: 176, h: 72 },
  junction: { w: 28, h: 28 },
  text: { w: 160, h: 44 }
}

/**
 * The form the NEXT step takes when a person pulls one off a shape (Tab,
 * ⌥+arrow, a port dropped on empty ground): a plain PROCESS step, whatever it
 * follows. Measured in the M388 smoke test — the step after a decision is not
 * another diamond, after a start it is not another start, and after an input or
 * a document it is the work done with it. A person changes the form in the
 * inspector when the next thing really is a question or an output.
 */
export function nextStepForm(_form: ShapeForm | null): ShapeForm {
  return 'process'
}

/** The floor a resize stops at. Far below MIN_PANEL_W/H (200x160) on purpose: that floor is a terminal's, and a junction is 28 wide. */
export const SHAPE_MIN = { w: 16, h: 16 }

/** Where a connector attaches: a side of the shape's box. Every form's outline touches the midpoint of each side, so the midpoint IS the port (flowchart-geometry.ts insets the io form's slanted sides). */
export type Port = 'n' | 'e' | 's' | 'w'
export const PORTS: readonly Port[] = ['n', 'e', 's', 'w']

export type Route = 'orthogonal' | 'straight' | 'curved'
export const ROUTES: readonly Route[] = ['orthogonal', 'straight', 'curved']

/** Which end(s) carry an arrowhead. Absent means `end` — an arrow points the way the diagram flows. */
export type Ends = 'end' | 'start' | 'both' | 'none'
export const ENDS: readonly Ends[] = ['end', 'start', 'both', 'none']

/**
 * A connector, held by its SOURCE panel (any kind — a terminal may hold one
 * that points at a shape). Every optional field absent is the common case and
 * means the default: auto ports, orthogonal, one arrowhead at the target.
 */
export interface Connector {
  /** Unique in the workspace. Minted by the canvas's one id counter (`cx<n>`). */
  id: string
  /** The panel this points at. A connector whose target does not survive a load is dropped, like a link. */
  to: string
  /** The source's port; absent = chosen from the geometry each render. */
  from?: Port
  /** The target's port; absent = chosen from the geometry each render. */
  toPort?: Port
  route?: Route
  ends?: Ends
  label?: string
  stroke?: ShapeStroke
  dashed?: true
}

/** A label on a line is a few words. */
export const CONNECTOR_LABEL_MAX = 120
/** Per source panel. A cap, so a malformed or hostile file cannot make a render loop of a million paths. */
export const CONNECTORS_MAX = 64

export function isShapeForm(value: unknown): value is ShapeForm {
  return typeof value === 'string' && (SHAPE_FORMS as readonly string[]).includes(value)
}
export function isShapeFill(value: unknown): value is ShapeFill {
  return typeof value === 'string' && (SHAPE_FILLS as readonly string[]).includes(value)
}
export function isShapeStroke(value: unknown): value is ShapeStroke {
  return typeof value === 'string' && (SHAPE_STROKES as readonly string[]).includes(value)
}
export function isShapeInk(value: unknown): value is ShapeInk {
  return typeof value === 'string' && (SHAPE_INKS as readonly string[]).includes(value)
}
export function isPort(value: unknown): value is Port {
  return typeof value === 'string' && (PORTS as readonly string[]).includes(value)
}
export function isRoute(value: unknown): value is Route {
  return typeof value === 'string' && (ROUTES as readonly string[]).includes(value)
}
export function isEnds(value: unknown): value is Ends {
  return typeof value === 'string' && (ENDS as readonly string[]).includes(value)
}

/** What each form is FOR, in one sentence — the palette's subtitle and the inspector's line. */
export function shapeFormSentence(form: ShapeForm): string {
  switch (form) {
    case 'process': return 'a step — something that is done'
    case 'decision': return 'a question with more than one way out'
    case 'terminator': return 'where the flow starts or ends'
    case 'io': return 'something that goes in or comes out'
    case 'document': return 'a document the flow reads or writes'
    case 'subprocess': return 'a step that is its own flow, defined elsewhere'
    case 'junction': return 'a point where lines meet or split'
    case 'text': return 'a label on the diagram, with no box'
  }
}

/** The form's word, as a person says it. */
export function shapeFormWord(form: ShapeForm): string {
  switch (form) {
    case 'process': return 'process'
    case 'decision': return 'decision'
    case 'terminator': return 'start / end'
    case 'io': return 'input / output'
    case 'document': return 'document'
    case 'subprocess': return 'subprocess'
    case 'junction': return 'junction'
    case 'text': return 'text'
  }
}

/**
 * The line a shape shows where a single line is all there is room for (the
 * rail, a search hit, the far tier). The first non-empty line; an empty shape
 * says what it is rather than showing nothing (the empty-state rule).
 */
export function shapeSummary(text: string, form: ShapeForm, max = 40): string {
  const first = text.split('\n').map((l) => l.trim()).find((l) => l !== '')
  if (first === undefined) return `an empty ${shapeFormWord(form)}`
  return first.length <= max ? first : `${first.slice(0, max - 1)}…`
}

/** A label as stored: capped, trailing whitespace off, never more than 8 lines. */
export function normaliseShapeText(text: string): string {
  return text.replace(/\s+$/, '').split('\n').slice(0, 8).join('\n').slice(0, SHAPE_MAX_CHARS)
}

/**
 * The shape record off disk. Absent/malformed per field, never per object
 * (docs/load-bearing.md:342): an unknown FORM costs the panel (there is
 * nothing to draw), a malformed text costs the text, a malformed style field
 * costs that field and warns.
 */
export function parseShapeRecord(raw: unknown, warnings: string[], where: string): ShapeRecord | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    warnings.push(`${where}: a shape panel with no shape record — dropped`)
    return null
  }
  const r = raw as Record<string, unknown>
  if (!isShapeForm(r.form)) {
    warnings.push(`${where}: a shape with an unknown form ${JSON.stringify(r.form)} — dropped`)
    return null
  }
  let text = ''
  if (r.text !== undefined) {
    if (typeof r.text === 'string') text = normaliseShapeText(r.text)
    else warnings.push(`${where}: a shape's text is not a string — kept the shape, dropped the text`)
  }
  const out: ShapeRecord = { form: r.form, text }
  if (r.fill !== undefined) { if (isShapeFill(r.fill)) out.fill = r.fill; else warnings.push(`${where}: unknown shape fill ${JSON.stringify(r.fill)} — dropped the field`) }
  if (r.stroke !== undefined) { if (isShapeStroke(r.stroke)) out.stroke = r.stroke; else warnings.push(`${where}: unknown shape stroke ${JSON.stringify(r.stroke)} — dropped the field`) }
  if (r.ink !== undefined) { if (isShapeInk(r.ink)) out.ink = r.ink; else warnings.push(`${where}: unknown shape ink ${JSON.stringify(r.ink)} — dropped the field`) }
  if (r.step !== undefined) {
    const st = r.step as Record<string, unknown> | null
    if (typeof st === 'object' && st !== null && typeof st.item === 'string' && st.item !== '' && typeof st.step === 'string' && st.step !== '') out.step = { item: st.item, step: st.step }
    else warnings.push(`${where}: a malformed plan-step binding — dropped the field`)
  }
  return out
}

/**
 * A panel's connectors off disk. `undefined` in → `undefined` out, silently
 * (every panel ever written). A non-array warns and is dropped; each entry is
 * judged alone; a self-connector and a duplicate id are dropped by name; the
 * list is capped. Dangling targets are pruned by the caller's second pass,
 * which knows which panels survived.
 */
export function parseConnectors(raw: unknown, warnings: string[], ownerId: string): Connector[] | undefined {
  if (raw === undefined) return undefined
  if (!Array.isArray(raw)) {
    warnings.push(`panel ${ownerId}: connectors is not a list — dropped`)
    return undefined
  }
  const out: Connector[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (out.length >= CONNECTORS_MAX) {
      warnings.push(`panel ${ownerId}: more than ${CONNECTORS_MAX} connectors — the rest dropped`)
      break
    }
    if (typeof item !== 'object' || item === null || Array.isArray(item)) { warnings.push(`panel ${ownerId}: a connector that is not a record — dropped`); continue }
    const c = item as Record<string, unknown>
    if (typeof c.id !== 'string' || c.id === '' || typeof c.to !== 'string' || c.to === '') { warnings.push(`panel ${ownerId}: a connector with no id or no target — dropped`); continue }
    if (c.to === ownerId) { warnings.push(`panel ${ownerId}: a connector to itself — dropped`); continue }
    if (seen.has(c.id)) { warnings.push(`panel ${ownerId}: a second connector ${c.id} — dropped`); continue }
    seen.add(c.id)
    const conn: Connector = { id: c.id, to: c.to }
    const field = (name: string, ok: boolean, apply: () => void): void => {
      if (c[name] === undefined) return
      if (ok) apply(); else warnings.push(`panel ${ownerId}: connector ${c.id} has a malformed ${name} — dropped the field`)
    }
    field('from', isPort(c.from), () => { conn.from = c.from as Port })
    field('toPort', isPort(c.toPort), () => { conn.toPort = c.toPort as Port })
    field('route', isRoute(c.route), () => { conn.route = c.route as Route })
    field('ends', isEnds(c.ends), () => { conn.ends = c.ends as Ends })
    field('label', typeof c.label === 'string', () => { const l = (c.label as string).trim().slice(0, CONNECTOR_LABEL_MAX); if (l !== '') conn.label = l })
    field('stroke', isShapeStroke(c.stroke), () => { conn.stroke = c.stroke as ShapeStroke })
    field('dashed', c.dashed === true, () => { conn.dashed = true })
    out.push(conn)
  }
  return out
}

// ── The graph view: what layout, Mermaid and SVG speak ─────────────────────
// Independent of Panel on purpose: the pure modules (flowchart-layout,
// flowchart-mermaid, flowchart-geometry) never import the renderer, and the
// canvas converts shapes + connectors to this shape and back.

export type FlowDirection = 'TB' | 'BT' | 'LR' | 'RL'

export interface FlowNode {
  id: string
  form: ShapeForm
  text: string
  /** World units; the layout reads them, Mermaid import fills them from SHAPE_SIZE. */
  w: number
  h: number
}

export interface FlowEdge {
  from: string
  to: string
  label?: string
  ends?: Ends
  dashed?: boolean
  route?: Route
}

export interface FlowGroup {
  id: string
  label: string
  nodes: string[]
}

export interface FlowGraph {
  direction: FlowDirection
  nodes: FlowNode[]
  edges: FlowEdge[]
  /** Mermaid subgraphs. The canvas lands each as a group (D5); nesting is flattened to its innermost. */
  groups?: FlowGroup[]
}
