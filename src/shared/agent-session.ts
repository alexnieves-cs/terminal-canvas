import type { AgentOptions, TokenTotals } from './cost'
import type { TranscriptEvent, TranscriptTurn } from './transcript'
import { BACKENDS, type AgentBackend } from './agent-backends'

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

/** M90. Which headless CLI answers. M99: the union lives in the registry; re-exported so every M90 import still resolves. */
export type { AgentBackend } from './agent-backends'

import type { AutoModeId, AutoState, AutoStuckReason, AutoStatus } from './auto'

/** M97. `agent:auto-start`'s request and its named answer. */
export interface AutoStartRequest { id: string; mode: AutoModeId; task?: string; limit?: number }
export type AutoStartResult = { kind: 'started'; limit: number } | { kind: 'refused'; reason: string }

/**
 * M90's sentences, M99: ALIASES of the registry's rows, kept under their old
 * names so no caller changed and every check that regexes the text still
 * reads the same bytes. New code reads `BACKENDS[backend].reasons.*` and
 * never names a vendor.
 */
export const REASON_NO_CODEX = BACKENDS.codex.reasons.noCli
export const REASON_CODEX_NO_INTERRUPT = BACKENDS.codex.reasons.noInterrupt
export const REASON_CODEX_NO_IMAGES = BACKENDS.codex.reasons.noImages
export const REASON_CODEX_NO_TERMINAL = BACKENDS.codex.reasons.noTerminal

export interface AgentSessionSpec {
  /** M90. Absent is claude. Fixed at create; a session never changes vendor. */
  backend?: AgentBackend
  /** The caller's id — the panel id. Never minted by main. */
  id: string
  cwd: string
  agentOptions?: AgentOptions
  /** A CLI session UUID the caller minted, to pin (or resume, if the CLI already holds it). */
  sessionId?: string
  /** A CLI session UUID known to exist: the first spawn resumes it. */
  resume?: string
  /** M81. Text appended to the CLI's own system prompt — a supervisor's job. */
  appendSystemPrompt?: string
  /** M100. The teammate this chat speaks as; main's Places gate reads it before the cwd resolves. */
  teammateId?: string
  /** M120. A chat with NO place: main resolves the cwd to its own sandbox folder (never a place, never home) and spawns on the row's read-only mode. Refused beside a teammate. */
  sandbox?: true
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
  /** M90. Always present on a snapshot: the panel says which CLI it is talking to. */
  backend: AgentBackend
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
  /** M82. Why the last message queued: this session's turn, or the canvas's ceiling. */
  queuedReason?: 'in-flight' | 'concurrency'
  counters: AgentSessionCounters
  /** M97. Present while an auto run is live or just resolved (until dismissed by a new start or a dispose). */
  auto?: AutoStatus
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
  | { type: 'turn-aborted'; reason: 'exited' | 'interrupt-timeout' | 'budget' }
  /** M82. `concurrency` is the second reason a send queues: the canvas's ceiling, not this session's turn. */
  | { type: 'queued'; text: string; reason?: 'in-flight' | 'concurrency' }
  /** M82. The canvas crossed its budget: every turn in flight was interrupted. Once per crossing. */
  | { type: 'budget'; spent: number; limit: number; interrupted: number }
  /** A queued message written after the result that freed the turn. */
  | { type: 'dequeued'; text: string }
  | { type: 'queue-dropped'; count: number }
  | { type: 'permission-answered'; requestId: string; allow: boolean }
  | { type: 'permission-dropped'; requestId: string }
  /** M97. The bounded run's state, main's own count — the chip is a projection of this. */
  | { type: 'auto'; mode: AutoModeId; turn: number; limit: number; state: AutoState; reason?: AutoStuckReason }
  /** M98. A request main answered `allow` itself, from a session grant: it was never pending, and attention never lit. */
  | { type: 'permission-auto-allowed'; requestId: string; toolName: string }
)

/**
 * M82. `refused-budget` is a fourth answer, not an error: the canvas has
 * reached the ceiling its owner set, and the message was NOT stored — a
 * refused message is not a turn.
 */
export type SendResult = 'sent' | 'queued' | 'no-session' | 'refused-budget' | 'refused-backend' | 'refused-images'

/** M75. What the composer attaches: a dropped image's path (main reads it) or pasted bytes. */
export type ChatAttachment =
  | { kind: 'path'; path: string }
  | { kind: 'data'; mediaType: string; base64: string; name: string }

/** M75. `agent:send`'s answer: the runtime's word, or a refusal naming the attachment that could not go. */
export type SendAnswer = SendResult | { refused: string }

/** M75. `agent:clipboard-image`: the pasted image, or null when the clipboard holds none. */
/**
 * M81. THE SUPERVISOR'S JOB, appended to the CLI's own system prompt. It
 * names the one tool it needs and the words it must answer in — the canvas's
 * own, so a supervisor and the rail say the same thing (principle 11) — and
 * it names what it must NOT do, because a supervisor that spawns or closes
 * panels is a second author of the canvas.
 */
export const SUPERVISOR_PROMPT = [
  'You are the supervisor of a Terminal Canvas workspace.',
  'Read the canvas by running `tc status`, which answers with JSON: every panel with its state word, the edges between them, and the runs that have happened.',
  'Answer in the canvas\'s own words — a panel is `working`, `needs you`, `idle`, `asleep` or `exited N`; an edge fires `on exit`, `on exit 0`, `on a failing exit`, `after a turn` or `always`.',
  'Never spawn, close, restart or write to a panel: you observe and report. `tc status` is the only command you need.'
].join(' ')

/**
 * M114. THE DISPATCHED LANE'S JOB, appended on every spawn of a chat whose
 * `ChatSource.dispatch` is set (the M81 rule: the CLI keeps no record of an
 * appended system prompt, so a resumed lane without it would stop being a
 * lane). It names the one thing the agent must never do — the return path
 * is the person's `Open PR`, behind a spend card, never the agent's.
 */
export const DISPATCH_PROMPT = [
  'You are working one dispatched item from a Terminal Canvas board.',
  'This directory is a fresh git worktree on its own branch; commit your work on that branch as you go, with clear messages.',
  'Never push, never merge, and never open a pull request — the person who dispatched you does that from the card when you are done.',
  'When the item is done, say so plainly and stop.'
].join(' ')

export type ClipboardImage = { mediaType: string; base64: string; size: number } | { refused: string } | null

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
