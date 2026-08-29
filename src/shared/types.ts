/** Stable identifier for a panel. Doubles as the tmux session name from M4 onward. */
export type PanelId = string

/** Everything needed to bring a PTY into existence. A panel is just cwd + command + env. */
export interface PanelSpec {
  panelId: PanelId
  cwd: string
  /**
   * Optional: absent means "the user's login shell". The renderer cannot
   * resolve that itself — electron-vite compiles `process.env` in the renderer
   * bundle to `{}`, so a `process.env.SHELL` read there is always `undefined`
   * and silently collapses to whatever fallback follows it. Main already
   * probes the real login environment (see shell-env.ts); it fills this in.
   */
  command?: string
  args: string[]
  /** Extra vars layered on top of the resolved login-shell env. */
  env?: Record<string, string>
  cols: number
  rows: number
}

export interface PtyExitInfo {
  panelId: PanelId
  exitCode: number
  signal?: number
}

export interface PtyDataChunk {
  panelId: PanelId
  data: string
}

export interface PtyResizeRequest {
  panelId: PanelId
  cols: number
  rows: number
}

export interface PtyWriteRequest {
  panelId: PanelId
  data: string
}

/** Returned by pty:create so the renderer can show what actually got spawned. */
export interface PtyCreateResult {
  panelId: PanelId
  pid: number
  command: string
  cwd: string
  /**
   * True when this attached to a tmux session that was already running rather
   * than creating one. Main's alone to know: `new-session -A` makes create and
   * reattach the same call, so it is answered by a has-session probe taken
   * BEFORE the spawn. Always false on the direct backend, which has no
   * sessions to outlive anything.
   */
  reattached: boolean
  /**
   * The program running in the pane NOW, when anything knows — only the tmux
   * backend's list() can answer it. OPTIONAL because this same type is what
   * create() returns, where there is no live answer yet, and because the
   * direct backend has none ever; a required field would force both to invent
   * one, which is exactly the backfill this milestone forbids. Absent means
   * "nothing knows".
   */
  currentCommand?: string
}

/**
 * What a panel's agent is doing, derived in main from bytes and their absence.
 *
 * 'exited' is the detector's terminal state and NOT a second source of truth
 * about how a process ended: PanelStatus.exited stays authoritative for the
 * exit code and the pane-died hook's recovery of it. This exists only so the
 * detector stops emitting and the panel leaves the attention set.
 */
export type AgentState = 'starting' | 'busy' | 'idle' | 'wants-you' | 'exited'

/** What IPC_EVENTS.AGENT_STATE carries. */
export interface AgentStateUpdate {
  panelId: PanelId
  state: AgentState
}

/**
 * What IPC_EVENTS.SESSION_LIVE carries: where a panel IS and what it is
 * RUNNING, as opposed to PanelSpec.cwd and PtyCreateResult.cwd, which are both
 * frozen at spawn.
 *
 * Only tmux can answer this, so there is no direct-backend equivalent and no
 * fallback value — a panel with no live answer simply never receives one of
 * these, which is what lets the inspector render nothing rather than render a
 * spawn-time value under a present-tense label.
 */
export interface LiveSessionUpdate {
  panelId: PanelId
  cwd: string
  currentCommand: string
}
