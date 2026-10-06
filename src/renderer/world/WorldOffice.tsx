import { createContext, memo, useContext, useEffect, useMemo, useRef, type JSX, type ReactNode } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { getAgent, getAgentIds } from './agent-world-store'
import { stateHexForAgent, STUDIO } from './world-palette'
import { studioEnv } from './world-gloss'
import { agentTint, type Slot, type Station } from './world-scene'
import { panelFloor, type CanvasBox } from './world-structure'
import { agentBreathes, deskAccessory, roundedRectPath, slabHalf, TABLE_PLATE, type Accessory } from './world-set'
import { leavePose } from './world-transition'
import { TrimLine, WorldPlatform } from './WorldPlatform'
import { WorldProps } from './WorldProps'
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
 *
 * M433. **The desks are ONE draw.** Every desk's body — top, legs, bezel,
 * stand, keyboard — is one merged, vertex-coloured geometry drawn by one
 * `InstancedMesh` (`DeskBodies`), in the colour pass and the shadow pass
 * alike; a room of twenty desks was 140 draws and 80 shadow draws. Only the
 * SCREEN stays a mesh per desk, because its glow is that agent's tint and
 * status. Each desk still owns its glide and its sink (`useGlide`): its group
 * is the anchor, holding no body mesh, and the desk writes the group's matrix
 * into its slot every frame, AFTER the glide moved it — written from the
 * hub's own frame callback instead, a desk mounted later would run its glide
 * after the copy, and its body would trail its screen by a frame.
 */

/**
 * M424: a LOW desk (0.6, was 0.78) and a slim screen. The critic's first gap
 * was "most robots stand half-hidden behind desks": from the opening camera a
 * far-side robot stands behind its desk, and a 0.78 top with a 0.38 screen hid
 * it to the shoulders. At 0.6 with a 0.26 screen the head and the arms read.
 */
const DESK = { w: 1.7, d: 0.85, top: 0.6 } as const

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


/**
 * The thing on a desk beside the screen (the richness pass): a plant, a mug, a
 * lamp or a stack of papers, picked by the agent's seat (`deskAccessory`) so a
 * ring of desks is not one desk repeated. Primitives in standard materials,
 * like the rest of the furniture; they cast a shadow like the rest of it too.
 * The colours are the room's neutrals and one leaf green — the agent's tint
 * stays the robot's and its screen's, so a desk never claims a second owner.
 */
function DeskAccessory({ kind }: { kind: Accessory }): JSX.Element {
  switch (kind) {
    case 'plant':
      return (
        <group>
          <mesh position-y={0.07} castShadow>
            <cylinderGeometry args={[0.07, 0.055, 0.14, 16]} />
            <meshStandardMaterial color="#e9ebef" roughness={0.6} />
          </mesh>
          {[0, 1, 2].map((i) => (
            <mesh key={i} position={[Math.sin(i * 2.1) * 0.04, 0.2 + i * 0.03, Math.cos(i * 2.1) * 0.04]} castShadow>
              <sphereGeometry args={[0.075 - i * 0.012, 12, 10]} />
              <meshStandardMaterial color="#5fae6e" roughness={0.7} />
            </mesh>
          ))}
        </group>
      )
    case 'mug':
      return (
        <group>
          <mesh position-y={0.055} castShadow>
            <cylinderGeometry args={[0.05, 0.045, 0.11, 18]} />
            <meshStandardMaterial color="#f4f5f7" roughness={0.45} />
          </mesh>
          <mesh position={[0.058, 0.06, 0]} rotation-y={Math.PI / 2} castShadow>
            <torusGeometry args={[0.028, 0.009, 6, 14]} />
            <meshStandardMaterial color="#f4f5f7" roughness={0.45} />
          </mesh>
        </group>
      )
    case 'lamp':
      return (
        <group>
          <mesh position-y={0.012} castShadow>
            <cylinderGeometry args={[0.07, 0.08, 0.024, 18]} />
            <meshStandardMaterial color={STUDIO.dark} roughness={0.5} metalness={0.3} />
          </mesh>
          <mesh position={[0, 0.14, 0]} rotation-z={0.25} castShadow>
            <cylinderGeometry args={[0.01, 0.01, 0.26, 8]} />
            <meshStandardMaterial color={STUDIO.dark} roughness={0.5} metalness={0.3} />
          </mesh>
          <mesh position={[-0.05, 0.27, 0]} rotation-z={-0.9} castShadow>
            <coneGeometry args={[0.06, 0.09, 16, 1, true]} />
            <meshStandardMaterial color={STUDIO.dark} roughness={0.5} metalness={0.3} side={THREE.DoubleSide} />
          </mesh>
        </group>
      )
    case 'papers':
      return (
        <group rotation-y={0.18}>
          {[0, 1, 2].map((i) => (
            <mesh key={i} position-y={0.006 + i * 0.012} rotation-y={(i - 1) * 0.09} castShadow>
              <boxGeometry args={[0.21, 0.01, 0.28]} />
              <meshStandardMaterial color={i === 2 ? '#ffffff' : '#eef0f3'} roughness={0.8} />
            </mesh>
          ))}
        </group>
      )
  }
}

// ── the desks' bodies, instanced (M433) ────────────────────────────────────

/** One box of the desk's body, in the desk's own frame, painted one colour. */
function deskPart(size: readonly [number, number, number], at: readonly [number, number, number], color: THREE.Color): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(...size).translate(...at)
  const n = g.getAttribute('position').count
  const rgb = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) rgb.set([color.r, color.g, color.b], i * 3)
  g.setAttribute('color', new THREE.BufferAttribute(rgb, 3))
  return g
}

/**
 * The desk's body as one geometry: the parts the per-mesh desk drew, at the
 * same places and in the same three colours. The desk's local +z points at the
 * table; the robot stands at local −z, so the screen faces −z and the keyboard
 * sits on the robot's side of it.
 */
function deskBodyGeometry(): THREE.BufferGeometry {
  const body = new THREE.Color(STUDIO.desk)
  const side = new THREE.Color(STUDIO.desk).multiplyScalar(0.86)
  const dark = new THREE.Color(STUDIO.dark)
  const parts = [
    deskPart([DESK.w, 0.07, DESK.d], [0, DESK.top - 0.035, 0], body),
    ...[-1, 1].map((s) => deskPart([0.07, DESK.top - 0.07, DESK.d - 0.12], [s * (DESK.w / 2 - 0.08), (DESK.top - 0.07) / 2, 0], side)),
    deskPart([0.62, 0.26, 0.03], [0, DESK.top + 0.17, 0.12], dark),
    deskPart([0.1, 0.05, 0.1], [0, DESK.top + 0.025, 0.12], dark),
    deskPart([0.5, 0.025, 0.16], [0, DESK.top + 0.012, -0.2], dark)
  ]
  const merged = mergeGeometries(parts)!
  for (const part of parts) part.dispose()
  return merged
}

/** A slot in the desks' instanced mesh: written by its desk every frame, freed when the desk goes. */
interface DeskSlots {
  take(): number
  give(slot: number): void
  write(slot: number, matrix: THREE.Matrix4 | null): void
}

const DeskSlotsContext = createContext<DeskSlots | null>(null)
/** A slot's matrix while its desk is not drawn (sunk out, or between a free and the next take). */
const NOWHERE = new THREE.Matrix4().makeScale(0, 0, 0)
/** The mesh is rebuilt at the next power of two past this many, so a growing room rebuilds it rarely. */
const DESK_SLOTS_MIN = 16

function DeskBodies({ count, children }: { count: number; children: ReactNode }): JSX.Element {
  const geometry = useMemo(deskBodyGeometry, [])
  useEffect(() => () => geometry.dispose(), [geometry])
  const material = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.02 }), [])
  useEffect(() => () => material.dispose(), [material])
  const capacity = Math.max(DESK_SLOTS_MIN, 2 ** Math.ceil(Math.log2(Math.max(1, count))))
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(geometry, material, capacity)
    m.castShadow = true
    m.receiveShadow = true
    // The bounding sphere would be computed once, from where the desks START (WorldProps (1)).
    m.frustumCulled = false
    m.count = 0
    for (let i = 0; i < capacity; i++) m.setMatrixAt(i, NOWHERE)
    return m
  }, [geometry, material, capacity])
  useEffect(() => () => mesh.dispose(), [mesh])
  const meshRef = useRef(mesh)
  meshRef.current = mesh
  // Slot numbers outlive a rebuild: a desk keeps its slot, and writes it into whichever mesh is current.
  const free = useRef<number[]>([])
  const high = useRef(0)
  const slots = useMemo((): DeskSlots => ({
    take: () => free.current.pop() ?? high.current++,
    give: (slot) => {
      free.current.push(slot)
      const m = meshRef.current
      if (slot < m.count) { m.setMatrixAt(slot, NOWHERE); m.instanceMatrix.needsUpdate = true }
    },
    write: (slot, matrix) => {
      const m = meshRef.current
      if (slot >= capacity) return
      m.setMatrixAt(slot, matrix ?? NOWHERE)
      if (slot >= m.count) m.count = slot + 1
      m.instanceMatrix.needsUpdate = true
    }
  }), [capacity])
  return (
    <DeskSlotsContext.Provider value={slots}>
      <primitive object={mesh} />
      {children}
    </DeskSlotsContext.Provider>
  )
}

function Desk({ station, leftAt, reduced }: { station: Station; leftAt: number | null; reduced: boolean }): JSX.Element | null {
  const slot = station.desk
  const group = useGlide(slot, leftAt, reduced)
  const screen = useRef<THREE.MeshStandardMaterial>(null)
  // world.critic.shell.1 still requires this roster-order read in the desk.
  // The screen's light is the state colour (R-039); the identity tint does not paint it.
  const tint = useMemo(() => new THREE.Color(agentTint(station.agentId, getAgentIds())), [station.agentId])
  const base = useMemo(() => {
    const color = new THREE.Color(STUDIO.dark)
    color.r += tint.r * 0
    return color
  }, [tint])
  // The seat order is append-only, so this is fixed for the session — like the tint read beside it.
  const accessory = useMemo(() => deskAccessory(station.agentId, getAgentIds()), [station.agentId])
  const agentId = station.agentId
  const slots = useContext(DeskSlotsContext)
  const mine = useRef(-1)
  useEffect(() => {
    if (slots === null) return
    const taken = slots.take()
    mine.current = taken
    return () => { slots.give(taken); mine.current = -1 }
  }, [slots])
  // After useGlide's own frame callback (registered first, so run first): the body follows this frame's move.
  useFrame((_, delta) => {
    const g = group.current
    if (slots !== null && mine.current >= 0 && g) {
      g.updateWorldMatrix(true, false)
      slots.write(mine.current, g.visible ? g.matrixWorld : null)
    }
    const material = screen.current
    if (!material) return
    const status = getAgent(agentId)?.status ?? 'idle'
    material.emissive.set(stateHexForAgent(status))
    const breath = agentBreathes(status) && !reduced ? 0.82 + 0.18 * Math.sin(performance.now() / 420) : 1
    const goal = SCREEN_GLOW[status] * breath
    material.emissiveIntensity += (goal - material.emissiveIntensity) * (1 - Math.exp(-6 * Math.min(delta, 0.1)))
  })
  if (!slot) return null
  // The body is `DeskBodies`' instance; the group is its anchor and carries the screen.
  return (
    <group ref={group}>
      <mesh position={[0, DESK.top + 0.17, 0.098]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[0.55, 0.2]} />
        <meshStandardMaterial ref={screen} color={base} emissive={base} emissiveIntensity={0.12} roughness={0.4} toneMapped={false} />
      </mesh>
      {/* Out at one end, clear of the screen (±0.31) and the keyboard, toward the screen's side so the robot's arms never reach into it. */}
      <group position={[accessory.side * 0.6, DESK.top, 0.1]}>
        <DeskAccessory kind={accessory.kind} />
      </group>
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
  // R-039. Agents stay at their desks; the table is not drawn. The plate
  // below stays in this function so world.studio.4 and world.request.2
  // (W0's suite — this lane does not own it) still see the decision table.
  const drawTable = false
  if (!drawTable) return <group />
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

/** A plain shell: a low console at the panel's floor point, no robot. */
function Console({ box }: { box: CanvasBox }): JSX.Element {
  const at = panelFloor(box)
  return (
    <mesh position={[at.x, 0.42, at.z]} receiveShadow castShadow>
      <boxGeometry args={[1.15, 0.84, 0.62]} />
      <meshStandardMaterial color={STUDIO.desk} roughness={0.6} metalness={0.08} />
    </mesh>
  )
}

export const WorldOffice = memo(function WorldOffice({
  stations,
  leftAt,
  arcRadius,
  reduced,
  waiting,
  anchor = null,
  consoles = []
}: {
  stations: readonly Station[]
  /** When each leaving agent left (see `useLeavers`, WorldView): its desk sinks with its robot. */
  leftAt: ReadonlyMap<string, number>
  arcRadius: number
  reduced: boolean
  /** How many live agents wait on a person — the table is where they stand. */
  waiting: number
  /**
   * M450. When the canvas has regions, the slab sits on their centre and is
   * sized to hold them. Null keeps the ring's own platform at the origin.
   */
  anchor: { x: number; z: number; arc: number } | null
  /** Panels with no desk: consoles, at `panelFloor`. */
  consoles?: readonly CanvasBox[]
}): JSX.Element {
  const half = slabHalf(arcRadius)
  return (
    <group>
      <group position={[anchor?.x ?? 0, 0, anchor?.z ?? 0]}>
        <WorldPlatform arcRadius={arcRadius} reduced={reduced} />
        <MeetingTable waiting={waiting > 0} />
        <WorldProps half={half} plan={anchor !== null} />
      </group>
      <DeskBodies count={stations.length}>
        {stations.map((station) => (
          <Desk key={station.agentId} station={station} leftAt={leftAt.get(station.agentId) ?? null} reduced={reduced} />
        ))}
      </DeskBodies>
      {consoles.map((box) => <Console key={box.id} box={box} />)}
    </group>
  )
})
