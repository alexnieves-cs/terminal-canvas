import type { PanelId, PanelSpec } from '@shared/types'
import type { Tier } from '@renderer/canvas/lod'

/**
 * One panel's retained state. Created once, disposed once — never by tiering.
 *
 * The split between this and the React view is the point of M3: "this
 * component is unmounting" and "this panel is going away" were the same
 * statement in M1, and culling makes them different. Confusing them kills a
 * running agent silently.
 */

export type PanelStatus =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'running'; pid: number }
  | { kind: 'exited'; code: number }
  | { kind: 'error'; message: string }

/** cols/rows are absent on purpose: they are not known until the panel is fitted. */
export type PanelSpecTemplate = Omit<PanelSpec, 'cols' | 'rows'>

/**
 * Everything the registry needs from a terminal, and nothing about xterm.
 * The registry is testable under plain node because this interface is all it
 * sees; the real implementation lives in terminal/session-factory.ts.
 */
export interface SessionHandle {
  readonly host: HTMLElement
  /** Open (first time only), take a WebGL context, fit. */
  attach(): void
  /** Drop the WebGL context and take the host out of the document. */
  detach(): void
  write(data: string): void
  size(): { cols: number; rows: number }
  /** Re-fit to the host's current box, after the panel's rect changed. */
  refit(): void
  /** Last N non-empty buffer lines, for the card tier. */
  tail(lines: number): string[]
  focus(): void
  onInput(listener: (data: string) => void): void
  /** The current selection, or '' if there is none. Backs menu-driven Cmd+C. */
  getSelection(): string
  /** Backs menu-driven Cmd+V. Not a raw pty.write: see session-factory.ts. */
  paste(data: string): void
  /** Buffer position of the first occurrence of `word`, or null. */
  locate(word: string): { col: number; row: number } | null
  /** Cell metrics in CSS pixels — transform-blind, like xterm's own. */
  cellSize(): { width: number; height: number }
  dispose(): void
}

export interface SessionFactory {
  create(id: PanelId): SessionHandle
}

export interface PanelSession {
  id: PanelId
  spec: PanelSpecTemplate
  handle: SessionHandle
  status: PanelStatus
  tier: Tier
  spawned: boolean
  /**
   * The cols/rows last sent to the PTY, so a promotion that changes nothing
   * sends nothing. A SIGWINCH makes a full-screen agent TUI repaint, and a
   * panel that was carded and promoted back at the same size has nothing to
   * tell the process.
   */
  sentGrid: { cols: number; rows: number } | null
  lastFocusedAt: number
}
