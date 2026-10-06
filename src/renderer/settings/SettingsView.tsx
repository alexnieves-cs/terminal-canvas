/**
 * M446. Settings, the screen. The nav is SETTINGS_PANES. Keyboard renders
 * the registry; every other page renders the schema rows for its categories.
 */

import { useEffect, useState, type JSX } from 'react'
import type { SettingRow } from '@shared/ipc-contract'
import { type SettingDef } from '@shared/settings-schema'
import { encodeOverrideList, parseOverrideList, type ShortcutOverride } from '@shared/shortcut-overrides'
import { KeyboardPane } from './KeyboardPane'
import { PaneHost } from './PaneHost'
import { rowsForPane, SETTINGS_PANES, settingsPane, type SettingsPaneId } from './panes'

export function SettingsView({
  pane,
  onPane,
  onClose
}: {
  pane: SettingsPaneId
  onPane: (id: SettingsPaneId) => void
  onClose: () => void
}): JSX.Element {
  const [rows, setRows] = useState<SettingRow[]>([])
  useEffect(() => {
    let stop = false
    const read = (): void => {
      if (typeof window.canvas?.settings?.list !== 'function') return
      void window.canvas.settings.list().then((next) => { if (!stop) setRows(next) })
    }
    read()
    const off = window.canvas.settings.onChanged(() => read())
    return () => { stop = true; off() }
  }, [])

  const current = settingsPane(pane)
  const stored = rows.find((row) => row.id === 'keyboard.overrides')
  const overrides = parseOverrideList(Array.isArray(stored?.value) ? stored.value.filter((item): item is string => typeof item === 'string') : [])
  const save = (next: ShortcutOverride[]): void => {
    void window.canvas.settings.set('keyboard.overrides', encodeOverrideList(next))
  }

  return (
    <div
      className="rd-settings"
      data-settings-root
      role="dialog"
      aria-label="Settings"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <nav className="rd-settings__nav" aria-label="Settings pages">
        <p className="rd-settings__brand">Settings</p>
        {SETTINGS_PANES.map((item) => (
          <button
            key={item.id}
            type="button"
            data-settings-pane={item.id}
            aria-current={item.id === pane ? 'page' : undefined}
            onClick={() => onPane(item.id)}
          >{item.label}</button>
        ))}
        <button type="button" className="rd-settings__close" onClick={onClose}>Close</button>
      </nav>
      <div className="rd-settings__main">
        <div className="rd-settings__sheet">
          <h1 className="rd-settings__title">{current.label}</h1>
          {pane === 'keyboard' ? (
            <KeyboardPane purpose={current.purpose} overrides={overrides} onSave={save} />
          ) : (
            <PaneHost purpose={current.purpose} rows={liveRows(rowsForPane(pane), rows)} />
          )}
        </div>
      </div>
    </div>
  )
}

function liveRows(defs: readonly SettingDef[], rows: readonly SettingRow[]): SettingRow[] {
  return defs.map((def) => {
    const live = rows.find((row) => row.id === def.id)
    if (live !== undefined) return live
    return {
      id: def.id,
      label: def.label,
      description: def.description,
      keywords: [...def.keywords],
      type: def.type,
      value: def.default,
      category: def.category,
      persisted: false,
      ...(def.values ? { values: [...def.values] } : {}),
      ...(def.min !== undefined ? { min: def.min } : {}),
      ...(def.max !== undefined ? { max: def.max } : {})
    }
  })
}
