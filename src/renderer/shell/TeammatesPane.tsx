import { WORK_ITEM_MIME } from '@shared/work-items'
import { memo, useState, type JSX } from 'react'
import { shellControl } from './shell-control'
import { ChevronLeft, Plus } from '@renderer/icons'
import { teammateWord, type PersistedTeammate } from '@shared/teammates'
import { everyWord, ROUTINE_LIMIT_WORD, type PersistedRoutine } from '@shared/routines'
import { displayPath } from '@shared/display-path'

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
  /** M114. A work item card dropped on a row: dispatch it to that teammate. */
  onDispatch?: (itemId: string, teammateId: string) => void
  /** Start a chat as this teammate — refused by name (through the sheet's own rule) with no places. */
  onChat: (id: string) => void
  /** M102. Every service the app knows, for the grant toggles. */
  services: readonly { id: string; label: string; connected: boolean }[]
  /** M101. Every routine; the pane shows the selected teammate's. */
  routines: readonly PersistedRoutine[]
  /** Answers the refusal sentence, or null when saved. */
  onSaveRoutine: (routine: PersistedRoutine) => Promise<string | null>
  onDeleteRoutine: (id: string) => void
  onRunRoutine: (id: string) => void
  onOpenLast: (panelId: string) => void
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
          <button type="button" className="shell__rail-toggle icon-button" title="Hide Teammates (⌘\)" aria-label="Hide Teammates" {...shellControl(props.onToggle)}><ChevronLeft /></button>
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
            <li key={t.id} className={`rail-row${t.id === props.selectedId ? ' rail-row--selected' : ''}`} data-teammate-row={t.id} aria-selected={t.id === props.selectedId}
              // M114. A drop target for a work item card ONLY: the MIME is the
              // board's own, so a file or text drag falls through untouched.
              onDragOver={(e) => { if (e.dataTransfer.types.includes(WORK_ITEM_MIME)) e.preventDefault() }}
              onDrop={(e) => { const itemId = e.dataTransfer.getData(WORK_ITEM_MIME); if (itemId === '') return; e.preventDefault(); props.onDispatch?.(itemId, t.id) }}>
              <button type="button" className="rail-row__main" {...shellControl(() => props.onSelect(t.id === props.selectedId ? null : t.id))}>
                <span className="rail-row__label">{teammateWord(t)}</span>
                {/* Short nouns so the PERMISSION word survives the row's width — the critic saw `1 service · s…`. */}
                <span className="rail-row__tail">{t.places.length} place{t.places.length === 1 ? '' : 's'} · {t.services.length} service{t.services.length === 1 ? '' : 's'}{t.scheduling ? ' · scheduled' : ''}{t.messaging ? ' · messaging' : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected !== null && (
        <div className="teammates-pane__detail" data-teammate-detail={selected.id}>
          <div className="shell__region-title shell__region-title--action">
            <span>{teammateWord(selected)}</span>
            <button type="button" className="pf__verb pf__verb--word" data-teammate-chat disabled={selected.places.length === 0}
              title={selected.places.length === 0 ? 'add a place first — a teammate with no places can work nowhere' : `Start a chat as ${teammateWord(selected)}`}
              {...shellControl(() => { if (selected.places.length > 0) props.onChat(selected.id) })}>Chat as {teammateWord(selected)}</button>
          </div>
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
                  <span className="teammates-pane__path" title={p}>{displayPath(p).short}</span>
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
                    {/* The grant is SAID, not implied by the verb's word. */}
                    {/* M191 (the golden audit, second half, 16). One sentence, not two states
                        that read as a contradiction, and it names the next step: a grant
                        without a credential is a permission waiting for a token. */}
                    <span>{svc.label}{granted && !svc.connected ? ' — granted, but no credential yet: add one in Connections' : granted ? ' — granted' : svc.connected ? '' : ' — not connected'}</span>
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
          <RoutinesSection teammate={selected} routines={props.routines.filter((r) => r.teammateId === selected.id)} onSave={props.onSaveRoutine} onDelete={props.onDeleteRoutine} onRun={props.onRunRoutine} onOpenLast={props.onOpenLast} />
          <div className="teammates-pane__field teammates-pane__actions">
            <button type="button" className={`inspector__action inspector__action--danger${armed === selected.id ? ' inspector__action--armed' : ''}`} data-teammate-delete
              title={armed === selected.id ? 'Press again to delete' : 'Delete this teammate (its chats stay; they lose their identity)'}
              {...shellControl(() => { if (armed === selected.id) { props.onDelete(selected.id); setArmed(null) } else setArmed(selected.id) })}>{armed === selected.id ? 'Delete?' : 'Delete'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * M101. The selected teammate's routines: each row says WHEN in the
 * watcher's phrase, that it runs only while the app is open, what the last
 * run did, and what was MISSED with the time; four verbs, every one present.
 * A new routine is one form; a refusal comes back as a sentence on the form.
 */
function RoutinesSection(props: { teammate: PersistedTeammate; routines: readonly PersistedRoutine[]; onSave: (r: PersistedRoutine) => Promise<string | null>; onDelete: (id: string) => void; onRun: (id: string) => void; onOpenLast: (panelId: string) => void }): JSX.Element {
  const [name, setName] = useState('')
  const [minutes, setMinutes] = useState('30')
  const [prompt, setPrompt] = useState('')
  const [plan, setPlan] = useState('')
  const [refusal, setRefusal] = useState<string | null>(null)
  const when = (at: number): string => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const submit = (): void => {
    const everyMs = Math.round(Number(minutes) * 60_000)
    const id = `rt-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
    void props.onSave({ id, name: name.trim(), teammateId: props.teammate.id, everyMs, prompt: prompt.trim(), ...(plan.trim() === '' ? {} : { plan: plan.trim() }), paused: false }).then((r) => {
      setRefusal(r)
      if (r === null) { setName(''); setPrompt(''); setPlan('') }
    })
  }
  return (
    <div className="teammates-pane__field" data-teammate-routines>
      <span className="teammates-pane__label">routines</span><span className="teammates-pane__note">{ROUTINE_LIMIT_WORD}</span>
      {props.routines.length === 0 && <p className="pf__note" data-routines-empty>no routines — a routine starts a fresh chat as {teammateWord(props.teammate)} on a schedule</p>}
      <ul className="teammates-pane__list">
        {props.routines.map((r) => (
          <li key={r.id} className="teammates-pane__routine" data-routine-row={r.id} data-routine-paused={r.paused ? '' : undefined}>
            <div className="teammates-pane__item">
              <span className="rail-row__label">{r.name}</span>
              <span className="rail-row__tail" data-routine-when>{everyWord(r.everyMs)}{r.paused ? ' · paused' : ''}</span>
            </div>
            {/* M149 (audit F.10). Two phrases that wrap BETWEEN each other,
                never inside one: the missed badge and the last-run sentence
                each keep their words together, and the line breaks at the gap. */}
            <p className="pf__note teammates-pane__last" data-routine-last>
              {r.missed !== undefined && <span className="badge" data-tone="needs-you" data-routine-missed>missed at {when(r.missed.at)} — the app was closed</span>}
              <span className="teammates-pane__last-run">{r.lastRun === undefined ? 'never run' : r.lastRun.outcome === 'started' ? `last run ${when(r.lastRun.at)}` : `last run ${when(r.lastRun.at)} was refused — ${r.lastRun.error ?? 'no reason given'}`}</span>
            </p>
            <div className="teammates-pane__actions">
              <button type="button" className="pf__verb pf__verb--word" data-routine-run title="Run it now, whatever the schedule says" {...shellControl(() => props.onRun(r.id))}>Run now</button>
              <button type="button" className="pf__verb pf__verb--word" data-routine-pause title={r.paused ? 'Resume the schedule' : 'Pause the schedule; Run now still works'} {...shellControl(() => { void props.onSave({ ...r, paused: !r.paused }) })}>{r.paused ? 'Resume' : 'Pause'}</button>
              <button type="button" className="pf__verb pf__verb--word" data-routine-open disabled={r.lastRun?.panelId === undefined} title={r.lastRun?.panelId === undefined ? 'no run has opened a chat yet' : 'Go to the last run\'s chat'} {...shellControl(() => { if (r.lastRun?.panelId !== undefined) props.onOpenLast(r.lastRun.panelId) })}>Open last</button>
              <button type="button" className="pf__verb pf__verb--word" data-routine-delete title="Delete this routine" {...shellControl(() => props.onDelete(r.id))}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
      <div className="teammates-pane__routine-form" data-routine-form>
        <input className="teammates-pane__name" data-routine-name placeholder="routine name…" value={name} onChange={(e) => setName(e.target.value)} />
        <label className="teammates-pane__item"><span>every</span><input className="teammates-pane__minutes" data-routine-minutes type="number" min={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} /><span>minutes</span></label>
        <label className="teammates-pane__field"><span className="teammates-pane__label">prompt</span><textarea className="teammates-pane__brief" data-routine-prompt placeholder="asked of the fresh chat each time" value={prompt} onChange={(e) => setPrompt(e.target.value)} /></label>
        <label className="teammates-pane__field"><span className="teammates-pane__label">verb line</span><span className="teammates-pane__note">optional — never destructive</span><input className="teammates-pane__name" data-routine-plan placeholder="focus n3" value={plan} onChange={(e) => setPlan(e.target.value)} /></label>
        {refusal !== null && <p className="pf__note chat__refusal" data-routine-refusal role="alert">{refusal}</p>}
        <button type="button" className="inspector__action" data-routine-add disabled={!props.teammate.scheduling} title={props.teammate.scheduling ? 'Save this routine' : `${teammateWord(props.teammate)} may not be scheduled — allow scheduling above first`} {...shellControl(() => { if (props.teammate.scheduling) submit() })}>Add routine</button>
      </div>
    </div>
  )
}

export const TeammatesPane = memo(TeammatesPaneImpl)
