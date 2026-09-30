import { useCallback, useMemo, type Dispatch, type MouseEvent as ReactMouseEvent, type MutableRefObject, type RefObject, type SetStateAction } from 'react'
import {
  SHAPE_FILLS, SHAPE_FORMS, SHAPE_INKS, SHAPE_MIN, SHAPE_SIZE, SHAPE_STROKES, isShapeFill, isShapeForm, isShapeInk, isShapeStroke,
  normaliseShapeText, shapeFormWord, shapeSummary, type ShapeFill, type ShapeForm, type ShapeInk, type ShapeStroke
} from '@shared/flowchart'
import { cascadeCentre, isShapePanel, makeShapePanel, nextZ, removePanel, type Panel } from '@renderer/panels/panels'
import { COPYABLE, clipboardMarker, collectCopy, heldCopyFor, holdCopy, placeCopies } from '@renderer/flowchart/object-clipboard'
import { alignRects, alignSentence, distributeRects, distributeSentence, type AlignEdge } from './arrange'
import { setEditingShape } from '@renderer/flowchart/shape-edit-store'
import type { DragState, ResizeEdge } from './panel-interaction'
import type { Point } from './viewport'
import type { PlaceFn } from './place-new'

/**
 * M388. THE FLOWCHART'S VERBS — the Canvas half.
 *
 * A hook in the useBoardVerbs mould (src/renderer/canvas/CLAUDE.md): one
 * `Deps` object, destructured on entry, the DESTRUCTURED members named in
 * every dependency array (never `deps`, which Canvas rebuilds every render),
 * called at ONE position in Canvas below everything it reads.
 *
 * Every verb here mutates through `setPanels` with `commitHistory` inside the
 * updater — one history entry per committed gesture (lb :371; `commitHistory`
 * alone moves nothing, lb :4498) — and answers `{ran, note}` or `{refused,
 * reason}` so the palette, the agent line and a workflow node read one result.
 */

/** World units a duplicate or an in-place paste steps down and right — far enough to read as a copy, near enough to stay with its original. */
const DUPLICATE_OFFSET = 24
const ALIGN_EDGES: readonly AlignEdge[] = ['left', 'hcentre', 'right', 'top', 'vcentre', 'bottom']
function boundsOf(rects: readonly { x: number; y: number; w: number; h: number }[]): { x: number; y: number; w: number; h: number } {
  const x = Math.min(...rects.map((r) => r.x))
  const y = Math.min(...rects.map((r) => r.y))
  return { x, y, w: Math.max(...rects.map((r) => r.x + r.w)) - x, h: Math.max(...rects.map((r) => r.y + r.h)) - y }
}

export type VerbResult = { kind: 'ran'; note?: string } | { kind: 'refused'; reason: string }

export interface ShapeStylePatch {
  form?: string
  fill?: string
  stroke?: string
  ink?: string
}

export interface FlowchartVerbsDeps {
  setPanels: Dispatch<SetStateAction<Panel[]>>
  commitHistory: (next: Panel[]) => void
  panelsRef: RefObject<Panel[]>
  nextIdRef: MutableRefObject<number>
  mergedRef: RefObject<boolean>
  selectedIdsRef: RefObject<ReadonlySet<string>>
  selectOnly: (id: string | null) => void
  addToSelection: (id: string) => void
  onBeginDrag: (state: DragState) => void
  /** The world point at the centre of the canvas host — where a shape with no place of its own goes. */
  worldCentre: () => Point
  /** Hand the keyboard to the canvas: blur a terminal's textarea, release focusedId, focus the host (what ⌘Esc does). */
  releaseKeyboard: () => void
  /** The world rect the camera shows now — a paste lands in view. */
  visibleWorld: () => { x: number; y: number; w: number; h: number }
  /** M390. Tab and ⇧Tab from an open label: the keyboard hook's next/previous step, assigned below this hook (a ref). */
  stepRef: RefObject<{ nextStep: (id: string) => void; previousStep: (id: string) => void } | null>
  /** M395. The chrome and the world in view, for a shape with no place of its own (safe-area.ts). */
  /** M402. The one placement rule (Canvas.tsx's `placer`), read outside the updater. */
  placer: () => PlaceFn
}

export interface FlowchartVerbs {
  /** M390. Duplicate the given objects (default: the selection) — the authored kinds only; copies selected. */
  duplicate: (ids?: readonly string[]) => VerbResult
  /** M390. Copy the selection's authored objects to the in-app clipboard; the system clipboard gets a content-free marker. */
  copyObjects: () => VerbResult
  /** M390. Paste held objects when `clipboardText` is this app's marker; false when it is not ours. */
  pasteObjects: (clipboardText: string | undefined) => boolean
  /** M390. Delete the given authored objects (default: the selection) in ONE history entry. */
  deleteObjects: (ids?: readonly string[]) => VerbResult
  /** M390. Line the objects (default: the selection) up on an edge or centre. */
  align: (edge: string, ids?: readonly string[]) => VerbResult
  /** M390. Space the objects (default: the selection) evenly across or down. */
  distribute: (axis: string, ids?: readonly string[]) => VerbResult
  /** M390. Move the selection by a world delta; `commit` false while a key repeats, true on release. */
  nudge: (dx: number, dy: number, commit: boolean) => void
  /** M394. Each shape learns the plan step it became (`stepOf`: shape id → step id), once the work item exists. */
  bindPlanSteps: (itemId: string, stepOf: ReadonlyMap<string, string>) => void
  addShape: (form: string, text?: string, world?: Point) => VerbResult & { id?: string }
  setShapeText: (panelId: string, text: string) => VerbResult
  setShapeStyle: (panelIds: readonly string[], patch: ShapeStylePatch) => VerbResult
  /** ShapeLayer's press: select (additive with ⇧) and begin a move. */
  onShapePress: (id: string, event: ReactMouseEvent) => void
  /** ShapeLayer's handle press: begin a resize from any of the eight edges, at the shape's own floor. */
  onShapeResize: (id: string, edge: ResizeEdge, event: ReactMouseEvent) => void
  /** ShapeLayer's editor closed. */
  onShapeText: (id: string, text: string, how: 'blur' | 'escape' | 'tab' | 'shift-tab') => void
}

export function useFlowchartVerbs(deps: FlowchartVerbsDeps): FlowchartVerbs {
  const { setPanels, commitHistory, panelsRef, nextIdRef, mergedRef, selectedIdsRef, selectOnly, addToSelection, onBeginDrag, worldCentre, releaseKeyboard, visibleWorld, stepRef, placer } = deps
  // The selection as a list of ids, or the ids a door named.
  const targetIds = (ids?: readonly string[]): string[] => (ids !== undefined && ids.length > 0 ? [...ids] : [...(selectedIdsRef.current ?? [])])
  const selectMany = (ids: readonly string[]): void => {
    if (ids.length === 0) return
    selectOnly(ids[0])
    for (const id of ids.slice(1)) addToSelection(id)
  }

  const addShape = useCallback((form: string, text?: string, world?: Point): VerbResult & { id?: string } => {
    if (mergedRef.current === true) return { kind: 'refused', reason: 'leave merged view to add a shape' }
    if (!isShapeForm(form)) return { kind: 'refused', reason: `${form} is not a shape — ${SHAPE_FORMS.join(', ')}` }
    const at = world ?? worldCentre()
    const id = `sh${nextIdRef.current++}`
    const label = normaliseShapeText(text ?? '')
    // M395. With no place of its own (a palette row, an agent's line) a shape
    // goes to the FREE spot nearest the view's centre, never on top of what
    // is there; a point the person gave (a double-click, a drop) is kept.
    // M402: the one placement rule (placer) — clear of groups the shape is not in, and shown.
    const place = world === undefined ? placer() : null
    setPanels((current) => {
      const next = [...current, place === null
        ? makeShapePanel(id, cascadeCentre(at, current), nextZ(current), form, label)
        : place(current, makeShapePanel(id, at, nextZ(current), form, label))]
      commitHistory(next)
      return next
    })
    selectOnly(id)
    return { kind: 'ran', note: label === '' ? `a ${shapeFormWord(form)}` : `${shapeFormWord(form)}: ${shapeSummary(label, form)}`, id }
  }, [commitHistory, mergedRef, nextIdRef, placer, selectOnly, setPanels, worldCentre])

  const setShapeText = useCallback((panelId: string, text: string): VerbResult => {
    if (mergedRef.current === true) return { kind: 'refused', reason: 'leave merged view to edit a shape' }
    const target = panelsRef.current?.find((p) => p.rect.id === panelId)
    if (target === undefined || !isShapePanel(target)) return { kind: 'refused', reason: `${panelId} is not a shape` }
    const next = normaliseShapeText(text)
    // An unchanged label is not a gesture: no history entry for a blur that
    // changed nothing (one entry per COMMITTED gesture).
    if (next === target.shape.text) return { kind: 'ran', note: shapeSummary(next, target.shape.form) }
    setPanels((current) => {
      const updated = current.map((p) => (p.rect.id === panelId && isShapePanel(p) ? { ...p, shape: { ...p.shape, text: next } } : p))
      commitHistory(updated)
      return updated
    })
    return { kind: 'ran', note: shapeSummary(next, target.shape.form) }
  }, [commitHistory, mergedRef, panelsRef, setPanels])

  const setShapeStyle = useCallback((panelIds: readonly string[], patch: ShapeStylePatch): VerbResult => {
    if (mergedRef.current === true) return { kind: 'refused', reason: 'leave merged view to restyle a shape' }
    const ids = new Set(panelIds)
    const targets = (panelsRef.current ?? []).filter((p) => ids.has(p.rect.id) && isShapePanel(p))
    if (targets.length === 0) return { kind: 'refused', reason: 'select a shape first' }
    // Each field is judged by name, and a bad one refuses the WHOLE verb: a
    // restyle that applied half of what was asked would leave the person
    // guessing which half.
    if (patch.form !== undefined && !isShapeForm(patch.form)) return { kind: 'refused', reason: `${patch.form} is not a shape — ${SHAPE_FORMS.join(', ')}` }
    if (patch.fill !== undefined && !isShapeFill(patch.fill)) return { kind: 'refused', reason: `${patch.fill} is not a fill — ${SHAPE_FILLS.join(', ')}` }
    if (patch.stroke !== undefined && !isShapeStroke(patch.stroke)) return { kind: 'refused', reason: `${patch.stroke} is not a line — ${SHAPE_STROKES.join(', ')}` }
    if (patch.ink !== undefined && !isShapeInk(patch.ink)) return { kind: 'refused', reason: `${patch.ink} is not a text colour — ${SHAPE_INKS.join(', ')}` }
    setPanels((current) => {
      const updated = current.map((p) => {
        if (!ids.has(p.rect.id) || !isShapePanel(p)) return p
        const shape = { ...p.shape }
        let rect = p.rect
        if (patch.form !== undefined && patch.form !== p.shape.form) {
          // A shape still at its old form's MINT size takes the new form's —
          // a start/end is not decision-sized — centred where it was. One a
          // person has resized keeps the size they chose.
          const was = SHAPE_SIZE[p.shape.form]
          const now = SHAPE_SIZE[patch.form as ShapeForm]
          if (Math.round(p.rect.w) === was.w && Math.round(p.rect.h) === was.h) {
            rect = { ...p.rect, x: p.rect.x + (p.rect.w - now.w) / 2, y: p.rect.y + (p.rect.h - now.h) / 2, w: now.w, h: now.h }
          }
          shape.form = patch.form as ShapeForm
        }
        // The DEFAULT is absent, not a stored value: `plain`/`line`/`fg`
        // clear the field, so a restyled-back shape serialises like one that
        // was never restyled.
        if (patch.fill !== undefined) { if (patch.fill === 'plain') delete shape.fill; else shape.fill = patch.fill as ShapeFill }
        if (patch.stroke !== undefined) { if (patch.stroke === 'line') delete shape.stroke; else shape.stroke = patch.stroke as ShapeStroke }
        if (patch.ink !== undefined) { if (patch.ink === 'fg') delete shape.ink; else shape.ink = patch.ink as ShapeInk }
        return { ...p, rect, shape }
      })
      commitHistory(updated)
      return updated
    })
    const what = [patch.form && shapeFormWord(patch.form as ShapeForm), patch.fill && `${patch.fill} fill`, patch.stroke && `${patch.stroke} line`, patch.ink && `${patch.ink} text`].filter(Boolean).join(', ')
    return { kind: 'ran', note: `${targets.length === 1 ? 'a shape' : `${targets.length} shapes`} → ${what || 'unchanged'}` }
  }, [commitHistory, mergedRef, panelsRef, setPanels])

  const onShapePress = useCallback((id: string, event: ReactMouseEvent): void => {
    const panel = panelsRef.current?.find((p) => p.rect.id === id)
    if (panel === undefined) return
    // Selecting a shape does NOT raise it (unlike a panel's chrome): in a
    // diagram, z order is not what a click means, and every raise is a
    // history entry that a person's first ⌘Z would undo instead of their edit.
    // The keyboard comes with the selection: a terminal that held focus must
    // not receive the Enter or Tab a person presses next (ledger D3).
    releaseKeyboard()
    if (event.shiftKey) addToSelection(id)
    else if (!(selectedIdsRef.current !== null && selectedIdsRef.current.size > 1 && selectedIdsRef.current.has(id))) selectOnly(id)
    onBeginDrag({ panelId: id, mode: { kind: 'move' }, originRect: panel.rect, originWorld: { x: event.clientX, y: event.clientY }, min: SHAPE_MIN })
  }, [addToSelection, onBeginDrag, panelsRef, releaseKeyboard, selectOnly, selectedIdsRef])

  const onShapeResize = useCallback((id: string, edge: ResizeEdge, event: ReactMouseEvent): void => {
    const panel = panelsRef.current?.find((p) => p.rect.id === id)
    if (panel === undefined) return
    selectOnly(id)
    onBeginDrag({ panelId: id, mode: { kind: 'resize', edge }, originRect: panel.rect, originWorld: { x: event.clientX, y: event.clientY }, min: SHAPE_MIN })
  }, [onBeginDrag, panelsRef, selectOnly])

  const onShapeText = useCallback((id: string, text: string, how: 'blur' | 'escape' | 'tab' | 'shift-tab'): void => {
    setShapeText(id, text)
    // The label closed: keyboard focus returns to the canvas host so the next
    // Enter/Tab/arrow is a canvas key, not a key sent to nothing.
    if (how !== 'blur') (document.querySelector('.canvas') as HTMLElement | null)?.focus({ preventScroll: true })
    // M390. Tab in a label is "and the next step": commit, add, and open the
    // new label — a ten-step chain typed without leaving the keyboard.
    if (how === 'tab') stepRef.current?.nextStep(id)
    else if (how === 'shift-tab') stepRef.current?.previousStep(id)
  }, [setShapeText, stepRef])

  const duplicate = useCallback((ids?: readonly string[]): VerbResult => {
    if (mergedRef.current === true) return { kind: 'refused', reason: 'leave merged view to duplicate' }
    const want = new Set(targetIds(ids))
    const objects = collectCopy(panelsRef.current ?? [], want)
    if (objects.length === 0) return { kind: 'refused', reason: want.size === 0 ? 'select a shape, a note or a picture first' : 'only shapes, notes and pictures duplicate — a terminal or a chat would be a second process' }
    // Minted outside the updater (an updater must be pure); z set inside it.
    const placed = placeCopies(objects, () => nextIdRef.current++, DUPLICATE_OFFSET, DUPLICATE_OFFSET, 0)
    setPanels((current) => {
      const z0 = nextZ(current)
      const next = [...current, ...placed.panels.map((p) => ({ ...p, z: z0 + p.z }))]
      commitHistory(next)
      return next
    })
    selectMany(placed.ids)
    return { kind: 'ran', note: `${objects.length} object${objects.length === 1 ? '' : 's'} duplicated` }
  }, [commitHistory, mergedRef, nextIdRef, panelsRef, setPanels])

  const copyObjects = useCallback((): VerbResult => {
    const objects = collectCopy(panelsRef.current ?? [], new Set(targetIds()))
    if (objects.length === 0) return { kind: 'refused', reason: 'nothing to copy — select a shape, a note or a picture' }
    const marker = clipboardMarker(objects.length, Date.now())
    holdCopy(objects, marker)
    void navigator.clipboard.writeText(marker)
    return { kind: 'ran', note: `${objects.length} object${objects.length === 1 ? '' : 's'} copied` }
  }, [panelsRef])

  const pasteObjects = useCallback((clipboardText: string | undefined): boolean => {
    const objects = heldCopyFor(clipboardText)
    if (objects === null || mergedRef.current === true) return false
    // In place (offset one step) while the originals are in view; otherwise
    // the copies land in the middle of what the person is looking at.
    const b = boundsOf(objects.map((o) => o.rect))
    const view = visibleWorld()
    const inView = b.x + b.w / 2 > view.x && b.x + b.w / 2 < view.x + view.w && b.y + b.h / 2 > view.y && b.y + b.h / 2 < view.y + view.h
    const dx = inView ? DUPLICATE_OFFSET : view.x + view.w / 2 - (b.x + b.w / 2)
    const dy = inView ? DUPLICATE_OFFSET : view.y + view.h / 2 - (b.y + b.h / 2)
    const placed = placeCopies(objects, () => nextIdRef.current++, dx, dy, 0)
    setPanels((current) => {
      const z0 = nextZ(current)
      const next = [...current, ...placed.panels.map((p) => ({ ...p, z: z0 + p.z }))]
      commitHistory(next)
      return next
    })
    // A second paste of the same copy steps again rather than stacking exactly.
    holdCopy(objects.map((o) => ({ ...o, rect: { ...o.rect, x: o.rect.x + dx, y: o.rect.y + dy } })), (clipboardText ?? '').trim())
    selectMany(placed.ids)
    return true
  }, [commitHistory, mergedRef, nextIdRef, setPanels, visibleWorld])

  const deleteObjects = useCallback((ids?: readonly string[]): VerbResult => {
    if (mergedRef.current === true) return { kind: 'refused', reason: 'leave merged view to delete' }
    const want = new Set(targetIds(ids))
    const doomed = (panelsRef.current ?? []).filter((p) => want.has(p.rect.id) && COPYABLE(p))
    if (doomed.length === 0) return { kind: 'refused', reason: 'select a shape, a note or a picture first' }
    const gone = new Set(doomed.map((p) => p.rect.id))
    setPanels((current) => {
      // removePanel per id: each prunes the links AND connectors pointing at
      // it, and the whole set leaves in ONE history entry.
      let next = current
      for (const id of gone) next = removePanel(next, id)
      commitHistory(next)
      return next
    })
    selectOnly(null)
    return { kind: 'ran', note: `${doomed.length} object${doomed.length === 1 ? '' : 's'} deleted` }
  }, [commitHistory, mergedRef, panelsRef, selectOnly, setPanels])

  const applyPositions = (positions: Map<string, { x: number; y: number }>): void => {
    setPanels((current) => {
      const next = current.map((p) => {
        const at = positions.get(p.rect.id)
        return at === undefined || (at.x === p.rect.x && at.y === p.rect.y) ? p : { ...p, rect: { ...p.rect, x: at.x, y: at.y } }
      })
      if (next.some((p, i) => p !== current[i])) commitHistory(next)
      return next
    })
  }

  const align = useCallback((edge: string, ids?: readonly string[]): VerbResult => {
    if (mergedRef.current === true) return { kind: 'refused', reason: 'leave merged view to arrange' }
    if (!ALIGN_EDGES.includes(edge as AlignEdge)) return { kind: 'refused', reason: `${edge} is not an edge — ${ALIGN_EDGES.join(', ')}` }
    const want = new Set(targetIds(ids))
    // A LOCKED object keeps its place (M92's lock: drag and resize refuse; so does an arrangement).
    const rects = (panelsRef.current ?? []).filter((p) => want.has(p.rect.id) && p.locked !== true).map((p) => p.rect)
    if (rects.length < 2) return { kind: 'refused', reason: 'select two or more objects to align' }
    applyPositions(alignRects(rects, edge as AlignEdge))
    return { kind: 'ran', note: alignSentence(rects.length, edge as AlignEdge) }
  }, [commitHistory, mergedRef, panelsRef, setPanels])

  const distribute = useCallback((axis: string, ids?: readonly string[]): VerbResult => {
    if (mergedRef.current === true) return { kind: 'refused', reason: 'leave merged view to arrange' }
    const a = axis === 'across' || axis === 'h' || axis === 'horizontal' ? 'h' : axis === 'down' || axis === 'v' || axis === 'vertical' ? 'v' : null
    if (a === null) return { kind: 'refused', reason: `${axis} is not a direction — across or down` }
    const want = new Set(targetIds(ids))
    const rects = (panelsRef.current ?? []).filter((p) => want.has(p.rect.id) && p.locked !== true).map((p) => p.rect)
    if (rects.length < 3) return { kind: 'refused', reason: 'select three or more objects to space evenly' }
    applyPositions(distributeRects(rects, a))
    return { kind: 'ran', note: distributeSentence(rects.length, a) }
  }, [commitHistory, mergedRef, panelsRef, setPanels])

  const nudge = useCallback((dx: number, dy: number, commit: boolean): void => {
    if (mergedRef.current === true) return
    const want = selectedIdsRef.current ?? new Set<string>()
    if (want.size === 0) return
    setPanels((current) => {
      const next = dx === 0 && dy === 0 ? current : current.map((p) => (want.has(p.rect.id) && p.locked !== true ? { ...p, rect: { ...p.rect, x: p.rect.x + dx, y: p.rect.y + dy } } : p))
      // A held arrow moves every repeat but commits ONCE, on release — one
      // history entry per gesture, like a drag.
      if (commit) commitHistory(next)
      return next
    })
  }, [commitHistory, mergedRef, selectedIdsRef, setPanels])

  const bindPlanSteps = useCallback((itemId: string, stepOf: ReadonlyMap<string, string>): void => {
    setPanels((current) => {
      const next = current.map((p) => {
        const step = stepOf.get(p.rect.id)
        return step === undefined || !isShapePanel(p) ? p : { ...p, shape: { ...p.shape, step: { item: itemId, step } } }
      })
      if (next.some((p, i) => p !== current[i])) commitHistory(next)
      return next
    })
  }, [commitHistory, setPanels])

  // One object for the life of these callbacks: usePaletteActions takes it
  // as a dep, and a fresh literal per render would rebuild every verb on
  // every pan frame (usePaletteActions.ts's header).
  return useMemo(() => ({ addShape, setShapeText, setShapeStyle, onShapePress, onShapeResize, onShapeText, duplicate, copyObjects, pasteObjects, deleteObjects, align, distribute, nudge, bindPlanSteps }),
    [addShape, setShapeText, setShapeStyle, onShapePress, onShapeResize, onShapeText, duplicate, copyObjects, pasteObjects, deleteObjects, align, distribute, nudge, bindPlanSteps])
}

/** Mint a shape and open its label — the keyboard's and quick-connect's way in (M389/M390). */
export function editNewShape(id: string): void {
  // After React has painted the new shape, so the editor mounts into a box.
  requestAnimationFrame(() => { setEditingShape(id) })
}
