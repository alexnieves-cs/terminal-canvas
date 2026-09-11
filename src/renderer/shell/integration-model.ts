import type { CredentialMeta, CredentialService } from '@shared/credential-schema'
import { notConnectedReason } from '@shared/credential-schema'

/**
 * M89. THE INTEGRATIONS PAGE'S MODEL — pure, plain-node checked in
 * `verify:rail integrations.1`.
 *
 * One row per DECLARED service, whether or not a credential exists: a service
 * that vanished from the page would read as one this app does not support.
 * Three closed states, and the durable rejection mark outranks a verified
 * date — a token that verified last week and was rejected today is rejected,
 * and the page says what the last verify said rather than what the user
 * remembers. The audit rows under a service are its own, newest first,
 * capped, with a refusal marked rather than dropped.
 */

export const INTEGRATION_AUDIT_ROWS = 20

export interface AuditRowLike {
  at: number
  service: string
  method: string
  path: string
  status: number
  bytes: number
  panelId?: string
  reason?: string
}

/** `stored` is a token added and never verified — a claim the page must not upgrade to `connected as …` (M89's verifier). */
export type IntegrationState = 'connected' | 'not-connected' | 'rejected' | 'stored'

export interface IntegrationRow {
  id: string
  label: string
  state: IntegrationState
  /** The credential's label — a login, an email — when there is one. */
  who?: string
  /** The ONE sentence for the state, in the vocabulary every door shares. */
  sentence: string
  /** The state WORD alone (`connected`, `not connected`, `token rejected`) — the only part painted in a tone (M89's critic). */
  word: string
  verb: 'connect' | 'verify' | 'reconnect'
  rows: AuditRowLike[]
}

export function buildIntegrationRows(
  services: readonly CredentialService[],
  metas: readonly CredentialMeta[],
  audit: readonly AuditRowLike[],
  cap = INTEGRATION_AUDIT_ROWS
): IntegrationRow[] {
  return services.map((svc) => {
    const meta = metas.find((m) => m.service === svc.id)
    const rows = audit.filter((r) => r.service === svc.id).slice().sort((a, b) => b.at - a.at).slice(0, cap)
    if (meta === undefined) {
      return { id: svc.id, label: svc.label, state: 'not-connected', word: 'not connected', sentence: notConnectedReason(svc.id), verb: 'connect', rows }
    }
    if (meta.rejectedAt !== undefined) {
      // The sentence's fix and the verb beneath it are ONE door: `Reconnect…`
      // opens the Credentials scope, so the sentence does not name a second.
      return { id: svc.id, label: svc.label, state: 'rejected', who: meta.label, word: 'token rejected', sentence: `token rejected — add a new ${svc.id} token`, verb: 'reconnect', rows }
    }
    if (meta.verifiedAt === undefined) {
      return { id: svc.id, label: svc.label, state: 'stored', who: meta.label, word: 'not verified', sentence: 'token added, not verified yet', verb: 'verify', rows }
    }
    return { id: svc.id, label: svc.label, state: 'connected', who: meta.label, word: 'connected', sentence: `connected as ${meta.label}`, verb: 'verify', rows }
  })
}

/**
 * M259. AN AUDIT ROW AS ACTIVITY — what the call DID, in words, with the
 * HTTP line kept as its `detail` for the disclosure beneath it. The page used
 * to print `POST /repos/o/r/issues/12/comments · 201`, a line a person has to
 * decode; the same row now reads "Commented on o/r#12".
 *
 * The patterns are the calls this app and `tc api` actually make; anything
 * else still gets a verb from its method and its last meaningful segment, so
 * an unknown call is described, never dropped. Three outcomes, never two: a
 * broker refusal (`status 0`) is not a failed request, and neither is a 2xx.
 */
export interface Activity {
  sentence: string
  outcome: 'ok' | 'refused' | 'failed'
  /** `METHOD path · status` — the raw line, behind the disclosure. */
  detail: string
}

const METHOD_VERB: Record<string, string> = { GET: 'Read', HEAD: 'Checked', POST: 'Wrote to', PUT: 'Changed', PATCH: 'Changed', DELETE: 'Deleted' }

export function activityOf(row: Pick<AuditRowLike, 'service' | 'method' | 'path' | 'status'> & { reason?: string }): Activity {
  const method = row.method.toUpperCase()
  const bare = row.path.split('?')[0] ?? row.path
  const outcome: Activity['outcome'] = row.status === 0 ? 'refused' : row.status >= 400 ? 'failed' : 'ok'
  const detail = `${method} ${row.path} · ${row.status === 0 ? `refused${row.reason === undefined || row.reason === 'refused' ? '' : ` — ${row.reason}`}` : row.status}`
  const say = (sentence: string): Activity => ({ sentence, outcome, detail })
  let m: RegExpMatchArray | null
  if (row.service === 'github') {
    if (bare === '/user') return say('Checked who the token belongs to')
    if (bare.startsWith('/search/')) return say(bare.includes('issues') ? 'Searched issues and pull requests' : 'Searched GitHub')
    if ((m = bare.match(/^\/repos\/([^/]+)\/([^/]+)\/issues\/(\d+)\/comments$/)) !== null) return say(method === 'GET' ? `Read the comments on ${m[1]}/${m[2]}#${m[3]}` : `Commented on ${m[1]}/${m[2]}#${m[3]}`)
    if ((m = bare.match(/^\/repos\/([^/]+)\/([^/]+)\/(?:issues|pulls)\/(\d+)(\/.*)?$/)) !== null) return say(`${METHOD_VERB[method] ?? method} ${m[1]}/${m[2]}#${m[3]}`)
    if ((m = bare.match(/^\/repos\/([^/]+)\/([^/]+)\/pulls$/)) !== null) return say(method === 'POST' ? `Opened a pull request in ${m[1]}/${m[2]}` : `Read the pull requests in ${m[1]}/${m[2]}`)
    if ((m = bare.match(/^\/repos\/([^/]+)\/([^/]+)\/issues$/)) !== null) return say(method === 'POST' ? `Created an issue in ${m[1]}/${m[2]}` : `Read the issues in ${m[1]}/${m[2]}`)
    if ((m = bare.match(/^\/repos\/([^/]+)\/([^/]+)$/)) !== null) return say(`${METHOD_VERB[method] ?? method} ${m[1]}/${m[2]}`)
  }
  if (row.service === 'jira') {
    if (/\/myself$/.test(bare)) return say('Checked who the token belongs to')
    if (/\/search(\/jql)?$/.test(bare)) return say('Searched tickets')
    if ((m = bare.match(/\/issue\/([A-Z][A-Z0-9_]*-\d+)\/transitions$/)) !== null) return say(method === 'POST' ? `Moved ${m[1]}` : `Read where ${m[1]} can move`)
    if ((m = bare.match(/\/issue\/([A-Z][A-Z0-9_]*-\d+)\/comment$/)) !== null) return say(method === 'POST' ? `Commented on ${m[1]}` : `Read the comments on ${m[1]}`)
    if ((m = bare.match(/\/issue\/([A-Z][A-Z0-9_]*-\d+)$/)) !== null) return say(`${METHOD_VERB[method] ?? method} ${m[1]}`)
  }
  // Unknown: the method's verb and the last segment that is not an id-ish number.
  const segs = bare.split('/').filter((s) => s !== '')
  const object = segs.length === 0 ? row.service : segs.slice(-2).join('/')
  let named = object; try { named = decodeURIComponent(object) } catch { /* a malformed escape reads as written */ }
  return say(`${METHOD_VERB[method] ?? method} ${named}`)
}

/** Past this, a list read from a provider is called stale — it may no longer be what the provider says. */
export const STALE_AFTER_MS = 10 * 60 * 1000

/**
 * M259. SYNC FRESHNESS IN WORDS. Three answers: never read (`not read yet`,
 * stale by definition), a relative age, and whether that age is past
 * `STALE_AFTER_MS`. `verb` names the act — a list is `updated`, a card's
 * copy of a provider's state is `copied`.
 */
export function syncWord(at: number | undefined, now: number, verb = 'updated', staleAfter = STALE_AFTER_MS): { word: string; stale: boolean } {
  if (at === undefined) return { word: 'not read yet', stale: true }
  const s = Math.max(0, Math.round((now - at) / 1000))
  const age = s < 10 ? 'just now' : s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 48 * 3600 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`
  return { word: `${verb} ${age}`, stale: now - at > staleAfter }
}
