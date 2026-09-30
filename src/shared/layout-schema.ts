/**
 * The on-disk layout format, and the one function that reads it.
 *
 * This file is the DOOR, not the reader: every name the app has ever imported
 * from `shared/layout-schema` still resolves here, and the reading is split
 * across `layout-schema/` by WHAT each parser reads. The lists below are
 * written out by name rather than `export *` on purpose — a split that widens
 * the public surface is how a helper meant to stay private (`isRecord`,
 * `parsePanel`, `parseFlag`) becomes something four modules depend on before
 * anyone notices. A name reaches the app by being added here, deliberately.
 *
 *   types.ts       the shapes and the defaults. No parsing.
 *   fields.ts      the guards, and the fields a panel and a preset BOTH carry.
 *   panels.ts      everything that reads one panel record.
 *   catalogues.ts  the top-level lists beside the workspaces.
 *   workspaces.ts  a workspace, its parts, and parseLayout/serialiseLayout.
 *
 * The layering is downward-only, as the canvas layers are:
 *   types → fields → panels → catalogues → workspaces → this file.
 */

export { ROUTINES_MAX } from './routines'
export type { PersistedRoutine } from './routines'
export { TEAMMATES_MAX } from './teammates'
export type { PersistedTeammate } from './teammates'
export { TEMPLATES_MAX } from './templates'
export type { PersistedTemplate, TemplateEdge, TemplateNode } from './templates'
export { RUNS_MAX } from './runs'
export type { PersistedRun, RunEntry } from './runs'

export {
  DEFAULT_CAMERA,
  DEFAULT_PRESET_ID,
  DEFAULT_WORKSPACE_ID,
  ID_PATTERN,
  LAYOUT_VERSION,
  defaultSettings,
  defaultSnapshot,
  defaultWorkspace,
  FRESH_WORKSPACE_NAME
} from './layout-schema/types'
export type {
  CanvasState,
  LayoutSnapshot,
  PersistedBookmark,
  PersistedBrowserPanel,
  PersistedCamera,
  PersistedChatPanel,
  PersistedFilePanel,
  PersistedGithubPanel,
  PersistedImagePanel,
  PersistedJiraPanel,
  PersistedMemoryPanel,
  PersistedNotePanel,
  PersistedPanel,
  PersistedPanelBase,
  PersistedReviewPanel,
  PersistedSkillPanel,
  PersistedTerminalPanel,
  PersistedToolboxPanel,
  PersistedWatcherPanel,
  PersistedWorkPanel,
  PersistedWorkflowPanel,
  Preset,
  Prompt,
  RestoreSettings,
  Workspace,
  WorkspaceShare,
  WorktreeRecord
} from './layout-schema/types'

export { parseAgentOptions, parseEnvMap, parseWorktreeFlag } from './layout-schema/fields'

/** Exported for `verify:notes notes.gate.3` — see the note at its definition. */
export { parseFileSource } from './layout-schema/panels'

export {
  RECENT_DIRECTORIES_CAP,
  parseBaselines,
  parsePreferences,
  parsePresets,
  parsePrompts,
  parseRecentDirectories,
  parseRecentDirectoryUsed,
  parseRoutines,
  parseSessions,
  parseTeammates,
  parseTemplates,
  parseWorktrees
} from './layout-schema/catalogues'

export { parseLayout, serialiseLayout } from './layout-schema/workspaces'
