/**
 * M701. The local event log's record format and the pure arithmetic over it.
 *
 * WHY THIS EXISTS. The next stage of the app is meant to come from how it is
 * really used, and nothing recorded that. This log is the raw material: when
 * an agent needed the person, when they answered, when the app lost and got
 * back focus, and which panel kinds were open. It is opt-in
 * (`telemetry.localEventLog`, off by default), it stays on the machine, and
 * the writer (main/event-log.ts) never sends a byte anywhere.
 *
 * WHAT A RECORD NEVER HOLDS. No command, no output, no prompt, no path, no
 * title, no tool input. A panel is a salted hash; a tool is its built-in name
 * or a class (`mcp`, `other`). Each record kind below lists every field it
 * carries, so a reader can check the claim by reading the union.
 *
 * Pure: no fs, no electron. The writer, the report script and the verify
 * suite all read this one module, so the numbers a report prints are the
 * numbers the suite pinned.
 */

export const EVENT_LOG_VERSION = 1

/** The states main's attention detector emits for a terminal panel (shared/types.ts AgentState). */
export type LoggedTerminalState = 'starting' | 'busy' | 'idle' | 'wants-you' | 'exited'

/** Which program a panel runs. `shell` is a terminal with no agent detected. */
export type LoggedAgent = 'claude-code' | 'codex' | 'copilot' | 'shell' | 'chat'

export type EventRecord =
  /** The app started, quit, or the log was switched on mid-session. `focused` is the app's focus at that moment. */
  | { v: 1; t: number; e: 'app'; what: 'start' | 'quit' | 'log-on'; focused?: boolean }
  /** The app as a whole gained or lost focus: another app took over, or the person came back. */
  | { v: 1; t: number; e: 'focus'; on: boolean }
  /** A terminal panel's attention state changed. Written only on a change, never on a repeat. */
  | { v: 1; t: number; e: 'state'; panel: string; agent: LoggedAgent; state: LoggedTerminalState }
  /**
   * A chat panel's session. `ask`: a permission request is waiting (`req` pairs it with its end).
   * `answer`, `dropped`: how it ended. `auto-allowed`: a session grant answered it, so nobody waited.
   * `done`: a turn finished and the agent waits for the next message. `sent`: the person's next message reached it.
   */
  | { v: 1; t: number; e: 'chat'; panel: string; what: 'ask' | 'answer' | 'dropped' | 'auto-allowed' | 'done' | 'sent'; req?: string; tool?: string; allow?: boolean }
  /** The panel kinds on the canvas at a save, written only when the counts change. */
  | { v: 1; t: number; e: 'panels'; counts: Record<string, number> }
  /** The day's file reached its cap; records after this one were not written that day. */
  | { v: 1; t: number; e: 'cap' }

type ChatWhat = Extract<EventRecord, { e: 'chat' }>['what']

/** Records without their version and time, as the writer is handed them. */
export type EventBody = EventRecord extends infer R ? R extends { v: 1; t: number } ? Omit<R, 'v' | 't'> : never : never

const STATES = new Set<string>(['starting', 'busy', 'idle', 'wants-you', 'exited'])
const AGENTS = new Set<string>(['claude-code', 'codex', 'copilot', 'shell', 'chat'])
const CHAT_WHATS = new Set<string>(['ask', 'answer', 'dropped', 'auto-allowed', 'done', 'sent'])
const APP_WHATS = new Set<string>(['start', 'quit', 'log-on'])

/**
 * A tool name as the log keeps it. Built-in tools have short capitalised
 * names (Bash, Edit, WebFetch) and are kept. An MCP tool's name carries its
 * server's name (`mcp__github__create_issue`), which says which services a
 * person uses, so it is reduced to `mcp`. Anything else is `other`.
 */
export function toolClass(name: unknown): string {
  if (typeof name !== 'string') return 'other'
  if (name.startsWith('mcp__') || name.startsWith('mcp_')) return 'mcp'
  return /^[A-Z][A-Za-z]{1,23}$/.test(name) ? name : 'other'
}

const isCounts = (x: unknown): x is Record<string, number> =>
  typeof x === 'object' && x !== null && !Array.isArray(x) &&
  Object.entries(x as Record<string, unknown>).every(([k, n]) => /^[a-z][a-z0-9-]{0,31}$/.test(k) && Number.isSafeInteger(n) && (n as number) >= 0)

/** One line to a record, or null for anything this version did not write. Strict on purpose: a report counts only what it understands. */
export function parseEventLine(line: string): EventRecord | null {
  const text = line.trim()
  if (text === '') return null
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return null }
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (r.v !== EVENT_LOG_VERSION || typeof r.t !== 'number' || !Number.isFinite(r.t)) return null
  const t = r.t
  switch (r.e) {
    case 'app':
      if (!APP_WHATS.has(String(r.what))) return null
      return { v: 1, t, e: 'app', what: r.what as 'start' | 'quit' | 'log-on', ...(typeof r.focused === 'boolean' ? { focused: r.focused } : {}) }
    case 'focus':
      return typeof r.on === 'boolean' ? { v: 1, t, e: 'focus', on: r.on } : null
    case 'state':
      if (typeof r.panel !== 'string' || !AGENTS.has(String(r.agent)) || !STATES.has(String(r.state))) return null
      return { v: 1, t, e: 'state', panel: r.panel, agent: r.agent as LoggedAgent, state: r.state as LoggedTerminalState }
    case 'chat':
      if (typeof r.panel !== 'string' || !CHAT_WHATS.has(String(r.what))) return null
      return {
        v: 1, t, e: 'chat', panel: r.panel, what: r.what as ChatWhat,
        ...(typeof r.req === 'string' ? { req: r.req } : {}),
        ...(typeof r.tool === 'string' ? { tool: r.tool } : {}),
        ...(typeof r.allow === 'boolean' ? { allow: r.allow } : {})
      }
    case 'panels':
      return isCounts(r.counts) ? { v: 1, t, e: 'panels', counts: r.counts } : null
    case 'cap':
      return { v: 1, t, e: 'cap' }
    default:
      return null
  }
}

/** Every record in a file's text, oldest first. Lines this version cannot read are counted, not guessed at. */
export function parseEventLog(text: string): { records: EventRecord[]; skipped: number } {
  const records: EventRecord[] = []
  let skipped = 0
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    const rec = parseEventLine(line)
    if (rec === null) skipped++
    else records.push(rec)
  }
  return { records, skipped }
}

/** The value at quantile `q` of an ascending list, by nearest rank. Null for an empty list. */
export function quantile(sorted: readonly number[], q: number): number | null {
  if (sorted.length === 0) return null
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil(q * sorted.length)))
  return sorted[rank - 1]
}

/** One time an agent needed the person, from the moment it asked to the moment it stopped asking. */
export interface NeedsYouEpisode {
  panel: string
  source: 'terminal' | 'chat'
  start: number
  end: number
  /** answered: the person responded. ended: the panel exited first. dropped: the request was withdrawn. open: the session closed with it waiting. */
  outcome: 'answered' | 'ended' | 'dropped' | 'open'
  /** Whether the app had focus when the ask arrived. */
  focusedAtAsk: boolean
  /** Of the wait, how long the app did not have focus. */
  awayMs: number
}

export interface WaitStats { count: number; medianMs: number | null; p90Ms: number | null }

export interface EventSummary {
  firstAt: number | null
  lastAt: number | null
  /** Distinct local calendar days with at least one record. */
  days: number
  sessions: number
  /** Time the app was running with the log on. */
  runningMs: number
  focusedMs: number
  awayMs: number
  /** Times the app lost focus while running: each one is a switch to another tool. */
  switches: number
  switchesPerFocusedHour: number | null
  needsYou: {
    total: number
    answered: WaitStats
    /** Answered asks that arrived while the person was in the app, and while they were away. */
    answeredWhileIn: WaitStats
    answeredWhileAway: WaitStats
    ended: number
    dropped: number
    open: number
    /** Of all answered waiting, the share spent with the app out of focus. */
    awayShareOfWait: number | null
    autoAllowed: number
    byTool: Record<string, number>
  }
  /** A chat's turn ending to the person's next message reaching it. */
  nextInstruction: WaitStats
  panels: {
    /** The counts at the last save. */
    last: Record<string, number>
    /** The most of each kind seen at once. */
    peak: Record<string, number>
    peakTotal: number
  }
  capped: number
}

const stats = (values: number[]): WaitStats => {
  const sorted = values.slice().sort((a, b) => a - b)
  return { count: sorted.length, medianMs: quantile(sorted, 0.5), p90Ms: quantile(sorted, 0.9) }
}

const dayOf = (t: number): string => {
  const d = new Date(t)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

/**
 * The numbers the prompt asks for, from records in any order. Sorted by time
 * first: the writer can flush its last batch synchronously at quit while an
 * earlier asynchronous batch is still landing, so file order is not time order.
 *
 * Sessions: a `start` or `log-on` opens one; `quit` closes it; a `start` with
 * no `quit` before it (a crash, a force-quit) closes the previous session at
 * its last record, so a crash never counts the night as time in the app.
 * Focus before the first focus record of a session comes from the opener's
 * `focused` field, and is assumed focused when that is absent.
 */
export function summarizeEvents(input: readonly EventRecord[]): EventSummary {
  const records = input.slice().sort((a, b) => a.t - b.t)
  const days = new Set<string>()
  let sessions = 0
  let runningMs = 0
  let focusedMs = 0
  let awayMs = 0
  let switches = 0
  let capped = 0
  let autoAllowed = 0
  const byTool: Record<string, number> = {}
  const episodes: NeedsYouEpisode[] = []
  const nextInstruction: number[] = []
  let lastCounts: Record<string, number> = {}
  const peak: Record<string, number> = {}
  let peakTotal = 0

  // Session state.
  let open = false
  let focused = true
  let mark = 0 // the time running/focus accounting has been added up to
  let lastT = 0
  const termWaits = new Map<string, { start: number; focusedAtAsk: boolean; awayMs: number }>()
  const chatWaits = new Map<string, { panel: string; start: number; focusedAtAsk: boolean; awayMs: number }>()
  const chatDone = new Map<string, number>()

  const advance = (t: number): void => {
    if (!open) return
    const span = Math.max(0, t - mark)
    runningMs += span
    if (focused) focusedMs += span
    else {
      awayMs += span
      for (const w of termWaits.values()) w.awayMs += span
      for (const w of chatWaits.values()) w.awayMs += span
    }
    mark = t
  }
  const closeSession = (t: number): void => {
    advance(t)
    for (const [panel, w] of termWaits) episodes.push({ panel, source: 'terminal', start: w.start, end: t, outcome: 'open', focusedAtAsk: w.focusedAtAsk, awayMs: w.awayMs })
    for (const w of chatWaits.values()) episodes.push({ panel: w.panel, source: 'chat', start: w.start, end: t, outcome: 'open', focusedAtAsk: w.focusedAtAsk, awayMs: w.awayMs })
    termWaits.clear()
    chatWaits.clear()
    chatDone.clear()
    open = false
  }

  for (const r of records) {
    days.add(dayOf(r.t))
    if (r.e === 'app' && (r.what === 'start' || r.what === 'log-on')) {
      if (open) closeSession(lastT)
      open = true
      sessions++
      focused = r.focused !== false
      mark = r.t
      lastT = r.t
      continue
    }
    if (!open) {
      // A record outside any session (a log that began before this version
      // wrote openers): open one at it rather than lose the week.
      open = true
      sessions++
      focused = true
      mark = r.t
    }
    advance(r.t)
    lastT = r.t
    switch (r.e) {
      case 'app':
        if (r.what === 'quit') closeSession(r.t)
        break
      case 'focus':
        if (focused && !r.on) switches++
        focused = r.on
        break
      case 'state': {
        const waiting = termWaits.get(r.panel)
        if (r.state === 'wants-you') {
          if (!waiting) termWaits.set(r.panel, { start: r.t, focusedAtAsk: focused, awayMs: 0 })
        } else if (waiting) {
          termWaits.delete(r.panel)
          episodes.push({ panel: r.panel, source: 'terminal', start: waiting.start, end: r.t, outcome: r.state === 'exited' ? 'ended' : 'answered', focusedAtAsk: waiting.focusedAtAsk, awayMs: waiting.awayMs })
        }
        break
      }
      case 'chat': {
        const key = `${r.panel}\u0000${r.req ?? ''}`
        if (r.what === 'ask') {
          byTool[r.tool ?? 'other'] = (byTool[r.tool ?? 'other'] ?? 0) + 1
          if (!chatWaits.has(key)) chatWaits.set(key, { panel: r.panel, start: r.t, focusedAtAsk: focused, awayMs: 0 })
        } else if (r.what === 'answer' || r.what === 'dropped') {
          const w = chatWaits.get(key)
          if (w) {
            chatWaits.delete(key)
            episodes.push({ panel: r.panel, source: 'chat', start: w.start, end: r.t, outcome: r.what === 'answer' ? 'answered' : 'dropped', focusedAtAsk: w.focusedAtAsk, awayMs: w.awayMs })
          }
        } else if (r.what === 'auto-allowed') {
          autoAllowed++
        } else if (r.what === 'done') {
          chatDone.set(r.panel, r.t)
        } else if (r.what === 'sent') {
          const doneAt = chatDone.get(r.panel)
          if (doneAt !== undefined) { nextInstruction.push(r.t - doneAt); chatDone.delete(r.panel) }
        }
        break
      }
      case 'panels': {
        lastCounts = { ...r.counts }
        let total = 0
        for (const [kind, n] of Object.entries(r.counts)) {
          total += n
          if (n > (peak[kind] ?? 0)) peak[kind] = n
        }
        if (total > peakTotal) peakTotal = total
        break
      }
      case 'cap':
        capped++
        break
    }
  }
  if (open) closeSession(lastT)

  const answered = episodes.filter((e) => e.outcome === 'answered')
  const waitOf = (e: NeedsYouEpisode): number => e.end - e.start
  const totalWait = answered.reduce((n, e) => n + waitOf(e), 0)
  const totalAway = answered.reduce((n, e) => n + Math.min(e.awayMs, waitOf(e)), 0)
  const focusedHours = focusedMs / 3_600_000

  return {
    firstAt: records.length ? records[0].t : null,
    lastAt: records.length ? records[records.length - 1].t : null,
    days: days.size,
    sessions,
    runningMs,
    focusedMs,
    awayMs,
    switches,
    switchesPerFocusedHour: focusedHours > 0 ? switches / focusedHours : null,
    needsYou: {
      total: episodes.length,
      answered: stats(answered.map(waitOf)),
      answeredWhileIn: stats(answered.filter((e) => e.focusedAtAsk).map(waitOf)),
      answeredWhileAway: stats(answered.filter((e) => !e.focusedAtAsk).map(waitOf)),
      ended: episodes.filter((e) => e.outcome === 'ended').length,
      dropped: episodes.filter((e) => e.outcome === 'dropped').length,
      open: episodes.filter((e) => e.outcome === 'open').length,
      awayShareOfWait: totalWait > 0 ? totalAway / totalWait : null,
      autoAllowed,
      byTool
    },
    nextInstruction: stats(nextInstruction),
    panels: { last: lastCounts, peak, peakTotal },
    capped
  }
}

/** A duration for a person to read: 850 ms, 42 s, 3.5 min, 2.1 h. */
export function formatDuration(ms: number | null): string {
  if (ms === null) return 'n/a'
  if (ms < 1000) return `${Math.round(ms)} ms`
  if (ms < 60_000) return `${Math.round(ms / 1000)} s`
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)} min`
  return `${(ms / 3_600_000).toFixed(1)} h`
}
