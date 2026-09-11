import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type JSX } from 'react'
import { createPortal } from 'react-dom'
import { splitDeck, deckSummary, deckChanges, isRemoteImage, type DeckView, type SlideItem } from '@shared/deck'
import { createDeckSession } from '@shared/deck-session'
import { draftState } from '@shared/draft-review'
import { hashText } from '@shared/deck'
import type { ImageResult } from '@shared/starter'
import type { CreationResult } from '@shared/verb-table'
import { PanelFrame } from '@renderer/components/PanelFrame'
import { applyFileResult, useFileResult } from '@renderer/session/file-store'
import { Markdown } from '@renderer/chat/Markdown'
import { registerDeck, type DeckController } from './deck-controllers'
import type { FileNodeProps } from './FileNode'

/*
 * M248. A deck: a Markdown file read as slides. The session (deck-session.ts)
 * owns the file; this component owns nothing but what is on screen, so a tier
 * change that unmounts it loses a half-typed edit and never a write.
 *
 * Layers (product-rules' four): at REST the current slide and, in the header,
 * "slide N of M" — the fact the body does not carry, so a deck keeps its
 * header under the M236 frame rule — plus "N slide changes" only above zero.
 * CONTEXTUAL: the filmstrip, absolutely positioned over the body's bottom at
 * opacity 0 → 1 on hover/focus, so it never changes the body's box.
 */

// One read per picture per session of the app, not one per thumbnail: the card,
// the filmstrip and the presenter would each ask for the same file.
const images = new Map<string, Promise<ImageResult>>()
function readImageOnce(path: string): Promise<ImageResult> {
  let hit = images.get(path)
  if (!hit) {
    if (images.size > 64) images.delete(images.keys().next().value as string)
    hit = window.canvas.image.read(path)
    images.set(path, hit)
    // Only a PICTURE is remembered: an agent writes `![](chart.png)` before it
    // makes chart.png, and a cached "missing" would say so until a relaunch.
    void hit.then((r) => { if (r.kind !== 'data' && images.get(path) === hit) images.delete(path) }, () => { images.delete(path) })
  }
  return hit
}

function SlideImage({ alt, src, dir }: { alt: string; src: string; dir: string }): JSX.Element {
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'data'; url: string } | { kind: 'missing'; why: string }>({ kind: 'loading' })
  useEffect(() => {
    // Never fetched: the renderer's CSP refuses a remote asset anyway, and a
    // broken-image glyph would say "missing" when the truth is "not asked for".
    if (isRemoteImage(src)) { setState({ kind: 'missing', why: 'remote image not loaded' }); return }
    if (/^[a-z][a-z0-9+.-]*:/i.test(src)) { setState({ kind: 'missing', why: 'only a picture beside the deck, or an absolute path, is shown' }); return }
    const abs = src.startsWith('/') ? src : `${dir}/${src.replace(/^\.\//, '')}`
    let live = true
    void readImageOnce(abs).then((r) => {
      if (!live) return
      setState(r.kind === 'data' ? { kind: 'data', url: r.dataUrl } : { kind: 'missing', why: r.kind === 'missing' ? 'image not found' : r.kind === 'too-large' ? 'image too large to show' : 'not a picture' })
    })
    return () => { live = false }
  }, [src, dir])
  if (state.kind === 'data') return <img className="deck__img" alt={alt} src={state.url} draggable={false} />
  return <p className="deck__img-missing" data-deck-image-missing>{state.kind === 'loading' ? '…' : `${state.why} — ${alt || src}`}</p>
}

function Slide({ body, dir, index, className = '' }: { body: string; dir: string; index: number; className?: string }): JSX.Element {
  const image = useMemo(() => (alt: string, src: string) => <SlideImage alt={alt} src={src} dir={dir} />, [dir])
  return <div className={`deck__slide ${className}`} data-deck-slide={index}><Markdown text={body} slides image={image} /></div>
}

const sideWord = (item: SlideItem): string => item.old && item.new ? 'changed' : item.new ? 'added' : 'removed'

export function DeckNode(props: FileNodeProps & { onView: (id: string, view: DeckView) => void }): JSX.Element {
  const { panel, onView, readOnly = false } = props
  const id = panel.rect.id, path = panel.source.path
  const dir = path.slice(0, path.lastIndexOf('/')) || '/'
  const name = path.split('/').pop() ?? 'deck.md'
  const viewRef = useRef(onView); viewRef.current = onView
  const alive = useRef(true)
  const readOnlyRef = useRef(readOnly); readOnlyRef.current = readOnly
  const session = useMemo(() => createDeckSession(panel.source.deck ?? {}, {
    name,
    read: () => window.canvas.file.read({ panelId: id, path }),
    write: (content, baseMtimeMs) => window.canvas.file.write({ path, content, baseMtimeMs }),
    // NOT alive-gated: a door's proposal adopted after an unmount (a close or a
    // workspace switch mid-await) must still reach the panel record, or the
    // agent is told "proposed" and the draft is gone. setDeckView is a
    // setPanels updater, so a panel that no longer exists is simply not matched.
    changed: (view) => { viewRef.current(id, view) }
  }), [id, path, name])
  const state = useSyncExternalStore(session.subscribe, session.snapshot, session.snapshot)
  const observed = useFileResult(id)
  const disk = state.disk
  const text = disk?.kind === 'text' ? disk.content : ''
  const draft = state.view.draft
  const review = disk?.kind === 'text' ? draftState(draft, hashText(disk.content), undefined) : 'none'
  // The DISK is the deck: the card, the header, Present and every slide number
  // read the file, as the PDF does. A proposal is shown only as a proposal —
  // marked on the filmstrip and previewed inside the review (the critic: an
  // agent's unkept slides were being presented as the deck).
  const doc = useMemo(() => splitDeck(text), [text])
  const current = Math.min(state.view.slide ?? 0, doc.slides.length - 1)
  const changed = useMemo(() => new Set((review === 'pending' ? draft?.items ?? [] : []).filter((i) => i.old).map((i) => i.old!.index)), [review, draft])
  const [previewing, setPreviewing] = useState<string | null>(null)
  const preview = review === 'pending' ? draft?.items.find((i) => i.id === previewing) : undefined
  const [message, setMessage] = useState('')
  const [editing, setEditing] = useState<{ base: string; text: string } | null>(null)
  const [caret, setCaret] = useState(0)
  const [presenting, setPresenting] = useState(false)
  const [notesOpen, setNotesOpen] = useState(true)
  const body = useRef<HTMLDivElement>(null), source = useRef<HTMLTextAreaElement>(null), stage = useRef<HTMLDivElement>(null)

  useEffect(() => {
    alive.current = true
    void session.refresh()
    return () => { alive.current = false; void window.canvas.file.close(id) }
  }, [session, id])
  useEffect(() => { if (observed) session.observe(observed) }, [session, observed])
  useEffect(() => { if (state.disk) applyFileResult(id, state.disk) }, [id, state.disk])

  const report = (result: CreationResult): CreationResult => { if (alive.current) setMessage(result.kind === 'refused' ? result.reason : result.note ?? ''); return result }
  const outcome = (ok: boolean, note?: string): CreationResult => ok ? { kind: 'ran', ...(note ? { note } : {}) } : { kind: 'refused', reason: session.snapshot().error ?? 'the deck is busy' }
  const go = (n: number): void => session.setSlide(Math.max(0, Math.min(doc.slides.length - 1, n)))

  const controller = useMemo<DeckController>(() => ({
    edit: async (slide, value, origin) => {
      if (readOnlyRef.current) return { kind: 'refused', reason: 'leave merged view to edit or propose into this deck' }
      return outcome(await session.editSlide(slide, value, origin), origin === 'door' ? `proposed slide ${slide} for review on ${name}` : undefined)
    },
    write: async (value, origin) => {
      if (readOnlyRef.current) return { kind: 'refused', reason: 'leave merged view to edit or propose into this deck' }
      return outcome(await session.writeDeck(value, origin), origin === 'door' ? `proposed a new ${name} for review` : undefined)
    },
    review: async (action, ids, origin) => {
      if (action !== 'keep' && action !== 'discard') return { kind: 'refused', reason: 'use keep or discard, then slide numbers or all' }
      // Keeping writes a proposal into the file. That is the review, and a
      // review is a person's: an agent may withdraw its proposal, never accept it.
      if (action === 'keep' && origin === 'door') return { kind: 'refused', reason: `a proposal to ${name} is kept by a person, on the deck — an agent or workflow may only discard it` }
      if (readOnlyRef.current) return { kind: 'refused', reason: 'leave merged view to review this deck' }
      return outcome(await session.review(action, ids))
    },
    // A full-window overlay takes the keyboard off whatever the person is typing
    // into; only the person opens it (the critic: an agent line could).
    present: async (origin) => {
      if (origin === 'door') return { kind: 'refused', reason: `presenting ${name} takes the whole window — a person starts it, on the deck or from the palette` }
      setPresenting(true); return { kind: 'ran' }
    },
    exportPdf: async () => {
      const result = await window.canvas.export.deckPdf({ path })
      if (result.kind === 'written') return { kind: 'ran', note: `${result.pages} page${result.pages === 1 ? '' : 's'} to ${result.path}${result.redacted ? ` · ${result.redacted} secret${result.redacted === 1 ? '' : 's'} redacted` : ''}` }
      return { kind: 'refused', reason: result.kind === 'cancelled' ? 'export cancelled' : result.reason }
    }
  }), [session, name, path])
  useEffect(() => registerDeck(id, controller), [id, controller])

  // The editor is a text surface: Cmd+V/C/Z arrive as main's edit:* events and
  // would otherwise reach a focused terminal (CLAUDE.md's gotcha). execCommand
  // keeps the textarea's own undo stack, which setRangeText would not.
  useEffect(() => {
    const inSource = (): boolean => source.current !== null && document.activeElement === source.current
    const offPaste = window.canvas.edit.onPaste((clip) => { if (inSource()) document.execCommand('insertText', false, clip) })
    const offCopy = window.canvas.edit.onCopy(() => {
      const el = source.current
      if (el && inSource()) void navigator.clipboard.writeText(el.value.slice(el.selectionStart, el.selectionEnd))
    })
    const offUndo = window.canvas.edit.onUndo(() => { if (inSource()) document.execCommand('undo') })
    const offRedo = window.canvas.edit.onRedo(() => { if (inSource()) document.execCommand('redo') })
    return () => { offPaste(); offCopy(); offUndo(); offRedo() }
  }, [])

  const insertImage = async (): Promise<void> => {
    const chosen = await window.canvas.asset.choose()
    if (!chosen) return
    const stored = await window.canvas.asset.put({ path: chosen })
    if (stored.kind !== 'stored') { setMessage(stored.reason); return }
    const el = source.current
    if (!el) return
    el.focus()
    // An image is a BLOCK only on a line of its own (IMAGE_LINE); mid-line it
    // would render as empty alt text on the card and in the PDF.
    const before = el.value.slice(0, el.selectionStart), after = el.value.slice(el.selectionEnd)
    const lead = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
    const tail = after.startsWith('\n') ? '' : '\n'
    document.execCommand('insertText', false, `${lead}![](<${stored.path}>)${tail}`)
  }
  const editSlide = editing ? splitDeck(editing.text).slides.findIndex((s) => caret <= s.sepEnd) : -1

  const summary = disk?.kind === 'text' ? deckSummary(text, { slide: current }) : ''
  const changes = review === 'pending' ? deckChanges(state.view) : review === 'conflict' ? 'proposal out of date' : ''
  const unavailable = disk === undefined ? 'Reading deck…' : disk.kind !== 'text' ? (disk.kind === 'unreadable' ? disk.detail : `File ${disk.kind} — restore the Markdown file, then refresh.`) : disk.truncatedLines > 0 ? 'This file is too long to show as slides.' : null
  const editable = !readOnly && !state.busy && disk?.kind === 'text' && disk.truncatedLines === 0

  return <PanelFrame id={id} kind="file" kindWord="deck" rect={panel.rect} z={panel.z} selected={props.selected}
    className="deck-node" rootAttrs={{ 'data-deck': '' }} title={panel.title ?? name}
    readOnly={readOnly} linkTarget={props.linkTarget} onSelect={props.onSelect} onBeginDrag={props.onBeginDrag} onBeginLink={props.onBeginLink}
    close={readOnly ? null : { armed: false, armedText: 'close?', title: 'Close deck', onMouseDown: (e) => { e.stopPropagation(); e.preventDefault(); props.onClose(id) } }}
    chrome={<>
      <span className="pf__summary" data-deck-summary>{summary}{changes && <span data-deck-changes>{` · ${changes}`}</span>}</span>
      <button type="button" className="pf__verb" disabled={!editable || editing !== null} title={editable ? 'Edit the Markdown' : 'the deck cannot be edited now'}
        onMouseDown={(e) => e.stopPropagation()} onClick={() => setEditing({ base: text, text })}>Edit</button>
      <button type="button" className="pf__verb" disabled={unavailable !== null} title="Present full-window" onMouseDown={(e) => e.stopPropagation()} onClick={() => setPresenting(true)}>Present</button>
      <button type="button" className="pf__verb" disabled={unavailable !== null} title="Export to PDF, one page per slide" onMouseDown={(e) => e.stopPropagation()}
        onClick={() => { void controller.exportPdf().then(report) }}>PDF</button>
    </>}>
    <div ref={body} className="deck-node__body" data-deck-body tabIndex={0}
      onMouseDown={(e) => { e.stopPropagation(); props.onFocus(id) }}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (editing || e.target !== body.current) return
        if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); go(current + 1) }
        if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(current - 1) }
      }}>
      {unavailable !== null ? <p className="deck-node__note" role="status">{unavailable}</p> : editing ? (
        <div className="deck-node__edit">
          <textarea ref={source} className="deck-node__source" aria-label="Deck Markdown" value={editing.text} spellCheck={false}
            onChange={(e) => { const value = e.target.value; setEditing((was) => was && { ...was, text: value }) }} onSelect={(e) => setCaret(e.currentTarget.selectionStart)} />
          <div className="deck-node__preview">
            <Slide body={splitDeck(editing.text).slides[Math.max(0, editSlide)]?.body ?? ''} dir={dir} index={Math.max(0, editSlide)} />
          </div>
          <div className="deck-node__tools">
            <button type="button" disabled={state.busy || editing.text === editing.base} onClick={() => {
              void session.save(editing.text, editing.base).then((ok) => { if (ok && alive.current) { setEditing(null); setMessage('') } })
            }}>Save</button>
            <button type="button" onClick={() => { setEditing(null); setMessage('') }}>Cancel</button>
            <button type="button" disabled={state.busy} onClick={() => { void insertImage() }}>Insert image…</button>
          </div>
        </div>
      ) : <>
        <div ref={stage} className="deck-node__stage">
          {doc.slides[current] && <Slide body={doc.slides[current].body} dir={dir} index={current} className={changed.has(current) ? 'deck__slide--changed' : ''} />}
        </div>
        {review !== 'none' && draft && <section className="deck-node__review" data-deck-review={review}>
          {review === 'conflict'
            ? <p>{name} changed on disk since the proposal — slide{draft.items.length === 1 ? '' : 's'} {draft.items.map((i) => i.id).join(', ')} can no longer be kept. Discard it and ask again.</p>
            : <p>{draft.by ? `${draft.by} proposed` : 'Proposed'} {deckChanges(state.view)}.</p>}
          {review === 'pending' && <ul>{draft.items.map((item) => <li key={item.id} data-deck-item={item.id}>
            <button type="button" className="deck-node__jump" aria-pressed={previewing === item.id} onClick={() => { setPreviewing(previewing === item.id ? null : item.id); if (item.old) go(item.old.index) }}>Slide {item.id.replace(/^r/, '')} {sideWord(item)}</button>
            <button type="button" disabled={readOnly || state.busy} onClick={() => { void controller.review('keep', [item.id], 'person').then(report) }}>Keep</button>
            <button type="button" disabled={readOnly || state.busy} onClick={() => { void controller.review('discard', [item.id], 'person').then(report) }}>Discard</button>
          </li>)}</ul>}
          {preview && <div className="deck-node__proposed" data-deck-proposed={preview.id}>
            {preview.new ? <Slide body={preview.new.text.replace(/<!--[\s\S]*?-->/g, '')} dir={dir} index={preview.new.index} className="deck__slide--changed" /> : <p>Slide {preview.id.slice(1)} would be removed.</p>}
          </div>}
          <div className="deck-node__tools">
            {review === 'pending' && <button type="button" disabled={readOnly || state.busy} onClick={() => { void controller.review('keep', 'all', 'person').then(report) }}>Keep all</button>}
            <button type="button" disabled={readOnly || state.busy} onClick={() => { void controller.review('discard', 'all', 'person').then(report) }}>Discard all</button>
          </div>
        </section>}
        <nav className="deck-node__strip" aria-label="Slides">
          {doc.slides.map((slide) => <button type="button" key={slide.index} className="deck-node__thumb" aria-label={`Slide ${slide.index + 1}${changed.has(slide.index) ? ', proposed change' : ''}`}
            aria-current={slide.index === current ? 'true' : undefined} data-deck-changed={changed.has(slide.index) ? '' : undefined} onClick={() => go(slide.index)}>
            <Slide body={slide.body} dir={dir} index={slide.index} />
          </button>)}
        </nav>
      </>}
      {(message || state.error) && <p className="deck-node__note" role="status">{message || state.error}</p>}
    </div>
    {presenting && doc.slides.length > 0 && <Presenter slides={doc.slides.map((s) => ({ body: s.body, notes: s.notes }))} dir={dir} start={current}
      notesOpen={notesOpen} onNotes={setNotesOpen} onGo={go} onClose={() => { setPresenting(false); body.current?.focus() }} />}
  </PanelFrame>
}

/**
 * A fixed, full-window overlay PORTALLED to body: it never resizes a panel
 * (a panel that grew to present would reflow the canvas under it). Keys are
 * captured only while it has focus, and stopped here so the canvas sees none.
 */
function Presenter({ slides, dir, start, notesOpen, onNotes, onGo, onClose }: {
  slides: { body: string; notes: string[] }[]; dir: string; start: number; notesOpen: boolean
  onNotes: (open: boolean) => void; onGo: (n: number) => void; onClose: () => void
}): JSX.Element {
  const [want, setAt] = useState(start)
  // Clamped on READ: the file can shrink under a running presentation (an
  // agent's kept removal, an edit on disk), and slides[5] of four is a throw.
  const at = Math.max(0, Math.min(want, slides.length - 1))
  const root = useRef<HTMLDivElement>(null)
  const goRef = useRef(onGo); goRef.current = onGo
  useEffect(() => { root.current?.focus() }, [])
  useEffect(() => { goRef.current(at) }, [at])
  const move = (n: number): void => setAt(Math.max(0, Math.min(slides.length - 1, n)))
  const close = (): void => { if (document.fullscreenElement) void document.exitFullscreen(); onClose() }
  const slide = slides[at]
  return createPortal(<div ref={root} className="deck-presenter" data-deck-presenter role="dialog" aria-label={`Presenting slide ${at + 1} of ${slides.length}`} tabIndex={-1}
    onKeyDown={(e) => {
      e.stopPropagation()
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); move(at + 1) }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); move(at - 1) }
      else if (e.key === 'Escape') { e.preventDefault(); close() }
      else if (e.key === 'n') onNotes(!notesOpen)
    }} onMouseDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
    <div className="deck-presenter__stage"><Slide body={slide.body} dir={dir} index={at} /></div>
    {notesOpen && <aside className="deck-presenter__notes" aria-label="Speaker notes">{slide.notes.length ? slide.notes.join('\n\n') : 'No notes for this slide.'}</aside>}
    <div className="deck-presenter__bar">
      <span>{at + 1} / {slides.length}</span>
      <button type="button" onClick={() => move(at - 1)} disabled={at === 0}>Previous</button>
      <button type="button" onClick={() => move(at + 1)} disabled={at === slides.length - 1}>Next</button>
      <button type="button" onClick={() => onNotes(!notesOpen)}>{notesOpen ? 'Hide notes' : 'Show notes'}</button>
      <button type="button" onClick={() => { void document.documentElement.requestFullscreen?.().catch(() => {}) }}>Full screen</button>
      <button type="button" onClick={close}>Close</button>
    </div>
  </div>, document.body)
}
