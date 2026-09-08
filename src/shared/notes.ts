/**
 * M187. THE NOTE KIND'S PURE RULES: one record, three FORMS. A sticky note, a
 * run of free text and a named region differ only in how they paint, so they
 * are one kind with a form rather than three kinds with three parsers, three
 * partitions, three rail rows and three export paths (M132's decision for the
 * workflow node kinds, reached again).
 *
 * Pure: no DOM, no node. Plain-node checked in `verify:viewport note.kind.1`
 * and `verify:layout note.1`.
 */

export type NoteForm = 'sticky' | 'text' | 'frame'
export type NoteTint = 'yellow' | 'blue' | 'green' | 'pink'

export const NOTE_FORMS: readonly NoteForm[] = ['sticky', 'text', 'frame']
export const NOTE_TINTS: readonly NoteTint[] = ['yellow', 'blue', 'green', 'pink']

/** The longest a note may be. A note is a note; a document is a file panel. */
export const NOTE_MAX_CHARS = 4000

export function isNoteForm(value: unknown): value is NoteForm {
  return typeof value === 'string' && (NOTE_FORMS as readonly string[]).includes(value)
}

export function isNoteTint(value: unknown): value is NoteTint {
  return typeof value === 'string' && (NOTE_TINTS as readonly string[]).includes(value)
}

/** What each form is FOR, in one sentence — the palette's subtitle and the empty state's line. */
export function noteFormSentence(form: NoteForm): string {
  if (form === 'sticky') return 'a tinted card for a thought you want to see beside the work'
  if (form === 'text') return 'editable type on the canvas, with no card around it'
  return 'a named region with a quiet boundary — its middle stays out of the way'
}

/**
 * The line a note shows when it is too small to read (semantic zoom) and in
 * the rail. The FIRST non-empty line, cut from the right, because a note's
 * first line is the one a person wrote as its name; an empty note says what it
 * is rather than showing an empty box (the empty-state rule).
 */
export function noteSummary(text: string, form: NoteForm, max = 40): string {
  const first = text.split('\n').map((l) => l.trim()).find((l) => l !== '')
  if (first === undefined) return form === 'frame' ? 'an unnamed region' : form === 'text' ? 'empty text' : 'an empty note'
  return first.length <= max ? first : `${first.slice(0, max - 1)}…`
}

/** A note's text as stored: capped, and never with the trailing newline an editor leaves. */
export function normaliseNoteText(text: string): string {
  return text.replace(/\s+$/, '').slice(0, NOTE_MAX_CHARS)
}
