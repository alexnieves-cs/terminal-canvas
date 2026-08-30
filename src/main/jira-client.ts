import { request } from 'node:https'
import type { CredentialMeta } from '../shared/credential-schema'
import type { WorkItem } from '../shared/work-item'
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
export type JiraListResult =
  | { kind: 'items'; items: WorkItem[] }
  | { kind: 'no-credential' | 'invalid-credential' | 'rejected' | 'unavailable' | 'malformed'; reason: string }

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
