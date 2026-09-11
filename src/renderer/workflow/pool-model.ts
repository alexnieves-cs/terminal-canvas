/**
 * M138. A pool block's state as the Runs tab shows it — a PROJECTION of the
 * events main's caller emits, pure over them, so `verify:rail pool.model.1`
 * drives it under plain node and the panel renders it without a second
 * opinion. Main enforces every stop (M97's rule widened to N); this reducer
 * only says what main said, per item.
 */
import type { PoolEvent } from '@shared/ipc-contract'

export type PoolItemState = 'queued' | 'started' | 'finished'

export interface PoolBlockState {
  /** Items in the order main first named them; a queued item keeps its slot when it starts. */
  items: Array<{ item: string; state: PoolItemState; id?: string }>
  /** True from the first event until `stopped` or `refused`. */
  live: boolean
  stopped?: 'empty' | 'budget' | 'by-hand'
  refused?: string
}

export const EMPTY_POOL: PoolBlockState = { items: [], live: false }

export function reducePool(state: PoolBlockState, event: PoolEvent): PoolBlockState {
  // A run that ENDED (stopped or refused) is history: the first event of the
  // next Run starts a clean list, so a finished row from last time cannot
  // stand beside this run's items as if it were one of them.
  const fresh = !state.live && (state.stopped !== undefined || state.refused !== undefined) && (event.kind === 'queued' || event.kind === 'started')
  const items = fresh ? [] : state.items.map((i) => ({ ...i }))
  const upsert = (item: string, next: PoolItemState, id?: string): void => {
    const at = items.findIndex((i) => i.item === item)
    const row = { item, state: next, ...(id === undefined ? {} : { id }) }
    if (at === -1) items.push(row)
    else items[at] = { ...row, ...(id === undefined && items[at].id !== undefined ? { id: items[at].id } : {}) }
  }
  switch (event.kind) {
    case 'queued': upsert(event.item, 'queued'); return { items, live: true }
    case 'started': upsert(event.item, 'started', event.id); return { items, live: true }
    case 'finished': {
      const at = items.findIndex((i) => i.id === event.id)
      if (at !== -1) items[at] = { ...items[at], state: 'finished' }
      return { ...state, items }
    }
    case 'refused': return { items, live: false, refused: event.why }
    // A `stopped` after a `refused` keeps the refusal: the reason is the
    // sentence a person needs, and "by hand" would say they stopped it.
    case 'stopped': return state.refused !== undefined ? { items, live: false, refused: state.refused } : { items, live: false, stopped: event.why }
  }
}

/** The stopped row's sentence: `stopped — by hand`, `stopped — every item done`, `stopped — budget`. */
export function poolStoppedWord(why: 'empty' | 'budget' | 'by-hand'): string {
  if (why === 'empty') return 'done — every item finished'
  if (why === 'budget') return 'stopped — the budget ceiling was crossed; raise agents.budgetUsd or agents.budgetWindowPercent to continue'
  return 'stopped — by hand'
}

export const REASON_NO_POOL_LIVE = 'no pool is running'
