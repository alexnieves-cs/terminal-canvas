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
  /** When the credential last verified — absent for `not-connected`/`stored`. */
  verifiedAt?: string
  /** When the credential was added — absent for `not-connected`. */
  addedAt?: string
  /** The newest audit row's timestamp — absent when nothing has called through it yet. */
  lastUsedAt?: number
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
    const lastUsedAt = rows[0]?.at
    if (meta === undefined) {
      return { id: svc.id, label: svc.label, state: 'not-connected', word: 'not connected', sentence: notConnectedReason(svc.id), verb: 'connect', rows, lastUsedAt }
    }
    if (meta.rejectedAt !== undefined) {
      // The sentence's fix and the verb beneath it are ONE door: `Reconnect…`
      // opens the Credentials scope, so the sentence does not name a second.
      return { id: svc.id, label: svc.label, state: 'rejected', who: meta.label, word: 'token rejected', sentence: `token rejected — add a new ${svc.id} token`, verb: 'reconnect', rows, verifiedAt: meta.verifiedAt, addedAt: meta.addedAt, lastUsedAt }
    }
    if (meta.verifiedAt === undefined) {
      return { id: svc.id, label: svc.label, state: 'stored', who: meta.label, word: 'not verified', sentence: 'token added, not verified yet', verb: 'verify', rows, addedAt: meta.addedAt, lastUsedAt }
    }
    return { id: svc.id, label: svc.label, state: 'connected', who: meta.label, word: 'connected', sentence: `connected as ${meta.label}`, verb: 'verify', rows, verifiedAt: meta.verifiedAt, addedAt: meta.addedAt, lastUsedAt }
  })
}

/**
 * ONE translated sentence for a raw broker call, from the real path shapes
 * `github-client.ts` and an agent's own `tc api <service> <path>` produce. A
 * shape this does not recognise falls back to the method and path
 * themselves — never a fabricated verb for a request nobody described.
 *
 * Each match names its verb in the BASE form ("comment on issue #12") so a
 * refusal can prefix "tried to" without guessing at English past-tense
 * spelling — the earlier version stripped a trailing "ed" to un-conjugate,
 * which silently left "read" (no "ed" ending) in the present tense on a
 * refused call, claiming a read that never happened.
 */
export function describeCall(service: string, row: AuditRowLike): string {
  const base = describeCallBase(service, row)
  const fail = row.status !== 0 ? '' : ` — refused${row.reason === undefined || row.reason === 'refused' ? '' : ` (${row.reason})`}`
  return `${row.status === 0 ? `tried to ${base}` : `${past(base)}`}${fail}`
}

/** The base-form sentence, before tense: "comment on issue #12 in o/r". */
function describeCallBase(service: string, row: AuditRowLike): string {
  if (service === 'github') {
    let m = row.path.match(/^\/repos\/([^/]+\/[^/?]+)\/issues\/(\d+)\/comments/)
    if (m) return `comment on issue #${m[2]} in ${m[1]}`
    m = row.path.match(/^\/repos\/([^/]+\/[^/?]+)\/pulls\/(\d+)/)
    if (m) return `read pull request #${m[2]} in ${m[1]}`
    m = row.path.match(/^\/repos\/([^/]+\/[^/?]+)\/(?:issues|pulls)\b/)
    if (m) return `list ${row.path.includes('/pulls') ? 'pull requests' : 'issues'} in ${m[1]}`
    m = row.path.match(/^\/repos\/([^/]+\/[^/?]+)\/releases/)
    if (m) return `publish a release in ${m[1]}`
    m = row.path.match(/^\/repos\/([^/]+\/[^/?]+)/)
    if (m) return `${row.method === 'GET' ? 'read' : 'change'} ${m[1]}`
    if (row.path.startsWith('/issues')) return 'list assigned issues'
    if (row.path === '/user') return 'check the connected account'
  }
  if (service === 'jira') {
    let m = row.path.match(/\/issue\/([^/?]+)\/comment/)
    if (m) return `comment on ${m[1]}`
    m = row.path.match(/\/issue\/([^/?]+)\/transitions/)
    if (m) return `move ${m[1]}`
    m = row.path.match(/\/issue\/([^/?]+)/)
    if (m) return `read ${m[1]}`
    if (/\/search\b/.test(row.path)) return 'search Jira'
  }
  return `${row.method} ${row.path}`
}

/** The base form's verb, past tense — a small closed list, not a suffix guess. */
const PAST: Record<string, string> = { comment: 'commented', read: 'read', list: 'listed', publish: 'published', change: 'changed', check: 'checked', move: 'moved', search: 'searched' }
function past(base: string): string {
  const verb = base.split(' ', 1)[0]
  return PAST[verb] === undefined ? base : `${PAST[verb]}${base.slice(verb.length)}`
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
