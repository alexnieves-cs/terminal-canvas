import type { JSX } from 'react'
import type { SnapGuide } from './placement'

/**
 * M50. The alignment guides a snap draws, INSIDE .world like the link layer,
 * so they ride the one transform and need no per-frame re-derivation. World
 * coordinates: a vertical guide is a 1px column at `at` spanning `from`→`to`.
 * pointer-events: none — a guide is never a target — and present only while
 * a drag is snapping (Canvas clears them on commit).
 */
export function SnapGuides({ guides }: { guides: readonly SnapGuide[] }): JSX.Element | null {
  if (guides.length === 0) return null
  return (
    <div className="snap-guides" aria-hidden="true">
      {guides.map((g, i) => (
        <div
          key={`${g.axis}-${g.at}-${i}`}
          className={`snap-guide snap-guide--${g.axis}`}
          data-snap-guide={g.axis}
          style={g.axis === 'x'
            ? { left: g.at, top: g.from, height: g.to - g.from }
            : { top: g.at, left: g.from, width: g.to - g.from }}
        />
      ))}
    </div>
  )
}
