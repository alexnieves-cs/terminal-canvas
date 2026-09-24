import type { AgentOptions, TokenTotals } from './cost'
import type { TranscriptEvent, TranscriptTurn } from './transcript'
import { BACKENDS, type AgentBackend, type BackendDef } from './agent-backends'

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
  /** M319. The CLI's own sentence for a failed resume; absent otherwise. Cleared by the next spawn. */
  resumeLost?: string
  /** Results seen, i.e. completed turns. */
  turns: number
  usage: TokenTotals
  /** The CLI's cumulative figure for the current process. Undefined until priced. */
  costUsd?: number
  pending: PendingPermission[]
  queued: number
  /**
   * M322. The waiting messages themselves, in the order they will be sent —
   * `queued` is their count, kept so every M82–M319 reader still reads it.
   */
  queue?: QueuedMessage[]
  /** M82. Why the last message queued: this session's turn, or the canvas's ceiling. */
  queuedReason?: 'in-flight' | 'concurrency'
  counters: AgentSessionCounters
  /** M97. Present while an auto run is live or just resolved (until dismissed by a new start or a dispose). */
  auto?: AutoStatus
  /**
   * M119. What the process's handshake ANSWERED (ACP's initialize): the
   * measured fact for this process, which outranks the row's promise. Absent
   * for every backend without a handshake, and until the handshake answers.
   */
  negotiated?: NegotiatedCapabilities
  /** M119. The handshake has been written and not yet answered: the first send is held. Absent for every other row and once the session opens. */
  awaitingHandshake?: true
}

/**
 * M322. One message waiting behind the turn in flight, as a person sees it:
 * the text (editable while it waits), its images by type and size (never the
 * bytes), and why it waits. `turnId` is its identity — the stored user turn
 * that carries `delivery: 'queued'` until it is written to the agent.
 */
export interface QueuedMessage {
  turnId: string
  text: string
  images: { mediaType: string; size: number }[]
  reason: 'in-flight' | 'concurrency'
  /** Sent with Stop and send: first in line, served when the interrupted turn ends. */
  correction?: true
  /** An auto run's own continuation — shown, never edited, dropped with the run. */
  auto?: true
}

/** M119. The capabilities a handshake states live; each absent when the agent said nothing about it. */
export interface NegotiatedCapabilities {
  loadSession?: boolean
  image?: boolean
}

/**
 * M119. Whether a message may carry an image: the handshake's answer when
 * this process gave one, the row's promise otherwise. Pure, so the composer
 * and the manager's `send` decide the same way — a composer that read the
 * row alone would attach an image the runtime then refuses, and the user
 * would see a refusal for a control that looked enabled.
 */
export function imagesAllowed(snapshot: { negotiated?: NegotiatedCapabilities } | null | undefined, row: BackendDef): boolean {
  return snapshot?.negotiated?.image ?? row.images
}

export type ResultEvent = Extract<TranscriptEvent, { type: 'result' }> & {
  /** Set from the session's own state, never from the record. */
  interrupted: boolean
}

export type AgentSessionEvent = { id: string } & (
  | Exclude<TranscriptEvent, { type: 'result' | 'assistant' | 'user' | 'ignored' }>
  | ResultEvent
  /** M319. `resumeLost`: the CLI said the conversation it was asked to resume does not exist — the next message starts a new one. */
  | { type: 'status'; status: AgentSessionStatus; exitCode?: number | null; exitSignal?: string; stderr?: string; resumeLost?: string }
  | { type: 'turn'; turn: TranscriptTurn }
  | { type: 'turn-aborted'; reason: 'exited' | 'interrupt-timeout' | 'handshake-timeout' | 'budget' | 'terminated' }
  /** M82. `concurrency` is the second reason a send queues: the canvas's ceiling, not this session's turn. */
  | { type: 'queued'; text: string; reason?: 'in-flight' | 'concurrency' }
  /** M82. The canvas crossed its budget: every turn in flight was interrupted. Once per crossing. */
  | { type: 'budget'; spent: number; limit: number; interrupted: number; unit?: 'usd' | 'window' }
  /** A queued message written after the result that freed the turn. */
  | { type: 'dequeued'; text: string }
  | { type: 'queue-dropped'; count: number }
  /** M322. The waiting list after any change to it — edit, remove, a send, a dequeue, a drop. */
  | { type: 'queue'; queue: QueuedMessage[] }
  /** M322. A stored turn withdrawn: a waiting message removed before it was sent, or an undelivered one discarded. */
  | { type: 'turn-removed'; turnId: string }
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
export type SendResult = 'sent' | 'queued' | 'no-session' | 'refused-budget' | 'refused-backend' | 'refused-images' | 'refused-sandbox'

/** M75. What the composer attaches: a dropped image's path (main reads it) or pasted bytes. */
export type ChatAttachment =
  | { kind: 'path'; path: string }
  | { kind: 'data'; mediaType: string; base64: string; name: string }

/** M75. `agent:send`'s answer: the runtime's word, or a refusal naming the attachment that could not go. */
export type SendAnswer = SendResult | { refused: string }

/** M322. `agent:queue-edit`: one waiting (or undelivered) message, by its turn id. `text` only for `edit`. */
export type QueueEditRequest =
  | { id: string; op: 'edit'; turnId: string; text: string }
  | { id: string; op: 'remove' | 'discard'; turnId: string }

/** M322. `agent:send-correction`'s answer: the send's word, and whether the turn in flight was asked to stop. */
export interface CorrectionAnswer { answer: SendAnswer; interrupted: boolean }

/**
 * M197. WHY A SEND DID NOT HAPPEN, in one sentence, or null when it did.
 *
 * `SendAnswer` refuses in TWO shapes and a caller that reads only one is
 * silent for the other: the object arm (`{ refused }`, an attachment that
 * could not go) and four STRING arms, of which `refused-budget` is M82's
 * ceiling — a refusal that stores nothing, so there is no turn, no message
 * and nothing on screen unless the caller says so. `queued` is not a
 * refusal: the message is stored and will be sent, and calling it one would
 * report a failure to a user whose work is merely waiting.
 */
export function sendRefusalSentence(answer: SendAnswer | undefined): string | null {
  if (answer === undefined) return null
  if (typeof answer === 'object' && answer !== null && 'refused' in answer) return answer.refused
  switch (answer) {
    case 'refused-budget': return 'the budget ceiling was reached — raise agents.budgetUsd or agents.budgetWindowPercent in Settings, then send again'
    case 'refused-backend': return 'this engine cannot take the message'
    case 'refused-images': return 'this engine cannot take images'
    case 'refused-sandbox': return 'this engine has no read-only mode, and the conversation has no folder'
    case 'no-session': return 'the conversation has no session'
    default: return null
  }
}

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
