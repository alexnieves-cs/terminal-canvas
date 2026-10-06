/**
 * Round 8. ONE-SHOT OUTCOMES, AND ONLY THOSE — the delivery half.
 *
 * THE LINE THIS FILE EXISTS TO HOLD. This app already has a complete,
 * carefully built system for ONGOING attention — `agent-state-store`'s
 * `wants-you` set, the dock's bell and count, the panel's amber ring, the
 * landing glow, the command pill's rest line and one polite live region. That
 * system is about STATE: a thing is true now, it stays true until somebody
 * deals with it, and every one of those surfaces is a view of the same set.
 *
 * A toast is the opposite shape. It is about an EVENT: a thing happened once,
 * it is already over, and nothing about the app is different for having told
 * you. The two must not be confused, and the confusion has a direction —
 * toasting state. A toast that says "3 chats need you" is a five-second
 * window onto a fact that is still true afterwards, which trains a person to
 * treat the real, persistent surfaces as decoration.
 *
 * WHAT WAS ACTUALLY MISSING. One-shot outcomes had nowhere to go:
 *   - an export wrote its file and told only the CONSOLE (`[export] ...`),
 *     which is to say it told nobody;
 *   - a saved credential said nothing at all, on the one path where the thing
 *     stored is a secret that cannot be read back to check;
 *   - `say()` opened the entire command palette to show one sentence, so
 *     "copied" cost the person their canvas and a keystroke to dismiss.
 *
 * The DECISION lives in `toast-decision.ts` and is pure; this file is the thin
 * part that calls sonner.
 */
import { toast } from 'sonner'
import { toastDecision, TOAST_MS, type ToastRequest, type ToastDecision } from './toast-decision'
import type { PillRest } from '../canvas/command-pill'
import { engageFocus } from '../world/world-select'
import {
  approvalToast, discardReady, requestFullDiff, subscribeApproved, type ApprovedEvent
} from '../world/world-flight'

export { toastDecision, TOAST_MS } from './toast-decision'
export type { ToastOutcome, ToastRequest, ToastDecision } from './toast-decision'

/** The one door. Everything that wants to report a finished outcome comes through here. */
export function notify (request: ToastRequest, restKind?: PillRest['kind']): ToastDecision {
  const decision = toastDecision(request, restKind)
  if (decision.kind !== 'show') return decision
  const options = {
    duration: TOAST_MS[decision.outcome],
    ...(decision.detail === undefined ? {} : { description: decision.detail })
  }
  // Three calls rather than one with a variant prop, because sonner gives each
  // its own role and icon; `refused` takes the WARNING arm, never the error
  // one — see the note on ToastOutcome.
  if (decision.outcome === 'failed') toast.error(decision.sentence, options)
  else if (decision.outcome === 'refused') toast.warning(decision.sentence, options)
  else toast.success(decision.sentence, options)
  return decision
}

/**
 * D9. The approval has already been sent. Undo is the action only when review
 * discard can revert that panel; otherwise the action is View diff. Nothing
 * here delays the send, and nothing un-tells an agent that already received y.
 */
export function notifyApproved (event: ApprovedEvent): void {
  const decision = approvalToast(event)
  const gate = toastDecision({ sentence: decision.sentence })
  if (gate.kind !== 'show') return
  const action = decision.undo
    ? { label: 'Undo', onClick: () => undoApproved(event) }
    : { label: 'View diff', onClick: () => viewApproved(event) }
  toast.success(gate.sentence, { duration: TOAST_MS.done, action })
}

function undoApproved (event: ApprovedEvent): void {
  const offer = event.discard
  if (!discardReady(offer)) return
  void window.canvas.review.discard({
    root: offer.root,
    baseline: offer.baseline,
    subjectId: offer.subjectId,
    paths: [...offer.paths]
  })
}

function viewApproved (event: ApprovedEvent): void {
  engageFocus(event.panelId)
  requestFullDiff(event.panelId)
}

// The world emits; this file is the only sonner caller. Subscribing here keeps
// the scene off the shell import `world.ctx.door.1` forbids.
subscribeApproved((event) => { notifyApproved(event) })

/** Convenience for the common pair, so a caller never has to remember the arm names. */
export const notifyDone = (sentence: string, detail?: string): ToastDecision => notify({ sentence, outcome: 'done', ...(detail === undefined ? {} : { detail }) })
export const notifyRefused = (sentence: string, detail?: string): ToastDecision => notify({ sentence, outcome: 'refused', ...(detail === undefined ? {} : { detail }) })
export const notifyFailed = (sentence: string, detail?: string): ToastDecision => notify({ sentence, outcome: 'failed', ...(detail === undefined ? {} : { detail }) })
