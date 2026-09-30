/* verify:flowchart — the arranging math (src/renderer/canvas/arrange.ts):
   align, distribute, equal-spacing guides, the grid, and smartSnap — the one
   snap the canvas calls. Every property here fails SILENTLY when broken: a
   distribute that spaces centres instead of gaps still moves every object, a
   spacing snap that reads objects from another row still draws a guide, and a
   grid that beats a neighbour's edge still snaps — to the wrong thing. */
const { join } = require('node:path')

const R = (id, x, y, w, h) => ({ id, x, y, w, h })
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps
const mulberry32 = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const posOf = (map, id) => map.get(id)

module.exports = async function (ok, F) {
  const A = F.arrange ?? {}
  const names = ['alignRects', 'distributeRects', 'spacingSnap', 'gridSnap', 'smartSnap', 'alignSentence', 'distributeSentence']
  const missing = names.filter((n) => typeof A[n] !== 'function')
  if (missing.length) {
    ok('flowchart.arrange.0 the arrange module exports alignRects, distributeRects, spacingSnap, gridSnap, smartSnap and the two sentences', false, `missing ${missing.join(',')}`)
    return
  }
  ok('flowchart.arrange.0 the arrange module exports alignRects, distributeRects, spacingSnap, gridSnap, smartSnap and the two sentences', true)

  // ---- align ----
  const a = R('a', 10, 5, 100, 50)
  const b = R('b', 60, 40, 200, 80)
  const c = R('c', 30, 100, 40, 20)
  const sel = [a, b, c]
  // minX 10, maxRight 260, minY 5, maxBottom 120: the selection's own extremes.
  const want = {
    left: { a: [10, 5], b: [10, 40], c: [10, 100] },
    right: { a: [160, 5], b: [60, 40], c: [220, 100] },
    hcentre: { a: [85, 5], b: [35, 40], c: [115, 100] },
    top: { a: [10, 5], b: [60, 5], c: [30, 5] },
    bottom: { a: [10, 70], b: [60, 40], c: [30, 100] },
    vcentre: { a: [10, 37.5], b: [60, 22.5], c: [30, 52.5] }
  }
  const alignBad = []
  for (const [edge, exp] of Object.entries(want)) {
    const m = A.alignRects(sel, edge)
    for (const id of ['a', 'b', 'c']) {
      const p = posOf(m, id)
      if (!p || !near(p.x, exp[id][0]) || !near(p.y, exp[id][1])) alignBad.push(`${edge}/${id}=${JSON.stringify(p)}`)
    }
  }
  ok('flowchart.arrange.1 align puts every rect on the SELECTION\'s own extreme (left=min x, right=max far edge, centres=the bounding box centre) and moves only the named axis — objects of different sizes',
    alignBad.length === 0, alignBad.join(' '))

  const before = JSON.stringify(sel)
  const m1 = A.alignRects(sel, 'hcentre')
  ok('flowchart.arrange.2 align returns POSITIONS ONLY, keyed by id, one per rect: no size, nothing else, and the input is not mutated (a verb that resized could save a rect under the floor)',
    m1.size === 3 && [...m1.values()].every((p) => Object.keys(p).sort().join() === 'x,y') && JSON.stringify(sel) === before, JSON.stringify([...m1]))

  const applied = sel.map((r) => ({ ...r, ...A.alignRects(sel, 'right').get(r.id) }))
  const again = A.alignRects(applied, 'right')
  ok('flowchart.arrange.3 align is idempotent: aligning an aligned selection moves nothing, and the far edges then match exactly',
    applied.every((r) => { const p = again.get(r.id); return p.x === r.x && p.y === r.y }) && new Set(applied.map((r) => r.x + r.w)).size === 1)

  ok('flowchart.arrange.4 fewer than two rects to align (and fewer than three to distribute) is a no-op: an empty map, never a throw or a fabricated position',
    ['left', 'right', 'hcentre', 'top', 'bottom', 'vcentre'].every((e) => A.alignRects([], e).size === 0 && A.alignRects([a], e).size === 0) &&
      [0, 1, 2].every((n) => A.distributeRects(sel.slice(0, n), 'h').size === 0 && A.distributeRects(sel.slice(0, n), 'v').size === 0))

  // ---- distribute ----
  // Widths 100, 40, 200, 60 — centre spacing would give unequal gaps; gap spacing gives 260/3 each.
  const d0 = R('a', 0, 0, 100, 30)
  const d1 = R('b', 120, 7, 40, 30)
  const d2 = R('c', 170, 11, 200, 30)
  const d3 = R('d', 600, 3, 60, 30)
  const dm = A.distributeRects([d2, d0, d3, d1], 'h') // shuffled input: the result is keyed by id
  const gap = 260 / 3
  const gaps = () => {
    const rs = ['a', 'b', 'c', 'd'].map((id) => ({ ...[d0, d1, d2, d3].find((r) => r.id === id), ...dm.get(id) }))
    return [rs[1].x - (rs[0].x + rs[0].w), rs[2].x - (rs[1].x + rs[1].w), rs[3].x - (rs[2].x + rs[2].w)]
  }
  const g3 = gaps()
  ok('flowchart.arrange.5 distribute h makes every GAP equal (not every centre) with different widths, keeps the first and last exactly where they are, and leaves y alone',
    g3.every((g) => near(g, gap)) && dm.get('a').x === 0 && dm.get('d').x === 600 && dm.get('a').y === 0 && dm.get('b').y === 7 && dm.get('c').y === 11 && dm.get('d').y === 3, JSON.stringify(g3))

  const v0 = R('p', 5, 0, 30, 80)
  const v1 = R('q', 9, 90, 30, 10)
  const v2 = R('r', 2, 130, 30, 50)
  const v3 = R('s', 7, 400, 30, 100)
  const vm = A.distributeRects([v3, v1, v0, v2], 'v')
  // span 0..500, total heights 240, free 260, gap 260/3
  const vp = ['p', 'q', 'r', 's'].map((id) => ({ ...[v0, v1, v2, v3].find((r) => r.id === id), ...vm.get(id) }))
  const vg = [vp[1].y - (vp[0].y + vp[0].h), vp[2].y - (vp[1].y + vp[1].h), vp[3].y - (vp[2].y + vp[2].h)]
  ok('flowchart.arrange.6 distribute v is the same rule on y with heights: equal gaps, ends fixed, x untouched',
    vg.every((g) => near(g, 260 / 3)) && vm.get('p').y === 0 && vm.get('s').y === 400 && vm.get('p').x === 5 && vm.get('q').x === 9 && vm.get('r').x === 2 && vm.get('s').x === 7, JSON.stringify(vg))

  // Two objects share x=100: the id decides who comes first, whatever order they were passed in.
  const t = [R('first', 0, 0, 50, 10), R('b', 100, 0, 50, 10), R('a', 100, 0, 50, 10), R('last', 400, 0, 50, 10)]
  const tm1 = A.distributeRects(t, 'h')
  const tm2 = A.distributeRects([...t].reverse(), 'h')
  ok('flowchart.arrange.7 objects at the same position are ordered by id, so distributing twice (or in another input order) cannot swap them',
    tm1.get('a').x < tm1.get('b').x && near(tm1.get('a').x, 50 + 250 / 3) && near(tm1.get('b').x, 100 + 500 / 3) &&
      ['first', 'a', 'b', 'last'].every((id) => tm1.get(id).x === tm2.get(id).x), JSON.stringify([...tm1]))

  // Total width 400 in a span of 250: overlapping. Equal gaps of -50, documented.
  const ov = A.distributeRects([R('a', 0, 0, 100, 10), R('b', 10, 0, 100, 10), R('c', 20, 0, 100, 10), R('d', 150, 0, 100, 10)], 'h')
  ok('flowchart.arrange.8 distribute of overlapping objects still produces EQUAL gaps — negative ones (an even overlap), ends fixed',
    ov.get('a').x === 0 && near(ov.get('b').x, 50) && near(ov.get('c').x, 100) && ov.get('d').x === 150)

  // ---- spacingSnap ----
  const L = R('L', 0, 0, 100, 100)
  const Rr = R('R', 400, 0, 100, 100)
  const centred = (x) => A.spacingSnap(R('m', x, 0, 100, 100), [L, Rr], 8)
  const c5 = centred(195)
  const c10 = centred(190)
  ok('flowchart.arrange.9 centred between two neighbours snaps to the equal-gap position within the threshold, lights BOTH gaps (rounded to whole units), and does not snap beyond it',
    c5.dx === 5 && c5.dy === 0 && c5.guides.length === 1 && c5.guides[0].axis === 'x' && c5.guides[0].gap === 100 &&
      JSON.stringify(c5.guides[0].segments) === JSON.stringify([{ from: 100, to: 200, at: 50 }, { from: 300, to: 400, at: 50 }]) &&
      c10.dx === 0 && c10.guides.length === 0, JSON.stringify({ c5, c10 }))

  const rhA = R('A', 0, 0, 100, 100)
  const rhB = R('B', 140, 0, 100, 100)
  const rr = A.spacingSnap(R('C', 285, 0, 100, 100), [rhA, rhB], 8)
  const rl = A.spacingSnap(R('C', -137, 0, 100, 100), [rhA, rhB], 8)
  const rhC = R('Cc', 280, 0, 100, 100)
  const r3 = A.spacingSnap(R('D', 423, 0, 100, 100), [rhA, rhB, rhC], 8)
  ok('flowchart.arrange.10 repeat-the-rhythm: A _40_ B, C dragged near 40 right of B snaps to EXACTLY 40 and both gaps are listed; the same on the far side (left of A); a third equal gap lights up too',
    rr.dx === -5 && rr.guides[0].gap === 40 && JSON.stringify(rr.guides[0].segments) === JSON.stringify([{ from: 100, to: 140, at: 50 }, { from: 240, to: 280, at: 50 }]) &&
      rl.dx === -3 && rl.guides[0].gap === 40 && JSON.stringify(rl.guides[0].segments) === JSON.stringify([{ from: -40, to: 0, at: 50 }, { from: 100, to: 140, at: 50 }]) &&
      r3.dx === -3 && r3.guides[0].segments.length === 3 && r3.guides[0].segments.map((s) => s.to - s.from).join() === '40,40,40', JSON.stringify({ rr, rl, r3 }))

  const apart = A.spacingSnap(R('m', 195, 100, 100, 100), [L, Rr], 8) // touching, not overlapping, their row
  const far = A.spacingSnap(R('m', 195, 500, 100, 100), [L, Rr], 8)
  const barely = A.spacingSnap(R('m', 195, 99, 100, 100), [L, Rr], 8)
  ok('flowchart.arrange.11 only objects that SHARE a row attract: touching (y-overlap 0) or far below gets no snap and no guide; one unit of overlap is a row',
    apart.dx === 0 && apart.guides.length === 0 && far.dx === 0 && far.guides.length === 0 && barely.dx === 5 && barely.guides.length === 1, JSON.stringify({ apart, far, barely }))

  const jam = A.spacingSnap(R('m', 95, 0, 100, 100), [R('L', 0, 0, 100, 100), R('R', 200, 0, 100, 100)], 8)
  // m (105..125) already overlaps W (120..300). "L + 20" and "L + 15" are within reach and would repeat
  // the L–W gap and the P–Q gap — by landing m on W. That is no spacing, so it is no snap.
  const onW = A.spacingSnap(R('m', 105, 0, 20, 100), [R('L', 0, 0, 100, 100), R('W', 120, 0, 180, 100), R('P', 1000, 0, 100, 100), R('Q', 1115, 0, 100, 100)], 16)
  const rnd = mulberry32(7)
  const bad = []
  for (let n = 0; n < 600 && bad.length < 3; n++) {
    const others = Array.from({ length: 2 + Math.floor(rnd() * 6) }, (_, i) => R(`o${i}`, Math.floor(rnd() * 800), Math.floor(rnd() * 300), 40 + Math.floor(rnd() * 160), 40 + Math.floor(rnd() * 160)))
    const m = R('m', Math.floor(rnd() * 800), Math.floor(rnd() * 300), 40 + Math.floor(rnd() * 160), 40 + Math.floor(rnd() * 160))
    const s = A.spacingSnap(m, others, 12)
    const f = { ...m, x: m.x + s.dx, y: m.y + s.dy }
    for (const o of others) {
      const rowShared = f.y < o.y + o.h && o.y < f.y + f.h
      const wasOver = m.x < o.x + o.w && o.x < m.x + m.w
      if (s.dx !== 0 && rowShared && !wasOver && f.x < o.x + o.w && o.x < f.x + f.w) bad.push(`x-landed-on-${o.id}`)
    }
    for (const gd of s.guides) for (const sg of gd.segments) if (!(sg.to > sg.from) || Math.round(sg.to - sg.from) !== gd.gap) bad.push(`segment ${JSON.stringify(sg)} vs gap ${gd.gap}`)
  }
  ok('flowchart.arrange.12 a spacing snap never lands an object ON another one it was clear of (an "equal gap" that is negative is an overlap), and every segment measures its guide\'s rounded gap',
    jam.dx === 0 && jam.guides.length === 0 && onW.dx === 0 && onW.guides.length === 0 && bad.length === 0, bad.join(' ') + JSON.stringify(onW))

  const rs = A.spacingSnap(R('m', 195, 0, 100, 100), [L, Rr], 8, { resize: { growsX: true, growsY: true } })
  const rsm = A.smartSnap(R('m', 195, 0, 100, 100), [L, Rr], 8, { resize: { growsX: true, growsY: true }, spacing: true, min: { w: 50, h: 50 } })
  ok('flowchart.arrange.13 a RESIZE never snaps to equal spacing (no gap of its own to equalise): spacingSnap and smartSnap both return nothing where a move would',
    rs.dx === 0 && rs.dy === 0 && rs.guides.length === 0 && rsm.spacing.length === 0 && rsm.rect.x === 195 && rsm.rect.w === 100)

  // ---- grid ----
  const gm = A.gridSnap(R('g', 37, 51, 300, 200), 24)
  const gn = A.gridSnap(R('g', -5, -1, 300, 200), 8)
  ok('flowchart.arrange.14 grid move rounds x and y and never touches the size; a rounded -0 comes back as 0 (never a "-0" in a saved layout); a grid that is not positive changes nothing',
    gm.x === 48 && gm.y === 48 && gm.w === 300 && gm.h === 200 && gn.x === -8 && Object.is(gn.y, 0) &&
      A.gridSnap(R('g', 37, 51, 300, 200), 0).x === 37 && A.gridSnap(R('g', 37, 51, 300, 200), NaN).x === 37, JSON.stringify({ gm, gn }))

  const both = { resize: { growsX: true, growsY: true } }
  const gr = A.gridSnap(R('g', 13, 7, 205, 170), 24, both)
  const gx = A.gridSnap(R('g', 13, 7, 205, 170), 24, { resize: { growsX: true, growsY: false } })
  const gf = A.gridSnap(R('g', 0, 0, 200, 160), 24, both) // nearest lines (192, 168) — 192 is under the 200 floor
  const gs = A.gridSnap(R('g', 0, 0, 100, 80), 24, { ...both, min: { w: 80, h: 60 } })
  const gd = A.gridSnap(R('g', 0, 0, 100, 80), 24, both)
  ok('flowchart.arrange.15 grid resize rounds only the far edge (x/y stay put, a non-growing axis stays put), and NEVER falls under the floor: the panel floor by default, a shape\'s smaller one when passed',
    gr.x === 13 && gr.y === 7 && gr.x + gr.w === 216 && gr.y + gr.h === 168 && gx.h === 170 && gx.x + gx.w === 216 &&
      gf.w === 216 && gf.h === 168 && gs.w === 96 && gs.h === 72 && gd.w >= 200 && gd.h >= 160 && (gd.w % 24 === 0) && (gd.h % 24 === 0), JSON.stringify({ gr, gx, gf, gs, gd }))

  // ---- smartSnap ----
  const O = (x) => R('O', x, 300, 150, 100)
  const M = R('m', 196, 20, 100, 100) // the centred position is x=200
  const sm = (others, extra) => A.smartSnap(M, others, 8, extra)
  const tie = sm([L, Rr, O(200)])
  const tieSpacing = A.spacingSnap(M, [L, Rr, O(200)], 8)
  const spacingWins = sm([L, Rr, O(202)])
  const alignWins = sm([L, Rr, O(198)])
  ok('flowchart.arrange.16 smartSnap per axis: the smallest |delta| wins and ALIGNMENT wins an exact tie (the spacing candidate is really there — same delta 4 — and its guide is dropped)',
    tieSpacing.dx === 4 && tie.rect.x === 200 && tie.guides.length === 1 && tie.guides[0].axis === 'x' && tie.guides[0].at === 200 && tie.spacing.length === 0 &&
      spacingWins.rect.x === 200 && spacingWins.spacing.length === 1 && spacingWins.guides.length === 0 &&
      alignWins.rect.x === 198 && alignWins.guides.length === 1 && alignWins.guides[0].at === 198 && alignWins.spacing.length === 0, JSON.stringify({ tie, spacingWins, alignWins }))

  const withGrid = sm([L, Rr, O(200)], { grid: 24 })
  const nothing = A.smartSnap(M, [R('far', 2000, 2000, 100, 100)], 8, { grid: 24 })
  const noGrid = A.smartSnap(M, [R('far', 2000, 2000, 100, 100)], 8, { grid: null })
  ok('flowchart.arrange.17 the grid applies to an axis ONLY when nothing else is in reach on it (x aligns to the neighbour, not the grid line at 192; y — nothing near — takes the grid), and a grid snap draws no guide',
    withGrid.rect.x === 200 && withGrid.rect.y === 24 && withGrid.guides.length === 1 && withGrid.guides[0].axis === 'x' && withGrid.spacing.length === 0 &&
      nothing.rect.x === 192 && nothing.rect.y === 24 && nothing.guides.length === 0 && nothing.spacing.length === 0 &&
      noGrid.rect.x === 196 && noGrid.rect.y === 20 && noGrid.guides.length === 0, JSON.stringify({ withGrid, nothing, noGrid }))

  const offSpacing = sm([L, Rr], { spacing: false })
  const onSpacing = sm([L, Rr])
  ok('flowchart.arrange.18 guides come back ONLY for snaps actually applied: spacing:false turns the spacing snap and its guide off, and an axis with nothing in reach has no guide',
    onSpacing.rect.x === 200 && onSpacing.spacing.length === 1 && onSpacing.spacing[0].gap === 100 && onSpacing.guides.length === 0 &&
      offSpacing.rect.x === 196 && offSpacing.spacing.length === 0 && offSpacing.guides.length === 0, JSON.stringify({ onSpacing, offSpacing }))

  // Threshold is inclusive, and exact.
  const th8 = A.spacingSnap(R('m', 192, 0, 100, 100), [L, Rr], 8)
  const th801 = A.spacingSnap(R('m', 191.99, 0, 100, 100), [L, Rr], 8)
  const al8 = A.smartSnap(R('m', 192, 20, 100, 100), [R('O', 200, 300, 150, 100)], 8, { spacing: false })
  const al801 = A.smartSnap(R('m', 191.99, 20, 100, 100), [R('O', 200, 300, 150, 100)], 8, { spacing: false })
  ok('flowchart.arrange.19 the threshold is honoured exactly for spacing and alignment: delta == threshold snaps, threshold + 0.01 does not (an off-by-one here is a snap a person can feel and never explain)',
    th8.dx === 8 && th801.dx === 0 && th801.guides.length === 0 && al8.rect.x === 200 && al801.rect.x === 191.99 && al801.guides.length === 0, JSON.stringify({ th8, th801, al8, al801 }))

  // A resize never goes under the floor; a refused snap is no candidate, and a shape's smaller floor keeps the snap.
  const rz = R('r', 0, 0, 210, 200)
  const grow = { resize: { growsX: true, growsY: false } }
  const oNear = R('O', 195, 400, 100, 100) // right edge 210 → 195: w would be 195
  const refused = A.smartSnap(rz, [oNear], 16, grow)
  const shape = A.smartSnap(rz, [oNear], 16, { ...grow, min: { w: 100, h: 80 } })
  const fallback = A.smartSnap(rz, [R('O1', 198, 400, 1, 10), R('O2', 224, 500, 1, 10)], 16, grow) // -12 (w 198, refused) vs +14 (w 224)
  ok('flowchart.arrange.20 a resize snap that would fall under the floor is refused, not clamped (the panel floor by default, a shape\'s smaller `min` when passed), and the next-nearest valid snap is used instead',
    refused.rect.w === 210 && refused.guides.length === 0 && shape.rect.w === 195 && shape.guides.length === 1 && shape.guides[0].at === 195 &&
      fallback.rect.w === 224 && fallback.guides[0].at === 224, JSON.stringify({ refused, shape, fallback }))

  const rp = mulberry32(99)
  const under = []
  for (let n = 0; n < 800 && under.length < 3; n++) {
    const min = n % 2 ? { w: 200, h: 160 } : { w: 60, h: 40 }
    const others = Array.from({ length: 1 + Math.floor(rp() * 6) }, (_, i) => R(`o${i}`, Math.floor(rp() * 500), Math.floor(rp() * 500), 20 + Math.floor(rp() * 250), 20 + Math.floor(rp() * 250)))
    const r = R('r', Math.floor(rp() * 300), Math.floor(rp() * 300), min.w + Math.floor(rp() * 60), min.h + Math.floor(rp() * 60))
    const o = { resize: { growsX: rp() < 0.8, growsY: rp() < 0.8 }, min, grid: rp() < 0.5 ? 24 : null }
    const out = A.smartSnap(r, others, 16, o).rect
    if (out.w < min.w || out.h < min.h || out.x !== r.x || out.y !== r.y) under.push(JSON.stringify({ r, o, out }))
  }
  ok('flowchart.arrange.21 property sweep: a resize (aligned, gridded, or neither) never returns under its floor and never moves the origin corner',
    under.length === 0, under.join('\n'))

  // ---- parity with M50's snapRect, compiled straight from placement.ts ----
  let parity = 'not run'
  try {
    const { buildSync } = require('esbuild')
    const { mkdirSync, rmSync } = require('node:fs')
    const root = join(__dirname, '../..')
    mkdirSync(join(root, 'out/verify'), { recursive: true })
    // Per-process outfile, like verify-flowchart's own bundle: concurrent runs must not share one.
    const outfile = join(root, 'out/verify', `arrange-placement-${process.pid}.cjs`)
    buildSync({ entryPoints: [join(root, 'src/renderer/canvas/placement.ts')], outfile, bundle: true, platform: 'node', format: 'cjs', alias: { '@shared': join(root, 'src/shared'), '@renderer': join(root, 'src/renderer') } })
    const mod = { exports: require(outfile) }
    rmSync(outfile, { force: true })
    const snapRect = mod.exports.snapRect
    const pr = mulberry32(2024)
    const diffs = []
    const small = () => 20 * Math.floor(pr() * 12) // coarse grid: lots of exact coincidences and ties
    for (let n = 0; n < 500 && diffs.length < 3; n++) {
      const others = Array.from({ length: 1 + Math.floor(pr() * 8) }, (_, i) => R(`o${i}`, small(), small(), 200 + small(), 200 + small()))
      const r = R('r', small() + Math.floor(pr() * 11) - 5, small() + Math.floor(pr() * 11) - 5, 400 + small(), 400 + small())
      const resize = n % 2 ? { growsX: pr() < 0.7, growsY: pr() < 0.7 } : undefined
      const want = snapRect(r, others, 8, resize ? { resize } : {})
      const got = A.smartSnap(r, others, 8, { resize, spacing: false })
      if (JSON.stringify(got.rect) !== JSON.stringify(want.rect) || JSON.stringify(got.guides) !== JSON.stringify(want.guides) || got.spacing.length !== 0) diffs.push(JSON.stringify({ r, resize, want, got }))
    }
    parity = diffs.length === 0 ? 'ok' : diffs.join('\n')
  } catch (error) {
    parity = `could not compile placement.ts: ${error && error.message}`
  }
  ok('flowchart.arrange.22 smartSnap with spacing and grid off IS snapRect (same rect, same guides) away from the floor — move and resize, with coincident edges and ties; the day they drift the canvas snaps differently depending on the toggle',
    parity === 'ok', parity)

  // ---- determinism ----
  const scene = [L, Rr, R('P', 130, 260, 90, 90), R('Q', 610, 40, 120, 60), O(203)]
  const shuffle = (xs, seed) => { const g = mulberry32(seed); const c = [...xs]; for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(g() * (i + 1)); [c[i], c[j]] = [c[j], c[i]] } return c }
  const snapshot = JSON.stringify(scene)
  const ref = JSON.stringify(A.smartSnap(M, scene, 8, { grid: 24 }))
  const orders = [1, 2, 3, 4, 5, 6].map((s) => JSON.stringify(A.smartSnap(M, shuffle(scene, s), 8, { grid: 24 })))
  ok('flowchart.arrange.23 deterministic: the same input gives the same output every time, whatever order `others` arrives in (no exact tie in this scene), and nothing passed in is mutated or reordered',
    orders.every((o) => o === ref) && ref === JSON.stringify(A.smartSnap(M, scene, 8, { grid: 24 })) && JSON.stringify(scene) === snapshot, `${ref}\n${orders.find((o) => o !== ref) ?? ''}`)

  // ---- sentences ----
  ok('flowchart.arrange.24 the verb notes read as one line: "3 objects aligned left", "4 objects spaced evenly across" / "down", singular for one, and every edge has its own wording',
    A.alignSentence(3, 'left') === '3 objects aligned left' && A.alignSentence(1, 'top') === '1 object aligned top' &&
      A.distributeSentence(4, 'h') === '4 objects spaced evenly across' && A.distributeSentence(5, 'v') === '5 objects spaced evenly down' &&
      new Set(['left', 'right', 'top', 'bottom', 'hcentre', 'vcentre'].map((e) => A.alignSentence(2, e))).size === 6)

  // ---- performance ----
  // The 250 others are worst-cased twice: a 25×10 lattice (a lot of rows and columns) and one single row of 250 (every object a spacing neighbour).
  const lattice = Array.from({ length: 250 }, (_, i) => R(`n${i}`, (i % 25) * 224, Math.floor(i / 25) * 184, 200, 160))
  const strip = Array.from({ length: 250 }, (_, i) => R(`s${i}`, i * 240, 0, 200, 160))
  const time = (others, rect, opts) => {
    for (let i = 0; i < 30; i++) A.smartSnap(rect, others, 8, opts) // warm the JIT: the number that matters is steady state, a drag runs for seconds
    const N = 300
    const t0 = process.hrtime.bigint()
    for (let i = 0; i < N; i++) A.smartSnap({ ...rect, x: rect.x + (i % 7) }, others, 8, opts)
    return Number(process.hrtime.bigint() - t0) / 1e6 / N
  }
  const tLattice = time(lattice, R('me', 2700, 900, 200, 160), { grid: 24 })
  const tStrip = time(strip, R('me', 30000, 10, 200, 160), { grid: 24 })
  const tResize = time(lattice, R('me', 2700, 900, 210, 170), { resize: { growsX: true, growsY: true }, grid: 24 })
  console.log(`   smartSnap vs 250 others, mean of 300: lattice ${tLattice.toFixed(3)} ms, one-row strip ${tStrip.toFixed(3)} ms, resize ${tResize.toFixed(3)} ms`)
  ok('flowchart.arrange.25 smartSnap against 250 others averages under 2 ms per call (it runs every pointermove of a drag), in the worst layouts for both the row scan and the alignment scan',
    tLattice < 2 && tStrip < 2 && tResize < 2, `lattice ${tLattice.toFixed(3)} strip ${tStrip.toFixed(3)} resize ${tResize.toFixed(3)} ms`)
}
