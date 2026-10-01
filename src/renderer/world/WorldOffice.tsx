import { memo, useMemo, useRef, type JSX } from 'react'
import { useFrame } from '@react-three/fiber'
import { Grid } from '@react-three/drei'
import * as THREE from 'three'
import { getAgent } from './agent-world-store'
import { agentTint, TABLE, type Slot, type Station } from './world-scene'
import type { WorldPalette } from './world-palette'
import type { AgentStatus } from '@shared/world-events'

/**
 * The room: floor, grid, the meeting table, and a desk per agent.
 *
 * Reached only through the lazily-loaded WorldView (CLAUDE.md's library table).
 * Furniture is plain boxes and cylinders in flat standard materials — the same
 * flat-colour language as the Quaternius robots, no textures to fetch.
 */

const DESK = { w: 1.7, d: 0.85, top: 0.78 } as const

/** A desk glides to its slot when the arc re-flows, at about the pace a robot walks. */
function useGlide(target: Slot | undefined) {
  const group = useRef<THREE.Group>(null)
  const ready = useRef(false)
  useFrame((_, delta) => {
    const g = group.current
    if (!g || !target) return
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

function Desk({ station, palette }: { station: Station; palette: WorldPalette }): JSX.Element | null {
  const slot = station.desk
  const group = useGlide(slot)
  const screen = useRef<THREE.MeshStandardMaterial>(null)
  const tint = useMemo(() => new THREE.Color(agentTint(station.agentId)), [station.agentId])
  const wood = useMemo(() => new THREE.Color(palette.floor).lerp(new THREE.Color(palette.dark ? '#ffffff' : '#000000'), palette.dark ? 0.2 : 0.16), [palette])
  const dark = useMemo(() => new THREE.Color(palette.dark ? '#07080b' : '#2a2f3a'), [palette])
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
      <mesh position={[0, DESK.top - 0.035, 0]}>
        <boxGeometry args={[DESK.w, 0.07, DESK.d]} />
        <meshStandardMaterial color={wood} roughness={0.7} metalness={0.05} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (DESK.w / 2 - 0.08), (DESK.top - 0.07) / 2, 0]}>
          <boxGeometry args={[0.07, DESK.top - 0.07, DESK.d - 0.12]} />
          <meshStandardMaterial color={wood} roughness={0.8} />
        </mesh>
      ))}
      <mesh position={[0, DESK.top + 0.17, 0.12]}>
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
    </group>
  )
}

function MeetingTable({ palette }: { palette: WorldPalette }): JSX.Element {
  const wood = useMemo(() => new THREE.Color(palette.floor).lerp(new THREE.Color(palette.dark ? '#ffffff' : '#000000'), palette.dark ? 0.2 : 0.16), [palette])
  return (
    <group>
      <mesh position={[0, 0.74, 0]}>
        <cylinderGeometry args={[TABLE.radius, TABLE.radius, 0.07, 48]} />
        <meshStandardMaterial color={wood} roughness={0.55} metalness={0.05} />
      </mesh>
      <mesh position={[0, 0.37, 0]}>
        <cylinderGeometry args={[0.22, 0.34, 0.74, 24]} />
        <meshStandardMaterial color={wood} roughness={0.8} />
      </mesh>
      {/* A thin lit ring just inside the rim: the table reads as "the place" at a distance. */}
      <mesh position={[0, 0.78, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[TABLE.radius - 0.16, TABLE.radius - 0.1, 64]} />
        <meshBasicMaterial color={palette.accent} toneMapped={false} />
      </mesh>
      {/* Where people stand: a faint circle on the floor, so a visitor's spot is a place. */}
      <mesh position={[0, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[TABLE.seatRadius - 0.04, TABLE.seatRadius + 0.04, 96]} />
        <meshBasicMaterial color={palette.line} transparent opacity={0.55} />
      </mesh>
    </group>
  )
}

export const WorldOffice = memo(function WorldOffice({
  stations,
  palette
}: {
  stations: readonly Station[]
  palette: WorldPalette
}): JSX.Element {
  return (
    <group>
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[56, 96]} />
        <meshStandardMaterial color={palette.floor} roughness={1} metalness={0} />
      </mesh>
      <Grid
        position={[0, 0.001, 0]}
        args={[44, 44]}
        cellSize={1}
        cellThickness={0.6}
        cellColor={palette.line}
        sectionSize={5}
        sectionThickness={1}
        sectionColor={palette.line}
        fadeDistance={26}
        fadeStrength={1.4}
        infiniteGrid
      />
      <MeetingTable palette={palette} />
      {stations.map((station) => (
        <Desk key={station.agentId} station={station} palette={palette} />
      ))}
    </group>
  )
})
