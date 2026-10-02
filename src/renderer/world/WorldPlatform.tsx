import { memo, useEffect, useMemo, type JSX } from 'react'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { STUDIO } from './world-palette'
import { bandBuffers, glowProfile, SLAB, slabHalf, TRIM, trimPath, type Pt } from './world-set'

/**
 * The platform the room stands on (M416): a thick rounded slab, light gray,
 * with a glowing cyan trim running round it — the reference's signature detail.
 *
 * Reached only through the lazily-loaded WorldView (CLAUDE.md's library table).
 *
 * The trim is two flat bands of geometry laid on the slab's top, following the
 * same outline (`world-set.trimPath`): a thin bright CORE and, under it, a wide
 * HALO whose vertex alpha falls off like a gaussian. The halo is what a bloom
 * pass would have drawn, as a mesh — a post-processing pass is a second
 * full-frame render at the frame budget's expense and a second importer of
 * `postprocessing`, which one door owns (src/renderer/CLAUDE.md).
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
export function TrimLine({ path, y, half, glowIn, glowOut, peak }: { path: readonly Pt[]; y: number; half: number; glowIn: number; glowOut: number; peak: number }): JSX.Element {
  const core = useMemo(() => bandGeometry(path, [-half, half], [1, 1], y + 0.01), [path, half, y])
  const halo = useMemo(() => {
    const profile = glowProfile(glowIn, glowOut)
    return bandGeometry(path, profile.offsets, profile.alphas, y)
  }, [path, glowIn, glowOut, y])
  useEffect(() => () => core.dispose(), [core])
  useEffect(() => () => halo.dispose(), [halo])
  return (
    <>
      <mesh geometry={halo} renderOrder={1}>
        <meshBasicMaterial color={STUDIO.cyan} vertexColors transparent opacity={peak} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={core} renderOrder={2}>
        <meshBasicMaterial color={STUDIO.cyanCore} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </>
  )
}

export const WorldPlatform = memo(function WorldPlatform({ arcRadius }: { arcRadius: number }): JSX.Element {
  const half = slabHalf(arcRadius)
  const path = useMemo(() => trimPath(arcRadius), [arcRadius])
  return (
    <group>
      <RoundedBox args={[half * 2, SLAB.thickness, half * 2]} radius={SLAB.radius} smoothness={4} position={[0, -SLAB.thickness / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={STUDIO.slab} roughness={0.82} metalness={0} />
      </RoundedBox>
      <TrimLine path={path} y={0.012} half={TRIM.half} glowIn={TRIM.glowIn} glowOut={TRIM.glowOut} peak={TRIM.glowPeak} />
      {/* Catches only the slab's own shadow, so the platform sits ON the pale ground instead of floating in it. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -SLAB.thickness - 0.02, 0]} receiveShadow>
        <planeGeometry args={[half * 4, half * 4]} />
        <shadowMaterial transparent opacity={0.16} />
      </mesh>
    </group>
  )
})
