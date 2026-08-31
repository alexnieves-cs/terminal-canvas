import type { JSX } from 'react'
import type { SessionBackendInfo } from '@shared/ipc-contract'
import type { MachineCostSnapshot } from '@shared/machine-cost'
import type { Point, Viewport } from './viewport'

export interface CanvasHudProps {
  viewport: Viewport
  cursor: Point
  selectedId: string | null
  /** null until the one-shot probe answers. */
  backend: SessionBackendInfo | null
  machineCost: MachineCostSnapshot['total']
}

/**
 * Zoom, world-space cursor position, current selection, and — only when it is
 * bad news — which backend is spawning panels.
 *
 * This is a STATUS, not a toggle, which is why it lives here rather than in a
 * settings surface: ideas-backlog item 11's "anything a user can toggle goes
 * in one organised settings surface" rule does not claim it. It renders
 * nothing at all on the tmux path, so the common case costs a null check.
 */
export function CanvasHud({ viewport, cursor, selectedId, backend, machineCost }: CanvasHudProps): JSX.Element {
  return (
    <div className="canvas-hud">
      <span>{Math.round(viewport.scale * 100)}%</span>
      <span>
        {Math.round(cursor.x)}, {Math.round(cursor.y)}
      </span>
      <span>{selectedId ?? '—'}</span>
      <span className="canvas-hud__cost" data-machine-cost-total>
        CPU {formatCpu(machineCost.cpuPercent)} · RAM {formatMemory(machineCost.memoryBytes)}
      </span>
      {backend?.kind === 'direct' && (
        <span className="canvas-hud__warn" title={backend.reason}>
          no tmux — sessions end on reload
        </span>
      )}
    </div>
  )
}

function formatCpu(percent: number): string {
  return `${percent.toLocaleString(undefined, { maximumFractionDigits: percent < 10 ? 1 : 0 })}%`
}

function formatMemory(bytes: number): string {
  const mib = bytes / (1024 * 1024)
  if (mib < 1024) return `${Math.round(mib)} MB`
  return `${(mib / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} GB`
}
