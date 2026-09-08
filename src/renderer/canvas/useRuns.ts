import { useCallback, useRef, type MutableRefObject, type Dispatch, type SetStateAction } from 'react'
import type { Panel } from '@renderer/panels/panels'
import { isTerminalPanel, isChatPanel, linksOf } from '@renderer/panels/panels'
import type { PersistedRun } from '@shared/runs'
import { RUNS_MAX } from '@shared/runs'
import type { PanelUsage } from '@shared/cost'
import type { PanelSpecTemplate } from '@renderer/session/panel-session'
import { railLabel } from '@renderer/shell/rail-rows'
import { getUsage } from '@renderer/session/usage-store'
import type { AutoStatus } from '@shared/auto'
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
  /**
   * M133. These panel ids were minted by that template. Called once, by
   * M80's instantiation — the only moment anything knows it. The recorder
   * still DECIDES nothing: it stamps the mark on a run it was already going
   * to open, and a panel with no origin leaves the run unmarked rather than
   * guessed into a template's list.
   */
  noteTemplate: (panelIds: readonly string[], templateId: string, snapshot?: { definition: NonNullable<PersistedRun['definition']>; mapping: Record<string, string> }) => void
  /** M97. An auto run IS a run: opened on `running` at turn 0, sealed with its cost on any resolution. */
  onAutoEvent: (panelId: string, status: AutoStatus) => void
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
  // M133. panel id -> the template that minted it. A ref, never state and
  // never persisted: it is read once, when a run opens, and the RUN is what
  // carries the fact onto disk.
  const originRef = useRef<Map<string, string>>(new Map())
  // M184. The shape a run RAN, by MINTED PANEL id — beside `originRef` and on
  // exactly the same key, so the two are read together and cannot disagree.
  //
  // M184 (the critic, finding 6). Keyed by TEMPLATE id it was one slot for
  // every instantiation of a shape: a run opened by panels from an earlier
  // instantiation read the LATEST snapshot, whose mapping named panels this
  // run never held, and the `panelIds.includes` filter below then pruned the
  // whole foreign mapping to `{}` — every block `queued` for work that ran.
  const snapshotRef = useRef<Map<string, { definition: NonNullable<PersistedRun['definition']>; mapping: Record<string, string> }>>(new Map())
  const noteTemplate = useCallback((panelIds: readonly string[], templateId: string, snapshot?: { definition: NonNullable<PersistedRun['definition']>; mapping: Record<string, string> }) => {
    for (const id of panelIds) {
      originRef.current.set(id, templateId)
      if (snapshot !== undefined) snapshotRef.current.set(id, snapshot)
    }
  }, [])
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
      // M133. The mark, if any of this run's panels came from a template.
      // ABSENT stays absent — never written as `templateId: undefined`.
      const originPanel = component.panelIds.find((id) => originRef.current.get(id) !== undefined)
      const templateId = originPanel === undefined ? undefined : originRef.current.get(originPanel)
      if (templateId !== undefined) run = { ...run, templateId }
      // M184. The snapshot rides with the mark, and only the panels this run
      // actually holds are mapped — a mapping naming a panel of another run
      // would light a block this run never touched.
      const snap = originPanel === undefined ? undefined : snapshotRef.current.get(originPanel)
      if (snap !== undefined) {
        const mapping = Object.fromEntries(Object.entries(snap.mapping).filter(([, panelId]) => component.panelIds.includes(panelId)))
        run = { ...run, definition: { ...snap.definition, nodes: snap.definition.nodes.map((n) => ({ ...n })), edges: snap.definition.edges.map((e) => ({ ...e })) }, mapping }
      }
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

  /**
   * M97. The recorder observes an auto run the way it observes a handoff:
   * it never decides. The component is the ONE panel (no edges), the name
   * says the mode, and the seal prices the panel's usage since the start by
   * M79's rule. Decided against the refs, never inside an updater.
   */
  const onAutoEvent = useCallback((panelId: string, status: AutoStatus) => {
    const current = runsRef.current
    let runId: string | undefined
    for (const [id, open] of openRef.current) if (open.component.panelIds.length === 1 && open.component.panelIds[0] === panelId) { runId = id; break }
    const at = Date.now()
    if (status.state === 'running') {
      if (runId !== undefined || status.turn !== 0) return
      const component: RunComponent = { panelIds: [panelId], edges: [] }
      const run = beginRun(component, panelId, at, `auto · ${status.mode}`)
      openRef.current.set(run.id, { component, baseline: usageOf([panelId]) })
      const next = [run, ...current].slice(0, RUNS_MAX)
      runsRef.current = next
      setRuns(next)
      return
    }
    if (runId === undefined) return
    const open = openRef.current.get(runId) as OpenRun
    openRef.current.delete(runId)
    const outcome = status.state === 'done' ? 'passed' : status.state === 'stopped' ? 'stopped' : `stuck — ${status.reason ?? 'no reason given'}`
    const next = current.map((r) => {
      if (r.id !== runId) return r
      const sealedEntries = r.entries.map((e) => (e.panelId === panelId && e.endedAt === undefined ? { ...e, endedAt: at, outcome } : e))
      return finishRun({ ...r, entries: sealedEntries }, at, runCostSince([panelId], usageOf([panelId]), open.baseline))
    })
    runsRef.current = next
    setRuns(next)
  }, [runsRef, setRuns])

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

  // A workspace switch replaces the panels, so the origins of the ones that
  // left mean nothing — and a recycled id would inherit a dead panel's
  // template, the failure every module-level store here names.
  const forgetOpen = useCallback(() => { openRef.current.clear(); originRef.current.clear() }, [])
  const hasOpen = useCallback(() => openRef.current.size > 0, [])

  return { onRunEvent, onAutoEvent, noteTemplate, runAgain, forgetOpen, hasOpen }
}
