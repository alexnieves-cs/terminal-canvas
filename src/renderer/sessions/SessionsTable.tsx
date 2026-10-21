import type { JSX } from 'react'
import type { PaletteTheme } from '@shared/state-palette'
import { useMachineSeries } from '@renderer/session/machine-cost-store'
import { shellControl } from '@renderer/shell/shell-control'
import { toneIsRunning, toneNeedsYou } from '@renderer/panels/panel-state'
import { Sparkline } from './Sparkline'
import { bulkBar, bulkEligible, formatRun, formatUsd, groupHeading, groupRows, type SessionFact, type SessionGroup, type SessionSourceTask } from './sessions-model'

const COLUMNS = ['Session', 'Agent', 'Folder', 'Branch', 'State', 'Activity', 'Run', 'Cost', 'Last line'] as const
type Column = typeof COLUMNS[number]

/**
 * M514. The rest rule, applied to a column: a column with nothing in any row
 * is a zero-value statement repeated down the page (the gallery's Sessions
 * scene showed four blank columns for eleven asleep rows). A column shows
 * when ONE row has something to say in it. Activity stays while any session
 * is live, because its live samples arrive after this render
 * (useMachineSeries) and a column that appears a second later jumps the table.
 */
export function visibleColumns(facts: readonly SessionFact[]): ReadonlySet<Column> {
  const live = (fact: SessionFact): boolean => toneIsRunning(fact.tone) || toneNeedsYou(fact.tone)
  const shown = new Set<Column>(['Session', 'Agent', 'Folder', 'State'])
  if (facts.some((fact) => fact.branch !== '')) shown.add('Branch')
  if (facts.some((fact) => live(fact) || fact.activity.length >= 2)) shown.add('Activity')
  if (facts.some((fact) => formatRun(fact.startedAt, fact.now) !== '')) shown.add('Run')
  if (facts.some((fact) => fact.costUsd !== null && fact.costUsd > 0)) shown.add('Cost')
  if (facts.some((fact) => fact.lastLine !== '')) shown.add('Last line')
  return shown
}

function samplesOf(id: string, activity: readonly number[]): readonly number[] {
  const live = useMachineSeries(id)
  if (live.length >= 2) return live.map((sample) => sample.cpuPercent)
  return activity
}

function Row({ row, cols, theme, selected, open, onToggle, onOpen, onShowInWorld }: {
  row: SessionFact
  cols: ReadonlySet<Column>
  theme: PaletteTheme
  selected: boolean
  open: boolean
  onToggle: (id: string) => void
  onOpen: (id: string) => void
  onShowInWorld: (id: string) => void
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
      <td>
        <button type="button" className="sessions-name" data-session-open={row.id} {...shellControl(() => onOpen(row.id))}>{row.name}</button>
        <button
          type="button"
          className="sessions-world"
          data-session-world={row.id}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onShowInWorld(row.id)
          }}
        >Show in World</button>
      </td>
      <td>{row.agent}</td>
      <td className="sessions-path">{row.folder}</td>
      {cols.has('Branch') && <td className="sessions-path">{row.branch}</td>}
      <td><span className="sessions-state" data-tone={row.tone}>{row.word}</span></td>
      {cols.has('Activity') && <td><Sparkline samples={samples} tone={row.tone} theme={theme} /></td>}
      {cols.has('Run') && <td className="sessions-run">{formatRun(row.startedAt, row.now)}</td>}
      {cols.has('Cost') && <td className="sessions-cost">{cost}</td>}
      {cols.has('Last line') && <td className="sessions-line">{row.lastLine}</td>}
    </tr>
  )
}

function Group({ group, cols, theme, selected, openId, onToggle, onOpen, onShowInWorld }: {
  group: SessionGroup
  cols: ReadonlySet<Column>
  theme: PaletteTheme
  selected: ReadonlySet<string>
  openId: string | null
  onToggle: (id: string) => void
  onOpen: (id: string) => void
  onShowInWorld: (id: string) => void
}): JSX.Element {
  const heading = groupHeading(group)
  return (
    <>
      {heading !== null && (
        <tr className="sessions-group" data-session-group={group.id}>
          <td colSpan={cols.size + 1}>{heading}</td>
        </tr>
      )}
      {group.rows.map((row) => (
        <Row key={row.id} row={row} cols={cols} theme={theme} selected={selected.has(row.id)} open={openId === row.id} onToggle={onToggle} onOpen={onOpen} onShowInWorld={onShowInWorld} />
      ))}
    </>
  )
}

export function SessionsTable({ facts, theme, selected, openId, tasks, onToggle, onOpen, onPause, onRestart, onMove, onEnd, onShowInWorld }: {
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
  onShowInWorld: (id: string) => void
}): JSX.Element {
  const groups = groupRows(facts)
  const cols = visibleColumns(facts)
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
              {COLUMNS.filter((column) => cols.has(column)).map((column) => <th key={column} scope="col">{column}</th>)}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <Group key={group.id === '' ? 'loose' : group.id} group={group} cols={cols} theme={theme} selected={selected} openId={openId} onToggle={onToggle} onOpen={onOpen} onShowInWorld={onShowInWorld} />
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
