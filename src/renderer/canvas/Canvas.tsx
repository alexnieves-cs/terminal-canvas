import { useRef, useState, type JSX, type MouseEvent } from 'react'
import { CanvasHud } from './CanvasHud'
import { PlaceholderPanel } from './PlaceholderPanel'
import { useViewport } from './useViewport'
import { hitTest, screenToWorld, type Point, type WorldRect } from './viewport'

export interface CanvasProps {
  rects: WorldRect[]
}

export function Canvas({ rects }: CanvasProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewport = useViewport(hostRef, rects)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [cursor, setCursor] = useState<Point>({ x: 0, y: 0 })

  /** The one place client coordinates become canvas-local coordinates. */
  const toWorld = (event: MouseEvent<HTMLDivElement>): Point | null => {
    const host = hostRef.current
    if (!host) return null
    const bounds = host.getBoundingClientRect()
    return screenToWorld(
      { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
      viewport
    )
  }

  const onClick = (event: MouseEvent<HTMLDivElement>): void => {
    const world = toWorld(event)
    if (world) setSelectedId(hitTest(rects, world))
  }

  const onMouseMove = (event: MouseEvent<HTMLDivElement>): void => {
    const world = toWorld(event)
    if (world) setCursor(world)
  }

  return (
    <div className="canvas" ref={hostRef} onClick={onClick} onMouseMove={onMouseMove}>
      <div
        className="world"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`
        }}
      >
        {rects.map((rect) => (
          <PlaceholderPanel key={rect.id} rect={rect} selected={rect.id === selectedId} />
        ))}
      </div>
      <CanvasHud viewport={viewport} cursor={cursor} selectedId={selectedId} />
    </div>
  )
}
