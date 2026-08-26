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
import type { CapturedPanel, PresetTemplate, SessionBackendInfo } from '@shared/ipc-contract'
import type { PanelSpecTemplate } from '@renderer/session/panel-session'
import { fromPanels, toPanels } from '@renderer/panels/layout-adapt'
import { firstRunPanels, makePanel, nextZ, raisePanel, removePanel, setPanelRect, type Panel } from '@renderer/panels/panels'
import { createHistory, pushHistory, undoHistory, redoHistory, type History } from '@renderer/panels/history'
import { usePalette } from '@renderer/palette/usePalette'
import { Palette, type InputMode } from '@renderer/palette/Palette'
import type { PaletteActions, PanelRow, PresetRow, PromptRow } from '@renderer/palette/commands'

/** Promote immediately, demote late: the other half of the anti-thrash story. */
const DEMOTE_DELAY_MS = 250

// Module-level so the palette's props keep the same identity between renders;
// a fresh [] each render would rebuild the command list on every frame of a pan.
const EMPTY_PRESETS: PresetRow[] = []
const EMPTY_PROMPTS: PromptRow[] = []
const EMPTY_PANELS: PanelRow[] = []

/**
 * What the switcher calls a panel. No user-set names exist yet (ideas-backlog
 * #6 puts titles on Panel and PersistedPanel already reserves the field), so
 * this is the same shape autoName() uses in main/presets.ts — the program and
 * where it is running — plus the id, which is the only guaranteed-unique part.
 */
function panelLabel(panel: Panel): string {
  const command = panel.spec.command ? panel.spec.command.split('/').pop() : 'login shell'
  return `${command} — ${panel.spec.cwd} (${panel.rect.id})`
}

const registry = createRegistry({
  bridge: window.canvas,
  factory: createSessionFactory()
})

// THERE IS DELIBERATELY NO `beforeunload` TEARDOWN HERE, and adding one back
// silently deletes M4c's headline feature.
//
// Until M4c this file called registry.disposeAll() on beforeunload, because
// "the renderer is going away" and "these processes should die" were the same
// statement. M4c split them: a teardown detaches the tmux CLIENT while the
// SESSION keeps running, so the next page's pty:create lands back in the same
// process. disposeAll() sends pty:kill for every panel, and pty:kill means
// `tmux kill-session` — the opposite of a detach.
//
// It also WINS the race. beforeunload runs before the navigation starts, so on
// Cmd+R main receives every pty:kill first and window-lifecycle.ts's
// did-start-navigation detachAll() then walks an already-empty map. Measured
// under this repo's own Electron: pty:kill(n1) arrived first, detachAll second.
//
// Renderer teardown is main's job in all three of its shapes
// (did-start-navigation, render-process-gone, closed) and quitting is
// before-quit's (killAll + backend.shutdown()), so nothing here is left
// unhandled. What this loses is freeing xterm/WebGL from the renderer side on
// an orderly reload — which costs nothing, since the page is being destroyed
// and the browser reclaims both anyway.
//
// verify:panels check 26 reloads a real renderer against a real PtyManager on
// a tmux backend and asserts the session survives; that is what fails if this
// listener comes back.

export function Canvas({
  initial,
  liveSessionIds,
  defaultTemplate
}: {
  initial: CanvasState
  /** Panels that already have a process; see renderer/main.tsx for the rule. */
  liveSessionIds: Set<string>
  /**
   * Cmd+N's template, as of the moment React mounted. A PROP rather than
   * something this component subscribes for, because main's push arrives
   * before any effect here runs — see renderer/main.tsx.
   */
  defaultTemplate?: PresetTemplate
}): JSX.Element {
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

  // The template Cmd+N spawns. A ref, not state: it is read inside onSpawn's
  // callback and a re-render is pointless — nothing on screen depends on it.
  //
  // SEEDED from the prop, not from undefined. main pushes PRESET_DEFAULT at
  // did-finish-load, which is over before this component's effects run, so the
  // subscription below never sees the boot push — renderer/main.tsx catches it
  // at module scope and it arrives here as a prop. Seeding from undefined
  // instead reads as harmless (makePanel falls back to a login shell) and is
  // exactly the silent inertness that made every configured default do
  // nothing; verify:panels 32 is the check that fails if this goes back.
  // The subscription stays for the re-push case: a runtime change to the
  // presets or the default still has to land after mount.
  const defaultTemplateRef = useRef<PresetTemplate | undefined>(defaultTemplate)

  const onSpawn = useCallback(
    (centre: Point, template?: PresetTemplate) => {
      const chosen = template ?? defaultTemplateRef.current
      const id = `n${nextIdRef.current++}`
      setPanels((current) => {
        const next = [
          ...current,
          makePanel(
            id,
            centre,
            nextZ(current),
            chosen
              ? { panelId: id, cwd: chosen.cwd, args: [...chosen.args], ...(chosen.command !== undefined ? { command: chosen.command } : {}) }
              : undefined,
            chosen ? { w: chosen.w, h: chosen.h } : undefined
          )
        ]
        commitHistory(next)
        return next
      })
    },
    [commitHistory]
  )
  const [selectedId, setSelectedId] = useState<string | null>(initial.selectedId)
  const [focusedId, setFocusedId] = useState<string | null>(initial.focusedId)
  const [cursor, setCursor] = useState<Point>({ x: 0, y: 0 })

  // One shot: the backend cannot change during a run, so this is not a
  // subscription. A failure leaves it null and the HUD simply says nothing,
  // which is the correct silent case — we only ever speak up for bad news.
  const [backendInfo, setBackendInfo] = useState<SessionBackendInfo | null>(null)
  useEffect(() => {
    let cancelled = false
    void window.canvas.session
      .info()
      .then((info) => {
        if (!cancelled) setBackendInfo(info)
      })
      .catch((error: unknown) => {
        console.warn('[backend] could not read the session backend', error)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Panels that came from disk start dormant; first-run panels do not. The
  // renderer is what generates first-run panels, so it is also what knows
  // which panels were restored — no flag has to cross the IPC boundary.
  //
  // A restored panel with a live tmux session is subtracted out here: it has
  // no process to spawn, so M4b's dormancy rule does not apply to it — see
  // renderer/main.tsx for the full rule this settles.
  const [dormantIds, setDormantIds] = useState<ReadonlySet<string>>(
    () => new Set(initial.panels.map((p) => p.id).filter((id) => !liveSessionIds.has(id)))
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
    // without ever routing through onClosePanel, so without this loop a
    // panel undone out of existence keeps a live PTY forever: no panel
    // remains to render a close button for it, and the NEXT action clears
    // `future`, so redo cannot bring it back either. Calling registry.dispose
    // here is legitimate, not a violation of "tiering must never reach
    // dispose" — undo of a spawn IS an explicit panel removal, the same act
    // the close button and the reset handler perform, just driven by Cmd+Z
    // instead of a click. It does not add a caller of pty.kill: dispose(id)
    // and disposeAll() remain the only two (see session-registry.ts), and
    // routing through dispose() rather than calling pty.kill directly is
    // exactly what keeps that count true. Deriving the departing set from
    // the registry (rather than tracking it separately) is self-healing:
    // the registry and `present` stay in step by construction after this
    // call, no matter which direction history moved.
    for (const session of registry.all()) {
      if (!ids.has(session.id)) registry.dispose(session.id)
    }
    setPanels(next.present)
    setDormantIds((current) => {
      const merged = new Set([...current].filter((id) => ids.has(id)))
      for (const panel of next.present) {
        const session = registry.get(panel.rect.id)
        // Read the registry's OWN dormant flag, not `!spawned`. registry.wake
        // clears session.dormant but does not spawn (a woken panel still has
        // to be promoted to live before attachSlot spawns it) — so a panel
        // woken while zoomed out below LIVE_MIN_SCALE stays unspawned with
        // dormant already false. Re-deriving from `!spawned` would put it
        // back in dormantIds on the next undo even though registry.ensure
        // (in the tiering memo) returns that SAME session untouched, leaving
        // its card reading "not started" instead of "click to start" until
        // another click. Keying off session.dormant means the two can never
        // diverge for a panel whose session already exists.
        //
        // A session of `undefined` is the OTHER case this loop has to cover:
        // undoing a close deletes the session entirely (registry.dispose),
        // so it does not exist yet here and the memo below recreates it from
        // scratch once `panels` re-renders. That recreation is what must
        // come back dormant (its PTY is gone with nothing to revive), so a
        // missing session counts as dormant too.
        if (!session || session.dormant) merged.add(panel.rect.id)
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

  // Same mirror-into-a-ref pattern, for the reset listener below: it must
  // install once, but panels changes on every frame of a drag.
  const panelsRef = useRef(panels)
  panelsRef.current = panels

  // A wheel belongs to a terminal only when it is over the FOCUSED panel.
  // Focus is explicit — the user clicked in — which makes the rule
  // predictable without having to be explained.
  const shouldYieldWheel = useCallback((event: WheelEvent): boolean => {
    const id = focusedIdRef.current
    if (!id) return false
    const target = event.target as HTMLElement | null
    const panel = target?.closest?.('.panel')
    if (panel?.getAttribute('data-panel-id') !== id) return false
    // A restored focusedId can name a panel lod.ts still refuses to promote
    // (dormant beats even focus) — that panel is a CARD, not a live slot, and
    // a card has no xterm underneath to hand the wheel event to. Yielding
    // anyway means the event reaches nothing: it doesn't scroll (no
    // terminal) and doesn't pan (the camera deferred), so the app reads as
    // frozen until the user clicks elsewhere. Requiring the slot is what lets
    // the camera claim the wheel over a card the way it does over any other
    // non-live panel.
    return panel.querySelector('.panel__slot') !== null
  }, [])

  // The palette owns the keyboard while it is open; see usePalette's four
  // rules. restoreFocus is SessionHandle.focus() on the panel that was focused
  // when it opened — the registry lookup lives here because the palette layer
  // deliberately knows nothing about the registry.
  const restoreFocus = useCallback((id: string) => {
    registry.get(id)?.handle.focus()
  }, [])
  const palette = usePalette({ focusedIdRef, restoreFocus })
  // null is command mode. Set by beginRenamePreset and beginSavePrompt.
  const [inputMode, setInputMode] = useState<InputMode | null>(null)
  // The palette always OPENS in command mode. Both ends of a rename leave the
  // mode set otherwise: a completed one resolves after Palette has already
  // closed itself (it closes before calling submit, so nothing on screen is
  // left to clear it), and a cancelled one never reaches submit at all. Either
  // way the next Cmd+K would greet the user with a stale text field, no list,
  // and no explanation.
  useEffect(() => {
    if (!palette.open) setInputMode(null)
  }, [palette.open])

  const { viewport, resetViewport, worldCentre, centreOn } = useViewport(
    hostRef, rects, onSpawn, shouldYieldWheel, initial.camera, palette.isOpen
  )
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
      // With the palette open the user is looking at a text field, not a
      // terminal, and focusedId still names that terminal (rule 2 keeps it).
      // Copying its selection here would put text the user cannot see on the
      // clipboard; Palette.tsx serves its own input instead.
      if (palette.isOpen()) return
      const id = focusedIdRef.current
      const session = id ? registry.get(id) : undefined
      const selection = session?.handle.getSelection()
      if (selection) void navigator.clipboard.writeText(selection)
    })
    const offPaste = window.canvas.edit.onPaste((text) => {
      // Rule 3. Without this the text lands in a running agent, invisibly,
      // while the user watches an empty text field. verify:panels 35.
      if (palette.isOpen()) return
      const id = focusedIdRef.current
      const session = id ? registry.get(id) : undefined
      if (text) session?.handle.paste(text)
    })
    return () => {
      offCopy()
      offPaste()
    }
    // palette.isOpen is referentially stable, so this stays a once-only
    // install; listing it makes the dependency visible rather than implied.
  }, [palette.isOpen])

  // The three preset events main pushes (see main/index.ts's menu handlers).
  // Routed through onSpawn/commitHistory rather than a second spawn path so a
  // preset spawn inherits the SAME undo behaviour as Cmd+N: undo removing a
  // panel must dispose its session, and that guarantee lives in applyHistory,
  // reachable only by going through the ordinary history stack.
  useEffect(() => {
    const offSpawn = window.canvas.preset.onSpawn((template) => {
      onSpawn(worldCentre(), template)
    })
    const offDefault = window.canvas.preset.onDefault((template) => {
      defaultTemplateRef.current = template
    })
    const offCapture = window.canvas.preset.onCapture(() => {
      const id = focusedIdRef.current
      if (!id) return null
      const panel = panelsRef.current.find((p) => p.rect.id === id)
      if (!panel) return null
      // spec.cwd is the SPAWN directory, not wherever the user has since cd'd
      // to — reading the real one means asking the pid, which is its own piece
      // of machinery (ideas-backlog #4) and deliberately not in M5a.
      const captured: CapturedPanel = {
        cwd: panel.spec.cwd,
        args: [...panel.spec.args],
        w: panel.rect.w,
        h: panel.rect.h
      }
      // Absent stays absent: a captured login-shell panel must save as a
      // login-shell preset, not as whatever this machine's shell happens to be.
      if (panel.spec.command !== undefined) captured.command = panel.spec.command
      return captured
    })
    return () => {
      offSpawn()
      offDefault()
      offCapture()
    }
  }, [onSpawn, worldCentre])

  // Menu-driven undo/redo, delivered the same way as copy/paste — through
  // main's menu accelerators, never the stock 'undo'/'redo' roles, which
  // drive document.execCommand against whatever DOM element happens to be
  // focused (xterm's hidden textarea, most of the time) rather than this
  // history stack.
  useEffect(() => {
    // Rule 3 again, and this is the sharpest edge of it: Cmd+Z is a menu
    // accelerator on exactly the same footing as Cmd+V, so with the palette
    // open and a name half-typed it does not undo the TYPING — it runs
    // applyHistory, which removes a panel and disposes its session, behind the
    // overlay, with no visible cause. verify:panels 37.
    const offUndo = window.canvas.edit.onUndo(() => {
      if (palette.isOpen()) return
      setHistory((h) => { const next = undoHistory(h); applyHistory(next); return next })
    })
    const offRedo = window.canvas.edit.onRedo(() => {
      if (palette.isOpen()) return
      setHistory((h) => { const next = redoHistory(h); applyHistory(next); return next })
    })
    return () => {
      offUndo()
      offRedo()
    }
  }, [applyHistory, palette.isOpen])

  // Pulled out of the onReset listener below so verify:panels' __m4bReset
  // hook (see the test-hook effect further down) can drive the exact same
  // path a confirmed main-process reset does — executeJavaScript has no way
  // to trigger the native confirmation dialog that guards the real trigger,
  // so this is the narrow verb the suite calls instead.
  const resetCanvas = useCallback(() => {
    // dispose, not just drop: reset kills every process. registry.dispose
    // is one of three call sites in this file (the others are the close
    // button and undo/redo removing a panel); pty.kill itself still has
    // only its two callers inside session-registry.ts, because every one
    // of these three routes through dispose() rather than calling
    // pty.kill directly.
    for (const panel of panelsRef.current) registry.dispose(panel.rect.id)
    const fresh = firstRunPanels()
    setPanels(fresh)
    setDormantIds(new Set())
    setSelectedId(null)
    setFocusedId(null)
    setHistory(createHistory(fresh))
    // firstRunPanels() places its panel at the world origin. Without
    // returning the camera too, reset from anywhere but the origin leaves
    // that panel off screen — an empty canvas, exactly what "First run"
    // is not supposed to allow — and the save effect below immediately
    // persists the still-distant camera over the one layoutStore.reset()
    // just cleared, so the blank view survives a relaunch.
    resetViewport()
  }, [resetViewport])

  // Main owns the reset dialog but only the renderer knows the live statuses,
  // so it supplies the counts the confirmation names.
  useEffect(() => {
    const offCounts = window.canvas.canvas.onCounts(() => ({
      panels: panelsRef.current.length,
      running: panelsRef.current.filter((p) => {
        const kind = registry.get(p.rect.id)?.status.kind
        return kind === 'running' || kind === 'starting'
      }).length
    }))
    const offReset = window.canvas.canvas.onReset(resetCanvas)
    return () => {
      offCounts()
      offReset()
    }
  }, [resetCanvas])

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
     * Every session's boot-reconcile state, by id. Answers whether dormancy
     * came out right at launch: a panel reattached to a live tmux session
     * must be non-dormant, and one with nothing to reattach to must stay
     * dormant — see CLAUDE.md's "Dormancy is about spawning, not attaching".
     */
    w.__m4aSessions = (): Array<{ id: string; dormant: boolean; spawned: boolean }> =>
      registry.all().map((s) => ({ id: s.id, dormant: s.dormant, spawned: s.spawned }))
    /**
     * Drives the same undo path Cmd+Z does. executeJavaScript has no way to
     * dispatch a real main-process menu accelerator, so this is the narrow
     * verb verify:panels needs to exercise undo without one.
     */
    w.__m4bUndo = (): void =>
      setHistory((h) => { const next = undoHistory(h); applyHistory(next); return next })
    /**
     * Drives the same reset path the confirmed "Reset canvas…" menu item
     * does, minus the native dialog executeJavaScript cannot reach. Exists
     * so verify:panels can cover the reset handler at all — until this hook,
     * no suite exercised it, which is how the camera-left-behind and
     * panels-still-imply-workspace-loss defects both survived to a
     * whole-branch review.
     */
    w.__m4bReset = (): void => resetCanvas()
    /**
     * A panel's spec and rect, by id — what check 27/29/31 read back to
     * confirm a preset actually reached makePanel rather than just checking
     * that SOME panel appeared.
     */
    w.__m5aSpecOf = (id: string): { spec: PanelSpecTemplate; rect: WorldRect } | null => {
      const panel = panelsRef.current.find((p) => p.rect.id === id)
      return panel ? { spec: panel.spec, rect: panel.rect } : null
    }
    /** The template currently pushed as Cmd+N's default, or undefined. */
    w.__m5aDefaultSpec = (): PresetTemplate | undefined => defaultTemplateRef.current
  }, [applyHistory, resetCanvas])

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
  /**
   * Select and raise, without waking. The half onSelectPanel and the palette's
   * goToPanel share: a raise is a z change and nothing more (see "Stacking is
   * Panel.z, never array order"), so it is safe for a navigation that must not
   * start a process, while registry.wake — onSelectPanel's other half — is not.
   */
  const selectAndRaise = useCallback((id: string) => {
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
  }, [commitHistory])

  const onSelectPanel = useCallback((id: string) => {
    selectAndRaise(id)
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
  }, [selectAndRaise])
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

  // Loaded when the palette OPENS, not on mount and not on a subscription: the
  // list is only ever looked at while the overlay is up, and availability is
  // probed once at startup anyway (a brew install mid-session is a known limit
  // of M5a, not something a subscription here would fix). Reloaded after every
  // mutation, because main is the only side that knows what the store now says.
  const [presetRows, setPresetRows] = useState<PresetRow[]>(EMPTY_PRESETS)
  const reloadPresets = useCallback(() => {
    void window.canvas.preset.list().then(setPresetRows)
  }, [])
  useEffect(() => {
    if (palette.open) reloadPresets()
  }, [palette.open, reloadPresets])

  // The prompt list, reloaded whenever the palette opens — and whenever the
  // panel it captured changes, because a project's prompts are its own
  // directory's and two panels are rarely in the same one.
  const [promptRows, setPromptRows] = useState<PromptRow[]>(EMPTY_PROMPTS)
  // Bodies are deliberately NOT in the row type the palette renders:
  // buildCommands has no use for a paragraph, and putting one in a list row's
  // props means re-rendering the whole list whenever a prompt file changes.
  const promptBodiesRef = useRef(new Map<string, string>())
  const reloadPrompts = useCallback((capturedId: string | null) => {
    const panel = capturedId ? panelsRef.current.find((p) => p.rect.id === capturedId) : undefined
    // The panel's SPAWN directory, which is what spec.cwd is. Wherever the
    // user has since cd'd to is only knowable from the pid, and that is
    // explicitly out of this milestone — so a panel that has wandered lists
    // the prompts of where it started, not of where it is.
    void window.canvas.prompt.list(panel?.spec.cwd ?? null).then((rows) => {
      promptBodiesRef.current = new Map(rows.map((r) => [r.id, r.body]))
      setPromptRows(rows.map(({ id, name, source }) => ({ id, name, source })))
    })
  }, [])
  useEffect(() => {
    if (palette.open) reloadPrompts(palette.capturedId)
  }, [palette.open, palette.capturedId, reloadPrompts])

  // Palette actions. Everything the palette can do that needs the registry,
  // the camera, or IPC lives here — buildCommands takes callbacks precisely so
  // none of that reaches the pure layer.
  const paletteActions = useMemo<PaletteActions>(() => ({
    spawnPreset: (id) => {
      const row = presetRows.find((p) => p.id === id)
      // buildCommands already disables an unavailable row, so this is the
      // second half of the same rule rather than the only one: a stale list —
      // the palette was open while the store changed — must not spawn a panel
      // that dies instantly with "command not found".
      if (!row || !row.available) return
      // Routed through the SAME main-side path the menu uses, so a palette
      // spawn and a menu spawn cannot drift: main resolves the template
      // (absent command included) and sends PRESET_SPAWN back, which Canvas
      // already handles through onSpawn — which is what gives it the ordinary
      // undo behaviour, where removing a panel disposes its session.
      void window.canvas.preset.spawnById(id)
    },
    beginRenamePreset: (id, currentName) => {
      setInputMode({
        label: `Rename \u201c${currentName}\u201d to\u2026`,
        initial: currentName,
        submit: (value) => {
          void window.canvas.preset.rename(id, value).then(() => {
            setInputMode(null)
            reloadPresets()
          })
        }
      })
      // Palette.tsx closes the overlay BEFORE running a row's command, so
      // without this the mode would be set on a palette that is already gone
      // — and the effect above would immediately clear it again. Reopening in
      // the same batch is what turns "run the rename command" into "the
      // palette is now a text field", which is the whole point of input mode.
      palette.openPalette()
    },
    deletePreset: (id) => {
      void window.canvas.preset.remove(id).then(reloadPresets)
    },
    setDefaultPreset: (id) => {
      // No local bookkeeping: main answers by pushing PRESET_DEFAULT, which
      // the existing subscription writes into defaultTemplateRef. One source
      // of truth for what Cmd+N spawns, and it is main's.
      void window.canvas.preset.setDefault(id).then(reloadPresets)
    },
    goToPanel: (id) => {
      const panel = panelsRef.current.find((p) => p.rect.id === id)
      if (!panel) return
      centreOn(panel.rect)
      // Selection WITHOUT the wake. onSelectPanel is the click path and it
      // deliberately wakes (a card's whole affordance is "click to start");
      // navigating is not interacting, so the switcher leaves dormancy alone.
      // verify:panels 39.
      //
      // It DOES raise, though, and deliberately: the selection ring is the
      // only feedback this command gives, and a framed panel that happens to
      // sit under an overlapping one shows none of it — the camera moves and
      // nothing visibly happens. Raising is a z change and nothing else, so it
      // costs none of what the no-wake rule is protecting.
      selectAndRaise(id)
    },
    insertPrompt: (id) => {
      // The panel the palette CAPTURED, not the focused one: opening the
      // palette moves DOM focus to its input, and a background click clears
      // focusedId outright.
      const target = palette.capturedId
      const body = promptBodiesRef.current.get(id)
      // A row whose body the last reload did not carry is a list that moved
      // under the user (the file was deleted while the palette was open).
      // Inserting nothing is the only honest answer; inserting the wrong
      // prompt into a running agent is not.
      if (!target || body === undefined) return
      // paste(), NEVER write(). session-factory.ts spells out the failure it
      // exists to prevent: term.paste wraps the payload in bracketed-paste
      // markers when the app has enabled them (and normalises LF to CR), so a
      // multi-line prompt arrives as ONE input. A raw write submits every
      // newline separately — pasting a five-line prompt into `claude` fires
      // off four incomplete fragments and then the tail. EVERY prompt is
      // multi-line, so every use of this feature depends on this call.
      // verify:panels 40 is the check that can tell the two apart.
      registry.get(target)?.handle.paste(body)
    },
    beginSavePrompt: () => {
      const target = palette.capturedId
      // The current SELECTION, the same call that backs Cmd+C. A deliberate
      // gesture and nothing else: capturing automatically would mean
      // retaining everything the user ever types, credentials included.
      const selection = target ? (registry.get(target)?.handle.getSelection() ?? '') : ''
      // buildCommands already disables the row without a selection; this is
      // the second half of the same rule, against a list that went stale
      // while the palette was open.
      if (!selection) return
      setInputMode({
        label: 'Name this prompt\u2026',
        initial: '',
        submit: (name) => {
          void window.canvas.prompt.save(name, selection).then(() => setInputMode(null))
        }
      })
      // Palette.tsx closes the overlay BEFORE running a row's command, so
      // without this the mode would be set on a palette that is already gone
      // and the clear-on-close effect would wipe it again — the same pairing
      // beginRenamePreset makes, for the same reason.
      palette.openPalette()
    },
    deletePrompt: (id) => {
      // Reloaded rather than filtered locally: main is the only side that
      // knows what the store now says, and a project prompt refuses deletion
      // there (the row is disabled, but a stale list could still reach here).
      void window.canvas.prompt.remove(id).then(() => reloadPrompts(palette.capturedId))
    },
    resetCanvas: () => {
      // Main owns the confirmation dialog and the counts request. The palette
      // asks for the flow the menu item already runs rather than growing a
      // second one that could drift from it. FIRE-AND-FORGET: main returns
      // before the user answers the dialog, so this promise resolving says
      // nothing about whether a reset happened and nothing here may act on it.
      void window.canvas.canvas.requestReset()
    },
    // Cmd+0's INITIAL, which is the only camera reset useViewport exposes.
    zoomToFit: () => resetViewport()
  }), [resetViewport, centreOn, selectAndRaise, presetRows, reloadPresets, palette.openPalette,
       palette.capturedId, reloadPrompts])

  // Keyed on palette.open and read out of panelsRef, NOT on `panels`. `panels`
  // is a fresh array on every setPanelRect, i.e. every frame of a drag — and
  // this array flows into Palette.tsx's `commands` memo, whose [rows] effect
  // re-seats the selected row. Tracking it would re-seat the palette's
  // selection at 60Hz behind a drag, the same silent-selection-move defect
  // "resetViewport must stay a useCallback" documents one file over. The list
  // is only ever looked at while the overlay is up, and the commands that add
  // or remove a panel close it first, so recomputing at open is enough.
  const panelRows = useMemo<PanelRow[]>(
    () => (palette.open ? panelsRef.current.map((p) => ({ id: p.rect.id, label: panelLabel(p) })) : EMPTY_PANELS),
    [palette.open]
  )

  // Cheap, and read once per render of the palette: getSelection() is a string
  // copy out of xterm's buffer, not a repaint.
  const hasSelection = (): boolean => {
    const id = palette.capturedId
    return id !== null && (registry.get(id)?.handle.getSelection() ?? '') !== ''
  }

  return (
    <div
      className="canvas"
      ref={hostRef}
      onMouseDownCapture={onMouseDownCapture}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
    >
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
      <CanvasHud viewport={viewport} cursor={cursor} selectedId={selectedId} backend={backendInfo} />
      {palette.open && (
        <Palette
          controller={palette}
          actions={paletteActions}
          presets={presetRows}
          prompts={promptRows}
          panels={panelRows}
          hasSelection={hasSelection()}
          inputMode={inputMode}
        />
      )}
    </div>
  )
}
