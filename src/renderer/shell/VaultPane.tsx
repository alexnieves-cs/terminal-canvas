import { memo, useMemo, useState, type JSX } from 'react'
import { shellControl } from './shell-control'
import { ChevronLeft, Refresh } from '@renderer/icons'
import type { VaultNoteRow } from '@shared/ipc-contract'

/**
 * M85. THE VAULT PANE — the navigator's fourth, and the whole of the vault's
 * surface besides the note itself.
 *
 * Presentational by construction like every other pane here: every prop is
 * derived data or a callback, and the rows are frozen upstream on a
 * signature, because Canvas re-renders on every mousemove and on every frame
 * of a drag.
 *
 * Three states, and the first one is the milestone's: NO VAULT SET is not an
 * empty list. It names the setting and offers the verb that fixes it, rather
 * than rendering a header over a void — a pane that showed nothing would be
 * indistinguishable from a folder with no notes in it.
 */
export interface VaultPaneProps {
  onToggle: () => void
  /** The configured folder, or '' when none is set. */
  root: string
  notes: readonly VaultNoteRow[]
  /** True while a read is in flight. Shown as `reading…` only before the FIRST answer: a re-read keeps the list (and the filter's focus) in place. */
  pending: boolean
  /** Why there is nothing, when main said so. */
  reason?: string
  /** Notes the read's caps dropped. */
  skipped: number
  onOpenNote: (path: string) => void
  /** The note the selected panel shows, relative to the root — its row is marked (M85's critic). */
  selectedPath?: string | null
  onChooseRoot: () => void
  onRefresh: () => void
}

function VaultPaneImpl(props: VaultPaneProps): JSX.Element {
  const [query, setQuery] = useState('')
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matching = q === '' ? [...props.notes] : props.notes.filter((n) => n.title.toLowerCase().includes(q) || n.path.toLowerCase().includes(q))
    // Newest first: a vault is a stream of writing, and the note somebody (or
    // some agent) just wrote is the one they are looking for.
    return matching.sort((a, b) => b.at - a.at)
  }, [props.notes, query])

  return (
    <div className="shell__tree vault-pane" aria-label="Vault" data-vault-pane>
      <div className="shell__region-title shell__region-title--action navigator__header">
        <span className="shell__tree-root" title={props.root === '' ? undefined : props.root}>Vault</span>
        {props.root !== '' && (
          <span className="shell__tree-panel" data-vault-root title={props.root}>· {props.root.replace(/\/+$/, '').split('/').pop()}</span>
        )}
        <span className="navigator__header-actions">
          <button
            type="button"
            className="shell__region-add icon-button"
            title="Read the vault again"
            aria-label="Refresh the vault"
            data-vault-refresh
            disabled={props.root === ''}
            {...shellControl(props.onRefresh)}
          >
            <Refresh />
          </button>
          <button
            type="button"
            className="shell__rail-toggle icon-button"
            title="Hide the navigator (⌘\)"
            aria-label="Hide the navigator"
            {...shellControl(props.onToggle)}
          >
            <ChevronLeft />
          </button>
        </span>
      </div>
      {props.root === '' ? (
        <div className="vault-pane__empty" data-vault-arm="unset">
          <p className="rail-empty">no vault folder yet — a vault is a folder of markdown notes that link to each other</p>
          <button type="button" className="vault-pane__verb" data-vault-choose {...shellControl(props.onChooseRoot)}>Choose a folder…</button>
        </div>
      ) : props.pending && props.notes.length === 0 ? (
        <p className="rail-empty" data-vault-arm="reading">reading…</p>
      ) : props.reason !== undefined ? (
        <div className="vault-pane__empty" data-vault-arm="missing">
          <p className="rail-empty">{props.reason}</p>
          <button type="button" className="vault-pane__verb" data-vault-choose {...shellControl(props.onChooseRoot)}>Choose another folder…</button>
        </div>
      ) : (
        <>
          <input
            className="vault-pane__filter"
            data-vault-filter
            value={query}
            placeholder="filter notes"
            aria-label="Filter notes"
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') setQuery('') }}
          />
          <ul className="rail-list vault-pane__list" aria-label="Notes">
            {rows.length === 0 ? (
              <li className="rail-empty" data-vault-arm="empty">
                {props.notes.length === 0 ? 'no notes in this folder yet' : `no note matches ${query}`}
              </li>
            ) : rows.map((note) => (
              <li key={note.path} className={`rail-row vault-pane__row${props.selectedPath === note.path ? ' rail-row--selected' : ''}`} data-vault-note={note.path}>
                <button type="button" className="rail-row__main" title={note.path} {...shellControl(() => props.onOpenNote(note.path))}>
                  {/* The folder as a dim LEADING prefix, the way the note's own
                      body writes a path — the trailing column is where every
                      other pane puts a state word, and a folder there read as
                      one (M85's critic). */}
                  <span className="rail-row__label">
                    {note.path.includes('/') && <span className="vault-pane__where">{note.path.slice(0, note.path.lastIndexOf('/') + 1)}</span>}
                    <span data-vault-title>{note.title}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {props.skipped > 0 && (
            <p className="pf__more" data-vault-skipped>{props.skipped} note{props.skipped === 1 ? '' : 's'} were not read — the vault is over the cap</p>
          )}
        </>
      )}
    </div>
  )
}

export const VaultPane = memo(VaultPaneImpl)
