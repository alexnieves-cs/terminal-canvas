import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { canArrange, type CanvasSharedView, type SharedPanel, type SharedSaveMeta } from '@shared/canvas-ops'
import type { CanvasWriteThrough } from '../canvas/panel-interaction'
import type { WorldRect } from '../canvas/viewport'
import type { Panel } from '../panels/panels'
import type { CanvasGroup } from '../groups/groups'
import { GROUP_COLOURS, type GroupColour } from '@shared/groups'

export interface SharedCanvasDeps {
  setPanels: Dispatch<SetStateAction<Panel[]>>
  setGroups: Dispatch<SetStateAction<CanvasGroup[]>>
  /** A peer resized a panel hosted here: one refit, never one per frame (Canvas.tsx's onCommit rule). */
  refit(panelId: string): void
}

export interface SharedCanvas {
  /** Null on an unshared workspace — then nothing below does anything. */
  view: CanvasSharedView | null
  placeholders: readonly SharedPanel[]
  /** usePanelDrag's write-through, current for the active workspace's share and role. */
  writeThroughRef: React.RefObject<CanvasWriteThrough | null>
  /**
   * layout:save's second argument: the seq of the view THIS RENDER's state
   * came from. A value, not a ref read at save time — a save effect from a
   * render committed before a view arrived must carry the OLD ack, or main
   * would take that render's stale rects as a local edit.
   */
  saveMeta: SharedSaveMeta | undefined
  isPlaceholder(id: string): boolean
  /** A placeholder dragged here: moved locally at once, and written through by the drag itself. */
  movePlaceholder(id: string, rect: WorldRect): void
  /** Take a placeholder off the shared canvas (an owner's tombstone). Main answers the verdict. */
  removePlaceholder(id: string): Promise<{ ok: true } | { ok: false; reason: string }>
  mayArrange: boolean
  mayRemove(p: SharedPanel): boolean
}

/**
 * The renderer's half of the shared canvas. It never holds the Y.Doc (yjs has
 * no door in the renderer — src/renderer/CLAUDE.md): main pushes a VIEW, this
 * applies it to Canvas state, and the next layout:save carries `sharedAck`,
 * the seq of the view it applied — main's guard against this renderer's lag
 * writing a peer's move back over itself (canvas-sync.ts's header).
 *
 * A view's rects are applied WITHOUT a history entry: a teammate's move is
 * not something Cmd+Z here should undo.
 */
export function useSharedCanvas(deps: SharedCanvasDeps): SharedCanvas {
  const [view, setView] = useState<CanvasSharedView | null>(null)
  const [placeholders, setPlaceholders] = useState<readonly SharedPanel[]>([])
  const [ack, setAck] = useState(0)
  const [me, setMe] = useState<string | null>(null)
  const viewRef = useRef<CanvasSharedView | null>(null)
  const depsRef = useRef(deps)
  depsRef.current = deps

  useEffect(() => {
    let live = true
    const apply = (next: CanvasSharedView | null): void => {
      if (!live) return
      viewRef.current = next
      setView(next)
      setPlaceholders(next?.placeholders ?? [])
      if (next === null) { setAck(0); return }
      const d = depsRef.current
      if (next.rects.length > 0) {
        const byId = new Map(next.rects.map((r) => [r.id, r]))
        const resized: string[] = []
        d.setPanels((current) => current.map((p) => {
          const r = byId.get(p.rect.id)
          if (r === undefined) return p
          if (p.rect.x === r.x && p.rect.y === r.y && p.rect.w === r.w && p.rect.h === r.h && p.z === r.z) return p
          if (p.rect.w !== r.w || p.rect.h !== r.h) resized.push(p.rect.id)
          return { ...p, rect: { id: p.rect.id, x: r.x, y: r.y, w: r.w, h: r.h }, z: r.z }
        }))
        queueMicrotask(() => { for (const id of resized) depsRef.current.refit(id) })
      }
      if (next.groups !== undefined) {
        d.setGroups(next.groups
          .filter((g) => (GROUP_COLOURS as readonly string[]).includes(g.colour))
          .map((g) => ({ id: g.id, label: g.label, colour: g.colour as GroupColour, panelIds: [...g.panelIds], ...(g.collapsed === true ? { collapsed: true } : {}) })))
      }
      // Batched with the setPanels/setGroups above, so the render that holds
      // this view's state is the first to carry its seq.
      setAck(next.seq)
    }
    void window.canvas.sharedCanvas.view().then(apply, () => {})
    void window.canvas.auth.sessions().then((s) => { if (live) setMe(s[0]?.userId ?? null) }, () => {})
    const off = window.canvas.sharedCanvas.onView(apply)
    return () => { live = false; off() }
  }, [])

  const role = view?.role ?? null
  const mayArrange = view !== null && canArrange(role)

  const writeThroughRef = useRef<CanvasWriteThrough | null>(null)
  writeThroughRef.current = useMemo<CanvasWriteThrough | null>(() => view === null ? null : ({
    canArrange: () => canArrange(viewRef.current?.role ?? null),
    write: (panelId, fields) => { void window.canvas.sharedCanvas.op({ kind: 'rect', panelId, fields }) }
  }), [view === null])
  // Who "me" is can change with a sign-in; re-read when the share appears.
  useEffect(() => {
    if (view === null) return
    void window.canvas.auth.sessions().then((s) => setMe(s[0]?.userId ?? null), () => {})
  }, [view === null])

  const placeholderIds = useMemo(() => new Set(placeholders.map((p) => p.id)), [placeholders])

  return {
    view,
    placeholders,
    writeThroughRef,
    saveMeta: useMemo(() => (view === null ? undefined : { sharedAck: ack }), [view === null, ack]),
    isPlaceholder: useCallback((id: string) => placeholderIds.has(id), [placeholderIds]),
    movePlaceholder: useCallback((id: string, rect: WorldRect) => {
      setPlaceholders((current) => current.map((p) => (p.id === id ? { ...p, x: rect.x, y: rect.y, w: rect.w, h: rect.h } : p)))
    }, []),
    removePlaceholder: useCallback(async (id: string) => {
      const verdict = await window.canvas.sharedCanvas.op({ kind: 'delete', panelId: id })
      if (verdict.ok) setPlaceholders((current) => current.filter((p) => p.id !== id))
      return verdict
    }, []),
    mayArrange,
    // The table's delete row (canvas-ops.ts): the workspace owner, or the panel's own.
    mayRemove: useCallback((p: SharedPanel) => role === 'owner' || (role === 'editor' && me !== null && p.owner === me), [role, me])
  }
}
