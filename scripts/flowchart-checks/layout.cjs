/* verify:flowchart — the layout area (src/shared/flowchart-layout.ts). Every
   property here fails SILENTLY when broken: a layout that overlaps two nodes, or
   sends an edge up the page in a top-down chart, or lays LR out by swapping x and
   y, still returns a full map of positions. Each check states the property that
   would slip through, and measures it from the OUTPUT (centres and boxes), never
   from the layout's own bookkeeping. */
module.exports = async function (ok, F) {
  const L = F.layout ?? {}
  if (typeof L.layoutFlow !== 'function') {
    ok('flowchart.layout.0 the layout module exports layoutFlow', false, Object.keys(L).join(',') || 'nothing exported')
    return
  }
  const layout = L.layoutFlow
  const DIRS = ['TB', 'BT', 'LR', 'RL']
  const EPS = 1e-6
  const DEF = { rankGap: 64, nodeGap: 40, componentGap: 96 }

  // ── Fixtures: a seeded generator (no Math.random — a flaky fixture is a flaky check) and the small measurements every check shares.
  const rng = (seed) => {
    let a = seed >>> 0
    return () => {
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }
  /* n nodes of very different sizes; a spine plus random short and long edges, `back` of them pointing the wrong way (so cycles). */
  const varied = (n, m, seed, back = 0) => {
    const r = rng(seed)
    const nodes = Array.from({ length: n }, (_, i) => ({ id: `n${i}`, w: 20 + Math.floor(r() * 220), h: 20 + Math.floor(r() * 100) }))
    const edges = []
    for (let i = 1; i < n; i++) edges.push({ from: `n${Math.max(0, i - 1 - Math.floor(r() * 5))}`, to: `n${i}` })
    while (edges.length < m) {
      const a = Math.floor(r() * n)
      const b = Math.floor(r() * n)
      if (a === b || Math.abs(a - b) > 20) continue
      const lo = Math.min(a, b)
      const hi = Math.max(a, b)
      edges.push(r() < back ? { from: `n${hi}`, to: `n${lo}` } : { from: `n${lo}`, to: `n${hi}` })
    }
    return { nodes, edges }
  }
  const box = (res, nodes) => nodes.map((nd) => { const p = res.positions.get(nd.id); return { id: nd.id, x: p.x, y: p.y, w: nd.w, h: nd.h, cx: p.x + nd.w / 2, cy: p.y + nd.h / 2 } })
  const byId = (boxes) => new Map(boxes.map((b) => [b.id, b]))
  /* The first pair of boxes closer than `gap` on BOTH axes — separated by less than the gap along x AND along y. */
  const crowded = (boxes, gap) => {
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]
        const b = boxes[j]
        const dx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w))
        const dy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h))
        if (dx < gap - EPS && dy < gap - EPS) return `${a.id}/${b.id} (dx ${dx.toFixed(1)}, dy ${dy.toFixed(1)})`
      }
    }
    return null
  }
  /* How far along the flow a point is: larger = later. */
  const flow = (dir, p) => (dir === 'TB' ? p.y : dir === 'BT' ? -p.y : dir === 'LR' ? p.x : -p.x)
  const across = (dir, p) => (dir === 'TB' || dir === 'BT' ? p.x : p.y)
  const centreOf = (b) => ({ x: b.cx, y: b.cy })
  const backwards = (dir, boxes, edges) => {
    const at = byId(boxes)
    return edges.filter((e) => flow(dir, centreOf(at.get(e.to))) - flow(dir, centreOf(at.get(e.from))) <= EPS)
  }
  /* Straight-segment crossings between ADJACENT ranks — every fixture using it has only rank-to-rank edges. Two edges cross when their ends swap sides; a shared end is a touch, not a crossing. */
  const crossings = (dir, boxes, edges) => {
    const at = byId(boxes)
    const c = (id) => centreOf(at.get(id))
    let total = 0
    for (let i = 0; i < edges.length; i++) {
      for (let j = i + 1; j < edges.length; j++) {
        const e = edges[i]
        const f = edges[j]
        if (Math.abs(flow(dir, c(e.from)) - flow(dir, c(f.from))) > EPS || Math.abs(flow(dir, c(e.to)) - flow(dir, c(f.to))) > EPS) continue
        if ((across(dir, c(e.from)) - across(dir, c(f.from))) * (across(dir, c(e.to)) - across(dir, c(f.to))) < -EPS) total++
      }
    }
    return total
  }
  /* Liang–Barsky: does the segment p→q enter the rectangle, shrunk by 1 so a graze along an edge is not a hit? */
  const hits = (p, q, r) => {
    const x0 = r.x + 1
    const x1 = r.x + r.w - 1
    const y0 = r.y + 1
    const y1 = r.y + r.h - 1
    let t0 = 0
    let t1 = 1
    const dx = q.x - p.x
    const dy = q.y - p.y
    for (const [pp, qq] of [[-dx, p.x - x0], [dx, x1 - p.x], [-dy, p.y - y0], [dy, y1 - p.y]]) {
      if (Math.abs(pp) < 1e-12) { if (qq < 0) return false } else {
        const t = qq / pp
        if (pp < 0) { if (t > t1) return false; if (t > t0) t0 = t } else { if (t < t0) return false; if (t < t1) t1 = t }
      }
    }
    return true
  }
  const same = (a, b) => JSON.stringify([...a.positions]) === JSON.stringify([...b.positions]) && a.width === b.width && a.height === b.height && a.reversed === b.reversed && JSON.stringify(a.waypoints) === JSON.stringify(b.waypoints)
  const nd = (id, w = 100, h = 60) => ({ id, w, h })
  const ed = (from, to) => ({ from, to })

  // ── 1. Overlap. The oldest silent failure: positions come back, two of them on top of each other.
  {
    const bad = []
    for (const seed of [1, 2, 3, 4]) {
      const g = varied(40, 62, seed, 0.1)
      for (const dir of DIRS) {
        const res = layout(g, dir)
        const hit = crowded(box(res, g.nodes), DEF.nodeGap / 2)
        if (hit) bad.push(`seed ${seed} ${dir}: ${hit}`)
        const tight = layout(g, dir, { nodeGap: 10, rankGap: 20, componentGap: 30 })
        const hit2 = crowded(box(tight, g.nodes), 5)
        if (hit2) bad.push(`seed ${seed} ${dir} tight: ${hit2}`)
      }
    }
    ok('flowchart.layout.1 no two nodes overlap or crowd within nodeGap/2, in any direction, for 40 nodes of very different sizes with cycles and long edges (default and tight gaps)', bad.length === 0, bad.slice(0, 3).join(' | '))
  }

  // ── 2. Flow direction. A DAG must read the way the direction says, in all four.
  {
    const g = varied(40, 66, 11, 0)
    const bad = []
    for (const dir of DIRS) {
      const wrong = backwards(dir, box(layout(g, dir), g.nodes), g.edges)
      if (wrong.length) bad.push(`${dir}: ${wrong.length} edge(s) not pointing ${dir} e.g. ${wrong[0].from}->${wrong[0].to}`)
    }
    ok('flowchart.layout.2 every edge of a DAG points down in TB, up in BT, right in LR and left in RL (node centres, variable sizes)', bad.length === 0, bad.join(' | '))
  }

  // ── 3. A cycle. It must lay out, count what it reversed, and read as a chain with exactly the reversed edges pointing back.
  {
    const nodes = [nd('A'), nd('B', 140, 40), nd('C', 60, 90)]
    const edges = [ed('A', 'B'), ed('B', 'C'), ed('C', 'A')]
    const bad = []
    for (const dir of DIRS) {
      const res = layout({ nodes, edges }, dir)
      const boxes = box(res, nodes)
      const back = backwards(dir, boxes, edges)
      if (res.reversed !== 1) bad.push(`${dir}: reversed ${res.reversed}`)
      if (back.length !== res.reversed) bad.push(`${dir}: ${back.length} edges point back but reversed says ${res.reversed}`)
      const hit = crowded(boxes, DEF.nodeGap / 2)
      if (hit) bad.push(`${dir}: ${hit}`)
      const via = res.waypoints.find((w) => w.from === 'C' && w.to === 'A')
      const b = byId(boxes).get('B')
      if (!via || via.via.length !== 1) bad.push(`${dir}: the flipped C->A edge skips a rank and should carry one way point`)
      else if (hits(centreOf(byId(boxes).get('C')), via.via[0], b) || hits(via.via[0], centreOf(byId(boxes).get('A')), b)) bad.push(`${dir}: C->A passes through B`)
    }
    ok('flowchart.layout.3 a cycle A→B→C→A lays out with reversed = 1, exactly that edge pointing back, no overlap, and its long return edge steering clear of B', bad.length === 0, bad.join(' | '))
  }

  // ── 4. A known crossing case. The order the person typed crosses; the layout must uncross it.
  {
    const bad = []
    // S1→T1, S1→T2, S2→T2 has an uncrossed drawing; typing the sinks T2 before T1 makes the naive order cross once.
    const small = { nodes: [nd('S1'), nd('S2', 60, 100), nd('T2', 160, 40), nd('T1')], edges: [ed('S1', 'T1'), ed('S1', 'T2'), ed('S2', 'T2')] }
    // A zigzag of 6+6 with the sinks typed in REVERSE: a single sweep of barycenters gets stuck on ties; the transpositions or later sweeps must not.
    const zig = { nodes: [], edges: [] }
    for (let i = 1; i <= 6; i++) zig.nodes.push(nd(`S${i}`, 80 + i * 10, 50))
    for (let i = 6; i >= 1; i--) zig.nodes.push(nd(`T${i}`, 140 - i * 10, 70))
    for (let i = 1; i <= 6; i++) { zig.edges.push(ed(`S${i}`, `T${i}`)); if (i < 6) zig.edges.push(ed(`S${i}`, `T${i + 1}`)) }
    // Two 3-layer graphs typed in scrambled order, found by search: the order the layout STARTS from crosses 4 times in each, and an uncrossed drawing exists
    // (the layout finds it). What they catch is the ordering sweeps being switched off, or a start that happens to be tidy on the friendlier fixtures above.
    const scrambled = (nodeIds, pairs) => ({ nodes: nodeIds.map((id, i) => nd(id, 60 + (i % 3) * 30, 40)), edges: pairs.map((p) => { const [from, to] = p.split('>'); return ed(from, to) }) })
    const s1 = scrambled(['L0a', 'L0c', 'L1a', 'L2b', 'L1d', 'L1b', 'L2a', 'L2c', 'L1c', 'L0b'], ['L0a>L1a', 'L1c>L2c', 'L1d>L2b', 'L0a>L1d', 'L0c>L1c', 'L0c>L1a', 'L1a>L2a', 'L1b>L2a', 'L0b>L1d'])
    const s2 = scrambled(['L2c', 'L1c', 'L1d', 'L0c', 'L1a', 'L0a', 'L0b', 'L2b', 'L2a', 'L1b'], ['L0a>L1b', 'L1d>L2c', 'L1a>L2a', 'L1b>L2a', 'L1c>L2c', 'L0a>L1d', 'L0c>L1d', 'L1d>L2b', 'L0c>L1c', 'L0b>L1d'])
    for (const [name, g] of [['small', small], ['zigzag', zig], ['scrambled-1', s1], ['scrambled-2', s2]]) {
      for (const dir of DIRS) {
        const c = crossings(dir, box(layout(g, dir), g.nodes), g.edges)
        if (c !== 0) bad.push(`${name} ${dir}: ${c} crossing(s)`)
      }
    }
    ok('flowchart.layout.4 two sources and two sinks typed in a crossing order, a 6+6 zigzag with the sinks reversed, and two scrambled 3-layer graphs whose starting order crosses, all come out with 0 crossings in every direction', bad.length === 0, bad.join(' | '))
  }

  // ── 5. A long edge. A→D beside A→B→C→D must not be drawn through B or C: the layout hands back where it passes each skipped rank.
  {
    const nodes = [nd('A', 120, 50), nd('B', 180, 60), nd('C', 200, 50), nd('D', 120, 50)]
    const edges = [ed('A', 'B'), ed('B', 'C'), ed('C', 'D'), ed('A', 'D')]
    const bad = []
    for (const dir of DIRS) {
      const res = layout({ nodes, edges }, dir)
      const at = byId(box(res, nodes))
      const w = res.waypoints.filter((x) => x.from === 'A' && x.to === 'D')
      if (w.length !== 1 || w[0].via.length !== 2) { bad.push(`${dir}: A->D should have exactly two way points, has ${JSON.stringify(w)}`); continue }
      const line = [centreOf(at.get('A')), ...w[0].via, centreOf(at.get('D'))]
      const monotone = line.every((p, i) => i === 0 || flow(dir, p) > flow(dir, line[i - 1]))
      if (!monotone) bad.push(`${dir}: the way points do not advance along the flow`)
      for (let i = 0; i + 1 < line.length; i++) {
        for (const id of ['B', 'C']) if (hits(line[i], line[i + 1], at.get(id))) bad.push(`${dir}: A->D segment ${i} runs through ${id}`)
      }
      // The way point sits in the rank of the node it skips, clear of that node by at least half the node gap.
      for (const [i, id] of [[0, 'B'], [1, 'C']]) {
        const b = at.get(id)
        const dx = Math.max(b.x - (w[0].via[i].x), w[0].via[i].x - (b.x + b.w))
        const dy = Math.max(b.y - (w[0].via[i].y), w[0].via[i].y - (b.y + b.h))
        if (Math.max(dx, dy) < DEF.nodeGap / 2 - EPS) bad.push(`${dir}: way point ${i} is ${Math.max(dx, dy).toFixed(1)} from ${id}`)
      }
    }
    // A flipped long edge is handed back in the person's order (D → A), not the layout's.
    const ring = { nodes: [nd('A'), nd('B'), nd('C'), nd('D')], edges: [ed('A', 'B'), ed('B', 'C'), ed('C', 'D'), ed('D', 'A')] }
    const rr = layout(ring, 'TB')
    const back = rr.waypoints.find((x) => x.from === 'D' && x.to === 'A')
    if (!back || back.via.length !== 2 || !(back.via[0].y > back.via[1].y)) bad.push(`ring: D->A way points should run from D upward, got ${JSON.stringify(back)}`)
    ok('flowchart.layout.5 a long edge A→D beside A→B→C→D carries one way point per skipped rank, advancing along the flow and clear of B and C; a reversed long edge lists them D-first', bad.length === 0, bad.slice(0, 3).join(' | '))
  }

  // ── 6. Sizes. LR is not TB with x and y swapped: a node's WIDTH is its extent along the flow there.
  {
    const nodes = [nd('X', 300, 40), nd('Y', 50, 120), nd('Z', 120, 20), nd('Y2', 200, 30)]
    const edges = [ed('X', 'Y'), ed('X', 'Y2'), ed('Y', 'Z')]
    const bad = []
    const lr = box(layout({ nodes, edges }, 'LR'), nodes)
    const at = byId(lr)
    const X = at.get('X'), Y = at.get('Y'), Y2 = at.get('Y2'), Z = at.get('Z')
    // The rank after X is as thick as its WIDEST node (Y2, 200): Y2 starts one gap after X, and the narrower Y is centred in the same band.
    if (Math.abs(Y2.x - (X.x + X.w) - DEF.rankGap) > EPS) bad.push(`LR: X→Y2 gap ${Y2.x - (X.x + X.w)}, want the rank gap`)
    if (Math.abs(Y.cx - Y2.cx) > EPS) bad.push(`LR: Y and Y2 share a rank but are centred ${Y.cx} vs ${Y2.cx}`)
    // And the rank after that starts one gap after Y2's right edge, not Y's.
    if (Math.abs(Z.x - (Y2.x + Y2.w) - DEF.rankGap) > EPS) bad.push(`LR: Z starts ${Z.x - (Y2.x + Y2.w)} after the widest of its predecessor's rank`)
    if (Math.abs(X.cy - Y.cy) > 200) bad.push('LR: X and Y are wildly apart across the flow')
    const tb = box(layout({ nodes, edges }, 'TB'), nodes)
    const tat = byId(tb)
    // In TB the thick dimension is HEIGHT: Y (120 tall) sets the rank, Y2 (30) is centred in it.
    if (Math.abs(tat.get('Y').cy - tat.get('Y2').cy) > EPS) bad.push('TB: Y and Y2 are not centred in their rank')
    if (Math.abs(tat.get('Z').y - (tat.get('Y').y + tat.get('Y').h) - DEF.rankGap) > EPS) bad.push(`TB: Z starts ${tat.get('Z').y - (tat.get('Y').y + tat.get('Y').h)} below the tallest of its predecessor's rank`)
    ok('flowchart.layout.6 LR uses width along the flow and height across it (rank thickness = the widest node, nodes centred in their rank, one rankGap between ranks); TB uses the heights', bad.length === 0, bad.join(' | '))
  }

  // ── 7. Determinism.
  {
    const g = varied(60, 100, 5, 0.1)
    const bad = []
    for (const dir of DIRS) if (!same(layout(g, dir), layout(g, dir))) bad.push(dir)
    // A structurally-equal but separately-built input must give the same answer too: nothing may hang off object identity.
    const clone = JSON.parse(JSON.stringify(g))
    if (!same(layout(g, 'TB'), layout(clone, 'TB'))) bad.push('cloned input')
    ok('flowchart.layout.7 the same input twice — and a deep copy of it — gives identical positions, size, reversed count and way points, in every direction', bad.length === 0, bad.join(','))
  }

  // ── 8. Components. Disconnected pieces are side by side across the flow, in first-node order, one componentGap apart.
  {
    const nodes = [nd('a1', 100, 60), nd('b1', 80, 40), nd('a2', 140, 50), nd('c1', 60, 60), nd('b2', 90, 70), nd('a3', 100, 60)]
    const edges = [ed('a1', 'a2'), ed('a1', 'a3'), ed('b1', 'b2')]
    const bad = []
    for (const dir of DIRS) {
      const res = layout({ nodes, edges }, dir)
      const at = byId(box(res, nodes))
      const span = (ids) => {
        const bs = ids.map((id) => at.get(id))
        const horizontalFlow = dir === 'TB' || dir === 'BT'
        return horizontalFlow ? [Math.min(...bs.map((b) => b.x)), Math.max(...bs.map((b) => b.x + b.w))] : [Math.min(...bs.map((b) => b.y)), Math.max(...bs.map((b) => b.y + b.h))]
      }
      const [a, b, c] = [span(['a1', 'a2', 'a3']), span(['b1', 'b2']), span(['c1'])]
      if (Math.abs(b[0] - a[1] - DEF.componentGap) > EPS) bad.push(`${dir}: a→b gap ${b[0] - a[1]}`)
      if (Math.abs(c[0] - b[1] - DEF.componentGap) > EPS) bad.push(`${dir}: b→c gap ${c[0] - b[1]}`)
      const hit = crowded(box(res, nodes), DEF.nodeGap / 2)
      if (hit) bad.push(`${dir}: ${hit}`)
    }
    const wide = layout({ nodes, edges }, 'TB', { componentGap: 200 })
    const wat = byId(box(wide, nodes))
    const gapBetween = Math.min(wat.get('b1').x, wat.get('b2').x) - Math.max(wat.get('a1').x + 100, wat.get('a2').x + 140, wat.get('a3').x + 100)
    if (Math.abs(gapBetween - 200) > EPS) bad.push(`componentGap option is not honoured (${gapBetween})`)
    ok('flowchart.layout.8 disconnected components sit side by side across the flow (TB left→right, LR top→bottom) in order of their first node, exactly componentGap apart, none overlapping', bad.length === 0, bad.join(' | '))
  }

  // ── 9. Isolated nodes are components of one — present, not dropped.
  {
    const nodes = [nd('lonely', 50, 50), nd('p'), nd('q'), nd('also-lonely', 70, 30)]
    const res = layout({ nodes, edges: [ed('p', 'q'), ed('p', 'ghost'), ed('nobody', 'q')] }, 'TB')
    const bad = nodes.filter((n) => !res.positions.has(n.id)).map((n) => n.id)
    const lonely = res.positions.get('lonely')
    const p = res.positions.get('p')
    ok('flowchart.layout.9 an isolated node is laid out (and the map holds exactly the input nodes), placed as its own component in input order', bad.length === 0 && res.positions.size === 4 && lonely && p && lonely.x < p.x && res.positions.get('also-lonely').x > p.x, JSON.stringify([...res.positions]))
  }

  // ── 10. Edges that cannot affect a layout are ignored: no throw, no change.
  {
    const g = varied(30, 45, 21, 0.1)
    const noisy = { nodes: g.nodes, edges: [...g.edges, ed('n3', 'missing'), ed('missing', 'n4'), ed('n5', 'n5'), ed(g.edges[0].from, g.edges[0].to), ed(g.edges[3].from, g.edges[3].to)] }
    const bad = []
    for (const dir of DIRS) {
      let a
      let b
      try { a = layout(g, dir); b = layout(noisy, dir) } catch (error) { bad.push(`${dir} threw ${error.message}`); continue }
      if (!same(a, b)) bad.push(`${dir}: junk edges changed the layout`)
    }
    ok('flowchart.layout.10 an edge with a missing endpoint, a self-loop and a duplicate (from,to) pair are ignored — no throw, and the layout is byte-identical to the one without them', bad.length === 0, bad.join(' | '))
  }

  // ── 11. Normalisation: (0,0) is the bounding box's top-left, and width/height are its size.
  {
    const g = varied(45, 70, 31, 0.1)
    g.nodes.push(nd('island', 90, 40), nd('islet', 30, 30))
    g.edges.push(ed('island', 'islet'))
    const bad = []
    for (const dir of DIRS) {
      const res = layout(g, dir)
      const boxes = box(res, g.nodes)
      const minX = Math.min(...boxes.map((b) => b.x))
      const minY = Math.min(...boxes.map((b) => b.y))
      const maxX = Math.max(...boxes.map((b) => b.x + b.w))
      const maxY = Math.max(...boxes.map((b) => b.y + b.h))
      if (Math.abs(minX) > EPS || Math.abs(minY) > EPS) bad.push(`${dir}: min (${minX}, ${minY})`)
      if (Math.abs(res.width - maxX) > EPS || Math.abs(res.height - maxY) > EPS) bad.push(`${dir}: size ${res.width}x${res.height} vs bbox ${maxX}x${maxY}`)
      if (boxes.some((b) => !Number.isFinite(b.x) || !Number.isFinite(b.y))) bad.push(`${dir}: a non-finite position`)
    }
    ok('flowchart.layout.11 positions are normalised — min x = min y = 0 — and width/height equal the nodes\' bounding box, in every direction, components and mirrored directions included', bad.length === 0, bad.join(' | '))
  }

  // ── 12–13. Speed. Best of five so a busy machine (other suites run beside this one) does not fail a check about the code; the numbers are printed.
  {
    const time = (g) => {
      const runs = []
      let last
      for (let i = 0; i < 5; i++) { const t = performance.now(); last = layout(g, 'TB'); runs.push(performance.now() - t) }
      runs.sort((a, b) => a - b)
      return { best: runs[0], median: runs[2], last }
    }
    const g200 = varied(200, 260, 41, 0.3)
    const t200 = time(g200)
    const c200 = crowded(box(t200.last, g200.nodes), DEF.nodeGap / 2)
    ok('flowchart.layout.12 200 nodes / 260 edges with cycles lay out in under 60 ms, without overlap', t200.median < 60 && !c200 && t200.last.reversed > 0, `best ${t200.best.toFixed(1)} ms, median ${t200.median.toFixed(1)} ms, reversed ${t200.last.reversed}${c200 ? `, overlap ${c200}` : ''}`)
    const g500 = varied(500, 700, 42, 0.3)
    const t500 = time(g500)
    const c500 = crowded(box(t500.last, g500.nodes), DEF.nodeGap / 2)
    ok('flowchart.layout.13 500 nodes / 700 edges with cycles lay out in under 300 ms, without overlap', t500.median < 300 && !c500 && t500.last.reversed > 0, `best ${t500.best.toFixed(1)} ms, median ${t500.median.toFixed(1)} ms, reversed ${t500.last.reversed}${c500 ? `, overlap ${c500}` : ''}`)
  }

  // ── 14. Nothing in, nothing out — and not a throw.
  {
    const bad = []
    for (const dir of DIRS) {
      const res = layout({ nodes: [], edges: [] }, dir)
      const stray = layout({ nodes: [], edges: [ed('a', 'b')] }, dir)
      if (res.positions.size !== 0 || res.width !== 0 || res.height !== 0 || res.reversed !== 0 || res.waypoints.length !== 0 || stray.positions.size !== 0) bad.push(dir)
    }
    ok('flowchart.layout.14 an empty input gives an empty position map, 0 x 0, nothing reversed (edges into nothing included)', bad.length === 0, bad.join(','))
  }

  // ── 15. Trees. The commonest flowchart: no crossings, and a parent sits over its children.
  {
    const nodes = []
    const edges = []
    const order = []
    for (let i = 1; i <= 15; i++) order.push(i)
    // Typed in a deliberately awkward order: the layout may not lean on the input being tidy.
    const typed = [8, 3, 12, 1, 14, 6, 9, 15, 2, 11, 5, 7, 13, 4, 10]
    for (const i of typed) nodes.push(nd(`t${i}`, 60 + (i % 4) * 30, 40))
    for (let i = 2; i <= 15; i++) edges.push(ed(`t${Math.floor(i / 2)}`, `t${i}`))
    const bad = []
    for (const dir of DIRS) {
      const boxes = box(layout({ nodes, edges }, dir), nodes)
      const at = byId(boxes)
      const c = crossings(dir, boxes, edges)
      if (c !== 0) bad.push(`${dir}: ${c} crossings`)
      for (let p = 1; p <= 7; p++) {
        const kids = [at.get(`t${2 * p}`), at.get(`t${2 * p + 1}`)].map((b) => across(dir, centreOf(b)))
        const mine = across(dir, centreOf(at.get(`t${p}`)))
        // Within 2 units of a child counts as ON it: the layout aligns a parent with a child where it can, and 2 units is not visible.
        if (mine < Math.min(...kids) - 2 || mine > Math.max(...kids) + 2) bad.push(`${dir}: t${p} is not between its children`)
      }
    }
    ok('flowchart.layout.15 a 15-node binary tree typed in scrambled order has 0 crossings and every parent between its two children, in every direction', bad.length === 0, bad.slice(0, 4).join(' | '))
  }

  // ── 16. Layering. A source that feeds only a deep node is pulled down to it, not left stretched at the top by a long edge.
  {
    const nodes = [nd('A'), nd('B'), nd('C'), nd('D'), nd('E')]
    const edges = [ed('A', 'B'), ed('B', 'C'), ed('C', 'D'), ed('E', 'D')]
    const res = layout({ nodes, edges }, 'TB')
    const at = byId(box(res, nodes))
    ok('flowchart.layout.16 a source feeding only a deep node is pulled down beside that node\'s other input (E shares C\'s rank, E→D is one rank long and needs no way point)',
      Math.abs(at.get('E').cy - at.get('C').cy) < EPS && res.waypoints.length === 0, `E.cy ${at.get('E').cy} C.cy ${at.get('C').cy}, way points ${res.waypoints.length}`)
  }

  // ── 17. Cycle breaking starts from the sources: the loop's tail, not its head, is what gets flipped.
  {
    // Typed B first: a DFS that begins at B would flip A→B and put the chain X→A→B upside down.
    const nodes = [nd('B'), nd('A'), nd('X')]
    const edges = [ed('X', 'A'), ed('A', 'B'), ed('B', 'A')]
    const res = layout({ nodes, edges }, 'TB')
    const at = byId(box(res, nodes))
    // Two loops and a plain DAG count what they flipped.
    const two = layout({ nodes: ['a', 'b', 'c', 'd', 'e'].map((id) => nd(id)), edges: [ed('a', 'b'), ed('b', 'c'), ed('c', 'a'), ed('d', 'e'), ed('e', 'd')] }, 'LR')
    const dag = layout(varied(30, 50, 7, 0), 'TB')
    ok('flowchart.layout.17 cycle breaking starts from the sources: X→A→B with a B→A retry reads X, A, B top to bottom with 1 edge reversed; two loops report 2; a DAG reports 0',
      res.reversed === 1 && at.get('X').cy < at.get('A').cy && at.get('A').cy < at.get('B').cy && two.reversed === 2 && dag.reversed === 0, `reversed ${res.reversed}/${two.reversed}/${dag.reversed}, cy X ${at.get('X').cy} A ${at.get('A').cy} B ${at.get('B').cy}`)
  }

  // ── 18. Options. The gaps are the person's to set; a default that silently wins is a silent failure.
  {
    const nodes = [nd('r', 100, 50), nd('s1', 100, 50), nd('s2', 100, 50), nd('t', 100, 50)]
    const edges = [ed('r', 's1'), ed('r', 's2'), ed('s1', 't'), ed('s2', 't')]
    const wide = box(layout({ nodes, edges }, 'TB', { rankGap: 150, nodeGap: 90 }), nodes)
    const at = byId(wide)
    const rankGap = at.get('s1').y - (at.get('r').y + at.get('r').h)
    const nodeGap = Math.abs(at.get('s2').x - at.get('s1').x) - 100
    const tight = byId(box(layout({ nodes, edges }, 'TB', { rankGap: 10, nodeGap: 5 }), nodes))
    const rankTight = tight.get('s1').y - (tight.get('r').y + tight.get('r').h)
    ok('flowchart.layout.18 rankGap and nodeGap are honoured exactly between ranks and between siblings (150/90 and 10/5)', Math.abs(rankGap - 150) < EPS && nodeGap >= 90 - EPS && Math.abs(rankTight - 10) < EPS && Math.abs(Math.abs(tight.get('s2').x - tight.get('s1').x) - 105) < EPS, `rank ${rankGap}/${rankTight}, node ${nodeGap}`)
  }

  // ── 19. The four directions are one layout, mapped. With square nodes: BT is TB mirrored down the page, LR is TB transposed, RL is LR mirrored across.
  {
    const g = varied(35, 58, 51, 0.1)
    g.nodes.forEach((n) => { n.w = 80; n.h = 80 })
    const tb = layout(g, 'TB')
    const bt = layout(g, 'BT')
    const lr = layout(g, 'LR')
    const rl = layout(g, 'RL')
    const bad = []
    for (const n of g.nodes) {
      const a = tb.positions.get(n.id)
      const b = bt.positions.get(n.id)
      const c = lr.positions.get(n.id)
      const d = rl.positions.get(n.id)
      if (Math.abs(b.x - a.x) > EPS || Math.abs(b.y - (tb.height - a.y - 80)) > EPS) bad.push(`BT ${n.id}`)
      if (Math.abs(c.x - a.y) > EPS || Math.abs(c.y - a.x) > EPS) bad.push(`LR ${n.id}`)
      if (Math.abs(d.x - (lr.width - c.x - 80)) > EPS || Math.abs(d.y - c.y) > EPS) bad.push(`RL ${n.id}`)
    }
    ok('flowchart.layout.19 for square nodes BT is TB mirrored over the rank axis only (left-to-right order kept), LR is TB with x and y exchanged, RL is LR mirrored over the rank axis', bad.length === 0 && tb.reversed === bt.reversed && lr.reversed === rl.reversed, bad.slice(0, 4).join(','))
  }

  // ── 20. Garbage in. A duplicate id, a NaN or negative size, a zero-size node: laid out, finite, never a throw.
  {
    const nodes = [nd('a', NaN, 40), nd('b', -20, Infinity), nd('a', 300, 300), nd('c', 0, 0), nd('d')]
    const edges = [ed('a', 'b'), ed('b', 'c'), ed('c', 'd'), ed('d', 'a'), ed('a', 'd')]
    const bad = []
    for (const dir of DIRS) {
      let res
      try { res = layout({ nodes, edges }, dir) } catch (error) { bad.push(`${dir} threw ${error.message}`); continue }
      if (res.positions.size !== 4) bad.push(`${dir}: ${res.positions.size} positions for 4 distinct ids`)
      for (const p of res.positions.values()) if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) bad.push(`${dir}: non-finite position`)
      if (!Number.isFinite(res.width) || !Number.isFinite(res.height)) bad.push(`${dir}: non-finite size`)
    }
    ok('flowchart.layout.20 a duplicate node id, NaN / negative / infinite sizes and zero-size nodes lay out to finite positions in every direction, never a throw', bad.length === 0, bad.slice(0, 3).join(' | '))
  }
}
