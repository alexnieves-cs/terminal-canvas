import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { nearestLinkTarget, SNAP_RADIUS_PX } from './link-geometry'
import { screenToWorld, type Viewport, type WorldRect } from './viewport'

export interface LinkDrawState {
  /** The panel the drag started from. */
  from: string
  /** The cursor, in WORLD coordinates, so the ghost renders inside .world. */
  cursor: { x: number; y: number }
  /** The panel a release right now would link to, or null. */
  target: string | null
}

export interface LinkDrawDeps {
  hostRef: RefObject<HTMLElement | null>
  /** Read through a ref: the viewport changes on every wheel event. */
  viewportRef: RefObject<Viewport>
  /** Read through a ref: rects change on every frame of a panel drag. */
  rectsRef: RefObject<WorldRect[]>
  /** Called once, on a release that resolved to a target that is not the source. */
  onCommit(from: string, to: string): void
}

export interface LinkDraw {
  state: LinkDrawState | null
  begin(from: string, event: { clientX: number; clientY: number }): void
  /**
   * Ends an in-flight draw WITHOUT committing — the same path Escape takes.
   *
   * Its one caller today is `toggleMerged` (Canvas.tsx), for the reason the
   * marquee's own `marqueeEndRef` exists one gesture over: a draw begun on
   * the ordinary canvas and still held when the user enters the merged view
   * is not stood down by the mousedown gate alone (ports are already
   * suppressed under `readOnly`, but that only stops a NEW draw from
   * beginning). Left running, its ghost would go on painting across lane
   * space until release — `onCommit`'s own `mergedRef` guard (Canvas.tsx)
   * would still refuse the write, but a ghost that keeps drawing over a view
   * the user just entered is its own visible defect worth standing down. A
   * no-op when nothing is in flight.
   */
  end(): void
}

/**
 * The drag that draws a link (M35).
 *
 * Modelled line for line on usePanelDrag: a depsRef mirroring the callbacks
 * so the document listeners are installed once and never torn down, and
 * move/up on `document` rather than on the port — the cursor leaves the port
 * immediately and a listener on it would stop receiving events the moment it
 * did.
 *
 * ONE DEVIATION FROM usePanelDrag, forced by a real, reproduced defect: the
 * gesture's own decision-making reads `gestureRef`, a plain ref mutated
 * SYNCHRONOUSLY inside begin/onMove/onUp. An earlier draft of this file had
 * no `gestureRef` at all — it mirrored `state` into a ref DURING RENDER
 * (`someRef.current = state`, unconditionally, on every render) and had
 * `onUp` read THAT mirrored ref, the pattern `focusedIdRef` and
 * `viewportRef` elsewhere in this codebase use for read-only values a
 * listener needs between renders. It does not work here, because `onUp`'s
 * read is a DECISION, not a read-only lookup, and React only updates a
 * render-time mirror once it actually re-renders. A real drag driven end to
 * end — mousedown on a port, a real drag, mouseup on a target,
 * verify:panels 174/175 — reproduced React 18 automatic batching lagging
 * that mirrored ref a render behind: when a `mousemove` and the following
 * `mouseup` land in the same JS task (which a fast synthetic drag, and an
 * OS-coalesced real one, both do), `setState` from `onMove` had not yet been
 * committed by the time `onUp` ran, so `onUp` read the STALE state `begin()`
 * had set — `target: null`, and a cursor from the mousedown position rather
 * than the release position — and never called `onCommit` at all.
 * `usePanelDrag` itself never hits this: its own gesture tracking
 * (`dragRef`) is ALREADY a plain ref with no `useState` in the loop; only
 * the mirror-during-render pattern this hook additionally needed (for the
 * ghost curve's `state`) can introduce the lag. `gestureRef` is now the
 * single source of truth for the DECISION `onUp` makes; `state`/`setState`
 * still exist, but purely to trigger a
 * re-render so the ghost curve and `.canvas--linking` track the same values,
 * one render later, which is fine for something painted on screen and fatal
 * for something a commit is gated on.
 *
 * It does not collide with xterm-pointer.ts's capture-phase interceptor, for
 * usePanelDrag's own reason: that interceptor only corrects a gesture whose
 * mousedown landed inside a `.panel__slot`, and a port is a sibling of the
 * slot rather than a child of it.
 *
 * DROPPING ON A DORMANT PANEL CANNOT WAKE IT, structurally. Waking hangs off
 * onSelectPanel, which fires from MOUSEDOWN; our mousedown was consumed by the
 * port, and the mouseup lands on a panel that has no mouseup handler at all.
 * That is M13 success criterion 2 held by construction rather than by a guard
 * — and "by construction" is precisely the claim a later refactor breaks
 * silently, which is why verify:panels 175 checks it rather than trusting it.
 */
export function useLinkDraw(deps: LinkDrawDeps): LinkDraw {
  const [state, setState] = useState<LinkDrawState | null>(null)
  // The decision-making ref. See the module comment above for why this, and
  // not a state-mirroring ref, is what onMove/onUp read and write.
  const gestureRef = useRef<LinkDrawState | null>(null)
  const depsRef = useRef(deps)
  depsRef.current = deps

  // See the LinkDraw interface's own comment on `end` for why this exists and
  // who calls it. Cancels through the same two writes Escape and blur both
  // use — clearing gestureRef is what a subsequent onUp reads as "nothing in
  // flight", and clearing state is what stops the ghost curve painting one
  // more frame after the view it was drawn into is gone.
  const end = useCallback(() => {
    gestureRef.current = null
    setState(null)
  }, [])

  const begin = useCallback((from: string, event: { clientX: number; clientY: number }) => {
    const host = depsRef.current.hostRef.current
    const viewport = depsRef.current.viewportRef.current
    if (!host || !viewport) return
    const bounds = host.getBoundingClientRect()
    const cursor = screenToWorld(
      { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
      viewport
    )
    const next: LinkDrawState = { from, cursor, target: null }
    gestureRef.current = next
    setState(next)
  }, [])

  useEffect(() => {
    const onMove = (event: MouseEvent): void => {
      const current = gestureRef.current
      if (!current) return
      // A move with no button held cannot be part of a drag — it is the tail
      // of a press whose mouseup never arrived (the window lost focus, a
      // dialog stole it). END the gesture rather than skipping the event: a
      // gesture whose document listeners outlive it is a mousemove that keeps
      // recomputing state nobody asked for. usePanelDrag's own lesson.
      if ((event.buttons & 1) === 0) {
        gestureRef.current = null
        setState(null)
        return
      }
      const host = depsRef.current.hostRef.current
      const viewport = depsRef.current.viewportRef.current
      const rects = depsRef.current.rectsRef.current
      if (!host || !viewport || !rects) return
      const bounds = host.getBoundingClientRect()
      const cursor = screenToWorld(
        { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
        viewport
      )
      // SCREEN pixels divided by scale. See SNAP_RADIUS_PX's own comment for
      // why this is not world-fixed the way CASCADE_STEP deliberately is.
      const radius = SNAP_RADIUS_PX / viewport.scale
      const target = nearestLinkTarget(rects, cursor, radius, current.from)
      const next: LinkDrawState = { from: current.from, cursor, target }
      gestureRef.current = next
      setState(next)
    }

    const onUp = (): void => {
      const current = gestureRef.current
      if (!current) return
      gestureRef.current = null
      setState(null)
      // addLink refuses a self-link anyway; returning here is what keeps the
      // cancel SILENT rather than a no-op that reads as a link which failed.
      if (!current.target || current.target === current.from) return
      depsRef.current.onCommit(current.from, current.target)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [])

  useEffect(() => {
    // Installed ONLY while a draw is in flight, which is what keeps this from
    // being an always-installed bare-key handler. The app's rule is that a
    // bare keystroke always reaches the PTY, and every exception is a visibly
    // present modal state — a ghost curve following the cursor is exactly
    // that. Capture phase, so it beats the palette's and xterm's own handlers
    // the same way useNavGrid's and useLinkMode's do.
    if (state === null) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      // Stopped as well as handled: the canvas is drawing, so this Escape is
      // ours, and letting it propagate would ALSO send it to the focused
      // agent's PTY where Escape is very much a meaningful key.
      event.stopPropagation()
      gestureRef.current = null
      setState(null)
    }
    // Required rather than defensive, for useNavGrid's reason: Cmd+Tab away
    // means the mouseup may never be delivered to this window at all, and a
    // draw with no way to end leaves a ghost curve following a cursor that is
    // no longer here.
    const onBlur = (): void => {
      gestureRef.current = null
      setState(null)
    }
    window.addEventListener('keydown', onKey, { capture: true })
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey, { capture: true })
      window.removeEventListener('blur', onBlur)
    }
  }, [state === null])

  return { state, begin, end }
}
