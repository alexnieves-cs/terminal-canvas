/**
 * M361. `review-comment`: a comment pinned to a line of a task's diff.
 *
 * CROSS-AGENT REVIEW. One verb for every door. A person's door (the palette's
 * typed line) writes the person's comment; an agent's `tc plan` or a
 * workflow's action node writes a PROPOSAL (M360), attributed to the caller,
 * which the person keeps or discards on the task's review. So a second
 * reviewer can object on the line without ever speaking for the person: a
 * proposal is never sent in a follow-up and never counts as the person's
 * comment, and while unread it holds `verified` back.
 *
 * The panel names the TASK: a work card, the task's review, or any panel
 * that belongs to exactly one task (a review seat passes its own
 * `$TC_PANEL_ID`). Canvas owns the work items, so the write is its board
 * verb (`addReviewComment`), the way `reviewTask` delegates.
 *
 * One slice of `usePaletteActions` (see ./types.ts).
 */

import { parseCommentPlace } from '@shared/review-comments'
import type { PaletteActions } from '@renderer/palette/commands'
import type { ActionCtx } from './types'

export type ReviewCommentActions = Pick<PaletteActions, 'reviewComment'>

export function reviewCommentActions(ctx: ActionCtx): ReviewCommentActions {
  const { panelsRef, boardVerbsRef } = ctx
  return {
    reviewComment: (panelId, place, comment, origin = 'person', caller) => {
      const at = parseCommentPlace(place)
      if (at === null) return { kind: 'refused', reason: `${place} is not a place in the diff — write path:line, or path:line:old for a removed line` }
      if (comment.trim() === '') return { kind: 'refused', reason: 'write the comment after its place' }
      const add = boardVerbsRef.current?.addReviewComment
      if (add === undefined) return { kind: 'refused', reason: 'the canvas is not ready yet' }
      if (origin === 'person') return add(panelId, { ...at, body: comment })
      // Through a door: WHO proposes it, by the calling panel's own title, or
      // the workflow's word when no panel asked.
      const from = caller?.panelId === undefined ? undefined : panelsRef.current.find((p) => p.rect.id === caller.panelId)
      const label = from === undefined ? (caller?.panelId === undefined ? 'a workflow' : 'an agent') : (from.title ?? 'an agent')
      return add(panelId, { ...at, body: comment, proposedBy: { label, ...(caller?.panelId === undefined ? {} : { panelId: caller.panelId }) } })
    }
  }
}
