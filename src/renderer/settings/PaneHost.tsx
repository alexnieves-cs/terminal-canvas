/**
 * M446. A settings page that is the schema's own rows.
 *
 * Boolean and enum write through settings:set, the same door the palette
 * uses. A number or a path is shown, not re-edited here: the palette already
 * refuses an out-of-range number, and a second editor would be a second
 * bound. The purpose sentence is the page, so a category with rows is never
 * a blank panel.
 */

import { type JSX } from 'react'
import type { SettingRow } from '@shared/ipc-contract'
import { settingDef, type SettingValue } from '@shared/settings-schema'

export function PaneHost({ purpose, rows }: { purpose: string; rows: readonly SettingRow[] }): JSX.Element {
  return (
    <div className="rd-settings__host">
      <p className="rd-settings__lead" data-settings-purpose>{purpose}</p>
      <ul className="rd-settings__rows">
        {rows.map((row) => <SettingLine key={row.id} row={row} />)}
      </ul>
    </div>
  )
}

function shown(row: SettingRow): string {
  if (row.type === 'boolean') return row.value === true ? 'On' : 'Off'
  const key = String(row.value)
  return settingDef(row.id)?.valueLabels?.[key] ?? key
}

function SettingLine({ row }: { row: SettingRow }): JSX.Element {
  const write = (value: SettingValue): void => {
    void window.canvas.settings.set(row.id, value)
  }
  return (
    <li className="rd-settings__row" data-setting-id={row.id}>
      <span className="rd-settings__name">
        {row.label}
        <span className="rd-settings__hint">{row.description}</span>
      </span>
      {row.type === 'boolean' ? (
        <button type="button" aria-pressed={row.value === true} aria-label={`${row.label}, ${shown(row)}`} onClick={() => write(row.value !== true)}>{shown(row)}</button>
      ) : row.type === 'enum' && (row.values?.length ?? 0) > 0 ? (
        <button type="button" aria-label={`${row.label}, ${shown(row)}`} onClick={() => {
          const values = row.values ?? []
          const index = values.indexOf(String(row.value))
          const next = values[(index + 1) % values.length]
          if (next !== undefined) write(next)
        }}>{shown(row)}</button>
      ) : row.type === 'text' ? (
        <span className="rd-settings__path">{shown(row)}</span>
      ) : (
        <span className="rd-settings__value">{shown(row)}</span>
      )}
    </li>
  )
}
