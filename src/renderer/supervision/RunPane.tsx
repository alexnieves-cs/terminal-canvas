import { useMemo, useState, type JSX } from 'react'
import { foldRun, runEventsOf } from '@shared/agent-run'
import { useChat, useApprovals, isAnswered } from '@renderer/chat/chat-store'
import { RunTimeline } from './RunTimeline'
import { ToolCallCard } from './ToolCallCard'

/**
 * M671. THE TASK VIEW'S RUN TAB: the shown agent's timeline on top, the
 * picked call's card beneath. Creance's AgentRunLayout in miniature — the
 * timeline and the card share one `RunState`, folded from the chat store
 * that `agent:event` fills, so the tab and the conversation beside it can
 * never disagree about what ran. An answered request leaves the run the
 * moment it is marked, as it leaves the composer's question block.
 */
export function RunPane({ panelId }: { panelId: string }): JSX.Element {
  const chat = useChat(panelId)
  useApprovals()
  const pending = (chat.snapshot?.pending ?? []).filter((p) => !isAnswered(panelId, p.requestId))
  const run = useMemo(
    () => foldRun(runEventsOf(chat.turns, pending, { live: chat.live !== null, ...(chat.lastTurn === undefined ? {} : { lastTurn: chat.lastTurn }) })),
    // `pending` is rebuilt each render; its ids are what change.
    [chat.turns, chat.live !== null, chat.lastTurn, pending.map((p) => p.requestId).join(' ')] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const [picked, setPicked] = useState<string | null>(null)
  // The picked call, else the latest one: the card is never empty while a call exists.
  const latest = run.stepIds.length === 0 ? undefined : [...run.stepIds].reverse().map((id) => run.steps[id]?.callIds.at(-1)).find((id) => id !== undefined)
  const shown = (picked !== null ? run.calls[picked] : undefined) ?? (latest === undefined ? undefined : run.calls[latest])
  return (
    <div className="sv-run" data-sv-run={panelId}>
      <RunTimeline run={run} live={chat.live !== null || pending.length > 0} {...(shown === undefined ? {} : { selectedCallId: shown.id })} onSelectCall={setPicked} />
      {shown !== undefined && <ToolCallCard key={shown.id} call={shown} announce={false} />}
    </div>
  )
}
