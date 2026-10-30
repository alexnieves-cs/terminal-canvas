import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/**
 * M617. The one atomic write main uses: a temp file in the SAME directory,
 * then a rename over the final name, so a reader (or a crash) never sees a
 * half-written file. Before it, about twenty stores and exporters each wrote
 * their own three lines, and only some of them removed the temp file when the
 * rename failed; the rest left a `<name>.tmp` beside the person's file.
 *
 * The temp name stays `<path>.tmp` — the name every older copy used, and the
 * one credential-store.ts and verify:layout/verify:file look for — so moving a
 * module onto this helper changes nothing a reader or a check can see.
 *
 * Throws like writeFileSync does: a caller that must never throw keeps its
 * own try/catch, exactly as before.
 */
export interface AtomicWriteOptions {
  /** File mode for the new file (0o600 for anything a person did not choose to share). */
  mode?: number
  /** Create the parent directory first. */
  mkdir?: boolean
}

export function writeFileAtomic(path: string, data: string | Uint8Array, opts: AtomicWriteOptions = {}): void {
  if (opts.mkdir === true) mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  try {
    writeFileSync(tmp, data, opts.mode === undefined ? undefined : { mode: opts.mode })
    renameSync(tmp, path)
  } catch (error) {
    // A half-written sibling is a file the person did not ask for.
    try { rmSync(tmp, { force: true }) } catch { /* nothing was created */ }
    throw error
  }
}

/** The same move for an async caller (a trim or a journal written off the hot path). */
export async function writeFileAtomicAsync(path: string, data: string | Uint8Array, opts: AtomicWriteOptions = {}): Promise<void> {
  if (opts.mkdir === true) await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  try {
    await writeFile(tmp, data, opts.mode === undefined ? undefined : { mode: opts.mode })
    await rename(tmp, path)
  } catch (error) {
    try { await rm(tmp, { force: true }) } catch { /* nothing was created */ }
    throw error
  }
}

/**
 * The ring trim every append-only JSONL here shares (the broker's audit, the
 * decision audit, memories, raw lessons): keep the newest `max` non-blank
 * RAW lines — never re-serialised, so a malformed line the trim carries
 * stays exactly as it was. Never throws: a file that cannot be trimmed stays
 * long, and a later append trims again.
 */
export function keepNewestLines(file: string, max: number): void {
  let lines: string[]
  try { lines = readFileSync(file, 'utf8').split('\n').filter((l) => l.trim() !== '') } catch { return }
  if (lines.length <= max) return
  try { writeFileAtomic(file, `${lines.slice(lines.length - max).join('\n')}\n`) } catch { /* the file stays long; a later write trims again */ }
}
