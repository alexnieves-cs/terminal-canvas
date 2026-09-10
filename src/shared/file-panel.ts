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
  /** M244. Structured Markdown note view; absent accepted content requires human review. */
  checklist?: import('./checklist').ChecklistView
  /**
   * M27. Render this file as PROSE — wrapped, no line-number gutter — and open
   * it in edit mode on first mount. A note IS a file: same path, same read,
   * same watch, same compare-and-swap write. This flag is the whole of what
   * makes one a note, which is why it is a display fact on the SOURCE rather
   * than a sixth `kind`: a note is not a different sort of thing, it is a
   * different way of looking at the same thing.
   *
   * `true` or ABSENT, never `false`. The absent-stays-absent rule `command`,
   * `title` and `agent` already obey — a spread that wrote `prose: undefined`
   * puts the key in layout.json, where `'prose' in source` reads TRUE for a
   * file panel that was never a note.
   */
  prose?: true
  /**
   * M251. Read this Markdown file as SLIDES (shared/deck.ts) — `---` between
   * slides, `Note:` for speaker notes — and offer the .pptx export. The same
   * display-fact-on-the-source reason as `prose`, and the same `true` or
   * ABSENT rule: a deck is a file looked at another way, not another thing.
   */
  deck?: true
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

/**
 * What a save did, and why it did not.
 *
 * Three arms, split POSITIONALLY rather than by parsing an error message —
 * review-commit.ts's `refused`/`failed` distinction applied to a second verb.
 * `stale` means the disk moved underneath you and the fix is to look at what
 * changed; `failed` means this write did not run and the fix is your
 * filesystem. Collapsing them tells a user with a read-only file to go and
 * look at somebody else's changes.
 *
 * Declared here rather than in main/file-write.ts, the same split FileResult
 * already draws from file-read.ts: the renderer's bridge signature needs this
 * type too, and shared is the one tsconfig project both main and the web
 * bundle (renderer/preload) include — main/file-write.ts is outside
 * tsconfig.web.json entirely, so a shared consumer importing it straight from
 * main fails cross-project typechecking with TS6307.
 */
export type FileWriteResult =
  | { kind: 'written'; mtimeMs: number; bytes: number }
  | { kind: 'stale'; detail: string }
  | { kind: 'failed'; detail: string }

/**
 * What creating a note did, and why it did not.
 *
 * FOUR arms rather than three, and `exists` is the one that earns its own:
 * "there is already a file called that" is a different situation with a
 * different fix from "this write failed" — the user renames, rather than
 * looking at their filesystem — and collapsing it into `failed` would send
 * them to the wrong place. `refused` is the pre-flight rejection (an empty
 * name, or one that resolves outside the root); `failed` is the filesystem
 * saying no.
 *
 * Declared here rather than in main/file-create.ts, the same split FileResult
 * and FileWriteResult already draw: the renderer's bridge signature needs this
 * type, and shared is the one tsconfig project both main and the web bundle
 * include.
 */
export type FileCreateResult =
  | { kind: 'created'; path: string; mtimeMs: number }
  | { kind: 'exists'; path: string }
  | { kind: 'refused'; detail: string }
  | { kind: 'failed'; detail: string }
