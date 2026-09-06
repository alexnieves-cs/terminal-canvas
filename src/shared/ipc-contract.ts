import type { WatchTrigger } from './watch-trigger'
import type { RunRow } from './run-ledger'
import type { AgentSessionSpec, AgentCreateResult, SendAnswer, AgentSessionSnapshot, AgentTranscriptResult, AgentSessionEvent, AgentImportRequest, AgentImportResult, ChatAttachment, ClipboardImage, AutoStartRequest, AutoStartResult } from './agent-session'
import type { PermissionAnswer } from './transcript'
import type { OrphanRow } from './orphans'
import type { PanelTextExportResult, CanvasPngExportResult } from './export'
import type { EnvReport } from './env-report'
import type { BrowserReadRequest, BrowserReadResult } from './browser-panel'
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
import type { PersistedTemplate } from './templates'

/** M83. One memory as the renderer reads it. */
/**
 * M83. The newest memories kept per repository — the store's ring cap, and
 * the node's read limit. It lives in the CONTRACT rather than in
 * `main/memory-store.ts` because both sides need it and neither may import
 * the other: a node asking for 100 against a store keeping 500 hides four
 * hundred entries and says nothing (M83's verifier).
 */
export const MEMORY_MAX = 500

/** M84. What a watcher needs to be armed: its id, its command and its trigger. */
export interface WatcherCreateRequest {
  id: string
  cwd: string
  command: string
  args: string[]
  trigger: WatchTrigger
  /** M84. `false` arms nothing: the watcher is known and runnable by hand, and its trigger is off. */
  armed?: boolean
}

/** M85. One note as the pane and the index see it. No bytes beyond the body. */
export interface VaultNoteRow {
  path: string
  title: string
  body: string
  at: number
}

export interface VaultReadResult {
  /** The root as main RESOLVED it — `~` expanded and symlinks followed — which is what every panel path is compared against. */
  root: string
  notes: VaultNoteRow[]
  /** Notes the caps dropped — reported, never silent. */
  skipped: number
  /** Why there is nothing, when there is nothing. */
  reason?: string
}

export type WatcherCreateResult = { ok: true } | { ok: false; reason: string }

/** M84. One watcher's state, as main knows it. `tail` is capped; nothing durable. */
export interface WatcherStateEvent {
  id: string
  status: 'not-started' | 'running' | 'passed' | 'exited'
  exitCode?: number | null
  signal?: string | null
  tail: string
  startedAt?: number
  endedAt?: number
  pending: boolean
  /** The trigger could not be armed, in words the node's body shows. */
  disarmed?: string
}

export interface MemoryEntryRow {
  kind: 'decided' | 'tried' | 'failed' | 'note'
  text: string
  panelId?: string
  at: number
  redacted?: number
}

/** M81. The canvas model `tc status` answers with — the renderer's own words. */
export interface ControlCanvasModel {
  panels: Array<{ id: string; kind: string; title?: string; state: string; cwd?: string; cost?: number }>
  edges: Array<{ from: string; to: string; trigger: string }>
  runs: Array<{ id: string; name: string; outcome: string; panels: number; cost?: number }>
}
import type { SettingDef, SettingValue } from './settings-schema'
import type { RepoStatus, ReviewAcross, ReviewResult, ReviewBaseline, ReviewSubject, ReviewDiff, ReviewDiffRequest, ReviewCommitRequest, ReviewCommitResult, ReviewDiscardRequest, ReviewDiscardResult } from './review'
import type { CredentialMeta } from './credential-schema'
import type { WorkItem, WorkItemTransition } from './work-item'
import type { FileCreateResult, FileResult, FileWriteResult } from './file-panel'
import type { ToolInventoryResult } from './toolbox'
import type { AgentKind, AgentOptions, PanelUsage } from './cost'
import type { DirResult } from './fs-tree'
import type { MachineCostSnapshot, MachineCostTarget } from './machine-cost'

/** M93. A snapshot's metadata: the stamp is the file's name and the restore's key. */
export interface SnapshotMeta { at: number; bytes: number; workspaces: number; panels: number }

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
   * M80. The preset's resolved template WITHOUT spawning — the one thing a
   * template's node needs and only main can answer (an absent `command` is
   * the user's login shell, and that resolution is main's alone). Its
   * absence is why the first cut spawned through `spawn:sheet` and then
   * guessed which panel had arrived.
   */
  PRESET_TEMPLATE: 'preset:template',
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
   * M37. Flag a user preset to spawn in a fresh worktree, or clear it. An
   * invoke for the reason PRESET_RENAME is one: the palette is the renderer's
   * and main owns the store. False for a built-in, which is code.
   */
  PRESET_SET_WORKTREE: 'preset:set-worktree',
  /**
   * M37. Every worktree this app created, with whether a panel still owns
   * it. Pull-only, read on palette open beside credential:list.
   */
  WORKTREE_LIST: 'worktree:list',
  /**
   * M37. `git worktree remove` with NO --force: a dirty tree is refused with
   * git's own sentence and the directory survives. The branch is never
   * deleted here — that is the user's, in git, once merged.
   */
  WORKTREE_REMOVE: 'worktree:remove',
  /** M37. Open the worktree's directory in Finder. A path in a 260px pane is a path nobody can get at. */
  WORKTREE_REVEAL: 'worktree:reveal',
  /**
   * M39. The last N non-empty, ANSI-stripped lines of a panel's durable log,
   * for the dormant card (and, later, a handoff's payload). Pull-only, asked
   * once per card mount: the log is main's and the bytes never cross until
   * something wants to show them.
   */
  SCROLLBACK_TAIL: 'scrollback:tail',
  /** M39. Remove every panel's log. A destructive verb behind the palette's confirm. */
  SCROLLBACK_CLEAR: 'scrollback:clear',
  /**
   * M42. Case-insensitive substring across EVERY panel's durable log, capped.
   * Pull-only like SCROLLBACK_TAIL, and the id list is main's — the handler
   * searches every panel the layout holds, never a renderer-supplied set, so
   * a closed panel's already-dropped log cannot be asked for.
   */
  SCROLLBACK_SEARCH: 'scrollback:search',
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
  /** M80. Saved shapes of work: the list (built-ins first), a save, a delete that refuses a built-in by name. */
  TEMPLATE_LIST: 'template:list',
  TEMPLATE_SAVE: 'template:save',
  TEMPLATE_DELETE: 'template:delete',
  /** M83. The project memory, for the node that renders it and the chat that carries it. */
  /** M85. Every `.md` under the vault root, read in main — the renderer has no fs. */
  VAULT_READ: 'vault:read',
  /** M93. The layout time machine: snapshots of saves, restored as a NEW workspace. */
  SNAPSHOT_LIST: 'snapshot:list',
  SNAPSHOT_RESTORE: 'snapshot:restore',
  MEMORY_LIST: 'memory:list',
  MEMORY_ADD: 'memory:add',
  /**
   * M84. The watcher runtime. `create` is idempotent at an id (a restored
   * canvas re-arms every watcher it holds, and re-arming must not double any
   * trigger); `run` is the manual verb; `stop` kills the run in flight;
   * `dispose` disarms and forgets. State arrives on WATCHER_STATE.
   */
  WATCHER_CREATE: 'watcher:create',
  WATCHER_RUN: 'watcher:run',
  WATCHER_STOP: 'watcher:stop',
  WATCHER_DISPOSE: 'watcher:dispose',
  WATCHER_LIST: 'watcher:list',
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
  /** M86. Where a branch stands against its tracking ref — from the local ref; never a fetch. */
  GIT_STATUS: 'git:status',
  /** M86. The main tree, then every worktree this app created for the root, each with its own diff since its fork. */
  REVIEW_ACROSS: 'review:across',
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
  /**
   * M53. Root-and-baseline addressed like REVIEW_COMMIT, plus the subject
   * panel so main can refuse a shared checkout on its own count. Per file;
   * never undoable; the worktree only.
   */
  REVIEW_DISCARD: 'review:discard',
  /** Metadata only. There is deliberately no credential:get — see CLAUDE.md. */
  CREDENTIAL_LIST: 'credential:list',
  CREDENTIAL_SET: 'credential:set',
  CREDENTIAL_DELETE: 'credential:delete',
  /** Uses the token to make one request; returns what the service said. */
  CREDENTIAL_VERIFY: 'credential:verify',
  /** Main reads the authenticated user's assigned Jira work. */
  JIRA_LIST: 'jira:list',
  /** M88. The issues assigned to you and the pull requests waiting on you, through the injected GitHub client. */
  GITHUB_LIST: 'github:list',
  /** M89. The broker's audit rows, newest first — the FIRST channel that reads the audit; metadata only. */
  BROKER_AUDIT: 'broker:audit',
  /**
   * The legal next states for ONE issue. Its own channel rather than a field
   * on jira:list, because transitions are workflow-defined per issue: folding
   * the read in would fire one request per ticket on every panel load, for
   * tickets nobody transitions. review:diff's pull-only shape, same arithmetic.
   */
  JIRA_TRANSITIONS: 'jira:transitions',
  /**
   * One named mutation, performed by main, behind an explicit human gesture.
   *
   * There are exactly two Jira writes and this is one of them. No agent-
   * reachable path may reach either: an agent lives in a PTY and has no
   * bridge, and nothing that builds a process environment imports the Jira
   * client. That rule has NO RUNTIME SYMPTOM when broken, so verify:meta 22
   * and 23 pin it as source text. See CLAUDE.md.
   */
  JIRA_COMMENT: 'jira:comment',
  /** The second, and last, Jira write. See JIRA_COMMENT. */
  JIRA_TRANSITION: 'jira:transition',
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
   */
  FILE_CREATE: 'file:create',
  /**
   * Backlog #75: the one number the renderer cannot compute itself — main's
   * own IPC send rate. Pull-only, like MACHINE_COST_SAMPLE, for the identical
   * reason: main has no cause to track this when the diagnostics overlay is
   * closed and nobody is asking.
   */
  DIAGNOSTICS_SAMPLE: 'diagnostics:sample',
  /**
   * Write the renderer's already-scrubbed diagnostics bundle to disk. The
   * renderer assembles the whole payload (see diagnostics-model.ts's own
   * comment on what it deliberately omits — no command, no cwd, no captured
   * shell environment); main's only job here is the atomic write, the same
   * split credential-store.ts and layout-store.ts already draw between "who
   * decides what's safe" and "who writes the file".
   */
  DIAGNOSTICS_EXPORT: 'diagnostics:export',
  /** M58. A panel's durable log as text, stripped and scrubbed, through a save dialog. */
  EXPORT_PANEL_TEXT: 'export:panel-text',
  /** M58. The composited frame as PNG, through a save dialog. */
  EXPORT_CANVAS_PNG: 'export:canvas-png',
  /** M48. The environment report: what main found at startup, key names only. */
  ENV_REPORT: 'env:report',
  /** M51. Open a Cmd-clicked path or URL — only main opens anything. */
  LINK_OPEN: 'link:open',
  /** M52. A panel's recent runs from the ledger, newest first. */
  LEDGER_LIST: 'ledger:list',
  /**
   * M65. The spawn sheet: main resolves a preset (absent command included)
   * or a typed command into a template, refuses a directory that does not
   * exist, and sends PRESET_SPAWN — the same path the menu takes — so a
   * sheet spawn and a menu spawn cannot drift. `spawn:recent` is the last
   * twelve spawn directories main recorded, for the sheet's suggestions.
   */
  SPAWN_SHEET: 'spawn:sheet',
  SPAWN_RECENT: 'spawn:recent',
  /**
   * M73. The agent-session runtime (M71) reached from the chat panel. Every
   * verb is keyed by the PANEL id the renderer minted — main never mints one
   * — and every answer is a snapshot or a named refusal. `agent:transcript`
   * reads the durable file this app writes plus the live snapshot, which is
   * what a restored panel renders before any process exists. Deltas and
   * turns arrive on AGENT_EVENT, already batched at 16ms by the manager.
   */
  AGENT_CREATE: 'agent:create',
  AGENT_SEND: 'agent:send',
  AGENT_INTERRUPT: 'agent:interrupt',
  AGENT_DISPOSE: 'agent:dispose',
  AGENT_ANSWER: 'agent:answer',
  AGENT_LIST: 'agent:list',
  AGENT_TRANSCRIPT: 'agent:transcript',
  /**
   * M74. Open a terminal's Claude session as a chat: main reads the CLI's own
   * transcript for the terminal's pinned session into the app's file under
   * the NEW panel id, or refuses by name (the terminal is live; it was never
   * pinned; the CLI has not written the file yet).
   */
  AGENT_IMPORT: 'agent:import',
  /** M75. The clipboard's image, for a ⌘V that carried no text. Main's `clipboard.readImage()`. */
  AGENT_CLIPBOARD_IMAGE: 'agent:clipboard-image',
  /** M97. A bounded auto run on a chat: main counts, main stops. */
  AGENT_AUTO_START: 'agent:auto-start',
  AGENT_AUTO_STOP: 'agent:auto-stop',
  /**
   * M98. Session grants — `Allow for session`. The grant itself rides
   * `agent:answer`'s `scope`; these two read the granted tools for a panel
   * and drop them. Main holds them in memory only (never a file), so a
   * relaunch asks again.
   */
  AGENT_GRANTS: 'agent:grants',
  AGENT_REVOKE_GRANTS: 'agent:revoke-grants',
  /**
   * M103. The browser pane's text, read in MAIN: the scheme is checked on
   * the guest's LIVE url (not the record's, not only at navigation), the
   * text is capped inside the guest, and it passes the outward gate before
   * it crosses back. Reading the pane is leaving the app.
   */
  BROWSER_READ: 'browser:read'
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
  /**
   * M81. `tc status`'s model, asked of the renderer on the SAME ephemeral
   * reply-channel shape CANVAS_COUNTS uses — an event, never an invoke, so
   * verify:ipc's "every channel has a handler" rule does not (and should
   * not) cover it.
   */
  CANVAS_MODEL: 'canvas:model',
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
   * M43. Main -> renderer: an OS notification for a waiting panel was clicked.
   * The renderer frames that panel through goToPanel — the Cmd+J path, which
   * never wakes. An EVENT, not an invoke, so verify:ipc's channel count is
   * unmoved (it counts INVOKE channels only).
   */
  ATTENTION_JUMP: 'attention:jump',
  /**
   * M45. Main wrote a setting — from the palette's invoke OR the menu's
   * radio/checkbox, which the renderer otherwise never hears about. The
   * renderer re-reads the list; the payload is the id, for a listener that
   * wants to skip an unrelated write.
   */
  SETTINGS_CHANGED: 'settings:changed',
  /** M65. The menu's ⌘⇧N: open the spawn sheet. An event, not an invoke, like every menu verb. */
  SPAWN_OPEN_SHEET: 'spawn:open-sheet',
  /**
   * M73. One agent-session event, tagged with its panel id. A SEND, not an
   * invoke, for the reason PTY_DATA is: main owns the process and pushes what
   * it says; the renderer never polls. Batched at the manager (16ms), so a
   * token never costs a render.
   */
  AGENT_EVENT: 'agent:event',
  /** M84. One watcher's state, sent as it changes (the tail is batched by the runner's own flush). */
  WATCHER_STATE: 'watcher:state',
  /** M85. Something under the vault root changed (debounced in main); the renderer re-reads. */
  VAULT_CHANGED: 'vault:changed',
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
   * M55. Sent once after the user answered Restore to the boot dialog: the
   * orphan sessions the renderer should adopt as panels under their own ids.
   * Never sent silently — no dialog, no send.
   */
  SESSION_RECOVER: 'session:recover',
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
 * Backlog #75. `registry.all()` only ever holds TERMINAL sessions — a review,
 * file, jira or toolbox panel never reaches `assignTiers`/`registry.ensure`
 * at all — so there is no `kind` field here: every row is a terminal panel's
 * session by construction. `pid` is present only for a running session, the
 * same rule PtyCreateResult/PanelStatus already draw.
 *
 * What this type deliberately has NO ROOM for is the point of it: no
 * `command`, `cwd` or `args`, and nothing derived from shell-env.ts's
 * captured environment. See renderer/canvas/diagnostics-model.ts, the one
 * place that builds this shape, for the reasoning — structural exclusion
 * rather than a runtime scrub, so a future field added to PanelSession
 * cannot leak through here by way of a spread.
 */
export interface DiagnosticsSessionRow {
  id: string
  tier: 'live' | 'card'
  dormant: boolean
  spawned: boolean
  status: 'idle' | 'starting' | 'running' | 'exited' | 'error'
  pid?: number
}

/** The whole bundle the overlay renders and the export writes to disk. */
export interface DiagnosticsSnapshot {
  liveCount: number
  heldCount: number
  budget: number
  backend: SessionBackendInfo | null
  ipcMessagesPerSecond: number | null
  sessions: DiagnosticsSessionRow[]
}

export type DiagnosticsExportResult =
  | { ok: true; path: string }
  | { ok: false; reason: string }

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
  /** M37. Spawn in a fresh git worktree. Absent means no; see PanelSpec.worktree. */
  worktree?: boolean
  /** M65. A title the sheet chose (a typed task's command, or the user's word). Absent otherwise. */
  title?: string
  /** M65. Focus the new panel: a sheet spawn is a user-initiated one, and focus is what promotes it live. */
  focus?: true
}

/** M65. What the spawn sheet submits. Exactly one of presetId / command. */
export interface SpawnRequest {
  presetId?: string
  /** A one-off task, run as `/bin/sh -lc <command>` and titled with itself. */
  command?: string
  /** UNEXPANDED: main expands `~` and refuses a directory that does not exist. */
  cwd: string
  title?: string
  agentOptions?: AgentOptions
  worktree?: boolean
}
export type SpawnResult = { kind: 'spawned' } | { kind: 'refused'; reason: string }

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
  /** M37. The captured panel asked for a worktree, so the preset it becomes does too. */
  worktree?: boolean
}

/** One row of the palette's prompt list. Mirrors PromptListRow in main. */
/** M42. One search hit: the panel, the matching line (ANSI-stripped) and its line index. */
export interface ScrollbackSearchHit {
  panelId: PanelId
  line: string
  lineIndex: number
}

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

/** M89. One broker audit row on the wire — metadata, never a body or a token. */
export interface BrokerAuditRowWire {
  at: number
  service: string
  method: string
  path: string
  status: number
  bytes: number
  panelId?: string
  reason?: string
}

/** M88. GitHub's list, to Jira's shape; `note` says which half is missing when the PR search alone failed. */
export type GithubListResult =
  | { kind: 'items'; items: WorkItem[]; note?: string }
  | { kind: 'no-credential' | 'rejected' | 'unavailable' | 'malformed'; reason: string }

export type JiraListResult =
  | { kind: 'items'; items: WorkItem[] }
  | { kind: 'no-credential' | 'invalid-credential' | 'rejected' | 'unavailable' | 'malformed'; reason: string }

export type JiraTransitionsResult =
  | { kind: 'transitions'; transitions: WorkItemTransition[] }
  | { kind: 'no-credential' | 'invalid-credential' | 'rejected' | 'refused' | 'unavailable' | 'malformed'; reason: string }

/** `refused` is the board saying no; `unavailable` is Jira being unreachable. Two fixes, two arms. */
export type JiraWriteResult =
  | { kind: 'done' }
  | { kind: 'no-credential' | 'invalid-credential' | 'rejected' | 'refused' | 'unavailable' | 'malformed'; reason: string }

/** One row of the palette's preset list. Mirrors PresetRow in the renderer. */
export interface PresetListRow {
  id: string
  name: string
  available: boolean
  builtIn: boolean
  isDefault: boolean
  subtitle: string
  /** M37. Spawns in a fresh worktree. Absent means no. */
  worktree?: boolean
  /** M65. The preset's agent kind, so the spawn sheet shows mode/effort/model only for one. Absent for a shell. */
  agent?: AgentKind
  /** M65. The preset's own directory, the sheet's default `where` when no panel is focused. */
  cwd: string
  /** M65. The preset's own agent options, so the sheet can show them as the resolved defaults. */
  agentOptions?: AgentOptions
}

/**
 * M37. One worktree this app created, as the palette needs it. `attached` is
 * COMPUTED by main at list time — the record's panelId is in some workspace's
 * panel list — never stored; see WorktreeRecord for why a record outlives its
 * panel. `panelTitle` is that panel's honest label when attached.
 */
export interface WorktreeListRow {
  id: string
  branch: string
  path: string
  root: string
  createdAt: number
  panelId: string
  attached: boolean
  panelTitle?: string
  /** M86. `branch · ahead N · behind M` from the local tracking ref, or `· no upstream`; absent when git could not say. Filled by the renderer, never by main's list. */
  status?: string
}

export type WorktreeRemoveResult =
  | { kind: 'removed' }
  | { kind: 'refused'; reason: string }
  | { kind: 'failed'; reason: string }
  | { kind: 'unknown' }

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
  /** The legal values of an `enum` setting, in cycle order. Absent for other types. */
  values?: string[]
  /**
   * M46. Whether the user has ever SET this — the sparse map holds a key for
   * it — as against `value` merely being the schema default. The shell's
   * regions read it: absent means the breakpoint decides, present means the
   * user won at every width.
   */
  persisted: boolean
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
    /** M81. The canvas model for `tc status`. Same ephemeral-reply shape as onCounts. */
    onModel(provide: () => ControlCanvasModel): () => void
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
    /** M80. The preset's resolved template, or null when the id names nothing. */
    template(id: string): Promise<PresetTemplate | null>
    /** Save THIS panel as a preset. See PRESET_SAVE_PANEL. */
    savePanel(captured: CapturedPanel): Promise<void>
    /** M37. See PRESET_SET_WORKTREE. False for a built-in or an unknown id. */
    setWorktree(id: string, on: boolean): Promise<boolean>
  }
  /** M37. See WORKTREE_LIST / WORKTREE_REMOVE / WORKTREE_REVEAL. */
  worktree: {
    list(): Promise<WorktreeListRow[]>
    remove(id: string): Promise<WorktreeRemoveResult>
    /** False when the id names nothing. */
    reveal(id: string): Promise<boolean>
  }
  /** M39. See SCROLLBACK_TAIL / SCROLLBACK_CLEAR. */
  scrollback: {
    /** [] for a panel with no log, including when persistence is off. */
    tail(req: { panelId: PanelId; lines: number }): Promise<string[]>
    clear(): Promise<void>
    /** M42. Hits across every panel's log, newest-first within a panel, capped. [] for an empty query. */
    search(query: string): Promise<ScrollbackSearchHit[]>
  }
  /** M83. The project memory: what this repository has decided, tried and failed. */
  memory: {
    list(root: string, limit: number): Promise<{ root: string; entries: MemoryEntryRow[]; skipped: number }>
    /** Refused BY NAME for an unusable kind or empty text; every write is scrubbed. */
    add(req: { root: string; kind: string; text: string; panelId?: string }): Promise<{ ok: true } | { ok: false; reason: string }>
  }
  /** M80. Templates: a shape of work saved once and instantiated with its parameters filled. */
  template: {
    list(): Promise<PersistedTemplate[]>
    /** The template as saved, with its minted id. */
    save(template: Omit<PersistedTemplate, 'id'> & { id?: string }): Promise<PersistedTemplate>
    /** False for an id the saved store does not hold — every built-in id, for one. */
    remove(id: string): Promise<boolean>
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
  ledger: {
    /** M52. The run ledger's rows for a panel, newest first: what it ran and how each ended. No output bytes. */
    list(panelId: string, limit: number): Promise<RunRow[]>
  }
  /** M73. The agent-session runtime. `agent` below is the older agent-STATE surface (M6c/M6d); the two are different facts. */
  agentSession: {
    /** M73. Idempotent at an id; spawns nothing. Refuses by name (no such directory; claude not found). */
    create(spec: AgentSessionSpec): Promise<AgentCreateResult>
    /** Writes one user turn; queues it if one is in flight; respawns after an exit. M75: with attachments, resolved in main; a refusal names the one that could not go and nothing is sent. */
    send(id: string, text: string, attachments?: ChatAttachment[]): Promise<SendAnswer>
    /** M75. See AGENT_CLIPBOARD_IMAGE. */
    clipboardImage(): Promise<ClipboardImage>
    /** True when a request was written; false with no turn in flight. */
    interrupt(id: string): Promise<boolean>
    /** `drop`: also remove the durable transcript (an explicit close, never a quit). */
    dispose(req: { id: string; drop: boolean }): Promise<void>
    /** M98. `scope: 'session'` on an allow also grants the tool for the rest of the session — main grants, then answers. */
    answer(req: { id: string; requestId: string; answer: PermissionAnswer; scope?: 'session' }): Promise<boolean>
    list(): Promise<AgentSessionSnapshot[]>
    transcript(id: string): Promise<AgentTranscriptResult>
    /** M74. See AGENT_IMPORT. */
    importSession(req: AgentImportRequest): Promise<AgentImportResult>
    onEvent(listener: (event: AgentSessionEvent) => void): () => void
    /** M97. Start a bounded run; refused by name (no session, one already live, codex without a marker contract is allowed). */
    autoStart(req: AutoStartRequest): Promise<AutoStartResult>
    /** M97. True when a run was live and is now stopped (its turn in flight interrupted). */
    autoStop(id: string): Promise<boolean>
    /** M98. See AGENT_GRANTS: the tools granted for this session, in grant order. */
    grants(id: string): Promise<string[]>
    /** M98. See AGENT_REVOKE_GRANTS. */
    revokeGrants(id: string): Promise<void>
  }
  /** M85. The vault: a folder of markdown notes, read in main. */
  snapshot: {
    /** M93. Every snapshot of a save, newest first: its stamp, size and counts. */
    list(): Promise<SnapshotMeta[]>
    /** M93. Mint a NEW workspace from the snapshot's active one; the current workspace is never touched. The renderer switches to the id. */
    restore(at: number, afterId?: number): Promise<{ kind: 'restored'; workspaceId: string } | { kind: 'refused'; reason: string }>
  }
  vault: {
    /** Every `.md` under `root`, newest first, with what the caps dropped. An absent root answers empty WITH ITS REASON. */
    read(root: string): Promise<VaultReadResult>
    /** M85. Fired after main's own watch on the root sees a change — the pane refreshes with no gesture. */
    onChanged(listener: () => void): () => void
  }
  /** M84. The watcher runtime: a command run on a trigger, with no PTY. */
  watcher: {
    /** Idempotent at an id: re-arming a restored watcher must not double its trigger. Refuses by name (no such directory; a trigger that cannot be armed). */
    create(req: WatcherCreateRequest): Promise<WatcherCreateResult>
    /** Run now, whatever the trigger says. */
    run(id: string): Promise<void>
    /** Stop the run in flight; nothing if none is. */
    stop(id: string): Promise<void>
    dispose(id: string): Promise<void>
    list(): Promise<WatcherStateEvent[]>
    onState(listener: (event: WatcherStateEvent) => void): () => void
  }
  spawn: {
    /** M65. See SPAWN_SHEET. Refuses with a reason rather than spawning into a directory that is not there. */
    sheet(req: SpawnRequest): Promise<SpawnResult>
    /** M65. The last twelve spawn directories, newest first. */
    recent(): Promise<string[]>
    /** M65. The menu's ⌘⇧N. */
    onOpenSheet(listener: () => void): () => void
  }
  links: {
    /** M51. The text the terminal underlined and the panel it came from; main resolves and opens, or refuses with a reason. */
    open(req: { panelId: string; target: string }): Promise<{ kind: 'opened' | 'refused'; reason?: string }>
  }
  env: {
    /** M48. The startup probe's facts — PATH entries, each CLI found or absent, tmux, the layout file. Names, never values. */
    report(): Promise<EnvReport>
  }
  export: {
    panelText(panelId: PanelId): Promise<PanelTextExportResult>
    canvasPng(): Promise<CanvasPngExportResult>
  }
  diagnostics: {
    /** Main's own numbers only — the IPC send rate. Everything else in the
     * overlay's snapshot is assembled renderer-side from the registry. */
    sample(): Promise<{ ipcMessagesPerSecond: number }>
    /** Write the renderer's already-scrubbed bundle to disk. */
    export(snapshot: DiagnosticsSnapshot): Promise<DiagnosticsExportResult>
  }
  session: {
    info(): Promise<SessionBackendInfo>
    /**
     * Live cwd/command updates. Each subscribe returns its own unsubscribe, so
     * a React effect can clean up without stacking listeners.
     */
    onLive(listener: (update: LiveSessionUpdate) => void): () => void
    /** M55. Orphan sessions the user chose to restore; adopt each under its own id. */
    onRecover(listener: (rows: OrphanRow[]) => void): () => void
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
    /** M45. Fires after ANY write, whichever surface made it. */
    onChanged(listener: (id: string) => void): () => void
  }
  agent: {
    /** Per-panel state updates. Each subscribe returns its own unsubscribe. */
    onState(listener: (update: AgentStateUpdate) => void): () => void
    /** Focus counts as reading it. See IPC.AGENT_ACKNOWLEDGE. */
    acknowledge(panelId: PanelId): Promise<void>
    /** M43. A clicked OS notification asks the renderer to frame this panel (never wakes). */
    onAttentionJump(listener: (panelId: PanelId) => void): () => void
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
    discard(req: ReviewDiscardRequest): Promise<ReviewDiscardResult>
    /** M86. See REVIEW_ACROSS. */
    across(root: string): Promise<ReviewAcross>
  }
  /** M86. See GIT_STATUS. */
  git: {
    status(root: string): Promise<RepoStatus>
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
  /** M89. See BROKER_AUDIT. */
  broker: {
    audit(limit: number, service?: string): Promise<{ rows: BrokerAuditRowWire[]; skipped: number }>
  }
  /** M88. See GITHUB_LIST. */
  github: {
    /** `panelId` names the asking panel in the broker's audit rows. */
    list(panelId?: string): Promise<GithubListResult>
  }
  jira: {
    list(): Promise<JiraListResult>
    transitions(itemId: string): Promise<JiraTransitionsResult>
    comment(req: { itemId: string; body: string }): Promise<JiraWriteResult>
    transition(req: { itemId: string; transitionId: string }): Promise<JiraWriteResult>
  }
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
  /** M103. See BROWSER_READ. Three arms; never rejects. */
  browser: {
    read(req: BrowserReadRequest): Promise<BrowserReadResult>
  }
  platform: NodeJS.Platform
}
