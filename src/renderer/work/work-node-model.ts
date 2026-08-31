/**
 * The work node's own view model — PURE, so every arm is checkable in the
 * cheapest tier the repo has.
 *
 * M17's JiraNode built its rendering inline and had no model checks at all;
 * review, file and toolbox nodes each have one of these. The new kind follows
 * the majority rather than the one exception — which is also what let check 113
 * find the missing `railTail` arm that panel had been living without since M17.
 */
import type { WorkListResult, WorkProvider } from '@shared/work-item'
import { WORK_PROVIDER_LABEL } from '@shared/work-item'

export interface WorkNodeRow {
  id: string
  title: string
  /** State and assignee, already composed — the row renders it verbatim. */
  meta: string
  description: string
  url: string
}

export interface WorkNodeGroup {
  label: string
  rows: WorkNodeRow[]
  /** Present when the group is empty, or when it holds fewer than the total. */
  note: string | null
}

export interface WorkNodeModel {
  heading: string
  note: string | null
  groups: WorkNodeGroup[]
  /** True only for the arm a "Connect <service>" verb can actually fix. */
  connectable: boolean
}

/**
 * One sentence per arm, and they must stay DISTINCT.
 *
 * "Connect GitHub" and "GitHub rejected your token" have two different fixes,
 * and collapsing them tells a user with a revoked token to connect an account
 * they already connected — the `baseline-lost`/`never-started` split
 * `buildReviewFields` already draws, in a second section. `unavailable` returns
 * the adapter's own reason verbatim, because only the adapter knows which
 * status code came back.
 */
const FAILURE_NOTE: Record<string, (label: string, reason: string) => string> = {
  'no-credential': (label) => `Connect ${label} to see the work assigned to you.`,
  'invalid-credential': (label) => `The stored ${label} credential could not be read. Enter it again.`,
  rejected: (label) => `${label} rejected the stored credential. Regenerate the token and enter it again.`,
  'rate-limited': (label) => `${label} is rate-limiting this app. Refresh in a minute.`,
  unavailable: (_label, reason) => reason,
  malformed: (label) => `${label} returned a response this app could not read.`
}

function groupNote(shown: number, total: number): string | null {
  // An empty group RENDERS rather than vanishing: a user with nothing awaiting
  // their review and a user whose query silently failed must not see the same
  // thing. verify:rail 43's rule for the review pane's `clean` arm, here.
  if (shown === 0) return 'Nothing here.'
  // A list that simply stops is indistinguishable from a list that is
  // complete — REVIEW_FILE_CAP's `+N more` rule, reaching a service that is
  // free to hold far more than the 50 we asked it for.
  if (total > shown) return `Showing ${shown} of ${total}.`
  return null
}

export function buildWorkNodeModel(
  provider: WorkProvider,
  result: WorkListResult | null,
  title: string | undefined
): WorkNodeModel {
  const label = WORK_PROVIDER_LABEL[provider]
  // M6a's honest chain, reaching a sixth kind: a user's own title outranks the
  // provider's name, exactly as it already does for a terminal panel's header,
  // a review node's heading and a file panel's basename.
  const heading = title ?? label

  // Null is "the query has not answered yet", which is every node for the first
  // moment of its life. It renders a NOTE rather than nothing, for the reason
  // every arm below does — and it is deliberately not `connectable`, because
  // offering to re-enter a credential while a request is still in flight
  // answers a question nobody has asked yet.
  if (result === null) {
    return { heading, note: `Reading ${label}…`, groups: [], connectable: false }
  }

  if (result.kind !== 'groups') {
    const note = FAILURE_NOTE[result.kind]?.(label, result.reason) ?? result.reason
    // Only the arm a "Connect" verb can actually fix. A flag that is always
    // true offers to re-enter a credential to a rate-limited user; a flag that
    // is always false deletes the one affordance a user with nothing stored is
    // guaranteed to be looking for.
    return { heading, note, groups: [], connectable: result.kind === 'no-credential' }
  }

  return {
    heading,
    note: null,
    connectable: false,
    groups: result.groups.map((group) => ({
      label: group.label,
      note: groupNote(group.items.length, group.total),
      rows: group.items.map((item) => ({
        id: item.id,
        title: item.title,
        meta: [item.state, item.assignee].filter((part) => part !== null && part !== '').join(' · '),
        description: item.description,
        url: item.url
      }))
    }))
  }
}
