import type { JSX } from 'react'
import type { TaskCluster } from './task-clusters'

/**
 * M270. Far-view hulls for tasks and groups. Paint only — no layout, no
 * hit-testing (the panels underneath still receive the pointer). Titles and
 * state colour live here so the miniature panels can go silent.
 *
 * M303. `region`: the same hulls at the near tiers, drawn as a dashed
 * boundary with the title on its edge — a place, not a silhouette, because
 * the panels inside are readable and must not be tinted over.
 */
export function TaskClusterLayer({ clusters, region = false }: { clusters: readonly TaskCluster[]; region?: boolean }): JSX.Element | null {
  if (clusters.length === 0) return null
  return (
    <div className={region ? 'task-clusters task-clusters--region' : 'task-clusters'} aria-hidden="true">
      {clusters.map((c) => (
        <div
          key={c.id}
          className="task-cluster"
          data-task-cluster={c.kind}
          data-tone={c.tone}
          style={{ left: c.rect.x, top: c.rect.y, width: c.rect.w, height: c.rect.h }}
        >
          <span className="task-cluster__title">{c.title}</span>
          <span className="task-cluster__count">{c.memberIds.length}</span>
        </div>
      ))}
    </div>
  )
}
