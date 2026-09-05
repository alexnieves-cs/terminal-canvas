import type { TokenTotals, AgentOptions } from './cost'
import { AGENT_CAPABILITIES } from './cost'
import type { ContentBlock, TranscriptEvent } from './transcript'

/**
 * M90. THE CODEX ADAPTER — `codex exec --json`'s JSONL to the SAME
 * `TranscriptEvent` union claude's stream parses to, so nothing above the
 * runtime learns which vendor answered. Measured against codex-cli 0.153.4
 * (`scripts/fixtures/agent-session/codex/*.jsonl`), on 2026-09-05.
 *
 * The shape differences that matter, each handled here and nowhere else:
 *   - The prompt is an ARGUMENT and the process runs ONE turn, so there is
 *     no stdin encoder and `codexArgs` takes the text. `exec resume <id>`
 *     names the thread on every later turn (the CLI mints the id; the
 *     runtime adopts it from `thread.started`).
 *   - No deltas: an `agent_message` arrives complete, as one assistant
 *     event. A `command_execution` is a tool_use block (`Bash`, the command)
 *     paired with a tool_result under the SAME id, which is exactly the
 *     pair the chat panel's rows already render for claude.
 *   - No cost figure: `turn.completed` carries tokens only. `costUsd` stays
 *     absent, so the summary prices nothing rather than pricing wrongly
 *     (`transcriptAccounting: false` on the capability, M20's rule).
 *   - No interrupt door and no permission request — the manager names
 *     both refusals; this file only never emits them.
 *
 * Absent / malformed / unknown, as everywhere: a broken line is `malformed`,
 * a top-level type this version has not seen is `unknown` BY KIND (a counter
 * on the session, never a shorter transcript), and an item kind this app
 * does not render (`reasoning`, `todo_list`…) is `ignored` by kind.
 */

const PREVIEW_MAX = 80

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/**
 * One line yields ZERO to TWO events: a `command_execution` is the tool_use
 * and its tool_result, which claude would have sent as two records. An
 * array rather than a disguised union member, so the union stays claude's.
 */
export function parseCodexLine(line: string): TranscriptEvent[] {
  let raw: unknown
  try {
    raw = JSON.parse(line)
  } catch {
    return [{ type: 'malformed', preview: line.slice(0, PREVIEW_MAX) }]
  }
  if (!isRecord(raw) || typeof raw.type !== 'string') return [{ type: 'malformed', preview: line.slice(0, PREVIEW_MAX) }]
  return [parseRecord(raw, line)].flat()
}

function parseRecord(raw: Record<string, unknown>, line: string): TranscriptEvent | TranscriptEvent[] {
  switch (raw.type) {
    case 'thread.started':
      return typeof raw.thread_id === 'string' && raw.thread_id !== ''
        ? { type: 'session', sessionId: raw.thread_id }
        : { type: 'malformed', preview: line.slice(0, PREVIEW_MAX) }
    case 'turn.started':
    case 'item.started':
    case 'item.updated':
      return { type: 'ignored', kind: raw.type }
    case 'item.completed':
      return itemCompleted(raw.item)
    case 'turn.completed': {
      if (!isRecord(raw.usage)) return { type: 'result', ok: true, subtype: 'success' }
      const usage = raw.usage
      const totals: TokenTotals = {
        input: num(usage.input_tokens) - num(usage.cached_input_tokens) - num(usage.cache_write_input_tokens),
        output: num(usage.output_tokens),
        cacheWrite: num(usage.cache_write_input_tokens),
        cacheRead: num(usage.cached_input_tokens)
      }
      if (totals.input < 0) totals.input = 0
      return { type: 'result', ok: true, subtype: 'success', usage: totals }
    }
    case 'turn.failed':
      return { type: 'result', ok: false, subtype: 'turn.failed', error: isRecord(raw.error) && typeof raw.error.message === 'string' ? raw.error.message : 'the turn failed' }
    case 'error':
      return { type: 'result', ok: false, subtype: 'error', error: typeof raw.message === 'string' ? raw.message : 'codex reported an error' }
    default:
      return { type: 'unknown', kind: String(raw.type) }
  }
}

let syntheticSeq = 0

function itemCompleted(item: unknown): TranscriptEvent | TranscriptEvent[] {
  if (!isRecord(item) || typeof item.type !== 'string') return { type: 'ignored', kind: 'item:?' }
  const id = typeof item.id === 'string' && item.id !== '' ? item.id : `codex-item-${++syntheticSeq}`
  switch (item.type) {
    case 'agent_message':
      return { type: 'assistant', messageId: id, blocks: [{ type: 'text', text: typeof item.text === 'string' ? item.text : '' }] }
    case 'command_execution': {
      const exit = typeof item.exit_code === 'number' ? item.exit_code : null
      const use: ContentBlock = { type: 'tool_use', id, name: 'Bash', input: { command: typeof item.command === 'string' ? item.command : '' } }
      const result: ContentBlock = {
        type: 'tool_result',
        toolUseId: id,
        content: typeof item.aggregated_output === 'string' ? item.aggregated_output : '',
        isError: exit !== null && exit !== 0
      }
      // Two events, assistant then user, so the store's tool rows match
      // claude's shape exactly (a tool_use turn, then its result).
      return [
        { type: 'assistant', messageId: `${id}:use`, blocks: [use] },
        { type: 'user', blocks: [result], replay: false }
      ]
    }
    default:
      return { type: 'ignored', kind: `item:${item.type}` }
  }
}

/** The line parser over a chunk with a carry, the same contract as `parseStreamChunk`. */
export function parseCodexChunk(chunk: string, carry: string): { events: TranscriptEvent[]; carry: string } {
  const text = carry + chunk
  const lines = text.split('\n')
  const rest = lines.pop() ?? ''
  const events: TranscriptEvent[] = []
  for (const line of lines) {
    if (line.trim() === '') continue
    events.push(...parseCodexLine(line))
  }
  return { events, carry: rest }
}

/** Every event a line yields, expanded — what the checks read one line at a time. */
export function parseCodexLines(lines: readonly string[]): TranscriptEvent[] {
  return lines.flatMap((l) => parseCodexLine(l))
}

export interface CodexArgsInput {
  cwd: string
  text: string
  resume: boolean
  /** The thread id, when resuming. */
  sessionId: string
  agentOptions?: AgentOptions
}

/**
 * The argv. First turn: `exec --json -C <cwd> --skip-git-repo-check
 * [--sandbox …] [--model …] [--ask-for-approval …] <prompt>`. Later turns:
 * `exec resume <thread> <prompt> --json` — the resume subcommand takes the
 * prompt positionally after the id and accepts the JSON flag after it.
 * `--skip-git-repo-check` because a chat's directory need not be a
 * repository and codex refuses to start in one that is not, with a prompt
 * this app has no stdin to answer.
 */
export function codexArgs(input: CodexArgsInput): string[] {
  if (input.resume) return ['exec', 'resume', input.sessionId, input.text, '--json']
  const args = ['exec', '--json', '-C', input.cwd, '--skip-git-repo-check']
  const flags = AGENT_CAPABILITIES.codex.flags
  const options: AgentOptions = input.agentOptions ?? {}
  for (const key of Object.keys(flags) as (keyof AgentOptions)[]) {
    const value = options[key]
    const flag = flags[key]
    if (value !== undefined && flag !== undefined) args.push(flag, value)
  }
  args.push(input.text)
  return args
}
