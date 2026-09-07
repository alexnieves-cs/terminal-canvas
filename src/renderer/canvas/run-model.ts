import { linksOf, type Panel } from '@renderer/panels/panels'
import type { PersistedRun, RunEntry } from '@shared/runs'
import type { PanelUsage } from '@shared/cost'
import { costOf } from '@shared/pricing'

/**
 * M79. RUNS, the pure half. The component over ENABLED handoff edges, its
 * roots and sinks in panel order, the reducer that turns handoff events into
 * a run record, and the run's cost by the summary's own rule. No DOM, no
 * React; `verify:viewport run.1–.2`.
 */

export interface RunComponent {
  panelIds: string[]
  edges: Array<{ from: string; to: string }>
}

function enabledEdges(panels: readonly Panel[]): Array<{ from: string; to: string }> {
  const out: Array<{ from: string; to: string }> = []
  for (const p of panels) for (const l of linksOf(p)) if (l.automation?.kind === 'handoff' && l.automation.enabled) out.push({ from: p.rect.id, to: l.to })
  return out
}

/** The connected subgraph over enabled handoff edges that holds `id`, in panel order. */
export function componentOf(panels: readonly Panel[], id: string): RunComponent {
  const edges = enabledEdges(panels)
  const member = new Set<string>([id])
  let grew = true
  while (grew) {
    grew = false
    for (const e of edges) {
      if (member.has(e.from) !== member.has(e.to)) { member.add(e.from); member.add(e.to); grew = true }
    }
  }
  const panelIds = panels.map((p) => p.rect.id).filter((pid) => member.has(pid))
  return { panelIds, edges: edges.filter((e) => member.has(e.from) && member.has(e.to)) }
}

export function rootsOf(_panels: readonly Panel[], component: RunComponent): string[] {
  return component.panelIds.filter((id) => !component.edges.some((e) => e.to === id))
}

export function sinksOf(_panels: readonly Panel[], component: RunComponent): string[] {
  return component.panelIds.filter((id) => !component.edges.some((e) => e.from === id))
}

export type RunEvent =
  | { kind: 'fired'; panelId: string; outcome: string; at: number }
  | { kind: 'delivered'; panelId: string; sentence: string; at: number }
  | { kind: 'skipped'; panelId: string; sentence: string; at: number }

export function beginRun(component: RunComponent, sourceId: string, at: number, name: string): PersistedRun {
  return { id: `run-${at.toString(36)}-${sourceId}`, name, panelIds: [...component.panelIds], edges: component.edges.map((e) => ({ ...e })), startedAt: at, entries: [{ panelId: sourceId, startedAt: at }] }
}

/**
 * One entry per panel: a `fired` ends the panel's entry with its outcome
 * (opening it first if the panel started before the run knew); a
 * `delivered` starts the target's entry; a `skipped` ends the target's
 * entry with the sentence when nothing else will reach it.
 */
export function recordRunEvent(run: PersistedRun, event: RunEvent): PersistedRun {
  const entries = run.entries.map((e) => ({ ...e }))
  const find = (): RunEntry => {
    let e = entries.find((x) => x.panelId === event.panelId)
    if (!e) { e = { panelId: event.panelId, startedAt: event.at }; entries.push(e) }
    return e
  }
  switch (event.kind) {
    case 'fired': { const e = find(); e.endedAt = event.at; e.outcome = event.outcome; break }
    case 'delivered': { const e = find(); if (e.endedAt !== undefined) { e.startedAt = event.at; delete e.endedAt; delete e.outcome }; break }
    case 'skipped': {
      // A skip closes a target's entry only when nothing else can still reach
      // it: in a join another source may yet deliver, and closing here would
      // seal the run while that source is still running (M79's verifier).
      const owed = run.edges.filter((x) => x.to === event.panelId).some((x) => {
        const src = entries.find((y) => y.panelId === x.from)
        return src === undefined || src.endedAt === undefined
      })
      const e = find()
      if (!owed && e.outcome === undefined) { e.endedAt = event.at; e.outcome = event.sentence }
      break
    }
  }
  return { ...run, entries }
}

/**
 * Every sink has an outcome — OR every entry has ended and no edge is still
 * owed. The second arm is what seals a component with no sink (a cycle) and
 * one whose sink was never reached (a queued target that timed out); without
 * it such a run reads as working for ever (M79's verifier).
 */
export function runIsComplete(run: PersistedRun, component: RunComponent): boolean {
  const sinks = sinksOf([], component)
  const outcomeOf = (id: string): string | undefined => run.entries.find((e) => e.panelId === id)?.outcome
  if (sinks.length > 0 && sinks.every((id) => outcomeOf(id) !== undefined)) return true
  if (run.entries.length === 0 || run.entries.some((e) => e.endedAt === undefined)) return false
  // No edge is owed: every edge whose source ended has a target with an entry.
  return !run.edges.some((e) => outcomeOf(e.from) !== undefined && run.entries.find((x) => x.panelId === e.to) === undefined)
}

export function finishRun(run: PersistedRun, at: number, costUsd: number | undefined): PersistedRun {
  return { ...run, endedAt: at, ...(costUsd === undefined ? {} : { costUsd }) }
}

/**
 * A run still open in a SAVED layout was abandoned by a relaunch: the
 * recorder's component is gone with the renderer, so nothing could ever seal
 * it. Sealed on load with the relaunch named on every open entry.
 *
 * M121. With an `idle` predicate the seal is narrower and can run at any
 * time: only a run whose EVERY panel answers idle (or is absent — the
 * predicate is asked about every id, and a panel that is gone is idle by
 * construction for the caller that knows the roster) is sealed, with the
 * idle panels named on its open entries. Nothing will ever fire such a
 * run's remaining edges, and left open it reads `working` for ever beside
 * panels that are not. A run with one busy panel stays open.
 */
export function sealAbandoned(runs: readonly PersistedRun[], at: number, idle?: (panelId: string) => boolean): PersistedRun[] {
  const reason = idle === undefined ? 'abandoned — the app relaunched' : 'abandoned — its panels were idle'
  return runs.map((run) => {
    if (run.endedAt !== undefined) return run
    if (idle !== undefined && !run.panelIds.every((id) => idle(id))) return run
    return {
      ...run,
      endedAt: at,
      entries: run.entries.map((e) => (e.outcome === undefined ? { ...e, endedAt: at, outcome: reason } : e))
    }
  })
}

/** The summary's rule: absent when any panel's model is unpriced; panels with no usage cost nothing. */
/**
 * What THIS run cost: the panels' priced usage now, less what they had spent
 * when the run began. Without the baseline a second run bills every earlier
 * run again (M79's verifier).
 */
export function runCostSince(panelIds: readonly string[], usages: ReadonlyMap<string, PanelUsage>, baseline: ReadonlyMap<string, PanelUsage>): number | undefined {
  const now = runCost(panelIds, usages)
  const before = runCost(panelIds, baseline)
  if (now === undefined || before === undefined) return undefined
  return Math.max(0, now - before)
}

export function runCost(panelIds: readonly string[], usages: ReadonlyMap<string, PanelUsage>): number | undefined {
  let total = 0
  for (const id of panelIds) {
    const u = usages.get(id)
    if (!u) continue
    for (const [model, totals] of Object.entries(u.byModel)) {
      const c = costOf(totals, model)
      if (c === undefined) return undefined
      total += c
    }
  }
  return total
}

/** `run N`: a short honest default the frame's caps label can carry (M79's critic); the members are the record's. */
export function runName(existing: readonly PersistedRun[]): string {
  let n = existing.length + 1
  const names = new Set(existing.map((r) => r.name))
  while (names.has(`run ${n}`)) n += 1
  return `run ${n}`
}
