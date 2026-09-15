import type { JSX } from 'react'
import type { TaskCluster } from './task-clusters'

/**
 * M270. Far-view hulls for tasks and groups. Paint only — no layout, no
 * hit-testing (the panels underneath still receive the pointer). Titles and
 * state colour live here so the miniature panels can go silent.
 */
export function TaskClusterLayer({ clusters }: { clusters: readonly TaskCluster[] }): JSX.Element | null {
  if (clusters.length === 0) return null
  return (
    <div className="task-clusters" aria-hidden="true">
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
