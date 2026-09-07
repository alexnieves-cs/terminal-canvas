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
import { StringDecoder } from 'node:string_decoder'
import type { PanelId } from '../shared/types'
import { capTrail, scanTrailChunk, type ScanResult, type Trail, type TrailEntry } from '../shared/skill-trail'

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
  /**
   * RAW bytes from `from` to EOF, plus the file's size NOW — mirroring
   * `transcript-reader.ts`'s own `readFrom` shape exactly (never decoded
   * here: a read can land mid-write, splitting a multibyte codepoint, and
   * only a decoder that carries state between calls reassembles it — see
   * `scanTrailBytes` below). `undefined` on a read error.
   */
  readDelta: (path: string, from: number) => { bytes: Buffer; size: number } | undefined
}

/** Only a claude terminal has a transcript this trail can read today. */
const CLAUDE_BACKEND = 'claude'

interface PanelTrailState {
  offset: number
  carry: string
  entries: TrailEntry[]
  /**
   * How many entries this panel has dropped over its WHOLE life, across
   * every poll — accumulated, never recomputed. Both caps discard here (one
   * inside `scanTrailChunk`, one in `capTrail` over the assembled list), and
   * the stored `entries` are already bounded, so a `more` derived from them
   * would count only the drop this one poll happened to make and would reset
   * to 0 on the next poll that read no new bytes: a 200-skill session would
   * paint 40 cards under no notice at all.
   */
  dropped: number
  /**
   * One decoder per panel, carrying whatever incomplete trailing UTF-8
   * sequence its last read ended on — `pty-manager.ts`'s own
   * `transcriptDecoders` map, for the identical reason: a read can land at
   * any byte offset, and decoding an arbitrary byte range directly turns a
   * split codepoint into a replacement character on BOTH sides of the split.
   */
  decoder: StringDecoder
}

function freshPanelState(): PanelTrailState {
  return { offset: 0, carry: '', entries: [], dropped: 0, decoder: new StringDecoder('utf8') }
}

/**
 * Per-panel offset + carry + accumulated entries + decoder, module-level
 * like `scrollback-log.ts`'s own per-panel state. A panel never observed
 * before reads from byte 0 — the ordinary state for the first call on any
 * panel.
 */
const state = new Map<PanelId, PanelTrailState>()

/** Forgets a panel's trail state. Call at every panel-removing site. */
export function forgetTrail(panelId: PanelId): void {
  state.delete(panelId)
}

/**
 * Decodes `bytes` through `decoder` (which carries any incomplete trailing
 * codepoint from the PREVIOUS call) and scans the result for `Skill`
 * records. Exported so a check can drive the exact decode+scan path
 * `trailFor` uses, with a real `StringDecoder`, without going through the
 * module's own panel-keyed state map.
 */
export function scanTrailBytes(decoder: StringDecoder, bytes: Buffer, carry: string): ScanResult {
  return scanTrailChunk(decoder.write(bytes), carry)
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
 *
 * A file that SHRANK since the stored offset — truncated or replaced,
 * `pty-manager.ts`'s `resetIfShrunk` situation exactly — resets this
 * panel's offset, carry, entries AND decoder to fresh and re-reads from 0,
 * rather than reporting an empty read forever from a stale offset past the
 * new file's end.
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
  const readDelta = deps.readDelta

  const panelId = deps.panelId
  let prior = state.get(panelId) ?? freshPanelState()

  let read: { bytes: Buffer; size: number } | undefined
  try {
    read = readDelta(path, prior.offset)
  } catch {
    return { kind: 'unreadable', why: 'the transcript could not be read' }
  }
  if (read === undefined) {
    return { kind: 'unreadable', why: 'the transcript could not be read' }
  }

  if (read.size < prior.offset) {
    // The file was truncated or replaced: the stored offset now points PAST
    // its end, and re-reading from there forever reports empty. The
    // decoder's buffered partial bytes belonged to the file that is gone —
    // carrying them into a re-read from 0 would prepend a stray tail from a
    // stream this panel no longer has any relationship to, so the whole
    // panel state resets, not just the offset.
    prior = freshPanelState()
    try {
      read = readDelta(path, 0)
    } catch {
      return { kind: 'unreadable', why: 'the transcript could not be read' }
    }
    if (read === undefined) {
      return { kind: 'unreadable', why: 'the transcript could not be read' }
    }
  }

  const scan = scanTrailBytes(prior.decoder, read.bytes, prior.carry)
  const entries = [...prior.entries, ...scan.entries]
  const capped = capTrail(entries)
  // Everything ever dropped for this panel: what it had already lost, plus
  // what this chunk's own cap threw away, plus what the assembled list's cap
  // just threw away. Stored back, so the next poll starts from the total.
  const dropped = prior.dropped + scan.dropped + capped.more

  state.set(panelId, { offset: read.size, carry: scan.carry, entries: capped.entries, dropped, decoder: prior.decoder })

  if (capped.entries.length === 0 && dropped === 0) return { kind: 'none' }
  return { kind: 'entries', entries: capped.entries, more: dropped }
}
