import { existsSync } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import { resolve } from 'node:path'
import type { WebContents } from 'electron'
import type * as pty from 'node-pty'
import { IPC_EVENTS } from '../shared/ipc-contract'
import type { PanelId, PanelSpec, PtyCreateResult } from '../shared/types'
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
}

export class PtyManager {
  private sessions = new Map<PanelId, Session>()

  constructor(
    private readonly getTarget: () => WebContents | null,
    /**
     * A getter, not a captured reference, for the same reason getTarget is one:
     * the backend is chosen by an async startup probe that has not finished
     * when this manager is constructed at module scope.
     */
    private readonly getBackend: () => SessionBackend
  ) {}

  async create(spec: PanelSpec): Promise<PtyCreateResult> {
    if (this.sessions.has(spec.panelId)) {
      throw new Error(`panel ${spec.panelId} already has a live PTY`)
    }

    const loginEnv = await resolveShellEnv()
    const env = buildPtyEnv(loginEnv, spec.env)

    const cwd = resolveCwd(spec.cwd)
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
      reattached
    }
    this.sessions.set(spec.panelId, session)

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
    this.sessions.delete(panelId)
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
  }

  private enqueue(session: Session, data: string): void {
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
