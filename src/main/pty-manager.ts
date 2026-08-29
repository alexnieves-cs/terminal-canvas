import { existsSync } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import { resolve } from 'node:path'
import type { WebContents } from 'electron'
import type * as pty from 'node-pty'
import { IPC_EVENTS } from '../shared/ipc-contract'
import type { AgentState, PanelId, PanelSpec, PtyCreateResult } from '../shared/types'
import { initialDetector, nextState, scanForBell, type AgentEvent, type Detector } from './agent-state'
import type { SessionBackend } from './session-backend'
import { buildPtyEnv, resolveShellEnv } from './shell-env'

/**
 * Owns every PTY in the app. The renderer never spawns a process; it only ever
 * asks this module to, keyed by panelId.
 *
 * Output is batched on a ~16ms flush (one animation frame). An unbatched stream
 * sends one IPC message per PTY read, and a TUI like `claude` repainting its
 * frame, or a `find /` dump, will emit thousands per second. That floods the
 * renderer's event loop and the UI locks up.
 */

const FLUSH_INTERVAL_MS = 16

/**
 * The idleness tick. A SEPARATE timer from the flush, and one per manager
 * rather than per session, because the flush timer only runs when there IS
 * pending data — it structurally cannot observe the absence of data, which is
 * the entire signal idleness is made of.
 *
 * 500ms is the resolution of "idle", not its threshold: the threshold is the
 * agent.idleAfterMs setting, and this only bounds how late the transition can
 * be reported. One timer for the whole app at 2Hz costs nothing.
 */
const IDLE_TICK_MS = 500

/**
 * How often the live cwd/command poll runs. Deliberately a SEPARATE timer from
 * IDLE_TICK_MS rather than a counter inside it: they differ by 4x, and a later
 * edit that merged them would silently make idleness detection four times
 * coarser, which is M6c's whole threshold.
 *
 * 2s is chosen against human patience, not against cost. One `list-panes`
 * answers EVERY session at once — the list is global — so this costs one
 * subprocess per tick whether the canvas holds two panels or forty.
 */
const LIVE_TICK_MS = 2000

/**
 * node-pty passes cwd straight to the OS, so it never expands `~` and it throws
 * if the directory is gone. Both are easy to hit once panels are persisted with
 * a cwd that has since been deleted (M4), so handle them at the boundary.
 */
export function resolveCwd(raw: string): string {
  const expanded = raw === '~' || raw.startsWith('~/') ? resolve(homedir(), raw.slice(2)) : raw
  if (existsSync(expanded)) return expanded
  console.warn(`[pty] cwd ${expanded} does not exist, falling back to home`)
  return homedir()
}

/**
 * A panel with no explicit command runs the user's login shell. Only main can
 * know what that is: the renderer's `process.env` is compiled away to `{}`, so
 * a shell lookup there resolves to `undefined` and every panel silently gets
 * the hardcoded fallback instead. Prefer the SHELL reported by the login-shell
 * probe, then this process's own view of it, mirroring shell-env.ts's own
 * fallback chain so the two cannot disagree about what "the login shell" is.
 */
function resolveCommand(spec: PanelSpec, loginEnv: Record<string, string>): string {
  if (spec.command) return spec.command
  return loginEnv.SHELL || process.env.SHELL || userInfo().shell || '/bin/zsh'
}

interface Session {
  panelId: PanelId
  proc: pty.IPty
  /** Pending output chunks awaiting the next flush. */
  buffer: string[]
  flushTimer: NodeJS.Timeout | null
  /** Set by kill(), so the resulting exit is not reported as news. */
  killed: boolean
  command: string
  cwd: string
  reattached: boolean
  /**
   * The agent-state detector's whole memory for this panel, including the BEL
   * scanner's position. It lives on the SESSION rather than in a parallel map
   * so it cannot outlive the process it describes: every path that removes a
   * session removes the detector with it, which is why a dormant panel — one
   * with no entry here at all — cannot produce a state.
   */
  detector: Detector
}

export class PtyManager {
  private sessions = new Map<PanelId, Session>()
  /** One per manager, not per session. See IDLE_TICK_MS. */
  private idleTimer: NodeJS.Timeout | null = null
  /**
   * Which panel ids this manager has already fired captureBaseline for.
   * Deliberately survives detachAll() — a Cmd+R reload must not recapture —
   * and is cleared only by kill(), alongside dropBaseline, so a panel that
   * genuinely closed and later reuses its id starts fresh. See create()'s
   * own comment for why this is a SECOND guard, not the only one.
   */
  private capturedBaselineIds = new Set<PanelId>()
  /** One per manager, like idleTimer. See LIVE_TICK_MS. */
  private liveTimer: NodeJS.Timeout | null = null
  /**
   * The last live values SENT, per panel, joined into one comparable string.
   * This is the dedupe, and it is the design rather than an optimisation — see
   * IPC_EVENTS.SESSION_LIVE. Cleared alongside the session so a recycled panel
   * id cannot inherit a dead panel's values and thereby suppress its own first
   * real send.
   */
  private lastLive = new Map<PanelId, string>()

  constructor(
    private readonly getTarget: () => WebContents | null,
    /**
     * A getter, not a captured reference, for the same reason getTarget is one:
     * the backend is chosen by an async startup probe that has not finished
     * when this manager is constructed at module scope.
     */
    private readonly getBackend: () => SessionBackend,
    /**
     * Getters for the same reason getTarget and getBackend are: this manager
     * is constructed at module scope, before the layout store has resolved
     * anything — and a captured value would also freeze the setting at its
     * boot value, so a change made in the palette would reach nothing until a
     * relaunch.
     *
     * The defaults mirror the schema's, and exist so the other construction
     * sites (the verify harnesses) keep compiling unchanged.
     */
    private readonly getIdleAfterMs: () => number = () => 1500,
    private readonly getBellEnabled: () => boolean = () => true,
    /**
     * Review-baseline hooks. Optional and defaulted for the same reason
     * getIdleAfterMs is: the verify harnesses construct this manager directly
     * and must keep compiling. In production they reach the layout store.
     */
    private readonly captureBaseline: (panelId: PanelId, cwd: string) => void = () => {},
    private readonly dropBaseline: (panelId: PanelId) => void = () => {}
  ) {}

  async create(spec: PanelSpec): Promise<PtyCreateResult> {
    if (this.sessions.has(spec.panelId)) {
      throw new Error(`panel ${spec.panelId} already has a live PTY`)
    }

    const loginEnv = await resolveShellEnv()
    const env = buildPtyEnv(loginEnv, spec.env)

    const cwd = resolveCwd(spec.cwd)

    // Fire-and-forget: the baseline must never delay or fail a spawn. It is
    // taken BEFORE the process starts so the snapshot precedes the agent's
    // first byte. Gated on capturedBaselineIds rather than called
    // unconditionally: this function runs again for every panel on a Cmd+R
    // reload — main's PtyManager is a module-scope singleton that survives a
    // renderer reload untouched — and under tmux that second call REATTACHES
    // to a session that may have been working for an hour, so calling this
    // again there would reset the baseline to "now" and the pane would
    // report "no changes" for an agent that rewrote the repository. This
    // in-memory guard is deliberately NOT the only one: it resets on an app
    // relaunch (a fresh PtyManager, a fresh empty Set), which is exactly why
    // the store keeps its own persistent record — see captureBaseline's own
    // second existence check in index.ts.
    if (!this.capturedBaselineIds.has(spec.panelId)) {
      this.capturedBaselineIds.add(spec.panelId)
      this.captureBaseline(spec.panelId, cwd)
    }

    const command = resolveCommand(spec, loginEnv)

    // BEFORE the spawn, not after. `new-session -A` creates the session if it
    // is missing, so a probe taken afterwards answers true unconditionally and
    // every panel — including one on a cold start — claims to have reattached.
    const reattached = this.getBackend().hasSession(spec.panelId)

    const proc = this.getBackend().spawn(spec, command, cwd, env)

    const session: Session = {
      panelId: spec.panelId,
      proc,
      buffer: [],
      flushTimer: null,
      killed: false,
      command,
      cwd,
      reattached,
      detector: initialDetector(Date.now())
    }
    this.sessions.set(spec.panelId, session)
    // Only ever ticks while something is in the map; see startIdleTick.
    this.startIdleTick()
    this.startLiveTick()

    // The one DIRECT send in this class, and applyEvent structurally cannot
    // do it: applyEvent sends only on a CHANGE, and the detector is born in
    // 'starting', so nothing ever *enters* it and the state would never reach
    // the wire at all. Without this send a panel that has spawned but not yet
    // produced a byte carries no state — which is exactly the window that
    // matters, because a real `claude` takes seconds to boot and that silence
    // is the moment the user most needs to see something is happening. It is
    // sent after the map entry exists so the ordering matches every other
    // send: a state is only ever announced for a session main is holding.
    this.send(IPC_EVENTS.AGENT_STATE, {
      panelId: spec.panelId,
      state: session.detector.state satisfies AgentState
    })

    proc.onData((data) => this.enqueue(session, data))
    proc.onExit(({ exitCode, signal }) => {
      // Flush whatever is pending BEFORE announcing exit, otherwise the last
      // lines of output (often the error that explains the exit) are dropped.
      this.flush(session)
      // The OS process exits some milliseconds after kill() returned, by which
      // time this panelId may already have been recreated. Evicting by key
      // alone would unhook that new session and orphan its PTY, so only remove
      // the entry if it is still this exact session.
      if (this.sessions.get(spec.panelId) === session) this.sessions.delete(spec.panelId)
      // AFTER the flush above and before the exit is announced. Order matters
      // in one direction only: 'exited' is terminal in the state machine
      // precisely so the last bytes a dying process emits — which the flush
      // has just delivered — cannot revive the panel to 'busy'.
      //
      // The SEND obeys the same guard PTY_EXIT does, for the same reason and
      // with a sharper failure: an exit we asked for arrives milliseconds
      // after kill() returned, by which time the renderer has already run
      // clearAgentState(id) at its dispose site. An unguarded 'exited' lands
      // AFTER that cleanup and re-adds the entry — so the map grows for the
      // life of the renderer and a recycled id inherits a dead panel's
      // border, which is precisely the failure clearAgentState's own comment
      // claims to prevent. The recycled id is not hypothetical: onReset
      // disposes every panel and immediately installs firstRunPanels(), whose
      // id is the constant FIRST_RUN_ID, so resetting a canvas whose 'p1' was
      // running painted the brand-new 'p1' red until its first byte arrived —
      // and never healed at all if that panel was never promoted.
      //
      // The TRANSITION is not guarded, only the send. The detector still has
      // to reach its terminal state: this closure keeps `session` alive after
      // the map entry is gone, so a straggler read on a killed session would
      // otherwise be applied to a detector still sitting in 'busy' and send a
      // state for a panel nobody can see. 'exited' is terminal, so once it is
      // recorded no later event can produce a send at all.
      this.applyEvent(session, { kind: 'exit' }, session.killed)
      if (this.sessions.size === 0) { this.stopIdleTick(); this.stopLiveTick() }
      // An exit we asked for is not news the panel needs to paint.
      if (session.killed) return
      // The tmux CLIENT's exit code carries no information — an inner command
      // exiting 0 and one exiting 42 both produce client exit 1 — so a naive
      // port would make this message present, plausible and wrong. The tmux
      // backend recovers the real code from the pane-died hook's file; the
      // direct backend returns null and node-pty's own code stands.
      const real = this.getBackend().exitCodeFor(spec.panelId)
      this.send(IPC_EVENTS.PTY_EXIT, { panelId: spec.panelId, exitCode: real ?? exitCode, signal })
    })

    console.log(
      `[pty] spawned ${command} pid=${proc.pid} panel=${spec.panelId} ` +
        `${spec.cols}x${spec.rows} cwd=${cwd}`
    )

    return { panelId: spec.panelId, pid: proc.pid, command, cwd, reattached }
  }

  /**
   * Every live session. The renderer uses this to reconcile after a reload
   * rather than blindly creating a panel that may already exist.
   *
   * The backend answers first: after a reload this map is EMPTY (navigation
   * killed the clients) while the tmux sessions live on, so the map alone
   * would report nothing and every panel would restore dormant. A backend with
   * no independent view returns null and the map is the answer, as before.
   */
  list(): PtyCreateResult[] {
    const fromBackend = this.getBackend().list()
    if (fromBackend) return fromBackend
    return [...this.sessions.values()].map((s) => ({
      panelId: s.panelId,
      pid: s.proc.pid,
      command: s.command,
      cwd: s.cwd,
      reattached: s.reattached
    }))
  }

  /** Returns false when no live session owns this panelId. */
  write(panelId: PanelId, data: string): boolean {
    const session = this.sessions.get(panelId)
    if (!session) return false
    session.proc.write(data)
    // Typing into a panel is reading it. Main already holds this fact, which
    // is why only the FOCUS half of acknowledgement needed a new channel.
    this.applyEvent(session, { kind: 'acknowledge' })
    return true
  }

  resize(panelId: PanelId, cols: number, rows: number): void {
    const session = this.sessions.get(panelId)
    if (!session) return
    // node-pty throws on non-positive dimensions, which a hidden or
    // zero-height container will produce.
    if (cols < 1 || rows < 1) return
    try {
      session.proc.resize(cols, rows)
    } catch (error) {
      console.warn(`[pty] resize failed for ${panelId}`, error)
    }
  }

  kill(panelId: PanelId): void {
    const session = this.sessions.get(panelId)
    // No LOCAL session is not the same as no session. Under tmux a panel can
    // be reattachable — its session survived a reload — while this manager has
    // never spawned a client for it, because the panel was off-screen or held
    // back by LIVE_BUDGET and never went live. Returning here would leave that
    // session running an agent with nothing left able to reach, close, or type
    // into it for the rest of the run. destroy() is keyed by panel id and is a
    // no-op on the direct backend, so this costs nothing when there is
    // genuinely nothing there.
    if (!session) {
      this.getBackend().destroy(panelId)
      this.dropBaseline(panelId)
      this.capturedBaselineIds.delete(panelId)
      this.lastLive.delete(panelId)
      return
    }
    session.killed = true
    if (session.flushTimer) clearTimeout(session.flushTimer)
    try {
      session.proc.kill()
    } catch (error) {
      console.warn(`[pty] kill failed for ${panelId}`, error)
    }
    // Closing a panel must end the SESSION, not merely detach a client.
    // Without this the tmux session survives with no panel able to reach it.
    this.getBackend().destroy(panelId)
    this.dropBaseline(panelId)
    this.capturedBaselineIds.delete(panelId)
    this.lastLive.delete(panelId)
    this.sessions.delete(panelId)
    if (this.sessions.size === 0) { this.stopIdleTick(); this.stopLiveTick() }
  }

  /** Called on before-quit so no PTY outlives the app. */
  killAll(): void {
    for (const panelId of [...this.sessions.keys()]) this.kill(panelId)
  }

  /**
   * The renderer is gone but its processes must not be. Kills the local handle
   * — which, on the tmux backend, is a CLIENT — and forgets the session
   * WITHOUT calling backend.destroy(). That omission is the entire milestone:
   * kill() ends the session, detachAll() lets it keep running.
   */
  detachAll(): void {
    for (const session of [...this.sessions.values()]) {
      session.killed = true
      if (session.flushTimer) clearTimeout(session.flushTimer)
      try {
        session.proc.kill()
      } catch (error) {
        console.warn(`[pty] detach failed for ${session.panelId}`, error)
      }
      this.sessions.delete(session.panelId)
    }
    if (this.sessions.size === 0) { this.stopIdleTick(); this.stopLiveTick() }
  }

  /**
   * The renderer's half of clearing wants-you: it knows about focus, which
   * main cannot see. See IPC.AGENT_ACKNOWLEDGE.
   *
   * An id with no live session is silently ignored rather than treated as an
   * error: the renderer focuses dormant and carded panels freely, and those
   * have no entry here by design.
   */
  acknowledge(panelId: PanelId): void {
    const session = this.sessions.get(panelId)
    if (!session) return
    this.applyEvent(session, { kind: 'acknowledge' })
  }

  private startIdleTick(): void {
    if (this.idleTimer) return
    this.idleTimer = setInterval(() => {
      for (const session of this.sessions.values()) {
        this.applyEvent(session, { kind: 'tick' })
      }
    }, IDLE_TICK_MS)
    // Do not hold the process open for a 2Hz timer nothing is waiting on —
    // the verify harnesses run under plain node, where a live interval would
    // keep the suite from ever exiting.
    this.idleTimer.unref?.()
  }

  private stopIdleTick(): void {
    if (!this.idleTimer) return
    clearInterval(this.idleTimer)
    this.idleTimer = null
  }

  private startLiveTick(): void {
    if (this.liveTimer) return
    this.liveTimer = setInterval(() => this.pollLive(), LIVE_TICK_MS)
    // Same reason idleTimer is unref'd: do not hold a plain-node verify process
    // open for a 0.5Hz timer nothing is waiting on.
    this.liveTimer.unref?.()
  }

  private stopLiveTick(): void {
    if (!this.liveTimer) return
    clearInterval(this.liveTimer)
    this.liveTimer = null
  }

  /**
   * One poll for every panel. backend.list() is null on the direct backend by
   * contract — not "nothing is running", but "ask the manager", and the manager
   * holds only spawn-time values — so there is no live answer there and none is
   * invented.
   */
  private pollLive(): void {
    const entries = this.getBackend().list()
    if (!entries) return
    for (const entry of entries) {
      // Only panels this manager is actually holding. An entry for a session
      // this renderer has no local session for belongs to a panel nothing is
      // subscribed to, and sending for it would grow lastLive with ids the map
      // will never clear.
      if (!this.sessions.has(entry.panelId)) continue
      // NUL, not a space: a path may contain a space, so ('/a b', 'sh')
      // and ('/a', 'b sh') would collide into one key under a space
      // delimiter — a panel whose update is silently suppressed, for the
      // users whose directories happen to contain the delimiter and nobody
      // else. NUL is the one byte a POSIX path cannot contain, the same
      // collision railSignature avoids with JSON.stringify.
      const key = `${entry.cwd} ${entry.currentCommand}`
      if (this.lastLive.get(entry.panelId) === key) continue
      this.lastLive.set(entry.panelId, key)
      this.send(IPC_EVENTS.SESSION_LIVE, {
        panelId: entry.panelId,
        cwd: entry.cwd,
        currentCommand: entry.currentCommand
      })
    }
  }

  /**
   * Runs one event through the state machine and sends ONLY on an actual
   * change. That dedupe IS the throttle the design asks for: a panel printing
   * a megabyte produces one 'busy' message rather than one per 16ms flush, so
   * this channel cannot become the 60Hz cascade the renderer's memo exists to
   * block.
   *
   * `mute` advances the machine WITHOUT telling anyone. Every caller passes
   * `session.killed`, and the split is the point: suppressing the TRANSITION
   * too would leave a detector stranded mid-state on an object this class's
   * own onExit/onData closures still hold, and those closures keep running
   * after the map entry — and the renderer's cached state — are both gone.
   */
  private applyEvent(session: Session, event: AgentEvent, mute = false): void {
    const before = session.detector.state
    session.detector = nextState(session.detector, event, Date.now(), this.getIdleAfterMs())
    if (session.detector.state === before) return
    if (mute) return
    this.send(IPC_EVENTS.AGENT_STATE, {
      panelId: session.panelId,
      state: session.detector.state satisfies AgentState
    })
  }

  private enqueue(session: Session, data: string): void {
    // The choke point. Every byte from every PTY in this app passes through
    // here, so the detector sits at the one place both of its signals exist —
    // and a dormant panel, which has no entry in the session map at all,
    // cannot produce a state. The bug where a restored canvas draws
    // indicators for twelve processes that do not exist is unreachable rather
    // than defended against.
    //
    // Scanning happens BEFORE the buffering, so a bell is seen on the read
    // that carried it rather than up to 16ms later when the flush runs.
    const scanned = scanForBell(session.detector.scan, data)
    // The scanner's position must be written back, or an OSC body straddling
    // a flush boundary is re-entered as ordinary text on the next chunk and a
    // window title ending in BEL rings a bell — intermittently, under load.
    session.detector = { ...session.detector, scan: scanned.state }
    // Output BEFORE bell, for this chunk. A panel's very first bytes may
    // contain a bell; bell-then-output would leave the machine in 'busy',
    // because the output event would overwrite the bell's state. This order
    // gives starting -> busy -> wants-you.
    //
    // Both are MUTED for a killed session, the same guard the exit send
    // obeys. This path is reached from the captured proc.onData closure, not
    // from a map lookup, so it still runs in the window between kill() —
    // which deleted the map entry and ran the renderer's clearAgentState —
    // and onExit, which is what finally records 'exited'. A read already
    // buffered in the pty landing in that window would otherwise apply an
    // unmuted 'output' to a detector still at 'starting' or 'idle', i.e. a
    // real change, i.e. a 'busy' sent for a panel the renderer has dropped:
    // the same recycled-id defect the exit guard exists to close, entered
    // through the other door. Reachable in one gesture — Cmd+N, close the
    // panel before its first byte, and the shell's prompt bytes land after
    // kill().
    //
    // Muting rather than returning early is not a style choice. enqueue also
    // BUFFERS, and onExit deliberately flushes pending output BEFORE
    // announcing the exit so the last lines — usually the error explaining
    // the exit — are not dropped. An early return here would silently delete
    // that, which is a load-bearing property this file documents above.
    this.applyEvent(session, { kind: 'output' }, session.killed)
    // Bells are counted, not merely detected, but the machine treats any
    // positive count as one event: two bells in one chunk are one request for
    // attention.
    if (scanned.bells > 0 && this.getBellEnabled()) {
      this.applyEvent(session, { kind: 'bell' }, session.killed)
    }

    session.buffer.push(data)
    if (session.flushTimer) return
    session.flushTimer = setTimeout(() => this.flush(session), FLUSH_INTERVAL_MS)
  }

  private flush(session: Session): void {
    if (session.flushTimer) {
      clearTimeout(session.flushTimer)
      session.flushTimer = null
    }
    if (session.buffer.length === 0) return
    const data = session.buffer.join('')
    session.buffer.length = 0
    this.send(IPC_EVENTS.PTY_DATA, { panelId: session.panelId, data })
  }

  private send(channel: string, payload: unknown): void {
    const target = this.getTarget()
    if (!target || target.isDestroyed()) return
    target.send(channel, payload)
  }
}
