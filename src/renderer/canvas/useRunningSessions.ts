import { type Dispatch, type SetStateAction, useEffect, useMemo } from 'react'
import { type Panel, type TerminalPanel, isTerminalPanel } from '@renderer/panels/panels'
import { applyMachineCosts } from '@renderer/session/machine-cost-store'
import type { MachineCostTarget } from '@shared/machine-cost'
import { MACHINE_COST_SAMPLE_MS } from './canvas-constants'
import { railLabel } from '../shell/rail-rows'
import type { LinkMode } from './useLinkMode'
import type { Registry } from '@renderer/session/session-registry'

/**
 * M507 (E4, the Canvas.tsx split). What reads the running sessions: the
 * machine-cost sampling schedule, the link banner's source name, the memo
 * that ensures a session for every terminal panel, and the broadcast targets
 * with the effect that arms them. Lifted out of Canvas VERBATIM as one
 * contiguous run and called at exactly the position it occupied, with one
 * destructured Deps object so every dependency array names the same values.
 */
export interface UseRunningSessionsDeps {
  registry: Registry
  broadcastInput: boolean
  dormantIds: ReadonlySet<string>
  linkMode: LinkMode
  merged: boolean
  panels: Panel[]
  selectedIds: ReadonlySet<string>
  setBroadcastInput: Dispatch<SetStateAction<boolean>>
  terminalPanels: TerminalPanel[]
  version: number
}

export function useRunningSessions(deps: UseRunningSessionsDeps) {
  const {
    broadcastInput, dormantIds, linkMode, merged, panels, selectedIds, setBroadcastInput, terminalPanels, version, registry
  } = deps
  // Main reads ONE process table for this whole list, then walks each root's
  // descendants there. The renderer owns this low-frequency schedule because
  // closing or switching a canvas should stop the work immediately; neither
  // the registry nor a module-level main timer can know that fact.
  const machineCostTargets = useMemo<MachineCostTarget[]>(() => panels.flatMap((panel) => {
    if (!isTerminalPanel(panel)) return []
    const status = registry.get(panel.rect.id)?.status
    return status?.kind === 'running' ? [{ panelId: panel.rect.id, pid: status.pid }] : []
  }), [panels, version])

  useEffect(() => {
    let current = true
    let inFlight = false
    const sample = (): void => {
      if (inFlight) return
      if (machineCostTargets.length === 0) {
        applyMachineCosts({ panels: [], total: { cpuPercent: 0, memoryBytes: 0 } })
        return
      }
      inFlight = true
      void window.canvas.machine.sample(machineCostTargets).then((snapshot) => {
        if (current) applyMachineCosts(snapshot)
      }).catch((error: unknown) => {
        // A ps failure is normally a transient process-table race. Keep the
        // prior reading until the next tick rather than turning it into zero.
        console.warn('[machine-cost] could not sample process trees', error)
      }).finally(() => {
        inFlight = false
      })
    }
    sample()
    const timer = window.setInterval(sample, MACHINE_COST_SAMPLE_MS)
    return () => {
      current = false
      window.clearInterval(timer)
    }
  }, [machineCostTargets])

  // What the banner calls the source panel. railLabel is the honest chain's
  // one reader — the panel header, the rail row, the attention section and
  // the inspector's link rows all go through it — so the banner reads it too
  // rather than becoming a fifth re-derivation that says `/bin/zsh` where
  // every other surface says `auth refactor`. Falls back to the bare id only
  // if the panel is gone, which a disarm makes very short-lived.
  const linkSourceName = useMemo(() => {
    if (linkMode.from === null) return ''
    const panel = panels.find((p) => p.rect.id === linkMode.from)
    return panel ? railLabel(panel, registry.get(panel.rect.id)?.status) : linkMode.from
  }, [linkMode.from, panels, version])

  // Sessions exist for every panel; only their tier changes. In a memo rather
  // than an effect: ensure() runs synchronously during render (so a session
  // exists by the time this same render tries to look one up below) and
  // deliberately never calls bump() — notifying a useSyncExternalStore
  // subscriber mid-render is what React's "update while rendering another
  // component" warning is about. The panel list living in React state is
  // already what triggers this render, so nothing is lost by not bumping.
  useMemo(() => {
    for (const panel of terminalPanels) {
      registry.ensure(panel.rect.id, panel.spec, { dormant: dormantIds.has(panel.rect.id) })
    }
  }, [terminalPanels, dormantIds])

  // Only sessions that are already running can be broadcast targets. This is
  // a filter over the existing registry, never a call to ensure/wake, so an
  // inactive selection remains inactive when the mode is armed.
  const broadcastTargetIds = useMemo(() => (
    merged
      ? []
      : terminalPanels
        .filter((panel) => {
          const session = registry.get(panel.rect.id)
          return selectedIds.has(panel.rect.id) && session?.status.kind === 'running'
        })
        .map((panel) => panel.rect.id)
  ), [merged, selectedIds, terminalPanels, version])
  const broadcastReady = broadcastTargetIds.length >= 2

  useEffect(() => {
    if (!broadcastInput || !broadcastReady) {
      registry.setInputTargets([])
      if (broadcastInput && !broadcastReady) setBroadcastInput(false)
      return
    }
    registry.setInputTargets(broadcastTargetIds)
    return () => registry.setInputTargets([])
  }, [broadcastInput, broadcastReady, broadcastTargetIds])

  return { broadcastReady, broadcastTargetIds, linkSourceName }
}
