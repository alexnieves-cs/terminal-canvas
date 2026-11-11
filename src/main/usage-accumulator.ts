import { addTotals, emptyTotals, type PanelUsage, type TokenTotals } from '../shared/cost'
import { parseUsageChunk } from './usage-parse'

/**
 * Per-panel reading state: how far into the transcript we have read, what
 * fragment that read ended on, and the running totals.
 *
 * Pure — it takes bytes, never a path. The real-fs half is transcript-reader.ts,
 * kept out of this module the same deliberate way git-runner.ts is kept out of
 * review-engine.ts's reach: that separation is what lets the whole accumulator
 * be driven in the plain-node verify tier with no file anywhere in earshot.
 */
interface PanelState {
  offset: number
  carry: string
  usage: PanelUsage
  /**
   * M660. What each recent message id has already contributed, so the
   * per-block lines that repeat one message's usage count once. Bounded:
   * a message's lines are adjacent in the file, so the newest few ids are
   * all a later line can still belong to.
   */
  seen: Map<string, TokenTotals>
}

const SEEN_MAX = 64

export interface UsageState {
  panels: Map<string, PanelState>
}

export function createUsageState(): UsageState {
  return { panels: new Map() }
}

function stateFor(state: UsageState, panelId: string): PanelState {
  let s = state.panels.get(panelId)
  if (!s) {
    s = {
      offset: 0,
      carry: '',
      usage: { totals: emptyTotals(), byModel: {}, turns: 0, subagentTurns: 0 },
      seen: new Map()
    }
    state.panels.set(panelId, s)
  }
  return s
}

export function offsetFor(state: UsageState, panelId: string): number {
  return state.panels.get(panelId)?.offset ?? 0
}

export function usageFor(state: UsageState, panelId: string): PanelUsage | undefined {
  // Undefined means "nothing has been read for this panel", which is a
  // different fact from "this panel has read something and spent nothing" —
  // the latter returns a usage whose `turns` is 0, and buildUsageFields
  // renders the two differently. Never collapse them here.
  return state.panels.get(panelId)?.usage
}

/**
 * The transcript SHRANK, so it was truncated or replaced and the stored offset
 * points past its end. Reading from there yields garbage or nothing at all,
 * with no error anywhere — so everything for this panel resets and the file is
 * re-read from the top.
 */
export function resetIfShrunk(state: UsageState, panelId: string, fileSize: number): void {
  const s = state.panels.get(panelId)
  if (!s || fileSize >= s.offset) return
  state.panels.delete(panelId)
}

/**
 * A panel is gone for good. Without this the map grows for the life of the
 * process and a panel reusing a dead one's id inherits a stranger's spend —
 * the same recycled-id hazard dropBaseline and clearLiveSession each close.
 */
export function dropUsage(state: UsageState, panelId: string): void {
  state.panels.delete(panelId)
}

/**
 * Fold the bytes appended since the last read into this panel's totals.
 *
 * Returns the new usage ONLY when it actually changed, and undefined
 * otherwise. That dedupe IS the throttle: this rides a slow tick, and an
 * unconditional send would be a message per tick per panel describing a fact
 * that changes once per agent turn. Its failure changes no pixel — it shows up
 * as heat — so nothing but a check will ever notice it, which is why
 * verify:usage 18 exists and why verify:pty-manager's own version of it spans
 * several ticks.
 */
export function applyChunk(
  state: UsageState,
  panelId: string,
  text: string,
  fileSize: number
): PanelUsage | undefined {
  const s = stateFor(state, panelId)
  s.offset = fileSize
  const { entries, carry } = parseUsageChunk(text, s.carry)
  s.carry = carry
  if (entries.length === 0) return undefined
  let changed = false
  for (const entry of entries) {
    // M660. A later line of a message already counted adds only what grew
    // (nothing, when the usage is repeated verbatim), and is not a new turn.
    const before = entry.messageId === undefined ? undefined : s.seen.get(entry.messageId)
    const add = before === undefined ? entry.totals : {
      input: Math.max(0, entry.totals.input - before.input),
      output: Math.max(0, entry.totals.output - before.output),
      cacheWrite: Math.max(0, entry.totals.cacheWrite - before.cacheWrite),
      cacheRead: Math.max(0, entry.totals.cacheRead - before.cacheRead)
    }
    if (entry.messageId !== undefined) {
      s.seen.delete(entry.messageId)
      s.seen.set(entry.messageId, before === undefined ? { ...entry.totals } : {
        input: Math.max(before.input, entry.totals.input),
        output: Math.max(before.output, entry.totals.output),
        cacheWrite: Math.max(before.cacheWrite, entry.totals.cacheWrite),
        cacheRead: Math.max(before.cacheRead, entry.totals.cacheRead)
      })
      if (s.seen.size > SEEN_MAX) s.seen.delete(s.seen.keys().next().value as string)
    }
    if (before !== undefined && add.input === 0 && add.output === 0 && add.cacheWrite === 0 && add.cacheRead === 0) continue
    changed = true
    s.usage.totals = addTotals(s.usage.totals, add)
    s.usage.byModel[entry.model] = addTotals(
      s.usage.byModel[entry.model] ?? emptyTotals(),
      add
    )
    if (before !== undefined) continue
    s.usage.turns += 1
    // Included in `turns`, not counted beside it: the pane renders "N turns,
    // M of them subagent", and two figures that do not reconcile read as a bug.
    if (entry.subagent) s.usage.subagentTurns += 1
  }
  if (!changed) return undefined
  // A fresh object, so the renderer store's identity check and React's
  // useSyncExternalStore both see a real change. Mutating in place would make
  // the snapshot identical by reference and the pane would never repaint.
  return {
    totals: { ...s.usage.totals },
    byModel: { ...s.usage.byModel },
    turns: s.usage.turns,
    subagentTurns: s.usage.subagentTurns
  }
}
