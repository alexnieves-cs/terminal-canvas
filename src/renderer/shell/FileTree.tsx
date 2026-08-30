import { memo, type JSX } from 'react'
import type { FileRow } from './file-tree-model'
import { shellControl } from './shell-control'

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
  rows: FileRow[]
  /** True while the ROOT's own read is in flight — a selection change, or the
   *  refresh control, which clears every cached read including the root's.
   *  buildFileRows deliberately never emits a `loading` row at depth 0 (that
   *  is reserved for a CHILD of an expanded directory), so nothing else fills
   *  this gap: without it, `rows` is `[]` during the wait and the empty-list
   *  branch below renders "empty directory" — a confident wrong answer,
   *  indistinguishable from a directory that genuinely has nothing in it. */
  rootPending: boolean
  onToggleDir: (path: string) => void
  onInsertPath: (path: string) => void
  onRefresh: () => void
}

/**
 * The file tree column: the fourth region of the shell.
 *
 * Presentational by construction, like SideRail — every prop is derived data
 * or a callback. memo'd, and `rows` is frozen upstream on treeSignature:
 * Canvas re-renders on every mousemove over the canvas and on every frame of a
 * drag, so an unfrozen array defeats this memo outright and the symptom is
 * invisible on a small tree.
 *
 * Rendered UNCONDITIONALLY, exactly as SideRail and Inspector are: collapsing
 * is a CSS width change to a 22px strip holding the toggle and nothing else,
 * because that toggle is the only way back for a user who does not know the
 * chord. That is also why the rows need the signature freeze rather than a
 * memo keyed on treeOpen — they stay mounted and reconciled while nobody can
 * see them, so there is no closed state to key on.
 */
function FileTreeImpl({
  onToggle, rootPath, rootLabel, rows, rootPending, onToggleDir, onInsertPath, onRefresh
}: FileTreeProps): JSX.Element {
  return (
    <aside className="shell__tree" aria-label="File tree">
      <button
        type="button"
        className="shell__tree-toggle"
        title="Hide the file tree (⌘B)"
        aria-label="Hide the file tree"
        {...shellControl(onToggle)}
      >
        ‹
      </button>

      <div className="shell__region-title shell__region-title--action">
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
        <button
          type="button"
          className="shell__region-add"
          title="Re-read this directory"
          aria-label="Refresh the file tree"
          {...shellControl(onRefresh)}
        >
          ⟳
        </button>
      </div>

      <ul className="rail-list rail-list--tree" aria-label="Files">
        {rootLabel === null ? (
          // A header with a void under it reads as a broken list, which is the
          // rule all three of SideRail's sections already obey. This state is
          // ordinary: it is every launch before the first click.
          <li className="rail-empty">select a panel</li>
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
    </aside>
  )
}

export const FileTree = memo(FileTreeImpl)
