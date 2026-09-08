import { readFileSync, statSync } from 'node:fs'

/**
 * M181. THE IMAGE READ, the fifteenth kind's one main-side read: the media
 * type is decided by MAGIC NUMBER and never by extension (an extension is a
 * claim; the first bytes are a fact), a file over the cap is `too-large`
 * from `stat` without its bytes ever reaching a data URL, a missing path is
 * its own arm and never a throw. Four arms, never fewer: `missing`,
 * `too-large` and `not-an-image` each name a different fix, and a blank
 * picture panel says none of them.
 *
 * The renderer paints the data URL in an `<img>` under the CSP's
 * `img-src 'self' data:` — no `file:` reach from the renderer, the rule
 * M103's guest also keeps. Plain node: `verify:file image.1`.
 */

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024

import type { ImageMediaType, ImageResult } from '../shared/starter'
export type { ImageMediaType, ImageResult } from '../shared/starter'

/** The first bytes, and nothing else, say what the file is. */
export function imageMediaType(head: Uint8Array): ImageMediaType | null {
  if (head.length >= 4 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return 'image/png'
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg'
  if (head.length >= 4 && head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x38) return 'image/gif'
  if (head.length >= 12 && head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 &&
    head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50) return 'image/webp'
  return null
}

export function readImage(path: string): ImageResult {
  let bytes: number
  try {
    const st = statSync(path)
    if (!st.isFile()) return { kind: 'missing' }
    bytes = st.size
  } catch {
    return { kind: 'missing' }
  }
  if (bytes > IMAGE_MAX_BYTES) return { kind: 'too-large', bytes, cap: IMAGE_MAX_BYTES }
  let buf: Buffer
  try { buf = readFileSync(path) } catch { return { kind: 'missing' } }
  const mediaType = imageMediaType(buf.subarray(0, 12))
  if (mediaType === null) return { kind: 'not-an-image' }
  return { kind: 'data', dataUrl: `data:${mediaType};base64,${buf.toString('base64')}`, bytes: buf.length, mediaType }
}
