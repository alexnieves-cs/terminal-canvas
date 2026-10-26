import type { DiffLine, ReviewDiff, ReviewDiffRequest, ReviewDiscardRequest, ReviewDiscardResult } from '../shared/review'
import { lessonsFromDiscard, type Lesson } from '../shared/lessons'

/**
 * M570 (lane O). A discard teaches a lesson — taken HERE, around main's one
 * discarder, rather than at the renderer's five call sites (the review node's
 * per-file and footer buttons, the palette, the toast's Undo, Orchestrate),
 * so a sixth door cannot forget to.
 *
 * The diff is read BEFORE the discard runs: afterwards the work is gone, and
 * the lesson would be a path with nothing in it. It is recorded only AFTER
 * the discarder answers `discarded`, and only for the paths it reports
 * restored or removed — a refusal, a moved subject or a failed path threw
 * nothing away and teaches nothing.
 *
 * Capture can never cost the discard. Every read and the record are inside a
 * catch that swallows: a person who pressed Discard gets the discard whether
 * or not the lesson could be kept. At most CAPTURE_PATHS_MAX files are read,
 * so a discard-all of a thousand generated files is one quick round of git
 * calls, not a thousand.
 */

export const CAPTURE_PATHS_MAX = 20

export interface LessonCaptureDeps {
  fileDiff: (req: ReviewDiffRequest) => Promise<ReviewDiff>
  /** The main tree a (worktree) root belongs to. */
  commonRootOf: (root: string) => Promise<string>
  record: (lessons: readonly Lesson[]) => void
  now: () => number
}

const linesOf = (d: ReviewDiff): DiffLine[] | null => (d.kind === 'diff' ? d.lines : null)
const changed = (lines: DiffLine[] | null): boolean => lines !== null && lines.some((l) => l.kind === 'add' || l.kind === 'del')

export function withLessonCapture(
  discard: (req: ReviewDiscardRequest) => Promise<ReviewDiscardResult>,
  deps: LessonCaptureDeps
): (req: ReviewDiscardRequest) => Promise<ReviewDiscardResult> {
  return async (req) => {
    const before = new Map<string, DiffLine[] | null>()
    try {
      for (const path of req.paths.slice(0, CAPTURE_PATHS_MAX)) {
        // Tracked first; a path the baseline never held shows only through
        // --no-index, so an empty tracked diff is asked again as untracked.
        const base = { repoRoot: req.root, baselineSha: req.baseline, path }
        let lines = linesOf(await deps.fileDiff({ ...base, untracked: false }))
        if (!changed(lines)) lines = linesOf(await deps.fileDiff({ ...base, untracked: true }))
        before.set(path, lines)
      }
    } catch { /* an unreadable diff is an empty excerpt, never a lost discard */ }

    const result = await discard(req)
    if (result.kind !== 'discarded') return result

    try {
      const gone = [...result.restored, ...result.removed].filter((p) => before.has(p))
      if (gone.length > 0) {
        const root = await deps.commonRootOf(req.root)
        deps.record(lessonsFromDiscard({
          root,
          baseline: req.baseline,
          panelId: req.subjectId,
          at: deps.now(),
          files: gone.map((path) => ({ path, lines: before.get(path) ?? null }))
        }))
      }
    } catch { /* the discard happened; the lesson is best effort */ }
    return result
  }
}
