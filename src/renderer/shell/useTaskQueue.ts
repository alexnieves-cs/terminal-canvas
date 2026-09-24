import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { PersistedWorkItem } from '@shared/work-items'
import type { ReviewHandoff } from '@shared/review-readiness'
import type { Panel } from '@renderer/panels/panels'
import type { Inbox } from './decision-inbox'
import {
  buildTaskQueue, isCheckCommand, parseRemembered, rememberDecisions,
  type HistoryEvent, type QueueCheckRun, type RememberedDecision, type TaskQueue
} from './task-queue'
import { onRecordLanded } from '@renderer/orchestration/record-landed'

/**
 * M318. The task queue's renderer half: the inputs the pure builder takes,
 * gathered from what the canvas already holds, plus the two things that must
 * outlive a navigation or a restart.
 *
 * - **Check runs** are the durable timeline's command rows (M300/M306), read
 *   per active task only while the queue is being LOOKED at (`active`) and
 *   again when a watcher run ends — a pull, like every read here, never a
 *   second store of outcomes.
 * - **Decision memory** keeps every waiting permission and question in
 *   localStorage, with the time it was first seen. At the next launch an
 *   entry that does not come back is shown as `lost` — "its session ended
 *   before you answered" — until the person dismisses it; one that DOES come
 *   back keeps its original waiting time. A key that went live and then left
 *   during this session was resolved here, and is forgotten.
 * - **The traversal cursor** — the decision the person was on — is module
 *   state that survives the popover closing and a jump to the evidence, so
 *   "back to decisions" lands where they left; it is also stored, so a
 *   relaunch reopens on it when it still exists.
 *
 * Storage can throw (a private context, a harness): every read and write is
 * guarded and the queue works without it.
 */
const MEMORY_KEY = 'tc.decisions.v1'
const CURSOR_KEY = 'tc.decisions.cursor.v1'
const DISMISSED_KEY = 'tc.decisions.dismissed.v1'
const TIMELINE_ROWS = 60
const TASKS_MAX = 20

const read = (key: string): unknown => { try { const raw = window.localStorage.getItem(key); return raw === null ? null : JSON.parse(raw) } catch { return null } }
const write = (key: string, value: unknown): void => { try { window.localStorage.setItem(key, JSON.stringify(value)) } catch { /* the queue works without storage */ } }

// Loaded ONCE per renderer: this is what the previous launch left.
let bootMemory: RememberedDecision[] | null = null
const bootRemembered = (): RememberedDecision[] => (bootMemory ??= parseRemembered(read(MEMORY_KEY)))

/** M318. A decision remembered from the last launch keeps its first-seen time when it comes back (`useDecisionInbox`). */
export function rememberedSince(key: string): number | undefined {
  return bootRemembered().find((r) => r.key === key)?.since
}

let cursor: string | null = null
let cursorLoaded = false
const cursorListeners = new Set<() => void>()
export function queueCursor(): string | null {
  if (!cursorLoaded) { cursorLoaded = true; const c = read(CURSOR_KEY); cursor = typeof c === 'string' ? c : null }
  return cursor
}
export function setQueueCursor(key: string | null): void {
  if (key === cursor) return
  cursor = key
  write(CURSOR_KEY, key)
  for (const l of cursorListeners) l()
}
export function useQueueCursor(): string | null {
  return useSyncExternalStore((cb) => { cursorListeners.add(cb); return () => { cursorListeners.delete(cb) } }, queueCursor, queueCursor)
}

let dismissed: Set<string> | null = null
const dismissedSet = (): Set<string> => (dismissed ??= new Set(Array.isArray(read(DISMISSED_KEY)) ? (read(DISMISSED_KEY) as unknown[]).filter((k): k is string => typeof k === 'string') : []))
const dismissListeners = new Set<() => void>()
let dismissVersion = 0
/** Put away a restart leftover — the person has seen it. */
export function dismissLost(key: string): void {
  const set = dismissedSet()
  set.add(key)
  write(DISMISSED_KEY, [...set].slice(-200))
  dismissVersion += 1
  for (const l of dismissListeners) l()
}

export interface TaskQueueDeps {
  inbox: Inbox
  workItems: readonly PersistedWorkItem[]
  panels: readonly Panel[]
  membersOf: (itemId: string) => readonly string[]
  handoffOf: (itemId: string) => ReviewHandoff | undefined
  labelOf: (panelId: string) => string
  /** The queue is on screen — only then are the timelines read. */
  active: boolean
}

export function useTaskQueue(deps: TaskQueueDeps): TaskQueue {
  const { inbox, workItems, panels, membersOf, handoffOf, labelOf, active } = deps
  const tasks = useMemo(() => workItems.filter((w) => w.state !== 'done').slice(0, TASKS_MAX), [workItems])
  const members = useMemo(() => new Map(tasks.map((t) => [t.id, [...membersOf(t.id)]])), [tasks, panels]) // eslint-disable-line react-hooks/exhaustive-deps
  const watcherIds = useMemo(() => new Set(panels.filter((p) => p.kind === 'watcher').map((p) => p.rect.id)), [panels])
  const handoffs = useMemo(() => panels.flatMap((p) => (p.links ?? [])
    .filter((l) => l.automation?.kind === 'handoff' && l.automation.enabled)
    .map((l) => ({ from: p.rect.id, to: l.to }))), [panels])

  // A watcher run ENDING is when a check outcome changes: re-read then.
  const [runTick, setRunTick] = useState(0)
  useEffect(() => {
    const door = window.canvas?.watcher?.onState
    if (typeof door !== 'function') return
    return door((ev) => { if (ev.status === 'passed' || ev.status === 'exited') setRunTick((n) => n + 1) })
  }, [])
  // A decision answered HERE lands in its task's history in the same beat it
  // leaves the queue — the record's own "landed", not a poll.
  useEffect(() => onRecordLanded((row) => { if (row.source === 'person') setRunTick((n) => n + 1) }), [])

  const [runs, setRuns] = useState<ReadonlyMap<string, { runs: QueueCheckRun[]; events: HistoryEvent[] }>>(() => new Map())
  const taskKey = tasks.map((t) => `${t.id}:${(members.get(t.id) ?? []).join(',')}`).join(' ')
  useEffect(() => {
    if (!active) return
    const door = window.canvas?.ledger?.timeline
    if (typeof door !== 'function') return
    let live = true
    void Promise.all(tasks.map(async (t) => {
      const panelIds = members.get(t.id) ?? []
      try {
        const read = await door({ itemId: t.id, ...(panelIds.length === 0 ? {} : { panelIds }) }, TIMELINE_ROWS)
        const rows: QueueCheckRun[] = read.entries.flatMap((e) => e.kind === 'command' && isCheckCommand(e.row.command, { watcher: watcherIds.has(e.row.panelId), ...(t.checks === undefined ? {} : { declared: t.checks }) })
          ? [{ command: e.row.command, panelId: e.row.panelId, at: e.row.endedAt, exitCode: e.row.exitCode, ...(e.row.outputId === undefined ? {} : { outputId: e.row.outputId }) }] : [])
        const events: HistoryEvent[] = read.entries.flatMap((e) => e.kind === 'event' && e.row.source === 'person'
          ? [{ event: e.row.event, source: e.row.source, at: e.row.at, title: e.row.title, ...(e.row.key === undefined ? {} : { key: e.row.key }) }] : [])
        return [t.id, { runs: rows, events }] as const
      } catch {
        return [t.id, { runs: [] as QueueCheckRun[], events: [] as HistoryEvent[] }] as const
      }
    })).then((pairs) => { if (live) setRuns(new Map(pairs)) })
    return () => { live = false }
  }, [active, taskKey, runTick]) // eslint-disable-line react-hooks/exhaustive-deps

  // Decision memory: keys live at any moment of THIS session were seen here.
  const seenLive = useRef(new Set<string>())
  const ownerOf = (panelId: string): string | null => {
    for (const t of tasks) if ((members.get(t.id) ?? []).includes(panelId)) return t.id
    return null
  }
  const liveKey = [...inbox.items, ...inbox.snoozed].map((i) => i.key).join('\n')
  useEffect(() => {
    for (const i of [...inbox.items, ...inbox.snoozed]) seenLive.current.add(i.key)
    const prev = parseRemembered(read(MEMORY_KEY))
    write(MEMORY_KEY, rememberDecisions(prev, inbox, ownerOf, seenLive.current))
  }, [liveKey, taskKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const dv = useSyncExternalStore((cb) => { dismissListeners.add(cb); return () => { dismissListeners.delete(cb) } }, () => dismissVersion, () => dismissVersion)
  return useMemo(() => {
    const gone = dismissedSet()
    // Lost = remembered at boot, not seen live this session, not dismissed.
    const lost = bootRemembered().filter((r) => !seenLive.current.has(r.key) && !gone.has(`lost:${r.key}`))
    return buildTaskQueue({
      now: Date.now(),
      inbox,
      handoffs,
      lost,
      labelOf,
      tasks: tasks.map((t) => {
        const h = handoffOf(t.id)
        return {
          itemId: t.id, title: t.title, members: members.get(t.id) ?? [],
          ...(h === undefined ? {} : { handoff: { state: h.state, standing: h.standing, ...(h.changes === undefined ? {} : { files: h.changes.files }) } }),
          runs: runs.get(t.id)?.runs ?? [],
          events: runs.get(t.id)?.events ?? []
        }
      })
    })
  }, [inbox, handoffs, tasks, members, runs, handoffOf, labelOf, dv, liveKey]) // eslint-disable-line react-hooks/exhaustive-deps
}
