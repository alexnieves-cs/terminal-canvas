import { readdirSync, openSync, readSync, closeSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Where Claude Code keeps its session transcripts. Another program's
 * directory, so everything here treats it as untrusted and absent-by-default:
 * a missing directory is the empty answer, never an error.
 */
const PROJECTS_DIR = join(homedir(), '.claude', 'projects')

/**
 * The transcript for this session id, by GLOBBING for the filename rather
 * than rebuilding the path from a cwd.
 *
 * The filename IS the session id and a session id is unique, so this needs no
 * knowledge of Claude Code's directory-slug rule — an undocumented detail of
 * another program that can change in a release with nothing here to notice.
 * It is also immune to a panel that `cd`s: the transcript stays where it was
 * created, so a cwd-derived path would go stale exactly as ideas-backlog #41
 * describes, in a milestone that is not about cwd at all.
 *
 * Undefined is the ORDINARY answer for the first seconds of every pinned
 * panel — the agent has started and not yet written — and the caller retries.
 */
export function resolveTranscript(sessionId: string): string | undefined {
  const name = `${sessionId}.jsonl`
  let dirs: string[]
  try {
    dirs = readdirSync(PROJECTS_DIR)
  } catch {
    return undefined
  }
  for (const dir of dirs) {
    const candidate = join(PROJECTS_DIR, dir, name)
    try {
      statSync(candidate)
      return candidate
    } catch {
      continue
    }
  }
  return undefined
}

/**
 * The bytes appended since `offset`, and the file's size now.
 *
 * The size is returned alongside so the caller can notice a file that SHRANK,
 * which means it was truncated or replaced and the stored offset points past
 * its end — reading from there yields garbage or nothing at all, with no error.
 *
 * Reads only the delta. The file is append-only and unbounded (a real session
 * measured 262 lines), so re-reading it per tick is quadratic in session
 * length, on the main thread, for a number that changes once per agent turn.
 */
export function readFrom(
  path: string,
  offset: number
): { text: string; size: number } | undefined {
  let fd: number | undefined
  try {
    const size = statSync(path).size
    if (size <= offset) return { text: '', size }
    fd = openSync(path, 'r')
    const length = size - offset
    const buffer = Buffer.allocUnsafe(length)
    const read = readSync(fd, buffer, 0, length, offset)
    return { text: buffer.subarray(0, read).toString('utf8'), size }
  } catch {
    return undefined
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}
