import { useCallback, useEffect, useMemo, useRef, useState, type JSX, type MouseEvent } from 'react'
import { CanvasHud } from './CanvasHud'
import { useViewport } from './useViewport'
import { assignTiers, LIVE_BUDGET, type Tier } from './lod'
import { hitTest, screenToWorld, type Point } from './viewport'
import { TerminalPanel } from '@renderer/components/TerminalPanel'
import { createRegistry } from '@renderer/session/session-registry'
import { useRegistryVersion } from '@renderer/session/useRegistry'
import { createSessionFactory } from '@renderer/terminal/session-factory'
import { makePanel, SEED_PANELS, type Panel } from '@renderer/panels/panels'

/** Clicks reach xterm only near 1:1; see the spec's "Focus and input". */
const INTERACT_MIN_SCALE = 0.9
const INTERACT_MAX_SCALE = 1.1
/** Promote immediately, demote late: the other half of the anti-thrash story. */
const DEMOTE_DELAY_MS = 250

const registry = createRegistry({
  bridge: window.canvas,
  factory: createSessionFactory()
})

// A renderer teardown that skips React cleanup (Cmd+R, Cmd+W) is handled
// main-side by window-lifecycle.ts; this covers the orderly path.
window.addEventListener('beforeunload', () => registry.disposeAll())

export function Canvas(): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const [panels, setPanels] = useState<Panel[]>(SEED_PANELS)
  const rects = useMemo(() => panels.map((p) => p.rect), [panels])
  // Declared before useViewport (which takes it as an argument) rather than
  // grouped with the other callbacks below: a const used before its
  // declaration is a TDZ error, not just a style preference.
  const onSpawn = useCallback(
    (centre: Point) =>
      setPanels((current) => [...current, makePanel(`n${current.length + 1}`, centre)]),
    []
  )
  const viewport = useViewport(hostRef, rects, onSpawn)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [cursor, setCursor] = useState<Point>({ x: 0, y: 0 })
  const version = useRegistryVersion(registry)

  // Sessions exist for every panel; only their tier changes. In a memo rather
  // than an effect: ensure() runs synchronously during render (so a session
  // exists by the time this same render tries to look one up below) and
  // deliberately never calls bump() — notifying a useSyncExternalStore
  // subscriber mid-render is what React's "update while rendering another
  // component" warning is about. The panel list living in React state is
  // already what triggers this render, so nothing is lost by not bumping.
  useMemo(() => {
    for (const panel of panels) registry.ensure(panel.rect.id, panel.spec)
  }, [panels])

  // Menu-driven clipboard. The old per-panel TerminalPanel used to own this
  // subscription directly against xterm; now that TerminalPanel is a dumb
  // view, ONE subscription here routes to whichever session is focused,
  // rather than each panel subscribing and every panel but one discarding
  // the event. focusedIdRef mirrors state into a ref (the same pattern as
  // useViewport's viewportRef) so the listener reads the current focus
  // without resubscribing. (Cmd+C/Cmd+V arrive as main-side menu
  // accelerators via edit:copy/edit:paste, not as a canvas keydown, so
  // they are unrelated to useViewport's "every shortcut requires Cmd" rule
  // for bare keys reaching the PTY.)
  const focusedIdRef = useRef(focusedId)
  focusedIdRef.current = focusedId
  useEffect(() => {
    const offCopy = window.canvas.edit.onCopy(() => {
      const id = focusedIdRef.current
      const session = id ? registry.get(id) : undefined
      const selection = session?.handle.getSelection()
      if (selection) void navigator.clipboard.writeText(selection)
    })
    const offPaste = window.canvas.edit.onPaste((text) => {
      const id = focusedIdRef.current
      const session = id ? registry.get(id) : undefined
      if (text) session?.handle.paste(text)
    })
    return () => {
      offCopy()
      offPaste()
    }
  }, [])

  // Stable identities: these go into TerminalPanel's effect deps, and a fresh
  // arrow each render would tear the terminal down and reopen it every frame.
  const onSlotMount = useCallback((id: string) => registry.attachSlot(id), [])
  const onSlotUnmount = useCallback((id: string) => registry.detachSlot(id), [])
  const onFocusPanel = useCallback((id: string) => {
    setSelectedId(id)
    setFocusedId(id)
    registry.focus(id)
  }, [])

  // Demotions held back for DEMOTE_DELAY_MS, keyed by panel id, valued by the
  // epoch ms at which the hold started. Refs, not state: the hold is bookkeeping
  // for a timer, and putting it in state would make every hold trigger the very
  // re-render that used to restart the timer.
  const heldSinceRef = useRef(new Map<string, number>())
  const demoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The most recent unheld assignment, read by the timer when it fires. A held
  // demotion is released against the LATEST tiering, not the one that was
  // current when the hold started — so a panel that came back into view during
  // the delay stays live instead of being demoted by a stale decision.
  const tiersRef = useRef<Record<string, Tier>>({})

  // The timer belongs to the component, not to this effect's dependency list:
  // arming it inside an effect whose cleanup clears it meant any change to
  // [rects, viewport, focusedId, version] restarted the 250ms clock. `viewport`
  // changes on every wheel event, so a continuous trackpad pan plus its
  // momentum restarted it indefinitely and nothing ever demoted.
  useEffect(() => () => {
    if (demoteTimerRef.current !== null) clearTimeout(demoteTimerRef.current)
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const bounds = host.getBoundingClientRect()
    const tiers = assignTiers({
      rects,
      viewport,
      size: { width: bounds.width, height: bounds.height },
      focusedId,
      lastFocusedAt: registry.lastFocusedAt()
    })
    tiersRef.current = tiers

    // Promotion is immediate so a panel is live by the time you look at it.
    // Demotion waits, so panning along an edge does not destroy and recreate a
    // WebGL context every frame. Held-back demotions keep their current tier.
    const held = heldSinceRef.current
    const now = Date.now()
    const applied: Record<string, Tier> = {}
    const holding: string[] = []
    let liveCount = 0
    for (const [id, tier] of Object.entries(tiers)) {
      const current = registry.get(id)?.tier ?? 'card'
      if (tier === 'card' && current === 'live') {
        if (!held.has(id)) held.set(id, now)
        holding.push(id)
        applied[id] = 'live'
      } else {
        held.delete(id)
        applied[id] = tier
        if (tier === 'live') liveCount += 1
      }
    }
    // Drop stale holds for panels that no longer exist, so the map cannot grow
    // without bound across a run.
    for (const id of [...held.keys()]) if (tiers[id] === undefined) held.delete(id)

    // INVARIANT: the tier map applied here never contains more than LIVE_BUDGET
    // live panels — hold-backs included. assignTiers already caps its own
    // promotions, but a hold-back is a live panel it did not count, so without
    // this every panel visited during a pan would stay live for the whole
    // gesture and blow through the WebGL context budget. Oldest holds go first:
    // they are the ones that have already had most of the anti-flicker grace
    // period the hold exists to provide.
    holding.sort((a, b) => (held.get(a) ?? 0) - (held.get(b) ?? 0))
    const allowedHolds = Math.max(0, LIVE_BUDGET - liveCount)
    for (const id of holding.slice(0, Math.max(0, holding.length - allowedHolds))) {
      applied[id] = 'card'
      held.delete(id)
    }

    registry.applyTiers(applied)

    // Arm the release timer only when one is not already running. Re-arming on
    // every render is what made the delay unreachable during a gesture.
    if (held.size === 0 || demoteTimerRef.current !== null) return
    demoteTimerRef.current = setTimeout(() => {
      demoteTimerRef.current = null
      // Release every hold at once against the latest tiering. A hold armed
      // late in the window gets slightly less than the full delay, which is
      // fine: the point is to bound the destroy/recreate RATE of WebGL
      // contexts, not to give each panel an exact grace period.
      heldSinceRef.current.clear()
      registry.applyTiers(tiersRef.current)
    }, DEMOTE_DELAY_MS)
  }, [rects, viewport, focusedId, version])

  const toWorld = (event: MouseEvent<HTMLDivElement>): Point | null => {
    const host = hostRef.current
    if (!host) return null
    const bounds = host.getBoundingClientRect()
    return screenToWorld({ x: event.clientX - bounds.left, y: event.clientY - bounds.top }, viewport)
  }

  const onMouseDown = (event: MouseEvent<HTMLDivElement>): void => {
    // Only background clicks reach here; panels stopPropagation.
    const world = toWorld(event)
    setSelectedId(world ? hitTest(rects, world) : null)
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

  const onMouseMove = (event: MouseEvent<HTMLDivElement>): void => {
    const world = toWorld(event)
    if (world) setCursor(world)
  }

  const interactive =
    viewport.scale >= INTERACT_MIN_SCALE && viewport.scale <= INTERACT_MAX_SCALE

  return (
    <div className="canvas" ref={hostRef} onMouseDown={onMouseDown} onMouseMove={onMouseMove}>
      <div
        className="world"
        style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})` }}
      >
        {panels.map((panel) => {
          const session = registry.get(panel.rect.id)
          if (!session) return null
          return (
            <TerminalPanel
              key={panel.rect.id}
              session={session}
              version={version}
              rect={panel.rect}
              selected={panel.rect.id === selectedId}
              interactive={interactive}
              onSelect={setSelectedId}
              onSlotMount={onSlotMount}
              onSlotUnmount={onSlotUnmount}
              onFocus={onFocusPanel}
            />
          )
        })}
      </div>
      <CanvasHud viewport={viewport} cursor={cursor} selectedId={selectedId} />
    </div>
  )
}
