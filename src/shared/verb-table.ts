import type { AgentKind } from './cost'

/**
 * M96. THE CLOSED VERB TABLE.
 *
 * Everything a plan may do to the canvas, as DATA: each verb names its
 * arguments, whether it is destructive, and how it reaches the app. It is a
 * table rather than a set of judgements made at call sites because three
 * later milestones ask it the same question and must not each answer it
 * their own way — M97's Auto modes, M101's routines (a routine may not carry
 * a destructive verb, refused at save time) and M102's spend card all read
 * `destructive` from here.
 *
 * `actions` is the closure rule's half: every verb names the `PaletteActions`
 * members it runs through, and `EXCLUDED_ACTIONS` names every member no verb
 * may reach, with the reason. `verify:verbs closure.1` reads the interface
 * as text and fails the build for a member on neither list — so a verb a
 * later milestone appends cannot become reachable silently, and cannot be
 * forgotten silently either.
 *
 * Pure: no DOM, no node. The executor (the renderer's `beginRunVerb`) is
 * the only thing that knows what a verb DOES; this table only knows what it
 * IS.
 */

export type VerbArgKind = 'panel' | 'text' | 'preset' | 'setting' | 'value' | 'key'

export interface VerbArg {
  name: string
  kind: VerbArgKind
  /** Absent means required. */
  optional?: true
  /** A `text` argument takes the rest of the typed line, spaces included. */
  rest?: true
}

export interface VerbDef {
  id: string
  label: string
  args: readonly VerbArg[]
  /** Present and true means the runtime owes a confirmation step before it runs. */
  destructive: boolean
  /** The `PaletteActions` members this verb runs through; empty when it reaches the app another way. */
  actions: readonly string[]
  /** What it acts on — the plan reports in these words. */
  target: 'canvas' | 'panel' | 'agent' | 'setting'
  /** One line, shown as the row's hint and in the plan's preview. */
  hint: string
}

const panel = (name = 'panel'): VerbArg => ({ name, kind: 'panel' })

export const VERBS: readonly VerbDef[] = [
  { id: 'focus', label: 'Focus', args: [panel()], destructive: false, actions: ['goToPanel'], target: 'panel', hint: 'go to a panel without waking it' },
  { id: 'start', label: 'Start', args: [panel()], destructive: false, actions: ['startPanel'], target: 'panel', hint: 'wake a dormant panel' },
  { id: 'spawn', label: 'Spawn', args: [{ name: 'preset', kind: 'preset' }], destructive: false, actions: ['spawnPreset'], target: 'canvas', hint: 'a new panel from a preset' },
  // Guardrail 3 and 4: `type` never carries a control byte and never lands in
  // a plain shell — the plan builder refuses both, by name.
  { id: 'type', label: 'Type', args: [panel(), { name: 'text', kind: 'text', rest: true }], destructive: false, actions: [], target: 'agent', hint: 'type into an agent — never a plain shell; Enter is `submit`' },
  { id: 'submit', label: 'Submit', args: [panel()], destructive: false, actions: [], target: 'agent', hint: 'press Enter in an agent terminal' },
  { id: 'send', label: 'Send', args: [panel(), { name: 'text', kind: 'text', rest: true }], destructive: false, actions: [], target: 'agent', hint: 'send a message to a chat' },
  { id: 'interrupt', label: 'Interrupt', args: [panel()], destructive: false, actions: [], target: 'agent', hint: 'interrupt the turn in flight' },
  { id: 'restart', label: 'Restart', args: [panel()], destructive: false, actions: ['restartPanel'], target: 'panel', hint: 'restart the panel\'s process in place' },
  // Guardrail 2: what `read` hands back has passed the outward gate.
  { id: 'read', label: 'Read', args: [panel()], destructive: false, actions: [], target: 'panel', hint: 'the panel\'s recent output — or a browser panel\'s page text — secrets redacted' },
  // Guardrail 1: the closed list of settings a plan may write.
  { id: 'set-setting', label: 'Set setting', args: [{ name: 'setting', kind: 'setting' }, { name: 'value', kind: 'value' }], destructive: false, actions: ['toggleSetting'], target: 'setting', hint: 'a cosmetic or attention setting — never a ceiling' },
  { id: 'lock', label: 'Lock', args: [panel()], destructive: false, actions: ['lockPanel'], target: 'panel', hint: 'keep the panel where it is' },
  { id: 'unlock', label: 'Unlock', args: [panel()], destructive: false, actions: ['unlockPanel'], target: 'panel', hint: 'let the panel move again' },
  { id: 'pin', label: 'Pin', args: [panel()], destructive: false, actions: ['pinPanel'], target: 'panel', hint: 'keep the panel live wherever the camera is' },
  { id: 'unpin', label: 'Unpin', args: [panel()], destructive: false, actions: ['unpinPanel'], target: 'panel', hint: 'let tiering decide again' },
  { id: 'maximise', label: 'Maximise', args: [panel()], destructive: false, actions: ['maximisePanel'], target: 'panel', hint: 'fill the window with the panel' },
  { id: 'restore', label: 'Restore', args: [panel()], destructive: false, actions: ['restorePanel'], target: 'panel', hint: 'put a maximised panel back' },
  { id: 'tidy', label: 'Tidy', args: [], destructive: false, actions: ['tidyPanels'], target: 'canvas', hint: 'compact without reordering — one undo' },
  { id: 'zoom-fit', label: 'Zoom to fit', args: [], destructive: false, actions: ['zoomToFit'], target: 'canvas', hint: 'the selected panels, or every panel, in view' },
  { id: 'workspace-from-template', label: 'New workspace from template', args: [{ name: 'template', kind: 'key' }], destructive: false, actions: ['workspaceFromTemplate'], target: 'canvas', hint: 'a fresh workspace holding the shape' },
  { id: 'zoom-reset', label: 'Reset zoom', args: [], destructive: false, actions: ['resetZoom'], target: 'canvas', hint: 'the initial camera' },
  { id: 'workspace', label: 'Switch workspace', args: [{ name: 'workspace', kind: 'key' }], destructive: false, actions: ['switchWorkspace'], target: 'canvas', hint: 'switch to a workspace by id' },
  { id: 'review', label: 'Review', args: [panel()], destructive: false, actions: ['openReview'], target: 'panel', hint: 'open a review node for the panel' },
  { id: 'run-template', label: 'Run template', args: [{ name: 'template', kind: 'key' }], destructive: false, actions: ['beginSpawnSheet'], target: 'canvas', hint: 'open the spawn sheet on a template; its parameters are asked there' },
  // Guardrail 5: the destructive five. `close` is the dispose — there is no
  // separate `kill`, because a process's lifetime is its panel's (the two
  // lifetimes rule) and `pty.kill` keeps exactly two callers by design.
  { id: 'close', label: 'Close', args: [panel()], destructive: true, actions: ['closePanel'], target: 'panel', hint: 'close the panel and end its process' },
  { id: 'reset-canvas', label: 'Reset canvas', args: [], destructive: true, actions: ['resetCanvas'], target: 'canvas', hint: 'close every panel on this canvas' },
  { id: 'discard', label: 'Discard changes', args: [panel()], destructive: true, actions: [], target: 'panel', hint: 'discard every change a review node lists' },
  { id: 'remove-worktree', label: 'Remove worktree', args: [{ name: 'worktree', kind: 'key' }], destructive: true, actions: ['beginRemoveWorktree'], target: 'canvas', hint: 'remove a worktree this app created' },
  // M113/M114. The board's two verbs. `dispatch` is NOT destructive: it spends
  // nothing itself — the lane is a worktree, the chat is the teammate's, and
  // the one outward write (Open PR) asks its own spend card and is excluded
  // below by name.
  { id: 'dispatch', label: 'Dispatch', args: [{ name: 'item', kind: 'key' }, { name: 'teammate', kind: 'key' }], destructive: false, actions: ['dispatchWorkItem'], target: 'canvas', hint: 'hand a work item to a teammate in a fresh worktree lane' },
  { id: 'board', label: 'Board', args: [{ name: 'op', kind: 'key' }, { name: 'what', kind: 'text', rest: true }], destructive: false, actions: ['addWorkItem', 'markDone'], target: 'canvas', hint: 'board add <title> · board done <id>' }
]

/**
 * Every `PaletteActions` member no verb reaches, and why. A member here is
 * a decision, not an omission: `closure.1` fails for a member on neither
 * list, so adding an action means choosing.
 */
export const EXCLUDED_ACTIONS: Readonly<Record<string, string>> = {
  // M149. A sentence on the palette's feedback line, for a refusal that a
  // keystroke (a paste) has no other place to say — nothing runs, so no plan
  // may name it.
  say: 'a sentence on the feedback line — nothing runs',
  // M123. The update notice: one GET of a public feed, but a GET a plan could
  // fire is a beacon on a schedule; the setting that automates it is not
  // planWritable for the same reason.
  checkForUpdates: 'a network call the user makes by hand — never a plan',
  // M113/M115. The board's excluded three.
  beginNewWorkItem: 'opens the palette\'s text mode — a plan has no typist',
  openBoard: 'opens a navigator pane — a view, not an action on the canvas',
  // M127/M128. STAYS excluded now that it mints a real panel, and the
  // original reason is why: the verb takes a WORLD POINT, which is the
  // drop's own cursor position, and a plan has no cursor. Giving it a verb
  // would mean inventing a placement rule inside `buildPlan` — a second
  // author of where panels land, beside `cascadeCentre`.
  openSkillPanel: 'a drop\'s door — it takes a world point, and a plan has no cursor',
  scrollChatTurn: 'a flight inside a chat — the search row\'s own door, not an action on the canvas',
  newSandboxChat: 'a chat with no folder is the user\'s door — a plan works in a place, where its reads and writes can be judged',
  openPr: 'a broker write asks its own spend card — a plan has no teammate to answer it',
  commentPr: 'a broker write asks its own spend card — a plan has no teammate to answer it',
  beginRenamePreset: 'opens the palette\'s text mode — a plan has no typist',
  deletePreset: 'preset administration is the user\'s, not a plan\'s',
  setDefaultPreset: 'preset administration is the user\'s, not a plan\'s',
  insertPrompt: 'a prompt is inserted into a composer by the user; a plan uses `send`',
  answerApproval: 'M98\'s door — a plan may never answer a permission question for the user',
  openWorkflow: 'opens a VIEW of a template — a plan runs a shape with `spawn` or the sheet, it does not open a diagram of one',
  beginSavePrompt: 'opens the palette\'s text mode',
  deletePrompt: 'prompt administration is the user\'s',
  beginRenamePanel: 'opens the palette\'s text mode',
  beginEditSetting: 'opens the palette\'s number mode; `set-setting` is the plan\'s door',
  beginEditTextSetting: 'opens the palette\'s text mode; the vault root is not plan-writable',
  beginChooseVault: 'the vault root is not plan-writable',
  beginCreateWorkspace: 'opens the palette\'s text mode',
  beginRenameWorkspace: 'opens the palette\'s text mode',
  deleteWorkspace: 'deletes every panel in a workspace at once — beyond any single verb\'s confirmation',
  savePanelAsPreset: 'preset administration is the user\'s',
  beginAnnotate: 'enters a pointer mode — a plan has no pointer',
  setPanelFontSize: 'typography is the user\'s eyes, not a plan\'s',
  jumpPrompt: 'navigates the terminal\'s own scrollback marks — a view gesture',
  copyLastOutput: 'writes the clipboard, which is the user\'s; `read` is the plan\'s door',
  restartPanelWithMode: 'changes a permission mode — a permission boundary a plan may not move',
  openToolbox: 'a view of a directory\'s toolbox — opened by the user',
  movePanelsToWorkspace: 'moves panels between workspaces — a layout the user owns',
  beginMovePanelsToNewWorkspace: 'opens the palette\'s text mode',
  beginCreateGroup: 'opens the palette\'s text mode',
  openMemory: 'a memory panel is opened by the user; memory is written through `tc memory add`',
  openGithub: 'a work panel is opened by the user',
  reviewAcross: 'a review across worktrees is opened by the user; `review` is the plan\'s door',
  beginWatcher: 'opens the palette\'s text mode',
  beginSaveTemplate: 'opens the palette\'s text mode',
  toggleGroup: 'cards a group — a presentation gesture',
  removeGroup: 'group administration is the user\'s',
  toggleBroadcastInput: 'broadcast types into EVERY selected terminal — the opposite of guardrail 4',
  toggleMerged: 'a read-only view the user enters',
  beginLink: 'enters a pointer mode',
  removeLink: 'edge administration is the user\'s (M78)',
  beginRelabelLink: 'opens the palette\'s text mode',
  beginSetCredential: 'a credential is pasted by the user, never by a plan',
  verifyCredential: 'sends a token to a service — the user\'s decision',
  beginDeleteCredential: 'credential administration is the user\'s',
  setPresetWorktree: 'preset administration is the user\'s',
  revealWorktree: 'opens Finder — leaves the app',
  beginClearScrollback: 'clears every durable log at once — beyond any single verb\'s confirmation',
  openFile: 'opens the OS file dialog — a plan has no pointer',
  newNote: 'opens the palette\'s text mode',
  newChat: 'a chat is minted through the spawn sheet; `spawn` is the plan\'s door',
  openAsChat: 'moves a conversation between front-ends — the user\'s decision (M74)',
  openInTerminal: 'moves a conversation between front-ends — the user\'s decision (M74)',
  openJira: 'a work panel is opened by the user',
  beginRunVerb: 'the verb line itself — a plan that ran plans would be a loop with no ceiling',
  startAuto: 'M97\'s door: an auto run is started by the user, never by a plan (a plan that starts runs has no turn limit of its own)',
  stopAuto: 'M97\'s door, the stop half',
  openTeammates: 'opens a navigator pane — a view',
  beginBrowser: 'opens the palette\'s text mode',
  toggleFlip: 'a view state — nothing a plan should turn over'
}

export function verbById(id: string): VerbDef | undefined {
  return VERBS.find((v) => v.id === id)
}

/**
 * Guardrail 3. Every C0 byte and DEL removed — CR and LF included, because
 * Enter is `submit`, its own confirmable verb. A plan that could type `\r`
 * into a shell could run anything.
 */
export function stripControl(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\x00-\x1f\x7f]/g, '')
}

/**
 * Guardrail 4. Whether a panel may be typed into: the KIND decides, through
 * the agent kinds `AGENT_CAPABILITIES` is keyed on — a terminal running a
 * known agent CLI, or a chat. Never a string check on the command.
 */
export function acceptsTyping(panel: { kind: string; agent?: AgentKind }): boolean {
  if (panel.kind === 'chat') return true
  return panel.kind === 'terminal' && panel.agent !== undefined
}
