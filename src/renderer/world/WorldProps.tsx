import { memo, useEffect, useLayoutEffect, useMemo, useRef, type JSX } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { useAgent } from './agent-world-store'
import { STUDIO } from './world-palette'
import { ASK_AGENT_ID, boardCard, boardSpot, clusterCenter, CUBE_CLUSTERS, cubeField, stoolSpots, type BoardCard } from './world-set'

/**
 * The set dressing (M416): three drifting clusters of small cubes, a few
 * stools, a whiteboard that shows the latest "Ask your team" request, and the
 * floating zone label over a desk.
 *
 * Reached only through the lazily-loaded WorldView (CLAUDE.md's library table).
 * Nothing here is an object the product knows about — it is the room's
 * furniture, so none of it is selectable, none of it is read by anything, and
 * all of it is cheap: one InstancedMesh per cluster, a handful of meshes for
 * the stools, a canvas texture each for the board and the label that is
 * painted when its words change and never per frame.
 *
 * Load-bearing, and each fails SILENTLY:
 *
 * (1) **`frustumCulled={false}` on the cubes.** An InstancedMesh's bounding
 *     sphere is computed once from where the instances START; the drift then
 *     carries them out of it and the whole cluster blinks off at a screen edge.
 * (2) **The cubes cast no shadow.** They float high above the room; a moving
 *     shadow cluster would cost a second instanced pass in the shadow map and
 *     draw nothing a person would read.
 * (3) **Textures are painted ONLY when their words change**, and disposed with
 *     the component. A `needsUpdate` per frame re-uploads a 1024×576 texture
 *     sixty times a second for a board nobody is writing on.
 * (4) **The board's words come from the event store** (`ASK_AGENT_ID`), the one
 *     thing the scene reads — it never touches the pill that wrote them.
 */

const uiFont = (): string => getComputedStyle(document.documentElement).getPropertyValue('--font-ui').trim() || 'system-ui, sans-serif'

// ── the cubes ────────────────────────────────────────────────────────────────

function CubeCluster({ index, half, reduced }: { index: number; half: number; reduced: boolean }): JSX.Element {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const field = useMemo(() => cubeField(index), [index])
  const axes = useMemo(() => field.map((c) => new THREE.Vector3(...c.axis)), [field])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const center = useRef(clusterCenter(index, half))
  center.current = clusterCenter(index, half)

  const write = (t: number): void => {
    const m = mesh.current
    if (!m) return
    const c = center.current
    for (let i = 0; i < field.length; i++) {
      const f = field[i]!
      dummy.position.set(
        c.x + f.x + Math.sin(t * 0.21 + f.phase) * f.drift,
        c.y + f.y + Math.sin(t * 0.33 + f.phase * 1.7) * f.drift,
        c.z + f.z + Math.cos(t * 0.18 + f.phase * 0.6) * f.drift
      )
      dummy.quaternion.setFromAxisAngle(axes[i]!, f.phase + t * f.spin)
      dummy.scale.setScalar(f.size)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  }

  useLayoutEffect(() => {
    const m = mesh.current
    if (!m) return
    const base = new THREE.Color(STUDIO.cubes[index]!)
    const shade = new THREE.Color()
    field.forEach((f, i) => {
      shade.copy(base).offsetHSL(0, 0, f.tone * 0.07)
      m.setColorAt(i, shade)
    })
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    write(0)
    // `write` closes over refs only; the cluster re-lays itself when the room's size moves its centre.
  }, [field, index, half])

  useFrame((state) => {
    if (reduced) return
    write(state.clock.elapsedTime)
  })

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, CUBE_CLUSTERS[index]!.count]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 0.78]} />
      <meshStandardMaterial roughness={0.5} metalness={0.04} />
    </instancedMesh>
  )
}

// ── the stools ───────────────────────────────────────────────────────────────

const LEG_OFFSET = 0.17
const SEAT_Y = 0.62

function Stools({ half }: { half: number }): JSX.Element {
  const spots = useMemo(() => stoolSpots(half), [half])
  const seat = useMemo(() => new THREE.CylinderGeometry(0.3, 0.3, 0.07, 32), [])
  const leg = useMemo(() => new THREE.CylinderGeometry(0.022, 0.022, SEAT_Y - 0.035, 8), [])
  useEffect(() => () => { seat.dispose(); leg.dispose() }, [seat, leg])
  return (
    <>
      {spots.map((spot, i) => (
        <group key={i} position={[spot.x, 0, spot.z]} rotation-y={spot.facing}>
          <mesh geometry={seat} position-y={SEAT_Y} castShadow receiveShadow>
            <meshStandardMaterial color="#f6f7f9" roughness={0.55} />
          </mesh>
          {([-1, 1] as const).flatMap((sx) => ([-1, 1] as const).map((sz) => (
            <mesh key={`${sx}${sz}`} geometry={leg} position={[sx * LEG_OFFSET, (SEAT_Y - 0.035) / 2, sz * LEG_OFFSET]} castShadow>
              <meshStandardMaterial color={STUDIO.dark} roughness={0.5} metalness={0.2} />
            </mesh>
          )))}
        </group>
      ))}
    </>
  )
}

// ── the whiteboard ───────────────────────────────────────────────────────────

const BOARD = { w: 2.9, h: 1.68, y: 1.34 } as const

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, maxLines: number): string[] {
  const lines: string[] = []
  let line = ''
  const words = text.split(' ')
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!
    const next = line === '' ? word : `${line} ${word}`
    if (ctx.measureText(next).width <= width || line === '') { line = next; continue }
    lines.push(line)
    line = word
    if (lines.length === maxLines) break
  }
  if (lines.length < maxLines && line !== '') lines.push(line)
  // A request that ran past the last line says so, rather than stopping mid-sentence.
  const used = lines.join(' ').length
  if (used < text.length - 1 && lines.length > 0) {
    let last = lines[lines.length - 1]!
    while (last.length > 1 && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1)
    lines[lines.length - 1] = `${last}…`
  }
  return lines
}

/** Paints the document card: a white sheet on the board with the latest request's words and a few grey rules below it. */
function paintBoard(canvas: HTMLCanvasElement, card: BoardCard): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { width: W, height: H } = canvas
  const font = uiFont()
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#f2f4f7'
  ctx.fillRect(0, 0, W, H)
  const m = 54
  ctx.save()
  ctx.shadowColor = 'rgba(30, 36, 48, 0.18)'
  ctx.shadowBlur = 26
  ctx.shadowOffsetY = 8
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.roundRect(m, m, W - m * 2, H - m * 2, 22)
  ctx.fill()
  ctx.restore()
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#7b8494'
  ctx.font = `700 30px ${font}`
  ctx.letterSpacing = '4px'
  ctx.fillText(card.title.toUpperCase(), m + 44, m + 78)
  ctx.letterSpacing = '0px'
  if (card.stamp !== null) {
    ctx.textAlign = 'right'
    ctx.font = `500 28px ${font}`
    ctx.fillText(new Date(card.stamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), W - m - 44, m + 78)
    ctx.textAlign = 'left'
  }
  const posted = card.stamp !== null
  ctx.fillStyle = posted ? STUDIO.ink : '#8a93a3'
  ctx.font = `${posted ? 600 : 500} ${posted ? 52 : 42}px ${font}`
  const lines = wrap(ctx, card.body, W - m * 2 - 88, posted ? 4 : 2)
  lines.forEach((line, i) => ctx.fillText(line, m + 44, m + 168 + i * (posted ? 66 : 56)))
  // Grey rules under the words: it reads as a document, not a sticker.
  ctx.fillStyle = '#e3e7ed'
  const top = H - m - 138
  ;[0.92, 0.78, 0.6].forEach((frac, i) => {
    ctx.beginPath()
    ctx.roundRect(m + 44, top + i * 36, (W - m * 2 - 88) * frac, 14, 7)
    ctx.fill()
  })
}

/** A 1024×576 canvas texture painted from `card` whenever its words change (and again once the UI font has loaded). */
function useBoardTexture(card: BoardCard): THREE.CanvasTexture {
  const gl = useThree((s) => s.gl)
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 576
    const t = new THREE.CanvasTexture(canvas)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy())
    return t
  }, [gl])
  useEffect(() => () => texture.dispose(), [texture])
  useEffect(() => {
    let live = true
    const paint = (): void => {
      if (!live) return
      paintBoard(texture.image as HTMLCanvasElement, card)
      texture.needsUpdate = true
    }
    paint()
    void document.fonts?.ready.then(paint)
    return () => { live = false }
  }, [texture, card])
  return texture
}

function Whiteboard({ half }: { half: number }): JSX.Element {
  const spot = useMemo(() => boardSpot(half), [half])
  const record = useAgent(ASK_AGENT_ID)
  // The card is rebuilt only when the record is: the same object keeps the same texture.
  const card = useMemo(() => boardCard(record), [record])
  const texture = useBoardTexture(card)
  return (
    <group position={[spot.x, 0, spot.z]} rotation-y={spot.facing}>
      <RoundedBox args={[BOARD.w, BOARD.h, 0.07]} radius={0.03} smoothness={3} position-y={BOARD.y} castShadow>
        <meshStandardMaterial color="#c9ced6" roughness={0.45} metalness={0.35} />
      </RoundedBox>
      <mesh position={[0, BOARD.y, 0.037]}>
        <planeGeometry args={[BOARD.w - 0.12, BOARD.h - 0.12]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      {([-1, 1] as const).map((s) => (
        <group key={s} position={[s * (BOARD.w / 2 - 0.34), 0, 0]}>
          <mesh position={[0, (BOARD.y - BOARD.h / 2) / 2, -0.02]} castShadow>
            <boxGeometry args={[0.06, BOARD.y - BOARD.h / 2, 0.06]} />
            <meshStandardMaterial color={STUDIO.dark} roughness={0.5} metalness={0.3} />
          </mesh>
          <mesh position={[0, 0.03, 0.02]} castShadow>
            <boxGeometry args={[0.09, 0.06, 0.7]} />
            <meshStandardMaterial color={STUDIO.dark} roughness={0.5} metalness={0.3} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// ── the zone label ───────────────────────────────────────────────────────────

/** A line of display type over an agent's desk — "DESK 01" — facing the camera, drawn once into a texture. */
export function ZoneLabel({ text, y }: { text: string; y: number }): JSX.Element {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = 200
    const t = new THREE.CanvasTexture(canvas)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])
  useEffect(() => () => texture.dispose(), [texture])
  useEffect(() => {
    let live = true
    const paint = (): void => {
      const canvas = texture.image as HTMLCanvasElement
      const ctx = canvas.getContext('2d')
      if (!live || !ctx) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.font = `700 118px ${uiFont()}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineJoin = 'round'
      // A pale outline so the word stays readable over a robot, a desk or the ground alike.
      ctx.lineWidth = 16
      ctx.strokeStyle = 'rgba(244, 246, 249, 0.9)'
      ctx.strokeText(text, canvas.width / 2, canvas.height / 2 + 4)
      ctx.fillStyle = STUDIO.ink
      ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4)
      texture.needsUpdate = true
    }
    paint()
    void document.fonts?.ready.then(paint)
    return () => { live = false }
  }, [texture, text])
  return (
    <sprite position-y={y} scale={[2.4, 0.75, 1]}>
      <spriteMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </sprite>
  )
}

export const WorldProps = memo(function WorldProps({ half, reduced }: { half: number; reduced: boolean }): JSX.Element {
  return (
    <group>
      {CUBE_CLUSTERS.map((_, i) => <CubeCluster key={i} index={i} half={half} reduced={reduced} />)}
      <Stools half={half} />
      <Whiteboard half={half} />
    </group>
  )
})
