import { type Dispatch, type RefObject, type SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PaletteController } from '@renderer/palette/usePalette'
import type { PaletteActions } from '@renderer/palette/commands'
import type { PersistedRun } from '@shared/layout-schema'
import type { WorktreeListRow } from '@shared/ipc-contract'
import type { TaskMenuFact, PanelMarks } from '@renderer/components/PanelFrame'
import { getAgentState } from '@renderer/session/agent-state-store'
import { getLiveSession } from '@renderer/session/live-session-store'
import { isWatcherPanel, isTerminalPanel, isChatPanel, maximiseRect, nextZ, type Panel } from '@renderer/panels/panels'
import { panelState } from '@renderer/panels/panel-state'
import { pinCount, pinRefusal } from '@renderer/canvas/lod'
import { WORK_ITEM_STATES, type PersistedWorkItem } from '@shared/work-items'
import type { CardDetail } from './card-detail'
import type { FocusSide } from '../focus/focus-model'
import { type TaskCluster, taskClusters } from './task-clusters'
import type { Viewport } from './viewport'
import { MAXIMISE_MARGIN } from './canvas-constants'
import { advancedDoors, type AdvancedDoor, type AdvancedDoorId } from './advanced-doors'
import { taskMembership, type TaskMembership } from './task-members'
import { useSelectedAgent } from '../world/world-select'
import { usePresenceReport } from '../presence/usePresenceReport'

import type { ShellChrome } from '@renderer/shell/useShellChrome'
import type { Registry } from '@renderer/session/session-registry'
import type { PersistedGroup } from '@shared/groups'
/**
 * M507 (E4, the Canvas.tsx split). The layout marks (lock, pin, maximise,
 * skill trail), a task's membership, the presence report, the cluster hulls,
 * the related-item lens and its Escape, the task menu and advanced doors, the
 * task verbs and the panel marks. Lifted out of Canvas VERBATIM as one
 * contiguous run and called at exactly the position it occupied, just below
 * instantiateTemplate. The hooks it calls keep their order, so Canvas's hook
 * order is unchanged.
 */
export interface UseTaskLensDeps {
  registry: Registry
  activeWorkspaceId: string | undefined
  annotating: boolean
  cardDetail: CardDetail
  chrome: ShellChrome
  clusterHullsRef: RefObject<readonly TaskCluster[]>
  commitHistory: (next: Panel[]) => void
  displayPanels: Panel[]
  displayPanelsRef: RefObject<Panel[]>
  dormantIds: ReadonlySet<string>
  focusedId: string | null
  focusedIdRef: RefObject<string | null>
  goToViewport: (vp: Viewport) => void
  groups: PersistedGroup[]
  hostRef: RefObject<HTMLDivElement | null>
  merged: boolean
  mergedRef: RefObject<boolean>
  onFocusPanel: (id: string) => void
  openFocusTaskRef: RefObject<(itemId: string, side?: FocusSide | undefined) => void>
  palette: PaletteController
  paletteActionsRef: RefObject<PaletteActions | null>
  panels: Panel[]
  panelsRef: RefObject<Panel[]>
  runs: PersistedRun[]
  selectedId: string | null
  selectedPanelIds: string[]
  setPanels: Dispatch<SetStateAction<Panel[]>>
  setResumedNext: Dispatch<SetStateAction<{ itemId: string; text: string; action?: "review" | "answer" | "resume" | "start" | undefined; } | null>>
  shouldIgnoreKeys: () => boolean
  taskLaneOf: (itemId: string) => { path: string; root: string; panelId: string; branch: string; } | undefined
  version: number
  viewport: Viewport
  viewportRef: RefObject<Viewport>
  workItems: PersistedWorkItem[]
  workItemsRef: RefObject<PersistedWorkItem[]>
  worktreeRows: WorktreeListRow[]
  worldOn: boolean
}

export function useTaskLens(deps: UseTaskLensDeps) {
  const {
    activeWorkspaceId, annotating, cardDetail, chrome, clusterHullsRef, commitHistory, displayPanels, displayPanelsRef, dormantIds, focusedId, focusedIdRef, goToViewport, groups, hostRef, merged, mergedRef, onFocusPanel, openFocusTaskRef, palette, paletteActionsRef, panels, panelsRef, runs, selectedId, selectedPanelIds, setPanels, setResumedNext, shouldIgnoreKeys, taskLaneOf, version, viewport, viewportRef, workItems, workItemsRef, worktreeRows, worldOn, registry
  } = deps
  // M92. Lock, pin and maximise are LAYOUT facts, each one history entry.
  // Absent stays absent: the field is deleted, never set to undefined, so the
  // record on disk has no key. Maximise stores the rect to go back to; the
  // first drag or resize clears the mark (usePanelDrag's onDrag), since the
  // restore rect would lie once the user moved it.
  const setPanelFlag = useCallback((id: string, patch: (panel: Panel) => Panel | null): void => {
    if (mergedRef.current) return
    setPanels((current) => {
      const panel = current.find((p) => p.rect.id === id)
      if (!panel) return current
      const next = patch(panel)
      if (next === null) return current
      const out = current.map((p) => (p === panel ? next : p))
      commitHistory(out)
      return out
    })
  }, [commitHistory])
  const strip = (panel: Panel, key: 'locked' | 'pinned' | 'maximised' | 'skillTrail'): Panel => {
    const { [key]: _gone, ...rest } = panel
    return rest as Panel
  }
  const lockPanel = useCallback((id: string) => setPanelFlag(id, (p) => (p.locked === true ? null : { ...p, locked: true })), [setPanelFlag])
  const unlockPanel = useCallback((id: string) => setPanelFlag(id, (p) => (p.locked === true ? strip(p, 'locked') : null)), [setPanelFlag])
  const pinPanel = useCallback((id: string) => setPanelFlag(id, (p) => (pinRefusal(p.kind, p.pinned === true, pinCount(panelsRef.current)) !== undefined ? null : { ...p, pinned: true })), [setPanelFlag])
  const unpinPanel = useCallback((id: string) => setPanelFlag(id, (p) => (p.pinned === true ? strip(p, 'pinned') : null)), [setPanelFlag])
  const maximisePanel = useCallback((id: string) => {
    const host = hostRef.current
    if (!host) return
    const bounds = host.getBoundingClientRect()
    // M315. Fill view is for READING, so it fills at 100%. Computed against the
    // camera as it stood, a Fill view from a zoomed-out canvas (43% after Fit
    // all) filled the window with 43%-size text. The camera goes to 100% with
    // the world point under the canvas centre held still, and the rect is
    // sized for THAT camera; within 2% of 100% nothing moves.
    const now = viewportRef.current
    const target = Math.abs(now.scale - 1) <= 0.02 ? now : (() => {
      const cx = bounds.width / 2
      const cy = bounds.height / 2
      const wx = (cx - now.x) / now.scale
      const wy = (cy - now.y) / now.scale
      return { x: cx - wx, y: cy - wy, scale: 1 }
    })()
    // Always: at 100% already, this still stops a flight in progress — the rect
    // below is sized for THIS camera, and a camera still moving would carry it off.
    goToViewport(target)
    const rect = maximiseRect(target, { width: bounds.width, height: bounds.height }, MAXIMISE_MARGIN)
    // The raise rides the same patch (one history entry, one setState).
    setPanelFlag(id, (p) => (p.maximised !== undefined ? null : { ...p, maximised: { restore: p.rect }, rect: { ...rect, id }, z: nextZ(panelsRef.current) }))
  }, [setPanelFlag, goToViewport])
  const restorePanel = useCallback((id: string) => setPanelFlag(id, (p) => (p.maximised === undefined ? null : { ...strip(p, 'maximised'), rect: p.maximised.restore })), [setPanelFlag])
  // M130. The fourth layout mark, through the same one-history-entry door the
  // other three take. Absent stays absent: expanding DELETES the key rather
  // than writing `skillTrail: undefined`, which survives IPC and reads as
  // present on the next parse.
  const toggleSkillTrail = useCallback((id: string) => setPanelFlag(id, (p) => (
    p.skillTrail === 'collapsed' ? strip(p, 'skillTrail') : { ...p, skillTrail: 'collapsed' as const }
  )), [setPanelFlag])

  // Frozen on a SIGNATURE of the marks, not on `panels`: a drag rebuilds the
  // array at 60Hz, and a context value that changed with it would re-render
  // every frame consuming it (the rail's own freeze, applied here).
  // M203/M204 (D08). EVERY TASK'S MEMBERS, built ONE way for the three verbs,
  // the lens and the ⋯ menu — derived from what the canvas already holds and
  // never stored. A plain function, not a hook: each caller passes the panels
  // it means (the DISPLAYED ones) and reads it at its own moment.
  const taskMemberships = (shown: readonly Panel[], items: readonly PersistedWorkItem[]): TaskMembership[] => {
    const cwdOf = (id: string): string | undefined => {
      const live = getLiveSession(id)?.cwd
      if (live !== undefined) return live
      const p = shown.find((q) => q.rect.id === id)
      if (p !== undefined && isChatPanel(p)) return p.chat.cwd
      // The panel's OWN spec, never only the registry: a restored terminal is
      // DORMANT (no session, no PTY) until touched, and reading the registry
      // alone dropped every sleeping terminal in the lane out of its task —
      // `task.show.1` found it on its first real press.
      if (p !== undefined && isTerminalPanel(p)) return p.spec.cwd
      return registry.get(id)?.spec.cwd
    }
    // The LANE comes from the handoff hook's records, never from
    // `worktreeRows`: the palette's list loads only when ⌘K opens, so reading
    // it made a task's in-lane panels vanish until somebody had opened the
    // palette (task.show.1's second run) — the trap M202's `reviewTaskLane`
    // already names. The origin panel id rides the SAME record (M204's
    // critic: read from the palette's list, a gone origin could not be
    // reported until ⌘K had opened, and a fallback of '' reported a panel
    // with no id as gone).
    const memberships = items.map((item) => {
      const lane = taskLaneOf(item.id)
      return taskMembership({ item, panels: shown, cwdOf, runs, ...(lane === undefined ? {} : { lane: { path: lane.path, panelId: lane.panelId } }) })
    })
    return memberships
  }
  // Presence: this window's cursor, viewport, selection and mode, to main at
  // 15Hz for the active workspace's awareness (renderer/presence/). It creates
  // no ref any earlier hook depends on. It sits AFTER taskMemberships, which
  // presenceTask calls during render: placed beside activeWorkspaceId it read
  // that const inside its temporal dead zone, and the canvas threw
  // `Cannot access 'taskMemberships' before initialization` on the first
  // render with a focused panel (verify:panels:core 6 found it).
  // The task for the Team view's tile: the focused panel's task, else the one
  // in progress — the same "focused" pick Orchestrate's taskMemberIds makes.
  const presenceTask = useMemo(() => {
    const own = focusedId === null ? undefined : taskMemberships(panels, workItems).find((m) => m.members.some((x) => x.panelId === focusedId))
    const item = (own === undefined ? undefined : workItems.find((w) => w.id === own.itemId))
      ?? workItems.find((w) => w.state === WORK_ITEM_STATES[1])
    return item?.title ?? ''
  }, [focusedId, panels, workItems])
  // M426: in the room, what a person is looking at is the robot they picked — teammates see that.
  const worldPicked = useSelectedAgent()
  usePresenceReport({
    hostRef, workspaceId: activeWorkspaceId, viewport, focusedId: worldOn && worldPicked !== null ? worldPicked : focusedId, selectedIds: selectedPanelIds,
    mode: annotating ? 'annotate' : merged ? 'merged' : worldOn ? 'world' : chrome.centerView,
    currentTask: presenceTask
  })
  // M303 (Quiet instrument). The hulls are computed at EVERY tier now: far
  // out they are M270's filled silhouettes; nearer in, the task ones are
  // drawn as quiet dashed regions (TaskClusterLayer's `region`), so a task
  // reads as one place on the canvas at the distance you work at. Groups are
  // left out near in — GroupLayer already frames them there.
  const clusterHulls = useMemo(() => {
    return taskClusters({
      panels: displayPanels.map((p) => ({
        id: p.rect.id,
        rect: p.rect,
        tone: panelState(
          { kind: p.kind, status: isTerminalPanel(p) ? registry.get(p.rect.id)?.status : undefined, dormant: dormantIds.has(p.rect.id) },
          getAgentState(p.rect.id)
        ).tone
      })),
      memberships: taskMemberships(displayPanels, workItems),
      titles: Object.fromEntries(workItems.map((i) => [i.id, i.title])),
      groups: groups.map((g) => ({ id: g.id, title: g.label, panelIds: g.panelIds }))
    })
  }, [cardDetail, displayPanels, workItems, groups, dormantIds, version, runs, taskLaneOf])
  // M402. For the placer (onSpawn's `placer`), which is declared above this and reads it at press time.
  clusterHullsRef.current = clusterHulls
  // M204 (D08). THE TASK LENS — a VIEW state, never persisted (M106's flip is
  // the precedent). Derived as the task's panels change, and cleared when the
  // task leaves the board — which includes switching to a workspace whose
  // board does not hold it, since Canvas is not remounted per workspace.
  const [relatedItemId, setRelatedItemId] = useState<string | null>(null)
  // #10. The collapsed resume line lives exactly as long as the lens it rides.
  useEffect(() => { if (relatedItemId === null) setResumedNext(null) }, [relatedItemId])
  const lens = useMemo(() => {
    if (relatedItemId === null) return null
    const item = workItems.find((i) => i.id === relatedItemId)
    return item === undefined ? null : (taskMemberships(displayPanels, [item])[0] ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relatedItemId, displayPanels, workItems, worktreeRows, runs])
  // M303 (Quiet instrument). The navigator groups by TASK at rest, not only
  // while a lens is lit: the lit lens wins, otherwise the one task the
  // selection belongs to. A selection in several tasks (or none) falls back
  // to the by-kind places — guessing one of many would mislabel the rest.
  const navTask = useMemo(() => {
    if (lens !== null) return lens
    if (selectedId === null) return null
    const owners = taskMemberships(displayPanels, workItems).filter((m) => m.members.some((x) => x.panelId === selectedId))
    return owners.length === 1 ? owners[0]! : null
  }, [lens, selectedId, displayPanels, workItems])
  // Keyed on a SIGNATURE string, never on `lens` itself: the lens is
  // re-derived from `displayPanels`, a new array on every frame of a drag,
  // and the marks context below is frozen precisely so a drag re-renders no
  // frame (M204's critic). The same members with the same reasons are the
  // same map.
  const lensSignature = lens === null ? null : lens.members.map((m) => `${m.panelId}=${m.reason}`).join(',')
  const lensMap = useMemo(() => (lensSignature === null ? null : new Map(lensSignature === '' ? [] : lensSignature.split(',').map((e) => e.split('=') as [string, string]))), [lensSignature])
  useEffect(() => { if (relatedItemId !== null && !workItems.some((i) => i.id === relatedItemId)) setRelatedItemId(null) }, [relatedItemId, workItems])
  // M264. Escape clears the sticky stage when the lens is lit — but never when
  // the key belongs to a focused terminal (`.xterm`), an open text draft, or
  // chrome that already owns Escape (shouldIgnoreKeys). Stealing agent Escape
  // is the paste defect M204 deliberately avoided.
  useEffect(() => {
    if (relatedItemId === null) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      if (shouldIgnoreKeys()) return
      const active = document.activeElement
      if (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement || active instanceof HTMLSelectElement || (active instanceof HTMLElement && active.isContentEditable)) return
      if (active instanceof Element && active.closest('.xterm') !== null) return
      event.preventDefault()
      setRelatedItemId(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [relatedItemId, shouldIgnoreKeys])
  // M204 (D08). The ⋯ menu's task section asks this at the moment it opens.
  // A ref, so the marks object below keeps ONE identity and no frame
  // re-renders for a membership it is not showing.
  const taskMenuRef = useRef<(id: string) => TaskMenuFact>(() => ({ kind: 'none' }))
  taskMenuRef.current = (id) => {
    const items = workItemsRef.current
    const owners = taskMemberships(displayPanelsRef.current, items).filter((m) => m.members.some((x) => x.panelId === id))
    const title = (m: TaskMembership): string => items.find((i) => i.id === m.itemId)?.title ?? m.itemId
    if (owners.length === 0) return { kind: 'none' }
    if (owners.length > 1) return { kind: 'many', titles: owners.map(title) }
    return { kind: 'one', title: title(owners[0]!), related: owners[0]!.itemId === relatedItemId }
  }
  // Brief #19. The ⋯ menu's advanced doors: what is true of this panel, asked
  // when the menu opens (a ref, the task section's reason), and the palette
  // verb each door runs — no new action, only a new moment to offer it.
  const advancedRef = useRef<(id: string) => AdvancedDoor[]>(() => [])
  advancedRef.current = (id) => {
    const all = displayPanelsRef.current
    const p = all.find((x) => x.rect.id === id)
    if (p === undefined) return []
    const cwd = isTerminalPanel(p) ? p.spec.cwd : isChatPanel(p) ? p.chat.cwd : undefined
    const owners = taskMemberships(all, workItemsRef.current).filter((m) => m.members.some((x) => x.panelId === id))
    return advancedDoors({
      kind: p.kind,
      agentic: isChatPanel(p) || (isTerminalPanel(p) && p.spec.agent !== undefined),
      hasCwd: cwd !== undefined && cwd !== '',
      teammate: isChatPanel(p) && p.chat.teammateId !== undefined,
      taskMembers: owners.length === 1 ? owners[0]!.members.length : 0,
      watched: cwd !== undefined && all.some((x) => isWatcherPanel(x) && x.watch.cwd === cwd)
    })
  }
  const advancedVerbs = useMemo(() => ({
    of: (id: string) => advancedRef.current(id),
    run: (id: string, door: AdvancedDoorId) => {
      const a = paletteActionsRef.current
      if (a === null || a === undefined) return
      if (door === 'teammate') a.openTeammates()
      else if (door === 'skill') a.openToolbox(id)
      else if (door === 'workflow') void a.createObject('workflow')
      else if (door === 'watcher') { onFocusPanel(id); focusedIdRef.current = id; a.beginWatcher() }
      else {
        const owner = taskMemberships(displayPanelsRef.current, workItemsRef.current).find((m) => m.members.some((x) => x.panelId === id))
        a.beginSaveTemplate(owner === undefined ? [id] : owner.members.map((x) => x.panelId))
      }
    }
  }), [onFocusPanel])
  // #17. The approval detail's Task line — the same membership the ⋯ menu
  // reads, through its ref, so the Dock's memo sees ONE function for the life
  // of the canvas.
  const approvalTaskOf = useCallback((panelId: string): string | undefined => {
    const fact = taskMenuRef.current(panelId)
    return fact.kind === 'one' ? fact.title : fact.kind === 'many' ? fact.titles.join(', ') : undefined
  }, [])
  const taskVerbs = useMemo(() => {
    const speak = (r: { kind: 'ran'; note?: string; partial?: true } | { kind: 'refused'; reason: string } | undefined): void => {
      if (r !== undefined && (r.kind === 'refused' || ('partial' in r && r.partial === true))) paletteActionsRef.current?.say(r.kind === 'refused' ? r.reason : (r.note ?? ''))
    }
    return {
      of: (id: string) => taskMenuRef.current(id),
      show: (id: string) => speak(paletteActionsRef.current?.showTask(id)),
      related: (id: string) => speak(paletteActionsRef.current?.showRelated(id)),
      arrange: (id: string) => speak(paletteActionsRef.current?.arrangeTask(id)),
      // M324. The member's ONE task (the menu offers the verb only then).
      focus: (id: string) => {
        const owner = taskMemberships(displayPanelsRef.current, workItemsRef.current).filter((m) => m.members.some((x) => x.panelId === id))
        if (owner.length === 1) openFocusTaskRef.current(owner[0]!.itemId)
      }
    }
  }, [])
  const marksSignature = panels.map((p) => (p.locked === true || p.pinned === true || p.maximised !== undefined || p.skillTrail === 'collapsed' ? `${p.rect.id}:${p.locked === true ? 'L' : ''}${p.pinned === true ? 'P' : ''}${p.maximised !== undefined ? 'M' : ''}${p.skillTrail === 'collapsed' ? 'T' : ''}` : '')).filter((s) => s !== '').join(',')
  const panelMarks = useMemo<PanelMarks>(() => ({
    marks: new Map(marksSignature === '' ? [] : marksSignature.split(',').map((entry) => {
      const [id, flags] = entry.split(':') as [string, string]
      return [id, { locked: flags.includes('L'), pinned: flags.includes('P'), maximised: flags.includes('M'), trailCollapsed: flags.includes('T') }] as const
    })),
    maximise: maximisePanel,
    restore: restorePanel,
    // M130. The capsule's verb. Present for every kind, because the frame
    // decides whether to paint a capsule from the TRAIL, not from the kind.
    toggleTrail: toggleSkillTrail,
    readOnly: merged,
    // M106. The ⋯ menu's door: the ref is set HERE as well as by the render,
    // because openPalette captures the ref synchronously and the focus it just
    // asked for lands a render later.
    more: (id) => { onFocusPanel(id); focusedIdRef.current = id; palette.openPalette() },
    // M204 (D08). The lens rides the one context every kind's frame reads, so
    // a terminal, a chat and a card dim on ONE rule.
    lens: lensMap,
    task: taskVerbs,
    advanced: advancedVerbs
  }), [marksSignature, maximisePanel, restorePanel, toggleSkillTrail, merged, onFocusPanel, palette, lensMap, taskVerbs, advancedVerbs])


  return { approvalTaskOf, clusterHulls, lens, lockPanel, maximisePanel, navTask, panelMarks, pinPanel, relatedItemId, restorePanel, setRelatedItemId, strip, taskMemberships, taskMenuRef, unlockPanel, unpinPanel }
}
