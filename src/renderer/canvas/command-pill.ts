/**
 * M249. The bottom command pill's pure half: what it says at rest, which chat
 * its input talks to, and which panels count as running agents. Plain data in,
 * plain data out, so verify:pill runs it in plain node; CommandPill.tsx owns
 * the DOM and calls the existing PaletteActions for everything it does.
 *
 * The pill is "act on this canvas now", never "find anything" — that is the
 * palette's, with its unbounded list. So nothing here searches or lists
 * commands; it decides one sentence and two targets.
 *
 * M264. Rest priority gains a task sentence when the related lens is on:
 * attention → task → running → selected → empty.
 */

import { isNeedsYouCount, needsYouCount } from '@shared/attention-words'
import type { AttentionItem } from '@shared/redesign-contracts'

export interface PillFacts {
  /** The attention set's size (the wants-you queue Cmd+J cycles). */
  attention: number
  /** Running agents — see runningAgents. */
  running: number
  /** Selected panels. */
  selected: number
  /**
   * M264. Work-item title when the related lens is lit. Absent / empty means
   * no task sentence — never invent a title, never print a zero statement.
   */
  taskTitle?: string
}

export type PillRest =
  | { kind: 'attention'; text: string }
  | { kind: 'task'; text: string }
  | { kind: 'running'; text: string }
  | { kind: 'selected'; text: string }
  | { kind: 'empty'; text: '' }

// A count that is not a positive finite integer is NONE, never printed: a
// "NaN agents running" or a "-1 selected" is a confident wrong answer, and a
// "0 …" is the zero-value statement the rest layer forbids (product-rules).
const count = (n: number): number => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0)

/**
 * ONE meaningful state, in priority order: someone waiting outranks the lit
 * task, which outranks work in flight, which outranks what the person is
 * holding. Nothing to say is an empty pill — a glyph alone — never "0 agents
 * running".
 */
export function pillRestState(facts: PillFacts): PillRest {
  const attention = count(facts.attention)
  // The queue is terminals AND chats: `panels`, from the one vocabulary
  // (shared/attention-words.ts), never `chats` over a waiting terminal.
  if (attention > 0) return { kind: 'attention', text: needsYouCount(attention) }
  const task = typeof facts.taskTitle === 'string' ? facts.taskTitle.trim() : ''
  if (task !== '') return { kind: 'task', text: task }
  const running = count(facts.running)
  if (running > 0) return { kind: 'running', text: running === 1 ? '1 session running' : `${running} sessions running` }
  const selected = count(facts.selected)
  if (selected > 0) return { kind: 'selected', text: `${selected} selected` }
  return { kind: 'empty', text: '' }
}

/**
 * M265. When the pill rest is already the attention sentence, do not also
 * `say()` / canvas-feedback a restatement of the same queue fact. The polite
 * live region may still name *which* panel arrived; OS notifications when
 * backgrounded stay. Returns false when the in-app queue-count toast should
 * be suppressed.
 */
export function shouldAnnounceAttentionQueue(restKind: PillRest['kind']): boolean {
  return restKind !== 'attention'
}

/** True when `text` is a queue-count restatement the pill already owns. */
export function isAttentionQueueRestatement(text: string): boolean {
  return isNeedsYouCount(text)
}

/**
 * Daily loop 4.3. The pill teaches Cmd+J ONCE: the first time the attention
 * sentence is at rest, it carries the key beside it; once the person has seen
 * it there and the queue has emptied (they dealt with it, by whatever route),
 * it never shows again. A hint that reappears on every arrival is chrome the
 * person learns to ignore. Text only — the pill never takes the keyboard to
 * teach (M249's contract): the terminal keeps focus.
 */
export function showJumpHint(taught: boolean, restKind: PillRest['kind']): boolean {
  return !taught && restKind === 'attention'
}

/** Whether this render retires the hint: it has been shown, and the queue is empty. */
export function retiresJumpHint(shown: boolean, restKind: PillRest['kind']): boolean {
  return shown && restKind !== 'attention'
}

export interface OrchestratorCandidate {
  id: string
  kind: string
  /** `chat.supervisor === true`. */
  supervisor?: boolean
  /** `chat.orchestrator !== undefined` (its prompt is not needed here). */
  orchestrator?: boolean
}

/**
 * The chat the pill's input sends to: the first SUPERVISOR chat in canvas
 * order, else the first ORCHESTRATOR chat, else none. A supervisor wins even
 * when an orchestrator sits earlier: the supervisor is the canvas's own
 * (M81 — "the supervisor of a Terminal Canvas workspace"), an orchestrator
 * leads one workflow's workers. `null` is the pill's third state and it is an
 * affordance, not an error: the first send creates a supervisor.
 */
export function orchestratorTarget(panels: readonly OrchestratorCandidate[]): string | null {
  const chats = panels.filter((p) => p.kind === 'chat')
  return chats.find((p) => p.supervisor === true)?.id ?? chats.find((p) => p.orchestrator === true)?.id ?? null
}

export interface RunningCandidate {
  id: string
  kind: string
  /** A chat's session status (AgentSessionStatus). */
  chatStatus?: string
  /** A terminal started AS an agent (`spec.agent` set). */
  agent?: boolean
  /** A terminal's agent state (AgentState). */
  agentState?: string
}

/**
 * Panels that are agents doing work now, in canvas order: a conversation that
 * is starting or streaming, and a terminal started as an agent whose state is
 * busy. A busy SHELL is a process, not an agent — counting it would put
 * "3 agents running" over a canvas of builds — and a ready chat or an idle
 * agent is waiting, not running.
 */
export function runningAgents(panels: readonly RunningCandidate[]): string[] {
  return panels.filter((p) =>
    (p.kind === 'chat' && (p.chatStatus === 'streaming' || p.chatStatus === 'starting')) ||
    (p.kind === 'terminal' && p.agent === true && p.agentState === 'busy')
  ).map((p) => p.id)
}

/**
 * Whether the pill's input holds the keyboard. Composed into Canvas's
 * shouldIgnoreKeys: Cmd+V/C/Z are MENU accelerators, so without this a paste
 * aimed at the pill lands in the focused terminal and Cmd+Z runs the canvas
 * undo — which can dispose a panel — behind a text field. The same predicate
 * checklistFocused and skillEditorFocused are.
 */
export function pillFocused(): boolean {
  if (typeof document === 'undefined') return false
  const active = document.activeElement
  return active !== null && active.closest('[data-command-pill-input]') !== null
}

/**
 * M438. F2 owns the real queue (`useAttentionQueue` in session/). This stub
 * keeps the import sites — the pill, the dock badge, the Sessions count —
 * on one function so that lane's check can require them without a second
 * counter. `ATTENTION_QUEUE_WIRED` is false until the rebase swaps this for
 * the real hook; until then the pill's existing rest sentence stays.
 */
export const ATTENTION_QUEUE_WIRED = false

export function useAttentionQueue(): readonly AttentionItem[] {
  return []
}

/** Rest layer: a missing or non-positive count is silence, never "0 sessions". */
export function sessionCountLabel(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return ''
  const k = Math.floor(n)
  return k === 1 ? '1 session' : `${k} sessions`
}

/** The Sessions segment's badge. Null is "don't draw it" — a zero badge is a zero-value statement. */
export function sessionsBadgeLabel(n: number): string | null {
  if (!Number.isFinite(n) || n <= 0) return null
  return String(Math.floor(n))
}

/**
 * The pill's attention line (mockup 04). Queue order, not a re-sort: the
 * first item's sentence, then Go and New. `pillRestState` keeps its own
 * wording ("panels") so the existing pill checks stay on that sentence;
 * this line is the redesign's, and it is empty when nothing is waiting.
 */
export function attentionPillLine(items: readonly { sentence: string }[] | null | undefined): string {
  if (items == null || items.length === 0) return ''
  const n = items.length
  const count = n === 1 ? '1 agent needs you' : `${n} agents need you`
  const sentence = (items[0]?.sentence ?? '').trim()
  const parts = [count]
  if (sentence !== '') parts.push(sentence)
  parts.push('Go ⌘J', '+ New ⌘N')
  return parts.join(' · ')
}
