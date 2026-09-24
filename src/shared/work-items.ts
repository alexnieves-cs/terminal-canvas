/**
 * M113. THE WORK ITEM RECORD — the board's row, on the workspace beside
 * groups, runs, bookmarks and annotations, with the record rules those four
 * already obey: ABSENT is every pre-M113 file (the parser answers undefined
 * and the store writes no key), a malformed entry is dropped BY NAME and the
 * list kept, the cap keeps the newest.
 *
 * Its state is four words as DATA, never a string from a provider. Two of
 * them — `working` and `review` — are set by the RUNTIME from events (a
 * dispatched chat's first turn, a pull request opened), never by a drag
 * between columns: a card you can drag to "done" is a board that lies about
 * what happened. `todo` and `done` are the user's, and `USER_SET_STATES` is
 * the list every drop target and every verb reads, so a column that may not
 * be dropped on is not a column that forgot to be. The provider's own word
 * (`open`, `In Progress`) rides beside as `remoteState`, display only.
 *
 * The dedupe is by KEY (`owner/repo#N`, `PROJ-12`), the item's identity in
 * its own system: `Add to board` pressed twice updates the title and the
 * remote state and keeps everything the runtime set — a second add must never
 * mint a twin, and must never reset a working item to todo. A typed item has
 * no key and is identified by its id, so two typed items with one title are
 * two items, on purpose.
 *
 * Pure: no DOM, no React, no electron. `verify:layout work.1–.4`.
 */

import { BACKEND_IDS, carryBackend, type AgentBackend } from './agent-backends'
import { parseRecipeUse } from './recipes'
import type { RecipeUse } from './recipe-portability'
import { carryReviewIdentity, parseReviewIdentity, type ReviewIdentity } from './review-identity'
import { carryReviewComment, parseReviewComments, type ReviewComment } from './review-comments'

export type WorkItemState = 'todo' | 'working' | 'review' | 'done'
export const WORK_ITEM_STATES: readonly WorkItemState[] = ['todo', 'working', 'review', 'done']
/** The states a USER may set. The runtime sets the other two; a drop target exists for these only. */
export const USER_SET_STATES: readonly WorkItemState[] = ['todo', 'done']
/** The newest kept; a board that has seen a thousand items is a history, not a layout. */
export const WORK_ITEMS_MAX = 200

/** M114. The drag payload's MIME: a card dragged onto a teammate row, and nothing else, dispatches. */
export const WORK_ITEM_MIME = 'application/x-tc-work-item'

export type WorkItemSource = 'github' | 'jira' | 'typed'
const SOURCES: readonly WorkItemSource[] = ['github', 'jira', 'typed']

/** M114. The card follows its lane: an offset from the lane chat's rect, cleared by a drag of the card itself. */
export interface WorkItemAnchor { panelId: string; dx: number; dy: number }

export interface PersistedWorkItem {
  id: string
  source: WorkItemSource
  /** `owner/repo#N`, `PROJ-12`; absent for typed. The IDENTITY for the dedupe. */
  key?: string
  title: string
  /** Absent for typed. */
  url?: string
  /** The opening context a dispatch sends; absent when the provider gave none. */
  description?: string
  /**
   * M287. THE BRIEF — what the person wants done, in their words, edited on
   * Orchestrate's inspector and shown beside the changes. The USER's field,
   * like `state`: a provider re-add never touches it. Absent until typed;
   * an empty string is not written. Editing it launches nothing — it is
   * text a person reads before deciding, never a message sent anywhere.
   */
  brief?: string
  /** M287. Acceptance criteria, one per entry, the brief's rule. A malformed list costs the field. */
  criteria?: string[]
  state: WorkItemState
  /** The provider's own word, display only. */
  remoteState?: string
  teammateId?: string
  /** The lane's chat. Absent until dispatched; KEPT when the chat is closed (the note says so). */
  panelId?: string
  worktreeId?: string
  pr?: { number: number; url: string }
  /**
   * M315. ACCEPTED — the lane's branch was merged into the main tree's branch
   * by the person's Accept. The fact a done task's review reads, so the moment
   * after a merge says "merged" rather than "the lane holds no changes".
   */
  merged?: { into: string; sha: string; at: number }
  /** M114. `lane closed`, or a dispatch's refusal. Cleared by a new dispatch. */
  note?: string
  /**
   * M201 (D07). THE RECORDED REVIEW — the only fact a local review leaves
   * behind, and deliberately the smallest one that makes a review able to go
   * STALE. Absent until a person reviews.
   *
   * No diff and no path list is copied into the layout (the guide's rule):
   * `signature` is `reviewSignature`'s eight-character fingerprint of the
   * diff's SHAPE, which the review that was already run has in hand, so
   * detecting drift costs nothing extra. Its recorded bound — a change
   * leaving every path and both counts identical is not detected — is in
   * `review-readiness.ts`'s header and pinned by `readiness.3`.
   *
   * It is the USER's, like `state` and `anchor`: `upsertWorkItem` keeps it
   * when a provider re-adds the item, because re-reading an issue from GitHub
   * says nothing about whether somebody looked at the lane.
   */
  reviewed?: {
    at: number
    signature: string
    files: number
    /**
     * M285. The CONTENT identity the review was recorded against
     * (`review-identity.ts`), beside the shape signature. Absent on every
     * mark written before M285, and absence reads as freshness UNKNOWN —
     * never `current` — because the shape signature alone cannot see a
     * same-size edit. A malformed identity costs this field, not the mark.
     */
    identity?: ReviewIdentity
  }
  anchor?: WorkItemAnchor
  /**
   * M307. The reviewer's line comments on this task's diff — the USER's, like
   * `reviewed`: a provider re-add keeps them. Absent until the first comment.
   */
  comments?: ReviewComment[]
  /**
   * M307. The acceptance criteria the person has CONFIRMED, by their text —
   * an edited criterion no longer matches, so it reads unconfirmed again.
   */
  criteriaMet?: string[]
  /**
   * M314. The recipe the task was started from (`recipes.ts`), its checks —
   * the commands that decide "done", offered first by Run checks and told to
   * the agent — and its deliverables, what the person expects to receive.
   * The USER's fields, like the brief; field-level parse, the criteria rule.
   */
  recipeId?: string
  checks?: string[]
  deliverables?: string[]
  /**
   * M319. The backend the task's lane runs on, chosen in Start work against
   * the task's requirements (`backend-fit.ts`). Absent is claude — every
   * pre-M319 card, and the default is never written (`carryBackend`'s rule),
   * so a claude card grows no key. Read again by a re-dispatch, so recovery
   * does not silently switch vendor.
   */
  backend?: AgentBackend
  /**
   * M321. The EXACT recipe definition this task was started from — id,
   * version, content hash, the definition itself, its parameter values and
   * the repository. Kept here, not re-read from the store: editing or
   * deleting the recipe later never rewrites what this run was started from,
   * and a reuse is compared against it.
   */
  recipeUsed?: RecipeUse
  createdAt: number
  updatedAt: number
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** The identity the dedupe reads: the key in its system when there is one, else the id. */
export function workItemIdentity(item: { source: string; key?: string; id: string }): string {
  return item.key === undefined ? `id:${item.id}` : `${item.source}:${item.key}`
}

/**
 * The by-name rebuild every copy site spreads. Every optional is written only
 * when present — a spread of the source would write `key: undefined`, which
 * survives IPC and JSON as a present key and reads as a typed item with a
 * key. `pr` and `anchor` are fresh objects so a later mutation of one copy
 * cannot reach the other.
 */
export function carryWorkItem(item: PersistedWorkItem): PersistedWorkItem {
  return {
    id: item.id,
    source: item.source,
    title: item.title,
    state: item.state,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    ...(item.key === undefined ? {} : { key: item.key }),
    ...(item.url === undefined ? {} : { url: item.url }),
    ...(item.description === undefined ? {} : { description: item.description }),
    ...(item.brief === undefined || item.brief === '' ? {} : { brief: item.brief }),
    ...(item.criteria === undefined || item.criteria.length === 0 ? {} : { criteria: item.criteria.filter((c) => c !== '') }),
    ...(item.remoteState === undefined ? {} : { remoteState: item.remoteState }),
    ...(item.teammateId === undefined ? {} : { teammateId: item.teammateId }),
    ...(item.panelId === undefined ? {} : { panelId: item.panelId }),
    ...(item.worktreeId === undefined ? {} : { worktreeId: item.worktreeId }),
    ...(item.pr === undefined ? {} : { pr: { number: item.pr.number, url: item.pr.url } }),
    ...(item.merged === undefined ? {} : { merged: { into: item.merged.into, sha: item.merged.sha, at: item.merged.at } }),
    ...(item.note === undefined ? {} : { note: item.note }),
    ...(item.reviewed === undefined ? {} : { reviewed: { at: item.reviewed.at, signature: item.reviewed.signature, files: item.reviewed.files, ...(item.reviewed.identity === undefined ? {} : { identity: carryReviewIdentity(item.reviewed.identity) }) } }),
    ...(item.anchor === undefined ? {} : { anchor: { panelId: item.anchor.panelId, dx: item.anchor.dx, dy: item.anchor.dy } }),
    ...(item.comments === undefined || item.comments.length === 0 ? {} : { comments: item.comments.map(carryReviewComment) }),
    ...(item.criteriaMet === undefined || item.criteriaMet.length === 0 ? {} : { criteriaMet: item.criteriaMet.filter((c) => c !== '') }),
    ...(item.recipeId === undefined || item.recipeId === '' ? {} : { recipeId: item.recipeId }),
    ...(item.checks === undefined || item.checks.length === 0 ? {} : { checks: item.checks.filter((c) => c !== '') }),
    ...(item.deliverables === undefined || item.deliverables.length === 0 ? {} : { deliverables: item.deliverables.filter((c) => c !== '') }),
    ...carryBackend(item),
    ...(item.recipeUsed === undefined ? {} : { recipeUsed: { ...item.recipeUsed, definition: { ...item.recipeUsed.definition }, ...(item.recipeUsed.params === undefined ? {} : { params: { ...item.recipeUsed.params } }) } })
  }
}

/** One entry, or the reason it is not one. A malformed anchor costs the FIELD, not the entry: a card that lost its anchor is still a card. */
function parseOne(raw: unknown): { item: PersistedWorkItem } | { reason: string } {
  if (!isRecord(raw)) return { reason: 'not an object' }
  if (!isStr(raw.id)) return { reason: 'missing id' }
  if (!isStr(raw.title)) return { reason: 'missing title' }
  if (!SOURCES.includes(raw.source as WorkItemSource)) return { reason: `unknown source ${JSON.stringify(raw.source)}` }
  if (!WORK_ITEM_STATES.includes(raw.state as WorkItemState)) return { reason: `unknown state ${JSON.stringify(raw.state)}` }
  if (!isNum(raw.createdAt) || !isNum(raw.updatedAt)) return { reason: 'missing timestamps' }
  let pr: { number: number; url: string } | undefined
  if (raw.pr !== undefined) {
    if (!isRecord(raw.pr) || !Number.isInteger(raw.pr.number) || !isStr(raw.pr.url)) return { reason: 'malformed pr' }
    pr = { number: raw.pr.number as number, url: raw.pr.url }
  }
  // M201. A malformed `reviewed` costs the FIELD and not the entry, the same
  // way the anchor below does: a card that lost the memory of being reviewed
  // is still a card, and dropping the whole item would lose the lane with it.
  // The safe direction is also the honest one — no mark reads as `none`,
  // which offers a review rather than claiming one happened.
  const rv = raw.reviewed
  // M285. The identity is parsed field-level inside the mark: an absent key
  // (every pre-M285 file) and a malformed one both leave a mark WITHOUT an
  // identity, which every reader turns into "freshness unknown".
  const identity = isRecord(rv) ? parseReviewIdentity(rv.identity) : undefined
  const reviewed = isRecord(rv) && isNum(rv.at) && isStr(rv.signature) && isNum(rv.files)
    ? { at: rv.at, signature: rv.signature, files: rv.files, ...(identity === undefined ? {} : { identity }) }
    : undefined
  // M315. Field-level, the anchor's rule: a malformed merge record costs the field.
  const m = raw.merged
  const merged = isRecord(m) && isStr(m.into) && isStr(m.sha) && isNum(m.at) ? { into: m.into, sha: m.sha, at: m.at } : undefined
  const a = raw.anchor
  const anchor = isRecord(a) && isStr(a.panelId) && isNum(a.dx) && isNum(a.dy) ? { panelId: a.panelId, dx: a.dx, dy: a.dy } : undefined
  const opt = (v: unknown): string | undefined => (isStr(v) ? v : undefined)
  // M287. Field-level, like the anchor: a criteria list that is not a list
  // of strings costs the list, never the card.
  const criteria = Array.isArray(raw.criteria) && raw.criteria.every((c) => typeof c === 'string') ? (raw.criteria as string[]).filter((c) => c !== '') : undefined
  // M307. Field-level, the same rule: a bad comment costs itself, a bad list costs the list.
  const comments = parseReviewComments(raw.comments)
  const criteriaMet = Array.isArray(raw.criteriaMet) && raw.criteriaMet.every((c) => typeof c === 'string') ? (raw.criteriaMet as string[]).filter((c) => c !== '') : undefined
  // M314. The criteria rule again: a list that is not strings costs the list.
  const strings = (v: unknown): string[] | undefined => (Array.isArray(v) && v.every((c) => typeof c === 'string') ? (v as string[]).filter((c) => c !== '') : undefined)
  return {
    item: carryWorkItem({
      id: raw.id,
      source: raw.source as WorkItemSource,
      title: raw.title,
      state: raw.state as WorkItemState,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      key: opt(raw.key),
      url: opt(raw.url),
      description: typeof raw.description === 'string' ? raw.description : undefined,
      brief: opt(raw.brief),
      criteria,
      remoteState: opt(raw.remoteState),
      teammateId: opt(raw.teammateId),
      panelId: opt(raw.panelId),
      worktreeId: opt(raw.worktreeId),
      pr,
      merged,
      note: opt(raw.note),
      reviewed,
      anchor,
      comments,
      criteriaMet,
      recipeId: opt(raw.recipeId),
      checks: strings(raw.checks),
      deliverables: strings(raw.deliverables),
      // M319. An unknown backend costs the field (the card runs on claude), not the card.
      ...(BACKEND_IDS.includes(raw.backend as AgentBackend) ? { backend: raw.backend as AgentBackend } : {}),
      // M321. A run's recipe that does not parse WHOLE costs the field, not the card.
      ...(parseRecipeUse(raw.recipeUsed) === undefined ? {} : { recipeUsed: parseRecipeUse(raw.recipeUsed)! })
    })
  }
}

/**
 * Absent → undefined (the caller writes no key). Not an array → replaced,
 * one warning. Each malformed entry → dropped by name, the list kept. Sorted
 * newest first and capped.
 */
export function parseWorkItems(raw: unknown, warnings: string[]): PersistedWorkItem[] | undefined {
  if (raw === undefined) return undefined
  if (!Array.isArray(raw)) {
    warnings.push('replaced a workItems field that was not an array')
    return []
  }
  const items: PersistedWorkItem[] = []
  raw.forEach((entry, index) => {
    const parsed = parseOne(entry)
    if ('reason' in parsed) {
      const name = isRecord(entry) && isStr(entry.id) ? entry.id : `#${index}`
      warnings.push(`dropped work item ${name}: ${parsed.reason}`)
      return
    }
    items.push(parsed.item)
  })
  return items.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, WORK_ITEMS_MAX)
}

/**
 * The dedupe. A match by identity UPDATES what the provider owns (title, url,
 * description, remote state) and keeps what the runtime and the user set
 * (state, teammate, lane, worktree, pr, note, anchor). A new item is
 * prepended with both stamps at `now`.
 */
export function upsertWorkItem(
  list: readonly PersistedWorkItem[],
  incoming: Omit<PersistedWorkItem, 'createdAt' | 'updatedAt'>,
  now: number
): PersistedWorkItem[] {
  const identity = workItemIdentity(incoming)
  const index = list.findIndex((i) => workItemIdentity(i) === identity)
  if (index === -1) {
    return [carryWorkItem({ ...incoming, createdAt: now, updatedAt: now }), ...list].slice(0, WORK_ITEMS_MAX)
  }
  const found = list[index] as PersistedWorkItem
  const updated = carryWorkItem({
    ...found,
    title: incoming.title,
    ...(incoming.url === undefined ? {} : { url: incoming.url }),
    ...(incoming.description === undefined ? {} : { description: incoming.description }),
    ...(incoming.remoteState === undefined ? {} : { remoteState: incoming.remoteState }),
    updatedAt: now
  })
  return list.map((i, n) => (n === index ? updated : i))
}

/** `owner/repo#12` → `owner/repo`; a Jira key (`PROJ-12`) or anything else → null. Shared: the renderer decides whether a lane has a repository to find. */
export function repoOfKey(key: string): string | null {
  const m = /^([^/\s#]+\/[^/\s#]+)#\d+$/.exec(key)
  return m === null ? null : (m[1] as string)
}

/**
 * M115. THE PR DOOR'S REFUSALS, as data: the one function every Open PR
 * button and verb reads, so the arms are named once and a disabled control
 * always says which. `lane` is the lane's standing against the root's branch
 * (undefined when the item has no lane or the count could not be read),
 * `connected` whether GitHub holds a credential, `mate` the teammate record.
 */
export function prRefusal(
  item: { source: WorkItemSource; key?: string; panelId?: string; worktreeId?: string; teammateId?: string },
  lane: { kind: 'lane'; base: string; ahead: number; behind: number } | { kind: 'git-missing' } | { kind: 'unreadable'; detail: string } | undefined,
  connected: boolean,
  mate: { name: string; services: readonly string[] } | undefined
): string | null {
  const sync = prRefusalSync(item, connected, mate)
  if (sync !== null) return sync
  if (lane === undefined) return 'the lane could not be read — is the worktree still there?'
  if (lane.kind === 'git-missing') return 'git was not found on the login PATH'
  if (lane.kind === 'unreadable') return `the lane could not be read — ${lane.detail}`
  if (lane.ahead === 0) return `nothing to open a PR for — the lane has no commits past ${lane.base}`
  return null
}

/**
 * The arms that need NO invoke — what the card's disabled title reads on
 * every render (the lane's standing is asked only at the click, and lands as
 * the note). The same sentences, one list, two readers.
 */
export function prRefusalSync(
  item: { source: WorkItemSource; key?: string; panelId?: string; worktreeId?: string; teammateId?: string },
  connected: boolean,
  mate: { name: string; services: readonly string[] } | undefined
): string | null {
  if (item.source !== 'github' || item.key === undefined || repoOfKey(item.key) === null) return `a PR needs a GitHub repository — this item is ${item.source}`
  if (item.worktreeId === undefined || item.panelId === undefined) return 'no lane yet — dispatch the item first'
  if (!connected) return 'not connected — add a github token in ⌘K, then Credentials'
  if (mate === undefined) return 'the teammate this item was dispatched to is gone — open the Teammates pane'
  if (!mate.services.includes('github')) return `${mate.name} may not spend github — grant it in the Teammates pane`
  return null
}

/** M114. Why a teammate cannot be dispatched to, before main is asked; null when it can. The repository arm is main's (it reads the origin). */
export function teammateRefusal(mate: { name: string; places: readonly string[] }): string | null {
  return mate.places.length === 0 ? `${mate.name} has no places — add a folder in the Teammates pane` : null
}

/** The typed door's one refusal. */
export function workItemRefusal(title: string): string | null {
  // M315. In the person's words: "work item" is this module's name for a task.
  return title.trim() === '' ? 'give the task a title — say in a line what needs doing' : null
}
