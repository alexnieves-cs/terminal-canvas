import { getChat, lastAssistantText } from '@renderer/chat/chat-store'
import { getAgentState } from '@renderer/session/agent-state-store'
import { outward } from '@shared/outward'
import type { PlanFacts } from '@shared/task-plan'

/**
 * M327. What a plan's derivation reads, from what this renderer already
 * holds: each agent's session in the chat store, the task's witnessed check
 * runs, and the review mark. ONE reader, for the plan side of the focus view
 * and the plan line on Orchestrate's task list, so the two never disagree
 * about whether a step stopped or finished.
 */
export function planFactsOf(input: {
  chats: readonly { id: string; title: string }[]
  runs: readonly { command: string; exitCode: number | null; at: number }[]
  review: PlanFacts['review']
}): PlanFacts {
  return {
    agentOf: (id) => {
      const present = input.chats.find((c) => c.id === id)
      if (present === undefined) return { present: false, title: id, live: false, waiting: false, ended: true }
      const chat = getChat(id)
      const status = chat.snapshot?.status
      const words = chat.live === null ? lastAssistantText(id) : ''
      return {
        present: true,
        title: present.title,
        live: chat.live !== null || status === 'streaming' || status === 'starting',
        waiting: getAgentState(id) === 'wants-you',
        // A chat's process exits between turns (M301); only a disposed session or a refusal is an END.
        ended: status === 'disposed' || chat.refusal !== null,
        ...(chat.lastTurn === undefined ? {} : { lastTurn: chat.lastTurn }),
        // The agent's words reach a page through the gate, like every tail shown.
        ...(words === '' ? {} : { lastWords: outward(words, `panel ${id}`).text })
      }
    },
    runOf: (command) => {
      const r = input.runs.filter((x) => x.command === command).sort((a, b) => b.at - a.at)[0]
      return r === undefined ? undefined : { exitCode: r.exitCode, at: r.at }
    },
    review: input.review
  }
}
