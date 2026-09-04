import type { AgentOptions } from '@shared/cost'
import { agentArgs } from './agent-args'

/**
 * M71. The argv for a headless `claude` process behind an agent session.
 *
 * Measured against claude 2.1.259 on 2026-09-03 (the M71 spec records each
 * flag's reason): without `--verbose` the stream carries only the final
 * result; without `--include-partial-messages` there are no token deltas;
 * without `--permission-prompt-tool stdio` a tool that needs approval is
 * DENIED automatically and no request ever reaches this app — the flag is
 * what makes a permission a question rather than a refusal.
 *
 * Exported so the real runner and the suite read one spelling.
 */
export const CLAUDE_HEADLESS_ARGS: readonly string[] = [
  '-p',
  '--output-format',
  'stream-json',
  '--input-format',
  'stream-json',
  '--verbose',
  '--include-partial-messages',
  '--permission-prompt-tool',
  'stdio'
]

export interface HeadlessArgsInput {
  /**
   * M81. Text appended to the CLI's own system prompt (`--append-system-prompt`)
   * — a supervisor's job description. It rides EVERY spawn of the session,
   * fresh or resumed: the CLI keeps no record of it, so a resumed supervisor
   * without it would quietly stop being one.
   */
  appendSystemPrompt?: string
  /** The CLI session UUID this app minted (or adopted from a restored panel). */
  sessionId: string
  /**
   * True when a process is being spawned for a conversation that already
   * ran: `--resume <id>` instead of `--session-id <id>`. Both name the same
   * UUID; the CLI refuses to CREATE a session at an id that already exists,
   * so the distinction is which verb, never which id.
   */
  resume: boolean
  agentOptions?: AgentOptions
}

/**
 * A DIFFERENT contract from `agentArgs`'s TUI argv (a TUI takes no
 * `--output-format`), so the base list is its own; the knobs and the session
 * pin go through `agentArgs` so a Claude flag spelling lives in exactly one
 * table (`AGENT_CAPABILITIES`), and a Codex-only option stays inert here
 * rather than being emitted under a foreign spelling.
 */
export function headlessArgs(input: HeadlessArgsInput): string[] {
  const base = [...CLAUDE_HEADLESS_ARGS]
  if (input.appendSystemPrompt !== undefined && input.appendSystemPrompt !== '') base.push('--append-system-prompt', input.appendSystemPrompt)
  if (input.resume) {
    base.push('--resume', input.sessionId)
    // sessionId '' makes agentArgs skip its --session-id pin.
    return agentArgs({ agent: 'claude-code', args: base, agentOptions: input.agentOptions }, '')
  }
  return agentArgs({ agent: 'claude-code', args: base, agentOptions: input.agentOptions }, input.sessionId)
}
