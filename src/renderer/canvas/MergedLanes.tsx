import type { JSX } from 'react'
import type { Lane } from './merged-layout'

/**
 * World units of header above each lane's own bounding box, and the minimum
 * height a lane region is drawn at.
 *
 * An empty workspace's bounds are `h: 0` (mergedLayout has nothing to
 * measure), and a zero-height region would render as a hairline the user
 * cannot tell from a rendering bug — so the region is floored. The header
 * offset is world units rather than pixels for the same reason the rest of
 * this component is: see below.
 */
const LANE_HEADER_H = 56
const LANE_MIN_DRAWN_H = 320

export interface MergedLanesProps {
  lanes: Lane[]
}

/**
 * One header per workspace lane, drawn behind the panels it labels.
 *
 * INSIDE `.world`, and that is the whole placement decision. EdgeIndicators
 * and Marquee are both chrome mounted OUTSIDE the transform, because what
 * they say is a screen-space fact — a pip pinned to the viewport edge, a band
 * under the cursor — and inside the transform each would scale and pan away
 * from the thing it exists to point at. A lane header says the opposite kind
 * of thing: it names a REGION OF THE WORLD, the region its panels live in, so
 * it has to move and scale with them exactly. A header outside the transform
 * would sit still while its lane panned out from under it and would then be
 * labelling whichever workspace happened to slide beneath it — a caption that
 * is confidently wrong rather than merely absent.
 *
 * Positioned absolutely against a zero-size host at the world origin, which
 * is what makes each child's `left`/`top` a plain world coordinate — the same
 * arrangement the panels themselves use as direct children of `.world`.
 *
 * pointer-events: none in the stylesheet, for EdgeIndicators' reason: a lane
 * region covers most of the canvas, so a hit-testable one would swallow the
 * background mousedown that clears selection and would sit above every panel
 * it is supposed to be labelling.
 *
 * Renders nothing when there are no lanes, so there is no permanently mounted
 * host for a DOM count to have to know about — the rule Marquee states.
 */
export function MergedLanes({ lanes }: MergedLanesProps): JSX.Element | null {
  if (lanes.length === 0) return null
  return (
    <div className="merged-lanes">
      {lanes.map((lane) => (
        <div
          key={lane.workspaceId}
          className={`merged-lane${lane.active ? ' merged-lane--active' : ''}`}
          // The id as an ATTRIBUTE, not only as a key: which workspace a lane
          // belongs to is this element's stated answer, and a check that had
          // to read it back out of the rendered NAME would be asserting about
          // a label a rename can change — the same split RailPanelRow draws
          // for data-agent-state.
          data-lane-id={lane.workspaceId}
          style={{
            left: lane.bounds.x,
            top: lane.bounds.y - LANE_HEADER_H,
            width: lane.bounds.w,
            height: Math.max(lane.bounds.h, LANE_MIN_DRAWN_H) + LANE_HEADER_H
          }}
        >
          <div className="merged-lane__name">{lane.name}</div>
        </div>
      ))}
    </div>
  )
}
