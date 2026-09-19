/**
 * M285. REVIEW CONTENT IDENTITY — what a review subject's changes ARE, not
 * what shape they have.
 *
 * `reviewSignature` (`review-readiness.ts`) fingerprints the diff's shape:
 * sorted paths, line counts, three flags. Its recorded bound is that a
 * same-size edit — one line changed and another reverted in the same file —
 * leaves the signature identical, so a review acknowledged against the old
 * diff kept reading `current` over the new one. This module is the stronger
 * identity the plan asked for before anything may claim exact freshness.
 *
 * TWO PARTS. `base` is the commit the review compares against — a session's
 * baseline sha, or a lane's fork point from the main tree. `content` is a hash
 * of the actual bytes that differ from it. Two identities are the SAME review
 * subject only when both parts match: a new commit moves `base` even if the
 * working tree's diff against it happens to hash alike, and an edit moves
 * `content` with `base` fixed.
 *
 * THE SNAPSHOT POLICY (what `content` covers), written here because the
 * definition is where a reader looks, and mirrored in the M285–M287 ledger:
 *
 *   1. `git diff --binary --full-index --no-ext-diff --no-color <base>`, run
 *      in the subject tree: every TRACKED file's uncommitted change against
 *      `base` — text hunks, BINARY files as binary patches, mode changes,
 *      renames and deletions. The index is not consulted on its own: the
 *      working tree is what a reviewer sees, so it is what is hashed.
 *   2. Every UNTRACKED, non-ignored file (`git ls-files --others
 *      --exclude-standard`, the same list the review's own file rows come
 *      from), as its path and its `git hash-object` blob id, one line each,
 *      in git's order. A new binary file is therefore covered by content.
 *
 *   Ignored files (.gitignore, build output) are EXCLUDED on purpose — they
 *   are not in the review either, and hashing a build directory on every
 *   read would make the identity move with the clock. A submodule pointer
 *   change appears in the diff as a gitlink line and is covered as bytes.
 *   A clean tree hashes the empty string, with no extra git call.
 *
 * WHO COMPUTES IT: main, in `review-engine.ts`, and nowhere else. The
 * renderer receives it inside a `ReviewResult`, stores it beside the
 * acknowledgement it records (`PersistedWorkItem.reviewed.identity`) and
 * compares with `sameReviewIdentity`. A renderer that hashed its own copy of
 * the diff would be a second author of the fact, and the two would disagree
 * the first time one of them read a stale answer — the trap
 * `useTaskHandoffs` already names for the signature.
 *
 * ABSENCE MEANS UNKNOWN, NEVER FRESH. If either git call fails the engine
 * sends no identity; a persisted mark written before M285 has none. Every
 * reader turns an absent identity into "freshness unknown" — the safe
 * direction, which points at "look again" rather than "already done".
 *
 * Pure: no DOM, no React, no electron, no node — the hashing lives in
 * `main/review-identity.ts` so this stays importable from every process.
 * `verify:review review-id.1–.4`, `verify:layout work.review-id.1`.
 */
export interface ReviewIdentity {
  /** The commit the changes are measured against — a baseline or fork sha, as git spelled it. */
  base: string
  /** The first 32 hex characters of a SHA-256 over the snapshot policy's bytes. */
  content: string
}

/** How long `content` is, so a parser can tell a truncated or hand-edited value from a real one. */
export const REVIEW_IDENTITY_CONTENT_CHARS = 32

const HEX = /^[0-9a-f]+$/

/**
 * One value from disk or IPC, or undefined. Field-level: a malformed identity
 * costs the identity and nothing around it, the way a malformed `reviewed`
 * costs the field and keeps the card (`work-items.ts`).
 */
export function parseReviewIdentity(raw: unknown): ReviewIdentity | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
  const r = raw as Record<string, unknown>
  if (typeof r.base !== 'string' || r.base === '' || !HEX.test(r.base)) return undefined
  if (typeof r.content !== 'string' || r.content.length !== REVIEW_IDENTITY_CONTENT_CHARS || !HEX.test(r.content)) return undefined
  return { base: r.base, content: r.content }
}

/** Both parts, or nothing: a matching content hash over a different base is a DIFFERENT subject. */
export function sameReviewIdentity(a: ReviewIdentity | undefined, b: ReviewIdentity | undefined): boolean {
  return a !== undefined && b !== undefined && a.base === b.base && a.content === b.content
}

/** For a map key or a data attribute. */
export function reviewIdentityKey(id: ReviewIdentity): string {
  return `${id.base}:${id.content}`
}

/** A fresh object, so a later mutation of one copy cannot reach the other (the `carryWorkItem` rule). */
export function carryReviewIdentity(id: ReviewIdentity): ReviewIdentity {
  return { base: id.base, content: id.content }
}
