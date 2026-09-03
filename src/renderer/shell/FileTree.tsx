import { memo, type JSX } from 'react'
import type { FileRow } from './file-tree-model'
import { shellControl } from './shell-control'
import { ChevronLeft, Refresh } from '@renderer/icons'

export interface FileTreeProps {
  onToggle: () => void
  /** The full absolute path, or null when nothing is selected. Shown only as
   *  the heading's tooltip — see rootLabel for what is actually painted. */
  rootPath: string | null
  /** The root's basename, or null when nothing is selected. This is the text
   *  painted in the heading; rootPath carries the full path for the tooltip,
   *  since one field cannot be both a short label and a disambiguating full
   *  path. */
  rootLabel: string | null
  /** M68. Whose directory this is — the selected panel's label. */
  rootPanel?: string | null
  rows: FileRow[]
  /** True while the ROOT's own read is in flight — a selection change, or the
   *  refresh control, which clears every cached read including the root's.
   *  buildFileRows deliberately never emits a `loading` row at depth 0 (that
   *  is reserved for a CHILD of an expanded directory), so nothing else fills
   *  this gap: without it, `rows` is `[]` during the wait and the empty-list
   *  branch below renders "empty directory" — a confident wrong answer,
   *  indistinguishable from a directory that genuinely has nothing in it. */
  rootPending: boolean
  /**
   * M48. Why there is nothing to list when rootLabel is null: no selection,
   * or a selected panel of a kind with no directory. Names the panel, so
   * the empty pane says which panel it is about rather than reading as a
   * broken list.
   */
  emptyReason: string
  onToggleDir: (path: string) => void
  onInsertPath: (path: string) => void
  onRefresh: () => void
}

/**
 * The file tree: the navigator's Files pane (M46) — a body, not a column.
 *
 * Presentational by construction, like SideRail — every prop is derived data
 * or a callback. memo'd, and `rows` is frozen upstream on treeSignature:
 * Canvas re-renders on every mousemove over the canvas and on every frame of a
 * drag, so an unfrozen array defeats this memo outright and the symptom is
 * invisible on a small tree.
 *
 * Rendered by Navigator only while it is the chosen pane; the rows still
 * arrive frozen on treeSignature, because Canvas re-renders on every
 * mousemove whether or not this pane is up.
 */
function FileTreeImpl({
  onToggle, rootPath, rootLabel, rootPanel, rows, rootPending, emptyReason, onToggleDir, onInsertPath, onRefresh
}: FileTreeProps): JSX.Element {
  return (
    <div className="shell__tree" aria-label="File tree" data-file-tree>
      <div className="shell__region-title shell__region-title--action navigator__header">
        {/* The root's basename, never the whole path: the column is 220px and
            a home-rooted absolute path would wrap to three lines. rootPath —
            the FULL path — is the title attribute, which is where a long
            value belongs. Two separate fields on purpose: rootLabel alone
            cannot supply both a short display string and a disambiguating
            full path, and check 127 reads the title to confirm which
            directory is shown. */}
        <span className="shell__tree-root" title={rootPath ?? undefined}>
          {rootLabel ?? 'Files'}
        </span>
        {/* M68. Whose: a tree rooted on a panel the user did not click says so. */}
        {rootLabel !== null && rootPanel != null && (
          <span className="shell__tree-panel" data-tree-panel title={`the directory of ${rootPanel}`}>· {rootPanel}</span>
        )}
        <span className="navigator__header-actions">
          <button
            type="button"
            className="shell__region-add icon-button"
            title="Re-read this directory"
            aria-label="Refresh the file tree"
            {...shellControl(onRefresh)}
          >
            <Refresh />
          </button>
          {/* M46: the Files pane is one of the navigator's panes, so its
              collapse control is the navigator's (⌘\), and ⌘B is what
              returns the list. */}
          <button
            type="button"
            className="shell__rail-toggle icon-button"
            title="Hide the navigator (⌘\\)"
            aria-label="Hide the navigator"
            {...shellControl(onToggle)}
          >
            <ChevronLeft />
          </button>
        </span>
      </div>

      <ul className="rail-list rail-list--tree" aria-label="Files">
        {rootLabel === null ? (
          // A header with a void under it reads as a broken list, which is the
          // rule all three of SideRail's sections already obey. This state is
          // ordinary: it is every launch before the first click.
          <li className="rail-empty" data-tree-empty>{emptyReason}</li>
        ) : rootPending ? (
          // The root's own read is in flight — every selection change, and
          // every press of refresh, which clears treeDirs first. Without this
          // branch `rows` is `[]` here too, and falls into the empty-directory
          // branch below: a confident wrong answer indistinguishable from a
          // directory that genuinely has nothing in it.
          <li className="rail-empty">reading…</li>
        ) : rows.length === 0 ? (
          <li className="rail-empty">empty directory</li>
        ) : (
          rows.map((row) => {
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
                  // into the focused panel. A row that took focus would destroy
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
    </div>
  )
}

export const FileTree = memo(FileTreeImpl)
