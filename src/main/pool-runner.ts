/**
 * M131. N workers over a shared list, each pulling the next item until the
 * list is empty. The act's ONE new engine.
 *
 * It takes NO ceiling of its own. M82's agents.maxConcurrent is read LIVE on
 * every pump, and a send past it QUEUES on the same queue an in-flight turn
 * uses with reason 'concurrency' — the pool does not get its own queue, its
 * own limit, or its own opinion about concurrency. Every subsystem here that
 * invented its own limit eventually disagreed with the shipped one.
 *
 * M82's BUDGET applies unchanged, and this comment exists because a pool is
 * the single fastest way to spend money in this application. A crossing
 * INTERRUPTS every worker in flight and never kills one: a killed agent loses
 * its turn, and a budget is a stop.
 *
 * The loop is M97's shape widened from one agent to N — MAIN enforces the
 * stop, and any renderer chip is a projection that can never move it.
 *
 * `limits`/`spend` are read live on every PUMP, and a pump happens on three
 * occasions: the initial start, a worker's `finished(id)` (which pulls the
 * next item), and the handle's `tick()` — an explicit re-check a caller
 * drives on the same cadence M82 already reads its ceilings on (every send
 * and every result elsewhere in the app), so a budget crossing is caught
 * even between two items finishing, not just at the moment one does.
 */
import type { PoolNode } from '../shared/workflow-nodes'

export interface PoolDeps {
  /** Reads the shared list file. A failure is a REFUSAL, before any worker exists. */
  readList: (path: string) => { kind: 'ok'; items: string[] } | { kind: 'error'; why: string }
  /** M82's ceilings, read live — never captured at start. */
  limits: () => { maxConcurrent: number; budgetUsd: number }
  spend: () => number
  createWorker: (prompt: string, item: string) => Promise<{ id: string }>
  interrupt: (id: string) => void
  onEvent: (e: PoolEvent) => void
}

export type PoolEvent =
  | { kind: 'started'; id: string; item: string }
  | { kind: 'queued'; item: string; reason: 'concurrency' }
  | { kind: 'finished'; id: string }
  | { kind: 'refused'; why: string }
  | { kind: 'stopped'; why: 'empty' | 'budget' | 'by-hand' }

export interface PoolHandle {
  stop: () => void
  /** A worker naturally ending pulls the next item. */
  finished: (id: string) => void
  /** An external re-check of the live ceiling/budget with nothing else changed. */
  tick: () => void
}

export function startPool(node: PoolNode, deps: PoolDeps): PoolHandle {
  const noop: PoolHandle = { stop: () => {}, finished: () => {}, tick: () => {} }

  const listed = deps.readList(node.list)
  if (listed.kind === 'error') {
    // Refused BY NAME before a worker is minted. A pool that starts four
    // agents and then discovers it has nothing for them has already spent
    // money on the mistake.
    deps.onEvent({ kind: 'refused', why: `could not read the work list: ${listed.why}` })
    return noop
  }

  const pending = listed.items.map((item, idx) => ({ idx, item }))
  const live = new Set<string>()
  const announcedQueued = new Set<number>()
  let stopped = false
  let pumping = false

  const pump = async (): Promise<void> => {
    if (stopped) return
    // Re-entrancy guard: `finished` and `tick` can each call pump() while an
    // earlier pump() is still awaiting createWorker. A second concurrent
    // pass would double-dequeue pending items against the same ceiling.
    if (pumping) return
    pumping = true
    try {
      const { maxConcurrent, budgetUsd } = deps.limits() // LIVE, every pump
      if (budgetUsd > 0 && deps.spend() >= budgetUsd) {
        const inFlight = [...live]
        live.clear()
        for (const id of inFlight) deps.interrupt(id) // interrupt, never kill
        stopped = true
        deps.onEvent({ kind: 'stopped', why: 'budget' })
        return
      }
      const ceiling = maxConcurrent > 0 ? Math.min(node.width, maxConcurrent) : node.width
      while (live.size < ceiling && pending.length > 0) {
        const next = pending.shift() as { idx: number; item: string }
        const { id } = await deps.createWorker(node.prompt, next.item)
        if (stopped) return
        live.add(id)
        deps.onEvent({ kind: 'started', id, item: next.item })
      }
      for (const p of pending) {
        if (announcedQueued.has(p.idx)) continue
        announcedQueued.add(p.idx)
        deps.onEvent({ kind: 'queued', item: p.item, reason: 'concurrency' })
      }
      if (live.size === 0 && pending.length === 0) {
        stopped = true
        deps.onEvent({ kind: 'stopped', why: 'empty' })
      }
    } finally {
      pumping = false
    }
  }

  const finished = (id: string): void => {
    if (stopped || !live.has(id)) return
    live.delete(id)
    deps.onEvent({ kind: 'finished', id })
    void pump()
  }

  void pump()

  return {
    stop: () => {
      if (stopped) return
      stopped = true
      const inFlight = [...live]
      live.clear()
      for (const id of inFlight) deps.interrupt(id)
      deps.onEvent({ kind: 'stopped', why: 'by-hand' })
    },
    finished,
    tick: () => { void pump() }
  }
}
