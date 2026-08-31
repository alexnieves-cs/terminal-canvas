import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, resolve, sep } from 'node:path'
import type { FileCreateResult } from '@shared/file-panel'

export type { FileCreateResult }

/**
 * Default extension for a note whose name carries none.
 *
 * A note is markdown by convention rather than by enforcement — nothing here
 * parses it, and M27 ships no renderer (see the spec's non-goal). The
 * extension exists so the file is recognisable to every OTHER tool the user
 * has, which is the whole argument for putting a note on disk at all.
 */
const DEFAULT_EXT = '.md'

/**
 * Create one file, and refuse rather than clobber.
 *
 * `root` is the directory the name is resolved against — the selected panel's
 * cwd, so a note lands in the project it is about. `name` is what the user
 * typed and may carry directories (`notes/standup`), which are created.
 *
 * MAIN owns the join because the renderer has no `node:path` at all —
 * file-node-model.ts hand-rolls `splitPath` for exactly that reason — so a
 * renderer-side join would be a second, worse implementation of a problem
 * this process already has a library for.
 *
 * NEVER throws: readFile's and writeFile's rule, for their reason. Every
 * failure is an arm.
 */
export function createFile(root: string, name: string, seed: string): FileCreateResult {
  const trimmed = name.trim()
  // An empty name is refused rather than defaulted. Appending DEFAULT_EXT to
  // an empty string yields a DOTFILE named `.md` in the root — a file that
  // exists, that the tree does not show, and that the user could never find
  // again. A refusal is visible at the moment it happens.
  if (trimmed === '') {
    return { kind: 'refused', detail: 'a note needs a name' }
  }

  // Only when there is no extension at all. Appending unconditionally turns
  // `todo.txt` into `todo.txt.md`, which is a DIFFERENT file from the one the
  // user asked for and reads as the app not listening to them.
  const withExt = extname(trimmed) === '' ? trimmed + DEFAULT_EXT : trimmed

  const base = resolve(root)
  const target = resolve(base, withExt)
  // Not a security boundary — the user has a shell one panel over, and this
  // refuses nothing they could not do there. It stops a `../` typo dropping a
  // note OUTSIDE the project it was meant to be about, which is a note nobody
  // ever finds again. `base + sep` rather than `base`, so `/repo-backup` does
  // not read as inside `/repo`.
  if (target !== base && !target.startsWith(base + sep)) {
    return { kind: 'refused', detail: 'a note has to stay inside this panel’s directory' }
  }

  try {
    mkdirSync(dirname(target), { recursive: true })
  } catch (err) {
    return { kind: 'failed', detail: (err as Error).message }
  }

  try {
    // `wx` is the whole of this function's safety, and it is why there is no
    // existsSync above it. A check-then-write is a TOCTOU, and in THIS app the
    // racing writer is an autonomous agent working in the same directory — so
    // the race is the ordinary case rather than an exotic one, the same
    // reasoning review-commit.ts's HEAD-moved guard already records. `wx` asks
    // the KERNEL to create-or-fail atomically, so there is no window at all.
    writeFileSync(target, seed, { encoding: 'utf8', flag: 'wx' })
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    // Its own arm, never a `failed`. "That name is taken" is answered by
    // renaming; "the write failed" is answered by looking at your filesystem.
    // And the existing file is UNTOUCHED, which is the half verify:file 20
    // actually asserts — a refusal reported to the caller while the bytes are
    // gone is not a refusal.
    if (e.code === 'EEXIST') return { kind: 'exists', path: target }
    return { kind: 'failed', detail: e.message }
  }

  try {
    // Read back rather than trusted, because this number BECOMES the panel's
    // first compare-and-swap token — file-write.ts's own rule. An invented
    // timestamp would make the note's very first save refuse itself.
    return { kind: 'created', path: target, mtimeMs: statSync(target).mtimeMs }
  } catch (err) {
    return { kind: 'failed', detail: (err as Error).message }
  }
}
