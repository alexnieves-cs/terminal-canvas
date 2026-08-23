import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import type { WebContents } from 'electron'
import * as pty from 'node-pty'
import { IPC_EVENTS } from '../shared/ipc-contract'
import type { PanelId, PanelSpec, PtyCreateResult } from '../shared/types'
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
function resolveCwd(raw: string): string {
  const expanded = raw === '~' || raw.startsWith('~/') ? resolve(homedir(), raw.slice(2)) : raw
  if (existsSync(expanded)) return expanded
  console.warn(`[pty] cwd ${expanded} does not exist, falling back to home`)
  return homedir()
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
}

export class PtyManager {
  private sessions = new Map<PanelId, Session>()

  constructor(private readonly getTarget: () => WebContents | null) {}

  async create(spec: PanelSpec): Promise<PtyCreateResult> {
    if (this.sessions.has(spec.panelId)) {
      throw new Error(`panel ${spec.panelId} already has a live PTY`)
    }

    const loginEnv = await resolveShellEnv()
    const env = buildPtyEnv(loginEnv, spec.env)

    const cwd = resolveCwd(spec.cwd)

    const proc = pty.spawn(spec.command, spec.args, {
      name: 'xterm-256color',
      // Spawn at the size the renderer already fitted to. Spawning at the
      // 80x24 default and resizing afterwards makes agent TUIs draw their
      // frame twice and sometimes leave artifacts.
      cols: spec.cols,
      rows: spec.rows,
      cwd,
      env
    })

    const session: Session = {
      panelId: spec.panelId,
      proc,
      buffer: [],
      flushTimer: null,
      killed: false,
      command: spec.command,
      cwd
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
      this.send(IPC_EVENTS.PTY_EXIT, { panelId: spec.panelId, exitCode, signal })
    })

    console.log(
      `[pty] spawned ${spec.command} pid=${proc.pid} panel=${spec.panelId} ` +
        `${spec.cols}x${spec.rows} cwd=${cwd}`
    )

    return { panelId: spec.panelId, pid: proc.pid, command: spec.command, cwd }
  }

  /**
   * Every live session. The renderer uses this to reconcile after a reload
   * rather than blindly creating a panel that may already exist.
   */
  list(): PtyCreateResult[] {
    return [...this.sessions.values()].map((s) => ({
      panelId: s.panelId,
      pid: s.proc.pid,
      command: s.command,
      cwd: s.cwd
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
    if (!session) return
    session.killed = true
    if (session.flushTimer) clearTimeout(session.flushTimer)
    try {
      session.proc.kill()
    } catch (error) {
      console.warn(`[pty] kill failed for ${panelId}`, error)
    }
    this.sessions.delete(panelId)
  }

  /** Called on before-quit so no PTY outlives the app. */
  killAll(): void {
    for (const panelId of [...this.sessions.keys()]) this.kill(panelId)
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
