import { useCallback, useEffect, useRef, useState } from 'react'
import { DOCK_ORDER, type NavPaneId } from './nav-dock'

export interface ShellChrome {
  /** Which navigator pane is open, or null for none. */
  navigatorPane: NavPaneId | null
  /** Selecting the ACTIVE pane collapses it — one control, two directions. */
  selectPane: (id: NavPaneId) => void
  /** Open the last-used pane, or close whichever is open. */
  toggleNavigator: () => void
  /** The PERSISTED preference: does the user want a context pane at all. At a
   *  width that gives it a real column, this is what fills it. */
  contextOpen: boolean
  /**
   * The EPHEMERAL one: is the context DRAWER showing right now.
   *
   * Separate from `contextOpen` and deliberately not persisted, because a
   * drawer that survived a launch would not be a drawer. At a width with no
   * column for it, the context pane floats OVER the canvas — and a floating
   * pane that is open by default is a RESIDENT overlay, which puts panels
   * permanently under chrome and makes every world coordinate the canvas
   * computes a lie. That is the one thing insetting exists to avoid, so the
   * drawer starts closed and only a deliberate gesture opens it.
   */
  contextDrawerOpen: boolean
  /** The navigator's own half of the same split, for the same reason. */
  navDrawerOpen: boolean
  toggleContext: () => void
  /**
   * Which pane is VISIBLE right now, which is not the same question as which
   * pane is selected: at a width where the navigator floats, a selected pane
   * with its drawer shut is showing nothing at all. The dock's pressed state
   * reads this rather than `navigatorPane`, or a fresh launch at Compact
   * would mark a pane active with no pane on screen.
   */
  visiblePane: NavPaneId | null
  /** Shut every transient drawer. The outside-click and Escape exits. */
  dismissDrawers: () => void
  /**
   * Is the context pane SHOWING — the same question `visiblePane` answers for
   * the navigator, and the two are asked for the same reason. A pane with no
   * column whose drawer is shut is showing nothing, and must be hidden rather
   * than merely narrow: rendered into a zero-width grid cell its children
   * overflow the frame, and their rects then report coordinates OUTSIDE the
   * window entirely (measured at x=1421 in a 1400px window), which every
   * check and every real click that resolves an element's centre then aims
   * at. Nothing throws; the clicks simply land nowhere.
   */
  contextVisible: boolean
}

/** The pane a fresh `toggleNavigator` opens, and the schema's own default.
 *  Panels rather than Workspaces because it is what the rail this replaces
 *  showed most of, and because a canvas with one workspace has a Workspaces
 *  pane with one row in it. */
const DEFAULT_PANE: NavPaneId = 'panels'

function asPane(value: unknown): NavPaneId | null {
  // 'none' is a legitimate stored value meaning "closed", and every other
  // string is checked against DOCK_ORDER rather than trusted: parsePreferences
  // guards the load door and setPreference guards the write door, but this is
  // a THIRD reader, and a value that reached here from a build that knew a
  // fifth pane must render as closed rather than as a pane this build cannot
  // draw.
  if (typeof value !== 'string' || value === 'none') return null
  return (DOCK_ORDER as readonly string[]).includes(value) ? (value as NavPaneId) : null
}

/**
 * Navigator and context visibility, persisted through main's settings store.
 *
 * Read at mount AND on every change to main's setting rows, and written
 * through settings:set — never held only in React state. The preferences map
 * is already the one place a user toggle lives ("One map, and a typed view
 * over it"), and a second store for these would be exactly the drift that
 * entry exists to prevent.
 *
 * `settingsSignal` is what closes the last hop of that rule. Both settings are
 * ordinary `SettingDef`s, so main's `settings:list` auto-generates a runnable
 * palette row for each of them — nobody wrote those rows and nobody wired them
 * to this hook. Running one writes to main's store and reloads `settingRows`;
 * without a dependency on that reload, the store changes and the frame does
 * not, so the row's own title reads the opposite of what is on screen until
 * the next launch. The value is used for its IDENTITY only — the list is
 * re-read from main rather than picked out of the passed rows, exactly as
 * `glowEnabled`/`pipsEnabled` do in `Canvas.tsx`, because `settingRows` is
 * empty until the palette has been opened and the frame has to be right on the
 * first paint. `verify:panels` 79 is the check.
 *
 * NOTHING IS WRITTEN AT MOUNT. The preferences map is sparse on purpose — an
 * absent id means "still at the schema default" — and writing a value here
 * would make every user explicit on their first launch, which is what would
 * destroy the adaptive residency this milestone runs on.
 */
export function useShellChrome(deps: {
  paletteIsOpen: () => boolean
  /** Change signal, compared by identity; see the note above. */
  settingsSignal: unknown
}): ShellChrome {
  const { paletteIsOpen, settingsSignal } = deps
  // Matches the schema defaults, so the first paint is right before the
  // settings read below resolves.
  const [navigatorPane, setNavigatorPane] = useState<NavPaneId | null>(DEFAULT_PANE)
  const [contextOpen, setContextOpen] = useState(true)
  // Never seeded from the store: see the interface note. A drawer is a
  // gesture, not a setting.
  const [contextDrawerOpen, setContextDrawerOpen] = useState(false)
  const [navDrawerOpen, setNavDrawerOpen] = useState(false)

  /**
   * WHETHER EACH PANE HAS A REAL COLUMN AT THIS WIDTH — read from CSS, never
   * decided here.
   *
   * This hook needs the answer and cannot derive it: a dock button on the
   * ACTIVE pane means "collapse the column" where the column is real and
   * "close the drawer" where it is not, and those are different pieces of
   * state — one persisted, one not. Without the distinction one breakpoint
   * always gets a DEAD FIRST CLICK, because the toggle keys off whichever
   * piece is not the visible one. That was measured, not reasoned about: with
   * the toggle keyed on `navigatorPane` alone, a fresh launch at Compact has
   * the pane selected and the drawer shut, so the first press CLOSES
   * something already invisible.
   *
   * It is a READ of a custom property the container queries set, rather than
   * a matchMedia or a width comparison, so CSS remains the single author of
   * the breakpoint. A second copy of `1100px` in TypeScript is the drift that
   * shows up the day somebody edits one of them.
   *
   * The ResizeObserver bails when nothing CHANGED, which is what keeps a
   * window-resize drag from re-rendering the whole shell at the pointer's
   * rate: the value only moves at a breakpoint, so the common frame returns
   * the previous object identity untouched.
   */
  const [residency, setResidency] = useState({ nav: true, context: true })
  useEffect(() => {
    const el = document.querySelector('.shell')
    if (!(el instanceof HTMLElement)) return
    const read = (): void => {
      const cs = getComputedStyle(el)
      const nav = cs.getPropertyValue('--shell-nav-resident').trim() === '1'
      const context = cs.getPropertyValue('--shell-context-resident').trim() === '1'
      setResidency((prev) =>
        prev.nav === nav && prev.context === context ? prev : { nav, context })
    }
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // The pane toggleNavigator reopens. A REF and not state: nothing renders it,
  // so making it state would re-render the whole shell every time a pane
  // changed in order to store a value only a callback reads.
  const lastPaneRef = useRef<NavPaneId>(DEFAULT_PANE)

  useEffect(() => {
    void window.canvas.settings.list().then((rows) => {
      const nav = rows.find((r) => r.id === 'shell.navigatorPane')
      const context = rows.find((r) => r.id === 'shell.contextOpen')
      if (nav) {
        const pane = asPane(nav.value)
        setNavigatorPane(pane)
        // Only a REAL pane seeds the reopen target. A stored 'none' means the
        // user closed the navigator, not that they want it reopened onto
        // nothing — so the ref keeps whatever it had.
        if (pane !== null) lastPaneRef.current = pane
      }
      if (context) setContextOpen(context.value === true)
    })
  }, [settingsSignal])

  // The IPC write is deliberately OUTSIDE the setState updater. A React state
  // updater must be pure — under StrictMode it is invoked twice, and a side
  // effect inside it fires twice too, which is the same hazard Canvas.tsx's
  // `commitHistory` comment flags. main.tsx omits StrictMode today, so the
  // updater form was not actually broken; it was one `<StrictMode>` away from
  // writing every toggle to the store twice. Reading state from the closure
  // costs these callbacks their stable identity, which is fine: their only
  // consumers are the keydown effect below (which already depends on them) and
  // a button's onClick.
  const selectPane = useCallback((id: NavPaneId) => {
    // Selecting the ACTIVE pane collapses it. One control, two directions —
    // the same toggle the dock button's aria-pressed already describes — and
    // it means a user who opened a pane can close it without hunting for a
    // second affordance. WHICH piece of state that collapses is the thing
    // residency decides; see its own note above for the dead-click this
    // branch exists to prevent.
    if (residency.nav) {
      const next = navigatorPane === id ? null : id
      setNavigatorPane(next)
      if (next !== null) lastPaneRef.current = next
      void window.canvas.settings.set('shell.navigatorPane', next ?? 'none')
      return
    }
    // Floating. Closing the drawer must NOT persist 'none': the user is
    // dismissing an overlay at this width, not saying they want no navigator
    // at a width that has a column for one — and a launch is far more likely
    // to be at the wider size than the narrower.
    if (navDrawerOpen && navigatorPane === id) {
      setNavDrawerOpen(false)
      return
    }
    // WHICH pane, on the other hand, is a real preference and is persisted
    // from either breakpoint.
    setNavigatorPane(id)
    lastPaneRef.current = id
    setNavDrawerOpen(true)
    void window.canvas.settings.set('shell.navigatorPane', id)
  }, [navigatorPane, navDrawerOpen, residency.nav])

  const toggleNavigator = useCallback(() => {
    if (residency.nav) {
      const next = navigatorPane === null ? lastPaneRef.current : null
      setNavigatorPane(next)
      void window.canvas.settings.set('shell.navigatorPane', next ?? 'none')
      return
    }
    if (navDrawerOpen) { setNavDrawerOpen(false); return }
    // Opening a drawer onto NO pane would be an empty overlay, so a navigator
    // the user had closed reopens on its last one — the same fallback the
    // resident branch above makes through lastPaneRef.
    if (navigatorPane === null) {
      setNavigatorPane(lastPaneRef.current)
      void window.canvas.settings.set('shell.navigatorPane', lastPaneRef.current)
    }
    setNavDrawerOpen(true)
  }, [navigatorPane, navDrawerOpen, residency.nav])

  const toggleContext = useCallback(() => {
    // Whichever piece of state is the visible one at this width, and ONLY
    // that piece. Writing both — which is what this did before residency was
    // readable — means a drawer dismissal at Standard also persists "I do not
    // want a context pane", silently changing what the user sees the next
    // time they open the app on a wider display.
    if (residency.context) {
      const next = !contextOpen
      setContextOpen(next)
      void window.canvas.settings.set('shell.contextOpen', next)
      return
    }
    setContextDrawerOpen((prev) => !prev)
  }, [contextOpen, residency.context])

  // One verb for both, because the two exits that own it — an outside click
  // and Escape — are about TRANSIENT SURFACES rather than about either pane.
  const dismissDrawers = useCallback(() => {
    setNavDrawerOpen(false)
    setContextDrawerOpen(false)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // Cmd, and only Cmd — the same gate every canvas shortcut obeys so that
      // a bare keystroke always reaches the PTY.
      if (!event.metaKey || event.ctrlKey || event.altKey) return
      // Cmd+B. Free — Cmd+0/1/=/+/-/n/j are useViewport's, Cmd+K is the
      // palette's, Cmd+G is the nav grid's, Cmd+\ and Cmd+Shift+\ are the two
      // below, and Cmd+Z/C/V are menu accelerators — and it is the chord a
      // user already has muscle memory for as "toggle the file sidebar".
      if (event.code === 'KeyB') {
        if (paletteIsOpen()) return
        // preventDefault BEFORE the repeat bail, like the branch below: this
        // rejects a chord that IS ours and we are declining to act on, so the
        // tail of a held Cmd+B must still be swallowed rather than leaking to
        // the focused agent's PTY.
        event.preventDefault()
        // For a toggle the repeat stream is NEVER the feature: held, it would
        // flicker the column at the OS repeat rate and leave it open or closed
        // depending on whether the user released on an odd or an even repeat —
        // the Cmd+K defect exactly. Not in REPEATABLE_KEYS and not a candidate
        // for it.
        if (event.repeat) return
        selectPane('files')
        return
      }
      // event.code, not event.key: with Shift held macOS reports key '|', so
      // a key check would silently miss the context pane's chord.
      if (event.code !== 'Backslash') return
      // Canvas shortcuts stand down while the palette is open — rule 3 of
      // "who owns the keyboard". isOpen reads a ref, so this listener is not
      // torn down and rebuilt on every open and close.
      if (paletteIsOpen()) return
      // preventDefault BEFORE the repeat bail, unlike the modifier checks
      // above: those reject a chord that is not ours, while this one rejects
      // a chord that IS ours and we are declining to act on, so the tail of a
      // held Cmd+\ must still be swallowed rather than leaking to the focused
      // agent's PTY.
      event.preventDefault()
      // A held toggle would flicker the region at the OS repeat rate and leave
      // it open or closed depending on whether the user released on an odd or
      // an even repeat — the Cmd+K defect exactly.
      if (event.repeat) return
      // The MAPPING is inherited, not chosen: Cmd+\ moved the left region and
      // Cmd+Shift+\ the right one, so each chord keeps the region it had, now
      // pointing at that region's successor. The plan said Cmd+\ should reach
      // the CONTEXT pane, which contradicts its own stated reason for keeping
      // these chords at all — existing muscle memory — so the reason wins.
      if (event.shiftKey) toggleContext()
      else toggleNavigator()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [paletteIsOpen, toggleNavigator, toggleContext, selectPane])

  /**
   * ESCAPE dismisses a transient drawer — the second of the two exits a
   * drawer owes, beside the outside click Canvas owns.
   *
   * The listener exists ONLY WHILE a drawer is open, which is what keeps the
   * app's standing rule intact: a bare keystroke always reaches the PTY, and
   * this exception lasts exactly as long as the overlay it belongs to is on
   * screen saying so. The same shape useLinkMode already uses for its own
   * armed-only Escape, and for the same reason.
   *
   * stopPropagation, because Escape is a very meaningful key to an agent and
   * one that dismissed a drawer must not ALSO reach the terminal underneath —
   * a single press doing two unrelated things is the worst outcome available
   * here. Capture phase so it runs before the panel-level handlers that
   * stopPropagation their own events.
   *
   * The palette is checked first and left alone: it is a transient surface
   * too, it owns its own Escape, and it renders ABOVE the drawers — so the
   * topmost surface answers, which is the order the user sees.
   */
  useEffect(() => {
    if (!navDrawerOpen && !contextDrawerOpen) return
    const onEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      if (paletteIsOpen()) return
      event.preventDefault()
      event.stopPropagation()
      dismissDrawers()
    }
    window.addEventListener('keydown', onEscape, true)
    return () => window.removeEventListener('keydown', onEscape, true)
  }, [navDrawerOpen, contextDrawerOpen, paletteIsOpen, dismissDrawers])

  // A pane the user selected but whose drawer is shut is showing nothing, so
  // "visible" and "selected" part company at exactly the width where the dock
  // is the only thing on screen. The dock reads this.
  const visiblePane = residency.nav
    ? navigatorPane
    : (navDrawerOpen ? navigatorPane : null)
  const contextVisible = residency.context ? contextOpen : contextDrawerOpen

  return {
    navigatorPane, selectPane, toggleNavigator,
    contextOpen, contextDrawerOpen, navDrawerOpen, toggleContext,
    visiblePane, contextVisible, dismissDrawers
  }
}
