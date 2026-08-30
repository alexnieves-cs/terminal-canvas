/** The one provider-neutral shape that crosses from a work-service adapter to
 * the canvas. M24 added a second provider and it did NOT have to change — that
 * the six fields survived contact with GitHub is a measured result rather than
 * a design intention, and it is the finding #9 asked two implementations to
 * produce. */
export interface WorkItem {
  id: string
  title: string
  description: string
  assignee: string | null
  state: string | null
  url: string
}

/**
 * Closed, and ordered as the palette renders it. A provider not named here
 * cannot be listed or persisted — the rule SERVICES already states for
 * credentials, for the same reason: a free-form key makes a typo a permanent,
 * invisible second thing.
 */
export const WORK_PROVIDERS = ['jira', 'github'] as const
export type WorkProvider = (typeof WORK_PROVIDERS)[number]

export function isWorkProvider(value: unknown): value is WorkProvider {
  return typeof value === 'string' && (WORK_PROVIDERS as readonly string[]).includes(value)
}

/**
 * One spelling of each provider's name, shared by the panel title, the palette
 * row and the node's heading. Three copies would drift the first time one was
 * edited, and the drift would land as two surfaces naming one integration
 * differently with nothing to explain it.
 */
export const WORK_PROVIDER_LABEL: Record<WorkProvider, string> = {
  jira: 'Jira',
  github: 'GitHub'
}

/**
 * A group names the QUERY that produced its items, never the items themselves.
 *
 * This is the one place M24's surface widened under a second customer, and the
 * reason is worth keeping: an item found by `review-requested:@me` is
 * identical, on the wire, to the same item found by `assignee:@me`. The item
 * does not know which pile it is in — the query does — so encoding it on the
 * item would be the adapter stamping a value derived from which loop it
 * happened to be in, which is a coordinate wearing a name.
 */
export interface WorkGroup {
  label: string
  items: WorkItem[]
  /**
   * What the service said the FULL count is, which may exceed items.length.
   * Reported rather than swallowed: a list that simply stops is
   * indistinguishable from a list that is complete — REVIEW_FILE_CAP's rule.
   */
  total: number
}

/**
 * Six answers, never collapsed, because each has a different fix. `rejected`
 * and `rate-limited` are the pair that matters: GitHub reports both as 403,
 * and rendering a rate limit as a bad credential sends the user to regenerate
 * a token that was fine.
 */
export type WorkFailureKind =
  | 'no-credential'
  | 'invalid-credential'
  | 'rejected'
  | 'rate-limited'
  | 'unavailable'
  | 'malformed'

export type WorkListResult =
  | { kind: 'groups'; groups: WorkGroup[] }
  | { kind: WorkFailureKind; reason: string }
