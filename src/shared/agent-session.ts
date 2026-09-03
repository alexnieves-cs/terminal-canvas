import type { AgentOptions, TokenTotals } from './cost'
import type { TranscriptEvent, TranscriptTurn } from './transcript'

/**
 * M73. The agent-session runtime's PUBLIC shapes — what crosses the bridge.
 * Declared here rather than in main/agent-session.ts because the contract
 * and the renderer both name them, and `shared` never imports from `main`.
 * The manager itself stays in main and imports these.
 */

export type AgentSessionStatus =
  | 'not-started'
  | 'starting'
  | 'ready'
  | 'streaming'
  | 'exited'
  | 'disposed'

export interface AgentSessionSpec {
  /** The caller's id — the panel id. Never minted by main. */
  id: string
  cwd: string
  agentOptions?: AgentOptions
  /** A CLI session UUID the caller minted, to pin (or resume, if the CLI already holds it). */
  sessionId?: string
  /** A CLI session UUID known to exist: the first spawn resumes it. */
  resume?: string
}

export interface PendingPermission {
  requestId: string
  toolName: string
  input: Record<string, unknown>
  description?: string
  toolUseId?: string
}

export interface AgentSessionCounters {
  ignored: number
  unknown: number
  malformed: number
}

export interface AgentSessionSnapshot {
  id: string
  cwd: string
  status: AgentSessionStatus
  /** The CLI session UUID — what `--resume` names. */
  sessionId: string
  model?: string
  pid?: number
  exitCode?: number | null
  exitSignal?: string
  /** Results seen, i.e. completed turns. */
  turns: number
  usage: TokenTotals
  /** The CLI's cumulative figure for the current process. Undefined until priced. */
  costUsd?: number
  pending: PendingPermission[]
  queued: number
  counters: AgentSessionCounters
}

export type ResultEvent = Extract<TranscriptEvent, { type: 'result' }> & {
  /** Set from the session's own state, never from the record. */
  interrupted: boolean
}

export type AgentSessionEvent = { id: string } & (
  | Exclude<TranscriptEvent, { type: 'result' | 'assistant' | 'user' | 'ignored' }>
  | ResultEvent
  | { type: 'status'; status: AgentSessionStatus; exitCode?: number | null; exitSignal?: string; stderr?: string }
  | { type: 'turn'; turn: TranscriptTurn }
  | { type: 'turn-aborted'; reason: 'exited' | 'interrupt-timeout' }
  | { type: 'queued'; text: string }
  /** A queued message written after the result that freed the turn. */
  | { type: 'dequeued'; text: string }
  | { type: 'queue-dropped'; count: number }
  | { type: 'permission-answered'; requestId: string; allow: boolean }
  | { type: 'permission-dropped'; requestId: string }
)

export type SendResult = 'sent' | 'queued' | 'no-session'

/**
 * What `agent:create` answers. A refusal is a NAMED reason (the directory
 * is not there; the CLI was not found), never a snapshot that will fail on
 * its first send with nothing on screen to say why.
 */
export type AgentCreateResult =
  | { kind: 'created'; snapshot: AgentSessionSnapshot }
  | { kind: 'refused'; reason: string }

/** M74. `agent:import`: a terminal's pinned session, read into a chat panel's file. */
export interface AgentImportRequest {
  fromPanelId: string
  toPanelId: string
}

export type AgentImportResult =
  | { kind: 'imported'; sessionId: string; turns: number }
  | { kind: 'refused'; reason: string }

/** What `agent:transcript` answers: the durable file plus the live snapshot, if any. */
export interface AgentTranscriptResult {
  turns: TranscriptTurn[]
  snapshot: AgentSessionSnapshot | null
  /** The last recorded accounting, for a panel whose session has not run this launch. */
  meta?: { usage: TokenTotals; costUsd?: number; turns: number }
}
