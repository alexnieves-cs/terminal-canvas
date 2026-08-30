import { addTotals, emptyTotals, type PanelUsage } from '../shared/cost'
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
}

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
      usage: { totals: emptyTotals(), byModel: {}, turns: 0, subagentTurns: 0 }
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
  for (const entry of entries) {
    s.usage.totals = addTotals(s.usage.totals, entry.totals)
    s.usage.byModel[entry.model] = addTotals(
      s.usage.byModel[entry.model] ?? emptyTotals(),
      entry.totals
    )
    s.usage.turns += 1
    // Included in `turns`, not counted beside it: the pane renders "N turns,
    // M of them subagent", and two figures that do not reconcile read as a bug.
    if (entry.subagent) s.usage.subagentTurns += 1
  }
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
