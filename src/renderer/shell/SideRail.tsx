import { memo, type JSX } from 'react'
import type { RailRow } from './rail-rows'
import { RailPanelRow } from './RailPanelRow'
import { shellControl } from './shell-control'

export interface SideRailProps {
  onToggle: () => void
  rows: RailRow[]
  selectedId: string | null
  onGoToPanel: (id: string) => void
  onStartPanel: (id: string) => void
  onClosePanel: (id: string) => void
}

/**
 * The left rail. M8b fills it with the panel outline; M8d adds the Workspaces
 * and Attention sections around it.
 *
 * Presentational by construction — every prop is derived data or a
 * PaletteActions member. A rail that reached into Canvas for its own copy of a
 * verb would be a second implementation of it; see the spec's "The shell is a
 * second view over one verb surface".
 *
 * memo'd, and `rows` is frozen on a signature by Canvas. Canvas re-renders on
 * every mousemove over the canvas (setCursor) and on every frame of a drag
 * (setPanelRect); without both halves the whole list would be rebuilt at 60Hz
 * for rect changes no row displays.
 *
 * The toggle stays mounted when the rail is collapsed — the collapsed strip is
 * 22px of button and nothing else, because it is the only way back for a user
 * who does not know the chord.
 */
function SideRailImpl({
  onToggle, rows, selectedId, onGoToPanel, onStartPanel, onClosePanel
}: SideRailProps): JSX.Element {
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
      <div className="shell__region-title">Panels</div>
      <ul className="rail-list" aria-label="Panels">
        {rows.map((row) => (
          <RailPanelRow
            key={row.id}
            row={row}
            selected={row.id === selectedId}
            onGoTo={onGoToPanel}
            onStart={onStartPanel}
            onClose={onClosePanel}
          />
        ))}
      </ul>
    </aside>
  )
}

export const SideRail = memo(SideRailImpl)
