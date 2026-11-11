# tldraw's camera against `viewport.ts` (M112)

**Why this exists.** The research behind M112 listed tldraw and React Flow and concluded neither can
be adopted: every node here is a live WebGL xterm, which a canvas-drawn shape cannot be, and React
Flow's DOM ceiling is the problem `lod.ts` already solves for this case. What is worth keeping is
the comparison of a mature SDK's camera API with `renderer/canvas/viewport.ts`, read 2026-09-06
from tldraw.dev/reference/editor/Editor.

## Same primitives, same rule

| `viewport.ts` | tldraw `Editor` |
|---|---|
| `screenToWorld(p, vp)` | `screenToPage(point)` |
| `worldToScreen(p, vp)` | `pageToScreen(point)` |
| `zoomAt(vp, anchor, factor)` | `zoomIn(point)` / `zoomOut(point)` |
| `panBy(vp, dx, dy)` | `setCamera({ x, y, z })` |
| `centreOn(vp, rect, size)` | `centerOnPoint(point)` |
| `fitTo(rects, size, margin)` | `zoomToBounds(box)` / `zoomToFit()` |
| `clampScale`, `MIN_SCALE`, `MAX_SCALE` | `setCameraOptions({ zoomSteps, constraints })` |

The drag rule this repository pins — a delta is `screenToWorld(p₂) − screenToWorld(p₁)`, never
`screenToWorld(p₂ − p₁)` (Gotchas; verify:viewport 27) — is the rule every `screenToPage` caller
obeys: both convert POINTS, never deltas.

## Two ideas worth a backlog entry

- **`getDebouncedZoomLevel()` / `getEfficientZoomLevel()`** — a zoom value that LAGS while the camera
  moves, so shapes do not re-render per frame; the "efficient" one weighs the lag by shape count.
  `lod.ts` solves the same problem with hysteresis at the tier boundary and `useRailModels` with
  signatures. A debounced scale fed to `assignTiers` during a pinch would stop tier flips mid-gesture.
- **`getCameraState(): 'idle' | 'moving'`** — one signal for "the user is mid-gesture". A candidate
  gate for `machine:sample` polling and the rail's model rebuilds, both of which run at full rate
  during a pan today.

## Declined

`slideCamera` (inertia): the trackpad supplies inertia at the OS, and a second layer of it would
fight the first.
