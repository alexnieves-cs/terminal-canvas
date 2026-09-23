import { useEffect, useMemo, useRef, useState, type JSX, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { PersistedTeammate } from '@shared/teammates'
import { teammateWord } from '@shared/teammates'
import type { BoardRepositoriesResult } from '@shared/ipc-contract'
import { shortPath } from './panel-name'
import { SheetHeader } from './SpawnSheet'
import { runtimeDefaultsLine } from '@shared/first-run'
import { repoOfKey, type WorkItemState } from '@shared/work-items'
import { SWARM_LIST, SWARM_PRESETS, swarmPlan, type SwarmPresetId } from '@shared/swarm'
import { applyRecipe, type Recipe } from '@shared/recipes'
import { setupLine } from '@shared/repo-setup'
import type { SetupReadResult } from '@shared/ipc-contract'
import { startWorkNeeds, startWorkRefusal, startWorkRoot, startWorkSummary, startWorkSwarmRefusal, type StartWorkRepo } from './start-work'

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
/** M310. An open issue a task can start FROM — the provider's item, by its key. */
export interface IssueChoice {
  source: 'github' | 'jira'
  key: string
  title: string
  url: string
  description: string
}

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
  submit(choice: { title: string; teammateId: string; root: string; swarm?: SwarmPresetId; issue?: IssueChoice; brief?: string; criteria?: string[]; checks?: string[]; deliverables?: string[]; recipeId?: string }): Promise<{ kind: 'started' } | { kind: 'refused'; reason: string }>
  /**
   * M310. The connected services' open issues, read when the sheet opens —
   * the flagship start is FROM an issue. Absent hides the field; an answer
   * with nothing says why (no GitHub connected) instead of an empty list.
   */
  issues?(): Promise<{ kind: 'items'; items: IssueChoice[] } | { kind: 'none'; reason: string }>
  /** M310. The task's intended outcome and criteria, when it already has them (a card's own). */
  brief?: string
  criteria?: readonly string[]
  /** The named route to the grant. */
  openTeammates(): void
  /** M262. The expert route: close this sheet and open New panel. Absent hides the switch. */
  openPanel?(): void
  /** M275. Whether an agent CLI answered discovery — an arrangement of agents is refused by name without one. Absent reads as available. */
  agentAvailable?: boolean
  /** M275. The card's own state, when this start is for a card already on the board; absent for a task about to be minted. */
  itemState?: WorkItemState
  /** M275. The ceiling, read live: the preview says who would queue BEFORE Enter (M104's rule, M121's arithmetic). */
  ceiling?: { maxConcurrent: number; liveAgents: number; queued: number }
  /** M275. Pre-chosen by the palette's per-arrangement rows; absent is the solo lane, which stays the default of the plain door. */
  swarm?: SwarmPresetId
  /**
   * M314. Every recipe (built-ins, then the person's). Picking one FILLS the
   * fields below — title, outcome, criteria, checks, deliverables, arrangement
   * — and the person edits any of it before Start. Absent hides the field.
   */
  recipes?: readonly Recipe[]
  /** M314. Pre-chosen by a recipe's palette row, or `tc task --recipe`. */
  recipeId?: string
  checks?: readonly string[]
  deliverables?: readonly string[]
  /** M313. A proposal's directory (`tc task`): the repository containing it is chosen once the list is read. */
  preferRoot?: string
  /** M312. The chosen repository's setup, for the line that says what a lane will get before its agent starts. */
  setupOf?(root: string): Promise<SetupReadResult>
  /** M312. The named route to edit it — closes this sheet. */
  openSetup?(root: string): void
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
  // M275. '' is the SOLO lane — the start M197 shipped — and it is the
  // default, because a person who opened this sheet to start one task must
  // not get five agents for pressing Enter.
  const [swarm, setSwarm] = useState<'' | SwarmPresetId>(model.swarm ?? '')
  // M310. The issue this start is FROM, the outcome and the criteria.
  const [issues, setIssues] = useState<{ kind: 'items'; items: IssueChoice[] } | { kind: 'none'; reason: string } | null>(null)
  const [issueKey, setIssueKey] = useState('')
  const [brief, setBrief] = useState(model.brief ?? '')
  const [criteriaText, setCriteriaText] = useState((model.criteria ?? []).join('\n'))
  // M314. The recipe and the one answer that aims it; the rest it fills.
  const [recipeId, setRecipeId] = useState(model.recipeId ?? '')
  const [aim, setAim] = useState('')
  const [checksText, setChecksText] = useState((model.checks ?? []).join('\n'))
  const [deliverText, setDeliverText] = useState((model.deliverables ?? []).join('\n'))
  const recipe = model.recipes?.find((r) => r.id === recipeId)
  const pickRecipe = (id: string, answer: string): void => {
    setRecipeId(id)
    const r = model.recipes?.find((x) => x.id === id)
    if (r === undefined) return
    const fill = applyRecipe(r, answer)
    if (!model.titleFixed) setTitle(fill.title)
    setBrief(fill.brief)
    setCriteriaText(fill.criteria.join('\n'))
    setChecksText(fill.checks.join('\n'))
    setDeliverText(fill.deliverables.join('\n'))
    setSwarm(fill.swarm ?? '')
    setRefusal(null)
  }
  // M312. What the chosen repository's lanes get before their agent starts.
  const [setupRead, setSetupRead] = useState<SetupReadResult | null>(null)
  const issue = issues?.kind === 'items' ? issues.items.find((i) => i.key === issueKey) : undefined
  // An issue picked here names its repository exactly as a card's key does.
  const wanted = issue === undefined ? model.wanted : issue.source === 'github' ? repoOfKey(issue.key) : null
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
  // M314. A recipe chosen before the sheet opened fills it once, on mount.
  useEffect(() => {
    // The title it was proposed with is the recipe's answer; a proposed
    // outcome or criteria (the person's, from `tc task`) win over the recipe's.
    if (model.recipeId === undefined) return
    if (!model.titleFixed) setAim(model.title)
    pickRecipe(model.recipeId, model.title)
    if (model.brief !== undefined) setBrief(model.brief)
    if (model.criteria !== undefined) setCriteriaText(model.criteria.join('\n'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (model.titleFixed || model.issues === undefined) return
    let live = true
    void model.issues().then((got) => { if (live) setIssues(got) }, () => { if (live) setIssues({ kind: 'none', reason: 'the connected services could not be read' }) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setRepos(undefined); setNoPlaces(null); setRoot('')
    if (teammateId === '') return
    const mine = ++ticket.current
    void model.repositories(teammateId).then((answer) => {
      if (ticket.current !== mine) return
      if (answer.kind === 'repos') {
        setRepos(answer.repos)
        // M313. A proposal from a terminal names its directory: the repository
        // that contains it is chosen, the deepest one when repositories nest.
        const prefer = model.preferRoot
        if (prefer !== undefined) {
          const hit = [...answer.repos].filter((r) => prefer === r.path || prefer.startsWith(`${r.path}/`)).sort((a, b) => b.path.length - a.path.length)[0]
          if (hit !== undefined) { setRoot(hit.path); return }
        }
        // M315. One repository this teammate may work in is the answer, not a
        // question: selected, and still changeable.
        if (answer.repos.length === 1) setRoot((cur) => (cur === '' ? (answer.repos[0] as { path: string }).path : cur))
        return
      }
      if (answer.kind === 'no-places') { setRepos([]); setNoPlaces(answer.reason); return }
      setRepos([]); setRefusal(answer.reason)
    })
    // `model` is rebuilt per open, not per render; the teammate is the subject.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teammateId])

  const ctx = useMemo(() => ({
    teammates: model.teammates, repos, wanted,
    ...(model.agentAvailable === undefined ? {} : { agentAvailable: model.agentAvailable }),
    ...(model.itemState === undefined ? {} : { itemState: model.itemState })
  }), [model.teammates, repos, wanted, model.agentAvailable, model.itemState])
  const choice = { title, ...(teammateId === '' ? {} : { teammateId }), ...(root === '' ? {} : { root }), ...(swarm === '' ? {} : { swarm }) }
  const needs = startWorkNeeds(choice, ctx)
  const blocking = startWorkRefusal(choice, ctx)
  // M275. The arrangement's own refusal is a THIRD kind: the triple can be
  // answered and the shape still not apply. It disables Start by itself, so a
  // swarm cannot half-land and then report why.
  const swarmBlocked = startWorkSwarmRefusal(choice, ctx)
  const mate = model.teammates.find((t) => t.id === teammateId)
  const chosenRoot = startWorkRoot(choice, ctx)
  const summary = startWorkSummary(choice, mate, chosenRoot)
  useEffect(() => {
    setSetupRead(null)
    if (chosenRoot === null || model.setupOf === undefined) return
    let live = true
    void model.setupOf(chosenRoot).then((r) => { if (live) setSetupRead(r) }, () => { if (live) setSetupRead({ kind: 'not-a-repo' }) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosenRoot])
  // The shape, stated before anything is minted — the sheet's standing rule
  // applied to the arrangement. Solo has no plan to show: it is one lane.
  const plan = swarm === '' ? null : swarmPlan(SWARM_PRESETS[swarm], {
    maxConcurrent: model.ceiling?.maxConcurrent ?? 0,
    liveAgents: model.ceiling?.liveAgents ?? 0,
    queued: model.ceiling?.queued ?? 0,
    ...(chosenRoot === null ? {} : { rootWords: shortPath(chosenRoot, 2) })
  })

  const submit = (): void => {
    if (busy || blocking !== null || swarmBlocked !== null || needs.length > 0 || teammateId === '' || chosenRoot === null) return
    setBusy(true); setRefusal(null)
    const criteria = criteriaText.split('\n').map((c) => c.trim()).filter((c) => c !== '')
    const checks = checksText.split('\n').map((c) => c.trim()).filter((c) => c !== '')
    const deliverables = deliverText.split('\n').map((c) => c.trim()).filter((c) => c !== '')
    void model.submit({
      ...(checks.length === 0 ? {} : { checks }),
      ...(deliverables.length === 0 ? {} : { deliverables }),
      ...(recipe === undefined ? {} : { recipeId: recipe.id }),
      title: title.trim(), teammateId, root: chosenRoot, ...(swarm === '' ? {} : { swarm }),
      ...(issue === undefined ? {} : { issue }),
      ...(brief.trim() === '' ? {} : { brief: brief.trim() }),
      ...(criteria.length === 0 ? {} : { criteria })
    }).then((result) => {
      setBusy(false)
      if (result.kind === 'refused') { setRefusal(result.reason); return }
      onDone()
    })
  }

  // Handled once, on the form: a field's own handler would let Enter bubble
  // and start twice — the spawn sheet's own first-run defect, not repeated.
  const onKey = (event: ReactKeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onCancel(); return }
    // M262. Enter on a focused BUTTON is that button's own click — Cancel,
    // a Task | Panel tab. Before the footer had buttons every focusable was a
    // field; now Enter-anywhere would make a panel from Cancel (the
    // launcher's M205 critic, met again).
    if (event.key === 'Enter' && event.target instanceof HTMLElement && event.target.tagName === 'BUTTON') return
    if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); submit() }
  }

  return (
    <div className="sheet" data-start-sheet role="form" aria-label="Start work" onKeyDown={onKey}>
      <SheetHeader current="task" onPanel={model.openPanel} />

      {/* M314. THE RECIPE — first, because it fills everything below it. Its
          one question aims it (which test, which issue); the fields it fills
          stay editable, and Solo/no-recipe stays the default. */}
      {model.recipes !== undefined && model.recipes.length > 0 && (
        <label className="sheet__field">
          <span className="sheet__label">Recipe</span>
          <select className="sheet__select" data-start-recipe value={recipeId} aria-label="recipe"
            onChange={(e) => pickRecipe(e.target.value, aim)}>
            <option value="" data-start-recipe-row="none">None — describe the task yourself</option>
            {model.recipes.map((r) => (
              <option key={r.id} value={r.id} data-start-recipe-row={r.id}>{r.name} — {r.hint}</option>
            ))}
          </select>
        </label>
      )}
      {recipe !== undefined && !model.titleFixed && (
        <label className="sheet__field">
          <span className="sheet__label">{recipe.ask.label.replace(/\?$/, '')}</span>
          <input className="sheet__input" data-start-recipe-aim value={aim} placeholder={recipe.ask.placeholder} spellCheck={false}
            onChange={(e) => { setAim(e.target.value); pickRecipe(recipe.id, e.target.value) }} />
        </label>
      )}

      {/* M310. THE FLAGSHIP START: from an open issue. Choosing one names the
          task and — for GitHub — the repository, the same way a card from
          that issue would. Optional: a typed task is still a task. */}
      {!model.titleFixed && model.issues !== undefined && (
        <label className="sheet__field">
          <span className="sheet__label">From issue</span>
          <select className="sheet__select" data-start-issue value={issueKey} aria-label="issue"
            disabled={issues === null || issues.kind === 'none'}
            onChange={(e) => {
              const key = e.target.value
              setIssueKey(key)
              const picked = issues?.kind === 'items' ? issues.items.find((i) => i.key === key) : undefined
              if (picked !== undefined) setTitle(picked.title)
              setRoot(''); setRefusal(null)
            }}>
            <option value="">{issues === null ? 'reading open issues…' : issues.kind === 'none' ? issues.reason : 'none — type the task below'}</option>
            {issues?.kind === 'items' && issues.items.map((i) => (
              <option key={i.key} value={i.key} data-start-issue-row={i.key}>{i.key} — {i.title}</option>
            ))}
          </select>
        </label>
      )}

      <label className="sheet__field">
        <span className="sheet__label">Task</span>
        {model.titleFixed ? (
          <span className="sheet__input sheet__input--fixed" data-start-task data-start-task-fixed title={model.title}>{model.title}</span>
        ) : (
          <input ref={(el) => { if (!model.titleFixed) firstRef.current = el }} className="sheet__input" data-start-task value={title} placeholder="what needs doing" spellCheck={false}
            onChange={(e) => { setTitle(e.target.value); setRefusal(null) }} />
        )}
      </label>

      <label className="sheet__field">
        <span className="sheet__label">Agent</span>
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
        <span className="sheet__label">Repository</span>
        <select className="sheet__select sheet__select--mono" data-start-repo value={root} aria-label="repository"
          disabled={teammateId === '' || repos === undefined || repos.length === 0}
          onChange={(e) => { setRoot(e.target.value); setRefusal(null) }}>
          {/* The `auto` row names the clone it derived rather than saying
              `auto`: the user is being told which folder the work will happen
              in, and `auto` is a word about the app, not about the work. */}
          <option value="">{chosenRoot !== null && root === '' ? `${shortPath(chosenRoot, 2)} — the clone of ${String(wanted)}` : 'choose a repository…'}</option>
          {(repos ?? []).map((r) => (
            <option key={r.path} value={r.path} data-start-repo-row={r.path}>{shortPath(r.path, 2)}{r.repo === null ? '' : ` — ${r.repo}`}</option>
          ))}
        </select>
      </label>

      {/* M310. What "done" means, carried to the agent's first message and
          to the review: the outcome in the person's words, and one criterion
          per line. Optional — a start never waits on them. */}
      <label className="sheet__field">
        <span className="sheet__label">Outcome</span>
        <input className="sheet__input" data-start-brief value={brief} placeholder="what should be true when this is done (optional)" spellCheck={false}
          onChange={(e) => setBrief(e.target.value)} />
      </label>
      <label className="sheet__field">
        <span className="sheet__label">Done when</span>
        <textarea className="sheet__input sheet__textarea" data-start-criteria value={criteriaText} rows={2} spellCheck={false}
          placeholder="one acceptance criterion per line (optional)"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) e.stopPropagation() }}
          onChange={(e) => setCriteriaText(e.target.value)} />
      </label>

      {/* M314. What decides "done" and what comes back — a recipe fills them,
          and a typed task may too. The checks are told to the agent and are
          what the review's Run checks offers first. */}
      {(recipe !== undefined || checksText !== '' || deliverText !== '') && (
        <>
          <label className="sheet__field">
            <span className="sheet__label">Checks</span>
            <textarea className="sheet__input sheet__textarea sheet__input--mono" data-start-checks value={checksText} rows={1} spellCheck={false}
              placeholder={setupRead?.kind === 'saved' && setupRead.setup.checks.length > 0 ? `the repository's: ${setupRead.setup.checks.join(', ')}` : 'one command per line (optional)'}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) e.stopPropagation() }}
              onChange={(e) => setChecksText(e.target.value)} />
          </label>
          <label className="sheet__field">
            <span className="sheet__label">Hand back</span>
            <textarea className="sheet__input sheet__textarea" data-start-deliverables value={deliverText} rows={2} spellCheck={false}
              placeholder="one deliverable per line (optional)"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) e.stopPropagation() }}
              onChange={(e) => setDeliverText(e.target.value)} />
          </label>
        </>
      )}

      {/* M275. THE ARRANGEMENT. Last of the fields, and after the repository
          on purpose: the seats' folders are that repository's, so a shape
          chosen before it would preview worktrees of nowhere. Solo is first
          and selected, because the default must stay the start that shipped. */}
      <label className="sheet__field">
        <span className="sheet__label">Arrangement</span>
        <select className="sheet__select" data-start-swarm value={swarm} aria-label="arrangement"
          onChange={(e) => { setSwarm(e.target.value as '' | SwarmPresetId); setRefusal(null) }}>
          <option value="" data-start-swarm-row="solo">Solo — one conversation in its own lane</option>
          {SWARM_LIST.map((preset) => (
            <option key={preset.id} value={preset.id} data-start-swarm-row={preset.id}>{preset.label} — {preset.hint}</option>
          ))}
        </select>
      </label>

      {/* M262. What runs, said: a lane is Claude Code with the CLI's own
          defaults — nothing on this sheet changes them, and saying so is
          what stops a person hunting for a knob that is not here. */}
      <div className="sheet__field sheet__field--how">
        <span className="sheet__label">Runtime</span>
        <span className="sheet__defaults" data-start-defaults>{runtimeDefaultsLine('Claude Code', {})} · {plan === null ? 'in its own worktree' : `${plan.line} · the person opens the pull request`}</span>
      </div>

      {/* M312. What a new lane of this repository gets before its agent
          starts — the saved setup, or the draft that has not been saved —
          and the named route to edit it. */}
      {chosenRoot !== null && model.setupOf !== undefined && (
        <div className="sheet__field sheet__field--how">
          <span className="sheet__label">Setup</span>
          <span className="sheet__defaults" data-start-setup={setupRead?.kind ?? 'reading'}>
            {setupLine(setupRead)}
            {model.openSetup !== undefined && setupRead !== null && setupRead.kind !== 'not-a-repo' && (
              <button type="button" className="pf__verb pf__verb--word" data-start-edit-setup
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
                onClick={(e) => { e.preventDefault(); model.openSetup?.(chosenRoot) }}>{setupRead.kind === 'saved' ? 'Edit setup' : 'Set up this repository…'}</button>
            )}
          </span>
        </div>
      )}

      {/* M275. The seats, one row each, BEFORE anything is minted — the
          sheet's own rule extended to the shape. A seat names its role and
          the folder it works in, because those are the two facts a person
          needs to judge whether the arrangement is the one they meant. */}
      {plan !== null && (
        <div className="sheet__field sheet__field--how" data-start-swarm-plan>
          <span className="sheet__label">Seats</span>
          <span className="sheet__defaults">
            {plan.seats.map((seat) => (
              <span key={seat.key} className="sheet__seat" data-start-swarm-seat={seat.key}>{seat.title} · {seat.role} · {seat.where}</span>
            ))}
          </span>
        </div>
      )}

      <div className="sheet__foot">
        {/* The triple, before anything is minted. */}
        <span className="sheet__preview" data-start-summary title={chosenRoot ?? undefined}>{summary === '' ? 'a task, the agent to do it and its repository' : summary}</span>
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
        {/* M275. The arrangement's own two sentences. The ceiling line is a
            WARNING and not a refusal — queueing is what the ceiling is for —
            so it never disables Start; the refusal does. */}
        {swarmBlocked !== null && blocking === null && (
          <span className="sheet__refusal" data-start-swarm-refusal role="alert">{swarmBlocked}</span>
        )}
        {plan !== null && plan.ceilingLine !== '' && swarmBlocked === null && (
          <span className="sheet__hint" data-start-swarm-ceiling>{plan.ceilingLine}</span>
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
        {/* M262. Explicit verbs beside the keys: Cancel, and a filled Start
            task that is disabled — never hidden — until the triple is answered. */}
        <div className="sheet__actions">
          <span className="sheet__keys">↵ · esc{busy ? ' · making the lane…' : ''}</span>
          <button type="button" className="sheet__button" data-start-cancel
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
            onClick={(e) => { e.preventDefault(); onCancel() }}>Cancel</button>
          <button type="button" className="sheet__button is-primary" data-start-submit disabled={busy || blocking !== null || swarmBlocked !== null || needs.length > 0 || chosenRoot === null}
            title={needs[0]?.why ?? blocking ?? swarmBlocked ?? undefined}
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
            onClick={(e) => { e.preventDefault(); submit() }}>{busy ? (plan === null ? 'Starting the lane…' : 'Making the arrangement…') : 'Start task'}</button>
        </div>
      </div>
    </div>
  )
}
