import type { TaskPlan } from '@shared/task-plan'
import { COMMAND_ROW_ID, REASON_NO_COMMAND } from './command-panel'
import { type FlowRequest } from '@shared/team-flow'
import type { CreationResult } from '@shared/verb-table'
import type { PersistedWorkItem } from '@shared/work-items'
import type { StartWorkOutcome } from './start-work'
import { type SwarmPresetId } from '@shared/swarm'
import type { ToolScope } from '@shared/toolbox'
import type { Command } from './palette-model'
// Type-only: SettingValue is Task 4's settings-schema addition.
// Erased by esbuild, so it costs verify:palette nothing that the bundle
// otherwise has no @shared VALUE import at all (that alias is wired
// pre-emptively for exactly this day). The @renderer import below is a
// different matter and this comment used to be read as covering it: waitingCount
// is a VALUE, so verify-palette.cjs's @renderer alias is load-bearing, not
// pre-emptive. Measured in M14 by deleting the alias and building.
import { type PermissionMode } from '@shared/cost'
import { settingDef, type SettingValue } from '@shared/settings-schema'
import { AUTO_MODES, AUTO_MODE_IDS, type AutoModeId } from '@shared/auto'
import { waitingCount } from '@renderer/shell/rail-sections'
import type { AgentBackend } from '@shared/agent-session'
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
import { REASON_NO_FOCUS, REASON_NO_FOCUS_SELECTED, REASON_NO_SELECTION, REASON_NOT_TERMINAL, REASON_NOT_TERMINAL_MARKS, REASON_TIDY_NEEDS_TWO, REASON_NOT_TERMINAL_OUTPUT, REASON_NOTHING_TO_EXPORT, REASON_NO_GITHUB, REASON_ALREADY_ACTIVE, REASON_MERGED_READ_ONLY } from './commands/reasons'
import { withReason, hiddenAtRestIf } from './commands/with-reason'
import { creationCommands } from './commands/creation-rows'
import { buildCredentialRows } from './commands/credential-rows'
import { buildEnvironmentRows } from './commands/environment-rows'
import { isHosted } from '@renderer/hosted'
import { hostedWords } from '@shared/hosted-keys'

// --- The commands/ directory ------------------------------------------------
// M278 split commands.ts by moving out everything that is DECLARATION rather
// than row-building: the plain-data row types, the refusal sentences, and the
// three row builders that never read PaletteContext. `buildCommands` and
// `PaletteActions` stay here because three verify checks read THIS FILE as
// text — `closure.1` slices the interface out of it, and `closure.v9.1`,
// `fit-task.doors.1` and `swarm.rows.1` grep it for literal `id: '…'` rows.
// M620 moved four row SECTIONS (panels, new panel, canvas, manage) into
// commands/*-rows.ts, called in order from buildCommands; every row pin now
// reads commands.ts plus commands/ through scripts/lib/palette-src.cjs, so a
// row may live in either. PaletteActions still stays here for closure.1.
// Re-exported so every existing importer of `palette/commands` is unchanged.
export type { PresetRow, PromptRow, PanelRow } from './commands/row-types'
export type { ApprovalRow } from './commands/approval-row'
export type { PaletteContext } from './commands/context'
export * from './commands/reasons'
export { buildCredentialRows }
export { creationCommands }
export { buildEnvironmentRows }
export { REASON_NO_ENV_REPORT } from './commands/environment-rows'
import { panelRows } from './commands/panel-rows'
import { newPanelRows } from './commands/new-panel-rows'
import { canvasRows } from './commands/canvas-rows'
import { manageRows } from './commands/manage-rows'

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
  /** M454, R-080. Open the World on this panel, or say so when none is selected. The body is `worldViewPaletteRow`. */
  viewInWorld(panelId?: string): void
  insertPrompt(id: string): void
  /** M76. Answer a chat's pending permission request from anywhere. M98: `scope: 'session'` also grants the tool. */
  answerApproval(id: string, requestId: string, allow: boolean, scope?: 'session'): void
  /** M379. One person's answer to a teammate's agent's ask: allow ONCE, or deny. Never a grant. */
  answerTeamAsk(workspaceId: string, askId: string, allow: boolean): void
  /** M583. One handoff or review press, as this person (team-flow/useTeamFlow's write). */
  teamFlow(req: FlowRequest): void
  beginSavePrompt(): void
  deletePrompt(id: string): void
  beginRenamePanel(id: string, currentTitle: string): void
  /** M405 (D2). Set a panel's title; the palette's rename and the rim's rename in place both commit here. */
  renamePanel(id: string, name: string): void
  resetCanvas(): void
  zoomToFit(): void
  /** M146. Cmd+0's INITIAL camera — the row that was called `Reset zoom` all along. */
  resetZoom(): void
  /**
   * M409 (C5). ⌘Z and ⌘⇧Z as palette rows: "undo" typed into ⌘K found 123
   * rows and no Undo. The same step the menu's edit:undo runs, without its
   * shouldIgnoreKeys guard — the palette is closing when a row runs, and
   * that guard exists for a chord pressed BEHIND an open overlay.
   */
  undoCanvas(): void
  redoCanvas(): void
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
  /**
   * M509 (backlog #55). Run a typed command in a new, focused panel — the
   * spawn sheet's one-off task without the sheet (command-panel.ts). The
   * palette's `>` row is its only door: EXCLUDED_ACTIONS says why.
   */
  runCommandPanel(command: string): void
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
  beginSpawnSheet(templateId?: string, into?: { intoNewWorkspace: true }, seed?: { cwd?: string; what?: string }): void
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
  setCenterView(view: 'canvas' | 'orchestration' | 'team' | 'learn'): void
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
  /** M535 (G5). `file-open <absolute path>`: the file panel a drop on the canvas opens. */
  openFilePath(path: string): { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }
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
  /** M480. Hand the board's open tasks to main for the night (`op` absent), or end tonight's batch (`stop`). */
  runTonight(op?: string): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  /** M548. Start a tournament on a task (its id, key or card), `stop` the live one, or `pick` an entrant (absent is the scorer's winner). */
  runTournament(op: string, value?: string): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  /** M606. Ask which agents race (`claude:opus codex`), then start the tournament on that task (a card id, item id or key). */
  beginTournamentField(name: string): void
  /** M543. Hand a work card's task to a cloud agent (`copilot`, `claude-action`); main asks before anything is sent. */
  sendToCloud(panelId: string, provider: string): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
  /** M544. Merge the card's ready cloud lane through the broker; main re-checks it and asks first. */
  mergeCloud(panelId: string): Promise<{ kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }>
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
  /** M409. `verb` opens the line prefilled with it, its grammar on the label. */
  beginRunVerb(verb?: string): void
  /** M97. Start a bounded auto run on a chat; refused by name when one is live. */
  /** M553. `sandboxed` runs it in a VM with prompts off (lane J); main refuses it by name while the setting is off. */
  startAuto(id: string, mode: AutoModeId, task?: string, opts?: { sandboxed?: boolean }): void
  stopAuto(id: string): void
  /** M100. Open the navigator on the Teammates pane. */
  openTeammates(): void
  /** The UX pass. Run one routine now, the same door the pane's Run now is. */
  runRoutine(id: string): void
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
const INSERT_TERMS = 'insert prompt paste'

export function buildCommands(ctx: PaletteContext): Command[] {
  const { actions } = ctx
  const out: Command[] = []
  // M409 (C5). The verb-line rows. Their subtitles WERE the grammar
  // ("deck-edit <panel> <slide> <markdown>"), nine rows of CLI syntax in the
  // resting list of a palette whose ⌘K was the first thing a person opened.
  // They now say what they do in words, rest behind "Run a verb…" (hidden at
  // rest, found by search), and open the verb line PREFILLED with their verb,
  // its grammar on the line's own label where the syntax is being typed.
  // Each keeps its literal `id: '…'`: `closure.v9.1` reads this file as text
  // for the palette door of every verb (load-bearing, M275).
  out.push({ id: 'checklist.edit', title: 'Checklist: edit an item…', subtitle: 'add, tick, delete or move a line, undo or redo', group: 'canvas', searchText: 'checklist task add toggle check reorder delete undo redo', hiddenAtRest: true, run: () => actions.beginRunVerb('checklist-edit') })
  out.push({ id: 'deck.edit', title: 'Deck: edit a slide…', subtitle: 'replace one slide with Markdown', group: 'canvas', searchText: 'deck slides slide edit markdown presentation', hiddenAtRest: true, run: () => actions.beginRunVerb('deck-edit') })
  out.push({ id: 'deck.write', title: 'Deck: replace the whole deck…', subtitle: 'the whole file, as Markdown', group: 'canvas', searchText: 'deck slides write replace markdown presentation', hiddenAtRest: true, run: () => actions.beginRunVerb('deck-write') })
  out.push({ id: 'deck.review', title: 'Deck: keep or discard proposed slides…', subtitle: 'an agent\'s proposed slides, one by one or all', group: 'canvas', searchText: 'deck slides review keep discard proposal draft', hiddenAtRest: true, run: () => actions.beginRunVerb('deck-review') })
  out.push({ id: 'deck.present', title: 'Deck: present…', subtitle: 'full-window slides', group: 'canvas', searchText: 'deck slides present presentation full screen', hiddenAtRest: true, run: () => actions.beginRunVerb('deck-present') })
  out.push({ id: 'deck.export-pdf', title: 'Deck: export to PDF…', subtitle: 'one page per slide, through a save dialog', group: 'canvas', searchText: 'deck slides export pdf print', hiddenAtRest: true, run: () => actions.beginRunVerb('deck-export-pdf') })
  out.push({ id: 'checklist.hand', title: 'Checklist: hand an item to an agent…', subtitle: 'send one line to an idle conversation', group: 'canvas', searchText: 'checklist hand task agent teammate send', hiddenAtRest: true, run: () => actions.beginRunVerb('checklist-hand') })
  out.push({ id: 'canvas.agent-links', title: 'Agent links: show or hide', subtitle: 'the lines from each agent to what it read, wrote or drafted', group: 'canvas', searchText: 'agent links edges lines files touched read wrote draft show hide toggle', run: () => { void actions.setAgentLinks('toggle') } })
  out.push({ id: 'sheet.review', title: 'Sheet: keep or discard draft cells…', subtitle: 'an agent\'s draft cells, a range or all', group: 'canvas', searchText: 'sheet draft review keep discard accept reject agent proposal', hiddenAtRest: true, run: () => actions.beginRunVerb('sheet-review') })
  out.push({ id: 'sheet.edit', title: 'Sheet: set a cell…', subtitle: 'a value or a formula', group: 'canvas', searchText: 'sheet spreadsheet csv xlsx cell edit formula set', hiddenAtRest: true, run: () => actions.beginRunVerb('sheet-edit') })

  // --- Panels (commands/panel-rows.ts) ---
  out.push(...panelRows(ctx))

  // --- New panel (commands/new-panel-rows.ts) ---
  out.push(...newPanelRows(ctx))

  // --- Prompts -------------------------------------------------------------

  for (const prompt of ctx.prompts) {
    // The source is on the ROW, and same-named prompts are never merged:
    // pasting the wrong project's context into an agent is silent and costly.
    const subtitle = prompt.source === 'project' ? 'project — .claude/commands' : 'saved'
    out.push(
      withReason(
        {
          id: `prompt.insert.${prompt.id}`,
          ...hiddenAtRestIf(ctx.capturedId === null),
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
        id: 'prompt.save', ...hiddenAtRestIf(ctx.capturedId === null),
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
          // M409. The one you are in is not a place to go.
          ...hiddenAtRestIf(w.active),
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

  // --- Canvas (commands/canvas-rows.ts) ---
  out.push(...canvasRows(ctx))

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
      id: 'panel.tidy', ...hiddenAtRestIf(ctx.panels.length < 2),
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
      id: 'panel.export-text', ...hiddenAtRestIf(ctx.panels.length === 0),
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
        // M404. The row names a value in the product's words (Notes, not
        // `vault`); the cycle still writes the stored key.
        title: `${setting.label}: ${settingDef(setting.id)?.valueLabels?.[current] ?? current}`,
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
      { id: 'camera.back', ...hiddenAtRestIf(!trail.back), title: 'Camera: back', subtitle: '⌘[ — where the camera was before the last jump', searchText: 'camera back previous view undo', group: 'bookmark', run: () => actions.cameraBack() },
      trail.back ? undefined : 'nothing to go back to'
    ),
    withReason(
      { id: 'camera.forward', ...hiddenAtRestIf(!trail.forward), title: 'Camera: forward', subtitle: '⌘] — the jump that was undone', searchText: 'camera forward redo view', group: 'bookmark', run: () => actions.cameraForward() },
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

  // --- Manage (commands/manage-rows.ts) ---
  out.push(...manageRows(ctx))

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
        id: `panel.auto.${modeId}`, ...hiddenAtRestIf(need !== undefined),
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
    // M553 (lane J). ONE more row, and only while Sandboxed lanes is on: the
    // custom mode in a VM with prompts off. Absent otherwise — not disabled —
    // so the auto rows a person sees by default are the four they always were.
    if (ctx.settings.some((s) => s.id === 'vm.lanes' && s.value === true)) {
      out.push(withReason({
        id: 'panel.auto.sandboxed', ...hiddenAtRestIf(need !== undefined),
        title: `Auto, sandboxed: ${AUTO_MODES.custom.label}`,
        subtitle: 'in a throwaway VM with prompts off — only this chat\'s folder is shared, the network is an allowlist',
        group: 'canvas',
        searchText: 'auto sandboxed sandbox vm container prompts off yolo isolated custom',
        run: () => actions.startAuto(ctx.capturedId!, 'custom', undefined, { sandboxed: true })
      }, need ?? (live ? `an auto run is already running here (${target!.auto!.mode}) — stop it first` : undefined)))
    }
    out.push(withReason({
      id: 'panel.auto.stop', ...hiddenAtRestIf(need !== undefined),
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
    title: 'Manage agent profiles…',
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

  // M509 (backlog #55). `> npm test`: the one row a command query shows
  // (filterCommands keeps only it). Run in a new panel — command-panel.ts.
  if (ctx.commandQuery !== undefined && ctx.commandQuery !== null) {
    const typed = ctx.commandQuery
    const row: Command = {
      id: COMMAND_ROW_ID,
      title: typed === '' ? 'Run a command' : `Run ${typed}`,
      subtitle: 'in a new panel, in the folder of the terminal you were last in; it shows the exit code',
      group: 'spawn',
      mono: true,
      hiddenAtRest: true,
      run: () => actions.runCommandPanel(typed)
    }
    out.push(typed === '' ? withReason(row, REASON_NO_COMMAND) : row)
  }

  // M399 (A10). SAY THE DIFFERENCE. With a panel selected (the HUD reads "1
  // selected") and none clicked into, every focus-gated row said "click into
  // a panel first", which reads as a lie beside the selection. Selection and
  // focus stay two things — these rows act on the panel the keyboard is in,
  // and letting a selection stand in for it changed the subject of ~40 rows at
  // once (measured: a renderer crash in verify:panels:product) — so the
  // sentence names the difference instead.
  const said = ctx.capturedId === null && ctx.selectedIds.length > 0
    ? out.map((row) => (row.disabledReason === REASON_NO_FOCUS ? { ...row, disabledReason: REASON_NO_FOCUS_SELECTED } : row))
    : out
  return isHosted() ? forATab(said) : said
}

/**
 * M610. In a browser tab served by `tc host` the Finder is the server's — a
 * Reveal row would open a window nobody in front of this tab can see — and
 * "the Mac" a subtitle names is the host.
 */
function forATab(rows: Command[]): Command[] {
  return rows
    .filter((row) => !row.id.startsWith('worktree.reveal.'))
    .map((row) => (row.subtitle === undefined ? row : { ...row, subtitle: hostedWords(row.subtitle) }))
}
