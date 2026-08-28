import { memo, type JSX } from 'react'
import type { RailRow } from './rail-rows'
import type { RailWorkspace } from './rail-sections'
import { RailPanelRow } from './RailPanelRow'
import { RailWorkspaceRow } from './RailWorkspaceRow'
import { shellControl } from './shell-control'

export interface SideRailProps {
  onToggle: () => void
  workspaces: RailWorkspace[]
  onSwitchWorkspace: (id: string) => void
  onCreateWorkspace: () => void
  onRenameWorkspace: (id: string, currentName: string) => void
  onDeleteWorkspace: (id: string, name: string, panelCount: number) => void
  rows: RailRow[]
  selectedId: string | null
  onGoToPanel: (id: string) => void
  onStartPanel: (id: string) => void
  onClosePanel: (id: string) => void
}

/**
 * The left rail: Workspaces, Panels, and (from Task 4) Attention.
 *
 * Presentational by construction — every prop is derived data or a
 * CanvasActions member. A rail that reached into Canvas for its own copy of a
 * verb would be a second implementation of it; see the spec's "The shell is a
 * second view over one verb surface".
 *
 * memo'd, and EVERY row array it takes is frozen on a signature by Canvas.
 * Canvas re-renders on every mousemove over the canvas (setCursor) and on
 * every frame of a drag (setPanelRect); without both halves the lists would be
 * rebuilt at 60Hz for rect changes no row displays. Adding an unfrozen array
 * to these props defeats this memo outright, and the symptom is invisible on a
 * four-panel canvas.
 *
 * All three section headers render unconditionally, empty or not. A rail
 * section has no query to type into — which is the only thing that makes the
 * palette's `hiddenAtRest` honest — so hiding one at rest hides it permanently
 * from the user who has never seen it fire. It also keeps the rail's height
 * stable, so the Panels list does not move under the pointer when a bell rings.
 *
 * The toggle stays mounted when the rail is collapsed — the collapsed strip is
 * 22px of button and nothing else, because it is the only way back for a user
 * who does not know the chord.
 */
function SideRailImpl({
  onToggle, workspaces, onSwitchWorkspace, onCreateWorkspace,
  onRenameWorkspace, onDeleteWorkspace,
  rows, selectedId, onGoToPanel, onStartPanel, onClosePanel
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

      {/*
        The + lives INSIDE the region title so the collapse rule that
        display:none's .shell__region-title takes it with it. A create button
        surviving the collapse would be a control floating in a 22px strip with
        nothing left on screen to explain what it creates.
      */}
      <div className="shell__region-title shell__region-title--action">
        <span>Workspaces</span>
        <button
          type="button"
          className="shell__region-add"
          title="New workspace"
          aria-label="New workspace"
          {...shellControl(onCreateWorkspace)}
        >
          +
        </button>
      </div>
      <ul className="rail-list rail-list--workspaces" aria-label="Workspaces">
        {workspaces.map((row) => (
          <RailWorkspaceRow
            key={row.id}
            row={row}
            onSwitch={onSwitchWorkspace}
            onRename={onRenameWorkspace}
            onDelete={onDeleteWorkspace}
          />
        ))}
      </ul>

      <div className="shell__region-title">Panels</div>
      <ul className="rail-list rail-list--panels" aria-label="Panels">
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
