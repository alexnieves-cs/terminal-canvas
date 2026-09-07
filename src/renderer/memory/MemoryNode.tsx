import { memo, useCallback, useEffect, useState, type JSX, type MouseEvent as ReactMouseEvent } from 'react'
import type { MemoryPanel } from '@renderer/panels/panels'
import type { DragState } from '@renderer/canvas/panel-interaction'
import type { MemoryEntryRow } from '@shared/ipc-contract'
import { PanelFrame } from '@renderer/components/PanelFrame'
import { shellControl } from '@renderer/shell/shell-control'
import { Refresh } from '@renderer/icons'
import { MEMORY_MAX } from '@shared/ipc-contract'
import { displayPath } from '@shared/display-path'

/**
 * M83. THE MEMORY NODE — the seventh kind, and a document one: what this
 * repository has decided, tried and failed, as a panel.
 *
 * Sessionless by construction (no spec), so it never reaches assignTiers,
 * `registry.ensure` or the live budget — the review, file, Jira and toolbox
 * nodes' own rule, and what makes closing it send no `pty.kill`.
 *
 * Three states, never two: `reading…` before the first answer, a named empty
 * arm for a repository nobody has written about, and the entries. A write
 * goes through the SAME main-side store the control verb writes to, so an
 * agent's memory and a person's are one list.
 */
export interface MemoryNodeProps {
  panel: MemoryPanel
  selected: boolean
  onSelect: (id: string, additive?: boolean) => void
  onFocus: (id: string) => void
  onBeginDrag: (state: DragState) => void
  onClose: (id: string) => void
  readOnly?: boolean
  onBeginLink: (panelId: string, event: ReactMouseEvent) => void
  linkTarget: boolean
}

const KINDS = ['decided', 'tried', 'failed', 'note'] as const

/**
 * What the add line's field says it will write, in the SELECTED kind's own
 * words. The select sits under a list whose every row begins with a kind, so
 * on its own it reads as a filter — the opposite of what it does (M83's
 * critic). The placeholder is what names the verb.
 */
const PLACEHOLDER: Record<(typeof KINDS)[number], string> = {
  decided: 'what this repository decided',
  tried: 'what this repository tried',
  failed: 'what this repository tried and failed',
  note: 'something worth remembering'
}

/** M164. The path rule's one helper; the memory node used to carry its own left-truncation. */
const rootLabel = (root: string): string => displayPath(root).short

function clock(at: number): string {
  const d = new Date(at)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function MemoryNodeImpl(props: MemoryNodeProps): JSX.Element {
  const { panel } = props
  const id = panel.rect.id
  const root = panel.source.root
  const [read, setRead] = useState<{ entries: MemoryEntryRow[]; skipped: number } | null>(null)
  const [kind, setKind] = useState<(typeof KINDS)[number]>('decided')
  const [text, setText] = useState('')
  const [refusal, setRefusal] = useState<string | null>(null)

  const load = useCallback(() => {
    void window.canvas.memory.list(root, MEMORY_MAX).then((answer) => setRead({ entries: answer.entries, skipped: answer.skipped }))
  }, [root])
  useEffect(() => { load() }, [load])

  const add = (): void => {
    const body = text.trim()
    if (body === '') { setRefusal('a memory needs text'); return }
    void window.canvas.memory.add({ root, kind, text: body, panelId: id }).then((answer) => {
      if (answer.ok === false) { setRefusal(answer.reason); return }
      setText('')
      setRefusal(null)
      load()
    })
  }

  return (
    <PanelFrame
      id={id}
      kind="memory"
      rect={panel.rect}
      z={panel.z}
      selected={props.selected}
      linkTarget={props.linkTarget}
      readOnly={props.readOnly ?? false}
      className="memory-node"
      rootAttrs={{ 'data-memory-node': root, 'data-memory-count': String(read?.entries.length ?? 0) }}
      title={panel.title ?? `memory · ${root.replace(/\/+$/, '').split('/').pop() ?? root}`}
      chrome={<>
        {/* The kind's own fact, where `server.ts` says `95 B · 4 lines` and
            the toolbox says `2 in 1 group` — the chrome row's summary slot is
            how every document kind states what it holds. */}
        <span className="pf__summary memory-node__summary" data-memory-summary>
          {read === null ? '…' : read.entries.length === 0 ? 'nothing yet' : `${read.entries.length} remembered`}
        </span>
        <button type="button" className="pf__control icon-button" data-memory-refresh title="Read the memory again" aria-label="Refresh"
          {...shellControl(load)}><Refresh /></button>
      </>}
      close={props.readOnly === true ? null : {
        armed: false,
        title: 'Close',
        armedText: 'close?',
        onMouseDown: (e: ReactMouseEvent) => { e.stopPropagation(); e.preventDefault(); props.onClose(id) }
      }}
      onSelect={props.onSelect}
      onBeginDrag={props.onBeginDrag}
      onBeginLink={props.onBeginLink}
    >
      <div className="pf__body memory-node__body" onMouseDown={(e) => { e.stopPropagation(); props.onFocus(id) }}>
        <p className="memory-node__root" title={root}>{rootLabel(root)}</p>
        {read === null ? (
          <p className="pf__note" data-memory-arm="reading">reading…</p>
        ) : read.entries.length === 0 ? (
          <p className="pf__note" data-memory-arm="empty">nothing remembered about this repository yet — add the first below, or an agent can with tc memory add</p>
        ) : (
          <ul className="memory-node__list" data-memory-list>
            {read.entries.map((entry) => (
              <li key={`${entry.at}-${entry.text.slice(0, 12)}`} className="memory-node__entry" data-memory-entry={entry.kind}>
                <span className="memory-node__kind">{entry.kind}</span>
                <span className="memory-node__text">{entry.text}</span>
                <span className="memory-node__at">{clock(entry.at)}</span>
                {entry.redacted !== undefined && <span className="memory-node__redacted">{entry.redacted} redacted</span>}
              </li>
            ))}
          </ul>
        )}
        {read !== null && read.skipped > 0 && (
          <p className="pf__note" data-memory-skipped>{read.skipped} line{read.skipped === 1 ? '' : 's'} in the file could not be read</p>
        )}
        {props.readOnly !== true && (
          <div className="memory-node__add" data-memory-add>
            <select className="memory-node__select" data-memory-kind value={kind} aria-label="kind"
              onMouseDown={(e) => e.stopPropagation()}
              onChange={(e) => { setKind(e.target.value as (typeof KINDS)[number]); setRefusal(null) }}>
              {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <input className="memory-node__input" data-memory-text value={text} placeholder={PLACEHOLDER[kind]}
              onMouseDown={(e) => e.stopPropagation()}
              onChange={(e) => { setText(e.target.value); setRefusal(null) }}
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); add() } }} />
            <button type="button" className="memory-node__verb" data-memory-save title="Add this memory" {...shellControl(add)}>Add</button>
          </div>
        )}
        {refusal !== null && <p className="pf__note memory-node__refusal" data-memory-refusal role="alert">{refusal}</p>}
      </div>
    </PanelFrame>
  )
}

export const MemoryNode = memo(MemoryNodeImpl)
