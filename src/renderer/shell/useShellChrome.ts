import { useCallback, useEffect, useState } from 'react'
import type { ShellBreakpoint } from './useShellBreakpoint'

export type NavigatorPane = 'panels' | 'workspaces' | 'files' | 'vault' | 'integrations' | 'teammates'
export type ContextTab = 'detail' | 'work' | 'tools'

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
  contextTab: ContextTab
  /** The dock's verb: show this pane (and open the navigator), or collapse it if it is the active one. */
  chooseNavigator: (pane: NavigatorPane) => void
  toggleNavigator: () => void
  toggleContext: () => void
  toggleTree: () => void
  toggleAttention: () => void
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
 */
export function useShellChrome(deps: {
  paletteIsOpen: () => boolean
  /** Change signal, compared by identity; see the note above. */
  settingsSignal: unknown
  bp: ShellBreakpoint
}): ShellChrome {
  const { paletteIsOpen, settingsSignal, bp } = deps
  // null = absent from the map: the breakpoint decides.
  const [railPref, setRailPref] = useState<boolean | null>(null)
  const [ctxPref, setCtxPref] = useState<boolean | null>(null)
  const [treeOpen, setTreeOpen] = useState(false)
  const [navigatorPref, setNavigatorPref] = useState<Exclude<NavigatorPane, 'files'>>('panels')
  const [contextTab, setContextTabState] = useState<ContextTab>('detail')
  const [navDrawer, setNavDrawer] = useState(false)
  const [ctxDrawer, setCtxDrawer] = useState(false)
  const [attentionOpen, setAttentionOpen] = useState(false)

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
        if (rail) setRailPref(rail.persisted ? rail.value === true : null)
        if (ctx) setCtxPref(ctx.persisted ? ctx.value === true : null)
        if (tree) setTreeOpen(tree.value === true)
        // M85. A value from a LATER version of this app falls back to panels
        // rather than leaving the navigator on a pane that does not exist.
        if (nav) setNavigatorPref(nav.value === 'workspaces' || nav.value === 'vault' || nav.value === 'integrations' || nav.value === 'teammates' ? nav.value : 'panels')
        if (tab) setContextTabState(tab.value === 'work' || tab.value === 'tools' ? tab.value : 'detail')
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

  // The breakpoint rule, in one place.
  const railOpen = railPref ?? true
  const inspectorOpen = ctxPref ?? (bp === 'wide')
  const navVisible = bp === 'compact' ? navDrawer : railOpen
  const ctxVisible = bp === 'compact' ? ctxDrawer : inspectorOpen
  const navigator: NavigatorPane = treeOpen ? 'files' : navigatorPref

  const write = (id: string, value: boolean | string): void => {
    void window.canvas.settings.set(id, value)
  }

  // The IPC write is deliberately OUTSIDE any setState updater: an updater
  // must be pure, and under StrictMode it runs twice.
  const toggleNavigator = useCallback(() => {
    if (bp === 'compact') { setNavDrawer((d) => !d); setCtxDrawer(false); setAttentionOpen(false); return }
    const next = !railOpen
    setRailPref(next)
    write('shell.railOpen', next)
  }, [bp, railOpen])

  const toggleContext = useCallback(() => {
    if (bp === 'compact') { setCtxDrawer((d) => !d); setNavDrawer(false); setAttentionOpen(false); return }
    // Present means the user won: the toggle is how a pane becomes present,
    // in either direction, at Standard and Wide alike.
    const next = !inspectorOpen
    setCtxPref(next)
    write('shell.inspectorOpen', next)
  }, [bp, inspectorOpen])

  const chooseNavigator = useCallback((pane: NavigatorPane) => {
    const showing = navVisible && navigator === pane
    if (showing) { toggleNavigator(); return }
    if (pane === 'files') {
      setTreeOpen(true); write('files.treeOpen', true)
    } else {
      if (treeOpen) { setTreeOpen(false); write('files.treeOpen', false) }
      if (navigatorPref !== pane) { setNavigatorPref(pane); write('shell.navigator', pane) }
    }
    if (!navVisible) {
      if (bp === 'compact') { setNavDrawer(true); setCtxDrawer(false); setAttentionOpen(false) }
      else { setRailPref(true); write('shell.railOpen', true) }
    }
  }, [bp, navVisible, navigator, treeOpen, navigatorPref, toggleNavigator])

  const toggleTree = useCallback(() => {
    if (treeOpen) {
      setTreeOpen(false); write('files.treeOpen', false)
    } else {
      chooseNavigator('files')
    }
  }, [treeOpen, chooseNavigator])

  const toggleAttention = useCallback(() => {
    setAttentionOpen((o) => !o)
  }, [])

  const setContextTab = useCallback((tab: ContextTab) => {
    setContextTabState(tab)
    write('shell.contextTab', tab)
  }, [])

  const dismissTransient = useCallback(() => {
    setNavDrawer(false); setCtxDrawer(false); setAttentionOpen(false)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // Escape closes a transient surface — the palette's own rule, on a
      // second and third surface. Only when one is up, so a bare Escape still
      // reaches the agent every other time.
      if (event.key === 'Escape' && (navDrawer || ctxDrawer || attentionOpen)) {
        if (paletteIsOpen()) return
        event.preventDefault()
        dismissTransient()
        return
      }
      // Cmd, and only Cmd — the same gate every canvas shortcut obeys so that
      // a bare keystroke always reaches the PTY.
      if (!event.metaKey || event.ctrlKey || event.altKey) return
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
  }, [paletteIsOpen, toggleNavigator, toggleContext, toggleTree, dismissTransient, navDrawer, ctxDrawer, attentionOpen])

  return {
    bp, navigator, navVisible, ctxVisible, navDrawer, ctxDrawer, attentionOpen, contextTab,
    chooseNavigator, toggleNavigator, toggleContext, toggleTree, toggleAttention, setContextTab, dismissTransient,
    railOpen: navVisible, inspectorOpen: ctxVisible, treeOpen,
    toggleRail: toggleNavigator, toggleInspector: toggleContext
  }
}
