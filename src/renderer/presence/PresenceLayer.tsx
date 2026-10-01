import { useEffect, useRef, type JSX } from 'react'
import { PRESENCE_RENDER_HZ } from '@shared/presence'
import { latestRoster, onRoster } from './presence-store'
import { paintPresence, type PaintRect, type PaintViewport } from './presence-paint'

export interface PresenceLayerProps {
  workspaceId: string | undefined
  viewport: PaintViewport
  rects: readonly PaintRect[]
}

const FRAME_MS = 1000 / PRESENCE_RENDER_HZ

/**
 * Remote selections and cursors — THE CURSOR LAYER, and the only thing a
 * remote update repaints. A SIBLING of .world (like Marquee): screen-space, so
 * it neither pans with the world transform nor sits inside it where a
 * repaint would invalidate panel layers.
 *
 * A remote update never touches React state. It marks the layer dirty; a
 * scheduler paints at most PRESENCE_RENDER_HZ times a second, on the next
 * animation frame after the slot opens. Props (viewport, rects) are copied
 * into refs on render and mark dirty the same way, so a pan repaints the
 * cursors at 15Hz too rather than on every Canvas render.
 */
export function PresenceLayer({ workspaceId, viewport, rects }: PresenceLayerProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wsRef = useRef(workspaceId)
  const vpRef = useRef(viewport)
  const rectsRef = useRef(rects)
  const dirtyRef = useRef(true)
  const kickRef = useRef<() => void>(() => {})

  if (wsRef.current !== workspaceId || vpRef.current !== viewport || rectsRef.current !== rects) {
    wsRef.current = workspaceId
    vpRef.current = viewport
    rectsRef.current = rects
    dirtyRef.current = true
  }
  useEffect(() => { kickRef.current() })

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return
    const ctx = canvas.getContext('2d')
    if (ctx === null) return
    let size = { w: 0, h: 0, dpr: 1 }
    let lastPaint = 0
    let raf = 0
    let timer: ReturnType<typeof setTimeout> | null = null
    const font = `500 11px ${getComputedStyle(canvas).getPropertyValue('--font-ui') || 'system-ui'}`

    const paint = (): void => {
      raf = 0
      if (!dirtyRef.current) return
      dirtyRef.current = false
      lastPaint = performance.now()
      const byId = new Map(rectsRef.current.map((r) => [r.id, r]))
      paintPresence(ctx, size, latestRoster(wsRef.current)?.peers ?? [], vpRef.current, byId, font)
    }
    const kick = (): void => {
      if (!dirtyRef.current || raf !== 0 || timer !== null) return
      const wait = FRAME_MS - (performance.now() - lastPaint)
      if (wait <= 0) { raf = requestAnimationFrame(paint); return }
      timer = setTimeout(() => { timer = null; raf = requestAnimationFrame(paint) }, wait)
    }
    kickRef.current = kick

    const resize = (): void => {
      const dpr = window.devicePixelRatio || 1
      const w = canvas.clientWidth, h = canvas.clientHeight
      size = { w, h, dpr }
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      dirtyRef.current = true
      kick()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()
    const off = onRoster((roster) => {
      if (roster.workspaceId !== wsRef.current) return
      dirtyRef.current = true
      kick()
    })
    return () => {
      off()
      ro.disconnect()
      if (raf !== 0) cancelAnimationFrame(raf)
      if (timer !== null) clearTimeout(timer)
      kickRef.current = () => {}
    }
  }, [])

  return <canvas ref={canvasRef} className="presence-layer" data-screen-control="" aria-hidden="true" data-presence-layer />
}
