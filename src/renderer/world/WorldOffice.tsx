import { memo, useEffect, useMemo, useRef, type JSX } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { getAgent, getAgentIds } from './agent-world-store'
import { STUDIO } from './world-palette'
import { studioEnv } from './world-gloss'
import { agentTint, type Slot, type Station } from './world-scene'
import { roundedRectPath, slabHalf, TABLE_PLATE } from './world-set'
import { leavePose } from './world-transition'
import { TrimLine, WorldPlatform } from './WorldPlatform'
import { WorldProps, ZoneLabel } from './WorldProps'
import type { AgentStatus } from '@shared/world-events'

/**
 * The room: the platform, the meeting table, the set dressing, and a desk per agent.
 *
 * Reached only through the lazily-loaded WorldView (CLAUDE.md's library table).
 * Furniture is plain boxes and cylinders in standard materials — no textures to
 * fetch. The platform and its trim are `WorldPlatform`, the cubes, stools and
 * whiteboard `WorldProps`; this file is what the AGENTS stand at.
 *
 * Everything that stands on the platform CASTS a shadow (the key light's map,
 * WorldView) and the desks' parts are marked individually: three has no group-
 * level `castShadow`, so a mesh left unmarked is a hole in the room's shadows
 * with nothing logged.
 */

const DESK = { w: 1.7, d: 0.85, top: 0.78 } as const

/**
 * A desk glides to its slot when the arc re-flows, at about the pace a robot
 * walks — and when its agent has left (`leftAt`, M417), it stays where it stood
 * and sinks through the floor on the robot's own curve (`leavePose`), so the
 * two go together instead of the desk vanishing under a robot still standing.
 */
function useGlide(target: Slot | undefined, leftAt: number | null, reduced: boolean) {
  const group = useRef<THREE.Group>(null)
  const ready = useRef(false)
  const leaving = useRef(leftAt)
  leaving.current = leftAt
  const snap = useRef(reduced)
  snap.current = reduced
  useFrame((_, delta) => {
    const g = group.current
    if (!g || !target) return
    if (leaving.current !== null) {
      const pose = leavePose(performance.now() - leaving.current, snap.current ? 0 : undefined)
      g.position.y = -pose.sink
      g.scale.setScalar(Math.max(pose.scale, 1e-4))
      g.visible = pose.scale > 1e-3
      return
    }
    if (g.position.y !== 0 || g.scale.x !== 1) {
      // Back before the leave was over: up again at once, which a desk can afford (it has no face to pop).
      g.position.y = 0
      g.scale.setScalar(1)
      g.visible = true
    }
    if (!ready.current) {
      g.position.set(target.x, 0, target.z)
      g.rotation.y = target.facing
      ready.current = true
      return
    }
    const k = 1 - Math.exp(-5 * Math.min(delta, 0.1))
    g.position.x += (target.x - g.position.x) * k
    g.position.z += (target.z - g.position.z) * k
    g.rotation.y += Math.atan2(Math.sin(target.facing - g.rotation.y), Math.cos(target.facing - g.rotation.y)) * k
  })
  return group
}

/** How lit a desk's screen is for each status — the room's other, quieter readout. */
const SCREEN_GLOW: Readonly<Record<AgentStatus, number>> = {
  working: 1.3, thinking: 0.8, idle: 0.12, waiting_approval: 0.55, error: 1.0
}

/** Where the zone label floats: above the robot's head and its name pill, so the two never overlap. */
const LABEL_Y = 2.55

function Desk({ station, label, leftAt, reduced }: { station: Station; label: string | null; leftAt: number | null; reduced: boolean }): JSX.Element | null {
  const slot = station.desk
  const group = useGlide(slot, leftAt, reduced)
  const screen = useRef<THREE.MeshStandardMaterial>(null)
  const tint = useMemo(() => new THREE.Color(agentTint(station.agentId, getAgentIds())), [station.agentId])
  const body = useMemo(() => new THREE.Color(STUDIO.desk), [])
  const side = useMemo(() => new THREE.Color(STUDIO.desk).multiplyScalar(0.86), [])
  const dark = useMemo(() => new THREE.Color(STUDIO.dark), [])
  const agentId = station.agentId
  useFrame((_, delta) => {
    const material = screen.current
    if (!material) return
    const goal = SCREEN_GLOW[getAgent(agentId)?.status ?? 'idle']
    material.emissiveIntensity += (goal - material.emissiveIntensity) * (1 - Math.exp(-6 * Math.min(delta, 0.1)))
  })
  if (!slot) return null
  // The desk's local +z points at the table; the robot stands at local −z, so
  // the screen faces −z and the keyboard sits on the robot's side of it.
  return (
    <group ref={group}>
      <mesh position={[0, DESK.top - 0.035, 0]} castShadow receiveShadow>
        <boxGeometry args={[DESK.w, 0.07, DESK.d]} />
        <meshStandardMaterial color={body} roughness={0.6} metalness={0.02} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (DESK.w / 2 - 0.08), (DESK.top - 0.07) / 2, 0]} castShadow>
          <boxGeometry args={[0.07, DESK.top - 0.07, DESK.d - 0.12]} />
          <meshStandardMaterial color={side} roughness={0.7} />
        </mesh>
      ))}
      <mesh position={[0, DESK.top + 0.17, 0.12]} castShadow>
        <boxGeometry args={[0.62, 0.38, 0.04]} />
        <meshStandardMaterial color={dark} roughness={0.5} />
      </mesh>
      <mesh position={[0, DESK.top + 0.17, 0.098]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[0.55, 0.31]} />
        <meshStandardMaterial ref={screen} color={dark} emissive={tint} emissiveIntensity={0.12} roughness={0.4} />
      </mesh>
      <mesh position={[0, DESK.top + 0.025, 0.12]}>
        <boxGeometry args={[0.1, 0.05, 0.1]} />
        <meshStandardMaterial color={dark} />
      </mesh>
      <mesh position={[0, DESK.top + 0.012, -0.2]}>
        <boxGeometry args={[0.5, 0.025, 0.16]} />
        <meshStandardMaterial color={dark} roughness={0.6} />
      </mesh>
      {label !== null ? <ZoneLabel text={label} y={LABEL_Y} /> : null}
    </group>
  )
}

/**
 * The meeting table: a black glossy rounded slab on a column, a thin cyan line
 * just inside its rim. The gloss is the robots' clearcoat recipe — `RoomEnvironment`
 * built in code, set on THIS material and never as `scene.environment` — and
 * without it a black clearcoat reflects nothing but the key light's one hot spot.
 */
function MeetingTable({ waiting }: { waiting: boolean }): JSX.Element {
  const gl = useThree((s) => s.gl)
  const env = useMemo(() => studioEnv(gl), [gl])
  const plate = useMemo(() => {
    const shape = new THREE.Shape()
    const outline = roundedRectPath(TABLE_PLATE.hx, TABLE_PLATE.hz, TABLE_PLATE.radius, 12)
    outline.forEach(([x, z], i) => (i === 0 ? shape.moveTo(x, -z) : shape.lineTo(x, -z)))
    shape.closePath()
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: TABLE_PLATE.thickness, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 3, curveSegments: 12 })
    // An extrusion runs along +z; the plate lies flat, its top at `top`.
    geometry.rotateX(-Math.PI / 2)
    geometry.translate(0, TABLE_PLATE.top - TABLE_PLATE.thickness, 0)
    return geometry
  }, [])
  useEffect(() => () => plate.dispose(), [plate])
  const line = useMemo(() => roundedRectPath(TABLE_PLATE.hx - TABLE_PLATE.line, TABLE_PLATE.hz - TABLE_PLATE.line, TABLE_PLATE.radius - TABLE_PLATE.line, 12), [])
  return (
    <group>
      <mesh geometry={plate} castShadow receiveShadow>
        <meshPhysicalMaterial color={STUDIO.tableTop} roughness={0.2} metalness={0.15} clearcoat={1} clearcoatRoughness={0.08} envMap={env} envMapIntensity={0.85} />
      </mesh>
      <mesh position={[0, (TABLE_PLATE.top - TABLE_PLATE.thickness) / 2, 0]} castShadow>
        <cylinderGeometry args={[0.24, 0.36, TABLE_PLATE.top - TABLE_PLATE.thickness, 28]} />
        <meshStandardMaterial color="#14171d" roughness={0.5} metalness={0.2} />
      </mesh>
      {/* M422: the decision table — amber while anyone waits at it on a person, the room's cyan otherwise. */}
      <TrimLine path={line} y={TABLE_PLATE.top + 0.033} half={TABLE_PLATE.lineHalf} glowIn={TABLE_PLATE.glow * (waiting ? 1.6 : 1)} glowOut={TABLE_PLATE.glow * (waiting ? 1.6 : 1)} peak={waiting ? 0.55 : 0.38} {...(waiting ? { hue: STUDIO.amber } : {})} />
    </group>
  )
}

export const WorldOffice = memo(function WorldOffice({
  stations,
  leftAt,
  arcRadius,
  reduced,
  waiting
}: {
  stations: readonly Station[]
  /** When each leaving agent left (see `useLeavers`, WorldView): its desk sinks with its robot. */
  leftAt: ReadonlyMap<string, number>
  arcRadius: number
  reduced: boolean
  /** How many live agents wait on a person — the table is where they stand. */
  waiting: number
}): JSX.Element {
  const half = slabHalf(arcRadius)
  // "DESK 01" floats over the first desk in the room — the first station that has one (a conductor has none).
  const first = stations.find((station) => station.desk !== undefined)?.agentId ?? null
  return (
    <group>
      <WorldPlatform arcRadius={arcRadius} />
      <MeetingTable waiting={waiting > 0} />
      <WorldProps half={half} reduced={reduced} />
      {stations.map((station) => (
        <Desk key={station.agentId} station={station} label={station.agentId === first ? 'DESK 01' : null} leftAt={leftAt.get(station.agentId) ?? null} reduced={reduced} />
      ))}
    </group>
  )
})
