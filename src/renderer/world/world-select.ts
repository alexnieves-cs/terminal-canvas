import { useSyncExternalStore } from 'react'
import type { WorldAgentFacts } from './world-context-store'

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

function notify(): void {
  for (const l of listeners) l()
}

export function selectAgent(agentId: string | null): void {
  if (agentId === selected) {
    // Letting the pick go also leaves the close-up. A second null is not a change.
    if (agentId === null && focused !== null) {
      focused = null
      notify()
    }
    return
  }
  selected = agentId
  if (agentId === null) focused = null
  notify()
}

export function selectedAgent(): string | null {
  return selected
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function useSelectedAgent(): string | null {
  return useSyncExternalStore(subscribe, selectedAgent, selectedAgent)
}

/**
 * The close-up (M452). A pick is the robot the room is addressing; a focus is
 * that robot with the camera in and the sheet open. They share one store so
 * the scene, the chrome and the sheet cannot disagree, and neither is
 * persisted — a reopened room is a fresh look, same as the pick.
 */
let focused: string | null = null

export function focusedAgent(): string | null {
  return focused
}

/** Select this robot and mark it followed. A repeat is not a notification. */
export function engageFocus(agentId: string): void {
  if (selected === agentId && focused === agentId) return
  selected = agentId
  focused = agentId
  notify()
}

/** Step back out of the close-up: no robot picked, no sheet. */
export function clearFocus(): void {
  if (selected === null && focused === null) return
  selected = null
  focused = null
  notify()
}

export function useFocusedAgent(): string | null {
  return useSyncExternalStore(subscribe, focusedAgent, focusedAgent)
}

/** The sheet's width. The W4 span writes the same number; a second copy in a component would drift. */
export const FOCUS_SHEET_PX = 400

/** Why a plain shell's composer is closed. The brief's sentence, one place. */
export const SHELL_REPLY_REASON = 'answer in its terminal'

export type ReplyRoute = 'send' | 'paste' | 'shell'

/**
 * Who a reply can reach. A chat takes `agent:send`. An agent terminal takes
 * paste and then an explicit submit. A plain shell takes neither — typing
 * into one from across the room is how a stray Enter runs a command.
 */
export function replyRoute(input: { canSend: boolean; agentTerminal: boolean }): ReplyRoute {
  if (input.canSend) return 'send'
  if (input.agentTerminal) return 'paste'
  return 'shell'
}

/** The composer. Paste stays closed until a door is registered (R-071); a shell is always closed. */
export function replyControl(route: ReplyRoute, pasteDoor: boolean): { enabled: boolean; reason: string | null } {
  if (route === 'send') return { enabled: true, reason: null }
  if (route === 'paste' && pasteDoor) return { enabled: true, reason: null }
  return { enabled: false, reason: SHELL_REPLY_REASON }
}

/** Which control is filled. A pending request owns the primary; otherwise Open in Canvas does, so the surface still has one. */
export function focusPrimary(pending: boolean): 'approve' | 'open' {
  return pending ? 'approve' : 'open'
}

export interface FocusPreview {
  agentId: string
  question: string
  diff: string
  requestId: string
  taskTitle: string
  steps: readonly FocusStep[]
  facts?: WorldAgentFacts
}

export interface FocusStep {
  id: string
  title: string
  word: string
  tone: string
}

/** What the sheet says the agent asked, and the request id Approve answers. */
export interface FocusQuestion {
  question: string
  diff: string
  requestId: string | null
}

/**
 * The shot may publish a preview for one robot (the steward cast has a world
 * status and no chat approval). A real approval wins for every other robot.
 * Absent description falls through to the argument, then to the ask line.
 */
export function focusQuestion(
  preview: FocusPreview | null,
  agentId: string,
  approval: { argument: string; description?: string; requestId: string } | undefined,
  ask: string | null
): FocusQuestion {
  if (preview !== null && preview.agentId === agentId) {
    return { question: preview.question, diff: preview.diff, requestId: preview.requestId === '' ? null : preview.requestId }
  }
  if (approval !== undefined) {
    return { question: approval.description ?? approval.argument, diff: approval.argument, requestId: approval.requestId }
  }
  return { question: ask ?? '', diff: '', requestId: null }
}

/** Folded diff: the first lines. Full diff is the argument unchanged. */
export function diffPreview(text: string, full: boolean): string {
  if (full) return text
  const lines = text.split('\n')
  if (lines.length <= 8) return text
  return lines.slice(0, 8).join('\n')
}

/** World, the task, the agent. A blank task is the room, not an empty crumb. */
export function focusCrumb(taskTitle: string | null, agentName: string): readonly [string, string, string] {
  const task = taskTitle?.trim()
  return ['World', task === undefined || task === '' ? 'Room' : task, agentName]
}

/** Plan steps for the sheet. The preview replaces the task's steps for that robot only. */
export function focusSteps(preview: FocusPreview | null, agentId: string, steps: readonly FocusStep[]): readonly FocusStep[] {
  if (preview !== null && preview.agentId === agentId) return preview.steps
  return steps
}

let preview: FocusPreview | null = null

export function setFocusPreview(next: FocusPreview | null): void {
  preview = next
  notify()
}

export function focusPreview(): FocusPreview | null {
  return preview
}

export function useFocusPreview(): FocusPreview | null {
  return useSyncExternalStore(subscribe, focusPreview, focusPreview)
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
