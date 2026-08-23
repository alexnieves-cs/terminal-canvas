import { useRef, useState, type JSX, type MouseEvent } from 'react'
import { PlaceholderPanel } from './PlaceholderPanel'
import { useViewport } from './useViewport'
import { hitTest, screenToWorld, type WorldRect } from './viewport'

export interface CanvasProps {
  rects: WorldRect[]
}

export function Canvas({ rects }: CanvasProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewport = useViewport(hostRef, rects)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const onClick = (event: MouseEvent<HTMLDivElement>): void => {
    const host = hostRef.current
    if (!host) return
    const bounds = host.getBoundingClientRect()
    const local = { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
    setSelectedId(hitTest(rects, screenToWorld(local, viewport)))
  }

  return (
    <div className="canvas" ref={hostRef} onClick={onClick}>
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
    </div>
  )
}
