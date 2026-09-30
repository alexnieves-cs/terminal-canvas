import { useAgentState } from '@renderer/session/agent-state-store'
import { useChat } from '@renderer/chat/chat-store'
import { useWatch } from '@renderer/watcher/watcher-store'
import { chatStateInput } from '@renderer/chat/chat-model'
import { panelState, type PanelStateWord, type StateInput } from './panel-state'

/**
 * M393. A panel's state word and tone AS SHOWN — the one vocabulary, with the
 * live facts a row subscribes to applied: its agent state, a chat's session
 * mirror, a watcher's runs. Extracted from RailPanelRow (M63/M73/M84) so a
 * flowchart shape wired to an agent says EXACTLY the word the rail says for
 * it ("one vocabulary, four places" — now five). Each subscription is per id,
 * so a delta for c3 re-renders c3's readers and nothing else.
 */
export function useShownState(id: string, input: StateInput): PanelStateWord {
  const agent = useAgentState(id)
  const chat = useChat(id)
  const watch = useWatch(id)
  const chatInput = input.kind === 'chat' ? chatStateInput(chat.snapshot, chat.turns.length > 0) : undefined
  const live: StateInput = input.kind === 'chat'
    ? { ...input, ...(chatInput === undefined ? {} : { chat: chatInput }) }
    : input.kind === 'watcher'
      ? { ...input, watch: { status: watch.status, ...(watch.exitCode === undefined ? {} : { exitCode: watch.exitCode }), ...(watch.signal === undefined ? {} : { signal: watch.signal }), ...(watch.disarmed === undefined ? {} : { disarmed: true }) } }
      : input
  return panelState(live, agent)
}
