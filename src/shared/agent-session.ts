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
  /** M350. This agent's own meter (spend across its processes, context, a cap's hold). Absent until main has measured anything. */
  meter?: NodeMeter
}

/**
 * M350. What stopped ONE agent at its own cap. M82's budget is the canvas's
 * ceiling over every agent; this is one node's, and the two never share a
 * latch: a canvas under budget can hold one agent that has spent its share.
 */
export interface CapHold {
  unit: 'usd' | 'context'
  /** Dollars for `usd`, tokens for `context`: the figure that crossed. */
  spent: number
  limit: number
  /** M352. The cap is this agent's own (its chat's record), not the Settings one: a different fix. */
  own?: true
}

/**
 * M350. One agent's own telemetry, measured by MAIN outside the agent loop.
 *
 * - `spentUsd`: the CLI's reported cost across EVERY process this node has
 *   run. A CLI's figure is cumulative for its current process only, so a
 *   respawn (an exit, a relaunch, codex's process per turn) starts it at 0
 *   again; main carries the finished processes' figures forward. Absent
 *   until priced: a backend that reports no cost has no spend to cap.
 * - `context`: tokens in the conversation as of its latest message (what it
 *   was sent, cached or not, plus what it wrote). Absent until a message
 *   reports usage.
 * - `held`: present while the node is held at a cap.
 */
export interface NodeMeter {
  spentUsd?: number
  context?: number
  held?: CapHold
  /** M351. The caps main is enforcing on this node right now, and whose they are. Absent when neither is set anywhere. */
  caps?: NodeCapsView
}

/** M350. The caps main enforces on every node. 0 is no cap, for both (every canvas that never set one). */
export interface NodeCaps {
  usd: number
  /** Tokens, not thousands: the setting is in thousands and converted where it is read. */
  context: number
}

/**
 * M351. One agent's OWN caps, on its chat panel's record (`ChatSource.caps`).
 * Each figure is optional and independent: absent means the Settings value
 * applies, and 0 means no cap for this agent even when Settings has one. The
 * context cap is in thousands, like its setting.
 */
export interface AgentCaps {
  usd?: number
  contextK?: number
}

/** M351. The caps in force, and whether each is the agent's own (else Settings'). */
export interface NodeCapsView extends NodeCaps {
  ownUsd: boolean
  ownContext: boolean
}

/** M351. An agent's own caps over the Settings defaults: its own figure wherever it has one. */
export function effectiveCaps(own: AgentCaps | undefined, defaults: NodeCaps): NodeCapsView {
  return {
    usd: own?.usd ?? defaults.usd,
    context: own?.contextK !== undefined ? own.contextK * 1000 : defaults.context,
    ownUsd: own?.usd !== undefined,
    ownContext: own?.contextK !== undefined
  }
}

/** M351. A cap's figure is a finite, non-negative number, bounded like its setting. */
export function parseAgentCaps(raw: unknown): AgentCaps | undefined {
  if (raw === null || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const figure = (v: unknown, max: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : undefined)
  const usd = figure(r['usd'], 1000)
  const contextK = figure(r['contextK'], 2000)
  if (usd === undefined && contextK === undefined) return undefined
  return { ...(usd === undefined ? {} : { usd }), ...(contextK === undefined ? {} : { contextK }) }
}

/** M352. `cap-agent`'s answer: the record's caps to write (undefined clears them), or why not. */
export type CapChange = { kind: 'set'; caps: AgentCaps | undefined; note: string } | { kind: 'refused'; reason: string }

/** M352. Why a door may not loosen a cap: said by every refusal that is about WHO asked. */
export const CAP_DOOR_REASON = 'raising or removing a cap is a person\'s decision — set it in the Inspector\'s Work tab or type cap-agent in the palette; an agent or a workflow may only lower one'

const CAP_USD_MAX = 1000
const CAP_CONTEXT_K_MAX = 2000

function capWords(caps: AgentCaps | undefined): string {
  if (caps === undefined) return 'its own caps cleared — the Settings caps apply'
  const parts = [
    ...(caps.usd === undefined ? [] : [caps.usd === 0 ? 'no spend cap' : `spend cap $${caps.usd.toFixed(2)}`]),
    ...(caps.contextK === undefined ? [] : [caps.contextK === 0 ? 'no context cap' : `context cap ${caps.contextK}k`])
  ]
  return parts.join(', ')
}

/**
 * M352. `cap-agent`'s value against an agent's own caps, and whether the door
 * it came through may make the change. The value is one token, comma-joined:
 * `5usd` (or `$5`) for spend, `200k` for context, both as `5usd,200k`; `0usd`
 * or `0k` for no cap of that kind on this agent; `none` for neither; `default`
 * to clear its own caps so the Settings caps apply, or `default-usd` /
 * `default-k` for one of them (the Inspector's blank field).
 *
 * `origin: 'door'` is an agent's `tc plan` or a workflow's action node. Such a
 * door may only TIGHTEN: each figure it sets must be above 0 and at or under
 * the cap in force (`current`, main's own view from the meter). Otherwise a
 * cap would bind an agent only for as long as the agent agreed to it. A person
 * (the palette, the Inspector) may set anything.
 */
export function planCapChange(own: AgentCaps | undefined, value: string, origin: 'person' | 'door', current: NodeCaps): CapChange {
  const tokens = value.trim().toLowerCase().split(',').map((t) => t.trim()).filter((t) => t !== '')
  if (tokens.length === 0) return { kind: 'refused', reason: 'say a cap — 5usd for spend, 200k for context, both as 5usd,200k, none, or default' }
  if (tokens.length === 1 && (tokens[0] === 'none' || tokens[0] === 'default')) {
    if (origin === 'door') return { kind: 'refused', reason: CAP_DOOR_REASON }
    const caps = tokens[0] === 'none' ? { usd: 0, contextK: 0 } : undefined
    return { kind: 'set', caps, note: tokens[0] === 'none' ? 'no caps for this agent' : capWords(undefined) }
  }
  const patch: AgentCaps = {}
  const reset = new Set<keyof AgentCaps>()
  for (const t of tokens) {
    if (t === 'default-usd' || t === 'default-k') {
      if (origin === 'door') return { kind: 'refused', reason: CAP_DOOR_REASON }
      reset.add(t === 'default-usd' ? 'usd' : 'contextK')
      continue
    }
    const usd = /^\$(\d+(?:\.\d+)?)$/.exec(t) ?? /^(\d+(?:\.\d+)?)(?:usd|\$)$/.exec(t)
    const ctx = /^(\d+(?:\.\d+)?)k$/.exec(t)
    if (usd !== null) {
      if (patch.usd !== undefined) return { kind: 'refused', reason: 'one spend cap at a time' }
      const n = Number(usd[1])
      if (n > CAP_USD_MAX) return { kind: 'refused', reason: `a spend cap is at most $${CAP_USD_MAX}` }
      patch.usd = n
    } else if (ctx !== null) {
      if (patch.contextK !== undefined) return { kind: 'refused', reason: 'one context cap at a time' }
      const n = Number(ctx[1])
      if (n > CAP_CONTEXT_K_MAX) return { kind: 'refused', reason: `a context cap is at most ${CAP_CONTEXT_K_MAX}k` }
      patch.contextK = n
    } else return { kind: 'refused', reason: `${t} is not a cap — 5usd for spend, 200k for context, none, or default` }
  }
  if (origin === 'door') {
    if (patch.usd !== undefined && (patch.usd === 0 || (current.usd > 0 && patch.usd > current.usd))) return { kind: 'refused', reason: CAP_DOOR_REASON }
    if (patch.contextK !== undefined && (patch.contextK === 0 || (current.context > 0 && patch.contextK * 1000 > current.context))) return { kind: 'refused', reason: CAP_DOOR_REASON }
  }
  if ((patch.usd !== undefined && reset.has('usd')) || (patch.contextK !== undefined && reset.has('contextK'))) return { kind: 'refused', reason: 'a cap cannot be set and reset at once' }
  const merged: AgentCaps = { ...own, ...patch }
  for (const key of reset) delete merged[key]
  const caps = merged.usd === undefined && merged.contextK === undefined ? undefined : merged
  return { kind: 'set', caps, note: capWords(caps) }
}

/** M350. The tokens a message's usage says are in the conversation: every input class plus what it wrote. */
export function contextTokens(usage: TokenTotals): number {
  return usage.input + usage.cacheWrite + usage.cacheRead + usage.output
}

/**
 * M350. The cap a meter has reached, or null. Spend first: dollars are the
 * explicit hard stop, as in M82's budgetCrossing. An unmeasured figure
 * crosses nothing: "unknown" is never "over".
 */
export function capCrossing(meter: Pick<NodeMeter, 'spentUsd' | 'context'>, caps: NodeCaps & Partial<Pick<NodeCapsView, 'ownUsd' | 'ownContext'>>): CapHold | null {
  if (caps.usd > 0 && meter.spentUsd !== undefined && meter.spentUsd >= caps.usd) return { unit: 'usd', spent: meter.spentUsd, limit: caps.usd, ...(caps.ownUsd === true ? { own: true as const } : {}) }
  if (caps.context > 0 && meter.context !== undefined && meter.context >= caps.context) return { unit: 'context', spent: meter.context, limit: caps.context, ...(caps.ownContext === true ? { own: true as const } : {}) }
  return null
}

/** M350. A hold in one sentence: what crossed, and what a person does about it. */
export function capSentence(hold: CapHold): string {
  // M352. An agent's OWN cap is raised on the agent, not in Settings.
  const fix = hold.own === true ? 'raise its own cap in the Inspector\'s Work tab (or cap-agent in the palette)' : hold.unit === 'usd' ? 'raise agents.nodeCapUsd in Settings' : 'raise agents.nodeCapContextK in Settings'
  return hold.unit === 'usd'
    ? `this agent reached its $${hold.limit.toFixed(2)} spend cap ($${hold.spent.toFixed(2)} reported) — ${fix}, then send again`
    : `this agent's context reached its ${Math.round(hold.limit / 1000)}k-token cap (${Math.round(hold.spent / 1000)}k) — ${fix}, or start a fresh conversation`
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

/**
 * `owner`: the Supabase user id of the person whose agent this is, stamped on
 * EVERY event at main's one fan-out (bootstrap/agent-runtime.ts) — the colour
 * agent activity is drawn in, here and on a teammate's shared canvas. Absent
 * when signed out: an unowned agent draws in the canvas's own accent.
 */
export type AgentSessionEvent = { id: string; owner?: string } & (
  | Exclude<TranscriptEvent, { type: 'result' | 'assistant' | 'user' | 'ignored' }>
  | ResultEvent
  /** M319. `resumeLost`: the CLI said the conversation it was asked to resume does not exist — the next message starts a new one. */
  | { type: 'status'; status: AgentSessionStatus; exitCode?: number | null; exitSignal?: string; stderr?: string; resumeLost?: string }
  | { type: 'turn'; turn: TranscriptTurn }
  /** M350. `cap`: this node reached its own cap mid-turn (its context), and main stopped the turn. */
  | { type: 'turn-aborted'; reason: 'exited' | 'interrupt-timeout' | 'handshake-timeout' | 'budget' | 'cap' | 'terminated' }
  /** M82. `concurrency` is the second reason a send queues: the canvas's ceiling, not this session's turn. */
  | { type: 'queued'; text: string; reason?: 'in-flight' | 'concurrency' }
  /** M82. The canvas crossed its budget: every turn in flight was interrupted. Once per crossing. */
  | { type: 'budget'; spent: number; limit: number; interrupted: number; unit?: 'usd' | 'window' }
  /** M350. This node's meter changed (its spend, its context, or a hold set or released) — the whole meter, each time. */
  | { type: 'meter'; meter: NodeMeter }
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
export type SendResult = 'sent' | 'queued' | 'no-session' | 'refused-budget' | 'refused-cap' | 'refused-backend' | 'refused-images' | 'refused-sandbox'

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
    // M350. Main answers with capSentence's figures (agent-handlers.ts answerIn); this is the bare word's fallback.
    case 'refused-cap': return 'this agent reached its own cap — raise agents.nodeCapUsd or agents.nodeCapContextK in Settings, then send again'
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
