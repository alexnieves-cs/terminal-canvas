import type { AgentOptions } from './cost'
import type { AgentBackend } from './agent-session'
import type { SwarmMark } from './swarm'

/**
 * M73. What a chat PANEL persists: the directory its agent works in, the CLI
 * session id that names its conversation, and the agent knobs.
 *
 * Declared here rather than in renderer/panels/panels.ts for the reason
 * `FileSource` and `ToolboxSource` are where they are: `layout-schema.ts`
 * parses this record off disk, and `shared` never imports from `renderer`.
 *
 * `sessionId` is minted by the RENDERER at panel creation (`crypto.randomUUID`
 * is available there), not by main, so the panel record is complete before
 * any invoke resolves and a reload finds the same conversation. Main pins it
 * on the first spawn (`--session-id`) and names it on every later one
 * (`--resume`); whether the CLI's own transcript for it exists yet is main's
 * to find out at spawn, never a field here — see AgentSessionDeps.transcriptExists.
 *
 * `agentOptions` ABSENT means the CLI's own defaults, and absent must stay
 * absent through every copy site: a spread that writes `agentOptions:
 * undefined` survives IPC and reads as present.
 */
export interface ChatSource {
  /** M81. This chat's subject is the canvas: its system prompt is the supervisor's, on every spawn. */
  supervisor?: boolean
  /** Unexpanded, like ToolboxSource.cwd — main expands it with resolveCwd. */
  cwd: string
  sessionId: string
  agentOptions?: AgentOptions
  /** M90. Absent is claude — every pre-M90 record and every claude chat. */
  backend?: AgentBackend
  /** M100. The teammate this chat speaks as; absent for every pre-existing chat and every plain one. */
  teammateId?: string
  /** M114. This chat is a dispatched LANE: its next spawn carries DISPATCH_PROMPT again. Absent for every other chat. */
  dispatch?: true
  /** M120. A chat with NO place: main resolves its cwd to the app's own sandbox folder and spawns on the row's read-only mode, on every create. */
  sandbox?: true
  /** M121. This chat is a ROUTINE's: its next spawn carries ROUTINE_PROMPT again (the same rule). Absent for every other chat. */
  routine?: true
  /**
   * M138. An orchestrator block's PROMPT, appended to the CLI's own system
   * prompt on EVERY spawn (M81's supervisor rule: the CLI keeps no record of
   * it, so a resumed chat without it stops being an orchestrator). A string,
   * not a flag, because the prompt is the block's own.
   */
  orchestrator?: string
  /**
   * M275. This chat is a SEAT in a swarm arrangement: two short strings, from
   * which `swarmSystemPrompt` rebuilds the brief on EVERY spawn (M81's rule
   * again — the CLI keeps no record of an appended prompt, so a resumed seat
   * without this mark silently stops being that seat). The prose stays in
   * code; see `swarm.ts`. Absent for every other chat.
   */
  swarm?: SwarmMark
}

/**
 * M114. The by-name copy sites' rule for the marks `carryBackend` does not
 * carry: absent stays absent, and only `true` is ever written. Spread beside
 * `carryBackend` at every site that rebuilds a ChatSource field by field.
 */
export function carryChatMarks(chat: { dispatch?: true; sandbox?: true; routine?: true; orchestrator?: string; swarm?: SwarmMark }): { dispatch?: true; sandbox?: true; routine?: true; orchestrator?: string; swarm?: SwarmMark } {
  return {
    ...(chat.dispatch === true ? { dispatch: true as const } : {}),
    ...(chat.sandbox === true ? { sandbox: true as const } : {}),
    ...(chat.routine === true ? { routine: true as const } : {}),
    ...(typeof chat.orchestrator === 'string' ? { orchestrator: chat.orchestrator } : {}),
    // A FRESH object, never the caller's: a shared reference lets a later
    // mutation rewrite the seat of a panel already on the canvas.
    ...(chat.swarm === undefined ? {} : { swarm: { preset: chat.swarm.preset, role: chat.swarm.role } })
  }
}
