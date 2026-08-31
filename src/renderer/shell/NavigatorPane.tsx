import { memo, type JSX } from 'react'
import type { FileRow } from './file-tree-model'
import type { NavPaneId } from './nav-dock'
import type { RailRow } from './rail-rows'
import type { RailAttention, RailWorkspace } from './rail-sections'
import { RailPanelRow } from './RailPanelRow'
import { RailWorkspaceRow } from './RailWorkspaceRow'
import { shellControl } from './shell-control'

export interface NavigatorPaneProps {
  /** Which of the four to render. Never null: Canvas renders nothing at all
   *  when no pane is active, rather than mounting this with an empty body —
   *  an empty 240px column is width spent on nothing. */
  pane: NavPaneId

  // -- workspaces ---------------------------------------------------------
  workspaces: RailWorkspace[]
  onSwitchWorkspace: (id: string) => void
  onCreateWorkspace: () => void
  onRenameWorkspace: (id: string, currentName: string) => void
  onDeleteWorkspace: (id: string, name: string, panelCount: number) => void

  // -- panels -------------------------------------------------------------
  rows: RailRow[]
  selectedId: string | null
  onGoToPanel: (id: string) => void
  onStartPanel: (id: string) => void
  onClosePanel: (id: string) => void

  // -- attention ----------------------------------------------------------
  attention: RailAttention[]

  // -- files --------------------------------------------------------------
  // Prefixed, unlike every other group here, because the tree's own prop names
  // (`rows`, `rootPath`, `rootLabel`) collide head-on with the panel list's
  // once both live on one interface. Renaming the tree's is the only option
  // that keeps `rows` meaning what it means in every other shell component.
  treeRootPath: string | null
  treeRootLabel: string | null
  treeRows: FileRow[]
  treeRootPending: boolean
  onToggleDir: (path: string) => void
  onInsertPath: (path: string) => void
  onRefreshTree: () => void
}

/**
 * Exactly one navigator pane, chosen by `pane`.
 *
 * One at a time is the central IA move. Today Workspaces, Panels and Attention
 * share one column's height and are therefore each capped at roughly a third
 * of it, permanently — and a fourth section has nowhere to go at all. One at a
 * time gives each the full height and makes a fifth cost a row in an array
 * rather than a redesign.
 *
 * The section HEADER renders unconditionally, empty or not, and every empty
 * pane owes an empty state. That is SideRail's own rule, inherited verbatim:
 * "a header with a void under it reads as a broken list." It matters MORE here
 * than it did there, because a pane the user deliberately opened and found
 * blank is a pane they will read as broken rather than as empty.
 *
 * Presentational by construction — every prop is derived data or an existing
 * CanvasActions member, the rule SideRail's own header states: a region that
 * reached into Canvas for its own copy of a verb would be a second
 * implementation of it.
 *
 * memo'd, and EVERY row array it takes is frozen on a signature by Canvas,
 * because Canvas re-renders on every mousemove over the canvas and on every
 * frame of a drag. Adding an unfrozen array to these props defeats this memo
 * outright, and the symptom is invisible on a four-panel canvas.
 */
function NavigatorPaneImpl(props: NavigatorPaneProps): JSX.Element {
  const { pane } = props
  return (
    <aside className="navpane" data-navpane={pane} aria-label={PANE_LABEL[pane]}>
      {pane === 'workspaces' && <WorkspacesPane {...props} />}
      {pane === 'panels' && <PanelsPane {...props} />}
      {pane === 'files' && <FilesPane {...props} />}
      {pane === 'attention' && <AttentionPane {...props} />}
    </aside>
  )
}

/** Duplicated from nav-dock's own LABEL rather than imported, because that one
 *  is the DOCK BUTTON's text and this one is the pane's accessible name. They
 *  read the same today and are free to diverge; sharing one constant would
 *  make a change to either silently change the other. */
const PANE_LABEL: Record<NavPaneId, string> = {
  workspaces: 'Workspaces',
  panels: 'Panels',
  files: 'Files',
  attention: 'Attention'
}

function WorkspacesPane({
  workspaces, onSwitchWorkspace, onCreateWorkspace, onRenameWorkspace, onDeleteWorkspace
}: NavigatorPaneProps): JSX.Element {
  return (
    <>
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
        {workspaces.length === 0 ? (
          // Reachable despite there always being at least one workspace: this
          // list is empty at mount until the first reloadWorkspaces() resolves,
          // and permanently if that list() ever rejects.
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
    </>
  )
}

function PanelsPane({
  rows, selectedId, onGoToPanel, onStartPanel, onClosePanel
}: NavigatorPaneProps): JSX.Element {
  return (
    <>
      <div className="shell__region-title">Panels</div>
      <ul className="rail-list rail-list--panels" aria-label="Panels">
        {rows.length === 0 ? (
          // NEW, and not an oversight in the rail it replaces: the old Panels
          // section could rely on Workspaces and Attention holding the column
          // open around it, so an empty list was a gap between two headers
          // rather than a blank column. Alone in a pane it is the whole thing
          // the user is looking at, and a header over a void reads as broken.
          <li className="rail-empty">no panels</li>
        ) : (
          rows.map((row) => (
            <RailPanelRow
              key={row.id}
              row={row}
              selected={row.id === selectedId}
              onGoTo={onGoToPanel}
              onStart={onStartPanel}
              onClose={onClosePanel}
            />
          ))
        )}
      </ul>
    </>
  )
}

function AttentionPane({ attention, onGoToPanel }: NavigatorPaneProps): JSX.Element {
  return (
    <>
      <div className="shell__region-title">Attention</div>
      <ul className="rail-list rail-list--attention" aria-label="Attention">
        {attention.length === 0 ? (
          // Not an absent list. This section is empty nearly all the time, and
          // a header with a void under it reads as a broken list rather than as
          // "nobody needs you" — the same argument hiddenAtRest makes in the
          // palette, where a row that disappears is indistinguishable from a
          // feature that was never built.
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
                verify:panels 84), and emphatically not an acknowledge: focus is
                the renderer's single acknowledgement trigger and main is the
                sole author of the state, so a row that cleared it here would
                make the renderer a second author of a fact main owns. The panel
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
    </>
  )
}

function FilesPane({
  treeRootPath, treeRootLabel, treeRows, treeRootPending,
  onToggleDir, onInsertPath, onRefreshTree
}: NavigatorPaneProps): JSX.Element {
  return (
    <>
      <div className="shell__region-title shell__region-title--action">
        {/* The root's basename, never the whole path: the pane is 240px and a
            home-rooted absolute path would wrap to three lines. treeRootPath —
            the FULL path — is the title attribute, which is where a long value
            belongs. Two separate fields on purpose: one cannot be both a short
            display string and a disambiguating full path, and verify:panels 158
            reads the title to confirm WHICH directory is shown. */}
        <span className="shell__tree-root" title={treeRootPath ?? undefined}>
          {treeRootLabel ?? 'Files'}
        </span>
        <button
          type="button"
          className="shell__region-add"
          title="Re-read this directory"
          aria-label="Refresh the file tree"
          {...shellControl(onRefreshTree)}
        >
          ⟳
        </button>
      </div>

      <ul className="rail-list rail-list--tree" aria-label="Files">
        {treeRootLabel === null ? (
          // Ordinary rather than exceptional: it is every launch before the
          // first click.
          <li className="rail-empty">select a panel</li>
        ) : treeRootPending ? (
          // The root's own read is in flight — every selection change, and
          // every press of refresh, which clears treeDirs first. Without this
          // branch `treeRows` is [] here too and falls into the empty-directory
          // branch below: a confident wrong answer, indistinguishable from a
          // directory that genuinely has nothing in it.
          <li className="rail-empty">reading…</li>
        ) : treeRows.length === 0 ? (
          <li className="rail-empty">empty directory</li>
        ) : (
          treeRows.map((row) => {
            if (row.state === 'loading' || row.state === 'note') {
              // Not a button. There is nothing to act on, and a control that
              // takes a click and does nothing is worse than plain text.
              return (
                <li
                  key={row.path}
                  className="rail-row file-row file-row--note"
                  style={{ paddingLeft: `${row.depth * 12}px` }}
                  data-file-note={row.path}
                >
                  {row.state === 'loading' ? 'reading…' : row.note}
                </li>
              )
            }
            const isDir = row.kind === 'dir'
            return (
              <li key={row.path} className="rail-row file-row">
                <button
                  type="button"
                  className="rail-row__main"
                  style={{ paddingLeft: `${row.depth * 12}px` }}
                  data-file-path={row.path}
                  title={isDir ? row.name : `Insert ${row.name}`}
                  // shellControl, and here it is not a convention. Its
                  // preventDefault on mousedown is what stops DOM focus moving
                  // to this button — and for THIS control that is fatal rather
                  // than merely bad, because the click's whole job is to paste
                  // into the FOCUSED panel. A row that took focus would destroy
                  // its own target in the act of using it, and the symptom is
                  // "clicking a file does nothing", with no error anywhere.
                  {...shellControl(() => (isDir ? onToggleDir(row.path) : onInsertPath(row.path)))}
                >
                  <span className="file-row__twist" aria-hidden="true">
                    {isDir ? (row.state === 'expanded' ? '▾' : '▸') : ''}
                  </span>
                  <span className="rail-row__label">{row.name}</span>
                </button>
              </li>
            )
          })
        )}
      </ul>
    </>
  )
}

export const NavigatorPane = memo(NavigatorPaneImpl)
