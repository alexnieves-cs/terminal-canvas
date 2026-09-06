import type { AgentOptions } from '@shared/cost'
import { type AgentBackend } from '@shared/agent-backends'
import { parseStreamChunk, type OutgoingImage, type PermissionAnswer, type TranscriptEvent } from '@shared/transcript'
import { codexArgs, parseCodexChunk } from '@shared/codex-transcript'
import {
  acpCancel,
  acpInitialize,
  acpOptionFor,
  acpPermissionAnswer,
  acpPrompt,
  acpSessionLoad,
  acpSessionNew,
  noteRequest,
  parseAcpChunk,
  readAcpCarry,
  writeAcpCarry,
  type AcpMethod
} from '@shared/acp-transcript'
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
 *
 * M119. The surface grew the STDIN half as OPTIONAL members — `handshake`,
 * `openSession`, `encodeUser`, `encodeInterrupt`, `encodePermission`. The
 * manager PREFERS them when present and falls back to claude's stream-json
 * encoders (`shared/transcript.ts`) when absent, so claude and codex read
 * exactly as before and no consumer ever compares a backend's name
 * (`registry.1`). An adapter with a wire of its own carries its state in
 * the manager's `carry` string — reset on every spawn and every exit, so a
 * response to a dead process's request can never match a live one.
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

/**
 * M119. What the stdin encoders read and MUTATE: the manager hands its own
 * session object (structurally), and an adapter with a wire of its own
 * records what it asked in `carry` so its parser can read the answer.
 */
export interface AdapterSession {
  sessionId: string
  cwd: string
  carry: string
}

export interface BackendAdapter {
  args(input: BackendArgsInput): string[]
  parseChunk(chunk: string, carry: string): { events: TranscriptEvent[]; carry: string }
  /** The line to write at spawn, before anything else; the manager holds the first prompt until the session opens. */
  handshake?(session: AdapterSession): string
  /** The line that opens (or, with `resume`, loads) the session once the handshake has answered. */
  openSession?(session: AdapterSession, resume: boolean): string
  encodeUser?(session: AdapterSession, text: string, images: readonly OutgoingImage[]): string
  /** Undefined when the wire has no interrupt door — the row's `interrupts` already said so. */
  encodeInterrupt?(session: AdapterSession, requestId: string): string
  /** `grant` is M98's session grant: the vendor may have a word for it (ACP's `allow_always`). */
  encodePermission?(session: AdapterSession, requestId: string, input: Record<string, unknown>, answer: PermissionAnswer, grant: boolean): string
}

/**
 * The ACP encoders' one bookkeeping step: mint the next id, write the request
 * into the carry's pending map, return the line. Every request the manager
 * writes goes through here, so the parser can read its answer by method.
 */
function acpRequest(session: AdapterSession, method: AcpMethod, line: (id: number) => string, sessionId?: string): string {
  const { rest, state } = readAcpCarry(session.carry)
  const id = state.nextId
  session.carry = writeAcpCarry(rest, noteRequest(state, id, method, sessionId))
  return line(id)
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
  },
  // M118. A row whose adapter has not landed THROWS by name rather than
  // borrowing claude's — a misrouted argv would spawn a real CLI with the
  // wrong flags and read as a hang. The manager never reaches here for a
  // backend whose binary is absent, and `binaries` carries no entry yet.
  copilot: {
    args: () => { throw new Error('the copilot adapter is not wired') },
    parseChunk: () => { throw new Error('the copilot adapter is not wired') }
  },
  // M119. `copilot --acp`: a resident process speaking JSON-RPC. The argv is
  // the same on every spawn — resume is a `session/load` REQUEST, not a flag
  // — and `resume` here is read by `openSession`, which the manager asks once
  // `initialize` has answered (the handshake is sequential, as measured; a
  // pipelined session/new was never recorded and is not assumed to work).
  acp: {
    args: () => ['--acp'],
    parseChunk: parseAcpChunk,
    handshake: (session) => acpRequest(session, 'initialize', (id) => acpInitialize(id)),
    openSession: (session, resume) => resume
      ? acpRequest(session, 'session/load', (id) => acpSessionLoad(id, session.sessionId, session.cwd), session.sessionId)
      : acpRequest(session, 'session/new', (id) => acpSessionNew(id, session.cwd)),
    encodeUser: (session, text, images) => acpRequest(session, 'session/prompt', (id) => acpPrompt(id, session.sessionId, text, images)),
    // A notification: no id, so nothing pending. The agent answers by ending
    // the prompt with stopReason `cancelled`; the manager's own `interrupting`
    // flag is what marks that result interrupted.
    encodeInterrupt: (session) => acpCancel(session.sessionId),
    encodePermission: (_session, requestId, input, answer, grant) => {
      const options = Array.isArray(input.__options) ? input.__options.filter((o): o is string => typeof o === 'string') : []
      return acpPermissionAnswer(requestId, acpOptionFor(options, answer, grant))
    }
  }
}
