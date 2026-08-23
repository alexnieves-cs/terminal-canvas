import { memo, type JSX } from 'react'
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
function PlaceholderPanelImpl({ rect, selected }: PlaceholderPanelProps): JSX.Element {
  return (
    <div
      className={`placeholder-panel${selected ? ' placeholder-panel--selected' : ''}`}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    >
      <span className="placeholder-panel__label">{rect.id}</span>
    </div>
  )
}

// Memoized so a parent re-render (e.g. Canvas's cursor state on every
// mousemove) does not cascade into every panel. Harmless for these dumb
// divs, but M3 replaces them with xterm-hosting panels backed by WebGL
// contexts, where a 60Hz re-render cascade becomes a frame-rate cliff.
// Props are already stable (a module-constant rect plus a boolean), so the
// default shallow comparison is sound.
export const PlaceholderPanel = memo(PlaceholderPanelImpl)
