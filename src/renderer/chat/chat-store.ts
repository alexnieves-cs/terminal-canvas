import { useSyncExternalStore } from 'react'
import { addTotals } from '@shared/cost'
import type { AgentSessionEvent, AgentSessionSnapshot } from '@shared/agent-session'
import type { TranscriptTurn } from '@shared/transcript'
import type { LiveMessage } from './chat-model'

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
  insert?: { seq: number; text?: string; attach?: { kind: 'path'; path: string } | { kind: 'data'; mediaType: string; base64: string; name: string } }
}

const states = new Map<string, ChatState>()
const listeners = new Map<string, Set<() => void>>()

const EMPTY: ChatState = Object.freeze({ snapshot: null, turns: [], live: null, refusal: null }) as ChatState

function notify(id: string): void {
  const set = listeners.get(id)
  if (!set) return
  for (const cb of set) cb()
}

function update(id: string, next: ChatState): void {
  states.set(id, next)
  notify(id)
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
    ...(input.meta === undefined ? (prev.meta === undefined ? {} : { meta: prev.meta }) : { meta: input.meta })
  })
}

let insertSeq = 0

/** M75. Ask the composer of `id` to insert text at its caret. */
export function insertIntoComposer(id: string, text: string): void {
  const prev = states.get(id)
  if (!prev) return
  update(id, { ...prev, insert: { seq: ++insertSeq, text } })
}

/** M75. Ask the composer of `id` to attach an image. */
export function attachToComposer(id: string, attach: NonNullable<ChatState['insert']>['attach']): void {
  const prev = states.get(id)
  if (!prev) return
  update(id, { ...prev, insert: { seq: ++insertSeq, attach } })
}

export function takeInsert(id: string, seq: number): void {
  const prev = states.get(id)
  if (!prev || !prev.insert || prev.insert.seq !== seq) return
  const { insert: _taken, ...rest } = prev
  update(id, rest)
}

export function clearChat(id: string): void {
  states.delete(id)
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
export function applyChatEvent(event: AgentSessionEvent): void {
  const prev = states.get(event.id)
  // An event for a panel this renderer never seeded (another workspace's,
  // or a race with dispose) must not mint a state: that is the recycled-id
  // door. The hook seeds first.
  if (!prev) return
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
          pid: event.status === 'exited' || event.status === 'disposed' ? undefined : (event.status === 'starting' ? snap.pid ?? -1 : snap.pid)
        },
        live: event.status === 'exited' || event.status === 'disposed' ? null : prev.live
      })
      return
    case 'session':
      if (!snap) return
      update(event.id, { ...prev, snapshot: { ...snap, model: event.model ?? snap.model } })
      return
    case 'message-start':
      update(event.id, { ...prev, live: { messageId: event.messageId, blocks: [] } })
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
      update(event.id, { ...prev, snapshot: nextSnap, live: null })
      return
    }
    case 'turn-aborted':
      update(event.id, { ...prev, live: null })
      return
    case 'queued':
      if (!snap) return
      update(event.id, { ...prev, snapshot: { ...snap, queued: snap.queued + 1 } })
      return
    case 'dequeued':
      if (!snap) return
      update(event.id, { ...prev, snapshot: { ...snap, queued: Math.max(0, snap.queued - 1) } })
      return
    case 'queue-dropped':
      if (!snap) return
      update(event.id, { ...prev, snapshot: { ...snap, queued: 0 } })
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
