import { useEffect, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { setReducedMotionOverride } from './useViewport'
import type { Registry } from '@renderer/session/session-registry'
import type { PanelSpecTemplate } from '@renderer/session/panel-session'
import type { PaletteActions } from '@renderer/palette/commands'
import { isTerminalPanel, type Panel } from '@renderer/panels/panels'
import { undoHistory, type History } from '@renderer/panels/history'
import type { PresetTemplate } from '@shared/ipc-contract'
import type { Viewport, WorldRect } from './viewport'

export interface CanvasTestHooksDeps {
  /** M133. The instantiation counter — see `__m132Instantiations` below. */
  instantiateCountRef: RefObject<number>
  registry: Registry
  viewportRef: RefObject<Viewport>
  focusedIdRef: RefObject<string | null>
  panelsRef: RefObject<Panel[]>
  defaultTemplateRef: RefObject<PresetTemplate | undefined>
  /**
   * Written by `paletteActions`, which is declared far BELOW this hook's call
   * site — the ref is the whole reason the delete hook can reach the real
   * gated action rather than a second copy of it. See its own comment inside.
   */
  deleteWorkspaceRef: RefObject<PaletteActions['deleteWorkspace'] | null>
  setHistory: Dispatch<SetStateAction<History<Panel[]>>>
  applyHistory: (previousPresent: Panel[], next: History<Panel[]>) => void
  resetCanvas: () => void
  switchWorkspace: (id: string) => Promise<boolean>
  movePanelsToWorkspace: (
    panelIds: string[],
    target: { workspaceId: string } | { newName: string }
  ) => void
  /** M50. The selection setter, for a check that arranges a chosen set. */
  setSelectedIds: Dispatch<SetStateAction<ReadonlySet<string>>>
}

/**
 * The `window.__m4a*` / `__m4b*` / `__m5a*` / `__m7aWorkspace` surface
 * `verify:panels` drives the renderer through.
 *
 * Lifted out of `Canvas.tsx` verbatim (M28, a purely structural split) and
 * called from exactly the position it used to occupy, because the hook order
 * around it is load-bearing: `deleteWorkspaceRef` is created above this call
 * and assigned below it, and moving the call would break that create-then-
 * assign order silently — the ref would read null for the life of the effect
 * and the delete hook would do nothing, with no error anywhere.
 *
 * `docs/verify-suites.md` describes these as installed by `Canvas.tsx`; they
 * are now installed here, on Canvas's behalf, and the narrowness rule that
 * entry states still applies — each member is named for what it ANSWERS, and
 * the registry itself is never exposed.
 */
export function useCanvasTestHooks(deps: CanvasTestHooksDeps): void {
  const {
    instantiateCountRef,
    registry, viewportRef, focusedIdRef, panelsRef, defaultTemplateRef,
    deleteWorkspaceRef, setHistory, applyHistory, resetCanvas, switchWorkspace, setSelectedIds,
    movePanelsToWorkspace
  } = deps

  // Test hooks for verify:panels. The registry (and, since M7, the workspace
  // surface) is a module-level/main-owned concept with no other route in for
  // executeJavaScript. Kept to narrow, single-purpose reads/writes — named
  // for what each one ANSWERS — rather than exposing the registry itself, so
  // the suite cannot quietly start depending on internals. Grep `w\.__` in
  // this effect for the current count rather than trusting a number here:
  // it has already drifted once (an earlier comment said "seven" after the
  // count had grown past a dozen).
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>
    // M133. How many times M80's instantiation has been entered. The
    // workflow panel's whole claim is that Run reaches THAT function and not
    // a second copy, and only a count separates the two.
    w.__m132Instantiations = (): number => instantiateCountRef.current
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
    /** M116. The focused id, so a check can assert a flight moved the camera and NOT the focus. */
    w.__m4aFocusedId = (): string | null => focusedIdRef.current
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
    /**
     * M45. The xterm theme a session's terminal currently holds, as its
     * background hex — for a LIVE or a DETACHED session alike, which is the
     * distinction verify:panels theme.1 exists to make.
     */
    w.__m45TerminalTheme = (id: string): string | null => {
      const session = registry.get(id)
      if (!session) return null
      const theme = session.handle.options().theme as { background?: string } | undefined
      return theme?.background ?? null
    }
    /** M50. Select exactly these panels — the M18 gesture's result, without the gesture. */
    w.__m50Select = (ids: string[]): void => { setSelectedIds(new Set(ids)) }
    // M56. The harness cannot set the OS preference; this is the one override.
    w.__m56ReducedMotion = (value: boolean | null): void => { setReducedMotionOverride(value) }
    /** M49. A session's own cell metrics (CSS px, transform-blind), by id. */
    w.__m49CellSize = (id: string): { width: number; height: number } | null => {
      const session = registry.get(id)
      return session ? session.handle.cellSize() : null
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
      setHistory((h) => { const next = undoHistory(h); applyHistory(h.present, next); return next })
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
      // `isTerminalPanel`, because only a terminal panel has a spec at all —
      // a file panel would otherwise read an absent one.
      return panel && isTerminalPanel(panel) ? { spec: panel.spec, rect: panel.rect } : null
    }
    /** The template currently pushed as Cmd+N's default, or undefined. */
    w.__m5aDefaultSpec = (): PresetTemplate | undefined => defaultTemplateRef.current
    /**
     * verify:panels' route into workspace switching, the same reason every
     * other __m4a* hook exists: the registry (and now the workspace surface)
     * is a module-level/main-owned concept executeJavaScript cannot reach any
     * other way. Kept narrow and named for what each member ANSWERS.
     */
    w.__m7aWorkspace = (): {
      switchTo: (workspaceId: string) => void
      createAndSwitch: (name: string) => Promise<string>
      allPanelIds: () => Promise<string[]>
      deleteWorkspace: (workspaceId: string) => void
      movePanels: (
        panelIds: string[],
        target: { workspaceId: string } | { newName: string }
      ) => void
    } => ({
      switchTo: (workspaceId: string) => switchWorkspace(workspaceId),
      // Returns the id the store actually minted, not just a fire-and-forget
      // void: nextWorkspaceId() derives from the current maximum `w<n>`, so a
      // caller has no honest way to predict it in advance. A check that
      // hardcodes the id it EXPECTS createWorkspace to hand back is a check
      // that never actually switched anywhere the day that assumption drifts
      // — it would still read as green, just against the wrong workspace.
      createAndSwitch: (name: string) =>
        window.canvas.workspace.create(name).then((workspaceId) => {
          switchWorkspace(workspaceId)
          return workspaceId
        }),
      allPanelIds: () =>
        window.canvas.workspace.list().then((rows) => rows.flatMap((row) => row.panelIds)),
      // Drives the SAME gated action a real "Delete workspace…" palette row
      // does — paletteActions.deleteWorkspace, reached through a ref because
      // paletteActions is declared later in this component (see
      // deleteWorkspaceRef's own comment). Not a bypass: this still opens
      // the confirm and still waits on an Enter/Escape the way the real row
      // does, which is what lets verify:panels prove the confirm is a real
      // gate rather than only that a delete function exists. name/liveCount
      // are read off main's own list rather than guessed, the same reason
      // createAndSwitch above never hardcodes an id.
      deleteWorkspace: (workspaceId: string) => {
        void window.canvas.workspace.list().then((rows) => {
          const row = rows.find((r) => r.id === workspaceId)
          deleteWorkspaceRef.current?.(
            workspaceId, row?.name ?? workspaceId, row?.panelIds.length ?? 0
          )
        })
      },
      // The SAME callback the palette's move rows run — not a second path to
      // main's movePanels. A hook that invoked window.canvas.workspace
      // .movePanels directly would prove main's record edit works and say
      // nothing at all about whether this renderer disposes the sessions on
      // its way out, which is the entire subject of verify:panels 121.
      movePanels: (panelIds, target) => movePanelsToWorkspace(panelIds, target)
    })
  }, [applyHistory, resetCanvas, switchWorkspace, movePanelsToWorkspace])
}
