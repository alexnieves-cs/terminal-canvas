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

  // `rects` is mirrored into a ref for the same reason `viewport` is: it is a
  // fresh array on every setPanelRect, and setPanelRect now runs on every
  // frame of a drag or resize. Keeping it in the keydown effect's dep list
  // would tear the window listener down and reinstall it at 60Hz for the
  // whole gesture. Only Cmd+1 reads it, and it reads it at keypress time.
  const rectsRef = useRef(rects)
  rectsRef.current = rects

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    // Wheel ownership needs the CAPTURE phase, not bubble. xterm's own wheel
    // handler is bound to a descendant panel and runs in the target phase —
    // by the time a bubble-phase listener on the host sees the event, xterm
    // has already scrolled. A bubble-phase guard can only ask "should the
    // camera ALSO react", which double-handles every unfocused panel's
    // scroll (the camera pans while that panel's scrollback silently moves
    // too). Capture runs first, so it can decide ownership before either
    // side acts: yield to the focused panel by doing nothing and letting the
    // event continue downward, or claim it for the camera by stopping it
    // from ever reaching xterm.
    const onWheel = (event: WheelEvent): void => {
      // A zoom gesture is always the camera's, never a terminal scroll,
      // regardless of what is under the cursor — so it is stopped here
      // unconditionally, same as the focus check below. Both spellings are
      // exempt because canvas-input.ts treats both as a zoom intent: a
      // trackpad pinch arrives as a wheel with ctrlKey true, and Cmd+wheel is
      // the mouse equivalent. Exempting only ctrlKey would leave a mouse user
      // who has clicked into a panel unable to zoom the canvas while the
      // cursor is over it — and would make Cmd, the modifier every other
      // canvas shortcut requires, the one thing the canvas ignores here.
      const isZoomGesture = event.ctrlKey || event.metaKey
      const overFocused = !isZoomGesture && shouldYieldWheel?.(event)

      if (overFocused) {
        // Let the event fall through to the target/bubble phases undisturbed
        // so xterm's own handler scrolls that terminal. No preventDefault,
        // no stopPropagation — this is the one case where the terminal wins.
        return
      }

      // Everything else (background, or a wheel over a panel that is not
      // focused) belongs to the camera. stopPropagation here, in capture,
      // is what stops xterm's target-phase handler from ever running —
      // without it an unfocused panel would scroll its scrollback AND the
      // canvas would pan on the same gesture.
      event.stopPropagation()

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

    // shouldYieldWheel must stay referentially stable (Canvas.tsx supplies it
    // via useCallback with an empty dep list) — it is in this effect's dep
    // array, and a non-memoized function here would tear the listener down
    // and reinstall it on every render, i.e. at 60Hz during a pan/zoom
    // gesture that itself triggers re-renders.
    host.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => host.removeEventListener('wheel', onWheel, { capture: true })
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
          setViewport(fitTo(rectsRef.current, size))
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
  }, [hostRef, onSpawn])

  return viewport
}
