import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { normalizeWheel } from './canvas-input'
import { centreOn as centreOnRect, fitTo, panBy, screenToWorld, zoomAt, type Point, type Viewport, type WorldRect } from './viewport'
import type { JumpDirection } from './attention'

const INITIAL: Viewport = { x: 120, y: 120, scale: 1 }
const KEYBOARD_ZOOM_STEP = 1.2

/**
 * The only shortcuts an OS auto-repeat may reach. Holding Cmd+- to zoom out
 * continuously is the affordance every canvas app has, so the zoom steppers
 * WANT the repeat stream.
 *
 * Written as an allow-list rather than as three per-case guards so that the
 * exemption is the thing recorded in the code, not the thing missing from it:
 * a bare `if (event.repeat) return` scattered over '0', '1' and 'n' leaves
 * '=' and '-' looking like an oversight, and the next reader closes the
 * "gap" and silently deletes hold-to-zoom.
 */
const REPEATABLE_KEYS = new Set(['=', '+', '-'])

export interface ViewportControls {
  viewport: Viewport
  /**
   * Returns the camera to INITIAL — the same target Cmd+0 uses. Narrow and
   * explicitly named on purpose: the general setter stays private (nothing
   * outside this hook has a reason to move the camera arbitrarily), but
   * Canvas.tsx's reset handler needs SOMETHING to call, because
   * layoutStore.reset() only clears the STORED camera. Leaving the live one
   * alone would strand the view whatever pan/zoom the user was at when they
   * asked for a reset — off in the distance from a first-run panel placed at
   * the world origin, i.e. a canvas that renders empty and then persists
   * that emptiness on the very next save.
   */
  resetViewport: () => void
  /**
   * The world point the camera is currently centred on — the same value
   * Cmd+N already computes one line above in the keydown handler. A menu-
   * driven spawn (no keyboard event, no `bounds` to hand) needs a way to ask
   * "where is the user looking" without being handed the setter itself; the
   * setter stays private on purpose (nothing outside this hook should move
   * the camera), but a READ of where it already is is safe to expose.
   */
  worldCentre: () => Point
  /**
   * Frame one panel without changing the zoom. The general setter stays
   * private — nothing outside this hook should move the camera — and this is
   * the third narrow verb that asks by name, after resetViewport and
   * worldCentre.
   */
  centreOn: (rect: WorldRect) => void
}

/**
 * Returns the current viewport plus the one reset verb Canvas.tsx needs. The
 * general setter stays private: nothing outside this hook has a reason to
 * move the camera, and exporting it would invite panel code to reach past
 * the gesture layer.
 */
export function useViewport(
  hostRef: RefObject<HTMLElement | null>,
  rects: WorldRect[],
  onSpawn?: (worldCentre: Point) => void,
  /**
   * The SOLE authority on wheel ownership: true means the camera stands down
   * and the event continues untouched to whatever is under the cursor. It
   * decides zoom gestures too — this hook deliberately holds no rule of its
   * own any more, because the palette has to be able to outrank zoom and a
   * post-filter here could only ever narrow the predicate's answer, never
   * widen it. See Canvas.tsx's implementation for the three ordered rules.
   *
   * Must be referentially stable: it sits in the wheel effect's dep array.
   */
  shouldYieldWheel?: (event: WheelEvent) => boolean,
  /** The restored camera. Cmd+0 still returns to INITIAL, not to this. */
  initialViewport?: Viewport,
  /**
   * True while the command palette owns the keyboard. Every shortcut here is
   * Cmd-gated, and so is the palette's own text field — Cmd+N typed while
   * filtering would otherwise ALSO spawn a panel behind the overlay.
   *
   * Must be referentially stable (a useCallback with an empty dep list reading
   * a ref, exactly like shouldYieldWheel): it sits in the keydown effect's dep
   * array, and a changing identity would reinstall the listener on every
   * render.
   */
  shouldIgnoreKeys?: () => boolean
  ,
  /**
   * Cmd+J: visit the next panel that wants you; Shift+Cmd+J the previous one.
   * The hook holds no knowledge of WHO is waiting — that lives in the
   * agent-state store, which is renderer state this layer has no business
   * reading. It only turns a chord into a direction.
   *
   * Must be referentially stable: it sits in the keydown effect's dep array.
   */
  onJumpAttention?: (direction: JumpDirection) => void
): ViewportControls {
  const [viewport, setViewport] = useState<Viewport>(initialViewport ?? INITIAL)
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
      // Ownership is asked once and answered once. Yielding means doing
      // NOTHING: no preventDefault, no stopPropagation, so the event reaches
      // the target phase intact and whoever is under the cursor handles it —
      // xterm's own handler for the focused panel, or the browser's native
      // overflow scrolling for the command palette's row list, which only
      // ever runs on a wheel nobody cancelled.
      if (shouldYieldWheel?.(event)) return

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
      if (shouldIgnoreKeys?.()) return

      // A held chord is ONE gesture but many events: the OS emits the real
      // press and then an auto-repeat stream at roughly 15/sec, and every one
      // of them arrives here as an ordinary keydown. Unguarded, `case 'n'`
      // turns each repeat into a panel and — once it goes live — a PTY, so
      // holding Cmd+N for two seconds is thirty agents and a canvas well past
      // LIVE_BUDGET. Cmd+0/Cmd+1 are idempotent, so their repeats are merely
      // wasted work; the zoom steppers are exempt because for them the repeat
      // stream is the feature.
      //
      // `event.repeat` and NOT a "key is down" latch cleared on keyup: AppKit
      // does not reliably deliver keyUp for a key pressed while Cmd is held,
      // so a latch would stick "down" after the first Cmd+N and the shortcut
      // would be dead for the rest of the run — a silent dead key traded for
      // a loud bug, which is the worse of the two failures.
      if (event.repeat && !REPEATABLE_KEYS.has(event.key)) return

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
          // panel appears where you are looking at any zoom. "Where you are
          // looking" is where it ASKS for: onSpawn runs the point through
          // panels.ts's cascadeCentre, which steps it down-and-right when a
          // panel is already centred there, so repeated presses stack
          // visibly instead of landing on identical rects.
          event.preventDefault()
          onSpawn?.(screenToWorld(centre, viewportRef.current))
          break
        case 'j':
        case 'J':
          // Both spellings: shiftKey is not excluded above (Shift+Cmd+J is
          // the backward cycle), and a shifted `j` arrives as 'J' — the same
          // detail usePalette.ts records about Cmd+Shift+K.
          event.preventDefault()
          onJumpAttention?.(event.shiftKey ? -1 : 1)
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [hostRef, onSpawn, shouldIgnoreKeys, onJumpAttention])

  // The SETTER stays private — nothing outside should move the camera — but a
  // READ of where the camera is looking is what a menu-driven spawn needs, and
  // it is the same value Cmd+N already computes one line above.
  const worldCentre = useCallback((): Point => {
    const host = hostRef.current
    const size = host
      ? { width: host.clientWidth, height: host.clientHeight }
      : { width: 0, height: 0 }
    return screenToWorld(
      { x: size.width / 2, y: size.height / 2 },
      viewportRef.current
    )
  }, [hostRef])

  // Referentially stable, and that is load-bearing rather than tidy: a fresh
  // arrow per render propagates straight through Canvas.tsx's
  // useMemo([resetViewport]) for the palette's actions into Palette.tsx's
  // command list, whose [rows] effect re-seats the SELECTION. Canvas re-renders
  // on every mousemove over .canvas (setCursor), so an unstable identity here
  // means nudging the mouse silently moves the palette's highlighted row out
  // from under the user's arrow keys, and Enter runs the wrong command.
  const resetViewport = useCallback(() => setViewport(INITIAL), [])

  // Same referential-stability reasoning as resetViewport/worldCentre above:
  // this sits in Canvas.tsx's paletteActions dep array, and a fresh identity
  // per render would re-seat the palette's selection on every mousemove.
  const centreOn = useCallback((rect: WorldRect) => {
    const host = hostRef.current
    // No host means no canvas mounted to frame anything against — a silent
    // no-op, same as worldCentre's host-less fallback above, rather than a
    // throw over a call that can only happen during teardown/an unmounted
    // host, never from a normal palette action.
    if (!host) return
    const bounds = host.getBoundingClientRect()
    setViewport((vp) => centreOnRect(vp, rect, { width: bounds.width, height: bounds.height }))
  }, [hostRef])

  return { viewport, resetViewport, worldCentre, centreOn }
}
