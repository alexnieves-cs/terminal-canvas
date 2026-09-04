import type { FsEntry } from '@shared/fs-tree'

/**
 * M75. THE COMPOSER'S PURE MODEL — plain-node checked in `verify:rail`.
 *
 * What opens a completion and where, how an accepted row lands in the text,
 * what a saved prompt's holes are and how they fill, and which drops are
 * images. The component (`ChatNode.tsx`) renders the popup and moves focus.
 */

export type ComposerTrigger = { kind: 'file' | 'prompt'; query: string; start: number }

/**
 * A `@` or `/` at the START of the text or after whitespace, with the caret
 * inside the token, is a trigger. Anywhere else it is text: `a/b` is a path,
 * `me@x` is an address, and a caret before the trigger is not "inside" it.
 * Without this rule every path typed by hand opens a list.
 */
export function triggerAt(text: string, caret: number): ComposerTrigger | null {
  if (caret < 0 || caret > text.length) return null
  // Walk back from the caret to the token's start: the first whitespace.
  let start = caret
  while (start > 0 && !/\s/.test(text[start - 1] as string)) start -= 1
  const token = text.slice(start, caret)
  const lead = token[0]
  if (lead !== '@' && lead !== '/') return null
  return { kind: lead === '@' ? 'file' : 'prompt', query: token.slice(1), start }
}

export function applyCompletion(
  text: string,
  start: number,
  caret: number,
  replacement: string
): { text: string; caret: number } {
  const next = text.slice(0, start) + replacement + text.slice(caret)
  return { text: next, caret: start + replacement.length }
}

const HOLE = /\{\{([A-Za-z0-9_-]+)\}\}/g

/** The unique hole names in first-seen order. A name with a space is literal text. */
export function placeholders(body: string): string[] {
  const out: string[] = []
  for (const m of body.matchAll(HOLE)) {
    const name = m[1] as string
    if (!out.includes(name)) out.push(name)
  }
  return out
}

/**
 * A hole with no value stays as typed — never blanked into a prompt that
 * silently says less. An EMPTY string is no value: a field typed into and
 * cleared is the same as one never touched (M75's verifier).
 */
export function fillPlaceholders(body: string, values: Record<string, string>): string {
  return body.replace(HOLE, (whole, name: string) => {
    const value = values[name]
    return typeof value === 'string' && value !== '' ? value : whole
  })
}

const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp'
}

export function imageMediaType(path: string): string | null {
  const dot = path.lastIndexOf('.')
  if (dot < 0) return null
  return IMAGE_TYPES[path.slice(dot + 1).toLowerCase()] ?? null
}

export function attachmentKind(path: string): 'image' | 'file' {
  return imageMediaType(path) === null ? 'file' : 'image'
}

export interface FileCompletionRow {
  label: string
  /** What gets inserted: the name, with a trailing slash for a directory. */
  insert: string
  dir: boolean
}

/**
 * Directory entries filtered by prefix, directories first (they are what a
 * `@src/` walk descends into), capped with a remainder count — the rule the
 * file tree's own listing states: report the count, never end silently.
 */
export function fileCompletions(entries: readonly FsEntry[], query: string, cap = 12): { rows: FileCompletionRow[]; more: number } {
  const q = query.toLowerCase()
  const matching = entries.filter((e) => e.name.toLowerCase().startsWith(q))
  const byName = (a: FsEntry, b: FsEntry): number => a.name.localeCompare(b.name)
  const dirs = matching.filter((e) => e.kind === 'dir').sort(byName)
  const rest = matching.filter((e) => e.kind !== 'dir').sort(byName)
  const ordered = [...dirs, ...rest]
  const rows = ordered.slice(0, cap).map((e) => ({ label: e.kind === 'dir' ? `${e.name}/` : e.name, insert: e.kind === 'dir' ? `${e.name}/` : e.name, dir: e.kind === 'dir' }))
  return { rows, more: Math.max(0, ordered.length - cap) }
}
