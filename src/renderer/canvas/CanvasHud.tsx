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
