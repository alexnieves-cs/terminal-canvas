import { type Dispatch, type RefObject, type SetStateAction, useCallback, useEffect, useRef, useState } from 'react'
import type { EnvReport } from '@shared/env-report'
import type { PaletteActions, PresetRow } from '@renderer/palette/commands'
import { type Panel, isTerminalPanel, isChatPanel, addLink, workCardItemId } from '@renderer/panels/panels'
import { type PersistedWorkItem, WORK_ITEM_STATES, carryWorkItem } from '@shared/work-items'
import type { PresetTemplate, WorkspaceRow } from '@shared/ipc-contract'
import { allowPendingTarget } from '@renderer/palette/commands/approval-row'
import { criteriaChecklist } from '@renderer/panels/session-facts'
import { applyMakeTask } from '@renderer/panels/make-task'
import { setConnectedOpener, spawnCursor, type ConnectedRequest } from '@renderer/panels/spawn-cursor'
import { probesFromReport, type OnboardingAnswers } from '@shared/onboarding'
import { focusLocked, matchShortcut } from '@shared/shortcuts'
import { openSettingsPage } from '@renderer/settings/open'
import type { JumpDirection } from './attention'
import type { Point } from './viewport'
import { type StartupInput, restoreLines, type RestoreFacts } from './splash'
import { regionsFromMemberships } from './task-regions'
import { toggleWorld, isWorldOn } from '../world/world-toggle'
import { labOn } from '../labs/useLabs'

import type { InspectorModel } from '@renderer/shell/inspector-fields'
import type { PendingApproval } from '@renderer/shell/rail-sections'
import type { TaskMembership } from './task-members'
/**
 * M507 (E4, the Canvas.tsx split). The hooks M442 appended below everything
 * else: the lane chords, pause and hand-off, Make task, the connected-object
 * spawn, the task regions and criteria, the restore card, onboarding, and
 * moving sessions into a task. Lifted out of Canvas VERBATIM as one contiguous
 * run and called at exactly the position it occupied, so it is still the last
 * run of hooks before the JSX; a hook appended after M442's rule goes below
 * this call.
 */
export interface UseShellTailDeps {
  commitHistory: (next: Panel[]) => void
  displayPanels: Panel[]
  envReport: EnvReport | null
  inspectorModel: InspectorModel | null
  mergedRef: RefObject<boolean>
  nextIdRef: RefObject<number>
  onJumpAttention: (direction: JumpDirection) => void
  onSpawn: (centre: Point, template?: PresetTemplate, opening?: { title?: string; context?: string; focus?: true; exact?: true; atCursor?: true; }) => void
  paletteActionsRef: RefObject<PaletteActions | null>
  panelsRef: RefObject<Panel[]>
  pendingApprovals: PendingApproval[]
  presetRows: PresetRow[]
  reloadPresets: () => void
  reloadWorkspaces: () => void
  selectedIdsRef: RefObject<ReadonlySet<string>>
  setPanels: Dispatch<SetStateAction<Panel[]>>
  setWorkItems: Dispatch<SetStateAction<PersistedWorkItem[]>>
  shouldIgnoreKeys: () => boolean
  shouldIgnoreKeysButLock: () => boolean
  startup: StartupInput | undefined
  taskMemberships: (shown: readonly Panel[], items: readonly PersistedWorkItem[]) => TaskMembership[]
  waitingIds: string[]
  workItems: PersistedWorkItem[]
  workItemsRef: RefObject<PersistedWorkItem[]>
  workspaceRows: WorkspaceRow[]
  worldCentre: () => Point
}

export function useShellTail(deps: UseShellTailDeps) {
  const {
    commitHistory, displayPanels, envReport, inspectorModel, mergedRef, nextIdRef, onJumpAttention, onSpawn, paletteActionsRef, panelsRef, pendingApprovals, presetRows, reloadPresets, reloadWorkspaces, selectedIdsRef, setPanels, setWorkItems, shouldIgnoreKeys, shouldIgnoreKeysButLock, startup, taskMemberships, waitingIds, workItems, workItemsRef, workspaceRows, worldCentre
  } = deps
  const laneChordRef = useRef({ approvals: pendingApprovals, waiting: waitingIds })
  laneChordRef.current = { approvals: pendingApprovals, waiting: waitingIds }
  const onPausePanel = useCallback((id: string) => { void window.canvas.agentSession.interrupt(id) }, [])
  const onHandOffPanel = useCallback((id: string) => { paletteActionsRef.current?.beginLink(id) }, [])
  const makeTaskRef = useRef<() => void>(() => {})
  makeTaskRef.current = () => {
    if (mergedRef.current) return
    const selected = [...selectedIdsRef.current]
    if (selected.length === 0) return
    const cardId = `n${nextIdRef.current++}`
    const itemId = `w${nextIdRef.current++}`
    const now = Date.now()
    const named = panelsRef.current.find((panel) => panel.rect.id === selected[0])
    const title = named !== undefined && named.title !== undefined && named.title !== '' ? named.title : 'Task'
    const item = { id: itemId, source: 'typed' as const, title, state: WORK_ITEM_STATES[1], createdAt: now, updatedAt: now }
    setWorkItems((items) => items.some((row) => row.id === item.id) ? items : [...items, item])
    setPanels((current) => {
      const result = applyMakeTask({ panels: current, selectedIds: selected, cardId, itemId, now, title })
      if (result === null) return current
      commitHistory(result.panels)
      return result.panels
    })
  }
  const [connectedSpawn, setConnectedSpawn] = useState<ConnectedRequest | null>(null)
  useEffect(() => {
    setConnectedOpener(setConnectedSpawn)
    return () => setConnectedOpener(null)
  }, [])
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const hit = matchShortcut({ metaKey: event.metaKey, altKey: event.altKey, shiftKey: event.shiftKey, ctrlKey: event.ctrlKey, code: event.code })
      // ⌘⇧W is the registry's `world` chord. It is handled before shouldIgnoreKeys
      // so it still fires while the world covers the canvas; a locked panel keeps the key.
      if (hit?.id === 'world') {
        if (focusLocked()) return
        event.preventDefault()
        // M496. Hidden by the cut list: the chord still LEAVES a room, never enters one.
        if (!labOn('world') && !isWorldOn()) return
        if (!event.repeat) toggleWorld()
        return
      }
      // ⌘J / ⌘⇧J under a focus lock: useViewport declines them (its predicate
      // includes the lock), so they are taken here, and only here, in that case.
      if ((hit?.id === 'jump' || hit?.id === 'jump-prev') && focusLocked() && !shouldIgnoreKeysButLock()) {
        event.preventDefault()
        if (!event.repeat) onJumpAttention(hit.id === 'jump-prev' ? -1 : 1)
        return
      }
      // ⌘Y passes a focus lock too (the same amendment), so it is judged by
      // the predicate without the lock, ahead of the general stand-down.
      if (hit?.id === 'allow' && !shouldIgnoreKeysButLock()) {
        event.preventDefault()
        const selected = selectedIdsRef.current
        const target = allowPendingTarget({
          selectionEmpty: selected.size === 0,
          selectedId: selected.size === 1 ? [...selected][0] ?? null : null,
          approvals: laneChordRef.current.approvals,
          queueHeadId: laneChordRef.current.waiting[0] ?? null
        })
        if (target !== null) paletteActionsRef.current?.answerApproval(target.panelId, target.requestId, true)
        return
      }
      if (shouldIgnoreKeys()) return
      if (hit?.id === 'make-task') {
        event.preventDefault()
        makeTaskRef.current()
        return
      }
      // The UX pass. ⌘/ is the shortcut sheet every Mac app has: Settings ›
      // Keyboard, which already prints the one registry with search.
      if (hit?.id === 'shortcuts') {
        // An editor's own ⌘/ (comment a line) and a terminal's keep the key.
        const at = event.target instanceof Element ? event.target : null
        if (at?.closest('input, textarea, [contenteditable="true"], .monaco-editor, .xterm') != null) return
        event.preventDefault()
        if (!event.repeat) openSettingsPage('keyboard')
        return
      }
      if (hit?.id === 'new-shell') {
        event.preventDefault()
        const selected = selectedIdsRef.current
        const only = selected.size === 1 ? panelsRef.current.find((panel) => panel.rect.id === [...selected][0]) : undefined
        const cwd = only !== undefined && isTerminalPanel(only) ? only.spec.cwd : only !== undefined && isChatPanel(only) ? only.chat.cwd : '~'
        onSpawn(spawnCursor() ?? worldCentre(), { cwd, args: [] }, { focus: true, atCursor: true })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shouldIgnoreKeys, shouldIgnoreKeysButLock, onJumpAttention, onSpawn, worldCentre])

  const taskRegions = regionsFromMemberships(
    taskMemberships(displayPanels, workItems),
    displayPanels.map((panel) => ({
      panelId: panel.rect.id,
      rect: panel.rect,
      agent: isChatPanel(panel) || (isTerminalPanel(panel) && panel.spec.agent !== undefined)
    })),
    Object.fromEntries(workItems.map((item) => [item.id, {
      ticket: item.key ?? null,
      title: item.title,
      criteriaDone: item.criteriaMet?.length ?? 0,
      criteriaTotal: item.criteria?.length ?? 0
    }]))
  )
  const taskCriteria = inspectorModel === null ? null : (() => {
    const itemId = taskMemberships(displayPanels, workItems).find((membership) => membership.members.some((member) => member.panelId === inspectorModel.id))?.itemId
    const item = itemId === undefined ? undefined : workItems.find((candidate) => candidate.id === itemId)
    if (item?.criteria === undefined || item.criteria.length === 0) return null
    return criteriaChecklist(item.criteria, item.criteriaMet ?? [])
  })()

  // R-021. New hooks sit here, immediately before the return, so nothing
  // above them changes order. The APEX splash stays on splashMode. The
  // restore card is a second surface and stays up while a live boot is
  // unsettled, including when that mode is 'none'.
  const [restoreFacts, setRestoreFacts] = useState<RestoreFacts | null>(null)
  const [restoreLeft, setRestoreLeft] = useState(false)
  useEffect(() => {
    const boot = window.canvas.boot
    if (boot === undefined) return
    return boot.onProgress((event) => {
      setRestoreFacts((prev) => ({
        ...(prev ?? {}),
        ...(event.workspace !== undefined ? { workspace: event.workspace } : {}),
        ...(event.layout !== undefined ? { layout: event.layout } : {}),
        ...(event.tmux !== undefined ? { tmux: event.tmux } : {}),
        ...(event.agentsPlanned !== undefined ? { agentsPlanned: event.agentsPlanned } : {}),
        ...(event.agentsFound !== undefined ? { agentsFound: [...event.agentsFound] } : {}),
        ...(event.failed !== undefined ? { failed: event.failed } : {}),
        ...(event.optionHeld === true ? { optionHeld: true } : {})
      }))
    })
  }, [])
  const restoreOpen = restoreFacts !== null && !restoreLeft && !restoreLines(restoreFacts).settled
  const [onboardingDone, setOnboardingDone] = useState(() => {
    try { return window.localStorage.getItem('tc.onboarding.done') === '1' } catch { return false }
  })
  // R-034. The crash card already keeps the panel id. Restart is the canvas door.
  useEffect(() => {
    const door = (window as unknown as { __rdLF?: { onRestart?: (id: string) => void } }).__rdLF
    if (door === undefined) return
    const previous = door.onRestart
    door.onRestart = (id) => { paletteActionsRef.current?.restartPanel(id) }
    return () => { door.onRestart = previous }
  }, [])
  const showOnboarding = startup !== undefined && startup.harnessOff !== true && startup.lastVersion === null && !onboardingDone
  const finishOnboarding = (): void => {
    try { window.localStorage.setItem('tc.onboarding.done', '1') } catch { /* the card may return next launch */ }
    setOnboardingDone(true)
  }
  // The card's answers are SAVED, not just read: a renamed workspace keeps the
  // name, and the first agent turned on becomes ⌘N. Claude and Codex are
  // built-in presets already, so "turned on" is choosing the default — no
  // preset is minted. None turned on leaves ⌘N where it was. Then the last
  // step does what its copy says and opens the new-task sheet.
  const completeOnboarding = (answers: OnboardingAnswers): void => {
    finishOnboarding()
    const active = workspaceRows.find((w) => w.active)
    if (active !== undefined && answers.workspaceName !== '' && answers.workspaceName !== active.name) {
      void window.canvas.workspace.rename(active.id, answers.workspaceName)
        .catch((error: unknown) => { console.warn('[onboarding] could not rename the workspace', error) })
        .finally(reloadWorkspaces)
    }
    const first = answers.enabled.find((id) => presetRows.some((p) => p.id === id && p.builtIn))
    if (first !== undefined) {
      void window.canvas.preset.setDefault(first).then(reloadPresets, (error: unknown) => { console.warn('[onboarding] could not set the default agent', error) })
    }
    paletteActionsRef.current?.beginStartWork()
  }
  const onboardingProbes = probesFromReport(envReport)

  // R-028. A work item names one conversation. That slot is filled only while
  // it is empty — writing over it would replace the lane's chat. Every moved
  // panel is also linked to the task's work card, the same one-hop make-task
  // already uses. There is no second membership list.
  const moveSessionsToTask = (ids: readonly string[], taskId: string): void => {
    if (ids.length === 0) return
    const item = workItemsRef.current.find((row) => row.id === taskId)
    if (item === undefined) return
    const first = ids[0]
    if (item.panelId === undefined && first !== undefined) {
      setWorkItems((current) => current.map((row) => (
        row.id === taskId && row.panelId === undefined
          ? carryWorkItem({ ...row, panelId: first, updatedAt: Date.now() })
          : row
      )))
    }
    const card = panelsRef.current.find((panel) => workCardItemId(panel) === taskId)
    if (card === undefined) return
    setPanels((current) => {
      let next = current
      for (const id of ids) next = addLink(next, id, card.rect.id)
      if (next === current) return current
      commitHistory(next)
      return next
    })
  }


  return { completeOnboarding, connectedSpawn, finishOnboarding, makeTaskRef, moveSessionsToTask, onHandOffPanel, onPausePanel, onboardingDone, onboardingProbes, restoreFacts, restoreOpen, setConnectedSpawn, setRestoreLeft, showOnboarding, taskCriteria, taskRegions }
}
