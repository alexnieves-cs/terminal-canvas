import {
  buildBaselineArgs,
  buildHeadArgs,
  buildNumstatArgs,
  buildObjectExistsArgs,
  buildRepoRootArgs,
  buildUntrackedArgs,
  parseNulList,
  parseNumstat,
  parseRepoRoot
} from './git-args'
import type { ReviewBaseline, ReviewFile, ReviewResult } from '@shared/review'

export interface GitResult {
  stdout: string
  /** Exit status 0. */
  ok: boolean
  /** The git binary itself could not be spawned (ENOENT). */
  notFound: boolean
}

export type GitRunner = (args: string[]) => Promise<GitResult>

export interface ReviewEngineDeps {
  run: GitRunner
  /** The panel's stored baseline, or undefined if it has never spawned. */
  baselineOf: (panelId: string) => ReviewBaseline | undefined
  /** How many OTHER panels hold a baseline in this root. */
  peersInRepo: (root: string, exceptPanelId: string) => number
}

export interface ReviewEngine {
  resolveRepo(cwd: string): Promise<string | null>
  captureBaseline(root: string): Promise<string | null>
  review(panelId: string): Promise<ReviewResult>
}

export function createReviewEngine(deps: ReviewEngineDeps): ReviewEngine {
  /**
   * Sticky, and deliberately not reset: if git cannot be spawned once it will
   * not be spawnable a moment later, and re-attempting on every selection
   * change would spend a process launch per click to learn the same thing.
   */
  let gitMissing = false

  const run = async (args: string[]): Promise<GitResult> => {
    const result = await deps.run(args)
    if (result.notFound) gitMissing = true
    return result
  }

  /**
   * Trim, and treat empty as absent. Deliberately NOT parseRepoRoot, which
   * does the same thing: reusing a function named for repository paths to
   * read a sha would make the next reader wonder which of the two meanings
   * had drifted.
   */
  const trimmed = (stdout: string): string | null => {
    const t = stdout.trim()
    return t === '' ? null : t
  }

  const resolveRepo = async (cwd: string): Promise<string | null> => {
    const result = await run(buildRepoRootArgs(cwd))
    return result.ok ? parseRepoRoot(result.stdout) : null
  }

  const captureBaseline = async (root: string): Promise<string | null> => {
    const created = await run(buildBaselineArgs(root))
    const sha = created.ok ? trimmed(created.stdout) : null
    if (sha !== null) return sha
    // A clean tree prints nothing. HEAD is then the correct baseline — and an
    // empty repository has no HEAD either, which is null rather than a throw.
    const head = await run(buildHeadArgs(root))
    return head.ok ? trimmed(head.stdout) : null
  }

  const review = async (panelId: string): Promise<ReviewResult> => {
    if (gitMissing) return { kind: 'git-missing' }

    const baseline = deps.baselineOf(panelId)
    if (baseline === undefined) return { kind: 'never-started' }
    const { root, sha } = baseline

    // Validated FIRST, and before the shared check: "we cannot attribute
    // these changes" and "we have nothing to diff against" are different
    // sentences, and the second one is the one the user can act on.
    const exists = await run(buildObjectExistsArgs(root, sha))
    if (gitMissing) return { kind: 'git-missing' }
    if (!exists.ok) return { kind: 'baseline-lost', root }

    const numstat = await run(buildNumstatArgs(root, sha))
    // A failed diff is NOT an empty diff. The checkout may have been deleted
    // or moved out from under a still-running panel; reporting "no changes"
    // there is the confident wrong answer this milestone exists to avoid.
    if (!numstat.ok) return { kind: 'baseline-lost', root }

    const untracked = await run(buildUntrackedArgs(root))

    const files: ReviewFile[] = parseNumstat(numstat.stdout).map((e) => ({
      path: e.path,
      added: e.added,
      removed: e.removed,
      binary: e.binary,
      untracked: false,
      ...(e.renamedFrom !== undefined ? { renamedFrom: e.renamedFrom } : {})
    }))
    // A brand-new file is the commonest thing an agent produces and it never
    // appears in `git diff`. Enumerated rather than reached with `add -N`,
    // which would mutate an index the agent may be using right now.
    for (const path of untracked.ok ? parseNulList(untracked.stdout) : []) {
      files.push({ path, added: 0, removed: 0, binary: false, untracked: true })
    }

    const peers = deps.peersInRepo(root, panelId)
    if (peers > 0) return { kind: 'shared', root, panelCount: peers + 1, files }

    // Checked ABOVE the peers branch, deliberately reordered from the plan's
    // draft: a repo where nothing has changed is unambiguously clean, however
    // many panels share it — there is nothing to fail to attribute, so
    // reporting "shared, can't attribute" beside "0 files changed" would be a
    // manufactured ambiguity rather than a real one.
    if (files.length === 0) return { kind: 'clean', root }

    return {
      kind: 'changes',
      root,
      files,
      added: files.reduce((n, f) => n + f.added, 0),
      removed: files.reduce((n, f) => n + f.removed, 0)
    }
  }

  return { resolveRepo, captureBaseline, review }
}
