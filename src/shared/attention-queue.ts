/**
 * The one attention queue (M437). Pure: no React, no DOM, no store.
 *
 * Every surface that says "who needs you" — the pill, the dock badge, the
 * Sessions count, the edge pips, the minimap, the World — is supposed to
 * read this list and no other. `useAttentionQueue` is the selector that
 * fills it. A second sort, or a second sentence, is how those surfaces
 * drift apart and nothing notices.
 *
 * Order is this module's, not `AttentionKind`'s declaration order. A blocked
 * approval comes before a question, then a shell prompt, then a failure,
 * then recovery: an agent stopped on a person can do nothing until it is
 * answered, and a crash can wait. Inside a kind, oldest `since` first — the
 * same "longest waiting" rule `attention.ts` walks with ⌘J. `id` breaks a
 * tie, so reversing the input cannot reshuffle the result.
 *
 * The sentence is copied, never written here. The caller passes
 * `panelState`'s word for the same facts. A queue that spelled "needs you"
 * for itself would be a second vocabulary the moment the first one moved.
 *
 * The verb is a label. The handler is the palette executor, not a door
 * this module grows.
 */

import type { AttentionItem, AttentionKind } from './redesign-contracts'
import type { AgentState } from './types'

export type AttentionSurface = 'chat' | 'terminal' | 'other'

/** One panel, as the selector saw it. Absent flags are not that kind. */
export interface AttentionInput {
  panelId: string
  taskId: string | null
  /** Epoch ms the fact became true. A non-finite value sorts last, not first. */
  since: number
  /** `panelState(...).word` for this panel. Copied onto the item. */
  sentence: string
  surface: AttentionSurface
  agent?: AgentState
  /** Set when a permission request is waiting. Its id is the item's id. */
  approvalId?: string
  /** A shell sitting on a prompt only its terminal can answer. */
  shellPrompt?: boolean
  /** A non-zero exit or a status error. */
  failed?: boolean
  /** Host loss, or a paused session a person has to bring back. */
  recovery?: boolean
}

/**
 * The queue's order. Not derived from the union: reordering `AttentionKind`
 * in the contract must not reorder ⌘J.
 */
const KIND_RANK: Record<AttentionKind, number> = {
  approval: 0,
  question: 1,
  'shell-prompt': 2,
  failed: 3,
  recovery: 4
}

/** The primary verb for each kind. One label; the palette runs it. */
export const ATTENTION_VERB: Record<AttentionKind, string> = {
  approval: 'Allow',
  question: 'Reply',
  'shell-prompt': 'Open',
  failed: 'Triage',
  recovery: 'Review'
}

function kindOf(input: AttentionInput): AttentionKind | null {
  if (input.approvalId) return 'approval'
  // A prompt is answered in the terminal even when the agent has also rung.
  if (input.shellPrompt) return 'shell-prompt'
  if (input.agent === 'wants-you') return input.surface === 'terminal' ? 'shell-prompt' : 'question'
  if (input.failed) return 'failed'
  if (input.recovery) return 'recovery'
  return null
}

function itemId(kind: AttentionKind, input: AttentionInput): string {
  if (kind === 'approval' && input.approvalId) return `approval:${input.approvalId}`
  return `${kind}:${input.panelId}`
}

function sinceOf(since: number): number {
  return Number.isFinite(since) ? since : Number.POSITIVE_INFINITY
}

/** Lower rank wins; then the older fact; then the id, so the order is total. */
function before(a: AttentionItem, b: AttentionItem): boolean {
  const rank = KIND_RANK[a.kind] - KIND_RANK[b.kind]
  if (rank !== 0) return rank < 0
  if (a.since !== b.since) return a.since < b.since
  return a.id < b.id
}

/**
 * One item per panel. Two facts about the same panel (an approval and a
 * failure) are one row: the higher-priority kind, so the badge and ⌘J
 * cannot count one person twice.
 */
export function buildQueue(inputs: readonly AttentionInput[]): AttentionItem[] {
  const byPanel = new Map<string, AttentionItem>()
  for (const input of inputs) {
    const kind = kindOf(input)
    if (kind === null) continue
    const item: AttentionItem = {
      id: itemId(kind, input),
      kind,
      panelId: input.panelId,
      taskId: input.taskId,
      sentence: input.sentence,
      since: sinceOf(input.since),
      verb: ATTENTION_VERB[kind]
    }
    const prev = byPanel.get(input.panelId)
    if (prev === undefined || before(item, prev)) byPanel.set(input.panelId, item)
  }
  return [...byPanel.values()].sort((a, b) => (before(a, b) ? -1 : before(b, a) ? 1 : 0))
}

/**
 * The id ⌘J / ⌘⇧J lands on. Wraps. A cursor that has left the queue (the
 * thing was answered) restarts from the end the direction implies, rather
 * than returning null — a second press that does nothing is a broken key.
 * An empty queue steps nowhere.
 */
function step(items: readonly AttentionItem[], id: string | null, direction: 1 | -1): string | null {
  if (items.length === 0) return null
  const at = id === null ? -1 : items.findIndex((item) => item.id === id)
  if (at === -1) return direction === 1 ? items[0].id : items[items.length - 1].id
  return items[(at + direction + items.length) % items.length].id
}

export function next(items: readonly AttentionItem[], id: string | null): string | null {
  return step(items, id, 1)
}

export function prev(items: readonly AttentionItem[], id: string | null): string | null {
  return step(items, id, -1)
}
