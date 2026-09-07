/**
 * M145 (backlog #13, the bytes case). An image on the clipboard, pasted into
 * a TERMINAL panel, becomes a file main writes — because a PTY is a byte
 * stream that cannot take an image, and the agent CLIs read a PATH in their
 * input. The renderer then pastes the path (shell-quoted, bracketed); a chat
 * keeps its own door (`agent:clipboard-image`, M75, base64 over the wire).
 *
 * Pure over an injected directory, clock and clipboard reader, so
 * `verify:file clipboard.1–.3` drives it under plain node; the real
 * `clipboard.readImage()` lives in main/index.ts, which no suite bundles.
 *
 * Retention is a CAP, not an age: the directory is pruned to the newest
 * `ATTACHMENTS_KEEP` files after every write. A cap cannot grow without bound
 * and needs no clock to be right; an age policy would keep a thousand
 * screenshots from one afternoon and delete the one from last week that a
 * transcript still names.
 */
import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const ATTACHMENTS_KEEP = 20

import type { ClipboardFile } from '../shared/ipc-contract'
export type { ClipboardFile }

export interface ClipboardFileDeps {
  /** `userData/attachments`, created on first use. */
  dir: string
  now: () => number
  /** PNG bytes, or null when the clipboard holds no image. */
  image: () => Buffer | null
}

export function writeClipboardImage(deps: ClipboardFileDeps): ClipboardFile {
  const bytes = deps.image()
  if (bytes === null) return { kind: 'empty' }
  try {
    mkdirSync(deps.dir, { recursive: true })
    const path = join(deps.dir, `clipboard-${deps.now()}.png`)
    writeFileSync(path, bytes)
    prune(deps.dir)
    return { kind: 'ok', path }
  } catch (error) {
    return { kind: 'failed', why: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Newest ATTACHMENTS_KEEP survive, ordered by the STAMP in the name (the clock
 * this module was given) — two files written in one millisecond share an
 * mtime, and an order that ties there could delete the newest. A file that
 * cannot be removed is left, never retried in a loop.
 */
function prune(dir: string): void {
  const stampOf = (f: string): number => Number((/clipboard-(\d+)\.png$/.exec(f) || [, '0'])[1])
  const files = readdirSync(dir)
    .filter((f) => /^clipboard-\d+\.png$/.test(f))
    .map((f) => ({ f, at: stampOf(f) }))
    .sort((a, b) => b.at - a.at)
  for (const { f } of files.slice(ATTACHMENTS_KEEP)) {
    try { unlinkSync(join(dir, f)) } catch { /* left; the next write tries again */ }
  }
}
