import {
  buildBranchArgs,
  buildCountAheadArgs,
  buildFullStatusArgs,
  buildHeadArgs,
  buildMergeAbortArgs,
  buildMergeArgs,
  buildTrackedStatusArgs,
  buildUnmergedArgs,
  parseNulList
} from './git-args'
import type { GitResult, GitRunner } from './review-engine'
import type { LaneMergeRequest, LaneMergeResult } from '@shared/lane-merge'

const DETAIL_MAX = 2000
const detailOf = (r: GitResult): string => `${r.stderr}${r.stderr && r.stdout ? '\n' : ''}${r.stdout}`.trim().slice(0, DETAIL_MAX)
const firstLine = (s: string): string => s.split('\n').find((l) => l.trim() !== '')?.trim() ?? ''

export interface LaneMergeDeps {
  run: GitRunner
  /** The MAIN tree of the repository a path belongs to (`ReviewEngine.commonRootOf`). */
  commonRootOf: (path: string) => Promise<string>
}

/**
 * M315. Accept a task: merge its lane's branch into the main tree's checked-out
 * branch. See shared/lane-merge.ts for the contract.
 *
 * Every refusal comes BEFORE the one write, and each one is a thing a person
 * can act on: the main tree has edits of its own (a merge on top would mix
 * them into the task), the lane has uncommitted work (it would be left
 * behind, and the person would believe it landed), the main tree is on no
 * branch, or there is nothing to merge. A conflict is not left half-done in
 * the person's checkout: the merge is aborted and the files are named.
 *
 * Injected runner, like review-commit.ts, so the whole sequence is drivable in
 * the plain-node tier against a fake.
 */
export function createLaneMerger(deps: LaneMergeDeps): (req: LaneMergeRequest) => Promise<LaneMergeResult> {
  return async (req) => {
    const lane = req.lane
    const laneBranch = await deps.run(buildBranchArgs(lane))
    if (laneBranch.notFound) return { kind: 'refused', reason: 'git was not found on this Mac' }
    if (!laneBranch.ok) return { kind: 'refused', reason: `the lane could not be read — ${firstLine(laneBranch.stderr) || 'git gave no reason'}` }
    const branch = laneBranch.stdout.trim()
    if (branch === '' || branch === 'HEAD') return { kind: 'refused', reason: 'the lane is not on a branch, so there is nothing to merge by name' }

    const root = await deps.commonRootOf(lane)
    if (root === lane) return { kind: 'refused', reason: 'this is the main tree, not a lane — there is nothing to merge it into' }

    const mainBranch = await deps.run(buildBranchArgs(root))
    if (!mainBranch.ok) return { kind: 'refused', reason: `the main tree could not be read — ${firstLine(mainBranch.stderr) || 'git gave no reason'}` }
    const into = mainBranch.stdout.trim()
    if (into === '' || into === 'HEAD') return { kind: 'refused', reason: 'the main tree is not on a branch (detached HEAD) — check out the branch to merge into, then accept again' }
    if (into === branch) return { kind: 'refused', reason: `the main tree already has ${branch} checked out` }

    const laneDirty = await deps.run(buildFullStatusArgs(lane))
    if (!laneDirty.ok) return { kind: 'refused', reason: `the lane's status could not be read — ${firstLine(laneDirty.stderr)}` }
    if (laneDirty.stdout.trim() !== '') return { kind: 'refused', reason: 'the lane has changes that are not committed — commit them in the review first, or they would be left behind' }

    const mainDirty = await deps.run(buildTrackedStatusArgs(root))
    if (!mainDirty.ok) return { kind: 'refused', reason: `the main tree's status could not be read — ${firstLine(mainDirty.stderr)}` }
    if (mainDirty.stdout.trim() !== '') return { kind: 'refused', reason: `${into} has uncommitted edits in the main tree — commit or stash them first, so the task's changes are not mixed into yours` }

    const head = await deps.run(buildHeadArgs(lane))
    if (!head.ok) return { kind: 'refused', reason: `the lane's head could not be read — ${firstLine(head.stderr)}` }
    const laneHead = head.stdout.trim()
    if (req.expectHead !== undefined && req.expectHead !== laneHead) return { kind: 'moved' }

    const ahead = await deps.run(buildCountAheadArgs(root, into, branch))
    const commits = ahead.ok ? Number(ahead.stdout.trim()) : NaN
    if (!Number.isInteger(commits)) return { kind: 'refused', reason: `the commits to merge could not be counted — ${firstLine(ahead.stderr)}` }
    if (commits === 0) return { kind: 'refused', reason: `nothing to merge — ${into} already has every commit on ${branch}` }

    if (req.dryRun === true) return { kind: 'ready', branch, into, commits, head: laneHead, root }

    const title = req.title.replace(/\s+/g, ' ').trim().slice(0, 120)
    const merged = await deps.run(buildMergeArgs(root, branch, title === '' ? `Merge ${branch}` : `Merge ${branch}: ${title}`))
    if (!merged.ok) {
      const unmerged = await deps.run(buildUnmergedArgs(root))
      const files = unmerged.ok ? parseNulList(unmerged.stdout) : []
      // Aborted whether or not the list could be read: a merge git started
      // and stopped leaves MERGE_HEAD in the person's own checkout, and the
      // next thing they typed there would be committed as half a merge.
      const aborted = await deps.run(buildMergeAbortArgs(root))
      if (files.length > 0 || /CONFLICT/.test(merged.stdout)) return { kind: 'conflict', files, into }
      return { kind: 'failed', detail: detailOf(merged) + (aborted.ok ? '' : `\n(the merge could not be aborted: ${firstLine(aborted.stderr)})`) }
    }
    const after = await deps.run(buildHeadArgs(root))
    // The merge LANDED; a failed read-back is a reporting gap, never a failure.
    return { kind: 'merged', branch, into, commits, sha: after.ok ? after.stdout.trim() : '' }
  }
}
