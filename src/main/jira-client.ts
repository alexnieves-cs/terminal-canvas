import type { CredentialMeta } from '../shared/credential-schema'
import type { WorkItem, WorkListResult } from '../shared/work-item'
import type { CredentialStore } from './credential-store'
import { WORK_TIMEOUT_MS, type WorkRequester, type WorkResponse } from './work-request'

/**
 * The one requester serves both providers, so main's wiring has a single
 * import site rather than one per integration.
 */
export { createWorkRequester } from './work-request'

const ASSIGNED_JQL = 'assignee = currentUser() ORDER BY updated DESC'

export interface JiraCredential { site: string; email: string; token: string }
export interface JiraDeps { store: CredentialStore; requester: WorkRequester }
export type JiraVerifyResult = { ok: true; meta: CredentialMeta } | { ok: false; reason: string }

/** The store holds one opaque string. This parser is the only reader that
 * understands Jira's site/email/token bundle, and it never returns it over IPC. */
export function parseJiraCredential(value: string): JiraCredential | null {
  try {
    const parsed = JSON.parse(value) as Partial<JiraCredential>
    const site = typeof parsed.site === 'string' ? parsed.site.replace(/\/$/, '') : ''
    if (!/^https:\/\/[^/]+\.atlassian\.net$/i.test(site) ||
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
  let response: WorkResponse
  try { response = await deps.requester({ url: `${c.site}/rest/api/3/myself`, headers: auth(c), timeoutMs: WORK_TIMEOUT_MS }) }
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

function adfText(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === null || typeof value !== 'object') return ''
  const node = value as { type?: unknown; text?: unknown; content?: unknown }
  const own = typeof node.text === 'string' ? node.text : ''
  const children = Array.isArray(node.content) ? node.content.map(adfText).join('') : ''
  return node.type === 'paragraph' ? `${own}${children}\n` : node.type === 'hardBreak' ? '\n' : `${own}${children}`
}

export async function listAssignedWorkItems(deps: JiraDeps): Promise<WorkListResult> {
  const c = credential(deps.store)
  if (c === 'missing') return { kind: 'no-credential', reason: 'Connect Jira before loading tickets.' }
  if (c === 'invalid') return { kind: 'invalid-credential', reason: 'The stored Jira credential is malformed.' }
  const query = new URLSearchParams({ jql: ASSIGNED_JQL, maxResults: '50', fields: 'summary,description,assignee,status' })
  let response: WorkResponse
  try { response = await deps.requester({ url: `${c.site}/rest/api/3/search/jql?${query}`, headers: auth(c), timeoutMs: WORK_TIMEOUT_MS }) }
  catch { return { kind: 'unavailable', reason: 'Jira could not be reached.' } }
  if (response.status === 401 || response.status === 403) return { kind: 'rejected', reason: 'Jira rejected the credential.' }
  if (response.status !== 200) return { kind: 'unavailable', reason: `Jira answered ${response.status}.` }
  try {
    // Parsed ONCE into a local: `total` and `issues` are two fields of one
    // answer, and a second JSON.parse of the same body is a megabyte of work
    // to re-derive a number we already hold.
    const payload = JSON.parse(response.body) as { issues?: unknown; total?: unknown }
    const issues = payload.issues
    if (!Array.isArray(issues)) return { kind: 'malformed', reason: 'Jira returned no issue list.' }
    const items: WorkItem[] = []
    for (const issue of issues) {
      const record = issue as { key?: unknown; fields?: { summary?: unknown; description?: unknown; assignee?: { displayName?: unknown }; status?: { name?: unknown } } }
      if (typeof record.key !== 'string' || typeof record.fields?.summary !== 'string') continue
      items.push({ id: record.key, title: record.fields.summary, description: adfText(record.fields.description).trim(), assignee: typeof record.fields.assignee?.displayName === 'string' ? record.fields.assignee.displayName : null, state: typeof record.fields.status?.name === 'string' ? record.fields.status.name : null, url: `${c.site}/browse/${encodeURIComponent(record.key)}` })
    }
    // One group, and its label names the QUERY rather than the items. Jira
    // asks one question; GitHub asks two, and an item found by
    // `review-requested:@me` is identical on the wire to the same item found
    // by `assignee:@me` — the item does not know which pile it is in, the
    // query does. So the shape is the SECOND customer's, and Jira degenerates
    // to it cleanly rather than the surface being widened again later.
    //
    // `total` is the service's own count, which may exceed what it returned:
    // the request is capped at maxResults=50, and a capped list must be able
    // to SAY so rather than silently stopping — the `+N more` rule
    // REVIEW_FILE_CAP already states. It falls back to the returned length
    // when the service does not say, which is never a lie, only less useful.
    const total = typeof payload.total === 'number' ? payload.total : items.length
    return { kind: 'groups', groups: [{ label: 'Assigned to you', items, total }] }
  } catch { return { kind: 'malformed', reason: 'Jira returned a response this app could not read.' } }
}
