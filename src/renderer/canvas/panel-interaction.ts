import type { Point, WorldRect } from './viewport'
import { MIN_PANEL_H, MIN_PANEL_W } from '@shared/panel-geometry'

/**
 * Panel geometry under a pointer gesture. Pure, like viewport.ts and lod.ts:
 * no DOM, no React. verify:viewport runs it under plain node.
 */

/**
 * East, south, south-east for a PANEL. Resizing from a north or west edge
 * changes the panel's origin AND its size in one gesture — two coupled changes
 * to verify instead of one — for an affordance a terminal barely needs.
 *
 * M388. A flowchart SHAPE takes all eight: a diagram is sized from whichever
 * side is free, and a person dragging a diamond's west point expects the east
 * point to stay put. The coupled origin/size change is applyDrag's, once.
 */
export type ResizeEdge = 'e' | 's' | 'se' | 'n' | 'w' | 'ne' | 'nw' | 'sw'

/** M388. Whether this edge moves the rect's origin — the half snapping does not yet cover (only growing right/bottom edges snap). */
export function movesOrigin(edge: ResizeEdge): boolean {
  return edge.includes('n') || edge.includes('w')
}

export type DragMode = { kind: 'move' } | { kind: 'resize'; edge: ResizeEdge }

export interface DragState {
  panelId: string
  mode: DragMode
  /** The rect at mousedown. Never mutated for the duration of the gesture. */
  originRect: WorldRect
  /** The world point under the cursor at mousedown. */
  originWorld: Point
  /** M388. The resize floor for THIS object; absent is the panel floor (MIN_PANEL_W/H). A shape passes SHAPE_MIN. */
  min?: { w: number; h: number }
}

/**
 * A floor small enough to be useless as a terminal, large enough that xterm
 * never sees a degenerate grid. At the current metrics (PANEL_W 720 fits 93
 * columns, PANEL_H 460 fits 23 rows, so a cell is about 7.7 x 15 world units)
 * this is roughly 26 columns by 5 rows once the chrome bar is subtracted.
 */
// Re-exported rather than moved outright: applyDrag's callers import them from
// here, and shared/ is where the layout validator needs them.
export { MIN_PANEL_W, MIN_PANEL_H }

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
  const minW = state.min?.w ?? MIN_PANEL_W
  const minH = state.min?.h ?? MIN_PANEL_H
  const growsX = edge.includes('e')
  const growsY = edge.includes('s')
  // M388. A west or north edge moves the origin by the delta and shrinks the
  // size by it; at the floor the FAR edge stays where it was (x = right − w),
  // never the origin — the edge the person is not holding does not move.
  const shrinksX = edge.includes('w')
  const shrinksY = edge.includes('n')
  const w = growsX ? Math.max(minW, r.w + dx) : shrinksX ? Math.max(minW, r.w - dx) : r.w
  const h = growsY ? Math.max(minH, r.h + dy) : shrinksY ? Math.max(minH, r.h - dy) : r.h
  return {
    ...r,
    x: shrinksX ? r.x + r.w - w : r.x,
    y: shrinksY ? r.y + r.h - h : r.y,
    w,
    h
  }
}

/**
 * The shared canvas's interposition point. While the workspace is shared, a
 * gesture WRITES THROUGH to the workspace doc as it happens (main's
 * canvas-sync.ts, over `canvas:op`) rather than only reaching it on the next
 * layout:save — so a teammate sees the panel travel, not jump — and a role
 * that may not arrange never lifts the panel at all.
 *
 * Absent (`null`) on an unshared workspace: every gesture behaves exactly as
 * it always has. Pure, like the rest of this file: the renderer's bridge call
 * is the implementation's business, not the gesture's.
 */
export interface CanvasWriteThrough {
  /** False for a viewer: the gesture does not start. */
  canArrange(panelId: string): boolean
  /** Only the fields that changed since the last write of this gesture. */
  write(panelId: string, fields: Partial<Record<'x' | 'y' | 'w' | 'h', number>>): void
}

/** The fields of `next` that differ from `prev` — what one frame writes through. */
export function changedFields(prev: WorldRect | null, next: WorldRect): Partial<Record<'x' | 'y' | 'w' | 'h', number>> {
  const out: Partial<Record<'x' | 'y' | 'w' | 'h', number>> = {}
  for (const k of ['x', 'y', 'w', 'h'] as const) if (prev === null || prev[k] !== next[k]) out[k] = next[k]
  return out
}

/** The members of a gesture this person may move. A group drag keeps what it may, rather than refusing all. */
export function arrangeable(states: readonly DragState[], through: CanvasWriteThrough | null): DragState[] {
  return through === null ? [...states] : states.filter((s) => through.canArrange(s.panelId))
}

/** One member of a gesture's frame: the rect it implies, and whether the caller still snaps it on its own. */
export interface DragFrameMember {
  state: DragState
  rect: WorldRect
  /** True only for a lone member on a frame that snaps: a group's snap is already in `rect`. */
  snapSelf: boolean
}

/**
 * M395. ONE FRAME OF A PANEL GESTURE, pure — `usePanelDrag`'s arithmetic
 * lifted out so the two rules below are checked without a renderer
 * (`verify:viewport revamp.snap.1`).
 *
 * EVERY MEMBER MOVES BY ONE DELTA. Each rect is `applyDrag` from the member's
 * OWN origin (never the previous frame), and a move of several members takes
 * ONE snap over their bounding rect (M390's `snapMany`), whose shift is added
 * to every member alike. The live audit measured the failure this closes on
 * the build before M390: each member went to the snapper on its own, stopped
 * on a different neighbour, and a three-object selection landed sheared —
 * (237,146) against (243,140) — while with snapping off it moved together.
 *
 * ⌘ HELD IS A FREE FRAME (`free`). The design-tool convention: holding ⌘
 * during a move or a resize takes the snap out of THAT frame, so a deliberate
 * 7px nudge inside the 8px threshold is reachable. Per frame, not per gesture
 * — releasing ⌘ mid-drag snaps again on the next move, as Figma does.
 */
export function dragFrame(
  states: readonly DragState[],
  world: Point,
  opts: { free: boolean; snapMany?: (rects: readonly WorldRect[], ids: ReadonlySet<string>) => { dx: number; dy: number } }
): DragFrameMember[] {
  const together = opts.snapMany !== undefined && states.length > 1 && states.every((m) => m.mode.kind === 'move')
  const raw = states.map((m) => applyDrag(m, world))
  const shift = together && !opts.free && opts.snapMany !== undefined
    ? opts.snapMany(raw, new Set(states.map((m) => m.panelId)))
    : { dx: 0, dy: 0 }
  return states.map((state, i) => {
    const r = raw[i]!
    return {
      state,
      rect: together ? { ...r, x: r.x + shift.dx, y: r.y + shift.dy } : r,
      snapSelf: !together && !opts.free
    }
  })
}
