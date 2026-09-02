import { useEffect } from 'react'
import type { MutableRefObject, RefObject } from 'react'
import type { Viewport, WorldRect } from './viewport'
import { nearestInDirection, orderPanels, type Direction } from './spatial-order'

/**
 * M44 — a keyboard-first canvas. Every shortcut is Cmd-gated because agent
 * TUIs claim every bare key (Tab is autocomplete, Escape interrupts). This
 * hook adds the three that were missing:
 *
 *  - Cmd+Arrow moves the SELECTION to the nearest panel in that direction —
 *    through `goToPanel` (frames and raises, NEVER wakes), because arrowing
 *    across a restored canvas with focus attached would spawn a PTY per step
 *    and blow the live budget. Traversal highlights; a second key focuses.
 *  - Cmd+Enter focuses AND wakes the selection (the click path).
 *  - Cmd+Escape is the one chord OUT of a terminal: it blurs xterm's hidden
 *    textarea, releases app focus, and moves DOM focus to the canvas host so
 *    Tab from there walks the chrome. Escape alone stays the agent's.
 *
 * M28's hook shape: one Deps object, destructured on entry, the destructured
 * members named in the dependency array. Mutable reads go through refs so the
 * listener installs once and never goes stale.
 */
export interface KeyboardNavDeps {
  shouldIgnoreKeys: () => boolean
  rectsRef: RefObject<WorldRect[]>
  selectedIdRef: RefObject<string | null>
  focusedIdRef: RefObject<string | null>
  viewportRef: RefObject<Viewport>
  lastFocusedAtRef: MutableRefObject<Record<string, number>>
  hostRef: RefObject<HTMLDivElement | null>
  /** goToPanel: frame + raise + select, never wake (the switcher's verb). */
  goToPanel: (id: string) => void
  /** onFocusPanel: the click path — clears dormancy, spawns, focuses. */
  focusPanel: (id: string) => void
  /** setFocusedId(null): the background-click release. */
  releaseFocus: () => void
}

const ARROWS: Record<string, Direction> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down'
}

export function useKeyboardNav(deps: KeyboardNavDeps): void {
  const {
    shouldIgnoreKeys, rectsRef, selectedIdRef, focusedIdRef, viewportRef,
    lastFocusedAtRef, hostRef, goToPanel, focusPanel, releaseFocus
  } = deps

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
      const dir = ARROWS[event.code]
      const isEnter = event.code === 'Enter'
      const isEscape = event.code === 'Escape'
      if (!dir && !isEnter && !isEscape) return
      if (shouldIgnoreKeys()) return
      event.preventDefault()
      if (event.repeat) return

      if (dir) {
        const rects = rectsRef.current ?? []
        const from = selectedIdRef.current ?? focusedIdRef.current
        if (from === null) {
          // Nothing selected: the first arrow selects the panel nearest the
          // camera's centre (orderPanels' first entry), rather than doing
          // nothing — the way in for a user who has never clicked.
          const nearest = orderPanels(rects, viewportRef.current!, { w: window.innerWidth, h: window.innerHeight }, lastFocusedAtRef.current)[0]
          if (nearest !== undefined) goToPanel(nearest)
          return
        }
        const target = nearestInDirection(rects, from, dir)
        if (target !== null) goToPanel(target)
        return
      }

      if (isEnter) {
        // The deliberate second key: focus AND wake the selection.
        const id = selectedIdRef.current
        if (id !== null) focusPanel(id)
        return
      }

      // Cmd+Escape: out of the terminal. Blur xterm's hidden textarea if it
      // holds focus, release app focus (the panel may now demote, exactly as
      // after a background click), and move DOM focus to the host so Tab walks
      // the chrome.
      const active = document.activeElement as HTMLElement | null
      if (active && typeof active.blur === 'function') active.blur()
      releaseFocus()
      hostRef.current?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [shouldIgnoreKeys, rectsRef, selectedIdRef, focusedIdRef, viewportRef, lastFocusedAtRef, hostRef, goToPanel, focusPanel, releaseFocus])
}
