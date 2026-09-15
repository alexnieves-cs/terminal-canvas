/**
 * M177. EMPTY STATES AS PLACES (the brief, rule 5; M127's critic; M149 F.7).
 * Every pane, panel kind and board column with nothing in it says what the
 * surface is FOR and offers one verb, in the UI face, centred, with the
 * kind's glyph. The sentences are data — one list, checked in plain node
 * (`verify:rail empty.2`): none is a bare zero, an ellipsis or a dash; each
 * names its surface; a verb is a verb phrase. A surface that reads a sentence
 * a check pins keeps that sentence (the Panels list's `no panels — ⌘N to
 * start one`, empty.1; the board's three states, F.7).
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
  { id: 'panels', sentence: 'no panels — ⌘N to start one' },
  { id: 'workspaces', sentence: 'no workspaces — one holds a canvas of panels', verb: 'New workspace…' },
  { id: 'runs', sentence: 'no runs yet — a handoff that fires records one' },
  { id: 'snapshots', sentence: 'no snapshots yet — one is kept a minute after each save' },
  { id: 'vault-unset', sentence: 'no vault folder yet — a vault is a folder of markdown notes that link to each other', verb: 'Choose a folder…' },
  { id: 'vault-missing', sentence: 'the vault\'s folder could not be read — it may have moved' },
  { id: 'skills-column', sentence: 'drop a card here' },
  { id: 'palette', sentence: 'No matching command' },
  /** `{backend}` is filled by the node — the sentence names the engine, as codex.1 reads it. */
  { id: 'chat', sentence: 'No turns yet. Send a message to start {backend} here.' },
  { id: 'attention', sentence: 'nothing waiting' },
  { id: 'orch-roster', sentence: 'no agents match this filter — start a chat or terminal on the canvas', verb: 'Show Canvas' },
  { id: 'orch-pipeline', sentence: 'no tasks in this stage — start work from the board or palette', verb: 'Show Canvas' },
  { id: 'orch-task', sentence: 'no task is in progress or in review — start work from the board', verb: 'Show Canvas' },
  { id: 'orch-selected', sentence: 'select an agent in the pool or graph to jump to it' },
  { id: 'orch-activity', sentence: 'no matching activity — Live is working panels plus the recent window; Historical is this session' },
  { id: 'orch-terminal', sentence: 'no recorded logs yet — select a panel to read its scrollback or last chat turn', verb: 'Show Canvas' },
  { id: 'orch-files', sentence: 'no file panels on this canvas — drop a file or open one from the palette', verb: 'Show Canvas' }
]

export function emptyState(id: string): EmptyState {
  const found = EMPTY_STATES.find((e) => e.id === id)
  if (found === undefined) throw new Error(`no empty state named ${id}`)
  return found
}
