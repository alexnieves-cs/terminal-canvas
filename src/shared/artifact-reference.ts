/**
 * D12. Provenance describes where an existing artifact came from. It is not
 * the artifact's title, a capability, or permission to re-read its source.
 */
export type ArtifactReference =
  | { kind: 'capture'; id: string; url: string; capturedAt: number }
  | { kind: 'file'; path: string }
  | { kind: 'tool'; conversationId: string; turnId: string; toolId: string }

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown): value is string => typeof value === 'string' && value.trim() !== ''
const at = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/** Optional provenance: absent is old data; malformed or unknown costs itself. */
export function parseArtifactReference(raw: unknown): ArtifactReference | undefined {
  if (!record(raw) || !text(raw.kind)) return undefined
  if (raw.kind === 'capture' && text(raw.id) && text(raw.url) && at(raw.capturedAt)) {
    return { kind: 'capture', id: raw.id, url: raw.url, capturedAt: raw.capturedAt }
  }
  if (raw.kind === 'file' && text(raw.path)) return { kind: 'file', path: raw.path }
  if (raw.kind === 'tool' && text(raw.conversationId) && text(raw.turnId) && text(raw.toolId)) {
    return { kind: 'tool', conversationId: raw.conversationId, turnId: raw.turnId, toolId: raw.toolId }
  }
  return undefined
}
