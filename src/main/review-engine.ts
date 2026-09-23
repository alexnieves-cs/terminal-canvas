import type { LaneStatus } from '../shared/review'
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
  parseRepoRoot,
  buildBranchArgs,
  buildUpstreamArgs,
  buildAheadBehindArgs,
  parseAheadBehind,
  buildMergeBaseArgs,
  buildCommonDirArgs,
  parseCommonRoot,
  buildWorktreeListArgs,
  parseWorktreeList, buildAheadOfArgs, parseAheadOf, buildContentDiffArgs, buildHashObjectArgs } from './git-args'
import { EMPTY_REVIEW_CONTENT, reviewIdentityOf } from './review-identity'
import type { ReviewIdentity } from '../shared/review-identity'
import type { RepoStatus, ReviewAcross, ReviewSection, ReviewBaseline, ReviewDiff, ReviewDiffRequest, ReviewFile, ReviewResult } from '@shared/review'

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
  /**
   * M285 (the critic's gap). Decode stdout as latin1 — a 1:1 byte→char map —
   * instead of utf8, so a diff of a non-UTF-8 file reaches the hasher byte
   * for byte. Under utf8 every invalid byte became U+FFFD, and an edit that
   * swapped one invalid byte for another hashed IDENTICAL. The one caller is
   * the content identity; every other read stays utf8.
   */
  bytes?: true
}

export type GitRunner = (args: string[], opts?: GitRunOptions) => Promise<GitResult>

export interface ReviewEngineDeps {
  /** M86. The worktree records for a root. Optional so every fixture before M86 builds. */
  worktreesOf?: (root: string) => WorktreeRecordRow[]
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

/** M86. What the engine needs to know about the worktrees this app created for a root. */
export interface WorktreeRecordRow {
  path: string
  branch: string
  panelId: string
  panelTitle?: string
}

export interface ReviewEngine {
  /** M86. The branch and its tracking ref, from the local ref alone. */
  status(root: string): Promise<RepoStatus>
  /** M115. A lane's ahead/behind of the ROOT's branch — its upstream does not exist until pushed. */
  laneStatus(path: string, root: string): Promise<LaneStatus>
  /** M86. The main tree, then one section per worktree record; a worktree's diff is since its FORK. */
  reviewAcross(root: string): Promise<ReviewAcross>
  resolveRepo(cwd: string): Promise<RepoAnswer>
  /**
   * M86, exported at M196. The main tree of whatever `root` is inside, from
   * `--git-common-dir`; `root` itself when git cannot say. It was a closure
   * for two callers inside this file until D04 made "which repository is this
   * lane of" a question the whole app asks, and the alternative was a second
   * implementation of a fact this one already answers correctly for an
   * EXTERNALLY created worktree, which no record of ours knows about.
   */
  commonRootOf(root: string): Promise<string>
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
  /**
   * M285. The subject's content identity NOW, against `base` — the same
   * computation `reviewAt` folds into its answer, exposed alone so the commit
   * and discard sequencers can re-check immediately before they write, and
   * so a check's ledger row can record what it tested. `undefined` when any
   * of its git calls failed: unknown, never a guess.
   */
  identityOf(root: string, base: string): Promise<ReviewIdentity | undefined>
  /**
   * M286. A watcher has no baseline: its tree's identity is measured against
   * the tree's OWN HEAD, resolved here. Not a repository, or unreadable, is
   * undefined — a watcher in a plain folder stamps nothing.
   */
  identityAtHead(cwd: string): Promise<ReviewIdentity | undefined>
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

  /** A tree's diff against a sha, with NO peer attribution — a repository, not a panel. */
  const reviewTree = async (baseline: ReviewBaseline): Promise<ReviewResult> => reviewAt(baseline, null)

  const reviewAt = async (baseline: ReviewBaseline, subjectId: string | null): Promise<ReviewResult> => {
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
    //
    // M285. A clean tree's identity needs no further git call: the policy
    // hashes nothing, and `EMPTY_REVIEW_CONTENT` is that hash computed once.
    if (files.length === 0) return { kind: 'clean', root, identity: { base: sha, content: EMPTY_REVIEW_CONTENT } }

    // M285. The content identity, from the same untracked list the rows
    // above came from — so the identity and the file list describe ONE read
    // of the tree, never two. Absent (not a guess) when git could not answer.
    const identity = await contentIdentity(root, sha, files.filter((f) => f.untracked).map((f) => f.path))

    // `null` is a tree, not a panel: no peers to attribute among.
    const peers = subjectId === null ? 0 : deps.peersInRepo(root, subjectId)
    if (peers > 0) return { kind: 'shared', root, panelCount: peers + 1, files, ...(identity === undefined ? {} : { identity }) }

    return {
      kind: 'changes',
      root,
      files,
      added: files.reduce((n, f) => n + f.added, 0),
      removed: files.reduce((n, f) => n + f.removed, 0),
      ...(identity === undefined ? {} : { identity })
    }
  }

  /**
   * M285. The policy in `shared/review-identity.ts`, as two git calls: the
   * binary diff against `base`, then one `hash-object` over every untracked
   * path (skipped when there are none — the empty listing hashes as the empty
   * string either way). Either call failing is `undefined`: an identity that
   * covered half the tree would read as a confident answer about all of it.
   */
  const contentIdentity = async (root: string, base: string, untrackedPaths: readonly string[]): Promise<ReviewIdentity | undefined> => {
    const diff = await deps.run(buildContentDiffArgs(root, base), { bytes: true })
    if (diff.notFound) gitMissing = true
    if (!diff.ok) return undefined
    let listing = ''
    if (untrackedPaths.length > 0) {
      const hashed = await run(buildHashObjectArgs(root, untrackedPaths))
      if (!hashed.ok) return undefined
      const ids = hashed.stdout.split('\n').filter((l) => l !== '')
      // One id per path, or the answer is not about these paths.
      if (ids.length !== untrackedPaths.length) return undefined
      listing = untrackedPaths.map((p, i) => `${p}\0${ids[i] as string}`).join('\n')
    }
    // The diff arrived latin1-decoded: re-encode it to the bytes git wrote.
    return reviewIdentityOf(base, [Buffer.from(diff.stdout, 'latin1'), listing])
  }

  const identityAtHead = async (cwd: string): Promise<ReviewIdentity | undefined> => {
    const repo = await resolveRepo(cwd)
    if (repo.kind !== 'root') return undefined
    const head = await run(buildHeadArgs(repo.root))
    const sha = head.ok ? trimmed(head.stdout) : null
    if (sha === null) return undefined
    return identityOf(repo.root, sha)
  }

  const identityOf = async (root: string, base: string): Promise<ReviewIdentity | undefined> => {
    if (gitMissing) return undefined
    const untracked = await run(buildUntrackedArgs(root))
    if (!untracked.ok) return undefined
    return contentIdentity(root, base, parseNulList(untracked.stdout))
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

  /**
   * M86. Three states in one answer: git declining (`unreadable`), a branch
   * with no upstream (`upstream: null`, a real answer), and the counts. The
   * counts come from the local tracking ref; nothing here fetches.
   */
  /** The main tree of whatever `root` is inside — `root` itself when git cannot say. */
  const commonRootOf = async (root: string): Promise<string> => {
    const common = await run(buildCommonDirArgs(root))
    return (common.ok ? parseCommonRoot(common.stdout) : null) ?? root
  }

  const status = async (root: string): Promise<RepoStatus> => {
    if (gitMissing) return { kind: 'git-missing' }
    const branchResult = await run(buildBranchArgs(root))
    if (gitMissing) return { kind: 'git-missing' }
    if (!branchResult.ok) return { kind: 'unreadable', detail: firstLine(branchResult.stderr) }
    const branch = trimmed(branchResult.stdout) ?? 'HEAD'
    const upstream = await run(buildUpstreamArgs(root))
    const repository = await commonRootOf(root)
    if (!upstream.ok) return { kind: 'status', root, repository, branch, upstream: null }
    const name = trimmed(upstream.stdout) ?? ''
    const counts = await run(buildAheadBehindArgs(root))
    const parsed = counts.ok ? parseAheadBehind(counts.stdout) : null
    if (parsed === null) return { kind: 'unreadable', detail: firstLine(counts.stderr) || 'rev-list gave no counts' }
    return { kind: 'status', root, repository, branch, upstream: { name, ...parsed } }
  }

  // M115. The root's branch is the base; the count runs in the LANE. A lane
  // whose root cannot name a branch is unreadable with git's line, never
  // `ahead 0` — a confident zero beside real commits is the wrong answer.
  const laneStatus = async (path: string, root: string): Promise<LaneStatus> => {
    if (gitMissing) return { kind: 'git-missing' }
    const branchResult = await run(buildBranchArgs(root))
    if (gitMissing) return { kind: 'git-missing' }
    if (!branchResult.ok) return { kind: 'unreadable', detail: firstLine(branchResult.stderr) }
    const base = trimmed(branchResult.stdout) ?? 'HEAD'
    const counts = await run(buildAheadOfArgs(path, base))
    if (gitMissing) return { kind: 'git-missing' }
    const parsed = counts.ok ? parseAheadOf(counts.stdout) : null
    if (parsed === null) return { kind: 'unreadable', detail: firstLine(counts.stderr) || 'rev-list gave no counts' }
    return { kind: 'lane', base, ...parsed }
  }

  /**
   * M86. A worktree's section is its diff since its FORK from the main tree
   * (`merge-base HEAD <root HEAD>` in the worktree), NEVER a panel's baseline:
   * main drops a baseline when its panel is killed, and a review of finished
   * work is exactly what a cross-worktree node is for. A worktree whose
   * directory is gone is a `baseline-lost` section, never a missing one.
   */
  const reviewAcross = async (asked: string): Promise<ReviewAcross> => {
    if (gitMissing) return { kind: 'git-missing' }
    // The MAIN tree, whatever tree was asked from: a panel spawned into a
    // worktree resolves its root to the worktree, and "every worktree of
    // this" must mean the repository's, not the worktree's (M86's verifier).
    const root = await commonRootOf(asked)
    const head = await run(buildHeadArgs(root))
    if (gitMissing) return { kind: 'git-missing' }
    if (!head.ok) return { kind: 'unreadable', detail: firstLine(head.stderr) }
    const headSha = trimmed(head.stdout) ?? ''
    const sections: ReviewSection[] = []
    const mainBranch = await run(buildBranchArgs(root))
    const mainName = mainBranch.ok ? (trimmed(mainBranch.stdout) ?? 'HEAD') : 'HEAD'
    // The main tree's own section: its working changes against HEAD.
    // The main tree's section is a plain tree diff — never the `shared` arm,
    // which is about attributing a panel's diff among peers and has no
    // meaning for the repository itself (M86's verifier).
    // Called `main tree` rather than by its branch, so the heading's label and
    // branch slots do not read as one doubled word (`main main`).
    sections.push({ path: root, branch: mainName, label: 'main tree', result: await reviewTree({ root, sha: headSha }) })
    // Git's own list of worktrees, so a record whose directory is there but
    // is no longer a worktree is told apart from one whose history diverged.
    const listed = await run(buildWorktreeListArgs(root))
    const trees = listed.ok ? parseWorktreeList(listed.stdout).map((t) => t.path) : null
    for (const record of deps.worktreesOf?.(root) ?? []) {
      // The record's path as GIT spells it: a record holds `/var/…` while
      // git lists `/private/var/…`, and a string compare called every
      // worktree removed (M86's verifier's fixture, in the harness). Asking
      // the tree for its own toplevel also answers for a directory that is
      // gone, which is the other way a record stops being a worktree.
      const top = await run(buildRepoRootArgs(record.path))
      const asGit = top.ok ? parseRepoRoot(top.stdout) : null
      const stillATree = asGit !== null && (trees === null || trees.includes(asGit))
      if (!stillATree) {
        sections.push({ path: record.path, branch: record.branch, label: record.panelTitle ?? record.branch, panelId: record.panelId, result: { kind: 'baseline-lost', root: record.path }, note: 'no longer a worktree — it was removed outside this app' })
        continue
      }
      const fork = await run(buildMergeBaseArgs(record.path, headSha))
      const forkSha = fork.ok ? trimmed(fork.stdout) : null
      // Two arms that were one: a directory git cannot open, and a branch
      // with NO COMMON HISTORY (an orphan, a rewritten main). The second is
      // a readable worktree, and "could not be read" named the wrong fix.
      const result: ReviewResult = forkSha === null
        ? { kind: 'baseline-lost', root: record.path }
        : await reviewTree({ root: record.path, sha: forkSha })
      sections.push({
        path: record.path,
        branch: record.branch,
        label: record.panelTitle ?? record.branch,
        panelId: record.panelId,
        result,
        ...(forkSha === null ? {} : { base: forkSha }),
        ...(forkSha === null ? { note: fork.code === 1 ? 'no common history with the main tree' : `git could not read it — ${firstLine(fork.stderr)}` } : {})
      })
    }
    return { kind: 'across', root, sections }
  }

  return { resolveRepo, commonRootOf, captureBaseline, review, reviewAt, fileDiff, status, reviewAcross, laneStatus, identityOf, identityAtHead }
}
