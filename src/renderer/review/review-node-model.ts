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
}

export interface ReviewNodeModel {
  heading: string
  root: string
  summary: string
  /** The honest arms' explanation. Absent when there is nothing to explain. */
  note?: string
  files: ReviewNodeRow[]
  more: number
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

export function buildReviewNodeModel(input: {
  subject: ReviewSubject
  /** The user's own name for the NODE, if they renamed it. */
  title?: string
  result: ReviewResult | undefined
  expandedPath: string | null
}): ReviewNodeModel {
  const { subject, title, result, expandedPath } = input
  // The same shape as railLabel's honest chain: the user's own name outranks
  // everything, and the fallback names the SUBJECT rather than the node,
  // because "review" alone tells nobody which agent's work this is. The label
  // is the snapshot taken at creation — the subject panel may be gone.
  const heading = title ?? `review: ${subject.label}`
  const root = subject.repoRoot

  if (result === undefined) {
    return { heading, root, summary: 'reading…', files: [], more: 0 }
  }
  switch (result.kind) {
    case 'never-started':
      return { heading, root, summary: 'nothing yet', note: 'this panel had no session when the review was opened', files: [], more: 0 }
    case 'not-a-repo':
      // RENDERED here, hidden in the pane. See this module's own header.
      return { heading, root, summary: 'no repository', note: 'this panel was not spawned inside a git repository', files: [], more: 0 }
    case 'git-missing':
      return { heading, root, summary: 'unavailable', note: 'no git binary was found', files: [], more: 0 }
    case 'repo-unreadable':
      return { heading, root, summary: 'unavailable', note: `git could not open this repository — ${result.detail}`, files: [], more: 0 }
    case 'baseline-lost':
      return { heading, root, summary: 'unattributable', note: 'this repository could not be read against its baseline', files: [], more: 0 }
    case 'clean':
      // NOT an empty render: a panel that genuinely changed nothing and one
      // the feature is broken for must not look the same.
      return { heading, root, summary: 'no changes', files: [], more: 0 }
    default:
      break
  }

  const rows: ReviewNodeRow[] = result.files.slice(0, NODE_FILE_CAP).map((f) => ({
    path: f.path,
    added: f.added,
    removed: f.removed,
    binary: f.binary,
    untracked: f.untracked,
    expanded: f.path === expandedPath
  }))
  const more = Math.max(0, result.files.length - NODE_FILE_CAP)
  if (result.kind === 'shared') {
    return {
      heading,
      root,
      summary: `${plural(result.files.length, 'file')} changed`,
      note: `${result.panelCount} panels share this repo — changes can't be attributed`,
      files: rows,
      more
    }
  }
  return {
    heading,
    root,
    summary: `${plural(result.files.length, 'file')} changed · +${result.added} −${result.removed}`,
    files: rows,
    more
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
