import { insideDirectory } from '@shared/work-scope'
import { tidyPanels, TIDY_GAP } from './placement'
import type { WorldRect } from './viewport'

/**
 * M203 (D08). A TASK'S MEMBERS — derived, never inferred, never stored.
 *
 * A task on the canvas is a work card plus everything a FACT ties to it: the
 * conversation it was dispatched to, the panel that opened its lane, the
 * reviews opened for it, whatever is working inside the lane's directory,
 * what a person linked to the card or the conversation, and what ran in one
 * recorded run with them. Each member carries the reason it is one, first
 * match wins, so a surface can say WHY a panel is highlighted rather than
 * asking the person to trust a set.
 *
 * Three rules, each of which fails silently if undone:
 *
 * - **Position is never a reason.** A panel touching the card is not in the
 *   task. Inferring membership from proximity is how a tidy canvas and a
 *   messy one would disagree about what the same task is — and the guide
 *   forbids it by name.
 * - **Links are ONE hop.** A transitive closure over a person's links turns
 *   one task into the whole canvas the first time anyone links two tasks'
 *   notes together.
 * - **A named member that is not on the canvas is MISSING, never dropped.**
 *   The work item keeps its conversation's id after the chat closes (M114)
 *   and the worktree record outlives its panel (M37); framing the survivors
 *   as though they were the whole is the three-state collapse CLAUDE.md
 *   names. The caller says what is missing, in one sentence.
 *
 * Nothing here persists: no field was added for D08, because every fact
 * already has an authority — the item, the worktree record, the review's
 * subject, the link, the run. Pure: no DOM, no React. `verify:groups
 * task.members.*`, `task.show.target.1`.
 */

export type TaskMemberReason = 'card' | 'conversation' | 'lane-origin' | 'review' | 'in-lane' | 'linked' | 'same-run'
export interface TaskMember { panelId: string; reason: TaskMemberReason }
export interface MissingMember { panelId: string; reason: 'conversation' | 'lane-origin' }
export interface TaskMembership { itemId: string; members: TaskMember[]; missing: MissingMember[] }

/**
 * The least this module reads off a panel. `Panel` is assignable to it, and
 * the kind-specific fields are read only after the kind is checked — typed
 * loosely so the plain-node checks can hand it plain objects.
 */
export interface MemberPanel {
  kind: string
  rect: WorldRect
  links?: readonly { to: string }[]
}

export interface TaskMembershipInput {
  item: { id: string; panelId?: string; worktreeId?: string }
  panels: readonly MemberPanel[]
  /**
   * The item's worktree record, when the canvas still holds it. Absent: no
   * lane facts at all, never a guessed directory. `panelId` is the panel the
   * record says opened the lane; absent when the record does not say, which
   * is NOT a missing member (a false "is gone" is worse than none).
   */
  lane?: { path: string; panelId?: string }
  /** A PROCESS panel's directory — the live cwd when there is one, else its spec's. The caller owns the live-session store. */
  cwdOf: (panelId: string) => string | undefined
  runs: readonly { panelIds: readonly string[] }[]
}

const field = <T>(panel: MemberPanel, key: string): T | undefined => (panel as unknown as Record<string, T | undefined>)[key]

/** The card's item id, when the panel is a work card. */
export function cardItemOf(panel: MemberPanel): string | undefined {
  return panel.kind === 'work' ? field<{ itemId: string }>(panel, 'work')?.itemId : undefined
}

/**
 * The directory a panel is working in, from ITS OWN record: a file's path, a
 * preview's bound root (M195 — an unbound preview is in no directory), a
 * toolbox's folder; a process's through the caller. Every other kind has
 * none, and a panel with none is never `in-lane`.
 */
function directoryOf(panel: MemberPanel, cwdOf: (panelId: string) => string | undefined): string | undefined {
  switch (panel.kind) {
    case 'file': return field<{ path: string }>(panel, 'source')?.path
    case 'browser': return field<{ root: string }>(panel, 'preview')?.root
    case 'toolbox': return field<{ cwd: string }>(panel, 'source')?.cwd
    case 'terminal':
    case 'chat':
    case 'watcher': return cwdOf(panel.rect.id)
    default: return undefined
  }
}

export function taskMembership(input: TaskMembershipInput): TaskMembership {
  const { item, panels, lane, cwdOf, runs } = input
  const present = new Set(panels.map((p) => p.rect.id))
  const members: TaskMember[] = []
  const missing: MissingMember[] = []
  const add = (panelId: string, reason: TaskMemberReason): void => {
    if (!present.has(panelId) || members.some((m) => m.panelId === panelId)) return
    members.push({ panelId, reason })
  }

  for (const p of panels) if (cardItemOf(p) === item.id) add(p.rect.id, 'card')
  if (item.panelId !== undefined) {
    if (present.has(item.panelId)) add(item.panelId, 'conversation')
    else missing.push({ panelId: item.panelId, reason: 'conversation' })
  }
  // The record's panel is usually the conversation itself (a dispatch spawns
  // the lane FROM the chat); only a different one is a separate fact.
  if (lane !== undefined && lane.panelId !== undefined && lane.panelId !== item.panelId) {
    if (present.has(lane.panelId)) add(lane.panelId, 'lane-origin')
    else missing.push({ panelId: lane.panelId, reason: 'lane-origin' })
  }
  for (const p of panels) {
    if (p.kind === 'review' && field<{ workItemId?: string }>(p, 'subject')?.workItemId === item.id) add(p.rect.id, 'review')
  }
  if (lane !== undefined) {
    for (const p of panels) {
      const dir = directoryOf(p, cwdOf)
      if (dir !== undefined && insideDirectory(lane.path, dir)) add(p.rect.id, 'in-lane')
    }
  }
  // ONE hop, from the card and the conversation only — see the header.
  const core = new Set(members.filter((m) => m.reason === 'card' || m.reason === 'conversation').map((m) => m.panelId))
  for (const p of panels) {
    const out = p.links ?? []
    if (core.has(p.rect.id)) { for (const l of out) add(l.to, 'linked') }
    else if (out.some((l) => core.has(l.to))) add(p.rect.id, 'linked')
  }
  // A run is a record of panels that executed together. It is joined through
  // the conversation or the lane origin by ID, present or not: a run that
  // named a closed chat still names the terminals that ran beside it.
  const anchors = new Set([item.panelId, lane?.panelId].filter((id): id is string => id !== undefined))
  for (const run of runs) {
    if (run.panelIds.some((id) => anchors.has(id))) for (const id of run.panelIds) add(id, 'same-run')
  }
  return { itemId: item.id, members, missing }
}

/** Every task a panel belongs to, in the memberships' order. */
export function tasksOfPanel(panelId: string, memberships: readonly TaskMembership[]): string[] {
  return memberships.filter((m) => m.members.some((x) => x.panelId === panelId)).map((m) => m.itemId)
}

export type ShowTaskTarget =
  | { kind: 'frame'; itemId: string; rects: WorldRect[]; missing: MissingMember[] }
  | { kind: 'refused'; reason: string }

/**
 * `show-task`'s decision, pure so every arm is pinned under plain node (the
 * lesson of M149's `zoomTarget`). A card shows its own task. Any other panel
 * shows the ONE task it belongs to — and a panel in two refuses and names
 * both, because choosing one silently is a guess dressed as an answer.
 * `panels` are the DISPLAYED panels, so a frame reads the rect a person sees
 * (an anchored card's derived rect, a merged lane's synthetic one).
 */
export function showTaskTarget(panelId: string, panels: readonly MemberPanel[], memberships: readonly TaskMembership[], titles: Readonly<Record<string, string>>): ShowTaskTarget {
  const panel = panels.find((p) => p.rect.id === panelId)
  if (panel === undefined) return { kind: 'refused', reason: `there is no panel ${panelId} on this canvas` }
  const name = (itemId: string): string => titles[itemId] ?? itemId
  let membership: TaskMembership | undefined
  const cardItem = cardItemOf(panel)
  if (cardItem !== undefined) {
    membership = memberships.find((m) => m.itemId === cardItem)
    if (membership === undefined) return { kind: 'refused', reason: `${panelId} is a card whose item is no longer on the board` }
  } else {
    const owners = memberships.filter((m) => m.members.some((x) => x.panelId === panelId))
    if (owners.length === 0) return { kind: 'refused', reason: `${panelId} is not part of any task on this canvas — show a work card, or a panel tied to one` }
    if (owners.length > 1) return { kind: 'refused', reason: `${panelId} belongs to ${owners.length} tasks — ${owners.map((o) => name(o.itemId)).join(' and ')}; show one from its card` }
    membership = owners[0]
  }
  const ids = new Set(membership!.members.map((m) => m.panelId))
  return { kind: 'frame', itemId: membership!.itemId, rects: panels.filter((p) => ids.has(p.rect.id)).map((p) => p.rect), missing: membership!.missing }
}

/**
 * M204 (D08). ARRANGE THIS TASK, as a plan — which rects move where, or the
 * reason nothing does. The caller commits it as ONE history entry.
 *
 * - **Compaction is M50's `tidyPanels`**, reading order kept, sizes kept: the
 *   arrangement means what the task's shape already meant, only closer.
 * - **Locked, maximised and FOLDED members do not move** (M92) and are
 *   obstacles. A member of a collapsed group arrives in `fixedIds`: a group
 *   folded on purpose is not this verb's to unfold and move (M204's critic).
 *   Pins are not in this list on purpose: a pin is "keep this LIVE", not a
 *   place, and a pinned panel moves and stays live.
 * - **A follower never moves on its own.** A dispatched card's rect is
 *   derived from its conversation every render (M114's anchor, never written
 *   back), so the card and its leader are packed as ONE box and only the
 *   leader's rect is returned — the card follows through its unchanged
 *   anchor, and an undo of the leader restores both.
 * - **The block never lands on a panel outside the task.** Plain compaction
 *   moves panels into gaps a non-member may occupy, which is the obvious
 *   version and the one `arrange.1`'s fixture is built to catch. The whole
 *   block slides right past whatever it would cover, keeping its internal
 *   shape; the slide only grows and passes at least one obstacle's edge per
 *   step, so it ends within one step per obstacle.
 */
export type ArrangePlan = { kind: 'arrange'; rects: WorldRect[] } | { kind: 'refused'; reason: string }

export interface ArrangeInput {
  memberIds: readonly string[]
  panels: readonly (MemberPanel & { locked?: boolean; maximised?: unknown })[]
  /** Anchored cards: each at its leader's rect plus the offset. Only a follower whose leader is ALSO a member moves with it. */
  followers: readonly { id: string; leaderId: string; dx: number; dy: number }[]
  /** Members that stay where they are for a reason of the CALLER's — a collapsed group's. */
  fixedIds?: ReadonlySet<string>
}

export function arrangePlan(input: ArrangeInput): ArrangePlan {
  const members = new Set(input.memberIds)
  const byId = new Map(input.panels.map((p) => [p.rect.id, p]))
  const present = input.memberIds.filter((id) => byId.has(id))
  if (present.length === 0) return { kind: 'refused', reason: 'this task has no panel on the canvas to arrange' }
  const isFixed = (id: string): boolean => { const p = byId.get(id); return p !== undefined && (p.locked === true || p.maximised !== undefined || input.fixedIds?.has(id) === true) }
  const followers = input.followers.filter((f) => members.has(f.id) && byId.has(f.id) && members.has(f.leaderId) && byId.has(f.leaderId))
  const followerIds = new Set(followers.map((f) => f.id))
  const movable = present.filter((id) => !followerIds.has(id) && !isFixed(id))
  if (movable.length === 0) return { kind: 'refused', reason: 'every panel of this task is locked, maximised or in a folded group — unlock or unfold one to arrange it' }
  const movableSet = new Set(movable)

  // One box per movable member, grown to hold the followers that ride it.
  const boxes = movable.map((id) => {
    const r = byId.get(id)!.rect
    let minX = r.x, minY = r.y, maxX = r.x + r.w, maxY = r.y + r.h
    for (const f of followers) {
      if (f.leaderId !== id) continue
      const fr = byId.get(f.id)!.rect
      minX = Math.min(minX, r.x + f.dx); minY = Math.min(minY, r.y + f.dy)
      maxX = Math.max(maxX, r.x + f.dx + fr.w); maxY = Math.max(maxY, r.y + f.dy + fr.h)
    }
    return { id, x: minX, y: minY, w: maxX - minX, h: maxY - minY, offX: r.x - minX, offY: r.y - minY, rw: r.w, rh: r.h }
  })
  const packed = new Map(tidyPanels(boxes).map((b) => [b.id, { x: b.x, y: b.y }]))
  const placed = boxes.map((b) => ({ ...b, ...packed.get(b.id)! }))

  // Everything that stays put: non-members, fixed members, and a follower whose leader does not move.
  const obstacles = input.panels
    .filter((p) => !movableSet.has(p.rect.id) && !(followerIds.has(p.rect.id) && movableSet.has(followers.find((f) => f.id === p.rect.id)!.leaderId)))
    .map((p) => p.rect)
  const clash = (a: WorldRect, b: WorldRect): boolean =>
    a.x < b.x + b.w + TIDY_GAP && b.x < a.x + a.w + TIDY_GAP && a.y < b.y + b.h + TIDY_GAP && b.y < a.y + a.h + TIDY_GAP
  let shift = 0
  for (let step = 0; step <= obstacles.length; step += 1) {
    const at = placed.map((b) => ({ ...b, x: b.x + shift }))
    const blocking = obstacles.filter((o) => at.some((b) => clash(b, o)))
    if (blocking.length === 0) break
    const left = Math.min(...at.map((b) => b.x))
    shift += Math.max(...blocking.map((o) => o.x + o.w + TIDY_GAP)) - left
  }
  return { kind: 'arrange', rects: placed.map((b) => ({ id: b.id, x: b.x + shift + b.offX, y: b.y + b.offY, w: b.rw, h: b.rh })) }
}

/** The one sentence a surface shows when part of a task is gone; '' when nothing is. */
export function missingSentence(missing: readonly MissingMember[]): string {
  const parts = missing.map((m) => (m.reason === 'conversation' ? 'its conversation is closed' : 'the panel that opened its lane is gone'))
  return parts.length === 0 ? '' : `${parts.join(', and ')} — the rest is shown`
}

/**
 * M258. FIT TASK — the camera verb over the ACTIVE task, distinct from Fit
 * all. The active task is the lens's when one is lit (the lens bar names it,
 * so it outranks whatever happens to be selected), else the one task the
 * selected or focused panel belongs to, resolved exactly as Show this task
 * resolves it. With neither there is no task context, and the refusal is a
 * NAMED reason the HUD's disabled button carries — never a hidden control.
 */
export const FIT_TASK_NO_CONTEXT = 'no task is active — select a panel of a task, or Show related on one'
export function fitTaskTarget(input: {
  lensItemId: string | null
  panelId?: string
  panels: readonly MemberPanel[]
  memberships: readonly TaskMembership[]
  titles: Readonly<Record<string, string>>
}): ShowTaskTarget {
  if (input.lensItemId !== null) {
    const membership = input.memberships.find((m) => m.itemId === input.lensItemId)
    if (membership === undefined) return { kind: 'refused', reason: 'the task being shown is no longer on the board' }
    const ids = new Set(membership.members.map((m) => m.panelId))
    const rects = input.panels.filter((p) => ids.has(p.rect.id)).map((p) => p.rect)
    if (rects.length === 0) return { kind: 'refused', reason: 'no panel of this task is on the canvas' }
    return { kind: 'frame', itemId: membership.itemId, rects, missing: membership.missing }
  }
  if (input.panelId === undefined) return { kind: 'refused', reason: FIT_TASK_NO_CONTEXT }
  return showTaskTarget(input.panelId, input.panels, input.memberships, input.titles)
}
