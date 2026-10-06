import type { JSX } from 'react'
import { shortcutById } from '@shared/shortcuts'
import { KindBrowser, People, ToolEdit, ToolRead, ToolRun, ToolSearch } from '@renderer/icons'
import type { CapHold } from '@shared/agent-session'
import { getAgent, getAgentIds, useReplayAt } from './agent-world-store'
import { activityOf, type Activity } from './world-activity'
import { useWorldActions, useWorldContext } from './world-context-store'
import { isLiveStatus } from './world-scene'
import { cardHeadline, conflictPartners, type Headline } from './world-structure'

/**
 * The card's plain-DOM half: the lead, the pill's glyph and a waiting agent's
 * request block. Moved out of WorldCard (M431) so the FLAT room — the one a
 * machine with no WebGL gets (`WorldFlat.tsx`) — says the same things through
 * the same doors without importing the scene: WorldCard imports fiber and
 * drei, and a flat room that reached it would fetch three.js for a view that
 * can never draw it. Like the chrome, this file imports none of three
 * (`verify:world world.door.1` pins the importer set).
 */

/** The pill's glyph for what the hands are on (M422) — the reference's pill carries an icon; ours says the work. */
export const ACTIVITY_ICON: Partial<Record<Activity, (props: { size?: number }) => JSX.Element>> = {
  read: ToolRead, search: ToolSearch, edit: ToolEdit, test: ToolRun, shell: ToolRun, web: KindBrowser, delegate: People
}

/** The live agents' records — what a card's conflict line is read against. */
function liveRecords(): NonNullable<ReturnType<typeof getAgent>>[] {
  return getAgentIds().map((id) => getAgent(id)).filter((r): r is NonNullable<typeof r> => r !== undefined && isLiveStatus(r.status))
}

/** The card's lead (M424): `cardHeadline` over this record, the context's request, a cap's hold (M428) and the room's conflicts. */
export function headlineOf(record: NonNullable<ReturnType<typeof getAgent>>, approval: { toolName: string } | undefined, words: string, now: number, held: CapHold | undefined): Headline {
  return cardHeadline(record, {
    ...(approval === undefined ? {} : { approval }),
    ...(held === undefined ? {} : { held }),
    partners: conflictPartners(liveRecords(), record.agentId, now),
    partnerName: (id) => getAgent(id)?.name ?? id,
    now,
    activity: activityOf(record, now),
    words
  })
}

/**
 * A waiting agent's card is the REQUEST (M422): what it wants to do, and the
 * three verbs — the same answer door the chat card uses, and the jump to the
 * panel for anything the room cannot answer (a terminal's prompt, a question
 * with options). The only controls in the card layer, so the only things in
 * it that take the pointer; everything else stays deaf to it, or a card over
 * a drag would eat the orbit. The flat room's tile takes it whole.
 */
export function RequestBlock({ agentId }: { agentId: string }): JSX.Element {
  const ctx = useWorldContext()
  const actions = useWorldActions()
  // M425: a request in the PAST room is history — it may have been answered since — so it has no verbs.
  const past = useReplayAt() !== null
  const asked = past ? undefined : ctx.approvals.find((a) => a.agentId === agentId)
  return (
    <div className="world-card__request" data-world-request>
      {asked !== undefined ? (
        <p className="world-card__ask"><span className="world-card__tool">{asked.toolName}</span>{asked.argument}</p>
      ) : (
        <p className="world-card__ask world-card__ask--open">{past ? 'Was waiting on you here' : 'Waiting on you in its panel'}</p>
      )}
      <div className="world-card__actions" role="group" aria-label="Answer the request">
        {asked !== undefined && actions !== null ? (
          <>
            <button type="button" className="world-card__act world-card__act--go" onClick={() => actions.answer(agentId, asked.requestId, true)} data-world-answer="allow">Approve</button>
            <button type="button" className="world-card__act" onClick={() => actions.answer(agentId, asked.requestId, false)} data-world-answer="deny">Deny</button>
          </>
        ) : null}
        {/* M429: no Open for an agent with no panel to land on (the simulator's, a teammate's elsewhere) — it would close the room onto nothing. */}
        {past || (actions !== null && !actions.canOpen(agentId)) ? null : <button type="button" className="world-card__act" onClick={() => actions?.open(agentId)} disabled={actions === null} data-world-answer="open">Open</button>}
      </div>
    </div>
  )
}

/**
 * The inline ask (M452). The same answer door as the request block, on the
 * chip the close-up leaves visible. A past room has no verb, same as the block.
 */
export function AskApprove({ agentId }: { agentId: string }): JSX.Element | null {
  const ctx = useWorldContext()
  const actions = useWorldActions()
  const past = useReplayAt() !== null
  const asked = past ? undefined : ctx.approvals.find((a) => a.agentId === agentId)
  if (asked === undefined || actions === null) return null
  const chord = shortcutById('allow')?.chord
  return (
    <button type="button" className="world-chip__approve" onClick={() => actions.answer(agentId, asked.requestId, true)} data-world-ask-approve>
      Approve{chord !== undefined && chord !== '' ? <> <kbd>{chord}</kbd></> : null}
    </button>
  )
}
