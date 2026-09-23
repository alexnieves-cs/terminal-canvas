import { WATCH_KILL_GRACE_MS, WATCH_TAIL_BYTES, type WatchTrigger } from '../shared/watch-trigger'
import type { ReviewIdentity } from '../shared/review-identity'
import { createOutputCapture, mintCheckRunId, type CheckOutputRecord, type OutputCapture } from '../shared/check-output'

/**
 * M84. THE WATCHER'S RUNNER — one command per watcher, run when its trigger
 * says so, with no PTY anywhere in it.
 *
 * A watcher is a process node that is not a terminal: nothing here allocates
 * a pty, a WebGL context or a slot in `LIVE_BUDGET`, which is the whole
 * reason a canvas can hold twenty watchers and four agents. The process seam
 * is INJECTED (`agent-runner.ts`'s shape), so every arm below — the coalesce,
 * the exits, the tail, the ledger row — runs under plain node in
 * `verify:file watch.1` with no child process at all.
 *
 * ARMING is not here. This module answers "run it, and tell me how it went";
 * `main/index.ts` arms the four kinds of trigger (a directory watch, a git
 * directory watch, an interval, another panel's ending) and calls `fire`.
 * Splitting it that way is what lets the trigger table be tested with a fake
 * clock and the runner be tested with a fake process.
 */

export interface WatchSpawnSpec {
  cwd: string
  command: string
  args: readonly string[]
}

export interface WatchHandlers {
  onData: (chunk: string) => void
  onExit: (code: number | null, signal: string | null) => void
}

export interface WatchProcess {
  kill(signal?: string): void
}

export type WatchStatus = 'not-started' | 'running' | 'passed' | 'exited'

export interface WatchState {
  status: WatchStatus
  /** The last finished run's code; absent while running and before the first run. */
  exitCode?: number | null
  /** The signal that ended the last run, when one did. */
  signal?: string | null
  /** The last run's output, capped at WATCH_TAIL_BYTES and keeping the END. */
  tail: string
  startedAt?: number
  endedAt?: number
  /** A run is waiting for the one in flight to finish. */
  pending: boolean
  /** M286. The content identity of the tree at `cwd` (against its HEAD) as the last run ended — what it tested. Absent when unreadable or not a repository. */
  tested?: ReviewIdentity
  /**
   * M306. The run's id in the check-output store — set when the run STARTS,
   * so the body can link the record the moment the run ends. Absent when no
   * store is wired (every harness that predates M306).
   */
  outputId?: string
}

export interface WatchRecord {
  id: string
  cwd: string
  command: string
  args: readonly string[]
  trigger: WatchTrigger
}

export interface WatchLedger {
  append(row: { panelId: string; command: string; cwd: string; startedAt: number; endedAt: number; exitCode: number | null; tested?: ReviewIdentity; outputId?: string }): void
}

export interface WatchRunnerDeps {
  spawn: (spec: WatchSpawnSpec, handlers: WatchHandlers) => WatchProcess
  now: () => number
  /** Injected so the SIGKILL escalation is drivable without waiting two real seconds. */
  setTimer?: (fn: () => void, ms: number) => { cancel: () => void }
  ledger: WatchLedger
  onState: (id: string, state: WatchState) => void
  /** M286. See `RunsDeps.identityOf`: the tree at `cwd` against its HEAD, asked as the run ends. Optional; absent stamps nothing. */
  identityOf?: (cwd: string) => Promise<ReviewIdentity | undefined>
  /**
   * M306. Where each run's exact output goes, whole, as it ends. Optional with
   * an inert default like `identityOf` — and like it, a dep `watch-handlers.ts`
   * wires must be mirrored in `scripts/panels-harness.cjs`, or the Electron
   * tier proves an app whose checks have no records.
   */
  outputs?: { put(record: CheckOutputRecord): void }
}

export interface WatchRunner {
  add(record: WatchRecord): void
  /** M84. Every watcher, disarmed and killed — the quit arm. */
  disposeAll(): void
  remove(id: string): void
  fire(id: string): void
  stop(id: string): void
  stateOf(id: string): WatchState | undefined
  recordOf(id: string): WatchRecord | undefined
  ids(): string[]
}

interface Entry {
  record: WatchRecord
  state: WatchState
  proc: WatchProcess | null
  /** The pending SIGKILL, cancelled when the process actually ends. */
  kill: { cancel: () => void } | null
  /** The process this entry's callbacks are allowed to speak for (the M61 identity rule). */
  epoch: number
  /** M306. The run in flight's whole output (head and tail), when a store is wired. */
  capture: OutputCapture | null
}

const EMPTY: WatchState = { status: 'not-started', tail: '', pending: false }

export function createWatchRunner(deps: WatchRunnerDeps): WatchRunner {
  const entries = new Map<string, Entry>()
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms)
    t.unref?.()
    return { cancel: () => clearTimeout(t) }
  })

  /** The second signal, and the only one a process cannot ignore. */
  const killHard = (entry: Entry): void => {
    entry.kill = null
    if (entry.proc === null) return
    entry.proc.kill('SIGKILL')
  }

  const publish = (id: string, entry: Entry): void => {
    deps.onState(id, { ...entry.state })
  }

  const start = (id: string, entry: Entry): void => {
    const startedAt = deps.now()
    entry.epoch += 1
    const epoch = entry.epoch
    const outputId = deps.outputs === undefined ? undefined : mintCheckRunId(id, startedAt)
    entry.capture = deps.outputs === undefined ? null : createOutputCapture()
    const capture = entry.capture
    entry.state = { status: 'running', tail: '', startedAt, pending: false, ...(outputId === undefined ? {} : { outputId }) }
    publish(id, entry)
    entry.proc = deps.spawn(
      { cwd: entry.record.cwd, command: entry.record.command, args: entry.record.args },
      {
        onData: (chunk) => {
          // Identity, not liveness: a chunk from the PREVIOUS process arriving
          // after a restart would otherwise append to the new run's tail, and
          // the body would show output from a run that already ended.
          if (epoch !== entry.epoch) return
          capture?.push(chunk)
          const joined = entry.state.tail + chunk
          // The END, never the start: a failing command says why on its last
          // lines, and a head-capped tail throws away the answer.
          entry.state = { ...entry.state, tail: joined.length > WATCH_TAIL_BYTES ? joined.slice(joined.length - WATCH_TAIL_BYTES) : joined }
          publish(id, entry)
        },
        onExit: (code, signal) => {
          if (epoch !== entry.epoch) return
          const endedAt = deps.now()
          entry.proc = null
          entry.kill?.cancel()
          entry.kill = null
          // M286. The stamp is asked for as the exit lands, and applied to the
          // state and the ledger row when it answers — the exit itself is
          // published at once, so a slow git never delays the state word.
          const stampEpoch = entry.epoch
          void deps.identityOf?.(entry.record.cwd).then((tested) => {
            if (tested === undefined || stampEpoch !== entry.epoch || entry.state.status === 'running' || entry.state.endedAt !== endedAt) return
            entry.state = { ...entry.state, tested }
            publish(id, entry)
          }, () => { /* an unreadable tree stamps nothing */ })
          // A SIGNAL is a failure. `code` is null for a signalled process, and
          // a truthiness test on it reads a kill as a pass — a green watcher
          // over a process somebody killed.
          const passed = signal === null && code === 0
          const pending = entry.state.pending
          entry.state = {
            status: passed ? 'passed' : 'exited',
            exitCode: code,
            signal,
            tail: entry.state.tail,
            ...(entry.state.startedAt === undefined ? {} : { startedAt: entry.state.startedAt }),
            endedAt,
            pending: false,
            ...(outputId === undefined ? {} : { outputId })
          }
          // Metadata only, like every other ledger row: no output bytes reach
          // the LEDGER from here — M306's record is its own file, referenced
          // by `outputId`, never inlined. The row waits for the stamp (a
          // failed read writes it unstamped), so the ledger says what the
          // run tested rather than only that it ran.
          const row = {
            panelId: id,
            command: [entry.record.command, ...entry.record.args].join(' '),
            cwd: entry.record.cwd,
            startedAt: entry.state.startedAt ?? endedAt,
            endedAt,
            exitCode: code,
            ...(outputId === undefined ? {} : { outputId })
          }
          // M306. The record and the row land TOGETHER, after the same stamp,
          // so the output a person opens names the revision the row claims.
          const land = (tested: ReviewIdentity | undefined): void => {
            if (capture !== null && outputId !== undefined) deps.outputs?.put(outputRecordOf(outputId, id, row, signal, capture, tested))
            deps.ledger.append(tested === undefined ? row : { ...row, tested })
          }
          if (deps.identityOf === undefined) land(undefined)
          else void deps.identityOf(entry.record.cwd).then(land, () => land(undefined))
          publish(id, entry)
          // The coalesced run, once — however many triggers arrived.
          if (pending) start(id, entry)
        }
      }
    )
  }

  return {
    disposeAll() {
      for (const id of [...entries.keys()]) this.remove(id)
    },

    add(record) {
      const existing = entries.get(record.id)
      if (existing !== undefined) { existing.record = record; return }
      entries.set(record.id, { record, state: { ...EMPTY }, proc: null, kill: null, epoch: 0, capture: null })
    },

    /**
     * Disarm and forget. A run in FLIGHT is recorded before it is killed: the
     * run really happened, and a ledger with no row for it disagrees with
     * `stop`, which does record one (M84's verifier). The epoch bump after
     * the row is what keeps the dead process's own callbacks silent.
     */
    remove(id) {
      const entry = entries.get(id)
      if (entry === undefined) return
      if (entry.proc !== null && entry.state.status === 'running') {
        const endedAt = deps.now()
        const outputId = entry.state.outputId
        const row = {
          panelId: id,
          command: [entry.record.command, ...entry.record.args].join(' '),
          cwd: entry.record.cwd,
          startedAt: entry.state.startedAt ?? endedAt,
          endedAt,
          exitCode: null,
          ...(outputId === undefined ? {} : { outputId })
        }
        // M306. What it printed before it was removed is still evidence.
        if (entry.capture !== null && outputId !== undefined) deps.outputs?.put(outputRecordOf(outputId, id, row, 'removed', entry.capture, undefined))
        deps.ledger.append(row)
      }
      entry.epoch += 1
      entry.kill?.cancel()
      killHard(entry)
      entries.delete(id)
    },

    /**
     * A trigger. While a run is in flight this sets ONE pending flag rather
     * than queueing: five saves during a test run mean "run again when you
     * can", once. A queue would make a watcher fall further behind the harder
     * its user works, which is why people turn watchers off.
     */
    fire(id) {
      const entry = entries.get(id)
      if (entry === undefined) return
      if (entry.state.status === 'running') {
        if (!entry.state.pending) {
          entry.state = { ...entry.state, pending: true }
          publish(id, entry)
        }
        return
      }
      start(id, entry)
    },

    /**
     * Stop the run in flight. SIGTERM, then SIGKILL after the grace: a
     * command that ignores SIGTERM (a shell wrapping a test runner is the
     * ordinary case) would otherwise leave a node stuck on `working` with a
     * Stop control that does nothing (M84's verifier). The pending flag is
     * cleared AND PUBLISHED — clearing it without a publish leaves the body
     * still saying another run is queued.
     */
    stop(id) {
      const entry = entries.get(id)
      if (entry === undefined || entry.proc === null) return
      entry.state = { ...entry.state, pending: false }
      publish(id, entry)
      entry.proc.kill('SIGTERM')
      entry.kill?.cancel()
      entry.kill = setTimer(() => { killHard(entry) }, WATCH_KILL_GRACE_MS)
    },

    stateOf(id) {
      const entry = entries.get(id)
      return entry === undefined ? undefined : { ...entry.state }
    },

    recordOf(id) {
      return entries.get(id)?.record
    },

    ids() {
      return [...entries.keys()]
    }
  }
}

/** M306. One run's record, from the row it shares its facts with. */
function outputRecordOf(
  runId: string,
  panelId: string,
  row: { command: string; cwd: string; startedAt: number; endedAt: number; exitCode: number | null },
  signal: string | null,
  capture: OutputCapture,
  tested: ReviewIdentity | undefined
): CheckOutputRecord {
  return {
    v: 1,
    runId,
    panelId,
    source: 'watcher',
    command: row.command,
    cwd: row.cwd,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    exitCode: row.exitCode,
    signal,
    ...(tested === undefined ? {} : { tested }),
    ...capture.snapshot()
  }
}

export { WATCH_TAIL_BYTES }
