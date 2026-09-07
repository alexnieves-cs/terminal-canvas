import type { TokenTotals } from './cost'

/**
 * M71. The transcript schema and the line parser for an agent conversation,
 * in a shape with no screen in it.
 *
 * This file parses the stream the `claude` CLI emits in headless mode
 * (`-p --output-format stream-json --verbose --include-partial-messages`)
 * and encodes the lines the app writes back on its stdin. It is another
 * program's wire format, measured against claude 2.1.259 on 2026-09-03 and
 * recorded in the M71 spec; it WILL change in a release with nothing here to
 * notice, which is why every parse below follows the discipline every other
 * parser in this repository already does:
 *
 *   - An ABSENT field is absent (usage undefined, never zero; stopReason
 *     undefined, never 'end_turn').
 *   - A present-but-MALFORMED value costs that value (a non-numeric token
 *     count is 0 and its siblings survive; a non-object block is dropped).
 *   - A MALFORMED LINE costs that line and nothing else.
 *   - An UNKNOWN record type is REPORTED as `unknown` with its kind, never
 *     dropped, so a new CLI version shows up as a non-zero counter on the
 *     session rather than as a transcript that quietly got shorter.
 *   - An unknown BLOCK type is KEPT as a placeholder, so a rendered turn says
 *     "a block this version cannot render" instead of silently omitting it.
 *
 * Pure and import-free apart from a type, so it runs in the plain-node
 * verify tier and can be imported by the renderer for rendering without
 * dragging main-process code across the bridge.
 */

/** One block of a turn's content. */
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; toolUseId: string; content: string; isError: boolean }
  /**
   * M75. An image the user attached — a PLACEHOLDER: the media type and the
   * byte count, never the bytes, so the transcript file and the store stay
   * small and a rendered turn says `image · 42 KB`.
   */
  | { type: 'image'; mediaType: string; size: number }
  /** A block type this version has never seen. Kept, never dropped. */
  | { type: 'unknown'; kind: string }

/**
 * One turn of a conversation, as stored. Assembled from the CLI's COMPLETE
 * records (`assistant`, `user`), never from deltas — a dropped delta cannot
 * corrupt what is stored, and the store is exactly what the CLI said.
 */
export interface TranscriptTurn {
  /** The API message id for an assistant turn; app-minted for a user turn. */
  id: string
  role: 'user' | 'assistant'
  blocks: ContentBlock[]
  model?: string
  usage?: TokenTotals
  /** Wall-clock ms when the turn was stored. */
  at: number
}

/** What one stdout line parses to. */
export type TranscriptEvent =
  | {
      type: 'session'
      /** M119. '' from an ACP `initialize` answer: no session exists yet; the manager adopts only a non-empty id. */
      sessionId: string
      model?: string
      cwd?: string
      version?: string
      /** M119. What the handshake ANSWERED (ACP's agentCapabilities) — the measured fact that outranks the row's promise. Absent for every other backend. */
      negotiated?: { loadSession?: boolean; image?: boolean }
    }
  | { type: 'message-start'; messageId: string; model?: string }
  | { type: 'block-start'; index: number; block: ContentBlock }
  | { type: 'block-delta'; index: number; delta: 'text' | 'thinking' | 'input-json'; text: string }
  | { type: 'block-stop'; index: number }
  | { type: 'message-end'; stopReason?: string }
  /** M119. `replay` marks history an ACP `session/load` replays: stored already, the manager skips it. Absent everywhere else. */
  | { type: 'assistant'; messageId: string; model?: string; blocks: ContentBlock[]; usage?: TokenTotals; replay?: true }
  | { type: 'user'; blocks: ContentBlock[]; replay: boolean }
  | {
      type: 'result'
      ok: boolean
      subtype: string
      stopReason?: string
      usage?: TokenTotals
      /** CUMULATIVE across the process, measured. Take the latest, never sum. */
      costUsd?: number
      durationMs?: number
      numTurns?: number
      text?: string
      sessionId?: string
      error?: string
    }
  | {
      type: 'permission-request'
      requestId: string
      toolName: string
      input: Record<string, unknown>
      description?: string
      toolUseId?: string
    }
  | { type: 'control-response'; requestId: string; ok: boolean; error?: string }
  /** A record this app knows and has no use for (hooks, status, rate limits). */
  | { type: 'ignored'; kind: string }
  /** A record type or system subtype this version has never seen. */
  | { type: 'unknown'; kind: string }
  /** Not JSON, or JSON that is not an object with a string `type`. */
  | { type: 'malformed'; preview: string }

/** Absent is 0, never NaN: one NaN poisons every later addition silently. */
function num(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
}

function str(raw: unknown): string | undefined {
  return typeof raw === 'string' ? raw : undefined
}

function finite(raw: unknown): number | undefined {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined
}

/** Four classes, never two — see shared/cost.ts. Absent usage is absent. */
function parseUsage(raw: unknown): TokenTotals | undefined {
  if (!isRecord(raw)) return undefined
  return {
    input: num(raw.input_tokens),
    output: num(raw.output_tokens),
    cacheWrite: num(raw.cache_creation_input_tokens),
    cacheRead: num(raw.cache_read_input_tokens)
  }
}

/**
 * The text of a tool result. The CLI sends either a string or an array of
 * blocks (text and image parts). Text parts are joined on newlines; an image
 * is marked rather than dropped, so a turn that showed the agent a picture
 * says so.
 */
function resultContent(raw: unknown): string {
  if (typeof raw === 'string') return raw
  if (!Array.isArray(raw)) return ''
  const parts: string[] = []
  for (const part of raw) {
    if (!isRecord(part)) continue
    if (part.type === 'text' && typeof part.text === 'string') parts.push(part.text)
    else if (part.type === 'image') parts.push('[image]')
  }
  return parts.join('\n')
}

/** One block. `undefined` for a block that is not even an object. */
function parseBlock(raw: unknown): ContentBlock | undefined {
  if (!isRecord(raw)) return undefined
  const type = str(raw.type)
  if (type === undefined) return undefined
  switch (type) {
    case 'text':
      return { type: 'text', text: str(raw.text) ?? '' }
    case 'thinking':
      return { type: 'thinking', text: str(raw.thinking) ?? '' }
    case 'tool_use':
      return {
        type: 'tool_use',
        id: str(raw.id) ?? '',
        name: str(raw.name) ?? '',
        // A malformed input is an empty object, never the raw value: the
        // renderer indexes it, and a string here would render one character
        // per key.
        input: isRecord(raw.input) ? raw.input : {}
      }
    case 'tool_result':
      return {
        type: 'tool_result',
        toolUseId: str(raw.tool_use_id) ?? '',
        content: resultContent(raw.content),
        isError: raw.is_error === true
      }
    case 'image': {
      // The CLI's file echoes a user's image block with its bytes; only the
      // placeholder is kept (M75).
      const source = isRecord(raw.source) ? raw.source : {}
      const data = str(source.data) ?? ''
      const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0
      return { type: 'image', mediaType: str(source.media_type) ?? 'image', size: Math.max(0, Math.floor((data.length * 3) / 4) - padding) }
    }
    default:
      return { type: 'unknown', kind: type }
  }
}

function parseBlocks(raw: unknown): ContentBlock[] {
  if (!Array.isArray(raw)) return []
  const blocks: ContentBlock[] = []
  for (const item of raw) {
    const block = parseBlock(item)
    if (block !== undefined) blocks.push(block)
  }
  return blocks
}

/** Known `system` subtypes this app has no use for. Anything else is unknown. */
const IGNORED_SYSTEM = new Set([
  'status',
  'thinking_tokens',
  'hook_started',
  'hook_progress',
  'hook_response',
  'permission_denied',
  'compact_boundary'
])

/** Known top-level types this app has no use for. */
const IGNORED_TOP = new Set(['rate_limit_event', 'tool_progress'])

const PREVIEW_MAX = 80

function malformed(line: string): TranscriptEvent {
  return { type: 'malformed', preview: line.slice(0, PREVIEW_MAX) }
}

function parseStreamEvent(raw: Record<string, unknown>): TranscriptEvent {
  const event = raw.event
  if (!isRecord(event)) return { type: 'unknown', kind: 'stream_event' }
  const kind = str(event.type)
  switch (kind) {
    case 'message_start': {
      const message = isRecord(event.message) ? event.message : {}
      return { type: 'message-start', messageId: str(message.id) ?? '', model: str(message.model) }
    }
    case 'content_block_start': {
      const block = parseBlock(event.content_block) ?? { type: 'unknown', kind: 'missing' }
      return { type: 'block-start', index: num(event.index), block }
    }
    case 'content_block_delta': {
      const delta = isRecord(event.delta) ? event.delta : {}
      const index = num(event.index)
      switch (str(delta.type)) {
        case 'text_delta':
          return { type: 'block-delta', index, delta: 'text', text: str(delta.text) ?? '' }
        case 'thinking_delta':
          return { type: 'block-delta', index, delta: 'thinking', text: str(delta.thinking) ?? '' }
        case 'input_json_delta':
          return { type: 'block-delta', index, delta: 'input-json', text: str(delta.partial_json) ?? '' }
        case 'signature_delta':
          return { type: 'ignored', kind: 'stream_event/signature_delta' }
        default:
          return { type: 'unknown', kind: `stream_event/${str(delta.type) ?? 'delta'}` }
      }
    }
    case 'content_block_stop':
      return { type: 'block-stop', index: num(event.index) }
    case 'message_delta': {
      const delta = isRecord(event.delta) ? event.delta : {}
      return { type: 'message-end', stopReason: str(delta.stop_reason) }
    }
    case 'message_stop':
      return { type: 'ignored', kind: 'stream_event/message_stop' }
    default:
      return { type: 'unknown', kind: `stream_event/${kind ?? 'missing'}` }
  }
}

/**
 * Parse ONE stdout line. Never throws.
 */
export function parseStreamLine(line: string): TranscriptEvent {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return malformed(line)
  }
  if (!isRecord(parsed)) return malformed(line)
  const type = str(parsed.type)
  if (type === undefined) return malformed(line)

  switch (type) {
    case 'system': {
      const subtype = str(parsed.subtype)
      if (subtype === 'init') {
        return {
          type: 'session',
          sessionId: str(parsed.session_id) ?? '',
          model: str(parsed.model),
          cwd: str(parsed.cwd),
          version: str(parsed.claude_code_version)
        }
      }
      if (subtype !== undefined && IGNORED_SYSTEM.has(subtype)) return { type: 'ignored', kind: `system/${subtype}` }
      return { type: 'unknown', kind: `system/${subtype ?? 'missing'}` }
    }
    case 'stream_event':
      return parseStreamEvent(parsed)
    case 'assistant': {
      const message = isRecord(parsed.message) ? parsed.message : {}
      return {
        type: 'assistant',
        messageId: str(message.id) ?? '',
        model: str(message.model),
        blocks: parseBlocks(message.content),
        usage: parseUsage(message.usage)
      }
    }
    case 'user': {
      const message = isRecord(parsed.message) ? parsed.message : {}
      // M74. The CLI's own transcript writes a typed prompt as a bare STRING
      // (the stream never does); it is one text block, never an empty turn.
      const blocks = typeof message.content === 'string'
        ? [{ type: 'text' as const, text: message.content }]
        : parseBlocks(message.content)
      return { type: 'user', blocks, replay: parsed.isReplay === true }
    }
    case 'result': {
      const subtype = str(parsed.subtype) ?? 'missing'
      const errors = Array.isArray(parsed.errors)
        ? parsed.errors.filter((e): e is string => typeof e === 'string').join('; ')
        : undefined
      const isError = parsed.is_error === true || subtype !== 'success'
      return {
        type: 'result',
        ok: !isError,
        subtype,
        stopReason: str(parsed.stop_reason),
        usage: parseUsage(parsed.usage),
        costUsd: finite(parsed.total_cost_usd),
        durationMs: finite(parsed.duration_ms),
        numTurns: finite(parsed.num_turns),
        text: str(parsed.result),
        sessionId: str(parsed.session_id),
        error: isError ? (errors && errors.length > 0 ? errors : subtype) : undefined
      }
    }
    case 'control_request': {
      const request = isRecord(parsed.request) ? parsed.request : {}
      if (request.subtype === 'can_use_tool') {
        return {
          type: 'permission-request',
          requestId: str(parsed.request_id) ?? '',
          toolName: str(request.tool_name) ?? '',
          input: isRecord(request.input) ? request.input : {},
          description: str(request.description),
          toolUseId: str(request.tool_use_id)
        }
      }
      return { type: 'unknown', kind: `control_request/${str(request.subtype) ?? 'missing'}` }
    }
    case 'control_response': {
      const response = isRecord(parsed.response) ? parsed.response : {}
      const ok = response.subtype === 'success'
      return {
        type: 'control-response',
        requestId: str(response.request_id) ?? '',
        ok,
        error: ok ? undefined : str(response.error) ?? str(response.subtype) ?? 'error'
      }
    }
    default:
      if (IGNORED_TOP.has(type)) return { type: 'ignored', kind: type }
      return { type: 'unknown', kind: type }
  }
}

/**
 * Parse the bytes read since the last call, plus the fragment that read
 * ended on.
 *
 * The carry is the parser's whole correctness (usage-parse.ts's rule): a read
 * lands wherever the pipe buffer breaks, so the last line routinely arrives
 * without its newline. Parsing it fails; DROPPING it loses that record — a
 * result that never prices its turn, a delta that never renders — and
 * parsing it twice counts a turn twice. The trailing element after the last
 * newline is never parsed and is prepended to the next chunk.
 */
export function parseStreamChunk(
  text: string,
  carry: string
): { events: TranscriptEvent[]; carry: string } {
  const whole = carry + text
  const lines = whole.split('\n')
  const nextCarry = lines.pop() ?? ''
  const events: TranscriptEvent[] = []
  for (const line of lines) {
    if (line.trim() === '') continue
    events.push(parseStreamLine(line))
  }
  return { events, carry: nextCarry }
}

/* ------------------------------------------------------------------------ */
/* The stdin direction                                                       */
/* ------------------------------------------------------------------------ */

/**
 * One user message, as the CLI's `--input-format stream-json` reads it. The
 * newline is the CALLER's: `JSON.stringify` never emits a raw newline, so the
 * line is one line by construction, and the writer appends the terminator.
 */
export interface OutgoingImage {
  mediaType: string
  base64: string
}

/**
 * M75. Images ride as base64 image blocks AFTER the text — the API's own
 * content-block shape, which the CLI's stream-json input accepts verbatim.
 */
export function userMessageLine(text: string, images: readonly OutgoingImage[] = []): string {
  // An image-only message carries NO empty text block: the API refuses one.
  const textBlocks = text === '' && images.length > 0 ? [] : [{ type: 'text', text }]
  return JSON.stringify({
    type: 'user',
    message: {
      role: 'user',
      content: [
        ...textBlocks,
        ...images.map((img) => ({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.base64 } }))
      ]
    }
  })
}

export function interruptLine(requestId: string): string {
  return JSON.stringify({
    type: 'control_request',
    request_id: requestId,
    request: { subtype: 'interrupt' }
  })
}

export type PermissionAnswer = { allow: true } | { allow: false; message: string }

/**
 * The answer to a `can_use_tool` request. `updatedInput` echoes the input
 * unchanged: the CLI's contract lets a host rewrite the tool's input on
 * allow, and this app never does, so the echo is the whole of that field.
 */
export function permissionResponseLine(
  requestId: string,
  input: Record<string, unknown>,
  answer: PermissionAnswer
): string {
  const response = answer.allow
    ? { behavior: 'allow', updatedInput: input }
    : { behavior: 'deny', message: answer.message }
  return JSON.stringify({
    type: 'control_response',
    response: { subtype: 'success', request_id: requestId, response }
  })
}
