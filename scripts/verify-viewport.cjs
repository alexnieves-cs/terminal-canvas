/* Verifies the canvas coordinate math.
   Run with: npm run verify:viewport

   These are pure functions with no DOM and no native modules, so this runs
   under plain node rather than Electron. */
const { buildSync } = require('esbuild')
const { join } = require('node:path')

const OUT = join(__dirname, '..', 'out', 'verify', 'viewport.cjs')
buildSync({
  entryPoints: [join(__dirname, 'viewport-entry.cjs')],
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs'
})
const V = require(OUT)

const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`)
}
const EPS = 1e-9
const near = (a, b) => Math.abs(a - b) < EPS

// A spread of viewports and points, so a check that only holds at scale 1 or
// at the origin cannot pass by accident.
const VIEWPORTS = [
  { x: 0, y: 0, scale: 1 },
  { x: 137, y: -42, scale: 1 },
  { x: -900, y: 620, scale: 0.25 },
  { x: 33.5, y: 77.25, scale: 2.75 }
]
const POINTS = [
  { x: 0, y: 0 },
  { x: 1, y: -1 },
  { x: 640, y: 360 },
  { x: -1234.5, y: 987.75 }
]

// 1. The two conversions must be exact inverses.
{
  let worst = 0
  for (const vp of VIEWPORTS) {
    for (const p of POINTS) {
      const back = V.worldToScreen(V.screenToWorld(p, vp), vp)
      worst = Math.max(worst, Math.abs(back.x - p.x), Math.abs(back.y - p.y))
    }
  }
  ok('1 screenToWorld and worldToScreen round-trip', worst < EPS, `worst drift ${worst}`)
}

// 2. Zoom-to-cursor: the world point under the anchor must not move.
{
  const failures = []
  for (const vp of VIEWPORTS) {
    for (const anchor of POINTS) {
      for (const factor of [1.1, 0.9, 1.75, 0.5]) {
        const before = V.screenToWorld(anchor, vp)
        const next = V.zoomAt(vp, anchor, factor)
        const after = V.screenToWorld(anchor, next)
        if (!near(before.x, after.x) || !near(before.y, after.y)) {
          failures.push(`scale ${vp.scale} f ${factor}`)
        }
      }
    }
  }
  ok('2 zoomAt holds the anchor world point fixed', failures.length === 0,
    failures.length ? failures.slice(0, 3).join('; ') : `${VIEWPORTS.length * POINTS.length * 4} combinations`)
}

// 3. At the clamp, a further zoom must be a no-op. Deriving translation from a
// requested scale while applying a clamped one drifts the canvas sideways
// while it appears frozen.
{
  const atMax = { x: 200, y: -50, scale: V.MAX_SCALE }
  const atMin = { x: 200, y: -50, scale: V.MIN_SCALE }
  const anchor = { x: 400, y: 300 }
  const a = V.zoomAt(atMax, anchor, 1.5)
  const b = V.zoomAt(atMin, anchor, 0.5)
  ok('3 zooming past the clamp produces no drift',
    near(a.x, atMax.x) && near(a.y, atMax.y) && near(a.scale, V.MAX_SCALE) &&
    near(b.x, atMin.x) && near(b.y, atMin.y) && near(b.scale, V.MIN_SCALE),
    `max -> ${a.x},${a.y}@${a.scale}  min -> ${b.x},${b.y}@${b.scale}`)
}

// 4. panBy is in screen pixels: the same drag must move content the same
// on-screen distance at every zoom level.
{
  const moved = VIEWPORTS.map((vp) => {
    const next = V.panBy(vp, 25, -40)
    return next.x - vp.x === 25 && next.y - vp.y === -40 && next.scale === vp.scale
  })
  ok('4 panBy moves screen-distance independent of scale', moved.every(Boolean),
    `${moved.filter(Boolean).length}/${moved.length} viewports`)
}

// 5. A non-finite factor must leave the viewport untouched rather than
// poisoning it with NaN, which would blank the canvas permanently.
{
  const vp = { x: 10, y: 20, scale: 1.5 }
  const bad = [NaN, Infinity, -Infinity, 0, -2].map((f) => V.zoomAt(vp, { x: 0, y: 0 }, f))
  ok('5 zoomAt rejects non-finite and non-positive factors',
    bad.every((r) => r.x === vp.x && r.y === vp.y && r.scale === vp.scale),
    JSON.stringify(bad[0]))
}

// 6. Hit-testing: topmost wins, edges are left/top inclusive and
// right/bottom exclusive, misses and empty lists return null.
{
  const rects = [
    { id: 'back', x: 0, y: 0, w: 100, h: 100 },
    { id: 'front', x: 50, y: 50, w: 100, h: 100 }
  ]
  const cases = [
    [{ x: 25, y: 25 }, 'back', 'inside back only'],
    [{ x: 75, y: 75 }, 'front', 'overlap picks topmost'],
    [{ x: 120, y: 120 }, 'front', 'inside front only'],
    [{ x: 0, y: 0 }, 'back', 'top-left edge is inclusive'],
    [{ x: 100, y: 50 }, 'front', 'back right edge exclusive, front claims it'],
    [{ x: 150, y: 150 }, null, 'past both'],
    [{ x: -1, y: -1 }, null, 'before both']
  ]
  const bad = cases.filter(([p, want]) => V.hitTest(rects, p) !== want)
  ok('6 hitTest picks topmost and honours edges', bad.length === 0,
    bad.length ? bad.map(([, , why]) => why).join('; ') : `${cases.length} cases`)
  ok('6b hitTest on an empty list is a miss', V.hitTest([], { x: 0, y: 0 }) === null)
}

// 7. Zoom-to-fit centres the bounding box and never exceeds the clamp.
{
  const rects = [
    { id: 'a', x: 0, y: 0, w: 400, h: 300 },
    { id: 'b', x: 600, y: 500, w: 400, h: 300 }
  ]
  const size = { width: 1000, height: 800 }
  const vp = V.fitTo(rects, size, 50)

  // The bounding box centre must land at the canvas centre.
  const centre = V.worldToScreen({ x: 500, y: 400 }, vp)
  const centred = near(centre.x, 500) && near(centre.y, 400)

  // Both corners must clear the MARGIN, not merely the canvas edge. Asserting
  // only "inside the canvas" would pass for a fitTo that never subtracted the
  // margin at all, since a scale-1 fit of this fixture lands flush with the
  // edges and is still centred.
  const tl = V.worldToScreen({ x: 0, y: 0 }, vp)
  const br = V.worldToScreen({ x: 1000, y: 800 }, vp)
  const inside =
    tl.x >= 50 - EPS && tl.y >= 50 - EPS &&
    br.x <= size.width - 50 + EPS && br.y <= size.height - 50 + EPS

  ok('7 fitTo centres the bounding box inside the canvas', centred && inside,
    `centre ${centre.x},${centre.y} tl ${tl.x.toFixed(1)},${tl.y.toFixed(1)} br ${br.x.toFixed(1)},${br.y.toFixed(1)}`)

  // A single tiny rect would fit at a huge scale; the clamp must hold.
  const tiny = V.fitTo([{ id: 't', x: 0, y: 0, w: 10, h: 10 }], size, 50)
  ok('7b fitTo respects MAX_SCALE', tiny.scale <= V.MAX_SCALE, `scale ${tiny.scale}`)

  // No panels: equivalent to a reset.
  const empty = V.fitTo([], size, 50)
  ok('7c fitTo with no panels resets to 100%',
    empty.x === 0 && empty.y === 0 && empty.scale === 1, JSON.stringify(empty))
}

// A wheel event with defaults, so each case states only what it varies.
const wheel = (over) => ({
  deltaX: 0, deltaY: 0, deltaMode: 0,
  ctrlKey: false, metaKey: false, shiftKey: false, ...over
})

// 8. Gesture disambiguation. On macOS a pinch arrives as a wheel event with a
// synthetic ctrlKey — no key is actually held — and it is the only signal
// separating pinch from two-finger scroll.
{
  const pinch = V.normalizeWheel(wheel({ deltaY: -30, ctrlKey: true }))
  const cmd = V.normalizeWheel(wheel({ deltaY: -30, metaKey: true }))
  const scroll = V.normalizeWheel(wheel({ deltaX: 12, deltaY: -30 }))
  const shift = V.normalizeWheel(wheel({ deltaY: -30, shiftKey: true }))

  ok('8 ctrlKey wheel is a zoom', pinch.kind === 'zoom' && pinch.factor > 1, JSON.stringify(pinch))
  ok('8b metaKey wheel is a zoom', cmd.kind === 'zoom' && cmd.factor > 1, JSON.stringify(cmd))
  ok('8c bare wheel pans opposite the delta',
    scroll.kind === 'pan' && scroll.dx === -12 && scroll.dy === 30, JSON.stringify(scroll))
  ok('8d shift wheel pans horizontally',
    shift.kind === 'pan' && shift.dx === 30 && shift.dy === 0, JSON.stringify(shift))
}

// 9. deltaMode normalization. A mouse wheel reports lines, not pixels; without
// the multiplier a mouse user gets a canvas that barely moves.
{
  const lines = V.normalizeWheel(wheel({ deltaY: 3, deltaMode: 1 }))
  const pages = V.normalizeWheel(wheel({ deltaY: 1, deltaMode: 2 }))
  ok('9 deltaMode 1 (lines) scales to pixels',
    lines.kind === 'pan' && lines.dy === -3 * V.LINE_HEIGHT_PX, JSON.stringify(lines))
  ok('9b deltaMode 2 (pages) scales to pixels',
    pages.kind === 'pan' && pages.dy === -V.PAGE_HEIGHT_PX, JSON.stringify(pages))
}

// 10. Zoom must be exponential so gestures compose: momentum scrolling
// delivers a long tail of shrinking deltas, and a linear factor would land at
// a different zoom than the same gesture without inertia.
{
  const half = V.normalizeWheel(wheel({ deltaY: -10, ctrlKey: true })).factor
  const whole = V.normalizeWheel(wheel({ deltaY: -20, ctrlKey: true })).factor
  ok('10 two half-pinches compose to one whole pinch',
    near(half * half, whole), `${half} * ${half} vs ${whole}`)
}

// 11. A single mouse-wheel notch (~120px) must not slam into the scale limit.
// Trackpad pinches are 1-5px per event; unclamped, one notch is a 3.3x jump.
{
  const notch = V.normalizeWheel(wheel({ deltaY: -120, ctrlKey: true }))
  const ceiling = Math.exp(V.MAX_ZOOM_DELTA * V.ZOOM_SENSITIVITY)
  const pinch = V.normalizeWheel(wheel({ deltaY: -3, ctrlKey: true }))
  ok('11 a mouse-wheel notch is clamped to a usable step',
    notch.kind === 'zoom' && notch.factor > 1 && notch.factor <= ceiling + EPS,
    `notch factor ${notch.factor.toFixed(4)} vs ceiling ${ceiling.toFixed(4)}`)
  ok('11b a trackpad pinch delta is left untouched by the clamp',
    pinch.kind === 'zoom' && near(pinch.factor, Math.exp(3 * V.ZOOM_SENSITIVITY)),
    `pinch factor ${pinch.factor}`)
}

// --- lod.ts -------------------------------------------------------------

const SIZE = { width: 1000, height: 800 }
const AT_ORIGIN = { x: 0, y: 0, scale: 1 }
const panelAt = (id, x, y) => ({ id, x, y, w: 520, h: 340 })

// 20. On screen is live; far off screen is a card.
{
  const rects = [panelAt('near', 100, 100), panelAt('far', 90000, 90000)]
  const tiers = V.assignTiers({
    rects, viewport: AT_ORIGIN, size: SIZE, focusedId: null, lastFocusedAt: {}
  })
  ok('20 on screen is live, far off screen is a card',
    tiers.near === 'live' && tiers.far === 'card',
    `near=${tiers.near} far=${tiers.far}`)
}

// 21. The margin band: a panel just outside the viewport is still live, so
//     panning does not thrash a WebGL context at the edge.
{
  const justOutside = panelAt('edge', SIZE.width + 100, 100) // 100px past the edge
  const tiers = V.assignTiers({
    rects: [justOutside], viewport: AT_ORIGIN, size: SIZE,
    focusedId: null, lastFocusedAt: {}
  })
  const wayOutside = panelAt('gone', SIZE.width + 5000, 100)
  const tiers2 = V.assignTiers({
    rects: [wayOutside], viewport: AT_ORIGIN, size: SIZE,
    focusedId: null, lastFocusedAt: {}
  })
  ok('21 margin band protects from edge thrash',
    tiers.edge === 'live' && tiers2.gone === 'card',
    `edge=${tiers.edge} gone=${tiers2.gone}`)
}

// 22. Below LIVE_MIN_SCALE nothing unfocused is live, however on-screen.
{
  const rects = [panelAt('a', 0, 0), panelAt('b', 600, 0)]
  const tiers = V.assignTiers({
    rects, viewport: { x: 0, y: 0, scale: 0.3 }, size: SIZE,
    focusedId: null, lastFocusedAt: {}
  })
  ok('22 below LIVE_MIN_SCALE all unfocused panels are cards',
    tiers.a === 'card' && tiers.b === 'card', JSON.stringify(tiers))
}

// 23. The budget caps live panels no matter how many are on screen.
{
  const rects = []
  for (let i = 0; i < 20; i++) {
    rects.push(panelAt('p' + i, (i % 5) * 40, Math.floor(i / 5) * 40))
  }
  const tiers = V.assignTiers({
    rects, viewport: AT_ORIGIN, size: SIZE, focusedId: null,
    budget: 3, lastFocusedAt: {}
  })
  const live = Object.values(tiers).filter((t) => t === 'live').length
  ok('23 budget caps live panels', live === 3, `live=${live} of ${rects.length}`)
}

// 24. The focused panel is live off screen, below threshold, and over budget.
//     Typing must never land in a card.
{
  const rects = [panelAt('focused', 90000, 90000)]
  for (let i = 0; i < 20; i++) rects.push(panelAt('p' + i, (i % 5) * 40, 0))
  const tiers = V.assignTiers({
    rects, viewport: { x: 0, y: 0, scale: 0.2 }, size: SIZE,
    focusedId: 'focused', budget: 2, lastFocusedAt: {}
  })
  ok('24 focused panel is always live',
    tiers.focused === 'live', JSON.stringify(tiers.focused))
}

// 25. Eviction drops the least-recently-focused panel first.
{
  const rects = [panelAt('old', 0, 0), panelAt('recent', 40, 0), panelAt('newest', 80, 0)]
  const tiers = V.assignTiers({
    rects, viewport: AT_ORIGIN, size: SIZE, focusedId: null, budget: 2,
    lastFocusedAt: { old: 1000, recent: 2000, newest: 3000 }
  })
  ok('25 eviction drops least-recently-focused first',
    tiers.old === 'card' && tiers.recent === 'live' && tiers.newest === 'live',
    JSON.stringify(tiers))
}

console.log('\n' + '='.repeat(60))
const failed = results.filter((r) => !r.pass)
console.log(`${results.length - failed.length}/${results.length} passed`)
if (failed.length) {
  console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
  process.exit(1)
}
process.exit(0)
