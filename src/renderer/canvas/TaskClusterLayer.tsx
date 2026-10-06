import type { JSX } from 'react'
import type { TaskRegion } from '@shared/redesign-contracts'
import { regionLabel } from './task-regions'
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

/**
 * M442. The labelled territory. Membership is already decided (task-regions);
 * this only paints `regionLabel` on the snapped bounds. Pointer events stay
 * off so the panels underneath still receive the drag.
 */
export function TaskRegionLayer({ regions }: { regions: readonly TaskRegion[] }): JSX.Element | null {
  if (regions.length === 0) return null
  return (
    <div className="task-regions" aria-hidden="true">
      {regions.map((region) => (
        <div
          key={region.id}
          className="task-region"
          data-task-region={region.id}
          style={{ left: region.bounds.x, top: region.bounds.y, width: region.bounds.w, height: region.bounds.h }}
        >
          <span className="task-region__chip">{regionLabel(region)}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * M442. L-C's mount. Zero size and absolute so it cannot sit in the flow
 * and refit a terminal. The lane that fills it owns the contents.
 */
export function TierLayer(): JSX.Element {
  return <div className="tier-layer" data-tier-layer="" aria-hidden="true" />
}
