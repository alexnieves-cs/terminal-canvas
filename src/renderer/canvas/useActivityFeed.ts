import { useEffect, useRef } from 'react'
import type { Panel } from '@renderer/panels/panels'
import { onAgentTransition } from '@renderer/session/agent-state-store'
import { lastAssistantText, onChatTurnEnd } from '@renderer/chat/chat-store'
import { agentTransitionActivity, pushOrchActivity } from '@renderer/orchestration/orchestration-activity'
import { railLabel } from '@renderer/shell/rail-rows'
import { outward } from '@shared/outward'

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
 *
 * The turn's line crosses `outward()` first: the answer was said to ONE
 * panel and this row shows it in the inspector, which is another reader —
 * the same gate the orchestration page's tail passes (`verify:verbs gate.2`
 * names every module that reads a chat's last answer for another reader).
 */
export function useActivityFeed(deps: { panels: readonly Panel[] }): void {
  const { panels } = deps
  const panelsRef = useRef(panels)
  panelsRef.current = panels
  useEffect(() => {
    const panelOf = (panelId: string): Panel | undefined => panelsRef.current.find((p) => p.rect.id === panelId)
    const titleOf = (panelId: string): string => {
      const panel = panelOf(panelId)
      return panel ? railLabel(panel, undefined) : panelId
    }
    const kindOf = (panelId: string): { panelKind: Panel['kind'] } | Record<string, never> => {
      const panel = panelOf(panelId)
      return panel ? { panelKind: panel.kind } : {}
    }
    const offState = onAgentTransition((panelId, state, prev) => {
      if (prev === state) return
      pushOrchActivity({ ...agentTransitionActivity(panelId, titleOf(panelId), state, prev, Date.now()), ...kindOf(panelId) })
    })
    const offTurn = onChatTurnEnd((id) => {
      const text = outward(lastAssistantText(id), `panel ${id}`).text.replace(/\s+/g, ' ').trim()
      const line = text.length > TURN_LINE_MAX ? `${text.slice(0, TURN_LINE_MAX - 1)}…` : text
      pushOrchActivity({ at: Date.now(), kind: 'agent', panelId: id, ...kindOf(id), title: titleOf(id), detail: line === '' ? 'finished a turn' : `finished a turn — ${line}`, tone: 'idle' })
    })
    // M318. A check run ENDING is activity too, and a failed one is the
    // feed's other intervention (its tone is `exited`, like a clean exit, so
    // the producer says so). One row per run: keyed by the run's end time.
    const ended = new Map<string, number>()
    const offWatch = typeof window.canvas?.watcher?.onState === 'function' ? window.canvas.watcher.onState((ev) => {
      if ((ev.status !== 'passed' && ev.status !== 'exited') || ev.endedAt === undefined || ended.get(ev.id) === ev.endedAt) return
      ended.set(ev.id, ev.endedAt)
      const panel = panelOf(ev.id)
      const title = panel !== undefined ? titleOf(ev.id) : ev.id.startsWith('combine-') ? 'combined tree' : 'check'
      const failed = ev.status !== 'passed'
      pushOrchActivity({
        at: ev.endedAt, kind: 'watcher', title, tone: failed ? 'exited' : 'idle',
        detail: failed ? `check failed${ev.exitCode === null || ev.exitCode === undefined ? '' : ` (exit ${ev.exitCode})`}` : 'check passed',
        ...(panel === undefined ? {} : { panelId: ev.id, panelKind: panel.kind }),
        ...(failed ? { intervene: true as const } : {})
      })
    }) : () => {}
    return () => { offState(); offTurn(); offWatch() }
  }, [])
}
