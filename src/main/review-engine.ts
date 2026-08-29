import {
  buildBaselineArgs,
  buildFileDiffArgs,
  buildHeadArgs,
  buildNewFileDiffArgs,
  buildNumstatArgs,
  buildObjectExistsArgs,
  buildRepoRootArgs,
  buildUntrackedArgs,
  parseDiffLines,
  parseNulList,
  parseNumstat,
  parseRepoRoot
} from './git-args'
import type { ReviewBaseline, ReviewDiff, ReviewDiffRequest, ReviewFile, ReviewResult } from '@shared/review'

export interface GitResult {
  stdout: string
  /** Exit status 0. */
  ok: boolean
  /** The git binary itself could not be spawned (ENOENT). */
  notFound: boolean
  /**
   * The process's exit status, or -1 when it never ran (notFound, or a
   * timeout that killed it with a signal). Carried since M9b for exactly one
   * decision: 128 is git's own "fatal:" status, and it is what separates
   * "this directory is not a repository" from "git declined to open it".
   */
  code: number
  /** First use: the detail repo-unreadable reports. Capped by the caller. */
  stderr: string
}

/**
 * Options for ONE git call. Optional and defaulted throughout, the same trade
 * ReviewEngineDeps.notARepo makes: every fake runner written before M9c is a
 * one-parameter arrow, and a required second argument would break all of them
 * rather than leaving their behaviour exactly as it was.
 */
export interface GitRunOptions {
  /**
   * Merged OVER the login environment, never in place of it. The one caller
   * is the commit sequencer, passing GIT_INDEX_FILE so a commit is staged in
   * a scratch index instead of the repository's own.
   */
  env?: Record<string, string>
}

export type GitRunner = (args: string[], opts?: GitRunOptions) => Promise<GitResult>

export interface ReviewEngineDeps {
  run: GitRunner
  /** The panel's stored baseline, or undefined if it has never spawned. */
  baselineOf: (panelId: string) => ReviewBaseline | undefined
  /** How many OTHER panels hold a baseline in this root. */
  peersInRepo: (root: string, exceptPanelId: string) => number
  /**
   * True once a capture for this panel resolved a cwd that is NOT a
   * repository. `baselineOf` alone cannot distinguish "spawned into a
   * non-repo directory" from "has not spawned at all" — a non-repo capture
   * finds nothing to store, so baselineOf stays undefined FOREVER either
   * way, and without this the pane would report "not started" for the rest
   * of a panel's life the moment it spawned somewhere other than a
   * repository, which review.ts's own comment on 'not-a-repo' calls "the
   * ordinary answer... i.e. most panels". Optional and defaulted to `false`
   * so every existing fixture that builds an engine without this dep keeps
   * compiling and keeps its prior behaviour (never-started) unchanged —
   * the same trade PtyManager's captureBaseline/dropBaseline make.
   */
  notARepo?: (panelId: string) => boolean
  /**
   * The detail of a capture that resolved a cwd git DECLINED to open, or
   * undefined. The sibling of `notARepo`, and optional for the same reason:
   * every existing fixture that builds an engine without it keeps compiling
   * and keeps its prior behaviour.
   */
  repoUnreadable?: (panelId: string) => string | undefined
}

export interface ReviewEngine {
  resolveRepo(cwd: string): Promise<RepoAnswer>
  captureBaseline(root: string): Promise<string | null>
  /** The panel-addressed question: resolve this panel's baseline, then ask. */
  review(panelId: string): Promise<ReviewResult>
  /**
   * The baseline-addressed question, and the ONE a review node asks. It must
   * never consult baselineOf: main drops a panel's baseline on kill, and a
   * node has to keep answering after its subject is dismissed.
   */
  reviewAt(baseline: ReviewBaseline, subjectId: string): Promise<ReviewResult>
  fileDiff(req: ReviewDiffRequest): Promise<ReviewDiff>
}

/**
 * What a cwd turned out to be. Three answers, not two, since M9b.
 *
 * The discriminator is git's own exit status plus what it said. 128 is git's
 * "fatal:" status, and `rev-parse --show-toplevel` outside a repository exits
 * 128 saying "not a git repository" — the ordinary case, and the one that
 * must stay quiet, because it is the answer for most panels. Everything else
 * is a repository git DECLINED to open: the macOS Command Line Tools stub
 * (exists, spawns, exits 1 on everything), safe.directory refusing an unowned
 * checkout, an unreadable .git, a cwd that vanished under a running panel.
 * M9a answered null for all of them alike, so the Changes section simply
 * rendered nothing with no note — invisible as a bug, because it is the same
 * shape as the ordinary case.
 *
 * BOTH conditions are required for not-a-repo. Testing the status alone is
 * wrong in the direction that matters: git exits 128 for plenty of fatals
 * that are not "you are outside a repository".
 */
export type RepoAnswer =
  | { kind: 'root'; root: string }
  | { kind: 'not-a-repo' }
  | { kind: 'unreadable'; detail: string }

/** stderr is a whole process's output; the pane shows one line. */
const DETAIL_MAX = 200

const firstLine = (text: string): string =>
  text.split('\n').find((l) => l.trim() !== '')?.trim().slice(0, DETAIL_MAX) ?? 'git exited non-zero'

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

  const resolveRepo = async (cwd: string): Promise<RepoAnswer> => {
    const result = await run(buildRepoRootArgs(cwd))
    if (result.ok) {
      const root = parseRepoRoot(result.stdout)
      return root === null
        // ok, and nothing on stdout: git answered, and answered nothing.
        // Not a repository is the only reading, and it is the quiet one.
        ? { kind: 'not-a-repo' }
        : { kind: 'root', root }
    }
    if (result.notFound) return { kind: 'unreadable', detail: 'git could not be run' }
    if (result.code === 128 && /not a git repository/i.test(result.stderr)) {
      return { kind: 'not-a-repo' }
    }
    return { kind: 'unreadable', detail: firstLine(result.stderr) }
  }

  const captureBaseline = async (root: string): Promise<string | null> => {
    const created = await run(buildBaselineArgs(root))
    // A FAILED `stash create` is NOT a clean tree, and the two must not share
    // an exit. `stash create` needs the index lock and refuses outright
    // during an unresolved merge or against a corrupt index — all reachable
    // here, because a panel spawns into a repository whose OTHER panels'
    // agents are running git in constantly. Falling through to HEAD there
    // takes a baseline that excludes nothing, so from that moment on the pane
    // attributes every pre-existing uncommitted change in the working tree to
    // this agent, confidently, for the whole life of the panel id — the
    // baseline is persisted and never recaptured within a run. That is the
    // spec's own named worst option. Returning null stores no baseline at
    // all, and the panel honestly reports it has nothing to diff against
    // until its next spawn. verify:review 16b, with 17 as the companion in
    // the other direction.
    if (!created.ok) return null
    const sha = trimmed(created.stdout)
    if (sha !== null) return sha
    // A clean tree SUCCEEDS and prints nothing. HEAD is then the correct
    // baseline — and an empty repository has no HEAD either, which is null
    // rather than a throw.
    const head = await run(buildHeadArgs(root))
    return head.ok ? trimmed(head.stdout) : null
  }

  const reviewAt = async (baseline: ReviewBaseline, subjectId: string): Promise<ReviewResult> => {
    if (gitMissing) return { kind: 'git-missing' }

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
    // The same rule check 29 already states, applied to the SECOND read: the
    // two calls can disagree, because a repository can vanish between them.
    // Treating a failed ls-files like a successful empty one would report
    // "clean", or "changes" with a short list, for a panel whose agent
    // created new files the instant before its checkout became unreadable —
    // the confident wrong answer this milestone exists to avoid, one call
    // later than check 29 already forbids it.
    if (!untracked.ok) return { kind: 'baseline-lost', root }

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
    for (const path of parseNulList(untracked.stdout)) {
      files.push({ path, added: 0, removed: 0, binary: false, untracked: true })
    }

    // Checked ABOVE the peers branch, deliberately reordered from the plan's
    // draft: a repo where nothing has changed is unambiguously clean, however
    // many panels share it — there is nothing to fail to attribute, so
    // reporting "shared, can't attribute" beside "0 files changed" would be a
    // manufactured ambiguity rather than a real one.
    if (files.length === 0) return { kind: 'clean', root }

    const peers = deps.peersInRepo(root, subjectId)
    if (peers > 0) return { kind: 'shared', root, panelCount: peers + 1, files }

    return {
      kind: 'changes',
      root,
      files,
      added: files.reduce((n, f) => n + f.added, 0),
      removed: files.reduce((n, f) => n + f.removed, 0)
    }
  }

  const review = async (panelId: string): Promise<ReviewResult> => {
    if (gitMissing) return { kind: 'git-missing' }

    const baseline = deps.baselineOf(panelId)
    if (baseline === undefined) {
      // Three answers, not two, since M9b — see RepoAnswer's own doc comment.
      // This can only ever fire for a panel with no CAPTURED baseline: none
      // of the three verdicts can be produced once a baseline exists, since
      // this whole branch is gated on `baseline === undefined`. The
      // unreadable check runs FIRST because it is the specific answer and
      // the other two are the general ones.
      const detail = deps.repoUnreadable?.(panelId)
      if (detail !== undefined) return { kind: 'repo-unreadable', detail }
      return deps.notARepo?.(panelId) === true ? { kind: 'not-a-repo' } : { kind: 'never-started' }
    }
    return reviewAt(baseline, panelId)
  }

  const fileDiff = async (req: ReviewDiffRequest): Promise<ReviewDiff> => {
    if (gitMissing) return { kind: 'unavailable' }
    const result = req.untracked
      ? await run(buildNewFileDiffArgs(req.repoRoot, req.path))
      : await run(buildFileDiffArgs(req.repoRoot, req.baselineSha, req.path))
    // --no-index exits 1 precisely WHEN IT FINDS DIFFERENCES, which is the
    // expected outcome for every untracked file. Treating that as a failure
    // makes the feature broken for the commonest thing an agent produces,
    // while modified files keep working — the shape of bug nobody reports
    // because the app "mostly works". verify:review 48.
    const acceptable = result.ok || (req.untracked && result.code === 1)
    if (!acceptable) return { kind: 'unavailable' }
    // git exited 0 and said NOTHING, which is reachable rather than
    // hypothetical: the file was reverted between the numstat that listed it
    // and the click that expanded it. Returning `{ kind: 'diff', lines: [] }`
    // renders an empty box with no explanation — "this file did not change",
    // stated confidently about a file the list beside it says did — which is
    // exactly the wrong answer `unavailable` exists to give instead. This is
    // also what lets ReviewNode.tsx's Hunks say an empty diff is
    // unrenderable: it is unrenderable because this line refuses to produce
    // one. verify:review 47.
    if (result.stdout.trim() === '') return { kind: 'unavailable' }
    // git's own report, and the only honest answer for it: there is nothing
    // to render, and rendering the sentence as source would be a lie about
    // the file's contents.
    if (/^Binary files .* differ$/m.test(result.stdout)) return { kind: 'binary' }
    const { lines, truncated } = parseDiffLines(result.stdout)
    return { kind: 'diff', lines, truncated }
  }

  return { resolveRepo, captureBaseline, review, reviewAt, fileDiff }
}
