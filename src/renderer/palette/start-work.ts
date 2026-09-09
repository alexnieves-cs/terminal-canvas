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
 * **The order is a DEPENDENCY, not a preference.** `task`, then `agent`,
 * then `repository`: the repositories on offer are the ones under the CHOSEN
 * teammate's places, so there is nothing to list until the agent is known.
 * Asking for a repository first would offer a list belonging to nobody, and
 * the Places gate would then refuse the chosen root by name — a question
 * answered and then overruled.
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
import { teammateRefusal, workItemRefusal } from '@shared/work-items'

/** The three inputs, in the order they are asked. */
export type StartWorkNeedField = 'task' | 'agent' | 'repository'
export interface StartWorkNeed { field: StartWorkNeedField; why: string }

/** A repository under a teammate's places, as main answered it. `repo` is the normalised origin, or null for a repository with no origin — which is still a repository to work in. */
export interface StartWorkRepo { path: string; repo: string | null }

/** What the user has chosen so far. Every field but the title is absent until answered. */
export interface StartWorkChoice {
  title: string
  teammateId?: string
  /** An absolute repository root the user picked. When absent, an `auto` resolution may still supply one. */
  root?: string
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
  if (mate === undefined) {
    needs.push({ field: 'agent', why: 'choose a teammate to do the work — it brings its own places, services and brief' })
    // The repository list is the CHOSEN teammate's places' clones. With no
    // teammate there is nothing to list, so the question is not asked yet.
    return needs
  }
  if (startWorkRoot(choice, ctx) !== null) return needs
  const name = teammateWord(mate)
  if (ctx.repos === undefined) {
    needs.push({ field: 'repository', why: `reading the repositories under ${name}'s places…` })
    return needs
  }
  if (ctx.repos.length === 0) {
    needs.push({ field: 'repository', why: `${name}'s places hold no repository — add a folder with a clone in the Teammates pane` })
    return needs
  }
  const resolved = resolveRepository(ctx.repos, ctx.wanted)
  if (resolved.kind === 'ambiguous') {
    needs.push({ field: 'repository', why: `${resolved.paths.length} of ${name}'s repositories are clones of ${String(ctx.wanted)} — choose which one` })
    return needs
  }
  needs.push({
    field: 'repository',
    why: ctx.wanted === null
      ? `choose which of ${name}'s ${ctx.repos.length} repositories to work in`
      : `no place of ${name}'s holds a clone of ${ctx.wanted} — choose another repository, or add the folder in the Teammates pane`
  })
  return needs
}

/**
 * The refusals a SHEET cannot answer: there is no teammate to choose, or the
 * chosen one may touch nothing. Both are grants, and nothing in this flow
 * widens one — the fix is named and it is in the Teammates pane.
 * `teammateRefusal` is M114's own sentence, imported rather than restated.
 */
export function startWorkRefusal(choice: StartWorkChoice, ctx: StartWorkContext): string | null {
  if (ctx.teammates.length === 0) return 'no teammate yet — add one in the Teammates pane, with a folder it may work in'
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
export function startWorkSummary(choice: StartWorkChoice, mate: PersistedTeammate | undefined, root?: string | null): string {
  const where = root === undefined ? choice.root : (root ?? choice.root)
  return [choice.title.trim(), where === undefined || where === '' ? undefined : shortPath(where), mate === undefined ? undefined : teammateWord(mate)]
    .filter((p): p is string => p !== undefined && p !== '')
    .join(' · ')
}
