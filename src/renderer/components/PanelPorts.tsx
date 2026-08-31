import { memo, type JSX, type MouseEvent as ReactMouseEvent } from 'react'
import type { LinkSide } from '@renderer/canvas/link-geometry'

/**
 * Below this viewport scale the ports do not render at all.
 *
 * They are children of .panel and so ride .world's transform — which is right,
 * and which means a 14px dot is 1.4 screen pixels at 0.1x. An affordance that
 * cannot be hit is worse than one that is not offered, because it reads as a
 * bug rather than as a limit. Chosen below LIVE_MIN_SCALE (0.5) deliberately:
 * a panel that is carded is still a legitimate link endpoint, so the ports
 * must outlive promotion rather than disappearing with it.
 */
export const PORT_MIN_SCALE = 0.4

const SIDES: LinkSide[] = ['n', 'e', 's', 'w']

/**
 * The four link handles on a panel's border (M24).
 *
 * Children of .panel, so they ride .world's single translate()/scale() exactly
 * as .panel__resize does — placing them in screen pixels instead would make
 * them drift on every zoom, which is the mistake EdgeIndicators exists on the
 * other side of.
 *
 * One component, FIVE call sites: terminal, review, file, Jira and toolbox.
 * `links` lives on PanelBase and verify:viewport 88 pins that the geometry
 * never asks a panel its kind, so every kind is already a valid endpoint —
 * this makes the GESTURE as kind-agnostic as the arithmetic. The authority on
 * that list is isTerminalPanel's negation in panels.ts, which names all four
 * non-terminal kinds; a fifth kind added later needs a call site here too.
 */
function PanelPortsImpl({
  panelId,
  onBeginLink
}: {
  panelId: string
  onBeginLink: (panelId: string, event: ReactMouseEvent) => void
}): JSX.Element | null {
  return (
    <>
      {SIDES.map((side) => (
        <div
          key={side}
          className={`panel__port panel__port--${side}`}
          data-port={side}
          title="Drag to link this panel to another"
          onMouseDown={(event) => {
            // Both are load-bearing and neither is the other. stopPropagation
            // keeps this off the chrome's move-drag and off the canvas's
            // background handler, which would otherwise read it as a click on
            // empty space and start a marquee. preventDefault suppresses the
            // native drag the browser would otherwise begin on the element.
            event.stopPropagation()
            event.preventDefault()
            onBeginLink(panelId, event)
          }}
        />
      ))}
    </>
  )
}

export const PanelPorts = memo(PanelPortsImpl)
