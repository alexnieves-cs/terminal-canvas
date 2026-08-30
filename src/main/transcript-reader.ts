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
 * The RAW bytes appended since `offset`, and the file's size now.
 *
 * The size is returned alongside so the caller can notice a file that SHRANK,
 * which means it was truncated or replaced and the stored offset points past
 * its end — reading from there yields garbage or nothing at all, with no error.
 *
 * Deliberately NOT decoded to a string here. A read can land at any byte
 * offset — mid-write — so the split point routinely falls inside a multibyte
 * UTF-8 codepoint (transcripts carry non-ASCII constantly: em dashes, emoji,
 * source with international identifiers). Decoding an arbitrary byte range
 * directly turns a split codepoint into a replacement character on BOTH sides
 * of the split, corrupting the line that straddles the boundary — JSON.parse
 * then throws on it and the whole turn is dropped, permanently, since the
 * byte offset has already advanced past it. Reassembling complete characters
 * across successive reads needs a decoder that carries state BETWEEN calls
 * (node:string_decoder's whole reason to exist), and this module is
 * deliberately stateless and plain-node testable per-call — so the caller
 * (pty-manager.ts, which already holds per-panel state for the offset and the
 * totals) is where that decoder lives, one per panel, fed these raw bytes.
 *
 * Reads only the delta. The file is append-only and unbounded (a real session
 * measured 262 lines), so re-reading it per tick is quadratic in session
 * length, on the main thread, for a number that changes once per agent turn.
 */
export function readFrom(
  path: string,
  offset: number
): { bytes: Buffer; size: number } | undefined {
  let fd: number | undefined
  try {
    const size = statSync(path).size
    if (size <= offset) return { bytes: Buffer.alloc(0), size }
    fd = openSync(path, 'r')
    const length = size - offset
    const buffer = Buffer.allocUnsafe(length)
    const read = readSync(fd, buffer, 0, length, offset)
    return { bytes: buffer.subarray(0, read), size }
  } catch {
    return undefined
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}
