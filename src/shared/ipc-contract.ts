import type { AgentPlanReply, AgentPlanRequest } from './plan'
import type { TaskEvidence, TaskEvidenceRequest, TaskExportResult, TaskIndexRow } from './task-deliverables'
import type { LastExit } from './persistence'
import type { CheckOutputRead } from './check-output'
import type { CombineRunResult } from './combine'
import type { CombineInputsResult, IntegrateRequest, IntegrateResult, IntegrationReceipt } from './integration'
import type { LaneMergeRequest, LaneMergeResult } from './lane-merge'
import type { PrepareResult, RepoSetup } from './repo-setup'
import type { EditorOpenResult, EditorTarget } from './editor-open'
import type { Recipe } from './recipes'
import type { ImageResult, StarterFiles } from './starter'
import type { TemplateSaveResult } from './templates'
import type { WatchTrigger } from './watch-trigger'
import type { EventRow, RunRow, TimelineFilter, TimelineRead, UsageRow } from './run-ledger'
import type { ReviewIdentity } from './review-identity'
import type { AgentSessionSpec, AgentCreateResult, SendAnswer, AgentSessionSnapshot, AgentTranscriptResult, AgentSessionEvent, AgentImportRequest, AgentImportResult, ChatAttachment, ClipboardImage, AutoStartRequest, AutoStartResult, QueueEditRequest, CorrectionAnswer } from './agent-session'
import type { PermissionAnswer } from './transcript'
import type { OrphanRow } from './orphans'
import type { PanelTextExportRequest, PanelTextExportResult, CanvasPngExportResult, DeckPdfExportRequest, DeckPdfExportResult } from './export'
import type { DeckExportRequest, DeckExportResult } from './deck-pptx'
import type { FlowchartExportRequest, FlowchartExportResult, FlowchartReadRequest, FlowchartReadResult } from './flowchart-files'
import type { ToolGenerateRequest, ToolGenerateResult } from './tool-spec'
import type { EnvReport } from './env-report'
import type { BrowserReadRequest, BrowserReadResult } from './browser-panel'
import type { Discovery as PreviewDiscovery } from './preview'
import type { Trail } from './skill-trail'
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
import type { PersistedTeammate } from './teammates'
import type { PersistedRoutine } from './routines'
import type { Shelf, PluginDetailsResult } from './skills'

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
  /** M286. What the last run tested — the tree's content identity against its HEAD as the run ended. Absent when unreadable. */
  tested?: ReviewIdentity
  /** M306. The run's exact-output record id (`check:output`), set as the run starts. */
  outputId?: string
}

export interface MemoryEntryRow {
  kind: 'decided' | 'tried' | 'failed' | 'note'
  text: string
  panelId?: string
  at: number
  redacted?: number
  source?: { conversationId: string; turnId: string; taskId?: string; acceptedAt: number }
}

/** M81. The canvas model `tc status` answers with — the renderer's own words. */
export interface ControlCanvasModel {
  /** M366. `toolsCwd`: the directory the inspector's Tools rule reads (`inspectionDirectory`), absent when it has none. */
  panels: Array<{ id: string; kind: string; title?: string; state: string; cwd?: string; toolsCwd?: string; cost?: number }>
  edges: Array<{ from: string; to: string; trigger: string }>
  runs: Array<{ id: string; name: string; outcome: string; panels: number; cost?: number }>
}
import type { SettingDef, SettingValue } from './settings-schema'
import type { RepoStatus, ReviewAcross, ReviewResult, ReviewBaseline, ReviewSubject, ReviewDiff, ReviewDiffRequest, ReviewCommitRequest, ReviewCommitResult, ReviewDiscardRequest, ReviewDiscardResult , LaneStatus } from './review'
import type { CredentialMeta } from './credential-schema'
import type { AccountLoginResult, AccountLogoutResult, AccountSessionMeta, AccountStatus, AccountUseResult, ShareListResult, ShareMemberResult, ShareMembersResult, ShareResult } from './account'
import type { CanvasOp, CanvasSharedView, SharedSaveMeta, SharedTextOpen, SharedTextPush, Verdict, WorkspaceRole } from './canvas-ops'
import type { LocalPresence, PresenceRoster } from './presence'
import type { RelayControlState, RelayRole, RelaySessionMeta } from './relay-protocol'
import type { TeamListResult, TeamObserved, TeamObserveRequest } from './team'
import type { TeamAskRow } from './team-asks'
/** M377. One person's answer to one team ask: allow once, or deny. */
export interface TeamAskAnswerRequest { workspaceId: string; askId: string; answer: 'allow' | 'deny' }
import type { WorkItem, WorkItemTransition } from './work-item'
import type { FileCreateResult, FileResult, FileWriteResult } from './file-panel'
import type { ToolInventoryResult } from './toolbox'
import type { ReadStamp, SkillWriteResult } from './skill-edit'
import type { AgentKind, AgentOptions, PanelUsage } from './cost'
import type { DirResult } from './fs-tree'
import type { MachineCostSnapshot, MachineCostTarget } from './machine-cost'
import type { PoolNode } from './workflow-nodes'
import type { JobAccount, RecoveryChoice } from './job-journal'

/** M93. A snapshot's metadata: the stamp is the file's name and the restore's key. */
export interface SnapshotMeta { at: number; bytes: number; workspaces: number; panels: number }

/** Renderer -> main, request/response via ipcRenderer.invoke. */
/** M145. See ATTACHMENT_CLIPBOARD_FILE. Three arms, never two. */
export type ClipboardFile = { kind: 'ok'; path: string } | { kind: 'empty' } | { kind: 'failed'; why: string }

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
  /** Brief #20. Which panels had a session when the window last went away — once. */
  SESSION_LAST_EXIT: 'session:last-exit',
  /**
   * M316. The pool's jobs a person should hear about — interrupted,
   * incomplete, refused, or live in this process after the window came back —
   * each reconciled against live workers, transcripts and the repository
   * before it is described (main/job-recovery.ts).
   */
  JOB_LIST: 'job:list',
  /**
   * M316. One recovery choice for one job: reconnect, continue, retry (named
   * items only when any was sent and did not finish) or abandon. A finished
   * item is never run again, and every refusal is named.
   */
  JOB_RECOVER: 'job:recover',
  /**
   * M320. A task's deliverables, as main can read them: its timeline rows (by
   * item) and its panels' check runs, each check's recorded facts (never its
   * output text), the files its reviews named probed under the lane root
   * (exists, digest now), the receipts that include it, and which captures
   * are still on disk. The renderer assembles and judges (task-deliverables.ts).
   */
  TASK_EVIDENCE: 'task:evidence',
  /** M320. What search can match per task beyond its card: check commands, reviewed paths, capture titles — references only. */
  TASK_EVIDENCE_INDEX: 'task:evidence-index',
  /** M320. The concise task hand-off, through the outward gate, to a file the person names in the save dialog. */
  TASK_EXPORT_HANDOFF: 'task:export-handoff',
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
  /** Backlog #86. The repository root a directory is inside, or null — so a file or toolbox header reads `repo/src`, not the last two segments. */
  GIT_ROOT: 'git:root',
  /** M86. The main tree, then every worktree this app created for the root, each with its own diff since its fork. */
  REVIEW_ACROSS: 'review:across',
  /**
   * M286. The subject's content identity NOW against a base (M285's policy),
   * so the workbench can bind a recorded check to what stands today. A pull,
   * like every review:* channel, and null when git could not answer — the
   * renderer never computes one of these itself.
   */
  REVIEW_IDENTITY: 'review:identity',
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
  /**
   * The Terminal Canvas account (a Supabase session signed in through GitHub).
   * Metadata only, like credential:* — a session's tokens stay in main's
   * credential store and no member of the bridge returns one. `login` opens
   * the browser and resolves when the loopback callback lands (or times out).
   */
  AUTH_LOGIN: 'auth:login',
  /** Signs out one GitHub account on this Mac, or every one when none is named. */
  AUTH_LOGOUT: 'auth:logout',
  /** The accounts signed in on this Mac, the active one first (the person's choice, else the newest). */
  AUTH_SESSIONS: 'auth:sessions',
  /** M336. Make one signed-in account the active one. This Mac's choice; no network. */
  AUTH_USE: 'auth:use',
  /** M336. Whether accounts are configured here, so the account menu can say why before sign-in refuses. */
  AUTH_STATUS: 'auth:status',
  /**
   * Presence (shared/presence.ts). The renderer's own facts — cursor,
   * viewport, selection, focused panel, mode — for one workspace, already
   * throttled to PRESENCE_RENDER_HZ. Main adds identity and agent status and
   * publishes them as that workspace's Yjs awareness.
   */
  PRESENCE_LOCAL: 'presence:local',
  /** Every workspace's roster now, for a renderer that just loaded; afterwards PRESENCE_REMOTE pushes. */
  PRESENCE_ROSTERS: 'presence:rosters',
  /**
   * The Team view (shared/team.ts): the org's members, presence rows and
   * recent activity, read through the account's session in main. Metadata
   * only — the token stays in main (account.ts's rule).
   */
  TEAM_LIST: 'team:list',
  /**
   * Observer mode: attach READ-ONLY to one member's workspace — main joins
   * that workspace's Y.Doc, publishes itself as an observer (so the person
   * sees who is watching), and pushes TEAM_OBSERVED. Null detaches.
   */
  TEAM_OBSERVE: 'team:observe',
  /**
   * M377. The team's asks this person may answer: every open permission
   * request a teammate's agent routed to the team (M376) in a shared
   * workspace they may edit, not yet answered by them. Read-only.
   */
  TEAM_ASKS: 'team:asks',
  /**
   * M377. This person's answer to one team ask — allow once, or deny —
   * written to the workspace doc in THEIR name by main (the collab server
   * refuses any other name). Never a standing grant: that is the agent
   * owner's alone.
   */
  TEAM_ASK_ANSWER: 'team:ask-answer',
  /**
   * The shared canvas (presence/canvas-sync.ts). One write-through op from a
   * gesture on the ACTIVE workspace — a move/resize as it happens, or removing
   * a placeholder — authorised against this person's workspace role before it
   * reaches the doc. Answers the verdict; a refused move is snapped back by a
   * CANVAS_SHARED push. Inert (ok) on a workspace that is not shared.
   */
  CANVAS_OP: 'canvas:op',
  /** The active workspace's shared view now, or null — for a renderer that just loaded. */
  CANVAS_SHARED_VIEW: 'canvas:shared-view',
  /** Share the ACTIVE workspace into an organization (Supabase workspace_shares); this person becomes its owner. */
  WORKSPACE_SHARE: 'workspace:share',
  /** The shares this person is a member of. */
  WORKSPACE_SHARES: 'workspace:shares',
  /** Open a share as a new local workspace bound to its room. Does not activate it, like workspace:create. */
  WORKSPACE_OPEN_SHARE: 'workspace:open-share',
  /** The share's owner sets a member's role (editor/viewer), or removes them. */
  WORKSPACE_SHARE_MEMBER: 'workspace:share-member',
  /** M337. The share's organization's people with their role in the share — what the owner's role picker lists. */
  WORKSPACE_SHARE_MEMBERS: 'workspace:share-members',
  /**
   * Shared text (canvas-sync.ts's header): the renderer opens a REPLICA of a
   * shared workspace's doc for y-monaco — the doc's state now, then TEXT_REMOTE
   * pushes. Null when the workspace is not shared or its room is not open.
   */
  TEXT_OPEN: 'text:open',
  /** The renderer's last shared editor on a workspace closed: stop pushing to it. */
  TEXT_CLOSE: 'text:close',
  /**
   * One update from the replica, gated in main like the collab server gates
   * main's: inspectUpdate, then authorizeCanvasOp, and only file-create and
   * text-edit pass. A refusal means the replica diverged and re-opens.
   */
  TEXT_UPDATE: 'text:update',
  /**
   * The pty relay (main/relay/relay-client.ts → server/relay on the team's VM):
   * a terminal whose process runs on the relay, not on this Mac. Main holds the
   * socket and the token; the renderer sends keystrokes and gets RELAY_DATA and
   * RELAY_STATE. Spawn names an ALLOWLISTED program — the relay's programs.json
   * decides what that runs, and no path or argv ever crosses this bridge.
   */
  RELAY_SPAWN: 'relay:spawn',
  /** Attach a panel to an existing relay session (a teammate's, shared through a workspace). */
  RELAY_ATTACH: 'relay:attach',
  RELAY_DETACH: 'relay:detach',
  /** Keystrokes. Gated in main on the control state, and again per frame by the relay. */
  RELAY_INPUT: 'relay:input',
  /** Only the controller's resize is sent; everyone else renders at the controller's size. */
  RELAY_RESIZE: 'relay:resize',
  /** request / release / revoke, or grant / deny a named person. */
  RELAY_CONTROL: 'relay:control',
  RELAY_KILL: 'relay:kill',
  /** The relay sessions this person owns. */
  RELAY_LIST: 'relay:list',
  /** A panel's view now, and a full replay pushed after it — for a renderer that just (re)loaded. */
  RELAY_VIEW: 'relay:view',
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
  /** M248. A deck file to PDF, one 16:9 page per slide, through a save dialog. */
  EXPORT_DECK_PDF: 'export:deck-pdf',
  /**
   * A flowchart's Mermaid or SVG TEXT to a file the person chooses. Text, so it
   * passes the outward gate and reports its scrub count (unlike the canvas PNG,
   * the one ungated door); an SVG carrying script, a link or an embedded
   * picture is refused before the sheet opens. Never rejects.
   */
  EXPORT_FLOWCHART: 'export:flowchart',
  /** M251. A Markdown deck as .pptx, scrubbed field by field, through a save dialog. */
  DECK_EXPORT_PPTX: 'deck:export-pptx',
  /**
   * M252. Describe a tool: ONE headless agent run with no tools, whose reply
   * becomes a workflow template or a mini app's files — which arrive INERT.
   * Main runs it because main owns every process; the renderer decides what
   * to make of the answer and marks it unreviewed.
   */
  TOOL_GENERATE: 'tool:generate',
  /** M48. The environment report: what main found at startup, key names only. */
  ENV_REPORT: 'env:report',
  /** M51. Open a Cmd-clicked path or URL — only main opens anything. */
  LINK_OPEN: 'link:open',
  /** M52. A panel's recent runs from the ledger, newest first. */
  LEDGER_LIST: 'ledger:list',
  /** M142. This week's usage rows from the run ledger, priced in the renderer. */
  LEDGER_USAGE: 'ledger:usage',
  /**
   * M300. Orchestrate's durable record, for one subject, newest first —
   * command outcomes, durable events and any gap the trim left, merged.
   * READ ONLY: nothing on this channel re-runs anything, which is the plan's
   * "event inspection is read-only" made structural rather than promised.
   */
  LEDGER_TIMELINE: 'ledger:timeline',
  /**
   * M300. Append ONE durable event. The renderer owns the facts main cannot
   * see — a handoff's outcome, the artifact a task produced — so it needs a
   * door; main owns the file, the queue and the trim, so the door is an
   * append and nothing else. It cannot delete, edit or re-order a row, and a
   * row it writes carries the `source` the caller names rather than one main
   * infers.
   */
  LEDGER_EVENT: 'ledger:event',
  /**
   * M306. ONE check run's exact output record, by the `outputId` its ledger
   * row or watcher state carries. A pull, read-only, and the id is validated
   * against a closed alphabet before main turns it into a path.
   */
  CHECK_OUTPUT: 'check:output',
  /**
   * M311. Apply the named lanes, in order, into ONE scratch checkout beside
   * the repository's worktrees — the combined tree two passing lanes may fail
   * together in. Never touches a lane or the main tree; the check that follows
   * is an ordinary watcher in the scratch path.
   */
  COMBINE_RUN: 'combine:run',
  /**
   * M317. The integration flow's three doors. `inputs` reads each lane's
   * content fingerprint now (read-only) so a combined result knows when it
   * is stale; `integrate` lands the checked lanes in order, re-verifying the
   * fingerprints, the base and the check's own record first, and keeps a
   * receipt; `receipts` lists those receipts for a repository.
   */
  COMBINE_INPUTS: 'combine:inputs',
  COMBINE_INTEGRATE: 'combine:integrate',
  COMBINE_RECEIPTS: 'combine:receipts',
  /**
   * M315. Accept a task: merge its lane's branch into the main tree's branch.
   * `dryRun` reads and refuses by name; the real call re-reads, refuses the
   * same way, and writes only if the lane is still at the HEAD the person saw.
   */
  LANE_MERGE: 'lane:merge',
  /**
   * M312. The repository setup: `read` answers the saved record or a DRAFT
   * detected from the repository's own files; `save` writes one (re-resolved
   * to the main tree); `prepare` runs a SAVED record's install steps in a lane
   * before its agent starts, each step's output kept as a check-output record.
   */
  SETUP_READ: 'setup:read',
  SETUP_SAVE: 'setup:save',
  SETUP_PREPARE: 'setup:prepare',
  /**
   * M321. PREFLIGHT — what a start would meet, probed and nothing run: each
   * named tool looked up on the login PATH, and the ports the next lane of
   * the repository would be allocated. Answered before any worker exists.
   */
  SETUP_PREFLIGHT: 'setup:preflight',
  /** M313. A file at a line, or a worktree, in the person's own editor (`files.editor`). */
  EDITOR_OPEN: 'editor:open',
  /** M314. The person's own recipes; the built-ins are code in `shared/recipes.ts`. */
  RECIPE_LIST: 'recipe:list',
  RECIPE_SAVE: 'recipe:save',
  RECIPE_DELETE: 'recipe:delete',
  /** M321. Every stored version of one recipe, newest first — what a run's recorded version is compared against. */
  RECIPE_HISTORY: 'recipe:history',
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
   * M262. When each recent directory was last spawned into (epoch ms, keyed
   * by path) — a sibling read, so `spawn:recent`'s answer keeps its shape.
   */
  SPAWN_RECENT_USED: 'spawn:recent-used',
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
  /**
   * M319. The two stops that are neither Interrupt nor Dispose: CANCEL drops
   * the messages queued behind the turn (the turn continues), TERMINATE kills
   * the process and keeps the session (the next message resumes). Three acts
   * under one word is how a person "stops" a codex turn and it keeps writing.
   */
  AGENT_CANCEL_QUEUED: 'agent:cancel-queued',
  AGENT_TERMINATE: 'agent:terminate',
  /**
   * M322. The waiting messages, one at a time: EDIT a message's text or
   * REMOVE it before it is sent, or DISCARD one the transcript marks not
   * delivered. Each answers false once the message has reached the agent —
   * what the agent saw is never edited.
   */
  AGENT_QUEUE_EDIT: 'agent:queue-edit',
  /**
   * M322. STOP AND SEND: the message goes first in line and the turn in
   * flight is interrupted, so it is the agent's next input. Answers the send's
   * word and whether the interrupt was written (false on a backend with no
   * interrupt door — the message then waits at the head of the queue).
   */
  AGENT_SEND_CORRECTION: 'agent:send-correction',
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
  /**
   * M145. A clipboard IMAGE as a file under userData/attachments, for a
   * TERMINAL panel: a PTY cannot take bytes, so the renderer pastes the path
   * main answers with. The chat's door stays `agent:clipboard-image`.
   */
  ATTACHMENT_CLIPBOARD_FILE: 'attachment:clipboard-file',
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
   * M138. The pool's production caller. `agent:pool-start` hands main a
   * template's `pool` block; main reads the list (under the Places gate),
   * drives M132's engine, and asks the RENDERER to mint each worker over
   * `pool:mint` (an ephemeral reply, board:add's shape) — the renderer owns
   * the workspace it renders. `agent:pool-stop` interrupts every live worker
   * and kills none. Events ride `pool:event`, addressed by template and block.
   */
  AGENT_POOL_START: 'agent:pool-start',
  AGENT_POOL_STOP: 'agent:pool-stop',
  /** M100. The roster: list, save (upsert), delete. Places are checked in main, never here. */
  TEAMMATE_LIST: 'teammate:list',
  TEAMMATE_SAVE: 'teammate:save',
  TEAMMATE_DELETE: 'teammate:delete',
  /** M100. The OS folder dialog: a place is chosen, never typed. Answers the absolute path or null. */
  TEAMMATE_CHOOSE_PLACE: 'teammate:choose-place',
  /** M101. Routines: list, save (refused by name — a destructive plan, no schedule permission), delete, run now. */
  ROUTINE_LIST: 'routine:list',
  ROUTINE_SAVE: 'routine:save',
  ROUTINE_DELETE: 'routine:delete',
  ROUTINE_RUN: 'routine:run',
  /**
   * M127. The skill shelf: the user's arrangement of the Skills pane, TOP
   * LEVEL in the layout snapshot beside `templates` and `teammates` rather
   * than on a workspace, and reached through its own pair of invokes for
   * exactly that reason — `layout:save` carries a CanvasState, which is one
   * workspace's record and has nowhere to put it. Never through the undo
   * history: the shelf is a library, not layout.
   */
  SHELF_LIST: 'shelf:list',
  SHELF_SAVE: 'shelf:save',
  /**
   * M128. `claude plugin details <id>` for ONE plugin, as TEXT.
   *
   * Its own channel rather than a field on TOOLBOX_READ for two reasons: the
   * inventory is asked per cwd and this is asked per plugin, and the details
   * call is only made when a skill panel that names a plugin is on screen —
   * folding it into the toolbox read would spend a CLI call on every panel
   * that never opens one. Three-state, parsed NOWHERE (there is no --json;
   * see main/plugin-details.ts).
   */
  PLUGIN_DETAILS: 'plugin:details',
  /**
   * M129. The four writers — the ONLY channels in this contract that put
   * bytes into `~/.claude`.
   *
   * The line is spec §5.1's and main enforces it rather than trusting the
   * caller: a skill's `SKILL.md` is writable because a skill is INVOKED
   * DELIBERATELY, while a hook fires by itself, a permission grants without
   * asking, an MCP server is a process with its own reach, an agent's
   * `tools:` line is a permission surface and a slash command can carry
   * shell. Containment is M100's `insidePlace` REUSED (never a second
   * path check at a security boundary), a target under an enabled plugin's
   * installPath is refused NAMING the plugin, every write carries the
   * `mtime`/`size` the panel READ and a mismatch is refused rather than
   * merged, and `skill:delete` trashes the DIRECTORY — never an unlink,
   * because the Finder is this feature's undo (a file write is not history).
   */
  SKILL_WRITE: 'skill:write',
  SKILL_CREATE: 'skill:create',
  SKILL_RENAME: 'skill:rename',
  SKILL_DELETE: 'skill:delete',
  /**
   * M130. A TERMINAL panel's live skill trail, main's half: tails the CLI's
   * own transcript from a byte offset. A chat panel's trail is derived from
   * events already in memory in the renderer (Task 8) and never asks main —
   * this invoke refuses a chat panel id by name, never answering `none`.
   */
  SKILL_TRAIL: 'skill:trail',
  /**
   * M103. The browser pane's text, read in MAIN: the scheme is checked on
   * the guest's LIVE url (not the record's, not only at navigation), the
   * text is capped inside the guest, and it passes the outward gate before
   * it crosses back. Reading the pane is leaving the app.
   */
  BROWSER_READ: 'browser:read',
  /** M185. What project is this panel pointed at, and is anything of it listening. Reads; runs nothing. */
  PREVIEW_DISCOVER: 'preview:discover',
  /** M185. A real picture of a guest, written under userData/captures. */
  PREVIEW_CAPTURE: 'preview:capture',
  /** M186. Take bytes into the content-addressed asset store. */
  ASSET_PUT: 'asset:put',
  /** M186. The system's own file chooser, for Replace. */
  ASSET_CHOOSE: 'asset:choose',
  /** M188. A fetch node's one GET, capped and gated in main. */
  NODE_FETCH: 'node:fetch',
  /** M189. Write one portable canvas file; the path is chosen by the system's own dialog when none is given. */
  PORTABLE_EXPORT: 'portable:export',
  /** M189. Read one portable canvas file, parsed and previewed before anything is made. */
  PORTABLE_IMPORT: 'portable:import',
  /** M253. Read one pack: parse it and answer its requirements from credential METADATA and a PATH probe. Adds nothing. */
  PACK_READ: 'pack:read',
  /** M253. Add the pack main last read under this token — fresh ids, every workflow and preset unreviewed. */
  PACK_ADD: 'pack:add',
  /** M253. Write one pack; the path is chosen by the system's own dialog when none is given. */
  PACK_EXPORT: 'pack:export',
  /** M253. "I've read this" for an imported preset: drops its reviewed mark so main will spawn it. */
  PRESET_MARK_REVIEWED: 'preset:mark-reviewed',
  /** M255. Publish a draft file to GitHub — a release, a PR comment or a Discussion — after main's own confirmation shows the text. */
  GITHUB_PUBLISH: 'github:publish',
  /** M255. Write the sample dev-relations pack under userData (never overwriting) and answer its path, for the pack preview. */
  PACK_SAMPLE: 'pack:sample',
  /** M114. The lane: the repository under the teammate's places, the gate on its root, the worktree. */
  BOARD_LANE: 'board:lane',
  /** M115. Where the lane stands against the root's branch: ahead by N, no fetch. */
  BOARD_LANE_STATUS: 'board:lane-status',
  /** M115. The return path: push the lane, POST the PR through the broker behind the teammate's spend card; the comment on the issue. */
  BOARD_OPEN_PR: 'board:open-pr',
  BOARD_COMMENT_PR: 'board:comment-pr',
  /**
   * M197 (D05). The repositories under a teammate's places — the SAME
   * bounded one-level walk `board:lane` already makes to find one clone,
   * asked for all of them, so the start flow's repository field offers
   * exactly what the lane could reach. Read-only and privileged: only main
   * may run `git remote get-url`, and the renderer never decides what is a
   * repository.
   */
  BOARD_REPOSITORIES: 'board:repositories',
  /**
   * M123. The update NOTICE: one GET of the releases feed in main, three
   * states back. Nothing is downloaded or installed — auto-swap is declined
   * by name for an unsigned build. Asked by the renderer once at launch only
   * when `update.checkOnLaunch` is on, and by hand from the palette row.
   */
  UPDATE_CHECK: 'update:check',
  /** M181. An image panel's bytes as a data URL, read in main by magic number under a cap; four arms, never rejects. */
  IMAGE_READ: 'image:read',
  /** M181. The starter's two files under userData/starter, written once; answers both paths. */
  STARTER_PREPARE: 'starter:prepare',
  /**
   * M250. A .docx becomes a NEW Markdown note beside it, converted in main
   * (mammoth + jszip are main-only dependencies). With no path, main opens the
   * system's own chooser filtered to .docx. The docx is only read; the note is
   * written through createFile's `wx`, so nothing is overwritten.
   */
  DOCX_IMPORT: 'docx:import',
  /**
   * A Mermaid file as text. With no path, the system's own chooser filtered to
   * .mmd/.mermaid/.md/.txt; with one, an absolute path to such a file under a
   * size cap. Not an outward door — nothing leaves — so no gate. Never rejects.
   */
  FLOWCHART_READ: 'flowchart:read'
} as const

/**
 * M123. Three states, never two: `could-not-check` is its own arm with the
 * reason, because "up to date" and "could not ask" are different sentences
 * and an offline user must not read the first.
 */
export type UpdateResult =
  | { kind: 'current'; version: string }
  | { kind: 'newer'; version: string; url: string; publishedAt?: string }
  | { kind: 'could-not-check'; reason: string }

/** Main -> renderer, fire-and-forget via webContents.send. */
/** M114. What `dispatch` asks main for: a worktree lane for the chat it is about to mint. `repo` is `owner/repo` from a GitHub key; `root` is the place the sheet chose for an item with no repository. */
export interface BoardLaneRequest { itemId: string; chatPanelId: string; teammateId: string; repo?: string; root?: string }
export type BoardLaneResult =
  | { kind: 'lane'; path: string; worktreeId: string; branch: string; root: string }
  | { kind: 'refused'; reason: string }

/**
 * M197. One repository the start flow may offer. `repo` is the origin
 * normalised to `owner/repo`, or null for a repository with no origin —
 * which is still a repository to work in.
 */
export interface BoardRepository { path: string; repo: string | null }
/**
 * Three states, never two: an unknown teammate is `refused` by name, a
 * teammate with no places answers `no-places` (the fix is a grant, in the
 * Teammates pane), and a real answer — including an EMPTY one, which means
 * the places hold no repository — is `repos`. Collapsing the last two would
 * tell the user to add a clone when what they need is a folder.
 */
export type BoardRepositoriesResult =
  | { kind: 'repos'; repos: BoardRepository[] }
  | { kind: 'no-places'; reason: string }
  | { kind: 'refused'; reason: string }

/** M115. What `Open PR` hands main: ids, never paths — main resolves the worktree record and runs the push itself. */
export interface BoardOpenPrRequest { itemId: string; panelId: string; teammateId: string; worktreeId: string; repo: string; title: string; body: string }
export type BoardOpenPrResult =
  | { kind: 'opened' | 'exists'; number: number; url: string }
  | { kind: 'push-failed' | 'no-lane' | 'no-credential' | 'rejected' | 'unavailable' | 'malformed' | 'refused'; reason: string }
export interface BoardCommentRequest { panelId: string; teammateId: string; repo: string; number: number; body: string }
export type BoardCommentResult =
  | { kind: 'commented'; url: string }
  | { kind: 'no-credential' | 'rejected' | 'unavailable' | 'malformed' | 'refused'; reason: string }

/** M113. What `tc board` asks the renderer, and what it answers. */
export type BoardControlRequest =
  | { op: 'add'; title: string }
  | { op: 'done'; id: string }
  /** M313. `tc task` / `terminal-canvas://task`: open Start work filled in; the answer's id is the sheet's, nothing was added. */
  | { op: 'propose'; title: string; brief?: string; criteria?: string[]; cwd?: string; recipe?: string; swarm?: import('./swarm').SwarmPresetId }
export type BoardControlReply = { kind: 'ok'; id: string } | { kind: 'refused'; reason: string }

/** M316. See JOB_RECOVER. */
export interface JobRecoverRequest { jobId: string; choice: RecoveryChoice; items?: number[] }
export type JobRecoverResult = { kind: 'ok'; sentence: string } | { kind: 'refused'; reason: string }

/** M138. See AGENT_POOL_START. */
export interface PoolStartRequest { templateId: string; key: string; node: PoolNode }
export type PoolStartResult = { kind: 'started'; jobId?: string } | { kind: 'refused'; reason: string }
export interface PoolMintRequest { templateId: string; key: string; cwd: string; prompt: string; item: string; index: number }
export type PoolMintReply = { kind: 'ok'; id: string } | { kind: 'refused'; reason: string }
export type PoolEvent =
  | { kind: 'started'; id: string; item: string }
  | { kind: 'queued'; item: string; reason: 'concurrency' }
  | { kind: 'finished'; id: string }
  | { kind: 'refused'; why: string }
  | { kind: 'stopped'; why: 'empty' | 'budget' | 'by-hand' }
export interface PoolCallerEvent { templateId: string; key: string; event: PoolEvent }

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
  /** Presence: one workspace's remote peers, pushed on every awareness update and on the 30s heartbeat. */
  PRESENCE_REMOTE: 'presence:remote',
  /** Observer mode: the observed member's awareness and canvas snapshot, pushed on every change. */
  TEAM_OBSERVED: 'team:observed',
  /** M377. TEAM_ASKS's rows again, after a teammate opened, answered or closed one. */
  TEAM_ASKS_CHANGED: 'team:asks-changed',
  /** The shared canvas: the active workspace's view after a peer's change, a refusal, or a switch; null when not shared. */
  CANVAS_SHARED: 'canvas:shared',
  /**
   * M336. The signed-in accounts changed — a sign-in, a sign-out or a new
   * active choice, from the app OR from `tc` in a terminal. Carries the same
   * metadata auth:sessions answers, the active one first. Never a token.
   */
  AUTH_CHANGED: 'auth:changed',
  /** Shared text: a doc update for an open replica, or `reset` when its room closed or reopened. */
  TEXT_REMOTE: 'text:remote',
  /** Relay terminal bytes for one panel; `reset` clears the terminal first (a replay follows). */
  RELAY_DATA: 'relay:data',
  /** A relay panel's view — connection, role, the control picture — on every change. */
  RELAY_STATE: 'relay:state',
  /**
   * World view. A batch of AgentEvents (shared/world-events.ts), oldest first —
   * an array so a future real feed can batch at 16ms as AGENT_EVENT does
   * without changing the channel. Today only SIMULATE_AGENTS sends it.
   */
  WORLD_EVENTS: 'world:events',
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
  USAGE_PANEL: 'usage:panel',
  /** M101. A routine's tick: the renderer mints the fresh chat and sends the prompt. */
  ROUTINE_FIRE: 'routine:fire',
  /** M106. The Workspace menu's two verbs: Tidy Panes and Flip Terminals (a view state, never persisted). */
  CANVAS_TIDY: 'canvas:tidy',
  /** M190. Help ▸ Prepare feedback… — main asks, the renderer builds the draft and opens it. */
  CANVAS_FEEDBACK: 'canvas:feedback',
  CANVAS_FLIP: 'canvas:flip',
  /** M113. `tc board` asks the RENDERER over an ephemeral reply channel (canvas:model's shape) — main writes no record itself. */
  BOARD_ADD: 'board:add',
  CANVAS_PLAN: 'canvas:plan',
  /** M138. Main asks the renderer to mint one pool worker; the reply channel rides in the envelope. */
  POOL_MINT: 'pool:mint',
  /** M138. A pool event, addressed by template and block. */
  POOL_EVENT: 'pool:event'
} as const

export interface FileReadRequest {
  panelId: PanelId
  path: string
  /**
   * M245. `base64` asks for the `bytes` arm, and arms the watch in the same
   * encoding. ABSENT is the text read — never send `encoding: undefined`,
   * which is the absent-stays-absent trap at an IPC boundary.
   */
  encoding?: import('./file-panel').FileEncoding
}

/** What `toolbox:read` is asked. See TOOLBOX_READ for why it is a cwd. */
export interface ToolboxReadRequest {
  /**
   * The panel's cwd, UNEXPANDED — main expands tilde and verifies the folder
   * without a spawn's fallback to home. A missing folder is unavailable.
   */
  cwd: string
  /**
   * The panel this is for, used ONLY to look up a spawn-time config stamp so
   * the answer can carry a `freshness`. Deliberately not part of the cache
   * key — see TOOLBOX_READ.
   */
  panelId: PanelId
}

/**
 * M129. What the four writers are asked. `cwd` is the asking panel's,
 * UNEXPANDED — main expands it with `resolveCwd` and derives the writable
 * roots itself, so the renderer can neither name a root nor widen one.
 */
export interface SkillWriteRequest {
  cwd: string
  /** The `SKILL.md` itself, as the entry's `sourcePath` gave it. */
  path: string
  text: string
  /** The `mtime`/`size` the panel READ. A mismatch on disk is refused. */
  stamp: ReadStamp
}

export interface SkillCreateRequest {
  cwd: string
  /** `user` writes under the home root, `project` under the repository's. */
  scope: 'user' | 'project'
  name: string
}

export interface SkillRenameRequest {
  cwd: string
  /** The skill's DIRECTORY, not its SKILL.md: a rename moves the folder. */
  dir: string
  name: string
}

export interface SkillDeleteRequest {
  cwd: string
  /** The DIRECTORY, so bundled resources go to the trash with the skill. */
  dir: string
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
  /** M245. `base64` means `content` is bytes. Absent is utf8 text. */
  encoding?: import('./file-panel').FileEncoding
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
  /** M147. Environment overrides (a preset's, then the sheet's over them); main merges them over the login env at spawn. */
  env?: Record<string, string>
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
  /** M100. The teammate the panel speaks as; main checks its places before resolving the cwd. */
  teammateId?: string
  /** M147. Environment overrides typed into the sheet, merged over the preset's own, then the login env — in main. */
  env?: Record<string, string>
}
/** `id` is present when the caller minted the panel itself (a chat); main's spawn answers without one. */
export type SpawnResult = { kind: 'spawned'; id?: string } | { kind: 'refused'; reason: string }

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

/** M122. One hit of Find in panels: a scrollback line or a transcript line, REDACTED. */
export interface PanelSearchHit {
  panelId: PanelId
  kind: 'scrollback' | 'transcript'
  line: string
  /** A scrollback hit: the line's index in the log, for the in-panel search. */
  lineIndex?: number
  /** A transcript hit: the turn's index, for the chat's flight to it. */
  turnIndex?: number
}
/** M122. The answer STATES its cap and how many secrets the gate replaced. */
export interface PanelSearchFailure {
  /** Which reader failed — `scrollback` or `transcript:<panelId>`. */
  source: string
  /** Why it failed, without secrets. */
  reason: string
}

export interface PanelSearchResult {
  hits: PanelSearchHit[]
  capped: boolean
  cap: number
  redacted: number
  /** D13. Named reader failures — absent on older answers is "none failed". */
  failures?: PanelSearchFailure[]
  /** D13. What was actually searched, so a miss is not silent coverage. */
  searched?: { terminals: number; chats: number }
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
  /**
   * M337. Present on a shared workspace: the share's id and this person's
   * cached role. The same two facts CANVAS_SHARED's view already carries —
   * the org, the Y.Doc bytes and the record itself stay in main.
   */
  share?: { id: string; role: WorkspaceRole }
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

/** M312. What `setup:read` answers: the saved record, a detected draft nothing has run, or no repository. */
export type SetupReadResult =
  | { kind: 'saved'; setup: RepoSetup }
  | { kind: 'draft'; setup: RepoSetup }
  | { kind: 'not-a-repo' }

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
  /** M253. Arrived in a pack and not yet read; main refuses to spawn it. Absent means reviewed. */
  reviewed?: false
  builtIn: boolean
  isDefault: boolean
  subtitle: string
  /** M37. Spawns in a fresh worktree. Absent means no. */
  worktree?: boolean
  /** M65. The preset's agent kind, so the spawn sheet shows mode/effort/model only for one. Absent for a shell. */
  agent?: AgentKind
  /** M65. The preset's own directory, the sheet's default `where` when no panel is focused. */
  cwd: string
  /** M174. The preset's command word, when it has one; absent for the login shell (the launcher's mono chip renders only a real command). */
  command?: string
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
/** M185. What a capture answers: the file it wrote and the page it is of, or one named refusal. */
export type PreviewCaptureResult =
  | { kind: 'captured'; path: string; id: string; url: string; host: string; capturedAt: number; bytes: number }
  | { kind: 'refused'; reason: string }

/** M186. What the asset store answers: the id and where the bytes are, or one named refusal. */
export type AssetPutResult =
  | { kind: 'stored'; id: string; path: string; mediaType: string; bytes: number; wrote: boolean; prunedCount: number }
  | { kind: 'refused'; reason: string }

/** M188. What a fetch node answers: a capped, gated body, or one named refusal. */
export type NodeFetchResult =
  | { kind: 'ok'; status: number; text: string; note: string; truncated: boolean; ms: number }
  | { kind: 'refused'; reason: string }

/** M189. Where the file went, or why it did not — a cancelled dialog is neither. */
export type PortableWriteResult =
  | { kind: 'written'; path: string; bytes: number }
  | { kind: 'cancelled' }
  | { kind: 'refused'; reason: string }

/** M189. The parse, or a cancelled dialog. What to MAKE of it is the renderer's. */
export type PortableReadResult =
  | { kind: 'read'; path: string; parse: unknown }
  | { kind: 'cancelled' }
  | { kind: 'refused'; reason: string }

/**
 * M253. A read pack and what it needs. `token` names the parse main HOLDS:
 * `pack:add` adds that one, so the renderer can confirm only what it was
 * shown and never hand main a different payload. `requirements` is absent
 * unless the parse is a pack.
 */
export type PackReadResult =
  | { kind: 'read'; path: string; token: string; parse: import('./pack').PackParse; requirements?: import('./pack').PackRequirements }
  | { kind: 'cancelled' }
  | { kind: 'refused'; reason: string }

/** M253. Where the pack went and what it holds, or why it did not — a cancelled dialog is neither. */
export type PackWriteResult =
  | { kind: 'written'; path: string; bytes: number; sentence: string }
  | { kind: 'cancelled' }
  | { kind: 'refused'; reason: string }

/** M255. One publish: the DRAFT file to send, and where. The repository is the file's own origin remote. */
export type GithubPublishRequest =
  | { kind: 'release'; path: string; tag: string }
  | { kind: 'comment'; path: string; number: number }
  | { kind: 'discussion'; path: string; category: string }

/** M255. Published (with where), cancelled by the person (never a refusal), or refused by name. */
export type GithubPublishResult =
  | { kind: 'published'; url: string; redacted: number }
  | { kind: 'cancelled' }
  | { kind: 'no-credential' | 'refused' | 'unavailable'; reason: string }

/** M255. The sample pack's path — `wrote` false when it was already there (never overwritten). */
export type PackSampleResult =
  | { kind: 'ready'; path: string; wrote: boolean }
  | { kind: 'refused'; reason: string }

/** M253. What the add made, counted; or why nothing was made. */
export type PackAddResult =
  | { kind: 'added'; sentence: string; workflows: number; prompts: number; presets: number }
  | { kind: 'refused'; reason: string }

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
    /** `meta` only while the workspace is shared: the last CANVAS_SHARED seq applied (canvas-sync.ts's write-back guard). */
    save(state: CanvasState, meta?: SharedSaveMeta): Promise<void>
  }
  canvas: {
    /** Registers the answer to canvas:counts. Returns its own unsubscribe. */
    onCounts(provide: () => { panels: number; running: number }): () => void
    /** M81. The canvas model for `tc status`. Same ephemeral-reply shape as onCounts. */
    onModel(provide: () => ControlCanvasModel): () => void
    /** M180. `tc plan`: main sends the line and the resolved caller with a reply channel; the renderer runs it through the one executor and answers. */
    onPlan(handle: (req: AgentPlanRequest) => Promise<AgentPlanReply>): () => void
    /** M113. `tc board add/done`: main sends the request and a reply channel; the renderer answers with the surviving id or a refusal. */
    onBoard(handle: (req: BoardControlRequest) => BoardControlReply): () => void
    /** M138. Main asks for one pool worker; the renderer mints a chat panel and answers with its id, or refuses by name. */
    onPoolMint(handle: (req: PoolMintRequest) => Promise<PoolMintReply>): () => void
    onReset(listener: () => void): () => void
    /** M106. The menu's Tidy Panes and Flip Terminals. */
    onTidy(listener: () => void): () => void
    onFlip(listener: () => void): () => void
    /** M190. Help ▸ Prepare feedback…; the renderer builds the draft and opens it. */
    onFeedback(listener: () => void): () => void
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
    /** M253. The refusal sentence when nothing was spawned (an unread pack preset), null when main sent it. */
    spawnById(id: string): Promise<string | null>
    /** M253. "I've read this" for a preset that arrived in a pack. False when the id names nothing. */
    markReviewed(id: string): Promise<boolean>
    /** M80. The preset's resolved template, or null when the id names nothing. */
    /** M253: `{ refused }` names why an unread pack preset resolves to nothing; `null` is still "no such preset". */
    template(id: string): Promise<PresetTemplate | null | { refused: string }>
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
    /** M122. Find in panels: the scrollback AND transcript logs of the active workspace, capped and redacted, the counts on the result. */
    search(query: string): Promise<PanelSearchResult>
  }
  /** M83. The project memory: what this repository has decided, tried and failed. */
  memory: {
    /**
     * M196 (D04). `root` is the root main RESOLVED, which is not the directory
     * asked about: a subdirectory resolves up to its repository and a worktree
     * LANE resolves to the repository it is a lane of. `scope` says so —
     * absent for a directory git does not own, and carrying `lane` only when
     * one got us here, so a surface can name the repository an agent's
     * memories actually came from instead of the folder it happened to hold.
     * `unresolved` is the third state: git declined, nothing was read, and the
     * empty list is not a claim that nobody wrote anything.
     */
    list(root: string, limit: number): Promise<{
      root: string
      entries: MemoryEntryRow[]
      skipped: number
      scope?: { repository: string; lane?: string; laneBranch?: string }
      unresolved?: string
    }>
    /** Refused BY NAME for an unusable kind or empty text; every write is scrubbed. */
    add(req: { root: string; kind: string; text: string; panelId?: string; source?: { conversationId: string; turnId: string; taskId?: string } }): Promise<{ ok: true } | { ok: false; reason: string }>
  }
  /** M100. Teammates: the roster. `save` upserts by id and answers the record as saved; `remove` answers whether it held the id. */
  teammate: {
    list(): Promise<PersistedTeammate[]>
    /**
     * M131 fix round 2. `cwd` — the pane's inventory cwd, present ONLY when
     * the save comes from the assign door — lets main answer with the REAL
     * visibility of every project-scoped key just saved: `notVisible` is
     * absent when nothing is hidden, never an empty array written for its
     * own sake.
     */
    save(teammate: PersistedTeammate, cwd?: string): Promise<{ teammate: PersistedTeammate; notVisible?: { name: string; repoRoot: string }[] }>
    remove(id: string): Promise<boolean>
    /** The folder dialog; null when cancelled. */
    choosePlace(): Promise<string | null>
  }
  /** M127. The skill shelf, read and written whole: the columns are one record. */
  shelf: {
    list(): Promise<Shelf>
    save(shelf: Shelf): Promise<Shelf>
  }
  /** M128. One plugin's `claude plugin details` output, verbatim. Never rejects. */
  plugin: {
    details(id: string): Promise<PluginDetailsResult>
  }
  /** M101. Routines. `save` answers the record as saved or a named refusal; `run` fires now. */
  routine: {
    list(): Promise<PersistedRoutine[]>
    save(routine: PersistedRoutine): Promise<{ kind: 'saved'; routine: PersistedRoutine } | { kind: 'refused'; reason: string }>
    remove(id: string): Promise<boolean>
    run(id: string): Promise<boolean>
    /** Main's tick; the renderer answers by minting the chat and reporting through `save`. */
    onFire(listener: (routine: PersistedRoutine) => void): () => void
  }
  /** M80. Templates: a shape of work saved once and instantiated with its parameters filled. */
  template: {
    list(): Promise<PersistedTemplate[]>
    /** The template as saved, with its minted id — or, M182, `stale` with the standing record when `expectedRevision` does not match it. */
    save(template: Omit<PersistedTemplate, 'id'> & { id?: string }, expectedRevision?: number): Promise<TemplateSaveResult>
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
  /** M311. See COMBINE_RUN. */
  combine: {
    run(req: { root: string; lanes: string[] }): Promise<CombineRunResult>
    /** M317. See COMBINE_INPUTS. */
    inputs(req: { root: string; lanes: string[] }): Promise<CombineInputsResult>
    integrate(req: IntegrateRequest): Promise<IntegrateResult>
    receipts(root: string): Promise<IntegrationReceipt[]>
  }
  /** M315. See LANE_MERGE. */
  lane: {
    merge(req: LaneMergeRequest): Promise<LaneMergeResult>
  }
  /** M312. See SETUP_READ. */
  setup: {
    read(cwd: string): Promise<SetupReadResult>
    save(setup: RepoSetup): Promise<{ ok: true; setup: RepoSetup } | { ok: false; reason: string }>
    prepare(req: { lane: string }): Promise<PrepareResult>
    /** M321. See SETUP_PREFLIGHT. */
    preflight(req: { root: string; tools: readonly string[] }): Promise<{ tools: Record<string, boolean>; ports: Record<string, number | null> | null }>
  }
  /** M313. See EDITOR_OPEN. */
  editor: {
    open(target: EditorTarget): Promise<EditorOpenResult>
  }
  /** M314. See RECIPE_LIST. */
  recipes: {
    list(): Promise<Recipe[]>
    save(recipe: Recipe): Promise<{ ok: true; recipe: Recipe } | { ok: false; reason: string }>
    remove(id: string): Promise<boolean>
    /** M321. See RECIPE_HISTORY. */
    history(id: string): Promise<Recipe[]>
  }
  ledger: {
    /** M52. The run ledger's rows for a panel, newest first: what it ran and how each ended. No output bytes. */
    list(panelId: string, limit: number): Promise<RunRow[]>
    /** M142. Every usage row at or after `since` (epoch ms), newest first — the history half of backlog #19. */
    usage(since: number): Promise<UsageRow[]>
    /**
     * M300. The DURABLE record for one subject, newest first. Distinct from
     * the activity ring the renderer keeps in memory: that is a live tail and
     * this is history, and Orchestrate's Timeline tab says which is which.
     * `reachedStart` false means the limit filled, never that nothing is older.
     */
    timeline(filter: TimelineFilter, limit: number): Promise<TimelineRead>
    /**
     * M300. Append one durable event. Returns false when the write was
     * refused — the caller says so rather than assuming it landed.
     */
    event(row: Omit<EventRow, 'kind'>): Promise<boolean>
    /** M306. One check run's exact output, command, cwd, times and tested revision. `missing` when pruned or never written. */
    output(runId: string): Promise<CheckOutputRead>
  }
  /** M73. The agent-session runtime. `agent` below is the older agent-STATE surface (M6c/M6d); the two are different facts. */
  agentSession: {
    /** M73. Idempotent at an id; spawns nothing. Refuses by name (no such directory; claude not found). */
    create(spec: AgentSessionSpec): Promise<AgentCreateResult>
    /** Writes one user turn; queues it if one is in flight; respawns after an exit. M75: with attachments, resolved in main; a refusal names the one that could not go and nothing is sent. */
    send(id: string, text: string, attachments?: ChatAttachment[]): Promise<SendAnswer>
    /** M75. See AGENT_CLIPBOARD_IMAGE. */
    clipboardImage(): Promise<ClipboardImage>
    /** M145. See ATTACHMENT_CLIPBOARD_FILE: the image written as a .png, its path; `empty` with no image; a named failure. */
    clipboardFile(): Promise<ClipboardFile>
    /** True when a request was written; false with no turn in flight. */
    interrupt(id: string): Promise<boolean>
    /** M319. See AGENT_CANCEL_QUEUED: how many queued messages were dropped. */
    cancelQueued(id: string): Promise<number>
    /** M319. See AGENT_TERMINATE: false with no process to end. */
    terminate(id: string): Promise<boolean>
    /** M322. See AGENT_QUEUE_EDIT. */
    queueEdit(req: QueueEditRequest): Promise<boolean>
    /** M322. See AGENT_SEND_CORRECTION. */
    sendCorrection(id: string, text: string, attachments?: ChatAttachment[]): Promise<CorrectionAnswer>
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
    /** M138. See AGENT_POOL_START. */
    poolStart(req: PoolStartRequest): Promise<PoolStartResult>
    /** M138. See AGENT_POOL_STOP: true when a live pool was stopped. */
    poolStop(req: { templateId: string; key: string }): Promise<boolean>
    /** M138. Pool events, addressed by template and block. Returns its own unsubscribe. */
    onPoolEvent(listener: (event: PoolCallerEvent) => void): () => void
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
    /** M262. See SPAWN_RECENT_USED. A directory with no entry has no known time. */
    recentUsed(): Promise<Record<string, number>>
    /** M65. The menu's ⌘⇧N. */
    onOpenSheet(listener: () => void): () => void
  }
  links: {
    /** M51. The text the terminal underlined and the panel it came from; main resolves and opens, or refuses with a reason. */
    open(req: { panelId: string; target: string }): Promise<{ kind: 'opened' | 'refused'; reason?: string }>
  }
  env: {
    /** M48. The startup probe's facts — PATH entries, each CLI found or absent, tmux, the layout file. Names, never values. */
    /** M107. `again: true` asks the login shell once more (Check again) and reports what it found; the app's own environment applies on relaunch. */
    report(again?: boolean): Promise<EnvReport>
  }
  export: {
    /** M58; M112 carries the live buffer when the panel has one. */
    panelText(req: PanelTextExportRequest): Promise<PanelTextExportResult>
    canvasPng(): Promise<CanvasPngExportResult>
    /** M251. The deck's path; main reads it, so the renderer never hands over text it could have altered. */
    deckPptx(req: DeckExportRequest): Promise<DeckExportResult>
    /** M248. Main reads the deck file itself; the renderer names only its path. */
    deckPdf(req: DeckPdfExportRequest): Promise<DeckPdfExportResult>
    /** A diagram's Mermaid/SVG text, scrubbed by the outward gate, to a file the person chooses; the count is on the answer. */
    flowchart(req: FlowchartExportRequest): Promise<FlowchartExportResult>
  }
  tool: {
    /** M252. A description in, a tool OUT — never run. The renderer saves it unreviewed. */
    generate(req: ToolGenerateRequest): Promise<ToolGenerateResult>
  }
  /** M320–M321. The task doors — see TASK_EVIDENCE, TASK_EVIDENCE_INDEX, TASK_EXPORT_HANDOFF. */
  tasks: {
    evidence(req: TaskEvidenceRequest): Promise<TaskEvidence>
    index(): Promise<TaskIndexRow[]>
    exportHandoff(req: { itemId: string; title: string; markdown: string }): Promise<TaskExportResult>
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
     * Brief #20. Main's record of the running sessions when the window last
     * went away (a quit, or a closed window on macOS). Null after the first
     * ask, after a crash, or on a first launch — and null makes no claim.
     */
    lastExit(): Promise<LastExit | null>
    /** M316. See JOB_LIST. */
    jobs(): Promise<JobAccount[]>
    /** M316. See JOB_RECOVER. */
    recoverJob(req: JobRecoverRequest): Promise<JobRecoverResult>
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
    /** M286. See REVIEW_IDENTITY. */
    identity(req: { root: string; base: string }): Promise<ReviewIdentity | null>
  }
  /** M86. See GIT_STATUS. */
  git: {
    status(root: string): Promise<RepoStatus>
    /** Backlog #86. See GIT_ROOT. */
    root(dir: string): Promise<string | null>
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
  /** See AUTH_LOGIN. No member returns a token; see account.ts's header. */
  auth: {
    login(): Promise<AccountLoginResult>
    logout(githubId?: string): Promise<AccountLogoutResult>
    sessions(): Promise<AccountSessionMeta[]>
    use(githubId: string): Promise<AccountUseResult>
    status(): Promise<AccountStatus>
    onChanged(listener: (sessions: AccountSessionMeta[]) => void): () => void
  }
  /** See PRESENCE_LOCAL. Carries no token and no identity the renderer did not already show. */
  presence: {
    report(local: LocalPresence): Promise<void>
    rosters(): Promise<PresenceRoster[]>
    onRemote(listener: (roster: PresenceRoster) => void): () => void
  }
  /**
   * See CANVAS_OP / CANVAS_SHARED. The renderer never holds the Y.Doc: it
   * sends ops and gets views, and speaks canvas-ops.ts only.
   */
  sharedCanvas: {
    op(op: CanvasOp): Promise<Verdict>
    view(): Promise<CanvasSharedView | null>
    onView(listener: (view: CanvasSharedView | null) => void): () => void
    share(req?: { orgId?: string }): Promise<ShareResult>
    shares(): Promise<ShareListResult>
    open(shareId: string): Promise<{ kind: 'ok'; workspaceId: string } | { kind: 'refused' | 'failed'; reason: string }>
    setMember(req: { shareId: string; userId: string; role: WorkspaceRole | null }): Promise<ShareMemberResult>
    members(shareId: string): Promise<ShareMembersResult>
  }
  /**
   * See TEXT_OPEN / TEXT_UPDATE / TEXT_REMOTE. Bytes, not ops: y-monaco edits
   * a Y.Text, and the only honest record of that is the Yjs update itself.
   * Reached only from renderer/shared-text/, the renderer's one yjs door.
   */
  sharedText: {
    open(workspaceId: string): Promise<SharedTextOpen | null>
    close(workspaceId: string): Promise<void>
    update(workspaceId: string, update: Uint8Array): Promise<Verdict>
    onRemote(listener: (push: SharedTextPush) => void): () => void
  }
  /**
   * See RELAY_SPAWN. No member returns or takes a token; `userId` in a view is
   * the signed-in person's own id, which the renderer already shows.
   */
  relay: {
    spawn(req: RelaySpawnRequest): Promise<RelayOpenResult>
    attach(req: { panelId: string; sessionId: string }): Promise<RelayOpenResult>
    detach(panelId: string): Promise<void>
    input(panelId: string, data: string): Promise<boolean>
    resize(req: { panelId: string; cols: number; rows: number }): Promise<void>
    control(req: RelayControlRequest): Promise<void>
    kill(panelId: string): Promise<void>
    list(): Promise<RelayListResult>
    view(panelId: string): Promise<RelayView | null>
    onData(listener: (data: RelayData) => void): () => void
    onState(listener: (view: RelayView) => void): () => void
  }
  /**
   * See WORLD_EVENTS. Subscribe-only: the renderer's agent-world store is the
   * one subscriber, and every view reads the store, never this.
   */
  world: {
    onEvents(listener: (events: unknown[]) => void): () => void
  }
  /** See TEAM_LIST / TEAM_OBSERVE / TEAM_OBSERVED. */
  team: {
    list(orgId?: string): Promise<TeamListResult>
    observe(req: TeamObserveRequest | null): Promise<void>
    onObserved(listener: (observed: TeamObserved) => void): () => void
    /** M377. See TEAM_ASKS / TEAM_ASK_ANSWER / TEAM_ASKS_CHANGED. */
    asks(): Promise<TeamAskRow[]>
    answerAsk(req: TeamAskAnswerRequest): Promise<Verdict>
    onAsks(listener: (rows: TeamAskRow[]) => void): () => void
  }
  /** M89. See BROKER_AUDIT. */
  broker: {
    audit(limit: number, service?: string): Promise<{ rows: BrokerAuditRowWire[]; skipped: number }>
  }
  /** M88. See GITHUB_LIST. */
  github: {
    /** `panelId` names the asking panel in the broker's audit rows. */
    list(panelId?: string): Promise<GithubListResult>
    /** M255. Publish a draft file. Main asks the person with the text in front of them, every time. */
    publish(req: GithubPublishRequest): Promise<GithubPublishResult>
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
  /**
   * M129. The four writers. Every arm answers a RESULT — `refused` (a rule
   * said no, before disk), `failed` (the rules passed, the filesystem did
   * not), or the write's own arm — and none of them rejects.
   */
  skill: {
    write(req: SkillWriteRequest): Promise<SkillWriteResult>
    create(req: SkillCreateRequest): Promise<SkillWriteResult>
    rename(req: SkillRenameRequest): Promise<SkillWriteResult>
    remove(req: SkillDeleteRequest): Promise<SkillWriteResult>
    /**
     * M130. A TERMINAL panel's live skill trail. A chat panel id refuses by
     * name — its trail is derived in the renderer from events already in
     * memory (Task 8) and never asks main.
     */
    trail(panelId: string): Promise<Trail>
  }
  /** M103. See BROWSER_READ. Three arms; never rejects. */
  browser: {
    read(req: BrowserReadRequest): Promise<BrowserReadResult>
  }
  /**
   * M185. The preview's two main-side questions. `discover` READS — one
   * `lsof` over the pids the renderer already holds and one `package.json` —
   * and starts nothing; `capture` writes one PNG into the app's own
   * directory and answers with the page it is a picture of.
   */
  preview: {
    discover(req: { pids: number[]; cwd: string }): Promise<PreviewDiscovery>
    capture(req: { webContentsId: number }): Promise<PreviewCaptureResult>
  }
  /**
   * M186. The asset store: bytes in, an id and a path out. `put` takes a file
   * path or raw bytes (a clipboard picture has no path); `choose` opens the
   * system's own file chooser and answers the path, or `null` when the person
   * cancelled — a cancel is not a refusal and says nothing.
   */
  asset: {
    put(req: { path?: string; bytes?: Uint8Array }): Promise<AssetPutResult>
    choose(): Promise<string | null>
  }
  /** M250. Import one .docx as a new, unreviewed note; never rejects. */
  docx: {
    import(req: { path?: string }): Promise<import('./imported-note').DocxImportResult>
  }
  /** A Mermaid file as text (a chosen file, or an absolute path); never rejects. See FLOWCHART_READ. */
  flowchart: {
    read(req: FlowchartReadRequest): Promise<FlowchartReadResult>
  }
  /**
   * M188. The fetch node's one request. A GET and only a GET — any other
   * method is refused by name, because a write belongs on the broker's
   * approval path and a node has no door onto it. Never rejects.
   */
  node: {
    fetch(req: { url: string; method?: string }): Promise<NodeFetchResult>
  }
  /**
   * M189. The portable file's two doors. `write` takes the record the renderer
   * built (the renderer owns the workspace it renders, M113's rule) and puts
   * it on disk; `read` answers the parse, never a workspace — what to make of
   * it is the renderer's. A cancelled dialog is `null`, not a refusal.
   */
  portable: {
    write(req: { path?: string; file: unknown; suggested?: string }): Promise<PortableWriteResult>
    read(req: { path?: string }): Promise<PortableReadResult>
  }
  /**
   * M253. A pack's three doors. `read` parses and answers requirements and
   * adds NOTHING; `add` adds the pack main holds under the token `read`
   * answered (never a payload from the renderer); `write` BUILDS a pack from
   * main's own store — the user's workflows, saved prompts and presets, which
   * the renderer only sees as lossy rows — under the name given, and writes
   * it. A cancelled dialog is `cancelled`, not a refusal.
   */
  pack: {
    read(req: { path?: string }): Promise<PackReadResult>
    add(req: { token: string }): Promise<PackAddResult>
    write(req: { path?: string; name: string; suggested?: string }): Promise<PackWriteResult>
    /** M255. The sample dev-relations pack, written once under userData; the renderer then reads it like any pack. */
    sample(): Promise<PackSampleResult>
  }
  /** M114. The board's main-side verbs. */
  board: {
    lane(req: BoardLaneRequest): Promise<BoardLaneResult>
    laneStatus(req: { path: string; root: string }): Promise<LaneStatus>
    openPr(req: BoardOpenPrRequest): Promise<BoardOpenPrResult>
    commentPr(req: BoardCommentRequest): Promise<BoardCommentResult>
    /** M197. See BOARD_REPOSITORIES. Read-only; never rejects. */
    repositories(req: { teammateId: string }): Promise<BoardRepositoriesResult>
  }
  /** M123. See UPDATE_CHECK. Three arms; never rejects. */
  update: {
    check(): Promise<UpdateResult>
  }
  /** M181. See IMAGE_READ. */
  image: {
    read(path: string): Promise<ImageResult>
  }
  /** M181. See STARTER_PREPARE. */
  starter: {
    prepare(): Promise<StarterFiles>
  }
  platform: NodeJS.Platform
  /** M112. A FIELD, not a channel: main decided at launch and stamped an argv flag. */
  telemetry: { enabled: boolean }
  /** A FIELD like `telemetry`: main's app.getVersion(), stamped as argv; '' if absent. */
  appVersion: string
  /** M407 follow-up. A FIELD: the preload's `os.homedir()`, the folder `~` expands to (terminal names fold it). */
  home: string
}

// ---- the pty relay (main/relay/relay-client.ts) --------------------------------

export type RelayConnection = 'connecting' | 'open' | 'reconnecting' | 'closed'

/** What the renderer draws a relay panel from. Carries no token. */
export interface RelayView {
  panelId: string
  sessionId: string | null
  connection: RelayConnection
  userId: string | null
  role: RelayRole | null
  control: RelayControlState | null
  /** Whether this person may type now: the renderer's input gate. */
  canType: boolean
  canRequest: boolean
  program: string | null
  exited: boolean
  /** The last refusal or failure, by name; cleared by the next good attach. */
  reason: string | null
}

/** Terminal bytes for one panel. `reset`: clear the terminal before writing — a full replay follows. */
export interface RelayData { panelId: string; data: Uint8Array; reset: boolean }

export interface RelaySpawnRequest { panelId: string; program: string; cols: number; rows: number; shareId?: string }
export type RelayOpenResult = { kind: 'ok'; sessionId: string } | { kind: 'refused'; reason: string }
export type RelayControlRequest =
  | { panelId: string; action: 'request' | 'release' | 'revoke' }
  | { panelId: string; action: 'grant' | 'deny'; userId: string }
export type RelayListResult = { kind: 'ok'; sessions: RelaySessionMeta[] } | { kind: 'refused'; reason: string }
