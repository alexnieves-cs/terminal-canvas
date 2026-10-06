/**
 * The one selector for the attention queue (M437).
 *
 * `attention-queue.ts` is the pure list. This hook is how a surface gets it:
 * subscribed to the agent-state store (who is waiting, and every transition),
 * the live-session store (`subscribeLiveSessions`), and the decision inbox's
 * permission list (`useApprovals` — the same
 * requests the inbox builds from). The sentence is `panelState`'s word for
 * those facts, so the queue cannot grow a wording of its own.
 *
 * The pill, the dock badge, the Sessions count, the edge pips, the minimap
 * and the World read this. None of them counts the queue again. F3 wires
 * the pill and the dock; L-D lands the Sessions count in the host F3 adds.
 * This hook does not mount anything.
 *
 * The census is the caller's. The stores know a panel's state and not which
 * task it belongs to, and a hook cannot subscribe per id in a loop whose
 * length changes. Pass a stable list.
 */

import { useMemo, useSyncExternalStore } from 'react'
import { useApprovals } from '@renderer/chat/chat-store'
import { panelState, type StateInput } from '@renderer/panels/panel-state'
import { buildQueue, type AttentionInput, type AttentionSurface } from '@shared/attention-queue'
import type { AttentionItem } from '@shared/redesign-contracts'
import type { AgentState } from '@shared/types'
import { getAgentState, onAgentTransition, useAttentionIds } from './agent-state-store'
import * as liveSessionStore from './live-session-store'

export interface AttentionCensus {
  panelId: string
  surface: AttentionSurface
  taskId: string | null
  /** Epoch ms this panel's current fact became true. The caller owns the clock. */
  since: number
  /** The facts `panelState` reads. The queue's sentence is that function's word. */
  state: StateInput
  /** Used when the agent-state store has not heard this panel. */
  agent?: AgentState
  /** A shell blocked on a prompt. A terminal in `wants-you` is one either way. */
  shellPrompt?: boolean
  /** Set when the caller already knows the process failed. The status is also read. */
  failed?: boolean
  /** Host loss or a paused session. Not inferred: L-F is what knows. */
  recovery?: boolean
}

let revision = 0

/**
 * Agent transitions and any panel's cwd or command. The command is also
 * sampled into `liveKey` below, so a render that already happened still
 * sees the new line.
 */
function subscribe(onStoreChange: () => void): () => void {
  const bump = (): void => {
    revision += 1
    onStoreChange()
  }
  const offAgent = onAgentTransition(bump)
  const offLive = liveSessionStore.subscribeLiveSessions(bump)
  return () => {
    offAgent()
    offLive()
  }
}

function revisionOf(): number {
  return revision
}

function failedState(state: StateInput): boolean {
  const status = state.status
  if (state.kind === 'terminal') {
    if (status?.kind === 'exited') return status.code !== 0
    if (status?.kind === 'error') return true
  }
  if (state.kind === 'chat' && state.chat?.status === 'exited') {
    return typeof state.chat.exitCode === 'number' && state.chat.exitCode !== 0
  }
  if (state.kind === 'watcher' && state.watch?.status === 'exited') {
    return (state.watch.exitCode ?? 0) !== 0
  }
  return false
}

function toInput(panel: AttentionCensus, approvalId: string | undefined): AttentionInput {
  const agent = getAgentState(panel.panelId) ?? panel.agent
  // Read so a later live-session subscription has a fact to change. The
  // command is not a sentence: parsing it would be a second vocabulary.
  liveSessionStore.getLiveSession(panel.panelId)
  return {
    panelId: panel.panelId,
    taskId: panel.taskId,
    since: panel.since,
    sentence: panelState(panel.state, agent).word,
    surface: panel.surface,
    ...(agent === undefined ? {} : { agent }),
    ...(approvalId === undefined ? {} : { approvalId }),
    shellPrompt: panel.shellPrompt === true,
    failed: panel.failed === true || failedState(panel.state),
    recovery: panel.recovery === true
  }
}

/**
 * The queue, rebuilt when the attention set, an approval, or an agent
 * transition changes. `items.length` is the count. Do not derive another.
 */
export function useAttentionQueue(census: readonly AttentionCensus[]): readonly AttentionItem[] {
  const attention = useAttentionIds()
  const approvals = useApprovals()
  const rev = useSyncExternalStore(subscribe, revisionOf, revisionOf)
  const liveKey = census.map((panel) => liveSessionStore.getLiveSession(panel.panelId)?.currentCommand ?? '').join('\n')
  return useMemo(() => {
    const byPanel = new Map(approvals.map((row) => [row.id, row.requestId]))
    // `attention` and `liveKey` are the subscriptions. Reading them here
    // ties the memo to the stores even when the census object is stable.
    void attention.length
    void liveKey.length
    return buildQueue(census.map((panel) => toInput(panel, byPanel.get(panel.panelId))))
  }, [census, approvals, rev, attention, liveKey])
}
