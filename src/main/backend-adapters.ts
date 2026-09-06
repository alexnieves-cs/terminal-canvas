import type { AgentOptions } from '@shared/cost'
import { BACKENDS, type AgentBackend } from '@shared/agent-backends'
import { parseStreamChunk, type TranscriptEvent } from '@shared/transcript'
import { codexArgs, parseCodexChunk } from '@shared/codex-transcript'
import { copilotArgs, parseCopilotChunk } from '@shared/copilot-transcript'
import { headlessArgs } from './agent-session-args'

/**
 * M99. The PROCESS half of the registry: each backend's argv builder and
 * line parser, keyed by id so the manager spawns and reads through one
 * lookup rather than a switch. It lives in main (not beside `BACKENDS`)
 * because the claude builder does — `agent-session-args.ts` is main's, and
 * `shared` never imports from `main`.
 *
 * `args` takes ONE input shape for every backend and each builder reads the
 * fields it has a flag for: claude ignores `text` (the message goes on
 * stdin) and `cwd` (the spawn's), codex ignores `appendSystemPrompt` (no
 * flag — a codex supervisor would silently not be one, which is why the
 * sheet never offers it). Plain node; bundled into `verify:agent-session`.
 */

export interface BackendArgsInput {
  cwd: string
  /** The turn's prompt — an ARGUMENT for a one-process-per-turn backend, unused otherwise. */
  text: string
  /** Name an earlier conversation rather than starting one. */
  resume: boolean
  sessionId: string
  agentOptions?: AgentOptions
  appendSystemPrompt?: string
  /** M120. A chat with no place: the row's `sandboxArgs` are appended. */
  sandbox?: true
}

/** M118. What a parser may be TOLD: the id the host pinned, for a stream that never states its own (copilot). claude's and codex's parsers ignore it. */
export interface ParseContext {
  sessionId: string
}

export interface BackendAdapter {
  args(input: BackendArgsInput): string[]
  parseChunk(chunk: string, carry: string, ctx: ParseContext): { events: TranscriptEvent[]; carry: string }
}

/** M120. The row's tool-denying argv, appended when the chat is sandboxed; a row without them never reaches here (`send` refused by name). */
const sandboxTail = (backend: AgentBackend, input: BackendArgsInput): string[] => (input.sandbox === true ? [...(BACKENDS[backend].sandboxArgs ?? [])] : [])

export const BACKEND_ADAPTERS: Readonly<Record<AgentBackend, BackendAdapter>> = {
  claude: {
    args: (input) => [...headlessArgs({
      sessionId: input.sessionId,
      resume: input.resume,
      agentOptions: input.agentOptions,
      // M81. Rides EVERY spawn, fresh or resumed: the CLI keeps no record of
      // it, so a resumed supervisor without it would stop being one. Absent
      // stays absent — the builder tests presence.
      ...(input.appendSystemPrompt === undefined ? {} : { appendSystemPrompt: input.appendSystemPrompt })
    }), ...sandboxTail('claude', input)],
    parseChunk: parseStreamChunk
  },
  codex: {
    // codex takes its flags BEFORE the positional prompt: the tail goes in front of it.
    args: (input) => { const a = codexArgs({ cwd: input.cwd, text: input.text, resume: input.resume, sessionId: input.sessionId, agentOptions: input.agentOptions }); const tail = sandboxTail('codex', input); return tail.length === 0 ? a : [...a.slice(0, -1), ...tail, a[a.length - 1] as string] },
    parseChunk: parseCodexChunk
  },
  // M118/M119. A row whose adapter has not landed THROWS by name rather than
  // borrowing claude's — a misrouted argv would spawn a real CLI with the
  // wrong flags and read as a hang. The manager never reaches here for a
  // backend whose binary is absent, and `binaries` carries no entry yet.
  // M118. codex's process model with the HOST's id: the parser is told the pinned id because the stream never states one.
  copilot: {
    args: (input) => [...copilotArgs({ cwd: input.cwd, text: input.text, resume: input.resume, sessionId: input.sessionId, agentOptions: input.agentOptions }), ...sandboxTail('copilot', input)],
    parseChunk: (chunk, carry, ctx) => parseCopilotChunk(chunk, carry, ctx)
  },
  acp: {
    args: () => { throw new Error('the acp adapter is not wired') },
    parseChunk: () => { throw new Error('the acp adapter is not wired') }
  }
}
