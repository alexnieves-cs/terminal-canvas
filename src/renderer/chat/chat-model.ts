import type { ContentBlock, TranscriptTurn } from '@shared/transcript'
import type { AgentSessionSnapshot } from '@shared/agent-session'
import type { ChatStateInput } from '@renderer/panels/panel-state'
import { shortPath } from '@renderer/palette/panel-name'

/**
 * M73. THE CHAT PANEL'S MODEL — pure, plain-node checked in `verify:rail`.
 *
 * Three questions the component must not answer for itself: what rows a
 * transcript renders (and how a tool's result folds under its call), how the
 * message in flight merges with the turn the CLI has already confirmed so a
 * token never renders twice, and what the composer may do right now and why
 * not otherwise. The component (`ChatNode.tsx`) renders and moves focus.
 */

export type ChatRow =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'text'; id: string; text: string; live: boolean }
  | { kind: 'thinking'; id: string; text: string; live: boolean }
  | {
      kind: 'tool'
      id: string
      name: string
      input: Record<string, unknown>
      /** Folded under the call by tool_use id; absent while the tool runs. */
      result?: { content: string; isError: boolean }
      live: boolean
    }
  | { kind: 'unknown'; id: string; kindName: string }

/** One block of the message in flight, its deltas accumulated. */
export interface LiveBlock {
  index: number
  block: ContentBlock
  text: string
}

export interface LiveMessage {
  messageId: string
  blocks: LiveBlock[]
}

function blockRows(turnId: string, blocks: readonly ContentBlock[], live: boolean, texts?: readonly string[]): ChatRow[] {
  const rows: ChatRow[] = []
  blocks.forEach((block, i) => {
    const id = `${turnId}:${i}`
    switch (block.type) {
      case 'text':
        rows.push({ kind: 'text', id, text: texts?.[i] ?? block.text, live })
        return
      case 'thinking':
        rows.push({ kind: 'thinking', id, text: texts?.[i] ?? block.text, live })
        return
      case 'tool_use':
        rows.push({ kind: 'tool', id: block.id || id, name: block.name, input: block.input, live })
        return
      case 'tool_result':
        // Folded below, never a row of its own.
        return
      default:
        rows.push({ kind: 'unknown', id, kindName: block.kind })
    }
  })
  return rows
}

/**
 * Rows from the stored turns plus the message in flight.
 *
 * A `tool_result` block never becomes a row: it is folded under the tool row
 * whose id it names, wherever that row is. A user turn made only of results
 * therefore renders nothing of its own — the same fact the CLI's own UI
 * shows, the result under the call. A user turn with text is a user row.
 *
 * THE LIVE MERGE. The CLI emits the assistant record once per content block,
 * so the stored turn for the message in flight holds the blocks the CLI has
 * confirmed while the store's live message still holds their deltas. A live
 * block whose index the stored turn already covers is dropped; one beyond
 * it renders as live. Without this rule every completed block renders twice
 * — once as stored text, once as its own deltas — for as long as the turn
 * runs.
 */
export function chatRows(turns: readonly TranscriptTurn[], live: LiveMessage | null): ChatRow[] {
  const rows: ChatRow[] = []
  const toolRows = new Map<string, Extract<ChatRow, { kind: 'tool' }>>()
  let storedForLive = 0
  for (const turn of turns) {
    if (turn.role === 'user') {
      const text = turn.blocks.filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text').map((b) => b.text).join('\n')
      if (text !== '') rows.push({ kind: 'user', id: turn.id, text })
      for (const block of turn.blocks) {
        if (block.type !== 'tool_result') continue
        const row = toolRows.get(block.toolUseId)
        if (row) row.result = { content: block.content, isError: block.isError }
      }
      continue
    }
    if (live !== null && turn.id === live.messageId) storedForLive = turn.blocks.length
    for (const row of blockRows(turn.id, turn.blocks, false)) {
      rows.push(row)
      if (row.kind === 'tool') toolRows.set(row.id, row)
    }
  }
  if (live !== null) {
    const pending = live.blocks.filter((b) => b.index >= storedForLive)
    const blocks = pending.map((b) => b.block)
    const texts = pending.map((b) => b.text)
    for (const row of blockRows(live.messageId, blocks, true, texts)) {
      rows.push(row)
      if (row.kind === 'tool') toolRows.set(row.id, row)
    }
  }
  return rows
}

export const REASON_CHAT_STREAMING = 'the agent is still answering — interrupt it, or wait'
export const REASON_CHAT_NO_CLAUDE = 'claude was not found on the login PATH — install it, or check the environment report'
export const REASON_CHAT_IDLE = 'nothing is in flight'

export interface ComposerArm {
  enabled: boolean
  reason?: string
}

/**
 * What the composer may do. Send is refused BY NAME mid-turn (a second
 * message would queue — the runtime allows it, but a composer that accepts
 * input while the answer streams is the one that sends a half-typed line);
 * Interrupt is enabled only mid-turn; with no claude on the PATH Send names
 * the fix. Before any answer from main and after an exit, Send is enabled:
 * the first send is what starts the process, and a send after an exit is
 * what resumes it.
 */
export function composerState(
  snapshot: AgentSessionSnapshot | null,
  claudeAvailable: boolean
): { send: ComposerArm; interrupt: ComposerArm } {
  if (!claudeAvailable) {
    return { send: { enabled: false, reason: REASON_CHAT_NO_CLAUDE }, interrupt: { enabled: false, reason: REASON_CHAT_IDLE } }
  }
  const streaming = snapshot !== null && (snapshot.status === 'streaming' || (snapshot.status === 'starting' && snapshot.queued === 0 && snapshot.turns === 0 && snapshot.pid !== undefined))
  if (streaming) return { send: { enabled: false, reason: REASON_CHAT_STREAMING }, interrupt: { enabled: true } }
  return { send: { enabled: true }, interrupt: { enabled: false, reason: REASON_CHAT_IDLE } }
}

/**
 * The vocabulary's input from a snapshot. `hasHistory` is whether the
 * transcript holds turns: with no process that reads `asleep` rather than
 * `not started`. Undefined only when main has not answered AND there is
 * nothing to show.
 */
export function chatStateInput(snapshot: AgentSessionSnapshot | null, hasHistory = false): ChatStateInput | undefined {
  if (snapshot === null) return hasHistory ? { status: 'not-started', pending: 0, hasHistory: true } : undefined
  return {
    status: snapshot.status,
    pending: snapshot.pending.length,
    ...(snapshot.exitCode === undefined ? {} : { exitCode: snapshot.exitCode }),
    ...(hasHistory ? { hasHistory: true } : {})
  }
}

/**
 * A tool call's one-line argument. A PATH is shortened from the LEFT so the
 * file name survives (brief principle 3: a row that begins with
 * `/private/var/folders/…` is wrong); a command is cut from the right.
 */
export function toolArgument(input: Record<string, unknown>, keep = 3): string {
  const pathLike = input.file_path ?? input.path ?? input.notebook_path
  if (typeof pathLike === 'string') return shortPath(pathLike, keep)
  const first = input.command ?? input.pattern ?? input.url ?? input.description ?? input.query
  if (typeof first === 'string') return first.length > 96 ? first.slice(0, 93) + '…' : first
  const keys = Object.keys(input)
  return keys.length === 0 ? '' : keys.join(', ')
}
