import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { screenToWorld, type Viewport } from '@renderer/canvas/viewport'
import type { GroupDragState } from './groups'

export function useGroupDrag({
  hostRef, viewportRef, onDrag, onCommit
}: {
  hostRef: RefObject<HTMLElement | null>
  viewportRef: RefObject<Viewport>
  onDrag(state: GroupDragState, world: { x: number; y: number }): void
  onCommit(state: GroupDragState): void
}): (state: GroupDragState) => void {
  const dragRef = useRef<GroupDragState | null>(null)
  const depsRef = useRef({ hostRef, viewportRef, onDrag, onCommit })
  depsRef.current = { hostRef, viewportRef, onDrag, onCommit }

  useEffect(() => {
    const finish = (): void => {
      const state = dragRef.current
      if (!state) return
      dragRef.current = null
      depsRef.current.onCommit(state)
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
      depsRef.current.onDrag(state, world)
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', finish)
    return () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', finish)
    }
  }, [])

  return useCallback((state: GroupDragState) => { dragRef.current = state }, [])
}
