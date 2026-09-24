/**
 * M138. The pool's PRODUCTION CALLER — main's half between a workflow's Run
 * and M132's `startPool`, which until now had no caller at all (the M132 log's
 * "known gap": the module was checked end to end against a fake and nothing in
 * the app spent money through it).
 *
 * The division of labour is the board's (M113, `board:add`): the RENDERER owns
 * the workspace it renders, so every worker is a chat panel the renderer
 * mints on request (`pool:mint`, an ephemeral reply channel) and main never
 * writes a panel. Main owns what main already owns — the list file (`readList`:
 * an absolute path the user named; there is no Places gate because a pool has
 * no teammate), the ceilings and the spend (M82's, read
 * LIVE on every pump through the injected `limits`/`spend`), the send (the
 * ordinary `AgentSessionManager.send`, so M82's queue and budget apply
 * unchanged and a worker is a chat like any other), and the engine's two
 * signals: `finished(id)` from the manager's OWN events (a worker's `ready`
 * after a turn, or its exit — never a timer, never a guess) and `tick()` on
 * every budget event, so a crossing between two finishes is caught.
 *
 * One live pool per (template, block): a second Run while one is live is
 * REFUSED BY NAME rather than doubled — two pools over one list would each
 * pull every item. `stop` interrupts every live worker and kills none: a
 * killed agent loses its turn, and a stop is a stop (M82's rule, kept).
 *
 * Pure over its deps so `verify:agent-session pool.2a–d` drives it with a
 * fake agents seam and a fake mint under plain node; `main/index.ts` wires
 * the real ones.
 *
 * M316. THE JOURNAL. Everything above lived in this closure and nowhere
 * else, so a crash, a quit or a closed window mid-list lost the list's
 * progress. With a `journal` every transition — a worker asked for, minted,
 * SENT (journalled before the send: `shared/job-journal.ts`'s first rule),
 * finished, exited, refused, interrupted — is written through to the job
 * record before anything else happens, and `resume` runs a job again over
 * exactly the items a recovery plan chose. Without one the caller behaves as
 * it always did; the journal observes, it never decides a pump.
 *
 * M316 also changes ONE behaviour, and it is the window's: a mint the
 * renderer cannot answer (no window, a canvas that did not reply) ends the
 * pool without INTERRUPTING the workers already in flight. They were minted
 * and sent while the window was there; closing it should cost the items not
 * yet started, never the turns already paid for. Those workers DRAIN — their
 * `ready` is still heard and journalled, and the job stays live until the
 * last one ends. A refused SEND still interrupts everything (M138 critic M2):
 * the manager has said it cannot drive a worker, and that is not the window.
 */
import type { PoolNode } from '../shared/workflow-nodes'
import {
  attemptEnded, attemptMinted, attemptMinting, attemptSending, itemFinished, jobEnded, jobResumed, newJob,
  type JobRecord, type RepoMark
} from '../shared/job-journal'
import { startPool, type PoolEvent, type PoolHandle } from './pool-runner'

export interface PoolMintRequest {
  templateId: string
  key: string
  cwd: string
  prompt: string
  item: string
  index: number
}

export type PoolMintReply = { kind: 'ok'; id: string } | { kind: 'refused'; reason: string }

/** Every engine event, addressed: the renderer's Runs tab keys on template and block. */
export interface PoolCallerEvent {
  templateId: string
  key: string
  event: PoolEvent
}

export interface PoolStartRequest {
  templateId: string
  key: string
  node: PoolNode
  /**
   * True when the template hands the pool's workers off into a collect.
   * M78's join fires when the edges PRESENT at the first arrival are all in,
   * and a worker minted later joins an expected set that grew under it — so
   * a joined pool must mint every worker at once, and one that cannot
   * (items > the width the live ceiling allows) is refused BY NAME here
   * rather than joining wrong quietly.
   */
  joined?: true
}

export type PoolStartResult = { kind: 'started'; jobId?: string } | { kind: 'refused'; reason: string }

/** The slice of `AgentSessionManager` the caller needs — a fake in the suite, the real one in main. */
/** The manager's own answer to a send; anything but `sent`/`queued` means the worker will never turn. */
// The named members, and any OTHER word the manager may answer with (its
// send returns a string it owns) — typed so the named members survive as
// documentation instead of collapsing the union to `string`.
export type PoolSendResult = 'sent' | 'queued' | 'no-session' | 'refused-backend' | 'refused-sandbox' | 'refused-images' | 'refused-budget' | (string & Record<never, never>)

export interface PoolAgents {
  send: (id: string, text: string) => PoolSendResult | { kind?: string }
  interrupt: (id: string) => boolean
  subscribe: (cb: (event: { id: string; type: string; status?: string }) => void) => () => void
}

export interface PoolCallerDeps {
  agents: PoolAgents
  mint: (req: PoolMintRequest) => Promise<PoolMintReply>
  readList: (path: string) => { kind: 'ok'; items: string[] } | { kind: 'error'; why: string }
  limits: () => { maxConcurrent: number; budgetUsd: number; budgetWindowPercent?: number }
  spend: () => number
  windowUtil?: () => number | undefined
  emit: (event: PoolCallerEvent) => void
  /** M316. Absent: no record is kept, and the caller is M138's exactly. */
  journal?: PoolJournal
}

/** M316. The slice of the job store the caller writes through. */
export interface PoolJournal {
  get: (id: string) => JobRecord | undefined
  put: (job: JobRecord) => void
  update: (id: string, f: (job: JobRecord) => JobRecord) => JobRecord | undefined
  newId: () => string
  now: () => number
  /** The repository under the pool's cwd at the job's first start; null when it is not one. */
  repoMark?: (cwd: string) => Promise<RepoMark | null>
}

export interface PoolCaller {
  start: (req: PoolStartRequest) => PoolStartResult
  /** True when a live pool was stopped; false when there was none. */
  stop: (templateId: string, key: string) => boolean
  list: () => { templateId: string; key: string; workers: string[] }[]
  /** M316. Run a journalled job again over exactly these item indices (a recovery plan's). */
  resume: (jobId: string, indices: readonly number[]) => PoolStartResult
  /** M316. Jobs whose pool is live in THIS process, draining workers included. */
  liveJobs: () => Set<string>
  /** M316. Re-send a live job's state as pool events, for a renderer that came back without it. */
  replay: (jobId: string) => boolean
}

/** The worker's first message: the block's prompt, then the item on its own line. */
export function workerMessage(prompt: string, item: string): string {
  return prompt.trim() === '' ? item : `${prompt.trim()}\n\nItem: ${item}`
}

const addressOf = (templateId: string, key: string): string => `${templateId} ${key}`

export function createPoolCaller(deps: PoolCallerDeps): PoolCaller {
  interface Live {
    templateId: string; key: string; handle: PoolHandle; workers: Set<string>; ended: boolean
    /** M316. The journalled job, when there is a journal. */
    jobId?: string
    /** M316. Worker id -> the job item index it was minted for. */
    itemOf: Map<string, number>
    /** M316. This pass's item indices, in order — what a replay may name. */
    indices: number[]
    /** M316. Ended by a mint refusal with workers still in flight: they finish, and nothing interrupts them. */
    draining: boolean
    drainWhy?: string
  }
  const live = new Map<string, Live>()
  const draining = new Set<Live>()
  const journal = deps.journal
  const record = (entry: Live, f: (job: JobRecord) => JobRecord): void => {
    if (journal === undefined || entry.jobId === undefined) return
    journal.update(entry.jobId, f)
  }
  // A draining pool's last worker has ended: NOW the job's end is written,
  // with the refusal that began the drain. Written earlier, `jobEnded` would
  // have closed the draining workers' attempts as interrupted under them.
  const settleDrain = (entry: Live): void => {
    if (!entry.draining || entry.workers.size > 0) return
    draining.delete(entry)
    const why = entry.drainWhy ?? 'the pool ended'
    record(entry, (job) => jobEnded(job, { kind: 'refused', why }, journal!.now()))
  }
  // One subscription for every pool, installed once: a worker's event is
  // routed by id to the pool that minted it, and an id no pool minted moves
  // nothing (pool.2b's last clause).
  const byWorker = new Map<string, Live>()
  deps.agents.subscribe((event) => {
    if (event.type === 'budget') { for (const l of live.values()) l.handle.tick(); return }
    const owner = byWorker.get(event.id)
    if (owner === undefined) return
    if (event.type === 'status' && (event.status === 'ready' || event.status === 'exited')) {
      // The worker was sent its item at mint, so the first `ready` after
      // that is its turn's end. A worker that exited is finished the same
      // way — its item is not retried, and `finished` says so. M316: the
      // JOURNAL tells the two apart — an exit without a `ready` is a turn
      // that did not end, and recovery asks a person about it.
      byWorker.delete(event.id)
      owner.workers.delete(event.id)
      const idx = owner.itemOf.get(event.id)
      if (idx !== undefined && journal !== undefined) {
        record(owner, (job) => attemptEnded(job, idx, event.status === 'ready' ? 'finished' : 'exited', journal.now(), event.status === 'ready' ? { evidence: { source: 'event' } } : { why: 'its process exited before the turn ended' }))
      }
      if (owner.draining) {
        if (idx !== undefined) deps.emit({ templateId: owner.templateId, key: owner.key, event: { kind: 'finished', id: event.id } })
        settleDrain(owner)
        return
      }
      owner.handle.finished(event.id)
    }
  })

  /** One pass of a pool over `items`, journalled under `jobId` when there is one. */
  const launch = (req: { templateId: string; key: string; node: PoolNode }, items: ReadonlyArray<{ index: number; item: string }>, jobId: string | undefined): PoolStartResult => {
    const address = addressOf(req.templateId, req.key)
    const entry: Live = {
      templateId: req.templateId, key: req.key, handle: { stop: () => {}, finished: () => {}, tick: () => {} }, workers: new Set(), ended: false,
      ...(jobId === undefined ? {} : { jobId }), itemOf: new Map(), indices: items.map((i) => i.index), draining: false
    }
    live.set(address, entry)
    let mintIndex = 0
    // The pool's END by refusal (critic M1/M2): said once with the reason,
    // every live worker interrupted (never killed), the engine stopped with
    // its own `stopped` MUTED — a `stopped — by hand` after a refusal would
    // tell the user they stopped a pool they never touched. M316: `drain`
    // (a mint the window could not answer) lets the in-flight workers finish.
    const endRefused = (why: string, drain = false): void => {
      if (entry.ended) return
      entry.ended = true
      deps.emit({ templateId: req.templateId, key: req.key, event: { kind: 'refused', why } })
      if (drain && entry.workers.size > 0) {
        entry.draining = true
        entry.drainWhy = why
        draining.add(entry)
      } else {
        for (const id of entry.workers) { deps.agents.interrupt(id); byWorker.delete(id) }
      }
      live.delete(address)
      entry.handle.stop()
      if (!entry.draining) record(entry, (job) => jobEnded(job, { kind: 'refused', why }, journal!.now()))
    }
    const handle = startPool(req.node, {
      readList: () => ({ kind: 'ok', items: items.map((i) => i.item) }),
      limits: deps.limits,
      spend: deps.spend,
      ...(deps.windowUtil === undefined ? {} : { windowUtil: deps.windowUtil }),
      createWorker: async (prompt, item, passIdx) => {
        if (entry.ended) return { id: '' }
        const idx = items[passIdx]?.index ?? passIdx
        record(entry, (job) => attemptMinting(job, idx, journal!.now()))
        const reply = await deps.mint({ templateId: req.templateId, key: req.key, cwd: req.node.cwd, prompt, item, index: mintIndex++ })
        // Ended while the mint was pending: `jobEnded` already closed this
        // attempt as interrupted, and nothing will be sent to the worker.
        if (entry.ended) return { id: '' }
        if (reply.kind === 'refused') {
          // The renderer could not mint: the engine gets no worker and the
          // pool ends, saying why — never a pool that waits on a worker that
          // will not come. The engine still expects a worker; an empty id is
          // one it will never hear `finished` for, and every event after this
          // is muted. Throwing here would reject the pump's own await.
          record(entry, (job) => attemptEnded(job, idx, 'mint-refused', journal!.now(), { why: reply.reason }))
          endRefused(reply.reason, true)
          return { id: '' }
        }
        entry.workers.add(reply.id)
        entry.itemOf.set(reply.id, idx)
        byWorker.set(reply.id, entry)
        record(entry, (job) => attemptSending(attemptMinted(job, idx, reply.id, journal!.now()), idx, journal!.now()))
        // The send's answer is read (critic M2): a worker whose send the
        // manager refused — no session, a backend without a sandbox, the
        // budget — will never turn, so `finished` would never fire and its
        // item would sit `started` until Stop. The pool ends by name instead.
        const answer = deps.agents.send(reply.id, workerMessage(prompt, item))
        const word = typeof answer === 'string' ? answer : String((answer as { kind?: string })?.kind ?? answer)
        if (word !== 'sent' && word !== 'queued') {
          record(entry, (job) => attemptEnded(job, idx, 'send-refused', journal!.now(), { why: word }))
          endRefused(`worker ${reply.id} for ${item} could not be sent its item: ${word}`)
        }
        return { id: reply.id }
      },
      interrupt: (id) => { if (!entry.draining) deps.agents.interrupt(id) },
      onEvent: (event) => {
        if (entry.ended) return
        deps.emit({ templateId: req.templateId, key: req.key, event })
        if (event.kind === 'stopped' || event.kind === 'refused') {
          entry.ended = true
          for (const id of entry.workers) byWorker.delete(id)
          live.delete(address)
          record(entry, (job) => jobEnded(job, event.kind === 'stopped' ? { kind: 'stopped', why: event.why } : { kind: 'refused', why: event.why }, journal!.now()))
        }
      }
    })
    entry.handle = handle
    return { kind: 'started', ...(jobId === undefined ? {} : { jobId }) }
  }

  const start = (req: PoolStartRequest): PoolStartResult => {
    const address = addressOf(req.templateId, req.key)
    if (live.has(address)) return { kind: 'refused', reason: `${req.key} is already running — stop it before running it again` }
    const listed = deps.readList(req.node.list)
    if (listed.kind === 'error') return { kind: 'refused', reason: `could not read the work list: ${listed.why}` }
    if (req.joined === true) {
      const atOnce = Math.min(req.node.width, deps.limits().maxConcurrent || Infinity)
      if (listed.items.length > atOnce) return { kind: 'refused', reason: `${req.key} hands off into a collect, so every worker must run at once — ${listed.items.length} items but only ${atOnce} at a time (raise the width${deps.limits().maxConcurrent ? ' and agents.maxConcurrent' : ''}, shorten the list, or drop the collect edge)` }
    }
    let jobId: string | undefined
    if (journal !== undefined) {
      jobId = journal.newId()
      journal.put(newJob({ id: jobId, templateId: req.templateId, key: req.key, node: { prompt: req.node.prompt, list: req.node.list, cwd: req.node.cwd, width: req.node.width }, items: listed.items, joined: req.joined === true, at: journal.now() }))
      const id = jobId
      // Best effort and after the fact: the mark is evidence for the account,
      // and a pool never waits on git to start.
      journal.repoMark?.(req.node.cwd).then((mark) => {
        if (mark !== null) journal.update(id, (job) => (job.repoAtStart === undefined ? { ...job, repoAtStart: mark } : job))
      }, () => { /* no mark, no claim */ })
    }
    return launch(req, listed.items.map((item, index) => ({ index, item })), jobId)
  }

  const resume = (jobId: string, indices: readonly number[]): PoolStartResult => {
    if (journal === undefined) return { kind: 'refused', reason: 'no job journal is kept' }
    const job = journal.get(jobId)
    if (job === undefined) return { kind: 'refused', reason: 'that job is no longer recorded' }
    if (live.has(addressOf(job.templateId, job.key)) || [...draining].some((d) => d.jobId === jobId)) return { kind: 'refused', reason: `${job.key} is already running — stop it before running it again` }
    const items: Array<{ index: number; item: string }> = []
    for (const idx of indices) {
      const it = job.items.find((i) => i.index === idx)
      if (it === undefined) return { kind: 'refused', reason: `${job.key} has no item ${idx}` }
      // The last guard, below every plan: a finished item is never run again,
      // whoever asked.
      if (itemFinished(it)) return { kind: 'refused', reason: `${it.item} already finished — it is not run twice` }
      items.push({ index: it.index, item: it.item })
    }
    if (items.length === 0) return { kind: 'refused', reason: `nothing of ${job.key} to run` }
    journal.update(jobId, (j) => jobResumed(j, journal.now()))
    const node: PoolNode = { kind: 'pool', width: job.node.width, list: job.node.list, prompt: job.node.prompt, cwd: job.node.cwd, dx: 0, dy: 0 } as PoolNode
    return launch({ templateId: job.templateId, key: job.key, node }, items, jobId)
  }

  const stop = (templateId: string, key: string): boolean => {
    const entry = live.get(addressOf(templateId, key))
    if (entry === undefined) return false
    entry.handle.stop()
    return true
  }

  const list = (): { templateId: string; key: string; workers: string[] }[] =>
    [...live.values()].map((l) => ({ templateId: l.templateId, key: l.key, workers: [...l.workers] }))

  const liveJobs = (): Set<string> => {
    const out = new Set<string>()
    for (const l of [...live.values(), ...draining]) if (l.jobId !== undefined) out.add(l.jobId)
    return out
  }

  const replay = (jobId: string): boolean => {
    const entry = [...live.values(), ...draining].find((l) => l.jobId === jobId)
    const job = journal?.get(jobId)
    if (entry === undefined || job === undefined) return false
    const emit = (event: PoolEvent): void => deps.emit({ templateId: entry.templateId, key: entry.key, event })
    // In this pass's own order, so the rows come back where they were.
    for (const idx of entry.indices) {
      const item = job.items.find((i) => i.index === idx)
      if (item === undefined) continue
      const last = item.attempts[item.attempts.length - 1]
      if (last?.workerId !== undefined && (last.endedAt === undefined || last.outcome === 'finished' || last.outcome === 'exited')) {
        emit({ kind: 'started', id: last.workerId, item: item.item })
        if (last.endedAt !== undefined) emit({ kind: 'finished', id: last.workerId })
      } else if (last === undefined && !entry.draining) {
        // A draining pool pulls nothing more: its unstarted items are not
        // queued, and a `queued` row would promise work that will not come.
        emit({ kind: 'queued', item: item.item, reason: 'concurrency' })
      }
    }
    return true
  }

  return { start, stop, list, resume, liveJobs, replay }
}
