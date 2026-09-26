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
/**
 * M88. THE one not-connected sentence, for every door that names a missing
 * credential: the broker's refusal, the palette's disabled rows, the work
 * panels' arms. Three hand-typed copies drifted into three places in one
 * milestone; a rewording here reaches all of them, and a client sorting a
 * refusal by its text sorts by `NOT_CONNECTED_CODE` instead.
 */
export const NOT_CONNECTED_CODE = 'not-connected'
export function notConnectedReason(service: string): string {
  return `not connected — add a ${service} token in ⌘K › Credentials`
}

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
  /** M89. The last verify was a rejection. Absent stays absent; cleared on the next success. */
  rejectedAt?: string
}

export function findService(id: string): CredentialService | undefined {
  return SERVICES.find((s) => s.id === id)
}

/**
 * The Terminal Canvas account: a Supabase session, signed in through GitHub.
 * One entry PER GitHub account, keyed `supabase:github:<numeric id>`, so two
 * people signing in on one Mac never overwrite each other's session.
 *
 * NOT a member of SERVICES, on purpose: SERVICES is what the Credentials
 * palette builds its paste rows from, and a session is minted by the sign-in
 * flow, never pasted. The key is still not free-form — it is one declared
 * shape with a numeric tail, so a typo is refused exactly as an undeclared
 * service id is (verify:layout 67's rule).
 */
export const ACCOUNT_SERVICE = 'supabase'
const ACCOUNT_KEY = /^supabase:github:([1-9][0-9]{0,19})$/

export function accountCredentialKey(githubId: string): string {
  return `${ACCOUNT_SERVICE}:github:${githubId}`
}

/** The GitHub user id an account key names, or undefined for any other key. */
export function accountOfCredentialKey(id: string): string | undefined {
  return ACCOUNT_KEY.exec(id)?.[1]
}

/** What the store may hold: a declared service, or an account key. */
export function describeCredentialKey(id: string): { label: string } | undefined {
  const service = findService(id)
  if (service !== undefined) return { label: service.label }
  return accountOfCredentialKey(id) === undefined ? undefined : { label: 'Terminal Canvas account' }
}
