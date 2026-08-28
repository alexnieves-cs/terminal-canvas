import {
  buildBaselineArgs,
  buildHeadArgs,
  buildRepoRootArgs,
  parseRepoRoot
} from './git-args'
import type { ReviewBaseline, ReviewResult } from '@shared/review'

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
    return { kind: 'clean', root: baseline.root }
  }

  return { resolveRepo, captureBaseline, review }
}
