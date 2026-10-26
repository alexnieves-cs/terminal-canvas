/**
 * M446. Settings, the screen. The nav is SETTINGS_PANES. Keyboard renders
 * the registry; every other page renders the schema rows for its categories.
 */

import { useEffect, useRef, useState, type JSX } from 'react'
import type { SettingRow } from '@shared/ipc-contract'
import { type SettingDef } from '@shared/settings-schema'
import { encodeOverrideList, parseOverrideList, type ShortcutOverride } from '@shared/shortcut-overrides'
import { KeyboardPane } from './KeyboardPane'
import { PaneHost } from './PaneHost'
import { useModalFocus } from '@renderer/primitives'
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
  // M600. Settings owns the window: Tab stays on the page and focus returns on close.
  const rootRef = useRef<HTMLDivElement>(null)
  useModalFocus(rootRef)
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

  // Escape leaves the page, the way every other sheet in the app is left.
  //
  // Read in the CAPTURE phase on the window, ahead of the document. A
  // force-mounted menu (View, Account) keeps a live Radix dismissable layer
  // while it is CLOSED, and the highest layer takes every Escape on the
  // document and prevents its default: a listener that bailed on
  // defaultPrevented never closed Settings once either menu had mounted
  // (settings.dismiss.1, red on every run). So the page decides first, and
  // stands aside for the two things that own Escape over it: a shortcut being
  // recorded (KeyboardPane cancels it) and a menu or the palette that is
  // actually open.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return
      if (document.querySelector('[data-settings-root] [data-recording]') !== null) return
      // Shown, not merely mounted: a closed force-mounted menu is still in the DOM.
      const shown = (el: Element): boolean => el.closest('[hidden]') === null && el.getClientRects().length > 0
      if ([...document.querySelectorAll('[role="menu"], .palette')].some(shown)) return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const current = settingsPane(pane)
  const stored = rows.find((row) => row.id === 'keyboard.overrides')
  const overrides = parseOverrideList(Array.isArray(stored?.value) ? stored.value.filter((item): item is string => typeof item === 'string') : [])
  const save = (next: ShortcutOverride[]): void => {
    void window.canvas.settings.set('keyboard.overrides', encodeOverrideList(next))
  }

  return (
    <div
      ref={rootRef}
      className="rd-settings"
      data-settings-root
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <nav className="rd-settings__nav" aria-label="Settings pages">
        {/* M600. The way out sits where the eye starts, not at the foot of the
            nav where a short window scrolls it away. Escape works too. */}
        <button type="button" className="rd-settings__back" data-settings-back title="Back to the canvas (Esc)" onClick={onClose}>← Back to canvas</button>
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
