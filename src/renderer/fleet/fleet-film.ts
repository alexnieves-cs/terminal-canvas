import { outward } from '@shared/outward'
import { statusAfter, type AgentEvent, type AgentStatus } from '@shared/world-events'
import type { StateTone } from '@shared/redesign-contracts'
import type { JournalEntry } from '../world/world-replay'
import {
  fileTreemap, filesTouched, fleetWord, formatDollars, formatTokens, lineOf, spendOverTime, stateLanes, toolTicks, usageAt, usageCost, usageTokens,
  type Box, type FolderTile, type Spend, type TickKind, type UsagePoint
} from './fleet-model'

/**
 * M699. The fleet wall as a time-lapse: a script built once from the journal
 * and the usage history, and a frame computed from the script alone.
 *
 * THE GATE, night-film.ts's rule: every word that can reach a pixel (an
 * agent's name, a tool line, a message, a file path) passes `outward` HERE,
 * while the script is built, and the count rides the result. The painter
 * (fleet-paint.ts) reads nothing but a frame and this script, never a live
 * store, so nothing ungated can be drawn into a file that leaves the app.
 */

export const LAPSE_SIZE = { w: 1280, h: 720 } as const
export const LAPSE_FPS = 30
/** Long enough to read, short enough to post. An hour of agents is 120x. */
export const LAPSE_SECONDS = 24
/** The film's own layout boxes, shared by the frame model and the painter. */
export const LAPSE_BOXES: { tiles: Box; spend: Box; files: Box; lanes: Box } = {
  tiles: { x: 32, y: 84, w: 600, h: 452 },
  spend: { x: 656, y: 84, w: 592, h: 214 },
  files: { x: 656, y: 322, w: 592, h: 214 },
  lanes: { x: 32, y: 566, w: 1216, h: 126 }
}

export interface LapseAgent { id: string; name: string }

export interface LapseScript {
  from: number
  to: number
  fps: number
  frames: number
  /** First-seen order, scrubbed names. */
  agents: LapseAgent[]
  /** The journal in the window and the hour before it, every word scrubbed. */
  journal: JournalEntry[]
  history: ReadonlyMap<string, readonly UsagePoint[]>
  /** Spend for the whole window, computed once; a frame draws its prefix. */
  spend: Spend
  /** The outward gate's count across every distinct word in the script. */
  redacted: number
}

export interface LapseTile {
  name: string
  word: string
  tone: StateTone
  line: string
  money: string | null
}

export interface LapseLane {
  name: string
  segments: { from: number; to: number; tone: StateTone }[]
  ticks: { at: number; kind: TickKind }[]
}

export interface LapseFrame {
  at: number
  /** 0..1 through the window. */
  progress: number
  tiles: LapseTile[]
  lanes: LapseLane[]
  files: FolderTile[]
  /** How many of `script.spend.times` are at or before `at`. */
  spendUpTo: number
  spendNow: number
  tokensNow: number
  speed: number
}

function scrubEvent(event: AgentEvent, clean: (s: string) => string): AgentEvent {
  const name = event.name === undefined ? {} : { name: clean(event.name) }
  switch (event.type) {
    case 'tool_call':
    case 'tool_result':
      return {
        ...event,
        ...name,
        payload: {
          ...event.payload,
          summary: clean(event.payload.summary),
          ...(event.payload.detail === undefined ? {} : { detail: clean(event.payload.detail) }),
          ...(event.payload.path === undefined ? {} : { path: clean(event.payload.path) })
        }
      }
    case 'message':
    case 'thought':
      return { ...event, ...name, payload: { text: clean(event.payload.text) } }
    case 'error':
      return { ...event, ...name, payload: { message: clean(event.payload.message) } }
    default:
      return { ...event, ...name }
  }
}

export interface LapseInputs {
  journal: readonly JournalEntry[]
  history: ReadonlyMap<string, readonly UsagePoint[]>
  from: number
  to: number
  /** The wall's name for an agent; the feed's own name when absent. */
  nameOf: (agentId: string) => string
  seconds?: number
  fps?: number
}

/** Builds the script. Every string that can be painted crosses `outward` once, here. */
export function lapseScript(input: LapseInputs): LapseScript {
  const cache = new Map<string, string>()
  let redacted = 0
  const clean = (s: string): string => {
    const hit = cache.get(s)
    if (hit !== undefined) return hit
    const o = outward(s, 'fleet time-lapse')
    redacted += o.redacted
    cache.set(s, o.text)
    return o.text
  }
  const journal: JournalEntry[] = []
  const order: string[] = []
  for (const entry of input.journal) {
    if (entry.at > input.to) break
    if (entry.at < input.from - 60 * 60_000) continue
    if (!order.includes(entry.event.agentId)) order.push(entry.event.agentId)
    journal.push({ at: entry.at, event: scrubEvent(entry.event, clean) })
  }
  for (const id of input.history.keys()) if (!order.includes(id)) order.push(id)
  const fps = input.fps ?? LAPSE_FPS
  const frames = Math.max(2, Math.round((input.seconds ?? LAPSE_SECONDS) * fps))
  return {
    from: input.from,
    to: input.to,
    fps,
    frames,
    agents: order.map((id) => ({ id, name: clean(input.nameOf(id)) })),
    journal,
    history: input.history,
    spend: spendOverTime(input.history, input.from, input.to, 120),
    redacted
  }
}

/** The moment frame `i` shows. */
export function lapseTime(script: LapseScript, i: number): number {
  return script.from + ((script.to - script.from) * Math.min(i, script.frames - 1)) / (script.frames - 1)
}

/** Frame `i`, from the script alone. */
export function lapseFrame(script: LapseScript, i: number): LapseFrame {
  const at = lapseTime(script, i)
  const lanesBy = stateLanes(script.journal, script.from, at)
  const ticks = toolTicks(script.journal, script.from, at)
  // Each agent's status and ring as of `at`, folded from the scrubbed journal.
  const status = new Map<string, AgentStatus>()
  const ring = new Map<string, AgentEvent[]>()
  for (const { at: t, event } of script.journal) {
    if (t > at) break
    const r = ring.get(event.agentId) ?? []
    r.push(event)
    if (r.length > 50) r.shift()
    ring.set(event.agentId, r)
    const next = statusAfter(event)
    if (next !== null) status.set(event.agentId, next)
  }
  const tiles: LapseTile[] = []
  const lanes: LapseLane[] = []
  for (const agent of script.agents) {
    const s = status.get(agent.id) ?? 'idle'
    const { word, tone } = fleetWord(s)
    const points = script.history.get(agent.id)
    const p = points === undefined ? undefined : usageAt(points, at)
    let money: string | null = null
    if (p !== undefined) {
      const cost = usageCost(p.usage)
      money = cost === undefined ? `${formatTokens(usageTokens(p.usage))} tokens` : formatDollars(cost)
    }
    if (!ring.has(agent.id) && p === undefined) continue
    tiles.push({ name: agent.name, word, tone, line: lineOf(ring.get(agent.id) ?? []), money })
    lanes.push({
      name: agent.name,
      segments: (lanesBy.get(agent.id) ?? []).map((seg) => ({ from: seg.from, to: seg.to, tone: fleetWord(seg.status).tone })),
      ticks: ticks.filter((t) => t.agentId === agent.id).map((t) => ({ at: t.at, kind: t.kind }))
    })
  }
  const box = LAPSE_BOXES.files
  const files = fileTreemap(filesTouched(script.journal, script.from, at), { x: box.x, y: box.y + 26, w: box.w, h: box.h - 26 })
  const spendUpTo = script.spend.times.filter((t) => t <= at).length
  const spendNow = spendUpTo === 0 ? 0 : script.spend.total[spendUpTo - 1]!
  let tokensNow = 0
  for (const points of script.history.values()) {
    const base = usageAt(points, script.from)
    const now = usageAt(points, at)
    if (now !== undefined) tokensNow += usageTokens(now.usage) - (base === undefined ? 0 : usageTokens(base.usage))
  }
  const seconds = script.frames / script.fps
  return {
    at,
    progress: (at - script.from) / Math.max(1, script.to - script.from),
    tiles,
    lanes,
    files,
    spendUpTo,
    spendNow,
    tokensNow,
    speed: Math.max(1, Math.round((script.to - script.from) / 1000 / seconds))
  }
}
