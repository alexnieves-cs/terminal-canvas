import { useEffect, useRef } from 'react'
import type { MutableRefObject } from 'react'
import type { AgentState } from '@shared/types'
import type { Panel } from '@renderer/panels/panels'
import { isTerminalPanel, linksOf } from '@renderer/panels/panels'
import type { PanelSpecTemplate } from '@renderer/session/panel-session'
import type { Registry } from '@renderer/session/session-registry'
import { getAgentState, onAgentTransition } from '@renderer/session/agent-state-store'
import { railLabel } from '@renderer/shell/rail-rows'
import { HANDOFF_MAX_CHARS, HANDOFF_MAX_LINES, HANDOFF_QUEUE_MS, type HandoffTrigger } from '@shared/handoff'

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
  const queueRef = useRef<Map<string, Queued>>(new Map())

  useEffect(() => {
    const queue = queueRef.current

    const wrap = (sourceLabel: string, trigger: HandoffTrigger, tail: string[]): string => {
      const header = `[handoff from ${sourceLabel} after ${trigger === 'exit' ? 'exit' : 'a completed turn'}]`
      let body = tail.join('\r\n')
      if (body.length > HANDOFF_MAX_CHARS) body = body.slice(body.length - HANDOFF_MAX_CHARS)
      return `${header}\r\n${body}\r\n`
    }

    // Deliver now, or record why not; queue for a target that must first
    // start. `detail` is the trailing clause of every sentence ("after exit
    // 0", "after a turn").
    const dispatch = (targetId: string, sourceId: string, trigger: HandoffTrigger, payload: string, lines: number, detail: string): void => {
      const key = `${sourceId}:${targetId}`
      const target = panelsRef.current.find((p) => p.rect.id === targetId)
      if (!target || !isTerminalPanel(target)) {
        setResult(key, 'skipped — target is not a terminal')
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
      // The target cannot receive yet: an exited one is restarted, a dormant
      // or never-spawned one is woken (spawns when tiering next promotes it —
      // the fit-before-spawn rule), and a still-`starting` running one is
      // simply waited on. In every case the payload is queued and delivered by
      // the transition listener below.
      if (session !== undefined && session.status.kind === 'exited') {
        restartWithSpec(targetId, target.spec)
      } else if (session !== undefined && session.dormant) {
        wakeTarget(targetId)
      }
      const existing = queue.get(targetId)
      if (existing) clearTimeout(existing.timer)
      const at = Date.now()
      const timer = setTimeout(() => {
        // Only drop THIS entry: a newer handoff to the same target replaced it
        // (and cleared this timer), so the `at` guard is belt-and-suspenders.
        if (queue.get(targetId)?.at === at) {
          queue.delete(targetId)
          setResult(`${sourceId}:${targetId}`, 'skipped — target did not start within 5 min')
        }
      }, HANDOFF_QUEUE_MS)
      queue.set(targetId, { sourceId, payload, lines, trigger, detail, at, timer })
      setResult(key, 'queued — target starts when it comes on screen')
    }

    const fire = (sourceId: string, trigger: HandoffTrigger, detail: string): void => {
      const source = panelsRef.current.find((p) => p.rect.id === sourceId)
      if (!source || !isTerminalPanel(source)) return
      for (const link of linksOf(source)) {
        const rule = link.automation
        if (rule?.kind !== 'handoff' || !rule.enabled || rule.trigger !== trigger) continue
        const key = `${sourceId}:${link.to}`
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

    const offExit = registry.onExit((info) => fire(info.panelId, 'exit', `after exit ${info.exitCode}`))
    const offTransition = onAgentTransition((panelId, state, prev) => {
      // A completed turn: busy -> idle on the SOURCE fires an idle handoff.
      if (prev === 'busy' && state === 'idle') fire(panelId, 'idle', 'after a turn')
      // A queued TARGET became able to receive: deliver and clear.
      const queued = queue.get(panelId)
      if (queued && canReceive(state)) {
        const session = registry.get(panelId)
        if (session !== undefined && !session.dormant &&
          (session.status.kind === 'running' || session.status.kind === 'starting')) {
          // One short settle: the first bytes have arrived (state left
          // starting), but a TUI may still be painting its prompt.
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
      offTransition()
      for (const q of queue.values()) clearTimeout(q.timer)
      queue.clear()
    }
  }, [registry, panelsRef, restartWithSpec, wakeTarget, setResult, scrollbackEnabled])
}
