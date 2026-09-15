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
  related?: { itemId: string; title: string; memberCount: number }
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
  related?: { itemId: string; title: string; memberCount: number }
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
