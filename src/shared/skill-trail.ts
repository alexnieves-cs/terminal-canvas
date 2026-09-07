/**
 * M129. The live skill trail's pure half: the CLI's own JSONL transcript,
 * scanned line by line for `Skill` tool_use records.
 *
 * Measurement 1 (spec §0.1): a skill invocation is a structured record —
 * `{"type":"assistant","message":{"content":[{"type":"tool_use",
 * "name":"Skill","input":{"skill":"<name>","args"?:"<text>"}}]}}` — one line
 * per record. This is a READ over that format, never a parser for the PTY's
 * painted byte stream (that format belongs to the CLI and is not this
 * repo's to version).
 */

export interface TrailEntry {
  at: number
  name: string
  /** Absent when the record carries none — never `undefined` via a spread. */
  args?: string
}

/** Named per the spec: a session whose skills we simply cannot see. */
export type TrailUnreadable = string

export type Trail =
  | { kind: 'entries'; entries: TrailEntry[]; more: number }
  | { kind: 'none' }
  | { kind: 'unreadable'; why: TrailUnreadable }

/**
 * The newest this many entries are painted; the rest are counted, not
 * dropped silently. A 200-skill session must not paint 200 cards, and a
 * silent truncation is a lie about the order the skills ran in.
 */
export const TRAIL_MAX = 40

/**
 * Result of scanning one chunk of the transcript, following
 * `agent-state.ts`'s `scanChunk` shape: a `carry` for the incomplete final
 * line (flushed reads can split mid-line; the tail is never parsed as a
 * record, only kept for the next call) and a count of lines that were
 * complete JSON but not a record this trail cares about in valid shape
 * (malformed JSON only — a well-formed record of no interest is not a
 * malformed line).
 */
export interface ScanResult {
  entries: TrailEntry[]
  carry: string
  malformed: number
}

/**
 * Scans `carry + chunk` for `Skill` tool_use records.
 *
 * `at` comes from the record's own `timestamp` parsed to epoch ms. A record
 * with no parseable timestamp still counts — dropping a real skill call
 * because one field failed to parse would be a truncation with no `more` to
 * announce it — so it inherits the PREVIOUS entry produced in this same
 * call, or 0 if this is the first entry this call has produced (there is no
 * carried "last timestamp" between calls; a boundary landing exactly there
 * is a rare, harmless cosmetic drift, not a dropped or reordered record).
 */
export function scanTrailChunk(chunk: string, carry: string): ScanResult {
  const text = carry + chunk
  const lines = text.split('\n')
  // The last element is either '' (chunk ended on a newline) or an
  // incomplete final line — either way it is not a complete record yet.
  const nextCarry = lines.pop() ?? ''

  const entries: TrailEntry[] = []
  let malformed = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    let record: unknown
    try {
      record = JSON.parse(trimmed)
    } catch {
      malformed++
      continue
    }
    if (typeof record !== 'object' || record === null) continue
    const rec = record as { type?: unknown; timestamp?: unknown; message?: unknown }
    if (rec.type !== 'assistant') continue
    const message = rec.message as { content?: unknown } | undefined
    const content = Array.isArray(message?.content) ? message!.content : []
    for (const block of content) {
      if (
        typeof block !== 'object' ||
        block === null ||
        (block as { type?: unknown }).type !== 'tool_use' ||
        (block as { name?: unknown }).name !== 'Skill'
      ) {
        continue
      }
      const input = (block as { input?: unknown }).input
      const skill = typeof input === 'object' && input !== null ? (input as { skill?: unknown }).skill : undefined
      if (typeof skill !== 'string') continue
      const argsRaw = typeof input === 'object' && input !== null ? (input as { args?: unknown }).args : undefined
      const parsed = typeof rec.timestamp === 'string' ? Date.parse(rec.timestamp) : NaN
      const at = Number.isFinite(parsed) ? parsed : entries.length > 0 ? entries[entries.length - 1].at : 0
      const entry: TrailEntry = typeof argsRaw === 'string' ? { at, name: skill, args: argsRaw } : { at, name: skill }
      entries.push(entry)
    }
  }

  // Capped here too (not only in capTrail): a single chunk can itself carry
  // far more than TRAIL_MAX records (a big backfill read, or a fixture
  // repeated many times over in a check), and a caller that forgot to cap
  // the assembled result must not get to paint hundreds of cards either.
  const bounded = entries.length > TRAIL_MAX ? entries.slice(entries.length - TRAIL_MAX) : entries

  return { entries: bounded, carry: nextCarry, malformed }
}

/** Caps to the newest `TRAIL_MAX` entries, counting what was dropped. */
export function capTrail(entries: TrailEntry[]): { entries: TrailEntry[]; more: number } {
  if (entries.length <= TRAIL_MAX) return { entries, more: 0 }
  return { entries: entries.slice(entries.length - TRAIL_MAX), more: entries.length - TRAIL_MAX }
}
