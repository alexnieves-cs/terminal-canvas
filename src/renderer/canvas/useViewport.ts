import { useEffect, useRef, useState, type RefObject } from 'react'
import { normalizeWheel } from './canvas-input'
import { fitTo, panBy, screenToWorld, zoomAt, type Point, type Viewport, type WorldRect } from './viewport'

const INITIAL: Viewport = { x: 120, y: 120, scale: 1 }
const KEYBOARD_ZOOM_STEP = 1.2

/**
 * Returns the current viewport. The setter stays private: nothing outside this
 * hook has a reason to move the camera, and exporting it would invite panel
 * code to reach past the gesture layer.
 */
export function useViewport(
  hostRef: RefObject<HTMLElement | null>,
  rects: WorldRect[],
  onSpawn?: (worldCentre: Point) => void,
  shouldYieldWheel?: (event: WheelEvent) => boolean
): Viewport {
  const [viewport, setViewport] = useState<Viewport>(INITIAL)
  const viewportRef = useRef(viewport)
  viewportRef.current = viewport

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const onWheel = (event: WheelEvent): void => {
      // Wheel ownership. A wheel over the focused panel belongs to that
      // terminal's scrollback; every other wheel belongs to the camera.
      //
      // Returning WITHOUT preventDefault is deliberate: xterm's own handler is
      // bound to a descendant and has already run in the target phase by the
      // time this bubbles up, so all this has to do is decline. Calling
      // preventDefault here would suppress nothing useful and would fight the
      // scroll xterm just performed.
      //
      // ctrlKey is exempt unconditionally: a trackpad pinch arrives as a wheel
      // with ctrlKey true, and a pinch is always a camera zoom no matter what
      // is under the cursor.
      if (!event.ctrlKey && shouldYieldWheel?.(event)) return

      // Chromium treats ctrl+wheel as its own page-zoom gesture. Without this
      // a pinch zooms the entire UI instead of the canvas. React's onWheel
      // prop cannot do this reliably, which is why the listener is attached
      // here with passive: false — on a passive listener preventDefault does
      // not throw, it silently does nothing.
      event.preventDefault()

      const bounds = host.getBoundingClientRect()
      const anchor = { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
      const intent = normalizeWheel(event)

      setViewport((vp) =>
        intent.kind === 'zoom'
          ? zoomAt(vp, anchor, intent.factor)
          : panBy(vp, intent.dx, intent.dy)
      )
    }

    host.addEventListener('wheel', onWheel, { passive: false })
    return () => host.removeEventListener('wheel', onWheel)
  }, [hostRef, shouldYieldWheel])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // Cmd is required for every canvas shortcut. Agent TUIs claim essentially
      // every bare key, so from M3 a bare keystroke must always reach the PTY.
      if (!event.metaKey) return
      if (event.ctrlKey || event.altKey) return

      const host = hostRef.current
      if (!host) return
      const bounds = host.getBoundingClientRect()
      const centre = { x: bounds.width / 2, y: bounds.height / 2 }
      const size = { width: bounds.width, height: bounds.height }

      switch (event.key) {
        case '0':
          event.preventDefault()
          setViewport(INITIAL)
          break
        case '1':
          event.preventDefault()
          setViewport(fitTo(rects, size))
          break
        case '=':
        case '+':
          event.preventDefault()
          setViewport((vp) => zoomAt(vp, centre, KEYBOARD_ZOOM_STEP))
          break
        case '-':
          event.preventDefault()
          setViewport((vp) => zoomAt(vp, centre, 1 / KEYBOARD_ZOOM_STEP))
          break
        case 'n':
          // Cmd+N spawns at the viewport centre in WORLD coordinates, so a
          // panel appears where you are looking at any zoom.
          event.preventDefault()
          onSpawn?.(screenToWorld(centre, viewportRef.current))
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [hostRef, rects, onSpawn])

  return viewport
}
