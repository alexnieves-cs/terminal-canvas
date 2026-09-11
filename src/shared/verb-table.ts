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

export type CreationResult = { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }
export interface CreationHost {
  terminal(): Promise<CreationResult>
  agent(): Promise<CreationResult>
  /** M245: a discriminator rather than M244's boolean, now that a document can be a note, a checklist or a sheet; M248's deck joins by adding a word. */
  document(view: 'note' | 'checklist' | 'sheet' | 'deck', name?: string): Promise<CreationResult>
  image(path?: string): Promise<CreationResult>
  workflow(): Promise<CreationResult>
  browser(url?: string): Promise<CreationResult>
}
export interface CreationAvailability { merged?: boolean; noteRoot: string | null; agentReason?: string }
const creation = (id: string, label: string, icon: string, create: (host: CreationHost, value?: string) => Promise<CreationResult>, requires: 'none' | 'folder' | 'agent' = 'none') => ({
  id, label, icon, create, requires, verb: `create-${id}`, palette: `object.create.${id}`,
  doors: { canvas: `New object row: ${label}`, palette: `object.create.${id}`, agent: `tc plan create-${id}`, workflow: `an action node whose line is: create-${id}` }
})

/** M244. The only creatable-kind list. New doors are derived here, beside V9_DOORS. */
export const CREATABLE_OBJECTS = [
  creation('terminal', 'Terminal', 'terminal', (h) => h.terminal()),
  creation('agent', 'Agent', 'agent', (h) => h.agent(), 'agent'),
  creation('note', 'Note', 'note', (h, value) => h.document('note', value), 'folder'),
  creation('image', 'Image', 'image', (h, value) => h.image(value)),
  creation('workflow', 'Workflow', 'workflow', (h) => h.workflow()),
  creation('browser', 'Browser/Preview', 'browser', (h, value) => h.browser(value)),
  creation('checklist', 'Checklist', 'checklist', (h, value) => h.document('checklist', value), 'folder'),
  creation('sheet', 'Sheet', 'sheet', (h, value) => h.document('sheet', value), 'folder'),
  creation('deck', 'Deck', 'deck', (h, value) => h.document('deck', value), 'folder')
] as const

export function creationReason(entry: typeof CREATABLE_OBJECTS[number], context: CreationAvailability): string | undefined {
  if (context.merged) return 'leave merged view to create an object'
  if (entry.requires === 'folder' && context.noteRoot === null) return 'select a panel with a workspace folder first'
  if (entry.requires === 'agent') return context.agentReason
  return undefined
}

export const VERBS: readonly VerbDef[] = [
  // M248. The deck's verbs. Through the palette they are the person's and write;
  // through the agent door or a workflow action node, edit/write STAGE a
  // proposal and review may only discard (usePaletteActions passes the origin).
  { id: 'deck-edit', label: 'Deck: edit a slide', args: [panel(), { name: 'slide', kind: 'value' }, { name: 'value', kind: 'text', rest: true }], destructive: false, actions: ['editDeck'], target: 'panel', hint: 'replace one slide (one-based) with Markdown; \\n is a new line; an agent or workflow proposes rather than writes' },
  { id: 'deck-write', label: 'Deck: replace the deck', args: [panel(), { name: 'value', kind: 'text', rest: true }], destructive: false, actions: ['writeDeck'], target: 'panel', hint: 'the whole Markdown file; \\n is a new line; an agent or workflow proposes rather than writes' },
  { id: 'deck-review', label: 'Deck: keep or discard proposed slides', args: [panel(), { name: 'action', kind: 'value' }, { name: 'slides', kind: 'text', rest: true }], destructive: false, actions: ['reviewDeck'], target: 'panel', hint: 'keep|discard, then slide numbers (r3 for a removed slide) or all; keep is a person\'s' },
  { id: 'deck-present', label: 'Deck: present', args: [panel()], destructive: false, actions: ['presentDeck'], target: 'panel', hint: 'full-window slides; arrows, Space, PageUp/PageDown, Escape; n toggles notes' },
  { id: 'deck-export-pdf', label: 'Deck: export to PDF', args: [panel()], destructive: false, actions: ['exportDeckPdf'], target: 'panel', hint: 'one 16:9 page per slide, through a save dialog; notes are left out' },
  { id: 'checklist-edit', label: 'Checklist: edit item', args: [panel(), { name: 'operation', kind: 'value' }, { name: 'value', kind: 'text', optional: true, rest: true }], destructive: false, actions: ['editChecklist'], target: 'panel', hint: 'add text, toggle/delete a zero-based line, move line to-line, undo or redo' },
  { id: 'checklist-hand', label: 'Checklist: hand to agent', args: [panel(), { name: 'line', kind: 'value' }, panel('agent')], destructive: false, actions: ['handChecklist'], target: 'panel', hint: 'send a task line to an idle conversation, through the ordinary send gate' },
  // M245. "Edit sheet X": one cell, through the sheet's own guarded write. An empty value clears the cell.
  { id: 'sheet-edit', label: 'Sheet: set a cell', args: [panel(), { name: 'cell', kind: 'value' }, { name: 'value', kind: 'text', optional: true, rest: true }], destructive: false, actions: ['editSheet'], target: 'panel', hint: 'set a cell like B2 to a value or =formula; empty clears it — from an agent it proposes a draft' },
  // M246. Resolve draft cells. Keeping is a person's: the agent door is refused by name.
  // M247. The agent → object links, shown or hidden. A canvas-wide view fact, stored as a setting.
  { id: 'agent-links', label: 'Agent links: show or hide', args: [{ name: 'state', kind: 'value' }], destructive: false, actions: ['setAgentLinks'], target: 'canvas', hint: 'on, off or toggle the lines from each agent to what it read, wrote or drafted' },
  { id: 'sheet-review', label: 'Sheet: keep or discard draft cells', args: [panel(), { name: 'operation', kind: 'value' }, { name: 'target', kind: 'text', optional: true, rest: true }], destructive: false, actions: ['reviewSheet'], target: 'panel', hint: 'keep or discard a cell, a range like B2:C4, or all of a pending draft' },
  ...CREATABLE_OBJECTS.map((entry): VerbDef => ({ id: entry.verb, label: `New ${entry.label}`, args: [{ name: 'value', kind: 'text', optional: true, rest: true }], destructive: false, actions: ['createObject'], target: 'canvas', hint: `create ${entry.label.toLowerCase()} at the viewport centre` })),
  { id: 'check-readiness', label: 'Check engine readiness', args: [], destructive: false, actions: ['checkReadiness'], target: 'canvas', hint: 'ask discovery again; installation is not sign-in' },
  // M182. The template editor's operations as verbs — the same six functions the diagram's drag calls.
  { id: 'workflow-add', label: 'Workflow: add node', args: [{ name: 'template', kind: 'key' }, { name: 'kind', kind: 'value' }], destructive: false, actions: ['editWorkflow'], target: 'canvas', hint: 'add a terminal, chat, pool, orchestrator or collect node to the draft' },
  { id: 'workflow-move', label: 'Workflow: move node', args: [{ name: 'template', kind: 'key' }, { name: 'key', kind: 'value' }, { name: 'dx', kind: 'value' }, { name: 'dy', kind: 'value' }], destructive: false, actions: ['editWorkflow'], target: 'canvas', hint: 'place a node at an authored offset' },
  { id: 'workflow-set', label: 'Workflow: set field', args: [{ name: 'template', kind: 'key' }, { name: 'key', kind: 'value' }, { name: 'field', kind: 'value' }, { name: 'value', kind: 'text', rest: true }], destructive: false, actions: ['editWorkflow'], target: 'canvas', hint: 'set one of the node kind\'s own fields' },
  { id: 'workflow-remove', label: 'Workflow: remove node', args: [{ name: 'template', kind: 'key' }, { name: 'key', kind: 'value' }], destructive: false, actions: ['editWorkflow'], target: 'canvas', hint: 'remove a node and its edges from the draft' },
  { id: 'workflow-edge', label: 'Workflow: connect', args: [{ name: 'template', kind: 'key' }, { name: 'from', kind: 'value' }, { name: 'to', kind: 'value' }, { name: 'trigger', kind: 'value' }], destructive: false, actions: ['editWorkflow'], target: 'canvas', hint: 'an edge between two nodes; a cycle is refused' },
  { id: 'workflow-unedge', label: 'Workflow: disconnect', args: [{ name: 'template', kind: 'key' }, { name: 'from', kind: 'value' }, { name: 'to', kind: 'value' }], destructive: false, actions: ['editWorkflow'], target: 'canvas', hint: 'remove an edge from the draft' },
  { id: 'workflow-save', label: 'Workflow: save', args: [{ name: 'template', kind: 'key' }], destructive: false, actions: ['saveWorkflow'], target: 'canvas', hint: 'write the draft back to the record; a record saved by someone else is refused as stale' },
  // M190. A feedback draft. `says` is optional: with nothing typed the draft
  // opens with a line asking what happened, which is the ordinary way a person
  // reaches it from the palette.
  { id: 'feedback', label: 'Feedback: prepare a draft', args: [{ name: 'says', kind: 'text', optional: true }], destructive: false, actions: ['prepareFeedback'], target: 'canvas', hint: 'open a scrubbed issue draft in the browser; nothing is submitted' },
  // M189. The portable file. `pictures` is a VALUE a person types on purpose
  // (`with-pictures`), never a default: including pixels is a human review
  // choice and a flag that defaults to on would make it the machine's.
  // DESTRUCTIVE, and the reason is the PATH: a named path skips the save
  // dialog and writes it, so `export-canvas ~/.zshrc` would replace a file
  // nobody meant to lose. A destructive verb needs its confirmation at the
  // palette and is refused outright at the agent door (M190's critic, 3).
  { id: 'export-canvas', label: 'Canvas: export', args: [{ name: 'path', kind: 'text', optional: true }, { name: 'pictures', kind: 'value', optional: true }], destructive: true, actions: ['exportCanvas'], target: 'canvas', hint: 'write this canvas as one portable file; add with-pictures to include the pixels' },
  { id: 'import-canvas', label: 'Canvas: import', args: [{ name: 'path', kind: 'text', optional: true }], destructive: false, actions: ['importCanvas'], target: 'canvas', hint: 'read a portable file into a NEW workspace; nothing in it is started' },
  // M250. A .docx becomes a NEW note beside it, unreviewed until a person reads
  // it. Not destructive: the docx is only read and the note is created with
  // `wx`, so nothing is overwritten. The path takes the REST of the line — a
  // Word file's name has spaces far more often than not. Refused to teammates
  // (plan.ts): a teammate's plan does not choose which files this app reads.
  { id: 'import-docx', label: 'Note: import a Word document', args: [{ name: 'path', kind: 'text', optional: true, rest: true }], destructive: false, actions: ['importDocx'], target: 'canvas', hint: 'convert a .docx into a new Markdown note beside it; what was dropped is named, and the note waits to be read' },
  // M188. Test one node, by template and (optionally) key: with no key it is
  // the block the person has selected on the diagram.
  { id: 'node-test', label: 'Node: test', args: [{ name: 'template', kind: 'key' }, { name: 'node', kind: 'value', optional: true }], destructive: false, actions: ['testNode'], target: 'canvas', hint: 'run one block on its own — its neighbours are not started' },
  // M187. The note's three. `note-add` takes the FORM first because it is the
  // thing a person chooses; the text is optional (an empty note is a real
  // thing to make and type into).
  { id: 'note-add', label: 'Note: add', args: [{ name: 'form', kind: 'value' }, { name: 'text', kind: 'text', optional: true }], destructive: false, actions: ['addNote'], target: 'canvas', hint: 'a sticky note, free text, or a named region' },
  { id: 'note-set', label: 'Note: set the text', args: [{ name: 'panel', kind: 'panel' }, { name: 'text', kind: 'text' }], destructive: false, actions: ['setNoteText'], target: 'panel', hint: 'replace a note\'s words' },
  { id: 'note-tint', label: 'Note: set the tint', args: [{ name: 'panel', kind: 'panel' }, { name: 'tint', kind: 'value' }], destructive: false, actions: ['setNoteTint'], target: 'panel', hint: 'yellow, blue, green or pink — a sticky note only' },
  // M186. A picture in, and a picture repaired. Both take a path, and both go
  // through the store, so an agent's picture has the same identity a person's
  // dropped one has.
  { id: 'image-add', label: 'Image: add a picture', args: [{ name: 'path', kind: 'text' }], destructive: false, actions: ['addImage'], target: 'canvas', hint: 'take a PNG, JPEG, GIF or WebP into this canvas and place it' },
  { id: 'image-replace', label: 'Image: replace a picture', args: [{ name: 'panel', kind: 'panel' }, { name: 'path', kind: 'text' }], destructive: false, actions: ['replaceImage'], target: 'panel', hint: 'point an existing picture panel at different bytes — the repair for a missing one' },
  // M185. The preview's four. `preview-open` takes an OPTIONAL url: with one
  // it points the pane, without one it asks discovery — which reads and runs
  // nothing, so the verb that opens a page and the verb that starts a server
  // are two verbs a person (or an agent) chooses between by name.
  { id: 'preview-open', label: 'Preview: open the project', args: [{ name: 'url', kind: 'text', optional: true }], destructive: false, actions: ['openPreview'], target: 'canvas', hint: 'open the page a process of the selected panel is serving, or the url you name' },
  { id: 'preview-width', label: 'Preview: set the width', args: [{ name: 'device', kind: 'value' }], destructive: false, actions: ['setPreviewWidth'], target: 'canvas', hint: 'phone, tablet, laptop or full — the named widths, never a number' },
  { id: 'preview-capture', label: 'Preview: capture the page', args: [], destructive: false, actions: ['capturePreview'], target: 'canvas', hint: 'a real picture of the pane, written under this app\'s own directory and placed as an image' },
  // M195 (D03). The fifth preview verb: which WORK this pane is a preview of.
  // It takes NO argument on purpose. A path from an agent would be a folder
  // this app never resolved and never showed anybody, and the subject rule —
  // the panel discovery itself reads — is the one this whole feature is built
  // on, so the verb binds to that and refuses by name when there is none.
  { id: 'preview-bind', label: 'Preview: bind the source', args: [], destructive: false, actions: ['bindPreview'], target: 'canvas', hint: 'the selected panel\'s folder becomes the work this preview reloads for' },
  // M201/M202 (D07). Opening a review is a READ: it mints a panel and asks
  // git a question. It is deliberately NOT on TEAMMATE_REFUSED_VERBS — a
  // teammate pointing a person at what it changed is doing the right thing,
  // and nothing here starts a session or changes a setting. Marking a review
  // DONE has no verb at all, on purpose; see V9_DOORS below.
  // M203 (D08). Showing a task is a CAMERA move over a DERIVED set — no
  // geometry, no selection, no session — so it is not on
  // TEAMMATE_REFUSED_VERBS, for `focus`'s reason: a teammate pointing a
  // person at the work it belongs to is doing the right thing.
  { id: 'show-task', label: 'Task: show this task', args: [{ name: 'panel', kind: 'panel' }], destructive: false, actions: ['showTask'], target: 'panel', hint: 'frame a task — its card, conversation, lane, reviews and links — from the card or any panel of it; nothing moves' },
  // M204 (D08). The lens is PAINT and arrange is one undo: neither starts a
  // session or changes a setting, so neither is refused for a teammate —
  // `tidy`, which arrange is a scoped copy of, is not either.
  { id: 'show-related', label: 'Task: show related', args: [{ name: 'panel', kind: 'panel' }], destructive: false, actions: ['showRelated'], target: 'panel', hint: 'ring a task\'s panels and dim the rest — nothing moves; the same verb on the same task turns it off' },
  { id: 'arrange-task', label: 'Task: arrange this task', args: [{ name: 'panel', kind: 'panel' }], destructive: false, actions: ['arrangeTask'], target: 'panel', hint: 'compact a task\'s panels in reading order, clear of everything else — one undo; locked panels stay' },
  { id: 'review-task', label: 'Task: review the lane', args: [{ name: 'panel', kind: 'panel' }], destructive: false, actions: ['reviewTask'], target: 'panel', hint: 'open the review for a work card\'s lane, beside the task and its conversation' },
  { id: 'preview-dev', label: 'Preview: start the dev server', args: [{ name: 'script', kind: 'value', optional: true }], destructive: false, actions: ['startDevServer'], target: 'canvas', hint: 'run the project\'s dev script in a terminal panel you can see and stop' },
  { id: 'workflow-copy', label: 'Workflow: save a copy', args: [{ name: 'template', kind: 'key' }], destructive: false, actions: ['saveWorkflowCopy'], target: 'canvas', hint: 'keep the diagram under a new name — a built-in workflow\'s only save' },
  { id: 'workflow-run', label: 'Workflow: run', args: [{ name: 'template', kind: 'key' }], destructive: false, actions: ['runWorkflowNow'], target: 'canvas', hint: 'run the shape on the diagram — the draft when there is one' },
  { id: 'workflow-stop', label: 'Workflow: stop', args: [{ name: 'template', kind: 'key' }], destructive: false, actions: ['stopWorkflow'], target: 'canvas', hint: 'interrupt what this workflow started; nothing is killed' },
  { id: 'starter', label: 'Open the starter canvas', args: [], destructive: false, actions: ['openStarter'], target: 'canvas', hint: 'the agent and one captioned example of each kind; only what was never applied' },
  { id: 'new-chat', label: 'Start a conversation', args: [{ name: 'backend', kind: 'key', optional: true }], destructive: false, actions: ['newChat'], target: 'canvas', hint: 'open an available conversation engine; optionally claude or codex' },
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
  { id: 'dispatch', label: 'Dispatch', args: [{ name: 'item', kind: 'key' }, { name: 'teammate', kind: 'key' }], destructive: false, actions: ['dispatchWorkItem', 'startWork'], target: 'canvas', hint: 'hand a work item to a teammate in a fresh worktree lane' },
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
  // M197. The start flow's door opens a SHEET — three fields a person
  // answers. A plan has no typist, and the executor behind it (`startWork`)
  // is what the `dispatch` verb maps, so the agent reaches the same action
  // without a form: one action, two doors, and only one of them typed.
  beginStartWork: 'opens the start sheet — a plan has no typist; the `dispatch` verb runs the same action',
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
  openAsChat: 'moves a conversation between front-ends — the user\'s decision (M74)',
  openInTerminal: 'moves a conversation between front-ends — the user\'s decision (M74)',
  openJira: 'a work panel is opened by the user',
  runAgentPlan: 'agent transport for the same executor, not a recursively callable product verb',
  beginWorkflowEdit: 'the palette\'s text mode over the workflow-* verbs — a plan names the verb itself',
  updateBoundTemplate: 'the Save-selection text mode\'s submit over bound panels; an agent edits the record through the workflow-* verbs',
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

/** Act I exceptions have an owner and deadline; declarations never stand in for execution checks. */
/** A door is a STRING naming the gesture, or an OWED object with its reason and the milestone due — data a later check can retire, never a label. */
export type DoorEntry = string | { reason: string; due: string }
/**
 * M186 (M185's critic, finding 9). ONE constant for the milestone every v9
 * verb's workflow door is owed to, shared by the table and the check — a
 * regex over `M\d+` accepts a due that has already shipped, and a literal in
 * the check turns a truthful table red when the plan moves.
 */
export const WORKFLOW_EXECUTOR_DUE = 'M188'

/**
 * M188. THE WORKFLOW DOOR IS REAL NOW. Every row below carried
 * `{ reason, due: WORKFLOW_EXECUTOR_DUE }` from M180 to M187 — the debt as
 * data, which `closure.v9.1` read and required. M188's `action` node runs a
 * verb LINE through the same executor the palette and the agent door take, so
 * the door for each of these verbs is an action node holding its own line, and
 * the rows now name it. `node-test` keeps an owed door with a different
 * reason: a node that tests a node is a loop with no stop.
 */
export const V9_DOORS: Record<string, { canvas: DoorEntry; palette: string; agent: string; workflow: DoorEntry }> = {
  'deck-edit': { canvas: 'deck Edit, then Save', palette: 'deck.edit', agent: 'tc plan deck-edit f1 2 ## New title', workflow: 'an action node whose line is: deck-edit f1 2 ## New title' },
  'deck-write': { canvas: 'deck Edit, then Save', palette: 'deck.write', agent: 'tc plan deck-write f1 # Title', workflow: 'an action node whose line is: deck-write f1 # Title' },
  'deck-review': { canvas: 'deck Keep / Discard on a proposed slide, Keep all, Discard all', palette: 'deck.review', agent: 'tc plan deck-review f1 discard all', workflow: 'an action node whose line is: deck-review f1 discard all' },
  'deck-present': { canvas: 'deck Present', palette: 'deck.present', agent: 'tc plan deck-present f1', workflow: 'an action node whose line is: deck-present f1' },
  'deck-export-pdf': { canvas: 'deck PDF', palette: 'deck.export-pdf', agent: 'tc plan deck-export-pdf f1', workflow: 'an action node whose line is: deck-export-pdf f1' },
  'checklist-edit': { canvas: 'checklist Add, check, drag/Up/Down, Delete and Undo controls', palette: 'checklist.edit', agent: 'tc plan checklist-edit f1 add hello', workflow: 'an action node whose line is: checklist-edit f1 add hello' },
  'checklist-hand': { canvas: 'Hand to agent on a checklist item', palette: 'checklist.hand', agent: 'tc plan checklist-hand f1 2 ch1', workflow: 'an action node whose line is: checklist-hand f1 2 ch1' },
  'sheet-edit': { canvas: 'type into a sheet cell (double-click, Enter or start typing)', palette: 'sheet.edit', agent: 'tc plan sheet-edit f1 B2 =SUM(B1:B1)', workflow: 'an action node whose line is: sheet-edit f1 B2 =SUM(B1:B1)' },
  'agent-links': { canvas: 'the links button in the canvas HUD\'s zoom cluster', palette: 'canvas.agent-links', agent: 'tc plan agent-links off', workflow: 'an action node whose line is: agent-links off' },
  'sheet-review': { canvas: 'Keep / Discard selected, Keep all / Discard all on a sheet\'s draft strip', palette: 'sheet.review', agent: 'tc plan sheet-review f1 discard all', workflow: 'an action node whose line is: sheet-review f1 keep B2' },
  ...Object.fromEntries(CREATABLE_OBJECTS.map((entry) => [entry.verb, entry.doors])),
  'check-readiness': { canvas: 'launcher Check again', palette: 'onboarding.readiness', agent: 'tc plan check-readiness', workflow: 'an action node whose line is: check-readiness' },
  'new-chat': { canvas: 'launcher Start a conversation', palette: 'panel.new-chat', agent: 'tc plan new-chat', workflow: 'an action node whose line is: new-chat' },
  starter: { canvas: 'launcher Start a conversation on a first run; the Starter canvas… line', palette: 'starter.open', agent: 'tc plan starter', workflow: 'an action node whose line is: starter' },
  'workflow-add': { canvas: 'a drag from the library onto the diagram; the entry\'s Add control', palette: 'workflow.add', agent: 'tc plan workflow-add t1 terminal', workflow: 'an action node whose line is: workflow-add t1 terminal' },
  'workflow-move': { canvas: 'a drag on a diagram block', palette: 'workflow.move', agent: 'tc plan workflow-move t1 n1 0 0', workflow: 'an action node whose line is: workflow-move t1 n1 0 0' },
  'workflow-set': { canvas: 'the inspector\'s fields over the selected block', palette: 'workflow.set', agent: 'tc plan workflow-set t1 n1 title hello', workflow: 'an action node whose line is: workflow-set t1 n1 title hello' },
  'workflow-remove': { canvas: 'Delete on a selected diagram block', palette: 'workflow.remove', agent: 'tc plan workflow-remove t1 n1', workflow: 'an action node whose line is: workflow-remove t1 n1' },
  'workflow-edge': { canvas: 'a drag from a block\'s port onto another block', palette: 'workflow.edge', agent: 'tc plan workflow-edge t1 n1 n2 exit', workflow: 'an action node whose line is: workflow-edge t1 n1 n2 exit' },
  'workflow-save': { canvas: 'Save on the workflow panel', palette: 'workflow.save', agent: 'tc plan workflow-save t1', workflow: 'an action node whose line is: workflow-save t1' },
  // M190's critic (9). These three said "the Help menu's own line" and "the
  // launcher's own line" and neither existed — a canvas door asserted as a
  // SENTENCE where the palette and agent doors must actually bind. The Help
  // menu item and the launcher's import line are real now; export's canvas
  // gesture is OWED with its milestone, which is what the owed shape is for.
  feedback: { canvas: 'Help ▸ Prepare feedback… in the menu bar', palette: 'feedback.open', agent: 'tc plan feedback', workflow: 'an action node whose line is: feedback' },
  'export-canvas': { canvas: { reason: 'export needs a canvas with something on it, so the launcher (an empty canvas) is the wrong home for it and the frame has no room at rest', due: 'M191' }, palette: 'portable.export', agent: 'tc plan export-canvas', workflow: 'an action node whose line is: export-canvas' },
  'import-canvas': { canvas: 'the launcher\'s Import a canvas… line', palette: 'portable.import', agent: 'tc plan import-canvas', workflow: 'an action node whose line is: import-canvas' },
  'import-docx': { canvas: 'drop a .docx on the canvas', palette: 'note.import-docx', agent: 'tc plan import-docx /tmp/Plan.docx', workflow: 'an action node whose line is: import-docx /tmp/Plan.docx' },
  'node-test': { canvas: 'Test this node on the workflow panel\'s selected block', palette: 'node.test', agent: 'tc plan node-test t1 n1', workflow: { reason: 'a node that tests a node is a loop with no stop', due: WORKFLOW_EXECUTOR_DUE } },
  'note-add': { canvas: 'the three Add rows place one at the camera centre; a frame goes behind what it encloses', palette: 'note.add.sticky', agent: 'tc plan note-add sticky', workflow: 'an action node whose line is: note-add sticky' },
  'note-set': { canvas: "the note's own editor, committed on blur or Escape", palette: 'note.tint', agent: 'tc plan note-set nt1 hello', workflow: 'an action node whose line is: note-set nt1 hello' },
  'note-tint': { canvas: "the four tint chips on a sticky note's chrome", palette: 'note.tint', agent: 'tc plan note-tint nt1 blue', workflow: 'an action node whose line is: note-tint nt1 blue' },
  'image-add': { canvas: 'drop a picture on the canvas, or paste one with no agent to take it', palette: 'image.add', agent: 'tc plan image-add /tmp/shot.png', workflow: 'an action node whose line is: image-add /tmp/shot.png' },
  'image-replace': { canvas: 'Replace on a picture panel', palette: 'image.replace', agent: 'tc plan image-replace img1 /tmp/other.png', workflow: 'an action node whose line is: image-replace img1 /tmp/other.png' },
  'preview-open': { canvas: 'Find the project on the preview pane, and a candidate in its list', palette: 'preview.open', agent: 'tc plan preview-open', workflow: 'an action node whose line is: preview-open' },
  'preview-width': { canvas: 'the four width chips on the preview pane', palette: 'preview.width', agent: 'tc plan preview-width phone', workflow: 'an action node whose line is: preview-width phone' },
  'preview-capture': { canvas: 'Capture on the preview pane', palette: 'preview.capture', agent: 'tc plan preview-capture', workflow: 'an action node whose line is: preview-capture' },
  'preview-bind': { canvas: 'Bind source / Change source on the preview pane', palette: 'preview.bind', agent: 'tc plan preview-bind', workflow: 'an action node whose line is: preview-bind' },
  'show-task': { canvas: 'Show on a work card', palette: 'task.show', agent: 'tc plan show-task wk1', workflow: 'an action node whose line is: show-task wk1' },
  'show-related': { canvas: 'Show related in the ⋯ menu of any panel of a task, and Related in the command pill with one panel of a task selected', palette: 'task.related', agent: 'tc plan show-related wk1', workflow: 'an action node whose line is: show-related wk1' },
  'arrange-task': { canvas: 'Arrange this task in the ⋯ menu of any panel of a task, Arrange on the lens bar, and Arrange task in the command pill with one panel of a task selected', palette: 'task.arrange', agent: 'tc plan arrange-task wk1', workflow: 'an action node whose line is: arrange-task wk1' },
  'review-task': { canvas: 'Review on a work card', palette: 'work.review', agent: 'tc plan review-task wk1', workflow: 'an action node whose line is: review-task wk1' },
  'preview-dev': { canvas: 'Start dev server in the preview pane\'s discovery list', palette: 'preview.dev', agent: 'tc plan preview-dev dev', workflow: 'an action node whose line is: preview-dev dev' },
  'workflow-copy': { canvas: 'Save a copy on the workflow panel (a built-in\'s only save, and the way out of a stale one)', palette: 'workflow.copy', agent: 'tc plan workflow-copy t1', workflow: 'an action node whose line is: workflow-copy t1' },
  'workflow-run': { canvas: 'Run on the workflow panel', palette: 'workflow.run', agent: 'tc plan workflow-run t1', workflow: 'an action node whose line is: workflow-run t1' },
  'workflow-stop': { canvas: 'Stop on the workflow panel', palette: 'workflow.stop', agent: 'tc plan workflow-stop t1', workflow: 'an action node whose line is: workflow-stop t1' },
  'workflow-unedge': { canvas: 'Delete on a selected edge (click its word)', palette: 'workflow.unedge', agent: 'tc plan workflow-unedge t1 n1 n2', workflow: 'an action node whose line is: workflow-unedge t1 n1 n2' }
}
