import { memo, useEffect, useMemo, useState, type JSX } from 'react'
import { shellControl } from './shell-control'
import { ChevronLeft, Refresh, KindNote } from '@renderer/icons'
import { EmptyState } from './EmptyState'
import type { VaultNoteRow } from '@shared/ipc-contract'
import type { TagEntry } from '@shared/vault'

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
  /** M150. The index's tags: a lower-cased name → the notes carrying it. Absent before the first read. */
  tags?: Readonly<Record<string, TagEntry[]>>
  /** M150. A filter asked for from OUTSIDE the pane (a note's chip): the tag, and a nonce so the same tag asked twice lands twice. */
  filterRequest?: { tag: string; nonce: number } | null
}

/** M150. The pane's tag rows: by count, then name; the cap is the pane's own row cap. */
const TAG_ROWS_MAX = 40
export function tagRows(tags: Readonly<Record<string, TagEntry[]>> | undefined): Array<{ tag: string; count: number }> {
  if (tags === undefined) return []
  return Object.entries(tags).map(([tag, notes]) => ({ tag, count: notes.length })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

function VaultPaneImpl(props: VaultPaneProps): JSX.Element {
  const [query, setQuery] = useState('')
  // M150. A chip in a note asks for a tag: the request lands in the same
  // field a person types into, so the filter is visible and clearable.
  useEffect(() => { if (props.filterRequest) setQuery(`#${props.filterRequest.tag}`) }, [props.filterRequest])
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    // `#name` filters BY TAG through the index — the notes carrying it — and
    // any other text by title or path, as before.
    const byTag = q.startsWith('#') ? new Set((props.tags?.[q.slice(1)] ?? []).map((t) => t.path)) : null
    const matching = q === '' ? [...props.notes] : byTag !== null ? props.notes.filter((n) => byTag.has(n.path)) : props.notes.filter((n) => n.title.toLowerCase().includes(q) || n.path.toLowerCase().includes(q))
    // Newest first: a vault is a stream of writing, and the note somebody (or
    // some agent) just wrote is the one they are looking for.
    return matching.sort((a, b) => b.at - a.at)
  }, [props.notes, props.tags, query])
  // Once per render, not four times (the M150 critic).
  const tagList = useMemo(() => tagRows(props.tags), [props.tags])

  return (
    <div className="shell__tree vault-pane" aria-label="Notes" data-vault-pane>
      <div className="shell__region-title shell__region-title--action navigator__header">
        <span className="shell__tree-root" title={props.root === '' ? undefined : props.root}>Notes</span>
        {props.root !== '' && (
          <span className="shell__tree-panel" data-vault-root title={props.root}>· {props.root.replace(/\/+$/, '').split('/').pop()}</span>
        )}
        <span className="navigator__header-actions">
          <button
            type="button"
            className="shell__region-add icon-button"
            title="Read the notes folder again"
            aria-label="Refresh Notes"
            data-vault-refresh
            disabled={props.root === ''}
            {...shellControl(props.onRefresh)}
          >
            <Refresh />
          </button>
          <button
            type="button"
            className="shell__rail-toggle icon-button"
            title="Hide Notes (⌘\)"
            aria-label="Hide Notes"
            {...shellControl(props.onToggle)}
          >
            <ChevronLeft />
          </button>
        </span>
      </div>
      {props.root === '' ? (
        <div className="vault-pane__empty" data-vault-arm="unset">
          {/* M177. One shape; the verb keeps data-vault-choose for the checks. */}
          <EmptyState id="vault-unset" glyph={<KindNote />}>
            <button type="button" className="vault-pane__verb empty-state__verb pf__verb pf__verb--word" data-vault-choose {...shellControl(props.onChooseRoot)}>Choose a folder…</button>
          </EmptyState>
        </div>
      ) : props.pending && props.notes.length === 0 ? (
        <p className="rail-empty" data-vault-arm="reading">reading…</p>
      ) : props.reason !== undefined ? (
        <div className="vault-pane__empty" data-vault-arm="missing">
          {/* M179: the data sentence, the read's own reason beneath it (dynamic — the path, the error), one verb. */}
          <EmptyState id="vault-missing" glyph={<KindNote />}>
            <p className="empty-state__note" data-vault-reason>{props.reason}</p>
            <button type="button" className="vault-pane__verb empty-state__verb pf__verb pf__verb--word" data-vault-choose {...shellControl(props.onChooseRoot)}>Choose another folder…</button>
          </EmptyState>
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
            <p className="pf__more" data-vault-skipped>{props.skipped} note{props.skipped === 1 ? '' : 's'} were not read — the notes folder is over the cap</p>
          )}
          {/* M150. TAGS, under the notes: one row per tag with its count. No
              section at all when the vault has none — absence, never a
              heading over nothing. A row is the filter's door; the field
              above shows what it did. */}
          {tagList.length > 0 && (
            <>
              <div className="shell__region-title vault-pane__tags-title">Tags</div>
              <ul className="rail-list vault-pane__tags" aria-label="Tags" data-vault-tags>
                {tagList.slice(0, TAG_ROWS_MAX).map((row) => (
                  <li key={row.tag} className={`rail-row vault-pane__tag${query.trim().toLowerCase() === `#${row.tag}` ? ' rail-row--selected' : ''}`} data-vault-tag={row.tag}>
                    <button type="button" className="rail-row__main" title={`notes tagged #${row.tag}`} {...shellControl(() => setQuery(query.trim().toLowerCase() === `#${row.tag}` ? '' : `#${row.tag}`))}>
                      <span className="rail-row__label">#{row.tag}</span>
                      <span className="rail-row__state" data-vault-tag-count>{row.count}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {tagList.length > TAG_ROWS_MAX && (
                <p className="pf__more" data-vault-tags-more>{tagList.length - TAG_ROWS_MAX} more tags — the pane lists the {TAG_ROWS_MAX} most used</p>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

export const VaultPane = memo(VaultPaneImpl)
