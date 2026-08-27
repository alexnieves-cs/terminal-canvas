import type { JSX } from 'react'
import { shellControl } from './shell-control'

/**
 * The left rail. M8a ships the region, its header and its collapse toggle —
 * M8b fills it with the panel outline and M8d adds workspaces and the
 * attention queue.
 *
 * Presentational by construction: its one prop is a callback, and when it
 * gains more they will be PaletteActions members. A rail that reached into
 * Canvas for its own copy of a verb would be a second implementation of it;
 * see the spec's "The shell is a second view over one verb surface".
 *
 * The toggle stays mounted when the rail is collapsed — the collapsed strip is
 * 22px of button and nothing else, because it is the only way back for a user
 * who does not know the chord.
 */
export function SideRail({ onToggle }: { onToggle: () => void }): JSX.Element {
  return (
    <aside className="shell__rail" aria-label="Side rail">
      <button
        type="button"
        className="shell__rail-toggle"
        title="Hide the side rail (⌘\)"
        aria-label="Hide the side rail"
        {...shellControl(onToggle)}
      >
        ‹
      </button>
      <div className="shell__region-title">Canvas</div>
    </aside>
  )
}
