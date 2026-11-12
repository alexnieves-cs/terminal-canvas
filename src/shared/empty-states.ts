import { NO_RECENT_EVENTS } from './session-standing'
/**
 * M177. EMPTY STATES AS PLACES (the brief, rule 5; M127's critic; M149 F.7).
 * Every pane, panel kind and board column with nothing in it says what the
 * surface is FOR and offers one verb, in the UI face, centred, with the
 * kind's glyph. The sentences are data — one list, checked in plain node
 * (`verify:rail empty.2`): none is a bare zero, an ellipsis or a dash; each
 * names its surface; a verb is a verb phrase. A surface that reads a sentence
 * a check pins keeps that sentence (the Panels list's `No panels yet. ⌘N
 * starts one.`, empty.1; the board's three states, F.7).
 *
 * M646 (unslop): the sentences are written as sentences. Each used to hang
 * its second half off an em dash ("no runs yet — a handoff…"), the one
 * punctuation mark that reads most like generated copy; a full stop says the
 * same thing and `unslop.copy.1` keeps the dash out of this list.
 *
 * M179 (the Act IV critic): the list holds ONLY ids the renderer renders by
 * name (`empty.2` reads the renderer as text) — the first cut carried six
 * sentences no surface read, a green check over words that were not on
 * screen. The surfaces that keep their own sentence do so BY NAME because
 * theirs is three-state or dynamic: the Files pane's `emptyReason` (its arms
 * are the fix), the vault's `no notes` / `no note matches`, the Integrations
 * audit's per-service `tc api` line, the teammates note, the work card's
 * menu, the workflow's `RUNS_UNATTRIBUTED`.
 */
export interface EmptyState {
  id: string
  /** What the surface is for, and what is missing — one sentence. */
  sentence: string
  /** One verb, when the surface has a door; absent when the fix is elsewhere. */
  verb?: string
}

export const EMPTY_STATES: ReadonlyArray<EmptyState> = [
  { id: 'panels', sentence: 'No panels yet. ⌘N starts one.' },
  /** M396. The Panels list is empty but the canvas is not: shapes are never rows (D8), and `no panels` beside a chart read as an empty canvas. */
  { id: 'panels-shapes', sentence: 'No panels yet. A chart\'s shapes stay on the canvas and are not listed here; ⌘N starts a panel.' },
  { id: 'workspaces', sentence: 'No workspaces yet. A workspace holds one canvas of panels.', verb: 'New workspace…' },
  { id: 'runs', sentence: 'No runs yet. A handoff records one each time it fires.' },
  { id: 'snapshots', sentence: 'No snapshots yet. One is kept a minute after each save.' },
  { id: 'vault-unset', sentence: 'No notes folder yet. Choose a folder of Markdown notes that link to each other.', verb: 'Choose a folder…' },
  { id: 'vault-missing', sentence: 'The notes folder could not be read. It may have moved.' },
  { id: 'skills-column', sentence: 'drop a card here' },
  { id: 'palette', sentence: 'No matching command' },
  /** M399 (A9). ⌘F opens the search scope before anything is typed; `No matching command` there answered a question nobody asked. */
  { id: 'palette-search', sentence: 'Type to search terminal output, chat turns and tasks in this workspace' },
  /** `{backend}` is filled by the node — the sentence names the engine, as codex.1 reads it. */
  { id: 'chat', sentence: 'No turns yet. Send a message to start {backend} here.' },
  { id: 'attention', sentence: 'nothing waiting' },
  /** M279. The inspector's Activity tab, per object and canvas-wide. */
  { id: 'activity', sentence: 'No activity yet. State changes and finished turns are listed here as they happen.' },
  /** M514. The Sessions detail's tail before a session has printed anything this visit — it was a blank black well. */
  { id: 'session-tail', sentence: 'No output yet. The newest lines this session prints appear here.' },
  { id: 'orch-roster', sentence: 'No agents match this filter. Start a chat or terminal on the canvas.', verb: 'Show Canvas' },
  { id: 'orch-pipeline', sentence: 'No tasks in this stage. Start work from the board or the palette.', verb: 'Show Canvas' },
  { id: 'orch-task', sentence: 'No task is in progress or in review. Start work from the board.', verb: 'Show Canvas' },
  { id: 'orch-activity', sentence: `${NO_RECENT_EVENTS} \u2014 this feed is this run\u2019s; the durable record is the workbench\u2019s Timeline tab. Live is working panels plus the recent window; Historical is this session` },
  { id: 'orch-terminal', sentence: 'No recorded logs yet. Select a panel to read its scrollback or last chat turn.', verb: 'Show Canvas' },
  { id: 'orch-files', sentence: 'No file panels on this canvas. Drop a file here or open one from the palette.', verb: 'Show Canvas' },
  /** M441. The minimap when the canvas has nothing on it. L-B's overlay reads the same sentence (R-022). */
  { id: 'minimap', sentence: 'Nothing placed yet' },
  /** M466. Sessions with nothing to list, and Settings' shortcut search with no hit — each had kept its own sentence (fix-list). */
  { id: 'sessions', sentence: 'No sessions on this canvas yet. Each terminal and each conversation is one.' },
  { id: 'keyboard-search', sentence: 'No shortcut matches that search.' }
]

export function emptyState(id: string): EmptyState {
  const found = EMPTY_STATES.find((e) => e.id === id)
  if (found === undefined) throw new Error(`no empty state named ${id}`)
  return found
}

/** M441. The empty canvas's title. An unnamed workspace does not invent a name. */
export function blankCanvasTitle(workspace: string): string {
  const name = workspace.trim()
  return name === '' ? 'A blank canvas' : `A blank canvas for ${name}`
}

export const BLANK_CANVAS_PURPOSE = 'Describe a task and an agent works on it on its own branch, or start with something smaller.'

/** M388's ground double-click places a flowchart process step. The owner kept that gesture (Oct 6, 2026); the hint names it. */
export const GHOST_TARGET = 'Double-click to place a flowchart step'

/** The repository chip. An empty repository says so, rather than a blank or a zero. The chip sets a
 * repository NAME in mono and the sentence in the UI face (M466): only the name is a path. */
export function repoChipLabel(repo: string | null | undefined): string {
  const name = (repo ?? '').trim()
  return name === '' ? 'no repository chosen' : name
}
