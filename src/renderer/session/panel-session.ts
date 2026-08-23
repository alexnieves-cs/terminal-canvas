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
  /** Last N non-empty buffer lines, for the card tier. */
  tail(lines: number): string[]
  focus(): void
  onInput(listener: (data: string) => void): void
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
  lastFocusedAt: number
}
