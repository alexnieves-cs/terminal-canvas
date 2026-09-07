import { useEffect, useMemo, useRef, useState, type JSX, type MouseEvent as ReactMouseEvent } from 'react'
import {
  applySkillEdit,
  frontmatterGrammatical,
  frontmatterValue,
  type ReadStamp,
  type SkillWriteResult, KEY_LINE } from '@shared/skill-edit'
import { setSkillEditorFocused } from './editor-focus'

/**
 * M129. THE EDITOR — the first surface in this app that writes into
 * `~/.claude`.
 *
 * Two rules from spec §5 shape everything below, and both of them exist
 * because the naive editor destroys a user's file while reporting success.
 *
 * 1. SAVE NEVER RE-SERIALISES THE FRONTMATTER. `applySkillEdit` rewrites
 *    only the `key: value` lines the small grammar understood and preserves
 *    every other byte inside the fence. When the block carries anything the
 *    grammar cannot read, `frontmatterGrammatical` is false and the METADATA
 *    FIELDS render READ-ONLY WITH THE REASON ON SCREEN while the body stays
 *    editable — the three-state rule applied to editability, rather than a
 *    dead Save that explains nothing.
 * 2. EVERY SAVE CARRIES THE STAMP THE PANEL READ. An agent editing this very
 *    file while the panel holds it open is the ordinary case here (it is
 *    what `Help me write` starts), and main refuses a mismatch by name. The
 *    refusal KEEPS the user's text: nothing below clears a draft on a
 *    refusal, ever.
 *
 * A FILE WRITE IS NOT HISTORY. `Cmd+Z` never reverts one — undo can remove a
 * panel and dispose a session, and a keystroke aimed at a text field must not
 * additionally revert a file on disk. The trash is the recovery path, and the
 * footer says so rather than leaving the user to discover it.
 */

export interface SkillEditorProps {
  panelId: string
  /** The `SKILL.md` itself, as the entry's `sourcePath` gave it. */
  sourcePath: string
  /** The asking panel's cwd — main derives the writable roots from it. */
  cwd: string
  /** The text as READ, and the stamp it was read with. */
  text: string
  stamp: ReadStamp | undefined
  /** True when the read was capped: a save would then truncate the file. */
  truncated: boolean
  /** Non-null disables Save and every field, with this sentence on screen. */
  frozen: string | null
  /** Ask the panel to re-read after a successful write or a stale refusal. */
  onReload: () => void
}

export const REASON_NO_STAMP = 'the file has not finished being read yet, so a save could not tell whether it changed underneath you'
export const REASON_TRUNCATED = 'this file is longer than the read cap, so saving here would cut it — edit it in a file panel instead'
export const REASON_UNCHANGED = 'nothing has changed yet'
export const REASON_UNGRAMMATICAL =
  'the frontmatter block carries something the small grammar cannot read — a comment, a block scalar or an anchor — so these fields are read-only. Save preserves that block byte for byte instead of re-writing it, and the body below is still yours to edit.'

export function SkillEditor(props: SkillEditorProps): JSX.Element {
  const { text, sourcePath } = props
  const grammatical = useMemo(() => frontmatterGrammatical(text), [text])

  // The draft is seeded from the read and re-seeded only when the FILE
  // changes — never on every render of the parent, which would throw away
  // what the user is typing on a 60Hz drag.
  const [body, setBody] = useState('')
  const [description, setDescription] = useState('')
  const [name, setName] = useState('')
  const [result, setResult] = useState<SkillWriteResult | null>(null)
  const bodyRef = useRef<HTMLTextAreaElement | null>(null)

  const split = useMemo(() => splitDraft(text), [text])
  // Seeded on the FILE, never on the text: a re-seed keyed on `text` would
  // discard whatever the user is typing the moment the watcher noticed our
  // own write, which is the shape of a lost draft with no error anywhere.
  // The reader ref is what makes the seed independent of the parent's 60Hz
  // re-renders.
  const splitRef = useRef(split)
  splitRef.current = split
  useEffect(() => {
    const seed = splitRef.current
    setBody(seed.body)
    setName(seed.name)
    setDescription(seed.description)
    setResult(null)
  }, [sourcePath])

  /**
   * Cmd+C / Cmd+V are the app menu's accelerators (main/menu.ts), so the
   * browser never delivers a native copy or paste to these fields and
   * `Canvas.tsx`'s listeners would otherwise fire them AT A TERMINAL the
   * user is not looking at. `Palette.tsx` solved this by serving its own
   * input; this is that shape, at the FIFTH text surface to inherit the
   * hazard (after ReviewNode's commit draft, FileNode's editor and
   * JiraTicket's comment box — CLAUDE.md records all three).
   *
   * THE `edit:undo` HALF REMAINS OPEN, and it is stated here rather than
   * discovered later. `Cmd+Z` arrives as IPC with no KeyboardEvent, so there
   * is no event target to test; `document.activeElement` is the trap
   * `useNavGrid`'s own entry names (xterm's helper is a <textarea>, so
   * guarding on it would kill Cmd+Z over every terminal); and lifting a
   * per-node draft flag to Canvas level is refused by that same entry,
   * because it re-renders the canvas on every keystroke. So a Cmd+Z pressed
   * over this editor still runs `applyHistory` — which is exactly why this
   * editor's writes are NOT in history: undo can never revert a save, so the
   * worst it can do here is move a panel, not silently rewrite a file.
   */
  useEffect(() => {
    const offPaste = window.canvas.edit.onPaste((clip) => {
      if (!clip) return
      const el = bodyRef.current
      if (el === null || document.activeElement !== el) return
      const start = el.selectionStart ?? null
      const end = el.selectionEnd ?? null
      setBody((b) => (start === null || end === null ? b + clip : b.slice(0, start) + clip + b.slice(end)))
    })
    const offCopy = window.canvas.edit.onCopy(() => {
      const el = bodyRef.current
      if (el === null || document.activeElement !== el) return
      // NOT window.getSelection(): a selection inside a <textarea> is not
      // part of the document selection in Chromium, so that reads as empty.
      const { selectionStart: start, selectionEnd: end } = el
      if (start === null || end === null || start === end) return
      void navigator.clipboard.writeText(el.value.slice(start, end))
    })
    return () => {
      offPaste()
      offCopy()
    }
  }, [])

  const dirty = body !== split.body || description !== split.description || name !== split.name
  const saveReason: string | null =
    props.frozen !== null ? props.frozen
      : props.truncated ? REASON_TRUNCATED
        : props.stamp === undefined ? REASON_NO_STAMP
          : !dirty ? REASON_UNCHANGED
            : null

  const save = (): void => {
    const stamp = props.stamp
    if (saveReason !== null || stamp === undefined) return
    // The metadata half is offered ONLY when the grammar read the whole
    // block. Under an ungrammatical block the edit carries the body alone,
    // and applySkillEdit leaves every byte inside the fence exactly as it is.
    const edit = grammatical
      ? { meta: { name, description }, body }
      : { body }
    const applied = applySkillEdit(text, edit)
    if (applied.kind === 'refused') {
      setResult({ kind: 'refused', why: applied.why })
      return
    }
    void window.canvas.skill
      .write({ cwd: props.cwd, path: sourcePath, text: applied.text, stamp })
      .then((r) => {
        setResult(r)
        // Re-read on success so the next save carries a fresh stamp, and on
        // a STALE refusal so the user can see what landed underneath them —
        // the draft above is untouched either way.
        if (r.kind === 'written' || r.kind === 'refused') props.onReload()
      })
      .catch(() => setResult({ kind: 'failed', why: 'the write did not answer' }))
  }

  const metaReason = props.frozen !== null ? props.frozen : grammatical ? null : REASON_UNGRAMMATICAL
  const stop = (fn: () => void) => (e: ReactMouseEvent): void => {
    e.stopPropagation()
    e.preventDefault()
    fn()
  }

  /**
   * Serving our own input is only HALF the fix. `Canvas.tsx`'s own
   * edit:copy/edit:paste listeners gate on `shouldIgnoreKeys()` alone, so
   * without this flag a Cmd+V with the body focused would land in the editor
   * AND in `registry.get(focusedId)` — a running agent — and with a metadata
   * input focused it would land ONLY there, invisibly. The flag covers all
   * three fields; `relatedTarget` keeps it set while focus moves BETWEEN
   * them, since blur fires before the next focus.
   */
  const focusProps = {
    onFocus: () => setSkillEditorFocused(true),
    onBlur: (e: import('react').FocusEvent<HTMLElement>) => {
      const next = e.relatedTarget as Node | null
      if (next !== null && e.currentTarget.closest('[data-skill-editor]')?.contains(next) === true) return
      setSkillEditorFocused(false)
    }
  }
  // A panel closed or carded with a field focused would otherwise leave the
  // whole canvas's keyboard standing down for the rest of the session.
  useEffect(() => () => setSkillEditorFocused(false), [])

  return (
    <div className="skill-editor" data-skill-editor onMouseDown={(e) => e.stopPropagation()}>
      {metaReason !== null && (
        <p className="skill-editor__why" data-skill-edit-meta-why>{metaReason}</p>
      )}
      <label className="skill-editor__field">
        <span className="skill-editor__label">name</span>
        <input
          type="text"
          className="skill-editor__input"
          data-skill-edit-field="name"
          {...focusProps}
          value={name}
          readOnly={metaReason !== null}
          title={metaReason ?? 'the skill’s frontmatter name'}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="skill-editor__field">
        <span className="skill-editor__label">description</span>
        <input
          type="text"
          className="skill-editor__input"
          data-skill-edit-field="description"
          {...focusProps}
          value={description}
          readOnly={metaReason !== null}
          title={metaReason ?? 'the sentence the CLI matches a request against'}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <textarea
        ref={bodyRef}
        className="skill-editor__body"
        data-skill-edit-body
        {...focusProps}
        value={body}
        readOnly={props.frozen !== null}
        spellCheck={false}
        title={props.frozen ?? 'the skill’s body, below the closing fence'}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="skill-editor__bar">
        <button
          type="button"
          className="pf__verb pf__verb--primary"
          data-skill-edit-save
          disabled={saveReason !== null}
          title={saveReason ?? `Save ${sourcePath}`}
          onMouseDown={stop(save)}
        >
          Save
        </button>
        {result !== null && (
          <span className="skill-editor__result" data-skill-edit-result={result.kind}>
            {result.kind === 'written' ? 'saved'
              : result.kind === 'refused' ? result.why
                : result.kind === 'failed' ? `the write failed — ${result.why}`
                  : result.kind}
          </span>
        )}
      </div>
      {/* Spec §5.5, said on screen rather than left to be discovered: undo
          does not reach a file, and a delete goes to the trash so the Finder
          is the way back. */}
      <p className="skill-editor__note" data-skill-edit-note>
        A save is not undo history — Cmd+Z will not bring the old file back. Deleting a skill moves its folder to the Trash, which is where a save you regret has to be recovered from.
      </p>
    </div>
  )
}

/**
 * The draft's three fields, taken from the SAME small grammar the writer
 * preserves — never a YAML parser, which would be the differential this
 * milestone's whole design refuses.
 */
function splitDraft(text: string): { name: string; description: string; body: string } {
  const lines = text.split('\n')
  if (lines[0]?.trim() !== '---') return { name: '', description: '', body: text }
  let close = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      close = i
      break
    }
  }
  if (close === -1) return { name: '', description: '', body: text }
  const field = (key: string): string => {
    for (let i = 1; i < close; i++) {
      const m = KEY_LINE.exec(lines[i])
      if (m !== null && m[1] === key) return frontmatterValue(m[2])
    }
    return ''
  }
  // The leading blank line the fence is followed by is chrome, not content:
  // keeping it would grow the file by one line on every save round trip.
  const body = lines.slice(close + 1).join('\n').replace(/^\n/, '')
  return { name: field('name'), description: field('description'), body }
}
