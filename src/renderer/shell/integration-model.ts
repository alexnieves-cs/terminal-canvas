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
