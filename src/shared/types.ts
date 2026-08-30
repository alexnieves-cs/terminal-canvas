import type { AgentKind, AgentOptions } from './cost'

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
  /**
   * Which agent CLI this is, when this app can account for it. Main uses it
   * to decide whether to pin a session id; it never changes what gets
   * spawned beyond that one flag.
   */
  agent?: AgentKind
  /**
   * The spawn-time knobs for that agent CLI (M18). Read ONLY at genuine
   * creation: tmux `new-session -A` reattaches without re-running the command,
   * so a changed value here does nothing until the panel is restarted.
   */
  agentOptions?: AgentOptions
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

/**
 * A subagent as the renderer needs it. No `toolUseId`: that field is main's
 * own completion key (which `tool_result` closes which `tool_use`) and means
 * nothing on this side of the wire — Task 4 maps `SubagentRecordInternal` to
 * this on the way out.
 */
export interface SubagentRecord {
  id: string
  agentType: string
  description: string
  model: string
  spawnDepth: number
  state: 'running' | 'done'
  startedAt: number
}

/**
 * What IPC_EVENTS.SUBAGENT_STATE carries: main's WHOLE current answer for a
 * panel, not a delta. A delta protocol would need ordering/ack guarantees a
 * 2s poll with no backpressure does not have — a dropped or reordered delta
 * would leave the renderer's picture of "what's running" wrong indefinitely,
 * with nothing to resync it, and a delta applied to the wrong base is a
 * confident wrong answer rather than a missing one. A full replace has no
 * base to be wrong about: whatever arrives IS the answer.
 *
 * What it is NOT is self-healing, and an earlier draft of this comment
 * claimed it was. Main sends only on a CHANGE (see SubagentWatch's dedupe),
 * so a message lost in flight is never resent — the next tick computes the
 * same key, dedupes, and sends nothing. Nothing repairs a dropped update
 * until the records themselves next change. That is accepted rather than
 * fixed: the channel is in-process IPC, and the alternative is either a
 * re-send every tick (the cost the dedupe exists to remove) or an ack
 * protocol for a fact that corrects itself the next time a subagent starts
 * or finishes.
 */
export interface SubagentUpdate {
  panelId: PanelId
  records: SubagentRecord[]
  /**
   * How many subagents were seen beyond main's cap and are therefore NOT in
   * `records` — rendered as `+N more`. Reported rather than dropped silently
   * for REVIEW_FILE_CAP's reason: a list that simply stops is
   * indistinguishable from an agent that stopped spawning.
   */
  overflow: number
  ambiguous: boolean
  /**
   * How many panels share this panel's repository, itself included — so 1 is
   * the attributable case and anything higher is why `ambiguous` is set. On
   * the wire rather than assumed to be 2 by the renderer, because three
   * panels in one repository is reachable and a line stating the wrong number
   * is worse than one stating none.
   */
  sharing: number
}
