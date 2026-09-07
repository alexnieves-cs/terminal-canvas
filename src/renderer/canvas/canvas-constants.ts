import { triggerWord } from '@shared/watch-trigger'
import { isSkillPanel, isWorkflowPanel, isWorkPanel, isBrowserPanel, isGithubPanel, isMemoryPanel, isWatcherPanel,
  isFilePanel, isJiraPanel, isReviewPanel, isToolboxPanel, isChatPanel, type Panel
} from '@renderer/panels/panels'
import type { PanelRow, PresetRow, PromptRow } from '@renderer/palette/commands'
import type { CredentialMeta } from '@shared/credential-schema'
import type { SettingRow, WorkspaceRow, WorktreeListRow } from '@shared/ipc-contract'
import type { FileRow } from '../shell/file-tree-model'

/**
 * Canvas's module-scope constants and its two pure label/selection helpers.
 *
 * Lifted out of `Canvas.tsx` verbatim (M28, a purely structural split). They
 * have to stay at MODULE scope wherever they live — that is the whole point
 * of every value here, and each one's own comment says so: a fresh `[]` or
 * `new Set()` per render carries a new identity into a dependency array or a
 * memo comparison, which is re-render churn on the 60Hz pan/drag path.
 * Importing them preserves that; re-declaring them inside a component or a
 * hook would silently undo it.
 */
/** Promote immediately, demote late: the other half of the anti-thrash story. */
export const DEMOTE_DELAY_MS = 250
/** A process-table walk is intentionally slow; never put it on a render path. */
export const MACHINE_COST_SAMPLE_MS = 2000

// Module-level so the palette's props keep the same identity between renders;
// a fresh [] each render would rebuild the command list on every frame of a pan.
export const EMPTY_PRESETS: PresetRow[] = []
export const EMPTY_PROMPTS: PromptRow[] = []
export const EMPTY_PANELS: PanelRow[] = []
export const EMPTY_SETTINGS: SettingRow[] = []
// Initial value for workspaceRows before the mount-time reloadWorkspaces()
// call below resolves. attentionIds has no equivalent placeholder — it
// reads live off useAttentionIds(), which starts at its own empty snapshot.
export const EMPTY_WORKSPACES: WorkspaceRow[] = []
// Loaded LAZILY, on palette open, exactly like EMPTY_SETTINGS above and for
// the same reason: nothing here needs it before the first Cmd+K the way the
// top bar needs presetRows at first paint, and calling credential.list() at
// boot would fire it against verify-canvas.cjs's stub registerIpcHandlers
// wiring, which has no credential store to answer it.
export const EMPTY_CREDENTIALS: CredentialMeta[] = []
export const EMPTY_WORKTREES: WorktreeListRow[] = []

// The no-selection case for the file tree: no panel selected, or a selected
// panel with no cwd to root on. A fresh [] each render would defeat FileTree's
// memo exactly as EMPTY_PRESETS etc. exist to prevent above.
export const EMPTY_ROWS: FileRow[] = []

/**
 * The empty selection, as ONE module-scope value, for the reason stated
 * directly above: a fresh `new Set()` per render has a new identity every
 * render, and the selection reaches dependency arrays and memo comparisons —
 * a new identity there is re-render churn on the 60Hz pan/drag path, which is
 * the class of bug `panelRows`, `railSignature` and `resetViewport`'s
 * `useCallback` each exist to keep off this file.
 */
export const EMPTY_SELECTION: ReadonlySet<string> = new Set()

/**
 * Drop every id the predicate rejects, PRESERVING the set's identity when
 * nothing was dropped. That half is what keeps this byte-identical to the
 * `(id) => (id && ids.has(id) ? id : null)` updaters it replaced: an
 * unchanged selection was not a state change there, and must not become one
 * here — a set rebuilt on every panel close and every undo would re-render
 * the canvas for a selection that did not move.
 */
export function retainSelection(
  current: ReadonlySet<string>,
  keep: (id: string) => boolean
): ReadonlySet<string> {
  const next = new Set([...current].filter(keep))
  if (next.size === current.size) return current
  return next.size === 0 ? EMPTY_SELECTION : next
}

/**
 * What the switcher calls a panel. This is always the command/cwd/id shape —
 * autoName()'s shape in main/presets.ts — regardless of whether the panel has
 * a user-set title: the goto row's TITLE stays stable so `verify:panels`
 * check 39 can keep targeting it by text, and a titled panel's name is
 * carried as the row's SUBTITLE instead (see the panel.goto.* row in
 * commands.ts), which is what actually makes it findable in the palette.
 */
export function panelLabel(panel: Panel): string {
  // A review node has no command and no cwd of its own — its subject's repo
  // root is what identifies it, and the label snapshot is what names the
  // agent it reviews. Same shape as the terminal case (a name, then the id)
  // so the switcher's rows stay one kind of row.
  if (isReviewPanel(panel)) return `review: ${panel.subject.label} (${panel.rect.id})`
  // A file panel has no command and no cwd either — the path it points at is
  // what identifies it, and it is stated in full rather than as a basename
  // because two panels on one canvas can easily hold two files of the same
  // name from different directories.
  if (isFilePanel(panel)) return `file: ${panel.source.path} (${panel.rect.id})`
  if (isJiraPanel(panel)) return `jira tickets (${panel.rect.id})`
  // The DIRECTORY, not a basename: a toolbox answers for a whole cwd, and two
  // repositories with the same leaf name are the ordinary case.
  if (isToolboxPanel(panel)) return `toolbox: ${panel.source.cwd} (${panel.rect.id})`
  // M73. The directory, stated in full for the toolbox's reason.
  if (isChatPanel(panel)) return `chat: ${panel.chat.cwd} (${panel.rect.id})`
  // M83. The seventh kind, named by what it remembers.
  if (isMemoryPanel(panel)) return `memory: ${panel.source.root} (${panel.rect.id})`
  // M88. The second work panel, named as the rail names it.
  if (isGithubPanel(panel)) return `GitHub work (${panel.rect.id})`
  // M84. The eighth kind, named by what it runs and when.
  if (isWatcherPanel(panel)) return `watcher: ${panel.watch.command} ${triggerWord(panel.watch.trigger)} (${panel.rect.id})`
  // M103. The eleventh kind, named by the page it opens to.
  if (isBrowserPanel(panel)) return `browser: ${panel.url} (${panel.rect.id})`
  // M116. The twelfth kind, named by its item (the title stamped at mint).
  if (isWorkPanel(panel)) return `work: ${panel.title ?? panel.work.itemId} (${panel.rect.id})`
  // M127. The thirteenth kind, named by the PAIR that identifies it — a name
  // alone would read as one skill when two scopes define it.
  if (isSkillPanel(panel)) return `skill: ${panel.skill.scope} ${panel.skill.name} (${panel.rect.id})`
  // M132. The fourteenth kind, named by the template it projects.
  if (isWorkflowPanel(panel)) return `workflow: ${panel.title ?? panel.workflow.templateId} (${panel.rect.id})`
  const command = panel.spec.command ? panel.spec.command.split('/').pop() : 'login shell'
  // M12's live cwd is deliberately NOT read here. This label carries no
  // present-tense claim — unlike an inspector field labelled "now in", it
  // says nothing that could go stale — so there is nothing here for a live
  // answer to make wrong, and pulling in getLiveSession would only add a
  // claim this row was never making. Left as spec.cwd on purpose; see
  // CLAUDE.md's "Display renders nothing without a live answer" entry for
  // the fuller argument this is a corner of.
  return `${command} — ${panel.spec.cwd} (${panel.rect.id})`
}

/** M92. Screen pixels a maximised panel leaves around itself, so its frame reads as a panel and not as the window. */
export const MAXIMISE_MARGIN = 16
