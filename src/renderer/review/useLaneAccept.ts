import { useState } from 'react'
import { laneMergeOutcome, laneMergePlanSentence, type LaneMergeResult } from '@shared/lane-merge'
import type { ReviewTaskContext } from './ReviewNode'

/**
 * M315 → M326. ACCEPT — plan (a dry run that refuses by name), confirm, merge.
 *
 * Lifted out of ReviewNode so the task's focus view offers the SAME Accept
 * the review node does, with the same three gates: a person must have marked
 * the CURRENT changes reviewed (what lands is what they read), the plan is
 * shown before anything is merged, and the merge names the head the plan
 * read (`expectHead`), so a lane that moved between the two is refused.
 * One author of the flow, two surfaces reading it.
 */
export interface AcceptUi {
  /** Why Accept cannot run now, or null when it can. */
  blocked: string | null
  /** `null` at rest; the plan sentence while armed. */
  armed: string | null
  busy: boolean
  outcome: string | null
  onArm: () => void
  onConfirm: () => void
  onCancel: () => void
}

export function useLaneAccept(task: ReviewTaskContext | undefined, readOnly: boolean, onMerged: () => void): AcceptUi | null {
  const [plan, setPlan] = useState<Extract<LaneMergeResult, { kind: 'ready' }> | null>(null)
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<string | null>(null)
  if (task === undefined || task.onAccepted === undefined) return null
  return {
    blocked: readOnly ? 'leave merged view to act on this review'
      : task.handoff.state === 'accepted' ? task.handoff.detail
      : task.handoff.standing !== 'current' ? 'mark the current changes reviewed first — Accept merges what you read'
      : null,
    armed: plan === null ? null : laneMergePlanSentence(plan),
    busy,
    outcome,
    onArm: () => {
      setBusy(true)
      setOutcome(null)
      void window.canvas.lane.merge({ lane: task.lanePath, title: task.title, dryRun: true })
        .then((r) => { setBusy(false); if (r.kind === 'ready') setPlan(r); else setOutcome(laneMergeOutcome(r)) },
          (e: unknown) => { setBusy(false); setOutcome(`could not read the lane — ${String(e)}`) })
    },
    onConfirm: () => {
      if (plan === null) return
      const armed = plan
      setBusy(true)
      // expectHead: the lane must still be at the commit the plan named.
      void window.canvas.lane.merge({ lane: task.lanePath, title: task.title, expectHead: armed.head })
        .then((r) => {
          setBusy(false)
          setPlan(null)
          setOutcome(laneMergeOutcome(r))
          if (r.kind === 'merged') task.onAccepted?.(task.itemId, r)
          onMerged()
          task.onRefresh()
        }, (e: unknown) => { setBusy(false); setPlan(null); setOutcome(`nothing was merged — ${String(e)}`) })
    },
    onCancel: () => setPlan(null)
  }
}
