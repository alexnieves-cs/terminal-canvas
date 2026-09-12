import { useEffect, useRef, useState, type JSX } from 'react'
import type { Viewport } from './viewport'
import { zoomReadoutShown } from './minimap'
import { shellControl } from '@renderer/shell/shell-control'
import { Maximize, Minus, Plus } from '@renderer/icons'

export interface CanvasHudProps {
  viewport: Viewport
  onZoomBy: (factor: number) => void
  onFit: () => void
  /** M123. The last update check's `newer` result, or absent. */
  updateNewer?: { version: string; url: string } | null
  /** M247. The agent-links toggle — the canvas door of `canvas.agentLinks` (the palette row, the agent line and an action node are the other three). */
  agentLinks?: { on: boolean; onToggle: () => void }
  /** M258. Fit task — the canvas door of `fit-task`. Disabled with the named reason when there is no task context; never removed. */
  fitTask?: { disabledReason?: string; run: () => void }
}

// M258. A target glyph: the active task framed, beside Fit all's four corners.
const FitTaskGlyph = (): JSX.Element => <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
  <path d="M2 5V2h3M14 5V2h-3M2 11v3h3M14 11v3h-3" /><rect x="5.5" y="5.5" width="5" height="5" rx="1" />
</svg>

/** M258. How long after the last scale change the readout counts as "zooming". */
const ZOOM_SETTLE_MS = 900

// M247. A link glyph, drawn here until a second surface needs it (NewObjectRow's rule).
const LinksGlyph = (): JSX.Element => <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
  <circle cx="3.5" cy="4" r="2" /><circle cx="12.5" cy="12" r="2" /><path d="M5.3 5.2 C 8 6, 8 10, 10.7 10.8" />
</svg>

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
export function CanvasHud({ viewport, onZoomBy, onFit, updateNewer, agentLinks, fitTask }: CanvasHudProps): JSX.Element {
  // M258. The readout is news, not furniture: on while the scale is moving,
  // then only when it differs materially from 100% (zoomReadoutShown). The
  // element stays in the DOM and fades — the rest rule's opacity, never
  // display — so its box and the checks that read its text are untouched.
  const [zooming, setZooming] = useState(false)
  const lastScale = useRef(viewport.scale)
  useEffect(() => {
    if (lastScale.current === viewport.scale) return
    lastScale.current = viewport.scale
    setZooming(true)
    const t = setTimeout(() => setZooming(false), ZOOM_SETTLE_MS)
    return () => clearTimeout(t)
  }, [viewport.scale])
  const readoutShown = zoomReadoutShown(viewport.scale, zooming)
  return (
    <div className="canvas-hud">
      {/* M46. The zoom cluster: the ONE pointer surface in the HUD (the rest
          stays pointer-events: none). shouldYieldWheel names the HUD so a
          wheel over these buttons never pans the world underneath. */}
      <span className="canvas-hud__zoom" role="group" aria-label="Zoom">
        <button type="button" className="icon-button" data-hud-zoom-out title="Zoom out (⌘−)"
          aria-label="Zoom out" {...shellControl(() => onZoomBy(1 / ZOOM_STEP))}><Minus /></button>
        <span className="canvas-hud__readout" data-hud-readout={readoutShown ? 'shown' : 'rest'} aria-hidden={readoutShown ? undefined : true}>{Math.round(viewport.scale * 100)}%</span>
        <button type="button" className="icon-button" data-hud-zoom-in title="Zoom in (⌘=)"
          aria-label="Zoom in" {...shellControl(() => onZoomBy(ZOOM_STEP))}><Plus /></button>
        {/* M264. Fit task is the PRIMARY zoom framing control; Fit all stays
            reachable beside it (and via the palette). */}
        {fitTask !== undefined && (
          <button type="button" className="icon-button" data-hud-fit-task disabled={fitTask.disabledReason !== undefined}
            title={fitTask.disabledReason ?? 'Fit task — the active task\'s panels in view'}
            aria-label={fitTask.disabledReason === undefined ? 'Fit task' : `Fit task: ${fitTask.disabledReason}`}
            {...shellControl(() => { if (fitTask.disabledReason === undefined) fitTask.run() })}><FitTaskGlyph /><span className="canvas-hud__fit-label">Fit task</span></button>
        )}
        <button type="button" className="icon-button" data-hud-fit title="Fit all — every panel in view (⌘1)"
          aria-label="Fit all" {...shellControl(onFit)}><Maximize /><span className="canvas-hud__fit-label">Fit all</span></button>
        {/* M247. Inside the zoom cluster, the HUD's one pointer surface, so it
            inherits that cluster's wheel yielding rather than needing its own. */}
        {agentLinks !== undefined && (
          <button type="button" className="icon-button" data-hud-agent-links aria-pressed={agentLinks.on}
            title={agentLinks.on ? 'Hide agent links' : 'Show agent links (what each agent read, wrote or drafted)'}
            aria-label={agentLinks.on ? 'Hide agent links' : 'Show agent links'} {...shellControl(agentLinks.onToggle)}><LinksGlyph /></button>
        )}
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



