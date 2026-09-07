import { MIN_PANEL_H, MIN_PANEL_W } from './panel-geometry'
import { isReadableUrl } from './browser-panel'
import { parseAnnotations, type Annotation } from './annotations'
import { parseWorkItems, type PersistedWorkItem } from './work-items'
import { SettingValue, settingDef } from './settings-schema'
import type { ReviewBaseline, ReviewSubject } from './review'
import type { FileSource } from './file-panel'
import type { ToolboxSource, ToolScope } from './toolbox'
import type { ChatSource } from './chat-panel'
import { HANDOFF_TRIGGERS, type HandoffTrigger, type LinkAutomation } from './handoff'
import { WATCH_TIMER_MIN_MS, type WatchTrigger } from './watch-trigger'
import { GROUP_COLOURS, type PersistedGroup } from './groups'
import { RUNS_MAX, type PersistedRun, type RunEntry } from './runs'
import { TEMPLATES_MAX, type PersistedTemplate, type TemplateEdge, type TemplateNode } from './templates'
import { parseWorkflowNode } from './workflow-nodes'
import { TEAMMATES_MAX, type PersistedTeammate } from './teammates'
import { ROUTINES_MAX, ROUTINE_MIN_MS, type PersistedRoutine } from './routines'
import { parseShelf, type Shelf } from './skills'
export { ROUTINES_MAX } from './routines'
export type { PersistedRoutine } from './routines'
export { TEAMMATES_MAX } from './teammates'
export type { PersistedTeammate } from './teammates'
export { TEMPLATES_MAX } from './templates'
export type { PersistedTemplate, TemplateEdge, TemplateNode } from './templates'
export { RUNS_MAX } from './runs'
export type { PersistedRun, RunEntry } from './runs'
import {
  AGENT_KINDS,
  CODEX_APPROVAL_POLICIES,
  CODEX_SANDBOXES,
  EFFORTS,
  MODEL_PATTERN,
  PERMISSION_MODES,
  type AgentKind,
  type AgentOptions,
  type CodexApprovalPolicy,
  type CodexSandbox,
  type Effort,
  type PermissionMode
} from './cost'

/**
 * The on-disk layout format, and the one function that reads it.
 *
 * Pure by construction — no fs, no electron, no DOM — which is what lets
 * verify:layout run it under plain node. The store that owns the file lives in
 * main/layout-store.ts and takes its path as a parameter for the same reason.
 *
 * parseLayout NEVER throws. A corrupt or hand-edited file must open a working
 * app, not a dead one, so every failure degrades to a default and names itself
 * in `warnings` instead of propagating.
 */

export const LAYOUT_VERSION = 1

/**
 * PanelId doubles as the tmux session name from M4c (see shared/types.ts), and
 * tmux rejects '.' and ':' in a session name. M4b is where ids first become
 * durable, so this is the last moment the constraint is free rather than a
 * migration of everyone's saved file.
 */
export const ID_PATTERN = /^[A-Za-z0-9_-]+$/

/** Matches useViewport's INITIAL, so "camera restore off" and "fresh app" agree. */
export const DEFAULT_CAMERA = { x: 120, y: 120, scale: 1 }

export const DEFAULT_WORKSPACE_ID = 'w1'

export interface RestoreSettings {
  layout: boolean
  camera: boolean
  focus: boolean
}

export interface PersistedPanelBase {
  id: string
  x: number
  y: number
  w: number
  h: number
  z: number
  /** M92. Drag and resize refuse. Absent unless true. */
  locked?: true
  /** M92. Kept live inside the budget. Absent unless true. */
  pinned?: true
  /** M92. Filling the viewport, with the rect to restore. */
  maximised?: { restore: { x: number; y: number; w: number; h: number } }
  /**
   * M130. The skill trail's lane, folded away. The ONE stored fact about the
   * trail — the entries themselves are re-derived from the transcript on
   * every read and never persisted — and a LAYOUT mark like `pinned` rather
   * than a view state like M106's flip, because "collapse it back so it is
   * no longer visible" is a thing the user did to this panel and must
   * survive a relaunch. Absent means expanded, which is every pre-M130 file.
   *
   * The value is CLOSED: `collapsed` is the only word that means anything,
   * so a second state added later is a new word here rather than a `true`
   * whose meaning drifted.
   */
  skillTrail?: 'collapsed'
  /**
   * User-set panel name, set from the command palette's rename row and
   * persisted here since M6a (`layout-adapt.ts`'s `fromPanels`/`toPanels`).
   * Reserved back in M4b — ideas-backlog item 6 put titles on Panel before any
   * UI could set one — which is why the field predates its own writer.
   * Readers must still tolerate its absence: most panels remain untitled.
   */
  title?: string
  /**
   * Outgoing links, M13 — see PanelLink in renderer/panels/panels.ts, and note
   * the name: backlog #24 calls these edges, the code does not, because
   * EdgeIndicators already means the off-screen attention pip.
   *
   * OPTIONAL, and absent means none — which is every layout.json ever written,
   * so a reader that treated absence as corruption would warn once per panel
   * on every existing file. A PRESENT but malformed value warns and is
   * replaced, the line parsePresets and parseBaselines already draw: a
   * silently vanished field is a user's work gone with nothing said.
   */
  links?: {
    to: string
    label?: string
    /**
     * #24: a guarded, auditable action owned by this directed link. ONE per
     * link (M41): a link is a directed pair and carries one meaning, so a
     * handoff REPLACES a restart rule rather than stacking beside it.
     */
    automation?: LinkAutomation
  }[]
}

export interface PersistedTerminalPanel extends PersistedPanelBase {
  /**
   * OPTIONAL, and absent means 'terminal'. Every layout.json ever written
   * predates this field, and parsePanel drops entries individually — so a
   * required discriminant would not fail loudly, it would quietly empty
   * every existing canvas the first time a user launched the new build.
   * Writers still EMIT it (fromPanels), so files written from M9b onward are
   * explicit; only readers tolerate its absence.
   */
  kind?: 'terminal'
  cwd: string
  /** Absent means "the user's login shell" — main resolves it. See PanelSpec. */
  command?: string
  /**
   * M49. A per-panel font size, overriding `terminal.fontSize`. OPTIONAL
   * exactly as `title` is: absent means "the global", and readers tolerate
   * absence. Out of the setting's bounds it is dropped with a warning and
   * the panel survives without it.
   */
  fontSize?: number
  // PanelSpec.env has NO counterpart here — deliberate, not an oversight.
  // Nothing sets spec.env today, so nothing is lost by the omission yet; but
  // it is a SILENT exclusion, and a later feature that starts setting env
  // (per-panel environment overrides, say) would have those values vanish on
  // every restore with no warning anywhere in this file.
  args: string[]
  /**
   * Which agent CLI this panel is pinned to, mirroring Preset.agent. OPTIONAL,
   * and absent means "not accounted for" — every layout.json before M17 has no
   * such field, and a required one would drop every existing panel. Without
   * this field surviving a write-then-reopen, main's PtyManager goes on
   * accumulating and sending usage:panel for a panel whose restored
   * spec.agent is undefined, and buildInspectorModel's `pinned` test silently
   * fails — the Cost section vanishes on every restart even though main is
   * still measuring it.
   */
  agent?: AgentKind
  /**
   * The spawn-time knobs for that agent CLI. Absent means the CLI's own
   * defaults, which is every panel and preset written before M20.
   */
  agentOptions?: AgentOptions
  /**
   * M37. Spawn in a fresh git worktree of the repository at `cwd`, on a new
   * branch. Absent means no, and only `true` is ever written; a present
   * `false` is read as absent. `cwd` stays the REPOSITORY cwd the preset asked
   * for — the worktree path is what main actually spawned in, and it arrives
   * on PtyCreateResult, which is the `asked for` / `cwd` split the inspector
   * already draws. Carried absent-stays-absent through every copy site, by
   * the absent-`command` rule.
   */
  worktree?: boolean
}

export interface PersistedReviewPanel extends PersistedPanelBase {
  kind: 'review'
  /**
   * The whole subject, not a panel id. See ReviewSubject in shared/review.ts:
   * a node outlives the panel it reviews, whose baseline main drops on kill.
   */
  subject: ReviewSubject
}

export interface PersistedFilePanel extends PersistedPanelBase {
  kind: 'file'
  /**
   * Always absolute. See FileSource: nothing expands `~` for a file panel's
   * path, so a `~`-prefixed one (e.g. hand-edited into this file) fails
   * safely as `missing` rather than resolving.
   */
  source: FileSource
}
export interface PersistedJiraPanel extends PersistedPanelBase { kind: 'jira' }
/** M88. The GitHub work panel: no source, no cwd, no args — its subject is the credential. */
export interface PersistedGithubPanel extends PersistedPanelBase { kind: 'github' }

/**
 * M21's toolbox node. Like a review node and a file panel, it carries NO cwd
 * and NO args of its own on this record — its `source.cwd` is the directory it
 * describes, which is a different field with a different meaning.
 */
export interface PersistedToolboxPanel extends PersistedPanelBase {
  kind: 'toolbox'
  source: ToolboxSource
}

/**
 * M83's memory node — the SEVENTH kind, a document one. Like a review node
 * and a toolbox it carries no cwd of its own: its subject is a repository
 * root, and that is the whole of its source.
 */
/**
 * M84. The watcher's trigger, parsed here and nowhere else.
 *
 * A trigger from a LATER version of this app is DROPPED with its panel, never
 * coerced: every other kind's parser can fall back to a default because the
 * worst case is a node that shows the wrong thing, but a coerced trigger runs
 * a real command on a schedule nobody asked for. The timer floor is checked
 * for the same reason — a stored `everyMs: 5` is a busy loop with a UI.
 */
function parseWatch(raw: unknown, id: string, warnings: string[]): { cwd: string; command: string; args: string[]; trigger: WatchTrigger; armed?: false; templateId?: string } | null {
  if (!isRecord(raw)) {
    warnings.push(`dropped watcher panel ${id}: it had no watch record`)
    return null
  }
  if (!isStr(raw.cwd) || raw.cwd.trim() === '') {
    warnings.push(`dropped watcher panel ${id}: its directory was unusable`)
    return null
  }
  if (!isStr(raw.command) || raw.command.trim() === '') {
    warnings.push(`dropped watcher panel ${id}: it had no command to run`)
    return null
  }
  // ABSENT args are none — the commonest command has no arguments, and a
  // whole node is not dropped for a key nobody wrote. A PRESENT one that is
  // not an array of strings is malformed and does drop it: the difference
  // between `make` and `make` with something unreadable after it is a
  // different command.
  let args: string[] = []
  if (raw.args !== undefined) {
    if (!Array.isArray(raw.args) || !raw.args.every(isStr)) {
      warnings.push(`dropped watcher panel ${id}: args was not an array of strings`)
      return null
    }
    args = [...raw.args]
  }
  const t = raw.trigger
  if (!isRecord(t)) {
    warnings.push(`dropped watcher panel ${id}: it had no trigger`)
    return null
  }
  // ABSENT stays absent, and only an explicit `false` is carried: `armed:
  // true` written back would make every file differ from the one before it
  // for a field whose absence already means the same thing.
  const armed = raw.armed === false ? { armed: false as const } : {}
  // M133. A WORKFLOW trigger: the same watcher, carrying the template it
  // instantiates. ABSENT is every ordinary watcher and every pre-M133 file,
  // so it must warn nothing; a PRESENT but unusable value is dropped by name
  // and the watcher is KEPT — a watcher that vanished because of a mark
  // would read as a watcher the user never made.
  let templateMark: { templateId?: string } = {}
  if (raw.templateId !== undefined) {
    if (isStr(raw.templateId) && raw.templateId.trim() !== '') templateMark = { templateId: raw.templateId }
    else warnings.push(`watcher panel ${id}: templateId was not a string — the watcher is kept, its workflow mark dropped`)
  }
  if (t.kind === 'path' && isStr(t.path) && t.path.trim() !== '') {
    return { cwd: raw.cwd, command: raw.command, args, ...armed, ...templateMark, trigger: { kind: 'path', path: t.path } }
  }
  if (t.kind === 'git-ref' && isStr(t.root) && t.root.trim() !== '') {
    return { cwd: raw.cwd, command: raw.command, args, ...armed, ...templateMark, trigger: { kind: 'git-ref', root: t.root } }
  }
  if (t.kind === 'timer' && typeof t.everyMs === 'number' && Number.isFinite(t.everyMs)) {
    if (t.everyMs < WATCH_TIMER_MIN_MS) {
      warnings.push(`dropped watcher panel ${id}: its timer asked for every ${t.everyMs}ms, below the ${WATCH_TIMER_MIN_MS}ms floor`)
      return null
    }
    return { cwd: raw.cwd, command: raw.command, args, ...armed, ...templateMark, trigger: { kind: 'timer', everyMs: t.everyMs } }
  }
  if (t.kind === 'panel' && isStr(t.sourceId) && t.sourceId.trim() !== '' && HANDOFF_TRIGGERS.includes(t.on as HandoffTrigger)) {
    return { cwd: raw.cwd, command: raw.command, args, ...armed, ...templateMark, trigger: { kind: 'panel', sourceId: t.sourceId, on: t.on as HandoffTrigger } }
  }
  warnings.push(`dropped watcher panel ${id}: trigger ${JSON.stringify(t.kind)} was unusable`)
  return null
}

export interface PersistedMemoryPanel extends PersistedPanelBase {
  kind: 'memory'
  source: { root: string }
}

/**
 * M84's watcher. A PROCESS node that is not a terminal, so like every other
 * non-terminal kind it carries no top-level `cwd` and no top-level `args`:
 * `watch.cwd` is where its runs happen, and a reader keyed on the top-level
 * field would mistake it for a terminal and spawn a shell for it.
 */
export interface PersistedWatcherPanel extends PersistedPanelBase {
  kind: 'watcher'
  /** `armed` ABSENT means armed: every watcher written before the toggle existed, and the ordinary case. */
  /** M133. `templateId` ABSENT is an ordinary watcher; present, the fire instantiates that template. */
  watch: { cwd: string; command: string; args: string[]; trigger: WatchTrigger; armed?: false; templateId?: string }
}

/**
 * M73's chat panel. Like every sessionless kind it carries NO top-level cwd
 * and NO args: its `chat.cwd` is the directory its agent works in, a field
 * with a different meaning from a terminal's spawn cwd, and a reader that
 * keyed on the top-level field would mistake it for a terminal.
 */
export interface PersistedChatPanel extends PersistedPanelBase {
  kind: 'chat'
  chat: ChatSource
}

/**
 * M103's browser pane. Sessionless like the file panel: no top-level cwd
 * and no args, just the page it opens to. `url` is http(s) BY PARSE RULE —
 * a `file:` or `data:` url is a malformed record, dropped with a warning,
 * because a guest opened on the user's disk is not a smaller feature but a
 * different one.
 */
export interface PersistedBrowserPanel extends PersistedPanelBase {
  kind: 'browser'
  url: string
}

/**
 * M116. The work card — the twelfth kind, sessionless like Jira's. The
 * record it renders lives on the workspace's `workItems` list and the panel
 * carries the item's id ALONE: a card that copied the state would be a second
 * author of a fact the board owns, wrong after the next dispatch. (The
 * title is the base's, stamped at mint for the rail; nothing reads it as the
 * item's.) No cwd, no args.
 */
export interface PersistedWorkPanel extends PersistedPanelBase {
  kind: 'work'
  work: { itemId: string }
}

/**
 * M128. The skill panel — the thirteenth kind, sessionless like the work
 * card. `scope` AND `name`, and NOTHING else: no description, no body, no
 * resource count, no token figure. A copy is a second author that goes stale
 * silently (M116's ruling for the work card, reached again), so everything
 * the panel shows is read live from the toolbox inventory. Identity is the
 * PAIR because M21 measured that two scopes can define one name and refused
 * to name a winner — a record keyed by name alone would silently pick one.
 * No cwd, no args.
 */
export interface PersistedSkillPanel extends PersistedPanelBase {
  kind: 'skill'
  skill: { scope: ToolScope; name: string }
}

/**
 * M133. The workflow panel — the FOURTEENTH kind, sessionless like the work
 * card. It carries the template's id ALONE, for M116's reason from the other
 * side: the template lives top level in this file, and a node list copied
 * onto the panel would be a second author that goes stale the moment the
 * template is edited. No cwd, no args.
 */
export interface PersistedWorkflowPanel extends PersistedPanelBase {
  kind: 'workflow'
  workflow: { templateId: string }
}

export type PersistedPanel =
  | PersistedMemoryPanel
  | PersistedTerminalPanel
  | PersistedReviewPanel
  | PersistedFilePanel
  | PersistedJiraPanel
  | PersistedGithubPanel
  | PersistedToolboxPanel
  | PersistedChatPanel
  | PersistedWatcherPanel
  | PersistedBrowserPanel
  | PersistedWorkPanel
  | PersistedSkillPanel
  | PersistedWorkflowPanel

/**
 * The id of the built-in login-shell preset, and the fallback whenever a
 * stored defaultPresetId names nothing. Cmd+N doing NOTHING is a worse failure
 * than Cmd+N doing something ordinary, so there is always an answer.
 *
 * The built-in presets themselves are NOT here: they are product defaults, and
 * this file decides what is valid rather than what ships. See main/presets.ts.
 */
export const DEFAULT_PRESET_ID = 'shell'

/**
 * A saved panel definition: everything about a panel that is known before it
 * has a size, plus a name and a default box.
 *
 * `command` is optional for the same reason PanelSpec.command is, and the
 * stakes are higher here because a preset is reused: absent means "the user's
 * login shell", which only main can resolve. Anything that fills it in makes
 * every future spawn from this preset run the wrong program.
 *
 * `w`/`h` are optional because this file must not learn PANEL_W/PANEL_H —
 * those are the renderer's product defaults, and importing them here would
 * drag panel geometry into the format layer.
 */
export interface Preset {
  id: string
  name: string
  cwd: string
  command?: string
  args: string[]
  w?: number
  h?: number
  /** Which agent CLI this launches, when this app can account for it. */
  agent?: AgentKind
  /**
   * The spawn-time knobs for that agent CLI. Absent means the CLI's own
   * defaults, which is every panel and preset written before M20.
   */
  agentOptions?: AgentOptions
  /** M37. See PersistedTerminalPanel.worktree; the same field, the same rule. */
  worktree?: boolean
}

/**
 * M37. One worktree this app created, keyed by its own id rather than by the
 * panel: a record OUTLIVES its panel. Whether it is attached is computed at
 * read time (its `panelId` is in some workspace's panel list) and never
 * cleared on close — restart-in-place is dispose-then-ensure at the same id,
 * so a kill-time detach would hand the restarted panel a brand-new worktree,
 * and undoing a close restores the same id, which must land back in its own
 * branch. A sibling of `baselines` and `sessions` for the reason they are:
 * PanelId is global.
 */
export interface WorktreeRecord {
  id: string
  /** The repository the worktree was created from — `rev-parse --show-toplevel` of the panel's cwd. */
  root: string
  /** Where the worktree lives: under the app's own directory, never inside `root`. */
  path: string
  branch: string
  createdAt: number
  /** The panel that spawned it. Reused by a later panel at the same id in the same `root`. */
  panelId: string
}

/**
 * A saved prompt: text the user pastes into an agent often enough to name.
 *
 * `body` is deliberately unbounded in length — a prompt IS a paragraph — but
 * empty is invalid: a row that pastes nothing looks exactly like a broken
 * insert. Placeholders ({{cwd}} and friends, ideas-backlog #27) are NOT part
 * of this type; they need the read-the-real-cwd machinery #4 owns, and adding
 * the field before the mechanism exists would ship a format promise nothing
 * keeps.
 */
export interface Prompt {
  id: string
  name: string
  body: string
}

export interface PersistedCamera {
  x: number
  y: number
  scale: number
}

/**
 * The flat state the renderer sends and receives. It has no workspace id and
 * no name, because the renderer has no concept of workspaces at all.
 */
export interface CanvasState {
  panels: PersistedPanel[]
  /** Optional on disk for every layout written before groups existed. */
  groups: PersistedGroup[]
  camera: PersistedCamera
  selectedId: string | null
  focusedId: string | null
  /** M56. Named cameras. Optional on disk for every layout written before bookmarks existed. */
  bookmarks: PersistedBookmark[]
  /** M79. Runs — one execution of a subgraph each. Optional on disk for every layout written before runs existed. */
  runs: PersistedRun[]
  /** M93. Notes in the margins. ABSENT on every pre-M93 file and stays absent — never normalised to []. */
  annotations?: Annotation[]
  /** M113. The board's records. ABSENT on every pre-M113 file and stays absent, for M93's reason. */
  workItems?: PersistedWorkItem[]
}

/** M56. A place to come back to: three numbers and a name. */
export interface PersistedBookmark {
  id: string
  name: string
  camera: PersistedCamera
}

/**
 * One canvas. M4b always has exactly one and never surfaces the concept to the
 * renderer. The dimension exists in the FORMAT only, per ideas-backlog item 2:
 * a file written as one flat record of panels makes named workspaces a
 * migration, and one written as a keyed collection makes them nearly free.
 */
export interface Workspace extends CanvasState {
  id: string
  name: string
}

export interface LayoutSnapshot {
  version: number
  activeWorkspaceId: string
  workspaces: Workspace[]
  /**
   * LEGACY READ PATH ONLY. Populated by parseLayout from a pre-M6b file's
   * `settings` key so that upgrade migrates it into `preferences` once — it is
   * never written by this app again (layout-store.ts's writeNow strips it
   * before serialising) and is never the source of truth for anything.
   * `preferences`, via settings-schema.ts's `resolveSetting`, is the real
   * answer; reading this field directly gets you the stale pre-migration
   * value.
   */
  settings: RestoreSettings
  /** User-created presets only. The built-ins are code; see main/presets.ts. */
  presets: Preset[]
  /** What Cmd+N spawns. May name a built-in or a user preset. */
  defaultPresetId: string
  /**
   * The saved store only; `.claude/commands` is read live, never persisted
   * here — see main/prompts.ts.
   */
  prompts: Prompt[]
  /** M80. Saved shapes of work. Optional on disk for every layout written before templates existed. */
  templates: PersistedTemplate[]
  /** M126. The skill shelf's columns. Absent on disk for every layout written before it existed. */
  shelf: Shelf
  /** M100. The roster. Optional on disk for every layout written before teammates existed. */
  teammates: PersistedTeammate[]
  /** M101. Scheduled runs. Optional on disk for every layout written before routines existed. */
  routines: PersistedRoutine[]
  /**
   * Every setting the user has actually CHANGED, keyed by SettingDef.id.
   * Sparse on purpose: an absent id means "still at the schema default", which
   * is what stops this map growing an entry per toggle per user and what lets
   * a default be changed later without rewriting anyone's file.
   */
  preferences: Record<string, SettingValue>
  /**
   * Per-panel review baselines, keyed by PanelId.
   *
   * A SIBLING of `workspaces` rather than a member of one, because PanelId is
   * global rather than per-workspace — M7's rule, and for M7's reason: the id
   * doubles as a tmux session name, so one id means one panel across the whole
   * install.
   */
  baselines: Record<string, ReviewBaseline>
  /**
   * Per-panel agent session ids, keyed by PanelId. See parseSessions for why
   * this is persisted rather than re-minted at each spawn.
   */
  sessions: Record<string, string>
  /** M37. Every worktree this app created. See WorktreeRecord. */
  worktrees: WorktreeRecord[]
  /** M65. The last twelve spawn directories, newest first. Optional on disk for every earlier layout. */
  recentDirectories: string[]
}

export function defaultSettings(): RestoreSettings {
  return { layout: true, camera: true, focus: true }
}

export function defaultWorkspace(): Workspace {
  return {
    id: DEFAULT_WORKSPACE_ID,
    name: 'Canvas',
    panels: [],
    groups: [],
    camera: { ...DEFAULT_CAMERA },
    selectedId: null,
    focusedId: null,
    bookmarks: [],
    runs: []
  }
}

/**
 * An EMPTY canvas, not a first-run one. The format layer decides what is
 * VALID; it does not decide product defaults, which would drag PANEL_W/PANEL_H
 * into shared/ behind it. The renderer supplies firstRunPanels() when it
 * receives no panels.
 */
export function defaultSnapshot(): LayoutSnapshot {
  return {
    version: LAYOUT_VERSION,
    activeWorkspaceId: DEFAULT_WORKSPACE_ID,
    workspaces: [defaultWorkspace()],
    settings: defaultSettings(),
    presets: [],
    defaultPresetId: DEFAULT_PRESET_ID,
    prompts: [],
    templates: [],
    shelf: { columns: [] },
    teammates: [],
    routines: [],
    // Empty means "everything at its schema default" — exactly what a default
    // snapshot is.
    preferences: {},
    baselines: {},
    sessions: {},
    worktrees: [],
    recentDirectories: []
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isStr = (v: unknown): v is string => typeof v === 'string'

function parseReviewSubject(raw: unknown, id: string, warnings: string[]): ReviewSubject | null {
  if (!isRecord(raw)) {
    warnings.push(`dropped review panel ${id}: subject was not an object`)
    return null
  }
  const { subjectId, repoRoot, baselineSha, label } = raw
  // All four are required. A subject missing any one of them cannot ask git
  // its question, and a node that renders a heading over a permanently empty
  // body is worse than a node that was never restored: it looks like the
  // feature is broken rather than like the file was.
  if (!isStr(subjectId) || !ID_PATTERN.test(subjectId)) {
    warnings.push(`dropped review panel ${id}: subject id was unusable`)
    return null
  }
  if (!isStr(repoRoot) || !isStr(baselineSha) || !isStr(label)) {
    warnings.push(`dropped review panel ${id}: subject was incomplete`)
    return null
  }
  // M86. `across` is carried only as a literal `true`. A present value that
  // is anything else is malformed: it warns and the FLAG is dropped, never
  // the node — a review node that lost its flag is an ordinary review of the
  // same subject, which is a smaller wrong than a node that vanished.
  const { across } = raw
  if (across !== undefined && across !== true) {
    warnings.push(`dropped review panel ${id}'s across flag: expected true, got ${JSON.stringify(across)}`)
    return { subjectId, repoRoot, baselineSha, label }
  }
  return { subjectId, repoRoot, baselineSha, label, ...(across === true ? { across: true as const } : {}) }
}

/**
 * Entries are dropped INDIVIDUALLY — the per-entry tolerance parseLayout gives
 * a malformed panel. One bad link costs that link, not the panel's whole set.
 *
 * A self-link and a duplicate are both refused at creation by addLink; a
 * hand-edited file is the other door onto them, and each fails visibly badly
 * (a self-link renders nothing at all, since linkAnchors answers null for
 * coincident centres; a duplicate paints two identical overlapping paths, so
 * the canvas looks like it holds one link while holding two). Both are
 * therefore dropped here as well as refused there.
 *
 * This does NOT check that `to` names a real panel — it cannot, because it
 * runs per panel and the surviving set is not known until every panel has
 * parsed. parseWorkspace does that second pass. verify:layout 110, 111.
 */
/**
 * Either automation kind, or 'malformed' for a PRESENT value that is neither —
 * absent stays undefined and warns nothing (every pre-M25 file). A handoff
 * needs a trigger the code knows; an unknown one is malformed rather than
 * defaulted, because a rule that fires on a trigger its owner did not write
 * is exactly the surprise this parser exists to refuse.
 */
function parseLinkAutomation(raw: unknown): LinkAutomation | undefined | 'malformed' {
  if (raw === undefined) return undefined
  if (!isRecord(raw) || typeof raw.enabled !== 'boolean') return 'malformed'
  if (raw.kind === 'restart-on-exit') return { kind: 'restart-on-exit', enabled: raw.enabled }
  // M78: five triggers. HANDOFF_TRIGGERS is the list; an unknown one is still malformed.
  if (raw.kind === 'handoff' && typeof raw.trigger === 'string' && (HANDOFF_TRIGGERS as readonly string[]).includes(raw.trigger)) {
    return { kind: 'handoff', enabled: raw.enabled, trigger: raw.trigger as HandoffTrigger }
  }
  return 'malformed'
}

function parseLinks(
  raw: unknown,
  id: string,
  warnings: string[]
): PersistedPanelBase['links'] | undefined {
  if (raw === undefined) return undefined
  if (!Array.isArray(raw)) {
    warnings.push(`dropped panel ${id}'s links: not an array`)
    return undefined
  }
  const out: NonNullable<PersistedPanelBase['links']> = []
  const seen = new Set<string>()
  for (const entry of raw) {
    if (!isRecord(entry) || !isStr(entry.to) || !ID_PATTERN.test(entry.to)) {
      warnings.push(`dropped a link on panel ${id}: target was unusable`)
      continue
    }
    if (entry.to === id) {
      warnings.push(`dropped a link on panel ${id}: a panel cannot link to itself`)
      continue
    }
    if (seen.has(entry.to)) {
      warnings.push(`dropped a duplicate link on panel ${id}: ${entry.to}`)
      continue
    }
    seen.add(entry.to)
    const automation = parseLinkAutomation(entry.automation)
    if (automation === 'malformed') warnings.push(`dropped automation on link ${id} -> ${entry.to}: malformed`)
    out.push({
      to: entry.to,
      ...(isStr(entry.label) ? { label: entry.label } : {}),
      ...(automation === undefined || automation === 'malformed' ? {} : { automation })
    })
  }
  // Undefined rather than [], so a panel whose links were all dropped
  // serialises identically to one that never had any — the same
  // absence-is-not-emptiness rule pruneLinksTo obeys on the renderer side.
  return out.length === 0 ? undefined : out
}

/**
 * All-or-drop, no defaulting — parseFileSource's rule: a node pointed at a
 * guessed directory is worse than one that was not restored, because it looks
 * like it worked.
 */
function parseToolboxSource(raw: unknown, id: string, warnings: string[]): ToolboxSource | null {
  if (!isRecord(raw)) {
    warnings.push(`dropped toolbox panel ${id}: source was not an object`)
    return null
  }
  const { cwd, label } = raw
  if (!isStr(cwd) || cwd === '') {
    warnings.push(`dropped toolbox panel ${id}: source cwd was unusable`)
    return null
  }
  return { cwd, label: isStr(label) ? label : cwd }
}

/**
 * M73. A chat panel's record. `cwd` and `sessionId` are both required — a
 * chat with no session id could only ever start a NEW conversation, silently
 * discarding the one the panel was showing — so either missing drops the
 * panel with a warning. The knobs go through `parseAgentOptions`, the ONE
 * parser for that shape, so an unknown knob costs the knob and never the
 * panel, exactly as it does on a terminal panel or a preset.
 */
function parseChatSource(raw: unknown, id: string, warnings: string[]): ChatSource | null {
  if (!isRecord(raw)) {
    warnings.push(`dropped panel ${id}: chat record was ${raw === undefined ? 'absent' : 'not an object'}`)
    return null
  }
  if (!isStr(raw.cwd)) {
    warnings.push(`dropped panel ${id}: chat cwd was not a string`)
    return null
  }
  if (!isStr(raw.sessionId) || raw.sessionId === '') {
    warnings.push(`dropped panel ${id}: chat sessionId was missing`)
    return null
  }
  const chat: ChatSource = { cwd: raw.cwd, sessionId: raw.sessionId }
  // M81. A supervisor keeps its job across a relaunch: the flag is what makes
  // its next spawn carry the system prompt again (the CLI keeps no record).
  if (raw.supervisor === true) chat.supervisor = true
  // M114. A dispatched lane keeps its prompt across a relaunch, the same way.
  if (raw.dispatch === true) chat.dispatch = true
  // M120. A chat with no place keeps its sandbox across a relaunch, the same way.
  if (raw.sandbox === true) chat.sandbox = true
  // M121. A routine's chat keeps its rule prompt across a relaunch, the same way.
  if (raw.routine === true) chat.routine = true
  // M90. The backend: absent is claude and stays absent; a present value that
  // is not a known backend warns and is dropped (the panel keeps claude).
  if (raw.backend !== undefined) {
    // The ONE place a literal member is allowed (registry.1): absent-vs-malformed needs it.
    if (raw.backend === 'codex' || raw.backend === 'copilot' || raw.backend === 'acp') chat.backend = raw.backend
    else if (raw.backend !== 'claude') warnings.push(`panel ${id}: chat backend ${JSON.stringify(raw.backend)} is not claude, codex, copilot or acp; using claude`)
  }
  const agentOptions = parseAgentOptions(raw.agentOptions, `panel ${id}`, warnings)
  if (agentOptions !== undefined) chat.agentOptions = agentOptions
  // M100. The identity rides the record; absent stays absent.
  if (isStr(raw.teammateId) && raw.teammateId.trim() !== '') chat.teammateId = raw.teammateId
  return chat
}

function parseFileSource(raw: unknown, id: string, warnings: string[]): FileSource | null {
  if (!isRecord(raw)) {
    warnings.push(`dropped file panel ${id}: source was not an object`)
    return null
  }
  const { path } = raw
  // All-or-drop, like parseReviewSubject. There is no defaulting a path: a
  // panel pointed at a guessed file is worse than a panel that was not
  // restored, because it looks like it worked.
  if (!isStr(path) || path === '') {
    warnings.push(`dropped file panel ${id}: source path was unusable`)
    return null
  }
  // M27's note flag, and it is deliberately NOT all-or-drop like `path` above.
  // A path is the FACT a file panel is made of; `prose` is a display
  // convenience, so a malformed one drops the FIELD and keeps the panel — the
  // toolbox `label` precedent, and the right trade: a note that reopens as a
  // code view is a wrong view, while a dropped panel is no view at all.
  //
  // Accepted only when it is EXACTLY `true`, never merely truthy: the field is
  // declared `prose?: true`, so absent is the other half of a two-state fact
  // rather than a third state, and coercing `"yes"` would carry a value the
  // type says cannot exist.
  return raw.prose === true ? { path, prose: true } : { path }
}

function parsePanel(
  raw: unknown,
  seen: Set<string>,
  warnings: string[]
): PersistedPanel | null {
  if (!isRecord(raw)) {
    warnings.push('dropped a panel that was not an object')
    return null
  }
  const { id, x, y, w, h, z, cwd, command, args, title, agent, agentOptions, worktree, fontSize } = raw
  if (!isStr(id) || !ID_PATTERN.test(id)) {
    warnings.push(`dropped a panel with an unusable id: ${JSON.stringify(id)}`)
    return null
  }
  if (seen.has(id)) {
    // Two panels sharing an id is the only failure in this file with NO
    // visible symptom: registry.ensure returns the existing session, so both
    // render one handle.host, which can live in exactly one slot.
    warnings.push(`dropped a duplicate panel id: ${id}`)
    return null
  }
  if (!isNum(x) || !isNum(y) || !isNum(w) || !isNum(h) || !isNum(z)) {
    warnings.push(`dropped panel ${id}: a coordinate was not a finite number`)
    return null
  }
  seen.add(id)

  const base = {
    id,
    x,
    y,
    // Clamped rather than dropped: the geometry is recoverable, and losing the
    // panel is a worse answer than resizing it.
    w: Math.max(MIN_PANEL_W, w),
    h: Math.max(MIN_PANEL_H, h),
    z,
    ...(isStr(title) ? { title } : {}),
    // M92. Three layout facts, each absent unless set: `true` round-trips, an
    // explicit false is stored as absent, anything else warns by id and costs
    // the field. A restore rect must be four finite numbers or it is dropped.
    ...(parseFlag(raw.locked, 'locked', id, warnings) ? { locked: true as const } : {}),
    ...(parseFlag(raw.pinned, 'pinned', id, warnings) ? { pinned: true as const } : {}),
    ...(parseMaximised(raw.maximised, id, warnings)),
    // M130. Absent stays absent; the one word round-trips; anything else
    // warns by id and costs the FIELD, never the panel.
    ...(raw.skillTrail === undefined
      ? {}
      : raw.skillTrail === 'collapsed'
        ? { skillTrail: 'collapsed' as const }
        : (warnings.push(`dropped panel ${id}'s skillTrail: ${JSON.stringify(raw.skillTrail)} is not "collapsed"`), {})),
    // M49. Absent stays absent; present-but-unusable costs the FIELD, never
    // the panel — a per-entry failure at one level down.
    ...(fontSize === undefined ? {} : (typeof fontSize === 'number' && Number.isFinite(fontSize) && fontSize >= 9 && fontSize <= 24
      ? { fontSize }
      : (warnings.push(`dropped panel ${id}'s fontSize: ${JSON.stringify(fontSize)} is not a number in [9, 24]`), {}))),
    ...(() => {
      const links = parseLinks(raw.links, id, warnings)
      // Absence is PRESERVED, not normalised to an empty array — the same rule
      // the `kind` and `command` reads below obey, and for the same reason.
      return links === undefined ? {} : { links }
    })()
  }

  // ABSENT is terminal — the whole file's compatibility rule. A PRESENT but
  // unrecognised kind is dropped instead, and the difference is deliberate:
  // absence is a historical fact about every file written before M9b, while
  // "kind": "tree" is a file from a LATER version of this app, and reading
  // it as a terminal panel would spawn a process for a node that never
  // asked for one — out of a record that carries no cwd and no args.
  const { kind } = raw
  if (kind === 'review') {
    const subject = parseReviewSubject((raw as Record<string, unknown>).subject, id, warnings)
    if (subject === null) return null
    return { ...base, kind: 'review', subject }
  }
  if (kind === 'file') {
    const source = parseFileSource((raw as Record<string, unknown>).source, id, warnings)
    if (source === null) return null
    return { ...base, kind: 'file', source }
  }
  if (kind === 'jira') return { ...base, kind: 'jira' }
  if (kind === 'github') return { ...base, kind: 'github' }
  if (kind === 'toolbox') {
    const source = parseToolboxSource(raw.source, id, warnings)
    if (source === null) return null
    return { ...base, kind: 'toolbox', source }
  }
  if (kind === 'memory') {
    // A memory node's source is a repository root and nothing else; an
    // unusable one drops the PANEL by name, like every other kind's source.
    const source = raw.source
    if (!isRecord(source) || !isStr(source.root) || source.root.trim() === '') {
      warnings.push(`dropped memory panel ${id}: source root was unusable`)
      return null
    }
    return { ...base, kind: 'memory', source: { root: source.root } }
  }
  if (kind === 'watcher') {
    const watch = parseWatch((raw as Record<string, unknown>).watch, id, warnings)
    if (watch === null) return null
    return { ...base, kind: 'watcher', watch }
  }
  if (kind === 'chat') {
    const chat = parseChatSource((raw as Record<string, unknown>).chat, id, warnings)
    if (chat === null) return null
    return { ...base, kind: 'chat', chat }
  }
  if (kind === 'browser') {
    // M103. The url is checked HERE, not only when the guest attaches: a
    // record with a file: url would otherwise sit on the canvas as a panel
    // whose guest main refused, blank, with the reason in main's log only.
    const url = (raw as Record<string, unknown>).url
    if (!isStr(url) || !isReadableUrl(url)) {
      warnings.push(`dropped browser panel ${id}: url ${JSON.stringify(url)} is not an http(s) page`)
      return null
    }
    return { ...base, kind: 'browser', url }
  }
  if (kind === 'work') {
    // M116. The item id is the card's only identity, so an unusable one
    // drops the PANEL by name: a card naming no record would sit on the
    // canvas saying "no longer on the board" about an item that never was.
    const work = (raw as Record<string, unknown>).work
    if (!isRecord(work) || !isStr(work.itemId) || work.itemId.trim() === '') {
      warnings.push(`dropped work panel ${id}: work.itemId was not a string`)
      return null
    }
    return { ...base, kind: 'work', work: { itemId: work.itemId } }
  }
  if (kind === 'skill') {
    // M128. Both fields are the panel's whole identity, so an unusable one
    // drops the PANEL by name — a skill panel naming no scope could not ask
    // any inventory for an entry and would render six unknown sections
    // about nothing. The scope is checked against the closed set for the
    // reason parseSkillKey checks it: `local` is a scope and `wherever` is
    // not, and coercing would put a panel on the canvas that can never match.
    const skill = (raw as Record<string, unknown>).skill
    if (!isRecord(skill) || !isStr(skill.name) || skill.name.trim() === '') {
      // M137. Two sentences: an absent record and a present record with a bad
      // name are different files, and "skill.name was not a string" about a
      // record that has no `skill` at all sent a reader looking for a field.
      warnings.push(!isRecord(skill) ? `dropped skill panel ${id}: it carried no skill record` : `dropped skill panel ${id}: skill.name was not a string`)
      return null
    }
    if (skill.scope !== 'user' && skill.scope !== 'project' && skill.scope !== 'local') {
      warnings.push(`dropped skill panel ${id}: skill.scope ${JSON.stringify(skill.scope)} is not a scope`)
      return null
    }
    return { ...base, kind: 'skill', skill: { scope: skill.scope, name: skill.name } }
  }
  if (kind === 'workflow') {
    // M133. The template id is the panel's only identity, so an unusable one
    // drops the PANEL by name — the work card's own rule. A panel naming no
    // template would sit on the canvas saying "that template is gone" about
    // one that never existed.
    const workflow = (raw as Record<string, unknown>).workflow
    if (!isRecord(workflow) || !isStr(workflow.templateId) || workflow.templateId.trim() === '') {
      warnings.push(`dropped workflow panel ${id}: workflow.templateId was not a string`)
      return null
    }
    return { ...base, kind: 'workflow', workflow: { templateId: workflow.templateId } }
  }
  if (kind !== undefined && kind !== 'terminal') {
    warnings.push(`dropped panel ${id}: unrecognised kind ${JSON.stringify(kind)}`)
    return null
  }

  if (!isStr(cwd)) {
    warnings.push(`dropped panel ${id}: cwd was not a string`)
    return null
  }
  if (!Array.isArray(args) || !args.every(isStr)) {
    warnings.push(`dropped panel ${id}: args was not an array of strings`)
    return null
  }
  const panel: PersistedTerminalPanel = {
    ...base,
    // Absence is preserved, not normalised: this is a READER, and a file
    // written before M9b never had a `kind` key at all. `fromPanels` is the
    // WRITER that makes it explicit going forward; echoing it back here would
    // make every parsed pre-M9b panel look, to the next reader, as though the
    // key had always been present.
    ...(kind === 'terminal' ? { kind: 'terminal' as const } : {}),
    cwd,
    args: [...args]
  }
  if (isStr(command)) panel.command = command
  // Present but unknown is the same asymmetry parsePreset draws for its own
  // agent field: a later version wrote a value this one has never heard of,
  // and the field is dropped with a warning rather than carried into the map
  // or silently coerced away.
  if (agent !== undefined && !(AGENT_KINDS as readonly string[]).includes(agent as string)) {
    warnings.push(`panel ${id} named an unknown agent; dropped that field`)
  }
  if (isStr(agent) && (AGENT_KINDS as readonly string[]).includes(agent)) {
    panel.agent = agent as AgentKind
  }
  const panelOptions = parseAgentOptions(agentOptions, `panel ${id}`, warnings)
  if (panelOptions !== undefined) panel.agentOptions = panelOptions
  if (parseWorktreeFlag(worktree, `panel ${id}`, warnings)) panel.worktree = true
  return panel
}

/**
 * M37. The worktree flag a panel or a preset carries, ONE function for both
 * parsers for parseAgentOptions's reason: two parsers for one format agree on
 * the day they are written and drift the first time only one is edited.
 *
 * Absent → absent. `true` → true. A present `false` is a well-formed "no" and
 * reads as absent with no warning, so a file that spelled it out is not
 * shouted at. Anything else drops the FIELD with a warning naming the record,
 * never the record — parseLayout's individual-drop rule one level down.
 */
export function parseWorktreeFlag(raw: unknown, label: string, warnings: string[]): boolean {
  if (raw === undefined || raw === false) return false
  if (raw === true) return true
  warnings.push(`${label} had a malformed worktree flag; dropped it`)
  return false
}

/**
 * The agent knobs a panel or a preset carries, validated per FIELD.
 *
 * ONE function rather than a block pasted into parsePanel and parsePreset,
 * because two parsers for one format agree on the day they are written and
 * drift the first time only one of them is edited — the copy-paste-one-of-two
 * this file's shape invites, and the exact gap M17's fix round found when
 * Preset.agent was guarded and PanelSpec.agent was not.
 *
 * Every arm drops the FIELD and keeps its siblings, never the whole record and
 * never the whole panel: that is `parseLayout`'s individual-drop rule applied
 * one level down, and for mode and effort it also fails SAFE, since the CLI's
 * own default is more restrictive than any value we failed to recognise.
 *
 * Returns undefined when nothing valid survives, so an absent record is never
 * spelled `{}` — `'agentOptions' in preset` has to keep answering false for a
 * preset that never carried one.
 */
export function parseAgentOptions(
  raw: unknown,
  label: string,
  warnings: string[]
): AgentOptions | undefined {
  if (raw === undefined) return undefined
  if (!isRecord(raw)) {
    warnings.push(`${label} had a malformed agentOptions; dropped it`)
    return undefined
  }
  const { permissionMode, effort, model, sandbox, approvalPolicy } = raw
  const out: AgentOptions = {}

  if (permissionMode !== undefined) {
    if (isStr(permissionMode) && (PERMISSION_MODES as readonly string[]).includes(permissionMode)) {
      out.permissionMode = permissionMode as PermissionMode
    } else {
      warnings.push(`${label} named an unknown permissionMode; dropped that field`)
    }
  }

  if (effort !== undefined) {
    if (isStr(effort) && (EFFORTS as readonly string[]).includes(effort)) {
      out.effort = effort as Effort
    } else {
      warnings.push(`${label} named an unknown effort; dropped that field`)
    }
  }

  if (model !== undefined) {
    if (isStr(model) && MODEL_PATTERN.test(model)) {
      out.model = model
    } else if (isStr(model) && model.startsWith('-')) {
      // Its OWN warning, deliberately not merged into the generic malformed
      // one below. There is no shell on this path, so this is not injection —
      // args reach node-pty as an argv array and tmux execs the multi-argument
      // new-session form directly. The surface is `claude`'s own parser: a
      // leading dash makes the value a FLAG rather than --model's operand, and
      // layout.json and presets are both shareable artifacts. Someone reading
      // a log after a surprising spawn needs to see that distinction.
      warnings.push(
        `${label} gave a model that looks like a flag (${model}); dropped that field`
      )
    } else {
      warnings.push(`${label} gave an unusable model; dropped that field`)
    }
  }

  if (sandbox !== undefined) {
    if (isStr(sandbox) && (CODEX_SANDBOXES as readonly string[]).includes(sandbox)) {
      out.sandbox = sandbox as CodexSandbox
    } else {
      warnings.push(`${label} named an unknown sandbox; dropped that field`)
    }
  }

  if (approvalPolicy !== undefined) {
    if (isStr(approvalPolicy) && (CODEX_APPROVAL_POLICIES as readonly string[]).includes(approvalPolicy)) {
      out.approvalPolicy = approvalPolicy as CodexApprovalPolicy
    } else {
      warnings.push(`${label} named an unknown approvalPolicy; dropped that field`)
    }
  }

  return out.permissionMode === undefined && out.effort === undefined && out.model === undefined &&
      out.sandbox === undefined && out.approvalPolicy === undefined
    ? undefined
    : out
}

function parsePreset(raw: unknown, seen: Set<string>, warnings: string[]): Preset | null {
  if (!isRecord(raw)) {
    warnings.push('dropped a preset that was not an object')
    return null
  }
  const { id, name, cwd, command, args, w, h, agent, agentOptions, worktree } = raw
  if (!isStr(id) || !ID_PATTERN.test(id)) {
    warnings.push(`dropped a preset with an unusable id: ${JSON.stringify(id)}`)
    return null
  }
  if (seen.has(id)) {
    warnings.push(`dropped a duplicate preset id: ${id}`)
    return null
  }
  if (!isStr(cwd)) {
    warnings.push(`dropped preset ${id}: cwd was not a string`)
    return null
  }
  if (!Array.isArray(args) || !args.every(isStr)) {
    warnings.push(`dropped preset ${id}: args was not an array of strings`)
    return null
  }
  seen.add(id)
  // Name falls back to the id rather than dropping the entry: an unnamed
  // preset is usable, and losing a saved spawn over a missing label is not.
  const preset: Preset = { id, name: isStr(name) ? name : id, cwd, args: [...args] }
  // Absent stays absent. Assigning a default here is the single most damaging
  // change anyone could make to this file — see the note on Preset.command.
  if (isStr(command)) preset.command = command
  // Clamped rather than dropped, the same trade parsePanel makes: the geometry
  // is recoverable and losing the preset is the worse answer.
  if (isNum(w)) preset.w = Math.max(MIN_PANEL_W, w)
  if (isNum(h)) preset.h = Math.max(MIN_PANEL_H, h)
  // Present but unknown is check 107's asymmetry: it was written by a
  // version that knew an adapter this one does not, and honouring it means
  // passing a flag to a CLI that has never heard of it — which fails the
  // spawn outright rather than merely failing to account.
  if (agent !== undefined && !(AGENT_KINDS as readonly string[]).includes(agent as string)) {
    warnings.push(`preset ${id} named an unknown agent; dropped that field`)
  }
  if (isStr(agent) && (AGENT_KINDS as readonly string[]).includes(agent)) {
    preset.agent = agent as AgentKind
  }
  const presetOptions = parseAgentOptions(agentOptions, `preset ${id}`, warnings)
  if (presetOptions !== undefined) preset.agentOptions = presetOptions
  if (parseWorktreeFlag(worktree, `preset ${id}`, warnings)) preset.worktree = true
  return preset
}

/** Never throws; drops entries individually, like every other parser here. */
export function parsePresets(raw: unknown, warnings: string[]): Preset[] {
  // ABSENT is not corruption — every file written before M5a has no presets
  // key, and warning about those would make the first launch after an upgrade
  // shout about a file that is perfectly fine (verify:layout 32).
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    // PRESENT but unusable is corruption, and the silent version of this line
    // is the exact failure parseLayout's design note exists to prevent: a
    // hand-edited `"presets": {}` drops every saved preset, and the user's
    // only evidence is that the Presets menu got shorter.
    warnings.push('replaced a presets field that was not an array')
    return []
  }
  const seen = new Set<string>()
  return raw
    .map((p) => parsePreset(p, seen, warnings))
    .filter((p): p is Preset => p !== null)
}

/**
 * The same ABSENT-vs-MALFORMED line parsePresets draws.
 *
 * A dropped entry costs that setting and nothing else — the same
 * drop-individually rule the rest of this file obeys — and every drop warns,
 * because the silent version of this function is a preference the user
 * deliberately set that quietly stopped applying, with nothing anywhere
 * saying why.
 */
export function parsePreferences(
  raw: unknown,
  warnings: string[]
): Record<string, SettingValue> {
  // Every file written before M6b has no preferences key. Warning about those
  // would make the first launch after an upgrade shout about a file that is
  // perfectly fine — the same reason parsePresets returns [] silently here.
  if (raw === undefined) return {}
  if (!isRecord(raw)) {
    warnings.push('replaced a preferences field that was not an object')
    return {}
  }
  const out: Record<string, SettingValue> = {}
  for (const [id, value] of Object.entries(raw)) {
    const def = settingDef(id)
    if (def === undefined) {
      // A setting this build does not know about. Dropping it is right —
      // carrying it forward would let a typo persist forever — but it MUST
      // warn, because this is also what a renamed id looks like.
      warnings.push(`dropped an unknown setting: ${id}`)
      continue
    }
    // `boolean`/`number` track what `typeof` can answer; an `enum` is a
    // string, checked against its values below.
    // A list is checked below rather than by typeof, which answers 'object'.
    if (def.type === 'list') {
      if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
        warnings.push(`dropped setting ${id}: expected a list of strings`)
        continue
      }
      out[id] = [...value]
      continue
    }
    // M85. Both `enum` and `text` are strings here; only an enum is then
    // checked against a list of values.
    const expected = def.type === 'enum' || def.type === 'text' ? 'string' : def.type
    if (typeof value !== expected) {
      warnings.push(`dropped setting ${id}: expected ${expected}, got ${typeof value}`)
      continue
    }
    // The enum's membership test is this loader's OWN door, like the range
    // check below: a hand-edited or synced layout.json never passes through
    // setPreference. Dropping with a warning, never coercing to the default —
    // a value that silently became `system` is a preference the user set
    // that stopped applying, with nothing anywhere saying why.
    if (def.type === 'enum' && typeof value === 'string' && !(def.values ?? []).includes(value)) {
      warnings.push(`dropped setting ${id}: ${JSON.stringify(value)} is not one of ${(def.values ?? []).join('|')}`)
      continue
    }
    // The write path (layout-store.ts's setPreference) enforces min/max, but
    // this file is the OTHER door into the same map — a hand-edited
    // layout.json, one synced from another machine, or plain corruption never
    // goes through setPreference at all. A guard on one door only is a guard
    // with a hole in it: an out-of-range agent.idleAfterMs loaded here would
    // reach resolveSetting and the feature exactly as if setPreference had
    // approved it. Dropping with a warning — never clamping — is the same
    // rule the type check above already enforces, for the same reason: a
    // silently-coerced value is a preference the user (or their sync) set
    // that stopped applying, with nothing anywhere saying why.
    if (def.type === 'number' && typeof value === 'number') {
      if ((def.min !== undefined && value < def.min) || (def.max !== undefined && value > def.max)) {
        warnings.push(`dropped setting ${id}: ${value} is outside [${def.min}, ${def.max}]`)
        continue
      }
    }
    out[id] = value as SettingValue
  }
  return out
}

/**
 * The same ABSENT-vs-MALFORMED line parsePresets and parsePreferences draw.
 *
 * Baselines are keyed by PanelId GLOBALLY (a sibling of `workspaces` rather
 * than a member of one — see LayoutSnapshot.baselines), so each entry is
 * dropped INDIVIDUALLY rather than the whole map failing together: one panel
 * with a malformed baseline costs that panel's review history, not
 * everyone's.
 */
export function parseBaselines(
  raw: unknown,
  warnings: string[]
): Record<string, ReviewBaseline> {
  // Every file written before M9a has no baselines key. Warning about those
  // would make the first launch after an upgrade shout about a file that is
  // perfectly fine — the same reason parsePresets/parsePreferences return
  // empty silently here.
  if (raw === undefined) return {}
  if (!isRecord(raw)) {
    // Present but wrong warns rather than vanishing: a silently dropped map
    // is a user's whole review history gone with nothing said.
    warnings.push('baselines was not an object; ignoring it')
    return {}
  }
  const out: Record<string, ReviewBaseline> = {}
  for (const [id, value] of Object.entries(raw)) {
    if (!ID_PATTERN.test(id)) {
      warnings.push(`baseline for ${id} has an unusable panel id; dropped`)
      continue
    }
    if (!isRecord(value) || !isStr(value.root) || !isStr(value.sha)) {
      warnings.push(`baseline for ${id} was malformed; dropped`)
      continue
    }
    out[id] = { root: value.root, sha: value.sha }
  }
  return out
}

/**
 * Which agent session id each panel is pinned to, keyed by PanelId.
 *
 * A sibling of `workspaces` rather than a member of one, and keyed GLOBALLY,
 * for the reason baselines is: PanelId is global (it doubles as a tmux session
 * name), and a hidden workspace's panel holds a pin exactly as the active
 * workspace's does.
 *
 * This map exists because create() runs again for EVERY panel on a Cmd+R
 * reload, and tmux's `new-session -A` reattaches without re-running the
 * command — so a re-minted uuid there would name a transcript that does not
 * exist while the real one went on growing, and the panel's cost would freeze
 * with nothing in any log. See "`reattached` costs a probe".
 */
export function parseSessions(
  raw: unknown,
  warnings: string[]
): Record<string, string> {
  // Every file written before M15 has no sessions key. Warning about those
  // would make the first launch after an upgrade shout about a file that is
  // perfectly fine — the same line parseBaselines draws one function up.
  if (raw === undefined) return {}
  if (!isRecord(raw)) {
    warnings.push('sessions was not an object; ignoring it')
    return {}
  }
  const out: Record<string, string> = {}
  for (const [id, value] of Object.entries(raw)) {
    if (!ID_PATTERN.test(id)) {
      warnings.push(`session for ${id} has an unusable panel id; dropped`)
      continue
    }
    if (!isStr(value)) {
      warnings.push(`session for ${id} was malformed; dropped`)
      continue
    }
    out[id] = value
  }
  return out
}

/**
 * M37. Every worktree this app created. Absent on every file written before
 * M37 and read as [] with no warning, for the reason parseSessions gives; a
 * malformed entry costs that entry, never its siblings.
 */
export const RECENT_DIRECTORIES_CAP = 12

/**
 * M65. Absent is every layout written before M65 and warns nothing; a
 * non-array warns and is dropped; a non-string or empty entry costs that
 * entry; duplicates keep their first (newest) position; capped so the spawn
 * sheet never scrolls a list of temp directories.
 */
export function parseRecentDirectories(raw: unknown, warnings: string[]): string[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    warnings.push('recentDirectories was not an array; ignoring it')
    return []
  }
  const out: string[] = []
  for (const entry of raw) {
    if (!isStr(entry) || entry === '') {
      warnings.push(`dropped a recent directory that was not a path: ${JSON.stringify(entry)}`)
      continue
    }
    if (out.includes(entry)) continue
    out.push(entry)
    if (out.length === RECENT_DIRECTORIES_CAP) break
  }
  return out
}

export function parseWorktrees(raw: unknown, warnings: string[]): WorktreeRecord[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    warnings.push('worktrees was not an array; ignoring it')
    return []
  }
  const out: WorktreeRecord[] = []
  const seen = new Set<string>()
  for (const entry of raw) {
    if (!isRecord(entry)) {
      warnings.push('dropped a worktree record that was not an object')
      continue
    }
    const { id, root, path, branch, createdAt, panelId } = entry
    if (!isStr(id) || !ID_PATTERN.test(id) || seen.has(id)) {
      warnings.push(`dropped a worktree record with an unusable or duplicate id: ${JSON.stringify(id)}`)
      continue
    }
    if (!isStr(root) || !isStr(path) || !isStr(branch) || !isNum(createdAt) || !isStr(panelId) || !ID_PATTERN.test(panelId)) {
      warnings.push(`dropped worktree record ${id}: a field was missing or malformed`)
      continue
    }
    seen.add(id)
    out.push({ id, root, path, branch, createdAt, panelId })
  }
  return out
}

function parsePrompt(raw: unknown, seen: Set<string>, warnings: string[]): Prompt | null {
  if (!isRecord(raw)) {
    warnings.push('dropped a prompt that was not an object')
    return null
  }
  const { id, name, body } = raw
  if (!isStr(id) || !ID_PATTERN.test(id)) {
    warnings.push(`dropped a prompt with an unusable id: ${JSON.stringify(id)}`)
    return null
  }
  if (seen.has(id)) {
    warnings.push(`dropped a duplicate prompt id: ${id}`)
    return null
  }
  if (!isStr(body) || body === '') {
    warnings.push(`dropped prompt ${id}: body was empty or not a string`)
    return null
  }
  seen.add(id)
  // Name falls back to the id, the same trade parsePreset makes: an unnamed
  // prompt is usable, and losing saved text over a missing label is not.
  return { id, name: isStr(name) ? name : id, body }
}

/**
 * M80. Templates. Absent is every pre-M80 file and warns nothing. A template
 * that is not an object, has no usable id or name, or has no surviving node
 * is dropped BY NAME; a node with an unusable key or kind is dropped and the
 * template kept; an edge naming a key that did not survive goes with it, and
 * the template stays — an edge is a relation between nodes, and a relation
 * with one end missing is not a smaller template, it is a broken one.
 */
export function parseTemplates(raw: unknown, warnings: string[]): PersistedTemplate[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    warnings.push('replaced a templates field that was not an array')
    return []
  }
  const seen = new Set<string>()
  const out: PersistedTemplate[] = []
  raw.forEach((entry, i) => {
    if (!isRecord(entry) || !isStr(entry.id) || seen.has(entry.id)) { warnings.push(`dropped template ${i}: not an object or an unusable id`); return }
    if (!isStr(entry.name) || entry.name.trim() === '') { warnings.push(`dropped template ${entry.id}: name was unusable`); return }
    const nodes: TemplateNode[] = []
    if (Array.isArray(entry.nodes)) for (const n of entry.nodes) {
      if (!isRecord(n) || !isStr(n.key) || n.key.trim() === '' || nodes.some((x) => x.key === n.key)) { warnings.push(`dropped a node with an unusable key from template ${entry.id}`); continue }
      // M132: the three workflow kinds route through their own parser, which
      // reports its own reason; the arm below stays exactly as it is for
      // whatever comes after these three.
      if (n.kind === 'pool' || n.kind === 'orchestrator' || n.kind === 'collect') {
        const wfWarnings: string[] = []
        const wf = parseWorkflowNode(n, wfWarnings)
        if (!wf) { warnings.push(`dropped node ${n.key} from template ${entry.id}: ${wfWarnings[0] ?? 'unusable'}`); continue }
        nodes.push({ key: n.key, ...wf })
        continue
      }
      if (n.kind !== 'terminal' && n.kind !== 'chat') { warnings.push(`dropped node ${n.key} from template ${entry.id}: kind was unusable`); continue }
      if (!isStr(n.cwd)) { warnings.push(`dropped node ${n.key} from template ${entry.id}: cwd was unusable`); continue }
      nodes.push({
        key: n.key, kind: n.kind, cwd: n.cwd,
        dx: isNum(n.dx) ? n.dx : 0, dy: isNum(n.dy) ? n.dy : 0,
        ...(isStr(n.presetId) ? { presetId: n.presetId } : {}),
        ...(isStr(n.command) ? { command: n.command } : {}),
        ...(Array.isArray(n.args) && n.args.every(isStr) ? { args: n.args as string[] } : {}),
        ...(isStr(n.title) ? { title: n.title } : {}),
        ...(isStr(n.message) ? { message: n.message } : {}),
        ...(isNum(n.w) ? { w: n.w } : {}),
        ...(isNum(n.h) ? { h: n.h } : {})
      })
    }
    if (nodes.length === 0) { warnings.push(`dropped template ${entry.id}: it had no usable node`); return }
    const keys = new Set(nodes.map((n) => n.key))
    const edges: TemplateEdge[] = []
    if (Array.isArray(entry.edges)) for (const e of entry.edges) {
      if (!isRecord(e) || !isStr(e.from) || !isStr(e.to)) continue
      if (!keys.has(e.from) || !keys.has(e.to)) { warnings.push(`dropped an edge naming a missing node from template ${entry.id}`); continue }
      // A trigger this code does not know is MALFORMED, never defaulted: a
      // rule that fires on a trigger its author did not write is exactly the
      // surprise `parseLinkAutomation` refuses one field away.
      if (!isStr(e.trigger) || !(HANDOFF_TRIGGERS as readonly string[]).includes(e.trigger)) { warnings.push(`dropped an edge with an unusable trigger from template ${entry.id}`); continue }
      edges.push({ from: e.from, to: e.to, trigger: e.trigger as HandoffTrigger })
    }
    seen.add(entry.id)
    out.push({ id: entry.id, name: entry.name, ...(isStr(entry.description) ? { description: entry.description } : {}), nodes, edges })
  })
  return out.slice(0, TEMPLATES_MAX)
}

/**
 * M100. The roster, with the record rules: absent is every pre-existing
 * file (no warning); a record whose lists are not lists, whose name is empty
 * or whose id repeats is dropped BY NAME; inside a good record a place that
 * is not absolute is dropped (a relative place would be resolved against a
 * root nobody chose — `shared/places.ts`) and a flag that is not a boolean
 * falls to false, the teammate kept.
 */
export function parseTeammates(raw: unknown, warnings: string[]): PersistedTeammate[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    warnings.push('replaced a teammates field that was not an array')
    return []
  }
  const seen = new Set<string>()
  const out: PersistedTeammate[] = []
  const strList = (v: unknown): string[] | null => (Array.isArray(v) && v.every(isStr) ? (v as string[]) : null)
  raw.forEach((entry, i) => {
    if (!isRecord(entry) || !isStr(entry.id) || entry.id.trim() === '' || seen.has(entry.id)) { warnings.push(`dropped teammate ${i}: not an object or an unusable id`); return }
    if (!isStr(entry.name) || entry.name.trim() === '') { warnings.push(`dropped teammate ${entry.id}: name was unusable`); return }
    const places = strList(entry.places), services = strList(entry.services), chats = strList(entry.chats)
    if (places === null || services === null || chats === null) { warnings.push(`dropped teammate ${entry.id}: a list field was not a list of strings`); return }
    const absolute = places.filter((p) => { const keep = p.startsWith('/'); if (!keep) warnings.push(`teammate ${entry.id}: dropped place ${p} — a place must be an absolute folder`); return keep })
    // M131. `skills` is OPTIONAL — absent is every pre-M131 record and every
    // teammate nobody has assigned a skill to. Present-but-malformed drops
    // just this field with a warning; the teammate is kept (the record
    // rule: a per-field failure never costs the whole entry).
    let skills: string[] | undefined
    if (entry.skills !== undefined) {
      const parsed = strList(entry.skills)
      if (parsed === null) { warnings.push(`teammate ${entry.id}: dropped skills — not a list of strings`); skills = undefined }
      else skills = parsed
    }
    seen.add(entry.id)
    out.push({
      id: entry.id,
      name: entry.name,
      brief: isStr(entry.brief) ? entry.brief : '',
      places: absolute,
      services,
      ...(skills !== undefined ? { skills } : {}),
      memory: isStr(entry.memory) && entry.memory.trim() !== '' ? entry.memory : entry.id,
      chats,
      messaging: entry.messaging === true,
      scheduling: entry.scheduling === true
    })
  })
  return out.slice(0, TEAMMATES_MAX)
}

/**
 * M101. Routines, with the record rules. The interval floor is enforced
 * here too (a file edited by hand must not arm a busy loop); `lastRun` and
 * `missed` are rebuilt by name so an absent optional stays absent.
 */
export function parseRoutines(raw: unknown, warnings: string[]): PersistedRoutine[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    warnings.push('replaced a routines field that was not an array')
    return []
  }
  const seen = new Set<string>()
  const out: PersistedRoutine[] = []
  raw.forEach((entry, i) => {
    if (!isRecord(entry) || !isStr(entry.id) || entry.id.trim() === '' || seen.has(entry.id)) { warnings.push(`dropped routine ${i}: not an object or an unusable id`); return }
    if (!isStr(entry.name) || entry.name.trim() === '') { warnings.push(`dropped routine ${entry.id}: name was unusable`); return }
    if (!isStr(entry.teammateId) || entry.teammateId.trim() === '') { warnings.push(`dropped routine ${entry.id}: it names no teammate`); return }
    if (!isNum(entry.everyMs) || entry.everyMs < ROUTINE_MIN_MS) { warnings.push(`dropped routine ${entry.id}: the interval was under ${ROUTINE_MIN_MS / 1000}s or not a number`); return }
    if (!isStr(entry.prompt)) { warnings.push(`dropped routine ${entry.id}: prompt was unusable`); return }
    const r: PersistedRoutine = { id: entry.id, name: entry.name, teammateId: entry.teammateId, everyMs: entry.everyMs, prompt: entry.prompt, paused: entry.paused === true }
    if (isStr(entry.plan) && entry.plan.trim() !== '') r.plan = entry.plan
    if (isRecord(entry.lastRun) && isNum(entry.lastRun.at) && (entry.lastRun.outcome === 'started' || entry.lastRun.outcome === 'refused')) {
      r.lastRun = { at: entry.lastRun.at, outcome: entry.lastRun.outcome, ...(isStr(entry.lastRun.panelId) ? { panelId: entry.lastRun.panelId } : {}), ...(isStr(entry.lastRun.error) ? { error: entry.lastRun.error } : {}) }
    }
    if (isRecord(entry.missed) && isNum(entry.missed.at)) r.missed = { at: entry.missed.at }
    seen.add(entry.id)
    out.push(r)
  })
  return out.slice(0, ROUTINES_MAX)
}

/** Never throws; drops entries individually, like every other parser here. */
export function parsePrompts(raw: unknown, warnings: string[]): Prompt[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    warnings.push('replaced a prompts field that was not an array')
    return []
  }
  const seen = new Set<string>()
  return raw
    .map((p) => parsePrompt(p, seen, warnings))
    .filter((p): p is Prompt => p !== null)
}

function parseCamera(raw: unknown, warnings: string[]): PersistedCamera {
  if (!isRecord(raw) || !isNum(raw.x) || !isNum(raw.y) || !isNum(raw.scale) || raw.scale <= 0) {
    // A zero or negative scale is not cosmetic: screenToWorld divides by it,
    // so every coordinate becomes Infinity or NaN and the canvas is dead with
    // no error raised anywhere.
    warnings.push('replaced an unusable camera')
    return { ...DEFAULT_CAMERA }
  }
  return { x: raw.x, y: raw.y, scale: raw.scale }
}

/**
 * A group with a missing panel is repaired, not dropped: closing a panel is a
 * normal action and a group containing three surviving members still says
 * something useful. The all-missing case is dropped because an empty region
 * has no spatial anchor and would become an uncloseable floating label.
 */
function parseGroups(raw: unknown, panelIds: ReadonlySet<string>, warnings: string[]): PersistedGroup[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    warnings.push('replaced a groups field that was not an array')
    return []
  }
  const seen = new Set<string>()
  const groups: PersistedGroup[] = []
  for (const entry of raw) {
    if (!isRecord(entry) || !isStr(entry.id) || !ID_PATTERN.test(entry.id) || seen.has(entry.id)) {
      warnings.push('dropped a group with an unusable or duplicate id')
      continue
    }
    if (!isStr(entry.label) || entry.label.trim() === '') {
      warnings.push(`dropped group ${entry.id}: label was unusable`)
      continue
    }
    if (!(GROUP_COLOURS as readonly string[]).includes(entry.colour as string)) {
      warnings.push(`dropped group ${entry.id}: colour was unusable`)
      continue
    }
    if (!Array.isArray(entry.panelIds) || !entry.panelIds.every(isStr)) {
      warnings.push(`dropped group ${entry.id}: panel ids were unusable`)
      continue
    }
    const members = [...new Set(entry.panelIds)].filter((id) => panelIds.has(id))
    if (members.length === 0) {
      warnings.push(`dropped group ${entry.id}: it had no surviving panels`)
      continue
    }
    if (members.length !== entry.panelIds.length) {
      warnings.push(`dropped missing or duplicate members from group ${entry.id}`)
    }
    seen.add(entry.id)
    groups.push({
      id: entry.id,
      label: entry.label,
      colour: entry.colour as PersistedGroup['colour'],
      panelIds: members,
      ...(typeof entry.collapsed === 'boolean' && entry.collapsed ? { collapsed: true } : {})
    })
  }
  return groups
}

/**
 * M79. Runs. Absent is every pre-M79 file and warns nothing; a run that is
 * not an object, has no usable id or name, or no array of panel ids is
 * dropped by name; an entry naming a panel the workspace no longer has is
 * dropped and the run kept; a run with no surviving panel is dropped; the
 * newest RUNS_MAX are kept.
 */
function parseRuns(raw: unknown, panelIds: ReadonlySet<string>, warnings: string[]): PersistedRun[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    warnings.push('replaced a runs field that was not an array')
    return []
  }
  const seen = new Set<string>()
  const runs: PersistedRun[] = []
  const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
  raw.forEach((entry, i) => {
    if (!isRecord(entry) || !isStr(entry.id) || seen.has(entry.id)) { warnings.push(`dropped run ${i}: not an object or an unusable id`); return }
    if (!isStr(entry.name) || entry.name.trim() === '') { warnings.push(`dropped run ${entry.id}: name was unusable`); return }
    if (!Array.isArray(entry.panelIds) || !entry.panelIds.every(isStr)) { warnings.push(`dropped run ${entry.id}: panel ids were unusable`); return }
    const startedAt = num(entry.startedAt)
    if (startedAt === undefined) { warnings.push(`dropped run ${entry.id}: startedAt was unusable`); return }
    const members = [...new Set(entry.panelIds as string[])].filter((id) => panelIds.has(id))
    if (members.length === 0) { warnings.push(`dropped run ${entry.id}: it had no surviving panels`); return }
    const edges: Array<{ from: string; to: string }> = []
    if (Array.isArray(entry.edges)) for (const e of entry.edges) if (isRecord(e) && isStr(e.from) && isStr(e.to) && panelIds.has(e.from) && panelIds.has(e.to)) edges.push({ from: e.from, to: e.to })
    const entries: RunEntry[] = []
    if (Array.isArray(entry.entries)) for (const e of entry.entries) {
      if (!isRecord(e) || !isStr(e.panelId) || num(e.startedAt) === undefined) continue
      if (!panelIds.has(e.panelId)) { warnings.push(`dropped entry ${e.panelId} from run ${entry.id}: no such panel`); continue }
      const endedAt = num(e.endedAt)
      entries.push({ panelId: e.panelId, startedAt: num(e.startedAt) as number, ...(endedAt === undefined ? {} : { endedAt }), ...(isStr(e.outcome) ? { outcome: e.outcome } : {}) })
    }
    seen.add(entry.id)
    const endedAt = num(entry.endedAt)
    const costUsd = num(entry.costUsd)
    // M133. ABSENT stays absent — never spread as `templateId: undefined`,
    // which survives IPC and reads as present.
    // M137. Present-but-malformed WARNS (parseWatch's rule for the same
    // field); absent stays silent. A mark lost without a line made the Runs
    // tab's "unattributed" arm read as truth about the run rather than the file.
    const templateId = isStr(entry.templateId) && entry.templateId.trim() !== '' ? entry.templateId : undefined
    if (entry.templateId !== undefined && templateId === undefined) warnings.push(`run ${entry.id}: templateId was not a string — the run is kept, its workflow mark dropped`)
    runs.push({ id: entry.id, name: entry.name, panelIds: members, edges, startedAt, ...(endedAt === undefined ? {} : { endedAt }), entries, ...(costUsd === undefined ? {} : { costUsd }), ...(templateId === undefined ? {} : { templateId }) })
  })
  return runs.sort((a, b) => b.startedAt - a.startedAt).slice(0, RUNS_MAX)
}

function parseWorkspace(raw: unknown, index: number, warnings: string[]): Workspace | null {
  if (!isRecord(raw)) {
    warnings.push(`dropped workspace ${index}: not an object`)
    return null
  }
  const id = isStr(raw.id) && ID_PATTERN.test(raw.id) ? raw.id : `w${index + 1}`
  const name = isStr(raw.name) ? raw.name : 'Canvas'
  const seen = new Set<string>()
  const panels = (Array.isArray(raw.panels) ? raw.panels : [])
    .map((p) => parsePanel(p, seen, warnings))
    .filter((p): p is PersistedPanel => p !== null)

  // M13's second pass, and the only place it can happen: a link naming a panel
  // that did not SURVIVE validation has to be dropped, and only this scope
  // knows the whole surviving set.
  //
  // It is derived from `panels` and NOT from `seen`, which is the trap here
  // and cost a red check to find. `seen` looks like the surviving set and is
  // not one: parsePanel calls seen.add(id) immediately after the COORDINATE
  // check and before the cwd and args checks, because its job is rejecting a
  // duplicate id rather than recording a success — so a panel dropped for a
  // missing cwd is still in `seen`, and a link naming it would have resolved
  // to a panel that is not on the canvas. That is precisely the dangling link
  // this pass exists to remove, so reusing `seen` would have made the pass
  // agree with itself and do nothing.
  //
  // (The same subtlety applies to `pick` below, which does filter through
  // `seen`: a selectedId naming a panel dropped for a bad cwd survives as a
  // selection of a panel that is not there. It is harmless — assignTiers
  // simply finds no such panel — and predates this milestone, so it is left
  // alone rather than changed underneath the checks that cover it.)
  //
  // This is the ON-DISK half of the dangling-link stance. removePanel is the
  // in-memory half, and a canvas needs both, because a file can be hand-edited
  // between two launches. Dropping only the unresolvable links, rather than a
  // panel's whole set, is the over-correction guard. verify:layout 111.
  const surviving = new Set(panels.map((p) => p.id))
  for (const p of panels) {
    if (p.links === undefined) continue
    const kept = p.links.filter((l) => surviving.has(l.to))
    if (kept.length === p.links.length) continue
    warnings.push(
      `dropped ${p.links.length - kept.length} link(s) on panel ${p.id}: no such panel`
    )
    if (kept.length === 0) delete p.links
    else p.links = kept
  }

  // #24's functional half is intentionally narrower than decorative links:
  // only terminal panels can emit an exit or accept a restart. A hand-edited
  // rule naming a sessionless node must not turn into a future writer of a
  // PTY when that node is selected, so discard just its action and retain the
  // visible link. Cycles are removed by the same rule the creation helper
  // uses; rate-limiting a loop would only make a malformed file surprising
  // later instead of making it safe at load.
  const byId = new Map(panels.map((p) => [p.id, p]))
  const isTerminal = (p: PersistedPanel): p is PersistedTerminalPanel =>
    p.kind === undefined || p.kind === 'terminal'
  const clearAutomation = (source: PersistedPanel, to: string): void => {
    if (source.links === undefined) return
    source.links = source.links.map((link) => link.to !== to || link.automation === undefined
      ? link
      : { to: link.to, ...(link.label === undefined ? {} : { label: link.label }) })
  }
  for (const source of panels) {
    for (const link of source.links ?? []) {
      if (link.automation === undefined) continue
      const target = byId.get(link.to)
      // M78: a handoff's endpoints are PROCESS kinds — a terminal or a chat
      // (a turn's end is a source; a send is a target). A restart is still
      // the terminal's alone: a chat has no process to restart.
      const isProcess = (p: PersistedPanel): boolean => isTerminal(p) || p.kind === 'chat'
      const allowed = link.automation.kind === 'handoff' ? isProcess : isTerminal
      if (!allowed(source) || target === undefined || !allowed(target)) {
        clearAutomation(source, link.to)
        warnings.push(`dropped automation on link ${source.id} -> ${link.to}: endpoints must be ${link.automation.kind === 'handoff' ? 'terminal or chat panels' : 'terminal panels'}`)
      }
    }
  }
  const reaches = (from: string, sought: string, seen = new Set<string>()): boolean => {
    if (from === sought) return true
    if (seen.has(from)) return false
    seen.add(from)
    const panel = byId.get(from)
    // M41: any ENABLED rule of EITHER kind closes a cycle. A handoff a->b on
    // idle plus a restart b->a is an infinite ping-pong between two
    // interactive agents; a disabled rule fires nothing and closes nothing.
    return (panel?.links ?? []).some((link) =>
      link.automation !== undefined && link.automation.enabled && reaches(link.to, sought, seen)
    )
  }
  for (const source of panels) {
    for (const link of source.links ?? []) {
      const rule = link.automation
      if (rule === undefined || !rule.enabled) continue
      // Temporarily remove this link, otherwise every directed edge trivially
      // reaches its own source through itself.
      clearAutomation(source, link.to)
      if (reaches(link.to, source.id)) {
        warnings.push(`dropped automation on link ${source.id} -> ${link.to}: ${rule.kind === 'handoff' ? 'handoff' : 'restart'} cycle`)
        continue
      }
      // It was safe, so restore the exact durable action.
      source.links = (source.links ?? []).map((candidate) => candidate.to === link.to
        ? { ...candidate, automation: rule }
        : candidate)
    }
  }

  // A selection naming a panel that did not survive validation would leave
  // focus pointing at nothing — and assignTiers pins the focused id live.
  const pick = (v: unknown): string | null => (isStr(v) && seen.has(v) ? v : null)

  return {
    id,
    name,
    panels,
    groups: parseGroups(raw.groups, surviving, warnings),
    camera: parseCamera(raw.camera, warnings),
    selectedId: pick(raw.selectedId),
    focusedId: pick(raw.focusedId),
    bookmarks: parseBookmarks(raw.bookmarks, warnings),
    runs: parseRuns(raw.runs, surviving, warnings),
    ...(() => { const a = parseAnnotations(raw.annotations, surviving, warnings, `workspace ${id}`); return a === undefined ? {} : { annotations: a } })(),
    // M113. Work items are records, not layout: an item naming a panel that
    // did not survive keeps its id (the note says `lane closed`), so the
    // parser takes no panel set — unlike annotations, whose anchor is geometry.
    ...(() => { const w = parseWorkItems(raw.workItems, warnings); return w === undefined ? {} : { workItems: w } })()
  }
}

/**
 * M56. Absent for every earlier file and warns nothing; a malformed entry
 * costs that entry with a warning, never the list. The camera goes through
 * parseCamera's own rule — a zero scale is a dead canvas, not a cosmetic
 * defect — but a REPLACED camera here is a dropped bookmark rather than a
 * bookmark at the default: a bookmark that silently points at the origin is
 * a place the user never saved.
 */
function parseBookmarks(raw: unknown, warnings: string[]): PersistedBookmark[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    warnings.push('replaced a bookmarks field that was not an array')
    return []
  }
  const out: PersistedBookmark[] = []
  const seen = new Set<string>()
  for (const entry of raw) {
    if (!isRecord(entry) || !isStr(entry.id) || !isStr(entry.name) || seen.has(entry.id)) {
      warnings.push('dropped a malformed bookmark')
      continue
    }
    const cameraWarnings: string[] = []
    const camera = parseCamera(entry.camera, cameraWarnings)
    if (cameraWarnings.length > 0) {
      warnings.push(`dropped bookmark ${entry.name}: unusable camera`)
      continue
    }
    seen.add(entry.id)
    out.push({ id: entry.id, name: entry.name, camera })
  }
  return out
}

function parseSettings(raw: unknown): RestoreSettings {
  // Default ON, and coerced: a hand-edited `"yes"` must not become a value the
  // menu renders as some third state.
  const r = isRecord(raw) ? raw : {}
  const flag = (v: unknown): boolean => (typeof v === 'boolean' ? v : true)
  return { layout: flag(r.layout), camera: flag(r.camera), focus: flag(r.focus) }
}

/**
 * `futureVersion` is a third field the design spec does not name. The store
 * has to know whether to back the file up before overwriting it, and the only
 * alternative — string-matching a warning message — would make a log line
 * load-bearing.
 */
export function parseLayout(raw: string): {
  snapshot: LayoutSnapshot
  warnings: string[]
  futureVersion: boolean
} {
  const warnings: string[] = []

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    warnings.push('layout file was not valid JSON; starting from defaults')
    return { snapshot: defaultSnapshot(), warnings, futureVersion: false }
  }

  if (!isRecord(parsed)) {
    warnings.push('layout file was not an object; starting from defaults')
    return { snapshot: defaultSnapshot(), warnings, futureVersion: false }
  }

  if (isNum(parsed.version) && parsed.version > LAYOUT_VERSION) {
    warnings.push(
      `layout file is version ${parsed.version}, newer than ${LAYOUT_VERSION}; not read`
    )
    return { snapshot: defaultSnapshot(), warnings, futureVersion: true }
  }

  const workspaces = (Array.isArray(parsed.workspaces) ? parsed.workspaces : [])
    .map((w, i) => parseWorkspace(w, i, warnings))
    .filter((w): w is Workspace => w !== null)

  if (workspaces.length === 0) {
    warnings.push('layout file had no usable workspace; starting from an empty one')
    workspaces.push(defaultWorkspace())
  }

  const requested = parsed.activeWorkspaceId
  const activeWorkspaceId =
    isStr(requested) && workspaces.some((w) => w.id === requested)
      ? requested
      : workspaces[0].id

  const preferences = parsePreferences(parsed.preferences, warnings)
  // MIGRATION. A file written before M6b has `settings` and no `preferences`,
  // and its three booleans are the schema's first three entries. Seeding them
  // here — rather than leaving them to the defaults — is what stops an upgrade
  // silently resetting a user's restore preferences, which would be
  // indistinguishable from the app ignoring them. Only ids the preferences map
  // does not already carry are seeded, so once written the new key wins.
  //
  // Guarded on `parsed.settings !== undefined` (deviating from a literal read
  // of the migration, which would call parseSettings unconditionally):
  // parseSettings applies ITS OWN defaults for a missing `settings` key, so an
  // unconditional seed would write three redundant `true` entries into every
  // file that never had a `settings` key at all — every fresh install, forever
  // — making the map non-sparse and freezing those three defaults in place for
  // files that hold no actual user choice to preserve.
  if (parsed.settings !== undefined) {
    const legacy = parseSettings(parsed.settings)
    for (const [key, id] of [
      ['layout', 'restore.layout'],
      ['camera', 'restore.camera'],
      ['focus', 'restore.focus']
    ] as const) {
      if (!(id in preferences)) preferences[id] = legacy[key]
    }
  }

  return {
    snapshot: {
      version: LAYOUT_VERSION,
      activeWorkspaceId,
      workspaces,
      settings: parseSettings(parsed.settings),
      presets: parsePresets(parsed.presets, warnings),
      // Only the FORMAT is checked here — whether it is a plausible id at all.
      // Whether it names a preset that exists is main's question, because only
      // main knows the built-ins; resolveDefault answers it there.
      defaultPresetId:
        isStr(parsed.defaultPresetId) && ID_PATTERN.test(parsed.defaultPresetId)
          ? parsed.defaultPresetId
          : DEFAULT_PRESET_ID,
      prompts: parsePrompts(parsed.prompts, warnings),
      templates: parseTemplates(parsed.templates, warnings),
      shelf: parseShelf(parsed.shelf, warnings),
      teammates: parseTeammates(parsed.teammates, warnings),
      routines: parseRoutines(parsed.routines, warnings),
      preferences,
      baselines: parseBaselines(parsed.baselines, warnings),
      sessions: parseSessions(parsed.sessions, warnings),
      worktrees: parseWorktrees(parsed.worktrees, warnings),
      recentDirectories: parseRecentDirectories(parsed.recentDirectories, warnings)
    },
    warnings,
    futureVersion: false
  }
}

/**
 * M126. The write-side companion to `parseShelf`: an empty shelf is deleted
 * from the record before it is stringified, the same rule M93's annotations
 * and workItems already obey per-workspace — a written `"shelf":{"columns":[]}`
 * is a record claiming to exist, so a fresh file and a file whose shelf was
 * emptied must be byte-identical. Takes the already-settings-stripped record
 * `layout-store.ts`'s `writeNow` is about to write, so this stays the ONE
 * place that decides the on-disk shape of a shelf.
 */
export function serialiseLayout(onDisk: Record<string, unknown>): string {
  const out: Record<string, unknown> = { ...onDisk }
  const shelf = out.shelf as Shelf | undefined
  if (shelf !== undefined && shelf.columns.length === 0) delete out.shelf
  return JSON.stringify(out, null, 2)
}

/** M92. A boolean flag on a panel record: true, absent/false as absent, else warned and dropped. */
function parseFlag(value: unknown, name: string, id: string, warnings: string[]): boolean {
  if (value === undefined || value === false) return false
  if (value === true) return true
  warnings.push(`dropped panel ${id}'s ${name}: ${JSON.stringify(value)} is not true or false`)
  return false
}

function parseMaximised(value: unknown, id: string, warnings: string[]): { maximised?: { restore: { x: number; y: number; w: number; h: number } } } {
  if (value === undefined) return {}
  const restore = isRecord(value) ? value.restore : undefined
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
  if (isRecord(restore) && num(restore.x) && num(restore.y) && num(restore.w) && num(restore.h)) {
    return { maximised: { restore: { x: restore.x, y: restore.y, w: restore.w, h: restore.h } } }
  }
  warnings.push(`dropped panel ${id}'s maximised: its restore rect is not four finite numbers`)
  return {}
}
