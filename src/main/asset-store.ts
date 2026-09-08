import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ASSET_MAX_BYTES, ASSET_STORE_MAX_BYTES, assetFileName, assetRefusal } from '../shared/assets'
import { imageMediaType } from './image-read'
import type { ImageMediaType } from '../shared/starter'

/**
 * M186. THE ASSET STORE: bytes this app has taken responsibility for, named
 * by WHAT THEY ARE.
 *
 * The address is a sha-256 of the content, and three things follow from that
 * and from nothing else. The same picture taken in twice is ONE file, and the
 * second write is skipped rather than repeated (`wrote: false` says which
 * happened, because "already had it" and "just wrote it" are different facts
 * about the disk). An id is portable: M190's export can carry it to another
 * machine, where the same bytes get the same name. And a rename or a move of
 * the source changes nothing, because the source's path was never the
 * identity.
 *
 * The media type comes from the MAGIC NUMBER (`imageMediaType`, M181's own
 * function — one decision, so the store and the reader cannot disagree), and
 * the extension follows it, never the name the file arrived under: a `.png`
 * holding a JPEG is the ordinary downloaded picture.
 *
 * Both caps are REPORTED and neither is silent. One asset over `maxBytes` is
 * refused BY NAME with its size before anything is written. A store over
 * `storeMaxBytes` is pruned oldest-first by mtime, and the count is on the
 * result — a store that quietly deleted a person's pictures would show up as
 * panels that went `missing` with nothing to explain them. Pruning is by AGE
 * against a cap and is not a garbage collector: a pruned asset's panel shows
 * `missing` with Replace, the same three-state answer a deleted file gets.
 *
 * Plain node over a real fixture directory: `verify:file asset.1`.
 */

export type PutAssetResult =
  | { kind: 'stored'; id: string; path: string; mediaType: ImageMediaType; bytes: number; wrote: boolean; prunedCount: number }
  | { kind: 'refused'; reason: string }

export interface PutAssetRequest {
  /** `userData/assets`, created here if it is not there. */
  dir: string
  /** A file to take in, or the bytes themselves (a clipboard picture has no path). */
  path?: string
  bytes?: Uint8Array
  maxBytes?: number
  storeMaxBytes?: number
}

export function assetIdOf(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * Oldest-first by mtime until the store is under its cap. The file just
 * written is never a candidate: it is the newest, and pruning the thing the
 * caller is about to render would be a store that answers with a path to
 * nothing.
 */
function prune(dir: string, cap: number, keep: string): number {
  let files: { path: string; bytes: number; at: number }[]
  try {
    files = readdirSync(dir).map((name) => {
      const path = join(dir, name)
      const st = statSync(path)
      return { path, bytes: st.size, at: st.mtimeMs }
    })
  } catch { return 0 }
  let total = files.reduce((sum, f) => sum + f.bytes, 0)
  if (total <= cap) return 0
  let removed = 0
  for (const file of files.sort((a, b) => a.at - b.at)) {
    if (total <= cap) break
    if (file.path === keep) continue
    try { unlinkSync(file.path); total -= file.bytes; removed += 1 } catch { /* another process got there first */ }
  }
  return removed
}

export async function putAsset(req: PutAssetRequest): Promise<PutAssetResult> {
  const cap = req.maxBytes ?? ASSET_MAX_BYTES
  let bytes: Uint8Array
  if (req.bytes !== undefined) {
    bytes = req.bytes
  } else if (req.path !== undefined) {
    // The SIZE is read first, so a file over the cap never reaches memory.
    try {
      const st = statSync(req.path)
      if (!st.isFile()) return { kind: 'refused', reason: assetRefusal('missing') }
      if (st.size > cap) return { kind: 'refused', reason: assetRefusal('too-large', { bytes: st.size, cap }) }
    } catch {
      return { kind: 'refused', reason: assetRefusal('missing') }
    }
    try { bytes = readFileSync(req.path) } catch { return { kind: 'refused', reason: assetRefusal('missing') } }
  } else {
    return { kind: 'refused', reason: assetRefusal('missing') }
  }
  if (bytes.length > cap) return { kind: 'refused', reason: assetRefusal('too-large', { bytes: bytes.length, cap }) }
  const mediaType = imageMediaType(bytes.subarray(0, 12))
  if (mediaType === null) return { kind: 'refused', reason: assetRefusal('not-an-image') }
  const id = assetIdOf(bytes)
  const path = join(req.dir, assetFileName(id, mediaType))
  try { mkdirSync(req.dir, { recursive: true }) } catch { /* the write below names the failure */ }
  const had = existsSync(path)
  if (!had) {
    try { writeFileSync(path, bytes) } catch (error) {
      return { kind: 'refused', reason: `this app could not keep that picture: ${error instanceof Error ? error.message : String(error)}` }
    }
  }
  const prunedCount = prune(req.dir, req.storeMaxBytes ?? ASSET_STORE_MAX_BYTES, path)
  return { kind: 'stored', id, path, mediaType, bytes: bytes.length, wrote: !had, prunedCount }
}
