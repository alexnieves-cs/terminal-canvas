import { memo, type JSX, type MouseEvent as ReactMouseEvent } from 'react'
import type { LinkSide } from '@renderer/canvas/link-geometry'

/**
 * Below this viewport scale the ports are hidden — genuinely non-hit-testable
 * (`display: none`, via the canvas host's `.canvas--ports-hidden` class in
 * Canvas.tsx/styles.css), not merely invisible.
 *
 * They are children of .panel and so ride .world's transform — which is right,
 * and which means a 14px dot is 1.4 screen pixels at 0.1x. An affordance that
 * cannot be hit is worse than one that is not offered, because it reads as a
 * bug rather than as a limit. Chosen below LIVE_MIN_SCALE (0.5) deliberately:
 * a panel that is carded is still a legitimate link endpoint, so the ports
 * must outlive promotion rather than disappearing with it.
 *
 * This threshold reaches every panel through a CANVAS-HOST CLASS, never a
 * `scale` prop threaded into TerminalPanel (or any future kind that mounts
 * this component). `viewport.scale` changes on every frame of a zoom
 * (`zoomAt`), and TerminalPanel is `memo`'d specifically to block the 60Hz
 * pan/zoom cascade from reaching every panel — a `scale` prop would be a
 * changed prop on every memoized panel on every zoom frame, which is exactly
 * the cascade the memo exists to stop. `PanelPorts` itself renders
 * unconditionally (gated only by `readOnly` at the call site); the class does
 * the hiding.
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
 * ONE component, FIVE call sites: terminal, review, file, Jira and toolbox.
 * `links` lives on PanelBase and verify:viewport 88 pins that the geometry
 * never asks a panel its kind, so every kind is already a valid endpoint —
 * this makes the GESTURE as kind-agnostic as the arithmetic. The authority on
 * that list is isTerminalPanel's negation in panels.ts, which names all four
 * non-terminal kinds.
 *
 * A SIXTH KIND NEEDS FOUR EDITS FOR LINKS, NOT ONE. Three of the four are
 * exactly what M24's fix rounds found missing after the first cut, so this is
 * a measured list rather than a careful one:
 *
 *   1. isTerminalPanel's negation in panels.ts — M16's standing rule, and the
 *      one whose omission mints a PanelSession for a <div>.
 *   2. A <PanelPorts> mount in the new component, beside its resize handles,
 *      gated on `readOnly` exactly as they are. Without it the kind is a valid
 *      link TARGET and can never be a link SOURCE, which reads as the ports
 *      being broken on that kind rather than as a kind nobody wired.
 *   3. A REQUIRED `linkTarget` prop, plus `data-link-target` on the root.
 *      Requiredness only protects a component that DECLARES the prop — one
 *      that never declares it has nothing to omit, so there is no compile
 *      error. That is precisely how all four non-terminal kinds shipped
 *      rendering working ports, a ghost and a commit, and never once a target
 *      ring: a gesture that looked functional and simply never told you where
 *      it was going to land. `onBeginLink` escaped that only because THIS
 *      component does not compile without it. verify:panels 179.
 *   4. `readOnly={merged}` at the Canvas.tsx call site. `readOnly` is
 *      optional-with-a-default on every non-terminal kind, so omitting it
 *      compiles clean and renders ports in the merged view, where a drag
 *      writes addLink into the ACTIVE workspace's record naming a FOREIGN
 *      panel id — persisted, then invisible, because buildLinkSegments prunes
 *      it. onCommit's own mergedRef guard is the structural backstop for
 *      that; see its comment in Canvas.tsx.
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
