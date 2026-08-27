import type { JSX } from 'react'

/**
 * The left rail. M8a ships the region and its header only — M8b fills it with
 * the panel outline and M8d adds workspaces and the attention queue.
 *
 * Presentational by construction: it takes no callbacks yet, and when it does
 * they will be PaletteActions members. A rail that reached into Canvas for its
 * own copy of a verb would be a second implementation of it; see the spec's
 * "The shell is a second view over one verb surface".
 */
export function SideRail(): JSX.Element {
  return (
    <aside className="shell__rail" aria-label="Side rail">
      <div className="shell__region-title">Canvas</div>
    </aside>
  )
}
