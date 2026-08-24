# M4a: Panel Manipulation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make panels draggable, resizable, and closable, and make xterm's mouse input correct at every zoom level so M3's interaction gate can be removed.

**Architecture:** Geometry and pointer arithmetic go in pure modules under `src/renderer/canvas/` that run under plain node, exactly as M2's `viewport.ts` and M3's `lod.ts` do. React wiring sits above them in a hook and in `Canvas.tsx`. Pointer correction is a `document`-level capture interceptor that re-dispatches synthetic mouse events with rewritten `clientX`/`clientY`; xterm keeps ownership of selection semantics and mouse reporting.

**Tech Stack:** Electron 30+, TypeScript, React 18 (no StrictMode), xterm.js 5.5, esbuild (test bundling), plain-node and real-Electron verify scripts. No test framework — every check is an `ok(...)` assertion inside an IIFE.

**Spec:** `docs/superpowers/specs/2026-08-23-m4a-panel-manipulation-design.md`

## Global Constraints

- **`pty.kill` is called in exactly two places in the renderer:** `disposeAll` (renderer teardown) and `dispose(id)` (explicit close). **Tiering never calls either.** This replaces M3's "exactly one place" invariant.
- **Never reintroduce `process.env` on the renderer side.** electron-vite compiles it to `{}`; `PanelSpec.command` stays optional and main resolves it.
- **Pure modules import no DOM, no React, no `window`, no `document`:** `viewport.ts`, `canvas-input.ts`, `lod.ts`, `panel-interaction.ts`, `pointer-correct.ts`. They are bundled into the plain-node target by `scripts/viewport-entry.cjs`.
- **Imports point downward only:** pure math ← input mapping ← hooks ← components.
- **`MIN_PANEL_W = 200`, `MIN_PANEL_H = 160`, `CONFIRM_CLOSE_MS = 3000`.**
- **Resize commits on release only.** One `pty:resize` per gesture, never during.
- **No new IPC channels.** `pty:resize` and `pty:kill` already exist; `verify:ipc` must stay at 1/1 without modification.
- **Do not reorder the `panels` array to change stacking.** Use the `z` field. React moving keyed DOM nodes would incidentally detach a live terminal's host.
- **`@shared/*` and `@renderer/*` aliases are declared in BOTH `electron.vite.config.ts` and the tsconfigs.** Adding one means editing both. This plan adds none.
- **`npm run verify` must be green before any task is claimed done.** There is no unit-test runner and no linter; `verify` is the whole verification story.
- **Commit format:** conventional, scoped `m4a` — `feat(m4a): ...`, `fix(m4a): ...`, `test(m4a): ...`, `docs(m4a): ...`.

## File Structure

| File | Responsibility |
|---|---|
| `src/renderer/canvas/panel-interaction.ts` | **NEW.** Pure. `DragState` → `WorldRect`. Owns `MIN_PANEL_W`/`MIN_PANEL_H`. |
| `src/renderer/canvas/pointer-correct.ts` | **NEW.** Pure. One function: rewrite a screen point for scale. |
| `src/renderer/canvas/usePanelDrag.ts` | **NEW.** React. Document listeners for the duration of one gesture. |
| `src/renderer/components/xterm-pointer.ts` | **NEW.** The `document`-level capture interceptor. Needs a real DOM. |
| `src/renderer/panels/panels.ts` | **MODIFY.** `Panel` gains `z`; adds `setPanelRect` / `removePanel` / `raisePanel` / `nextZ`. |
| `src/renderer/canvas/Canvas.tsx` | **MODIFY.** Owns drag/close/raise; installs the interceptor; loses the gate. |
| `src/renderer/canvas/useViewport.ts` | **MODIFY.** Gains the wheel-ownership guard. |
| `src/renderer/components/TerminalPanel.tsx` | **MODIFY.** Resize handles, close button, chrome drag. Loses `interactive`. |
| `src/renderer/session/session-registry.ts` | **MODIFY.** Gains `dispose(id)`. |
| `src/renderer/styles.css` | **MODIFY.** Handle and close-button styles. Loses `.panel__slot--blocked`. |
| `scripts/viewport-entry.cjs` | **MODIFY.** Re-export the two new pure modules. |
| `scripts/verify-viewport.cjs` | **MODIFY.** Checks 26–37. |
| `scripts/verify-registry.cjs` | **MODIFY.** Checks 15–17. |
| `scripts/verify-panels.cjs` | **MODIFY.** Checks 9–16; check 6 rewritten. |

### One deviation from the spec, and why

The spec lists four helpers in `panels.ts`: `movePanel`, `resizePanel`, `removePanel`, `raisePanel`. `movePanel` and `resizePanel` would have identical bodies — both replace a panel's `rect` with one `applyDrag` already computed. This plan uses **`setPanelRect`** for both. The distinction between move and resize lives in `DragMode`, where it is actually meaningful (it decides whether a commit fires), not in two copies of the same array map.

---

### Task 1: Pure interaction geometry

**Files:**
- Create: `src/renderer/canvas/panel-interaction.ts`
- Modify: `src/renderer/panels/panels.ts`
- Modify: `scripts/viewport-entry.cjs`
- Test: `scripts/verify-viewport.cjs` (checks 26–34)

**Interfaces:**
- Consumes: `Point`, `WorldRect` from `src/renderer/canvas/viewport.ts`; `PanelSpecTemplate` from `src/renderer/session/panel-session.ts`.
- Produces:
  - `type ResizeEdge = 'e' | 's' | 'se'`
  - `type DragMode = { kind: 'move' } | { kind: 'resize'; edge: ResizeEdge }`
  - `interface DragState { panelId: string; mode: DragMode; originRect: WorldRect; originWorld: Point }`
  - `function applyDrag(state: DragState, world: Point): WorldRect`
  - `const MIN_PANEL_W = 200`, `const MIN_PANEL_H = 160`
  - `interface Panel { rect: WorldRect; spec: PanelSpecTemplate; z: number }`
  - `function nextZ(panels: Panel[]): number`
  - `function setPanelRect(panels: Panel[], id: string, rect: WorldRect): Panel[]`
  - `function removePanel(panels: Panel[], id: string): Panel[]`
  - `function raisePanel(panels: Panel[], id: string): Panel[]`

- [ ] **Step 1: Add the new pure module to the plain-node bundle**

`scripts/viewport-entry.cjs` — add two lines so the checks can reach the new
code. `panels.ts` is included too: its helpers are pure array functions with no
DOM, and they need the same coverage.

```js
/* Bundle entry for the canvas math tests. Pure TypeScript modules with no
   native dependencies, so the suite runs under plain node. */
module.exports = {
  ...require('../src/renderer/canvas/viewport'),
  ...require('../src/renderer/canvas/canvas-input'),
  ...require('../src/renderer/canvas/lod'),
  ...require('../src/renderer/canvas/panel-interaction'),
  ...require('../src/renderer/panels/panels')
}
```

- [ ] **Step 2: Write checks 26–34, watch them fail**

Append to `scripts/verify-viewport.cjs`, immediately before the
`console.log('\n' + '='.repeat(60))` summary block at the end of the file.

```js
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

// 27. The SAME screen gesture must cover different world distances at
//     different zooms. This is the delta trap: screenToWorld(p2) -
//     screenToWorld(p1), never screenToWorld(p2 - p1). Computing the world
//     points through the real viewport transform is the point of the check —
//     hand-computing the delta here would test nothing.
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

// 28. Recompute-from-origin: the result depends only on where the cursor IS,
//     never on how many frames it took to get there. A naive implementation
//     that accumulates per-frame deltas passes checks 26 and 27 and fails
//     this one.
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
```

- [ ] **Step 3: Run the suite and watch it fail**

Run: `npm run verify:viewport`
Expected: the esbuild bundle step fails first — `Could not resolve
"../src/renderer/canvas/panel-interaction"`. That is the correct RED: the
module does not exist yet. Do not proceed until you have seen this message.

- [ ] **Step 4: Write `panel-interaction.ts`**

```ts
import type { Point, WorldRect } from './viewport'

/**
 * Panel geometry under a pointer gesture. Pure, like viewport.ts and lod.ts:
 * no DOM, no React. verify:viewport runs it under plain node.
 */

/**
 * East, south, south-east only. Resizing from a north or west edge changes the
 * panel's origin AND its size in one gesture — two coupled changes to verify
 * instead of one — for an affordance a terminal barely needs.
 */
export type ResizeEdge = 'e' | 's' | 'se'

export type DragMode = { kind: 'move' } | { kind: 'resize'; edge: ResizeEdge }

export interface DragState {
  panelId: string
  mode: DragMode
  /** The rect at mousedown. Never mutated for the duration of the gesture. */
  originRect: WorldRect
  /** The world point under the cursor at mousedown. */
  originWorld: Point
}

/**
 * A floor small enough to be useless as a terminal, large enough that xterm
 * never sees a degenerate grid. At the current metrics (PANEL_W 720 fits 93
 * columns, PANEL_H 460 fits 23 rows, so a cell is about 7.7 x 15 world units)
 * this is roughly 26 columns by 5 rows once the chrome bar is subtracted.
 */
export const MIN_PANEL_W = 200
export const MIN_PANEL_H = 160

/**
 * The rect this gesture implies, given where the cursor is NOW in world space.
 *
 * Derived from `originRect` every time, never from the previous frame's
 * result. Accumulating per-frame deltas drifts — each frame rounds, and at
 * scale 0.1 one rounding is worth ten world units — and it also breaks when
 * the user zooms mid-drag, because the deltas were measured under a transform
 * that no longer applies. Recomputing means the panel lands exactly where the
 * cursor says regardless of frame count or zoom changes.
 *
 * The caller converts the cursor to world space with the CURRENT viewport;
 * that conversion must be `screenToWorld(p2) - screenToWorld(p1)`, never
 * `screenToWorld(p2 - p1)`, since screenToWorld subtracts the viewport
 * translation before dividing and a delta must not carry that subtraction.
 */
export function applyDrag(state: DragState, world: Point): WorldRect {
  const dx = world.x - state.originWorld.x
  const dy = world.y - state.originWorld.y
  const r = state.originRect

  if (state.mode.kind === 'move') {
    return { ...r, x: r.x + dx, y: r.y + dy }
  }

  const { edge } = state.mode
  const growsX = edge === 'e' || edge === 'se'
  const growsY = edge === 's' || edge === 'se'
  return {
    ...r,
    w: growsX ? Math.max(MIN_PANEL_W, r.w + dx) : r.w,
    h: growsY ? Math.max(MIN_PANEL_H, r.h + dy) : r.h
  }
}
```

- [ ] **Step 5: Add `z` and the helpers to `panels.ts`**

Replace the `Panel` interface and append the helpers. `SEED_PANELS` gains an
ascending `z` matching its existing array order, so initial stacking is
unchanged. `makePanel` gains a `z` parameter rather than computing it, keeping
the module free of any notion of "the current panel list".

```ts
/**
 * A panel is its geometry, its spec, and its paint order. cols/rows are
 * deliberately absent from the spec: they are not known until the panel is
 * attached and fitted, and inventing them here would reintroduce the
 * spawn-at-80x24 problem lazy spawning exists to avoid.
 */
export interface Panel {
  rect: WorldRect
  spec: PanelSpecTemplate
  /**
   * Paint order, rendered as style.zIndex. Stacking is NOT the array's order:
   * React reconciles a reordered keyed list by MOVING DOM nodes, and a move is
   * remove-then-insert, which would momentarily detach the subtree holding a
   * live terminal's host and its WebGL context. M3's eviction proves a
   * deliberate detach is survivable — dispose the addon, refresh on the way
   * back — but an incidental detach triggered by clicking an unrelated panel
   * does none of that. Keeping array order stable means React never moves
   * those nodes at all.
   */
  z: number
}
```

`SEED_PANELS` — add `z` to each entry, ascending from 1 in the existing order:

```ts
export const SEED_PANELS: Panel[] = [
  { rect: { id: 's01', x: 0, y: 0, w: PANEL_W, h: PANEL_H }, spec: shell('s01'), z: 1 },
  { rect: { id: 's02', x: 800, y: 0, w: PANEL_W, h: PANEL_H }, spec: shell('s02'), z: 2 },
  { rect: { id: 's03', x: 1600, y: 0, w: PANEL_W, h: PANEL_H }, spec: shell('s03'), z: 3 },
  { rect: { id: 's04', x: 0, y: 540, w: PANEL_W, h: PANEL_H }, spec: shell('s04'), z: 4 },
  { rect: { id: 's05', x: 800, y: 540, w: PANEL_W, h: PANEL_H }, spec: shell('s05'), z: 5 },
  { rect: { id: 's06', x: 1600, y: 540, w: PANEL_W, h: PANEL_H }, spec: shell('s06'), z: 6 },
  { rect: { id: 's07', x: -900, y: 270, w: PANEL_W, h: PANEL_H }, spec: shell('s07'), z: 7 },
  { rect: { id: 's08', x: -900, y: 810, w: PANEL_W, h: PANEL_H }, spec: shell('s08'), z: 8 },
  { rect: { id: 's09', x: 2500, y: 270, w: PANEL_W, h: PANEL_H }, spec: shell('s09'), z: 9 },
  { rect: { id: 's10', x: 400, y: 1100, w: PANEL_W, h: PANEL_H }, spec: shell('s10'), z: 10 },
  { rect: { id: 's11', x: 1200, y: 1100, w: PANEL_W, h: PANEL_H }, spec: shell('s11'), z: 11 },
  { rect: { id: 's12', x: 400, y: -640, w: PANEL_W, h: PANEL_H }, spec: shell('s12'), z: 12 }
]

/** Cmd+N: a panel centred on wherever the camera is looking, on top. */
export function makePanel(id: string, centre: Point, z: number): Panel {
  return {
    rect: { id, x: centre.x - PANEL_W / 2, y: centre.y - PANEL_H / 2, w: PANEL_W, h: PANEL_H },
    spec: shell(id),
    z
  }
}

/** One above the highest current z, so a raised or new panel is on top. */
export function nextZ(panels: Panel[]): number {
  return panels.reduce((max, p) => Math.max(max, p.z), 0) + 1
}

/**
 * Replace one panel's rect. Serves both move and resize: applyDrag has already
 * decided what the rect is, and the move/resize distinction lives in DragMode
 * where it actually matters (it decides whether a pty:resize commit fires).
 */
export function setPanelRect(panels: Panel[], id: string, rect: WorldRect): Panel[] {
  return panels.map((p) => (p.rect.id === id ? { ...p, rect } : p))
}

export function removePanel(panels: Panel[], id: string): Panel[] {
  return panels.filter((p) => p.rect.id !== id)
}

/** Raise by z, never by array position — see the note on Panel.z. */
export function raisePanel(panels: Panel[], id: string): Panel[] {
  const top = nextZ(panels)
  return panels.map((p) => (p.rect.id === id ? { ...p, z: top } : p))
}
```

- [ ] **Step 6: Fix `makePanel`'s one existing caller**

`Canvas.tsx`'s `onSpawn` now has to supply a `z`. Minimal change only — the
rest of `Canvas.tsx` is Task 5's work.

```tsx
const onSpawn = useCallback(
  (centre: Point) =>
    setPanels((current) => [
      ...current,
      makePanel(`n${current.length + 1}`, centre, nextZ(current))
    ]),
  []
)
```

Add `nextZ` to the existing import from `@renderer/panels/panels`.

- [ ] **Step 7: Run the checks and the typecheck**

Run: `npm run verify:viewport && npm run typecheck`
Expected: `34/34 passed`, then a clean typecheck.

If check 27 fails with all three distances equal, `applyDrag` is being fed a
screen delta rather than two world points — the bug the check exists for.
If check 28 fails, the implementation is accumulating rather than recomputing.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/canvas/panel-interaction.ts src/renderer/panels/panels.ts \
        src/renderer/canvas/Canvas.tsx scripts/viewport-entry.cjs scripts/verify-viewport.cjs
git commit -m "feat(m4a): pure panel interaction geometry

applyDrag recomputes from the gesture origin rather than accumulating
per-frame deltas, so a drag survives a mid-gesture zoom. Panel gains z:
stacking must not be array order, because React moving keyed nodes would
incidentally detach a live terminal's WebGL host."
```

---

### Task 2: Pointer correction arithmetic

**Files:**
- Create: `src/renderer/canvas/pointer-correct.ts`
- Modify: `scripts/viewport-entry.cjs`
- Test: `scripts/verify-viewport.cjs` (checks 35–37)

**Interfaces:**
- Consumes: `Point` from `src/renderer/canvas/viewport.ts`.
- Produces:
  - `interface RectOrigin { left: number; top: number }`
  - `function correctForScale(client: Point, rect: RectOrigin, scale: number): Point`

- [ ] **Step 1: Add the module to the plain-node bundle**

`scripts/viewport-entry.cjs` — one more line:

```js
  ...require('../src/renderer/canvas/pointer-correct')
```

- [ ] **Step 2: Write checks 35–37, watch them fail**

Append before the summary block in `scripts/verify-viewport.cjs`.

```js
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
```

- [ ] **Step 3: Run and watch it fail**

Run: `npm run verify:viewport`
Expected: esbuild fails with `Could not resolve
"../src/renderer/canvas/pointer-correct"`.

- [ ] **Step 4: Write `pointer-correct.ts`**

```ts
import type { Point } from './viewport'

/**
 * The one piece of arithmetic that decides whether a click lands on the right
 * character.
 *
 * xterm computes a cell from a mouse event like this (confirmed in
 * node_modules/@xterm/xterm/lib/xterm.js):
 *
 *   getCoordsRelativeToElement -> [ e.clientX - rect.left, e.clientY - rect.top ]
 *   getCoords                  -> ceil(offset / dimensions.css.cell.width)
 *
 * `rect.left` comes from getBoundingClientRect(), which IS transform-aware and
 * returns screen pixels. `cell.width` comes from the render service, which is
 * NOT transform-aware and is in CSS pixels. Under scale(k) the numerator is k
 * times larger than the denominator expects, so xterm reports a column k times
 * the true one.
 *
 * Rewriting the event's client coordinates so that `clientX - rect.left` is
 * already a CSS-pixel offset fixes it at the source. getMouseReportCoords —
 * the path feeding mouse-reporting TUIs — calls the same helper, so selection
 * and mouse reporting are both corrected by this one function.
 *
 * Deliberately free of DOM types: `RectOrigin` is declared structurally rather
 * than importing DOMRect, so this module has no DOM dependency and runs under
 * plain node in verify:viewport.
 */
export interface RectOrigin {
  left: number
  top: number
}

export function correctForScale(client: Point, rect: RectOrigin, scale: number): Point {
  // A non-finite or non-positive scale can only come from a corrupted
  // viewport; returning the point unchanged is strictly better than emitting
  // NaN coordinates into a synthetic event.
  if (!Number.isFinite(scale) || scale <= 0 || scale === 1) return client
  return {
    x: rect.left + (client.x - rect.left) / scale,
    y: rect.top + (client.y - rect.top) / scale
  }
}
```

- [ ] **Step 5: Run the checks**

Run: `npm run verify:viewport && npm run typecheck`
Expected: `37/37 passed`, clean typecheck.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/canvas/pointer-correct.ts scripts/viewport-entry.cjs scripts/verify-viewport.cjs
git commit -m "feat(m4a): pointer correction arithmetic

Rewrites a screen point so clientX - rect.left is a CSS-pixel offset,
which is what xterm's getCoords already assumes. Its own module and DOM
free so the arithmetic is tested as arithmetic under plain node."
```

---

### Task 3: The interceptor, proven while the gate still stands

This is the ordering-sensitive task. The correction check **must be green
before `.panel__slot--blocked` is deleted** (Task 4). That class is what
currently makes a mis-hit impossible; delete it first and a broken corrector
produces a wrong cell instead of a visible failure.

**Files:**
- Create: `src/renderer/components/xterm-pointer.ts`
- Modify: `src/renderer/canvas/Canvas.tsx`
- Test: `scripts/verify-panels.cjs` (check 9)

**Interfaces:**
- Consumes: `correctForScale`, `RectOrigin` from `@renderer/canvas/pointer-correct`.
- Produces: `function installPointerCorrection(getScale: () => number): () => void`

- [ ] **Step 1: Write check 9, watch it fail**

Append to `scripts/verify-panels.cjs`, inside the `try` block, after check 8
and before the summary. It bypasses the gate on purpose — that is what makes it
a check of the corrector rather than a check of the gate.

```js
    // ---------------------------------------------------------------------
    // 9. Pointer correction. Deliberately runs WHILE .panel__slot--blocked
    //    still exists: the gate is temporarily lifted for this one panel so
    //    the corrector is what is being measured. Removing the gate first
    //    would make a broken corrector silent instead of loud.
    //
    //    The assertion is about xterm's own hit-testing: at scale 0.5 an
    //    UNCORRECTED click reports a column at twice the true offset, so a
    //    double-click lands on the wrong word (or past end-of-line, selecting
    //    nothing). Writing three well-separated words and double-clicking the
    //    middle one turns "the column is off by a factor of k" into a string
    //    comparison.
    // ---------------------------------------------------------------------
    {
      await zoomTo(wc, '0') // back to 100% before setting up

      const selection = await wc.executeJavaScript(`(async () => {
        const slot = document.querySelector('.panel__slot')
        if (!slot) return { error: 'no live panel' }

        // Focus this panel FIRST. assignTiers pins the focused panel live
        // unconditionally, which is what keeps it from being demoted to a
        // card when the zoom drops below LIVE_MIN_SCALE below — without this
        // there is no .panel__slot left to click by the time we need one.
        slot.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        await new Promise((r) => setTimeout(r, 150))

        // Known content at known columns. Written through the session handle
        // rather than the PTY so no shell prompt or echo can shift it.
        window.__m4aWrite('\\r\\nalpha beta gamma\\r\\n')
        await new Promise((r) => setTimeout(r, 300))

        // Zoom to 50% via the canvas's own path, so the real transform is
        // what the corrector sees.
        window.dispatchEvent(new KeyboardEvent('keydown', { key: '-', metaKey: true }))
        window.dispatchEvent(new KeyboardEvent('keydown', { key: '-', metaKey: true }))
        window.dispatchEvent(new KeyboardEvent('keydown', { key: '-', metaKey: true }))
        window.dispatchEvent(new KeyboardEvent('keydown', { key: '-', metaKey: true }))
        await new Promise((r) => setTimeout(r, 300))

        // Lift the gate — AFTER the zoom, not before. TerminalPanel derives
        // .panel__slot--blocked from the current scale on every render, so a
        // class removed before zooming is put straight back by the re-render
        // the zoom triggers. Task 4 deletes the class entirely; until then
        // this is what lets the click through, and it only holds because
        // nothing re-renders this panel between here and the clicks below.
        slot.classList.remove('panel__slot--blocked')

        const scale = window.__m4aScale()
        const screen = window.__m4aCellToScreen('beta')
        if (!screen) return { error: 'could not locate the word', scale }

        const opts = {
          bubbles: true, cancelable: true, composed: true, view: window,
          clientX: screen.x, clientY: screen.y, button: 0, buttons: 1
        }
        const target = document.elementFromPoint(screen.x, screen.y) || slot
        target.dispatchEvent(new MouseEvent('mousedown', { ...opts, detail: 1 }))
        target.dispatchEvent(new MouseEvent('mouseup', { ...opts, detail: 1, buttons: 0 }))
        target.dispatchEvent(new MouseEvent('mousedown', { ...opts, detail: 2 }))
        target.dispatchEvent(new MouseEvent('mouseup', { ...opts, detail: 2, buttons: 0 }))
        await new Promise((r) => setTimeout(r, 200))

        return { scale, text: window.__m4aSelection() }
      })()`)

      ok('9 a double-click selects the right word at 50% zoom',
        selection && selection.text === 'beta',
        `scale=${selection && selection.scale} selection=${JSON.stringify(
          selection && (selection.text ?? selection.error)
        )}`)

      await zoomTo(wc, '0')
    }
```

This check needs three small test hooks on `window`, which Task 3 Step 3 adds
to `Canvas.tsx`. They are deliberately narrow: a write, a scale read, a
selection read, and a world-to-screen helper for a known word.

- [ ] **Step 2: Run and watch it fail**

Run: `npm run build && npm run verify:panels`
Expected: check 9 FAILs with `selection=undefined` or `"could not locate the
word"`, because `window.__m4aWrite` and friends do not exist yet. That is the
correct RED.

- [ ] **Step 3: Add the test hooks to `Canvas.tsx`**

These are the only `window` globals this milestone adds. They exist because
`verify:panels` drives the built renderer through `executeJavaScript` and has
no other way to reach a `SessionHandle` — the registry is a module-level
closure by design.

```tsx
  // Test hooks for verify:panels. The registry is a module-level closure with
  // no global handle by design, and executeJavaScript has no other route into
  // it. Kept to four narrow reads/writes rather than exposing the registry
  // itself, so the suite cannot quietly start depending on internals.
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>
    w.__m4aScale = (): number => viewportRef.current.scale
    w.__m4aWrite = (data: string): void => {
      const id = focusedIdRef.current
      if (id) registry.get(id)?.handle.write(data)
    }
    w.__m4aSelection = (): string => {
      const id = focusedIdRef.current
      return registry.get(id ?? '')?.handle.getSelection() ?? ''
    }
    /** Screen-space centre of the first cell of `word` in the focused panel. */
    w.__m4aCellToScreen = (word: string): { x: number; y: number } | null => {
      const id = focusedIdRef.current
      const session = id ? registry.get(id) : undefined
      if (!session) return null
      const found = session.handle.locate(word)
      if (!found) return null
      const rect = session.handle.host.getBoundingClientRect()
      const cell = session.handle.cellSize()
      const scale = viewportRef.current.scale
      // rect is transform-aware (screen px); cell is CSS px. Multiplying the
      // cell offset by the scale is the INVERSE of correctForScale, which is
      // how a caller turns a buffer position back into a real screen point.
      return {
        x: rect.left + (found.col + 0.5) * cell.width * scale,
        y: rect.top + (found.row + 0.5) * cell.height * scale
      }
    }
  }, [])
```

`viewportRef` does not exist in `Canvas.tsx` yet — add it beside the existing
`focusedIdRef`, using the same mirror-state-into-a-ref pattern:

```tsx
  const viewportRef = useRef(viewport)
  viewportRef.current = viewport
```

- [ ] **Step 4: Add `locate` and `cellSize` to the session handle**

`src/renderer/session/panel-session.ts` — two additions to `SessionHandle`:

```ts
  /** Buffer position of the first occurrence of `word`, or null. */
  locate(word: string): { col: number; row: number } | null
  /** Cell metrics in CSS pixels — transform-blind, like xterm's own. */
  cellSize(): { width: number; height: number }
```

`src/renderer/terminal/session-factory.ts` — implement both. `locate` searches
the visible viewport rows and returns a row index relative to the top of the
screen, which is what a screen coordinate needs.

Both follow this file's existing idiom: `handles` is nullable and is only
non-null after `attach()`, so guard on it rather than calling `ensure()` — the
same reasoning the `size()` and `tail()` implementations above them already use.

```ts
    locate(word) {
      if (!handles) return null
      const { term } = handles
      const buffer = term.buffer.active
      // Search the VISIBLE rows and return a row index relative to the top of
      // the screen: a screen coordinate needs a screen row, not a buffer row.
      for (let row = 0; row < term.rows; row++) {
        const line = buffer.getLine(buffer.viewportY + row)
        if (!line) continue
        const col = line.translateToString(true).indexOf(word)
        if (col !== -1) return { col, row }
      }
      return null
    },

    cellSize() {
      if (!handles) return { width: 0, height: 0 }
      const { term } = handles
      const screen = term.element?.querySelector('.xterm-screen') as HTMLElement | null
      if (!screen) return { width: 0, height: 0 }
      // offsetWidth/offsetHeight are LAYOUT pixels — unaffected by an
      // ancestor's CSS transform, which is exactly the property needed here
      // and the same blindness xterm's own dimensions.css.cell.width has.
      // Deriving from the rendered screen rather than reading a private field
      // keeps this honest if the font metrics ever change.
      return {
        width: screen.offsetWidth / (term.cols || 1),
        height: screen.offsetHeight / (term.rows || 1)
      }
    },
```

- [ ] **Step 5: Write `xterm-pointer.ts`**

```ts
import { correctForScale } from '@renderer/canvas/pointer-correct'

/**
 * Corrects mouse coordinates on their way to xterm.
 *
 * Lives on `document` in the CAPTURE phase, not on the panel, and that is
 * forced rather than chosen. On mousedown xterm binds its drag listeners to
 * the document:
 *
 *   this._document.addEventListener("mouseup", s.mouseup)
 *   this._document.addEventListener("mousemove", s.mousedrag)
 *
 * A listener scoped to the panel would correct the mousedown and never see the
 * drag that follows.
 */

/**
 * Events this module created. Without a marker the synthetic event re-enters
 * this same capture listener and recurses until the stack overflows. A WeakSet
 * rather than a property on the event: a property is easy to lose if anything
 * ever clones the event.
 */
const synthetic = new WeakSet<Event>()

const TYPES = ['mousedown', 'mousemove', 'mouseup'] as const

export function installPointerCorrection(getScale: () => number): () => void {
  /**
   * The slot whose rect corrections are measured against for the rest of the
   * current drag. Once a corrected mousedown starts a selection, the cursor
   * spends most of the gesture OUTSIDE the slot — target becomes <body> or the
   * document — so `closest('.panel__slot')` stops finding anything and the
   * moves would sail through uncorrected. Pinning the slot at mousedown and
   * holding it until mouseup is what makes drag-selection work.
   */
  let activeSlot: HTMLElement | null = null

  const onEvent = (event: MouseEvent): void => {
    if (synthetic.has(event)) return

    const scale = getScale()
    const target = event.target as HTMLElement | null

    let slot = activeSlot
    if (event.type === 'mousedown') {
      slot = target?.closest?.('.panel__slot') ?? null
      // Record the slot even at scale 1 so a drag that begins at 1:1 and
      // continues while the user zooms stays anchored to the right element.
      activeSlot = slot
    }
    if (!slot) return
    if (event.type === 'mouseup') activeSlot = null

    // The common case pays nothing: xterm receives the original event.
    if (scale === 1) return

    const rect = slot.getBoundingClientRect()
    const corrected = correctForScale({ x: event.clientX, y: event.clientY }, rect, scale)

    // Stop the original before it reaches xterm's listener, which is bound on
    // a descendant of the slot and would otherwise run first in the target
    // phase. stopImmediatePropagation, not stopPropagation: xterm's selection
    // service and its mouse-report handler can both be attached to the same
    // node, and stopping propagation alone would still let the sibling run.
    event.stopImmediatePropagation()
    event.preventDefault()

    const clone = new MouseEvent(event.type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: corrected.x,
      clientY: corrected.y,
      screenX: corrected.x,
      screenY: corrected.y,
      button: event.button,
      // buttons distinguishes a drag from a hover. Drop it and xterm treats
      // every corrected mousemove as a hover, so selection never extends.
      buttons: event.buttons,
      // detail is the click count. Drop it and double-click word-select and
      // triple-click line-select stop working, with no error anywhere.
      detail: event.detail,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey
    })
    synthetic.add(clone)

    // Dispatch at the ORIGINAL target. During a drag that target is often the
    // document or <body>; xterm's drag listeners are on the document, so the
    // clone still reaches them by bubbling.
    ;(target ?? document).dispatchEvent(clone)
  }

  for (const type of TYPES) document.addEventListener(type, onEvent, true)
  return () => {
    for (const type of TYPES) document.removeEventListener(type, onEvent, true)
  }
}
```

- [ ] **Step 6: Install it from `Canvas.tsx`**

Beside the existing clipboard effect:

```tsx
  // Corrects xterm's coordinates for the world transform. Reads the scale
  // through a ref so the listener is installed once and never resubscribes —
  // viewport changes on every wheel event.
  useEffect(() => installPointerCorrection(() => viewportRef.current.scale), [])
```

- [ ] **Step 7: Run the check**

Run: `npm run build && npm run verify:panels`
Expected: `9/9 passed`, with check 9 reporting `selection="beta"`.

If it reports a neighbouring word (`alpha` or `gamma`), the correction is
applied in the wrong direction — multiply where it should divide. If it reports
`""`, the click is landing past end-of-line, which is the uncorrected `k ×`
behaviour and means the interceptor is not firing at all: confirm the listener
is in the capture phase and that `activeSlot` is being set.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/components/xterm-pointer.ts src/renderer/canvas/Canvas.tsx \
        src/renderer/session/panel-session.ts src/renderer/terminal/session-factory.ts \
        scripts/verify-panels.cjs
git commit -m "test(m4a): correct xterm coordinates, proven before the gate falls

The interceptor lives on document in the capture phase because xterm binds
its drag listeners there; a panel-scoped listener would correct the
mousedown and miss every move after it. Check 9 lifts the gate for one
panel deliberately, so it measures the corrector and not the gate."
```

---

### Task 4: Remove the interaction gate

**Files:**
- Modify: `src/renderer/canvas/Canvas.tsx`
- Modify: `src/renderer/components/TerminalPanel.tsx`
- Modify: `src/renderer/styles.css`
- Test: `scripts/verify-panels.cjs` (check 6 rewritten, check 9 simplified)

**Interfaces:**
- Consumes: the corrector from Task 3.
- Produces: `TerminalPanelProps` no longer has `interactive`.

- [ ] **Step 1: Rewrite check 6**

Check 6 currently asserts the gate's two halves. The gate is going away, so the
check becomes its successor: a body click focuses the panel and reaches xterm
at **any** zoom. Replace the whole of check 6 with:

```js
    // 6. A body click focuses the panel and reaches xterm at any zoom.
    //    This replaces M3's gate check: correction means there is no longer a
    //    band inside which mouse input is allowed and outside which it is
    //    suppressed. The focus half is unchanged and still load-bearing —
    //    typing must have somewhere to go after a click.
    {
      const probe = async () => {
        const slot = `document.querySelector('.panel__slot')`
        return wc.executeJavaScript(`(async () => {
          const slot = ${slot}
          if (!slot) return { error: 'no live panel' }
          const r = slot.getBoundingClientRect()
          const opts = {
            bubbles: true, cancelable: true, composed: true, view: window,
            clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
            button: 0, buttons: 1, detail: 1
          }
          slot.dispatchEvent(new MouseEvent('mousedown', opts))
          await new Promise((res) => setTimeout(res, 150))
          return {
            active: document.activeElement && document.activeElement.className,
            blocked: document.querySelectorAll('.panel__slot--blocked').length
          }
        })()`)
      }

      await zoomTo(wc, '0')
      const atOne = await probe()
      await zoomTo(wc, '1')
      const zoomedOut = await probe()
      await zoomTo(wc, '0')

      const focused = (r) => r && String(r.active || '').includes('xterm-helper-textarea')
      ok('6 a body click focuses the panel at any zoom, with no gate left',
        focused(atOne) && focused(zoomedOut) &&
          atOne.blocked === 0 && zoomedOut.blocked === 0,
        `1:1 active=${atOne && atOne.active} zoomed active=${zoomedOut && zoomedOut.active} ` +
        `blocked=${atOne && atOne.blocked}/${zoomedOut && zoomedOut.blocked}`)
    }
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm run build && npm run verify:panels`
Expected: check 6 FAILs on `blocked=1/1` (or higher) — the gate class is still
being applied. That is the correct RED.

- [ ] **Step 3: Delete the gate from `TerminalPanel.tsx`**

Remove `interactive` from `TerminalPanelProps` and from the destructured
parameter list. The slot's `className` and `onMouseDown` become:

```tsx
        <div
          className="panel__slot"
          ref={slotRef}
          onMouseDown={(event) => {
            // Chrome selects; body focuses and falls through to xterm. No
            // preventDefault: M3 needed it because pointer-events:none stopped
            // xterm from focusing itself, so the browser's default action
            // would have cleared focus to <body>. With correction, xterm
            // receives the (corrected) event and manages its own focus.
            event.stopPropagation()
            onFocus(session.id)
          }}
        />
```

- [ ] **Step 4: Delete the gate from `Canvas.tsx`**

Remove the `INTERACT_MIN_SCALE` and `INTERACT_MAX_SCALE` constants, the
`interactive` const, and the `interactive={interactive}` prop.

- [ ] **Step 5: Delete `.panel__slot--blocked` from `styles.css`**

Remove the rule and its entire explanatory comment block (currently around
lines 108–131). Replace with a short marker so the next reader knows where the
behaviour went:

```css
/* M3's .panel__slot--blocked gate is gone: xterm now receives corrected
   coordinates at every zoom (see components/xterm-pointer.ts), so there is no
   longer a band inside which mouse input is trusted and outside which it is
   suppressed. */
```

- [ ] **Step 6: Simplify check 9**

The gate no longer exists, so delete this line from check 9's script:

```js
        slot.classList.remove('panel__slot--blocked')
```

and the six-line comment block above it that explains the temporary lift.
Everything else in check 9 stays: the focus click, the write, the zoom, and
the four dispatched mouse events are all still what the check needs.

- [ ] **Step 7: Run everything**

Run: `npm run verify`
Expected: green throughout, `9/9 passed` for panels.

Check 9 passing here is the one that matters: it now proves correction works
with nothing masking a failure.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/canvas/Canvas.tsx src/renderer/components/TerminalPanel.tsx \
        src/renderer/styles.css scripts/verify-panels.cjs
git commit -m "feat(m4a): remove the interaction gate

Correction replaces it. Check 9 was green before this commit and stays
green after, which is the only evidence that deleting the gate did not
just hide a broken corrector."
```

---

### Task 5: Drag and resize

**Files:**
- Create: `src/renderer/canvas/usePanelDrag.ts`
- Modify: `src/renderer/canvas/Canvas.tsx`
- Modify: `src/renderer/components/TerminalPanel.tsx`
- Modify: `src/renderer/styles.css`
- Test: `scripts/verify-panels.cjs` (checks 10–11)

**Interfaces:**
- Consumes: `DragState`, `DragMode`, `applyDrag` from `@renderer/canvas/panel-interaction`; `setPanelRect` from `@renderer/panels/panels`; `screenToWorld`, `Viewport`, `WorldRect` from `@renderer/canvas/viewport`.
- Produces:
  - `function usePanelDrag(deps: PanelDragDeps): (state: DragState) => void`
  - `interface PanelDragDeps { hostRef: RefObject<HTMLElement | null>; viewportRef: RefObject<Viewport>; onDrag(panelId: string, rect: WorldRect): void; onCommit(panelId: string, mode: DragMode): void }`
  - `TerminalPanelProps` gains `onBeginDrag: (state: DragState) => void`, `onClose: (id: string) => void`

- [ ] **Step 1: Write checks 10–11, watch them fail**

Append to `scripts/verify-panels.cjs` inside the `try` block.

```js
    // ---------------------------------------------------------------------
    // 10. Dragging a panel by its chrome moves it by the WORLD delta, not the
    //     screen delta. Run at a zoom other than 1 on purpose: at 1:1 the two
    //     are identical and a wrong implementation passes.
    // ---------------------------------------------------------------------
    {
      await zoomTo(wc, '0')
      // Cmd+- four times lands near 0.48; the exact value does not matter
      // because the assertion is expressed against the scale that is read
      // back, not against a hardcoded number.
      for (let i = 0; i < 4; i++) await zoomTo(wc, '-')
      await sleep(200)

      const result = await wc.executeJavaScript(`(async () => {
        const chrome = document.querySelector('.panel__chrome')
        if (!chrome) return { error: 'no panel' }
        const panel = chrome.closest('.panel')
        const before = { x: parseFloat(panel.style.left), y: parseFloat(panel.style.top) }
        const r = chrome.getBoundingClientRect()
        const start = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
        const SCREEN_DX = 120, SCREEN_DY = 60

        const opts = (x, y, buttons) => ({
          bubbles: true, cancelable: true, composed: true, view: window,
          clientX: x, clientY: y, button: 0, buttons, detail: 1
        })
        chrome.dispatchEvent(new MouseEvent('mousedown', opts(start.x, start.y, 1)))
        // Several intermediate moves: a recompute-from-origin implementation
        // and an accumulate-deltas one differ only across multiple frames.
        for (let i = 1; i <= 4; i++) {
          document.dispatchEvent(new MouseEvent('mousemove',
            opts(start.x + (SCREEN_DX * i) / 4, start.y + (SCREEN_DY * i) / 4, 1)))
          await new Promise((res) => setTimeout(res, 20))
        }
        document.dispatchEvent(new MouseEvent('mouseup',
          opts(start.x + SCREEN_DX, start.y + SCREEN_DY, 0)))
        await new Promise((res) => setTimeout(res, 150))

        const after = { x: parseFloat(panel.style.left), y: parseFloat(panel.style.top) }
        return { before, after, scale: window.__m4aScale(), SCREEN_DX, SCREEN_DY }
      })()`)

      const expectedX = result && result.SCREEN_DX / result.scale
      const expectedY = result && result.SCREEN_DY / result.scale
      const gotX = result && result.after.x - result.before.x
      const gotY = result && result.after.y - result.before.y
      ok('10 a chrome drag moves the panel by the world delta',
        result && !result.error &&
          Math.abs(gotX - expectedX) < 1 && Math.abs(gotY - expectedY) < 1,
        `scale=${result && result.scale} moved ${gotX},${gotY} expected ${expectedX},${expectedY}`)

      await zoomTo(wc, '0')
    }

    // ---------------------------------------------------------------------
    // 11. A resize commits exactly once, on release. The grid must be
    //     UNCHANGED during the drag and changed after it — one SIGWINCH per
    //     gesture, not one per frame. A full-screen agent TUI repaints on
    //     every SIGWINCH, so this is about the process, not about the pixels.
    // ---------------------------------------------------------------------
    {
      await zoomTo(wc, '0')
      const result = await wc.executeJavaScript(`(async () => {
        const handle = document.querySelector('.panel__resize--se')
        if (!handle) return { error: 'no resize handle' }
        const panel = handle.closest('.panel')
        const slot = panel.querySelector('.panel__slot')
        if (!slot) return { error: 'panel is not live' }
        slot.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        await new Promise((res) => setTimeout(res, 150))

        const gridBefore = window.__m4aGrid()
        const r = handle.getBoundingClientRect()
        const start = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
        const opts = (x, y, buttons) => ({
          bubbles: true, cancelable: true, composed: true, view: window,
          clientX: x, clientY: y, button: 0, buttons, detail: 1
        })

        handle.dispatchEvent(new MouseEvent('mousedown', opts(start.x, start.y, 1)))
        for (let i = 1; i <= 4; i++) {
          document.dispatchEvent(new MouseEvent('mousemove',
            opts(start.x + 60 * i, start.y + 40 * i, 1)))
          await new Promise((res) => setTimeout(res, 40))
        }
        const gridDuring = window.__m4aGrid()
        document.dispatchEvent(new MouseEvent('mouseup', opts(start.x + 240, start.y + 160, 0)))
        await new Promise((res) => setTimeout(res, 400))
        const gridAfter = window.__m4aGrid()
        return { gridBefore, gridDuring, gridAfter }
      })()`)

      const same = (a, b) => a && b && a.cols === b.cols && a.rows === b.rows
      ok('11 a resize commits once, on release',
        result && !result.error &&
          same(result.gridBefore, result.gridDuring) &&
          !same(result.gridBefore, result.gridAfter),
        `before=${JSON.stringify(result && result.gridBefore)} ` +
        `during=${JSON.stringify(result && result.gridDuring)} ` +
        `after=${JSON.stringify(result && result.gridAfter)}`)
    }
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm run build && npm run verify:panels`
Expected: check 10 FAILs with `error: no panel`-style output or a zero delta
(nothing listens to a chrome drag yet); check 11 FAILs with `no resize handle`.

- [ ] **Step 3: Add the `__m4aGrid` hook**

In `Canvas.tsx`'s test-hook effect from Task 3:

```tsx
    w.__m4aGrid = (): { cols: number; rows: number } | null => {
      const id = focusedIdRef.current
      const session = id ? registry.get(id) : undefined
      return session ? session.handle.size() : null
    }
```

- [ ] **Step 4: Write `usePanelDrag.ts`**

```ts
import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { applyDrag, type DragMode, type DragState } from './panel-interaction'
import { screenToWorld, type Viewport, type WorldRect } from './viewport'

export interface PanelDragDeps {
  hostRef: RefObject<HTMLElement | null>
  /** Read through a ref: viewport changes on every wheel event. */
  viewportRef: RefObject<Viewport>
  /** Called on every move with the rect this gesture implies. */
  onDrag(panelId: string, rect: WorldRect): void
  /** Called once on release, so a resize can send exactly one pty:resize. */
  onCommit(panelId: string, mode: DragMode): void
}

/**
 * Runs one panel gesture at a time and returns the function that starts it.
 *
 * The move/up listeners go on `document`, for the same reason xterm's do: the
 * cursor leaves the panel constantly during a drag, and a listener on the
 * panel stops receiving events the moment it does.
 *
 * These listeners do not collide with xterm-pointer.ts's capture-phase
 * interceptor. That interceptor only corrects a gesture whose mousedown landed
 * inside a `.panel__slot`; a panel drag begins on the chrome bar or a resize
 * handle, neither of which is inside the slot, so it never activates.
 */
export function usePanelDrag(deps: PanelDragDeps): (state: DragState) => void {
  const dragRef = useRef<DragState | null>(null)
  // Mirrored so the document listeners, installed once, always call the
  // current callbacks without being torn down and rebuilt every render.
  const depsRef = useRef(deps)
  depsRef.current = deps

  useEffect(() => {
    const toWorld = (event: MouseEvent): { x: number; y: number } | null => {
      const host = depsRef.current.hostRef.current
      const viewport = depsRef.current.viewportRef.current
      if (!host || !viewport) return null
      const bounds = host.getBoundingClientRect()
      return screenToWorld(
        { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
        viewport
      )
    }

    const onMove = (event: MouseEvent): void => {
      const state = dragRef.current
      if (!state) return
      const world = toWorld(event)
      if (!world) return
      depsRef.current.onDrag(state.panelId, applyDrag(state, world))
    }

    const onUp = (): void => {
      const state = dragRef.current
      if (!state) return
      dragRef.current = null
      depsRef.current.onCommit(state.panelId, state.mode)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [])

  return useCallback((state: DragState) => {
    dragRef.current = state
  }, [])
}
```

**On closing a panel mid-drag.** The spec says the gesture "ends on the next
move." This implementation lets it run to its natural `mouseup` instead, because
both of its effects are already inert once the panel is gone: `setPanelRect`
maps over the array and matches nothing, and `registry.refit(id)` returns early
on a missing session. Adding an explicit abort would be a second mechanism
guarding a case the first one already handles. Do not add one.

- [ ] **Step 5: Add handles and chrome dragging to `TerminalPanel.tsx`**

Add to `TerminalPanelProps`:

```tsx
  onBeginDrag: (state: DragState) => void
  onClose: (id: string) => void
```

The chrome's `onMouseDown` gains the drag start. `originWorld` has to be
computed by the caller, which owns the viewport, so the panel hands up the raw
client point and `Canvas` completes the `DragState`:

```tsx
      <header
        className="panel__chrome"
        onMouseDown={(event) => {
          // Chrome selects, raises, and starts a move. stopPropagation keeps
          // the canvas from reading this as a background click.
          event.stopPropagation()
          event.preventDefault() // suppress native text-drag of the title
          onSelect(session.id)
          onBeginDrag({
            panelId: session.id,
            mode: { kind: 'move' },
            originRect: rect,
            originWorld: { x: event.clientX, y: event.clientY }
          })
        }}
      >
```

`originWorld` is filled with **client** coordinates here and converted by
`Canvas`; see Step 6. Add the three handles as the last children of `.panel`:

```tsx
      {(['e', 's', 'se'] as const).map((edge) => (
        <div
          key={edge}
          className={`panel__resize panel__resize--${edge}`}
          onMouseDown={(event) => {
            event.stopPropagation()
            event.preventDefault()
            onSelect(session.id)
            onBeginDrag({
              panelId: session.id,
              mode: { kind: 'resize', edge },
              originRect: rect,
              originWorld: { x: event.clientX, y: event.clientY }
            })
          }}
        />
      ))}
```

- [ ] **Step 6: Wire it up in `Canvas.tsx`**

`onBeginDrag` converts the client point the panel supplied into world space,
then hands the completed state to the hook:

```tsx
  const beginDrag = usePanelDrag({
    hostRef,
    viewportRef,
    onDrag: useCallback(
      (id: string, rect: WorldRect) => setPanels((current) => setPanelRect(current, id, rect)),
      []
    ),
    onCommit: useCallback((id: string, mode: DragMode) => {
      // A move changes no terminal dimension, so it has nothing to commit.
      if (mode.kind !== 'resize') return
      registry.refit(id)
    }, [])
  })

  const onBeginDrag = useCallback((state: DragState) => {
    const host = hostRef.current
    if (!host) return
    const bounds = host.getBoundingClientRect()
    // The panel supplies CLIENT coordinates; only the canvas knows the
    // viewport, so the conversion belongs here.
    beginDrag({
      ...state,
      originWorld: screenToWorld(
        { x: state.originWorld.x - bounds.left, y: state.originWorld.y - bounds.top },
        viewportRef.current
      )
    })
  }, [beginDrag])
```

Pass `onBeginDrag={onBeginDrag}` to each `TerminalPanel`.

- [ ] **Step 7: Add `refit(id)` to the registry**

`src/renderer/session/session-registry.ts` — add to the `Registry` interface
and the returned object:

```ts
  /** Re-fit after the panel's box changed, and send at most one pty:resize. */
  refit(id: PanelId): void
```

```ts
    refit(id) {
      const session = sessions.get(id)
      if (!session || session.tier !== 'live') return
      // A carded panel has no attached host to measure; its grid is settled on
      // the next attachSlot, which already compares against sentGrid.
      session.handle.refit()
      if (!session.spawned) return
      // A process that has already exited has nothing to signal.
      if (session.status.kind === 'exited') return
      const { cols, rows } = session.handle.size()
      const sent = session.sentGrid
      if (sent && sent.cols === cols && sent.rows === rows) return
      session.sentGrid = { cols, rows }
      void bridge.pty.resize({ panelId: id, cols, rows })
    },
```

Add `refit(): void` to `SessionHandle` in `panel-session.ts` and implement it in
`session-factory.ts` as a call to the fit addon:

```ts
    refit() {
      handles.fitAddon.fit()
    },
```

- [ ] **Step 8: Add the handle and cursor styles**

`src/renderer/styles.css`:

```css
/* Resize handles. East, south, south-east only — see panel-interaction.ts.
   Positioned INSIDE the panel's border box so they scale with .world's
   transform like everything else; a handle in screen pixels would drift away
   from its own panel as you zoom. */
.panel__resize {
  position: absolute;
  z-index: 2;
}

.panel__resize--e {
  top: 0;
  right: -3px;
  width: 8px;
  height: 100%;
  cursor: ew-resize;
}

.panel__resize--s {
  left: 0;
  bottom: -3px;
  width: 100%;
  height: 8px;
  cursor: ns-resize;
}

/* Last in source order and given a higher z-index so the corner wins over the
   two edges it overlaps. */
.panel__resize--se {
  right: -3px;
  bottom: -3px;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  z-index: 3;
}

.panel__chrome {
  cursor: grab;
}
```

- [ ] **Step 9: Run the checks**

Run: `npm run verify`
Expected: green, `11/11 passed` for panels.

If check 10's measured delta equals the screen delta rather than
`screenDelta / scale`, the conversion in `onBeginDrag` or in `usePanelDrag`'s
`toWorld` is missing. If check 11's `during` grid already differs from
`before`, something is calling `refit` on every move rather than on commit.

- [ ] **Step 10: Commit**

```bash
git add src/renderer/canvas/usePanelDrag.ts src/renderer/canvas/Canvas.tsx \
        src/renderer/components/TerminalPanel.tsx src/renderer/styles.css \
        src/renderer/session/session-registry.ts src/renderer/session/panel-session.ts \
        src/renderer/terminal/session-factory.ts scripts/verify-panels.cjs
git commit -m "feat(m4a): drag and resize panels

Resize commits one pty:resize on release. A full-screen agent TUI repaints
its whole frame on every SIGWINCH, so a live resize would mean sixty full
repaints a second at sizes the user never meant to keep."
```

---

### Task 6: Wheel ownership

**Files:**
- Modify: `src/renderer/canvas/useViewport.ts`
- Modify: `src/renderer/canvas/Canvas.tsx`
- Test: `scripts/verify-panels.cjs` (check 12)

**Interfaces:**
- Produces: `useViewport` gains a fourth parameter `shouldYieldWheel?: (event: WheelEvent) => boolean`.

- [ ] **Step 1: Write check 12, watch it fail**

```js
    // ---------------------------------------------------------------------
    // 12. Wheel ownership. A wheel over the FOCUSED panel scrolls that
    //     terminal and must not move the camera; a wheel anywhere else pans.
    //     Without this, both handlers run on one gesture: useViewport's
    //     listener is on the canvas host and xterm's bubbles up into it.
    // ---------------------------------------------------------------------
    {
      await zoomTo(wc, '0')
      const result = await wc.executeJavaScript(`(async () => {
        const read = () => getComputedStyle(document.querySelector('.world')).transform
        const slot = document.querySelector('.panel__slot')
        if (!slot) return { error: 'no live panel' }
        slot.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        await new Promise((res) => setTimeout(res, 150))

        const r = slot.getBoundingClientRect()
        const before = read()
        slot.dispatchEvent(new WheelEvent('wheel', {
          bubbles: true, cancelable: true,
          clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
          deltaY: 120, deltaMode: 0
        }))
        await new Promise((res) => setTimeout(res, 200))
        const overFocused = read()

        // Now the background, which must pan.
        const canvas = document.querySelector('.canvas')
        canvas.dispatchEvent(new WheelEvent('wheel', {
          bubbles: true, cancelable: true,
          clientX: 5, clientY: 5, deltaY: 120, deltaMode: 0
        }))
        await new Promise((res) => setTimeout(res, 200))
        return { before, overFocused, overBackground: read() }
      })()`)

      ok('12 a wheel over the focused terminal does not move the camera',
        result && !result.error &&
          result.overFocused === result.before &&
          result.overBackground !== result.before,
        `before=${result && result.before} focused=${result && result.overFocused} ` +
        `background=${result && result.overBackground}`)
    }
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm run build && npm run verify:panels`
Expected: check 12 FAILs with `focused` differing from `before` — the canvas
panned on a wheel that belonged to the terminal.

- [ ] **Step 3: Add the guard to `useViewport.ts`**

Signature:

```ts
export function useViewport(
  hostRef: RefObject<HTMLElement | null>,
  rects: WorldRect[],
  onSpawn?: (worldCentre: Point) => void,
  shouldYieldWheel?: (event: WheelEvent) => boolean
): Viewport {
```

Inside `onWheel`, before `event.preventDefault()`:

```ts
      // Wheel ownership. A wheel over the focused panel belongs to that
      // terminal's scrollback; every other wheel belongs to the camera.
      //
      // Returning WITHOUT preventDefault is deliberate: xterm's own handler is
      // bound to a descendant and has already run in the target phase by the
      // time this bubbles up, so all this has to do is decline. Calling
      // preventDefault here would suppress nothing useful and would fight the
      // scroll xterm just performed.
      //
      // ctrlKey is exempt unconditionally: a trackpad pinch arrives as a wheel
      // with ctrlKey true, and a pinch is always a camera zoom no matter what
      // is under the cursor.
      if (!event.ctrlKey && shouldYieldWheel?.(event)) return
```

`shouldYieldWheel` must be added to the effect's dependency array. Because
`Canvas` supplies it via `useCallback` with an empty dep list, the listener is
still installed exactly once.

- [ ] **Step 4: Supply the predicate from `Canvas.tsx`**

```tsx
  // A wheel belongs to a terminal only when it is over the FOCUSED panel.
  // Focus is explicit — the user clicked in — which makes the rule
  // predictable without having to be explained.
  const shouldYieldWheel = useCallback((event: WheelEvent): boolean => {
    const id = focusedIdRef.current
    if (!id) return false
    const target = event.target as HTMLElement | null
    const panel = target?.closest?.('.panel')
    return panel?.getAttribute('data-panel-id') === id
  }, [])

  const viewport = useViewport(hostRef, rects, onSpawn, shouldYieldWheel)
```

Add `data-panel-id={session.id}` to `.panel`'s root div in
`TerminalPanel.tsx`, so the predicate can identify the panel from the event
target without reaching into React.

- [ ] **Step 5: Run**

Run: `npm run verify`
Expected: green, `12/12 passed`.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/canvas/useViewport.ts src/renderer/canvas/Canvas.tsx \
        src/renderer/components/TerminalPanel.tsx scripts/verify-panels.cjs
git commit -m "fix(m4a): settle wheel ownership between canvas and terminal

useViewport's listener panned unconditionally while xterm's own handler
bubbled into it, so one gesture over a live panel scrolled the scrollback
AND panned the canvas. M3's pointer-events gate masked it outside the
interaction band; removing the gate exposed it everywhere."
```

---

### Task 7: Close a panel

**Files:**
- Modify: `src/renderer/session/session-registry.ts`
- Modify: `src/renderer/components/TerminalPanel.tsx`
- Modify: `src/renderer/canvas/Canvas.tsx`
- Modify: `src/renderer/styles.css`
- Test: `scripts/verify-registry.cjs` (checks 15–17), `scripts/verify-panels.cjs` (checks 13–15)

**Interfaces:**
- Produces: `Registry` gains `dispose(id: PanelId): void`.

- [ ] **Step 1: Write registry checks 15–17, watch them fail**

Append to `scripts/verify-registry.cjs` before its summary block. Follow the
file's existing fake-bridge pattern.

```js
// ---------------------------------------------------------------------------
// M4a: explicit close (15-17)
// ---------------------------------------------------------------------------

// 15. dispose(id) kills that panel's PTY. This is the SECOND legitimate caller
//     of pty.kill in the renderer; disposeAll was the first and, until M4a,
//     the only one.
{
  const bridge = fakeBridge()
  const registry = createRegistry({ bridge, factory: fakeFactory() })
  registry.ensure('a', { panelId: 'a', cwd: '~', args: [] })
  registry.applyTiers({ a: 'live' })
  registry.attachSlot('a')
  registry.dispose('a')
  ok('15 dispose kills that panel\'s pty',
    bridge.calls.kill.length === 1 && bridge.calls.kill[0] === 'a',
    JSON.stringify(bridge.calls.kill))
}

// 16. dispose(id) touches nothing else. The panel next to the one you closed
//     must not lose its agent — the same class of silent failure check 5
//     exists for, arriving through the new code path.
{
  const bridge = fakeBridge()
  const registry = createRegistry({ bridge, factory: fakeFactory() })
  for (const id of ['a', 'b', 'c']) {
    registry.ensure(id, { panelId: id, cwd: '~', args: [] })
  }
  registry.applyTiers({ a: 'live', b: 'live', c: 'live' })
  for (const id of ['a', 'b', 'c']) registry.attachSlot(id)
  registry.dispose('b')
  ok('16 dispose leaves every other session alone',
    bridge.calls.kill.length === 1 && bridge.calls.kill[0] === 'b' &&
      registry.get('a') !== undefined && registry.get('c') !== undefined &&
      registry.get('b') === undefined,
    `killed=${JSON.stringify(bridge.calls.kill)} a=${!!registry.get('a')} c=${!!registry.get('c')}`)
}

// 17. Demotion STILL never kills, now that a kill path other than disposeAll
//     exists. This is check 5's invariant re-asserted against the new code:
//     the danger was never that kill is called, it was that kill becomes
//     reachable from a tier change.
{
  const bridge = fakeBridge()
  const registry = createRegistry({ bridge, factory: fakeFactory() })
  for (const id of ['a', 'b']) {
    registry.ensure(id, { panelId: id, cwd: '~', args: [] })
  }
  registry.applyTiers({ a: 'live', b: 'live' })
  registry.attachSlot('a')
  registry.attachSlot('b')
  registry.dispose('a')
  registry.applyTiers({ b: 'card' })
  registry.detachSlot('b')
  ok('17 demotion never kills, even alongside an explicit close',
    bridge.calls.kill.length === 1 && bridge.calls.kill[0] === 'a' &&
      registry.get('b') !== undefined,
    `killed=${JSON.stringify(bridge.calls.kill)}`)
}
```

If `fakeFactory` is named differently in the existing file, use whatever that
file already defines; do not add a second fake.

- [ ] **Step 2: Run and watch it fail**

Run: `npm run verify:registry`
Expected: FAIL — `registry.dispose is not a function`.

- [ ] **Step 3: Implement `dispose(id)`**

Add to the `Registry` interface:

```ts
  /**
   * Close one panel: free its terminal and kill its process. One of exactly
   * TWO places pty.kill is called in the renderer, the other being disposeAll.
   * Tiering must never reach either.
   */
  dispose(id: PanelId): void
```

And to the returned object:

```ts
    dispose(id) {
      const session = sessions.get(id)
      if (!session) return
      session.handle.dispose()
      // Only if it ever spawned: killing an id main has never heard of throws.
      if (session.spawned) void bridge.pty.kill(id)
      sessions.delete(id)
      bump()
    },
```

Update `disposeAll`'s comment, which currently reads "The only place a PTY is
killed":

```ts
    disposeAll() {
      // One of two places a PTY is killed; dispose(id) is the other. Tiering
      // is neither, and must never become either.
```

- [ ] **Step 4: Run the registry checks**

Run: `npm run verify:registry`
Expected: `17/17 passed`.

- [ ] **Step 5: Write panels checks 13–15, watch them fail**

```js
    // ---------------------------------------------------------------------
    // 13. An idle or exited panel closes on the first click. 14. A running
    // panel needs two. 15. Closing one panel does not disturb any other,
    // including a demoted one — check 4's invariant re-asserted against the
    // new dispose(id) path.
    // ---------------------------------------------------------------------
    {
      await zoomTo(wc, '0')
      const before = await settledSessionMap(wc)

      const result = await wc.executeJavaScript(`(async () => {
        const panels = [...document.querySelectorAll('.panel')]
        // A panel that never spawned: its card says "not started".
        const idle = panels.find((p) => p.querySelector('.panel__card-idle'))
        // A panel with a running pty: its badge shows a pid.
        const running = panels.find((p) => /pid /.test(p.textContent || ''))
        if (!idle || !running) return { error: 'need one idle and one running panel' }

        const idleId = idle.getAttribute('data-panel-id')
        const runningId = running.getAttribute('data-panel-id')
        const click = (el) => el.dispatchEvent(new MouseEvent('mousedown',
          { bubbles: true, cancelable: true, view: window, button: 0, buttons: 1, detail: 1 }))

        const countBefore = document.querySelectorAll('.panel').length
        click(idle.querySelector('.panel__close'))
        await new Promise((r) => setTimeout(r, 200))
        const afterIdleClose = document.querySelectorAll('.panel').length

        const runningClose = running.querySelector('.panel__close')
        click(runningClose)
        await new Promise((r) => setTimeout(r, 200))
        const armedText = (runningClose.textContent || '').trim()
        const afterFirstClick = document.querySelectorAll('.panel').length
        click(runningClose)
        await new Promise((r) => setTimeout(r, 300))
        const afterSecondClick = document.querySelectorAll('.panel').length

        return {
          idleId, runningId, countBefore, afterIdleClose,
          armedText, afterFirstClick, afterSecondClick
        }
      })()`)

      ok('13 an idle panel closes on the first click',
        result && !result.error && result.afterIdleClose === result.countBefore - 1,
        `${result && result.countBefore} -> ${result && result.afterIdleClose}`)

      ok('14 a running panel arms first and closes on the second click',
        result && !result.error &&
          result.afterFirstClick === result.afterIdleClose &&
          /kill/i.test(result.armedText || '') &&
          result.afterSecondClick === result.afterIdleClose - 1,
        `armed="${result && result.armedText}" ` +
        `${result && result.afterFirstClick} -> ${result && result.afterSecondClick}`)

      const after = await sessionMap(wc)
      const survivors = new Map(
        [...before].filter(([id]) => id !== (result && result.runningId))
      )
      const { ok: preserved, changed } = pidsPreserved(survivors, after)
      ok('15 closing one panel kills only that panel\'s pty',
        preserved && !after.has(result && result.runningId),
        preserved
          ? `${survivors.size} session(s) unchanged, ${result && result.runningId} gone`
          : `pid mismatch: ${changed.join('; ')}`)
    }
```

- [ ] **Step 6: Run and watch them fail**

Run: `npm run build && npm run verify:panels`
Expected: checks 13–15 FAIL with `error: need one idle and one running panel`,
because `.panel__close` does not exist yet.

- [ ] **Step 7: Add the close button to `TerminalPanel.tsx`**

```tsx
const CONFIRM_CLOSE_MS = 3000

// ...inside TerminalPanelImpl:
  const [arming, setArming] = useState(false)
  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (armTimerRef.current !== null) clearTimeout(armTimerRef.current)
  }, [])

  const running = session.status.kind === 'running' || session.status.kind === 'starting'

  const handleClose = (event: ReactMouseEvent): void => {
    event.stopPropagation()
    event.preventDefault()
    // Idle and exited panels have nothing to lose, so they close outright.
    // A live process asks once — but only once, and without a modal: a dialog
    // on every close trains you to click through the one that mattered.
    if (!running || arming) {
      if (armTimerRef.current !== null) clearTimeout(armTimerRef.current)
      onClose(session.id)
      return
    }
    setArming(true)
    armTimerRef.current = setTimeout(() => {
      armTimerRef.current = null
      setArming(false)
    }, CONFIRM_CLOSE_MS)
  }
```

In the chrome, after `<StatusBadge/>`:

```tsx
        <button
          type="button"
          className={`panel__close${arming ? ' panel__close--arming' : ''}`}
          onMouseDown={handleClose}
          title={arming ? 'Click again to kill this process' : 'Close panel'}
        >
          {arming ? 'kill?' : '×'}
        </button>
```

`onMouseDown` rather than `onClick`, so it runs in the same phase as every
other panel interaction and reliably beats the chrome's own drag start.

Import `useState` and `type MouseEvent as ReactMouseEvent` from `react`.

- [ ] **Step 8: Wire `onClose` in `Canvas.tsx`**

```tsx
  const onClosePanel = useCallback((id: string) => {
    // Order matters: dispose first, so the session is gone before React
    // unmounts the view. The reverse order runs TerminalPanel's cleanup —
    // which calls detachSlot — against a session that no longer exists.
    registry.dispose(id)
    setPanels((current) => removePanel(current, id))
    setSelectedId((current) => (current === id ? null : current))
    setFocusedId((current) => (current === id ? null : current))
  }, [])
```

Pass `onClose={onClosePanel}` to each `TerminalPanel`, and import `removePanel`.

- [ ] **Step 9: Style the close button**

```css
.panel__close {
  appearance: none;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  line-height: 1;
  padding: 2px 7px;
  cursor: pointer;
}

.panel__close:hover {
  background: var(--border);
  color: var(--text);
}

/* Armed: a running process is one click from dying, so it stops looking like
   a neutral control. */
.panel__close--arming {
  border-color: var(--red);
  color: var(--red);
  font-size: 11px;
}
```

All four variables used here — `--muted`, `--text`, `--border`, `--red` — are
already declared in the `:root` block at the top of `styles.css`. Do not add new
ones.

- [ ] **Step 10: Run everything**

Run: `npm run verify`
Expected: green; `17/17` registry, `15/15` panels.

- [ ] **Step 11: Commit**

```bash
git add src/renderer/session/session-registry.ts src/renderer/components/TerminalPanel.tsx \
        src/renderer/canvas/Canvas.tsx src/renderer/styles.css \
        scripts/verify-registry.cjs scripts/verify-panels.cjs
git commit -m "feat(m4a): close a panel, killing its process

Adds the second and last legitimate pty.kill caller in the renderer.
Registry check 17 and panels check 15 both re-assert the invariant that
actually mattered: kill must stay unreachable from a tier change."
```

---

### Task 8: Z-order

**Files:**
- Modify: `src/renderer/canvas/Canvas.tsx`
- Modify: `src/renderer/components/TerminalPanel.tsx`
- Test: `scripts/verify-panels.cjs` (check 16)

**Interfaces:**
- Consumes: `raisePanel`, `Panel.z` from Task 1.
- Produces: `TerminalPanelProps` gains `z: number`.

- [ ] **Step 1: Write check 16, watch it fail**

```js
    // ---------------------------------------------------------------------
    // 16. Selecting a panel raises it above its neighbours, and does so via
    //     zIndex rather than by reordering the DOM. The DOM-order half is the
    //     real assertion: React reconciles a reordered keyed list by MOVING
    //     nodes, which would incidentally detach a live terminal's host.
    // ---------------------------------------------------------------------
    {
      await zoomTo(wc, '0')
      const result = await wc.executeJavaScript(`(async () => {
        const ids = () => [...document.querySelectorAll('.panel')]
          .map((p) => p.getAttribute('data-panel-id'))
        const panels = [...document.querySelectorAll('.panel')]
        if (panels.length < 2) return { error: 'need two panels' }
        const zOf = (p) => parseInt(getComputedStyle(p).zIndex || '0', 10)
        // Pick the panel with the LOWEST z, so raising it is observable.
        const target = panels.reduce((lo, p) => (zOf(p) < zOf(lo) ? p : lo), panels[0])
        const id = target.getAttribute('data-panel-id')
        const domBefore = ids().join(',')
        const zBefore = zOf(target)
        const maxBefore = Math.max(...panels.map(zOf))

        target.querySelector('.panel__chrome').dispatchEvent(new MouseEvent('mousedown',
          { bubbles: true, cancelable: true, view: window, button: 0, buttons: 1, detail: 1 }))
        document.dispatchEvent(new MouseEvent('mouseup',
          { bubbles: true, cancelable: true, view: window, button: 0, buttons: 0 }))
        await new Promise((r) => setTimeout(r, 200))

        const raised = document.querySelector('[data-panel-id="' + id + '"]')
        return {
          id, zBefore, maxBefore, zAfter: zOf(raised),
          domBefore, domAfter: ids().join(',')
        }
      })()`)

      ok('16 selecting raises by z-index without reordering the DOM',
        result && !result.error &&
          result.zAfter > result.maxBefore &&
          result.domBefore === result.domAfter,
        `z ${result && result.zBefore} -> ${result && result.zAfter} ` +
        `(max was ${result && result.maxBefore}); dom stable=${
          result && result.domBefore === result.domAfter}`)
    }
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm run build && npm run verify:panels`
Expected: FAIL — every panel reports `zIndex: auto` (parsed as `NaN`/`0`) and
no raise happens.

- [ ] **Step 3: Render `z` and hit-test by it**

`TerminalPanel.tsx` — add `z: number` to the props and to the style:

```tsx
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, zIndex: z }}
```

`Canvas.tsx` — pass `z={panel.z}`, and give `hitTest` an array ordered by `z`:

```tsx
  // hitTest returns the LAST match, so paint order and pick order agree only
  // if the array it receives is in paint order. Paint order is z now, not
  // array position — see the note on Panel.z.
  const hitOrder = useMemo(
    () => [...panels].sort((a, b) => a.z - b.z).map((p) => p.rect),
    [panels]
  )
```

Use `hitOrder` in `onMouseDown`'s `hitTest(hitOrder, world)` call. Leave `rects`
as it is: `assignTiers` and `useViewport`'s `fitTo` do not care about order.

- [ ] **Step 4: Raise on select**

In `Canvas.tsx`, fold the raise into the existing select path:

```tsx
  const onSelectPanel = useCallback((id: string) => {
    setSelectedId(id)
    setPanels((current) => raisePanel(current, id))
  }, [])
```

Pass `onSelect={onSelectPanel}` instead of `setSelectedId`, and make
`onFocusPanel` call it too so a body click raises as well:

```tsx
  const onFocusPanel = useCallback((id: string) => {
    onSelectPanel(id)
    setFocusedId(id)
    registry.focus(id)
  }, [onSelectPanel])
```

- [ ] **Step 5: Run**

Run: `npm run verify`
Expected: green, `16/16 passed`.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/canvas/Canvas.tsx src/renderer/components/TerminalPanel.tsx \
        scripts/verify-panels.cjs
git commit -m "feat(m4a): raise a panel on select, by z-index

Not by reordering the panels array: React reconciles a reordered keyed
list by moving DOM nodes, and remove-then-insert would detach a live
terminal's WebGL host as a side effect of clicking an unrelated panel."
```

---

### Task 9: Documentation

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the README milestone table**

```markdown
| M4a | Panel manipulation: drag, resize, close, pointer correction | ✅ done |
| M4b | Layout persistence: panels survive a relaunch | |
| M4c | tmux backing: sessions survive the renderer | |
```

Replace the single M4 row. Keep M5 as it is.

- [ ] **Step 2: Correct the README's pointer paragraph**

It currently says correction is M4's future work. Replace the last sentence of
the "same transform-blindness" paragraph with:

```markdown
M4a corrects this at the source: `src/renderer/components/xterm-pointer.ts`
intercepts mouse events on `document` in the capture phase and re-dispatches
them with `clientX`/`clientY` rewritten so the offset xterm computes is already
in CSS pixels. `getMouseReportCoords` shares that helper, so mouse-reporting
TUIs are corrected by the same change.
```

- [ ] **Step 3: Update the verify table in `CLAUDE.md`**

```markdown
| `verify:viewport` | plain node | 37 checks: `viewport.ts` (1–11b), `lod.ts` (20–25), `panel-interaction.ts` + `panels.ts` (26–34), `pointer-correct.ts` (35–37) |
| `verify:registry` | plain node | 17 checks: lifecycle against fakes, including explicit close (15–17) |
| `verify:panels` | real Electron | 16 checks: tiering, the pointer corrector, drag, resize, wheel ownership, close, z-order |
```

Also update the README's `npm run verify:*` list comments to match.

- [ ] **Step 4: Rewrite the two load-bearing entries M4a changed**

In `CLAUDE.md`, replace **"Clicks are gated near 1:1"** and the paragraph
beginning **"...which is why pointer coordinates are gated rather than
corrected"** with a single entry:

```markdown
**Pointer coordinates are corrected, not gated (`components/xterm-pointer.ts`).**
xterm computes a cell as `(clientX - rect.left) / dimensions.css.cell.width`.
`rect.left` is transform-aware and in screen pixels; `cell.width` is
transform-blind and in CSS pixels, so under `scale(k)` xterm reports a column
`k` times the true one. M3 gated body clicks to `[0.9, 1.1]` and left it. M4a
rewrites the event instead: a capture-phase listener **on `document`** — not on
the panel, because xterm binds its drag listeners to the document and a
panel-scoped listener would correct the mousedown and miss every move after it —
re-dispatches a synthetic `MouseEvent` with corrected coordinates. Three fields
must be carried or the failure is silent: `detail` (click count; drop it and
double/triple-click select break), `buttons` (drop it and every corrected move
reads as a hover, so selection never extends), and the modifier flags. A
`WeakSet` marks synthetic events, without which the clone re-enters the same
listener and recurses. At `scale === 1` the interceptor short-circuits, so the
common case pays nothing.

**`pty.kill` has exactly two callers (`session-registry.ts`).** `disposeAll`
(renderer teardown) and `dispose(id)` (explicit close). M3's invariant said
"exactly one"; M4a's close legitimately needs a second. The distinction that
mattered is unchanged and is what the checks assert: **kill must stay
unreachable from a tier change.** `verify:registry` 5 and 17, and
`verify:panels` 4 and 15, all exist for that one property.

**Resize commits on release (`Canvas.tsx`'s `onCommit`, `registry.refit`).** The
panel's box follows the cursor live, but the terminal refits and `pty:resize`
fires once, on mouseup. A full-screen agent TUI repaints its entire frame on
every SIGWINCH; resizing live would mean roughly sixty full repaints a second,
through a 16ms-batched channel, at intermediate sizes the user never intended to
keep. `verify:panels` check 11 asserts the grid is unchanged mid-drag.

**Stacking is `z`, never array order (`panels.ts`, `Canvas.tsx`).** React
reconciles a reordered keyed list by moving DOM nodes, and a move is
remove-then-insert — which would momentarily detach the subtree holding a live
terminal's host and its WebGL context. M3's eviction proves a *deliberate*
detach is survivable (dispose the addon, `refresh()` on the way back); an
incidental one triggered by clicking an unrelated panel does none of that.
`Panel.z` renders as `zIndex`, and `Canvas` sorts by `z` before calling
`hitTest`, which returns the last match — so paint order and pick order still
agree. `verify:panels` check 16 asserts DOM order is stable across a raise.

**Wheel ownership is decided by focus (`useViewport.ts`, `Canvas.tsx`).** A
wheel over the focused panel scrolls that terminal; every other wheel moves the
camera; `ctrlKey` (a trackpad pinch) is always a camera zoom. Before M4a the
canvas's host listener panned unconditionally while xterm's own handler bubbled
into it, so one gesture over a live panel did both — masked outside M3's
interaction band by `pointer-events: none`, and exposed everywhere once the gate
was removed. The guard returns **without** `preventDefault`: xterm's listener
has already run in the target phase, so declining is all that is needed.
```

- [ ] **Step 5: Add the drag-math gotcha**

In `CLAUDE.md`'s Gotchas list:

```markdown
- **A drag delta is `screenToWorld(p₂) − screenToWorld(p₁)`, never
  `screenToWorld(p₂ − p₁)`.** `screenToWorld` subtracts the viewport translation
  before dividing by the scale; applying it to a delta subtracts a translation
  that should have cancelled. `verify:viewport` check 27 exists for this.
- **`applyDrag` recomputes from the gesture origin, never from the previous
  frame.** Accumulating deltas drifts (each frame rounds, and at `scale: 0.1`
  one rounding is ten world units) and breaks outright if the user zooms
  mid-drag. Checks 28 and 29.
```

- [ ] **Step 6: Note the test hooks**

In `CLAUDE.md`, under the `verify:panels` description:

```markdown
`verify:panels` reaches the registry through four narrow `window.__m4a*` hooks
installed by `Canvas.tsx` (`__m4aScale`, `__m4aWrite`, `__m4aSelection`,
`__m4aCellToScreen`, `__m4aGrid`). The registry is a module-level closure by
design and `executeJavaScript` has no other route into it. Keep them narrow: the
alternative is exposing the registry itself and letting the suite drift into
testing internals.
```

- [ ] **Step 7: Run the full suite one last time and commit**

Run: `npm run verify`
Expected: green throughout.

```bash
git add README.md CLAUDE.md
git commit -m "docs(m4a): record the invariants M4a changed

pty.kill gains a second legitimate caller, the click gate is replaced by
correction, stacking moves to z-index, and wheel ownership is settled by
focus. Each entry says what fails silently if it is undone."
```

---

## Definition of Done

- [ ] `npm run verify` is green: `37/37` viewport, `17/17` registry, `16/16` panels, plus the unchanged pty/window/ipc/canvas/xterm suites.
- [ ] `INTERACT_MIN_SCALE`, `INTERACT_MAX_SCALE`, and `.panel__slot--blocked` appear nowhere in the codebase.
- [ ] `grep -rn "pty.kill\|pty\.kill" src/renderer` returns exactly two call sites, both in `session-registry.ts`: `disposeAll` and `dispose`.
- [ ] `grep -rn "process.env" src/renderer` returns nothing.
- [ ] No new channels in `src/shared/ipc-contract.ts`; `verify:ipc` still reports 1/1.
- [ ] `panel-interaction.ts` and `pointer-correct.ts` contain no `import` from React, `document`, or `window`.
- [ ] A manual pass in `npm run dev`: drag a panel at 50% zoom and it tracks the cursor; resize it and the text reflows only on release; click into a terminal at 50% zoom and the cursor lands where you clicked; scroll over a focused terminal and the canvas does not move; close a running panel and it asks once.
