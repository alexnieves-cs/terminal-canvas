import type { WorkItem } from '../shared/work-item'
import { NOT_CONNECTED_CODE } from '../shared/credential-schema'
import { stripAnsi } from '../shared/ansi'

/**
 * M88. THE GITHUB CLIENT — "GitHub through the broker", literally: the client
 * never reads the credential store. It asks the broker (M87) for
 * `GET /issues` and `GET /search/issues`, so the token stays the broker's,
 * the credential store keeps exactly its three readers (`verify:meta
 * readers.1`), and every read the panel makes is an audit row beside the
 * agents' own calls. `verify:github` runs under plain node over a fake
 * broker with recorded bodies; `npm run verify` never calls api.github.com.
 *
 * Two requests, one answer: the issues assigned to the user, and the pull
 * requests waiting on their review. Both become `WorkItem`s keyed
 * `owner/repo#N`, which is what a person calls them.
 */

export interface GithubBroker {
  call(req: { service: string; method: string; path: string; body?: string; panelId?: string; teammateId?: string }): Promise<{ ok: true; status: number; body: string; truncated: boolean } | { ok: false; reason: string; code?: string }>
}
export interface GithubDeps { broker: GithubBroker; panelId?: string; /** M115. The teammate spending: rides to the broker, whose own write gate asks the spend card. */ teammateId?: string }

export type GithubListResult =
  | { kind: 'items'; items: WorkItem[]; /** When the PR search alone failed: the issues stand, and this says what is missing. */ note?: string }
  | { kind: 'no-credential' | 'rejected' | 'unavailable' | 'malformed'; reason: string }

const DESCRIPTION_MAX = 2000
export const PAGE = 50

/**
 * A body is what an author typed: `\r\n`, an issue template's HTML comments,
 * and any control byte at all. It is pasted into an agent's terminal as the
 * opening context, so ESC and its friends are stripped here; newlines and
 * tabs stay. Rendering in the node is React text and needs nothing.
 */
function cleanBody(body: string): string {
  // Whole escape SEQUENCES through M39's stripper, then any stray control
  // byte: an ESC removed alone leaves `[2J` as text, which is honest but
  // ugly; the sequence removed whole is what the author did not type.
  return stripAnsi(body.replace(/\r\n?/g, '\n')).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
}
export const ISSUES_PATH = '/issues?filter=assigned&state=open&per_page=50&sort=updated'
export const REVIEW_PATH = `/search/issues?q=${encodeURIComponent('is:pr is:open review-requested:@me')}&per_page=50`

/** `https://api.github.com/repos/acme/canvas` → `acme/canvas`; a `repository.full_name` verbatim. */
function repoOf(record: { repository?: { full_name?: unknown }; repository_url?: unknown }): string | null {
  if (typeof record.repository?.full_name === 'string') return record.repository.full_name
  if (typeof record.repository_url === 'string') {
    const m = /\/repos\/([^/]+\/[^/]+)$/.exec(record.repository_url)
    if (m !== null) return m[1] as string
  }
  return null
}

function toItem(raw: unknown, stateWord: string | null): WorkItem | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as { number?: unknown; title?: unknown; body?: unknown; state?: unknown; html_url?: unknown; assignee?: { login?: unknown } | null; user?: { login?: unknown } | null; pull_request?: unknown }
  const repo = repoOf(r as { repository?: { full_name?: unknown }; repository_url?: unknown })
  if (typeof r.number !== 'number' || typeof r.title !== 'string' || repo === null || typeof r.html_url !== 'string') return null
  const body = typeof r.body === 'string' ? cleanBody(r.body) : ''
  return {
    id: `${repo}#${r.number}`,
    title: r.title,
    description: body.length > DESCRIPTION_MAX ? body.slice(0, DESCRIPTION_MAX) : body,
    // The ASSIGNEE, and only the assignee: a review request's `user` is its
    // author, which is a different fact, and one field must not mean two.
    assignee: typeof r.assignee?.login === 'string' ? r.assignee.login : null,
    // A PR that arrived through the issues list is still a PR: say so.
    state: stateWord ?? (r.pull_request !== undefined && r.pull_request !== null ? 'pull request' : typeof r.state === 'string' ? r.state : null),
    url: r.html_url
  }
}

/** The broker's own refusal, sorted into the panel's arms: no credential is its own state. */
function refusal(answer: { reason: string; code?: string }): GithubListResult {
  return answer.code === NOT_CONNECTED_CODE ? { kind: 'no-credential', reason: answer.reason } : { kind: 'unavailable', reason: answer.reason }
}

/** GitHub's own sentence, when its body carries one. */
function messageOf(body: string): string | null {
  try { const m = (JSON.parse(body) as { message?: unknown }).message; return typeof m === 'string' ? m : null } catch { return null }
}

export async function listAssignedWorkItems(deps: GithubDeps): Promise<GithubListResult> {
  const issues = await deps.broker.call({ service: 'github', method: 'GET', path: ISSUES_PATH, ...(deps.panelId === undefined ? {} : { panelId: deps.panelId }) })
  if (!issues.ok) return refusal(issues)
  // 401 is a bad credential. 403 is NOT: GitHub answers it for secondary
  // rate limiting and for an SSO-protected org with a token that is fine,
  // and telling the user to fix their token would send them to the wrong
  // door (M88's verifier). Its own message names the real cause.
  if (issues.status === 401) return { kind: 'rejected', reason: 'GitHub rejected the credential.' }
  if (issues.status === 403) return { kind: 'unavailable', reason: `GitHub refused the request — ${messageOf(issues.body) ?? 'a rate limit, or an organisation that needs SSO authorisation for this token'}.` }
  if (issues.status !== 200) return { kind: 'unavailable', reason: `GitHub answered ${issues.status}.` }
  if (issues.truncated) return { kind: 'unavailable', reason: 'GitHub answered with more than this app reads at once — the list is too large to show.' }
  let parsed: unknown
  try { parsed = JSON.parse(issues.body) } catch { return { kind: 'malformed', reason: 'GitHub returned a response this app could not read.' } }
  if (!Array.isArray(parsed)) return { kind: 'malformed', reason: 'GitHub returned no issue list.' }
  const items: WorkItem[] = []
  const seen = new Set<string>()
  for (const raw of parsed) {
    const item = toItem(raw, null)
    if (item === null || seen.has(item.id)) continue
    seen.add(item.id)
    items.push(item)
  }
  // The review requests: a failure HERE leaves the issues standing with a
  // note — half an answer that says which half is a better answer than
  // none, and than a whole one that quietly lacks the PRs.
  const notes: string[] = []
  if (parsed.length >= PAGE) notes.push(`the first ${PAGE} issues — there may be more`)
  let note: string | undefined
  const search = await deps.broker.call({ service: 'github', method: 'GET', path: REVIEW_PATH, ...(deps.panelId === undefined ? {} : { panelId: deps.panelId }) })
  if (!search.ok) note = `the pull requests waiting on you could not be listed — ${search.reason}`
  else if (search.status !== 200) note = `the pull requests waiting on you could not be listed — GitHub answered ${search.status}`
  else if (search.truncated) note = 'the pull requests waiting on you could not be read — the answer was too large'
  else {
    let found: unknown
    let total: unknown
    try { const p = JSON.parse(search.body) as { items?: unknown; total_count?: unknown }; found = p.items; total = p.total_count } catch { found = undefined }
    if (typeof total === 'number' && Array.isArray(found) && total > found.length) notes.push(`the first ${found.length} of ${total} review requests`)
    if (Array.isArray(found)) {
      for (const raw of found) {
        const item = toItem(raw, 'review requested')
        if (item === null) continue
        if (seen.has(item.id)) { const i = items.findIndex((x) => x.id === item.id); if (i >= 0) items[i] = item; continue }
        seen.add(item.id)
        items.push(item)
      }
    } else note = 'the pull requests waiting on you could not be read'
  }
  if (note !== undefined) notes.push(note)
  return { kind: 'items', items, ...(notes.length === 0 ? {} : { note: notes.join(' · ') }) }
}

/** M115. What `Open PR` answers. `exists` is a success the card records; every refusal names its arm in the credential rows' words. */
export type OpenPrResult =
  | { kind: 'opened' | 'exists'; number: number; url: string }
  | { kind: 'no-credential' | 'rejected' | 'unavailable' | 'malformed' | 'refused'; reason: string }

export type CommentResult =
  | { kind: 'commented'; url: string }
  | { kind: 'no-credential' | 'rejected' | 'unavailable' | 'malformed' | 'refused'; reason: string }

const ride = (deps: GithubDeps): { panelId?: string; teammateId?: string } => ({ ...(deps.panelId === undefined ? {} : { panelId: deps.panelId }), ...(deps.teammateId === undefined ? {} : { teammateId: deps.teammateId }) })

/** The broker's refusal for a WRITE: not-connected is the credential arm; a teammate's unanswered or ungranted write is `refused` with the broker's own sentence. */
function writeRefusal(answer: { reason: string; code?: string }): { kind: 'no-credential' | 'refused' | 'unavailable'; reason: string } {
  if (answer.code === NOT_CONNECTED_CODE) return { kind: 'no-credential', reason: answer.reason }
  if (answer.code === 'not-answered' || answer.code === 'not-granted') return { kind: 'refused', reason: answer.reason }
  return { kind: 'unavailable', reason: answer.reason }
}

/**
 * M115. ONE POST to /repos/{owner}/{repo}/pulls through the broker — never
 * the credential store (three readers stay three). The teammate rides so
 * the broker's own write gate asks M102's spend card. GitHub's 422 "already
 * exists" is a PR the card should know about, not a failure: one GET by head
 * finds it.
 */
export async function openPullRequest(deps: GithubDeps, req: { repo: string; head: string; base: string; title: string; body: string }): Promise<OpenPrResult> {
  const path = `/repos/${req.repo}/pulls`
  const answer = await deps.broker.call({ service: 'github', method: 'POST', path, body: JSON.stringify({ title: req.title, head: req.head, base: req.base, body: req.body }), ...ride(deps) })
  if (!answer.ok) return writeRefusal(answer)
  if (answer.status === 401) return { kind: 'rejected', reason: 'GitHub rejected the credential.' }
  if (answer.status === 422 && /already exists/i.test(answer.body)) {
    const owner = req.repo.split('/')[0] ?? ''
    const found = await deps.broker.call({ service: 'github', method: 'GET', path: `${path}?state=open&head=${encodeURIComponent(`${owner}:${req.head}`)}`, ...ride(deps) })
    if (!found.ok) return writeRefusal(found)
    let list: unknown
    try { list = JSON.parse(found.body) } catch { return { kind: 'malformed', reason: 'GitHub returned a response this app could not read.' } }
    const first = Array.isArray(list) ? (list[0] as { number?: unknown; html_url?: unknown } | undefined) : undefined
    if (first === undefined || typeof first.number !== 'number' || typeof first.html_url !== 'string') return { kind: 'malformed', reason: 'GitHub says a pull request exists but did not list it.' }
    return { kind: 'exists', number: first.number, url: first.html_url }
  }
  if (answer.status === 403) return { kind: 'unavailable', reason: `GitHub refused the request — ${messageOf(answer.body) ?? 'a rate limit, or an organisation that needs SSO authorisation for this token'}.` }
  if (answer.status !== 201) return { kind: 'unavailable', reason: `GitHub answered ${answer.status}${messageOf(answer.body) === null ? '' : ` — ${messageOf(answer.body)}`}.` }
  let parsed: { number?: unknown; html_url?: unknown }
  try { parsed = JSON.parse(answer.body) as { number?: unknown; html_url?: unknown } } catch { return { kind: 'malformed', reason: 'GitHub returned a response this app could not read.' } }
  if (typeof parsed.number !== 'number' || typeof parsed.html_url !== 'string') return { kind: 'malformed', reason: 'GitHub opened a pull request but did not say which.' }
  return { kind: 'opened', number: parsed.number, url: parsed.html_url }
}

/** M115. The second card: a comment on the issue naming the PR. Same door, same arms. */
export async function commentIssue(deps: GithubDeps, req: { repo: string; number: number; body: string }): Promise<CommentResult> {
  const answer = await deps.broker.call({ service: 'github', method: 'POST', path: `/repos/${req.repo}/issues/${req.number}/comments`, body: JSON.stringify({ body: req.body }), ...ride(deps) })
  if (!answer.ok) return writeRefusal(answer)
  if (answer.status === 401) return { kind: 'rejected', reason: 'GitHub rejected the credential.' }
  if (answer.status !== 201) return { kind: 'unavailable', reason: `GitHub answered ${answer.status}${messageOf(answer.body) === null ? '' : ` — ${messageOf(answer.body)}`}.` }
  let parsed: { html_url?: unknown }
  try { parsed = JSON.parse(answer.body) as { html_url?: unknown } } catch { return { kind: 'malformed', reason: 'GitHub returned a response this app could not read.' } }
  return { kind: 'commented', url: typeof parsed.html_url === 'string' ? parsed.html_url : '' }
}
