import type { StateInput } from '@renderer/panels/panel-state'
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
  /** M63. The selected panel's title and state word, so the strip says who and what, not an id. */
  selected?: { id: string; label: string; state: StateInput } | null
  /** M123. The last update check's answer, when it said newer — the one line a user with panels sees. */
  updateNewer?: { version: string; url: string } | null
  /** M78. A selected EDGE, when one is: the strip names it as `source → target`. */
  selectedEdge?: { source: string; target: string } | null
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
export function CanvasHud({ viewport, onZoomBy, onFit, updateNewer }: CanvasHudProps): JSX.Element {
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
          aria-label="Fit everything" {...shellControl(onFit)}><Maximize /><span className="canvas-hud__fit-label">fit</span></button>
      </span>
      {/* M173. THE STATUS BAR AT REST SAYS NOTHING (the brief, finding 4): the
          coordinates, the selected panel's name, the CPU · RAM total and the tmux
          sentence left this pill — the inspector holds the machine figure, the
          launcher's banner and the environment report the tmux fact. */}
      {/* M123. The launcher's notice reaches only an empty canvas; a user with panels sees it HERE. */}
      {updateNewer !== undefined && updateNewer !== null && (
        <span className="canvas-hud__notice" data-hud-update={updateNewer.version} title="Open release — the app does not install it">
          <a href={updateNewer.url} onMouseDown={(e) => e.stopPropagation()} onAuxClick={(e) => e.preventDefault()} onClick={(e) => { e.preventDefault(); void window.canvas.links.open({ panelId: '', target: updateNewer.url }) }}>{updateNewer.version} is out</a>
        </span>
      )}
    </div>
  )
}



