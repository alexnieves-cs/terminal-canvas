import { chmodSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { basename, dirname, join } from 'node:path'
import { FILE_MAX_BYTES } from '@shared/file-panel'
import type { FileWriteResult } from '@shared/file-panel'

export type { FileWriteResult }

/**
 * Write one file, and refuse rather than destroy.
 *
 * `baseMtimeMs` is the `mtimeMs` of the FileResult the caller's content was
 * derived from — the value file-read.ts stamps AFTER its read completes,
 * precisely so it describes the content actually in hand rather than whatever
 * was on disk when the read started. If the file's current mtime differs, the
 * write is REFUSED and nothing is written.
 *
 * `null` means overwrite regardless, and it is reachable only from an explicit
 * control the user presses after seeing a `stale`. It is a PARAMETER rather
 * than a second exported function so there is exactly one write path and the
 * CAS cannot be bypassed by reaching for the other one.
 *
 * NEVER throws — readFile's rule, for readFile's reason.
 */
export function writeFile(path: string, content: string, baseMtimeMs: number | null): FileWriteResult {
  // Refused on the way OUT as well as the way in. Without this a panel could
  // grow a file past the cap it can then never display again.
  const bytes = Buffer.byteLength(content, 'utf8')
  if (bytes > FILE_MAX_BYTES) {
    return { kind: 'failed', detail: `this is larger than the ${FILE_MAX_BYTES} byte limit` }
  }

  // Resolve BEFORE anything else. If the panel's path is a symlink, the
  // temp-and-rename below would replace the LINK with a regular file: the
  // user's symlink silently gone, the real file untouched, and the agent
  // still reading the old target. Resolving writes the target and leaves the
  // link intact.
  let real: string
  let mode: number
  let currentMtimeMs: number
  try {
    real = realpathSync(path)
    const stat = statSync(real)
    if (!stat.isFile()) return { kind: 'failed', detail: 'not a regular file' }
    mode = stat.mode
    currentMtimeMs = stat.mtimeMs
  } catch (error: unknown) {
    // ENOENT here is the file deleted underneath the draft, which is a
    // CONFLICT rather than a filesystem problem: the content in hand
    // describes a file that no longer exists. Recreating it would resurrect
    // something somebody deliberately removed.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { kind: 'stale', detail: 'this file no longer exists on disk' }
    }
    return { kind: 'failed', detail: String(error) }
  }

  // The compare-and-swap. `null` is the deliberate overwrite.
  if (baseMtimeMs !== null && currentMtimeMs !== baseMtimeMs) {
    return { kind: 'stale', detail: 'this file changed on disk since it was opened here' }
  }

  // Temp-and-rename, never writeFileSync in place: the whole premise of this
  // feature is that an agent is reading this same file, and an in-place write
  // is observably torn — a reader landing mid-write sees a truncated file and
  // acts on it. The temp lives in the SAME directory, because a rename across
  // filesystems is not atomic and falls back to a copy.
  const tmp = join(dirname(real), `.${basename(real)}.tc-${randomBytes(6).toString('hex')}.tmp`)
  try {
    writeFileSync(tmp, content, 'utf8')
    // A fresh temp file is created at the process umask (typically 0644), so
    // without this every save silently strips the executable bit off a script
    // and resets any deliberate permissions — a loss discovered days later by
    // something that failed to run.
    chmodSync(tmp, mode)
    renameSync(tmp, real)
  } catch (error: unknown) {
    return { kind: 'failed', detail: String(error) }
  } finally {
    // On every path including a successful rename (where the temp no longer
    // exists and this is a no-op). A leftover temp file in a directory the
    // user is working in is litter this app has no business leaving.
    rmSync(tmp, { force: true })
  }

  let mtimeMs = 0
  try {
    mtimeMs = statSync(real).mtimeMs
  } catch {
    // Vanished between the rename and here. The write really happened, so
    // report it; only the token for the NEXT save is lost, and that save will
    // refuse as stale rather than destroy anything.
  }
  return { kind: 'written', mtimeMs, bytes }
}
