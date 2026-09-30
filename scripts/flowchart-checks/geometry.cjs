/* verify:flowchart — the geometry (src/shared/flowchart-geometry.ts) and the
   SVG text (src/shared/flowchart-svg.ts). Every property here fails SILENTLY:
   a connector routed through the shape it should avoid still draws, a port
   off the outline still attaches, an arrowhead pointing the wrong way still
   renders, an unescaped label still exports — until someone opens the file. */
const { performance } = require('node:perf_hooks')

module.exports = async function (ok, F) {
  const G = F.geometry ?? {}
  const S = F.svg ?? {}
  const R = F.record ?? {}
  const needG = ['shapeOutline', 'shapeDetail', 'portPoint', 'portNormal', 'pickPorts', 'routeConnector', 'arrowHead', 'trimForArrow', 'pointInShape', 'nearestPort', 'bounds']
  const missing = needG.filter((k) => typeof G[k] !== 'function')
  if (missing.length || typeof S.flowchartSvg !== 'function' || !Array.isArray(R.SHAPE_FORMS)) {
    ok('flowchart.geometry.0 the geometry and svg modules export their API', false, `missing: ${[...missing, typeof S.flowchartSvg === 'function' ? null : 'flowchartSvg'].filter(Boolean).join(',')}`)
    return
  }

  const FORMS = R.SHAPE_FORMS
  const SIZE = R.SHAPE_SIZE
  const PORTS = ['n', 'e', 's', 'w']
  const NUM = /-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/g
  const nums = (d) => (d.match(NUM) ?? []).map(Number)
  const close = (a, b, eps = 0.01) => Math.abs(a - b) <= eps
  const near = (p, q, eps = 0.01) => close(p.x, q.x, eps) && close(p.y, q.y, eps)
  const box = (x, y, w, h) => ({ x, y, w, h })
  const len = (a, b) => Math.hypot(b.x - a.x, b.y - a.y)
  const segsOf = (pts) => pts.slice(1).map((p, i) => [pts[i], p])

  /* An outline as a polyline: lines as they are, each curve as 64 chords.
     Absolute M/L/C/Q/Z only — the geometry writes nothing else, and a
     command this parser does not know is a failure, not a skip. */
  function flatten(d) {
    const toks = d.match(/[A-Za-z]|-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/g) ?? []
    const out = []
    let i = 0
    let cmd = null
    let cur = null
    let start = null
    const n = () => Number(toks[i++])
    while (i < toks.length) {
      if (/[A-Za-z]/.test(toks[i])) {
        cmd = toks[i++]
        if (!/[MLCQZ]/.test(cmd)) throw new Error(`unexpected command ${cmd}`)
        if (cmd === 'Z') { out.push([cur, start]); cur = start }
        continue
      }
      if (cmd === 'M') { cur = start = { x: n(), y: n() }; cmd = 'L'; continue }
      if (cmd === 'L') { const p = { x: n(), y: n() }; out.push([cur, p]); cur = p; continue }
      const ctl = cmd === 'C' ? [{ x: n(), y: n() }, { x: n(), y: n() }] : [{ x: n(), y: n() }]
      const p = { x: n(), y: n() }
      let prev = cur
      for (let k = 1; k <= 64; k++) {
        const t = k / 64
        const u = 1 - t
        const q = ctl.length === 2
          ? { x: u * u * u * cur.x + 3 * u * u * t * ctl[0].x + 3 * u * t * t * ctl[1].x + t * t * t * p.x, y: u * u * u * cur.y + 3 * u * u * t * ctl[0].y + 3 * u * t * t * ctl[1].y + t * t * t * p.y }
          : { x: u * u * cur.x + 2 * u * t * ctl[0].x + t * t * p.x, y: u * u * cur.y + 2 * u * t * ctl[0].y + t * t * p.y }
        out.push([prev, q])
        prev = q
      }
      cur = p
    }
    return out
  }
  const distToSeg = (p, [a, b]) => {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const l2 = dx * dx + dy * dy
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2))
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
  }
  const distToPath = (p, segs) => segs.reduce((m, s) => Math.min(m, distToSeg(p, s)), Infinity)
  /* An axis-aligned segment against a rect's interior, the rect grown by
     `grow` (negative shrinks). Touching the boundary is not a hit. */
  const hits = ([a, b], r, grow = 0) => {
    const l = r.x - grow
    const t = r.y - grow
    const rr = r.x + r.w + grow
    const bb = r.y + r.h + grow
    if (a.y === b.y) return a.y > t && a.y < bb && Math.max(a.x, b.x) > l && Math.min(a.x, b.x) < rr
    return a.x > l && a.x < rr && Math.max(a.y, b.y) > t && Math.min(a.y, b.y) < bb
  }
  const route = (fromBox, fromForm, fromPort, toBox, toForm, toPort, extra = {}) =>
    G.routeConnector({ from: { box: fromBox, form: fromForm, port: fromPort }, to: { box: toBox, form: toForm, port: toPort }, route: 'orthogonal', obstacles: [], ...extra })

  // ── outlines ──────────────────────────────────────────────────────────
  const sizes = []
  for (const f of FORMS) {
    sizes.push([f, SIZE[f].w, SIZE[f].h])
    for (const [w, h] of [[40, 120], [300, 40], [16, 16]]) sizes.push([f, w, h])
  }
  const badOutline = []
  for (const [f, w, h] of sizes) {
    const d = G.shapeOutline(f, w, h)
    if (f === 'text') { if (d !== '') badOutline.push(`${f} draws ${d}`); continue }
    const v = nums(d)
    const xs = v.filter((_, i) => i % 2 === 0)
    const ys = v.filter((_, i) => i % 2 === 1)
    const inside = v.length % 2 === 0 && xs.every((x) => x >= -0.5 && x <= w + 0.5) && ys.every((y) => y >= -0.5 && y <= h + 0.5)
    // A junction is a circle in the box's shorter side; everything else reaches all four sides.
    const m = Math.min(w, h)
    const [ex0, ex1, ey0, ey1] = f === 'junction' ? [(w - m) / 2, (w + m) / 2, (h - m) / 2, (h + m) / 2] : [0, w, 0, h]
    const fills = close(Math.min(...xs), ex0, 0.5) && close(Math.max(...xs), ex1, 0.5) && close(Math.min(...ys), ey0, 0.5) && close(Math.max(...ys), ey1, 0.5)
    if (!/^M [^A-Za-z]+ /.test(d) || !d.endsWith('Z') || /[^MLCZ0-9 .,e-]/.test(d) || !inside || !fills) badOutline.push(`${f} ${w}x${h}: ${d}`)
  }
  ok('flowchart.geometry.1 every form\'s outline is a closed M/L/C path with every number inside its box, reaching the box\'s sides (text draws none) — an outline that leaks or shrinks draws, and looks almost right',
    badOutline.length === 0, badOutline.slice(0, 3).join(' | '))

  const detail = G.shapeDetail('subprocess', 176, 72)
  ok('flowchart.geometry.2 a subprocess carries its two inner bars at x = 10 and w − 10, full height; no other form carries any',
    detail !== '' && JSON.stringify(nums(detail)) === JSON.stringify([10, 0, 10, 72, 166, 0, 166, 72]) && FORMS.filter((f) => f !== 'subprocess').every((f) => G.shapeDetail(f, 160, 72) === ''), detail)

  // ── ports ─────────────────────────────────────────────────────────────
  const offPorts = []
  for (const [f, w, h] of sizes) {
    if (f === 'text') continue
    const b = box(100, 50, w, h)
    const segs = flatten(G.shapeOutline(f, w, h)).map(([a, c]) => [{ x: a.x + 100, y: a.y + 50 }, { x: c.x + 100, y: c.y + 50 }])
    for (const p of PORTS) {
      const q = G.portPoint(f, b, p)
      const dd = distToPath(q, segs)
      if (dd > 0.6) offPorts.push(`${f} ${w}x${h} ${p} is ${dd.toFixed(2)} off`)
    }
  }
  const dec = box(0, 0, 168, 104)
  const decOk = near(G.portPoint('decision', dec, 'n'), { x: 84, y: 0 }) && near(G.portPoint('decision', dec, 'e'), { x: 168, y: 52 }) && near(G.portPoint('decision', dec, 's'), { x: 84, y: 104 }) && near(G.portPoint('decision', dec, 'w'), { x: 0, y: 52 })
  const io = box(0, 0, 176, 72)
  const ioE = G.portPoint('io', io, 'e')
  const jn = G.portPoint('junction', box(0, 0, 60, 28), 'e')
  const normalsOk = PORTS.every((p) => {
    const nv = G.portNormal(p)
    const out = G.portPoint(null, box(0, 0, 100, 60), p)
    return close(Math.hypot(nv.x, nv.y), 1) && !G.pointInShape(null, box(0, 0, 100, 60), { x: out.x + nv.x, y: out.y + nv.y })
  })
  ok('flowchart.geometry.3 every port lies ON its outline (decision vertices, io\'s slanted sides, the junction\'s circle, the document\'s wave), and every normal is a unit vector pointing out — a port on the bounding box leaves arrows floating beside the shape',
    offPorts.length === 0 && decOk && ioE.x < 176 - 1 && close(ioE.y, 36) && close(jn.x, 44) && normalsOk,
    offPorts.slice(0, 3).join(' | ') || JSON.stringify({ decOk, ioE, jn, normalsOk }))

  const A = box(0, 0, 160, 72)
  const pp = (b) => G.pickPorts({ box: A, form: 'process' }, { box: b, form: 'process' })
  const facing = [[box(0, 200, 160, 72), 's', 'n'], [box(400, 0, 160, 72), 'e', 'w'], [box(-400, 10, 160, 72), 'w', 'e'], [box(20, -300, 160, 72), 'n', 's']]
  ok('flowchart.geometry.4 auto ports face each other: below → s/n, right → e/w, left → w/e, above → n/s',
    facing.every(([b, f, t]) => { const r = pp(b); return r.from === f && r.to === t }), JSON.stringify(facing.map(([b]) => pp(b))))

  const fixed = G.pickPorts({ box: A, form: 'process', port: 'e' }, { box: box(0, 300, 160, 72), form: 'process', port: 'e' })
  const half = G.pickPorts({ box: A, form: 'decision', port: 'w' }, { box: box(0, 300, 160, 72), form: 'process' })
  const tie = G.pickPorts({ box: box(0, 0, 100, 100), form: null }, { box: box(200, 200, 100, 100), form: null })
  // Centres say "right" (dx 240 > dy 40); the gap says "below" — the wide shape is directly under the narrow one.
  const wide = G.pickPorts({ box: box(0, 0, 20, 20), form: 'junction' }, { box: box(-100, 30, 700, 40), form: 'process' })
  ok('flowchart.geometry.5 a fixed port is kept as set (one end fixed, the other still chosen); a perfect diagonal goes vertical; a wide shape just below a narrow one connects straight down, not out of a side',
    fixed.from === 'e' && fixed.to === 'e' && half.from === 'w' && half.to === 'n' && tie.from === 's' && tie.to === 'n' && wide.from === 's' && wide.to === 'n',
    JSON.stringify({ fixed, half, tie, wide }))

  // ── orthogonal routes ─────────────────────────────────────────────────
  const N = { n: { x: 0, y: -1 }, e: { x: 1, y: 0 }, s: { x: 0, y: 1 }, w: { x: -1, y: 0 } }
  const OPP = { n: 's', s: 'n', e: 'w', w: 'e' }
  const dirOf = ([a, b]) => ({ x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) })
  const badShape = []
  let routes = 0
  for (const dx of [-400, -150, 0, 60, 150, 400]) {
    for (const dy of [-300, -100, 0, 40, 100, 300]) {
      const B = box(dx, dy, 160, 72)
      if (Math.abs(dx) < 160 && Math.abs(dy) < 72) continue
      for (const fp of PORTS) {
        for (const tp of PORTS) {
          routes++
          const r = route(A, 'process', fp, B, 'process', tp)
          const pts = r.points
          const segs = segsOf(pts)
          const why = []
          if (!near(pts[0], G.portPoint('process', A, fp)) || !near(pts[pts.length - 1], G.portPoint('process', B, tp))) why.push('ends off the ports')
          if (!segs.every(([a, b]) => a.x === b.x || a.y === b.y)) why.push('diagonal segment')
          if (!segs.every(([a, b]) => len(a, b) > 0)) why.push('zero-length segment')
          if (pts.some((p, i) => i > 0 && i < pts.length - 1 && ((pts[i - 1].x === p.x && p.x === pts[i + 1].x) || (pts[i - 1].y === p.y && p.y === pts[i + 1].y)))) why.push('collinear point kept')
          const d0 = dirOf(segs[0])
          const d1 = dirOf(segs[segs.length - 1])
          if (d0.x !== N[fp].x || d0.y !== N[fp].y) why.push(`leaves ${fp} going ${JSON.stringify(d0)}`)
          if (d1.x !== -N[tp].x || d1.y !== -N[tp].y) why.push(`arrives at ${tp} going ${JSON.stringify(d1)}`)
          // The stub: a full 16 before the first turn, unless the ports face each other across a gap under two stubs.
          const gap = fp === 'e' ? B.x - 160 : fp === 'w' ? -(B.x + 160) : fp === 's' ? B.y - 72 : -(B.y + 72)
          const squeezed = OPP[fp] === tp && gap < 32
          if (!squeezed && segs.length > 1 && (len(...segs[0]) < 16 - 1e-6 || len(...segs[segs.length - 1]) < 16 - 1e-6)) why.push('turns inside the stub')
          if (segs.some((s) => hits(s, A, -0.5) || hits(s, B, -0.5))) why.push('passes through an endpoint')
          if (why.length) badShape.push(`${dx},${dy} ${fp}->${tp}: ${why.join(', ')} ${JSON.stringify(pts)}`)
        }
      }
    }
  }
  ok(`flowchart.geometry.6 across ${routes} routes (every port pair, every relative position): ends on the ports, axis-aligned, no zero-length or collinear points, leaves along the source normal after a full stub, arrives INTO the target along its normal, never through either endpoint`,
    badShape.length === 0, `${badShape.length} bad; ${badShape.slice(0, 2).join(' | ')}`)

  const stacked = route(A, 'process', 's', box(0, 200, 160, 72), 'process', 'n')
  const stackedDec = route(A, 'process', 's', box(-4, 200, 168, 104), 'decision', 'n')
  ok('flowchart.geometry.7 vertically aligned shapes join with exactly one straight segment (two points), a decision under a process included',
    stacked.points.length === 2 && stacked.points[0].x === 80 && stacked.points[1].x === 80 && stackedDec.points.length === 2, JSON.stringify([stacked.points, stackedDec.points]))

  const zv = route(A, 'process', 's', box(200, 250, 160, 72), 'process', 'n')
  const zh = route(A, 'process', 'e', box(400, 150, 160, 72), 'process', 'w')
  ok('flowchart.geometry.8 offset shapes join with a clean Z whose jog is midway across the gap (y = 161 between 72 and 250; x = 280 between 160 and 400), its two corners rounded',
    zv.points.length === 4 && zv.points[1].y === 161 && zv.points[2].y === 161 && zh.points.length === 4 && zh.points[1].x === 280 &&
      (zv.d.match(/ Q /g) ?? []).length === 2, JSON.stringify({ zv: zv.points, zh: zh.points, d: zv.d }))

  const top = box(0, 0, 160, 72)
  const mid = box(0, 180, 160, 72)
  const bot = box(0, 360, 160, 72)
  const wideMid = box(-200, 180, 560, 72)
  const around = [
    route(top, 'process', 's', bot, 'process', 'n', { obstacles: [mid] }),
    route(top, 'process', 's', bot, 'process', 'n', { obstacles: [wideMid] }),
    route(box(0, 0, 160, 72), 'process', 'e', box(600, 30, 160, 72), 'process', 'w', { obstacles: [box(300, -20, 160, 140)] })
  ]
  const blockers = [mid, wideMid, box(300, -20, 160, 140)]
  const ends = [[top, bot], [top, bot], [box(0, 0, 160, 72), box(600, 30, 160, 72)]]
  const throughs = around.map((r, i) => segsOf(r.points).some((s) => hits(s, blockers[i], 12 - 0.5) || hits(s, ends[i][0], -0.5) || hits(s, ends[i][1], -0.5)))
  ok('flowchart.geometry.9 a shape standing between the two ends is routed AROUND, keeping its 12-unit margin, and the route never cuts back through either endpoint',
    throughs.every((t) => !t), JSON.stringify(around.map((r) => r.points)))

  const ue = route(box(0, 0, 160, 72), 'process', 'e', box(300, 0, 160, 72), 'process', 'e')
  const uio = route(box(0, 0, 176, 72), 'io', 'e', box(300, 0, 160, 72), 'process', 'e')
  const uOk = (r, B) => r.points.length >= 5 && Math.max(...r.points.map((p) => p.x)) >= B.x + B.w + 16 && close(r.endAngle, Math.PI) &&
    !segsOf(r.points).some((s) => hits(s, B, -0.5))
  ok('flowchart.geometry.10 e → e is a U round the target\'s far side (from an io too, whose port sits inside its box), arriving leftwards into the port',
    uOk(ue, box(300, 0, 160, 72)) && uOk(uio, box(300, 0, 160, 72)), JSON.stringify([ue.points, uio.points]))

  const obs = [box(300, -20, 160, 140), box(250, 200, 80, 60), box(100, -200, 60, 60)]
  const input = { from: { box: box(0, 0, 160, 72), form: 'process', port: 'e' }, to: { box: box(600, 30, 160, 72), form: 'decision', port: 'w' }, route: 'orthogonal', obstacles: obs, ends: 'end' }
  const r1 = JSON.stringify(G.routeConnector(input))
  G.routeConnector({ ...input, from: { ...input.from, box: box(-900, -700, 160, 72) }, obstacles: Array.from({ length: 40 }, (_, i) => box((i % 8) * 200 - 800, Math.floor(i / 8) * 150 - 600, 160, 72)) })
  const r2 = JSON.stringify(G.routeConnector(input))
  const r3 = JSON.stringify(G.routeConnector({ ...input, obstacles: [...obs].reverse() }))
  // And a route crowded enough to take its obstacles lazily: the set it grows must not depend on their order either.
  const crowd = Array.from({ length: 120 }, (_, k) => box((k % 15) * 230 + ((k * 37) % 23), Math.floor(k / 15) * 160 + ((k * 53) % 29), 150, 70))
  const far = { from: { box: box(-300, -300, 160, 72), form: 'process', port: 'e' }, to: { box: box(3600, 1400, 160, 72), form: 'process', port: 'w' }, route: 'orthogonal', obstacles: crowd }
  const l1 = JSON.stringify(G.routeConnector(far))
  const l2 = JSON.stringify(G.routeConnector({ ...far, obstacles: [...crowd].reverse() }))
  ok('flowchart.geometry.11 routing is deterministic: the same input twice (with a bigger route between — the reused scratch buffers leak nothing) and the obstacles in another order give byte-identical routes, a crowded long route included; a z-order change must not make a line twitch',
    r1 === r2 && r1 === r3 && l1 === l2, r1 !== r2 ? 'differs after another route' : r1 !== r3 || l1 !== l2 ? 'order-dependent' : '')

  const down = G.routeConnector({ from: { box: A, form: 'process', port: 's' }, to: { box: box(0, 200, 160, 72), form: 'process', port: 'n' }, route: 'straight', obstacles: [] })
  const right = route(A, 'process', 'e', box(400, 150, 160, 72), 'process', 'w')
  const curvedDown = G.routeConnector({ from: { box: A, form: 'process', port: 'e' }, to: { box: box(300, 200, 160, 72), form: 'process', port: 'n' }, route: 'curved', obstacles: [] })
  ok('flowchart.geometry.12 the angles are the direction of travel INTO each end: an arrow into a target below points down (+π/2) and its start head points up into the source; into a w port points +x; a curve enters n square to the side',
    close(down.endAngle, Math.PI / 2) && close(down.startAngle, -Math.PI / 2) && close(stacked.endAngle, Math.PI / 2) &&
      close(right.endAngle, 0) && close(Math.abs(right.startAngle), Math.PI) && close(curvedDown.endAngle, Math.PI / 2) && close(Math.abs(curvedDown.startAngle), Math.PI),
    JSON.stringify({ down: [down.startAngle, down.endAngle], right: [right.startAngle, right.endAngle], curved: [curvedDown.startAngle, curvedDown.endAngle] }))

  const onPolyline = (r) => {
    const segs = segsOf(r.points)
    const total = segs.reduce((m, [a, b]) => m + len(a, b), 0)
    let walked = 0
    for (const [a, b] of segs) {
      if (distToSeg(r.labelAt, [a, b]) < 0.01) return close(walked + len(a, r.labelAt), total / 2, 0.5)
      walked += len(a, b)
    }
    return false
  }
  const [c0, c1, c2, c3] = curvedDown.points
  const bez = (t) => { const u = 1 - t; return { x: u * u * u * c0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * c3.x, y: u * u * u * c0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * c3.y } }
  const fine = Array.from({ length: 2001 }, (_, i) => bez(i / 2000))
  const arcs = fine.slice(1).map((p, i) => len(fine[i], p))
  const arcTotal = arcs.reduce((a, b) => a + b, 0)
  let at = 0
  let bestI = 0
  fine.forEach((p, i) => { if (len(p, curvedDown.labelAt) < len(fine[bestI], curvedDown.labelAt)) bestI = i })
  for (let i = 0; i < bestI; i++) at += arcs[i]
  ok('flowchart.geometry.13 the label sits ON the path at half its LENGTH — along the polyline for a Z and a U, and on an asymmetric curve (where t = 0.5 is not the middle)',
    onPolyline(zv) && onPolyline(ue) && onPolyline(right) && len(fine[bestI], curvedDown.labelAt) < 1 && Math.abs(at / arcTotal - 0.5) < 0.02,
    JSON.stringify({ zv: zv.labelAt, curved: curvedDown.labelAt, frac: at / arcTotal }))

  // Vertical fixtures: pushing along the SEGMENT instead of the port normal is indistinguishable on a horizontal pair.
  const curveCase = (gapY) => {
    const B = box(0, 72 + gapY, 160, 72)
    const r = G.routeConnector({ from: { box: A, form: 'process', port: 's' }, to: { box: B, form: 'process', port: 'n' }, route: 'curved', obstacles: [] })
    const off = Math.min(160, Math.max(24, 0.4 * gapY))
    return r.points.length === 4 && near(r.points[1], { x: 80, y: 72 + off }) && near(r.points[2], { x: 80, y: 72 + gapY - off }) && / C /.test(r.d)
  }
  ok('flowchart.geometry.14 a curved connector\'s control points are pushed along each PORT NORMAL by clamp(0.4 × distance, 24, 160) — link-geometry\'s constants, so a curved connector reads like a panel link beside it (near, middle and far all checked)',
    curveCase(30) && curveCase(200) && curveCase(1000))

  const heads = [0, Math.PI / 2, 2.3, -1].map((ang) => {
    const tip = { x: 37.5, y: -12.25 }
    const v = nums(G.arrowHead(tip, ang, 10))
    const base = { x: (v[2] + v[4]) / 2, y: (v[3] + v[5]) / 2 }
    return v.length === 6 && close(v[0], tip.x) && close(v[1], tip.y) && close(base.x, tip.x - 10 * Math.cos(ang), 0.02) && close(base.y, tip.y - 10 * Math.sin(ang), 0.02) &&
      close(len({ x: v[2], y: v[3] }, { x: v[4], y: v[5] }), 9, 0.03) && G.arrowHead(tip, ang, 10).endsWith('Z')
  })
  ok('flowchart.geometry.15 an arrowhead is a closed triangle whose tip is exactly the point given, its base 10 behind along the angle and 9 wide',
    heads.every(Boolean), JSON.stringify(heads))

  const lastPair = (d) => { const v = nums(d); return { x: v[v.length - 2], y: v[v.length - 1] } }
  const firstPair = (d) => { const v = nums(d); return { x: v[0], y: v[1] } }
  const zEnd = route(A, 'process', 's', box(200, 250, 160, 72), 'process', 'n', { ends: 'end' })
  const zBoth = route(A, 'process', 's', box(200, 250, 160, 72), 'process', 'n', { ends: 'both' })
  const zNone = route(A, 'process', 's', box(200, 250, 160, 72), 'process', 'n', { ends: 'none' })
  const cEnd = G.routeConnector({ from: { box: A, form: 'process', port: 's' }, to: { box: box(0, 300, 160, 72), form: 'process', port: 'n' }, route: 'curved', obstacles: [], ends: 'end' })
  const trimmed = G.trimForArrow(zNone.points, 'orthogonal', 'end', 10)
  ok('flowchart.geometry.16 under an arrowhead the STROKE ends 0.6 × size back along the last segment, so a round cap cannot poke through the tip; `points` stay the true geometry; no head, no trim; trimForArrow agrees',
    near(lastPair(zEnd.d), { x: 280, y: 244 }) && near(zEnd.points[zEnd.points.length - 1], { x: 280, y: 250 }) && near(firstPair(zBoth.d), { x: 80, y: 78 }) &&
      near(lastPair(zNone.d), { x: 280, y: 250 }) && near(firstPair(zNone.d), { x: 80, y: 72 }) && near(lastPair(cEnd.d), { x: 80, y: 294 }) &&
      near(trimmed[trimmed.length - 1], { x: 280, y: 244 }) && near(zNone.points[zNone.points.length - 1], { x: 280, y: 250 }),
    JSON.stringify({ end: lastPair(zEnd.d), both: firstPair(zBoth.d), curved: lastPair(cEnd.d) }))

  const inS = G.pointInShape
  ok('flowchart.geometry.17 a hit is on the outline\'s interior: a diamond\'s empty corner, a stadium\'s corner, an io\'s cut corners and a junction\'s corner miss; their centres and a rect\'s corner hit',
    inS('decision', dec, { x: 84, y: 52 }) && !inS('decision', dec, { x: 8, y: 8 }) && !inS('decision', dec, { x: 160, y: 96 }) && inS('decision', dec, { x: 84, y: 2 }) &&
      !inS('terminator', box(0, 0, 160, 60), { x: 3, y: 3 }) && inS('terminator', box(0, 0, 160, 60), { x: 2, y: 30 }) &&
      !inS('io', io, { x: 2, y: 2 }) && !inS('io', io, { x: 174, y: 70 }) && inS('io', io, { x: 88, y: 36 }) &&
      !inS('junction', box(0, 0, 28, 28), { x: 2, y: 2 }) && inS('junction', box(0, 0, 28, 28), { x: 14, y: 14 }) &&
      inS(null, box(0, 0, 100, 60), { x: 1, y: 1 }) && inS('text', box(0, 0, 100, 60), { x: 1, y: 1 }) && !inS('process', box(0, 0, 100, 60), { x: 101, y: 30 }))

  ok('flowchart.geometry.18 a drop attaches to the nearest port: below a decision → s, beside it → e, above-left of centre → n; an io\'s slanted left side → w',
    G.nearestPort('decision', dec, { x: 90, y: 130 }) === 's' && G.nearestPort('decision', dec, { x: 200, y: 60 }) === 'e' &&
      G.nearestPort('decision', dec, { x: 60, y: 10 }) === 'n' && G.nearestPort('io', io, { x: 10, y: 40 }) === 'w')

  const bb = G.bounds([box(10, 20, 30, 40), box(-5, 50, 10, 100)])
  const b0 = G.bounds([])
  ok('flowchart.geometry.19 bounds covers every box; empty gives a zero box at the origin, never Infinity (which would poison a viewBox)',
    bb.x === -5 && bb.y === 20 && bb.w === 45 && bb.h === 130 && b0.x === 0 && b0.y === 0 && b0.w === 0 && b0.h === 0, JSON.stringify({ bb, b0 }))

  const st = G.routeConnector({ from: { box: io, form: 'io', port: 'e' }, to: { box: box(400, 100, 160, 72), form: 'process', port: 'w' }, route: 'straight', obstacles: [box(250, 0, 50, 300)] })
  ok('flowchart.geometry.20 a straight route is exactly port to port — "M … L …", starting on the io\'s slanted side, ignoring obstacles by definition',
    st.points.length === 2 && near(st.points[0], G.portPoint('io', io, 'e')) && near(st.points[1], { x: 400, y: 136 }) && /^M [\d.-]+ [\d.-]+ L [\d.-]+ [\d.-]+$/.test(st.d) &&
      near(st.labelAt, { x: (st.points[0].x + 400) / 2, y: (36 + 136) / 2 }), st.d)

  // ── performance: a 200-shape chart, 260 connectors ────────────────────
  const COLS = 20
  const ROWS = 10
  const chart = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const form = FORMS[(r * COLS + c) % FORMS.length]
      const { w, h } = SIZE[form]
      chart.push({ form, box: box(c * 240 + (200 - w) / 2, r * 170 + (110 - h) / 2, w, h) })
    }
  }
  const at2 = (r, c) => r * COLS + c
  const pairs = []
  for (let r = 0; r + 1 < ROWS; r++) for (let c = 0; c < COLS; c++) pairs.push([at2(r, c), at2(r + 1, c), 'down'])
  for (let r = 0; r < ROWS; r++) for (const c of [0, 3, 6, 9, 12, 15, 18]) pairs.push([at2(r, c), at2(r, c + 1), 'side'])
  // Loop-backs: bottom row to top row of the same column — round the eight shapes between. A flowchart's retry arrow.
  for (let c = 0; c < 10; c++) pairs.push([at2(ROWS - 1, c * 2), at2(0, c * 2), 'loop'])
  const inputs = pairs.map(([i, j, kind]) => {
    const a = chart[i]
    const b = chart[j]
    const ports = kind === 'loop' ? { from: 'e', to: 'e' } : G.pickPorts({ box: a.box, form: a.form }, { box: b.box, form: b.form })
    return { kind, i, j, input: { from: { box: a.box, form: a.form, port: ports.from }, to: { box: b.box, form: b.form, port: ports.to }, route: 'orthogonal', obstacles: chart.filter((_, k) => k !== i && k !== j).map((s) => s.box), ends: 'end' } }
  })
  // Warm the JIT on a few, as a running canvas has long since done.
  for (const x of inputs.slice(0, 20)) G.routeConnector(x.input)
  const times = []
  const results = []
  const t0 = performance.now()
  for (const x of inputs) {
    const s = performance.now()
    results.push(G.routeConnector(x.input))
    times.push(performance.now() - s)
  }
  const total = performance.now() - t0
  const sorted = [...times].sort((a, b) => a - b)
  const loopMax = Math.max(...times.filter((_, k) => inputs[k].kind === 'loop'))
  const fmt = (v) => v.toFixed(3)
  ok(`flowchart.geometry.21 ${inputs.length} connectors among ${chart.length} shapes route in under 250 ms total with no single route over 10 ms — a drag re-routes a shape's connectors every frame`,
    inputs.length === 260 && chart.length === 200 && total < 250 && sorted[sorted.length - 1] < 10,
    `total ${fmt(total)} ms, median ${fmt(sorted[130])} ms, p95 ${fmt(sorted[Math.floor(sorted.length * 0.95)])} ms, max ${fmt(sorted[sorted.length - 1])} ms (loop-back max ${fmt(loopMax)} ms)`)

  const crossing = []
  results.forEach((r, k) => {
    const { i, j } = inputs[k]
    const segs = segsOf(r.points)
    if (!segs.every(([a, b]) => a.x === b.x || a.y === b.y)) crossing.push(`${k} diagonal`)
    chart.forEach((s, m) => {
      // An endpoint's own port segment is exempt: a document's s port sits on
      // its wave and an io's e/w on its slanted sides, inside the box.
      // geometry.6 already pins which way that segment leaves.
      const own = m === i ? segs.slice(1) : m === j ? segs.slice(0, -1) : segs
      if (own.some((sg) => hits(sg, s.box, m === i || m === j ? -0.5 : 0))) crossing.push(`${inputs[k].kind} ${i}->${j} crosses shape ${m}`)
    })
  })
  // Long hops across an UNALIGNED copy (every shape nudged up to ±30): with
  // hundreds of distinct lines between the ends the router takes obstacles
  // in lazily, and a shape it never looked at is the one a route would cut.
  let seed = 7
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
  const jittered = chart.map((s) => ({ form: s.form, box: box(s.box.x + (rnd() - 0.5) * 60, s.box.y + (rnd() - 0.5) * 60, s.box.w, s.box.h) }))
  const hopTimes = []
  for (let n = 0; n < 24; n++) {
    const i = Math.floor(rnd() * 200)
    const j = (i + 37 + Math.floor(rnd() * 120)) % 200
    const a = jittered[i]
    const b = jittered[j]
    const p = G.pickPorts({ box: a.box, form: a.form }, { box: b.box, form: b.form })
    const s0 = performance.now()
    const r = G.routeConnector({ from: { box: a.box, form: a.form, port: p.from }, to: { box: b.box, form: b.form, port: p.to }, route: 'orthogonal', obstacles: jittered.filter((_, k) => k !== i && k !== j).map((s) => s.box) })
    hopTimes.push(performance.now() - s0)
    const segs = segsOf(r.points)
    jittered.forEach((s, m) => {
      const own = m === i ? segs.slice(1) : m === j ? segs.slice(0, -1) : segs
      if (own.some((sg) => hits(sg, s.box, m === i || m === j ? -0.5 : 0))) crossing.push(`long hop ${i}->${j} crosses shape ${m}`)
    })
  }
  ok('flowchart.geometry.22 on that dense chart no route crosses any shape — loop-backs round a whole column, and long hops across an unaligned copy (where obstacles join lazily) included — the router\'s one job, and the failure that still draws',
    crossing.length === 0, crossing.slice(0, 3).join(' | ') || `long hops: max ${Math.max(...hopTimes).toFixed(3)} ms`)

  // ── SVG ───────────────────────────────────────────────────────────────
  const colours = {
    fill: { plain: '#f6f6f4', none: 'none', yellow: '#fff3b0', blue: '#dbeafe', green: '#dcfce7', pink: '#fce7f3' },
    stroke: { line: '#8a8a8a', ink: '#1f1f1f', iris: '#5b5bd6', violet: 'rgb(1, 2, 3)', none: 'none' },
    ink: { fg: '#111111', muted: '#777777' },
    background: '#fafaf9',
    line: 'rgb(9, 8, 7)'
  }
  const XSS = '<script>alert(1)</script>'
  const shapes = FORMS.map((form, i) => ({ id: `p${i}`, box: box(i * 240, (i % 2) * 180, SIZE[form].w, SIZE[form].h), shape: { form, text: '' } }))
  // Wide enough that the unbroken tag is not hard-wrapped mid-token, so the escaped form is findable whole.
  shapes[0].box = box(0, 0, 300, 72)
  shapes[0].shape.text = XSS
  shapes[1].shape.text = 'Tom & Jerry\'s "plan"'
  shapes[2].shape.text = 'one\ntwo\nthree'
  shapes[3].shape.text = 'a label long enough that it has to wrap inside its shape rather than run out of it'
  shapes[4].shape.text = 'nul\u0000here\uD800lone'
  shapes[5].shape = { form: shapes[5].shape.form, text: 'styled', fill: 'blue', stroke: 'iris', ink: 'muted' }
  const panel = { box: box(0, 500, 480, 300), title: 'zsh — "~/src" <b>' }
  const conn = (i, j, extra) => ({ fromBox: shapes[i].box, fromForm: shapes[i].shape.form, toBox: shapes[j].box, toForm: shapes[j].shape.form, connector: { id: `cx${i}${j}`, to: shapes[j].id, ...extra }, obstacles: shapes.filter((_, k) => k !== i && k !== j).map((s) => s.box) })
  const model = {
    shapes,
    connectors: [
      conn(0, 1, { label: XSS }),
      conn(1, 2, { route: 'curved', ends: 'both', stroke: 'violet' }),
      conn(2, 3, { route: 'straight', ends: 'start', dashed: true }),
      conn(3, 4, { ends: 'none', label: 'yes\nand no' }),
      conn(0, 6, {}),
      { fromBox: panel.box, fromForm: null, toBox: shapes[0].box, toForm: 'process', connector: { id: 'cx9', to: 'p0' }, obstacles: shapes.slice(1).map((s) => s.box) }
    ],
    panels: [panel]
  }
  const svg = S.flowchartSvg(model, colours, { title: 'Chart <one> & "two"' })
  const vb = (svg.match(/viewBox="([^"]+)"/) ?? [])[1]
  const vbn = vb ? vb.split(' ').map(Number) : []
  const count = (re) => (svg.match(re) ?? []).length
  ok('flowchart.svg.1 the export is a well-formed standalone document: <svg xmlns=…> with a numeric viewBox, balanced <g>/<text>/<tspan>, no stray < or bare &, and each shape\'s outline is the geometry\'s own path verbatim',
    svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" ') && svg.trimEnd().endsWith('</svg>') && vbn.length === 4 && vbn.every(Number.isFinite) &&
      count(/<g[ >]/g) === count(/<\/g>/g) && count(/<text[ >]/g) === count(/<\/text>/g) && count(/<tspan[ >]/g) === count(/<\/tspan>/g) &&
      !/<(?![A-Za-z/])/.test(svg) && !/&(?!(amp|lt|gt|quot|#39);)/.test(svg) &&
      shapes.filter((s) => s.shape.form !== 'text').every((s) => svg.includes(`d="${G.shapeOutline(s.shape.form, s.box.w, s.box.h)}"`)),
    vb)

  ok('flowchart.svg.2 every authored string is escaped — a shape label, a connector label, a panel title and the title — so <script> and quotes arrive as text, never markup',
    !svg.includes('<script') && count(/&lt;script&gt;alert\(1\)&lt;\/script&gt;/g) === 2 && svg.includes('>Tom &amp; Jerry&#39;s<') && svg.includes('>&quot;plan&quot;<') &&
      svg.includes('&lt;b&gt;') && svg.includes('<title>Chart &lt;one&gt; &amp; &quot;two&quot;</title>'))

  ok('flowchart.svg.3 the export carries no <script>, no <foreignObject>, no href of any kind, no <image> and no data: or url() — the canvas PNG stays the ONE binary export (D6)',
    !/<script|foreignObject|href|<image|data:|url\(/i.test(svg))

  const textOf = (id) => {
    const at = svg.indexOf(`d="${G.shapeOutline(shapes[id].shape.form, shapes[id].box.w, shapes[id].box.h)}"`)
    const from = svg.lastIndexOf('<g transform', at)
    return svg.slice(from, svg.indexOf('</g>', at))
  }
  const threeLines = (textOf(2).match(/<tspan/g) ?? []).length
  const wrapped = (textOf(3).match(/<tspan[^>]*>([^<]*)<\/tspan>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, ''))
  const maxChars = Math.floor((SIZE[shapes[3].shape.form].w - 2 * G.ioSkew(SIZE.io.w, SIZE.io.h) - 12) / (14 * 0.56))
  ok('flowchart.svg.4 a multi-line label is one <tspan> per line, and a long line wraps inside its shape instead of running out of it',
    threeLines === 3 && wrapped.length >= 3 && wrapped.every((l) => l.length <= Math.max(maxChars, 1)) && shapes[3].shape.form === 'io',
    JSON.stringify({ threeLines, wrapped }))

  const violetStroke = svg.includes('stroke="rgb(1, 2, 3)"') && count(/fill="rgb\(1, 2, 3\)"/g) === 2
  const byRoute = model.connectors.every((c) => {
    const p = G.pickPorts({ box: c.fromBox, form: c.fromForm, port: c.connector.from }, { box: c.toBox, form: c.toForm, port: c.connector.toPort })
    const r = G.routeConnector({ from: { box: c.fromBox, form: c.fromForm, port: p.from }, to: { box: c.toBox, form: c.toForm, port: p.to }, route: c.connector.route ?? 'orthogonal', obstacles: c.obstacles, ends: c.connector.ends ?? 'end', arrowSize: 10 })
    return svg.includes(`d="${r.d}"`)
  })
  ok('flowchart.svg.5 connectors are drawn from the colours map (a named stroke on the line AND both its heads; no stroke → colours.line), dashed where dashed, along the canvas\'s own routes; no var() survives',
    violetStroke && svg.includes('stroke="rgb(9, 8, 7)"') && svg.includes('stroke-dasharray') && byRoute && !svg.includes('var('),
    JSON.stringify({ violetStroke, byRoute }))

  ok('flowchart.svg.6 the same model writes byte-identical SVG — an export that differs run to run cannot be diffed or cached',
    svg === S.flowchartSvg(model, colours, { title: 'Chart <one> & "two"' }))

  const only = S.flowchartSvg({ shapes: shapes.slice(0, 3), connectors: [] }, colours, { margin: 20 })
  const ob = G.bounds(shapes.slice(0, 3).map((s) => s.box))
  const ovb = ((only.match(/viewBox="([^"]+)"/) ?? [])[1] ?? '').split(' ').map(Number)
  const all = G.bounds([...shapes.map((s) => s.box), panel.box])
  ok('flowchart.svg.7 the viewBox is everything plus the margin: exactly the shapes\' bounds grown by 20 when asked, and never cropping a shape or a live panel',
    ovb[0] === ob.x - 20 && ovb[1] === ob.y - 20 && ovb[2] === ob.w + 40 && ovb[3] === ob.h + 40 &&
      vbn[0] <= all.x - 32 && vbn[1] <= all.y - 32 && vbn[0] + vbn[2] >= all.x + all.w + 32 && vbn[1] + vbn[3] >= all.y + all.h + 32,
    JSON.stringify({ ovb, ob }))

  ok('flowchart.svg.8 characters XML forbids (a NUL, a lone surrogate) are dropped from labels, not written — one of them makes the whole file refuse to open',
    !svg.includes('\u0000') && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(svg) && svg.includes('nulherelone'))
}
