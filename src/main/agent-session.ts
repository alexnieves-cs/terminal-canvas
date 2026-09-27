import { addTotals, emptyTotals, type AgentOptions, type TokenTotals } from '@shared/cost'
import { BACKENDS, backendOf, type BackendDef } from '@shared/agent-backends'
import { resumeLostDetail } from '@shared/backend-fit'
import {
  interruptLine,
  permissionResponseLine,
  userMessageLine,
  type OutgoingImage,
  type PermissionAnswer,
  type TranscriptEvent,
  type TranscriptTurn
} from '@shared/transcript'
import { BACKEND_ADAPTERS } from './backend-adapters'
import type { AgentExitInfo, AgentProcess, AgentRunner } from './agent-runner'
import { capCrossing, contextTokens, imagesAllowed } from '@shared/agent-session'
import {
  budgetCrossing,
  foldRateLimit,
  RATE_LIMIT_NONE,
  windowUtilization,
  type RateLimitState
} from '@shared/rate-limit'
import type {
  AgentBackend,
  NegotiatedCapabilities,
  AgentSessionStatus,
  AgentSessionSpec,
  PendingPermission,
  AgentSessionCounters,
  AgentSessionSnapshot,
  AgentSessionEvent,
  QueuedMessage,
  SendResult,
  CapHold,
  NodeCaps,
  NodeCapsView,
  NodeMeter
} from '@shared/agent-session'
/**
 * M71. A main-process object that represents an agent CONVERSATION — a
 * structured, streaming transcript with a lifecycle of its own — rather than
 * a PTY. No xterm anywhere near it; no `electron` import, so the whole class
 * runs under plain node in verify:agent-session against a fake runner.
 *
 * Read the M71 spec before changing the lifecycle. The rules that fail
 * silently if undone, in one place:
 *
 *   - IDS ARE THE CALLER'S. The renderer mints panel ids; this class takes
 *     one and never invents one (two authors of one id space is the
 *     duplicate-id defect). The CLI's own session UUID is a SECOND fact,
 *     minted here through an injected `newSessionId` and pinned with
 *     `--session-id`, so it is known before the process has written a byte
 *     and is what `--resume` names on every later spawn.
 *   - SPAWN ON FIRST SEND, NOT ON CREATE. A created session with no process
 *     costs nothing, which is what a restored-but-untouched chat panel should
 *     cost — dormancy's argument for terminals, reached from the other side.
 *   - ONE PROCESS PER SESSION, MULTI-TURN OVER STDIN. A second send during a
 *     turn is QUEUED here (the queue is ours so the transcript shows the
 *     pending turn and dispose drops it deterministically). After an exit the
 *     next send respawns with `--resume`.
 *   - TURNS ARE ASSEMBLED FROM THE COMPLETE RECORDS; DELTAS ARE FOR THE
 *     SCREEN. `assistant` records sharing a message id merge into one turn.
 *     Deltas are batched per session on a 16ms timer for the reason
 *     pty-manager.ts batches: the renderer must not re-render per token.
 *   - USAGE IS SUMMED PER RESULT; COST IS THE LATEST RESULT'S. Measured:
 *     the CLI's `usage` is per turn and its `total_cost_usd` is cumulative
 *     across the process. Summing cost double-counts every earlier turn.
 *   - THE M61 IDENTITY RULE, ON BOTH DOORS. Every data and exit callback is
 *     gated on `this.sessions.get(id) === session && session.proc === proc`
 *     before it touches anything. dispose() kills and deletes synchronously;
 *     the OS process exits milliseconds later, usually printing, and by then
 *     the id may belong to a session recreated at it. The second clause
 *     matters on its own: after an exit-then-resume the session object is the
 *     SAME, and only the process identity tells the dead one's tail apart
 *     from the new one's stream.
 *   - A BACKEND IS A ROW, NEVER A NAME (M99). Every difference between the
 *     CLIs is read from `BACKENDS[session.backend]` — one process per turn,
 *     stdin closed, the thread id adopted, no interrupt door, no image block
 *     — and the process half (argv, parser) from `BACKEND_ADAPTERS`. A
 *     comparison of `backend` to a vendor's name anywhere in here is a third
 *     backend's silent default to claude's behaviour; `registry.1` greps for it.
 */

import { autoPlanOf, AUTO_DONE_MARKER, type AutoModeId, type AutoStatus, type AutoStuckReason } from '@shared/auto'
import type { AutoStartResult } from '@shared/agent-session'

export type {
  AgentSessionStatus,
  AgentSessionSpec,
  PendingPermission,
  AgentSessionCounters,
  AgentSessionSnapshot,
  ResultEvent,
  AgentSessionEvent,
  SendResult
} from '@shared/agent-session'

export interface AgentSessionDeps {
  /**
   * The canvas's ceilings, read LIVE on every send and every result.
   * `0` means no ceiling — which is every caller that does not pass this.
   * `budgetWindowPercent` is the subscriber arm (stop at N% of the binding
   * usage window); `budgetUsd` stays for API-key spend. Both reuse one stop path.
   */
  limits?: () => { maxConcurrent: number; budgetUsd: number; budgetWindowPercent?: number }
  /**
   * M350. Each node's own caps, read LIVE like `limits` (a cap raised in
   * Settings releases a held node at its next send). 0 is no cap; absent is
   * no caps at all, which is every caller that does not pass this.
   * M351: asked per node, so an agent's own caps (its chat's record) can
   * stand over the Settings defaults; the `own*` flags say whose each is.
   */
  caps?: (id: string) => NodeCaps & Partial<Pick<NodeCapsView, 'ownUsd' | 'ownContext'>>
  runner: AgentRunner
  /** The resolved path of the `claude` binary. */
  command: string
  /**
   * M90. The second backend, when its CLI was found. Absent means every
   * codex session's send is refused BY NAME (`refused-backend`) and spawns
   * nothing — the sheet's row is already disabled, this is the rule.
   * M99: `binaries` is the general form; this and `command` stay so every
   * M71–M90 caller and check reads the same.
   */
  codex?: { command: string }
  /** M99. Resolved binaries by backend, consulted before `command`/`codex`. Absent for a backend refuses its sends by name. */
  binaries?: Partial<Record<AgentBackend, { command: string }>>
  /**
   * M98. Main's session grants: a `permission-request` this answers true for
   * is answered `allow` here, before it is ever pending, and emitted as
   * `permission-auto-allowed`. Absent means every request asks.
   */
  preAnswer?: (id: string, toolName: string) => boolean
  /**
   * M90. Whether this panel's transcript log already holds turns — the codex
   * analogue of `transcriptExists`: a restored codex chat with turns resumes
   * the thread its record names rather than starting a new one silently.
   */
  hasTurns?: (id: string) => boolean
  /**
   * M354. What this panel's earlier runs of the app measured: its spend
   * carried across every process, and its context at its last message. Read
   * once, at `create`: a relaunch re-creates every chat by id, and without
   * this each came back unmeasured, so a held agent was released by quitting
   * the app and a canvas budget could be spent again after every launch.
   */
  carried?: (id: string) => { spentUsd?: number; context?: number } | undefined
  /** The login environment every PTY gets — how the CLI finds its config. */
  env: Record<string, string>
  /**
   * M102. The environment for ONE session — the login env plus the door and
   * the session's own panel id and token (`TC_PANEL_ID`, `TC_PANEL_TOKEN`,
   * `TC_CONTROL_SOCKET`), so `tc api` from inside a chat is that chat's, not a
   * claim. Absent means `env` for every session (every pre-M102 check).
   */
  envFor?: (id: string) => Record<string, string>
  newSessionId: () => string
  /**
   * M73. Whether the CLI already holds a transcript for this session id
   * (main answers with M17's `resolveTranscript`). Consulted at the FIRST
   * spawn only; after that the session knows it has run. Absent means never,
   * which is what every M71 check assumes.
   */
  transcriptExists?: (sessionId: string) => boolean
  now?: () => number
  /** How long an interrupt may go unanswered before the process is killed. */
  interruptGraceMs?: number
  /**
   * M97. How long an auto run waits on a permission question before it
   * resolves `stuck: permission` — the question stays pending for the user;
   * only the RUN stops. Absent is a minute.
   */
  autoPermissionGraceMs?: number
  /** The delta batch window. */
  coalesceMs?: number
}


interface Session {
  backend: AgentBackend
  /** M90. codex: the current process has reported turn.completed, so its exit is the turn's normal end. */
  turnEnded: boolean
  /** M81. The supervisor's job, appended to the CLI's system prompt on every spawn. */
  appendSystemPrompt?: string
  id: string
  cwd: string
  agentOptions?: AgentOptions
  sessionId: string
  status: AgentSessionStatus
  model?: string
  proc?: AgentProcess
  exitCode?: number | null
  exitSignal?: string
  everSpawned: boolean
  /**
   * M319. The CLI's own sentence when it was asked to resume this
   * conversation and answered that it does not exist (pruned, another
   * machine's, a codex thread from a deleted home). Set with `everSpawned`
   * cleared, so the NEXT message starts a fresh conversation instead of
   * failing the same resume on every send; cleared by that next spawn.
   */
  resumeLost?: string
  /** M120. A chat with no place: the row's sandboxArgs ride every spawn; a row without them refuses the send. */
  sandbox: boolean
  carry: string
  /**
   * M119. A backend with a handshake (ACP) opens its session AFTER the
   * process is up: `initialize`, then `session/new` or `session/load` once
   * that answers. The first prompt is HELD here until the session event
   * names an id — a prompt written before that is a prompt with no session,
   * which the agent errors on or ignores, and the panel reads `working`
   * forever. Cleared with the process (exit, dispose, an error result).
   */
  awaitingHandshake: boolean
  handshakeTimer: ReturnType<typeof setTimeout> | null
  /** Whether the pending handshake should load the session it names rather than mint one. */
  handshakeResume: boolean
  heldPrompt?: { text: string; images: OutgoingImage[] }
  /**
   * M119. What the LAST handshake answered. Kept across an exit (the next
   * spawn's own answer replaces it), so a snapshot between processes still
   * states the fact; never persisted — a relaunch asks again.
   */
  negotiated?: NegotiatedCapabilities
  turns: TranscriptTurn[]
  inFlight: boolean
  interrupting: boolean
  interruptTimer: ReturnType<typeof setTimeout> | null
  abortReason: 'interrupt-timeout' | 'handshake-timeout' | 'budget' | 'cap' | 'terminated' | null
  /**
   * `auto` marks a continuation the run pushed: dropped with the run, never served after it.
   * M322. Each entry names the stored user turn that carries it (`turnId`),
   * so an edit rewrites that turn, a removal withdraws it, and a dequeue
   * re-stores it — delivered, and at the END — at the moment it is written.
   */
  queue: QueueEntry[]
  /** M322. The stem of this session's user-turn ids, so a relaunch's `u-1` is never yesterday's `u-1` in the log. */
  turnStem: string
  pending: Map<string, PendingPermission>
  /** M102. Resolvers for the questions that are ours (the broker's), by request id. */
  external: Map<string, (allow: boolean) => void>
  usage: TokenTotals
  costUsd?: number
  /**
   * M350. The node's meter, kept apart from `costUsd` (which every M82–M349
   * reader reads as the current process's figure). `procUsd` is the current
   * process's reported cost; `priorUsd` carries the finished processes'.
   * Both absent until priced.
   */
  procUsd?: number
  priorUsd?: number
  /** M350. Tokens in the conversation as of the latest message that reported usage. */
  context?: number
  /** M380. The window those tokens fill, from the latest result that reported one. */
  window?: number
  /** M350. Set when the node crosses a cap, cleared only when a cap read live no longer holds it. */
  held?: CapHold
  /** M350. The last meter said, so an unchanged one is not said again. */
  meterKey: string
  turnCount: number
  userTurns: number
  counters: AgentSessionCounters
  batch: AgentSessionEvent[]
  batchTimer: ReturnType<typeof setTimeout> | null
  /**
   * M97. The live auto run, MAIN's own count. `turn` counts results seen
   * since the start; the limit is enforced here and nowhere else, so the
   * renderer's chip can be wrong and the stop still lands.
   */
  auto?: AutoRun
  /** M97. The last resolved run, shown on the chip until the next start or a dispose. */
  autoLast?: AutoStatus
}

interface QueueEntry {
  turnId: string
  text: string
  images: (OutgoingImage & { name?: string })[]
  reason: 'in-flight' | 'concurrency'
  auto?: true
  correction?: true
}

/** M322. What the transcript says about a message the agent never received because its process ended. */
const NOT_DELIVERED_EXIT = 'not delivered — the agent stopped before this message was sent'

interface AutoRun {
  /** True while `send` is being called BY the run, so the queue entry is tagged. */
  sending: boolean
  mode: AutoModeId
  turn: number
  limit: number
  continuation: string
  permissionTimer: ReturnType<typeof setTimeout> | null
}

const AUTO_PERMISSION_GRACE_MS = 60_000

const INTERRUPT_GRACE_MS = 5000
const COALESCE_MS = 16

export class AgentSessionManager {
  /** Latched at a crossing so one crossing is one stop; cleared when the ceiling is raised. */
  private budgetStopped = false
  /** Canvas-wide usage windows from the latest rate_limit_event. */
  private rateLimitState: RateLimitState = RATE_LIMIT_NONE

  private readonly sessions = new Map<string, Session>()
  private readonly listeners = new Set<(event: AgentSessionEvent) => void>()
  private readonly now: () => number
  private readonly interruptGraceMs: number
  private readonly coalesceMs: number
  private requestSeq = 0

  constructor(private readonly deps: AgentSessionDeps) {
    this.now = deps.now ?? (() => Date.now())
    this.interruptGraceMs = deps.interruptGraceMs ?? INTERRUPT_GRACE_MS
    this.coalesceMs = deps.coalesceMs ?? COALESCE_MS
  }

  /** Account-level usage windows — none until the first rate_limit_event. */
  rateLimit(): RateLimitState {
    return this.rateLimitState
  }

  /** Synchronous, cannot fail, idempotent at an id. Spawns nothing. */
  create(spec: AgentSessionSpec): AgentSessionSnapshot {
    const existing = this.sessions.get(spec.id)
    if (existing) return this.snapshot(existing)
    const backend = backendOf(spec)
    const session: Session = {
      backend,
      turnEnded: false,
      id: spec.id,
      cwd: spec.cwd,
      agentOptions: spec.agentOptions,
      sessionId: spec.resume ?? spec.sessionId ?? this.deps.newSessionId(),
      status: 'not-started',
      // A resumed conversation spawns with --resume from its first process.
      // M90/M99. A backend whose thread id is the CLI's own has no pin to
      // create at: a record with turns names a real thread, so it resumes.
      everSpawned: spec.resume !== undefined || (BACKENDS[backend].adoptsThreadId && (this.deps.hasTurns?.(spec.id) ?? false)),
      sandbox: spec.sandbox === true,
      carry: '',
      awaitingHandshake: false,
      handshakeTimer: null,
      // M120. The chosen model shows in the header before the first turn; the stream's own word replaces it.
      model: spec.agentOptions?.model,
      handshakeResume: false,
      turns: [],
      inFlight: false,
      interrupting: false,
      interruptTimer: null,
      abortReason: null,
      queue: [],
      turnStem: this.now().toString(36),
      pending: new Map(),
      external: new Map(),
      usage: emptyTotals(),
      meterKey: '',
      turnCount: 0,
      userTurns: 0,
      counters: { ignored: 0, unknown: 0, malformed: 0 },
      // M81. The supervisor's job. On the SESSION, never inside `counters` —
      // the first cut spread it there, which typechecks (the field is optional
      // on both) and means no spawn ever carries the prompt.
      ...(spec.appendSystemPrompt === undefined ? {} : { appendSystemPrompt: spec.appendSystemPrompt }),
      batch: [],
      batchTimer: null
    }
    // M354. The meter picks up where the last launch left it. A figure the
    // earlier runs measured is carried; one they never measured stays
    // unmeasured, because "unknown" is never "over".
    const carried = this.deps.carried?.(spec.id)
    if (carried?.spentUsd !== undefined && carried.spentUsd > 0) session.priorUsd = carried.spentUsd
    if (carried?.context !== undefined && carried.context > 0) session.context = carried.context
    // A carried figure already past its cap is held at rest, so the Work tab
    // says the hold before a send is refused, not after. Nothing is in
    // flight at create, so there is nothing to interrupt.
    session.held = capCrossing(this.meterOf(session), this.capsOf(session)) ?? undefined
    session.meterKey = this.meterKeyOf(session)
    this.sessions.set(spec.id, session)
    // M355. A carried hold is SAID, once: the approval tracker hears only
    // events, and it is what puts a held agent in the decision queue.
    if (session.held !== undefined) this.emit({ id: spec.id, type: 'meter', meter: this.meterOf(session) })
    return this.snapshot(session)
  }

  /**
   * M75. `images` are decoded attachments: they go on the wire as base64
   * blocks and onto the transcript as PLACEHOLDERS (type and size), never as
   * bytes. A queued send keeps its images with its text.
   */
  send(id: string, text: string, images: readonly (OutgoingImage & { name?: string })[] = []): SendResult {
    const session = this.sessions.get(id)
    if (!session) return 'no-session'
    // M82. The canvas's own ceilings, read LIVE (a setting changed while a
    // panel is open must take effect on the next send, not the next launch).
    if (this.binaryFor(session.backend) === undefined) return 'refused-backend'
    // M120. A row with no read-only mode cannot run a chat with no folder: refused by name, nothing spawned.
    if (session.sandbox && BACKENDS[session.backend].sandboxArgs === undefined) return 'refused-sandbox'
    // M90. A prompt that is an argument has no block to carry an image.
    // Refused whole and stored nowhere, like the budget's refusal. M119: the
    // handshake's answer outranks the row when this process gave one.
    if (images.length > 0 && !imagesAllowed(session, BACKENDS[session.backend])) return 'refused-images'
    // M97. A send by hand after a resolved run supersedes its chip: the next
    // snapshot no longer carries it (the renderer's dismiss is local; this is
    // main's half, so a workspace switch does not resurrect a dismissed chip).
    if (session.auto === undefined && session.autoLast !== undefined) session.autoLast = undefined
    const limits = this.deps.limits?.() ?? { maxConcurrent: 0, budgetUsd: 0, budgetWindowPercent: 0 }
    const crossing = budgetCrossing({
      budgetUsd: limits.budgetUsd,
      budgetWindowPercent: limits.budgetWindowPercent ?? 0,
      spentUsd: this.spent(),
      windowUtil: windowUtilization(this.rateLimitState)
    })
    if (crossing !== null) {
      // Nothing stored: a refused message is not a turn, and a transcript that
      // held it would show the user a message the agent never received.
      return 'refused-budget'
    }
    // M350. This node's own cap, re-read live. Refused like the budget, and
    // stored nowhere; a cap raised above the figure releases the node here,
    // and whatever it was holding goes first.
    if (this.holdAtSend(session) !== null) return 'refused-cap'
    const busy = [...this.sessions.values()].filter((s) => s.inFlight).length
    if (limits.maxConcurrent > 0 && !session.inFlight && busy >= limits.maxConcurrent) {
      this.enqueue(session, text, images, 'concurrency')
      return 'queued'
    }
    // On the transcript the moment it is sent, before the CLI has echoed
    // anything — the echo (`isReplay`) is deliberately NOT stored, or every
    // message would appear twice.
    // M90. A codex process lingers between its result and its exit; a send in
    // that window cannot spawn (the thread is still held) and must not be
    // dropped as sent — it queues, and handleExit serves it.
    if (session.inFlight || (BACKENDS[session.backend].oneProcessPerTurn && session.proc !== undefined)) {
      this.enqueue(session, text, images, 'in-flight')
      return 'queued'
    }
    this.storeTurn(session, this.userTurn(`u-${session.turnStem}-${++session.userTurns}`, text, images))
    this.startTurn(session, text, images)
    return 'sent'
  }

  /**
   * M322. STOP AND SEND: the correction goes FIRST in line and the turn in
   * flight is interrupted, so the agent's next input is the correction rather
   * than whatever was already waiting. The interrupted result serves the
   * queue's head (the ordinary path), so nothing new decides what goes next.
   * With nothing in flight it is an ordinary send. A backend with no
   * interrupt door answers `interrupted: false` and the correction still
   * leads the queue — sent the moment this turn ends — which the composer
   * says rather than offering a stop that cannot happen.
   */
  sendCorrection(id: string, text: string, images: readonly (OutgoingImage & { name?: string })[] = []): { result: SendResult; interrupted: boolean } {
    const session = this.sessions.get(id)
    if (!session) return { result: 'no-session', interrupted: false }
    const result = this.send(id, text, images)
    if (result !== 'queued') return { result, interrupted: false }
    const entry = session.queue.pop()
    if (entry === undefined) return { result, interrupted: false }
    // Behind any earlier correction (two corrections keep the order they were
    // typed in), ahead of everything else.
    const at = session.queue.findIndex((q) => q.correction !== true)
    session.queue.splice(at < 0 ? session.queue.length : at, 0, { ...entry, correction: true })
    this.emitQueue(session)
    return { result, interrupted: this.interrupt(id) }
  }

  /**
   * M322. A waiting message's new text. The stored turn is rewritten under its
   * own id (the log keeps the last line per id), so the transcript, a
   * relaunch and the wire all read the edited words. False once it has been
   * sent, or for an empty text — an empty edit is a removal, and says so.
   */
  editQueued(id: string, turnId: string, text: string): boolean {
    const session = this.sessions.get(id)
    const entry = session?.queue.find((q) => q.turnId === turnId)
    if (session === undefined || entry === undefined || entry.auto === true || text.trim() === '') return false
    entry.text = text
    const turn = session.turns.find((t) => t.id === turnId)
    if (turn !== undefined) {
      const first = turn.blocks.findIndex((x) => x.type === 'text')
      turn.blocks = turn.blocks.map((block, i) => (i === first ? { type: 'text', text } : block))
      this.emit({ id, type: 'turn', turn: { ...turn, blocks: [...turn.blocks] } })
    }
    this.emitQueue(session)
    return true
  }

  /** M322. One waiting message withdrawn before it was sent: out of the queue AND off the transcript. False once sent. */
  removeQueued(id: string, turnId: string): boolean {
    const session = this.sessions.get(id)
    const at = session?.queue.findIndex((q) => q.turnId === turnId) ?? -1
    if (session === undefined || at < 0) return false
    session.queue.splice(at, 1)
    this.withdrawTurn(session, turnId)
    this.emit({ id, type: 'queue-dropped', count: 1 })
    this.emitQueue(session)
    return true
  }

  /**
   * M322. An UNDELIVERED turn discarded — one the transcript marks
   * `not-delivered` (a dropped queue). False for a turn this session does not
   * hold or one that was delivered: what the agent saw is history, and
   * history is not edited. A turn only the durable log holds (a relaunch) is
   * main's handler's to drop; this answers false for it.
   */
  discardUndelivered(id: string, turnId: string): boolean {
    const session = this.sessions.get(id)
    const turn = session?.turns.find((t) => t.id === turnId)
    if (session === undefined || turn === undefined || turn.delivery !== 'not-delivered') return false
    this.withdrawTurn(session, turnId)
    return true
  }

  private userTurn(turnId: string, text: string, images: readonly OutgoingImage[], delivery?: 'queued'): TranscriptTurn {
    return {
      id: turnId,
      role: 'user',
      blocks: [
        { type: 'text', text },
        ...images.map((img) => ({ type: 'image' as const, mediaType: img.mediaType, size: Buffer.byteLength(img.base64, 'base64') }))
      ],
      at: this.now(),
      ...(delivery === undefined ? {} : { delivery })
    }
  }

  /**
   * M322. The queue entry is pushed and ANNOUNCED before its turn is stored,
   * so no surface ever holds a `queued` turn that is not in the waiting list
   * (it would read as undelivered for a frame).
   */
  private enqueue(session: Session, text: string, images: readonly (OutgoingImage & { name?: string })[], reason: 'in-flight' | 'concurrency'): void {
    const turnId = `u-${session.turnStem}-${++session.userTurns}`
    session.queue.push({ turnId, text, images: images.map((img) => ({ mediaType: img.mediaType, base64: img.base64, ...(img.name === undefined ? {} : { name: img.name }) })), reason, ...(session.auto?.sending ? { auto: true as const } : {}) })
    this.emitQueue(session)
    this.storeTurn(session, this.userTurn(turnId, text, images, 'queued'))
    this.emit({ id: session.id, type: 'queued', text, reason })
  }

  /**
   * M322. The queue's head, handed to the agent: its `queued` turn is
   * withdrawn and stored again DELIVERED, at the end of the transcript —
   * where it now belongs, after the answer it waited behind.
   */
  private takeNext(session: Session): QueueEntry | undefined {
    const next = session.queue.shift()
    if (next === undefined) return undefined
    this.withdrawTurn(session, next.turnId)
    this.storeTurn(session, this.userTurn(next.turnId, next.text, next.images))
    this.emitQueue(session)
    return next
  }

  private withdrawTurn(session: Session, turnId: string): void {
    const at = session.turns.findIndex((t) => t.id === turnId)
    if (at >= 0) session.turns.splice(at, 1)
    this.emit({ id: session.id, type: 'turn-removed', turnId })
  }

  /**
   * M322. A dropped queue's messages are NOT withdrawn: the agent never saw
   * them, the person may still want them, and the transcript says so on each
   * one rather than silently showing them as sent.
   */
  private markUndelivered(session: Session, entries: readonly QueueEntry[], note: string): void {
    for (const entry of entries) {
      const turn = session.turns.find((t) => t.id === entry.turnId)
      if (turn === undefined) continue
      turn.delivery = 'not-delivered'
      turn.deliveryNote = note
      this.emit({ id: session.id, type: 'turn', turn: { ...turn, blocks: [...turn.blocks] } })
    }
  }

  private queueView(session: Session): QueuedMessage[] {
    return session.queue.map((q) => ({
      turnId: q.turnId,
      text: q.text,
      images: q.images.map((img) => ({ mediaType: img.mediaType, size: Buffer.byteLength(img.base64, 'base64') })),
      reason: q.reason,
      ...(q.correction === true ? { correction: true as const } : {}),
      ...(q.auto === true ? { auto: true as const } : {})
    }))
  }

  private emitQueue(session: Session): void {
    this.emit({ id: session.id, type: 'queue', queue: this.queueView(session) })
  }

  /**
   * M90. One door for both backends. claude: one long-lived process, the
   * message on stdin. codex: a process PER TURN with the prompt in its argv
   * and stdin closed; `exec` first, `exec resume <thread>` once the thread
   * id has been adopted from the first stream.
   */
  private startTurn(session: Session, text: string, images: readonly OutgoingImage[]): void {
    if (BACKENDS[session.backend].oneProcessPerTurn) {
      this.spawnTurnProcess(session, text)
      return
    }
    this.ensureProcess(session)
    this.writeUser(session, text, images)
  }

  /** True when a request was written; false with no turn in flight. */
  interrupt(id: string): boolean {
    const session = this.sessions.get(id)
    if (!session || !session.inFlight || !session.proc) return false
    // M90. codex has no interrupt door: the only stop is a kill, which the
    // composer names (`close the panel to stop it`) rather than doing here
    // under a verb that means "finish gracefully" on the other backend.
    if (!BACKENDS[session.backend].interrupts) return false
    // M119. A prompt still held behind the handshake has not reached the
    // agent: nothing is answering, so there is nothing to cancel.
    if (session.awaitingHandshake) return false
    const requestId = `tc-int-${++this.requestSeq}`
    session.proc.write(BACKEND_ADAPTERS[session.backend].encodeInterrupt?.(session, requestId) ?? interruptLine(requestId))
    session.interrupting = true
    this.clearInterruptTimer(session)
    const proc = session.proc
    session.interruptTimer = setTimeout(() => {
      session.interruptTimer = null
      // Still the same process, still mid-turn: the CLI ignored us. Kill it;
      // the exit arrives through onExit and names this as the reason.
      if (this.sessions.get(id) !== session || session.proc !== proc || !session.inFlight) return
      session.abortReason = 'interrupt-timeout'
      proc.kill()
    }, this.interruptGraceMs)
    return true
  }

  /**
   * M319. CANCEL — the messages waiting behind the turn in flight are dropped;
   * the turn itself is not touched. Answers how many were dropped (0 with
   * nothing queued), and emits `queue-dropped` so every surface counts down.
   */
  cancelQueued(id: string): number {
    const session = this.sessions.get(id)
    if (!session || session.queue.length === 0) return 0
    const count = session.queue.length
    const dropped = session.queue.splice(0)
    // M322. Cancelled by the person: withdrawn, like a removal of each.
    for (const entry of dropped) this.withdrawTurn(session, entry.turnId)
    this.emit({ id, type: 'queue-dropped', count })
    this.emitQueue(session)
    return count
  }

  /**
   * M319. TERMINATE — the CLI's process is killed, and the SESSION is kept
   * (unlike `dispose`): the transcript, the conversation id and the panel
   * stay, and the next message spawns a new process that resumes. The one
   * stop codex and copilot have; on claude it is what Interrupt escalates to
   * when the CLI ignores the request. Child processes the CLI started are not
   * tracked, and the caller's sentence says so. False with no process.
   */
  terminate(id: string): boolean {
    const session = this.sessions.get(id)
    if (!session || !session.proc) return false
    session.abortReason = 'terminated'
    session.proc.kill()
    return true
  }

  /**
   * M102. A question that is NOT the CLI's — the broker asking before a
   * write — put on the session's pending set so every surface answers it
   * through the one door (`answerPermission`), M98's grants included. It
   * resolves the answer; the process is never written to for it, and the
   * question dies with the session (dispose, exit) as `false`.
   */
  askExternal(id: string, toolName: string, input: Record<string, unknown>, description: string): Promise<boolean> {
    const session = this.sessions.get(id)
    if (!session) return Promise.resolve(false)
    if (this.deps.preAnswer?.(id, toolName) === true) {
      this.emit({ id, type: 'permission-auto-allowed', requestId: `tc-ext-${++this.requestSeq}`, toolName })
      return Promise.resolve(true)
    }
    const requestId = `tc-ext-${++this.requestSeq}`
    return new Promise<boolean>((resolve) => {
      session.external.set(requestId, resolve)
      session.pending.set(requestId, { requestId, toolName, input, description })
      this.emit({ id, type: 'permission-request', requestId, toolName, input, description })
    })
  }

  answerPermission(id: string, requestId: string, answer: PermissionAnswer): boolean {
    const session = this.sessions.get(id)
    if (!session) return false
    const pending = session.pending.get(requestId)
    if (!pending) return false
    const external = session.external.get(requestId)
    if (external !== undefined) {
      // Ours, not the CLI's: nothing is written to the process.
      session.external.delete(requestId)
      external(answer.allow)
    } else {
      if (!session.proc) return false
      // M119. The grant is read at ANSWER time: main grants first and then
      // answers through this door (index.ts's order), so a vendor with a
      // word for the grant (ACP's allow_always) hears it on this very answer.
      const grant = answer.allow && this.deps.preAnswer?.(id, pending.toolName) === true
      session.proc.write(this.encodePermission(session, requestId, pending.input, answer, grant))
    }
    session.pending.delete(requestId)
    if (session.auto !== undefined && session.pending.size === 0 && session.auto.permissionTimer !== null) { clearTimeout(session.auto.permissionTimer); session.auto.permissionTimer = null }
    this.emit({ id, type: 'permission-answered', requestId, allow: answer.allow })
    return true
  }

  /**
   * M97. Start a bounded run. The opening prompt goes through the ordinary
   * `send` — it queues behind `agents.maxConcurrent` and is refused past
   * `agents.budgetUsd` by name, unchanged — and every result after that is
   * counted HERE. The limit is the mode's unless the caller lowers it.
   */
  startAuto(id: string, opts: { mode: AutoModeId; task?: string; limit?: number }): AutoStartResult {
    const session = this.sessions.get(id)
    if (!session) return { kind: 'refused', reason: 'no such session' }
    if (session.auto !== undefined) return { kind: 'refused', reason: `an auto run is already running here (${session.auto.mode}) — stop it first` }
    const prompts = autoPlanOf(opts.mode, id, opts.task)
    const limit = Math.max(1, Math.min(prompts.limit, opts.limit ?? prompts.limit))
    session.auto = { sending: false, mode: opts.mode, turn: 0, limit, continuation: prompts.continuation, permissionTimer: null }
    session.autoLast = undefined
    this.emitAuto(session, 'running')
    session.auto.sending = true
    const sent = this.send(id, prompts.opening)
    if (session.auto) session.auto.sending = false
    if (sent === 'refused-budget' || sent === 'refused-cap' || sent === 'refused-backend' || sent === 'refused-sandbox' || sent === 'no-session') {
      this.resolveAuto(session, 'stuck', sent === 'refused-budget' ? 'budget' : sent === 'refused-cap' ? 'cap' : 'error')
      return { kind: 'refused', reason: sent === 'refused-budget' ? 'the budget refused the opening send' : sent === 'refused-cap' ? 'the agent is held at its own cap' : 'the send was refused' }
    }
    return { kind: 'started', limit }
  }

  /** M97. True when a run was live: it resolves `stopped`, and a turn in flight is interrupted. */
  stopAuto(id: string): boolean {
    const session = this.sessions.get(id)
    if (!session || session.auto === undefined) return false
    this.resolveAuto(session, 'stopped')
    if (session.inFlight) this.interrupt(id)
    return true
  }

  private emitAuto(session: Session, state: AutoStatus['state'], reason?: AutoStuckReason): void {
    const run = session.auto
    const status: AutoStatus = run === undefined
      ? (session.autoLast ?? { mode: 'complete', turn: 0, limit: 0, state })
      : { mode: run.mode, turn: run.turn, limit: run.limit, state, ...(reason === undefined ? {} : { reason }) }
    this.emit({ id: session.id, type: 'auto', ...status })
  }

  private resolveAuto(session: Session, state: 'done' | 'stuck' | 'stopped', reason?: AutoStuckReason): void {
    const run = session.auto
    if (run === undefined) return
    if (run.permissionTimer !== null) { clearTimeout(run.permissionTimer); run.permissionTimer = null }
    // The run's own continuations leave with it: a continuation queued behind
    // a message the user typed mid-turn would otherwise be served after the
    // stop — a paid turn on the auto prompt under a chip that reads stopped.
    const kept = session.queue.filter((q) => q.auto !== true)
    const gone = session.queue.filter((q) => q.auto === true)
    const dropped = gone.length
    session.queue = kept
    // M322. The run's own prompts leave the transcript with it: a person never typed them.
    for (const entry of gone) this.withdrawTurn(session, entry.turnId)
    if (dropped > 0) { this.emit({ id: session.id, type: 'queue-dropped', count: dropped }); this.emitQueue(session) }
    session.autoLast = { mode: run.mode, turn: run.turn, limit: run.limit, state, ...(reason === undefined ? {} : { reason }) }
    session.auto = undefined
    this.emit({ id: session.id, type: 'auto', ...session.autoLast })
  }

  /**
   * M97. The decision, on every result of a session with a run live — made
   * BEFORE the queue is served (so a stop or the limit lands even when a
   * user's message is queued ahead of the continuation), and the
   * continuation sent AFTER it (so it lands behind what the user typed). An
   * interrupted result by hand is a stop; an error result is stuck: error.
   */
  private autoDecide(session: Session, event: { ok?: boolean; interrupted: boolean }): boolean {
    const run = session.auto
    if (run === undefined) return false
    run.turn += 1
    if (event.interrupted) { this.resolveAuto(session, 'stopped'); return false }
    const last = [...session.turns].reverse().find((t) => t.role === 'assistant')
    const text = last === undefined ? '' : last.blocks.filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text').map((b) => b.text).join('\n')
    if (text.includes(AUTO_DONE_MARKER)) { this.resolveAuto(session, 'done'); return false }
    if (event.ok === false) { this.resolveAuto(session, 'stuck', 'error'); return false }
    if (run.turn >= run.limit) { this.resolveAuto(session, 'stuck', 'limit'); return false }
    this.emitAuto(session, 'running')
    return true
  }

  private autoContinue(session: Session): void {
    const run = session.auto
    if (run === undefined) return
    run.sending = true
    const sent = this.send(session.id, run.continuation)
    if (session.auto === run) run.sending = false
    if (sent === 'refused-budget') this.resolveAuto(session, 'stuck', 'budget')
    else if (sent === 'refused-cap') this.resolveAuto(session, 'stuck', 'cap')
    else if (sent !== 'sent' && sent !== 'queued') this.resolveAuto(session, 'stuck', 'error')
  }

  dispose(id: string): void {
    const session = this.sessions.get(id)
    if (!session) return
    // Deleted FIRST, so the process's late callbacks find nothing to speak to.
    this.sessions.delete(id)
    this.clearInterruptTimer(session)
    if (session.auto?.permissionTimer) clearTimeout(session.auto.permissionTimer)
    session.auto = undefined
    session.autoLast = undefined
    this.dropBatch(session)
    session.queue.length = 0
    session.heldPrompt = undefined
    session.awaitingHandshake = false
    for (const resolve of session.external.values()) resolve(false)
    session.external.clear()
    session.pending.clear()
    session.inFlight = false
    if (session.proc) {
      const proc = session.proc
      session.proc = undefined
      proc.kill()
    }
    session.status = 'disposed'
    this.emit({ id, type: 'status', status: 'disposed' })
  }

  disposeAll(): void {
    for (const id of [...this.sessions.keys()]) this.dispose(id)
  }

  list(): AgentSessionSnapshot[] {
    return [...this.sessions.values()].map((s) => this.snapshot(s))
  }

  get(id: string): AgentSessionSnapshot | undefined {
    const session = this.sessions.get(id)
    return session ? this.snapshot(session) : undefined
  }

  /** The stored turns, copied. Empty for an unknown id. */
  transcript(id: string): TranscriptTurn[] {
    const session = this.sessions.get(id)
    if (!session) return []
    return session.turns.map((t) => ({ ...t, blocks: [...t.blocks] }))
  }

  /** Returns its own unsubscribe, the preload convention. */
  subscribe(cb: (event: AgentSessionEvent) => void): () => void {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  /* ---------------------------------------------------------------------- */

  private ensureProcess(session: Session): void {
    if (session.proc) return
    // The probe runs only while this session has never spawned: a CLI
    // transcript exists for a conversation that ran in a previous launch.
    const resume = session.everSpawned || (this.deps.transcriptExists?.(session.sessionId) ?? false)
    const proc = this.spawn(session, { text: '', resume })
    if (proc === undefined) return
    session.everSpawned = true
    // M119. A wire with a handshake: the opening line goes first, and the
    // session opens when it answers (the `session` arm below). Sequential,
    // as measured — a session/new pipelined behind initialize was never
    // recorded, and an agent that refused it would fail silently.
    const opening = BACKEND_ADAPTERS[session.backend].handshake?.(session)
    if (opening !== undefined) {
      session.awaitingHandshake = true
      session.handshakeResume = resume
      proc.write(opening)
      // A handshake nobody answers — a logged-out CLI, an older binary printing
      // help and idling — must not leave the panel at `starting` forever with
      // both verbs dead: the interrupt grace applies, and the kill names it.
      this.clearHandshakeTimer(session)
      session.handshakeTimer = setTimeout(() => {
        session.handshakeTimer = null
        if (this.sessions.get(session.id) !== session || session.proc !== proc || !session.awaitingHandshake) return
        session.abortReason = 'handshake-timeout'
        proc.kill()
      }, this.interruptGraceMs)
    }
    this.setStatus(session, 'starting')
  }

  /**
   * M90/M99. A process PER TURN, for a backend whose prompt is an argument:
   * `exec` first, `exec resume <thread>` once the thread id has been adopted
   * from the first stream.
   */
  private spawnTurnProcess(session: Session, text: string): void {
    if (session.proc) return
    const proc = this.spawn(session, { text, resume: session.everSpawned })
    if (proc === undefined) return
    session.turnEnded = false
    session.inFlight = true
    session.interrupting = false
    this.setStatus(session, session.everSpawned ? 'streaming' : 'starting')
  }

  /**
   * ONE spawn for both shapes: argv from the backend's adapter, the binary
   * from deps, stdin closed when the row says an open pipe blocks the CLI,
   * and both process callbacks gated on identity (the M61 rule) before the
   * chunk reaches the backend's parser. Undefined when the binary is absent
   * — `send` refused that by name already; this is the second lock.
   */
  private spawn(session: Session, turn: { text: string; resume: boolean }): AgentProcess | undefined {
    const binary = this.binaryFor(session.backend)
    if (binary === undefined) return undefined
    const row: BackendDef = BACKENDS[session.backend]
    const adapter = BACKEND_ADAPTERS[session.backend]
    const args = adapter.args({
      cwd: session.cwd,
      text: turn.text,
      resume: turn.resume,
      sessionId: session.sessionId,
      agentOptions: session.agentOptions,
      ...(session.appendSystemPrompt === undefined ? {} : { appendSystemPrompt: session.appendSystemPrompt }),
      ...(session.sandbox ? { sandbox: true as const } : {})
    })
    // `closeStdin` is written only when true: the fake runner records the
    // spawn as handed, and M71's checks compare the claude spawn by shape.
    const proc = this.deps.runner({ command: binary, args, cwd: session.cwd, env: this.deps.envFor?.(session.id) ?? this.deps.env, ...(row.closeStdin ? { closeStdin: true } : {}) })
    session.proc = proc
    session.carry = ''
    session.exitCode = undefined
    session.exitSignal = undefined
    session.resumeLost = undefined
    session.abortReason = null
    // M350. A new process reports its cost from 0 again: the last one's
    // figure is carried, so the node's spend never goes backwards.
    if (session.procUsd !== undefined) {
      session.priorUsd = (session.priorUsd ?? 0) + session.procUsd
      session.procUsd = undefined
    }
    proc.onData((chunk) => {
      if (this.sessions.get(session.id) !== session || session.proc !== proc) return
      const { events, carry } = adapter.parseChunk(chunk, session.carry, { sessionId: session.sessionId })
      session.carry = carry
      for (const event of events) this.handle(session, event)
    })
    proc.onExit((info) => {
      if (this.sessions.get(session.id) !== session || session.proc !== proc) return
      this.handleExit(session, info)
    })
    return proc
  }

  /**
   * M99. The resolved binary for a backend: `binaries` first, then M71's
   * `command` (claude) and M90's `codex`, kept so every earlier caller and
   * check reads the same. A lookup, never a switch on the name.
   */
  private binaryFor(backend: AgentBackend): string | undefined {
    const general = this.deps.binaries?.[backend]?.command
    if (general !== undefined) return general
    const legacy: Partial<Record<AgentBackend, string | undefined>> = { claude: this.deps.command, codex: this.deps.codex?.command }
    return legacy[backend]
  }

  private writeUser(session: Session, text: string, images: readonly OutgoingImage[] = []): void {
    if (!session.proc) return
    session.inFlight = true
    session.interrupting = false
    // M119. Held, not written, until the session opens; a second send in the
    // meantime queues behind `inFlight` like any turn.
    if (session.awaitingHandshake) {
      session.heldPrompt = { text, images: [...images] }
      return
    }
    session.proc.write(BACKEND_ADAPTERS[session.backend].encodeUser?.(session, text, images) ?? userMessageLine(text, images))
    if (session.status === 'ready') this.setStatus(session, 'streaming')
  }

  /** M119. The adapter's answer line when it has one; claude's control_response otherwise. */
  private encodePermission(session: Session, requestId: string, input: Record<string, unknown>, answer: PermissionAnswer, grant: boolean): string {
    return BACKEND_ADAPTERS[session.backend].encodePermission?.(session, requestId, input, answer, grant) ?? permissionResponseLine(requestId, input, answer)
  }

  private handle(session: Session, event: TranscriptEvent): void {
    const id = session.id
    switch (event.type) {
      case 'session':
        session.model = event.model ?? session.model
        if (event.negotiated !== undefined) session.negotiated = { ...event.negotiated }
        if (event.sessionId === '') {
          // M119. The handshake's first answer (ACP's initialize): no session
          // yet. Open one now — the adapter decides whether that is a new
          // session or a load of the one this session names.
          if (session.awaitingHandshake && session.proc) {
            // M119. The row promised a resume; the agent's own answer decides.
            // A load on an agent that said loadSession: false errors — or
            // silently starts fresh under the old id, which is worse.
            const resume = session.handshakeResume && (session.negotiated?.loadSession ?? true)
            const open = BACKEND_ADAPTERS[session.backend].openSession?.(session, resume)
            if (open !== undefined) session.proc.write(open)
          }
          this.emit({ id, ...event })
          return
        }
        // M90. codex mints the thread id; the first stream is where the
        // session learns what `exec resume` must name. claude's id is ours
        // (pinned with --session-id), and the event only ever repeats it.
        if (BACKENDS[session.backend].adoptsThreadId) { session.sessionId = event.sessionId; session.everSpawned = true }
        // M118. A per-turn row whose id is the HOST's (copilot): the first
        // stream is still where the session learns the CLI now holds it, so
        // the next process must name `--resume=` rather than pin again — a
        // second pin of the same id is a fresh conversation with no memory.
        else if (BACKENDS[session.backend].oneProcessPerTurn) session.everSpawned = true
        this.clearHandshakeTimer(session)
        if (session.awaitingHandshake) {
          // M119. The session is open: the held prompt goes now, through the
          // ordinary writer (the hold is off, so it writes).
          session.awaitingHandshake = false
          const held = session.heldPrompt
          session.heldPrompt = undefined
          if (held !== undefined) this.writeUser(session, held.text, held.images)
        }
        if (session.status === 'starting') this.setStatus(session, session.inFlight ? 'streaming' : 'ready')
        this.emit({ id, ...event })
        return
      case 'ignored':
        session.counters.ignored += 1
        return
      case 'rate-limit':
        // Canvas-wide, not per session: the last event from any conversation
        // is the account's truth for the gauge and the window budget.
        this.rateLimitState = foldRateLimit(this.rateLimitState, event, this.now())
        this.emit({ id, ...event })
        this.enforceBudget()
        return
      case 'unknown':
        session.counters.unknown += 1
        this.emit({ id, ...event })
        return
      case 'malformed':
        session.counters.malformed += 1
        this.emit({ id, ...event })
        return
      case 'block-delta':
        this.enqueueDelta(session, { id, ...event })
        return
      case 'assistant': {
        // M119. History an ACP session/load replays: stored already (the
        // transcript file), so storing it again doubles every turn on relaunch.
        if (event.replay === true) return
        // M350. Each API call's usage says how full the conversation is NOW —
        // measured per message, so a cap can stop the turn it is crossed in.
        // The per-block records repeat one message's usage, so this is set,
        // never summed.
        if (event.usage !== undefined) {
          session.context = contextTokens(event.usage)
          this.meterChanged(session)
          this.enforceCap(session)
        }
        const last = session.turns[session.turns.length - 1]
        if (last && last.role === 'assistant' && last.id === event.messageId) {
          last.blocks.push(...event.blocks)
          last.model = event.model ?? last.model
          // The per-block records repeat one message's usage; it is NOT
          // summed here or anywhere — the result prices the turn.
          this.emit({ id, type: 'turn', turn: { ...last, blocks: [...last.blocks] } })
          return
        }
        this.storeTurn(session, {
          id: event.messageId,
          role: 'assistant',
          blocks: event.blocks,
          model: event.model,
          usage: event.usage,
          at: this.now()
        })
        return
      }
      case 'user':
        // Our own message echoed back; already stored at send().
        if (event.replay) return
        this.storeTurn(session, {
          id: `u-${session.turnStem}-${++session.userTurns}`,
          role: 'user',
          blocks: event.blocks,
          at: this.now()
        })
        return
      case 'result': {
        const interrupted = session.interrupting
        session.inFlight = false
        session.interrupting = false
        // M119. An error answer to the handshake itself (a load the agent
        // refused): the held prompt never went, and this result is its end.
        session.awaitingHandshake = false
        session.heldPrompt = undefined
        this.clearHandshakeTimer(session)
        this.clearInterruptTimer(session)
        // M319. claude answers a resume of a conversation it no longer holds
        // IN-STREAM (a zero-turn result whose `errors` name the id). Without
        // this the next send resumes the same missing id and fails again.
        const lost = event.ok ? null : resumeLostDetail(session.backend, event.error)
        if (lost !== null) { session.resumeLost = lost; session.everSpawned = false }
        if (lost === null) session.turnCount += 1
        if (event.usage) session.usage = addTotals(session.usage, event.usage)
        if (event.costUsd !== undefined) { session.costUsd = event.costUsd; session.procUsd = event.costUsd }
        if (event.contextWindow !== undefined) session.window = event.contextWindow
        this.meterChanged(session)
        // M350. The node's own cap, after the canvas's (M82) and before the
        // queue: a held node keeps what is waiting and sends none of it.
        this.enforceCap(session)
        // M82. A result is where the canvas's spend changes, so it is where a
        // crossing is noticed — once, and by INTERRUPTING (never killing): a
        // killed agent loses its turn, and the budget is a stop, not a loss.
        this.enforceBudget()
        if (BACKENDS[session.backend].oneProcessPerTurn) {
          // M90. The process is about to exit; that exit is this turn's END,
          // not a failure. The queue is served from handleExit, once the
          // process is gone, because a second process cannot resume a
          // thread the first still holds.
          session.turnEnded = true
          this.setStatus(session, 'ready')
          this.emit({ id, ...event, interrupted })
          // The continuation queues (the process is still held) and handleExit
          // serves it — or drops it, if the run resolved in between.
          if (this.autoDecide(session, { ok: event.ok, interrupted })) this.autoContinue(session)
          return
        }
        if (session.proc && session.status !== 'starting') this.setStatus(session, 'ready')
        this.emit({ id, ...event, interrupted })
        // M97. Decide first, serve the queue, then continue: the stop lands
        // whatever is queued, and the continuation lands behind it.
        const continueAuto = this.autoDecide(session, { ok: event.ok, interrupted })
        const next = session.held === undefined ? this.takeNext(session) : undefined
        if (next !== undefined) {
          this.writeUser(session, next.text, next.images)
          this.emit({ id, type: 'dequeued', text: next.text })
        }
        if (continueAuto) this.autoContinue(session)
        return
      }
      case 'permission-request':
        // M98. A tool the tracker has granted for this session is answered
        // HERE, before it is pending: the renderer never sees a request, so
        // no attention surface lights, and the transcript hears a quiet row
        // naming the tool. The answer is written to THIS process (the
        // identity gate above already held when the chunk arrived).
        if (this.deps.preAnswer?.(id, event.toolName) === true && session.proc) {
          session.proc.write(this.encodePermission(session, event.requestId, event.input, { allow: true }, true))
          this.emit({ id, type: 'permission-auto-allowed', requestId: event.requestId, toolName: event.toolName })
          return
        }
        // M97. A question nobody answers stops the RUN (not the question):
        // after the grace the run is stuck: permission, and the card still asks.
        if (session.auto !== undefined && session.auto.permissionTimer === null) {
          const run = session.auto
          run.permissionTimer = setTimeout(() => {
            run.permissionTimer = null
            if (session.auto !== run || session.pending.size === 0) return
            this.resolveAuto(session, 'stuck', 'permission')
          }, this.deps.autoPermissionGraceMs ?? AUTO_PERMISSION_GRACE_MS)
        }
        session.pending.set(event.requestId, {
          requestId: event.requestId,
          toolName: event.toolName,
          input: event.input,
          description: event.description,
          toolUseId: event.toolUseId
        })
        this.emit({ id, ...event })
        return
      default:
        this.emit({ id, ...event })
    }
  }

  private handleExit(session: Session, info: AgentExitInfo): void {
    const id = session.id
    session.proc = undefined
    // M319. codex and copilot answer a resume of a missing conversation on
    // STDERR and exit 1 with no stream at all (the recorded fixtures).
    const lost = resumeLostDetail(session.backend, info.stderr)
    if (lost !== null) { session.resumeLost = lost; session.everSpawned = false }
    // M90. A codex process that reported turn.completed and then exited 0
    // has ENDED ITS TURN: the session stays ready with its queue intact, and
    // the next queued message spawns the next process. Anything else — an
    // exit before the result, a non-zero code — is the ordinary exit below.
    if (BACKENDS[session.backend].oneProcessPerTurn && session.turnEnded && info.code === 0) {
      session.turnEnded = false
      session.carry = ''
      session.exitCode = undefined
      session.exitSignal = undefined
      this.flushBatch(session)
      // M350. A held node serves nothing until a cap releases it.
      const next = session.held === undefined ? this.takeNext(session) : undefined
      if (next !== undefined) {
        this.spawnTurnProcess(session, next.text)
        this.emit({ id, type: 'dequeued', text: next.text })
      }
      return
    }
    session.turnEnded = false
    session.exitCode = info.code
    session.exitSignal = info.signal ?? undefined
    session.carry = ''
    session.awaitingHandshake = false
    session.heldPrompt = undefined
    this.clearHandshakeTimer(session)
    this.clearInterruptTimer(session)
    // M97. A run whose process exited is stuck: exit — a real verdict with a
    // reason, never a chip that keeps spinning over a dead process.
    if (session.auto !== undefined) this.resolveAuto(session, 'stuck', 'exit')
    if (session.inFlight) {
      session.inFlight = false
      session.interrupting = false
      this.emit({ id, type: 'turn-aborted', reason: session.abortReason ?? 'exited' })
    }
    session.abortReason = null
    if (session.queue.length > 0) {
      const count = session.queue.length
      const dropped = session.queue.splice(0)
      this.markUndelivered(session, dropped, NOT_DELIVERED_EXIT)
      this.emit({ id, type: 'queue-dropped', count })
      this.emitQueue(session)
    }
    for (const [requestId, resolve] of [...session.external.entries()]) { session.external.delete(requestId); resolve(false) }
    for (const requestId of [...session.pending.keys()]) {
      session.pending.delete(requestId)
      this.emit({ id, type: 'permission-dropped', requestId })
    }
    session.status = 'exited'
    this.flushBatch(session)
    this.emit({
      id,
      type: 'status',
      status: 'exited',
      exitCode: info.code,
      exitSignal: info.signal ?? undefined,
      stderr: info.stderr,
      ...(session.resumeLost === undefined ? {} : { resumeLost: session.resumeLost })
    })
  }

  private storeTurn(session: Session, turn: TranscriptTurn): void {
    session.turns.push(turn)
    this.emit({ id: session.id, type: 'turn', turn: { ...turn, blocks: [...turn.blocks] } })
  }

  private setStatus(session: Session, status: AgentSessionStatus): void {
    if (session.status === status) return
    session.status = status
    this.emit({ id: session.id, type: 'status', status })
  }

  /* The delta batch. Adjacent deltas for one block index and one delta kind
     are joined; anything that is not a delta flushes the batch first, so a
     block-stop can never be delivered ahead of the deltas it follows. */
  private enqueueDelta(session: Session, event: AgentSessionEvent & { type: 'block-delta' }): void {
    const last = session.batch[session.batch.length - 1]
    if (last && last.type === 'block-delta' && last.index === event.index && last.delta === event.delta) {
      last.text += event.text
    } else {
      session.batch.push(event)
    }
    if (session.batchTimer === null) {
      session.batchTimer = setTimeout(() => {
        session.batchTimer = null
        this.flushBatch(session)
      }, this.coalesceMs)
    }
  }

  private flushBatch(session: Session): void {
    if (session.batchTimer !== null) {
      clearTimeout(session.batchTimer)
      session.batchTimer = null
    }
    if (session.batch.length === 0) return
    const batch = session.batch
    session.batch = []
    for (const event of batch) this.deliver(event)
  }

  private dropBatch(session: Session): void {
    if (session.batchTimer !== null) {
      clearTimeout(session.batchTimer)
      session.batchTimer = null
    }
    session.batch = []
  }

  private clearHandshakeTimer(session: Session): void {
    if (session.handshakeTimer !== null) { clearTimeout(session.handshakeTimer); session.handshakeTimer = null }
  }

  private clearInterruptTimer(session: Session): void {
    if (session.interruptTimer !== null) {
      clearTimeout(session.interruptTimer)
      session.interruptTimer = null
    }
  }

  private emit(event: AgentSessionEvent): void {
    const session = this.sessions.get(event.id)
    if (session) this.flushBatch(session)
    this.deliver(event)
  }

  private deliver(event: AgentSessionEvent): void {
    for (const cb of this.listeners) cb(event)
  }

  /**
   * M82. The canvas's reported spend: the CLI's own cumulative figures, summed.
   * M350: each node's figure CARRIED across its processes. The sum of
   * `costUsd` forgot a node's spend each time its process was replaced, so a
   * canvas budget could be spent more than once.
   */
  private spent(): number {
    let total = 0
    for (const s of this.sessions.values()) total += this.nodeUsd(s) ?? 0
    return total
  }

  /** M350. One node's spend across its processes, or undefined while nothing has been priced. */
  private nodeUsd(session: Session): number | undefined {
    if (session.priorUsd === undefined && session.procUsd === undefined) return undefined
    return (session.priorUsd ?? 0) + (session.procUsd ?? 0)
  }

  private meterOf(session: Session): NodeMeter {
    const spentUsd = this.nodeUsd(session)
    const caps = this.capsOf(session)
    const anyCap = caps.usd > 0 || caps.context > 0 || caps.ownUsd || caps.ownContext
    return {
      ...(spentUsd === undefined ? {} : { spentUsd }),
      ...(session.context === undefined ? {} : { context: session.context }),
      ...(session.window === undefined ? {} : { window: session.window }),
      ...(session.held === undefined ? {} : { held: { ...session.held } }),
      // M351. The caps in force ride the meter, so every surface reads the
      // figure main enforces rather than re-deriving it from Settings and the
      // record, which could disagree with main for a save's width.
      ...(anyCap ? { caps } : {})
    }
  }

  private meterKeyOf(session: Session): string {
    const m = this.meterOf(session)
    return m.spentUsd === undefined && m.context === undefined && m.held === undefined && m.caps === undefined ? '' : JSON.stringify(m)
  }

  /** M350. Says the meter when it CHANGED — a stream of blocks repeating one message's usage says it once. */
  private meterChanged(session: Session): void {
    const key = this.meterKeyOf(session)
    if (key === session.meterKey) return
    session.meterKey = key
    this.emit({ id: session.id, type: 'meter', meter: this.meterOf(session) })
  }

  private capsOf(session: Session): NodeCapsView {
    const c = this.deps.caps?.(session.id)
    return { usd: c?.usd ?? 0, context: c?.context ?? 0, ownUsd: c?.ownUsd === true, ownContext: c?.ownContext === true }
  }

  /**
   * M351. A cap changed somewhere main reads one (a chat's record saved, a
   * Settings value set): every node's meter is said again with the caps now
   * in force, a cap LOWERED under the figure holds its node, and a cap RAISED
   * above it releases the node at once and serves what it held, first, in
   * order. The M350 path did that only at the next send. The agent is never
   * the one who calls this: it runs on a person's save.
   */
  capsChanged(): void {
    for (const session of this.sessions.values()) {
      // A crossing goes through enforceCap, which also stops a turn in flight;
      // holdAtSend is the release half (and holds an idle node, as at a send).
      if (capCrossing(this.meterOf(session), this.capsOf(session)) !== null) this.enforceCap(session)
      else this.holdAtSend(session)
      this.meterChanged(session)
    }
  }

  /**
   * M350. ONE node's cap, enforced here in main, outside the agent loop:
   * whatever the agent decides, a turn that crosses its context cap is
   * stopped (interrupted, or killed on a backend with no interrupt), and every
   * later send is refused until a person raises the cap. Latched like M82's
   * budget: a hold is set once and said once. Nothing the agent does
   * releases it.
   */
  private enforceCap(session: Session): void {
    const hold = capCrossing(this.meterOf(session), this.capsOf(session))
    if (hold === null || session.held !== undefined) return
    session.held = hold
    if (session.inFlight) {
      if (!BACKENDS[session.backend].interrupts) {
        if (session.proc) { session.abortReason = 'cap'; session.proc.kill() }
      } else this.interrupt(session.id)
    }
    if (session.auto !== undefined) this.resolveAuto(session, 'stuck', 'cap')
    this.meterChanged(session)
  }

  /**
   * M350. The hold as a send sees it, re-read against the caps NOW. A cap
   * lowered below the figure holds an idle node; a cap raised above it (or
   * cleared) releases one, and the messages it held are served first, in
   * order, so the new send queues behind them rather than jumping ahead.
   */
  private holdAtSend(session: Session): CapHold | null {
    const hold = capCrossing(this.meterOf(session), this.capsOf(session))
    if (hold !== null) {
      if (session.held === undefined) { session.held = hold; this.meterChanged(session) }
      return hold
    }
    if (session.held === undefined) return null
    session.held = undefined
    this.meterChanged(session)
    const idle = !session.inFlight && !(BACKENDS[session.backend].oneProcessPerTurn && session.proc !== undefined)
    const next = idle ? this.takeNext(session) : undefined
    if (next !== undefined) {
      this.startTurn(session, next.text, next.images)
      this.emit({ id: session.id, type: 'dequeued', text: next.text })
    }
    return null
  }

  /**
   * One crossing, one stop. `budgetStopped` latches so a second result
   * does not interrupt again (and does not say it again); it is cleared when
   * the ceiling is raised above the spend, which is what "until raised"
   * means. USD and window percent share this path — same interrupt, same latch.
   */
  private enforceBudget(): void {
    const limits = this.deps.limits?.() ?? { maxConcurrent: 0, budgetUsd: 0, budgetWindowPercent: 0 }
    const crossing = budgetCrossing({
      budgetUsd: limits.budgetUsd,
      budgetWindowPercent: limits.budgetWindowPercent ?? 0,
      spentUsd: this.spent(),
      windowUtil: windowUtilization(this.rateLimitState)
    })
    if (crossing === null) { this.budgetStopped = false; return }
    if (this.budgetStopped) return
    this.budgetStopped = true
    let interrupted = 0
    for (const s of this.sessions.values()) {
      if (!s.inFlight) continue
      // A backend with no interrupt door: a budget is a stop, and the
      // only stop is the kill — named as such on the aborted turn.
      if (!BACKENDS[s.backend].interrupts) {
        if (s.proc) { s.abortReason = 'budget'; s.proc.kill(); interrupted += 1 }
        continue
      }
      if (this.interrupt(s.id)) interrupted += 1
    }
    for (const s of this.sessions.values()) {
      this.emit({ id: s.id, type: 'budget', spent: crossing.spent, limit: crossing.limit, interrupted, unit: crossing.unit })
      break
    }
  }

  private snapshot(session: Session): AgentSessionSnapshot {
    return {
      id: session.id,
      backend: session.backend,
      cwd: session.cwd,
      status: session.status,
      sessionId: session.sessionId,
      model: session.model,
      pid: session.proc?.pid,
      exitCode: session.exitCode,
      exitSignal: session.exitSignal,
      ...(session.resumeLost === undefined ? {} : { resumeLost: session.resumeLost }),
      turns: session.turnCount,
      usage: { ...session.usage },
      costUsd: session.costUsd,
      pending: [...session.pending.values()],
      queued: session.queue.length,
      queue: this.queueView(session),
      counters: { ...session.counters },
      ...(session.negotiated === undefined ? {} : { negotiated: { ...session.negotiated } }),
      ...(session.awaitingHandshake ? { awaitingHandshake: true as const } : {}),
      ...(this.meterKeyOf(session) === '' ? {} : { meter: this.meterOf(session) }),
      ...(session.auto !== undefined ? { auto: { mode: session.auto.mode, turn: session.auto.turn, limit: session.auto.limit, state: 'running' as const } } : session.autoLast !== undefined ? { auto: session.autoLast } : {})
    }
  }
}
