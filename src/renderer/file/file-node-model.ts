import { FILE_MAX_LINES, type FileResult, type FileSource } from '@shared/file-panel'

/**
 * The file node's view model — pure, plain data, no DOM and no React.
 *
 * A second pure model beside review-node-model.ts, and it makes the same
 * divergence from the inspector pane that one does, for the same reason: a
 * pane is a strip in a 260px column that may hide itself when it has nothing
 * to say, while a NODE is a panel the user deliberately opened, placed and
 * dragged. A node that renders nothing at all is indistinguishable from a
 * broken one, and the user has no way to ask why. So every arm here renders a
 * heading and a sentence. verify:rail 74.
 */

export interface FileLine {
  /** 1-based, and the number of the line in the FILE. */
  n: number
  text: string
}

export interface FileNodeModel {
  /** The honest chain's first link, then the basename. */
  heading: string
  /** The containing directory, as its own field rather than spliced in. */
  directory: string
  /** A short factual line: size, line count. Always present. */
  summary: string
  /** Present only for the non-text arms — the sentence that says what happened. */
  note?: string
  lines: FileLine[]
  /**
   * M27. Paint the body as PROSE — wrapped, no line-number gutter — rather
   * than as numbered code, and open it in edit mode on first mount.
   *
   * A field on the model rather than a prop on the component, so the decision
   * is checkable in the cheapest tier the repo has and the component branches
   * on what it was HANDED rather than on what it was told — the same trade
   * `editable` one field down already makes.
   *
   * It is deliberately NOT a second discriminated `body` union. `lines` is
   * still built for a note and still carries the file's real numbering; what
   * `prose` changes is how those lines are PAINTED, not what was read. A
   * union here would force every existing consumer and every existing check
   * to branch for a difference that is one gutter wide.
   */
  prose: boolean
  /** Present only when the render cap dropped something. */
  truncatedNote?: string
  /**
   * Whether this file may be edited in the panel.
   *
   * A property of the RESULT, not of the panel: only `text` with nothing
   * dropped by the render cap qualifies. A truncated buffer saved back would
   * delete every line past FILE_MAX_LINES, which is prompts.ts's "half a file
   * is a different file" rule in its most destructive available form — the
   * panel shows 10,000 lines of a 40,000-line file, the user fixes a typo on
   * line 3, and 30,000 lines are gone with a successful-looking result.
   */
  editable: boolean
  /**
   * Why not, when not. Present for every uneditable arm and absent when
   * `editable` is true — the pencil is rendered PRESENT AND DISABLED with
   * this as its reason rather than hidden, which is verify:palette 31's
   * standing rule: a control that disappears is indistinguishable from a
   * feature that was never built, and this is exactly the case where a user
   * will go looking for it.
   */
  editableNote?: string
}

const KB = 1024
function humanBytes(bytes: number): string {
  if (bytes < KB) return `${bytes} B`
  if (bytes < KB * KB) return `${Math.round(bytes / KB)} KB`
  return `${(bytes / (KB * KB)).toFixed(1)} MB`
}

/**
 * Split without importing node:path. `basename`/`dirname` live in node:path,
 * which is a main-side module: importing it here would drag a Node builtin
 * into the renderer bundle for two string operations. Paths here are always
 * absolute and POSIX (this is a macOS app), so the split is exact.
 */
function splitPath(path: string): { dir: string; base: string } {
  const cut = path.lastIndexOf('/')
  if (cut < 0) return { dir: '', base: path }
  return { dir: cut === 0 ? '/' : path.slice(0, cut), base: path.slice(cut + 1) }
}

export function buildFileNodeModel(input: {
  source: FileSource
  title: string | undefined
  result: FileResult | undefined
}): FileNodeModel {
  const { dir, base } = splitPath(input.source.path)
  // The honest chain's first link, the one the user chose — the same rule the
  // panel header, railLabel and the inspector heading all obey.
  const heading = input.title ?? base
  // Uneditable is the default so no arm can forget to say why; the `text`
  // arm below is the one place that overrides it.
  // `prose` rides the shell, so every arm inherits it — a note that is
  // MISSING or BINARY is still a note, and an arm that dropped the flag would
  // paint that arm's own note text in a code view for no reason.
  const prose = input.source.prose === true
  const shell = { heading, directory: dir, lines: [] as FileLine[], editable: false, prose }

  // Undefined is the in-flight state: the read is an IPC round trip, so this
  // is every panel for its first moment. It renders a sentence rather than
  // nothing, for the reason review-node-model.ts renders one — a node that
  // shows nothing while it waits reads as a broken panel.
  if (input.result === undefined) {
    return { ...shell, summary: 'reading…', editableNote: 'This file is still being read.' }
  }

  const r = input.result
  switch (r.kind) {
    case 'text': {
      const lines = r.content === ''
        ? []
        : r.content.split('\n').map((text, i) => ({ n: i + 1, text }))
      return {
        ...shell,
        summary: `${humanBytes(r.bytes)} · ${r.lines} ${r.lines === 1 ? 'line' : 'lines'}`,
        lines,
        // The remainder comes from the RESULT's own number, never recomputed
        // from `lines` — the content in hand is already truncated, so a
        // recomputation would always say zero. Truncation and editability
        // are the SAME fact read two ways: a truncated buffer saved back
        // would delete everything past FILE_MAX_LINES, so it stays
        // read-only and says why rather than merely reporting the count.
        ...(r.truncatedLines > 0
          ? {
              truncatedNote: `${r.truncatedLines} more lines not shown`,
              editableNote: `This file is longer than the ${FILE_MAX_LINES.toLocaleString()} line viewing limit, so editing it here would drop the rest.`
            }
          : { editable: true })
      }
    }
    // Four arms, four DIFFERENT sentences. 'this file is gone' and 'this file
    // is binary' are two situations with two different fixes, and collapsing
    // any two of them tells a user the wrong one. Each also gets its own
    // editableNote for the identical reason — a single shared "cannot edit"
    // sentence would tell a user reading "binary" that reopening the file
    // will help.
    case 'missing':
      return {
        ...shell,
        summary: 'not found',
        note: 'This file no longer exists. It will reappear here if it is recreated.',
        editableNote: 'There is no file here to edit.'
      }
    case 'too-large':
      return {
        ...shell,
        summary: humanBytes(r.bytes),
        note: `This file is larger than the ${humanBytes(r.cap)} viewing limit.`,
        editableNote: 'This file is too large to open here, so it cannot be edited here either.'
      }
    case 'binary':
      return {
        ...shell,
        summary: humanBytes(r.bytes),
        note: 'This looks like a binary file, so there is nothing to show as text.',
        editableNote: 'A binary file cannot be edited as text.'
      }
    case 'unreadable':
      return {
        ...shell,
        summary: 'unreadable',
        note: `This file could not be read: ${r.detail}`,
        editableNote: 'This file could not be read, so it cannot be edited.'
      }
    // M245. Only a read that ASKED for bytes gets this arm (a sheet), so a file
    // panel reaching it means a sheet view was dropped from a malformed layout.
    // Said plainly rather than rendered as text it never was.
    case 'bytes':
      return {
        ...shell,
        summary: humanBytes(r.bytes),
        note: 'This file was read as a spreadsheet. Reopen it to see its cells.',
        editableNote: 'Edit this file as a sheet.'
      }
  }
}
