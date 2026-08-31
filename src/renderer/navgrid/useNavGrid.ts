import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { WorkspaceRow } from '@shared/ipc-contract'
import { buildGrid, initialCursor, stepCell, type GridCell } from './nav-grid'

/**
 * The held-modifier state machine behind Cmd+G (backlog #1, M11).
 *
 * This is the FIRST keyup/blur listener in this codebase — every other
 * keyboard path in the app is keydown-only — so "a key is still held" is new
 * state here, and it is new state whose failure mode is a modal nobody can
 * dismiss. That, not the grid, is the expensive part of this milestone.
 */

export interface NavGridController {
  open: boolean
  cells: GridCell[]
  cursor: number
  /**
   * Referentially STABLE, and reads a ref rather than state. Canvas composes
   * it into useViewport's shouldIgnoreKeys, which sits in a keydown effect's
   * dep array; an identity that changed on every open would tear that
   * listener down and reinstall it — the constraint usePalette.isOpen and
   * shouldYieldWheel both already record.
   */
  isOpen: () => boolean
  setCursor: (index: number) => void
}

export function useNavGrid(deps: {
  workspaces: readonly WorkspaceRow[]
  attentionIds: readonly string[]
  onCommit: (workspaceId: string) => void
  onMore: () => void
  /** False while another surface owns the keyboard (the palette). */
  enabled?: boolean
}): NavGridController {
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)

  const cells = useMemo(
    () => buildGrid(deps.workspaces, deps.attentionIds),
    [deps.workspaces, deps.attentionIds]
  )

  // Mirrors into refs so the ONE window listener below never has to be torn
  // down and reinstalled as these change — the same pattern focusedIdRef and
  // viewportRef already use in this codebase.
  const openRef = useRef(open)
  openRef.current = open
  const cursorRef = useRef(cursor)
  cursorRef.current = cursor
  const cellsRef = useRef(cells)
  cellsRef.current = cells
  const depsRef = useRef(deps)
  depsRef.current = deps

  const isOpen = useCallback(() => openRef.current, [])

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const d = depsRef.current

      if (!openRef.current) {
        // Reveal. Cmd+G, and NOT a bare held Cmd with a dwell threshold: Cmd
        // is the required modifier for every canvas shortcut here, so "the
        // user is holding Cmd" is the prelude to Cmd+N/K/J rather than a rare
        // state, and a threshold would both flash the overlay during ordinary
        // hesitation and ship another unmeasured constant.
        if (d.enabled === false) return
        if (!event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
        if (event.key !== 'g' && event.key !== 'G') return
        // A review node's open commit draft keeps the chord. That input is
        // the second surface in this app that takes DOM focus off xterm, and
        // it gets usePalette's rule-4 treatment for it; revealing the grid
        // over it swallows every subsequent key in the `default:` arm below,
        // so the field goes dead, and releasing Cmd then unmounts the node
        // with the typed message unsaved. ReviewNode's own bubble-phase
        // stopPropagation cannot reach us — this listener is capture-phase on
        // `window` and has already run.
        //
        // Target-based, and document.activeElement is deliberately NOT the
        // test: xterm's own helper is a <textarea>, so "a text field is
        // focused" is TRUE over every ordinary terminal panel and would
        // disable Cmd+G across the whole app. Chosen over plumbing draft
        // state up into `enabled` (the way !palette.open already is) because
        // that would put a per-node piece of state into a Canvas-level flag
        // and re-render the canvas on every keystroke of a commit message.
        // No preventDefault before this bail, unlike the repeat guard below:
        // this chord is NOT ours here, so it belongs to whoever owns that
        // field, exactly as usePalette's modifier checks bail bare.
        //
        // A second text surface inherits the identical guard: a file panel's
        // edit draft (.file-node__editor) has the same problem for the same
        // reason — unguarded, Cmd+G typed into a draft reveals the grid, the
        // open branch's default: arm swallows every further keystroke, and
        // releasing Cmd switches workspace and unmounts the panel with the
        // draft unsaved.
        const target = event.target as HTMLElement | null
        if (target?.closest?.('.review-node__commit-form, .file-node__editor, .jira-node__comment-form')) return
        // A held chord is ONE gesture and roughly fifteen events a second.
        // The guard's reachable case is the TAIL of a held chord after the
        // grid has already been dismissed: Escape closes, the user has not
        // yet let go, and without this the repeat stream re-reveals the
        // overlay they just cancelled. preventDefault comes BEFORE the bail,
        // like usePalette's: this chord IS ours and we are declining to act
        // on it, so its tail must still be swallowed rather than leaking to
        // the focused agent's PTY.
        event.preventDefault()
        if (event.repeat) return
        setCursor(initialCursor(cellsRef.current))
        setOpen(true)
        return
      }

      // Open. The grid holds no DOM focus — xterm still does — so every key it
      // claims must be stopped HERE, in the capture phase, before xterm's own
      // target-phase handler runs. Same asymmetry shouldYieldWheel relies on.
      const claim = (): void => {
        event.preventDefault()
        event.stopPropagation()
      }

      switch (event.key) {
        case 'ArrowLeft': claim(); setCursor((i) => stepCell(cellsRef.current, i, -1, 0)); break
        case 'ArrowRight': claim(); setCursor((i) => stepCell(cellsRef.current, i, 1, 0)); break
        case 'ArrowUp': claim(); setCursor((i) => stepCell(cellsRef.current, i, 0, -1)); break
        case 'ArrowDown': claim(); setCursor((i) => stepCell(cellsRef.current, i, 0, 1)); break
        case 'Escape': claim(); close(); break
        default:
          // Everything else is swallowed too. While the overlay is up the
          // canvas has stood down and the agent must not receive keys the user
          // believes are going to the grid.
          claim()
          break
      }
    }

    const onKeyUp = (event: KeyboardEvent): void => {
      if (!openRef.current) return
      // `key === 'Meta'`, deliberately NOT `!event.metaKey`. Whether the
      // modifier bitfield has already cleared inside the keyup for Meta itself
      // is unanswerable by anything this repo can run — sendInputEvent reports
      // back exactly the modifiers array it is handed, so a check against it
      // is circular. This test is correct under BOTH readings, and covers
      // MetaLeft and MetaRight alike.
      if (event.key !== 'Meta') return
      const d = depsRef.current
      const cell = cellsRef.current[cursorRef.current]
      close()
      if (!cell) return
      // Branching on the DISCRIMINANT, never on MORE_INDEX: which cell is the
      // overflow door is buildGrid's business, and a second copy of that index
      // here would be a second author of the same fact.
      if (cell.kind === 'more') { d.onMore(); return }
      if (cell.kind !== 'workspace') return
      // Never for the already-active workspace: switchWorkspace is a
      // transaction that writes the outgoing canvas before flipping the active
      // id, so a same-id "switch" would re-render the whole canvas, re-seed
      // the id counter and clear the undo stack to arrive where it already is.
      if (cell.active) return
      d.onCommit(cell.workspaceId)
    }

    /**
     * Required, not defensive. Cmd+Tab is the ORDINARY instance: the user
     * holds Cmd, taps Tab, macOS switches applications, and the keyup for Cmd
     * is delivered to that other application. With only the handler above, the
     * overlay stays up forever over a canvas whose own shortcuts have stood
     * down — no key left that dismisses it, no recovery short of Cmd+R.
     */
    // Bubble phase, deliberately — the ONE listener here that is not capture.
    // Element `blur` does not bubble but it DOES capture, so `capture: true`
    // would fire this for every element blur on its way down to the target:
    // xterm's helper textarea loses focus constantly, and the grid would
    // dismiss itself the instant anything on the canvas changed hands.
    const onBlur = (): void => { if (openRef.current) close() }

    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
      window.removeEventListener('blur', onBlur)
    }
  }, [close])

  // Memoised, and NavGrid's memo() is what makes that load-bearing rather
  // than tidy. Canvas re-renders on every mousemove over the canvas (the HUD
  // cursor), so a fresh object literal here would never compare equal and
  // NavGridImpl would re-render at pointer rate — a memo() that can never
  // skip is a 60Hz defence that only LOOKS like one, which is worse than no
  // memo at all, because the next reader trusts it. setCursor is useState's
  // own setter and is already stable, so it needs no dep.
  return useMemo(
    () => ({ open, cells, cursor, isOpen, setCursor }),
    [open, cells, cursor, isOpen]
  )
}
