import type { JSX } from 'react'

export type HintId = 'pan' | 'zoom' | 'palette' | 'new-panel'
export const HINTS: ReadonlyArray<{ id: HintId; text: string }> = [
  { id: 'pan', text: 'two-finger drag pans' },
  { id: 'zoom', text: 'pinch or ⌘= zooms' },
  { id: 'palette', text: '⌘K opens the palette' },
  { id: 'new-panel', text: '⌘N starts a panel' }
]

/**
 * M48. Four gesture hints, bottom-centre, each fading PERMANENTLY the first
 * time its gesture is used — persisted in `hints.seen`, so a hint that has
 * done its job does not come back on the next launch. A hint that returns on
 * every launch is nagging; one that never appears is a README. Canvas decides
 * when a gesture has been seen (the camera moved, the scale moved, the
 * palette opened, a panel was minted) and writes the list; this renders
 * whatever is left.
 */
export function HintStrip({ seen }: { seen: ReadonlySet<string> }): JSX.Element | null {
  const left = HINTS.filter((h) => !seen.has(h.id))
  if (left.length === 0) return null
  return (
    <div className="hint-strip" data-hint-strip aria-label="Gesture hints">
      {left.map((h) => (
        <span key={h.id} className="hint-strip__hint" data-hint={h.id}>{h.text}</span>
      ))}
      {/* M66. The rule, said once: hints vanished with nothing saying why. */}
      <span className="hint-strip__rule" data-hint-rule>hints fade once you have used them</span>
    </div>
  )
}
