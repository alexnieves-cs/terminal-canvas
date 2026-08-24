# M4a: Panel Manipulation — Design

**Status:** approved, not yet implemented
**Predecessor:** `2026-08-23-m3-terminals-on-canvas-design.md`

## Goal

Make panels first-class objects you can move, size, and close — and retire the
placeholder that M3 left in their place. M3 shipped a canvas whose panels are
positioned once and never touched again, and whose terminals only accept mouse
input inside a narrow zoom band. M4a makes geometry mutable and makes mouse
input correct at every zoom.

## Scope

In:

- Drag a panel by its chrome bar.
- Resize from the east, south, and south-east edges.
- Close a panel, killing its process.
- Full pointer correction, replacing M3's `[0.9, 1.1]` interaction gate.
- Z-order: selecting raises.
- Wheel ownership between the canvas and a terminal.

Out, and deliberately so:

- **Layout persistence** (M4b). Nothing here survives a relaunch.
- **tmux backing** (M4c). Sessions still die with the renderer.
- **North and west resize edges.** Resizing from a top or left edge changes the
  panel's origin and its size in one gesture — two coupled changes to verify
  instead of one, for an affordance a terminal barely needs.
- **Multi-select, group drag, alignment guides, snapping.** No evidence yet
  that they're wanted; each is independently addable later.

## The central problem

M3 documented the coordinate bug and chose not to fix it. Confirmed against
`node_modules/@xterm/xterm/lib/xterm.js`:

```js
// getCoordsRelativeToElement(window, event, element)
return [ e.clientX - rect.left - padLeft, e.clientY - rect.top - padTop ]
// getCoords(...)
l[0] = Math.ceil((l[0] + (isSelection ? cellW / 2 : 0)) / cellW)
```

`rect.left` comes from `getBoundingClientRect()`, which is transform-aware and
returns screen pixels. `cellW` comes from `dimensions.css.cell.width`, which is
transform-blind and in CSS pixels. Under `scale(k)` the numerator is `k` times
larger than the denominator expects, so the reported column is `k ×` the true
column.

`getMouseReportCoords` — the path feeding mouse-reporting TUIs — calls the same
`getCoordsRelativeToElement`. **One correction fixes selection and mouse
reporting together.**

On mousedown, xterm binds `mousemove` and `mouseup` to `document`, not to its
own element:

```js
s.mouseup && this._document.addEventListener("mouseup", s.mouseup),
s.mousedrag && this._document.addEventListener("mousemove", s.mousedrag)
```

This is decisive: a corrector scoped to the panel can fix the mousedown and
will never see the drag that follows.

## Architecture

The M2/M3 layering rule holds — pure math at the bottom, React only at the top,
imports point downward only.

```
src/renderer/canvas/
  viewport.ts             unchanged
  pointer-correct.ts      NEW · pure. Correct a screen point for scale.
  panel-interaction.ts    NEW · pure. Pointer position -> panel geometry.
  canvas-input.ts         unchanged
  lod.ts                  unchanged
  usePanelInteraction.ts  NEW · React state + document listeners for a drag
  useViewport.ts          gains the wheel-ownership guard
  Canvas.tsx              owns close/raise; loses the interaction gate
src/renderer/components/
  TerminalPanel.tsx       gains resize handles and a close button
  xterm-pointer.ts        NEW · the document-level capture interceptor
src/renderer/panels/
  panels.ts               gains movePanel / resizePanel / removePanel / raisePanel
src/renderer/session/
  session-registry.ts     gains dispose(id)
```

**`pointer-correct.ts` is its own file** rather than a helper inside the
interceptor. It is four lines of arithmetic that decide whether every click in
the application lands on the right character. As its own module it is tested as
arithmetic under plain node — a rect, a scale, a point, an expected point —
with no Electron, no xterm, no `window`. The interceptor that uses it cannot be
tested without a real DOM; the decision it encodes should not inherit that.

**`panel-interaction.ts` is separate from `canvas-input.ts`.** `canvas-input.ts`
answers "what does this wheel event mean for the camera." The new module answers
"what does this pointer position mean for a panel's rect." Different inputs,
different outputs, and only one is ever active — the camera does not move while
a panel is being dragged.

### The panel model

`Panel` gains one field, and `cols`/`rows` stay absent from the spec for the
reason M3 recorded — they are unknown until the panel is attached and fitted,
and inventing them reintroduces spawn-at-80×24.

```ts
export interface Panel {
  rect: WorldRect
  spec: PanelSpecTemplate
  /** Paint order. Raising sets this above the current maximum; see Z-order. */
  z: number
}
```

`SEED_PANELS` gets ascending `z` matching its current array order, so the
initial stacking is identical to today's. `makePanel` takes the next `z` above
the current maximum, which is what makes a `Cmd+N` panel appear on top.

`panels.ts` gains four pure array helpers — `movePanel`, `resizePanel`,
`removePanel`, `raisePanel` — each taking `Panel[]` and returning a new
`Panel[]`. They hold no React and no DOM, so they are covered by the plain-node
suite alongside the interaction math.

### `panel-interaction.ts`

```ts
export type ResizeEdge = 'e' | 's' | 'se'

export type DragMode =
  | { kind: 'move' }
  | { kind: 'resize'; edge: ResizeEdge }

export interface DragState {
  panelId: string
  mode: DragMode
  /** The rect at mousedown. Never mutated for the duration of the drag. */
  originRect: WorldRect
  /** The world point under the cursor at mousedown. */
  originWorld: Point
}

/** The rect this drag implies, given where the cursor is now, in world space. */
export function applyDrag(state: DragState, world: Point): WorldRect
```

**Recompute from the origin; never accumulate deltas.** Each frame derives the
rect from `originRect` and the current cursor, not from the previous frame's
rect. Accumulation drifts — every frame rounds, and at `scale: 0.1` each
rounding is worth ten world units. Recomputing means the panel lands exactly
where the cursor says regardless of how many frames the gesture took, and
regardless of whether the user zoomed mid-drag.

**The delta trap.** The correct form is
`screenToWorld(p₂, vp) − screenToWorld(p₁, vp)`. It is **not**
`screenToWorld(p₂ − p₁, vp)`: `screenToWorld` subtracts the viewport translation
before dividing, so applying it to a delta subtracts a translation that should
have cancelled.

**Minimum size** is clamped in world units:

```ts
export const MIN_PANEL_W = 200
export const MIN_PANEL_H = 160
```

`PANEL_W = 720` currently fits 93 columns and `PANEL_H = 460` fits 23 rows (both
observed in `verify:panels` output), so a cell is about 7.7 × 15 world units.
The floor therefore yields roughly 26 columns and 5 rows once the chrome bar is
subtracted — small enough to be useless as a terminal, large enough that xterm
never sees a degenerate grid. Clamping lives in the pure module so the
plain-node suite covers it.

## Pointer correction

```ts
/**
 * The two fields of a DOMRect this module needs. Declared structurally rather
 * than importing `DOMRect`, so the module has no DOM dependency and runs under
 * plain node in verify:viewport.
 */
export interface RectOrigin {
  left: number
  top: number
}

/** Rewrite a screen point so `clientX - rect.left` becomes a CSS-pixel offset. */
export function correctForScale(client: Point, rect: RectOrigin, scale: number): Point {
  return {
    x: rect.left + (client.x - rect.left) / scale,
    y: rect.top + (client.y - rect.top) / scale
  }
}
```

`xterm-pointer.ts` installs a `document`-level listener in the **capture** phase
for `mousedown`, `mousemove`, and `mouseup`. When the target is inside a
`.panel__slot` and `scale !== 1`, it calls `stopImmediatePropagation()` on the
original and dispatches a synthetic `MouseEvent` at the same target with
corrected `clientX`/`clientY`.

Document-level and capture-phase are both forced by xterm binding its drag
listeners to `document`.

Three details that fail silently when missed:

- **Recursion guard.** The synthetic event re-enters the same capture listener.
  A `WeakSet` of events we created is the marker.
- **`detail` must be carried.** It is the click count; dropping it breaks
  double-click word-select and triple-click line-select with no error.
- **`buttons` must be carried**, or xterm cannot distinguish a drag from a hover.

At `scale === 1` the interceptor short-circuits and xterm receives the original
untouched event, so the common case pays nothing.

### Rejected alternatives

**An overlay hit-catcher driving xterm's public API** — a transparent layer
converting to buffer coordinates with our own math, calling `term.select()` and
writing mouse-report sequences directly. Rejected: it re-implements
word-select, line-select, alt-block-select, and three mouse-reporting protocols
— precisely the behaviours xterm is being paid to own.

**CSS `zoom` instead of `transform: scale()`** — tempting, because `zoom` is
reflected consistently in both `getComputedStyle` and `getBoundingClientRect`,
which makes the bug vanish with no interception at all. Rejected: that
consistency is the problem. `zoom` participates in layout, so `FitAddon` would
see a different element size at every zoom level and recompute `cols`/`rows`,
reflowing every running shell on every pinch. It is the failure that "One
transform, not N layouts" exists to prevent, arriving through a different door.

## Input routing

One decision tree on mousedown, evaluated top-down; each branch stops
propagation.

| Target | Action |
|---|---|
| resize handle (`e` / `s` / `se`) | begin resize drag |
| close button | close (see below) |
| chrome bar | select, raise, begin move drag |
| panel body | select, focus; falls through to xterm, corrected |
| background | clear selection and focus (unchanged from M3) |

**A drag's lifetime.** Mousedown captures `DragState` and attaches
`mousemove`/`mouseup` to `document` — for the same reason xterm does, since the
cursor leaves the panel constantly during a drag. Each move calls
`applyDrag(state, screenToWorld(cursor, viewport))` and writes the result via
`setPanels`. Mouseup detaches the listeners and, **for a resize only**, refits
the terminal and sends one `pty:resize`.

That commit-on-release is why move and resize are separate modes rather than one
transform gesture: a move changes no terminal dimension and needs no commit at
all.

**Resize commits on release, not during.** A full-screen agent TUI repaints its
entire frame on every SIGWINCH. Resizing live would mean roughly sixty full
repaints a second, through a 16ms-batched IPC channel, at intermediate sizes the
user never intended to keep, on a process that may be mid-inference. The panel
box follows the cursor during the drag; the text reflows when the button is
released.

**Z-order: selecting raises, via a `z` field — not by reordering the array.**
`Panel` gains `z: number`; raising sets it above the current maximum. The panel
array stays in stable creation order and is rendered in that order with
`style.zIndex = panel.z`.

Reordering the array is the obvious implementation and is **rejected**: React
reconciles a reordered keyed list by moving DOM nodes, and moving a node is
remove-then-insert, which momentarily detaches the subtree containing a live
terminal's host and its WebGL context. M3's whole eviction design rests on
`verify:xterm`'s finding that detaching is survivable — but survivable there
means "we detach deliberately, dispose the addon, and call `term.refresh()` on
the way back." An incidental detach triggered by a click on an unrelated panel
does none of that. Keeping array order stable means React never moves those
nodes at all, and the risk does not exist rather than being handled.

Because paint order is now `z` rather than array position, hit-testing must
follow. `hitTest` is unchanged — it already iterates in reverse and returns the
last match — so `Canvas` sorts by `z` ascending before passing rects in:

```ts
const hitOrder = useMemo(
  () => [...panels].sort((a, b) => a.z - b.z).map((p) => p.rect),
  [panels]
)
```

Paint order and pick order stay consistent, and `viewport.ts` needs no change.

**Wheel ownership: focus decides.** A wheel over the *focused* panel scrolls
that terminal; every other wheel pans or zooms the canvas. `Cmd`-wheel is always
canvas zoom, so a pinch is never captured by a terminal.

This settles a pre-existing defect. `useViewport`'s wheel listener is attached
to the canvas host and pans or zooms unconditionally, never asking whether the
event originated inside a terminal, while xterm's own wheel handler is bound to
its element and bubbles to that same host. Inside M3's interaction band, one
wheel gesture over a live panel scrolls the terminal's scrollback *and* pans the
canvas. Outside the band `pointer-events: none` masks it, which is why it has not
been obvious. Removing the gate would expose it at every zoom.

## Closing a panel

Closing requires a second legitimate `pty.kill` caller. M3's invariant reads:

> `pty.kill` is called in exactly one place in the renderer: `disposeAll`.

Close breaks it, and should — a closed panel's process must die. The registry
gains `dispose(id)`, and the invariant is **rewritten rather than quietly
violated**:

> `pty.kill` is called in exactly two places in the renderer: `disposeAll`
> (renderer teardown) and `dispose(id)` (explicit close).
> **Tiering never calls either.**

The distinction that mattered is preserved. The danger was never that `kill` is
called; it was that `kill` is reachable from a tier change.

**Confirmation is inline, not a dialog.** A running panel's close button becomes
a "kill?" affordance for `CONFIRM_CLOSE_MS = 3000`, after which it reverts to a
plain close button, rather than opening a modal. No new IPC
channel, no `dialog.showMessageBox`, no blocking `window.confirm` — and the
integration suite can drive it with two synthetic clicks and read the result,
which a native modal makes genuinely hard. Idle and exited panels close on the
first click, distinguished by `PanelSession.status`, which already tracks
exactly that.

## Error handling and edge cases

| Case | Behaviour |
|---|---|
| Zoom changes mid-drag | Correct by construction: `applyDrag` recomputes from `originRect` and the live viewport. |
| Resize below a usable grid | Clamped to `MIN_PANEL_W` / `MIN_PANEL_H` inside the pure module. |
| Panel dragged while its session is carded | Supported. Geometry lives in `Panel`, not `PanelSession`. |
| Close during an in-flight drag | Drag state is keyed by `panelId`; a missing panel ends the gesture on the next move. |
| Resize a panel whose PTY has exited | Refit happens; `pty:resize` is skipped, since `status.kind === 'exited'` means there is nothing to signal. |
| `scale === 1` exactly | Interceptor short-circuits; xterm receives the original event. |

## Testing

No new IPC channels: `pty:resize` and `pty:kill` are already in the contract, so
`verify:ipc` is unchanged.

**`verify:viewport` (plain node), appended as checks 26+:**

- move at scale 1 — rect translates by the cursor's world delta
- move at scale 0.5 and at 2 — the same gesture covers the correct world
  distance at both; this is the delta trap
- zoom changed mid-drag — the final rect matches the cursor, not the frames
- resize `e`, `s`, `se` — only the intended dimensions change; `x`/`y` never move
- min-size clamp — a resize past the floor stops at the floor and does not invert
- `correctForScale` at scale 1 — returns the point unchanged
- `correctForScale` at scale 2 — the offset from `rect.left` halves while
  `rect.left` is preserved

The zoom-changed-mid-drag check is the one to write first. It is the property
distinguishing the origin-based design from the accumulate-deltas design, and it
passes trivially under a naive implementation tested only at a fixed scale.

**`verify:panels` (real Electron):**

- **Correction, while the gate still exists.** Write known text, zoom to 0.5,
  double-click a word at a known cell, read `getSelection()` back.
- Drag by chrome at a non-1 scale moves the rect by the world delta.
- Resize commits once: `cols`/`rows` unchanged during the drag, changed after
  mouseup.
- Wheel ownership: over the focused panel the canvas transform is unchanged;
  over an unfocused panel it pans.
- Close, idle: one click removes the panel.
- Close, running: the first click arms, the second kills; `pty.list()` loses
  exactly that pid.
- **The negative check:** demote a panel to `card`, close a *different* panel,
  and assert via `pty.list()` that the demoted panel's pid survives. This
  extends M3's check 4 across the new `dispose(id)` path.
- Raise: clicking a panel underneath another brings it to front.

### Two checks are ordering-sensitive

Both guard deletions rather than additions, and both have a window exactly one
commit wide:

1. The **correction check must pass before `.panel__slot--blocked` is deleted.**
   That class is what currently makes a mis-hit impossible; removing it first
   makes the failure silent.
2. The **close-doesn't-kill-neighbours check must exist before `dispose(id)`
   does.**

An implementation plan that does not order these steps explicitly will land them
on the wrong side.

## Forward notes for M4b / M4c

- `panels.ts` becomes the serialisation boundary. Once `Panel` is mutable, M4b
  writes that array to disk and reads it back; nothing else needs to know.
- `dispose(id)` is the operation M4c has to reconsider. Under tmux, "close the
  panel" and "kill the session" stop being the same statement, exactly as
  "unmount the component" and "close the panel" stopped being the same in M3.
- The corrected pointer path is what a future minimap or a fit-to-selection
  gesture would reuse; it is the second consumer of `screenToWorld` on panel
  geometry, after `hitTest`.
