/**
 * Everything `buildCommands` reads: the facts of the canvas, plus the actions
 * it may call.
 *
 * `PaletteActions` deliberately stays in commands.ts — `verify:verbs
 * closure.1` slices that interface out of that file AS TEXT and holds every
 * member accountable to a verb or an excluded-list reason. The `import type`
 * below is therefore circular by design; it is erased before esbuild sees it,
 * so there is no runtime cycle.
 */
import type { PaletteActions } from '../commands'
import type { PresetRow, PromptRow, PanelRow } from './row-types'
import type { ApprovalRow } from './approval-row'
import type { SettingRow, WorkspaceRow, WorktreeListRow, PanelSearchResult } from '@shared/ipc-contract'
import type { CredentialMeta } from '@shared/credential-schema'
import type { CanvasGroup } from '@renderer/groups/groups'
import type { UpdateState } from '@renderer/session/update-store'
import type { EnvReport } from '@shared/env-report'

export interface PaletteContext {
  /** M92. How many panels are pinned on this canvas — the ninth pin is refused by count. */
  pinnedCount?: number
  presets: PresetRow[]
  prompts: PromptRow[]
  panels: PanelRow[]
  /**
   * Empty until Task 7 loads it from `window.canvas.settings.list()`.
   * REQUIRED for the same reason toggleSetting is required above — leaving it
   * optional is a compile-time hole a half-finished Task 7 wiring could pass
   * straight through.
   */
  settings: SettingRow[]
  /**
   * M48. The environment report, or null before the invoke has answered.
   * Read by buildEnvironmentRows; the launcher reads the same object.
   */
  envReport?: EnvReport | null
  /** M181. Why the starter cannot be opened now (every key applied, no engine), or null/absent when it can. */
  starterReason?: string | null
  /** M182. A workflow panel's template id, by panel id — the editing rows' target. */
  workflowTemplateOf?: (panelId: string) => string | undefined
  /**
   * M123. The last update check's answer (update-store.ts), or null/absent
   * when none has been asked. Read by the `update.check` row's subtitle and
   * the `env.update` row; the launcher reads the same store.
   */
  update?: UpdateState | null
  /** M49. The global terminal font size, for the font rows' titles. */
  globalFontSize?: number
  /** M56. This workspace's bookmarks, and whether the camera trail can step each way. */
  bookmarks?: readonly { id: string; name: string }[]
  cameraTrail?: { back: boolean; forward: boolean }
  workspaces: WorkspaceRow[]
  /**
   * Metadata only, from window.canvas.credential.list() — never a token, and
   * there is no bridge member that would hand one back. See CLAUDE.md and
   * credential-schema.ts's own comment on CredentialMeta for why that absence
   * is the design rather than an omission.
   */
  credentials: readonly CredentialMeta[]
  /**
   * M37. Every worktree this app created, from window.canvas.worktree.list(),
   * loaded on palette open beside `credentials` and for the same reason.
   */
  worktrees: readonly WorktreeListRow[]
  /**
   * M42. The search scope's inputs, filled by Canvas only while the scope is
   * `search`. `searchResults` is null before the first answer (a distinct
   * empty state from []), and `scrollbackEnabled` decides the "off" state.
   */
  searchQuery: string
  /** M122. The whole answer: hits over both logs, the cap stated, the redaction count. */
  searchResults: PanelSearchResult | null
  scrollbackEnabled: boolean
  /**
   * Panel ids currently in wants-you, from the renderer's own attention set.
   * Intersected with each row's panelIds — which is why WORKSPACE_LIST returns
   * ids and not a count: main does not hold this fact, the renderer does.
   */
  attentionIds: readonly string[]
  /** M83. The captured panel's repository, when it has one — the memory row's subject. */
  memoryRoot?: string
  /** M80. Saved shapes of work, built-ins first, each with its named refusal when it cannot run. */
  /** M100. How many teammates the roster holds, for the door's hint. */
  teammateCount?: number
  templates?: readonly { id: string; name: string; nodes: number; edges: number; refusal?: string }[]
  /**
   * M76. Every pending permission request on this renderer, with the panel's
   * label. Optional so every older fixture builds; absent is none.
   */
  approvals?: readonly ApprovalRow[]
  /**
   * focusedId as it was when the palette OPENED, not now. Opening moves DOM
   * focus to the input; the app-level focus is deliberately left alone, and
   * every panel-acting command targets the panel the user was in.
   */
  capturedId: string | null
  /**
   * M27. The directory a new note would be created in, or null when there is
   * none — the SELECTED panel's live cwd, which is the same value the file
   * tree already roots on (Canvas.tsx's `treeRoot`).
   *
   * Selected rather than captured, and that is deliberate: a rail-row click
   * selects a panel without focusing it, so a user browsing a project has it
   * selected while some other panel still holds `capturedId`. A note belongs
   * to the project the user is looking at.
   *
   * REQUIRED rather than optional, the rule `settings` above already states:
   * an optional field lets a half-finished wiring compile with the row
   * permanently disabled, and `tsc` says nothing.
   */
  noteRoot: string | null
  hasSelection: boolean
  /**
   * The rubber-band selection, as ids. A plain array rather than the Set
   * Canvas holds, for the reason every other field here is plain data: this
   * module stays in the plain-node verify tier and its fixtures stay literals.
   */
  selectedIds: string[]
  /** At least two selected terminals can receive keyboard input right now. */
  broadcastReady: boolean
  /** The visible broadcast route is currently armed. */
  broadcastActive: boolean
  /**
   * Whether the merged view is open. REQUIRED, not optional, for the reason
   * `settings` is: an optional flag here is a compile-time hole a surface
   * that forgot to wire it passes straight through — and what it gates is a
   * WRITE into a workspace record the user is not in (see the move rows
   * below), which is the last thing that should degrade quietly to "false".
   */
  merged: boolean
  /**
   * M61. Every group on this canvas, as plain data — id, label, collapsed
   * and members — so the group rows can find the one holding the captured
   * panel. Optional only for the checks' older contexts: an absent list is
   * "no groups", which is a real state, not a hole.
   */
  groups?: readonly CanvasGroup[]
  actions: PaletteActions
}