import { useCallback, useEffect, type MouseEvent, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { isCorrectedEvent } from '@renderer/components/xterm-pointer'
import { addLink, type Panel } from '@renderer/panels/panels'
import type { PaletteController } from '@renderer/palette/usePalette'
import { marqueeRect, marqueeSelection } from './marquee'
import { EMPTY_SELECTION } from './canvas-constants'
import type { MarqueeScreenRect } from './MarqueeLayer'
import type { LinkMode } from './useLinkMode'
import { hitTest, screenToWorld, worldToScreen, type Point, type Viewport, type WorldRect } from './viewport'
import { INK_POINTS_MAX } from '@shared/annotations'

export interface CanvasPointerDeps {
  hostRef: RefObject<HTMLDivElement | null>
  viewport: Viewport
  viewportRef: RefObject<Viewport>
  panelsRef: RefObject<Panel[]>
  marqueeFromRef: RefObject<Point | null>
  marqueeEndRef: RefObject<(() => void) | null>
  navGridIsOpenRef: RefObject<() => boolean>
  /** Already sorted by `Panel.z`, so pick order and paint order agree. */
  hitOrder: WorldRect[]
  palette: PaletteController
  linkMode: LinkMode
  merged: boolean
  spaceHeld: { isHeld: () => boolean }
  beginPanDrag: (originScreen: Point) => void
  commitHistory: (next: Panel[]) => void
  selectAndRaise: (id: string, additive?: boolean) => void
  selectOnly: (id: string | null) => void
  onSelectPanel: (id: string, additive?: boolean) => void
  /** M93. Annotate mode: a click PLACES a note and does nothing else. True when consumed. */
  annotate?: (world: { x: number; y: number }) => boolean
  /** M155. Whether annotate mode's DRAW tool is on: a drag then draws instead of placing a label. */
  inkTool?: () => boolean
  /** M155. The stroke's points so far, for the live preview (null when the gesture ends). */
  inkPreview?: (points: Array<[number, number]> | null) => void
  /** M155. A finished stroke — a drag that MOVED (end ≥ 4 SCREEN px from start) — in world coordinates, with the scale it was drawn at. */
  ink?: (points: Array<[number, number]>, scale: number) => void
  setPanels: Dispatch<SetStateAction<Panel[]>>
  setSelectedIds: Dispatch<SetStateAction<ReadonlySet<string>>>
  setFocusedId: Dispatch<SetStateAction<string | null>>
  setMarquee: Dispatch<SetStateAction<MarqueeScreenRect | null>>
  setCursor: Dispatch<SetStateAction<Point>>
}

export interface CanvasPointer {
  onCanvasMouseDownCapture: (event: MouseEvent<HTMLDivElement>) => void
  onMouseDown: (event: MouseEvent<HTMLDivElement>) => void
  onMouseDownCapture: (event: MouseEvent<HTMLDivElement>) => void
  onMouseMove: (event: MouseEvent<HTMLDivElement>) => void
}

/**
 * Every mouse gesture the canvas host itself owns: the screen-to-world
 * conversion, the marquee, and the four mousedown/mousemove handlers.
 *
 * Lifted out of `Canvas.tsx` verbatim (M28, a purely structural split). Two
 * properties of the original survive the move and must keep surviving it.
 *
 * FOUR OF THESE ARE PLAIN FUNCTIONS, NOT `useCallback`s, and that is
 * deliberate rather than an oversight this split should tidy up. They close
 * over `viewport`, `hitOrder`, `merged` and `palette` directly and are
 * rebuilt every render on purpose; wrapping them in `useCallback` here would
 * be a real behaviour change, not a cleanup, because a stale closure is
 * exactly what the memo would preserve.
 *
 * `onCanvasMouseDownCapture` calls `onLinkModeMouseDownCapture` FIRST and
 * only then checks `event.button === 1`. React allows exactly one
 * `onMouseDownCapture` prop per element, so the two can never be separate
 * listeners — the composition IS the mechanism, and a link's completing click
 * that reached `onSelectPanel` instead would wake and spawn a panel.
 */
export function useCanvasPointer(deps: CanvasPointerDeps): CanvasPointer {
  const {
    hostRef, viewport, viewportRef, panelsRef, marqueeFromRef, marqueeEndRef,
    navGridIsOpenRef, hitOrder, palette, linkMode, merged, spaceHeld,
    beginPanDrag, commitHistory, selectAndRaise, selectOnly, onSelectPanel,
    setPanels, setSelectedIds, setFocusedId, setMarquee, setCursor
  } = deps

  const toWorld = (event: MouseEvent<HTMLDivElement>): Point | null => {
    const host = hostRef.current
    if (!host) return null
    const bounds = host.getBoundingClientRect()
    return screenToWorld({ x: event.clientX - bounds.left, y: event.clientY - bounds.top }, viewport)
  }

  /**
   * The rubber band, from the world point the press landed on.
   *
   * The move and up listeners go on `document`, never on the canvas host, for
   * the reason installPointerCorrection binds there: the cursor spends most of
   * a marquee outside the element the gesture started in — off the far edge of
   * the canvas, over the rail, over a panel — and a host-scoped listener would
   * simply stop tracking there, freezing the band mid-drag and leaving the
   * selection at whatever it was when the pointer left. They are removed on
   * mouseup; a mousemove listener left on the document is a real leak, and one
   * that keeps recomputing a selection nobody asked for.
   *
   * Both refs are read at MOVE time rather than captured at mousedown: the
   * band's screen geometry has to follow the camera, and the panel list can
   * change under a gesture (a spawn, an exit, a close).
   *
   * No history entry, deliberately, at any point in the gesture. The panel
   * ARRAY is untouched — "one history entry per committed gesture" is about
   * gestures that move panels — and pushing one here would make Cmd+Z undo a
   * selection while the drag it was meant to reverse stayed put.
   */
  const beginMarquee = useCallback((from: Point): void => {
    const host = hostRef.current
    if (!host) return
    marqueeFromRef.current = from

    const onMove = (event: globalThis.MouseEvent): void => {
      const start = marqueeFromRef.current
      if (!start) return
      // A move with NO button held means the press ended somewhere this
      // listener never saw it — released over another application, or a
      // mousedown that never got its mouseup at all. Without this the band
      // follows a cursor whose button is up and every idle mouse movement
      // keeps rewriting the selection, with no gesture in progress and
      // nothing on screen explaining it. Ending here is also what stops the
      // document listeners outliving the gesture in that case.
      if (event.buttons === 0) {
        endMarquee()
        return
      }
      const bounds = host.getBoundingClientRect()
      const vp = viewportRef.current
      const to = screenToWorld(
        { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
        vp
      )
      const rect = marqueeRect(start, to)
      // Painted from the world rect rather than from the two raw screen
      // points, so the band cannot disagree with the selection it produced —
      // one normalisation, read twice.
      const topLeft = worldToScreen({ x: rect.x, y: rect.y }, vp)
      setMarquee({ x: topLeft.x, y: topLeft.y, w: rect.w * vp.scale, h: rect.h * vp.scale })
      const ids = marqueeSelection(rect, panelsRef.current.map((p) => p.rect))
      // The set-shaped setter directly: this is the one gesture in the app
      // that legitimately selects MANY, which is the whole reason selectedIds
      // is a set. EMPTY_SELECTION rather than a fresh empty Set, so a marquee
      // over empty space does not hand React a new identity every frame.
      setSelectedIds(ids.length === 0 ? EMPTY_SELECTION : new Set(ids))
    }
    function endMarquee(): void {
      marqueeFromRef.current = null
      marqueeEndRef.current = null
      setMarquee(null)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', endMarquee)
    }
    // Published so the merged view can end a gesture it did not start; see
    // the effect below. Cleared by endMarquee itself, so nothing ever calls
    // a teardown for a gesture that is already over.
    marqueeEndRef.current = endMarquee
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', endMarquee)
  }, [])

  /**
   * ENTERING THE MERGED VIEW ENDS ANY BAND IN PROGRESS.
   *
   * The mousedown gate refuses to ARM a marquee while merged, and that is
   * only half the question: `onMove` and the <Marquee> render are
   * unconditional, so a band armed on the ordinary canvas and still held when
   * Cmd+Shift+A lands goes on painting across the merged view and goes on
   * rewriting the selection — from PRE-MERGE world coordinates, against
   * `panelsRef`, while the screen shows lane space. Nothing is written (the
   * move verb refuses via mergedRef), so the damage is a band that selects
   * panels the user is not sweeping over, with no gesture visible that
   * explains it.
   *
   * Ending the gesture rather than gating `onMove` is the answer for the same
   * reason the buttons-up branch inside onMove ends rather than skips: a
   * gesture whose listeners outlive it is a document-level mousemove that
   * keeps recomputing a selection nobody asked for.
   */
  useEffect(() => {
    if (merged) marqueeEndRef.current?.()
  }, [merged])
  /**
   * Resolves an armed link mode, and it MUST be capture phase.
   *
   * Every panel's own chrome handler stopPropagations its mousedown, so a
   * listener on the background onMouseDown below never sees a click on a
   * PANEL — which is every click that can complete a link. Worse, letting the
   * click reach a panel's own handler reaches onSelectPanel, which clears the
   * dormant id and calls registry.wake: completing a link onto a dormant panel
   * would SPAWN AN AGENT. That is success criterion 2 failing, and on a
   * restored canvas it is one agent CLI per link the user draws — exactly the
   * accident the dormancy rule exists to prevent. Stopping the event here is
   * what makes the completing click do one thing and only one.
   *
   * It hit-tests the WORLD point rather than reading event.target, so a click
   * on a panel's chrome, its card and its terminal body all mean the same
   * thing — and it reuses hitOrder, arithmetic that is already pinned.
   *
   * Returns true when it consumed the event, so the caller can stand down.
   */
  const onLinkModeMouseDownCapture = (event: MouseEvent<HTMLDivElement>): boolean => {
    const source = linkMode.from
    if (source === null) return false
    event.preventDefault()
    event.stopPropagation()
    // Disarmed on ANY resolving click, including a cancel: one shot.
    linkMode.disarm()
    const world = toWorld(event)
    const hit = world ? hitTest(hitOrder, world) : null
    // A click on the background, or back on the source, cancels. addLink
    // refuses a self-link anyway; returning here is what keeps the cancel
    // silent rather than a no-op that reads as a link which failed.
    if (!hit || hit === source) return true
    setPanels((current) => {
      const next = addLink(current, source, hit)
      // addLink returns the SAME array when it refuses (a duplicate), and
      // committing unconditionally would push a history entry for a gesture
      // that changed nothing — one wasted Cmd+Z. The rule is one entry per
      // COMMITTED gesture, not one per attempt.
      if (next !== current) commitHistory(next)
      return next
    })
    return true
  }

  /**
   * Backlog #68: middle-drag pan. Composed with `onLinkModeMouseDownCapture`
   * in the SAME capture-phase slot rather than a second prop (React allows
   * one `onMouseDownCapture` per element) — this is the "arbitrated in the
   * same place as the capture-phase wheel listener" constraint the backlog
   * entry names: middle-button must be claimed BEFORE any panel's own
   * onMouseDown runs, because no panel chrome handler in this codebase
   * checks event.button, so an unguarded middle-press over a panel's chrome
   * would start a PANEL drag via usePanelDrag instead of a camera pan.
   *
   * Gated on the palette and the nav grid, mirroring shouldYieldWheel's
   * rules 0-1 (both already stand every other canvas gesture down while
   * open). No `merged` gate, matching wheel's own rules — panning the
   * lane-space camera is harmless read-only navigation.
   */
  const onCanvasMouseDownCapture = (event: MouseEvent<HTMLDivElement>): void => {
    // M249 (its critic). The screen-space controls INSIDE .canvas — the
    // command pill and the new-object row — stand this whole capture slot
    // down: their own bubble-phase stopPropagation runs too late to stop it,
    // so an armed link would resolve onto whatever panel lies UNDER the pill
    // (it sits bottom-centre, where panels are), and a middle-press on it
    // would start a camera pan. shouldYieldWheel's pill rule, for the pointer.
    // M395: the HUD (which now holds Create) and the minimap are the same kind
    // of control over the same world — a press on Fit or on the map with link
    // mode armed resolved the link onto the panel beneath them.
    const target = event.target as HTMLElement | null
    if (target?.closest?.('.command-pill, .new-object-row, .canvas-hud, .minimap')) return
    if (onLinkModeMouseDownCapture(event)) return
    if (event.button !== 1) return
    if (palette.isOpen() || navGridIsOpenRef.current()) return
    event.preventDefault()
    event.stopPropagation()
    beginPanDrag({ x: event.clientX, y: event.clientY })
  }

  const onMouseDown = (event: MouseEvent<HTMLDivElement>): void => {
    // Only background clicks reach here; panels stopPropagation.
    const world = toWorld(event)
    // M93. In annotate mode the click is the note's position, over a panel or
    // the ground alike: it neither selects nor starts a marquee.
    // M155. With the DRAW tool on, a drag on the sheet is a stroke: every move
    // is screenToWorld of the pointer (never a delta of deltas — the drift
    // rule), the preview follows, and mouseup commits a drag that moved; a
    // press without movement is still the label above.
    if (world && event.button === 0 && deps.inkTool?.() === true) {
      event.preventDefault()
      const host = hostRef.current
      const points: Array<[number, number]> = [[world.x, world.y]]
      // The marquee ends on a move with no button held (a press released
      // over another application). Here that arm waits for a move that HAD
      // the button: a synthetic move (the harness's, a tablet's) can report
      // `buttons` 0 while the press is genuinely down, and ending on the
      // first such move turned every drawn stroke into a label. A lost
      // mouseup still ends the stroke on the next mouseup anywhere.
      // Seeded from the press itself: a press whose cursor leaves the window
      // before any move fires inside would otherwise never see the button,
      // and every later idle move would append to a stroke (the critic).
      let sawButton = event.buttons !== 0
      const scaleAtStart = viewportRef.current.scale
      const cleanup = (): void => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', end)
        deps.inkPreview?.(null)
      }
      const onMove = (e: globalThis.MouseEvent): void => {
        // The mode ended under the hand (Escape, the merged view): the stroke
        // is CANCELLED — no commit, no label, no ghost preview.
        if (deps.inkTool?.() !== true) { cleanup(); return }
        if (e.buttons !== 0) sawButton = true
        else if (sawButton) { end(e); return }
        if (!host) return
        const b = host.getBoundingClientRect()
        const w = screenToWorld({ x: e.clientX - b.left, y: e.clientY - b.top }, viewportRef.current)
        points.push([w.x, w.y])
        deps.inkPreview?.(points.slice())
        // At the cap the stroke ends where the hand is; the next press starts another.
        if (points.length >= INK_POINTS_MAX) end(e)
      }
      function end(_e: globalThis.MouseEvent): void {
        cleanup()
        if (deps.inkTool?.() !== true) return
        // A stroke is a drag that MOVED — the end at least four SCREEN pixels
        // from the start, measured in world units through the scale — never
        // a point count: moves coalesce (a fast flick, a synthetic drag) into
        // two points that are still a line a person drew. A press that did
        // not move is the label. (World units would make a one-pixel jitter
        // a stroke at a far zoom and a real dash a label at a near one.)
        const [sx, sy] = points[0]!, [ex, ey] = points[points.length - 1]!
        if (points.length >= 2 && Math.hypot(ex - sx, ey - sy) * scaleAtStart >= 4) deps.ink?.(points, scaleAtStart)
        else deps.annotate?.({ x: sx, y: sy })
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', end)
      return
    }
    if (world && event.button === 0 && deps.annotate?.(world) === true) { event.preventDefault(); return }
    const hit = world ? hitTest(hitOrder, world) : null
    // Through onSelectPanel, not selectOnly: selecting raises. A live
    // panel's own chrome handler already does that, but a CARDED panel has no
    // handler of its own — its click falls through to the background path, and
    // calling selectOnly here directly would select it without raising it.
    if (hit) {
      // A card reaches this background handler, unlike live panel chrome.
      // It therefore shares the same shift-add path explicitly rather than
      // waking a dormant card just because it joined a selection.
      if (event.shiftKey) selectAndRaise(hit, true)
      else onSelectPanel(hit)
    }
    else {
      selectOnly(null)
      // The marquee starts ONLY where hitTest found nothing, which is why it
      // lives in this else and not at the top of the handler. "Reaching the
      // background handler" is not the same fact as "empty space": a carded
      // panel has no chrome handler of its own, so its press arrives here too
      // — and cards are most of the canvas once LIVE_BUDGET is spent, so a
      // marquee armed on any background mousedown would rubber-band instead
      // of selecting every time a user clicked a card.
      //
      // It is also what makes a zero-area marquee (a click with no drag)
      // harmless: an empty rect geometrically intersects any panel strictly
      // containing its point, and the guard is that there is no such panel.
      //
      // Gated on the palette for the reason every other canvas gesture stands
      // down while it is open (rule 3 of "who owns the keyboard"): the click
      // that dismisses the overlay is a dismissal, not the start of a drag.
      // Gated on the merged view for a reason of its own, and Task 6 shipped
      // without this gate only because this state did not exist yet: a
      // marquee's whole product is a multi-selection the move-to-workspace
      // rows act on, and a band swept across two lanes would hand those rows
      // a selection spanning workspaces — a move whose source records are not
      // the one this canvas owns. Selection by click stays available; it is
      // the SWEEP that silently crosses a boundary.
      if (world && !palette.isOpen() && !merged) {
        // Backlog #68: space-drag substitutes for the marquee in this exact
        // branch — both are "what does a background press start" — never
        // both at once. Reuses the marquee's own gates verbatim.
        if (spaceHeld.isHeld()) beginPanDrag({ x: event.clientX, y: event.clientY })
        else beginMarquee(world)
      }
    }
    // Focus is released together with selection. assignTiers pins the focused
    // panel live unconditionally — off screen, below the scale threshold,
    // budget full — so a focusedId that is never cleared holds a WebGL context
    // and a budget slot for the rest of the run, however far you pan away. It
    // also keeps React's idea of focus in step with the DOM's: clicking away
    // blurs xterm's textarea, and a stale focusedId would keep routing Cmd+C
    // to the panel the user just left. Releasing focus is all this does; the
    // chrome-selects / body-passes-through split is untouched.
    setFocusedId(null)
  }

  // The palette's third exit (the spec's focus rule 4 names Escape,
  // Enter-after-run, and a click outside — this is the third). CAPTURE phase
  // on the canvas host, and it has to be: every panel handler stopPropagations
  // its own mousedown, so a click on a PANEL never reaches the background
  // onMouseDown below and a close written there would fire for background
  // clicks only. Without any of it the overlay survives the click with its
  // input blurred and xterm's textarea focused — bare keys reach the agent
  // while the palette sits there looking ready, and Escape reaches the PTY
  // rather than the palette. verify:panels 42.
  //
  // Nothing is prevented or stopped: the click must still do its ordinary job
  // of selecting and focusing whatever it landed on, which is also why this
  // dismisses (no focus restore) rather than closing — see dismissPalette.
  //
  // Mounted on .shell, not .canvas: since M8a the top bar, rail and inspector
  // are SIBLINGS of .canvas, so a listener there never sees a click on a shell
  // control — the overlay would stay up with DOM focus on a button and every
  // bare key going to the agent. Capture phase and the explicit
  // closest('.palette') test are unchanged and still load-bearing: .palette's
  // own bubble-phase stopPropagation cannot stop an ancestor's capture
  // listener that has already run.
  const onMouseDownCapture = (event: MouseEvent<HTMLDivElement>): void => {
    if (!palette.isOpen()) return
    // Clicks INSIDE the overlay are not an exit. The .palette root's own
    // bubble-phase stopPropagation cannot help here — a capture listener on an
    // ancestor has already run by then — so the containment test is explicit.
    if ((event.target as HTMLElement | null)?.closest('.palette')) return
    palette.dismissPalette()
  }

  const onMouseMove = (event: MouseEvent<HTMLDivElement>): void => {
    // Ignore the corrected clones xterm-pointer dispatches during a selection
    // drag. Those carry CSS-pixel client coordinates measured against the
    // panel's slot — right for xterm, wrong for anything that converts a real
    // screen point to world space. They bubble through .canvas like any other
    // event, so without this the HUD's world cursor jumps for the whole drag,
    // by (1 - 1/scale) times the offset into the panel.
    if (isCorrectedEvent(event.nativeEvent)) return
    const world = toWorld(event)
    if (world) setCursor(world)
  }

  // toWorld, beginMarquee and onLinkModeMouseDownCapture are deliberately
  // NOT returned: nothing outside called them even when they lived in
  // Canvas.tsx, and onLinkModeMouseDownCapture in particular must stay
  // internal — it is composed INTO onCanvasMouseDownCapture rather than
  // mounted as a listener of its own.
  return { onCanvasMouseDownCapture, onMouseDown, onMouseDownCapture, onMouseMove }
}
