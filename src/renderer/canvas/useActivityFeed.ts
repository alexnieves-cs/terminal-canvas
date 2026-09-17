import { useEffect, useRef } from 'react'
import type { Panel } from '@renderer/panels/panels'
import { onAgentTransition } from '@renderer/session/agent-state-store'
import { lastAssistantText, onChatTurnEnd } from '@renderer/chat/chat-store'
import { agentTransitionActivity, pushOrchActivity } from '@renderer/orchestration/orchestration-activity'
import { railLabel } from '@renderer/shell/rail-rows'

/** A finished turn's row carries the answer's first line, clipped. */
const TURN_LINE_MAX = 96

/**
 * M279. THE ACTIVITY FEED'S PRODUCER, at the canvas level.
 *
 * The ring buffer (`orchestration-activity.ts`) was fed from inside
 * OrchestrationView, so it filled only while that page was mounted — the
 * inspector's Activity tab would have opened on an empty feed for anyone who
 * never visited orchestration. Producing here, from Canvas's always-mounted
 * hook run, means the feed exists from the first agent transition.
 *
 * Two sources, both facts the app already has: every agent-state transition
 * (`onAgentTransition`, the same fan-out the handoff hook rides) and every
 * chat turn that ENDS (`onChatTurnEnd`), with the answer's first line — the
 * moment a person most often wants to see in a list without opening the
 * chat. Nothing here is a second store: it writes to the one buffer the
 * orchestration page already reads.
 *
 * `panels` through a ref, read at event time: the listener is registered
 * once, and a title is looked up when the event lands, never captured.
 */
export function useActivityFeed(deps: { panels: readonly Panel[] }): void {
  const { panels } = deps
  const panelsRef = useRef(panels)
  panelsRef.current = panels
  useEffect(() => {
    const titleOf = (panelId: string): string => {
      const panel = panelsRef.current.find((p) => p.rect.id === panelId)
      return panel ? railLabel(panel, undefined) : panelId
    }
    const offState = onAgentTransition((panelId, state, prev) => {
      if (prev === state) return
      pushOrchActivity(agentTransitionActivity(panelId, titleOf(panelId), state, prev, Date.now()))
    })
    const offTurn = onChatTurnEnd((id) => {
      const text = lastAssistantText(id).replace(/\s+/g, ' ').trim()
      const line = text.length > TURN_LINE_MAX ? `${text.slice(0, TURN_LINE_MAX - 1)}…` : text
      pushOrchActivity({ at: Date.now(), kind: 'agent', panelId: id, title: titleOf(id), detail: line === '' ? 'finished a turn' : `finished a turn — ${line}`, tone: 'idle' })
    })
    return () => { offState(); offTurn() }
  }, [])
}
