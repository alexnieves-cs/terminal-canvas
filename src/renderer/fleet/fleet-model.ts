import { statusAfter, type AgentEvent, type AgentRecord, type AgentStatus } from '@shared/world-events'
import type { AgentState } from '@shared/types'
import type { PanelUsage } from '@shared/cost'
import { costOf } from '@shared/pricing'
import { agentWord, statePriority, type PanelStateWord } from '@renderer/panels/panel-state'
import type { JournalEntry } from '../world/world-replay'
import { isEditTool } from '../world/world-activity'

/**
 * M699. The fleet wall's arithmetic, with no React, no DOM and no clock.
 *
 * Everything the wall draws is a pure function of three things the app
 * already keeps: the world store's JOURNAL (every agent event, with when the
 * room got it, for the last hour), the usage store's HISTORY (each panel's
 * cumulative spend as it arrived) and a window [from, to]. The wall calls
 * these every second; the time-lapse film calls the same ones at past `to`s,
 * so a frame of the film and the live wall at that moment cannot disagree.
 *
 * Nothing here decides an agent's status. `statusAfter` in shared/world-events
 * is the one reducer (the same the store and verify:world run), and the word
 * and tone come from panel-state's vocabulary through `agentWord`, so the wall
 * speaks exactly the words a panel does (verify:rail state.2).
 */

/** Feed status → the panel vocabulary's agent state. Keys unquoted on purpose: state.2. */
const FEED_STATE: Record<AgentStatus, AgentState> = {
  working: 'busy',
  thinking: 'busy',
  idle: 'idle',
  waiting_approval: 'wants-you',
  error: 'exited'
}

/** The panel word and tone for a feed status. A status the table does not know reads as busy, as world-palette does. */
/**
 * The statuses a lane's legend names, in the order a person reads them:
 * working, wants you, idle, error. Read off FEED_STATE's keys so no state is
 * spelled here (verify:rail state.2); thinking is working's twin on a lane.
 */
export const LANE_LEGEND: readonly AgentStatus[] = (Object.keys(FEED_STATE) as AgentStatus[])
  .filter((s, i, all) => all.findIndex((t) => FEED_STATE[t] === FEED_STATE[s]) === i)
  .sort((a, b) => statePriority(agentWord(FEED_STATE[a]).word) - statePriority(agentWord(FEED_STATE[b]).word))

export function fleetWord(status: AgentStatus): PanelStateWord {
  return agentWord(Object.prototype.hasOwnProperty.call(FEED_STATE, status) ? FEED_STATE[status] : 'busy')
}

// ── usage ──────────────────────────────────────────────────────────────────

/** One arrival of a panel's CUMULATIVE usage, stamped when the renderer got it. */
export interface UsagePoint {
  at: number
  usage: PanelUsage
}

/** All four token classes. A count, never a price: cost.ts says why they are never collapsed for pricing. */
export function usageTokens(u: PanelUsage): number {
  const t = u.totals
  return t.input + t.output + t.cacheWrite + t.cacheRead
}

/**
 * List-price dollars for a panel's usage, or undefined when any model it used
 * is not in the price table — run-model's rule: one unpriced model makes the
 * figure unknown, never a smaller number that silently left it out.
 */
export function usageCost(u: PanelUsage): number | undefined {
  let total = 0
  for (const [model, totals] of Object.entries(u.byModel)) {
    const c = costOf(totals, model)
    if (c === undefined) return undefined
    total += c
  }
  return total
}

/** The newest point at or before `t`, or undefined. Points are in arrival order. */
export function usageAt(points: readonly UsagePoint[], t: number): UsagePoint | undefined {
  let lo = 0
  let hi = points.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (points[mid]!.at <= t) { found = mid; lo = mid + 1 } else hi = mid - 1
  }
  return found < 0 ? undefined : points[found]
}

export interface SpendLine {
  agentId: string
  /** Dollars spent since `from`, at each of `times`. */
  values: number[]
}

export interface Spend {
  times: number[]
  /** Priced panels only, biggest spender first. */
  lines: SpendLine[]
  /** Sum of `lines` at each time. */
  total: number[]
  /** Panels that spent tokens in the window on a model the table does not price. */
  unpriced: string[]
  /** Every token every panel spent in the window, priced or not. */
  tokens: number
}

/**
 * Spend over the window, per panel, as a running total from `from`. The
 * baseline is the panel's usage AT `from`, so a long-lived agent's earlier
 * hours are not drawn as this window's spend (runCostSince's reason).
 */
export function spendOverTime(history: ReadonlyMap<string, readonly UsagePoint[]>, from: number, to: number, buckets = 60): Spend {
  const n = Math.max(2, buckets)
  const times = Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1))
  const lines: SpendLine[] = []
  const unpriced: string[] = []
  let tokens = 0
  for (const [agentId, points] of history) {
    const last = usageAt(points, to)
    if (last === undefined) continue
    const base = usageAt(points, from)
    const spentTokens = usageTokens(last.usage) - (base === undefined ? 0 : usageTokens(base.usage))
    if (spentTokens <= 0) continue
    tokens += spentTokens
    const baseCost = base === undefined ? 0 : usageCost(base.usage)
    const lastCost = usageCost(last.usage)
    if (baseCost === undefined || lastCost === undefined) { unpriced.push(agentId); continue }
    const values = times.map((t) => {
      const p = usageAt(points, t)
      const c = p === undefined ? baseCost : usageCost(p.usage)
      return Math.max(0, (c ?? baseCost) - baseCost)
    })
    lines.push({ agentId, values })
  }
  lines.sort((a, b) => b.values[b.values.length - 1]! - a.values[a.values.length - 1]! || a.agentId.localeCompare(b.agentId))
  const total = times.map((_, i) => lines.reduce((s, line) => s + line.values[i]!, 0))
  return { times, lines, total, unpriced, tokens }
}

/** "$0.42", "$12.30", "$1,204" — cents until it stops mattering. */
export function formatDollars(value: number): string {
  if (value >= 1000) return `$${Math.round(value).toLocaleString('en-US')}`
  return `$${value.toFixed(2)}`
}

/** "812", "48.2k", "3.1M". */
export function formatTokens(value: number): string {
  if (value < 1000) return String(Math.round(value))
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`
  return `${(value / 1_000_000).toFixed(1)}M`
}

// ── states over time ───────────────────────────────────────────────────────

export interface Segment {
  from: number
  to: number
  status: AgentStatus
}

/**
 * Each agent's status as runs of time, clipped to [from, to]. An agent's lane
 * starts at the first event the room got from it; before the window, events
 * only set where its lane begins. `statusAfter` decides every change, so a
 * thought or a stale tool_result never moves a lane (world-events.ts says why).
 */
export function stateLanes(journal: readonly JournalEntry[], from: number, to: number): Map<string, Segment[]> {
  const lanes = new Map<string, Segment[]>()
  const current = new Map<string, { status: AgentStatus; since: number }>()
  const close = (agentId: string, at: number): void => {
    const open = current.get(agentId)
    if (open === undefined) return
    const a = Math.max(open.since, from)
    const b = Math.min(at, to)
    if (b > a) {
      const lane = lanes.get(agentId) ?? []
      const prev = lane[lane.length - 1]
      if (prev !== undefined && prev.status === open.status && prev.to === a) prev.to = b
      else lane.push({ from: a, to: b, status: open.status })
      lanes.set(agentId, lane)
    }
  }
  for (const { at, event } of journal) {
    if (at > to) break
    if (!lanes.has(event.agentId)) lanes.set(event.agentId, [])
    const next = statusAfter(event)
    const open = current.get(event.agentId)
    if (open === undefined) { current.set(event.agentId, { status: next ?? 'idle', since: at }); continue }
    if (next === null || next === open.status) continue
    close(event.agentId, at)
    current.set(event.agentId, { status: next, since: at })
  }
  for (const agentId of current.keys()) close(agentId, to)
  return lanes
}

export type TickKind = 'edit' | 'read' | 'run' | 'failed'

export interface Tick {
  at: number
  agentId: string
  kind: TickKind
}

const READS: ReadonlySet<string> = new Set(['Read', 'Grep', 'Glob', 'LS', 'WebFetch', 'WebSearch'])

/** A tool_call's kind for the lanes' tick marks, or null for a tool the wall does not mark. */
export function tickKind(event: AgentEvent): TickKind | null {
  if (event.type === 'tool_result') return event.payload.status === 'failed' ? 'failed' : null
  if (event.type !== 'tool_call' || event.payload.status !== 'started') return null
  const tool = event.payload.tool
  if (isEditTool(tool) || tool === 'apply_patch') return 'edit'
  if (READS.has(tool)) return 'read'
  return 'run'
}

export function toolTicks(journal: readonly JournalEntry[], from: number, to: number): Tick[] {
  const ticks: Tick[] = []
  for (const { at, event } of journal) {
    if (at > to) break
    if (at < from) continue
    const kind = tickKind(event)
    if (kind !== null) ticks.push({ at, agentId: event.agentId, kind })
  }
  return ticks
}

// ── files touched ──────────────────────────────────────────────────────────

export interface FileTouch {
  path: string
  touches: number
  edits: number
  /** Touches per agent id. */
  agents: Record<string, number>
  /** The agent with the most touches; the first to reach it on a tie. */
  topAgent: string
  lastAt: number
}

/**
 * The file a call is on. The feed's `path` first (M421: a real file tool's
 * input, relative to the agent's folder). Codex's `apply_patch` names its file
 * only in the summary ("Update src/main.ts", "Add …", "Delete …"), so that one
 * shape is read back; any other summary is never parsed for a path, because a
 * shell line that mentions a file did not necessarily touch it.
 */
export function touchedPath(event: AgentEvent): string | null {
  if (event.type !== 'tool_call' || event.payload.status !== 'started') return null
  if (typeof event.payload.path === 'string' && event.payload.path !== '') return event.payload.path
  if (event.payload.tool === 'apply_patch') {
    const m = /^(?:Update|Add|Delete) (\S+)$/.exec(event.payload.summary)
    if (m) return m[1]!
  }
  return null
}

function isEditCall(event: AgentEvent): boolean {
  return event.type === 'tool_call' && (isEditTool(event.payload.tool) || event.payload.tool === 'apply_patch')
}

/** Every file a call named in [from, to], most-touched first. One call is one touch: its result is not counted again. */
export function filesTouched(journal: readonly JournalEntry[], from: number, to: number): FileTouch[] {
  const files = new Map<string, FileTouch>()
  for (const { at, event } of journal) {
    if (at > to) break
    if (at < from) continue
    const path = touchedPath(event)
    if (path === null) continue
    const f = files.get(path) ?? { path, touches: 0, edits: 0, agents: {}, topAgent: event.agentId, lastAt: at }
    f.touches += 1
    if (isEditCall(event)) f.edits += 1
    f.agents[event.agentId] = (f.agents[event.agentId] ?? 0) + 1
    if (f.agents[event.agentId]! > (f.agents[f.topAgent] ?? 0)) f.topAgent = event.agentId
    f.lastAt = at
    files.set(path, f)
  }
  return [...files.values()].sort((a, b) => b.touches - a.touches || b.lastAt - a.lastAt || a.path.localeCompare(b.path))
}

/** The last segment of a path, for a tile's label. */
export function baseName(path: string): string {
  const i = path.lastIndexOf('/')
  return i < 0 ? path : path.slice(i + 1)
}

/** The first segment, the treemap's folder: the agent's own folder in the demo, `src` and friends in a real feed. */
export function topFolder(path: string): string {
  const i = path.indexOf('/')
  return i < 0 ? '.' : path.slice(0, i)
}

// ── the treemap ────────────────────────────────────────────────────────────

export interface Box { x: number; y: number; w: number; h: number }

/**
 * Squarified treemap (Bruls, Huizing and van Wijk, 2000): rows are laid along
 * the shorter side and a tile joins the row only while that keeps the row's
 * worst aspect ratio from getting worse. Pure: values in, boxes out, in the
 * order the items were given after sorting by value.
 */
export function squarify<T>(items: readonly { value: number; item: T }[], box: Box): { item: T; box: Box }[] {
  const kept = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value)
  const sum = kept.reduce((s, i) => s + i.value, 0)
  if (kept.length === 0 || box.w <= 0 || box.h <= 0) return []
  const scale = (box.w * box.h) / sum
  const areas = kept.map((i) => i.value * scale)
  const out: { item: T; box: Box }[] = []
  const rect = { ...box }
  const worst = (row: number[], side: number): number => {
    const s = row.reduce((a, b) => a + b, 0)
    const max = Math.max(...row)
    const min = Math.min(...row)
    return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min))
  }
  const place = (row: number[], first: number): void => {
    const s = row.reduce((a, b) => a + b, 0)
    if (rect.w >= rect.h) {
      const colW = s / rect.h
      let y = rect.y
      row.forEach((area, k) => {
        const h = area / colW
        out.push({ item: kept[first + k]!.item, box: { x: rect.x, y, w: colW, h } })
        y += h
      })
      rect.x += colW
      rect.w -= colW
    } else {
      const rowH = s / rect.w
      let x = rect.x
      row.forEach((area, k) => {
        const w = area / rowH
        out.push({ item: kept[first + k]!.item, box: { x, y: rect.y, w, h: rowH } })
        x += w
      })
      rect.y += rowH
      rect.h -= rowH
    }
  }
  let row: number[] = []
  let first = 0
  for (let i = 0; i < areas.length;) {
    const side = Math.min(rect.w, rect.h)
    const candidate = [...row, areas[i]!]
    if (row.length === 0 || worst(candidate, side) <= worst(row, side)) {
      row = candidate
      i += 1
    } else {
      place(row, first)
      first += row.length
      row = []
    }
  }
  if (row.length > 0) place(row, first)
  return out
}

export interface FolderTile {
  name: string
  touches: number
  box: Box
  files: { item: FileTouch; box: Box }[]
}

/** Two levels: folders by their touches, then each folder's files inside it, under a header strip for its name. */
export function fileTreemap(files: readonly FileTouch[], box: Box, header = 18, pad = 2): FolderTile[] {
  const folders = new Map<string, FileTouch[]>()
  for (const f of files) {
    const name = topFolder(f.path)
    folders.set(name, [...(folders.get(name) ?? []), f])
  }
  const groups = [...folders].map(([name, list]) => ({ value: list.reduce((s, f) => s + f.touches, 0), item: { name, list } }))
  return squarify(groups, box).map(({ item, box: outer }) => {
    const inner: Box = { x: outer.x + pad, y: outer.y + header, w: Math.max(0, outer.w - 2 * pad), h: Math.max(0, outer.h - header - pad) }
    return {
      name: item.name,
      touches: item.list.reduce((s, f) => s + f.touches, 0),
      box: outer,
      files: squarify(item.list.map((f) => ({ value: f.touches, item: f })), inner)
    }
  })
}

// ── the tiles ──────────────────────────────────────────────────────────────

export interface FleetTile {
  agentId: string
  name: string
  status: AgentStatus
  word: string
  tone: PanelStateWord['tone']
  /** What it is doing or last said, one line. Empty when it has said nothing. */
  line: string
  lastAt: number
  /** Tool calls in the window. */
  calls: number
  /** Distinct files it edited in the window. */
  edits: number
  /** Cumulative tokens, or null when no usage has arrived for it. */
  tokens: number | null
  /** Cumulative dollars; undefined when its model is not priced; null when no usage has arrived. */
  cost: number | null | undefined
  /** Its spend line over the window, for the sparkline; empty when it has none. */
  spark: number[]
}

/** The newest line an agent's ring has to show: a tool it started, a message, a thought or an error. */
export function lineOf(events: readonly AgentEvent[]): string {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i]!
    if (e.type === 'tool_call' && e.payload.status === 'started') return e.payload.summary
    if (e.type === 'message' || e.type === 'thought') return e.payload.text
    if (e.type === 'error') return e.payload.message
  }
  return ''
}

export interface TileInputs {
  records: readonly AgentRecord[]
  journal: readonly JournalEntry[]
  history: ReadonlyMap<string, readonly UsagePoint[]>
  spend: Spend
  from: number
  to: number
  /** A name for an id the feed has not named (a panel with usage but no feed). */
  nameOf?: (agentId: string) => string | undefined
}

/**
 * One tile per agent the feed has described, plus one per panel whose usage
 * arrived with no feed record (a plain terminal agent), ordered the way the
 * palette's `state:` query orders panels: needs-you first.
 */
export function fleetTiles(input: TileInputs): FleetTile[] {
  const { records, journal, history, spend, from, to } = input
  const calls = new Map<string, number>()
  const edited = new Map<string, Set<string>>()
  for (const { at, event } of journal) {
    if (at > to) break
    if (at < from) continue
    if (event.type === 'tool_call' && event.payload.status === 'started') calls.set(event.agentId, (calls.get(event.agentId) ?? 0) + 1)
    const path = touchedPath(event)
    if (path !== null && isEditCall(event)) edited.set(event.agentId, (edited.get(event.agentId) ?? new Set()).add(path))
  }
  const sparkOf = new Map(spend.lines.map((l) => [l.agentId, l.values]))
  const tiles: FleetTile[] = []
  const seen = new Set<string>()
  const usageOf = (id: string): { tokens: number | null; cost: number | null | undefined } => {
    const points = history.get(id)
    const last = points === undefined ? undefined : usageAt(points, to)
    if (last === undefined) return { tokens: null, cost: null }
    return { tokens: usageTokens(last.usage), cost: usageCost(last.usage) }
  }
  for (const r of records) {
    seen.add(r.agentId)
    const { word, tone } = fleetWord(r.status)
    tiles.push({
      agentId: r.agentId,
      name: r.name,
      status: r.status,
      word,
      tone,
      line: lineOf(r.events),
      lastAt: r.lastTs,
      calls: calls.get(r.agentId) ?? 0,
      edits: edited.get(r.agentId)?.size ?? 0,
      ...usageOf(r.agentId),
      spark: sparkOf.get(r.agentId) ?? []
    })
  }
  for (const id of history.keys()) {
    if (seen.has(id)) continue
    const { word, tone } = fleetWord('idle')
    tiles.push({ agentId: id, name: input.nameOf?.(id) ?? id, status: 'idle', word, tone, line: '', lastAt: 0, calls: 0, edits: 0, ...usageOf(id), spark: sparkOf.get(id) ?? [] })
  }
  return tiles.sort((a, b) => statePriority(a.word) - statePriority(b.word) || a.name.localeCompare(b.name))
}

/** Counts by word, in the tiles' own order, for the header's chips. */
export function wordCounts(tiles: readonly FleetTile[]): { word: string; tone: FleetTile['tone']; count: number }[] {
  const out: { word: string; tone: FleetTile['tone']; count: number }[] = []
  for (const t of tiles) {
    const row = out.find((r) => r.word === t.word)
    if (row) row.count += 1
    else out.push({ word: t.word, tone: t.tone, count: 1 })
  }
  return out
}

/**
 * The window the wall shows: the last `minutes`, but never before the first
 * thing the room heard, so a session ten minutes old fills the axis instead of
 * sitting in its right-hand sixth.
 */
export function fleetWindow(journal: readonly JournalEntry[], history: ReadonlyMap<string, readonly UsagePoint[]>, now: number, minutes: number): { from: number; to: number } {
  let first = journal.length > 0 ? journal[0]!.at : now
  for (const points of history.values()) if (points.length > 0) first = Math.min(first, points[0]!.at)
  const from = Math.max(now - minutes * 60_000, first)
  return { from: Math.min(from, now - 1000), to: now }
}

export const FLEET_WINDOWS: readonly number[] = [5, 15, 60]
