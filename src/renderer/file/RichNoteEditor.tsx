import { useEffect, useMemo, useRef, useState, type HTMLAttributes, type JSX, type MutableRefObject } from 'react'
import {
  blockRefusal, editBlock, insertBlockAfter, mdImageDestination, parseBlocks, removeBlock, renderBlock, replaceBlockSource,
  type BlockEdit, type ListItemModel, type MdBlock
} from '@shared/md-blocks'
import { parseInline, type Inline } from '@shared/markdown'
import { Close } from '@renderer/icons'

/**
 * M250. The RICH mode of a note's editor — a view over FileNode's own draft
 * string, never a second author of the file.
 *
 * Everything here goes through `shared/md-blocks.ts`: the note is blocks with
 * source spans, an edit replaces ONE block's bytes, and an edit whose bytes
 * would not read back as the same block is refused with its reason (then the
 * block opens as SOURCE holding exactly what was typed — nothing typed is
 * lost, and nothing is silently rewritten). FileNode keeps the draft, the
 * dirty marker, ⌘S, the conflict banner and the compare-and-swap write; this
 * only calls `onChange` with a new draft, so a save from Rich is byte-for-byte
 * the save a person would have typed in Source.
 *
 * One block is edited at a time ("active"). Its uncommitted state is held by
 * the block's own editor and surfaced through `pendingRef`, so FileNode's Save
 * (a mousedown that never moves focus) can FLUSH it through `handleRef` —
 * otherwise the last paragraph typed would be missing from the save.
 *
 * Keyboard and clipboard: every key stops at FileNode's body; the ⌘V/⌘C/⌘Z
 * the menu turns into `edit:*` events are subscribed HERE and act only while
 * this editor holds `activeElement` — `noteEditorFocused()` keeps Canvas from
 * routing them to the focused terminal (ChecklistNode's shape).
 */

/** Three states, not two: nothing to commit and a commit both answer `ok`; a refused edit stops the caller. */
export type FlushResult = { kind: 'ok'; text: string } | { kind: 'refused'; reason: string }
export interface RichNoteHandle {
  /**
   * Commit the active block's typing (if any). `refused` means the block has
   * reopened as SOURCE holding what was typed — the caller must not save or
   * unmount this editor, or that typing is lost unseen.
   */
  flush(): FlushResult
}

interface Pending { index: number; source: string; edit: (text: string) => BlockEdit | null; attempt?: string }
type Active = { index: number; mode: 'rich' } | { index: number; mode: 'source'; seed?: string }

// React's typings lag the attribute; Chromium has had it for years.
const PLAINTEXT = { contentEditable: 'plaintext-only' } as unknown as HTMLAttributes<HTMLDivElement>

function InlineView({ runs }: { runs: Inline[] }): JSX.Element {
  return <>{runs.map((r, k) => {
    switch (r.kind) {
      case 'text': return <span key={k}>{r.text}</span>
      case 'code': return <code key={k}>{r.text}</code>
      case 'bold': return <strong key={k}><InlineView runs={r.children} /></strong>
      case 'italic': return <em key={k}><InlineView runs={r.children} /></em>
      // A link is shown, never followed from here: a click edits the block.
      case 'link': return <span key={k} className="rich-note__link" title={r.href}>{r.text}</span>
    }
  })}</>
}

function ImagePreview({ src, alt }: { src: string; alt: string }): JSX.Element {
  const [url, setUrl] = useState<string | null>(null)
  const [note, setNote] = useState<string>('')
  useEffect(() => {
    let live = true
    // Only an ABSOLUTE local path is read (image:read, main, by magic number);
    // a remote source is never fetched — the renderer's CSP and the brief.
    if (/^https?:/i.test(src)) { setNote('remote image not loaded'); return }
    if (!src.startsWith('/')) { setNote(`image at ${src}`); return }
    void window.canvas.image.read(src).then((r) => {
      if (!live) return
      if (r.kind === 'data') setUrl(r.dataUrl)
      else setNote(r.kind === 'missing' ? `image missing: ${src}` : `image not shown (${r.kind})`)
    }).catch(() => { if (live) setNote(`image not shown: ${src}`) })
    return () => { live = false }
  }, [src])
  return url !== null ? <img className="rich-note__img" src={url} alt={alt} /> : <span className="pf__note">{note}</span>
}

function caretToEnd(el: HTMLElement): void {
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(false)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

/** Selection offsets inside a plaintext contentEditable, as offsets into its text. */
function selectionIn(el: HTMLElement): { start: number; end: number } | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) return null
  const range = sel.getRangeAt(0)
  const pre = range.cloneRange()
  pre.selectNodeContents(el)
  pre.setEnd(range.startContainer, range.startOffset)
  const start = pre.toString().length
  return { start, end: start + range.toString().length }
}

export function RichNoteEditor({ text, onChange, handleRef, onSave, onEscape }: {
  text: string
  onChange: (text: string) => void
  handleRef: MutableRefObject<RichNoteHandle | null>
  onSave: () => void
  onEscape: () => void
}): JSX.Element {
  const blocks = useMemo(() => parseBlocks(text), [text])
  const [active, setActive] = useState<Active | null>(null)
  const [message, setMessage] = useState('')
  const [link, setLink] = useState<{ index: number; start: number; end: number; url: string } | null>(null)
  const [, setVersion] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const textRef = useRef(text); textRef.current = text
  const pendingRef = useRef<Pending | null>(null)
  const activeTextRef = useRef<HTMLDivElement | null>(null)
  // History of DRAFT strings — the editor's own, separate from canvas history
  // (the checklist session's rule). Reset when the draft changes from outside
  // (Source typing, a reseed), because an undo target from before that change
  // would silently revert it.
  const past = useRef<string[]>([]), future = useRef<string[]>([]), own = useRef(text)
  useEffect(() => {
    if (text !== own.current) { past.current = []; future.current = []; own.current = text; setVersion((v) => v + 1) }
  }, [text])

  const commit = (next: string): void => {
    if (next === textRef.current) return
    past.current.push(textRef.current); if (past.current.length > 100) past.current.shift()
    future.current = []
    own.current = next; textRef.current = next
    setMessage('')
    onChange(next)
  }
  const apply = (result: BlockEdit | null): boolean => {
    if (result === null) return true
    if (result.kind === 'refused') { setMessage(result.reason); return false }
    commit(result.text)
    return true
  }
  /** Commit whatever the active block holds and close it. Answers the resulting draft. */
  const finish = (): FlushResult => {
    const p = pendingRef.current
    pendingRef.current = null
    activeTextRef.current = null
    setActive(null)
    if (p === null) return { kind: 'ok', text: textRef.current }
    // The note moved under the edit (a reseed from disk): refuse rather than
    // write this block's typing over a different block.
    const current = parseBlocks(textRef.current)[p.index]
    const result = current?.source !== p.source ? { kind: 'refused' as const, reason: 'the note changed while you were editing — look again' } : p.edit(textRef.current)
    if (result !== null && result.kind === 'refused') {
      setMessage(result.reason)
      // Reopen as SOURCE with what was typed, so nothing is lost: a person's
      // own bytes in the source box are written exactly. (If the block itself
      // is gone, the typing is still shown — in the message, not silently dropped.)
      if (current !== undefined && current.kind !== 'blank') setActive({ index: p.index, mode: 'source', ...(p.attempt === undefined ? {} : { seed: p.attempt }) })
      else if (p.attempt !== undefined) setMessage(`${result.reason}. What you typed: ${p.attempt}`)
      return { kind: 'refused', reason: result.reason }
    }
    apply(result)
    return { kind: 'ok', text: textRef.current }
  }
  handleRef.current = { flush: finish }
  const cancel = (): void => { pendingRef.current = null; activeTextRef.current = null; setActive(null) }
  const undo = (): void => {
    // ⌘Z while a block holds uncommitted typing undoes THAT typing (the block
    // closes back to what it was) and nothing more. Native undo never runs —
    // the menu turns ⌘Z into edit:undo — so popping history here would throw
    // the typing away AND revert the previous commit.
    const p = pendingRef.current
    if (p !== null && p.edit(textRef.current) !== null) { cancel(); return }
    cancel()
    const target = past.current.pop()
    if (target === undefined) return
    future.current.push(textRef.current); own.current = target; textRef.current = target; setVersion((v) => v + 1); onChange(target)
  }
  const redo = (): void => {
    cancel()
    const target = future.current.pop()
    if (target === undefined) return
    past.current.push(textRef.current); own.current = target; textRef.current = target; setVersion((v) => v + 1); onChange(target)
  }
  const undoRef = useRef(undo); undoRef.current = undo
  const redoRef = useRef(redo); redoRef.current = redo

  useEffect(() => {
    const inside = (): boolean => root.current?.contains(document.activeElement) === true
    const offPaste = window.canvas.edit.onPaste((clip) => { if (inside()) document.execCommand('insertText', false, clip) })
    const offCopy = window.canvas.edit.onCopy(() => {
      if (!inside()) return
      const el = document.activeElement
      const chosen = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
        ? el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0) : window.getSelection()?.toString() ?? ''
      if (chosen !== '') void navigator.clipboard.writeText(chosen)
    })
    const offUndo = window.canvas.edit.onUndo(() => { if (inside()) undoRef.current() })
    const offRedo = window.canvas.edit.onRedo(() => { if (inside()) redoRef.current() })
    return () => { offPaste(); offCopy(); offUndo(); offRedo() }
  }, [])

  const open = (target: number): void => {
    let index = target
    if (active !== null) {
      const before = blocks.length, was = active.index
      // A refused edit has reopened its own block — opening another would bury it.
      if (finish().kind === 'refused') return
      // The finished edit may have split its block (a source edit with a blank
      // line), so an index from the previous render is shifted past it.
      if (index > was) index += parseBlocks(textRef.current).length - before
    }
    const block = parseBlocks(textRef.current)[index]
    if (block === undefined || block.kind === 'blank') return
    const refusal = blockRefusal(block)
    if (block.kind !== 'raw' && refusal !== undefined) setMessage(refusal)
    setActive(refusal === undefined ? { index, mode: 'rich' } : { index, mode: 'source' })
  }
  const anchor = (): number => active?.index ?? blocks.length - 1
  const addParagraph = (): void => {
    const at = anchor()
    if (finish().kind === 'refused') return
    const result = insertBlockAfter(textRef.current, Math.min(at, parseBlocks(textRef.current).length - 1), 'New paragraph')
    if (apply(result) && result.kind === 'edited') {
      const next = parseBlocks(result.text).findIndex((b, k) => k > at && b.kind === 'paragraph')
      if (next !== -1) setActive({ index: next, mode: 'rich' })
    }
  }
  const insertImage = async (): Promise<void> => {
    const at = anchor()
    if (finish().kind === 'refused') return
    const chosen = await window.canvas.asset.choose()
    if (chosen === null) return
    const stored = await window.canvas.asset.put({ path: chosen })
    if (stored.kind === 'refused') { setMessage(stored.reason); return }
    apply(insertBlockAfter(textRef.current, Math.min(at, parseBlocks(textRef.current).length - 1), `![](${mdImageDestination(stored.path)})`))
  }
  const beginLink = (): void => {
    const el = activeTextRef.current
    if (active === null || el === null) return
    const sel = selectionIn(el) ?? { start: (el.textContent ?? '').length, end: (el.textContent ?? '').length }
    setLink({ index: active.index, ...sel, url: '' })
  }
  const applyLink = (): void => {
    if (link === null) return
    const current = textRef.current
    const block = parseBlocks(current)[link.index]
    setLink(null)
    if (block === undefined || (block.kind !== 'paragraph' && block.kind !== 'heading')) { setMessage('the block for that link is gone — look again'); return }
    const t = block.model.text
    const label = t.slice(link.start, link.end) || 'link'
    const next = `${t.slice(0, link.start)}[${label}](${mdImageDestination(link.url.trim())})${t.slice(link.end)}`
    apply(editBlock(current, link.index, { ...block.model, text: next }))
  }

  const register = (p: Pending | null): void => { pendingRef.current = p }
  const canLink = active !== null && active.mode === 'rich' && (blocks[active.index]?.kind === 'paragraph' || blocks[active.index]?.kind === 'heading')

  return <div ref={root} className="rich-note" data-rich-note onKeyDown={(e) => {
    if (e.metaKey && e.key === 's') { e.preventDefault(); onSave(); return }
    if (e.key === 'Escape') { e.preventDefault(); if (active !== null) cancel(); else if (link !== null) setLink(null); else onEscape() }
  }}>
    <div className="rich-note__tools" role="toolbar" aria-label="Rich note tools">
      <button type="button" disabled={!canLink} title={canLink ? 'Link the selected text' : 'place the caret in a paragraph or heading first'} data-rich-note-tool="link"
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); if (canLink) beginLink() }}>Link</button>
      <button type="button" title="Insert a picture after this block — kept in this app's pictures" data-rich-note-tool="image"
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); void insertImage() }}>Image</button>
      <button type="button" title="Add a paragraph after this block" data-rich-note-tool="paragraph"
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); addParagraph() }}>Paragraph</button>
      <button type="button" disabled={past.current.length === 0} title={past.current.length ? 'Undo (⌘Z)' : 'nothing to undo'} data-rich-note-tool="undo"
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); undo() }}>Undo</button>
      <button type="button" disabled={future.current.length === 0} title={future.current.length ? 'Redo (⇧⌘Z)' : 'nothing to redo'} data-rich-note-tool="redo"
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); redo() }}>Redo</button>
      {link !== null && <form className="rich-note__link-form" onSubmit={(e) => { e.preventDefault(); if (link.url.trim()) applyLink() }}>
        <input autoFocus aria-label="Link address" placeholder="https://…" value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} />
        <button type="submit" disabled={!link.url.trim()} title={link.url.trim() ? 'Add the link' : 'type an address first'}>Add link</button>
      </form>}
    </div>
    {message !== '' && <p className="pf__note rich-note__message" role="status" data-rich-note-message>{message}</p>}
    {blocks.length === 0 && <p className="pf__note">An empty note — add a paragraph to begin.</p>}
    {blocks.map((block, index) => {
      if (block.kind === 'blank') return null
      if (active?.index === index) {
        return <div key={`${index}:${block.start}`} className="rich-note__block rich-note__block--active" data-rich-note-block={block.kind}
          onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) finish() }}>
          {active.mode === 'source'
            ? <SourceEditor block={block} index={index} seed={active.seed} register={register} onDone={finish} />
            : <BlockEditor block={block} index={index} register={register} onDone={finish} textRef={activeTextRef} />}
        </div>
      }
      const rawName = block.kind === 'raw' ? block.name : undefined
      const refusal = rawName === undefined ? undefined : `${rawName} — edit as source`
      return <div key={`${index}:${block.start}`} className={`rich-note__block${block.kind === 'raw' ? ' rich-note__block--raw' : ''}`} data-rich-note-block={block.kind}
        tabIndex={0} title={refusal ?? 'Click to edit'} onClick={() => open(index)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); open(index) } }}>
        <RestBlock block={block} />
        {refusal !== undefined && <span className="rich-note__badge" data-rich-note-raw={rawName}>{refusal}</span>}
        <button type="button" className="rich-note__remove" aria-label="Remove this block" title="Remove this block"
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }} onClick={(e) => { e.stopPropagation(); if (active === null) apply(removeBlock(textRef.current, index)) }}><Close /></button>
      </div>
    })}
  </div>
}

function RestBlock({ block }: { block: MdBlock }): JSX.Element | null {
  switch (block.kind) {
    case 'heading': return <div className={`rich-note__h rich-note__h${block.model.level}`}><InlineView runs={parseInline(block.model.text)} /></div>
    case 'paragraph': return <p className="rich-note__p"><InlineView runs={parseInline(block.model.text)} /></p>
    case 'list': {
      const items = block.model.items.map((it, k) => <li key={k}>{it.checked !== undefined && <input type="checkbox" checked={it.checked} readOnly tabIndex={-1} />}<InlineView runs={parseInline(it.text)} /></li>)
      return block.ordered ? <ol className="rich-note__list">{items}</ol> : <ul className="rich-note__list">{items}</ul>
    }
    case 'table': return <table className="rich-note__table"><thead><tr>{block.model.header.map((c, k) => <th key={k}><InlineView runs={parseInline(c)} /></th>)}</tr></thead>
      <tbody>{block.model.rows.map((r, k) => <tr key={k}>{r.map((c, x) => <td key={x}><InlineView runs={parseInline(c)} /></td>)}</tr>)}</tbody></table>
    case 'image': return <figure className="rich-note__figure"><ImagePreview src={block.model.src} alt={block.model.alt} />{block.model.alt && <figcaption>{block.model.alt}</figcaption>}</figure>
    case 'code': return <pre className="rich-note__code"><code>{block.model.body}</code></pre>
    case 'raw': return <pre className="rich-note__raw">{block.source}</pre>
    default: return null
  }
}

function SourceEditor({ block, index, seed, register, onDone }: { block: MdBlock; index: number; seed?: string; register: (p: Pending | null) => void; onDone: () => void }): JSX.Element {
  const [value, setValue] = useState(seed ?? block.source)
  const valueRef = useRef(value); valueRef.current = value
  useEffect(() => {
    register({ index, source: block.source, edit: (text) => valueRef.current === block.source ? null : replaceBlockSource(text, index, valueRef.current) })
    return () => register(null)
  }, [index, block.source])
  return <>
    <textarea className="rich-note__source" data-rich-note-source autoFocus spellCheck={false} value={value} rows={Math.min(16, Math.max(2, value.split('\n').length))} onChange={(e) => setValue(e.target.value)} />
    <DoneButton onDone={onDone} />
  </>
}

function DoneButton({ onDone }: { onDone: () => void }): JSX.Element {
  return <button type="button" className="rich-note__done" title="Keep this block's edit (Enter)" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onDone() }}>Done</button>
}

function EditableText({ value, onDone, textRef, multiline, label }: { value: string; onDone: () => void; textRef: MutableRefObject<HTMLDivElement | null>; multiline: boolean; label: string }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el === null) return
    // Uncontrolled on purpose: React re-rendering a contentEditable's children
    // mid-typing moves the caret. Seeded once; read on commit.
    el.textContent = value
    textRef.current = el
    el.focus()
    caretToEnd(el)
    return () => { if (textRef.current === el) textRef.current = null }
  }, [])
  return <div ref={ref} {...PLAINTEXT} role="textbox" aria-label={label} aria-multiline={multiline} className="rich-note__text" data-rich-note-text spellCheck
    onKeyDown={(e) => {
      if (e.key !== 'Enter') return
      e.preventDefault()
      // Shift+Enter is a soft line break inside a paragraph; Enter keeps the edit.
      if (multiline && e.shiftKey) document.execCommand('insertText', false, '\n')
      else onDone()
    }} />
}

function BlockEditor({ block, index, register, onDone, textRef }: { block: MdBlock; index: number; register: (p: Pending | null) => void; onDone: () => void; textRef: MutableRefObject<HTMLDivElement | null> }): JSX.Element | null {
  const [level, setLevel] = useState(block.kind === 'heading' ? block.model.level : 1)
  const [items, setItems] = useState<ListItemModel[]>(block.kind === 'list' ? block.model.items : [])
  const [grid, setGrid] = useState<{ header: string[]; rows: string[][] }>(block.kind === 'table' ? block.model : { header: [], rows: [] })
  const [image, setImage] = useState(block.kind === 'image' ? block.model : { alt: '', src: '' })
  const [code, setCode] = useState(block.kind === 'code' ? block.model : { lang: '', body: '' })
  const live = useRef({ level, items, grid, image, code }); live.current = { level, items, grid, image, code }
  useEffect(() => {
    const read = (): string => textRef.current?.textContent ?? ''
    register({
      index, source: block.source,
      edit: (text) => {
        const s = live.current
        switch (block.kind) {
          case 'heading': { const t = read(); return t === block.model.text && s.level === block.model.level ? null : editBlock(text, index, { level: s.level, text: t }) }
          case 'paragraph': { const t = read(); return t === block.model.text ? null : editBlock(text, index, { text: t }) }
          case 'list': return JSON.stringify(s.items) === JSON.stringify(block.model.items) ? null : editBlock(text, index, { items: s.items })
          case 'table': return JSON.stringify(s.grid) === JSON.stringify(block.model) ? null : editBlock(text, index, s.grid)
          case 'image': return JSON.stringify(s.image) === JSON.stringify(block.model) ? null : editBlock(text, index, s.image)
          case 'code': return JSON.stringify(s.code) === JSON.stringify(block.model) ? null : editBlock(text, index, s.code)
          default: return null
        }
      },
      // What was typed, as Markdown source — the refusal path reopens the block with it.
      get attempt() {
        const s = live.current
        switch (block.kind) {
          case 'paragraph': return renderBlock(block, { text: read() }, block.source)
          case 'heading': return renderBlock(block, { level: s.level, text: read() }, block.source)
          case 'list': return renderBlock(block, { items: s.items }, block.source)
          case 'table': return renderBlock(block, s.grid, block.source)
          case 'image': return renderBlock(block, s.image, block.source)
          case 'code': return renderBlock(block, s.code, block.source)
          default: return undefined
        }
      }
    })
    return () => register(null)
  }, [index, block.source])

  switch (block.kind) {
    case 'heading': return <>
      <select aria-label="Heading level" value={level} onChange={(e) => setLevel(Number(e.target.value))}>{[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{`H${n}`}</option>)}</select>
      <EditableText value={block.model.text} onDone={onDone} textRef={textRef} multiline={false} label="Heading text" />
      <DoneButton onDone={onDone} />
    </>
    case 'paragraph': return <>
      <EditableText value={block.model.text} onDone={onDone} textRef={textRef} multiline label="Paragraph text" />
      <DoneButton onDone={onDone} />
    </>
    case 'list': return <div className="rich-note__list-editor">
      {items.map((it, k) => <div key={k} className="rich-note__item">
        {it.checked !== undefined && <input type="checkbox" aria-label={`Item ${k + 1} done`} checked={it.checked} onChange={(e) => setItems(items.map((x, j) => j === k ? { ...x, checked: e.target.checked } : x))} />}
        <input aria-label={`Item ${k + 1}`} autoFocus={k === 0} value={it.text} onChange={(e) => setItems(items.map((x, j) => j === k ? { ...x, text: e.target.value } : x))}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onDone() } }} />
        <button type="button" disabled={items.length === 1} title={items.length === 1 ? 'a list keeps at least one item — remove the block instead' : 'Remove this item'} onClick={() => setItems(items.filter((_, j) => j !== k))}>Remove</button>
      </div>)}
      <button type="button" onClick={() => setItems([...items, { text: '', ...(items[items.length - 1]?.checked === undefined ? {} : { checked: false }) }])}>Add item</button>
      <DoneButton onDone={onDone} />
    </div>
    case 'table': return <div className="rich-note__grid-editor">
      <table className="rich-note__table"><thead><tr>{grid.header.map((c, x) => <th key={x}><input aria-label={`Header ${x + 1}`} autoFocus={x === 0} value={c} onChange={(e) => setGrid({ ...grid, header: grid.header.map((h, j) => j === x ? e.target.value : h) })} /></th>)}</tr></thead>
        <tbody>{grid.rows.map((r, y) => <tr key={y}>{r.map((c, x) => <td key={x}><input aria-label={`Row ${y + 1} column ${x + 1}`} value={c} onChange={(e) => setGrid({ ...grid, rows: grid.rows.map((row, j) => j === y ? row.map((v, i) => i === x ? e.target.value : v) : row) })} /></td>)}</tr>)}</tbody></table>
      <button type="button" onClick={() => setGrid({ ...grid, rows: [...grid.rows, grid.header.map(() => '')] })}>Add row</button>
      <button type="button" onClick={() => setGrid({ header: [...grid.header, ''], rows: grid.rows.map((r) => [...r, '']) })}>Add column</button>
      <DoneButton onDone={onDone} />
    </div>
    case 'image': return <div className="rich-note__image-editor">
      <input aria-label="Picture description" placeholder="description" autoFocus value={image.alt} onChange={(e) => setImage({ ...image, alt: e.target.value })} />
      <input aria-label="Picture path" value={image.src} onChange={(e) => setImage({ ...image, src: e.target.value })} />
      <DoneButton onDone={onDone} />
    </div>
    case 'code': return <div className="rich-note__code-editor">
      <input aria-label="Code language" placeholder="language" value={code.lang} onChange={(e) => setCode({ ...code, lang: e.target.value })} />
      <textarea className="rich-note__source" autoFocus spellCheck={false} aria-label="Code" value={code.body} rows={Math.min(16, Math.max(2, code.body.split('\n').length))} onChange={(e) => setCode({ ...code, body: e.target.value })} />
      <DoneButton onDone={onDone} />
    </div>
    default: return null
  }
}
