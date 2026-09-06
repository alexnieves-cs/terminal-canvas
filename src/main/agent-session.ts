import { addTotals, emptyTotals, type AgentOptions, type TokenTotals } from '@shared/cost'
import { BACKENDS, backendOf, type BackendDef } from '@shared/agent-backends'
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
import type {
  AgentBackend,
  AgentSessionStatus,
  AgentSessionSpec,
  PendingPermission,
  AgentSessionCounters,
  AgentSessionSnapshot,
  AgentSessionEvent,
  SendResult
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
   * M82. The canvas's ceilings, read LIVE on every send and every result.
   * `0` means no ceiling — which is every caller that does not pass this.
   */
  limits?: () => { maxConcurrent: number; budgetUsd: number }
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
  carry: string
  turns: TranscriptTurn[]
  inFlight: boolean
  interrupting: boolean
  interruptTimer: ReturnType<typeof setTimeout> | null
  abortReason: 'interrupt-timeout' | 'budget' | null
  /** `auto` marks a continuation the run pushed: dropped with the run, never served after it. */
  queue: { text: string; images: OutgoingImage[]; auto?: true }[]
  pending: Map<string, PendingPermission>
  /** M102. Resolvers for the questions that are ours (the broker's), by request id. */
  external: Map<string, (allow: boolean) => void>
  usage: TokenTotals
  costUsd?: number
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
  /** M82. Latched at a crossing so one crossing is one stop; cleared when the ceiling is raised. */
  private budgetStopped = false

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
      carry: '',
      turns: [],
      inFlight: false,
      interrupting: false,
      interruptTimer: null,
      abortReason: null,
      queue: [],
      pending: new Map(),
      external: new Map(),
      usage: emptyTotals(),
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
    this.sessions.set(spec.id, session)
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
    // M90. A prompt that is an argument has no block to carry an image.
    // Refused whole and stored nowhere, like the budget's refusal.
    if (!BACKENDS[session.backend].images && images.length > 0) return 'refused-images'
    // M97. A send by hand after a resolved run supersedes its chip: the next
    // snapshot no longer carries it (the renderer's dismiss is local; this is
    // main's half, so a workspace switch does not resurrect a dismissed chip).
    if (session.auto === undefined && session.autoLast !== undefined) session.autoLast = undefined
    const limits = this.deps.limits?.() ?? { maxConcurrent: 0, budgetUsd: 0 }
    if (limits.budgetUsd > 0 && this.spent() >= limits.budgetUsd) {
      // Nothing stored: a refused message is not a turn, and a transcript that
      // held it would show the user a message the agent never received.
      return 'refused-budget'
    }
    const busy = [...this.sessions.values()].filter((s) => s.inFlight).length
    if (limits.maxConcurrent > 0 && !session.inFlight && busy >= limits.maxConcurrent) {
      this.storeTurn(session, {
        id: `u-${++session.userTurns}`,
        role: 'user',
        blocks: [{ type: 'text', text }, ...images.map((img) => ({ type: 'image' as const, mediaType: img.mediaType, size: Buffer.byteLength(img.base64, 'base64') }))],
        at: this.now()
      })
      session.queue.push({ text, images: images.map((img) => ({ mediaType: img.mediaType, base64: img.base64 })), ...(session.auto?.sending ? { auto: true as const } : {}) })
      this.emit({ id, type: 'queued', text, reason: 'concurrency' })
      return 'queued'
    }
    // On the transcript the moment it is sent, before the CLI has echoed
    // anything — the echo (`isReplay`) is deliberately NOT stored, or every
    // message would appear twice.
    this.storeTurn(session, {
      id: `u-${++session.userTurns}`,
      role: 'user',
      blocks: [
        { type: 'text', text },
        ...images.map((img) => ({ type: 'image' as const, mediaType: img.mediaType, size: Buffer.byteLength(img.base64, 'base64') }))
      ],
      at: this.now()
    })
    // M90. A codex process lingers between its result and its exit; a send in
    // that window cannot spawn (the thread is still held) and must not be
    // dropped as sent — it queues, and handleExit serves it.
    if (session.inFlight || (BACKENDS[session.backend].oneProcessPerTurn && session.proc !== undefined)) {
      session.queue.push({ text, images: images.map((img) => ({ mediaType: img.mediaType, base64: img.base64 })), ...(session.auto?.sending ? { auto: true as const } : {}) })
      this.emit({ id, type: 'queued', text, reason: 'in-flight' })
      return 'queued'
    }
    this.startTurn(session, text, images)
    return 'sent'
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
    const requestId = `tc-int-${++this.requestSeq}`
    session.proc.write(interruptLine(requestId))
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
      session.proc.write(permissionResponseLine(requestId, pending.input, answer))
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
    if (sent === 'refused-budget' || sent === 'refused-backend' || sent === 'no-session') {
      this.resolveAuto(session, 'stuck', sent === 'refused-budget' ? 'budget' : 'error')
      return { kind: 'refused', reason: sent === 'refused-budget' ? 'the budget refused the opening send' : 'the send was refused' }
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
    const dropped = session.queue.length - kept.length
    session.queue = kept
    if (dropped > 0) this.emit({ id: session.id, type: 'queue-dropped', count: dropped })
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
      ...(session.appendSystemPrompt === undefined ? {} : { appendSystemPrompt: session.appendSystemPrompt })
    })
    // `closeStdin` is written only when true: the fake runner records the
    // spawn as handed, and M71's checks compare the claude spawn by shape.
    const proc = this.deps.runner({ command: binary, args, cwd: session.cwd, env: this.deps.envFor?.(session.id) ?? this.deps.env, ...(row.closeStdin ? { closeStdin: true } : {}) })
    session.proc = proc
    session.carry = ''
    session.exitCode = undefined
    session.exitSignal = undefined
    session.abortReason = null
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
    session.proc.write(userMessageLine(text, images))
    session.inFlight = true
    session.interrupting = false
    if (session.status === 'ready') this.setStatus(session, 'streaming')
  }

  private handle(session: Session, event: TranscriptEvent): void {
    const id = session.id
    switch (event.type) {
      case 'session':
        session.model = event.model ?? session.model
        // M90. codex mints the thread id; the first stream is where the
        // session learns what `exec resume` must name. claude's id is ours
        // (pinned with --session-id), and the event only ever repeats it.
        if (BACKENDS[session.backend].adoptsThreadId) { session.sessionId = event.sessionId; session.everSpawned = true }
        // M118. A per-turn row whose id is the HOST's (copilot): the first
        // stream is still where the session learns the CLI now holds it, so
        // the next process must name `--resume=` rather than pin again — a
        // second pin of the same id is a fresh conversation with no memory.
        else if (BACKENDS[session.backend].oneProcessPerTurn) session.everSpawned = true
        if (session.status === 'starting') this.setStatus(session, session.inFlight ? 'streaming' : 'ready')
        this.emit({ id, ...event })
        return
      case 'ignored':
        session.counters.ignored += 1
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
          id: `u-${++session.userTurns}`,
          role: 'user',
          blocks: event.blocks,
          at: this.now()
        })
        return
      case 'result': {
        const interrupted = session.interrupting
        session.inFlight = false
        session.interrupting = false
        this.clearInterruptTimer(session)
        session.turnCount += 1
        if (event.usage) session.usage = addTotals(session.usage, event.usage)
        if (event.costUsd !== undefined) session.costUsd = event.costUsd
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
        const next = session.queue.shift()
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
          session.proc.write(permissionResponseLine(event.requestId, event.input, { allow: true }))
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
      const next = session.queue.shift()
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
      session.queue.length = 0
      this.emit({ id, type: 'queue-dropped', count })
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
      stderr: info.stderr
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

  /** M82. The canvas's reported spend: the CLI's own cumulative figures, summed. */
  private spent(): number {
    let total = 0
    for (const s of this.sessions.values()) total += s.costUsd ?? 0
    return total
  }

  /**
   * M82. One crossing, one stop. `budgetStopped` latches so a second result
   * does not interrupt again (and does not say it again); it is cleared when
   * the ceiling is raised above the spend, which is what "until raised"
   * means.
   */
  private enforceBudget(): void {
    const limit = this.deps.limits?.().budgetUsd ?? 0
    const spent = this.spent()
    if (limit <= 0 || spent < limit) { this.budgetStopped = false; return }
    if (this.budgetStopped) return
    this.budgetStopped = true
    let interrupted = 0
    for (const s of this.sessions.values()) {
      if (!s.inFlight) continue
      // M90. A backend with no interrupt door: a budget is a stop, and the
      // only stop is the kill — named as such on the aborted turn.
      if (!BACKENDS[s.backend].interrupts) {
        if (s.proc) { s.abortReason = 'budget'; s.proc.kill(); interrupted += 1 }
        continue
      }
      if (this.interrupt(s.id)) interrupted += 1
    }
    for (const s of this.sessions.values()) { this.emit({ id: s.id, type: 'budget', spent, limit, interrupted }); break }
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
      turns: session.turnCount,
      usage: { ...session.usage },
      costUsd: session.costUsd,
      pending: [...session.pending.values()],
      queued: session.queue.length,
      counters: { ...session.counters },
      ...(session.auto !== undefined ? { auto: { mode: session.auto.mode, turn: session.auto.turn, limit: session.auto.limit, state: 'running' as const } } : session.autoLast !== undefined ? { auto: session.autoLast } : {})
    }
  }
}
