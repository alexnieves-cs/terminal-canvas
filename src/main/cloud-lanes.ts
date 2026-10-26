import { outward } from '../shared/outward'
import { NOT_CONNECTED_CODE } from '../shared/credential-schema'
import {
  LANE_ID, cloudLaneState, dispatchRequest, findLanePr, handoffTook, inertForGithub, isRepo, issueRequest, nextPollMs,
  parseCloudLane, providerById,
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
 *   1. check the request field by field (`parseDispatchRequest`),
 *   2. pass the title and task through `outward()` — they leave the Mac —
 *      keeping the count, then make them inert for GitHub (no mention pings
 *      anyone, no line is a bot command), keeping that count too,
 *   3. ASK, every time, naming the repository, the provider and every write,
 *      with the task as it will be sent,
 *   4. only then write, with `personConfirmed`.
 *
 * A dispatch is TWO writes when it opens the issue, and the second can fail
 * after the first landed. That is said, never hidden: the lane is kept with
 * `handoff: 'failed'` (the issue exists and is worth watching) and the answer
 * names the issue and what to do by hand. An assignment GitHub answers 201
 * but silently dropped counts as failed (`handoffTook`).
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
  /**
   * An issue that already exists — a task added from GitHub carries one. The
   * hand-off then goes to THAT issue and no new one is opened, so a lane
   * never leaves a duplicate of the person's own issue behind.
   */
  issue?: number
  workItemId?: string
}

const TITLE_MAX = 200
const TASK_MAX = 16 * 1024

/**
 * The request as it crossed the bridge, checked field by field. A malformed
 * request is refused BY NAME, never coerced into a dispatch nobody typed —
 * a title that is not a string must not reach `.trim()` as a throw.
 */
export function parseDispatchRequest(raw: unknown): DispatchRequest | string {
  if (raw === null || typeof raw !== 'object') return 'the cloud lane request was not an object'
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || !LANE_ID.test(r.id)) return 'a cloud lane id is letters, digits, - and _, at most 64'
  if (typeof r.provider !== 'string' || providerById(r.provider) === undefined) return `${JSON.stringify(r.provider)} is not a cloud agent this app knows — Copilot coding agent or Claude (GitHub Action)`
  if (typeof r.repo !== 'string' || !isRepo(r.repo)) return `${JSON.stringify(r.repo)} is not a repository — write it as owner/name`
  if (typeof r.title !== 'string' || r.title.trim() === '') return 'a cloud lane needs a title — it becomes the issue\'s title'
  if (r.title.length > TITLE_MAX) return `a title is at most ${TITLE_MAX} characters`
  if (typeof r.task !== 'string' || r.task.trim() === '') return 'a cloud lane needs a task — it is what the agent is asked to do'
  if (r.task.length > TASK_MAX) return `a task is at most ${TASK_MAX / 1024} KB — put the detail in a file in the repository and name it`
  if (r.issue !== undefined && (typeof r.issue !== 'number' || !Number.isInteger(r.issue) || r.issue <= 0)) return `${JSON.stringify(r.issue)} is not an issue number`
  if (r.workItemId !== undefined && (typeof r.workItemId !== 'string' || r.workItemId === '')) return 'the task id was not text'
  return {
    id: r.id, provider: r.provider, repo: r.repo, title: r.title, task: r.task,
    ...(r.issue === undefined ? {} : { issue: r.issue as number }),
    ...(r.workItemId === undefined ? {} : { workItemId: r.workItemId as string })
  }
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

export async function dispatchCloudLane(deps: DispatchDeps, raw: unknown): Promise<DispatchResult> {
  const req = parseDispatchRequest(raw)
  if (typeof req === 'string') return { kind: 'refused', reason: req }
  const provider = providerById(req.provider)
  if (provider === undefined) return { kind: 'refused', reason: 'unknown provider' }

  const titleGate = outward(req.title.trim(), 'cloud lane title')
  const taskGate = outward(req.task.trim(), 'cloud lane task')
  const title = inertForGithub(titleGate.text)
  const task = inertForGithub(taskGate.text)
  const redacted = titleGate.redacted + taskGate.redacted
  const neutralised = title.neutralised + task.neutralised
  const lines = task.text.split('\n').filter((l) => l.trim() !== '')
  const hidden = Math.max(0, lines.length - 8)
  const preview = `${lines.slice(0, 8).join('\n')}${hidden === 0 ? '' : `\n\n… and ${hidden} more line${hidden === 1 ? '' : 's'} not shown here — the whole task is sent`}`
  const notes = [
    redacted === 0 ? 'nothing looked like a secret' : `${redacted} secret${redacted === 1 ? '' : 's'} redacted before sending`,
    ...(neutralised === 0 ? [] : [`${neutralised} @mention${neutralised === 1 ? '' : 's'} or /command${neutralised === 1 ? '' : 's'} sent as plain text, so nobody is pinged and no bot is triggered`])
  ]
  const handoff = provider.dispatch === 'assign'
    ? `assigns ${req.issue === undefined ? 'it' : `issue #${req.issue}`} to ${provider.label}`
    : `comments ${provider.mention} with the task on ${req.issue === undefined ? 'it' : `issue #${req.issue}`}`
  const what = req.issue === undefined
    ? `This opens an issue on ${req.repo} and ${handoff}. Both are visible to anyone who can see the repository.`
    : `This ${handoff}. It is visible to anyone who can see the repository.`
  const ask: DispatchAsk = {
    repo: req.repo,
    provider: provider.label,
    redacted,
    message: `Send this task to ${provider.label} on ${req.repo}?`,
    detail: `${what}\nNeeds: ${provider.needs}.\n\n${title.text}\n\n${preview}\n\n${notes.join('\n')}`
  }
  if (!(await deps.confirm(ask))) return { kind: 'cancelled' }

  const post = (path: string, body: string): Promise<Answer> =>
    deps.broker.call({ service: 'github', method: 'POST', path, body, personConfirmed: true })

  let number = req.issue ?? null
  if (number === null) {
    const made = issueRequest(req.repo, req.id, title.text, task.text)
    const opened = await post(made.path, made.body)
    if (!opened.ok) return refusalOf(opened)
    if (opened.status === 401) return { kind: 'refused', reason: 'GitHub rejected the credential — replace it in ⌘K › Credentials' }
    if (opened.status !== 201) return { kind: 'unavailable', reason: `GitHub answered ${opened.status}${suffix(opened.body)} — no issue was opened` }
    number = numberOf(opened.body)
    if (number === null) return { kind: 'unavailable', reason: 'GitHub opened an issue but did not say which — look in the repository\'s issues' }
  }

  const lane: CloudLane = {
    id: req.id, repo: req.repo, issue: number, provider: provider.id, title: title.text, dispatchedAt: deps.now(), state: 'dispatched',
    ...(req.workItemId === undefined ? {} : { workItemId: req.workItemId })
  }
  const send = dispatchRequest(provider, req.repo, number, task.text)
  const handed = await post(send.path, send.body)
  const failed = !handed.ok
    ? handed.reason
    : handoffTook(provider, handed.status, handed.body)
      ? null
      : handed.status === 201 || handed.status === 200
        ? `GitHub accepted the request but ${provider.label} is not among the assignees — ${provider.needs} is the usual cause`
        : `GitHub answered ${handed.status}${suffix(handed.body)}`
  if (failed !== null && req.issue !== undefined) {
    // Nothing was opened, so nothing is kept: the person's own issue is as it was.
    return { kind: 'unavailable', reason: `${provider.label} was not handed issue #${number}: ${failed}` }
  }
  if (failed !== null) {
    return { kind: 'handoff-failed', lane: { ...lane, state: 'needs-you', handoff: 'failed' }, reason: `issue #${number} was opened, but ${provider.label} was not handed it: ${failed}. ${provider.dispatch === 'assign' ? `Assign the issue to ${provider.label}` : `Comment ${provider.mention} on the issue`} by hand, and the lane picks it up.` }
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
  | { kind: 'facts'; facts: CloudFacts }
  /** The issue or repository is gone (404, 410): the lane settles rather than polling forever. */
  | { kind: 'gone'; reason: string }
  | { kind: 'no-credential' | 'unavailable' | 'malformed'; reason: string }

const time = (v: unknown): number => (typeof v === 'string' ? Date.parse(v) || 0 : 0)
const SHA = /^[0-9a-f]{40}$/

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
    // The sha is spliced into an API path, so anything but a sha is no sha.
    headSha: typeof head.sha === 'string' && SHA.test(head.sha) ? head.sha : null
  }
  if (typeof r.additions === 'number') fact.additions = r.additions
  if (typeof r.deletions === 'number') fact.deletions = r.deletions
  if (typeof r.changed_files === 'number') fact.changedFiles = r.changed_files
  return fact
}

const STATUSES = new Set(['queued', 'in_progress', 'completed'])

/**
 * Check runs, newest first by id. GitHub does not promise an order for this
 * list, and `cloudLaneState` keeps the FIRST run of each (app, name), so the
 * order is made here rather than assumed. A status GitHub adds later
 * (`waiting`, `requested`, `pending`) is not completed, so it reads as running.
 */
export function toChecks(runs: unknown): CheckFact[] {
  if (!Array.isArray(runs)) return []
  return runs
    .filter((c): c is Record<string, unknown> => c !== null && typeof c === 'object' && typeof (c as { name?: unknown }).name === 'string')
    .sort((a, b) => (typeof b.id === 'number' ? b.id : 0) - (typeof a.id === 'number' ? a.id : 0))
    .map((c) => {
      const app = (c.app as { slug?: unknown } | null | undefined)?.slug
      return {
        name: c.name as string,
        ...(typeof app === 'string' ? { app } : {}),
        status: (STATUSES.has(c.status as string) ? c.status : 'in_progress') as CheckFact['status'],
        conclusion: typeof c.conclusion === 'string' ? c.conclusion : null
      }
    })
}

/**
 * Legacy commit statuses (CircleCI, Vercel and many others still report
 * this way), as checks. GitHub's combined status lists the latest per
 * context; `pending` is running, `error` and `failure` fail.
 */
export function toStatuses(raw: unknown): CheckFact[] {
  const list = (raw as { statuses?: unknown } | null)?.statuses
  if (!Array.isArray(list)) return []
  return list
    .filter((s): s is Record<string, unknown> => s !== null && typeof s === 'object' && typeof (s as { context?: unknown }).context === 'string')
    .map((s) => s.state === 'pending'
      ? { name: s.context as string, app: 'status', status: 'in_progress' as const, conclusion: null }
      : { name: s.context as string, app: 'status', status: 'completed' as const, conclusion: s.state === 'success' ? 'success' : 'failure' })
}

const REVIEW_STATES = new Set(['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', 'DISMISSED', 'PENDING'])
export function toReviews(raw: unknown): ReviewFact[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((r): r is Record<string, unknown> => r !== null && typeof r === 'object' && REVIEW_STATES.has((r as { state?: unknown }).state as string))
    .map((r) => {
      const login = (r.user as { login?: unknown } | null | undefined)?.login
      return { state: r.state as ReviewFact['state'], submittedAt: time(r.submitted_at), ...(typeof login === 'string' ? { user: login } : {}) }
    })
}

/** Pages of check runs read before the rest is called incomplete. */
export const CHECK_PAGES = 3

export async function readCloudFacts(broker: CloudBroker, lane: CloudLane): Promise<FactsResult> {
  type Failure = { kind: 'gone' | 'no-credential' | 'unavailable' | 'malformed'; reason: string }
  type Got = { kind: 'json'; value: unknown } | Failure
  const get = async (path: string): Promise<Got> => {
    const answer = await broker.call({ service: 'github', method: 'GET', path })
    if (!answer.ok) return answer.code === NOT_CONNECTED_CODE ? { kind: 'no-credential', reason: answer.reason } : { kind: 'unavailable', reason: answer.reason }
    if (answer.status === 404 || answer.status === 410) return { kind: 'gone', reason: `GitHub answered ${answer.status} for ${path}` }
    if (answer.status !== 200) return { kind: 'unavailable', reason: `GitHub answered ${answer.status}${suffix(answer.body)} for ${path}` }
    try { return { kind: 'json', value: JSON.parse(answer.body) } } catch { return { kind: 'malformed', reason: `GitHub's answer for ${path} could not be read` } }
  }
  const base = `/repos/${lane.repo}`
  const issueRaw = await get(`${base}/issues/${lane.issue}`)
  if (issueRaw.kind === 'gone') return { kind: 'gone', reason: `issue #${lane.issue} on ${lane.repo} is gone — it was deleted, transferred, or the repository was` }
  if (issueRaw.kind !== 'json') return issueRaw
  const st = (issueRaw.value as { state?: unknown } | null)?.state
  if (st !== 'open' && st !== 'closed') return { kind: 'malformed', reason: `issue #${lane.issue} came back without a state` }
  const issue = { number: lane.issue, state: st } as const

  type Pr = PrFact & { headSha: string | null }
  const search = async (): Promise<Pr | null | Failure> => {
    const list = await get(`${base}/pulls?state=all&sort=created&direction=desc&per_page=50`)
    if (list.kind !== 'json') return list
    const facts = Array.isArray(list.value) ? list.value.map(toPrFact).filter((p): p is Pr => p !== null) : []
    return findLanePr(lane.issue, facts, lane.repo, lane.dispatchedAt) as Pr | null
  }
  const isGot = (v: Pr | null | Failure): v is Failure => v !== null && 'kind' in v

  let pr: Pr | null = null
  if (lane.pr !== undefined) {
    const one = await get(`${base}/pulls/${lane.pr}`)
    if (one.kind !== 'json' && one.kind !== 'gone') return one
    pr = one.kind === 'json' ? toPrFact(one.value) : null
    // A provider that gave up closes its PR and opens another; the pinned
    // one closing unmerged is a reason to look again, not the lane's end.
    if (pr === null || (pr.state === 'closed' && !pr.merged)) {
      const again = await search()
      if (isGot(again)) return again.kind === 'gone' ? { kind: 'unavailable', reason: again.reason } : again
      if (again !== null && again.number !== lane.pr) pr = again
    }
  } else {
    const found = await search()
    if (isGot(found)) return found.kind === 'gone' ? { kind: 'unavailable', reason: found.reason } : found
    pr = found
  }
  if (pr !== null && (lane.pr === undefined || pr.number !== lane.pr)) {
    // The list omits the diff stat; the single PR has it.
    const one = await get(`${base}/pulls/${pr.number}`)
    if (one.kind === 'json') pr = toPrFact(one.value) ?? pr
  }
  if (pr === null) return { kind: 'facts', facts: { issue, pr: null, checks: [], reviews: [] } }

  const checks: CheckFact[] = []
  const rawRuns: unknown[] = []
  let checksIncomplete = false
  if (pr.headSha !== null) {
    let total = 0
    let read = 0
    for (let page = 1; page <= CHECK_PAGES; page += 1) {
      const got = await get(`${base}/commits/${pr.headSha}/check-runs?per_page=100&page=${page}`)
      if (got.kind !== 'json') return got.kind === 'gone' ? { kind: 'unavailable', reason: got.reason } : got
      const v = got.value as { total_count?: unknown; check_runs?: unknown } | null
      total = typeof v?.total_count === 'number' ? v.total_count : 0
      const runs = Array.isArray(v?.check_runs) ? v.check_runs : []
      read += runs.length
      rawRuns.push(...(runs as unknown[]))
      if (runs.length < 100 || read >= total) break
    }
    checksIncomplete = read < total
    checks.push(...toChecks(rawRuns))
    const status = await get(`${base}/commits/${pr.headSha}/status`)
    if (status.kind === 'json') checks.push(...toStatuses(status.value))
    else if (status.kind !== 'gone') return status
  } else {
    // No readable head means no check can be read: never ready on that.
    checksIncomplete = true
  }
  const reviewsRaw = await get(`${base}/pulls/${pr.number}/reviews?per_page=100`)
  if (reviewsRaw.kind !== 'json') return reviewsRaw.kind === 'gone' ? { kind: 'unavailable', reason: reviewsRaw.reason } : reviewsRaw
  const { headSha: _sha, ...prFact } = pr
  return {
    kind: 'facts',
    facts: { issue, pr: prFact, checks, reviews: toReviews(reviewsRaw.value), ...(checksIncomplete ? { checksIncomplete } : {}) }
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
  /** The window came back: every lane re-arms from its state, so none sits on the hidden ceiling. */
  wake(): void
  lanes(): CloudLane[]
  reasonOf(id: string): string
  stop(): void
}

interface Tracked { lane: CloudLane; reason: string; unchanged: number; timer: unknown; busy: boolean }

/**
 * One timer per lane, re-armed after each poll from `nextPollMs`, so a lane
 * running checks is read every minute and a quiet one backs off to fifteen.
 * A poll that changes nothing counts towards the back-off; one that cannot
 * read GitHub counts too, so an outage does not become a tight loop. A lane
 * whose issue is gone settles as closed rather than polling forever.
 *
 * Every write after an await checks that the entry is still THE entry: a
 * `watch` of the same id replaces it, and the old poll must neither report
 * stale facts nor re-arm the new entry's timer.
 */
export function createCloudLanePoller(deps: PollerDeps): CloudLanePoller {
  const tracked = new Map<string, Tracked>()

  const arm = (t: Tracked): void => {
    if (t.timer !== undefined) deps.clearTimer(t.timer)
    t.timer = undefined
    if (tracked.get(t.lane.id) !== t) return
    const ms = nextPollMs(t.lane.state, t.unchanged, deps.hidden())
    if (ms === null) return
    t.timer = deps.setTimer(() => { void poll(t) }, ms)
  }

  const settle = (t: Tracked, state: CloudLaneState, reason: string, prMoved = false): void => {
    const moved = prMoved || state !== t.lane.state || reason !== t.reason
    t.lane = { ...t.lane, state }
    t.reason = reason
    t.unchanged = moved ? 0 : t.unchanged + 1
    if (moved) deps.changed(t.lane, { state, reason })
  }

  const poll = async (t: Tracked): Promise<void> => {
    if (t.busy) return
    t.busy = true
    try {
      const read = await deps.read(t.lane)
      if (tracked.get(t.lane.id) !== t) return
      if (read.kind === 'gone') { settle(t, 'closed', read.reason); return }
      if (read.kind !== 'facts') {
        t.unchanged += 1
        deps.unreadable?.(t.lane, read.reason)
        return
      }
      const derived = cloudLaneState(t.lane, read.facts, deps.now())
      const pr = read.facts.pr?.number
      const next: CloudLane = { ...t.lane, ...(pr === undefined ? {} : { pr }) }
      // A PR appearing answers a failed hand-off: someone handed it over.
      if (pr !== undefined) delete next.handoff
      const prMoved = next.pr !== t.lane.pr || (t.lane.handoff !== undefined && next.handoff === undefined)
      t.lane = next
      settle(t, derived.state, derived.reason, prMoved)
    } finally {
      t.busy = false
      arm(t)
    }
  }

  return {
    watch(lane) {
      const old = tracked.get(lane.id)
      if (old?.timer !== undefined) deps.clearTimer(old.timer)
      const t: Tracked = { lane, reason: '', unchanged: 0, timer: undefined, busy: false }
      tracked.set(lane.id, t)
      // A lane read back from disk is re-derived at once rather than trusted.
      void poll(t)
    },
    forget(id) {
      const t = tracked.get(id)
      if (t?.timer !== undefined) deps.clearTimer(t.timer)
      tracked.delete(id)
    },
    async pollNow(id) { const t = tracked.get(id); if (t !== undefined) await poll(t) },
    wake() { for (const t of tracked.values()) if (!t.busy) arm(t) },
    lanes: () => [...tracked.values()].map((t) => t.lane),
    reasonOf: (id) => tracked.get(id)?.reason ?? '',
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
export function parseLanesFile(text: string | null, now: number): { lanes: CloudLane[]; dropped: string[] } {
  if (text === null) return { lanes: [], dropped: [] }
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return { lanes: [], dropped: ['the file is not JSON'] } }
  const list = (raw as { version?: unknown; lanes?: unknown } | null)
  if (list === null || typeof list !== 'object' || list.version !== 1 || !Array.isArray(list.lanes)) return { lanes: [], dropped: ['the file is not version 1'] }
  const lanes: CloudLane[] = []
  const dropped: string[] = []
  for (const [i, row] of list.lanes.entries()) {
    const parsed = parseCloudLane(row, now)
    if (parsed.kind === 'lane') lanes.push(parsed.lane)
    else dropped.push(`lane ${i}: ${parsed.reason}`)
  }
  return { lanes, dropped }
}

export function serializeLanes(lanes: readonly CloudLane[]): string {
  return `${JSON.stringify({ version: 1, lanes }, null, 2)}\n`
}

export type { CloudLaneState }
