/**
 * A local file shown on the canvas, and what main found when it read it.
 *
 * Shared because main produces a FileResult and the renderer renders one.
 * Deliberately NOT folded into shared/review.ts: the two share a shape (a
 * union of honest states) and nothing else, and merging them would make a
 * change to one able to break the other.
 */

/**
 * What a file panel points at.
 *
 * Always absolute. Nothing expands `~` for a file panel's path — a
 * `~`-prefixed path (e.g. from a hand-edited layout.json) fails safely as
 * `missing`, since Node's fs functions do not expand it. In practice both
 * ways a path gets set (the native file dialog, a Finder drop) already
 * produce absolute paths, unlike a panel's `cwd`, where `resolveCwd` really
 * does expand `~` before spawning.
 *
 * A path and not an inode. A file that is renamed or moved reads as `missing`
 * rather than being followed — see the spec's known limitations. Following a
 * rename means tracking an inode, which is a much larger feature and one that
 * would sometimes follow the wrong file.
 */
export interface FileSource {
  path: string
}

/**
 * Every state a read can land in, each with its own arm.
 *
 * The shape ReviewResult established, for the reason it established it:
 * collapsing any two of these produces a panel that is blank for four
 * different reasons, and a blank panel is indistinguishable from a broken one.
 * `missing` in particular must NOT close the panel — a panel silently
 * vanishing from the canvas is the "a missing feature is indistinguishable
 * from a bug" failure this codebase designs against everywhere else.
 */
export type FileResult =
  | {
      kind: 'text'
      /** Already truncated to FILE_MAX_LINES. */
      content: string
      bytes: number
      /** Lines in the FILE, not in `content` — the two differ when truncated. */
      lines: number
      /**
       * Lines dropped by the render cap. Reported rather than silently
       * omitted: a list that just stops is a list that lies about being
       * complete, the rule parseDiffLines already follows.
       */
      truncatedLines: number
      mtimeMs: number
    }
  | { kind: 'missing' }
  | { kind: 'too-large'; bytes: number; cap: number }
  | { kind: 'binary'; bytes: number }
  | { kind: 'unreadable'; detail: string }

/**
 * Caps, not preferences, and the reason is prompts.ts's reason: the path is
 * whatever the user pointed a panel at, so both the size and the content are
 * attacker-shaped inputs in the ordinary case of "I opened a file in a repo I
 * just cloned".
 *
 * The two are separate numbers on purpose. FILE_MAX_BYTES is a READ cap and
 * refuses outright (prompts.ts's "skipped, never truncated" rule — half a file
 * is a different file). FILE_MAX_LINES is a RENDER cap and truncates while
 * reporting the remainder, because a 2MB single-line minified bundle is under
 * the byte cap and would still lock the renderer laying it out.
 */
export const FILE_MAX_BYTES = 2 * 1024 * 1024
export const FILE_MAX_LINES = 10_000

/**
 * How far in to look for a NUL before calling a file binary.
 *
 * Bounded rather than whole-file because the answer is almost always in the
 * first block, and scanning 2MB for a byte we will not find costs the read
 * twice. A text file whose only NUL is past this boundary reads as text —
 * a deliberate false negative, and the safe direction: rendering a mostly-text
 * file with one replacement character is better than refusing it.
 */
export const BINARY_SCAN_BYTES = 8 * 1024
