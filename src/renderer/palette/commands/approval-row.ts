/** M76. A pending permission request as the palette lists it. */
export interface ApprovalRow {
  id: string
  requestId: string
  toolName: string
  argument: string
  label: string
}

/** The palette Allow row's id, so ⌘Y and the row name the same request. */
export function allowCommandId(panelId: string, requestId: string): string {
  return `approval.allow.${panelId}.${requestId}`
}

export interface AllowTarget { panelId: string; requestId: string }

/**
 * M442. Whose request ⌘Y answers.
 *
 * One selected panel: that panel's request, or nothing — a selection must
 * not steal another panel's request. Nothing selected: the queue head's
 * request. Several selected: nothing, the same as a selected panel with no
 * request. The queue head is not a fallback for a selection.
 */
export function allowPendingTarget(input: {
  selectionEmpty: boolean
  selectedId: string | null
  approvals: readonly { id: string; requestId: string }[]
  queueHeadId: string | null
}): AllowTarget | null {
  const id = input.selectionEmpty ? input.queueHeadId : input.selectedId
  if (id === null) return null
  const hit = input.approvals.find((row) => row.id === id)
  return hit === undefined ? null : { panelId: hit.id, requestId: hit.requestId }
}