import type { AgentOptions } from './cost'
import type { ContentBlock, TranscriptEvent } from './transcript'

/**
 * M118. THE COPILOT ADAPTER — `copilot -p --output-format json`'s JSONL to
 * the SAME `TranscriptEvent` union claude's and codex's streams parse to, so
 * nothing above the runtime learns which vendor answered. Measured against
 * GitHub Copilot CLI 1.0.83 (`scripts/fixtures/agent-session/copilot/*.jsonl`)
 * on 2026-09-06.
 *
 * The shape differences that matter, each handled here and nowhere else:
 *   - The stream states NO session id: every line's `parentId` is the PREVIOUS
 *     event's id, a chain, not a session. The HOST pins the id with
 *     `--session-id <uuid>` on the first turn and names `--resume=<uuid>` on
 *     every later one (claude's shape behind codex's process model), so the
 *     parser is HANDED the pinned id and puts it on the `session` event —
 *     the one place a parser is told a fact rather than reading it.
 *   - The prompt is an ARGUMENT (`-p`) and the process runs ONE turn; there
 *     is no stdin encoder and `copilotArgs` takes the text.
 *   - `assistant.turn_end` fires per MODEL CALL — a tool call is turn 0 and
 *     the answer turn 1 — so it is `message-end`, never the result. The turn's
 *     end is the `result` line (and the ephemeral `assistant.idle`).
 *   - Deltas arrive as ephemeral `assistant.message_delta` lines; the complete
 *     `assistant.message` follows with `toolRequests[]`, each a tool_use block;
 *     `tool.execution_complete` is the tool_result under the SAME call id —
 *     the pair the chat panel's rows already render.
 *   - No tokens and no dollars: `session.usage_checkpoint` carries credits
 *     (`totalNanoAiu`, `totalPremiumRequests`), which are neither, so the
 *     result carries no usage and the summary prices nothing.
 *   - No interrupt door and no permission request: `--allow-all-tools` is
 *     required headless, so every tool runs on the CLI's own policy — the row
 *     names both refusals; this file only never emits them.
 *
 * Absent / malformed / unknown, as everywhere: a broken line is `malformed`,
 * a `type` this version has not seen is `unknown` BY KIND (a counter on the
 * session, never a shorter transcript), and a type this app knows and has no
 * use for (`session.*` chatter, reasoning, the echoed user message, the
 * per-call `model.call_start`) is `ignored` by kind.
 */

const PREVIEW_MAX = 80

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** What the parser is told: the id the host pinned, because the stream never says it. */
export interface CopilotParseContext {
  sessionId: string
}

/** The one piece of state between lines: whether a text block has been opened for the message in flight. */
interface CopilotCarry {
  /** The message id of the open assistant message, or null between messages. */
  messageId: string | null
  /** Whether the open message has had its text block started (a delta minted it). */
  textStarted: boolean
}

const freshCarry = (): CopilotCarry => ({ messageId: null, textStarted: false })

function parseRecord(raw: Record<string, unknown>, line: string, ctx: CopilotParseContext, carry: CopilotCarry): TranscriptEvent[] {
  const data = isRecord(raw.data) ? raw.data : {}
  switch (raw.type) {
    case 'session.auto_mode_resolved':
      // The one line that names the model; the id is the host's.
      return [{ type: 'session', sessionId: ctx.sessionId, ...(str(data.chosenModel) === '' ? {} : { model: str(data.chosenModel) }) }]
    case 'assistant.turn_start': {
      const messageId = `${str(data.interactionId)}:${str(data.turnId)}`
      carry.messageId = messageId
      carry.textStarted = false
      return [{ type: 'message-start', messageId }]
    }
    case 'assistant.message_delta': {
      const text = str(data.deltaContent)
      const events: TranscriptEvent[] = []
      if (!carry.textStarted) {
        carry.textStarted = true
        events.push({ type: 'block-start', index: 0, block: { type: 'text', text: '' } })
      }
      events.push({ type: 'block-delta', index: 0, delta: 'text', text })
      return events
    }
    case 'assistant.message': {
      const blocks: ContentBlock[] = []
      const text = str(data.content)
      if (text !== '') blocks.push({ type: 'text', text })
      const requests = Array.isArray(data.toolRequests) ? data.toolRequests : []
      for (const req of requests) {
        if (!isRecord(req)) continue
        blocks.push({ type: 'tool_use', id: str(req.toolCallId), name: str(req.name), input: isRecord(req.arguments) ? req.arguments : {} })
      }
      const messageId = str(data.messageId) !== '' ? str(data.messageId) : (carry.messageId ?? 'copilot-message')
      return [{ type: 'assistant', messageId, blocks, ...(str(data.model) === '' ? {} : { model: str(data.model) }) }]
    }
    case 'tool.execution_complete': {
      const result = isRecord(data.result) ? data.result : {}
      const block: ContentBlock = {
        type: 'tool_result',
        toolUseId: str(data.toolCallId),
        content: str(result.content),
        isError: data.success === false
      }
      return [{ type: 'user', blocks: [block], replay: false }]
    }
    case 'assistant.turn_end':
      // Per MODEL CALL, not per turn: the message ends, the turn goes on.
      carry.messageId = null
      carry.textStarted = false
      return [{ type: 'message-end' }]
    case 'result':
      return [{ type: 'result', ok: true, subtype: 'success' }]
    case 'error':
      return [{ type: 'result', ok: false, subtype: 'error', error: str(data.message) !== '' ? str(data.message) : 'copilot reported an error' }]
    case 'session.usage_checkpoint':
    case 'session.mcp_server_status_changed':
    case 'session.skills_loaded':
    case 'session.tools_updated':
    case 'user.message':
    case 'model.call_start':
    case 'assistant.reasoning':
    case 'assistant.reasoning_delta':
    case 'assistant.message_start':
    case 'assistant.idle':
    case 'tool.execution_start':
    case 'assistant.tool_call_delta':
      return [{ type: 'ignored', kind: raw.type }]
    default:
      return [{ type: 'unknown', kind: String(raw.type) }]
  }
  // unreachable: the switch returns on every arm; `line` is kept for the malformed preview's caller
  void line
}

/** One line, zero or more events. The carry is threaded by the chunk parser; a lone call gets a fresh one. */
export function parseCopilotLine(line: string, ctx: CopilotParseContext, carry: CopilotCarry = freshCarry()): TranscriptEvent[] {
  let raw: unknown
  try {
    raw = JSON.parse(line)
  } catch {
    return [{ type: 'malformed', preview: line.slice(0, PREVIEW_MAX) }]
  }
  if (!isRecord(raw) || typeof raw.type !== 'string') return [{ type: 'malformed', preview: line.slice(0, PREVIEW_MAX) }]
  return parseRecord(raw, line, ctx, carry)
}

/**
 * The chunk parser, the same contract as `parseStreamChunk`, with the
 * message state serialised INTO the carry string after the partial line:
 * the manager's carry is a string by contract, and a message's open text
 * block must survive a chunk boundary or the next delta starts a second
 * block beside the first.
 */
const STATE_MARK = '\u0000copilot:'

export function parseCopilotChunk(chunk: string, carry: string, ctx: CopilotParseContext): { events: TranscriptEvent[]; carry: string } {
  const mark = carry.indexOf(STATE_MARK)
  const rest0 = mark === -1 ? carry : carry.slice(0, mark)
  let state: CopilotCarry = freshCarry()
  if (mark !== -1) {
    try { state = JSON.parse(carry.slice(mark + STATE_MARK.length)) as CopilotCarry } catch { state = freshCarry() }
  }
  const text = rest0 + chunk
  const lines = text.split('\n')
  const rest = lines.pop() ?? ''
  const events: TranscriptEvent[] = []
  for (const line of lines) {
    if (line.trim() === '') continue
    events.push(...parseCopilotLine(line, ctx, state))
  }
  return { events, carry: rest + STATE_MARK + JSON.stringify(state) }
}

/** Every event the lines yield, threaded through one carry — what the checks read. */
export function parseCopilotLines(lines: readonly string[], ctx: CopilotParseContext): TranscriptEvent[] {
  const state = freshCarry()
  return lines.flatMap((l) => parseCopilotLine(l, ctx, state))
}

export interface CopilotArgsInput {
  cwd: string
  text: string
  resume: boolean
  /** The id the HOST pinned — on `--session-id` first, on `--resume=` after. */
  sessionId: string
  agentOptions?: AgentOptions
}

/**
 * The argv. `--allow-all-tools` because the CLI requires it for
 * non-interactive mode (every tool then runs on its own policy — the row's
 * `noPermissions` sentence). `--no-auto-update` because the CLI replaced
 * itself mid-run during Act 0's recording; an app that spawns a binary must
 * not have that binary change under it. `-C <cwd>` on every turn: a resumed
 * session keeps its directory, and the flag is harmless where it agrees.
 * `--secret-env-vars` is DECLINED: the PTY env carries no credential by
 * construction, and naming variables that are not there invents a list.
 */
export function copilotArgs(input: CopilotArgsInput): string[] {
  const args = ['-p', input.text, '--output-format', 'json', '--allow-all-tools', '--no-auto-update']
  if (input.resume) args.push(`--resume=${input.sessionId}`)
  else args.push('--session-id', input.sessionId)
  args.push('-C', input.cwd)
  const model = input.agentOptions?.model
  if (model !== undefined && model !== '') args.push('--model', model)
  return args
}
