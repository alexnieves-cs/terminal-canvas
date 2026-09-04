import { useEffect, useRef } from 'react'
import type { MutableRefObject } from 'react'
import type { AgentState } from '@shared/types'
import type { Panel } from '@renderer/panels/panels'
import { isTerminalPanel, isChatPanel, linksOf } from '@renderer/panels/panels'
import type { PanelSpecTemplate } from '@renderer/session/panel-session'
import type { Registry } from '@renderer/session/session-registry'
import { getAgentState, onAgentTransition } from '@renderer/session/agent-state-store'
import { railLabel } from '@renderer/shell/rail-rows'
import { HANDOFF_MAX_CHARS, HANDOFF_MAX_LINES, HANDOFF_QUEUE_MS, handoffFires, type HandoffEvent, type HandoffTrigger } from '@shared/handoff'
import { incomingHandoffs, joinAdvance } from './handoff-rules'
import { onChatTurnEnd, lastAssistantText } from '@renderer/chat/chat-store'

/**
 * M41 — handoff edges. When a source "completes" (its process exits, or its
 * agent's turn ends), the target linked from it is started with the source's
 * recorded output as context. The audit surface is the inspector's
 * automation result; the payload is main's own scrollback tail, bracketed-
 * pasted, never a raw write (M5b's rule reached a fourth time).
 *
 * M28's hook shape: one `Deps` object, destructured on entry, named members
 * in the dependency array. The queue is a ref — never persisted, for the
 * reason the broadcast mode is not: it is in-flight state, and a saved queue
 * would re-deliver a stale payload on the next launch.
 *
 * This OVERRULES M25's no-wake rule for the handoff kind, in writing (see
 * docs/load-bearing.md): restart-on-exit refuses to wake a dormant target
 * because a saved restart must not launch an agent merely because another
 * exited; a handoff's whole meaning is "start B with A's output", configured
 * by hand on a link the user drew.
 */
export interface HandoffDeps {
  registry: Registry
  panelsRef: MutableRefObject<Panel[]>
  restartWithSpec: (id: string, spec: PanelSpecTemplate) => void
  /**
   * Wake a dormant target: clears BOTH the registry's dormant flag AND
   * Canvas's own `dormantIds` set, which `assignTiers` reads to card a
   * restored panel. `registry.wake` alone leaves the panel in `dormantIds`,
   * so the tier pass keeps carding it and it never spawns when framed — the
   * exact defect verify:panels handoff.2 caught.
   */
  wakeTarget: (id: string) => void
  setResult: (key: string, sentence: string) => void
  /** scrollback.persist — a handoff with no recorded output and the log off is a distinct skip. */
  scrollbackEnabled: () => boolean
}

interface Queued {
  sourceId: string
  payload: string
  lines: number
  trigger: HandoffTrigger
  detail: string
  at: number
  timer: ReturnType<typeof setTimeout>
}

/** A woken or restarted target can receive a paste once it is past `starting`. */
function canReceive(state: AgentState | undefined): boolean {
  return state === 'busy' || state === 'idle' || state === 'wants-you'
}

export function useHandoff(deps: HandoffDeps): void {
  const { registry, panelsRef, restartWithSpec, wakeTarget, setResult, scrollbackEnabled } = deps
  void setResult
  const queueRef = useRef<Map<string, Queued>>(new Map())
  // M78. The join's arrivals per target: in-flight state like the queue,
  // never persisted. A source arriving twice replaces itself.
  const joinRef = useRef<Map<string, Map<string, { payload: string; at: number }>>>(new Map())
  useEffect(() => {
    const queue = queueRef.current
    const joins = joinRef.current
    const wrap = (sourceLabel: string, trigger: HandoffTrigger, tail: string[]): string => {
      const header = `[handoff from ${sourceLabel} after ${trigger === 'idle' ? 'a completed turn' : 'exit'}]`
      let body = tail.join('\r\n')
      if (body.length > HANDOFF_MAX_CHARS) body = body.slice(body.length - HANDOFF_MAX_CHARS)
      return `${header}\r\n${body}\r\n`
    }
    // `setResult` for the firing edge, and for a join's OTHER edges the same
    // sentence under `joined —`: a row must never say handed off when the
    // delivery queued or was refused (M78's verifier).
    const deliver = (targetId: string, sourceId: string, trigger: HandoffTrigger, payload: string, lines: number, detail: string, others: readonly string[] = []): void => {
      const key = `${sourceId}:${targetId}`
      const setResult = (k: string, sentence: string): void => {
        deps.setResult(k, sentence)
        if (k === key) for (const id of others) deps.setResult(`${id}:${targetId}`, `joined — ${sentence}`)
      }
      const target = panelsRef.current.find((p) => p.rect.id === targetId)
      if (!target) { setResult(key, 'skipped — target is gone'); return }
      // M78. A chat target receives through the runtime's send, which spawns
      // an asleep chat itself — so a chat target never queues.
      if (isChatPanel(target)) {
        void window.canvas.agentSession.send(targetId, payload, []).then((answer) => {
          setResult(key, typeof answer === 'object' && answer !== null && 'refused' in answer ? `skipped — ${answer.refused}`
            : answer === 'queued' ? `queued — the chat is still answering; ${lines} lines go after its turn`
              : answer === 'no-session' ? 'skipped — the chat has no session' : `handed off ${lines} lines ${detail}`)
        })
        return
      }
      if (!isTerminalPanel(target)) {
        setResult(key, 'skipped — target is not a terminal or a chat')
        return
      }
      const session = registry.get(targetId)
      const running = session !== undefined && !session.dormant &&
        (session.status.kind === 'running' || session.status.kind === 'starting')
      if (running && canReceive(getAgentState(targetId))) {
        session!.handle.paste(payload)
        setResult(key, `handed off ${lines} lines ${detail}`)
        return
      }
      if (session !== undefined && session.status.kind === 'exited') {
        restartWithSpec(targetId, target.spec)
      } else if (session !== undefined && session.dormant) {
        wakeTarget(targetId)
      }
      const existing = queue.get(targetId)
      if (existing) clearTimeout(existing.timer)
      const at = Date.now()
      const timer = setTimeout(() => {
        if (queue.get(targetId)?.at === at) {
          queue.delete(targetId)
          setResult(`${sourceId}:${targetId}`, 'skipped — target did not start within 5 min')
        }
      }, HANDOFF_QUEUE_MS)
      queue.set(targetId, { sourceId, payload, lines, trigger, detail, at, timer })
      setResult(key, 'queued — target starts when it comes on screen')
    }
    /**
     * M78. The join: one arrival per source, the target started ONCE when
     * the last expected source arrives, the payload in the edges' order.
     * A target with one edge is a join of one.
     */
    const dispatch = (targetId: string, sourceId: string, trigger: HandoffTrigger, payload: string, lines: number, detail: string): void => {
      const expected = incomingHandoffs(panelsRef.current, targetId)
      let arrived = joins.get(targetId)
      if (!arrived) { arrived = new Map(); joins.set(targetId, arrived) }
      const now = Date.now()
      // An arrival from an edge that is no longer expected, or older than the
      // queue's own five minutes, is stale: a re-enabled edge must not fire
      // with yesterday's output.
      for (const [id, a] of [...arrived]) if (!expected.includes(id) || now - a.at > HANDOFF_QUEUE_MS) arrived.delete(id)
      arrived.set(sourceId, { payload, at: now })
      const state = joinAdvance(expected, new Map([...arrived].map(([id, a]) => [id, a.payload])))
      if (!state.ready) {
        const owed = state.waitingFor.map((id) => { const p = panelsRef.current.find((x) => x.rect.id === id); return p ? railLabel(p, undefined) : id })
        setResult(`${sourceId}:${targetId}`, `waiting for ${owed.join(', ')}`)
        return
      }
      joins.delete(targetId)
      const joined = expected.length > 1
      const sources = expected.length
      deliver(targetId, sourceId, trigger, state.payload, lines, joined ? `${detail} (joined ${sources} sources)` : detail, expected.filter((id) => id !== sourceId))
    }
    const fire = (sourceId: string, event: HandoffEvent, detail: string): void => {
      const source = panelsRef.current.find((p) => p.rect.id === sourceId)
      if (!source || !(isTerminalPanel(source) || isChatPanel(source))) return
      for (const link of linksOf(source)) {
        const rule = link.automation
        if (rule?.kind !== 'handoff' || !rule.enabled) continue
        const key = `${sourceId}:${link.to}`
        // M78. The ONE table decides; a failed condition is recorded by name.
        if (!handoffFires(rule.trigger, event)) {
          if (event.kind === 'exit' && (rule.trigger === 'exit-ok' || rule.trigger === 'exit-fail')) {
            setResult(key, `skipped — exit ${event.code ?? 'by signal'} is not ${rule.trigger === 'exit-ok' ? 'exit 0' : 'a failing exit'}`)
          }
          continue
        }
        const trigger = event.kind === 'idle' ? 'idle' : 'exit'
        if (isChatPanel(source)) {
          // A chat source's payload is its last answer, from the store.
          const text = lastAssistantText(sourceId)
          if (text === '') { setResult(key, 'skipped — the chat has no answer to hand off'); continue }
          const lines = text.split('\n')
          dispatch(link.to, sourceId, trigger, wrap(railLabel(source, undefined), trigger, lines.slice(-HANDOFF_MAX_LINES)), Math.min(lines.length, HANDOFF_MAX_LINES), detail)
          continue
        }
        void window.canvas.scrollback.tail({ panelId: sourceId, lines: HANDOFF_MAX_LINES }).then((tail) => {
          if (tail.length === 0) {
            setResult(key, scrollbackEnabled()
              ? 'skipped — no output recorded'
              : 'skipped — no output recorded (scrollback is off)')
            return
          }
          dispatch(link.to, sourceId, trigger, wrap(railLabel(source, undefined), trigger, tail), tail.length, detail)
        })
      }
    }
    const offExit = registry.onExit((info) => fire(info.panelId, { kind: 'exit', code: info.exitCode }, `after exit ${info.exitCode}`))
    // M78. A chat's turn end is its `idle`.
    const offChatTurn = onChatTurnEnd((id) => fire(id, { kind: 'idle' }, 'after a turn'))
    const offTransition = onAgentTransition((panelId, state, prev) => {
      if (prev === 'busy' && state === 'idle') fire(panelId, { kind: 'idle' }, 'after a turn')
      const queued = queue.get(panelId)
      if (queued && canReceive(state)) {
        const session = registry.get(panelId)
        if (session !== undefined && !session.dormant &&
          (session.status.kind === 'running' || session.status.kind === 'starting')) {
          setTimeout(() => {
            const s = registry.get(panelId)
            if (queue.get(panelId) === queued && s !== undefined && !s.dormant) {
              clearTimeout(queued.timer)
              queue.delete(panelId)
              s.handle.paste(queued.payload)
              setResult(`${queued.sourceId}:${panelId}`, `handed off ${queued.lines} lines ${queued.detail}`)
            }
          }, 150)
        }
      }
    })
    return () => {
      offExit()
      offChatTurn()
      offTransition()
      for (const q of queue.values()) clearTimeout(q.timer)
      queue.clear()
      joins.clear()
    }
  }, [registry, panelsRef, restartWithSpec, wakeTarget, setResult, scrollbackEnabled])
}
