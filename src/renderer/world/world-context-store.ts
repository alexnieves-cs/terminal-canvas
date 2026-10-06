import { useSyncExternalStore } from 'react'
import type { CapHold } from '@shared/agent-session'
import type { DiscardOffer } from './world-flight'
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

/**
 * M428. The work's own facts about ONE agent — what the canvas's chat store
 * and panel records know and the feed never says: the model and backend, what
 * it has spent and how full its context is (main's `NodeMeter`), a cap's HOLD,
 * the branch it works on, the teammate it acts as, and how many messages wait
 * behind its turn. Shaped by `agentFacts` (world-facts.ts) at the precision the
 * card SAYS them — cents, whole percent — so `publishWorldContext`'s by-value
 * dedupe drops a meter tick nobody could see.
 *
 * Every field is optional and absent means NOTHING KNOWS: no `0` is backfilled,
 * so a card can never say "$0.00" or "0 queued" about an agent nobody measured
 * (the inspector's "not reported yet is never $0.00" rule). They are PRESENT-DAY
 * values: the past room (a replay) hides them rather than show today's spend
 * as if it were then.
 *
 * Not on `AgentEvent`: the feed's contract is a view-level summary folded by
 * one reducer, and these are canvas-owned state with their own author (the
 * header's rule for this whole store).
 */
export interface WorldAgentFacts {
  /** The model the session reported (`AgentSessionSnapshot.model`). */
  model?: string
  /** The backend's label (`BACKENDS[…].label`) — only when it is not the default, which every agent would otherwise repeat. */
  backend?: string
  /** Dollars across every process this agent ran, to the cent; absent until priced, and while it rounds to nothing. */
  spentUsd?: number
  /** The spend cap in force on it, when one is. */
  capUsd?: number
  /** Whole percent of the context window used (`contextUsedPct`); only when the window AND the context are measured. */
  contextPct?: number
  /** Thousands of tokens in the conversation and its cap — only while a context cap is in force and no window is known. */
  contextK?: number
  capContextK?: number
  /** Main is holding this agent at a cap: the room's blocker for it. */
  held?: CapHold
  /** The worktree branch it runs in. */
  branch?: string
  /** The teammate it acts as, by display name. */
  owner?: string
  /** Messages waiting behind its turn; absent at 0. */
  queued?: number
}

export interface WorldContext {
  tasks: readonly WorldTask[]
  approvals: readonly WorldApproval[]
  handoffs: readonly WorldHandoff[]
  peers: readonly WorldPeer[]
  /** M428. By agent (= panel) id; an agent nothing knows anything about has no entry. */
  facts: Readonly<Record<string, WorldAgentFacts>>
}

export const EMPTY_CONTEXT: WorldContext = { tasks: [], approvals: [], handoffs: [], peers: [], facts: {} }

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
  /**
   * A pending request, answered through the chat card's own door.
   * On allow, the discard a live review can run for this panel, or null
   * when Undo would not be a real revert. Deny returns null.
   */
  answer(agentId: string, requestId: string, allow: boolean): DiscardOffer | null
  /** A person's words to a running agent — the composer's send. */
  send(agentId: string, text: string): Promise<SendOutcome>
  /** Leave the room and land on the agent's panel (or its request). */
  open(agentId: string): void
  /** Whether a message can be sent to this agent from the room (a chat agent, not a terminal). */
  canSend(agentId: string): boolean
  /** R-071. A terminal that is an agent, so a reply may be pasted and submitted. A plain shell is not. */
  agentTerminal(agentId: string): boolean
  /** Paste into that agent's terminal and submit once. A plain shell is refused. */
  pasteReply(agentId: string, text: string): Promise<SendOutcome>
  /**
   * M429. Whether `open` has a panel to land on: one on this canvas, or in
   * another workspace the jump can switch to. The simulator's agents and a
   * teammate's agent on someone else's canvas have none — `open` would close
   * the room and land nowhere — so the room offers no way there.
   */
  canOpen(agentId: string): boolean
  /**
   * M432. Leave the room for Orchestrate with this agent selected there — the
   * same carry a canvas selection gets on the canvas → Orchestrate switch, so
   * the page opens on its task's island and session.
   */
  orchestrate(agentId: string): void
  /** M432. Whether Orchestrate has a row for it: a panel on THIS canvas (another workspace's, or the simulator's, has none). */
  canOrchestrate(agentId: string): boolean
}

let actions: WorldActions | null = null
const actionListeners = new Set<() => void>()

/**
 * R-051. A terrace drag's one commit. The scene cannot import `moveRegion`
 * (`world.ctx.door.1`); Canvas registers the mover, and the drag calls it
 * once on release. Null is a drag that moved no member — no history entry.
 */
export interface RegionMoveCommit {
  ids: readonly string[]
}

type RegionMover = (regionId: string, dx: number, dy: number) => RegionMoveCommit | null

let regionMover: RegionMover | null = null

export function setRegionMover(next: RegionMover | null): void {
  regionMover = next
}

export function commitRegionMove(regionId: string, dx: number, dy: number): RegionMoveCommit | null {
  return regionMover?.(regionId, dx, dy) ?? null
}

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
