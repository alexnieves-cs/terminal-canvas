import type { CSSProperties, JSX } from 'react'
import { useChat } from '@renderer/chat/chat-store'
import { shellControl } from '@renderer/shell/shell-control'
import type { Point } from './viewport'
import { firstTaskHint, firstTaskRail, flagshipGuide, type FlagshipGuideFacts } from './hints'

/**
 * The first start's one hint, reading the new conversation's live state so the
 * sentence changes as the agent does (starting → working → needs your input →
 * answered). Outside .world, like the launcher, so it never scales with the
 * camera — but ATTACHED to its conversation: `anchor` is the panel's
 * bottom-centre in screen space, so the hint rides a pan and reads as the
 * panel's own caption rather than a toast about somewhere else. Clamped into
 * the canvas by CSS (`min`/`clamp`), so a panel scrolled off-screen still has
 * its hint at the nearest edge.
 *
 * M310. With the task's facts it is the FLAGSHIP GUIDE: a five-step rail
 * (starting → working → ready to review → checks → pull request) read off the
 * task's own state, and the one verb that moves it on — which always opens the
 * task's review, where checks run and the PR opens. Without them it is the
 * conversation's three-step rail (starting → working → answered).
 */
export function FirstTaskHint({ panelId, sent, onDismiss, facts, onReview, anchor }: {
  panelId: string
  sent: boolean
  onDismiss: () => void
  facts?: Omit<FlagshipGuideFacts, 'status' | 'turns' | 'sent' | 'needsInput'>
  onReview?: () => void
  anchor?: Point
}): JSX.Element | null {
  const chat = useChat(panelId)
  const status = chat.snapshot?.status
  const needsInput = (chat.snapshot?.pending.length ?? 0) > 0
  // The hint's own state word, for the tone rule and the checks: a waiting
  // agent is `needs-input` whatever the session's status says (it streams).
  const stateWord = needsInput ? 'needs-input' : status ?? 'starting'
  // A 12px gap under the panel; the horizontal clamp keeps a 560px-max hint
  // (centred on its anchor by `translate`) inside the host, and the vertical
  // one keeps it above the host's foot when the panel runs off the bottom.
  const style: CSSProperties | undefined = anchor === undefined ? undefined : {
    left: `clamp(min(296px, 50%), ${Math.round(anchor.x)}px, max(calc(100% - 296px), 50%))`,
    top: `clamp(48px, ${Math.round(anchor.y + 12)}px, calc(100% - 132px))`,
    bottom: 'auto'
  }
  const attached = anchor === undefined ? undefined : ''
  const rail = (steps: { step: string; label: string; state: 'done' | 'current' | 'todo' }[], label: string): JSX.Element => (
    <ol className="flagship__steps" aria-label={label}>
      {steps.map((s) => <li key={s.step} className="flagship__step" data-flagship-state={s.state} data-flagship-needs={s.state === 'current' && needsInput ? '' : undefined}>{s.label}</li>)}
    </ol>
  )
  if (facts === undefined) {
    const text = firstTaskHint(status, chat.turns.length, sent, needsInput)
    const steps = firstTaskRail(status, chat.turns.length, sent, needsInput)
    if (text === null || steps === null) return null
    return (
      <div className="first-task-hint first-task-hint--guide" data-first-task-hint={stateWord} data-first-task-attached={attached} style={style} role="status" aria-live="polite">
        {rail(steps, 'Your first conversation, step by step')}
        <span>{text}</span>
        <button type="button" className="pf__verb pf__verb--word" data-first-task-hint-dismiss title="Hide this hint" {...shellControl(onDismiss)}>Got it</button>
      </div>
    )
  }
  const guide = flagshipGuide({ ...facts, status, turns: chat.turns.length, sent, needsInput })
  if (guide === null) return null
  const current = guide.steps.find((s) => s.state === 'current')?.step ?? 'done'
  return (
    <div className="first-task-hint first-task-hint--guide" data-first-task-hint={stateWord} data-flagship-step={current} data-first-task-attached={attached} style={style} role="status" aria-live="polite">
      {rail(guide.steps, 'Your first task, step by step')}
      <span>{guide.sentence}</span>
      {guide.action !== undefined && onReview !== undefined && (
        <button type="button" className="pf__verb pf__verb--word flagship__go" data-flagship-action title="Open this task's review" {...shellControl(onReview)}>{guide.action}</button>
      )}
      <button type="button" className="pf__verb pf__verb--word" data-first-task-hint-dismiss title="Hide this hint" {...shellControl(onDismiss)}>Got it</button>
    </div>
  )
}
