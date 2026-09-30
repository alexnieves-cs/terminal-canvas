/**
 * M391. THE FLOWCHART'S AUTO-LAYOUT — a layered (Sugiyama-style) arrangement of
 * up to a few hundred nodes of VARIABLE size, in four directions.
 *
 * Why this is its own module and not `workflow-graph.ts`'s `autoLayout`: that
 * one is acyclic and fixed-size (a workflow is a DAG of same-sized blocks); a
 * flowchart has loops ("retry" arrows point back up) and shapes of every size
 * (a 28-wide junction beside a 176-wide input). Neither dagre nor elk is used
 * — `workflow-diagram.ts:13-15` records dagre was declined, and a layout that
 * has to be predictable to a person who drags a node and re-runs it is worth
 * more than a cleverer one. The stages are the classic four, each cheap:
 *
 *   1. cycle breaking — a DFS from the sources; the edges it finds pointing back
 *      up its own stack are reversed FOR RANKING ONLY (they are still drawn the
 *      way the person drew them; `reversed` says how many were flipped);
 *   2. layering — longest path from the sources, then sources and forks pulled
 *      DOWN toward their successors so an edge is not stretched for nothing;
 *   3. ordering — a long edge gets a dummy in every rank it crosses, so it takes
 *      part in crossing counts and in spacing; barycenter sweeps + adjacent
 *      transpositions, keeping the best order seen;
 *   4. coordinates — the cross axis solved layer by layer as a weighted
 *      least-squares problem (exact per layer by pool-adjacent-violators), then
 *      reweighted toward the median, so widths are respected, long edges run
 *      straight and a parent lines up with a child instead of floating between.
 *
 * The layout is computed once, in an abstract space whose axes are RANK and
 * CROSS, and only then mapped to x/y for the direction. Mapping the positions
 * after the fact (swap x and y) would be wrong twice over: a node is `w` wide
 * ALONG the rank axis in LR but `h` deep, and BT/RL must mirror the ranks
 * without mirroring the cross order. Every property that fails silently here is
 * pinned in scripts/flowchart-checks/layout.cjs: a layout that overlaps two
 * nodes still returns positions.
 *
 * Pure: no DOM, no node, no dependency. Deterministic: no Math.random, every
 * tie broken by input order.
 */

import type { FlowDirection } from './flowchart'

export interface LayoutInput {
  nodes: Array<{ id: string; w: number; h: number }>
  edges: Array<{ from: string; to: string }>
}

export interface LayoutOptions {
  /** Empty space between one rank and the next, along the flow. Default 64. */
  rankGap?: number
  /** Empty space between neighbours in one rank, across the flow. Default 40. */
  nodeGap?: number
  /** Empty space between two disconnected pieces, laid side by side across the flow. Default 96. */
  componentGap?: number
}

export interface LayoutPoint { x: number; y: number }

/**
 * Where a LONG edge (one spanning more than one rank) passes through the ranks
 * it skips — the dummy nodes' centres, in `from` → `to` order. A connector
 * routed through these does not run through the shapes in between; one drawn as
 * a straight line from centre to centre may, and there is nothing a node layout
 * can do about that (the chain A→B→C→D beside A→D is collinear by design). Only
 * edges that skip a rank appear.
 */
export interface LayoutWaypoints { from: string; to: string; via: LayoutPoint[] }

export interface LayoutResult {
  /** The TOP-LEFT of each node, relative to (0,0) = the layout's top-left. Every node in the input, isolated or not. */
  positions: Map<string, LayoutPoint>
  /** The bounding box of the nodes. */
  width: number
  height: number
  /** How many edges were flipped to break cycles. */
  reversed: number
  waypoints: LayoutWaypoints[]
}

export const LAYOUT_DEFAULTS = { rankGap: 64, nodeGap: 40, componentGap: 96 } as const

// ── Tuning. Every number here trades quality for time on a few hundred nodes; the timing checks (200 nodes < 60 ms, 500 < 300 ms) are what bound them.
/** Ordering sweeps: never fewer than this (a single sweep is a local minimum's opinion), never more than MAX, and stop after PATIENCE sweeps that did not beat the best. */
const MIN_SWEEPS = 8
const MAX_SWEEPS = 40
const PATIENCE = 8
/** A dummy needs less room than a shape (a line, not a box): half the node gap between it and anything else. */
const DUMMY_GAP = 0.5
/** Gansner's edge weights, so a long edge runs straighter than a short one: real-real 1, real-dummy 2, dummy-dummy 8. */
const W_REAL = 1
const W_MIXED = 2
const W_DUMMY = 8
/** Coordinate refinement: passes over the layers, and the largest movement (world units) below which we call it settled. */
const MAX_PASSES = 24
const SETTLED = 0.05
/** Then the L1 refinement: the slack floor (world units) starts wide — nearly least squares — and tightens to L1_END over L1_PASSES passes. */
const L1_START = 48
const L1_END = 1
const L1_DECAY = 0.8
const L1_PASSES = 24
/** A layer item with nothing to be near must still be placed; this weight keeps it where it is. */
const NO_PULL = 1e-9

const ascending = (a: number, b: number): number => a - b
const size = (v: number): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)
const gapOf = (v: number | undefined, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback)

/** What one connected piece of the graph comes out as, in the abstract rank/cross space. */
interface Placed {
  /** Per member: the top of its box along the rank axis. */
  rankAt: number[]
  /** Per member: the CENTRE of its box across the flow, 0 = the component's leftmost edge. */
  crossAt: number[]
  crossLen: number
  rankLen: number
  /** Per component edge: the (rank centre, cross centre) of each dummy it passes through. */
  chains: Array<Array<{ rank: number; cross: number }>>
}

export function layoutFlow(input: LayoutInput, requested: FlowDirection, opts: LayoutOptions = {}): LayoutResult {
  // A direction that is none of the four (a hand-edited file) is TB, the default everywhere else — never a half-mapped layout.
  const direction: FlowDirection = requested === 'BT' || requested === 'LR' || requested === 'RL' ? requested : 'TB'
  const rankGap = gapOf(opts.rankGap, LAYOUT_DEFAULTS.rankGap)
  const nodeGap = gapOf(opts.nodeGap, LAYOUT_DEFAULTS.nodeGap)
  const componentGap = gapOf(opts.componentGap, LAYOUT_DEFAULTS.componentGap)
  const horizontal = direction === 'LR' || direction === 'RL'

  // ── The graph as indices. A duplicate node id keeps its first entry (a Map of ids cannot hold two anyway).
  const index = new Map<string, number>()
  const ids: string[] = []
  const rankExt: number[] = [] // the extent ALONG the flow: h for TB/BT, w for LR/RL
  const crossExt: number[] = [] // the extent ACROSS it
  for (const node of input.nodes) {
    if (index.has(node.id)) continue
    index.set(node.id, ids.length)
    const w = size(node.w)
    const h = size(node.h)
    ids.push(node.id)
    rankExt.push(horizontal ? w : h)
    crossExt.push(horizontal ? h : w)
  }
  const n = ids.length
  if (n === 0) return { positions: new Map(), width: 0, height: 0, reversed: 0, waypoints: [] }

  // Edges that cannot affect a layout are dropped HERE, once: a missing endpoint (a dangling connector), a self-loop (it has no direction), and a repeat.
  const eFrom: number[] = []
  const eTo: number[] = []
  const seenPair = new Set<number>()
  for (const edge of input.edges) {
    const a = index.get(edge.from)
    const b = index.get(edge.to)
    if (a === undefined || b === undefined || a === b) continue
    const key = a * n + b
    if (seenPair.has(key)) continue
    seenPair.add(key)
    eFrom.push(a)
    eTo.push(b)
  }
  const m = eFrom.length

  // ── 1. Cycle breaking. Sources first, then whatever is left in input order: starting inside a cycle's tail would make the
  //    person's "start" the thing that gets reversed. Iterative, so a 500-long chain is not a stack depth.
  const outEdges: number[][] = Array.from({ length: n }, () => [])
  const inDegree = new Int32Array(n)
  for (let e = 0; e < m; e++) { outEdges[eFrom[e]].push(e); inDegree[eTo[e]]++ }
  const state = new Uint8Array(n) // 0 unseen, 1 on the stack, 2 done
  const back = new Uint8Array(m)
  const cursor = new Int32Array(n)
  const stack: number[] = []
  let reversed = 0
  const walk = (root: number): void => {
    if (state[root] !== 0) return
    state[root] = 1
    stack.push(root)
    while (stack.length > 0) {
      const u = stack[stack.length - 1]
      const list = outEdges[u]
      if (cursor[u] < list.length) {
        const e = list[cursor[u]++]
        const v = eTo[e]
        if (state[v] === 0) { state[v] = 1; stack.push(v) } else if (state[v] === 1) { back[e] = 1; reversed++ }
      } else { state[u] = 2; stack.pop() }
    }
  }
  for (let i = 0; i < n; i++) if (inDegree[i] === 0) walk(i)
  for (let i = 0; i < n; i++) walk(i)

  // The edges as ranking sees them: a back edge flipped, and a pair that now exists twice (A→B and a flipped B→A) merged.
  const uFrom: number[] = []
  const uTo: number[] = []
  const uniqueOf = new Int32Array(m)
  const seenOriented = new Map<number, number>()
  for (let e = 0; e < m; e++) {
    const a = back[e] === 1 ? eTo[e] : eFrom[e]
    const b = back[e] === 1 ? eFrom[e] : eTo[e]
    const key = a * n + b
    let u = seenOriented.get(key)
    if (u === undefined) { u = uFrom.length; seenOriented.set(key, u); uFrom.push(a); uTo.push(b) }
    uniqueOf[e] = u
  }
  const um = uFrom.length

  // ── 2. Layering. Longest path from the sources (Kahn's order, ties by input order), then the pull-down.
  const succ: number[][] = Array.from({ length: n }, () => [])
  const pred: number[][] = Array.from({ length: n }, () => [])
  const pending = new Int32Array(n)
  for (let u = 0; u < um; u++) { succ[uFrom[u]].push(uTo[u]); pred[uTo[u]].push(uFrom[u]); pending[uTo[u]]++ }
  const rank = new Int32Array(n)
  const topo: number[] = []
  for (let i = 0; i < n; i++) if (pending[i] === 0) topo.push(i)
  for (let head = 0; head < topo.length; head++) {
    const u = topo[head]
    for (const v of succ[u]) {
      if (rank[u] + 1 > rank[v]) rank[v] = rank[u] + 1
      if (--pending[v] === 0) topo.push(v)
    }
  }
  // Longest-path puts everything as HIGH as it can go, so a source feeding only a deep node is stretched down to it by a long edge. Moving a node
  // one rank down lengthens its in-edges and shortens its out-edges: worth it exactly when it has more of the second. Successors are settled
  // before a node is looked at (reverse topological order), so one pass is a fixed point of the rule. Ties stay put — a neutral move buys nothing.
  for (let t = topo.length - 1; t >= 0; t--) {
    const v = topo[t]
    if (succ[v].length <= pred[v].length) continue
    let limit = Number.POSITIVE_INFINITY
    for (const w of succ[v]) if (rank[w] < limit) limit = rank[w]
    if (limit - 1 > rank[v]) rank[v] = limit - 1
  }

  // ── Components, in the order of each one's first node in the input (the caller's order is the person's, and "left to right" should follow it).
  const nbrs: number[][] = Array.from({ length: n }, () => [])
  for (let u = 0; u < um; u++) { nbrs[uFrom[u]].push(uTo[u]); nbrs[uTo[u]].push(uFrom[u]) }
  const componentOf = new Int32Array(n).fill(-1)
  const components: number[][] = []
  for (let i = 0; i < n; i++) {
    if (componentOf[i] !== -1) continue
    const members = [i]
    componentOf[i] = components.length
    for (let head = 0; head < members.length; head++) {
      for (const v of nbrs[members[head]]) {
        if (componentOf[v] === -1) { componentOf[v] = components.length; members.push(v) }
      }
    }
    members.sort(ascending)
    components.push(members)
  }
  const edgesOfComponent: number[][] = components.map(() => [])
  for (let u = 0; u < um; u++) edgesOfComponent[componentOf[uFrom[u]]].push(u)

  // ── 3 + 4, per component, then side by side along the cross axis.
  const localOf = new Int32Array(n)
  const nodeRankAt = new Float64Array(n)
  const nodeCrossAt = new Float64Array(n)
  const chainOfUnique: Array<Array<{ rank: number; cross: number }>> = new Array(um)
  let crossCursor = 0
  let rankTotal = 0
  const pieces: Array<{ members: number[]; offset: number }> = []
  for (let c = 0; c < components.length; c++) {
    const members = components[c]
    const k = members.length
    members.forEach((g, li) => { localOf[g] = li })
    let low = Number.POSITIVE_INFINITY
    for (const g of members) if (rank[g] < low) low = rank[g]
    const local = edgesOfComponent[c]
    const placed = layoutComponent(
      k,
      members.map((g) => rank[g] - low),
      members.map((g) => rankExt[g]),
      members.map((g) => crossExt[g]),
      local.map((u) => localOf[uFrom[u]]),
      local.map((u) => localOf[uTo[u]]),
      nodeGap,
      rankGap
    )
    members.forEach((g, li) => { nodeRankAt[g] = placed.rankAt[li]; nodeCrossAt[g] = crossCursor + placed.crossAt[li] })
    local.forEach((u, li) => {
      chainOfUnique[u] = placed.chains[li].map((p) => ({ rank: p.rank, cross: crossCursor + p.cross }))
    })
    pieces.push({ members, offset: crossCursor })
    crossCursor += placed.crossLen + componentGap
    if (placed.rankLen > rankTotal) rankTotal = placed.rankLen
  }

  // ── Map the abstract space to the direction. BT/RL mirror the RANK axis only, over the whole layout's length, so every component's first rank
  //    sits on the same baseline; the cross order is never mirrored (Mermaid's BT reads left to right too).
  const boxX = new Float64Array(n)
  const boxY = new Float64Array(n)
  const centreOf = (rankCentre: number, crossCentre: number): LayoutPoint => {
    if (direction === 'TB') return { x: crossCentre, y: rankCentre }
    if (direction === 'BT') return { x: crossCentre, y: rankTotal - rankCentre }
    if (direction === 'LR') return { x: rankCentre, y: crossCentre }
    return { x: rankTotal - rankCentre, y: crossCentre }
  }
  for (const piece of pieces) {
    for (const g of piece.members) {
      const centre = centreOf(nodeRankAt[g] + rankExt[g] / 2, nodeCrossAt[g])
      boxX[g] = centre.x - (horizontal ? rankExt[g] : crossExt[g]) / 2
      boxY[g] = centre.y - (horizontal ? crossExt[g] : rankExt[g]) / 2
    }
  }

  // ── Normalise: the top-left of the bounding box IS (0,0), whatever the mirror did. The waypoints move with the nodes.
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (let g = 0; g < n; g++) {
    const w = horizontal ? rankExt[g] : crossExt[g]
    const h = horizontal ? crossExt[g] : rankExt[g]
    if (boxX[g] < minX) minX = boxX[g]
    if (boxY[g] < minY) minY = boxY[g]
    if (boxX[g] + w > maxX) maxX = boxX[g] + w
    if (boxY[g] + h > maxY) maxY = boxY[g] + h
  }
  const positions = new Map<string, LayoutPoint>()
  for (let g = 0; g < n; g++) positions.set(ids[g], { x: boxX[g] - minX, y: boxY[g] - minY })

  const waypoints: LayoutWaypoints[] = []
  for (let e = 0; e < m; e++) {
    const chain = chainOfUnique[uniqueOf[e]]
    if (chain.length === 0) continue
    const via = chain.map((p) => { const centre = centreOf(p.rank, p.cross); return { x: centre.x - minX, y: centre.y - minY } })
    // A flipped edge was laid out low → high; the person drew it high → low, so its way points are handed back in THEIR order.
    if (back[e] === 1) via.reverse()
    waypoints.push({ from: ids[eFrom[e]], to: ids[eTo[e]], via })
  }
  return { positions, width: maxX - minX, height: maxY - minY, reversed, waypoints }
}

/**
 * One connected piece, laid out with its first rank at 0 and its leftmost box
 * edge at 0, in the abstract space. `ea[i] → eb[i]` always rises in rank.
 */
function layoutComponent(
  k: number,
  rankOf: number[],
  rankExt: number[],
  crossExt: number[],
  ea: number[],
  eb: number[],
  nodeGap: number,
  rankGap: number
): Placed {
  // ── Items: the k real nodes, then one dummy per rank a long edge crosses. Every layered edge spans exactly one rank.
  const itemRank: number[] = rankOf.slice()
  const itemWidth: number[] = crossExt.slice()
  const up: number[][] = Array.from({ length: k }, () => [])
  const down: number[][] = Array.from({ length: k }, () => [])
  const chainItems: number[][] = []
  for (let e = 0; e < ea.length; e++) {
    let prev = ea[e]
    const items: number[] = []
    for (let r = rankOf[ea[e]] + 1; r < rankOf[eb[e]]; r++) {
      const d = itemRank.length
      itemRank.push(r)
      itemWidth.push(0)
      up.push([prev])
      down.push([])
      down[prev].push(d)
      items.push(d)
      prev = d
    }
    down[prev].push(eb[e])
    up[eb[e]].push(prev)
    chainItems.push(items)
  }
  const total = itemRank.length
  let ranks = 0
  for (let i = 0; i < total; i++) if (itemRank[i] + 1 > ranks) ranks = itemRank[i] + 1

  // ── 3. Ordering. The starting order is a DFS preorder taken in input order (sources first, by rank then index): a node's children land
  //    next to each other in every deeper rank, which is most of what a good order is. The sweeps then only have to repair it.
  const layers: number[][] = Array.from({ length: ranks }, () => [])
  const byRank: number[][] = Array.from({ length: ranks }, () => [])
  for (let i = 0; i < total; i++) byRank[itemRank[i]].push(i)
  {
    const seen = new Uint8Array(total)
    const at = new Int32Array(total)
    const path: number[] = []
    for (let r = 0; r < ranks; r++) {
      for (const root of byRank[r]) {
        if (seen[root] === 1) continue
        seen[root] = 1
        layers[r].push(root)
        path.push(root)
        while (path.length > 0) {
          const u = path[path.length - 1]
          if (at[u] < down[u].length) {
            const v = down[u][at[u]++]
            if (seen[v] === 0) { seen[v] = 1; layers[itemRank[v]].push(v); path.push(v) }
          } else path.pop()
        }
      }
    }
  }
  const order = orderLayers(layers, up, down, total)

  // ── 4. Coordinates across the flow.
  const x = placeAcross(order, up, down, itemWidth, k, nodeGap)
  let minEdge = Number.POSITIVE_INFINITY
  let maxEdge = Number.NEGATIVE_INFINITY
  for (let i = 0; i < k; i++) {
    if (x[i] - itemWidth[i] / 2 < minEdge) minEdge = x[i] - itemWidth[i] / 2
    if (x[i] + itemWidth[i] / 2 > maxEdge) maxEdge = x[i] + itemWidth[i] / 2
  }

  // Along the flow: a rank is as thick as its thickest node, and every node sits centred in its band. A rank of dummies alone is a line (0).
  const thickness = new Float64Array(ranks)
  for (let i = 0; i < k; i++) if (rankExt[i] > thickness[itemRank[i]]) thickness[itemRank[i]] = rankExt[i]
  const start = new Float64Array(ranks)
  let cursor = 0
  for (let r = 0; r < ranks; r++) { start[r] = cursor; cursor += thickness[r] + rankGap }
  const rankLen = ranks > 0 ? cursor - rankGap : 0

  const rankAt: number[] = []
  const crossAt: number[] = []
  for (let i = 0; i < k; i++) {
    rankAt.push(start[itemRank[i]] + (thickness[itemRank[i]] - rankExt[i]) / 2)
    crossAt.push(x[i] - minEdge)
  }
  const chains = chainItems.map((items) => items.map((d) => ({ rank: start[itemRank[d]] + thickness[itemRank[d]] / 2, cross: x[d] - minEdge })))
  return { rankAt, crossAt, crossLen: maxEdge - minEdge, rankLen, chains }
}

/**
 * Barycenter sweeps down and up with an adjacent-transposition pass after each,
 * keeping the best order any sweep produced (the initial order included). A
 * sweep can make things worse; the best-seen rule is what makes running more of
 * them safe. Sorts are stable on (barycenter, current position), so an equal
 * barycenter never reshuffles — which is also what makes the run repeatable.
 */
function orderLayers(layers: number[][], up: number[][], down: number[][], total: number): number[][] {
  const pos = new Int32Array(total)
  const bary = new Float64Array(total)
  const refresh = (): void => { for (const layer of layers) for (let j = 0; j < layer.length; j++) pos[layer[j]] = j }
  refresh()
  const scratch = { tree: new Int32Array(total + 2), tmp: [] as number[] }
  let best = countCrossings(layers, down, pos, scratch)
  let bestLayers = layers.map((l) => l.slice())
  if (layers.length < 2) return bestLayers

  let stale = 0
  for (let sweep = 0; sweep < MAX_SWEEPS; sweep++) {
    if (best === 0 && sweep >= MIN_SWEEPS) break
    if (sweep % 2 === 0) for (let r = 1; r < layers.length; r++) reorder(layers[r], up, pos, bary)
    else for (let r = layers.length - 2; r >= 0; r--) reorder(layers[r], down, pos, bary)
    transpose(layers, up, down, pos)
    const crossings = countCrossings(layers, down, pos, scratch)
    if (crossings < best) { best = crossings; bestLayers = layers.map((l) => l.slice()); stale = 0 } else stale++
    if (stale >= PATIENCE && sweep + 1 >= MIN_SWEEPS) break
  }
  return bestLayers
}

/** Sort a layer by the mean position of its neighbours on the reference side. An item with none keeps its slot: it has no opinion, and moving it would only disturb the rest. */
function reorder(layer: number[], toward: number[][], pos: Int32Array, bary: Float64Array): void {
  const movable: number[] = []
  const slots: number[] = []
  for (let j = 0; j < layer.length; j++) {
    const v = layer[j]
    const list = toward[v]
    if (list.length === 0) continue
    let sum = 0
    for (const u of list) sum += pos[u]
    bary[v] = sum / list.length
    movable.push(v)
    slots.push(j)
  }
  movable.sort((a, b) => bary[a] - bary[b] || pos[a] - pos[b])
  for (let i = 0; i < movable.length; i++) { layer[slots[i]] = movable[i]; pos[movable[i]] = slots[i] }
}

/** Swap neighbours while a swap strictly lowers the crossings their edges make with both adjacent layers. Equal is not an improvement, so this terminates and never flip-flops. */
function transpose(layers: number[][], up: number[][], down: number[][], pos: Int32Array): void {
  for (const layer of layers) {
    if (layer.length < 2) continue
    let improved = true
    for (let pass = 0; improved && pass < 12; pass++) {
      improved = false
      for (let j = 0; j + 1 < layer.length; j++) {
        const u = layer[j]
        const v = layer[j + 1]
        let now = 0
        let swapped = 0
        for (const a of up[u]) for (const b of up[v]) { if (pos[a] > pos[b]) now++; else if (pos[a] < pos[b]) swapped++ }
        for (const a of down[u]) for (const b of down[v]) { if (pos[a] > pos[b]) now++; else if (pos[a] < pos[b]) swapped++ }
        if (swapped < now) { layer[j] = v; layer[j + 1] = u; pos[v] = j; pos[u] = j + 1; improved = true }
      }
    }
  }
}

/** Total crossings between adjacent layers, O(E log V): per layer pair, the inversions among the lower endpoints taken in upper order (Barth et al.'s accumulator tree). */
function countCrossings(layers: number[][], down: number[][], pos: Int32Array, scratch: { tree: Int32Array; tmp: number[] }): number {
  let crossings = 0
  const { tree, tmp } = scratch
  for (let r = 0; r + 1 < layers.length; r++) {
    const width = layers[r + 1].length
    tree.fill(0, 0, width + 1)
    let inserted = 0
    for (const u of layers[r]) {
      const list = down[u]
      if (list.length === 0) continue
      tmp.length = 0
      for (const v of list) tmp.push(pos[v])
      if (tmp.length > 1) tmp.sort(ascending)
      for (const p of tmp) {
        let notAfter = 0
        for (let i = p + 1; i > 0; i -= i & -i) notAfter += tree[i]
        crossings += inserted - notAfter
        for (let i = p + 1; i <= width; i += i & -i) tree[i]++
        inserted++
      }
    }
  }
  return crossings
}

/**
 * The cross-axis centre of every item, by weighted least squares.
 *
 * Minimise Σ ω·(x_u − x_v)² over the edges, subject to each layer keeping its
 * order with `separation` between neighbours. Given the layers above and below
 * fixed, ONE layer's optimum is an isotonic regression (each item wants the
 * weighted mean of its neighbours; the order constraint is a chain), which
 * pool-adjacent-violators solves exactly in O(layer). Cycling through the layers
 * is block-coordinate descent on a convex problem, so it only ever improves and
 * cannot oscillate the way "align to the median, then push overlaps apart" does.
 * Widths are respected because the separation between neighbours is half of each
 * one's extent plus the gap — a wide node claims a wide slot.
 *
 * Least squares alone blurs: a node with three neighbours settles on their MEAN,
 * which can land outside both children of a tree parent whose own parent is far
 * away (measured on a 15-node binary tree of mixed widths: a parent 32 units
 * beyond both its children). So the last passes reweight each edge by 1/slack —
 * iteratively reweighted least squares, converging on the L1 (median) optimum —
 * which pulls a node ONTO its median neighbour and lets the far edge give way.
 */
function placeAcross(order: number[][], up: number[][], down: number[][], width: number[], reals: number, nodeGap: number): Float64Array {
  const total = width.length
  const x = new Float64Array(total)
  const slot = new Float64Array(total) // offset of an item from the left end of its packed layer
  let widest = 0
  for (const layer of order) {
    if (layer.length > widest) widest = layer.length
    for (let j = 1; j < layer.length; j++) {
      const p = layer[j - 1]
      const q = layer[j]
      slot[q] = slot[p] + (width[p] + width[q]) / 2 + (p < reals && q < reals ? nodeGap : nodeGap * DUMMY_GAP)
    }
    for (const i of layer) x[i] = slot[i]
  }
  const target = new Float64Array(widest)
  const pull = new Float64Array(widest)
  const blockWeight = new Float64Array(widest)
  const blockSum = new Float64Array(widest)
  const blockStart = new Int32Array(widest)
  const weightOf = (p: number, q: number): number => (p < reals && q < reals ? W_REAL : p >= reals && q >= reals ? W_DUMMY : W_MIXED)

  // delta > 0 turns the least-squares pull into an L1 one (iteratively reweighted: an edge pulls with ω/|its slack|, floored at delta), which is what makes
  // a node settle on a MEDIAN neighbour — straight where it can be — instead of a compromise between all of them.
  const solve = (layer: number[], useUp: boolean, useDown: boolean, delta: number): number => {
    const len = layer.length
    for (let j = 0; j < len; j++) {
      const i = layer[j]
      let w = 0
      let wx = 0
      if (useUp) for (const u of up[i]) { const o = weightOf(i, u) / (delta > 0 ? Math.max(Math.abs(x[i] - x[u]), delta) : 1); w += o; wx += o * x[u] }
      if (useDown) for (const v of down[i]) { const o = weightOf(i, v) / (delta > 0 ? Math.max(Math.abs(x[i] - x[v]), delta) : 1); w += o; wx += o * x[v] }
      // Solve in y = x − slot, where the order constraint is just "y never decreases".
      if (w === 0) { target[j] = x[i] - slot[i]; pull[j] = NO_PULL } else { target[j] = wx / w - slot[i]; pull[j] = w }
    }
    let blocks = 0
    for (let j = 0; j < len; j++) {
      blockWeight[blocks] = pull[j]
      blockSum[blocks] = pull[j] * target[j]
      blockStart[blocks] = j
      blocks++
      while (blocks > 1 && blockSum[blocks - 2] / blockWeight[blocks - 2] > blockSum[blocks - 1] / blockWeight[blocks - 1]) {
        blockWeight[blocks - 2] += blockWeight[blocks - 1]
        blockSum[blocks - 2] += blockSum[blocks - 1]
        blocks--
      }
    }
    let moved = 0
    for (let b = 0; b < blocks; b++) {
      const end = b + 1 < blocks ? blockStart[b + 1] : len
      const y = blockSum[b] / blockWeight[b]
      for (let j = blockStart[b]; j < end; j++) {
        const i = layer[j]
        const next = y + slot[i]
        const d = Math.abs(next - x[i])
        if (d > moved) moved = d
        x[i] = next
      }
    }
    return moved
  }

  if (order.length < 2) return x
  // One-sided passes first: they carry the top of the graph's alignment down and the bottom's back up, which is a far better start than left-packed.
  for (let r = 1; r < order.length; r++) solve(order[r], true, false, 0)
  for (let r = order.length - 2; r >= 0; r--) solve(order[r], false, true, 0)
  const sweepBoth = (delta: number): number => {
    let moved = 0
    for (let r = 1; r < order.length; r++) moved = Math.max(moved, solve(order[r], true, true, delta))
    for (let r = order.length - 2; r >= 0; r--) moved = Math.max(moved, solve(order[r], true, true, delta))
    return moved
  }
  for (let pass = 0; pass < MAX_PASSES; pass++) if (sweepBoth(0) < SETTLED) break
  for (let pass = 0, delta = L1_START; pass < L1_PASSES; pass++, delta = Math.max(L1_END, delta * L1_DECAY)) sweepBoth(delta)
  return x
}
