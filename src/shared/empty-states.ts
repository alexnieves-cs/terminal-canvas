/**
 * M177. EMPTY STATES AS PLACES (the brief, rule 5; M127's critic; M149 F.7).
 * Every pane, panel kind and board column with nothing in it says what the
 * surface is FOR and offers one verb, in the UI face, centred, with the
 * kind's glyph. The sentences are data — one list, checked in plain node
 * (`verify:rail empty.2`): none is a bare zero, an ellipsis or a dash; each
 * names its surface; a verb is a verb phrase. A surface that reads a sentence
 * a check pins keeps that sentence (the Panels list's `no panels — ⌘N to
 * start one`, empty.1; the board's three states, F.7).
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
  { id: 'files', sentence: 'The Files pane lists the selected panel\'s folder.', verb: 'Select a panel' },
  { id: 'vault-unset', sentence: 'no vault folder yet — a vault is a folder of markdown notes that link to each other', verb: 'Choose a folder…' },
  { id: 'vault-missing', sentence: 'the vault\'s folder could not be read — it may have moved', verb: 'Choose another folder…' },
  { id: 'vault-empty', sentence: 'The vault has no notes yet.', verb: 'New note…' },
  /** Rendered by the Integrations pane in its own per-service form (the sentence holds the service's name and a code span); listed so the words are pinned. */
  { id: 'integrations-audit', sentence: 'no calls yet — an agent reaches the service with tc api, and every call lands here' },
  { id: 'teammates', sentence: 'A teammate is a named agent with a brief and its own places.', verb: 'Add a teammate' },
  { id: 'skills-column', sentence: 'drop a card here' },
  { id: 'palette', sentence: 'No matching command' },
  /** `{backend}` is filled by the node — the sentence names the engine, as codex.1 reads it. */
  { id: 'chat', sentence: 'No turns yet. Send a message to start {backend} here.' },
  { id: 'work-menu', sentence: 'No teammate to assign this to yet.', verb: 'Add one in the Teammates pane' },
  { id: 'workflow-runs', sentence: 'This workflow has not run yet.', verb: 'Run' },
  { id: 'attention', sentence: 'nothing waiting' }
]

export function emptyState(id: string): EmptyState {
  const found = EMPTY_STATES.find((e) => e.id === id)
  if (found === undefined) throw new Error(`no empty state named ${id}`)
  return found
}
