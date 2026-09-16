/**
 * Round 8. WHETHER A SENTENCE BECOMES A TOAST — the pure half.
 *
 * Split out of `toast.ts` for the reason every pure layer in this repo is
 * split out: the decision can then be checked without the library, the DOM or
 * a canvas, in the cheap plain-node tier (`verify:toast`). `toast.ts` imports
 * sonner; nothing here does, and nothing here may.
 *
 * THE RULE IT ENFORCES, once, so there is one table and not two: a toast
 * reports an EVENT that is over. Anything still true after the toast has gone
 * belongs to the attention system — the `wants-you` set, the dock's count,
 * the panel's ring, the command pill's rest line — and restating that queue
 * here is forbidden by docs/product-rules.md. `isAttentionQueueRestatement`
 * is that rule's executable form and is imported rather than re-expressed.
 */
import { isAttentionQueueRestatement } from '../canvas/command-pill'
import type { PillRest } from '../canvas/command-pill'

/**
 * What a one-shot outcome can be. Three, not two: a refusal is not a failure.
 *
 * `done` — it happened. `refused` — the app declined, by a rule, and the
 * sentence names the rule; nothing is broken and there is nothing to retry.
 * `failed` — it was supposed to work and did not.
 *
 * Collapsing `refused` into `failed` is the mistake worth naming: "a built-in
 * workflow saves as a copy" is the app working correctly, and painting it in
 * the error colour tells a person to go looking for a bug.
 */
export type ToastOutcome = 'done' | 'refused' | 'failed'

export interface ToastRequest {
  sentence: string
  outcome?: ToastOutcome
  /** A longer second line: a path, a count, a reason. Never repeats the sentence. */
  detail?: string
}

export type ToastDecision =
  | { kind: 'show'; outcome: ToastOutcome; sentence: string; detail?: string }
  | { kind: 'suppressed'; why: 'attention-restatement' | 'empty' }

/**
 * Whether this sentence should become a toast, and as what.
 *
 * `restKind` is the command pill's current rest state. It is a parameter
 * rather than a read, so this stays pure — and so the suppression can be
 * checked against every arm without standing up a canvas.
 */
export function toastDecision (request: ToastRequest, restKind?: PillRest['kind']): ToastDecision {
  const sentence = request.sentence.trim()
  // An empty toast is a rectangle that appears, says nothing and leaves. It
  // is worse than silence, because the person looks away from their work to
  // read it.
  if (sentence === '') return { kind: 'suppressed', why: 'empty' }
  // THE ATTENTION RULE, both halves. The sentence itself may be a queue-count
  // restatement wherever it came from; and when the pill is ALREADY resting
  // on the attention line, the same fact is on screen and stays on screen.
  if (isAttentionQueueRestatement(sentence)) return { kind: 'suppressed', why: 'attention-restatement' }
  if (restKind === 'attention' && /needs? you\b/i.test(sentence)) return { kind: 'suppressed', why: 'attention-restatement' }
  return {
    kind: 'show',
    outcome: request.outcome ?? 'done',
    sentence,
    ...(request.detail !== undefined && request.detail.trim() !== '' ? { detail: request.detail.trim() } : {})
  }
}

/**
 * How long each outcome stands.
 *
 * A refusal and a failure stay longer than a success on purpose: a success is
 * confirming something the person just did and already expected, while the
 * other two are telling them something they did not know and may need to read
 * twice. `failed` is longest because it is the only one that may require them
 * to do something about it.
 */
export const TOAST_MS: Readonly<Record<ToastOutcome, number>> = {
  done: 3200,
  refused: 5000,
  failed: 7000
}

