/**
 * Single source of truth for the IPC surface.
 *
 * Imported by main, preload, and renderer alike. Adding a channel here and
 * nowhere else should produce a type error in every process that must handle it.
 */
import type {
  AgentStateUpdate,
  LiveSessionUpdate,
  PanelId,
  PanelSpec,
  PtyCreateResult,
  PtyDataChunk,
  PtyExitInfo,
  PtyResizeRequest,
  PtyWriteRequest,
  SubagentUpdate
} from './types'
import type { CanvasState, PersistedPanel } from './layout-schema'
import type { SettingDef, SettingValue } from './settings-schema'
import type { ReviewResult, ReviewBaseline, ReviewSubject, ReviewDiff, ReviewDiffRequest, ReviewCommitRequest, ReviewCommitResult } from './review'
import type { CredentialMeta } from './credential-schema'
import type { WorkItem } from './work-item'
import type { FileCreateResult, FileResult, FileWriteResult } from './file-panel'
import type { ToolInventoryResult } from './toolbox'
import type { AgentKind, AgentOptions, PanelUsage } from './cost'
import type { DirResult } from './fs-tree'
import type { MachineCostSnapshot, MachineCostTarget } from './machine-cost'

/** Renderer -> main, request/response via ipcRenderer.invoke. */
export const IPC = {
  PTY_CREATE: 'pty:create',
  PTY_WRITE: 'pty:write',
  PTY_RESIZE: 'pty:resize',
  PTY_KILL: 'pty:kill',
  /** Live sessions, so a fresh renderer can reconcile instead of guessing. */
  PTY_LIST: 'pty:list',
  /**
   * One slow process-table snapshot for the terminal process trees currently
   * visible to this canvas. Pull-only: main has no reason to poll when no
   * renderer is asking, and a push timer would live after a canvas closes.
   */
  MACHINE_COST_SAMPLE: 'machine:sample',
  /**
   * The resolved starting canvas. Main applies the restore settings before
   * answering, so the renderer never learns those settings exist.
   */
  LAYOUT_LOAD: 'layout:load',
  /** A full snapshot on every change; main coalesces and decides when to write. */
  LAYOUT_SAVE: 'layout:save',
  /**
   * Which backend spawns panels, and why. The renderer shows this only when it
   * is 'direct', so the user is never told their sessions are durable when
   * they are not.
   */
  SESSION_BACKEND: 'session:backend',
  /**
   * The preset list as the PALETTE needs it — names, availability, which is
   * default, and which are built-in. Availability is main's alone: it is
   * resolved against the login PATH, which the renderer's compiled-away
   * process.env cannot see.
   */
  PRESET_LIST: 'preset:list',
  /**
   * The three mutations M5a deferred to the palette. These invert M5a's
   * direction — its preset channels are main -> renderer because the MENU is
   * main's; the palette is the renderer's, so the mutations are invokes, which
   * is also why they belong here rather than in IPC_EVENTS.
   */
  PRESET_RENAME: 'preset:rename',
  PRESET_DELETE: 'preset:delete',
  PRESET_SET_DEFAULT: 'preset:set-default',
  /**
   * Spawn from a preset the PALETTE picked. Same main-side path as the menu's
   * pick, and a channel rather than the renderer rebuilding the template from
   * a PresetListRow: only main can resolve an ABSENT command into the user's
   * login shell, so a renderer-side reconstruction would either lose the
   * absence or guess zsh at it.
   */
  PRESET_SPAWN_BY_ID: 'preset:spawn-by-id',
  /**
   * Save a preset from a panel the RENDERER picked, rather than from whichever
   * panel is focused.
   *
   * The distinction is the whole reason this channel exists. PRESET_CAPTURE is
   * a main -> renderer request answered off focusedIdRef, which is right for
   * the menu item (there is no other panel a menu could mean) and wrong for
   * the inspector, which describes the SELECTED panel — an id this app keeps
   * deliberately distinct from the focused one, since a rail row selects
   * without focusing. Reusing capture there would save a different panel than
   * the pane is describing, and the preset it wrote would be well-formed and
   * merely wrong.
   *
   * Main still mints the id and the name (presetFromCapture): the renderer
   * can see neither the built-in ids nor the existing names.
   */
  PRESET_SAVE_PANEL: 'preset:save-panel',
  /**
   * "Reset canvas…" asked for from the palette rather than the menu. Main owns
   * the confirmation dialog and the counts request, so the renderer asks main
   * to run the flow it already has instead of growing a second one.
   */
  CANVAS_REQUEST_RESET: 'canvas:request-reset',
  /**
   * The merged prompt list: the saved store plus .claude/commands under the
   * cwd of the panel the palette captured. Takes a cwd because the project
   * half is per-panel — and main expands it, since `~` is main's to resolve.
   * A null cwd means "saved prompts only", which is what a palette opened with
   * nothing focused should show.
   */
  PROMPT_LIST: 'prompt:list',
  /** Always writes the SAVED store. The project half is read-only. */
  PROMPT_SAVE: 'prompt:save',
  PROMPT_DELETE: 'prompt:delete',
  /**
   * The settings surface. Renderer -> main and invokes, not events, for the
   * same reason M5b's preset mutations are: main owns the store, because the
   * before-quit flush cannot ask a renderer that Cmd+R may already have
   * destroyed. The list carries the schema AND the resolved value together, so
   * the renderer never needs its own copy of the defaults.
   */
  SETTINGS_LIST: 'settings:list',
  SETTINGS_SET: 'settings:set',
  /**
   * "I have looked at this panel." The renderer's half of clearing wants-you.
   *
   * Who clears the state is not symmetric, and that asymmetry is why this
   * channel exists at all. Typing is a fact main already holds — pty:write
   * names the panel — so main clears it there with nothing new. Focus is a
   * RENDERER fact: main has no idea which panel focusedId names. Clearing it
   * renderer-side instead would make the renderer a second author of a state
   * main owns, and the two would disagree the first time M6d fired a
   * notification for a panel the user had already read.
   */
  AGENT_ACKNOWLEDGE: 'agent:acknowledge',
  /**
   * The workspace surface. All five point renderer -> main for the reason
   * M5b's preset mutations do: main owns layout.json, and the palette is the
   * renderer's — so a mutation is an invoke, not an event.
   *
   * There is deliberately NO workspace attention channel. The renderer
   * already receives every agent:state transition for every panel main knows
   * about, so the attention set is folded renderer-side; WORKSPACE_LIST
   * returns panelIds and the renderer intersects. Asking main to recompute a
   * set the renderer already holds would make main a second author of a
   * derived fact — the same reasoning M6d recorded for not adding a channel.
   */
  WORKSPACE_LIST: 'workspace:list',
  /** Takes the outgoing canvas: the switch IS its last save. See the store. */
  WORKSPACE_ACTIVATE: 'workspace:activate',
  WORKSPACE_CREATE: 'workspace:create',
  WORKSPACE_RENAME: 'workspace:rename',
  WORKSPACE_DELETE: 'workspace:delete',
  /**
   * Every workspace's panels at once, for the merged view.
   *
   * A SECOND channel rather than a widening of WORKSPACE_LIST, which already
   * fires on mount, on every palette open, on every workspace mutation, on
   * every switch and on every panels.length change. Putting every panel of
   * every workspace on that payload makes a hot path fat to serve a mode
   * that is off almost always.
   *
   * Returns records, not display panels: the renderer places them into lanes
   * (merged-layout.ts), because lane placement is pure geometry over plain
   * data and belongs in the tier that can test it under plain node.
   */
  WORKSPACE_MERGED: 'workspace:merged',
  /**
   * Relocates panels between workspace records. Touches NO SESSION on either
   * side — a moved panel becomes a hidden workspace's panel with a running
   * tmux session, the state a switch already produces. See LayoutStore.movePanels.
   */
  WORKSPACE_MOVE_PANELS: 'workspace:move-panels',
  /**
   * What has changed in this panel's repository since its session started.
   *
   * An invoke, and pull-only: no watcher and no push channel. The renderer
   * already holds every signal that says "now is a good moment to ask" —
   * selection changed, and M6c's agent-state transition to `idle`, which
   * means precisely "this agent stopped producing output". A push channel
   * would make main a second author of a timing decision the renderer
   * already makes correctly, the same call M6d and M7 both made and recorded.
   */
  REVIEW_PANEL: 'review:panel',
  /**
   * This panel's stored baseline, or null. The renderer asks exactly once —
   * when a review node is created — and stores the answer IN the node, so
   * the node can keep asking review:at after main has dropped the panel's
   * baseline on kill. It is deliberately not a general read: nothing else in
   * the renderer has any business knowing a sha.
   */
  REVIEW_BASELINE: 'review:baseline',
  /**
   * The same question review:panel answers, addressed by BASELINE instead of
   * by panel id — which is the entire reason a review node can outlive its
   * subject. Two channels rather than one optional-argument channel, because
   * the two have different lifetimes and different failure arms: review:panel
   * can answer never-started and not-a-repo, and neither is reachable here.
   */
  REVIEW_AT: 'review:at',
  /** One file's hunks. Pull-only, one file at a time — see ReviewDiffRequest. */
  REVIEW_DIFF: 'review:diff',
  /**
   * Turn the work a review node reports into a commit.
   *
   * The app's first irreversible write, and the only channel here that
   * changes anything outside this app's own state. Addressed by repository
   * ROOT rather than by panel id, for the reason REVIEW_AT is: a node outlives
   * its subject, and a commit is a repository operation.
   *
   * Async and slow by design — a pre-commit hook on a real repository is
   * legitimately thirty seconds — so the renderer must render an in-flight
   * state rather than assuming a prompt reply.
   */
  REVIEW_COMMIT: 'review:commit',
  /** Metadata only. There is deliberately no credential:get — see CLAUDE.md. */
  CREDENTIAL_LIST: 'credential:list',
  CREDENTIAL_SET: 'credential:set',
  CREDENTIAL_DELETE: 'credential:delete',
  /** Uses the token to make one request; returns what the service said. */
  CREDENTIAL_VERIFY: 'credential:verify',
  /** Main reads the authenticated user's assigned Jira work. */
  JIRA_LIST: 'jira:list',
  /**
   * Ask main to show a native open dialog. Resolves to the chosen absolute
   * path, or null if the user cancelled.
   *
   * Main owns the dialog because main owns every other dialog in this app
   * (the reset confirm, and canvas:request-reset's whole reason for existing).
   * A renderer-side reconstruction would drift from the menu path silently.
   */
  FILE_OPEN: 'file:open',
  /**
   * Read a file AND arm the watch for that panel id.
   *
   * One channel rather than two, deliberately: it makes "the renderer is
   * showing this file" and "main is watching this file" one statement rather
   * than two that can disagree. The component reads on mount and closes on
   * unmount, so a workspace switch — which unmounts without disposing —
   * correctly stops watching a canvas nobody is looking at, and re-arms on the
   * way back.
   */
  FILE_READ: 'file:read',
  /** Disarm the watch. Called from the component's unmount. */
  FILE_CLOSE: 'file:close',
  /**
   * One directory's entries, for the file tree. Addressed by an absolute path
   * rather than by a panel id: the tree's root follows the SELECTED panel but
   * a directory the user has expanded is not that panel's business, and a
   * panel-addressed read would go blank the moment the selection moved.
   *
   * Names and kinds only. There is deliberately no `fs:read` — file CONTENTS
   * never cross this boundary, which is what keeps ideas-backlog #31
   * ("any feature that moves terminal bytes out of the panel is a disclosure
   * surface, because agents print secrets") out of this milestone entirely.
   * A preview pane is a separate milestone that owes #31 an answer first.
   *
   * Distinct from FILE_READ/FILE_OPEN above: those name and watch ONE file a
   * user opened deliberately; FS_LIST lists a DIRECTORY's entries for
   * navigation and never reads a file's contents.
   */
  FS_LIST: 'fs:list',
  /**
   * What extends the agent CLI running in one panel's cwd: skills, slash
   * commands, subagents, MCP servers, hooks and permission COUNTS.
   *
   * Addressed by CWD, never by panel id, and that is the same argument
   * `review:at` makes one milestone over: a toolbox node must keep answering
   * after its subject panel is closed, and "what is installed for this
   * directory" is a fact about the directory rather than about the panel.
   * Twelve panels in one repository share one answer, which is also what lets
   * main cache it by cwd instead of parsing a 93 KB file twelve times.
   *
   * PULL, never push. There is deliberately no `toolbox:changed` event and no
   * watcher: half the sources (~/.claude/settings.json, ~/.claude.json,
   * ~/.claude/skills, ~/.claude/commands) are shared by EVERY panel, and
   * FileWatchers is keyed by panel id — twelve panels would arm twelve
   * watchers on the same four paths and emit twelve messages for one save.
   * Doing it properly needs a path-keyed, refcounted registry, which is a
   * different class of machinery and its own milestone. Meanwhile the node
   * renders `readAt`, so a stale node is honest rather than silently wrong.
   */
  TOOLBOX_READ: 'toolbox:read',

  /**
   * One settings file's permission RULES, one bucket at a time.
   *
   * Its own channel rather than a field on the inventory, and the reason is a
   * measurement: 628 allow rules in one real file and 718 in another, two
   * orders of magnitude more than every other kind combined. Carrying them by
   * default would be roughly 240 KB per panel per selection change for data
   * almost nobody expands — `review:diff`'s pull-only, one-file-at-a-time
   * shape, for `review:diff`'s reason.
   */
  TOOLBOX_PERMISSIONS: 'toolbox:permissions',
  /**
   * Write a file the renderer has been editing, and refuse rather than
   * destroy.
   *
   * `baseMtimeMs` is the mtime of the FileResult the draft was seeded from,
   * and a mismatch against disk is REFUSED — the answer to #14's own open
   * question about who wins when the agent and the user edit at once. `null`
   * means overwrite regardless, reachable only from a control the user
   * presses after being shown the conflict.
   *
   * A fourth file channel rather than a flag on FILE_READ: reading and
   * writing have different failure sets, and folding them into one channel
   * would make FileResult carry write outcomes it has no business knowing
   * about.
   */
  FILE_WRITE: 'file:write',
  /**
   * M27. Create one file and refuse rather than clobber — the note verb.
   *
   * Its own channel rather than a flag on FILE_WRITE, because the two answer
   * different questions and must refuse for different reasons: a write is a
   * compare-and-swap against a file that EXISTS, and a create is refused
   * precisely BECAUSE one does. Folding them would make `baseMtimeMs: null`
   * — the deliberate force-overwrite a user reaches only after seeing a
   * conflict — into an accidental create, which is the one thing this verb is
   * built never to do.
   */
  FILE_CREATE: 'file:create'
} as const

/** Main -> renderer, fire-and-forget via webContents.send. */
export const IPC_EVENTS = {
  PTY_DATA: 'pty:data',
  PTY_EXIT: 'pty:exit',
  /** Menu-driven clipboard actions; the renderer owns xterm's selection. */
  EDIT_COPY: 'edit:copy',
  EDIT_PASTE: 'edit:paste',
  /**
   * Cmd+Z / Cmd+Shift+Z, forwarded from the main-process menu exactly as
   * EDIT_COPY/EDIT_PASTE are. Ctrl+Z is deliberately untouched and reaches the
   * PTY as SIGTSTP — the same split as Cmd+C (copy) versus Ctrl+C (SIGINT).
   */
  EDIT_UNDO: 'edit:undo',
  EDIT_REDO: 'edit:redo',
  /**
   * What a Reset canvas… confirmation has to name. Main owns the dialog but
   * only the renderer knows the live session statuses, so it asks over this
   * channel — a main->renderer request/reply, not a handled invoke, which is
   * why it lives here and not in IPC (verify:ipc only walks IPC).
   */
  CANVAS_COUNTS: 'canvas:counts',
  /** Confirmed reset: drop every panel and return to the first-run canvas. */
  CANVAS_RESET: 'canvas:reset',
  /**
   * Spawn a panel from a preset the user picked in the menu. Main → renderer
   * because the MENU is main's, and the renderer is the only side that can
   * mint a panel id (nextIdRef) and know where the camera is looking.
   */
  PRESET_SPAWN: 'preset:spawn',
  /**
   * The template Cmd+N should use from now on. Pushed after load and whenever
   * the presets or the default change.
   *
   * Cmd+N stays a renderer keybinding rather than a menu accelerator because
   * verify:panels presses it with a dispatched KeyboardEvent, which a
   * main-process accelerator would never receive — moving it would rewrite
   * checks 7, 20 and 22 into IPC sends that prove strictly less.
   */
  PRESET_DEFAULT: 'preset:default',
  /**
   * "Save panel as preset": main owns the menu but only the renderer knows
   * which panel has focus, so main asks. Answered on an ephemeral reply
   * channel, exactly as CANVAS_COUNTS is, which is why this lives here rather
   * than in IPC — verify:ipc only walks IPC.
   */
  PRESET_CAPTURE: 'preset:capture',
  /**
   * What a panel's agent is doing. Main -> renderer, fire-and-forget, like
   * PTY_DATA — which is why it lives here rather than in IPC.
   *
   * Its own channel, deliberately: routing this through anything that bumps
   * registry.version() would re-render the whole canvas on agent output and
   * undo the memo that exists to block the 60Hz pan/zoom cascade. Main sends
   * only on an actual CHANGE of state, so a panel printing a megabyte
   * produces one message, not thousands.
   */
  AGENT_STATE: 'agent:state',
  /**
   * Where a panel is and what it is running, pushed when either CHANGES.
   *
   * An IPC_EVENTS member and not an IPC one, which decides a number: verify:ipc
   * asserts over Object.values(IPC) — invoke channels, each needing an
   * ipcMain.handle — and is unmoved by this. M6d hit the same boundary and
   * recorded it.
   *
   * Deduped in main for the reason AGENT_STATE is: this rides a 2s tick, and an
   * unconditional send would be thirty messages a minute per panel describing a
   * fact that changes when a human types `cd`.
   */
  SESSION_LIVE: 'session:live',
  /**
   * Which subagents a panel's agent has running, pushed when the set CHANGES.
   *
   * An IPC_EVENTS member and not an IPC one, which decides a number:
   * verify:ipc asserts over Object.values(IPC) — invoke channels, each needing
   * an ipcMain.handle — and is unmoved by this. It stays at 31. M6d hit this
   * boundary and correctly added no channel; a draft of M12's spec said
   * "31 to 32" and would have made a task fail the suite by fixing a correct
   * count. This is the third time it has been reachable.
   */
  SUBAGENT_STATE: 'subagent:state',
  /**
   * A watched file changed on disk. Main -> renderer, fire-and-forget.
   *
   * An IPC_EVENTS member and not an IPC one, which decides a number:
   * verify:ipc asserts over Object.values(IPC) and is unmoved by this, so the
   * count goes 35 -> 38 (this milestone's three new invokes on top of M13's,
   * M14's and M15's own additions), not 39. M6d and M12 each hit this same
   * boundary and recorded it; this is the fourth.
   *
   * A push, where review:* is deliberately pull-only, and the difference is
   * what the signal MEANS rather than a change of posture. Review's signal is
   * "an agent finished a turn", which the renderer already observes as an idle
   * transition — main would be a second author of a timing decision. A file's
   * signal is "the bytes on disk changed", which ONLY main can see; there is
   * no renderer-side event that means it.
   *
   * Deduped in main against a hash of the whole result, for the reason
   * AGENT_STATE and SESSION_LIVE are deduped: undeduped this is a message per
   * filesystem event describing a fact that did not change, and its failure is
   * invisible — no pixel is wrong, it shows up as heat.
   *
   * Carries the whole FileResult rather than a bare notification. The
   * alternative — push {panelId} and have the renderer re-invoke file:read —
   * doubles the latency and reintroduces a race between the notification and
   * the read, for the sole benefit of a smaller message the byte cap already
   * bounds.
   */
  FILE_CHANGED: 'file:changed',
  /**
   * What a panel's agent has spent, pushed when it CHANGES.
   *
   * An IPC_EVENTS member and not an IPC one, which decides a number:
   * verify:ipc asserts over Object.values(IPC) — invoke channels, each needing
   * an ipcMain.handle — and is unmoved by this. It stays at 38, the count
   * FILE_CHANGED already left it at. M6d, M12, M15's SUBAGENT_STATE and now
   * this are the fourth instance of the same boundary; an earlier draft of
   * one of those specs said otherwise and would have failed the suite by
   * "fixing" a correct number.
   *
   * Deduped in main for the reason AGENT_STATE and SESSION_LIVE are: this
   * rides a slow tick and an unconditional send would be a message per tick
   * per panel describing a fact that changes once per agent turn.
   */
  USAGE_PANEL: 'usage:panel'
} as const

export interface FileReadRequest {
  panelId: PanelId
  path: string
}

/** What `toolbox:read` is asked. See TOOLBOX_READ for why it is a cwd. */
export interface ToolboxReadRequest {
  /**
   * The panel's cwd, UNEXPANDED — main expands it with `resolveCwd`, the same
   * expansion a spawn gets, so the toolbox and the agent can never disagree
   * about which directory they are talking about.
   */
  cwd: string
  /**
   * The panel this is for, used ONLY to look up a spawn-time config stamp so
   * the answer can carry a `freshness`. Deliberately not part of the cache
   * key — see TOOLBOX_READ.
   */
  panelId: PanelId
}

/** What `toolbox:permissions` is asked. */
export interface ToolboxPermissionsRequest {
  /** Absolute path of the settings file, taken from a PermissionCounts row. */
  path: string
  bucket: 'allow' | 'deny' | 'ask'
}

/**
 * No `panelId`, unlike FileReadRequest: the read is keyed by it because the
 * watch it arms is keyed by it. A write is a plain request/response with
 * nothing to key — the panel that issues it is not this channel's business.
 */
/**
 * Create a note. `root` is the directory `name` resolves against — the
 * selected panel's cwd, so a note lands in the project it is about — and
 * `name` is what the user typed, which may carry directories.
 *
 * MAIN joins the two, because the renderer has no `node:path` at all
 * (file-node-model.ts hand-rolls `splitPath` for that reason), so a
 * renderer-side join would be a second, worse implementation of a problem
 * this process already has a library for.
 */
export interface FileCreateRequest {
  root: string
  name: string
  /** Initial contents. Written atomically with the create, never appended after. */
  seed: string
}

export interface FileWriteRequest {
  path: string
  content: string
  /**
   * The mtime the draft was seeded from, or null to overwrite deliberately.
   * Null is NOT a default — it is a user gesture, and the only caller that
   * passes it is the Overwrite control shown after a `stale`.
   */
  baseMtimeMs: number | null
}

export interface FileChangedEvent {
  panelId: PanelId
  result: FileResult
}

export interface SessionBackendInfo {
  kind: 'tmux' | 'direct'
  /** Human-readable cause, shown in the HUD when kind is 'direct'. */
  reason: string
}

/**
 * A preset as the renderer needs it. NO panelId: the renderer mints that from
 * nextIdRef, and a main-minted id would collide with the `n` sequence Cmd+N
 * uses — the same duplicate-id defect M4a fixed and M4b nearly resurrected.
 *
 * `command` absent still means the login shell, all the way down to
 * pty-manager's resolveCommand. Nothing on this journey may fill it in.
 */
export interface PresetTemplate {
  cwd: string
  command?: string
  args: string[]
  w?: number
  h?: number
  /** Which agent CLI this launches, when this app can account for it. */
  agent?: AgentKind
  /** The spawn-time knobs for that agent CLI (M20). */
  agentOptions?: AgentOptions
}

/** What the renderer answers PRESET_CAPTURE with: the focused panel, or null. */
export interface CapturedPanel {
  cwd: string
  command?: string
  args: string[]
  w: number
  h: number
  /** Which agent CLI this launches, when this app can account for it. */
  agent?: AgentKind
  /** The spawn-time knobs for that agent CLI (M20). */
  agentOptions?: AgentOptions
}

/** One row of the palette's prompt list. Mirrors PromptListRow in main. */
export interface PromptBridgeRow {
  id: string
  name: string
  source: 'saved' | 'project'
  body: string
}

/**
 * One workspace as the palette needs it.
 *
 * An IPC payload shape, not an on-disk one — the same split PresetListRow
 * draws against Preset, and it matters for the same reason: layout-schema.ts
 * decides what is VALID on disk, and a field that exists only to render a row
 * has no business in the format.
 *
 * `panelIds` rather than a waiting count. Main does not know which panels are
 * in wants-you in a form the renderer should trust it for, and the renderer
 * already receives every agent:state transition — so shipping a count here
 * would put the derivation in the wrong process to no benefit. See M6d's
 * "M7 added no IPC channel" reasoning, which this follows.
 */
export interface WorkspaceRow {
  id: string
  name: string
  panelIds: string[]
  active: boolean
}

/**
 * What a switch hands back. A workspace switch is a SECOND BOOT — the same
 * two facts boot() awaits, in one round trip instead of two.
 *
 * `allPanelIds` spans every workspace, deliberately. The renderer seeds
 * nextIdRef from it, and PanelId doubles as the tmux session name: seeding
 * from the ACTIVE workspace's ids alone would let Cmd+N in one workspace mint
 * an id another workspace is already using, and the second panel to go live
 * would attach to the first one's process.
 */
export interface ActivateResult {
  state: CanvasState
  allPanelIds: string[]
}

/**
 * One workspace as a MERGED cross-workspace view needs it — every workspace
 * at once, each carrying its WHOLE panels rather than WorkspaceRow's
 * panelIds. A rail row only has to render a count; a merged lane has to lay
 * panels out, which needs their rects, cwd and args, not just their ids.
 *
 * `active` mirrors WorkspaceRow's own field rather than a separate "is this
 * where the user currently is" concept — one workspace is flagged active by
 * main, everywhere main describes workspaces, for the same reason.
 */
export interface MergedWorkspace {
  id: string
  name: string
  active: boolean
  panels: PersistedPanel[]
}

/** Mirrors CredentialStore's SetResult / credential-verify's VerifyResult — never a cipher, never a token. */
export type CredentialSetResult =
  | { ok: true; meta: CredentialMeta }
  | { ok: false; reason: string }

export type JiraListResult =
  | { kind: 'items'; items: WorkItem[] }
  | { kind: 'no-credential' | 'invalid-credential' | 'rejected' | 'unavailable' | 'malformed'; reason: string }

/** One row of the palette's preset list. Mirrors PresetRow in the renderer. */
export interface PresetListRow {
  id: string
  name: string
  available: boolean
  builtIn: boolean
  isDefault: boolean
  subtitle: string
}

/** A setting as the palette needs it: its declaration plus its current value. */
export interface SettingRow {
  id: string
  label: string
  description: string
  keywords: string[]
  /** Derived from SettingDef so the two type unions cannot drift apart. */
  type: SettingDef['type']
  value: SettingValue
  category: string
  /**
   * Inclusive bounds for a `number` setting, mirrored from `SettingDef`.
   * Absent for a boolean. The palette needs these to reject an out-of-range
   * edit BEFORE sending it — main's own range check in `setPreference` is the
   * last line of defence for a file it did not write, but a refusal that
   * happens only there is invisible: the palette closes as if the write
   * succeeded, and nothing tells the user their edit was silently dropped.
   */
  min?: number
  max?: number
}

/** Shape of the bridge the preload exposes on window.canvas. */
export interface CanvasBridge {
  pty: {
    create(spec: PanelSpec): Promise<PtyCreateResult>
    write(req: PtyWriteRequest): Promise<void>
    resize(req: PtyResizeRequest): Promise<void>
    kill(panelId: PanelId): Promise<void>
    /**
     * Sessions that survived whatever destroyed the previous renderer. A page
     * reload does not run React cleanup, so the renderer cannot assume its
     * panels are fresh.
     */
    list(): Promise<PtyCreateResult[]>
    /** Each subscribe returns its own unsubscribe, so React effects clean up. */
    onData(listener: (chunk: PtyDataChunk) => void): () => void
    onExit(listener: (info: PtyExitInfo) => void): () => void
  }
  machine: {
    /** Aggregate each terminal PID and its descendants from ONE ps snapshot. */
    sample(targets: MachineCostTarget[]): Promise<MachineCostSnapshot>
  }
  edit: {
    onCopy(listener: () => void): () => void
    onPaste(listener: (text: string) => void): () => void
    onUndo(listener: () => void): () => void
    onRedo(listener: () => void): () => void
  }
  layout: {
    /** Called ONCE, before React mounts. See renderer/main.tsx. */
    load(): Promise<CanvasState>
    save(state: CanvasState): Promise<void>
  }
  canvas: {
    /** Registers the answer to canvas:counts. Returns its own unsubscribe. */
    onCounts(provide: () => { panels: number; running: number }): () => void
    onReset(listener: () => void): () => void
    /** Runs main's existing confirm-then-reset flow. */
    requestReset(): Promise<void>
  }
  preset: {
    /** A menu pick: spawn one panel from this template, now. */
    onSpawn(listener: (template: PresetTemplate) => void): () => void
    /** What Cmd+N should spawn from now on. */
    onDefault(listener: (template: PresetTemplate) => void): () => void
    /**
     * Registers a PROVIDER, not a listener — main asks, the renderer answers.
     * Mirrors canvas.onCounts; returns null when nothing is focused.
     */
    onCapture(provide: () => CapturedPanel | null): () => void
    list(): Promise<PresetListRow[]>
    rename(id: string, name: string): Promise<boolean>
    /** `remove`, not `delete`: `delete` is a reserved word as a method name. */
    remove(id: string): Promise<boolean>
    setDefault(id: string): Promise<void>
    /**
     * Ask main to spawn from this preset. It answers by sending PRESET_SPAWN,
     * the same event a menu pick produces — which is what gives a palette
     * spawn the ordinary undo behaviour rather than a second spawn path.
     */
    spawnById(id: string): Promise<void>
    /** Save THIS panel as a preset. See PRESET_SAVE_PANEL. */
    savePanel(captured: CapturedPanel): Promise<void>
  }
  prompt: {
    list(cwd: string | null): Promise<PromptBridgeRow[]>
    save(name: string, body: string): Promise<void>
    /** False for an id the saved store does not hold — every project id, for one. */
    remove(id: string): Promise<boolean>
  }
  files: {
    /** `path` is absolute and UNEXPANDED `~` is allowed: main resolves it. */
    list: (path: string) => Promise<DirResult>
  }
  session: {
    info(): Promise<SessionBackendInfo>
    /**
     * Live cwd/command updates. Each subscribe returns its own unsubscribe, so
     * a React effect can clean up without stacking listeners.
     */
    onLive(listener: (update: LiveSessionUpdate) => void): () => void
    /**
     * Subagent-set updates for one panel. Each subscribe returns its own
     * unsubscribe, so a React effect can clean up without stacking listeners.
     */
    onSubagents(listener: (update: SubagentUpdate) => void): () => void
    /** What this panel's agent has spent. Fires only on a change. */
    onUsage(listener: (payload: { panelId: PanelId; usage: PanelUsage }) => void): () => void
  }
  settings: {
    list(): Promise<SettingRow[]>
    set(id: string, value: SettingValue): Promise<void>
  }
  agent: {
    /** Per-panel state updates. Each subscribe returns its own unsubscribe. */
    onState(listener: (update: AgentStateUpdate) => void): () => void
    /** Focus counts as reading it. See IPC.AGENT_ACKNOWLEDGE. */
    acknowledge(panelId: PanelId): Promise<void>
  }
  workspace: {
    list(): Promise<WorkspaceRow[]>
    /**
     * `outgoing` is the canvas being left. Resolves null when the id names
     * nothing, having changed nothing.
     */
    activate(id: string, outgoing: CanvasState): Promise<ActivateResult | null>
    create(name: string): Promise<string>
    rename(id: string, name: string): Promise<boolean>
    /** `remove`, not `delete`: `delete` is reserved, as PresetBridge already found. */
    remove(id: string): Promise<boolean>
    /** Every workspace's whole panels at once, for the merged cross-workspace view. */
    merged(): Promise<MergedWorkspace[]>
    /**
     * Relocates panels between workspace records. Touches no session on
     * either side. Null, and nothing changed, when `target` names an unknown
     * workspace id.
     */
    movePanels(
      panelIds: PanelId[],
      target: { workspaceId: string } | { newName: string }
    ): Promise<{ workspaceId: string } | null>
  }
  review: {
    panel(panelId: PanelId): Promise<ReviewResult>
    baseline(panelId: PanelId): Promise<ReviewBaseline | null>
    at(subject: ReviewSubject): Promise<ReviewResult>
    diff(req: ReviewDiffRequest): Promise<ReviewDiff>
    commit(req: ReviewCommitRequest): Promise<ReviewCommitResult>
  }
  /**
   * Metadata only. Deliberately no `get` here — there is no channel that
   * would let it exist, and no bridge member returns a token. See CLAUDE.md.
   */
  credential: {
    list(): Promise<CredentialMeta[]>
    set(req: { service: string; token: string }): Promise<CredentialSetResult>
    remove(service: string): Promise<boolean>
    verify(service: string): Promise<CredentialSetResult>
  }
  jira: { list(): Promise<JiraListResult> }
  file: {
    /** A native open dialog. `null` when the user cancelled. */
    open(): Promise<string | null>
    /** Read and arm the watch. */
    read(req: FileReadRequest): Promise<FileResult>
    /** Disarm. */
    close(panelId: PanelId): Promise<void>
    /**
     * Save. Resolves to a three-armed result: `written`, `stale` (the disk
     * moved underneath the draft — refused, nothing written), or `failed`
     * (the write did not run). Never rejects.
     */
    write(req: FileWriteRequest): Promise<FileWriteResult>
    /**
     * Create a note. Four arms: `created`, `exists` (that name is taken and
     * the existing bytes are UNTOUCHED), `refused` (an empty name, or one
     * resolving outside the root), `failed`. Never rejects.
     */
    create(req: FileCreateRequest): Promise<FileCreateResult>
    /** Returns its own unsubscribe, like every other on* in this bridge. */
    onChanged(listener: (event: FileChangedEvent) => void): () => void
    /**
     * The absolute path of a dropped File.
     *
     * SYNCHRONOUS and not an invoke, because it is a pure main-world helper
     * rather than a main-process call. Electron 43 REMOVED File.path from the
     * renderer: reading `file.path` yields undefined, the mint is skipped, and
     * the drop looks like it did nothing at all — with no error, because
     * undefined is a perfectly ordinary value for a property that does not
     * exist.
     */
    pathForFile(file: File): string
  }
  toolbox: {
    /** Read the inventory for a panel's cwd. Pull-only; see TOOLBOX_READ. */
    read(req: ToolboxReadRequest): Promise<ToolInventoryResult>
    /** One settings file's permission rules, one bucket at a time. */
    permissions(
      req: ToolboxPermissionsRequest
    ): Promise<{ rules: string[]; total: number; status: string }>
  }
  platform: NodeJS.Platform
}
