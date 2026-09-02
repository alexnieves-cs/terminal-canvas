import type { PanelStatus } from '@renderer/session/panel-session'
import type { AgentState } from '@shared/types'

/**
 * M63. THE ONE STATE VOCABULARY.
 *
 * Every surface that says what a panel is doing — the rail row, the frame's
 * pill, the card's state line, the summary and block tiers, the attention
 * popover, the status strip — reads its WORD and its TONE from here and from
 * nowhere else. Before M63 the same panel read `dormant` in the rail, `idle`
 * on its pill and `click to start` on its card, and the first screenshot
 * anyone took after 1.0 showed all three at once. A vocabulary spread across
 * four files drifts one word at a time and nothing notices, because each
 * file is locally consistent; `verify:rail state.2` reads the tree as text so
 * a fifth spelling cannot arrive quietly.
 *
 * Pure: no React, no DOM, plain-node checked in `verify:rail`. The word is
 * what the user reads; the tone is what the stylesheet colours, and it is a
 * CLOSED set so `[data-tone="…"]` can be the only rule block that names an
 * agent hue for a state.
 */

/** The display kind, `Panel['kind']` plus M27's `note` — see rail-rows.ts. */
export type StateKind = 'terminal' | 'review' | 'file' | 'note' | 'toolbox' | 'jira'

export type Tone = 'kind' | 'asleep' | 'none' | 'starting' | 'working' | 'needs-you' | 'idle' | 'exited'

export const TONES: readonly Tone[] = ['kind', 'asleep', 'none', 'starting', 'working', 'needs-you', 'idle', 'exited']

export interface StateInput {
  kind: StateKind
  status: PanelStatus | undefined
  /** A restored panel waiting for permission to start — outranks the status. */
  dormant: boolean
}

export interface PanelStateWord {
  word: string
  tone: Tone
}

/**
 * Tested in this order, and the order is the vocabulary's own rule:
 *
 *  1. A sessionless kind names its kind. `not started`, `exited 0` and
 *     `working` are sentences about a process it does not have (the missing
 *     Jira arm in an earlier version of the rail is the recorded defect).
 *  2. `asleep` outranks the status: a dormant panel's status is `idle`, and
 *     "not started" is true but useless — "asleep" is what tells the user the
 *     start control exists.
 *  3. Then the process: nothing yet, starting, an error, an exit.
 *  4. Then, for a RUNNING process, the agent's own state — the only case the
 *     detector's word applies. `wants-you` is spelled for a person.
 *
 * The exit template is a template rather than a truthiness test on purpose:
 * `code` is 0 for the most common exit there is.
 */
export function panelState(input: StateInput, agent: AgentState | undefined): PanelStateWord {
  if (input.kind !== 'terminal') return { word: input.kind, tone: 'kind' }
  if (input.dormant) return { word: 'asleep', tone: 'asleep' }
  const status = input.status
  if (status === undefined || status.kind === 'idle') return { word: 'not started', tone: 'none' }
  switch (status.kind) {
    case 'starting': return { word: 'starting', tone: 'starting' }
    case 'error': return { word: status.message, tone: 'exited' }
    case 'exited': return { word: `exited ${status.code}`, tone: 'exited' }
    case 'running':
      switch (agent) {
        case 'wants-you': return { word: 'needs you', tone: 'needs-you' }
        case 'busy': return { word: 'working', tone: 'working' }
        case 'idle': return { word: 'idle', tone: 'idle' }
        // `exited` as an agent state with a running status is the window
        // between the detector's terminal transition and the registry's
        // exit record — a few milliseconds, and the honest word for it is
        // the process's, which arrives next.
        case 'exited': return { word: 'exited', tone: 'exited' }
        case 'starting': return { word: 'starting', tone: 'starting' }
        // No agent word at all: a caller without a detector subscription
        // (the rail's precomputed tail, a check fixture). The process is
        // alive and that is all that is known.
        case undefined: return { word: 'running', tone: 'idle' }
      }
  }
}

/**
 * The word for an agent state on a LIVE process — what the attention popover
 * needs, since every row it lists is a running panel in `wants-you`. Routed
 * through panelState so the popover cannot spell its own word.
 */
export function agentWord(agent: AgentState): PanelStateWord {
  return panelState({ kind: 'terminal', status: { kind: 'running', pid: 0, command: '', cwd: '', reattached: false }, dormant: false }, agent)
}
