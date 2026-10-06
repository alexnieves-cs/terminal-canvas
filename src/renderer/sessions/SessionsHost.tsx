import { useState, type JSX } from 'react'
import type { AttentionItem } from '@shared/redesign-contracts'
import { useAttentionCensus } from '@renderer/canvas/command-pill'
import { useAttentionQueue } from '@renderer/session/useAttentionQueue'
import { shellControl } from '@renderer/shell/shell-control'
import { SessionsView, useSessionsTheme } from './SessionsView'
import { useSessionBoard } from './sessions-live'
import {
  endAsk, headerSpend, replyBox, sessionsTitle, SNOOZE_MS,
  type CardAction, type EndAsk, type SessionFact
} from './sessions-model'

/**
 * M445. The Sessions page. F3 left the mount; this fills it.
 *
 * The queue is `useAttentionQueue` — the same list the pill publishes.
 * This file does not call `buildQueue`, and it does not listen for ⌘⇧S:
 * the shell already toggles the page on that chord.
 *
 * Paste, confirm, pause, restart, move, a new session and the camera
 * flight are callbacks. Canvas owns the registry and main's dialog, and
 * this page does not. End does nothing until `confirmEnd` says yes.
 */
export function SessionsHost({ onShowOrchestrate, confirmEnd, onEnd, onPause, onRestart, onMove, onNewSession, onShowOnCanvas, onSend, onDetach, onAllow, onDeny, onDiff }: {
  onShowOrchestrate?: () => void
  /** Main's confirm, passed in. Absent means End does not end. */
  confirmEnd?: (ask: EndAsk) => Promise<boolean> | boolean
  onEnd?: (ids: readonly string[]) => void
  onPause?: (ids: readonly string[]) => void
  onRestart?: (ids: readonly string[]) => void
  onMove?: (ids: readonly string[], taskId: string) => void
  onNewSession?: () => void
  onShowOnCanvas?: (id: string) => void
  /** Terminal paste. A chat with no callback uses `agentSession.send`. */
  onSend?: (id: string, text: string) => void
  onDetach?: (id: string) => void
  onAllow?: (panelId: string) => void
  onDeny?: (panelId: string) => void
  onDiff?: (panelId: string) => void
}): JSX.Element {
  const attention = useAttentionQueue(useAttentionCensus())
  const board = useSessionBoard(onSend !== undefined)
  const theme = useSessionsTheme()
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [openId, setOpenId] = useState<string | null>(null)
  const [stateFilter, setStateFilter] = useState<string | null>(null)
  const [snoozeUntil, setSnoozeUntil] = useState<ReadonlyMap<string, number>>(new Map())
  const now = Date.now()
  const cards = attention.filter((item) => (snoozeUntil.get(item.id) ?? 0) <= now)
  const spend = headerSpend(board.facts)
  const names = new Map(board.facts.map((fact) => [fact.id, fact.name]))
  const open = openId === null ? undefined : board.facts.find((fact) => fact.id === openId)

  const toggle = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const end = (ids: readonly string[]): void => {
    if (ids.length === 0 || confirmEnd === undefined) return
    const ask = endAsk(ids.length)
    void Promise.resolve(confirmEnd(ask)).then((yes) => {
      if (!yes) return
      onEnd?.(ids)
      setSelected((prev) => {
        const next = new Set(prev)
        for (const id of ids) next.delete(id)
        return next
      })
      if (openId !== null && ids.includes(openId)) setOpenId(null)
    })
  }

  const send = (fact: SessionFact, text: string): void => {
    const box = replyBox(fact.shell, fact.canPaste)
    if (!box.enabled || text.trim() === '') return
    if (onSend !== undefined) {
      onSend(fact.id, text)
      return
    }
    if (fact.kind === 'chat') void window.canvas.agentSession.send(fact.id, text, [])
  }

  const onCard = (item: AttentionItem, action: CardAction['id']): void => {
    if (action === 'snooze') {
      setSnoozeUntil((prev) => {
        const next = new Map(prev)
        next.set(item.id, Date.now() + SNOOZE_MS)
        return next
      })
      return
    }
    if (action === 'log') {
      setOpenId(item.panelId)
      return
    }
    if (action === 'open' || action === 'reply' || action === 'review') {
      onShowOnCanvas?.(item.panelId)
      return
    }
    if (action === 'allow') onAllow?.(item.panelId)
    else if (action === 'deny') onDeny?.(item.panelId)
    else if (action === 'diff') onDiff?.(item.panelId)
    else if (action === 'restart') onRestart?.([item.panelId])
  }

  return (
    <section className="sessions-host" data-sessions-host aria-label="Sessions" data-sessions-attention={attention.length > 0 ? String(attention.length) : undefined}>
      <header className="sessions-host__bar">
        <h1 className="sessions-host__title" data-sessions-title>{sessionsTitle(board.facts)}</h1>
        {spend !== null && <span className="sessions-spend" data-sessions-spend>{spend}</span>}
        <div className="sessions-host__tools">
          <button type="button" className="sessions-new" data-sessions-new {...shellControl(() => { onNewSession?.() })}>+ New session</button>
          {onShowOrchestrate !== undefined && (
            <button type="button" className="sessions-host__orch" data-sessions-orchestrate title="Show Orchestrate"
              {...shellControl(onShowOrchestrate)}>Orchestrate</button>
          )}
        </div>
      </header>
      <SessionsView
        facts={board.facts}
        tasks={board.tasks}
        theme={theme}
        items={cards}
        names={names}
        selected={selected}
        openId={openId}
        stateFilter={stateFilter}
        onStateFilter={setStateFilter}
        onToggle={toggle}
        onOpen={setOpenId}
        onCard={onCard}
        onPause={(ids) => { onPause?.(ids) }}
        onRestart={(ids) => { onRestart?.(ids) }}
        onMove={(ids, taskId) => { onMove?.(ids, taskId) }}
        onEnd={end}
        onDetailPause={() => { if (open !== undefined) onPause?.([open.id]) }}
        onDetach={() => { if (open !== undefined) onDetach?.(open.id) }}
        onDetailEnd={() => { if (open !== undefined) end([open.id]) }}
        onShow={() => { if (open !== undefined) onShowOnCanvas?.(open.id) }}
        onSend={(text) => { if (open !== undefined) send(open, text) }}
      />
    </section>
  )
}
