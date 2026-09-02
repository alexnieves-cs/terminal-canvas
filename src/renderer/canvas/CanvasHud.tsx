import type { JSX } from 'react'
import type { SessionBackendInfo } from '@shared/ipc-contract'
import type { MachineCostSnapshot } from '@shared/machine-cost'
import type { Point, Viewport } from './viewport'
import { shellControl } from '@renderer/shell/shell-control'
import { Maximize, Minus, Plus } from '@renderer/icons'

export interface CanvasHudProps {
  viewport: Viewport
  cursor: Point
  selectedId: string | null
  /** null until the one-shot probe answers. */
  backend: SessionBackendInfo | null
  machineCost: MachineCostSnapshot['total']
  /** M46. The zoom cluster's verbs — useViewport's own, never a copy. */
  onZoomBy: (factor: number) => void
  onFit: () => void
}

/**
 * The step the +/- buttons take. Restated here rather than imported because
 * useViewport's KEYBOARD_ZOOM_STEP is module-private. What must NOT be
 * restated is the zoom itself — the buttons call onZoomBy, i.e. useViewport's
 * named verb, so Cmd+= and + are provably the same gesture.
 */
const ZOOM_STEP = 1.2

/**
 * Zoom, world-space cursor position, current selection, and — only when it is
 * bad news — which backend is spawning panels.
 *
 * This is a STATUS, not a toggle, which is why it lives here rather than in a
 * settings surface: ideas-backlog item 11's "anything a user can toggle goes
 * in one organised settings surface" rule does not claim it. It renders
 * nothing at all on the tmux path, so the common case costs a null check.
 */
export function CanvasHud({ viewport, cursor, selectedId, backend, machineCost, onZoomBy, onFit }: CanvasHudProps): JSX.Element {
  return (
    <div className="canvas-hud">
      {/* M46. The zoom cluster: the ONE pointer surface in the HUD (the rest
          stays pointer-events: none). shouldYieldWheel names the HUD so a
          wheel over these buttons never pans the world underneath. */}
      <span className="canvas-hud__zoom" role="group" aria-label="Zoom">
        <button type="button" className="icon-button" data-hud-zoom-out title="Zoom out (⌘−)"
          aria-label="Zoom out" {...shellControl(() => onZoomBy(1 / ZOOM_STEP))}><Minus /></button>
        <span className="canvas-hud__readout">{Math.round(viewport.scale * 100)}%</span>
        <button type="button" className="icon-button" data-hud-zoom-in title="Zoom in (⌘=)"
          aria-label="Zoom in" {...shellControl(() => onZoomBy(ZOOM_STEP))}><Plus /></button>
        <button type="button" className="icon-button" data-hud-fit title="Fit everything (⌘1)"
          aria-label="Fit everything" {...shellControl(onFit)}><Maximize /></button>
      </span>
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
