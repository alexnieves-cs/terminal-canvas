import { useSyncExternalStore, type JSX } from 'react'
import { shortcutById } from '@shared/shortcuts'
import { attentionSnapshot, isSnoozed, queueStrip, subscribeFlight } from './world-flight'

/**
 * "NEEDS YOU · 2 of 3" (M453). The chips are the published queue: done,
 * the one the camera is on, and what ⌘J reaches next. Chords come from the
 * registry, so a renamed jump key cannot leave a second spelling here.
 */
export function WorldQueueStrip(): JSX.Element | null {
  const snap = useSyncExternalStore(subscribeFlight, attentionSnapshot, attentionSnapshot)
  const now = Date.now()
  const ids = snap.items.filter((item) => !isSnoozed(item.panelId, now)).map((item) => item.panelId)
  const strip = queueStrip(ids, snap.cursor)
  if (strip.total === 0) return null
  const jump = shortcutById('jump')?.chord
  const prev = shortcutById('jump-prev')?.chord
  return (
    <nav className="world-queue" data-world-queue aria-label="Needs you">
      <span className="world-queue__count">{strip.headline}</span>
      <span className="world-queue__chips" aria-hidden="true">
        {strip.chips.map((place, index) => (
          <span
            key={ids[index] ?? index}
            className="world-queue__chip"
            data-place={place}
            data-tone={place === 'done' ? 'done' : place === 'current' ? 'needs-you' : undefined}
          >
            {place === 'done' ? (
              <svg viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2.5 6.2 4.8 8.5 9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : null}
          </span>
        ))}
      </span>
      {jump !== undefined && jump !== '' ? <kbd>{jump}</kbd> : null}
      {prev !== undefined && prev !== '' ? <kbd>{prev}</kbd> : null}
    </nav>
  )
}
