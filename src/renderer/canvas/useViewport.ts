import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { normalizeWheel } from './canvas-input'
import {
  centreOn as centreOnRect,
  fitTo,
  fitReadable,
  clampScale,
  panBy,
  restoreCamera as restoreCameraExact,
  screenToWorld,
  zoomAt,
  clearFraming,
  CENTRE_MARGIN,
  framedBox,
  freeFrames,
  READABLE_SCALE,
  revealTarget,
  type Point,
  type Size,
  type Viewport,
  type WorldRect
} from './viewport'
import { minimapNeeded } from './minimap'
import { LIVE_MIN_SCALE } from './lod'
import { chromeObstacles, hostSize } from './safe-area'
import { easeInOut, flightDuration, interpolateViewport } from './flight'
import { canRedo, canUndo, createHistory, pushHistory, redoHistory, undoHistory, type History } from '@renderer/panels/history'
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
  /**
   * The fourth narrow verb: put the camera back exactly where a workspace
   * left it. Unlike centreOn, which deliberately leaves the scale alone so
   * framing a panel never discards the zoom the user chose, this one DOES
   * set the scale — a workspace's saved zoom is part of what it means to
   * come back to it.
   */
  restoreCamera: (camera: Viewport) => void
  /**
   * Multiply the scale about the viewport's centre — the fifth narrow verb,
   * after resetViewport, worldCentre, centreOn and restoreCamera. The top
   * bar's +/- buttons need to zoom and the setter stays private: exposing it
   * would make every future caller a camera owner and take the coordinate
   * math out of verify:viewport's reach.
   *
   * It exists as a VERB rather than as arithmetic repeated in the top bar for
   * a second reason: Cmd+= and the + button must be the same gesture, and two
   * copies of `zoomAt(vp, centre, step)` are two things that can drift.
   */
  zoomBy: (factor: number) => void
  /**
   * Frame every panel — the same target Cmd+1 hits, named so the top bar and
   * the keydown case cannot drift apart.
   */
  fitAll: () => void
  /**
   * M146. Frame a SELECTION (backlog #23's "zoom to fit", named apart from
   * maximise): a flight to `fitTo` over the given rects — the same math
   * fitAll uses over every panel, so the two arms of one verb cannot drift.
   * A camera move only; no session state changes, nothing is resized.
   */
  fitSelection: (rects: WorldRect[]) => void
  /**
   * M203 (D08). Frame rects AS A JUMP — the same `fitTo` as fitSelection, but
   * pushed onto the trail, so Camera Back returns to where the person was.
   * fitSelection keeps its M146 meaning (a flight, no trail entry); a "show
   * me the task" that could not be undone would strand the person.
   */
  frameRects: (rects: WorldRect[]) => void
  /** The first start's framing: the new task at a readable scale, `focus` alone when the pair would be too small. */
  frameReadable: (rects: WorldRect[], focus?: WorldRect) => void
  /**
   * M56. The named verbs behind bookmarks and the trail. Same stability
   * requirement as every verb above: each sits in Canvas.tsx's paletteActions
   * dep array. `flying` is STATE, not a ref: the tier-assignment effect has
   * to re-run when it turns false, or a flight that ends on new panels
   * leaves them carded until the next unrelated render.
   */
  goToViewport: (vp: Viewport) => void
  cameraBack: () => void
  cameraForward: () => void
  trail: { back: boolean; forward: boolean }
  flying: boolean
  /**
   * Attention navigation's landing signal. Every discrete jump ends in
   * exactly ONE settle — the flight's last frame, the instant set a
   * reduced-motion or zero-distance jump makes, or a gesture grabbing the
   * camera mid-air — and `seq` counts them. `landed` separates the first two
   * from the third: a destination the user pulled away from must not light
   * up behind them. STATE, like `flying`, so an effect can key on it.
   */
  landing: { seq: number; landed: boolean }
  /** M402 (B4). Show a new object with the least camera move (none when it is in view and clear); whether the camera moves. */
  reveal: (rect: WorldRect) => boolean
  /**
   * Arms a camera drag-pan from a mousedown's screen coordinates — backlog
   * #68's middle-drag and space-drag. The seventh narrow verb, after
   * resetViewport/worldCentre/centreOn/restoreCamera/zoomBy/fitAll: the
   * setter stays private, so Canvas.tsx hands over only the originating
   * screen point and everything else — the document-level mousemove/mouseup,
   * the origin-recompute-every-frame arithmetic `panBy` already does for the
   * wheel path — lives here, next to the wheel listener's own pan logic,
   * rather than as a second, competing gesture layer in Canvas.tsx.
   */
  beginPanDrag: (originScreen: Point) => void
  /**
   * True for exactly the span of one drag-pan gesture. Cursor feedback only
   * — flips twice per gesture (begin, end), never per frame, so it costs
   * nothing like the render storm `version()`'s whole design exists to
   * avoid.
   */
  panning: boolean
}

/**
 * Returns the current viewport plus the one reset verb Canvas.tsx needs. The
 * general setter stays private: nothing outside this hook has a reason to
 * move the camera, and exporting it would invite panel code to reach past
 * the gesture layer.
 */
/**
 * M56. prefers-reduced-motion, with a test override: the harness cannot set
 * the OS preference, and the flight check needs BOTH answers in one run.
 * Module-level rather than a hook dep so a hook instance created before the
 * override is set still honours it at the next flight.
 */
let reducedMotionOverride: boolean | null = null
const OVERRIDE_KEY = 'tc.reducedMotionOverride'
/**
 * Backed by localStorage as well as the module variable: the harness reloads
 * the renderer many times in one run, and a module variable dies with the
 * page, so an override set once would silently lapse at the first reload —
 * every check after it would sample a camera still in the air. The test
 * hook is the only writer; production never sets the key.
 */
export function setReducedMotionOverride(value: boolean | null): void {
  reducedMotionOverride = value
  try {
    if (value === null) window.localStorage.removeItem(OVERRIDE_KEY)
    else window.localStorage.setItem(OVERRIDE_KEY, value ? 'true' : 'false')
  } catch { /* storage unavailable: the module variable still holds for this page */ }
}
// Exported for StartupSplash: the splash must honour the same override the
// harness sets, not a second media-query read that ignores it.
export const prefersReducedMotion = (): boolean => {
  if (reducedMotionOverride !== null) return reducedMotionOverride
  try {
    const stored = window.localStorage.getItem(OVERRIDE_KEY)
    if (stored === 'true') return true
    if (stored === 'false') return false
  } catch { /* fall through to the media query */ }
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false
}

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
  ,
  /**
   * Cmd+Shift+] : the next workspace, Cmd+Shift+[ : the previous one, both
   * wrapping. The hook holds no knowledge of WHICH workspaces exist or which
   * one is active — that is main's list, mirrored into Canvas.tsx — so like
   * onJumpAttention it only turns a chord into a direction.
   *
   * Must be referentially stable: it sits in the keydown effect's dep array.
   */
  onStepWorkspace?: (delta: 1 | -1) => void
  ,
  /**
   * Cmd+Shift+A: enter or leave the merged view. The same shape and the same
   * stability requirement as onStepWorkspace above.
   */
  onToggleMerged?: () => void
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

  // M56. One animated path behind every DISCRETE jump. A gesture cancels a
  // flight and lands its own math on the CURRENT frame, never on the target
  // — the user grabbed the camera mid-air and it must stay where it is.
  const [flying, setFlying] = useState(false)
  const flightRef = useRef<number | null>(null)
  const [landing, setLanding] = useState({ seq: 0, landed: false })
  const settle = useCallback((landed: boolean) => {
    setLanding((l) => ({ seq: l.seq + 1, landed }))
  }, [])
  // `superseded`: flyTo replacing its own flight is not a settle — the new
  // flight will settle — and counting it would cancel the landing the new
  // jump is about to make.
  const cancelFlight = useCallback((superseded = false) => {
    if (flightRef.current !== null) {
      cancelAnimationFrame(flightRef.current)
      flightRef.current = null
      setFlying(false)
      if (!superseded) settle(false)
    }
  }, [settle])
  const flyTo = useCallback((target: Viewport) => {
    cancelFlight(true)
    const host = hostRef.current
    const bounds = host ? host.getBoundingClientRect() : { width: 800, height: 600 }
    const size = { width: bounds.width, height: bounds.height }
    const from = viewportRef.current
    const duration = flightDuration(from, target, size, prefersReducedMotion())
    if (duration === 0) { setViewport(target); settle(true); return }
    const centre = { x: size.width / 2, y: size.height / 2 }
    const started = performance.now()
    setFlying(true)
    const step = (now: number): void => {
      const t = Math.min(1, (now - started) / duration)
      if (t >= 1) {
        flightRef.current = null
        setViewport(target)
        setFlying(false)
        settle(true)
        return
      }
      setViewport(interpolateViewport(from, target, easeInOut(t), centre))
      flightRef.current = requestAnimationFrame(step)
    }
    flightRef.current = requestAnimationFrame(step)
  }, [cancelFlight, hostRef, settle])
  useEffect(() => () => { if (flightRef.current !== null) cancelAnimationFrame(flightRef.current) }, [])

  // M56. The trail: a SECOND History<Viewport>, never the panels' — that
  // one's applyHistory reaches registry.dispose. Pushed on discrete jumps
  // only; `present` is re-read from the live camera at push time because
  // gestures move the camera without telling the trail.
  const trailRef = useRef<History<Viewport>>(createHistory<Viewport>(initialViewport ?? INITIAL))
  const [trail, setTrail] = useState({ back: false, forward: false })
  const syncTrail = useCallback((h: History<Viewport>): void => {
    trailRef.current = h
    setTrail({ back: canUndo(h), forward: canRedo(h) })
  }, [])
  const jump = useCallback((target: Viewport) => {
    const here = viewportRef.current
    // Already there still counts as arriving: a person who asks to be taken
    // to a panel that is on screen must still be shown which one it is.
    // M315. …and it STOPS a flight still under way: the camera asked to stay
    // here must stay. Returning early left the earlier flight panning on, so a
    // Fill view pressed mid-flight sized its panel for a camera that then moved.
    if (here.x === target.x && here.y === target.y && here.scale === target.scale) { cancelFlight(true); settle(true); return }
    syncTrail(pushHistory({ ...trailRef.current, present: here }, target))
    flyTo(target)
  }, [flyTo, syncTrail, settle, cancelFlight])
  const cameraBack = useCallback(() => {
    if (!canUndo(trailRef.current)) return
    const h = undoHistory(trailRef.current)
    syncTrail(h)
    flyTo(h.present)
  }, [flyTo, syncTrail])
  const cameraForward = useCallback(() => {
    if (!canRedo(trailRef.current)) return
    const h = redoHistory(trailRef.current)
    syncTrail(h)
    flyTo(h.present)
  }, [flyTo, syncTrail])
  const goToViewport = useCallback((vp: Viewport) => {
    jump({ x: vp.x, y: vp.y, scale: clampScale(vp.scale) })
  }, [jump])
  // Declared HERE, above the keydown effect that binds Cmd+0 to it.
  const resetViewport = useCallback(() => jump(INITIAL), [jump])

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

      cancelFlight()
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
  }, [hostRef, shouldYieldWheel, cancelFlight])

  /**
   * Zoom about the CENTRE of the host, not about a pointer: there is no
   * cursor position in a button press or a keyboard chord, and the centre is
   * the only anchor that keeps what the user is looking at where it is.
   *
   * A useCallback for the same load-bearing reason resetViewport is (see its
   * comment below), plus a second one here: it sits in the keydown effect's
   * dep array, and a fresh identity per render would tear that window
   * listener down and reinstall it on every mousemove over the canvas.
   */
  const zoomBy = useCallback((factor: number) => {
    const host = hostRef.current
    // No host means nothing mounted to measure a centre against — a silent
    // no-op, the same shape centreOn and worldCentre already take, rather
    // than a throw on a call only reachable during teardown.
    if (!host) return
    const bounds = host.getBoundingClientRect()
    const centre = { x: bounds.width / 2, y: bounds.height / 2 }
    setViewport((vp) => zoomAt(vp, centre, factor))
  }, [hostRef])

  /**
   * M395. EVERY FRAMING LANDS IN THE SAFE AREA. A framing verb computes its
   * target as before (fitTo, fitReadable, centreOn) and then passes it through
   * `clearFraming` with the chrome floating over the canvas, read at press
   * time (`safe-area.ts`): a target already clear of the minimap, the HUD, the
   * pill and any drawer over the canvas is untouched, one that is not moves —
   * or, for a fit, refits into the part of the host they leave. The map is
   * reserved only when the target leaves some object out of view: framing
   * everything is exactly what hides it (`minimapNeeded`), so Fit all does not
   * shrink away from a map that is about to disappear, and a second Fit lands
   * where the first did.
   */
  const safely = useCallback((host: HTMLElement, target: Viewport, subject: readonly WorldRect[], size: Size, keepScale = false): Viewport => {
    const reserve = minimapNeeded(rectsRef.current, target, size) ? 'always' : 'never'
    return clearFraming(target, subject, size, chromeObstacles(host, { minimap: reserve }), { keepScale })
  }, [])

  /** Cmd+1's target, named. Same stability requirement as zoomBy. */
  const fitAll = useCallback(() => {
    const host = hostRef.current
    if (!host) return
    const size = hostSize(host)
    // rectsRef, not `rects`: read at press time, so the fit frames what is on
    // the canvas NOW without the array's per-frame identity churn reaching a
    // dep list. Same reason the keydown effect reads it through the ref.
    const all = rectsRef.current
    jump(safely(host, fitTo(all, size), all, size))
  }, [hostRef, jump, safely])

  const fitSelection = useCallback((rects: WorldRect[]) => {
    const host = hostRef.current
    if (!host || rects.length === 0) return
    const size = hostSize(host)
    flyTo(safely(host, fitTo(rects, size), rects, size))
  }, [hostRef, flyTo, safely])

  const frameRects = useCallback((rects: WorldRect[]) => {
    const host = hostRef.current
    if (!host || rects.length === 0) return
    const size = hostSize(host)
    jump(safely(host, fitTo(rects, size), rects, size))
  }, [hostRef, jump, safely])

  /** The first start's framing — `fitReadable`: the new task at a scale its text can be read at. */
  const frameReadable = useCallback((rects: WorldRect[], focus?: WorldRect) => {
    const host = hostRef.current
    if (!host || rects.length === 0) return
    const size = hostSize(host)
    // What fitReadable framed: every rect, or the conversation alone when
    // the pair would read too small — the subject the chrome must clear.
    const subject = focus === undefined || fitTo(rects, size).scale >= READABLE_SCALE ? rects : [focus]
    jump(safely(host, fitReadable(rects, focus, size), subject, size))
  }, [hostRef, jump, safely])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // Cmd is required for every canvas shortcut. Agent TUIs claim essentially
      // every bare key, so from M3 a bare keystroke must always reach the PTY.
      if (!event.metaKey) return
      if (event.ctrlKey || event.altKey) return
      if (shouldIgnoreKeys?.()) return

      // The three Shift chords, and they are matched on event.code — NEVER
      // on event.key — because Shift REWRITES the printed character: Cmd+Shift+]
      // arrives as key '}' and Cmd+Shift+[ as '{', exactly as Cmd+Shift+\
      // arrives as '|' (useShellChrome.ts obeys the same rule, verify:panels
      // 80). A `key === ']'` test is dead on arrival — no such key is ever
      // delivered under Shift — and a `key === '}'` test is the WORSE failure,
      // because it is correct on the US layout of whoever wrote it and
      // silently dead on every layout that prints '}' somewhere else.
      //
      // They sit ABOVE the general repeat bail rather than in the switch
      // below, which is what lets each one preventDefault BEFORE declining a
      // repeat — the ordering usePalette.ts uses. The modifier checks above
      // reject chords that are NOT ours; this rejects a chord that IS ours
      // and which we are declining to act on, so the tail of a held chord
      // must still be swallowed rather than leaking to the focused agent's
      // PTY.
      if (event.shiftKey) {
        if (event.code === 'BracketLeft' || event.code === 'BracketRight') {
          event.preventDefault()
          // Deliberately NOT in REPEATABLE_KEYS: a held switching chord steps
          // through every canvas at the OS repeat rate and lands wherever the
          // stream happened to stop rather than where the user meant to look
          // — the argument Cmd+J already carries. verify:panels 129.
          if (event.repeat) return
          onStepWorkspace?.(event.code === 'BracketRight' ? 1 : -1)
          return
        }
        if (event.code === 'KeyA') {
          event.preventDefault()
          // A held toggle strobes the whole canvas at the repeat rate, leaves
          // it merged or not depending on whether the user released on an odd
          // or an even repeat, and re-runs a workspace:merged plus a pty:list
          // round trip on every flip. For a toggle the repeat stream is never
          // the feature — the same ruling useShellChrome.ts records for Cmd+\.
          if (event.repeat) return
          onToggleMerged?.()
          return
        }
      }

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
      // M56. The trail, on the UNSHIFTED brackets (the shifted pair is the
      // workspace step above). event.code for the same reason.
      if (event.code === 'BracketLeft' || event.code === 'BracketRight') {
        event.preventDefault()
        if (event.repeat) return
        if (event.code === 'BracketLeft') cameraBack()
        else cameraForward()
        return
      }
      if (event.repeat && !REPEATABLE_KEYS.has(event.key)) return

      const host = hostRef.current
      if (!host) return
      const bounds = host.getBoundingClientRect()
      const centre = { x: bounds.width / 2, y: bounds.height / 2 }

      switch (event.key) {
        case '0':
          event.preventDefault()
          resetViewport()
          break
        // These three call the named verbs rather than repeating the
        // arithmetic, so the chord and the top bar's button are provably the
        // same gesture. preventDefault still happens FIRST in each case: the
        // verbs are ordinary functions with no knowledge of the event, and
        // Cmd+= / Cmd+- are Chromium's own page-zoom accelerators, which is
        // the thing being refused here.
        case '1':
          event.preventDefault()
          fitAll()
          break
        case '=':
        case '+':
          event.preventDefault()
          zoomBy(KEYBOARD_ZOOM_STEP)
          break
        case '-':
          event.preventDefault()
          zoomBy(1 / KEYBOARD_ZOOM_STEP)
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
  }, [
    hostRef, onSpawn, shouldIgnoreKeys, onJumpAttention, onStepWorkspace, onToggleMerged,
    zoomBy, fitAll, resetViewport, cameraBack, cameraForward
  ])

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
    const size = hostSize(host)
    const target = centreOnRect(viewportRef.current, rect, size)
    // M395. A panel that fits is moved clear of the chrome at the SAME scale
    // (centreOn's contract). M402 (B3): one larger than the canvas is
    // leading-edge aligned by centreOnRect and ALSO cleared, judged on its
    // leading corner — the part a person reads first. Left unguarded, the
    // minimap sat over a task review's heading and its controls.
    const fits = rect.w * target.scale <= size.width && rect.h * target.scale <= size.height
    const moved = safely(host, target, fits ? [rect] : [leadingPart(rect, target, size)], size, true)
    // M402 (B3). `safely` moves a target only up or left (clearOfOverlays),
    // so a panel centred under a TOP-right minimap was lifted further under
    // it: a task review's second press (the "already open" jump) framed its
    // header controls beneath the map. When the move leaves it covered, it
    // is centred in the largest free part of the canvas that holds it.
    const reserve = minimapNeeded(rectsRef.current, moved, size) ? 'always' : 'never'
    const stillCovered = fits && chromeObstacles(host, { minimap: reserve }).some((o) => overlaps(framedBox([rect], moved), o))
    jump((stillCovered ? inFreeFrame(host, rect, moved.scale, size, reserve) : undefined) ?? moved)
  }, [hostRef, jump, safely])

  /**
   * M402 (B4), reworked by its critic. SHOW WHAT A CREATE DOOR MADE, moving
   * the camera as little as it can (`revealTarget`): nothing when the object
   * is in view and clear of the chrome at any scale from the near tier's
   * floor, the smallest pan at the SAME scale when it is not, and a flight to
   * a readable scale only from the card tier. Every create door ends here,
   * which is what lets the one placement rule step a new object away from
   * the view's centre — or out of a full view — and still be seen. Returns
   * whether the camera moves.
   */
  const reveal = useCallback((rect: WorldRect): boolean => {
    const host = hostRef.current
    if (!host) return false
    const size = hostSize(host)
    const vp = viewportRef.current
    // `covered`: the chrome as it shows now (an ANCHORED object — a review
    // beside its agent — is placed without it, and one under the minimap is
    // not shown). `keepClear`: the minimap reserved even while hidden, since
    // a pan that leaves some object out of view brings it back.
    const target = revealTarget(vp, rect, size, {
      floor: LIVE_MIN_SCALE,
      covered: chromeObstacles(host, { minimap: 'shown' }),
      keepClear: chromeObstacles(host, { minimap: 'always' })
    })
    if (target === null) return false
    if (target.scale === vp.scale) { jump(target); return true }
    // From the card tier: centred in the largest part of the canvas the
    // chrome leaves that holds it, not in the host (`safely` moves a target
    // only up or left, so a review centred under a top-right minimap stayed
    // under it — B3).
    jump(inFreeFrame(host, rect, target.scale, size, 'always', { shrink: true }) ?? safely(host, target, [rect], size, true))
    return true
  }, [hostRef, jump, safely])

  /**
   * The fourth verb that asks by name, after resetViewport, worldCentre and
   * centreOn. Unlike centreOn — which deliberately leaves the scale alone,
   * because framing a panel must not throw away the zoom the user chose —
   * this one DOES set the scale: a workspace's saved zoom is part of what it
   * means to come back to it. The math itself is restoreCameraExact
   * (viewport.ts's `restoreCamera`, renamed on import the same way centreOn
   * is), kept as a pure function so the property that separates this verb
   * from centreOn is provable under plain node.
   *
   * A useCallback for the same load-bearing reason resetViewport and
   * centreOn already are, not tidiness: a fresh arrow per render propagates
   * through Canvas.tsx's useMemo for paletteActions into Palette.tsx's
   * commands memo, whose [rows] effect re-seats the selected row — and
   * Canvas re-renders on every mousemove over .canvas. The symptom is
   * arrowing down three times, nudging the mouse, pressing Enter, and
   * running the wrong command.
   */
  const restoreCamera = useCallback((camera: Viewport) => {
    cancelFlight()
    const exact = restoreCameraExact(camera)
    setViewport(exact)
    // A workspace switch is a new trail, not a jump the old trail can undo.
    syncTrail(createHistory<Viewport>(exact))
  }, [cancelFlight, syncTrail])

  /**
   * Backlog #68: middle-drag and space-drag pan. `panDragRef` holds the
   * ORIGIN — the screen point and the viewport as they were at mousedown —
   * never the previous frame's result, for `applyDrag`'s own reason (see
   * CLAUDE.md's note on panel-interaction.ts): recomputing from a fixed
   * origin every frame avoids per-frame rounding drift and stays correct if
   * the user's cursor jitters, where accumulating deltas would not.
   *
   * The move/up listeners are document-level and mounted ONCE (empty deps),
   * the identical shape usePanelDrag.ts and the marquee's own beginMarquee
   * both use: the cursor leaves whatever element the gesture started in
   * constantly during a drag, and a host-scoped listener would simply stop
   * tracking there.
   */
  const panDragRef = useRef<{ originScreen: Point; originViewport: Viewport } | null>(null)
  const [panning, setPanning] = useState(false)

  const beginPanDrag = useCallback((originScreen: Point) => {
    // Brief #21. The pan takes the camera where it IS: a flight still running
    // would keep writing its own frames over the drag's, and the drag's origin
    // viewport would be one frame of a camera that is still moving.
    cancelFlight()
    panDragRef.current = { originScreen, originViewport: viewportRef.current }
    setPanning(true)
  }, [cancelFlight])

  // Brief #21. Camera travel is brief AND interruptible: any press on the
  // canvas stops a flight where it is, as the wheel already did. Capture, so
  // a panel that stops its own pointerdown (a drag grip, xterm) still stops
  // the camera first — a panel drag during a flight otherwise moves the panel
  // by a delta measured against a camera that is still sliding under it.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const onPointerDown = (): void => { cancelFlight() }
    host.addEventListener('pointerdown', onPointerDown, { capture: true })
    return () => host.removeEventListener('pointerdown', onPointerDown, { capture: true })
  }, [hostRef, cancelFlight])

  useEffect(() => {
    const endPanDrag = (): void => {
      if (!panDragRef.current) return
      panDragRef.current = null
      setPanning(false)
    }

    const onMove = (event: globalThis.MouseEvent): void => {
      const state = panDragRef.current
      if (!state) return
      // A move with no button held cannot be part of this drag — the same
      // guard usePanelDrag.ts's onMove and the marquee's onMove both carry,
      // for the identical reason: Electron does not reliably deliver
      // mouseup when the button goes up outside the window, and a gesture
      // that outlives its mouseup would resume on the next bare hover.
      if (event.buttons === 0) { endPanDrag(); return }
      setViewport(panBy(
        state.originViewport,
        event.clientX - state.originScreen.x,
        event.clientY - state.originScreen.y
      ))
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', endPanDrag)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', endPanDrag)
    }
  }, [])

  return {
    viewport, resetViewport, worldCentre, centreOn, restoreCamera, zoomBy, fitAll, fitSelection, frameRects, frameReadable,
    beginPanDrag, panning,
    goToViewport, cameraBack, cameraForward, trail, flying, landing, reveal
  }
}

function overlaps(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/**
 * M402 (B3). `rect` centred at `scale` in the LARGEST part of the canvas the
 * chrome leaves that holds it whole (viewport.ts's `freeFrames`), or
 * undefined when none does.
 */
function inFreeFrame(host: HTMLElement, rect: WorldRect, scale: number, size: Size, minimap: 'always' | 'never', opts: { shrink?: boolean } = {}): Viewport | undefined {
  // `shrink` (the reveal, which chooses its own scale): the frame that allows
  // the LARGEST scale up to `scale`, a free frame a few px short no longer
  // sending the object back under the chrome. Without it (centreOn, whose
  // contract is the person's zoom), only a frame that holds it at `scale`.
  let best: { f: { x: number; y: number; w: number; h: number }; s: number } | undefined
  for (const f of freeFrames(size, chromeObstacles(host, { minimap }), CENTRE_MARGIN)) {
    const s = Math.min(scale, f.w / rect.w, f.h / rect.h)
    if (!(opts.shrink === true ? s > 0 : s >= scale - 1e-9)) continue
    if (best === undefined || s > best.s + 1e-9 || (Math.abs(s - best.s) <= 1e-9 && f.w * f.h > best.f.w * best.f.h)) best = { f, s }
  }
  if (best === undefined) return undefined
  const { f, s } = best
  return { scale: s, x: f.x + f.w / 2 - (rect.x + rect.w / 2) * s, y: f.y + f.h / 2 - (rect.y + rect.h / 2) * s }
}

/** M402. The part of an oversized rect the screen shows from its leading corner at `vp`. */
function leadingPart(rect: WorldRect, vp: Viewport, size: Size): WorldRect {
  return { ...rect, w: Math.min(rect.w, size.width / vp.scale), h: Math.min(rect.h, size.height / vp.scale) }
}
