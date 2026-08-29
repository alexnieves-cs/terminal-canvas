import {
  buildCommitArgs,
  buildHeadArgs,
  buildReadTreeArgs,
  buildReconcileArgs,
  buildStageArgs,
  buildStagedEntriesArgs,
  parseStagedEntries
} from './git-args'
import type { GitResult, GitRunner } from './review-engine'
import type { ReviewCommitRequest, ReviewCommitResult } from '@shared/review'

/**
 * How much of git's own output reaches the renderer. A rejecting hook can
 * print an entire lint run; the node is a panel, not a log viewer, and the
 * first lines are the ones that say what was wrong.
 */
export const COMMIT_DETAIL_MAX = 2000

export interface ReviewCommitDeps {
  run: GitRunner
  /**
   * A path for one scratch index. Called once per commit and must be OUTSIDE
   * any repository — a scratch file inside the tree would show up as an
   * untracked file in the very review that is about to be committed.
   */
  tempIndexPath: () => string
  /** Best-effort removal, called in a finally on every path. */
  removeTempIndex: (path: string) => void
}

const detailOf = (r: GitResult): string =>
  `${r.stderr}${r.stderr && r.stdout ? '\n' : ''}${r.stdout}`.trim().slice(0, COMMIT_DETAIL_MAX)

/**
 * Turn the work a review node reports into a commit, without ever writing the
 * repository's own index.
 *
 * Five calls. Four of them run against a scratch GIT_INDEX_FILE and the fifth
 * — the reconcile — deliberately does not, because it is the one that is meant
 * to write the real index. The sequence and the reasons for it live on the
 * argv builders in git-args.ts; what lives here is the ORDER, the arms, and
 * the one rule that is easy to get backwards: a failure after the commit has
 * landed is not a failed commit.
 *
 * Injected deps rather than imports, so the whole transaction is drivable in
 * the plain-node verify tier against a fake runner — the same shape
 * review-engine.ts already has, and the reason neither module may reach for
 * git-runner.ts itself.
 */
export function createReviewCommitter(
  deps: ReviewCommitDeps
): (req: ReviewCommitRequest) => Promise<ReviewCommitResult> {
  return async (req: ReviewCommitRequest): Promise<ReviewCommitResult> => {
    // Before any git call and before a scratch file exists: `update-index`
    // with no paths does nothing, and `git commit` on a scratch index equal to
    // HEAD refuses with a message about an empty commit — a confusing
    // refusal in place of the honest answer.
    if (req.paths.length === 0) return { kind: 'nothing-to-commit' }

    const index = deps.tempIndexPath()
    const scratch = { env: { GIT_INDEX_FILE: index } }
    try {
      const seeded = await deps.run(buildReadTreeArgs(req.root), scratch)
      if (!seeded.ok) return { kind: 'failed', detail: detailOf(seeded) }

      const staged = await deps.run(buildStageArgs(req.root, req.paths), scratch)
      if (!staged.ok) return { kind: 'failed', detail: detailOf(staged) }

      // The one call the user's repository is allowed to say no to. Hooks run
      // here; --no-verify is not offered, because silently skipping a
      // repository's own checks is not something a review tool should do
      // quietly.
      const committed = await deps.run(buildCommitArgs(req.root, req.message), scratch)
      if (!committed.ok) return { kind: 'refused', detail: detailOf(committed) }

      const head = await deps.run(buildHeadArgs(req.root))
      // The commit LANDED. A failure to read its sha back is a reporting gap,
      // not a failed commit, and telling the user otherwise invites them to
      // commit the same work twice.
      const sha = head.ok ? head.stdout.trim() : ''

      // Everything below this line is tidiness for the AGENT's `git status`.
      // It runs after the irreversible half and can never change the answer.
      const entries = await deps.run(buildStagedEntriesArgs(req.root, req.paths), scratch)
      if (entries.ok) {
        const parsed = parseStagedEntries(entries.stdout)
        if (parsed.length > 0) {
          const reconciled = await deps.run(buildReconcileArgs(req.root, parsed))
          if (!reconciled.ok) {
            // Loud, once, and swallowed. The repository is committed and
            // correct; what is stale is the index, and the visible symptom is
            // a phantom staged deletion in the agent's own status output.
            console.warn(
              '[review] committed, but the repository index could not be ' +
                'brought back in step with the new HEAD. `git status` in that ' +
                'repository may report staged deletions for files that were ' +
                'just committed; `git reset` clears it. ' + detailOf(reconciled)
            )
          }
        }
      }

      return { kind: 'committed', sha }
    } finally {
      deps.removeTempIndex(index)
    }
  }
}
