import { useEffect, useState, type JSX } from 'react'
import type { AttentionItem } from '@shared/redesign-contracts'
import type { PaletteTheme } from '@shared/state-palette'
import { useMachineSeries } from '@renderer/session/machine-cost-store'
import { AttentionCards } from './AttentionCards'
import { SessionDetail } from './SessionDetail'
import { SessionsTable } from './SessionsTable'
import { filterFacts, stateWords, type CardAction, type SessionFact, type SessionSourceTask } from './sessions-model'

/**
 * M445. The page under the host bar: the queue's cards, the task table,
 * and one detail. The host owns the selection and the callbacks. This
 * file does not read a store except the sparkline's own series, and it
 * does not build a queue.
 */
export function SessionsView({ facts, tasks, theme, items, names, selected, openId, stateFilter, onStateFilter, onToggle, onOpen, onCard, onPause, onRestart, onMove, onEnd, onShowInWorld, onDetailPause, onDetach, onDetailEnd, onShow, onSend }: {
  facts: readonly SessionFact[]
  tasks: readonly SessionSourceTask[]
  theme: PaletteTheme
  items: readonly AttentionItem[]
  names: ReadonlyMap<string, string>
  selected: ReadonlySet<string>
  openId: string | null
  stateFilter: string | null
  onStateFilter: (word: string | null) => void
  onToggle: (id: string) => void
  onOpen: (id: string) => void
  onCard: (item: AttentionItem, action: CardAction['id']) => void
  onPause: (ids: readonly string[]) => void
  onRestart: (ids: readonly string[]) => void
  onMove: (ids: readonly string[], taskId: string) => void
  onEnd: (ids: readonly string[]) => void
  onShowInWorld: (id: string) => void
  onDetailPause: () => void
  onDetach: () => void
  onDetailEnd: () => void
  onShow: () => void
  onSend: (text: string) => void
}): JSX.Element {
  const words = stateWords(facts)
  const word = stateFilter !== null && words.includes(stateFilter) ? stateFilter : null
  const shown = filterFacts(facts, word)
  const open = openId === null ? undefined : facts.find((fact) => fact.id === openId)
  return (
    <div className="sessions-body">
      <div className="sessions-main">
        <AttentionCards items={items} names={names} onAction={onCard} />
        <div className="sessions-tools" data-sessions-tools>
          <label className="sessions-tool">
            Group
            <select data-sessions-group="task" aria-label="Group" value="task" onChange={() => { /* Task is the only grouping this page has. */ }}>
              <option value="task">Task</option>
            </select>
          </label>
          <label className="sessions-tool">
            <span className="sessions-tool__name">State</span>
            <select
              data-sessions-state={word ?? ''}
              aria-label="All states"
              value={word ?? ''}
              onChange={(event) => onStateFilter(event.target.value === '' ? null : event.target.value)}
            >
              <option value="">All states</option>
              {words.map((stateWord) => <option key={stateWord} value={stateWord}>{stateWord}</option>)}
            </select>
          </label>
        </div>
        <SessionsTable
          facts={shown}
          theme={theme}
          selected={selected}
          openId={open?.id ?? null}
          tasks={tasks}
          onToggle={onToggle}
          onOpen={onOpen}
          onPause={onPause}
          onRestart={onRestart}
          onMove={onMove}
          onEnd={onEnd}
          onShowInWorld={onShowInWorld}
        />
      </div>
      {open !== undefined && (
        <OpenDetail
          fact={open}
          theme={theme}
          onPause={onDetailPause}
          onDetach={onDetach}
          onEnd={onDetailEnd}
          onShow={onShow}
          onShowInWorld={() => { if (open !== undefined) onShowInWorld(open.id) }}
          onSend={onSend}
        />
      )}
    </div>
  )
}

function OpenDetail({ fact, theme, onPause, onDetach, onEnd, onShow, onShowInWorld, onSend }: {
  fact: SessionFact
  theme: PaletteTheme
  onPause: () => void
  onDetach: () => void
  onEnd: () => void
  onShow: () => void
  onShowInWorld: () => void
  onSend: (text: string) => void
}): JSX.Element {
  const live = useMachineSeries(fact.id)
  const samples = live.length >= 2 ? live.map((sample) => sample.cpuPercent) : fact.activity
  return <SessionDetail fact={fact} theme={theme} samples={samples} onPause={onPause} onDetach={onDetach} onEnd={onEnd} onShow={onShow} onShowInWorld={onShowInWorld} onSend={onSend} />
}

/** The palette the sparkline reads. `data-theme` is what the stylesheet already stamps. */
export function useSessionsTheme(): PaletteTheme {
  const [theme, setTheme] = useState<PaletteTheme>(() => readTheme())
  useEffect(() => {
    const sync = (): void => setTheme(readTheme())
    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])
  return theme
}

function readTheme(): PaletteTheme {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
}
