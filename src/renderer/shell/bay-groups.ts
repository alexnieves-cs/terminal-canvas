import { useSyncExternalStore } from 'react'
import { BAY_GROUPS, bayGroupOf, panelState, type BayGroupId } from '@renderer/panels/panel-state'
import type { RailRow } from './rail-rows'

/**
 * M700 (Strip bay). Which bay group each row is in, reported BY THE ROW.
 *
 * The bay groups panels by state, and a row's live state is the one thing the
 * list must never subscribe to: RailPanelRow owns its own useShownState
 * subscription so a bell re-renders exactly one row (agent-state-store.ts,
 * verify:panels-shell 83). So the row reports its GROUP here, and the list
 * subscribes to a version that moves only when some row CHANGES group. A bell
 * that leaves a row in Working moves nothing; a bell that moves it to Needs
 * you re-renders the list once, which is the list's own job (the headings and
 * their counts change).
 *
 * Until a row reports, the list places it by its state with no agent state
 * applied (`panelState(row.state, undefined)`), so the first paint is close
 * and the report only corrects it.
 */
const groups = new Map<string, BayGroupId>()
const listeners = new Set<() => void>()
let version = 0

const notify = (): void => {
  version += 1
  for (const fn of listeners) fn()
}

export function reportBayGroup(id: string, group: BayGroupId): void {
  if (groups.get(id) === group) return
  groups.set(id, group)
  notify()
}

export function dropBayGroup(id: string): void {
  if (groups.delete(id)) notify()
}

const subscribe = (fn: () => void): (() => void) => {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** The version the list keys its grouping on. */
export function useBayVersion(): number {
  return useSyncExternalStore(subscribe, () => version, () => version)
}

export interface BayGroup<R> { id: BayGroupId; label: string; rows: R[] }

/** The rows under the bay's headings, in BAY_GROUPS order; empty groups are dropped. */
export function bayGroups<R extends Pick<RailRow, 'id' | 'state'>>(rows: readonly R[]): BayGroup<R>[] {
  const out: BayGroup<R>[] = BAY_GROUPS.map((g) => ({ id: g.id, label: g.label, rows: [] }))
  for (const row of rows) {
    const group = groups.get(row.id) ?? bayGroupOf(panelState(row.state, undefined).tone)
    const i = out.findIndex((g) => g.id === group)
    out[i === -1 ? out.length - 1 : i].rows.push(row)
  }
  return out.filter((g) => g.rows.length > 0)
}
