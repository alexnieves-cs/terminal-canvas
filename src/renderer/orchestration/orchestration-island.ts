/**
 * M284. Orchestrate Phase A's task island, inspector verbs and decision queue, as
 * pure functions over facts other stores already own — plain node, so
 * `verify:orchestration` can drive them without a renderer.
 *
 * Nothing here is new state. The island is DERIVED from a persisted work item and
 * the worktree record it names; the queue is the chat store's own pending
 * permissions keyed by the SAME `(panel id, requestId)` identity main's approval
 * tracker holds. A second copy of either would be a second source of truth, and the
 * plan's rule is that Orchestrate joins existing stores rather than forking them.
 */
import { repoOfKey, WORK_ITEM_STATES, type WorkItemState } from '@shared/work-items'

export interface IslandItemInput {
  id: string
  title: string
  state: WorkItemState
  key?: string
  panelId?: string
  worktreeId?: string
}

export interface IslandWorktreeInput {
  id: string
  branch: string
  path: string
  root: string
}

export interface IslandSessionInput {
  id: string
  title: string
  kind: string
  agentic: boolean
}

/**
 * Where the task's files live. `worktree` is an isolated checkout with a branch;
 * `shared` is a working directory other work can also be writing in — said, not
 * hidden, because "a worktree isolates files" is the one fact a reviewer needs
 * before trusting a diff's authorship; `unknown` is honest when no member reports
 * a directory at all.
 */
export type IslandPlacement =
  | { kind: 'worktree'; branch: string; path: string }
  | { kind: 'shared'; path: string }
  | { kind: 'unknown' }

export interface TaskIsland {
  /** The work item, or absent when the island is a lone session with no task yet. */
  itemId?: string
  source: 'work-item' | 'session'
  goal: string
  state: string
  repository: string | null
  placement: IslandPlacement
  memberIds: readonly string[]
  /** The panel whose review baseline IS the task's review subject (the lane's chat). */
  subjectId: string | null
}

function baseName(path: string): string {
  const parts = path.replace(/\/+$/, '').split('/').filter((p) => p !== '')
  return parts[parts.length - 1] ?? path
}

/**
 * The ONE task Phase A shows. The same pick as the canvas's focused task (Canvas
 * passes `taskMemberIds` for the first `working` item, else the first `review`),
 * so the island and the frame the scene already draws can never name two tasks.
 * With no such item, the first agent session stands as an island of its own —
 * "open one task" must work before anyone has used the board.
 */
export function orchPickIslandItem(items: readonly IslandItemInput[]): IslandItemInput | null {
  return items.find((w) => w.state === WORK_ITEM_STATES[1]) ?? items.find((w) => w.state === WORK_ITEM_STATES[2]) ?? null
}

export function orchTaskIsland(input: {
  items: readonly IslandItemInput[]
  worktrees: readonly IslandWorktreeInput[]
  sessions: readonly IslandSessionInput[]
  membersOf: (itemId: string) => readonly string[]
  cwdOf: (panelId: string) => string | undefined
}): TaskIsland | null {
  const item = orchPickIslandItem(input.items)
  if (item !== null) {
    const members = input.membersOf(item.id)
    const tree = item.worktreeId === undefined ? undefined : input.worktrees.find((w) => w.id === item.worktreeId)
    const memberCwd = [item.panelId, ...members].flatMap((id) => {
      if (id === undefined) return []
      const cwd = input.cwdOf(id)
      return cwd === undefined || cwd === '' ? [] : [cwd]
    })[0]
    const placement: IslandPlacement = tree !== undefined
      ? { kind: 'worktree', branch: tree.branch, path: tree.path }
      : memberCwd !== undefined ? { kind: 'shared', path: memberCwd } : { kind: 'unknown' }
    // A GitHub key names the repository outright; otherwise the worktree's root, then
    // the directory a member runs in. Derived from real paths — never a project record.
    const fromKey = item.key === undefined ? null : repoOfKey(item.key)
    const repository = fromKey ?? (tree !== undefined ? baseName(tree.root) : memberCwd !== undefined ? baseName(memberCwd) : null)
    return {
      itemId: item.id,
      source: 'work-item',
      goal: item.title,
      state: item.state,
      repository,
      placement,
      memberIds: members,
      subjectId: item.panelId ?? members[0] ?? null
    }
  }
  const session = input.sessions.find((s) => s.agentic)
  if (session === undefined) return null
  const cwd = input.cwdOf(session.id)
  return {
    source: 'session',
    goal: session.title,
    state: 'no task yet',
    repository: cwd === undefined || cwd === '' ? null : baseName(cwd),
    placement: cwd === undefined || cwd === '' ? { kind: 'unknown' } : { kind: 'shared', path: cwd },
    memberIds: [session.id],
    subjectId: session.id
  }
}

/** The island's placement in words — the line under its goal. */
export function orchPlacementLine(island: Pick<TaskIsland, 'repository' | 'placement'>): string {
  const repo = island.repository ?? 'no repository found'
  if (island.placement.kind === 'worktree') return `${repo} · ${island.placement.branch} · own worktree`
  if (island.placement.kind === 'shared') return `${repo} · shared directory`
  return `${repo} · no working directory reported`
}

export type OrchNextVerb = 'answer' | 'reply' | 'watch' | 'review' | 'open'

export interface OrchNextAction {
  verb: OrchNextVerb
  label: string
}

/**
 * The inspector's ONE next action for a selected session. Read from the state the
 * roster already shows plus the pending queue — never an inferred checklist. An
 * idle chat is `review`, not `done`: an agent stopping does not mean the task is.
 */
export function orchNextAction(input: {
  state: string
  kind: string
  pendingTool?: string
}): OrchNextAction {
  if (input.pendingTool !== undefined) return { verb: 'answer', label: `Answer the ${input.pendingTool} request` }
  if (input.state === 'wants-you') return { verb: 'reply', label: 'Reply on canvas — it is waiting on you' }
  if (input.state === 'busy' || input.state === 'starting' || input.state === 'running' || input.state === 'watching') return { verb: 'watch', label: 'Watch its output' }
  if (input.state === 'exited') return { verb: 'open', label: 'Open on canvas to restart or read it' }
  if (input.kind === 'chat' || input.kind === 'terminal') return { verb: 'review', label: 'Review its changes' }
  return { verb: 'open', label: 'Open on canvas' }
}

export interface OrchAttentionInput {
  id: string
  requestId: string
  toolName: string
  argument: string
}

export interface OrchAttentionRow extends OrchAttentionInput {
  title: string
  /** An answer for this exact request has been sent from this page; the row is inert until the store drops it. */
  sent: boolean
}

/**
 * The Needs attention rows. The chat store REMOVES a request the moment main reports
 * it answered or dropped — from the Dock, the chat, the palette or here — so a row
 * exists exactly while the request is still pending, and one answered elsewhere is
 * simply gone. `sent` covers the window between this page's click and main's
 * `permission-answered` arriving: the key is `id:requestId`, never the selection, so
 * a re-filtered or re-selected page cannot aim an answer at another session.
 */
export function orchAttentionRows(
  pending: readonly OrchAttentionInput[],
  titleOf: (panelId: string) => string,
  sent: ReadonlySet<string>
): OrchAttentionRow[] {
  return pending.map((p) => ({ ...p, title: titleOf(p.id), sent: sent.has(orchAnswerKey(p.id, p.requestId)) }))
}

export function orchAnswerKey(panelId: string, requestId: string): string {
  return `${panelId}:${requestId}`
}

/** A sent-set pruned to requests still pending, so it cannot grow for the life of the page. */
export function orchPruneSent(sent: ReadonlySet<string>, pending: readonly OrchAttentionInput[]): Set<string> {
  const live = new Set(pending.map((p) => orchAnswerKey(p.id, p.requestId)))
  return new Set([...sent].filter((k) => live.has(k)))
}
