/**
 * M186. THE ASSET STORE'S PURE RULES. An asset is BYTES this app has taken
 * responsibility for, named by what they are rather than by where they came
 * from. Shared by main's store, the image node's states and the layout
 * parser, so the three cannot disagree about what an id is.
 *
 * Pure: no DOM, no node. Plain-node checked in `verify:file asset.1`.
 */

import type { ImageMediaType } from './starter'

/** One asset. Ten megabytes is a screenshot of a 6K display with room to spare. */
export const ASSET_MAX_BYTES = 10 * 1024 * 1024
/** The whole store. Past this the OLDEST are pruned, counted and reported. */
export const ASSET_STORE_MAX_BYTES = 200 * 1024 * 1024

const EXTENSIONS: Readonly<Record<ImageMediaType, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp'
}

/**
 * The file an id lives in. The EXTENSION is derived from the media type the
 * magic number gave, never from the name the file arrived under: a `.png`
 * holding a JPEG is the ordinary case for a downloaded picture, and a store
 * that believed the name would hand the renderer a data URL with the wrong
 * type in it.
 */
export function assetFileName(id: string, mediaType: ImageMediaType): string {
  return `${id}.${EXTENSIONS[mediaType]}`
}

/**
 * An id is a sha-256 hex digest: 64 lowercase hex characters, and nothing
 * else is one. Spelled as a parse rather than a "looks like a hash" test so a
 * path, a name or an empty string cannot become an id by accident — the
 * layout parser asks this, and a malformed id must cost the FIELD by name.
 */
export function isAssetId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
}

/** Why bytes were not taken in, in a sentence that names the next useful step. */
export function assetRefusal(reason: 'too-large' | 'not-an-image' | 'missing', detail?: { bytes?: number; cap?: number }): string {
  if (reason === 'missing') return 'that file is not there any more — choose another'
  if (reason === 'not-an-image') return 'that file is not a PNG, JPEG, GIF or WebP — its first bytes say otherwise, whatever it is called'
  // Kilobytes under a megabyte: `0.0 MB, over this app's 0.0 MB limit` is a
  // sentence that names no number a person can act on.
  const mb = (n: number): string => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`)
  return `that picture is ${mb(detail?.bytes ?? 0)}, over this app's ${mb(detail?.cap ?? ASSET_MAX_BYTES)} limit for one asset — shrink it, or point at it in place`
}

/**
 * What an image panel says when its bytes are not there. Three arms, never
 * one: a file that was deleted, a file too big to paint and a file that is
 * not a picture need three different fixes, and each keeps the panel and
 * offers Replace (the brief: "missing bytes leave an object with a Replace
 * action" — an object, not a hole).
 */
export function missingImageSentence(kind: 'missing' | 'too-large' | 'not-an-image', detail?: { bytes?: number; cap?: number }): string {
  if (kind === 'missing') return 'these bytes are not on this machine — Replace points this picture at a file that is'
  if (kind === 'too-large') return assetRefusal('too-large', detail)
  return assetRefusal('not-an-image')
}
