import type { AgentOptions } from '@shared/cost'
import type { SpawnRequest } from '@shared/ipc-contract'

/**
 * M65. THE SPAWN SHEET'S MODEL — pure, plain-node checked in `verify:palette`.
 *
 * The sheet answers the three questions the daily user answers by hand in a
 * shell today: WHERE (a directory), WHAT (a preset, or a one-off command),
 * HOW (an agent's mode, effort, model). This module turns the fields into
 * the request main resolves, and orders the directory suggestions; the
 * component (`SpawnSheet.tsx`) only renders and moves focus.
 */

export type SheetWhat = { kind: 'preset'; id: string } | { kind: 'command'; command: string } | { kind: 'chat' } | { kind: 'supervisor' }

/**
 * M73. The chat arm's stand-in preset id in the request the sheet PREVIEWS.
 * A chat is never sent to `spawn:sheet` — the sheet's submit branches on
 * `what.kind` first and mints renderer-side — so this id reaches main only
 * if that branch is lost, where it is refused as a preset that does not
 * exist rather than spawning anything.
 */
export const CHAT_WHAT_ID = '__chat__'
/** M81. A chat whose subject is the canvas: created with the supervisor's system prompt. */
export const SUPERVISOR_WHAT_ID = '__supervisor__'

export interface SheetValues {
  what: SheetWhat
  cwd: string
  title: string
  agentOptions: AgentOptions
  worktree?: boolean
}

export interface SheetPreset {
  id: string
  name: string
  /** Present for an agent preset; the mode/effort/model fields show only then. */
  agent?: string
  cwd?: string
  available?: boolean
  /** The preset's own agent options — the resolved defaults the sheet shows. */
  agentOptions?: AgentOptions
}

/** A directory and where it came from — every suggestion says what it is. */
export interface DirectorySuggestion {
  dir: string
  why: 'focused panel' | 'recent' | 'open panel'
}

/**
 * The request main resolves. An ABSENT command stays absent (a preset with
 * no command is the login shell, and only main may name it — M5a's rule,
 * reaching a fifth surface here); a typed command becomes a task, titled
 * with itself unless a title was typed; agent options ride only on an agent
 * preset (a shell has no `--permission-mode`); a title rides only when typed.
 */
export function buildSpawnRequest(values: SheetValues, presets: readonly SheetPreset[]): SpawnRequest {
  const cwd = values.cwd.trim()
  const title = values.title.trim()
  const what = values.what
  if (what.kind === 'supervisor') {
    const req: SpawnRequest = { presetId: SUPERVISOR_WHAT_ID, cwd }
    if (title !== '') req.title = title
    return req
  }
  if (what.kind === 'chat') {
    const req: SpawnRequest = { presetId: CHAT_WHAT_ID, cwd }
    if (title !== '') req.title = title
    if (Object.keys(values.agentOptions).length > 0) req.agentOptions = { ...values.agentOptions }
    return req
  }
  if (what.kind === 'command') {
    const command = what.command.trim()
    return { command, cwd, title: title === '' ? command : title }
  }
  const presetId = what.id
  const preset = presets.find((p) => p.id === presetId)
  const req: SpawnRequest = { presetId, cwd }
  if (title !== '') req.title = title
  if (preset?.agent !== undefined && Object.keys(values.agentOptions).length > 0) req.agentOptions = { ...values.agentOptions }
  if (values.worktree !== undefined) req.worktree = values.worktree
  return req
}

/**
 * The `where` field's suggestions, in the order the brief states: the
 * focused panel's live directory, then the recent spawn directories (newest
 * first), then every open panel's directory — deduplicated, and filtered by
 * the typed text as a CONTIGUOUS substring (a path is never fuzzy, the M64
 * rule). Empty typed text lists them all.
 */
export function directorySuggestions(input: {
  typed: string
  /** False while the field still holds a default the user did not type: then nothing is filtered. */
  touched?: boolean
  focusedCwd?: string
  recents: readonly string[]
  panelDirs: readonly string[]
}, cap = 8): DirectorySuggestion[] {
  const seen = new Set<string>()
  const out: DirectorySuggestion[] = []
  // An untouched default (the focused panel's or the preset's directory)
  // must not filter the list down to itself — the first check run showed
  // no suggestions at all under a default of /tmp.
  const q = input.touched === false ? '' : input.typed.trim().toLowerCase()
  const consider = (dir: string | undefined, why: DirectorySuggestion['why']): void => {
    if (dir === undefined || dir === '' || seen.has(dir)) return
    if (q !== '' && !dir.toLowerCase().includes(q)) return
    seen.add(dir)
    if (out.length < cap) out.push({ dir, why })
  }
  consider(input.focusedCwd, 'focused panel')
  for (const d of input.recents) consider(d, 'recent')
  for (const d of input.panelDirs) consider(d, 'open panel')
  return out
}
