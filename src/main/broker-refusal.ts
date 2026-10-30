import { NOT_CONNECTED_CODE } from '../shared/credential-schema'

/**
 * How a broker refusal is sorted into a caller's arms, in ONE place. Before
 * M615 the GitHub client, the cloud lanes and the publisher each carried a
 * copy, and they drifted: the client's copy never learned M255's `not-asked`,
 * so a write nobody was asked about came back to the board as `unavailable`
 * ("try again later") instead of `refused` ("nobody said yes"). A new
 * refusal code is added here, and every caller sorts it the same way.
 *
 * A leaf module on purpose — no broker, no store — so a suite that bundles a
 * single client (verify:github, verify:cloud) does not pull the broker in.
 */
export const NOT_GRANTED_CODE = 'not-granted'
export const NOT_ANSWERED_CODE = 'not-answered'
/**
 * M255. A write nobody was asked about: no teammate whose card could ask,
 * and no person who confirmed it in main. Before M255 such a write simply
 * went out — a terminal, a workflow's chat or a bare `tc api` could POST.
 */
export const NOT_ASKED_CODE = 'not-asked'

/** The codes that mean a person (or a teammate's grant) did not say yes. */
const REFUSED_CODES: ReadonlySet<string> = new Set([NOT_ASKED_CODE, NOT_ANSWERED_CODE, NOT_GRANTED_CODE])

export type SortedRefusal = { kind: 'no-credential' | 'refused' | 'unavailable'; reason: string }

/** Sorted by CODE, never by the sentence: the sentence is the broker's and may be reworded. */
export function sortRefusal(answer: { reason: string; code?: string }): SortedRefusal {
  if (answer.code === NOT_CONNECTED_CODE) return { kind: 'no-credential', reason: answer.reason }
  if (answer.code !== undefined && REFUSED_CODES.has(answer.code)) return { kind: 'refused', reason: answer.reason }
  return { kind: 'unavailable', reason: answer.reason }
}

/** GitHub's own sentence (`{"message": …}`), when its body carries one. */
export function githubMessage(body: string): string | null {
  try { const m = (JSON.parse(body) as { message?: unknown }).message; return typeof m === 'string' ? m : null } catch { return null }
}

/** ` — <GitHub's sentence>`, or nothing: the tail every "GitHub answered N" line takes. */
export const githubSuffix = (body: string): string => {
  const m = githubMessage(body)
  return m === null ? '' : ` — ${m}`
}
