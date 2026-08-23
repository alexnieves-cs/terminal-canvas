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
