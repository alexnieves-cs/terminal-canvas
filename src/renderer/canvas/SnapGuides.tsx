import type { JSX } from 'react'
import type { SnapGuide } from './placement'
import type { SpacingGuide } from './arrange'

/**
 * M50. The alignment guides a snap draws, INSIDE .world like the link layer,
 * so they ride the one transform and need no per-frame re-derivation. World
 * coordinates: a vertical guide is a 1px column at `at` spanning `from`→`to`.
 * pointer-events: none — a guide is never a target — and present only while
 * a drag is snapping (Canvas clears them on commit).
 *
 * M390. And the SPACING guides (arrange.ts `smartSnap`): when a drag lands on
 * an equal gap, every gap of that size in the row lights as a measured span
 * with its distance — the reason the object stopped there, shown while it
 * matters and gone on release. The number is world units, a transient
 * readout of a drag, never a resting fact.
 */
export function SnapGuides({ guides, spacing = [] }: { guides: readonly SnapGuide[]; spacing?: readonly SpacingGuide[] }): JSX.Element | null {
  if (guides.length === 0 && spacing.length === 0) return null
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
      {spacing.flatMap((s, i) => s.segments.map((seg, j) => (
        <div
          key={`sp-${s.axis}-${i}-${j}`}
          className={`snap-space snap-space--${s.axis}`}
          data-snap-spacing={s.gap}
          style={s.axis === 'x'
            ? { left: seg.from, top: seg.at, width: seg.to - seg.from }
            : { top: seg.from, left: seg.at, height: seg.to - seg.from }}
        >
          <span className="snap-space__gap">{s.gap}</span>
        </div>
      )))}
    </div>
  )
}
