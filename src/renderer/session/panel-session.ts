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
  | {
      kind: 'running'
      pid: number
      /**
       * What main ACTUALLY spawned, not what the spec asked for. The spec's
       * command is optional and absent means "the login shell", which only
       * main can name — so for every default panel this is the only honest
       * label that exists anywhere in the renderer.
       *
       * It is deliberately NOT copied back into PanelSpec. Filling in the
       * absence would make this a fifth place M5a's absent-command rule can be
       * lost, and every command-less preset would start spawning a hardcoded
       * shell.
       */
      command: string
      cwd: string
      /** Attached to a session that was already running. See PtyCreateResult. */
      reattached: boolean
    }
  | { kind: 'exited'; code: number }
  | { kind: 'error'; message: string }

/** cols/rows are absent on purpose: they are not known until the panel is fitted. */
export type PanelSpecTemplate = Omit<PanelSpec, 'cols' | 'rows'>

/**
 * What a panel's terminal exposes to the rest of the renderer, expressed
 * without naming xterm. Keeping it xterm-free is what lets verify:registry
 * drive the whole session lifecycle against a fake under plain node; the real
 * implementation lives in terminal/session-factory.ts.
 *
 * It is NOT, however, only what the registry needs — it has grown a second
 * audience. The registry calls none of `locate`, `cellSize` or
 * `scrollPosition`: those exist for Canvas.tsx's `__m4a*` test hooks, so
 * verify:panels can read a terminal's buffer, cell metrics and scrollback
 * offset back out of the running app. Splitting the probe members into their
 * own interface is M4b's; until then, adding a member here means deciding
 * which of the two audiences it is for.
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
  /**
   * xterm's buffer.active.viewportY — the scrollback offset. Exists so a
   * check can assert an unfocused panel's terminal did NOT scroll when a
   * wheel over it was claimed by the camera (see useViewport's capture-phase
   * wheel guard). 0 for a session that has never been attached.
   */
  scrollPosition(): number
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
  /**
   * True for a panel restored from disk that has not been clicked this run.
   *
   * A restored panel is one the user asked for LAST run; spawning it because
   * the camera drifted over it is a decision the app would be making on their
   * behalf, and on a twelve-panel canvas that is twelve agent CLIs launched by
   * panning. lod.ts never promotes a dormant panel (dormancy outranks even
   * focus), and attachSlot refuses to spawn one, so both layers have to agree
   * before a process starts.
   *
   * M4c landed and deliberately did NOT make this that seam. Dormant and
   * reattachable stayed separate states: a panel whose tmux session survived
   * is restored NON-dormant by boot reconciliation (Canvas.tsx reconciles
   * against pty:list), and waking still means the same "spawn" call it always
   * did — which `new-session -A` turns into a reattach one process away,
   * without the registry ever learning the difference. Do not read this field
   * as though it carried reattachment state; it does not.
   */
  dormant: boolean
}
