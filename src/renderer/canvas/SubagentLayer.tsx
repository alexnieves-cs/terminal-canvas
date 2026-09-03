import { Fragment, memo, type JSX } from 'react'
import { REVIEW_GAP, type TerminalPanel } from '@renderer/panels/panels'
import { useSubagents } from '@renderer/session/subagent-store'

/**
 * Subagent nodes: one per subagent, beside the panel that spawned it.
 *
 * INSIDE .world, unlike EdgeIndicators — and the contrast is the point. A
 * pip's whole job is to stay pinned to the viewport's physical edge whatever
 * the camera does, which is why it is chrome. A subagent node belongs to a
 * PLACE, beside its parent, so it must pan and zoom with it.
 *
 * These are NOT Panels. Panel is the persisted type, and a panel that had to
 * be filtered out of every save would be a type fighting its own contract; a
 * node is derived from the watcher and rebuilt at every launch. The
 * consequence worth knowing is the good one: a node is not in `panels`, so it
 * never reaches Canvas's kind partition, let alone assignTiers or
 * registry.ensure. There is no code path from here to a PTY or a WebGL
 * context — an invariant rather than a guard someone has to remember.
 */

const NODE_W = 200
const NODE_H = 56
const NODE_GAP = 8

export interface SubagentLayerProps {
  panels: TerminalPanel[]
}

/**
 * One `<SubagentGroup>` child per TERMINAL panel — a review node has no
 * subagents of its own to show, and it is already outside `terminalPanels`
 * by the time this component sees it. This top-level component is not itself
 * memoised: `panels` is a fresh array every render (the same `.map` identity
 * churn `terminalPanels` inherits from `panels`), so memoising it would never
 * hit. The saving lives one level down, on the child that actually holds a
 * store subscription.
 */
export function SubagentLayer({ panels }: SubagentLayerProps): JSX.Element {
  return (
    <>
      {panels.map((panel) => (
        <SubagentGroup key={panel.rect.id} panel={panel} />
      ))}
    </>
  )
}

interface SubagentGroupProps {
  panel: TerminalPanel
}

/**
 * Reads the store for ITS OWN panel id, and only its own — the same choice
 * RailPanelRow makes for agent state. subagent-store.ts fans updates out per
 * panel id precisely so one panel's subagents changing does not notify every
 * other panel's group; hoisting this read to SubagentLayer and passing
 * records down as a prop would collapse that fan-out back into one
 * subscription; every subagent update anywhere would re-render every group.
 *
 * memo()'d for the same reason TerminalPanel and ReviewNode are: `panel` is
 * carried by reference through `setPanelRect`'s `{ ...p, rect }`, so a drag
 * on panel A leaves every OTHER panel's object identity untouched, and a drag
 * frame therefore re-renders only the one group whose parent actually moved.
 *
 * A panel with no subagents renders `null` and costs exactly one hook.
 */
const SubagentGroup = memo(function SubagentGroup({ panel }: SubagentGroupProps): JSX.Element | null {
  const subagents = useSubagents(panel.rect.id)
  if (subagents === undefined) return null

  const { rect, z } = panel
  // World units, never divided by viewport.scale: nodes scale WITH the
  // panels, the same rule cascadeCentre's step already follows. `.world`'s
  // own transform is what turns this into a screen position.
  const nodeX = rect.x + rect.w + REVIEW_GAP

  if (subagents.ambiguous) {
    // Visible, never silent: an absent feature reads as a broken one. One
    // line rather than a guess at attribution, because a mixed checkout has
    // no correct per-panel answer to draw nodes for.
    //
    // The COUNT comes off the wire (slugSharing, one derivation shared with
    // the refusal itself), never hardcoded to 2: three panels in one
    // repository is reachable and `attributable` handles it correctly, so a
    // literal would put a wrong number on screen in the one place this
    // feature speaks to the user in a sentence — and a sentence that is
    // wrong about something checkable is worse than one that says nothing.
    return (
      <>
        {/* M67. The same leader a node gets, so the notice reads as this
            panel's: without it the box floated beside two panels and
            belonged to neither (M61's critic). Aimed at the cap's line. */}
        <div className="subagent-edge" style={{ left: rect.x + rect.w, top: rect.y + 14, width: REVIEW_GAP }} />
        <div
          className="subagent-ambiguous"
          data-panel-id={rect.id}
          data-subagent-ambiguous
          style={{ left: nodeX, top: rect.y, width: NODE_W, zIndex: z }}
        >
          <div className="subagent-ambiguous__type">subagents</div>
          {subagents.sharing} panels share this repository, so their subagents cannot be told apart
        </div>
      </>
    )
  }

  // Nothing to draw at all. Guarded on the overflow too: a panel whose every
  // record was over the cap is impossible today (the cap fills first), but a
  // `+N more` with no nodes above it is the one state this early return would
  // silently eat if that ever changed.
  if (subagents.records.length === 0 && subagents.overflow === 0) return null

  return (
    <>
      {subagents.records.map((record, i) => {
        const nodeY = rect.y + i * (NODE_H + NODE_GAP)
        const nodeMidY = nodeY + NODE_H / 2
        return (
          <Fragment key={record.id}>
            {/* A straight horizontal run from the panel's right edge to the
                node's left edge. A plain div rather than an <svg>: it never
                needs its own coordinate space, and .world's transform already
                puts it exactly where a border-only rect would be measured. */}
            <div
              className="subagent-edge"
              style={{ left: rect.x + rect.w, top: nodeMidY, width: REVIEW_GAP }}
            />
            <div
              className={`subagent-node${record.state === 'done' ? ' subagent-node--done' : ''}`}
              data-subagent-id={record.id}
              data-subagent-state={record.state}
              data-panel-id={rect.id}
              style={{ left: nodeX, top: nodeY, width: NODE_W, height: NODE_H, zIndex: z }}
            >
              <div className="subagent-node__type">{record.agentType}</div>
              <div className="subagent-node__desc">{record.description}</div>
            </div>
          </Fragment>
        )
      })}
      {subagents.overflow > 0 && (
        /* The cap's remainder, NAMED rather than silently absent — the same
           `+N more` REVIEW_FILE_CAP already renders for the same reason. A
           column that just stops reads as "the agent spawned this many",
           which is a wrong answer; this one reads as "there are more than a
           node column can show". Positioned as the row after the last node,
           so it inherits the same stacking arithmetic rather than restating
           it. */
        <div
          className="subagent-more"
          data-subagent-overflow
          data-panel-id={rect.id}
          style={{
            left: nodeX,
            top: rect.y + subagents.records.length * (NODE_H + NODE_GAP),
            width: NODE_W,
            zIndex: z
          }}
        >
          +{subagents.overflow} more
        </div>
      )}
    </>
  )
})
