import { memo, type JSX } from 'react'
import type { RailWorkspace } from './rail-sections'
import { shellControl } from './shell-control'
import { Close, Pencil } from '@renderer/icons'

export interface RailWorkspaceRowProps {
  row: RailWorkspace
  onSwitch: (id: string) => void
  onRename: (id: string, currentName: string) => void
  onDelete: (id: string, name: string, panelCount: number) => void
}

/**
 * One row of the Workspaces section.
 *
 * Three sibling controls, the shape RailPanelRow already uses and for the same
 * reason: nested interactive elements are invalid HTML and give the browser no
 * defensible answer about which one a click meant.
 *
 * The three callbacks are CanvasActions members passed straight through — no
 * adapters, no local state. A rail that reached into Canvas for its own copy of
 * "switch workspace" would be a second implementation of M7's transaction, and
 * the two would agree the day they were written; the spec calls this out as the
 * load-bearing decision of the whole milestone.
 *
 * Rename and delete route into the palette's input mode via those same
 * members, which is what preserves M7's destructive confirm and its rule that
 * the question names the agent count — Canvas recomputes that count honestly
 * against main's pty list before showing it, so this row is free to hand over
 * the PANEL count it has.
 *
 * The active row's switch is DISABLED rather than removed, the rule
 * verify:palette 60 pins for the palette's own switch row: a row that
 * disappears is indistinguishable from a feature that is missing. Its rename
 * and delete stay live, because deleting the workspace you are in is a
 * supported path (Canvas switches away before it removes).
 */
function RailWorkspaceRowImpl({
  row, onSwitch, onRename, onDelete
}: RailWorkspaceRowProps): JSX.Element {
  return (
    <li
      className={`rail-row${row.active ? ' rail-row--selected' : ''}`}
      data-rail-workspace={row.id}
    >
      <button
        type="button"
        className="rail-row__main"
        disabled={row.active}
        title={row.active ? 'Already the active workspace' : `Switch to ${row.name}`}
        {...shellControl(() => onSwitch(row.id))}
      >
        <span className="rail-row__label">{row.name}</span>
        {/*
          The count is composed HERE, never in rail-sections.ts. `waiting` is a
          number on the row for the same reason Command.waiting is a typed
          field in the palette: a count is transient state, not a name, and the
          moment it is baked into a string it starts reaching things that scan
          strings.
        */}
        <span className="rail-row__tail">
          {row.waiting > 0 && (
            <span className="rail-row__waiting">{row.waiting} waiting · </span>
          )}
          {row.panels} panel{row.panels === 1 ? '' : 's'}
        </span>
      </button>
      <button
        type="button"
        className="rail-row__rename icon-button"
        title={`Rename ${row.name}`}
        aria-label={`Rename ${row.name}`}
        {...shellControl(() => onRename(row.id, row.name))}
      >
        <Pencil />
      </button>
      <button
        type="button"
        className="rail-row__close icon-button"
        title={`Delete ${row.name}`}
        aria-label={`Delete ${row.name}`}
        {...shellControl(() => onDelete(row.id, row.name, row.panels))}
      >
        <Close />
      </button>
    </li>
  )
}

export const RailWorkspaceRow = memo(RailWorkspaceRowImpl)
