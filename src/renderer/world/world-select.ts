import { useSyncExternalStore } from 'react'

/**
 * The robot a person has picked in the room (M422): a click on a robot picks
 * it, a click on empty floor (or Escape in the field) lets it go. Its card is
 * always full, a ring marks it on the floor, the "Ask" field is addressed to
 * it, and the board shows its task.
 *
 * A module store, not React state in WorldView, because three readers sit in
 * different trees: the scene (the ring, the card), the DOM chrome (the ask
 * field's addressee) and the props (the board). Never persisted: a room
 * reopened later is a fresh look, and a stale pick would address a message to
 * an agent the person is no longer thinking about.
 */

let selected: string | null = null
const listeners = new Set<() => void>()

export function selectAgent(agentId: string | null): void {
  if (agentId === selected) return
  selected = agentId
  for (const l of listeners) l()
}

export function selectedAgent(): string | null {
  return selected
}

export function useSelectedAgent(): string | null {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l) } },
    selectedAgent,
    selectedAgent
  )
}

/**
 * Who a message from the room goes to: the picked agent when it can take one,
 * else the only live agent that can, else nobody (the field then asks for a
 * pick). Pure, so the rule is checked without a room.
 */
export function askTarget(selectedId: string | null, live: readonly string[], canSend: (id: string) => boolean): string | null {
  if (selectedId !== null && live.includes(selectedId) && canSend(selectedId)) return selectedId
  const able = live.filter(canSend)
  return able.length === 1 ? able[0]! : null
}

/** A pointer that moved further than this between down and up was an orbit, not a click. */
export const CLICK_SLOP_PX = 5

/** M426: what following a teammate points the camera at — the agent they are on when it is in this room, else nothing (they are elsewhere, or gone). */
export function peerFollowTarget(peer: { panelId: string | null } | undefined, inRoom: readonly string[]): string | null {
  const id = peer?.panelId ?? null
  return id !== null && inRoom.includes(id) ? id : null
}
