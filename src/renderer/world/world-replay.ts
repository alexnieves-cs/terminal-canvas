import type { StateTone } from '@shared/redesign-contracts'
import { applyAgentEvent, emptyAgent, type AgentEvent, type AgentRecord } from '@shared/world-events'

/**
 * The room's memory (M425): every event the store accepted, in arrival order,
 * so the room can be shown as it was at any moment of the last hour — the
 * scrubber — and the time a person was away can be told back as a handful of
 * beats and toured.
 *
 * Plain functions over the journal; the store keeps the journal and the
 * cursor. A record "as of t" is the SAME reducer the live store runs
 * (`applyAgentEvent`) folded over the journal up to t, so the past room cannot
 * disagree with what the live room showed at the time.
 *
 * Its limits, said once: the journal starts when this window loaded (the store
 * connects at module scope in main.tsx) and holds `JOURNAL_MAX_AGE_MS` /
 * `JOURNAL_MAX` at most. Older than that, the run ledger and the transcript
 * are the record; the room does not pretend to remember it.
 */

/**
 * One journal line: the event, and WHEN THE ROOM GOT IT. Replay runs on
 * arrival, not on the event's own `ts`: the past room is what the room showed
 * at the time, and two sources' clocks (main's feed, the board's own posts, a
 * relay) need not agree — folding by `ts` let one early-stamped arrival hold
 * back every event after it.
 */
export interface JournalEntry {
  at: number
  event: AgentEvent
}

export const JOURNAL_MAX = 8000
export const JOURNAL_MAX_AGE_MS = 60 * 60_000

/** The journal with what is too old or too many dropped from the front. Returns the SAME array when nothing goes. */
export function trimJournal(journal: JournalEntry[], now: number, max: number = JOURNAL_MAX, maxAge: number = JOURNAL_MAX_AGE_MS): JournalEntry[] {
  let drop = Math.max(0, journal.length - max)
  while (drop < journal.length && now - journal[drop]!.at > maxAge) drop++
  return drop === 0 ? journal : journal.slice(drop)
}

/** A fold of the journal up to some time: the records, the first-seen order, and how far it has read. */
export interface Fold {
  at: number
  /** Index of the first journal event NOT yet folded. */
  next: number
  records: Map<string, AgentRecord>
  ids: string[]
}

export function emptyFold(): Fold {
  return { at: -Infinity, next: 0, records: new Map(), ids: [] }
}

/**
 * The room as of `t`. Forward from `prev` when `t` is not earlier than where
 * it stands (a playing scrubber moves forward sixty times a second, and a
 * re-fold from the start each frame would read the whole hour each time);
 * from the start when it is. Arrival times only rise, so the fold reads the
 * journal in order and stops at the first line that arrived after `t`.
 */
export function foldTo(journal: readonly JournalEntry[], t: number, prev: Fold = emptyFold()): Fold {
  const start = t >= prev.at && prev.next <= journal.length ? prev : emptyFold()
  const records = start === prev ? new Map(prev.records) : new Map<string, AgentRecord>()
  const ids = start === prev ? [...prev.ids] : []
  let next = start.next
  while (next < journal.length && journal[next]!.at <= t) {
    const event = journal[next]!.event
    const before = records.get(event.agentId)
    if (before === undefined) ids.push(event.agentId)
    records.set(event.agentId, applyAgentEvent(before ?? emptyAgent(event.agentId), event))
    next++
  }
  return { at: t, next, records, ids }
}

// ── the scrubber's marks ────────────────────────────────────────────────────

export interface Marks {
  /** Events per bucket, oldest bucket first. */
  density: number[]
  /** Moments worth a mark on the bar: a stop, a request, a failed tool. */
  points: Array<{ at: number; kind: 'stop' | 'wait' | 'fail' }>
}

export function timelineMarks(journal: readonly JournalEntry[], from: number, to: number, buckets = 60): Marks {
  const density = new Array<number>(buckets).fill(0)
  const points: Marks['points'] = []
  const span = Math.max(1, to - from)
  for (const { at, event: e } of journal) {
    if (at < from || at > to) continue
    density[Math.min(buckets - 1, Math.floor(((at - from) / span) * buckets))]!++
    if (e.type === 'error') points.push({ at, kind: 'stop' })
    else if (e.type === 'status' && e.payload === 'waiting_approval') points.push({ at, kind: 'wait' })
    else if (e.type === 'tool_result' && e.payload.status === 'failed') points.push({ at, kind: 'fail' })
  }
  return { density, points }
}

// ── while you were away ─────────────────────────────────────────────────────

export type BeatKind = 'stopped' | 'asked' | 'failed' | 'finished' | 'wrote'

export interface Beat {
  agentId: string
  at: number
  kind: BeatKind
  /** One line a person reads: "Coder finished: Normalised token expiry…". */
  text: string
}

/** A person is "away" after this long hidden or unfocused — shorter than the shell's 20 min, because the room is watched, not worked in. */
export const AWAY_MS = 5 * 60_000
/** The tour tells at most this many beats; the rest are a count. */
export const BEATS_MAX = 6

const BEAT_RANK: Readonly<Record<BeatKind, number>> = { stopped: 0, asked: 1, failed: 2, finished: 3, wrote: 4 }

/**
 * What happened between `since` and `now`, as a handful of beats, most
 * important first and then in time order: a stop, a request still or once
 * waiting, a failed tool, a finished turn (its message), and files written.
 * ONE beat per agent per kind — the latest — so a chatty agent does not fill
 * the tour; `more` counts what did not fit.
 */
export function awayBeats(journal: readonly JournalEntry[], since: number, now: number, nameOf: (id: string) => string, max: number = BEATS_MAX): { beats: Beat[]; more: number } {
  const latest = new Map<string, Beat>()
  const wrote = new Map<string, { at: number; files: Set<string> }>()
  const put = (beat: Beat): void => { latest.set(`${beat.agentId}:${beat.kind}`, beat) }
  for (const { at, event: e } of journal) {
    if (at < since || at > now) continue
    const who = nameOf(e.agentId)
    if (e.type === 'error') put({ agentId: e.agentId, at, kind: 'stopped', text: `${who} stopped: ${e.payload.message}` })
    else if (e.type === 'status' && e.payload === 'waiting_approval') put({ agentId: e.agentId, at, kind: 'asked', text: `${who} asked for your approval` })
    else if (e.type === 'tool_result' && e.payload.status === 'failed') put({ agentId: e.agentId, at, kind: 'failed', text: `${who}: ${e.payload.summary} failed${e.payload.detail ? ` — ${e.payload.detail}` : ''}` })
    else if (e.type === 'message' && !e.agentId.startsWith('world:')) put({ agentId: e.agentId, at, kind: 'finished', text: `${who}: ${e.payload.text}` })
    else if (e.type === 'tool_call' && e.payload.path !== undefined && /^(Edit|Write|MultiEdit|NotebookEdit)$/.test(e.payload.tool)) {
      const w = wrote.get(e.agentId) ?? { at, files: new Set<string>() }
      w.at = at
      w.files.add(e.payload.path)
      wrote.set(e.agentId, w)
    }
  }
  for (const [agentId, w] of wrote) {
    const n = w.files.size
    const first = [...w.files][0]!.split('/').pop()!
    put({ agentId, at: w.at, kind: 'wrote', text: n === 1 ? `${nameOf(agentId)} wrote ${first}` : `${nameOf(agentId)} wrote ${n} files` })
  }
  const all = [...latest.values()].sort((a, b) => BEAT_RANK[a.kind] - BEAT_RANK[b.kind] || a.at - b.at)
  return { beats: all.slice(0, max), more: Math.max(0, all.length - max) }
}

/** How long each beat of the tour holds the camera, ms. */
export const TOUR_BEAT_MS = 3200

/**
 * The tour the away card offers. The label is this span. Each beat still
 * holds `TOUR_BEAT_MS` (the existing tour), so a short list ends early and
 * the offer stays the one the overview names.
 */
export const TOUR_OFFER_MS = 40_000

export function tourOfferLabel(): string {
  return `Tour the changes · ${TOUR_OFFER_MS / 1000}s`
}

/** Reduced motion cuts between beats. A flight is the ordinary tour. */
export type TourStep = 'fly' | 'cut'

export function tourStep(reduced: boolean): TourStep {
  return reduced ? 'cut' : 'fly'
}

/**
 * Why a verb is refused in a past room. One sentence, so the card, the ask
 * field and the open door cannot each invent their own.
 */
export const PAST_ROOM_REASON = 'past room — go Live to act'

export interface RoomVerb {
  id: string
  label: string
}

/** Live verbs stay as they were. A past room disables every one of them, with the reason. */
export function verbsForRoom<T extends RoomVerb>(past: boolean, verbs: readonly T[]): Array<T & { disabled: boolean; reason: string | null }> {
  if (!past) return verbs.map((verb) => ({ ...verb, disabled: false, reason: null }))
  return verbs.map((verb) => ({ ...verb, disabled: true, reason: PAST_ROOM_REASON }))
}

/**
 * The tone a scrubber tick paints. Names, not hexes: the stylesheet reads
 * `var(--state-*)`. A thought is not a tick — the bar would be a solid line.
 */
export function tickTone(event: AgentEvent): StateTone | null {
  if (event.type === 'error') return 'exited'
  if (event.type === 'status') {
    if (event.payload === 'waiting_approval') return 'needs-you'
    if (event.payload === 'error') return 'exited'
    if (event.payload === 'working' || event.payload === 'thinking') return 'working'
    if (event.payload === 'idle') return 'idle'
    return null
  }
  if (event.type === 'tool_result') {
    if (event.payload.status === 'failed') return 'exited'
    if (event.payload.status === 'done') return 'done'
    return 'working'
  }
  if (event.type === 'message') return 'done'
  if (event.type === 'tool_call') return 'working'
  return null
}
