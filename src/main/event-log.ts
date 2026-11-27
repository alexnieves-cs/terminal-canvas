import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync, statSync } from 'node:fs'
import { createHash, randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { EVENT_LOG_VERSION, toolClass, type EventBody, type LoggedAgent, type LoggedTerminalState } from '../shared/event-log'

/**
 * M701. The local event log's writer: one JSONL file per local day under
 * `<userData>/event-log`, opt-in, never sent anywhere.
 *
 * THE SWITCH IS READ AT EVERY RECORD (`enabled()`), not at launch, so turning
 * `telemetry.localEventLog` off stops the next record and drops whatever was
 * buffered, and turning it on starts with a `log-on` record that says whether
 * the app had focus. While it is off this module creates no directory and no
 * file, and keeps no per-panel memory.
 *
 * WHAT IT KEEPS IN MEMORY. The last state per panel (so a repeat is not a
 * record: the PTY manager re-sends every state for the dock badge), the last
 * panel counts, and the delivered user-turn ids of each chat it has seen,
 * capped. Nothing else.
 *
 * BOUNDED. A day's file stops at `maxBytesPerDay` with one `cap` record, and
 * files older than `retentionDays` (by their date name) are deleted the first
 * time the log writes in a launch. Unbounded would be a disk-full bug.
 *
 * Writes are batched: records collect in memory and a timer appends them a
 * second later, in one small synchronous append (a few hundred bytes, at
 * most once a second), so the quit path's `flushSync` and the timer are one
 * code path and order never depends on a promise. Plain node (node:fs,
 * node:crypto), so verify:event-log runs it without Electron.
 */

export const EVENT_LOG_MAX_BYTES_PER_DAY = 2 * 1024 * 1024
export const EVENT_LOG_RETENTION_DAYS = 30
const FLUSH_DELAY_MS = 1000
const MAX_SENT_IDS = 512

export interface EventLogDeps {
  /** `<userData>/event-log`. Created on the first record written, never before. */
  dir: string
  /** The setting, read at use. */
  enabled: () => boolean
  /** Whether the app has focus now, for the opener records. */
  focused: () => boolean
  now?: () => number
  /** Tests pass a fixed salt; the app keeps a random one beside the logs. */
  salt?: string
  maxBytesPerDay?: number
  retentionDays?: number
  /** Tests flush by hand; the app uses a timer. */
  schedule?: (flush: () => void) => void
}

/** What a terminal panel's update carries, as the PTY manager sends it. */
export interface TerminalUpdate { panelId: string; state: string }

/** The subset of an agent session event the log reads. Everything else on the event is ignored. */
export interface SessionEventLike {
  id: string
  type: string
  requestId?: string
  toolName?: string
  allow?: boolean
  /** A `turn` event's turn. Unknown here: another event kind (`auto`) carries a number under the same name. */
  turn?: unknown
}

export interface EventLog {
  app(what: 'start' | 'quit'): void
  focus(on: boolean): void
  terminal(update: TerminalUpdate, agent: string | undefined): void
  session(event: SessionEventLike): void
  /** The canvas's panels at a save. Only each panel's kind is read. */
  panels(panels: readonly { kind?: unknown }[]): void
  flushSync(): void
  /** Tests: append what is buffered now. */
  flush(): void
}

const STATES = new Set(['starting', 'busy', 'idle', 'wants-you', 'exited'])
const AGENT_KINDS = new Set(['claude-code', 'codex', 'copilot'])

const pad = (n: number): string => String(n).padStart(2, '0')
const dayName = (t: number): string => {
  const d = new Date(t)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** The salt beside the logs, made once. A panel's hash is stable across launches, and meaningless without this file. */
function saltIn(dir: string): string {
  const file = join(dir, '.salt')
  try {
    const existing = readFileSync(file, 'utf8').trim()
    if (/^[0-9a-f]{32}$/.test(existing)) return existing
  } catch { /* none yet */ }
  const fresh = randomBytes(16).toString('hex')
  writeFileSync(file, fresh + '\n', { mode: 0o600 })
  return fresh
}

export function createEventLog(deps: EventLogDeps): EventLog {
  const now = deps.now ?? Date.now
  const cap = deps.maxBytesPerDay ?? EVENT_LOG_MAX_BYTES_PER_DAY
  const retention = deps.retentionDays ?? EVENT_LOG_RETENTION_DAYS
  const schedule = deps.schedule ?? ((flush) => { setTimeout(flush, FLUSH_DELAY_MS).unref?.() })

  let wasOn = false
  let prepared = false
  let salt = deps.salt ?? ''
  let buffer: string[] = []
  let scheduled = false
  const lastState = new Map<string, string>()
  let lastCounts = ''
  const sentIds = new Set<string>()
  // A day's size as this launch knows it, so the cap needs no stat per record.
  const daySize = new Map<string, number>()
  const dayCapped = new Set<string>()

  const reset = (): void => {
    buffer = []
    lastState.clear()
    lastCounts = ''
    sentIds.clear()
  }

  const prepare = (): void => {
    if (prepared) return
    mkdirSync(deps.dir, { recursive: true, mode: 0o700 })
    if (salt === '') salt = saltIn(deps.dir)
    // Retention: by the file's date name, so a touched old file still goes.
    const cutoff = dayName(now() - retention * 86_400_000)
    for (const name of readdirSync(deps.dir)) {
      const m = /^(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(name)
      if (m && m[1] < cutoff) { try { unlinkSync(join(deps.dir, name)) } catch { /* next launch tries again */ } }
    }
    prepared = true
  }

  const hash = (id: string): string => createHash('sha256').update(salt).update(id).digest('hex').slice(0, 12)

  const writeLines = (lines: string[]): void => {
    // Grouped by day: a batch can straddle midnight.
    const byDay = new Map<string, string[]>()
    for (const line of lines) {
      const t = (JSON.parse(line) as { t: number }).t
      const day = dayName(t)
      const list = byDay.get(day) ?? []
      list.push(line)
      byDay.set(day, list)
    }
    for (const [day, list] of byDay) {
      if (dayCapped.has(day)) continue
      const file = join(deps.dir, `${day}.jsonl`)
      let size = daySize.get(day)
      if (size === undefined) { try { size = statSync(file).size } catch { size = 0 } }
      const kept: string[] = []
      for (const line of list) {
        const bytes = Buffer.byteLength(line) + 1
        if (size + bytes > cap) {
          const t = (JSON.parse(line) as { t: number }).t
          kept.push(JSON.stringify({ v: EVENT_LOG_VERSION, t, e: 'cap' }))
          dayCapped.add(day)
          break
        }
        size += bytes
        kept.push(line)
      }
      if (kept.length > 0) appendFileSync(file, kept.join('\n') + '\n', { mode: 0o600 })
      daySize.set(day, size)
    }
  }

  const flush = (): void => {
    scheduled = false
    if (buffer.length === 0) return
    if (!deps.enabled()) { buffer = []; return }
    const lines = buffer
    buffer = []
    try {
      prepare()
      writeLines(lines)
    } catch {
      // A full disk or a removed folder: the log is a measurement, never a
      // reason for the app to fail. The records are dropped.
    }
  }

  /** Whether to record now. Turning on writes the opener; turning off forgets everything. */
  const on = (): boolean => {
    const enabled = deps.enabled()
    if (!enabled) {
      if (wasOn) reset()
      wasOn = false
      return false
    }
    if (!wasOn) {
      wasOn = true
      push({ e: 'app', what: 'log-on', focused: deps.focused() })
    }
    return true
  }

  const push = (body: EventBody): void => {
    buffer.push(JSON.stringify({ v: EVENT_LOG_VERSION, t: now(), ...body }))
    if (!scheduled) { scheduled = true; schedule(flush) }
  }

  return {
    app(what) {
      if (what === 'start') {
        // The opener for a launch is `start`, not `log-on`: mark the log as on first.
        if (!deps.enabled()) return
        wasOn = true
        push({ e: 'app', what: 'start', focused: deps.focused() })
        return
      }
      if (!on()) return
      push({ e: 'app', what: 'quit' })
    },
    focus(focusedNow) {
      if (!on()) return
      push({ e: 'focus', on: focusedNow })
    },
    terminal(update, agent) {
      if (!on()) return
      if (!STATES.has(update.state)) return
      if (lastState.get(update.panelId) === update.state) return
      lastState.set(update.panelId, update.state)
      const kind: LoggedAgent = agent !== undefined && AGENT_KINDS.has(agent) ? agent as LoggedAgent : 'shell'
      push({ e: 'state', panel: hash(update.panelId), agent: kind, state: update.state as LoggedTerminalState })
      if (update.state === 'exited') lastState.delete(update.panelId)
    },
    session(event) {
      if (!on()) return
      const panel = hash(event.id)
      switch (event.type) {
        case 'permission-request':
          if (typeof event.requestId !== 'string') return
          push({ e: 'chat', panel, what: 'ask', req: hash(event.requestId), tool: toolClass(event.toolName) })
          return
        case 'permission-answered':
          if (typeof event.requestId !== 'string') return
          push({ e: 'chat', panel, what: 'answer', req: hash(event.requestId), ...(typeof event.allow === 'boolean' ? { allow: event.allow } : {}) })
          return
        case 'permission-dropped':
          if (typeof event.requestId !== 'string') return
          push({ e: 'chat', panel, what: 'dropped', req: hash(event.requestId) })
          return
        case 'permission-auto-allowed':
          push({ e: 'chat', panel, what: 'auto-allowed', tool: toolClass(event.toolName) })
          return
        case 'result':
          push({ e: 'chat', panel, what: 'done' })
          return
        case 'turn': {
          // A delivered user turn, once. A queued one is not sent yet, and
          // the same turn can be re-announced when it is dequeued.
          const turn = typeof event.turn === 'object' && event.turn !== null ? event.turn as { id?: unknown; role?: unknown; delivery?: unknown } : null
          if (turn === null || turn.role !== 'user' || turn.delivery !== undefined || typeof turn.id !== 'string') return
          const key = `${event.id}\u0000${turn.id}`
          if (sentIds.has(key)) return
          if (sentIds.size >= MAX_SENT_IDS) sentIds.clear()
          sentIds.add(key)
          push({ e: 'chat', panel, what: 'sent' })
          return
        }
        default:
          return
      }
    },
    panels(panels) {
      if (!on()) return
      const counts: Record<string, number> = {}
      for (const p of panels) {
        // An absent kind is a terminal: layout files before M9b never wrote one.
        const kind = p.kind === undefined ? 'terminal' : typeof p.kind === 'string' && /^[a-z][a-z0-9-]{0,31}$/.test(p.kind) ? p.kind : 'other'
        counts[kind] = (counts[kind] ?? 0) + 1
      }
      const key = JSON.stringify(Object.keys(counts).sort().map((k) => [k, counts[k]]))
      if (key === lastCounts) return
      lastCounts = key
      push({ e: 'panels', counts })
    },
    flushSync() {
      flush()
    },
    flush
  }
}

/** Whether a directory holds any log file, for a report script's first look. */
export function hasEventLog(dir: string): boolean {
  return existsSync(dir) && readdirSync(dir).some((n) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(n))
}
