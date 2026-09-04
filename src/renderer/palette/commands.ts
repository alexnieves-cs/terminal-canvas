import type { Command } from './palette-model'
import { REASON_CHAT_NO_CLAUDE } from '@renderer/chat/chat-model'
// Type-only: SettingRow/SettingValue are Task 4's ipc-contract additions.
// Erased by esbuild, so it costs verify:palette nothing that the bundle
// otherwise has no @shared VALUE import at all (that alias is wired
// pre-emptively for exactly this day). The @renderer import below is a
// different matter and this comment used to be read as covering it: waitingCount
// is a VALUE, so verify-palette.cjs's @renderer alias is load-bearing, not
// pre-emptive. Measured in M14 by deleting the alias and building.
import type { SettingRow, WorkspaceRow, WorktreeListRow, ScrollbackSearchHit } from '@shared/ipc-contract'
import { PERMISSION_MODES, type PermissionMode, type AgentKind, type AgentOptions } from '@shared/cost'
import type { SettingValue } from '@shared/settings-schema'
import type { EnvReport } from '@shared/env-report'
import type { CanvasGroup } from '@renderer/groups/groups'
import { shortPath } from './panel-name'
import { statePriority, type StateInput } from '@renderer/panels/panel-state'
import { waitingCount } from '@renderer/shell/rail-sections'
// A VALUE import, not a type-only one: SERVICES is the fixed, app-wide list
// of credential-holding services, and credential-schema.ts imports nothing —
// not electron, not node, not a sibling — so pulling it in here costs this
// module nothing it does not already pay for waitingCount above. findService
// stays out of this file; the palette only needs the id/label/help triple
// SERVICES already carries, and the label lookup for a REFUSAL message lives
// in Canvas.tsx, where the input-mode re-prompt actually happens.
import { SERVICES, type CredentialMeta, type CredentialService } from '@shared/credential-schema'
// Re-exported so verify-palette.cjs's bundle (fuzzy.ts + palette-model.ts +
// commands.ts) can drive buildCredentialRows directly against the same
// SERVICES this module builds rows from, rather than bundling
// credential-schema.ts a second time under a different entry point.
export { SERVICES }

/**
 * The palette's command list, built from PLAIN DATA and callbacks.
 *
 * Nothing here touches the registry, the DOM, or IPC — that is what keeps it
 * in the plain-node verify:palette tier, the same dependency-injection move
 * session-registry.ts makes with its bridge and terminal factory. The callers
 * of these callbacks live in Canvas.tsx, where the registry actually is.
 */

/** A preset as the palette needs it: main answers preset:list with these. */
export interface PresetRow {
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
  kind: 'terminal' | 'review' | 'file' | 'jira' | 'toolbox' | 'chat'
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
  /** M74. A chat panel's completed turns; zero refuses open-in-terminal by name. */
  turns?: number
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
}

export interface PaletteActions {
  spawnPreset(id: string): void
  beginRenamePreset(id: string, currentName: string): void
  deletePreset(id: string): void
  setDefaultPreset(id: string): void
  goToPanel(id: string): void
  insertPrompt(id: string): void
  /** M76. Answer a chat's pending permission request from anywhere. */
  answerApproval(id: string, requestId: string, allow: boolean): void
  beginSavePrompt(): void
  deletePrompt(id: string): void
  beginRenamePanel(id: string, currentTitle: string): void
  resetCanvas(): void
  zoomToFit(): void
  /**
   * Task 7 implements the real wiring (main's settings:set, then a reload of
   * the row list from the answer it gives back — never an optimistic local
   * flip, because main can refuse an id or a type). REQUIRED, not optional:
   * an optional member here would let Canvas.tsx's paletteActions object
   * satisfy this interface while wiring only the `settings` prop and
   * forgetting this callback (or vice versa), and tsc would say nothing — the
   * exact silent gap "a row that disappears is indistinguishable from a
   * feature that is missing" warns about elsewhere in this file. Required
   * forces a type-satisfying stub at both call sites until Task 7 replaces
   * them with the real thing; see Palette.tsx and Canvas.tsx.
   */
  toggleSetting(id: string, value: SettingValue): void
  /**
   * Open the palette's input mode on a number setting. Required, not
   * optional, for the same reason toggleSetting is: an optional member is a
   * compile-time hole a half-finished wiring passes straight through.
   */
  beginEditSetting(id: string, label: string, current: number): void
  switchWorkspace(id: string): void
  beginCreateWorkspace(): void
  beginRenameWorkspace(id: string, currentName: string): void
  /**
   * `liveCount` is passed in rather than looked up because the confirm names
   * it, and the row is the only place that knows both the workspace and the
   * renderer's session set.
   */
  deleteWorkspace(id: string, name: string, liveCount: number): void
  /**
   * The rail's close control. NOT a new dispose call site: it is the same
   * onClosePanel the panel's own × already uses, reached through this object
   * because the shell reaches the app only through it (spec rule 1). A rail
   * that closed over registry.dispose directly would be a second
   * implementation of a verb that already has an authority, and pty.kill's
   * two-caller count inside session-registry.ts would stop being re-derivable
   * from one place.
   *
   * Deliberately emits no Command row: closing already has a gesture on every
   * panel, and M6p sized the resting list on purpose.
   */
  closePanel(id: string): void
  /**
   * The rail's start control, rendered on a dormant row only. This is
   * onSelectPanel — the path that clears the dormant id and calls
   * registry.wake — and it is deliberately NOT what a row CLICK does.
   * goToPanel navigates without waking (rule 1), so the wake stays a separate,
   * visible affordance rather than a side effect of browsing a list: on a
   * restored twelve-panel canvas, a list whose rows wake is twelve agent CLIs
   * launched by scrolling it.
   *
   * Emits no Command row either — waking already has a gesture: clicking the
   * card that says "click to start".
   */
  startPanel(id: string): void
  /**
   * Save one panel as a preset. Takes an id rather than reading the focused
   * panel, because the inspector acts on the SELECTED one and those are
   * deliberately different ids.
   *
   * Emits no Command row: the menu item already covers the focused-panel case,
   * and M6p sized the resting list on purpose.
   */
  savePanelAsPreset(id: string): void
  /**
   * Restart in place: end this panel's process and start a fresh one at the
   * same id, rect and spec. See Canvas.tsx for why the sequence is what it is.
   *
   * The ONE verb M8 adds that earns a Command row of its own. Close, start and
   * save-as-preset each already have a gesture somewhere else (the panel's ×,
   * the card that says "click to start", the Presets menu), and M6p sized the
   * resting list on purpose — but restart has no other gesture anywhere, so a
   * row is the only way to reach it without the inspector open.
   */
  restartPanel(id: string): void
  /** M49. Commit a per-panel font size; undefined returns the panel to the global. */
  setPanelFontSize(id: string, size: number | undefined): void
  /** M50. Arrange these panels compactly, one undoable step, never reordering. */
  tidyPanels(ids: string[]): void
  /** M52. Scroll the focused terminal to the previous or next prompt mark. */
  jumpPrompt(id: string, direction: -1 | 1): void
  /** M52. Copy the lines between the last command's start and end marks. */
  copyLastOutput(id: string): void
  /** M56. Bookmarks and the camera trail. */
  addBookmark: () => void
  goToBookmark: (id: string) => void
  deleteBookmark: (id: string, name: string) => void
  cameraBack: () => void
  cameraForward: () => void
  /** M58. The two doors out; main owns the dialog and the write. */
  exportPanelText: (panelId: string) => void
  exportCanvasPng: () => void
  /** M59. The audit's fix: a bookmark's name is editable, through the input mode presets use. */
  beginRenameBookmark: (id: string, currentName: string) => void
  /**
   * Set this panel's permission mode AND restart it, as ONE gesture.
   *
   * Compound rather than two verbs, and that is the whole design. A bare
   * "change this panel's mode" is unsound twice over: `registry.ensure`
   * returns an existing session unchanged, so the spec would move while the
   * process kept the old flags and every surface reading the session would
   * disagree with every surface reading the panel — and undo would then lie in
   * the other direction, restoring a spec the running process never had.
   * Restarting closes both, because a restart is the one thing that re-reads
   * the argv (tmux `new-session -A` ignores it on a reattach).
   *
   * It is also what lets the inspector label its rows plainly instead of
   * hedging every one with "requested": with this as the only mutation path,
   * the session's spec and the running process cannot disagree.
   */
  restartPanelWithMode(id: string, mode: PermissionMode): void
  /**
   * Open a review node for this panel: ask main for its stored baseline,
   * then place a node beside it. Takes an id rather than reading the focused
   * panel, for the reason savePanelAsPreset does — the inspector acts on the
   * SELECTED panel and the palette on the CAPTURED one, and neither is
   * `focusedId`.
   *
   * This one EARNS a Command row, unlike closePanel/startPanel: opening a
   * review has exactly one other gesture (the inspector's button), and the
   * inspector can be collapsed.
   */
  openReview(subjectId: string): void
  /**
   * Open a toolbox node for the captured panel's directory.
   *
   * It EARNS a Command row for openReview's reason: the inspector button is
   * its only other gesture, so a user who has not found the pane has no way to
   * reach it at all.
   */
  openToolbox(panelId: string): void
  /**
   * File a rubber-band selection into ANOTHER workspace's record.
   *
   * Touches no session on either side: a moved panel becomes a hidden
   * workspace's panel with a running tmux session, which is exactly the state
   * a workspace switch already produces. Takes the ids explicitly rather than
   * reading a selection, for the reason savePanelAsPreset takes an id — the
   * palette acts on the CAPTURED state, and a callback that re-read "whatever
   * is selected now" would act on a selection the user has since changed.
   */
  movePanelsToWorkspace(
    panelIds: string[],
    target: { workspaceId: string } | { newName: string }
  ): void
  /**
   * The same move into a workspace that does not exist yet, as TWO steps: this
   * only opens the palette's text input, and the submit does the move. A row
   * wired straight to movePanelsToWorkspace with an invented name would run on
   * one Enter and file the user's panels into a workspace they never named and
   * cannot cancel out of — the two-step shape beginRenamePreset already uses is
   * what makes Escape a real cancel.
   */
  beginMovePanelsToNewWorkspace(panelIds: string[]): void
  /** Name the current multi-selection as one movable canvas region. */
  beginCreateGroup(panelIds: string[]): void
  /** M65. Open the spawn sheet: where, what, how. */
  beginSpawnSheet(): void
  /**
   * M61. Card or expand one group, and remove one. Ids rather than "the
   * captured panel's group", the rule every panel verb here obeys; both are
   * the SAME callbacks GroupLayer's header buttons run, so the palette and
   * the frame cannot disagree about what a collapse is.
   */
  toggleGroup(id: string): void
  removeGroup(id: string): void
  /** Turn the selected live terminals' shared keyboard route on or off. */
  toggleBroadcastInput(): void
  /**
   * Enter M14's merged view — every workspace's panels at once, in lanes —
   * or leave it. ONE verb rather than an enter/leave pair: the row and the
   * toolbar button are both toggles, and two callbacks would let the two
   * surfaces disagree about which state the view is in.
   *
   * A later task adds a keyboard chord that calls this; it deliberately does
   * not exist yet.
   */
  toggleMerged(): void
  /**
   * Arm the one-shot link mode with this panel as the source. The NEXT click
   * on the canvas completes or cancels it; see useLinkMode and Canvas.tsx's
   * onLinkModeMouseDownCapture.
   *
   * Takes an id rather than reading the focused panel, the rule every other
   * panel verb here obeys: the inspector acts on the SELECTED panel and the
   * palette on the CAPTURED one, and neither of those is `focusedId`.
   *
   * It EARNS a Command row, like openReview and restartPanel: its only other
   * gesture is the inspector's button, and the inspector can be collapsed.
   */
  beginLink(id: string): void
  /**
   * Remove one link. Addressed by BOTH ends, because a -> b and b -> a are
   * different links and both are allowed to exist.
   *
   * NO Command row, the trade closePanel and startPanel already make: the
   * inspector's Links section is the surface, a row per existing link would
   * scale with the canvas rather than being a fixed verb, and M6p sized the
   * resting list on purpose.
   */
  removeLink(from: string, to: string): void
  /** Label one link, through the palette's existing text input mode. */
  beginRelabelLink(from: string, to: string, current: string): void
  /**
   * Open the palette's input mode on a masked token entry for `service`.
   * REQUIRED, not optional, for the reason toggleSetting and beginEditSetting
   * already are: an optional member here is a compile-time hole a
   * half-finished wiring passes straight through, and this app's own rule —
   * no stored secret ever reaches an agent process or an IPC reply — has no
   * runtime check that would catch a row silently doing nothing.
   */
  beginSetCredential(service: string): void
  /** Ask main to verify the stored token against the remote service. */
  verifyCredential(service: string): void
  /**
   * Gated by a confirm — see commands.ts's `credential.delete.*` row, whose
   * `destructive` flag is the OTHER half of the same rule deleteWorkspace and
   * deletePreset already state: a red row still runs on one Enter, and an
   * unmarked confirm is a question the user did not expect to be asked.
   */
  beginDeleteCredential(service: string): void
  /** M37. Flag or clear a user preset's worktree isolation; main refuses a built-in. */
  setPresetWorktree(id: string, on: boolean): void
  /**
   * M37. Confirm-gated, like deletePreset and beginDeleteCredential: the row
   * is destructive and a destructive row still runs on one Enter.
   */
  beginRemoveWorktree(id: string): void
  /** M37. Open the worktree's directory in Finder. */
  revealWorktree(id: string): void
  /** M39. Confirm-gated, like every destructive verb here: removes every panel's durable log. */
  beginClearScrollback(): void
  /**
   * Put a local file on the canvas. Opens main's native file dialog and mints
   * a file panel on a non-null reply.
   *
   * It EARNS a row for the reason openReview does and closePanel does not:
   * its only other gesture is a drag-and-drop onto the canvas, which needs a
   * Finder window already open beside this one and is unreachable from the
   * keyboard entirely.
   */
  openFile(): void
  /**
   * M27. Begin creating a note: prompt for a name, create the file under the
   * selected panel's cwd, and open it as a prose file panel already in edit
   * mode. Its own actions member rather than an argument to openFile, for the
   * reason moveSelectionToNewWorkspace is its own: WHICH action ran is the
   * only thing the plain-node tier can observe, and a create that could be
   * mistaken for an open is a create nothing here could pin.
   */
  newNote(): void
  /** M73. Mint a chat panel in the focused panel's directory (or home). */
  newChat(): void
  /** M74. A claude terminal's session, rendered and continued as a chat. */
  openAsChat(id: string): void
  /** M74. A chat's session, continued in a terminal with `claude --resume`. */
  openInTerminal(id: string): void
  openJira(): void
}

export interface PaletteContext {
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
  searchResults: ScrollbackSearchHit[] | null
  scrollbackEnabled: boolean
  /**
   * Panel ids currently in wants-you, from the renderer's own attention set.
   * Intersected with each row's panelIds — which is why WORKSPACE_LIST returns
   * ids and not a count: main does not hold this fact, the renderer does.
   */
  attentionIds: readonly string[]
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

// Reasons are exported so the checks assert the same strings the user reads,
// rather than a paraphrase that can drift away from the UI.
export const REASON_NO_FOCUS = 'click into a panel first'
export const REASON_NO_SELECTION = 'select some text in a panel first'
export const REASON_BUILT_IN_RENAME = "built-in presets can't be renamed"
export const REASON_BUILT_IN_DELETE = "built-in presets can't be deleted"
export const REASON_PROJECT_PROMPT = 'this prompt is a file in your project'
export const REASON_NOT_ON_PATH = 'not found on PATH'
/** M49. A font size belongs to a terminal; the other kinds set their own text. */
export const REASON_NOT_TERMINAL = 'only a terminal panel has a font size'
/** M50. One panel has nothing to be tidied against. */
export const REASON_TIDY_NEEDS_TWO = 'needs two panels on the canvas'
export const REASON_NOT_TERMINAL_OUTPUT = 'only a terminal panel has output to export'
export const REASON_SCROLLBACK_OFF = 'durable scrollback is off — turn on scrollback.persist in Settings'
export const REASON_ALREADY_DEFAULT = 'already the default'
/** M37. Three distinct reasons, never one shared "unavailable". */
export const REASON_BUILT_IN_WORKTREE = "built-in presets can't be changed — save a panel as a preset first"
export const REASON_NO_WORKTREES = 'no worktrees yet — spawn a panel from a preset that asks for one'
export const REASON_WORKTREE_ATTACHED = 'a panel is still running in it — close that panel first'
/** M42. Search's two failure states, distinct so the user gets the right fix. */
export const REASON_SEARCH_OFF = 'scrollback is off — turn on Keep output for search to read'
export const REASON_SEARCH_NO_MATCHES = 'try another word'
export const REASON_NO_PROMPTS = 'no prompts saved yet'
export const REASON_ALREADY_ACTIVE = 'already the active workspace'
export const REASON_NOT_STARTED = 'that panel has not started'
/**
 * M20. A THIRD distinct blocked situation for the mode rows, beside
 * REASON_NO_FOCUS and REASON_NOT_STARTED. Its fix is different from both:
 * not "click a panel" and not "start this one", but "this panel is not
 * running an agent CLI this app knows the flags for". agentArgs is gated on
 * spec.agent, so offering the verb here would promise a flag that is never
 * emitted — a row that appears to work and silently does nothing.
 */
export const REASON_NOT_AN_AGENT = 'that panel is not running a known agent'
// Deliberately NOT REASON_NO_SELECTION, which is about a TEXT selection inside
// a panel (the save-prompt row). Two different selections with two different
// gestures: collapsing them would tell a user who has selected text that they
// need to select text, which sends them to do the thing they already did.
export const REASON_NO_PANELS_SELECTED = 'select panels with a rubber-band drag first'
export const REASON_GROUP_NEEDS_TWO = 'select at least two panels to make a group'
/**
 * M61. Its own reason, not REASON_NO_FOCUS: the fix is "put this panel in a
 * group", which is a different gesture from "click a panel".
 */
export const REASON_NOT_IN_GROUP = 'the focused panel is not in a group'
/**
 * The merged view is read-only, so the move rows refuse there.
 *
 * An EXPORTED constant, like every reason above it, so that a check CAN
 * compare against the constant rather than against the literal — the rule
 * verify:palette 66b records, where a reason asserted as a string literal
 * keeps passing while the text the user actually reads says something else
 * entirely. Be honest about the tense: nothing imports this one yet. No check
 * asserts this reason today, and the export is what makes writing one a
 * one-line import rather than a temptation to paste the sentence.
 */
export const REASON_MERGED_READ_ONLY = 'the merged view is read-only — leave it to move panels'
export const REASON_NOTHING_TO_LINK = 'this canvas has only one panel'
export const REASON_BROADCAST_NEEDS_TWO = 'select at least two live terminal panels'
/**
 * Its OWN reason rather than REASON_NO_FOCUS, because the fix is different:
 * a note is rooted on the SELECTED panel, and selecting one is not the same
 * gesture as focusing one — a rail click does the first and never the second.
 * Telling a user to click into a panel when what they need is to select one
 * sends them to the wrong gesture.
 */
export const REASON_NO_NOTE_ROOT = 'select a panel first — a note is saved in its directory'
/** M73. One sentence for the palette row, the launcher line and the composer. */
export const REASON_NO_CLAUDE = REASON_CHAT_NO_CLAUDE
/** M74. The two front-end verbs' refusals, each naming its fix. */
export const REASON_TERMINAL_LIVE = 'stop the terminal first — one front-end at a time'
export const REASON_NOT_CLAUDE_SESSION = 'only a terminal started as a claude session can open as chat'
export const REASON_CHAT_BUSY = 'the chat is still answering — interrupt it first'
export const REASON_CHAT_EMPTY = 'send a message first — an empty chat has nothing to move'
export const REASON_NOT_CHAT = 'only a chat panel can open in a terminal'
/** M76. The one disabled row when nothing pends. */
export const REASON_NO_APPROVALS = 'no agent is asking for permission'

/** M76. A pending request as the palette lists it. */
export interface ApprovalRow {
  id: string
  requestId: string
  toolName: string
  argument: string
  label: string
}

/** M73. Whether a claude preset is available — the one fact the three chat doors share. */
export function claudeAvailable(presets: readonly PresetRow[]): boolean {
  return presets.some((p) => p.agent === 'claude-code' && p.available)
}

/** Present-means-unrunnable, so an undefined reason must not become a key. */
const withReason = (command: Command, reason: string | undefined): Command =>
  reason === undefined ? command : { ...command, disabledReason: reason }

/**
 * The words a section header now supplies, kept searchable.
 *
 * A spawn row reads "Claude" under NEW PANEL and a prompt row reads "review"
 * under PROMPTS, which is the whole readability win — but haystack() is
 * title + subtitle + searchText, so without somewhere to put the dropped
 * phrasing, "new panel" and "insert prompt" would stop finding rows they have
 * always found. The rows would still be there; they would simply stop being
 * reachable the way people reach them, which is the quietest kind of
 * regression this palette can have.
 */
const SPAWN_TERMS = 'new panel from preset spawn'
const INSERT_TERMS = 'insert prompt paste'

/**
 * One row per declared service (an ADD row) or two (VERIFY and DELETE),
 * standalone and testable without going through buildCommands — the same
 * split waitingCount already earns for a shared derivation. A service absent
 * from `stored` renders its add row; a service WITH a stored credential
 * never renders that row again, which is what makes "paste a token" and
 * "manage the one you already pasted" two different questions the palette
 * never conflates.
 *
 * A service that vanished from this list entirely — rather than rendering an
 * add row with no credential — would be indistinguishable from a service
 * this app does not support at all: verify:palette 31's rule, stated there
 * for the four preset/prompt admin row kinds, applies here unchanged.
 *
 * Every row is hiddenAtRest and scoped to 'credentials': a resting palette
 * with one row per declared service is exactly the kind of growth M6p sized
 * the resting list against, and the always-visible door into this scope is
 * `manage.credentials` below.
 */
export function buildCredentialRows(
  stored: readonly CredentialMeta[],
  services: readonly CredentialService[],
  actions: Pick<PaletteActions, 'beginSetCredential' | 'verifyCredential' | 'beginDeleteCredential'>
): Command[] {
  return services.flatMap((svc): Command[] => {
    const meta = stored.find((m) => m.service === svc.id)
    const base = { group: 'credential' as const, scope: 'credentials' as const, hiddenAtRest: true as const }
    if (!meta) {
      return [{
        ...base,
        id: `credential.set.${svc.id}`,
        title: `Add ${svc.label} token…`,
        searchText: `credential token sign in ${svc.label}`,
        run: () => actions.beginSetCredential(svc.id)
      }]
    }
    return [
      {
        ...base,
        id: `credential.verify.${svc.id}`,
        // The LABEL — what the remote service says the account is called, or
        // the service's own label before a first successful verify — never
        // anything derived from the token. See CredentialMeta's own comment.
        title: `Verify ${svc.label} (${meta.label})`,
        searchText: `credential check ${svc.label}`,
        run: () => actions.verifyCredential(svc.id)
      },
      {
        ...base,
        id: `credential.delete.${svc.id}`,
        title: `Delete ${svc.label} token`,
        destructive: true,
        searchText: `credential remove ${svc.label}`,
        run: () => actions.beginDeleteCredential(svc.id)
      }
    ]
  })
}

/**
 * Build the whole list. Section membership — not position — is what orders it:
 * filterCommands sorts by SECTIONS index first, so unlike M5b this function no
 * longer carries the grouping in its construction order. It is still written
 * in display order, because a reader who has to jump around the file to work
 * out what the palette looks like is a reader who will put a row in the wrong
 * section.
 */
export function buildCommands(ctx: PaletteContext): Command[] {
  const { actions } = ctx
  const out: Command[] = []

  // --- Panels --------------------------------------------------------------

  for (const panel of ctx.panels) {
    // "Go to" KEEPS its verb, asymmetrically: the other two rows lost the
    // prefix their header now supplies, and this one does not. Two reasons.
    // The Panels section holds goto rows AND "Rename panel…", so the verb is
    // still doing work — and verify:panels 39 finds this row by the literal
    // text "Go to" before recomputing centreOn's arithmetic to prove WHERE the
    // camera landed, which is the most delicate assertion in that suite.
    //
    // A user-set title rides as the SUBTITLE: haystack() includes it, so this
    // is what makes a panel named "auth refactor" findable by typing "auth".
    // Conditional, not `subtitle: panel.title`, so an untitled panel gets no
    // subtitle key at all rather than one holding undefined.
    // M64. Identity leads: the NAME (the user's title when set), then a hint
    // of the state word and the path cut from the left. The path is
    // `pathText`, matched only as a contiguous substring — never fuzzy, so
    // typing "group" no longer lights g…o…u…p across /private/var. The
    // user's title and the name are the searchText, so a title still finds
    // its row.
    // No "Go to" prefix (M64, after the critic): ten rows under a PANELS
    // heading repeating the verb pushed identity six characters right. The
    // verb lives in the footer ("↵ go to") and in searchText, so typing
    // "go to" still lists every panel. The state word is rendered LIVE by
    // the palette from `state` + the store, in its tone; the build-time
    // `stateWord` is only the `state:` query's key.
    const name = panel.title ?? panel.name ?? panel.label
    out.push({
      id: `panel.goto.${panel.id}`,
      title: name,
      mono: true,
      ...(panel.path === undefined ? {} : { subtitle: shortPath(panel.path), pathText: panel.path }),
      ...(panel.state === undefined ? {} : { state: { id: panel.id, input: panel.state } }),
      ...(panel.stateWord === undefined ? {} : { stateWord: panel.stateWord, statePriority: statePriority(panel.stateWord) }),
      searchText: `go to ${panel.title !== undefined ? `${panel.title} ${panel.name ?? ''}` : (panel.name ?? '')}`,
      group: 'panel',
      run: () => actions.goToPanel(panel.id)
    })
  }

  {
    const target = ctx.panels.find((p) => p.id === ctx.capturedId)
    out.push(
      withReason(
        {
          id: 'panel.rename',
          title: 'Rename panel…',
          subtitle: target ? (target.title ?? target.label) : 'no panel',
          group: 'panel',
          run: () => actions.beginRenamePanel(ctx.capturedId!, target?.title ?? '')
        },
        // Aimed at the CAPTURED panel, not at a row's own panel: opening the
        // palette moves DOM focus to the input but deliberately leaves
        // focusedId alone, and that captured id is what every panel-acting
        // command targets.
        ctx.capturedId === null ? REASON_NO_FOCUS : undefined
      )
    )
    // M74. The two front-end verbs, aimed at the captured panel like Restart,
    // each refused BY NAME in every situation it cannot apply — never hidden.
    const termLive = target !== undefined && target.kind === 'terminal' && target.state?.status?.kind === 'running'
    out.push(
      withReason(
        {
          id: 'panel.open-as-chat',
          title: 'Open as chat',
          subtitle: target ? (target.title ?? target.label) : 'no panel',
          searchText: 'open as chat conversation front-end claude session transcript',
          group: 'panel',
          run: () => actions.openAsChat(ctx.capturedId!)
        },
        ctx.capturedId === null ? REASON_NO_FOCUS
          : target === undefined || target.kind !== 'terminal' || target.claude !== true ? REASON_NOT_CLAUDE_SESSION
            : termLive ? REASON_TERMINAL_LIVE : undefined
      )
    )
    // M76. Two rows per pending request, named with the tool and the panel;
    // with nothing pending ONE disabled row whose reason says so. The rows
    // are what the OS notification, the popover and the pane all lead to:
    // an answer given from wherever the user is.
    const approvals = ctx.approvals ?? []
    for (const a of approvals) {
      const where = `${a.toolName} · ${a.label}`
      out.push({
        id: `approval.allow.${a.id}.${a.requestId}`, title: `Allow ${where}`, subtitle: a.argument, mono: true,
        searchText: `allow approve permission needs you ${a.toolName} ${a.label}`, group: 'panel',
        run: () => actions.answerApproval(a.id, a.requestId, true)
      })
      out.push({
        id: `approval.deny.${a.id}.${a.requestId}`, title: `Deny ${where}`, subtitle: a.argument, mono: true,
        searchText: `deny refuse permission needs you ${a.toolName} ${a.label}`, group: 'panel',
        run: () => actions.answerApproval(a.id, a.requestId, false)
      })
    }
    if (approvals.length === 0) {
      out.push(withReason({
        id: 'approval.none', title: 'Answer a permission request…', searchText: 'allow deny approve permission needs you', group: 'panel', hiddenAtRest: true,
        run: () => {}
      }, REASON_NO_APPROVALS))
    }
    out.push(
      withReason(
        {
          id: 'panel.open-in-terminal',
          title: 'Open in terminal',
          subtitle: target ? (target.title ?? target.label) : 'no panel',
          searchText: 'open in terminal front-end resume claude session',
          group: 'panel',
          run: () => actions.openInTerminal(ctx.capturedId!)
        },
        ctx.capturedId === null ? REASON_NO_FOCUS
          : target === undefined || target.kind !== 'chat' ? REASON_NOT_CHAT
            : target.busy === true ? REASON_CHAT_BUSY
              : (target.turns ?? 0) === 0 ? REASON_CHAT_EMPTY : undefined
      )
    )
    out.push(
      withReason(
        {
          id: 'panel.restart',
          title: 'Restart panel…',
          subtitle: target ? (target.title ?? target.label) : 'no panel',
          group: 'panel',
          run: () => actions.restartPanel(ctx.capturedId!)
        },
        // TWO different blocked situations with two different fixes: "click a
        // panel first" and "this panel has not started". Collapsing them into
        // one reason tells a user who HAS focused a panel to focus a panel,
        // which is worse than no reason at all — it sends them to do the one
        // thing they already did. Not hiddenAtRest, and a plain withReason
        // call, both matching the Rename row directly above: two adjacent rows
        // aimed at the same captured panel that behaved differently would read
        // as a surprise rather than as a design.
        ctx.capturedId === null
          ? REASON_NO_FOCUS
          : (target?.restartable === true ? undefined : REASON_NOT_STARTED)
      )
    )
    // M20. The door, and one row per permission mode inside it.
    //
    // ONE ROW PER VALUE rather than a SettingDef: `SettingDef['type']` has no
    // 'enum' member, and CLAUDE.md records that removal as deliberate — a
    // customer-free abstraction per ideas-backlog #11. A multi-valued choice
    // expressed as N command rows inside a scope needs no such type at all, so
    // that decision stays closed. These are per-PANEL anyway, not global, so a
    // setting would have been the wrong shape even if the type existed.
    out.push(
      withReason(
        {
          id: 'panel.mode',
          title: 'Restart in permission mode…',
          subtitle: target ? (target.title ?? target.label) : 'no panel',
          group: 'panel',
          searchText: 'permission mode plan accept edits bypass agent claude',
          hiddenAtRest: true,
          entersScope: 'agent-mode',
          run: () => {}
        },
        // The same two distinct reasons panel.restart carries, plus a third of
        // this verb's own: a panel with no agent has no mode to be in, and
        // offering the verb there would promise something the flag cannot do —
        // agentArgs is gated on spec.agent, so it would emit nothing at all.
        ctx.capturedId === null
          ? REASON_NO_FOCUS
          : target?.restartable !== true
            ? REASON_NOT_STARTED
            : target?.agent !== true
              ? REASON_NOT_AN_AGENT
              : undefined
      )
    )
    for (const mode of PERMISSION_MODES) {
      out.push(
        withReason(
          {
            id: `panel.mode.${mode}`,
            title: mode,
            subtitle: target ? (target.title ?? target.label) : 'no panel',
            group: 'panel',
            scope: 'agent-mode',
            hiddenAtRest: true,
            searchText: `permission mode ${mode}`,
            run: () => actions.restartPanelWithMode(ctx.capturedId!, mode)
          },
          ctx.capturedId === null
            ? REASON_NO_FOCUS
            : target?.restartable !== true
              ? REASON_NOT_STARTED
              : target?.agent !== true
                ? REASON_NOT_AN_AGENT
                : undefined
        )
      )
    }
    out.push(
      withReason(
        {
          id: 'panel.link',
          title: 'Link this panel to\u2026',
          subtitle: target ? (target.title ?? target.label) : 'no panel',
          group: 'panel',
          run: () => actions.beginLink(ctx.capturedId!)
        },
        // TWO different blocked situations with two different fixes, the shape
        // panel.restart and panel.review both state: "click a panel first" and
        // "there is nothing on this canvas to link to". Collapsing them tells
        // a user who HAS selected a panel to select a panel.
        //
        // The second is this verb's own case rather than a copy: a link needs
        // a SECOND endpoint, so a canvas holding one panel can offer the verb
        // and never complete it.
        ctx.capturedId === null
          ? REASON_NO_FOCUS
          : (ctx.panels.length < 2 ? REASON_NOTHING_TO_LINK : undefined)
      )
    )
    out.push(
      withReason(
        {
          id: 'panel.toolbox',
          title: target === undefined ? 'Open toolbox' : `Open toolbox for ${target.label}`,
          searchText: 'toolbox skills mcp hooks commands subagents permissions what can this agent do',
          group: 'panel',
          run: () => { if (target !== undefined) actions.openToolbox(target.id) }
        },
        // ONE reason, not two, and the difference from the Restart and review
        // rows beside it is the point: those gate on "has this panel ever
        // spawned", because a baseline only exists once it has. A toolbox
        // answers for a DIRECTORY, which a panel has from the moment it is
        // minted — so a panel that never started still has a perfectly good
        // toolbox, and refusing one here would be a wrong answer rather than
        // a cautious one.
        ctx.capturedId === null ? REASON_NO_FOCUS : undefined
      )
    )
    out.push(
      withReason(
        {
          id: 'panel.review',
          title: target === undefined ? 'Open review' : `Open review of ${target.label}`,
          searchText: 'review changes diff git what changed',
          group: 'panel',
          run: () => { if (target !== undefined) actions.openReview(target.id) }
        },
        // The SAME field the Restart row gates on, deliberately not a second
        // boolean: "has this panel ever spawned" is one fact, and it is
        // exactly the question both verbs ask — a panel that never started
        // has no baseline, so there is nothing to review it against. Two
        // flags derived from one status would agree the day they were
        // written and disagree the first time one of them was wrong.
        ctx.capturedId === null || target === undefined
          ? REASON_NO_FOCUS
          : (target.restartable ? undefined : REASON_NOT_STARTED)
      )
    )
  }

  // --- New panel -----------------------------------------------------------

  // NOT hiddenAtRest, unlike every administration row: this is a create verb
  // like a preset spawn, not an admin one, and it takes no target — there is
  // no captured panel to gate it on and therefore no state in which it is
  // disabled. A row that is only reachable by guessing its query is
  // indistinguishable from a feature that was never built (verify:palette 31's
  // rule), and this feature's other gesture is a drop, which the keyboard
  // cannot reach at all. It lives in THIS section, not Panels, for the same
  // reason: Panels holds verbs about a panel that already exists (go to,
  // rename, restart, review); this one mints a new one, exactly what every
  // row below it does.
  // M65. The considered way to start a panel — where, what, how — first in
  // the section that mints panels, with its chord. ⌘N stays the instant
  // default (the row below carries that chip).
  out.push({
    id: 'spawn.sheet',
    title: 'New panel…',
    subtitle: 'choose the directory, the preset or a command, and the agent\'s mode',
    searchText: 'new panel start spawn sheet directory command task where',
    group: 'spawn',
    shortcut: '⌘⇧N',
    run: () => actions.beginSpawnSheet()
  })

  out.push({
    id: 'panel.open-file',
    title: 'Open file…',
    searchText: 'open file read view text document',
    group: 'spawn',
    run: () => actions.openFile()
  })

  // M27. A note is a file panel in prose mode, so this sits beside Open file…
  // as a second CREATE verb rather than anywhere new. Visible at rest for
  // that row's reason: it is the only gesture in the app that makes one, so a
  // hidden row would be a feature reachable only by someone who already knew
  // it existed. Disabled-with-a-reason rather than absent when there is
  // nowhere to put it — verify:palette 31's standing rule.
  out.push(
    withReason(
      {
        id: 'panel.new-note',
        title: 'New note…',
        searchText: 'new note markdown scratch write jot memo notes',
        group: 'spawn',
        run: () => actions.newNote()
      },
      ctx.noteRoot === null ? REASON_NO_NOTE_ROOT : undefined
    )
  )

  // M73. A chat with claude is the third CREATE verb, beside Open file… and
  // New note…, visible at rest for their reason. Disabled BY NAME when the
  // CLI is not on the login PATH — derived from the claude preset row's own
  // availability, so the palette, the launcher and the sheet cannot
  // disagree about whether it was found.
  out.push(
    withReason(
      {
        id: 'panel.new-chat',
        title: 'New chat…',
        searchText: 'new chat claude conversation agent talk ask',
        group: 'spawn',
        run: () => actions.newChat()
      },
      claudeAvailable(ctx.presets) ? undefined : REASON_NO_CLAUDE
    )
  )

  for (const preset of ctx.presets) {
    out.push(
      withReason(
        {
          id: `preset.spawn.${preset.id}`,
          title: preset.name,
          subtitle: preset.subtitle,
          searchText: SPAWN_TERMS,
          group: 'spawn',
          scope: 'presets',
          // On the DEFAULT preset's row and no other. CLAUDE.md records that
          // this feature sat inert for a whole milestone because nothing
          // anywhere said what Cmd+N would spawn — the stock canvas looked
          // correct and only a user who hand-edited defaultPresetId could
          // tell. A hint on every row would be a lie on all but one.
          ...(preset.isDefault ? { shortcut: '⌘N' } : {}),
          run: () => actions.spawnPreset(preset.id)
        },
        preset.available ? undefined : REASON_NOT_ON_PATH
      )
    )
  }

  // --- Prompts -------------------------------------------------------------

  for (const prompt of ctx.prompts) {
    // The source is on the ROW, and same-named prompts are never merged:
    // pasting the wrong project's context into an agent is silent and costly.
    const subtitle = prompt.source === 'project' ? 'project — .claude/commands' : 'saved'
    out.push(
      withReason(
        {
          id: `prompt.insert.${prompt.id}`,
          title: prompt.name,
          subtitle,
          searchText: INSERT_TERMS,
          group: 'prompt',
          scope: 'prompts',
          run: () => actions.insertPrompt(prompt.id)
        },
        ctx.capturedId === null ? REASON_NO_FOCUS : undefined
      )
    )
  }

  out.push(
    withReason(
      {
        id: 'prompt.save',
        title: 'Save selection as prompt',
        group: 'prompt',
        scope: 'prompts',
        run: () => actions.beginSavePrompt()
      },
      // Which one is missing, not just that something is: "no focused panel"
      // and "select some text" send the user to two different actions.
      ctx.capturedId === null
        ? REASON_NO_FOCUS
        : ctx.hasSelection
          ? undefined
          : REASON_NO_SELECTION
    )
  )

  // --- Workspaces ------------------------------------------------------------

  for (const w of ctx.workspaces) {
    // The shared derivation, not a second copy of it — the rail's Workspaces
    // section renders the same number and must not compute it again.
    const waiting = waitingCount(w.panelIds, ctx.attentionIds)
    out.push(
      withReason(
        {
          id: `workspace.switch.${w.id}`,
          // The bare name. The count is transient state, not a name, and
          // `title` feeds `haystack()` unconditionally — so the count lives
          // on `waiting` instead, which the view composes into what it
          // renders, and the matcher never sees.
          title: w.name,
          ...(waiting > 0 ? { waiting } : {}),
          searchText: 'switch workspace canvas go to',
          group: 'workspace',
          run: () => actions.switchWorkspace(w.id)
        },
        w.active ? REASON_ALREADY_ACTIVE : undefined
      )
    )
  }

  out.push({
    id: 'workspace.create',
    title: 'New workspace…',
    searchText: 'create add canvas workspace',
    group: 'workspace',
    run: () => actions.beginCreateWorkspace()
  })

  // --- Canvas --------------------------------------------------------------

  out.push({
    // "Reset zoom", not "Zoom to fit": useViewport exposes resetViewport
    // (Cmd+0's INITIAL) and deliberately not fitTo (Cmd+1), because the camera
    // setter stays private and only named verbs get out. The row says what it
    // does rather than what the spec first called it.
    id: 'canvas.fit',
    title: 'Reset zoom',
    group: 'canvas',
    shortcut: '⌘0',
    run: () => actions.zoomToFit()
  })
  out.push({
    // The row is deliberately NOT hiddenAtRest, unlike every administration
    // row: this is a whole VIEW MODE, and its only other gesture is one
    // toolbar button a user may never have looked at. It says "Merged view"
    // rather than which way the toggle currently sits, because — unlike a
    // setting row — the canvas itself is the readout: a user in the merged
    // view is looking at four lanes.
    id: 'canvas.merged',
    title: 'Merged view: every workspace at once',
    searchText: 'merge merged workspaces lanes all overview toggle',
    group: 'canvas',
    run: () => actions.toggleMerged()
  })
  out.push({
    id: 'canvas.reset',
    title: 'Reset canvas…',
    group: 'canvas',
    run: () => actions.resetCanvas()
  })

  // --- Placement (M50) -------------------------------------------------------
  //
  // Tidy the SELECTION when two or more are selected, everything otherwise;
  // disabled with a reason on a lone panel. One undoable step, never twenty,
  // and never a reorder — the arrangement is the information the canvas was
  // carrying.
  {
    const useSelection = ctx.selectedIds.length >= 2
    const ids = useSelection ? [...ctx.selectedIds] : ctx.panels.map((p) => p.id)
    out.push(withReason({
      id: 'panel.tidy',
      title: useSelection ? `Tidy the selection (${ctx.selectedIds.length} panels)` : 'Tidy everything',
      subtitle: 'compact without reordering — one undo',
      group: 'panel',
      searchText: 'tidy arrange compact grid align clean up layout',
      run: () => actions.tidyPanels(ids)
    }, ctx.panels.length < 2 ? REASON_TIDY_NEEDS_TWO : undefined))
  }

  // --- Prompts (M52) ---------------------------------------------------------
  //
  // Navigation over the shell's own marks, on the focused terminal. A panel
  // with no shell integration (an agent CLI, an undecorated shell) has no
  // marks; the rows stay, and the action answers with nothing to jump to.
  {
    const target = ctx.capturedId === null ? undefined : ctx.panels.find((p) => p.id === ctx.capturedId)
    const reason = ctx.capturedId === null || target === undefined
      ? REASON_NO_FOCUS
      : (target.kind === 'terminal' ? undefined : REASON_NOT_TERMINAL)
    out.push(withReason({ id: 'panel.prompt.previous', title: 'Previous prompt', subtitle: 'scroll to the command before this one', group: 'panel', searchText: 'prompt previous up jump command mark', hiddenAtRest: true,
      run: () => { if (target !== undefined) actions.jumpPrompt(target.id, -1) } }, reason))
    out.push(withReason({ id: 'panel.prompt.next', title: 'Next prompt', subtitle: 'scroll to the command after this one', group: 'panel', searchText: 'prompt next down jump command mark', hiddenAtRest: true,
      run: () => { if (target !== undefined) actions.jumpPrompt(target.id, 1) } }, reason))
    out.push(withReason({ id: 'panel.copy-last-output', title: 'Copy last command’s output', subtitle: 'the lines between its start and end marks', group: 'panel', searchText: 'copy last output command result clipboard', hiddenAtRest: true,
      run: () => { if (target !== undefined) actions.copyLastOutput(target.id) } }, reason))
  }

  // --- Export (M58) -----------------------------------------------------------
  //
  // The panel row reads the DURABLE log, so scrollback off is its own reason
  // (a different fix from "focus a panel"); the xterm buffer is never a
  // fallback, because that is a truncation the user cannot see.
  {
    const target = ctx.capturedId === null ? undefined : ctx.panels.find((p) => p.id === ctx.capturedId)
    const reason = ctx.capturedId === null || target === undefined
      ? REASON_NO_FOCUS
      : (target.kind !== 'terminal' ? REASON_NOT_TERMINAL_OUTPUT : (ctx.scrollbackEnabled === false ? REASON_SCROLLBACK_OFF : undefined))
    out.push(withReason({
      id: 'panel.export-text',
      title: 'Export panel output…',
      subtitle: 'everything the durable log holds (2 MB), ANSI stripped, secrets scrubbed, to a file',
      searchText: 'export save output text transcript file panel',
      group: 'panel',
      run: () => { if (target !== undefined) actions.exportPanelText(target.id) }
    }, reason))
    out.push({
      id: 'canvas.export-png',
      title: 'Export canvas as PNG…',
      subtitle: 'the window as it is — live terminals and cards alike — to an image',
      searchText: 'export save screenshot png image picture canvas',
      group: 'canvas',
      run: () => actions.exportCanvasPng()
    })
  }

  // --- Typography (M49) ------------------------------------------------------
  //
  // Three COMMIT rows on the focused terminal, no slider: a font size change
  // is a resize wearing a hat (fewer columns, a pty:resize, a SIGWINCH, a full
  // TUI repaint), and a slider that refits on every tick is sixty of those a
  // second. Each press is one commit. Disabled with a reason on nothing and on
  // a sessionless kind, never absent.
  {
    const target = ctx.capturedId === null ? undefined : ctx.panels.find((p) => p.id === ctx.capturedId)
    const reason = ctx.capturedId === null || target === undefined
      ? REASON_NO_FOCUS
      : (target.kind === 'terminal' ? undefined : REASON_NOT_TERMINAL)
    const current = target?.fontSize ?? ctx.globalFontSize ?? 13
    const fontRow = (id: string, title: string, next: number | undefined, searchText: string): Command => withReason({
      id, title, group: 'panel', searchText, hiddenAtRest: true,
      run: () => { if (target !== undefined) actions.setPanelFontSize(target.id, next) }
    }, reason)
    out.push(fontRow('panel.font.larger', target === undefined ? 'Font: larger' : `Font: larger (${current} → ${Math.min(24, current + 1)})`, Math.min(24, current + 1), 'font bigger larger size text zoom'))
    out.push(fontRow('panel.font.smaller', target === undefined ? 'Font: smaller' : `Font: smaller (${current} → ${Math.max(9, current - 1)})`, Math.max(9, current - 1), 'font smaller size text'))
    out.push(fontRow('panel.font.default', target?.fontSize === undefined ? 'Font: default (already)' : `Font: default (${current} → global)`, undefined, 'font default reset global size text'))
  }

  // --- Settings ------------------------------------------------------------
  //
  // hiddenAtRest, like every administration row: M6c/M6d add more toggles, and
  // the resting list stays the ~8 rows M6p sized it to rather than growing one
  // row per setting. The door below is the always-visible way in.

  for (const setting of ctx.settings) {
    if (setting.type === 'boolean') {
      const on = setting.value === true
      out.push({
        id: `setting.${setting.id}`,
        title: `${setting.label}: ${on ? 'On' : 'Off'}`,
        subtitle: setting.description,
        // The synonyms, where the matcher can see them and the row cannot show
        // them. Without this the row is findable only by its own label — and
        // ideas-backlog #11's whole argument for a searchable settings surface
        // is that a user looking for the theme types "dark", not "theme".
        searchText: setting.keywords.join(' '),
        group: 'setting',
        scope: 'settings',
        hiddenAtRest: true,
        run: () => actions.toggleSetting(setting.id, !on)
      })
      continue
    }
    if (setting.type === 'number') {
      const current = typeof setting.value === 'number' ? setting.value : 0
      out.push({
        id: `setting.${setting.id}`,
        // The value is in the TITLE, not only in the input it opens: a row
        // that said just "Idle after" would put the user in an edit field
        // with no idea what they are changing it from.
        title: `${setting.label}: ${current}`,
        subtitle: setting.description,
        searchText: setting.keywords.join(' '),
        group: 'setting',
        scope: 'settings',
        hiddenAtRest: true,
        // NOT toggleSetting. `!1500` is `false`, which a number setting's
        // store refuses — silently, leaving the row unchanged and the user
        // with no idea why pressing Enter did nothing.
        run: () => actions.beginEditSetting(setting.id, setting.label, current)
      })
      continue
    }
    if (setting.type === 'enum') {
      // M45. A CYCLE, not a submenu: the palette has one row shape, and a
      // three-value setting is one press per step. The title names the
      // current value so the user knows what they are stepping from, and
      // the write is the NEXT value in the schema's order, wrapping — through
      // toggleSetting, which is a plain write of a SettingValue and never
      // cared that its value was a boolean.
      const values = setting.values ?? []
      const current = typeof setting.value === 'string' ? setting.value : String(setting.value)
      const at = values.indexOf(current)
      const next = values.length === 0 ? current : values[(at + 1) % values.length]
      out.push({
        id: `setting.${setting.id}`,
        title: `${setting.label}: ${current}`,
        subtitle: setting.description,
        searchText: setting.keywords.join(' '),
        group: 'setting',
        scope: 'settings',
        hiddenAtRest: true,
        run: () => actions.toggleSetting(setting.id, next)
      })
      continue
    }
    // Any future type has no row yet — building a mode for a type with no
    // customer would repeat the trap ideas-backlog #11 warns about for the
    // schema itself. Falls through to nothing pushed.
  }

  // --- Environment (M48) -----------------------------------------------------
  // --- Bookmarks (M56) ---------------------------------------------------------
  out.push({
    id: 'bookmark.add',
    title: 'Bookmark this view',
    subtitle: 'save where the camera is, to come back to',
    searchText: 'bookmark save view camera place',
    group: 'bookmark',
    run: () => actions.addBookmark()
  })
  for (const b of ctx.bookmarks ?? []) {
    out.push({
      id: `bookmark.go.${b.id}`,
      title: `Go to “${b.name}”`,
      searchText: `bookmark go ${b.name}`,
      group: 'bookmark',
      run: () => actions.goToBookmark(b.id)
    })
    out.push({
      id: `bookmark.rename.${b.id}`,
      title: `Rename bookmark “${b.name}”…`,
      searchText: `bookmark rename ${b.name}`,
      group: 'bookmark',
      hiddenAtRest: true,
      run: () => actions.beginRenameBookmark(b.id, b.name)
    })
    out.push({
      id: `bookmark.delete.${b.id}`,
      title: `Delete bookmark “${b.name}”…`,
      searchText: `bookmark delete remove ${b.name}`,
      group: 'bookmark',
      hiddenAtRest: true,
      destructive: true,
      run: () => actions.deleteBookmark(b.id, b.name)
    })
  }
  const trail = ctx.cameraTrail ?? { back: false, forward: false }
  out.push(
    withReason(
      { id: 'camera.back', title: 'Camera: back', subtitle: '⌘[ — where the camera was before the last jump', searchText: 'camera back previous view undo', group: 'bookmark', run: () => actions.cameraBack() },
      trail.back ? undefined : 'nothing to go back to'
    ),
    withReason(
      { id: 'camera.forward', title: 'Camera: forward', subtitle: '⌘] — the jump that was undone', searchText: 'camera forward redo view', group: 'bookmark', run: () => actions.cameraForward() },
      trail.forward ? undefined : 'nothing to go forward to'
    )
  )

  out.push(...buildEnvironmentRows(ctx.envReport ?? null))

  // --- Credentials -----------------------------------------------------------
  //
  // One shared builder, not a second copy of the ADD/VERIFY/DELETE branching
  // written inline here — buildCredentialRows is exported precisely so it can
  // be driven directly by verify:palette without constructing a whole
  // PaletteContext.
  out.push(...buildCredentialRows(ctx.credentials, SERVICES, actions))
  if (ctx.credentials.some((credential) => credential.service === 'jira')) {
    out.push({ id: 'jira.open', title: 'Open Jira tickets', subtitle: 'Assigned to you', searchText: 'jira tickets assigned work', group: 'manage', run: () => actions.openJira() })
  }

  // --- Manage --------------------------------------------------------------
  //
  // Everything below is hiddenAtRest except the two doors, and the doors are
  // why the hiding is honest. Administration stays one keystroke away (type
  // "delete" and it is back, in this section) rather than one guess away.

  // The doors. `entersScope` rather than a callback, and `run` is genuinely a
  // no-op: entering a drill-in is view state that never leaves Palette.tsx, so
  // routing it through Canvas.tsx would make the canvas a stakeholder in which
  // rows the palette is currently showing — and the view has to know BEFORE it
  // runs the row, because running one normally closes the overlay.
  out.push({
    id: 'manage.presets',
    title: 'Manage presets…',
    subtitle: `${ctx.presets.length} preset${ctx.presets.length === 1 ? '' : 's'}`,
    group: 'manage',
    entersScope: 'presets',
    run: () => {}
  })
  out.push(
    withReason(
      {
        id: 'manage.prompts',
        title: 'Manage prompts…',
        subtitle: `${ctx.prompts.length} prompt${ctx.prompts.length === 1 ? '' : 's'}`,
        group: 'manage',
        entersScope: 'prompts',
        run: () => {}
      },
      ctx.prompts.length === 0 ? REASON_NO_PROMPTS : undefined
    )
  )
  {
    // Booleans AND numbers now produce rows, so the count is the length again
    // — but derive it from the same predicate the loop uses rather than from
    // ctx.settings.length, so a future type that produces no row (an enum,
    // still uncustomered) cannot make this door claim a setting the scope
    // does not show.
    const settingCount = ctx.settings.filter(
      (s) => s.type === 'boolean' || s.type === 'number'
    ).length
    out.push({
      id: 'manage.settings',
      title: 'Manage settings…',
      subtitle: `${settingCount} setting${settingCount === 1 ? '' : 's'}`,
      group: 'manage',
      entersScope: 'settings',
      run: () => {}
    })
  }
  out.push({
    id: 'manage.workspaces',
    title: 'Manage workspaces…',
    subtitle: `${ctx.workspaces.length} workspace${ctx.workspaces.length === 1 ? '' : 's'}`,
    group: 'manage',
    entersScope: 'workspaces',
    run: () => {}
  })
  out.push({
    id: 'manage.credentials',
    title: 'Manage credentials…',
    subtitle: `${ctx.credentials.length} of ${SERVICES.length} connected`,
    group: 'manage',
    entersScope: 'credentials',
    run: () => {}
  })

  for (const preset of ctx.presets) {
    out.push(
      withReason(
        {
          id: `preset.rename.${preset.id}`,
          title: `Rename preset ${preset.name}`,
          group: 'manage',
          scope: 'presets',
          hiddenAtRest: true,
          run: () => actions.beginRenamePreset(preset.id, preset.name)
        },
        preset.builtIn ? REASON_BUILT_IN_RENAME : undefined
      )
    )
    out.push(
      withReason(
        {
          id: `preset.delete.${preset.id}`,
          title: `Delete preset ${preset.name}`,
          group: 'manage',
          scope: 'presets',
          hiddenAtRest: true,
          destructive: true,
          run: () => actions.deletePreset(preset.id)
        },
        preset.builtIn ? REASON_BUILT_IN_DELETE : undefined
      )
    )
    out.push(
      withReason(
        {
          id: `preset.default.${preset.id}`,
          title: `Make ${preset.name} the Cmd+N default`,
          group: 'manage',
          scope: 'presets',
          hiddenAtRest: true,
          run: () => actions.setDefaultPreset(preset.id)
        },
        preset.isDefault ? REASON_ALREADY_DEFAULT : undefined
      )
    )
    // M37. A toggle that names its CURRENT state rather than a pair of rows:
    // two rows (turn on / turn off) with one always disabled would be two
    // rows describing one fact. A built-in stays visible and refuses with a
    // reason that says what to do instead.
    out.push(
      withReason(
        {
          id: `preset.worktree.${preset.id}`,
          title: `Spawn ${preset.name} in a fresh worktree: ${preset.worktree === true ? 'on' : 'off'}`,
          group: 'manage',
          scope: 'presets',
          hiddenAtRest: true,
          searchText: 'worktree isolate branch git',
          run: () => actions.setPresetWorktree(preset.id, preset.worktree !== true)
        },
        preset.builtIn ? REASON_BUILT_IN_WORKTREE : undefined
      )
    )
  }

  // M39. The durable log's one verb. Hidden at rest and destructive, like
  // the credential and preset deletes: a row that clears every panel's
  // recorded output must not sit beside "Go to n1" under a query aimed
  // elsewhere, and a user who wants it types "scrollback" or "clear".
  out.push({
    id: 'canvas.clear-scrollback',
    title: 'Clear scrollback logs',
    subtitle: 'removes every panel’s recorded output from disk',
    group: 'canvas',
    hiddenAtRest: true,
    destructive: true,
    searchText: 'scrollback history log output clear delete disk',
    run: () => actions.beginClearScrollback()
  })

  // M37. The worktree door and its rows. The door is present at rest and
  // disabled with a reason when there are none: a door that vanished would
  // read as a feature that was never built, the rule every other door here
  // already obeys.
  out.push(
    withReason(
      {
        id: 'manage.worktrees',
        title: 'Manage worktrees…',
        subtitle: `${ctx.worktrees.length} worktree${ctx.worktrees.length === 1 ? '' : 's'}`,
        group: 'manage',
        entersScope: 'worktrees',
        searchText: 'worktree branch git isolate',
        run: () => {}
      },
      ctx.worktrees.length === 0 ? REASON_NO_WORKTREES : undefined
    )
  )
  for (const wt of ctx.worktrees) {
    const who = wt.attached ? ` — ${wt.panelTitle ?? wt.panelId} is in it` : ''
    out.push(
      withReason(
        {
          id: `worktree.remove.${wt.id}`,
          title: `Remove worktree ${wt.branch}`,
          subtitle: `${wt.path}${who}`,
          group: 'manage',
          scope: 'worktrees',
          hiddenAtRest: true,
          destructive: true,
          searchText: `worktree remove delete ${wt.path} ${wt.root}`,
          run: () => actions.beginRemoveWorktree(wt.id)
        },
        wt.attached ? REASON_WORKTREE_ATTACHED : undefined
      )
    )
    out.push({
      id: `worktree.reveal.${wt.id}`,
      title: `Reveal worktree ${wt.branch} in Finder`,
      subtitle: wt.path,
      group: 'manage',
      scope: 'worktrees',
      hiddenAtRest: true,
      searchText: `worktree reveal open finder ${wt.path} ${wt.root}`,
      run: () => actions.revealWorktree(wt.id)
    })
  }

  for (const prompt of ctx.prompts) {
    const subtitle = prompt.source === 'project' ? 'project — .claude/commands' : 'saved'
    out.push(
      withReason(
        {
          id: `prompt.delete.${prompt.id}`,
          title: `Delete prompt: ${prompt.name}`,
          subtitle,
          group: 'manage',
          scope: 'prompts',
          hiddenAtRest: true,
          destructive: true,
          run: () => actions.deletePrompt(prompt.id)
        },
        prompt.source === 'project' ? REASON_PROJECT_PROMPT : undefined
      )
    )
  }

  // hiddenAtRest for the reason every other admin row is: two rows per
  // workspace un-hidden would put the resting list back past the roughly-
  // eight-row budget M6p sized it to. They stay findable by query — typing
  // "delete" surfaces them — because a row that disappears is
  // indistinguishable from a feature that is missing.
  // The selection size, phrased once. Every move row says it, because the row
  // is the only place a user learns HOW MANY panels the verb is about — the
  // marquee that built the selection is long gone by the time the palette is
  // open, and a row reading only "Move to school" is a verb with an invisible
  // object.
  const count = `${ctx.selectedIds.length} panel${ctx.selectedIds.length === 1 ? '' : 's'}`

  // M61. The two verbs GroupLayer's header carries, on the group holding the
  // CAPTURED panel. One pair, never one per group: a row per group would
  // scale with the canvas (removeLink's rule), and the captured panel is
  // what every other panel verb in this palette already targets.
  {
    const held = ctx.capturedId === null ? undefined : (ctx.groups ?? []).find((g) => g.panelIds.includes(ctx.capturedId as string))
    const reason = ctx.merged
      ? REASON_MERGED_READ_ONLY
      : (ctx.capturedId === null ? REASON_NO_FOCUS : (held === undefined ? REASON_NOT_IN_GROUP : undefined))
    const name = held === undefined ? '' : ` “${held.label}”`
    out.push(withReason({
      id: 'group.toggle',
      title: held?.collapsed ? `Expand group${name}` : `Card group${name}`,
      subtitle: held?.collapsed ? 'show its panels again' : 'fold its panels to cards — nothing is closed',
      searchText: 'group collapse expand card fold unfold',
      group: 'canvas',
      run: () => { if (held !== undefined) actions.toggleGroup(held.id) }
    }, reason))
    out.push(withReason({
      id: 'group.remove',
      title: `Remove group${name}`,
      subtitle: 'the frame goes; its panels stay',
      searchText: 'group remove delete ungroup dissolve',
      group: 'canvas',
      run: () => { if (held !== undefined) actions.removeGroup(held.id) }
    }, reason))
  }

  out.push(
    withReason(
      {
        id: 'canvas.group-selection',
        title: `Group ${count}…`,
        searchText: 'group selected panels region label',
        group: 'canvas',
        run: () => actions.beginCreateGroup(ctx.selectedIds)
      },
      ctx.merged
        ? REASON_MERGED_READ_ONLY
        : (ctx.selectedIds.length < 2 ? REASON_GROUP_NEEDS_TWO : undefined)
    )
  )

  out.push(
    withReason(
      {
        id: 'canvas.broadcast-input',
        title: ctx.broadcastActive ? 'Stop broadcasting input' : `Broadcast input to ${count}`,
        searchText: 'broadcast input type selected terminals agents',
        group: 'canvas',
        run: () => actions.toggleBroadcastInput()
      },
      ctx.broadcastActive || ctx.broadcastReady ? undefined : REASON_BROADCAST_NEEDS_TWO
    )
  )

  for (const w of ctx.workspaces) {
    out.push({
      id: `workspace.rename.${w.id}`,
      title: `Rename workspace “${w.name}”…`,
      group: 'manage',
      scope: 'workspaces',
      hiddenAtRest: true,
      run: () => actions.beginRenameWorkspace(w.id, w.name)
    })
    // A move row per OTHER workspace. The ACTIVE one is skipped rather than
    // disabled: moving panels to the workspace they are already in is a no-op
    // wearing the costume of a verb — it would run, close the palette, clear
    // the selection and change nothing, which reads as a broken feature rather
    // than as a no-op. That is the opposite ruling from the switch row above,
    // which IS disabled-with-a-reason for the active workspace, and the
    // difference is that "you are already here" is a useful thing to be told
    // about a destination and a meaningless thing to be told about a filing
    // cabinet.
    if (!w.active) {
      out.push(
        withReason(
          {
            id: `workspace.move.${w.id}`,
            title: `Move ${count} to “${w.name}”`,
            searchText: 'move panels to workspace file relocate send',
            group: 'manage',
            scope: 'workspaces',
            hiddenAtRest: true,
            // NO `destructive`, deliberately, one line above a row that has
            // it. `Command.destructive` is typed `?: true` rather than
            // `boolean` precisely so absent is the only way to say "benign" —
            // and a move IS benign: nothing is killed on either side, the
            // panel and its running agent both survive. Marking it would put a
            // confirm gate in front of a reversible edit and train the user to
            // dismiss the gate that guards the delete row below it.
            run: () => actions.movePanelsToWorkspace(ctx.selectedIds, { workspaceId: w.id })
          },
          // The merged reason is tested FIRST and outranks the empty one: in
          // the merged view a selection is easy to have (one click on any
          // lane's panel) and telling that user to select something is
          // telling them to do the thing they have already done. Disabled
          // WITH a reason, never absent — a row that disappears is
          // indistinguishable from a feature that was never built, and this
          // one is genuinely available one toggle away.
          ctx.merged
            ? REASON_MERGED_READ_ONLY
            : (ctx.selectedIds.length === 0 ? REASON_NO_PANELS_SELECTED : undefined)
        )
      )
    }
    out.push({
      id: `workspace.delete.${w.id}`,
      title: `Delete workspace “${w.name}”…`,
      group: 'manage',
      scope: 'workspaces',
      hiddenAtRest: true,
      destructive: true,
      // Marked AND gated. A red row still runs on one Enter, so the mark is
      // not the guard; the confirm (Task 6, in Canvas.tsx) is. Neither half
      // replaces the other.
      run: () => actions.deleteWorkspace(w.id, w.name, w.panelIds.length)
    })
  }

  out.push(
    withReason(
      {
        id: 'workspace.move-new',
        title: `Move ${count} to a new workspace…`,
        searchText: 'move panels new workspace file relocate send',
        group: 'manage',
        scope: 'workspaces',
        hiddenAtRest: true,
        // No `destructive` either — see the per-workspace row above.
        // begin*, never the move itself: the name has to be typed, and the
        // ellipsis is a promise that Escape still gets the user out.
        run: () => actions.beginMovePanelsToNewWorkspace(ctx.selectedIds)
      },
      // Present and DISABLED, never absent — the rule the whole file obeys: a
      // row that disappears is indistinguishable from a feature that was never
      // built, and a user who has not yet discovered that the rubber-band drag
      // is what feeds this verb has nowhere else to learn it.
      // Same precedence as the per-workspace rows above, and for the same
      // reason. This one matters slightly more: it MINTS a workspace, so a
      // merged-view run would file another workspace's panels into a canvas
      // that did not exist a moment ago.
      ctx.merged
        ? REASON_MERGED_READ_ONLY
        : (ctx.selectedIds.length === 0 ? REASON_NO_PANELS_SELECTED : undefined)
    )
  )

  // M42 — the search scope. Rows exist only in scope 'search'; the view shows
  // them only when the user has opened that scope. Three empty states, never
  // one — a folded pair tells the user the wrong fix.
  if (!ctx.scrollbackEnabled) {
    out.push(withReason(
      { id: 'search.off', title: 'Search is unavailable', subtitle: 'turn on Keep output', group: 'panel', scope: 'search', hiddenAtRest: true, run: () => {} },
      REASON_SEARCH_OFF
    ))
  } else if (ctx.searchResults !== null) {
    if (ctx.searchResults.length === 0) {
      // Only once a query has been typed: an empty query answers null above,
      // not [], so "no matches" never shows before the first keystroke.
      if (ctx.searchQuery.trim() !== '') {
        out.push(withReason(
          // M64. Names the term, once — the old row said "No matches" in the
          // title and "no matches" in the hint and never the word typed.
          { id: 'search.none', title: `No matches for “${ctx.searchQuery.trim()}”`, group: 'panel', scope: 'search', hiddenAtRest: true, run: () => {} },
          REASON_SEARCH_NO_MATCHES
        ))
      }
    } else {
      // M64. The hit leads with the panel's NAME, not its path-and-id label.
      const labelOf = new Map(ctx.panels.map((row) => [row.id, row.title ?? row.name ?? row.label]))
      for (const hit of ctx.searchResults) {
        out.push({
          id: `search.hit.${hit.panelId}.${hit.lineIndex}`,
          title: labelOf.get(hit.panelId) ?? hit.panelId,
          mono: true,
          // The matched line, and the haystack: the palette's own filter runs
          // over title+subtitle+searchText, so typing narrows the hits too.
          subtitle: hit.line,
          searchText: hit.line,
          group: 'panel',
          scope: 'search',
          hiddenAtRest: true,
          run: () => actions.goToPanel(hit.panelId)
        })
      }
    }
  }

  return out
}


/**
 * M48. The Environment scope: a door at rest, and one INFORMATION row per
 * fact of the report. Information rows run nothing — they exist so "why does
 * Claude not appear" has an answer one Cmd+K away, in the same surface every
 * other answer lives in. Exported so verify:palette drives it from a report
 * fixture; `null` (the invoke has not answered) yields the door alone,
 * disabled with a reason, never an absent door.
 */
export const REASON_NO_ENV_REPORT = 'the environment has not been read yet'

export function buildEnvironmentRows(report: EnvReport | null): Command[] {
  const rows: Command[] = []
  const info = (id: string, title: string, subtitle: string, searchText: string): Command => ({
    id, title, subtitle, group: 'manage', scope: 'environment', hiddenAtRest: true, searchText, run: () => {}
  })
  rows.push(
    withReason(
      {
        id: 'manage.environment',
        title: 'Environment…',
        subtitle: report === null
          ? 'what the app found at startup'
          : `${report.clis.filter((c) => c.path !== null).length} of ${report.clis.length} CLIs found · ${report.tmux.kind === 'tmux' ? 'tmux' : 'no tmux'}`,
        group: 'manage',
        entersScope: 'environment',
        searchText: 'environment path claude codex git tmux shell found not found install report',
        run: () => {}
      },
      report === null ? REASON_NO_ENV_REPORT : undefined
    )
  )
  if (report === null) return rows
  rows.push(info('env.shell',
    report.shell.ok ? `Login shell read: ${report.shell.path || 'default'}` : `Login shell could not be read: ${report.shell.path || 'default'}`,
    report.shell.ok
      ? `${report.pathEntries.length} PATH entries resolved from it`
      : `${report.shell.reason ?? 'the probe failed'} — CLIs installed through your shell's rc files may not be found`,
    'shell zsh bash login probe failed'))
  const INSTALL: Record<string, string> = {
    claude: 'install the Claude Code CLI so `claude` is on your PATH',
    codex: 'install the Codex CLI so `codex` is on your PATH',
    git: 'install git (Xcode command line tools, or Homebrew)'
  }
  for (const cli of report.clis) {
    rows.push(info(`env.cli.${cli.name}`,
      cli.path === null ? `${cli.name}: not found` : `${cli.name}: found`,
      cli.path ?? INSTALL[cli.name] ?? 'not on PATH',
      `${cli.name} cli found missing install path`))
  }
  rows.push(info('env.tmux',
    report.tmux.kind === 'tmux' ? 'tmux: in use' : 'tmux: not in use — sessions end with the window',
    report.tmux.path ? `${report.tmux.path} — ${report.tmux.reason}` : report.tmux.reason,
    'tmux backend session survive'))
  rows.push(info('env.path', `PATH: ${report.pathEntries.length} entries`, report.pathEntries.join(' · ') || '(empty)', 'path entries'))
  rows.push(info('env.layout',
    report.layout.backupWritten ? 'Layout file: a newer file was preserved as .bak' : 'Layout file',
    report.layout.path || '(not yet written)', 'layout file json bak'))
  // M54. The door. The launcher is on PATH inside every panel already; the
  // subtitle is the one line that puts it on PATH outside.
  // `?? null`: a report built by an older main (or a fixture) has no key at
  // all, and absent reads as null rather than as a crash.
  const control = report.control ?? null
  rows.push(info('env.tc',
    control === null ? 'tc: not available in this instance' : `tc: ${control.cliPath}`,
    control === null
      ? 'another instance of this build owns the control socket'
      : `on PATH inside every panel; outside, export PATH="${control.cliPath.replace(/\/tc$/, '')}:$PATH" — or open terminal-canvas://open?preset=…`,
    'tc cli command line socket url scheme'))
    rows.push(info('env.probed', `Read at ${new Date(report.probedAt).toLocaleTimeString()}`,
    'once, at launch — a CLI installed since is not seen until relaunch', 'probed at time relaunch'))
  return rows
}
