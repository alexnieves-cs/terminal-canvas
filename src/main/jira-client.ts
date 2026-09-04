import { request } from 'node:https'
import type { CredentialMeta } from '../shared/credential-schema'
// ONE declaration, in the contract, and this module imports it. Each of these
// used to be declared here AND in ipc-contract.ts; ipcMain.handle is not typed
// by the contract, so the copies drifted with tsc silent, and the failure was
// the renderer reading `undefined` — an empty transition list, which is what a
// ticket with no legal moves also looks like. `import type` is erased by
// esbuild, so the plain-node verify:jira bundle is untouched. verify:jira
// types.1 pins the arrangement.
import type { JiraListResult, JiraTransitionsResult, JiraWriteResult } from '../shared/ipc-contract'
import type { WorkItem, WorkItemTransition } from '../shared/work-item'
import type { CredentialStore } from './credential-store'

const TIMEOUT_MS = 15000
const MAX_BODY_BYTES = 1024 * 1024
const ASSIGNED_JQL = 'assignee = currentUser() ORDER BY updated DESC'

export interface JiraCredential { site: string; email: string; token: string }
/**
 * The injected seam. `method` is REQUIRED and not optional-with-a-default,
 * because an optional method means a write function that forgot to set it
 * performs a GET against a POST endpoint — a request that succeeds and does
 * nothing. Required makes tsc list every call site instead.
 */
export interface JiraRequest {
  url: string
  method: 'GET' | 'POST'
  headers: Record<string, string>
  timeoutMs: number
  /** JSON, already serialised. Absent on every GET. */
  body?: string
}
export type JiraRequester = (request: JiraRequest) => Promise<{ status: number; body: string }>
export interface JiraDeps { store: CredentialStore; requester: JiraRequester }
export type JiraVerifyResult = { ok: true; meta: CredentialMeta } | { ok: false; reason: string }
/**
 * The store holds one opaque string, and this parser is its only reader.
 *
 * Say what actually holds, not the broader thing: **`email` and `token` never
 * cross IPC**, and `site` DOES — `WorkItem.url` is `${site}/browse/${key}`,
 * which is the whole point of that field, since the renderer needs the tenant
 * host to render a browse link. "The bundle stays behind this module" is the
 * tempting sentence and it is false of one of the three fields; an invariant
 * stated more broadly than it holds is worse than one stated narrowly, because
 * the next reader trusts the broad version.
 */
export function parseJiraCredential(value: string): JiraCredential | null {
  try {
    const parsed = JSON.parse(value) as Partial<JiraCredential>
    const site = typeof parsed.site === 'string' ? parsed.site.replace(/\/$/, '') : ''
    // Through the URL parser, not a regex alone: `https://evil.test#x.atlassian.net`
    // passed the regex while its HOST was evil.test (M87's verifier).
    let host = ''
    try { const u = new URL(site); host = u.host; if (u.pathname !== '/' || u.search !== '' || u.hash !== '' || u.username !== '' || u.password !== '') return null } catch { return null }
    if (!/^[^/]+\.atlassian\.net$/i.test(host) ||
      typeof parsed.email !== 'string' || parsed.email.trim() === '' ||
      typeof parsed.token !== 'string' || parsed.token.trim() === '') return null
    return { site, email: parsed.email.trim(), token: parsed.token.trim() }
  } catch { return null }
}

function credential(store: CredentialStore): JiraCredential | 'missing' | 'invalid' {
  const value = store.read('jira')
  if (value === undefined) return 'missing'
  return parseJiraCredential(value) ?? 'invalid'
}

function auth(c: JiraCredential): Record<string, string> {
  return { Authorization: `Basic ${Buffer.from(`${c.email}:${c.token}`).toString('base64')}`, Accept: 'application/json' }
}

export async function verifyJiraCredential(deps: JiraDeps): Promise<JiraVerifyResult> {
  const c = credential(deps.store)
  if (c === 'missing') return { ok: false, reason: 'no stored credential to verify' }
  if (c === 'invalid') return { ok: false, reason: 'stored Jira credential is malformed' }
  let response: { status: number; body: string }
  try { response = await deps.requester({ url: `${c.site}/rest/api/3/myself`, method: 'GET', headers: auth(c), timeoutMs: TIMEOUT_MS }) }
  catch { return { ok: false, reason: 'the request to Jira failed' } }
  if (response.status === 401 || response.status === 403) return { ok: false, reason: 'Jira rejected the credential' }
  if (response.status !== 200) return { ok: false, reason: `Jira answered ${response.status}` }
  try {
    const displayName = (JSON.parse(response.body) as { displayName?: unknown }).displayName
    if (typeof displayName !== 'string' || displayName === '') return { ok: false, reason: 'Jira returned no account name' }
    deps.store.setLabel('jira', displayName)
    const meta = deps.store.list().find((entry) => entry.service === 'jira')
    return meta ? { ok: true, meta } : { ok: false, reason: 'the credential vanished mid-verify' }
  } catch { return { ok: false, reason: 'Jira returned a response this app could not read' } }
}

export function adfText(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === null || typeof value !== 'object') return ''
  const node = value as { type?: unknown; text?: unknown; content?: unknown }
  const own = typeof node.text === 'string' ? node.text : ''
  const children = Array.isArray(node.content) ? node.content.map(adfText).join('') : ''
  return node.type === 'paragraph' ? `${own}${children}\n` : node.type === 'hardBreak' ? '\n' : `${own}${children}`
}

/**
 * The inverse of adfText, and deliberately no more capable than it: Jira
 * Cloud's v3 comment endpoint requires Atlassian Document Format going in,
 * and this builds exactly the subset adfText can flatten back out. Reaching
 * for a Markdown-to-ADF converter here would invent a format the read half
 * cannot round-trip, so a comment would not read back as it was typed.
 */
export function textToAdf(text: string): unknown {
  return {
    type: 'doc',
    version: 1,
    content: text.split('\n').map((line) => ({
      type: 'paragraph',
      content: line === '' ? [] : [{ type: 'text', text: line }]
    }))
  }
}

export async function listAssignedWorkItems(deps: JiraDeps): Promise<JiraListResult> {
  const c = credential(deps.store)
  if (c === 'missing') return { kind: 'no-credential', reason: 'Connect Jira before loading tickets.' }
  if (c === 'invalid') return { kind: 'invalid-credential', reason: 'The stored Jira credential is malformed.' }
  const query = new URLSearchParams({ jql: ASSIGNED_JQL, maxResults: '50', fields: 'summary,description,assignee,status' })
  let response: { status: number; body: string }
  try { response = await deps.requester({ url: `${c.site}/rest/api/3/search/jql?${query}`, method: 'GET', headers: auth(c), timeoutMs: TIMEOUT_MS }) }
  catch { return { kind: 'unavailable', reason: 'Jira could not be reached.' } }
  if (response.status === 401 || response.status === 403) return { kind: 'rejected', reason: 'Jira rejected the credential.' }
  if (response.status !== 200) return { kind: 'unavailable', reason: `Jira answered ${response.status}.` }
  try {
    const issues = (JSON.parse(response.body) as { issues?: unknown }).issues
    if (!Array.isArray(issues)) return { kind: 'malformed', reason: 'Jira returned no issue list.' }
    const items: WorkItem[] = []
    for (const issue of issues) {
      const record = issue as { key?: unknown; fields?: { summary?: unknown; description?: unknown; assignee?: { displayName?: unknown }; status?: { name?: unknown } } }
      if (typeof record.key !== 'string' || typeof record.fields?.summary !== 'string') continue
      items.push({ id: record.key, title: record.fields.summary, description: adfText(record.fields.description).trim(), assignee: typeof record.fields.assignee?.displayName === 'string' ? record.fields.assignee.displayName : null, state: typeof record.fields.status?.name === 'string' ? record.fields.status.name : null, url: `${c.site}/browse/${encodeURIComponent(record.key)}` })
    }
    return { kind: 'items', items }
  } catch { return { kind: 'malformed', reason: 'Jira returned a response this app could not read.' } }
}

/**
 * `refused` is this milestone's one new arm and is NOT a flavour of
 * `unavailable`. It is review-commit.ts's refused/failed split: a workflow
 * declining a transition and Jira being unreachable are two situations with
 * two different fixes, and collapsing them sends a user to check their
 * network when their board is what said no. On a correctly configured,
 * fully reachable Jira, `refused` is the arm that happens routinely.
 */
function issueUrl(c: JiraCredential, itemId: string, suffix: string): string {
  return `${c.site}/rest/api/3/issue/${encodeURIComponent(itemId)}${suffix}`
}

function writeAuth(c: JiraCredential): Record<string, string> {
  return { ...auth(c), 'Content-Type': 'application/json' }
}

/**
 * Jira's own sentence, never a phrase this app invented. The user is the one
 * who can act on "Transition is not valid for this issue" and this app cannot
 * derive it — the same reason review-commit carries a hook's output verbatim.
 * This is work text, not credential material: it says nothing about the
 * token, only about the ticket.
 */
function jiraMessage(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { errorMessages?: unknown; errors?: unknown }
    if (Array.isArray(parsed.errorMessages) && typeof parsed.errorMessages[0] === 'string') {
      return parsed.errorMessages[0]
    }
    if (parsed.errors !== null && typeof parsed.errors === 'object') {
      const first = Object.values(parsed.errors as Record<string, unknown>).find((v) => typeof v === 'string')
      if (typeof first === 'string') return first
    }
    return null
  } catch { return null }
}

/**
 * ONE status mapping, shared by the reads and the writes, and it is named
 * for a status rather than for a write on purpose: it was `writeFailure`
 * and the transitions READ carried a second, narrower copy of the same rule
 * inline, which is how the two came to disagree — a 404 landed in `refused`
 * from a write and in `unavailable` from the read of the very same issue.
 * Two copies of one rule drift the first time only one is edited.
 *
 * 400 and 404 are both `refused` rather than `unavailable`, and 404
 * deliberately so: Jira answers 404 for an issue the account may not browse,
 * to avoid disclosing that the issue exists. That is the board saying no,
 * not the network failing, so it takes the arm whose fix is "check your
 * permissions" rather than "check your connection". It matters MOST on the
 * read, because clicking `Move…` is what fetches the list, so the read is
 * where "you cannot move this ticket" is discovered at all.
 *
 * `listAssignedWorkItems` deliberately still maps its own statuses inline:
 * its union has no `refused` arm, a 404 on a JQL search is not a per-issue
 * permission answer, and widening it is M19's surface rather than this
 * milestone's. verify:jira 14 pins the read/write agreement this covers.
 */
function statusFailure(
  response: { status: number; body: string },
  okStatuses: readonly number[]
): { kind: 'rejected' | 'refused' | 'unavailable'; reason: string } | null {
  if (okStatuses.includes(response.status)) return null
  if (response.status === 401 || response.status === 403) {
    return { kind: 'rejected', reason: 'Jira rejected the credential.' }
  }
  if (response.status === 400 || response.status === 404) {
    return { kind: 'refused', reason: jiraMessage(response.body) ?? 'Jira refused the change.' }
  }
  return { kind: 'unavailable', reason: `Jira answered ${response.status}.` }
}

/**
 * Read on demand, ONE issue at a time, and deliberately not folded into
 * listAssignedWorkItems: transitions are workflow-defined per issue, so
 * folding this in would fire one extra request per ticket on every panel
 * load, for tickets nobody is going to transition. review:diff's shape,
 * reached by the same arithmetic.
 */
export async function listWorkItemTransitions(deps: JiraDeps, itemId: string): Promise<JiraTransitionsResult> {
  const c = credential(deps.store)
  if (c === 'missing') return { kind: 'no-credential', reason: 'Connect Jira before loading transitions.' }
  if (c === 'invalid') return { kind: 'invalid-credential', reason: 'The stored Jira credential is malformed.' }
  let response: { status: number; body: string }
  try {
    response = await deps.requester({
      url: issueUrl(c, itemId, '/transitions'), method: 'GET', headers: auth(c), timeoutMs: TIMEOUT_MS
    })
  } catch { return { kind: 'unavailable', reason: 'Jira could not be reached.' } }
  // The SAME mapping the writes use, never a second copy of it: see
  // statusFailure's own comment for the 404 that made this necessary.
  const failure = statusFailure(response, [200])
  if (failure) return failure
  try {
    const raw = (JSON.parse(response.body) as { transitions?: unknown }).transitions
    if (!Array.isArray(raw)) return { kind: 'malformed', reason: 'Jira returned no transition list.' }
    const transitions: WorkItemTransition[] = []
    for (const entry of raw) {
      const record = entry as { id?: unknown; name?: unknown; to?: { name?: unknown } }
      // An entry missing either half is dropped INDIVIDUALLY, the same
      // per-entry tolerance parseLayout gives a malformed panel: one
      // unusable transition must not cost the user the whole list.
      if (typeof record.id !== 'string' || typeof record.name !== 'string') continue
      transitions.push({
        id: record.id,
        name: record.name,
        toState: typeof record.to?.name === 'string' ? record.to.name : null
      })
    }
    return { kind: 'transitions', transitions }
  } catch { return { kind: 'malformed', reason: 'Jira returned a response this app could not read.' } }
}

export async function commentOnWorkItem(deps: JiraDeps, itemId: string, text: string): Promise<JiraWriteResult> {
  const c = credential(deps.store)
  if (c === 'missing') return { kind: 'no-credential', reason: 'Connect Jira before commenting.' }
  if (c === 'invalid') return { kind: 'invalid-credential', reason: 'The stored Jira credential is malformed.' }
  const message = text.trim()
  // Refused BEFORE the network, like a missing credential. The panel's Send
  // is already disabled for an empty draft, so reaching this means something
  // upstream changed — it must still not post an empty comment.
  if (message === '') return { kind: 'refused', reason: 'A comment needs a body.' }
  let response: { status: number; body: string }
  try {
    response = await deps.requester({
      url: issueUrl(c, itemId, '/comment'), method: 'POST', headers: writeAuth(c),
      timeoutMs: TIMEOUT_MS, body: JSON.stringify({ body: textToAdf(message) })
    })
  } catch { return { kind: 'unavailable', reason: 'Jira could not be reached.' } }
  return statusFailure(response, [200, 201]) ?? { kind: 'done' }
}

export async function transitionWorkItem(deps: JiraDeps, itemId: string, transitionId: string): Promise<JiraWriteResult> {
  const c = credential(deps.store)
  if (c === 'missing') return { kind: 'no-credential', reason: 'Connect Jira before transitioning.' }
  if (c === 'invalid') return { kind: 'invalid-credential', reason: 'The stored Jira credential is malformed.' }
  let response: { status: number; body: string }
  try {
    response = await deps.requester({
      url: issueUrl(c, itemId, '/transitions'), method: 'POST', headers: writeAuth(c),
      timeoutMs: TIMEOUT_MS, body: JSON.stringify({ transition: { id: transitionId } })
    })
  } catch { return { kind: 'unavailable', reason: 'Jira could not be reached.' } }
  // 204 is Jira's success for this endpoint; 200 is accepted too rather than
  // treated as a failure, because a success status must never land in an
  // error arm and cost the user a second, duplicate transition attempt.
  return statusFailure(response, [200, 204]) ?? { kind: 'done' }
}

export function createJiraRequester(): JiraRequester {
  return ({ url, method, headers, timeoutMs, body }) => new Promise((resolve, reject) => {
    // Content-Length is computed from the BYTE length, never the string
    // length: a ticket comment routinely contains non-ASCII, and a
    // character count there truncates the body Jira actually reads.
    const payload = body === undefined ? undefined : Buffer.from(body, 'utf8')
    const sent = payload === undefined
      ? headers
      : { ...headers, 'Content-Length': String(payload.byteLength) }
    const req = request(url, { method, headers: sent, timeout: timeoutMs }, (res) => {
      let received = ''; let bytes = 0
      res.setEncoding('utf8')
      res.on('data', (part: string) => {
        bytes += Buffer.byteLength(part)
        if (bytes > MAX_BODY_BYTES) res.destroy(new Error('response too large'))
        else received += part
      })
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: received }))
      res.on('error', reject)
    })
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
    if (payload !== undefined) req.write(payload)
    req.end()
  })
}
