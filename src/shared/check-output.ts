import { parseReviewIdentity, type ReviewIdentity } from './review-identity'
import { stripAnsi } from './ansi'

/**
 * M306. ONE CHECK RUN'S EXACT OUTPUT — the evidence behind a status.
 *
 * Phase E handed per-command output capture to "Phase F by name", and the
 * decision it inherited was the right one for a LOG: a durable per-watcher
 * log is a second, worse scrollback, and output bytes in `runs.jsonl` would
 * put a command's output into the one file people paste into issues. This is
 * neither. It is one record PER RUN, in its own directory, reached by an
 * opaque id the ledger row carries as a REFERENCE (`RunRow.outputId`) — the
 * ledger stays metadata-only, and a failed test opens its own output, command,
 * directory, time and tested revision instead of whatever the terminal's tail
 * happens to hold by the time somebody looks.
 *
 * BOUNDED, and says so. A run that prints more than the cap keeps its HEAD
 * (where a runner prints what it is about to do) and its TAIL (where it says
 * why it failed), and `elided` counts what fell between — a reader shows the
 * seam rather than presenting a clipped log as the whole of it. Sizes are in
 * string units (UTF-16), named `chars`, never called bytes.
 *
 * WHAT IS COVERED, by name: a watcher's run (`source: 'watcher'`) and a shell
 * command between OSC 133 C and D marks in a login-shell terminal
 * (`source: 'shell'`). A command an agent CLI runs inside its own process
 * has no marks and no record; it stays the agent's CLAIM (`CheckClaim`),
 * which is exactly the distinction a reviewer needs to see.
 */

export const CHECK_OUTPUT_HEAD_CHARS = 64 * 1024
export const CHECK_OUTPUT_TAIL_CHARS = 448 * 1024
/** How many run records the store keeps before the oldest is pruned. */
export const CHECK_OUTPUT_MAX_RECORDS = 200

export type CheckOutputSource = 'watcher' | 'shell' | 'setup'

export interface CheckOutputRecord {
  v: 1
  runId: string
  panelId: string
  source: CheckOutputSource
  command: string
  cwd: string
  startedAt: number
  endedAt: number
  /** Null for a signalled process (a signal is a FAILURE — M84) and for a run removed in flight. */
  exitCode: number | null
  signal: string | null
  /** What the run tested, stamped as it ended. Absent reads `unknown`, never "current". */
  tested?: ReviewIdentity
  /** Everything the run printed, in chars — including what was elided. */
  chars: number
  head: string
  tail: string
  /** Chars dropped between `head` and `tail`. Zero means `head + tail` IS the whole output. */
  elided: number
}

/** A run id is a FILENAME in main, so its alphabet is closed: nothing else is ever read. */
export const CHECK_RUN_ID_RE = /^[A-Za-z0-9_-]{1,160}$/

export function isCheckRunId(id: unknown): id is string {
  return typeof id === 'string' && CHECK_RUN_ID_RE.test(id)
}

/**
 * Mint a run id. The panel id is folded into the closed alphabet rather than
 * trusted, and the start time plus a per-process counter keeps two runs of
 * one watcher in the same millisecond distinct.
 */
let mintCount = 0
export function mintCheckRunId(panelId: string, startedAt: number): string {
  mintCount = (mintCount + 1) % 1_000_000
  const safe = panelId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 100)
  return `${safe}-${Math.max(0, Math.floor(startedAt)).toString(36)}-${mintCount.toString(36)}`
}

export interface OutputCapture {
  push(chunk: string): void
  /** The capture as it stands; the capture keeps accepting chunks after. */
  snapshot(): { chars: number; head: string; tail: string; elided: number }
}

/**
 * The head-and-tail accumulator. The tail is kept as chunks and compacted
 * only when it has grown past twice its cap, so a chatty run costs amortised
 * O(1) per chunk rather than a re-slice of half a megabyte on every write.
 */
export function createOutputCapture(headCap = CHECK_OUTPUT_HEAD_CHARS, tailCap = CHECK_OUTPUT_TAIL_CHARS): OutputCapture {
  let head = ''
  let tail: string[] = []
  let tailLen = 0
  let chars = 0
  const compact = (): void => {
    const joined = tail.join('')
    const kept = joined.length > tailCap ? joined.slice(joined.length - tailCap) : joined
    tail = kept === '' ? [] : [kept]
    tailLen = kept.length
  }
  return {
    push(chunk) {
      if (chunk === '') return
      chars += chunk.length
      let rest = chunk
      if (head.length < headCap) {
        const take = Math.min(headCap - head.length, rest.length)
        head += rest.slice(0, take)
        rest = rest.slice(take)
      }
      if (rest === '') return
      tail.push(rest)
      tailLen += rest.length
      if (tailLen > tailCap * 2) compact()
    },
    snapshot() {
      compact()
      const t = tail[0] ?? ''
      return { chars, head, tail: t, elided: Math.max(0, chars - head.length - t.length) }
    }
  }
}

/** The text a reader shows: the whole output, or head, the seam, and tail. */
export function checkOutputText(r: Pick<CheckOutputRecord, 'head' | 'tail' | 'elided'>): string {
  if (r.elided <= 0) return r.head + r.tail
  return `${r.head}\n… ${r.elided.toLocaleString('en-US')} characters not kept between here and the end of the run …\n${r.tail}`
}

/**
 * What a reader DISPLAYS: the stored bytes stay exact (colour and all), and
 * this is the one place they are made readable — escapes stripped, and a
 * carriage-return redraw (a progress bar, a spinner) collapsed to the state
 * it ended in, so a test runner's ticker is one line rather than five hundred.
 */
export function checkOutputDisplay(r: Pick<CheckOutputRecord, 'head' | 'tail' | 'elided'>): string {
  return stripAnsi(checkOutputText(r))
    .split('\n')
    .map((line) => {
      const t = line.endsWith('\r') ? line.slice(0, -1) : line
      const at = t.lastIndexOf('\r')
      return at === -1 ? t : t.slice(at + 1)
    })
    .join('\n')
}

/** A record read back from disk. Malformed required fields cost the record; a malformed `tested` costs the field. */
export function parseCheckOutputRecord(raw: unknown): CheckOutputRecord | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (r.v !== 1 || !isCheckRunId(r.runId)) return null
  if (typeof r.panelId !== 'string' || typeof r.command !== 'string' || typeof r.cwd !== 'string') return null
  if (r.source !== 'watcher' && r.source !== 'shell' && r.source !== 'setup') return null
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const startedAt = num(r.startedAt), endedAt = num(r.endedAt), chars = num(r.chars), elided = num(r.elided)
  if (startedAt === null || endedAt === null || chars === null || elided === null) return null
  if (typeof r.head !== 'string' || typeof r.tail !== 'string') return null
  const tested = parseReviewIdentity(r.tested)
  return {
    v: 1,
    runId: r.runId,
    panelId: r.panelId,
    source: r.source,
    command: r.command,
    cwd: r.cwd,
    startedAt,
    endedAt,
    exitCode: typeof r.exitCode === 'number' ? r.exitCode : null,
    signal: typeof r.signal === 'string' ? r.signal : null,
    ...(tested === undefined ? {} : { tested }),
    chars,
    head: r.head,
    tail: r.tail,
    elided
  }
}

/** What a read of one record answers. `missing` is pruned or never written; the reader says which it cannot tell. */
export type CheckOutputRead =
  | { kind: 'ok'; record: CheckOutputRecord }
  | { kind: 'missing' }
  | { kind: 'unreadable'; why: string }
