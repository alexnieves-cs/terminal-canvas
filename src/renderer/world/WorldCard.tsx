import { memo, useRef, type JSX, type MutableRefObject, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { useAgent } from './agent-world-store'
import { cardLine, statusTone, statusWord, type CardLine } from './world-scene'
import { cardStand, cardTiltDeg } from './world-transition'

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
 * It STANDS UP as its robot arrives: lying back (rotateX, hinged on its bottom
 * edge) and faded at the start of the robot's pop, facing the camera at the
 * end. `--world-tilt` is written straight onto the card from the frame loop —
 * a React state here would re-render the card 60 times a second — and only
 * while it is changing, so a card at rest costs nothing.
 *
 * **Only the nearest few agents get the full card** (`cardTiers`, world-perf.ts);
 * the rest wear a status DOT — the same element, the same tone, no text. A card
 * is a live React tree that follows a 3D point every frame, so a room of forty
 * agents would be forty of them, and the ones too far to read were never
 * legible anyway. The dot keeps the one thing a far agent can still say, its
 * state, in the colour the 2D canvas uses for it (`data-tone`, the shared
 * `[data-tone]` rule block — nothing here chooses a hue).
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

export const WorldCard = memo(function WorldCard({ agentId, y, layer, pop, compact }: { agentId: string; y: number; layer: RefObject<HTMLElement | null>; pop: MutableRefObject<number>; compact: boolean }): JSX.Element | null {
  const record = useAgent(agentId)
  const card = useRef<HTMLDivElement>(null)
  const written = useRef(-1)
  useFrame(() => {
    const node = card.current
    if (!node) return
    const stand = cardStand(pop.current)
    if (stand === written.current) return
    written.current = stand
    node.style.setProperty('--world-tilt', `${cardTiltDeg(stand).toFixed(2)}deg`)
    node.style.opacity = String(Math.min(1, stand * 2))
  })
  if (!record || !layer.current) return null
  const word = statusWord(record.status)
  const tone = statusTone(record.status)
  return (
    <Html position={[0, y, 0]} zIndexRange={[20, 0]} pointerEvents="none" portal={layer as RefObject<HTMLElement>}>
      {compact ? (
        <div ref={card} className="world-dot" style={{ opacity: 0 }} data-status={record.status} data-tone={tone} role="img" aria-label={`${record.name}: ${word}`} />
      ) : (
        <div ref={card} className="world-card" style={{ opacity: 0 }} data-status={record.status} data-tone={tone} role="group" aria-label={`${record.name}: ${word}`}>
          <div className="world-card__head">
            <span className="world-card__name">{record.name}</span>
            <span className="world-card__status">{word}</span>
          </div>
          <Line line={cardLine(record)} />
        </div>
      )}
    </Html>
  )
})
