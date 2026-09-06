import type { TokenTotals } from './cost'
import type { ContentBlock, TranscriptEvent, OutgoingImage } from './transcript'

/**
 * M119. THE ACP CODEC — the Agent Client Protocol (JSON-RPC 2.0 over stdio,
 * both directions) to the SAME `TranscriptEvent` union claude's stream and
 * codex's JSONL parse to, plus the lines the app writes back. Measured
 * against `copilot --acp` 1.0.83 on 2026-09-06
 * (`scripts/fixtures/agent-session/acp/*.log`, recorded by `probe-client.cjs`).
 *
 * What is different about this wire, and where each difference lives:
 *   - It is REQUEST/RESPONSE. A response carries only an `id`, and a
 *     prompt's answer and a load's answer are the same JSON shape apart from
 *     it — so the codec keeps the PENDING map (id → method asked) in its
 *     state and matches every response to what was asked. A codec that
 *     guessed by shape would read a resumed session's history as a turn.
 *     Without the map every response is `unknown`, which is at least loud.
 *   - The agent REQUESTS too (`session/request_permission`, with an id of
 *     its own); the answer is a response line naming that id
 *     (`acpPermissionAnswer`). The option ids ride the event's
 *     `input.__options` so the one `answerPermission` door can map allow →
 *     `allow_once`, deny → `reject_once`, M98's grant → `allow_always`.
 *   - There is NO complete assistant record. Text arrives as
 *     `agent_message_chunk`s and nothing says "this message is done", so
 *     the codec accumulates the turn's text and flushes it as one
 *     `assistant` event when the turn's answer (or a tool call) arrives —
 *     the manager stores turns from complete records only, and a chat with
 *     deltas and no record would render live and then vanish on reload.
 *     `message-start` is emitted before the first chunk because the
 *     renderer's store drops a `block-start` with no message in flight.
 *   - `session/load` REPLAYS the history as the same update kinds before
 *     its own answer. While a load is pending every turn-shaped event is
 *     marked `replay: true`, which the manager skips (the transcript file
 *     already holds them); a codec that forgot would double every stored turn
 *     on every relaunch.
 *   - The client capabilities are both DECLINED (`ACP_CLIENT_CAPABILITIES`):
 *     copilot never asked for `fs/*` or `terminal/*` with both advertised —
 *     it runs its own tools — so a host answer would be code with no
 *     consumer, and a terminal the agent owns is a panel whose lifetime the
 *     registry does not own. `verify:agent-session acp.4` pins the object.
 *
 * Absent / malformed / unknown, as everywhere: a broken line is `malformed`,
 * an update kind this version has not seen is `unknown` BY KIND, a response
 * nobody asked for is `unknown`, a request the client declined the
 * capability for is `unknown` by method (never answered — the agent was
 * told), and housekeeping (`usage_update`, `available_commands_update`,
 * `session_info_update`, `config_option_update`, `plan` — no recording, its
 * chip is declined) is `ignored` by kind.
 *
 * Pure: no `electron`, no `node:*`; imports types only.
 */

/** The requests the client makes; a response is read by which of these it answers. */
export type AcpMethod = 'initialize' | 'session/new' | 'session/load' | 'session/prompt' | 'session/cancel'

/**
 * The codec's whole state between lines. Serialised as JSON into the
 * manager's per-process carry by the adapter (`main/backend-adapters.ts`),
 * so it dies with the process for free: a response to a dead process's
 * request can never match.
 */
export interface AcpState {
  /** id → the method asked, for every request not yet answered. */
  pending: Record<number, AcpMethod>
  /** A `session/load` is pending: every turn-shaped update is history. */
  loading: boolean
  /** The ACP session id, once minted (session/new) or named (session/load). */
  sessionId: string
  /** The next JSON-RPC id the encoders mint. */
  nextId: number
  /** The current turn's accumulated text, flushed as one assistant event. */
  text: string
  /** A `message-start` has been emitted for the accumulating text. */
  open: boolean
  /** The message id the open text will be stored under. */
  messageId: string
}

export function freshAcpState(): AcpState {
  return { pending: {}, loading: false, sessionId: '', nextId: 1, text: '', open: false, messageId: '' }
}

/**
 * Record a request the caller wrote, so its response is read by method.
 * Returns a new state. A `session/load` names the id it loads HERE: its
 * answer carries none (measured: `{ modes, configOptions }` only), so
 * without this the load's session event would name '' and the manager
 * would hold the first prompt forever.
 */
export function noteRequest(state: AcpState, id: number, method: AcpMethod, sessionId?: string): AcpState {
  return {
    ...state,
    pending: { ...state.pending, [id]: method },
    nextId: Math.max(state.nextId, id + 1),
    ...(method === 'session/load' ? { loading: true, sessionId: sessionId ?? state.sessionId } : {})
  }
}

/* ------------------------------------------------------------------------ */
/* The stdin direction                                                       */
/* ------------------------------------------------------------------------ */

/**
 * Both declined by measurement — see the header. Flipping one is the next
 * run's milestone (docs/ideas-backlog.md), and it is a client REQUEST
 * handler in the codec plus a `write` path in the manager, not a boolean.
 */
export const ACP_CLIENT_CAPABILITIES = Object.freeze({
  fs: Object.freeze({ readTextFile: false, writeTextFile: false }),
  terminal: false
})

export const ACP_PROTOCOL_VERSION = 1

const rpc = (id: number, method: string, params: Record<string, unknown>): string =>
  JSON.stringify({ jsonrpc: '2.0', id, method, params })

export function acpInitialize(id: number): string {
  return rpc(id, 'initialize', {
    protocolVersion: ACP_PROTOCOL_VERSION,
    clientCapabilities: { fs: { readTextFile: ACP_CLIENT_CAPABILITIES.fs.readTextFile, writeTextFile: ACP_CLIENT_CAPABILITIES.fs.writeTextFile }, terminal: ACP_CLIENT_CAPABILITIES.terminal },
    clientInfo: { name: 'terminal-canvas', version: '3' }
  })
}

export function acpSessionNew(id: number, cwd: string): string {
  return rpc(id, 'session/new', { cwd, mcpServers: [] })
}

export function acpSessionLoad(id: number, sessionId: string, cwd: string): string {
  return rpc(id, 'session/load', { sessionId, cwd, mcpServers: [] })
}

/**
 * The prompt. Text first, then each image as ACP's image block (base64
 * `data` with its `mimeType`) — the same order the claude encoder keeps. An
 * image-only message carries no empty text block.
 */
export function acpPrompt(id: number, sessionId: string, text: string, images: readonly OutgoingImage[] = []): string {
  const textBlocks = text === '' && images.length > 0 ? [] : [{ type: 'text', text }]
  return rpc(id, 'session/prompt', {
    sessionId,
    prompt: [...textBlocks, ...images.map((img) => ({ type: 'image', mimeType: img.mediaType, data: img.base64 }))]
  })
}

/** A NOTIFICATION (no id): the agent answers by ending the prompt with stopReason `cancelled`. */
export function acpCancel(sessionId: string): string {
  return JSON.stringify({ jsonrpc: '2.0', method: 'session/cancel', params: { sessionId } })
}

/**
 * The answer to `session/request_permission`. `requestId` is the agent's
 * JSON-RPC id as the event carried it (a string, like every requestId in the
 * union); it goes back as the number it was, or the agent will not match it.
 */
export function acpPermissionAnswer(requestId: string, optionId: string): string {
  const n = Number(requestId)
  const id: number | string = requestId !== '' && Number.isFinite(n) && String(n) === requestId ? n : requestId
  return JSON.stringify({ jsonrpc: '2.0', id, result: { outcome: { outcome: 'selected', optionId } } })
}

/**
 * The option id for an answer, from the ids the request carried
 * (`input.__options`). A grant picks `allow_always` when the agent offered
 * it — the first vendor with M98's own word — and falls back to `allow_once`
 * (a grant still answers THIS request). Deny is `reject_once`. When the
 * agent's option ids are not the measured three, the first id whose name
 * starts with the same word is taken; with none, the first option at all,
 * so an answer is always an answer the agent listed.
 */
export function acpOptionFor(options: readonly string[], answer: { allow: boolean }, grant: boolean): string {
  const pick = (...wanted: string[]): string | undefined => {
    for (const w of wanted) { const hit = options.find((o) => o === w); if (hit !== undefined) return hit }
    for (const w of wanted) { const hit = options.find((o) => o.startsWith(w.split('_')[0] ?? w)); if (hit !== undefined) return hit }
    return undefined
  }
  const chosen = answer.allow ? (grant ? pick('allow_always', 'allow_once') : pick('allow_once', 'allow_always')) : pick('reject_once', 'reject_always')
  return chosen ?? options[0] ?? (answer.allow ? 'allow_once' : 'reject_once')
}

/* ------------------------------------------------------------------------ */
/* The stdout direction                                                      */
/* ------------------------------------------------------------------------ */

const PREVIEW_MAX = 80
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** Module-lifetime, like codex's: an id must not repeat across a respawn, or the manager merges two messages. */
let messageSeq = 0
const nextMessageId = (): string => `acp-m-${++messageSeq}`

const IGNORED_UPDATES = new Set(['usage_update', 'available_commands_update', 'session_info_update', 'config_option_update', 'current_mode_update', 'plan', 'agent_thought_chunk'])

interface Out { events: TranscriptEvent[]; state: AcpState }

/**
 * Parse ONE agent line against the state. Never throws. Returns the events
 * (zero to several — a flushed turn is several) and the next state.
 */
export function parseAcpLine(line: string, state: AcpState): Out {
  let raw: unknown
  try {
    raw = JSON.parse(line)
  } catch {
    return { events: [{ type: 'malformed', preview: line.slice(0, PREVIEW_MAX) }], state }
  }
  if (!isRecord(raw) || raw.jsonrpc !== '2.0') return { events: [{ type: 'malformed', preview: line.slice(0, PREVIEW_MAX) }], state }
  const method = str(raw.method)
  const hasId = typeof raw.id === 'number' || typeof raw.id === 'string'
  if (method === undefined && hasId) return response(raw, state)
  if (method !== undefined && hasId) return request(raw, method, state)
  if (method !== undefined) return notification(raw, method, state)
  return { events: [{ type: 'malformed', preview: line.slice(0, PREVIEW_MAX) }], state }
}

/** A response: read by the method it answers. */
function response(raw: Record<string, unknown>, state: AcpState): Out {
  const id = typeof raw.id === 'number' ? raw.id : Number(raw.id)
  const asked = state.pending[id]
  if (asked === undefined) return { events: [{ type: 'unknown', kind: `response/${String(raw.id)}` }], state }
  const pending = { ...state.pending }
  delete pending[id]
  let next: AcpState = { ...state, pending }
  if (isRecord(raw.error)) {
    // An error on ANY request is a failed result: on the prompt it is the
    // turn's; on the handshake it is the turn the manager was holding, which
    // ends the same way (the manager clears its hold on a result).
    const message = str(raw.error.message) ?? `${asked} failed`
    const flushed = flushText(next, undefined)
    next = { ...flushed.state, loading: asked === 'session/load' ? false : next.loading }
    return { events: [...flushed.events, { type: 'result', ok: false, subtype: 'error', error: message }], state: next }
  }
  const result = isRecord(raw.result) ? raw.result : {}
  switch (asked) {
    case 'initialize': {
      const caps = isRecord(result.agentCapabilities) ? result.agentCapabilities : {}
      const prompt = isRecord(caps.promptCapabilities) ? caps.promptCapabilities : {}
      const info = isRecord(result.agentInfo) ? result.agentInfo : {}
      // sessionId '' — no session exists yet; the manager adopts only a
      // non-empty id, and reads `negotiated` from this one.
      return {
        events: [{
          type: 'session',
          sessionId: '',
          version: str(info.version),
          negotiated: {
            ...(typeof caps.loadSession === 'boolean' ? { loadSession: caps.loadSession } : {}),
            ...(typeof prompt.image === 'boolean' ? { image: prompt.image } : {})
          }
        }],
        state: next
      }
    }
    case 'session/new': {
      const sessionId = str(result.sessionId) ?? ''
      if (sessionId === '') return { events: [{ type: 'malformed', preview: 'session/new answered with no sessionId' }], state: next }
      return { events: [{ type: 'session', sessionId }], state: { ...next, sessionId } }
    }
    case 'session/load':
      return { events: [{ type: 'session', sessionId: next.sessionId }], state: { ...next, loading: false } }
    case 'session/prompt': {
      const flushed = flushText(next, str(result.stopReason))
      const usage = parseUsage(result.usage)
      return {
        events: [...flushed.events, { type: 'result', ok: true, subtype: 'success', stopReason: str(result.stopReason), ...(usage === undefined ? {} : { usage }) }],
        state: flushed.state
      }
    }
    case 'session/cancel':
      return { events: [{ type: 'ignored', kind: 'response/session/cancel' }], state: next }
  }
}

/** Input/output plus the two cache classes; absent is absent (never zero). */
function parseUsage(raw: unknown): TokenTotals | undefined {
  if (!isRecord(raw)) return undefined
  return { input: num(raw.inputTokens), output: num(raw.outputTokens), cacheRead: num(raw.cachedReadTokens), cacheWrite: num(raw.cachedWriteTokens) }
}

/** An agent → client REQUEST (it has an id we must answer). */
function request(raw: Record<string, unknown>, method: string, state: AcpState): Out {
  const params = isRecord(raw.params) ? raw.params : {}
  if (method === 'session/request_permission') {
    const call = isRecord(params.toolCall) ? params.toolCall : {}
    const options = Array.isArray(params.options)
      ? params.options.map((o) => (isRecord(o) ? str(o.optionId) : undefined)).filter((o): o is string => o !== undefined)
      : []
    const input = isRecord(call.rawInput) ? call.rawInput : {}
    return {
      events: [{
        type: 'permission-request',
        requestId: String(raw.id),
        toolName: str(call.kind) ?? 'tool',
        // The option ids ride the input under a name no tool input uses, so
        // the one answer door can map allow/deny/grant to what was offered.
        input: { ...input, __options: options },
        description: str(call.title),
        toolUseId: str(call.toolCallId)
      }],
      state
    }
  }
  // fs/read_text_file, fs/write_text_file, terminal/*: capabilities this
  // client DECLINED in initialize. Counted, never answered — an agent that
  // asks anyway was told not to, and a silent stub reply would be a
  // capability nobody measured.
  return { events: [{ type: 'unknown', kind: `request/${method}` }], state }
}

/** A notification: `session/update` is the stream; anything else is unknown by method. */
function notification(raw: Record<string, unknown>, method: string, state: AcpState): Out {
  if (method !== 'session/update') return { events: [{ type: 'unknown', kind: `notification/${method}` }], state }
  const params = isRecord(raw.params) ? raw.params : {}
  const update = isRecord(params.update) ? params.update : {}
  const kind = str(update.sessionUpdate)
  if (kind === undefined) return { events: [{ type: 'malformed', preview: 'session/update with no sessionUpdate' }], state }
  switch (kind) {
    case 'agent_message_chunk': {
      const content = isRecord(update.content) ? update.content : {}
      if (content.type !== 'text') return { events: [{ type: 'ignored', kind: `session/update/agent_message_chunk/${str(content.type) ?? 'missing'}` }], state }
      const text = str(content.text) ?? ''
      if (state.loading) {
        // History: complete and stored already. One assistant event per
        // chunk, marked replay so the manager skips it.
        return { events: [{ type: 'assistant', messageId: nextMessageId(), blocks: [{ type: 'text', text }], replay: true }], state }
      }
      const events: TranscriptEvent[] = []
      let next = state
      if (!next.open) {
        const messageId = nextMessageId()
        next = { ...next, open: true, messageId, text: '' }
        events.push({ type: 'message-start', messageId }, { type: 'block-start', index: 0, block: { type: 'text', text: '' } })
      }
      events.push({ type: 'block-delta', index: 0, delta: 'text', text })
      return { events, state: { ...next, text: next.text + text } }
    }
    case 'user_message_chunk': {
      const content = isRecord(update.content) ? update.content : {}
      const text = str(content.text) ?? ''
      return { events: [{ type: 'user', blocks: [{ type: 'text', text }], replay: state.loading }], state }
    }
    case 'tool_call': {
      // Text said before a tool call is its own turn — claude's shape, where
      // a tool_use message follows the text message.
      const flushed = flushText(state, undefined)
      const id = str(update.toolCallId) ?? nextMessageId()
      const use: ContentBlock = { type: 'tool_use', id, name: str(update.kind) ?? 'tool', input: isRecord(update.rawInput) ? update.rawInput : {} }
      return {
        events: [...flushed.events, { type: 'assistant', messageId: `${id}:use`, blocks: [use], ...(state.loading ? { replay: true as const } : {}) }],
        state: flushed.state
      }
    }
    case 'tool_call_update': {
      const status = str(update.status)
      // Progress with no status is the tool still running: nothing to store.
      if (status !== 'completed' && status !== 'failed') return { events: [{ type: 'ignored', kind: 'session/update/tool_call_update' }], state }
      const id = str(update.toolCallId) ?? ''
      const result: ContentBlock = { type: 'tool_result', toolUseId: id, content: toolOutput(update), isError: status === 'failed' }
      return { events: [{ type: 'user', blocks: [result], replay: state.loading }], state }
    }
    default:
      if (IGNORED_UPDATES.has(kind)) return { events: [{ type: 'ignored', kind: `session/update/${kind}` }], state }
      return { events: [{ type: 'unknown', kind: `session/update/${kind}` }], state }
  }
}

/**
 * A tool's output text. `content[]` (text parts) when the update carries
 * it, else `rawOutput.content` when that is a string — measured: the execute
 * kind sends both, the read kind only the raw one.
 */
function toolOutput(update: Record<string, unknown>): string {
  if (Array.isArray(update.content)) {
    const parts: string[] = []
    for (const part of update.content) {
      if (!isRecord(part)) continue
      const inner = isRecord(part.content) ? part.content : part
      if (inner.type === 'text' && typeof inner.text === 'string') parts.push(inner.text)
    }
    if (parts.length > 0) return parts.join('\n')
  }
  const raw = isRecord(update.rawOutput) ? update.rawOutput : {}
  return str(raw.content) ?? ''
}

/** The accumulated text as one stored assistant turn; nothing when nothing accumulated. */
function flushText(state: AcpState, stopReason: string | undefined): Out {
  if (!state.open) return { events: [], state }
  return {
    events: [
      { type: 'block-stop', index: 0 },
      { type: 'message-end', ...(stopReason === undefined ? {} : { stopReason }) },
      { type: 'assistant', messageId: state.messageId, blocks: [{ type: 'text', text: state.text }] }
    ],
    state: { ...state, open: false, text: '', messageId: '' }
  }
}

/* ------------------------------------------------------------------------ */
/* The carry: the adapter's per-process string                               */
/* ------------------------------------------------------------------------ */

/**
 * The manager's carry is a STRING by contract (one field, reset on every
 * spawn and every exit). The adapter rides the codec's state in it as JSON
 * beside the unparsed line fragment; '' is a fresh process.
 */
export function readAcpCarry(carry: string): { rest: string; state: AcpState } {
  if (carry === '') return { rest: '', state: freshAcpState() }
  try {
    const parsed: unknown = JSON.parse(carry)
    if (isRecord(parsed) && typeof parsed.rest === 'string' && isRecord(parsed.state)) return { rest: parsed.rest, state: parsed.state as unknown as AcpState }
  } catch { /* a carry this codec did not write: start fresh below */ }
  return { rest: '', state: freshAcpState() }
}

export function writeAcpCarry(rest: string, state: AcpState): string {
  return JSON.stringify({ rest, state })
}

/** The chunk parser with the carry contract `parseStreamChunk` has. */
export function parseAcpChunk(chunk: string, carry: string): { events: TranscriptEvent[]; carry: string } {
  const { rest, state } = readAcpCarry(carry)
  const lines = (rest + chunk).split('\n')
  const nextRest = lines.pop() ?? ''
  const events: TranscriptEvent[] = []
  let s = state
  for (const line of lines) {
    if (line.trim() === '') continue
    const out = parseAcpLine(line, s)
    s = out.state
    events.push(...out.events)
  }
  return { events, carry: writeAcpCarry(nextRest, s) }
}
