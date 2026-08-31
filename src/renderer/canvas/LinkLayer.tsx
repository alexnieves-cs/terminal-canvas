import { memo, useMemo, type JSX } from 'react'
import { buildLinkSegments } from './link-geometry'
import type { Panel } from '@renderer/panels/panels'

/**
 * Every link on the canvas, as one SVG inside `.world`.
 *
 * INSIDE `.world`, so it inherits the single translate()/scale() and pans,
 * zooms and clips with the panels for free — the exact opposite of
 * EdgeIndicators, which is a SIBLING of `.world` precisely because a
 * viewport-pinned pip must not zoom away. (The two are unrelated features with
 * confusingly similar names in the same directory, which is why this one says
 * `link` and never `edge`; backlog #24 calls them edges.)
 *
 * BENEATH the panels, at z-index 0, and that IS Panel.z's scheme rather than a
 * second one: nextZ returns max(..., 0) + 1, so every panel this app mints has
 * z >= 1 and sits above. Below is also right on its own merits — a line
 * painted over a terminal obscures the agent output the app exists to show —
 * and it costs nothing, because linkAnchors puts both endpoints ON the panel
 * borders, so the whole segment including the arrowhead is outside both rects
 * and visible anyway.
 *
 * (A hand-edited layout.json with a negative z would paint that panel under
 * this layer. parsePanel accepts any finite z, and clamping it there would
 * change the behaviour of existing files for a cosmetic case no gesture in
 * this app can produce, so it is left alone deliberately.)
 *
 * pointer-events: none on the layer and everything in it, which is a property
 * of the LAYER rather than a hit-test anyone has to remember. A link cannot
 * swallow a click aimed at a panel, cannot swallow the background click that
 * clears focusedId (which would pin a panel live and hold a WebGL context for
 * the rest of the run), and cannot interfere with the capture-phase palette
 * dismissal on .shell. It is also why this milestone adds nothing at all to
 * shouldYieldWheel.
 *
 * NOT culled: a link is an SVG path with no process, no WebGL context and no
 * LIVE_BUDGET slot, so the reason panels are culled does not apply to it.
 * Nobody has measured a canvas with two hundred links; if that is ever slow,
 * the fix is a viewport intersection test here, and this is where it goes.
 */
function LinkLayerImpl({ panels }: { panels: Panel[] }): JSX.Element | null {
  // Rebuilt whenever the panel array's identity changes — which includes every
  // frame of a drag, correctly, because a link's endpoint is moving. That is
  // the same cost EdgeIndicators already pays. The memo is what stops a Canvas
  // re-render that moved no rect (a cursor move, a palette open) repainting.
  const segments = useMemo(() => buildLinkSegments(panels), [panels])
  // Nothing at all rather than an empty <svg>: the common case is a canvas
  // with no links, and an empty absolutely-positioned element is one more node
  // for every hit test in the layer above to walk past.
  if (segments.length === 0) return null
  return (
    <svg className="link-layer" aria-hidden="true">
      <defs>
        {/* auto-start-reverse rather than auto: the marker is authored
            pointing right and this orients it along the segment, so a link
            drawn right-to-left does not arrive with its arrowhead backwards. */}
        <marker
          id="link-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" className="link-layer__head" />
        </marker>
      </defs>
      {segments.map((s) => (
        <g key={s.key}>
          <path
            className="link-layer__line"
            data-link={s.key}
            d={s.d}
            markerEnd="url(#link-arrow)"
          />
          {s.label !== undefined && (
            <text
              className="link-layer__label"
              // The CURVE's midpoint, not the chord's. At t = 0.5 a cubic
              // reduces to (P0 + 3C1 + 3C2 + P3) / 8, so this needs no path
              // measurement and no DOM — a getPointAtLength call here would
              // make the label position depend on a laid-out element and
              // would not survive the first render.
              x={(s.x1 + 3 * s.c1x + 3 * s.c2x + s.x2) / 8}
              y={(s.y1 + 3 * s.c1y + 3 * s.c2y + s.y2) / 8}
              textAnchor="middle"
            >
              {s.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  )
}

export const LinkLayer = memo(LinkLayerImpl)
