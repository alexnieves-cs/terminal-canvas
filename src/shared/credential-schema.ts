/**
 * Every service this app can hold a credential for, as data.
 *
 * This module imports NOTHING — not electron, not node, not a sibling. That is
 * deliberate and load-bearing, exactly as settings-schema.ts states for the
 * same reason: it is what keeps verify:credentials in the cheap plain-node
 * tier, and what lets main and the renderer read one declaration without
 * either owning it.
 *
 * A service that is not declared here cannot be stored. That is the point: the
 * store is keyed by service id, and a free-form key makes a typo a permanent,
 * invisible second credential — the same failure verify:layout 67 pins for an
 * unknown preference id.
 */

export interface CredentialService {
  /** Stable and persisted — renaming one orphans the user's stored token. */
  id: string
  label: string
  /** Shown at the entry prompt. Says WHICH token to paste, not what a token is. */
  help: string
}

/**
 * M14 declares exactly one. #9's own sequencing advice is that two concrete
 * integrations must exist before anything is generalised from them, and this
 * milestone deliberately does not reach that bar — the store is a store, not
 * an integration surface.
 */
export const SERVICES: readonly CredentialService[] = [
  {
    id: 'github',
    label: 'GitHub',
    help: 'Paste a personal access token (classic or fine-grained) with read access to your account.'
  },
  {
    id: 'jira',
    label: 'Jira',
    help: 'Paste three lines: your https://site.atlassian.net URL, Atlassian email, then Jira API token.'
  }
]

/**
 * Metadata the renderer is allowed to see. Note what is ABSENT: there is no
 * token field and no cipher field, and that absence is the design rather than
 * an omission — see the spec's rule 1. A projection, never a filter someone
 * has to remember to apply.
 */
export interface CredentialMeta {
  service: string
  /**
   * What the remote service says the account is called, or the service label
   * before a successful verify. NEVER derived from the token: a "last four
   * characters" label is a partial secret that would then flow into the
   * inspector, the rail, and anything serialising app state for diagnostics —
   * which ideas-backlog #31 warns about explicitly.
   */
  label: string
  addedAt: string
  verifiedAt?: string
}

export function findService(id: string): CredentialService | undefined {
  return SERVICES.find((s) => s.id === id)
}
