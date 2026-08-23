# M2 Infinite Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the viewport and coordinate layer — pan, zoom, and screen↔world math — proven against dumb rectangles with no terminal involved.

**Architecture:** A single `.world` element carries `transform: translate(Xpx, Ypx) scale(k)`; panels are absolutely positioned inside it in world coordinates, so pan/zoom rewrites one style property regardless of panel count. The math lives in pure, DOM-free functions so it can be tested as arithmetic. Platform event normalization is a separate pure module; React is the only place the two meet.

**Tech Stack:** TypeScript, React 19, Vite (via electron-vite), esbuild (already present as a Vite dependency) for bundling test targets. No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-08-23-m2-infinite-canvas-design.md`

## Global Constraints

- No new npm dependencies. esbuild is reached via `require('esbuild')`, already installed transitively by Vite.
- Scale clamps to `[0.1, 3]` (`MIN_SCALE` / `MAX_SCALE`).
- `viewport.ts` imports nothing from the DOM or React. `canvas-input.ts` imports nothing from React.
- `x`/`y` in a `Viewport` are the world origin's position in **canvas-local** pixels, never client pixels.
- `panBy`'s `dx`/`dy` are **screen** pixels and must never be divided by scale.
- Every canvas keyboard shortcut requires `Cmd` (`metaKey`). No bare-key shortcuts, ever — M3 gives all bare keys to the PTY.
- Test scripts follow the existing `scripts/verify-*.cjs` harness idiom: a `results` array, an `ok(name, pass, detail)` helper, a `N/M passed` summary, and `process.exit(1)` on failure.
- Test assertions on floats use a tolerance of `1e-9`.
- TDD is mandatory: write the test, run it, watch it fail for the right reason, then implement.
- `npm run typecheck` must pass before every commit.

---

### Task 1: Viewport transform core

**Files:**
- Create: `src/renderer/canvas/viewport.ts`
- Create: `scripts/verify-viewport.cjs`
- Create: `scripts/viewport-entry.cjs`
- Modify: `package.json` (add `verify:viewport` script)

**Interfaces:**
- Consumes: nothing.
- Produces: `Point`, `Viewport`, `WorldRect`, `Size` interfaces; `MIN_SCALE = 0.1`, `MAX_SCALE = 3`; `clampScale(scale: number): number`; `screenToWorld(p: Point, vp: Viewport): Point`; `worldToScreen(p: Point, vp: Viewport): Point`; `zoomAt(vp: Viewport, anchor: Point, factor: number): Viewport`; `panBy(vp: Viewport, dx: number, dy: number): Viewport`.

- [ ] **Step 1: Write the bundle entry**

This lets the test import TypeScript modules. `viewport.ts` has no native dependencies, so unlike the PTY suites this runs under plain `node`, not Electron.

Create `scripts/viewport-entry.cjs`:

```js
/* Bundle entry for the canvas math tests. Pure TypeScript modules with no
   native dependencies, so the suite runs under plain node. */
module.exports = {
  ...require('../src/renderer/canvas/viewport')
}
```

- [ ] **Step 2: Write the failing test**

Create `scripts/verify-viewport.cjs`:

```js
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
```

- [ ] **Step 3: Add the npm script**

In `package.json`, add to `scripts`, after `verify:ipc`:

```json
"verify:viewport": "node scripts/verify-viewport.cjs"
```

And extend the aggregate `verify` script to include it:

```json
"verify": "npm run verify:viewport && npm run verify:pty && npm run verify:pty-manager && npm run verify:window && npm run verify:ipc"
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm run verify:viewport`

Expected: the esbuild step fails because `src/renderer/canvas/viewport.ts` does not exist — `Could not resolve "../src/renderer/canvas/viewport"`. That is an error, not a failure. Proceed to Step 5, then re-run; you must see real `FAIL` lines before implementing anything further.

- [ ] **Step 5: Create the module with signatures only, and watch the checks fail**

Create `src/renderer/canvas/viewport.ts`:

```ts
/**
 * Canvas coordinate math. Deliberately free of DOM and React imports: the
 * whole point of M2 is that this arithmetic can be tested as arithmetic.
 *
 * `x`/`y` are the world origin's position in CANVAS-LOCAL pixels. Turning a
 * MouseEvent's client coordinates into canvas-local space belongs to the input
 * layer, not here.
 */

export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

/** The world origin's canvas-local position, plus the world-to-screen scale. */
export interface Viewport {
  x: number
  y: number
  scale: number
}

export interface WorldRect {
  id: string
  x: number
  y: number
  w: number
  h: number
}

export const MIN_SCALE = 0.1
export const MAX_SCALE = 3

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

// Stubs return NaN, not plausible values. A stub that returned {x: 0, y: 0}
// would make check 2 pass vacuously: "the world point under the anchor did not
// move" is trivially true when every point converts to the origin.
export function screenToWorld(_p: Point, _vp: Viewport): Point {
  return { x: NaN, y: NaN }
}

export function worldToScreen(_p: Point, _vp: Viewport): Point {
  return { x: NaN, y: NaN }
}

export function zoomAt(vp: Viewport, _anchor: Point, _factor: number): Viewport {
  return vp
}

export function panBy(vp: Viewport, _dx: number, _dy: number): Viewport {
  return vp
}
```

Run: `npm run verify:viewport`

Expected: checks 1, 2 and 4 FAIL. Confirm you see:

```
FAIL  1 screenToWorld and worldToScreen round-trip
FAIL  2 zoomAt holds the anchor world point fixed
FAIL  4 panBy moves screen-distance independent of scale
```

Checks 3 and 5 will PASS against the stub, and that is expected rather than a
problem: both assert that a viewport does **not** change, which a no-op `zoomAt`
satisfies trivially. They only become meaningful once `zoomAt` actually zooms —
at which point they are the two checks guarding clamp drift and NaN poisoning.
Do not treat their passing here as evidence they work.

- [ ] **Step 6: Write the implementation**

Replace the four stub bodies in `src/renderer/canvas/viewport.ts`:

```ts
export function screenToWorld(p: Point, vp: Viewport): Point {
  return { x: (p.x - vp.x) / vp.scale, y: (p.y - vp.y) / vp.scale }
}

export function worldToScreen(p: Point, vp: Viewport): Point {
  return { x: p.x * vp.scale + vp.x, y: p.y * vp.scale + vp.y }
}

/**
 * Zoom about a canvas-local anchor, keeping the world point under that anchor
 * fixed.
 *
 * The clamp is applied BEFORE the translation is derived. Deriving translation
 * from a requested scale while applying a clamped one makes the canvas drift
 * sideways while appearing frozen — the bug you only notice after holding a
 * pinch at the limit.
 */
export function zoomAt(vp: Viewport, anchor: Point, factor: number): Viewport {
  if (!Number.isFinite(factor) || factor <= 0) return vp
  const scale = clampScale(vp.scale * factor)
  if (scale === vp.scale) return vp
  const world = screenToWorld(anchor, vp)
  return { scale, x: anchor.x - world.x * scale, y: anchor.y - world.y * scale }
}

/** dx/dy are SCREEN pixels: a drag moves content the same distance at any zoom. */
export function panBy(vp: Viewport, dx: number, dy: number): Viewport {
  return { ...vp, x: vp.x + dx, y: vp.y + dy }
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm run verify:viewport`
Expected: `5/5 passed`

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: no output, exit 0.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/canvas/viewport.ts scripts/verify-viewport.cjs scripts/viewport-entry.cjs package.json
git commit -m "feat(m2): viewport transform core

screenToWorld/worldToScreen as exact inverses, zoom-to-cursor anchored, and
pan in screen pixels. Clamp before deriving translation so holding a pinch at
the zoom limit cannot drift the canvas."
```

---

### Task 2: Hit-testing and zoom-to-fit

**Files:**
- Modify: `src/renderer/canvas/viewport.ts`
- Modify: `scripts/verify-viewport.cjs`

**Interfaces:**
- Consumes: `Point`, `Viewport`, `WorldRect`, `Size`, `clampScale` from Task 1.
- Produces: `hitTest(rects: WorldRect[], world: Point): string | null`; `fitTo(rects: WorldRect[], size: Size, margin?: number): Viewport`.

- [ ] **Step 1: Write the failing tests**

In `scripts/verify-viewport.cjs`, insert these two blocks after check 5 and before the `console.log('\n' + ...)` summary:

```js
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

  // Both corners must be inside the canvas.
  const tl = V.worldToScreen({ x: 0, y: 0 }, vp)
  const br = V.worldToScreen({ x: 1000, y: 800 }, vp)
  const inside = tl.x >= 0 && tl.y >= 0 && br.x <= size.width && br.y <= size.height

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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run verify:viewport`
Expected: the run aborts with `TypeError: V.hitTest is not a function`. Add the stubs in Step 3, then re-run to see real `FAIL` lines before implementing.

- [ ] **Step 3: Add stubs and watch the checks fail**

Append to `src/renderer/canvas/viewport.ts`:

```ts
export function hitTest(_rects: WorldRect[], _world: Point): string | null {
  return null
}

// NaN again, deliberately: a stub returning {x: 0, y: 0, scale: 1} would place
// the bounding-box centre exactly at the canvas centre for this fixture and
// pass check 7 without doing anything.
export function fitTo(_rects: WorldRect[], _size: Size, _margin = 64): Viewport {
  return { x: NaN, y: NaN, scale: NaN }
}
```

Run: `npm run verify:viewport`

Expected: `FAIL 6`, `FAIL 7`, `FAIL 7b`, `FAIL 7c`. Check 6b (empty list is a
miss) passes against the stub, since a `hitTest` that always returns null
trivially satisfies it.

- [ ] **Step 4: Write the implementation**

Replace both stub bodies:

```ts
/**
 * The topmost rect containing the point, or null. Iterates in reverse so paint
 * order and pick order agree. Left/top edges are inclusive, right/bottom
 * exclusive, so adjacent rects never both claim a shared edge.
 */
export function hitTest(rects: WorldRect[], world: Point): string | null {
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i]
    if (!r) continue
    if (world.x >= r.x && world.x < r.x + r.w && world.y >= r.y && world.y < r.y + r.h) {
      return r.id
    }
  }
  return null
}

/** Largest clamped scale at which every rect fits with a margin, centred. */
export function fitTo(rects: WorldRect[], size: Size, margin = 64): Viewport {
  if (rects.length === 0) return { x: 0, y: 0, scale: 1 }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const r of rects) {
    minX = Math.min(minX, r.x)
    minY = Math.min(minY, r.y)
    maxX = Math.max(maxX, r.x + r.w)
    maxY = Math.max(maxY, r.y + r.h)
  }

  const boxW = maxX - minX
  const boxH = maxY - minY
  const availW = size.width - margin * 2
  const availH = size.height - margin * 2

  // A degenerate box or a canvas smaller than its own margins would divide by
  // zero or go negative; fall back to 100% rather than emitting NaN.
  const fits = boxW > 0 && boxH > 0 && availW > 0 && availH > 0
  const scale = fits ? clampScale(Math.min(availW / boxW, availH / boxH)) : 1

  const centreX = (minX + maxX) / 2
  const centreY = (minY + maxY) / 2
  return {
    scale,
    x: size.width / 2 - centreX * scale,
    y: size.height / 2 - centreY * scale
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run verify:viewport`
Expected: `10/10 passed`

- [ ] **Step 6: Typecheck and commit**

```bash
npm run typecheck
git add src/renderer/canvas/viewport.ts scripts/verify-viewport.cjs
git commit -m "feat(m2): hit-testing and zoom-to-fit

hitTest iterates in reverse so pick order matches paint order, with
left/top-inclusive edges so neighbours never both claim a boundary. fitTo
falls back to 100% on a degenerate box rather than emitting NaN."
```

---

### Task 3: Wheel event normalization

**Files:**
- Create: `src/renderer/canvas/canvas-input.ts`
- Modify: `scripts/viewport-entry.cjs`
- Modify: `scripts/verify-viewport.cjs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `WheelLike` interface (`deltaX`, `deltaY`, `deltaMode`, `ctrlKey`, `metaKey`, `shiftKey`); `WheelIntent = {kind:'zoom'; factor:number} | {kind:'pan'; dx:number; dy:number}`; `normalizeWheel(e: WheelLike): WheelIntent`; constants `LINE_HEIGHT_PX = 16`, `PAGE_HEIGHT_PX = 800`, `ZOOM_SENSITIVITY = 0.01`.

- [ ] **Step 1: Extend the bundle entry**

Replace `scripts/viewport-entry.cjs` with:

```js
/* Bundle entry for the canvas math tests. Pure TypeScript modules with no
   native dependencies, so the suite runs under plain node. */
module.exports = {
  ...require('../src/renderer/canvas/viewport'),
  ...require('../src/renderer/canvas/canvas-input')
}
```

- [ ] **Step 2: Write the failing tests**

In `scripts/verify-viewport.cjs`, insert after check 7c and before the summary:

```js
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
  const half = V.normalizeWheel(wheel({ deltaY: -25, ctrlKey: true })).factor
  const whole = V.normalizeWheel(wheel({ deltaY: -50, ctrlKey: true })).factor
  ok('10 two half-pinches compose to one whole pinch',
    near(half * half, whole), `${half} * ${half} vs ${whole}`)
}
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run verify:viewport`
Expected: the esbuild step fails — `Could not resolve "../src/renderer/canvas/canvas-input"`. Add the stub in Step 4, then re-run to see real `FAIL` lines.

- [ ] **Step 4: Create the module with a stub and watch the checks fail**

Create `src/renderer/canvas/canvas-input.ts`:

```ts
/**
 * Turns platform wheel events into canvas intents.
 *
 * Takes a plain object rather than a real WheelEvent so the disambiguation is
 * a pure function, testable without a DOM. React is not imported here.
 */

export interface WheelLike {
  deltaX: number
  deltaY: number
  /** 0 = pixels (trackpad), 1 = lines (mouse wheel), 2 = pages. */
  deltaMode: number
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
}

export type WheelIntent =
  | { kind: 'zoom'; factor: number }
  | { kind: 'pan'; dx: number; dy: number }

export const LINE_HEIGHT_PX = 16
export const PAGE_HEIGHT_PX = 800
export const ZOOM_SENSITIVITY = 0.01

export function normalizeWheel(_e: WheelLike): WheelIntent {
  return { kind: 'pan', dx: 0, dy: 0 }
}
```

Run: `npm run verify:viewport`

Expected: `FAIL 8`, `FAIL 8b`, `FAIL 8c`, `FAIL 8d`, `FAIL 9`, `FAIL 9b`, and check 10 aborting or failing on `undefined` factors.

- [ ] **Step 5: Write the implementation**

Replace the `normalizeWheel` stub:

```ts
export function normalizeWheel(e: WheelLike): WheelIntent {
  const unit = e.deltaMode === 1 ? LINE_HEIGHT_PX : e.deltaMode === 2 ? PAGE_HEIGHT_PX : 1
  const dx = e.deltaX * unit
  const dy = e.deltaY * unit

  // A macOS pinch arrives as a wheel event with a synthetic ctrlKey; no key is
  // held. Cmd+wheel is the equivalent for a mouse.
  if (e.ctrlKey || e.metaKey) {
    // Exponential, so a given finger distance is the same proportional zoom at
    // every scale and repeated deltas multiply rather than accumulate.
    return { kind: 'zoom', factor: Math.exp(-dy * ZOOM_SENSITIVITY) }
  }

  // Shift+wheel is the platform convention for horizontal scroll.
  if (e.shiftKey && dx === 0) return { kind: 'pan', dx: -dy, dy: 0 }

  return { kind: 'pan', dx: -dx, dy: -dy }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm run verify:viewport`
Expected: `17/17 passed`

- [ ] **Step 7: Typecheck and commit**

```bash
npm run typecheck
git add src/renderer/canvas/canvas-input.ts scripts/viewport-entry.cjs scripts/verify-viewport.cjs
git commit -m "feat(m2): normalize wheel events into canvas intents

A macOS pinch is a wheel event with a synthetic ctrlKey, which is the only
signal separating it from a two-finger scroll. Zoom is exponential so momentum
tails compose to the same result as one large delta."
```

---

### Task 4: Canvas component with live pan and zoom

**Files:**
- Create: `src/renderer/canvas/placeholder-panels.ts`
- Create: `src/renderer/canvas/useViewport.ts`
- Create: `src/renderer/canvas/Canvas.tsx`
- Create: `src/renderer/canvas/PlaceholderPanel.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles.css`

**Interfaces:**
- Consumes: `Viewport`, `WorldRect`, `Point`, `Size`, `screenToWorld`, `zoomAt`, `panBy`, `fitTo`, `hitTest` from Tasks 1–2; `normalizeWheel` from Task 3.
- Produces: `PLACEHOLDER_PANELS: WorldRect[]`; `useViewport(hostRef: RefObject<HTMLElement | null>, rects: WorldRect[]): Viewport`; `Canvas({ rects }: CanvasProps): JSX.Element`; `PlaceholderPanel({ rect, selected }: PlaceholderPanelProps): JSX.Element`.

- [ ] **Step 1: Create the placeholder panel data**

Create `src/renderer/canvas/placeholder-panels.ts`:

```ts
import type { WorldRect } from './viewport'

/**
 * Stand-ins for the real terminal panels of M3. Deliberately spread far wider
 * than one screen so that panning somewhere and finding something is testable
 * by hand, and so culling has something to cull in M3.
 */
export const PLACEHOLDER_PANELS: WorldRect[] = [
  { id: 'p01', x: 0, y: 0, w: 520, h: 340 },
  { id: 'p02', x: 600, y: 0, w: 520, h: 340 },
  { id: 'p03', x: 1200, y: 0, w: 520, h: 340 },
  { id: 'p04', x: 0, y: 420, w: 520, h: 340 },
  { id: 'p05', x: 600, y: 420, w: 520, h: 340 },
  { id: 'p06', x: 1200, y: 420, w: 520, h: 340 },
  { id: 'p07', x: -700, y: 200, w: 520, h: 340 },
  { id: 'p08', x: -700, y: 620, w: 520, h: 340 },
  { id: 'p09', x: 1900, y: 200, w: 520, h: 340 },
  { id: 'p10', x: 1900, y: 620, w: 520, h: 340 },
  { id: 'p11', x: 300, y: 900, w: 520, h: 340 },
  { id: 'p12', x: 900, y: 900, w: 520, h: 340 },
  { id: 'p13', x: -400, y: -500, w: 520, h: 340 },
  { id: 'p14', x: 200, y: -500, w: 520, h: 340 },
  { id: 'p15', x: 800, y: -500, w: 520, h: 340 },
  { id: 'p16', x: 2600, y: 0, w: 520, h: 340 },
  { id: 'p17', x: 2600, y: 420, w: 520, h: 340 },
  { id: 'p18', x: -1400, y: 0, w: 520, h: 340 },
  { id: 'p19', x: -1400, y: 420, w: 520, h: 340 },
  { id: 'p20', x: 600, y: 1380, w: 520, h: 340 }
]
```

- [ ] **Step 2: Write the viewport hook**

Create `src/renderer/canvas/useViewport.ts`:

```ts
import { useEffect, useState, type RefObject } from 'react'
import { normalizeWheel } from './canvas-input'
import { fitTo, panBy, zoomAt, type Viewport, type WorldRect } from './viewport'

const INITIAL: Viewport = { x: 120, y: 120, scale: 1 }
const KEYBOARD_ZOOM_STEP = 1.2

/**
 * Returns the current viewport. The setter stays private: nothing outside this
 * hook has a reason to move the camera, and exporting it would invite panel
 * code to reach past the gesture layer.
 */
export function useViewport(
  hostRef: RefObject<HTMLElement | null>,
  rects: WorldRect[]
): Viewport {
  const [viewport, setViewport] = useState<Viewport>(INITIAL)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const onWheel = (event: WheelEvent): void => {
      // Chromium treats ctrl+wheel as its own page-zoom gesture. Without this
      // a pinch zooms the entire UI instead of the canvas. React's onWheel
      // prop cannot do this reliably, which is why the listener is attached
      // here with passive: false — on a passive listener preventDefault does
      // not throw, it silently does nothing.
      event.preventDefault()

      const bounds = host.getBoundingClientRect()
      const anchor = { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
      const intent = normalizeWheel(event)

      setViewport((vp) =>
        intent.kind === 'zoom'
          ? zoomAt(vp, anchor, intent.factor)
          : panBy(vp, intent.dx, intent.dy)
      )
    }

    host.addEventListener('wheel', onWheel, { passive: false })
    return () => host.removeEventListener('wheel', onWheel)
  }, [hostRef])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // Cmd is required for every canvas shortcut. Agent TUIs claim essentially
      // every bare key, so from M3 a bare keystroke must always reach the PTY.
      if (!event.metaKey) return

      const host = hostRef.current
      if (!host) return
      const bounds = host.getBoundingClientRect()
      const centre = { x: bounds.width / 2, y: bounds.height / 2 }
      const size = { width: bounds.width, height: bounds.height }

      switch (event.key) {
        case '0':
          event.preventDefault()
          setViewport({ x: 0, y: 0, scale: 1 })
          break
        case '1':
          event.preventDefault()
          setViewport(fitTo(rects, size))
          break
        case '=':
        case '+':
          event.preventDefault()
          setViewport((vp) => zoomAt(vp, centre, KEYBOARD_ZOOM_STEP))
          break
        case '-':
          event.preventDefault()
          setViewport((vp) => zoomAt(vp, centre, 1 / KEYBOARD_ZOOM_STEP))
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [hostRef, rects])

  return viewport
}
```

- [ ] **Step 3: Write the placeholder panel component**

Create `src/renderer/canvas/PlaceholderPanel.tsx`:

```tsx
import type { JSX } from 'react'
import type { WorldRect } from './viewport'

export interface PlaceholderPanelProps {
  rect: WorldRect
  selected: boolean
}

/**
 * A dumb rectangle standing in for a terminal panel. Its geometry is written
 * once in world coordinates and never recomputed: pan and zoom only rewrite
 * the parent .world transform.
 */
export function PlaceholderPanel({ rect, selected }: PlaceholderPanelProps): JSX.Element {
  return (
    <div
      className={`placeholder-panel${selected ? ' placeholder-panel--selected' : ''}`}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    >
      <span className="placeholder-panel__label">{rect.id}</span>
    </div>
  )
}
```

- [ ] **Step 4: Write the canvas component**

Create `src/renderer/canvas/Canvas.tsx`:

```tsx
import { useRef, useState, type JSX, type MouseEvent } from 'react'
import { PlaceholderPanel } from './PlaceholderPanel'
import { useViewport } from './useViewport'
import { hitTest, screenToWorld, type WorldRect } from './viewport'

export interface CanvasProps {
  rects: WorldRect[]
}

export function Canvas({ rects }: CanvasProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewport = useViewport(hostRef, rects)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const onClick = (event: MouseEvent<HTMLDivElement>): void => {
    const host = hostRef.current
    if (!host) return
    const bounds = host.getBoundingClientRect()
    const local = { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
    setSelectedId(hitTest(rects, screenToWorld(local, viewport)))
  }

  return (
    <div className="canvas" ref={hostRef} onClick={onClick}>
      <div
        className="world"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`
        }}
      >
        {rects.map((rect) => (
          <PlaceholderPanel key={rect.id} rect={rect} selected={rect.id === selectedId} />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Wire it into the app**

Replace the whole of `src/renderer/App.tsx`:

```tsx
import type { JSX } from 'react'
import { Canvas } from './canvas/Canvas'
import { PLACEHOLDER_PANELS } from './canvas/placeholder-panels'

/**
 * M2 scope: the canvas and its coordinate math, with dumb rectangles instead
 * of terminals.
 *
 * TerminalPanel is intentionally not mounted for this milestone. M1 proved the
 * PTY path with no transform math so a blank panel had one possible cause;
 * this is the mirror image. M3 reunites them, and verify:pty* remains the
 * proof that the PTY layer still works meanwhile.
 */
export function App(): JSX.Element {
  return (
    <div className="app">
      <Canvas rects={PLACEHOLDER_PANELS} />
    </div>
  )
}
```

- [ ] **Step 6: Add the styles**

In `src/renderer/styles.css`, replace the `.app` rule with:

```css
.app {
  height: 100%;
  padding: 38px 0 0; /* clears the hiddenInset traffic lights */
}

/* The fixed viewport. Clips the world and catches every canvas event. */
.canvas {
  position: relative;
  height: 100%;
  overflow: hidden;
  background:
    radial-gradient(circle at 1px 1px, #1c2030 1px, transparent 0) 0 0 / 32px 32px;
  cursor: default;
}

/* The single transformed layer. transform-origin 0 0 is load-bearing: it is
   what makes world point w land at x + k*w, matching viewport.ts. */
.world {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
  will-change: transform;
}

.placeholder-panel {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--panel-bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  user-select: none;
}

.placeholder-panel--selected {
  border-color: var(--blue);
  box-shadow: 0 0 0 1px var(--blue);
}

.placeholder-panel__label {
  font-size: 28px;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
}
```

Leave the existing `.panel*` rules in place — `TerminalPanel` still uses them in M3.

- [ ] **Step 7: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: both clean.

- [ ] **Step 8: Verify by hand in the running app**

Run: `npm run dev`

Confirm all four:
1. Two-finger trackpad scroll pans the rectangles.
2. Pinch zooms, and the point under the cursor stays under the cursor.
3. Pinching hard does not zoom the window chrome or the traffic lights — if it does, `preventDefault` is not taking effect.
4. `Cmd+0` returns to 100%, `Cmd+1` fits all 20 rectangles on screen, `Cmd+=`/`Cmd+-` step the zoom.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/canvas src/renderer/App.tsx src/renderer/styles.css
git commit -m "feat(m2): canvas with live pan and zoom

One transformed .world layer, panels positioned once in world coordinates.
The wheel listener is attached with passive: false because preventDefault on
a passive listener silently does nothing, which would let Chromium page-zoom
the whole UI on every pinch.

TerminalPanel is not mounted this milestone; M3 reunites them."
```

---

### Task 5: Selection HUD

**Files:**
- Create: `src/renderer/canvas/CanvasHud.tsx`
- Modify: `src/renderer/canvas/Canvas.tsx`
- Modify: `src/renderer/styles.css`

**Interfaces:**
- Consumes: `Viewport`, `Point` from Task 1; `Canvas` from Task 4.
- Produces: `CanvasHud({ viewport, cursor, selectedId }): JSX.Element`.

- [ ] **Step 1: Write the HUD component**

Create `src/renderer/canvas/CanvasHud.tsx`:

```tsx
import type { JSX } from 'react'
import type { Point, Viewport } from './viewport'

export interface CanvasHudProps {
  viewport: Viewport
  cursor: Point
  selectedId: string | null
}

/**
 * Zoom, world-space cursor position, and current selection. This is the
 * fastest way to see the coordinate math misbehaving: if the world coordinates
 * do not stay put under a stationary cursor while zooming, zoomAt is wrong.
 */
export function CanvasHud({ viewport, cursor, selectedId }: CanvasHudProps): JSX.Element {
  return (
    <div className="canvas-hud">
      <span>{Math.round(viewport.scale * 100)}%</span>
      <span>
        {Math.round(cursor.x)}, {Math.round(cursor.y)}
      </span>
      <span>{selectedId ?? '—'}</span>
    </div>
  )
}
```

- [ ] **Step 2: Track the cursor in world space and render the HUD**

In `src/renderer/canvas/Canvas.tsx`, replace the whole component body so the local-point conversion is shared by click and move:

```tsx
import { useRef, useState, type JSX, type MouseEvent } from 'react'
import { CanvasHud } from './CanvasHud'
import { PlaceholderPanel } from './PlaceholderPanel'
import { useViewport } from './useViewport'
import { hitTest, screenToWorld, type Point, type WorldRect } from './viewport'

export interface CanvasProps {
  rects: WorldRect[]
}

export function Canvas({ rects }: CanvasProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewport = useViewport(hostRef, rects)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [cursor, setCursor] = useState<Point>({ x: 0, y: 0 })

  /** The one place client coordinates become canvas-local coordinates. */
  const toWorld = (event: MouseEvent<HTMLDivElement>): Point | null => {
    const host = hostRef.current
    if (!host) return null
    const bounds = host.getBoundingClientRect()
    return screenToWorld(
      { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
      viewport
    )
  }

  const onClick = (event: MouseEvent<HTMLDivElement>): void => {
    const world = toWorld(event)
    if (world) setSelectedId(hitTest(rects, world))
  }

  const onMouseMove = (event: MouseEvent<HTMLDivElement>): void => {
    const world = toWorld(event)
    if (world) setCursor(world)
  }

  return (
    <div className="canvas" ref={hostRef} onClick={onClick} onMouseMove={onMouseMove}>
      <div
        className="world"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`
        }}
      >
        {rects.map((rect) => (
          <PlaceholderPanel key={rect.id} rect={rect} selected={rect.id === selectedId} />
        ))}
      </div>
      <CanvasHud viewport={viewport} cursor={cursor} selectedId={selectedId} />
    </div>
  )
}
```

- [ ] **Step 3: Style the HUD**

Append to `src/renderer/styles.css`:

```css
.canvas-hud {
  position: absolute;
  right: 12px;
  bottom: 12px;
  display: flex;
  gap: 14px;
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--chrome-bg);
  color: var(--muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  user-select: none;
  pointer-events: none;
}
```

`pointer-events: none` matters: without it the HUD swallows clicks near the bottom-right corner and hit-testing appears broken in exactly one region.

- [ ] **Step 4: Typecheck and verify by hand**

Run: `npm run typecheck && npm run dev`

Confirm:
1. Clicking a rectangle outlines it in blue; clicking empty space clears it.
2. Selection still works correctly after zooming and panning — this is the check that proves `screenToWorld`. If clicks land on the wrong rectangle at a zoom other than 100%, the inverse transform is wrong.
3. With the cursor held still while zooming, the HUD's world coordinates stay fixed.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/canvas/CanvasHud.tsx src/renderer/canvas/Canvas.tsx src/renderer/styles.css
git commit -m "feat(m2): click-to-select and a coordinate HUD

Selection exercises the inverse transform end to end: client -> canvas-local
-> screenToWorld -> hitTest. The HUD makes a wrong zoomAt visible immediately,
since world coordinates under a stationary cursor must not move while zooming."
```

---

### Task 6: Integration checks under real Electron

**Files:**
- Create: `scripts/verify-canvas.cjs`
- Modify: `src/main/index.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: the built renderer from `npm run build`; `.world` and `.canvas` class names from Tasks 4–5.
- Produces: `verify:canvas` npm script.

- [ ] **Step 1: Add the page-zoom guard in main**

In `src/main/index.ts`, inside `createWindow()`, immediately after the `attachPtyLifecycle(...)` call, add:

```ts
  // Belt and braces against Chromium's own pinch-to-zoom. The renderer already
  // preventDefaults ctrl+wheel, but a missed path must not be able to zoom the
  // whole UI, which would silently break every coordinate the canvas computes.
  mainWindow.webContents.setVisualZoomLevelLimits(1, 1).catch((error: unknown) => {
    console.warn('[window] could not pin visual zoom', error)
  })
```

- [ ] **Step 2: Write the failing test**

Create `scripts/verify-canvas.cjs`:

```js
/* Verifies the canvas in a real renderer.
   Run with: npm run build && npm run verify:canvas

   Runs under real Electron because the assertions are about things a unit test
   structurally cannot reach: real input events, the computed CSS transform,
   and whether Chromium page-zoomed instead of the canvas. The window is never
   shown. */
const { join } = require('node:path')
const { app, BrowserWindow } = require('electron')

const results = []
const ok = (n, pass, detail) => {
  results.push({ n, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** The 6 numbers of a CSS matrix(): [a, b, c, d, e, f] = scale/skew/translate. */
const parseMatrix = (value) => {
  const m = /matrix\(([^)]+)\)/.exec(value || '')
  if (!m) return null
  const parts = m[1].split(',').map((n) => parseFloat(n.trim()))
  return { scale: parts[0], x: parts[4], y: parts[5] }
}

const readTransform = (wc) =>
  wc.executeJavaScript(
    `getComputedStyle(document.querySelector('.world')).transform`
  ).then(parseMatrix)

app.on('window-all-closed', () => {})

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '..', 'out', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  await win.loadFile(join(__dirname, '..', 'out', 'renderer', 'index.html')).catch(() => {})
  await sleep(800)

  const wc = win.webContents
  const before = await readTransform(wc)
  ok('1 the world layer renders with a transform', before !== null, JSON.stringify(before))

  // A two-finger scroll: no modifiers. Must translate, must not scale.
  wc.sendInputEvent({ type: 'mouseWheel', x: 600, y: 400, deltaX: 0, deltaY: -120, canScroll: true })
  await sleep(400)
  const panned = await readTransform(wc)
  ok('2 a bare wheel pans without scaling',
    panned && panned.scale === before.scale && panned.y !== before.y,
    `scale ${before?.scale} -> ${panned?.scale}, y ${before?.y} -> ${panned?.y}`)

  // A pinch: ctrl held. Must scale the canvas, and must NOT page-zoom.
  wc.sendInputEvent({
    type: 'mouseWheel', x: 600, y: 400, deltaX: 0, deltaY: -120,
    modifiers: ['control'], canScroll: true
  })
  await sleep(400)
  const zoomed = await readTransform(wc)
  ok('3 a ctrl wheel zooms the canvas',
    zoomed && zoomed.scale > panned.scale,
    `scale ${panned?.scale} -> ${zoomed?.scale}`)

  const pageZoom = await wc.executeJavaScript(
    `require('electron').webFrame.getZoomLevel()`
  ).catch(() => 'unavailable')
  ok('4 Chromium page zoom is untouched by the pinch', pageZoom === 0, `zoomLevel ${pageZoom}`)

  console.log('\n' + '='.repeat(60))
  const failed = results.filter((r) => !r.pass)
  console.log(`${results.length - failed.length}/${results.length} passed`)
  if (failed.length) console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
  app.exit(failed.length ? 1 : 0)
})
```

Note on check 4: `webFrame` is renderer-side, so it must be read through `executeJavaScript`, not called from main. If `contextIsolation` blocks the `require`, replace the expression with `window.devicePixelRatio` captured before and after and assert it is unchanged — the point is only that the page itself did not zoom.

- [ ] **Step 3: Add the npm script**

In `package.json`, add after `verify:viewport`:

```json
"verify:canvas": "unset ELECTRON_RUN_AS_NODE && node_modules/electron/dist/Electron.app/Contents/MacOS/Electron scripts/verify-canvas.cjs"
```

And extend the aggregate:

```json
"verify": "npm run verify:viewport && npm run verify:pty && npm run verify:pty-manager && npm run verify:window && npm run verify:ipc && npm run build && npm run verify:canvas"
```

- [ ] **Step 4: Run the test**

Run: `npm run build && npm run verify:canvas`
Expected: `4/4 passed`

If check 4 fails with a non-zero zoom level, `preventDefault()` is not reaching the wheel event — confirm the listener in `useViewport.ts` is attached with `{ passive: false }` and not via a JSX `onWheel` prop.

- [ ] **Step 5: Run the whole suite and commit**

```bash
npm run verify
git add scripts/verify-canvas.cjs src/main/index.ts package.json
git commit -m "test(m2): drive the canvas with real input under Electron

Asserts what unit tests cannot: that a bare wheel translates without scaling,
that a ctrl wheel scales the canvas, and that Chromium's page zoom stayed at 0
rather than zooming the whole UI behind our backs."
```

---

### Task 7: Documentation

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything from Tasks 1–6.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Update the verification list**

In `README.md`, in the fenced block under "Getting started", add the two new scripts alongside the existing ones:

```sh
npm run verify:viewport      # canvas coordinate math, plain node
npm run verify:canvas        # real input into the built renderer
```

- [ ] **Step 2: Document the canvas in the architecture section**

Add this subsection to `README.md` after the existing "Three things that are non-obvious" entries:

```markdown
**One transform, not N layouts.** The canvas is a single `.world` element
carrying `transform: translate(...) scale(...)`; panels are positioned once in
world coordinates and never recomputed. This is not only a performance choice.
A CSS `scale()` on an ancestor is invisible to `getComputedStyle` and
`ResizeObserver` — which are exactly what xterm's `FitAddon` consults — so
zooming cannot change a panel's cols/rows. The alternative, computing each
panel's pixel size per frame, would reflow the running shell on every zoom
gesture.

The same transform-blindness is why pointer coordinates need explicit
correction: `getBoundingClientRect()` is transform-aware while
`dimensions.css.cell.width` is not. `screenToWorld` in
`src/renderer/canvas/viewport.ts` is the function that corrects them, and M3
feeds its output to xterm.
```

- [ ] **Step 3: Update the milestone table**

Change the M2 row in `README.md` to:

```markdown
| M2 | Infinite canvas: pan/zoom, dumb rectangles, coordinate math | ✅ in review |
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(m2): document the canvas transform and its verification"
```

---

## Definition of Done

- [ ] `npm run verify` passes end to end (viewport, pty, pty-manager, window, ipc, build, canvas)
- [ ] `npm run typecheck` clean
- [ ] `npm run build` clean
- [ ] Manual pass in `npm run dev`: pan, pinch-zoom-at-cursor, `Cmd+0/1/=/-`, click-to-select correct at a zoom other than 100%, no page zoom of the window chrome
- [ ] `viewport.ts` contains no DOM or React imports; `canvas-input.ts` contains no React import
