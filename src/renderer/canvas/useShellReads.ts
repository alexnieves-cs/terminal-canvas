import type { CanvasState } from '@shared/layout-schema'
import { type Dispatch, type RefObject, type SetStateAction, useCallback, useEffect, useRef, useState } from 'react'
import { type Panel, isTerminalPanel } from '@renderer/panels/panels'
import type { PaletteController } from '@renderer/palette/usePalette'
import type { SettingRow } from '@shared/ipc-contract'
import type { EnvReport } from '@shared/env-report'
import { beginUpdateCheck, getUpdateState, setUpdateResult, useUpdateState } from '@renderer/session/update-store'
import type { AdoptableSession } from '@shared/tmux-adopt'
import { type StartupInput, splashMode, LAST_VERSION_KEY, PLAYED_KEY, type SplashMode } from './splash'
import type { Viewport } from './viewport'
import { attemptOf, type HintId } from './hints'
import { prefersReducedMotion } from './useViewport'

import type { Registry } from '@renderer/session/session-registry'
/**
 * M507 (E4, the Canvas.tsx split). What the shell reads once or on a settings
 * change: the terminal font sizes fanned to every session (M49), the
 * environment report (M48), the starter record's ref (M181), the launch-time
 * update check (M123), the gesture hints (M48, M173), the launcher's recents
 * and their last use (M174, M262), the put-away card and the starter cluster
 * (M262), the empty canvas's last gesture, and the scrollback setting (M41).
 * Lifted out of Canvas VERBATIM as one contiguous run and called at exactly
 * the position it occupied, with one destructured Deps object so every
 * dependency array names the same values.
 */
export interface UseShellReadsDeps {
  registry: Registry
  globalFontSize: number
  hostRef: RefObject<HTMLDivElement | null>
  initial: CanvasState
  merged: boolean
  palette: PaletteController
  panels: Panel[]
  panelsRef: RefObject<Panel[]>
  setInspectorPinned: Dispatch<SetStateAction<boolean>>
  settingRows: SettingRow[]
  startup: StartupInput | undefined
  viewport: Viewport
}

export function useShellReads(deps: UseShellReadsDeps) {
  const {
    globalFontSize, hostRef, initial, merged, palette, panels, panelsRef, setInspectorPinned, settingRows, startup, viewport, registry
  } = deps
  const onToggleInspectorPinned = useCallback((): void => {
    setInspectorPinned((v) => { const next = !v; void window.canvas.settings.set('shell.inspectorPinned', next); return next })
  }, [])
  const fontOverridesSig = panels.map((p) => (isTerminalPanel(p) && p.fontSize !== undefined ? `${p.rect.id}=${p.fontSize}` : '')).filter(Boolean).join(',')
  useEffect(() => {
    const overrides: Record<string, number> = {}
    for (const p of panelsRef.current) if (isTerminalPanel(p) && p.fontSize !== undefined) overrides[p.rect.id] = p.fontSize
    registry.setFontSizes({ global: globalFontSize, overrides })
  }, [globalFontSize, fontOverridesSig])

  // M48: the environment report, read ONCE — main probes once, and the
  // report says when. Null until the invoke answers, and the launcher and the
  // palette both render the null honestly rather than as "nothing found".
  const [envReport, setEnvReport] = useState<EnvReport | null>(null)
  // The UX pass (4.4): Dismiss all on the welcome-back card hides the banner for this run.
  const [envBannerDismissed, setEnvBannerDismissed] = useState(false)
  // The UX pass (5.5). Agents already running in the person's own tmux, asked
  // once per launch; the empty canvas offers them. Null until asked, or once
  // placed or declined. A main without the door (a harness) is no offer.
  const [adoptable, setAdoptable] = useState<{ tmuxPath: string; sessions: AdoptableSession[] } | null>(null)
  useEffect(() => {
    const door = window.canvas?.env?.adoptable
    if (typeof door !== 'function') return
    let live = true
    door().then((r) => {
      if (live && r.tmuxPath !== null && r.sessions.length > 0) setAdoptable({ tmuxPath: r.tmuxPath, sessions: r.sessions })
    }, () => { /* no answer is no offer */ })
    return () => { live = false }
  }, [])
  // M181. A ref beside the state: `applyStarter` is installed once (the
  // palette memo captures it), so it must read the report at CALL time — a
  // closure over the null the first render held refused the starter for
  // "no engine" while the launcher beside it showed the primary enabled
  // (the journey check found it, one run in three).
  const envReportRef = useRef(envReport)
  envReportRef.current = envReport
  const recheckEnvironment = useCallback(async (): Promise<EnvReport> => {
    const report = await window.canvas.env.report(true)
    setEnvReport(report)
    return report
  }, [])
  useEffect(() => {
    let live = true
    void window.canvas.env.report().then((r) => { if (live) setEnvReport(r) }).catch(() => {})
    return () => { live = false }
  }, [])

  // M123. The launch-time update check — ONCE per launch, and only when the
  // setting says so. Read the way `agent.glow` and `vault.root` are (a
  // settings:list of its own, never settingRows, which is empty until the
  // palette has opened), and gated on the STORE rather than a ref: a second
  // mount of this component (a workspace switch does not remount, but a
  // reload does) finds the answer already there and asks nothing. Off by
  // default, so a fresh install never makes a network call it was not told
  // to; the by-hand row is the door for everyone else. The answer goes into
  // the store and nowhere else — the launcher and the environment rows read
  // it; no dialog, no badge: a notice, not an interruption.
  const updateState = useUpdateState()
  useEffect(() => {
    let live = true
    void window.canvas.settings.list().then((rows) => {
      if (!live) return
      const row = rows.find((r) => r.id === 'update.checkOnLaunch')
      if (row === undefined || row.value !== true) return
      if (getUpdateState().checking || getUpdateState().result !== null) return
      beginUpdateCheck()
      void window.canvas.update.check().then((result) => { setUpdateResult(result) })
        .catch((e: unknown) => { setUpdateResult({ kind: 'could-not-check', reason: e instanceof Error ? e.message : 'the update check did not answer' }) })
    }).catch(() => {})
    return () => { live = false }
  }, [])

  // M48: the gesture hints. `hints.seen` is read the way every other setting
  // is; a gesture is "seen" when the thing it moves has moved — the camera's
  // translation, its scale, the palette opening, the panel count growing —
  // and the id is written once. Never keyed on the event itself, which
  // would need a hook into every input path for a fact the state already
  // carries.
  const [hintsSeen, setHintsSeen] = useState<ReadonlySet<string>>(() => new Set())
  // Read by startFirstWork at press time, so the callback need not re-create on every hint.
  const hintsSeenRef = useRef(hintsSeen)
  hintsSeenRef.current = hintsSeen
  const hintsLoadedRef = useRef(false)
  // M173 (the Act III critic): a STATE beside the ref, so the banner and the rail's hints render only once `hints.seen` has been read — the banner painted and vanished on every launch when the backend probe answered first.
  const [hintsLoaded, setHintsLoaded] = useState(false)
  useEffect(() => {
    void window.canvas.settings.list().then((rows) => {
      const row = rows.find((r) => r.id === 'hints.seen')
      if (row && Array.isArray(row.value)) setHintsSeen(new Set(row.value as string[]))
      hintsLoadedRef.current = true
      setHintsLoaded(true)
    })
  }, [settingRows])
  // M174. The launcher's recents row: asked once whenever the canvas is empty
  // (the only time the launcher shows), never polled.
  const [launcherRecents, setLauncherRecents] = useState<string[]>([])
  // M262. When each was last used — a SEPARATE read so an old main (no
  // handler) costs the times only, never the list.
  const [launcherRecentUsed, setLauncherRecentUsed] = useState<Record<string, number>>({})
  useEffect(() => {
    if (panels.length !== 0) return
    let live = true
    void window.canvas.spawn.recent().then((r) => { if (live) setLauncherRecents(r) }).catch(() => { if (live) setLauncherRecents([]) })
    void window.canvas.spawn.recentUsed().then((r) => { if (live) setLauncherRecentUsed(r) }).catch(() => { if (live) setLauncherRecentUsed({}) })
    return () => { live = false }
  }, [panels.length])
  // M262. `Blank canvas`: the person put the card away. Session-only and per
  // workspace-empty episode — the next time this canvas empties, the card is
  // back, because an empty canvas with no way to start is the state M48 fixed.
  const [launcherPutAway, setLauncherPutAway] = useState(false)
  useEffect(() => { if (panels.length !== 0) setLauncherPutAway(false) }, [panels.length])
  // Startup splash. Decided ONCE, from the layout as it was restored — the
  // ghost traces what you left, not what you did in the first 800 ms.
  const [splash, setSplash] = useState<SplashMode>(() => startup === undefined ? 'none' : splashMode({
    ...startup,
    reducedMotion: prefersReducedMotion(),
    playedThisSession: (() => { try { return window.sessionStorage.getItem(PLAYED_KEY) !== null } catch { return false } })(),
    merged: false,
    panelCount: initial.panels.length
  }))
  useEffect(() => {
    if (splash === 'none' || startup === undefined) return
    try {
      window.localStorage.setItem(LAST_VERSION_KEY, startup.version || 'unknown')
      window.sessionStorage.setItem(PLAYED_KEY, '1')
    } catch { /* storage unavailable: the splash may replay, nothing worse */ }
    // Mount-only by design: the write marks that a splash STARTED.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Entering the merged view ENDS the splash rather than hiding it: hidden,
  // leaving the view would remount it and replay the scene from zero.
  useEffect(() => { if (merged) setSplash('none') }, [merged])
  // M262. THE STARTER CLUSTER: a first start mints a card and its agent; for
  // one arrival they rise in turn and the camera frames them TOGETHER, so the
  // first thing a person sees is the pair, never one panel alone on a void.
  const [clusterArrival, setClusterArrival] = useState(false)
  // The first start's handoff hint: which conversation it reads, and whether
  // the sentence was sent (Start task) or only inserted (a conversation).
  // M310. `itemId` makes the hint the flagship guide: the task it follows.
  const [firstTask, setFirstTask] = useState<{ panelId: string; sent: boolean; itemId?: string } | null>(null)
  // M262. The gesture a person last reached for on the EMPTY canvas — read
  // by a passive capture listener that never prevents or stops anything, so
  // no gesture handler below it changes. Only a background target counts: a
  // drag inside a panel or the launcher is not a reach for the camera.
  const [attemptedHint, setAttemptedHint] = useState<HintId | null>(null)
  useEffect(() => {
    const host = hostRef.current
    if (host === null) return
    const onInput = (e: Event): void => {
      if (panelsRef.current.length !== 0) return
      const target = e.target instanceof Element ? e.target : null
      if (e.type !== 'keydown' && (target === null || target.closest('.panel, .launcher, .palette, button, input, textarea, select') !== null)) return
      if (e.type === 'keydown' && document.activeElement !== null && document.activeElement !== document.body && document.activeElement !== host) return
      const attempt = attemptOf(e as unknown as Parameters<typeof attemptOf>[0])
      if (attempt !== null) setAttemptedHint(attempt)
    }
    const kinds = ['mousedown', 'wheel', 'dblclick'] as const
    for (const k of kinds) host.addEventListener(k, onInput, { capture: true, passive: true })
    window.addEventListener('keydown', onInput, { capture: true, passive: true })
    return () => {
      for (const k of kinds) host.removeEventListener(k, onInput, { capture: true })
      window.removeEventListener('keydown', onInput, { capture: true })
    }
  }, [hostRef])
  const markHint = useCallback((id: string) => {
    if (!hintsLoadedRef.current) return
    setHintsSeen((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev); next.add(id)
      void window.canvas.settings.set('hints.seen', [...next])
      return next
    })
  }, [])
  const hintBaseRef = useRef<{ x: number; y: number; scale: number; panels: number } | null>(null)
  useEffect(() => {
    const base = hintBaseRef.current
    if (!base) { hintBaseRef.current = { x: viewport.x, y: viewport.y, scale: viewport.scale, panels: panels.length }; return }
    if (viewport.x !== base.x || viewport.y !== base.y) markHint('pan')
    if (viewport.scale !== base.scale) markHint('zoom')
    if (panels.length > base.panels) markHint('new-panel')
    if (palette.open) markHint('palette')
  }, [viewport.x, viewport.y, viewport.scale, panels.length, palette.open, markHint])

  // M41: read the SAME way, for the handoff hook's "scrollback is off" skip —
  // a handoff whose source recorded nothing says a different sentence when the
  // reason is the setting than when the panel simply printed nothing.
  const [scrollbackPersist, setScrollbackPersist] = useState(true)
  const scrollbackPersistRef = useRef(scrollbackPersist)
  scrollbackPersistRef.current = scrollbackPersist
  useEffect(() => {
    void window.canvas.settings.list().then((rows) => {
      const row = rows.find((r) => r.id === 'scrollback.persist')
      if (row) setScrollbackPersist(row.value === true)
    })
  }, [settingRows])


  return { adoptable, attemptedHint, clusterArrival, envBannerDismissed, envReport, envReportRef, firstTask, hintsLoaded, hintsSeen, hintsSeenRef, launcherPutAway, launcherRecentUsed, launcherRecents, markHint, onToggleInspectorPinned, recheckEnvironment, scrollbackPersist, scrollbackPersistRef, setAdoptable, setClusterArrival, setEnvBannerDismissed, setFirstTask, setLauncherPutAway, setSplash, splash, updateState }
}
