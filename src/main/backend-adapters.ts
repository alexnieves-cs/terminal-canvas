import type { AgentOptions } from '@shared/cost'
import { type AgentBackend } from '@shared/agent-backends'
import { parseStreamChunk, type TranscriptEvent } from '@shared/transcript'
import { codexArgs, parseCodexChunk } from '@shared/codex-transcript'
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
}

export interface BackendAdapter {
  args(input: BackendArgsInput): string[]
  parseChunk(chunk: string, carry: string): { events: TranscriptEvent[]; carry: string }
}

export const BACKEND_ADAPTERS: Readonly<Record<AgentBackend, BackendAdapter>> = {
  claude: {
    args: (input) => headlessArgs({
      sessionId: input.sessionId,
      resume: input.resume,
      agentOptions: input.agentOptions,
      // M81. Rides EVERY spawn, fresh or resumed: the CLI keeps no record of
      // it, so a resumed supervisor without it would stop being one. Absent
      // stays absent — the builder tests presence.
      ...(input.appendSystemPrompt === undefined ? {} : { appendSystemPrompt: input.appendSystemPrompt })
    }),
    parseChunk: parseStreamChunk
  },
  codex: {
    args: (input) => codexArgs({ cwd: input.cwd, text: input.text, resume: input.resume, sessionId: input.sessionId, agentOptions: input.agentOptions }),
    parseChunk: parseCodexChunk
  }
}
