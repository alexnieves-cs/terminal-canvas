import {
  buildCommitArgs,
  buildForceRemoveArgs,
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
 * Loud, once, and swallowed. The repository is committed and correct; what is
 * stale is the index, and the visible symptom is a phantom staged change in
 * the agent's own status output. Reporting a FAILURE here would say the work
 * was not committed when it demonstrably was, and the obvious next thing a
 * user does then is commit it twice.
 */
const warnStaleIndex = (r: GitResult): void => {
  console.warn(
    '[review] committed, but the repository index could not be brought back ' +
      'in step with the new HEAD. `git status` in that repository may report ' +
      'staged changes for files that were just committed; `git reset` clears ' +
      'it. ' + detailOf(r)
  )
}

/**
 * Turn the work a review node reports into a commit, without ever writing the
 * repository's own index.
 *
 * Five calls, or six when the commit deleted something. Four of them run
 * against a scratch GIT_INDEX_FILE and the reconciles at the end deliberately
 * do not, because they are the ones that are meant to write the real index —
 * one staging what the commit contains by blob sha, and one dropping the
 * entries for paths the commit removed, which the first cannot see. The
 * sequence and the reasons for it live on the argv builders in git-args.ts;
 * what lives here is the ORDER, the arms, and the one rule that is easy to get
 * backwards: a failure after the commit has landed is not a failed commit.
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
          if (!reconciled.ok) warnStaleIndex(reconciled)
        }
        // The other half of the same tidiness, and it needs its own call
        // because it is a different verb: a path the commit DELETED has no
        // entry in the read-back to restage, so --cacheinfo above never sees
        // it and the real index keeps the entry it had. See
        // buildForceRemoveArgs for what that reads as, and for the staging
        // trade it deliberately accepts.
        const present = new Set(parsed.map((e) => e.path))
        const deleted = req.paths.filter((p) => !present.has(p))
        if (deleted.length > 0) {
          const removed = await deps.run(buildForceRemoveArgs(req.root, deleted))
          if (!removed.ok) warnStaleIndex(removed)
        }
      }

      return { kind: 'committed', sha }
    } finally {
      deps.removeTempIndex(index)
    }
  }
}
