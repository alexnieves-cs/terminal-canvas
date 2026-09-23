import { useEffect, useRef, useState } from 'react'
import type { RailAttention } from './rail-sections'
import { needsYouCount, needsYouNamed } from '@shared/attention-words'

/**
 * M256 (spec §19). A polite live region's TEXT, for the panels that just
 * started wanting a person — not the dock badge's count (aria-live already,
 * but a NUMBER changing tells a screen reader nothing about which panel or
 * what changed) and not every attention row on every render (a live region
 * that repeats itself on each poll is noise a screen reader user learns to
 * tune out, which defeats the point the next time it says something that
 * matters).
 *
 * Only NEWLY arrived ids are announced, one sentence per tick, oldest first —
 * the same reason a toast queue never overlaps two messages. An id that
 * leaves the list (answered, gone to the panel, panel closed) says nothing:
 * silence on resolution is the normal case and does not need a live region
 * to state it.
 */
export function useAttentionAnnouncer(rows: readonly RailAttention[]): string {
  const seenRef = useRef<Set<string>>(new Set())
  const [message, setMessage] = useState('')

  useEffect(() => {
    const seen = seenRef.current
    const arrived = rows.filter((r) => !seen.has(r.id))
    seenRef.current = new Set(rows.map((r) => r.id))
    if (arrived.length === 0) return
    setMessage(arrived.length === 1
      ? needsYouNamed(arrived[0].label)
      : `${needsYouCount(arrived.length)}: ${arrived.map((r) => r.label).join(', ')}`)
  }, [rows])

  return message
}
