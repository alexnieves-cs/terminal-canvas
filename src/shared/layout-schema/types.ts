/**
 * The SHAPES the layout file holds, and the defaults a missing file falls back
 * to. No parsing lives here, and that is the point of the seam: a reader can
 * be read beside the record it produces without 1,600 lines of other readers
 * in between, and this file stays importable by anything that only needs to
 * NAME a persisted panel.
 *
 * Pure by construction — no fs, no electron, no DOM — which is what lets
 * verify:layout run the whole schema under plain node. The store that owns the
 * file lives in main/layout-store.ts and takes its path as a parameter for the
 * same reason.
 *
 * The reading is in ./panels, ./catalogues and ./workspaces; the door every
 * importer uses is ../layout-schema.ts.
 */

import { type DeviceWidthId, type PreviewBinding } from '../preview'
import { type ArtifactReference } from '../artifact-reference'
import { type NoteForm, type NoteTint } from '../notes'
import { type Annotation } from '../annotations'
import { type PersistedStarter } from '../starter'
import type { PersistedOrchestrate } from '../orchestrate-prefs'
import { type PersistedWorkItem } from '../work-items'
import { type RetainedOutcome } from '../retained-outcomes'
import { SettingValue } from '../settings-schema'
import type { ReviewBaseline, ReviewSubject } from '../review'
import type { FileSource } from '../file-panel'
import type { ToolboxSource, ToolScope } from '../toolbox'
import type { ChatSource } from '../chat-panel'
import { type LinkAutomation } from '../handoff'
import { type WatchTrigger } from '../watch-trigger'
import { type PersistedGroup } from '../groups'
import type { WorkspaceRole } from '../canvas-ops'
import { type PersistedRun } from '../runs'
import { type PersistedTemplate } from '../templates'
import { type PersistedTeammate } from '../teammates'
import { type PersistedRoutine } from '../routines'
import { type Shelf } from '../skills'
import { type AgentKind, type AgentOptions } from '../cost'

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
  /** M182. The template node this panel was minted from (`instantiateTemplate`); the canvas binding's edit route. Absent unless minted so. */
  templateBinding?: { templateId: string; key: string }
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
  /**
   * M147. The counterpart of `PanelSpec.env` this comment once said was
   * deliberately absent: a panel spawned with overrides keeps them across a
   * restore. Absent stays absent; a malformed map is dropped WHOLE with a
   * warning (one bad value beside good ones is an environment nobody wrote).
   */
  env?: Record<string, string>
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
  /**
   * M185. The named device width the guest is laid out at. ABSENT is `full`
   * (the pane's own width) and is every pre-M185 record, so an absent key
   * warns nothing; a present value that is not one of the four names is
   * malformed and costs the FIELD, never the panel — a preview that vanished
   * because a width was misspelled is a worse answer than one at full width.
   */
  device?: DeviceWidthId
  /**
   * M195 (D03). WHAT THIS PANE IS A PREVIEW OF — the directory whose changes
   * reload it, and (when there was one) the panel that directory was taken
   * from. ABSENT is every pre-M195 record and every pane a person typed an
   * address into; it warns nothing and means NOTHING reloads the pane, which
   * its own control says by reading `Bind source`.
   *
   * Persisted because it cannot be reconstructed: the url is a port on this
   * machine and nothing on disk relates it to a project. A malformed value
   * costs the FIELD and never the panel — `device`'s rule, for its reason.
   */
  preview?: PreviewBinding
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

/**
 * M181. The image panel — the FIFTEENTH kind, sessionless like the file
 * panel: an ABSOLUTE path and nothing else. The bytes are read by main on
 * render (`image:read`) and never copied here. A relative path is a
 * malformed record (it names a different file from every cwd); M187 adds
 * asset identity beside `path` rather than replacing it.
 */
export interface PersistedImagePanel extends PersistedPanelBase {
  kind: 'image'
  /**
   * M186. `path` is where the bytes are on THIS machine; `asset` is what they
   * ARE — a sha-256 of the content, present only for a picture this app took
   * into its own store, absent for one the person pointed at in place and on
   * every pre-M186 record. Malformed costs the FIELD, never the panel: the
   * path still paints, and a picture that vanished because its id was
   * misspelled would read as a panel the app deleted.
   */
  image: { path: string; asset?: string; artifact?: ArtifactReference }
}

/**
 * M187. The note kind on disk: one record, three forms. `form` is REQUIRED and
 * a value outside the three drops the panel by name — a note whose form the
 * app invented would paint as something the person did not draw. `text` absent
 * is an EMPTY note (a person can make one and type later), not a malformed
 * record. `tint` belongs to the sticky alone; anywhere else it is dropped with
 * a warning and the panel is kept.
 */
export interface PersistedNotePanel extends PersistedPanelBase {
  kind: 'note'
  note: { form: NoteForm; text: string; tint?: NoteTint }
}

export type PersistedPanel =
  | PersistedNotePanel
  | PersistedImagePanel
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
  /**
   * M253. `false` is the only value: this preset arrived in a pack and its
   * command has not been read, so main refuses to spawn it by name. Absent
   * means reviewed — every preset this machine saved itself. M190's template
   * mark, reached by a second kind.
   */
  reviewed?: false
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
  /**
   * M147 (backlog #34). Environment OVERRIDES merged over the login
   * environment at spawn (`buildPtyEnv`). Only the overrides live here; the
   * base environment stays main's (#31's boundary). Absent stays absent.
   */
  env?: Record<string, string>
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
  /** D11. Historical task meaning, independent of the live panel graph. */
  retainedOutcomes?: RetainedOutcome[]
  /** M181. The starter's applied keys. ABSENT on every pre-M181 file and on a canvas the starter never touched. */
  starter?: PersistedStarter
  /** M287. Orchestrate's workbench size and tab, lens, mode and camera for THIS workspace. ABSENT until the page changes something. */
  orchestrate?: PersistedOrchestrate
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
  /**
   * A workspace shared through Supabase (workspace_shares): its room is
   * `tc:workspace:<share id>` rather than the per-machine local id, which is
   * what lets two people's copies meet in one doc. `role` is a CACHE of this
   * person's workspace_members row, refreshed on every bind — the server
   * checks its own copy, so a stale cache can only refuse too much locally.
   * ABSENT on every unshared workspace, and never sent to the renderer.
   */
  share?: WorkspaceShare
  /**
   * The shared canvas's Y.Doc state (Y.encodeStateAsUpdate, base64), written
   * in the SAME file and the same atomic write as `panels` — so the doc is
   * never older than the layout it was diffed against (canvas-sync.ts).
   * Present only beside `share`. Never sent to the renderer.
   */
  crdt?: string
}

export interface WorkspaceShare {
  id: string
  orgId: string
  role: WorkspaceRole
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
  /**
   * M262. When each recent directory was last spawned into, epoch ms, keyed
   * by the path. A SIBLING of the list, never a reshape of it: `spawn:recent`
   * keeps its `string[]` answer for its three readers, and a directory
   * recorded before M262 simply has no time — the sheet says nothing rather
   * than inventing one.
   */
  recentDirectoryUsed: Record<string, number>
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
    recentDirectories: [],
    recentDirectoryUsed: {}
  }
}

