/**
 * M250. What a note imported from outside carries, and the gate it is held
 * behind until a person has read it.
 *
 * The product rule is "what arrives from outside is inert until a person
 * looks": an imported canvas starts no process, an imported action node is
 * refused by name until read, an imported checklist cannot write until its
 * text is accepted. A .docx is the same kind of arrival — somebody else's
 * words, converted by a library, with whatever the conversion dropped — so the
 * note it becomes opens UNREVIEWED: it does not enter its editor, ✎ is
 * disabled by this sentence, and the canvas `read` verb refuses it by the same
 * sentence. The gate is the APP's doors, not the filesystem: an agent with a
 * shell in the same folder can still read the .md itself. `reviewed: true` is written by one thing only, a person pressing
 * "I've read it" on the note. Pure: shared by the renderer, main and the
 * layout parser (`verify:notes notes.gate.*`).
 */
export interface ImportedNote {
  /** The absolute path of the file it was converted from. */
  from: string
  /** The loss report as one sentence — '' when nothing was dropped. */
  dropped: string
  /** `true` or ABSENT, never `false` — `prose`'s rule, for `prose`'s reason. */
  reviewed?: true
}

export const IMPORTED_NOTE_REASON = 'Read this imported note before editing or sending it'

/**
 * Absent / malformed / view, the three arms every record parser in this repo
 * keeps. A `reviewed` that is present but not exactly `true` is MALFORMED and
 * the whole record is dropped rather than coerced: coercing `"yes"` to true
 * would be a parser deciding a person had read something.
 */
export function parseImportedNote(raw: unknown):
  | { kind: 'absent' }
  | { kind: 'malformed' }
  | { kind: 'view'; view: ImportedNote } {
  if (raw === undefined) return { kind: 'absent' }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { kind: 'malformed' }
  const r = raw as Record<string, unknown>
  if (typeof r.from !== 'string' || typeof r.dropped !== 'string') return { kind: 'malformed' }
  if ('reviewed' in r && r.reviewed !== true) return { kind: 'malformed' }
  // Built field by field, never spread: an unknown key from a newer build must
  // not ride along into this build's writes as if it were understood.
  return { kind: 'view', view: { from: r.from, dropped: r.dropped, ...(r.reviewed === true ? { reviewed: true as const } : {}) } }
}

/** The gate: a sentence while unreviewed, nothing otherwise (and nothing for an ordinary file). */
export function importedNoteReason(source: { imported?: ImportedNote }): string | undefined {
  return source.imported !== undefined && source.imported.reviewed !== true ? IMPORTED_NOTE_REASON : undefined
}

/**
 * What a .docx import could not carry, by name and count. Counted from the
 * OOXML itself (main/docx-import.ts's `analyzeDocx`), never inferred from the
 * converter's output — the converter's silence about a comment is exactly the
 * loss being reported.
 */
export interface DocxLossReport {
  comments: number
  /** w:ins, w:del, w:moveFrom, w:moveTo — the text is shown as if every change were accepted. */
  trackedChanges: number
  /** A top-level table holding a merged cell (gridSpan/vMerge) or a nested table. */
  complexTables: number
  textBoxes: number
  /** Footnotes and endnotes — converted, but moved to the end of the note as a list. */
  footnotes: number
  /** Header and footer parts that carry text. */
  headersFooters: number
  /** Pictures the asset store refused (too large, not an image it knows). */
  imagesNotKept: number
  /** The converter's own warnings, verbatim. */
  messages: string[]
}

/**
 * What `docx:import` answers. Declared HERE, not in main/docx-import.ts, for
 * FileCreateResult's reason: the renderer's bridge signature needs it and a
 * web-project file importing from main fails typechecking with TS6307.
 * `exists` is its own arm — "that name is taken" is answered by renaming, not
 * by looking at the filesystem — and `cancelled` is the chooser closed, which
 * is not a refusal and says nothing.
 */
export type DocxImportResult =
  | { kind: 'imported'; path: string; source: string; mtimeMs: number; report: DocxLossReport; dropped: string; images: number }
  | { kind: 'exists'; path: string }
  | { kind: 'refused'; reason: string }
  | { kind: 'cancelled' }

const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

/**
 * One sentence that names and counts. A zero is never stated (the rest rule —
 * "0 comments" is a zero-value statement), and a clean import answers '' so the
 * caller says "nothing was dropped" in its own words rather than rendering an
 * empty "Dropped:".
 */
export function lossSentence(r: DocxLossReport): string {
  const parts = [
    r.comments ? count(r.comments, 'comment', 'comments') : '',
    r.trackedChanges ? `${count(r.trackedChanges, 'tracked change', 'tracked changes')} (shown as accepted)` : '',
    r.complexTables ? count(r.complexTables, 'merged-cell table', 'merged-cell tables') : '',
    r.textBoxes ? count(r.textBoxes, 'text box', 'text boxes') : '',
    r.footnotes ? `${count(r.footnotes, 'footnote', 'footnotes')} (moved to the end)` : '',
    r.headersFooters ? count(r.headersFooters, 'header/footer', 'headers/footers') : '',
    r.imagesNotKept ? `${count(r.imagesNotKept, 'picture', 'pictures')} not kept` : '',
    r.messages?.length ? count(r.messages.length, 'converter warning', 'converter warnings') : ''
  ].filter((p) => p !== '')
  return parts.length ? `Dropped: ${parts.join(', ')}` : ''
}
