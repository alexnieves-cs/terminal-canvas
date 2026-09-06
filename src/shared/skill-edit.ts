/**
 * M128. Editing a SKILL.md without destroying what we could not read.
 *
 * `parseFrontmatter` (main/toolbox-scan.ts) is DELIBERATELY a small grammar —
 * a `key: value` line, optionally quoted, and `null` for block scalars,
 * anchors and multi-line folds — because a real YAML parser would be a second
 * runtime dependency and a parser DIFFERENTIAL against the CLI. Its own
 * comment says so, and M128 does not reopen that decision.
 *
 * That refusal has a consequence the READ half never faced. If Save
 * re-serialised the block from what the grammar parsed, every field the
 * grammar could not read would be DELETED — silently, in the user's own file,
 * while the panel reported a successful save. The file would still load; it
 * would just quietly mean something else. That is this milestone's first of
 * two ways to destroy a file while reporting success (the other is the stale
 * write, below).
 *
 * So this NEVER re-serialises. It rewrites only the specific `key: value`
 * LINES it understood, in place, and preserves every other byte inside the
 * fence — comments, blank lines, ordering, and every construct it cannot
 * read. `verify:toolbox edit.1` plants a block carrying all three and asserts
 * they survive byte for byte.
 */

/**
 * The same shape `parseFrontmatter` reads, and deliberately not shared with
 * it: that one lives in `main/` and `shared/` may never import from there.
 * A key is what a bare YAML scalar key can be; a line the pattern rejects is
 * a line this module refuses to touch.
 */
const KEY_LINE = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/

export interface SkillMetaEdit {
  name?: string
  description?: string
}

export type SkillEditResult =
  | { kind: 'ok'; text: string }
  | { kind: 'refused'; why: string }

/** Split at the fences. Returns null when there is no frontmatter block at all. */
function splitFence(text: string): { open: number; close: number; lines: string[] } | null {
  const lines = text.split('\n')
  if (lines[0]?.trim() !== '---') return null
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') return { open: 0, close: i, lines }
  }
  return null
}

/**
 * True when every non-blank line inside the fence is a `key: value` the small
 * grammar reads. False means the METADATA FIELDS render read-only with a
 * named reason while the body stays editable — the three-state rule applied
 * to editability, rather than a dead Save button that explains nothing.
 *
 * A file with NO frontmatter block answers true: there is nothing to preserve
 * and nothing to break, and answering false there would lock a plain-prose
 * SKILL.md out of an editor it is in no danger from.
 */
export function frontmatterGrammatical(text: string): boolean {
  const f = splitFence(text)
  if (f === null) return true
  for (let i = f.open + 1; i < f.close; i++) {
    const line = f.lines[i]
    if (line.trim() === '') continue
    if (!KEY_LINE.test(line)) return false
  }
  return true
}

export function applySkillEdit(
  text: string,
  edit: { meta?: SkillMetaEdit; body?: string }
): SkillEditResult {
  const f = splitFence(text)
  if (f === null) {
    if (edit.meta !== undefined && Object.keys(edit.meta).length > 0) {
      return { kind: 'refused', why: 'this file has no frontmatter block to edit' }
    }
    return { kind: 'ok', text: edit.body ?? text }
  }
  const lines = [...f.lines]
  if (edit.meta !== undefined) {
    for (const [key, value] of Object.entries(edit.meta)) {
      if (value === undefined) continue
      let found = false
      for (let i = f.open + 1; i < f.close; i++) {
        const m = KEY_LINE.exec(lines[i])
        // Only a line the grammar UNDERSTOOD is rewritten. Everything else —
        // including a line whose key happens to match inside a block scalar —
        // is left exactly as it was.
        if (m !== null && m[1] === key) {
          lines[i] = `${key}: ${value}`
          found = true
          break
        }
      }
      // A key the block does not have is APPENDED just above the closing
      // fence, never at the top: prepending would reorder a block the user or
      // an agent authored deliberately.
      if (!found) lines.splice(f.close, 0, `${key}: ${value}`)
    }
  }
  // Re-found rather than reused: a splice above moved the closing fence, and
  // slicing at the stale index would fold a metadata line into the body.
  const closeIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '---')
  const head = lines.slice(0, closeIdx + 1).join('\n')
  if (edit.body === undefined) {
    const oldBody = f.lines.slice(f.close + 1).join('\n')
    return { kind: 'ok', text: `${head}\n${oldBody}` }
  }
  return { kind: 'ok', text: `${head}\n\n${edit.body}` }
}

/**
 * The stamp the panel READ, carried on every write.
 *
 * An agent editing SKILL.md while the panel has it open is the ORDINARY case
 * in this application — it is exactly what the skill panel's `Help me write`
 * door starts. A blind save destroys the agent's edit with no symptom on
 * either side. M21's stat sweep already computes exactly this pair for its
 * `stale` freshness arm and `file:read` already answers both halves, so the
 * value exists and only the comparison is new.
 */
export interface ReadStamp {
  mtimeMs: number
  size: number
}

/**
 * Never last-write-wins, and never a merge: this app has no merge, and
 * inventing one here would be a second author of a file two things are
 * already editing. The sentence keeps the user's text on screen and names
 * the fix, because "save failed" alone reads as work lost.
 */
export function staleRefusal(): string {
  return 'this file changed on disk since you opened it — reload to see it; your edit is still here'
}

/**
 * What the four writers answer. It lives HERE rather than beside them in
 * `main/skill-write.ts` for `PluginDetailsResult`'s reason: the ipc contract
 * carries it across the bridge, and `shared/` may never import from `main/`.
 *
 * `refused` and `failed` are two arms and not one: a rule said no before
 * anything touched disk, versus the rules passed and the filesystem did not.
 * The fixes are different sentences, and collapsing them tells the user the
 * wrong one — the three-state rule, at a write.
 */
export type SkillWriteResult =
  | { kind: 'refused'; why: string }
  | { kind: 'failed'; why: string }
  | { kind: 'written'; stamp: ReadStamp }
  | { kind: 'created'; path: string }
  | { kind: 'renamed'; path: string }
  | { kind: 'deleted' }
