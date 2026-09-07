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
 * M141 (backlog #27). The four BUILT-IN holes: filled from the target panel
 * before any question is asked, never asked. `{{cwd}}` is the target's LIVE
 * directory (the read PRESET_CAPTURE makes, M12 — a spawn cwd is confidently
 * wrong for the panel a person `cd`'d somewhere on purpose); `{{branch}}` is
 * main's `git:status` answer for that cwd; `{{selection}}` is the terminal's
 * own selection; `{{panel}}` is the panel's title. Only a SAVED prompt is
 * expanded: a project prompt is a file this app does not own, and expanding
 * a name the CLI's format does not define would make the same file behave
 * differently in the app than in a plain terminal.
 */
export const BUILT_IN_HOLES: readonly string[] = ['cwd', 'branch', 'selection', 'panel']

/** The built-ins filled from `values`; one with no value (absent, or '') stays AS TYPED — M75's rule, kept. */
export function fillBuiltIns(body: string, values: Partial<Record<'cwd' | 'branch' | 'selection' | 'panel', string>>): string {
  return body.replace(HOLE, (whole, name: string) => {
    if (!BUILT_IN_HOLES.includes(name)) return whole
    const value = (values as Record<string, string | undefined>)[name]
    return typeof value === 'string' && value !== '' ? value : whole
  })
}

/** The holes a person is ASKED for: every placeholder that is not a built-in. */
export function askableHoles(body: string): string[] {
  return placeholders(body).filter((name) => !BUILT_IN_HOLES.includes(name))
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
