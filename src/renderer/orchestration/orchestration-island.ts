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
  /**
   * M288. The island's own id, stable across renders: the work item's id, or
   * `dir:<path>` for the sessions of one directory that no task names. What
   * the presentation order and the focus name.
   */
  id: string
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
  /**
   * M288. How many agent sessions on this canvas run IN the island's directory
   * (the placement path, or under it) — every one of them can write there. A
   * worktree normally counts 1; a shared directory with 2+ is the ambiguity the
   * plan says to show, not to attribute away.
   */
  writers: number
  /** M288. Other islands whose directory this one shares (by id). Empty for an isolated worktree. */
  sharedWith: readonly string[]
  /**
   * M288. The grouping key: the repository this island belongs to, derived from
   * real paths — a worktree's root, else the shared directory itself. `null`
   * when no member reports a directory. Never a project record.
   */
  group: string | null
}

function baseName(path: string): string {
  const parts = path.replace(/\/+$/, '').split('/').filter((p) => p !== '')
  return parts[parts.length - 1] ?? path
}

const within = (cwd: string, dir: string): boolean => cwd === dir || cwd.startsWith(dir.endsWith('/') ? dir : `${dir}/`)

/**
 * The ONE task Phase A shows — kept as the PRIMARY island: the same pick as the
 * canvas's focused task (Canvas passes `taskMemberIds` for the first `working`
 * item, else the first `review`), so the frame the scene draws and the first
 * island can never name two tasks. With no such item, the first agent session
 * stands as an island of its own — "open one task" must work before anyone
 * has used the board.
 */
export function orchPickIslandItem(items: readonly IslandItemInput[]): IslandItemInput | null {
  return items.find((w) => w.state === WORK_ITEM_STATES[1]) ?? items.find((w) => w.state === WORK_ITEM_STATES[2]) ?? null
}

export interface IslandsInput {
  items: readonly IslandItemInput[]
  worktrees: readonly IslandWorktreeInput[]
  sessions: readonly IslandSessionInput[]
  membersOf: (itemId: string) => readonly string[]
  cwdOf: (panelId: string) => string | undefined
}

/**
 * M288. EVERY island: one per task in `working` or `review` (the same two
 * states the primary pick reads), then one per DIRECTORY for the agent
 * sessions no task names. Grouping is derived from real paths — a worktree
 * record's root and path, a member's cwd — and never from a project record.
 * The array is in the items' own order; presentation order is
 * `orchIslandOrder`'s, kept per workspace, so a new island never re-arranges
 * the ones already on screen.
 */
export function orchTaskIslands(input: IslandsInput): TaskIsland[] {
  const dirOf = (id: string | undefined): string | undefined => {
    if (id === undefined) return undefined
    const cwd = input.cwdOf(id)
    return cwd === undefined || cwd === '' ? undefined : cwd
  }
  const agentic = input.sessions.filter((s) => s.agentic)
  const taken = new Set<string>()
  const islands: TaskIsland[] = []
  for (const item of input.items) {
    if (item.state !== WORK_ITEM_STATES[1] && item.state !== WORK_ITEM_STATES[2]) continue
    const members = input.membersOf(item.id)
    for (const m of members) taken.add(m)
    if (item.panelId !== undefined) taken.add(item.panelId)
    const tree = item.worktreeId === undefined ? undefined : input.worktrees.find((w) => w.id === item.worktreeId)
    const memberCwd = [item.panelId, ...members].map(dirOf).find((c): c is string => c !== undefined)
    const placement: IslandPlacement = tree !== undefined
      ? { kind: 'worktree', branch: tree.branch, path: tree.path }
      : memberCwd !== undefined ? { kind: 'shared', path: memberCwd } : { kind: 'unknown' }
    // A GitHub key names the repository outright; otherwise the worktree's root, then
    // the directory a member runs in. Derived from real paths — never a project record.
    const fromKey = item.key === undefined ? null : repoOfKey(item.key)
    const repository = fromKey ?? (tree !== undefined ? baseName(tree.root) : memberCwd !== undefined ? baseName(memberCwd) : null)
    islands.push({
      id: item.id,
      itemId: item.id,
      source: 'work-item',
      goal: item.title,
      state: item.state,
      repository,
      placement,
      memberIds: members,
      subjectId: item.panelId ?? members[0] ?? null,
      writers: 0,
      sharedWith: [],
      group: tree !== undefined ? tree.root : memberCwd ?? null
    })
  }
  // The sessions no task names, one island per directory (a session with no
  // directory at all is its own island, said as such).
  const loose = agentic.filter((s) => !taken.has(s.id))
  const byDir = new Map<string, IslandSessionInput[]>()
  for (const s of loose) {
    const dir = dirOf(s.id) ?? `\0${s.id}`
    const list = byDir.get(dir) ?? []
    list.push(s)
    byDir.set(dir, list)
  }
  for (const [dir, list] of byDir) {
    const real = dir.startsWith('\0') ? undefined : dir
    islands.push({
      id: real === undefined ? `session:${list[0]!.id}` : `dir:${real}`,
      source: 'session',
      goal: list.length === 1 ? list[0]!.title : `${list.length} sessions`,
      state: 'no task yet',
      repository: real === undefined ? null : baseName(real),
      placement: real === undefined ? { kind: 'unknown' } : { kind: 'shared', path: real },
      memberIds: list.map((s) => s.id),
      subjectId: list[0]!.id,
      writers: 0,
      sharedWith: [],
      group: real ?? null
    })
  }
  // Writers and sharing, over the WHOLE canvas: any agent session inside the
  // island's directory can write there, member or not.
  const cwds = agentic.map((s) => ({ id: s.id, cwd: dirOf(s.id) })).filter((x): x is { id: string; cwd: string } => x.cwd !== undefined)
  return islands.map((isl) => {
    if (isl.placement.kind === 'unknown') return isl
    const dir = isl.placement.path
    const writers = cwds.filter((c) => within(c.cwd, dir)).length
    const sharedWith = islands.filter((o) => o.id !== isl.id && o.placement.kind !== 'unknown' && (within(o.placement.path, dir) || within(dir, o.placement.path))).map((o) => o.id)
    return { ...isl, writers, sharedWith }
  })
}

/** Phase A's one island: the primary of `orchTaskIslands`, or null when there is none. */
export function orchTaskIsland(input: IslandsInput): TaskIsland | null {
  const all = orchTaskIslands(input)
  const item = orchPickIslandItem(input.items)
  if (item !== null) return all.find((i) => i.itemId === item.id) ?? null
  return all.find((i) => i.source === 'session') ?? null
}

/**
 * M288. Stable placement: the previous order, minus islands that are gone,
 * then every new island appended in the model's order. A returning user finds
 * work where it was; a new task never shuffles the others.
 */
export function orchIslandOrder(prev: readonly string[], ids: readonly string[]): string[] {
  const live = new Set(ids)
  const kept = prev.filter((id) => live.has(id))
  const seen = new Set(kept)
  for (const id of ids) if (!seen.has(id)) { kept.push(id); seen.add(id) }
  return kept
}

/** A presentation move by one step; null when it would change nothing. Undo is the previous array. */
export function orchMoveIsland(order: readonly string[], id: string, dir: -1 | 1): string[] | null {
  const at = order.indexOf(id)
  const to = at + dir
  if (at === -1 || to < 0 || to >= order.length) return null
  const next = [...order]
  next.splice(at, 1)
  next.splice(to, 0, id)
  return next
}

/** M288. Islands grouped by repository (`group`), in presentation order, the group named by its real path. */
export function orchIslandGroups(islands: readonly TaskIsland[], order: readonly string[]): { key: string | null; label: string; islands: TaskIsland[] }[] {
  const byId = new Map(islands.map((i) => [i.id, i]))
  const sorted = order.map((id) => byId.get(id)).filter((i): i is TaskIsland => i !== undefined)
  const groups: { key: string | null; label: string; islands: TaskIsland[] }[] = []
  for (const isl of sorted) {
    const g = groups.find((x) => x.key === isl.group)
    if (g !== undefined) g.islands.push(isl)
    else groups.push({ key: isl.group, label: isl.group === null ? 'no repository found' : baseName(isl.group), islands: [isl] })
  }
  return groups
}

/** The island's placement in words — the line under its goal. */
export function orchPlacementLine(island: Pick<TaskIsland, 'repository' | 'placement'> & Partial<Pick<TaskIsland, 'writers'>>): string {
  const repo = island.repository ?? 'no repository found'
  const writers = island.writers ?? 0
  if (island.placement.kind === 'worktree') return `${repo} · ${island.placement.branch} · own worktree${writers > 1 ? ` · ${writers} sessions write here` : ''}`
  if (island.placement.kind === 'shared') return `${repo} · shared directory${writers > 1 ? ` · ${writers} sessions write here` : ''}`
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
