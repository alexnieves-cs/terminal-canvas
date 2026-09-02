import { memo, type JSX } from 'react'
import type { RailRow } from './rail-rows'
import type { RailAttention, RailWorkspace } from './rail-sections'
import { RailPanelRow } from './RailPanelRow'
import { RailWorkspaceRow } from './RailWorkspaceRow'
import { shellControl } from './shell-control'
import { ChevronLeft, Plus } from '@renderer/icons'

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
  attention: RailAttention[]
}

/**
 * The left rail's three sections: Workspaces, Panels, Attention.
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
  rows, selectedId, onGoToPanel, onStartPanel, onClosePanel, attention
}: SideRailProps): JSX.Element {
  return (
    <aside className="shell__rail" aria-label="Side rail">
      <button
        type="button"
        className="shell__rail-toggle icon-button"
        title="Hide the side rail (⌘\)"
        aria-label="Hide the side rail"
        {...shellControl(onToggle)}
      >
        <ChevronLeft />
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
          className="shell__region-add icon-button"
          title="New workspace"
          aria-label="New workspace"
          {...shellControl(onCreateWorkspace)}
        >
          <Plus />
        </button>
      </div>
      <ul className="rail-list rail-list--workspaces" aria-label="Workspaces">
        {workspaces.length === 0 ? (
          // The same treatment Attention gets below, for the same reason, and
          // it is reachable despite there always being at least one workspace:
          // this list is empty at mount until the first reloadWorkspaces()
          // resolves, and permanently if that list() ever rejects — which is
          // now warned about rather than swallowed, but still leaves the
          // section on screen. A header with a void under it reads as a broken
          // list; the header renders unconditionally (see above), so what sits
          // under it has to answer for itself too.
          <li className="rail-empty">no workspaces</li>
        ) : (
          workspaces.map((row) => (
            <RailWorkspaceRow
              key={row.id}
              row={row}
              onSwitch={onSwitchWorkspace}
              onRename={onRenameWorkspace}
              onDelete={onDeleteWorkspace}
            />
          ))
        )}
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

      <div className="shell__region-title">Attention</div>
      <ul className="rail-list rail-list--attention" aria-label="Attention" aria-live="polite">
        {attention.length === 0 ? (
          // Not an absent list. This section is empty nearly all the time, and
          // a header with a void under it reads as a broken list rather than
          // as "nobody needs you" — the same argument hiddenAtRest makes in
          // the palette, where a row that disappears is indistinguishable from
          // a feature that was never built.
          <li className="rail-empty">nothing waiting</li>
        ) : (
          attention.map((row) => (
            <li
              key={row.id}
              className="rail-row rail-attention"
              data-rail-attention={row.id}
            >
              {/*
                goToPanel and NOTHING else. Not onSelectPanel (which wakes —
                check 84), and emphatically not an acknowledge: focus is the
                renderer's single acknowledgement trigger and main is the sole
                author of the state, so a row that cleared it here would make
                the renderer a second author of a fact main owns. The panel
                therefore stays amber after the jump, which is what
                .panel--selected.panel--agent-wants-you exists for.
              */}
              <button
                type="button"
                className="rail-row__main"
                title={`Go to ${row.label}`}
                {...shellControl(() => onGoToPanel(row.id))}
              >
                {/*
                  Static, not a useAgentState subscription: every row in this
                  section is wants-you by construction — that is what put it
                  here — so subscribing would be asking a question whose answer
                  is already the reason the row exists.
                */}
                <span
                  className="rail-row__dot"
                  data-agent-state="wants-you"
                  aria-hidden="true"
                />
                <span className="rail-row__label">{row.label}</span>
              </button>
            </li>
          ))
        )}
      </ul>
    </aside>
  )
}

export const SideRail = memo(SideRailImpl)
