/**
 * M301. WHAT THIS APP IS ENTITLED TO SAY ABOUT A SESSION.
 *
 * The failure this module exists to stop is silent by construction. A panel
 * is restored from `layout.json`; its agent is not running, because quitting
 * killed it; no state event has arrived, because there is no session to emit
 * one. Until M301 that panel read **idle** — `rosterState`'s fallback — which
 * is the word a LIVE agent waiting for you wears. Nothing was red, nothing
 * was missing, and the page said a thing that was not true.
 *
 * The rule, from the plan: *reconcile against real sessions before displaying
 * Running*, and a stored session that no longer exists reads as ended or
 * unknown, with when it was last seen. So the state a panel wears is decided
 * by TWO facts, never one:
 *
 * 1. **Is there a live session?** Main's answer, from the backend — the same
 *    list the orphan sweep asks, because it reports sessions this run never
 *    spawned. The renderer never infers this from its own panel record.
 * 2. **What did the runtime last say?** An agent state event. Absent is
 *    absent; it is not `idle`.
 *
 * `idle` therefore means "there is a session and it is waiting", which is
 * what every other surface has always meant by it. The new word `unknown`
 * means "this panel had a session and this app cannot see one now" — and it
 * carries WHEN it was last seen, because "unknown since some time" is the
 * kind of statement that makes a reader distrust the whole page.
 *
 * Pure: no DOM, no React, no electron. `verify:orchestration orch-reconcile.*`.
 */

/**
 * The standings a reconciled panel can be in. Deliberately NOT a superset of
 * `AgentState`: these are the app's claims about a session's existence, and
 * the runtime's words about a turn are a different fact that rides on top.
 */
export type SessionStanding =
  /** A live session, and the runtime has spoken for it. */
  | 'live'
  /** A live session that has not spoken yet. */
  | 'starting'
  /** There was a session; there is not one now, and we know when we last saw it. */
  | 'ended'
  /** There was a session; there is not one now, and we cannot say when. */
  | 'unknown'
  /** No session was ever recorded for this panel — nothing to reconcile. */
  | 'never-started'

/**
 * M301. How a session that is no longer running ENDED, when main can say.
 * The plan requires stopped, interrupted, disconnected, crashed and unknown
 * to stay distinguishable, and this is the only place that information
 * exists: the runtime's own snapshot. Absent is absent — an exit nobody
 * recorded is `unknown`, not "stopped cleanly".
 */
export interface SessionExit {
  code?: number | null
  signal?: string
}

export interface StandingInput {
  /** Does this panel run something at all? A note has no standing. */
  agentic: boolean
  /** Main's answer: is there a session for this panel right now? */
  liveSession: boolean
  /** Main's answer to HOW it ended, when the runtime still holds the record. */
  exit?: SessionExit
  /** The runtime's last word, if any has arrived this run. */
  agentState?: string
  /**
   * Did this panel EVER have a session — a persisted session id, a ledger row,
   * a baseline. Absent (false) with no live session is `never-started`, which
   * is a different fact from a session that is gone, and the two must not be
   * shown with one word.
   */
  hadSession: boolean
  /** When the record last saw this panel, epoch ms. Absent is what makes `unknown` unknown. */
  lastSeen?: number
}

export interface Standing {
  standing: SessionStanding
  /** The rest-layer word, in the product's vocabulary. */
  word: string
  /** One line for the contextual layer; never a diagnosis this app cannot support. */
  detail: string
  lastSeen?: number
}

/** `Mar 4 15:02` — absolute, because a relative age rots on screen while nothing re-reads it. */
function seenWords(at: number): string {
  const d = new Date(at)
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
}

/**
 * The reconciliation, in one place so every surface reaches the same verdict.
 *
 * The ORDER of these arms is the rule: the live-session question is asked
 * FIRST and a runtime word can never promote a panel with no session. An
 * implementation that started from `agentState` would keep saying `busy` for
 * a session that died mid-turn, because the last event it ever received said
 * busy and no event says "and then I was killed".
 */
export function standingOf(input: StandingInput): Standing {
  if (!input.agentic) return { standing: 'never-started', word: 'idle', detail: '' }
  if (input.liveSession) {
    const s = input.agentState
    /*
     * MEASURED, M301: a chat's process exits between turns and `--resume`
     * brings it back, so an ENDED PROCESS on a session the runtime still
     * holds is ordinary and must not be worded as a loss. The conversation
     * is there; only the process is not, and the sentence says exactly that.
     */
    const resumable = input.exit !== undefined
      ? 'no process is running for this right now; the conversation resumes on your next message'
      : ''
    /*
     * MEASURED: an idle chat's process has ended and the agent-state store
     * holds nothing for it, so "no word yet" and "starting" are NOT the same
     * thing. `starting` is only for a session with a process up that has not
     * reported; a session whose process has ended is idle and resumable, and
     * saying it is starting would be a claim that something is happening.
     */
    if (s === undefined && input.exit !== undefined) return { standing: 'live', word: 'idle', detail: resumable }
    if (s === undefined) return { standing: 'starting', word: 'starting', detail: 'the session is live and has not reported yet' }
    return { standing: 'live', word: s, detail: resumable }
  }
  if (!input.hadSession) {
    return { standing: 'never-started', word: 'not started', detail: 'this has not been run yet' }
  }
  /*
   * The runtime no longer holds this session, but it told us how its last
   * process ended before it forgot — so the app can say HOW rather than only
   * THAT it is gone. A signal and an exit code are different facts and are
   * worded differently: a session ended by a signal was stopped by something
   * outside itself, and a non-zero code is the process's own account.
   * Neither is called a crash — this app cannot tell a crash from a kill
   * from a clean stop it did not ask for.
   */
  if (input.exit !== undefined) {
    const { code, signal } = input.exit
    const how = signal !== undefined && signal !== null && signal !== ''
      ? `it was stopped by ${signal}`
      : code === 0 ? 'it ended on its own, exit 0'
        : typeof code === 'number' ? `it ended on its own, exit ${code}`
          : 'the runtime did not record how it ended'
    return {
      standing: 'ended',
      word: 'ended',
      detail: `no session is running for this — ${how}${input.lastSeen === undefined ? '' : `; the record last saw it ${seenWords(input.lastSeen)}`}`,
      ...(input.lastSeen === undefined ? {} : { lastSeen: input.lastSeen })
    }
  }
  if (input.lastSeen === undefined) {
    return {
      standing: 'unknown',
      word: 'unknown',
      // Deliberately not "stopped", "crashed" or "finished": this app cannot
      // tell those apart from here, and the plan forbids a confident
      // diagnosis where there is only silence.
      detail: 'this app cannot see a session for this, and the record does not say when it was last seen'
    }
  }
  return {
    standing: 'ended',
    word: 'ended',
    detail: `no session is running for this; the record last saw it ${seenWords(input.lastSeen)}`,
    lastSeen: input.lastSeen
  }
}

/** Silence is silence. The plan's words, in one place so no surface invents a deadlock. */
export const NO_RECENT_EVENTS = 'No recent events'

/**
 * Is this standing one the page may count as work in flight? `unknown` and
 * `ended` are NOT — a count that includes them is how "3 running" survives a
 * relaunch that killed all three.
 */
export function countsAsRunning(standing: SessionStanding): boolean {
  return standing === 'live' || standing === 'starting'
}
