/**
 * The R3F island: real lighting/materials for the orchestration diorama's
 * cubes, replacing M274/M275's CSS-3D bodies (`.orch__cube-solid` and its
 * faces). Everything else — ground, edges, hit-targets, beacon, label,
 * callouts, packets — stays exactly where it was, in the surrounding SVG/HTML
 * (OrchestrationView.tsx); this canvas paints ONLY the cube meshes and their
 * shared shadow-catching ground plane, sandwiched between the SVG's ground
 * layer and its (still-interactive) overlay layer in `.orch__graph-wrap`.
 *
 * `pointer-events: none` throughout: clicks, hover and keyboard focus stay on
 * the SVG hit-targets they always used, so selection/jump/overflow wiring in
 * OrchestrationView.tsx is untouched. This canvas only has to look right
 * under wherever those targets already are.
 */
import { TONE_WORKING } from '../panels/panel-state'
import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { ORCH_STAGE_TILT_DEG, orchFitViewbox, type OrchFit } from './orchestration-depth'
import { orchCubeMotion, type OrchCubeTone } from './orchestration-cube-motion'
import { OrchestrationBloom } from './orchestration-bloom'

/**
 * M291. What stands on a platform. The SHAPE is the kind — a station is a cube,
 * a checkpoint (a watcher's result) a hexagonal puck, an artifact (a file) a
 * thin standing tablet — so a test result never reads as another reasoning
 * agent, and the word beside it on the plate says the same.
 */
export type OrchObjectShape = 'cube' | 'puck' | 'tablet'

export interface OrchCubeSpec {
  id: string
  shape?: OrchObjectShape
  /** Already-projected viewBox-space position/size (post pan/zoom/depth — the same numbers the SVG hit-target uses). */
  x: number
  y: number
  size: number
  /** -1 back of the ring … +1 front; the hub is 0. Drives real z-stacking (occlusion via the depth buffer, not painter's order). */
  depth: number
  hub: boolean
  synthetic: boolean
  tone: OrchCubeTone
  roleColor: string
  selected: boolean
  /** Another cube is selected and this one is not — the sibling dim. */
  dimmed: boolean
  /** A metric/roster lens leaves this cube lit or not. */
  lensedOut: boolean
  /** Unacknowledged wants-you — gates the finite pulse, same condition the beacon uses. */
  attention: boolean
  /**
   * M294. The platform's selection lift this object stands on, in screen px.
   * `y` already includes it (the SVG target is there now); the mesh damps from
   * the un-lifted row to it so the plate and its objects rise together.
   */
  lift?: number
}

/**
 * M291/M294. A platform: the island's ISOMETRIC DIAMOND — a square plate of
 * `side` (camera units, pre-tilt) turned 45° in its own plane and then tilted
 * with the stage like everything else — in three stacked tiers, each `inset`
 * smaller than the one under it, in the reference's blue-black material with an
 * emissive cyan rim; the workspace plate (grouping) wears violet — violet is a
 * SECONDARY family distinction, never a state. The SVG hit-target above it is
 * cut to the same rule (orchPlatformHitPolygon: the base's silhouette). Every
 * platform has the same tiers and thickness — height is never a hidden score —
 * and the tiers are decorative, expendable before hit accuracy. `lift` is the
 * finite selection lift in screen px along world y (an orthographic camera
 * cannot show a z lift); the target moved by it already, the mesh damps to it.
 */
export interface OrchPlatformSpec {
  id: string
  x: number
  y: number
  side: number
  /** Tier inset and the base's thickness, already scaled by the camera. */
  inset: number
  thickness: number
  depth: number
  lift: number
  synthetic: boolean
  selected: boolean
  dimmed: boolean
  /** Something on it is working: the inner plate is lit. */
  lit: boolean
  /** Something on it waits on a person: an amber rim on the inner plate (the word and beacon are on the SVG plate). */
  needsYou: boolean
  expanded: boolean
}

export interface OrchestrationCubesProps {
  nodes: readonly OrchCubeSpec[]
  platforms?: readonly OrchPlatformSpec[]
  viewBox: { w: number; h: number }
  /**
   * M292. Quality tier from measured frame time: `full` is the composer, shadows
   * and pools; `lean` drops the composer (the bloom degrades rather than stalls)
   * and the pools; `flat` also drops shadows. Labels are bounded in the overlay.
   */
  quality?: 'full' | 'lean' | 'flat'
}

/**
 * M292. One geometry per (shape, size class), shared by every mesh of that class
 * and never disposed: a hundred stations used to build a hundred BoxGeometries
 * (and a hundred EdgesGeometries) and dispose them on every size change. Sizes
 * are quantised to half a pixel so a zoom does not mint a class per frame.
 */
const geometryCache = new Map<string, { body: THREE.BufferGeometry; outline: THREE.EdgesGeometry }>()
function sharedGeometry(shape: OrchObjectShape | 'hub', half: number): { body: THREE.BufferGeometry; outline: THREE.EdgesGeometry } {
  const q = Math.round(half * 2) / 2
  const key = `${shape}:${q}`
  let got = geometryCache.get(key)
  if (got === undefined) {
    const body = shape === 'hub' ? new THREE.IcosahedronGeometry(q * 1.2, 0)
      : shape === 'puck' ? new THREE.CylinderGeometry(q * 1.05, q * 1.05, q * 0.9, 6)
      : shape === 'tablet' ? new THREE.BoxGeometry(q * 1.5, q * 2.1, Math.max(2, q * 0.22))
      : new THREE.BoxGeometry(q * 2, q * 2, q * 2)
    got = { body, outline: new THREE.EdgesGeometry(body) }
    geometryCache.set(key, got)
  }
  return got
}

function readCssColor(varName: string): THREE.Color {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
  try {
    return new THREE.Color(raw || '#7a8598')
  } catch {
    return new THREE.Color('#7a8598')
  }
}

function reducedMotionNow(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Keeps the orthographic camera's frustum pixel-matched to the canvas, 1 world unit = 1 screen pixel. */
function FitCamera({ width, height }: { width: number; height: number }): null {
  const { camera } = useThree()
  useEffect(() => {
    const cam = camera as THREE.OrthographicCamera
    cam.left = -width / 2
    cam.right = width / 2
    cam.top = height / 2
    cam.bottom = -height / 2
    cam.near = 1
    cam.far = 2000
    cam.position.set(0, 0, 500)
    cam.up.set(0, 1, 0)
    cam.lookAt(0, 0, 0)
    cam.updateProjectionMatrix()
  }, [camera, width, height])
  return null
}

/** Per-cube (tone, attention) elapsed-time bookkeeping — a ref map, not React state, since only useFrame reads it. */
function useCubeClocks(): (id: string, tone: string, attention: boolean, nowMs: number) => { sinceToneMs: number; sinceAttentionMs: number } {
  const ref = useRef(new Map<string, { tone: string; toneAt: number; attention: boolean; attentionAt: number }>())
  return (id, tone, attention, nowMs) => {
    const map = ref.current
    let e = map.get(id)
    if (!e || e.tone !== tone) { e = { tone, toneAt: nowMs, attention: false, attentionAt: nowMs }; map.set(id, e) }
    if (attention && !e.attention) { e.attention = true; e.attentionAt = nowMs }
    if (!attention) e.attention = false
    return { sinceToneMs: nowMs - e.toneAt, sinceAttentionMs: attention ? nowMs - e.attentionAt : 0 }
  }
}

function CubeMesh({ node, fit, size, viewBoxW, reducedMotion, getClocks }: {
  node: OrchCubeSpec
  fit: OrchFit
  size: { width: number; height: number }
  viewBoxW: number
  reducedMotion: boolean
  getClocks: ReturnType<typeof useCubeClocks>
}): JSX.Element {
  const mesh = useRef<THREE.Mesh>(null!)
  const material = useRef<THREE.MeshPhysicalMaterial>(null!)
  const lift = useRef(0)
  // M294. The platform's selection lift, damped like the plate's own so the
  // object rises WITH its plate; the projected y already includes the target.
  const plateLift = useRef(node.lift ?? 0)
  const edge = useRef<THREE.LineBasicMaterial>(null!)
  // Scratch colours: useFrame allocated a THREE.Color per cube per frame before.
  const body = useRef(new THREE.Color())
  const glow = useRef(new THREE.Color())
  // A placeholder (no supervisor yet, `+N more`) has no process, so it takes no
  // tone's hue either — it was green, the colour of `idle`, for an agent that does not exist.
  const colorToken = node.synthetic ? '--deck-steel' : node.roleColor
  const [base, setBase] = useState(() => readCssColor(colorToken))
  const invalidate = useThree(state => state.invalidate)
  useEffect(() => {
    const sync = (): void => setBase(readCssColor(colorToken))
    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-contrast', 'style'] })
    sync()
    return () => observer.disconnect()
  }, [colorToken])
  // Demand-mode canvases also repaint when a reduced-motion user changes theme.
  useEffect(() => invalidate(), [base, invalidate])
  // The body is a dark slab LIT in its role colour, not a slab OF that colour: a
  // translucent coloured box read as tinted jelly on the navy ground (olive, for
  // the terminals). How brightly it is lit is the agent's real tone — working
  // burns, needs-you holds warm, idle is a pilot light, exited is dark.
  // The tiers now STRADDLE orchestration-bloom's luminance threshold (0.62),
  // which is what turns tone into light rather than tint: working and needs-you
  // clear it and bloom, the hub sits just over it, idle stays a pilot light
  // UNDER it, and exited is dark. The ordering is the one this scene always
  // had — working burns, needs-you holds warm, idle glows, exited is out — it
  // is just spread across the threshold now instead of bunched below it.
  // Raising these without the composer mounted would only wash the faces out.
  const restEmissive = node.synthetic ? 0.06 : node.tone === 'exited' ? 0.02 : node.tone === 'needs-you' ? 1.45 : node.tone === TONE_WORKING ? 1.4 : node.hub ? 1.05 : 0.3
  const edgeOpacity = node.synthetic ? 0.35 : node.tone === 'exited' ? 0.3 : node.tone === 'idle' || node.tone === 'starting' ? 0.9 : 1
  const half = (node.size * fit.scale) / 2
  // The hub is a faceted crystal, every satellite a slab: the centre of the ring
  // should not be "another cube, slightly bigger". The radius is half * 1.2 so
  // the crystal carries the same visual mass as a cube of half-extent `half`
  // (a cube's corners reach half * 1.73, an icosahedron's hull is tighter) while
  // still sitting INSIDE the box footprint its SVG hit-target was sized to —
  // this canvas only has to look right under targets it must not move.
  // Shared, never disposed here (see sharedGeometry): the class outlives the mesh.
  const { body: geometry, outline } = sharedGeometry(node.hub ? 'hub' : node.shape ?? 'cube', half)
  // Same tilt/yaw the CSS-3D body wore: one fixed stage rotateX, plus a per-node
  // yaw so satellites don't all face the camera identically (orchestration-depth.ts).
  const yawDeg = node.hub ? 45 : node.shape === 'tablet' ? 12 : 40 + (node.x / viewBoxW) * 10
  // A puck is a cylinder whose axis is already "up": no yaw, or its hexagon would
  // read as a tumbling die; a tablet turns a little so its thin edge shows.
  const rotation: [number, number, number] = [(-ORCH_STAGE_TILT_DEG * Math.PI) / 180, node.shape === 'puck' ? 0 : (yawDeg * Math.PI) / 180, 0]

  useFrame((state, delta) => {
    const nowMs = state.clock.elapsedTime * 1000
    const { sinceToneMs, sinceAttentionMs } = getClocks(node.id, node.tone, node.attention, nowMs)
    const motion = orchCubeMotion({
      tone: node.tone,
      hub: node.hub,
      synthetic: node.synthetic,
      selected: node.selected,
      attention: node.attention,
      sinceToneMs,
      sinceAttentionMs,
      clockMs: nowMs,
      reducedMotion
    })
    lift.current = reducedMotion ? motion.lift : THREE.MathUtils.damp(lift.current, motion.lift, 12, delta)
    const plateTarget = node.lift ?? 0
    plateLift.current = reducedMotion ? plateTarget : THREE.MathUtils.damp(plateLift.current, plateTarget, 12, delta)
    const screenX = node.x * fit.scale + fit.offsetX
    // The target sits at the LIFTED row; the mesh trails it by what it has not yet risen.
    const screenY = (node.y + (plateTarget - plateLift.current)) * fit.scale + fit.offsetY
    mesh.current.position.set(
      screenX - size.width / 2,
      -(screenY - size.height / 2) - motion.yOffset,
      node.depth * 24 + lift.current
    )
    // Orthographic projection makes a pure Z move toward the camera invisible
    // (no perspective enlargement) — a slight scale rides with the lift so
    // "selected" still reads as "lifted", not just "less dim".
    mesh.current.scale.setScalar(motion.scale * (1 + lift.current / 220))
    const dim = (node.dimmed || node.lensedOut) && !node.selected
    const hsl = { h: 0, s: 0, l: 0 }
    base.getHSL(hsl)
    // The slab keeps the role's hue at a fraction of its saturation and near the
    // ground's lightness, so the faces separate under the key light without the
    // body ever competing with its own lit edges.
    body.current.setHSL(hsl.h, hsl.s * 0.5, dim ? 0.2 : 0.3)
    // Capped DARKER than it looks like it should be (0.5, not 0.7): the bloom
    // multiplies this, and a light emissive drives all three channels past 1.0
    // at once — every clipped channel is white, so a bright role colour blooms
    // as a colourless blob and role stops being distinguishable from tone. Kept
    // dark and saturated, the dominant channel clips alone and the halo carries
    // the hue. Raising this is how the ring goes monochrome with no error.
    // Saturation is PUSHED UP, not just preserved. A role colour that is already
    // pale (the steel/cyan the terminals wear) has little hue to lose before the
    // bloom clips it to white, while a saturated one (the watcher's violet, the
    // amber of needs-you) survives untouched — so the ring read as "amber holds
    // its colour, everything else goes white". Boosting saturation before the
    // multiply gives the pale roles something left to carry at full brightness.
    const sat = Math.min(1, hsl.s * (node.tone === 'exited' ? 0.3 : 1.45))
    glow.current.setHSL(hsl.h, sat, Math.min(0.44, hsl.l))
    material.current.color.copy(body.current)
    material.current.emissive.copy(glow.current)
    const hubPulse = node.hub && !node.synthetic && node.tone === TONE_WORKING && !reducedMotion ? (Math.sin(nowMs / 700) + 1) * 0.12 : 0
    material.current.emissiveIntensity = (restEmissive + hubPulse + motion.emissiveBoost * 0.5 + motion.rimBoost * 0.2) * (dim ? 0.6 : 1)
    edge.current.color.copy(glow.current)
    // A dimmed sibling keeps its outline: the first cut took the edges to 40% on a
    // near-black body and the ring became eight blobs — dim is a step back, not off.
    edge.current.opacity = edgeOpacity * (dim ? 0.7 : 1)
    // Demand-mode loop: ask for the next frame only while THIS cube still has
    // motion to show. An idle room renders nothing at all between React updates —
    // `frameloop="always"` repainted WebGL at 60fps for a ring of idle agents.
    // The finite windows mirror orchestration-cube-motion.ts (3 × 1200ms pulse,
    // 520ms settle); past them the cube is at rest and asks for nothing.
    if (!reducedMotion && (
      Math.abs(lift.current - motion.lift) > 0.05 ||
      Math.abs(plateLift.current - plateTarget) > 0.05 ||
      (node.tone === TONE_WORKING && !node.synthetic) ||
      (node.tone === 'starting' && sinceToneMs < 600) ||
      (node.attention && sinceAttentionMs < 3700)
    )) state.invalidate()
  })

  return (
    <mesh ref={mesh} rotation={rotation} castShadow={!node.synthetic} receiveShadow>
      <primitive object={geometry} attach="geometry" />
      {/* Opaque and depth-writing: the hub must OCCLUDE the back row, which a
          depthWrite={false} glass body only appeared to do by painter's luck. */}
      <meshPhysicalMaterial ref={material} roughness={0.38} metalness={0.35} clearcoat={0.6} clearcoatRoughness={0.25} />
      <lineSegments geometry={outline}>
        <lineBasicMaterial ref={edge} color={base} transparent />
      </lineSegments>
    </mesh>
  )
}

/**
 * M291/M294. One platform: the isometric diamond in three stacked tiers. The
 * body is the deck surface token (blue-black in the dark theme, the light
 * theme's own surface in the light one); each tier wears an emissive RIM in
 * the accent (cyan) or, for the workspace plate, violet — family, not state.
 * The rim is a line whose colour is pushed past the composer's luminance
 * threshold (`toneMapped={false}`, full opacity on the deck), so it blooms the
 * way the reference's edges glow, while the tiers' faces stay UNDER it: the
 * plate is the floor the stations glow above, not a light of its own. A plate
 * waiting on a person carries an amber rim on its deck IN ADDITION to the word
 * and the beacon on its SVG label, so colour is never the only carrier.
 *
 * The 45° turn is an inner group's rotation about z — the square's own plane —
 * INSIDE the stage tilt (the outer group's rotateX), which is the order that
 * projects the plate to the diamond the SVG hit polygon is cut to; turning the
 * outer group instead would swing the plate out of the stage's plane.
 */
function PlatformMesh({ spec, fit, size, reducedMotion, quality }: { spec: OrchPlatformSpec; fit: OrchFit; size: { width: number; height: number }; reducedMotion: boolean; quality: 'full' | 'lean' | 'flat' }): JSX.Element {
  const group = useRef<THREE.Group>(null!)
  const lift = useRef(spec.lift)
  const invalidate = useThree((s) => s.invalidate)
  const [surface, setSurface] = useState(() => readCssColor('--deck-surface'))
  const [edgeTone, setEdgeTone] = useState(() => readCssColor(spec.synthetic ? '--deck-violet' : '--iris'))
  const [amber, setAmber] = useState(() => readCssColor('--amber'))
  useEffect(() => {
    const sync = (): void => { setSurface(readCssColor('--deck-surface')); setEdgeTone(readCssColor(spec.synthetic ? '--deck-violet' : '--iris')); setAmber(readCssColor('--amber')) }
    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-contrast', 'style'] })
    sync()
    return () => observer.disconnect()
  }, [spec.synthetic])
  useEffect(() => invalidate(), [surface, edgeTone, amber, invalidate])
  const side = spec.side * fit.scale
  const t = Math.max(3, spec.thickness * fit.scale)
  const inset = spec.inset * fit.scale
  // Three tiers: the base (full thickness), a middle tier and the deck (half
  // each), every one inset from the one below. Same for every platform.
  const tiers = useMemo(() => [
    { side, thick: t, z: 0 },
    { side: Math.max(12, side - inset * 2), thick: t * 0.5, z: t * 0.5 + t * 0.25 },
    { side: Math.max(12, side - inset * 4), thick: t * 0.5, z: t * 0.5 + t * 0.5 + t * 0.25 }
  ].map((tier) => { const body = new THREE.BoxGeometry(tier.side, tier.side, tier.thick); return { ...tier, body, edges: new THREE.EdgesGeometry(body) } }), [side, t, inset])
  useEffect(() => () => { for (const tier of tiers) { tier.body.dispose(); tier.edges.dispose() } }, [tiers])
  const screenX = spec.x * fit.scale + fit.offsetX
  const screenY = spec.y * fit.scale + fit.offsetY
  const rotation: [number, number, number] = [(-ORCH_STAGE_TILT_DEG * Math.PI) / 180, 0, 0]
  const dim = spec.dimmed && !spec.selected
  // The FINITE selection lift (ORCH_SELECT_LIFT, in the spec), along world y —
  // up on screen, which an orthographic camera can show; damped like the
  // cubes', reduced motion snaps. The SVG target is already at the lifted row.
  useFrame((_state, delta) => {
    lift.current = reducedMotion ? spec.lift : THREE.MathUtils.damp(lift.current, spec.lift, 12, delta)
    // Under every object on it: the cubes sit at depth * 24 (+ lift); the plate
    // sits a layer below so a standing cube is never cut by its own floor.
    group.current.position.set(screenX - size.width / 2, -(screenY - size.height / 2) + lift.current * fit.scale, spec.depth * 24 - 40)
    if (!reducedMotion && Math.abs(lift.current - spec.lift) > 0.05) _state.invalidate()
  })
  const rimOpacity = (spec.selected ? 1 : spec.synthetic ? 0.6 : 0.85) * (dim ? 0.5 : 1)
  return (
    <group ref={group} rotation={rotation}>
      <group rotation={[0, 0, Math.PI / 4]}>
        {tiers.map((tier, i) => {
          const deck = i === tiers.length - 1
          const rim = deck && spec.needsYou ? amber : edgeTone
          return (
            <group key={i} position={[0, 0, tier.z]}>
              <mesh geometry={tier.body} receiveShadow>
                {/* The faces stay under the bloom threshold and keep the FAMILY tone; the
                    deck of a lit plate glows a little more. Amber is the RIM only — an amber
                    face read as a solid orange slab, the state shouting over the shape. */}
                <meshPhysicalMaterial color={surface} roughness={0.5} metalness={0.3} clearcoat={0.5} clearcoatRoughness={0.3}
                  emissive={edgeTone} emissiveIntensity={(deck ? (spec.lit || spec.needsYou ? 0.2 : 0.1) : 0.05) * (dim ? 0.5 : 1)} />
              </mesh>
              <lineSegments geometry={tier.edges}>
                <lineBasicMaterial color={rim} transparent opacity={deck ? rimOpacity : rimOpacity * 0.7} toneMapped={false} />
              </lineSegments>
            </group>
          )
        })}
      </group>
      {/* The floor glow the reference's platforms sit in: an additive disc under
          the base, squashed to the diamond's screen aspect. Full quality only;
          additive over a light ground reads as a hole (GroundPool's header). */}
      {quality === 'full' && <PlatformPool spec={spec} side={side} tone={edgeTone} dim={dim} />}
    </group>
  )
}

function PlatformPool({ spec, side, tone, dim }: { spec: OrchPlatformSpec; side: number; tone: THREE.Color; dim: boolean }): JSX.Element | null {
  const texture = useGlowTextureOnce()
  const dark = useDarkTheme()
  if (!dark) return null
  const r = side / Math.SQRT2
  return (
    // In the tilted group's local plane, so the tilt squashes it like the plate; a hair below the base.
    <mesh position={[0, 0, -2]} scale={[r * 2.6, r * 2.6, 1]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={texture} color={tone} transparent opacity={(spec.lit || spec.selected ? 0.34 : 0.18) * (dim ? 0.4 : 1)} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

/**
 * The pool of light a lit node spills onto the floor.
 *
 * NOT a point light. The shadow-catching ground below is a `shadowMaterial`,
 * which renders received shadows and nothing else — it is not lit, so a real
 * light would pool on nothing, and giving it a lit material instead would make
 * this canvas OPAQUE and hide the SVG ground rings and edges it is layered
 * over (see this file's header: the canvas is transparent glass between two
 * SVG layers). An additively-blended emissive disc ADDS light over that glass
 * without occluding anything beneath it, and being emissive it blooms through
 * the composer for free — one shared texture, no per-node shader recompile.
 */
function GroundPool({ node, fit, size, texture }: {
  node: OrchCubeSpec
  fit: OrchFit
  size: { width: number; height: number }
  texture: THREE.Texture
}): JSX.Element | null {
  const material = useRef<THREE.MeshBasicMaterial>(null!)
  const tint = useRef(new THREE.Color())
  const colorToken = node.synthetic ? '--deck-steel' : node.roleColor
  const [base, setBase] = useState(() => readCssColor(colorToken))
  useEffect(() => {
    const sync = (): void => setBase(readCssColor(colorToken))
    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-contrast', 'style'] })
    sync()
    return () => observer.disconnect()
  }, [colorToken])

  // Only a node that clears the bloom threshold spills. An idle ring should
  // leave the floor dark, which is what makes a working node read across the
  // room — a pool under everything is just a brighter floor.
  const strength = node.synthetic || node.tone === 'exited' || node.tone === 'idle' || node.tone === 'starting'
    ? 0
    : node.tone === TONE_WORKING ? 0.85 : node.tone === 'needs-you' ? 0.8 : node.hub ? 0.5 : 0
  const dim = (node.dimmed || node.lensedOut) && !node.selected

  useFrame(() => {
    if (!material.current) return
    const hsl = { h: 0, s: 0, l: 0 }
    base.getHSL(hsl)
    tint.current.setHSL(hsl.h, hsl.s, Math.min(0.62, hsl.l))
    material.current.color.copy(tint.current)
    material.current.opacity = strength * (dim ? 0.4 : 1)
  })

  if (strength === 0) return null
  const half = (node.size * fit.scale) / 2
  const screenX = node.x * fit.scale + fit.offsetX
  const screenY = node.y * fit.scale + fit.offsetY
  // Wider than tall: the stage is a fixed-tilt fake isometric, so a pool reads
  // as lying ON the floor only if it is squashed the way the ground ellipse is.
  return (
    <mesh
      position={[screenX - size.width / 2, -(screenY - size.height / 2) - half * 0.9, node.depth * 24 - 2]}
      scale={[half * 4.2, half * 2.1, 1]}
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        ref={material}
        map={texture}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  )
}

/** One radial-falloff texture shared by every pool — built once, not per node. */
/**
 * Dark theme only. The pools are ADDITIVELY blended, which is what lets them add
 * light over transparent glass without occluding the SVG ground beneath — but
 * additive over a LIGHT ground can only make it lighter, so a soft white ellipse
 * appears under a dark solid cube and reads as a HOLE cut in the floor, not as
 * spill. There is no additive spelling of "darker"; a light-theme stage needs a
 * shadow, which the scene already has in its shadow-catching plane. So in light
 * theme the pools simply stand down and the shadow does the work.
 */
function useDarkTheme(): boolean {
  const [dark, setDark] = useState(() => document.documentElement.getAttribute('data-theme') !== 'light')
  useEffect(() => {
    const sync = (): void => setDark(document.documentElement.getAttribute('data-theme') !== 'light')
    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    sync()
    return () => observer.disconnect()
  }, [])
  return dark
}

function useGlowTexture(): THREE.Texture {
  const texture = useGlowTextureOnce()
  useEffect(() => () => texture.dispose(), [texture])
  return texture
}

function useGlowTextureOnce(): THREE.Texture {
  return useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    const ctx = canvas.getContext('2d')!
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(0.35, 'rgba(255,255,255,0.45)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 128, 128)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
  }, [])
}

function CubeScene({ nodes, platforms, viewBox, reducedMotion, quality }: { nodes: readonly OrchCubeSpec[]; platforms: readonly OrchPlatformSpec[]; viewBox: { w: number; h: number }; reducedMotion: boolean; quality: 'full' | 'lean' | 'flat' }): JSX.Element {
  const size = useThree((s) => s.size)
  const gl = useThree((s) => s.gl)
  const fit = useMemo(() => orchFitViewbox(viewBox, size), [viewBox, size.width, size.height])
  const getClocks = useCubeClocks()
  const glowTexture = useGlowTexture()
  const darkTheme = useDarkTheme()
  useEffect(() => {
    // fiber 9.4's `shadows` shorthand still resolves to the removed
    // PCFSoftShadowMap on this three.js version, spamming a deprecation
    // warning every shadow-map render; set the type directly instead.
    gl.shadowMap.type = THREE.PCFShadowMap
    gl.shadowMap.needsUpdate = true
  }, [gl])
  return (
    <>
      <FitCamera width={size.width} height={size.height} />
      {/* Mounted INSIDE the Canvas so it shares the demand loop; it takes the
          render from fiber at priority 1 and owns tone mapping while mounted. */}
      {/* M292. The composer is the first thing to go: a bloom pass over a
          hundred-station scene is what stalls, and without it the tiers still
          read (working is brighter than idle in the raw emissive), so the bloom
          DEGRADES rather than stalls. */}
      {quality === 'full' && <OrchestrationBloom />}
      <ambientLight intensity={0.8} />
      <directionalLight position={[160, 260, 340]} intensity={1.3} castShadow={!reducedMotion && quality !== 'flat'}>
        <orthographicCamera attach="shadow-camera" args={[-size.width, size.width, size.height, -size.height, 1, 1200]} />
      </directionalLight>
      <mesh position={[0, 0, -80]} receiveShadow>
        <planeGeometry args={[size.width * 1.4, size.height * 1.4]} />
        <shadowMaterial transparent opacity={0.28} />
      </mesh>
      {platforms.map((p) => (
        <PlatformMesh key={`platform-${p.id}`} spec={p} fit={fit} size={size} reducedMotion={reducedMotion} quality={quality} />
      ))}
      {darkTheme && quality === 'full' && nodes.map((n) => (
        <GroundPool key={`pool-${n.id}`} node={n} fit={fit} size={size} texture={glowTexture} />
      ))}
      {nodes.map((n) => (
        <CubeMesh key={n.id} node={n} fit={fit} size={size} viewBoxW={viewBox.w} reducedMotion={reducedMotion} getClocks={getClocks} />
      ))}
    </>
  )
}

export function OrchestrationCubes({ nodes, platforms = [], viewBox, quality = 'full' }: OrchestrationCubesProps): JSX.Element {
  const reducedMotion = reducedMotionNow()
  return (
    <div className="orch__cube-canvas" aria-hidden="true">
      <Canvas
        orthographic
        // Explicit type: fiber 9.4's boolean/default shorthand asks for
        // PCFSoftShadowMap, which this three.js version removed — every
        // shadow re-resolve logged a deprecation warning without this.
        shadows={reducedMotion || quality === 'flat' ? false : 'percentage'}
        dpr={[1, 2]}
        // Always demand: a cube with motion left invalidates from its own useFrame.
        frameloop="demand"
        gl={{ antialias: true, alpha: true }}
      >
        <CubeScene nodes={nodes} platforms={platforms} viewBox={viewBox} reducedMotion={reducedMotion} quality={quality} />
      </Canvas>
    </div>
  )
}
