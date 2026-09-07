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
 */
import type { PoolNode } from '../shared/workflow-nodes'
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

export type PoolStartResult = { kind: 'started' } | { kind: 'refused'; reason: string }

/** The slice of `AgentSessionManager` the caller needs — a fake in the suite, the real one in main. */
/** The manager's own answer to a send; anything but `sent`/`queued` means the worker will never turn. */
export type PoolSendResult = 'sent' | 'queued' | 'no-session' | 'refused-backend' | 'refused-sandbox' | 'refused-images' | 'refused-budget' | string

export interface PoolAgents {
  send: (id: string, text: string) => PoolSendResult | { kind?: string }
  interrupt: (id: string) => boolean
  subscribe: (cb: (event: { id: string; type: string; status?: string }) => void) => () => void
}

export interface PoolCallerDeps {
  agents: PoolAgents
  mint: (req: PoolMintRequest) => Promise<PoolMintReply>
  readList: (path: string) => { kind: 'ok'; items: string[] } | { kind: 'error'; why: string }
  limits: () => { maxConcurrent: number; budgetUsd: number }
  spend: () => number
  emit: (event: PoolCallerEvent) => void
}

export interface PoolCaller {
  start: (req: PoolStartRequest) => PoolStartResult
  /** True when a live pool was stopped; false when there was none. */
  stop: (templateId: string, key: string) => boolean
  list: () => { templateId: string; key: string; workers: string[] }[]
}

/** The worker's first message: the block's prompt, then the item on its own line. */
export function workerMessage(prompt: string, item: string): string {
  return prompt.trim() === '' ? item : `${prompt.trim()}\n\nItem: ${item}`
}

const addressOf = (templateId: string, key: string): string => `${templateId} ${key}`

export function createPoolCaller(deps: PoolCallerDeps): PoolCaller {
  interface Live { templateId: string; key: string; handle: PoolHandle; workers: Set<string>; ended: boolean }
  const live = new Map<string, Live>()
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
      // way — its item is not retried, and `finished` says so.
      byWorker.delete(event.id)
      owner.workers.delete(event.id)
      owner.handle.finished(event.id)
    }
  })

  const start = (req: PoolStartRequest): PoolStartResult => {
    const address = addressOf(req.templateId, req.key)
    if (live.has(address)) return { kind: 'refused', reason: `${req.key} is already running — stop it before running it again` }
    const listed = deps.readList(req.node.list)
    if (listed.kind === 'error') return { kind: 'refused', reason: `could not read the work list: ${listed.why}` }
    if (req.joined === true) {
      const atOnce = Math.min(req.node.width, deps.limits().maxConcurrent || Infinity)
      if (listed.items.length > atOnce) return { kind: 'refused', reason: `${req.key} hands off into a collect, so every worker must run at once — ${listed.items.length} items but only ${atOnce} at a time (raise the width${deps.limits().maxConcurrent ? ' and agents.maxConcurrent' : ''}, shorten the list, or drop the collect edge)` }
    }
    const entry: Live = { templateId: req.templateId, key: req.key, handle: { stop: () => {}, finished: () => {}, tick: () => {} }, workers: new Set(), ended: false }
    live.set(address, entry)
    let index = 0
    // The pool's END by refusal (critic M1/M2): said once with the reason,
    // every live worker interrupted (never killed), the engine stopped with
    // its own `stopped` MUTED — a `stopped — by hand` after a refusal would
    // tell the user they stopped a pool they never touched.
    const endRefused = (why: string): void => {
      if (entry.ended) return
      entry.ended = true
      deps.emit({ templateId: req.templateId, key: req.key, event: { kind: 'refused', why } })
      for (const id of entry.workers) { deps.agents.interrupt(id); byWorker.delete(id) }
      live.delete(address)
      entry.handle.stop()
    }
    const handle = startPool(req.node, {
      readList: () => listed,
      limits: deps.limits,
      spend: deps.spend,
      createWorker: async (prompt, item) => {
        if (entry.ended) return { id: '' }
        const reply = await deps.mint({ templateId: req.templateId, key: req.key, cwd: req.node.cwd, prompt, item, index: index++ })
        if (entry.ended) return { id: '' }
        if (reply.kind === 'refused') {
          // The renderer could not mint: the engine gets no worker and the
          // pool ends, saying why — never a pool that waits on a worker that
          // will not come. The engine still expects a worker; an empty id is
          // one it will never hear `finished` for, and every event after this
          // is muted. Throwing here would reject the pump's own await.
          endRefused(reply.reason)
          return { id: '' }
        }
        entry.workers.add(reply.id)
        byWorker.set(reply.id, entry)
        // The send's answer is read (critic M2): a worker whose send the
        // manager refused — no session, a backend without a sandbox, the
        // budget — will never turn, so `finished` would never fire and its
        // item would sit `started` until Stop. The pool ends by name instead.
        const answer = deps.agents.send(reply.id, workerMessage(prompt, item))
        const word = typeof answer === 'string' ? answer : String((answer as { kind?: string })?.kind ?? answer)
        if (word !== 'sent' && word !== 'queued') endRefused(`worker ${reply.id} for ${item} could not be sent its item: ${word}`)
        return { id: reply.id }
      },
      interrupt: (id) => { deps.agents.interrupt(id) },
      onEvent: (event) => {
        if (entry.ended) return
        deps.emit({ templateId: req.templateId, key: req.key, event })
        if (event.kind === 'stopped' || event.kind === 'refused') {
          entry.ended = true
          for (const id of entry.workers) byWorker.delete(id)
          live.delete(address)
        }
      }
    })
    entry.handle = handle
    return { kind: 'started' }
  }

  const stop = (templateId: string, key: string): boolean => {
    const entry = live.get(addressOf(templateId, key))
    if (entry === undefined) return false
    entry.handle.stop()
    return true
  }

  const list = (): { templateId: string; key: string; workers: string[] }[] =>
    [...live.values()].map((l) => ({ templateId: l.templateId, key: l.key, workers: [...l.workers] }))

  return { start, stop, list }
}
