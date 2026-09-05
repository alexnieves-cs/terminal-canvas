import { useEffect } from 'react'
import type { Panel } from '@renderer/panels/panels'
import { isChatPanel } from '@renderer/panels/panels'
import { applyChatEvent, clearChat, getChat, seedChat } from './chat-store'
import { SUPERVISOR_PROMPT } from '@shared/agent-session'

/**
 * M73. The renderer's side of the two lifetimes for a chat panel.
 *
 * Main owns the SESSION (the process); this renderer owns the PANEL (the
 * rect). This hook keeps main told about every chat panel on the canvas —
 * `agent:create` once per id, idempotent in main, so a renderer reload
 * finds the session still there — and seeds the store with the durable
 * transcript and the live snapshot, which is what a restored panel renders
 * before any process exists. It spawns nothing: the first send does.
 *
 * DISPOSAL IS EXPLICIT, never a diff of the visible list. A workspace switch
 * changes `panels` to another workspace's and must not kill a conversation,
 * exactly as the registry keeps a switched-away terminal alive. The
 * panel-removing sites (close, undo/redo, reset, workspace delete) call
 * `disposeChat` themselves, beside their `registry.dispose`.
 */

const created = new Set<string>()
let subscribed = false

function ensureSubscribed(): void {
  if (subscribed) return
  subscribed = true
  window.canvas.agentSession.onEvent((event) => applyChatEvent(event))
}

export function ensureChatSession(panel: Extract<Panel, { kind: 'chat' }>): void {
  const id = panel.rect.id
  if (created.has(id)) return
  created.add(id)
  // Seeded EMPTY first so an event arriving before create answers is not
  // dropped by the store's never-seeded guard, and so the composer renders
  // its not-started arm rather than nothing.
  if (getChat(id).snapshot === null) seedChat(id, { snapshot: null })
  void window.canvas.agentSession
    // M81. A restored SUPERVISOR carries its system prompt again: the CLI
    // keeps no record of an appended prompt, so a resume without it would
    // leave a panel that looks like a supervisor and is not one.
    .create({ id, cwd: panel.chat.cwd, sessionId: panel.chat.sessionId, ...(panel.chat.backend === undefined ? {} : { backend: panel.chat.backend }), ...(panel.chat.agentOptions === undefined ? {} : { agentOptions: panel.chat.agentOptions }), ...(panel.chat.supervisor === true ? { appendSystemPrompt: SUPERVISOR_PROMPT } : {}) })
    .then((result) => {
      if (!created.has(id)) return
      if (result.kind === 'refused') {
        seedChat(id, { snapshot: null, refusal: result.reason })
        return
      }
      seedChat(id, { snapshot: result.snapshot, refusal: null })
      return window.canvas.agentSession.transcript(id).then((t) => {
        if (!created.has(id)) return
        seedChat(id, { snapshot: t.snapshot ?? result.snapshot, turns: t.turns, ...(t.meta === undefined ? {} : { meta: t.meta }) })
      })
    })
    .catch((error) => {
      // Guarded like the resolve arms: a rejection landing after the panel
      // was closed must not re-mint a state for a dead id.
      if (!created.has(id)) return
      seedChat(id, { snapshot: null, refusal: `the agent runtime did not answer: ${String(error)}` })
    })
}

/** The one disposal verb: main's session (and, on an explicit close, its file), then the store. */
export function disposeChat(id: string, drop: boolean): void {
  created.delete(id)
  clearChat(id)
  void window.canvas.agentSession.dispose({ id, drop }).catch(() => {})
}

export function useChatSessions(panels: readonly Panel[]): void {
  useEffect(() => {
    ensureSubscribed()
  }, [])
  useEffect(() => {
    for (const panel of panels) if (isChatPanel(panel)) ensureChatSession(panel)
  }, [panels])
}
