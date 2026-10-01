import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { screenToWorld, type Viewport } from '@renderer/canvas/viewport'
import { DRAG_SLOP_PX } from '@renderer/canvas/usePanelDrag'
import type { GroupDragState } from './groups'

export function useGroupDrag({
  hostRef, viewportRef, onDrag, onCommit
}: {
  hostRef: RefObject<HTMLElement | null>
  viewportRef: RefObject<Viewport>
  /** M395. `free` is ⌘ held on this frame of the drag: the group does not snap. */
  onDrag(state: GroupDragState, world: { x: number; y: number }, free: boolean): void
  onCommit(state: GroupDragState): void
}): (state: GroupDragState) => void {
  const dragRef = useRef<GroupDragState | null>(null)
  // M408 follow-up. The panel drag's slop, for a group: a press on the header
  // is a click until the pointer leaves it by DRAG_SLOP_PX on screen, and a
  // click commits nothing (the raise commits itself, onBeginGroupDrag). It
  // only DELAYS the first frame — the origin is never rebased (applyDrag's rule).
  const movedRef = useRef(false)
  const depsRef = useRef({ hostRef, viewportRef, onDrag, onCommit })
  depsRef.current = { hostRef, viewportRef, onDrag, onCommit }

  useEffect(() => {
    const finish = (): void => {
      const state = dragRef.current
      if (!state) return
      dragRef.current = null
      const moved = movedRef.current
      movedRef.current = false
      if (moved) depsRef.current.onCommit(state)
    }
    const move = (event: MouseEvent): void => {
      const state = dragRef.current
      if (!state) return
      if (event.buttons === 0) { finish(); return }
      const host = depsRef.current.hostRef.current
      if (!host) return
      const bounds = host.getBoundingClientRect()
      const world = screenToWorld(
        { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
        depsRef.current.viewportRef.current
      )
      if (!movedRef.current) {
        const origin = state.members[0]?.originWorld
        const scale = depsRef.current.viewportRef.current?.scale ?? 1
        if (origin !== undefined && Math.hypot(world.x - origin.x, world.y - origin.y) * scale < DRAG_SLOP_PX) return
        movedRef.current = true
      }
      depsRef.current.onDrag(state, world, event.metaKey)
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', finish)
    return () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', finish)
    }
  }, [])

  return useCallback((state: GroupDragState) => { movedRef.current = false; dragRef.current = state }, [])
}
