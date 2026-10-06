import { IPC_EVENTS, type BootProgressEvent } from '../../shared/ipc-contract'

/**
 * M439. Restore progress, main → renderer, on `boot:progress`.
 *
 * A send, not an invoke. verify:ipc walks `IPC` and counts handlers;
 * `FILE_CHANGED` records why a main → renderer fact does not join that
 * list. The composition root calls `publishBootProgress` as each fact is
 * measured (R-017). This module does not import electron and does not
 * start a process.
 *
 * Option-skip: panes that have not reattached come up asleep. Their pids
 * are copied through. Nothing is killed — killing would be the opposite
 * of the keep-on-quit shape the splash is offering.
 */

export interface LivePane {
  panelId: string
  pid: number
  reattached: boolean
}

export interface SkippedPanes {
  panes: Array<LivePane & { asleep: boolean }>
  /** Always empty. The skip does not kill. */
  killed: readonly string[]
}

export function skipRemaining(panes: readonly LivePane[], optionHeld: boolean): SkippedPanes {
  return {
    panes: panes.map((pane) => ({
      panelId: pane.panelId,
      pid: pane.pid,
      reattached: pane.reattached,
      asleep: optionHeld === true && pane.reattached !== true
    })),
    killed: []
  }
}

export type BootSend = (channel: string, payload: BootProgressEvent) => void

export function publishBootProgress(send: BootSend, event: BootProgressEvent): void {
  send(IPC_EVENTS.BOOT_PROGRESS, event)
}
