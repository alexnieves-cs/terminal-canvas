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
  alias: {
    '@shared': join(__dirname, '..', 'src', 'shared'),
    // M13: link-geometry.ts imports linksOf — a real VALUE — from
    // @renderer/panels/panels. This bundle resolved only @shared until now for
    // the reason recorded just above: every other cross-boundary import in it
    // is an `import type`, which esbuild erases before resolving anything.
    '@renderer': join(__dirname, '..', 'src', 'renderer')
  }
})
const V = require(OUT)

const { ok, results } = require('./lib/checks.cjs').createChecks()
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

// 29b. A group drag is N independent applyDrag calls, each from that panel's
// own origin. A bounding-box translation can look right for equal panels, so
// these origins differ in both position and dimensions; every member must
// still get the same pointer delta and preserve its own shape.
{
  const a = { id: 'a', x: -250, y: 90, w: 720, h: 460 }
  const b = { id: 'b', x: 480, y: -130, w: 330, h: 610 }
  const originWorld = { x: 50, y: 75 }
  const target = { x: 173, y: -44 }
  const moved = [a, b].map((originRect) => V.applyDrag({
    panelId: originRect.id, mode: MOVE, originRect, originWorld
  }, target))
  const [movedA, movedB] = moved
  ok('29b a group move recomputes every member from its own origin',
    movedA.x === a.x + 123 && movedA.y === a.y - 119 &&
      movedB.x === b.x + 123 && movedB.y === b.y - 119 &&
      movedA.w === a.w && movedA.h === a.h &&
      movedB.w === b.w && movedB.h === b.h,
    JSON.stringify(moved))
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

// ---------------------------------------------------------------------------
// M13. Links between panels. `link`, never `edge`: EdgeIndicators.tsx and
// viewport.ts's edgeIndicator already mean the off-screen attention pip, and a
// second unrelated `edge` in renderer/canvas/ would make every future grep
// ambiguous between two features with nothing to do with each other.

// 79. addLink refuses a self-link and refuses a duplicate, and BOTH clauses
//     are required. A self-link is a segment with no direction — linkAnchors
//     answers null for it (check 85) — so it would persist forever as a link
//     that renders nothing, which is indistinguishable from a broken feature.
//     A duplicate A->B paints two identical overlapping paths, which is
//     cascadeCentre's indistinguishability argument reached through a
//     different door: the canvas looks like it holds one link while holding
//     two, and removing "the" link leaves one behind.
//
//     B->A alongside A->B is explicitly still allowed — they are different
//     claims — and that clause is what stops a fix for the duplicate case
//     over-correcting into "one link per pair".
{
  const mk = (id) => ({ kind: 'terminal', rect: { id, x: 0, y: 0, w: 10, h: 10 }, spec: { panelId: id, cwd: '~', args: [] }, z: 1 })
  const base = [mk('a'), mk('b')]
  const self = V.addLink(base, 'a', 'a')
  const once = V.addLink(base, 'a', 'b')
  const twice = V.addLink(once, 'a', 'b')
  const both = V.addLink(once, 'b', 'a')
  ok('79 addLink refuses a self-link and a duplicate, but allows the reverse',
    V.linksOf(self[0]).length === 0 &&
    V.linksOf(once[0]).length === 1 && V.linksOf(once[0])[0].to === 'b' &&
    V.linksOf(twice[0]).length === 1 &&
    V.linksOf(both[1]).length === 1 && V.linksOf(both[1])[0].to === 'a')
}

// 80. THE ONE WORTH KNOWING BY NUMBER. removePanel strips INCOMING links, not
//     only the outgoing ones that leave with the panel holding them. This is
//     backlog #24's named failure — "dangling edges are the standard failure
//     of every graph UI that stored ids without deciding this" — and putting
//     the prune inside removePanel rather than at its two call sites is what
//     makes the close and the prune land in ONE history entry, so one Cmd+Z
//     restores both (verify:panels 128).
//
//     Its second clause is the over-correction guard and is not redundant: an
//     implementation that stripped every link from every survivor satisfies
//     the first clause perfectly and silently empties the canvas of links on
//     any close at all.
{
  const mk = (id, links) => ({ kind: 'terminal', rect: { id, x: 0, y: 0, w: 10, h: 10 }, spec: { panelId: id, cwd: '~', args: [] }, z: 1, ...(links ? { links } : {}) })
  const panels = [mk('a', [{ to: 'b' }, { to: 'c' }]), mk('b', [{ to: 'c' }]), mk('c')]
  const next = V.removePanel(panels, 'c')
  const a = next.find((p) => p.rect.id === 'a')
  const b = next.find((p) => p.rect.id === 'b')
  ok('80 removePanel strips links POINTING AT the removed panel, and only those',
    next.length === 2 &&
    V.linksOf(a).length === 1 && V.linksOf(a)[0].to === 'b' &&
    V.linksOf(b).length === 0)
}

// 81. removeLink and setLinkLabel act on the ONE named link and leave its
//     neighbours alone. Asserted together because each alone passes against an
//     implementation that clears the whole array: removeLink's own success is
//     indistinguishable from "removed everything" when the fixture has one
//     link, so the fixture carries two.
{
  const mk = (id, links) => ({ kind: 'terminal', rect: { id, x: 0, y: 0, w: 10, h: 10 }, spec: { panelId: id, cwd: '~', args: [] }, z: 1, ...(links ? { links } : {}) })
  const panels = [mk('a', [{ to: 'b' }, { to: 'c' }])]
  const removed = V.removeLink(panels, 'a', 'b')
  const labelled = V.setLinkLabel(panels, 'a', 'c', 'feeds')
  const rows = V.linksOf(labelled[0])
  ok('81 removeLink and setLinkLabel touch one link each, never the array',
    V.linksOf(removed[0]).length === 1 && V.linksOf(removed[0])[0].to === 'c' &&
    rows.length === 2 &&
    rows.find((l) => l.to === 'c').label === 'feeds' &&
    rows.find((l) => l.to === 'b').label === undefined)
}

// 82. A panel with NO links key at all reads as no links, and that is the
//     ordinary case rather than an exotic one: it is every panel in every
//     layout.json ever written, and every panel this app mints. linksOf is the
//     one place that absence is normalised, so nothing downstream has to
//     remember `?? []` — a missed one is a TypeError inside a render, which
//     takes the whole canvas down rather than one link.
//
//     Its second clause pins that pruning a panel that pointed nowhere leaves
//     no `links: []` residue behind: otherwise every close rewrites an empty
//     array onto every survivor in layout.json, which is noise in a file
//     people read and diff.
{
  const bare = { kind: 'terminal', rect: { id: 'a', x: 0, y: 0, w: 10, h: 10 }, spec: { panelId: 'a', cwd: '~', args: [] }, z: 1 }
  const pruned = V.removePanel([bare], 'zz')[0]
  ok('82 a panel with no links key reads as no links, and stays that way',
    Array.isArray(V.linksOf(bare)) && V.linksOf(bare).length === 0 &&
    V.linksOf(pruned).length === 0 && !('links' in pruned))
}

// 83. The anchors sit on the two rects' BORDERS, not their centres. A line
//     drawn to a centre disappears under the panel it points at, so the
//     arrowhead — the only thing carrying direction — would never be visible.
//     Asserted on a horizontal pair, where the answer is exact and the check
//     cannot pass by being approximately right.
{
  const a = { id: 'a', x: 0, y: 0, w: 100, h: 100 }
  const b = { id: 'b', x: 300, y: 0, w: 100, h: 100 }
  const s = V.linkAnchors(a, b)
  ok('83 linkAnchors lands on both borders, not the centres',
    s !== null && near(s.x1, 100) && near(s.y1, 50) && near(s.x2, 300) && near(s.y2, 50))
}

// 84. THE ONE WORTH KNOWING BY NUMBER, and the only check that separates a ray
//     CLIP from a per-axis CLAMP. This is edgeIndicator's documented mistake
//     one file over (see "edgeIndicator clips a ray" in CLAUDE.md), and it
//     fails the same silent way: clamping dx to the half-width and dy to the
//     half-height independently sends every diagonal to a corner, so every
//     link leaves and enters a panel at the same four points regardless of the
//     true bearing — and still renders, and still looks like a working feature.
//
//     The fixture is deliberately a SHALLOW diagonal (dx 400, dy 100) on a
//     SQUARE rect: the x crossing binds, so the correct answer is on the right
//     EDGE at a y strictly between the centre and the corner, while the clamp
//     shorthand puts it exactly on the corner. A 45-degree fixture — the one
//     you would naturally reach for — could not tell them apart, because both
//     answers ARE the corner there. That is why the two deltas are unequal.
{
  const a = { id: 'a', x: -50, y: -50, w: 100, h: 100 }
  const b = { id: 'b', x: 350, y: 50, w: 100, h: 100 }
  const s = V.linkAnchors(a, b)
  // centre a = (0,0), centre b = (400,100). t binds on x at 50/400, so the
  // exit is (50, 12.5) — not the corner (50, 50) the clamp shorthand answers.
  const expectedY = 100 * (50 / 400)
  ok('84 linkAnchors CLIPS the ray rather than clamping the two axes',
    s !== null && near(s.x1, 50) && near(s.y1, expectedY) &&
    Math.abs(s.y1 - 50) > 1,
    s === null ? 'null' : `exit ${s.x1},${s.y1} (clamp would say 50,50)`)
}

// 85. Coincident centres answer null. There is no direction to draw, and
//     normalising a zero-length vector is how a NaN gets into a transform and
//     takes the WHOLE layer's paint with it — every link gone, not just this
//     one, with nothing thrown anywhere.
{
  const a = { id: 'a', x: 0, y: 0, w: 100, h: 100 }
  const b = { id: 'b', x: 20, y: 20, w: 60, h: 60 }
  ok('85 coincident centres answer null rather than a NaN segment',
    V.linkAnchors(a, b) === null && V.linkAnchors(a, a) === null)
}

// 86. buildLinkSegments flattens the adjacency into drawables, carrying the
//     label through. The key must be stable and must distinguish DIRECTION, or
//     a->b and b->a collide as one React key and one of the two silently stops
//     rendering — which is exactly the pair addLink deliberately allows.
{
  const mk = (id, x, links) => ({ kind: 'terminal', rect: { id, x, y: 0, w: 100, h: 100 }, spec: { panelId: id, cwd: '~', args: [] }, z: 1, ...(links ? { links } : {}) })
  const panels = [mk('a', 0, [{ to: 'b', label: 'feeds' }]), mk('b', 300, [{ to: 'a' }])]
  const segs = V.buildLinkSegments(panels)
  ok('86 buildLinkSegments carries the label and keys both directions apart',
    segs.length === 2 &&
    segs.find((s) => s.from === 'a').label === 'feeds' &&
    segs.find((s) => s.from === 'b').label === undefined &&
    new Set(segs.map((s) => s.key)).size === 2)
}

// 87. A link whose target is not in the panel array is DROPPED, and its
//     neighbour still renders. This is the second, deliberately redundant
//     prune — removePanel is the first — and it covers a state removePanel
//     cannot see: PanelId is global across workspaces (CLAUDE.md, "Panel ids
//     are global, not per-workspace"), so a link naming a panel that lives in
//     a DIFFERENT workspace resolves to nothing on this canvas and must render
//     nothing rather than throw. A hand-edited file reaches the same state.
//
//     The surviving-neighbour clause is what stops a fix from dropping the
//     whole source panel's links on one bad target.
{
  const mk = (id, x, links) => ({ kind: 'terminal', rect: { id, x, y: 0, w: 100, h: 100 }, spec: { panelId: id, cwd: '~', args: [] }, z: 1, ...(links ? { links } : {}) })
  const panels = [mk('a', 0, [{ to: 'gone' }, { to: 'b' }]), mk('b', 300)]
  const segs = V.buildLinkSegments(panels)
  ok('87 a link to an absent panel is dropped and its neighbour survives',
    segs.length === 1 && segs[0].from === 'a' && segs[0].to === 'b')
}

// 88. A review node is an ordinary endpoint, in BOTH directions. `links` sits
//     on PanelBase rather than on the terminal arm, so nothing in the geometry
//     needed a kind check — which is the property being pinned. A later
//     "optimisation" that filtered the panel list by kind before flattening
//     would silently delete every link touching a review node, on a canvas
//     where linking a node to a second agent's panel is what the feature is
//     for. It is the same argument check 78 makes for the cascade lattice.
{
  const term = { kind: 'terminal', rect: { id: 'n1', x: 0, y: 0, w: 100, h: 100 }, spec: { panelId: 'n1', cwd: '~', args: [] }, z: 1, links: [{ to: 'r1' }] }
  const node = { kind: 'review', rect: { id: 'r1', x: 300, y: 0, w: 100, h: 100 }, z: 2, links: [{ to: 'n1' }], subject: { subjectId: 'n1', repoRoot: '/r', baselineSha: 'abc', label: 'claude' } }
  const segs = V.buildLinkSegments([term, node])
  ok('88 a review node is an ordinary link endpoint in both directions',
    segs.length === 2 && segs.some((s) => s.to === 'r1') && segs.some((s) => s.from === 'r1'))
}

// 93. Functional links are terminal-only, preserve ordinary link metadata,
// and reject a cycle. The cycle clause matters more than a rate limit: a
// restart chain that eventually stops is still a configuration that surprised
// its owner; one that cannot be created is auditable before it fires.
{
  const term = (id, links) => ({ kind: 'terminal', rect: { id, x: 0, y: 0, w: 10, h: 10 }, spec: { panelId: id, cwd: '~', args: [] }, z: 1, ...(links ? { links } : {}) })
  const file = { kind: 'file', rect: { id: 'f', x: 0, y: 0, w: 10, h: 10 }, z: 1, source: { path: '/tmp/f' } }
  const base = [term('a', [{ to: 'b', label: 'feeds' }]), term('b', [{ to: 'c' }]), term('c'), file]
  const aToB = V.setRestartOnExit(base, 'a', 'b', true)
  const bToC = V.setRestartOnExit(aToB, 'b', 'c', true)
  const refusedCycle = V.setRestartOnExit(bToC, 'c', 'a', true)
  const refusedKind = V.setRestartOnExit(bToC, 'a', 'f', true)
  const disabled = V.setRestartOnExit(bToC, 'a', 'b', false)
  const link = V.linksOf(aToB[0])[0]
  ok('restart-on-exit.1 restart-on-exit is terminal-only, preserves labels, disables, and refuses cycles',
    link.label === 'feeds' && link.automation?.enabled === true &&
    refusedCycle === bToC && refusedKind === bToC &&
    V.linksOf(disabled[0])[0].automation?.enabled === false,
    JSON.stringify(V.linksOf(bToC[0])))
}

// M41 — handoff.1. One mutator for both kinds. setLinkAutomation(panels,
//      from, to, automation) sets or replaces THE rule on a link (one
//      automation per link, so a handoff replaces a restart rather than
//      stacking beside it), refuses a sessionless endpoint and a cycle across
//      both kinds, and returns the identical array for every refusal and for
//      a no-op. nextHandoffState is the inspector's cycle: off -> exit ->
//      idle -> off, and from a restart rule -> exit.
{
  const set = typeof V.setLinkAutomation === 'function' ? V.setLinkAutomation : null
  const next = typeof V.nextHandoffState === 'function' ? V.nextHandoffState : null
  const term = (id, links) => ({ kind: 'terminal', rect: { id, x: 0, y: 0, w: 10, h: 10 }, spec: { panelId: id, cwd: '~', args: [] }, z: 1, ...(links ? { links } : {}) })
  const file = { kind: 'file', rect: { id: 'f', x: 0, y: 0, w: 10, h: 10 }, z: 1, source: { path: '/tmp/f' } }
  const base = [term('a', [{ to: 'b', label: 'feeds' }, { to: 'f' }]), term('b', [{ to: 'c' }]), term('c', [{ to: 'a' }]), file]
  const exit = { kind: 'handoff', enabled: true, trigger: 'exit' }
  const idle = { kind: 'handoff', enabled: true, trigger: 'idle' }
  const aToB = set ? set(base, 'a', 'b', exit) : null
  const aToBIdle = set && aToB ? set(aToB, 'a', 'b', idle) : null
  const bToC = set && aToBIdle ? set(aToBIdle, 'b', 'c', { kind: 'restart-on-exit', enabled: true }) : null
  const refusedCycle = set && bToC ? set(bToC, 'c', 'a', exit) : null
  const refusedKind = set && bToC ? set(bToC, 'a', 'f', exit) : null
  const noop = set && bToC ? set(bToC, 'a', 'b', idle) : null
  const replaced = set && bToC ? set(bToC, 'b', 'c', exit) : null
  const off = set && bToC ? set(bToC, 'a', 'b', { kind: 'handoff', enabled: false, trigger: 'idle' }) : null
  const link = (ps, i) => V.linksOf(ps[i])[0]
  ok('handoff.1 setLinkAutomation sets, retriggers, replaces a restart rule, refuses a sessionless endpoint and a mixed-kind cycle, and nextHandoffState cycles',
    set !== null && next !== null &&
      link(aToB, 0).automation?.kind === 'handoff' && link(aToB, 0).automation.trigger === 'exit' && link(aToB, 0).label === 'feeds' &&
      link(aToBIdle, 0).automation?.trigger === 'idle' &&
      refusedCycle === bToC && refusedKind === bToC && noop === bToC &&
      link(replaced, 1).automation?.kind === 'handoff' && link(replaced, 1).automation.trigger === 'exit' &&
      link(off, 0).automation?.enabled === false &&
      JSON.stringify(next(undefined)) === JSON.stringify(exit) &&
      JSON.stringify(next(exit)) === JSON.stringify(idle) &&
      next(idle).enabled === false &&
      JSON.stringify(next({ kind: 'restart-on-exit', enabled: true })) === JSON.stringify(exit) &&
      JSON.stringify(next({ kind: 'handoff', enabled: false, trigger: 'idle' })) === JSON.stringify(exit),
    JSON.stringify({ has: [set !== null, next !== null], aToB: aToB && V.linksOf(aToB[0]), replaced: replaced && V.linksOf(replaced[1]) }))
}

// M78 — graph.1 / graph.2 / graph.3. THE TASK GRAPH'S PURE RULES.
//      graph.1: handoffFires is ONE table over five triggers and two events —
//      exit-ok only on code 0, exit-fail on any other exit (a signal is a
//      failure), exit on any exit, idle only on a turn's end, always on both.
//      graph.2: the join reducer fires when every expected source has
//      arrived, never on the first, orders the payload by the EXPECTED list,
//      names the sources still owed, and a source arriving twice replaces
//      itself. graph.3: the mutator accepts a chat at either end and still
//      refuses a document kind and a cycle.
{
  const fires = typeof V.handoffFires === 'function' ? V.handoffFires : null
  const exit = (code) => ({ kind: 'exit', code })
  const idle = { kind: 'idle' }
  const table = fires === null ? null : {
    ok0: fires('exit-ok', exit(0)), ok1: fires('exit-ok', exit(1)), okSig: fires('exit-ok', exit(null)), okIdle: fires('exit-ok', idle),
    fail0: fires('exit-fail', exit(0)), fail1: fires('exit-fail', exit(1)), failSig: fires('exit-fail', exit(null)), failIdle: fires('exit-fail', idle),
    exit0: fires('exit', exit(0)), exit1: fires('exit', exit(1)), exitIdle: fires('exit', idle),
    idle0: fires('idle', exit(0)), idleIdle: fires('idle', idle),
    always0: fires('always', exit(0)), always1: fires('always', exit(1)), alwaysIdle: fires('always', idle)
  }
  ok('graph.1 handoffFires: exit-ok only on 0, exit-fail on non-zero and on a signal, exit on any exit, idle only on a turn, always on both',
    table !== null && table.ok0 === true && table.ok1 === false && table.okSig === false && table.okIdle === false &&
      table.fail0 === false && table.fail1 === true && table.failSig === true && table.failIdle === false &&
      table.exit0 === true && table.exit1 === true && table.exitIdle === false &&
      table.idle0 === false && table.idleIdle === true &&
      table.always0 === true && table.always1 === true && table.alwaysIdle === true,
    JSON.stringify(table))

  const advance = typeof V.joinAdvance === 'function' ? V.joinAdvance : null
  const one = advance ? advance(['a', 'b'], new Map([['b', 'B-out']])) : null
  const both = advance ? advance(['a', 'b'], new Map([['b', 'B-out'], ['a', 'A-out']])) : null
  const single = advance ? advance(['a'], new Map([['a', 'A-out']])) : null
  const none = advance ? advance(['a', 'b'], new Map()) : null
  ok('graph.2 joinAdvance is ready only when every expected source arrived, orders the payload by the expected list, and names the sources still owed',
    advance !== null && one && one.ready === false && JSON.stringify(one.waitingFor) === '["a"]' &&
      both && both.ready === true && both.payload.indexOf('A-out') < both.payload.indexOf('B-out') && both.waitingFor.length === 0 &&
      single && single.ready === true && single.payload === 'A-out' &&
      none && none.ready === false && JSON.stringify(none.waitingFor) === '["a","b"]',
    JSON.stringify({ one, both, single, none }))

  const incoming = typeof V.incomingHandoffs === 'function' ? V.incomingHandoffs : null
  const term = (id, links) => ({ kind: 'terminal', rect: { id, x: 0, y: 0, w: 10, h: 10 }, spec: { panelId: id, cwd: '~', args: [] }, z: 1, ...(links ? { links } : {}) })
  const chat = (id, links) => ({ kind: 'chat', rect: { id, x: 0, y: 0, w: 10, h: 10 }, z: 1, chat: { cwd: '/r', sessionId: 'u' }, ...(links ? { links } : {}) })
  const file = { kind: 'file', rect: { id: 'f', x: 0, y: 0, w: 10, h: 10 }, z: 1, source: { path: '/tmp/f' } }
  const on = (trigger) => ({ kind: 'handoff', enabled: true, trigger })
  const graph = [term('a', [{ to: 'c', automation: on('exit-ok') }, { to: 'f' }]), chat('b', [{ to: 'c', automation: on('idle') }, { to: 'a', automation: { kind: 'handoff', enabled: false, trigger: 'exit' } }]), chat('c'), file]
  const set = V.setLinkAutomation
  const chatTarget = set(graph, 'a', 'c', on('exit-fail'))
  const chatSource = set(graph, 'b', 'a', on('always'))
  const fileTarget = set(graph, 'a', 'f', on('exit'))
  const withCycle = set(set(graph, 'b', 'a', on('always')), 'a', 'c', on('exit'))
  const cyc = set(withCycle.map((p) => p.rect.id === 'c' ? { ...p, links: [{ to: 'b' }] } : p), 'c', 'b', on('exit'))
  ok('graph.3 incomingHandoffs lists the enabled edges into a target in panel order (a join at two); setLinkAutomation accepts a chat at either end, refuses a file, refuses a cycle',
    incoming !== null && JSON.stringify(incoming(graph, 'c')) === '["a","b"]' && JSON.stringify(incoming(graph, 'a')) === '[]' &&
      V.linksOf(chatTarget[0])[0].automation.trigger === 'exit-fail' && V.linksOf(chatSource[1])[1].automation.trigger === 'always' &&
      fileTarget === graph && cyc !== null && V.linksOf(cyc[2])[0].automation === undefined,
    JSON.stringify({ incoming: incoming && incoming(graph, 'c'), chatTarget: V.linksOf(chatTarget[0]), chatSource: V.linksOf(chatSource[1]), fileRefused: fileTarget === graph, cyc: cyc && V.linksOf(cyc[2]) }))
}

// M79 — run.1 / run.2. RUNS, the pure half. run.1: the component over
//      ENABLED handoff edges only (a disabled edge is not a path; a plain
//      link is not a path), roots and sinks in panel order; the reducer opens
//      a run with the firing source's entry, records events onto entries,
//      is complete only when every sink has an outcome, and seals with the
//      time and cost. run.2: the cost is the summary's own rule — absent when
//      any panel's model is unpriced, else the sum.
{
  const term = (id, links) => ({ kind: 'terminal', rect: { id, x: 0, y: 0, w: 10, h: 10 }, spec: { panelId: id, cwd: '~', args: [] }, z: 1, ...(links ? { links } : {}) })
  const on = (to, trigger = 'exit') => ({ to, automation: { kind: 'handoff', enabled: true, trigger } })
  const off = (to) => ({ to, automation: { kind: 'handoff', enabled: false, trigger: 'exit' } })
  const ps = [term('a', [on('c')]), term('b', [on('c'), { to: 'z' }]), term('c', [on('d')]), term('d'), term('e', [off('a')]), term('z')]
  const comp = V.componentOf(ps, 'c')
  const roots = V.rootsOf(ps, comp)
  const sinks = V.sinksOf(ps, comp)
  const alone = V.componentOf(ps, 'z')
  let run = V.beginRun(comp, 'a', 1000, 'test run')
  run = V.recordRunEvent(run, { kind: 'fired', panelId: 'a', outcome: 'exit 0', at: 1100 })
  const openAfterA = V.runIsComplete(run, comp)
  run = V.recordRunEvent(run, { kind: 'fired', panelId: 'b', outcome: 'exit 0', at: 1200 })
  run = V.recordRunEvent(run, { kind: 'delivered', panelId: 'c', sentence: 'handed off 4 lines after exit 0', at: 1300 })
  run = V.recordRunEvent(run, { kind: 'fired', panelId: 'c', outcome: 'exit 1', at: 1400 })
  run = V.recordRunEvent(run, { kind: 'skipped', panelId: 'd', sentence: 'skipped — exit 1 is not exit 0', at: 1400 })
  const complete = V.runIsComplete(run, comp)
  const sealed = V.finishRun(run, 1500, 0.5)
  ok('run.1 componentOf follows only enabled handoff edges; roots and sinks in panel order; the reducer opens with the source, records entries, completes only when every sink has an outcome, and seals',
    JSON.stringify(comp.panelIds) === '["a","b","c","d"]' && comp.edges.length === 3 && JSON.stringify(roots) === '["a","b"]' && JSON.stringify(sinks) === '["d"]' &&
      alone.panelIds.length === 1 && alone.edges.length === 0 &&
      run.entries.length === 4 && run.entries[0].panelId === 'a' && run.entries[0].outcome === 'exit 0' && run.entries[0].endedAt === 1100 &&
      run.entries[2].panelId === 'c' && run.entries[2].startedAt === 1300 && run.entries[2].outcome === 'exit 1' &&
      run.entries[3].panelId === 'd' && /skipped/.test(run.entries[3].outcome) &&
      openAfterA === false && complete === true && sealed.endedAt === 1500 && sealed.costUsd === 0.5 && run.endedAt === undefined,
    JSON.stringify({ comp, roots, sinks, run, sealed }))

  const usage = (model, input) => ({ totals: { input, output: 0, cacheWrite: 0, cacheRead: 0 }, byModel: { [model]: { input, output: 0, cacheWrite: 0, cacheRead: 0 } }, turns: 1, subagentTurns: 0 })
  const priced = V.runCost(['a', 'b'], new Map([['a', usage('claude-haiku-4-5', 1000000)], ['b', usage('claude-haiku-4-5', 1000000)]]))
  const unpriced = V.runCost(['a', 'b'], new Map([['a', usage('claude-haiku-4-5', 1000000)], ['b', usage('mystery-model', 1)]]))
  const none = V.runCost(['a'], new Map())
  const abandoned = V.sealAbandoned([{ id: 'o', name: 'open', panelIds: ['a'], edges: [], startedAt: 1, entries: [{ panelId: 'a', startedAt: 1 }, { panelId: 'b', startedAt: 1, endedAt: 2, outcome: 'exit 0' }] }, { id: 'd', name: 'done', panelIds: ['a'], edges: [], startedAt: 1, endedAt: 3, entries: [] }], 9)
  ok('run.3 a run left open in a saved layout is sealed on load with the relaunch named on its open entries; a sealed run is untouched',
    abandoned[0].endedAt === 9 && /relaunched/.test(abandoned[0].entries[0].outcome) && abandoned[0].entries[1].outcome === 'exit 0' && abandoned[1].endedAt === 3,
    JSON.stringify(abandoned))
  ok('run.2 runCost sums priced usage and is absent when any panel is unpriced; no usage at all is zero',
    typeof priced === 'number' && priced > 0 && unpriced === undefined && none === 0,
    JSON.stringify({ priced, unpriced, none }))
  // M121 — runs.seal.1. A run whose every panel is IDLE (or gone) is also
  // abandoned: nothing will ever fire its remaining edges, so an open run
  // beside idle panels reads `working` for ever (critic 11's stale seeded
  // run). With an `idle` predicate the seal asks it per panel and seals only
  // when every panel answers idle or is absent; a run with one panel still
  // busy stays open; the outcome names the reason; a sealed run is untouched.
  // Without the predicate the M79 rule holds unchanged (run.3 above).
  const openAB = { id: 'ab', name: 'ab', panelIds: ['a', 'b'], edges: [], startedAt: 1, entries: [{ panelId: 'a', startedAt: 1 }, { panelId: 'b', startedAt: 1, endedAt: 2, outcome: 'exit 0' }] }
  const openGone = { id: 'gone', name: 'gone', panelIds: ['zz'], edges: [], startedAt: 1, entries: [{ panelId: 'zz', startedAt: 1 }] }
  const done = { id: 'd', name: 'done', panelIds: ['a'], edges: [], startedAt: 1, endedAt: 3, entries: [{ panelId: 'a', startedAt: 1 }] }
  const present = new Set(['a', 'b'])
  const busyA = V.sealAbandoned([openAB, openGone, done], 9, (id) => present.has(id) ? id !== 'a' : true)
  const allIdle = V.sealAbandoned([openAB, openGone, done], 9, () => true)
  ok('runs.seal.1 sealAbandoned(runs, at, idle) seals an open run only when every panel of it is idle or absent — a run with one busy panel stays open; one whose panels are all idle is sealed at `at` with an outcome naming the idle panels on its open entries; a run over a panel that no longer exists is sealed; a sealed run is untouched',
    busyA[0].endedAt === undefined && busyA[0].entries[0].outcome === undefined && busyA[1].endedAt === 9 && busyA[2].endedAt === 3 &&
      allIdle[0].endedAt === 9 && /idle/.test(allIdle[0].entries[0].outcome) && allIdle[0].entries[1].outcome === 'exit 0' && allIdle[1].endedAt === 9 && /idle/.test(allIdle[1].entries[0].outcome) &&
      allIdle[2].endedAt === 3 && allIdle[2].entries[0].outcome === undefined,
    JSON.stringify({ busyA, allIdle }))
}

// M16 (originally numbered 79-80b under this branch's own M13, which
// collided with main's own DIFFERENT M13 — "links between panels", which
// independently claimed 79-88 in this file. See the milestone-wide
// renumbering commit for the full story.)
// 89 — makeFilePanel centres exactly, the contract makePanel has (check 48).
{
  const f = V.makeFilePanel('f1', { x: 100, y: 200 }, 3, { path: '/tmp/a.txt' })
  ok('89 makeFilePanel centres exactly',
    f.kind === 'file'
      && f.rect.x === 100 - V.FILE_W / 2 && f.rect.y === 200 - V.FILE_H / 2
      && f.rect.w === V.FILE_W && f.rect.h === V.FILE_H && f.z === 3,
    `x=${f.rect.x} y=${f.rect.y}`)
}
// 90 — the source is carried VERBATIM and the object is not the same reference.
// makeReviewPanel's own comment warns about the copy-paste that rewrites a
// payload field with the minted id; this is that rule inherited. The
// not-same-reference clause matters because the caller's object may be reused.
{
  const src = { path: '/tmp/b.txt' }
  const f = V.makeFilePanel('f2', { x: 0, y: 0 }, 1, src)
  ok('90 makeFilePanel carries source verbatim without rewriting it',
    f.source.path === '/tmp/b.txt' && f.source !== src
      && !('panelId' in f.source) && Object.keys(f.source).length === 1,
    JSON.stringify(f.source))
}
// 90b — isTerminalPanel is the POSITIVE partition test, and its whole job is
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
  ok('90b isTerminalPanel excludes BOTH non-terminal kinds and still admits a kind-less panel',
    V.isTerminalPanel(t) === true && V.isTerminalPanel(f) === false
      && V.isTerminalPanel(r) === false && V.isTerminalPanel(legacy) === true
      && V.isFilePanel(f) === true && V.isFilePanel(t) === false)
}


// 91 — makeToolboxPanel centres exactly (makePanel's contract, check 48,
// inherited by a fifth constructor) and carries its source VERBATIM without
// rewriting it. The not-same-reference clause is makeReviewPanel's own
// warning applied again: a shared reference means a caller mutating its own
// object after the mint silently rewrites a panel already on the canvas. The
// no-`panelId` clause is the OTHER half of that warning — the copy-paste that
// stamps the minted id into the payload, which for a review node produced a
// node reviewing itself and here would produce a toolbox describing a panel
// id instead of a directory.
{
  const src = { cwd: '/Users/me/repo', label: 'repo' }
  const t = V.makeToolboxPanel('t1', { x: 100, y: 200 }, 3, src)
  ok('91 makeToolboxPanel centres exactly and copies its source field by field',
    t.kind === 'toolbox'
      && t.rect.x === 100 - V.TOOLBOX_W / 2 && t.rect.y === 200 - V.TOOLBOX_H / 2
      && t.rect.w === V.TOOLBOX_W && t.rect.h === V.TOOLBOX_H && t.z === 3
      && t.source.cwd === '/Users/me/repo' && t.source.label === 'repo'
      && t.source !== src && !('panelId' in t.source) && Object.keys(t.source).length === 2,
    `x=${t.rect.x} y=${t.rect.y} source=${JSON.stringify(t.source)}`)
}
// 92 is check 90b widened to a FIFTH kind, and it is the check that would
// fail against the exact regression this milestone forces. `!isReviewPanel &&
// !isFilePanel && !isJiraPanel` answers TRUE for a toolbox panel: it lands in
// assignTiers and registry.ensure with no spec, burning a LIVE_BUDGET slot and
// a WebGL context on a <div> that owns no process.
//
// FIVE panels in one read, because a helper that got any ONE of them
// backwards would still look correct against the other four — and the two
// that must read TRUE (a real terminal and a bare kind-less pre-M9b object)
// are as load-bearing as the three that must read false.
{
  const t = V.makePanel('n1', { x: 0, y: 0 }, 1)
  const f = V.makeFilePanel('f3', { x: 0, y: 0 }, 1, { path: '/tmp/c' })
  const r = V.makeReviewPanel('r1', { x: 0, y: 0 }, 1,
    { subjectId: 'n1', repoRoot: '/r', baselineSha: 'abc', label: 'x' })
  const j = V.makeJiraPanel('j1', { x: 0, y: 0 }, 1)
  const tb = V.makeToolboxPanel('t2', { x: 0, y: 0 }, 1, { cwd: '/r', label: 'r' })
  const legacy = { rect: { id: 'n9', x: 0, y: 0, w: 1, h: 1 }, z: 1, spec: { panelId: 'n9', cwd: '~', args: [] } }
  // M73. The SIXTH kind: a chat panel is plain DOM over a main-process
  // conversation, and a partition that admitted it would hand it to
  // assignTiers and registry.ensure with no spec — a LIVE_BUDGET slot and a
  // WebGL context burnt on a transcript. Guarded so the five-kind checks
  // above keep running red-by-name rather than throwing before this line.
  const ch = typeof V.makeChatPanel === 'function' ? V.makeChatPanel('c1', { x: 0, y: 0 }, 1, { cwd: '/r', sessionId: 'u' }) : null
  const isChat = typeof V.isChatPanel === 'function' ? V.isChatPanel : () => 'missing'
  ok('92 isTerminalPanel excludes ALL FIVE non-terminal kinds and still admits a kind-less panel',
    V.isTerminalPanel(t) === true && V.isTerminalPanel(legacy) === true
      && V.isTerminalPanel(f) === false && V.isTerminalPanel(r) === false
      && V.isTerminalPanel(j) === false && V.isTerminalPanel(tb) === false
      && ch !== null && V.isTerminalPanel(ch) === false
      && V.isToolboxPanel(tb) === true && V.isToolboxPanel(t) === false
      && V.isToolboxPanel(f) === false
      && isChat(ch) === true && isChat(t) === false && isChat(tb) === false,
    `terminal=${V.isTerminalPanel(t)} legacy=${V.isTerminalPanel(legacy)} toolbox=${V.isTerminalPanel(tb)} chat=${ch && V.isTerminalPanel(ch)}`)
}

// chat.1 — makeChatPanel centres exactly (makePanel's contract, check 48,
// inherited by a SIXTH constructor), copies its source rather than sharing
// the caller's object, never stamps the minted id into it, and keeps an
// absent agentOptions ABSENT (`'agentOptions' in source` must read false,
// which a spread that copied the key as undefined would break after IPC).
{
  const src = { cwd: '/r', sessionId: 'u-9' }
  const c = typeof V.makeChatPanel === 'function' ? V.makeChatPanel('c9', { x: 100, y: 200 }, 4, src) : null
  const withKnobs = typeof V.makeChatPanel === 'function' ? V.makeChatPanel('c8', { x: 0, y: 0 }, 1, { cwd: '/r', sessionId: 'u-8', agentOptions: { model: 'opus' } }) : null
  ok('chat.1 makeChatPanel centres exactly, copies its source, stamps no panelId into it, and keeps an absent agentOptions absent',
    c !== null && c.kind === 'chat' && c.z === 4 && c.rect.id === 'c9'
      && Math.abs(c.rect.x + c.rect.w / 2 - 100) < 1e-9 && Math.abs(c.rect.y + c.rect.h / 2 - 200) < 1e-9
      && c.chat !== src && c.chat.cwd === '/r' && c.chat.sessionId === 'u-9'
      && !('panelId' in c.chat) && !('agentOptions' in c.chat)
      && withKnobs !== null && withKnobs.chat.agentOptions.model === 'opus',
    c ? JSON.stringify(c) : 'no makeChatPanel')
}

// 93 — makeFilePanel carries `prose` VERBATIM, omits the key entirely when it
// is absent, and hands back a source that is not the caller's own object.
// Three clauses, each rejecting a different real mistake: a mint that dropped
// the flag makes every note reopen as a code view after one relaunch; a mint
// that spread `{ ...source }` writes `prose: undefined` for an ordinary file,
// where `'prose' in source` then reads TRUE; and a shared reference lets a
// caller mutating its own object afterwards silently rewrite a panel already
// on the canvas — makeReviewPanel's own warning, inherited by a sixth mint.
//
// Fault-injected three ways, all red: a shared reference (`source`), a dropped
// flag (`{ path: source.path }`), and an unconditional copy
// (`prose: source.prose`, which writes `prose: undefined` for a plain file).
// What it does NOT catch, stated rather than left to be discovered: a plain
// `{ ...source }` spread stays GREEN — and correctly so, because a spread
// both copies the object and omits a key that was absent. It is the wrong
// shape for this codebase's conventions and it is not a defect this check has
// any business failing on.
{
  const src = { path: '/tmp/n.md', prose: true }
  const note = V.makeFilePanel('f1', { x: 0, y: 0 }, 1, src)
  const plain = V.makeFilePanel('f2', { x: 0, y: 0 }, 1, { path: '/tmp/p.txt' })
  ok('93 makeFilePanel carries prose verbatim, omits it when absent, and copies the source',
    note.source.prose === true && note.source !== src
      && plain.source.path === '/tmp/p.txt' && !('prose' in plain.source),
    `note=${JSON.stringify(note.source)} plain=${JSON.stringify(plain.source)}`)
}
// ---------------------------------------------------------------------------
// M35. Drawing links. The pure half: which side each anchor sits on, and the
// bezier built from that. See docs/superpowers/specs/2026-08-30-m24-link-drawing-design.md
// ---------------------------------------------------------------------------

// 93. linkAnchors reports WHICH SIDE each anchor landed on. This is a read of
//     a decision the function already makes — the side is whichever of tx/ty
//     bound the crossing, plus the sign of dx/dy — so it is new output rather
//     than new arithmetic, and checks 83/84 must stay green beside it.
//
//     The fixture is the SHALLOW diagonal check 84 already uses, for check
//     84's own reason: at 45 degrees the x and y crossings tie, so a wrong
//     implementation answers a plausible side and the check proves nothing.
//     Here the x crossing binds strictly, so 'e' and 'w' are the only correct
//     answers and a tie-breaking bug is visible.
{
  const a = { id: 'a', x: -50, y: -50, w: 100, h: 100 }
  const b = { id: 'b', x: 350, y: 50, w: 100, h: 100 }
  const s = V.linkAnchors(a, b)
  // And the reverse, which must mirror: b's ray leaves west and enters a east.
  const r = V.linkAnchors(b, a)
  ok('link-draw.1 linkAnchors reports the side each anchor sits on',
    s !== null && s.fromSide === 'e' && s.toSide === 'w' &&
      r !== null && r.fromSide === 'w' && r.toSide === 'e',
    s === null ? 'null' : `forward ${s.fromSide}->${s.toSide} reverse ${r && r.fromSide}->${r && r.toSide}`)
}

// 94. The control points are AXIS-ALIGNED to the sides they leave from, and
//     point OUTWARD. That perpendicular rule is what makes the curve leave the
//     border rather than kink at it.
//
//     Asserted as a RELATION rather than as literal coordinates. Literals go
//     stale the moment CURVE_RATIO is tuned, and the repair a later reader
//     reaches for is to paste in whatever the implementation currently
//     returns — which is a check that can no longer fail.
//
//     The vertical pair is the discriminating fixture: a control point built
//     from the SEGMENT direction rather than from the SIDE is identical to the
//     correct one on a horizontal pair, so a horizontal-only check passes
//     against an implementation that never reads the side at all.
{
  const a = { id: 'a', x: 0, y: 0, w: 100, h: 100 }
  const b = { id: 'b', x: 0, y: 400, w: 100, h: 100 }   // b is DIRECTLY BELOW a
  const s = V.linkAnchors(a, b)
  const c = s && V.linkControls(s)
  // a exits south: c1 is directly below the exit, same x. b enters north: c2
  // is directly above the entry, same x.
  const perpendicular = c !== null &&
    near(c.c1.x, s.x1) && c.c1.y > s.y1 &&
    near(c.c2.x, s.x2) && c.c2.y < s.y2
  ok('link-draw.2 linkControls pushes each control point perpendicular to its own side',
    s !== null && s.fromSide === 's' && s.toSide === 'n' && perpendicular,
    s === null ? 'null' : `sides ${s.fromSide}->${s.toSide} c1=${JSON.stringify(c.c1)} c2=${JSON.stringify(c.c2)}`)
}

// 95. The offset is CLAMPED AT BOTH ENDS, and both are asserted: a one-sided
//     clamp passes a one-sided check. Unclamped, a very short link loops
//     absurdly and a very long one is indistinguishable from a straight line,
//     so the clamp is what makes the curve read the same way at every distance.
//
//     Also pins purity: the same anchors twice produce a byte-identical string,
//     since anything consulting a clock or a random seed would make every link
//     on the canvas twitch on every repaint.
{
  const near0 = { id: 'a', x: 0, y: 0, w: 10, h: 10 }
  const near1 = { id: 'b', x: 30, y: 0, w: 10, h: 10 }     // tiny gap
  const far0 = { id: 'c', x: 0, y: 0, w: 10, h: 10 }
  const far1 = { id: 'd', x: 20000, y: 0, w: 10, h: 10 }   // huge gap
  const sNear = V.linkAnchors(near0, near1)
  const sFar = V.linkAnchors(far0, far1)
  const cNear = sNear && V.linkControls(sNear)
  const cFar = sFar && V.linkControls(sFar)
  const offNear = cNear && Math.abs(cNear.c1.x - sNear.x1)
  const offFar = cFar && Math.abs(cFar.c1.x - sFar.x1)
  const d1 = sFar && V.linkPath(sFar)
  const d2 = sFar && V.linkPath(sFar)
  ok('link-draw.3 the control offset clamps at BOTH ends, and linkPath is pure',
    near(offNear, V.CURVE_MIN) && near(offFar, V.CURVE_MAX) &&
      typeof d1 === 'string' && d1.startsWith('M') && d1.includes('C') && d1 === d2,
    `near=${offNear} (min ${V.CURVE_MIN}) far=${offFar} (max ${V.CURVE_MAX}) d=${d1}`)
}

// 96. nearestLinkTarget resolves a drop. Four clauses, each rejecting a
//     different wrong implementation, because any one of them alone passes
//     against something broken:
//
//     (a) A panel CONTAINING the point beats a merely-near one. Without it, a
//         drop squarely inside a panel that happens to sit near a smaller
//         neighbour links the neighbour — the single most confusing outcome
//         this gesture can produce, because the user was aiming at a thing
//         they were pointing directly at.
//     (b) The SOURCE is excluded. Without it every drag snaps back to itself,
//         addLink refuses the self-link, and the gesture can never complete —
//         a feature that is silently 100% broken.
//     (c) A panel outside the radius answers null, or the drop has no empty
//         space at all and a mis-aimed release always links SOMETHING.
//     (d) Of two panels both in range, the NEARER wins.
//
//     The rects are given in the z-order the caller uses (hitOrder), and the
//     containment scan walks it backwards, so the topmost of two overlapping
//     panels wins — the same convention hitTest already established.
{
  const a = { id: 'a', x: 0, y: 0, w: 100, h: 100 }
  const b = { id: 'b', x: 200, y: 0, w: 100, h: 100 }
  const c = { id: 'c', x: 260, y: 0, w: 40, h: 40 }
  const rects = [a, b, c]
  // (a) a point INSIDE b, which is also within radius of c's rect.
  const inside = V.nearestLinkTarget(rects, { x: 250, y: 20 }, 200, 'a')
  // (b) a point inside a, with a as the source.
  const self = V.nearestLinkTarget(rects, { x: 50, y: 50 }, 200, 'a')
  // (c) a point far from everything.
  const far = V.nearestLinkTarget(rects, { x: 5000, y: 5000 }, 90, 'a')
  // (d) a point in empty space between b and a, closer to b.
  const nearer = V.nearestLinkTarget(rects, { x: 180, y: 50 }, 200, 'a')
  ok('link-draw.4 nearestLinkTarget prefers containment, excludes the source, and respects the radius',
    inside === 'b' && self === null && far === null && nearer === 'b',
    `inside=${inside} self=${self} far=${far} nearer=${nearer}`)
}

// M44 — keyboard traversal. Scoped ids. spatial-order.ts is pure, bundled
// beside viewport.ts. A plus of five panels around a centre C, plus two more
// off to the side for the cone test.
{
  const near = typeof V.nearestInDirection === 'function' ? V.nearestInDirection : null
  const C = { id: 'C', x: 0, y: 0, w: 100, h: 100 }
  // A plus: neighbours dead-ahead in each of the four directions.
  const R = { id: 'R', x: 300, y: 0, w: 100, h: 100 }
  const Lf = { id: 'L', x: -300, y: 0, w: 100, h: 100 }
  const Up = { id: 'U', x: 0, y: -300, w: 100, h: 100 }
  const Dn = { id: 'D', x: 0, y: 300, w: 100, h: 100 }

  // keyboard.1. The cone prefers DEAD-AHEAD over NEARER-but-sideways. `S` is
  //      nearer along the x-axis than `R` (dx 100 vs 300) but far off it
  //      (dy 400), so along + 2*perp makes R the winner going right.
  {
    const S = { id: 'S', x: 100, y: 400, w: 100, h: 100 }
    const got = near ? near([C, R, S], 'C', 'right') : null
    ok('keyboard.1 the direction cone prefers dead-ahead over a nearer but sideways panel',
      got === 'R', `got=${got}`)
  }

  // keyboard.2. No candidate in that direction answers null (the selection
  //      stays put), and an unknown `from` also answers null.
  {
    const none = near ? near([C, Dn], 'C', 'up') : 'x'
    const unknown = near ? near([C, Dn], 'nope', 'down') : 'x'
    ok('keyboard.2 no candidate in the direction, or an unknown from, answers null',
      none === null && unknown === null, `none=${none} unknown=${unknown}`)
  }

  // keyboard.3. Four directions from the same fixture each pick their own
  //      dead-ahead neighbour and nothing else.
  {
    const all = [C, R, Lf, Up, Dn]
    const r = near ? near(all, 'C', 'right') : null
    const l = near ? near(all, 'C', 'left') : null
    const u = near ? near(all, 'C', 'up') : null
    const d = near ? near(all, 'C', 'down') : null
    ok('keyboard.3 the four directions each select their own neighbour',
      r === 'R' && l === 'L' && u === 'U' && d === 'D',
      JSON.stringify({ r, l, u, d }))
  }

  // keyboard.4. orderPanels lists ON-SCREEN panels first (by distance from
  //      the camera centre), then the rest by recency of focus, stable for
  //      ties. Viewport at origin, 800x600: A and B are on screen, F and G
  //      are far off; B is nearer the camera centre than A; G was focused
  //      more recently than F.
  {
    const order = typeof V.orderPanels === 'function' ? V.orderPanels : null
    const A = { id: 'A', x: 600, y: 400, w: 100, h: 100 }   // centre (650,450)
    const B = { id: 'B', x: 350, y: 250, w: 100, h: 100 }   // centre (400,300) == camera centre
    const F = { id: 'F', x: 5000, y: 0, w: 100, h: 100 }
    const G = { id: 'G', x: 6000, y: 0, w: 100, h: 100 }
    const vp = { x: 0, y: 0, scale: 1 }
    const size = { w: 800, h: 600 }
    const focusedAt = { F: 10, G: 20 }
    const got = order ? order([A, B, F, G], vp, size, focusedAt) : null
    ok('keyboard.4 orderPanels puts on-screen first by camera distance, then the rest by focus recency',
      Array.isArray(got) && JSON.stringify(got) === JSON.stringify(['B', 'A', 'G', 'F']),
      JSON.stringify(got))
  }
}

// M49 — type.1. The override rides toPanels/fromPanels — the sixth
//      field-by-field copy site of the absent-stays-absent rule: a spread
//      writes `fontSize: undefined`, which survives IPC and reads as present.
{
  const persisted = [
    { id: 'a', x: 0, y: 0, w: 10, h: 10, z: 1, kind: 'terminal', cwd: '~', args: [], fontSize: 16 },
    { id: 'b', x: 0, y: 0, w: 10, h: 10, z: 1, kind: 'terminal', cwd: '~', args: [] }
  ]
  const panels = typeof V.toPanels === 'function' ? V.toPanels(persisted) : null
  const back = panels ? V.fromPanels(panels) : null
  ok('type.1 toPanels and fromPanels carry a fontSize override and keep absence absent',
    panels !== null && panels[0].fontSize === 16 && !('fontSize' in panels[1]) &&
      back !== null && back[0].fontSize === 16 && !('fontSize' in back[1]),
    JSON.stringify({ panels, back }))
}

// M50 — placement. snapRect is a pure function over applyDrag's OUTPUT: the
//      rect a drag implies, the other panels' rects, and a threshold in WORLD
//      units that the caller derives as SNAP_PX / scale (verify:viewport 27's
//      1/k relationship). Edges snap to edges, centres to centres, the
//      smallest delta within the threshold wins per axis, nothing snaps to
//      itself, and a resize snaps only its growing edges and never falls
//      under the floor. tidyPanels compacts WITHOUT reordering and changes no
//      size — a tidy that sorted by id would destroy the one thing the canvas
//      was carrying, and one that resized could produce a rect the validator
//      rejects, which is a canvas that cannot be saved.
const has = typeof V.snapRect === 'function' && typeof V.tidyPanels === 'function'
const R = (id, x, y, w = 200, h = 160) => ({ id, x, y, w, h })
{
  // snap.1: the dragged rect's left edge is 5 world units from another's
  // right edge; it snaps ON and the guide names the x.
  const out = has ? V.snapRect(R('a', 405, 300), [R('b', 100, 100, 300, 200)], 8) : null
  ok('snap.1 an edge within the threshold snaps onto the other rect\'s edge, and a guide names it',
    has && out.rect.x === 400 && out.rect.y === 300 && out.guides.some((g) => g.axis === 'x' && g.at === 400),
    JSON.stringify(out))
}
{
  // snap.2: beyond the threshold nothing moves; and a rect never snaps to
  // itself (the others list may still contain it — the caller passes all).
  // y 340, so no edge or centre aligns on the y axis by accident either.
  const far = has ? V.snapRect(R('a', 420, 340), [R('b', 100, 100, 300, 200)], 8) : null
  const self = has ? V.snapRect(R('a', 405, 340), [R('a', 100, 100, 300, 200), R('a', 405, 340)], 8) : null
  ok('snap.2 nothing snaps beyond the threshold, and never to itself',
    has && far.rect.x === 420 && far.guides.length === 0 && self.rect.x === 405 && self.guides.length === 0,
    JSON.stringify({ far, self }))
}
{
  // snap.3: a resize growing east snaps its RIGHT edge to another's left
  // edge (x 600 → right edge at 600), and a snap that would take the width
  // under MIN_PANEL_W is refused rather than clamped into a different size.
  const grow = has ? V.snapRect(R('a', 100, 100, 495, 160), [R('b', 600, 100)], 8, { resize: { growsX: true, growsY: false } }) : null
  const tooSmall = has ? V.snapRect(R('a', 100, 100, 200, 160), [R('b', 297, 100)], 8, { resize: { growsX: true, growsY: false } }) : null
  ok('snap.3 a resize snaps its moving edge and never produces a rect under the floor',
    has && grow.rect.x === 100 && grow.rect.w === 500 && grow.guides.some((g) => g.axis === 'x' && g.at === 600) &&
      tooSmall.rect.w >= V.MIN_PANEL_W,
    JSON.stringify({ grow, tooSmall }))
}
{
  // snap.4: centres. a (w 240) at x 76 has centre 196; b's centre is 200,
  // and neither of a's edges is within reach of b's (76 vs 100, 316 vs 300)
  // — so only the centre can explain the move to x 80, and the guide is at
  // the centre.
  const out = has ? V.snapRect(R('a', 76, 500, 240, 160), [R('b', 100, 100)], 8) : null
  ok('snap.4 centres snap to centres', has && out.rect.x === 80 && out.guides.some((g) => g.axis === 'x' && g.at === 200), JSON.stringify(out))
}
{
  // tidy.1: three panels in one row with gaps and a jog compact left-to-
  // right in their reading order, keep every size, and tidy again changes
  // nothing.
  const rects = [R('c', 900, 110, 240, 160), R('a', 100, 100), R('b', 500, 105, 300, 200)]
  const tidied = has ? V.tidyPanels(rects, 24) : null
  const again = has ? V.tidyPanels(tidied, 24) : null
  const byId = (rs, id) => rs.find((r) => r.id === id)
  ok('tidy.1 tidy compacts without reordering, keeps every size, and is idempotent',
    has && tidied.length === 3 && byId(tidied, 'a').x === 100 && byId(tidied, 'b').x === 100 + 200 + 24 && byId(tidied, 'c').x === 100 + 200 + 24 + 300 + 24 &&
      byId(tidied, 'a').w === 200 && byId(tidied, 'b').w === 300 && byId(tidied, 'c').w === 240 && byId(tidied, 'b').h === 200 &&
      JSON.stringify(again) === JSON.stringify(tidied),
    JSON.stringify(tidied))
}
{
  // tidy.2: two rows. The second row starts below the tallest of the first
  // plus the gap, at the selection's origin x; nothing falls under the floor.
  const rects = [R('a', 100, 100), R('b', 400, 120, 200, 300), R('c', 150, 700), R('d', 500, 650)]
  const tidied = has ? V.tidyPanels(rects, 24) : null
  const byId = (rs, id) => rs.find((r) => r.id === id)
  ok('tidy.2 rows are formed by overlap, the next row starts below the tallest, and no rect is under the floor',
    has && byId(tidied, 'a').y === 100 && byId(tidied, 'b').y === 100 && byId(tidied, 'c').x === 100 && byId(tidied, 'c').y === 100 + 300 + 24 && byId(tidied, 'd').x === 100 + 200 + 24 &&
      tidied.every((r) => r.w >= V.MIN_PANEL_W && r.h >= V.MIN_PANEL_H),
    JSON.stringify(tidied))
}

// M51 — links.1. findLinks is the pure scanner the link provider maps over a
//      rendered line: URLs (http/https) and paths (absolute, ~/, ./, or
//      relative with a slash), with an optional :line or :line:col suffix
//      kept as part of the link, trailing punctuation EXCLUDED (a URL at the
//      end of a sentence is not "…5173."), and plain words ignored. Ranges
//      are exact, because xterm underlines exactly the columns given.
{
  const has = typeof V.findLinks === 'function'
  const line = 'see src/main/pty-manager.ts:118 and http://localhost:5173/x?y=1, or ~/notes/a.md; nothing else.'
  const found = has ? V.findLinks(line) : null
  const at = (t) => found && found.find((l) => l.text === t)
  const p1 = at('src/main/pty-manager.ts:118'), u = at('http://localhost:5173/x?y=1'), p2 = at('~/notes/a.md')
  ok('links.1 findLinks reports URLs and paths with exact ranges, keeps a :line suffix, excludes trailing punctuation, ignores words',
    has && found.length === 3 &&
      p1 && p1.kind === 'path' && line.slice(p1.start, p1.end) === p1.text &&
      u && u.kind === 'url' && line.slice(u.start, u.end) === u.text &&
      p2 && p2.kind === 'path' && line.slice(p2.start, p2.end) === p2.text &&
      V.findLinks('nothing here: just words and a colon').length === 0 &&
      V.findLinks('/abs/path.ts:3:9)').length === 1 && V.findLinks('/abs/path.ts:3:9)')[0].text === '/abs/path.ts:3:9',
    JSON.stringify(found))
}

console.log('\n' + '='.repeat(60))
// M55 — orphan recovery's renderer half. A recovered panel takes THE
// SESSION'S OWN ID (tmux names the session by it; new-session -A is what
// reattaches), the row's cwd and command, and the same cascade a preset
// spawn takes; and the id counter must move PAST every adopted id, or an
// adopted n17 with the counter at 12 mints a second n17 five spawns later.
{
  const can = typeof V.recoverPanels === 'function' && typeof V.seedAfter === 'function'
  const rows = [
    { panelId: 'n17', pid: 1, command: 'claude', cwd: '/a' },
    { panelId: 'n18', pid: 2, command: '', cwd: '/b' }
  ]
  const existing = []
  const out = can ? V.recoverPanels(rows, existing, { x: 1000, y: 800 }) : null
  const ids = out ? out.map((p) => p.rect.id) : []
  const distinct = out ? new Set(out.map((p) => `${p.rect.x},${p.rect.y}`)).size : 0
  ok('recover.1 recovered panels carry the rows\' own ids, cwd and command (absent for a login shell), are terminals, and do not stack',
    can && ids.join() === 'n17,n18' && out.every((p) => p.kind === 'terminal' && p.spec.panelId === p.rect.id) &&
      out[0].spec.cwd === '/a' && out[0].spec.command === 'claude' && out[1].spec.cwd === '/b' && !('command' in out[1].spec) &&
      distinct === 2,
    can ? JSON.stringify(out) : 'recoverPanels/seedAfter are not exported')
  const seeded = can ? V.seedAfter(['n17', 'r3', 'f40', 'j2', 't9', 'orph1', 'x99'], 12) : null
  const untouched = can ? V.seedAfter(['n3'], 12) : null
  ok('recover.2 seedAfter moves the counter past every adopted n/r/f/j/t id, ignores foreign ids, and never moves it backwards',
    can && seeded === 41 && untouched === 12, JSON.stringify({ seeded, untouched }))
}

// M56 — flights. A tween that interpolates scale linearly, or derives its
// translation from an UNCLAMPED intermediate, reproduces check 3's sideways
// drift in the middle of every flight instead of at a pinch limit; and a
// duration that ignores prefers-reduced-motion is the one motion rule this
// app has, broken on the one surface it was written for.
{
  const can = typeof V.interpolateViewport === 'function' && typeof V.flightDuration === 'function' && typeof V.easeInOut === 'function'
  const from = { x: 0, y: 0, scale: V.MIN_SCALE }
  const to = { x: -5000, y: -3000, scale: V.MAX_SCALE }
  const at = (t) => (can ? V.interpolateViewport(from, to, t) : null)
  const start = at(0)
  const end = at(1)
  const mid = at(0.5)
  const samples = can ? Array.from({ length: 21 }, (_, i) => at(i / 20)) : []
  const clamped = samples.every((v) => v.scale >= V.MIN_SCALE - 1e-9 && v.scale <= V.MAX_SCALE + 1e-9)
  const logMid = Math.sqrt(V.MIN_SCALE * V.MAX_SCALE)
  // The world point under the screen centre must move in a straight line:
  // with the centre at (400, 300), the midpoint's world-centre is the average
  // of the endpoints' world-centres.
  const size = { width: 800, height: 600 }
  const wc = (v) => V.screenToWorld({ x: 400, y: 300 }, v)
  const wcMid = can ? wc(mid) : null
  const wcAvg = can ? { x: (wc(from).x + wc(to).x) / 2, y: (wc(from).y + wc(to).y) / 2 } : null
  ok('flight.1 endpoints exact, scale clamped at every frame, log-space scale midpoint, and the screen-centre world point flies straight',
    can && start.x === from.x && start.y === from.y && start.scale === from.scale &&
      end.x === to.x && end.y === to.y && end.scale === to.scale && clamped &&
      Math.abs(mid.scale - logMid) < 1e-9 &&
      Math.abs(wcMid.x - wcAvg.x) < 1e-6 && Math.abs(wcMid.y - wcAvg.y) < 1e-6,
    can ? JSON.stringify({ start, end, mid, clamped, logMid, wcMid, wcAvg }) : 'flight exports are missing')
  const near = can ? V.flightDuration({ x: 0, y: 0, scale: 1 }, { x: -50, y: 0, scale: 1 }, size, false) : -1
  const far = can ? V.flightDuration({ x: 0, y: 0, scale: 1 }, { x: -50000, y: -50000, scale: 0.2 }, size, false) : -1
  const reduced = can ? V.flightDuration({ x: 0, y: 0, scale: 1 }, { x: -50000, y: 0, scale: 1 }, size, true) : -1
  const same = can ? V.flightDuration({ x: 0, y: 0, scale: 1 }, { x: 0, y: 0, scale: 1 }, size, false) : -1
  ok('flight.2 reduced motion is 0ms, an identical target is 0ms, and a far flight is longer than a near one within the 160–320ms band',
    can && reduced === 0 && same === 0 && near >= 160 && near <= 320 && far >= 160 && far <= 320 && far > near &&
      Math.abs(V.easeInOut(0)) < 1e-9 && Math.abs(V.easeInOut(1) - 1) < 1e-9 && V.easeInOut(0.25) < 0.25 && V.easeInOut(0.75) > 0.75,
    JSON.stringify({ near, far, reduced, same }))
  // trail.1 — the camera trail is a SECOND History<Viewport>; the generic
  // module steps both ways and never disposes anything.
  const canH = typeof V.createHistory === 'function'
  let h = canH ? V.createHistory({ x: 0, y: 0, scale: 1 }) : null
  if (h) { h = V.pushHistory(h, { x: -10, y: 0, scale: 1 }); h = V.pushHistory(h, { x: -20, y: 0, scale: 1 }) }
  const back = h ? V.undoHistory(h) : null
  const fwd = back ? V.redoHistory(back) : null
  ok('trail.1 a History<Viewport> steps back to the previous camera and forward again, and reports both ends',
    canH && back.present.x === -10 && fwd.present.x === -20 && V.canUndo(h) === true && V.canRedo(h) === false &&
      V.canRedo(back) === true,
    canH ? JSON.stringify({ back: back.present, fwd: fwd.present }) : 'history is not bundled')
}

// M57 — semantic zoom's render tier. A RENDER tier, never a fourth state in
// assignTiers: that function rations contexts and PTYs, this one decides
// typography. Hysteresis is the whole point of the second check — a pinch
// hovering on a boundary must not flip every card on the canvas twice a frame.
{
  const can = typeof V.nextCardDetail === 'function'
  const at = (current, scale) => (can ? V.nextCardDetail(current, scale) : null)
  ok('detail.1 tail above the summary band, summary inside it, block below it, whatever the current tier',
    can && at('tail', 1) === 'tail' && at('tail', 0.5) === 'tail' && at('tail', 0.2) === 'summary' && at('tail', 0.05) === 'block' &&
      at('block', 1) === 'tail' && at('block', 0.2) === 'summary' && at('summary', 0.05) === 'block',
    can ? JSON.stringify({ t1: at('tail', 1), t02: at('tail', 0.2), t005: at('tail', 0.05), b1: at('block', 1) }) : 'nextCardDetail is not exported')
  // Inside the tail/summary band (0.26..0.32): a card that is `tail` stays
  // tail, a card that is `summary` stays summary; only the far edges flip.
  ok('detail.2 a scale oscillating inside a hysteresis band keeps the current tier; only crossing the far edge flips it',
    can && at('tail', 0.29) === 'tail' && at('summary', 0.29) === 'summary' && at('tail', 0.25) === 'summary' && at('summary', 0.33) === 'tail' &&
      at('summary', 0.13) === 'summary' && at('block', 0.13) === 'block' && at('summary', 0.10) === 'block' && at('block', 0.16) === 'summary',
    can ? JSON.stringify({ t029: at('tail', 0.29), s029: at('summary', 0.29), s013: at('summary', 0.13), b013: at('block', 0.13) }) : 'absent')
}

// M69 — minimap.1 / minimap.2 / minimap.3. THE OVERVIEW'S PROJECTION. One
// uniform scale fits every rect AND the viewport's world rect into the thumb
// with PAD clear on every side; the inverse lands back on the world point;
// the centred camera keeps its scale. Pure, so the status board's geometry
// is checked without a window.
{
  const P = V.minimapProjection, W = V.minimapToWorld, C = V.viewportCentredAt
  const have = typeof P === 'function' && typeof W === 'function' && typeof C === 'function'
  const rects = [
    { id: 'a', x: 0, y: 0, w: 400, h: 300 }, { id: 'b', x: 2000, y: 100, w: 300, h: 300 }, { id: 'c', x: -600, y: 900, w: 500, h: 200 }
  ]
  const vp = { x: -100, y: -50, scale: 0.5 }, size = { width: 1200, height: 800 }, thumb = { w: 200, h: 120 }
  const pr = have ? P({ rects, viewport: vp, size, thumb }) : null
  const PAD = have ? V.MINIMAP_PAD : NaN
  const inside = (b) => b.x >= PAD - 1e-6 && b.y >= PAD - 1e-6 && b.x + b.w <= thumb.w - PAD + 1e-6 && b.y + b.h <= thumb.h - PAD + 1e-6
  const uniform = pr ? rects.every((r) => { const b = pr.blocks.find((x) => x.id === r.id); return b && Math.abs(b.w / r.w - pr.scale) < 1e-9 && Math.abs(b.h / r.h - pr.scale) < 1e-9 }) : false
  // Centred: the slack on each axis is split, so the left/top clearance
  // equals the right/bottom one (a left-aligned projection passed the
  // first cut — M69's verifier).
  const boxes = pr ? [...pr.blocks, pr.view] : []
  const minL = Math.min(...boxes.map((b) => b.x)), maxR = Math.max(...boxes.map((b) => b.x + b.w))
  const minT = Math.min(...boxes.map((b) => b.y)), maxB = Math.max(...boxes.map((b) => b.y + b.h))
  const centred = pr !== null && Math.abs(minL - (thumb.w - maxR)) < 1e-6 && Math.abs(minT - (thumb.h - maxB)) < 1e-6
  ok('minimap.1 the projection fits every rect and the viewport inside the thumb with PAD clear, centred, at one uniform scale',
    pr !== null && pr.blocks.length === 3 && pr.blocks.every(inside) && inside(pr.view) && uniform && pr.scale > 0 && centred,
    JSON.stringify(pr))

  const back = pr ? W({ x: pr.blocks[1].x + pr.blocks[1].w / 2, y: pr.blocks[1].y + pr.blocks[1].h / 2 }, pr) : null
  const empty = have ? P({ rects: [], viewport: vp, size, thumb }) : null
  const viewWorld = { w: size.width / vp.scale, h: size.height / vp.scale }
  ok('minimap.2 the inverse lands on the world point, and with no rects the viewport alone fills the thumb',
    back !== null && Math.abs(back.x - 2150) < 1e-6 && Math.abs(back.y - 250) < 1e-6 &&
      empty !== null && empty.blocks.length === 0 && inside(empty.view) &&
      (Math.abs(empty.view.w - (thumb.w - 2 * PAD)) < 1e-6 || Math.abs(empty.view.h - (thumb.h - 2 * PAD)) < 1e-6) &&
      Math.abs(empty.view.w / empty.view.h - viewWorld.w / viewWorld.h) < 1e-6,
    JSON.stringify({ back, empty }))

  const cam = have ? C({ x: 2150, y: 250 }, vp, size) : null
  const centre = cam ? V.screenToWorld({ x: size.width / 2, y: size.height / 2 }, cam) : null
  ok('minimap.3 the centred camera keeps its scale and puts the point at the viewport centre',
    cam !== null && cam.scale === vp.scale && Math.abs(centre.x - 2150) < 1e-6 && Math.abs(centre.y - 250) < 1e-6,
    JSON.stringify({ cam, centre }))
}

// M92. PINS are counted INSIDE assignTiers: promoted first, in array order,
//      before the focused panel and before recency; a pin off-screen is still
//      live (that is what a pin is for); pins past the budget are carded in
//      array order, which is the same count the verb's refusal reads.
{
  const rects = []
  for (let i = 0; i < 12; i++) rects.push(panelAt('p' + i, 100 + i * 10, 100))
  const far = panelAt('farpin', 90000, 90000)
  const all = [...rects, far]
  const tiers = V.assignTiers({
    rects: all, viewport: AT_ORIGIN, size: SIZE, focusedId: 'p11', lastFocusedAt: { p0: 100, p1: 90 },
    pinnedIds: new Set(['farpin', 'p5', 'p6']), budget: 4
  })
  const beyond = V.assignTiers({
    rects: all, viewport: AT_ORIGIN, size: SIZE, focusedId: null, lastFocusedAt: {},
    pinnedIds: new Set(['p0', 'p1', 'p2', 'p3', 'p4', 'p5']), budget: 4
  })
  // Focus is NEVER carded: with pins filling the budget it evicts the last pin.
  const full = V.assignTiers({
    rects: all, viewport: AT_ORIGIN, size: SIZE, focusedId: 'p9', lastFocusedAt: {},
    pinnedIds: new Set(['p0', 'p1', 'p2', 'p3']), budget: 4
  })
  ok('pin.1 pins are live first (an off-screen pin included), then the focused panel, then recency; pins past the budget are carded in array order; the focused panel is never carded (it evicts the last pin); pinCount counts terminals only and PIN_MAX is one below the budget',
    tiers.farpin === 'live' && tiers.p5 === 'live' && tiers.p6 === 'live' && tiers.p11 === 'live' && tiers.p0 === 'card' &&
      beyond.p0 === 'live' && beyond.p3 === 'live' && beyond.p4 === 'card' && beyond.p5 === 'card' &&
      full.p9 === 'live' && full.p3 === 'card' && full.p0 === 'live' &&
      V.pinCount([{ kind: 'terminal', pinned: true }, { kind: 'review', pinned: true }, { kind: 'terminal' }]) === 1 &&
      V.PIN_MAX === V.LIVE_BUDGET - 1 &&
      typeof V.pinRefusal('review', false, 0) === 'string' && typeof V.pinRefusal('terminal', false, V.PIN_MAX) === 'string' && V.pinRefusal('terminal', false, 0) === undefined,
    JSON.stringify({ tiers, beyond, full }))
}

// M92. MAXIMISE is a rect: the visible viewport in world units at the current
//      scale, inset by a margin — pure arithmetic over the camera.
{
  const vp = { x: -200, y: -100, scale: 0.5 }
  const rect = V.maximiseRect(vp, SIZE, 16)
  // world -> screen is world * scale + camera; the rect's corner must land on the margin.
  const back = { x: rect.x * vp.scale + vp.x, y: rect.y * vp.scale + vp.y }
  ok('max.1 maximiseRect fills the visible viewport at the current scale, inset by the margin in screen pixels',
    Math.abs(back.x - 16) < 0.01 && Math.abs(back.y - 16) < 0.01 &&
      Math.abs(rect.w * vp.scale - (SIZE.width - 32)) < 0.01 && Math.abs(rect.h * vp.scale - (SIZE.height - 32)) < 0.01,
    JSON.stringify({ rect, back }))
}

// M93. ANNOTATIONS: a panel anchor is the panel's rect plus an offset, so the
//      note moves with its panel; a click inside a panel resolves to a panel
//      anchor and outside to a world anchor; pruning drops an orphan.
{
  const panels = [{ rect: { id: 'n1', x: 100, y: 100, w: 500, h: 300 } }, { rect: { id: 'n2', x: 1000, y: 100, w: 500, h: 300 } }]
  const onPanel = { id: 'a', text: 't', anchor: { kind: 'panel', panelId: 'n1', dx: 20, dy: -24 } }
  const inWorld = { id: 'b', text: 't', anchor: { kind: 'world', x: 5, y: 6 } }
  const p1 = V.annotationPoint(onPanel, panels)
  const moved = V.annotationPoint(onPanel, [{ rect: { id: 'n1', x: 400, y: 700, w: 500, h: 300 } }])
  const p2 = V.annotationPoint(inWorld, panels)
  const orphan = V.annotationPoint(onPanel, [])
  const inside = V.resolveAnchor({ x: 150, y: 150 }, panels)
  const outside = V.resolveAnchor({ x: 5000, y: 5000 }, panels)
  const pruned = V.pruneAnnotations([onPanel, inWorld, { id: 'c', text: 't', anchor: { kind: 'panel', panelId: 'gone', dx: 0, dy: 0 } }], new Set(['n1', 'n2']))
  ok('annot.1 a panel-anchored note is the panel rect plus its offset and follows the panel; a world note is its point; an orphan resolves null; a point inside a panel becomes a panel anchor with the offset from its corner, outside a world anchor; pruning drops the orphan only',
    p1.x === 120 && p1.y === 76 && moved.x === 420 && moved.y === 676 && p2.x === 5 && p2.y === 6 && orphan === null &&
      inside.kind === 'panel' && inside.panelId === 'n1' && inside.dx === 50 && inside.dy === 50 &&
      outside.kind === 'world' && outside.x === 5000 &&
      pruned.length === 2 && pruned.map((a) => a.id).join(',') === 'a,b',
    JSON.stringify({ p1, moved, p2, orphan, inside, outside, pruned: pruned.map((a) => a.id) }))
}

// M146 — fit.sel.1. Zoom to fit over a SELECTION is the same math fitAll
// uses (`fitTo`), over fewer rects: the selected rects land inside the canvas
// with the margin, and the scale is at least fitAll's over the whole set
// (a subset never needs a smaller camera). Pinned so the verb's two arms
// cannot drift apart in the one function they share.
{
  const size = { width: 1200, height: 800 }
  const all = [
    { id: 'a', x: 0, y: 0, w: 400, h: 300 }, { id: 'b', x: 500, y: 0, w: 400, h: 300 },
    { id: 'c', x: 3000, y: 2000, w: 400, h: 300 }
  ]
  const sel = all.slice(0, 2)
  const whole = V.fitTo(all, size, 64)
  const some = V.fitTo(sel, size, 64)
  const inside = sel.every((r) => {
    const tl = V.worldToScreen({ x: r.x, y: r.y }, some)
    const br = V.worldToScreen({ x: r.x + r.w, y: r.y + r.h }, some)
    return tl.x >= 63 && tl.y >= 63 && br.x <= size.width - 63 && br.y <= size.height - 63
  })
  ok('fit.sel.1 fitTo over a selection frames the selected rects inside the margin at a scale no smaller than the whole canvas needs',
    inside && some.scale >= whole.scale && some.scale > whole.scale,
    JSON.stringify({ whole, some }))
}

// M149 — fit.target.1 (the Act II critic: fit.sel.1 exercised fitTo, never
// the CHOICE). zoomTarget's three arms, pure: the selection when any, every
// panel otherwise, a reset on an empty canvas; a selected id that names no
// panel is not a selection.
{
  const all = [{ id: 'a', x: 0, y: 0, w: 10, h: 10 }, { id: 'b', x: 50, y: 0, w: 10, h: 10 }]
  const sel = V.zoomTarget(new Set(['b']), all)
  const none = V.zoomTarget(new Set(), all)
  const stale = V.zoomTarget(new Set(['zz']), all)
  const empty = V.zoomTarget(new Set(['a']), [])
  ok('fit.target.1 zoomTarget frames the selection when any, every panel otherwise, resets on an empty canvas, and treats a stale selected id as no selection',
    sel.kind === 'selection' && sel.rects.length === 1 && sel.rects[0].id === 'b' && none.kind === 'all' && stale.kind === 'all' && empty.kind === 'reset',
    JSON.stringify({ sel, none, stale, empty }))
}

// M155 — ink.2. `simplifyStroke` (Ramer–Douglas–Peucker) over world points:
// a straight run of many points collapses to its two ends, a corner is kept,
// a tolerance of 0 keeps every point, and fewer than three points pass
// through untouched.
{
  const has = typeof V.simplifyStroke === 'function'
  const line = Array.from({ length: 50 }, (_, i) => [i, i * 0.5 + (i % 2 ? 0.01 : -0.01)])
  const corner = [[0, 0], [10, 0], [20, 0], [20, 10], [20, 20]]
  const straight = has ? V.simplifyStroke(line, 0.75) : null
  const bent = has ? V.simplifyStroke(corner, 0.75) : null
  const exact = has ? V.simplifyStroke(corner, 0) : null
  const two = has ? V.simplifyStroke([[0, 0], [5, 5]], 0.75) : null
  ok('ink.2 simplifyStroke collapses a straight run to its ends, keeps a corner, keeps every point at tolerance 0, and passes fewer than three points through',
    has && straight.length === 2 && straight[0][0] === 0 && straight[1][0] === 49 && bent.length === 3 && bent[1][0] === 20 && bent[1][1] === 0 && exact.length === 5 && two.length === 2,
    JSON.stringify({ straight, bent, exactLen: exact && exact.length, two }))
}

// M181 — starter.plan.1. THE STARTER MANIFEST as geometry: exactly the four
// example keys, none of them the agent's, every caption a sentence, every
// rect positive and no two overlapping — two overlapping rects would mint
// one example on top of another, which the first run reads as three
// examples, and nothing else in the app would say why. Guarded so a missing
// module fails by name rather than throwing before the tally.
{
  const objs = Array.isArray(V.STARTER_OBJECTS) ? V.STARTER_OBJECTS : null
  if (objs === null) ok('starter.plan.1 STARTER_OBJECTS: the keys terminal, note, workflow, image once each, none `agent`, each caption a sentence, each rect positive, no two rects overlapping', false, 'src/shared/starter.ts does not exist')
  else {
    const keys = objs.map((o) => o.key)
    const overlaps = (a, b) => a.dx < b.dx + b.w && b.dx < a.dx + a.w && a.dy < b.dy + b.h && b.dy < a.dy + a.h
    let overlap = null
    for (let i = 0; i < objs.length; i += 1) for (let j = i + 1; j < objs.length; j += 1) {
      if (overlaps(objs[i].rect, objs[j].rect)) overlap = `${objs[i].key}/${objs[j].key}`
    }
    const KINDS = ['terminal', 'file', 'workflow', 'image']
    ok('starter.plan.1 STARTER_OBJECTS: the keys terminal, note, workflow, image once each, none `agent`, each caption a sentence, each rect positive, no two rects overlapping',
      V.STARTER_VERSION === 1 && V.AGENT_KEY === 'agent' &&
        [...keys].sort().join(',') === 'image,note,terminal,workflow' && new Set(keys).size === 4 && !keys.includes(V.AGENT_KEY) &&
        objs.every((o) => KINDS.includes(o.kind) && typeof o.caption === 'string' && o.caption.trim().length > 0 && /\.$/.test(o.caption.trim())) &&
        objs.every((o) => o.rect && Number.isFinite(o.rect.dx) && Number.isFinite(o.rect.dy) && o.rect.w > 0 && o.rect.h > 0) &&
        overlap === null,
      JSON.stringify({ version: V.STARTER_VERSION, keys, kinds: objs.map((o) => o.kind), captions: objs.map((o) => o.caption), overlap }))
  }
}

// M181 — image.kind.1. THE FIFTEENTH KIND's partition, check 92's rule from
// the other side: `isImagePanel` is a POSITIVE partition — true for an
// image panel and false for EVERY other kind — and every other kind's own
// partition is false for an image panel. A helper that admitted the image
// to isTerminalPanel would hand it to assignTiers and registry.ensure with
// no spec (a WebGL context burnt on a picture); one that admitted it to
// isFilePanel would open it in the editor as text. makeImagePanel centres
// on the point the way makeBrowserPanel and makeMemoryPanel do.
{
  const has = typeof V.makeImagePanel === 'function' && typeof V.isImagePanel === 'function'
  if (!has) ok('image.kind.1 makeImagePanel centres on the point and carries path and title; isImagePanel is true for it alone and every other kind\'s partition is false for it', false, 'makeImagePanel / isImagePanel do not exist in src/renderer/panels/panels.ts')
  else {
    const c = { x: 1000, y: -250 }
    const img = V.makeImagePanel('img1', c, 7, '/tmp/welcome.png', 'welcome.png')
    const centred = img.rect.id === 'img1' && img.rect.w > 0 && img.rect.h > 0 &&
      Math.abs(img.rect.x + img.rect.w / 2 - c.x) < 1e-9 && Math.abs(img.rect.y + img.rect.h / 2 - c.y) < 1e-9
    const others = [
      V.makePanel('n1', c, 1),
      { rect: { id: 'n9', x: 0, y: 0, w: 1, h: 1 }, z: 1, spec: { panelId: 'n9', cwd: '~', args: [] } },
      V.makeFilePanel('f1', c, 1, { path: '/tmp/c' }),
      V.makeReviewPanel('r1', c, 1, { subjectId: 'n1', repoRoot: '/r', baselineSha: 'abc', label: 'x' }),
      V.makeJiraPanel('j1', c, 1),
      V.makeGithubPanel('g1', c, 1),
      V.makeToolboxPanel('t1', c, 1, { cwd: '/r', label: 'r' }),
      V.makeChatPanel('c1', c, 1, { cwd: '/r', sessionId: 'u' }),
      V.makeMemoryPanel('m1', c, 1, { root: '/r' }),
      V.makeWatcherPanel('w1', c, 1, { cwd: '/r', command: 'true', args: [], trigger: { kind: 'timer', everyMs: 60000 } }),
      V.makeBrowserPanel('b1', c, 1, 'https://example.com'),
      V.makeWorkPanel('k1', c, 1, 'item', 'work'),
      V.makeSkillPanel('s1', c, 1, 'user', 'name'),
      V.makeWorkflowPanel('wf1', c, 1, 'tpl', 'wf')
    ]
    const partitions = ['isTerminalPanel', 'isFilePanel', 'isReviewPanel', 'isJiraPanel', 'isGithubPanel', 'isToolboxPanel', 'isChatPanel', 'isMemoryPanel', 'isWatcherPanel', 'isBrowserPanel', 'isWorkPanel', 'isSkillPanel', 'isWorkflowPanel']
    const admitted = partitions.filter((name) => typeof V[name] !== 'function' || V[name](img) === true)
    const leaked = others.filter((p) => V.isImagePanel(p) !== false).map((p) => p.rect.id)
    ok('image.kind.1 makeImagePanel centres on the point and carries path and title; isImagePanel is true for it alone and every other kind\'s partition is false for it',
      centred && img.kind === 'image' && img.z === 7 && img.image.path === '/tmp/welcome.png' && img.title === 'welcome.png' &&
        V.isImagePanel(img) === true && admitted.length === 0 && leaked.length === 0 && others.length === 14,
      JSON.stringify({ rect: img.rect, admitted, leaked }))
  }
}

// M184 — run.outcome.1. THE BLOCK'S OUTCOME is read from the run's OWN
//      snapshot (`definition.nodes` for the keys, `mapping` for the panel each
//      key became) against the run's entries — never from the live draft, so
//      editing the diagram after a run leaves that run's tones as they were.
//      The vocabulary is the recorder's (`useHandoff`'s `fired` events, the
//      only writer of `RunEntry.outcome`): `exit 0` and `a turn` finished,
//      `exit 1` / `exit by signal` failed, `skipped — …` (a fork that did not
//      fire) and `stopped` their own words rather than red.
//      M184 (the critic, 7, 8 and 11). Four facts kept apart that were one
//      word: a key with NO MAPPING was never instantiated (`absent`), a
//      mapped key with no entry is `queued`, an entry with no outcome is
//      `working` on an OPEN run and `unknown` on a SEALED one. `RunEntry`
//      records no pending question, so `wants-you` has no fixture and is
//      reserved; `outcomeWord` and `outcomeTone` still answer for it.
{
  const has = typeof V.blockOutcomes === 'function' && typeof V.outcomeWord === 'function' && typeof V.outcomeTone === 'function'
  const NAME = 'run.outcome.1 blockOutcomes reads definition + mapping against the run\'s entries: no mapping → absent; mapped with no entry → queued; started with no outcome → working on an open run and unknown on a sealed one; exit 0 and a turn → finished; a failing exit or a signal → failed; skipped and stopped keep their own words; no definition → {}; outcomeWord and outcomeTone answer for every member'
  if (!has) ok(NAME, false, 'blockOutcomes / outcomeWord / outcomeTone do not exist in src/shared/run-outcome.ts')
  else {
    const def = (keys) => ({ templateId: 't1', revision: 3, nodes: keys.map((key, i) => ({ key, kind: 'terminal', cwd: '~', dx: i * 100, dy: 0 })), edges: [] })
    const run = (over = {}) => ({ id: 'r1', name: 'a run', panelIds: ['a', 'b', 'c'], edges: [], startedAt: 1000, templateId: 't1', ...over })
    const first = V.blockOutcomes(run({
      definition: def(['n1', 'n2', 'n3', 'n4']),
      mapping: { n1: 'a', n2: 'b', n3: 'c' },
      entries: [
        { panelId: 'b', startedAt: 1000 },
        { panelId: 'c', startedAt: 1000, endedAt: 1500, outcome: 'exit 0' }
      ]
    }))
    const second = V.blockOutcomes(run({
      definition: def(['n1', 'n2', 'n3', 'n4', 'n5']),
      mapping: { n1: 'a', n2: 'b', n3: 'c', n4: 'd', n5: 'e' },
      entries: [
        { panelId: 'a', startedAt: 1000, endedAt: 1200, outcome: 'exit 1' },
        { panelId: 'b', startedAt: 1000, endedAt: 1300, outcome: 'a turn' },
        { panelId: 'c', startedAt: 1000, endedAt: 1400, outcome: 'exit by signal' },
        { panelId: 'd', startedAt: 1000, endedAt: 1400, outcome: 'skipped — exit 1 is not exit 0' },
        { panelId: 'e', startedAt: 1000, endedAt: 1400, outcome: 'stopped' }
      ]
    }))
    // The same entry, on an open run and on a sealed one: `working` then `unknown`.
    const sealedArgs = {
      definition: def(['n1']),
      mapping: { n1: 'a' },
      entries: [{ panelId: 'a', startedAt: 1000 }]
    }
    const open = V.blockOutcomes(run(sealedArgs))
    const sealed = V.blockOutcomes(run({ ...sealedArgs, endedAt: 9000 }))
    const none = V.blockOutcomes(run({ entries: [{ panelId: 'a', startedAt: 1000, endedAt: 1200, outcome: 'exit 0' }] }))
    const members = ['absent', 'queued', 'working', 'unknown', 'finished', 'failed', 'skipped', 'stopped', 'wants-you']
    const words = members.map((o) => V.outcomeWord(o))
    const tones = members.map((o) => V.outcomeTone(o))
    ok(NAME,
      first !== null && typeof first === 'object' && Object.keys(first).sort().join(',') === 'n1,n2,n3,n4' &&
        first.n1 === 'queued' && first.n2 === 'working' && first.n3 === 'finished' && first.n4 === 'absent' &&
        second !== null && typeof second === 'object' && Object.keys(second).sort().join(',') === 'n1,n2,n3,n4,n5' &&
        second.n1 === 'failed' && second.n2 === 'finished' && second.n3 === 'failed' &&
        second.n4 === 'skipped' && second.n5 === 'stopped' &&
        open.n1 === 'working' && sealed.n1 === 'unknown' &&
        none !== null && typeof none === 'object' && Object.keys(none).length === 0 &&
        words.join('|') === 'not run|queued|working|no outcome|finished|failed|skipped|stopped|needs you' &&
        tones.join('|') === 'none|starting|working|none|idle|exited|asleep|asleep|needs-you',
      JSON.stringify({ first, second, open, sealed, none, words, tones }))
  }
}

// M199 — run.supervision.1. ONE table keeps execution, queue reason,
//      blocker and execution result separate. Live facts overlay only an
//      OPEN entry; an answered approval disappears with main's pending set,
//      and no actionable request is written into the run record.
{
  const NAME = 'run.supervision.1 projectRun separates not-run/upstream queue/current-turn queue/concurrency queue/running/approval/terminal attention from turn-complete/exit-0/failed/skipped/stopped/sealed-unknown, uses the oldest structured request, and stores no live approval in the run'
  if (typeof V.projectRun !== 'function') ok(NAME, false, 'projectRun does not exist in src/shared/run-outcome.ts')
  else {
    const definition = { templateId: 't', revision: 1, nodes: ['absent', 'upstream', 'turnq', 'capq', 'approval', 'keyboard', 'running', 'turn', 'ok', 'failed', 'skipped', 'stopped', 'unknown'].map((key, i) => ({ key, kind: 'chat', cwd: '/r', dx: i, dy: 0 })), edges: [] }
    const mapping = Object.fromEntries(definition.nodes.filter((n) => n.key !== 'absent').map((n) => [n.key, `p-${n.key}`]))
    const entries = definition.nodes.filter((n) => !['absent', 'upstream'].includes(n.key)).map((n) => ({ panelId: `p-${n.key}`, startedAt: 1,
      ...({ turn: { endedAt: 2, outcome: 'a turn' }, ok: { endedAt: 2, outcome: 'exit 0' }, failed: { endedAt: 2, outcome: 'exit 2' }, skipped: { endedAt: 2, outcome: 'skipped — condition did not fire' }, stopped: { endedAt: 2, outcome: 'stopped by person' }, unknown: {} }[n.key] ?? {}) }))
    const run = { id: 'r', name: 'run', panelIds: Object.values(mapping), edges: [], startedAt: 1, definition, mapping, entries }
    const live = {
      'p-turnq': { status: 'streaming', queued: 1, queuedReason: 'in-flight' },
      'p-capq': { status: 'not-started', queued: 2, queuedReason: 'concurrency' },
      'p-approval': { status: 'streaming', attention: true, approvals: [{ requestId: 'old', toolName: 'Bash', argument: 'npm test' }, { requestId: 'new', toolName: 'Edit', argument: 'a.ts' }] },
      'p-keyboard': { status: 'streaming', attention: true },
      'p-running': { status: 'streaming', queued: 0 }
    }
    const p = V.projectRun(run, live)
    const sealed = V.projectRun({ ...run, endedAt: 9 }, {})
    const taskBefore = { id: 'i1', state: 'review' }
    const taskApproval = V.projectSession('p-task', { status: 'streaming', attention: true, approvals: [{ requestId: 'task-q', toolName: 'Bash', argument: 'npm run verify' }] })
    const taskAfter = V.projectSession('p-task', { status: 'streaming', attention: false, approvals: [] })
    const taskTurn = V.projectSession('p-task', { status: 'ready', turns: 1 })
    const compact = Object.fromEntries(Object.entries(p).map(([k, v]) => [k, { execution: v.execution, result: v.result, word: v.word, queueReason: v.queueReason, blocker: v.blocker?.kind, request: v.approval?.requestId }]))
    ok(NAME,
      p.absent.execution === 'not-run' && p.upstream.execution === 'queued' && p.upstream.queueReason === 'upstream' &&
      p.turnq.execution === 'queued' && p.turnq.queueReason === 'in-flight' && /current turn/.test(p.turnq.detail) &&
      p.capq.execution === 'queued' && p.capq.queueReason === 'concurrency' && /concurrency ceiling/.test(p.capq.detail) &&
      p.approval.word === 'needs you' && p.approval.blocker?.kind === 'approval' && p.approval.approval?.requestId === 'old' && /Bash/.test(p.approval.detail) && /npm test/.test(p.approval.detail) &&
      p.keyboard.word === 'needs you' && p.keyboard.blocker?.kind === 'keyboard' && p.keyboard.approval === undefined && /keyboard/.test(p.keyboard.detail) &&
      p.running.execution === 'running' && p.turn.result === 'turn-complete' && p.turn.word === 'turn complete' &&
      p.ok.result === 'passed' && p.ok.word === 'exit 0' && p.failed.result === 'failed' && p.skipped.result === 'skipped' && p.stopped.result === 'stopped' &&
      p.unknown.execution === 'running' && p.unknown.word === 'working' && /backend has no live/.test(p.unknown.detail) &&
      sealed.unknown.execution === 'unknown' && sealed.unknown.result === 'unknown' && sealed.unknown.word === 'no outcome' &&
      taskApproval.word === 'needs you' && taskApproval.approval?.requestId === 'task-q' && /npm run verify/.test(taskApproval.detail) &&
      taskAfter.word === 'working' && taskAfter.approval === undefined && taskTurn.word === 'turn complete' && taskTurn.tone === 'none' && taskBefore.state === 'review' &&
      p.turn.tone === 'none' && p.ok.tone === 'none' &&
      JSON.stringify(run).includes('requestId') === false,
      JSON.stringify({ compact, sealedUnknown: sealed.unknown, taskApproval, taskAfter, taskTurn, taskBefore }))
  }
}

// M187 — note.kind.1. THE SIXTEENTH KIND, one record and three FORMS.
//      `makeNotePanel` centres on the point and a FRAME is minted larger,
//      because a region that encloses nothing is a region a person has to
//      resize before it means what they drew. `isNotePanel` is true for it
//      alone, and — the dangerous direction — `isTerminalPanel` must be FALSE
//      for it: a note satisfying the terminal partition reaches assignTiers
//      and registry.ensure with no spec at all, which is a crash with no
//      message rather than a missing feature. The tint belongs to the sticky
//      alone and is dropped for the other two forms at the mint.
{
  const has = typeof V.makeNotePanel === 'function' && typeof V.isNotePanel === 'function' && typeof V.noteSummary === 'function'
  const NAME = 'note.kind.1 makeNotePanel centres on the point, mints a frame larger than a note, keeps a tint only on a sticky; isNotePanel is true for it alone and every other kind\'s partition — isTerminalPanel included — is false for it; noteSummary is the first non-empty line, cut, with a per-form sentence when there is none'
  if (!has) ok(NAME, false, 'panels.ts / notes.ts do not export makeNotePanel, isNotePanel and noteSummary')
  else {
    const sticky = V.makeNotePanel('nt1', { x: 100, y: 50 }, 3, 'sticky', 'first line\nsecond', 'blue')
    const text = V.makeNotePanel('nt2', { x: 0, y: 0 }, 1, 'text', '', 'blue')
    const frame = V.makeNotePanel('nt3', { x: 0, y: 0 }, 1, 'frame', '')
    const partitions = ['isTerminalPanel', 'isReviewPanel', 'isFilePanel', 'isJiraPanel', 'isGithubPanel', 'isToolboxPanel', 'isMemoryPanel', 'isChatPanel', 'isWatcherPanel', 'isBrowserPanel', 'isWorkPanel', 'isSkillPanel', 'isWorkflowPanel', 'isImagePanel']
    const leaked = partitions.filter((name) => typeof V[name] === 'function' && V[name](sticky) === true)
    ok(NAME,
      sticky.kind === 'note' && sticky.note.form === 'sticky' && sticky.note.text === 'first line\nsecond' && sticky.note.tint === 'blue' &&
        sticky.rect.x === 100 - sticky.rect.w / 2 && sticky.rect.y === 50 - sticky.rect.h / 2 &&
        // A frame is minted larger than a note, in both dimensions.
        frame.rect.w > sticky.rect.w && frame.rect.h > sticky.rect.h &&
        !('tint' in text.note) && !('tint' in frame.note) &&
        V.isNotePanel(sticky) === true && leaked.length === 0 &&
        V.noteSummary('', 'frame') === 'an unnamed region' && V.noteSummary('', 'text') === 'empty text' && V.noteSummary('', 'sticky') === 'an empty note' &&
        V.noteSummary('\n  hello there  \nmore', 'sticky') === 'hello there' &&
        V.noteSummary('x'.repeat(80), 'sticky', 10) === `${'x'.repeat(9)}…`,
      JSON.stringify({ sticky, text, frame, leaked }))
  }
}

// ---------------------------------------------------------------------------
// M230 — edge.flow.1/.2/.3. EDGE ACTIVITY, the pure model.
//
// An edge animates ONLY when something crosses it. At rest it is a quiet line
// with no motion. That was chosen over a continuously-tinted "health" grammar
// deliberately: ambient motion on every edge contradicts the rest rule and has
// no honest reduced-motion degradation.
//
// Six states, each from a signal that ALREADY EXISTS on the wire — nothing
// here invents a new subscription:
//   rest     no signal
//   armed    a run is live and both endpoints are in its component
//   firing   useHandoff recorded { kind: 'fired' } for the source
//   arrived  a join arrival landed on this edge
//   waiting  the target is a join with sources still owed, and THIS edge has
//            already arrived (an unarrived edge stays at rest — the brief:
//            "armed edges breathe; unarrived edges stay at rest")
//   blocked  the target's state word is `needs you`
//
// The reducer is pure and keyed `from:to`, the automation key every surface
// in this app already shares.
{
  const fn = typeof V.edgeActivity === 'function' ? V.edgeActivity : null
  const edges = [{ from: 'a', to: 'c' }, { from: 'b', to: 'c' }, { from: 'c', to: 'd' }]
  const base = { edges, armed: new Set(), fired: new Map(), arrived: new Map(), waitingFor: new Map(), blocked: new Set(), now: 1000 }
  const at = (m, k) => (m && m.get(k) ? m.get(k).kind : 'no-entry')
  const run = (over) => (fn === null ? null : fn({ ...base, ...over }))

  // .1 — an edge with NO signal is `rest`, and every declared edge gets an
  //      answer. "No entry in the map" and "rest" are two different facts to a
  //      caller and only one of them is true here.
  const quiet = run({})
  ok('edge.flow.1 every declared edge answers, and an edge with no signal at all is rest — never a missing entry',
    quiet !== null && quiet.size === 3 && ['a:c', 'b:c', 'c:d'].every((k) => at(quiet, k) === 'rest'),
    JSON.stringify(quiet === null ? 'no edgeActivity export' : [...quiet].map(([k, v]) => [k, v.kind])))

  // .2 — PRECEDENCE, and it is not arbitrary. blocked outranks everything: if
  //      the target is asking a person a question, nothing is crossing that
  //      edge, and a travelling packet would be a lie. Then firing (the thing
  //      that is happening now), then arrived, then waiting, then armed.
  const fired = run({ armed: new Set(['a', 'c']), fired: new Map([['a:c', 900]]) })
  const blocked = run({ armed: new Set(['a', 'c']), fired: new Map([['a:c', 900]]), blocked: new Set(['c']) })
  const arrived = run({ armed: new Set(['a', 'c']), arrived: new Map([['a:c', 950]]) })
  const armedOnly = run({ armed: new Set(['a', 'c']) })
  ok('edge.flow.2 precedence: blocked outranks a live fire (a packet crossing into a panel that is asking a question would be a lie), firing outranks arrived, and armed is the floor above rest',
    fired !== null && at(fired, 'a:c') === 'firing' && at(blocked, 'a:c') === 'blocked' &&
      at(arrived, 'a:c') === 'arrived' && at(armedOnly, 'a:c') === 'armed' &&
      at(armedOnly, 'c:d') === 'rest',
    JSON.stringify({ fired: at(fired, 'a:c'), blocked: at(blocked, 'a:c'), arrived: at(arrived, 'a:c'), armed: at(armedOnly, 'a:c'), outsideComponent: at(armedOnly, 'c:d') }))

  // .3 — THE JOIN. c waits on a and b; a has arrived, b has not. The arrived
  //      edge BREATHES (waiting); the unarrived one does NOT — it stays
  //      static. Collapsing the two would hide which source is holding the
  //      join up, which is the only question a waiting join raises.
  //
  //      AN AMBIGUITY, RESOLVED HERE. The brief says "armed edges breathe;
  //      unarrived edges stay at rest", and `rest` is also the name of a
  //      state in the same table. Read literally, b:c would be `rest` — but
  //      b:c runs between two panels inside a LIVE run, and `rest` means "no
  //      signal at all". Calling it rest would contradict `armed`'s own
  //      definition and would draw the edge as though the run were not
  //      running through it.
  //
  //      So "stay at rest" is read as "stay STILL", which is what the
  //      sentence is contrasting with "breathe": b:c is `armed` — lifted and
  //      static. The user still gets the answer, and gets it more precisely:
  //      breathing = delivered and waiting, lifted-static = live but has not
  //      delivered, quiet = not in this run at all. Three states where the
  //      literal reading offered two.
  // The arrival is 500 ms old — PAST its flash. That matters: `arrived` and
  // `waiting` are sequential, not competing. The edge reports the arrival for
  // EDGE_ARRIVE_MS and then settles into breathing while the join is still
  // owed. The first cut of this check used a 50 ms-old arrival and read
  // `arrived`, which was the model behaving correctly and the FIXTURE asking
  // the wrong moment. `d` is in the armed set too, because a run's component
  // is the whole chain — leaving it out and then expecting `c:d` to be armed
  // was the same mistake twice in one line.
  const join = run({ armed: new Set(['a', 'b', 'c', 'd']), arrived: new Map([['a:c', 500]]), waitingFor: new Map([['c', ['b']]]), now: 1000 })
  const wf = join && join.get('a:c') && join.get('a:c').waitingFor
  ok('edge.flow.3 a join names who it waits for: the delivered edge breathes and says which sources are owed, an undelivered edge inside the run is lifted but STILL, and an edge outside the run is quiet — three readings, not two',
    join !== null && at(join, 'a:c') === 'waiting' && Array.isArray(wf) && wf.join(',') === 'b' &&
      at(join, 'b:c') === 'armed' && at(join, 'c:d') === 'armed' &&
      // and an edge genuinely outside the run is still quiet, so the three
      // readings stay distinguishable rather than collapsing into two
      at(run({ arrived: new Map([['a:c', 500]]), waitingFor: new Map([['c', ['b']]]), now: 1000 }), 'b:c') === 'rest',
    JSON.stringify(join === null ? 'no edgeActivity export' : [...join].map(([k, v]) => [k, v.kind, v.waitingFor])))

  // .4 — EXPIRY, and the absent/malformed/unknown rule. A fire is a MOMENT:
  //      once its window has passed the edge falls back to what it otherwise
  //      is, so a canvas left open for an hour is not still animating a fire
  //      from breakfast. A malformed entry costs that ENTRY, never the
  //      collection — a NaN timestamp must not take the other five edges with
  //      it — and a signal naming an edge that does not exist is ignored
  //      rather than invented into the map.
  const stale = run({ armed: new Set(['a', 'c']), fired: new Map([['a:c', 0]]), now: 999999 })
  const junk = run({ fired: new Map([['a:c', Number.NaN], ['b:c', 900]]), now: 1000 })
  const ghost = run({ fired: new Map([['zz:qq', 900]]) })
  ok('edge.flow.4 a fire expires back to what the edge otherwise is; a malformed timestamp costs that entry alone; a signal for an edge that does not exist is ignored, never invented',
    stale !== null && at(stale, 'a:c') === 'armed' &&
      junk !== null && at(junk, 'a:c') === 'rest' && at(junk, 'b:c') === 'firing' &&
      ghost !== null && ghost.size === 3 && at(ghost, 'zz:qq') === 'no-entry',
    JSON.stringify({ stale: at(stale, 'a:c'), malformed: at(junk, 'a:c'), sibling: at(junk, 'b:c'), ghostSize: ghost && ghost.size }))

  // .5 — the travel parameter. `firing` carries t in [0, 1] so the layer can
  //      place the packet with the SAME analytic bezier the label already
  //      uses; the reducer owns the clock so the layer owns no state.
  const t0 = run({ fired: new Map([['a:c', 1000]]), now: 1000 })
  const tMid = run({ fired: new Map([['a:c', 1000]]), now: 1000 + Math.floor(V.EDGE_FIRE_MS / 2) })
  const tEnd = run({ fired: new Map([['a:c', 1000]]), now: 1000 + V.EDGE_FIRE_MS - 1 })
  const tOf = (m) => (m && m.get('a:c') && m.get('a:c').kind === 'firing' ? m.get('a:c').t : null)
  ok('edge.flow.5 a firing edge carries t in [0,1] across EDGE_FIRE_MS, so the layer places the packet with the same analytic bezier the label already uses and keeps no clock of its own',
    typeof V.EDGE_FIRE_MS === 'number' && V.EDGE_FIRE_MS > 0 &&
      tOf(t0) === 0 && tOf(tMid) !== null && tOf(tMid) > 0.4 && tOf(tMid) < 0.6 &&
      tOf(tEnd) !== null && tOf(tEnd) > 0.9 && tOf(tEnd) < 1,
    JSON.stringify({ fireMs: V.EDGE_FIRE_MS, t0: tOf(t0), tMid: tOf(tMid), tEnd: tOf(tEnd) }))

  // .6 — nothing armed means nothing to animate, and the layer needs to know
  //      that WITHOUT walking the map every frame: no rAF at all while
  //      nothing is armed is the budget rule, and this is the predicate it
  //      hangs on.
  const anim = typeof V.edgesAnimate === 'function' ? V.edgesAnimate : null
  ok('edge.flow.6 edgesAnimate answers whether ANY edge needs a frame, so the layer can run no rAF at all while nothing is moving',
    anim !== null && anim(run({})) === false && anim(run({ armed: new Set(['a', 'c']) })) === false &&
      anim(run({ fired: new Map([['a:c', 1000]]), now: 1000 })) === true &&
      anim(run({ armed: new Set(['a', 'b', 'c', 'd']), arrived: new Map([['a:c', 500]]), waitingFor: new Map([['c', ['b']]]), now: 1000 })) === true,
    JSON.stringify(anim === null ? 'no edgesAnimate export' : {
      quiet: anim(run({})), armed: anim(run({ armed: new Set(['a', 'c']) })), firing: anim(run({ fired: new Map([['a:c', 1000]]), now: 1000 })) }))
}

// M256. Document focus widens about the CENTRE, never shrinks, and keeps the id.
{
  const small = V.docFocusRect({ id: 'f', x: 100, y: 100, w: 400, h: 300 })
  const big = V.docFocusRect({ id: 'g', x: 0, y: 0, w: 1200, h: 900 })
  ok('doc-focus.1 widened about the centre to the minimum; a larger panel is untouched',
    small.id === 'f' && small.w === V.DOC_FOCUS_MIN.w && small.h === V.DOC_FOCUS_MIN.h &&
      small.x + small.w / 2 === 300 && small.y + small.h / 2 === 250 &&
      big.x === 0 && big.y === 0 && big.w === 1200 && big.h === 900,
    JSON.stringify({ small, big }))
}
// M258 — minimap-drag.* / zoom-readout.1. THE VIEWPORT RECTANGLE IS A
// HANDLE. A drag that starts ON the camera's rectangle keeps the grab offset
// (no jump to centre the pointer), converts through the projection's inverse
// as toWorld(p2) - toWorld(p1) — never toWorld(p2 - p1), which subtracts a
// translation that should cancel — and is recomputed from the ORIGIN camera
// every frame, so two moves land where one would.
{
  const P = V.minimapProjection, Pan = V.minimapPanViewport, Hit = V.minimapViewHit
  const have = typeof P === 'function' && typeof Pan === 'function' && typeof Hit === 'function'
  const rects = [{ id: 'a', x: 0, y: 0, w: 400, h: 300 }, { id: 'b', x: 2000, y: 100, w: 300, h: 300 }]
  const vp = { x: -100, y: -50, scale: 0.5 }, size = { width: 1200, height: 800 }, thumb = { w: 200, h: 120 }
  const pr = have ? P({ rects, viewport: vp, size, thumb }) : null
  const from = pr ? { x: pr.view.x + pr.view.w / 2, y: pr.view.y + pr.view.h / 2 } : null
  const to = from ? { x: from.x + 10, y: from.y + 5 } : null
  const next = have ? Pan(vp, from, to, pr) : null
  const worldTL = (c) => V.screenToWorld({ x: 0, y: 0 }, c)
  const shift = next ? { x: worldTL(next).x - worldTL(vp).x, y: worldTL(next).y - worldTL(vp).y } : null
  ok('minimap-drag.1 dragging the viewport rectangle moves the camera by the thumb delta through the inverse, keeps the scale, and keeps the grab offset (no recentre)',
    next !== null && next.scale === vp.scale && Math.abs(shift.x - 10 / pr.scale) < 1e-6 && Math.abs(shift.y - 5 / pr.scale) < 1e-6,
    JSON.stringify({ next, shift, scale: pr?.scale }))
  const mid = from ? { x: from.x + 4, y: from.y - 7 } : null
  const twoStep = have ? Pan(vp, from, to, pr) : null
  const viaMid = have ? Pan(vp, from, mid, pr) : null
  const offOrigin = have && pr ? Pan({ x: 500, y: 300, scale: 0.5 }, from, to, pr) : null
  ok('minimap-drag.2 the pan is recomputed from the ORIGIN camera each frame (an intermediate move changes nothing) and depends only on the pointer delta, not the camera\'s translation',
    twoStep !== null && viaMid !== null && JSON.stringify(Pan(vp, from, to, pr)) === JSON.stringify(twoStep) &&
      offOrigin !== null && Math.abs((offOrigin.x - 500) - (twoStep.x - vp.x)) < 1e-9 && Math.abs((offOrigin.y - 300) - (twoStep.y - vp.y)) < 1e-9,
    JSON.stringify({ twoStep, viaMid, offOrigin }))
  ok('minimap-drag.3 the hit test is true on the camera rectangle (with slop at its edge) and false well away from it',
    have && pr !== null && Hit(from, pr) === true && Hit({ x: pr.view.x - 2, y: pr.view.y + 1 }, pr) === true && Hit({ x: pr.view.x - 40, y: pr.view.y - 40 }, pr) === false,
    JSON.stringify(pr?.view))
}
{
  const Z = V.zoomReadoutShown
  ok('zoom-readout.1 the zoom readout shows while zooming, or at rest only when the scale is outside 100% ± 5%',
    typeof Z === 'function' && Z(1, false) === false && Z(1.04, false) === false && Z(0.96, false) === false &&
      Z(1.06, false) === true && Z(0.5, false) === true && Z(1, true) === true,
    typeof Z)
}

{
  // The onboarding chat's geometry on a 1000x760 host: the zoom pill in the
  // bottom-right corner and the minimap stacked above it (the wide cluster).
  const C = V.clearOfOverlays
  const panel = { width: 560, height: 620 }
  const hud = { x: 760, y: 680, w: 222, h: 34 }
  const map = { x: 820, y: 560, w: 162, h: 102 }
  const hits = (c, o, m = 16) => {
    const l = c.x - panel.width / 2, t = c.y - panel.height / 2
    return !(l + panel.width <= o.x - m || l >= o.x + o.w + m || t + panel.height <= o.y - m || t >= o.y + o.h + m)
  }
  const out = typeof C === 'function' ? C({ x: 500, y: 400 }, panel, [map, hud]) : null
  ok('spawn-clear.1 a panel centred under the navigation cluster is moved clear of every overlay, along the cheaper axis, and stays inside the host margin',
    out !== null && !hits(out, map) && !hits(out, hud) && out.x < 500 && out.y === 400 && out.x - panel.width / 2 >= 16,
    JSON.stringify(out))
  const clear = typeof C === 'function' ? C({ x: 300, y: 300 }, { width: 200, height: 200 }, [map, hud]) : null
  const none = typeof C === 'function' ? C({ x: 500, y: 400 }, panel, []) : null
  ok('spawn-clear.2 a point already clear of the overlays, or with none, is returned untouched',
    clear !== null && clear.x === 300 && clear.y === 300 && none !== null && none.x === 500 && none.y === 400,
    JSON.stringify({ clear, none }))
  const cramped = typeof C === 'function' ? C({ x: 300, y: 300 }, { width: 560, height: 560 }, [{ x: 200, y: 200, w: 400, h: 400 }]) : null
  ok('spawn-clear.3 with no room on either axis the panel takes what room there is and never crosses the host\'s left or top margin',
    cramped !== null && cramped.x - 280 >= 16 - 1e-9 && cramped.y - 280 >= 16 - 1e-9,
    JSON.stringify(cramped))
}

const failed = results.filter((r) => !r.pass)
console.log(`${results.length - failed.length}/${results.length} passed`)
if (failed.length) {
  console.log('FAILED: ' + failed.map((f) => f.n).join(', '))
  process.exit(1)
}
process.exit(0)
