import type { PanelStatus } from '@renderer/session/panel-session'
import type { AgentState } from '@shared/types'
import { WORK_ITEM_STATES, type WorkItemState } from '@shared/work-items'

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
export type StateKind = 'terminal' | 'review' | 'file' | 'note' | 'toolbox' | 'jira' | 'github' | 'chat' | 'memory' | 'watcher' | 'browser' | 'work' | 'skill' | 'workflow'

export type Tone = 'kind' | 'asleep' | 'none' | 'starting' | 'working' | 'needs-you' | 'idle' | 'exited'

export const TONES: readonly Tone[] = ['kind', 'asleep', 'none', 'starting', 'working', 'needs-you', 'idle', 'exited']

export interface StateInput {
  kind: StateKind
  status: PanelStatus | undefined
  /** A restored panel waiting for permission to start — outranks the status. */
  dormant: boolean
  /**
   * M73. A chat panel's process facts, from the chat store's snapshot. Absent
   * for every other kind, and absent for a chat panel whose session main has
   * not answered for yet — which reads `not started`, the honest word.
   */
  chat?: ChatStateInput
  /**
   * M84. A watcher's process facts, from the watcher store's snapshot.
   * Absent for every other kind, and absent for a watcher main has not
   * answered for yet — which reads `not started`, the honest word.
   */
  watch?: WatchStateInput
  /**
   * M116. A work card's item state, from the board's record. Absent when
   * the record is gone (dropped from the list), which reads as the kind.
   */
  work?: { state: WorkItemState }
}

/** M84. What the vocabulary needs from a watcher's last run. */
export interface WatchStateInput {
  status: 'not-started' | 'running' | 'passed' | 'exited'
  exitCode?: number | null
  signal?: string | null
  /**
   * The trigger could not be armed — the reason belongs in the node's body.
   * (A run WAITING for the one in flight is deliberately not a field here:
   * the word is `working` either way, and a field the vocabulary never reads
   * is a present-vs-absent optional written at every copy site for nothing.)
   */
  disarmed?: boolean
}

/** M73. What the vocabulary needs from an agent session's snapshot. */
export interface ChatStateInput {
  status: 'not-started' | 'starting' | 'ready' | 'streaming' | 'exited' | 'disposed'
  /** Permission requests waiting for an answer. Outranks everything. */
  pending: number
  exitCode?: number | null
  /**
   * The transcript holds turns. With no process this is `asleep` — the word a
   * restored terminal uses for the same fact (it resumes on your gesture;
   * here the gesture is a send) — and never `not started`, which is only
   * honest for a conversation that has never had a turn. Amended after M73's
   * critic: a chat with a visible answer read `not started`.
   */
  hasHistory?: boolean
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
  // M73. A chat panel is a PROCESS node (brief principle 10), so it speaks
  // the process words, not its kind — and the same words a terminal running
  // the same agent speaks (principle 11). A pending permission is `needs you`
  // whatever the process is doing, because the process is waiting on the
  // answer; nothing else about the vocabulary is new.
  if (input.kind === 'chat') return chatState(input.chat)
  // M84. A watcher is a PROCESS node too, and its whole point is that a
  // person reads its pass or fail without opening it — so it speaks the
  // process words and no new one is invented for it.
  if (input.kind === 'watcher') return watchState(input.watch)
  // M116. A work card speaks its ITEM's state — the one kind whose word is
  // neither its kind nor a process's, because the card IS the board's row.
  if (input.kind === 'work') return workState(input.work)
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

/** needs-you first: the order the palette's `state:` query lists panels in (M64). */
export const STATE_PRIORITY: readonly string[] = ['needs you', 'working', 'idle', 'starting', 'running', 'exited', 'not started', 'asleep']

export function statePriority(word: string): number {
  const i = STATE_PRIORITY.findIndex((w) => word === w || word.startsWith(w + ' '))
  return i === -1 ? STATE_PRIORITY.length : i
}

/**
 * A watcher's last run, in the one vocabulary.
 *
 * `passed` is `idle` and a non-zero exit is `exited N` — the same two words a
 * terminal running the same command would show, which is what makes a green
 * or red watcher legible in the rail, the state edge, the minimap and the
 * far tiers with no code of their own. A SIGNAL is a failure: `exitCode` is
 * null for a signalled process, and a template that printed `exited null`
 * would be a state word nobody can act on.
 */
function watchState(watch: WatchStateInput | undefined): PanelStateWord {
  if (watch === undefined) return { word: 'not started', tone: 'none' }
  if (watch.disarmed === true) return { word: 'exited', tone: 'exited' }
  switch (watch.status) {
    case 'not-started': return { word: 'not started', tone: 'none' }
    case 'running': return { word: 'working', tone: 'working' }
    case 'passed': return { word: 'idle', tone: 'idle' }
    case 'exited':
      return watch.signal !== undefined && watch.signal !== null
        ? { word: `exited ${watch.signal}`, tone: 'exited' }
        : { word: `exited ${watch.exitCode ?? 0}`, tone: 'exited' }
  }
}

/**
 * M116. The item's state in the one vocabulary. The four words are the
 * record's own (`WORK_ITEM_STATES`), read by INDEX so a renamed state moves
 * here with it (`verify:rail state.2` bans the `'working'` literal outside
 * this file; the other three words are read by index here so a rename moves
 * them too); the tones are the existing four the states mean — a todo is a
 * document at rest (kind), a working lane works, a review is in flight
 * elsewhere (`starting`: amber is the attention union's, and a PR waiting on
 * someone else asks this user for nothing), a done item is idle — so no rule
 * and no token is new for the card. With no
 * record the card names its kind, like every document kind.
 */
const WORK_TONES: readonly Tone[] = ['kind', 'working', 'starting', 'idle']
function workState(work: { state: WorkItemState } | undefined): PanelStateWord {
  if (work === undefined) return { word: 'work', tone: 'kind' }
  const i = WORK_ITEM_STATES.indexOf(work.state)
  const word = WORK_ITEM_STATES[i], tone = WORK_TONES[i]
  return word === undefined || tone === undefined ? { word: 'work', tone: 'kind' } : { word, tone }
}

function chatState(chat: ChatStateInput | undefined): PanelStateWord {
  if (chat === undefined) return { word: 'not started', tone: 'none' }
  if (chat.pending > 0) return { word: 'needs you', tone: 'needs-you' }
  if ((chat.status === 'not-started' || chat.status === 'disposed') && chat.hasHistory === true) {
    return { word: 'asleep', tone: 'asleep' }
  }
  switch (chat.status) {
    case 'streaming': return { word: 'working', tone: 'working' }
    case 'starting': return { word: 'starting', tone: 'starting' }
    case 'ready': return { word: 'idle', tone: 'idle' }
    // `exited ${code}` as a template, never a truthiness test: 0 is the
    // common exit; a signal exit has a null code and names the signal's absence.
    case 'exited': return { word: typeof chat.exitCode === 'number' ? `exited ${chat.exitCode}` : 'exited', tone: 'exited' }
    default: return { word: 'not started', tone: 'none' }
  }
}

/**
 * M97. The auto chip's tone, in the one vocabulary: a live run works, a
 * finished one is idle, a stuck one needs you, a stopped one has exited.
 * Here rather than in the chat node because `verify:rail state.2` keeps
 * every state word inside this file.
 */
export function autoTone(state: 'running' | 'done' | 'stuck' | 'stopped'): Tone {
  switch (state) {
    case 'running': return 'working'
    case 'done': return 'idle'
    case 'stuck': return 'needs-you'
    case 'stopped': return 'exited'
  }
}
