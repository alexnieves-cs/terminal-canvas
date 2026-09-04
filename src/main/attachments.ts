import { readFileSync, statSync } from 'node:fs'
import { basename } from 'node:path'

/**
 * M75. What the composer attaches to a message, resolved in MAIN into the
 * bytes the CLI takes — a dropped image's path read here (the renderer has
 * no `fs`), a pasted image's bytes passed through.
 *
 * Every arm refuses BY NAME: a non-image path (the fix is to reference it
 * by path, which the composer does for a dropped file), a file over the cap
 * (the cap in the sentence), a missing file. A refused attachment never
 * becomes an empty block: the send is refused whole and the composer keeps
 * the draft. Plain node; `verify:agent-session attach.2`.
 */

export type Attachment =
  | { kind: 'path'; path: string }
  | { kind: 'data'; mediaType: string; base64: string; name: string }

export interface DecodedImage {
  kind: 'image'
  mediaType: string
  base64: string
  name: string
  size: number
}

export type ResolvedAttachment = DecodedImage | { kind: 'refused'; reason: string }

/** 5 MB: above the API's comfort and far above any screenshot. */
export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024

const MEDIA: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }

export function resolveAttachment(attachment: Attachment, maxBytes = ATTACHMENT_MAX_BYTES): ResolvedAttachment {
  if (attachment.kind === 'data') {
    if (!Object.values(MEDIA).includes(attachment.mediaType)) return { kind: 'refused', reason: `only png, jpeg, gif and webp images can be attached — ${attachment.name} is ${attachment.mediaType}` }
    const size = Buffer.byteLength(attachment.base64, 'base64')
    if (size > maxBytes) return { kind: 'refused', reason: `${attachment.name} is larger than the ${label(maxBytes)} attachment cap` }
    return { kind: 'image', mediaType: attachment.mediaType, base64: attachment.base64, name: attachment.name, size }
  }
  const name = basename(attachment.path)
  const dot = name.lastIndexOf('.')
  const mediaType = dot < 0 ? undefined : MEDIA[name.slice(dot + 1).toLowerCase()]
  if (mediaType === undefined) return { kind: 'refused', reason: `only png, jpeg, gif and webp images can be attached — reference ${name} by its path instead` }
  let size: number
  try {
    size = statSync(attachment.path).size
  } catch {
    return { kind: 'refused', reason: `${name} could not be read — is it still there?` }
  }
  if (size > maxBytes) return { kind: 'refused', reason: `${name} is larger than the ${label(maxBytes)} attachment cap` }
  let bytes: Buffer
  try {
    bytes = readFileSync(attachment.path)
  } catch {
    return { kind: 'refused', reason: `${name} could not be read` }
  }
  return { kind: 'image', mediaType, base64: bytes.toString('base64'), name, size }
}

function label(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${Math.round(bytes / (1024 * 1024))} MB` : bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} B`
}
