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
}
