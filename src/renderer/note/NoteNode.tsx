import { useEffect, useRef, useState, type JSX, type MouseEvent as ReactMouseEvent } from 'react'
import type { NotePanel } from '@renderer/panels/panels'
import type { DragState } from '@renderer/canvas/panel-interaction'
import { PanelFrame } from '@renderer/components/PanelFrame'
import { shellControl } from '@renderer/shell/shell-control'
import { NOTE_TINTS, noteSummary, normaliseNoteText, type NoteTint } from '@shared/notes'
import { fieldKeepsKey } from '@renderer/canvas/draft-focus'

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
 * Two rules hold the frame up. Its interior takes no gesture, so a click
 * inside it reaches the object it encloses — the brief's "its interior does
 * not swallow another object's gesture" — while its label and a thin ring
 * stay hittable so the frame itself can be selected, moved and renamed. And a
 * frame owns NOTHING: it is a region drawn behind objects, never a group,
 * because a second ownership model would give every panel two possible homes
 * (`shared/groups.ts`'s own rule).
 *
 * M395. The first cut kept the interior clear on the BODY only: the frame's
 * `.pf` root still took every click and blurred what lay under it, and a
 * selection raised the frame over its own contents (z −1 → 2) — after one
 * click an enclosed sticky could no longer be picked, dragged or resized (the
 * live audit's P0). Now the ROOT takes no pointer and paints no blur
 * (styles.css), the parts that do take it are the header, the name field, the
 * handles, the ports and the RING below, and `raisePanel` never lifts a
 * frame. A move of the frame carries what lies wholly inside it — computed at
 * the gesture (Canvas's onBeginDrag, panels.ts's `frameContents`), never
 * stored: the record still owns nothing.
 *
 * The editor is the FIFTH text surface `docs/load-bearing.md` predicted: it
 * keeps the canvas's bare keys at the field and serves its own `edit:paste`,
 * the shape `Palette.tsx` established. A ⌘ chord that is not a text edit goes
 * on to the canvas (M395, draft-focus.ts's `fieldKeepsKey`). The `edit:undo`
 * half is the documented, unfixed inheritance — a Cmd+Z aimed at this field
 * still reaches history.
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
  // M395. The ring moves the frame exactly as its header does (PanelFrame's
  // beginMove): select, then a move gesture from this press.
  const beginRingMove = (event: ReactMouseEvent): void => {
    if (event.button !== 0) return
    event.stopPropagation()
    event.preventDefault()
    props.onSelect(id, event.shiftKey)
    props.onBeginDrag({ panelId: id, mode: { kind: 'move' }, originRect: panel.rect, originWorld: { x: event.clientX, y: event.clientY } })
  }
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
      close={readOnly ? null : { armed: false, title: 'Close', armedText: '', onMouseDown: (e: ReactMouseEvent) => { e.stopPropagation(); e.preventDefault(); props.onClose(id) } }}
      onSelect={props.onSelect}
      onBeginDrag={props.onBeginDrag}
      onBeginLink={props.onBeginLink}
    >
      {/* M395. THE FRAME'S RING: thin edges down the sides and along the foot
          that take the pointer while the interior does not, each beginning
          the frame's own move (which carries what lies inside it); the header
          is the ring's top. Absolutely positioned over the body's edges —
          `.pf__keep` is display: contents, so `.panel` is their box. */}
      {form === 'frame' && !readOnly && (['e', 's', 'w'] as const).map((side) => (
        <span key={side} className={`note-node__ring note-node__ring--${side}`} data-note-ring={side} aria-hidden="true" onMouseDown={beginRingMove} />
      ))}
      {/* M395. THE TINT SWATCHES, off the header and along the sticky's foot.
          Four word chips in the header pushed its close control ~28px past
          the frame's right edge (the audit's P1), and no header can hold them
          at the 200px floor. Here they are the sticky's contextual layer
          (opacity 0 → 1 with the frame's verbs), absolutely positioned so no
          text reflows under a hover, and still the note-tint verb's canvas
          door (verb-table.ts). The `note-node__tint` and `data-note-tint-chip`
          aliases are kept. */}
      {form === 'sticky' && !readOnly && (
        <div className="note-node__tints" role="group" aria-label="Tint" data-note-tints onMouseDown={(e) => e.stopPropagation()}>
          {NOTE_TINTS.map((t) => (
            <button key={t} type="button" className={`note-node__tint${(panel.note.tint ?? 'yellow') === t ? ' is-on' : ''}`}
              data-note-tint-chip={t} data-tint={t} aria-pressed={(panel.note.tint ?? 'yellow') === t} aria-label={`Tint this note ${t}`} title={`Tint this note ${t}`}
              {...shellControl(() => props.onTint(id, t))} />
          ))}
        </div>
      )}
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
              // M395. Bare keys stay here; a ⌘ chord that is not a text edit
              // (⌘K, ⌘=, ⌘0 …) goes on to the canvas.
              if (fieldKeepsKey(e)) e.stopPropagation()
              if (e.key === 'Escape') { e.preventDefault(); commit(); fieldRef.current?.blur() }
            }} />
        )}
      </div>
    </PanelFrame>
  )
}
