import type { Tone } from '@renderer/panels/panel-state'
import type { WorldRect } from './viewport'
import type { TaskMembership } from './task-members'

/**
 * M270 (D10). FAR-VIEW TASK CLUSTERS — at the cluster card-detail tier,
 * a task or canvas group is a silhouette in its state colour rather than a
 * field of unreadable miniature panels.
 *
 * Membership is D08's (facts, never proximity). A panel in no task and no
 * group is not clustered; the frame still draws its own block/cluster pip.
 */

export const CLUSTER_PAD = 28

export interface ClusterPanel {
  id: string
  rect: WorldRect
  tone: Tone
}

export interface TaskCluster {
  id: string
  kind: 'task' | 'group'
  title: string
  tone: Tone
  rect: WorldRect
  memberIds: string[]
}

const TONE_RANK: Record<Tone, number> = {
  'needs-you': 5,
  working: 4,
  starting: 3,
  exited: 2,
  idle: 1,
  done: 1,
  asleep: 1,
  none: 0,
  kind: 0
}

function worstTone(tones: readonly Tone[]): Tone {
  let best: Tone = 'kind'
  let rank = -1
  for (const tone of tones) {
    const r = TONE_RANK[tone] ?? 0
    if (r > rank) { rank = r; best = tone }
  }
  return best
}

function hullOf(rects: readonly WorldRect[], id: string): WorldRect | null {
  if (rects.length === 0) return null
  const left = Math.min(...rects.map((r) => r.x)) - CLUSTER_PAD
  const top = Math.min(...rects.map((r) => r.y)) - CLUSTER_PAD
  const right = Math.max(...rects.map((r) => r.x + r.w)) + CLUSTER_PAD
  const bottom = Math.max(...rects.map((r) => r.y + r.h)) + CLUSTER_PAD
  return { id, x: left, y: top, w: right - left, h: bottom - top }
}

/**
 * One hull per task with two or more present members, then one hull per
 * canvas group that still has two or more members not already claimed by a
 * task hull. Task membership wins: a group that only frames one task is
 * not drawn twice.
 */
export function taskClusters(input: {
  panels: readonly ClusterPanel[]
  memberships: readonly TaskMembership[]
  titles: Readonly<Record<string, string>>
  groups: readonly { id: string; title: string; panelIds: readonly string[] }[]
}): TaskCluster[] {
  const byId = new Map(input.panels.map((p) => [p.id, p]))
  const claimed = new Set<string>()
  const out: TaskCluster[] = []

  for (const membership of input.memberships) {
    const members = membership.members
      .map((m) => byId.get(m.panelId))
      .filter((p): p is ClusterPanel => p !== undefined)
    if (members.length < 2) continue
    const rect = hullOf(members.map((m) => m.rect), `task:${membership.itemId}`)
    if (rect === null) continue
    for (const m of members) claimed.add(m.id)
    out.push({
      id: `task:${membership.itemId}`,
      kind: 'task',
      title: input.titles[membership.itemId] ?? membership.itemId,
      tone: worstTone(members.map((m) => m.tone)),
      rect,
      memberIds: members.map((m) => m.id)
    })
  }

  for (const group of input.groups) {
    const members = group.panelIds
      .map((id) => byId.get(id))
      .filter((p): p is ClusterPanel => p !== undefined && !claimed.has(p.id))
    if (members.length < 2) continue
    const rect = hullOf(members.map((m) => m.rect), `group:${group.id}`)
    if (rect === null) continue
    out.push({
      id: `group:${group.id}`,
      kind: 'group',
      title: group.title,
      tone: worstTone(members.map((m) => m.tone)),
      rect,
      memberIds: members.map((m) => m.id)
    })
  }

  return out
}
