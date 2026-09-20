/**
 * M290. THE WORKBENCH'S TWO WRITES — commit and discard — brought across from
 * the review node through the SAME executors (`review:commit`,
 * `review:discard`, main's committer and discarder) with M285's `expect`
 * re-check. This is the one module under orchestration/ that may name those
 * two channels (`verify:orchestration workbench.1`, `orch.gate.3`).
 *
 * STRICTER THAN THE NODE, ON PURPOSE. The review node sends no `expect` when a
 * read carried no identity (pre-M285 behaviour, kept there). Here a missing
 * identity is a REFUSAL by name: this page shows a diff beside a freshness
 * line, and a write whose freshness could not be judged is exactly the write
 * Phase B exists to refuse. Every outcome is a sentence, none is thrown.
 */
import type { ReviewIdentity } from '@shared/review-identity'

export type OrchWriteOutcome =
  | { kind: 'done'; sentence: string }
  | { kind: 'moved'; sentence: string }
  | { kind: 'refused'; sentence: string }
  | { kind: 'failed'; sentence: string }

const NO_IDENTITY = 'the content identity of these changes could not be read, so nothing was written — refresh, look again and retry'
const MOVED_COMMIT = 'the changes moved since you read them — nothing was committed; refresh, look again and retry'
const MOVED_DISCARD = 'the changes moved since you read them — nothing was discarded; refresh, look again and retry'

export async function orchCommit(input: { root: string; paths: readonly string[]; message: string; identity: ReviewIdentity | undefined }): Promise<OrchWriteOutcome> {
  if (input.identity === undefined) return { kind: 'refused', sentence: NO_IDENTITY }
  if (input.message.trim() === '') return { kind: 'refused', sentence: 'a commit needs a message' }
  if (typeof window.canvas?.review?.commit !== 'function') return { kind: 'refused', sentence: 'the commit door is not available in this build' }
  try {
    const r = await window.canvas.review.commit({ root: input.root, paths: [...input.paths], message: input.message.trim(), expect: input.identity })
    switch (r.kind) {
      case 'committed': return { kind: 'done', sentence: `committed ${r.sha.slice(0, 10)}` }
      case 'nothing-to-commit': return { kind: 'refused', sentence: 'nothing to commit' }
      case 'head-moved': return { kind: 'moved', sentence: 'HEAD moved since these changes were read — nothing was committed' }
      case 'subject-moved': return { kind: 'moved', sentence: MOVED_COMMIT }
      case 'refused': return { kind: 'refused', sentence: r.detail }
      default: return { kind: 'failed', sentence: r.detail }
    }
  } catch (e) {
    return { kind: 'failed', sentence: `the commit could not be made: ${String((e as Error)?.message ?? e)}` }
  }
}

export async function orchDiscard(input: { root: string; baseline: string; subjectId: string; paths: readonly string[]; identity: ReviewIdentity | undefined }): Promise<OrchWriteOutcome> {
  if (input.identity === undefined) return { kind: 'refused', sentence: NO_IDENTITY }
  if (typeof window.canvas?.review?.discard !== 'function') return { kind: 'refused', sentence: 'the discard door is not available in this build' }
  try {
    const r = await window.canvas.review.discard({ root: input.root, baseline: input.baseline, subjectId: input.subjectId, paths: [...input.paths], expect: input.identity })
    switch (r.kind) {
      case 'discarded': return { kind: r.failed.length === 0 ? 'done' : 'failed', sentence: `restored ${r.restored.length}, removed ${r.removed.length}${r.failed.length > 0 ? `, ${r.failed.length} failed: ${r.failed.map((f) => `${f.path} (${f.detail})`).join('; ')}` : ''}` }
      case 'nothing-to-discard': return { kind: 'refused', sentence: 'nothing to discard' }
      case 'subject-moved': return { kind: 'moved', sentence: MOVED_DISCARD }
      case 'refused': return { kind: 'refused', sentence: r.detail }
      default: return { kind: 'failed', sentence: r.detail }
    }
  } catch (e) {
    return { kind: 'failed', sentence: `the discard could not be made: ${String((e as Error)?.message ?? e)}` }
  }
}
