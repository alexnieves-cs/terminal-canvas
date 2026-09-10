import { readFileSync, statSync } from 'node:fs'
import {
  BINARY_SCAN_BYTES,
  FILE_MAX_BYTES,
  FILE_MAX_LINES,
  type FileEncoding,
  type FileResult
} from '@shared/file-panel'

/**
 * Read one file, and say honestly what happened.
 *
 * Synchronous, and that is a considered choice rather than laziness. Every
 * other filesystem read in main is synchronous (prompts.ts, layout-store.ts),
 * the reads are bounded by FILE_MAX_BYTES, and they are driven either by an
 * invoke the renderer is already awaiting or by a debounced watch event — not
 * by a tick. If a future change puts this on a hot path, the fix is an async
 * read, not a smaller cap.
 *
 * NEVER throws. Every failure is an arm. A throw here would cross the IPC
 * boundary as a rejected invoke, and the component's `.catch` would render
 * `unreadable` with a stringified Error — the right arm reached by the wrong
 * road, and one that loses the errno on the way.
 */
export function readFile(path: string, encoding?: FileEncoding): FileResult {
  let bytes: number
  try {
    const stat = statSync(path)
    // Checked BEFORE the read, not after: readFileSync on a directory throws
    // EISDIR on Linux and returns nonsense on some platforms, and this way the
    // arm is chosen by a fact rather than by an error message.
    if (!stat.isFile()) return { kind: 'unreadable', detail: 'not a regular file' }
    bytes = stat.size
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException).code
    // ENOENT is the ordinary case — a file an agent has not written yet, or
    // one it just deleted — and it has its own arm so the panel can say so
    // and stay open. Everything else is a genuine problem and carries its
    // own detail, because EACCES and ELOOP have different fixes.
    if (code === 'ENOENT') return { kind: 'missing' }
    return { kind: 'unreadable', detail: String(error) }
  }

  // Refused, never truncated. prompts.ts's rule: half a file is a different
  // file, and a viewer that silently shows the first 2MB of a 30MB log is
  // making a claim it cannot support.
  if (bytes > FILE_MAX_BYTES) return { kind: 'too-large', bytes, cap: FILE_MAX_BYTES }

  let buf: Buffer
  try {
    buf = readFileSync(path)
  } catch (error: unknown) {
    // A file can vanish between the stat and the read — the whole point of
    // this feature is that something else is writing it.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'missing' }
    return { kind: 'unreadable', detail: String(error) }
  }

  // M245. Bytes, for a caller that parses the file itself. The mtime is
  // taken AFTER the read for the reason the text arm's is (below).
  if (encoding === 'base64') {
    let mtimeMs = 0
    try { mtimeMs = statSync(path).mtimeMs } catch { /* vanished after the read; the bytes are still real */ }
    return { kind: 'bytes', base64: buf.toString('base64'), bytes, mtimeMs }
  }

  // Bounded scan. A NUL past the window reads as text: a deliberate false
  // negative, and the safe direction — one replacement character in a mostly
  // text file beats refusing to show it at all.
  const scanTo = Math.min(buf.length, BINARY_SCAN_BYTES)
  for (let i = 0; i < scanTo; i++) {
    if (buf[i] === 0) return { kind: 'binary', bytes }
  }

  const all = buf.toString('utf8')
  // split('\n') manufactures a phantom trailing element for the ordinary
  // case — a file ending in a newline — because there is nothing after that
  // final '\n' for split to return but an empty string: "a\nb\n".split('\n')
  // is ["a","b",""], three elements for a two-line file. `wc -l` does not
  // make that mistake, and neither should this. An empty file is zero lines,
  // not one (`''.split('\n')` is `['']`, length 1, which is also wrong), and
  // a file with NO trailing newline keeps its last (unterminated) line —
  // popping there would silently drop real content rather than an artifact
  // of the split.
  const allLines = all.length === 0 ? [] : all.endsWith('\n') ? all.slice(0, -1).split('\n') : all.split('\n')
  const lines = allLines.length
  const truncatedLines = Math.max(0, lines - FILE_MAX_LINES)
  // Truncate and REPORT. The remainder is a number on the result, not a
  // sentence spliced into the content: the renderer composes the text, the
  // same division Command.waiting and RailRow.waiting already keep.
  const content = truncatedLines === 0 ? all : allLines.slice(0, FILE_MAX_LINES).join('\n')

  // A second stat, deliberately not reused from the one above: this one is
  // taken AFTER the read completes, so it reports the mtime of the file as
  // of the content actually in hand, not of whatever was on disk before the
  // read started — the read itself can race a concurrent write.
  let mtimeMs = 0
  try {
    mtimeMs = statSync(path).mtimeMs
  } catch {
    // Vanished between the read and here. The content in hand is still real,
    // so report it; only the timestamp is lost.
  }
  return { kind: 'text', content, bytes, lines, truncatedLines, mtimeMs }
}
