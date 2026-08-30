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
  format: 'cjs',
  // The verify bundles resolved no aliases until M4b, and got away with it
  // because every cross-boundary import was `import type` (erased by esbuild).
  // panel-interaction.ts now imports a real VALUE from @shared, so the alias
  // has to exist or the bundle fails with "Could not resolve".
  alias: { '@shared': join(__dirname, '..', 'src', 'shared') }
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

// ---------------------------------------------------------------------------
// M4a: panel interaction geometry (26-34)
// ---------------------------------------------------------------------------

/** A drag that starts at the centre of `rect` in world space. */
const dragFrom = (rect, mode) => ({
  panelId: rect.id,
  mode,
  originRect: rect,
  originWorld: { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }
})

const RECT = { id: 'p', x: 100, y: 50, w: 720, h: 460 }
const MOVE = { kind: 'move' }

// 26. A move translates by the world delta and changes nothing else.
{
  const state = dragFrom(RECT, MOVE)
  const out = V.applyDrag(state, { x: state.originWorld.x + 30, y: state.originWorld.y - 12 })
  ok('26 a move translates by the world delta',
    out.x === 130 && out.y === 38 && out.w === RECT.w && out.h === RECT.h,
    JSON.stringify(out))
}

// 27. A fixed SCREEN gesture maps to a world distance proportional to 1/scale
//     — the linearity of screenToWorld composed with applyDrag. This does NOT
//     catch the delta trap (screenToWorld(p2 - p1) instead of screenToWorld(p2)
//     - screenToWorld(p1)): that mistake is made by a CALLER before
//     applyDrag ever runs, and applyDrag receives only the two already-
//     resolved world points here, so it cannot commit or reveal that bug.
//     verify:panels check 10 (Task 5) is what actually catches it: a real
//     drag gesture at a non-1 scale asserting the panel moved
//     screenDelta / scale.
{
  const SCREEN_FROM = { x: 400, y: 300 }
  const SCREEN_TO = { x: 500, y: 300 }
  const distances = {}
  for (const scale of [0.5, 1, 2]) {
    const vp = { x: 137, y: -42, scale }
    const w1 = V.screenToWorld(SCREEN_FROM, vp)
    const w2 = V.screenToWorld(SCREEN_TO, vp)
    const state = { panelId: 'p', mode: MOVE, originRect: RECT, originWorld: w1 }
    distances[scale] = V.applyDrag(state, w2).x - RECT.x
  }
  ok('27 a fixed screen drag covers 1/scale world units',
    near(distances[0.5], 200) && near(distances[1], 100) && near(distances[2], 50),
    JSON.stringify(distances))
}

// 28. applyDrag is stateless: its result depends only on its arguments, so
//     calling it 50 times against the same unmutated state cannot differ from
//     calling it once with the final point. This does NOT catch a caller that
//     accumulates per-frame deltas into its OWN state before calling
//     applyDrag — no stateless function with this signature can fail that
//     way, since there is no state here to accumulate into. That caller-side
//     bug is covered by the same Task 5 check as 27, verify:panels check 10.
{
  const state = dragFrom(RECT, MOVE)
  const target = { x: state.originWorld.x + 333, y: state.originWorld.y + 77 }
  const direct = V.applyDrag(state, target)
  let stepped = null
  for (let i = 1; i <= 50; i++) {
    stepped = V.applyDrag(state, {
      x: state.originWorld.x + (333 * i) / 50,
      y: state.originWorld.y + (77 * i) / 50
    })
  }
  ok('28 a drag depends on cursor position, not frame count',
    near(stepped.x, direct.x) && near(stepped.y, direct.y),
    `${JSON.stringify(stepped)} vs ${JSON.stringify(direct)}`)
}

// 29. Zoom changing mid-drag does not corrupt the result. The caller converts
//     the cursor to world space with the CURRENT viewport; because applyDrag
//     works from originWorld rather than from the previous frame, the panel
//     ends up under the cursor either way.
{
  const SCREEN_END = { x: 900, y: 640 }
  const vpStart = { x: 0, y: 0, scale: 1 }
  const vpEnd = { x: 0, y: 0, scale: 0.25 }
  const originWorld = V.screenToWorld({ x: 400, y: 300 }, vpStart)
  const state = { panelId: 'p', mode: MOVE, originRect: RECT, originWorld }
  const endWorld = V.screenToWorld(SCREEN_END, vpEnd)
  const out = V.applyDrag(state, endWorld)
  ok('29 zoom changing mid-drag keeps the panel under the cursor',
    near(out.x - RECT.x, endWorld.x - originWorld.x) &&
      near(out.y - RECT.y, endWorld.y - originWorld.y),
    JSON.stringify(out))
}

// 30. Resizing east changes width only. x/y must never move: a resize that
//     drifts the origin is the exact bug that dropping the n/w edges avoids.
{
  const state = dragFrom(RECT, { kind: 'resize', edge: 'e' })
  const out = V.applyDrag(state, { x: state.originWorld.x + 80, y: state.originWorld.y + 80 })
  ok('30 resize e changes width only',
    out.w === RECT.w + 80 && out.h === RECT.h && out.x === RECT.x && out.y === RECT.y,
    JSON.stringify(out))
}

// 31. Resizing south changes height only.
{
  const state = dragFrom(RECT, { kind: 'resize', edge: 's' })
  const out = V.applyDrag(state, { x: state.originWorld.x + 80, y: state.originWorld.y + 80 })
  ok('31 resize s changes height only',
    out.h === RECT.h + 80 && out.w === RECT.w && out.x === RECT.x && out.y === RECT.y,
    JSON.stringify(out))
}

// 32. Resizing south-east changes both.
{
  const state = dragFrom(RECT, { kind: 'resize', edge: 'se' })
  const out = V.applyDrag(state, { x: state.originWorld.x - 40, y: state.originWorld.y + 25 })
  ok('32 resize se changes both dimensions',
    out.w === RECT.w - 40 && out.h === RECT.h + 25 && out.x === RECT.x && out.y === RECT.y,
    JSON.stringify(out))
}

// 33. A resize dragged far past the floor stops AT the floor and never
//     inverts. A negative width would make xterm's fit() compute a
//     nonsensical grid rather than throw.
{
  const state = dragFrom(RECT, { kind: 'resize', edge: 'se' })
  const out = V.applyDrag(state, {
    x: state.originWorld.x - 99999,
    y: state.originWorld.y - 99999
  })
  ok('33 a resize clamps to the minimum size',
    out.w === V.MIN_PANEL_W && out.h === V.MIN_PANEL_H,
    JSON.stringify(out))
}

// 34. The panels helpers are pure: they return new arrays and never mutate.
{
  const panels = [
    { rect: { id: 'a', x: 0, y: 0, w: 10, h: 10 }, spec: { panelId: 'a', cwd: '~', args: [] }, z: 1 },
    { rect: { id: 'b', x: 0, y: 0, w: 10, h: 10 }, spec: { panelId: 'b', cwd: '~', args: [] }, z: 2 }
  ]
  const snapshot = JSON.stringify(panels)
  const moved = V.setPanelRect(panels, 'a', { id: 'a', x: 99, y: 99, w: 10, h: 10 })
  const removed = V.removePanel(panels, 'a')
  const raised = V.raisePanel(panels, 'a')
  ok('34 panels helpers are pure and correct',
    JSON.stringify(panels) === snapshot &&
      moved[0].rect.x === 99 && panels[0].rect.x === 0 &&
      removed.length === 1 && removed[0].rect.id === 'b' &&
      raised.find((p) => p.rect.id === 'a').z === 3 &&
      V.nextZ(panels) === 3,
    `nextZ=${V.nextZ(panels)} raisedZ=${raised.find((p) => p.rect.id === 'a').z}`)
}

// ---------------------------------------------------------------------------
// M4a: pointer correction (35-37)
// ---------------------------------------------------------------------------

// The panel slot as the browser reports it: getBoundingClientRect is
// transform-aware, so `left` is already a SCREEN pixel coordinate.
const SLOT = { left: 300, top: 200 }

// 35. At scale 1 the point is returned untouched. This is the common case and
//     it must cost nothing and change nothing.
{
  const p = { x: 512, y: 377 }
  const out = V.correctForScale(p, SLOT, 1)
  ok('35 correctForScale is identity at scale 1',
    out.x === p.x && out.y === p.y, JSON.stringify(out))
}

// 36. The offset from the slot's origin is divided by the scale, while the
//     origin itself is preserved. That combination is the whole fix: xterm
//     computes `clientX - rect.left` and divides by an UNSCALED cell width,
//     so the offset must arrive already in CSS pixels.
{
  const out = V.correctForScale({ x: 300 + 400, y: 200 + 100 }, SLOT, 2)
  ok('36 correctForScale halves the offset at scale 2',
    near(out.x - SLOT.left, 200) && near(out.y - SLOT.top, 50),
    `offset ${out.x - SLOT.left}, ${out.y - SLOT.top}`)
}

// 37. Below 1:1 the offset grows. Checked across a spread, and expressed as
//     the property rather than as four hardcoded numbers: corrected offset
//     times scale must return the original screen offset, at every scale.
{
  let worst = 0
  for (const scale of [0.1, 0.25, 0.5, 0.9, 1.1, 2, 3]) {
    for (const p of [{ x: 300, y: 200 }, { x: 640, y: 480 }, { x: 12, y: 999 }]) {
      const out = V.correctForScale(p, SLOT, scale)
      worst = Math.max(
        worst,
        Math.abs((out.x - SLOT.left) * scale - (p.x - SLOT.left)),
        Math.abs((out.y - SLOT.top) * scale - (p.y - SLOT.top))
      )
    }
  }
  ok('37 correcting then rescaling round-trips at every scale', worst < EPS,
    `worst drift ${worst}`)
}

// 38. Below 1:1 is where the uncorrected error was largest and where the gate
//     used to refuse input entirely. A concrete sub-1 scale pin that the offset
//     doubles (opposite of check 36). At scale 0.5, input point (500, 300) with
//     slot (300, 200): offset is (200, 100) screen pixels; divided by 0.5 gives
//     (400, 200) CSS pixels; corrected point is (300+400, 200+200) = (700, 400).
{
  const out = V.correctForScale({ x: 500, y: 300 }, SLOT, 0.5)
  ok('38 correctForScale doubles the offset at scale 0.5',
    near(out.x - SLOT.left, 400) && near(out.y - SLOT.top, 200),
    `offset ${out.x - SLOT.left}, ${out.y - SLOT.top}`)
}

// 39. The non-finite / non-positive guard. A corrupted viewport is the only
//     way to get here, but the consequence of not guarding is specific: the
//     division would emit NaN or Infinity, and xterm-pointer.ts copies the
//     result straight into a synthetic MouseEvent's clientX/clientY. Returning
//     the input unchanged leaves the click merely uncorrected instead. Checked
//     against a POINT OFFSET FROM THE SLOT — an input equal to the slot origin
//     is a fixed point of the real arithmetic and would pass without a guard.
{
  const p = { x: SLOT.left + 400, y: SLOT.top + 100 }
  const same = (scale) => {
    const out = V.correctForScale(p, SLOT, scale)
    return out.x === p.x && out.y === p.y
  }
  ok('39 correctForScale returns the point unchanged for a corrupt scale',
    same(0) && same(NaN) && same(-2) && same(Infinity),
    `0=${same(0)} NaN=${same(NaN)} -2=${same(-2)} Infinity=${same(Infinity)}`)
}

// 40. push/undo/redo is the basic contract.
{
  let h = V.createHistory('a')
  h = V.pushHistory(h, 'b')
  h = V.pushHistory(h, 'c')
  const u1 = V.undoHistory(h)
  const u2 = V.undoHistory(u1)
  const r1 = V.redoHistory(u2)
  ok('40 push then undo then redo walks the states',
    h.present === 'c' && u1.present === 'b' && u2.present === 'a' && r1.present === 'b',
    `${h.present} ${u1.present} ${u2.present} ${r1.present}`)
}

// 41. Undoing past the start and redoing past the end are no-ops, not throws
//     and not undefined. Cmd+Z on a fresh canvas must do nothing quietly.
{
  const fresh = V.createHistory('a')
  const back = V.undoHistory(fresh)
  const fwd = V.redoHistory(fresh)
  ok('41 undo past the beginning and redo past the end are no-ops',
    back.present === 'a' && fwd.present === 'a' &&
    V.canUndo(fresh) === false && V.canRedo(fresh) === false,
    `${back.present} ${fwd.present}`)
}

// 42. A new action after an undo drops the redo branch. Keeping it would let
//     Cmd+Shift+Z jump to a state that never followed the current one.
{
  let h = V.pushHistory(V.createHistory('a'), 'b')
  h = V.undoHistory(h)
  h = V.pushHistory(h, 'c')
  ok('42 a new action after an undo clears the redo branch',
    h.present === 'c' && V.canRedo(h) === false && h.future.length === 0,
    `present=${h.present} future=${h.future.length}`)
}

// 43. The cap bounds memory across a long session. The OLDEST entry is the one
//     dropped — dropping the newest would make the most recent edit unundoable.
{
  let h = V.createHistory(0)
  for (let i = 1; i <= V.HISTORY_LIMIT + 10; i += 1) h = V.pushHistory(h, i)
  ok('43 the past is capped and drops the oldest entry',
    h.past.length === V.HISTORY_LIMIT && h.past[0] === 10,
    `len=${h.past.length} oldest=${h.past[0]}`)
}

// 44. Pure: no input is mutated. Canvas holds these in React state, and a
//     mutated "previous" object is a re-render that never happens.
{
  const h = V.pushHistory(V.createHistory('a'), 'b')
  const before = JSON.stringify(h)
  V.undoHistory(h)
  V.pushHistory(h, 'z')
  ok('44 history operations never mutate their input', JSON.stringify(h) === before)
}

// 45. Pushing the SAME state is still a distinct entry. Canvas pushes on
//     gesture commit, and a drag that ends where it started is a real (if
//     pointless) edit; collapsing it here would need value equality this
//     module has no business defining.
{
  const h = V.pushHistory(V.createHistory('a'), 'a')
  ok('45 pushing an equal state still records an entry',
    V.canUndo(h) === true && h.past.length === 1, `past=${h.past.length}`)
}

// 46. A dormant panel is never promoted, even sitting in the middle of the
//     viewport. This is what makes panning a restored canvas spawn nothing.
{
  const rects = [{ id: 'a', x: 0, y: 0, w: 400, h: 300 }, { id: 'b', x: 500, y: 0, w: 400, h: 300 }]
  const base = { rects, viewport: { x: 0, y: 0, scale: 1 }, size: { width: 1600, height: 900 }, focusedId: null, lastFocusedAt: {} }
  const plain = V.assignTiers(base)
  const withDormant = V.assignTiers({ ...base, dormantIds: new Set(['a']) })
  ok('46 a dormant panel is not promoted even when fully visible',
    plain.a === 'live' && withDormant.a === 'card' && withDormant.b === 'live',
    `plain.a=${plain.a} dormant.a=${withDormant.a} b=${withDormant.b}`)
}

// 47. THE PRECEDENCE RULE. assignTiers pins the focused panel live
//     unconditionally, so restoring focus onto a restored panel would spawn a
//     process at boot — contradicting "dormant until clicked". Dormancy wins.
{
  const rects = [{ id: 'a', x: 0, y: 0, w: 400, h: 300 }]
  const tiers = V.assignTiers({
    rects, viewport: { x: 0, y: 0, scale: 1 }, size: { width: 1600, height: 900 },
    focusedId: 'a', lastFocusedAt: {}, dormantIds: new Set(['a'])
  })
  ok('47 dormancy outranks focus', tiers.a === 'card', `a=${tiers.a}`)
}

// 48. makePanel honours a supplied spec and size, and the minted id beats the
//     spec's. panelId: 'stale' is deliberately NOT the minted id. With them
//     equal, both spread orders produce the same object and a reversed override
//     — which silently gives two panels one session, so one vanishes — would
//     pass unnoticed. This is the assertion that can see the difference.
{
  const centre = { x: 100, y: 100 }
  const plain = V.makePanel('n1', centre, 1)
  const custom = V.makePanel('n2', centre, 2,
    { panelId: 'stale', cwd: '/tmp/repo', command: 'claude', args: [] },
    { w: 400, h: 300 })
  ok("48 makePanel honours a supplied spec and size, and the minted id beats the spec's",
    plain.spec.command === undefined && plain.rect.w === V.PANEL_W &&
      custom.spec.panelId === 'n2' &&
      custom.spec.command === 'claude' && custom.spec.cwd === '/tmp/repo' &&
      custom.rect.w === 400 && custom.rect.h === 300 &&
      custom.rect.x === centre.x - 200 && custom.rect.y === centre.y - 150,
    `panelId=${custom.spec.panelId} rect=${JSON.stringify(custom.rect)}`)
}

// 49. centreOn puts the rect's centre at the viewport's centre, at any scale.
{
  let worst = 0
  const size = { width: 1200, height: 800 }
  const rect = { id: 'n1', x: 3000, y: -1500, w: 480, h: 320 }
  for (const vp of VIEWPORTS) {
    const next = V.centreOn(vp, rect, size)
    const centre = V.worldToScreen({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }, next)
    worst = Math.max(worst, Math.abs(centre.x - size.width / 2), Math.abs(centre.y - size.height / 2))
  }
  ok('49 centreOn centres the rect at every scale', worst < EPS, `worst drift ${worst}`)
}

// 50. centreOn does NOT change the scale. Framing a panel by zooming to it
//     would reflow nothing (the world transform is scale-blind to xterm) but
//     would throw away the zoom level the user chose — and Cmd+1 already
//     exists for "fit everything".
{
  const size = { width: 1200, height: 800 }
  const rect = { id: 'n1', x: 10, y: 10, w: 100, h: 100 }
  const kept = VIEWPORTS.every((vp) => V.centreOn(vp, rect, size).scale === vp.scale)
  ok('50 centreOn preserves scale', kept)
}

// 51. cascadeCentre leaves a spawn that coincides with NOTHING exactly where it
//     was — including one that merely overlaps an existing panel. This is the
//     check that pins "centres, not rects". Overlap is the normal state of a
//     working canvas (two 720x460 panels can barely both be on screen in a
//     1400x900 window without touching), so an overlap-based rule would step
//     nearly every press away from where the user is looking — which is the
//     explicit spec item verify:panels 7 exists to pin. The defect being fixed
//     is INDISTINGUISHABILITY: perfect coincidence is the only state with no
//     visual evidence the second panel exists at all, and where the buried
//     panel's close button is unreachable while it still holds a WebGL context
//     and a LIVE_BUDGET slot. Overlap you can see, raise, and drag apart.
{
  const centre = { x: 500, y: 400 }
  const heavyOverlap = [V.makePanel('a', { x: centre.x + V.PANEL_W / 2, y: centre.y + V.PANEL_H / 2 }, 1)]
  const oneStepAway = [V.makePanel('a', { x: centre.x + V.CASCADE_STEP, y: centre.y + V.CASCADE_STEP }, 1)]
  const justOutside = [V.makePanel('a', { x: centre.x + V.CASCADE_EPSILON * 2, y: centre.y }, 1)]
  // The function must not sort, splice or otherwise touch the array it is
  // handed: it runs inside setPanels' updater, where `current` is React's own
  // state array.
  const snapshot = JSON.stringify(heavyOverlap)
  const unchanged = (panels) => {
    const r = V.cascadeCentre(centre, panels)
    return r.x === centre.x && r.y === centre.y
  }
  ok('51 cascadeCentre moves only a COINCIDENT spawn, never a merely overlapping one',
    unchanged([]) && unchanged(heavyOverlap) && unchanged(oneStepAway) && unchanged(justOutside) &&
      JSON.stringify(heavyOverlap) === snapshot,
    `empty=${unchanged([])} overlap=${unchanged(heavyOverlap)} ` +
      `step=${unchanged(oneStepAway)} outside=${unchanged(justOutside)}`)
}

// 52. An exact coincidence steps exactly one step, DOWN and RIGHT. The
//     direction is not arbitrary: the new panel takes nextZ and paints on top,
//     so stepping down-right is what leaves the older panel's chrome — its
//     title and its close button — uncovered. Up-left would put the new
//     chrome straight over the old one and buy nothing.
{
  const centre = { x: -320, y: 96 }
  const one = [V.makePanel('a', centre, 1)]
  const r = V.cascadeCentre(centre, one)
  ok('52 an exact coincidence steps one CASCADE_STEP, down and right',
    r.x === centre.x + V.CASCADE_STEP && r.y === centre.y + V.CASCADE_STEP,
    `${JSON.stringify(r)} from ${JSON.stringify(centre)} step=${V.CASCADE_STEP}`)
}

// 53. Repeated spawns walk the lattice — the real Cmd+N sequence, feeding the
//     function its own output and appending a panel at each result. Check 52
//     passes for an implementation that steps once and gives up; only the run
//     separates "step and re-test" from "step".
{
  const centre = { x: 0, y: 0 }
  const panels = []
  const placed = []
  for (let i = 0; i <= V.CASCADE_MAX_STEPS; i++) {
    const p = V.cascadeCentre(centre, panels)
    placed.push(p)
    panels.push(V.makePanel(`n${i}`, p, i + 1))
  }
  const stepped = placed.every((p, i) =>
    i === 0 || (p.x === placed[i - 1].x + V.CASCADE_STEP && p.y === placed[i - 1].y + V.CASCADE_STEP))
  const distinct = placed.every((p, i) =>
    placed.every((q, j) =>
      i === j || Math.abs(p.x - q.x) >= V.CASCADE_EPSILON || Math.abs(p.y - q.y) >= V.CASCADE_EPSILON))
  ok('53 repeated spawns walk the lattice one step at a time, never twice onto one slot',
    stepped && distinct && placed.length === V.CASCADE_MAX_STEPS + 1,
    `stepped=${stepped} distinct=${distinct} n=${placed.length}`)
}

// 54. CASCADE_EPSILON is strictly smaller than CASCADE_STEP — asserted as a
//     relation AND behaviourally (a slot one step from an occupied one must
//     read as free). The two constants are chosen independently and read as
//     unrelated. Invert them and a stepped candidate collides with the panel
//     it just stepped away from, so EVERY first press runs the whole lattice
//     and lands CASCADE_MAX_STEPS * CASCADE_STEP off centre — which surfaces
//     as a confusing verify:panels 7 centring failure with nothing anywhere
//     pointing at the epsilon.
{
  const centre = { x: 12, y: -8 }
  const one = [V.makePanel('a', centre, 1)]
  const target = { x: centre.x + V.CASCADE_STEP, y: centre.y + V.CASCADE_STEP }
  const r = V.cascadeCentre(target, one)
  ok('54 CASCADE_EPSILON < CASCADE_STEP, so a stepped slot reads as free',
    V.CASCADE_EPSILON < V.CASCADE_STEP && r.x === target.x && r.y === target.y,
    `eps=${V.CASCADE_EPSILON} step=${V.CASCADE_STEP} r=${JSON.stringify(r)}`)
}

// 55. The cascade is capped, and an exhausted one returns the ORIGINAL centre
//     rather than a slot further down. The bound is what the tiering argument
//     rests on: a panel walked outside the cull region is never promoted to
//     live, so it never spawns a PTY, and Cmd+N appears to do nothing at all —
//     which is a quieter failure than the stacking it replaced. Wrapping puts
//     the panel back under the user's eyes; marching loses it.
{
  const centre = { x: 1000, y: 1000 }
  const panels = []
  for (let i = 0; i <= V.CASCADE_MAX_STEPS; i++) {
    panels.push(V.makePanel(`n${i}`,
      { x: centre.x + i * V.CASCADE_STEP, y: centre.y + i * V.CASCADE_STEP }, i + 1))
  }
  const r = V.cascadeCentre(centre, panels)
  const reach = V.CASCADE_MAX_STEPS * V.CASCADE_STEP
  const bounded = Math.abs(r.x - centre.x) <= reach && Math.abs(r.y - centre.y) <= reach
  ok('55 an exhausted cascade wraps back to the original centre rather than marching',
    r.x === centre.x && r.y === centre.y && bounded,
    `${JSON.stringify(r)} centre=${JSON.stringify(centre)} reach=${reach}`)
}

// 56-65. edgeIndicator: where on the viewport edge to draw a pip pointing at
//     an off-screen panel, and which way to rotate it. This lives in
//     viewport.ts rather than in the component for one reason: the arithmetic
//     is wrong at scale !== 1 in a way that is invisible in a screenshot taken
//     at 100%, and only the plain-node tier can sweep scales cheaply.
const EDGE_SIZE = { width: 1400, height: 900 }
// A camera centred on the world origin at a chosen scale, built with the
// canvas's own verb rather than by hand so these checks cannot drift from
// what centreOn actually produces.
const cameraAt = (scale) =>
  V.centreOn({ x: 0, y: 0, scale }, { id: 'origin', x: -1, y: -1, w: 2, h: 2 }, EDGE_SIZE)
const M = V.EDGE_INDICATOR_MARGIN

// 56. A panel fully on screen gets no pip.
{
  const vp = cameraAt(1)
  const r = V.edgeIndicator({ id: 'a', x: -100, y: -80, w: 200, h: 160 }, vp, EDGE_SIZE)
  ok('56 an on-screen panel gets no edge indicator', r === null, JSON.stringify(r))
}

// 57. PARTIALLY on screen also gets no pip. This is the rule most likely to be
//     "simplified" into a fully-visible test, and the cost of getting it wrong
//     is a pip pointing at a panel the user is already looking at — noise on
//     the one surface whose whole job is to be believed.
{
  const vp = cameraAt(1)
  // Straddles the right edge: left half visible, right half off.
  const r = V.edgeIndicator({ id: 'a', x: 640, y: -80, w: 200, h: 160 }, vp, EDGE_SIZE)
  ok('57 a partially visible panel gets no edge indicator', r === null, JSON.stringify(r))
}

// 58-61. The four cardinal directions. The pip sits ON the inset box, and the
//     angle points from the viewport centre toward the panel.
{
  const vp = cameraAt(1)
  const right = V.edgeIndicator({ id: 'a', x: 5000, y: -80, w: 200, h: 160 }, vp, EDGE_SIZE)
  ok('58 a panel off the right edge pips at the right margin, pointing right',
    right !== null && near(right.x, EDGE_SIZE.width - M) && near(right.angle, 0),
    JSON.stringify(right))

  const left = V.edgeIndicator({ id: 'a', x: -5200, y: -80, w: 200, h: 160 }, vp, EDGE_SIZE)
  ok('59 a panel off the left edge pips at the left margin, pointing left',
    left !== null && near(left.x, M) && near(Math.abs(left.angle), Math.PI),
    JSON.stringify(left))

  const up = V.edgeIndicator({ id: 'a', x: -100, y: -5200, w: 200, h: 160 }, vp, EDGE_SIZE)
  ok('60 a panel off the top edge pips at the top margin, pointing up',
    up !== null && near(up.y, M) && near(up.angle, -Math.PI / 2),
    JSON.stringify(up))

  const down = V.edgeIndicator({ id: 'a', x: -100, y: 5000, w: 200, h: 160 }, vp, EDGE_SIZE)
  ok('61 a panel off the bottom edge pips at the bottom margin, pointing down',
    down !== null && near(down.y, EDGE_SIZE.height - M) && near(down.angle, Math.PI / 2),
    JSON.stringify(down))
}

// 62. A diagonal panel lands on whichever inset edge the ray leaves through,
//     and NEVER outside the box. A clamp-per-axis implementation (clamp x,
//     then clamp y, independently) puts the pip in the corner for every
//     diagonal, so every off-screen panel to the upper right points at the
//     same spot and the direction stops carrying information.
{
  const vp = cameraAt(1)
  const r = V.edgeIndicator({ id: 'a', x: 5000, y: -2000, w: 200, h: 160 }, vp, EDGE_SIZE)
  const inBox = r !== null &&
    r.x >= M - EPS && r.x <= EDGE_SIZE.width - M + EPS &&
    r.y >= M - EPS && r.y <= EDGE_SIZE.height - M + EPS
  // The ray leaves through the RIGHT edge here (the panel is much further out
  // horizontally than vertically), so x is pinned and y is not.
  const onRightEdge = r !== null && near(r.x, EDGE_SIZE.width - M) &&
    r.y > M + EPS && r.y < EDGE_SIZE.height / 2 - EPS
  ok('62 a diagonal panel pips on the edge its ray leaves through, inside the box',
    inBox && onRightEdge && r.angle > -Math.PI / 2 && r.angle < 0, JSON.stringify(r))
}

// 63. The pip is always ON the inset boundary — one coordinate pinned to a
//     margin — for a sweep of directions. A pip drawn at the panel's own
//     projected centre is off screen entirely and therefore invisible, which
//     looks exactly like the feature not being built.
{
  const vp = cameraAt(1)
  let worst = null
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2
    const rect = { id: 'a', x: Math.cos(a) * 6000, y: Math.sin(a) * 6000, w: 200, h: 160 }
    const r = V.edgeIndicator(rect, vp, EDGE_SIZE)
    const pinned = r !== null && (
      near(r.x, M) || near(r.x, EDGE_SIZE.width - M) ||
      near(r.y, M) || near(r.y, EDGE_SIZE.height - M))
    if (!pinned) worst = { a, r }
  }
  ok('63 every direction pips on the inset boundary', worst === null, JSON.stringify(worst))
}

// 64. DIRECTION IS SCALE-INVARIANT. The camera is centred on the same world
//     point at two very different zooms; the panel is off screen at both, so
//     the arrow must point the same way. An implementation that mixed world
//     units into the angle passes at scale 1 and is wrong everywhere else.
{
  const a = V.edgeIndicator({ id: 'a', x: 4000, y: -3000, w: 200, h: 160 }, cameraAt(0.25), EDGE_SIZE)
  const b = V.edgeIndicator({ id: 'a', x: 4000, y: -3000, w: 200, h: 160 }, cameraAt(2.75), EDGE_SIZE)
  ok('64 the pip direction is the same at scale 0.25 and 2.75',
    a !== null && b !== null && near(a.angle, b.angle),
    `${JSON.stringify(a)} vs ${JSON.stringify(b)}`)
}

// 65. VISIBILITY IS NOT. The same panel is on screen zoomed out and off screen
//     zoomed in, and this is the check that separates a scale-aware
//     implementation from one testing world coordinates against a screen-sized
//     box. That mistake yields no pips at all when zoomed in — the state the
//     whole feature is indistinguishable from.
{
  const rect = { id: 'a', x: 900, y: 0, w: 200, h: 160 }
  const out = V.edgeIndicator(rect, cameraAt(0.25), EDGE_SIZE)
  const inn = V.edgeIndicator(rect, cameraAt(2.75), EDGE_SIZE)
  ok('65 visibility is decided in screen space: on screen at 0.25, off at 2.75',
    out === null && inn !== null, `0.25 -> ${JSON.stringify(out)}, 2.75 -> ${JSON.stringify(inn)}`)
}

// 66-70. nextAttentionId: which panel Cmd+J visits next. Pure, and separated
//     from the store on purpose — every failure here is a keypress that lands
//     somewhere the user did not expect, which reads as the key being flaky
//     rather than as an off-by-one.
const Q = ['n1', 'n2', 'n3']

// 66. Nothing wants you: the key does nothing at all. Not "jump to the first
//     panel", which would make Cmd+J a random-navigation key on a quiet canvas.
ok('66 an empty queue has no next id',
  V.nextAttentionId([], null, 1) === null && V.nextAttentionId([], 'n1', -1) === null)

// 67. No cursor yet — the first press of the run. Forward starts at the head
//     (the panel that has been waiting longest, since the queue is in entry
//     order); backward starts at the tail.
ok('67 with no cursor, forward starts at the head and backward at the tail',
  V.nextAttentionId(Q, null, 1) === 'n1' && V.nextAttentionId(Q, null, -1) === 'n3')

// 68. It wraps at BOTH ends. A cycle that stops at the last entry strands the
//     user on one panel with no indication the key is still working.
ok('68 the cycle wraps in both directions',
  V.nextAttentionId(Q, 'n3', 1) === 'n1' && V.nextAttentionId(Q, 'n1', -1) === 'n3')

// 69. The cursor names a panel that has since left the queue — acknowledged,
//     closed, or exited between two presses. This is the common case, not an
//     exotic one: visiting a panel is what makes the user deal with it. It
//     must restart from the end the direction implies rather than returning
//     null, which would make the second press a silent no-op.
ok('69 a stale cursor restarts the cycle rather than dead-ending',
  V.nextAttentionId(Q, 'gone', 1) === 'n1' && V.nextAttentionId(Q, 'gone', -1) === 'n3')

// 70. One waiting panel, and the cursor is already on it. Returning the same
//     id is right: the camera re-frames the panel the user asked for. Skipping
//     it (returning null) would make Cmd+J do nothing in the single most
//     common state this feature has.
ok('70 a single-entry queue keeps returning that entry',
  V.nextAttentionId(['n1'], 'n1', 1) === 'n1' && V.nextAttentionId(['n1'], 'n1', -1) === 'n1')

// 71-72. reachableQueue: filters a phantom id out of the attention queue
//     before it ever reaches nextAttentionId. See attention.ts's own comment
//     for the failure this exists to prevent — a stale entry with no live
//     panel behind it seats the cursor on an id the user can never leave,
//     which is not "skip one press" but "the key is dead for the rest of the
//     renderer's life".

// 71. The filter itself: an unknown id is dropped, order and the known ids
//     are preserved.
{
  const known = new Set(['n1', 'n3'])
  const out = V.reachableQueue(['n1', 'n2', 'n3'], known)
  ok('71 reachableQueue drops an unknown id and preserves order',
    JSON.stringify(out) === JSON.stringify(['n1', 'n3']), JSON.stringify(out))
}

// 72. The actual regression: a queue whose HEAD is a phantom id (present in
//     the queue, absent from the known panel set) must still advance to a
//     real panel rather than sticking there forever. Composing reachableQueue
//     with nextAttentionId is what the call site is required to do — passing
//     the unfiltered queue straight to nextAttentionId reproduces the bug
//     this check exists to catch: the cursor seats on the phantom and every
//     later press re-picks it, because nothing ever removes it from the
//     queue nextAttentionId sees.
{
  const known = new Set(['n1', 'n2'])
  const filtered = V.reachableQueue(['ghost', 'n1', 'n2'], known)
  const id = V.nextAttentionId(filtered, null, 1)
  ok('72 a phantom at the head does not disable the jump',
    id === 'n1', `got ${id}`)
}

// 73. restoreCamera (M7's fourth camera verb, after resetViewport,
//     worldCentre and centreOn): a workspace switch restores x, y AND scale
//     exactly. Scale is the half that separates it from centreOn (49-50
//     above), which deliberately leaves scale untouched so framing a panel
//     never discards the zoom the user chose — restoreCamera exists because
//     a workspace's saved zoom is instead part of what it means to come back
//     to it. The hook (useViewport.ts) that wires this into setViewport
//     cannot run outside React, so the one property that matters — nothing
//     here is dropped or coerced — is pinned as pure math instead.
{
  const camera = { x: -4880, y: -2880, scale: 0.401877572016461 }
  const restored = V.restoreCamera(camera)
  ok('73 restoreCamera reproduces x, y and scale exactly',
    restored.x === camera.x && restored.y === camera.y && restored.scale === camera.scale,
    JSON.stringify(restored))
}

/* ---- M9b: the panel kind ---- */

// 74. A panel with NO `kind` at all reads as a TERMINAL panel. This is the
//     disk rule (absent means terminal — every layout.json predates the
//     field) stated as a runtime fact, and it is also what keeps every
//     fixture in every suite written before this milestone meaning what it
//     said. The direction is not symmetric and the asymmetry is the whole
//     check: a review node misread as a terminal fails loudly at
//     registry.ensure, while a terminal misread as a review node silently
//     stops spawning on every restored canvas.
ok('74 a panel with no kind is not a review panel',
  V.isReviewPanel({ rect: { id: 'n1', x: 0, y: 0, w: 720, h: 460 }, z: 1, spec: { cwd: '~', args: [] } }) === false)

// 75. makeReviewPanel centres EXACTLY, the contract check 48 pins for
//     makePanel. Placement is cascadeCentre's job and stays outside.
{
  const subject = { subjectId: 'n4', repoRoot: '/r', baselineSha: 'abc', label: 'claude' }
  const p = V.makeReviewPanel('r1', { x: 100, y: 50 }, 9, subject)
  ok('75 makeReviewPanel centres on the point it is given',
    p.kind === 'review' && p.rect.id === 'r1' && p.z === 9 &&
      p.rect.x === 100 - V.REVIEW_W / 2 && p.rect.y === 50 - V.REVIEW_H / 2)
}

// 76. THE ONE TO KNOW BY NUMBER. makePanel forces the minted id into
//     spec.panelId — a template carrying a stale one gives two panels one
//     session. Copying that line into makeReviewPanel is the obvious move
//     and it is catastrophic and silent: subject.subjectId would be
//     rewritten to the NODE's own id, so the node would be a review OF
//     ITSELF — a panel with no baseline, reporting never-started forever,
//     on a feature whose entire purpose is to report the subject's work.
//     The subject is a DIFFERENT panel and must be carried verbatim.
{
  const subject = { subjectId: 'n4', repoRoot: '/r', baselineSha: 'abc', label: 'claude' }
  const p = V.makeReviewPanel('r1', { x: 0, y: 0 }, 1, subject)
  ok('76 makeReviewPanel does NOT rewrite subjectId to its own id',
    p.subject.subjectId === 'n4' && p.subject.repoRoot === '/r' &&
      p.subject.baselineSha === 'abc' && p.subject.label === 'claude')
}

// 77. reviewCentre places the node BESIDE its subject — clear of the
//     subject's right edge, not on top of it. Asserted as a gap between the
//     two rects rather than as a coordinate, so the constants can move
//     without this check restating them.
{
  const subjectRect = { id: 'n4', x: 0, y: 0, w: 720, h: 460 }
  const c = V.reviewCentre(subjectRect)
  const left = c.x - V.REVIEW_W / 2
  ok('77 reviewCentre clears the subject\'s right edge',
    left >= subjectRect.x + subjectRect.w && c.y === subjectRect.y + V.REVIEW_H / 2)
}

// 78. A review node is an ordinary occupant of the cascade lattice: a second
//     node beside the same subject must not land byte-identically on the
//     first. cascadeCentre reads rects and knows nothing about kinds, which
//     is exactly the property being pinned — nothing here needed a special
//     case, and a later "optimisation" that filtered the panel list by kind
//     before cascading would reintroduce M6's indistinguishability bug for
//     review nodes alone.
{
  const subjectRect = { id: 'n4', x: 0, y: 0, w: 720, h: 460 }
  const c = V.reviewCentre(subjectRect)
  const existing = V.makeReviewPanel('r1', c, 1,
    { subjectId: 'n4', repoRoot: '/r', baselineSha: 'abc', label: 'claude' })
  const next = V.cascadeCentre(c, [existing])
  ok('78 a second review node cascades off the first',
    next.x === c.x + V.CASCADE_STEP && next.y === c.y + V.CASCADE_STEP)
}

// 79 — makeFilePanel centres exactly, the contract makePanel has (check 48).
{
  const f = V.makeFilePanel('f1', { x: 100, y: 200 }, 3, { path: '/tmp/a.txt' })
  ok('79 makeFilePanel centres exactly',
    f.kind === 'file'
      && f.rect.x === 100 - V.FILE_W / 2 && f.rect.y === 200 - V.FILE_H / 2
      && f.rect.w === V.FILE_W && f.rect.h === V.FILE_H && f.z === 3,
    `x=${f.rect.x} y=${f.rect.y}`)
}
// 80 — the source is carried VERBATIM and the object is not the same reference.
// makeReviewPanel's own comment warns about the copy-paste that rewrites a
// payload field with the minted id; this is that rule inherited. The
// not-same-reference clause matters because the caller's object may be reused.
{
  const src = { path: '/tmp/b.txt' }
  const f = V.makeFilePanel('f2', { x: 0, y: 0 }, 1, src)
  ok('80 makeFilePanel carries source verbatim without rewriting it',
    f.source.path === '/tmp/b.txt' && f.source !== src
      && !('panelId' in f.source) && Object.keys(f.source).length === 1,
    JSON.stringify(f.source))
}
// 80b — isTerminalPanel is the POSITIVE partition test, and its whole job is
// the two clauses that are not about terminals: a file panel and a review
// panel must BOTH answer false. A helper written as !isReviewPanel passes
// every terminal clause and lands a file panel in assignTiers with no spec.
{
  const t = V.makePanel('n1', { x: 0, y: 0 }, 1)
  const f = V.makeFilePanel('f3', { x: 0, y: 0 }, 1, { path: '/tmp/c' })
  const r = V.makeReviewPanel('r1', { x: 0, y: 0 }, 1,
    { subjectId: 'n1', repoRoot: '/r', baselineSha: 'abc', label: 'x' })
  // A pre-M9b panel: no `kind` key at all. It must still read as terminal.
  const legacy = { rect: { id: 'n9', x: 0, y: 0, w: 1, h: 1 }, z: 1, spec: { panelId: 'n9', cwd: '~', args: [] } }
  ok('80b isTerminalPanel excludes BOTH non-terminal kinds and still admits a kind-less panel',
    V.isTerminalPanel(t) === true && V.isTerminalPanel(f) === false
      && V.isTerminalPanel(r) === false && V.isTerminalPanel(legacy) === true
      && V.isFilePanel(f) === true && V.isFilePanel(t) === false)
}

console.log('\n' + '='.repeat(60))
const failed = results.filter((r) => !r.pass)
console.log(`${results.length - failed.length}/${results.length} passed`)
if (failed.length) {
  console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
  process.exit(1)
}
process.exit(0)
