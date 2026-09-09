import { useEffect, useMemo, useRef, useState, type JSX, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { PersistedTeammate } from '@shared/teammates'
import { teammateWord } from '@shared/teammates'
import type { BoardRepositoriesResult } from '@shared/ipc-contract'
import { shortPath } from './panel-name'
import { startWorkNeeds, startWorkRefusal, startWorkRoot, startWorkSummary, type StartWorkRepo } from './start-work'

/**
 * M197 (D05). THE START WORK SHEET — the one place a task, an agent and a
 * repository are answered together, in the palette's overlay beside the
 * spawn sheet and by the same rules (a field holds DOM focus away from
 * xterm, Enter submits, Escape cancels in one stage).
 *
 * It renders `start-work.ts`'s answer and decides nothing: which fields are
 * missing, what each missing one says, and whether Enter may start are the
 * model's, so the palette row, the card's menu and the Teammates-pane drop
 * cannot disagree with the sheet about the same start.
 *
 * Three things here are load-bearing.
 *
 * **The repository list belongs to the CHOSEN teammate**, so it is read
 * after the agent field is answered and thrown away when it changes. A late
 * reply for an EARLIER teammate is dropped by a request counter — the stale
 * reply this repo's inspector rule already names, reached here because the
 * walk shells out to git and a second choice can easily overtake the first.
 *
 * **Nothing here widens a grant.** A teammate with no places is offered
 * disabled with `teammateRefusal`'s own sentence and `Open the Teammates
 * pane` is a NAMED ROUTE, never a checkbox that adds a place from inside a
 * start. The repositories offered are under the places already granted,
 * because the walk starts at them.
 *
 * **The triple is stated before anything is minted** — the foot's summary,
 * the root in the path rule's words with the full path on the title.
 */
export interface StartWorkSheetModel {
  /** The task. Fixed when the start came from a provider item or an existing card: its title is that item's, and editing it here would author a second name for one thing. */
  title: string
  titleFixed: boolean
  /** The item's own `owner/repo`, or null for a typed or Jira item — which names none. */
  wanted: string | null
  teammates: readonly PersistedTeammate[]
  /** Pre-filled by the Teammates-pane drop, absent from the palette row. */
  teammateId?: string
  /** Main's answer: the repositories under this teammate's places. Three arms. */
  repositories(teammateId: string): Promise<BoardRepositoriesResult>
  submit(choice: { title: string; teammateId: string; root: string }): Promise<{ kind: 'started' } | { kind: 'refused'; reason: string }>
  /** The named route to the grant. */
  openTeammates(): void
}

export interface StartWorkSheetProps {
  model: StartWorkSheetModel
  onDone(): void
  onCancel(): void
}

export function StartWorkSheet({ model, onDone, onCancel }: StartWorkSheetProps): JSX.Element {
  const [title, setTitle] = useState(model.title)
  const [teammateId, setTeammateId] = useState<string>(model.teammateId ?? '')
  const [root, setRoot] = useState('')
  const [repos, setRepos] = useState<readonly StartWorkRepo[] | undefined>(undefined)
  const [noPlaces, setNoPlaces] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const firstRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null)
  // The stale-reply guard: every read takes a ticket and only the newest one
  // may write. Without it a slow walk over a large place lands after the user
  // has already chosen another teammate, and the field then offers folders
  // that teammate may not touch — which the Places gate would refuse, one
  // question later, by name.
  const ticket = useRef(0)

  useEffect(() => { firstRef.current?.focus() }, [])

  useEffect(() => {
    setRepos(undefined); setNoPlaces(null); setRoot('')
    if (teammateId === '') return
    const mine = ++ticket.current
    void model.repositories(teammateId).then((answer) => {
      if (ticket.current !== mine) return
      if (answer.kind === 'repos') { setRepos(answer.repos); return }
      if (answer.kind === 'no-places') { setRepos([]); setNoPlaces(answer.reason); return }
      setRepos([]); setRefusal(answer.reason)
    })
    // `model` is rebuilt per open, not per render; the teammate is the subject.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teammateId])

  const ctx = useMemo(() => ({ teammates: model.teammates, repos, wanted: model.wanted }), [model.teammates, repos, model.wanted])
  const choice = { title, ...(teammateId === '' ? {} : { teammateId }), ...(root === '' ? {} : { root }) }
  const needs = startWorkNeeds(choice, ctx)
  const blocking = startWorkRefusal(choice, ctx)
  const mate = model.teammates.find((t) => t.id === teammateId)
  const chosenRoot = startWorkRoot(choice, ctx)
  const summary = startWorkSummary(choice, mate, chosenRoot)

  const submit = (): void => {
    if (busy || blocking !== null || needs.length > 0 || teammateId === '' || chosenRoot === null) return
    setBusy(true); setRefusal(null)
    void model.submit({ title: title.trim(), teammateId, root: chosenRoot }).then((result) => {
      setBusy(false)
      if (result.kind === 'refused') { setRefusal(result.reason); return }
      onDone()
    })
  }

  // Handled once, on the form: a field's own handler would let Enter bubble
  // and start twice — the spawn sheet's own first-run defect, not repeated.
  const onKey = (event: ReactKeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onCancel(); return }
    if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); submit() }
  }

  return (
    <div className="sheet" data-start-sheet role="form" aria-label="Start work" onKeyDown={onKey}>
      <div className="sheet__title">Start work…</div>

      <label className="sheet__field">
        <span className="sheet__label">task</span>
        {model.titleFixed ? (
          <span className="sheet__input sheet__input--fixed" data-start-task data-start-task-fixed title={model.title}>{model.title}</span>
        ) : (
          <input ref={(el) => { if (!model.titleFixed) firstRef.current = el }} className="sheet__input" data-start-task value={title} placeholder="what needs doing" spellCheck={false}
            onChange={(e) => { setTitle(e.target.value); setRefusal(null) }} />
        )}
      </label>

      <label className="sheet__field">
        <span className="sheet__label">agent</span>
        <select ref={(el) => { if (model.titleFixed) firstRef.current = el }} className="sheet__select" data-start-agent value={teammateId} aria-label="teammate"
          onChange={(e) => { setTeammateId(e.target.value); setRefusal(null) }}>
          <option value="">choose a teammate…</option>
          {model.teammates.map((t) => (
            // A teammate with no places is DISABLED with the fix, never
            // dropped: a row that vanished would read as a teammate that was
            // never made, and the grant is the thing to go and give.
            <option key={t.id} value={t.id} disabled={t.places.length === 0} data-start-agent-row={t.id}>
              {teammateWord(t)}{t.places.length === 0 ? ' — no places yet' : ''}
            </option>
          ))}
        </select>
      </label>

      <label className="sheet__field">
        <span className="sheet__label">repository</span>
        <select className="sheet__select sheet__select--mono" data-start-repo value={root} aria-label="repository"
          disabled={teammateId === '' || repos === undefined || repos.length === 0}
          onChange={(e) => { setRoot(e.target.value); setRefusal(null) }}>
          {/* The `auto` row names the clone it derived rather than saying
              `auto`: the user is being told which folder the work will happen
              in, and `auto` is a word about the app, not about the work. */}
          <option value="">{chosenRoot !== null && root === '' ? `${shortPath(chosenRoot, 2)} — the clone of ${String(model.wanted)}` : 'choose a repository…'}</option>
          {(repos ?? []).map((r) => (
            <option key={r.path} value={r.path} data-start-repo-row={r.path}>{shortPath(r.path, 2)}{r.repo === null ? '' : ` — ${r.repo}`}</option>
          ))}
        </select>
      </label>

      <div className="sheet__foot">
        {/* The triple, before anything is minted. */}
        <span className="sheet__preview" data-start-summary title={chosenRoot ?? undefined}>{summary === '' ? 'a task, a teammate and a repository' : summary}</span>
        {/* What is still missing — one sentence, the first need's, because a
            list of three would state two questions the flow has not reached. */}
        {needs.length > 0 && blocking === null && (
          <span className="sheet__hint" data-start-need={needs[0]?.field}>{needs[0]?.why}</span>
        )}
        {noPlaces !== null && (
          <span className="sheet__refusal" data-start-no-places role="alert">{noPlaces}</span>
        )}
        {blocking !== null && (
          <span className="sheet__refusal" data-start-blocked role="alert">{blocking}</span>
        )}
        {refusal !== null && <span className="sheet__refusal" data-start-refusal role="alert">{refusal}</span>}
        {/* The route to the grant, named — never a widening from inside a start. */}
        <button type="button" className="pf__verb pf__verb--word" data-start-open-teammates
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
          onClick={(e) => { e.preventDefault(); model.openTeammates() }}>Open the Teammates pane</button>
        {/* The verb stays `start` while a start is in flight — `starting…`
            is the STATE vocabulary's own word (`verify:rail state.2` pins it
            to `panel-state.ts`, and a panel's state is not what this line is
            about). What is in flight is the lane, and that is what it says. */}
        <span className="sheet__keys">↵ start · esc close{busy ? ' · making the lane…' : ''}</span>
      </div>
    </div>
  )
}
