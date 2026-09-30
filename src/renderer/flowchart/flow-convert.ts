import { SHAPE_SIZE, type Connector, type FlowDirection, type FlowEdge, type FlowGraph, type FlowNode, type ShapeForm } from '@shared/flowchart'
import { layoutFlow } from '@shared/flowchart-layout'
import type { FlowchartSvgModel } from '@shared/flowchart-svg'
import { isShapePanel, type Panel, type ShapePanel } from '@renderer/panels/panels'

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
export function graphToPanels(graph: FlowGraph, mint: () => number, origin: { x: number; y: number }, zBase: number): { panels: ShapePanel[]; groups: { label: string; ids: string[] }[]; width: number; height: number } {
  const rename = new Map<string, string>()
  for (const n of graph.nodes) rename.set(n.id, `sh${mint()}`)
  const laid = layoutFlow({ nodes: graph.nodes.map((n) => ({ id: n.id, w: n.w, h: n.h })), edges: graph.edges.map((e) => ({ from: e.from, to: e.to })) }, graph.direction)
  const outgoing = new Map<string, Connector[]>()
  for (const e of graph.edges) {
    const from = rename.get(e.from)
    const to = rename.get(e.to)
    if (from === undefined || to === undefined || from === to) continue
    // 'start' ends are drawn as the edge reversed with an end arrow — the
    // same normalisation serializeMermaid makes, so a round trip is stable.
    const [src, dst] = e.ends === 'start' ? [to, from] : [from, to]
    const c: Connector = {
      id: `cx${mint()}`,
      to: dst,
      ...(e.ends === 'none' || e.ends === 'both' ? { ends: e.ends } : {}),
      ...(e.label === undefined || e.label === '' ? {} : { label: e.label }),
      ...(e.dashed === true ? { dashed: true as const } : {}),
      ...(e.route === undefined || e.route === 'orthogonal' ? {} : { route: e.route })
    }
    const list = outgoing.get(src) ?? []
    list.push(c)
    outgoing.set(src, list)
  }
  const panels: ShapePanel[] = graph.nodes.map((n, i) => {
    const id = rename.get(n.id) as string
    const at = laid.positions.get(n.id) ?? { x: 0, y: 0 }
    const out = outgoing.get(id)
    return {
      kind: 'shape',
      rect: { id, x: origin.x + at.x, y: origin.y + at.y, w: n.w, h: n.h },
      z: zBase + i,
      shape: { form: n.form, text: n.text },
      ...(out === undefined ? {} : { connectors: out.slice(0, 64) })
    }
  })
  const groups = (graph.groups ?? [])
    .map((g) => ({ label: g.label, ids: g.nodes.map((n) => rename.get(n)).filter((x): x is string => x !== undefined) }))
    .filter((g) => g.ids.length > 0)
  return { panels, groups, width: laid.width, height: laid.height }
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
