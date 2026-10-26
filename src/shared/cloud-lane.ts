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
 *   is re-derived on the next poll rather than trusted.
 * - **Ready means a check passed.** A PR with no checks is `needs-you`, not
 *   `ready`: the M475 rule ("done means a check passed, not that the agent
 *   said so") holds for an agent we cannot see as much as one we can.
 * - **A lane finds its PR by the issue it was handed**, not by the author,
 *   because a provider may open its PR as a bot, as `github-actions`, or not
 *   at all until a person presses a link.
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
  mention?: string
  /** What the person must have set up on the repository first, said where the lane is created. */
  needs: string
}

/**
 * The assignee login and the mention are GitHub's and Anthropic's names as
 * documented when this was written; they are listed as manual-only facts in
 * docs/load-bearing.md, because `npm run verify` never calls GitHub.
 */
export const PROVIDERS: readonly CloudProvider[] = [
  {
    id: 'copilot',
    label: 'Copilot coding agent',
    dispatch: 'assign',
    assignee: 'copilot-swe-agent',
    needs: 'Copilot coding agent enabled for this repository'
  },
  {
    id: 'claude-action',
    label: 'Claude (GitHub Action)',
    dispatch: 'comment',
    mention: '@claude',
    needs: 'the Claude GitHub app and its workflow installed in this repository'
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
  status: 'queued' | 'in_progress' | 'completed'
  /** GitHub's conclusion; null until completed. */
  conclusion: string | null
}

export interface ReviewFact {
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING'
  submittedAt: number
}

export interface CloudFacts {
  issue: IssueFact
  pr: PrFact | null
  checks: readonly CheckFact[]
  reviews: readonly ReviewFact[]
}

/** How long a lane may wait for a PR before the person is told it may not have started. */
export const NO_PR_AFTER_MS = 2 * 60 * 60 * 1000

/**
 * A conclusion that counts as passing. `skipped` and `neutral` pass because
 * GitHub's own merge box treats them so; anything unknown fails rather than
 * passes, since a new conclusion GitHub adds should not quietly mean ready.
 */
const PASSING = new Set(['success', 'neutral', 'skipped'])

export interface DerivedState { state: CloudLaneState; reason: string }

export function cloudLaneState(lane: Pick<CloudLane, 'dispatchedAt'>, facts: CloudFacts, now: number): DerivedState {
  const { pr, issue } = facts
  if (pr !== null && pr.merged) return { state: 'merged', reason: `#${pr.number} merged` }
  if (pr !== null && pr.state === 'closed') return { state: 'closed', reason: `#${pr.number} closed without merging` }
  if (pr === null) {
    if (issue.state === 'closed') return { state: 'closed', reason: `issue #${issue.number} closed with no pull request` }
    if (now - lane.dispatchedAt > NO_PR_AFTER_MS) return { state: 'needs-you', reason: 'no pull request after two hours — the agent may not have picked the issue up' }
    return { state: 'dispatched', reason: `waiting for a pull request on issue #${issue.number}` }
  }
  if (pr.draft) return { state: 'working', reason: `#${pr.number} is a draft — the agent is still working` }
  // The latest decisive review wins; a COMMENTED review decides nothing.
  const decisive = [...facts.reviews]
    .filter((r) => r.state === 'APPROVED' || r.state === 'CHANGES_REQUESTED')
    .sort((a, b) => a.submittedAt - b.submittedAt)
    .pop()
  if (decisive?.state === 'CHANGES_REQUESTED') return { state: 'working', reason: `changes requested on #${pr.number}` }
  const checks = latestByName(facts.checks)
  if (checks.length === 0) return { state: 'needs-you', reason: `#${pr.number} has no checks — nothing but the agent says it works` }
  const failed = checks.filter((c) => c.status === 'completed' && !PASSING.has(c.conclusion ?? ''))
  if (failed.length > 0) return { state: 'failed', reason: `${failed.map((c) => c.name).join(', ')} failed on #${pr.number}` }
  const running = checks.filter((c) => c.status !== 'completed')
  if (running.length > 0) return { state: 'checks-running', reason: `${running.length} of ${checks.length} checks running on #${pr.number}` }
  return { state: 'ready', reason: `every check passed on #${pr.number}` }
}

/**
 * A re-run adds a second check run under the same name, and GitHub lists the
 * newest first. Keeping the first of each name means a failure that was
 * re-run green no longer counts — and a green run re-run red does.
 */
function latestByName(checks: readonly CheckFact[]): CheckFact[] {
  const seen = new Map<string, CheckFact>()
  for (const c of checks) if (!seen.has(c.name)) seen.set(c.name, c)
  return [...seen.values()]
}

/**
 * Which PR is this lane's. A PR qualifies when its body closes the issue
 * (`Fixes #12`, `closes #12`, `Resolves owner/repo#12`) or its head branch
 * names the issue number as a whole segment (`copilot/fix-12`, `claude/issue-12-…`).
 * The body test comes first because a branch name is a guess and a closing
 * reference is a statement. Among several, the newest wins: a provider that
 * gave up and started again opened the later one.
 */
export function findLanePr(issue: number, prs: readonly PrFact[], repo?: string): PrFact | null {
  const n = String(issue)
  const ref = repo === undefined ? `#${n}` : `(?:${escape(repo)})?#${n}`
  const closes = new RegExp(`\\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\\s*:?\\s+${ref}(?!\\d)`, 'i')
  const branch = new RegExp(`(?:^|[/_-])${n}(?:$|[/_-])`)
  const byBody = prs.filter((p) => closes.test(p.body))
  const pool = byBody.length > 0 ? byBody : prs.filter((p) => branch.test(p.head))
  if (pool.length === 0) return null
  return [...pool].sort((a, b) => b.createdAt - a.createdAt)[0] ?? null
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// ── Dispatch, as the requests main sends through the broker ─────────────────

/** The marker that lets a lane be found again from its issue alone. */
export const LANE_MARKER = (id: string): string => `<!-- terminal-canvas cloud lane ${id} -->`

export interface GithubWrite { method: 'POST'; path: string; body: string }

/**
 * The issue a lane starts from. `task` must already be scrubbed — this module
 * cannot import the scrubber (it is main's), and the caller in
 * `main/cloud-lanes.ts` is on `outward`'s list for that reason.
 */
export function issueRequest(repo: string, id: string, title: string, task: string): GithubWrite {
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

export type ParsedCloudLane = { kind: 'lane'; lane: CloudLane } | { kind: 'malformed'; reason: string }

/**
 * A lane read back from disk. An absent optional key is fine; a present one
 * of the wrong type is malformed, named, and dropped by the caller rather
 * than coerced — a PR number of "12" is not the same lane as one of 12.
 */
export function parseCloudLane(raw: unknown): ParsedCloudLane {
  if (raw === null || typeof raw !== 'object') return { kind: 'malformed', reason: 'not an object' }
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || r.id.length === 0) return { kind: 'malformed', reason: 'id' }
  if (typeof r.repo !== 'string' || !REPO.test(r.repo) || r.repo.split('/').some((p) => p === '.' || p === '..')) return { kind: 'malformed', reason: 'repo' }
  if (!isIssueNumber(r.issue)) return { kind: 'malformed', reason: 'issue' }
  if (typeof r.provider !== 'string' || providerById(r.provider) === undefined) return { kind: 'malformed', reason: 'provider' }
  if (typeof r.title !== 'string') return { kind: 'malformed', reason: 'title' }
  if (typeof r.dispatchedAt !== 'number' || !Number.isFinite(r.dispatchedAt)) return { kind: 'malformed', reason: 'dispatchedAt' }
  if (r.pr !== undefined && !isIssueNumber(r.pr)) return { kind: 'malformed', reason: 'pr' }
  if (typeof r.state !== 'string' || !(CLOUD_LANE_STATES as readonly string[]).includes(r.state)) return { kind: 'malformed', reason: 'state' }
  const lane: CloudLane = {
    id: r.id, repo: r.repo, issue: r.issue as number, provider: r.provider as CloudProviderId,
    title: r.title, dispatchedAt: r.dispatchedAt, state: r.state as CloudLaneState
  }
  if (r.pr !== undefined) lane.pr = r.pr as number
  return { kind: 'lane', lane }
}

const isIssueNumber = (v: unknown): boolean => typeof v === 'number' && Number.isInteger(v) && v > 0
