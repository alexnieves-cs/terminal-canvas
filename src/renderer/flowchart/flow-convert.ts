import { CONNECTORS_MAX, SHAPE_SIZE, type Connector, type FlowDirection, type FlowEdge, type FlowGraph, type FlowNode, type ShapeForm } from '@shared/flowchart'
import { layoutFlow } from '@shared/flowchart-layout'
import type { FlowchartSvgModel } from '@shared/flowchart-svg'
import { isShapePanel, type Panel, type ShapePanel } from '@renderer/panels/panels'
import { PLAN_STEPS_MAX, type PlanStep, type TaskPlan } from '@shared/task-plan'

/**
 * M391. Canvas ⇄ graph: the one place the canvas's records meet the pure
 * graph the layout, Mermaid and the SVG speak (shared/flowchart.ts's
 * FlowGraph). Pure — plain-node checked in verify:flowchart's `convert` area.
 */

interface Box { x: number; y: number; w: number; h: number }

/**
 * A parsed graph as canvas records: shapes laid out (layered, in the graph's
 * own direction) with their top-left at `origin`, connectors held by each
 * edge's source, and the graph's subgraphs as groups by member id. Ids are
 * minted by the caller's counter (`sh`, `cx` — the canvas's own prefixes).
 * NOTHING here can act: a shape is a label and a form (the import-inertness
 * rule holds by construction — there is no field to carry a callback into).
 */
export function graphToPanels(graph: FlowGraph, mint: () => number, origin: { x: number; y: number }, zBase: number): { panels: ShapePanel[]; groups: { label: string; ids: string[] }[]; width: number; height: number; dropped: number } {
  const rename = new Map<string, string>()
  for (const n of graph.nodes) rename.set(n.id, `sh${mint()}`)
  // Each edge in the direction it is DRAWN: a 'start'-ended edge is the edge
  // reversed with an end arrow (serializeMermaid's own normalisation), and the
  // layout ranks by the drawn direction so the arrow never points against it.
  const drawn = graph.edges
    .map((e) => (e.ends === 'start' ? { ...e, from: e.to, to: e.from, ends: 'end' as const } : e))
    .filter((e) => rename.has(e.from) && rename.has(e.to) && e.from !== e.to)
  const laid = layoutFlow({ nodes: graph.nodes.map((n) => ({ id: n.id, w: n.w, h: n.h })), edges: drawn.map((e) => ({ from: e.from, to: e.to })) }, graph.direction)
  const held = new Map<string, Connector[]>()
  const hold = (id: string, c: Connector): boolean => {
    const list = held.get(id) ?? []
    if (list.length >= CONNECTORS_MAX) return false
    list.push(c)
    held.set(id, list)
    return true
  }
  let dropped = 0
  for (const e of drawn) {
    const src = rename.get(e.from) as string
    const dst = rename.get(e.to) as string
    const style = {
      ...(e.label === undefined || e.label === '' ? {} : { label: e.label }),
      ...(e.dashed === true ? { dashed: true as const } : {}),
      ...(e.route === undefined || e.route === 'orthogonal' ? {} : { route: e.route })
    }
    // A source already holding CONNECTORS_MAX lines (a hub) hands the line to
    // its TARGET, drawn the same way — the arrowhead at the holder's end
    // (`start`) instead of the far end. Only a line neither end can hold is
    // dropped, and the import says how many.
    if (hold(src, { id: `cx${mint()}`, to: dst, ...(e.ends === 'none' || e.ends === 'both' ? { ends: e.ends } : {}), ...style })) continue
    const flipped = e.ends === 'none' || e.ends === 'both' ? { ends: e.ends } : { ends: 'start' as const }
    if (!hold(dst, { id: `cx${mint()}`, to: src, ...flipped, ...style })) dropped++
  }
  const panels: ShapePanel[] = graph.nodes.map((n, i) => {
    const id = rename.get(n.id) as string
    const at = laid.positions.get(n.id) ?? { x: 0, y: 0 }
    const out = held.get(id)
    return {
      kind: 'shape',
      rect: { id, x: origin.x + at.x, y: origin.y + at.y, w: n.w, h: n.h },
      z: zBase + i,
      shape: { form: n.form, text: n.text },
      ...(out === undefined ? {} : { connectors: out })
    }
  })
  const groups = (graph.groups ?? [])
    .map((g) => ({ label: g.label, ids: g.nodes.map((n) => rename.get(n)).filter((x): x is string => x !== undefined) }))
    .filter((g) => g.ids.length > 0)
  return { panels, groups, width: laid.width, height: laid.height, dropped }
}

/**
 * The shapes among `ids` (every shape when `ids` is empty) as a graph:
 * connectors between two of them become edges; a connector to something
 * that is not a shape (a terminal, a note) is left out — Mermaid has no
 * word for a live object — and counted, so the export can say so.
 */
export function panelsToGraph(panels: readonly Panel[], ids: ReadonlySet<string>): { graph: FlowGraph; leftOut: number } {
  const shapes = panels.filter((p): p is ShapePanel => isShapePanel(p) && (ids.size === 0 || ids.has(p.rect.id)))
  const inSet = new Set(shapes.map((s) => s.rect.id))
  // Reading order: top to bottom, then left to right — the order a person
  // reads the chart, and so the order the Mermaid lists it.
  const ordered = [...shapes].sort((a, b) => (a.rect.y - b.rect.y) || (a.rect.x - b.rect.x))
  const nodes: FlowNode[] = ordered.map((s) => ({ id: s.rect.id, form: s.shape.form, text: s.shape.text, w: s.rect.w, h: s.rect.h }))
  const edges: FlowEdge[] = []
  let leftOut = 0
  for (const p of panels) {
    for (const c of p.connectors ?? []) {
      const touches = inSet.has(p.rect.id) || inSet.has(c.to)
      if (!touches) continue
      if (!inSet.has(p.rect.id) || !inSet.has(c.to)) { leftOut++; continue }
      edges.push({
        from: p.rect.id, to: c.to,
        ...(c.label === undefined ? {} : { label: c.label }),
        ends: c.ends ?? 'end',
        ...(c.dashed === true ? { dashed: true } : {}),
        ...(c.route === undefined ? {} : { route: c.route })
      })
    }
  }
  return { graph: { direction: flowDirectionOf(ordered, edges), nodes, edges, groups: [] }, leftOut }
}

/** The way a drawn chart flows: the dominant sign and axis of its edges' centre deltas. Down when there are none. */
export function flowDirectionOf(shapes: readonly ShapePanel[], edges: readonly FlowEdge[]): FlowDirection {
  const c = new Map(shapes.map((s) => [s.rect.id, { x: s.rect.x + s.rect.w / 2, y: s.rect.y + s.rect.h / 2 }]))
  let dx = 0
  let dy = 0
  for (const e of edges) {
    const a = c.get(e.from)
    const b = c.get(e.to)
    if (a === undefined || b === undefined) continue
    dx += b.x - a.x
    dy += b.y - a.y
  }
  if (dx === 0 && dy === 0) return 'TB'
  if (Math.abs(dy) >= Math.abs(dx)) return dy >= 0 ? 'TB' : 'BT'
  return dx >= 0 ? 'LR' : 'RL'
}

/** The SVG model of the shapes among `ids` (all when empty), with every connector touching them and the live objects those reach. */
export function svgModelOf(panels: readonly Panel[], ids: ReadonlySet<string>, nameOf: (p: Panel) => string): FlowchartSvgModel {
  const shapes = panels.filter((p): p is ShapePanel => isShapePanel(p) && (ids.size === 0 || ids.has(p.rect.id)))
  const inSet = new Set(shapes.map((s) => s.rect.id))
  const byId = new Map(panels.map((p) => [p.rect.id, p]))
  const box = (p: Panel): Box => ({ x: p.rect.x, y: p.rect.y, w: p.rect.w, h: p.rect.h })
  const formOf = (p: Panel): ShapeForm | null => (isShapePanel(p) ? p.shape.form : null)
  const obstacles = shapes.filter((s) => s.shape.form !== 'text')
  const live = new Map<string, Panel>()
  const connectors: FlowchartSvgModel['connectors'] = []
  for (const p of panels) {
    for (const c of p.connectors ?? []) {
      if (!inSet.has(p.rect.id) && !inSet.has(c.to)) continue
      const t = byId.get(c.to)
      if (t === undefined) continue
      if (!isShapePanel(p)) live.set(p.rect.id, p)
      if (!isShapePanel(t)) live.set(t.rect.id, t)
      connectors.push({ fromBox: box(p), fromForm: formOf(p), toBox: box(t), toForm: formOf(t), connector: c, obstacles: obstacles.filter((o) => o.rect.id !== p.rect.id && o.rect.id !== t.rect.id).map(box) })
    }
  }
  return {
    shapes: shapes.map((s) => ({ id: s.rect.id, box: box(s), shape: s.shape })),
    connectors,
    panels: [...live.values()].map((p) => ({ box: box(p), title: nameOf(p) }))
  }
}

/** Mint sizes for a graph whose nodes came without them (a hand-built graph) — Mermaid import fills them already. */
export function withMintSizes(graph: FlowGraph): FlowGraph {
  return { ...graph, nodes: graph.nodes.map((n) => (n.w > 0 && n.h > 0 ? n : { ...n, w: SHAPE_SIZE[n.form].w, h: SHAPE_SIZE[n.form].h })) }
}

// ── M394. Sketch → plan ─────────────────────────────────────────────────────

/**
 * A drawn chart as a TASK PLAN (shared/task-plan.ts): each PROCESS-like shape
 * (process, subprocess, input/output, document) becomes an agent step, each
 * DECISION a review step — a question a person answers — in the order the
 * connectors say, each depending on the nearest steps before it (a start/end,
 * a junction or a label passes its dependencies through). Nothing here runs
 * anything: the plan is handed to the Start work sheet, a person presses
 * Start, and every step is then started by that person (M327's rule — a plan
 * starts nothing). Over PLAN_STEPS_MAX steps is refused by name.
 */
export type ChartPlan =
  | { kind: 'ok'; title: string; brief: string; plan: TaskPlan; stepOf: Map<string, string> }
  | { kind: 'refused'; reason: string }

export function chartToPlan(panels: readonly Panel[], scope: ReadonlySet<string>, now: number): ChartPlan {
  const shapes = panels.filter((p): p is ShapePanel => isShapePanel(p) && scope.has(p.rect.id))
  if (shapes.length === 0) return { kind: 'refused', reason: 'select a shape in a chart first' }
  const inSet = new Set(shapes.map((s) => s.rect.id))
  const preds = new Map<string, string[]>()
  const succs = new Map<string, string[]>()
  for (const p of shapes) {
    for (const c of p.connectors ?? []) {
      if (!inSet.has(c.to)) continue
      preds.set(c.to, [...(preds.get(c.to) ?? []), p.rect.id])
      succs.set(p.rect.id, [...(succs.get(p.rect.id) ?? []), c.to])
    }
  }
  const isStep = (s: ShapePanel): boolean => s.shape.text.trim() !== '' && (s.shape.form === 'process' || s.shape.form === 'subprocess' || s.shape.form === 'io' || s.shape.form === 'document' || s.shape.form === 'decision')
  // Order: a topological walk from the sources, ties by reading order (top to
  // bottom, left to right) — the order a person reads the chart. A cycle
  // (a loop back to retry) is broken where the walk meets it.
  const reading = [...shapes].sort((a, b) => (a.rect.y - b.rect.y) || (a.rect.x - b.rect.x))
  const indeg = new Map(shapes.map((s) => [s.rect.id, (preds.get(s.rect.id) ?? []).length]))
  const order: ShapePanel[] = []
  const placed = new Set<string>()
  while (order.length < shapes.length) {
    let next = reading.find((s) => !placed.has(s.rect.id) && (indeg.get(s.rect.id) ?? 0) === 0)
    if (next === undefined) next = reading.find((s) => !placed.has(s.rect.id)) as ShapePanel
    placed.add(next.rect.id)
    order.push(next)
    for (const t of succs.get(next.rect.id) ?? []) indeg.set(t, (indeg.get(t) ?? 1) - 1)
  }
  const steps = order.filter(isStep)
  if (steps.length === 0) return { kind: 'refused', reason: 'the chart has no labelled step — a process or a decision with words in it becomes a step' }
  if (steps.length > PLAN_STEPS_MAX) return { kind: 'refused', reason: `a plan holds ${PLAN_STEPS_MAX} steps and this chart has ${steps.length} — select a part of it` }
  const stepOf = new Map(steps.map((s, i) => [s.rect.id, `s${i + 1}`]))
  // The nearest STEP ancestors of a shape, walking back through the shapes
  // that are not steps (a start, a junction) — with a guard against loops.
  const stepAncestors = (id: string): string[] => {
    const out = new Set<string>()
    const seen = new Set<string>([id])
    const queue = [...(preds.get(id) ?? [])]
    while (queue.length > 0) {
      const cur = queue.shift() as string
      if (seen.has(cur)) continue
      seen.add(cur)
      const sid = stepOf.get(cur)
      if (sid !== undefined) { out.add(sid); continue }
      queue.push(...(preds.get(cur) ?? []))
    }
    return [...out]
  }
  const position = new Map(steps.map((s, i) => [s.rect.id, i]))
  const shapeOfStep = new Map([...stepOf].map(([shape, step]) => [step, shape]))
  const plan: TaskPlan = {
    createdAt: now,
    steps: steps.map((s) => {
      const label = s.shape.text.split('\n').map((l) => l.trim()).filter(Boolean).join(' ')
      // A dependency that comes LATER in the order is a loop back (a retry
      // arrow): it is left off, or every step in the loop would wait forever.
      const deps = stepAncestors(s.rect.id).filter((d) => (position.get(shapeOfStep.get(d) ?? '') ?? 0) < (position.get(s.rect.id) ?? 0))
      const review = s.shape.form === 'decision'
      return {
        id: stepOf.get(s.rect.id) as string,
        title: label,
        kind: review ? 'review' : 'agent',
        role: review ? 'you' : 'agent',
        dependsOn: deps,
        expected: review ? `An answer to “${label}” — decided by a person.` : `“${label}” done, with a plain account of what changed.`
      } as PlanStep
    })
  }
  const start = order.find((s) => s.shape.form === 'terminator' && s.shape.text.trim() !== '' && (preds.get(s.rect.id) ?? []).length === 0)
  const title = (start !== undefined ? `${start.shape.text.split('\n')[0].trim()} — ${steps[0].shape.text.split('\n')[0].trim()}` : steps[0].shape.text.split('\n')[0].trim()).slice(0, 120)
  const brief = ['Work drawn as a chart on the canvas. The steps, in order:', ...plan.steps.map((st, i) => `${i + 1}. ${st.kind === 'review' ? 'Decide: ' : ''}${st.title}`)].join('\n')
  return { kind: 'ok', title, brief, plan, stepOf }
}
