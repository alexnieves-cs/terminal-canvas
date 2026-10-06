import type { JSX } from 'react'
import type { PaletteTheme } from '@shared/state-palette'
import { useMachineSeries } from '@renderer/session/machine-cost-store'
import { shellControl } from '@renderer/shell/shell-control'
import { Sparkline } from './Sparkline'
import { bulkBar, bulkEligible, formatRun, formatUsd, groupHeading, groupRows, type SessionFact, type SessionGroup, type SessionSourceTask } from './sessions-model'

const COLUMNS = ['Session', 'Agent', 'Folder', 'Branch', 'State', 'Activity', 'Run', 'Cost', 'Last line'] as const

function samplesOf(id: string, activity: readonly number[]): readonly number[] {
  const live = useMachineSeries(id)
  if (live.length >= 2) return live.map((sample) => sample.cpuPercent)
  return activity
}

function Row({ row, theme, selected, open, onToggle, onOpen }: {
  row: SessionFact
  theme: PaletteTheme
  selected: boolean
  open: boolean
  onToggle: (id: string) => void
  onOpen: (id: string) => void
}): JSX.Element {
  const samples = samplesOf(row.id, row.activity)
  const cost = row.costUsd !== null && row.costUsd > 0 ? formatUsd(row.costUsd) : ''
  return (
    <tr data-session-row={row.id} data-selected={selected ? '' : undefined} data-open={open ? '' : undefined} onClick={() => onOpen(row.id)}>
      <td>
        <input
          type="checkbox"
          aria-label={`Select ${row.name}`}
          data-session-select={row.id}
          checked={selected}
          onClick={(event) => event.stopPropagation()}
          onChange={() => onToggle(row.id)}
        />
      </td>
      <td><button type="button" className="sessions-name" data-session-open={row.id} {...shellControl(() => onOpen(row.id))}>{row.name}</button></td>
      <td>{row.agent}</td>
      <td className="sessions-path">{row.folder}</td>
      <td className="sessions-path">{row.branch}</td>
      <td><span className="sessions-state" data-tone={row.tone}>{row.word}</span></td>
      <td><Sparkline samples={samples} tone={row.tone} theme={theme} /></td>
      <td>{formatRun(row.startedAt, row.now)}</td>
      <td className="sessions-cost">{cost}</td>
      <td className="sessions-line">{row.lastLine}</td>
    </tr>
  )
}

function Group({ group, theme, selected, openId, onToggle, onOpen }: {
  group: SessionGroup
  theme: PaletteTheme
  selected: ReadonlySet<string>
  openId: string | null
  onToggle: (id: string) => void
  onOpen: (id: string) => void
}): JSX.Element {
  const heading = groupHeading(group)
  return (
    <>
      {heading !== null && (
        <tr className="sessions-group" data-session-group={group.id}>
          <td colSpan={COLUMNS.length + 1}>{heading}</td>
        </tr>
      )}
      {group.rows.map((row) => (
        <Row key={row.id} row={row} theme={theme} selected={selected.has(row.id)} open={openId === row.id} onToggle={onToggle} onOpen={onOpen} />
      ))}
    </>
  )
}

export function SessionsTable({ facts, theme, selected, openId, tasks, onToggle, onOpen, onPause, onRestart, onMove, onEnd }: {
  facts: readonly SessionFact[]
  theme: PaletteTheme
  selected: ReadonlySet<string>
  openId: string | null
  tasks: readonly SessionSourceTask[]
  onToggle: (id: string) => void
  onOpen: (id: string) => void
  onPause: (ids: readonly string[]) => void
  onRestart: (ids: readonly string[]) => void
  onMove: (ids: readonly string[], taskId: string) => void
  onEnd: (ids: readonly string[]) => void
}): JSX.Element {
  const groups = groupRows(facts)
  const ids = [...selected]
  const chosen = facts.filter((fact) => selected.has(fact.id))
  const bar = bulkBar(chosen.length)
  const eligible = bulkEligible(chosen)
  return (
    <div className="sessions-table-wrap" data-sessions-table>
      {facts.length === 0 ? (
        <p className="sessions-empty">No sessions on this canvas — a terminal or a conversation is one.</p>
      ) : (
        <table className="sessions-table">
          <thead>
            <tr>
              <th scope="col"><span className="sessions-check-col">Select</span></th>
              {COLUMNS.map((column) => <th key={column} scope="col">{column}</th>)}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <Group key={group.id === '' ? 'loose' : group.id} group={group} theme={theme} selected={selected} openId={openId} onToggle={onToggle} onOpen={onOpen} />
            ))}
          </tbody>
        </table>
      )}
      {bar !== null && (
        <div className="sessions-bulk" data-sessions-bulk>
          <span>{bar.label}</span>
          <button type="button" disabled={!eligible.pause} {...shellControl(() => { if (eligible.pause) onPause(ids) })}>Pause</button>
          <button type="button" disabled={!eligible.restart} {...shellControl(() => { if (eligible.restart) onRestart(ids) })}>Restart</button>
          <select
            className="sessions-move"
            aria-label="Move to task…"
            disabled={!eligible.move}
            defaultValue=""
            onChange={(event) => {
              const taskId = event.target.value
              event.target.value = ''
              if (taskId !== '' && eligible.move) onMove(ids, taskId)
            }}
          >
            <option value="">Move to task…</option>
            {tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
          </select>
          <button type="button" data-sessions-end disabled={!eligible.end} {...shellControl(() => { if (eligible.end) onEnd(ids) })}>End</button>
        </div>
      )}
    </div>
  )
}
