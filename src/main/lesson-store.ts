import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { redactSecrets } from '../shared/redact'
import { LESSONS_MAX, LESSON_TEXT_MAX, LESSON_TITLE_MAX, clipExcerpt, lessonSignature, newestLessons, parseLesson, type Lesson } from '../shared/lessons'
import { slugOf } from './memory-store'
import { keepNewestLines } from './atomic-file'

/**
 * M570 (lane O). The lessons a repository has taught, one append-only JSONL
 * per repository under `userData/lessons/<slug>.jsonl` — the project
 * memory's shape and its slug (`memory-store.ts` says why the slug carries a
 * hash), because a lesson is a fact added to a list, not a document
 * rewritten.
 *
 * EVERY text field passes `redactSecrets` on the way in. A lesson is read
 * back BY AN AGENT (M571's proposer pastes it into a prompt), and a
 * discarded hunk is exactly where a token an agent wrote into a config file
 * would sit. The signature is recomputed from the SCRUBBED excerpt, so the
 * fingerprint never holds a secret's characters either.
 *
 * A record of an id already kept is appended, not rewritten: the read keeps
 * the last one (`newestLessons`). Ring-trimmed to the newest raw lines on
 * write, through a temp file and a rename — the memory store's two rules
 * (keep raw lines so `skipped` stays honest; never truncate the live file).
 *
 * Plain node against an injected directory; `verify:learn learn.store.*`.
 */

export interface LessonRead {
  root: string
  /** Newest first, one per id. */
  lessons: Lesson[]
  /** Lines this read could not parse — reported, never fatal. */
  skipped: number
}

export interface LessonStore {
  add(lessons: readonly Lesson[]): { ok: true; added: number } | { ok: false; reason: string }
  list(root: string): LessonRead
  fileOf(root: string): string
}

/** Raw lines kept per file: room for re-records of the same id before the read dedupes. */
const RAW_LINES_MAX = LESSONS_MAX * 2

export function createLessonStore(deps: { dir: string }): LessonStore {
  const fileOf = (root: string): string => join(deps.dir, `${slugOf(root)}.jsonl`)

  // Scrub WHOLE, then cut (M570's critic): a secret cut in half falls below
  // its rule's minimum and its pieces would be kept. A private key whose END
  // line is past the raw bound is still a key: everything from its BEGIN on
  // is dropped and counted.
  const scrub = (l: Lesson): Lesson => {
    let count = 0
    const s = (text: string): string => {
      const r = redactSecrets(text)
      count += r.count
      const begin = r.text.search(/-----BEGIN [A-Z ]*PRIVATE KEY-----/)
      if (begin < 0) return r.text
      count += 1
      return `${r.text.slice(0, begin)}[redacted private key]`
    }
    const line = (text: string, max: number): string => s(text).replace(/\s+/g, ' ').trim().slice(0, max)
    const excerpt = clipExcerpt(s(l.excerpt))
    const out: Lesson = {
      ...l,
      path: line(l.path, 500),
      excerpt,
      signature: lessonSignature(excerpt),
      ...(l.what === undefined ? {} : { what: s(l.what).slice(0, LESSON_TEXT_MAX) }),
      ...(l.brief === undefined ? {} : { brief: s(l.brief).slice(0, LESSON_TEXT_MAX) }),
      ...(l.taskTitle === undefined ? {} : { taskTitle: line(l.taskTitle, LESSON_TITLE_MAX) }),
      ...(l.checks === undefined ? {} : { checks: l.checks.map((c) => s(c).slice(0, LESSON_TEXT_MAX)) })
    }
    delete out.redacted
    return count > 0 ? { ...out, redacted: count } : out
  }

  const trim = (file: string): void => keepNewestLines(file, RAW_LINES_MAX)

  return {
    fileOf,

    add(lessons) {
      if (lessons.length === 0) return { ok: true, added: 0 }
      const byRoot = new Map<string, Lesson[]>()
      for (const l of lessons) {
        const parsed = parseLesson(l)
        if (parsed === null) return { ok: false, reason: 'a lesson needs an id, a source, a repository, a path and a time' }
        byRoot.set(parsed.root, [...(byRoot.get(parsed.root) ?? []), scrub(parsed)])
      }
      try {
        mkdirSync(deps.dir, { recursive: true })
        for (const [root, rows] of byRoot) {
          const file = fileOf(root)
          appendFileSync(file, rows.map((r) => `${JSON.stringify(r)}\n`).join(''))
          trim(file)
        }
      } catch (error) {
        return { ok: false, reason: `could not write the lesson: ${String(error)}` }
      }
      return { ok: true, added: lessons.length }
    },

    list(root) {
      const file = fileOf(root)
      // A repository with no file has taught nothing yet — empty, not an error.
      if (!existsSync(file)) return { root, lessons: [], skipped: 0 }
      let text = ''
      try { text = readFileSync(file, 'utf8') } catch { return { root, lessons: [], skipped: 0 } }
      const rows: Lesson[] = []
      let skipped = 0
      for (const line of text.split('\n')) {
        if (line.trim() === '') continue
        try {
          const parsed = parseLesson(JSON.parse(line))
          if (parsed === null) skipped += 1
          else rows.push(parsed)
        } catch { skipped += 1 }
      }
      return { root, lessons: newestLessons(rows), skipped }
    }
  }
}
