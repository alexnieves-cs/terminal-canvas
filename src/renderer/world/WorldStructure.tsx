import { memo, useEffect, useMemo, useRef, useState, useSyncExternalStore, type JSX } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { getAgent, getAgentIds, subscribeAgentWorld, worldNow } from './agent-world-store'
import { glowScale } from './world-bloom'
import { useBloomRendered } from './world-quality'
import { commitRegionMove, useWorldContext, type WorldTask } from './world-context-store'
import { STUDIO } from './world-palette'
import { agentTint, goalOf, isLiveStatus, ROBOT_HEAD_Y, type Station, type Zone } from './world-scene'
import { roundedRectPath } from './world-set'
import {
  fileTiles, handoffArcs, setTerraceOrbit, terraceDragCanvas, terraceLine, terraceOutline, terraceSignSpot, tileSpots, TERRACE, TILE_FRESH_MS,
  type FileTile, type FloorTerrace, type HandoffArc, type TileSpot
} from './world-structure'

/**
 * The room's structure, drawn (M423): a TERRACE under each task's desks with
 * the task's name at its edge, a TILE for every file the live agents have in
 * play floating over the desk of whoever touched it last, a LINE from each
 * agent to the file its hands are on right now, an amber line from each
 * writer to a file two of them are writing (that tile floats over the table),
 * and an ARC on the floor for each handoff between two agents in the room.
 *
 * Reached only through the lazily-loaded WorldView (CLAUDE.md's library
 * table: a scene file, `verify:world world.door.1`). Reads the two stores and
 * nothing else. Every decision is in world-structure.ts; this only draws.
 *
 * Load-bearing, and each fails SILENTLY:
 *
 * (1) **The tile set is a STRING snapshot.** The event store notifies on every
 *     event; recomputing the tiles is cheap, re-rendering eighteen meshes with
 *     their textures per token is not. The key carries exactly what a tile
 *     shows, so a render happens when a tile would look different.
 * (2) **A tile's texture is painted when its words change, never per frame**,
 *     and disposed with the tile (WorldProps' rule (3)).
 * (3) **A line is a mesh, not `THREE.Line`.** WebGL draws every line one pixel
 *     wide whatever `linewidth` says; a beam is a thin cylinder, which also
 *     takes the bloom.
 */

// ── the snapshot ─────────────────────────────────────────────────────────────

// M425: the room's clock — the replay's moment while scrubbing, else now.
const now = (): number => worldNow()

function liveRecords(): NonNullable<ReturnType<typeof getAgent>>[] {
  return getAgentIds().map((id) => getAgent(id)).filter((r): r is NonNullable<typeof r> => r !== undefined && isLiveStatus(r.status))
}

let cachedKey = ''
let cachedTiles: FileTile[] = []
function tilesKey(): string {
  const tiles = fileTiles(liveRecords(), now())
  const key = tiles.map((t) => `${t.path}|${t.lastAgent}|${t.conflict ? 1 : 0}|${t.open.join(',')}|${t.writers.join(',')}|${Math.floor(t.lastAt / 1000)}`).join('\n')
  if (key !== cachedKey) { cachedKey = key; cachedTiles = tiles }
  return key
}

/** The tiles, re-rendered only when one would look different — and re-read every two seconds, because an open call goes stale with the clock. */
function useTiles(): FileTile[] {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 2000)
    return () => window.clearInterval(id)
  }, [])
  useSyncExternalStore(subscribeAgentWorld, tilesKey, tilesKey)
  return cachedTiles
}

const uiFont = (): string => getComputedStyle(document.documentElement).getPropertyValue('--font-ui').trim() || 'system-ui, sans-serif'
const monoFont = (): string => getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim() || 'ui-monospace, monospace'

// ── a beam between two points ────────────────────────────────────────────────

const UP = new THREE.Vector3(0, 1, 0)

function Beam({ from, to, color, width = 0.018, opacity = 0.75 }: { from: TileSpot; to: TileSpot; color: string; width?: number; opacity?: number }): JSX.Element {
  const bloom = useBloomRendered()
  const { position, quaternion, length } = useMemo(() => {
    const a = new THREE.Vector3(from.x, from.y, from.z)
    const b = new THREE.Vector3(to.x, to.y, to.z)
    const dir = b.clone().sub(a)
    return { position: a.clone().add(b).multiplyScalar(0.5), quaternion: new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize()), length: dir.length() }
  }, [from.x, from.y, from.z, to.x, to.y, to.z])
  const tone = useMemo(() => new THREE.Color(color).multiplyScalar(glowScale(color, bloom)), [color, bloom])
  return (
    <mesh position={position} quaternion={quaternion} scale={[width, length, width]} renderOrder={3}>
      <cylinderGeometry args={[1, 1, 1, 6, 1, true]} />
      <meshBasicMaterial color={tone} transparent opacity={opacity} depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

// ── the file tiles ───────────────────────────────────────────────────────────

const TILE = { w: 1.4, h: 0.8, d: 0.06 } as const

function paintTile(canvas: HTMLCanvasElement, tile: FileTile, tint: string): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { width: W, height: H } = canvas
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.roundRect(0, 0, W, H, 26)
  ctx.fill()
  // The agent's colour down the left edge: whose file this is, at a glance.
  ctx.fillStyle = tile.conflict ? STUDIO.amber : tint
  ctx.beginPath()
  ctx.roundRect(0, 0, 20, H, [26, 0, 0, 26])
  ctx.fill()
  ctx.fillStyle = STUDIO.ink
  ctx.font = `600 54px ${monoFont()}`
  let name = tile.name
  while (name.length > 4 && ctx.measureText(name).width > W - 76) name = `${name.slice(0, -2)}…`
  ctx.fillText(name, 48, 108)
  ctx.fillStyle = '#7b8494'
  ctx.font = `500 34px ${uiFont()}`
  const sub = tile.conflict ? `${tile.writers.length} agents writing` : tile.dir === '' ? '' : tile.dir
  let line = sub
  while (line.length > 4 && ctx.measureText(line).width > W - 76) line = `…${line.slice(2)}`
  if (tile.conflict) ctx.fillStyle = '#b06d00'
  ctx.fillText(line, 48, 172)
  if (tile.conflict) {
    ctx.strokeStyle = STUDIO.amber
    ctx.lineWidth = 10
    ctx.beginPath()
    ctx.roundRect(5, 5, W - 10, H - 10, 22)
    ctx.stroke()
  }
}

function Tile({ tile, spot, reduced }: { tile: FileTile; spot: TileSpot; reduced: boolean }): JSX.Element {
  const camera = useThree((s) => s.camera)
  const group = useRef<THREE.Group>(null)
  const tint = agentTint(tile.lastAgent, getAgentIds())
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 256
    const t = new THREE.CanvasTexture(canvas)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])
  useEffect(() => () => texture.dispose(), [texture])
  useEffect(() => {
    let live = true
    const paint = (): void => {
      if (!live) return
      paintTile(texture.image as HTMLCanvasElement, tile, tint)
      texture.needsUpdate = true
    }
    paint()
    void document.fonts?.ready.then(paint)
    return () => { live = false }
  }, [texture, tile.name, tile.dir, tile.conflict, tile.writers.length, tint])
  const phase = useMemo(() => [...tile.path].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 628 / 100, [tile.path])
  const lastAt = useRef(tile.lastAt)
  lastAt.current = tile.lastAt
  const writer = tile.writers.includes(tile.lastAgent)

  useFrame((state) => {
    const g = group.current
    if (!g) return
    const t = state.clock.elapsedTime
    g.position.set(spot.x, spot.y + (reduced ? 0 : Math.sin(t * 0.9 + phase) * 0.05), spot.z)
    // Face the camera about y only, so the words read from any orbit and the tile stays upright.
    g.rotation.y = Math.atan2(camera.position.x - spot.x, camera.position.z - spot.z)
    // A file just written swells, then settles: the room's pulse.
    const age = worldNow() - lastAt.current
    const fresh = writer && age >= 0 && age < TILE_FRESH_MS ? 1 - age / TILE_FRESH_MS : 0
    g.scale.setScalar(1 + (reduced ? 0 : fresh * 0.12))
  })

  return (
    <group ref={group} position={[spot.x, spot.y, spot.z]}>
      <mesh>
        <boxGeometry args={[TILE.w + 0.04, TILE.h + 0.04, TILE.d]} />
        <meshStandardMaterial color={tile.conflict ? STUDIO.amber : '#dfe3ea'} roughness={0.4} metalness={0.1} transparent opacity={0.92} />
      </mesh>
      <mesh position-z={TILE.d / 2 + 0.002}>
        <planeGeometry args={[TILE.w, TILE.h]} />
        <meshBasicMaterial map={texture} transparent toneMapped={false} />
      </mesh>
    </group>
  )
}

/** Where a robot's head is — at its desk, or at the table while it waits there (`goalOf`). */
function headOf(station: Station | undefined): TileSpot | null {
  if (station === undefined) return null
  const rec = getAgent(station.agentId)
  const slot = goalOf(rec?.status ?? 'idle', station.conductor) === 'table' ? station.seat : (station.home ?? station.seat)
  return { x: slot.x, y: ROBOT_HEAD_Y, z: slot.z }
}

function FileSky({ stations, reduced }: { stations: ReadonlyMap<string, Station>; reduced: boolean }): JSX.Element {
  const tiles = useTiles()
  const spots = useMemo(() => tileSpots(tiles, stations), [tiles, stations])
  const order = getAgentIds()
  return (
    <group>
      {tiles.map((tile) => {
        const spot = spots.get(tile.path)
        if (spot === undefined) return null
        // Lines: amber from each writer of a conflict; the agent's own colour from each agent on it now.
        const from = tile.conflict ? tile.writers : tile.open
        return (
          <group key={tile.path}>
            <Tile tile={tile} spot={spot} reduced={reduced} />
            {from.map((agentId) => {
              const head = headOf(stations.get(agentId))
              if (head === null) return null
              const open = tile.open.includes(agentId)
              return <Beam key={agentId} from={head} to={{ x: spot.x, y: spot.y - 0.3, z: spot.z }} color={tile.conflict ? STUDIO.amber : agentTint(agentId, order)} width={open ? 0.022 : 0.014} opacity={open ? 0.85 : 0.5} />
            })}
          </group>
        )
      })}
    </group>
  )
}

// ── the terraces ─────────────────────────────────────────────────────────────

function paintSign(canvas: HTMLCanvasElement, title: string, progress: string | null): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { width: W, height: H } = canvas
  ctx.clearRect(0, 0, W, H)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.font = `700 64px ${uiFont()}`
  let t = title.toUpperCase()
  ctx.letterSpacing = '6px'
  while (t.length > 4 && ctx.measureText(t).width > W - 40) t = `${t.slice(0, -2)}…`
  ctx.lineWidth = 12
  ctx.strokeStyle = 'rgba(244, 246, 249, 0.9)'
  ctx.strokeText(t, W / 2, progress === null ? H / 2 : H * 0.38)
  ctx.fillStyle = '#3a404d'
  ctx.fillText(t, W / 2, progress === null ? H / 2 : H * 0.38)
  if (progress !== null) {
    ctx.letterSpacing = '2px'
    ctx.font = `600 44px ${uiFont()}`
    ctx.strokeText(progress, W / 2, H * 0.74)
    ctx.fillStyle = STUDIO.zoneInk
    ctx.fillText(progress, W / 2, H * 0.74)
  }
}

/** Each task's floor, a pale tint of its own: told apart from the slab and from the next task, never louder than a robot. */
const TERRACE_TINTS = ['#d9e4f5', '#dcefe2', '#e9e0f4', '#f4e9d9', '#dbeef1'] as const

function Terrace({ zone, task, arcRadius, index }: { zone: Zone; task: WorldTask | undefined; arcRadius: number; index: number }): JSX.Element {
  const geometry = useMemo(() => {
    const outline = terraceOutline(zone, arcRadius)
    const shape = new THREE.Shape()
    outline.forEach(([x, z], i) => (i === 0 ? shape.moveTo(x, -z) : shape.lineTo(x, -z)))
    shape.closePath()
    const g = new THREE.ExtrudeGeometry(shape, { depth: TERRACE.lift, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.05, bevelSegments: 2, curveSegments: 4 })
    g.rotateX(-Math.PI / 2)
    return g
  }, [zone.from, zone.to, arcRadius])
  useEffect(() => () => geometry.dispose(), [geometry])
  // The terrace's lit edge: a closed tube just above its rim — the reference's glowing walkway edge.
  const bloom = useBloomRendered()
  const edge = useMemo(() => {
    const outline = terraceOutline(zone, arcRadius)
    const curve = new THREE.CatmullRomCurve3(outline.map(([x, z]) => new THREE.Vector3(x, TERRACE.lift + 0.02, z)), true, 'catmullrom', 0.05)
    return new THREE.TubeGeometry(curve, outline.length * 3, 0.022, 5, true)
  }, [zone.from, zone.to, arcRadius])
  useEffect(() => () => edge.dispose(), [edge])
  const edgeColor = useMemo(() => new THREE.Color(STUDIO.cyan).multiplyScalar(glowScale(STUDIO.cyan, bloom)), [bloom])
  const line = terraceLine(task, `Task ${index + 1}`)
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 900
    canvas.height = 220
    const t = new THREE.CanvasTexture(canvas)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])
  useEffect(() => () => texture.dispose(), [texture])
  useEffect(() => {
    let live = true
    const paint = (): void => {
      if (!live) return
      paintSign(texture.image as HTMLCanvasElement, line.title, line.progress)
      texture.needsUpdate = true
    }
    paint()
    void document.fonts?.ready.then(paint)
    return () => { live = false }
  }, [texture, line.title, line.progress])
  const sign = terraceSignSpot(zone, arcRadius)
  return (
    <group>
      <mesh geometry={geometry} receiveShadow castShadow>
        <meshStandardMaterial color={TERRACE_TINTS[index % TERRACE_TINTS.length]} roughness={0.5} metalness={0.02} />
      </mesh>
      <mesh geometry={edge} renderOrder={2}>
        <meshBasicMaterial color={edgeColor} toneMapped={false} />
      </mesh>
      <sprite position={[sign.x, 0.72, sign.z]} scale={[3.6, 0.88, 1]}>
        <spriteMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
      </sprite>
    </group>
  )
}

// ── the handoff arcs ─────────────────────────────────────────────────────────

function Arc({ arc, reduced }: { arc: HandoffArc; reduced: boolean }): JSX.Element {
  const dash = useRef<THREE.MeshBasicMaterial>(null)
  const geometry = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(arc.points.map(([x, z]) => new THREE.Vector3(x, 0.04, z)))
    return new THREE.TubeGeometry(curve, 40, arc.fresh ? 0.035 : 0.022, 6, false)
  }, [arc.points, arc.fresh])
  useEffect(() => () => geometry.dispose(), [geometry])
  useFrame((state) => {
    if (!dash.current || reduced) return
    dash.current.opacity = arc.fresh ? 0.6 + 0.35 * Math.sin(state.clock.elapsedTime * 6) : 0.45
  })
  return (
    <mesh geometry={geometry} renderOrder={2}>
      <meshBasicMaterial ref={dash} color={arc.fresh ? STUDIO.cyan : '#9aa4b4'} transparent opacity={0.45} depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

// ── the structure ────────────────────────────────────────────────────────────

/** Under this many canvas pixels the press was a click, and it commits nothing. */
const TERRACE_DRAG_SLOP = 4

/**
 * A canvas region stood up: a dark slab at `terraceFloor`, labelled with the chip.
 * A drag commits `moveRegion` once, on release — the same plan the 2D region
 * drag uses. The mesh follows the pointer while the button is down; the
 * commit is the release, so one undo puts the task back.
 */
function FloorTerraceMesh({ terrace, index, onMoved }: {
  terrace: FloorTerrace
  index: number
  onMoved: (regionId: string, memberIds: readonly string[], dx: number, dy: number) => void
}): JSX.Element {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), [])
  const drag = useRef<{ x: number; z: number; pointer: number } | null>(null)
  const [offset, setOffset] = useState({ x: 0, z: 0 })
  const pointAt = (clientX: number, clientY: number): { x: number; z: number } | null => {
    const bounds = gl.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((clientX - bounds.left) / Math.max(1, bounds.width)) * 2 - 1,
      -((clientY - bounds.top) / Math.max(1, bounds.height)) * 2 + 1
    )
    raycaster.setFromCamera(ndc, camera)
    const hit = new THREE.Vector3()
    if (raycaster.ray.intersectPlane(plane, hit) === null) return null
    return { x: hit.x, z: hit.z }
  }
  useEffect(() => () => {
    if (drag.current !== null) setTerraceOrbit(true)
    drag.current = null
  }, [])
  const onPointerDown = (event: ThreeEvent<PointerEvent>): void => {
    if (event.button !== 0 || drag.current !== null) return
    event.stopPropagation()
    const start = { x: event.point.x, z: event.point.z }
    drag.current = { x: start.x, z: start.z, pointer: event.pointerId }
    setTerraceOrbit(false)
    const move = (ev: PointerEvent): void => {
      const held = drag.current
      if (held === null || ev.pointerId !== held.pointer) return
      const at = pointAt(ev.clientX, ev.clientY)
      if (at === null) return
      setOffset({ x: at.x - held.x, z: at.z - held.z })
    }
    const up = (ev: PointerEvent): void => {
      const held = drag.current
      if (held === null || ev.pointerId !== held.pointer) return
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      drag.current = null
      setTerraceOrbit(true)
      setOffset({ x: 0, z: 0 })
      const at = pointAt(ev.clientX, ev.clientY) ?? { x: held.x, z: held.z }
      const delta = terraceDragCanvas({ x: held.x, z: held.z }, at)
      if (Math.hypot(delta.dx, delta.dy) < TERRACE_DRAG_SLOP) return
      const moved = commitRegionMove(terrace.id, delta.dx, delta.dy)
      if (moved === null) return
      onMoved(terrace.id, moved.ids, delta.dx, delta.dy)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const geometry = useMemo(() => {
    const shape = new THREE.Shape()
    const radius = Math.min(0.45, terrace.w / 8, terrace.d / 8)
    const outline = roundedRectPath(terrace.w / 2, terrace.d / 2, radius, 6)
    outline.forEach(([x, z], i) => (i === 0 ? shape.moveTo(x, -z) : shape.lineTo(x, -z)))
    shape.closePath()
    const g = new THREE.ExtrudeGeometry(shape, { depth: TERRACE.lift, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.04, bevelSegments: 2, curveSegments: 4 })
    g.rotateX(-Math.PI / 2)
    g.translate(terrace.center.x, 0, terrace.center.z)
    return g
  }, [terrace.center.x, terrace.center.z, terrace.w, terrace.d])
  useEffect(() => () => geometry.dispose(), [geometry])
  const color = useMemo(() => new THREE.Color(STUDIO.ink).lerp(new THREE.Color(STUDIO.desk), (index % 5) / 5), [index])
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 900
    canvas.height = 220
    const t = new THREE.CanvasTexture(canvas)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])
  useEffect(() => () => texture.dispose(), [texture])
  useEffect(() => {
    let live = true
    const paint = (): void => {
      if (!live) return
      paintSign(texture.image as HTMLCanvasElement, terrace.label, null)
      texture.needsUpdate = true
    }
    paint()
    void document.fonts?.ready.then(paint)
    return () => { live = false }
  }, [texture, terrace.label])
  return (
    <group position={[offset.x, 0, offset.z]} onPointerDown={onPointerDown}>
      <mesh geometry={geometry} receiveShadow castShadow>
        <meshStandardMaterial color={color} roughness={0.72} metalness={0.04} />
      </mesh>
      <sprite position={[terrace.center.x, 0.9, terrace.center.z + terrace.d / 2 - 0.35]} scale={[Math.min(terrace.w * 0.7, 4.2), 0.9, 1]}>
        <spriteMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
      </sprite>
    </group>
  )
}

export const WorldStructure = memo(function WorldStructure({ stations, zones, arcRadius, reduced, floors = [], onRegionMoved }: {
  stations: readonly Station[]
  zones: readonly Zone[]
  arcRadius: number
  reduced: boolean
  /** M450. Canvas regions, already converted. When present they replace the ring terraces. */
  floors?: readonly FloorTerrace[]
  /** R-051. The stood-up room follows a committed terrace drag. */
  onRegionMoved?: (regionId: string, memberIds: readonly string[], dx: number, dy: number) => void
}): JSX.Element {
  const ctx = useWorldContext()
  const byId = useMemo(() => new Map(stations.map((s) => [s.agentId, s])), [stations])
  const tasks = useMemo(() => new Map(ctx.tasks.map((t) => [t.id, t])), [ctx.tasks])
  const arcs = useMemo(() => handoffArcs(ctx.handoffs, byId, Date.now()), [ctx.handoffs, byId])
  return (
    <group>
      {floors.length > 0
        ? floors.map((terrace, i) => <FloorTerraceMesh key={terrace.id} terrace={terrace} index={i} onMoved={onRegionMoved ?? (() => {})} />)
        : zones.map((zone, i) => <Terrace key={zone.groupId} zone={zone} task={tasks.get(zone.groupId)} arcRadius={arcRadius} index={i} />)}
      {arcs.map((arc) => <Arc key={`${arc.from}>${arc.to}`} arc={arc} reduced={reduced} />)}
      <FileSky stations={byId} reduced={reduced} />
    </group>
  )
})
