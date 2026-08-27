import { useEffect, useRef, useState, type JSX } from 'react'
import { edgeIndicator, type Size, type Viewport, type WorldRect } from './viewport'

export interface EdgeIndicatorsProps {
  /** Every panel's rect, so a waiting id can be located. */
  rects: WorldRect[]
  viewport: Viewport
  /** The wants-you queue, from agent-state-store's useAttentionIds. */
  ids: string[]
}

/**
 * Arrows on the viewport edge, one per panel that wants you and is out of
 * view.
 *
 * CHROME, deliberately outside `.world`: the pips' POSITIONS are world-space
 * facts, but their rendering is not. Inside the transform they would scale
 * with the zoom and pan off screen with the very panels they point at — i.e.
 * the arrow leaves exactly when it becomes useful.
 *
 * pointer-events: none. A clickable pip would be a fourth navigation verb, and
 * its mousedown would land on `.canvas`'s background handler — which clears
 * focus, hit-tests a world point and WAKES whatever it finds, the trap
 * Palette.tsx's own stopPropagation guard documents. Cmd+J is the way to act
 * on one.
 */
export function EdgeIndicators({ rects, viewport, ids }: EdgeIndicatorsProps): JSX.Element | null {
  const hostRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<Size | null>(null)

  // The layer measures ITSELF rather than being handed a size from Canvas.
  // Canvas holds no window size today (every consumer measures at event time),
  // and adding one would re-render every panel on every resize frame — the
  // 60Hz cascade TerminalPanel's memo exists to block. This observer re-renders
  // the pip layer and nothing else.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const observer = new ResizeObserver(() => {
      const box = host.getBoundingClientRect()
      setSize({ width: box.width, height: box.height })
    })
    observer.observe(host)
    const box = host.getBoundingClientRect()
    setSize({ width: box.width, height: box.height })
    return () => observer.disconnect()
  }, [])

  const pips: Array<{ id: string; x: number; y: number; angle: number }> = []
  if (size) {
    for (const id of ids) {
      const rect = rects.find((r) => r.id === id)
      if (!rect) continue
      const pip = edgeIndicator(rect, viewport, size)
      if (pip) pips.push({ id, ...pip })
    }
  }

  // The host stays mounted even with nothing to draw: it is what the observer
  // measures, and unmounting it on an empty queue would mean the first pip of
  // the run renders one frame late, with no size yet.
  return (
    <div className="edge-indicators" ref={hostRef}>
      {pips.map((pip) => (
        <div
          key={pip.id}
          className="edge-indicator"
          data-panel-id={pip.id}
          style={{
            transform: `translate(${pip.x}px, ${pip.y}px) translate(-50%, -50%) rotate(${pip.angle}rad)`
          }}
        />
      ))}
    </div>
  )
}
