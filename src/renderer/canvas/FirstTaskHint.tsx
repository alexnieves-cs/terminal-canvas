import type { JSX } from 'react'
import { useChat } from '@renderer/chat/chat-store'
import { shellControl } from '@renderer/shell/shell-control'
import { firstTaskHint } from './hints'

/**
 * The first start's one hint, reading the new conversation's live state so the
 * sentence changes as the agent does (starting → working → answered). Outside
 * .world, like the launcher, so it never scales with the camera.
 */
export function FirstTaskHint({ panelId, sent, onDismiss }: { panelId: string; sent: boolean; onDismiss: () => void }): JSX.Element | null {
  const chat = useChat(panelId)
  const text = firstTaskHint(chat.snapshot?.status, chat.turns.length, sent)
  if (text === null) return null
  return (
    <p className="first-task-hint" data-first-task-hint={chat.snapshot?.status ?? 'starting'} role="status" aria-live="polite">
      <span>{text}</span>
      <button type="button" className="pf__verb pf__verb--word" data-first-task-hint-dismiss title="Hide this hint" {...shellControl(onDismiss)}>Got it</button>
    </p>
  )
}
