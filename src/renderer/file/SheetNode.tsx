import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type JSX, type MouseEvent as ReactMouseEvent } from 'react'
import { createSheetSession } from '@shared/sheet-session'
import { sheetFormat, sheetSummary, type SheetView } from '@shared/sheet'
import { createEvaluator, displayText, parseRef, refName, type CellRange, type Grid } from '@shared/sheet-formula'
import { clearRange, deleteCols, deleteRows, gridSize, insertCols, insertRows, pasteTsv, rangeToTsv } from '@shared/sheet-model'
import { colLeft, colWidth, visibleWindow } from '@shared/sheet-grid'
import { colName } from '@shared/sheet-formula'
import { contentHash, draftState } from '@shared/draft-review'
import { parseReviewTarget, sheetDraftSummary, sheetEditRoute, sheetReviewRefusal } from '@shared/sheet-draft'
import { PanelFrame } from '@renderer/components/PanelFrame'
import { applyFileResult, useFileResult } from '@renderer/session/file-store'
import { registerSheet, type SheetController } from './sheet-controllers'
import type { FileNodeProps } from './FileNode'
import type { CreationResult } from '@shared/verb-table'

const ROW_H = 24
const DEFAULT_W = 96
const HEADER_W = 44
const OVERSCAN = 6
const EMPTY: Grid = []
const NO_WIDTHS: number[] = []
const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n))

/**
 * M245. A spreadsheet over a real .csv/.tsv/.xlsx file.
 *
 * Virtualized: only the visible window (sheet-grid.ts) is in the DOM, with the
 * headers repositioned against the scroll offset rather than made sticky, so
 * a 50,000-row file costs what forty rows cost.
 *
 * Every write goes through the session (sheet-session.ts), which re-reads the
 * disk and writes through main's compare-and-swap. The Cmd+C/V/Z menu
 * accelerators never reach this DOM as key events — they are subscribed here
 * (edit:copy/paste/undo/redo), the Palette.tsx rule, and `sheetFocused()` in
 * shouldIgnoreKeys makes the canvas clipboard stand down so a paste aimed at
 * this grid never lands in a focused terminal.
 */
export function SheetNode(props: FileNodeProps & { onView: (id: string, view: SheetView) => void }): JSX.Element {
  const { panel, onView, readOnly = false } = props
  const id = panel.rect.id
  const path = panel.source.path
  const name = path.split('/').pop() ?? path
  const directory = path.slice(0, Math.max(0, path.lastIndexOf('/')))
  const viewRef = useRef(onView); viewRef.current = onView
  const alive = useRef(true)
  const readOnlyRef = useRef(readOnly); readOnlyRef.current = readOnly
  const session = useMemo(() => createSheetSession(panel.source.sheet ?? {}, {
    name: path.split('/').pop() ?? path,
    read: () => window.canvas.file.read({ panelId: id, path, encoding: 'base64' }),
    write: (base64, baseMtimeMs) => window.canvas.file.write({ path, content: base64, baseMtimeMs, encoding: 'base64' }),
    changed: (view) => { if (alive.current) viewRef.current(id, view) }
  }, sheetFormat(path)), [id, path]) // eslint-disable-line react-hooks/exhaustive-deps -- the view seeds the session once; later views come FROM it
  const state = useSyncExternalStore(session.subscribe, session.snapshot, session.snapshot)
  const observed = useFileResult(id)
  useEffect(() => {
    alive.current = true
    void session.refresh()
    return () => { alive.current = false; void window.canvas.file.close(id) }
  }, [session, id])
  useEffect(() => { if (observed) session.observe(observed) }, [session, observed])
  // Publish our own reads through the store too, so a byte-identical save the watcher dedupes still lands.
  useEffect(() => { if (state.disk) applyFileResult(id, state.disk) }, [id, state.disk])

  const grid = state.grid ?? EMPTY
  const { rows, cols } = gridSize(grid)
  const [liveWidths, setLiveWidths] = useState<number[] | null>(null)
  const widths = liveWidths ?? state.view.widths ?? NO_WIDTHS
  const ev = useMemo(() => createEvaluator(grid), [grid])
  const [sel, setSel] = useState({ r: 0, c: 0 })
  const [anchor, setAnchor] = useState({ r: 0, c: 0 })
  const [editing, setEditing] = useState<{ r: number; c: number; text: string } | null>(null)
  const [message, setMessage] = useState('')
  const [scroll, setScroll] = useState({ top: 0, left: 0 })
  const [size, setSize] = useState({ w: 600, h: 400 })
  const scroller = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const editor = useRef<HTMLInputElement>(null)
  const dragging = useRef(false)
  const editingRef = useRef(editing); editingRef.current = editing
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // preventScroll: a focus() inside `.canvas` scrolls the clipping host (the D09 lesson).
  useEffect(() => { if (editing) editor.current?.focus({ preventScroll: true }) }, [editing !== null]) // eslint-disable-line react-hooks/exhaustive-deps

  // Room to type past the data, the way every spreadsheet offers blank rows below.
  const displayRows = Math.max(rows + 20, 60)
  const displayCols = Math.max(cols + 4, 12)
  const win = visibleWindow({ rows: displayRows, cols: displayCols, rowHeight: ROW_H, widths, defaultWidth: DEFAULT_W, scrollTop: scroll.top, scrollLeft: scroll.left, height: size.h - ROW_H, width: size.w - HEADER_W, overscan: OVERSCAN })
  const range: CellRange = { r0: Math.min(sel.r, anchor.r), r1: Math.max(sel.r, anchor.r), c0: Math.min(sel.c, anchor.c), c1: Math.max(sel.c, anchor.c) }
  const lefts: number[] = []
  for (let c = win.c0, x = colLeft(widths, win.c0, DEFAULT_W); c <= win.c1; c++) { lefts[c] = x; x += colWidth(widths, c, DEFAULT_W) }
  const x0 = (c: number): number => HEADER_W + (lefts[c] ?? colLeft(widths, c, DEFAULT_W))

  const editable = !readOnly && state.grid !== undefined && !state.stale && !state.busy
  // The session refuses these for an xlsx (address-keyed merges and comments would shift onto
  // other cells); the buttons say so rather than fail on press.
  const structuralReason = sheetFormat(path) === 'xlsx'
    ? 'rows and columns cannot be inserted or deleted in an xlsx here — its merged cells, comments and formats would land on the wrong cells'
    : undefined
  const reason = readOnly ? 'leave merged view to edit'
    : state.stale ? `${name} changed on disk — Reload first`
      : state.grid === undefined ? 'the file is still being read'
        : state.busy ? 'waiting for the current save' : undefined
  const report = (ok: boolean): void => { if (alive.current) setMessage(ok ? '' : session.snapshot().error ?? '') }
  const gridRef = useRef(grid); gridRef.current = grid
  const rangeRef = useRef(range); rangeRef.current = range
  const selRef = useRef(sel); selRef.current = sel

  const controller = useMemo<SheetController>(() => ({
    // M247 (critic, finding 2). The badge opens the REVIEW: the first proposed
    // cell selected, so Keep/Discard selected work on the first click.
    focusDraft: (): boolean => {
      const first = session.snapshot().view.draft?.items[0]
      const ref = first === undefined ? null : parseRef(first.id)
      if (ref === null) return false
      setSel(ref)
      setAnchor(ref)
      // After the camera move and this render, so the cell exists to scroll to.
      requestAnimationFrame(() => { ensureVisible(ref.r, ref.c); body.current?.focus({ preventScroll: true }) })
      return true
    },
    edit: async (cell, value, caller): Promise<CreationResult> => {
      if (readOnlyRef.current || !alive.current) return { kind: 'refused', reason: 'this sheet is read-only here' }
      const ref = parseRef(cell)
      if (!ref) return { kind: 'refused', reason: `${cell} is not a cell reference like B2` }
      // M246. Through the agent door an edit PROPOSES: the file is untouched until a person keeps it.
      if (sheetEditRoute(caller) === 'draft') {
        const ok = await session.propose([{ r: ref.r, c: ref.c, value }], caller!.panelId!)
        return ok ? { kind: 'ran', note: `${refName(ref.r, ref.c)} proposed — the file changes only when a person keeps it` } : { kind: 'refused', reason: session.snapshot().error ?? 'the sheet is busy' }
      }
      const ok = await session.setCells([{ r: ref.r, c: ref.c, value }])
      return ok ? { kind: 'ran', note: `${refName(ref.r, ref.c)} set` } : { kind: 'refused', reason: session.snapshot().error ?? 'the sheet is busy' }
    },
    review: async (operation, target, caller): Promise<CreationResult> => {
      if (readOnlyRef.current || !alive.current) return { kind: 'refused', reason: 'this sheet is read-only here' }
      if (operation !== 'keep' && operation !== 'discard') return { kind: 'refused', reason: 'use keep or discard, then a cell, a range like B2:C4, or all' }
      const refusal = sheetReviewRefusal(operation, caller)
      if (refusal) return { kind: 'refused', reason: refusal }
      const ids = parseReviewTarget(target)
      if (ids === null) return { kind: 'refused', reason: `${target} is not a cell, a range like B2:C4, or all` }
      const ok = operation === 'keep' ? await session.keepDraft(ids) : await session.discardDraft(ids)
      return ok ? { kind: 'ran', note: `${operation === 'keep' ? 'kept' : 'discarded'} ${ids === 'all' ? 'the whole draft' : ids.join(', ')}` } : { kind: 'refused', reason: session.snapshot().error ?? 'the sheet is busy' }
    }
  }), [session])
  useEffect(() => registerSheet(id, controller), [id, controller])

  useEffect(() => {
    const focused = (): boolean => body.current?.contains(document.activeElement) === true
    const inEditor = (): boolean => editor.current !== null && document.activeElement === editor.current
    const offCopy = window.canvas.edit.onCopy(() => {
      if (!focused()) return
      const el = editor.current
      if (inEditor() && el) { void navigator.clipboard.writeText(el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0)); return }
      void navigator.clipboard.writeText(rangeToTsv(gridRef.current, rangeRef.current))
    })
    const offPaste = window.canvas.edit.onPaste((text) => {
      if (!focused() || !text) return
      const el = editor.current
      if (inEditor() && el) {
        const start = el.selectionStart ?? el.value.length
        const next = el.value.slice(0, start) + text.replace(/[\r\n]+/g, ' ') + el.value.slice(el.selectionEnd ?? start)
        setEditing((e) => e && { ...e, text: next })
        return
      }
      if (readOnlyRef.current) return
      const at = { r: rangeRef.current.r0, c: rangeRef.current.c0 }
      void session.update(pasteTsv(gridRef.current, at, text)).then(report)
    })
    const offUndo = window.canvas.edit.onUndo(() => { if (focused() && !inEditor() && !readOnlyRef.current) void session.undo().then(report) })
    const offRedo = window.canvas.edit.onRedo(() => { if (focused() && !inEditor() && !readOnlyRef.current) void session.redo().then(report) })
    return () => { offCopy(); offPaste(); offUndo(); offRedo() }
  }, [session]) // eslint-disable-line react-hooks/exhaustive-deps -- reads current grid/range through refs

  const ensureVisible = (r: number, c: number): void => {
    const el = scroller.current
    if (!el) return
    const top = ROW_H * (r + 1)
    if (top - ROW_H < el.scrollTop) el.scrollTop = top - ROW_H
    else if (top + ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_H - el.clientHeight
    const left = HEADER_W + colLeft(widths, c, DEFAULT_W)
    const right = left + colWidth(widths, c, DEFAULT_W)
    if (left - HEADER_W < el.scrollLeft) el.scrollLeft = left - HEADER_W
    else if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right - el.clientWidth
  }
  const select = (r: number, c: number, extend: boolean): void => {
    const next = { r: clamp(r, 0, displayRows - 1), c: clamp(c, 0, displayCols - 1) }
    setSel(next)
    if (!extend) setAnchor(next)
    ensureVisible(next.r, next.c)
  }
  const beginEdit = (text: string): void => {
    if (!editable) { setMessage(reason ?? ''); return }
    setEditing({ r: sel.r, c: sel.c, text })
  }
  const finish = (commit: boolean, dr: number, dc: number): void => {
    const e = editingRef.current
    if (!e) return
    editingRef.current = null
    setEditing(null)
    if (commit && (gridRef.current[e.r]?.[e.c] ?? '') !== e.text) void session.setCells([{ r: e.r, c: e.c, value: e.text }]).then(report)
    if (dr || dc) select(e.r + dr, e.c + dc, false)
    body.current?.focus({ preventScroll: true })
  }
  const structural = (next: string[][]): void => { if (editable) void session.update(next, true).then(report); else setMessage(reason ?? '') }

  const startResize = (c: number) => (e: ReactMouseEvent): void => {
    e.stopPropagation()
    e.preventDefault()
    const el = scroller.current
    // The panel is inside the canvas's scaled world layer: a screen pixel is 1/zoom of a layout pixel.
    const scale = el && el.offsetWidth > 0 ? el.getBoundingClientRect().width / el.offsetWidth : 1
    const startX = e.clientX
    const base = [...widths]
    while (base.length <= c) base.push(DEFAULT_W)
    const at = (clientX: number): number[] => { const next = [...base]; next[c] = Math.round(clamp(base[c] + (clientX - startX) / scale, 32, 1200)); return next }
    const move = (m: MouseEvent): void => setLiveWidths(at(m.clientX))
    const up = (m: MouseEvent): void => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      setLiveWidths(null)
      session.setWidths(at(m.clientX))
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  // M246. The draft layer over the grid — ahead of the cell loop, which paints it.
  const draft = state.view.draft
  const draftById = useMemo(() => new Map((draft?.items ?? []).map((i) => [i.id, i])), [draft])
  // Hashed once per disk result, not per render: the base64 of a 2 MB file is a long string.
  const diskHash = useMemo(() => state.disk?.kind === 'bytes' ? contentHash(state.disk.base64) : undefined, [state.disk])

  const cells: JSX.Element[] = []
  for (let r = win.r0; r <= win.r1; r++) {
    for (let c = win.c0; c <= win.c1; c++) {
      const raw = grid[r]?.[c] ?? ''
      const pending = draftById.get(refName(r, c))
      const inRange = r >= range.r0 && r <= range.r1 && c >= range.c0 && c <= range.c1
      const value = raw.startsWith('=') ? ev.value(r, c) : undefined
      const cls = `sheet-node__cell${inRange ? ' is-in-range' : ''}${raw.startsWith('=') && ev.isError(r, c) ? ' is-error' : ''}${typeof value === 'number' || (value === undefined && raw !== '' && !raw.startsWith("'") && /^\s*[-+]?(\d+\.?\d*|\.\d+)\s*$/.test(raw)) ? ' is-number' : ''}`
      cells.push(<div key={`${r}:${c}`} className={pending ? `${cls} is-draft` : cls} data-cell={refName(r, c)} data-draft={pending ? 'true' : undefined}
        style={{ left: x0(c), top: ROW_H * (r + 1), width: colWidth(widths, c, DEFAULT_W), height: ROW_H }}
        onMouseDown={(e) => { if (e.button !== 0) return; e.preventDefault(); dragging.current = true; select(r, c, e.shiftKey); body.current?.focus({ preventScroll: true }) }}
        onMouseEnter={(e) => { if (dragging.current && e.buttons === 1) { setSel({ r, c }) } }}
        onDoubleClick={() => { setSel({ r, c }); setAnchor({ r, c }); if (editable) setEditing({ r, c, text: raw }); else setMessage(reason ?? '') }}
        title={pending ? `${pending.old === '' ? '(empty)' : pending.old} → ${pending.new === '' ? '(empty)' : pending.new}` : raw.startsWith('=') ? raw : undefined}>
        {/* A drafted cell shows what the draft PROPOSES; the file still holds `old` until it is kept. */}
        {pending ? pending.new : raw === '' ? null : displayText(raw, ev, r, c)}
      </div>)
    }
  }
  const colHeads: JSX.Element[] = []
  for (let c = win.c0; c <= win.c1; c++) {
    colHeads.push(<div key={c} className={`sheet-node__colhead${c >= range.c0 && c <= range.c1 ? ' is-active' : ''}`}
      style={{ left: x0(c), top: scroll.top, width: colWidth(widths, c, DEFAULT_W), height: ROW_H }}
      onMouseDown={(e) => { e.preventDefault(); setAnchor({ r: 0, c }); setSel({ r: displayRows - 1, c }); body.current?.focus({ preventScroll: true }) }}>
      {colName(c)}
      <span className="sheet-node__resize" aria-label={`Resize column ${colName(c)}`} onMouseDown={startResize(c)} />
    </div>)
  }
  const rowHeads: JSX.Element[] = []
  for (let r = win.r0; r <= win.r1; r++) {
    rowHeads.push(<div key={r} className={`sheet-node__rowhead${r >= range.r0 && r <= range.r1 ? ' is-active' : ''}`}
      style={{ left: scroll.left, top: ROW_H * (r + 1), width: HEADER_W, height: ROW_H }}
      onMouseDown={(e) => { e.preventDefault(); setAnchor({ r, c: 0 }); setSel({ r, c: displayCols - 1 }); body.current?.focus({ preventScroll: true }) }}>{r + 1}</div>)
  }
  const totalW = HEADER_W + colLeft(widths, displayCols, DEFAULT_W)
  const totalH = ROW_H * (displayRows + 1)
  const multi = range.r0 !== range.r1 || range.c0 !== range.c1
  const disk = state.disk
  const lossesPending = state.losses.length > 0 && session.lossesPending()
  const dState = draftState(draft, diskHash, state.view.draftOutcome)
  const inSelection = (draft?.items ?? []).filter((i) => {
    const p = parseRef(i.id)
    return p !== null && p.r >= range.r0 && p.r <= range.r1 && p.c >= range.c0 && p.c <= range.c1
  }).map((i) => i.id)
  const resolve = (op: 'keep' | 'discard', ids: string[] | 'all'): void => {
    void (op === 'keep' ? session.keepDraft(ids) : session.discardDraft(ids)).then(report)
  }
  const selectedDraft = draftById.get(refName(sel.r, sel.c))

  return <PanelFrame id={id} kind="file" kindWord="sheet" rect={panel.rect} z={panel.z} selected={props.selected}
    className="sheet-node" rootAttrs={{ 'data-sheet': '' }} title={panel.title ?? name}
    readOnly={readOnly} linkTarget={props.linkTarget} onSelect={props.onSelect} onBeginDrag={props.onBeginDrag} onBeginLink={props.onBeginLink}
    close={readOnly ? null : { armed: false, armedText: 'close?', title: 'Close sheet', onMouseDown: (e) => { e.stopPropagation(); e.preventDefault(); props.onClose(id) } }}
    chrome={<>
      <span className="pf__summary" data-sheet-summary>{sheetSummary(rows, cols)}</span>
      <span className="sheet-node__dir" data-sheet-directory title={directory}>{directory.split('/').slice(-2).join('/')}</span>
      {/* M246. Contextual: present only when there ARE changes — the rest layer never states a zero. */}
      {draft && <span className="sheet-node__changes" data-sheet-changes>{sheetDraftSummary(draft)}</span>}
      {state.losses.length > 0 && <button type="button" className={`sheet-node__loss${lossesPending ? ' is-pending' : ''}`} data-sheet-losses
        title={lossesPending ? `Saving this workbook drops: ${state.losses.join('; ')}. Click to accept and allow saving.` : `Accepted — saving drops: ${state.losses.join('; ')}`}
        disabled={readOnly || !lossesPending} onMouseDown={(e) => e.stopPropagation()} onClick={() => session.acceptLosses()}>
        {lossesPending ? `Drops on save: ${state.losses.join(', ')}` : 'drops on save'}
      </button>}
    </>}>
    <div ref={body} className="sheet-node__body" data-sheet-body tabIndex={0}
      onMouseDown={(e) => { e.stopPropagation(); props.onFocus(id) }}
      onMouseUp={() => { dragging.current = false }}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (editing) return
        const k = e.key
        if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight') {
          e.preventDefault()
          const [dr, dc] = k === 'ArrowUp' ? [-1, 0] : k === 'ArrowDown' ? [1, 0] : k === 'ArrowLeft' ? [0, -1] : [0, 1]
          select(sel.r + dr, sel.c + dc, e.shiftKey)
          return
        }
        if (k === 'Tab') { e.preventDefault(); select(sel.r, sel.c + (e.shiftKey ? -1 : 1), false); return }
        if (k === 'Enter' || k === 'F2') { e.preventDefault(); beginEdit(grid[sel.r]?.[sel.c] ?? ''); return }
        if (k === 'Backspace' || k === 'Delete') { e.preventDefault(); if (editable) void session.update(clearRange(grid, range)).then(report); else setMessage(reason ?? ''); return }
        if (k.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); beginEdit(k) }
      }}>
      <div className="sheet-node__bar">
        <span className="sheet-node__ref" data-sheet-ref>{refName(sel.r, sel.c)}{multi ? `:${refName(range.r1, range.c1)}` : ''}</span>
        <span className="sheet-node__formula" data-sheet-formula>{selectedDraft
          ? `${selectedDraft.old === '' ? '(empty)' : selectedDraft.old} → ${selectedDraft.new === '' ? '(empty)' : selectedDraft.new}`
          : grid[sel.r]?.[sel.c] ?? ''}</span>
        <div className="sheet-node__tools">
          <button type="button" disabled={!editable || structuralReason !== undefined} title={reason ?? structuralReason ?? `Insert a row above ${range.r0 + 1}`} onClick={() => structural(insertRows(grid, range.r0, 1))}>+ Row</button>
          <button type="button" disabled={!editable || structuralReason !== undefined || range.r0 >= rows} title={reason ?? structuralReason ?? (range.r0 >= rows ? 'no data in the selected rows' : `Delete rows ${range.r0 + 1}–${range.r1 + 1}`)} onClick={() => structural(deleteRows(grid, range.r0, range.r1 - range.r0 + 1))}>− Row</button>
          <button type="button" disabled={!editable || structuralReason !== undefined} title={reason ?? structuralReason ?? `Insert a column left of ${colName(range.c0)}`} onClick={() => structural(insertCols(grid, range.c0, 1))}>+ Col</button>
          <button type="button" disabled={!editable || structuralReason !== undefined || range.c0 >= cols} title={reason ?? structuralReason ?? (range.c0 >= cols ? 'no data in the selected columns' : `Delete columns ${colName(range.c0)}–${colName(range.c1)}`)} onClick={() => structural(deleteCols(grid, range.c0, range.c1 - range.c0 + 1))}>− Col</button>
          <button type="button" disabled={!editable || !state.undo} title={reason ?? (!state.undo ? 'nothing to undo' : 'Undo the last save')} onClick={() => { void session.undo().then(report) }}>Undo</button>
          <button type="button" disabled={!editable || !state.redo} title={reason ?? (!state.redo ? 'nothing to redo' : 'Redo')} onClick={() => { void session.redo().then(report) }}>Redo</button>
          <button type="button" className={state.stale ? 'is-urgent' : undefined} disabled={state.busy} title={state.stale ? `Adopt the version of ${name} now on disk` : 'Read the file again'} onClick={() => { void session.reload().then(report) }}>Reload</button>
        </div>
      </div>
      {(message || state.error || state.note) && <p role="status" className="sheet-node__status" data-sheet-status>{message || state.error || state.note}</p>}
      {draft && <div className={`sheet-node__draft${dState === 'conflict' ? ' is-conflict' : ''}`} data-sheet-draft={dState}>
        <span>{dState === 'conflict' ? `${name} changed on disk after this draft` : `${sheetDraftSummary(draft)} proposed${draft.by ? ` by ${draft.by}` : ''}`}</span>
        <button type="button" data-sheet-draft-keep="selection" disabled={readOnly || dState === 'conflict' || inSelection.length === 0}
          title={readOnly ? 'leave merged view to review' : dState === 'conflict' ? 'Rebase first: the file changed under this draft' : inSelection.length === 0 ? 'select drafted cells first' : `Keep ${inSelection.join(', ')}`}
          onClick={() => resolve('keep', inSelection)}>Keep selected</button>
        <button type="button" data-sheet-draft-discard="selection" disabled={readOnly || inSelection.length === 0}
          title={readOnly ? 'leave merged view to review' : inSelection.length === 0 ? 'select drafted cells first' : `Discard ${inSelection.join(', ')}`}
          onClick={() => resolve('discard', inSelection)}>Discard selected</button>
        <button type="button" data-sheet-draft-keep="all" disabled={readOnly || dState === 'conflict'}
          title={readOnly ? 'leave merged view to review' : dState === 'conflict' ? 'Rebase first: the file changed under this draft' : 'Write every proposed cell to the file'}
          onClick={() => resolve('keep', 'all')}>Keep all</button>
        <button type="button" data-sheet-draft-discard="all" disabled={readOnly} title={readOnly ? 'leave merged view to review' : 'Drop the whole draft; the file is not touched'}
          onClick={() => resolve('discard', 'all')}>Discard all</button>
        {dState === 'conflict' && <button type="button" data-sheet-draft-rebase disabled={readOnly} title="Adopt the file as it is now, keep the proposals it did not touch, and name the ones it did"
          onClick={() => { void session.rebaseDraft().then(report) }}>Rebase</button>}
      </div>}
      {!draft && state.view.draftOutcome && <div className="sheet-node__draft is-done" data-sheet-draft="applied">
        <span>Last draft: {state.view.draftOutcome.kept} kept, {state.view.draftOutcome.discarded} discarded</span>
      </div>}
      {state.grid === undefined && disk !== undefined && disk.kind !== 'bytes' && <p role="status" className="sheet-node__status">{state.error ?? 'This file could not be read.'}</p>}
      {/* data-scroll-host: the attribute shouldYieldWheel reads, so a wheel over the grid scrolls it rather than panning the canvas. */}
      <div ref={scroller} className="sheet-node__scroller" data-sheet-scroller data-scroll-host
        onScroll={(e) => setScroll({ top: e.currentTarget.scrollTop, left: e.currentTarget.scrollLeft })}>
        <div className="sheet-node__plane" style={{ width: totalW, height: totalH }}>
          {cells}
          <div className="sheet-node__cursor" style={{ left: x0(sel.c), top: ROW_H * (sel.r + 1), width: colWidth(widths, sel.c, DEFAULT_W), height: ROW_H }} />
          {editing && <input ref={editor} className="sheet-node__editor" data-sheet-editor value={editing.text} aria-label={`Edit ${refName(editing.r, editing.c)}`}
            style={{ left: x0(editing.c), top: ROW_H * (editing.r + 1), minWidth: colWidth(widths, editing.c, DEFAULT_W), height: ROW_H }}
            onChange={(e) => setEditing({ ...editing, text: e.target.value })}
            onBlur={() => finish(true, 0, 0)}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') { e.preventDefault(); finish(true, e.shiftKey ? -1 : 1, 0) }
              else if (e.key === 'Tab') { e.preventDefault(); finish(true, 0, e.shiftKey ? -1 : 1) }
              else if (e.key === 'Escape') { e.preventDefault(); finish(false, 0, 0) }
            }} />}
          {colHeads}
          {rowHeads}
          <div className="sheet-node__corner" style={{ left: scroll.left, top: scroll.top, width: HEADER_W, height: ROW_H }} />
        </div>
      </div>
    </div>
  </PanelFrame>
}
