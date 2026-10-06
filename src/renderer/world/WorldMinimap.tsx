import { useEffect, useReducer, useRef, type JSX, type MouseEvent, type RefObject } from 'react'
import { useAgentIds } from './agent-world-store'
import { useWorldContext } from './world-context-store'
import { robotTint } from './world-palette'
import { cameraWedge, fromMap, MINIMAP_SIZE, minimapShown, planKey, toMap, watchersOn, type RoomPlan } from './world-minimap'
import { useRoster } from './world-roster'
import { selectAgent, useSelectedAgent } from './world-select'
import { TABLE_PLATE, type CameraApi } from './world-set'

/**
 * The room from above (M434), bottom-left over the camera buttons: the slab, a
 * dot per robot in its shell's colour (amber-ringed while it waits on a
 * person, ringed in the accent when picked), the meeting table, and the
 * camera — where it looks, and a line to where it stands. A press on the floor
 * glides the camera to look there; a press on a dot picks that robot and
 * glides to it, as the tour and following a teammate do.
 *
 * Plain DOM, no three.js (`world.door.1`): the scene is reached through the
 * `CameraApi` it fills in, which reports the plan (`plan()`) — polled a few
 * times a second, never per frame, and re-rendered only when what the map can
 * show has moved (`planKey`). Shown only once the room holds
 * `MINIMAP_MIN_AGENTS`; a smaller room is all in the opening shot.
 */

/** How often the map asks the scene where things are. A robot walks ~2.4 units a second; a few looks a second keeps a dot honest. */
const POLL_MS = 250

export function WorldMinimap({ camera }: { camera: RefObject<CameraApi | null> }): JSX.Element | null {
  const roster = useRoster()
  const order = useAgentIds()
  const picked = useSelectedAgent()
  const peers = useWorldContext().peers
  const shown = minimapShown(roster.length)
  const plan = useRef<RoomPlan | null>(null)
  const key = useRef('')
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    if (!shown) return
    const look = (): void => {
      const next = camera.current?.plan() ?? null
      const nextKey = planKey(next)
      plan.current = next
      if (nextKey !== key.current) { key.current = nextKey; redraw() }
    }
    look()
    const timer = window.setInterval(look, POLL_MS)
    return () => window.clearInterval(timer)
  }, [camera, shown])
  const p = plan.current
  if (!shown || p === null) return null
  const S = MINIMAP_SIZE
  const at = (pt: { x: number; z: number }): { x: number; y: number } => toMap(pt, p.half, S)
  const slab = at({ x: -p.half, z: -p.half })
  const table = { a: at({ x: -TABLE_PLATE.hx, z: -TABLE_PLATE.hz }), b: at({ x: TABLE_PLATE.hx, z: TABLE_PLATE.hz }) }
  const eye = at(p.camera)
  const aim = at(p.target)
  const wedge = cameraWedge(p.camera, p.target).map((pt) => { const m = at(pt); return `${m.x},${m.y}` }).join(' ')
  const onFloor = (event: MouseEvent<SVGSVGElement>): void => {
    const box = event.currentTarget.getBoundingClientRect()
    const floor = fromMap(event.clientX - box.left, event.clientY - box.top, p.half, S)
    camera.current?.centre(floor.x, floor.z)
  }
  return (
    <svg className="world-minimap" width={S} height={S} viewBox={`0 0 ${S} ${S}`} role="group" aria-label="Map of the room — press to look there" onClick={onFloor} data-world-minimap>
      <rect className="world-minimap__slab" x={slab.x} y={slab.y} width={S - 2 * slab.x} height={S - 2 * slab.y} rx={6} />
      <rect className="world-minimap__table" x={table.a.x} y={table.a.y} width={table.b.x - table.a.x} height={table.b.y - table.a.y} rx={2} />
      {/* The camera: a line from where it stands (clipped by the map's edge when it stands off the slab) to what it looks at. */}
      <polygon className="world-minimap__wedge" points={wedge} />
      <line className="world-minimap__sight" x1={eye.x} y1={eye.y} x2={aim.x} y2={aim.y} />
      <circle className="world-minimap__aim" cx={aim.x} cy={aim.y} r={3} data-world-minimap-aim />
      {p.agents.map((a) => {
        const m = at(a.at)
        const name = roster.find((r) => r.agentId === a.agentId)?.name ?? a.agentId
        return (
          <circle key={a.agentId} className="world-minimap__agent" cx={m.x} cy={m.y} r={4.5} fill={robotTint(a.agentId, order)}
            data-waiting={a.waiting ? '' : undefined} data-picked={picked === a.agentId ? '' : undefined} data-world-minimap-agent={a.agentId}
            onClick={(event) => {
              event.stopPropagation()
              selectAgent(a.agentId)
              camera.current?.focus(a.agentId)
            }}>
            <title>{name}</title>
          </circle>
        )
      })}
      {p.agents.map((a) => {
        const m = at(a.at)
        return watchersOn(peers, a.agentId).map((w, i) => (
          <text key={w.userId} className="world-minimap__watcher" x={m.x + 7} y={m.y - 4 - i * 9} data-world-watcher={a.agentId}>{w.initials}</text>
        ))
      })}
    </svg>
  )
}
