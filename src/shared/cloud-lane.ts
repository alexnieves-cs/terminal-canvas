/**
 * M541. A CLOUD LANE — a lane whose agent runs on someone else's computer and
 * comes back as a pull request, as data.
 *
 * Every cloud agent that works on a GitHub repository ends its work the same
 * way: a PR. So the lane is "a PR I am waiting on", and a provider is one row
 * of PROVIDERS (how to hand it the issue, what its PR looks like), never a
 * code path. Adding a provider is adding a row.
 *
 * Three rules a reader relies on:
 * - **The state is derived, never stored as truth.** `cloudLaneState` maps
 *   what GitHub says now (issue, PR, checks, reviews) to one state word; the
 *   persisted `state` is only the last answer, so a lane read back from disk
 *   is re-derived on the next poll rather than trusted. The one stored fact
 *   it honours is `handoff: 'failed'`, because no GitHub fact records that
 *   the hand-off did not happen.
 * - **Ready means a check passed.** A PR with no checks is `needs-you`, not
 *   `ready`: the M475 rule ("done means a check passed, not that the agent
 *   said so") holds for an agent we cannot see as much as one we can. A
 *   check this module could not read in full (more runs than were fetched)
 *   is never read as passing.
 * - **A lane finds its PR by the issue it was handed**, not by the author,
 *   because a provider may open its PR as a bot, as `github-actions`, or not
 *   at all until a person presses a link — and only a PR opened AFTER the
 *   hand-off, so an older PR that happens to name the issue is never adopted.
 *
 * Imports nothing, so `verify:cloud` drives it under plain node.
 */

export type CloudProviderId = 'copilot' | 'claude-action'

export interface CloudProvider {
  id: CloudProviderId
  label: string
  /**
   * How the issue is handed over. `assign` adds `assignee` to the issue;
   * `comment` posts `mention` followed by the task as an issue comment.
   */
  dispatch: 'assign' | 'comment'
  assignee?: string
  /**
   * The text an assignee's login must contain for the hand-off to count.
   * GitHub answers 201 to an assignment it silently dropped (a provider not
   * enabled, a token that may not assign it), so the answer's own assignee
   * list is read rather than its status.
   */
  assigneeMatch?: string
  mention?: string
  /** What the person must have set up on the repository first, said where the lane is created. */
  needs: string
  /** What a lane with no PR after NO_PR_AFTER_MS most likely means for this provider. */
  stall: string
}

/**
 * The assignee and the mention are names other people own, and `npm run
 * verify` never calls GitHub, so they are recorded here rather than proved.
 * REST assignment of Copilot was a public preview in 2026-10: GitHub's docs
 * name the actor `copilot-swe-agent[bot]` for a user token. If an assignment
 * lands but no session starts, this row is the first suspect; the lane then
 * sits at `dispatched` and turns needs-you after NO_PR_AFTER_MS, so the
 * failure is visible, not silent.
 */
export const PROVIDERS: readonly CloudProvider[] = [
  {
    id: 'copilot',
    label: 'Copilot coding agent',
    dispatch: 'assign',
    assignee: 'copilot-swe-agent[bot]',
    assigneeMatch: 'copilot',
    needs: 'Copilot coding agent enabled for this repository',
    stall: 'no pull request after two hours — Copilot may not have started; check the issue for its reaction'
  },
  {
    id: 'claude-action',
    label: 'Claude (GitHub Action)',
    dispatch: 'comment',
    mention: '@claude',
    needs: 'the Claude GitHub app and its workflow installed in this repository',
    stall: 'no pull request after two hours — Claude may have pushed a branch and left a "Create PR" link in the issue; open the issue'
  }
]

export function providerById(id: string): CloudProvider | undefined {
  return PROVIDERS.find((p) => p.id === id)
}

export const CLOUD_LANE_STATES = [
  'dispatched', 'working', 'checks-running', 'ready', 'failed', 'needs-you', 'merged', 'closed'
] as const
export type CloudLaneState = (typeof CLOUD_LANE_STATES)[number]

/** A lane that will never change again: polling stops here. */
export function isSettled(state: CloudLaneState): boolean {
  return state === 'merged' || state === 'closed'
}

/** A lane id is minted by this app, and it is written into an issue body inside an HTML comment, so it is a plain token. */
export const LANE_ID = /^[A-Za-z0-9_-]{1,64}$/

export interface CloudLane {
  id: string
  /** `owner/name`. */
  repo: string
  /** The issue the agent was handed; the lane's PR is found through it. */
  issue: number
  provider: CloudProviderId
  title: string
  dispatchedAt: number
  /** The PR once one is found. Absent while the agent has not opened one. */
  pr?: number
  /** The board task this lane works on, when it was sent from one. */
  workItemId?: string
  /** The hand-off write did not take. Kept until a PR appears, since no GitHub fact says so. */
  handoff?: 'failed'
  /** The last derived state. Re-derived on every poll; see the header. */
  state: CloudLaneState
}

// ── GitHub facts, reduced to the fields the state needs ────────────────────

export interface IssueFact { number: number; state: 'open' | 'closed' }

export interface PrFact {
  number: number
  state: 'open' | 'closed'
  merged: boolean
  draft: boolean
  /** The PR body, read for a closing reference to the lane's issue. */
  body: string
  /** The head branch name, the fallback link to the issue. */
  head: string
  createdAt: number
  additions?: number
  deletions?: number
  changedFiles?: number
}

export interface CheckFact {
  name: string
  /** The app or status context family that reported it; two apps may use one name. */
  app?: string
  status: 'queued' | 'in_progress' | 'completed'
  /** GitHub's conclusion; null until completed. */
  conclusion: string | null
}

export interface ReviewFact {
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING'
  submittedAt: number
  /** The reviewer's login. A review with none is one reviewer of its own. */
  user?: string
}

export interface CloudFacts {
  issue: IssueFact
  pr: PrFact | null
  /** Newest first within a name — see `latestByName`. */
  checks: readonly CheckFact[]
  reviews: readonly ReviewFact[]
  /** True when GitHub said there were more check runs than were read. */
  checksIncomplete?: boolean
}

/** How long a lane may wait for a PR before the person is told it may not have started. */
export const NO_PR_AFTER_MS = 2 * 60 * 60 * 1000
/** How long a PR may stay a draft before the person is asked whether the agent is done. */
export const DRAFT_QUIET_MS = 2 * 60 * 60 * 1000

/**
 * A conclusion that counts as passing. `skipped` and `neutral` pass because
 * GitHub's own merge box treats them so; anything unknown fails rather than
 * passes, since a new conclusion GitHub adds should not quietly mean ready.
 * `action_required` is neither: a person must approve the workflow runs
 * (GitHub asks this for a bot's first PR), so it is the person's move.
 */
const PASSING = new Set(['success', 'neutral', 'skipped'])

export interface DerivedState { state: CloudLaneState; reason: string }

export function cloudLaneState(lane: Pick<CloudLane, 'dispatchedAt' | 'provider'> & { handoff?: 'failed' }, facts: CloudFacts, now: number): DerivedState {
  const { pr, issue } = facts
  if (pr !== null && pr.merged) return { state: 'merged', reason: `#${pr.number} merged` }
  if (pr !== null && pr.state === 'closed') return { state: 'closed', reason: `#${pr.number} closed without merging` }
  if (pr === null) {
    if (issue.state === 'closed') return { state: 'closed', reason: `issue #${issue.number} closed with no pull request` }
    if (lane.handoff === 'failed') return { state: 'needs-you', reason: `the agent was never handed issue #${issue.number} — hand it over on GitHub` }
    if (now - lane.dispatchedAt > NO_PR_AFTER_MS) return { state: 'needs-you', reason: providerById(lane.provider)?.stall ?? 'no pull request after two hours' }
    return { state: 'dispatched', reason: `waiting for a pull request on issue #${issue.number}` }
  }
  if (pr.draft) {
    if (now - pr.createdAt > DRAFT_QUIET_MS) return { state: 'needs-you', reason: `#${pr.number} is still a draft after two hours — mark it ready if the agent is done` }
    return { state: 'working', reason: `#${pr.number} is a draft — the agent is still working` }
  }
  const asked = changesRequested(facts.reviews)
  if (asked.length > 0) return { state: 'working', reason: `changes requested on #${pr.number} by ${asked.join(', ')}` }
  const checks = latestByName(facts.checks)
  if (checks.length === 0) return { state: 'needs-you', reason: `#${pr.number} has no checks — nothing but the agent says it works` }
  const approve = checks.filter((c) => c.status === 'completed' && c.conclusion === 'action_required')
  const failed = checks.filter((c) => c.status === 'completed' && c.conclusion !== 'action_required' && !PASSING.has(c.conclusion ?? ''))
  if (failed.length > 0) return { state: 'failed', reason: `${failed.map((c) => c.name).join(', ')} failed on #${pr.number}` }
  if (approve.length > 0) return { state: 'needs-you', reason: `${approve.map((c) => c.name).join(', ')} on #${pr.number} wait for a person to approve the workflow run` }
  const running = checks.filter((c) => c.status !== 'completed')
  if (running.length > 0) return { state: 'checks-running', reason: `${running.length} of ${checks.length} checks running on #${pr.number}` }
  if (facts.checksIncomplete === true) return { state: 'checks-running', reason: `#${pr.number} has more checks than were read — open it to see them all` }
  return { state: 'ready', reason: `every check passed on #${pr.number}` }
}

/**
 * The reviewers whose LATEST decisive review asks for changes. Per reviewer,
 * because one person's approval does not answer another's change request —
 * the newest decisive review overall would let it. A COMMENTED review decides
 * nothing; a DISMISSED one clears that reviewer's earlier verdict.
 */
function changesRequested(reviews: readonly ReviewFact[]): string[] {
  const last = new Map<string, ReviewFact>()
  const sorted = [...reviews].sort((a, b) => a.submittedAt - b.submittedAt)
  sorted.forEach((r, i) => {
    if (r.state === 'COMMENTED' || r.state === 'PENDING') return
    last.set(r.user ?? `review ${i}`, r)
  })
  return [...last.entries()].filter(([, r]) => r.state === 'CHANGES_REQUESTED').map(([who]) => who)
}

/**
 * A re-run adds a second check run under the same name, and the list is
 * newest first. Keeping the first of each (app, name) means a failure that
 * was re-run green no longer counts — and a green run re-run red does. Keyed
 * by app as well as name, so another app's newer "build" cannot hide this
 * one's red "build".
 */
function latestByName(checks: readonly CheckFact[]): CheckFact[] {
  const seen = new Map<string, CheckFact>()
  for (const c of checks) {
    const key = `${c.app ?? ''}\u0000${c.name}`
    if (!seen.has(key)) seen.set(key, c)
  }
  return [...seen.values()]
}

/** A PR opened this long before the dispatch still counts: clocks disagree. */
export const CLOCK_SKEW_MS = 5 * 60 * 1000

/**
 * Which PR is this lane's. A PR qualifies only when it was opened after the
 * hand-off, and when its body closes the issue (`Fixes #12`, `closes #12`,
 * `Resolves owner/repo#12`) or its head branch names the issue number as a
 * whole segment (`copilot/fix-12`, `claude/issue-12-…`). The body test comes
 * first because a branch name is a guess and a closing reference is a
 * statement. Among several, the newest wins: a provider that gave up and
 * started again opened the later one.
 */
export function findLanePr(issue: number, prs: readonly PrFact[], repo: string | undefined, dispatchedAt: number): PrFact | null {
  const n = String(issue)
  const ref = repo === undefined ? `#${n}` : `(?:${escape(repo)})?#${n}`
  const closes = new RegExp(`\\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\\s*:?\\s+${ref}(?!\\d)`, 'i')
  const branch = new RegExp(`(?:^|[/_-])${n}(?:$|[/_-])`)
  const fresh = prs.filter((p) => p.createdAt >= dispatchedAt - CLOCK_SKEW_MS)
  const byBody = fresh.filter((p) => closes.test(p.body))
  const pool = byBody.length > 0 ? byBody : fresh.filter((p) => branch.test(p.head))
  if (pool.length === 0) return null
  return [...pool].sort((a, b) => b.createdAt - a.createdAt)[0] ?? null
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// ── Dispatch, as the requests main sends through the broker ─────────────────

/** The marker that lets a lane be found again from its issue alone. `id` is LANE_ID-shaped. */
export const LANE_MARKER = (id: string): string => `<!-- terminal-canvas cloud lane ${id} -->`

/**
 * Text that goes into an issue or a comment pings nobody and fires nothing.
 * An `@name` or `@org/team` notifies those people, and an `@claude` inside a
 * Copilot task would start a second agent; a line that starts with `/` is a
 * command to bots such as Prow. Each is broken with a zero-width joiner, so
 * the agent still reads the same words and GitHub sees no mention and no
 * command. The provider's own mention is added after this, by the caller.
 */
export function inertForGithub(text: string): { text: string; neutralised: number } {
  let neutralised = 0
  const out = text
    .replace(/(^|[^\w`])@(?=[A-Za-z0-9])/g, (_m, pre: string) => { neutralised += 1; return `${pre}@‍` })
    .replace(/^(\s*)\//gm, (_m, pre: string) => { neutralised += 1; return `${pre}‍/` })
  return { text: out, neutralised }
}

export interface GithubWrite { method: 'POST'; path: string; body: string }

/**
 * The issue a lane starts from. `task` and `title` must already be scrubbed
 * and made inert — this module cannot import the scrubber (it is shared/
 * outward's, called by `main/cloud-lanes.ts` before this).
 */
export function issueRequest(repo: string, id: string, title: string, task: string): GithubWrite {
  if (!LANE_ID.test(id)) throw new Error(`lane id ${JSON.stringify(id)} is not a plain token`)
  return {
    method: 'POST',
    path: `/repos/${repo}/issues`,
    body: JSON.stringify({ title, body: `${task}\n\n${LANE_MARKER(id)}` })
  }
}

/** The one write that hands the issue to the provider. */
export function dispatchRequest(provider: CloudProvider, repo: string, issue: number, task: string): GithubWrite {
  if (provider.dispatch === 'assign') {
    return { method: 'POST', path: `/repos/${repo}/issues/${issue}/assignees`, body: JSON.stringify({ assignees: [provider.assignee] }) }
  }
  return { method: 'POST', path: `/repos/${repo}/issues/${issue}/comments`, body: JSON.stringify({ body: `${provider.mention} ${task}` }) }
}

/**
 * Whether GitHub's answer to the hand-off shows it took. An assignment is
 * read from the answer's assignee list (see `assigneeMatch`); a comment that
 * was created took by construction.
 */
export function handoffTook(provider: CloudProvider, status: number, body: string): boolean {
  if (status !== 201 && status !== 200) return false
  if (provider.dispatch === 'comment') return true
  let parsed: unknown
  try { parsed = JSON.parse(body) } catch { return false }
  const list = (parsed as { assignees?: unknown } | null)?.assignees
  const match = (provider.assigneeMatch ?? '').toLowerCase()
  return Array.isArray(list) && match !== '' &&
    list.some((a) => typeof (a as { login?: unknown } | null)?.login === 'string' && ((a as { login: string }).login).toLowerCase().includes(match))
}

// ── Polling ────────────────────────────────────────────────────────────────

export const POLL_MIN_MS = 60_000
export const POLL_MAX_MS = 15 * 60_000

/**
 * How long until the next poll. Fast while something is about to change
 * (checks running), slow while the agent works, doubled for each poll that
 * changed nothing, and never while settled. A hidden window polls at the
 * ceiling: the morning queue reads the state when the person comes back, and
 * GitHub's rate limit is shared with every other door that uses the token.
 */
export function nextPollMs(state: CloudLaneState, unchanged: number, hidden: boolean): number | null {
  if (isSettled(state)) return null
  if (hidden) return POLL_MAX_MS
  const base = state === 'checks-running' ? POLL_MIN_MS : state === 'ready' || state === 'needs-you' || state === 'failed' ? 5 * 60_000 : 2 * 60_000
  return Math.min(POLL_MAX_MS, base * 2 ** Math.max(0, Math.min(unchanged, 8)))
}

// ── Persistence ────────────────────────────────────────────────────────────

const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

/** `owner/name`, and neither half a `.` or `..` — the repository is spliced into an API path. */
export function isRepo(s: string): boolean {
  return REPO.test(s) && !s.split('/').some((p) => p === '.' || p === '..')
}

export type ParsedCloudLane = { kind: 'lane'; lane: CloudLane } | { kind: 'malformed'; reason: string }

/**
 * A lane read back from disk. An absent optional key is fine; a present one
 * of the wrong type is malformed, named, and dropped by the caller rather
 * than coerced — a PR number of "12" is not the same lane as one of 12. A
 * `dispatchedAt` in the future is malformed too: it would hold off the
 * two-hour needs-you for as long as the clock is wrong.
 */
export function parseCloudLane(raw: unknown, now: number): ParsedCloudLane {
  if (raw === null || typeof raw !== 'object') return { kind: 'malformed', reason: 'not an object' }
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || !LANE_ID.test(r.id)) return { kind: 'malformed', reason: 'id' }
  if (typeof r.repo !== 'string' || !isRepo(r.repo)) return { kind: 'malformed', reason: 'repo' }
  if (!isIssueNumber(r.issue)) return { kind: 'malformed', reason: 'issue' }
  if (typeof r.provider !== 'string' || providerById(r.provider) === undefined) return { kind: 'malformed', reason: 'provider' }
  if (typeof r.title !== 'string') return { kind: 'malformed', reason: 'title' }
  if (typeof r.dispatchedAt !== 'number' || !Number.isFinite(r.dispatchedAt) || r.dispatchedAt > now + CLOCK_SKEW_MS) return { kind: 'malformed', reason: 'dispatchedAt' }
  if (r.pr !== undefined && !isIssueNumber(r.pr)) return { kind: 'malformed', reason: 'pr' }
  if (r.workItemId !== undefined && (typeof r.workItemId !== 'string' || r.workItemId === '')) return { kind: 'malformed', reason: 'workItemId' }
  if (r.handoff !== undefined && r.handoff !== 'failed') return { kind: 'malformed', reason: 'handoff' }
  if (typeof r.state !== 'string' || !(CLOUD_LANE_STATES as readonly string[]).includes(r.state)) return { kind: 'malformed', reason: 'state' }
  const lane: CloudLane = {
    id: r.id, repo: r.repo, issue: r.issue as number, provider: r.provider as CloudProviderId,
    title: r.title, dispatchedAt: r.dispatchedAt, state: r.state as CloudLaneState
  }
  if (r.pr !== undefined) lane.pr = r.pr as number
  if (r.workItemId !== undefined) lane.workItemId = r.workItemId as string
  if (r.handoff === 'failed') lane.handoff = 'failed'
  return { kind: 'lane', lane }
}

const isIssueNumber = (v: unknown): boolean => typeof v === 'number' && Number.isInteger(v) && v > 0

// ── What a board task sends ────────────────────────────────────────────────

/**
 * M543. The request a board task becomes, or the sentence why it cannot.
 * Pure over the task's own fields so every door (the card's Cloud menu, the
 * palette row, an agent line, an action node) builds the same request:
 *
 * - a task added from a GitHub ISSUE hands that issue over (`repo`, `issue`);
 *   a pull request is refused — it is already someone's work;
 * - any other task names its lane's folder, and main reads the repository
 *   from that folder's origin remote; with no lane there is nothing to read,
 *   and that is said rather than guessed.
 * - a task with a lane still in flight is refused, so one task never has two
 *   cloud agents racing each other on it.
 */
export function cloudDispatchFor(
  item: { id: string; source: string; key?: string; url?: string; title: string; description?: string; brief?: string; criteria?: readonly string[] },
  provider: string,
  laneCwd: string | undefined,
  existing: readonly Pick<CloudLane, 'workItemId' | 'state'>[]
): { provider: CloudProviderId; title: string; task: string; workItemId: string; repo?: string; issue?: number; cwd?: string } | { refused: string } {
  const row = providerById(provider)
  if (row === undefined) return { refused: `${JSON.stringify(provider)} is not a cloud agent — ${PROVIDERS.map((p) => p.id).join(' or ')}` }
  if (existing.some((l) => l.workItemId === item.id && !isSettled(l.state))) return { refused: 'this task already has a cloud lane in flight — wait for it to settle, or forget it first' }
  const parts = [item.brief, item.description].filter((s): s is string => typeof s === 'string' && s.trim() !== '')
  const criteria = (item.criteria ?? []).filter((c) => c.trim() !== '')
  const task = [parts.length === 0 ? item.title : parts.join('\n\n'), ...(criteria.length === 0 ? [] : ['Done when:', ...criteria.map((c) => `- ${c}`)])].join('\n')
  const base = { provider: row.id, title: item.title, task, workItemId: item.id }
  if (item.source === 'github' && item.key !== undefined) {
    const m = /^([^/\s#]+\/[^/\s#]+)#(\d+)$/.exec(item.key)
    if (m !== null) {
      if (item.url !== undefined && /\/pull\/\d+/.test(item.url)) return { refused: `${item.key} is a pull request — a cloud agent is handed an issue` }
      return { ...base, repo: m[1] as string, issue: Number(m[2]) }
    }
  }
  if (laneCwd === undefined) return { refused: 'this task has no repository yet — start it in a repository first, or add it from a GitHub issue' }
  return { ...base, cwd: laneCwd }
}
