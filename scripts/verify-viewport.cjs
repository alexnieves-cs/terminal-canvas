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

console.log('\n' + '='.repeat(60))
const failed = results.filter((r) => !r.pass)
console.log(`${results.length - failed.length}/${results.length} passed`)
if (failed.length) {
  console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
  process.exit(1)
}
process.exit(0)
