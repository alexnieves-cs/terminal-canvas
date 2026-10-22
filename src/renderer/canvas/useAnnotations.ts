import { type Dispatch, type RefObject, type SetStateAction, useCallback, useEffect, useMemo, useState } from 'react'
import { type Annotation, ANNOTATIONS_MAX, annotationPoint, dropEmptyLabels, resolveAnchor, INK_WIDTH } from '@shared/annotations'
import type { Panel } from '@renderer/panels/panels'
import type { SnapshotMeta } from '@shared/ipc-contract'
import { simplifyStroke } from './viewport'

import type { ShellChrome } from '@renderer/shell/useShellChrome'
/**
 * M507 (E4, the Canvas.tsx split). Notes in the margins (M93) and ink (M155):
 * placing, committing and removing an annotation, entering and leaving
 * annotate mode, a finished stroke, and the time machine's snapshot rows and
 * restore. Lifted out of Canvas VERBATIM as one contiguous run and called at
 * exactly the position it occupied, just below useTaskLens, with one
 * destructured Deps object so every dependency array names the same values.
 */
export interface UseAnnotationsDeps {
  panelsRef: RefObject<Panel[]>
  annotateTool: "draw" | "label"
  annotating: boolean
  annotationSeq: RefObject<number>
  annotations: Annotation[]
  chrome: ShellChrome
  commitInkRef: RefObject<(points: [number, number][], scale: number) => void>
  editingAnnotationRef: RefObject<string | null>
  inkToolRef: RefObject<() => boolean>
  merged: boolean
  mergedRef: RefObject<boolean>
  nextIdRef: RefObject<number>
  panels: Panel[]
  placeAnnotationRef: RefObject<(world: { x: number; y: number; }) => boolean>
  reloadWorkspacesRef: RefObject<(() => void) | null>
  selectedAnnotation: string | null
  setAnnotating: Dispatch<SetStateAction<boolean>>
  setAnnotations: Dispatch<SetStateAction<Annotation[]>>
  setEditingAnnotation: Dispatch<SetStateAction<string | null>>
  setInkDraft: Dispatch<SetStateAction<[number, number][] | null>>
  setSelectedAnnotation: Dispatch<SetStateAction<string | null>>
  shouldIgnoreKeys: () => boolean
  switchWorkspace: (id: string) => Promise<boolean>
}

export function useAnnotations(deps: UseAnnotationsDeps) {
  const {
    annotateTool, annotating, annotationSeq, annotations, chrome, commitInkRef, editingAnnotationRef, inkToolRef, merged, mergedRef, nextIdRef, panels, placeAnnotationRef, reloadWorkspacesRef, selectedAnnotation, setAnnotating, setAnnotations, setEditingAnnotation, setInkDraft, setSelectedAnnotation, shouldIgnoreKeys, switchWorkspace, panelsRef
  } = deps
  // M93. The verbs. Placement resolves the anchor against the panels in paint
  // order (the topmost hit wins). Notes are OUTSIDE the panel history: History
  // is one stack over one Panel[], and widening it is a bigger change than a
  // margin note earns — so deleting a note is not undoable, said plainly in
  // the build log rather than pretended here.
  const placeAnnotation = useCallback((world: { x: number; y: number }): boolean => {
    if (!annotating || mergedRef.current) return false
    const ordered = [...panelsRef.current].sort((a, b) => a.z - b.z)
    const anchor = resolveAnchor(world, ordered)
    const id = `a${Date.now().toString(36)}${(annotationSeq.current++).toString(36)}`
    // M395. No empty label outlives its editor. The one still open is left to
    // its editor, which commits what was typed as it unmounts here (an empty
    // one removes itself); any other empty label is dropped (dropEmptyLabels).
    setAnnotations((current) => [...dropEmptyLabels(current, editingAnnotationRef.current), { id, text: '', anchor }].slice(-ANNOTATIONS_MAX))
    setSelectedAnnotation(id)
    setEditingAnnotation(id)
    return true
  }, [annotating])
  const commitAnnotation = useCallback((id: string, text: string) => {
    setEditingAnnotation((current) => (current === id ? null : current))
    // An empty FRESH note is no note (a mis-click removes itself); an existing
    // note emptied and blurred keeps its text — clearing is not deleting, and
    // Delete is the verb for that.
    setAnnotations((current) => {
      const existing = current.find((a) => a.id === id)
      if (text === '' && existing !== undefined && existing.text !== '') return current
      return text === '' ? current.filter((a) => a.id !== id) : current.map((a) => (a.id === id ? { ...a, text } : a))
    })
    if (text === '') setSelectedAnnotation((current) => (current === id ? null : current))
  }, [])
  const removeAnnotation = useCallback((id: string) => {
    setAnnotations((current) => current.filter((a) => a.id !== id))
    setSelectedAnnotation((current) => (current === id ? null : current))
    setEditingAnnotation((current) => (current === id ? null : current))
  }, [])
  const beginAnnotate = useCallback((): { kind: string; reason?: string } => {
    if (mergedRef.current) return { kind: 'refused', reason: 'the merged view is read-only — leave it to annotate' }
    setAnnotating(true)
    return { kind: 'entered' }
  }, [])
  // M395. Done closes the open label too: its editor commits what was typed
  // as it unmounts (AnnotationLayer's NoteEditor), and a label left with
  // nothing in it is removed rather than kept as "…".
  const endAnnotate = useCallback(() => {
    setAnnotating(false)
    setInkDraft(null)
    setEditingAnnotation(null)
    setAnnotations((current) => {
      const next = dropEmptyLabels(current, editingAnnotationRef.current)
      return next.length === current.length ? current : next
    })
  }, [])
  placeAnnotationRef.current = placeAnnotation
  // M155. A finished stroke: anchored by its FIRST point (a stroke that starts
  // on a panel belongs to it — the label's own rule), its points stored
  // RELATIVE to that anchor point and simplified so a slow hand does not keep
  // a thousand of them; selected on commit so Delete is one keystroke away.
  // Like a label (M93), a stroke is OUTSIDE history: Delete is not undoable,
  // said here and in the build log rather than pretended.
  const commitInk = useCallback((points: Array<[number, number]>, scale: number) => {
    if (!annotating || mergedRef.current || points.length < 2) return
    if (!points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))) return
    const ordered = [...panelsRef.current].sort((a, b) => a.z - b.z)
    const first = { x: points[0]![0], y: points[0]![1] }
    const anchor = resolveAnchor(first, ordered)
    // Relative to the ANCHOR POINT for both kinds — the point the painter adds.
    // The first cut measured a panel stroke from the panel's top-left, and the
    // painter (through annotationPoint) added dx,dy a second time: every
    // stroke drawn on a panel sat offset by its own start (the M155 critic).
    // The tolerance is 0.75 SCREEN px, through the scale the stroke was drawn at.
    const rel = simplifyStroke(points, 0.75 / Math.max(scale, 0.01)).map(([x, y]) => [x - first.x, y - first.y] as [number, number])
    const id = `k${Date.now().toString(36)}${(annotationSeq.current++).toString(36)}`
    setAnnotations((current) => [...current, { id, text: '', anchor, ink: { points: rel, width: INK_WIDTH } }].slice(-ANNOTATIONS_MAX))
    setSelectedAnnotation(id)
  }, [annotating])
  inkToolRef.current = () => annotating && annotateTool === 'draw'
  commitInkRef.current = commitInk
  // Delete removes the selected note; Escape clears the selection or leaves the mode.
  useEffect(() => {
    if (selectedAnnotation === null && !annotating) return
    const onKey = (event: KeyboardEvent): void => {
      if (shouldIgnoreKeys()) return
      const active = document.activeElement
      if (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement || active instanceof HTMLSelectElement || (active instanceof HTMLElement && active.isContentEditable)) return
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedAnnotation !== null) {
        event.preventDefault()
        removeAnnotation(selectedAnnotation)
      } else if (event.key === 'Escape') {
        event.preventDefault()
        if (selectedAnnotation !== null) setSelectedAnnotation(null)
        else setAnnotating(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [selectedAnnotation, annotating, shouldIgnoreKeys, removeAnnotation])
  // A panel-anchored note whose panel is gone draws nothing (annotationPoint
  // is null) and is dropped by the parser on the next load — NOT pruned here
  // on every panels change: undo of a panel's removal would otherwise have
  // pruned its note for good (the verifier). The mode ends when the view merges.
  useEffect(() => { if (merged) { setAnnotating(false); setSelectedAnnotation(null); setEditingAnnotation(null) } }, [merged])
  // M93. The time machine's rows: read when the Workspaces pane is on screen
  // and after every restore; null until the first answer (three states).
  const [snapshots, setSnapshots] = useState<SnapshotMeta[] | null>(null)
  const readSnapshots = useCallback(() => {
    void window.canvas.snapshot.list().then(setSnapshots).catch(() => setSnapshots([]))
  }, [])
  useEffect(() => { if (chrome.navigator === 'workspaces') readSnapshots() }, [chrome.navigator, readSnapshots])
  const restoreSnapshot = useCallback((at: number) => {
    if (mergedRef.current) return
    // The renderer's own id counter rides along: a panel spawned inside the
    // store's coalesce window is not on disk yet, and main mints past both.
    void window.canvas.snapshot.restore(at, nextIdRef.current).then(async (result) => {
      if (result.kind === 'refused') { console.warn(`[snapshot] ${result.reason}`); return }
      // A new workspace exists on disk; the list re-reads, then the ordinary
      // switch — the same transaction a click on a workspace row runs.
      await reloadWorkspacesRef.current?.()
      await switchWorkspace(result.workspaceId)
      readSnapshots()
    })
  }, [switchWorkspace, readSnapshots])
  const annotationMarks = useMemo(() => annotations.flatMap((a) => { const p = annotationPoint(a, panels); return p === null ? [] : [p] }), [annotations, panels])


  return { annotationMarks, beginAnnotate, commitAnnotation, endAnnotate, restoreSnapshot, snapshots }
}
