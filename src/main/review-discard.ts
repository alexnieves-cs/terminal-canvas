/**
 * M53 — Discard, per file: the one operation in this app that destroys work.
 *
 * Refusals first, in order, and every one BEFORE any write: a shared checkout
 * (main's own peer count, not the renderer's possibly stale result), a lost
 * baseline (nothing to restore TO — removing the added files while restoring
 * nothing would be half a discard presented as one), git missing. Then three
 * git calls at most — exists, ls-tree, ONE restore — and filesystem removals
 * for the paths the baseline never held, through the injected `removeFile`
 * so that no git call writes the index and the whole transaction runs under
 * plain node in verify:review.
 *
 * The result carries `restored`, `removed` and `failed` TOGETHER: a restore
 * that fails for one path does not un-restore the others (it cannot), and a
 * result that said only `failed` would have the user retry what already
 * happened. There is no HEAD guard — a discard restores from the baseline,
 * not HEAD, so M9c's `head-moved` does not transfer and is not copied.
 */
import { join } from 'node:path'
import type { GitResult, GitRunner } from './review-engine'
import { buildLsTreeArgs, buildObjectExistsArgs, buildRestoreArgs, parseNulList } from './git-args'
import type { ReviewDiscardRequest, ReviewDiscardResult } from '../shared/review'
import type { PanelId } from '../shared/review'
import { sameReviewIdentity, type ReviewIdentity } from '../shared/review-identity'

export const DISCARD_DETAIL_MAX = 2000

export interface ReviewDiscardDeps {
  run: GitRunner
  /** Other panels whose baseline root is this one, excluding the subject. */
  peersInRepo: (root: string, except: PanelId) => number
  /** Removal of a FILE. Throws on failure; the throw becomes a per-path `failed`. */
  removeFile: (absolutePath: string) => void
  isDirectory: (absolutePath: string) => boolean
  /** M285. See `ReviewCommitDeps.identityOf`: optional for the fixtures, and a request with `expect` is refused rather than run unchecked without it. */
  identityOf?: (root: string, base: string) => Promise<ReviewIdentity | undefined>
}

const detailOf = (r: GitResult): string =>
  `${r.stderr}${r.stderr && r.stdout ? '\n' : ''}${r.stdout}`.trim().slice(0, DISCARD_DETAIL_MAX)

export function createReviewDiscarder(
  deps: ReviewDiscardDeps
): (req: ReviewDiscardRequest) => Promise<ReviewDiscardResult> {
  return async (req: ReviewDiscardRequest): Promise<ReviewDiscardResult> => {
    if (req.paths.length === 0) return { kind: 'nothing-to-discard' }

    const peers = deps.peersInRepo(req.root, req.subjectId)
    if (peers > 0) {
      return {
        kind: 'refused',
        detail: `${peers + 1} panels share this checkout — the changes are not provably this one's work`
      }
    }

    const exists = await deps.run(buildObjectExistsArgs(req.root, req.baseline))
    if (exists.notFound) return { kind: 'refused', detail: 'git could not be run' }
    if (!exists.ok) return { kind: 'refused', detail: 'the baseline snapshot is gone — there is nothing to restore to' }

    // Directories are refused per path BEFORE ls-tree: a directory pathspec
    // lists its children and never itself, so it would read as "absent" and
    // the fs removal below would be asked to take a tree.
    const failed: { path: string; detail: string }[] = []
    const candidates: string[] = []
    for (const path of req.paths) {
      if (deps.isDirectory(join(req.root, path))) failed.push({ path, detail: 'is a directory' })
      else candidates.push(path)
    }

    const held = new Set<string>()
    if (candidates.length > 0) {
      const listed = await deps.run(buildLsTreeArgs(req.root, req.baseline, candidates))
      if (!listed.ok) return { kind: 'failed', detail: detailOf(listed) }
      for (const p of parseNulList(listed.stdout)) held.add(p)
    }

    const toRestore = candidates.filter((p) => held.has(p))
    const toRemove = candidates.filter((p) => !held.has(p))

    // M285. The content re-check, after every refusal and BEFORE the first
    // write: the person armed a discard over a diff with identity `expect`,
    // and a tree that has moved since holds work they never saw. Refused by
    // name, with nothing restored and nothing removed. The reasoning is the
    // commit sequencer's, one door over.
    if (req.expect !== undefined) {
      if (deps.identityOf === undefined) return { kind: 'refused', detail: 'the changes could not be re-read before discarding — this build cannot compute a content identity' }
      const now = await deps.identityOf(req.root, req.expect.base)
      if (now === undefined) return { kind: 'refused', detail: 'the changes could not be re-read before discarding — look again and retry' }
      if (!sameReviewIdentity(now, req.expect)) return { kind: 'subject-moved' }
    }

    const restored: string[] = []
    if (toRestore.length > 0) {
      const r = await deps.run(buildRestoreArgs(req.root, req.baseline, toRestore))
      if (r.ok) restored.push(...toRestore)
      else for (const path of toRestore) failed.push({ path, detail: detailOf(r) })
    }

    const removed: string[] = []
    for (const path of toRemove) {
      const absolute = join(req.root, path)
      try {
        deps.removeFile(absolute)
        removed.push(absolute)
      } catch (error: unknown) {
        failed.push({ path, detail: String(error).slice(0, DISCARD_DETAIL_MAX) })
      }
    }

    return { kind: 'discarded', restored, removed, failed }
  }
}
