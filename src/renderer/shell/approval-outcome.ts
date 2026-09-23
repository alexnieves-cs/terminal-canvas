import { useSyncExternalStore } from 'react'

/**
 * #14. THE BEAT BETWEEN TWO DECISIONS. Every surface drops a request the
 * moment it is answered (chat-store's `markAnswered`, #16), and the queue
 * then opened the NEXT request in the same frame — so a person who pressed
 * Allow saw a different command where theirs had been, and could not tell
 * whether their press had landed or which request it had answered.
 *
 * An answer now leaves a short-lived outcome here: who asked, which tool,
 * and what was decided, in words. The queue shows it where the request was
 * and holds off opening the next one until it has passed. It is a
 * projection of the press, not of main's reply: `answerApproval` withdraws
 * it when the call fails, the same moment it unmarks the request, so the
 * acknowledgment never outlives an answer that did not happen.
 *
 * Module state rather than React state, for the reason chat-store's marks
 * are: the Dock, Orchestrate and the chat card each render the queue, and
 * one press must read the same in all three.
 */
export type ApprovalOutcomeKind = 'once' | 'session' | 'deny'

export interface ApprovalOutcome {
  requestId: string
  panelId: string
  agent: string
  toolName: string
  kind: ApprovalOutcomeKind
  at: number
}

/** Long enough to read one sentence, short enough that the next decision is not kept waiting. */
export const APPROVAL_ACK_MS = 1800

let outcomes: readonly ApprovalOutcome[] = []
const listeners = new Set<() => void>()
const emit = (): void => { for (const l of listeners) l() }

export function noteApprovalOutcome(o: Omit<ApprovalOutcome, 'at'>): void {
  const at = Date.now()
  outcomes = [...outcomes.filter((x) => x.requestId !== o.requestId), { ...o, at }]
  emit()
  setTimeout(() => {
    const before = outcomes.length
    outcomes = outcomes.filter((x) => !(x.requestId === o.requestId && x.at === at))
    if (outcomes.length !== before) emit()
  }, APPROVAL_ACK_MS)
}

/** The answer did not reach main: the request is back in the queue, so its outcome is not true. */
export function withdrawApprovalOutcome(requestId: string): void {
  const before = outcomes.length
  outcomes = outcomes.filter((x) => x.requestId !== requestId)
  if (outcomes.length !== before) emit()
}

const subscribe = (l: () => void): (() => void) => { listeners.add(l); return () => { listeners.delete(l) } }
const snapshot = (): readonly ApprovalOutcome[] => outcomes

export function useApprovalOutcomes(): readonly ApprovalOutcome[] {
  return useSyncExternalStore(subscribe, snapshot)
}

/** The acknowledgment's sentence — what was decided and what it means for the next call. */
export function approvalOutcomeWords(o: Pick<ApprovalOutcome, 'agent' | 'toolName' | 'kind'>): string {
  switch (o.kind) {
    case 'once': return `Allowed ${o.toolName} once for ${o.agent} — the next call asks again`
    case 'session': return `Allowed ${o.toolName} for ${o.agent} until this conversation closes`
    case 'deny': return `Denied ${o.toolName} — ${o.agent} was told`
  }
}
