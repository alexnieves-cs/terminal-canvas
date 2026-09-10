import { memo, useMemo, type JSX } from 'react'
import { linkAnchors, linkControls, linkPath } from './link-geometry'
import { agentLinkPlan } from '@shared/agent-links'
import { useAgentLinksLayer } from './agent-links-store'
import type { Panel } from '@renderer/panels/panels'

/**
 * M247. Agent → object links, as one SVG inside `.world` beside LinkLayer.
 *
 * INSIDE `.world` so it pans and zooms with the panels for free, and BENEATH
 * them for LinkLayer's reason (a line over a terminal hides the output the app
 * exists to show). The curve is link-geometry.ts's — the same anchors and
 * control points — never a second shape that would disagree with an authored
 * link between the same two panels.
 *
 * Every edge says something: `read` is thin and dashed, `wrote` solid, and
 * `draft` carries the accent and a badge that opens the draft's review. The
 * layer takes no pointer events; the badge is the ONE element that consumes a
 * click (LinkLayer's rule, for LinkLayer's reason: anything else here that
 * stopped propagation would stop a background mousedown clearing focus).
 *
 * The level of detail is `agentLinkPlan`'s: every link with its word at the
 * nearest tier (`tail`), one per agent and kind at `summary`, none at `block`.
 */
function AgentLinkLayerImpl({ panels, cardDetail, hidden, onOpenDraft }: {
  panels: Panel[]
  cardDetail?: string
  /** The agent-links toggle is off. */
  hidden: boolean
  /** Open the review of the draft pending on this object (a sheet). */
  onOpenDraft?: (objectId: string) => void
}): JSX.Element | null {
  const links = useAgentLinksLayer()
  const byId = useMemo(() => new Map(panels.map((p) => [p.rect.id, p.rect])), [panels])
  const plan = useMemo(() => hidden ? [] : agentLinkPlan(links, cardDetail, (id) => {
    const r = byId.get(id)
    return r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : undefined
  }), [links, cardDetail, byId, hidden])
  // Nothing at all rather than an empty <svg>, LinkLayer's rule: one less node for every hit test.
  if (plan.length === 0) return null
  return (
    <svg className="agent-link-layer" aria-hidden="true">
      <defs>
        <marker id="agent-link-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="agent-link-layer__head" />
        </marker>
        {/* A marker does not inherit its path's stroke, so the draft head needs its own. */}
        <marker id="agent-link-arrow-draft" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="agent-link-layer__head--draft" />
        </marker>
      </defs>
      {plan.map((l) => {
        const from = byId.get(l.agent)
        const to = byId.get(l.object)
        if (!from || !to) return null
        const anchors = linkAnchors(from, to)
        if (!anchors) return null
        const { c1, c2 } = linkControls(anchors)
        // The curve's own midpoint, the closed form LinkLayer uses — no laid-out path to measure.
        const mx = (anchors.x1 + 3 * c1.x + 3 * c2.x + anchors.x2) / 8
        const my = (anchors.y1 + 3 * c1.y + 3 * c2.y + anchors.y2) / 8
        return (
          <g key={`${l.agent} ${l.object}`}>
            <path
              className={`agent-link-layer__line agent-link-layer__line--${l.kind}`}
              data-agent-link={`${l.agent}:${l.object}`}
              data-agent-link-kind={l.kind}
              data-agent-link-count={l.count}
              d={linkPath(anchors)}
              markerEnd={l.kind === 'draft' ? 'url(#agent-link-arrow-draft)' : 'url(#agent-link-arrow)'}
            />
            {l.label !== undefined && (
              <text className={`agent-link-layer__label agent-link-layer__label--${l.kind}`} x={mx} y={my - 14} textAnchor="middle">{l.label}</text>
            )}
            {l.kind === 'draft' && onOpenDraft !== undefined && (
              <g className="agent-link-layer__badge" data-agent-link-review={l.object} transform={`translate(${mx}, ${my})`}
                onMouseDown={(event) => { event.stopPropagation(); event.preventDefault(); onOpenDraft(l.object) }}>
                <title>Review this draft</title>
                <circle r="8" />
                <path d="M -3.5 0 L -1 2.5 L 3.5 -2.5" />
              </g>
            )}
          </g>
        )
      })}
    </svg>
  )
}

export const AgentLinkLayer = memo(AgentLinkLayerImpl)
