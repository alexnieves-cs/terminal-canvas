import { useEffect, useRef, useState } from 'react'
import { getChat, subscribeChat } from '@renderer/chat/chat-store'
import { answerRequest } from '@renderer/chat/ChatConversation'
import { edgeFiredAt } from '@renderer/canvas/useEdgeActivity'
import { isChatPanel, isTerminalPanel, type Panel } from '@renderer/panels/panels'
import type { PendingApproval } from '@renderer/shell/rail-sections'
import { latestRoster, onRoster } from '@renderer/presence/presence-store'
import { backendOf } from '@shared/agent-backends'
import { sendRefusalSentence } from '@shared/agent-session'
import type { PresenceRoster } from '@shared/presence'
import { getWorldContext, publishWorldContext, setWorldActions, type WorldAgentFacts, type WorldContext, type WorldHandoff, type WorldPeer, type WorldTask } from './world-context-store'
import { agentFacts } from './world-facts'

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
 *   the room closes — and (M429) only when `canJump` says it lands somewhere,
 *   which is also the room's `canOpen`.
 *
 * M428 adds each agent's FACTS (model, spend, context, a hold, branch,
 * teammate, queue) — read off the chat store's snapshot (main's `meter`, its
 * `model`, `backend` and `queue`) and the panel's record, shaped by the pure
 * `agentFacts`. Two beats publish them: Canvas's own renders (the effect
 * below, with everything else), AND a subscription to each chat agent's
 * store entry while the room is up. Canvas does re-render on a meter today —
 * it reads `useChatsVersion` for its rail — but that is a fact about two
 * unrelated readers in Canvas, and the room's spend must not go stale the day
 * one of them is narrowed. The subscription republishes the facts alone,
 * without rendering Canvas, and the store's by-value dedupe drops a tick the
 * card would not show.
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
  /** M429. Whether that jump has somewhere to land — the same two cases `jumpAnywhere` takes. */
  canJump: (panelId: string) => boolean
  closeWorld: () => void
  /** M432. Canvas's switch to Orchestrate with this panel selected; the room closes with the page change. */
  orchestrate: (panelId: string) => void
  /** M428. The worktree branch a panel runs in, when anything knows it (a terminal's PTY result, a chat's task lane). */
  branchOf: (panel: Panel) => string | undefined
  /** M428. A teammate's display name, the rail's own resolution. */
  teammateNameOf: (teammateId: string) => string | undefined
}

/** Whose facts the room keeps: the panels that can be an agent in it. */
function isAgentPanel(panel: Panel): boolean {
  return isChatPanel(panel) || isTerminalPanel(panel)
}

/**
 * Every agent panel's facts, by id. A chat's come from main's snapshot as the
 * chat store holds it NOW (`getChat`, never a render's copy); a terminal has
 * no meter, model or queue main can measure, so its only fact is its branch.
 * A panel nothing knows anything about has no entry.
 */
export function factsOf(panels: readonly Panel[], branchOf: PublisherInput['branchOf'], teammateNameOf: PublisherInput['teammateNameOf']): Record<string, WorldAgentFacts> {
  const out: Record<string, WorldAgentFacts> = {}
  for (const panel of panels) {
    if (!isAgentPanel(panel)) continue
    const id = panel.rect.id
    const branch = branchOf(panel)
    const facts = isChatPanel(panel)
      ? (() => {
          const snap = getChat(id).snapshot
          const owner = panel.chat.teammateId === undefined ? undefined : teammateNameOf(panel.chat.teammateId)
          return agentFacts({
            backend: snap?.backend ?? backendOf(panel.chat),
            ...(snap?.model === undefined ? {} : { model: snap.model }),
            ...(snap?.meter === undefined ? {} : { meter: snap.meter }),
            ...(snap === null ? {} : { queued: snap.queued }),
            ...(branch === undefined ? {} : { branch }),
            ...(owner === undefined ? {} : { owner })
          })
        })()
      : agentFacts(branch === undefined ? {} : { branch })
    if (facts !== null) out[id] = facts
  }
  return out
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
  const { on, panels, approvals, jump, canJump, closeWorld, orchestrate } = input
  const roster = useRoster(input.workspaceId, on)
  // The latest render's inputs, for the chat subscription below, which runs
  // between renders and must read what Canvas holds now, not what it held
  // when the subscription was made.
  const latest = useRef(input)
  latest.current = input

  useEffect(() => {
    if (!on) return
    const next: WorldContext = {
      tasks: input.tasks(),
      approvals: approvals.map((a) => ({ agentId: a.id, requestId: a.requestId, toolName: a.toolName, argument: a.argument, ...(a.description === undefined ? {} : { description: a.description }) })),
      handoffs: handoffsOf(panels),
      peers: peersOf(roster),
      facts: factsOf(panels, input.branchOf, input.teammateNameOf)
    }
    publishWorldContext(next)
  })

  // M428. The chat agents' meters and queues, live while the room is up and
  // only then: a closed room has no reader. Keyed on the chat ids, so a drag
  // does not re-subscribe; one listener per chat, because the store notifies
  // per id (a delta for one chat wakes only its own listeners).
  const chatKey = on ? panels.filter(isChatPanel).map((p) => p.rect.id).join('\u0000') : ''
  useEffect(() => {
    if (chatKey === '') return
    const republish = (): void => {
      const now = latest.current
      publishWorldContext({ ...getWorldContext(), facts: factsOf(now.panels, now.branchOf, now.teammateNameOf) })
    }
    const offs = chatKey.split('\u0000').map((id) => subscribeChat(id, republish))
    return () => { for (const off of offs) off() }
  }, [chatKey])

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
        // M429: never close the room for a jump that lands nowhere (jumpAnywhere
        // drops an id it cannot place, silently — the person would be thrown
        // out of the room onto an unchanged canvas). The room asks canOpen
        // first; this is the door's own guard for any caller that does not.
        if (!canJump(agentId)) return
        closeWorld()
        // The canvas is uncovered on the next commit; land after it.
        requestAnimationFrame(() => jump(agentId))
      },
      canSend: (agentId) => {
        const panel = byId(agentId)
        return panel !== undefined && isChatPanel(panel)
      },
      canOpen: (agentId) => canJump(agentId),
      orchestrate: (agentId) => {
        if (byId(agentId) === undefined) return
        orchestrate(agentId)
      },
      canOrchestrate: (agentId) => byId(agentId) !== undefined
    })
  }, [panels, jump, canJump, closeWorld, orchestrate])

  useEffect(() => () => setWorldActions(null), [])
}
