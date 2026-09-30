/**
 * M197 (D05). THE START WORK MODEL — pure, plain-node checked in
 * `verify:palette start.1a–.1e`.
 *
 * A start is a TRIPLE: a TASK (a work item, existing or minted here), an
 * AGENT (a teammate — the identity; its chat is the conversation and the
 * session the execution, D01's distinction unchanged) and a REPOSITORY (an
 * absolute root on disk). This module answers ONE question: which of the
 * three the app cannot derive, so the flow asks for those and nothing else.
 *
 * Two rules here are load-bearing and each fails silently if undone.
 *
 * **The order is the launcher's: `task`, then `repository`, then — only
 * when it cannot be derived — `agent`** (M400, B1). Until M400 the agent came
 * first, because the repositories on offer were the CHOSEN teammate's; a
 * fresh install has no teammate, so its "+ New task" showed a disabled
 * Repository over "no teammate yet" while the launcher started the same
 * task from a sentence and a folder. Now the repositories on offer are every
 * placed teammate's (plus recent folders and Choose…), and WHO follows from
 * WHERE through `folderTeammatePlan` — the launcher's own reuse-or-mint rule.
 * The agent is a question only when the person PICKED one whose places do
 * not contain the chosen folder; the Places gate in main stays the authority.
 *
 * **An EMPTY needs list is the dispatch-without-a-sheet signal.** M114's
 * gesture — drag a GitHub card onto a teammate whose place holds its clone —
 * still starts work in one drop, because nothing is missing. A flow that
 * always opened a sheet would make the fast path slower to pay for the case
 * it does not apply to; a flow that never opened one is what shipped, and it
 * is why a typed item could not be started at all (`board-lane.ts` refused
 * it with a sentence naming a choice no surface offered — the `root`
 * argument of `dispatchWorkItem` had no caller in the whole app).
 *
 * `resolveRepository` has THREE arms and not two, for this repository's
 * standing reason: `auto`, `ambiguous` (two clones of one `owner/repo` under
 * the places) and `none` are three different fixes — derive it, ask WHICH,
 * ask for ANY — and an item that names no repository at all is `none`,
 * never `ambiguous`.
 */
import { shortPath } from '@shared/display-path'
import { teammateWord, type PersistedTeammate } from '@shared/teammates'
import { teammateRefusal, workItemRefusal, type WorkItemState } from '@shared/work-items'
import { SWARM_PRESETS, swarmRefusal, type SwarmPresetId } from '@shared/swarm'
import { BACKENDS, BACKEND_IDS, DEFAULT_BACKEND, type AgentBackend } from '@shared/agent-backends'
import { folderTeammatePlan, placeContains } from '@shared/onboarding'
import { backendFit, briefIsReadOnly, briefWantsImages, taskRequirements, type BackendFit, type TaskRequirement } from '@shared/backend-fit'

/** The three inputs, in the order they are asked (M400: the launcher's — what, where, who). */
export type StartWorkNeedField = 'task' | 'repository' | 'agent'
export interface StartWorkNeed { field: StartWorkNeedField; why: string }

/** A repository under a teammate's places, as main answered it. `repo` is the normalised origin, or null for a repository with no origin — which is still a repository to work in. */
export interface StartWorkRepo { path: string; repo: string | null }

/** What the user has chosen so far. Every field but the title is absent until answered. */
export interface StartWorkChoice {
  title: string
  /** M400. A teammate the person (or the caller: a drop, a card) PICKED. Absent: the folder decides, by `startWorkWho`. */
  teammateId?: string
  /** An absolute repository root the user picked. When absent, an `auto` resolution may still supply one. */
  root?: string
  /**
   * M275. THE ARRANGEMENT — which swarm preset this start opens, or ABSENT
   * for the solo lane M197 shipped. It is deliberately NOT a fourth member of
   * the triple: the triple is what the app cannot DERIVE, and an arrangement
   * always has an answer (one conversation in a lane), so it never adds a
   * need and never blocks Enter. What it can do is REFUSE — see
   * `startWorkSwarmRefusal`.
   */
  swarm?: SwarmPresetId
  /**
   * M319. THE BACKEND the lane runs on — absent is claude, every start before
   * M319. Like the arrangement it is not a member of the triple (it always has
   * an answer), but it can REFUSE: `startWorkBackendFit` decides whether the
   * chosen CLI can do what this task needs before anything is minted.
   */
  backend?: AgentBackend
}

/**
 * What the app knows. `repos` is `undefined` when the list has not been read
 * yet (a teammate was only just chosen) and `[]` when it was read and held
 * nothing — three states, because "not asked" and "no repositories" lead to
 * different sentences. `wanted` is the item's own `owner/repo`, or null for
 * a typed or Jira item, which names none.
 */
export interface StartWorkContext {
  teammates: readonly PersistedTeammate[]
  repos: readonly StartWorkRepo[] | undefined
  wanted: string | null
  /** M275. Whether any agent CLI answered discovery. Absent reads as available — every pre-M275 caller, which had no arrangement to refuse. */
  agentAvailable?: boolean
  /** M275. The card's state, when the start is for a card already on the board. Absent is a task about to be minted, which is `todo`. */
  itemState?: WorkItemState
  /** M319. Discovery's answer per backend CLI. Absent reads as available (a caller with no discovery). */
  available?: Partial<Record<AgentBackend, boolean>>
  /** M319. The canvas's enforced ceilings, read live — a budget a backend cannot report to is stated before the start. */
  budgetUsd?: number
  windowPercent?: number
}

export type StartWorkResolution =
  | { kind: 'auto'; path: string; repo: string }
  | { kind: 'ambiguous'; paths: string[] }
  | { kind: 'none' }

/** Which repository under the places is the item's, if exactly one is. Case-insensitive: GitHub's names are, and `normaliseOrigin` already lower-cases. */
export function resolveRepository(repos: readonly StartWorkRepo[] | undefined, wanted: string | null): StartWorkResolution {
  if (wanted === null || repos === undefined) return { kind: 'none' }
  const want = wanted.toLowerCase()
  const hits = repos.filter((r) => r.repo !== null && r.repo.toLowerCase() === want)
  if (hits.length === 1) return { kind: 'auto', path: (hits[0] as StartWorkRepo).path, repo: want }
  if (hits.length > 1) return { kind: 'ambiguous', paths: hits.map((h) => h.path) }
  return { kind: 'none' }
}

/** The root a start would use: the user's choice first, the sole matching clone second, null when neither. */
export function startWorkRoot(choice: StartWorkChoice, ctx: StartWorkContext): string | null {
  if (choice.root !== undefined && choice.root !== '') return choice.root
  const resolved = resolveRepository(ctx.repos, ctx.wanted)
  return resolved.kind === 'auto' ? resolved.path : null
}

const mateOf = (ctx: StartWorkContext, id: string | undefined): PersistedTeammate | undefined =>
  id === undefined ? undefined : ctx.teammates.find((t) => t.id === id)

/**
 * The missing inputs, in order. EMPTY means every input is known and the
 * start dispatches with no sheet at all.
 */
export function startWorkNeeds(choice: StartWorkChoice, ctx: StartWorkContext): StartWorkNeed[] {
  const needs: StartWorkNeed[] = []
  const titleRefusal = workItemRefusal(choice.title)
  if (titleRefusal !== null) needs.push({ field: 'task', why: titleRefusal })
  const mate = mateOf(ctx, choice.teammateId)
  const root = startWorkRoot(choice, ctx)
  // A picked teammate's own list, when the caller read only that (the card's
  // fast path and the agent line) — its name is the one the sentences use.
  const whose = mate === undefined ? '' : `${teammateWord(mate)}'s `
  if (root === null) {
    if (ctx.repos === undefined) {
      needs.push({ field: 'repository', why: 'reading the repositories you have worked in…' })
      return needs
    }
    const resolved = resolveRepository(ctx.repos, ctx.wanted)
    if (resolved.kind === 'ambiguous') {
      needs.push({ field: 'repository', why: `${resolved.paths.length} of ${whose}repositories are clones of ${String(ctx.wanted)} — choose which one` })
      return needs
    }
    needs.push({
      field: 'repository',
      why: ctx.wanted !== null
        ? `no known repository is a clone of ${ctx.wanted} — choose its folder`
        : ctx.repos.length === 0
          ? (mate === undefined ? 'choose the repository folder to work in' : `${teammateWord(mate)}'s places hold no repository — choose another folder, or add one in the Teammates pane`)
          : `choose which of ${whose === '' ? 'your' : whose}${ctx.repos.length} repositories to work in`
    })
    return needs
  }
  // M400. The agent is asked ONLY when a picked one cannot work there — the
  // folder already answers who for everyone else (reuse, or a new teammate
  // whose only place is exactly that folder).
  if (mate !== undefined && mate.places.length > 0 && !startWorkReaches(mate, root)) {
    needs.push({ field: 'agent', why: `${teammateWord(mate)} may not work in ${shortPath(root)} — choose another agent, or Automatic` })
  }
  return needs
}

/** M400. Does a teammate's grant reach this folder? The launcher's path-segment containment, never a string prefix. */
export function startWorkReaches(mate: Pick<PersistedTeammate, 'places'>, root: string): boolean {
  return mate.places.some((place) => placeContains(place, root))
}

/**
 * M400. WHO would do this start: the PICKED teammate, or — when none was
 * picked — the launcher's answer for the folder (`folderTeammatePlan`): a
 * standing teammate whose place contains it (`prefer`, the last used, first),
 * or a NEW one whose only place is exactly the folder, made at Start and
 * never on a refusal. `none` until there is a folder.
 */
export type StartWorkWho =
  | { kind: 'picked'; mate: PersistedTeammate }
  | { kind: 'reuse'; mate: PersistedTeammate }
  | { kind: 'mint'; name: string; places: string[] }
  | { kind: 'none' }

export function startWorkWho(choice: StartWorkChoice, ctx: StartWorkContext, prefer?: string): StartWorkWho {
  const mate = mateOf(ctx, choice.teammateId)
  if (mate !== undefined) return { kind: 'picked', mate }
  const root = startWorkRoot(choice, ctx)
  if (root === null) return { kind: 'none' }
  const plan = folderTeammatePlan(root, ctx.teammates, prefer)
  if (plan.reuse !== undefined) {
    const standing = ctx.teammates.find((t) => t.id === plan.reuse)
    if (standing !== undefined) return { kind: 'reuse', mate: standing }
  }
  return plan.mint === undefined ? { kind: 'none' } : { kind: 'mint', name: plan.mint.name, places: plan.mint.places }
}

/**
 * The refusal a SHEET cannot answer: the PICKED teammate may touch nothing. Both are grants, and nothing in this flow
 * widens one — the fix is named and it is in the Teammates pane.
 * `teammateRefusal` is M114's own sentence, imported rather than restated.
 */
export function startWorkRefusal(choice: StartWorkChoice, ctx: StartWorkContext): string | null {
  // M400. An empty roster is NOT a refusal any more: the folder answers who
  // (the launcher's mint), so a fresh install starts from "+ New task".
  const mate = mateOf(ctx, choice.teammateId)
  return mate === undefined ? null : teammateRefusal(mate)
}

/**
 * M197. What a start ANSWERS. Before this milestone the verb returned void
 * and the agent's `dispatch` arm reported `{ kind: 'ran' }` the instant it
 * was called — every refusal (the place gate, the missing clone, git,
 * `agent:create`, M82's budget on the first send) happened after that return
 * and landed only in the card's `note`, which the caller never reads. A verb
 * that cannot fail in the caller's view is a verb that fails silently.
 */
export type StartWorkOutcome =
  | { kind: 'started'; itemId: string; panelId: string }
  | { kind: 'refused'; reason: string }

/** The triple, stated before anything is minted. The root in the path rule's words; the full path rides the element's `title`, as everywhere. */
export function startWorkSummary(choice: StartWorkChoice, mate: PersistedTeammate | string | undefined, root?: string | null): string {
  const where = root === undefined ? choice.root : (root ?? choice.root)
  return [
    choice.title.trim(),
    where === undefined || where === '' ? undefined : shortPath(where),
    // M400. A string is a teammate not made yet — the launcher's `Claude · <folder>`.
    mate === undefined ? undefined : typeof mate === 'string' ? mate : teammateWord(mate),
    // M275. The arrangement joins the summary rather than replacing a member
    // of it: a swarm is still a task, a teammate and a repository, and the
    // person is owed the shape as well as the triple before anything mints.
    choice.swarm === undefined ? undefined : `${SWARM_PRESETS[choice.swarm].label} arrangement`
  ]
    .filter((p): p is string => p !== undefined && p !== '')
    .join(' · ')
}

/**
 * M275. Why the CHOSEN arrangement cannot start — null for the solo lane,
 * which is always available, and null when the swarm can run.
 *
 * It is separate from `startWorkRefusal` (the grants a sheet cannot answer)
 * and from `startWorkNeeds` (the questions a sheet asks) because it is a third
 * kind of thing: the triple is answered and the arrangement still does not
 * apply — no CLI for the seats, or a card in a state this shape makes no
 * sense from. Kept as one function so the sheet's disabled Start, the palette
 * row's reason and the executor's last gate cannot disagree.
 */
export function startWorkSwarmRefusal(choice: StartWorkChoice, ctx: StartWorkContext, who?: { name: string; places: readonly string[] }): string | null {
  if (choice.swarm === undefined) return null
  const mate = mateOf(ctx, choice.teammateId)
  // M400. `who` is the teammate the folder decided (reused or to be made) when none was picked.
  const seat = mate === undefined ? who : { name: teammateWord(mate), places: mate.places }
  return swarmRefusal(SWARM_PRESETS[choice.swarm], {
    agentAvailable: ctx.agentAvailable !== false,
    ...(seat === undefined ? {} : { teammate: seat }),
    ...(ctx.itemState === undefined ? {} : { item: { state: ctx.itemState } })
  })
}

/**
 * M319. What THIS start asks of its backend: a dispatched lane (always), an
 * arrangement's seats, the canvas's budget and window ceilings, and what the
 * brief, criteria and recipe say (an image to read; a tree not to touch).
 * `text` is everything the person wrote about the task.
 */
export function startWorkRequirements(choice: StartWorkChoice, ctx: StartWorkContext, text = ''): TaskRequirement[] {
  const words = `${choice.title}\n${text}`
  return taskRequirements({
    lane: true,
    swarm: choice.swarm !== undefined,
    ...(ctx.budgetUsd === undefined ? {} : { budgetUsd: ctx.budgetUsd }),
    ...(ctx.windowPercent === undefined ? {} : { windowPercent: ctx.windowPercent }),
    images: briefWantsImages(words),
    readOnly: briefIsReadOnly(words)
  })
}

/** M319. The chosen backend's fit — the sheet's rows, its disabled Start and the executor's last gate read this one answer. */
export function startWorkBackendFit(choice: StartWorkChoice, ctx: StartWorkContext, text = ''): BackendFit {
  const backend = choice.backend ?? DEFAULT_BACKEND
  return backendFit(backend, startWorkRequirements(choice, ctx, text), ctx.available?.[backend] ?? true)
}

/** M319. Every backend's fit for the picker, in registry order — a row that cannot do the task is offered disabled with why, never dropped. */
export function startWorkBackendRows(choice: StartWorkChoice, ctx: StartWorkContext, text = ''): { backend: AgentBackend; label: string; fit: BackendFit }[] {
  return BACKEND_IDS.map((backend) => {
    const fit = startWorkBackendFit({ ...choice, backend }, ctx, text)
    return { backend, label: BACKENDS[backend].label, fit }
  })
}
