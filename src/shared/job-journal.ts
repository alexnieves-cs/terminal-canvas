/**
 * M316. A JOB, RECORDED WELL ENOUGH TO RECOVER.
 *
 * Restoring panels and recovering a job are different problems. Brief #20
 * (`persistence.ts`) answers the first — which terminals reattached, which
 * ended. This module answers the second for the one engine that runs many
 * steps and kept all of its state in memory: M132's pool. Its pending queue
 * and its live workers were locals of `startPool`, so a crash, a quit or a
 * closed window mid-list left no record of which items ran, which finished,
 * and which were never touched — and the only way to "continue" was Run
 * again, which re-sends every item, finished ones included.
 *
 * The record keeps, per item, its QUEUE POSITION (`index`, the list's own
 * order), what it waits on (`after`, and the job's `joined` — a collect after
 * the block that waits on every item), and every ATTEMPT with its evidence.
 * Four rules, each of which fails silently without it:
 *
 * - **The send is the external write, and it is journalled BEFORE it
 *   happens.** A worker that was sent its item may have changed files,
 *   spent money and answered; running it again is a repeat. Recorded after
 *   the send, a crash between the two would leave "minted, never sent" on
 *   disk for work that ran — and recovery would re-send it as safe. Recorded
 *   before, the same crash leaves "sent" for work that did not run, and the
 *   worst outcome is a person asked about an item that needed no asking.
 * - **Nothing that finished is run again, by any choice.** `recoveryPlan`
 *   refuses by name rather than filtering quietly, so a caller that asks for
 *   a finished item learns it asked.
 * - **An attempt that was sent and did not finish needs a PERSON.** It may
 *   have done half its work. `continue` never includes it; `retry` includes
 *   it only when named item by item.
 * - **A saved `running` is a claim about a process, and the process may be
 *   gone.** `reconcileJob` asks the live facts first — is the pool live in
 *   this process, does the worker's transcript show a finished turn — and
 *   only then trusts the file. A transcript that recorded a result upgrades
 *   the attempt to finished (evidence: transcript), because the `ready` that
 *   would have said so can be lost in the crash that killed the app.
 *
 * Pure: no fs, no electron. `verify:jobs`.
 */

export type AttemptOutcome =
  /** Asked the renderer for a worker; no answer recorded yet. */
  | 'minting'
  /** A worker panel exists; its item has not been sent. */
  | 'minted'
  /** The item was sent (or was about to be — see the header's first rule). */
  | 'running'
  | 'finished'
  /** The worker's process ended without the `ready` that ends a turn. */
  | 'exited'
  | 'mint-refused'
  | 'send-refused'
  /** Stopped by hand, by the budget, by a refusal elsewhere, or by the app going away. */
  | 'interrupted'

export interface JobEvidence {
  /** `event`: the manager's own `ready`. `transcript`: a result found on disk at reconcile. */
  source: 'event' | 'transcript'
  turns?: number
  costUsd?: number
}

export interface JobAttempt {
  /** 1-based, per item. */
  n: number
  workerId?: string
  startedAt: number
  /** Set BEFORE the send is made (the header's first rule). */
  sentAt?: number
  endedAt?: number
  outcome: AttemptOutcome
  why?: string
  evidence?: JobEvidence
}

export interface JobItem {
  /** The item's position in the work list — its queue position, for ever. */
  index: number
  item: string
  /** Indices of items this one waits on. A pool's items are independent; kept so a record says so. */
  after: number[]
  attempts: JobAttempt[]
  /** A person chose to leave this item undone. */
  abandoned?: true
}

export type JobState = 'running' | 'done' | 'incomplete' | 'stopped' | 'refused' | 'interrupted' | 'abandoned'

export interface RepoMark { head: string; dirty: number }

export interface JobRecord {
  id: string
  kind: 'pool'
  templateId: string
  key: string
  node: { prompt: string; list: string; cwd: string; width: number }
  /** A collect after this block waits on EVERY item at once; a partial resume cannot join it. */
  joined?: true
  createdAt: number
  updatedAt: number
  state: JobState
  why?: string
  /** What took a `running` job away, when that is known. */
  interruptedBy?: 'restart' | 'window'
  /** The repository under `node.cwd` when the job first started, when it is one. */
  repoAtStart?: RepoMark
  /** How many times the job has been started or resumed. */
  passes: number
  items: JobItem[]
}

export const JOBS_MAX = 20

export const STOPPED_BY_HAND = 'stopped by hand'

// ---------------------------------------------------------------------------
// The reader. A file this app wrote, maybe by an older version: a malformed
// job costs itself, never the file, and a half-parsed attempt is dropped
// rather than guessed — a guessed `finished` is how a repeat is avoided
// wrongly, and a guessed `running` is how one is made.

const OUTCOMES: ReadonlySet<string> = new Set(['minting', 'minted', 'running', 'finished', 'exited', 'mint-refused', 'send-refused', 'interrupted'])
const STATES: ReadonlySet<string> = new Set(['running', 'done', 'incomplete', 'stopped', 'refused', 'interrupted', 'abandoned'])

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isStr = (v: unknown): v is string => typeof v === 'string'

function parseAttempt(raw: unknown): JobAttempt | null {
  if (!isRec(raw) || !isNum(raw.n) || !isNum(raw.startedAt) || !isStr(raw.outcome) || !OUTCOMES.has(raw.outcome)) return null
  const a: JobAttempt = { n: raw.n, startedAt: raw.startedAt, outcome: raw.outcome as AttemptOutcome }
  if (isStr(raw.workerId)) a.workerId = raw.workerId
  if (isNum(raw.sentAt)) a.sentAt = raw.sentAt
  if (isNum(raw.endedAt)) a.endedAt = raw.endedAt
  if (isStr(raw.why)) a.why = raw.why
  if (isRec(raw.evidence) && (raw.evidence.source === 'event' || raw.evidence.source === 'transcript')) {
    a.evidence = { source: raw.evidence.source, ...(isNum(raw.evidence.turns) ? { turns: raw.evidence.turns } : {}), ...(isNum(raw.evidence.costUsd) ? { costUsd: raw.evidence.costUsd } : {}) }
  }
  return a
}

function parseItem(raw: unknown): JobItem | null {
  if (!isRec(raw) || !isNum(raw.index) || !isStr(raw.item) || !Array.isArray(raw.attempts)) return null
  const attempts: JobAttempt[] = []
  for (const a of raw.attempts) {
    const parsed = parseAttempt(a)
    // One unreadable attempt makes the item's history unknowable: a dropped
    // `running` would read as never tried and be re-sent. The item goes.
    if (parsed === null) return null
    attempts.push(parsed)
  }
  const after = Array.isArray(raw.after) ? raw.after.filter(isNum) : []
  return { index: raw.index, item: raw.item, after, attempts, ...(raw.abandoned === true ? { abandoned: true as const } : {}) }
}

export function parseJob(raw: unknown): JobRecord | null {
  if (!isRec(raw) || !isStr(raw.id) || raw.kind !== 'pool' || !isStr(raw.templateId) || !isStr(raw.key)) return null
  const n = raw.node
  if (!isRec(n) || !isStr(n.prompt) || !isStr(n.list) || !isStr(n.cwd) || !isNum(n.width)) return null
  if (!isNum(raw.createdAt) || !isNum(raw.updatedAt) || !isStr(raw.state) || !STATES.has(raw.state) || !Array.isArray(raw.items)) return null
  const items: JobItem[] = []
  for (const i of raw.items) {
    const parsed = parseItem(i)
    // A job missing an item would offer to "continue" without it — and a
    // job that cannot say what it holds cannot be recovered honestly.
    if (parsed === null) return null
    items.push(parsed)
  }
  const job: JobRecord = {
    id: raw.id, kind: 'pool', templateId: raw.templateId, key: raw.key,
    node: { prompt: n.prompt, list: n.list, cwd: n.cwd, width: n.width },
    createdAt: raw.createdAt, updatedAt: raw.updatedAt, state: raw.state as JobState,
    passes: isNum(raw.passes) ? raw.passes : 1, items
  }
  if (raw.joined === true) job.joined = true
  if (isStr(raw.why)) job.why = raw.why
  if (raw.interruptedBy === 'restart' || raw.interruptedBy === 'window') job.interruptedBy = raw.interruptedBy
  if (isRec(raw.repoAtStart) && isStr(raw.repoAtStart.head) && isNum(raw.repoAtStart.dirty)) job.repoAtStart = { head: raw.repoAtStart.head, dirty: raw.repoAtStart.dirty }
  return job
}

/** The journal file: `{ version: 1, jobs: [...] }`. Anything else is an empty journal, not a throw. */
export function parseJournal(raw: unknown): JobRecord[] {
  if (!isRec(raw) || raw.version !== 1 || !Array.isArray(raw.jobs)) return []
  const out: JobRecord[] = []
  for (const j of raw.jobs) { const job = parseJob(j); if (job !== null) out.push(job) }
  return out
}

// ---------------------------------------------------------------------------
// Transitions. Each returns a NEW record; the store writes the result.

export function newJob(input: {
  id: string; templateId: string; key: string
  node: JobRecord['node']; items: readonly string[]; joined?: boolean; at: number
}): JobRecord {
  return {
    id: input.id, kind: 'pool', templateId: input.templateId, key: input.key,
    node: { ...input.node }, ...(input.joined === true ? { joined: true as const } : {}),
    createdAt: input.at, updatedAt: input.at, state: 'running', passes: 1,
    items: input.items.map((item, index) => ({ index, item, after: [], attempts: [] }))
  }
}

const touchItem = (job: JobRecord, index: number, at: number, f: (item: JobItem) => JobItem): JobRecord => ({
  ...job, updatedAt: at, items: job.items.map((i) => (i.index === index ? f(i) : i))
})

const lastAttempt = (item: JobItem): JobAttempt | undefined => item.attempts[item.attempts.length - 1]

const patchLast = (item: JobItem, patch: Partial<JobAttempt>): JobItem => {
  const last = lastAttempt(item)
  if (last === undefined) return item
  return { ...item, attempts: [...item.attempts.slice(0, -1), { ...last, ...patch }] }
}

/** A worker is being asked for: a new attempt, before the renderer has answered. */
export function attemptMinting(job: JobRecord, index: number, at: number): JobRecord {
  return touchItem(job, index, at, (i) => ({ ...i, attempts: [...i.attempts, { n: i.attempts.length + 1, startedAt: at, outcome: 'minting' }] }))
}

export function attemptMinted(job: JobRecord, index: number, workerId: string, at: number): JobRecord {
  return touchItem(job, index, at, (i) => patchLast(i, { workerId, outcome: 'minted' }))
}

/** Written BEFORE the send is made. */
export function attemptSending(job: JobRecord, index: number, at: number): JobRecord {
  return touchItem(job, index, at, (i) => patchLast(i, { sentAt: at, outcome: 'running' }))
}

export function attemptEnded(job: JobRecord, index: number, outcome: Exclude<AttemptOutcome, 'minting' | 'minted' | 'running'>, at: number, extra?: { why?: string; evidence?: JobEvidence }): JobRecord {
  return touchItem(job, index, at, (i) => {
    const last = lastAttempt(i)
    // An attempt that already ended keeps its ending: a late `ready` after
    // a stop must not rewrite `interrupted` as `finished`, nor the reverse.
    if (last === undefined || last.endedAt !== undefined) return i
    // A refused send was never made: the journalled `sentAt` came before
    // the send, and the manager's refusal says it did not happen.
    const unsend = outcome === 'send-refused' ? { sentAt: undefined } : {}
    return patchLast(i, { ...unsend, endedAt: at, outcome, ...(extra?.why === undefined ? {} : { why: extra.why }), ...(extra?.evidence === undefined ? {} : { evidence: extra.evidence }) })
  })
}

/** Every attempt still open is ended `interrupted`, with the reason. The pool's end, or the app's. */
export function interruptOpen(job: JobRecord, why: string, at: number): JobRecord {
  return {
    ...job, updatedAt: at,
    items: job.items.map((i) => {
      const last = lastAttempt(i)
      if (last === undefined || last.endedAt !== undefined) return i
      return patchLast(i, { endedAt: at, outcome: 'interrupted', why })
    })
  }
}

/** Where the job's items stand, whatever the pool's own word was. */
export function settledState(job: JobRecord): 'done' | 'incomplete' {
  return job.items.every((i) => i.abandoned === true || itemFinished(i)) ? 'done' : 'incomplete'
}

/**
 * The pool ended. `empty` means the engine ran out of items it was GIVEN —
 * which, for a resume that deliberately left items out, is not every item,
 * so the job's own word is taken from its items.
 */
export function jobEnded(job: JobRecord, how: { kind: 'stopped'; why: 'empty' | 'budget' | 'by-hand' } | { kind: 'refused'; why: string }, at: number): JobRecord {
  const why = how.kind === 'refused' ? how.why : how.why === 'budget' ? 'the budget ceiling was crossed' : how.why === 'by-hand' ? STOPPED_BY_HAND : undefined
  const closed = interruptOpen(job, why ?? 'the pool ended', at)
  const state: JobState = how.kind === 'refused' ? 'refused' : how.why === 'empty' ? settledState(closed) : 'stopped'
  const { why: _drop, ...rest } = closed
  return { ...rest, state, ...(why === undefined ? {} : { why }) }
}

/**
 * The file was read at launch and this job says `running`. The process that
 * ran it is gone, whatever it was doing; its open attempts end `interrupted`
 * here, and `reconcileJob` later decides which of them actually finished.
 */
export function markInterrupted(job: JobRecord, by: 'restart' | 'window', at: number): JobRecord {
  if (job.state !== 'running') return job
  const why = by === 'restart' ? 'the app closed while it ran' : 'the window closed while it ran'
  const closed = interruptOpen(job, why, at)
  return { ...closed, state: 'interrupted', interruptedBy: by, why }
}

export function abandonJob(job: JobRecord, at: number): JobRecord {
  const closed = interruptOpen(job, 'abandoned', at)
  const { why: _drop, ...rest } = closed
  return { ...rest, state: 'abandoned', items: closed.items.map((i) => (itemFinished(i) ? i : { ...i, abandoned: true as const })) }
}

/** The job is running again over some of its items. */
export function jobResumed(job: JobRecord, at: number): JobRecord {
  const { why: _w, interruptedBy: _i, ...rest } = job
  return { ...rest, state: 'running', updatedAt: at, passes: job.passes + 1 }
}

// ---------------------------------------------------------------------------
// Classification and reconcile.

export function itemFinished(item: JobItem): boolean {
  return item.attempts.some((a) => a.outcome === 'finished')
}

/**
 * - `done`: an attempt finished. Never run again.
 * - `running`: an attempt is open and the pool is live in this process.
 * - `pending`: never attempted. `continue` runs it.
 * - `safe-retry`: every attempt ended before its item was sent — nothing
 *   ran, so running it is not a repeat.
 * - `needs-you`: an attempt was SENT and did not finish; it may have done
 *   part of its work. Retried only when a person names it.
 * - `blocked`: waits on an item that is not done.
 * - `abandoned`: a person left it.
 */
export type ItemStatus = 'done' | 'running' | 'pending' | 'safe-retry' | 'needs-you' | 'blocked' | 'abandoned'

export function itemStatus(item: JobItem, job: Pick<JobRecord, 'items'>, live: boolean): ItemStatus {
  if (itemFinished(item)) return 'done'
  if (item.abandoned === true) return 'abandoned'
  const last = lastAttempt(item)
  if (live && last !== undefined && last.endedAt === undefined) return 'running'
  const waits = item.after.some((idx) => { const dep = job.items.find((i) => i.index === idx); return dep === undefined || !itemFinished(dep) })
  if (item.attempts.length === 0) return waits ? 'blocked' : 'pending'
  if (item.attempts.some((a) => a.sentAt !== undefined)) return 'needs-you'
  return waits ? 'blocked' : 'safe-retry'
}

export interface ReconcileFacts {
  /** Is this job's pool live in THIS process (a closed and reopened window, a reload)? */
  live: boolean
  /** The worker's durable transcript: turns that ended, when any file exists. */
  transcript: (workerId: string) => { turns: number; costUsd?: number } | null
  now: number
}

/**
 * The saved record against what is actually there. Only ever UPGRADES an
 * attempt to finished on evidence; it never downgrades one, and a job live
 * in this process is left to its own events.
 */
export function reconcileJob(job: JobRecord, facts: ReconcileFacts): JobRecord {
  if (facts.live) return job
  let changed = false
  const items = job.items.map((item) => {
    if (itemFinished(item)) return item
    const attempts = item.attempts.map((a) => {
      if (a.outcome !== 'interrupted' && a.outcome !== 'running' && a.outcome !== 'exited') return a
      if (a.sentAt === undefined || a.workerId === undefined) return a
      const t = facts.transcript(a.workerId)
      if (t === null || t.turns < 1) return a
      changed = true
      const { why: _drop, ...rest } = a
      return { ...rest, outcome: 'finished' as const, endedAt: a.endedAt ?? facts.now, evidence: { source: 'transcript' as const, turns: t.turns, ...(t.costUsd === undefined ? {} : { costUsd: t.costUsd }) } }
    })
    return { ...item, attempts }
  })
  if (!changed) return job
  const next = { ...job, items, updatedAt: facts.now }
  // A job whose every item turned out finished is done, not interrupted.
  return next.state === 'interrupted' || next.state === 'incomplete' || next.state === 'stopped'
    ? (settledState(next) === 'done' ? { ...next, state: 'done' } : next)
    : next
}

// ---------------------------------------------------------------------------
// Choices and the plan.

export type RecoveryChoice = 'reconnect' | 'continue' | 'retry' | 'abandon'

export interface JobAccount {
  id: string
  templateId: string
  key: string
  state: JobState
  live: boolean
  counts: Record<ItemStatus, number>
  items: Array<{ index: number; item: string; status: ItemStatus; attempts: number; workerId?: string; note: string }>
  /** Sentences, in the order a person reads them: what survived, then what needs them. */
  lines: string[]
  choices: RecoveryChoice[]
}

export interface RepoNow { head: string; dirty: number }

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`

function itemNote(item: JobItem, status: ItemStatus): string {
  const last = lastAttempt(item)
  switch (status) {
    case 'done': {
      const f = item.attempts.find((a) => a.outcome === 'finished')
      return f?.evidence?.source === 'transcript' ? 'finished — found in its transcript' : 'finished'
    }
    case 'running': return 'running'
    case 'pending': return 'not started'
    case 'blocked': return 'waits on an unfinished item'
    case 'abandoned': return 'left undone'
    case 'safe-retry': return last?.outcome === 'mint-refused' ? `no worker was made${last.why ? ` — ${last.why}` : ''}` : last?.outcome === 'send-refused' ? `its worker was never sent the item${last.why ? ` — ${last.why}` : ''}` : 'stopped before its item was sent'
    case 'needs-you': return last?.outcome === 'exited' ? 'its worker exited mid-turn — it may have changed files' : `interrupted mid-turn${last?.why ? ` (${last.why})` : ''} — it may have changed files`
  }
}

/**
 * A job worth showing: anything not settled, or live and possibly unobserved.
 * A stop BY HAND is a decision already made in front of the person, and
 * offering to undo it on every launch would be nagging; a budget stop is
 * shown, because raising the ceiling is exactly when continuing makes sense.
 */
export function needsAccount(job: JobRecord, live: boolean): boolean {
  if (live) return true
  if (job.state === 'stopped' && job.why === STOPPED_BY_HAND) return false
  return job.state === 'interrupted' || job.state === 'incomplete' || job.state === 'stopped' || job.state === 'refused'
}

export function jobAccount(job: JobRecord, live: boolean, repo?: RepoNow | null): JobAccount {
  const counts: Record<ItemStatus, number> = { done: 0, running: 0, pending: 0, 'safe-retry': 0, 'needs-you': 0, blocked: 0, abandoned: 0 }
  const items = job.items.map((item) => {
    const status = itemStatus(item, job, live)
    counts[status] += 1
    const last = lastAttempt(item)
    return { index: item.index, item: item.item, status, attempts: item.attempts.length, ...(last?.workerId === undefined ? {} : { workerId: last.workerId }), note: itemNote(item, status) }
  })
  const lines: string[] = []
  const total = job.items.length
  const head = `${job.key}: ${counts.done} of ${plural(total, 'item')} finished`
  if (live) lines.push(`${head}, ${counts.running} running — it kept going in the background`)
  else lines.push(`${head}${job.why ? ` — ${job.why}` : ''}`)
  if (counts['needs-you'] > 0) lines.push(`${plural(counts['needs-you'], 'item was', 'items were')} mid-turn and may have changed files — look before retrying`)
  if (counts['safe-retry'] > 0) lines.push(`${plural(counts['safe-retry'], 'item')} never reached a worker — safe to retry`)
  if (counts.pending > 0) lines.push(`${plural(counts.pending, 'item')} not started`)
  if (repo !== undefined && repo !== null && job.repoAtStart !== undefined) {
    const moved = repo.head !== job.repoAtStart.head
    lines.push(`${job.node.cwd}: ${moved ? `HEAD moved ${job.repoAtStart.head.slice(0, 7)} → ${repo.head.slice(0, 7)}` : 'HEAD unchanged'}, ${plural(repo.dirty, 'uncommitted change')} now (${job.repoAtStart.dirty} when the job started)`)
  }
  if (job.joined === true && !live && counts.done < total) lines.push('a collect waits on every item at once, so this block cannot resume part-way — run the workflow again')
  const choices: RecoveryChoice[] = []
  if (live) choices.push('reconnect')
  else if (job.state !== 'done' && job.state !== 'abandoned') {
    if (job.joined !== true && counts.pending > 0) choices.push('continue')
    if (job.joined !== true && (counts['safe-retry'] > 0 || counts['needs-you'] > 0)) choices.push('retry')
    choices.push('abandon')
  }
  return { id: job.id, templateId: job.templateId, key: job.key, state: job.state, live, counts, items, lines, choices }
}

export type RecoveryPlan = { kind: 'ok'; indices: number[] } | { kind: 'refused'; reason: string }

/**
 * Which items a choice runs — and, as importantly, which it will not.
 *
 * - `continue`: the pending items. Nothing that was ever attempted.
 * - `retry` with no names: every `safe-retry` item (nothing of theirs ran).
 * - `retry` naming items: exactly those, which may include `needs-you` —
 *   the person looked. A named item that finished, runs, or does not exist
 *   refuses the WHOLE plan by name: half a plan is a silent surprise.
 */
export function recoveryPlan(job: JobRecord, live: boolean, choice: 'continue' | 'retry', named?: readonly number[]): RecoveryPlan {
  if (live) return { kind: 'refused', reason: `${job.key} is still running — reconnect to it instead` }
  if (job.state === 'done') return { kind: 'refused', reason: `${job.key} already finished every item` }
  if (job.state === 'abandoned') return { kind: 'refused', reason: `${job.key} was abandoned` }
  if (job.joined === true) return { kind: 'refused', reason: `${job.key} hands off into a collect that waits on every item at once — run the workflow again instead` }
  const status = new Map(job.items.map((i) => [i.index, itemStatus(i, job, false)]))
  if (choice === 'continue') {
    const indices = job.items.filter((i) => status.get(i.index) === 'pending').map((i) => i.index)
    return indices.length === 0 ? { kind: 'refused', reason: `${job.key} has no item that was never started` } : { kind: 'ok', indices }
  }
  if (named === undefined || named.length === 0) {
    const indices = job.items.filter((i) => status.get(i.index) === 'safe-retry').map((i) => i.index)
    return indices.length === 0 ? { kind: 'refused', reason: `${job.key} has no item that is safe to retry without looking — name the ones to run again` } : { kind: 'ok', indices }
  }
  const out: number[] = []
  for (const idx of named) {
    const s = status.get(idx)
    const label = job.items.find((i) => i.index === idx)?.item ?? `item ${idx}`
    if (s === undefined) return { kind: 'refused', reason: `${job.key} has no item ${idx}` }
    if (s === 'done') return { kind: 'refused', reason: `${label} already finished — it is not run twice` }
    if (s === 'blocked') return { kind: 'refused', reason: `${label} waits on an item that has not finished` }
    if (s === 'abandoned') return { kind: 'refused', reason: `${label} was left undone` }
    if (!out.includes(idx)) out.push(idx)
  }
  return { kind: 'ok', indices: out }
}
