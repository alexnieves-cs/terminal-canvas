import { memo, type JSX, type RefObject } from 'react'
import { Html } from '@react-three/drei'
import { useAgent } from './agent-world-store'
import { cardLine, statusWord, type CardLine } from './world-scene'

/**
 * The floating status card over a robot: the agent's name and status word, and
 * the latest thing it thought, called or said.
 *
 * A DOM card, not a texture, so it is crisp at any zoom, selectable, and read
 * by assistive tech (the canvas itself is opaque to it). It re-renders when
 * ITS agent's record changes and for no one else's — `useAgent` is a
 * per-agent subscription — and it is a child of the robot's group, so it
 * follows the robot without a position of its own.
 *
 * `pointerEvents="none"`: a card over a drag must not eat the drag that orbits
 * the camera.
 *
 * `portal` is load-bearing and fails SILENTLY: without it drei mounts the card
 * in the canvas's parent, then MOVES it to the event-connected element once
 * R3F connects events — which is a new effect target, so the first Html to
 * mount unmounts its React root from inside a layout-effect cleanup. React 19
 * defers that unmount until the render ends, and it then empties the root the
 * re-run effect just built: that agent's card is a blank wrapper, for good,
 * with only a console warning ("synchronously unmount a root"). A card layer
 * of our own is a target that never changes. The layer also keeps the cards
 * clipped to the view and under the page's own buttons.
 *
 * What it paints is the feed's own text. Today that is simulated; the day a
 * real session feeds the store, the producer is where secrets get scrubbed
 * (the renderer has no second gate to put here), so a feed that cannot
 * promise that should not be wired in unscrubbed.
 */
function Line({ line }: { line: CardLine }): JSX.Element | null {
  switch (line.kind) {
    case 'none':
      return null
    case 'thought':
      return <p className="world-card__line world-card__line--thought">{line.text}</p>
    case 'message':
      return <p className="world-card__line world-card__line--message">{line.text}</p>
    case 'error':
      return <p className="world-card__line world-card__line--error">{line.text}</p>
    case 'tool':
      return (
        <p className="world-card__line world-card__line--tool" data-state={line.state}>
          <span className="world-card__tool">{line.tool}</span>
          {line.text}
          {line.detail !== undefined ? <span className="world-card__detail">{line.detail}</span> : null}
        </p>
      )
  }
}

export const WorldCard = memo(function WorldCard({ agentId, y, layer }: { agentId: string; y: number; layer: RefObject<HTMLElement | null> }): JSX.Element | null {
  const record = useAgent(agentId)
  if (!record || !layer.current) return null
  const word = statusWord(record.status)
  return (
    <Html position={[0, y, 0]} zIndexRange={[20, 0]} pointerEvents="none" portal={layer as RefObject<HTMLElement>}>
      <div className="world-card" data-status={record.status} role="group" aria-label={`${record.name}: ${word}`}>
        <div className="world-card__head">
          <span className="world-card__name">{record.name}</span>
          <span className="world-card__status">{word}</span>
        </div>
        <Line line={cardLine(record)} />
      </div>
    </Html>
  )
})
