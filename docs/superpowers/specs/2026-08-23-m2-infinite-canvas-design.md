# M2 — Infinite canvas

Date: 2026-08-23
Status: approved, not yet implemented
Milestone: M2 (`README.md` roadmap)

## Goal

Build the viewport and coordinate layer the rest of the product sits on: pan,
zoom, and the screen↔world math, proven against dumb rectangles with no
terminal involved.

M1 deliberately shipped a live PTY with no transform math so that a blank panel
had exactly one possible cause. M2 is the mirror image: transform math with no
PTY, for the same reason. M3 merges them, and that is the first point at which
a bug could plausibly come from either side.

## Scope

**In scope**

- A `Viewport` model (`{x, y, scale}`) and pure conversions in both directions
- Trackpad pan, pinch-zoom-at-cursor, `Cmd`-modified keyboard zoom
- ~20 hardcoded placeholder rectangles laid out in world space
- Click-to-select via `screenToWorld` + hit-test
- A zoom/cursor HUD for diagnosis

**Explicitly out of scope**

- Live terminals on the canvas (M3)
- LOD tiers and viewport culling (M3)
- Dragging, resizing, spawning, or closing panels (M4)
- Persisting viewport or panel positions (M4)
- Crisp-at-rest rendering (see "Deferred: approach C")

**Deliberate temporary regression.** During M2, `App.tsx` renders the canvas
instead of the live `TerminalPanel`, so the app shows no working terminal until
M3. `verify:pty`, `verify:pty-manager`, `verify:window`, and `verify:ipc` remain
the proof that the PTY layer still works meanwhile. `TerminalPanel` itself is
not modified.

## Architecture

### Chosen approach: one CSS-transformed world layer

A single `.world` element carries `transform: translate(Xpx, Ypx) scale(k)`, and
panels are absolutely positioned inside it at world-space coordinates. Pan and
zoom rewrite one style property regardless of panel count.

The decisive property: a CSS `scale()` on an ancestor is invisible to
`getComputedStyle` and `ResizeObserver`, which are what `FitAddon` and the panel
resize path consult. **Zooming therefore cannot change a panel's cols/rows.**
Were that not true, every zoom gesture would reflow the running shell and
repaint the agent's TUI mid-gesture.

The same transform-blindness is why xterm's mouse mapping breaks under scale:
`getBoundingClientRect()` is transform-aware while `dimensions.css.cell.width`
is not, so under `scale(k)` every click maps to a cell off by a factor of `k`.
One mechanism, one benefit, one cost. M3 pays the cost by feeding xterm
corrected coordinates; M2 builds the function that corrects them.

### Rejected: per-panel screen-space layout

Setting each panel's `left/top/width/height` per frame and scaling content via
`font-size` would be crisp at every zoom and would need no pointer remapping.
Rejected because changing a panel's pixel width is exactly what `FitAddon`
measures: cols/rows would change as you zoom, reflowing the shell under the
user. It also turns one style write per frame into N.

### Deferred: approach C, crisp at rest

CSS scale during the gesture, then re-render crisply at the resting zoom by
adjusting `font-size` and counter-scaling while holding cols/rows fixed. Better
end state, real complexity, and unverifiable until live terminals exist. Because
the coordinate layer is pure functions rather than logic inside event handlers,
adopting this in M3 is a change to how panels *render*, not to how the canvas
*thinks*.

## Components

```
src/renderer/canvas/
  viewport.ts          pure math — no DOM, no React
  canvas-input.ts      platform events → intents — no React
  useViewport.ts       React state + listener wiring (the only place they meet)
  Canvas.tsx           clipping host + transformed world layer
  PlaceholderPanel.tsx a dumb rectangle
```

### `viewport.ts`

```ts
export interface Viewport { x: number; y: number; scale: number }
export interface Point { x: number; y: number }
export interface WorldRect { id: string; x: number; y: number; w: number; h: number }

screenToWorld(p: Point, vp: Viewport): Point
worldToScreen(p: Point, vp: Viewport): Point
zoomAt(vp: Viewport, anchor: Point, factor: number): Viewport
panBy(vp: Viewport, dx: number, dy: number): Viewport  // dx/dy in SCREEN px
hitTest(rects: WorldRect[], world: Point): string | null
```

`x`/`y` are the world origin's position in **canvas-local** pixels, not client
pixels. Converting a `MouseEvent` to canvas-local space (subtracting
`getBoundingClientRect()`) stays in the input layer, so this module never
touches a DOM node.

With `transform-origin: 0 0` and `translate` applied before `scale`, world point
`w` lands at `x + k·w`, so:

```
local = world · scale + {x, y}
world = (local − {x, y}) / scale
```

`zoomAt` computes the world point under the anchor *before* changing scale, then
solves for the translation that keeps it under the anchor afterwards. Scale
clamps to `[0.1, 3]`.

**Clamp ordering is load-bearing.** Clamp the scale first, then derive the
translation from the clamped value. Deriving translation from a requested scale
while applying a clamped one makes the canvas drift sideways while appearing
frozen — visible only when holding a pinch at the limit, which is why check 3
below exists.

`panBy`'s `dx`/`dy` are screen pixels, not world units: dragging two fingers a
given distance must move the content that same distance on screen at every
zoom level. It therefore translates `x`/`y` directly and never divides by scale.

`hitTest` iterates in reverse so the topmost rectangle wins, matching paint
order.

### `canvas-input.ts`

Turns platform events into `pan` / `zoom` / `click` intents.

| Gesture | Event shape | Intent |
|---|---|---|
| Trackpad two-finger | `ctrlKey: false`, pixel deltas | pan by `(−deltaX, −deltaY)` |
| Trackpad pinch | **`ctrlKey: true`** (synthetic) | zoom at pointer |
| `Cmd` + wheel | `metaKey: true` | zoom at pointer |
| `Shift` + wheel | — | horizontal pan |

`ctrlKey: true` on a pinch is a platform lie — no key is held. It is a WebKit
convention Chromium adopted and is the only signal separating pinch from
scroll.

`deltaMode` must be normalized: trackpads report pixels (`0`), mouse wheels
report lines (`1`) and need roughly a 16× multiplier.

Zoom is exponential — `factor = exp(−deltaY · SENSITIVITY)` — so a given finger
distance produces the same proportional zoom at every scale, and gestures
compose correctly. Linear zoom crawls when zoomed out, lurches when zoomed in,
and makes momentum-tailed gestures land at a different zoom than the same
gesture without inertia.

The normalizer takes a plain `{deltaX, deltaY, deltaMode, ctrlKey, metaKey,
shiftKey}` object rather than a real `WheelEvent`, so it is a pure function and
testable without a DOM.

**Two Chromium hazards:**

1. `ctrl+wheel` is Chromium's own page-zoom gesture. Without `preventDefault()`,
   pinching zooms the entire UI — chrome, borders, everything — instead of the
   canvas. Also call `setVisualZoomLevelLimits(1, 1)` in main as a guard.
2. React's `onWheel` may be attached passively, where `preventDefault()` does
   not throw but silently does nothing. Attach via
   `addEventListener('wheel', handler, { passive: false })` in an effect, never
   as a JSX prop.

### Focus model

Trackpad gestures always drive the canvas (terminals do not use them). Every
canvas keyboard shortcut requires `Cmd`, which agent TUIs never claim, so no
bare key can ever be stolen from a terminal in M3. Clicking a panel focuses it;
in M3 all bare keys — including `Escape` and `Ctrl+C` — go straight to the PTY.

`Cmd+0` resets to 100%, `Cmd+=`/`Cmd+-` zoom about the viewport centre, `Cmd+1`
zooms to fit. "Fit" means: take the bounding box of all panel rects, choose the
largest scale within `[0.1, 3]` at which it fits inside the canvas with a small
margin, and centre it. With no panels it is equivalent to `Cmd+0`. The View menu
currently registers no zoom roles, so these accelerators are free.

### DOM structure

```
.canvas   position: relative; overflow: hidden   ← fixed viewport, catches events
  .world  position: absolute; transform-origin: 0 0
          transform: translate(Xpx, Ypx) scale(k)
    .placeholder-panel  position: absolute; left/top/width/height in WORLD px
```

Panel geometry is written once in world coordinates and never recomputed on pan
or zoom. Only `.world`'s single transform changes.

## Data flow

```
wheel/click → canvas-input (normalize) → intent
            → setViewport(vp => zoomAt(vp, anchor, factor))
            → React re-render → new transform string
```

One direction, no cycles. Viewport state lives in `useViewport`; selection is a
single `string | null` in `Canvas`; panel rects are a hardcoded module constant
of ~20 entries, scattered well outside the initial viewport so that panning to
find something is testable by hand.

A fixed-position HUD shows zoom percentage and world-space cursor position — the
fastest way to see the coordinate math misbehaving.

## Error handling

M2 has no async and no IPC, so the surface is small: guard `zoomAt` against
non-finite factors, clamp scale before deriving translation, treat an empty rect
list as a valid miss.

## Testing

### Unit — plain Node

`viewport.ts` and `canvas-input.ts` have no native dependencies, so unlike the
PTY suites these run under plain `node` (esbuild-bundled, same `ok()` harness
idiom as the existing scripts). New script: `verify:viewport`.

| # | Assertion |
|---|---|
| 1 | `worldToScreen(screenToWorld(p)) ≈ p` over a grid of scales, translations, points |
| 2 | `zoomAt` leaves the anchor's world point fixed |
| 3 | Zooming past the clamp produces zero translation drift |
| 4 | `panBy` moves the same screen distance at every scale |
| 5 | `hitTest` — topmost wins, edges, misses, empty list |
| 6 | `deltaMode: 1` normalizes to comparable pixel deltas |
| 7 | `ctrlKey` → zoom, bare → pan, `shift` → horizontal pan |
| 8 | Two half-pinches compose to one whole pinch |

Checks 2 and 3 earn their keep: zoom-to-cursor looks fine in casual use even
when subtly wrong, and the symptom (the canvas has walked somewhere unexpected)
appears long after the cause.

### Integration — real Electron

Extends the `verify:window` pattern: load the built renderer in a hidden window,
drive real input via `webContents.sendInputEvent({type: 'mouseWheel', …})`, then
read both values back through `webContents.executeJavaScript` —
`getComputedStyle('.world').transform` for the canvas, and
`webFrame.getZoomLevel()` (renderer-side, hence executed in-page) for Chromium's
page zoom. Two
assertions unit tests structurally cannot make:

- a ctrl+wheel pinch changes the canvas transform and leaves page zoom at 0
- a two-finger pan changes translation but not scale

### Order

The eight unit checks are written first, against a non-existent `viewport.ts`,
and must be watched failing before any implementation exists.

## Forward notes for M3

- `screenToWorld` is the function M3 uses to feed xterm corrected
  `clientX/clientY`. If it is right, pointer remapping is mechanical; if it is
  wrong, every click in every terminal is wrong by a factor of the zoom.
- The WebGL canvas backing store is sized from CSS dimensions × `devicePixelRatio`
  at fit time, so text softens above ~1× zoom. LOD thresholds should be chosen
  with that in mind: "live terminal" is only crisp near 1.0.
- Browsers cap concurrent WebGL contexts near 16, below the 10–30 panel target.
  The live/preview swap is therefore a requirement, not an optimization.
