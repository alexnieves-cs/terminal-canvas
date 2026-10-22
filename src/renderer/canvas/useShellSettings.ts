import { type Dispatch, type RefObject, type SetStateAction, useCallback, useEffect, useState } from 'react'
import { type Panel, occupiedRect, terminalRimAt } from '@renderer/panels/panels'
import type { PaletteController } from '@renderer/palette/usePalette'
import type { SettingRow, WorkspaceRow, MergedWorkspace } from '@shared/ipc-contract'
import { terminalTheme } from '@renderer/terminal/themes'
import { applyRelayTheme } from '@renderer/relay/RelayTerminal'
import type { Viewport, WorldRect } from './viewport'
import { useTheme } from './useTheme'

import type { Registry } from '@renderer/session/session-registry'
/**
 * M507 (E4, the Canvas.tsx split). The shell's settings, each read the way
 * glow is (its own settings:list, re-run when settingRows changes): the create
 * doors' reveal (M402), the workspace step, glow, pips and the overview (M69),
 * xterm's screen-reader mode (M44), the theme (M45), the global terminal font
 * size (M49), and the inspector's and navigator's widths and pin (M279).
 * Lifted out of Canvas VERBATIM as one contiguous run and called at exactly
 * the position it occupied, with one destructured Deps object so every
 * dependency array names the same values.
 */
export interface UseShellSettingsDeps {
  registry: Registry
  displayPanels: Panel[]
  landingTargetRef: RefObject<string | null>
  merged: boolean
  palette: PaletteController
  panels: Panel[]
  pendingRevealRef: RefObject<{ id: string; lit?: true | undefined; }[]>
  reloadWorkspaces: () => void
  resolveDormant: (ids: string[]) => Promise<Set<string>>
  reveal: (rect: WorldRect) => boolean
  setDormantIds: Dispatch<SetStateAction<ReadonlySet<string>>>
  setMergedData: Dispatch<SetStateAction<MergedWorkspace[] | null>>
  settingRows: SettingRow[]
  stepWorkspaceImplRef: RefObject<(delta: 1 | -1) => void>
  switchWorkspace: (id: string) => Promise<boolean>
  viewportRef: RefObject<Viewport>
  workspaceListSignature: string
  workspaceRows: WorkspaceRow[]
}

export function useShellSettings(deps: UseShellSettingsDeps) {
  const {
    displayPanels, landingTargetRef, merged, palette, panels, pendingRevealRef, reloadWorkspaces, resolveDormant, reveal, setDormantIds, setMergedData, settingRows, stepWorkspaceImplRef, switchWorkspace, viewportRef, workspaceListSignature, workspaceRows, registry
  } = deps
  // M402 (B4). The reveal that ends every create door (`placer`, by onSpawn):
  // once the made objects are rendered, the camera shows them with the least
  // move (useViewport's reveal — none when they are in view and clear).
  // Their OCCUPIED rects at this zoom, so a terminal's rim name is shown too;
  // every object made in one tick together (their bounds), those not yet
  // rendered left for the next pass. `lit` arms the attention jump's arrival
  // glow, disarmed again when the camera stays put (no settle would consume it).
  useEffect(() => {
    const pending = pendingRevealRef.current
    if (pending.length === 0) return
    const ready = pending.flatMap((q) => { const panel = displayPanels.find((p) => p.rect.id === q.id); return panel === undefined ? [] : [{ q, panel }] })
    if (ready.length === 0) return
    pendingRevealRef.current = pending.filter((q) => !ready.some((r) => r.q === q))
    const rim = terminalRimAt(viewportRef.current.scale)
    const boxes = ready.map((r) => occupiedRect(r.panel, rim))
    const x = Math.min(...boxes.map((b) => b.x)), y = Math.min(...boxes.map((b) => b.y))
    const bounds = { id: 'reveal', x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y }
    const lit = [...ready].reverse().find((r) => r.q.lit === true)
    if (lit !== undefined) landingTargetRef.current = lit.q.id
    if (!reveal(bounds) && lit !== undefined) landingTargetRef.current = null
  }, [displayPanels, reveal])

  /**
   * Cmd+Shift+] and Cmd+Shift+[: the next or previous workspace, WRAPPING.
   *
   * It walks `workspaceRows` — the rail's own list, in main's own order — so
   * the chord and the rail's Workspaces section cannot disagree about what
   * "next" means, and it wraps rather than stopping at the ends: an
   * unwrapped `rows[at + delta]` is `undefined` at both edges, which reads as
   * a chord that stopped working rather than as a boundary.
   *
   * A single workspace is a deliberate no-op. `switchWorkspace` on the
   * ALREADY-active id is a real activate round trip that rewrites the record
   * it just read, and there is nowhere to go, so the honest answer is
   * nothing at all. Everything else — including leaving the merged view
   * first — is switchWorkspace's, so this cannot become a second switching
   * path.
   */
  const stepWorkspace = useCallback((delta: 1 | -1) => {
    if (workspaceRows.length < 2) return
    const at = workspaceRows.findIndex((w) => w.active)
    // No active row means the list has not loaded yet (mount, or a failed
    // reload that logged its own warning) — stepping from an unknown index
    // would land on an arbitrary workspace, which is worse than nothing.
    if (at < 0) return
    const next = workspaceRows[(at + delta + workspaceRows.length) % workspaceRows.length]
    switchWorkspace(next.id)
  }, [workspaceRows, switchWorkspace])
  // Handed to useViewport through the ref declared beside its call, for the
  // ordering reason that ref's own comment gives.
  stepWorkspaceImplRef.current = stepWorkspace
  useEffect(() => {
    if (palette.open) reloadWorkspaces()
  }, [palette.open, reloadWorkspaces])
  // The third occasion, and the one the rail added. A workspace row renders
  // `N panels`, and NOTHING above reloads on a spawn or a close: mount, palette
  // open, and the create/rename/delete/switch call sites are the whole set. So
  // a mouse-only user who clicks the top bar's New panel three times reads
  // "1 panel" two lines above a Panels list showing four rows, and it stays
  // wrong until they happen to open the palette — which they may never do, and
  // mouse-only reachability is exactly what this section exists for.
  //
  // Keyed on panels.LENGTH, never on `panels`: the array identity is fresh on
  // every setPanelRect, i.e. every frame of a drag, so keying on the array
  // would fire an IPC round trip at 60Hz for rect changes no workspace row
  // displays — the same churn railSignature and every memo in this file exist
  // to keep off the shell.
  //
  // It sees main's post-save state because of DECLARATION ORDER: the
  // layout.save effect is declared earlier in this component, React runs a
  // commit's effects in declaration order, and both IPC handlers are
  // synchronous and processed in arrival order. doSave mutates w.panels in
  // place — only its scheduleWrite is debounced — and workspaces() reads that
  // same in-memory snapshot, so the reply is fresh within one round trip.
  // Moving this effect above the save one would leave every count one panel
  // stale, with nothing to point at.
  useEffect(() => { reloadWorkspaces() }, [panels.length, reloadWorkspaces])

  /**
   * Keep the merged view current while it is open.
   *
   * Keyed on `panels.length` and not on `panels`: the array is a fresh
   * identity on every setPanelRect — i.e. every frame of a drag — and an
   * effect on the array itself would put an IPC round trip on the 60Hz path.
   * The COUNT is what a Cmd+N or a close actually changes, which is the whole
   * reason to refetch: without this, a panel spawned while merged is missing
   * from its own lane until the user toggles the view off and on, which reads
   * as the spawn having failed.
   *
   * It re-derives dormancy under the identical rule and in the identical
   * order, because a refetch is an entry as far as registry.ensure is
   * concerned: it can introduce panel ids this canvas has never rendered (a
   * spawn in ANOTHER window, a panel filed here by a move).
   *
   * `panels.length` ALONE was not enough, and the gap was the worst thing in
   * this milestone. A workspace mutation changes no panel on THIS canvas, so
   * deleting a NON-ACTIVE workspace while merged left its lane rendering
   * panels whose sessions had just been disposed — and a lane on screen is
   * clickable, because hitOrder is built from displayPanels. Clicking a ghost
   * runs onSelectPanel, which clears dormancy and calls registry.ensure,
   * which MINTS A FRESH SESSION for an id no workspace holds any more;
   * tiering promotes it and attachSlot spawns. An agent under a deleted
   * workspace's panel id, reachable from no UI ever again, from one click —
   * the no-unguarded-spawn rule broken through a door no per-task review
   * could see. Create and rename leave the same lane stale, cosmetically.
   *
   * So it also keys on `workspaceListSignature`, a STRING derived from
   * workspaceRows rather than the array itself: reloadWorkspaces() hands back
   * a brand-new array of brand-new objects on every call, including the one
   * this component fires on every panels.length change, so an effect keyed on
   * the array would refetch on identities that describe no change at all.
   * The signature covers id, name and which one is active — every workspace
   * MUTATION — and deliberately not panelIds, which changes on every spawn
   * and is already covered by panels.length one dep along. Gating the delete
   * on `merged` was the alternative and is worse: it would leave the stale
   * lane in place for create and rename too.
   */
  useEffect(() => {
    if (!merged) return
    let live = true
    void (async (): Promise<void> => {
      let workspaces: MergedWorkspace[]
      try {
        workspaces = await window.canvas.workspace.merged()
      } catch (error: unknown) {
        console.warn('[merged] could not refresh the merged view', error)
        return
      }
      const dormant = await resolveDormant(
        workspaces.flatMap((w) => w.panels.map((p) => p.id))
      )
      // The guard is not defensiveness: this fetch can resolve after the user
      // has already left the merged view, and committing then would put every
      // other workspace's panels back on a canvas that is no longer showing
      // them — with a dormantIds set naming ids this workspace does not hold.
      if (!live) return
      setMergedData(workspaces)
      setDormantIds(dormant)
    })()
    return () => { live = false }
  }, [merged, panels.length, workspaceListSignature, resolveDormant])

  // Read once at mount and again whenever a setting changes, so toggling the
  // glow off takes effect without a relaunch. settingRows is loaded only when
  // the palette OPENS, so it cannot be the source here — a panel must know
  // this whether or not the palette has ever been opened.
  const [glowEnabled, setGlowEnabled] = useState(true)
  useEffect(() => {
    void window.canvas.settings.list().then((rows) => {
      const row = rows.find((r) => r.id === 'agent.glow')
      if (row) setGlowEnabled(row.value === true)
    })
  }, [settingRows])

  // Read the same way glowEnabled is, and for the same reason: settingRows is
  // loaded only when the palette OPENS, so it cannot be the source — the pips
  // must know this whether or not the palette has ever been opened.
  const [pipsEnabled, setPipsEnabled] = useState(true)
  // M69. The overview, read the same way.
  const [minimapEnabled, setMinimapEnabled] = useState(true)
  useEffect(() => {
    const read = (): void => {
      void window.canvas.settings.list().then((rows) => {
        const row = rows.find((r) => r.id === 'agent.edgeIndicators')
        if (row) setPipsEnabled(row.value === true)
        const mm = rows.find((r) => r.id === 'canvas.minimap')
        if (mm) setMinimapEnabled(mm.value === true)
      })
    }
    read()
    // M69. And on settings:changed, the way the theme is: a toggle from the
    // menu or the `tc` CLI must apply without a palette ever opening.
    const off = window.canvas.settings.onChanged(read)
    return off
  }, [settingRows])

  // M44: xterm's screen-reader mode, fanned across every session (live and
  // detached) through the shared applyTerminalOptions. Read on the settings
  // reload the frame already re-reads, like glow/pips above.
  const [screenReaderMode, setScreenReaderMode] = useState(false)
  useEffect(() => {
    void window.canvas.settings.list().then((rows) => {
      const row = rows.find((r) => r.id === 'accessibility.screenReaderMode')
      if (row) setScreenReaderMode(row.value === true)
    })
  }, [settingRows])
  useEffect(() => {
    registry.applyTerminalOptions({ screenReaderMode })
  }, [screenReaderMode])

  // M45: the theme. useTheme stamps data-theme (the stylesheet's two colour
  // blocks select on it) and the terminal follows through the SAME fan-out
  // the screen-reader option uses — every session, live and detached, and
  // sessions created later inherit it. configure() refreshes an opened
  // terminal itself; a detached one repaints on its next attach.
  const resolvedTheme = useTheme(settingRows)
  useEffect(() => {
    registry.applyTerminalOptions({ theme: terminalTheme(resolvedTheme) })
    // M338. Relay xterms are not in the registry (their pty is remote); same switch.
    applyRelayTheme(terminalTheme(resolvedTheme))
  }, [resolvedTheme])

  // M49: the global terminal font size, read the way glow is, and fanned
  // through the registry together with every terminal panel's override —
  // the registry resolves the effective size per session and refits each
  // live one ONCE per commit. A font size is a resize wearing a hat; zoom is
  // not font size, and nothing here reaches for the camera.
  const [globalFontSize, setGlobalFontSize] = useState(13)
  useEffect(() => {
    let live = true
    const read = (): void => {
      void window.canvas.settings.list().then((rows) => {
        if (!live) return
        const row = rows.find((r) => r.id === 'terminal.fontSize')
        if (row && typeof row.value === 'number') setGlobalFontSize(row.value)
      })
    }
    read()
    // And on any write, as useTheme does: the setting's own palette row
    // reloads settingRows, but a write from anywhere else must apply too.
    const off = window.canvas.settings.onChanged(read)
    return () => { live = false; off() }
  }, [settingRows])
  // (this redesign) The inspector's width and pinned-through-compact setting, read the
  // same way `globalFontSize` is — `shell.inspectorWidth`/`shell.inspectorPinned`
  // are ordinary settings, so a write from the palette or from this pane's own
  // resize handle must both apply, and only `settings:list` sees both.
  const [inspectorWidth, setInspectorWidth] = useState(260)
  const [inspectorPinned, setInspectorPinned] = useState(false)
  // M279. The navigator's width, the same way (`shell.navWidth`).
  const [navWidth, setNavWidth] = useState(300)
  useEffect(() => {
    let live = true
    const read = (): void => {
      void window.canvas.settings.list().then((rows) => {
        if (!live) return
        const w = rows.find((r) => r.id === 'shell.inspectorWidth')
        if (w && typeof w.value === 'number') setInspectorWidth(w.value)
        const nw = rows.find((r) => r.id === 'shell.navWidth')
        if (nw && typeof nw.value === 'number') setNavWidth(nw.value)
        const p = rows.find((r) => r.id === 'shell.inspectorPinned')
        if (p && typeof p.value === 'boolean') setInspectorPinned(p.value)
      })
    }
    read()
    const off = window.canvas.settings.onChanged(read)
    return () => { live = false; off() }
  }, [settingRows])

  return { globalFontSize, glowEnabled, inspectorPinned, inspectorWidth, minimapEnabled, navWidth, pipsEnabled, setInspectorPinned, setInspectorWidth, setNavWidth, stepWorkspace }
}
