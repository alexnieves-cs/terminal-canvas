import { useEffect, useSyncExternalStore } from 'react'
import type { PanelId } from '@shared/types'

/**
 * M39. The durable log's tail for a DORMANT panel's card, fetched from main
 * once per panel and held here — a module-level store subscribed per panel
 * id, like every store beside it, and for the same rule: it never bumps
 * registry.version(). A card asking for its tail must re-render that card
 * and nothing else.
 *
 * Only a dormant, never-spawned panel reads this. A spawned panel's card
 * reads its own xterm buffer (`handle.tail`), which is the live truth; the
 * log is for the panel that has no buffer yet — every panel on the canvas
 * the moment the app relaunches.
 *
 * `undefined` means "not asked yet or not answered yet"; `[]` means main
 * answered nothing (no log, or persistence off). The card treats both as
 * "show what it showed before M39", so an unanswered tail never flashes an
 * empty block.
 */
const tails = new Map<PanelId, string[]>()
const inflight = new Set<PanelId>()
const listeners = new Map<PanelId, Set<() => void>>()

/** How many lines a card shows. Mirrors TerminalPanel's CARD_LINES. */
export const TAIL_LINES = 6

function notify(panelId: PanelId): void {
  const set = listeners.get(panelId)
  if (!set) return
  for (const listener of set) listener()
}

export function clearScrollbackTail(panelId: PanelId): void {
  inflight.delete(panelId)
  if (!tails.has(panelId)) return
  tails.delete(panelId)
  notify(panelId)
}

function subscribe(panelId: PanelId, listener: () => void): () => void {
  let set = listeners.get(panelId)
  if (!set) {
    set = new Set()
    listeners.set(panelId, set)
  }
  set.add(listener)
  return () => {
    set.delete(listener)
    if (set.size === 0) listeners.delete(panelId)
  }
}

/**
 * Ask main once. Idempotent per panel: a card that mounts, unmounts on a
 * tier change and mounts again must not fire a second read while the first
 * is still in flight, and must not re-read an answer it already holds.
 */
function fetchTail(panelId: PanelId): void {
  if (tails.has(panelId) || inflight.has(panelId)) return
  inflight.add(panelId)
  void window.canvas.scrollback.tail({ panelId, lines: TAIL_LINES }).then(
    (lines) => {
      if (!inflight.has(panelId)) return // cleared while in flight: a closed panel
      inflight.delete(panelId)
      tails.set(panelId, lines)
      notify(panelId)
    },
    () => {
      // A rejected invoke reads as "nothing recorded": the card shows what it
      // showed before, rather than an error nobody can act on.
      inflight.delete(panelId)
      tails.set(panelId, [])
      notify(panelId)
    }
  )
}

export function useScrollbackTail(panelId: PanelId, wanted: boolean): string[] | undefined {
  const value = useSyncExternalStore(
    (listener) => subscribe(panelId, listener),
    () => tails.get(panelId),
    () => tails.get(panelId)
  )
  useEffect(() => {
    if (wanted) fetchTail(panelId)
  }, [panelId, wanted])
  return value
}
