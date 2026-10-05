import { memo, useEffect, useMemo, useRef, type JSX, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { STUDIO } from './world-palette'
import { glowScale, haloShare } from './world-bloom'
import { useBloomRendered } from './world-quality'
import { getAgent, getAgentIds } from './agent-world-store'
import { bandBuffers, FLOOR, floorSeams, glowProfile, SLAB, slabHalf, TRIM, TRIM_STILL, trimBreath, trimPath, trimPulse, type Pt, type TrimPulse } from './world-set'

/**
 * The platform the room stands on (M416): a thick rounded slab, light gray,
 * with a glowing cyan trim running round it — the reference's signature detail.
 *
 * Reached only through the lazily-loaded WorldView (CLAUDE.md's library table).
 *
 * The trim is two flat bands of geometry laid on the slab's top, following the
 * same outline (`world-set.trimPath`): a thin bright CORE and, under it, a wide
 * HALO whose vertex alpha falls off like a gaussian. The halo is what a bloom
 * pass would have drawn, as a mesh, and it is the bloom-OFF look: since M420 a
 * real bloom (`WorldBloom`) adds a glow around the core when it is on, and this
 * band stays under it — more opaque, because the composer's ACES greys an
 * unlit cyan (`haloShare`, world-bloom.ts) — so turning bloom off returns the
 * M416 picture exactly.
 *
 * Load-bearing, and each fails SILENTLY:
 *
 * (1) **The halo is NORMALLY blended, not additive.** Additive cyan over a pale
 *     slab clips to white and the glow vanishes; a translucent cyan over the
 *     light gray is what the reference shows. `toneMapped={false}` on both
 *     bands, or ACES greys the core into a washed teal.
 * (2) **The bands float 1–2 cm over the slab's top** (y 0.012 / 0.022), clear of
 *     its depth at the camera's distance, and only over its FLAT region: a
 *     RoundedBox's top face is flat only `radius` in from the edge, and a band
 *     laid in the rounded lip would hang in the air beside the slab. The trim
 *     is inset `TRIM.inset`, past that, and has its own larger corner radius —
 *     an inward offset of the slab's outline would be a sharp rectangle.
 * (3) **The slab's top is the FLOOR, y = 0.** Robots, desks and the camera's
 *     lowest orbit are all measured from it; the slab hangs below.
 * (4) **The trim breathes from the frame loop, never from React** (the
 *     richness pass): the room's busy share is re-read from the store twice a
 *     second (`trimPulse`) and the breath (`trimBreath`) written straight onto
 *     the two materials. The view's frameloop is `always` (WorldView (4b)), so
 *     this costs no frame the robots were not already drawing; and a still
 *     room, or reduced motion, writes exactly the resting values back.
 * (5) **The floor paint is a separate, translucent plane over the slab's flat
 *     top, not a map on the RoundedBox** — the box's UVs wrap its rounded
 *     edges, and a texture there would smear down the lip. It only darkens,
 *     receives the key light's shadow like the slab under it, and writes no
 *     depth, so the trim bands and the contact blobs above it draw as before.
 */

/** A strip of triangles with per-vertex alpha as a BufferGeometry (the colour is the material's; the vertex colour carries only alpha). */
function bandGeometry(path: readonly Pt[], offsets: readonly number[], alphas: readonly number[], y: number): THREE.BufferGeometry {
  const band = bandBuffers(path, offsets, alphas, y)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(band.positions, 3))
  const colors = new Float32Array(band.alphas.length * 4)
  band.alphas.forEach((alpha, i) => { colors.set([1, 1, 1, alpha], i * 4) })
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4))
  geometry.setIndex(band.index)
  return geometry
}

/** A lit strip along `path`: a bright core of half-width `half` over a halo reaching `glowIn` inward and `glowOut` outward, `peak` opaque at its centre. */
export function TrimLine({ path, y, half, glowIn, glowOut, peak, overPale = false, hue, pulse, reduced = false }: { path: readonly Pt[]; y: number; half: number; glowIn: number; glowOut: number; peak: number; overPale?: boolean; /** A colour other than the room's cyan (M422: the table while someone waits). One hex for core and halo. */ hue?: string; /** How it breathes, read each frame (see (4)); absent, it is still. */ pulse?: RefObject<TrimPulse>; reduced?: boolean }): JSX.Element {
  const core = useMemo(() => bandGeometry(path, [-half, half], [1, 1], y + 0.01), [path, half, y])
  const halo = useMemo(() => {
    const profile = glowProfile(glowIn, glowOut)
    return bandGeometry(path, profile.offsets, profile.alphas, y)
  }, [path, glowIn, glowOut, y])
  useEffect(() => () => core.dispose(), [core])
  useEffect(() => () => halo.dispose(), [halo])
  // With bloom on the core is the SATURATED cyan pushed past 1.0 (the pale
  // core would be desaturated to white by the tone map) so the composer has
  // something to bloom, and the halo band steps back to the share the bloom does not cover
  // (world-bloom.ts). Off, both are exactly M416's.
  const bloom = useBloomRendered()
  const coreColor = useMemo(() => {
    const hex = hue ?? (bloom ? STUDIO.cyan : STUDIO.cyanCore)
    return new THREE.Color(hex).multiplyScalar(glowScale(hex, bloom))
  }, [bloom, hue])
  const haloOpacity = peak * (overPale ? haloShare(bloom) : 1)
  const haloMat = useRef<THREE.MeshBasicMaterial>(null)
  const coreMat = useRef<THREE.MeshBasicMaterial>(null)
  useFrame((state) => {
    if (!pulse) return
    const b = trimBreath(state.clock.elapsedTime, pulse.current, reduced)
    if (haloMat.current) haloMat.current.opacity = Math.min(1, haloOpacity * b)
    // The core moves half as far: it is the line itself, and with bloom on its brightness is the bloom's size.
    if (coreMat.current) coreMat.current.color.copy(coreColor).multiplyScalar(1 + (b - 1) * 0.5)
  })
  return (
    <>
      <mesh geometry={halo} renderOrder={1}>
        <meshBasicMaterial ref={haloMat} color={hue ?? STUDIO.cyan} vertexColors transparent opacity={haloOpacity} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={core} renderOrder={2}>
        <meshBasicMaterial ref={coreMat} color={coreColor} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </>
  )
}

/**
 * The floor paint (5): soft tile seams centred on the table and a faint
 * darkening toward the lip, as ALPHA over a dark colour — one 1024² canvas
 * painted once per room size (`FLOOR`, `floorSeams`), never per frame.
 */
function paintFloor(canvas: HTMLCanvasElement, span: number): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const W = canvas.width
  ctx.clearRect(0, 0, W, W)
  // The vignette: clear in the middle, `FLOOR.vignette` at the corners.
  const grad = ctx.createRadialGradient(W / 2, W / 2, W * 0.22, W / 2, W / 2, W * 0.72)
  const v = Math.round(FLOOR.vignette * 255)
  grad.addColorStop(0, 'rgb(0,0,0)')
  grad.addColorStop(1, `rgb(${v},${v},${v})`)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, W)
  // The seams, ADDED onto the vignette's alpha (lighter = more alpha), soft-edged by a 2-px line under a 1-px one.
  ctx.globalCompositeOperation = 'lighter'
  const s = Math.round(FLOOR.seam * 255 * 0.5)
  for (const [width, a] of [[3, s], [1.2, s]] as const) {
    ctx.strokeStyle = `rgb(${a},${a},${a})`
    ctx.lineWidth = width
    for (const at of floorSeams(span)) {
      const p = Math.round(at * W) + 0.5
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, W); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(W, p); ctx.stroke()
    }
  }
  ctx.globalCompositeOperation = 'source-over'
}

function FloorPaint({ half }: { half: number }): JSX.Element {
  // Only over the slab's flat top: a RoundedBox is flat `radius` in from its edge.
  const span = (half - SLAB.radius) * 2
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = FLOOR.px
    canvas.height = FLOOR.px
    paintFloor(canvas, span)
    const t = new THREE.CanvasTexture(canvas)
    t.colorSpace = THREE.NoColorSpace
    return t
  }, [span])
  useEffect(() => () => texture.dispose(), [texture])
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position-y={0.004} receiveShadow>
      <planeGeometry args={[span, span]} />
      <meshStandardMaterial color={STUDIO.dark} alphaMap={texture} transparent depthWrite={false} roughness={0.9} metalness={0} />
    </mesh>
  )
}

/** How often the room's busy share is re-read for the breath — it is a mood, not a meter. */
const PULSE_EVERY_S = 0.5

export const WorldPlatform = memo(function WorldPlatform({ arcRadius, reduced = false }: { arcRadius: number; reduced?: boolean }): JSX.Element {
  const half = slabHalf(arcRadius)
  const path = useMemo(() => trimPath(arcRadius), [arcRadius])
  const pulse = useRef<TrimPulse>(TRIM_STILL)
  const checkedAt = useRef(-Infinity)
  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (t - checkedAt.current < PULSE_EVERY_S) return
    checkedAt.current = t
    pulse.current = trimPulse(getAgentIds().map((id) => getAgent(id)?.status))
  })
  return (
    <group>
      <RoundedBox args={[half * 2, SLAB.thickness, half * 2]} radius={SLAB.radius} smoothness={4} position={[0, -SLAB.thickness / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={STUDIO.slab} roughness={0.82} metalness={0} />
      </RoundedBox>
      <FloorPaint half={half} />
      <TrimLine path={path} y={0.012} half={TRIM.half} glowIn={TRIM.glowIn} glowOut={TRIM.glowOut} peak={TRIM.glowPeak} overPale pulse={pulse} reduced={reduced} />
      {/* Catches only the slab's own shadow, so the platform sits ON the pale ground instead of floating in it. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -SLAB.thickness - 0.02, 0]} receiveShadow>
        <planeGeometry args={[half * 4, half * 4]} />
        <shadowMaterial transparent opacity={0.16} />
      </mesh>
    </group>
  )
})
