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
