/**
 * M129. The live skill trail's tail: `scanTrailChunk` fed from a byte offset
 * over the CLI's own transcript file — `scrollback-log.ts`'s append
 * discipline, inverted (that module WRITES a ring; this one only ever READS
 * forward from where it last stopped).
 *
 * Every dependency is injected — `backend`, `pinnedSession`,
 * `resolveTranscript`, `readDelta` — so the whole read is drivable under
 * plain node with no real `~/.claude/projects` in earshot, the same trade
 * `pty-manager.ts` already makes for `resolveTranscript`/`readFrom`.
 */
import type { PanelId } from '../shared/types'
import { capTrail, scanTrailChunk, type Trail, type TrailEntry } from '../shared/skill-trail'

export interface TrailDeps {
  /**
   * The panel's agent backend, decided by the CALLER (main/index.ts) from
   * whatever fact it has for a terminal panel today — this module trusts it
   * rather than re-deriving it, and never touches another dep before
   * checking it: the very first check in `trailFor` (§6.1) is this one,
   * so `trailFor({ backend: 'codex' })` with nothing else refuses cleanly.
   */
  backend: string
  panelId: PanelId
  pinnedSession: (panelId: PanelId) => string | undefined
  resolveTranscript: (sessionId: string) => string | undefined
  readDelta: (path: string, from: number) => { text: string; offset: number }
}

/** Only a claude terminal has a transcript this trail can read today. */
const CLAUDE_BACKEND = 'claude'

interface PanelTrailState {
  offset: number
  carry: string
  entries: TrailEntry[]
}

/**
 * Per-panel offset + carry + accumulated entries, module-level like
 * `scrollback-log.ts`'s own per-panel state. A panel never observed before
 * reads from byte 0 — the ordinary state for the first call on any panel.
 */
const state = new Map<PanelId, PanelTrailState>()

/** Forgets a panel's trail state. Call at every panel-removing site. */
export function forgetTrail(panelId: PanelId): void {
  state.delete(panelId)
}

/**
 * Answers this panel's trail.
 *
 * Three refusals, each a NAMED `unreadable` rather than an empty list — "no
 * skills used" and "we cannot see this session's skills" are different
 * sentences, and printing the first for the second lies to the user about
 * what their agent did:
 *
 * 1. Not a claude backend (codex, or anything else) — checked BEFORE any
 *    other dep is touched, so a caller passing nothing else still refuses
 *    cleanly rather than throwing on an undefined `pinnedSession`.
 * 2. No pinned session for this panel — a terminal that never ran an agent,
 *    or one whose agent has not started yet.
 * 3. The pinned session's transcript cannot be resolved — claude has not
 *    written it yet, or it was resumed from a machine whose projects
 *    directory this one does not have.
 */
export async function trailFor(deps: Partial<TrailDeps> & Pick<TrailDeps, 'backend'>): Promise<Trail> {
  if (deps.backend !== CLAUDE_BACKEND) {
    return { kind: 'unreadable', why: `${deps.backend} sessions do not expose a skill trail yet` }
  }

  const sessionId = deps.pinnedSession?.(deps.panelId as PanelId)
  if (sessionId === undefined) {
    return { kind: 'unreadable', why: 'this panel has no pinned agent session' }
  }

  const path = deps.resolveTranscript?.(sessionId)
  if (path === undefined) {
    return { kind: 'unreadable', why: 'no transcript could be resolved for this session' }
  }

  if (deps.readDelta === undefined || deps.panelId === undefined) {
    return { kind: 'unreadable', why: 'the transcript could not be read' }
  }

  const panelId = deps.panelId
  const prior = state.get(panelId) ?? { offset: 0, carry: '', entries: [] }

  let read: { text: string; offset: number }
  try {
    read = deps.readDelta(path, prior.offset)
  } catch {
    return { kind: 'unreadable', why: 'the transcript could not be read' }
  }

  const scan = scanTrailChunk(read.text, prior.carry)
  const entries = [...prior.entries, ...scan.entries]
  const capped = capTrail(entries)

  state.set(panelId, { offset: read.offset, carry: scan.carry, entries: capped.entries })

  if (capped.entries.length === 0) return { kind: 'none' }
  return { kind: 'entries', entries: capped.entries, more: capped.more }
}
