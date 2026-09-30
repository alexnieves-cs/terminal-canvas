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
import { startAgentName, startWorkBackendFit, startWorkBackendRows, startWorkNeeds, startWorkRefusal, startWorkRoot, startWorkSummary, startWorkSwarmRefusal, startWorkWho, type StartWorkRepo } from './start-work'
import { DEFAULT_BACKEND, type AgentBackend } from '@shared/agent-backends'
import { fitSummary } from '@shared/backend-fit'
import { preflightTools, recipePreflight, recipeTexts, type Preflight } from '@shared/recipe-portability'
import { installedFirstBackend, optionsOpenAtRest, preselectBackend, preselectRoot, preselectTeammate, startDraftStore } from './start-work-first'

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
 * **M400 (B1). What → where → who, the launcher's order, and WHERE is never
 * gated on WHO.** The repository list is every placed teammate's
 * repositories, read once at open, plus the recent folders and Choose…; the
 * agent follows from the folder by the launcher's own rule
 * (`startWorkWho` → `folderTeammatePlan`), so a fresh install with no
 * teammate starts a task from "+ New task". Until M400 the list was the
 * CHOSEN teammate's, read after the agent field — and an empty roster left
 * the field disabled over "no teammate yet".
 *
 * **No EXISTING grant is widened here.** A teammate with no places is
 * offered disabled with `teammateRefusal`'s own sentence, a picked teammate
 * whose places do not contain the folder is a question (never a place added
 * to it), and `Open the Teammates pane` stays a NAMED ROUTE. The one grant a
 * start may make is the launcher's: a NEW teammate whose only place is
 * exactly the chosen folder, stated on the Who line before Start, made after
 * the repository answer and never on a refusal (Canvas's `teammateForFolder`).
 * A proposal's directory (`tc task`) still only CHOOSES among the
 * repositories the places already grant.
 *
 * **The triple is stated before anything is minted** — the foot's summary,
 * the root in the path rule's words with the full path on the title.
 *
 * M323. PROJECT FIRST, PROGRESSIVELY DISCLOSED: the sheet opens on the
 * repository and the task; the teammate and backend arrive preselected
 * (`start-work-first.ts`) on one line with Change; everything else is under
 * Options. Both disclosures are `<details>`, so a closed one still holds its
 * fields in the DOM — every route and check that sets them still can. The
 * plain door keeps a draft across the named routes out (setup, Teammates).
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
  /** A PICKED teammate: the Teammates-pane drop's, a card's own. Absent: the folder decides who. */
  teammateId?: string
  /** M400. The teammate a typed start PREFERS when its places contain the folder — the most recent task's. */
  preferTeammateId?: string
  /** Main's answer: the repositories under this teammate's places. Three arms. */
  repositories(teammateId: string): Promise<BoardRepositoriesResult>
  /** M400. The folders the person has worked in lately (the launcher's recents), offered beside the granted repositories. */
  recents?: readonly string[]
  /** M400. The system folder dialog, the launcher's Choose…; null is a cancel. Absent hides the button. */
  chooseFolder?(): Promise<string | null>
  /** `teammateId` absent: no teammate was picked, and the executor answers who for `root` (reusing `preferTeammateId` when it can). */
  submit(choice: { title: string; teammateId?: string; preferTeammateId?: string; root: string; swarm?: SwarmPresetId; backend?: AgentBackend; recipeParams?: Record<string, string>; issue?: IssueChoice; brief?: string; criteria?: string[]; checks?: string[]; deliverables?: string[]; recipeId?: string }): Promise<{ kind: 'started' } | { kind: 'refused'; reason: string }>
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
  /** M319. Discovery's answer per backend CLI; absent hides nothing and reads as available. */
  available?: Partial<Record<AgentBackend, boolean>>
  /** M319. The card's own backend (a re-start keeps its vendor); absent is claude. */
  backend?: AgentBackend
  /** M321. Probe the tools a start would invoke and the next lane's ports — nothing runs. Absent skips the probe (every tool unprobed). */
  preflightOf?(req: { root: string; tools: readonly string[] }): Promise<{ tools: Record<string, boolean>; ports: Record<string, number | null> | null }>
  /** M319. The canvas's enforced ceilings, so a backend the budget cannot see says so before the start. */
  budgetUsd?: number
  windowPercent?: number
}

export interface StartWorkSheetProps {
  model: StartWorkSheetModel
  onDone(): void
  onCancel(): void
}

export function StartWorkSheet({ model, onDone, onCancel }: StartWorkSheetProps): JSX.Element {
  // M323. THE PLAIN DOOR keeps a draft: a typed start with nothing proposed.
  // A card, a recipe row or `tc task` arrives with its own words, and a draft
  // restored over them would replace what the caller proposed.
  const plainDoor = !model.titleFixed && model.title === '' && model.recipeId === undefined
  const [restored] = useState(() => (plainDoor ? startDraftStore.load() : null))
  const [last] = useState(() => startDraftStore.last())
  const [draftShown, setDraftShown] = useState(restored !== null)
  const [title, setTitle] = useState(restored?.title ?? model.title)
  // M400. The PICKED teammate, '' for Automatic — the folder decides, by the
  // launcher's rule. Only a caller's own teammate (a drop, a card) arrives
  // picked; the last used, a draft's and the only placed one are PREFERENCES
  // (M323's preselection), reused when their places contain the folder.
  const [teammateId, setTeammateId] = useState<string>(() => (model.teammateId !== undefined && model.teammates.some((t) => t.id === model.teammateId) ? model.teammateId : ''))
  const [prefer] = useState<string>(() => preselectTeammate(model.teammates, model.preferTeammateId ?? restored?.teammateId, last))
  const [root, setRoot] = useState('')
  // M275. '' is the SOLO lane — the start M197 shipped — and it is the
  // default, because a person who opened this sheet to start one task must
  // not get five agents for pressing Enter.
  const [swarm, setSwarm] = useState<'' | SwarmPresetId>(model.swarm ?? restored?.swarm ?? '')
  // M319/M323. The backend a person PICKED, or null — then it is preselected
  // below against this task (the card's vendor, the last used, claude), and a
  // preference the task refuses gives way to one that can do it.
  const [backendPick, setBackendPick] = useState<AgentBackend | null>(restored?.backend ?? null)
  // M310. The issue this start is FROM, the outcome and the criteria.
  const [issues, setIssues] = useState<{ kind: 'items'; items: IssueChoice[] } | { kind: 'none'; reason: string } | null>(null)
  const [issueKey, setIssueKey] = useState(restored?.issueKey ?? '')
  // M323. From an issue is the ALTERNATE route, offered beside the task and not ahead of it.
  const [route, setRoute] = useState<'typed' | 'issue'>(restored?.issueKey === undefined ? 'typed' : 'issue')
  const [issueQuery, setIssueQuery] = useState('')
  const [brief, setBrief] = useState(model.brief ?? restored?.brief ?? '')
  const [criteriaText, setCriteriaText] = useState(model.criteria !== undefined ? model.criteria.join('\n') : (restored?.criteria ?? ''))
  // M314. The recipe and the one answer that aims it; the rest it fills.
  const [recipeId, setRecipeId] = useState(model.recipeId ?? restored?.recipeId ?? '')
  const [aim, setAim] = useState(restored?.aim ?? '')
  const [checksText, setChecksText] = useState(model.checks !== undefined ? model.checks.join('\n') : (restored?.checks ?? ''))
  const [deliverText, setDeliverText] = useState(model.deliverables !== undefined ? model.deliverables.join('\n') : (restored?.deliverables ?? ''))
  const recipe = model.recipes?.find((r) => r.id === recipeId)
  // M321. The recipe's named parameters, as the person has answered them; a
  // parameter left blank takes its default, and one with neither refuses the start.
  const [params, setParams] = useState<Record<string, string>>(restored?.params ?? {})
  // M323. Options rests OPEN when it already holds a choice — never a folded live swarm.
  const [optionsOpen, setOptionsOpen] = useState(() => optionsOpenAtRest({
    ...(model.recipeId ?? restored?.recipeId) === undefined ? {} : { recipeId: model.recipeId ?? restored?.recipeId },
    ...(model.swarm ?? restored?.swarm) === undefined ? {} : { swarm: model.swarm ?? restored?.swarm },
    ...(model.brief ?? restored?.brief) === undefined ? {} : { brief: model.brief ?? restored?.brief },
    ...(model.criteria?.join('\n') ?? restored?.criteria) === undefined ? {} : { criteria: model.criteria?.join('\n') ?? restored?.criteria },
    ...(model.checks?.join('\n') ?? restored?.checks) === undefined ? {} : { checks: model.checks?.join('\n') ?? restored?.checks },
    ...(model.deliverables?.join('\n') ?? restored?.deliverables) === undefined ? {} : { deliverables: model.deliverables?.join('\n') ?? restored?.deliverables },
    ...(restored?.params === undefined ? {} : { params: restored.params })
  }))
  const [whoOpen, setWhoOpen] = useState(false)
  const rootRef = useRef<string | null>(null)
  const pickRecipe = (id: string, answer: string, values: Record<string, string> = params): void => {
    setRecipeId(id)
    const r = model.recipes?.find((x) => x.id === id)
    if (r === undefined) return
    // Rendered against the CHOSEN repository — `{repository}` is where this
    // run happens, not where the recipe was saved from.
    const fill = applyRecipe(r, answer, { ...(rootRef.current === null ? {} : { repository: rootRef.current }), params: values })
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
  const [refusal, setRefusal] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const firstRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null)

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

  // M323. The root a restored draft named is offered FIRST, then the last
  // used — each only if the list still holds it, and only once.
  // M400. The list is read ONCE, at open, for every placed teammate at once:
  // it no longer depends on who is picked, so there is no later read for an
  // earlier one to overtake (the request counter this replaced). A teammate
  // whose walk refuses costs its own rows, never the field.
  const firstRoot = useRef(restored?.root)
  useEffect(() => {
    let live = true
    const placed = model.teammates.filter((t) => t.places.length > 0)
    void Promise.all(placed.map((t) => model.repositories(t.id).catch(() => null))).then((answers) => {
      if (!live) return
      const granted: StartWorkRepo[] = []
      for (const answer of answers) {
        if (answer?.kind !== 'repos') continue
        for (const r of answer.repos) if (!granted.some((g) => g.path === r.path)) granted.push(r)
      }
      const recent: StartWorkRepo[] = (model.recents ?? []).filter((d) => d.startsWith('/') && !granted.some((g) => g.path === d)).map((d) => ({ path: d, repo: null }))
      const all = [...granted, ...recent]
      setRepos((cur) => [...all, ...(cur ?? []).filter((c) => !all.some((a) => a.path === c.path))])
      // M313/M315/M323. A proposal's directory, then the draft's or the last
      // used repository, then the only GRANTED one: selected, and still
      // changeable. A proposal chooses only among the granted (load-bearing:
      // `tc task` never widens); the last used may be a recent folder.
      const remembered = firstRoot.current !== undefined ? { root: firstRoot.current } : last
      firstRoot.current = undefined
      const pick = preselectRoot(granted, { ...(model.preferRoot === undefined ? {} : { preferRoot: model.preferRoot }), last: remembered })
        || (remembered?.root !== undefined && all.some((r) => r.path === remembered.root) ? remembered.root : '')
      if (pick !== '') setRoot((cur) => (cur === '' ? pick : cur))
    })
    return () => { live = false }
    // `model` is rebuilt per open, not per render: read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // M400. Choose… — the launcher's folder dialog. The folder joins the list and is selected; nothing is granted until Start.
  const chooseFolder = (): void => {
    void model.chooseFolder?.().then((dir) => {
      if (dir === null || dir === undefined || dir === '') return
      setRepos((cur) => ((cur ?? []).some((r) => r.path === dir) ? (cur ?? []) : [...(cur ?? []), { path: dir, repo: null }]))
      setRoot(dir); setRefusal(null)
    })
  }

  const ctx = useMemo(() => ({
    teammates: model.teammates, repos, wanted,
    ...(model.agentAvailable === undefined ? {} : { agentAvailable: model.agentAvailable }),
    ...(model.itemState === undefined ? {} : { itemState: model.itemState }),
    ...(model.available === undefined ? {} : { available: model.available }),
    ...(model.budgetUsd === undefined ? {} : { budgetUsd: model.budgetUsd }),
    ...(model.windowPercent === undefined ? {} : { windowPercent: model.windowPercent })
  }), [model.teammates, repos, wanted, model.agentAvailable, model.itemState, model.available, model.budgetUsd, model.windowPercent])
  // M319. Whether each backend can do what THIS task asks — its rows are the
  // capabilities the task touches. A row is judged as if it were chosen, so
  // the rows do not depend on the choice: computed first, the preselection
  // reads them, and a required capability unmet is a fourth refusal below.
  const taskText = [brief, criteriaText, checksText, deliverText, recipe?.brief ?? '', recipe?.criteria.join('\n') ?? ''].join('\n')
  const baseChoice = { title, ...(teammateId === '' ? {} : { teammateId }), ...(root === '' ? {} : { root }), ...(swarm === '' ? {} : { swarm }) }
  const backendRows = startWorkBackendRows(baseChoice, ctx, taskText)
  // M403. The installed engine (the launcher's answer) before the default.
  const backend = backendPick ?? preselectBackend(backendRows, [model.backend, last?.backend, installedFirstBackend(model.available), DEFAULT_BACKEND])
  const choice = { ...baseChoice, ...(backend === DEFAULT_BACKEND ? {} : { backend }) }
  const needs = startWorkNeeds(choice, ctx)
  const blocking = startWorkRefusal(choice, ctx)
  // M275. The arrangement's own refusal is a THIRD kind: the triple can be
  // answered and the shape still not apply. It disables Start by itself, so a
  // swarm cannot half-land and then report why.
  // M400. WHO, from the folder when nobody was picked — the launcher's answer.
  const who = startWorkWho(choice, ctx, prefer === '' ? undefined : prefer)
  const whoSeat = who.kind === 'mint' ? { name: who.name, places: who.places } : who.kind === 'reuse' ? { name: teammateWord(who.mate), places: who.mate.places } : undefined
  const swarmBlocked = startWorkSwarmRefusal(choice, ctx, whoSeat)
  const fit = startWorkBackendFit(choice, ctx, taskText)
  const backendBlocked = fit.verdict === 'refused' ? (fit.refusal ?? fitSummary(fit)) : null
  const mate = who.kind === 'picked' || who.kind === 'reuse' ? who.mate : undefined
  const chosenRoot = startWorkRoot(choice, ctx)
  rootRef.current = chosenRoot
  const summary = startWorkSummary(choice, who.kind === 'mint' ? who.name : mate, chosenRoot)
  // M323/M400. Who does it is a QUESTION only when it has no answer — a
  // picked teammate that cannot work in this folder or has no places, or a
  // backend this task refuses. Otherwise it is one line with Change.
  const whoForced = needs.some((n) => n.field === 'agent') || blocking !== null || backendBlocked !== null
  // M321. A recipe's `{repository}` follows the repository: re-rendered when it changes.
  useEffect(() => {
    if (recipe !== undefined) pickRecipe(recipe.id, aim)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosenRoot])
  // M323. The draft, written as it changes — so stepping out to set up a
  // repository or a teammate (both close this sheet) loses nothing.
  useEffect(() => {
    if (!plainDoor || busy) return
    startDraftStore.save({
      title,
      // M400. Only a PICKED teammate is kept; a restored one is a preference again.
      ...(teammateId === '' ? {} : { teammateId }),
      ...(chosenRoot === null ? {} : { root: chosenRoot }),
      ...(backendPick === null ? {} : { backend: backendPick }),
      ...(brief === '' ? {} : { brief }),
      ...(criteriaText === '' ? {} : { criteria: criteriaText }),
      ...(checksText === '' ? {} : { checks: checksText }),
      ...(deliverText === '' ? {} : { deliverables: deliverText }),
      ...(swarm === '' ? {} : { swarm }),
      ...(recipeId === '' ? {} : { recipeId }),
      ...(aim === '' ? {} : { aim }),
      ...(Object.keys(params).length === 0 ? {} : { params }),
      ...(issueKey === '' ? {} : { issueKey })
    })
  }, [plainDoor, busy, title, teammateId, chosenRoot, backendPick, brief, criteriaText, checksText, deliverText, swarm, recipeId, aim, params, issueKey])
  const discardDraft = (): void => {
    startDraftStore.clear()
    setDraftShown(false)
    setTitle(''); setBrief(''); setCriteriaText(''); setChecksText(''); setDeliverText(''); setSwarm(''); setRecipeId(''); setAim(''); setParams({}); setIssueKey(''); setRoute('typed'); setBackendPick(null)
    setRefusal(null)
  }
  // M321. PREFLIGHT — the tools the setup and the checks invoke, looked up on
  // the login PATH, and the ports the next lane would get; nothing runs.
  const checkLines = checksText.split('\n').map((c) => c.trim()).filter((c) => c !== '')
  const setupForPreflight = setupRead !== null && setupRead.kind !== 'not-a-repo' ? setupRead : null
  const wantedTools = preflightTools({ checks: checkLines, ...(recipe === undefined ? {} : { recipe }), setup: setupForPreflight })
  const toolsKey = `${chosenRoot ?? ''}|${wantedTools.map((t) => t.tool).join(' ')}|${setupRead?.kind ?? ''}`
  const [probe, setProbe] = useState<{ key: string; tools: Record<string, boolean>; ports: Record<string, number | null> | null } | null>(null)
  useEffect(() => {
    if (chosenRoot === null || model.preflightOf === undefined) return
    let live = true
    const key = toolsKey
    void model.preflightOf({ root: chosenRoot, tools: wantedTools.map((t) => t.tool) }).then((r) => { if (live) setProbe({ key, ...r }) }, () => undefined)
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolsKey])
  const probed = probe !== null && probe.key === toolsKey ? probe : null
  const preflight: Preflight | null = chosenRoot === null ? null : recipePreflight({
    checks: checkLines,
    ...(recipe === undefined ? {} : { recipe }),
    texts: [{ field: 'outcome', text: brief }, ...recipeTexts({ brief: '', criteria: criteriaText.split('\n'), checks: checkLines, deliverables: deliverText.split('\n') }).filter((t) => t.text !== '')],
    renderContext: { repository: chosenRoot, params },
    setup: setupForPreflight,
    tools: model.preflightOf === undefined ? {} : probed?.tools ?? null,
    ports: probed?.ports ?? null
  })
  // M321. What must hold before a worker exists — a fifth refusal, same rule.
  const preflightBlocked = preflight?.blocked ?? null
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
  // M403. One name for the agent: the who line, the Runtime line and the mint's name (the foot) all read it.
  const backendLabel = startAgentName(backend)
  // What Options holds, said on its closed row so nothing set there is invisible.
  const optionsHeld = [recipe === undefined ? '' : recipe.name, swarm === '' ? '' : SWARM_PRESETS[swarm].label, brief.trim() === '' ? '' : 'outcome', criteriaText.trim() === '' ? '' : 'done when', checkLines.length === 0 ? '' : 'checks', deliverText.trim() === '' ? '' : 'hand back'].filter((x) => x !== '')
  const query = issueQuery.trim().toLowerCase()
  const shownIssues = issues?.kind === 'items' ? issues.items.filter((i) => query === '' || i.key.toLowerCase().includes(query) || i.title.toLowerCase().includes(query)) : []
  const pickIssue = (key: string): void => {
    setIssueKey(key)
    const picked = issues?.kind === 'items' ? issues.items.find((i) => i.key === key) : undefined
    if (picked !== undefined) setTitle(picked.title)
    setRoot(''); setRefusal(null)
  }

  const submit = (): void => {
    if (busy || blocking !== null || swarmBlocked !== null || backendBlocked !== null || preflightBlocked !== null || needs.length > 0 || chosenRoot === null) return
    setBusy(true); setRefusal(null)
    const criteria = criteriaText.split('\n').map((c) => c.trim()).filter((c) => c !== '')
    const checks = checksText.split('\n').map((c) => c.trim()).filter((c) => c !== '')
    const deliverables = deliverText.split('\n').map((c) => c.trim()).filter((c) => c !== '')
    void model.submit({
      ...(checks.length === 0 ? {} : { checks }),
      ...(deliverables.length === 0 ? {} : { deliverables }),
      ...(recipe === undefined ? {} : { recipeId: recipe.id }),
      title: title.trim(), root: chosenRoot, ...(swarm === '' ? {} : { swarm }),
      ...(teammateId === '' ? {} : { teammateId }),
      ...(teammateId === '' && who.kind === 'reuse' ? { preferTeammateId: who.mate.id } : {}),
      ...(backend === DEFAULT_BACKEND ? {} : { backend }),
      ...(recipe === undefined || Object.keys(params).length === 0 ? {} : { recipeParams: params }),
      ...(issue === undefined ? {} : { issue }),
      ...(brief.trim() === '' ? {} : { brief: brief.trim() }),
      ...(criteria.length === 0 ? {} : { criteria })
    }).then((result) => {
      setBusy(false)
      if (result.kind === 'refused') { setRefusal(result.reason); return }
      // M323. Started: the draft is spent, and what it used is the next start's preselection.
      if (plainDoor) startDraftStore.clear()
      startDraftStore.remember({ ...(mate === undefined ? {} : { teammateId: mate.id }), root: chosenRoot, backend })
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
    // launcher's M205 critic, met again). M323: a disclosure's SUMMARY is the
    // same — Enter on "Options" opens it, it does not start the task.
    if (event.key === 'Enter' && event.target instanceof HTMLElement && (event.target.tagName === 'BUTTON' || event.target.tagName === 'SUMMARY')) return
    if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); submit() }
  }

  return (
    <div className="sheet" data-start-sheet role="form" aria-label="New task" onKeyDown={onKey}>
      <SheetHeader current="task" onPanel={model.openPanel} />

      {/* M323. A draft kept from the last time this sheet was left — said, with the way to drop it. */}
      {draftShown && (
        <p className="sheet__hint" data-start-draft-restored>
          Your unfinished task is back where you left it.{' '}
          <button type="button" className="pf__verb pf__verb--word" data-start-draft-discard
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
            onClick={(e) => { e.preventDefault(); discardDraft() }}>Discard</button>
        </p>
      )}

      {/* M310/M323. From an issue — the ALTERNATE route. Choosing one names
          the task and, for GitHub, the repository, the way a card from that
          issue would. The search narrows a long list by key or title. */}
      {route === 'issue' && !model.titleFixed && model.issues !== undefined && (
        <div className="sheet__field" data-start-issue-route-open>
          <span className="sheet__label">From issue</span>
          <input className="sheet__input" data-start-issue-search value={issueQuery} placeholder="search open issues by key or title" spellCheck={false}
            disabled={issues === null || issues.kind === 'none'}
            onKeyDown={(e) => {
              // Enter picks the first match; it never starts the task from the search box.
              if (e.key !== 'Enter') return
              e.preventDefault(); e.stopPropagation()
              const first = shownIssues[0]
              if (first !== undefined) pickIssue(first.key)
            }}
            onChange={(e) => setIssueQuery(e.target.value)} />
          <select className="sheet__select" data-start-issue value={issueKey} aria-label="issue"
            disabled={issues === null || issues.kind === 'none'}
            onChange={(e) => pickIssue(e.target.value)}>
            <option value="">{issues === null ? 'reading open issues…' : issues.kind === 'none' ? issues.reason : shownIssues.length === 0 ? 'no open issue matches' : 'choose an issue…'}</option>
            {shownIssues.map((i) => (
              <option key={i.key} value={i.key} data-start-issue-row={i.key}>{i.key} — {i.title}</option>
            ))}
          </select>
        </div>
      )}

      <label className="sheet__field">
        <span className="sheet__label">Task</span>
        {model.titleFixed ? (
          <span className="sheet__input sheet__input--fixed" data-start-task data-start-task-fixed title={model.title}>{model.title}</span>
        ) : (
          <input ref={(el) => { if (!model.titleFixed) firstRef.current = el }} className="sheet__input" data-start-task value={title} placeholder="what do you want done?" spellCheck={false}
            onChange={(e) => { setTitle(e.target.value); setRefusal(null) }} />
        )}
      </label>
      {!model.titleFixed && model.issues !== undefined && (
        <p className="sheet__hint sheet__route">
          <button type="button" className="pf__verb pf__verb--word" data-start-issue-route={route}
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
            onClick={(e) => {
              e.preventDefault()
              if (route === 'issue') { setRoute('typed'); setIssueKey(''); setIssueQuery(''); setRoot('') } else setRoute('issue')
            }}>{route === 'issue' ? 'Type the task instead' : 'Start from an issue instead'}</button>
        </p>
      )}

      {/* M400 (B1). WHERE — after what, the launcher's order, and never
          disabled: the list is every placed teammate's repositories and the
          recent folders, and Choose… opens the folder dialog. Who follows
          from it (below). */}
      <div className="sheet__field">
        <span className="sheet__label">Repository</span>
        <span className="sheet__folder-row">
          <select ref={(el) => { if (model.titleFixed && !whoForced) firstRef.current = el }} className="sheet__select sheet__select--mono" data-start-repo value={root} aria-label="repository"
            onChange={(e) => { setRoot(e.target.value); setRefusal(null) }}>
            {/* The `auto` row names the clone it derived rather than saying
                `auto`: the user is being told which folder the work will happen
                in, and `auto` is a word about the app, not about the work. */}
            <option value="">{chosenRoot !== null && root === '' ? `${shortPath(chosenRoot, 2)} — the clone of ${String(wanted)}` : repos === undefined ? 'reading your repositories…' : 'choose a repository folder…'}</option>
            {(repos ?? []).map((r) => (
              <option key={r.path} value={r.path} data-start-repo-row={r.path}>{shortPath(r.path, 2)}{r.repo === null ? '' : ` — ${r.repo}`}</option>
            ))}
          </select>
          {model.chooseFolder !== undefined && (
            <button type="button" className="pf__verb pf__verb--word" data-start-choose-folder title="Choose a folder with the system dialog"
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
              onClick={(e) => { e.preventDefault(); chooseFolder() }}>Choose…</button>
          )}
        </span>
      </div>

      {/* M323/M400. WHO — answered already, from the folder, said on one
          line with Change. It opens by itself only when a PICKED teammate
          cannot work in the folder, or the answer cannot do this task. Closed, the
          pickers stay in the DOM, so every route that sets them still can. */}
      <details className="sheet__advanced sheet__who" data-start-who open={whoForced || whoOpen}
        onToggle={(e) => { if (!whoForced) setWhoOpen(e.currentTarget.open) }}>
        <summary className="sheet__advanced-toggle" data-start-who-summary>
          {who.kind === 'mint'
            ? `${backendLabel} · on its own branch, and may work only in ${shortPath(who.places[0] ?? '')}`
            : mate === undefined ? `${backendLabel} · works in the folder you choose` : `${teammateWord(mate)} · ${backendLabel}`}
          <span className="sheet__who-change"> · Change</span>
        </summary>
        <label className="sheet__field">
          <span className="sheet__label">Agent</span>
          <select ref={(el) => { if (model.titleFixed && whoForced) firstRef.current = el }} className="sheet__select" data-start-agent value={teammateId} aria-label="teammate"
            onChange={(e) => { setTeammateId(e.target.value); setRefusal(null) }}>
            {/* M400. Automatic is the launcher's answer: a teammate whose place holds the folder, or a new one for exactly it. */}
            <option value="" data-start-agent-row="auto">Automatic — {who.kind === 'mint' ? `a new teammate for ${shortPath(who.places[0] ?? '')}` : who.kind === 'reuse' && teammateId === '' ? teammateWord(who.mate) : 'the teammate for this folder'}</option>
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

        {/* M319. THE BACKEND, judged against this task. Every row is offered —
            one that cannot do the task is disabled with why, never dropped —
            and below it only the capabilities THIS task touches, each met or
            not, in the vendor's own words. Stated before a session exists. */}
        <label className="sheet__field">
          <span className="sheet__label">Backend</span>
          <select className="sheet__select" data-start-backend value={backend} aria-label="backend"
            onChange={(e) => { setBackendPick(e.target.value as AgentBackend); setRefusal(null) }}>
            {backendRows.map((r) => (
              <option key={r.backend} value={r.backend} disabled={r.fit.verdict === 'refused'} data-start-backend-row={r.backend} data-start-backend-fit={r.fit.verdict}>
                {r.label}{r.fit.verdict === 'fits' ? ' — can do everything this task needs' : r.fit.verdict === 'refused' ? ` — cannot: ${r.fit.refusal ?? ''}` : ` — without ${r.fit.rows.filter((x) => !x.ok).length} of what this task asks`}
              </option>
            ))}
          </select>
        </label>
        <div className="sheet__field sheet__field--how" data-start-fit={fit.verdict}>
          <span className="sheet__label">This task</span>
          <span className="sheet__defaults sheet__fit">
            {fit.rows.map((r) => (
              <span key={r.id} className={`sheet__fit-row${r.ok ? '' : r.level === 'required' ? ' is-refused' : ' is-degraded'}`} data-start-fit-row={r.id} data-start-fit-ok={r.ok ? 'yes' : 'no'} data-start-fit-level={r.level}>
                {r.ok ? '✓' : r.level === 'required' ? '✕' : '–'} {r.line}
              </span>
            ))}
          </span>
        </div>

        {/* M262. What runs, said: a lane is Claude Code with the CLI's own
            defaults — nothing on this sheet changes them, and saying so is
            what stops a person hunting for a knob that is not here. */}
        <div className="sheet__field sheet__field--how">
          <span className="sheet__label">Runtime</span>
          <span className="sheet__defaults" data-start-defaults>{runtimeDefaultsLine(backendLabel, {})} · {plan === null ? 'in its own worktree' : `${plan.line} · the person opens the pull request`}</span>
        </div>
        {/* The route to the grant, named — never a widening from inside a start. */}
        <button type="button" className="pf__verb pf__verb--word" data-start-open-teammates
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
          onClick={(e) => { e.preventDefault(); model.openTeammates() }}>Open the Teammates pane</button>
      </details>

      {/* M323. OPTIONS — recipe, outcome, criteria, checks, deliverables and
          the arrangement. Closed at rest for "fix this bug"; open by itself
          when any of it already holds something, and its closed row names
          what it holds. */}
      <details className="sheet__advanced sheet__options" data-start-options open={optionsOpen}
        onToggle={(e) => setOptionsOpen(e.currentTarget.open)}>
        <summary className="sheet__advanced-toggle" data-start-options-summary>
          Options{optionsHeld.length === 0 ? ' — recipe, done when, checks, arrangement' : ` — ${optionsHeld.join(', ')}`}
        </summary>
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
        {/* M321. The recipe's parameters — a path it was saved with that is not
            this repository's, say. Blank takes the default; blank with none
            refuses the start below, by name. */}
        {recipe?.params?.map((p) => (
          <label key={p.name} className="sheet__field">
            <span className="sheet__label" title={p.label}>{p.name}</span>
            <input className="sheet__input sheet__input--mono" data-start-recipe-param={p.name} value={params[p.name] ?? ''} placeholder={p.default ?? p.label} spellCheck={false}
              onChange={(e) => { const next = { ...params, [p.name]: e.target.value }; setParams(next); pickRecipe(recipe.id, aim, next) }} />
          </label>
        ))}

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
            what the review's Run checks offers first. Inside Options they no
            longer need to hide behind a recipe (M323). */}
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

        {/* M275. THE ARRANGEMENT. After the repository on purpose: the seats'
            folders are that repository's, so a shape chosen before it would
            preview worktrees of nowhere. Solo is first and selected, because
            the default must stay the start that shipped. */}
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
      </details>

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

      {/* M321. BEFORE IT STARTS — what will run in the lane (install steps,
          services with the ports they would get, the checks) and what must
          hold first (tools on PATH, a saved setup, filled parameters). A
          blocking item disables Start; nothing here runs anything. */}
      {preflight !== null && (preflight.items.length > 0 || preflight.plan.install.length > 0 || preflight.plan.checks.length > 0 || preflight.plan.services.length > 0) && (
        <div className="sheet__field sheet__field--how" data-start-preflight={preflight.blocked === undefined ? 'clear' : 'blocked'}>
          <span className="sheet__label">Before it starts</span>
          <span className="sheet__defaults sheet__fit">
            {preflight.plan.install.length > 0 && <span className="sheet__fit-row" data-start-preflight-install>prepares with {preflight.plan.install.map((c) => `\`${c}\``).join(' then ')}</span>}
            {preflight.plan.services.map((sv) => (
              <span key={sv.name} className="sheet__fit-row" data-start-preflight-service={sv.name}>service {sv.name}: `{sv.command}`{sv.port === undefined ? '' : sv.port === null ? ' — no free port' : ` on :${sv.port}`}</span>
            ))}
            {preflight.plan.checks.length > 0 && <span className="sheet__fit-row" data-start-preflight-checks>checks {preflight.plan.checks.map((c) => `\`${c}\``).join(', ')}</span>}
            {preflight.items.filter((i) => !i.ok).map((i) => (
              <span key={i.id} className={`sheet__fit-row ${i.severity === 'block' ? 'is-refused' : 'is-degraded'}`} data-start-preflight-item={i.id}>{i.severity === 'block' ? '✕' : '–'} {i.line}</span>
            ))}
            {preflight.items.length > 0 && preflight.items.every((i) => i.ok) && <span className="sheet__fit-row" data-start-preflight-ok>✓ {preflight.items.length} prerequisite{preflight.items.length === 1 ? '' : 's'} met</span>}
          </span>
        </div>
      )}

      <div className="sheet__foot">
        {/* The triple, before anything is minted. */}
        <span className="sheet__preview" data-start-summary title={chosenRoot ?? undefined}>{summary === '' ? 'a task, its repository and who does it' : summary}</span>
        {/* What is still missing — one sentence, the first need's, because a
            list of three would state two questions the flow has not reached. */}
        {needs.length > 0 && blocking === null && (
          <span className="sheet__hint" data-start-need={needs[0]?.field}>{needs[0]?.why}</span>
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
        {preflightBlocked !== null && blocking === null && swarmBlocked === null && backendBlocked === null && (
          <span className="sheet__refusal" data-start-preflight-refusal role="alert">{preflightBlocked}</span>
        )}
        {/* M319. The backend's refusal — a requirement of THIS task it cannot meet. */}
        {backendBlocked !== null && blocking === null && swarmBlocked === null && (
          <span className="sheet__refusal" data-start-backend-refusal role="alert">{backendBlocked}</span>
        )}
        {plan !== null && plan.ceilingLine !== '' && swarmBlocked === null && (
          <span className="sheet__hint" data-start-swarm-ceiling>{plan.ceilingLine}</span>
        )}
        {refusal !== null && <span className="sheet__refusal" data-start-refusal role="alert">{refusal}</span>}
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
          <button type="button" className="sheet__button is-primary" data-start-submit disabled={busy || blocking !== null || swarmBlocked !== null || backendBlocked !== null || preflightBlocked !== null || needs.length > 0 || chosenRoot === null}
            title={needs[0]?.why ?? blocking ?? swarmBlocked ?? backendBlocked ?? preflightBlocked ?? undefined}
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
            onClick={(e) => { e.preventDefault(); submit() }}>{busy ? (plan === null ? 'Starting the lane…' : 'Making the arrangement…') : 'Start task'}</button>
        </div>
      </div>
    </div>
  )
}
