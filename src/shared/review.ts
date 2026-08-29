import type { PanelId } from './types'

/**
 * A panel's session-start snapshot: the repository it was spawned into, and a
 * commit object representing that repository's state at that moment.
 *
 * In shared/ rather than main/ because layout-schema.ts persists it and the
 * renderer receives ReviewResult over IPC.
 */
export interface ReviewBaseline {
  /** Absolute path to the repository root, as `rev-parse --show-toplevel` gave it. */
  root: string
  /** A stash-create commit, or HEAD when the tree was clean at spawn. */
  sha: string
}

/**
 * What a review NODE stores about the panel it reviews: everything needed to
 * ask git the question again, with no live pointer into the panel array.
 *
 * In shared/ beside ReviewBaseline because all three processes hold it — the
 * renderer builds it, layout-schema.ts persists it, and main answers
 * review:at from it.
 *
 * It carries a COPY of the baseline (repoRoot + baselineSha) rather than the
 * subject's id alone, and that is the whole design of the node: main DROPS a
 * panel's stored baseline when its session is killed (see main/index.ts's
 * dropBaseline), so a node that asked `review:panel(subjectId)` would go
 * blank the moment its agent was dismissed — which is exactly the moment a
 * review of finished work is most useful. `label` is a snapshot of the
 * honest chain's answer at creation time for the same reason: the panel it
 * names may not exist any more.
 */
export interface ReviewSubject {
  /** The panel this reviews. Kept for peer attribution, NOT as a live pointer. */
  subjectId: PanelId
  repoRoot: string
  baselineSha: string
  /** The subject's label when the node was made — see above. */
  label: string
}

export interface ReviewFile {
  path: string
  added: number
  removed: number
  binary: boolean
  /** True for a file git has never tracked; it has no counts to report. */
  untracked: boolean
  renamedFrom?: string
}

/**
 * Every arm is a designed state, not an error path. `not-a-repo` in
 * particular is the ordinary answer for a panel in the home directory, and
 * rendering an error for it would put a red field on most panels most of the
 * time.
 */
export type ReviewResult =
  | { kind: 'not-a-repo' }
  | { kind: 'never-started' }
  | { kind: 'git-missing' }
  | { kind: 'baseline-lost'; root: string }
  | { kind: 'clean'; root: string }
  | { kind: 'changes'; root: string; files: ReviewFile[]; added: number; removed: number }
  /**
   * Two or more panels that have RUN share this repository, so no per-panel
   * diff is attributable: each panel's diff-since-its-own-baseline contains
   * everything the others did afterwards. The files are still reported —
   * that is true at the repository level — and `panelCount` is what the pane
   * says instead of a name.
   */
  | { kind: 'shared'; root: string; panelCount: number; files: ReviewFile[] }
  /**
   * The cwd IS (or may be) a repository, and git declined to open it — the
   * Command Line Tools stub, safe.directory, an unreadable .git, a vanished
   * checkout. Distinct from `not-a-repo`, which is the ordinary quiet answer
   * for a panel in the home directory: this one is rendered, with `detail`
   * naming what git said, because a user whose repository is invisible to
   * the app needs to be told rather than shown an empty pane.
   */
  | { kind: 'repo-unreadable'; detail: string }

/**
 * One rendered line of a unified diff. `text` is the raw line INCLUDING its
 * leading marker, because a review pane that stripped the +/- would be
 * unreadable when copied out of, and the node colours from `kind` anyway.
 */
export interface DiffLine {
  kind: 'add' | 'del' | 'context' | 'hunk' | 'meta'
  text: string
}

/**
 * `unavailable` is a designed state, not an error path — the same rule the
 * ReviewResult arms follow. It is what a failed or refused diff says, and it
 * is deliberately NOT an empty `diff`: reporting "nothing changed in this
 * file" for a file the numstat just said changed is exactly the confident
 * wrong answer this feature exists to refuse.
 */
export type ReviewDiff =
  | { kind: 'diff'; lines: DiffLine[]; truncated: number }
  | { kind: 'binary' }
  | { kind: 'unavailable' }

/**
 * Addressed by BASELINE, never by panel id — see ReviewSubject on why a node
 * must be able to ask this question after its subject is gone.
 */
export interface ReviewDiffRequest {
  repoRoot: string
  baselineSha: string
  path: string
  /** Untracked files need --no-index; they appear in no diff against a commit. */
  untracked: boolean
}

export type { PanelId }

/**
 * A commit of the work a review node reports.
 *
 * Addressed by repository ROOT, never by a panel id. M9b made a node ask by
 * baseline precisely so it outlives its subject, and a commit is a repository
 * operation; a panelId here would be a live pointer the node deliberately does
 * not hold, and would go blank at the moment a commit of finished work is most
 * useful. The baseline sha is deliberately NOT carried: nothing in the commit
 * reads it, and a field no caller consults is the customer-free abstraction
 * this codebase already declines elsewhere.
 */
export interface ReviewCommitRequest {
  root: string
  /** Every path the result reported — not only the ones under the render cap. */
  paths: string[]
  message: string
}

/**
 * Five designed states, not one boolean and an error path.
 *
 * `refused` and `failed` split POSITIONALLY rather than by inspecting git's
 * text: `refused` is a non-zero exit from `git commit` itself, which for a
 * rejecting pre-commit hook carries that hook's own output verbatim, and
 * `failed` is a non-zero exit from a call BEFORE the commit was attempted.
 * The two have different fixes — "your repository said no" versus "this did
 * not run" — which is the same standard not-a-repo and repo-unreadable draw.
 *
 * `head-moved` is a third situation and not a shade of either: the repository
 * gained a commit while this one was being prepared, so nothing was attempted.
 * Its fix is a button the node already has — refresh and look again — where
 * `refused` sends the user to their hooks and `failed` to their git.
 */
export type ReviewCommitResult =
  | { kind: 'committed'; sha: string }
  | { kind: 'nothing-to-commit' }
  | { kind: 'head-moved' }
  | { kind: 'refused'; detail: string }
  | { kind: 'failed'; detail: string }
