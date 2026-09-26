/**
 * The three PLAIN-DATA rows the palette reads — presets, prompts and panels.
 *
 * Split out of commands.ts in M278. They carry no behaviour and no imports
 * from the palette itself, which is what lets `buildCommands` and the rail /
 * inspector modules share them without either dragging the other's weight in.
 */
import type { StateInput } from '@renderer/panels/panel-state'
import type { AutoStatus } from '@shared/auto'
import type { AgentBackend } from '@shared/agent-session'
import type { AgentKind, AgentOptions } from '@shared/cost'

/** A preset as the palette needs it: main answers preset:list with these. */
export interface PresetRow {
  /** M253. Arrived in a pack and not yet read; the spawn row is disabled by name and a read row sits beside it. */
  reviewed?: false
  id: string
  name: string
  /** Its command is on the resolved login PATH. Only main can know this. */
  available: boolean
  /** Built-ins are code, not data: they refuse rename and delete. */
  builtIn: boolean
  isDefault: boolean
  /** cwd, and the command if there is one. Searchable via filterCommands. */
  subtitle: string
  /** M37. Spawns in a fresh worktree. Absent means no. */
  worktree?: boolean
  /** M65. The preset's agent kind and directory — see PresetListRow. */
  agent?: AgentKind
  cwd?: string
  /** M174. The preset's command word, when it has one — see PresetListRow. */
  command?: string
  agentOptions?: AgentOptions
}

export interface PromptRow {
  id: string
  name: string
  /** 'saved' is the store in layout.json; 'project' is .claude/commands. */
  source: 'saved' | 'project'
}

export interface PanelRow {
  id: string
  label: string
  /** M49. The kind, so a row that only means anything on a terminal can say so. */
  kind: 'terminal' | 'review' | 'file' | 'jira' | 'github' | 'toolbox' | 'chat' | 'memory' | 'watcher' | 'browser' | 'work' | 'skill' | 'workflow' | 'image' | 'note' | 'relay'
  /** M49. A per-panel font override, when set. Absent means the global. */
  fontSize?: number
  /** The user's name for it, if set. Shown so the rename row can echo it. */
  title?: string
  /**
   * M64. What the Go-to row LEADS with (the user's title, else the honest
   * name without path or id), the directory it trails, and the state word
   * with its `state:` ordering. All optional so every older fixture builds;
   * absent, the row falls back to `label`.
   */
  name?: string
  path?: string
  /** The vocabulary's input, so the row can render the word live in its tone. */
  state?: StateInput
  /** M74. Whether the SESSION's agent is claude — the only session `Open as chat` can follow. */
  claude?: boolean
  /** M74. A chat panel with a turn in flight or a permission waiting — the open-in-terminal row's named refusal. */
  busy?: boolean
  /** M92. Layout facts, absent unless set. */
  locked?: boolean
  pinned?: boolean
  /** M97. The chat's auto run, when one is live or just resolved. */
  auto?: AutoStatus
  /** M100. The teammate a chat speaks as, when one. */
  teammateId?: string
  maximised?: boolean
  /** M90. A chat's backend; absent is claude. */
  backend?: AgentBackend
  /** M74. A chat panel's completed turns; zero refuses open-in-terminal by name. */
  turns?: number
  /** M77. Whether Open review can act, with the kind's own reason when not. Absent falls back to `restartable`. */
  reviewable?: boolean
  reviewReason?: string
  /** The word at build time — the `state:` query's key and order. */
  stateWord?: string
  /**
   * isRestartable(status) — computed in Canvas, where the registry is, and
   * passed in as plain data like everything else this module reads.
   *
   * REQUIRED, not optional, for the reason toggleSetting's comment below
   * gives: an optional flag lets a half-finished wiring compile while the
   * Restart row is silently always-disabled (undefined !== true) or always
   * enabled, and tsc says nothing at all about it.
   */
  restartable: boolean
  /**
   * M20. Whether this panel runs an agent CLI whose flags this app knows —
   * `spec.agent !== undefined`, computed in Canvas like `restartable` beside
   * it and passed in as plain data.
   *
   * REQUIRED for exactly the reason `restartable` states one field up: an
   * optional flag lets a half-finished wiring compile with every mode row
   * permanently disabled (undefined !== true), and tsc says nothing.
   */
  agent: boolean
  /**
   * M112 (review round 1, CRITICAL 2). Whether the SESSION has ever spawned
   * — `registry.get(id)?.spawned`, computed in Canvas like `restartable`
   * and `agent` beside it. The export row's own refusal needs this fact
   * that `restartable` doesn't carry: a panel can be non-restartable (still
   * running) and fully exportable, or restartable (exited) and still hold a
   * live buffer from before it exited. REQUIRED for the same reason as
   * `restartable`/`agent` one field up: optional would let a half-wired
   * row compile disabled forever with tsc silent about it.
   */
  spawned: boolean
}
