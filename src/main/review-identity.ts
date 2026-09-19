import { createHash } from 'node:crypto'
import { REVIEW_IDENTITY_CONTENT_CHARS, type ReviewIdentity } from '../shared/review-identity'

/**
 * M285. The hashing half of the review content identity — node's crypto, so
 * it lives in main and `shared/review-identity.ts` stays importable from the
 * renderer. The POLICY (what goes into the hash) is written on the shared
 * type; this file only turns the policy's bytes into the `content` string.
 *
 * `parts` are hashed in order with a NUL between them, so the diff bytes and
 * the untracked listing cannot be re-split to collide: a diff ending in the
 * text of an untracked line is a different byte sequence from the same text
 * arriving as an untracked line.
 */
export function hashReviewContent(parts: readonly string[]): string {
  const h = createHash('sha256')
  for (let i = 0; i < parts.length; i += 1) {
    if (i > 0) h.update('\0')
    h.update(parts[i] as string)
  }
  return h.digest('hex').slice(0, REVIEW_IDENTITY_CONTENT_CHARS)
}

/**
 * A clean tree's content, computed once: the policy's two parts — the diff
 * and the untracked listing — both empty. Spelled as the two-part hash and
 * not `hashReviewContent([])`, so the shortcut `reviewAt` takes for a clean
 * tree and the full `identityOf` read of the same tree agree byte for byte.
 */
export const EMPTY_REVIEW_CONTENT = hashReviewContent(['', ''])

export function reviewIdentityOf(base: string, parts: readonly string[]): ReviewIdentity {
  return { base, content: hashReviewContent(parts) }
}
