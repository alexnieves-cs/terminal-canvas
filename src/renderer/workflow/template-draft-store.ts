import { useEffect, useState } from 'react'
import type { PersistedTemplate, TemplateNode } from '@shared/templates'
import type { HandoffTrigger } from '@shared/handoff'
import { addEdge, addNode, configureNode, moveNode, removeEdge, removeNode, retriggerEdge, type EditResult } from '@shared/template-edit'

/**
 * M182. THE DRAFT — one per template, the record both editors edit. A
 * module-level mirror in the M105 shape: subscribed by template id, a cached
 * snapshot object (a fresh object per change, never a mutation), cleared when
 * the last workflow panel of that template closes. Every operation goes
 * through `applyDraftOp`, which calls the ONE pure function for it
 * (`shared/template-edit.ts`) over the draft (or the saved record when there
 * is no draft yet) and keeps the result; the diagram is `buildDiagram(draft)`.
 *
 * `baseRevision` is the revision the draft was read at: what Save (M184)
 * hands the store as its expectation, so a record saved by someone else in
 * between is refused as stale rather than overwritten.
 */

export type DraftOp =
  | { type: 'add'; node: Omit<TemplateNode, 'key'> }
  | { type: 'move'; key: string; dx: number; dy: number }
  | { type: 'set'; key: string; patch: Record<string, unknown> }
  | { type: 'remove'; key: string }
  | { type: 'edge'; from: string; to: string; trigger: HandoffTrigger }
  | { type: 'unedge'; from: string; to: string }
  | { type: 'retrigger'; from: string; to: string; trigger: HandoffTrigger }

export interface TemplateDraft {
  template: PersistedTemplate
  baseRevision: number
  dirty: boolean
}

const drafts = new Map<string, TemplateDraft>()
const listeners = new Map<string, Set<() => void>>()
/** M183. The selected block (a node key) or edge (`from>to`) per template — a fact of the store, so the panel, the inspector and the palette agree. */
const selection = new Map<string, string | null>()

function notify(id: string): void { for (const fn of listeners.get(id) ?? []) fn() }

export function getDraft(id: string): TemplateDraft | undefined { return drafts.get(id) }

export function subscribeDraft(id: string, fn: () => void): () => void {
  const set = listeners.get(id) ?? new Set<() => void>()
  set.add(fn); listeners.set(id, set)
  return () => { set.delete(fn); if (set.size === 0) listeners.delete(id) }
}

/** The one door: the pure operation over the draft (or the saved record), the result kept and announced. */
export function applyDraftOp(id: string, saved: PersistedTemplate | undefined, op: DraftOp): EditResult {
  // A deleted record's draft is not editable: the record is the authority (the critic).
  if (saved === undefined) { drafts.delete(id); return { kind: 'refused', reason: `no template is called ${id} — it was deleted` } }
  const base = drafts.get(id)?.template ?? saved
  const result = op.type === 'add' ? addNode(base, op.node)
    : op.type === 'move' ? moveNode(base, op.key, op.dx, op.dy)
      : op.type === 'set' ? configureNode(base, op.key, op.patch)
        : op.type === 'remove' ? removeNode(base, op.key)
          : op.type === 'edge' ? addEdge(base, op.from, op.to, op.trigger)
            : op.type === 'retrigger' ? retriggerEdge(base, op.from, op.to, op.trigger)
              : removeEdge(base, op.from, op.to)
  if (result.kind === 'refused') return result
  const previous = drafts.get(id)
  drafts.set(id, { template: result.template, baseRevision: previous?.baseRevision ?? saved?.revision ?? 0, dirty: true })
  notify(id)
  return result
}

/** After a save (M184) or a reload: the draft is the record again, clean. */
export function resetDraft(id: string, saved?: PersistedTemplate): void {
  if (saved === undefined) drafts.delete(id)
  else drafts.set(id, { template: saved, baseRevision: saved.revision ?? 0, dirty: false })
  notify(id)
}

/**
 * M252. A person read the workflow: the DRAFT loses its unread mark too,
 * because Run runs the draft when there is one (M184) — clearing only the
 * record left every door refused, found by verify:panels tool.2. A dirty
 * draft keeps its edits; its base moves to the record's new revision, since
 * the only change between the two was this mark, so its next save is not
 * refused as stale for a write the person made themselves.
 */
export function markDraftRead(id: string, revision: number): void {
  const draft = drafts.get(id)
  if (draft === undefined || draft.template.reviewed !== false) return
  const template = { ...draft.template }
  delete template.reviewed
  drafts.set(id, { template, baseRevision: revision, dirty: draft.dirty })
  notify(id)
}

export function clearDraft(id: string): void { const had = drafts.delete(id); selection.delete(id); if (had) notify(id) }

export function selectedOf(id: string): string | null { return selection.get(id) ?? null }
export function select(id: string, what: string | null): void { if ((selection.get(id) ?? null) === what) return; selection.set(id, what); notify(id) }

/** The selected block or edge of a template, live. */
export function useSelectedOf(id: string): string | null {
  const [, bump] = useState(0)
  useEffect(() => subscribeDraft(id, () => bump((n) => n + 1)), [id])
  return selectedOf(id)
}

/** The draft when there is one, else the saved record; and whether it is dirty. */
export function useTemplateDraft(id: string, saved: PersistedTemplate | undefined): { template: PersistedTemplate | undefined; dirty: boolean } {
  const [, bump] = useState(0)
  useEffect(() => subscribeDraft(id, () => bump((n) => n + 1)), [id])
  const draft = drafts.get(id)
  return draft === undefined ? { template: saved, dirty: false } : { template: draft.template, dirty: draft.dirty }
}
