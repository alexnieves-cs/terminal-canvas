import { useCallback, useEffect, useRef, useState } from 'react'
import { focusLocked } from '@shared/shortcuts'
import type { ShellBreakpoint } from './useShellBreakpoint'

export type NavigatorPane = 'panels' | 'workspaces' | 'files' | 'vault' | 'integrations' | 'teammates' | 'board' | 'skills'
/** M279: `activity` — what the object has done, from the feed. */
export type ContextTab = 'detail' | 'work' | 'tools' | 'activity'
/**
 * M268. Which page fills the center column. The canvas host stays mounted either way.
 * M324. `focus` — one task's focus view. Never persisted: it names a task, and
 * a relaunch into a page about a task the person did not just choose would be
 * a place they did not ask to be. Every "is the canvas covered" test reads
 * `!== 'canvas'`, so a third page is covered the way Orchestrate is.
 */
export type CenterView = 'canvas' | 'orchestration' | 'focus' | 'team' | 'sessions' | 'review'

export interface ShellChrome {
  /** The breakpoint the shell measured for itself; stamped as `data-bp`. */
  bp: ShellBreakpoint
  /** Which pane the navigator shows when it is showing at all. */
  navigator: NavigatorPane
  /** The navigator is on screen — as a column, or (Compact) as a drawer. */
  navVisible: boolean
  /** The context pane is on screen — as a column, or (Compact) as a drawer. */
  ctxVisible: boolean
  /** A transient drawer is up (Compact only). Composed into shouldIgnoreKeys. */
  navDrawer: boolean
  ctxDrawer: boolean
  /** The Attention popover is up. */
  attentionOpen: boolean
  /** #16. The request a shortcut opened the queue on; null when the bell opened it. */
  attentionFocus: string | null
  contextTab: ContextTab
  /** M268. Canvas vs Orchestration in the center column. */
  centerView: CenterView
  /** The dock's verb: show this pane (and open the navigator), or collapse it if it is the active one. */
  chooseNavigator: (pane: NavigatorPane) => void
  /** M268. Swap the center page; orchestration auto-hides rail/inspector without rewriting their prefs. */
  setCenterView: (view: CenterView) => void
  toggleNavigator: () => void
  toggleContext: () => void
  toggleTree: () => void
  toggleAttention: () => void
  /** #16. Open the queue with this request's detail expanded — the navigation every other indicator makes. */
  openAttentionAt: (requestId: string) => void
  setContextTab: (tab: ContextTab) => void
  /** Close every transient surface (drawers, the popover): Escape and the outside click. */
  dismissTransient: () => void
  // The M8a names, kept for the callers and checks that read them.
  railOpen: boolean
  inspectorOpen: boolean
  treeOpen: boolean
  toggleRail: () => void
  toggleInspector: () => void
}

/**
 * The shell's regions, persisted through main's settings store, and the
 * breakpoint rule that decides what a persisted value means at this width.
 *
 * Read at mount AND on every change to main's setting rows, and written
 * through settings:set — never held only in React state. The preferences map
 * is already the one place a user toggle lives ("One map, and a typed view
 * over it"), and a second store would be exactly the drift that entry exists
 * to prevent. `settingsSignal` re-reads on the palette's reload, and
 * `settings.onChanged` (M45) on a write made anywhere else.
 *
 * M46. THE PRESENCE RULE (spec §3.5). The map is sparse, so a region's
 * boolean has three states: absent, true, false. Absent means the BREAKPOINT
 * decides — the navigator is resident at Standard and Wide, the context pane
 * only at Wide — and present means the user won at every width. That is what
 * `SettingRow.persisted` carries across the bridge. It costs no schema change
 * and no tri-state: `shell.railOpen`/`shell.inspectorOpen` keep their ids and
 * their boolean type.
 *
 * Compact has no resident chrome. Both panes become DRAWERS there — transient
 * overlays dismissed by Escape and by an outside click, exactly as the
 * palette is — because a resident overlay would put panels permanently under
 * chrome and make every world coordinate the canvas reports a lie (§7.2).
 * The persisted booleans are simply not consulted at Compact.
 *
 * M268. Orchestration is a center PAGE, not a navigator pane. While it is
 * showing, the rail and inspector are forced closed for room — without
 * writing shell.railOpen / shell.inspectorOpen — so returning to the canvas
 * restores the user's prefs as they were.
 */
type LayoutStash = 'unset' | 'none' | 'rail' | 'inspector' | 'both'
const asStash = (v: unknown): LayoutStash =>
  v === 'none' || v === 'rail' || v === 'inspector' || v === 'both' ? v : 'unset'

export function useShellChrome(deps: {
  paletteIsOpen: () => boolean
  /** Change signal, compared by identity; see the note above. */
  settingsSignal: unknown
  bp: ShellBreakpoint
  /**
   * The startup splash is about to play. It is a canvas affordance — the
   * canvas host stays mounted behind Orchestration (M268) but is visually
   * covered by it — so a persisted `shell.centerView: 'orchestration'`
   * would restore straight over the splash and no one would ever see it.
   * Consulted ONLY on the very first settings read this hook ever makes
   * (see `bootRef` below); a later switch to Orchestration, by the user or
   * by settings, is never overridden, and the persisted value itself is
   * never rewritten — this is a one-time READ suppression, not a write.
   */
  suppressOrchestrationOnBoot?: boolean
  /**
   * The canvas has no objects yet (the launcher's own `panels.length === 0`
   * key). An ABSENT rail/inspector pref then resolves to closed, so the
   * first task is not framed by an empty navigator and an empty inspector.
   * A PRESENT pref still wins — the same rule as the breakpoint default —
   * so the Dock and ⌘\ open the rail exactly as before (the toggle writes
   * the pref), and the normal layout returns once the first object exists.
   */
  firstWorkspace?: boolean
}): ShellChrome {
  const { paletteIsOpen, settingsSignal, bp } = deps
  const firstWorkspace = deps.firstWorkspace === true
  const bootRef = useRef(deps.suppressOrchestrationOnBoot === true)
  // null = absent from the map: the breakpoint decides.
  const [railPref, setRailPref] = useState<boolean | null>(null)
  const [ctxPref, setCtxPref] = useState<boolean | null>(null)
  const [treeOpen, setTreeOpen] = useState(false)
  const [navigatorPref, setNavigatorPref] = useState<Exclude<NavigatorPane, 'files'>>('panels')
  const [contextTab, setContextTabState] = useState<ContextTab>('detail')
  const [centerView, setCenterViewState] = useState<CenterView>('canvas')
  const [navDrawer, setNavDrawer] = useState(false)
  const [ctxDrawer, setCtxDrawer] = useState(false)
  const [attentionOpen, setAttentionOpen] = useState(false)
  // The last arrangement each window class parked (see the class effect below).
  const stashRef = useRef<{ wide: LayoutStash; narrow: LayoutStash }>({ wide: 'unset', narrow: 'unset' })
  // Crossings are counted only once the stashes have been READ: the
  // breakpoint's first value is a placeholder ('standard') replaced by a
  // measurement a frame later, and that is not a person resizing a window —
  // on a wide screen it would re-park the narrow arrangement every launch.
  // The settings read is an IPC round trip, so it always lands after that.
  const [layoutLoaded, setLayoutLoaded] = useState(false)

  useEffect(() => {
    let live = true
    const read = (): void => {
      void window.canvas.settings.list().then((rows) => {
        if (!live) return
        const rail = rows.find((r) => r.id === 'shell.railOpen')
        const ctx = rows.find((r) => r.id === 'shell.inspectorOpen')
        const tree = rows.find((r) => r.id === 'files.treeOpen')
        const nav = rows.find((r) => r.id === 'shell.navigator')
        const tab = rows.find((r) => r.id === 'shell.contextTab')
        const center = rows.find((r) => r.id === 'shell.centerView')
        const wide = rows.find((r) => r.id === 'shell.layout.wide')
        const narrow = rows.find((r) => r.id === 'shell.layout.narrow')
        if (wide) stashRef.current.wide = asStash(wide.value)
        if (narrow) stashRef.current.narrow = asStash(narrow.value)
        setLayoutLoaded(true)
        if (rail) setRailPref(rail.persisted ? rail.value === true : null)
        if (ctx) setCtxPref(ctx.persisted ? ctx.value === true : null)
        if (tree) setTreeOpen(tree.value === true)
        // M85. A value from a LATER version of this app falls back to panels
        // rather than leaving the navigator on a pane that does not exist.
        if (nav) setNavigatorPref(nav.value === 'workspaces' || nav.value === 'vault' || nav.value === 'integrations' || nav.value === 'teammates' || nav.value === 'board' || nav.value === 'skills' ? nav.value : 'panels')
        if (tab) setContextTabState(tab.value === 'work' || tab.value === 'tools' || tab.value === 'activity' ? tab.value : 'detail')
        if (center) {
          const suppress = bootRef.current
          bootRef.current = false
          // M324. A settings re-read never pulls a person out of a focus view.
          // Sessions and Review are not in the settings enum yet (L-E). A stored
          // value of either is dropped by the store, so this branch is live
          // only after that enum grows. In memory, setCenterView still shows them.
          setCenterViewState((cur) => {
            if (cur === 'focus') return cur
            const value = center.value
            if (value === 'orchestration' && suppress) return 'canvas'
            if (value === 'orchestration' || value === 'sessions' || value === 'review') return value
            return 'canvas'
          })
        }
      })
    }
    read()
    const off = window.canvas.settings.onChanged(read)
    return () => { live = false; off() }
  }, [settingsSignal])

  // Drawers are transient by definition: leaving Compact closes them, so a
  // widened window never carries an overlay into a breakpoint with columns.
  useEffect(() => {
    if (bp !== 'compact') { setNavDrawer(false); setCtxDrawer(false) }
  }, [bp])

  // Wide and narrower windows are DIFFERENT layouts, and each keeps its own
  // arrangement: closing the inspector on a laptop screen must not close it
  // on the monitor. The two booleans stay the arrangement IN FORCE — every
  // reader and writer of them (the palette's rows, the harness, shot.cjs)
  // keeps its meaning inside one class — and this effect only acts on a
  // CROSSING: park the outgoing class's arrangement, restore the incoming
  // one's if it ever had one. What parks is what was ON SCREEN — an absent
  // pref resolves by the outgoing class's own default first. A class never
  // left inherits, since the store has no way to write an absence back. The
  // first workspace is left alone: its closed panes are a framing, not a choice.
  const wideClass = bp === 'wide'
  const prevClassRef = useRef<boolean | null>(null)
  const prefsRef = useRef({ railPref, ctxPref, firstWorkspace })
  prefsRef.current = { railPref, ctxPref, firstWorkspace }
  useEffect(() => {
    if (!layoutLoaded) return
    const prev = prevClassRef.current
    prevClassRef.current = wideClass
    if (prev === null || prev === wideClass) return
    const { railPref: rp, ctxPref: cp, firstWorkspace: first } = prefsRef.current
    if (first) return
    {
      // The same defaults as the breakpoint rule below, evaluated at `prev`.
      const r = rp ?? true
      const c = cp ?? prev
      const out: LayoutStash = r && c ? 'both' : r ? 'rail' : c ? 'inspector' : 'none'
      stashRef.current[prev ? 'wide' : 'narrow'] = out
      void window.canvas.settings.set(prev ? 'shell.layout.wide' : 'shell.layout.narrow', out)
    }
    const incoming = stashRef.current[wideClass ? 'wide' : 'narrow']
    if (incoming === 'unset') return
    const rail = incoming === 'both' || incoming === 'rail'
    const ctx = incoming === 'both' || incoming === 'inspector'
    setRailPref(rail); setCtxPref(ctx)
    void window.canvas.settings.set('shell.railOpen', rail)
    void window.canvas.settings.set('shell.inspectorOpen', ctx)
  }, [wideClass, layoutLoaded])

  // The breakpoint rule, in one place.
  const railOpen = railPref ?? !firstWorkspace
  const inspectorOpen = ctxPref ?? (!firstWorkspace && bp === 'wide')
  // M324. "A page covers the canvas" — Orchestrate or a task's focus view.
  const orchestration = centerView !== 'canvas'
  // M268. Orchestration takes the center full-bleed: hide rail/inspector for
  // room without rewriting their persisted prefs.
  const navVisible = orchestration ? false : (bp === 'compact' ? navDrawer : railOpen)
  const ctxVisible = orchestration ? false : (bp === 'compact' ? ctxDrawer : inspectorOpen)
  const navigator: NavigatorPane = treeOpen ? 'files' : navigatorPref

  const write = (id: string, value: boolean | string): void => {
    void window.canvas.settings.set(id, value)
  }

  const setCenterView = useCallback((view: CenterView) => {
    setCenterViewState(view)
    // Neither a task's focus view nor the Team view is persisted: both are
    // places a person goes to look, and a relaunch into observer mode would
    // attach to someone's workspace without being asked.
    if (view !== 'focus' && view !== 'team') write('shell.centerView', view)
    if (view !== 'canvas') {
      setNavDrawer(false)
      setCtxDrawer(false)
      setAttentionOpen(false)
    }
  }, [])

  // The IPC write is deliberately OUTSIDE any setState updater: an updater
  // must be pure, and under StrictMode it runs twice.
  const toggleNavigator = useCallback(() => {
    if (orchestration) { setCenterView('canvas'); return }
    if (bp === 'compact') { setNavDrawer((d) => !d); setCtxDrawer(false); setAttentionOpen(false); return }
    const next = !railOpen
    setRailPref(next)
    write('shell.railOpen', next)
  }, [bp, railOpen, orchestration, setCenterView])

  const toggleContext = useCallback(() => {
    if (orchestration) { setCenterView('canvas'); return }
    if (bp === 'compact') { setCtxDrawer((d) => !d); setNavDrawer(false); setAttentionOpen(false); return }
    // Present means the user won: the toggle is how a pane becomes present,
    // in either direction, at Standard and Wide alike.
    const next = !inspectorOpen
    setCtxPref(next)
    write('shell.inspectorOpen', next)
  }, [bp, inspectorOpen, orchestration, setCenterView])

  const chooseNavigator = useCallback((pane: NavigatorPane) => {
    // M268. Opening a navigator pane from Orchestration returns to the canvas
    // so the rail has somewhere to sit beside.
    if (orchestration) setCenterView('canvas')
    const showing = !orchestration && navVisible && navigator === pane
    if (showing) { toggleNavigator(); return }
    if (pane === 'files') {
      setTreeOpen(true); write('files.treeOpen', true)
    } else {
      if (treeOpen) { setTreeOpen(false); write('files.treeOpen', false) }
      if (navigatorPref !== pane) { setNavigatorPref(pane); write('shell.navigator', pane) }
    }
    if (orchestration || !navVisible) {
      if (bp === 'compact') { setNavDrawer(true); setCtxDrawer(false); setAttentionOpen(false) }
      else { setRailPref(true); write('shell.railOpen', true) }
    }
  }, [bp, navVisible, navigator, treeOpen, navigatorPref, toggleNavigator, orchestration, setCenterView])

  const toggleTree = useCallback(() => {
    if (treeOpen) {
      setTreeOpen(false); write('files.treeOpen', false)
    } else {
      chooseNavigator('files')
    }
  }, [treeOpen, chooseNavigator])

  const [attentionFocus, setAttentionFocus] = useState<string | null>(null)
  const toggleAttention = useCallback(() => {
    setAttentionOpen((o) => !o)
    setAttentionFocus(null)
  }, [])
  const openAttentionAt = useCallback((requestId: string) => {
    setAttentionFocus(requestId)
    setAttentionOpen(true)
    // The shortcut in a Compact drawer: the drawer and the popover are both
    // transient, and the popover is where the person was sent.
    setCtxDrawer(false)
  }, [])

  const setContextTab = useCallback((tab: ContextTab) => {
    setContextTabState(tab)
    write('shell.contextTab', tab)
  }, [])

  const dismissTransient = useCallback(() => {
    setNavDrawer(false); setCtxDrawer(false); setAttentionOpen(false)
  }, [])

  const centerRef = useRef(centerView)
  centerRef.current = centerView

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // Escape closes a transient surface — the palette's own rule, on a
      // second and third surface. Only when one is up, so a bare Escape still
      // reaches the agent every other time. Not a canvas chord, so a focus
      // lock does not yield it.
      if (event.key === 'Escape' && (navDrawer || ctxDrawer || attentionOpen)) {
        if (paletteIsOpen()) return
        event.preventDefault()
        dismissTransient()
        return
      }
      // Cmd, and only Cmd — the same gate every canvas shortcut obeys so that
      // a bare keystroke always reaches the PTY.
      if (!event.metaKey || event.ctrlKey || event.altKey) return
      // D4. A locked panel owns every canvas chord except ⌘⇧L (that one is
      // useKeyboardNav's). Returning here, before preventDefault, is the yield.
      if (focusLocked()) return
      // ⌘⇧S: Sessions, and back. Bound here because this hook owns the page.
      if (event.shiftKey && event.code === 'KeyS') {
        if (paletteIsOpen()) return
        event.preventDefault()
        if (event.repeat) return
        setCenterView(centerRef.current === 'sessions' ? 'canvas' : 'sessions')
        return
      }
      // Cmd+B: the Files pane. preventDefault BEFORE the repeat bail: this
      // rejects a chord that IS ours and we are declining to act on, so the
      // tail of a held Cmd+B must still be swallowed rather than leaking to
      // the focused agent's PTY.
      if (event.code === 'KeyB') {
        if (paletteIsOpen()) return
        event.preventDefault()
        // For a toggle the repeat stream is NEVER the feature — the Cmd+K
        // defect exactly. Not in REPEATABLE_KEYS and not a candidate for it.
        if (event.repeat) return
        toggleTree()
        return
      }
      // event.code, not event.key: with Shift held macOS reports key '|', so
      // a key check would silently miss the context pane's chord.
      if (event.code !== 'Backslash') return
      if (paletteIsOpen()) return
      event.preventDefault()
      if (event.repeat) return
      if (event.shiftKey) toggleContext()
      else toggleNavigator()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [paletteIsOpen, toggleNavigator, toggleContext, toggleTree, dismissTransient, navDrawer, ctxDrawer, attentionOpen, setCenterView])

  return {
    bp, navigator, navVisible, ctxVisible, navDrawer, ctxDrawer, attentionOpen, attentionFocus, contextTab, centerView,
    chooseNavigator, setCenterView, toggleNavigator, toggleContext, toggleTree, toggleAttention, openAttentionAt, setContextTab, dismissTransient,
    railOpen: navVisible, inspectorOpen: ctxVisible, treeOpen,
    toggleRail: toggleNavigator, toggleInspector: toggleContext
  }
}
