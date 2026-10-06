/**
 * M446. The Keyboard page. Rows are `keyboardSections` — the registry walk —
 * so a chord added to shortcuts.ts appears here without a second list.
 */

import { useEffect, useState, type JSX } from 'react'
import {
  conflictBanner,
  filterSections,
  keyboardSections,
  proposeOverride,
  sectionPurpose,
  type ShortcutOverride
} from '@shared/shortcut-overrides'
import { RECORDING_HINT, stepFromKey } from './recorder'

export function KeyboardPane({
  purpose,
  overrides,
  onSave
}: {
  purpose: string
  overrides: readonly ShortcutOverride[]
  onSave: (next: ShortcutOverride[]) => void
}): JSX.Element {
  const [query, setQuery] = useState('')
  const [recordingId, setRecordingId] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [clashId, setClashId] = useState<string | null>(null)
  const banner = conflictBanner()
  const sections = filterSections(keyboardSections(overrides), query)

  useEffect(() => {
    if (recordingId === null) return
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target
      if (target instanceof HTMLElement && target.closest('input, textarea')) {
        // Escape still cancels a recording that started before the search took focus.
        if (event.key === 'Escape' && !event.metaKey && !event.altKey && !event.shiftKey && !event.ctrlKey) setRecordingId(null)
        return
      }
      event.preventDefault()
      event.stopPropagation()
      const step = stepFromKey(event)
      if (step.kind === 'pending') return
      if (step.kind === 'cancel') {
        setRecordingId(null)
        return
      }
      const result = proposeOverride(recordingId, step.chord, overrides)
      setRecordingId(null)
      if (!result.ok) {
        setRefusal(result.reason)
        setClashId(result.clashId ?? null)
        return
      }
      setRefusal(null)
      setClashId(null)
      onSave(result.overrides)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recordingId, overrides, onSave])

  const start = (id: string): void => {
    setRefusal(null)
    setClashId(null)
    setRecordingId(id)
  }

  return (
    <div className="rd-settings__keys-page">
      <p className="rd-settings__lead" data-settings-purpose>{purpose}</p>
      <div className="rd-settings__tools">
        <input
          className="rd-settings__search"
          data-settings-search
          type="search"
          placeholder="Search shortcuts"
          aria-label="Search shortcuts"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          type="button"
          data-settings-reset
          onClick={() => {
            setRecordingId(null)
            setRefusal(null)
            setClashId(null)
            onSave([])
          }}
        >Reset to defaults</button>
      </div>
      {banner !== null && (
        <div className="rd-settings__banner" data-conflict-banner>
          <p>{banner.text}</p>
          <button type="button" data-conflict-change onClick={() => start(banner.changeId)}>Change…</button>
        </div>
      )}
      {refusal !== null && <p className="rd-settings__refusal" role="alert">{refusal}</p>}
      {sections.length === 0 && <p className="rd-settings__lead">No shortcut matches that search.</p>}
      {sections.map((section) => (
        <section key={section.group} data-shortcut-group={section.group}>
          <h2 className="rd-settings__group">{section.group}</h2>
          <p className="rd-settings__group-note">{sectionPurpose(section.group)}</p>
          <ul className="rd-settings__rows">
            {section.rows.map((row) => {
              // An alias is folded onto its target, so a clash with tidy-alias
              // has to light the Tidy row — there is no second row to point at.
              const clashing = clashId === row.id || clashId === row.alias?.id
              return (
              <li
                key={row.id}
                className="rd-settings__row"
                data-shortcut-id={row.id}
                {...(clashing ? { 'data-clash': 'true' } : {})}
                {...(recordingId === row.id ? { 'data-recording': 'true' } : {})}
              >
                <span className="rd-settings__name">
                  {row.label}
                  {row.alias !== undefined && (
                    <span className="rd-settings__alias" data-alias-id={row.alias.id}>
                      {row.alias.kept ? `was ${row.alias.chord} · kept for one release` : `also ${row.alias.chord}`}
                    </span>
                  )}
                </span>
                {recordingId === row.id ? (
                  <span className="rd-settings__recording">{RECORDING_HINT}</span>
                ) : (
                  <kbd className="rd-settings__kbd">{row.chord}</kbd>
                )}
                {row.recordable && (
                  <button type="button" data-shortcut-change onClick={() => start(row.id)}>Change…</button>
                )}
              </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
