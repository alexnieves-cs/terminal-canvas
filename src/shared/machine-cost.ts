import type { PanelId } from './types'

/** A terminal process whose whole descendant tree should be measured. */
export interface MachineCostTarget {
  panelId: PanelId
  pid: number
}

/**
 * The live resource cost attributed to one terminal panel.
 *
 * `cpuPercent` is ps's instantaneous process percentage summed across the
 * tree; it can exceed 100 when descendants use more than one core. Memory is
 * resident bytes, not virtual address space: RSS is the cost that competes
 * with the rest of the machine.
 */
export interface PanelMachineCost {
  panelId: PanelId
  cpuPercent: number
  memoryBytes: number
}

/** One slow, whole-canvas sample. No history is retained. */
export interface MachineCostSnapshot {
  panels: PanelMachineCost[]
  total: Omit<PanelMachineCost, 'panelId'>
}

export const EMPTY_MACHINE_COST: Omit<PanelMachineCost, 'panelId'> = {
  cpuPercent: 0,
  memoryBytes: 0
}
