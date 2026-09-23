import type { TokenTotals } from './cost'
import { parseReviewIdentity, type ReviewIdentity } from './review-identity'
/**
 * M52. One row of the run ledger — what a panel ran and how it ended. Shared
 * so the contract can name it; the writer is main/run-ledger.ts. No output
 * bytes, ever: metadata only.
 */
export interface RunRow {
  panelId: string
  command: string
  cwd: string
  startedAt: number
  endedAt: number
  exitCode: number | null
  /**
   * M286. The M285 content identity the panel's review subject had when the
   * command ENDED — what this command tested. Absent for every row written
   * before M286, for a panel with no baseline (not a repository, never
   * captured) and when the read failed; a reader turns absence into
   * `unknown`, never into "current".
   */
  tested?: ReviewIdentity
  /**
   * M306. A REFERENCE to this run's exact output in `check-output/`, never the
   * output itself — the row stays metadata, so the rule above still holds.
   * Absent for every row before M306, for an agent CLI's commands (no marks)
   * and when capture was not wired; a reader then says it has no record.
   */
  outputId?: string
}

/**
 * M142 (backlog #19's history half). A panel's usage, written ONCE when the
 * panel is killed or its process exits, beside the command rows — history
 * rides #46's ledger, never a third store. Per-model token totals, never a
 * price: the RENDERER prices with the summary's own rule (`costOf`), so a
 * price-table change re-prices last week the same way it re-prices today.
 */
export interface UsageRow {
  kind: 'usage'
  panelId: string
  byModel: Record<string, TokenTotals>
  turns: number
  endedAt: number
}

/**
 * M300. WHAT HAPPENED, AND WHERE THE EVIDENCE IS — the durable half of
 * Orchestrate's timeline.
 *
 * It rides THIS stream rather than a store of its own, and that is the whole
 * design decision: `main/run-ledger.ts` already has the per-file write queue,
 * the count-tracked ring trim, the malformed-line rule and a reader, all of
 * them measured. A second store would have to earn each of those again, and
 * would have to be mirrored into `scripts/panels-harness.cjs` — the Phase B
 * trap where an optional dep `stores.ts` gains and the harness lacks makes
 * the Electron tier prove a different app, silently.
 *
 * REFERENCES ONLY, and the type is the enforcement, exactly as `RunRow` has
 * nowhere to put output bytes: `paths` are paths, never contents, and there
 * is no field a body could be dropped into. So this row cannot grow into a
 * disclosure surface, and the retention bound stays a ROW COUNT rather than
 * a size nobody watches. Per-command output capture is Phase F's, by name.
 *
 * `source` is REQUIRED and is never inferred. The plan's rule is that an
 * agent's claim is not a structured result; a row that could not say where
 * it came from would erase exactly that distinction on the way to disk.
 */
export type OrchEventKind =
  /** A task or a session was dispatched. */
  | 'dispatch'
  /** A tool ran inside a turn. */
  | 'tool'
  /** A permission request was answered — or expired unanswered. */
  | 'permission'
  /** A check/command outcome that is NOT a shell `133;C` row (a watcher's, say). */
  | 'check'
  /** Files changed, recorded as paths. */
  | 'artifact'
  /** A handoff fired, was skipped, or was refused. */
  | 'handoff'
  /** A session started, ended, was interrupted, or was found gone at launch. */
  | 'session'

/**
 * Where a fact came from. `person` is a human action in this app, `app` is
 * this app's own bookkeeping (a reconcile, a trim), and the rest name the
 * producer. An `agent` row is an agent's CLAIM and reads as one.
 */
export type OrchEventSource = 'person' | 'app' | 'agent' | 'shell' | 'watcher' | 'provider'

export interface EventRow {
  kind: 'event'
  /**
   * The EXECUTION this row belongs to — minted per dispatch and never reused,
   * which is what makes M302's rerun a new execution rather than a rewrite of
   * an old one. Rows keep the id they were written with, forever.
   */
  runId: string
  at: number
  event: OrchEventKind
  source: OrchEventSource
  /** One line, in the product's words. */
  title: string
  detail?: string
  /** The work item this belongs to, when a task owns it. */
  itemId?: string
  /** The panel/session that produced it, when one did. */
  panelId?: string
  /** What revision this concerned, when it was known. Absent reads `unknown`, never "current". */
  tested?: ReviewIdentity
  /** REFERENCES. Paths, never content — the reader resolves them live or says it could not. */
  paths?: string[]
  /**
   * M301. The row's subject key in the WRITER's own namespace — a handoff's
   * `from:to`, say. It exists so a reader can match a row to the thing it is
   * about without parsing `title`, which is prose and is allowed to change.
   * Opaque to this module: nothing here interprets it, and a reader that does
   * not know a key's namespace ignores it.
   */
  key?: string
}

/**
 * M300. THE TRIM'S OWN ROW: a gap that says it is a gap.
 *
 * Without it a trimmed ledger is indistinguishable from a quiet one, and an
 * empty timeline reads as "nothing happened" — the exact fabrication this
 * phase exists to stop. The trim writes one of these as the FIRST line of the
 * rewritten file, so it sits where the dropped rows were; a second trim MERGES
 * into the leading gap rather than appending another, or the markers would
 * themselves grow without bound.
 */
export interface GapRow {
  kind: 'gap'
  /** When the trim ran. */
  at: number
  /** How many lines it dropped, counting any it merged. */
  dropped: number
}

export type LedgerRow = RunRow | UsageRow | EventRow | GapRow

/**
 * M300. What a timeline read is asked for. Every field narrows; an empty
 * filter is the whole record, which only the diagnostics path wants.
 */
export interface TimelineFilter {
  panelIds?: readonly string[]
  itemId?: string
  runId?: string
}

export type TimelineEntry =
  | { kind: 'command'; row: RunRow }
  | { kind: 'event'; row: EventRow }
  | { kind: 'gap'; row: GapRow }

export interface TimelineRead {
  /** Newest first. */
  entries: TimelineEntry[]
  /**
   * M300. The scan consumed the whole file, so the caller may say "this is the
   * beginning of the record". FALSE means only that the limit filled first —
   * never that there is nothing older. A reader that treats the two the same
   * is the fabrication this phase exists to stop.
   */
  reachedStart: boolean
}

const ORCH_EVENT_KINDS: readonly string[] = ['dispatch', 'tool', 'permission', 'check', 'artifact', 'handoff', 'session']
const ORCH_EVENT_SOURCES: readonly string[] = ['person', 'app', 'agent', 'shell', 'watcher', 'provider']

/**
 * An event row read back. The record rules, per field: a malformed row costs
 * that row, and a malformed OPTIONAL field costs the field and keeps the row —
 * the same split `list()` applies to `tested`. An unknown `event` or `source`
 * from a later build drops the row rather than being coerced into a kind this
 * build would then display as a fact of the wrong sort.
 */
export function parseEventRow(raw: unknown): EventRow | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (r.kind !== 'event') return null
  if (typeof r.runId !== 'string' || r.runId === '') return null
  if (typeof r.at !== 'number' || !Number.isFinite(r.at)) return null
  if (typeof r.title !== 'string' || r.title === '') return null
  if (typeof r.event !== 'string' || !ORCH_EVENT_KINDS.includes(r.event)) return null
  if (typeof r.source !== 'string' || !ORCH_EVENT_SOURCES.includes(r.source)) return null
  const paths = Array.isArray(r.paths) ? r.paths.filter((p): p is string => typeof p === 'string' && p !== '') : undefined
  // M306. `tested` was written and never read back, so every event's revision
  // came home as `unknown`. A malformed stamp costs the field, like `list()`.
  const tested = parseReviewIdentity(r.tested)
  return {
    kind: 'event',
    runId: r.runId,
    at: r.at,
    event: r.event as OrchEventKind,
    source: r.source as OrchEventSource,
    title: r.title,
    ...(typeof r.detail === 'string' && r.detail !== '' ? { detail: r.detail } : {}),
    ...(typeof r.itemId === 'string' && r.itemId !== '' ? { itemId: r.itemId } : {}),
    ...(typeof r.panelId === 'string' && r.panelId !== '' ? { panelId: r.panelId } : {}),
    ...(tested === undefined ? {} : { tested }),
    ...(paths !== undefined && paths.length > 0 ? { paths } : {}),
    ...(typeof r.key === 'string' && r.key !== '' ? { key: r.key } : {})
  }
}

/** A gap row read back; same rules. A gap that dropped nothing is not a gap. */
export function parseGapRow(raw: unknown): GapRow | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (r.kind !== 'gap') return null
  if (typeof r.at !== 'number' || !Number.isFinite(r.at)) return null
  if (typeof r.dropped !== 'number' || !Number.isFinite(r.dropped) || r.dropped <= 0) return null
  return { kind: 'gap', at: r.at, dropped: Math.round(r.dropped) }
}

/** A usage row read back: the record rules — a malformed one costs that row. */
export function parseUsageRow(raw: unknown): UsageRow | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (r.kind !== 'usage' || typeof r.panelId !== 'string' || typeof r.turns !== 'number' || typeof r.endedAt !== 'number') return null
  if (typeof r.byModel !== 'object' || r.byModel === null) return null
  const byModel: Record<string, TokenTotals> = {}
  for (const [model, t] of Object.entries(r.byModel as Record<string, unknown>)) {
    if (typeof t !== 'object' || t === null) return null
    const tt = t as Record<string, unknown>
    const n = (k: string): number | null => (typeof tt[k] === 'number' && Number.isFinite(tt[k]) ? (tt[k] as number) : null)
    const input = n('input'), output = n('output'), cacheWrite = n('cacheWrite'), cacheRead = n('cacheRead')
    if (input === null || output === null || cacheWrite === null || cacheRead === null) return null
    byModel[model] = { input, output, cacheWrite, cacheRead }
  }
  return { kind: 'usage', panelId: r.panelId, byModel, turns: r.turns, endedAt: r.endedAt }
}
