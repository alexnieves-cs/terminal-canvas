import { useCallback, useEffect, useMemo, useRef, useState, type JSX, type MouseEvent } from 'react'
import { CanvasHud } from './CanvasHud'
import { useViewport } from './useViewport'
import { assignTiers, LIVE_BUDGET, type Tier } from './lod'
import { hitTest, screenToWorld, type Point, type WorldRect } from './viewport'
import { usePanelDrag } from './usePanelDrag'
import type { DragMode, DragState } from './panel-interaction'
import { TerminalPanel } from '@renderer/components/TerminalPanel'
import { createRegistry } from '@renderer/session/session-registry'
import { useRegistryVersion } from '@renderer/session/useRegistry'
import { createSessionFactory } from '@renderer/terminal/session-factory'
import { installPointerCorrection, isCorrectedEvent } from '@renderer/components/xterm-pointer'
import type { CanvasState } from '@shared/layout-schema'
import { fromPanels, toPanels } from '@renderer/panels/layout-adapt'
import { firstRunPanels, makePanel, nextZ, raisePanel, removePanel, setPanelRect, type Panel } from '@renderer/panels/panels'
import { createHistory, pushHistory, undoHistory, redoHistory, type History } from '@renderer/panels/history'

/** Promote immediately, demote late: the other half of the anti-thrash story. */
const DEMOTE_DELAY_MS = 250

const registry = createRegistry({
  bridge: window.canvas,
  factory: createSessionFactory()
})

// A renderer teardown that skips React cleanup (Cmd+R, Cmd+W) is handled
// main-side by window-lifecycle.ts; this covers the orderly path.
window.addEventListener('beforeunload', () => registry.disposeAll())

export function Canvas({ initial }: { initial: CanvasState }): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)

  // An empty panel list means first run (or a reset canvas): the store returns
  // no panels and the renderer decides what "nothing" opens with. That also
  // makes closing every panel and relaunching give back one fresh panel rather
  // than a blank canvas — intended, since a canvas with nothing on it and no
  // visible affordance is the outcome this design already rejected.
  const [panels, setPanels] = useState<Panel[]>(() =>
    initial.panels.length > 0 ? toPanels(initial.panels) : firstRunPanels()
  )
  const rects = useMemo(() => panels.map((p) => p.rect), [panels])
  // hitTest returns the LAST match, so paint order and pick order agree only
  // if the array it receives is in paint order. Paint order is z now, not
  // array position — see the note on Panel.z.
  const hitOrder = useMemo(
    () => [...panels].sort((a, b) => a.z - b.z).map((p) => p.rect),
    [panels]
  )
  // Declared before useViewport (which takes it as an argument) rather than
  // grouped with the other callbacks below: a const used before its
  // declaration is a TDZ error, not just a style preference.
  //
  // The id is a monotonic sequence, NOT the array's length. Length-derived ids
  // were sound while the array only grew; removePanel breaks that — spawn n13, close any
  // panel, spawn again, and the second panel is n13 too. Every consequence is
  // silent: registry.ensure returns the EXISTING session, so the new panel
  // renders the old one's handle.host (which can only live in one slot), and
  // setPanelRect/removePanel then act on both entries at once. The counter is a
  // ref rather than state because nothing renders it. `n` keeps it clear of the
  // seed panels' `s` ids.
  //
  // Seeded from the RESTORED ids, never from a constant. `1` on every run was
  // sound while the array always started empty; persistence breaks that.
  // Restore a canvas holding n5, press Cmd+N five times, and the fifth panel is
  // n5 too — the same duplicate-id defect the comment above describes,
  // resurrected through a different door.
  const nextIdRef = useRef(
    initial.panels.reduce((max, p) => {
      const match = /^n(\d+)$/.exec(p.id)
      return match ? Math.max(max, Number(match[1]) + 1) : max
    }, 1)
  )
  // The undo stack holds Panel[] — the same array persistence already
  // serialises. Camera moves are deliberately absent: pan and zoom are
  // continuous and self-evidently reversible by doing the opposite, and
  // putting them here would make Cmd+Z usually rewind a scroll instead of the
  // edit the user meant.
  //
  // The `present` half of History is read only through the updater callbacks
  // below (setHistory((h) => ...)), never off a `history` local — every read
  // site needs the LATEST past/future, and closing over a render's snapshot
  // would undo/redo against a stale stack the moment two edits landed in the
  // same tick. Destructuring only the setter also keeps `noUnusedLocals`
  // honest instead of manufacturing a read nothing else needs.
  const [, setHistory] = useState<History<Panel[]>>(() => createHistory(panels))

  // Declared before onSpawn (which uses it) rather than grouped with the
  // other undo plumbing below applyHistory needs: applyHistory itself needs
  // setSelectedId/setFocusedId/setDormantIds, which are not declared until
  // further down, so it is defined after them. commitHistory has no such
  // dependency and can be pushed up here instead of forward-declaring onSpawn.
  //
  // A note on a pattern used throughout this file's history plumbing: onSpawn,
  // onClosePanel, and onSelectPanel below all call commitHistory (which itself
  // calls setHistory) from INSIDE a setPanels(current => ...) updater, and the
  // undo/redo paths (the effect above and __m4bUndo) call applyHistory (which
  // calls four more setters) from inside a setHistory updater. React's
  // documented contract is that updater functions are pure — no side effects.
  // This is safe ONLY because this app deliberately runs without StrictMode
  // (see src/renderer/main.tsx and CLAUDE.md's "No StrictMode" note): under
  // StrictMode, React double-invokes updaters in development to surface
  // exactly this kind of impurity, and every operation here (pushHistory,
  // registry.dispose, the setState calls in applyHistory) is idempotent under
  // a second invocation with the same arguments, but the DOUBLE-INVOCATION
  // itself — two dispose() calls, two history pushes — is not something this
  // code has been proven against. If StrictMode is ever turned back on, this
  // whole call chain needs re-auditing before trusting it again.
  const commitHistory = useCallback((next: Panel[]) => {
    setHistory((h) => pushHistory(h, next))
  }, [])

  const onSpawn = useCallback((centre: Point) => {
    const id = `n${nextIdRef.current++}`
    setPanels((current) => {
      const next = [...current, makePanel(id, centre, nextZ(current))]
      commitHistory(next)
      return next
    })
  }, [commitHistory])
  const [selectedId, setSelectedId] = useState<string | null>(initial.selectedId)
  const [focusedId, setFocusedId] = useState<string | null>(initial.focusedId)
  const [cursor, setCursor] = useState<Point>({ x: 0, y: 0 })

  // Panels that came from disk start dormant; first-run panels do not. The
  // renderer is what generates first-run panels, so it is also what knows
  // which panels were restored — no flag has to cross the IPC boundary.
  const [dormantIds, setDormantIds] = useState<ReadonlySet<string>>(
    () => new Set(initial.panels.map((p) => p.id))
  )

  // Applying a history state has to reach the registry too: an undone close
  // must recreate the panel's session, and it comes back DORMANT because its
  // PTY was killed on the click that closed it and there is nothing to
  // revive — registry.ensure (in the useMemo below) recreates the session
  // from scratch once the panel reappears in `panels`, and passing dormant:
  // true for it is what turns that into a card instead of a fresh spawn.
  const applyHistory = useCallback((next: History<Panel[]>) => {
    const ids = new Set(next.present.map((p) => p.rect.id))
    // Undo of a spawn (or redo of a close) removes a panel from `present`
    // without ever routing through onClosePanel — dispose(id) otherwise has
    // exactly one call site (onClosePanel), so without this a panel undone
    // out of existence keeps a live PTY forever: no panel remains to render
    // a close button for it, and the NEXT action clears `future`, so redo
    // cannot bring it back either. This is a legitimate third caller of
    // dispose, not a violation of "tiering must never reach dispose" — undo
    // of a spawn IS an explicit panel removal, the same act the close button
    // performs, just driven by Cmd+Z instead of a click. Deriving the
    // departing set from the registry (rather than tracking it separately)
    // is self-healing: the registry and `present` stay in step by
    // construction after this call, no matter which direction history moved.
    for (const session of registry.all()) {
      if (!ids.has(session.id)) registry.dispose(session.id)
    }
    setPanels(next.present)
    setDormantIds((current) => {
      const merged = new Set([...current].filter((id) => ids.has(id)))
      for (const panel of next.present) {
        if (!registry.get(panel.rect.id)?.spawned) merged.add(panel.rect.id)
      }
      return merged
    })
    setSelectedId((id) => (id && ids.has(id) ? id : null))
    setFocusedId((id) => (id && ids.has(id) ? id : null))
  }, [])

  // Mirrors focusedId into a ref so shouldYieldWheel (below) can read the
  // current focus without being redefined on every focus change — it must
  // stay referentially stable (useCallback with an empty dep list) so
  // useViewport's effect installs the wheel listener exactly once.
  const focusedIdRef = useRef(focusedId)
  focusedIdRef.current = focusedId

  // A wheel belongs to a terminal only when it is over the FOCUSED panel.
  // Focus is explicit — the user clicked in — which makes the rule
  // predictable without having to be explained.
  const shouldYieldWheel = useCallback((event: WheelEvent): boolean => {
    const id = focusedIdRef.current
    if (!id) return false
    const target = event.target as HTMLElement | null
    const panel = target?.closest?.('.panel')
    return panel?.getAttribute('data-panel-id') === id
  }, [])

  const viewport = useViewport(hostRef, rects, onSpawn, shouldYieldWheel, initial.camera)
  const version = useRegistryVersion(registry)

  // Sessions exist for every panel; only their tier changes. In a memo rather
  // than an effect: ensure() runs synchronously during render (so a session
  // exists by the time this same render tries to look one up below) and
  // deliberately never calls bump() — notifying a useSyncExternalStore
  // subscriber mid-render is what React's "update while rendering another
  // component" warning is about. The panel list living in React state is
  // already what triggers this render, so nothing is lost by not bumping.
  useMemo(() => {
    for (const panel of panels) {
      registry.ensure(panel.rect.id, panel.spec, { dormant: dormantIds.has(panel.rect.id) })
    }
  }, [panels, dormantIds])

  // Menu-driven clipboard. The old per-panel TerminalPanel used to own this
  // subscription directly against xterm; now that TerminalPanel is a dumb
  // view, ONE subscription here routes to whichever session is focused,
  // rather than each panel subscribing and every panel but one discarding
  // the event. focusedIdRef (declared above, alongside shouldYieldWheel)
  // mirrors state into a ref (the same pattern as useViewport's viewportRef)
  // so the listener reads the current focus without resubscribing. (Cmd+C/
  // Cmd+V arrive as main-side menu accelerators via edit:copy/edit:paste,
  // not as a canvas keydown, so they are unrelated to useViewport's "every
  // shortcut requires Cmd" rule for bare keys reaching the PTY.)
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

  // Menu-driven undo/redo, delivered the same way as copy/paste — through
  // main's menu accelerators, never the stock 'undo'/'redo' roles, which
  // drive document.execCommand against whatever DOM element happens to be
  // focused (xterm's hidden textarea, most of the time) rather than this
  // history stack.
  useEffect(() => {
    const offUndo = window.canvas.edit.onUndo(() =>
      setHistory((h) => { const next = undoHistory(h); applyHistory(next); return next })
    )
    const offRedo = window.canvas.edit.onRedo(() =>
      setHistory((h) => { const next = redoHistory(h); applyHistory(next); return next })
    )
    return () => {
      offUndo()
      offRedo()
    }
  }, [applyHistory])

  // Same mirror-into-a-ref pattern, for the listeners below that need the
  // current scale but must not resubscribe: `viewport` changes on every wheel
  // event, and a document-level listener reinstalled at 60Hz mid-gesture would
  // drop the drag state it is holding.
  const viewportRef = useRef(viewport)
  viewportRef.current = viewport

  // Corrects xterm's coordinates for the world transform. Reads the scale
  // through a ref so the listener is installed once and never resubscribes —
  // viewport changes on every wheel event.
  useEffect(() => installPointerCorrection(() => viewportRef.current.scale), [])

  // Test hooks for verify:panels. The registry is a module-level closure with
  // no global handle by design, and executeJavaScript has no other route into
  // it. Kept to seven narrow reads/writes rather than exposing the registry
  // itself, so the suite cannot quietly start depending on internals.
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>
    w.__m4aScale = (): number => viewportRef.current.scale
    w.__m4aWrite = (data: string): void => {
      const id = focusedIdRef.current
      if (id) registry.get(id)?.handle.write(data)
    }
    w.__m4aSelection = (): string => {
      const id = focusedIdRef.current
      return registry.get(id ?? '')?.handle.getSelection() ?? ''
    }
    w.__m4aGrid = (): { cols: number; rows: number } | null => {
      const id = focusedIdRef.current
      const session = id ? registry.get(id) : undefined
      // Guarded on the tier, because size() throws by design for a session
      // that was never attached (see session-factory). There is a window
      // between focusedId being set and attachSlot landing, and an unguarded
      // read there would reject executeJavaScript and surface as an
      // infrastructure error for the whole suite rather than a null.
      return session && session.tier === 'live' ? session.handle.size() : null
    }
    /**
     * The full viewport, so a check can re-derive screenToWorld itself rather
     * than assert against the production conversion it is testing.
     */
    w.__m4aViewport = (): { x: number; y: number; scale: number } => ({
      ...viewportRef.current
    })
    /** Screen-space centre of the first cell of `word` in the focused panel. */
    w.__m4aCellToScreen = (word: string): { x: number; y: number } | null => {
      const id = focusedIdRef.current
      const session = id ? registry.get(id) : undefined
      if (!session) return null
      const found = session.handle.locate(word)
      if (!found) return null
      const rect = session.handle.host.getBoundingClientRect()
      const cell = session.handle.cellSize()
      const scale = viewportRef.current.scale
      // rect is transform-aware (screen px); cell is CSS px. Multiplying the
      // cell offset by the scale is the INVERSE of correctForScale, which is
      // how a caller turns a buffer position back into a real screen point.
      return {
        x: rect.left + (found.col + 0.5) * cell.width * scale,
        y: rect.top + (found.row + 0.5) * cell.height * scale
      }
    }
    /** A panel's xterm scrollback offset, by id — not just the focused one. */
    w.__m4aScrollY = (id: string): number | null => {
      const session = registry.get(id)
      return session ? session.handle.scrollPosition() : null
    }
    /**
     * Drives the same undo path Cmd+Z does. executeJavaScript has no way to
     * dispatch a real main-process menu accelerator, so this is the narrow
     * verb verify:panels needs to exercise undo without one.
     */
    w.__m4bUndo = (): void =>
      setHistory((h) => { const next = undoHistory(h); applyHistory(next); return next })
  }, [applyHistory])

  // One gesture at a time, driven by document listeners installed once. Moves
  // rewrite the rect on every frame; only a resize commits anything to the PTY,
  // and only on release.
  const beginDrag = usePanelDrag({
    hostRef,
    viewportRef,
    onDrag: useCallback(
      (id: string, rect: WorldRect) => setPanels((current) => setPanelRect(current, id, rect)),
      []
    ),
    onCommit: useCallback((id: string, mode: DragMode) => {
      // One history entry per gesture. onDrag (above) called setPanels ~60
      // times during the drag; pushing there would make a single drag take
      // sixty Cmd+Z presses to undo. This runs exactly once, on mouseup,
      // reading the settled array back out of setPanels's updater rather than
      // closing over a stale `panels` from render.
      setPanels((current) => {
        commitHistory(current)
        return current
      })
      // A move changes no terminal dimension, so it has nothing to commit.
      if (mode.kind !== 'resize') return
      // One commit per gesture, never one per frame: a full-screen agent TUI
      // repaints its whole frame on every SIGWINCH, and resizing live would
      // mean sixty of those a second at sizes the user never meant to keep.
      // refit sends at most one pty:resize, and none if the grid is unchanged.
      registry.refit(id)
    }, [commitHistory])
  })

  const onBeginDrag = useCallback(
    (state: DragState) => {
      const host = hostRef.current
      if (!host) return
      const bounds = host.getBoundingClientRect()
      // The panel supplies CLIENT coordinates; only the canvas knows the
      // viewport, so the conversion belongs here. Converting the POINT (not a
      // delta) is what makes the gesture move by screenDelta / scale:
      // usePanelDrag converts each move the same way, and the two translations
      // cancel in the subtraction applyDrag does.
      beginDrag({
        ...state,
        originWorld: screenToWorld(
          { x: state.originWorld.x - bounds.left, y: state.originWorld.y - bounds.top },
          viewportRef.current
        )
      })
    },
    [beginDrag]
  )

  // Stable identities: these go into TerminalPanel's effect deps, and a fresh
  // arrow each render would tear the terminal down and reopen it every frame.
  const onSlotMount = useCallback((id: string) => registry.attachSlot(id), [])
  const onSlotUnmount = useCallback((id: string) => registry.detachSlot(id), [])
  const onClosePanel = useCallback((id: string) => {
    // What actually matters is that dispose runs SYNCHRONOUSLY inside this
    // handler, killing the pty on the click that asked for it. The ordering
    // against setPanels is not load-bearing: this is a React synthetic
    // onMouseDown, so setPanels is batched and the unmount happens after the
    // handler returns either way. TerminalPanel's cleanup then runs against an
    // already-disposed session, which is fine by construction — detachSlot
    // early-returns on a missing id, and the cleanup's removeChild is guarded
    // on host.parentNode === slot.
    registry.dispose(id)
    setPanels((current) => {
      const next = removePanel(current, id)
      commitHistory(next)
      return next
    })
    setSelectedId((current) => (current === id ? null : current))
    setFocusedId((current) => (current === id ? null : current))
  }, [commitHistory])
  const onSelectPanel = useCallback((id: string) => {
    setSelectedId(id)
    setPanels((current) => {
      // Skip the raise (and the history push it would trigger) when `id` is
      // already topmost. onFocusPanel calls this on every click into a panel
      // to type — without this guard, an ordinary editing session fills
      // HISTORY_LIMIT with z-order noise, and a user's first several Cmd+Z
      // presses undo clicking rather than the edit they meant. This decision
      // belongs here, not in history.ts: that module's docstring deliberately
      // declines to define equality for pushHistory ("no equality check...
      // deciding otherwise needs a notion of equality this module has no
      // business defining") — recognizing a no-op RAISE is a panels.ts/Canvas
      // concept (topmost z), not a general state-equality one, so it stays a
      // caller-side decision instead of smuggling one into the primitive.
      const panel = current.find((p) => p.rect.id === id)
      const alreadyTop = panel !== undefined && current.every((p) => p.z <= panel.z)
      if (alreadyTop) return current
      const next = raisePanel(current, id)
      commitHistory(next)
      return next
    })
    // Waking hangs off SELECT, not focus. A carded panel has no .panel__slot
    // and so no focus handler of its own — its click falls through to the
    // canvas background, which hit-tests and selects. Hooking onFocusPanel
    // would leave a dormant panel unwakeable by clicking the very card that
    // says "click to start".
    setDormantIds((current) => {
      if (!current.has(id)) return current
      const next = new Set(current)
      next.delete(id)
      return next
    })
    registry.wake(id)
  }, [commitHistory])
  const onFocusPanel = useCallback((id: string) => {
    onSelectPanel(id)
    setFocusedId(id)
    registry.focus(id)
  }, [onSelectPanel])

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
      lastFocusedAt: registry.lastFocusedAt(),
      dormantIds
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
  }, [rects, viewport, focusedId, version, dormantIds])

  // Persist on every change. Unthrottled on purpose, including the ~60/sec a
  // drag produces: main coalesces to one write per 500ms and keeps only the
  // newest, so one process owns the timing — and it is the one that has to
  // survive the other's death.
  //
  // This resembles the flood pty-manager.ts's 16ms batching exists to prevent,
  // and the difference is worth stating. That was THOUSANDS of messages a
  // second arriving continuously at the renderer's event loop; this is sixty
  // small JSON payloads a second reaching an otherwise-idle main process, and
  // only while a gesture is in progress.
  useEffect(() => {
    void window.canvas.layout.save({
      panels: fromPanels(panels),
      camera: viewport,
      selectedId,
      focusedId
    })
  }, [panels, viewport, selectedId, focusedId])

  const toWorld = (event: MouseEvent<HTMLDivElement>): Point | null => {
    const host = hostRef.current
    if (!host) return null
    const bounds = host.getBoundingClientRect()
    return screenToWorld({ x: event.clientX - bounds.left, y: event.clientY - bounds.top }, viewport)
  }

  const onMouseDown = (event: MouseEvent<HTMLDivElement>): void => {
    // Only background clicks reach here; panels stopPropagation.
    const world = toWorld(event)
    const hit = world ? hitTest(hitOrder, world) : null
    // Through onSelectPanel, not setSelectedId: selecting raises. A live
    // panel's own chrome handler already does that, but a CARDED panel has no
    // handler of its own — its click falls through to the background path, and
    // calling setSelectedId here directly would select it without raising it.
    if (hit) onSelectPanel(hit)
    else setSelectedId(null)
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
              z={panel.z}
              selected={panel.rect.id === selectedId}
              onSelect={onSelectPanel}
              onSlotMount={onSlotMount}
              onSlotUnmount={onSlotUnmount}
              onFocus={onFocusPanel}
              onBeginDrag={onBeginDrag}
              onClose={onClosePanel}
            />
          )
        })}
      </div>
      <CanvasHud viewport={viewport} cursor={cursor} selectedId={selectedId} />
    </div>
  )
}
