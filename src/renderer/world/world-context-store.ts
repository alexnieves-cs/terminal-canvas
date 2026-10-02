import { useSyncExternalStore } from 'react'
import type { PlanStepView } from '@shared/task-plan'
import type { WorkItemState } from '@shared/work-items'

/**
 * What the CANVAS knows about the work that the world feed does not (M421):
 * which task each agent is on and that task's plan, which requests are
 * waiting on a person, which agents hand off to which, and who else is
 * looking. Canvas publishes it (`useWorldContextPublisher`), the room reads it.
 *
 * Why a second store, not more fields on the event store: the event store is
 * a cache of ONE producer (main's feed) folded by a reducer `verify:world`
 * runs; this is a snapshot of state Canvas already owns (`workItems`, the
 * chat store's approvals, panel links, the presence roster) and re-derives on
 * its own beat. Mixing the two would give the reducer a second author.
 *
 * And the ACTIONS: the scene may not touch the bridge (`verify:world
 * world.door.3`), so a button in the room calls a function Canvas registered
 * here — the same `answerRequest` door the chat card uses, the same
 * `agentSession.send` the composer uses, the same jump the rail uses. One door
 * per verb; the room is a fourth caller of each, never a second copy.
 *
 * Published only while the world is up — a closed room has no reader, and
 * Canvas re-deriving tasks for it on every render would be pure cost.
 */

export interface WorldStep {
  id: string
  title: string
  /** `PlanStepView.word` — the plan's own vocabulary. */
  word: string
  tone: PlanStepView['tone']
  owner?: string
}

export interface WorldTask {
  id: string
  title: string
  /** `WorkItemState`: the board's column. */
  state: WorkItemState
  /** Panel ids (= agent ids) on the task, the lane's chat first. */
  members: readonly string[]
  steps: readonly WorldStep[]
}

export interface WorldApproval {
  agentId: string
  requestId: string
  toolName: string
  /** The one argument a person decides on: the command, the path. */
  argument: string
  description?: string
}

export interface WorldHandoff {
  from: string
  to: string
  /** Epoch ms of the last time it fired, if it has. */
  firedAt: number | null
}

export interface WorldPeer {
  /** Stable per teammate. */
  userId: string
  name: string
  initials: string
  color: string
  /** The panel (= agent) they are on, if it is one. */
  panelId: string | null
  /** Their reported view: `world` when they are in the room. */
  mode: string
  active: boolean
}

export interface WorldContext {
  tasks: readonly WorldTask[]
  approvals: readonly WorldApproval[]
  handoffs: readonly WorldHandoff[]
  peers: readonly WorldPeer[]
}

export const EMPTY_CONTEXT: WorldContext = { tasks: [], approvals: [], handoffs: [], peers: [] }

let context: WorldContext = EMPTY_CONTEXT
let key = ''
const listeners = new Set<() => void>()

/**
 * Replaces the snapshot when — and only when — it says something different.
 * Canvas calls this from an effect on its own renders, which are far more
 * frequent than the context changes; comparing by value is what keeps the
 * room from re-rendering on every canvas drag.
 */
export function publishWorldContext(next: WorldContext): void {
  const nextKey = JSON.stringify(next)
  if (nextKey === key) return
  key = nextKey
  context = next
  for (const l of listeners) l()
}

export function getWorldContext(): WorldContext {
  return context
}

export function subscribeWorldContext(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function useWorldContext(): WorldContext {
  return useSyncExternalStore(subscribeWorldContext, getWorldContext, getWorldContext)
}

// ── the actions ─────────────────────────────────────────────────────────────

/** What a send came back as: null when it went, the refusal's sentence when it did not. */
export type SendOutcome = string | null

export interface WorldActions {
  /** A pending request, answered through the chat card's own door. */
  answer(agentId: string, requestId: string, allow: boolean): void
  /** A person's words to a running agent — the composer's send. */
  send(agentId: string, text: string): Promise<SendOutcome>
  /** Leave the room and land on the agent's panel (or its request). */
  open(agentId: string): void
  /** Whether a message can be sent to this agent from the room (a chat agent, not a terminal). */
  canSend(agentId: string): boolean
}

let actions: WorldActions | null = null
const actionListeners = new Set<() => void>()

/** Canvas registers its doors while it is mounted; null takes them away. */
export function setWorldActions(next: WorldActions | null): void {
  actions = next
  for (const l of actionListeners) l()
}

export function worldActions(): WorldActions | null {
  return actions
}

export function useWorldActions(): WorldActions | null {
  return useSyncExternalStore(
    (l) => { actionListeners.add(l); return () => { actionListeners.delete(l) } },
    worldActions,
    worldActions
  )
}
