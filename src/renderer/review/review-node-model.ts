import type { ReviewResult, ReviewSubject } from '@shared/review'

/**
 * A review node's rendered content, as plain data.
 *
 * A SECOND reader of ReviewResult beside inspector-fields.ts's
 * buildReviewFields, and the split is deliberate. The two differ on exactly
 * one decision and it is the important one: the pane HIDES itself for
 * `not-a-repo` and for an unresolved query, because it is a 260px column the
 * user did not ask for and a permanent placeholder there teaches them to stop
 * reading it. A node is a panel the user deliberately opened — an empty one
 * reads as a broken app, not as an honest absence. Everything else the two
 * agree about is shared, not copied: this module imports nothing from the
 * pane, but both spell the same summary through the same rules below, and a
 * change to one is a change to review the other against.
 */

/**
 * Sixty, against the pane's ten. The node is a scroll host in world space and
 * the pane is a fixed 260px column, so the cap that keeps one honest starves
 * the other: ten files is a truncated review of any real agent's work, and
 * `more` reports the remainder in both.
 */
export const NODE_FILE_CAP = 60

/**
 * Whether this node can commit what it is showing, as data rather than as a
 * rendering decision.
 *
 * Three states rather than two, and `blocked` is the one that earns its place:
 * `shared` reports real files that genuinely cannot be attributed to one
 * agent, so committing them would bundle another agent's work under this
 * node's message. Hiding the control there would make "not supported here"
 * indistinguishable from "not built yet" — verify:palette 31's rule — so it
 * renders, disabled, with the reason on screen.
 */
export type ReviewNodeCommit =
  | {
      kind: 'ready'
      /**
       * EVERY path the result reported, not the rows under NODE_FILE_CAP. The
       * cap is a display bound; deriving the commit from the rendered rows
       * would drop every file past the sixtieth from an irreversible write,
       * silently, in a commit that looks complete.
       */
      paths: string[]
      label: string
    }
  | { kind: 'blocked'; reason: string }
  | { kind: 'none' }

/**
 * M53. The commit's mirror, with one more `blocked` arm: `shared` blocks it
 * by name for the same reason it blocks the commit, and the reason must
 * still NAME the sharing. Every arm with nothing to restore to is `none`.
 */
export type ReviewNodeDiscard =
  | { kind: 'ready'; paths: string[] }
  | { kind: 'blocked'; reason: string }
  | { kind: 'none' }

export interface ReviewNodeRow {
  path: string
  added: number
  removed: number
  binary: boolean
  untracked: boolean
  /**
   * On the ROW, not as a separate id on the model, so the view renders in one
   * pass — and so an expanded path that is no longer in the list (the file was
   * reverted between two queries) expands nothing rather than leaving an open
   * body attached to a row that is gone.
   */
  expanded: boolean
  /** M77. How many tool calls of a chat subject named this path. Absent for a terminal's node and for an untouched file. */
  touches?: number
}

export interface ReviewNodeModel {
  heading: string
  root: string
  summary: string
  /** The honest arms' explanation. Absent when there is nothing to explain. */
  note?: string
  files: ReviewNodeRow[]
  more: number
  commit: ReviewNodeCommit
  discard: ReviewNodeDiscard
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

export function buildReviewNodeModel(input: {
  subject: ReviewSubject
  /** The user's own name for the NODE, if they renamed it. */
  title?: string
  result: ReviewResult | undefined
  expandedPath: string | null
  /** M77. Tool-call counts by root-relative path, from the subject chat's transcript. Optional so every pre-M77 caller keeps its meaning. */
  touches?: Record<string, number>
}): ReviewNodeModel {
  const { subject, title, result, expandedPath, touches } = input
  // The same shape as railLabel's honest chain: the user's own name outranks
  // everything, and the fallback names the SUBJECT rather than the node,
  // because "review" alone tells nobody which agent's work this is. The label
  // is the snapshot taken at creation — the subject panel may be gone.
  const heading = title ?? `review: ${subject.label}`
  const root = subject.repoRoot

  if (result === undefined) {
    return { heading, root, summary: 'reading…', files: [], more: 0, commit: { kind: 'none' }, discard: { kind: 'none' } }
  }
  switch (result.kind) {
    case 'never-started':
      return { heading, root, summary: 'nothing yet', note: 'this panel had no session when the review was opened', files: [], more: 0, commit: { kind: 'none' }, discard: { kind: 'none' } }
    case 'not-a-repo':
      // RENDERED here, hidden in the pane. See this module's own header.
      return { heading, root, summary: 'no repository', note: 'this panel was not spawned inside a git repository', files: [], more: 0, commit: { kind: 'none' }, discard: { kind: 'none' } }
    case 'git-missing':
      return { heading, root, summary: 'unavailable', note: 'no git binary was found', files: [], more: 0, commit: { kind: 'none' }, discard: { kind: 'none' } }
    case 'repo-unreadable':
      return { heading, root, summary: 'unavailable', note: `git could not open this repository — ${result.detail}`, files: [], more: 0, commit: { kind: 'none' }, discard: { kind: 'none' } }
    case 'baseline-lost':
      return { heading, root, summary: 'unattributable', note: 'this repository could not be read against its baseline', files: [], more: 0, commit: { kind: 'none' }, discard: { kind: 'none' } }
    case 'clean':
      // NOT an empty render: a panel that genuinely changed nothing and one
      // the feature is broken for must not look the same.
      return { heading, root, summary: 'no changes', files: [], more: 0, commit: { kind: 'none' }, discard: { kind: 'none' } }
    default:
      break
  }

  const rows: ReviewNodeRow[] = result.files.slice(0, NODE_FILE_CAP).map((f) => ({
    path: f.path,
    added: f.added,
    removed: f.removed,
    binary: f.binary,
    untracked: f.untracked,
    expanded: f.path === expandedPath,
    ...(touches !== undefined && (touches[f.path] ?? 0) > 0 ? { touches: touches[f.path] as number } : {})
  }))
  const more = Math.max(0, result.files.length - NODE_FILE_CAP)
  if (result.kind === 'shared') {
    return {
      heading,
      root,
      summary: `${plural(result.files.length, 'file')} changed`,
      // M77: with tool-call counts on the rows, the sentence must not
      // contradict them — git cannot attribute; the transcript can.
      note: touches !== undefined && Object.keys(touches).length > 0
        ? `${result.panelCount} panels share this repository — git changes are unattributed; tool calls are this chat's own`
        : `${result.panelCount} panels share this repository, so changes cannot be attributed`,
      files: rows,
      more,
      commit: {
        kind: 'blocked',
        reason:
          `${result.panelCount} panels share this checkout, so these changes ` +
          'cannot be attributed to one agent — committing them here would put ' +
          'another agent\'s work under this message.'
      },
      // M53. Blocked for a stronger reason than the commit: a discard here
      // would DESTROY another agent's work, not misattribute it. Main refuses
      // on its own count as well; this is the visible half.
      discard: {
        kind: 'blocked',
        reason: `${result.panelCount} panels share this checkout — a discard here could throw away another agent's work`
      }
    }
  }
  return {
    heading,
    root,
    summary: `${plural(result.files.length, 'file')} changed · +${result.added} −${result.removed}`,
    files: rows,
    more,
    commit: {
      kind: 'ready',
      // BOTH sides of a rename. `git diff --numstat` does rename detection by
      // default, so `git mv old new` arrives as ONE file with `path: new` and
      // `renamedFrom: old` — and staging only the destination leaves HEAD's
      // own `old` in the scratch index (read-tree seeded it from HEAD), so the
      // commit RESURRECTS a file the agent deleted while the node says "1 file
      // changed". buildStageArgs' `--remove` already stages the deletion once
      // the path is in the set; all that was missing was the path. The
      // rendered `files` list deliberately does NOT grow the same way — one
      // `git mv` is one row, and one commit set of two paths, which is check
      // 57's display-versus-commit split stated from the other side.
      paths: result.files.flatMap((f) =>
        f.renamedFrom === undefined ? [f.path] : [f.path, f.renamedFrom]),
      label: `Commit ${plural(result.files.length, 'file')}`
    },
    // M53. The same path set as the commit, renames included: restoring
    // `old` from the baseline and removing `new` is what un-does a `git mv`.
    discard: {
      kind: 'ready',
      paths: result.files.flatMap((f) =>
        f.renamedFrom === undefined ? [f.path] : [f.path, f.renamedFrom])
    }
  }
}

/*
 * There is deliberately NO reviewNodeSignature here, and the absence is worth
 * a note because rail-rows.ts and inspector-fields.ts both carry one.
 *
 * A signature exists to answer "did anything I render change" when the
 * INPUTS cannot answer it: buildRailRows is handed `panels.map(...)`, a
 * freshly-allocated array of freshly-allocated objects on every render, so
 * identity there is meaningless and only content can be compared. Every
 * input to buildReviewNodeModel survives a rect change by reference instead
 * (see ReviewNode.tsx's memo), so React's own dependency comparison already
 * answers it — and serializing a model that carries up to DIFF_MAX_LINES
 * lines of diff text, once per frame of a drag, would impose exactly the
 * 60Hz cost a signature is supposed to remove. verify:rail 52 pins the
 * property that actually matters (this function is pure in its inputs) and
 * does its own serializing, where it is free.
 */
