import { useEffect, useMemo, useState } from 'react'
import type { CanvasState, PersistedPanel } from '@shared/layout-schema/types'
import type { StateTone } from '@shared/redesign-contracts'
import { costOf } from '@shared/pricing'
import { panelState, type StateInput } from '@renderer/panels/panel-state'
import { chatStateInput } from '@renderer/chat/chat-model'
import { getChat } from '@renderer/chat/chat-store'
import { getAgentState, onAgentTransition } from '@renderer/session/agent-state-store'
import { getLastLine } from '@renderer/session/last-line-store'
import { subscribeLiveSessions } from '@renderer/session/live-session-store'
import { getUsage } from '@renderer/session/usage-store'
import {
  factsFromSources, parseFeed, SESSIONS_FEED_EVENT,
  type SessionFact, type SessionReads, type SessionSourcePanel, type SessionSourceTask
} from './sessions-model'

/**
 * M445. The page's picture of the canvas.
 *
 * Layout is the saved canvas (titles, folders, which panels are sessions).
 * Words come from `panelState`, last lines from the last-line store, spend
 * from the usage store. None of those stores is written here, and none of
 * them bumps `registry.version()` — a 2s read while this page is mounted is
 * how a per-id store is seen without a canvas-wide subscription.
 *
 * `tc-sessions-feed` is the shot's door. The steward layout stores a title
 * and one cwd, not the cast's engine, folder, branch or state, so the scene
 * hands facts the same model already accepts. A malformed payload is ignored.
 */

const POLL_MS = 2000

function panelRecord(panel: PersistedPanel): SessionSourcePanel | null {
  const kind = panel.kind ?? 'terminal'
  if (kind === 'terminal') {
    if (!('cwd' in panel) || typeof panel.cwd !== 'string') return null
    const engine = 'agent' in panel && typeof panel.agent === 'string' ? panel.agent : undefined
    return {
      id: panel.id,
      kind: 'terminal',
      ...(panel.title !== undefined && panel.title !== '' ? { title: panel.title } : {}),
      cwd: panel.cwd,
      ...(engine !== undefined ? { engine } : {}),
      shell: engine === undefined
    }
  }
  if (kind === 'chat' && 'chat' in panel && typeof panel.chat.cwd === 'string') {
    return {
      id: panel.id,
      kind: 'chat',
      ...(panel.title !== undefined && panel.title !== '' ? { title: panel.title } : {}),
      cwd: panel.chat.cwd,
      engine: panel.chat.backend ?? 'claude',
      shell: false
    }
  }
  return null
}

function taskRecords(state: CanvasState): SessionSourceTask[] {
  return (state.workItems ?? []).map((item) => ({
    id: item.id,
    title: item.title,
    ticket: item.key ?? null,
    ...(item.panelId !== undefined ? { panelId: item.panelId } : {})
  }))
}

/**
 * Facts the session registry can answer and the layout cannot. Absent means
 * the page is mounted without Canvas (the shot), and every fact stays the
 * unknown it was: dormant false, and the three timestamps and stats null.
 */
export interface SessionRegistryFacts {
  dormant(id: string): boolean
  startedAt(id: string): number | null
  survives(id: string): boolean | null
  changes(id: string): string | null
}

function speak(panel: SessionSourcePanel, dormant: boolean): { word: string; tone: StateTone } {
  const agent = getAgentState(panel.id)
  if (panel.kind === 'chat') {
    const chat = getChat(panel.id)
    const input = chatStateInput(chat.snapshot, chat.turns.length > 0)
    const state: StateInput = { kind: 'chat', status: undefined, dormant, ...(input === undefined ? {} : { chat: input }) }
    const spoken = panelState(state, agent)
    return { word: spoken.word, tone: spoken.tone }
  }
  const state: StateInput = {
    kind: 'terminal',
    dormant,
    status: agent === undefined ? undefined : { kind: 'running', pid: 0, command: '', cwd: panel.cwd, reattached: false }
  }
  const spoken = panelState(state, agent)
  return { word: spoken.word, tone: spoken.tone }
}

function spendOf(id: string, kind: SessionSourcePanel['kind']): number | null {
  const usage = getUsage(id)
  if (usage !== undefined) {
    let sum = 0
    let any = false
    for (const [model, totals] of Object.entries(usage.byModel)) {
      const cost = costOf(totals, model)
      if (cost === undefined || !Number.isFinite(cost)) continue
      sum += cost
      any = true
    }
    if (any && sum > 0) return sum
  }
  if (kind === 'chat') {
    const meta = getChat(id).meta?.costUsd
    if (typeof meta === 'number' && Number.isFinite(meta) && meta > 0) return meta
  }
  return null
}

function tokensOf(id: string): number | null {
  const usage = getUsage(id)
  if (usage === undefined) return null
  const totals = usage.totals
  const n = totals.input + totals.output + totals.cacheWrite + totals.cacheRead
  return Number.isFinite(n) && n > 0 ? n : null
}

function reads(branches: ReadonlyMap<string, string>, panels: readonly SessionSourcePanel[], live?: SessionRegistryFacts): SessionReads {
  // The read signature is id-only. Kind has to travel with the id, or a
  // chat's meta.costUsd is skipped and the column stays blank.
  const kindOf = new Map(panels.map((panel) => [panel.id, panel.kind]))
  return {
    word: (_id, panel) => speak(panel, live?.dormant(panel.id) === true),
    lastLine: (id) => getLastLine(id).line,
    costUsd: (id) => spendOf(id, kindOf.get(id) ?? 'terminal'),
    startedAt: (id) => live?.startedAt(id) ?? null,
    survives: (id) => live?.survives(id) ?? null,
    tokens: tokensOf,
    changes: (id) => live?.changes(id) ?? null,
    branch: (id) => branches.get(id) ?? '',
    activity: () => []
  }
}

export function useSessionBoard(canPasteTerminal: boolean, live?: SessionRegistryFacts): { facts: readonly SessionFact[]; tasks: readonly SessionSourceTask[] } {
  const [state, setState] = useState<CanvasState | null>(null)
  const [tick, setTick] = useState(0)
  const [branches, setBranches] = useState<ReadonlyMap<string, string>>(new Map())
  const [override, setOverride] = useState<readonly SessionFact[] | null>(null)

  useEffect(() => {
    let live = true
    void window.canvas.layout.load().then((loaded) => { if (live) setState(loaded) }, () => { if (live) setState(null) })
    return () => { live = false }
  }, [])

  useEffect(() => {
    const bump = (): void => setTick((n) => n + 1)
    const offAgent = onAgentTransition(bump)
    const offLive = subscribeLiveSessions(bump)
    const timer = window.setInterval(bump, POLL_MS)
    return () => { offAgent(); offLive(); window.clearInterval(timer) }
  }, [])

  useEffect(() => {
    const onFeed = (event: Event): void => {
      const parsed = parseFeed((event as CustomEvent<unknown>).detail)
      if (parsed !== null) setOverride(parsed)
    }
    window.addEventListener(SESSIONS_FEED_EVENT, onFeed)
    return () => window.removeEventListener(SESSIONS_FEED_EVENT, onFeed)
  }, [])

  const panels = useMemo(() => (state === null ? [] : state.panels.flatMap((panel) => {
    const record = panelRecord(panel)
    return record === null ? [] : [record]
  })), [state])
  const tasks = useMemo(() => (state === null ? [] : taskRecords(state)), [state])

  useEffect(() => {
    const folders = new Map<string, string[]>()
    for (const panel of panels) {
      if (panel.cwd === '') continue
      const ids = folders.get(panel.cwd) ?? []
      ids.push(panel.id)
      folders.set(panel.cwd, ids)
    }
    let live = true
    for (const [cwd, ids] of folders) {
      void window.canvas.git.status(cwd).then((status) => {
        if (!live || status.kind !== 'status' || status.branch === '') return
        setBranches((prev) => {
          const next = new Map(prev)
          for (const id of ids) next.set(id, status.branch)
          return next
        })
      }, () => {})
    }
    return () => { live = false }
  }, [panels])

  const facts = useMemo(() => {
    if (override !== null) return override
    const built = factsFromSources(panels, tasks, Date.now(), reads(branches, panels, live))
    if (!canPasteTerminal) return built
    return built.map((fact) => fact.shell ? fact : { ...fact, canPaste: true })
  }, [override, panels, tasks, branches, canPasteTerminal, tick, live])

  const feedTasks = useMemo((): SessionSourceTask[] => {
    if (override === null) return tasks
    const seen = new Map<string, SessionSourceTask>()
    for (const fact of override) {
      if (fact.taskId === null || fact.taskId === '' || seen.has(fact.taskId)) continue
      seen.set(fact.taskId, { id: fact.taskId, title: fact.taskTitle ?? fact.taskId, ticket: fact.taskTicket, panelId: fact.id })
    }
    return [...seen.values()]
  }, [override, tasks])

  return { facts, tasks: feedTasks }
}
