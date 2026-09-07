/**
 * M85. THE VAULT'S LINK SYNTAX AND ITS INDEX — pure, plain-node checked in
 * `verify:file vault.1`.
 *
 * A vault is not a panel kind: a note is a file panel in prose mode (M27) and
 * a vault is many of them plus this index. What lives here is the only thing
 * a folder of markdown needs that a directory listing cannot give — which
 * note a name means, and which notes point at a note.
 *
 * Shared because the renderer builds the index from main's read and the
 * node's own body paints the links from the same parse; two parsers for one
 * syntax drift in the arm nobody tests, which is `composer-model.ts`'s
 * `{{hole}}` rule reaching a second syntax.
 */

export interface WikiLink {
  /** The note this points at, as written. */
  name: string
  /** What to paint. The name unless an alias was given. */
  text: string
  /** Where it starts and ends in the body, so the painter needs no second parse. */
  start: number
  end: number
}

/**
 * `[[name]]` and `[[name|text]]`. Deliberately strict: an unclosed `[[`, an
 * empty one and a markdown reference link (`[ref]`) are TEXT. The loose
 * reading turns an ordinary reference link into a note nobody wrote, and the
 * user finds out when a backlink appears from a note that never mentioned
 * theirs.
 */
const LINK = /\[\[([^\][|\n]+?)(?:\|([^\][\n]*?))?\]\]/g

/**
 * The spans of `body` that are CODE — fenced blocks and inline backticks — so
 * a `[[name]]` quoted in a code sample is text. Computed once per parse.
 */
function codeSpans(body: string): Array<[number, number]> {
  const spans: Array<[number, number]> = []
  for (const m of body.matchAll(/```[\s\S]*?(?:```|$)/g)) spans.push([m.index ?? 0, (m.index ?? 0) + m[0].length])
  for (const m of body.matchAll(/`[^`\n]+`/g)) {
    const start = m.index ?? 0
    if (!spans.some(([a, b]) => start >= a && start < b)) spans.push([start, start + m[0].length])
  }
  return spans
}

export function parseWikiLinks(body: string): WikiLink[] {
  const out: WikiLink[] = []
  const code = codeSpans(body)
  for (const m of body.matchAll(LINK)) {
    const at = m.index ?? 0
    if (code.some(([a, b]) => at >= a && at < b)) continue
    const name = (m[1] ?? '').trim()
    if (name === '') continue
    const alias = m[2]?.trim()
    out.push({
      name,
      text: alias === undefined || alias === '' ? name : alias,
      start: m.index ?? 0,
      end: (m.index ?? 0) + m[0].length
    })
  }
  return out
}

/** M150. A `#tag` in a note's body, with its span so the painter needs no second parse. */
export interface Tag {
  /** As written, without the `#`: `Review/Api`. Matching is case-insensitive; painting keeps the case. */
  name: string
  start: number
  end: number
}

/**
 * `#name` at a TOKEN START — start of text, whitespace or `(` before it —
 * where the name is letters, digits, `_`, `-` or `/` (Obsidian's nested
 * `#area/sub`). Not a heading (`# Title`: a `#` followed by a space is
 * markdown's mark), not a bare number (`#1` is an issue reference), and not
 * inside a code span or a fence — the SAME exclusion `parseWikiLinks` uses,
 * one for both syntaxes. Trailing punctuation is not part of the tag
 * (`#done.` is `done`). Front matter is not read: a second syntax and a
 * second parser (backlog #85).
 */
// A `(` lead that follows `]` is a markdown link's target (`[see](#section)`),
// not a tag (the M150 critic); a name is segments of word characters joined
// by single `/`, never a trailing `/` or an empty segment.
const TAG = /(^|\s|(?<!\])\()#([\p{L}\p{N}_][\p{L}\p{N}_-]*(?:\/[\p{L}\p{N}_][\p{L}\p{N}_-]*)*)(?!\/)/gu

export function parseTags(body: string): Tag[] {
  const out: Tag[] = []
  const code = codeSpans(body)
  // A `#x` inside a `[[link|alias #x]]` is the alias's text, which the note
  // paints as the link — the index and the painter must agree on it.
  const links = parseWikiLinks(body).map((l) => [l.start, l.end] as [number, number])
  for (const m of body.matchAll(TAG)) {
    const lead = m[1] ?? ''
    const name = m[2] ?? ''
    const start = (m.index ?? 0) + lead.length
    if (code.some(([a, b]) => start >= a && start < b)) continue
    if (links.some(([a, b]) => start >= a && start < b)) continue
    if (/^\d+$/.test(name) || /^_+$/.test(name)) continue
    out.push({ name, start, end: start + 1 + name.length })
  }
  return out
}

export interface TagEntry {
  path: string
  title: string
  /** The first line the note names the tag on — the note's own numbering. */
  line: number
}

export interface VaultNoteInput {
  /** Relative to the vault root, with its extension: `meetings/2026-09-04.md`. */
  path: string
  body: string
  /** What the pane calls the note; absent in a bare fixture, and the path then stands in. */
  title?: string
}

export interface Backlink {
  /** The note that points here. */
  path: string
  /** Its title — the ONE name the pane, the row and the link share (M85's critic: one note had three names). */
  title: string
  /** The 1-based line it was named on — the note's own numbering. */
  line: number
  /** What that link painted, so a row can quote it. */
  text: string
}

export interface VaultIndex {
  /** A lower-cased name (basename or relative path, both without `.md`) → the note's path. */
  byName: Record<string, string>
  /** A note's path → the notes pointing at it. */
  backlinks: Record<string, Backlink[]>
  /** M150. A lower-cased tag → the notes carrying it, once each, in the files' order. */
  tags: Record<string, TagEntry[]>
}

/** `meetings/2026-09-04.md` → `meetings/2026-09-04` and `2026-09-04`. */
function namesOf(path: string): string[] {
  const withoutExt = path.replace(/\.md$/i, '')
  const base = withoutExt.slice(withoutExt.lastIndexOf('/') + 1)
  return base === withoutExt ? [withoutExt.toLowerCase()] : [withoutExt.toLowerCase(), base.toLowerCase()]
}

/**
 * The index. Two spellings of one note (its basename and its path from the
 * root) resolve to the same file, because both are what a person types; the
 * PATH wins a collision, since it is the unambiguous one.
 *
 * A note never lists itself in its own backlinks: a note that says
 * `[[itself]]` is a person writing about the thing they are writing, and a
 * self-row would be the only backlink that tells the reader nothing.
 */
export function buildVaultIndex(files: readonly VaultNoteInput[]): VaultIndex {
  const byName: Record<string, string> = {}
  for (const file of files) {
    const [full, base] = namesOf(file.path)
    if (full !== undefined) byName[full] = file.path
    if (base !== undefined && byName[base] === undefined) byName[base] = file.path
  }
  const backlinks: Record<string, Backlink[]> = {}
  const tags: Record<string, TagEntry[]> = {}
  for (const file of files) backlinks[file.path] = []
  for (const file of files) {
    // M150. The tags, from the same pass: once per note (the FIRST line it
    // names the tag on), case-folded for the key, the note's title beside it.
    const seen = new Set<string>()
    for (const tag of parseTags(file.body)) {
      const key = tag.name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      const line = file.body.slice(0, tag.start).split('\n').length
      ;(tags[key] ??= []).push({ path: file.path, title: file.title ?? file.path.replace(/\.md$/i, ''), line })
    }
    // The line is counted from the link's OFFSET rather than by splitting and
    // re-searching: a note that names the same target twice on two lines must
    // produce two rows with two different numbers.
    for (const link of parseWikiLinks(file.body)) {
      const target = byName[link.name.toLowerCase()]
      if (target === undefined || target === file.path) continue
      const line = file.body.slice(0, link.start).split('\n').length
      backlinks[target]?.push({ path: file.path, title: file.title ?? file.path.replace(/\.md$/i, ''), line, text: link.text })
    }
  }
  return { byName, backlinks, tags }
}

/**
 * The note a name means, or null. NULL IS A REAL ANSWER, not an error: an
 * unresolved link still renders as a link, and opening it offers to create
 * the note — a `[[name]]` that quietly read as text would be a note somebody
 * meant to write and nothing would ever say so.
 */
export function resolveWikiName(name: string, index: VaultIndex): string | null {
  return index.byName[name.trim().toLowerCase()] ?? null
}
