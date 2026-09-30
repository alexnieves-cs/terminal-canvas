import type { TaskPlan } from '@shared/task-plan'
import { teamAskWords } from '@shared/team-asks'
import { noteFormSentence } from '@shared/notes'
import { shapeFormSentence } from '@shared/flowchart'
import type { CreationResult } from '@shared/verb-table'
import type { PersistedWorkItem } from '@shared/work-items'
import type { StartWorkOutcome } from './start-work'
import { SWARM_LIST, SWARM_PRESETS, type SwarmPresetId } from '@shared/swarm'
import type { ToolScope } from '@shared/toolbox'
import { CAPABILITY_ORDER, capabilityWords, normalizeCapability } from '@shared/toolbox-query'
import type { Command } from './palette-model'
// Type-only: SettingValue is Task 4's settings-schema addition.
// Erased by esbuild, so it costs verify:palette nothing that the bundle
// otherwise has no @shared VALUE import at all (that alias is wired
// pre-emptively for exactly this day). The @renderer import below is a
// different matter and this comment used to be read as covering it: waitingCount
// is a VALUE, so verify-palette.cjs's @renderer alias is load-bearing, not
// pre-emptive. Measured in M14 by deleting the alias and building.
import { PERMISSION_MODES, type PermissionMode } from '@shared/cost'
import type { SettingValue } from '@shared/settings-schema'
import { AUTO_MODES, AUTO_MODE_IDS, type AutoModeId } from '@shared/auto'
import { updateSentence } from '@renderer/session/update-store'
import { statePriority } from '@renderer/panels/panel-state'
import { waitingCount } from '@renderer/shell/rail-sections'
import type { AgentBackend } from '@shared/agent-session'
import { BACKENDS, BACKEND_IDS } from '@shared/agent-backends'
import { pinRefusal } from '@renderer/canvas/lod'
import { displayPath, displayLabel } from '@shared/display-path' // M178 (F.2): a verb row's target never prints a raw path
// A VALUE import, not a type-only one: SERVICES is the fixed, app-wide list
// of credential-holding services, and credential-schema.ts imports nothing —
// not electron, not node, not a sibling — so pulling it in here costs this
// module nothing it does not already pay for waitingCount above. findService
// stays out of this file; the palette only needs the id/label/help triple
// SERVICES already carries, and the label lookup for a REFUSAL message lives
// in Canvas.tsx, where the input-mode re-prompt actually happens.
import { SERVICES, notConnectedReason } from '@shared/credential-schema'
import type { PaletteContext } from './commands/context'
// `export *` below re-exports these for consumers but does NOT bind them in
// this module’s scope — buildCommands names them directly, so they are imported too.
import {
  REASON_NO_FOCUS, REASON_NO_FOCUS_SELECTED, REASON_NO_SELECTION, REASON_BUILT_IN_RENAME, REASON_BUILT_IN_DELETE,
  REASON_PROJECT_PROMPT, REASON_NOT_ON_PATH, REASON_UNREAD_PRESET, REASON_NOT_TERMINAL, REASON_NOT_TERMINAL_MARKS,
  REASON_TIDY_NEEDS_TWO, REASON_NOT_TERMINAL_OUTPUT, REASON_NOTHING_TO_EXPORT,
  REASON_ALREADY_DEFAULT, REASON_BUILT_IN_WORKTREE, REASON_NO_REVIEW_TARGET_ACROSS,
  REASON_NO_GITHUB, REASON_NO_WORKTREES, REASON_WORKTREE_ATTACHED, REASON_SEARCH_OFF,
  REASON_SEARCH_NO_MATCHES, REASON_NO_PROMPTS, REASON_ALREADY_ACTIVE, REASON_NOT_STARTED,
  REASON_NOT_AN_AGENT, REASON_NO_PANELS_SELECTED, REASON_GROUP_NEEDS_TWO, REASON_NOT_IN_GROUP,
  REASON_MERGED_READ_ONLY, REASON_NOTHING_TO_LINK, REASON_BROADCAST_NEEDS_TWO, REASON_NO_NOTE_ROOT,
  REASON_NO_CLAUDE, REASON_TERMINAL_LIVE, REASON_NOT_CLAUDE_SESSION, REASON_CHAT_BUSY,
  REASON_CHAT_EMPTY, REASON_NOT_CHAT, REASON_NO_SELECTION_TEMPLATE, REASON_NO_WATCH_ROOT,
  REASON_NO_REPO_MEMORY, REASON_NO_TEMPLATES, REASON_NO_APPROVALS, claudeAvailable,
  backendAvailable
} from './commands/reasons'
import { withReason } from './commands/with-reason'
import { creationCommands } from './commands/creation-rows'
import { buildCredentialRows } from './commands/credential-rows'
import { buildEnvironmentRows } from './commands/environment-rows'

// --- The commands/ directory ------------------------------------------------
// M278 split commands.ts by moving out everything that is DECLARATION rather
// than row-building: the plain-data row types, the refusal sentences, and the
// three row builders that never read PaletteContext. `buildCommands` and
// `PaletteActions` stay here because three verify checks read THIS FILE as
// text — `closure.1` slices the interface out of it, and `closure.v9.1`,
// `fit-task.doors.1` and `swarm.rows.1` grep it for literal `id: '…'` rows.
// Re-exported so every existing importer of `palette/commands` is unchanged.
export type { PresetRow, PromptRow, PanelRow } from './commands/row-types'
export type { ApprovalRow } from './commands/approval-row'
export type { PaletteContext } from './commands/context'
export * from './commands/reasons'
export { buildCredentialRows }
export { creationCommands }
export { buildEnvironmentRows }
export { REASON_NO_ENV_REPORT } from './commands/environment-rows'

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

export interface PaletteActions {
  createObject(kind: string, value?: string): Promise<CreationResult>
  editChecklist(panel: string, operation: string, value?: string): Promise<CreationResult>
  handChecklist(panel: string, line: number, agent: string): Promise<CreationResult>
  /** M245. Set one cell of an open sheet, through its guarded write. M246: with an agent caller it proposes. */
  editSheet(panel: string, cell: string, value: string, caller?: import('@shared/plan').AgentPlanCaller): Promise<CreationResult>
  /** M246. Keep or discard a sheet's draft cells; keeping is refused to an agent caller. */
  reviewSheet(panel: string, operation: string, target?: string, caller?: import('@shared/plan').AgentPlanCaller): Promise<CreationResult>
  /** M247. Show, hide or toggle the agent → object links (the `canvas.agentLinks` setting). */
  setAgentLinks(mode: string): Promise<CreationResult>
  /** M248. `origin` is 'door' when the step came through runAgentPlan (the agent door or a workflow node): edits then stage. */
  editDeck(panel: string, slide: number, text: string, origin?: 'person' | 'door'): Promise<CreationResult>
  writeDeck(panel: string, text: string, origin?: 'person' | 'door'): Promise<CreationResult>
  reviewDeck(panel: string, action: string, slides: string, origin?: 'person' | 'door'): Promise<CreationResult>
  presentDeck(panel: string, origin?: 'person' | 'door'): Promise<CreationResult>
  exportDeckPdf(panel: string): Promise<CreationResult>
  spawnPreset(id: string): void
  beginRenamePreset(id: string, currentName: string): void
  deletePreset(id: string): void
  setDefaultPreset(id: string): void
  goToPanel(id: string): void
  insertPrompt(id: string): void
  /** M76. Answer a chat's pending permission request from anywhere. M98: `scope: 'session'` also grants the tool. */
  answerApproval(id: string, requestId: string, allow: boolean, scope?: 'session'): void
  /** M379. One person's answer to a teammate's agent's ask: allow ONCE, or deny. Never a grant. */
  answerTeamAsk(workspaceId: string, askId: string, allow: boolean): void
  beginSavePrompt(): void
  deletePrompt(id: string): void
  beginRenamePanel(id: string, currentTitle: string): void
  resetCanvas(): void
  zoomToFit(): void
  /** M146. Cmd+0's INITIAL camera — the row that was called `Reset zoom` all along. */
  resetZoom(): void
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
  /** M85. A free-text setting (the vault's folder): the palette's text line, then setSetting. */
  beginEditTextSetting(id: string, label: string, current: string): void
  /** M85. The vault pane's own door to the same setting. */
  beginChooseVault(): void
  switchWorkspace(id: string): void
  beginCreateWorkspace(): void
  /** M147. A fresh workspace named after the template, switched to, the shape minted there. */
  workspaceFromTemplate(templateId: string): void
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
  /** M92. Lock, pin and maximise, each with its opposite. */
  lockPanel(id: string): void
  unlockPanel(id: string): void
  pinPanel(id: string): void
  unpinPanel(id: string): void
  maximisePanel(id: string): void
  restorePanel(id: string): void
  /** M93. */
  beginAnnotate(): void
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
  /** M80. `templateId` opens the sheet on that template. */
  /** M149. `into` threads the three `New workspace from` doors to the sheet's Enter, so a template with holes asks before any workspace exists. */
  /** M174. `seed.cwd` opens the sheet ON a folder (the launcher's recents chip). */
  beginSpawnSheet(templateId?: string, into?: { intoNewWorkspace: true }, seed?: { cwd: string }): void
  /** M149. A sentence on the palette's feedback line — the one place a refusal from a keystroke (a paste) can be said; nothing runs. */
  say(sentence: string): void
  /** M83. Open the project memory for the captured panel's repository. */
  openMemory(): void
  /** M88. Open the GitHub work panel. */
  openGithub(): void
  /** M86. A review across every worktree of the subject's repository. */
  reviewAcross(id: string): void
  /** M84. Ask for a watcher: the command, then the trigger. */
  beginWatcher(): void
  /** M80. Save the selected panels and their edges as a template. */
  beginSaveTemplate(panelIds: readonly string[]): void
  /** M133. Open a template as a workflow panel — a VIEW of the shape, not a run of it. */
  openWorkflow(templateId: string): void
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
   * M268. Show the canvas or the Orchestration center page. The canvas host
   * stays mounted either way — this only chooses which sibling is visible.
   */
  setCenterView(view: 'canvas' | 'orchestration'): void
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
   * M401. `after` runs once git has really removed it (never on a refusal) —
   * the review's Remove lane re-reads its task with it; every palette row
   * passes the id alone.
   */
  beginRemoveWorktree(id: string, after?: () => void): void
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
  newChat(backend?: AgentBackend): void
  checkReadiness(): Promise<import("@shared/env-report").EnvReport>
  /** M181. Lay the starter canvas out: the conversation and one captioned example of each kind, only the keys never applied; refused by name. */
  openStarter(): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  /** M182. One template-editing operation over the draft, through `shared/template-edit.ts`; refused by name. */
  editWorkflow(templateId: string, op: import("@renderer/workflow/template-draft-store").DraftOp): { kind: 'ok' } | { kind: 'refused'; reason: string }
  /** M182. The palette's text mode for one editing verb on a template: `add <kind>`, `move <key> <dx> <dy>`, `set <key> <field> <value>`, `remove <key>`, `edge <from> <to> <trigger>`, `unedge <from> <to>`. */
  beginWorkflowEdit(templateId: string, verb: 'add' | 'move' | 'set' | 'remove' | 'edge' | 'unedge'): void
  /** M182. The canvas binding's Update: the selected panels' positions and fields back onto the template they came from, through the operations, with the revision check. */
  updateBoundTemplate(panelIds: readonly string[]): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  /** M184. Save a workflow's draft back to its record with the revision it was read at. */
  saveWorkflow(templateId: string): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  saveWorkflowCopy(templateId: string): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  /** M185. The preview's four verbs, plus the discovery the pane's own control renders. */
  prepareFeedback(says?: string): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  /** M337. Open the share dialog to share the active workspace (an org prefilled). The dialog's click shares; this never does. */
  shareWorkspace(org?: string): Promise<CreationResult>
  /** M337. Open the share dialog's list of shared workspaces (one prefilled). Opening is the person's click. */
  openSharedWorkspace(share?: string): Promise<CreationResult>
  /** M337. Open the share dialog with a role change proposed; Apply is the person's. `who` is a user id or a GitHub login. */
  proposeShareRole(who?: string, role?: string): Promise<CreationResult>
  /** M336. Sign in with GitHub (or add another account). Excluded from every verb: an account is the person's. */
  signIn(): Promise<CreationResult>
  /**
   * M352. Set an agent's own caps (its chat's record). `origin: 'door'` (an
   * agent's plan, a workflow node) may only lower one — see planCapChange.
   */
  capAgent(panelId: string, value: string, origin?: 'person' | 'door'): { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }
  /**
   * M361. A comment pinned to a line of the panel's task's diff. Through a
   * door (`origin: 'door'`, an agent's plan or a workflow node) it is a
   * PROPOSAL attributed to the caller, which the person keeps or discards.
   */
  reviewComment(panelId: string, place: string, comment: string, origin?: 'person' | 'door', caller?: import('@shared/plan').AgentPlanCaller): { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }
  exportCanvas(path?: string, pictures?: string): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  /** M251. A Markdown file panel's deck as .pptx, through main's save dialog; the note is the export sentence. */
  exportDeck(panelId: string): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  importCanvas(path?: string): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  /** M250. A .docx into a new, unreviewed note beside it; no path opens the system's chooser. */
  importDocx(path?: string): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  /** M253. Packs: import READS and shows the manifest, adding nothing; export writes the library as one pack. */
  exportPack(path?: string): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  importPack(path?: string): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  /** M255. The sample dev-relations pack, through the same preview as any pack. */
  importSamplePack(): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  /** M255. Publish a draft file (absent: the selected file panel's). Main asks the person with the text shown. */
  publishRelease(tag: string, file?: string): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  publishComment(number: string, file?: string): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  publishDiscussion(category: string, file?: string): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  /** M255. The palette row's step: ask for the tag, number or category, then publish the selected draft. */
  beginPublish(kind: 'release' | 'comment' | 'discussion'): void
  /** M253. "I've read this" for a pack preset — a person's statement, so no verb reaches it (EXCLUDED_ACTIONS). A preset has no canvas object; its palette row is its home. */
  markPresetRead(id: string): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  testNode(templateId: string, key?: string): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  addNote(form: string, text?: string): { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }
  /** M388. The flowchart shape's verbs: add (a form, an optional label), set the label, restyle one field; and the palette's door into a selected shape's own editor. */
  addShape(form: string, text?: string): { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }
  setShapeText(panelId: string, text: string): { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }
  styleShape(panelId: string, field: string, value: string): { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }
  editShapeLabel(): { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }
  /** M389–M391. Connect two objects, restyle a connector; duplicate, align, space and lay out objects (a space-separated id list, or the selection); Mermaid in and out. */
  connectObjects(from: string, to: string, label?: string): { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }
  styleConnector(id: string, field: string, value: string): { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }
  duplicateObjects(ids?: string): { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }
  alignObjects(edge: string, ids?: string): { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }
  distributeObjects(axis: string, ids?: string): { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }
  layoutFlowchart(direction: string, ids?: string): { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }
  importFlowchart(path?: string): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  exportFlowchart(format: string): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  /** M394. Start work from the selected chart: its steps become a task plan in the Start work sheet; nothing runs until a person presses Start. */
  planFromChart(ids?: string): { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }
  setNoteText(panelId: string, text: string): { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }
  setNoteTint(panelId: string, tint: string): { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }
  addImage(path: string): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  replaceImage(panelId: string, path?: string): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  openPreview(url?: string): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  setPreviewWidth(device: string): { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }
  capturePreview(): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  startDevServer(script?: string): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  /** M195 (D03). Bind the selected preview pane to the subject panel's folder — provenance, never a grant. */
  bindPreview(): { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }
  /**
   * M202 (D07). Open the review for a work card's lane, beside the task. A
   * READ: it mints the review panel M86 already builds and asks git the
   * question that panel always asks. It records nothing — marking a review
   * done is a person's act and has no verb at all, on purpose.
   */
  reviewTask(panelId: string): { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }
  /**
   * M203 (D08). Frame a task — from its card, or from any panel that belongs
   * to exactly one task. A camera move over a DERIVED membership, through the
   * trail: nothing is moved, selected, woken or stopped.
   */
  showTask(panelId: string): { kind: 'ran'; note?: string; partial?: true } | { kind: 'refused'; reason: string }
  /** M204 (D08). The task lens on (or off, for the task already shown): members ringed, the rest dimmed, nothing moved. */
  showRelated(panelId: string): { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }
  /** M204 (D08). Compact a task's panels in reading order, clear of every other panel, as ONE undo. Refused in the merged view. */
  arrangeTask(panelId: string): { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }
  /** M258. Frame the ACTIVE task — the lens's, else the selected panel's one task. A camera move through the trail; nothing else. */
  fitTask(): { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }
  /** M324. Open the focus view of the task a card or member panel belongs to. */
  focusTask(panelId: string): { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }
  /** M184. Run the shape on the diagram — the draft when there is one; the same instantiation the panel's Run calls. */
  runWorkflowNow(templateId: string, caller?: import('@shared/plan').AgentPlanCaller): { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }
  /** M184. Interrupt everything this workflow started; nothing is killed. */
  stopWorkflow(templateId: string): { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }
  /** M74. A claude terminal's session, rendered and continued as a chat. */
  openAsChat(id: string): void
  /** M383. Open the Replay sheet on a conversation — a view of its past; nothing runs. */
  openReplay(id: string): void
  /** M74. A chat's session, continued in a terminal with `claude --resume`. */
  openInTerminal(id: string): void
  openJira(): void
  /**
   * M96. The verb line: opens the palette's text mode on `Run a verb…`,
   * parses and builds the plan against the live canvas, confirms a
   * destructive step, runs, and re-prompts with the refusal and its fix.
   */
  /** M180. The agent door: the same executor as the verb line, no destructive step, the caller main resolved. */
  runAgentPlan(line: string, caller?: import("@shared/plan").AgentPlanCaller): Promise<import("@shared/plan").AgentPlanReply>
  beginRunVerb(): void
  /** M97. Start a bounded auto run on a chat; refused by name when one is live. */
  startAuto(id: string, mode: AutoModeId, task?: string): void
  stopAuto(id: string): void
  /** M100. Open the navigator on the Teammates pane. */
  openTeammates(): void
  /** M103. The palette's Open a page… row: ask for a URL in text mode, then mint a browser panel at the world centre. */
  beginBrowser(): void
  /** M106. Flip every terminal to its far view, and back. */
  toggleFlip(): void
  /** M113. Upsert a board record (the dedupe by key); returns the surviving id. */
  addWorkItem(item: Omit<PersistedWorkItem, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): string
  /** M113. The typed door: the palette's text mode asks for a title. */
  beginNewWorkItem(): void
  /** M114. The one verb: a lane, a chat as the teammate, an edge meaning dispatched. */
  dispatchWorkItem(itemId: string, teammateId: string, root?: string): void
  /**
   * M197 (D05). START WORK — the one action every door routes into. It asks
   * only for what it cannot derive: with the triple complete it dispatches
   * with no sheet, and otherwise it opens the sheet on the missing input.
   */
  beginStartWork(opts?: { itemId?: string; teammateId?: string; title?: string; swarm?: SwarmPresetId; recipeId?: string; brief?: string; criteria?: string[]; preferRoot?: string; plan?: TaskPlan; onCreated?: (itemId: string) => void }): void
  /** M312. The repository setup sheet for a directory's repository (the captured panel's when absent). */
  beginRepoSetup(cwd?: string): void
  /** M313. The captured panel (or the given path) in the person's editor. */
  openInEditor(target?: { path: string; line?: number; dir?: boolean }, panelId?: string): void
  /** M197. The executor behind it, ANSWERING — the awaited half the agent's `dispatch` arm needs. */
  startWork(itemId: string, teammateId: string, root?: string): Promise<StartWorkOutcome>
  /**
   * M275. START A SWARM — the same triple, plus an arrangement. It is a
   * SECOND member beside `startWork` rather than a fourth argument to it,
   * because the two answer differently: a swarm needs the root resolved
   * (its seats' folders are computed from it) where a solo start may still
   * derive one, and a swarm has refusals a solo start does not have.
   */
  startSwarm(itemId: string, teammateId: string, root: string, preset: SwarmPresetId): Promise<StartWorkOutcome>
  /** M115. A broker WRITE behind the teammate's spend card — excluded from plans by name. */
  openPr(itemId: string): void
  /** M115. The optional comment on the issue after done — the second card. */
  commentPr(itemId: string): void
  /** M115. done is the user's. */
  markDone(itemId: string): void
  /** M116. Open the navigator on the Board pane. */
  openBoard(): void
  /**
   * M127. The ONE door a skill card's drop onto the canvas goes through.
   *
   * A named, typed STUB until M128 mints the `skill` panel kind: it records
   * the request and opens nothing. Named and typed rather than absent so the
   * drop has exactly one caller when the kind lands — a second mint path
   * invented at the drop site is how two doors drift apart.
   */
  openSkillPanel(scope: ToolScope, name: string, world: { x: number; y: number }): void
  /** M120. A chat with no folder, in the app's own sandbox directory, on the row's read-only mode. */
  newSandboxChat(backend: AgentBackend): void
  /** M122. Scroll a chat's stored turn into view — a search hit's flight. */
  scrollChatTurn(panelId: string, turnIndex: number): void
  /** M123. Ask GitHub once, by hand; the three states land on the palette's feedback line. Excluded from plans by name. */
  checkForUpdates(): void
}






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



export function buildCommands(ctx: PaletteContext): Command[] {
  const { actions } = ctx
  const out: Command[] = []
  out.push({ id: 'checklist.edit', title: 'Checklist: edit an item…', subtitle: 'checklist-edit <panel> add <text> · toggle/delete <line> · move <line> <line> · undo/redo', group: 'canvas', searchText: 'checklist task add toggle check reorder delete undo redo', run: () => actions.beginRunVerb() })
  out.push({ id: 'deck.edit', title: 'Deck: edit a slide…', subtitle: 'deck-edit <panel> <slide> <markdown> — \\n is a new line', group: 'canvas', searchText: 'deck slides slide edit markdown presentation', run: () => actions.beginRunVerb() })
  out.push({ id: 'deck.write', title: 'Deck: replace the whole deck…', subtitle: 'deck-write <panel> <markdown>', group: 'canvas', searchText: 'deck slides write replace markdown presentation', run: () => actions.beginRunVerb() })
  out.push({ id: 'deck.review', title: 'Deck: keep or discard proposed slides…', subtitle: 'deck-review <panel> keep|discard <slides|all>', group: 'canvas', searchText: 'deck slides review keep discard proposal draft', run: () => actions.beginRunVerb() })
  out.push({ id: 'deck.present', title: 'Deck: present…', subtitle: 'deck-present <panel>', group: 'canvas', searchText: 'deck slides present presentation full screen', run: () => actions.beginRunVerb() })
  out.push({ id: 'deck.export-pdf', title: 'Deck: export to PDF…', subtitle: 'deck-export-pdf <panel>', group: 'canvas', searchText: 'deck slides export pdf print', run: () => actions.beginRunVerb() })
  out.push({ id: 'checklist.hand', title: 'Checklist: hand an item to an agent…', subtitle: 'checklist-hand <panel> <zero-based line> <conversation>', group: 'canvas', searchText: 'checklist hand task agent teammate send', run: () => actions.beginRunVerb() })
  out.push({ id: 'canvas.agent-links', title: 'Agent links: show or hide', subtitle: 'the lines from each agent to what it read, wrote or drafted', group: 'canvas', searchText: 'agent links edges lines files touched read wrote draft show hide toggle', run: () => { void actions.setAgentLinks('toggle') } })
  out.push({ id: 'sheet.review', title: 'Sheet: keep or discard draft cells…', subtitle: 'sheet-review <panel> keep|discard <cell, B2:C4 or all>', group: 'canvas', searchText: 'sheet draft review keep discard accept reject agent proposal', run: () => actions.beginRunVerb() })
  out.push({ id: 'sheet.edit', title: 'Sheet: set a cell…', subtitle: 'sheet-edit <panel> <cell> <value or =formula>', group: 'canvas', searchText: 'sheet spreadsheet csv xlsx cell edit formula set', run: () => actions.beginRunVerb() })

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
      // M175. The path rule's one helper (a panel row knows no repository root, so this is its last-two-segments arm — backlog #86 is the root).
      ...(panel.path === undefined ? {} : { subtitle: displayPath(panel.path).short, pathText: panel.path }),
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
    // M383. A conversation scrubbed back to any turn, its files as they stood
    // then, and another beside it — the Replay sheet, a view. Offered on the
    // captured panel when it is a chat; any other panel names why not.
    out.push(
      withReason(
        {
          id: 'chat.replay',
          title: 'Replay this conversation…',
          subtitle: target ? (target.title ?? target.label) : 'no panel',
          searchText: 'replay rewind history timeline turn files virtual filesystem compare runs side by side conversation chat',
          group: 'panel',
          run: () => actions.openReplay(ctx.capturedId!)
        },
        ctx.capturedId === null ? REASON_NO_FOCUS
          : target === undefined || target.kind !== 'chat' ? 'select a conversation first — a replay is read from a chat\'s own transcript'
            : undefined
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
    // M379. A teammate's agent asking (M376): two rows per ask, the Needs-you
    // section's two answers, so an ask can be answered from wherever the
    // person is. Allow is ONCE — a standing grant is the agent owner's alone.
    for (const t of ctx.teamAsks ?? []) {
      const w = teamAskWords(t)
      out.push({
        id: `team.allow.${t.workspaceId}.${t.askId}`, title: `Allow once — ${w.who}`, subtitle: w.action, mono: true,
        searchText: `allow approve team teammate ask needs you ${t.tool} ${w.who}`, group: 'panel',
        run: () => actions.answerTeamAsk(t.workspaceId, t.askId, true)
      })
      out.push({
        id: `team.deny.${t.workspaceId}.${t.askId}`, title: `Deny — ${w.who}`, subtitle: w.action, mono: true,
        searchText: `deny refuse team teammate ask needs you ${t.tool} ${w.who}`, group: 'panel',
        run: () => actions.answerTeamAsk(t.workspaceId, t.askId, false)
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
            : target.backend !== undefined && !BACKENDS[target.backend].terminalDoor ? BACKENDS[target.backend].reasons.noTerminal
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
    // M92. Six rows, three pairs, every one PRESENT: the half that does not
    // apply is disabled naming the state, so a user who does not know a panel
    // is locked learns it from the row rather than from a drag that refuses.
    {
      const need = ctx.capturedId === null || target === undefined ? REASON_NO_FOCUS : undefined
      const pins = ctx.pinnedCount ?? 0
      const pair = (id: string, title: string, run: (pid: string) => void, reason: string | undefined): void => {
        out.push(withReason({ id, title, subtitle: target ? (target.title ?? target.label) : 'no panel', group: 'panel', run: () => run(ctx.capturedId!) }, need ?? reason))
      }
      pair('panel.lock', 'Lock panel', actions.lockPanel, target?.locked === true ? 'already locked — Unlock panel is the row' : undefined)
      pair('panel.unlock', 'Unlock panel', actions.unlockPanel, target?.locked === true ? undefined : 'not locked')
      pair('panel.pin', 'Pin panel live', actions.pinPanel, target === undefined ? undefined : pinRefusal(target.kind, target.pinned === true, pins))
      pair('panel.unpin', 'Unpin panel', actions.unpinPanel, target?.pinned === true ? undefined : 'not pinned')
      pair('panel.maximise', 'Maximise panel', actions.maximisePanel, target?.maximised === true ? 'already maximised — Restore panel is the row' : undefined)
      pair('panel.restore', 'Restore panel', actions.restorePanel, target?.maximised === true ? undefined : 'not maximised')
    }

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
          title: target === undefined ? 'Open toolbox' : `Open toolbox for ${displayLabel(target.label)}`,
          subtitle: 'its skills, tools and permissions — add a skill so it loads instructions only when they apply',
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
    // M86. Every worktree of the subject's repository in one node, disabled by
  // name when this app has made none: the ordinary review already answers
  // for a single tree.
  out.push(
    withReason(
      {
        id: 'panel.review.across',
        title: target === undefined ? 'Review every worktree' : `Review every worktree of ${displayLabel(target.label)}'s repository`,
        searchText: 'review worktree worktrees branches across all git',
        group: 'panel',
        run: () => { if (target !== undefined) actions.reviewAcross(target.id) }
      },
      // The SAME gate the ordinary review row keeps (a file, a memory node
      // or a never-started panel has nothing to review across), then the
      // worktree count — an enabled row that does nothing on click is the
      // failure the reason exists to prevent (M86's verifier).
      ctx.capturedId === null || target === undefined
        ? REASON_NO_REVIEW_TARGET_ACROSS
        : (target.reviewable !== undefined ? !target.reviewable : !target.restartable)
          ? (target.reviewReason ?? REASON_NOT_STARTED)
          : ctx.worktrees.length === 0 ? REASON_NO_WORKTREES : undefined
    )
  )
  out.push(
      withReason(
        {
          id: 'panel.review',
          title: target === undefined ? 'Open review' : `Open review of ${displayLabel(target.label)}`,
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
          : target.reviewable !== undefined
            ? (target.reviewable ? undefined : (target.reviewReason ?? REASON_NOT_STARTED))
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
  // M244's creation rows, AFTER New panel… rather than ahead of it: M65's rule
  // (verify:palette sheet.1) is that the considered way to start a panel heads
  // the spawn section. Pushed first, they displaced it — failing on main since
  // 7a3323d0, found while gating M245–M247.
  out.push(...creationCommands(ctx))

  // M80. Templates: one row each, disabled by its own reason when it cannot
  // run; and the save verb, refused by name with nothing selected.
  // M83. The project memory, for the captured panel's repository.
  out.push(withReason({
    id: 'panel.memory',
    title: 'Open memory…',
    subtitle: 'what this repository has decided, tried and failed',
    searchText: 'memory project remember decided tried failed notes',
    group: 'panel',
    run: () => actions.openMemory()
  }, ctx.memoryRoot === undefined || ctx.memoryRoot === '' ? REASON_NO_REPO_MEMORY : undefined))

  // M84. The watcher: a command run on a trigger. Its directory is the
  // selected panel's, like the note and the memory rows, so the row is
  // disabled by NAME rather than opening a form with nowhere to run.
  out.push(withReason({
    id: 'panel.watcher',
    title: 'Watch…',
    // Brief #19: said as what it gives, not what it is.
    subtitle: 'rerun a check whenever files change, so a review always has a fresh result',
    searchText: 'watch watcher run when change trigger tests build timer',
    group: 'panel',
    run: () => actions.beginWatcher()
  }, ctx.noteRoot === null || ctx.noteRoot === undefined ? REASON_NO_WATCH_ROOT : undefined))

  // M103. The browser pane. ALWAYS present and never disabled: a URL is
  // typed, not derived from a captured panel or a directory, so there is no
  // reason a row could be refused for — and a row that only appeared once
  // something was selected would read as a feature that was never built.
  out.push({
    id: 'canvas.browser',
    title: 'Open a page…',
    subtitle: 'a browser panel — a dev server, docs, a preview',
    searchText: 'open page browser url web http localhost dev server preview',
    group: 'spawn',
    run: () => actions.beginBrowser()
  })

  const templateRows = ctx.templates ?? []
  if (templateRows.length === 0) {
    out.push(withReason({
      id: 'template.none', title: 'New from template…', searchText: 'template new from shape of work start',
      group: 'panel', hiddenAtRest: true, run: () => {}
    }, REASON_NO_TEMPLATES))
  }
  for (const t of templateRows) {
    out.push(withReason({
      id: `template.new.${t.id}`,
      title: `New from ${t.name}`,
      subtitle: `${t.nodes} panel${t.nodes === 1 ? '' : 's'} · ${t.edges} edge${t.edges === 1 ? '' : 's'}`,
      searchText: 'template new from shape of work start',
      group: 'panel',
      run: () => actions.beginSpawnSheet(t.id)
    }, t.refusal))
  }
  // M133. The workflow panel's door: one row per template, beside the row
  // that RUNS it. Two verbs, never one — opening a shape and starting it are
  // different acts, and the palette says which is which.
  for (const t of templateRows) {
    // The merged view is read-only, so `openWorkflowPanel` returns without
    // minting anything. A row that runs and does nothing is the silent
    // failure this repository disables by name instead.
    out.push(withReason({
      id: `workflow.open.${t.id}`,
      title: `Open ${t.name} as a workflow`,
      subtitle: `${t.nodes} block${t.nodes === 1 ? '' : 's'} - the diagram, its runs and its triggers`,
      searchText: 'workflow open diagram blocks template runs triggers',
      group: 'panel',
      run: () => actions.openWorkflow(t.id)
    }, ctx.merged === true ? REASON_MERGED_READ_ONLY : undefined))
  }
  out.push(withReason({
    id: 'template.save',
    title: 'Save selection as template…',
    subtitle: 'start the same panels and handoffs again in one step — reusable as a workflow',
    searchText: 'save template selection shape of work',
    group: 'panel',
    hiddenAtRest: true,
    run: () => actions.beginSaveTemplate(ctx.selectedIds)
  }, ctx.selectedIds.length === 0 ? REASON_NO_SELECTION_TEMPLATE : undefined))

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
        searchText: 'new chat claude conversation agent talk ask start a conversation',
        group: 'spawn',
        run: () => actions.newChat()
      },
      claudeAvailable(ctx.presets) ? undefined : REASON_NO_CLAUDE
    )
  )

  // M120. A chat with NO place: one spawn-group row per registered backend, beside New chat…
  // (the sheet's own order), disabled by name for a binary not on the PATH
  // and by the row's own `noSandbox` sentence for a row with no read-only
  // mode — never dropped, so a backend that cannot is a backend that says so.
  for (const backend of BACKEND_IDS) {
    const row = BACKENDS[backend]
    out.push(
      withReason(
        {
          id: `chat.sandbox.${backend}`,
          // M403 (B8). The launcher's own words lead: "Ask a question" existed
          // only on the launcher, which is gone once a panel exists, and the
          // palette called the same door "New chat (no folder)". Both names
          // find it; the id and the no-folder fact are unchanged (sandbox.1).
          title: `Ask a question (new chat, no folder) — ${row.label}`,
          searchText: `ask a question new chat no folder sandbox ${row.label} conversation without a repository`,
          group: 'spawn',
          run: () => actions.newSandboxChat(backend)
        },
        row.sandboxArgs === undefined ? row.reasons.noSandbox : backendAvailable(ctx.presets, backend) ? undefined : row.reasons.noCli
      )
    )
  }

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
        // M253. Unread comes first: a pack preset whose command IS on the
        // PATH still will not spawn, and "read it" is the fix a person can act on.
        preset.reviewed === false ? REASON_UNREAD_PRESET : preset.available ? undefined : REASON_NOT_ON_PATH
      )
    )
    // M253. The unread preset's own door, beside the disabled row: the
    // subtitle is the command and directory a person is agreeing to run.
    if (preset.reviewed === false) {
      out.push({ id: `preset.read.${preset.id}`, title: `I've read this preset: ${preset.name}`, subtitle: preset.subtitle, searchText: `read reviewed trust preset pack ${preset.name}`, group: 'spawn', scope: 'presets', run: () => { void actions.markPresetRead(preset.id) } })
    }
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
  // M147 (backlog #34's "new workspace from a template set"): one row per
  // template — a fresh workspace named after the shape, switched to, holding
  // the shape. A template that cannot run carries its refusal, never absent.
  for (const t of ctx.templates ?? []) {
    out.push(withReason({
      id: `workspace.from-template.${t.id}`,
      title: `New workspace from ${t.name}`,
      subtitle: `${t.nodes} panel${t.nodes === 1 ? '' : 's'} in a workspace of their own`,
      searchText: 'new workspace from template set shape',
      group: 'workspace',
      run: () => actions.workspaceFromTemplate(t.id)
    }, t.refusal))
  }

  // --- Canvas --------------------------------------------------------------

  out.push({
    // M146. TWO rows, two names (backlog #23's rule): `Reset zoom` is Cmd+0's
    // INITIAL camera; `Zoom to fit` frames the selection when there is one and
    // every panel otherwise (Cmd+1's fitAll, reached as a named verb at last).
    // The `canvas.fit` id is kept for the row that has always run the reset.
    id: 'canvas.fit',
    title: 'Reset zoom',
    group: 'canvas',
    shortcut: '⌘0',
    run: () => actions.resetZoom()
  })
  out.push({
    id: 'canvas.zoom-fit',
    title: 'Zoom to fit',
    // No ⌘1 hint: that chord runs useViewport's fitAll (every panel), not
    // this selection-aware verb — a hint naming it lied when a selection
    // existed (the Act II critic). The row is the verb's one door.
    subtitle: 'the selected panels, or every panel',
    group: 'canvas',
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
  // M268. Center-page doors — same verbs as the TopBar / dock toggles.
  out.push({
    id: 'canvas.orchestration',
    title: 'Show Orchestration',
    searchText: 'orchestration orchestrate dashboard overview ops agents activity',
    group: 'canvas',
    run: () => actions.setCenterView('orchestration')
  })
  out.push({
    id: 'canvas.show',
    title: 'Show Canvas',
    searchText: 'canvas center view panels world',
    group: 'canvas',
    run: () => actions.setCenterView('canvas')
  })
  out.push({
    id: 'canvas.reset',
    title: 'Reset canvas…',
    group: 'canvas',
    run: () => actions.resetCanvas()
  })
  // M113. The typed door onto the board. A canvas-group row (a panel-group
  // row competes with Go-to rows by fuzzy score) and never disabled: a typed
  // item needs no service, no place and no CLI — it is a title on a board.
  out.push({
    id: 'board.open',
    title: 'Open board',
    searchText: 'board kanban columns todo working review done dispatch',
    group: 'canvas',
    run: () => actions.openBoard()
  })
  // M197 (D05). THE START WORK DOOR. Present always and never disabled: the
  // flow's own sentences are the answer to every empty case (no place, no
  // repository), each naming its fix, and a row that vanished would read as a
  // feature that was never built. It is the only door that reaches a start
  // with no board card already in hand.
  // M400 (B1). "task" is the noun: the row is New task…, the same sheet the
  // top bar's "+ New task" opens, and its `leads` lift it into the Tasks
  // section above every other row for "new", "task" and "start"
  // (`verify:palette task.rank.1`). The old words stay in searchText, so
  // "start work" still finds it. At rest it keeps its Canvas place.
  out.push({
    id: 'start.work',
    title: 'New task…',
    subtitle: 'what, where, and who — an agent works on it on its own branch',
    searchText: 'new task start work issue dispatch teammate repository folder lane begin',
    leads: ['new task', 'task', 'start task', 'start work'],
    group: 'canvas',
    run: () => actions.beginStartWork()
  })
  // M275. THE ARRANGEMENT DOORS, one row per preset. Four rows rather than one
  // row that then asks which: the arrangements are not variants of a setting,
  // they are four different shapes of work, and a person searching for
  // "review" should find the review arrangement rather than a menu. Present
  // always and never disabled, for `start.work`'s own reason — every empty
  // case has a sentence of its own naming its fix, and the sheet is where it
  // is said. The sheet opens with the arrangement already chosen.
  //
  // WRITTEN OUT, not looped. `closure.v9.1` finds a verb's palette door by
  // reading this file as TEXT (`id: '<row>'`), so a row built from a template
  // literal is a door the door-check cannot see — declared and unprovable.
  // `verify:swarm rows.1` fails for a preset with no row here, which is the
  // other half: neither can drift without a red.
  const swarmRow = (preset: typeof SWARM_LIST[number]): Omit<Command, 'id'> => ({
    title: `New task as a ${preset.label} swarm…`, subtitle: preset.hint,
    searchText: `swarm arrangement start work ${preset.id} ${preset.label} supervisor handoff worktree lane multi agent seats`,
    group: 'canvas', run: () => actions.beginStartWork({ swarm: preset.id })
  })
  out.push({ id: 'work.swarm.explore', ...swarmRow(SWARM_PRESETS.explore) })
  out.push({ id: 'work.swarm.implement', ...swarmRow(SWARM_PRESETS.implement) })
  out.push({ id: 'work.swarm.test', ...swarmRow(SWARM_PRESETS.test) })
  out.push({ id: 'work.swarm.review', ...swarmRow(SWARM_PRESETS.review) })
  // M314. THE RECIPE DOORS — written out, `closure.v9.1`'s reason above. Each
  // opens Start work with the recipe chosen: its context, checks and
  // deliverables filled in and editable, its one question focused.
  const recipeRow = (id: string, title: string, subtitle: string, words: string): Omit<Command, 'id'> => ({
    title, subtitle, searchText: `recipe start work ${words}`, group: 'canvas', run: () => actions.beginStartWork({ recipeId: id })
  })
  out.push({ id: 'recipe.fix-test', ...recipeRow('recipe-fix-test', 'Fix a failing test…', 'reproduce, fix the cause, prove it passes', 'fix failing test red broken ci') })
  out.push({ id: 'recipe.implement-issue', ...recipeRow('recipe-implement-issue', 'Implement an issue…', 'from the issue to a reviewed change with tests', 'implement issue feature ticket github jira') })
  out.push({ id: 'recipe.review-change', ...recipeRow('recipe-review-change', 'Review a change…', 'findings ranked by severity, no edits', 'review change diff branch pr pull request code review') })
  out.push({ id: 'recipe.investigate-bug', ...recipeRow('recipe-investigate-bug', 'Investigate a bug…', 'reproduce, find the root cause, propose a fix', 'investigate bug debug root cause reproduce') })
  // M312. The repository setup, for the captured panel's repository.
  out.push({
    id: 'repo.setup',
    title: 'Repository setup…',
    subtitle: 'how this repository installs, serves, checks and previews — every new lane inherits it',
    searchText: 'repository setup install dependencies services ports checks preview environment prepare lane',
    group: 'canvas',
    run: () => actions.beginRepoSetup()
  })
  // M313. The captured panel in the person's own editor: a file (at its
  // line when it has one), or the folder a conversation or terminal works in.
  out.push({
    id: 'editor.open',
    title: 'Open in editor',
    subtitle: 'the selected file, or the folder its agent works in — in your editor (Settings ▸ Open files in)',
    searchText: 'open in editor vscode code cursor zed ide worktree file line external',
    group: 'canvas',
    shortcut: '⌘⇧E',
    run: () => actions.openInEditor()
  })
  out.push({
    id: 'board.new',
    // M400. Named for what it does — a card on the board, nothing started —
    // so it cannot be mistaken for New task… (the row above it in the old list).
    title: 'Add a task to the board…',
    searchText: 'board work item task card todo kanban new add',
    group: 'canvas',
    run: () => actions.beginNewWorkItem()
  })
  // M123. The by-hand door onto the update NOTICE. Always present and never
  // disabled: the check's own third state (`could not check — <reason>`) is
  // the honest answer offline, and a row that vanished would read as a
  // feature that was never built. The subtitle is the LAST answer, so a
  // user who already asked sees it without asking again.
  out.push(withReason({
    id: 'update.check',
    title: 'Check for updates…',
    subtitle: ctx.update === undefined || ctx.update === null ? 'ask GitHub whether a newer release is published — nothing is installed' : updateSentence(ctx.update),
    searchText: 'update check release version newer github download notice',
    group: 'canvas',
    run: () => actions.checkForUpdates()
  }, ctx.update?.checking === true ? 'checking…' : undefined))

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
      subtitle: ctx.merged === true ? REASON_MERGED_READ_ONLY : 'compact without reordering — one undo',
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
      : (target.kind === 'terminal' ? undefined : REASON_NOT_TERMINAL_MARKS)
    out.push(withReason({ id: 'panel.prompt.previous', title: 'Previous prompt', subtitle: 'scroll to the command before this one', group: 'panel', searchText: 'prompt previous up jump command mark', hiddenAtRest: true,
      run: () => { if (target !== undefined) actions.jumpPrompt(target.id, -1) } }, reason))
    out.push(withReason({ id: 'panel.prompt.next', title: 'Next prompt', subtitle: 'scroll to the command after this one', group: 'panel', searchText: 'prompt next down jump command mark', hiddenAtRest: true,
      run: () => { if (target !== undefined) actions.jumpPrompt(target.id, 1) } }, reason))
    out.push(withReason({ id: 'panel.copy-last-output', title: 'Copy last command’s output', subtitle: 'the lines between its start and end marks', group: 'panel', searchText: 'copy last output command result clipboard', hiddenAtRest: true,
      run: () => { if (target !== undefined) actions.copyLastOutput(target.id) } }, reason))
  }

  // --- Export (M58; M112 opened the buffer door) ------------------------------
  //
  // The panel row prefers the DURABLE log but falls back to the live xterm
  // buffer (M112) once the panel has spawned, so scrollback being off is no
  // longer this row's own reason by itself — a spawned panel exports from
  // its buffer regardless. The one case still genuinely refusable is a
  // panel that has never started AND has scrollback off: neither source
  // has anything to give.
  {
    const target = ctx.capturedId === null ? undefined : ctx.panels.find((p) => p.id === ctx.capturedId)
    const reason = ctx.capturedId === null || target === undefined
      ? REASON_NO_FOCUS
      : (target.kind !== 'terminal'
          ? REASON_NOT_TERMINAL_OUTPUT
          : (ctx.scrollbackEnabled === false && target.spawned !== true ? REASON_NOTHING_TO_EXPORT : undefined))
    out.push(withReason({
      id: 'panel.export-text',
      title: 'Export panel output…',
      // M112. Honest about both sources now: the durable log (2 MB cap)
      // when scrollback is on and has bytes, else the live buffer (10 000
      // rows, xterm's own scrollback cap) — main decides which one wins.
      //
      // Final review, MINOR: "10 000 rows" is the normal-screen case. While
      // a full-screen program (vim, less, a TUI) has the panel in the
      // ALTERNATE screen, `SessionHandle.serialize()` reads that buffer,
      // which xterm gives no scrollback at all — the export is only what is
      // currently on screen. The subtitle says "the live buffer" without
      // repeating that row count, on purpose: promising 10 000 rows
      // unconditionally would be wrong for exactly the case a user reaches
      // for this row from (an agent stuck inside a pager).
      subtitle: 'the durable log if scrollback holds it (2 MB), else the live buffer (fewer rows inside a full-screen program), ANSI stripped, secrets scrubbed, to a file',
      searchText: 'export save output text transcript file panel',
      group: 'panel',
      run: () => { if (target !== undefined) actions.exportPanelText(target.id) }
    }, reason))
    // M93. Annotate mode: present always; disabled by name while merged.
    out.push(withReason({
      id: 'canvas.annotate',
      title: 'Annotate…',
      subtitle: 'click to place notes on the canvas or on a panel; Escape to stop',
      searchText: 'annotate note label sticky comment margin',
      group: 'canvas',
      run: () => actions.beginAnnotate()
    }, ctx.merged === true ? 'the merged view is read-only — leave it to annotate' : undefined))
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
    // M85. A free-text setting (the vault's folder) opens the same text line
    // every rename uses, with its CURRENT VALUE in the title for the reason
    // the number row states — a row saying only "Vault folder" would put the
    // user in a field with no idea what it holds now.
    if (setting.type === 'text') {
      const current = typeof setting.value === 'string' ? setting.value : ''
      out.push({
        id: `setting.${setting.id}`,
        title: `${setting.label}: ${current === '' ? 'not set' : current}`,
        subtitle: setting.description,
        searchText: setting.keywords.join(' '),
        group: 'setting',
        scope: 'settings',
        hiddenAtRest: true,
        run: () => actions.beginEditTextSetting(setting.id, setting.label, current)
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

  out.push(...buildEnvironmentRows(ctx.envReport ?? null, ctx.update ?? null))

  // --- Credentials -----------------------------------------------------------
  //
  // One shared builder, not a second copy of the ADD/VERIFY/DELETE branching
  // written inline here — buildCredentialRows is exported precisely so it can
  // be driven directly by verify:palette without constructing a whole
  // PaletteContext.
  out.push(...buildCredentialRows(ctx.credentials, SERVICES, actions))
  // M89. Every service on one page: the door is the navigator's pane, and
  // this row enters the Credentials scope the page's verbs open, so there
  // is one path from either side.
  out.push({ id: 'manage.integrations', title: 'Manage connections…', subtitle: `${ctx.credentials.filter((c) => c.verifiedAt !== undefined && c.rejectedAt === undefined).length} connected`, group: 'manage', entersScope: 'credentials', searchText: 'connections integrations services connected github jira credentials tokens', run: () => {} })
  // M88. PRESENT at rest and disabled with the Connect reason when no
  // github credential exists — the Jira door below only exists once a
  // credential does, which is the "row that disappears" rule broken by a
  // milestone; this door does not repeat it.
  out.push(
    withReason(
      { id: 'github.open', title: 'Open GitHub work', subtitle: 'issues assigned to you and pull requests waiting on you', searchText: 'github issues pull requests review assigned work', group: 'manage', run: () => actions.openGithub() },
      ctx.credentials.some((credential) => credential.service === 'github') ? undefined : REASON_NO_GITHUB
    )
  )
  // M89. Present at rest and disabled by the one sentence, like GitHub's door.
  out.push(
    withReason(
      { id: 'jira.open', title: 'Open Jira tickets', subtitle: 'Assigned to you', searchText: 'jira tickets assigned work', group: 'manage', run: () => actions.openJira() },
      ctx.credentials.some((credential) => credential.service === 'jira') ? undefined : notConnectedReason('jira')
    )
  )

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
  // M365. The capability query's door, and its rows: one per panel with a
  // toolbox directory, in answer order (has, inactive, unknown, lacks). Each
  // row carries the typed name in its searchText, so the scope's own filter
  // never hides an answer for not containing the name in its title.
  out.push({ id: 'capability.open', title: 'Which agents can…', subtitle: 'type a skill, command, agent or MCP server name — each agent\'s own toolbox answers', group: 'panel', entersScope: 'capability', searchText: 'capability can skill command agent mcp server toolbox which agents who can', run: () => {} })
  {
    // Scope-bound rows: filterCommands shows them only inside `capability`.
    const q = ctx.capabilityQuery ?? ''
    if (normalizeCapability(q) === '') {
      out.push(withReason({ id: 'capability.hint', title: 'Type a name', subtitle: 'a skill, a /command, an @agent or an MCP server', group: 'panel', scope: 'capability', hiddenAtRest: true, run: () => {} }, 'type the name to ask about'))
    } else if (ctx.capability === undefined || ctx.capability === null) {
      out.push(withReason({ id: 'capability.reading', title: 'Reading each agent\'s toolbox…', group: 'panel', scope: 'capability', hiddenAtRest: true, searchText: q, run: () => {} }, 'reading'))
    } else if (ctx.capability.length === 0) {
      out.push(withReason({ id: 'capability.none', title: 'No agent on this canvas has a toolbox to ask', group: 'panel', scope: 'capability', hiddenAtRest: true, searchText: q, run: () => {} }, 'open a conversation or an agent terminal in a folder first'))
    } else {
      const sorted = [...ctx.capability].sort((a, b) => CAPABILITY_ORDER[a.answer.kind] - CAPABILITY_ORDER[b.answer.kind])
      for (const r of sorted) {
        out.push({ id: `capability.${r.panelId}`, title: r.label, subtitle: capabilityWords(q, r.answer), group: 'panel', scope: 'capability', hiddenAtRest: true, searchText: q, run: () => actions.goToPanel(r.panelId) })
      }
    }
  }
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
      (s) => s.type === 'boolean' || s.type === 'number' || s.type === 'text'
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
        // M253 (the critic, 2). Unread first: Cmd+N would otherwise spawn a
        // stranger's command with no refusal anywhere on its path.
        preset.reviewed === false ? REASON_UNREAD_PRESET : preset.isDefault ? REASON_ALREADY_DEFAULT : undefined
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
    // M86. The row says where the branch stands, from the local tracking ref.
    const who = `${wt.status === undefined ? '' : `${wt.status} — `}${wt.attached ? `${wt.panelTitle ?? wt.panelId} is in it` : ''}`.replace(/ — $/, '')
    out.push(
      withReason(
        {
          id: `worktree.remove.${wt.id}`,
          title: `Remove worktree ${wt.branch}`,
          subtitle: who === '' ? wt.path : `${who} · ${wt.path}`,
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
  // M122. Persistence off is no longer the whole answer: the chat transcript
  // logs answer regardless, so the reason says so and the hits that came
  // still render beneath it. Only a query with an answer of NOTHING says
  // "no matches"; before the first keystroke the scope is quiet.
  if (!ctx.scrollbackEnabled) {
    out.push(withReason(
      { id: 'search.off', title: 'Terminal output is not being kept', subtitle: 'turn on Keep recent output on disk — chats still answer', group: 'panel', scope: 'search', hiddenAtRest: true, run: () => {} },
      REASON_SEARCH_OFF
    ))
  }
  if (ctx.searchResults !== null) {
    const result = ctx.searchResults
    const searched = result.searched
    const work = ctx.workSearch ?? null
    if (searched !== undefined && ctx.searchQuery.trim() !== '') {
      // D13. The scope names every source it read, and that it is THIS workspace's — nothing private to another was read.
      const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`
      const t = work === null
        ? `searched ${plural(searched.terminals, 'terminal')} and ${plural(searched.chats, 'chat')}`
        : `searched ${plural(searched.terminals, 'terminal')}, ${plural(searched.chats, 'chat')}, ${plural(work.searched.tasks, 'task')} and ${plural(work.searched.retained, 'retained outcome')} in this workspace`
      // M399 (A9): `searchText` is the query itself. The palette's own filter
      // runs over every row, so this line (what was read) showed only for a
      // query that happened to fuzzy-match "searched … terminals" — typing
      // `alex` hid it. It describes THIS answer, so it matches whatever asked.
      out.push(withReason({ id: 'search.scope', title: t, searchText: ctx.searchQuery, group: 'panel', scope: 'search', hiddenAtRest: true, run: () => {} }, t))
    }
    for (const failure of result.failures ?? []) {
      const t = `could not read ${failure.source} — ${failure.reason}`
      out.push(withReason({ id: `search.fail.${failure.source}`, title: t, group: 'panel', scope: 'search', hiddenAtRest: true, run: () => {} }, t))
    }
    // D13. Tasks and retained outcomes lead: they are what the work MEANT,
    // and the output lines beneath are where it happened. A hit frames the
    // task's card through the existing verb; one with no card says so and
    // runs nothing — a retained outcome never reopens its lane.
    if (work !== null && ctx.searchQuery.trim() !== '') {
      if (work.capped) { const t = `the first ${work.cap} tasks and outcomes — narrow the search`; out.push(withReason({ id: 'search.work-cap', title: t, group: 'panel', scope: 'search', hiddenAtRest: true, run: () => {} }, t)) }
      if (work.redacted > 0) { const t = `${work.redacted} secret${work.redacted === 1 ? '' : 's'} redacted from these tasks`; out.push(withReason({ id: 'search.work-redacted', title: t, group: 'panel', scope: 'search', hiddenAtRest: true, run: () => {} }, t)) }
      for (const hit of work.hits) {
        const id = hit.source === 'task' ? `search.task.${hit.itemId}` : `search.retained.${hit.outcomeId ?? hit.itemId}`
        const lead = hit.source === 'task' ? 'Task' : 'Retained outcome'
        const row = { id, title: `${lead} · ${hit.title}`, subtitle: `${hit.field}: ${hit.line}`, searchText: `${hit.title} ${hit.line}`, group: 'panel' as const, scope: 'search' as const, hiddenAtRest: true as const,
          run: () => { if (hit.cardPanelId !== undefined) { const r = actions.showTask(hit.cardPanelId); if (r.kind === 'refused' || r.partial === true) actions.say(r.kind === 'refused' ? r.reason : (r.note ?? '')) } } }
        out.push(hit.cardPanelId === undefined ? withReason(row, 'this task\'s card is no longer on the canvas — its record is kept, and nothing was reopened') : row)
      }
    }
    if (result.hits.length === 0 && (work === null || work.hits.length === 0)) {
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
      // M122. What the answer LEFT OUT comes first: the cap, and the secrets the gate replaced.
      // INFORMATION, not verbs: disabled with their own sentence, so stepping skips them and Enter never lands on a row that does nothing.
      if (result.capped) { const t = `the first ${result.cap} matches — narrow the search`; out.push(withReason({ id: 'search.cap', title: t, group: 'panel', scope: 'search', hiddenAtRest: true, run: () => {} }, t)) }
      if (result.redacted > 0) { const t = `${result.redacted} secret${result.redacted === 1 ? '' : 's'} redacted from these lines`; out.push(withReason({ id: 'search.redacted', title: t, group: 'panel', scope: 'search', hiddenAtRest: true, run: () => {} }, t)) }
      // M64. The hit leads with the panel's NAME, not its path-and-id label.
      const labelOf = new Map(ctx.panels.map((row) => [row.id, row.title ?? row.name ?? row.label]))
      for (const hit of result.hits) {
        const isTurn = hit.kind === 'transcript'
        out.push({
          id: isTurn ? `search.hit.${hit.panelId}.t${hit.turnIndex ?? 0}` : `search.hit.${hit.panelId}.${hit.lineIndex ?? 0}`,
          // The panel's name AND which kind the line came from: two panels can share a name, and the two verbs differ.
          title: `${labelOf.get(hit.panelId) ?? hit.panelId} · ${isTurn ? `chat turn ${(hit.turnIndex ?? 0) + 1}` : `line ${(hit.lineIndex ?? 0) + 1}`}`,
          mono: true,
          // The matched line, and the haystack: the palette's own filter runs
          // over title+subtitle+searchText, so typing narrows the hits too.
          subtitle: hit.line,
          searchText: hit.line,
          group: 'panel',
          scope: 'search',
          hiddenAtRest: true,
          // A transcript hit flies to the chat AND to the turn; a scrollback hit keeps M42's door.
          run: () => { actions.goToPanel(hit.panelId); if (isTurn) actions.scrollChatTurn(hit.panelId, hit.turnIndex ?? 0) }
        })
      }
    }
  }

  // M180. The palette's door for `new-chat` is the existing `panel.new-chat`
  // row (and the codex sandbox rows) — a third row minting the same chat was
  // the critic's finding; only the readiness verb is new here.
  out.push(withReason({ id: 'starter.open', title: 'Open the starter canvas', subtitle: 'Your agent and one captioned example of each kind of object', group: 'canvas', searchText: 'starter canvas examples onboarding first run welcome', run: () => { void actions.openStarter() } },
    ctx.starterReason ?? undefined))
  // M182. The six editing verbs as rows over the SELECTED workflow panel's
  // template, each opening the palette's text mode; disabled by name when no
  // workflow panel is selected. The diagram's drag and Delete are the canvas
  // doors for move and remove; M183 brings the library and the port drag.
  {
    const wf = ctx.panels.find((p) => ctx.selectedIds.includes(p.id) && p.kind === 'workflow')
    const templateId = wf === undefined ? undefined : (ctx.workflowTemplateOf?.(wf.id))
    const reason = templateId === undefined ? 'select a workflow panel first' : undefined
    // Six literal ids (closure.v9.1 reads this file as TEXT for each door's row).
    const edit = (verb: 'add' | 'move' | 'set' | 'remove' | 'edge' | 'unedge') => () => { if (templateId !== undefined) actions.beginWorkflowEdit(templateId, verb) }
    out.push(withReason({ id: 'workflow.add', title: 'Workflow: add node…', subtitle: 'a terminal, chat, pool, orchestrator or collect node in the draft', group: 'canvas', searchText: 'workflow template edit add node diagram', run: edit('add') }, reason))
    out.push(withReason({ id: 'workflow.move', title: 'Workflow: move node…', subtitle: '<key> <dx> <dy>', group: 'canvas', searchText: 'workflow template edit move node diagram', run: edit('move') }, reason))
    out.push(withReason({ id: 'workflow.set', title: 'Workflow: set field…', subtitle: '<key> <field> <value>', group: 'canvas', searchText: 'workflow template edit set field node diagram', run: edit('set') }, reason))
    out.push(withReason({ id: 'workflow.remove', title: 'Workflow: remove node…', subtitle: '<key> — its edges go with it', group: 'canvas', searchText: 'workflow template edit remove node diagram', run: edit('remove') }, reason))
    out.push(withReason({ id: 'workflow.edge', title: 'Workflow: connect…', subtitle: '<from> <to> <trigger>', group: 'canvas', searchText: 'workflow template edit connect edge diagram', run: edit('edge') }, reason))
    out.push(withReason({ id: 'workflow.save', title: 'Workflow: save', subtitle: 'write the draft back to the template', group: 'canvas', searchText: 'workflow template save draft revision', run: () => { if (templateId !== undefined) void actions.saveWorkflow(templateId) } }, reason))
    // M184 (the critic, 15f). A built-in's ONLY save is a copy, and it was
    // reachable from the panel alone: `workflow.save` dead-ended at "a
    // built-in workflow saves as a copy" with no door the sentence named.
    out.push(withReason({ id: 'workflow.copy', title: 'Workflow: save a copy', subtitle: 'keep the diagram under a new name', group: 'canvas', searchText: 'workflow template save copy duplicate built-in', run: () => { if (templateId !== undefined) void actions.saveWorkflowCopy(templateId) } }, reason))
    out.push(withReason({ id: 'workflow.run', title: 'Workflow: run', subtitle: 'run the shape on the diagram', group: 'canvas', searchText: 'workflow template run diagram start', run: () => { if (templateId !== undefined) actions.runWorkflowNow(templateId) } }, reason))
    out.push(withReason({ id: 'workflow.stop', title: 'Workflow: stop', subtitle: 'interrupt what this workflow started', group: 'canvas', searchText: 'workflow template stop interrupt', run: () => { if (templateId !== undefined) actions.stopWorkflow(templateId) } }, reason))
    // M188. Test this node: the selected block, run on its own, with its
    // duration and a named failure — never its neighbours.
    out.push(withReason({ id: 'node.test', title: 'Test this node', subtitle: 'run the selected block on its own and report what it answered', group: 'canvas', searchText: 'node test run block try execute action fetch', run: () => { if (templateId !== undefined) void actions.testNode(templateId) } }, reason))
    out.push(withReason({ id: 'workflow.unedge', title: 'Workflow: disconnect…', subtitle: '<from> <to>', group: 'canvas', searchText: 'workflow template edit disconnect edge diagram', run: edit('unedge') }, reason))
  }
  const imagePanelId = ctx.panels.find((p) => ctx.selectedIds.includes(p.id) && p.kind === 'image')?.id
  // M202 (D07). The selected work card, for the task review row. Derived the
  // same way and for the same reason: the row is PRESENT at rest and disabled
  // by name, because a row that disappears is indistinguishable from a
  // feature that was never built.
  const workPanelId = ctx.panels.find((p) => ctx.selectedIds.includes(p.id) && p.kind === 'work')?.id
  // M190. Feedback: a DRAFT, opened in the person's own browser. The row says
  // what the door does, because "Send feedback" would promise a send this app
  // never makes.
  // M336–M337. The account and sharing rows. The three sharing rows open the
  // share dialog; the dialog is where anything is shared, opened or changed.
  out.push({ id: 'account.sign-in', title: 'Account: sign in with GitHub…', subtitle: 'to share workspaces and see your team; add another account the same way', group: 'canvas', searchText: 'account sign in login github supabase add another switch', run: () => { void actions.signIn() } })
  out.push({ id: 'share.workspace', title: 'Share this workspace…', subtitle: 'put it in one of your organizations — teammates see cards, never commands or transcripts', group: 'canvas', searchText: 'share workspace team organization collaborate invite members', run: () => { void actions.shareWorkspace() } })
  out.push({ id: 'share.open', title: 'Open a shared workspace…', subtitle: 'the workspaces your teammates shared with you', group: 'canvas', searchText: 'open shared workspace team join room', run: () => { void actions.openSharedWorkspace() } })
  out.push({ id: 'share.role', title: 'Shared workspace: members and roles…', subtitle: 'who is in, and whether they edit or watch — the owner decides', group: 'canvas', searchText: 'share role member editor viewer remove permission access', run: () => { void actions.proposeShareRole() } })
  // M352. The verb line, like note.tint: the value is typed, and a person's line may raise a cap.
  const chatPanelId = ctx.panels.find((p) => ctx.selectedIds.includes(p.id) && p.kind === 'chat')?.id
  out.push(withReason({ id: 'agent.cap', title: 'Cap this agent…', subtitle: 'its own spend and context caps — type cap-agent <panel> 5usd,200k (none, or default for the Settings caps)', group: 'canvas', searchText: 'agent cap spend budget cost context tokens limit hold stop dollars', run: () => actions.beginRunVerb() }, chatPanelId === undefined ? 'select an agent conversation first' : undefined))
  // M361. Opens the verb line, like cap-agent: the place and the comment are typed.
  out.push(withReason({ id: 'review.comment', title: 'Comment on a review line…', subtitle: 'a comment pinned to a line of this task\'s diff — type review-comment <panel> path:line <comment>; from an agent it is a proposal', group: 'canvas', searchText: 'review comment line diff note objection reviewer proposal', run: () => actions.beginRunVerb() }, ctx.selectedIds.length === 0 ? 'select a task\'s card, its review or its conversation first' : undefined))
  out.push({ id: 'feedback.open', title: 'Prepare feedback…', subtitle: 'a scrubbed draft in your browser — you read it and send it, this app does not', group: 'canvas', searchText: 'feedback issue bug report problem help github', run: () => { void actions.prepareFeedback() } })
  // M189. The portable file's two rows. Export writes what is on this canvas
  // (pictures only when the person asks, through the verb line); Import makes
  // a SEPARATE workspace and starts nothing.
  out.push({ id: 'portable.export', title: 'Export this canvas…', subtitle: 'one file: the objects, the workflows, secrets scrubbed and every omission named', group: 'canvas', searchText: 'export canvas file share portable save send', run: () => { void actions.exportCanvas() } })
  // M251. Present at rest and disabled by name, the image.replace rule: the
  // verb itself refuses a file that is not Markdown, in its own sentence.
  const deckPanelId = ctx.panels.find((p) => ctx.selectedIds.includes(p.id) && p.kind === 'file')?.id
  out.push(withReason({ id: 'deck.export-pptx', title: 'Deck: export to PowerPoint…', subtitle: 'the selected Markdown file as slides — headings, bullets, pictures and notes; secrets scrubbed and anything left out named', group: 'canvas', searchText: 'deck slides pptx powerpoint keynote export presentation markdown', run: () => { if (deckPanelId !== undefined) void actions.exportDeck(deckPanelId).then((r) => actions.say(r.kind === 'refused' ? r.reason : (r.note ?? ''))) } }, deckPanelId === undefined ? 'select a Markdown file panel first' : undefined))
  out.push({ id: 'portable.import', title: 'Import a canvas…', subtitle: 'into a new workspace, with nothing started', group: 'canvas', searchText: 'import canvas file open portable load', run: () => { void actions.importCanvas() } })
  // M250. A literal id, for closure.v9.1's text read. The refusal (a docx the
  // converter cannot read, a note already there) lands on the feedback line.
  out.push({ id: 'note.import-docx', title: 'Import a Word document…', subtitle: 'a new Markdown note beside the .docx — what was dropped is named, and the note waits to be read', group: 'canvas', searchText: 'import word docx document convert note markdown', run: () => { void actions.importDocx().then((r) => { if (r.kind === 'refused') actions.say(r.reason) }) } })
  // M253. A pack's two rows. Import shows what the pack holds and needs FIRST
  // and adds nothing until Add; export writes the library — not this canvas.
  out.push({ id: 'pack.export', title: 'Export a pack…', subtitle: 'your workflows, saved prompts and presets in one file — secrets scrubbed, credentials named and never carried', group: 'canvas', searchText: 'export pack share bundle discipline library workflows prompts presets', run: () => { void actions.exportPack() } })
  out.push({ id: 'pack.sample', title: 'Import the sample dev-relations pack…', subtitle: 'release notes, changelog, announcement and PR-comment workflows — shown first, added only when you choose Add', group: 'canvas', searchText: 'sample pack dev relations devrel release notes changelog announcement github', run: () => { void actions.importSamplePack() } })
  // M255. Publishing the SELECTED draft file. Disabled by name until exactly
  // one panel is selected; the action then checks it is a file and says so.
  // Main's own dialog shows the text and asks before anything is sent.
  const oneSelected = ctx.selectedIds.length === 1 ? undefined : 'select the one draft file to publish first'
  out.push(withReason({ id: 'publish.release', title: 'Publish as a GitHub release…', subtitle: 'the selected draft file becomes a release under the tag you type — you see the text before it is sent', group: 'canvas', searchText: 'publish github release notes tag draft', run: () => actions.beginPublish('release') }, oneSelected))
  out.push(withReason({ id: 'publish.comment', title: 'Comment on a pull request…', subtitle: 'the selected draft file becomes a comment on the PR you name — you see the text before it is sent', group: 'canvas', searchText: 'publish github comment pull request pr draft', run: () => actions.beginPublish('comment') }, oneSelected))
  out.push(withReason({ id: 'publish.discussion', title: 'Post a GitHub Discussion…', subtitle: 'the selected draft file becomes a Discussion in the category you name — you see the text before it is sent', group: 'canvas', searchText: 'publish github discussion announcement post draft', run: () => actions.beginPublish('discussion') }, oneSelected))
  out.push({ id: 'pack.import', title: 'Import a pack…', subtitle: 'shows what it holds and needs; nothing is added until you choose Add', group: 'canvas', searchText: 'import pack bundle open discipline library add', run: () => { void actions.importPack() } })
  // M255 (merge). An imported workflow is marked read by the button ON its
  // workflow panel (M252's `onMarkRead`), never by a palette row: M253's
  // `workflow.read.<id>` rows would have cleared ANY unread template —
  // a described tool's included — which `verify:verbs tool.door.1` forbids.
  // M187. One row per FORM, because "add a note" and "draw a region around
  // this work" are different intentions and a form picker would make a
  // person choose twice. Each says what its form is FOR (the empty-state
  // rule's sentence, from `noteFormSentence`).
  // Three LITERAL ids: `closure.v9.1` reads this file as text for each door's
  // row, and a template literal is a row it cannot see (which is exactly the
  // "a declaration is not a door" failure the check exists for).
  out.push({ id: 'note.add.sticky', title: 'Add a sticky note', subtitle: noteFormSentence('sticky'), group: 'canvas', searchText: 'note sticky add annotate label yellow', run: () => { actions.addNote('sticky') } })
  out.push({ id: 'note.add.text', title: 'Add free text', subtitle: noteFormSentence('text'), group: 'canvas', searchText: 'note text add type words heading', run: () => { actions.addNote('text') } })
  out.push({ id: 'note.add.frame', title: 'Add a named region', subtitle: noteFormSentence('frame'), group: 'canvas', searchText: 'note frame region group area label around', run: () => { actions.addNote('frame') } })
  // M388. The flowchart shape's rows — eight LITERAL ids, one per form, for
  // the reason the note rows above spell out (closure.v9.1 reads this file as
  // text; a template literal is a row it cannot see).
  out.push({ id: 'shape.add.process', title: 'Add a process step', subtitle: shapeFormSentence('process'), group: 'canvas', searchText: 'flowchart shape process step box diagram add', run: () => { actions.addShape('process') } })
  out.push({ id: 'shape.add.decision', title: 'Add a decision', subtitle: shapeFormSentence('decision'), group: 'canvas', searchText: 'flowchart shape decision diamond question branch diagram add', run: () => { actions.addShape('decision') } })
  out.push({ id: 'shape.add.terminator', title: 'Add a start or end', subtitle: shapeFormSentence('terminator'), group: 'canvas', searchText: 'flowchart shape terminator start end stadium pill diagram add', run: () => { actions.addShape('terminator') } })
  out.push({ id: 'shape.add.io', title: 'Add an input or output', subtitle: shapeFormSentence('io'), group: 'canvas', searchText: 'flowchart shape input output io parallelogram data diagram add', run: () => { actions.addShape('io') } })
  out.push({ id: 'shape.add.document', title: 'Add a document', subtitle: shapeFormSentence('document'), group: 'canvas', searchText: 'flowchart shape document doc page diagram add', run: () => { actions.addShape('document') } })
  out.push({ id: 'shape.add.subprocess', title: 'Add a subprocess', subtitle: shapeFormSentence('subprocess'), group: 'canvas', searchText: 'flowchart shape subprocess subroutine predefined diagram add', run: () => { actions.addShape('subprocess') } })
  out.push({ id: 'shape.add.junction', title: 'Add a junction', subtitle: shapeFormSentence('junction'), group: 'canvas', searchText: 'flowchart shape junction connector point circle merge diagram add', run: () => { actions.addShape('junction') } })
  out.push({ id: 'shape.add.text', title: 'Add diagram text', subtitle: shapeFormSentence('text'), group: 'canvas', searchText: 'flowchart shape text label caption diagram add', run: () => { actions.addShape('text') } })
  const shapeSelected = ctx.panels.find((p) => ctx.selectedIds.includes(p.id) && p.kind === 'shape')?.id
  out.push(withReason({ id: 'shape.label', title: 'Edit this shape\'s label', subtitle: 'type on the shape itself — Escape or a click away keeps it', group: 'canvas', searchText: 'flowchart shape label text rename edit', run: () => { actions.editShapeLabel() } }, shapeSelected === undefined ? 'select a shape first' : undefined))
  out.push(withReason({ id: 'shape.style', title: 'Restyle this shape…', subtitle: 'form, fill, line or text — type shape-style <shape> <field> <value>', group: 'canvas', searchText: 'flowchart shape style form fill line colour stroke', run: () => actions.beginRunVerb() }, shapeSelected === undefined ? 'select a shape first' : undefined))
  // M389–M391. The arranging and flowchart rows — LITERAL ids (closure.v9.1).
  const many = ctx.selectedIds.length
  out.push(withReason({ id: 'flowchart.connect', title: 'Connect two objects…', subtitle: 'type connect <from> <to> [label] — or drag from a port', group: 'canvas', searchText: 'flowchart connector connect arrow line link shapes', run: () => actions.beginRunVerb() }, undefined))
  out.push({ id: 'flowchart.connector.style', title: 'Restyle a connector…', subtitle: 'route, arrows, line, dashed or label — type connector-style <connector> <field> <value>', group: 'canvas', searchText: 'connector line arrow route curved straight elbow dashed label style', run: () => actions.beginRunVerb() })
  out.push(withReason({ id: 'flowchart.duplicate', title: 'Duplicate', subtitle: 'shapes, notes and pictures — ⌘D', group: 'canvas', searchText: 'duplicate copy clone shape note picture', run: () => { actions.duplicateObjects() } }, many === 0 ? 'select a shape, a note or a picture first' : undefined))
  out.push(withReason({ id: 'arrange.align.left', title: 'Align left edges', subtitle: 'line the selection up on its leftmost edge', group: 'canvas', searchText: 'align left arrange line up', run: () => { actions.alignObjects('left') } }, many < 2 ? 'select two or more objects first' : undefined))
  out.push(withReason({ id: 'arrange.align.hcentre', title: 'Align centres (horizontally)', subtitle: 'one vertical line through every centre', group: 'canvas', searchText: 'align centre center horizontal arrange', run: () => { actions.alignObjects('hcentre') } }, many < 2 ? 'select two or more objects first' : undefined))
  out.push(withReason({ id: 'arrange.align.right', title: 'Align right edges', subtitle: 'line the selection up on its rightmost edge', group: 'canvas', searchText: 'align right arrange', run: () => { actions.alignObjects('right') } }, many < 2 ? 'select two or more objects first' : undefined))
  out.push(withReason({ id: 'arrange.align.top', title: 'Align top edges', subtitle: 'line the selection up on its topmost edge', group: 'canvas', searchText: 'align top arrange', run: () => { actions.alignObjects('top') } }, many < 2 ? 'select two or more objects first' : undefined))
  out.push(withReason({ id: 'arrange.align.vcentre', title: 'Align middles (vertically)', subtitle: 'one horizontal line through every centre', group: 'canvas', searchText: 'align middle centre vertical arrange', run: () => { actions.alignObjects('vcentre') } }, many < 2 ? 'select two or more objects first' : undefined))
  out.push(withReason({ id: 'arrange.align.bottom', title: 'Align bottom edges', subtitle: 'line the selection up on its lowest edge', group: 'canvas', searchText: 'align bottom arrange', run: () => { actions.alignObjects('bottom') } }, many < 2 ? 'select two or more objects first' : undefined))
  out.push(withReason({ id: 'arrange.distribute.across', title: 'Space evenly across', subtitle: 'equal gaps, left to right; the outer two stay put', group: 'canvas', searchText: 'distribute space evenly horizontal across arrange', run: () => { actions.distributeObjects('across') } }, many < 3 ? 'select three or more objects first' : undefined))
  out.push(withReason({ id: 'arrange.distribute.down', title: 'Space evenly down', subtitle: 'equal gaps, top to bottom; the outer two stay put', group: 'canvas', searchText: 'distribute space evenly vertical down arrange', run: () => { actions.distributeObjects('down') } }, many < 3 ? 'select three or more objects first' : undefined))
  out.push(withReason({ id: 'flowchart.layout.down', title: 'Lay out this chart, top to bottom', subtitle: 'the selected chart in ranks, each shape travelling to its place', group: 'canvas', searchText: 'flowchart layout auto arrange tidy diagram vertical down', run: () => { actions.layoutFlowchart('down') } }, shapeSelected === undefined && many < 2 ? 'select a shape in a chart first' : undefined))
  out.push(withReason({ id: 'flowchart.layout.right', title: 'Lay out this chart, left to right', subtitle: 'the selected chart in columns, each shape travelling to its place', group: 'canvas', searchText: 'flowchart layout auto arrange tidy diagram horizontal right', run: () => { actions.layoutFlowchart('right') } }, shapeSelected === undefined && many < 2 ? 'select a shape in a chart first' : undefined))
  out.push(withReason({ id: 'flowchart.plan', title: 'New task from this chart…', subtitle: 'its steps become a task plan — nothing runs until you press Start', group: 'canvas', searchText: 'flowchart plan start work task steps sketch diagram', run: () => { actions.planFromChart() } }, shapeSelected === undefined ? 'select a shape in a chart first' : undefined))
  out.push({ id: 'flowchart.import', title: 'Import a Mermaid flowchart…', subtitle: 'a .mmd or .md file becomes shapes you can edit — nothing in it runs', group: 'canvas', searchText: 'mermaid import flowchart diagram graph file', run: () => { void actions.importFlowchart() } })
  out.push({ id: 'flowchart.export.mermaid', title: 'Export the diagram as Mermaid…', subtitle: 'the selected chart, or every shape — secrets scrubbed, the count said', group: 'canvas', searchText: 'mermaid export flowchart diagram save text', run: () => { void actions.exportFlowchart('mermaid') } })
  out.push({ id: 'flowchart.export.svg', title: 'Export the diagram as SVG…', subtitle: 'a vector picture of the chart — text only, secrets scrubbed', group: 'canvas', searchText: 'svg export flowchart diagram image vector save', run: () => { void actions.exportFlowchart('svg') } })
  const notePanelId = ctx.panels.find((p) => ctx.selectedIds.includes(p.id) && p.kind === 'note')?.id
  out.push(withReason({ id: 'note.tint', title: 'Tint this note…', subtitle: 'yellow, blue, green or pink — type note-tint <panel> <tint>', group: 'canvas', searchText: 'note tint colour yellow blue green pink sticky', run: () => actions.beginRunVerb() }, notePanelId === undefined ? 'select a sticky note first' : undefined))
  // M186. The picture rows. `image.add` opens the verb line (a path is what
  // it needs and this app has no second file browser); `image.replace` acts on
  // the SELECTED picture through the system's own chooser, and is disabled by
  // name when the selection is not a picture.
  out.push({ id: 'image.add', title: 'Image: add a picture…', subtitle: 'type image-add <path> — or drop one on the canvas', group: 'canvas', searchText: 'image add picture png jpeg drop paste screenshot', run: () => actions.beginRunVerb() })
  out.push(withReason({ id: 'work.review', title: 'Task: review the lane', subtitle: 'open the review for the selected work card\'s lane, beside the task and its conversation', group: 'canvas', searchText: 'task review lane work card changes diff ready handoff', run: () => { if (workPanelId !== undefined) { const r = actions.reviewTask(workPanelId); if (r.kind === 'refused') actions.say(r.reason) } } }, workPanelId === undefined ? 'select a work card first' : undefined))
  // M203 (D08). From a card, or from the one selected panel of a task; the
  // verb itself refuses by name for a panel in no task or in two.
  const taskPanelId = workPanelId ?? (ctx.selectedIds.length === 1 ? ctx.selectedIds[0] : undefined)
  out.push(withReason({ id: 'task.show', title: 'Task: show this task', subtitle: 'frame the selected card\'s task — or the task the selected panel belongs to; nothing moves', group: 'canvas', searchText: 'task show frame related lane conversation work card find navigate where', run: () => { if (taskPanelId !== undefined) { const r = actions.showTask(taskPanelId); if (r.kind === 'refused' || r.partial === true) actions.say(r.kind === 'refused' ? r.reason : (r.note ?? '')) } } }, taskPanelId === undefined ? 'select a work card, or one panel of a task, first' : undefined))
  out.push(withReason({ id: 'task.focus', title: 'Task: focus this task', subtitle: 'open the task beside its conversation — changes, checks, review and preview on one page; Esc comes back', group: 'canvas', searchText: 'task focus workspace conversation diff review checks preview open page', run: () => { if (taskPanelId !== undefined) { const r = actions.focusTask(taskPanelId); if (r.kind === 'refused') actions.say(r.reason) } } }, taskPanelId === undefined ? 'select a work card, or one panel of a task, first' : undefined))
  out.push(withReason({ id: 'task.related', title: 'Task: show related', subtitle: 'ring the task\'s panels and dim the rest; nothing moves — again to turn it off', group: 'canvas', searchText: 'task related highlight lens dim focus members show', run: () => { if (taskPanelId !== undefined) { const r = actions.showRelated(taskPanelId); if (r.kind === 'refused') actions.say(r.reason) } } }, taskPanelId === undefined ? 'select a work card, or one panel of a task, first' : undefined))
  // M258. Fit task — present at rest; the verb itself refuses by name with no task context.
  out.push({ id: 'task.fit', title: 'Fit task', subtitle: 'frame the active task — the one Show related lit, else the selected panel\'s task', group: 'canvas', searchText: 'fit task frame zoom active lens focus camera', run: () => { const r = actions.fitTask(); if (r.kind === 'refused') actions.say(r.reason) } })
  out.push(withReason({ id: 'task.arrange', title: 'Task: arrange this task', subtitle: 'compact the task\'s panels in reading order, clear of everything else — one undo', group: 'canvas', searchText: 'task arrange tidy compact layout members gather', run: () => { if (taskPanelId !== undefined) { const r = actions.arrangeTask(taskPanelId); if (r.kind === 'refused') actions.say(r.reason) } } }, taskPanelId === undefined ? 'select a work card, or one panel of a task, first' : undefined))
  out.push(withReason({ id: 'image.replace', title: 'Image: replace this picture…', subtitle: 'choose different bytes for the selected picture', group: 'canvas', searchText: 'image replace picture missing repair choose', run: () => { if (imagePanelId !== undefined) void actions.replaceImage(imagePanelId) } }, imagePanelId === undefined ? 'select a picture panel first' : undefined))
  // M185, and M195's fifth. The preview's rows. Every one is PRESENT at rest — the verbs
  // refuse by name against no subject (this repo's rule: a row that
  // disappears is indistinguishable from a feature that was never built) —
  // and the ids are literals `closure.v9.1` reads this file as text for.
  out.push({ id: 'preview.open', title: 'Preview: open the project', subtitle: 'the page a process of the selected panel is serving', group: 'canvas', searchText: 'preview open project port dev server localhost discover', run: () => { void actions.openPreview() } })
  out.push({ id: 'preview.width', title: 'Preview: set the width…', subtitle: 'phone, tablet, laptop or full — type preview-width <name> on the verb line', group: 'canvas', searchText: 'preview width device phone tablet laptop responsive', run: () => actions.beginRunVerb() })
  out.push({ id: 'preview.capture', title: 'Preview: capture the page', subtitle: 'a real picture of the pane, placed as an image on the canvas', group: 'canvas', searchText: 'preview capture screenshot picture image page', run: () => { void actions.capturePreview() } })
  out.push({ id: 'preview.bind', title: 'Preview: bind the source', subtitle: 'the selected panel\'s folder is the work this preview reloads for', group: 'canvas', searchText: 'preview bind source project folder reload own owner', run: () => { const r = actions.bindPreview(); if (r.kind === 'refused') actions.say(r.reason) } })
  out.push({ id: 'preview.dev', title: 'Preview: start the dev server', subtitle: "the project's own dev script, in a terminal you can see and stop", group: 'canvas', searchText: 'preview dev server npm run start serve project', run: () => { void actions.startDevServer() } })
  out.push({ id: 'onboarding.readiness', title: 'Check engine readiness', subtitle: 'Ask the login shell again which conversation engines are installed', group: 'canvas', searchText: 'onboarding setup install claude codex environment readiness', run: () => { void actions.checkReadiness() } })

  // --- M96: the verb line ------------------------------------------------------
  // ONE row takes a verb and its arguments. Present at rest, never hidden,
  // never disabled: the plan builder is what refuses, by name, once a line
  // is typed — a row that hid when no panel was focused would hide `tidy`
  // and `spawn`, which need none.
  out.push({
    id: 'canvas.run-verb',
    title: 'Run a verb…',
    subtitle: 'e.g. focus n3 · type n3 hello · close n3 — destructive verbs ask first',
    group: 'canvas',
    searchText: 'run verb plan command automate script',
    run: () => actions.beginRunVerb()
  })

  // --- M97: Auto ---------------------------------------------------------------
  // Four modes and a stop on the CAPTURED chat. Every row present; a mode is
  // disabled naming the live run, Stop is disabled naming the absence of
  // one, a terminal names the chat fix, no focus names the focus fix.
  {
    const target = ctx.panels.find((p) => p.id === ctx.capturedId)
    const live = target?.auto !== undefined && target.auto.state === 'running'
    const need = ctx.capturedId === null || target === undefined ? REASON_NO_FOCUS
      : target.kind !== 'chat' ? 'auto runs in a chat panel — open one with New chat…'
      : undefined
    for (const modeId of AUTO_MODE_IDS) {
      const mode = AUTO_MODES[modeId]
      out.push(withReason({
        id: `panel.auto.${modeId}`,
        title: `Auto: ${mode.label}`,
        subtitle: `${mode.hint} · up to ${mode.turnLimit} turns`,
        // `canvas`, not `panel`: in the panel section `Auto: Harden` outranks a
        // panel titled `auth refactor` for the query `auth` (a subsequence of
        // both) and steals Enter — palette check 33.
        group: 'canvas',
        searchText: `auto autonomous ${modeId} run bounded ${mode.label}`,
        run: () => actions.startAuto(ctx.capturedId!, modeId)
      }, need ?? (live ? `an auto run is already running here (${target!.auto!.mode}) — stop it first` : undefined)))
    }
    out.push(withReason({
      id: 'panel.auto.stop',
      title: 'Stop auto',
      subtitle: live ? `stop the ${target!.auto!.mode} run after this turn` : 'no auto run is live here',
      group: 'canvas',
      searchText: 'auto stop cancel autonomous',
      run: () => actions.stopAuto(ctx.capturedId!)
    }, need ?? (live ? undefined : 'no auto run is live in this chat')))
  }

  // --- M100: the roster's door --------------------------------------------------
  out.push({
    id: 'manage.teammates',
    title: 'Manage teammates…',
    subtitle: ctx.teammateCount === undefined || ctx.teammateCount === 0 ? 'agents that keep a brief and their own memory, so each task starts where the last left off' : `${ctx.teammateCount} teammate${ctx.teammateCount === 1 ? '' : 's'}`,
    group: 'manage',
    searchText: 'teammates agents roster identity places brief memory manage',
    run: () => actions.openTeammates()
  })

  // --- M106: the workspace's second verb ---------------------------------------
  out.push({
    id: 'canvas.flip',
    title: 'Flip terminals',
    subtitle: 'every terminal shows its work title large, agent and role beneath — the far view, on purpose; again to flip back',
    group: 'canvas',
    searchText: 'flip terminals titles far view overview roles',
    run: () => actions.toggleFlip()
  })

  // M399 (A10). SAY THE DIFFERENCE. With a panel selected (the HUD reads "1
  // selected") and none clicked into, every focus-gated row said "click into
  // a panel first", which reads as a lie beside the selection. Selection and
  // focus stay two things — these rows act on the panel the keyboard is in,
  // and letting a selection stand in for it changed the subject of ~40 rows at
  // once (measured: a renderer crash in verify:panels:product) — so the
  // sentence names the difference instead.
  if (ctx.capturedId === null && ctx.selectedIds.length > 0) {
    return out.map((row) => (row.disabledReason === REASON_NO_FOCUS ? { ...row, disabledReason: REASON_NO_FOCUS_SELECTED } : row))
  }
  return out
}
