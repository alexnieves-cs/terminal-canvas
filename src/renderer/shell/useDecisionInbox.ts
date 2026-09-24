import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { RailAttention } from './rail-sections'
import { buildInbox, inboxKeyOf, type Inbox } from './decision-inbox'
import { isChatPanel, isTerminalPanel, type Panel } from '@renderer/panels/panels'
import { lastAssistantText, useApprovals } from '@renderer/chat/chat-store'
import { outward } from '@shared/outward'
import { rememberedSince } from './useTaskQueue'

/**
 * M308. The inbox's two renderer-held facts — WHEN each decision was first
 * seen waiting, and which are SNOOZED until when — and the hook that builds
 * the inbox from the live queue.
 *
 * Both maps live in this renderer's memory, like chat-store's `answered` set,
 * and both are PRUNED to the keys still waiting on every build: an answered
 * request's snooze must not come back as a ghost if the same id ever did, and
 * a first-seen time for a decision that left is a leak. A snooze is a VIEW
 * over the queue (`decision-inbox.ts`'s header), so nothing here touches
 * main, the dock badge or the OS notification — a relaunch forgets snoozes,
 * which is the safe direction for a thing that hides a waiting agent.
 */
const snoozes = new Map<string, number>()
const firstSeen = new Map<string, number>()
let version = 0
const listeners = new Set<() => void>()
const bump = (): void => { version += 1; for (const l of listeners) l() }

export function snoozeDecision(key: string, minutes: number, now = Date.now()): void {
  snoozes.set(key, now + minutes * 60_000)
  bump()
}

export function wakeDecision(key: string): void {
  if (snoozes.delete(key)) bump()
}

export interface InboxDeps {
  rows: readonly RailAttention[]
  panels: readonly Panel[]
  taskOf?: (panelId: string) => string | undefined
}

const LAST_LINE_MAX = 160

export function useDecisionInbox(deps: InboxDeps): Inbox {
  const { rows, panels, taskOf } = deps
  const approvals = useApprovals()
  // Hand-offs that FIRE — an enabled `handoff` rule. A bare link or a
  // restart rule holds nothing downstream up, so it unblocks nothing.
  const handoffs = useMemo(() => panels.flatMap((p) => (p.links ?? [])
    .filter((l) => l.automation?.kind === 'handoff' && l.automation.enabled)
    .map((l) => ({ from: p.rect.id, to: l.to }))), [panels])
  const kinds = useMemo(() => new Map(panels.map((p) => [p.rect.id, isChatPanel(p) ? 'chat' as const : isTerminalPanel(p) ? 'terminal' as const : 'other' as const])), [panels])
  const kindOf = (id: string): 'chat' | 'terminal' | 'other' => kinds.get(id) ?? 'other'
  // A waiting TERMINAL's last line is the question it asked; read once per
  // arrival from main's scrollback tail (a pull, like every read here).
  const [termLines, setTermLines] = useState<ReadonlyMap<string, string>>(() => new Map())
  const askingTerminals = rows.filter((r) => r.approval === undefined && kinds.get(r.id) === 'terminal').map((r) => r.id)
  const askingKey = askingTerminals.join(' ')
  useEffect(() => {
    if (askingTerminals.length === 0 || typeof window.canvas?.scrollback?.tail !== 'function') { setTermLines(new Map()); return }
    let live = true
    void Promise.all(askingTerminals.map(async (id) => {
      try { const got = await window.canvas.scrollback.tail({ panelId: id, lines: 1 }); return [id, got[got.length - 1] ?? ''] as const } catch { return [id, ''] as const }
    })).then((pairs) => { if (live) setTermLines(new Map(pairs)) })
    return () => { live = false }
  }, [askingKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const lastLineOf = (id: string): string | undefined => {
    const k = kinds.get(id)
    const raw = k === 'terminal' ? termLines.get(id) : k === 'chat' ? lastAssistantText(id).trim().split('\n').filter((l) => l.trim() !== '').pop() : undefined
    if (raw === undefined || raw === '') return undefined
    // The gate AT THE READ (`verify:verbs gate.2`): this line is pane text
    // handed to another surface, so it is scrubbed before it leaves here.
    const line = outward(raw, `panel ${id}`).text
    return line.length > LAST_LINE_MAX ? `${line.slice(0, LAST_LINE_MAX - 1)}…` : line
  }
  const v = useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb) } }, () => version, () => version)
  // A snooze ENDS by the clock, with no event: one timer to the earliest end
  // re-renders the inbox then, rather than a poll.
  const [tick, setTick] = useState(0)
  const now = Date.now()
  const liveKeys = rows.map(inboxKeyOf)
  const liveKey = liveKeys.join('\n')
  useEffect(() => {
    const live = new Set(liveKeys)
    let changed = false
    for (const k of [...snoozes.keys()]) if (!live.has(k)) { snoozes.delete(k); changed = true }
    for (const k of [...firstSeen.keys()]) if (!live.has(k)) firstSeen.delete(k)
    // M318. A decision that was waiting before a relaunch keeps its wait.
    for (const k of liveKeys) if (!firstSeen.has(k)) firstSeen.set(k, rememberedSince(k) ?? Date.now())
    if (changed) bump()
  }, [liveKey]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const ends = [...snoozes.values()].filter((t) => t > Date.now())
    if (ends.length === 0) return
    const t = setTimeout(() => setTick((n) => n + 1), Math.min(...ends) - Date.now() + 50)
    return () => clearTimeout(t)
  }, [v, tick])
  // A minute tick keeps "waited 4m" honest while the popover is open.
  useEffect(() => {
    if (rows.length === 0) return
    const t = setInterval(() => setTick((n) => n + 1), 60_000)
    return () => clearInterval(t)
  }, [rows.length])
  return useMemo(() => buildInbox({
    now, rows, approvals, kindOf,
    ...(taskOf === undefined ? {} : { taskOf }),
    handoffs,
    firstSeen: new Map(liveKeys.map((k) => [k, firstSeen.get(k) ?? now])),
    lastLineOf,
    snoozes: new Map(snoozes)
  }), [rows, approvals, handoffs, kinds, termLines, v, tick, liveKey]) // eslint-disable-line react-hooks/exhaustive-deps
}
