import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { applyDrag, arrangeable, changedFields, type CanvasWriteThrough, type DragState } from './panel-interaction'
import { screenToWorld, type Viewport, type WorldRect } from './viewport'
import { MOTION_SURFACE_MS } from '@renderer/motion'

export interface PanelDragDeps {
  hostRef: RefObject<HTMLElement | null>
  /** Read through a ref: viewport changes on every wheel event. */
  viewportRef: RefObject<Viewport>
  /**
   * Called on every move with the rect this gesture implies, and the gesture
   * itself (M50: a snap needs to know a resize's moving edges). Returns the
   * rect it SETTLED on — after snapping — when it has one, so the
   * write-through sends where the panel is, not where the cursor is.
   */
  onDrag(panelId: string, rect: WorldRect, state: DragState, alreadySnapped?: boolean): WorldRect | void
  /**
   * M390. A move of SEVERAL members snaps as ONE rect — their bounding rect —
   * the way a group drag always has (M50): per-member snapping shears a
   * selected diagram apart, each shape stopping on a different neighbour.
   * Returns the world delta to add to every member; absent keeps the old
   * per-member path.
   */
  snapMany?(rects: readonly WorldRect[], ids: ReadonlySet<string>): { dx: number; dy: number }
  /**
   * Called once on release for the whole gesture. A group move carries one
   * immutable state per member, so this is the one place its history entry
   * can be committed exactly once.
   */
  onCommit(states: readonly DragState[]): void
  /**
   * The shared canvas (panel-interaction.ts's CanvasWriteThrough). Read
   * through a ref at use: the workspace's share and this person's role change
   * underneath an installed listener. Null — or an absent ref — is an
   * unshared canvas.
   */
  writeThroughRef?: RefObject<CanvasWriteThrough | null>
}

/**
 * Runs one panel gesture at a time and returns the function that starts it.
 *
 * The move/up listeners go on `document`, for the same reason xterm's do: the
 * cursor leaves the panel constantly during a drag, and a listener on the
 * panel stops receiving events the moment it does.
 *
 * These listeners do not collide with xterm-pointer.ts's capture-phase
 * interceptor. That interceptor only corrects a gesture whose mousedown landed
 * inside a `.panel__slot`; a panel drag begins on the chrome bar or a resize
 * handle, neither of which is inside the slot, so it never activates.
 *
 * Closing a panel mid-drag needs no abort path. Both effects of a gesture are
 * already inert once the panel is gone: setPanelRect maps over the array and
 * matches nothing, and registry.refit(id) returns early on a missing session.
 */
export function usePanelDrag(deps: PanelDragDeps): (states: readonly DragState[]) => void {
  const dragRef = useRef<readonly DragState[] | null>(null)
  /** Per member, the rect last written through — so a frame sends only what moved. */
  const writtenRef = useRef(new Map<string, WorldRect>())
  const settleTimersRef = useRef(new Map<string, number>())
  const movedRef = useRef(false)
  // Mirrored so the document listeners, installed once, always call the
  // current callbacks without being torn down and rebuilt every render.
  const depsRef = useRef(deps)
  depsRef.current = deps

  useEffect(() => {
    const toWorld = (event: MouseEvent): { x: number; y: number } | null => {
      const host = depsRef.current.hostRef.current
      const viewport = depsRef.current.viewportRef.current
      if (!host || !viewport) return null
      const bounds = host.getBoundingClientRect()
      return screenToWorld(
        { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
        viewport
      )
    }

    const panelElement = (id: string): HTMLElement | null => {
      for (const node of document.querySelectorAll<HTMLElement>('[data-panel-id]')) {
        if (node.dataset.panelId === id) return node
      }
      return null
    }

    const settle = (states: readonly DragState[]): void => {
      for (const state of states) {
        if (state.mode.kind !== 'move') continue
        const panel = panelElement(state.panelId)
        panel?.removeAttribute('data-panel-dragging')
        panel?.setAttribute('data-panel-settling', '')
        const previous = settleTimersRef.current.get(state.panelId)
        if (previous !== undefined) window.clearTimeout(previous)
        // M395: the settle runs on --dur-2 (styles.css panel-settle); the
        // attribute outlasts it by a frame or two.
        const timer = window.setTimeout(() => {
          panelElement(state.panelId)?.removeAttribute('data-panel-settling')
          settleTimersRef.current.delete(state.panelId)
        }, MOTION_SURFACE_MS + 60)
        settleTimersRef.current.set(state.panelId, timer)
      }
    }

    const onUp = (): void => {
      const state = dragRef.current
      if (!state) return
      dragRef.current = null
      // A gesture begins on mousedown, so a click-to-select is a drag with no
      // move; settling it would bounce every panel a person merely selects.
      if (movedRef.current) settle(state)
      movedRef.current = false
      depsRef.current.onCommit(state)
    }

    const onMove = (event: MouseEvent): void => {
      const state = dragRef.current
      if (!state) return
      // A move with no button held cannot be part of a drag, so treat it as
      // the release the mouseup should have been. Electron does not reliably
      // deliver mouseup when the button goes up outside the window (another
      // app, a system dialog stealing focus), and a gesture that outlives its
      // mouseup would silently resume on the next bare hover — the panel
      // teleporting under a cursor with no button down. This is the same
      // defect class, and the same guard, as xterm-pointer.ts's pin release;
      // the two belong together.
      if (event.buttons === 0) {
        onUp()
        return
      }
      const world = toWorld(event)
      if (!world) return
      // The lift arrives with the first real move, not the press, for the
      // same reason the settle waits for one: a click is not a gesture.
      if (!movedRef.current) {
        movedRef.current = true
        for (const member of state) {
          if (member.mode.kind !== 'move') continue
          const panel = panelElement(member.panelId)
          panel?.removeAttribute('data-panel-settling')
          panel?.setAttribute('data-panel-dragging', '')
        }
      }
      // Every member is handed its own UNCHANGED state every frame, so each
      // rect is derived from its mousedown origin rather than the preceding
      // frame or a group bounding box — see applyDrag's own note.
      const through = depsRef.current.writeThroughRef?.current ?? null
      const snapMany = depsRef.current.snapMany
      const together = snapMany !== undefined && state.length > 1 && state.every((m) => m.mode.kind === 'move')
      let shift = { dx: 0, dy: 0 }
      if (together) {
        const rects = state.map((m) => applyDrag(m, world))
        shift = snapMany(rects, new Set(state.map((m) => m.panelId)))
      }
      for (const member of state) {
        const raw = applyDrag(member, world)
        const implied = together ? { ...raw, x: raw.x + shift.dx, y: raw.y + shift.dy } : raw
        const settled = depsRef.current.onDrag(member.panelId, implied, member, together) ?? implied
        if (through === null) continue
        const fields = changedFields(writtenRef.current.get(member.panelId) ?? member.originRect, settled)
        if (Object.keys(fields).length === 0) continue
        writtenRef.current.set(member.panelId, settled)
        through.write(member.panelId, fields)
      }
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      for (const timer of settleTimersRef.current.values()) window.clearTimeout(timer)
      settleTimersRef.current.clear()
      for (const node of document.querySelectorAll<HTMLElement>('[data-panel-dragging], [data-panel-settling]')) {
        node.removeAttribute('data-panel-dragging')
        node.removeAttribute('data-panel-settling')
      }
    }
  }, [])

  return useCallback((requested: readonly DragState[]) => {
    // A role that may not arrange a panel never lifts it: the gesture is
    // refused before the first frame, not undone after it.
    const states = arrangeable(requested, depsRef.current.writeThroughRef?.current ?? null)
    writtenRef.current.clear()
    if (states.length === 0) return
    for (const state of states) {
      const previous = settleTimersRef.current.get(state.panelId)
      if (previous !== undefined) window.clearTimeout(previous)
      settleTimersRef.current.delete(state.panelId)
    }
    movedRef.current = false
    dragRef.current = states
  }, [])
}
