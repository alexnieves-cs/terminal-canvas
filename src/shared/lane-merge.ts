/**
 * M315. ACCEPT — the last step of the primary journey, landed locally.
 *
 * Before this, a task's lane could be reviewed, checked and turned into a pull
 * request, and nothing else: a repository with no GitHub remote had no way to
 * take the agent's work at all, and the guide's last sentence ("this task is
 * ready") left the change sitting on a side branch. Accepting merges the
 * lane's branch into whatever the main tree has checked out, and only after
 * the person has seen a plan that names both branches and the commit count.
 *
 * Two calls through one door: `dryRun: true` reads and refuses by name, and
 * changes nothing; the real call re-reads everything and refuses the same way
 * before it writes, so the plan the person confirmed cannot be stale by the
 * time git runs (`expectHead`).
 */
export interface LaneMergeRequest {
  /** The lane's worktree path — main resolves the repository from it, never from the renderer. */
  lane: string
  /** The task's title, carried into the merge commit's message. */
  title: string
  /** Read only; nothing is written. */
  dryRun?: boolean
  /** The lane HEAD the person saw in the plan; a different HEAD now is `moved`, never a merge of something unread. */
  expectHead?: string
}

export type LaneMergeResult =
  /** The dry run's answer: what WOULD be merged, into what. */
  | { kind: 'ready'; branch: string; into: string; commits: number; head: string; root: string }
  | { kind: 'merged'; branch: string; into: string; commits: number; sha: string }
  /** A named reason nothing was written — dirty trees, a detached main tree, nothing to merge. */
  | { kind: 'refused'; reason: string }
  /** The lane moved after the plan was shown. */
  | { kind: 'moved' }
  /** The merge stopped on conflicts and was ABORTED: the main tree is as it was. */
  | { kind: 'conflict'; files: string[]; into: string }
  | { kind: 'failed'; detail: string }

/** The sentence the confirm arm shows — one place, so the button and its check agree. */
export function laneMergePlanSentence(plan: Extract<LaneMergeResult, { kind: 'ready' }>): string {
  const commits = `${plan.commits} commit${plan.commits === 1 ? '' : 's'}`
  return `Merge ${commits} from ${plan.branch} into ${plan.into}? This changes ${plan.into} in your repository; the lane stays until you remove it.`
}

/** What each non-plan answer says, in words a person acts on. */
export function laneMergeOutcome(result: LaneMergeResult): string {
  switch (result.kind) {
    case 'ready': return laneMergePlanSentence(result)
    case 'merged': return `Merged ${result.commits} commit${result.commits === 1 ? '' : 's'} from ${result.branch} into ${result.into} (${result.sha.slice(0, 7)}).`
    case 'refused': return result.reason
    case 'moved': return 'The lane changed after you looked — review the new changes, then accept again.'
    case 'conflict': return `The merge into ${result.into} conflicted in ${result.files.length === 0 ? 'some files' : result.files.slice(0, 3).join(', ') + (result.files.length > 3 ? ` and ${result.files.length - 3} more` : '')}, so nothing was merged. Send it back and ask the agent to bring its branch up to date.`
    case 'failed': return `Nothing was merged — git said: ${result.detail}`
  }
}
