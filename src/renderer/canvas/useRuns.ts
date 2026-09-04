import { useCallback, useRef, type MutableRefObject, type Dispatch, type SetStateAction } from 'react'
import type { Panel } from '@renderer/panels/panels'
import { isTerminalPanel, isChatPanel, linksOf } from '@renderer/panels/panels'
import type { PersistedRun } from '@shared/runs'
import { RUNS_MAX } from '@shared/runs'
import type { PanelUsage } from '@shared/cost'
import type { PanelSpecTemplate } from '@renderer/session/panel-session'
import { railLabel } from '@renderer/shell/rail-rows'
import { getUsage } from '@renderer/session/usage-store'
import {
  beginRun, componentOf, finishRun, recordRunEvent, runCostSince, runIsComplete, runName, type RunComponent, type RunEvent
} from './run-model'

/**
 * M79. THE RUN RECORDER. Observes the handoff hook's events and never
 * decides anything: a `fired` from a panel with an enabled outgoing edge and
 * no open run opens one for its component; every event lands on the open run
 * whose component holds the panel; the run seals — time and cost — when it
 * is complete. At most one open run per component.
 *
 * The runs live in Canvas state and are saved with the layout, like
 * bookmarks. What lives HERE, in refs, is what must not be persisted and
 * must not be recomputed: each open run's component (derived from the panels
 * at the run's start, so an edge changed mid-run does not move the
 * goalposts) and each open run's usage baseline (so a second run is not
 * billed for the first one's tokens). Every ref write happens OUTSIDE the
 * state updater — React may replay an updater, and a replayed one that had
 * already deleted its component would open a duplicate run (M79's verifier).
 */
export interface RunsDeps {
  panelsRef: MutableRefObject<Panel[]>
  /** The runs as they are NOW: every decision here is made synchronously against it. */
  runsRef: MutableRefObject<PersistedRun[]>
  setRuns: Dispatch<SetStateAction<PersistedRun[]>>
  restartWithSpec: (id: string, spec: PanelSpecTemplate) => void
}

export interface RunsApi {
  onRunEvent: (event: RunEvent) => void
  /** Restart the run's terminal roots in order; a chat root is skipped by name. Returns the sentence. */
  runAgain: (runId: string, runs: readonly PersistedRun[]) => string
  /** Forget every open run's component — a workspace switch replaces the panels. */
  forgetOpen: () => void
  /** Whether any run is open, for the rail's ticking duration. */
  hasOpen: () => boolean
}

interface OpenRun {
  component: RunComponent
  baseline: Map<string, PanelUsage>
}

export function useRuns(deps: RunsDeps): RunsApi {
  const { panelsRef, runsRef, setRuns, restartWithSpec } = deps
  const openRef = useRef<Map<string, OpenRun>>(new Map())
  // Roots this app is restarting on purpose: the kill's own exit is not a
  // run's fire, and recording it would write a `failed` run on every
  // Run again and every manual restart of a source (M79's verifier).
  // NO restart suppression, and the reason is M6c's: PtyManager does not emit
  // `exited` for a session it killed, so a deliberate restart (Run again, the
  // palette's Restart) produces no exit event and cannot open a spurious run.
  // A guard here would swallow the panel's next REAL exit instead — the
  // harness watched it do exactly that.

  const usageOf = (panelIds: readonly string[]): Map<string, PanelUsage> => {
    const out = new Map<string, PanelUsage>()
    for (const id of panelIds) { const u = getUsage(id); if (u) out.set(id, u) }
    return out
  }

  /**
   * Decided synchronously against `runsRef`, and the ref writes happen here
   * beside it — never inside a `setRuns` updater. React runs an updater at
   * render time and may replay it, so a seal decided in there released its
   * component too late (the run stayed open for ever and every later fire
   * landed on it) or, on a replay, twice. M79's own harness caught it.
   */
  const onRunEvent = useCallback((event: RunEvent) => {
    const panels = panelsRef.current
    const current = runsRef.current
    let runId: string | undefined
    for (const [id, open] of openRef.current) if (open.component.panelIds.includes(event.panelId)) { runId = id; break }
    let next: PersistedRun[]
    let component: RunComponent
    let baseline: Map<string, PanelUsage>
    if (runId === undefined) {
      if (event.kind !== 'fired') return
      // Cheap gate first: every idle tick of every terminal arrives here, and
      // a component walk per tick would be paid by panels with no edges.
      const self = panels.find((p) => p.rect.id === event.panelId)
      if (!self || !linksOf(self).some((l) => l.automation?.kind === 'handoff' && l.automation.enabled)) return
      component = componentOf(panels, event.panelId)
      if (!component.edges.some((e) => e.from === event.panelId)) return
      baseline = usageOf(component.panelIds)
      let run = beginRun(component, event.panelId, event.at, runName(current))
      run = recordRunEvent(run, event)
      runId = run.id
      openRef.current.set(run.id, { component, baseline })
      next = [run, ...current].slice(0, RUNS_MAX)
    } else {
      const open = openRef.current.get(runId) as OpenRun
      component = open.component
      baseline = open.baseline
      next = current.map((r) => (r.id === runId ? recordRunEvent(r, event) : r))
    }
    const run = next.find((r) => r.id === runId)
    if (run !== undefined && runIsComplete(run, component)) {
      openRef.current.delete(runId)
      const sealed = finishRun(run, event.at, runCostSince(run.panelIds, usageOf(run.panelIds), baseline))
      next = next.map((r) => (r.id === runId ? sealed : r))
    }
    runsRef.current = next
    setRuns(next)
  }, [panelsRef, runsRef, setRuns])

  const runAgain = useCallback((runId: string, runs: readonly PersistedRun[]): string => {
    const run = runs.find((r) => r.id === runId)
    if (!run) return 'that run is gone'
    if (run.endedAt === undefined) return 'this run is still running'
    const panels = panelsRef.current
    // The roots in the run's own order — the order its panels were recorded in.
    const roots = run.panelIds.filter((id) => !run.edges.some((e) => e.to === id))
    let restarted = 0
    const skipped: string[] = []
    for (const id of roots) {
      const p = panels.find((x) => x.rect.id === id)
      if (!p) { skipped.push(`${id} is gone`); continue }
      if (isChatPanel(p)) { skipped.push(`${railLabel(p, undefined)} is a chat — re-run it by sending a message`); continue }
      if (!isTerminalPanel(p)) { skipped.push(`${railLabel(p, undefined)} has no process`); continue }
      restartWithSpec(id, p.spec)
      restarted += 1
    }
    return `${restarted} root${restarted === 1 ? '' : 's'} restarted${skipped.length > 0 ? ` · ${skipped.join('; ')}` : ''}`
  }, [panelsRef, restartWithSpec])

  const forgetOpen = useCallback(() => { openRef.current.clear() }, [])
  const hasOpen = useCallback(() => openRef.current.size > 0, [])

  return { onRunEvent, runAgain, forgetOpen, hasOpen }
}
