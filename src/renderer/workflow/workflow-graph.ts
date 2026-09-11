import type { PersistedTemplate, TemplateEdge, TemplateNode } from '@shared/templates'
import type { PersistedRun } from '@shared/runs'
import { BLOCK_H, BLOCK_W } from './workflow-diagram'

/**
 * M259. The workflow editor's READING of a graph — everything the diagram
 * needs beyond `buildDiagram`'s geometry: which blocks a selection depends on
 * and feeds, what is incomplete, the arrangement Auto layout commits, the
 * curve an edge is drawn on, and a run mapped back onto its blocks.
 *
 * Pure like its sibling: no DOM, no React, bundled into `verify:layout`
 * (`wfx.*`). Auto layout is here rather than in `dagre` for the reason
 * `workflow-diagram.ts` records — the record carries AUTHORED offsets, so a
 * layout is a proposal the person commits as moves, not a second truth; and a
 * longest-path ranking over an acyclic graph (`edgeWouldCycle` keeps it one)
 * is thirty lines, not a dependency.
 */

type Edge = Pick<TemplateEdge, 'from' | 'to'>

const edgeKey = (e: Edge): string => `${e.from}>${e.to}`

/**
 * Everything upstream of `key` (what must finish before it) and downstream
 * (what it feeds), plus the edges ON those paths — never an edge between two
 * lit blocks that belongs to a third path, so the highlight says "this
 * block's lineage", not "every block that happens to be near it".
 */
export function neighbourhood(edges: readonly Edge[], key: string): { up: string[]; down: string[]; edges: string[] } {
  const walk = (from: string, next: (e: Edge) => string | null): string[] => {
    const seen = new Set<string>([from]); const order: string[] = []; const queue = [from]
    while (queue.length > 0) {
      const at = queue.shift() as string
      for (const e of edges) {
        const n = next(e) === at ? (next === up ? e.from : e.to) : null
        if (n !== null && !seen.has(n)) { seen.add(n); order.push(n); queue.push(n) }
      }
    }
    return order
  }
  const up = (e: Edge): string => e.to
  const down = (e: Edge): string => e.from
  const ups = walk(key, up), downs = walk(key, down)
  const upSet = new Set([...ups, key]), downSet = new Set([...downs, key])
  const lit = edges.filter((e) => (upSet.has(e.from) && upSet.has(e.to) && ups.includes(e.from)) || (downSet.has(e.from) && downSet.has(e.to) && downs.includes(e.to)))
  return { up: ups, down: downs, edges: lit.map(edgeKey) }
}

/** The field a kind cannot run without, in the inspector's own words (`NODE_FIELD_LABELS`). */
const REQUIRED: Partial<Record<TemplateNode['kind'], ReadonlyArray<readonly [string, string]>>> = {
  pool: [['list', 'list file'], ['prompt', 'prompt']],
  orchestrator: [['prompt', 'prompt']],
  collect: [['target', 'target']],
  action: [['line', 'verb line']],
  http: [['url', 'address']]
}

/**
 * What is incomplete on the graph, per block key — the sentences the diagram
 * draws ON the block rather than in a banner above it. A block with nothing
 * wrong is ABSENT from the map (never an empty list), so a caller's
 * `issues[key] === undefined` is the whole test.
 *
 * Only facts the record states: an empty field a kind needs, a fetch whose
 * method is not GET (the one write rule the runner refuses by name), a block
 * with no edge at all in a graph of more than one, and a collect nothing hands
 * off to. Whether a trigger suits its source is NOT guessed here — that is the
 * runner's to say, and a wrong warning is worse than none.
 */
export function diagramIssues(t: Pick<PersistedTemplate, 'nodes' | 'edges'>): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  const add = (key: string, s: string): void => { (out[key] ??= []).push(s) }
  for (const node of t.nodes) {
    const raw = node as unknown as Record<string, unknown>
    for (const [field, label] of REQUIRED[node.kind] ?? []) {
      const v = raw[field]
      if (v === undefined || (typeof v === 'string' && v.trim() === '')) add(node.key, `no ${label} yet`)
    }
    if (node.kind === 'http' && typeof raw.method === 'string' && raw.method.trim() !== '' && raw.method.trim().toUpperCase() !== 'GET') {
      add(node.key, `only GET runs — a ${raw.method.trim().toUpperCase()} is refused`)
    }
    const touches = t.edges.some((e) => e.from === node.key || e.to === node.key)
    if (t.nodes.length > 1 && !touches) add(node.key, 'not connected to anything')
    else if (node.kind === 'collect' && !t.edges.some((e) => e.to === node.key)) add(node.key, 'collects nothing — no block hands off to it')
  }
  return out
}

/** Auto layout's spacing: one block plus a gutter wide enough for an edge's label. */
export const LAYOUT_GAP_X = BLOCK_W + 96
export const LAYOUT_GAP_Y = BLOCK_H + 48

/**
 * Longest-path rank per key over an acyclic edge set — a block sits one rank
 * past the LAST of its inputs. A block no edge reaches is rank 0. The pass
 * count is capped at the node count, so a malformed cyclic record (one the
 * parser should never admit) ends instead of spinning.
 */
function ranksOf(keys: readonly string[], edges: readonly Edge[]): Map<string, number> {
  const rank = new Map(keys.map((k) => [k, 0]))
  for (let pass = 0; pass < keys.length; pass++) {
    let moved = false
    for (const e of edges) {
      const r = (rank.get(e.from) ?? 0) + 1
      if (rank.has(e.to) && r > (rank.get(e.to) as number)) { rank.set(e.to, r); moved = true }
    }
    if (!moved) break
  }
  return rank
}

/**
 * The arrangement Auto layout proposes: one `{key, dx, dy}` per node, ranks
 * stepping right (horizontal) or down (vertical), each rank centred on the
 * others and ordered by the mean position of its inputs so edges cross as
 * little as a single sweep can manage. The caller commits it as ONE draft
 * operation — a layout is one undo, never one per block.
 */
export function autoLayout(t: Pick<PersistedTemplate, 'nodes' | 'edges'>, direction: 'horizontal' | 'vertical'): Array<{ key: string; dx: number; dy: number }> {
  const keys = t.nodes.map((n) => n.key)
  const rank = ranksOf(keys, t.edges)
  const layers: string[][] = []
  for (const k of keys) (layers[rank.get(k) as number] ??= []).push(k)
  // `across` is a position in SLOTS perpendicular to the ranks. Rank 0 stacks
  // in record order; every later block asks for the mean slot of its inputs,
  // so a chain draws as a straight line, and a sweep then pushes any block
  // that would overlap its neighbour one slot on.
  const across = new Map<string, number>()
  layers.forEach((layer, r) => {
    if (layer === undefined) return
    if (r === 0) { layer.forEach((k, i) => across.set(k, i)); return }
    const want = (k: string): number => {
      const ins = t.edges.filter((e) => e.to === k).map((e) => across.get(e.from)).filter((s): s is number => s !== undefined)
      return ins.length === 0 ? Number.POSITIVE_INFINITY : ins.reduce((a, b) => a + b, 0) / ins.length
    }
    // A stable sort: record order breaks every tie, so the same graph always lays out the same way.
    const wanted = layer.map((k) => ({ k, w: want(k) })).sort((a, b) => a.w - b.w)
    let floor = Number.NEGATIVE_INFINITY
    for (const { k, w } of wanted) {
      const at = Math.max(Number.isFinite(w) ? Math.round(w) : floor + 1, floor + 1, 0)
      across.set(k, at); floor = at
    }
  })
  const out: Array<{ key: string; dx: number; dy: number }> = []
  layers.forEach((layer, r) => {
    layer?.forEach((k) => {
      const a = across.get(k) as number
      out.push(direction === 'horizontal'
        ? { key: k, dx: r * LAYOUT_GAP_X, dy: a * LAYOUT_GAP_Y }
        : { key: k, dx: a * LAYOUT_GAP_X, dy: r * LAYOUT_GAP_Y })
    })
  })
  // Record order out, so a check (and a diff of the saved record) reads naturally.
  return keys.map((k) => out.find((o) => o.key === k) as { key: string; dx: number; dy: number })
}

export interface Box { x: number; y: number; w: number; h: number }

/**
 * An edge's curve: out of the border that FACES its target and into the one
 * facing back — sideways when the target sits more beside than below, top
 * and bottom otherwise — as one cubic whose handles run straight out of each
 * border, so the arrowhead (a marker oriented on the path's end tangent)
 * always points into the block. `mx`/`my` is the curve's own midpoint
 * (the cubic at t = ½), which is where the trigger label sits: on the line it
 * names, never floating between two.
 */
export function edgeGeometry(from: Box, to: Box): { d: string; x1: number; y1: number; x2: number; y2: number; mx: number; my: number } {
  const fcx = from.x + from.w / 2, fcy = from.y + from.h / 2
  const tcx = to.x + to.w / 2, tcy = to.y + to.h / 2
  const sideways = Math.abs(tcx - fcx) >= Math.abs(tcy - fcy) * (from.w / from.h) * 0.5
  let x1: number, y1: number, x2: number, y2: number, c1x: number, c1y: number, c2x: number, c2y: number
  if (sideways) {
    const dir = tcx >= fcx ? 1 : -1
    x1 = dir > 0 ? from.x + from.w : from.x; y1 = fcy
    x2 = dir > 0 ? to.x : to.x + to.w; y2 = tcy
    const k = Math.max(40, Math.abs(x2 - x1) / 2)
    c1x = x1 + dir * k; c1y = y1; c2x = x2 - dir * k; c2y = y2
  } else {
    const dir = tcy >= fcy ? 1 : -1
    x1 = fcx; y1 = dir > 0 ? from.y + from.h : from.y
    x2 = tcx; y2 = dir > 0 ? to.y : to.y + to.h
    const k = Math.max(32, Math.abs(y2 - y1) / 2)
    c1x = x1; c1y = y1 + dir * k; c2x = x2; c2y = y2 - dir * k
  }
  const mx = (x1 + 3 * c1x + 3 * c2x + x2) / 8
  const my = (y1 + 3 * c1y + 3 * c2y + y2) / 8
  return { d: `M ${x1} ${y1} C ${c1x} ${c1y} ${c2x} ${c2y} ${x2} ${y2}`, x1, y1, x2, y2, mx, my }
}

export interface TimelineRow {
  key: string
  panelId: string
  /** Milliseconds after the run started. */
  offset: number
  /** Milliseconds it ran; absent while it is still open. */
  span?: number
  outcome?: string
}

/**
 * A run's entries read BACK onto the graph: one row per block that started,
 * in start order, through the run's own `mapping` (node key → minted panel).
 * An entry the mapping does not name is a panel the shape never held and is
 * dropped rather than guessed onto a block; a run with no mapping (every
 * pre-M184 run) has no timeline to draw, which the caller says in words.
 */
export function runTimeline(run: Pick<PersistedRun, 'startedAt' | 'entries' | 'mapping'>): TimelineRow[] {
  if (run.mapping === undefined) return []
  const keyOf = new Map(Object.entries(run.mapping).map(([k, p]) => [p, k]))
  return run.entries
    .map((e, i) => ({ e, i, key: keyOf.get(e.panelId) }))
    .filter((r): r is { e: PersistedRun['entries'][number]; i: number; key: string } => r.key !== undefined)
    .sort((a, b) => a.e.startedAt - b.e.startedAt || a.i - b.i)
    .map(({ e, key }) => ({
      key, panelId: e.panelId, offset: Math.max(0, e.startedAt - run.startedAt),
      ...(e.endedAt === undefined ? {} : { span: Math.max(0, e.endedAt - e.startedAt) }),
      ...(e.outcome === undefined ? {} : { outcome: e.outcome })
    }))
}

/**
 * The traveling highlight's route: the edges whose BOTH ends completed, each
 * with the step it lights at — its source's rank within the completed
 * subgraph — so one highlight walks the finished path from its first block
 * to its last and then leaves only the quiet checks behind.
 */
export function completedWalk(edges: readonly Edge[], done: ReadonlySet<string>): Array<{ edge: string; step: number }> {
  const walked = edges.filter((e) => done.has(e.from) && done.has(e.to))
  const rank = ranksOf([...done], walked)
  return walked
    .map((e, i) => ({ edge: edgeKey(e), step: rank.get(e.from) ?? 0, i }))
    .sort((a, b) => a.step - b.step || a.i - b.i)
    .map(({ edge, step }) => ({ edge, step }))
}
