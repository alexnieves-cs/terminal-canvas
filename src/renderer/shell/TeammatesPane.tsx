import { memo, useState, type JSX } from 'react'
import { shellControl } from './shell-control'
import { ChevronLeft, Plus } from '@renderer/icons'
import { teammateWord, type PersistedTeammate } from '@shared/teammates'

/**
 * M100. THE TEAMMATES PANE — the navigator's sixth pane: the roster, and one
 * teammate's record open beneath it.
 *
 * A place is CHOSEN through the OS folder dialog (`onAddPlace`), never
 * typed: a typo cannot widen a teammate's reach, and the dialog answers an
 * absolute path, which is the only kind `parseTeammates` keeps. The three
 * permissions are three separate controls (places, services, schedule) —
 * they fail differently, and one flag would hide which the user granted.
 *
 * Presentational: every write goes through the callbacks Canvas owns.
 */
export interface TeammatesPaneProps {
  onToggle: () => void
  teammates: readonly PersistedTeammate[]
  /** Three states: not asked yet, asked and empty, a roster. */
  loaded: boolean
  selectedId: string | null
  onSelect: (id: string | null) => void
  onCreate: (name: string) => void
  onSave: (teammate: PersistedTeammate) => void
  onDelete: (id: string) => void
  /** Opens the folder dialog; the chosen folder is appended to the teammate's places. */
  onAddPlace: (id: string) => void
  /** Start a chat as this teammate — refused by name (through the sheet's own rule) with no places. */
  onChat: (id: string) => void
  /** M102. Every service the app knows, for the grant toggles. */
  services: readonly { id: string; label: string; connected: boolean }[]
}

function TeammatesPaneImpl(props: TeammatesPaneProps): JSX.Element {
  const [draft, setDraft] = useState('')
  const [armed, setArmed] = useState<string | null>(null)
  const selected = props.teammates.find((t) => t.id === props.selectedId) ?? null
  const submitNew = (): void => {
    const name = draft.trim()
    if (name === '') return
    props.onCreate(name)
    setDraft('')
  }
  return (
    <div className="shell__tree teammates-pane" aria-label="Teammates" data-teammates-pane>
      <div className="shell__region-title shell__region-title--action navigator__header">
        <span className="shell__tree-root">Teammates</span>
        <span className="navigator__header-actions">
          <button type="button" className="shell__rail-toggle icon-button" title="Hide the navigator" aria-label="Hide the navigator" {...shellControl(props.onToggle)}><ChevronLeft /></button>
        </span>
      </div>
      <div className="teammates-pane__new">
        <input className="teammates-pane__name" data-teammates-new placeholder="a new teammate's name…" value={draft}
          onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submitNew() }} />
        <button type="button" className="shell__region-add icon-button" data-teammates-add title="Add this teammate" aria-label="Add this teammate" disabled={draft.trim() === ''} {...shellControl(submitNew)}><Plus /></button>
      </div>
      {!props.loaded ? (
        <p className="pf__note" data-teammates-note>reading the roster…</p>
      ) : props.teammates.length === 0 ? (
        <p className="pf__note" data-teammates-note>no teammates yet — name one above; it starts with no places, no services and no schedule</p>
      ) : (
        <ul className="rail-list rail-list--teammates" data-teammates-list>
          {props.teammates.map((t) => (
            <li key={t.id} className={`rail-row${t.id === props.selectedId ? ' rail-row--selected' : ''}`} data-teammate-row={t.id} aria-selected={t.id === props.selectedId}>
              <button type="button" className="rail-row__main" {...shellControl(() => props.onSelect(t.id === props.selectedId ? null : t.id))}>
                <span className="rail-row__label">{teammateWord(t)}</span>
                <span className="rail-row__tail">{t.places.length} place{t.places.length === 1 ? '' : 's'} · {t.services.length} service{t.services.length === 1 ? '' : 's'}{t.scheduling ? ' · scheduled' : ''}{t.messaging ? ' · messaging' : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected !== null && (
        <div className="teammates-pane__detail" data-teammate-detail={selected.id}>
          <div className="shell__region-title">{teammateWord(selected)}</div>
          <label className="teammates-pane__field">
            <span className="teammates-pane__label">brief</span>
            <textarea className="teammates-pane__brief" data-teammate-brief defaultValue={selected.brief} key={selected.id}
              placeholder="what this teammate is for — appended to every spawn's system prompt"
              onBlur={(e) => { if (e.target.value !== selected.brief) props.onSave({ ...selected, brief: e.target.value }) }} />
          </label>
          <div className="teammates-pane__field">
            <span className="teammates-pane__label">places</span>
            {selected.places.length === 0 && <p className="pf__note" data-teammate-no-places>no places — this teammate can touch nothing until you add a folder</p>}
            <ul className="teammates-pane__list">
              {selected.places.map((p) => (
                <li key={p} className="teammates-pane__item" data-teammate-place={p}>
                  <span className="teammates-pane__path" title={p}>{p}</span>
                  <button type="button" className="pf__verb pf__verb--word" title={`Remove ${p} from this teammate's places`} {...shellControl(() => props.onSave({ ...selected, places: selected.places.filter((x) => x !== p) }))}>remove</button>
                </li>
              ))}
            </ul>
            <button type="button" className="pf__verb pf__verb--word" data-teammate-add-place title="Choose a folder this teammate may touch" {...shellControl(() => props.onAddPlace(selected.id))}>add a place…</button>
          </div>
          <div className="teammates-pane__field">
            <span className="teammates-pane__label">services</span>
            {props.services.length === 0 && <p className="pf__note">no services declared</p>}
            <ul className="teammates-pane__list">
              {props.services.map((svc) => {
                const granted = selected.services.includes(svc.id)
                return (
                  <li key={svc.id} className="teammates-pane__item" data-teammate-service={svc.id}>
                    <span>{svc.label}{svc.connected ? '' : ' — not connected'}</span>
                    <button type="button" className="pf__verb pf__verb--word" data-teammate-service-toggle={svc.id}
                      title={granted ? `Revoke ${svc.label} from this teammate` : `Grant ${svc.label} to this teammate — it spends the app's credential through the broker`}
                      {...shellControl(() => props.onSave({ ...selected, services: granted ? selected.services.filter((x) => x !== svc.id) : [...selected.services, svc.id] }))}>{granted ? 'revoke' : 'grant'}</button>
                  </li>
                )
              })}
            </ul>
          </div>
          <div className="teammates-pane__field teammates-pane__flags">
            <label><input type="checkbox" data-teammate-messaging checked={selected.messaging} onChange={(e) => props.onSave({ ...selected, messaging: e.target.checked })} /> may be messaged by other teammates</label>
            <label><input type="checkbox" data-teammate-scheduling checked={selected.scheduling} onChange={(e) => props.onSave({ ...selected, scheduling: e.target.checked })} /> may be scheduled (routines)</label>
          </div>
          <div className="teammates-pane__field teammates-pane__actions">
            <button type="button" className="inspector__action" data-teammate-chat disabled={selected.places.length === 0}
              title={selected.places.length === 0 ? 'add a place first — a teammate with no places can work nowhere' : `Start a chat as ${teammateWord(selected)}`}
              {...shellControl(() => { if (selected.places.length > 0) props.onChat(selected.id) })}>Chat as {teammateWord(selected)}</button>
            <button type="button" className={`inspector__action inspector__action--danger${armed === selected.id ? ' inspector__action--armed' : ''}`} data-teammate-delete
              title={armed === selected.id ? 'Press again to delete' : 'Delete this teammate (its chats stay; they lose their identity)'}
              {...shellControl(() => { if (armed === selected.id) { props.onDelete(selected.id); setArmed(null) } else setArmed(selected.id) })}>{armed === selected.id ? 'Delete?' : 'Delete'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

export const TeammatesPane = memo(TeammatesPaneImpl)
