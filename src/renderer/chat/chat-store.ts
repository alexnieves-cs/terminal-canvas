import { useSyncExternalStore } from 'react'
import { addTotals } from '@shared/cost'
import type { AgentSessionEvent, AgentSessionSnapshot } from '@shared/agent-session'
import type { TranscriptTurn } from '@shared/transcript'
import type { AutoStatus } from '@shared/auto'
import { approvalAction, toolArgument, type LiveMessage } from './chat-model'
import type { PendingApproval } from '@renderer/shell/rail-sections'

/**
 * M73. The renderer's mirror of each chat panel's session — a module-level
 * store subscribed PER PANEL ID, the shape every store since M12 takes and
 * for the same reason: a delta for c3 must re-render c3's transcript and
 * nothing else, and none of it may ride `registry.version()`.
 *
 * Snapshot objects are CACHED: `getChat` returns the same object until
 * something changes, which is what lets `useSyncExternalStore` and memoised
 * rows do their job. Every mutation replaces the state object whole.
 *
 * Cleared at every panel-removing site through `clearChat`, or the map
 * grows for the life of the renderer and a recycled id inherits a dead
 * panel's transcript — the failure every sibling store names.
 */

export interface ChatState {
  /** Main's snapshot; null until `agent:create` has answered. */
  snapshot: AgentSessionSnapshot | null
  turns: TranscriptTurn[]
  live: LiveMessage | null
  /** `agent:create`'s named refusal, if any — rendered where the composer would be. */
  refusal: string | null
  /** The last recorded accounting for a panel whose session has not run this launch. */
  meta?: { usage: AgentSessionSnapshot['usage']; costUsd?: number; turns: number }
  /**
   * M75. A request from outside the component (the palette's prompt row, a
   * drop on the panel) to put text or an attachment into the composer. A
   * sequence number so an identical request twice is two insertions; the
   * component takes it and clears it.
   */
  /** M98. Tools main answered from a session grant this launch, in order — the quiet row's source. */
  granted?: string[]
  /** Whose agent this is — the `owner` main stamps on every agent event. The colour its activity is drawn in. */
  owner?: string
  insert?: { seq: number; text?: string; /** M205. Hold the keyboard once sending re-enables — asked for explicitly, never implied. */ focus?: true; attach?:{ kind: 'path'; path: string } | { kind: 'data'; mediaType: string; base64: string; name: string } }
  /** M122. Ask the panel to scroll a stored turn into view — a search hit's flight. */
  scrollTo?: { seq: number; turnIndex: number }
  /**
   * M98. The tools main has granted for this session, in grant order. A
   * CACHE of `agent:grants` — main's tracker is the author — refreshed after
   * a scoped answer and a revoke; absent until main has answered once, which
   * the inspector renders as `unknown` rather than `none`.
   */
  grants?: string[]
  /**
   * M290. How the last turn ENDED, this launch: ok, interrupted (a partial
   * answer), an error result, or aborted by main with its reason. Kept so
   * Orchestrate can tell an interrupted run from a stopped session from an
   * idle one — three states that read as one `idle` dot otherwise. Absent
   * until a turn has ended; never persisted.
   */
  lastTurn?: { kind: 'ok' | 'interrupted' | 'error' | 'aborted'; at: number; reason?: string }
}

const states = new Map<string, ChatState>()
const listeners = new Map<string, Set<() => void>>()

const EMPTY: ChatState = Object.freeze({ snapshot: null, turns: [], live: null, refusal: null }) as ChatState

function notify(id: string): void {
  const set = listeners.get(id)
  if (!set) return
  for (const cb of set) cb()
}

/**
 * M105. One version for every chat at once, for the few readers that count
 * ACROSS chats (the dock's capsules) — a primitive, so useSyncExternalStore
 * re-renders only when some chat's state object was replaced.
 */
let chatsVersion = 0
const versionListeners = new Set<() => void>()
export function useChatsVersion(): number {
  return useSyncExternalStore(
    (cb) => { versionListeners.add(cb); return () => { versionListeners.delete(cb) } },
    () => chatsVersion,
    () => chatsVersion
  )
}

function update(id: string, next: ChatState): void {
  states.set(id, next)
  chatsVersion += 1
  notify(id)
  for (const cb of versionListeners) cb()
  syncApprovals()
}

/**
 * M76. EVERY pending permission request across every chat on this renderer,
 * for the surfaces that answer from afar (the popover, the pane, the
 * palette). Rebuilt only when MEMBERSHIP changes — the attention store's own
 * discipline — so a streaming chat, whose state updates at the flush rate,
 * never re-renders the dock. Keyed by panel id + request id; the argument is
 * the transcript's own short form of the tool's input.
 */
let approvalSnapshot: PendingApproval[] = []
let approvalKey = ''
const approvalListeners = new Set<() => void>()
/**
 * #16. Requests a person has ANSWERED on this renderer whose
 * `permission-answered` has not arrived yet, keyed `id/requestId`. Without
 * it each surface cleared on main's round trip, and the three that showed a
 * request (the queue, the chat card, Orchestrate) let a second click land in
 * the gap — main refused it, but the person saw a button that looked live.
 * Marked here, every surface drops the request in the same frame. An entry
 * leaves when main's snapshot no longer holds the request (the normal path)
 * or when the answer failed (`unmarkAnswered`), so the set cannot grow.
 */
const answered = new Set<string>()
// The chat card reads its pending list off its own snapshot, which a mark
// does not replace — so it subscribes through `useApprovals` (whose snapshot
// a mark DOES replace) and filters with `isAnswered`.
export function markAnswered(id: string, requestId: string): void {
  answered.add(`${id}/${requestId}`)
  approvalKey = '\0'
  syncApprovals()
}
export function unmarkAnswered(id: string, requestId: string): void {
  if (!answered.delete(`${id}/${requestId}`)) return
  approvalKey = '\0'
  syncApprovals()
}
/** Whether this request was answered here and main has not confirmed it yet — the chat card's filter. */
export function isAnswered(id: string, requestId: string): boolean {
  return answered.has(`${id}/${requestId}`)
}
function syncApprovals(): void {
  const next: PendingApproval[] = []
  const live = new Set<string>()
  for (const [id, state] of states) {
    for (const p of state.snapshot?.pending ?? []) {
      const key = `${id}/${p.requestId}`
      live.add(key)
      if (answered.has(key)) continue
      const full = approvalAction(p.input)
      next.push({
        id, requestId: p.requestId, toolName: p.toolName, argument: toolArgument(p.input),
        action: full.action, actionIsCode: full.code,
        ...(full.rest === undefined ? {} : { rest: full.rest }),
        ...(p.description === undefined || p.description === '' ? {} : { description: p.description }),
        ...(state.snapshot?.cwd === undefined || state.snapshot.cwd === '' ? {} : { cwd: state.snapshot.cwd })
      })
    }
  }
  for (const k of answered) if (!live.has(k)) answered.delete(k)
  const key = next.map((a) => `${a.id}/${a.requestId}`).join('\n')
  if (key === approvalKey) return
  approvalKey = key
  approvalSnapshot = next
  for (const cb of approvalListeners) cb()
}
export function approvals(): PendingApproval[] {
  return approvalSnapshot
}

/** M98. Main's answer to `agent:grants`, mirrored. A never-seeded id mints nothing (the recycled-id door). */
export function setChatGrants(id: string, grants: readonly string[]): void {
  const prev = states.get(id)
  if (!prev) return
  update(id, { ...prev, grants: [...grants] })
}

/**
 * M99. The models live sessions have REPORTED, first seen first — the spawn
 * sheet's suggestions. Never a vendor list: a fixed list rots the day a
 * model ships (`MODEL_PATTERN`'s own argument), and what a session reported
 * is a model that exists.
 */
export function reportedModels(): string[] {
  const out: string[] = []
  for (const state of states.values()) {
    const model = state.snapshot?.model
    if (model !== undefined && !out.includes(model)) out.push(model)
  }
  return out
}
export function useApprovals(): PendingApproval[] {
  return useSyncExternalStore(
    (cb) => { approvalListeners.add(cb); return () => { approvalListeners.delete(cb) } },
    () => approvalSnapshot,
    () => approvalSnapshot
  )
}

export function getChat(id: string): ChatState {
  return states.get(id) ?? EMPTY
}

export function subscribeChat(id: string, cb: () => void): () => void {
  let set = listeners.get(id)
  if (!set) {
    set = new Set()
    listeners.set(id, set)
  }
  set.add(cb)
  return () => {
    set?.delete(cb)
    if (set && set.size === 0) listeners.delete(id)
  }
}

export function useChat(id: string): ChatState {
  return useSyncExternalStore((cb) => subscribeChat(id, cb), () => getChat(id), () => getChat(id))
}

/** `agent:create` and `agent:transcript` answered: seed what a restored panel renders. */
export function seedChat(
  id: string,
  input: { snapshot: AgentSessionSnapshot | null; turns?: TranscriptTurn[]; meta?: ChatState['meta']; refusal?: string | null }
): void {
  const prev = getChat(id)
  update(id, {
    snapshot: input.snapshot ?? prev.snapshot,
    turns: input.turns ?? prev.turns,
    live: prev.live,
    refusal: input.refusal === undefined ? prev.refusal : input.refusal,
    ...(input.meta === undefined ? (prev.meta === undefined ? {} : { meta: prev.meta }) : { meta: input.meta }),
    // M98. Carried, never re-seeded: a seed is main's snapshot, and grants are asked for separately.
    ...(prev.grants === undefined ? {} : { grants: prev.grants })
  })
  if (input.turns !== undefined && input.turns.length > 0) for (const l of seededListeners) l(id)
}

let insertSeq = 0

/** M75. Ask the composer of `id` to insert text at its caret. */
export function insertIntoComposer(id: string, text: string, opts?: { focus?: true }): void {
  const prev = states.get(id)
  if (!prev) return
  // M205. `focus` is an EXPLICIT request to hold the keyboard once sending
  // re-enables. Only the first start asks for it; every other insert (a
  // review's Continue, the palette's prompt row) must not take the keyboard
  // when a turn ends later (the M205 critic).
  update(id, { ...prev, insert: { seq: ++insertSeq, text, ...(opts?.focus === true ? { focus: true as const } : {}) } })
}

/**
 * M80. A template's first message, delivered once the chat's store entry
 * exists: `insertIntoComposer` is a no-op for an id the store has not seeded,
 * and the seeding is the panel's own hook, a render away.
 *
 * Lives here, over the two functions it composes, rather than in `Canvas.tsx`
 * where it was written: `useBoardVerbs.ts` delivers a review's Continue
 * through it too, and a helper both the hook and its caller reach cannot stay
 * in the caller's module without an import cycle.
 */
export async function deliverToComposer(id: string, text: string, opts?: { focus?: true }): Promise<void> {
  for (let i = 0; i < 40; i += 1) {
    const state = getChat(id)
    if (state.snapshot !== null || state.refusal !== null) { insertIntoComposer(id, text, opts); return }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

/** M122. Ask the chat panel of `id` to scroll the turn at `turnIndex` into view. */
export function scrollToTurn(id: string, turnIndex: number): void {
  const prev = states.get(id)
  if (!prev) return
  update(id, { ...prev, scrollTo: { seq: ++insertSeq, turnIndex } })
}

/** M75. Ask the composer of `id` to attach an image. */
export function attachToComposer(id: string, attach: NonNullable<ChatState['insert']>['attach']): void {
  const prev = states.get(id)
  if (!prev) return
  update(id, { ...prev, insert: { seq: ++insertSeq, attach } })
}

/** M322. A turn only the durable log held (a relaunch's undelivered message), dropped from this mirror once main has dropped it from the log. */
export function dropTurn(id: string, turnId: string): void {
  const prev = states.get(id)
  if (!prev || !prev.turns.some((t) => t.id === turnId)) return
  update(id, { ...prev, turns: prev.turns.filter((t) => t.id !== turnId) })
}

export function takeInsert(id: string, seq: number): void {
  const prev = states.get(id)
  if (!prev || !prev.insert || prev.insert.seq !== seq) return
  const { insert: _taken, ...rest } = prev
  update(id, rest)
}

/** M97. Dismiss a resolved auto chip; a live run is never dismissed from here (stop it). */
export function dismissAuto(id: string): void {
  const prev = states.get(id)
  if (!prev || !prev.snapshot || prev.snapshot.auto === undefined || prev.snapshot.auto.state === 'running') return
  const { auto: _auto, ...rest } = prev.snapshot
  update(id, { ...prev, snapshot: rest })
}

export function clearChat(id: string): void {
  states.delete(id)
  syncApprovals()
  notify(id)
}

function replaceTurn(turns: TranscriptTurn[], turn: TranscriptTurn): TranscriptTurn[] {
  const i = turns.findIndex((t) => t.id === turn.id)
  if (i < 0) return [...turns, turn]
  const next = turns.slice()
  next[i] = turn
  return next
}

/**
 * One event from main. The snapshot is kept field by field from what the
 * event carries — status, exit, pending, usage, cost — so the renderer never
 * has to re-ask `agent:list` per event; the fields an event does not carry
 * are left as the last answer said.
 */
/**
 * M78. A chat's turn ended — the handoff hook's `idle` for a chat source.
 * Rides applyChatEvent, the ONE event door, like the agent-state store's
 * transition fan-out rides applyAgentState.
 */
type SessionListener = (id: string, sessionId: string) => void
const sessionListeners = new Set<SessionListener>()
/** M90. The session id the CLI reported for a chat — what a codex record must store. */
export function onChatSession(listener: SessionListener): () => void {
  sessionListeners.add(listener)
  return () => { sessionListeners.delete(listener) }
}

type TurnEndListener = (id: string) => void
const turnEndListeners = new Set<TurnEndListener>()
/** M97. Every auto transition, for the run recorder: `(panelId, status)`. */
type AutoListener = (id: string, status: AutoStatus) => void
const autoListeners = new Set<AutoListener>()
export function onChatAuto(listener: AutoListener): () => void {
  autoListeners.add(listener)
  return () => { autoListeners.delete(listener) }
}

/**
 * M105. A chat SEEDED with its transcript (a relaunch, `Open as chat`): the
 * rail's last line is re-derived by the canvas — the guarded reader — and never
 * marked unread, because a restored answer was read in its earlier life.
 */
const seededListeners = new Set<TurnEndListener>()
export function onChatSeeded(listener: TurnEndListener): () => void {
  seededListeners.add(listener)
  return () => { seededListeners.delete(listener) }
}

/**
 * M114. The FIRST sign of a turn on a panel: the assistant's message start.
 * The board flips a dispatched item to `working` from this, never from the
 * click that dispatched it — a card that says working before the agent has
 * said a word is the board lying by a few seconds, and by minutes when the
 * spawn was refused.
 */
const turnStartListeners = new Set<(id: string) => void>()
export function onChatTurnStart(listener: (id: string) => void): () => void {
  turnStartListeners.add(listener)
  return () => { turnStartListeners.delete(listener) }
}

export function onChatTurnEnd(listener: TurnEndListener): () => void {
  turnEndListeners.add(listener)
  return () => { turnEndListeners.delete(listener) }
}

/** M78. The last assistant text of a chat, for a handoff's payload; empty when none. */
export function lastAssistantText(id: string): string {
  const state = states.get(id)
  if (!state) return ''
  // The LAST assistant turn only, never an older one under this turn's
  // header: a turn that ended in tool blocks alone has no answer to hand off.
  for (let i = state.turns.length - 1; i >= 0; i -= 1) {
    const t = state.turns[i]!
    if (t.role !== 'assistant') continue
    return t.blocks.filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text').map((b) => b.text).join('\n').trim()
  }
  return ''
}

export function applyChatEvent(event: AgentSessionEvent): void {
  let prev = states.get(event.id)
  // An event for a panel this renderer never seeded (another workspace's,
  // or a race with dispose) must not mint a state: that is the recycled-id
  // door. The hook seeds first.
  if (!prev) return
  // Every event carries its owner; only a CHANGE is a state update, so a
  // stream of tokens does not re-render for a fact that never moved.
  if (event.owner !== undefined && prev.owner !== event.owner) {
    update(event.id, { ...prev, owner: event.owner })
    prev = states.get(event.id)!
  }
  const snap = prev.snapshot
  switch (event.type) {
    case 'status':
      if (!snap) return
      update(event.id, {
        ...prev,
        snapshot: {
          ...snap,
          status: event.status,
          exitCode: event.status === 'exited' ? event.exitCode : snap.exitCode,
          exitSignal: event.status === 'exited' ? event.exitSignal : snap.exitSignal,
          // M319. A failed resume rides the exit; any other status clears it
          // (the next spawn is a fresh conversation, and the sentence is spent).
          ...(event.status === 'exited' && event.resumeLost !== undefined ? { resumeLost: event.resumeLost } : { resumeLost: undefined }),
          pid: event.status === 'exited' || event.status === 'disposed' ? undefined : (event.status === 'starting' ? snap.pid ?? -1 : snap.pid)
        },
        live: event.status === 'exited' || event.status === 'disposed' ? null : prev.live
      })
      return
    case 'session':
      if (!snap) return
      update(event.id, { ...prev, snapshot: { ...snap, model: event.model ?? snap.model, sessionId: event.sessionId } })
      // M90. codex mints the thread id; the record must learn it or a relaunch
      // resumes a thread that does not exist. Every subscriber decides by backend.
      for (const l of sessionListeners) l(event.id, event.sessionId)
      return
    case 'message-start':
      update(event.id, { ...prev, live: { messageId: event.messageId, blocks: [] } })
      for (const l of turnStartListeners) l(event.id)
      return
    case 'block-start': {
      // No message in flight (an abort or an exit raced a still-batched
      // block): a stray block with no message id could never be deduped
      // against its stored turn and would render beside it. Dropped.
      const live = prev.live
      if (!live) return
      const initial = event.block.type === 'text' || event.block.type === 'thinking' ? event.block.text : ''
      update(event.id, { ...prev, live: { ...live, blocks: [...live.blocks.filter((b) => b.index !== event.index), { index: event.index, block: event.block, text: initial }] } })
      return
    }
    case 'block-delta': {
      const live = prev.live
      if (!live) return
      const blocks = live.blocks.map((b) => (b.index === event.index ? { ...b, text: b.text + event.text } : b))
      update(event.id, { ...prev, live: { ...live, blocks } })
      return
    }
    case 'turn': {
      const turns = replaceTurn(prev.turns, event.turn)
      // The stored turn now covers its confirmed blocks; the live merge in
      // chat-model drops those indexes, so nothing to trim here.
      update(event.id, { ...prev, turns })
      return
    }
    case 'result': {
      const nextSnap = snap === null ? null : {
        ...snap,
        turns: snap.turns + 1,
        usage: event.usage ? addTotals(snap.usage, event.usage) : snap.usage,
        costUsd: event.costUsd ?? snap.costUsd
      }
      update(event.id, { ...prev, snapshot: nextSnap, live: null, lastTurn: { kind: event.interrupted ? 'interrupted' : event.ok === false ? 'error' : 'ok', at: Date.now() } })
      // An interrupted turn is not a turn's end: its answer is partial.
      // …and an error result is not a completed turn either: a handoff
      // after a failed turn would carry an answer that is not one.
      if (!event.interrupted && event.ok !== false) for (const cb of turnEndListeners) cb(event.id)
      return
    }
    case 'turn-aborted':
      update(event.id, { ...prev, live: null, lastTurn: { kind: 'aborted', at: Date.now(), reason: event.reason } })
      return
    case 'meter':
      // M350. Main's whole meter each time (spend, context, a hold): replaced, never merged.
      if (!snap) return
      update(event.id, { ...prev, snapshot: { ...snap, meter: event.meter } })
      return
    case 'queued':
      if (!snap) return
      // M82. The REASON rides the snapshot so the panel can say which queue it
      // is in: this session's own turn, or the canvas's ceiling.
      update(event.id, { ...prev, snapshot: { ...snap, queued: snap.queued + 1, ...(event.reason === undefined ? {} : { queuedReason: event.reason }) } })
      return
    case 'dequeued':
      if (!snap) return
      update(event.id, { ...prev, snapshot: { ...snap, queued: Math.max(0, snap.queued - 1) } })
      return
    case 'queue-dropped':
      if (!snap) return
      // M322. By the event's count: a removal of one, or an auto run's own
      // prompts, is not the whole queue (the list itself arrives on `queue`).
      update(event.id, { ...prev, snapshot: { ...snap, queued: Math.max(0, snap.queued - event.count) } })
      return
    case 'queue':
      if (!snap) return
      // M322. The waiting list, main's own; the count follows it.
      update(event.id, { ...prev, snapshot: { ...snap, queue: event.queue, queued: event.queue.length } })
      return
    case 'turn-removed':
      update(event.id, { ...prev, turns: prev.turns.filter((t) => t.id !== event.turnId) })
      return
    case 'permission-request':
      if (!snap) return
      update(event.id, {
        ...prev,
        snapshot: {
          ...snap,
          pending: [...snap.pending.filter((p) => p.requestId !== event.requestId), {
            requestId: event.requestId, toolName: event.toolName, input: event.input,
            ...(event.description === undefined ? {} : { description: event.description }),
            ...(event.toolUseId === undefined ? {} : { toolUseId: event.toolUseId })
          }]
        }
      })
      return
    case 'permission-answered':
    case 'permission-dropped':
      if (!snap) return
      update(event.id, { ...prev, snapshot: { ...snap, pending: snap.pending.filter((p) => p.requestId !== event.requestId) } })
      return
    case 'auto': {
      // M97. A projection of MAIN's count: the chip reads this, nothing
      // decides from it. The status object is rebuilt by name so an absent
      // `reason` stays absent.
      if (!snap) return
      const status: AutoStatus = { mode: event.mode, turn: event.turn, limit: event.limit, state: event.state, ...(event.reason === undefined ? {} : { reason: event.reason }) }
      update(event.id, { ...prev, snapshot: { ...snap, auto: status } })
      for (const l of autoListeners) l(event.id, status)
      return
    }
    case 'permission-auto-allowed':
      // M98. Main answered it from a session grant before it was ever
      // pending: nothing to remove, nothing to light — but the panel says so
      // in a quiet row, or a call that ran under a grant is indistinguishable
      // from one the user allowed by hand.
      update(event.id, { ...prev, granted: [...(prev.granted ?? []), event.toolName] })
      return
    case 'unknown':
      if (!snap) return
      update(event.id, { ...prev, snapshot: { ...snap, counters: { ...snap.counters, unknown: snap.counters.unknown + 1 } } })
      return
    case 'malformed':
      if (!snap) return
      update(event.id, { ...prev, snapshot: { ...snap, counters: { ...snap.counters, malformed: snap.counters.malformed + 1 } } })
      return
    default:
      return
  }
}
