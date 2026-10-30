import type { DiffLine } from './review'
import { isRecord } from './guards'

/**
 * M570 (lane O). THE SIGNAL A HARNESS LEARNS FROM — a lesson is one moment a
 * person said "this was wrong", kept as a record: where (repository, path),
 * what (the work that was wrong, and the person's words when they gave any),
 * and which task.
 *
 * Two moments count, and only two, because each is a person's deliberate act
 * on an agent's work and neither can be produced by an agent alone:
 *
 * - **A discard.** The person threw away a file's changes from a review. The
 *   lesson keeps the lines that were thrown away (the agent's ADDED lines; a
 *   discard of pure deletions keeps those, marked `-`). The person said
 *   nothing about why, so `what` is absent — never invented.
 * - **A review comment SENT to the agent.** A comment still being drafted is
 *   not a verdict; once it is sent, the person has told the agent to change
 *   something. An agent's PROPOSED comment (M360's `proposedBy`) is never a
 *   lesson, kept or not: the person's word is the signal, not a second
 *   agent's.
 *
 * THE SIGNATURE is what M573's proof reads to decide whether a mistake
 * RECURRED: the distinctive identifiers and words of the wrong work, so a
 * replay that writes the same thing again is caught even when the line moved.
 * It is computed from the excerpt (and the quote), never from the person's
 * comment: "don't do this" contains no token the replay would repeat.
 *
 * Pure: no DOM, no node. `verify:learn learn.lesson.*`.
 */

export type LessonSource = 'discard' | 'comment'

export interface Lesson {
  /** Stable per moment, so recording the same discard or comment twice keeps one. */
  id: string
  source: LessonSource
  /** The MAIN repository (a lane's worktree resolves to the tree it was cut from). */
  root: string
  /** Repository-relative. */
  path: string
  /** The person's words. Absent for a discard: they said nothing, and nothing is made up. */
  what?: string
  /** The wrong work: discarded lines, or the line a comment was written against. */
  excerpt: string
  /** The recurrence fingerprint (`lessonSignature`). */
  signature: string[]
  taskId?: string
  taskTitle?: string
  /** The task's brief when the lesson was taken — what M573 replays. */
  brief?: string
  /** The task's check commands when the lesson was taken — what decides the replay passed. */
  checks?: string[]
  panelId?: string
  /** The commit the wrong work was made on top of — where a replay starts. */
  baseline?: string
  at: number
  /** How many secrets the scrubber replaced when the lesson was written. */
  redacted?: number
}

export const LESSONS_MAX = 300
export const LESSON_EXCERPT_LINES = 40
export const LESSON_EXCERPT_MAX = 2000
export const LESSON_TEXT_MAX = 2000
export const LESSON_TITLE_MAX = 200
export const LESSON_CHECKS_MAX = 10
/**
 * The bound on what is read before it is scrubbed. Larger than the kept
 * excerpt ON PURPOSE: the scrubber must see a secret whole (a PEM key is
 * ~3 KB and its rule needs the END line), so the store scrubs this, THEN
 * cuts to LESSON_EXCERPT_LINES / LESSON_EXCERPT_MAX (M570's critic).
 */
export const LESSON_RAW_MAX = 64 * 1024
export const LESSON_SIGNATURE_MAX = 32

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * Words that say nothing about WHICH mistake: language keywords and glue.
 * Without them every TypeScript excerpt shares `const`, `return` and
 * `import`, and every replay would "repeat" every lesson.
 */
const STOP = new Set([
  'const', 'let', 'var', 'function', 'return', 'import', 'export', 'from', 'default', 'async', 'await',
  'this', 'that', 'with', 'then', 'else', 'true', 'false', 'null', 'undefined', 'void', 'type', 'interface',
  'class', 'extends', 'implements', 'new', 'typeof', 'instanceof', 'string', 'number', 'boolean', 'unknown',
  'readonly', 'public', 'private', 'protected', 'static', 'case', 'break', 'continue', 'switch', 'while',
  'for', 'each', 'when', 'what', 'which', 'there', 'their', 'here', 'have', 'been', 'will', 'should',
  'could', 'would', 'into', 'onto', 'only', 'also', 'some', 'every', 'none', 'more', 'less', 'than',
  'self', 'elif', 'pass', 'def', 'require', 'module', 'exports', 'props', 'value', 'data',
  // The scrubber's own placeholder word: two lessons that each had a secret
  // removed share it, and that says nothing about the mistake.
  'redacted'
])

/**
 * The distinctive tokens of a piece of work, in order of first appearance:
 * identifiers and words of four or more characters, lowercased, keywords
 * dropped, each once, at most LESSON_SIGNATURE_MAX. camelCase is kept whole
 * (`readFileSync` is one fact, and splitting it would match `read` anywhere).
 */
export function lessonSignature(text: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const m of text.matchAll(/[A-Za-z_$][A-Za-z0-9_$]{3,}/g)) {
    const t = m[0].toLowerCase()
    if (STOP.has(t) || seen.has(t)) continue
    seen.add(t)
    out.push(t)
    if (out.length >= LESSON_SIGNATURE_MAX) break
  }
  return out
}

/**
 * How much of a lesson's signature reappears in another piece of work, 0–1:
 * |lesson ∩ other| / |lesson|. Containment, not Jaccard — a replay's diff is
 * usually far larger than the lesson, and the question is "is the mistake
 * in there", not "are these the same size". An empty signature overlaps
 * nothing (0): a lesson with no fingerprint can never be called repeated.
 */
export function signatureOverlap(lesson: readonly string[], other: readonly string[]): number {
  if (lesson.length === 0) return 0
  const set = new Set(other)
  let hit = 0
  for (const t of lesson) if (set.has(t)) hit += 1
  return hit / lesson.length
}

/**
 * Cut to the kept budget, saying so — never a silent truncation. Run on
 * SCRUBBED text only (the store does): cutting first can split a secret
 * below its rule's minimum and keep the pieces.
 */
export function clipExcerpt(text: string): string {
  const lines = text.split('\n')
  const kept = lines.slice(0, LESSON_EXCERPT_LINES)
  let out = kept.join('\n')
  const more = lines.length - kept.length
  if (out.length > LESSON_EXCERPT_MAX) out = `${out.slice(0, LESSON_EXCERPT_MAX)}…`
  return more > 0 ? `${out}\n… ${more} more line${more === 1 ? '' : 's'}` : out
}

/** Whole lines up to LESSON_RAW_MAX: the unscrubbed bound, never the kept one. */
function rawJoin(lines: readonly string[]): string {
  let out = ''
  for (const l of lines) {
    if (out.length + l.length + 1 > LESSON_RAW_MAX) break
    out = out === '' ? l : `${out}\n${l}`
  }
  return out
}

/**
 * The work a discard threw away, from the file's diff against the baseline.
 * Added lines are what the agent wrote and the person refused; a file whose
 * change was only deletions keeps those instead, each marked `-`, so a
 * lesson about "you deleted the guard" still has the guard in it. Null (the
 * diff could not be read, or was binary) is an empty excerpt, not a guess.
 */
export function discardExcerpt(lines: readonly DiffLine[] | null): string {
  if (lines === null) return ''
  const added = lines.filter((l) => l.kind === 'add').map((l) => l.text.replace(/^\+/, ''))
  if (added.length > 0) return rawJoin(added)
  const removed = lines.filter((l) => l.kind === 'del').map((l) => `-${l.text.replace(/^-/, '')}`)
  return rawJoin(removed)
}

export interface DiscardFacts {
  root: string
  baseline: string
  panelId?: string
  at: number
  /** One per discarded path, with its diff as read BEFORE the discard (null when unreadable). */
  files: readonly { path: string; lines: readonly DiffLine[] | null }[]
}

/** One lesson per discarded file. The id is the moment (baseline, path, time), so a retried record is one lesson. */
export function lessonsFromDiscard(f: DiscardFacts): Lesson[] {
  return f.files.map((file) => {
    const excerpt = discardExcerpt(file.lines)
    return {
      id: `discard:${f.baseline.slice(0, 12)}:${file.path}:${f.at}`,
      source: 'discard' as const,
      root: f.root,
      path: file.path,
      excerpt,
      signature: lessonSignature(excerpt),
      ...(f.panelId === undefined ? {} : { panelId: f.panelId }),
      baseline: f.baseline,
      at: f.at
    }
  })
}

/** What the renderer knows about a sent comment: the comment, its task, and where the task's lane runs. */
export interface CommentFacts {
  /** Any folder inside the repository — main resolves it to the main tree. */
  root: string
  taskId: string
  taskTitle?: string
  brief?: string
  checks?: readonly string[]
  panelId?: string
  comment: { id: string; path: string; line: number; quote: string; body: string; sentAt?: number; at: number; proposedBy?: unknown }
}

/**
 * A comment becomes a lesson only once SENT and only when it is the
 * person's own. Anything else answers null — the caller skips it.
 */
export function lessonFromComment(f: CommentFacts): Lesson | null {
  const c = f.comment
  if (c.proposedBy !== undefined || c.sentAt === undefined) return null
  if (!isStr(c.body.trim()) || !isStr(c.path)) return null
  const checks = (f.checks ?? []).filter((x) => typeof x === 'string' && x.trim() !== '').slice(0, LESSON_CHECKS_MAX).map((x) => x.slice(0, LESSON_TEXT_MAX))
  return {
    id: `comment:${f.taskId}:${c.id}`,
    source: 'comment',
    root: f.root,
    path: c.path,
    what: c.body.trim().slice(0, LESSON_RAW_MAX),
    excerpt: c.quote.slice(0, LESSON_RAW_MAX),
    signature: lessonSignature(c.quote),
    taskId: f.taskId,
    ...(typeof f.taskTitle !== 'string' || f.taskTitle === '' ? {} : { taskTitle: f.taskTitle.slice(0, LESSON_RAW_MAX) }),
    ...(typeof f.brief !== 'string' || f.brief.trim() === '' ? {} : { brief: f.brief.slice(0, LESSON_RAW_MAX) }),
    ...(checks.length === 0 ? {} : { checks }),
    ...(f.panelId === undefined ? {} : { panelId: f.panelId }),
    at: c.sentAt
  }
}

/**
 * Field-level parse (the work-item rule): a malformed OPTIONAL costs that
 * field; a malformed REQUIRED one costs the lesson. The signature is
 * recomputed when absent or malformed, never trusted to be missing.
 */
export function parseLesson(raw: unknown): Lesson | null {
  if (!isRecord(raw)) return null
  const { id, source, root, path, excerpt, at } = raw
  if (!isStr(id) || (source !== 'discard' && source !== 'comment') || !isStr(root) || !isStr(path) || typeof excerpt !== 'string' || !isNum(at)) return null
  const sig = Array.isArray(raw.signature) && raw.signature.every((t) => typeof t === 'string')
    ? (raw.signature as string[]).slice(0, LESSON_SIGNATURE_MAX)
    : lessonSignature(excerpt)
  const checks = Array.isArray(raw.checks) ? raw.checks.filter(isStr) : []
  return {
    id, source, root, path, excerpt, at, signature: sig,
    ...(isStr(raw.what) ? { what: raw.what } : {}),
    ...(isStr(raw.taskId) ? { taskId: raw.taskId } : {}),
    ...(isStr(raw.taskTitle) ? { taskTitle: raw.taskTitle } : {}),
    ...(isStr(raw.brief) ? { brief: raw.brief } : {}),
    ...(checks.length === 0 ? {} : { checks }),
    ...(isStr(raw.panelId) ? { panelId: raw.panelId } : {}),
    ...(isStr(raw.baseline) ? { baseline: raw.baseline } : {}),
    ...(isNum(raw.redacted) && raw.redacted > 0 ? { redacted: raw.redacted } : {})
  }
}

/**
 * Newest first, one per id (the LAST record of an id wins: a re-record
 * carries what the renderer knew later, like a brief typed afterwards), at
 * most LESSONS_MAX.
 */
export function newestLessons(records: readonly Lesson[], max = LESSONS_MAX): Lesson[] {
  const byId = new Map<string, Lesson>()
  for (const l of records) { byId.delete(l.id); byId.set(l.id, l) }
  return [...byId.values()].sort((a, b) => b.at - a.at).slice(0, Math.max(0, max))
}

/** "src/a.ts — discarded" / "src/a.ts — commented": the row's place, in words. */
export function lessonPlace(l: Lesson): string {
  return `${l.path} — ${l.source === 'discard' ? 'discarded' : 'commented'}`
}
