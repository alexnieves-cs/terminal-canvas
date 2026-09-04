import type { HandoffTrigger } from './handoff'

/**
 * M84. WHEN A WATCHER RUNS — the union, and the ONE phrase every surface
 * says it with.
 *
 * Shared because the persisted format (`layout-schema.ts`), the panel model
 * (`panels.ts`), the runner (`main/watch-runner.ts`) and every sentence in
 * the rail, the node and the inspector name the same four shapes. Four
 * copies of a union drift in the arm nobody tests, and a trigger phrase
 * written twice is the failure `trigger-words.ts` already exists to prevent
 * for edges: the canvas said `on exit` in one place and `when it finishes`
 * in another, and a user cannot tell whether those are one rule or two.
 *
 * Pure: no node, no DOM. `verify:file watch.1`.
 */

export type WatchTrigger =
  | { kind: 'path'; path: string }
  | { kind: 'git-ref'; root: string }
  | { kind: 'timer'; everyMs: number }
  | { kind: 'panel'; sourceId: string; on: HandoffTrigger }

export const WATCH_TRIGGER_KINDS: readonly WatchTrigger['kind'][] = ['path', 'git-ref', 'timer', 'panel']

/** The shortest honest interval: below this a watcher is a busy loop with a UI. */
export const WATCH_TIMER_MIN_MS = 10_000

/** How much of a run's output the node keeps. Memory only; the ledger keeps none. */
export const WATCH_TAIL_BYTES = 8 * 1024

/** How long a stopped process gets before SIGKILL. */
export const WATCH_KILL_GRACE_MS = 2000

/** `600000` → `10m`, `90000` → `1m 30s`, `15000` → `15s`. */
export function everyWord(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  if (m === 0) return `${s}s`
  return s === 0 ? `${m}m` : `${m}m ${s}s`
}

/**
 * The one phrase. A `panel` trigger names its SOURCE BY ID here; the
 * renderer swaps in the panel's label before painting, because only the
 * renderer knows what the user calls that node — the same split `rail-rows.ts`
 * already makes between an id and an honest label.
 */
export function triggerWord(trigger: WatchTrigger, label?: string): string {
  switch (trigger.kind) {
    case 'path': {
      const tail = trigger.path.replace(/\/+$/, '').split('/').filter((p) => p !== '').slice(-1)[0] ?? trigger.path
      return `on a change in ${tail}`
    }
    case 'git-ref':
      return 'when the branch moves'
    case 'timer':
      return `every ${everyWord(trigger.everyMs)}`
    case 'panel': {
      const who = label ?? trigger.sourceId
      switch (trigger.on) {
        case 'exit': return `when ${who} exits`
        case 'exit-ok': return `when ${who} exits 0`
        case 'exit-fail': return `when ${who} fails`
        case 'idle': return `when ${who} finishes a turn`
        case 'always': return `when ${who} ends`
      }
    }
  }
}

/** The long form, for the context pane: the phrase plus what it is watching. */
export function describeTrigger(trigger: WatchTrigger, label?: string): string {
  switch (trigger.kind) {
    case 'path': return `${triggerWord(trigger)} — ${trigger.path}`
    case 'git-ref': return `${triggerWord(trigger)} — HEAD under ${trigger.root}`
    case 'timer': return triggerWord(trigger)
    case 'panel': return triggerWord(trigger, label)
  }
}
