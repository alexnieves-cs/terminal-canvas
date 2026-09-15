import { memo, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { buildLinkSegments, linkAnchors, linkPath } from './link-geometry'
import type { Panel } from '@renderer/panels/panels'
import type { LinkDrawState } from './useLinkDraw'
import { activityNow, edgesAnimateNow, useEdgeActivityVersion } from './useEdgeActivity'
import type { EdgeActivity } from '@shared/edge-activity'

/**
 * M232. ONE shared requestAnimationFrame for the whole layer, and none at all
 * while nothing is moving.
 *
 * Not one per edge: forty edges would mean forty callbacks competing for the
 * same frame, and the work each does is a handful of multiplications — the
 * scheduling would cost more than the arithmetic. And not an always-on loop:
 * `edgesAnimateNow()` is false whenever every edge is rest, armed or blocked,
 * which is a canvas's normal condition even mid-run, so the common case pays
 * NOTHING. The store notifies this hook when any edge changes KIND, which is
 * the moment the answer to "should we be animating" can change.
 *
 * The returned value is a frame counter used only to re-render; the positions
 * are read from `activityNow()` during the render that follows, so no packet
 * position is ever held in React state (which would be a setState per edge
 * per frame).
 */
function useEdgeFrames(): number {
  const version = useEdgeActivityVersion()
  const [frame, setFrame] = useState(0)
  const running = useRef(false)
  useEffect(() => {
    if (!edgesAnimateNow()) return
    if (running.current) return
    running.current = true
    let raf = 0
    const tick = (): void => {
      if (!edgesAnimateNow()) { running.current = false; return }
      setFrame((f) => f + 1)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); running.current = false }
  }, [version])
  return frame
}

/** A cubic Bézier coordinate at t — the same arithmetic the label already uses. */
function bez(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const u = 1 - t
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3
}

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
 * pointer-events: none on the LAYER itself, which is still a property of the
 * layer rather than a hit-test anyone has to remember for the ordinary case.
 * M35 Task 6 narrows that surgically rather than removing it: a link's own
 * `.link-layer__hit` opts back in with `pointer-events: stroke` so it can be
 * hovered and removed, and `.link-layer__badge` opts in with `pointer-events:
 * all` so it can be clicked — and that is the exhaustive list. Everything
 * else here (the visible curve, the ghost, the labels, the <defs>) stays
 * inert. The hit stroke must never call stopPropagation: Canvas's background
 * onMouseDown reads clientX/clientY through toWorld/hitTest, never
 * event.target, so a mousedown that bubbles through it clears focusedId and
 * the selection exactly as a click on bare canvas does — which is what keeps
 * a link from pinning a panel live and holding a WebGL context for the rest
 * of the run, and what keeps it from interfering with the capture-phase
 * palette dismissal on .shell. The badge is the ONE element here that DOES
 * consume a click, deliberately, so removing a link does not also deselect
 * the canvas underneath it. See verify:panels 127 (rewritten in M35) and 178.
 *
 * NOT culled and no viewport intersection test added for the hit stroke or
 * badge either: this milestone adds nothing at all to shouldYieldWheel.
 *
 * NOT culled: a link is an SVG path with no process, no WebGL context and no
 * LIVE_BUDGET slot, so the reason panels are culled does not apply to it.
 * Nobody has measured a canvas with two hundred links; if that is ever slow,
 * the fix is a viewport intersection test here, and this is where it goes.
 */
const EMPTY_ACTIVITY: ReadonlyMap<string, EdgeActivity> = new Map()
const REST_ACTIVITY: EdgeActivity = { kind: 'rest' }

function LinkLayerImpl({
  panels,
  draw,
  onRemove,
  edgeLabels,
  selectedKey,
  onSelect,
  cardDetail
}: {
  panels: Panel[]
  draw?: LinkDrawState | null
  onRemove?: (from: string, to: string) => void
  /** M78. What each edge says it does, keyed `from:to` — overrides the user's label when a rule exists. */
  edgeLabels?: ReadonlyMap<string, string>
  /** M78. The selected edge's key; its badge is the remove control, Delete removes it. */
  selectedKey?: string | null
  /** M78. A click on an edge's midpoint badge selects it (the panels deselect). */
  onSelect?: (from: string, to: string) => void
  /**
   * M232. The world's card tier. FLOW IS CULLED AT THE FAR TIERS — `summary`
   * and `block` — and animates only at `tail`.
   *
   * READ card-detail.ts BEFORE CHANGING THIS. `tail` is the NEAREST tier (a
   * panel is showing its scrollback tail), `summary` is mid, `block` is
   * farthest; the names describe what a card SHOWS, not how far away it is.
   * The first cut of this milestone culled at `tail` — the plain-English
   * reading, and precisely backwards. It disabled the whole grammar at 100%
   * while leaving it running across a hundred cards at 8%: the exact opposite
   * of the budget the rule exists to protect, and silent, because a feature
   * that never animates looks identical to a feature that is merely idle. It
   * was caught by LOOKING at the golden scene, not by any check.
   */
  cardDetail?: string
}): JSX.Element | null {
  const [hovered, setHovered] = useState<string | null>(null)
  // M232. One frame counter for the layer; positions are read below, never
  // stored. See useEdgeFrames.
  useEdgeFrames()
  const far = cardDetail === 'summary' || cardDetail === 'block' || cardDetail === 'cluster'
  // Read ONCE per render, not once per edge: activityNow() rebuilds the whole
  // map, and calling it inside the segment loop would rebuild it per edge.
  const activity: ReadonlyMap<string, EdgeActivity> = far ? EMPTY_ACTIVITY : activityNow()
  // Rebuilt whenever the panel array's identity changes — which includes every
  // frame of a drag, correctly, because a link's endpoint is moving. That is
  // the same cost EdgeIndicators already pays. The memo is what stops a Canvas
  // re-render that moved no rect (a cursor move, a palette open) repainting.
  const segments = useMemo(() => buildLinkSegments(panels), [panels])
  // The ghost is the one thing in this layer drawn from state that is not
  // persisted. It is built here rather than in its own sibling layer because
  // it needs exactly the same world-space transform the committed links do,
  // and a second absolutely-positioned SVG would be one more node for every
  // hit test in the layer above to walk past.
  const ghost = useMemo(() => {
    if (!draw) return null
    const from = panels.find((p) => p.rect.id === draw.from)
    if (!from) return null
    // A 1x1 rect standing in for the cursor, so the SAME clip arithmetic the
    // committed links use decides where the ghost leaves the source border.
    // Building a second, special-cased path for the in-flight case is how the
    // preview and the committed link end up disagreeing about where a link
    // starts, which reads as the line JUMPING on release.
    const cursorRect = { id: '', x: draw.cursor.x, y: draw.cursor.y, w: 1, h: 1 }
    const anchors = linkAnchors(from.rect, cursorRect)
    return anchors ? linkPath(anchors) : null
  }, [draw, panels])

  // Nothing at all rather than an empty <svg>: the common case is a canvas
  // with no links and no draw in flight, and an empty absolutely-positioned
  // element is one more node for every hit test in the layer above to walk
  // past.
  if (segments.length === 0 && ghost === null) return null
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
        {/* A SEPARATE marker, not a reuse of `link-arrow`: an SVG marker does
            NOT inherit the referencing element's stroke or fill, so pointing
            the ghost at `link-arrow` paints a dashed iris curve ending in a
            solid `--line-strong` arrowhead — a committed-link colour on a
            path whose whole job is to say "not committed yet". */}
        {/* M78. The selected edge's own head: a marker does not inherit its
            path's stroke, so the accent needs a marker of its own. */}
        <marker id="link-arrow-selected" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="link-layer__head--selected" />
        </marker>
        {/* M232. THE FLOW HEAD. A marker does not inherit its path's stroke —
            the same fact that forced `link-arrow-selected` to exist — so an
            edge whose line is lit would otherwise keep a --line-strong
            arrowhead, which is precisely the half-applied material this run
            exists to remove. A third marker, not a reuse of the selected
            one: `selected` means "the user is pointing at this" and `flow`
            means "something is crossing it", and one id standing for both
            would make the DOM lie about which. */}
        <marker id="link-arrow-flow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="link-layer__head--flow" />
        </marker>
        <marker
          id="link-arrow-ghost"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" className="link-layer__ghost-head" />
        </marker>
      </defs>
      {segments.map((s) => {
        // M78. The rule maps and the selection are keyed `from:to` (the
        // automation key every surface shares); the segment's own key is
        // `from to` (M13's, with a space) and stays on `data-link`.
        const ek = `${s.from}:${s.to}`
        const act = activity.get(ek) ?? REST_ACTIVITY
        return (
        <g key={s.key}>
          {/* The hit stroke. Wide and transparent, and it takes pointer events
              where the LAYER does not — .link-layer keeps pointer-events:none
              and this opts back in individually.

              IT MUST NEVER CALL stopPropagation. Canvas's background
              onMouseDown computes its hit from clientX/clientY through toWorld
              and hitTest and never reads event.target, so a mousedown here
              bubbles to it and behaves identically to a click on bare canvas:
              selection clears, focusedId clears, a marquee begins. That is the
              whole mechanism by which M35 keeps M13's guarantee while making
              a link hoverable, and verify:panels 127 is what fails if it is
              broken. A stopPropagation added here would look entirely
              reasonable in review and would pin a panel live for the rest of
              the run, holding a WebGL context, with nothing on screen to
              explain it.

              Fix round 1: while `onRemove` is undefined (the merged view,
              where links are read-only) it takes NO pointer events at all,
              via an inline override rather than a second class. Without
              this it still hovered, still lit the `--iris` highlight, and
              still showed a pointer cursor for a click the badge would
              never render to answer — `.palette__row`'s own recorded rule,
              "a pointer cursor over a row that takes neither the hover nor
              a click promises both," applied here. Disabling pointer-events
              entirely also stops the CSS :hover pseudo-class from ever
              matching on this element, which is what silences the
              highlight and the cursor together rather than needing a third
              gate for each. */}
          <path
            className="link-layer__hit"
            d={s.d}
            style={onRemove === undefined ? { pointerEvents: 'none' } : undefined}
            // M78. A CLICK on the edge selects it — click, not mousedown, so
            // the background's mousedown (which clears every selection and
            // must keep reading nothing from event.target, M35's rule) has
            // already run; the selection lands after it. The badge stays the
            // remove control M35 built.
            onClick={onSelect === undefined ? undefined : (event) => { event.stopPropagation(); onSelect(s.from, s.to) }}
            data-link-hit={ek}
            onMouseEnter={onRemove === undefined ? undefined : () => setHovered(s.key)}
            onMouseLeave={
              onRemove === undefined
                ? undefined
                : () => setHovered((h) => (h === s.key ? null : h))
            }
          />
          {/* The visible line MUST immediately follow the hit stroke above —
              not merely come after it eventually. `.link-layer__hit:hover +
              .link-layer__line` in styles.css is an adjacent-SIBLING
              selector, and the badge below is conditionally rendered: were it
              placed between hit and line (as a first draft of this had it),
              the adjacency would break at exactly the moment hover is true —
              the one moment the rule needs to match. The badge renders AFTER
              the line instead, which also gives it the correct paint order
              (on top of the line, at its own location) for free. */}
          {/* M232. The edge's STATE rides on the visible line as a data
              attribute, so every one of the six is a CSS rule rather than a
              second element: rest draws exactly what it drew before, armed
              lifts the stroke, waiting breathes it, blocked holds amber.
              Only `firing` needs a node of its own, below, because only it
              has something to place. */}
          <path
            className={`link-layer__line${selectedKey === ek ? ' link-layer__line--selected' : ''}`}
            data-link={s.key}
            data-link-selected={selectedKey === ek ? 'true' : undefined}
            data-edge-activity={act.kind === 'rest' ? undefined : act.kind}
            d={s.d}
            markerEnd={selectedKey === ek
              ? 'url(#link-arrow-selected)'
              : act.kind === 'rest' || act.kind === 'armed' || act.kind === 'blocked'
                ? 'url(#link-arrow)'
                : 'url(#link-arrow-flow)'}
          />
          {act.kind === 'firing' && (
            /* The packet, at the analytic point on the SAME cubic the label
               uses — `bez()` at the reducer's t. No getPointAtLength, no
               laid-out DOM, and no clock in this component: the reducer owns
               the time and this owns the arithmetic. */
            <>
              <circle
                className="link-layer__packet-halo"
                aria-hidden="true"
                r="11"
                cx={bez(act.t, s.x1, s.c1x, s.c2x, s.x2)}
                cy={bez(act.t, s.y1, s.c1y, s.c2y, s.y2)}
              />
              <circle
                className="link-layer__packet"
                data-link-packet={ek}
                r="4"
                cx={bez(act.t, s.x1, s.c1x, s.c2x, s.x2)}
                cy={bez(act.t, s.y1, s.c1y, s.c2y, s.y2)}
              />
            </>
          )}
          {(hovered === s.key || selectedKey === ek) && onRemove !== undefined && (
            <g
              className={`link-layer__badge${selectedKey === ek ? ' link-layer__badge--selected' : ''}`}
              data-link-remove={s.key}
              transform={`translate(${(s.x1 + 3 * s.c1x + 3 * s.c2x + s.x2) / 8}, ${
                (s.y1 + 3 * s.c1y + 3 * s.c2y + s.y2) / 8
              })`}
              onMouseEnter={() => setHovered(s.key)}
              onMouseDown={(event) => {
                // The badge DOES stop the event, unlike the hit stroke above:
                // removing a link must not ALSO deselect the canvas underneath
                // and start a marquee. This is the one element in this layer
                // that consumes, and it is deliberate.
                event.stopPropagation()
                event.preventDefault()
                onRemove(s.from, s.to)
                setHovered(null)
              }}
            >
              <title>Remove this edge</title>
              <circle r="9" />
              <path d="M -3.5 -3.5 L 3.5 3.5 M 3.5 -3.5 L -3.5 3.5" />
            </g>
          )}
          {(edgeLabels?.get(ek) ?? s.label) !== undefined && (
            <text
              className={`link-layer__label${edgeLabels?.has(ek) ? ' link-layer__label--rule' : ''}`}
              data-link-label={ek}
              // The CURVE's midpoint, not the chord's. At t = 0.5 a cubic
              // reduces to (P0 + 3C1 + 3C2 + P3) / 8, so this needs no path
              // measurement and no DOM — a getPointAtLength call here would
              // make the label position depend on a laid-out element and
              // would not survive the first render.
              //
              // The Y is nudged UP by 16 world units off that exact point,
              // never the badge's — the badge (below) sits ON the midpoint
              // deliberately, since it is the click target for a link the
              // user is pointing at, and moving IT off-curve to dodge the
              // label would be moving the more mechanically important of the
              // two. The label is the one with nothing anchoring it to the
              // midpoint besides "somewhere on the line", so it is the one
              // that moves. 16 clears the badge's r=9 circle plus its 1px
              // stroke with room to spare, and it is in the same WORLD units
              // as everything else in this layer, so the label stays clear
              // of the badge at every zoom level rather than only at one.
              // Fixed rather than hover-gated: it does not need to track
              // `hovered`, and a label that only moved while hovered would
              // itself jump on every mouseenter/mouseleave, which is a worse
              // visual defect than the one this offset removes.
              // M78. A RULE label sits at t = 0.72, toward the arrowhead the
              // reader looks at first, so an edge whose midpoint is off screen
              // still says what it does; the user's own label keeps the midpoint.
              x={edgeLabels?.has(ek) ? bez(0.72, s.x1, s.c1x, s.c2x, s.x2) : (s.x1 + 3 * s.c1x + 3 * s.c2x + s.x2) / 8}
              y={(edgeLabels?.has(ek) ? bez(0.72, s.y1, s.c1y, s.c2y, s.y2) : (s.y1 + 3 * s.c1y + 3 * s.c2y + s.y2) / 8) - 16}
              textAnchor="middle"
            >
              {edgeLabels?.get(ek) ?? s.label}
            </text>
          )}
        </g>
        )
      })}
      {ghost !== null && (
        <path className="link-layer__ghost" d={ghost} markerEnd="url(#link-arrow-ghost)" />
      )}
    </svg>
  )
}

export const LinkLayer = memo(LinkLayerImpl)
