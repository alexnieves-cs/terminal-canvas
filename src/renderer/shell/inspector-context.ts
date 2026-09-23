import type { AgentState } from '@shared/types'
import { WORK_ITEM_STATES, type WorkItemState } from '@shared/work-items'
import type { Panel } from '@renderer/panels/panels'
import { isChatPanel, isTerminalPanel, isWorkPanel } from '@renderer/panels/panels'

const WORK_TODO = WORK_ITEM_STATES[0]
const WORK_WORKING = WORK_ITEM_STATES[1]
const WORK_REVIEW = WORK_ITEM_STATES[2]
const WORK_DONE = WORK_ITEM_STATES[3]

/**
 * M270 (D10). Inspector CONTEXTUAL LAYER — next action, blocker, related
 * work. Configuration stays on Detail; logs and metrics stay in deep detail.
 *
 * Derived from facts the canvas already holds. An absent fact is omitted,
 * never a zero-value sentence.
 */

export interface InspectorContextBand {
  nextAction?: string
  blocker?: string
  related?: { itemId: string; title: string; memberCount: number; chain?: TaskChainStep[] }
}

/**
 * M310. THE FLAGSHIP FLOW, AS ONE STRIP — issue → conversation → preview →
 * review → checks → pull request, for whichever panel of the task is
 * selected. Each step is present (a panel to go to, a link to open) or
 * ABSENT with the words for what would make it — so the strip is also the
 * flow's next step, and a missing review reads as "not opened yet" rather
 * than as a flow that has no review.
 *
 * Built from the task's membership (M203's reasons) and the card's own
 * record; a panel's KIND decides its step, the membership decides that it
 * belongs. Pure.
 */
export type TaskChainStepKind = 'issue' | 'conversation' | 'preview' | 'review' | 'checks' | 'pr'

export interface TaskChainStep {
  step: TaskChainStepKind
  label: string
  /** Where the step is, when it exists. */
  panelIds: string[]
  url?: string
  present: boolean
}

export function taskChain(input: {
  item: { key?: string; url?: string; source: string; panelId?: string; pr?: { number: number; url: string } }
  members: readonly { panelId: string; kind: string }[]
}): TaskChainStep[] {
  const of = (kind: string): string[] => input.members.filter((m) => m.kind === kind).map((m) => m.panelId)
  const chat = input.item.panelId !== undefined && input.members.some((m) => m.panelId === input.item.panelId) ? [input.item.panelId] : of('chat')
  const previews = of('browser')
  const reviews = of('review')
  const checks = of('watcher')
  return [
    input.item.source === 'typed'
      ? { step: 'issue', label: 'typed task — no issue', panelIds: [], present: false }
      : { step: 'issue', label: input.item.key ?? 'issue', panelIds: [], ...(input.item.url === undefined ? {} : { url: input.item.url }), present: input.item.url !== undefined },
    { step: 'conversation', label: chat.length > 0 ? 'conversation' : 'no conversation — start work', panelIds: chat, present: chat.length > 0 },
    { step: 'preview', label: previews.length > 0 ? `preview${previews.length > 1 ? ` ×${previews.length}` : ''}` : 'no preview', panelIds: previews, present: previews.length > 0 },
    { step: 'review', label: reviews.length > 0 ? 'review' : 'not reviewed on the canvas', panelIds: reviews, present: reviews.length > 0 },
    { step: 'checks', label: checks.length > 0 ? `checks${checks.length > 1 ? ` ×${checks.length}` : ''}` : 'no checks — run them from the review', panelIds: checks, present: checks.length > 0 },
    input.item.pr !== undefined
      ? { step: 'pr', label: `PR #${input.item.pr.number}`, panelIds: [], url: input.item.pr.url, present: true }
      : { step: 'pr', label: input.item.source === 'github' ? 'no pull request yet' : 'no pull request (not a GitHub task)', panelIds: [], present: false }
  ]
}

export interface InspectorContextInput {
  panel: Pick<Panel, 'kind' | 'rect'>
  /** Pending tool name when a chat is waiting for Allow/Deny. */
  approvalTool?: string
  agentState?: AgentState
  restartable?: boolean
  workItem?: { id: string; title: string; state: WorkItemState; note?: string }
  execution?: { detail: string; blocker?: { kind: string; subject: string } }
  handoff?: { actionLabel: string; detail: string; blocker?: { kind: string; subject: string } }
  related?: { itemId: string; title: string; memberCount: number; chain?: TaskChainStep[] }
}

/**
 * Which inspector PRIMARY verbs apply to this object. Layout verbs (lock,
 * pin, fill, rename, link, close) stay in the overflow — they always apply
 * as layout. Restart and Save-as-preset apply only to a terminal; Allow/Deny
 * only to a chat with a pending request.
 */
export function inspectorPrimaryApplies(input: {
  kind: Panel['kind']
  restartable?: boolean
  approvalPending?: boolean
}): { restart: boolean; savePreset: boolean; allowDeny: boolean } {
  const terminal = input.kind === 'terminal'
  return {
    restart: terminal,
    savePreset: terminal,
    allowDeny: input.kind === 'chat' && input.approvalPending === true
  }
}

export function buildInspectorContext(input: InspectorContextInput): InspectorContextBand {
  const { panel, approvalTool, agentState, workItem, execution, handoff, related } = input
  let nextAction: string | undefined
  if (approvalTool !== undefined && approvalTool !== '') {
    nextAction = `Allow or deny ${approvalTool}`
  } else if (agentState === 'wants-you') {
    nextAction = 'the agent is waiting — open it and answer'
  } else if (handoff !== undefined && handoff.actionLabel.trim() !== '') {
    nextAction = handoff.actionLabel
  } else if (isWorkPanel(panel as Panel) && workItem !== undefined) {
    if (workItem.state === WORK_REVIEW) nextAction = 'review the lane changes'
    else if (workItem.state === WORK_TODO) nextAction = 'start work when you are ready'
    else if (workItem.state === WORK_WORKING) nextAction = 'open the lane and continue'
    else if (workItem.state === WORK_DONE) nextAction = 'review the retained evidence before closing history'
  } else if (isTerminalPanel(panel as Panel) && input.restartable !== true) {
    nextAction = 'start this panel from the rail when you need it'
  } else if (isChatPanel(panel as Panel) && agentState === 'busy') {
    nextAction = 'interrupt from Orchestration or the chat if you need to stop it'
  }

  let blocker: string | undefined
  if (execution?.blocker !== undefined) blocker = execution.detail
  else if (handoff?.blocker !== undefined) blocker = handoff.detail
  else if (workItem?.note !== undefined && workItem.note.trim() !== '') blocker = workItem.note.trim()

  return {
    ...(nextAction !== undefined ? { nextAction } : {}),
    ...(blocker !== undefined ? { blocker } : {}),
    ...(related !== undefined ? { related } : {})
  }
}
