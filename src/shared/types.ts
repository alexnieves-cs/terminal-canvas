/** Stable identifier for a panel. Doubles as the tmux session name from M4 onward. */
export type PanelId = string

/** Everything needed to bring a PTY into existence. A panel is just cwd + command + env. */
export interface PanelSpec {
  panelId: PanelId
  cwd: string
  command: string
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
}
