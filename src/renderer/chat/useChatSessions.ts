import { carryBackend } from '@shared/agent-backends'
import { useEffect } from 'react'
import type { Panel } from '@renderer/panels/panels'
import { isChatPanel } from '@renderer/panels/panels'
import { applyChatEvent, clearChat, getChat, seedChat, setChatGrants } from './chat-store'
import { applyRateLimit } from '@renderer/session/rate-limit-store'
import { DISPATCH_PROMPT, SUPERVISOR_PROMPT } from '@shared/agent-session'
import { ROUTINE_PROMPT } from '@shared/routines'
import { swarmSystemPrompt } from '@shared/swarm'

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
  window.canvas.agentSession.onEvent((event) => {
    applyChatEvent(event)
    if (event.type === 'rate-limit') applyRateLimit(event)
  })
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
    // M138 (critic's Critical). An orchestrator's prompt sits in the SAME
    // chain as the supervisor's, dispatch's and routine's — one appended
    // prompt per chat, never inside the teammate arm, where a first draft
    // put it and a template-minted orchestrator (no teammate) resumed as an
    // ordinary chat. Product `orchestrator.resume.1` pins the spawn's argv.
    // M81. A restored SUPERVISOR carries its system prompt again: the CLI
    // keeps no record of an appended prompt, so a resume without it would
    // leave a panel that looks like a supervisor and is not one.
    // M275. A SWARM SEAT is FIRST in the chain, and it has to be: a swarm's
    // hub carries `supervisor` as well (it is the canvas's one supervisor)
    // and its primary seat carries `dispatch` as well (it is the task's
    // lane), so either earlier arm would win and the seat's own brief — the
    // thing that makes it an explorer rather than a generic lane — would be
    // dropped on every relaunch, silently. `swarmSystemPrompt` composes
    // M81's supervisor prompt back in for the hub, so nothing is lost.
    .create({ id, cwd: panel.chat.cwd, sessionId: panel.chat.sessionId, ...carryBackend(panel.chat), ...(panel.chat.teammateId === undefined ? {} : { teammateId: panel.chat.teammateId }), ...(panel.chat.sandbox === true ? { sandbox: true } : {}), ...(panel.chat.agentOptions === undefined ? {} : { agentOptions: panel.chat.agentOptions }), ...(panel.chat.swarm !== undefined ? { appendSystemPrompt: swarmSystemPrompt(panel.chat.swarm, SUPERVISOR_PROMPT) } : panel.chat.supervisor === true ? { appendSystemPrompt: SUPERVISOR_PROMPT } : panel.chat.dispatch === true ? { appendSystemPrompt: DISPATCH_PROMPT } : panel.chat.routine === true ? { appendSystemPrompt: ROUTINE_PROMPT } : panel.chat.orchestrator !== undefined ? { appendSystemPrompt: panel.chat.orchestrator } : {}) })
    .then((result) => {
      if (!created.has(id)) return
      if (result.kind === 'refused') {
        seedChat(id, { snapshot: null, refusal: result.reason })
        return
      }
      seedChat(id, { snapshot: result.snapshot, refusal: null })
      // M98. Grants are main's; asked once here and again after every scoped
      // answer or revoke. Until it answers the inspector reads `unknown`.
      refreshChatGrants(id)
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

/** M98. Re-read main's grants for a chat into the store's mirror. Guarded like every resolve arm. */
export function refreshChatGrants(id: string): void {
  void window.canvas.agentSession.grants(id).then((grants) => {
    if (!created.has(id)) return
    setChatGrants(id, grants)
  }).catch(() => {})
}

/** M98. Drop every grant for a chat — it asks again — then mirror main's (empty) answer. */
export function revokeChatGrants(id: string): void {
  void window.canvas.agentSession.revokeGrants(id).then(() => refreshChatGrants(id)).catch(() => {})
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
