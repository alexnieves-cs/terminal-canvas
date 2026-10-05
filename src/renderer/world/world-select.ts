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

// ── from a robot to its panel (M429) ────────────────────────────────────────

/**
 * The second click of a double-click. The first click picks the robot; the
 * second must NOT toggle that pick off again (a picked robot's click lets it
 * go), or every double-click would flash the card full, drop it, and then
 * leave the room. `detail` is the browser's own click count.
 */
export function isRepeatClick(detail: number): boolean {
  return detail >= 2
}

/** The hint a robot (its hover tooltip, its tag's label) and the card's Open button give for the way to its panel. Short: it sits on a tooltip. */
export const OPEN_HINT = 'Double-click, or pick and press Enter, to open its panel'

/**
 * Whether the room may take a person from this robot to its panel — the ONE
 * gate the double-click, Enter and the card's Open button all ask. A door
 * Canvas registered, a panel to land on (`canOpen`: the simulator's agents and
 * a teammate's agent on another canvas have none, and the jump would close the
 * room and land nowhere), and the LIVE room: the past room's robots are what
 * the room showed then, which is why its request card has no verbs either.
 */
export function openableFrom(agentId: string | null, past: boolean, actions: { canOpen(agentId: string): boolean } | null): agentId is string {
  return agentId !== null && !past && actions !== null && actions.canOpen(agentId)
}

/**
 * Where a key belongs to something else and the room must not act on it: a
 * field (the Ask pill is an input — Enter there sends), and an open menu,
 * dialog or listbox (Enter there chooses). Shared by WorldStage's Escape and
 * WorldChrome's Enter, so the two keys cannot disagree about what owns them.
 */
export const FIELD_SELECTOR = 'input, textarea, select, [contenteditable="true"]'
export const OVERLAY_SELECTOR = '[role="menu"]:not([hidden]), [role="dialog"], [role="listbox"]'
/** A control's own Enter is its activation: a focused button pressed with Enter is that button, never "open the picked robot". */
export const CONTROL_SELECTOR = 'button, a[href], [role="button"], summary'

export interface EnterFacts {
  key: string
  repeat: boolean
  /** Any of ⌘, ⌃, ⌥ or ⇧ held: a chord is somebody else's. */
  modified: boolean
  /** An IME is composing: its Enter commits the composition. */
  composing: boolean
  inField: boolean
  onControl: boolean
  overlayOpen: boolean
}

/** Whether a keydown is the room's Enter — open the picked robot's panel. Pure, so the guard is checked without a window. */
export function enterOpens(k: EnterFacts): boolean {
  return k.key === 'Enter' && !k.repeat && !k.modified && !k.composing && !k.inField && !k.onControl && !k.overlayOpen
}

// ── arriving from Orchestrate (M432) ────────────────────────────────────────

/**
 * A look at some agents, asked for from OUTSIDE the room — Orchestrate's
 * "View in World" on a task's plate, which turns the room on in the same
 * press. The room cannot take it then: the scene is a lazy chunk that has not
 * mounted, and a camera glide asked for mid-transition is dropped (a glide
 * belongs to the resting view, WorldView's TransitionRig). So it waits here,
 * and the rig takes it on the first frame the room is at rest.
 *
 * A list, not one id: a task's members are named in the order the task gives
 * them, and the first may not be in the room (a terminal with no agent, one
 * that has gone idle and sunk). Never persisted. Cleared when taken, or once
 * `ARRIVAL_GRACE_MS` has passed with none of it in the room: the feed says
 * every agent again when the room opens, so a member may arrive a beat after
 * the room settles — but a stale request would yank the camera the next time
 * the room opened for some other reason.
 */
export const ARRIVAL_GRACE_MS = 4000

let arrival: { ids: readonly string[]; at: number } | null = null

export function requestArrival(agentIds: readonly string[], now: number): void {
  arrival = agentIds.length === 0 ? null : { ids: agentIds, at: now }
}

/** The pending request, taken: the first of its ids `inRoom` accepts, or null — kept for a later frame while it is young. */
export function takeArrival(inRoom: (agentId: string) => boolean, now: number): string | null {
  if (arrival === null) return null
  const id = arrivalTarget(arrival.ids, inRoom)
  if (id !== null || now - arrival.at > ARRIVAL_GRACE_MS) arrival = null
  return id
}

/** Whether a request is waiting — the rig asks before it builds anything. */
export function hasArrival(): boolean {
  return arrival !== null
}

/** Pure: which of a task's members the room frames — the first one standing in it. */
export function arrivalTarget(ids: readonly string[], inRoom: (agentId: string) => boolean): string | null {
  return ids.find(inRoom) ?? null
}
