import type { JSX } from 'react'
import type { Viewport } from './viewport'
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
}

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
export function CanvasHud({ viewport, onZoomBy, onFit, updateNewer, agentLinks }: CanvasHudProps): JSX.Element {
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



