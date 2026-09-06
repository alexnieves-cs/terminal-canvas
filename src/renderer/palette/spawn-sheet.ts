import type { AgentOptions } from '@shared/cost'
import type { SpawnRequest } from '@shared/ipc-contract'
import { teammateWord, type PersistedTeammate } from '@shared/teammates'
import { LINEUP_IDS, type Lineup } from '@shared/lineups'
type LineupId = Lineup['id']
import { BACKENDS, BACKEND_IDS, type AgentBackend } from '@shared/agent-backends'

/** M99. The registry's order is the sheet's row order. */
export { BACKEND_IDS }

/**
 * M65. THE SPAWN SHEET'S MODEL — pure, plain-node checked in `verify:palette`.
 *
 * The sheet answers the three questions the daily user answers by hand in a
 * shell today: WHERE (a directory), WHAT (a preset, or a one-off command),
 * HOW (an agent's mode, effort, model). This module turns the fields into
 * the request main resolves, and orders the directory suggestions; the
 * component (`SpawnSheet.tsx`) only renders and moves focus.
 */

/** M118. ONE chat arm for every backend (`backend` absent is claude, carried by name); M90's `codex` kind folded in so a third row needs no new member — registry.1's rule reached for the sheet. */
export type SheetWhat = { kind: 'preset'; id: string } | { kind: 'command'; command: string } | { kind: 'chat'; backend?: AgentBackend } | { kind: 'supervisor' } | { kind: 'teammate'; id: string } | { kind: 'lineup'; id: LineupId }

/**
 * M73. The chat arm's stand-in preset id in the request the sheet PREVIEWS.
 * A chat is never sent to `spawn:sheet` — the sheet's submit branches on
 * `what.kind` first and mints renderer-side — so this id reaches main only
 * if that branch is lost, where it is refused as a preset that does not
 * exist rather than spawning anything.
 */
export const CHAT_WHAT_ID = '__chat__'
/** M90. The second conversation arm: a chat with codex. */
export const CODEX_WHAT_ID = '__codex__'
/** M81. A chat whose subject is the canvas: created with the supervisor's system prompt. */
export const SUPERVISOR_WHAT_ID = '__supervisor__'
/** M104. A LINEUP: the sheet's value is this prefix plus the lineup's id; the seats are minted by the renderer after the preview. */
export const LINEUP_WHAT_PREFIX = '__lineup__:'
export function lineupWhatId(id: LineupId): string { return LINEUP_WHAT_PREFIX + id }
export function parseLineupWhatId(value: string): LineupId | null {
  const id = value.startsWith(LINEUP_WHAT_PREFIX) ? value.slice(LINEUP_WHAT_PREFIX.length) : null
  return id !== null && (LINEUP_IDS as readonly string[]).includes(id) ? (id as LineupId) : null
}

/** M100. A chat AS a teammate: the sheet's value is this prefix plus the teammate's id. */
export const TEAMMATE_WHAT_PREFIX = '__teammate__:'
export function teammateWhatId(id: string): string { return TEAMMATE_WHAT_PREFIX + id }
export function parseTeammateWhatId(value: string): string | null { return value.startsWith(TEAMMATE_WHAT_PREFIX) ? value.slice(TEAMMATE_WHAT_PREFIX.length) : null }

/**
 * M100. One `chat as <name>` row per teammate, in roster order. A teammate
 * with NO places is offered disabled naming the fix — a chat it could spawn
 * would be refused by main's gate anyway, and a row that vanished would read
 * as a teammate that was never made. Without claude every row names the CLI.
 */
export function teammateOptions(teammates: readonly PersistedTeammate[], claudeAvailable: boolean): { id: string; label: string; disabled: boolean; reason?: string }[] {
  return teammates.map((t) => {
    const label = `chat as ${teammateWord(t)}`
    if (!claudeAvailable) return { id: t.id, label: `${label} — claude not on PATH`, disabled: true, reason: 'claude was not found on the login PATH' }
    if (t.places.length === 0) return { id: t.id, label: `${label} — no places yet`, disabled: true, reason: `${teammateWord(t)} has no places — add a folder in the Teammates pane before it can work anywhere` }
    return { id: t.id, label, disabled: false }
  })
}

/** M99. Each backend's value in the `what` select — the two M73/M90 ids, by row. */
export const WHAT_ID_BY_BACKEND: Readonly<Record<AgentBackend, string>> = { claude: CHAT_WHAT_ID, codex: CODEX_WHAT_ID, copilot: '__copilot__', acp: '__acp__' }

/** The inverse: which backend a `what` id names, or undefined for every non-chat id. */
export function backendOfWhatId(whatId: string): AgentBackend | undefined {
  return (Object.keys(WHAT_ID_BY_BACKEND) as AgentBackend[]).find((b) => WHAT_ID_BY_BACKEND[b] === whatId)
}

export interface BackendOption {
  id: AgentBackend
  label: string
  disabled: boolean
}

/**
 * M99. One conversation row per REGISTERED backend, in registry order,
 * labelled `chat with <label>`; a backend whose CLI is absent is DISABLED
 * with the fix in its label (`— not on PATH`), never dropped — a row that
 * vanishes reads as a backend that was never built. `available` is keyed by
 * backend so a third row needs no new parameter.
 */
export function backendOptions(available: Partial<Record<AgentBackend, boolean>>): BackendOption[] {
  return BACKEND_IDS.map((id) => {
    const ok = available[id] === true
    return { id, label: ok ? `chat with ${BACKENDS[id].label}` : `chat with ${BACKENDS[id].label} — not on PATH`, disabled: !ok }
  })
}

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
  if (what.kind === 'lineup') {
    // Minted in the renderer seat by seat after the preview; the id reaches
    // main only if that branch is lost, where it is refused as an unknown preset.
    const req: SpawnRequest = { presetId: lineupWhatId(what.id), cwd }
    if (title !== '') req.title = title
    if (values.worktree !== undefined) req.worktree = values.worktree
    return req
  }
  if (what.kind === 'teammate') {
    // Minted in the renderer like the other conversation arms; the id only
    // names which, and reaches main only if that branch is lost — refused there.
    const req: SpawnRequest = { presetId: teammateWhatId(what.id), cwd, teammateId: what.id }
    if (title !== '') req.title = title
    return req
  }
  if (what.kind === 'chat') {
    // M90. Every conversation arm is minted in the renderer; the id here
    // only names which backend, for the preview's shape.
    const req: SpawnRequest = { presetId: WHAT_ID_BY_BACKEND[what.backend ?? 'claude'], cwd }
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
