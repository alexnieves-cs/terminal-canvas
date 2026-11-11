/**
 * M446. A settings page that is the schema's own rows.
 *
 * Every row writes through settings:set, the same door the palette uses.
 * M641 (lane W): a number and a line of text are edited HERE too. The page
 * used to show them as plain values ("260", an empty Notes folder) with no
 * way to change one short of knowing the palette edits settings. The bound is
 * still the schema's (`min`/`max` ride on the row), so this is a second door
 * to one rule, not a second rule; main's own range check stays the authority.
 */

import { useEffect, useState, type JSX } from 'react'
import type { SettingRow } from '@shared/ipc-contract'
import { settingDef, type SettingValue } from '@shared/settings-schema'
import { FULL_SETTING } from '@shared/labs'
import { hostedWords } from '@shared/hosted-keys'
import { isHosted } from '@renderer/hosted'
import { sectionsFor } from './panes'

export function PaneHost({ purpose, rows }: { purpose: string; rows: readonly SettingRow[] }): JSX.Element {
  const full = rows.find((row) => row.id === FULL_SETTING)?.value === true
  const sections = sectionsFor(rows, full || !rows.some((row) => row.id === FULL_SETTING))
  return (
    <div className="rd-settings__host">
      <p className="rd-settings__lead" data-settings-purpose>{purpose}</p>
      {sections.map((section) => (
        <section key={section.title} className="rd-settings__section" data-settings-section={section.title}>
          {sections.length > 1 && <h2 className="rd-settings__section-title">{section.title}</h2>}
          <ul className="rd-settings__rows">
            {section.rows.map((row) => <SettingLine key={row.id} row={row} />)}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** A stored word, as a person reads it: the schema's own label, else the word with a capital. */
export function shownValue(row: Pick<SettingRow, 'id' | 'type' | 'value'>): string {
  if (row.type === 'boolean') return row.value === true ? 'On' : 'Off'
  const key = String(row.value)
  const label = settingDef(row.id)?.valueLabels?.[key]
  if (label !== undefined) return label
  return row.type === 'enum' && key !== '' ? key.charAt(0).toUpperCase() + key.slice(1) : key
}

/** The description is a palette subtitle first (lower case, no stop); on the page it is a sentence. */
function sentence(text: string): string {
  const t = text.trim()
  if (t === '') return t
  const head = t.charAt(0).toUpperCase() + t.slice(1)
  return /[.!?…]$/.test(head) ? head : `${head}.`
}

/** Why a typed number is refused, or null when it may be written. The schema's own bounds. */
export function numberRefusal(text: string, min?: number, max?: number): string | null {
  const t = text.trim()
  if (t === '' || !/^-?\d+(\.\d+)?$/.test(t)) return 'Type a number'
  const n = Number(t)
  if (min !== undefined && n < min) return `At least ${min}`
  if (max !== undefined && n > max) return `At most ${max}`
  return null
}

function SettingLine({ row }: { row: SettingRow }): JSX.Element {
  const write = (value: SettingValue): void => {
    void window.canvas.settings.set(row.id, value)
  }
  const mode = row.id === FULL_SETTING
  return (
    <li className="rd-settings__row" data-setting-id={row.id} data-setting-mode={mode ? '' : undefined}>
      <span className="rd-settings__name">
        {mode ? 'Simple or Full' : row.label}
        <span className="rd-settings__hint">{sentence(isHosted() ? hostedWords(row.description) : row.description)}</span>
      </span>
      {mode ? (
        // Two named choices, not On/Off: "Full mode, Off" does not say what Off is.
        <span className="rd-settings__choice" role="group" aria-label="Mode">
          <button type="button" aria-pressed={row.value !== true} onClick={() => write(false)}>Simple</button>
          <button type="button" aria-pressed={row.value === true} onClick={() => write(true)}>Full</button>
        </span>
      ) : row.type === 'boolean' ? (
        <button type="button" className="rd-settings__switch" role="switch" aria-checked={row.value === true} aria-label={`${row.label}, ${shownValue(row)}`} onClick={() => write(row.value !== true)}>{shownValue(row)}</button>
      ) : row.type === 'enum' && (row.values?.length ?? 0) > 0 ? (
        <select className="rd-settings__select" aria-label={row.label} value={String(row.value)} onChange={(event) => write(event.target.value)}>
          {(row.values ?? []).map((value) => <option key={value} value={value}>{shownValue({ id: row.id, type: 'enum', value })}</option>)}
        </select>
      ) : (
        <SettingField row={row} onWrite={write} />
      )}
    </li>
  )
}

/** A number or a line of text. Enter or leaving the field writes it; Escape puts the stored value back. */
function SettingField({ row, onWrite }: { row: SettingRow; onWrite: (value: SettingValue) => void }): JSX.Element {
  const stored = String(row.value ?? '')
  const [text, setText] = useState(stored)
  const [refusal, setRefusal] = useState<string | null>(null)
  // A write from elsewhere (the palette, a drag on the inspector's edge) shows here.
  useEffect(() => { setText(stored); setRefusal(null) }, [stored])
  const numeric = row.type === 'number'
  const commit = (): void => {
    if (text === stored) { setRefusal(null); return }
    if (numeric) {
      const why = numberRefusal(text, row.min, row.max)
      if (why !== null) { setRefusal(why); return }
      onWrite(Number(text.trim()))
    } else {
      onWrite(text.trim())
    }
    setRefusal(null)
  }
  return (
    <span className="rd-settings__field">
      <input
        data-edit-owner=""
        className={numeric ? 'rd-settings__input rd-settings__input--number' : 'rd-settings__input'}
        inputMode={numeric ? 'decimal' : undefined}
        aria-label={row.label}
        aria-invalid={refusal !== null}
        value={text}
        placeholder={numeric ? undefined : 'Not set'}
        onChange={(event) => { setText(event.target.value); if (refusal !== null) setRefusal(null) }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); commit() }
          else if (event.key === 'Escape' && text !== stored) { event.preventDefault(); event.stopPropagation(); setText(stored); setRefusal(null) }
        }}
      />
      {refusal !== null && <span className="rd-settings__refusal" role="alert">{refusal}</span>}
    </span>
  )
}
