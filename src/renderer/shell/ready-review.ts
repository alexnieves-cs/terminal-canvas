import type { TaskGroup } from './task-queue'

/**
 * READY TO REVIEW — the quieter half of attention.
 *
 * An agent that stops on a person is "needs you": it glows, it beeps, ⌘J
 * walks to it. An agent that FINISHED with changes used to be none of
 * those: its tone went idle or done, so ⌘J skipped it, no notification
 * fired, and the only trace was a row in the dock's task queue. Finished
 * work then sat unreviewed until someone happened to open the dock.
 *
 * This is that second kind, read from the task queue's own `review`
 * decisions (M307's "finished is not verified": the handoff is ready and
 * this revision has not been reviewed). It is deliberately NOT added to
 * the attention queue: needs-you stays the only thing that glows and the
 * only thing the badge counts, so a finished task cannot drown out an
 * agent that is stopped mid-turn. ⌘J reaches these only once nothing
 * needs you.
 *
 * Pure: no DOM, no React. `verify:ux ux.review.*`.
 */

export interface ReadyReview {
  itemId: string
  title: string
  /** The queue's decision key (`review:<item>`), stable for this revision. */
  key: string
  /** The decision's sentence, for a notification body. */
  text: string
}

/** Tasks the agent finished with changes nobody has reviewed yet, in the queue's order. */
export function readyReviews(groups: readonly TaskGroup[]): ReadyReview[] {
  const out: ReadyReview[] = []
  for (const g of groups) {
    if (g.itemId === null) continue
    const review = g.decisions.find((d) => d.kind === 'review')
    if (review === undefined) continue
    out.push({ itemId: g.itemId, title: g.title, key: review.key, text: review.text })
  }
  return out
}

/**
 * The review ⌘J lands on when nothing needs the person. Wraps, and a
 * cursor that has left the list (the review was done) restarts at the
 * front — the same "a second press is never dead" rule `nextAttentionId`
 * keeps.
 */
export function nextReview(list: readonly ReadyReview[], cursor: string | null): ReadyReview | null {
  if (list.length === 0) return null
  const at = cursor === null ? -1 : list.findIndex((r) => r.itemId === cursor)
  return list[(at + 1) % list.length]
}

/**
 * The reviews that arrived since `seen` was taken — what a notification is
 * for. Keyed by decision key, so a task whose changes MOVED after a review
 * (a new revision) arrives again.
 */
export function arrivedReviews(list: readonly ReadyReview[], seen: ReadonlySet<string>): ReadyReview[] {
  return list.filter((r) => !seen.has(r.key))
}

/** One notification line per task, in the product's words. */
export function reviewNotice(r: ReadyReview): { title: string; body: string } {
  return { title: `Ready to review · ${r.title}`, body: `${r.text.charAt(0).toUpperCase()}${r.text.slice(1)}.` }
}
