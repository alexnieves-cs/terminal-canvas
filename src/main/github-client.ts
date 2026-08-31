/**
 * The second tier-2 work adapter, and the one that pays for the surface.
 *
 * It reaches GitHub only through the injected `WorkRequester`, and it reads the
 * token only through `CredentialStore.read()` — which stays main-internal, is
 * never returned from a handler, and is exactly why `verify:work` can drive
 * this whole file offline. The M14 boundary is INHERITED here rather than
 * reinvented: no return from this module carries a secret, and the credential
 * never leaves main.
 */
import type { CredentialStore } from './credential-store'
import type { WorkItem, WorkGroup, WorkListResult } from '../shared/work-item'
import { WORK_TIMEOUT_MS, type WorkRequester, type WorkResponse } from './work-request'

const SEARCH = 'https://api.github.com/search/issues'
const PER_PAGE = 50

/**
 * The two questions, in the order they are rendered.
 *
 * `author:@me` is deliberately ABSENT: your own open PR is either assigned to
 * you — the first query — or it is waiting on somebody else, which makes it
 * their work item and not yours. A third query would add a third failure path
 * in order to restate a set we mostly already have.
 */
const QUERIES: readonly { label: string; q: string }[] = [
  { label: 'Assigned to you', q: 'is:open assignee:@me' },
  { label: 'Awaiting your review', q: 'is:open review-requested:@me' }
]

export interface GithubDeps { store: CredentialStore; requester: WorkRequester }

function token(store: CredentialStore): string | 'missing' | 'invalid' {
  const value = store.read('github')
  if (value === undefined) return 'missing'
  const trimmed = value.trim()
  // A bare opaque string, unlike Jira's three-field bundle — so there is
  // nothing to parse beyond refusing an EMPTY one, which would otherwise put a
  // bare `Bearer ` on the wire and come back as a rejection the user cannot
  // act on, because the token they are being told to check is fine.
  return trimmed === '' ? 'invalid' : trimmed
}

function headers(bearer: string): Record<string, string> {
  return {
    Authorization: `Bearer ${bearer}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    // MANDATORY. Without it GitHub answers 403 with an administrative-rules
    // message, which is indistinguishable at this layer from a rejected token
    // — so the panel would report "GitHub rejected the credential" for a
    // perfectly good PAT, on every machine, forever. credential-verify.ts
    // already sends this on its own GET /user; this is the same fact, in the
    // app's second GitHub caller.
    'User-Agent': 'terminal-canvas'
  }
}

function url(q: string): string {
  const params = new URLSearchParams({
    q,
    sort: 'updated',
    order: 'desc',
    per_page: String(PER_PAGE),
    advanced_search: 'true'
  })
  return `${SEARCH}?${params}`
}

/**
 * `repository_url` is the only place a search result names its repository, and
 * `owner/repo#123` is what a user can paste into a browser, a shell or an
 * agent. A bare number would be ambiguous the moment two repositories appear.
 */
function itemId(record: { repository_url?: unknown; number?: unknown }): string | null {
  if (typeof record.repository_url !== 'string' || typeof record.number !== 'number') return null
  const repo = record.repository_url.split('/').slice(-2).join('/')
  return repo === '' ? null : `${repo}#${record.number}`
}

function mapItem(raw: unknown): WorkItem | null {
  if (raw === null || typeof raw !== 'object') return null
  const record = raw as {
    number?: unknown; title?: unknown; body?: unknown; html_url?: unknown
    state?: unknown; draft?: unknown; assignee?: { login?: unknown }; repository_url?: unknown
  }
  const id = itemId(record)
  if (id === null || typeof record.title !== 'string' || typeof record.html_url !== 'string') return null
  return {
    id,
    title: record.title,
    description: typeof record.body === 'string' ? record.body : '',
    assignee: typeof record.assignee?.login === 'string' ? record.assignee.login : null,
    // `draft` outranks `state`, because GitHub reports a draft PR as `open` and
    // "open" is the one thing a draft is not asking you to act on.
    state: record.draft === true ? 'draft' : typeof record.state === 'string' ? record.state : null,
    url: record.html_url
  }
}

function failure(
  response: WorkResponse
): { kind: 'rejected' | 'rate-limited' | 'unavailable'; reason: string } | null {
  if (response.status === 200) return null
  // THE 403 SPLIT. GitHub reports a rejected token and an exhausted search rate
  // limit with the SAME status, and they are two situations with two different
  // fixes — regenerate the token, or wait. Collapsing them tells a
  // rate-limited user their credential is bad, and they go and replace a
  // credential that was fine. `x-ratelimit-remaining` is the only thing that
  // separates them, which is the whole reason WorkResponse carries headers.
  if (response.status === 403 && response.headers['x-ratelimit-remaining'] === '0') {
    return { kind: 'rate-limited', reason: 'GitHub’s search rate limit is spent. Try again shortly.' }
  }
  if (response.status === 401 || response.status === 403) {
    return { kind: 'rejected', reason: 'GitHub rejected the credential.' }
  }
  return { kind: 'unavailable', reason: `GitHub answered ${response.status}.` }
}

export async function listGithubWorkItems(deps: GithubDeps): Promise<WorkListResult> {
  const bearer = token(deps.store)
  if (bearer === 'missing') return { kind: 'no-credential', reason: 'Connect GitHub before loading work.' }
  if (bearer === 'invalid') return { kind: 'invalid-credential', reason: 'The stored GitHub credential is empty.' }

  const groups: WorkGroup[] = []
  // Deduped ACROSS groups, and the order of QUERIES is what decides the
  // winner: an item in both piles is listed under the earlier one. Stated as
  // an ordering rather than as a PR-versus-issue rule, so a third provider's
  // groups inherit it without a second decision. Keyed on `html_url`, which is
  // GitHub's own permalink, rather than on the id this file derives by
  // splitting a string.
  const seen = new Set<string>()

  for (const query of QUERIES) {
    let response: WorkResponse
    try {
      response = await deps.requester({ url: url(query.q), headers: headers(bearer), timeoutMs: WORK_TIMEOUT_MS })
    } catch {
      return { kind: 'unavailable', reason: 'GitHub could not be reached.' }
    }
    // Any failed request fails the WHOLE load. A partial answer rendered as a
    // complete one is a wrong answer the user cannot detect: somebody looking
    // at one group has no way to know the other query returned 500, and would
    // read the gap as "nothing is waiting on me".
    const failed = failure(response)
    if (failed !== null) return failed

    let payload: { total_count?: unknown; items?: unknown }
    try {
      payload = JSON.parse(response.body) as { total_count?: unknown; items?: unknown }
    } catch {
      return { kind: 'malformed', reason: 'GitHub returned a response this app could not read.' }
    }
    if (!Array.isArray(payload.items)) {
      return { kind: 'malformed', reason: 'GitHub returned no result list.' }
    }

    const items: WorkItem[] = []
    for (const raw of payload.items) {
      const item = mapItem(raw)
      if (item === null || seen.has(item.url)) continue
      seen.add(item.url)
      items.push(item)
    }
    groups.push({
      label: query.label,
      items,
      // The service's OWN count, which may exceed what it returned: a group
      // holding 50 of 231 must be able to say so rather than silently
      // stopping — REVIEW_FILE_CAP's `+N more` rule, one layer out.
      total: typeof payload.total_count === 'number' ? payload.total_count : items.length
    })
  }

  return { kind: 'groups', groups }
}
