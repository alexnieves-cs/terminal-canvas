import { useEffect, useState, type JSX, type RefObject } from 'react'
import { useWorldContext } from './world-context-store'
import { useRoster } from './world-roster'
import { peerFollowTarget } from './world-select'
import type { CameraApi } from './world-set'

/**
 * Who else is here (M426): the teammates in this workspace's presence roster,
 * top-right over the room — the ones in the room (`mode: world`) first — and
 * FOLLOW: a press keeps the camera on whatever agent that teammate is looking
 * at, gliding to the next one when they move, until a second press, or until
 * what they look at is not in this room.
 *
 * Plain DOM, no three.js. It reads the context Canvas publishes from the
 * presence roster (main owns awareness; the room never touches it), and moves
 * the camera through the one `CameraApi` the chrome already holds.
 */
export function WorldPeers({ camera }: { camera: RefObject<CameraApi | null> }): JSX.Element | null {
  const { peers } = useWorldContext()
  const [following, setFollowing] = useState<string | null>(null)
  const followed = peers.find((p) => p.userId === following)
  const roster = useRoster()
  const target = peerFollowTarget(followed, roster.map((a) => a.agentId))

  // Glide to what they look at each time it changes; a teammate who left the roster ends the follow.
  useEffect(() => {
    if (following === null) return
    if (followed === undefined) { setFollowing(null); return }
    if (target !== null) camera.current?.focus(target)
  }, [following, followed === undefined, target, camera])

  if (peers.length === 0) return null
  const ordered = [...peers].sort((a, b) => Number(b.mode === 'world') - Number(a.mode === 'world'))
  return (
    <div className="world-peers" role="group" aria-label="Teammates here" data-world-peers>
      {following !== null && followed !== undefined ? (
        <span className="world-peers__follow" role="status">Following {followed.name}{target === null ? ' — not on an agent here' : ''}</span>
      ) : null}
      {ordered.map((p) => (
        <button
          key={p.userId}
          type="button"
          className="world-peers__peer"
          data-in-room={p.mode === 'world' ? '' : undefined}
          data-idle={p.active ? undefined : ''}
          aria-pressed={following === p.userId}
          title={`${p.name}${p.mode === 'world' ? ' — in the room' : ''}. ${following === p.userId ? 'Stop following' : 'Follow'}`}
          onClick={() => setFollowing((f) => (f === p.userId ? null : p.userId))}
          style={{ background: p.color }}
        >
          {p.initials}
        </button>
      ))}
    </div>
  )
}
