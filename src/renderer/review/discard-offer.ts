/**
 * The discard a live review can actually run. Approve in the World reads it
 * so the toast can offer Undo (D9 option B). An across review's baseline is
 * the sentinel `across`, which is not a revert, and a blocked or empty
 * discard is not one either. Nothing here calls `review.discard`.
 */
export interface ReadyDiscard {
  root: string
  baseline: string
  subjectId: string
  paths: readonly string[]
}

const ready = new Map<string, ReadyDiscard>()

export function publishReadyDiscard(subjectId: string, offer: ReadyDiscard | null): void {
  if (offer === null) ready.delete(subjectId)
  else ready.set(subjectId, offer)
}

export function readyDiscardFor(subjectId: string): ReadyDiscard | null {
  return ready.get(subjectId) ?? null
}

export function offerFromReview(input: {
  root: string
  baseline: string
  subjectId: string
  acrossBaseline: string
  discard: { kind: string; paths?: readonly string[] }
}): ReadyDiscard | null {
  if (input.discard.kind !== 'ready') return null
  const paths = (input.discard.paths ?? []).filter((path) => path.trim() !== '')
  if (paths.length === 0) return null
  if (input.root.trim() === '' || input.subjectId.trim() === '') return null
  // `across` is the sentinel for a review that is not one panel's change.
  if (input.baseline.trim() === '' || input.baseline === input.acrossBaseline) return null
  return { root: input.root, baseline: input.baseline, subjectId: input.subjectId, paths }
}
