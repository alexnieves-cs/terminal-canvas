import { useEffect, useRef, useState, type JSX, type MouseEvent as ReactMouseEvent } from 'react'
import type { NotePanel } from '@renderer/panels/panels'
import type { DragState } from '@renderer/canvas/panel-interaction'
import { PanelFrame } from '@renderer/components/PanelFrame'
import { shellControl } from '@renderer/shell/shell-control'
import { NOTE_TINTS, noteSummary, normaliseNoteText, type NoteTint } from '@shared/notes'

/**
 * M187. THE SIXTEENTH KIND — one record, three FORMS.
 *
 * `sticky` is a tinted card in the UI face, `text` is the same words with no
 * card at all, and `frame` is a named region with a quiet boundary and
 * NOTHING in the middle. The forms differ in painting and in nothing else:
 * selection, drag, resize, marks, grouping, undo, persistence, the rail and
 * export are `PanelFrame`'s and the panel array's, so this component owns
 * none of them (M181's argument, reached again).
 *
 * Two rules hold the frame up. Its body is `pointer-events: none`, so a click
 * inside it reaches the object it encloses — the brief's "its interior does
 * not swallow another object's gesture" — while its boundary and its name
 * stay hittable so the frame itself can be selected, moved and renamed. And a
 * frame owns NOTHING: it is a region drawn behind objects, never a group,
 * because a second ownership model would give every panel two possible homes
 * (`shared/groups.ts`'s own rule).
 *
 * The editor is the FIFTH text surface `docs/load-bearing.md` predicted: it
 * stops the canvas's keys at the field and serves its own `edit:paste`, the
 * shape `Palette.tsx` established. The `edit:undo` half is the documented,
 * unfixed inheritance — a Cmd+Z aimed at this field still reaches history.
 */
export interface NoteNodeProps {
  panel: NotePanel
  selected: boolean
  onSelect: (id: string, additive?: boolean) => void
  onFocus: (id: string) => void
  onBeginDrag: (state: DragState) => void
  onClose: (id: string) => void
  readOnly?: boolean
  onBeginLink: (panelId: string, event: ReactMouseEvent) => void
  linkTarget: boolean
  /** M187. Commit the text (on blur, on Escape) and the tint — one door each. */
  onText: (panelId: string, text: string) => void
  onTint: (panelId: string, tint: NoteTint) => void
}

export function NoteNode(props: NoteNodeProps): JSX.Element {
  const { panel } = props
  const id = panel.rect.id
  const form = panel.note.form
  const readOnly = props.readOnly === true
  const [draft, setDraft] = useState(panel.note.text)
  const [editing, setEditing] = useState(false)
  const fieldRef = useRef<HTMLTextAreaElement | null>(null)
  // The record is the truth: a change from anywhere else (the agent's verb,
  // an undo) replaces a draft nobody is typing into.
  useEffect(() => { if (!editing) setDraft(panel.note.text) }, [panel.note.text, editing])
  useEffect(() => {
    if (!editing) return undefined
    return window.canvas.edit.onPaste((text) => {
      const field = fieldRef.current
      if (field === null || document.activeElement !== field) return
      const at = field.selectionStart ?? draft.length
      const to = field.selectionEnd ?? at
      setDraft(`${draft.slice(0, at)}${text}${draft.slice(to)}`)
    })
  }, [editing, draft])
  const commit = (): void => {
    setEditing(false)
    const next = normaliseNoteText(draft)
    if (next !== panel.note.text) props.onText(id, next)
  }
  const title = panel.title ?? noteSummary(panel.note.text, form, 28)
  return (
    <PanelFrame
      id={id}
      kind="note"
      rect={panel.rect}
      z={panel.z}
      selected={props.selected}
      linkTarget={props.linkTarget}
      readOnly={readOnly}
      className={`note-node note-node--${form}`}
      rootAttrs={{ 'data-note-node': id, 'data-note-form': form, ...(panel.note.tint === undefined ? {} : { 'data-note-tint': panel.note.tint }) }}
      title={title}
      chrome={readOnly || form !== 'sticky' ? undefined : (
        <>
          {NOTE_TINTS.map((t) => (
            <button key={t} type="button" className={`pf__verb pf__verb--word note-node__tint${panel.note.tint === t ? ' is-on' : ''}`}
              data-note-tint-chip={t} aria-pressed={panel.note.tint === t} title={`Tint this note ${t}`}
              {...shellControl(() => props.onTint(id, t))}>{t}</button>
          ))}
        </>
      )}
      close={readOnly ? null : { armed: false, title: 'Close', armedText: '', onMouseDown: (e: ReactMouseEvent) => { e.stopPropagation(); e.preventDefault(); props.onClose(id) } }}
      onSelect={props.onSelect}
      onBeginDrag={props.onBeginDrag}
      onBeginLink={props.onBeginLink}
    >
      <div className="pf__body note-node__body" data-note-body onMouseDown={(e) => { e.stopPropagation(); props.onFocus(id) }}>
        {readOnly ? (
          <p className="note-node__text" data-note-text>{panel.note.text}</p>
        ) : (
          <textarea
            ref={fieldRef}
            className="note-node__field"
            data-note-field
            value={draft}
            spellCheck={false}
            placeholder={form === 'frame' ? 'name this region' : 'write here'}
            aria-label={form === 'frame' ? 'Region name' : 'Note text'}
            onFocus={() => setEditing(true)}
            onBlur={commit}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Escape') { e.preventDefault(); commit(); fieldRef.current?.blur() }
            }} />
        )}
      </div>
    </PanelFrame>
  )
}
