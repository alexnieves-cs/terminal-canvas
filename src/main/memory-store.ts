import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { redactSecrets } from '../shared/redact'
import { MEMORY_MAX } from '../shared/ipc-contract'

/**
 * M83. THE PROJECT MEMORY: what this repository has already decided, tried
 * and failed, written where every agent in every panel can read it.
 *
 * One append-only JSONL per repository under `userData/memory/<slug>.jsonl` —
 * the scrollback log's own shape (one file per subject, appended, ring-trimmed)
 * rather than `layout-store.ts`'s temp-and-rename, because a memory is a
 * fact added to a list, not a document rewritten.
 *
 * EVERY write passes `redactSecrets`, the same scrubber export applies: this
 * file is read back BY AGENTS and pasted into their context, so a token typed
 * into a note would be sent to a model provider by a feature whose whole
 * purpose is to be read. What is redacted is replaced with its marker, never
 * dropped silently, so a person reading the file can see something was taken.
 *
 * Plain node against an injected directory; `verify:file memory.1`.
 */

export type MemoryKind = 'decided' | 'tried' | 'failed' | 'note'
export const MEMORY_KINDS: readonly MemoryKind[] = ['decided', 'tried', 'failed', 'note']

export interface MemoryEntry {
  kind: MemoryKind
  text: string
  panelId?: string
  at: number
  /** How many secrets the scrubber replaced when this was written. */
  redacted?: number
}

export interface MemoryAddRequest {
  root: string
  kind: string
  text: string
  panelId?: string
  at?: number
}

export type MemoryAddResult = { ok: true; entry: MemoryEntry } | { ok: false; reason: string }

export interface MemoryRead {
  root: string
  /** Newest first. */
  entries: MemoryEntry[]
  /** Lines this read could not parse — reported, never fatal. */
  skipped: number
}

/** The newest kept per repository; a memory is a working set, not an archive. */
export { MEMORY_MAX } from '../shared/ipc-contract'

export interface MemoryStore {
  add(req: MemoryAddRequest): MemoryAddResult
  list(root: string, limit: number): MemoryRead
  /** The file a repository's memories live in — for a check, and for the node's own note. */
  fileOf(root: string): string
}

/**
 * `/a/b/repo` → `a-b-repo-<hash>`, one file per repository and no nesting.
 *
 * The HASH is not decoration (M83's verifier). A slug alone is not injective:
 * `/a/b` and `/a-b` flatten to the same name, and any two paths that differ
 * only past 120 characters truncate to it — two repositories then share one
 * memory, and one project's decisions are read back inside another and pasted
 * into that agent's context, with nothing anywhere saying so. The scrollback
 * log gets away with a bare slug because its subject is a unique panel id;
 * this subject is a user's path. The readable half stays first so the
 * directory can still be browsed by eye.
 */
function slugOf(root: string): string {
  const trimmed = root.replace(/\/+$/, '')
  const slug = trimmed.replace(/^\/+/, '').replace(/[^A-Za-z0-9._-]+/g, '-')
  const hash = createHash('sha256').update(trimmed).digest('hex').slice(0, 8)
  return `${slug === '' ? 'root' : slug.slice(0, 100)}-${hash}`
}

export function createMemoryStore(deps: { dir: string; now?: () => number }): MemoryStore {
  const now = deps.now ?? (() => Date.now())
  const fileOf = (root: string): string => join(deps.dir, `${slugOf(root)}.jsonl`)

  const readAll = (root: string): MemoryRead => {
    const file = fileOf(root)
    // A repository with no file is EMPTY, never an error: it is every
    // repository until somebody writes the first memory.
    if (!existsSync(file)) return { root, entries: [], skipped: 0 }
    let text = ''
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      return { root, entries: [], skipped: 0 }
    }
    const entries: MemoryEntry[] = []
    let skipped = 0
    for (const line of text.split('\n')) {
      if (line.trim() === '') continue
      try {
        const parsed: unknown = JSON.parse(line)
        if (typeof parsed !== 'object' || parsed === null) { skipped += 1; continue }
        const row = parsed as Record<string, unknown>
        if (!MEMORY_KINDS.includes(row.kind as MemoryKind) || typeof row.text !== 'string' || typeof row.at !== 'number') { skipped += 1; continue }
        entries.push({
          kind: row.kind as MemoryKind,
          text: row.text,
          at: row.at,
          ...(typeof row.panelId === 'string' ? { panelId: row.panelId } : {}),
          ...(typeof row.redacted === 'number' && row.redacted > 0 ? { redacted: row.redacted } : {})
        })
      } catch {
        skipped += 1
      }
    }
    return { root, entries, skipped }
  }

  /**
   * Ring-trim on write, like the scrollback log: the newest are kept.
   *
   * Two properties the obvious version loses (M83's verifier), and both fail
   * silently. It keeps the newest RAW LINES rather than re-serialising the
   * parsed entries: re-serialising deletes every line the parser skipped, so
   * "a line could not be read" quietly becomes "there was never a line" and
   * the reported `skipped` count drops to 0. And it writes through a temp
   * file in the same directory, then renames: a bare rewrite over the live
   * file leaves a truncated or empty memory if the process dies mid-write,
   * and this file is the one durable record the milestone exists to keep.
   */
  const trim = (root: string): void => {
    const file = fileOf(root)
    let lines: string[]
    try {
      lines = readFileSync(file, 'utf8').split('\n').filter((l) => l.trim() !== '')
    } catch { return }
    if (lines.length <= MEMORY_MAX) return
    const kept = lines.slice(lines.length - MEMORY_MAX)
    const tmp = `${file}.tmp`
    try {
      writeFileSync(tmp, `${kept.join('\n')}\n`)
      renameSync(tmp, file)
    } catch { /* the file stays long; a later write trims again */ }
  }

  return {
    fileOf,

    add(req) {
      if (!MEMORY_KINDS.includes(req.kind as MemoryKind)) {
        return { ok: false, reason: `${JSON.stringify(req.kind)} is not a memory kind — use decided, tried, failed or note` }
      }
      if (typeof req.text !== 'string' || req.text.trim() === '') {
        return { ok: false, reason: 'a memory needs text' }
      }
      if (typeof req.root !== 'string' || req.root.trim() === '') {
        return { ok: false, reason: 'a memory needs a repository' }
      }
      const scrubbed = redactSecrets(req.text.trim())
      const entry: MemoryEntry = {
        kind: req.kind as MemoryKind,
        text: scrubbed.text,
        at: req.at ?? now(),
        ...(req.panelId === undefined ? {} : { panelId: req.panelId }),
        ...(scrubbed.count > 0 ? { redacted: scrubbed.count } : {})
      }
      try {
        mkdirSync(deps.dir, { recursive: true })
        appendFileSync(fileOf(req.root), `${JSON.stringify(entry)}\n`)
      } catch (error) {
        return { ok: false, reason: `could not write the memory: ${String(error)}` }
      }
      trim(req.root)
      return { ok: true, entry }
    },

    list(root, limit) {
      const all = readAll(root)
      // A non-positive limit would answer [] — an empty list that reads
      // exactly like a repository nobody has written about. Refused by the
      // caller (`control-handler.ts`); clamped here so no door can produce
      // that confident wrong answer.
      if (!Number.isFinite(limit) || limit < 1) return { root, entries: [], skipped: all.skipped }
      // Newest first — the order a reader wants and the order the chat's
      // context takes.
      const newest = [...all.entries].reverse().slice(0, Math.max(0, limit))
      return { root, entries: newest, skipped: all.skipped }
    }
  }
}
