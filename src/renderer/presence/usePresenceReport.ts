import { useEffect, useRef, type RefObject } from 'react'
import { PRESENCE_RENDER_HZ, type LocalPresence } from '@shared/presence'
import { screenToWorld, type Viewport } from '../canvas/viewport'
import { localTextCursor, onLocalTextCursor } from '../shared-text/text-cursor'

const FRAME_MS = 1000 / PRESENCE_RENDER_HZ

export interface PresenceReportDeps {
  hostRef: RefObject<HTMLElement | null>
  workspaceId: string | undefined
  viewport: Viewport
  focusedId: string | null
  selectedIds: readonly string[]
  mode: string
  /** The task the person is on, for the Team view's tile; main scrubs it before publishing. */
  currentTask: string
}

/**
 * The renderer's half of presence: what only it knows, sent to main at most
 * PRESENCE_RENDER_HZ times a second (leading and trailing, so the last
 * position always lands). The cursor is WORLD coordinates — a peer at another
 * zoom paints it on the same spot — and is tracked from its own passive
 * listener, so presence adds no work to Canvas's own mousemove handler.
 */
export function usePresenceReport({ hostRef, workspaceId, viewport, focusedId, selectedIds, mode, currentTask }: PresenceReportDeps): void {
  const cursorRef = useRef<{ x: number; y: number } | null>(null)
  const vpRef = useRef(viewport)
  vpRef.current = viewport
  const pendingRef = useRef<LocalPresence | null>(null)
  const lastSentRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sendRef = useRef<(next: LocalPresence) => void>(() => {})
  sendRef.current = (next) => {
    pendingRef.current = next
    if (timerRef.current !== null) return
    const flush = (): void => {
      timerRef.current = null
      const p = pendingRef.current
      if (p === null) return
      pendingRef.current = null
      lastSentRef.current = performance.now()
      void window.canvas.presence.report(p).catch(() => {})
    }
    const wait = FRAME_MS - (performance.now() - lastSentRef.current)
    if (wait <= 0) flush()
    else timerRef.current = setTimeout(flush, wait)
  }

  const stateRef = useRef({ workspaceId, focusedId, selectedIds, mode, currentTask })
  stateRef.current = { workspaceId, focusedId, selectedIds, mode, currentTask }
  const report = (): void => {
    const s = stateRef.current
    if (s.workspaceId === undefined) return
    const v = vpRef.current
    sendRef.current({
      workspaceId: s.workspaceId,
      currentPanelId: s.focusedId,
      cursor: cursorRef.current,
      viewport: { x: v.x, y: v.y, scale: v.scale },
      selection: [...s.selectedIds],
      textCursor: localTextCursor(),
      mode: s.mode,
      currentTask: s.currentTask
    })
  }
  const reportRef = useRef(report)
  reportRef.current = report

  const selectionKey = selectedIds.join('\u0001')
  useEffect(() => { reportRef.current() }, [workspaceId, viewport, focusedId, selectionKey, mode, currentTask])
  // A shared file's caret, from the editor's own listener (shared-text/binding.ts).
  useEffect(() => onLocalTextCursor(() => { reportRef.current() }), [])

  useEffect(() => {
    const host = hostRef.current
    if (host === null) return
    const move = (e: MouseEvent): void => {
      const box = host.getBoundingClientRect()
      cursorRef.current = screenToWorld({ x: e.clientX - box.left, y: e.clientY - box.top }, vpRef.current)
      reportRef.current()
    }
    const leave = (): void => { cursorRef.current = null; reportRef.current() }
    host.addEventListener('mousemove', move, { passive: true })
    host.addEventListener('mouseleave', leave)
    return () => {
      host.removeEventListener('mousemove', move)
      host.removeEventListener('mouseleave', leave)
      if (timerRef.current !== null) { clearTimeout(timerRef.current); timerRef.current = null }
    }
  }, [hostRef])
}
