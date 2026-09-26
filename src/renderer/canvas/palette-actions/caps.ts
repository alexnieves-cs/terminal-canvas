/**
 * M352. `cap-agent`: an agent's own spend and context caps.
 *
 * The verb writes the chat panel's record (`ChatSource.caps`, M351) and does
 * nothing else. The canvas's save carries the record to main, which re-reads
 * every agent's caps on that save and enforces them outside the agent loop.
 * One history entry, like a note's tint: a cap set by mistake is one undo.
 *
 * WHO asked decides what may change (`planCapChange`). Through a door (an
 * agent's `tc plan`, a workflow's action node) a cap may only be LOWERED.
 * Raising or removing one is a person's decision, made on the Inspector's
 * Work tab or on a typed palette line. The cap in force that a door is
 * compared against is MAIN's (`meter.caps` on the chat's snapshot), because
 * main is what enforces it.
 *
 * One slice of `usePaletteActions` (see ./types.ts).
 */

import { planCapChange } from '@shared/agent-session'
import { capDecisionTitle } from '@shared/decision-audit'
import { adoptedRunId, recordOrchEvent } from '@renderer/orchestration/orch-record'
import { getChat } from '@renderer/chat/chat-store'
import { isChatPanel } from '@renderer/panels/panels'
import type { PaletteActions } from '@renderer/palette/commands'
import type { ActionCtx } from './types'

export type CapsActions = Pick<PaletteActions, 'capAgent'>

export function capsActions(ctx: ActionCtx): CapsActions {
  const { panelsRef, setPanels, commitHistory, boardVerbsRef } = ctx
  return {
    capAgent: (panelId, value, origin = 'person') => {
      const target = panelsRef.current.find((p) => p.rect.id === panelId)
      if (target === undefined || !isChatPanel(target)) return { kind: 'refused', reason: 'that panel is not an agent conversation' }
      // Unmeasured and uncapped reads as no caps in force: a door may then set any figure, which only tightens.
      const current = getChat(panelId).snapshot?.meter?.caps ?? { usd: 0, context: 0 }
      const change = planCapChange(target.chat.caps, value, origin, current)
      if (change.kind === 'refused') return change
      setPanels((prev) => {
        const next = prev.map((p) => {
          if (p.rect.id !== panelId || !isChatPanel(p)) return p
          const { caps: _old, ...rest } = p.chat
          return { ...p, chat: change.caps === undefined ? rest : { ...rest, caps: change.caps } }
        })
        commitHistory(next)
        return next
      })
      // M371. The decision is recorded where it is made. A person's change is
      // `person` and reaches the decision audit (M369); a door's lowering is
      // the agent's or the workflow's, recorded as theirs.
      void recordOrchEvent({
        runId: adoptedRunId(panelId), panelId, event: 'session', source: origin === 'person' ? 'person' : 'agent',
        ...(boardVerbsRef.current?.taskOfPanel?.(panelId) === undefined ? {} : { itemId: boardVerbsRef.current.taskOfPanel(panelId) }),
        title: capDecisionTitle(target.title ?? panelId, change.note, origin === 'person')
      })
      return { kind: 'ran', note: change.note }
    }
  }
}
