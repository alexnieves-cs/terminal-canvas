import { outward } from '../shared/outward'
import { NOT_CONNECTED_CODE } from '../shared/credential-schema'
import {
  cloudLaneState, dispatchRequest, findLanePr, issueRequest, nextPollMs, parseCloudLane, providerById,
  type CheckFact, type CloudFacts, type CloudLane, type CloudLaneState, type DerivedState, type PrFact, type ReviewFact
} from '../shared/cloud-lane'

/**
 * M542. CLOUD LANES IN MAIN — handing an issue to a cloud agent, and reading
 * back what GitHub says about it.
 *
 * Everything goes through the broker, so the token is the broker's and every
 * call is an audit row. The order of a dispatch is github-publish's (M255),
 * for the same reason:
 *
 *   1. check the request (a repository that is one, a provider that is a row),
 *   2. pass the title and task through `outward()` — they leave the Mac —
 *      keeping the count,
 *   3. ASK, every time, naming the repository, the provider and both writes
 *      (the issue, then the hand-off), with the task as it will be sent,
 *   4. only then write, with `personConfirmed`.
 *
 * A dispatch is TWO writes, and the second can fail after the first landed.
 * That is said, never hidden: the lane is kept (the issue exists and is
 * worth watching) and the answer names the issue and what to do by hand.
 *
 * Reading is GETs only, so it never asks. Pure over an injected broker,
 * confirm, clock and timers; `verify:cloud main.*` drives it.
 */

type Answer = { ok: true; status: number; body: string; truncated: boolean } | { ok: false; reason: string; code?: string }

export interface CloudBroker {
  call(req: { service: string; method: string; path: string; body?: string; personConfirmed?: true }): Promise<Answer>
}

export interface DispatchRequest {
  id: string
  repo: string
  provider: string
  title: string
  task: string
}

/** What the person is shown before anything leaves. Never carries the unscrubbed text. */
export interface DispatchAsk {
  repo: string
  provider: string
  redacted: number
  message: string
  detail: string
}

export type DispatchResult =
  | { kind: 'dispatched'; lane: CloudLane; redacted: number }
  /** The issue was opened but the provider was not handed it. The lane is kept. */
  | { kind: 'handoff-failed'; lane: CloudLane; reason: string }
  | { kind: 'cancelled' }
  | { kind: 'no-credential' | 'refused' | 'unavailable'; reason: string }

export interface DispatchDeps {
  broker: CloudBroker
  confirm: (ask: DispatchAsk) => Promise<boolean>
  now: () => number
}

const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const TITLE_MAX = 200
const TASK_MAX = 16 * 1024

export async function dispatchCloudLane(deps: DispatchDeps, req: DispatchRequest): Promise<DispatchResult> {
  const provider = providerById(req.provider)
  if (provider === undefined) return { kind: 'refused', reason: `${JSON.stringify(req.provider)} is not a cloud agent this app knows — Copilot coding agent or Claude (GitHub Action)` }
  if (!REPO.test(req.repo) || req.repo.split('/').some((p) => p === '.' || p === '..')) return { kind: 'refused', reason: `${JSON.stringify(req.repo)} is not a repository — write it as owner/name` }
  if (req.title.trim() === '') return { kind: 'refused', reason: 'a cloud lane needs a title — it becomes the issue\'s title' }
  if (req.title.length > TITLE_MAX) return { kind: 'refused', reason: `a title is at most ${TITLE_MAX} characters` }
  if (req.task.trim() === '') return { kind: 'refused', reason: 'a cloud lane needs a task — it is what the agent is asked to do' }
  if (req.task.length > TASK_MAX) return { kind: 'refused', reason: `a task is at most ${TASK_MAX / 1024} KB — put the detail in a file in the repository and name it` }

  const title = outward(req.title.trim(), 'cloud lane title')
  const task = outward(req.task.trim(), 'cloud lane task')
  const redacted = title.redacted + task.redacted
  const lines = task.text.split('\n').filter((l) => l.trim() !== '')
  const hidden = Math.max(0, lines.length - 8)
  const preview = `${lines.slice(0, 8).join('\n')}${hidden === 0 ? '' : `\n\n… and ${hidden} more line${hidden === 1 ? '' : 's'} not shown here — the whole task is sent`}`
  const scrubNote = redacted === 0 ? 'nothing looked like a secret' : `${redacted} secret${redacted === 1 ? '' : 's'} redacted before sending`
  const handoff = provider.dispatch === 'assign' ? `assigns it to ${provider.label}` : `comments ${provider.mention} with the task`
  const ask: DispatchAsk = {
    repo: req.repo,
    provider: provider.label,
    redacted,
    message: `Send this task to ${provider.label} on ${req.repo}?`,
    detail: `This opens an issue on ${req.repo} and ${handoff}. Both are public to anyone who can see the repository.\nNeeds: ${provider.needs}.\n\n${title.text}\n\n${preview}\n\n${scrubNote}`
  }
  if (!(await deps.confirm(ask))) return { kind: 'cancelled' }

  const post = (path: string, body: string): Promise<Answer> =>
    deps.broker.call({ service: 'github', method: 'POST', path, body, personConfirmed: true })

  const made = issueRequest(req.repo, req.id, title.text, task.text)
  const opened = await post(made.path, made.body)
  if (!opened.ok) return refusalOf(opened)
  if (opened.status === 401) return { kind: 'refused', reason: 'GitHub rejected the credential — replace it in ⌘K › Credentials' }
  if (opened.status !== 201) return { kind: 'unavailable', reason: `GitHub answered ${opened.status}${suffix(opened.body)} — no issue was opened` }
  const number = numberOf(opened.body)
  if (number === null) return { kind: 'unavailable', reason: 'GitHub opened an issue but did not say which — look in the repository\'s issues' }

  const lane: CloudLane = { id: req.id, repo: req.repo, issue: number, provider: provider.id, title: title.text, dispatchedAt: deps.now(), state: 'dispatched' }
  const send = dispatchRequest(provider, req.repo, number, task.text)
  const handed = await post(send.path, send.body)
  const failed = !handed.ok ? handed.reason : handed.status === 201 || handed.status === 200 ? null : `GitHub answered ${handed.status}${suffix(handed.body)}`
  if (failed !== null) {
    return { kind: 'handoff-failed', lane: { ...lane, state: 'needs-you' }, reason: `issue #${number} was opened, but ${provider.label} was not handed it: ${failed}. ${provider.dispatch === 'assign' ? `Assign the issue to ${provider.label}` : `Comment ${provider.mention} on the issue`} by hand, and the lane picks it up.` }
  }
  return { kind: 'dispatched', lane, redacted }
}

function refusalOf(answer: { reason: string; code?: string }): { kind: 'no-credential' | 'refused' | 'unavailable'; reason: string } {
  if (answer.code === NOT_CONNECTED_CODE) return { kind: 'no-credential', reason: answer.reason }
  if (answer.code === 'not-asked' || answer.code === 'not-answered' || answer.code === 'not-granted') return { kind: 'refused', reason: answer.reason }
  return { kind: 'unavailable', reason: answer.reason }
}

function messageOf(body: string): string | null {
  try { const m = (JSON.parse(body) as { message?: unknown }).message; return typeof m === 'string' ? m : null } catch { return null }
}
const suffix = (body: string): string => (messageOf(body) === null ? '' : ` — ${messageOf(body)}`)

function numberOf(body: string): number | null {
  try { const n = (JSON.parse(body) as { number?: unknown }).number; return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null } catch { return null }
}

// ── Reading the facts ──────────────────────────────────────────────────────

export type FactsResult =
  | { kind: 'facts'; facts: CloudFacts; headSha: string | null }
  | { kind: 'no-credential' | 'unavailable' | 'malformed'; reason: string }

const time = (v: unknown): number => (typeof v === 'string' ? Date.parse(v) || 0 : 0)

/** GitHub's pull JSON (list or single) to the fields the state needs; null when it is not one. */
export function toPrFact(raw: unknown): (PrFact & { headSha: string | null }) | null {
  if (raw === null || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const head = (r.head ?? {}) as Record<string, unknown>
  if (typeof r.number !== 'number' || (r.state !== 'open' && r.state !== 'closed')) return null
  const fact: PrFact & { headSha: string | null } = {
    number: r.number,
    state: r.state,
    merged: r.merged === true || (typeof r.merged_at === 'string' && r.merged_at !== ''),
    draft: r.draft === true,
    body: typeof r.body === 'string' ? r.body : '',
    head: typeof head.ref === 'string' ? head.ref : '',
    createdAt: time(r.created_at),
    headSha: typeof head.sha === 'string' ? head.sha : null
  }
  if (typeof r.additions === 'number') fact.additions = r.additions
  if (typeof r.deletions === 'number') fact.deletions = r.deletions
  if (typeof r.changed_files === 'number') fact.changedFiles = r.changed_files
  return fact
}

const STATUSES = new Set(['queued', 'in_progress', 'completed'])

/**
 * Check runs, newest first by id. GitHub does not promise an order for this
 * list, and `cloudLaneState` keeps the FIRST run of each name, so the order
 * is made here rather than assumed. A status GitHub adds later (`waiting`,
 * `requested`, `pending`) is not completed, so it reads as running.
 */
export function toChecks(raw: unknown): CheckFact[] {
  const runs = (raw as { check_runs?: unknown } | null)?.check_runs
  if (!Array.isArray(runs)) return []
  return runs
    .filter((c): c is Record<string, unknown> => c !== null && typeof c === 'object' && typeof (c as { name?: unknown }).name === 'string')
    .sort((a, b) => (typeof b.id === 'number' ? b.id : 0) - (typeof a.id === 'number' ? a.id : 0))
    .map((c) => ({
      name: c.name as string,
      status: (STATUSES.has(c.status as string) ? c.status : 'in_progress') as CheckFact['status'],
      conclusion: typeof c.conclusion === 'string' ? c.conclusion : null
    }))
}

const REVIEW_STATES = new Set(['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', 'DISMISSED', 'PENDING'])
export function toReviews(raw: unknown): ReviewFact[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((r): r is Record<string, unknown> => r !== null && typeof r === 'object' && REVIEW_STATES.has((r as { state?: unknown }).state as string))
    .map((r) => ({ state: r.state as ReviewFact['state'], submittedAt: time(r.submitted_at) }))
}

export async function readCloudFacts(broker: CloudBroker, lane: CloudLane): Promise<FactsResult> {
  const get = async (path: string): Promise<{ kind: 'json'; value: unknown } | { kind: 'no-credential' | 'unavailable' | 'malformed'; reason: string }> => {
    const answer = await broker.call({ service: 'github', method: 'GET', path })
    if (!answer.ok) return answer.code === NOT_CONNECTED_CODE ? { kind: 'no-credential', reason: answer.reason } : { kind: 'unavailable', reason: answer.reason }
    if (answer.status !== 200) return { kind: 'unavailable', reason: `GitHub answered ${answer.status}${suffix(answer.body)} for ${path}` }
    try { return { kind: 'json', value: JSON.parse(answer.body) } } catch { return { kind: 'malformed', reason: `GitHub's answer for ${path} could not be read` } }
  }
  const base = `/repos/${lane.repo}`
  const issueRaw = await get(`${base}/issues/${lane.issue}`)
  if (issueRaw.kind !== 'json') return issueRaw
  const st = (issueRaw.value as { state?: unknown } | null)?.state
  if (st !== 'open' && st !== 'closed') return { kind: 'malformed', reason: `issue #${lane.issue} came back without a state` }
  const issue = { number: lane.issue, state: st } as const

  let pr: (PrFact & { headSha: string | null }) | null = null
  if (lane.pr !== undefined) {
    const one = await get(`${base}/pulls/${lane.pr}`)
    if (one.kind !== 'json') return one
    pr = toPrFact(one.value)
  } else {
    const list = await get(`${base}/pulls?state=all&sort=created&direction=desc&per_page=50`)
    if (list.kind !== 'json') return list
    const facts = Array.isArray(list.value) ? list.value.map(toPrFact).filter((p): p is PrFact & { headSha: string | null } => p !== null) : []
    const found = findLanePr(lane.issue, facts, lane.repo)
    if (found !== null) {
      // The list omits the diff stat; the single PR has it.
      const one = await get(`${base}/pulls/${found.number}`)
      pr = one.kind === 'json' ? toPrFact(one.value) ?? (found as PrFact & { headSha: string | null }) : (found as PrFact & { headSha: string | null })
    }
  }
  if (pr === null) return { kind: 'facts', facts: { issue, pr: null, checks: [], reviews: [] }, headSha: null }

  const checksRaw = pr.headSha === null ? null : await get(`${base}/commits/${pr.headSha}/check-runs?per_page=100`)
  if (checksRaw !== null && checksRaw.kind !== 'json') return checksRaw
  const reviewsRaw = await get(`${base}/pulls/${pr.number}/reviews?per_page=100`)
  if (reviewsRaw.kind !== 'json') return reviewsRaw
  const { headSha, ...prFact } = pr
  return {
    kind: 'facts',
    facts: { issue, pr: prFact, checks: checksRaw === null ? [] : toChecks(checksRaw.value), reviews: toReviews(reviewsRaw.value) },
    headSha
  }
}

// ── The poller ─────────────────────────────────────────────────────────────

export interface PollerDeps {
  read: (lane: CloudLane) => Promise<FactsResult>
  now: () => number
  hidden: () => boolean
  setTimer: (fn: () => void, ms: number) => unknown
  clearTimer: (handle: unknown) => void
  /** Called with the lane as it now stands, after every poll whose state, reason or PR changed. */
  changed: (lane: CloudLane, derived: DerivedState) => void
  /** A poll that could not read GitHub; the lane keeps its last state and is tried again later. */
  unreadable?: (lane: CloudLane, reason: string) => void
}

export interface CloudLanePoller {
  watch(lane: CloudLane): void
  forget(id: string): void
  /** Poll one lane now (a press of Refresh), then go back to its schedule. */
  pollNow(id: string): Promise<void>
  lanes(): CloudLane[]
  stop(): void
}

/**
 * One timer per lane, re-armed after each poll from `nextPollMs`, so a lane
 * running checks is read every minute and a quiet one backs off to fifteen.
 * A poll that changes nothing counts towards the back-off; one that cannot
 * read GitHub counts too, so an outage does not become a tight loop.
 */
export function createCloudLanePoller(deps: PollerDeps): CloudLanePoller {
  const tracked = new Map<string, { lane: CloudLane; reason: string; unchanged: number; timer: unknown; busy: boolean }>()

  const arm = (id: string): void => {
    const t = tracked.get(id)
    if (t === undefined) return
    if (t.timer !== undefined) deps.clearTimer(t.timer)
    t.timer = undefined
    const ms = nextPollMs(t.lane.state, t.unchanged, deps.hidden())
    if (ms === null) return
    t.timer = deps.setTimer(() => { void poll(id) }, ms)
  }

  const poll = async (id: string): Promise<void> => {
    const t = tracked.get(id)
    if (t === undefined || t.busy) return
    t.busy = true
    try {
      const read = await deps.read(t.lane)
      if (!tracked.has(id)) return
      if (read.kind !== 'facts') {
        t.unchanged += 1
        deps.unreadable?.(t.lane, read.reason)
        return
      }
      const derived = cloudLaneState(t.lane, read.facts, deps.now())
      const pr = read.facts.pr?.number
      const next: CloudLane = { ...t.lane, state: derived.state, ...(pr === undefined ? {} : { pr }) }
      const moved = next.state !== t.lane.state || next.pr !== t.lane.pr || derived.reason !== t.reason
      t.lane = next
      t.reason = derived.reason
      t.unchanged = moved ? 0 : t.unchanged + 1
      if (moved) deps.changed(next, derived)
    } finally {
      t.busy = false
      arm(id)
    }
  }

  return {
    watch(lane) {
      const old = tracked.get(lane.id)
      if (old?.timer !== undefined) deps.clearTimer(old.timer)
      tracked.set(lane.id, { lane, reason: '', unchanged: 0, timer: undefined, busy: false })
      // A lane read back from disk is re-derived at once rather than trusted.
      void poll(lane.id)
    },
    forget(id) {
      const t = tracked.get(id)
      if (t?.timer !== undefined) deps.clearTimer(t.timer)
      tracked.delete(id)
    },
    async pollNow(id) { await poll(id) },
    lanes: () => [...tracked.values()].map((t) => t.lane),
    stop() {
      for (const t of tracked.values()) if (t.timer !== undefined) deps.clearTimer(t.timer)
      tracked.clear()
    }
  }
}

// ── Persistence ────────────────────────────────────────────────────────────

/**
 * The lanes file: `{ version: 1, lanes: [...] }`. A malformed lane is dropped
 * by name and the rest stand, because one bad row must not cost every lane;
 * an unreadable file is an empty list plus the reason, never a throw.
 */
export function parseLanesFile(text: string | null): { lanes: CloudLane[]; dropped: string[] } {
  if (text === null) return { lanes: [], dropped: [] }
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return { lanes: [], dropped: ['the file is not JSON'] } }
  const list = (raw as { version?: unknown; lanes?: unknown } | null)
  if (list === null || typeof list !== 'object' || list.version !== 1 || !Array.isArray(list.lanes)) return { lanes: [], dropped: ['the file is not version 1'] }
  const lanes: CloudLane[] = []
  const dropped: string[] = []
  for (const [i, row] of list.lanes.entries()) {
    const parsed = parseCloudLane(row)
    if (parsed.kind === 'lane') lanes.push(parsed.lane)
    else dropped.push(`lane ${i}: ${parsed.reason}`)
  }
  return { lanes, dropped }
}

export function serializeLanes(lanes: readonly CloudLane[]): string {
  return `${JSON.stringify({ version: 1, lanes }, null, 2)}\n`
}

export type { CloudLaneState }
