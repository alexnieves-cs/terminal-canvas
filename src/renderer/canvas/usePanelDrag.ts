import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { applyDrag, type DragMode, type DragState } from './panel-interaction'
import { screenToWorld, type Viewport, type WorldRect } from './viewport'

export interface PanelDragDeps {
  hostRef: RefObject<HTMLElement | null>
  /** Read through a ref: viewport changes on every wheel event. */
  viewportRef: RefObject<Viewport>
  /** Called on every move with the rect this gesture implies. */
  onDrag(panelId: string, rect: WorldRect): void
  /** Called once on release, so a resize sends at most one pty:resize. */
  onCommit(panelId: string, mode: DragMode): void
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
export function usePanelDrag(deps: PanelDragDeps): (state: DragState) => void {
  const dragRef = useRef<DragState | null>(null)
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

    const onUp = (): void => {
      const state = dragRef.current
      if (!state) return
      dragRef.current = null
      depsRef.current.onCommit(state.panelId, state.mode)
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
      // applyDrag is handed the UNCHANGED state every frame, so the rect is
      // derived from the mousedown origin rather than from the previous
      // frame's result — see the note on applyDrag.
      depsRef.current.onDrag(state.panelId, applyDrag(state, world))
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [])

  return useCallback((state: DragState) => {
    dragRef.current = state
  }, [])
}
