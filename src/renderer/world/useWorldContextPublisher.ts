import { useEffect, useState } from 'react'
import { getChat } from '@renderer/chat/chat-store'
import { answerRequest } from '@renderer/chat/ChatConversation'
import { edgeFiredAt } from '@renderer/canvas/useEdgeActivity'
import { isChatPanel, type Panel } from '@renderer/panels/panels'
import type { PendingApproval } from '@renderer/shell/rail-sections'
import { latestRoster, onRoster } from '@renderer/presence/presence-store'
import { sendRefusalSentence } from '@shared/agent-session'
import type { PresenceRoster } from '@shared/presence'
import { publishWorldContext, setWorldActions, type WorldContext, type WorldHandoff, type WorldPeer, type WorldTask } from './world-context-store'

/**
 * Canvas's side of the world context (M421): one hook call in Canvas.tsx that
 * turns what Canvas already holds into the room's snapshot, and registers the
 * doors the room's buttons call. Not a scene file and not pure: it is the one
 * place under world/ that knows the canvas's own types, so the scene files
 * keep knowing only the two stores.
 *
 * Every door here is an EXISTING one, called, never re-implemented:
 * - answer → `answerRequest` (ChatConversation.tsx), the chat card's door,
 *   which marks the request answered, notes the outcome and rolls back on a
 *   failed IPC;
 * - send → `window.canvas.agentSession.send`, the composer's call. A person's
 *   own words to their own agent, so — like the composer — it does not pass
 *   `outward`: that gate is for text LEAVING the app (`shared/outward.ts`);
 * - open → `jump`, Canvas's `jumpAnywhere` (the rail's attention door), after
 *   the room closes.
 */

export interface PublisherInput {
  /** Whether the room is up — nothing is derived while it is not. */
  on: boolean
  /** The active workspace, for its presence roster. */
  workspaceId: string | undefined
  panels: readonly Panel[]
  /** The tasks that are not done, already joined to their members and plan views by Canvas. */
  tasks: () => WorldTask[]
  approvals: readonly PendingApproval[]
  /** Canvas's attention jump; the room closes first. */
  jump: (panelId: string) => void
  closeWorld: () => void
}

function handoffsOf(panels: readonly Panel[]): WorldHandoff[] {
  const out: WorldHandoff[] = []
  for (const panel of panels) {
    for (const link of panel.links ?? []) {
      if (link.automation?.kind !== 'handoff' || !link.automation.enabled) continue
      out.push({ from: panel.rect.id, to: link.to, firedAt: edgeFiredAt(panel.rect.id, link.to) ?? null })
    }
  }
  return out
}

export function peersOf(roster: PresenceRoster | undefined): WorldPeer[] {
  if (roster === undefined) return []
  return roster.peers.filter((p) => p.live).map((p) => ({
    userId: p.presence.userId,
    name: p.presence.displayName,
    initials: p.presence.initials,
    color: p.presence.color,
    panelId: p.presence.currentPanelId ?? null,
    mode: p.presence.mode,
    active: p.status === 'active'
  }))
}

/** The roster for one workspace, live — a push replaces it. */
function useRoster(workspaceId: string | undefined, on: boolean): PresenceRoster | undefined {
  const [roster, setRoster] = useState(() => latestRoster(workspaceId))
  useEffect(() => {
    if (!on) return
    setRoster(latestRoster(workspaceId))
    return onRoster((next) => { if (next.workspaceId === workspaceId) setRoster(next) })
  }, [workspaceId, on])
  return roster
}

export function useWorldContextPublisher(input: PublisherInput): void {
  const { on, panels, approvals, jump, closeWorld } = input
  const roster = useRoster(input.workspaceId, on)

  useEffect(() => {
    if (!on) return
    const next: WorldContext = {
      tasks: input.tasks(),
      approvals: approvals.map((a) => ({ agentId: a.id, requestId: a.requestId, toolName: a.toolName, argument: a.argument, ...(a.description === undefined ? {} : { description: a.description }) })),
      handoffs: handoffsOf(panels),
      peers: peersOf(roster)
    }
    publishWorldContext(next)
  })

  useEffect(() => {
    const byId = (id: string): Panel | undefined => panels.find((p) => p.rect.id === id)
    setWorldActions({
      answer: (agentId, requestId, allow) => {
        const panel = byId(agentId)
        answerRequest(agentId, getChat(agentId).snapshot, panel?.title ?? 'Agent', requestId, allow)
      },
      send: async (agentId, text) => {
        try {
          return sendRefusalSentence(await window.canvas.agentSession.send(agentId, text, []))
        } catch (error) {
          return error instanceof Error ? error.message : String(error)
        }
      },
      open: (agentId) => {
        closeWorld()
        // The canvas is uncovered on the next commit; land after it.
        requestAnimationFrame(() => jump(agentId))
      },
      canSend: (agentId) => {
        const panel = byId(agentId)
        return panel !== undefined && isChatPanel(panel)
      }
    })
  }, [panels, jump, closeWorld])

  useEffect(() => () => setWorldActions(null), [])
}
