import type { ContentBlock, TranscriptTurn } from '@shared/transcript'
import type { AgentBackend, AgentSessionSnapshot } from '@shared/agent-session'
import { BACKENDS, DEFAULT_BACKEND } from '@shared/agent-backends'
import type { ChatStateInput } from '@renderer/panels/panel-state'
import { toolFilePath } from '@shared/tool-index'
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
  /** M167. `at` is the turn's record time when it has one; a live row has none — absent stays absent. */
  | { kind: 'user'; id: string; text: string; at?: number }
  | { kind: 'text'; id: string; text: string; live: boolean; at?: number }
  | { kind: 'thinking'; id: string; text: string; live: boolean }
  | {
      kind: 'tool'
      id: string
      name: string
      input: Record<string, unknown>
      /** Folded under the call by tool_use id; absent while the tool runs. */
      result?: { content: string; isError: boolean }
      live: boolean
      /** M77. The file this call names, when it names one — the `diff` verb's subject. */
      file?: string
      /** M168. The turn's record time, for a group's elapsed span; absent on a live row. */
      at?: number
    }
  | { kind: 'unknown'; id: string; kindName: string }
  /** M75. An attached image: its type and size, never the picture. */
  | { kind: 'image'; id: string; mediaType: string; size: number }

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

function blockRows(turnId: string, blocks: readonly ContentBlock[], live: boolean, texts?: readonly string[], at?: number): ChatRow[] {
  const rows: ChatRow[] = []
  blocks.forEach((block, i) => {
    const id = `${turnId}:${i}`
    switch (block.type) {
      case 'text':
        rows.push({ kind: 'text', id, text: texts?.[i] ?? block.text, live, ...(at === undefined ? {} : { at }) })
        return
      case 'thinking':
        rows.push({ kind: 'thinking', id, text: texts?.[i] ?? block.text, live })
        return
      case 'tool_use':
        rows.push({ kind: 'tool', id: block.id || id, name: block.name, input: block.input, live, ...(at === undefined ? {} : { at }), ...((): { file?: string } => { const f = toolFilePath(block.input); return f === null ? {} : { file: f } })() })
        return
      case 'tool_result':
        // Folded below, never a row of its own.
        return
      case 'image':
        rows.push({ kind: 'image', id, mediaType: block.mediaType, size: block.size })
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
      if (text !== '') rows.push({ kind: 'user', id: turn.id, text, ...(typeof turn.at === 'number' ? { at: turn.at } : {}) })
      turn.blocks.forEach((b, i) => { if (b.type === 'image') rows.push({ kind: 'image', id: `${turn.id}:${i}`, mediaType: b.mediaType, size: b.size }) })
      for (const block of turn.blocks) {
        if (block.type !== 'tool_result') continue
        const row = toolRows.get(block.toolUseId)
        if (row) row.result = { content: block.content, isError: block.isError }
      }
      continue
    }
    if (live !== null && turn.id === live.messageId) storedForLive = turn.blocks.length
    for (const row of blockRows(turn.id, turn.blocks, false, undefined, typeof turn.at === 'number' ? turn.at : undefined)) {
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
/**
 * M77. Whether this chat's agent has RUN — the one definition `Open review`
 * gates on in the pane and the palette: a process alive, a result seen this
 * launch, a durable meta line with turns, or a user text turn in the file.
 */
export function chatHasRun(state: { snapshot: AgentSessionSnapshot | null; turns: readonly TranscriptTurn[]; meta?: { turns: number } }): boolean {
  const snap = state.snapshot
  const alive = snap !== null && snap.pid !== undefined && snap.status !== 'exited' && snap.status !== 'disposed'
  return alive || (snap !== null && snap.turns > 0) || (state.meta?.turns ?? 0) > 0 || state.turns.some((t) => t.role === 'user' && t.blocks.some((b) => b.type === 'text'))
}

/** M76. The one deny message, whichever surface says it. */
export const DENY_MESSAGE = 'denied from the canvas'
/** M76. A question is open: the composer names the fix, which is above it. */
/** M119. The row's label, not `claude`: acp is the first other row that asks. */
export const REASON_CHAT_PENDING = 'claude is waiting for your answer — allow or deny above'
export const reasonChatPending = (label: string): string => `${label} is waiting for your answer — allow or deny above`
export const reasonChatHandshake = (label: string): string => `waiting for ${label} to open its session — the first message goes when it answers`
export const REASON_CHAT_HANDSHAKE_INTERRUPT = 'the agent has not opened its session yet — close the panel to stop it'
/** M99: claude's own `noCli` row, under the name every M73 door imports. */
export const REASON_CHAT_NO_CLAUDE = BACKENDS.claude.reasons.noCli
export const REASON_CHAT_IDLE = 'nothing is in flight'
export { REASON_NO_CODEX as REASON_CHAT_NO_CODEX, REASON_CODEX_NO_INTERRUPT } from '@shared/agent-session'

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
  claudeAvailable: boolean,
  backend: AgentBackend = DEFAULT_BACKEND
): { send: ComposerArm; interrupt: ComposerArm } {
  const row = BACKENDS[backend]
  // M90. `claudeAvailable` is the panel's OWN backend's availability: the
  // caller passes codex's for a codex panel. The reason is the row's.
  if (!claudeAvailable) {
    return { send: { enabled: false, reason: row.reasons.noCli }, interrupt: { enabled: false, reason: REASON_CHAT_IDLE } }
  }
  // M90. A backend with no interrupt door: mid-turn the verb stays, disabled
  // with the fix (closing the panel kills the process), never enabled to a no-op.
  const noInterrupt: ComposerArm = row.interrupts ? { enabled: true } : { enabled: false, reason: row.reasons.noInterrupt }
  const streaming = snapshot !== null && (snapshot.status === 'streaming' || (snapshot.status === 'starting' && snapshot.queued === 0 && snapshot.turns === 0 && snapshot.pid !== undefined))
  if (snapshot !== null && snapshot.pending.length > 0) return { send: { enabled: false, reason: reasonChatPending(row.label) }, interrupt: noInterrupt }
  // M119. A handshake in flight is its own state: Send waits, Interrupt cannot reach a session that has not opened (the manager refuses it), so both say so.
  if (snapshot !== null && snapshot.awaitingHandshake === true) return { send: { enabled: false, reason: reasonChatHandshake(row.label) }, interrupt: { enabled: false, reason: REASON_CHAT_HANDSHAKE_INTERRUPT } }
  if (streaming) return { send: { enabled: false, reason: REASON_CHAT_STREAMING }, interrupt: noInterrupt }
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
/**
 * M162. Whether `toolArgument`'s text is CODE — a path, a command, a
 * pattern or a URL — and so set in the mono face, or a sentence (a Task's
 * `description`, a search's `query`) set in the UI face. The Act 0 critic
 * found the M162 sweep had put a Task description in mono by styling the
 * argument's class; the face is decided here, once, from the same keys.
 */
export function toolArgumentIsCode(input: Record<string, unknown>): boolean {
  const pathLike = input.file_path ?? input.path ?? input.notebook_path
  if (typeof pathLike === 'string') return true
  return typeof (input.command ?? input.pattern ?? input.url) === 'string'
}

export function toolArgument(input: Record<string, unknown>, keep = 2): string {
  const pathLike = input.file_path ?? input.path ?? input.notebook_path
  if (typeof pathLike === 'string') return shortPath(pathLike, keep)
  const first = input.command ?? input.pattern ?? input.url ?? input.description ?? input.query
  if (typeof first === 'string') return first.length > 96 ? first.slice(0, 93) + '…' : first
  const keys = Object.keys(input)
  return keys.length === 0 ? '' : keys.join(', ')
}

/**
 * M168. TOOL ROWS AS ONE ROW EACH, AND CONSECUTIVE ROWS AS ONE GROUP (the
 * brief: "worked for 2m · 6 tools", collapsed by default). Pure over the rows
 * `chatRows` built: a run of two or more `tool` rows folds into a `tools`
 * group; a lone tool row stays a row (no header for one); every other row
 * passes through in order. The elapsed span is the first and last tool's
 * record times among the STAMPED rows (a live row has none yet); a group with
 * fewer than two stamps says how many tools, never a number it made up.
 */
export type ToolRowOf = Extract<ChatRow, { kind: 'tool' }>
export type ChatGroup = ChatRow | { kind: 'tools'; id: string; rows: ToolRowOf[]; elapsedMs?: number }

export function toolGroups(rows: readonly ChatRow[]): ChatGroup[] {
  const out: ChatGroup[] = []
  let run: ToolRowOf[] = []
  const flush = (): void => {
    if (run.length === 0) return
    if (run.length === 1) { out.push(run[0]); run = []; return }
    // The first and the last STAMPED rows: a live last row has no stamp yet,
    // and the span to the last one that does is still a true span.
    const stamped = run.filter((r) => r.at !== undefined)
    const first = stamped[0]?.at
    const last = stamped[stamped.length - 1]?.at
    const elapsed = stamped.length >= 2 && first !== undefined && last !== undefined && last >= first ? { elapsedMs: last - first } : {}
    out.push({ kind: 'tools', id: `tools:${run[0].id}`, rows: run, ...elapsed })
    run = []
  }
  for (const row of rows) {
    if (row.kind === 'tool') { run.push(row); continue }
    flush()
    out.push(row)
  }
  flush()
  return out
}

/** M168. The VERB a tool row leads with: a family word for the CLI's own tool names, else the name as given. */
export function toolVerb(name: string): string {
  switch (name) {
    case 'Read': case 'NotebookRead': return 'Read'
    case 'Edit': case 'Write': case 'MultiEdit': case 'NotebookEdit': return 'Edit'
    case 'Bash': case 'Shell': case 'Run': return 'Run'
    case 'Grep': case 'Glob': case 'WebSearch': case 'Search': return 'Search'
    default: return name
  }
}

/** M168. The state pill's word: three states, never a blank. */
export function toolState(row: ToolRowOf): 'running' | 'done' | 'error' {
  if (row.result !== undefined) return row.result.isError ? 'error' : 'done'
  return row.live ? 'running' : 'done'
}

/** M168. `worked for 2m · 6 tools` — the header's words; without a span, the count alone. */
export function toolGroupLabel(group: Extract<ChatGroup, { kind: 'tools' }>): string {
  const n = `${group.rows.length} tools`
  if (group.elapsedMs === undefined) return n
  const s = Math.round(group.elapsedMs / 1000)
  const span = s < 60 ? `${s}s` : `${Math.round(s / 60)}m`
  return `worked for ${span} · ${n}`
}

/** M169. The composer's rows: two at rest, one per line of the draft, six at most — pure, so the node only renders it. */
export function composerRows(text: string): number {
  const lines = text === '' ? 1 : text.split('\n').length
  return Math.min(6, Math.max(2, lines))
}
