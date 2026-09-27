import type { BrowserWindow } from 'electron'
import { randomBytes } from 'node:crypto'
import { createDirectBackend, type SessionBackend } from '../session-backend'
import type { AgentSessionManager } from '../agent-session'
import type { ApprovalTracker } from '../approvals'
import type { PoolCaller } from '../pool-caller'
import type { ControlServer } from '../control-server'
import type { PresenceHub } from '../presence/presence-hub'
import type { CanvasSync } from '../presence/canvas-sync'
import type { TeamAskRouter } from '../team-ask-router'

/**
 * EVERY FIELD HERE IS READ LATE, AND THAT IS THE WHOLE POINT OF THE OBJECT.
 *
 * These were `let` bindings at main/index.ts's module scope. They work
 * because every consumer is a CLOSURE that reads them when it runs — a
 * handler answering an invoke, a getter `PtyManager` calls from a live PTY's
 * callback — and by then `app.whenReady()` has assigned them. Module
 * evaluation order is the opposite: the object graph that closes over them
 * is built BEFORE the probe that fills them in, so every one of these is
 * null, empty or a placeholder at construction time.
 *
 * Splitting that scope across files is therefore only safe through a shared
 * MUTABLE RECORD. Passing the values into a sub-module — `createX({ env,
 * claudePath })` — typechecks, reads naturally, and captures the placeholder
 * FOREVER: the app then spawns every agent with launchd's bare PATH and
 * refuses every chat by name ("the agent runtime has not started yet"), with
 * nothing in any log saying why. Sub-modules take `state` and read
 * `state.loginEnv` at the point of USE; none of them may destructure it on
 * entry, which is the same rule `Canvas.tsx`'s hooks follow for `Deps`.
 *
 * `window` is that rule for a second reason: a reload REPLACES the
 * BrowserWindow, so a captured reference goes stale rather than starting
 * stale. It was already read through a getter for that reason before the split.
 */
export interface MainState {
  /** The shell window, or null between a close and the next `createWindow`. */
  window: BrowserWindow | null
  /**
   * Which backend spawns panels. A DirectBackend until the startup probe
   * reassigns it, so a `pty:create` that somehow arrives before the probe
   * finishes still works rather than throwing.
   */
  backend: SessionBackend
  /** The login-shell env, resolved once inside `app.whenReady()`. */
  loginEnv: Record<string, string>
  /**
   * The ABSOLUTE path to git, resolved from the login env at whenReady —
   * null until then, and null forever on a machine with no git on that PATH.
   * Resolved rather than spawned by name for the reason tmux is: launchd
   * gives a GUI app a bare PATH, so a homebrew-only git is simply not found,
   * and the bare-name spawn produced a silent no-Changes-section instead of
   * the `git-missing` arm that exists for exactly this.
   */
  gitPath: string | null
  /**
   * The headless CLIs, from the same probe. Null disables that backend's row
   * BY NAME (`BACKENDS[backend].reasons.noCli`) rather than spawning a bare
   * name that ENOENTs into an `exited` session.
   */
  claudePath: string | null
  codexPath: string | null
  copilotPath: string | null
  /**
   * M71. The agent-session runtime — a conversation with the installed
   * `claude` in headless mode, not a PTY. Built after the env probe, for the
   * reason the PtyManager is: it needs the login environment (how the CLI
   * finds its login and its config) and the CLI's resolved path.
   */
  agents: AgentSessionManager | null
  /** M76. Assigned beside the manager once it exists; `create()` re-syncs through it. */
  approvals: ApprovalTracker | null
  /** M138. The pool's production caller, made beside the manager it drives. */
  pool: PoolCaller | null
  /** M112. Decided once, after the store loads; read by `createWindow` for the renderer's flag. */
  telemetryOn: boolean
  /** M48. When the startup probe ran; the report says so, since it never re-runs. */
  probedAt: number
  /** M54. The control socket's server, once it is listening — read by the quit sequence. */
  controlServer: ControlServer | null
  /** M84. The watcher runner, once it exists — read by the quit sequence. */
  watchRunner: { disposeAll(): void } | null
  /** Presence: one Y.Doc per workspace on the Hocuspocus server. Read by the agent:event fan-out and the quit sequence. */
  presence: PresenceHub | null
  /** The shared canvas's binding (presence/canvas-sync.ts). Read by the hub's bindCanvas and by layout:save. */
  canvasSync: CanvasSync | null
  /** M376. The team queue's owner side. Read at use by the agent:event fan-out, agent:answer and canvas-sync's onAsks. */
  teamAsks: TeamAskRouter | null
  /** The signed-in person's user id, or null — what every agent event is stamped with. Replaced in index.ts once the account exists. */
  currentUserId: () => string | null
}

export function createMainState(): MainState {
  return {
    window: null,
    backend: createDirectBackend('startup: tmux not probed yet'),
    loginEnv: {},
    gitPath: null,
    claudePath: null,
    codexPath: null,
    copilotPath: null,
    agents: null,
    approvals: null,
    pool: null,
    telemetryOn: false,
    probedAt: 0,
    controlServer: null,
    watchRunner: null,
    presence: null,
    canvasSync: null,
    teamAsks: null,
    currentUserId: () => null
  }
}

/**
 * The live `webContents`, or null — the one read every sub-module does
 * through `state.window`, written once here so the three-part null check
 * (no window, destroyed, still loading) cannot drift between callers.
 *
 * `loading` is a SEPARATE question from existence and the two are not
 * interchangeable: a send to a webContents that has not finished loading is
 * dropped with no error, so an event whose whole job is to be news (a
 * watcher's state, the vault's change) asks for `readyContents`, while a verb
 * that only needs a target asks for `liveContents`.
 */
export function liveContents(state: MainState): Electron.WebContents | null {
  const win = state.window
  return win !== null && !win.isDestroyed() ? win.webContents : null
}

export function readyContents(state: MainState): Electron.WebContents | null {
  const wc = liveContents(state)
  return wc !== null && !wc.isLoading() ? wc : null
}

/**
 * M102. A session TOKEN per chat, minted into its environment: `tc api` from
 * inside the chat carries it, and the control handler maps it back to the
 * panel that really asked — a claimed panelId beside it is ignored. Memory
 * only; a relaunch mints fresh ones, which is right (the old shells are gone).
 */
export interface PanelTokens {
  of(id: string): string
  panelOf(token: string): string | undefined
}

export function createPanelTokens(): PanelTokens {
  const tokens = new Map<string, string>()
  return {
    of: (id) => {
      let token = tokens.get(id)
      if (token === undefined) { token = randomBytes(16).toString('hex'); tokens.set(id, token) }
      return token
    },
    panelOf: (token) => { for (const [id, minted] of tokens) if (minted === token) return id; return undefined }
  }
}
